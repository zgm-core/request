import { AxiosError, isAxiosError } from 'axios';
import { RequestError } from '../types/base/index';
import { safeError } from '../utils/logger';

/**
 * 错误类型枚举
 */
export enum ErrorType {
    NETWORK = 'network',
    TIMEOUT = 'timeout',
    CANCEL = 'cancel',
    HTTP = 'http',
    CACHE = 'cache',
    WEBSOCKET = 'websocket',
    VALIDATION = 'validation',
    UNKNOWN = 'unknown'
}

/**
 * 错误代码枚举
 */
export enum ErrorCode {
    // 网络错误
    NETWORK_ERROR = 'NETWORK_ERROR',
    CONNECTION_REFUSED = 'CONNECTION_REFUSED',

    // 超时错误
    TIMEOUT_ERROR = 'TIMEOUT_ERROR',
    CONNECTION_ABORTED = 'CONNECTION_ABORTED',

    // 取消错误
    CANCEL_ERROR = 'CANCEL_ERROR',
    DUPLICATE_REQUEST = 'DUPLICATE_REQUEST',

    // HTTP 错误
    BAD_REQUEST = 'BAD_REQUEST',
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',
    NOT_FOUND = 'NOT_FOUND',
    METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
    CONFLICT = 'CONFLICT',
    UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
    TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    BAD_GATEWAY = 'BAD_GATEWAY',
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
    GATEWAY_TIMEOUT = 'GATEWAY_TIMEOUT',

    // 缓存错误
    CACHE_ERROR = 'CACHE_ERROR',
    CACHE_MISS = 'CACHE_MISS',

    // WebSocket 错误
    WEBSOCKET_ERROR = 'WEBSOCKET_ERROR',
    WEBSOCKET_CLOSED = 'WEBSOCKET_CLOSED',
    WEBSOCKET_RECONNECT_FAILED = 'WEBSOCKET_RECONNECT_FAILED',

    // 验证错误
    VALIDATION_ERROR = 'VALIDATION_ERROR',

    // 未知错误
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * 错误消息映射
 */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
    [ErrorCode.NETWORK_ERROR]: '网络错误，请检查网络连接',
    [ErrorCode.CONNECTION_REFUSED]: '连接被拒绝',
    [ErrorCode.TIMEOUT_ERROR]: '请求超时',
    [ErrorCode.CONNECTION_ABORTED]: '连接被中断',
    [ErrorCode.CANCEL_ERROR]: '请求已取消',
    [ErrorCode.DUPLICATE_REQUEST]: '重复请求已取消',
    [ErrorCode.BAD_REQUEST]: '请求参数错误',
    [ErrorCode.UNAUTHORIZED]: '未授权，请重新登录',
    [ErrorCode.FORBIDDEN]: '禁止访问',
    [ErrorCode.NOT_FOUND]: '请求的资源不存在',
    [ErrorCode.METHOD_NOT_ALLOWED]: '请求方法不允许',
    [ErrorCode.CONFLICT]: '请求冲突',
    [ErrorCode.UNPROCESSABLE_ENTITY]: '无法处理的实体',
    [ErrorCode.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
    [ErrorCode.INTERNAL_SERVER_ERROR]: '服务器内部错误',
    [ErrorCode.BAD_GATEWAY]: '网关错误',
    [ErrorCode.SERVICE_UNAVAILABLE]: '服务不可用',
    [ErrorCode.GATEWAY_TIMEOUT]: '网关超时',
    [ErrorCode.CACHE_ERROR]: '缓存错误',
    [ErrorCode.CACHE_MISS]: '缓存未命中',
    [ErrorCode.WEBSOCKET_ERROR]: 'WebSocket 错误',
    [ErrorCode.WEBSOCKET_CLOSED]: 'WebSocket 连接已关闭',
    [ErrorCode.WEBSOCKET_RECONNECT_FAILED]: 'WebSocket 重连失败',
    [ErrorCode.VALIDATION_ERROR]: '验证错误',
    [ErrorCode.UNKNOWN_ERROR]: '未知错误'
};

// 默认错误处理器
const DEFAULT_ERROR_HANDLERS: Map<ErrorCode | number | string, (error: RequestError) => void> = new Map([
    [ErrorCode.BAD_REQUEST, error => safeError('请求参数错误:', error.message || '')],
    [
        ErrorCode.UNAUTHORIZED,
        (error) => {
            safeError('未授权，请重新登录', error.message || '');
            // 实际应用中可能需要更复杂的处理，如清除token等
            // window.location.href = '/login';
        }
    ],
    [ErrorCode.FORBIDDEN, error => safeError('禁止访问:', error.message || '')],
    [ErrorCode.NOT_FOUND, error => safeError('请求的资源不存在:', error.message || '')],
    [ErrorCode.TOO_MANY_REQUESTS, error => safeError('请求过于频繁:', error.message || '')],
    [ErrorCode.INTERNAL_SERVER_ERROR, error => safeError('服务器内部错误:', error.message || '')],
    [ErrorCode.BAD_GATEWAY, error => safeError('网关错误:', error.message || '')],
    [ErrorCode.SERVICE_UNAVAILABLE, error => safeError('服务不可用:', error.message || '')]
]);

/**
 * 标准化错误
 */
export function normalizeError(error: unknown): RequestError {
    // Axios 错误
    if (isAxiosError(error)) {
        const axiosError = error as AxiosError;

        // 超时错误
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
            return {
                code: ErrorCode.TIMEOUT_ERROR,
                status: 408,
                message: ERROR_MESSAGES[ErrorCode.TIMEOUT_ERROR],
                type: ErrorType.TIMEOUT,
                originalError: axiosError
            };
        }

        // 取消错误
        if (axiosError.code === 'ERR_CANCELED') {
            return {
                code: ErrorCode.CANCEL_ERROR,
                message: ERROR_MESSAGES[ErrorCode.CANCEL_ERROR],
                type: ErrorType.CANCEL,
                originalError: axiosError
            };
        }

        // 网络错误（无响应）
        if (!axiosError.response) {
            return {
                code: ErrorCode.NETWORK_ERROR,
                message: ERROR_MESSAGES[ErrorCode.NETWORK_ERROR],
                type: ErrorType.NETWORK,
                originalError: axiosError
            };
        }

        // HTTP 错误
        const status = axiosError.response?.status || 500;
        const errorCode = mapHttpStatusToErrorCode(status);

        return {
            code: errorCode,
            status,
            message: (axiosError.response?.data as { message?: string })?.message || ERROR_MESSAGES[errorCode],
            type: ErrorType.HTTP,
            originalError: axiosError
        };
    }

