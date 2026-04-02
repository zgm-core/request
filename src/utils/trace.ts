/**
 * 请求追踪工具
 * 用于生成和管理 Trace ID，实现分布式追踪
 */

/**
 * Trace 上下文
 */
export interface TraceContext {
    /** Trace ID - 全局唯一标识 */
    traceId: string;
    /** 父 Span ID */
    parentSpanId?: string;
    /** Span ID - 当前操作标识 */
    spanId: string;
    /** 开始时间 */
    startTime: number;
    /** 标签 */
    tags?: Record<string, string | number | boolean>;
}

/**
 * Trace 配置
 */
export interface TraceConfig {
    /** 是否启用追踪 */
    enabled?: boolean;
    /** 是否在请求头中传递 Trace ID */
    includeInHeaders?: boolean;
    /** 请求头中的 Trace ID 字段名 */
    traceIdHeader?: string;
    /** 请求头中的 Span ID 字段名 */
    spanIdHeader?: string;
}

/**
 * Trace Manager 类
 */
class TraceManager {
    private config: TraceConfig = {
        enabled: true,
        includeInHeaders: true,
        traceIdHeader: 'X-Trace-Id',
        spanIdHeader: 'X-Span-Id'
    };

    private currentTrace: TraceContext | null = null;

    /**
     * 设置配置
     */
    public setConfig(config: Partial<TraceConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 生成 Trace ID
     */
    public generateTraceId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}-${random}`;
    }

    /**
     * 生成 Span ID
     */
    public generateSpanId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * 开始一个新的 Trace
     */
    public startTrace(tags?: Record<string, string | number | boolean>): TraceContext {
        const traceContext: TraceContext = {
            traceId: this.generateTraceId(),
            spanId: this.generateSpanId(),
            startTime: Date.now(),
            ...(tags && { tags })
        };

        this.currentTrace = traceContext;
        return traceContext;
    }

    /**
     * 创建子 Span
     */
    public startSpan(parentSpanId?: string): TraceContext | null {
        if (!this.currentTrace) {
            return null;
        }

        const spanContext: TraceContext = {
            traceId: this.currentTrace.traceId,
            parentSpanId: parentSpanId || this.currentTrace.spanId,
            spanId: this.generateSpanId(),
            startTime: Date.now()
        };

        return spanContext;
    }

    /**
     * 结束当前 Trace
     */
    public endTrace(): number {
        if (!this.currentTrace) {
            return 0;
        }

        const duration = Date.now() - this.currentTrace.startTime;
        this.currentTrace = null;
        return duration;
    }

    /**
     * 获取当前 Trace
     */
    public getCurrentTrace(): TraceContext | null {
        return this.currentTrace;
    }

    /**
     * 设置当前 Trace（用于从外部恢复）
     */
    public setCurrentTrace(trace: TraceContext): void {
        this.currentTrace = trace;
    }

    /**
     * 从请求头中提取 Trace 信息
     */
    public extractFromHeaders(headers: Record<string, string>): TraceContext | null {
        if (!this.config.enabled) {
            return null;
        }

        const traceId = headers[this.config.traceIdHeader!];
        const spanId = headers[this.config.spanIdHeader!];

        if (!traceId) {
            return null;
        }

        return {
            traceId,
            spanId: this.generateSpanId(),
            startTime: Date.now(),
            ...(spanId && { parentSpanId: spanId })
        };
    }

    /**
     * 将 Trace 信息注入到请求头
     */
    public injectToHeaders(headers: Record<string, string>): Record<string, string> {
        if (!this.config.enabled || !this.currentTrace) {
            return headers;
        }

        const newHeaders = { ...headers };
        if (this.config.includeInHeaders) {
            newHeaders[this.config.traceIdHeader!] = this.currentTrace.traceId;
            newHeaders[this.config.spanIdHeader!] = this.currentTrace.spanId;
        }

        return newHeaders;
    }

    /**
     * 添加标签
     */
    public addTags(tags: Record<string, string | number | boolean>): void {
        if (!this.currentTrace) {
            return;
        }

        this.currentTrace.tags = {
            ...this.currentTrace.tags,
            ...tags
        };
    }

    /**
     * 获取 Trace 信息字符串
     */
    public getTraceInfo(): string {
        if (!this.currentTrace) {
            return 'no-trace';
        }

        const { traceId, spanId, parentSpanId } = this.currentTrace;
        return parentSpanId ? `${traceId}:${spanId}:${parentSpanId}` : `${traceId}:${spanId}`;
    }
}

// 创建 Trace Manager 单例
const traceManager = new TraceManager();

// 导出便捷函数
export const trace = {
    /** 设置配置 */
    setConfig: (config: Partial<TraceConfig>) => traceManager.setConfig(config),
    /** 生成 Trace ID */
    generateTraceId: () => traceManager.generateTraceId(),
    /** 开始 Trace */
    startTrace: (tags?: Record<string, string | number | boolean>) => traceManager.startTrace(tags),
    /** 开始 Span */
    startSpan: (parentSpanId?: string) => traceManager.startSpan(parentSpanId),
    /** 结束 Trace */
    endTrace: () => traceManager.endTrace(),
    /** 获取当前 Trace */
    getCurrentTrace: () => traceManager.getCurrentTrace(),
    /** 设置当前 Trace */
    setCurrentTrace: (trace: TraceContext) => traceManager.setCurrentTrace(trace),
    /** 从请求头提取 */
    extractFromHeaders: (headers: Record<string, string>) => traceManager.extractFromHeaders(headers),
    /** 注入到请求头 */
    injectToHeaders: (headers: Record<string, string>) => traceManager.injectToHeaders(headers),
    /** 添加标签 */
    addTags: (tags: Record<string, string | number | boolean>) => traceManager.addTags(tags),
    /** 获取 Trace 信息 */
    getTraceInfo: () => traceManager.getTraceInfo()
};

export { traceManager, TraceManager };
