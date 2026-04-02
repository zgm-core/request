/**
 * Default configuration constants
 * Centralized management of all default configuration values
 */

import { GlobalConfig } from '../types/base';

export const DEFAULT_TIMEOUT = 300000; // 5分钟

export const DEFAULT_RETRY_CONFIG = {
    enabled: true,
    retries: 3,
    shouldResetTimeout: true
};

export const DEFAULT_CANCEL_CONFIG = {
    enabled: true,
    cancelTarget: 'current' as const
};

export const DEFAULT_CACHE_CONFIG = {
    enabled: false,
    defaultTTL: 5 * 60 * 1000,
    maxSize: 5 * 1024 * 1024,
    storageType: 'memory' as const
};

export const DEFAULT_HEADERS = {
    'Content-Type': 'application/json'
};

/**
 * Default global configuration
 * 注意：默认值应与 config-validator.ts 中的 Schema 默认值保持一致
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
    env: 'test',
    baseURL: '',
    timeout: DEFAULT_TIMEOUT,
    proxy: false,
    headers: DEFAULT_HEADERS,
    defaultTransformData: true,
    retryConfig: DEFAULT_RETRY_CONFIG,
    requestCancel: DEFAULT_CANCEL_CONFIG,
    logLevel: 'error'
};

/**
 * WebSocket default configuration
 */
export const DEFAULT_WEBSOCKET_CONFIG = {
    reconnect: {
        enabled: true,
        maxAttempts: 5,
        interval: 1000,
        exponentialBackoff: true
    },
    heartbeat: {
        enabled: true,
        interval: 30000,
        message: 'ping',
        timeout: 5000
    },
    messageQueue: {
        enabled: true,
        maxQueueSize: 100,
        flushOnConnect: true
    }
};

/**
 * Concurrent control default configuration
 */
export const DEFAULT_CONCURRENT_CONFIG = {
    concurrency: 5,
    failFast: false,
    timeout: 60000
};