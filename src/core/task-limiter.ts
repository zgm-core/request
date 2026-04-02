import {
    ConcurrentOptions,
    ConcurrentTask,
    ExecutionResult,
    ExecutionStats,
    TaskInput,
    DynamicConcurrencyConfig,
    SmartQueueConfig,
    CircuitBreakerConfig,
    ResourceMonitorConfig,
    PriorityLevel,
    CircuitBreakerState,
    QueuedTask,
    EndpointStats,
    ResourceStatus
} from '../types/base/taskLimiter';
import { safeWarn, safeError, safeInfo, safeLog } from '../utils/logger';

// 重新导出类型
export { PriorityLevel, CircuitBreakerState } from '../types/base/taskLimiter';

/**
 * Enterprise concurrent controller with intelligent features
 * - Dynamic concurrency control
 * - Smart queue management
 * - Circuit breaker pattern
 * - Resource-aware scheduling
 */
export class EnterpriseConcurrentController {
    private results: ExecutionResult[] = [];
    private executionPromises: Promise<void>[] = [];
    private abortController: AbortController | null = null;
    protected startTime: number = 0;
    private completed: number = 0;
    private onProgress?: (completed: number, total: number) => void;

    // 动态并发控制
    private dynamicConfig: DynamicConcurrencyConfig | null = null;
    private currentConcurrency: number = 0;
    private initialConcurrency: number = 0;
    private adjustmentCount: number = 0;
    private taskHistory: Array<{ success: boolean; duration: number; timestamp: number; url?: string }> = [];

    // 智能队列
    private smartQueueConfig: SmartQueueConfig | null = null;
    private taskQueue: QueuedTask[] = [];
    private queueTimeoutCount: number = 0;

    // 熔断器
    private circuitBreakerConfig: CircuitBreakerConfig | null = null;
    private endpointStatsMap = new Map<string, EndpointStats>();
    private circuitBreakerTripped: number = 0;

    // 资源监控
    private resourceMonitorConfig: ResourceMonitorConfig | null = null;
    private resourceStatus: ResourceStatus | null = null;
    private resourceDowngradeCount: number = 0;
    private resourceMonitorInterval: ReturnType<typeof setInterval> | null = null;

    private semaphore: IntelligentSemaphore | null = null;
    private options: ConcurrentOptions | null = null;

    /**
     * Execute concurrent tasks
     */
    public async execute(
        tasks: TaskInput[],
        options: ConcurrentOptions
    ): Promise<{
        results: ExecutionResult[];
        stats: ExecutionStats;
    }> {
        this.validateInput(tasks, options);
        this.options = options;

        // 初始化所有智能功能
        this.initDynamicConcurrency(options);
        this.initSmartQueue(options);
        this.initCircuitBreaker(options);
        this.initResourceMonitor(options);

        this.results = new Array(tasks.length);
        this.executionPromises = [];
        this.abortController = new AbortController();
        this.startTime = Date.now();
        this.completed = 0;
        this.onProgress = options.onProgress;

        const normalizedTasks = this.normalizeTasks(tasks);
        const sortedTasks = this.sortByPriority(normalizedTasks);

        // 创建智能信号量
        this.semaphore = new IntelligentSemaphore(
            this.currentConcurrency,
            this.onConcurrencyChange.bind(this)
        );

        // 将任务加入队列或直接执行
        if (this.smartQueueConfig?.enabled) {
            this.enQueueTasks(sortedTasks, options);
        } else {
            this.createExecutionPromises(sortedTasks, options);
        }

        await Promise.all(this.executionPromises);

        // 清理资源监控
        this.cleanup();

        return {
            results: this.results,
            stats: this.calculateStats()
        };
    }

    /**
     * Abort execution
     */
    public abort(): void {
        this.abortController?.abort();
        this.semaphore?.abort();
        this.clearQueue();
    }

    /**
     * Get current concurrency
     */
    public getCurrentConcurrency(): number {
        return this.currentConcurrency;
    }

