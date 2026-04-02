#!/usr/bin/env node

import { Command } from 'commander';
import { generateFromSwagger } from './generators/swagger-generator';
import { generateFromConfig, generateService } from './generators/config-generator';
import chalk from 'chalk';
import ora from 'ora';

const program = new Command();

program
    .name('request-gen')
    .description('自动化生成请求代码的工具')
    .version('1.0.0');

// 生成 Swagger/OpenAPI 代码
program
    .command('swagger')
    .description('从 Swagger/OpenAPI 文档生成请求代码')
    .option('-i, --input <path>', 'Swagger/OpenAPI 文档路径 (JSON/YAML)')
    .option('-o, --output <path>', '输出目录', './src/api')
    .option('-b, --base-url <url>', '基础 URL')
    .option('--with-types', '生成 TypeScript 类型定义')
    .option('--with-mock', '生成 Mock 数据')
    .action(async (options) => {
        const spinner = ora('正在解析 Swagger 文档...').start();

        try {
            await generateFromSwagger({
                input: options.input,
                output: options.output,
                baseUrl: options.baseUrl,
                withTypes: options.withTypes,
                withMock: options.withMock
            });

            spinner.succeed(chalk.green(`✅ 代码生成成功！输出目录: ${options.output}`));
        } catch (error) {
            spinner.fail(chalk.red('❌ 代码生成失败'));
            console.error(error);
            process.exit(1);
        }
    });

// 生成配置文件
program
    .command('config')
    .description('生成请求库配置文件')
    .option('-o, --output <path>', '输出文件路径', './request.config.ts')
    .option('-b, --base-url <url>', '基础 URL')
    .option('--timeout <ms>', '请求超时时间', '5000')
    .action(async (options) => {
        const spinner = ora('正在生成配置文件...').start();

        try {
            await generateFromConfig({
                output: options.output,
                baseUrl: options.baseUrl,
                timeout: parseInt(options.timeout)
            });

            spinner.succeed(chalk.green(`✅ 配置文件生成成功！路径: ${options.output}`));
        } catch (error) {
            spinner.fail(chalk.red('❌ 配置文件生成失败'));
            console.error(error);
            process.exit(1);
        }
    });

// 生成 API 服务类
program
    .command('service')
    .description('生成 API 服务类')
    .option('-n, --name <name>', '服务名称', 'api')
    .option('-o, --output <path>', '输出文件路径', './src/services')
    .option('--with-cache', '启用缓存')
    .option('--with-retry', '启用重试')
    .action(async (options) => {
        const spinner = ora('正在生成 API 服务类...');

        try {
            await generateService({
                output: options.output,
                serviceName: options.name,
                withCache: options.withCache,
                withRetry: options.withRetry,
                baseUrl: ''
            });

            spinner.succeed(chalk.green(`✅ API 服务类生成成功！路径: ${options.output}`));
        } catch (error) {
            spinner.fail(chalk.red('❌ API 服务类生成失败'));
            console.error(error);
            process.exit(1);
        }
    });

program.parse();
