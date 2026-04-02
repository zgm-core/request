import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - Handlebars may not have type definitions
import Handlebars from 'handlebars';
import chalk from 'chalk';
import * as yaml from 'js-yaml';

/**
 * Swagger 接口定义
 */
interface SwaggerPath {
    get?: SwaggerOperation;
    post?: SwaggerOperation;
    put?: SwaggerOperation;
    delete?: SwaggerOperation;
    patch?: SwaggerOperation;
}

interface SwaggerOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: any[];
    requestBody?: any;
    responses?: any;
}

interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    info?: {
        title: string;
        version: string;
    };
    servers?: Array<{ url: string }>;
    paths: Record<string, SwaggerPath>;
    components?: {
        schemas?: Record<string, any>;
    };
}

/**
 * 生成选项
 */
interface GenerateOptions {
    input: string;
    output: string;
    baseUrl?: string;
    withTypes?: boolean;
    withMock?: boolean;
}

/**
 * 注册 Handlebars helpers
 */
function registerHelpers(): void {
    Handlebars.registerHelper('pascalCase', (str: string) => {
        return str
            .replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
            .replace(/^\w/, (c: string) => c.toUpperCase());
    });

    Handlebars.registerHelper('camelCase', (str: string) => {
        return str
            .replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
            .replace(/^\w/, (c: string) => c.toLowerCase());
    });

    Handlebars.registerHelper('kebabCase', (str: string) => {
        return str
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()
            .replace(/^-/, '');
    });

    Handlebars.registerHelper('lowerCase', (str: string) => {
        return str.toLowerCase();
    });

    Handlebars.registerHelper('getType', (schema: any) => {
        // 简化的类型推断
        if (schema.type === 'string') return 'string';
        if (schema.type === 'number') return 'number';
        if (schema.type === 'integer') return 'number';
        if (schema.type === 'boolean') return 'boolean';
        if (schema.type === 'array') return 'any[]';
        if (schema.$ref) {
            return schema.$ref.replace(/.*\//, '');
        }
        return 'any';
    });
}

// 注册 helpers
registerHelpers();

/**
 * Swagger 代码生成器
 */
export async function generateFromSwagger(options: GenerateOptions): Promise<void> {
    // 1. 读取并解析 Swagger 文档
    const swaggerContent = fs.readFileSync(options.input, 'utf-8');
    const spec: SwaggerSpec = parseSwaggerContent(swaggerContent, options.input);

    // 2. 准备输出目录
    if (!fs.existsSync(options.output)) {
        fs.mkdirSync(options.output, { recursive: true });
    }

    // 3. 生成类型定义
    if (options.withTypes) {
        await generateTypes(spec, options.output);
    }

    // 4. 生成 API 服务
    await generateApiServices(spec, options);

    // 5. 生成 Mock 数据（可选）
    if (options.withMock) {
        await generateMockData(spec, path.join(options.output, '__mock__'));
    }

    console.log(chalk.green('✅ 所有代码生成完成！'));
}

/**
 * 解析 Swagger 内容
 */
function parseSwaggerContent(content: string, filePath: string): SwaggerSpec {
    const ext = path.extname(filePath);

    if (ext === '.json') {
        return JSON.parse(content);
    } else if (['.yaml', '.yml'].includes(ext)) {
        return yaml.load(content) as SwaggerSpec;
    }

    throw new Error('不支持的文件格式，仅支持 JSON 和 YAML');
}

/**
 * 生成 TypeScript 类型定义
 */
async function generateTypes(spec: SwaggerSpec, outputDir: string): Promise<void> {
    const typesDir = path.join(outputDir, 'types');
    if (!fs.existsSync(typesDir)) {
        fs.mkdirSync(typesDir, { recursive: true });
    }

    // 生成基础类型
    const baseTypesTemplate = Handlebars.compile(BASE_TYPES_TEMPLATE);
    const baseTypesCode = baseTypesTemplate({
        title: spec.info?.title || 'API',
        version: spec.info?.version || '1.0.0'
    });

    fs.writeFileSync(path.join(typesDir, 'index.ts'), baseTypesCode);

    // 生成接口类型
    if (spec.components?.schemas) {
        const schemasTemplate = Handlebars.compile(SCHEMAS_TEMPLATE);
        const schemasCode = schemasTemplate({
            schemas: Object.entries(spec.components.schemas)
        });

        fs.writeFileSync(path.join(typesDir, 'schemas.ts'), schemasCode);
    }

    console.log(chalk.green('✅ 类型定义生成完成'));
}

/**
 * 生成 API 服务
 */
async function generateApiServices(spec: SwaggerSpec, options: GenerateOptions): Promise<void> {
    // 按 tags 分组接口
    const services: Record<string, any[]> = {};

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!operation) continue;

            const tag = operation.tags?.[0] || 'default';
            if (!services[tag]) {
                services[tag] = [];
            }

            services[tag].push({
                path,
                method,
                operationId: operation.operationId || `${method}${path.replace(/\//g, '-')}`,
                summary: operation.summary || '',
                description: operation.description || '',
                parameters: operation.parameters || [],
                requestBody: operation.requestBody,
                responses: operation.responses
            });
        }
    }

    // 为每个 tag 生成服务文件
    for (const [serviceName, endpoints] of Object.entries(services)) {
        const serviceTemplate = Handlebars.compile(SERVICE_TEMPLATE);
        const serviceCode = serviceTemplate({
            serviceName: serviceName,
            className: serviceName,
            baseUrl: options.baseUrl || spec.servers?.[0]?.url || '',
            endpoints
        });

        const fileName = `${serviceName.replace(/([A-Z])/g, '-$1').toLowerCase()}.service.ts`;
        fs.writeFileSync(path.join(options.output, fileName), serviceCode);
    }

    // 生成索引文件
    const indexTemplate = Handlebars.compile(INDEX_TEMPLATE);
    const indexCode = indexTemplate({
        services: Object.keys(services)
    });

    fs.writeFileSync(path.join(options.output, 'index.ts'), indexCode);

    console.log(chalk.green(`✅ API 服务生成完成，共 ${Object.keys(services).length} 个服务`));
}

