import { AxiosRequestConfig, AxiosError } from 'axios';

/**
 * 重试策略接口
 */
export interface RetryStrategy {
    /**
     * 判断是否应该重试
     * @param error - 错误对象
     * @param config - 请求配置
     * @param metadata - 重试元数据
     * @returns 是否应该重试
     */
    shouldRetry(error: AxiosError, config: AxiosRequestConfig, metadata: RetryMetadata): Promise<boolean>;

    /**
     * 获取重试延迟时间
     * @param retryCount - 当前重试次数
     * @returns 延迟毫秒数
     */
    getRetryDelay(retryCount: number): number;
}

/**
 * 重试元数据
 */
export interface RetryMetadata {
    /** 重试次数 */
    retryCount: number;
    /** 最后重试时间 */
    lastRetryTime?: number;
    /** 扩展字段 */
    [key: string]: unknown;
}

/**
 * 缓存策略接口
 */
export interface CacheStrategy {
    /** 获取缓存值 */
    get(key: string): Promise<unknown>;
    /** 设置缓存值 */
    set(key: string, value: unknown, ttl?: number): Promise<void>;
    /** 删除缓存值 */
    delete(key: string): Promise<void>;
    /** 清空缓存 */
    clear(): Promise<void>;
}
