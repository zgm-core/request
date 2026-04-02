import { logger } from '../utils/logger';
import { trace } from '../utils/trace';

/**
 * 流水线步骤
 */
export interface PipelineStep<TContext = Record<string, unknown>> {
    /** 步骤名称 */
    name: string;
    /** 执行函数 */
    execute: (context: TContext) => Promise<unknown>;
    /** 错误处理 */
    onError?: (error: Error, context: TContext) => Promise<void>;
    /** 是否跳过此步骤 */
    skip?: (context: TContext) => boolean;
    /** 重试配置 */
    retryConfig?: {
        maxRetries: number;
        retryDelay: number;
    };
    /** 清理函数 */
    cleanup?: () => Promise<void>;
}

/**
 * 流水线配置
 */
export interface PipelineOptions<TContext = Record<string, unknown>> {
    /** 是否在失败时继续 */
    continueOnError?: boolean;
    /** 执行环境 */
    env?: string;
    /** 初始上下文 */
    initialContext?: TContext;
    /** 进度回调 */
    onProgress?: (stepName: string, completed: number, total: number) => void;
    /** 完成回调 */
    onComplete?: (context: TContext, stats: PipelineStats) => void;
}

/**
 * 流水线统计
 */
export interface PipelineStats {
    totalSteps: number;
    successSteps: number;
    failedSteps: number;
    skippedSteps: number;
    completedSteps: number;
    duration: number;
}

/**
 * 流水线执行结果
 */
export interface PipelineResult<TContext = Record<string, unknown>> {
    /** 是否全部成功 */
    success: boolean;
    /** 最终上下文 */
    context: TContext;
    /** 步骤结果（与 context 相同，方便访问） */
    results: TContext;
    /** 统计信息 */
    stats: PipelineStats;
    /** 错误信息 */
    errors: Array<{ step: string; error: Error }>;
}

/**
 * 类型安全的流水线上下文工具
 */
export class TypedContext<T extends Record<string, unknown>> {
    private context: T;

    constructor(initial: T) {
        this.context = initial;
    }

    /**
     * 获取指定步骤的结果
     */
    get<K extends keyof T>(key: K): T[K] {
        return this.context[key];
    }

    /**
     * 设置值
     */
    set<K extends keyof T>(key: K, value: T[K]): void {
        this.context[key] = value;
    }

    /**
     * 检查是否存在某个步骤
     */
    has<K extends keyof T>(key: K): boolean {
        return key in this.context;
    }

    /**
     * 获取原始上下文
     */
    raw(): T {
        return { ...this.context };
    }
}

/**
 * 创建类型安全的上下文
 */
export function createContext<T extends Record<string, unknown>>(initial: T): TypedContext<T> {
    return new TypedContext(initial);
}

/**
 * 智能请求流水线
 * @description 支持步骤间依赖传递、条件跳过、错误处理、类型安全
 */
export class RequestPipeline<TContext = Record<string, unknown>> {
    private steps: PipelineStep<TContext>[] = [];

    /**
     * 添加步骤
     */
    public addStep(step: PipelineStep<TContext>): this {
        this.steps.push(step);
        return this;
    }

    /**
     * 批量添加步骤
     */
    public addSteps(steps: PipelineStep<TContext>[]): this {
        this.steps.push(...steps);
        return this;
    }

