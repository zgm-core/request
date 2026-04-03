import { z } from 'zod';

// ==================== 基础枚举类型 ====================

const EnvironmentSchema = z.enum(['development', 'production', 'test', 'preview', 'release', 'staging']);
const CancelTargetSchema = z.enum(['current', 'previous']);

// ==================== 子配置 Schema ====================

const RetryConfigSchema = z
    .object({
        enabled: z.boolean().default(true),
        retries: z.number().int().min(0).default(3),
        shouldResetTimeout: z.boolean().default(true)
    })
    .optional();

const RequestCancelConfigSchema = z
    .object({
        enabled: z.boolean().default(true),
        cancelTarget: CancelTargetSchema
    })
    .optional();

const CacheConfigSchema = z
    .object({
        enabled: z.boolean().default(false),
        defaultTTL: z.number().default(5 * 60 * 1000),
        maxSize: z.number().default(5 * 1024 * 1024),
        storageType: z.enum(['memory', 'localStorage', 'sessionStorage']).default('memory'),
        https: z.boolean().optional()
    })
    .optional();

const IdempotentConfigSchema = z
    .object({
        enabled: z.boolean().default(false),
        ttl: z.number().default(60000),
        storage: z.enum(['memory', 'localStorage', 'sessionStorage']).default('memory')
    })
    .optional();

const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug']).optional();

const InterceptorsSchema = z
    .object({
        request: z.function().optional(),
        response: z.function().optional(),
        error: z.function().optional()
    })
    .optional();

const TransitionalSchema = z
    .object({
        silentJSONParsing: z.boolean().optional(),
        forcedJSONParsing: z.boolean().optional(),
        clarifyTimeoutError: z.boolean().optional()
    })
    .optional();

// ==================== 核心配置 Schema ====================

export const GlobalConfigSchema = z.object({
    // GlobalConfig 自身字段
    env: EnvironmentSchema.default('test'),
    interceptors: InterceptorsSchema,
    defaultTransformData: z.boolean().optional(),
    requestCancel: RequestCancelConfigSchema,
    idempotent: IdempotentConfigSchema,
    enablePerformanceMonitor: z.boolean().optional(),
    logLevel: LogLevelSchema,

    // BaseRequestConfig 字段
    baseURL: z.string().optional().default(''),
    timeout: z.number().min(0).optional().default(5000 * 60),
    headers: z.record(z.unknown()).optional().default({}),
    withCredentials: z.boolean().optional(),
    adapter: z.unknown().optional(),
    responseType: z.enum(['arraybuffer', 'blob', 'document', 'json', 'text', 'stream']).optional(),
    responseEncoding: z.string().optional(),
    validateStatus: z.function().optional(),
    paramsSerializer: z.function().optional(),
    maxRedirects: z.number().optional(),
    maxContentLength: z.number().optional(),
    maxBodyLength: z.number().optional(),
    transitional: TransitionalSchema,
    transformData: z.boolean().optional(),

    // RequestOptions 字段
    cache: CacheConfigSchema,
    retryConfig: RetryConfigSchema,
    cancel: z
        .object({
            enabled: z.boolean().optional(),
            key: z.string().optional()
        })
        .optional(),
    enableTiming: z.boolean().optional(),
    skipAuth: z.boolean().optional(),
    skipTransform: z.boolean().optional()
});

// ==================== 类型推断 ====================

/** 全局配置类型 */
export type ValidatedGlobalConfig = z.infer<typeof GlobalConfigSchema>;

/** 重试配置类型 */
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

// 兼容旧名称
export const CoreConfigSchema = GlobalConfigSchema;
export type CoreConfig = ValidatedGlobalConfig;

// ==================== 验证函数 ====================

/**
 * 验证核心配置 - 只验证指定的字段
 */
export function validateCoreConfig(config: unknown): CoreConfig {
    const result = CoreConfigSchema.safeParse(config);

    if (!result.success) {
        const issues = result.error.issues ?? [];
        
        const errorDetails = issues
            .map(issue => {
                const path = issue.path?.join('.') || '根级别';
                let message = `字段 "${path}": ${issue.message}`;

                if (issue.code === 'invalid_type') {
                    message += `; 期望类型: ${issue.expected}`;
                }

                return message;
            })
            .join('\n');

        throw new Error(`用户配置错误:${errorDetails || JSON.stringify(issues)}`);
    }

    return result.data;
}

/**
 * 安全验证核心配置 - 不抛出异常
 */
export function safeValidateCoreConfig(config: unknown): {
    success: boolean;
    data?: CoreConfig;
    errors?: string[];
} {
    const result = CoreConfigSchema.safeParse(config);

    if (!result.success) {
        const issues = result.error.issues ?? [];
        
        return {
            success: false,
            errors: issues.map(issue => `${issue.path?.join('.') || '根级别'}: ${issue.message}`)
        };
    }

    return {
        success: true,
        data: result.data
    };
}

// ==================== 工具函数 ====================

/**
 * 创建默认核心配置
 */
export function createDefaultCoreConfig(): CoreConfig {
    return validateCoreConfig({});
}

/**
 * 创建你指定的精确配置
 */
export function createExactConfig(): CoreConfig {
    return validateCoreConfig({
        env: 'test',
        baseURL: 'http://api.example.com',
        timeout: 5000 * 60,
        headers: {
            'Content-Type': 'application/json'
        },
        defaultTransformData: true,
        retryConfig: {
            enabled: true,
            retries: 3,
            shouldResetTimeout: true
        },
        requestCancel: {
            enabled: true,
            cancelTarget: 'current'
        }
    });
}

/**
 * 创建最小配置 - 只包含必需字段
 */
export function createMinimalConfig(baseURL: string): CoreConfig {
    return validateCoreConfig({
        baseURL,
        env: 'test'
    });
}

// ==================== 配置常量 ====================