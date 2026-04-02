import { IRequestPlugin, IPluginContext, PluginManagerConfig, GlobalConfig } from '../types/base';
import { AxiosInstance, AxiosResponse } from 'axios';
import { safeError } from '../utils/logger';

/**
 * 插件管理器
 * @description 管理所有请求插件的注册、初始化和生命周期调用
 */
export class PluginManager {
    /** 插件列表 */
    private plugins: IRequestPlugin[] = [];

    constructor(config?: Partial<PluginManagerConfig>) {
        if (config?.plugins) {
            this.plugins = [...config.plugins];
            this.sortPlugins();
        }
    }

    /**
     * 注册插件
     * @param plugin - 要注册的插件
     */
    public register(plugin: IRequestPlugin): void {
        const existingIndex = this.plugins.findIndex(p => p.name === plugin.name);

        if (existingIndex >= 0) {
            // 更新已存在的插件
            this.plugins[existingIndex] = plugin;
        } else {
            // 添加新插件
            this.plugins.push(plugin);
        }

        this.sortPlugins();
    }

    /**
     * 注销插件
     * @param pluginName - 插件名称
     * @returns 是否成功注销
     */
    public unregister(pluginName: string): boolean {
        const initialLength = this.plugins.length;
        this.plugins = this.plugins.filter(plugin => plugin.name !== pluginName);
        return this.plugins.length !== initialLength;
    }

    /**
     * 初始化所有插件
     * @param axiosInstance - Axios 实例
     * @param config - 全局配置
     */
    public initPlugins(axiosInstance: AxiosInstance, config: GlobalConfig): void {
        this.plugins.forEach(plugin => {
            // 看插件有初始化方法没有的话就初始化
            if (plugin.init) {
                try {
                    plugin.init(axiosInstance, config);
                } catch (error) {
                    safeError(`❌ 插件 ${plugin.name} 初始化失败:`, error);
                }
            }
        });
    }

    /**
     * 执行请求前钩子
     * @param context - 插件上下文
     */
    public async executeBeforeRequest(context: IPluginContext): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.beforeRequest) {
                try {
                    await plugin.beforeRequest(context);
                } catch (error) {
                    safeError(`❌ 插件 ${plugin.name} beforeRequest 执行失败:`, error);
                }
            }
        }
    }

    /**
     * 执行请求后钩子
     * @param context - 插件上下文
     * @param response - 响应对象
     */
    public async executeAfterRequest(context: IPluginContext, response: AxiosResponse): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.afterRequest) {
                try {
                    await plugin.afterRequest(context, response);
                } catch (error) {
                    safeError(`❌ 插件 ${plugin.name} afterRequest 执行失败:`, error);
                }
            }
        }
    }

    /**
     * 执行错误处理钩子
     * @param context - 插件上下文
     * @param error - 错误对象
     */
    public async executeOnError(context: IPluginContext, error: unknown): Promise<void> {
        for (const plugin of this.plugins) {
            if (plugin.onError) {
                try {
                    await plugin.onError(context, error);
                } catch (pluginError) {
                    safeError(`❌ 插件 ${plugin.name} onError 执行失败:`, pluginError);
                }
            }
        }
    }

    /**
     * 获取所有插件
     * @returns 插件列表的只读副本
     */
    public getPlugins(): ReadonlyArray<IRequestPlugin> {
        return [...this.plugins];
    }

    /**
     * 检查插件是否已注册
     * @param pluginName - 插件名称
     * @returns 是否已注册
     */
    public hasPlugin(pluginName: string): boolean {
        return this.plugins.some(plugin => plugin.name === pluginName);
    }

    /**
     * 按优先级排序插件
     * 没有优先级的插件排在最后
     */
    private sortPlugins(): void {
        this.plugins.sort((a, b) => {
            const priorityA = a.priority ?? Infinity;
            const priorityB = b.priority ?? Infinity;
            return priorityA - priorityB;
        });
    }
}