    /**
     * Get endpoint stats
     */
    public getEndpointStats(url: string): EndpointStats | undefined {
        return this.endpointStatsMap.get(url);
    }

    /**
     * Get all endpoint stats
     */
    public getAllEndpointStats(): Map<string, EndpointStats> {
        return new Map(this.endpointStatsMap);
    }

    /**
     * Reset circuit breaker for specific endpoint
     */
    public resetCircuitBreaker(url: string): void {
        const stats = this.endpointStatsMap.get(url);
        if (stats) {
            stats.circuitState = CircuitBreakerState.CLOSED;
            stats.circuitOpenTime = undefined;
            safeInfo(`熔断器已重置: ${url}`);
        }
    }

    // ============== 初始化方法 ==============

    private validateInput(tasks: TaskInput[], options: ConcurrentOptions): void {
        if (!Array.isArray(tasks)) {
            throw new TypeError('Tasks must be an array');
        }
        if (typeof options.concurrency !== 'number' || options.concurrency <= 0) {
            throw new TypeError('Concurrency must be a positive number');
        }
        if (options.concurrency > 100) {
            safeWarn('High concurrency may cause performance issues');
        }
    }

    private initDynamicConcurrency(options: ConcurrentOptions): void {
        this.dynamicConfig = options.dynamicConcurrency || null;
        if (this.dynamicConfig?.enabled) {
            const config = this.dynamicConfig;
            this.initialConcurrency = options.concurrency;
            this.currentConcurrency = options.concurrency;
            safeInfo(`动态并发控制已启用: 初始并发=${this.initialConcurrency}`);
        } else {
            this.currentConcurrency = options.concurrency;
            this.initialConcurrency = options.concurrency;
        }
    }

    private initSmartQueue(options: ConcurrentOptions): void {
        this.smartQueueConfig = options.smartQueue || null;
        if (this.smartQueueConfig?.enabled) {
            const config = this.smartQueueConfig;
            safeInfo(`智能队列已启用: 超时=${config.queueTimeout || 10000}ms, 最大长度=${config.maxQueueLength || 20}`);
        }
    }

    private initCircuitBreaker(options: ConcurrentOptions): void {
        this.circuitBreakerConfig = options.circuitBreaker || null;
        if (this.circuitBreakerConfig?.enabled) {
            safeInfo(`熔断器已启用: 失败率阈值=${(this.circuitBreakerConfig.failureThreshold || 0.5) * 100}%`);
        }
    }

    private initResourceMonitor(options: ConcurrentOptions): void {
        this.resourceMonitorConfig = options.resourceMonitor || null;
        if (this.resourceMonitorConfig?.enabled) {
            const config = this.resourceMonitorConfig;
            this.startResourceMonitoring(config.monitorInterval || 5000);
            safeInfo(`资源监控已启用: CPU阈值=${(config.cpuThreshold || 0.8) * 100}%`);
        }
    }

    // ============== 队列管理 ==============

    private normalizeTasks(tasks: TaskInput[]): Array<{ task: ConcurrentTask; priority: PriorityLevel; index: number; url?: string; onTimeout?: () => any }> {
        return tasks.map((task, index) => {
            if (typeof task === 'function') {
                return { task, priority: PriorityLevel.MEDIUM, index };
            } else {
                const priority = task.priority !== undefined
                    ? (typeof task.priority === 'number' ? task.priority as PriorityLevel : task.priority)
                    : PriorityLevel.MEDIUM;
                return {
                    task: task.task,
                    priority,
                    index,
                    url: task.url,
                    onTimeout: task.onTimeout
                };
            }
        });
    }

    private sortByPriority(tasks: Array<{ task: ConcurrentTask; priority: PriorityLevel; index: number; url?: string; onTimeout?: () => any }>) {
        return [...tasks].sort((a, b) => a.priority - b.priority);
    }

