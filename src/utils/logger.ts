import { isDevelopment } from './env';

/**
 * 日志级别枚举
 */
export enum LogLevel {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug'
}

/**
 * 日志上下文信息
 */
export interface LogContext {
    traceId?: string;
    url?: string;
    method?: string;
    status?: number;
    duration?: number;
    error?: Error | string;
    [key: string]: unknown;
}

/**
 * 日志条目
 */
export interface LogEntry {
    level: LogLevel;
    message: string;
    context?: LogContext;
    timestamp: number;
}

/**
 * 日志上报处理器
 */
export type LogHandler = (entry: LogEntry) => void | Promise<void>;

/**
 * Logger 类
 */
class Logger {
    private level: LogLevel = LogLevel.DEBUG;
    private handlers: LogHandler[] = [];
    private enabled: boolean = true;

    /**
     * 设置日志级别
     */
    public setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * 启用/禁用日志
     */
    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * 添加日志处理器
     */
    public addHandler(handler: LogHandler): () => void {
        this.handlers.push(handler);
        return () => {
            const index = this.handlers.indexOf(handler);
            if (index !== -1) {
                this.handlers.splice(index, 1);
            }
        };
    }

    /**
     * 生成 Trace ID
     */
    private generateTraceId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * 格式化日志
     */
    private formatLog(level: LogLevel, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        const ctxStr = context ? ` ${JSON.stringify(context)}` : '';
        return `${prefix} ${message}${ctxStr}`;
    }

    /**
     * 执行日志处理器
     */
    private async executeHandlers(entry: LogEntry): Promise<void> {
        for (const handler of this.handlers) {
            try {
                await handler(entry);
            } catch (error) {
                console.error('Log handler error:', error);
            }
        }
    }

    /**
     * 检查日志级别是否应该输出
     */
    private shouldLog(level: LogLevel): boolean {
        if (!this.enabled || !isDevelopment()) {
            return false;
        }
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    /**
     * 记录日志
     */
    private log(level: LogLevel, message: string, context?: LogContext): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const traceId = context?.traceId || this.generateTraceId();
        const enrichedContext = { ...context, traceId };
        const entry: LogEntry = {
            level,
            message,
            context: enrichedContext,
            timestamp: Date.now()
        };

        // 输出到控制台
        const formattedLog = this.formatLog(level, message, enrichedContext);
        switch (level) {
            case LogLevel.ERROR:
                console.error(formattedLog);
                break;
            case LogLevel.WARN:
                console.warn(formattedLog);
                break;
            case LogLevel.INFO:
                console.info(formattedLog);
                break;
            case LogLevel.DEBUG:
                console.log(formattedLog);
                break;
        }

        // 执行日志处理器
        this.executeHandlers(entry);
    }

    /**
     * Error 级别日志
     */
    public error(message: string, context?: LogContext): void {
        this.log(LogLevel.ERROR, message, context);
    }

    /**
     * Warn 级别日志
     */
    public warn(message: string, context?: LogContext): void {
        this.log(LogLevel.WARN, message, context);
    }

    /**
     * Info 级别日志
     */
    public info(message: string, context?: LogContext): void {
        this.log(LogLevel.INFO, message, context);
    }

    /**
     * Debug 级别日志
     */
    public debug(message: string, context?: LogContext): void {
        this.log(LogLevel.DEBUG, message, context);
    }

    /**
     * 请求开始日志
     */
    public requestStart(config: { url: string; method: string; [key: string]: unknown }): void {
        this.info('request.start', {
            url: config.url,
            method: config.method,
            ...this.omitSensitive(config)
        });
    }

    /**
     * 请求成功日志
     */
    public requestSuccess(config: { url: string; method: string; [key: string]: unknown }, response: { status: number; [key: string]: unknown }, duration: number): void {
        this.info('request.success', {
            url: config.url,
            method: config.method,
            status: response.status,
            duration
        });
    }

    /**
     * 请求失败日志
     */
    public requestFailed(config: { url: string; method: string; [key: string]: unknown }, error: Error, duration: number): void {
        this.error('request.failed', {
            url: config.url,
            method: config.method,
            error: error.message,
            duration
        });
    }

    /**
     * 过滤敏感信息
     */
    private omitSensitive(obj: Record<string, unknown>): Record<string, unknown> {
        const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'apiKey'];
        const result: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(obj)) {
            if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
                result[key] = '***';
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.omitSensitive(value as Record<string, unknown>);
            } else {
                result[key] = value;
            }
        }

        return result;
    }
}

// 创建 logger 单例
const logger = new Logger();

/**
 * Safe log function, only outputs in development environment
 * 简单的日志函数，仅在开发环境输出
 */
export function safeLog(...args: unknown[]): void {
    if (isDevelopment()) {
        console.log(...args);
    }
}

/**
 * Safe error log function, only outputs in development environment
 * 简单的错误日志函数，仅在开发环境输出
 */
export function safeError(...args: unknown[]): void {
    if (isDevelopment()) {
        console.error(...args);
    }
}

/**
 * Safe warning log function, only outputs in development environment
 * 简单的警告日志函数，仅在开发环境输出
 */
export function safeWarn(...args: unknown[]): void {
    if (isDevelopment()) {
        console.warn(...args);
    }
}

/**
 * Safe info log function, only outputs in development environment
 * 简单的信息日志函数，仅在开发环境输出
 */
export function safeInfo(...args: unknown[]): void {
    if (isDevelopment()) {
        console.info(...args);
    }
}

export { logger, Logger };