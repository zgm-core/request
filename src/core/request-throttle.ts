import { logger } from '../utils/logger';

/**
 * 节流桶项
 */
interface ThrottleBucketItem {
    /** 请求 ID */
    id: string;
    /** 时间戳 */
    timestamp: number;
}

/**
 * 节流配置
 */
export interface ThrottleConfig {
    /** 时间窗口（毫秒） */
    windowMs: number;
    /** 最大请求数 */
    maxRequests: number;
    /** 是否跳过（跳过多余的请求，而不是等待） */
    skipOverload?: boolean;
    /** 每个键独立限流（基于 URL 或自定义键） */
    keyBased?: boolean;
}

/**
 * 节流结果
 */
export interface ThrottleResult {
    /** 是否允许执行 */
    allowed: boolean;
    /** 当前窗口请求数 */
    currentCount: number;
    /** 剩余等待时间（毫秒） */
    waitTime?: number;
}

/**
 * 请求节流器（基于令牌桶算法）
 */
export class RequestThrottle {
    private buckets: Map<string, ThrottleBucketItem[]> = new Map();
    private config: Required<ThrottleConfig>;

    constructor(config: ThrottleConfig) {
        this.config = {
            windowMs: config.windowMs,
            maxRequests: config.maxRequests,
            skipOverload: config.skipOverload ?? false,
            keyBased: config.keyBased ?? false
        };
    }

    /**
     * 检查是否允许执行请求
     */
    public check(key: string): ThrottleResult {
        const bucket = this.buckets.get(key) || [];
        const now = Date.now();

        // 清理过期的请求
        const validRequests = bucket.filter(item => now - item.timestamp < this.config.windowMs);
        this.buckets.set(key, validRequests);

        // 检查是否超过限制
        if (validRequests.length >= this.config.maxRequests) {
            // 计算最早请求的剩余时间
            const oldestRequest = validRequests[0];
            if (!oldestRequest) {
                return { allowed: true, currentCount: validRequests.length };
            }
            const waitTime = oldestRequest.timestamp + this.config.windowMs - now;

            logger.debug('request.throttle.blocked', {
                key,
                currentCount: validRequests.length,
                maxRequests: this.config.maxRequests,
                waitTime
            });

            return {
                allowed: false,
                currentCount: validRequests.length,
                waitTime
            };
        }

        // 允许执行
        return {
            allowed: true,
            currentCount: validRequests.length
        };
    }

    /**
     * 记录请求
     */
    public record(key: string, id: string): void {
        const bucket = this.buckets.get(key) || [];

        bucket.push({
            id,
            timestamp: Date.now()
        });

        this.buckets.set(key, bucket);

        logger.debug('request.throttle.record', {
            key,
            id,
            currentCount: bucket.length
        });
    }

    /**
     * 执行请求（自动处理节流）
     */
    public async execute<T>(
        key: string,
        id: string,
        execute: () => Promise<T>
    ): Promise<T> {
        // 检查是否允许执行
        const checkResult = this.check(key);

        if (!checkResult.allowed) {
            if (this.config.skipOverload) {
                // 跳过多余的请求
                logger.warn('request.throttle.skip', {
                    key,
                    id,
                    currentCount: checkResult.currentCount
                });
                throw new Error('Request throttled: too many requests');
            }

            // 等待直到可以执行
            if (checkResult.waitTime && checkResult.waitTime > 0) {
                logger.debug('request.throttle.wait', {
                    key,
                    id,
                    waitTime: checkResult.waitTime
                });

                await this.delay(checkResult.waitTime);
            }
        }

        // 执行请求
        try {
            const result = await execute();

            // 记录请求
            this.record(key, id);

            return result;
        } catch (error) {
            logger.error('request.throttle.failed', {
                key,
                id,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * 重置指定键的桶
     */
    public reset(key: string): void {
        this.buckets.delete(key);
        logger.debug('request.throttle.reset', { key });
    }

    /**
     * 重置所有桶
     */
    public resetAll(): void {
        this.buckets.clear();
        logger.debug('request.throttle.resetAll');
    }

    /**
     * 获取指定键的状态
     */
    public getStatus(key: string): { currentCount: number; maxRequests: number } {
        const bucket = this.buckets.get(key) || [];
        const now = Date.now();
        const validRequests = bucket.filter(item => now - item.timestamp < this.config.windowMs);

        return {
            currentCount: validRequests.length,
            maxRequests: this.config.maxRequests
        };
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 创建 URL 基础的节流器
 */
export function createUrlThrottle(config: ThrottleConfig): RequestThrottle {
    return new RequestThrottle({
        ...config,
        keyBased: true
    });
}

/**
 * 全局限流器（默认：每秒 10 个请求）
 */
const globalThrottle = new RequestThrottle({
    windowMs: 1000,
    maxRequests: 10
});

// 导出便捷函数
export const throttle = {
    /**
     * 检查是否允许执行
     */
    check: (key: string) => globalThrottle.check(key),

    /**
     * 执行请求（自动处理节流）
     */
    execute: <T>(key: string, id: string, execute: () => Promise<T>) =>
        globalThrottle.execute(key, id, execute),

    /**
     * 重置
     */
    reset: (key: string) => globalThrottle.reset(key),

    /**
     * 重置所有
     */
    resetAll: () => globalThrottle.resetAll(),

    /**
     * 获取状态
     */
    getStatus: (key: string) => globalThrottle.getStatus(key)
};
