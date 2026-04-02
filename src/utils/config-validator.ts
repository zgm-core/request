import { z } from 'zod';

// ==================== 基础枚举类型 ====================

/** 环境类型定义 */
const EnvironmentSchema = z.enum(['development', 'production', 'test', 'preview', 'release', 'staging']);
const CancelTargetSchema = z.enum(['current', 'previous']);

// ==================== 重试配置 Schema ====================

/** 重试功能配置 Schema - 只包含需要的字段 */
const RetryConfigSchema = z.object({
    enabled: z.boolean().default(true),
    retries: z.number().int().min(0).default(3),
    shouldResetTimeout: z.boolean().default(true)
});

const RequestCancelConfigSchema = z
    .object({
        enabled: z.boolean().default(true),
        cancelTarget: CancelTargetSchema
    })
    .optional();

/** 缓存配置 Schema */
const CacheConfigSchema = z.object({
    enabled: z.boolean().default(false),
    defaultTTL: z.number().default(5 * 60 * 1000),
    maxSize: z.number().default(5 * 1024 * 1024),
    storageType: z.enum(['memory', 'localStorage', 'sessionStorage']).default('memory'),
    https: z.boolean().optional()
}).optional();

/** 幂等性配置 Schema */
const IdempotentConfigSchema = z.object({
    enabled: z.boolean().default(false),
    ttl: z.number().default(60000),
    storage: z.enum(['memory', 'localStorage', 'sessionStorage']).default('memory')
}).optional();

/** 日志级别 Schema */
const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug']).optional();

// ==================== 核心配置 Schema ====================

/** 核心配置 Schema - 验证 GlobalConfig 的所有字段 */
export const GlobalConfigSchema = z.object({
    env: EnvironmentSchema.default('test'),
    baseURL: z
        .string()
        .optional()
        .refine(
            val => {
                // 如果是空字符串或undefined，跳过URL验证
                if (!val || val.trim() === '') {
                    return true;
                }
                // 有值时才验证URL格式
                try {
                    new URL(val);
                    return true;
                } catch {
                    return false;
                }
            },
            {
                message: '必须是有效的URL格式'
            }
        )
        .default(''),
    proxy: z.boolean().optional().default(false),
    timeout: z
        .number()
        .min(0)
        .default(5000 * 60),
    headers: z.record(z.unknown()).default({}),
    defaultTransformData: z.boolean().default(true),
    retryConfig: RetryConfigSchema.default({
        enabled: true,
        retries: 3,
        shouldResetTimeout: true
    }),
    requestCancel: RequestCancelConfigSchema,
    cache: CacheConfigSchema,
    idempotent: IdempotentConfigSchema,
    logLevel: LogLevelSchema,
    enablePerformanceMonitor: z.boolean().optional()
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
        const errorDetails = result.error.issues
            .map(issue => {
                const path = issue.path.join('.') || '根级别';
                let message = `字段 "${path}": ${issue.message}`;

                if (issue.code === 'invalid_type') {
                    message += `; 期望类型: ${issue.expected}`;
                }

                return message;
            })
            .join('\n');

        throw new Error(`用户配置错误:${errorDetails}`);
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
        return {
            success: false,
            errors: result.error.issues.map(issue => `${issue.path.join('.') || '根级别'}: ${issue.message}`)
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
