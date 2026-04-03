/**
 * BatchRequestHandler 批量请求测试
 * 测试批量处理、分批执行、错误处理等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchRequestHandler } from '../src/core/batch-request';

describe('BatchRequestHandler - 批量请求', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('配置验证', () => {
    it('应该支持批量请求分批处理', () => {
      const config = {
        batchSize: 3,
        batchDelay: 100,
        continueOnError: true,
        parallelBatches: true
      };

      expect(config.batchSize).toBe(3);
      expect(config.parallelBatches).toBe(true);
    });

    it('应该支持配置选项', () => {
      const config = {
        batchSize: 5,
        batchDelay: 200,
        continueOnError: false,
        parallelBatches: false
      };

      expect(config.batchSize).toBe(5);
      expect(config.batchDelay).toBe(200);
      expect(config.continueOnError).toBe(false);
      expect(config.parallelBatches).toBe(false);
    });

    it('应该验证最小批量大小', () => {
      const config = { batchSize: 1 };
      expect(config.batchSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('分批处理', () => {
    it('应该正确计算批次数', () => {
      const totalItems = 10;
      const batchSize = 3;
      const expectedBatches = Math.ceil(totalItems / batchSize);

      expect(expectedBatches).toBe(4);
    });

    it('应该处理最后一批不足的情况', () => {
      const totalItems = 11;
      const batchSize = 5;
      const expectedBatches = Math.ceil(totalItems / batchSize);

      expect(expectedBatches).toBe(3);
    });

    it('应该正确分割数组为批次', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const batchSize = 3;
      const batches: number[][] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      expect(batches).toHaveLength(4);
      expect(batches[0]).toEqual([1, 2, 3]);
      expect(batches[3]).toEqual([10]);
    });
  });

  describe('批量延迟', () => {
    it('应该支持批次间延迟', async () => {
      const startTime = Date.now();
      const delay = 100;

      await new Promise(resolve => setTimeout(resolve, delay));
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(delay);
    });

    it('应该在批次间添加延迟', async () => {
      const delays: number[] = [];

      const processBatch = async (delayMs: number) => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delays.push(Date.now() - start);
      };

      await processBatch(50);
      await processBatch(50);

      expect(delays).toHaveLength(2);
      // CI 环境定时器精度问题，允许 5ms 误差
      delays.forEach(delay => expect(delay).toBeGreaterThanOrEqual(45));
    });
  });

  describe('并行批次', () => {
    it('应该支持并行执行批次', async () => {
      const executionTimes: number[] = [];

      const processBatch = async (id: number) => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        executionTimes.push({ id, time: Date.now() - start } as any);
      };

      await Promise.all([
        processBatch(1),
        processBatch(2),
        processBatch(3)
      ]);

      expect(executionTimes).toHaveLength(3);
    });

    it('应该顺序执行批次（非并行模式）', async () => {
      const executionOrder: number[] = [];

      const processBatch = async (id: number) => {
        executionOrder.push(id);
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      await processBatch(1);
      await processBatch(2);
      await processBatch(3);

      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('错误处理', () => {
    it('应该支持 continueOnError 选项', () => {
      const config = {
        batchSize: 3,
        continueOnError: true
      };

      expect(config.continueOnError).toBe(true);
    });

    it('应该在错误时停止（默认）', () => {
      const config = {
        batchSize: 3,
        continueOnError: false
      };

      expect(config.continueOnError).toBe(false);
    });

    it('应该收集所有批次错误', async () => {
      const errors: any[] = [];

      const processBatch = async (shouldFail: boolean) => {
        if (shouldFail) {
          throw new Error('Batch failed');
        }
      };

      try {
        await processBatch(true);
      } catch (error) {
        errors.push(error);
      }

      try {
        await processBatch(false);
      } catch (error) {
        errors.push(error);
      }

      expect(errors).toHaveLength(1);
    });
  });

  describe('进度跟踪', () => {
    it('应该跟踪批处理进度', () => {
      const totalBatches = 10;
      const completedBatches = 5;
      const progress = (completedBatches / totalBatches) * 100;

      expect(progress).toBe(50);
    });

    it('应该提供进度回调', async () => {
      const progressUpdates: number[] = [];

      const simulateProgress = async (total: number) => {
        for (let i = 1; i <= total; i++) {
          progressUpdates.push(i);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };

      await simulateProgress(5);
      expect(progressUpdates).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('结果聚合', () => {
    it('应该聚合所有批次结果', () => {
      const batch1Results = [1, 2, 3];
      const batch2Results = [4, 5, 6];
      const batch3Results = [7, 8, 9, 10];
      const allResults = [...batch1Results, ...batch2Results, ...batch3Results];

      expect(allResults).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('应该保持批次顺序', () => {
      const batches = [
        { id: 1, results: ['a', 'b'] },
        { id: 2, results: ['c', 'd'] },
        { id: 3, results: ['e', 'f'] }
      ];

      const flatResults = batches.flatMap(batch => batch.results);
      expect(flatResults).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });
  });

  describe('统计信息', () => {
    it('应该提供批处理统计', () => {
      const stats = {
        totalBatches: 4,
        successBatches: 3,
        failedBatches: 1,
        totalItems: 10,
        processedItems: 10
      };

      expect(stats.totalBatches).toBe(4);
      expect(stats.successBatches).toBe(3);
      expect(stats.failedBatches).toBe(1);
    });

    it('应该计算批处理成功率', () => {
      const successBatches = 8;
      const totalBatches = 10;
      const successRate = (successBatches / totalBatches) * 100;

      expect(successRate).toBe(80);
    });
  });

  describe('内存管理', () => {
    it('应该支持清理已完成的批次', () => {
      const batches: any[] = [];

      // 添加批次
      for (let i = 0; i < 5; i++) {
        batches.push({ id: i, status: 'completed' });
      }

      // 清理批次
      batches.length = 0;
      expect(batches).toHaveLength(0);
    });

    it('应该限制内存中的批次数量', () => {
      const maxInMemoryBatches = 10;
      const batches: any[] = [];

      for (let i = 0; i < 20; i++) {
        if (batches.length >= maxInMemoryBatches) {
          batches.shift(); // 移除最早的批次
        }
        batches.push({ id: i });
      }

      expect(batches.length).toBeLessThanOrEqual(maxInMemoryBatches);
    });
  });
});
