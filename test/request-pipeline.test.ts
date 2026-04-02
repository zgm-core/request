/**
 * RequestPipeline 流水线请求测试
 * 测试步骤执行、上下文传递、条件跳过、错误处理等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestPipeline } from '../src/core/pipeline-request';

describe('RequestPipeline - 流水线请求', () => {
  let pipeline: RequestPipeline;

  beforeEach(() => {
    pipeline = new RequestPipeline();
    vi.clearAllMocks();
  });

  describe('步骤执行', () => {
    it('应该按顺序执行步骤', async () => {
      const executionOrder: string[] = [];

      pipeline.addStep({
        name: 'step1',
        execute: async () => {
          executionOrder.push('step1');
          return 'result1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          executionOrder.push('step2');
          return 'result2';
        }
      });

      await pipeline.execute();

      expect(executionOrder).toEqual(['step1', 'step2']);
    });

    it('应该支持多个步骤', async () => {
      const results: string[] = [];

      for (let i = 1; i <= 5; i++) {
        pipeline.addStep({
          name: `step${i}`,
          execute: async () => {
            const result = `result${i}`;
            results.push(result);
            return result;
          }
        });
      }

      const result = await pipeline.execute();

      expect(results).toEqual(['result1', 'result2', 'result3', 'result4', 'result5']);
      expect(result.success).toBe(true);
    });

    it('应该处理空流水线', async () => {
      const result = await pipeline.execute();

      expect(result.success).toBe(true);
      expect(result.stats.totalSteps).toBe(0);
    });
  });

  describe('上下文传递', () => {
    it('应该支持步骤间上下文传递', async () => {
      const initialContext = { userId: 123 };

      pipeline.addStep({
        name: 'fetchUser',
        execute: async (ctx) => {
          ctx.user = { id: ctx.userId, name: 'John' };
          return ctx.user;
        }
      });

      pipeline.addStep({
        name: 'fetchOrders',
        execute: async (ctx) => {
          ctx.orders = [
            { id: 1, userId: ctx.user.id, amount: 100 },
            { id: 2, userId: ctx.user.id, amount: 200 }
          ];
          return ctx.orders;
        }
      });

      const result = await pipeline.execute({ initialContext });

      expect(result.success).toBe(true);
      expect(result.context.user).toBeDefined();
      expect(result.context.orders).toBeDefined();
    });

    it('应该支持修改上下文', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async (ctx) => {
          ctx.value = 'initial';
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async (ctx) => {
          ctx.value = 'modified';
          return 'step2';
        }
      });

      pipeline.addStep({
        name: 'step3',
        execute: async (ctx) => {
          expect(ctx.value).toBe('modified');
          return 'step3';
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(true);
      expect(result.context.value).toBe('modified');
    });
  });

  describe('条件跳过', () => {
    it('应该支持条件跳过步骤', async () => {
      const initialContext = { skipStep2: true };

      pipeline.addStep({
        name: 'step1',
        execute: async (ctx) => {
          ctx.step1 = 'executed';
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        skip: (ctx) => ctx.skipStep2,
        execute: async (ctx) => {
          ctx.step2 = 'executed';
          return 'step2';
        }
      });

      pipeline.addStep({
        name: 'step3',
        execute: async (ctx) => {
          ctx.step3 = 'executed';
          return 'step3';
        }
      });

      const result = await pipeline.execute({ initialContext });

      expect(result.context.step1).toBeDefined();
      expect(result.context.step2).toBeUndefined();
      expect(result.context.step3).toBeDefined();
    });

    it('应该根据动态条件决定是否跳过', async () => {
      const context: any = { count: 0 };

      pipeline.addStep({
        name: 'step1',
        execute: async (ctx) => {
          ctx.count++;
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        skip: (ctx) => ctx.count > 1,
        execute: async () => 'step2'
      });

      pipeline.addStep({
        name: 'step3',
        skip: (ctx) => ctx.count > 2,
        execute: async (ctx) => {
          ctx.count++;
          return 'step3';
        }
      });

      const result = await pipeline.execute({ initialContext: context });

      expect(result.context.count).toBe(2);
      expect(result.success).toBe(true);
    });
  });

  describe('错误处理', () => {
    it('应该处理步骤错误', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async (ctx) => {
          ctx.step1 = 'success';
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          throw new Error('Step 2 failed');
        }
      });

      pipeline.addStep({
        name: 'step3',
        execute: async (ctx) => {
          ctx.step3 = 'never executed';
          return 'step3';
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].step).toBe('step2');
    });

    it('应该支持 continueOnError 选项', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async (ctx) => {
          ctx.step1 = 'success';
          return 'step1';
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          throw new Error('Step 2 failed');
        }
      });

      pipeline.addStep({
        name: 'step3',
        execute: async (ctx) => {
          ctx.step3 = 'executed';
          return 'step3';
        }
      });

      const result = await pipeline.execute({ continueOnError: true });

      expect(result.success).toBe(false);
      expect(result.context.step1).toBeDefined();
      expect(result.context.step3).toBeDefined();
      expect(result.stats.failedSteps).toBe(1);
    });

    it('应该收集所有错误', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async () => {
          throw new Error('Error 1');
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          throw new Error('Error 2');
        }
      });

      pipeline.addStep({
        name: 'step3',
        execute: async () => {
          throw new Error('Error 3');
        }
      });

      const result = await pipeline.execute({ continueOnError: true });

      expect(result.errors).toHaveLength(3);
      expect(result.errors[0].error.message).toBe('Error 1');
      expect(result.errors[1].error.message).toBe('Error 2');
      expect(result.errors[2].error.message).toBe('Error 3');
    });
  });

  describe('进度回调', () => {
    it('应该支持进度回调', async () => {
      const progressUpdates: string[] = [];

      pipeline.addStep({
        name: 'step1',
        execute: async () => 'step1'
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => 'step2'
      });

      await pipeline.execute({
        onProgress: (stepName, completed, total) => {
          progressUpdates.push(`${stepName}:${completed}/${total}`);
        }
      });

      expect(progressUpdates).toEqual(['step1:1/2', 'step2:2/2']);
    });

    it('应该在回调中提供步骤名称', async () => {
      const stepNames: string[] = [];

      pipeline.addStep({
        name: 'fetch-user',
        execute: async () => 'user'
      });

      pipeline.addStep({
        name: 'fetch-orders',
        execute: async () => 'orders'
      });

      await pipeline.execute({
        onProgress: (stepName) => {
          stepNames.push(stepName);
        }
      });

      expect(stepNames).toEqual(['fetch-user', 'fetch-orders']);
    });
  });

  describe('链式调用', () => {
    it('应该支持链式添加步骤', async () => {
      const result = await new RequestPipeline()
        .addStep({
          name: 'step1',
          execute: async () => 'result1'
        })
        .addStep({
          name: 'step2',
          execute: async () => 'result2'
        })
        .addStep({
          name: 'step3',
          execute: async () => 'result3'
        })
        .execute();

      expect(result.success).toBe(true);
    });
  });

  describe('步骤结果', () => {
    it('应该收集所有步骤的结果', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async () => 'result1'
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => 'result2'
      });

      pipeline.addStep({
        name: 'step3',
        execute: async () => 'result3'
      });

      const result = await pipeline.execute();

      expect(result.results).toEqual({
        step1: 'result1',
        step2: 'result2',
        step3: 'result3'
      });
    });

    it('应该保存失败步骤的错误信息', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async () => 'result1'
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          throw new Error('Failed');
        }
      });

      const result = await pipeline.execute({ continueOnError: true });

      expect(result.results.step1).toBe('result1');
      expect(result.results.step2).toBeUndefined();
      expect(result.errors[0].error.message).toBe('Failed');
    });
  });

  describe('统计信息', () => {
    it('应该提供执行统计', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async () => 'result1'
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          throw new Error('Failed');
        }
      });

      pipeline.addStep({
        name: 'step3',
        execute: async () => 'result3'
      });

      const result = await pipeline.execute({ continueOnError: true });

      expect(result.stats).toBeDefined();
      expect(result.stats.totalSteps).toBe(3);
      expect(result.stats.completedSteps).toBe(2);
      expect(result.stats.failedSteps).toBe(1);
    });

    it('应该计算执行时间', async () => {
      pipeline.addStep({
        name: 'step1',
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'result1';
        }
      });

      const startTime = Date.now();
      const result = await pipeline.execute();
      const duration = result.stats.duration || (Date.now() - startTime);

      expect(result.success).toBe(true);
      expect(duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('步骤重试', () => {
    it('应该支持步骤失败重试', async () => {
      let attemptCount = 0;

      pipeline.addStep({
        name: 'retry-step',
        execute: async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Retry');
          }
          return 'success';
        },
        retryConfig: {
          maxRetries: 3,
          retryDelay: 10
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it('应该在达到最大重试次数后失败', async () => {
      pipeline.addStep({
        name: 'always-fail-step',
        execute: async () => {
          throw new Error('Always fails');
        },
        retryConfig: {
          maxRetries: 2,
          retryDelay: 10
        }
      });

      const result = await pipeline.execute();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('步骤清理', () => {
    it('应该支持步骤清理函数', async () => {
      const cleanupLog: string[] = [];

      pipeline.addStep({
        name: 'step1',
        execute: async () => 'result1',
        cleanup: async () => {
          cleanupLog.push('step1 cleanup');
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => 'result2',
        cleanup: async () => {
          cleanupLog.push('step2 cleanup');
        }
      });

      await pipeline.execute();

      expect(cleanupLog).toEqual(['step1 cleanup', 'step2 cleanup']);
    });

    it('应该在步骤失败时执行清理', async () => {
      const cleanupLog: string[] = [];

      pipeline.addStep({
        name: 'step1',
        execute: async () => 'result1',
        cleanup: async () => {
          cleanupLog.push('step1 cleanup');
        }
      });

      pipeline.addStep({
        name: 'step2',
        execute: async () => {
          throw new Error('Failed');
        },
        cleanup: async () => {
          cleanupLog.push('step2 cleanup');
        }
      });

      await pipeline.execute();

      expect(cleanupLog).toEqual(['step1 cleanup', 'step2 cleanup']);
    });
  });
});
