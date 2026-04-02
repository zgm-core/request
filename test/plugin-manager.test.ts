/**
 * PluginManager 测试文件
 * 测试插件注册、注销、初始化、生命周期钩子等功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../src/core/plugin-manager';
import { IRequestPlugin, IPluginContext, GlobalConfig } from '../src/types/base';
import axios, { AxiosInstance } from 'axios';

describe('PluginManager - 插件管理器', () => {
  let pluginManager: PluginManager;
  let axiosInstance: AxiosInstance;
  let mockConfig: GlobalConfig;
  let mockContext: IPluginContext;

  beforeEach(() => {
    // 创建 axios 实例
    axiosInstance = axios.create({
      baseURL: 'https://api.example.com'
    });

    // 创建 mock 配置
    mockConfig = {
      baseURL: 'https://api.example.com',
      timeout: 5000,
      env: 'development',
      headers: {},
      cache: { enabled: false },
      retry: { enabled: false },
      idempotent: { enabled: false }
    };

    // 创建 mock 上下文
    mockContext = {
      request: {
        url: '/api/test',
        method: 'GET'
      } as any,
      config: mockConfig,
      response: null,
      error: null,
      timestamp: Date.now()
    };

    // 创建插件管理器
    pluginManager = new PluginManager();
  });

  describe('插件注册', () => {
    it('应该能够注册插件', () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10
      };

      pluginManager.register(plugin);

      expect(pluginManager.hasPlugin('test-plugin')).toBe(true);
    });

    it('应该能够更新已存在的插件', () => {
      const plugin1: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10
      };

      const plugin2: IRequestPlugin = {
        name: 'test-plugin',
        priority: 20
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      const plugins = pluginManager.getPlugins();
      expect(plugins.length).toBe(1);
      expect(plugins[0].priority).toBe(20);
    });

    it('应该能够注册多个插件', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 10 };
      const plugin2: IRequestPlugin = { name: 'plugin2', priority: 20 };
      const plugin3: IRequestPlugin = { name: 'plugin3', priority: 15 };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      expect(pluginManager.hasPlugin('plugin1')).toBe(true);
      expect(pluginManager.hasPlugin('plugin2')).toBe(true);
      expect(pluginManager.hasPlugin('plugin3')).toBe(true);
    });

    it('应该根据优先级排序插件', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 30 };
      const plugin2: IRequestPlugin = { name: 'plugin2', priority: 10 };
      const plugin3: IRequestPlugin = { name: 'plugin3', priority: 20 };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      const plugins = pluginManager.getPlugins();
      expect(plugins[0].name).toBe('plugin2'); // priority 10
      expect(plugins[1].name).toBe('plugin3'); // priority 20
      expect(plugins[2].name).toBe('plugin1'); // priority 30
    });

    it('没有优先级的插件应该排在最后', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 10 };
      const plugin2: IRequestPlugin = { name: 'plugin2' }; // no priority
      const plugin3: IRequestPlugin = { name: 'plugin3', priority: 20 };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      const plugins = pluginManager.getPlugins();
      expect(plugins[2].name).toBe('plugin2'); // last (no priority)
    });
  });

  describe('插件注销', () => {
    it('应该能够注销插件', () => {
      const plugin: IRequestPlugin = { name: 'test-plugin', priority: 10 };

      pluginManager.register(plugin);
      const result = pluginManager.unregister('test-plugin');

      expect(result).toBe(true);
      expect(pluginManager.hasPlugin('test-plugin')).toBe(false);
    });

    it('注销不存在的插件应该返回 false', () => {
      const result = pluginManager.unregister('non-existent-plugin');

      expect(result).toBe(false);
    });

    it('应该能够注销多个插件', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 10 };
      const plugin2: IRequestPlugin = { name: 'plugin2', priority: 20 };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      pluginManager.unregister('plugin1');
      pluginManager.unregister('plugin2');

      expect(pluginManager.hasPlugin('plugin1')).toBe(false);
      expect(pluginManager.hasPlugin('plugin2')).toBe(false);
    });
  });

  describe('插件初始化', () => {
    it('应该能够初始化所有插件', () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        init: vi.fn()
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        init: vi.fn()
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      pluginManager.initPlugins(axiosInstance, mockConfig);

      expect(plugin1.init).toHaveBeenCalledWith(axiosInstance, mockConfig);
      expect(plugin2.init).toHaveBeenCalledWith(axiosInstance, mockConfig);
    });

    it('插件初始化失败不应影响其他插件', () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        init: vi.fn()
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        init: () => {
          throw new Error('Init error');
        }
      };

      const plugin3: IRequestPlugin = {
        name: 'plugin3',
        priority: 30,
        init: vi.fn()
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      expect(() => pluginManager.initPlugins(axiosInstance, mockConfig)).not.toThrow();

      expect(plugin1.init).toHaveBeenCalled();
      expect(plugin3.init).toHaveBeenCalled();
    });

    it('没有 init 方法的插件应该被跳过', () => {
      const plugin: IRequestPlugin = {
        name: 'plugin1',
        priority: 10
        // no init method
      };

      pluginManager.register(plugin);

      expect(() => pluginManager.initPlugins(axiosInstance, mockConfig)).not.toThrow();
    });
  });

  describe('beforeRequest 钩子', () => {
    it('应该能够执行 beforeRequest 钩子', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10,
        beforeRequest: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin);

      await pluginManager.executeBeforeRequest(mockContext);

      expect(plugin.beforeRequest).toHaveBeenCalledWith(mockContext);
    });

    it('应该能够执行多个 beforeRequest 钩子', async () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        beforeRequest: vi.fn().mockResolvedValue(undefined)
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        beforeRequest: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      await pluginManager.executeBeforeRequest(mockContext);

      expect(plugin1.beforeRequest).toHaveBeenCalled();
      expect(plugin2.beforeRequest).toHaveBeenCalled();
    });

    it('beforeRequest 钩子失败不应影响其他钩子', async () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        beforeRequest: vi.fn().mockResolvedValue(undefined)
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        beforeRequest: () => {
          throw new Error('Hook error');
        }
      };

      const plugin3: IRequestPlugin = {
        name: 'plugin3',
        priority: 30,
        beforeRequest: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      await expect(pluginManager.executeBeforeRequest(mockContext)).resolves.not.toThrow();

      expect(plugin1.beforeRequest).toHaveBeenCalled();
      expect(plugin3.beforeRequest).toHaveBeenCalled();
    });

    it('没有 beforeRequest 钩子的插件应该被跳过', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10
        // no beforeRequest hook
      };

      pluginManager.register(plugin);

      await expect(pluginManager.executeBeforeRequest(mockContext)).resolves.not.toThrow();
    });
  });

  describe('afterRequest 钩子', () => {
    it('应该能够执行 afterRequest 钩子', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10,
        afterRequest: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin);

      const mockResponse = {
        data: { success: true },
        status: 200
      } as any;

      await pluginManager.executeAfterRequest(mockContext, mockResponse);

      expect(plugin.afterRequest).toHaveBeenCalledWith(mockContext, mockResponse);
    });

    it('应该能够执行多个 afterRequest 钩子', async () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        afterRequest: vi.fn().mockResolvedValue(undefined)
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        afterRequest: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      const mockResponse = {
        data: { success: true },
        status: 200
      } as any;

      await pluginManager.executeAfterRequest(mockContext, mockResponse);

      expect(plugin1.afterRequest).toHaveBeenCalled();
      expect(plugin2.afterRequest).toHaveBeenCalled();
    });

    it('afterRequest 钩子失败不应影响其他钩子', async () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        afterRequest: vi.fn().mockResolvedValue(undefined)
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        afterRequest: () => {
          throw new Error('Hook error');
        }
      };

      const plugin3: IRequestPlugin = {
        name: 'plugin3',
        priority: 30,
        afterRequest: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      const mockResponse = {
        data: { success: true },
        status: 200
      } as any;

      await expect(pluginManager.executeAfterRequest(mockContext, mockResponse)).resolves.not.toThrow();

      expect(plugin1.afterRequest).toHaveBeenCalled();
      expect(plugin3.afterRequest).toHaveBeenCalled();
    });

    it('没有 afterRequest 钩子的插件应该被跳过', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10
        // no afterRequest hook
      };

      pluginManager.register(plugin);

      const mockResponse = {
        data: { success: true },
        status: 200
      } as any;

      await expect(pluginManager.executeAfterRequest(mockContext, mockResponse)).resolves.not.toThrow();
    });
  });

  describe('onError 钩子', () => {
    it('应该能够执行 onError 钩子', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10,
        onError: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin);

      const mockError = new Error('Test error');

      await pluginManager.executeOnError(mockContext, mockError);

      expect(plugin.onError).toHaveBeenCalledWith(mockContext, mockError);
    });

    it('应该能够执行多个 onError 钩子', async () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        onError: vi.fn().mockResolvedValue(undefined)
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        onError: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      const mockError = new Error('Test error');

      await pluginManager.executeOnError(mockContext, mockError);

      expect(plugin1.onError).toHaveBeenCalled();
      expect(plugin2.onError).toHaveBeenCalled();
    });

    it('onError 钩子失败不应影响其他钩子', async () => {
      const plugin1: IRequestPlugin = {
        name: 'plugin1',
        priority: 10,
        onError: vi.fn().mockResolvedValue(undefined)
      };

      const plugin2: IRequestPlugin = {
        name: 'plugin2',
        priority: 20,
        onError: () => {
          throw new Error('Hook error');
        }
      };

      const plugin3: IRequestPlugin = {
        name: 'plugin3',
        priority: 30,
        onError: vi.fn().mockResolvedValue(undefined)
      };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);
      pluginManager.register(plugin3);

      const mockError = new Error('Test error');

      await expect(pluginManager.executeOnError(mockContext, mockError)).resolves.not.toThrow();

      expect(plugin1.onError).toHaveBeenCalled();
      expect(plugin3.onError).toHaveBeenCalled();
    });

    it('没有 onError 钩子的插件应该被跳过', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10
        // no onError hook
      };

      pluginManager.register(plugin);

      const mockError = new Error('Test error');

      await expect(pluginManager.executeOnError(mockContext, mockError)).resolves.not.toThrow();
    });
  });

  describe('插件查询', () => {
    it('应该能够检查插件是否已注册', () => {
      const plugin: IRequestPlugin = { name: 'test-plugin', priority: 10 };

      expect(pluginManager.hasPlugin('test-plugin')).toBe(false);

      pluginManager.register(plugin);

      expect(pluginManager.hasPlugin('test-plugin')).toBe(true);
    });

    it('应该能够获取所有插件', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 10 };
      const plugin2: IRequestPlugin = { name: 'plugin2', priority: 20 };

      pluginManager.register(plugin1);
      pluginManager.register(plugin2);

      const plugins = pluginManager.getPlugins();

      expect(plugins.length).toBe(2);
      expect(plugins).toContainEqual(plugin1);
      expect(plugins).toContainEqual(plugin2);
    });

    it('获取的插件列表应该是只读副本', () => {
      const plugin: IRequestPlugin = { name: 'test-plugin', priority: 10 };

      pluginManager.register(plugin);

      const plugins = pluginManager.getPlugins();
      plugins.pop(); // 尝试修改返回的数组

      const plugins2 = pluginManager.getPlugins();
      expect(plugins2.length).toBe(1);
    });
  });

  describe('构造函数', () => {
    it('应该能够在构造函数中传入插件', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 10 };
      const plugin2: IRequestPlugin = { name: 'plugin2', priority: 20 };

      const manager = new PluginManager({
        plugins: [plugin1, plugin2]
      });

      expect(manager.hasPlugin('plugin1')).toBe(true);
      expect(manager.hasPlugin('plugin2')).toBe(true);
    });

    it('构造函数中的插件应该根据优先级排序', () => {
      const plugin1: IRequestPlugin = { name: 'plugin1', priority: 30 };
      const plugin2: IRequestPlugin = { name: 'plugin2', priority: 10 };
      const plugin3: IRequestPlugin = { name: 'plugin3', priority: 20 };

      const manager = new PluginManager({
        plugins: [plugin1, plugin2, plugin3]
      });

      const plugins = manager.getPlugins();
      expect(plugins[0].name).toBe('plugin2');
      expect(plugins[1].name).toBe('plugin3');
      expect(plugins[2].name).toBe('plugin1');
    });
  });

  describe('边界情况', () => {
    it('应该能够处理没有钩子的插件', () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10
        // no hooks
      };

      pluginManager.register(plugin);

      expect(pluginManager.hasPlugin('test-plugin')).toBe(true);
    });

    it('应该能够处理异步钩子', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10,
        beforeRequest: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      };

      pluginManager.register(plugin);

      const startTime = Date.now();
      await pluginManager.executeBeforeRequest(mockContext);
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it('应该能够处理钩子返回 Promise', async () => {
      const plugin: IRequestPlugin = {
        name: 'test-plugin',
        priority: 10,
        afterRequest: vi.fn().mockResolvedValue(Promise.resolve())
      };

      pluginManager.register(plugin);

      const mockResponse = {
        data: { success: true },
        status: 200
      } as any;

      await expect(pluginManager.executeAfterRequest(mockContext, mockResponse)).resolves.not.toThrow();
    });
  });
});
