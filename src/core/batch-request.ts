import { IResponseData } from '../types/base';
import { BaseRequest } from './base-request';
import { logger } from '../utils/logger';
import { trace } from '../utils/trace';

/**
 * 批处理配置
 */
export interface BatchRequestConfig {
    /** 批次大小（每批处理的请求数量） */
    batchSize?: number;
    /** 批次间延迟（毫秒） */
    batchDelay?: number;
    /** 是否在失败时继续 */
    continueOnError?: boolean;
    /** 是否并行执行批次 */
    parallelBatches?: boolean;
}

/**
 * 批处理结果
 */
export interface BatchRequestResult<T = IResponseData> {
    /** 所有结果 */
    results: Array<{ success: boolean; data?: T; error?: Error }>;
    /** 成功数量 */
    successCount: number;
    /** 失败数量 */
    failedCount: number;
    /** 总耗时 */
    duration: number;
}

/**
 * 批量请求项
 */
export interface BatchRequestItem {
    /** URL */
    url: string;
    /** 方法 */
    method?: 'get' | 'post' | 'put' | 'delete' | 'patch';
    /** 数据 */
    data?: Record<string, unknown>;
    /** 配置 */
    config?: Record<string, unknown>;
}

/**
 * 批量请求处理器
 */
export class BatchRequestHandler {
    private client: BaseRequest;
    private config: Required<BatchRequestConfig>;

    constructor(client: BaseRequest, config: BatchRequestConfig = {}) {
        this.client = client;
        this.config = {
            batchSize: config.batchSize || 10,
            batchDelay: config.batchDelay || 100,
            continueOnError: config.continueOnError ?? true,
            parallelBatches: config.parallelBatches ?? false
        };
    }

    /**
     * 执行批量请求
     */
    public async execute<T = IResponseData>(items: BatchRequestItem[]): Promise<BatchRequestResult<T>> {
        const startTime = Date.now();
        const traceInfo = trace.startTrace({
            batch: true,
            totalItems: items.length
        });

        logger.info('batch.start', {
            totalItems: items.length,
            batchSize: this.config.batchSize,
            parallelBatches: this.config.parallelBatches,
            traceId: traceInfo.traceId
        });

        // 分批
        const batches = this.splitIntoBatches(items);
        const allResults: Array<{ success: boolean; data?: T; error?: Error }> = [];

        try {
            // 执行批次
            if (this.config.parallelBatches) {
                // 并行执行批次
                const batchResults = await Promise.all(
                    batches.map(batch => this.executeBatch<T>(batch, traceInfo.traceId))
                );
                allResults.push(...batchResults.flat());
            } else {
                // 串行执行批次
                for (let i = 0; i < batches.length; i++) {
                    const batch = batches[i];
                    if (!batch) continue;
                    const batchResults = await this.executeBatch<T>(batch, traceInfo.traceId);
                    allResults.push(...batchResults);

                    // 批次间延迟
                    if (i < batches.length - 1) {
                        await this.delay(this.config.batchDelay);
                    }
                }
            }

            const duration = Date.now() - startTime;
            const successCount = allResults.filter(r => r.success).length;
            const failedCount = allResults.filter(r => !r.success).length;

            logger.info('batch.complete', {
                totalItems: items.length,
                successCount,
                failedCount,
                duration,
                traceId: traceInfo.traceId
            });

            trace.endTrace();

            return {
                results: allResults,
                successCount,
                failedCount,
                duration
            };
        } catch (error) {
            logger.error('batch.failed', {
                error: error instanceof Error ? error.message : String(error),
                traceId: traceInfo.traceId
            });
            trace.endTrace();
            throw error;
        }
    }

    /**
     * 分批
     */
    private splitIntoBatches(items: BatchRequestItem[]): BatchRequestItem[][] {
        const batches: BatchRequestItem[][] = [];
        for (let i = 0; i < items.length; i += this.config.batchSize) {
            batches.push(items.slice(i, i + this.config.batchSize));
        }
        return batches;
    }

    /**
     * 执行单批请求
     */
    private async executeBatch<T>(
        batch: BatchRequestItem[],
        traceId: string
    ): Promise<Array<{ success: boolean; data?: T; error?: Error }>> {
        const results: Array<{ success: boolean; data?: T; error?: Error }> = [];

        for (const item of batch) {
            try {
                const data = await this.client.request<T>(
                    item.method || 'get',
                    item.url,
                    item.data || {},
                    item.config || {}
                );
                results.push({ success: true, data });
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                results.push({ success: false, error: errorObj });

                if (!this.config.continueOnError) {
                    throw error;
                }
            }
        }

        return results;
    }

    /**
     * 延迟
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 批量 GET 请求（URL 查询参数合并）
 */
export async function batchGet<T = IResponseData>(
    client: BaseRequest,
    url: string,
    params: Array<Record<string, unknown>>,
    paramKey: string = 'id',
    config?: BatchRequestConfig
): Promise<BatchRequestResult<T>> {
    const handler = new BatchRequestHandler(client, config);

    const items: BatchRequestItem[] = params.map(param => ({
        url,
        method: 'get',
        data: { [paramKey]: param }
    }));

    return handler.execute<T>(items);
}

/**
 * 批量 POST 请求
 */
export async function batchPost<T = IResponseData>(
    client: BaseRequest,
    url: string,
    dataList: Array<Record<string, unknown>>,
    config?: BatchRequestConfig
): Promise<BatchRequestResult<T>> {
    const handler = new BatchRequestHandler(client, config);

    const items: BatchRequestItem[] = dataList.map(data => ({
        url,
        method: 'post',
        data
    }));

    return handler.execute<T>(items);
}

/**
 * 批量请求（通用）
 */
export async function batchRequest<T = IResponseData>(
    client: BaseRequest,
    items: BatchRequestItem[],
    config?: BatchRequestConfig
): Promise<BatchRequestResult<T>> {
    const handler = new BatchRequestHandler(client, config);
    return handler.execute<T>(items);
}
