/* eslint-disable @typescript-eslint/no-explicit-any */
import { safeLog } from '../utils/logger';
import { isDevelopment } from '../utils/env';
import { WebSocketConfig } from '../types/base';

// 重新导出类型以保持兼容性
export type { WebSocketConfig } from '../types/base';

export interface WebSocketStatus {
    connected: boolean;
    reconnecting: boolean;
    reconnectAttempts: number;
    lastActivity: number;
    queueSize: number;
    readyState: number;
    url: string;
}

export class EnterpriseWebSocket {
    private ws: WebSocket | null = null;
    private reconnectTimer: any = null;
    private heartbeatTimer: any = null;
    private heartbeatTimeoutTimer: any = null;
    private connectionTimeoutTimer: any = null;
    private reconnectAttempts = 0;
    private isManualClose = false;
    private subscribers: Array<(data: any) => void> = [];
    private messageQueue: any[] = [];
    private isConnected = false;
    private lastActivity = 0;
    private lastConnectTime = 0;

    // 修复：使用正确的配置合并方式
    private config: Required<WebSocketConfig>;

    constructor(userConfig: WebSocketConfig) {
        // 修复：先创建默认配置，然后合并用户配置
        const defaultConfig: Omit<WebSocketConfig, 'url'> & { url: string } = {
            url: userConfig.url, // 使用用户提供的 URL
            autoConnect: true,
            autoReconnect: true,
            maxReconnectAttempts: 10,
            reconnectInterval: 3000,
            reconnectExponential: true,
            connectionTimeout: 10000,
            minConnectInterval: 2000, // 连接频率限制，默认 2 秒
            heartbeat: true,
            heartbeatInterval: 25000,
            heartbeatMessage: { type: 'ping', timestamp: Date.now() },
            heartbeatTimeout: 10000,
            autoParseJSON: true,
            maxQueueSize: 50,
            debug: isDevelopment(),
            onMessage: data => this.debugLog('📨 收到消息:', data),
            onConnected: () => this.debugLog('🟢 WebSocket 连接成功'),
            onDisconnected: event => this.debugLog(`🔴 WebSocket 连接断开: ${event.code} ${event.reason || ''}`),
            onError: error => this.debugLog('❌ WebSocket 错误:', error),
            onReconnecting: (attempt, delay) => this.debugLog(`🔄 第 ${attempt} 次重连，${delay}ms后尝试...`),
            onReconnected: attempt => this.debugLog(`✅ 第 ${attempt} 次重连成功`),
            onMaxReconnectAttempts: () => this.debugLog('💥 达到最大重连次数，停止重连'),
            onConnectionTimeout: () => this.debugLog('⏰ 连接超时')
        };

        // 合并配置，用户配置会覆盖默认配置
        this.config = {
            ...defaultConfig,
            ...userConfig
        } as Required<WebSocketConfig>;

        // 验证配置
        this.validateConfig();

        if (this.config.autoConnect) {
            // 延迟连接以避免竞争条件
            setTimeout(() => this.connect(), 100);
        }
    }

    private validateConfig(): void {
        if (!this.config.url) {
            throw new Error('WebSocket URL 不能为空');
        }

        if (!this.config.url.startsWith('ws://') && !this.config.url.startsWith('wss://')) {
            throw new Error('WebSocket URL 必须以 ws:// 或 wss:// 开头');
        }
    }

    private debugLog(...args: any[]): void {
        if (this.config.debug) {
            safeLog(`[WebSocket]`, ...args);
        }
    }

    // ========== 核心连接管理 ==========

    public connect(): void {
        // 防止重复连接
        if (this.isConnecting || this.isConnected) {
            this.debugLog('⚠️ WebSocket 正在连接或已连接，跳过重复连接');
            return;
        }

        // 连接频率限制
        const minInterval = this.config.minConnectInterval ?? 2000;
        const now = Date.now();
        if (now - this.lastConnectTime < minInterval) {
            this.debugLog('⚠️ 连接过于频繁，等待...');
            return;
        }

        this.lastConnectTime = now;
        this.cleanup();
        this.isManualClose = false;

        try {
            this.debugLog(`🔗 尝试连接到: ${this.config.url}`);

            this.ws = new WebSocket(this.config.url);
            this.setupEventListeners();

            // 连接超时保护
            this.connectionTimeoutTimer = setTimeout(() => {
                if (this.ws?.readyState === WebSocket.CONNECTING) {
                    this.debugLog('⏰ 连接超时，强制关闭');
                    this.ws.close();
                    this.config.onConnectionTimeout();
                }
            }, this.config.connectionTimeout);
        } catch (error) {
            this.handleError(error);
        }
    }