    private enQueueTasks(
        tasks: Array<{ task: ConcurrentTask; priority: PriorityLevel; index: number; url?: string; onTimeout?: () => any }>,
        options: ConcurrentOptions
    ): void {
        const config = this.smartQueueConfig!;
        const queueTimeout = config.queueTimeout || 10000;
        const maxQueueLength = config.maxQueueLength || 20;

        tasks.forEach(({ task, priority, index, url, onTimeout }) => {
            // 检查队列是否已满
            if (this.taskQueue.length >= maxQueueLength) {
                const action = config.queueFullAction || 'reject';
                if (action === 'reject') {
                    this.results[index] = {
                        success: false,
                        error: new Error('Queue is full, task rejected'),
                        duration: 0
                    };
                    this.completed++;
                    this.onProgress?.(this.completed, this.results.length);
                    safeWarn('队列已满，拒绝任务');
                    return;
                } else if (action === 'drop_low_priority') {
                    // 移除最低优先级的任务
                    const lowPriorityIndex = this.taskQueue.findIndex(t => t.priority === PriorityLevel.LOW);
                    if (lowPriorityIndex !== -1) {
                        const droppedTask = this.taskQueue.splice(lowPriorityIndex, 1)[0];
                        droppedTask?.reject?.(new Error('Dropped due to queue full'));
                        safeWarn('队列已满，丢弃低优先级任务');
                    }
                } else if (action === 'dequeue_oldest') {
                    const oldestTask = this.taskQueue.shift();
                    oldestTask?.reject?.(new Error('Dequeued due to queue full'));
                    safeWarn('队列已满，移除最旧任务');
                }
            }

            const queuedTask: QueuedTask = {
                task,
                priority,
                enqueueTime: Date.now(),
                url,
                onTimeout,
                index  // 存储原始索引
            };

            this.taskQueue.push(queuedTask);
            this.setupQueueTimeout(queuedTask, index, queueTimeout, options);
        });

        this.processQueue(options);
    }

    private setupQueueTimeout(queuedTask: QueuedTask, index: number, timeout: number, options: ConcurrentOptions): void {
        const timeoutId = setTimeout(() => {
            const queueIndex = this.taskQueue.indexOf(queuedTask);
            if (queueIndex !== -1) {
                this.taskQueue.splice(queueIndex, 1);
                this.queueTimeoutCount++;

                if (this.smartQueueConfig?.enableQueueFallback && queuedTask.onTimeout) {
                    const fallbackData = queuedTask.onTimeout();
                    this.results[index] = {
                        success: true,
                        data: fallbackData,
                        duration: timeout,
                        fallbackUsed: true
                    };
                    safeInfo(`任务超时，使用降级数据`);
                } else {
                    this.results[index] = {
                        success: false,
                        error: new Error('Queue timeout'),
                        duration: timeout
                    };
                    safeWarn(`任务排队超时 (${timeout}ms)`);
                }

                this.completed++;
                this.onProgress?.(this.completed, this.results.length);
            }
        }, timeout);

        // 存储超时ID以便清理
        queuedTask.timeoutId = timeoutId;
    }

    private processQueue(options: ConcurrentOptions): void {
        const processNext = () => {
            if (this.taskQueue.length === 0) return;

            const nextTask = this.taskQueue.shift()!;
            const executionPromise = this.executeSingleTask(nextTask, options);
            this.executionPromises.push(executionPromise);
        };

        // 初始处理
        processNext();

        // 每次任务完成处理下一个
        this.semaphore?.onRelease(() => {
            processNext();
        });
    }

    private clearQueue(): void {
        this.taskQueue.forEach(task => {
            // 清理超时定时器
            if (task.timeoutId) {
                clearTimeout(task.timeoutId);
            }
            task.reject?.(new Error('Queue aborted'));
        });
        this.taskQueue = [];
    }

    // ============== 任务执行 ==============

    private createExecutionPromises(
        tasks: Array<{ task: ConcurrentTask; priority: PriorityLevel; index: number; url?: string; onTimeout?: () => any }>,
        options: ConcurrentOptions
    ): void {
        tasks.forEach(({ task, index, url }) => {
            const queuedTask: QueuedTask = { task, priority: PriorityLevel.MEDIUM, enqueueTime: Date.now(), url };
            const executionPromise = this.executeSingleTask(queuedTask, options);
            this.executionPromises.push(executionPromise);
        });
    }