/**
 * 生成 Mock 数据
 */
async function generateMockData(spec: SwaggerSpec, outputDir: string): Promise<void> {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const mockData: Record<string, any> = {};

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!operation) continue;

            const key = `${method.toUpperCase()} ${path}`;
            const response200 = operation.responses?.['200'];
            if (response200?.content?.['application/json']?.schema) {
                mockData[key] = generateMockFromSchema(
                    response200.content['application/json'].schema
                );
            }
        }
    }

    fs.writeFileSync(path.join(outputDir, 'mock-data.ts'), `export const mockData = ${JSON.stringify(mockData, null, 2)};`);

    console.log(chalk.green('✅ Mock 数据生成完成'));
}

/**
 * 从 Schema 生成 Mock 数据
 */
function generateMockFromSchema(schema: any): any {
    if (!schema) return {};

    if (schema.$ref) {
        return { $ref: schema.$ref };
    }

    if (schema.type === 'object') {
        const result: any = {};
        if (schema.properties) {
            for (const [key, value] of Object.entries(schema.properties)) {
                result[key] = generateMockFromSchema(value);
            }
        }
        return result;
    }

    if (schema.type === 'array') {
        return [generateMockFromSchema(schema.items || {})];
    }

    if (schema.type === 'string') {
        return schema.example || 'string';
    }

    if (schema.type === 'number' || schema.type === 'integer') {
        return schema.example || 0;
    }

    if (schema.type === 'boolean') {
        return schema.example || true;
    }

        return null;
}

// ============ Handlebars 模板 ============

const BASE_TYPES_TEMPLATE = `/**
 * API 类型定义
 * 生成时间: {{date}}
 * 来源: {{title}} v{{version}}
 */

export interface ApiResponse<T = any> {
    code: number;
    message: string;
    data: T;
    success: boolean;
}

export interface PaginationParams {
    page: number;
    pageSize: number;
}

export interface PaginationResult<T> {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
}
`;

const SCHEMAS_TEMPLATE = `/**
 * 数据模型类型定义
 */

{{#each schemas}}
export interface {{pascalCase @key}} {
{{#each this.properties}}
    {{@key}}: {{getType this}};{{#if this.description}} // {{this.description}}{{/if}}
{{/each}}
}
{{/each}}
`;

const SERVICE_TEMPLATE = `/**
 * {{className}} 服务
 * 自动生成，请勿手动修改
 */

import { $http } from '@zgm-core/request';

export class {{className}}Service {
    private baseUrl = '{{baseUrl}}';

{{#each endpoints}}
    /**
     * {{summary}}
     {{#if description}}
     * {{description}}
     {{/if}}
     */
    public async {{camelCase operationId}}({{#if parameters.length}}params?: any{{/if}}{{#if requestBody}}data?: any{{/if}}): Promise<any> {
        return $http.{{lowerCase method}}(
            \`{{path}}\`,
            {{#if requestBody}}data{{else}}params{{/if}}
        );
    }

{{/each}}
}

export const {{kebabCase serviceName}} = new {{className}}Service();
`;

const INDEX_TEMPLATE = `/**
 * API 服务入口
 */

{{#each services}}
export * from './{{kebabCase this}}.service';
{{/each}}
`;
