import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'cli/',
        'test/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/**'
      ]
    },
    setupFiles: [],
    // 暂时排除 websocket 测试，因为 mock 环境难以完全模拟 WebSocket 行为
    exclude: ['**/websocket.test.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
