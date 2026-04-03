import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import qs from 'qs';
import {
    IResponseData,
    GlobalConfig,
    HttpMethod,
    IPluginContext,
    InterceptorRequestConfig,
    WebSocketConfig
} from '../types/base';
import { configManager } from './config-manager';
import { handleError } from './error-handler';
import { safeLog } from '../utils/logger';
import { PluginManager } from './plugin-manager';
import { RetryPlugin, CancelPlugin, CachePlugin, IdempotentPlugin } from '../plugins';
import { validateCoreConfig, isBrowser } from '../utils';
import { EnterpriseWebSocket } from './socket-request';
import { EnterpriseConcurrentController } from './task-limiter';


export abstract class RequestMethods {
    /**
     * 通用请求方法
     * @template T 响应数据类型
     * @param method HTTP 方法
     * @param url 请求 URL
     * @param data 请求数据
     * @param config 请求配置
     * @returns 响应数据 Promise
     */
    public abstract request<T = IResponseData>(
        method: HttpMethod,
        url: string,
        data?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T>;
    /**
     * POST 请求
     * @template T 响应数据类型
     * @param url 请求 URL
     * @param params 请求参数
     * @param config 请求配置
     * @returns 响应数据 Promise
     */
    public abstract post<T = IResponseData>(
        url: string,
        params: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T>;
    /**
     * GET 请求
     * @template T 响应数据类型
     * @param url 请求 URL
     * @param params 查询参数
     * @param config 请求配置
     * @returns 响应数据 Promise
     */
    public abstract get<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T>;
    /**
     * PUT 请求
     * @template T 响应数据类型
     * @param url 请求 URL
     * @param params 请求参数
     * @param config 请求配置
     * @returns 响应数据 Promise
     */
    public abstract put<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T>;
    /**
     * DELETE 请求
     * @template T 响应数据类型
     * @param url 请求 URL
     * @param params 请求参数
     * @param config 请求配置
     * @returns 响应数据 Promise
     */
    public abstract delete<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T>;
    /**
     * PATCH 请求
     * @template T 响应数据类型
     * @param url 请求 URL
     * @param params 请求参数
     * @param config 请求配置
     * @returns 响应数据 Promise
     */
    public abstract patch<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T>;
}

/**
 * 增强的基础请求类
 * @description 集成插件系统、生命周期管理、性能监控等企业级特性
 * @extends RequestMethods
 */
export class BaseRequest extends RequestMethods {
    /** Axios 实例：用于实际发送 HTTP 请求 */
    protected instance: AxiosInstance;
    /** 请求映射表：管理可取消的请求 */
    protected requestMap: Map<string, AbortController>;
    /** 全局配置：SDK 的配置信息 */
    protected globalConfig: GlobalConfig;

    /** 插件管理器：管理所有注册的插件 */
    protected pluginManager: PluginManager;

    private controller: EnterpriseConcurrentController | undefined;

    /**
     * 构造函数
     * @param config 可选全局配置，用于覆盖默认配置
     */
    constructor() {
        super();

        this.globalConfig = configManager.getGlobalConfig();
        this.requestMap = new Map();
        this.pluginManager = new PluginManager();

        // 创建 Axios 实例
        this.instance = this.createAxiosInstance();

        // 注册内置插件
        this.registerBuiltinPlugins();

        // 初始化插件 - 传入 axios 实例和配置
        this.pluginManager.initPlugins(this.instance, this.globalConfig);

        // 监听配置变更，自动更新插件和实例
        this.setupConfigListener();

        // 设置拦截器
        this.setupInterceptors();
    }

    /**
     * 设置配置变更监听器
     */
    private setupConfigListener(): void {
        configManager.onChange((newConfig, oldConfig) => {
            // 更新全局配置
            this.globalConfig = newConfig;

            // 检查关键配置是否变化，需要重新初始化
            const shouldReinitPlugins = this.shouldReinitPlugins(oldConfig, newConfig);

            if (shouldReinitPlugins) {
                safeLog(this.globalConfig.env, '🔄 配置变更，重新初始化插件');
                this.pluginManager.initPlugins(this.instance, newConfig);
            }

            // 重新创建 Axios 实例（如果 baseURL、timeout 等基础配置变化）
            if (this.shouldRecreateInstance(oldConfig, newConfig)) {
                safeLog(this.globalConfig.env, '🔄 基础配置变更，重新创建 Axios 实例');
                this.instance = this.createAxiosInstance();
                this.setupInterceptors();
            }
        });
    }

    /**
     * 判断是否需要重新初始化插件
     */
    private shouldReinitPlugins(oldConfig: GlobalConfig, newConfig: GlobalConfig): boolean {
        const checkField = <K extends keyof GlobalConfig>(field: K): boolean => {
            return JSON.stringify(oldConfig[field]) !== JSON.stringify(newConfig[field]);
        };

        return (
            checkField('retryConfig') ||
            checkField('requestCancel') ||
            checkField('cache')
        );
    }

    /**
     * 判断是否需要重新创建 Axios 实例
     */
    private shouldRecreateInstance(oldConfig: GlobalConfig, newConfig: GlobalConfig): boolean {
        return (
            oldConfig.baseURL !== newConfig.baseURL ||
            oldConfig.timeout !== newConfig.timeout ||
            JSON.stringify(oldConfig.headers) !== JSON.stringify(newConfig.headers) ||
            JSON.stringify(oldConfig.interceptors) !== JSON.stringify(newConfig.interceptors)
        );
    }

    /**
     * 创建 Axios 实例
     * @returns 配置好的 Axios 实例
     */
    protected createAxiosInstance(): AxiosInstance {
        return axios.create({
            baseURL: this.globalConfig.baseURL,
            timeout: this.globalConfig.timeout ?? 0,
            headers: new AxiosHeaders(this.globalConfig.headers as Record<string, string>)
        });
    }

    /**
     * 注册内置插件
     */
    private registerBuiltinPlugins(): void {
        // 注册重试插件 - 确保默认启用重试功能
        const retryPlugin = new RetryPlugin();
        // 注册取消请求的插件
        const cancelPlugin = new CancelPlugin();
        // 注册企业级缓存插件
        const cachePlugin = new CachePlugin();
        // 注册幂等性插件
        const idempotentPlugin = new IdempotentPlugin();

        this.pluginManager.register(cancelPlugin);
        this.pluginManager.register(retryPlugin);
        this.pluginManager.register(cachePlugin);
        this.pluginManager.register(idempotentPlugin);
    }

    /**
     * 设置拦截器 - 集成插件系统
     * 拦截器是每个接口都要走的-
     * @description 配置请求和响应拦截器，支持插件系统集成
     */
    private setupInterceptors(): void {
        // 注意：不要解构 interceptors，必须从 this.globalConfig 实时读取
        // 否则 configure() 更新后闭包中的值不会变化

        // 请求拦截器 - 集成插件 beforeRequest  config:里面有请求参数并且请求参数只是他的一部分
        this.instance.interceptors.request.use(
            async (config: InterceptorRequestConfig) => {
                // 执行插件 beforeRequest 钩子
                const pluginContext = this.createPluginContext(config);
                await this.pluginManager.executeBeforeRequest(pluginContext);

                // 处理幂等性插件的 skipRequest 标志
                if ((pluginContext.metadata as any).skipRequest) {
                    const cachedResult = (pluginContext.metadata as any).idempotentResult;
                    config.adapter = () => {
                        return Promise.resolve({
                            data: cachedResult,
                            status: 200,
                            statusText: 'OK (Idempotent)',
                            headers: {},
                            config: config
                        });
                    };
                    return config;
                }

                if (config.cacheMetadata?.cacheHit && config.cacheMetadata?.response) {
                    config.adapter = () => {
                        return Promise.resolve({
                            data: config.cacheMetadata?.response,
                            status: 200,
                            statusText: 'OK (Cached)',
                            headers: {},
                            config: config
                        });
                    };
                }

                // 实时从 globalConfig 读取 interceptors，支持动态配置
                const interceptors = this.globalConfig.interceptors;
                if (interceptors?.request) {
                    return interceptors.request(config);
                }

                return this.defaultRequestInterceptor(config);
            },

            async (error: any) => {
                const pluginContext = this.createPluginContext(error.config);
                await this.pluginManager.executeOnError(pluginContext, error);

                const interceptors = this.globalConfig.interceptors;
                if (!interceptors?.error) {
                    return this.defaultErrorInterceptor(error);
                }

                try {
                    const result = interceptors.error(error);
                    return result instanceof Promise
                        ? result.catch(userError => this.defaultErrorInterceptor(userError))
                        : result;
                } catch (userError) {
                    return this.defaultErrorInterceptor(userError);
                }
            }
        );

        // 响应拦截器 - 集成插件 afterRequest 和 onError
        this.instance.interceptors.response.use(
            async (response: AxiosResponse) => {
                const pluginContext = this.createPluginContext(response.config);
                await this.pluginManager.executeAfterRequest(pluginContext, response);

                const interceptors = this.globalConfig.interceptors;
                if (!interceptors?.response) {
                    return this.defaultResponseInterceptor(response);
                }

                try {
                    const result = interceptors.response(response);
                    return result instanceof Promise
                        ? result.catch(() => this.defaultResponseInterceptor(response))
                        : result;
                } catch {
                    return this.defaultResponseInterceptor(response);
                }
            },
            async (error: any) => {
                const config = error.config || {};
                const pluginContext = this.createPluginContext(config);
                await this.pluginManager.executeOnError(pluginContext, error);

                const interceptors = this.globalConfig.interceptors;
                if (!interceptors?.error) {
                    return this.defaultErrorInterceptor(error);
                }

                try {
                    const result = interceptors.error(error);
                    return result instanceof Promise
                        ? result.catch(userError => this.defaultErrorInterceptor(userError))
                        : result;
                } catch (userError) {
                    return this.defaultErrorInterceptor(userError);
                }
            }
        );
    }

    /**
     * 默认请求拦截器
     */
    private defaultRequestInterceptor(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
        // 仅在浏览器环境下读取 token
        let token: string | null = null;
        if (isBrowser()) {
            const g = globalThis as typeof globalThis & {
                localStorage: { getItem(key: string): string | null };
                sessionStorage: { getItem(key: string): string | null };
            };
            token = g.localStorage.getItem('token') || g.sessionStorage.getItem('token');
        }
        if (token && config.headers) {
            config.headers.set('Authorization', `Bearer ${token}`);
        }
        safeLog(`🚀 发送请求: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
    }

    /**
     * 默认响应拦截器
     */
    private defaultResponseInterceptor(response: AxiosResponse): AxiosResponse {
        // 直接返回数据，而不是整个 response
        return {
            ...response,
            data: response.data
        };
    }

    /**
     * 默认错误拦截器
     */
    private defaultErrorInterceptor(error: unknown): Promise<never> {
        const normalizedError = handleError(error);
        return Promise.reject(normalizedError);
    }

    /**
     * 创建插件上下文
     */
    private createPluginContext(config: InternalAxiosRequestConfig): IPluginContext {
        return {
            config,
            metadata: {}
        };
    }

    /**
     * 数据转换
     */
    private transformData(data: Record<string, unknown>, config: GlobalConfig): unknown {
        const transformData = (config.transformData as boolean) ?? true;

        if (!transformData) return data;

        const contentType = (config.headers as { [key: string]: string })?.['Content-Type'];
        if (contentType === 'application/x-www-form-urlencoded') {
            return qs.stringify(data);
        }

        return data;
    }

    /**
     * 执行请求
     */
    private async executeRequest<T = IResponseData>(
        method: HttpMethod,
        url: string,
        data: Record<string, unknown> = {},
        config: Record<string, unknown> = {}
    ): Promise<T> {
        // 获取最新的全局配置
        this.globalConfig = configManager.getGlobalConfig();

        // 如果有单个请求的配置，与全局配置合并
        let finalConfig = this.globalConfig;
        if (config && Object.keys(config).length > 0) {
            validateCoreConfig(config);
            finalConfig = configManager.deepMerge(this.globalConfig, config);
        }

        const requestConfig: Record<string, unknown> = {
            ...finalConfig,
            method,
            url
        };

        if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
            requestConfig.data = this.transformData(data, this.globalConfig);
        } else if (data && Object.keys(data).length > 0) {
            requestConfig.params = data;
        }

        try {
            const response = await this.instance.request<T>(requestConfig);
            return response.data;
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * 通用请求方法
     */
    public async request<T = IResponseData>(
        method: HttpMethod,
        url: string,
        data?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T> {
        return this.executeRequest<T>(method, url, data, config);
    }

    /**
     * POST 请求
     */
    public async post<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T> {
        return this.executeRequest<T>('post', url, params, config);
    }

    /**
     * GET 请求
     */
    public async get<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T> {
        return this.executeRequest<T>('get', url, params, config);
    }

    /**
     * PUT 请求
     */
    public async put<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T> {
        return this.executeRequest<T>('put', url, params, config);
    }

    /**
     * DELETE 请求
     */
    public async delete<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T> {
        return this.executeRequest<T>('delete', url, params, config);
    }

    /**
     * PATCH 请求
     */
    public async patch<T = IResponseData>(
        url: string,
        params?: Record<string, unknown>,
        config?: Record<string, unknown>
    ): Promise<T> {
        return this.executeRequest<T>('patch', url, params, config);
    }

    /**
     * 创建 WebSocket 连接
     * @param config WebSocket 配置
     * @returns WebSocket 实例
     */
    public socket(config: WebSocketConfig): EnterpriseWebSocket {
        return new EnterpriseWebSocket(config);
    }

    // 并发控制方法
    public async taskLimiter<T>(functions: Array<() => Promise<T>>, maxConcurrent: number = 5) {
        // 高级用法 - 使用完整控制器
        if (!this.controller) {
            this.controller = new EnterpriseConcurrentController();
        }

        return await this.controller.execute(functions, { concurrency: maxConcurrent, failFast: false });
    }
}
