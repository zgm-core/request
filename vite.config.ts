/**
 * @zgm-core/request Package Build Configuration
 * Enterprise-grade HTTP Request Library
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        dts({
            insertTypesEntry: true,
            exclude: ['**/*.test.ts', '**/*.spec.ts'],
            sourcemap: false
        })
    ],

    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'ZGMCoreRequest',
            formats: ['es', 'cjs'],
            fileName: format => `index.${format === 'es' ? 'esm.js' : 'cjs'}`
        },

        rollupOptions: {
            external: [
                'crypto',
                'url',
                'axios',
                'axios-retry',
                'crypto-js',
                'qs',
                'zod',
                '@types/crypto-js',
                '@types/qs'
            ],

            output: {
                globals: {
                    axios: 'axios',
                    'axios-retry': 'axiosRetry',
                    'crypto-js': 'CryptoJS',
                    qs: 'qs',
                    zod: 'z'
                }
            }
        },

        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: false,  // 保留 console，便于调试
                drop_debugger: true,
                pure_funcs: ['console.debug']  // 移除 console.debug
            },
            format: {
                comments: false  // 移除注释
            }
        },
        sourcemap: false,
        target: 'ES2020',
        emptyOutDir: true,
        assetsInlineLimit: 4096,
        chunkSizeWarningLimit: 1000
    },

    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },

    define: {
        __PACKAGE_NAME__: JSON.stringify('@zgm-core/request')
    }
});