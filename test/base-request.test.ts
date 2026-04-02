/**
 * BaseRequest 测试文件
 * 测试基础请求功能：GET、POST、PUT、DELETE 等 HTTP 方法
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseRequest } from '../src/core/base-request';
import axios, { AxiosHeaders } from 'axios';

// Mock axios before importing BaseRequest
vi.mock('axios', () => ({
  default: {
    create: () => ({
      request: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() }
      }
    })
  },
  AxiosHeaders: vi.fn().mockImplementation((headers) => headers || {})
}));

describe('BaseRequest - 基础请求', () => {
  let baseRequest: BaseRequest;

  beforeEach(() => {
    // 清除之前的 mock 调用
    vi.clearAllMocks();
    
    // 创建 BaseRequest 实例
    baseRequest = new BaseRequest();
  });

  describe('GET 请求', () => {
    it('应该支持基本的 GET 请求', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.get('/api/users');

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持带查询参数的 GET 请求', async () => {
      const mockResponse = { data: { users: [] } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.get('/api/users', { page: 1, limit: 10 });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持带配置的 GET 请求', async () => {
      const mockResponse = { data: { user: {} } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.get('/api/user', {}, { timeout: 5000 });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该处理 GET 请求错误', async () => {
      const mockError = new Error('Network Error');
      vi.spyOn(baseRequest['instance'], 'request').mockRejectedValue(mockError);

      await expect(baseRequest.get('/api/users')).rejects.toThrow('Network Error');
    });
  });

  describe('POST 请求', () => {
    it('应该支持基本的 POST 请求', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.post('/api/users', { name: 'John' });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持带配置的 POST 请求', async () => {
      const mockResponse = { data: { id: 123 } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.post('/api/users', { name: 'John' }, { timeout: 5000 });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该处理 POST 请求错误', async () => {
      const mockError = new Error('Bad Request');
      vi.spyOn(baseRequest['instance'], 'request').mockRejectedValue(mockError);

      await expect(baseRequest.post('/api/users', {})).rejects.toThrow('Bad Request');
    });
  });

  describe('PUT 请求', () => {
    it('应该支持基本的 PUT 请求', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.put('/api/users/1', { name: 'Updated' });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持带配置的 PUT 请求', async () => {
      const mockResponse = { data: { id: 1 } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.put('/api/users/1', { name: 'Updated' }, { timeout: 5000 });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该处理 PUT 请求错误', async () => {
      const mockError = new Error('Not Found');
      vi.spyOn(baseRequest['instance'], 'request').mockRejectedValue(mockError);

      await expect(baseRequest.put('/api/users/1', {})).rejects.toThrow('Not Found');
    });
  });

  describe('DELETE 请求', () => {
    it('应该支持基本的 DELETE 请求', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.delete('/api/users/1');

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持带配置的 DELETE 请求', async () => {
      const mockResponse = { data: { message: 'Deleted' } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.delete('/api/users/1', { timeout: 5000 });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该处理 DELETE 请求错误', async () => {
      const mockError = new Error('Forbidden');
      vi.spyOn(baseRequest['instance'], 'request').mockRejectedValue(mockError);

      await expect(baseRequest.delete('/api/users/1')).rejects.toThrow('Forbidden');
    });
  });

  describe('PATCH 请求', () => {
    it('应该支持基本的 PATCH 请求', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.patch('/api/users/1', { name: 'Patched' });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持带配置的 PATCH 请求', async () => {
      const mockResponse = { data: { id: 1 } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.patch('/api/users/1', { name: 'Patched' }, { timeout: 5000 });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该处理 PATCH 请求错误', async () => {
      const mockError = new Error('Conflict');
      vi.spyOn(baseRequest['instance'], 'request').mockRejectedValue(mockError);

      await expect(baseRequest.patch('/api/users/1', {})).rejects.toThrow('Conflict');
    });
  });

  describe('通用请求方法', () => {
    it('应该支持自定义 HTTP 方法', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.request('HEAD', '/api/users/1');

      expect(result).toEqual(mockResponse.data);
    });

    it('应该支持完整的请求配置', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.request('GET', '/api/users', { page: 1 }, {
        headers: { 'X-Custom': 'value' },
        timeout: 5000
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该处理通用请求错误', async () => {
      const mockError = new Error('Request Error');
      vi.spyOn(baseRequest['instance'], 'request').mockRejectedValue(mockError);

      await expect(baseRequest.request('GET', '/api/error')).rejects.toThrow('Request Error');
    });
  });

  describe('配置管理', () => {
    it('应该能够创建 BaseRequest 实例', () => {
      const instance = new BaseRequest();

      expect(instance).toBeDefined();
    });

    it('应该能够创建多个 BaseRequest 实例', () => {
      const instance1 = new BaseRequest();
      const instance2 = new BaseRequest();

      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
      expect(instance1).not.toBe(instance2);
    });
  });



  describe('边界情况', () => {
    it('应该能够处理空 URL', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.request('GET', '');

      expect(result).toEqual(mockResponse.data);
    });

    it('应该能够处理 null 数据', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.post('/api/data', null);

      expect(result).toEqual(mockResponse.data);
    });

    it('应该能够处理 undefined 数据', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.post('/api/data', undefined);

      expect(result).toEqual(mockResponse.data);
    });

    it('应该能够处理空对象配置', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const result = await baseRequest.get('/api/users', {}, {});

      expect(result).toEqual(mockResponse.data);
    });

    it('应该能够处理大文件上传', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const largeData = new Uint8Array(1024 * 1024 * 10); // 10MB

      const result = await baseRequest.post('/api/upload', largeData, {
        headers: { 'Content-Type': 'application/octet-stream' }
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('应该能够处理超长 URL', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const longUrl = '/api/' + 'x'.repeat(2000);

      const result = await baseRequest.get(longUrl);

      expect(result).toEqual(mockResponse.data);
    });

    it('应该能够处理大量请求参数', async () => {
      const mockResponse = { data: { success: true } };
      vi.spyOn(baseRequest['instance'], 'request').mockResolvedValue(mockResponse);

      const params: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        params[`param${i}`] = `value${i}`;
      }

      const result = await baseRequest.get('/api/search', params);

      expect(result).toEqual(mockResponse.data);
    });
  });
});