    private async executeSingleTask(
        queuedTask: QueuedTask,
        options: ConcurrentOptions
    ): Promise<void> {
        // 检查资源状态
        if (this.resourceStatus?.isHighLoad && queuedTask.priority === PriorityLevel.LOW) {
            // 高负载时跳过低优先级任务
            if (queuedTask.onTimeout) {
                const fallbackData = queuedTask.onTimeout();
                this.results[this.getTaskIndex(queuedTask)] = {
                    success: true,
                    data: fallbackData,
                    duration: 0,
                    fallbackUsed: true
                };
                this.resourceDowngradeCount++;
                safeInfo('高负载，跳过低优先级任务');
            }
            this.completed++;
            this.onProgress?.(this.completed, this.results.length);
            return;
        }

        // 检查熔断器
        if (queuedTask.url && this.circuitBreakerConfig?.enabled) {
            const stats = this.getOrCreateEndpointStats(queuedTask.url);
            if (stats.circuitState === CircuitBreakerState.OPEN) {
                const fallbackData = queuedTask.onTimeout?.();
                this.results[this.getTaskIndex(queuedTask)] = {
                    success: false,
                    error: new Error(`Circuit breaker is open for ${queuedTask.url}`),
                    duration: 0,
                    ...(fallbackData && { data: fallbackData, fallbackUsed: true })
                };
                this.completed++;
                this.onProgress?.(this.completed, this.results.length);
                return;
            }
        }

        await this.semaphore?.acquire();

        if (this.abortController?.signal.aborted) {
            this.semaphore?.release();
            return;
        }

        const startTime = Date.now();

        try {
            const taskWithTimeout = options.taskTimeout
                ? this.withTimeout(queuedTask.task(), options.taskTimeout)
                : queuedTask.task();

            const data = await taskWithTimeout;
            const duration = Date.now() - startTime;

            const index = this.getTaskIndex(queuedTask);
            this.results[index] = {
                success: true,
                data,
                duration
            };

            // 更新接口统计
            if (queuedTask.url) {
                this.updateEndpointStats(queuedTask.url, true, duration);
            }

            // 记录任务历史
            this.recordTaskHistory(true, duration, queuedTask.url);

            // 检查是否需要调整并发数
            this.checkAndAdjustConcurrency();

        } catch (error) {
            const duration = Date.now() - startTime;

            const index = this.getTaskIndex(queuedTask);
            this.results[index] = {
                success: false,
                error,
                duration
            };

            // 更新接口统计
            if (queuedTask.url) {
                this.updateEndpointStats(queuedTask.url, false, duration);
            }

            // 记录任务历史
            this.recordTaskHistory(false, duration, queuedTask.url);

            // 检查是否需要调整并发数
            this.checkAndAdjustConcurrency();

            if (options.failFast) {
                this.abort();
            }
        } finally {
            this.semaphore?.release();
            this.completed++;
            this.onProgress?.(this.completed, this.results.length);
        }
    }

    private getTaskIndex(queuedTask: QueuedTask): number {
        // 使用存储在任务中的索引
        return queuedTask.index !== undefined ? queuedTask.index : this.completed;
    }

    // ============== 动态并发控制 ==============

    private onConcurrencyChange(current: number, reason: string): void {
        this.currentConcurrency = current;
        this.adjustmentCount++;
        safeInfo(`并发数调整: ${this.initialConcurrency} → ${current} (${reason})`);
        this.options?.onConcurrencyChange?.(current, reason);
    }

    private recordTaskHistory(success: boolean, duration: number, url?: string): void {
        if (!this.dynamicConfig?.enabled) return;

        const interval = this.dynamicConfig.adjustmentInterval || 10;

        if (this.taskHistory.length >= interval * 2) {
            this.taskHistory = this.taskHistory.slice(-interval * 2);
        }

        this.taskHistory.push({ success, duration, timestamp: Date.now(), url });
    }

