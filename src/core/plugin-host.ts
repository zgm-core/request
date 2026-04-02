import { AxiosInstance } from 'axios';
import { IRequestPlugin, IPluginContext, PluginManagerConfig, GlobalConfig } from '../types/base';
import { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

/**
 * 插件上下文增强
 */
export interface EnhancedPluginContext extends IPluginContext {
    /** Trace ID */
    traceId?: string;
    /** Span ID */
    spanId?: string;
    /** 请求开始时间 */
    startTime?: number;
}

/**
 * 插件依赖关系
 */
export interface PluginDependency {
    /** 插件名称 */
    name: string;
    /** 依赖的插件名称列表 */
    dependsOn?: string[];
}

/**
 * 插件执行状态
 */
export interface PluginExecutionState {
    /** 插件名称 */
    name: string;
    /** 是否执行成功 */
    success: boolean;
    /** 执行耗时 */
    duration: number;
    /** 错误信息 */
    error?: string;
}

/**
 * 插件宿主（增强版插件管理器）
 * @description 管理所有请求插件的注册、初始化、生命周期调用和依赖关系
 */
export class PluginHost {
    /** 插件列表 */
    private plugins: IRequestPlugin[] = [];

    /** 插件依赖关系 */
    private dependencies: PluginDependency[] = [];

    /** 执行历史 */
    private executionHistory: PluginExecutionState[] = [];

    /** 当前上下文 */
    private currentContext: EnhancedPluginContext | null = null;

    constructor(config?: Partial<PluginManagerConfig>) {
        if (config?.plugins) {
            this.plugins = [...config.plugins];
            this.sortPlugins();
        }
    }

    /**
     * 注册插件
     * @param plugin - 要注册的插件
     * @param dependsOn - 依赖的插件名称列表
     */
    public register(plugin: IRequestPlugin, dependsOn?: string[]): void {
        const existingIndex = this.plugins.findIndex(p => p.name === plugin.name);

        if (existingIndex >= 0) {
            // 更新已存在的插件
            this.plugins[existingIndex] = plugin;
            this.updateDependencies(plugin.name, dependsOn);
        } else {
            // 添加新插件
            this.plugins.push(plugin);
            if (dependsOn && dependsOn.length > 0) {
                this.dependencies.push({ name: plugin.name, dependsOn });
            }
        }

        this.sortPlugins();
    }

    /**
     * 更新插件依赖关系
     */
    private updateDependencies(pluginName: string, dependsOn?: string[]): void {
        const index = this.dependencies.findIndex(d => d.name === pluginName);
        if (index >= 0 && this.dependencies[index]) {
            this.dependencies[index].dependsOn = dependsOn;
        } else if (dependsOn && dependsOn.length > 0) {
            this.dependencies.push({ name: pluginName, dependsOn });
        }
    }

    /**
     * 注销插件
     * @param pluginName - 插件名称
     * @returns 是否成功注销
     */
    public unregister(pluginName: string): boolean {
        const initialLength = this.plugins.length;
        this.plugins = this.plugins.filter(plugin => plugin.name !== pluginName);
        this.dependencies = this.dependencies.filter(d => d.name !== pluginName);
        return this.plugins.length !== initialLength;
    }

    /**
     * 初始化所有插件
     * @param axiosInstance - Axios 实例
     * @param config - 全局配置
     */
    public initPlugins(axiosInstance: AxiosInstance, config: GlobalConfig): void {
        const initOrder = this.resolveExecutionOrder();

        for (const pluginName of initOrder) {
            const plugin = this.plugins.find(p => p.name === pluginName);
            if (!plugin) continue;

            if (plugin.init) {
                try {
                    const startTime = Date.now();
                    plugin.init(axiosInstance, config);
                    const duration = Date.now() - startTime;

                    logger.debug(`Plugin ${plugin.name} initialized`, { duration });
                } catch (error) {
                    logger.error(`Plugin ${plugin.name} initialization failed`, { error: error instanceof Error ? error : String(error) });
                }
            }
        }
    }

    /**
     * 解析插件执行顺序（考虑依赖关系）
     */
    private resolveExecutionOrder(): string[] {
        const order: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (pluginName: string): void => {
            if (visited.has(pluginName)) {
                return;
            }

            if (visiting.has(pluginName)) {
                throw new Error(`Circular dependency detected: ${pluginName}`);
            }

            visiting.add(pluginName);

            const dependency = this.dependencies.find(d => d.name === pluginName);
            if (dependency?.dependsOn) {
                for (const dep of dependency.dependsOn) {
                    visit(dep);
                }
            }

            visiting.delete(pluginName);
            visited.add(pluginName);
            order.push(pluginName);
        };

        for (const plugin of this.plugins) {
            visit(plugin.name);
        }

        return order;
    }

    /**
     * 执行请求前钩子
     * @param context - 插件上下文
     */
    public async executeBeforeRequest(context: IPluginContext): Promise<void> {
        const enhancedContext: EnhancedPluginContext = {
            ...context,
            traceId: context.metadata?.traceId as string,
            spanId: context.metadata?.spanId as string,
            startTime: Date.now()
        };

        this.currentContext = enhancedContext;

        const order = this.resolveExecutionOrder();

        for (const pluginName of order) {
            const plugin = this.plugins.find(p => p.name === pluginName);
            if (!plugin || !plugin.beforeRequest) continue;

            try {
                const startTime = Date.now();
                await plugin.beforeRequest(enhancedContext);
                const duration = Date.now() - startTime;

                this.recordExecution(pluginName, true, duration);
            } catch (error) {
                const duration = Date.now() - (enhancedContext.startTime || Date.now());
                this.recordExecution(pluginName, false, duration, error instanceof Error ? error.message : String(error));

                logger.error(`Plugin ${pluginName} beforeRequest execution failed`, { error: error instanceof Error ? error : String(error) });
            }
        }
    }

    /**
     * 执行请求后钩子
     * @param context - 插件上下文
     * @param response - 响应对象
     */
    public async executeAfterRequest(context: IPluginContext, response: AxiosResponse): Promise<void> {
        const order = this.resolveExecutionOrder();

        for (const pluginName of order) {
            const plugin = this.plugins.find(p => p.name === pluginName);
            if (!plugin || !plugin.afterRequest) continue;

            try {
                const startTime = Date.now();
                await plugin.afterRequest(context, response);
                const duration = Date.now() - startTime;

                this.recordExecution(pluginName, true, duration);
            } catch (error) {
                const duration = Date.now() - (this.currentContext?.startTime || Date.now());
                this.recordExecution(pluginName, false, duration, error instanceof Error ? error.message : String(error));

                logger.error(`Plugin ${pluginName} afterRequest execution failed`, { error: error instanceof Error ? error : String(error) });
            }
        }
    }

    /**
     * 执行错误处理钩子
     * @param context - 插件上下文
     * @param error - 错误对象
     */
    public async executeOnError(context: IPluginContext, error: unknown): Promise<void> {
        const order = this.resolveExecutionOrder();

        for (const pluginName of order) {
            const plugin = this.plugins.find(p => p.name === pluginName);
            if (!plugin || !plugin.onError) continue;

            try {
                const startTime = Date.now();
                await plugin.onError(context, error);
                const duration = Date.now() - startTime;

                this.recordExecution(pluginName, true, duration);
            } catch (pluginError) {
                const duration = Date.now() - (this.currentContext?.startTime || Date.now());
                this.recordExecution(pluginName, false, duration, pluginError instanceof Error ? pluginError.message : String(pluginError));

                logger.error(`Plugin ${pluginName} onError execution failed`, { error: pluginError instanceof Error ? pluginError : String(pluginError) });
            }
        }
    }

    /**
     * 记录插件执行状态
     */
    private recordExecution(name: string, success: boolean, duration: number, error?: string): void {
        this.executionHistory.push({
            name,
            success,
            duration,
            error
        });

        // 只保留最近 100 条记录
        if (this.executionHistory.length > 100) {
            this.executionHistory = this.executionHistory.slice(-100);
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
     * 获取插件执行历史
     */
    public getExecutionHistory(): ReadonlyArray<PluginExecutionState> {
        return [...this.executionHistory];
    }

    /**
     * 清除执行历史
     */
    public clearExecutionHistory(): void {
        this.executionHistory = [];
    }

    /**
     * 按优先级排序插件
     */
    private sortPlugins(): void {
        this.plugins.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    /**
     * 获取当前上下文
     */
    public getCurrentContext(): EnhancedPluginContext | null {
        return this.currentContext;
    }

    /**
     * 清除当前上下文
     */
    public clearContext(): void {
        this.currentContext = null;
    }
}
