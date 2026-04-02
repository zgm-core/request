# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-04-02

### Added
- **统一 API 入口**: 通过 `$http` 变量统一导出所有功能，用户无需实例化
- **基础请求方法**: `get`, `post`, `put`, `patch`, `delete`
- **全局配置**: `configure()` 方法支持 baseURL、timeout、headers 等配置
- **自动重试**: 指数退避 + 随机抖动策略，避免雪崩效应
- **多级缓存**: 支持 memory、localStorage、sessionStorage
- **请求取消**: 自动取消重复请求，支持 previous/current 策略
- **WebSocket**: 自动重连、心跳保活、消息队列
- **并发控制**: 动态调整并发数、熔断器、优先级队列
- **批量请求**: 自动分批执行，支持并行/串行模式
- **串行请求**: 按顺序执行，支持依赖传递
- **管道请求**: 步骤间自动传递数据，支持条件执行
- **请求去重**: 合并相同时刻的相同请求
- **请求节流**: 基于令牌桶算法的限流控制
- **幂等控制**: 防止重复提交，自定义幂等键
- **性能监控**: P50/P90/P99 响应时间统计
- **CLI 工具**: 从 Swagger/OpenAPI 自动生成代码
- **TypeScript**: 完整类型定义和智能提示

### Changed
- 重构导出方式，统一到 `$http` 命名空间
- 简化 API 设计，用户无需 `new` 实例化

### Documentation
- 完整的 README.md 文档
- API 参考文档 (`docs/api.md`)
- 示例集合 (`docs/examples.md`)
- 贡献指南 (`CONTRIBUTING.md`)
- 行为准则 (`CODE_OF_CONDUCT.md`)

---

## 版本说明

### 版本号规则

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号 (MAJOR)**: 不兼容的 API 修改
- **次版本号 (MINOR)**: 向下兼容的功能性新增
- **修订号 (PATCH)**: 向下兼容的问题修正

### 升级指南

```bash
# 查看当前版本
npm list @zgm-core/request

# 安装指定版本
npm install @zgm-core/request@1.0.0

# 安装最新版本
npm install @zgm-core/request@latest
```

---

[Unreleased]: https://github.com/zgm-core/request/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/zgm-core/request/releases/tag/v1.0.0