    private checkAndAdjustConcurrency(): void {
        if (!this.dynamicConfig?.enabled) return;
        if (!this.semaphore) return;

        const config = this.dynamicConfig;
        const interval = config.adjustmentInterval || 10;

        if (this.taskHistory.length < interval) return;

        const recentTasks = this.taskHistory.slice(-interval);
        const totalTasks = recentTasks.length;

        const failedTasks = recentTasks.filter(t => !t.success).length;
        const errorRate = failedTasks / totalTasks;

        const totalDuration = recentTasks.reduce((sum, t) => sum + t.duration, 0);
        const avgDuration = totalDuration / totalTasks;

        const errorThreshold = config.errorRateThreshold || 0.3;
        const responseThreshold = config.responseTimeThreshold || 3000;
        const step = config.adjustmentStep || 1;

        const minConcurrency = config.minConcurrency || 1;
        const maxConcurrency = config.maxConcurrency || 20;

        let shouldDecrease = false;
        let shouldIncrease = false;
        let reason = '';

        // 资源高负载时降低并发
        if (this.resourceStatus?.isHighLoad && !shouldDecrease) {
            shouldDecrease = true;
            reason = '系统资源高负载';
        }

        // 根据错误率降低并发
        if (errorRate > errorThreshold) {
            shouldDecrease = true;
            reason = `错误率过高 (${(errorRate * 100).toFixed(1)}% > ${(errorThreshold * 100)}%)`;
        }

        // 根据响应时间降低并发
        if (avgDuration > responseThreshold && !shouldDecrease) {
            shouldDecrease = true;
            reason = `响应过慢 (${avgDuration.toFixed(0)}ms > ${responseThreshold}ms)`;
        }

        // 网络良好时提高并发
        if (errorRate < 0.05 && avgDuration < 500 && !this.resourceStatus?.isHighLoad) {
            shouldIncrease = true;
            reason = `网络良好 (错误率 ${(errorRate * 100).toFixed(1)}%, 响应 ${avgDuration.toFixed(0)}ms)`;
        }

        if (shouldDecrease && this.currentConcurrency > minConcurrency) {
            const newConcurrency = Math.max(minConcurrency, this.currentConcurrency - step);
            this.semaphore.adjustConcurrency(newConcurrency, reason);
            this.taskHistory = [];
        } else if (shouldIncrease && this.currentConcurrency < maxConcurrency) {
            const newConcurrency = Math.min(maxConcurrency, this.currentConcurrency + step);
            this.semaphore.adjustConcurrency(newConcurrency, reason);
            this.taskHistory = [];
        }
    }

    // ============== 熔断器 ==============

    private getOrCreateEndpointStats(url: string): EndpointStats {
        let stats = this.endpointStatsMap.get(url);
        if (!stats) {
            const domain = this.extractDomain(url);
            stats = {
                url,
                domain,
                totalRequests: 0,
                successCount: 0,
                failedCount: 0,
                failureRate: 0,
                avgResponseTime: 0,
                lastRequestTime: 0,
                lastFailureTime: 0,
                circuitState: CircuitBreakerState.CLOSED,
                currentConcurrency: 0
            };
            this.endpointStatsMap.set(url, stats);
        }
        return stats;
    }

    private extractDomain(url: string): string {
        try {
            if (url.startsWith('http')) {
                return new URL(url).hostname;
            }
            return 'unknown';
        } catch {
            return 'unknown';
        }
    }

    private updateEndpointStats(url: string, success: boolean, duration: number): void {
        const config = this.circuitBreakerConfig;
        if (!config?.enabled) return;

        const stats = this.getOrCreateEndpointStats(url);
        const minRequests = config.minRequests || 5;

        stats.totalRequests++;
        stats.lastRequestTime = Date.now();

        if (success) {
            stats.successCount++;
        } else {
            stats.failedCount++;
            stats.lastFailureTime = Date.now();
        }

        // 计算失败率
        if (stats.totalRequests >= minRequests) {
            stats.failureRate = stats.failedCount / stats.totalRequests;
        }

        // 计算平均响应时间
        stats.avgResponseTime =
            (stats.avgResponseTime * (stats.totalRequests - 1) + duration) / stats.totalRequests;

        // 检查是否需要触发熔断
        this.checkCircuitBreaker(stats, config);
    }

