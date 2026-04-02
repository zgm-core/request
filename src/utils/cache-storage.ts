import { safeError, safeLog } from './logger';
import { CacheConfig, CacheItem, CacheStats, IResponseData, RequestParams } from '../types/base';
import { encryption } from './encryption';
import { isBrowser } from './env';

type StorageType = 'localStorage' | 'sessionStorage' | 'memory' | 'https';

/**
 * 缓存管理器
 */
export class CacheManager {
    // 存储实例
    private memoryCache = new Map<string, CacheItem>();
    private localStoragePrefix = 'Re_cache_';

    // 弄个环境  方便打印日志
    public isHttpsSupported = false;

    // 配置
    private config: Required<Omit<CacheConfig, 'enabled' | 'https'>>;
    // es
    public httpsEnabled: boolean;

    // 设置默认缓存的时间线  5分钟 执行一次清查
    private readonly defaultTTL = 1000 * 60 * 5;

    private swRegistration: ServiceWorkerRegistration | null = null;
    private swInitPromise: Promise<boolean> | null = null;

    // 统计信息
    private stats = {
        totalRequests: 0,
        cacheHits: 0,
        lastCleanupTime: Date.now(),
        expiredItemsCount: 0,
        totalSize: 0
    };

    constructor(config: CacheConfig = {}) {
        // 设置默认配置
        this.config = {
            defaultTTL: config.defaultTTL || this.defaultTTL, // 默认5分钟
            maxSize: config.maxSize || 5 * 1024 * 1024, // 默认5MB
            storageType: config.storageType || 'memory'
        };

        this.httpsEnabled = config.https || false;

        this.initStorage();
    }

    /**
     * 初始化存储
     */
    private initStorage(): void {
        if (this.config.storageType !== 'memory') {
            this.checkBrowserStorageSupport();
        }
    }

    /**
     * 检查浏览器存储支持
     */
    private checkBrowserStorageSupport(): void {
        if (typeof window === 'undefined') {
            safeLog('⚠️ 浏览器环境不可用，回退到内存存储');
            this.config.storageType = 'memory';
            return;
        }

        try {
            const testKey = `${this.localStoragePrefix}test`;
            if (this.config.storageType === 'localStorage') {
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
            } else if (this.config.storageType === 'sessionStorage') {
                sessionStorage.setItem(testKey, 'test');
                sessionStorage.removeItem(testKey);
            }
        } catch (error) {
            safeLog('⚠️ 浏览器存储不可用，回退到内存存储', {
                storageType: this.config.storageType,
                error: String(error)
            });
            this.config.storageType = 'memory';
        }
    }

    private readonly storageHandlers = {
        localStorage: (key: string, config: RequestParams) => this.getStorage(key, 'localStorage', config),
        sessionStorage: (key: string, config: RequestParams) => this.getStorage(key, 'sessionStorage', config),
        memory: (key: string, config: RequestParams) => this.getMemoryCache(key, config),
        https: (key: string, config: RequestParams) => this.getHttpsCache(key, config)
    };

    // 存储处理器
    private readonly storageProcessors = {
        localStorage: (key: string, data: CacheItem, config: RequestParams) =>
            this.setStorage(key, data, 'localStorage', config),
        sessionStorage: (key: string, data: CacheItem, config: RequestParams) =>
            this.setStorage(key, data, 'sessionStorage', config),
        memory: (key: string, data: CacheItem, config: RequestParams) => this.setMemoryCache(key, data, config),
        https: (key: string, data: CacheItem, config: RequestParams) => this.setHttpsCache(key, data, config)
    };

    /**
     * 设置缓存
     */

    public async set(
        config: RequestParams,
        local: StorageType,
        key: string,
        data: IResponseData,
        defaultTTL?: number,
        maxSize: number = this.config.maxSize,
        https?: boolean
    ) {
        const cacheTTL = defaultTTL || this.config.defaultTTL;
        // 降级缓存到内存
        if (local === 'https') {
            local = https ? 'https' : 'memory';
        }
        const dataSize = this.calculateDataSize(data);

        // 检查大小限制
        if (dataSize > maxSize) {
            safeLog('⚠️ 数据过大，跳过缓存', {
                key: this.maskKey(key),
                dataSize: this.formatSize(dataSize),
                maxSize: this.formatSize(this.config.maxSize)
            });
            return false;
        }

        // 只有内存缓存需要检查和更新内存大小
        // localStorage/sessionStorage 不占用内存空间
        if (local === 'memory') {
            // 检查总大小限制
            if (this.stats.totalSize + dataSize > maxSize) {
                // 清理掉过期的缓存
                this.evictBySize(dataSize);
            }
        }

        // 创建缓存项
        const cacheItem: CacheItem = {
            data: this.processDataForStorage(data, key), // 加密响应数据
            expiry: Date.now() + cacheTTL,
            timestamp: Date.now(),
            size: dataSize
        };

        // 根据存储类型设置缓存
        let success = false;
        // 缓存走起！！

        success = await this.storageProcessors[local](key, cacheItem, config);

        //  缓存成功
        if (success) {
            // 只有内存缓存才更新 totalSize
            if (local === 'memory') {
                this.stats.totalSize += dataSize;
            }

            safeLog(config.env, '💾 缓存设置成功', {
                key: this.maskKey(key),
                ttl: `${cacheItem.expiry / 1000}秒`,
                size: this.formatSize(dataSize),
                storageType: local,
                https: https
            });
        }

        return success;
    }

