import { GlobalConfig, DeepPartial, PlainObject } from '../types/base/index';
import CryptoJS from 'crypto-js';
import { DEFAULT_GLOBAL_CONFIG } from '../constants/default-config';
import { safeError } from '../utils/logger';

/**
 * 配置变更监听器类型
 */
type ConfigChangeListener = (newConfig: GlobalConfig, oldConfig: GlobalConfig) => void;

/**
 * 配置变更信息
 */
interface ConfigChangeInfo {
    oldHash: string;
    newHash: string;
    hasChanged: boolean;
}

// ==================== 工具函数 ====================

/**
 * 检查是否为普通对象
 */
const isPlainObject = (value: unknown): value is PlainObject => {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof RegExp) &&
        Object.prototype.toString.call(value) === '[object Object]'
    );
};

/**
 * 验证配置对象有效性
 */
const isValidConfig = (config: unknown): config is DeepPartial<GlobalConfig> => {
    return isPlainObject(config);
};

/**
 * 计算配置哈希值
 */
const computeConfigHash = (config: GlobalConfig): string => {
    return CryptoJS.MD5(JSON.stringify(config)).toString();
};

// ==================== 配置管理器 ====================

/**
 * 配置管理器（单例模式）
 * 提供全局配置的读写、合并、变更通知等功能
 */
class ConfigManager {
    private config: GlobalConfig = { ...DEFAULT_GLOBAL_CONFIG };
    private currentHash: string = computeConfigHash(this.config);
    private listeners: Set<ConfigChangeListener> = new Set();

    /**
     * 设置全局配置
     * @param userConfig 用户配置（部分配置）
     * @param notify 是否通知监听器（默认 true）
     */
    public setGlobalConfig(userConfig: DeepPartial<GlobalConfig>, notify: boolean = true): void {
        if (!isValidConfig(userConfig)) {
            throw new Error('全局配置必须是一个纯JSON对象');
        }

        const oldConfig = { ...this.config };
        const oldHash = this.currentHash;

        // 深度合并配置
        this.config = this.deepMerge(this.config, userConfig);

        // 计算新哈希值
        this.currentHash = computeConfigHash(this.config);

        // 检查配置是否发生变化
        const hasChanged = oldHash !== this.currentHash;

        // 如果配置发生变化且需要通知，则通知所有监听器
        if (hasChanged && notify) {
            this.notifyListeners(oldConfig, { ...this.config });
        }
    }

