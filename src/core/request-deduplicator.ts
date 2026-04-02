import { logger } from '../utils/logger';
import { trace } from '../utils/trace';

/**
 * 待处理的请求
 */
interface PendingRequest {
    /** 请求 ID */
    id: string;
    /** 请求 Promise */
    promise: Promise<unknown>;
    /** 解决函数 */
    resolve: (value: unknown) => void;
    /** 拒绝函数 */
    reject: (error: unknown) => void;
    /** 创建时间 */
    createdAt: number;
}

/**
 * 去重配置
 */
export interface DedupConfig {
    /** 是否启用去重 */
    enabled?: boolean;
    /** 缓存时间（毫秒） */
    ttl?: number;
    /** 最大缓存请求数 */
    maxCacheSize?: number;
    /** 是否只对 GET 请求去重 */
    getOnly?: boolean;
}

/**
 * 请求去重器
 * @description 自动合并相同时刻的相同请求，避免重复网络调用
 */
export class RequestDeduplicator {
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private config: Required<DedupConfig>;

    constructor(config: DedupConfig = {}) {
        this.config = {
            enabled: config.enabled ?? true,
            ttl: config.ttl || 5000,
            maxCacheSize: config.maxCacheSize || 100,
            getOnly: config.getOnly ?? true
        };
    }

    /**
     * 生成请求 ID
     */
    private generateRequestId(
        method: string,
        url: string,
        data?: Record<string, unknown>
    ): string {
        const dataStr = data ? JSON.stringify(data) : '';
        return `${method}:${url}:${dataStr}`;
    }

    /**
     * 获取或创建请求
     */
    public async getOrExecute<T = unknown>(
        method: string,
        url: string,
        execute: () => Promise<T>,
        data?: Record<string, unknown>
    ): Promise<T> {
        // 如果禁用或非 GET 请求（配置限制），直接执行
        if (!this.config.enabled || (this.config.getOnly && method.toLowerCase() !== 'get')) {
            return execute();
        }

        const requestId = this.generateRequestId(method, url, data);

        // 检查是否有待处理的相同请求
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            logger.debug('request.dedup.hit', {
                requestId,
                method,
                url
            });

            // 返回已存在的 Promise
            return pending.promise as Promise<T>;
        }

        // 创建新的请求
        logger.debug('request.dedup.create', {
            requestId,
            method,
            url
        });

        // 清理过期的请求
        this.cleanup();

        // 创建新的 Promise
        let resolve: (value: unknown) => void = () => {};
        let reject: (error: unknown) => void = () => {};
        const promise = new Promise<unknown>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        const pendingRequest: PendingRequest = {
            id: requestId,
            promise,
            resolve: resolve!,
            reject: reject!,
            createdAt: Date.now()
        };

        this.pendingRequests.set(requestId, pendingRequest);

        try {
            const result = await execute();
            pendingRequest.resolve(result);
            return result;
        } catch (error) {
            pendingRequest.reject(error);
            throw error;
        } finally {
            // 延迟删除，允许短暂缓存
            setTimeout(() => {
                this.pendingRequests.delete(requestId);
            }, this.config.ttl);
        }
    }

    /**
     * 清理过期的请求
     */
    private cleanup(): void {
        if (this.pendingRequests.size <= this.config.maxCacheSize) {
            return;
        }

        const now = Date.now();
        const expiredKeys: string[] = [];

        // 查找过期的请求
        for (const [id, request] of this.pendingRequests) {
            if (now - request.createdAt > this.config.ttl) {
                expiredKeys.push(id);
            }
        }

        // 删除过期的请求
        for (const key of expiredKeys) {
            this.pendingRequests.delete(key);
        }

        // 如果还是太多，删除最旧的
        if (this.pendingRequests.size > this.config.maxCacheSize) {
            const sorted = Array.from(this.pendingRequests.entries())
                .sort((a, b) => a[1].createdAt - b[1].createdAt);

            const toRemove = sorted.slice(0, sorted.length - this.config.maxCacheSize);
            for (const [key] of toRemove) {
                this.pendingRequests.delete(key);
            }
        }
    }

    /**
     * 获取待处理请求数量
     */
    public getPendingCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * 清空所有待处理的请求
     */
    public clear(): void {
        this.pendingRequests.clear();
    }

    /**
     * 取消指定请求
     */
    public cancel(method: string, url: string, data?: Record<string, unknown>): boolean {
        const requestId = this.generateRequestId(method, url, data);
        const pending = this.pendingRequests.get(requestId);

        if (pending) {
            pending.reject(new Error('Request cancelled by deduplicator'));
            this.pendingRequests.delete(requestId);
            logger.debug('request.dedup.cancel', { requestId });
            return true;
        }

        return false;
    }

    /**
     * 更新配置
     */
    public updateConfig(config: Partial<DedupConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// 创建全局去重器实例
const globalDeduplicator = new RequestDeduplicator();

// 导出便捷函数
export const requestDedup = {
    /**
     * 获取或执行请求
     */
    getOrExecute: <T = unknown>(
        method: string,
        url: string,
        execute: () => Promise<T>,
        data?: Record<string, unknown>
    ) => globalDeduplicator.getOrExecute<T>(method, url, execute, data),

    /**
     * 取消请求
     */
    cancel: (method: string, url: string, data?: Record<string, unknown>) =>
        globalDeduplicator.cancel(method, url, data),

    /**
     * 清空
     */
    clear: () => globalDeduplicator.clear(),

    /**
     * 获取待处理数量
     */
    getPendingCount: () => globalDeduplicator.getPendingCount(),

    /**
     * 更新配置
     */
    updateConfig: (config: Partial<DedupConfig>) => globalDeduplicator.updateConfig(config)
};