    private checkCircuitBreaker(stats: EndpointStats, config: CircuitBreakerConfig): void {
        const failureThreshold = config.failureThreshold || 0.5;
        const minRequests = config.minRequests || 5;

        // 检查是否应该打开熔断器
        if (stats.circuitState === CircuitBreakerState.CLOSED) {
            if (stats.totalRequests >= minRequests && stats.failureRate >= failureThreshold) {
                stats.circuitState = CircuitBreakerState.OPEN;
                stats.circuitOpenTime = Date.now();
                this.circuitBreakerTripped++;
                safeWarn(`熔断器触发: ${stats.url} (失败率 ${(stats.failureRate * 100).toFixed(1)}%)`);
                this.options?.onCircuitBreakerChange?.(stats.url, CircuitBreakerState.OPEN, 'High failure rate');
            }
        }
        // 检查是否可以进入半开状态
        else if (stats.circuitState === CircuitBreakerState.OPEN) {
            const recoveryTimeout = config.recoveryTimeout || 30000;
            if (Date.now() - (stats.circuitOpenTime || 0) >= recoveryTimeout) {
                stats.circuitState = CircuitBreakerState.HALF_OPEN;
                safeInfo(`熔断器进入半开状态: ${stats.url}`);
                this.options?.onCircuitBreakerChange?.(stats.url, CircuitBreakerState.HALF_OPEN, 'Recovery timeout');
            }
        }
        // 半开状态：如果请求成功，关闭熔断器；如果失败，重新打开
        else if (stats.circuitState === CircuitBreakerState.HALF_OPEN) {
            const halfOpenMaxCalls = config.halfOpenMaxCalls || 3;
            if (stats.successCount >= halfOpenMaxCalls) {
                stats.circuitState = CircuitBreakerState.CLOSED;
                stats.circuitOpenTime = undefined;
                safeInfo(`熔断器恢复: ${stats.url}`);
                this.options?.onCircuitBreakerChange?.(stats.url, CircuitBreakerState.CLOSED, 'Recovery successful');
            }
        }
    }

    // ============== 资源监控 ==============

    private startResourceMonitoring(interval: number): void {
        this.resourceMonitorInterval = setInterval(() => {
            this.checkResourceStatus();
        }, interval);
    }

    private checkResourceStatus(): void {
        if (typeof window === 'undefined') {
            // Node.js 环境
            this.checkNodeResourceStatus();
        } else {
            // 浏览器环境
            this.checkBrowserResourceStatus();
        }
    }

