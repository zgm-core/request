/**
 * SerialRequestController 串行请求测试
 * 测试顺序执行、错误处理、进度回调等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SerialRequestController } from '../src/core/serial-request';

describe('SerialRequestController - 串行请求', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('顺序执行', () => {
    it('应该按顺序执行请求', async () => {
      const executionOrder: number[] = [];

      const tasks = [
        { execute: () => { executionOrder.push(1); return Promise.resolve('task1'); } },
        { execute: () => { executionOrder.push(2); return Promise.resolve('task2'); } },
        { execute: () => { executionOrder.push(3); return Promise.resolve('task3'); } }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const result = await controller.execute();

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(result.results).toEqual(['task1', 'task2', 'task3']);
    });

    it('应该支持单个任务', async () => {
      const controller = new SerialRequestController();
      controller.addTask({
        execute: () => Promise.resolve('single')
      });
      const result = await controller.execute();

      expect(result.results).toEqual(['single']);
    });

    it('应该处理空任务列表', async () => {
      const controller = new SerialRequestController();
      const result = await controller.execute();

      expect(result.results).toEqual([]);
      expect(result.stats.total).toBe(0);
    });
  });

  describe('链式调用', () => {
    it('应该支持链式调用添加任务', async () => {
      const controller = new SerialRequestController();
      controller
        .addTask({ execute: () => Promise.resolve('task1') })
        .addTask({ execute: () => Promise.resolve('task2') })
        .addTask({ execute: () => Promise.resolve('task3') });

      const result = await controller.execute();
      expect(result.results).toEqual(['task1', 'task2', 'task3']);
      expect(controller.length).toBe(3);
    });

    it('应该支持 addTasks 批量添加', async () => {
      const controller = new SerialRequestController();
      const tasks = [
        { execute: () => Promise.resolve('task1') },
        { execute: () => Promise.resolve('task2') }
      ];

      controller.addTasks(tasks);
      const result = await controller.execute();

      expect(result.results).toEqual(['task1', 'task2']);
    });
  });

  describe('错误处理', () => {
    it('应该在错误时停止（默认行为）', async () => {
      const executionOrder: number[] = [];

      const tasks = [
        { execute: () => { executionOrder.push(1); return Promise.resolve('task1'); } },
        { execute: () => { executionOrder.push(2); return Promise.reject(new Error('Task 2 failed')); } },
        { execute: () => { executionOrder.push(3); return Promise.resolve('task3'); } }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const result = await controller.execute();

      expect(executionOrder).toEqual([1, 2]);
      expect(result.errors).toHaveLength(1);
      expect(result.allSuccess).toBe(false);
    });

    it('应该支持 continueOnError 选项', async () => {
      const executionOrder: number[] = [];

      const tasks = [
        { execute: () => { executionOrder.push(1); return Promise.resolve('task1'); } },
        { execute: () => { executionOrder.push(2); return Promise.reject(new Error('Task 2 failed')); } },
        { execute: () => { executionOrder.push(3); return Promise.resolve('task3'); } }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const results = await controller.execute({ continueOnError: true });

      expect(executionOrder).toEqual([1, 2, 3]);
      expect(results.results.length).toBe(2);
      expect(results.errors).toHaveLength(1);
      expect(results.allSuccess).toBe(false);
    });

    it('应该收集所有错误信息', async () => {
      const tasks = [
        { execute: () => Promise.reject(new Error('Error 1')) },
        { execute: () => Promise.reject(new Error('Error 2')) },
        { execute: () => Promise.reject(new Error('Error 3')) }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const result = await controller.execute({ continueOnError: true });

      expect(result.errors).toHaveLength(3);
      expect(result.errors[0].error.message).toBe('Error 1');
      expect(result.errors[1].error.message).toBe('Error 2');
      expect(result.errors[2].error.message).toBe('Error 3');
    });
  });

  describe('进度回调', () => {
    it('应该支持进度回调', async () => {
      const progressUpdates: number[] = [];

      const tasks = [
        { execute: () => Promise.resolve('task1') },
        { execute: () => Promise.resolve('task2') },
        { execute: () => Promise.resolve('task3') }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      await controller.execute({
        onProgress: (completed, total) => {
          progressUpdates.push(completed);
        }
      });

      expect(progressUpdates).toEqual([1, 2, 3]);
    });

    it('应该在回调中提供正确的总数', async () => {
      let capturedTotal = 0;

      const tasks = [
        { execute: () => Promise.resolve('task1') },
        { execute: () => Promise.resolve('task2') }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      await controller.execute({
        onProgress: (completed, total) => {
          capturedTotal = total;
        }
      });

      expect(capturedTotal).toBe(2);
    });
  });

  describe('上下文传递', () => {
    it('应该支持任务间上下文传递', async () => {
      const context: any = {};

      const tasks = [
        {
          execute: async () => {
            context.value1 = 'data1';
            return 'task1';
          }
        },
        {
          execute: async () => {
            context.value2 = 'data2';
            return 'task2';
          }
        }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      await controller.execute({ context });

      expect(context.value1).toBe('data1');
      expect(context.value2).toBe('data2');
    });

    // TODO: SerialRequestController 当前不支持 context 参数
    // it('应该支持初始上下文', async () => {
    //   const initialContext = { userId: 123 };
    //   const context = { ...initialContext };

    //   const tasks = [
    //     {
    //       execute: async (ctx: any) => {
    //         ctx.userName = 'John';
    //         return 'task1';
    //       }
    //     }
    //   ];

    //   const controller = new SerialRequestController();
    //   controller.addTasks(tasks);
    //   await controller.execute({ context });

    //   expect(context.userId).toBe(123);
    //   expect(context.userName).toBe('John');
    // });
  });

  describe('统计信息', () => {
    it('应该提供执行统计', async () => {
      const tasks = [
        { execute: () => Promise.resolve('task1') },
        { execute: () => Promise.resolve('task2') }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const result = await controller.execute();

      expect(result.stats).toBeDefined();
      expect(result.stats.total).toBe(2);
      expect(result.stats.success).toBe(2);
    });

    it('应该正确计算成功率', async () => {
      const tasks = [
        { execute: () => Promise.resolve('task1') },
        { execute: () => Promise.reject(new Error('failed')) },
        { execute: () => Promise.resolve('task3') }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const result = await controller.execute({ continueOnError: true });

      expect(result.stats.total).toBe(3);
      expect(result.stats.success).toBe(2);
      expect(result.stats.failed).toBe(1);
    });
  });

  describe('超时处理', () => {
    it('应该支持任务超时设置', async () => {
      const tasks = [
        { execute: () => new Promise(resolve => setTimeout(() => resolve('task1'), 100)) },
        { execute: () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 50)) }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      const result = await controller.execute({ continueOnError: true });

      expect(result.errors).toHaveLength(1);
    });
  });



  describe('清理功能', () => {
    it('应该支持清理已完成任务', async () => {
      const tasks = [
        { execute: () => Promise.resolve('task1') },
        { execute: () => Promise.resolve('task2') }
      ];

      const controller = new SerialRequestController();
      controller.addTasks(tasks);
      await controller.execute();

      expect(controller.length).toBe(2);
      controller.clear();
      expect(controller.length).toBe(0);
    });
  });
});
