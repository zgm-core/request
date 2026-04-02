/**
 * ErrorHandler 测试文件
 * 测试错误处理、错误类型判断、错误代码映射等功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeError,
  handleError,
  addErrorHandler,
  removeErrorHandler,
  clearErrorHandlers,
  isErrorType,
  isErrorCode,
  ErrorType,
  ErrorCode
} from '../src/core/error-handler';
import axios, { AxiosError, isAxiosError } from 'axios';

describe('ErrorHandler - 错误处理', () => {
  beforeEach(() => {
    // 清除所有错误处理器
    clearErrorHandlers();
  });

  describe('错误标准化', () => {
    it('应该能够标准化 Axios 网络错误', () => {
      const axiosError = new AxiosError('Network Error');
      delete axiosError.response;

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(normalized.type).toBe(ErrorType.NETWORK);
      expect(normalized.originalError).toBe(axiosError);
    });

    it('应该能够标准化 Axios 超时错误', () => {
      const axiosError = new AxiosError('Timeout', 'ECONNABORTED');

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.TIMEOUT_ERROR);
      expect(normalized.type).toBe(ErrorType.TIMEOUT);
      expect(normalized.status).toBe(408);
    });

    it('应该能够标准化 Axios 取消错误', () => {
      const axiosError = new AxiosError('Canceled', 'ERR_CANCELED');

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.CANCEL_ERROR);
      expect(normalized.type).toBe(ErrorType.CANCEL);
    });

    it('应该能够标准化 HTTP 400 错误', () => {
      const axiosError = new AxiosError(
        'Bad Request',
        undefined,
        undefined,
        undefined,
        {
          status: 400,
          data: { message: 'Invalid parameter' }
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.BAD_REQUEST);
      expect(normalized.type).toBe(ErrorType.HTTP);
      expect(normalized.status).toBe(400);
    });

    it('应该能够标准化 HTTP 401 错误', () => {
      const axiosError = new AxiosError(
        'Unauthorized',
        undefined,
        undefined,
        undefined,
        {
          status: 401,
          data: { message: 'Invalid token' }
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(normalized.type).toBe(ErrorType.HTTP);
      expect(normalized.status).toBe(401);
    });

    it('应该能够标准化 HTTP 403 错误', () => {
      const axiosError = new AxiosError(
        'Forbidden',
        undefined,
        undefined,
        undefined,
        {
          status: 403
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.FORBIDDEN);
      expect(normalized.type).toBe(ErrorType.HTTP);
      expect(normalized.status).toBe(403);
    });

    it('应该能够标准化 HTTP 404 错误', () => {
      const axiosError = new AxiosError(
        'Not Found',
        undefined,
        undefined,
        undefined,
        {
          status: 404
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.NOT_FOUND);
      expect(normalized.type).toBe(ErrorType.HTTP);
      expect(normalized.status).toBe(404);
    });

    it('应该能够标准化 HTTP 429 错误', () => {
      const axiosError = new AxiosError(
        'Too Many Requests',
        undefined,
        undefined,
        undefined,
        {
          status: 429
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.TOO_MANY_REQUESTS);
      expect(normalized.type).toBe(ErrorType.HTTP);
      expect(normalized.status).toBe(429);
    });

    it('应该能够标准化 HTTP 500 错误', () => {
      const axiosError = new AxiosError(
        'Internal Server Error',
        undefined,
        undefined,
        undefined,
        {
          status: 500
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(normalized.type).toBe(ErrorType.HTTP);
      expect(normalized.status).toBe(500);
    });

    it('应该能够标准化普通 Error 对象', () => {
      const error = new Error('Custom error message');

      const normalized = normalizeError(error);

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.type).toBe(ErrorType.UNKNOWN);
      expect(normalized.message).toBe('Custom error message');
    });

    it('应该能够标准化未知类型错误', () => {
      const error = { customError: true };

      const normalized = normalizeError(error);

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.type).toBe(ErrorType.UNKNOWN);
    });

    it('应该能够保留原始错误信息', () => {
      const axiosError = new AxiosError('Network Error');
      delete axiosError.response;

      const normalized = normalizeError(axiosError);

      expect(normalized.originalError).toBe(axiosError);
    });
  });

  describe('错误处理', () => {
    it('应该能够处理错误并调用对应的处理器', () => {
      const handler = vi.fn();
      addErrorHandler(ErrorCode.BAD_REQUEST, handler);

      const axiosError = new AxiosError(
        'Bad Request',
        undefined,
        undefined,
        undefined,
        {
          status: 400
        } as any
      );

      handleError(axiosError);

      expect(handler).toHaveBeenCalled();
    });

    it('处理器执行失败不应抛出异常', () => {
      addErrorHandler(ErrorCode.BAD_REQUEST, () => {
        throw new Error('Handler error');
      });

      const axiosError = new AxiosError(
        'Bad Request',
        undefined,
        undefined,
        undefined,
        {
          status: 400
        } as any
      );

      expect(() => handleError(axiosError)).not.toThrow();
    });

    it('没有处理器时应该静默处理', () => {
      const axiosError = new AxiosError(
        'Unknown Error',
        undefined,
        undefined,
        undefined,
        {
          status: 418
        } as any
      );

      expect(() => handleError(axiosError)).not.toThrow();
    });
  });

  describe('错误处理器管理', () => {
    it('应该能够添加自定义错误处理器', () => {
      const handler = vi.fn();
      const remove = addErrorHandler('CUSTOM_ERROR', handler);

      const error = new Error('Custom error');
      normalizeError(error);

      remove();
    });

    it('应该能够移除错误处理器', () => {
      const handler = vi.fn();
      addErrorHandler('CUSTOM_ERROR', handler);

      removeErrorHandler('CUSTOM_ERROR');

      // 再次添加相同的处理器应该能够成功
      const handler2 = vi.fn();
      expect(() => addErrorHandler('CUSTOM_ERROR', handler2)).not.toThrow();
    });

    it('应该能够清除所有错误处理器', () => {
      addErrorHandler('ERROR_1', vi.fn());
      addErrorHandler('ERROR_2', vi.fn());
      addErrorHandler('ERROR_3', vi.fn());

      clearErrorHandlers();

      // 验证处理器已被清除（通过重新添加不会冲突）
      expect(() => addErrorHandler('ERROR_1', vi.fn())).not.toThrow();
    });

    it('应该能够返回取消处理器函数', () => {
      const handler = vi.fn();
      const remove = addErrorHandler('CUSTOM_ERROR', handler);

      remove();

      // 移除后再次添加应该能够成功
      const handler2 = vi.fn();
      expect(() => addErrorHandler('CUSTOM_ERROR', handler2)).not.toThrow();
    });
  });

  describe('错误类型判断', () => {
    it('应该能够判断错误类型', () => {
      const networkError = {
        code: ErrorCode.NETWORK_ERROR,
        type: ErrorType.NETWORK,
        message: 'Network error'
      };

      const timeoutError = {
        code: ErrorCode.TIMEOUT_ERROR,
        type: ErrorType.TIMEOUT,
        message: 'Timeout error'
      };

      expect(isErrorType(networkError, ErrorType.NETWORK)).toBe(true);
      expect(isErrorType(networkError, ErrorType.TIMEOUT)).toBe(false);
      expect(isErrorType(timeoutError, ErrorType.TIMEOUT)).toBe(true);
    });

    it('应该能够判断错误代码', () => {
      const error1 = {
        code: ErrorCode.BAD_REQUEST,
        type: ErrorType.HTTP,
        message: 'Bad request'
      };

      const error2 = {
        code: ErrorCode.NOT_FOUND,
        type: ErrorType.HTTP,
        message: 'Not found'
      };

      expect(isErrorCode(error1, ErrorCode.BAD_REQUEST)).toBe(true);
      expect(isErrorCode(error1, ErrorCode.NOT_FOUND)).toBe(false);
      expect(isErrorCode(error2, ErrorCode.NOT_FOUND)).toBe(true);
    });

    it('应该能够使用数字状态码判断', () => {
      const error = {
        code: 404,
        type: ErrorType.HTTP,
        message: 'Not found'
      };

      expect(isErrorCode(error, 404)).toBe(true);
      expect(isErrorCode(error, 500)).toBe(false);
    });

    it('应该能够使用自定义错误代码判断', () => {
      const error = {
        code: 'CUSTOM_ERROR_CODE',
        type: ErrorType.UNKNOWN,
        message: 'Custom error'
      };

      expect(isErrorCode(error, 'CUSTOM_ERROR_CODE')).toBe(true);
    });
  });

  describe('错误消息', () => {
    it('应该为 HTTP 错误提供默认消息', () => {
      const axiosError = new AxiosError(
        undefined,
        undefined,
        undefined,
        undefined,
        {
          status: 404
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.message).toBe('请求的资源不存在');
    });

    it('应该优先使用响应中的自定义消息', () => {
      const axiosError = new AxiosError(
        undefined,
        undefined,
        undefined,
        undefined,
        {
          status: 400,
          data: { message: 'Validation failed: email is required' }
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.message).toBe('Validation failed: email is required');
    });

    it('应该为未知错误提供通用消息', () => {
      const error = { unknown: true };

      const normalized = normalizeError(error);

      expect(normalized.message).toBe('未知错误');
    });
  });

  describe('边界情况', () => {
    it('应该能够处理 null 错误', () => {
      const normalized = normalizeError(null);

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.type).toBe(ErrorType.UNKNOWN);
    });

    it('应该能够处理 undefined 错误', () => {
      const normalized = normalizeError(undefined);

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.type).toBe(ErrorType.UNKNOWN);
    });

    it('应该能够处理空字符串错误', () => {
      const normalized = normalizeError('');

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.type).toBe(ErrorType.UNKNOWN);
    });

    it('应该能够处理数字错误', () => {
      const normalized = normalizeError(123);

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.type).toBe(ErrorType.UNKNOWN);
    });

    it('应该能够处理没有消息的 Error 对象', () => {
      const error = new Error();
      error.message = '';

      const normalized = normalizeError(error);

      expect(normalized.message).toBe('未知错误');
    });

    it('应该能够处理状态码为 0 的情况', () => {
      const axiosError = new AxiosError(
        undefined,
        undefined,
        undefined,
        undefined,
        {
          status: 0
        } as any
      );

      const normalized = normalizeError(axiosError);

      expect(normalized.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    });
  });
});
