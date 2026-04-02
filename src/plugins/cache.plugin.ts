import { AxiosResponse } from 'axios';
import { IRequestPlugin, IPluginContext, RequestParams } from '../types/base';
import { encryption, safeLog } from '../utils';
import { CacheManager } from '../utils';

/**
 * 企业级缓存插件
 */
export class CachePlugin implements IRequestPlugin {
    public readonly name = 'cache-plugin';
    public priority = 100;
    private readonly isHttps: RegExp =
        /^\s*https:\/\/(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|\[(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|:)\])(?::(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5]))?(?:\/[^\s]*)?\s*$/;

    private cacheManager: CacheManager;

    constructor() {
        this.cacheManager = new CacheManager();
    }

    /**
     * 请求前 - 检查缓存
     */
    public async beforeRequest(context: IPluginContext): Promise<void> {
        const { config } = context;

        // 智能触发清理
        this.cacheManager.maybeTriggerCleanup();

        // 用户决定是否缓存：必须显式配置 enabled: true
        if (!config.cache?.enabled) return;

        // 生成缓存键
        const cacheKey: string = this.generateCacheKey(config);

        // 这里是需要判断的是不是用https 缓存

        // 检查缓存
        const cachedData = await this.cacheManager.get(cacheKey, config.cache?.storageType, config);
        if (cachedData) {
            config.cacheMetadata = {
                cacheHit: true,
                cacheKey: cacheKey,
                response: cachedData
            };

            safeLog(config.env, '💾 缓存命中', {
                url: config.url,
                method: config.method,
                key: this.maskKey(cacheKey),
                hitRate: this.cacheManager.getStats().hitRate
            });
            return;
        }

        // 如果是首次请求，就挂上缓存键
        if (!config.cacheMetadata) {
            config.cacheMetadata = {
                cacheKey: cacheKey
            };
        }
    }

    /**
     * 请求后 - 缓存响应
     */
    public async afterRequest(context: IPluginContext, response: AxiosResponse): Promise<void> {
        const { config } = context;

        const cacheConfig = config.cache;
        // 用户决定是否缓存：必须显式配置 enabled: true  如果不缓存就算求
        if (!cacheConfig?.enabled) return;

        // 只缓存成功的响应
        if (response && this.isSuccessResponse(response)) {
            try {
                const ttl = cacheConfig.defaultTTL;
                const key = config.cacheMetadata?.cacheKey
                    ? config.cacheMetadata?.cacheKey
                    : this.generateCacheKey(config);
                // 缓存数据 -如果用户启动https的缓存 就要配合service worker 拦截  缓存
                const https = this.isHttps.test(config?.proxyURL || '');
                this.cacheManager.set(
                    config,
                    config.cache?.storageType ? config.cache?.storageType : 'memory',
                    key,
                    response.data,
                    ttl,
                    config.cache?.maxSize,
                    https
                );
            } catch {
                safeLog('❌ 缓存写入失败', { url: config.url });
            }
        }
    }

    /**
     * 错误处理 - 缓存降级
     */
    public async onError(context: IPluginContext, error: unknown): Promise<void> {
        const { config } = context;

        // 如果请求失败但有缓存，使用缓存数据
        if (config.cacheMetadata?.cacheKey && !config.cacheMetadata?.response) {
            const cacheKey = config.cacheMetadata.cacheKey;
            const cachedData = await this.cacheManager.get(cacheKey, config.cache?.storageType, config);

            if (cachedData) {
                safeLog('🔄 请求失败，使用缓存降级', {
                    url: config.url,
                    error: error instanceof Error ? error.message : '未知错误'
                });

                config.cacheMetadata.response = cachedData;
            }
        }
    }

    /**
     * 生成缓存键
     */
    private generateCacheKey(config: RequestParams): string {
        const { url, method, data } = config;

        // 生成基于请求的缓存键
        const baseKey = `${method?.toUpperCase()}_${url}`;

        if (data && Object.keys(data).length > 0) {
            return `Re_cache_${baseKey}_${encryption.encrypt(`${typeof data === 'string' ? data : JSON.stringify(data)}`, baseKey)}`;
        }

        return `Re_cache_${baseKey}`;
    }

    /**
     * 检查成功响应
     */
    private isSuccessResponse(response: AxiosResponse): boolean {
        if (!response) return false;

        if (response.status && response.status >= 200 && response.status < 300) {
            return true;
        }

        return false;
    }

    /**
     * 掩码键值
     */
    private maskKey(key: string): string {
        if (key.length <= 20) return key;
        return `${key.substring(0, 10)}...${key.substring(key.length - 5)}`;
    }
}
