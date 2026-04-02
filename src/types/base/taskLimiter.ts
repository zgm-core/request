/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ConcurrentTask {
    (): Promise<any>;
}

/**
 * 优先级级别
 */
export enum PriorityLevel {
    CRITICAL = 0,  // 支付、登录 - 最高优先级
    HIGH = 1,      // 核心业务
    MEDIUM = 2,    // 普通业务
    LOW = 3        // 埋点、统计 - 最低优先级
}

export interface TaskWithPriority {
    task: ConcurrentTask;
    priority?: PriorityLevel | number;
    /** 超时降级回调（低优先级任务超时时调用） */
    onTimeout?: () => any;
    /** 标识URL用于故障隔离 */
    url?: string;
}

export type TaskInput = ConcurrentTask | TaskWithPriority;

export interface ExecutionResult {
    success: boolean;
    data?: any;
    error?: any;
    duration: number;
    /** 是否使用了降级数据 */
    fallbackUsed?: boolean;
}

/**
 * 动态并发控制配置
 */
export interface DynamicConcurrencyConfig {
    /** 是否启用动态并发控制 */
    enabled?: boolean;

    /** 最小并发数 */
    minConcurrency?: number;

    /** 最大并发数 */
    maxConcurrency?: number;

    /** 错误率阈值，超过此值降低并发（0-1） */
    errorRateThreshold?: number;

    /** 平均响应时间阈值（毫秒），超过此值降低并发 */
    responseTimeThreshold?: number;

    /** 调整间隔（执行多少个任务后评估一次） */
    adjustmentInterval?: number;

    /** 调整幅度，每次调整的并发数 */
    adjustmentStep?: number;
}

/**
 * 智能队列配置
 */
export interface SmartQueueConfig {
    /** 是否启用智能队列 */
    enabled?: boolean;

    /** 排队超时时间（毫秒） */
    queueTimeout?: number;

    /** 队列最大长度 */
    maxQueueLength?: number;

    /** 队列满时的行为 */
    queueFullAction?: 'reject' | 'drop_low_priority' | 'dequeue_oldest';

    /** 队列超时时降级 */
    enableQueueFallback?: boolean;

    /** 队列超时回调 */
    onQueueTimeout?: (task: QueuedTask) => void;
}

/**
 * 排队任务
 */
export interface QueuedTask {
    task: ConcurrentTask;
    priority: PriorityLevel;
    enqueueTime: number;
    url?: string;
    resolve?: (value: any) => void;
    reject?: (reason?: any) => void;
    onTimeout?: () => any;
    index?: number;  // 原始任务索引
    timeoutId?: ReturnType<typeof setTimeout>;  // 超时定时器ID，用于清理
}

/**
 * 熔断器状态
 */
export enum CircuitBreakerState {
    CLOSED = 'CLOSED',      // 正常状态
    OPEN = 'OPEN',          // 熔断状态
    HALF_OPEN = 'HALF_OPEN' // 半开状态（探测中）
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
    /** 是否启用熔断器 */
    enabled?: boolean;

    /** 失败率阈值（0-1） */
    failureThreshold?: number;

    /** 熔断后恢复探测间隔（毫秒） */
    recoveryTimeout?: number;

    /** 半开状态最大调用数 */
    halfOpenMaxCalls?: number;

    /** 最小请求数才计算失败率 */
    minRequests?: number;
}

/**
 * 接口统计信息
 */
export interface EndpointStats {
    url: string;
    domain: string;
    totalRequests: number;
    successCount: number;
    failedCount: number;
    failureRate: number;
    avgResponseTime: number;
    lastRequestTime: number;
    lastFailureTime: number;
    circuitState: CircuitBreakerState;
    circuitOpenTime?: number;
    currentConcurrency: number;
}

/**
 * 资源监控配置
 */
export interface ResourceMonitorConfig {
    /** 是否启用资源监控 */
    enabled?: boolean;

    /** CPU使用率阈值（0-1） */
    cpuThreshold?: number;

    /** 内存使用率阈值（0-1） */
    memoryThreshold?: number;

    /** 资源监控间隔（毫秒） */
    monitorInterval?: number;
}

/**
 * 资源状态
 */
export interface ResourceStatus {
    cpuUsage: number;
    memoryUsage: number;
    isHighLoad: boolean;
    timestamp: number;
}

/**
 * 并发执行任务选项
 */
export interface ConcurrentOptions {
    concurrency: number;
    failFast?: boolean;
    taskTimeout?: number;
    onProgress?: (completed: number, total: number) => void;

    /** 动态并发控制配置 */
    dynamicConcurrency?: DynamicConcurrencyConfig;

    /** 智能队列配置 */
    smartQueue?: SmartQueueConfig;

    /** 熔断器配置 */
    circuitBreaker?: CircuitBreakerConfig;

    /** 资源监控配置 */
    resourceMonitor?: ResourceMonitorConfig;

    /** 并发数变化回调 */
    onConcurrencyChange?: (current: number, reason: string) => void;

    /** 熔断器状态变化回调 */
    onCircuitBreakerChange?: (url: string, state: CircuitBreakerState, reason: string) => void;

    /** 资源状态变化回调 */
    onResourceChange?: (status: ResourceStatus) => void;
}

export interface ExecutionStats {
    total: number;
    success: number;
    failed: number;
    totalDuration: number;
    averageDuration: number;

    /** 当前并发数 */
    currentConcurrency?: number;

    /** 错误率 */
    errorRate?: number;

    /** 并发调整次数 */
    adjustmentCount?: number;

    /** 熔断器触发次数 */
    circuitBreakerTripped?: number;

    /** 队列超时次数 */
    queueTimeouts?: number;

    /** 资源降级次数 */
    resourceDowngradeCount?: number;
}
