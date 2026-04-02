import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { InterceptorConfig, InterceptorRequestConfig } from '../types/base';
import { IPluginContext } from '../types/base';
import { logger } from '../utils/logger';
import { trace } from '../utils/trace';

/**
 * 拦截器管理器
 * 负责管理 Axios 拦截器和插件的集成
 */
export class InterceptorManager {
    private instance: AxiosInstance;
    private interceptors: InterceptorConfig | undefined;
    private createPluginContext: (config: InternalAxiosRequestConfig) => IPluginContext;
    private executeBeforeRequest: (context: IPluginContext) => Promise<void>;
    private executeAfterRequest: (context: IPluginContext, response: AxiosResponse) => Promise<void>;
    private executeOnError: (context: IPluginContext, error: unknown) => Promise<void>;
    private defaultRequestInterceptor: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
    private defaultResponseInterceptor: (response: AxiosResponse) => AxiosResponse;
    private defaultErrorInterceptor: (error: unknown) => Promise<never>;

    constructor(
        instance: AxiosInstance,
        interceptors: InterceptorConfig | undefined,
        createPluginContext: (config: InternalAxiosRequestConfig) => IPluginContext,
        executeBeforeRequest: (context: IPluginContext) => Promise<void>,
        executeAfterRequest: (context: IPluginContext, response: AxiosResponse) => Promise<void>,
        executeOnError: (context: IPluginContext, error: unknown) => Promise<void>,
        defaultRequestInterceptor: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig,
        defaultResponseInterceptor: (response: AxiosResponse) => AxiosResponse,
        defaultErrorInterceptor: (error: unknown) => Promise<never>
    ) {
        this.instance = instance;
        this.interceptors = interceptors;
        this.createPluginContext = createPluginContext;
        this.executeBeforeRequest = executeBeforeRequest;
        this.executeAfterRequest = executeAfterRequest;
        this.executeOnError = executeOnError;
        this.defaultRequestInterceptor = defaultRequestInterceptor;
        this.defaultResponseInterceptor = defaultResponseInterceptor;
        this.defaultErrorInterceptor = defaultErrorInterceptor;

        this.setupInterceptors();
    }

    /**
     * 设置拦截器
     */
    private setupInterceptors(): void {
        // 请求拦截器
        this.instance.interceptors.request.use(
            this.handleRequest.bind(this),
            this.handleRequestError.bind(this)
        );

        // 响应拦截器
        this.instance.interceptors.response.use(
            this.handleResponse.bind(this),
            this.handleResponseError.bind(this)
        );
    }

    /**
     * 处理请求
     */
    private async handleRequest(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
        const traceInfo = trace.getCurrentTrace();

        // 注入 Trace 信息到请求头
        const headers = config.headers as Record<string, string>;
        const headersWithTrace = trace.injectToHeaders(headers || {});
        config.headers = headersWithTrace as typeof config.headers;

        // 处理代理 URL
        if ((config as InterceptorRequestConfig).proxy && config.baseURL) {
            (config as InterceptorRequestConfig).proxyURL = config.baseURL;
            config.baseURL = '';
        }

        // 执行插件 beforeRequest 钩子
        const pluginContext = this.createPluginContext(config);
        await this.executeBeforeRequest(pluginContext);

        // 缓存命中时使用 adapter
        if ((config as InterceptorRequestConfig).cacheMetadata?.cacheHit && (config as InterceptorRequestConfig).cacheMetadata?.response) {
            config.adapter = () => {
                return Promise.resolve({
                    data: (config as InterceptorRequestConfig).cacheMetadata?.response,
                    status: 200,
                    statusText: 'OK (Cached)',
                    headers: {},
                    config: config
                });
            };
        }

        // 记录请求开始
        if (traceInfo) {
            logger.requestStart({
                url: config.url ?? '',
                method: config.method?.toUpperCase() ?? 'GET',
                traceId: traceInfo.traceId,
                spanId: traceInfo.spanId
            });
        }

        // 执行用户自定义请求拦截器
        if (this.interceptors?.request) {
            try {
                const result = this.interceptors.request(config);
                return result instanceof Promise ? await result : result;
            } catch (error) {
                logger.error('User request interceptor error', { error: error instanceof Error ? error : String(error) });
                return this.defaultRequestInterceptor(config);
            }
        }

        return this.defaultRequestInterceptor(config);
    }

    /**
     * 处理请求错误
     */
    private async handleRequestError(error: unknown): Promise<never> {
        const config = (error as AxiosError).config;
        if (config) {
            const pluginContext = this.createPluginContext(config);
            await this.executeOnError(pluginContext, error);
        }

        if (this.interceptors?.error) {
            try {
                await this.interceptors.error(error as AxiosError);
            } catch (userError) {
                return this.defaultErrorInterceptor(userError);
            }
        }

        return this.defaultErrorInterceptor(error);
    }

    /**
     * 处理响应
     */
    private async handleResponse(response: AxiosResponse): Promise<AxiosResponse> {
        const traceInfo = trace.getCurrentTrace();

        // 记录请求成功
        if (traceInfo && response.config) {
            const duration = Date.now() - traceInfo.startTime;
            logger.requestSuccess(
                {
                    url: response.config.url ?? '',
                    method: response.config.method?.toUpperCase() ?? 'GET',
                    traceId: traceInfo.traceId
                },
                { status: response.status },
                duration
            );
        }

        // 执行插件 afterRequest 钩子
        const pluginContext = this.createPluginContext(response.config);
        await this.executeAfterRequest(pluginContext, response);

        // 执行用户自定义响应拦截器
        if (this.interceptors?.response) {
            try {
                const result = this.interceptors.response(response);
                return result instanceof Promise ? await result : result;
            } catch {
                return this.defaultResponseInterceptor(response);
            }
        }

        return this.defaultResponseInterceptor(response);
    }

    /**
     * 处理响应错误
     */
    private async handleResponseError(error: unknown): Promise<never> {
        const axiosError = error as AxiosError;
        const config = axiosError.config;
        const traceInfo = trace.getCurrentTrace();

        // 记录请求失败
        if (traceInfo && config?.url) {
            const duration = Date.now() - traceInfo.startTime;
            logger.requestFailed(
                {
                    url: config.url,
                    method: config.method?.toUpperCase() ?? 'GET',
                    traceId: traceInfo.traceId
                },
                error as Error,
                duration
            );
        }

        // 执行插件 onError 钩子
        if (config) {
            const pluginContext = this.createPluginContext(config);
            await this.executeOnError(pluginContext, error);
        }

        // 执行用户自定义错误拦截器
        if (this.interceptors?.error) {
            try {
                await this.interceptors.error(error as AxiosError);
            } catch (userError) {
                return this.defaultErrorInterceptor(userError);
            }
        }

        return this.defaultErrorInterceptor(error);
    }

    /**
     * 更新拦截器配置
     */
    public updateInterceptors(interceptors: InterceptorConfig): void {
        this.interceptors = interceptors;
    }
}
