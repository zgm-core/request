import { safeLog, safeError } from '../utils/logger';

/**
 * 串行任务接口
 */
export interface SerialTask<T = unknown> {
    /** 任务名称（可选，用于日志） */
    name?: string;
    /** 任务执行函数 */
    execute: () => Promise<T>;
    /** 错误处理回调 */
    onError?: (error: Error, index: number) => void;
    /** 成功回调 */
    onSuccess?: (result: T, index: number) => void;
}

/**
 * 串行执行选项
 */
export interface SerialOptions {
    /** 是否在失败时继续执行（默认：false） */
    continueOnError?: boolean;
    /** 执行环境（用于日志） */
    env?: string;
    /** 进度回调 */
    onProgress?: (completed: number, total: number, currentTask?: string) => void;
}

/**
 * 串行执行结果
 */
export interface SerialResult<T = unknown> {
    /** 所有成功的结果 */
    results: T[];
    /** 所有错误 */
    errors: Array<{ index: number; task?: string; error: Error }>;
    /** 是否全部成功 */
    allSuccess: boolean;
    /** 执行统计 */
    stats: {
        total: number;
        success: number;
        failed: number;
        duration: number;
    };
}

/**
 * 智能串行请求控制器
 * @description 按顺序执行任务，支持错误处理、进度回调、依赖传递
 */
export class SerialRequestController {
    private tasks: SerialTask[] = [];

    /**
     * 添加任务到队列
     */
    public addTask<T = unknown>(task: SerialTask<T>): this {
        this.tasks.push(task as SerialTask);
        return this;
    }

    /**
     * 批量添加任务
     */
    public addTasks<T = unknown>(tasks: SerialTask<T>[]): this {
        this.tasks.push(...tasks as SerialTask[]);
        return this;
    }

    /**
     * 清空任务队列
     */
    public clearTasks(): this {
        this.tasks = [];
        return this;
    }

    /**
     * 串行执行所有任务
     */
    public async execute<T = unknown>(options: SerialOptions = {}): Promise<SerialResult<T>> {
        const { continueOnError = false, env = 'production', onProgress } = options;
        const results: T[] = [];
        const errors: Array<{ index: number; task?: string; error: Error }> = [];
        const startTime = Date.now();

        safeLog(env, `📋 开始串行执行 ${this.tasks.length} 个任务`);

        for (let i = 0; i < this.tasks.length; i++) {
            const task = this.tasks[i];
            if (!task) continue;
            const taskName = task.name || `Task-${i}`;

            try {
                safeLog(env, `🔄 执行任务 [${i + 1}/${this.tasks.length}]: ${taskName}`);
                const result = await task.execute();
                results.push(result as T);
                task.onSuccess?.(result as T, i);
                safeLog(env, `✅ 任务完成: ${taskName}`);

                onProgress?.(i + 1, this.tasks.length, taskName);
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                errors.push({ index: i, task: taskName, error: errorObj });
                task.onError?.(errorObj, i);
                safeError(env, `❌ 任务失败: ${taskName}`, errorObj);

                if (!continueOnError) {
                    safeLog(env, '🛑 检测到错误，停止执行后续任务');
                    break;
                }
            }
        }

        const duration = Date.now() - startTime;

        const stats = {
            total: this.tasks.length,
            success: results.length,
            failed: errors.length,
            duration
        };

        safeLog(env, `📊 串行执行完成 - 成功: ${stats.success}, 失败: ${stats.failed}, 耗时: ${duration}ms`);

        return {
            results,
            errors,
            allSuccess: errors.length === 0,
            stats
        };
    }

    /**
     * 清除任务队列中的任务
     */
    public clear(): void {
        this.tasks = [];
    }

    /**
     * 获取队列中的任务数量
     */
    public get length(): number {
        return this.tasks.length;
    }
}

/**
 * 便捷函数：串行执行任务
 */
export async function serialExecute<T = unknown>(
    tasks: SerialTask<T>[],
    options?: SerialOptions
): Promise<SerialResult<T>> {
    const controller = new SerialRequestController();
    controller.addTasks(tasks);
    return controller.execute(options);
}

/**
 * 依赖式串行执行 - 前一个任务的结果作为后一个任务的输入
 */
export async function serialWithDeps<T = unknown>(
    tasks: ((previousResult: T | undefined) => Promise<T>)[],
    options?: SerialOptions
): Promise<SerialResult<T>> {
    const controller = new SerialRequestController();
    let previousResult: T | undefined = undefined;
    
    const wrappedTasks: SerialTask<T>[] = tasks.map((task, index) => ({
        name: `DependentTask-${index}`,
        execute: async () => {
            const result = await task(previousResult);
            previousResult = result;
            return result;
        }
    }));
    
    controller.addTasks(wrappedTasks);
    return controller.execute(options);
}
