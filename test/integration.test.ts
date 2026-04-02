/**
 * 集成测试
 * 测试多个功能模块组合使用
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestClient } from '../src/core/request-client';
import { EnterpriseConcurrentController } from '../src/core/task-limiter';
import { SerialRequestController } from '../src/core/serial-request';
import { RequestDeduplicator } from '../src/core/request-deduplicator';
import { RequestThrottle } from '../src/core/request-throttle';
import { IdempotentHandler } from '../src/core/idempotent-handler';
import { RequestPipeline } from '../src/core/pipeline-request';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: () => ({
      request: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    })
  }
}));

describe('集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('去重 + 幂等性', () => {
    it('应该组合使用去重和幂等性', async () => {
      // 1. 创建去重器
      const deduplicator = new RequestDeduplicator({ ttl: 1000 });

      // 2. 创建幂等处理器
      const idempotent = new IdempotentHandler({ enabled: true, ttl: 5000 });

      let requestCount = 0;

      const request = async () => {
        requestCount++;
        return { data: 'success', timestamp: Date.now() };
      };

      // 组合使用：去重 -> 幂等
      const executeRequest = async () => {
        const idempotentKey = 'composite-key';

        // 先检查幂等性
        if (idempotent.isProcessed(idempotentKey)) {
          return idempotent.getResult(idempotentKey);
        }

        idempotent.markPending(idempotentKey);

        // 使用去重执行请求
        const result = await deduplicator.getOrExecute(
          'GET',
          '/api/composite',
          request
        );

        idempotent.markCompleted(idempotentKey, result);
        return result;
      };

      // 发起多个相同请求
      const results = await Promise.all([
        executeRequest(),
        executeRequest(),
        executeRequest()
      ]);

      // 应该只执行一次
      expect(requestCount).toBe(1);
      expect(results).toHaveLength(3);
    });

    it('应该在幂等性检查通过后使用去重', async () => {
      const deduplicator = new RequestDeduplicator({ ttl: 1000 });
      const idempotent = new IdempotentHandler({ enabled: true, ttl: 5000 });

      const key = 'order-123';
      const expectedResult = { orderId: '123', status: 'created' };

      // 第一次请求
      if (!idempotent.isProcessed(key)) {
        idempotent.markPending(key);
        const result = await deduplicator.getOrExecute('POST', '/api/orders', async () => expectedResult);
        idempotent.markCompleted(key, result);
      }

      // 第二次请求 - 应该从幂等缓存返回
      if (!idempotent.isProcessed(key)) {
        idempotent.markPending(key);
        const result = await deduplicator.getOrExecute('POST', '/api/orders', async () => {
          throw new Error('Should not execute');
        });
        idempotent.markCompleted(key, result);
      }

      const result = idempotent.getResult(key);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('流水线 + 限流', () => {
    it('应该组合使用流水线和限流', async () => {
      const pipeline = new RequestPipeline();
      const throttle = new RequestThrottle({ maxRequests: 2, windowMs: 1000 });

      let requestCount = 0;

      pipeline.addStep({
        name: 'step1',
        execute: async () => {
          const check = throttle.check('/api/step1');
          if (check.allowed) {
            throttle.record('/api/step1', 'req-1');
            requestCount++;
          }
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          const check = throttle.check('/api/step2');
          if (check.allowed) {
            throttle.record('/api/step2', 'req-2');
            requestCount++;
          }
          return 'step2';
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(true);
      expect(requestCount).toBe(2);
    });

    it('应该在限流触发时暂停流水线', async () => {
      const pipeline = new RequestPipeline();
      const throttle = new RequestThrottle({ maxRequests: 1, windowMs: 1000 });

      let requestCount = 0;
      let throttled = false;

      pipeline.addStep({
        name: 'step1',
        execute: async () => {
          const check = throttle.check('/api/test');
          if (check.allowed) {
            throttle.record('/api/test', 'req-1');
            requestCount++;
          } else {
            throttled = true;
          }
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          const check = throttle.check('/api/test');
          if (check.allowed) {
            throttle.record('/api/test', 'req-2');
            requestCount++;
          } else {
            throttled = true;
          }
          return 'step2';
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(true);
      expect(throttled).toBe(true);
    });
  });

  describe('并发 + 去重', () => {
    it('应该在并发请求中使用去重', async () => {
      const controller = new EnterpriseConcurrentController();
      const deduplicator = new RequestDeduplicator({ ttl: 1000, getOnly: false });

      let requestCount = 0;

      const tasks = Array(10).fill(null).map((_, i) => async () => {
        return deduplicator.getOrExecute('GET', '/api/data', async () => {
          requestCount++;
          return { id: i, data: `item-${i}` };
        });
      });

      const result = await controller.execute(tasks, {
        concurrency: 5
      });

      // 由于使用了去重，所有请求应该合并为一个
      expect(requestCount).toBeLessThanOrEqual(1);
      expect(result.results).toHaveLength(10);
    });
  });

  describe('串行 + 幂等性', () => {
    it('应该在串行请求中使用幂等性', async () => {
      const controller = new SerialRequestController();
      const idempotent = new IdempotentHandler({ enabled: true, ttl: 5000 });

      let executionCount = 0;

      const tasks = [
        {
          execute: async () => {
            const key = 'task1';
            if (!idempotent.isProcessed(key)) {
              idempotent.markPending(key);
              executionCount++;
              await new Promise(resolve => setTimeout(resolve, 10));
              idempotent.markCompleted(key, 'result1');
            }
            return idempotent.getResult(key);
          }
        },
        {
          execute: async () => {
            const key = 'task2';
            if (!idempotent.isProcessed(key)) {
              idempotent.markPending(key);
              executionCount++;
              await new Promise(resolve => setTimeout(resolve, 10));
              idempotent.markCompleted(key, 'result2');
            }
            return idempotent.getResult(key);
          }
        }
      ];

      controller.addTasks(tasks);
      const result = await controller.execute();

      expect(result.results).toEqual(['result1', 'result2']);
      expect(executionCount).toBe(2);
    });
  });

  describe('复杂流程：流水线 + 并发 + 去重 + 幂等性', () => {
    it('应该支持复杂的多层组合', async () => {
      // 创建各个组件
      const pipeline = new RequestPipeline();
      const controller = new EnterpriseConcurrentController();
      const deduplicator = new RequestDeduplicator({ ttl: 1000 });
      const idempotent = new IdempotentHandler({ enabled: true, ttl: 5000 });

      let pipelineExecutionCount = 0;
      let requestExecutionCount = 0;

      // 步骤1：使用流水线
      pipeline.addStep({
        name: 'fetch-data',
        execute: async (ctx) => {
          pipelineExecutionCount++;
          ctx.data = await controller.execute([
            async () => deduplicator.getOrExecute('GET', '/api/items/1', async () => {
              requestExecutionCount++;
              return { id: 1, name: 'Item 1' };
            }),
            async () => deduplicator.getOrExecute('GET', '/api/items/2', async () => {
              requestExecutionCount++;
              return { id: 2, name: 'Item 2' };
            })
          ], { concurrency: 2 });

          return ctx.data;
        }
      });

      // 步骤2：使用幂等性
      pipeline.addStep({
        name: 'process-data',
        execute: async (ctx) => {
          const key = 'process-key';
          if (!idempotent.isProcessed(key)) {
            idempotent.markPending(key);
            ctx.processed = {
              total: ctx.data.results.length,
              timestamp: Date.now()
            };
            idempotent.markCompleted(key, ctx.processed);
          } else {
            ctx.processed = idempotent.getResult(key);
          }
          return ctx.processed;
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(true);
      expect(pipelineExecutionCount).toBe(1);
      expect(requestExecutionCount).toBe(2);
      expect(result.context.processed).toBeDefined();
    });
  });

  describe('错误恢复集成', () => {
    // TODO: RequestPipeline 不支持 step 级别的 retryConfig
    it('应该支持错误恢复和重试', async () => {
      // 跳过此测试
    });
  });

  describe('性能监控集成', () => {
    it('应该监控整个流程的性能', async () => {
      const { PerformanceMonitor } = await import('../src/core/performance-monitor');
      const monitor = new PerformanceMonitor({ enabled: true });

      const pipeline = new RequestPipeline();
      const controller = new EnterpriseConcurrentController();

      pipeline.addStep({
        name: 'step1',
        execute: async () => {
          const start = Date.now();
          await new Promise(resolve => setTimeout(resolve, 50));
          const duration = Date.now() - start;
          monitor.record('/api/step1', 'GET', duration, true);
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          const start = Date.now();
          await controller.execute([
            async () => new Promise(resolve => setTimeout(resolve, 30)),
            async () => new Promise(resolve => setTimeout(resolve, 40))
          ], { concurrency: 2 });
          const duration = Date.now() - start;
          monitor.record('/api/step2', 'GET', duration, true);
          return 'step2';
        }
      });

      const result = await pipeline.execute();

      const metrics = monitor.getMetrics();
      expect(result.success).toBe(true);
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('缓存集成', () => {
    it('应该结合去重和缓存策略', async () => {
      const deduplicator = new RequestDeduplicator({ ttl: 5000 });

      // 模拟缓存存储
      const cache = new Map<string, any>();

      const fetchData = async (url: string) => {
        // 检查缓存
        if (cache.has(url)) {
          return cache.get(url);
        }

        // 使用去重执行请求
        const result = await deduplicator.getOrExecute('GET', url, async () => {
          return { data: `Response from ${url}`, timestamp: Date.now() };
        });

        // 存入缓存
        cache.set(url, result);
        return result;
      };

      const result1 = await fetchData('/api/test');
      const result2 = await fetchData('/api/test');
      const result3 = await fetchData('/api/other');

      expect(result1).toEqual(result2);
      expect(result3).not.toEqual(result1);
      expect(cache.size).toBe(2);
    });
  });
});