    // WebSocket 错误
    if (error instanceof Error && error.name === 'WebSocketError') {
        return {
            code: ErrorCode.WEBSOCKET_ERROR,
            message: ERROR_MESSAGES[ErrorCode.WEBSOCKET_ERROR],
            type: ErrorType.WEBSOCKET,
            originalError: error
        };
    }

    // 缓存错误
    if (error instanceof Error && error.name === 'CacheError') {
        return {
            code: ErrorCode.CACHE_ERROR,
            message: ERROR_MESSAGES[ErrorCode.CACHE_ERROR],
            type: ErrorType.CACHE,
            originalError: error
        };
    }

    // 验证错误
    if (error instanceof Error && error.name === 'ValidationError') {
        return {
            code: ErrorCode.VALIDATION_ERROR,
            message: ERROR_MESSAGES[ErrorCode.VALIDATION_ERROR],
            type: ErrorType.VALIDATION,
            originalError: error
        };
    }

    // 普通 Error 对象
    if (error instanceof Error) {
        return {
            code: ErrorCode.UNKNOWN_ERROR,
            message: error.message || ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR],
            type: ErrorType.UNKNOWN,
            originalError: error
        };
    }

    // 其他类型错误
    return {
        code: ErrorCode.UNKNOWN_ERROR,
        message: ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR],
        type: ErrorType.UNKNOWN,
        originalError: error
    };
}

/**
 * 将 HTTP 状态码映射到错误代码
 */
function mapHttpStatusToErrorCode(status: number): ErrorCode {
    const statusMap: Record<number, ErrorCode> = {
        400: ErrorCode.BAD_REQUEST,
        401: ErrorCode.UNAUTHORIZED,
        403: ErrorCode.FORBIDDEN,
        404: ErrorCode.NOT_FOUND,
        405: ErrorCode.METHOD_NOT_ALLOWED,
        409: ErrorCode.CONFLICT,
        422: ErrorCode.UNPROCESSABLE_ENTITY,
        429: ErrorCode.TOO_MANY_REQUESTS,
        500: ErrorCode.INTERNAL_SERVER_ERROR,
        502: ErrorCode.BAD_GATEWAY,
        503: ErrorCode.SERVICE_UNAVAILABLE,
        504: ErrorCode.GATEWAY_TIMEOUT
    };

    return statusMap[status] || ErrorCode.INTERNAL_SERVER_ERROR;
}

/**
 * 处理错误
 */
export function handleError(error: unknown): RequestError {
    const normalizedError = normalizeError(error);
    const handler = DEFAULT_ERROR_HANDLERS.get(normalizedError.code);

    if (handler) {
        try {
            handler(normalizedError);
        } catch (handlerError) {
            safeError('错误处理器执行失败:', handlerError);
        }
    }

    return normalizedError;
}

/**
 * 添加自定义错误处理器
 * @param code 错误代码
 * @param handler 错误处理函数
 * @returns 取消处理器的函数
 */
export function addErrorHandler(code: string | number, handler: (error: RequestError) => void): () => void {
    DEFAULT_ERROR_HANDLERS.set(code, handler);

    // 返回取消函数
    return () => {
        DEFAULT_ERROR_HANDLERS.delete(code);
    };
}

/**
 * 移除错误处理器
 * @param code 错误代码
 */
export function removeErrorHandler(code: string | number): void {
    DEFAULT_ERROR_HANDLERS.delete(code);
}

/**
 * 清除所有错误处理器
 */
export function clearErrorHandlers(): void {
    DEFAULT_ERROR_HANDLERS.clear();
}

/**
 * 检查是否为特定错误类型
 */
export function isErrorType(error: RequestError, type: ErrorType): boolean {
    return error.type === type;
}

/**
 * 检查是否为特定错误代码
 */
export function isErrorCode(error: RequestError, code: ErrorCode | number | string): boolean {
    return error.code === code;
}