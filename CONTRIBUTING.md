# 贡献指南

感谢你考虑为 @zgm-core/request 做贡献！

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发指南](#开发指南)
- [提交规范](#提交规范)
- [Pull Request 流程](#pull-request-流程)

## 行为准则

本项目采用贡献者公约作为行为准则。参与此项目即表示你同意遵守其条款。请阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) 了解详情。

## 如何贡献

### 报告 Bug

如果你发现了 bug，请创建一个 [Issue](https://github.com/zgm-core/request/issues)，包含以下信息：

- 简洁明了的标题
- 详细的问题描述
- 复现步骤
- 预期行为和实际行为
- 环境信息（Node 版本、浏览器版本等）
- 可能的解决方案

### 提出新功能

如果你有新功能的想法，请创建一个 [Issue](https://github.com/zgm-core/request/issues)，包含以下信息：

- 功能描述
- 使用场景
- 可能的实现方式

### 改进文档

文档改进包括：

- 修复拼写错误
- 改进示例代码
- 补充缺失的文档
- 翻译文档

## 开发指南

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0（推荐）或 npm >= 9.0.0

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/zgm-core/request.git
cd request

# 安装依赖
npm install

# 运行测试
npm test

# 构建
npm run build

# 开发模式（监听文件变化）
npm run dev
```

### 项目结构

```
request/
├── src/           # 源代码
│   ├── core/      # 核心模块
│   ├── plugins/   # 内置插件
│   ├── types/     # 类型定义
│   └── utils/     # 工具函数
├── test/          # 测试文件
├── cli/           # CLI 工具
└── docs/          # 文档
```

### 编写测试

- 所有新功能必须包含测试
- 测试文件放在 `test/` 目录
- 使用 Vitest 框架
- 测试覆盖率应保持在 80% 以上

```typescript
// test/example.test.ts
import { describe, it, expect } from 'vitest';

describe('Example', () => {
    it('should work', () => {
        expect(true).toBe(true);
    });
});
```

### 代码风格

- 使用 TypeScript
- 遵循 ESLint 规则
- 使用有意义的变量名
- 添加必要的注释

## 提交规范

本项目采用 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

### 提交格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型（type）

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档更新 |
| `style` | 代码格式（不影响功能） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具相关 |
| `ci` | CI/CD 相关 |

### 示例

```bash
# 新功能
git commit -m "feat: add websocket support"

# 修复 bug
git commit -m "fix: correct retry delay calculation"

# 文档更新
git commit -m "docs: update installation guide"

# 带范围
git commit -m "fix(cache): resolve memory leak issue"
```

## Pull Request 流程

### 1. Fork 仓库

```bash
# Fork 后克隆你的仓库
git clone https://github.com/YOUR_USERNAME/request.git
```

### 2. 创建分支

```bash
git checkout -b feature/your-feature-name
```

### 3. 进行更改

- 编写代码
- 添加测试
- 更新文档

### 4. 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage
```

### 5. 提交更改

```bash
git add .
git commit -m "feat: add amazing feature"
```

### 6. 推送分支

```bash
git push origin feature/your-feature-name
```

### 7. 创建 Pull Request

- 前往 GitHub 仓库页面
- 点击 "New Pull Request"
- 填写 PR 模板
- 等待代码审查

### PR 检查清单

- [ ] 代码通过所有测试
- [ ] 新功能有对应的测试
- [ ] 文档已更新
- [ ] 提交信息符合规范
- [ ] PR 标题清晰明了

## 发布流程

只有维护者可以发布新版本。

```bash
# 更新版本号
npm version patch|minor|major

# 构建
npm run build

# 发布
npm publish
```

## 获取帮助

如果你有任何问题，可以：

- 创建 [Issue](https://github.com/zgm-core/request/issues)
- 发送邮件至 2273204759@qq.com

---

再次感谢你的贡献！
