import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { IRequestPlugin, IPluginContext, GlobalConfig, RequestParams } from '../types/base';
import { safeLog, safeWarn } from '../utils';

/**
 * 重复请求取消插件
 * @description 基于 AbortController 实现重复请求自动取消
 */
export class CancelPlugin implements IRequestPlugin {
    public readonly name = 'cancel-plugin';
    public priority = 90;
    private controllers = new Map<string, AbortController>();
    private globalEnabled = true;
    private env: string = 'production';

    public init(_axiosInstance: AxiosInstance, globalConfig: GlobalConfig): void {
        this.globalEnabled = globalConfig.requestCancel?.enabled ?? true;
        this.env = globalConfig.env;
        safeLog(this.env, this.globalEnabled ? '✅ 取消请求已启用' : '🔕 取消请求已关闭');
    }

    /**
     * 请求前生命周期 - 处理重复请求取消
     */

    public async beforeRequest(context: IPluginContext): Promise<void> {
        const { config, metadata } = context;

        // 判断是否需要取消: 全局启用但单个未禁用, 或单个启用
        const shouldCancel = this.globalEnabled && config.requestCancel?.enabled !== false;
        if (!shouldCancel) return;

        const requestId = this.generateRequestId(config);
        metadata.requestId = requestId;
        await this.handleDuplicateRequest(requestId, config);
    }

    /**
     * 数据响应后的处理 - 清理请求控制器
     */
    public async afterRequest(context: IPluginContext): Promise<void> {
        const requestId = this.generateRequestId(context.config);
        this.cleanupRequest(requestId);
    }

    /**
     * 错误处理生命周期 - 清理失败的请求
     */
    public async onError(context: IPluginContext, error: unknown): Promise<void> {
        if (this.isCancelError(error)) {
            context.metadata.isCancelled = true;
            safeWarn(this.env, '🔕 您的重复请求已被取消', {
                url: context.config.url,
                method: context.config.method
            });
        }
        // 清理失败的请求，立即清理而不是延迟
        if (context.metadata.requestId) {
            this.cleanupRequest(String(context.metadata.requestId));
        }
    }

    /**
     * 处理重复请求
     */
    private async handleDuplicateRequest(requestId: string, config: RequestParams): Promise<void> {
        // 先看controllers里面有没有这个requestId
        const existingController = this.controllers.get(requestId);

        if (existingController) {
            // 获取取消策略
            const strategy = this.getCancelStrategy(config);

            if (strategy === 'previous') {
                // 取消前一个请求（搜索场景）
                existingController.abort();
                this.controllers.delete(requestId);
                this.createNewController(requestId, config);
            } else {
                // 默认：取消当前请求
                const controller = new AbortController();
                controller.abort();
                config.signal = controller.signal;
            }
        } else {
            // 没有重复请求，创建新的控制器
            this.createNewController(requestId, config);
        }
    }

    /**
     * 创建新的 AbortController
     */
    private createNewController(requestId: string, config: RequestParams): void {
        const controller = new AbortController();
        this.controllers.set(requestId, controller);
        config.signal = controller.signal;
    }

    /**
     * 清理请求控制器
     */
    private cleanupRequest(requestId?: string): void {
        if (requestId) {
            this.controllers.delete(requestId);
        }
    }

    /**
     * 生成请求标识
     */
    private generateRequestId(config: AxiosRequestConfig): string {
        const { method, url, data } = config;
        return `${method}-${url}-${typeof data === 'string' ? data : JSON.stringify(data)}`;
    }

    /**
     * 获取取消策略
     */
    private getCancelStrategy(config: RequestParams): string {
        return config.requestCancel?.cancelTarget || 'current';
    }

    /**
     * 检查是否为取消错误
     */
    private isCancelError(error: unknown): boolean {
        return error instanceof Error && error.name === 'CanceledError';
    }

    /**
     * 手动取消特定请求
     */
    public cancelRequest(requestId: string): void {
        const controller = this.controllers.get(requestId);
        if (controller) {
            controller.abort();
            this.controllers.delete(requestId);
        }
    }

    /**
     * 取消所有pending请求
     */
    public cancelAllRequests(): void {
        this.controllers.forEach(controller => controller.abort());
        this.controllers.clear();
    }
}
