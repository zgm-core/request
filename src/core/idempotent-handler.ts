import { safeLog } from '../utils/logger';
import { IdempotentConfig } from '../types/base';

// 重新导出类型以保持兼容性
export type { IdempotentConfig } from '../types/base';

/**
 * 幂等记录
 */
interface IdempotentRecord {
    timestamp: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any;
    status: 'pending' | 'completed' | 'failed';
}

/**
 * 幂等处理器
 * @description 防止重复请求，确保相同请求只执行一次
 */
export class IdempotentHandler {
    private enabled: boolean;
    private storage: Map<string, IdempotentRecord>;
    private ttl: number;
    private env?: string;

    constructor(config: IdempotentConfig = {}) {
        this.enabled = config.enabled ?? false;
        this.ttl = config.ttl ?? 60000;
        this.storage = new Map();
        this.env = config.env ?? 'default';

        if (this.enabled && this.env) {
            safeLog(this.env, '✅ 幂等性控制已启用');
        }
    }

    /**
     * 检查请求是否已处理
     */
    public isProcessed(key: string): boolean {
        if (!this.enabled) return false;

        const record = this.storage.get(key);
        if (!record) return false;

        const isExpired = Date.now() - record.timestamp > this.ttl;
        if (isExpired) {
            this.storage.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 检查请求是否正在处理中
     */
    public isPending(key: string): boolean {
        if (!this.enabled) return false;

        const record = this.storage.get(key);
        return record?.status === 'pending' && !this.isExpired(key);
    }

    /**
     * 标记请求为处理中
     */
    public markPending(key: string): void {
        if (!this.enabled) return;

        this.storage.set(key, {
            timestamp: Date.now(),
            status: 'pending'
        });
    }

    /**
     * 标记请求为完成
     */
    public markCompleted(key: string, result?: any): void {
        if (!this.enabled) return;

        const record = this.storage.get(key);
        if (record) {
            record.status = 'completed';
            record.result = result;
        }
    }

    /**
     * 标记请求为失败
     */
    public markFailed(key: string): void {
        if (!this.enabled) return;

        const record = this.storage.get(key);
        if (record) {
            record.status = 'failed';
        }
    }

    /**
     * 获取已完成的请求结果
     */
    public getResult(key: string): any {
        if (!this.enabled) return undefined;

        const record = this.storage.get(key);
        return record?.status === 'completed' ? record.result : undefined;
    }

    /**
     * 清理过期记录
     */
    public cleanupExpired(): void {
        if (!this.enabled) return;

        const now = Date.now();
        let cleaned = 0;

        for (const [key, record] of this.storage.entries()) {
            if (now - record.timestamp > this.ttl) {
                this.storage.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0 && this.env) {
            safeLog(this.env, `🧹 清理了 ${cleaned} 条过期幂等记录`);
        }
    }

    /**
     * 清空所有记录
     */
    public clear(): void {
        this.storage.clear();
    }

    /**
     * 获取记录数量
     */
    public get size(): number {
        return this.storage.size;
    }

    /**
     * 检查记录是否过期
     */
    private isExpired(key: string): boolean {
        const record = this.storage.get(key);
        if (!record) return false;
        return Date.now() - record.timestamp > this.ttl;
    }
}

/**
 * 默认幂等键生成器
 */
export function defaultIdempotentKeyGenerator(config: any): string {
    const parts: string[] = [
        config.method || 'GET',
        config.url || ''
    ];

    if (config.params) {
        parts.push(JSON.stringify(config.params));
    }

    if (config.data && ['post', 'put', 'patch'].includes((config.method || '').toLowerCase())) {
        // 只对 post/put/patch 的请求体生成 key，避免大对象
        try {
            const str = JSON.stringify(config.data);
            parts.push(str.substring(0, 100)); // 限制长度
        } catch {
            // ignore
        }
    }

    return `idempotent:${parts.join(':')}`;
}