    /**
     * 执行流水线
     */
    public async execute(options: PipelineOptions<TContext> = {}): Promise<PipelineResult<TContext>> {
        const {
            continueOnError = false,
            env = 'production',
            initialContext = {} as TContext,
            onProgress,
            onComplete
        } = options;

        // 开始 Trace
        const traceInfo = trace.startTrace({
            pipeline: true,
            steps: this.steps.length
        });

        const context = { ...initialContext };
        const errors: Array<{ step: string; error: Error }> = [];
        const startTime = Date.now();
        let successSteps = 0;
        let failedSteps = 0;
        let skippedSteps = 0;
        const cleanupList: Array<() => Promise<void>> = [];

        logger.info('pipeline.start', {
            totalSteps: this.steps.length,
            env,
            traceId: traceInfo.traceId
        });

        for (let i = 0; i < this.steps.length; i++) {
            const step = this.steps[i];
            if (!step) continue;

            try {
                // 检查是否跳过
                if (step.skip && step.skip(context)) {
                    logger.debug('pipeline.step.skip', {
                        step: step.name,
                        index: i + 1,
                        traceId: traceInfo.traceId
                    });
                    skippedSteps++;
                    continue;
                }

                logger.debug('pipeline.step.start', {
                    step: step.name,
                    index: i + 1,
                    total: this.steps.length,
                    traceId: traceInfo.traceId
                });

                const stepTrace = trace.startSpan(traceInfo.spanId);

                // 执行步骤（带重试）
                let lastError: Error | undefined;
                let result: unknown;

                if (step.retryConfig) {
                    const { maxRetries, retryDelay } = step.retryConfig;
                    let attempt = 0;

                    for (attempt = 0; attempt <= maxRetries; attempt++) {
                        try {
                            result = await step.execute(context);
                            break; // 成功，退出重试循环
                        } catch (error) {
                            lastError = error instanceof Error ? error : new Error(String(error));

                            if (attempt < maxRetries) {
                                logger.debug('pipeline.step.retry', {
                                    step: step.name,
                                    attempt: attempt + 1,
                                    maxRetries,
                                    traceId: traceInfo.traceId
                                });
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                            }
                        }
                    }

                    if (attempt > maxRetries && lastError) {
                        throw lastError;
                    }
                } else {
                    result = await step.execute(context);
                }

                // 将结果存入上下文
                (context as Record<string, unknown>)[step.name] = result;
                successSteps++;

                // 注册清理函数
                if (step.cleanup) {
                    cleanupList.push(step.cleanup);
                }

                logger.debug('pipeline.step.complete', {
                    step: step.name,
                    traceId: traceInfo.traceId
                });

                onProgress?.(step.name, i + 1, this.steps.length);
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                errors.push({ step: step.name, error: errorObj });
                failedSteps++;

                logger.error('pipeline.step.failed', {
                    step: step.name,
                    error: errorObj.message,
                    traceId: traceInfo.traceId
                });

                // 执行错误处理
                if (step.onError) {
                    try {
                        await step.onError(errorObj, context);
                    } catch (handlerError) {
                        logger.error('pipeline.step.handler.failed', {
                            step: step.name,
                            error: handlerError instanceof Error ? handlerError.message : String(handlerError),
                            traceId: traceInfo.traceId
                        });
                    }
                }

                // 注册清理函数（即使失败也要执行）
                if (step.cleanup) {
                    cleanupList.push(step.cleanup);
                }

                if (!continueOnError) {
                    logger.warn('pipeline.aborted', {
                        reason: 'error',
                        traceId: traceInfo.traceId
                    });
                    break;
                }
            }
        }

        const duration = Date.now() - startTime;
        const completedSteps = successSteps; // 只计算成功完成的步骤
        const stats: PipelineStats = {
            totalSteps: this.steps.length,
            successSteps,
            failedSteps,
            skippedSteps,
            completedSteps,
            duration
        };

        const success = failedSteps === 0;

        logger.info('pipeline.complete', {
            success,
            successSteps,
            failedSteps,
            skippedSteps,
            completedSteps,
            duration,
            traceId: traceInfo.traceId
        });

        // 结束 Trace
        trace.endTrace();

        // 执行所有清理函数
        for (const cleanup of cleanupList) {
            try {
                await cleanup();
            } catch (cleanupError) {
                logger.error('pipeline.cleanup.failed', {
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
                });
            }
        }

        onComplete?.(context, stats);

        return { success, context, results: context, stats, errors };
    }

    /**
     * 清空步骤
     */
    public clear(): void {
        this.steps = [];
    }

    /**
     * 获取步骤数量
     */
    public get length(): number {
        return this.steps.length;
    }
}

/**
 * 流水线构建器
 */
export class PipelineBuilder<TContext = Record<string, unknown>> {
    private pipeline: RequestPipeline<TContext>;

    constructor() {
        this.pipeline = new RequestPipeline<TContext>();
    }

    /**
     * 添加步骤
     */
    public step(name: string, execute: (context: TContext) => Promise<unknown>): this {
        this.pipeline.addStep({ name, execute });
        return this;
    }

    /**
     * 添加带跳过条件的步骤
     */
    public stepWithSkip(
        name: string,
        execute: (context: TContext) => Promise<unknown>,
        skip: (context: TContext) => boolean
    ): this {
        this.pipeline.addStep({ name, execute, skip });
        return this;
    }

    /**
     * 添加带错误处理的步骤
     */
    public stepWithError(
        name: string,
        execute: (context: TContext) => Promise<unknown>,
        onError: (error: Error, context: TContext) => Promise<void>
    ): this {
        this.pipeline.addStep({ name, execute, onError });
        return this;
    }

    /**
     * 添加完整步骤
     */
    public addStep(step: PipelineStep<TContext>): this {
        this.pipeline.addStep(step);
        return this;
    }

    /**
     * 执行流水线
     */
    public async execute(options?: PipelineOptions<TContext>): Promise<PipelineResult<TContext>> {
        return this.pipeline.execute(options);
    }

    /**
     * 清空流水线
     */
    public clear(): this {
        this.pipeline.clear();
        return this;
    }
}

/**
 * 创建流水线构建器
 */
export function createPipeline<TContext = Record<string, unknown>>(): PipelineBuilder<TContext> {
    return new PipelineBuilder<TContext>();
}