    /**
     * 获取缓存
     */
    public async get(key: string, local: StorageType = 'memory', config: RequestParams): Promise<IResponseData | null> {
        this.stats.totalRequests++;
        // 根据存储类型获取
        const handler = this.storageHandlers[local];
        if (!handler) return null;
        const cachedItem = await handler(key, config);
        if (!cachedItem) return null;
        this.stats.cacheHits++;
        return this.processDataFromStorage(cachedItem.data, key);
    }

    /**
     * 获取缓存统计信息
     */
    getStats(): CacheStats {
        return {
            totalCount: this.memoryCache.size,
            expiredCount: this.stats.expiredItemsCount,
            hitRate: this.getHitRate(),
            totalRequests: this.stats.totalRequests,
            cacheHits: this.stats.cacheHits,
            storageType: this.config.storageType,
            totalSize: this.stats.totalSize
        };
    }

    /**
     * 智能触发清理
     */
    async maybeTriggerCleanup(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCleanup = now - this.stats.lastCleanupTime;

        const shouldCleanup = timeSinceLastCleanup > this.defaultTTL || this.stats.expiredItemsCount >= 100;

        if (shouldCleanup) {
            await this.performCleanup();
        }
    }

    /**
     * 手动触发清理
     */
    async manualCleanup(): Promise<{ cleanedCount: number; remainingCount: number }> {
        const beforeCount = this.memoryCache.size;
        await this.performCleanup();
        const afterCount = this.memoryCache.size;

        return {
            cleanedCount: beforeCount - afterCount,
            remainingCount: afterCount
        };
    }

