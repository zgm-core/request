import {
    AxiosResponse,
    Method,
    InternalAxiosRequestConfig,
    RawAxiosRequestHeaders,
    AxiosRequestConfig,
    AxiosError
} from 'axios';
import { cacheMetadata } from './plugin';
import type { IdempotentConfig } from './idempotent';
// ==================== 基础响应类型 ===================

/**
 * 标准响应数据格式
 */
export interface IResponseData<T = unknown> {
    code?: number;
    message: string;
    data: T;
    success: boolean;
    status?: number;
}

/**
 * 错误接口
 */
export interface RequestError {
    code: number | string;
    status?: number;
    message?: string | null;
    type?: string;
    requestId?: string;
    originalError?: unknown;
}

// ==================== 拦截器类型 ====================

/**
 * 拦截器配置
 */
export interface InterceptorConfig {
    request?: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
    response?: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
    error?: (error: AxiosError) => unknown;
}

// ==================== 重试配置类型 ====================

/**
 * 重试功能配置
 * @description 用于配置请求失败时的重试行为
 */
/**
 * 重试功能配置
 * @description 默认启用重试功能，用户可通过配置调整行为
 */
export interface RetryConfig {
    /**
     * 是否启用重试功能
     * @default true
     */
    enabled?: boolean;

    /**
     * 最大重试次数（不含原始请求）
     * @default 3
     * @example retries: 2 → 原始请求失败后最多重试2次（共3次尝试）
     */
    retries?: number;

    /**
     * 重试延迟计算函数（毫秒）
     * @param retryCount - 当前重试次数（从1开始）
     * @returns 延迟毫秒数
     * @default axiosRetry.exponentialDelay（指数退避）
     */
    retryDelay?: (retryCount: number) => number;

    /**
     * 判断是否需要重试的条件
     * @param error - axios 请求错误对象
     * @returns true 表示需要重试，false 表示终止重试
     * @default 网络错误或幂等请求遇到5xx错误时重试
     */
    retryCondition?: (error: AxiosError) => boolean;

    /**
     * 重试时是否重置超时时间（timeout）
     * @default true
     * @example true → 每次重试都重新计算超时时间
     */
    shouldResetTimeout?: boolean;

    /**
     * 重试回调函数
     * @param retryCount - 当前重试次数
     * @param error - 错误对象
     * @param requestConfig - 请求配置
     */
    onRetry?: (retryCount: number, error: AxiosError, requestConfig: AxiosRequestConfig) => void;
}

// ==================== 功能配置类型 ====================

/**
 * 所有功能配置集合
 */
export interface FeaturesConfig {
    cache?: CacheConfig;
    retry?: RetryConfig;
}

// ==================== 请求选项类型 ====================

/**
 * 请求选项 - 用于单个请求的特殊配置
 */
export interface RequestOptions {
    // 缓存选项
    cache?: {
        enabled?: boolean;
        key?: string;
        ttl?: number;
    };

    // 重试选项 - 保持与你原有结构一致
    retryConfig?: RetryConfig;

    // 取消选项
    cancel?: {
        enabled?: boolean;
        key?: string;
    };

    // 性能监控
    enableTiming?: boolean;

    // 其他选项
    skipAuth?: boolean;
    skipTransform?: boolean;
}

// ==================== 配置类型 ====================

/**
 * 基础请求配置
 */
export interface BaseRequestConfig extends RequestOptions {
    // Axios 基础配置
    baseURL: string;
    timeout?: number;
    proxy?: boolean;
    headers?: RawAxiosRequestHeaders;
    withCredentials?: boolean;
    adapter?: AxiosRequestConfig['adapter'];
    responseType?: AxiosRequestConfig['responseType'];
    responseEncoding?: AxiosRequestConfig['responseEncoding'];
    validateStatus?: AxiosRequestConfig['validateStatus'];
    paramsSerializer?: AxiosRequestConfig['paramsSerializer'];
    maxRedirects?: number;
    maxContentLength?: number;
    maxBodyLength?: number;
    transitional?: {
        silentJSONParsing?: boolean;
        forcedJSONParsing?: boolean;
        clarifyTimeoutError?: boolean;
    };

    // 自定义功能配置
    transformData?: boolean;
}
type StrictEnvironment = 'development' | 'production' | 'test' | 'preview' | 'release' | 'staging';
type StrictCancel = 'current' | 'previous';
type cancelTarget = StrictCancel | (string & {});
type Environment = StrictEnvironment | (string & {});

export interface CancelConfig {
    enabled: boolean;
    cancelTarget: cancelTarget;
}

/**
 * 定义缓存配置
 */

export interface CacheConfig {
    enabled?: boolean;
    defaultTTL?: number;
    maxSize?: number;
    storageType?: 'memory' | 'localStorage' | 'sessionStorage';
    https?: boolean;
}

// 请求拦截的扩展
export interface InterceptorRequestConfig extends InternalAxiosRequestConfig {
    cacheMetadata?: cacheMetadata;
    proxyURL?: string;
}

/**
 * 全局配置
 */
export interface GlobalConfig extends BaseRequestConfig {
    // 让用户传入环境  添加调试日志  一般日志只有在开发环境能打印  生产环境不打印
    env: Environment;
    // 拦截器配置
    interceptors?: InterceptorConfig;

    // 默认功能开关
    defaultTransformData?: boolean;

    // 全局配置决定是否服用请求取消
    requestCancel?: CancelConfig | undefined;

    // 幂等性配置
    idempotent?: IdempotentConfig;

    // 性能配置
    enablePerformanceMonitor?: boolean;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * 完整的请求配置
 */
export type FullRequestConfig = BaseRequestConfig;

// ==================== 方法类型 ====================

/**
 * 请求方法类型
 */
export type HttpMethod = Method;

/**
 * 请求数据格式
 */
export type RequestData = Record<string, unknown> | FormData | URLSearchParams | Blob | ArrayBuffer;

/**
 * 抽象请求方法接口
 */
export interface IRequestMethods {
    request<T = IResponseData>(
        method: HttpMethod,
        url: string,
        data?: RequestData,
        config?: BaseRequestConfig
    ): Promise<T>;

    post<T = IResponseData>(url: string, params: RequestData, config?: BaseRequestConfig): Promise<T>;

    get<T = IResponseData>(url: string, params?: RequestData, config?: BaseRequestConfig): Promise<T>;

    put<T = IResponseData>(url: string, params?: RequestData, config?: BaseRequestConfig): Promise<T>;

    delete<T = IResponseData>(url: string, params?: RequestData, config?: BaseRequestConfig): Promise<T>;

    patch<T = IResponseData>(url: string, params?: RequestData, config?: BaseRequestConfig): Promise<T>;
}

// ==================== 工具类型 ====================

/**
 * 深度部分类型
 */
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * 普通对象类型
 */
export type PlainObject = GlobalConfig;

// 导出所有原始类型
export type { AxiosResponse, AxiosError, InternalAxiosRequestConfig, RawAxiosRequestHeaders };
