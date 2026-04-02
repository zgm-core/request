/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WebSocketConfig {
    // 基础配置
    url: string;

    // 连接配置
    autoConnect?: boolean;
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
    reconnectInterval?: number;
    reconnectExponential?: boolean;
    protocols?: string | string[];
    connectionTimeout?: number;
    /** 连接频率限制最小间隔（毫秒），防止连接风暴 */
    minConnectInterval?: number;

    // 心跳配置
    heartbeat?: boolean;
    heartbeatInterval?: number;
    heartbeatMessage?: any;
    heartbeatTimeout?: number;

    // 消息配置
    messageTimeout?: number;
    maxQueueSize?: number;
    autoParseJSON?: boolean;

    // 调试配置
    debug?: boolean;

    // 内置处理器
    onMessage?: (data: any) => void;
    onConnected?: (event: Event) => void;
    onDisconnected?: (event: CloseEvent) => void;
    onError?: (error: any) => void;
    onReconnecting?: (attempt: number, delay: number) => void;
    onReconnected?: (attempt: number) => void;
    onMaxReconnectAttempts?: () => void;
    onConnectionTimeout?: () => void;
}