    /**
     * 重置统计信息
     */
    resetStats(): void {
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            lastCleanupTime: Date.now(),
            expiredItemsCount: 0,
            totalSize: this.stats.totalSize // 保持大小不变
        };
        safeLog('📊 统计信息已重置');
    }

    /**
     * ============ 存储具体实现 ============
     */

    /**
     * 内存缓存操作
     */
    private setMemoryCache(key: string, item: CacheItem, config: RequestParams): boolean {
        this.memoryCache.set(key, item);
        safeLog(config.env, `📝 数据已转存到内存：${this.maskKey(key)}`);
        return true;
    }

    private getMemoryCache(key: string, config: RequestParams): CacheItem | null {
        const cached = this.memoryCache.get(key);
        if (!cached) {
            safeError(config.env, `❌ 内存缓存已过期：${this.maskKey(key)}`);
            return null;
        }

        if (cached.expiry <= Date.now()) {
            this.stats.totalSize = Math.max(0, this.stats.totalSize - cached.size);
            this.memoryCache.delete(key);
            this.stats.expiredItemsCount++;
            return null;
        }
        // 注意：cacheHits 已在 get() 方法中增加，这里不再重复计数
        return cached;
    }
    /**
     * 获取存储实例（类型安全的方式）
     */
    private getStorageStr(storageType: StorageType): Storage | null {
        if (typeof window === 'undefined') {
            return null;
        }
        return storageType === 'localStorage' ? localStorage : sessionStorage;
    }

    /**
     * LocalStorage 操作
     */
    private setStorage(key: string, item: CacheItem, local: StorageType, config: RequestParams): boolean {
        try {
            const storage = this.getStorageStr(local);
            if (!storage) {
                return false;
            }
            storage[key] = JSON.stringify(item);
            // 注意：totalSize 已经在 set() 方法的第 158 行更新过了
            // 这里不需要重复增加，因为 localStorage/sessionStorage 不计入内存大小
            // 只有 memoryCache 才会占用内存空间
            return true;
        } catch (error) {
            safeLog(config.env, 'LocalStorage write failed', {
                key: this.maskKey(key),
                error: String(error)
            });
            return false;
        }
    }

    /**
     * 获取存储
     */
    private getStorage(key: string, local: StorageType, config: RequestParams): CacheItem | null {
        try {
            const storage = this.getStorageStr(local);
            if (!storage) {
                return null;
            }
            const item = storage[key];
            if (!item) {
                safeError(config.env, 'Local data fetch failed', {
                    key: this.maskKey(key)
                });
                return null;
            }

            const cacheItem: CacheItem = JSON.parse(item);
            if (cacheItem.expiry <= Date.now()) {
                storage.removeItem(key);
                this.stats.expiredItemsCount++;
                return null;
            }

            return cacheItem;
        } catch {
            return null;
        }
    }

    /**
     * 初始化 Service Worker 缓存
     */
    private async initServiceWorker(config: RequestParams): Promise<boolean> {
        // 检查是否在浏览器环境
        if (typeof navigator === 'undefined') {
            safeLog('⚠️ 非浏览器环境，跳过 Service Worker');
            return false;
        }

        if (!('serviceWorker' in navigator)) {
            safeLog('⚠️ 浏览器不支持 Service Worker');
            return false;
        }

        // 注册 Service Worker
        this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/'
        });

        safeLog(config.env, '🚀 Service Worker 注册成功');
        try {
            // 监听 Service Worker 消息
            navigator.serviceWorker.addEventListener('message', this.handleSwMessage.bind(this));

            // 等待 Service Worker 激活
            return new Promise(resolve => {
                if (this.swRegistration?.active) {
                    this.isHttpsSupported = true;
                    safeLog(config.env, '✅ HTTPS Service Worker 缓存已激活');
                    resolve(true);
                } else if (this.swRegistration?.installing) {
                    this.swRegistration.installing.addEventListener('statechange', () => {
                        if (this.swRegistration?.active) {
                            this.isHttpsSupported = true;
                            safeLog(config.env, '✅ HTTPS Service Worker 缓存已激活');
                            resolve(true);
                        }
                    });
                } else {
                    resolve(false);
                }
            });
        } catch (error) {
            safeError('❌ Service Worker 注册失败:', error);
            return false;
        }
    }

    /**
     * 处理 Service Worker 消息
     */
    private handleSwMessage(event: MessageEvent): void {
        const { type, data } = event.data;

        switch (type) {
            case 'SET':
                this.stats.cacheHits++;
                safeLog('🎯 HTTPS 缓存命中', data);
                break;
            case 'CACHE_UPDATED':
                safeLog('🔄 HTTPS 缓存已更新', data);
                break;
            case 'CACHE_CLEARED':
                safeLog('🗑️ HTTPS 缓存已清理', data);
                break;
        }
    }

    /**
     * 向 Service Worker 发送消息
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async sendMessageToSw(type: string, data: any): Promise<any> {
        // 等待 Service Worker 初始化完成
        if (this.swInitPromise) {
            await this.swInitPromise;
        }

        if (!this.swRegistration?.active) {
            throw new Error('Service Worker 未激活');
        }

        return new Promise((resolve, reject) => {
            const messageChannel = new MessageChannel();

            // 设置超时
            const timeoutId = setTimeout(() => {
                reject(new Error('Service Worker 响应超时'));
            }, 5000);

            messageChannel.port1.onmessage = event => {
                clearTimeout(timeoutId);
                if (event.data.error) {
                    reject(new Error(event.data.error));
                } else {
                    resolve(event.data);
                }
            };

            try {
                if (this.swRegistration?.active) {
                    this.swRegistration.active.postMessage({ type, data }, [messageChannel.port2]);
                }
            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * HTTPS 缓存操作（预留接口）
     */
    private async setHttpsCache(key: string, item: CacheItem, config: RequestParams): Promise<boolean> {
        if (!this.swRegistration && typeof window !== 'undefined') {
            await this.initServiceWorker(config);
        }

        if (!this.isHttpsSupported) {
            safeLog(config.env, '⚠️ Service Worker 不可用，回退到内存存储');
            return this.setMemoryCache(key, item, config);
        }

        try {
            // 等待 Service Worker 缓存设置完成
            await this.sendMessageToSw('SET', {
                key: key,
                ...item
            });

            safeLog(config.env, '🔐 HTTPS 缓存设置成功', {
                key: this.maskKey(key),
                size: this.formatSize(item.size),
                expiry: new Date(item.expiry).toISOString()
            });

            return true;
        } catch (error) {
            safeLog(config.env, '❌ HTTPS 缓存设置异常', {
                key: this.maskKey(key),
                error: error instanceof Error ? error.message : String(error)
            });
            // 异常时回退到内存缓存
            return this.setMemoryCache(key, item, config);
        }
    }

    private async getHttpsCache(key: string, config: RequestParams): Promise<CacheItem | null> {
        if (!this.swRegistration) {
            return null;
        }
        try {
            // 异步发送缓存请求，不阻塞主线程
            const result = await this.sendMessageToSw('GET', { key: key });
            return result || null;
        } catch (error) {
            safeLog(config.env, '❌ HTTPS 缓存获取异常', {
                key: this.maskKey(key),
                error: error instanceof Error ? error.message : String(error)
            });
            // 异常时回退到内存缓存
            return null;
        }
    }

    /**
     * ============ 工具方法 ============
     */

    /**
     * 加密存储数据
     */
    private processDataForStorage(data: IResponseData, key: string): string {
        return encryption.encrypt(JSON.stringify(data), key);
    }

    /**
     * 解密存储数据
     */
    private processDataFromStorage(storedData: string, key: string): IResponseData {
        return encryption.decryptWithToken(storedData, key);
    }

    /**
     * 计算数据大小
     */
    private calculateDataSize(data: IResponseData): number {
        try {
            const dataStr = JSON.stringify(data);
            // 使用 Buffer.byteLength (Node.js) 或 Blob (浏览器) 计算字节大小
            if (typeof Buffer !== 'undefined' && Buffer.byteLength) {
                return Buffer.byteLength(dataStr, 'utf8');
            }
            // 浏览器环境使用 Blob
            if (typeof Blob !== 'undefined') {
                return new Blob([dataStr]).size;
            }
            // 回退：字符串长度 * 2 (粗略估算 UTF-8)
            return dataStr.length * 2;
        } catch {
            return 0;
        }
    }

    /**
     * 格式化大小
     */
    private formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 用时间戳来判断是否过期，如果过期，则删除  可以达到批量删除的目的
    private async performCleanup(): Promise<void> {
        const now = Date.now();
        let cleanedCount = 0;
        let cleanedSize = 0;

        // 清理内存缓存
        this.memoryCache.forEach((value, key) => {
            if (value.expiry <= now) {
                cleanedSize += value.size;
                this.memoryCache.delete(key);
                cleanedCount++;
            }
        });
        // 清理浏览器存储
        if (isBrowser()) {
            cleanedCount += this.cleanupBrowserStorage(localStorage, now);
            cleanedCount += this.cleanupBrowserStorage(sessionStorage, now);
        }

        // 清理service worker缓存（等待异步操作完成）
        try {
            const swCleanedCount = await this.sendMessageToSw('CLEAR', { lastCleanupTime: this.stats.lastCleanupTime });
            cleanedCount += swCleanedCount || 0;
        } catch (error) {
            safeError('❌ Service Worker 清理失败:', error);
        }

        this.stats.lastCleanupTime = Date.now();
        this.stats.expiredItemsCount = Math.max(0, this.stats.expiredItemsCount - cleanedCount);
        this.stats.totalSize = Math.max(0, this.stats.totalSize - cleanedSize);
    }

    /**
     * 清理浏览器存储
     */
    private cleanupBrowserStorage(storage: Storage, now: number): number {
        let cleanedCount = 0;
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);

                if (key && key.startsWith(this.localStoragePrefix)) {
                    try {
                        const item = storage.getItem(key);
                        if (item) {
                            const cacheItem: CacheItem = JSON.parse(item);
                            if (cacheItem.expiry <= now) {
                                keysToRemove.push(key);
                                cleanedCount++;
                            }
                        }
                    } catch {
                        keysToRemove.push(key);
                        cleanedCount++;
                    }
                }
            }
            keysToRemove.forEach(key => storage.removeItem(key));
        } catch (error) {
            safeLog('❌ 浏览器存储清理失败', { error: String(error) });
        }
        return cleanedCount;
    }

    /**
     * 删除缓存项，直到满足空间需求
     */
    private evictBySize(requiredSize: number): void {
        const now = Date.now();
        let freedSize = 0;
        const items: Array<{ key: string; item: CacheItem }> = [];

        // 收集所有缓存项
        this.memoryCache.forEach((item, key) => {
            items.push({ key, item });
        });

        // 按过期时间排序（先删除过期的）
        items.sort((a, b) => a.item.expiry - b.item.expiry);

        // 删除直到满足空间需求
        for (const { key, item } of items) {
            if (freedSize >= requiredSize) break;

            this.memoryCache.delete(key);
            freedSize += item.size;
            this.stats.expiredItemsCount++;

            safeLog('🔍 空间不足，淘汰缓存', {
                key: this.maskKey(key),
                freedSize: this.formatSize(item.size),
                reason: item.expiry <= now ? '已过期' : 'LRU策略'
            });
        }

        this.stats.totalSize = Math.max(0, this.stats.totalSize - freedSize);
    }

    /**

* 计算命中率

*/
    private getHitRate(): string {
        if (this.stats.totalRequests === 0) return '0%';
        const rate = (this.stats.cacheHits / this.stats.totalRequests) * 100;
        return `${rate.toFixed(1)}%`;
    }

    /**
     * 掩码键值
     */
    private maskKey(key: string): string {
        if (key.length <= 20) return key;
        return `${key.substring(0, 10)}...${key.substring(key.length - 5)}`;
    }
}