    private setupEventListeners(): void {
        if (!this.ws) return;

        this.ws.onopen = (event: Event) => {
            this.handleOpen(event);
        };

        this.ws.onmessage = (event: MessageEvent) => {
            this.handleMessage(event);
        };

        this.ws.onclose = (event: CloseEvent) => {
            this.handleClose(event);
        };

        this.ws.onerror = (event: Event) => {
            this.handleError(event);
        };
    }

    private handleOpen(event: Event): void {
        // 清除连接超时
        if (this.connectionTimeoutTimer) {
            clearTimeout(this.connectionTimeoutTimer);
            this.connectionTimeoutTimer = null;
        }

        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastActivity = Date.now();

        this.debugLog('🟢 WebSocket 连接成功');
        this.config.onConnected(event);

        this.startHeartbeat();
        this.processMessageQueue();
    }

    private handleMessage(event: MessageEvent): void {
        this.lastActivity = Date.now();

        try {
            const data = this.parseMessageData(event.data);

            // 处理心跳响应
            if (this.isHeartbeatResponse(data)) {
                this.handleHeartbeatResponse();
                return;
            }

            // 通知所有订阅者
            this.notifySubscribers(data);
            this.config.onMessage(data);
        } catch (error) {
            this.debugLog('❌ 消息处理失败:', error);
            this.config.onError(error);
        }
    }

    private handleClose(event: CloseEvent): void {
        // 清除连接超时
        if (this.connectionTimeoutTimer) {
            clearTimeout(this.connectionTimeoutTimer);
            this.connectionTimeoutTimer = null;
        }

        this.isConnected = false;
        this.debugLog(`🔴 WebSocket 连接断开: ${event.code} ${event.reason || ''}`);
        this.config.onDisconnected(event);

        this.stopHeartbeat();

        // 延迟处理重连，避免立即重连
        setTimeout(() => {
            this.handleAutoReconnect();
        }, 1000);
    }

    private handleError(error: any): void {
        this.debugLog('❌ WebSocket 错误:', error);
        this.config.onError(error);
    }

    // ========== 重连逻辑 ==========

    private handleAutoReconnect(): void {
        if (this.isManualClose || !this.config.autoReconnect) {
            return;
        }

        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.debugLog(`💥 达到最大重连次数: ${this.config.maxReconnectAttempts}`);
            this.config.onMaxReconnectAttempts();
            return;
        }

        this.reconnectAttempts++;
        const delay = this.calculateReconnectDelay();

        this.config.onReconnecting(this.reconnectAttempts, delay);

