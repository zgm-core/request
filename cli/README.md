# Request CLI

自动化请求代码生成工具

## 安装

\`\`\`bash
npm install -g @zgm-core/request
\`\`\`

## 使用

### 1. 从 Swagger/OpenAPI 生成代码

\`\`\`bash
# 基础用法
request-gen swagger -i swagger.json -o ./src/api

# 完整选项
request-gen swagger \\
  -i ./docs/swagger.json \\
  -o ./src/api \\
  -b https://api.example.com \\
  --with-types \\
  --with-mock
\`\`\`

**选项说明：**
- `-i, --input <path>`: Swagger/OpenAPI 文档路径（必需）
- `-o, --output <path>`: 输出目录（默认：./src/api）
- `-b, --base-url <url>`: 基础 URL（会覆盖文档中的）
- `--with-types`: 生成 TypeScript 类型定义
- `--with-mock`: 生成 Mock 数据

### 2. 生成配置文件

\`\`\`bash
request-gen config -o ./src/request.config.ts -b https://api.example.com --timeout 5000
\`\`\`

### 3. 生成 API 服务类

\`\`\`bash
request-gen service -n user -o ./src/services --with-cache --with-retry
\`\`\`

## 示例

### 完整工作流

\`\`\`bash
# 1. 初始化配置
request-gen config

# 2. 从 Swagger 生成 API 代码
request-gen swagger -i swagger.json -o ./src/api --with-types --with-mock

# 3. 生成特定服务
request-gen service -n user -o ./src/services/user.service.ts
\`\`\`

## 生成的文件结构

\`\`\`
src/
├── api/
│   ├── index.ts              # 服务入口
│   ├── types/
│   │   ├── index.ts          # 基础类型
│   │   └── schemas.ts        # 数据模型
│   ├── user.service.ts       # 用户服务
│   ├── order.service.ts      # 订单服务
│   └── __mock__/
│       └── mock-data.ts      # Mock 数据
└── request.config.ts         # 请求库配置
\`\`\`

## TypeScript 支持

生成的代码完全支持 TypeScript，包含完整的类型定义：

\`\`\`typescript
import { userService } from './api/user.service';

// 自动补全和类型检查
const result = await userService.getList({ page: 1, pageSize: 10 });
\`\`\`

## Mock 数据

使用 `--with-mock` 选项生成 Mock 数据，方便前端开发：

\`\`\`typescript
import { mockData } from './api/__mock__/mock-data';

// 使用 Mock 数据
const mockResult = mockData['GET /api/user/list'];
\`\`\`
