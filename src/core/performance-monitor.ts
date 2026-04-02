import { logger } from '../utils/logger';

/**
 * 性能指标
 */
export interface PerformanceMetrics {
    /** 总请求数 */
    totalRequests: number;
    /** 成功请求数 */
    successRequests: number;
    /** 失败请求数 */
    failedRequests: number;
    /** 平均响应时间 */
    averageDuration: number;
    /** P50 响应时间 */
    p50Duration: number;
    /** P90 响应时间 */
    p90Duration: number;
    /** P99 响应时间 */
    p99Duration: number;
    /** 最小响应时间 */
    minDuration: number;
    /** 最大响应时间 */
    maxDuration: number;
    /** 扩展字段 */
    [key: string]: unknown;
}

/**
 * 请求记录
 */
export interface RequestRecord {
    /** URL */
    url: string;
    /** 方法 */
    method: string;
    /** 是否成功 */
    success: boolean;
    /** 耗时 */
    duration: number;
    /** 时间戳 */
    timestamp: number;
    /** 状态码 */
    status?: number;
}

/**
 * 性能监控配置
 */
export interface PerformanceMonitorConfig {
    /** 是否启用 */
    enabled?: boolean;
    /** 最大记录数 */
    maxRecords?: number;
    /** 统计窗口（毫秒） */
    windowMs?: number;
    /** 自动上报间隔（毫秒） */
    reportInterval?: number;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
    private records: RequestRecord[] = [];
    private config: Required<PerformanceMonitorConfig>;
    private reportTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config: PerformanceMonitorConfig = {}) {
        this.config = {
            enabled: config.enabled ?? true,
            maxRecords: config.maxRecords || 1000,
            windowMs: config.windowMs || 60000, // 默认 1 分钟
            reportInterval: config.reportInterval || 0
        };

        if (this.config.reportInterval > 0) {
            this.startAutoReport();
        }
    }

    /**
     * 记录请求
     */
    public record(
        url: string,
        method: string,
        success: boolean,
        duration: number,
        status?: number
    ): void {
        if (!this.config.enabled) {
            return;
        }

        const record: RequestRecord = {
            url,
            method,
            success,
            duration,
            timestamp: Date.now(),
            status
        };

        this.records.push(record);

        // 限制记录数量
        if (this.records.length > this.config.maxRecords) {
            this.records = this.records.slice(-this.config.maxRecords);
        }

        logger.debug('performance.record', {
            url,
            method,
            success,
            duration
        });
    }

    /**
     * 获取性能指标
     */
    public getMetrics(): PerformanceMetrics {
        const records = this.getRecentRecords();

        if (records.length === 0) {
            return {
                totalRequests: 0,
                successRequests: 0,
                failedRequests: 0,
                averageDuration: 0,
                p50Duration: 0,
                p90Duration: 0,
                p99Duration: 0,
                minDuration: 0,
                maxDuration: 0
            };
        }

        const successRecords = records.filter(r => r.success);
        const failedRecords = records.filter(r => !r.success);
        const durations = successRecords.map(r => r.duration).sort((a, b) => a - b);

        const totalRequests = records.length;
        const successRequests = successRecords.length;
        const failedRequests = failedRecords.length;

        const averageDuration =
            successRequests > 0
                ? durations.reduce((sum, d) => sum + d, 0) / successRequests
                : 0;

        const p50Duration = this.getPercentile(durations, 50);
        const p90Duration = this.getPercentile(durations, 90);
        const p99Duration = this.getPercentile(durations, 99);

        return {
            totalRequests,
            successRequests,
            failedRequests,
            averageDuration,
            p50Duration,
            p90Duration,
            p99Duration,
            minDuration: durations[0] || 0,
            maxDuration: durations[durations.length - 1] || 0
        };
    }

    /**
     * 获取最近的记录
     */
    private getRecentRecords(): RequestRecord[] {
        const now = Date.now();
        return this.records.filter(r => now - r.timestamp < this.config.windowMs);
    }

    /**
     * 获取百分位数
     */
    private getPercentile(sortedArray: number[], percentile: number): number {
        if (sortedArray.length === 0) {
            return 0;
        }
        const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
        return sortedArray[index] || 0;
    }

    /**
     * 获取按 URL 分组的指标
     */
    public getMetricsByUrl(): Map<string, PerformanceMetrics> {
        const urlGroups = new Map<string, RequestRecord[]>();

        for (const record of this.records) {
            const url = record.url;
            if (!urlGroups.has(url)) {
                urlGroups.set(url, []);
            }
            urlGroups.get(url)!.push(record);
        }

        const result = new Map<string, PerformanceMetrics>();

        for (const [url, records] of urlGroups) {
            result.set(url, this.calculateMetrics(records));
        }

        return result;
    }

    /**
     * 计算指标
     */
    private calculateMetrics(records: RequestRecord[]): PerformanceMetrics {
        const successRecords = records.filter(r => r.success);
        const durations = successRecords.map(r => r.duration).sort((a, b) => a - b);

        const totalRequests = records.length;
        const successRequests = successRecords.length;
        const failedRequests = totalRequests - successRequests;

        const averageDuration =
            successRequests > 0
                ? durations.reduce((sum, d) => sum + d, 0) / successRequests
                : 0;

        return {
            totalRequests,
            successRequests,
            failedRequests,
            averageDuration,
            p50Duration: this.getPercentile(durations, 50),
            p90Duration: this.getPercentile(durations, 90),
            p99Duration: this.getPercentile(durations, 99),
            minDuration: durations[0] || 0,
            maxDuration: durations[durations.length - 1] || 0
        };
    }

    /**
     * 清空记录
     */
    public clear(): void {
        this.records = [];
        logger.debug('performance.cleared');
    }

    /**
     * 开始自动上报
     */
    private startAutoReport(): void {
        if (this.reportTimer) {
            return;
        }

        this.reportTimer = setInterval(() => {
            const metrics = this.getMetrics();
            logger.info('performance.report', metrics);
        }, this.config.reportInterval);

        logger.debug('performance.autoReport.started', {
            interval: this.config.reportInterval
        });
    }

    /**
     * 停止自动上报
     */
    public stopAutoReport(): void {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
            logger.debug('performance.autoReport.stopped');
        }
    }

    /**
     * 更新配置
     */
    public updateConfig(config: Partial<PerformanceMonitorConfig>): void {
        const oldInterval = this.config.reportInterval;
        this.config = { ...this.config, ...config };

        // 如果上报间隔改变，重启自动上报
        if (this.config.reportInterval !== oldInterval) {
            this.stopAutoReport();
            if (this.config.reportInterval > 0) {
                this.startAutoReport();
            }
        }
    }

    /**
     * 导出数据
     */
    public export(): {
        records: RequestRecord[];
        metrics: PerformanceMetrics;
        metricsByUrl: Record<string, PerformanceMetrics>;
    } {
        const metricsByUrl = this.getMetricsByUrl();
        const metricsByUrlObj: Record<string, PerformanceMetrics> = {};

        for (const [url, metrics] of metricsByUrl) {
            metricsByUrlObj[url] = metrics;
        }

        return {
            records: [...this.records],
            metrics: this.getMetrics(),
            metricsByUrl: metricsByUrlObj
        };
    }
}

// 创建全局性能监控实例
const globalMonitor = new PerformanceMonitor();

// 导出便捷函数
export const performance = {
    /**
     * 记录请求
     */
    record: (
        url: string,
        method: string,
        success: boolean,
        duration: number,
        status?: number
    ) => globalMonitor.record(url, method, success, duration, status),

    /**
     * 获取指标
     */
    getMetrics: () => globalMonitor.getMetrics(),

    /**
     * 获取按 URL 分组的指标
     */
    getMetricsByUrl: () => globalMonitor.getMetricsByUrl(),

    /**
     * 清空记录
     */
    clear: () => globalMonitor.clear(),

    /**
     * 更新配置
     */
    updateConfig: (config: Partial<PerformanceMonitorConfig>) =>
        globalMonitor.updateConfig(config),

  /**
   * 导出数据
   */
  export: () => globalMonitor.export()
};
