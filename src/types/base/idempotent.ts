/**
 * 幂等配置接口
 */
export interface IdempotentConfig {
    /**
     * 是否启用幂等性控制
     * @default false
     */
    enabled?: boolean;

    /**
     * 幂等键生成函数
     * @default 默认基于 method、url、params 生成
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keyGenerator?: (config: any) => string;

    /**
     * 幂等缓存过期时间（毫秒）
     * @default 60000 (60秒)
     */
    ttl?: number;

    /**
     * 存储类型
     * @default 'memory'
     */
    storage?: 'memory' | 'localStorage' | 'sessionStorage';

    /**
     * 执行环境（用于日志）
     */
    env?: string;
}

/**
 * 幂等记录状态
 */
export type IdempotentStatus = 'pending' | 'completed' | 'failed';