    /**
     * 注册配置变更监听器
     * @param listener 监听器函数
     * @returns 取消订阅的函数
     */
    public onChange(listener: ConfigChangeListener): () => void {
        this.listeners.add(listener);

        // 返回取消订阅函数
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * 通知所有监听器配置变更
     */
    private notifyListeners(oldConfig: GlobalConfig, newConfig: GlobalConfig): void {
        this.listeners.forEach(listener => {
            try {
                listener(newConfig, oldConfig);
            } catch (error) {
                safeError('配置变更监听器执行失败:', error);
            }
        });
    }

    /**
     * 检查配置是否发生变化
     * @param newConfig 新的配置（可选，如果不提供则使用当前配置检查是否有外部变更）
     * @returns 配置变更信息
     */
    public checkConfigChange(newConfig?: DeepPartial<GlobalConfig>): ConfigChangeInfo {
        if (newConfig) {
            // 如果提供了新配置，计算新配置的哈希值并与当前哈希对比
            const mergedConfig = this.deepMerge(this.config, newConfig);
            const newHash = computeConfigHash(mergedConfig);
            return {
                oldHash: this.currentHash,
                newHash,
                hasChanged: this.currentHash !== newHash
            };
        }

        // 如果没有提供新配置，返回当前配置的信息（hasChanged 永远为 false）
        const newHash = computeConfigHash(this.config);
        return {
            oldHash: this.currentHash,
            newHash,
            hasChanged: false
        };
    }

    /**
     * 获取当前配置哈希值
     */
    public getCurrentHash(): string {
        return this.currentHash;
    }

    /**
     * 类型安全的深度合并
     * @param target 默认配置
     * @param source 用户配置
     * @returns 合并后的对象
     */
    public deepMerge = <T extends PlainObject>(target: T, source: DeepPartial<T>): T => {
        const result: T = { ...target };

        for (const key of Object.keys(source) as (keyof T)[]) {
            const value = source[key];
            if (value === undefined) continue;  // 只跳过 undefined，允许 null

            const targetValue = result[key];

            // 情况1：源值和目标值都是纯对象 → 递归深度合并
            if (isPlainObject(value) && isPlainObject(targetValue)) {
                result[key] = this.deepMerge(
                    targetValue as T[keyof T] & PlainObject,
                    value as DeepPartial<T[keyof T] & PlainObject>
                ) as T[keyof T];
            }
            // 情况2：源值和目标值都是数组 → 合并数组
            else if (Array.isArray(value) && Array.isArray(targetValue)) {
                result[key] = [...targetValue, ...value] as T[keyof T];
            }
            // 情况3：其他类型（包括 null）→ 直接覆盖
            else {
                result[key] = value as T[keyof T];
            }
        }

        return result;
    };

    /**
     * 获取全局配置（只读副本）
     */
    public getGlobalConfig(): Readonly<GlobalConfig> {
        return { ...this.config };
    }

    /**
     * 重置配置为默认值
     */
    public reset(): void {
        const oldConfig = { ...this.config };
        this.config = { ...DEFAULT_GLOBAL_CONFIG };
        this.currentHash = computeConfigHash(this.config);
        this.notifyListeners(oldConfig, { ...this.config });
    }

    /**
     * 获取特定配置项
     */
    public get<K extends keyof GlobalConfig>(key: K): GlobalConfig[K] {
        return this.config[key];
    }

    /**
     * 设置特定配置项
     * @param key 配置项键名
     * @param value 配置项值
     * @param notify 是否通知监听器（默认 true）
     */
    public set<K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K], notify: boolean = true): void {
        const oldConfig = { ...this.config };
        this.config[key] = value;
        this.currentHash = computeConfigHash(this.config);

        if (notify) {
            this.notifyListeners(oldConfig, { ...this.config });
        }
    }

    /**
     * 批量设置配置项
     * @param updates 配置更新对象
     * @param notify 是否通知监听器（默认 true）
     */
    public update<K extends keyof GlobalConfig>(updates: Partial<Record<K, GlobalConfig[K]>>, notify: boolean = true): void {
        const oldConfig = { ...this.config };
        // 使用 deepMerge 而不是 Object.assign，以支持深度合并
        this.config = this.deepMerge(this.config, updates as DeepPartial<GlobalConfig>);
        this.currentHash = computeConfigHash(this.config);

        if (notify) {
            this.notifyListeners(oldConfig, { ...this.config });
        }
    }

    /**
     * 获取请求头配置（只读）
     */
    public getHeaders(): Readonly<Record<string, string>> {
        return { ...this.config.headers } as Record<string, string>;
    }

    /**
     * 设置请求头
     * @param headers 请求头对象
     * @param notify 是否通知监听器（默认 true）
     */
    public setHeaders(headers: Record<string, string>, notify: boolean = true): void {
        const oldConfig = { ...this.config };
        this.config.headers = {
            ...this.config.headers,
            ...headers
        } as GlobalConfig['headers'];
        this.currentHash = computeConfigHash(this.config);

        if (notify) {
            this.notifyListeners(oldConfig, { ...this.config });
        }
    }

    /**
     * 获取监听器数量
     */
    public getListenerCount(): number {
        return this.listeners.size;
    }

    /**
     * 清除所有监听器
     */
    public clearListeners(): void {
        this.listeners.clear();
    }
}

// ==================== 导出 ====================

// 创建配置管理器单例
const configManager = new ConfigManager();

// 兼容性导出
const getFinalConfig = (): GlobalConfig => configManager.getGlobalConfig();

export { configManager, getFinalConfig };
export type { ConfigChangeListener, ConfigChangeInfo };
