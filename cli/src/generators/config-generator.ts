import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/**
 * 配置生成选项
 */
interface ConfigGenerateOptions {
    output: string;
    baseUrl?: string;
    timeout?: number;
    serviceName?: string;
    withCache?: boolean;
    withRetry?: boolean;
}

/**
 * 生成配置文件
 */
export async function generateFromConfig(options: ConfigGenerateOptions): Promise<void> {
    const configTemplate = `/**
 * 请求库配置
 * 自动生成，请根据实际情况修改
 */

import { $http } from '@zgm-core/request';

const config = {
    // 基础 URL
    baseURL: '${options.baseUrl || process.env.API_BASE_URL || 'https://api.example.com'}',

    // 超时时间（毫秒）
    timeout: ${options.timeout || 5000},

    // 环境配置
    env: process.env.NODE_ENV || 'development',

    // 是否开启请求转换
    defaultTransformData: true,

    // 拦截器配置
    interceptors: {
        request: (config) => {
            // 请求拦截：添加 token 等
            // const token = localStorage.getItem('token');
            // if (token) {
            //     config.headers.Authorization = \`Bearer \${token}\`;
            // }
            return config;
        },
        response: (response) => {
            // 响应拦截：统一处理响应数据
            return response;
        },
        error: (error) => {
            // 错误拦截：统一处理错误
            console.error('请求错误:', error);
            return Promise.reject(error);
        }
    },

    // 缓存配置
    cache: {
        enabled: true,
        defaultTTL: 60000, // 1分钟
        storageType: 'memory',
        maxSize: 10 * 1024 * 1024 // 10MB
    },

    // 重试配置
    retry: {
        enabled: true,
        retries: 3,
        retryDelay: (retryCount) => Math.pow(2, retryCount) * 1000,
        retryCondition: (error) => {
            // 网络错误或 5xx 错误时重试
            return !error.response || error.response.status >= 500;
        }
    },

    // 请求取消配置
    requestCancel: {
        enabled: true,
        cancelTarget: 'previous'
    },

    // 幂等性配置
    idempotent: {
        enabled: false,
        ttl: 60000
    }
};

// 初始化配置
$http.configure(config);

export default config;
`;

    const dir = path.dirname(options.output);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(options.output, configTemplate);
    console.log(chalk.green('✅ 配置文件生成完成'));
}

/**
 * 生成 API 服务类
 */
export async function generateService(options: ConfigGenerateOptions): Promise<void> {
    const pascalCase = (str: string): string =>
        str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
    const camelCase = (str: string): string =>
        str.replace(/[-_](\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());

    const serviceName = options.serviceName || 'api';

    const serviceTemplate = `/**
 * ${pascalCase(serviceName)} API 服务
 * 自动生成，请根据实际接口补充
 */

import { $http } from '@zgm-core/request';

export class ${pascalCase(serviceName)}Service {
    private baseUrl = '${options.baseUrl || 'https://api.example.com'}';

    /**
     * 示例 GET 请求
     */
    public async getList(params?: any): Promise<any> {
        return $http.get('/api/list', params${options.withCache ? ', { cache: { enabled: true } }' : ''});
    }

    /**
     * 示例 POST 请求
     */
    public async create(data: any): Promise<any> {
        return $http.post('/api/create', data${options.withRetry ? ', { retry: { enabled: true } }' : ''});
    }

    /**
     * 示例 PUT 请求
     */
    public async update(id: string, data: any): Promise<any> {
        return $http.put(\`/api/update/\${id}\`, data);
    }

    /**
     * 示例 DELETE 请求
     */
    public async delete(id: string): Promise<any> {
        return $http.delete(\`/api/delete/\${id}\`);
    }
}

// 导出单例
export const ${camelCase(serviceName)} = new ${pascalCase(serviceName)}Service();
`;

    const dir = path.dirname(options.output);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(options.output, serviceTemplate);
    console.log(chalk.green('✅ API 服务类生成完成'));
}
