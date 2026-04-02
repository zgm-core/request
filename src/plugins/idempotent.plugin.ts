import { IRequestPlugin, IPluginContext } from '../types/base/plugin';
import { IdempotentHandler, defaultIdempotentKeyGenerator } from '../core/idempotent-handler';
import { GlobalConfig } from '../types/base/config';
import { AxiosInstance } from 'axios';

/**
 * 幂等性插件
 * @description 防止重复请求，确保相同请求只执行一次
 */
export class IdempotentPlugin implements IRequestPlugin {
    public readonly name = 'idempotent-plugin';
    public priority = 85; // 优先级高于缓存和重试

    private handler: IdempotentHandler;

    constructor() {
        this.handler = new IdempotentHandler();
    }

    /**
     * 初始化插件
     */
    public init(axiosInstance: AxiosInstance, globalConfig: GlobalConfig): void {
        // 只有在 handler 不存在或配置真正变化时才重新创建，避免丢失 pending 状态
        const newEnabled = globalConfig.idempotent?.enabled ?? false;
        const newTtl = globalConfig.idempotent?.ttl ?? 60000;
        const newStorage = globalConfig.idempotent?.storage ?? 'memory';

        if (!this.handler) {
            this.handler = new IdempotentHandler({
                enabled: newEnabled,
                ttl: newTtl,
                storage: newStorage,
                env: globalConfig.env
            });
        } else {
            // 更新配置，但保留现有记录
            (this.handler as any).enabled = newEnabled;
            (this.handler as any).ttl = newTtl;
            (this.handler as any).env = globalConfig.env;
        }
    }

    /**
     * 请求前 - 检查幂等性
     */
    public async beforeRequest(context: IPluginContext): Promise<void> {
        const { config, metadata } = context;

        const idempotentConfig = config.idempotent;

        if (!idempotentConfig?.enabled) return;

        const keyGenerator = idempotentConfig.keyGenerator ?? defaultIdempotentKeyGenerator;
        const key = keyGenerator(config);

        // 检查是否已处理
        if (this.handler.isProcessed(key)) {
            const result = this.handler.getResult(key);
            if (result !== undefined) {
                (metadata as any).idempotentResult = result;
                (metadata as any).skipRequest = true;
                return;
            }
        }

        // 检查是否正在处理
        if (this.handler.isPending(key)) {
            throw new Error('请求正在处理中，请勿重复提交');
        }

        // 标记为处理中
        this.handler.markPending(key);
        (metadata as any).idempotentKey = key;
    }

    /**
     * 请求后 - 记录结果
     */
    public async afterRequest(context: IPluginContext): Promise<void> {
        const { metadata } = context;

        const idempotentKey = (metadata as any).idempotentKey;
        if (!idempotentKey) return;

        const result = context.response?.data;
        const error = (metadata as any).error;

        if (error) {
            this.handler.markFailed(idempotentKey);
        } else {
            this.handler.markCompleted(idempotentKey, result);
        }
    }

    /**
     * 错误处理
     */
    public async onError(context: IPluginContext): Promise<void> {
        const { metadata } = context;

        const idempotentKey = (metadata as any).idempotentKey;
        if (!idempotentKey) return;

        this.handler.markFailed(idempotentKey);
    }

    /**
     * 清理过期记录
     */
    public cleanup(): void {
        this.handler.cleanupExpired();
    }
}