    private checkBrowserResourceStatus(): void {
        const config = this.resourceMonitorConfig;
        if (!config) return;

        const cpuThreshold = config.cpuThreshold || 0.8;
        const memoryThreshold = config.memoryThreshold || 0.8;

        // 简化的浏览器资源检测
        // performance.memory 仅 Chrome 支持，需要类型检查
        const perfWithMemory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } });
        const memoryUsage = perfWithMemory.memory
            ? perfWithMemory.memory.usedJSHeapSize / perfWithMemory.memory.totalJSHeapSize
            : 0;

        // CPU使用率估算（通过长任务检测）
        const cpuUsage = 0.5; // 简化实现

        this.resourceStatus = {
            cpuUsage,
            memoryUsage,
            isHighLoad: cpuUsage > cpuThreshold || memoryUsage > memoryThreshold,
            timestamp: Date.now()
        };

        if (this.resourceStatus.isHighLoad) {
            safeWarn(`系统资源高负载: CPU ${(cpuUsage * 100).toFixed(1)}%, 内存 ${(memoryUsage * 100).toFixed(1)}%`);
        }

        this.options?.onResourceChange?.(this.resourceStatus);
    }

    private checkNodeResourceStatus(): void {
        // Node.js 资源监控
        // 动态导入以避免 ESM 模块中的 require 问题
        import('os').then(os => {
            const config = this.resourceMonitorConfig;
            if (!config) return;

            const cpuUsage = 0.5; // 简化实现
            const memoryUsage = (os.totalmem() - os.freemem()) / os.totalmem();

            const cpuThreshold = config.cpuThreshold || 0.8;
            const memoryThreshold = config.memoryThreshold || 0.8;

            this.resourceStatus = {
                cpuUsage,
                memoryUsage,
                isHighLoad: cpuUsage > cpuThreshold || memoryUsage > memoryThreshold,
                timestamp: Date.now()
            };

            this.options?.onResourceChange?.(this.resourceStatus);
        }).catch(() => {
            // 忽略错误
        });
    }

    private cleanup(): void {
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
            this.resourceMonitorInterval = null;
        }
    }

    // ============== 工具方法 ==============

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        const timeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Task timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        return Promise.race([promise, timeout]);
    }

    private calculateStats(): ExecutionStats {
        const successfulResults = this.results.filter(r => r?.success);
        const failedResults = this.results.filter(r => r && !r.success);
        const totalDuration = this.results.reduce((sum, r) => sum + (r?.duration || 0), 0);

        return {
            total: this.results.length,
            success: successfulResults.length,
            failed: failedResults.length,
            totalDuration,
            averageDuration: this.results.length > 0 ? totalDuration / this.results.length : 0,
            currentConcurrency: this.currentConcurrency,
            errorRate: this.results.length > 0 ? failedResults.length / this.results.length : 0,
            adjustmentCount: this.adjustmentCount,
            circuitBreakerTripped: this.circuitBreakerTripped,
            queueTimeouts: this.queueTimeoutCount,
            resourceDowngradeCount: this.resourceDowngradeCount
        };
    }
}

/**
 * 智能信号量
 */
class IntelligentSemaphore {
    private queue: Array<() => void> = [];
    private available: number;
    private maxConcurrency: number;
    private onConcurrencyChange?: (current: number, reason: string) => void;
    private aborted: boolean = false;
    private releaseCallbacks: Array<() => void> = [];

    constructor(concurrency: number, onConcurrencyChange?: (current: number, reason: string) => void) {
        this.available = concurrency;
        this.maxConcurrency = concurrency;
        this.onConcurrencyChange = onConcurrencyChange;
    }

    async acquire(): Promise<void> {
        if (this.aborted) {
            throw new Error('Semaphore aborted');
        }

        if (this.available > 0) {
            this.available--;
            return;
        }

        return new Promise<void>((resolve, reject) => {
            if (this.aborted) {
                reject(new Error('Semaphore aborted'));
                return;
            }
            this.queue.push(resolve);
        });
    }

    release(): void {
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next?.();
        } else {
            this.available++;
        }

        // 通知释放事件
        this.releaseCallbacks.forEach(cb => cb());
    }

    adjustConcurrency(newConcurrency: number, reason: string): void {
        const oldConcurrency = this.maxConcurrency;
        this.maxConcurrency = newConcurrency;

        if (newConcurrency < oldConcurrency) {
            this.available = Math.min(this.available, newConcurrency);
        } else if (newConcurrency > oldConcurrency) {
            const additional = newConcurrency - oldConcurrency;
            this.available += additional;

            while (this.queue.length > 0 && this.available > 0) {
                const next = this.queue.shift();
                if (next) {
                    this.available--;
                    next();
                }
            }
        }

        this.onConcurrencyChange?.(newConcurrency, reason);
    }

    onRelease(callback: () => void): void {
        this.releaseCallbacks.push(callback);
    }

    abort(): void {
        this.aborted = true;
        this.queue.forEach(resolve => resolve());
        this.queue = [];
    }
}

/**
 * 便捷函数
 */
export async function taskLimiter(tasks: TaskInput[], concurrency: number): Promise<ExecutionResult[]> {
    const controller = new EnterpriseConcurrentController();
    const { results } = await controller.execute(tasks, { concurrency });
    return results;
}

export default taskLimiter;
