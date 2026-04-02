import { configManager } from './core/config-manager';
import { BaseRequest } from './core/base-request';
import { GlobalConfig, DeepPartial } from './types/base';
import { validateCoreConfig } from './utils';

// Core modules
import {
    SerialRequestController,
    createPipeline,
    IdempotentHandler,
    EnterpriseWebSocket,
    EnterpriseConcurrentController,
    BatchRequestHandler,
    requestDedup,
    createUrlThrottle,
    PerformanceMonitor
} from './core/index';

// Types
import type { WebSocketConfig } from './types/base';
import type { PerformanceMonitorConfig } from './core/performance-monitor';
import type { IdempotentConfig } from './core/idempotent-handler';
import type { BatchRequestConfig } from './core/batch-request';

// 默认实例
const httpClient = new BaseRequest();

/**
 * 企业级 HTTP 请求库
 * 
 * @example
 * import { $http } from '@zgm-core/request';
 * 
 * // 基础请求
 * $http.get('/api/users');
 * $http.post('/api/users', { name: 'John' });
 * 
 * // 全局配置
 * $http.configure({ baseURL: 'https://api.example.com' });
 * 
 * // WebSocket
 * const ws = $http.ws({ url: 'wss://api.example.com/ws' });
 * 
 * // 并发控制
 * const ctrl = $http.concurrent();
 * const result = await ctrl.execute(tasks, { concurrency: 5 });
 */
const $http = {
    // ===== 基础请求 =====
    get: httpClient.get.bind(httpClient),
    post: httpClient.post.bind(httpClient),
    put: httpClient.put.bind(httpClient),
    delete: httpClient.delete.bind(httpClient),
    patch: httpClient.patch.bind(httpClient),

    // ===== 全局配置 =====
    configure(userConfig: DeepPartial<GlobalConfig>): void {
        const validatedConfig = validateCoreConfig(userConfig);
        configManager.setGlobalConfig(validatedConfig as DeepPartial<GlobalConfig>);
    },

    // ===== WebSocket =====
    ws(config: WebSocketConfig) {
        return new EnterpriseWebSocket(config);
    },

    // ===== 并发控制 =====
    concurrent() {
        return new EnterpriseConcurrentController();
    },

    // ===== 批量请求 =====
    batch(config?: BatchRequestConfig) {
        return new BatchRequestHandler(httpClient, config);
    },

    // ===== 串行请求 =====
    serial() {
        return new SerialRequestController();
    },

    // ===== 管道请求 =====
    pipeline: createPipeline,

    // ===== 去重 =====
    dedup: requestDedup,

    // ===== 节流 =====
    throttle: createUrlThrottle,

    // ===== 幂等性 =====
    idempotent(config?: IdempotentConfig) {
        return new IdempotentHandler(config);
    },

    // ===== 性能监控 =====
    monitor(config?: PerformanceMonitorConfig) {
        return new PerformanceMonitor(config);
    }
};

// 类型导出（用户配置时需要）
export type { GlobalConfig, IResponseData } from './types/base';

// 命名导出
export { $http };
