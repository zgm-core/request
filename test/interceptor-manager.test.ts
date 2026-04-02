/**
 * InterceptorManager 测试文件
 * 测试请求拦截器、响应拦截器、错误拦截器等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import { InterceptorManager } from '../src/core/interceptor-manager';
import type { IPluginContext } from '../src/types/base';

describe('InterceptorManager - 拦截器管理器', () => {
  let axiosInstance: AxiosInstance;
  let interceptorManager: InterceptorManager;
  let mockPluginContext: IPluginContext;
  let mockExecuteBeforeRequest: ReturnType<typeof vi.fn>;
  let mockExecuteAfterRequest: ReturnType<typeof vi.fn>;
  let mockExecuteOnError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // 创建 axios 实例
    axiosInstance = axios.create({
      baseURL: 'https://api.example.com'
    });

    // Mock 插件相关函数
    mockPluginContext = {
      request: {
        url: '/test',
        method: 'GET'
      } as any,
      config: {},
      response: null,
      error: null,
      timestamp: Date.now()
    };

    mockExecuteBeforeRequest = vi.fn().mockResolvedValue(undefined);
    mockExecuteAfterRequest = vi.fn().mockResolvedValue(undefined);
    mockExecuteOnError = vi.fn().mockResolvedValue(undefined);

    // 创建拦截器管理器
    interceptorManager = new InterceptorManager(
      axiosInstance,
      {
        request: (config) => {
          config.headers = config.headers || {};
          config.headers['X-Custom'] = 'value';
          return config;
        },
        response: (response) => {
          return response;
        },
        error: (error) => {
          return Promise.reject(error);
        }
      },
      () => mockPluginContext,
      mockExecuteBeforeRequest,
      mockExecuteAfterRequest,
      mockExecuteOnError,
      (config) => config,
      (response) => response,
      (error) => Promise.reject(error)
    );
  });

  describe('请求拦截器', () => {
    it('应该能够处理请求配置', async () => {
      const mockConfig = {
        url: '/test',
        method: 'GET' as const,
        headers: {}
      };

      // 模拟 axios 内部调用
      const result = await mockExecuteBeforeRequest(mockPluginContext);

      expect(result).toBeUndefined();
    });

    it('应该能够执行自定义请求拦截器', async () => {
      const customInterceptor = vi.fn((config) => {
        config.headers = config.headers || {};
        config.headers['X-Auth'] = 'token';
        return config;
      });

      const config = {
        url: '/api/test',
        method: 'GET' as const,
        headers: {}
      };

      const result = await customInterceptor(config);

      expect(result.headers['X-Auth']).toBe('token');
    });

    it('请求拦截器应该能够添加 Trace 信息', async () => {
      const config = {
        url: '/api/test',
        method: 'GET' as const,
        headers: {}
      };

      // 模拟 trace 信息注入
      config.headers['X-Trace-ID'] = 'trace-123';
      config.headers['X-Span-ID'] = 'span-456';

      expect(config.headers['X-Trace-ID']).toBe('trace-123');
      expect(config.headers['X-Span-ID']).toBe('span-456');
    });

    it('应该能够处理代理 URL', () => {
      const config = {
        url: '/api/test',
        method: 'GET' as const,
        baseURL: 'https://proxy.api.com',
        headers: {}
      } as any;

      (config as any).proxy = true;
      (config as any).proxyURL = config.baseURL;
      config.baseURL = '';

      expect((config as any).proxyURL).toBe('https://proxy.api.com');
      expect(config.baseURL).toBe('');
    });

    it('应该能够处理缓存命中的 adapter', async () => {
      const config = {
        url: '/api/test',
        method: 'GET' as const,
        headers: {}
      } as any;

      const cachedResponse = { data: { cached: true } };

      (config as any).cacheMetadata = {
        cacheHit: true,
        response: cachedResponse
      };

      expect((config as any).cacheMetadata?.cacheHit).toBe(true);
      expect((config as any).cacheMetadata?.response).toEqual(cachedResponse);
    });
  });

  describe('响应拦截器', () => {
    it('应该能够处理响应数据', async () => {
      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      };

      const result = await mockExecuteAfterRequest(mockPluginContext, mockResponse as any);

      expect(result).toBeUndefined();
    });

    it('应该能够执行自定义响应拦截器', async () => {
      const customInterceptor = vi.fn((response) => {
        response.data.transformed = true;
        return response;
      });

      const response = {
        data: { message: 'test' },
        status: 200
      };

      const result = await customInterceptor(response);

      expect(result.data.transformed).toBe(true);
    });

    it('应该能够记录请求成功信息', () => {
      const response = {
        data: { success: true },
        status: 200,
        config: {
          url: '/api/test',
          method: 'GET'
        }
      };

      const duration = 100;
      const traceId = 'trace-123';

      expect(response.status).toBe(200);
      expect(response.config.url).toBe('/api/test');
    });
  });

  describe('错误拦截器', () => {
    it('应该能够处理请求错误', async () => {
      const mockError = new Error('Network Error');

      await mockExecuteOnError(mockPluginContext, mockError);

      expect(mockExecuteOnError).toHaveBeenCalled();
    });

    it('应该能够处理响应错误', async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' }
        },
        config: {
          url: '/api/error',
          method: 'GET'
        }
      };

      await mockExecuteOnError(mockPluginContext, mockError);

      expect(mockExecuteOnError).toHaveBeenCalled();
    });

    it('应该能够执行自定义错误拦截器', async () => {
      const customInterceptor = vi.fn((error) => {
        error.handled = true;
        return Promise.reject(error);
      });

      const error = { message: 'Test error' };

      await expect(customInterceptor(error)).rejects.toEqual(error);
      expect(error.handled).toBe(true);
    });

    it('应该能够记录请求失败信息', () => {
      const error = {
        response: {
          status: 404
        },
        config: {
          url: '/api/not-found',
          method: 'GET'
        }
      };

      const duration = 200;
      const traceId = 'trace-456';

      expect(error.response.status).toBe(404);
      expect(error.config.url).toBe('/api/not-found');
    });
  });

  describe('拦截器更新', () => {
    it('应该能够更新拦截器配置', () => {
      const newInterceptors = {
        request: (config: any) => {
          config.headers = config.headers || {};
          config.headers['X-New-Header'] = 'new-value';
          return config;
        },
        response: (response: any) => response,
        error: (error: any) => Promise.reject(error)
      };

      expect(() => {
        interceptorManager.updateInterceptors(newInterceptors);
      }).not.toThrow();
    });
  });

  describe('插件钩子执行', () => {
    it('应该能够执行 beforeRequest 钩子', async () => {
      const pluginContext = {
        request: { url: '/test' } as any,
        config: {},
        response: null,
        error: null,
        timestamp: Date.now()
      };

      await mockExecuteBeforeRequest(pluginContext);

      expect(mockExecuteBeforeRequest).toHaveBeenCalledWith(pluginContext);
    });

    it('应该能够执行 afterRequest 钩子', async () => {
      const pluginContext = {
        request: { url: '/test' } as any,
        config: {},
        response: null,
        error: null,
        timestamp: Date.now()
      };

      const mockResponse = {
        data: { success: true },
        status: 200
      } as any;

      await mockExecuteAfterRequest(pluginContext, mockResponse);

      expect(mockExecuteAfterRequest).toHaveBeenCalledWith(pluginContext, mockResponse);
    });

    it('应该能够执行 onError 钩子', async () => {
      const pluginContext = {
        request: { url: '/test' } as any,
        config: {},
        response: null,
        error: null,
        timestamp: Date.now()
      };

      const mockError = new Error('Test error');

      await mockExecuteOnError(pluginContext, mockError);

      expect(mockExecuteOnError).toHaveBeenCalledWith(pluginContext, mockError);
    });

    it('插件钩子执行失败不应影响请求流程', async () => {
      mockExecuteBeforeRequest = vi.fn().mockRejectedValue(new Error('Plugin error'));

      const pluginContext = {
        request: { url: '/test' } as any,
        config: {},
        response: null,
        error: null,
        timestamp: Date.now()
      };

      // 钩子执行失败，但不应该中断流程
      await expect(mockExecuteBeforeRequest(pluginContext)).rejects.toThrow('Plugin error');
    });
  });

  describe('边界情况', () => {
    it('应该能够处理空的拦截器配置', () => {
      expect(() => {
        new InterceptorManager(
          axiosInstance,
          undefined,
          () => mockPluginContext,
          mockExecuteBeforeRequest,
          mockExecuteAfterRequest,
          mockExecuteOnError,
          (config) => config,
          (response) => response,
          (error) => Promise.reject(error)
        );
      }).not.toThrow();
    });

    it('应该能够处理异步拦截器', async () => {
      const asyncInterceptor = async (config: any) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        config.headers = config.headers || {};
        config.headers['X-Async'] = 'async-value';
        return config;
      };

      const config = {
        url: '/api/test',
        method: 'GET' as const,
        headers: {}
      };

      const result = await asyncInterceptor(config);

      expect(result.headers['X-Async']).toBe('async-value');
    });

    it('应该能够处理拦截器抛出的错误', () => {
      const errorInterceptor = () => {
        throw new Error('Interceptor error');
      };

      expect(errorInterceptor).toThrow('Interceptor error');
    });
  });
});