        this.reconnectTimer = setTimeout(() => {
            this.debugLog(`🔄 执行第 ${this.reconnectAttempts} 次重连`);
            this.connect();
        }, delay);
    }

    private calculateReconnectDelay(): number {
        if (!this.config.reconnectExponential) {
            return this.config.reconnectInterval;
        }

        // 指数退避算法，最大30秒
        const delay = this.config.reconnectInterval * Math.pow(1.8, this.reconnectAttempts - 1);
        return Math.min(delay, 30000);
    }

    // ========== 心跳机制 ==========

    private startHeartbeat(): void {
        if (!this.config.heartbeat) return;

        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.sendHeartbeat().catch(error => {
                    this.debugLog('💓 心跳发送失败:', error);
                });
            }
        }, this.config.heartbeatInterval);
    }

    private async sendHeartbeat(): Promise<void> {
        const heartbeatMsg = {
            ...this.config.heartbeatMessage,
            timestamp: Date.now()
        };

        await this.sendInternal(heartbeatMsg, true);

        this.heartbeatTimeoutTimer = setTimeout(() => {
            this.debugLog('💓 心跳超时，主动断开连接并重连');
            this.ws?.close(1000, 'Heartbeat timeout');
        }, this.config.heartbeatTimeout);
    }

    private handleHeartbeatResponse(): void {
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
        this.debugLog('💓 收到心跳响应');
    }

    private isHeartbeatResponse(data: any): boolean {
        return data && typeof data === 'object' && (data.type === 'pong' || data.type === 'heartbeat');
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }

    // ========== 消息处理 ==========

    private parseMessageData(rawData: any): any {
        if (!this.config.autoParseJSON) {
            return rawData;
        }

        if (typeof rawData === 'string') {
            try {
                return JSON.parse(rawData);
            } catch {
                return rawData;
            }
        }

        if (rawData instanceof Blob) {
            // 对于 Blob 数据，返回原始数据，让用户自己处理
            return rawData;
        }

        return rawData;
    }

    private notifySubscribers(data: any): void {
        // 使用副本避免在迭代时修改数组
        const subscribers = [...this.subscribers];

        subscribers.forEach((callback, index) => {
            try {
                callback(data);
            } catch (error) {
                this.debugLog(`❌ 订阅者 ${index} 处理消息出错:`, error);
            }
        });
    }

    // ========== 消息队列 ==========

    private async sendInternal(message: any, isHeartbeat: boolean = false): Promise<void> {
        if (!this.isConnected && !isHeartbeat) {
            this.queueMessage(message);
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket 未连接');
        }

        return new Promise((resolve, reject) => {
            try {
                const messageString = typeof message === 'string' ? message : JSON.stringify(message);

                this.ws!.send(messageString);

                if (!isHeartbeat) {
                    this.debugLog('📤 发送消息:', message);
                }

                resolve();
            } catch (error) {
                if (!isHeartbeat) {
                    this.debugLog('❌ 发送消息失败:', error);
                }
                reject(error);
            }
        });
    }

    private queueMessage(message: any): void {
        if (this.messageQueue.length >= this.config.maxQueueSize) {
            this.debugLog('📭 消息队列已满，丢弃最旧的消息');
            this.messageQueue.shift();
        }

        this.messageQueue.push({
            message,
            timestamp: Date.now()
        });

        if (this.messageQueue.length > this.config.maxQueueSize * 0.9) {
            this.debugLog(`⚠️ 消息队列即将满载: ${this.messageQueue.length}/${this.config.maxQueueSize}`);
        }
    }

    private processMessageQueue(): void {
        if (this.messageQueue.length === 0 || !this.isConnected) {
            return;
        }

        const sendNext = async () => {
            if (this.messageQueue.length === 0 || !this.isConnected) {
                return;
            }

            const queued = this.messageQueue[0];
            try {
                await this.sendInternal(queued.message);
                this.messageQueue.shift();
                this.debugLog(`✅ 队列消息发送成功，剩余: ${this.messageQueue.length}`);
                sendNext();
            } catch (error) {
                this.debugLog('❌ 队列消息发送失败，暂停处理:', error);
            }
        };

        sendNext();
    }

    // ========== 资源管理 ==========

    private cleanup(): void {
        this.stopHeartbeat();

        if (this.connectionTimeoutTimer) {
            clearTimeout(this.connectionTimeoutTimer);
            this.connectionTimeoutTimer = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            // 移除事件监听器
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;

            // 只有在 OPEN 或 CONNECTING 状态时才关闭
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close(1000, 'Cleanup');
            }
            this.ws = null;
        }
    }

    // ========== 公开 API ==========

    /**
     * 订阅接收服务端消息
     */
    subscribe(callback: (data: any) => void): () => void {
        this.subscribers.push(callback);

        return () => {
            const index = this.subscribers.indexOf(callback);
            if (index > -1) {
                this.subscribers.splice(index, 1);
            }
        };
    }

    /**
     * 发送消息到服务端
     */
    send(message: any): Promise<void> {
        return this.sendInternal(message);
    }

    /**
     * 关闭连接
     */
    close(): void {
        this.debugLog('👋 手动关闭 WebSocket 连接');
        this.isManualClose = true;
        this.cleanup();
        this.subscribers = [];
        this.messageQueue = [];
    }

    /**
     * 重新连接
     */
    reconnect(): void {
        this.debugLog('🔄 手动重新连接');
        this.reconnectAttempts = 0;
        this.connect();
    }

    /**
     * 清空消息队列
     */
    clearQueue(): void {
        this.messageQueue = [];
    }

    /**
     * 获取当前状态
     */
    getStatus(): WebSocketStatus {
        return {
            connected: this.isConnected,
            reconnecting: !!this.reconnectTimer,
            reconnectAttempts: this.reconnectAttempts,
            lastActivity: this.lastActivity,
            queueSize: this.messageQueue.length,
            readyState: this.ws?.readyState || WebSocket.CLOSED,
            url: this.config.url
        };
    }

    // ========== 属性访问器 ==========

    get isConnecting(): boolean {
        return this.ws?.readyState === WebSocket.CONNECTING;
    }

    get connected(): boolean {
        return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
    }

    get readyState(): number {
        return this.ws?.readyState || WebSocket.CLOSED;
    }

    get queueSize(): number {
        return this.messageQueue.length;
    }

    get attempts(): number {
        return this.reconnectAttempts;
    }
}