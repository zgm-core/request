import { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import axiosRetry, { IAxiosRetryConfig } from 'axios-retry';
import { IRequestPlugin, IPluginContext, RetryConfig, GlobalConfig } from '../types/base';
import { safeLog } from '../utils';
import { RequestParams } from '../types/base';
import { isDevelopment } from '../utils/env';

/**
 * 重试插件
 * @description 默认启用重试功能，基于 axios-retry 实现
 */
export class RetryPlugin implements IRequestPlugin {
    public readonly name = 'retry-plugin';
    public priority = 100;

    // 存储最后一次应用的配置用于比较
    private lastConfig: Required<RetryConfig> | null = null;

    /**
     * 初始化或更新重试配置
     */
    public init(axiosInstance: AxiosInstance, globalConfig: GlobalConfig): void {
        const retryConfig = globalConfig.retryConfig;

        // 检查重试功能是否启用（默认启用）
        if (!retryConfig?.enabled) {
            safeLog(globalConfig.env, '🔕 用户禁用了重试功能');
            // 如果之前已启用，现在需要禁用
            if (this.lastConfig?.enabled) {
                this.disableRetry(axiosInstance);
            }
            this.lastConfig = null;
            return;
        }

        // 合并配置
        const finalConfig = this.mergeRetryConfig(retryConfig);

        // 如果配置发生变化，重新应用配置
        if (!this.lastConfig || this.hasConfigChanged(this.lastConfig, finalConfig)) {
            this.applyRetryConfig(axiosInstance, finalConfig);
            this.lastConfig = finalConfig;
        }
    }

    /**
     * 应用重试配置
     */
    private applyRetryConfig(axiosInstance: AxiosInstance, finalConfig: Required<RetryConfig>): void {
        const axiosRetryConfig: IAxiosRetryConfig = {
            retries: finalConfig.retries,
            retryDelay: finalConfig.retryDelay,
            retryCondition: finalConfig.retryCondition,
            shouldResetTimeout: finalConfig.shouldResetTimeout,
            onRetry: (retryCount: number, error: AxiosError, requestConfig: AxiosRequestConfig) => {
                this.handleRetryCallback(retryCount, error, requestConfig, finalConfig.onRetry);
            }
        };

        // 直接应用配置，axios-retry 会自动覆盖之前的配置
        axiosRetry(axiosInstance, axiosRetryConfig);

        safeLog('✅ 重试配置已应用/更新', {
            retries: finalConfig.retries,
            shouldResetTimeout: finalConfig.shouldResetTimeout,
            enabled: true
        });
    }

    /**
     * 禁用重试功能
     */
    private disableRetry(axiosInstance: AxiosInstance): void {
        // 设置重试次数为 0 来禁用重试
        axiosRetry(axiosInstance, { retries: 0 });
        safeLog('🔕 重试功能已禁用');
    }

    /**
     * 检查配置是否发生变化
     */
    private hasConfigChanged(oldConfig: Required<RetryConfig>, newConfig: Required<RetryConfig>): boolean {
        return (
            oldConfig.enabled !== newConfig.enabled ||
            oldConfig.retries !== newConfig.retries ||
            oldConfig.shouldResetTimeout !== newConfig.shouldResetTimeout ||
            oldConfig.retryDelay !== newConfig.retryDelay ||
            oldConfig.retryCondition !== newConfig.retryCondition ||
            oldConfig.onRetry !== newConfig.onRetry
        );
    }

    /**
     * 合并重试配置，提供默认值
     */
    private mergeRetryConfig(userConfig?: RetryConfig): Required<RetryConfig> {
        return {
            enabled: userConfig?.enabled ?? true,
            retries: userConfig?.retries ?? 3,
            retryDelay: userConfig?.retryDelay ?? this.exponentialDelayWithJitter,
            retryCondition: userConfig?.retryCondition ?? this.defaultRetryCondition,
            shouldResetTimeout: userConfig?.shouldResetTimeout ?? true,
            onRetry: userConfig?.onRetry ?? (() => {})
        };
    }

    /**
     * 指数退避 + 抖动延迟（避免雷群效应）
     */
    private exponentialDelayWithJitter = (retryCount: number): number => {
        const delay = axiosRetry.exponentialDelay(retryCount);
        const jitter = Math.random() * 1000; // 0-1000ms 的随机抖动
        return delay + jitter;
    };

    /**
     * 默认重试条件
     */
    private defaultRetryCondition(error: AxiosError): boolean {
        // 网络错误、超时错误
        if (error.code === 'ECONNABORTED' || error.code === 'NETWORK_ERROR') {
            return true;
        }

        // 服务器错误 (5xx) 和限流 (429)
        const status = error.response?.status;
        if (status && (status >= 500 || status === 429)) {
            return true;
        }

        return false;
    }

    /**
     * 处理重试回调
     */
    private handleRetryCallback(
        retryCount: number,
        error: AxiosError,
        requestConfig: AxiosRequestConfig,
        customOnRetry?: RetryConfig['onRetry']
    ): void {
        // 执行用户自定义重试回调
        if (customOnRetry) {
            try {
                customOnRetry(retryCount, error, requestConfig);
            } catch (callbackError) {
                const errorMessage = callbackError instanceof Error ? callbackError.message : String(callbackError);
                safeLog(isDevelopment() ? '❌ 重试回调执行失败' : '', { error: errorMessage });
            }
        }
    }

    private hasAxiosRetry(config: RequestParams): config is { 'axios-retry': { retries: number } } {
        return config && typeof config['axios-retry'] === 'object';
    }
    /**
     * 请求前生命周期 - 初始化重试相关数据
     */
    public async beforeRequest(context: IPluginContext): Promise<void> {
        if (context.metadata.retryCount === undefined) {
            context.metadata.retryCount = 0;
        }

        if (context.metadata.startTime === undefined) {
            context.metadata.startTime = Date.now();
        }

        // 如果当前接口把重试关了的  那么当前接口就不用重试了
        if (!context.config.retryConfig?.enabled) {
            if (this.hasAxiosRetry(context.config)) {
                context.config['axios-retry'].retries = 0;
            } else {
                // 如果不存在，创建它
                context.config['axios-retry'] = { retries: 0 };
            }
        }

        // 处理单个接口和全局接口不一样的时候的重试配置
        if (
            context.config.retryConfig?.enabled &&
            context.config.retryConfig?.retries !== context.config['axios-retry']?.retries
        ) {
            context.config['axios-retry'] = {
                ...context.config['axios-retry'],
                ...context.config.retryConfig
            };
        }
    }

    /**
     * 错误处理生命周期 - 记录错误信息
     */
    public async onError(context: IPluginContext, error: unknown): Promise<void> {
        context.metadata.endTime = Date.now();

        if (error instanceof AxiosError) {
            safeLog(context.config.env, '📝 请求错误记录', {
                url: context.config.url,
                method: context.config.method,
                status: error.response?.status,
                error: error.message,
                retryCount: context.metadata.retryCount
            });
        }
    }


}
