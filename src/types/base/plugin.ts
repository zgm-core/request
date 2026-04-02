import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { CacheConfig, CancelConfig, GlobalConfig, RetryConfig } from './config';
import { IResponseData } from './index';

/**
 * 请求插件接口
 * @description 插件可以介入请求的生命周期，实现各种功能
 */
export interface IRequestPlugin {
    /** 插件名称，必须唯一 */
    readonly name: string;

    /** 执行优先级，数值越小越先执行 */
    priority?: number;

    /**
     * 初始化钩子 - 用于插件访问 axios 实例
     * @param axiosInstance - Axios 实例
     * @param config - 全局配置
     */
    init?(axiosInstance: AxiosInstance, config: GlobalConfig): void;

    /**
     * 请求前生命周期钩子
     * @param context - 插件上下文
     */
    beforeRequest?(context: IPluginContext): Promise<void>;

    /**
     * 请求后生命周期钩子
     * @param context - 插件上下文
     * @param response - 响应对象
     */
    afterRequest?(context: IPluginContext, response: AxiosResponse): Promise<void>;

    /**
     * 错误处理生命周期钩子
     * @param context - 插件上下文
     * @param error - 错误对象
     */
    onError?(context: IPluginContext, error: unknown): Promise<void>;
}

// 请求接口参数配置
export interface RequestParams extends AxiosRequestConfig {
    requestCancel?: CancelConfig;
    cache?: CacheConfig;
    cacheMetadata?: cacheMetadata;
    proxyURL?: string;
    retryConfig?: RetryConfig;
    idempotent?: { enabled?: boolean; keyGenerator?: (config: AxiosRequestConfig) => string; ttl?: number; storage?: 'memory' | 'localStorage' | 'sessionStorage' };
}

/**
 * 插件上下文
 */
export interface IPluginContext {
    /** 请求配置 */
    config: RequestParams;
    /** 插件元数据，用于在插件间传递数据 */
    metadata: PluginMetadata;
    /** 响应数据（在 afterRequest 中可用） */
    response?: AxiosResponse;
}
export interface cacheMetadata {
    cacheHit?: true;
    cacheKey: string;
    response?: IResponseData;
}
/**
 * 插件元数据
 */
export interface PluginMetadata {
    /** 重试次数 */
    retryCount?: number;
    /** 最后重试时间 */
    lastRetryTime?: number;
    /** 请求开始时间 */
    startTime?: number;
    /** 请求结束时间 */
    endTime?: number;
    /** 扩展字段 */
    [key: string]: unknown;
}

/**
 * 插件管理器配置
 */
export interface PluginManagerConfig {
    /** 插件列表 */
    plugins: IRequestPlugin[];
    /** 是否自动注册内置插件 */
    autoRegisterBuiltin: boolean;
}

/**
 * 缓存项接口
 */
export interface CacheItem {
    data: string; // 缓存数据
    expiry: number; // 缓存过期时间
    timestamp: number; // 缓存时间戳
    size: number; // 缓存数据大小
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
    totalCount: number; // 缓存项数
    expiredCount: number; // 已过期缓存项数
    hitRate: string; // 缓存命中率
    totalRequests: number; // 请求数
    cacheHits: number; // 缓存命中数
    storageType: string; // 缓存存储类型
    totalSize: number; // 缓存数据大小
}
