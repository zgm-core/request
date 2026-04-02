# @zgm-core/request

<div align="center">

[![npm version](https://img.shields.io/npm/v/@zgm-core/request.svg)](https://www.npmjs.com/package/@zgm-core/request)
[![npm downloads](https://img.shields.io/npm/dm/@zgm-core/request.svg)](https://www.npmjs.com/package/@zgm-core/request)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-18.0+-green.svg)](https://nodejs.org/)

**企业级 HTTP 请求库**

一个变量，搞定所有请求场景

[快速开始](#快速开始) · [API 文档](#api-文档) · [示例](#示例)

</div>

---

## 为什么选择 @zgm-core/request？

| 问题 | 其他库 | @zgm-core/request |
|------|--------|-------------------|
| 需要手动管理并发 | 是 | 否，自动控制 |
| 重复请求需要额外处理 | 是 | 否，自动去重 |
| WebSocket 重连复杂 | 是 | 否，开箱即用 |
| 需要自己实现熔断器 | 是 | 否，内置支持 |
| 防重复提交麻烦 | 是 | 否，一行代码 |

## 特性

- 极简 API，一个 `$http` 变量，无需实例化
- 智能重试，指数退避 + 随机抖动，避免雪崩
- 多级缓存，内存 / localStorage / sessionStorage
- 并发控制，动态调整并发数、熔断器、优先级队列
- WebSocket，自动重连、心跳保活、断线重连
- 幂等控制，防重复提交、自定义幂等键
- TypeScript，完整类型推导，智能提示
- 性能监控，P50/P90/P99 响应时间统计

## 安装

```bash
# npm
npm install @zgm-core/request

# yarn
yarn add @zgm-core/request

# pnpm
pnpm add @zgm-core/request
```

## 快速开始

```typescript
import { $http } from '@zgm-core/request';

// 1. 全局配置（可选）
$http.configure({
    baseURL: 'https://api.example.com',
    timeout: 10000
});

// 2. 发起请求
const users = await $http.get('/api/users');
const result = await $http.post('/api/users', { name: 'John' });

// 3. 更新数据
await $http.put('/api/users/1', { name: 'Updated' });
await $http.patch('/api/users/1', { status: 'active' });

// 4. 删除数据
await $http.delete('/api/users/1');
```

---

## API 文档

### 目录

- [基础请求](#基础请求)
- [全局配置](#全局配置)
- [自动重试](#自动重试)
- [响应缓存](#响应缓存)
- [请求取消](#请求取消)
- [WebSocket](#websocket)
- [并发控制](#并发控制)
- [批量请求](#批量请求)
- [串行请求](#串行请求)
- [管道请求](#管道请求)
- [请求去重](#请求去重)
- [请求节流](#请求节流)
- [幂等控制](#幂等控制)
- [性能监控](#性能监控)

---

### 基础请求

#### GET 请求

```typescript
// 基础 GET
const users = await $http.get('/api/users');

// 带查询参数
const users = await $http.get('/api/users', {
    params: { page: 1, size: 10, status: 'active' }
});

// 带请求头
const data = await $http.get('/api/protected', {
    headers: { 'Authorization': 'Bearer token' }
});

// 带缓存
const data = await $http.get('/api/config', {
    cache: { enabled: true, ttl: 60000 }
});
```

#### POST 请求

```typescript
// 基础 POST
const result = await $http.post('/api/users', {
    name: 'John',
    email: 'john@example.com'
});

// 带配置
const result = await $http.post('/api/orders', orderData, {
    headers: { 'X-Request-ID': 'xxx' },
    timeout: 30000
});
```

#### PUT / PATCH / DELETE

```typescript
// PUT - 完整更新
await $http.put('/api/users/1', { name: 'John', email: 'new@email.com' });

// PATCH - 部分更新
await $http.patch('/api/users/1', { status: 'inactive' });

// DELETE
await $http.delete('/api/users/1');

// DELETE 带请求体
await $http.delete('/api/users', { data: { ids: [1, 2, 3] } });
```

---

### 全局配置

```typescript
import { $http } from '@zgm-core/request';

$http.configure({
    // ===== 基础配置 =====
    baseURL: 'https://api.example.com',    // 基础 URL
    timeout: 10000,                         // 超时时间（毫秒）
    headers: {                              // 默认请求头
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-token'
    },

    // ===== 重试配置 =====
    retryConfig: {
        enabled: true,                      // 是否启用
        retries: 3,                         // 重试次数
        shouldResetTimeout: true,           // 重试时重置超时
        onRetry: (count, error, config) => {
            console.log(`第 ${count} 次重试:`, error.message);
        }
    },

    // ===== 缓存配置 =====
    cache: {
        enabled: true,                      // 是否启用
        storage: 'memory',                  // 存储方式
        defaultTTL: 60000,                  // 默认缓存时间（毫秒）
        maxEntries: 100                     // 最大缓存条数
    },

    // ===== 取消重复请求 =====
    requestCancel: {
        enabled: true,                      // 是否启用
        cancelTarget: 'previous'            // 'previous' | 'current'
    },

    // ===== 环境标识 =====
    env: 'development'                      // 'development' | 'production'
});
```

#### 配置说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `baseURL` | `string` | - | 基础 URL，会拼接到请求 URL 前 |
| `timeout` | `number` | `10000` | 请求超时时间（毫秒） |
| `headers` | `Record<string, string>` | - | 默认请求头 |
| `retryConfig.enabled` | `boolean` | `true` | 是否启用自动重试 |
| `retryConfig.retries` | `number` | `3` | 最大重试次数 |
| `cache.enabled` | `boolean` | `false` | 是否启用缓存 |
| `cache.storage` | `string` | `'memory'` | 存储方式 |
| `cache.defaultTTL` | `number` | `60000` | 缓存有效期（毫秒） |
| `requestCancel.enabled` | `boolean` | `true` | 是否启用请求取消 |
| `requestCancel.cancelTarget` | `string` | `'current'` | 取消策略 |

---

### 自动重试

内置智能重试机制，自动处理网络错误和服务器错误。

#### 全局配置

```typescript
$http.configure({
    retryConfig: {
        enabled: true,
        retries: 3,                         // 最多重试 3 次
        shouldResetTimeout: true,           // 重试时重置超时
        onRetry: (count, error, config) => {
            console.log(`重试 ${count}/${3}`, error.message);
        }
    }
});
```

#### 单独请求配置

```typescript
await $http.get('/api/data', {
    retryConfig: {
        enabled: true,
        retries: 5
    }
});
```

#### 重试触发条件

自动重试以下错误：

| 错误类型 | 说明 |
|----------|------|
| `ECONNABORTED` | 请求超时 |
| `NETWORK_ERROR` | 网络错误 |
| `5xx` | 服务器错误（500-599） |
| `429` | 请求限流 |

#### 重试策略

采用指数退避 + 随机抖动：

```
第 1 次重试: ~1000ms
第 2 次重试: ~2000ms
第 3 次重试: ~4000ms
```

随机抖动（0-1000ms）避免多客户端同时重试导致雪崩。

---

### 响应缓存

支持多级缓存，减少重复请求。

#### 存储方式

| 存储类型 | 说明 | 适用场景 |
|----------|------|----------|
| `memory` | 内存缓存 | 临时数据、高频访问 |
| `localStorage` | 本地存储 | 持久化数据、用户配置 |
| `sessionStorage` | 会话存储 | 页面会话期间有效 |

#### 使用示例

```typescript
// 全局缓存配置
$http.configure({
    cache: {
        enabled: true,
        storage: 'memory',
        defaultTTL: 60000,      // 60 秒
        maxEntries: 100
    }
});

// 单独请求缓存
const config = await $http.get('/api/config', {
    cache: {
        enabled: true,
        ttl: 300000             // 5 分钟
    }
});

// 强制刷新（忽略缓存）
const fresh = await $http.get('/api/data', {
    cache: { enabled: false }
});
```

#### 缓存场景示例

```typescript
// 用户配置 - 长期缓存
const userConfig = await $http.get('/api/user/config', {
    cache: { enabled: true, ttl: 3600000 }  // 1 小时
});

// 字典数据 - 会话级缓存
const dict = await $http.get('/api/dict/cities', {
    cache: { enabled: true, storage: 'sessionStorage' }
});

// 实时数据 - 不缓存
const realtime = await $http.get('/api/realtime', {
    cache: { enabled: false }
});
```

---

### 请求取消

自动取消重复请求，避免数据混乱。

#### 取消策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `previous` | 取消前一个请求 | 搜索输入、筛选切换 |
| `current` | 取消当前请求 | 表单提交、页面跳转 |

#### 搜索场景示例

```typescript
// 全局配置
$http.configure({
    requestCancel: {
        enabled: true,
        cancelTarget: 'previous'  // 取消前一个
    }
});

// 搜索输入 - 自动取消上一个请求
searchInput.addEventListener('input', async (e) => {
    // 快速输入时，只会发送最后一个请求
    const results = await $http.get('/api/search', {
        params: { keyword: e.target.value }
    });
});
```

---

### WebSocket

企业级 WebSocket 客户端，自动重连、心跳保活。

#### 创建连接

```typescript
import { $http } from '@zgm-core/request';

const ws = $http.ws({
    url: 'wss://api.example.com/ws',
    
    // 重连配置
    reconnect: true,                   // 是否自动重连
    maxReconnectAttempts: 5,           // 最大重连次数
    reconnectInterval: 3000,           // 重连间隔
    minConnectInterval: 2000,          // 最小连接间隔
    
    // 心跳配置
    heartbeat: {
        enabled: true,                 // 是否启用心跳
        interval: 30000                // 心跳间隔（毫秒）
    }
});
```

#### 监听事件

```typescript
// 连接成功
ws.on('open', () => {
    console.log('WebSocket 已连接');
});

// 收到消息
ws.on('message', (data) => {
    console.log('收到消息:', data);
});

// 连接关闭
ws.on('close', (code, reason) => {
    console.log('连接已关闭:', code, reason);
});

// 连接错误
ws.on('error', (error) => {
    console.error('连接错误:', error);
});

// 重连中
ws.on('reconnecting', (attempt) => {
    console.log(`正在重连 (${attempt}/5)`);
});
```

#### 发送消息

```typescript
// 发送 JSON
ws.send({ type: 'subscribe', channel: 'updates' });

// 发送字符串
ws.send('Hello World');

// 发送二进制
ws.send(new Uint8Array([1, 2, 3]));
```

#### 关闭连接

```typescript
// 正常关闭
ws.close();

// 带状态码关闭
ws.close(1000, 'Normal closure');

// 强制关闭（不再重连）
ws.destroy();
```

#### 完整示例：实时聊天

```typescript
import { $http } from '@zgm-core/request';

const chat = $http.ws({
    url: 'wss://chat.example.com/ws',
    reconnect: true,
    heartbeat: { enabled: true, interval: 25000 }
});

chat.on('open', () => {
    // 加入聊天室
    chat.send({ type: 'join', room: 'general' });
});

chat.on('message', (msg) => {
    if (msg.type === 'chat') {
        console.log(`${msg.user}: ${msg.text}`);
    }
});

// 发送消息
function sendMessage(text) {
    chat.send({ type: 'chat', text });
}

// 离开聊天室
function leave() {
    chat.send({ type: 'leave', room: 'general' });
    chat.close();
}
```

---

### 并发控制

控制多个请求的并发执行，支持动态调整和熔断器。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

const controller = $http.concurrent();

const tasks = [
    () => $http.get('/api/users'),
    () => $http.get('/api/orders'),
    () => $http.get('/api/products'),
    () => $http.get('/api/inventory'),
    () => $http.get('/api/stats')
];

const { results, stats } = await controller.execute(tasks, {
    concurrency: 3,              // 最大并发数
    failFast: false,             // 是否快速失败
    timeout: 10000,              // 单个任务超时
    onProgress: (done, total) => {
        console.log(`进度: ${done}/${total}`);
    }
});

// 查看结果
console.log('成功:', results.filter(r => r.status === 'fulfilled').length);
console.log('失败:', results.filter(r => r.status === 'rejected').length);
console.log('总耗时:', stats.totalDuration, 'ms');
```

#### 动态并发控制

根据网络状况自动调整并发数：

```typescript
const { results } = await controller.execute(tasks, {
    concurrency: 5,
    
    dynamicConcurrency: {
        enabled: true,
        minConcurrency: 1,           // 最小并发
        maxConcurrency: 20,          // 最大并发
        errorRateThreshold: 0.3,     // 错误率阈值 30%
        responseTimeThreshold: 3000, // 响应时间阈值 3秒
        adjustmentInterval: 10,      // 每 10 个任务调整一次
        adjustmentStep: 1            // 每次调整步长
    }
});
```

调整逻辑：

| 条件 | 并发调整 |
|------|----------|
| 错误率 < 5% 且响应 < 500ms | 自动提高 |
| 错误率 > 30% | 自动降低 |
| 响应时间 > 3秒 | 自动降低 |

#### 熔断器

防止级联故障：

```typescript
const { results } = await controller.execute(tasks, {
    concurrency: 5,
    
    circuitBreaker: {
        enabled: true,
        failureThreshold: 5,     // 失败 5 次触发熔断
        resetTimeout: 30000,     // 30 秒后尝试恢复
        onTrip: () => console.log('熔断器触发'),
        onReset: () => console.log('熔断器恢复')
    }
});
```

#### 完整示例：批量数据获取

```typescript
async function fetchAllData(userIds: string[]) {
    const controller = $http.concurrent();
    
    const tasks = userIds.map(id => 
        () => $http.get(`/api/users/${id}/profile`)
    );
    
    const { results, stats } = await controller.execute(tasks, {
        concurrency: 10,
        timeout: 5000,
        failFast: false,
        
        dynamicConcurrency: {
            enabled: true,
            maxConcurrency: 20
        },
        
        circuitBreaker: {
            enabled: true,
            failureThreshold: 10
        },
        
        onProgress: (done, total) => {
            updateProgressBar(done / total);
        }
    });
    
    // 过滤成功结果
    const profiles = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
    
    return profiles;
}
```

---

### 批量请求

将大量请求分批执行，避免服务器压力过大。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

const batch = $http.batch({
    batchSize: 10,          // 每批 10 个请求
    batchDelay: 100,        // 批次间隔 100ms
    continueOnError: true,  // 出错继续
    parallelBatches: false  // 串行执行批次
});

// 执行批量请求
const items = [
    { url: '/api/users/1', method: 'GET' },
    { url: '/api/users/2', method: 'GET' },
    { url: '/api/users', method: 'POST', data: { name: 'John' } },
    { url: '/api/users/3', method: 'DELETE' }
];

const result = await batch.execute(items);

console.log('成功:', result.successful);
console.log('失败:', result.failed);
console.log('总计:', result.total);
console.log('耗时:', result.duration, 'ms');
```

#### 并行批次

```typescript
const batch = $http.batch({
    batchSize: 5,
    parallelBatches: true,  // 并行执行批次
    continueOnError: true
});

// 100 个请求，每批 5 个，并行执行
const result = await batch.execute(largeItemList);
```

#### 批量更新示例

```typescript
async function batchUpdateUsers(updates: UserUpdate[]) {
    const batch = $http.batch({
        batchSize: 20,
        batchDelay: 200,
        continueOnError: true
    });
    
    const items = updates.map(user => ({
        url: `/api/users/${user.id}`,
        method: 'PATCH',
        data: user.changes
    }));
    
    const result = await batch.execute(items);
    
    // 处理失败项
    if (result.failed > 0) {
        const failedItems = result.items.filter(item => !item.success);
        console.error('更新失败:', failedItems);
    }
    
    return result;
}
```

---

### 串行请求

按顺序依次执行请求，后一个请求可依赖前一个结果。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

const serial = $http.serial();

// 添加任务
serial.addTask({ 
    name: 'auth', 
    execute: () => $http.post('/api/login', credentials) 
});

serial.addTask({ 
    name: 'profile', 
    execute: () => $http.get('/api/profile') 
});

serial.addTask({ 
    name: 'orders', 
    execute: () => $http.get('/api/orders') 
});

// 执行
const { results, errors, stats } = await serial.execute();

// 获取结果
const authResult = results.find(r => r.name === 'auth')?.value;
```

#### 依赖链示例

```typescript
async function initApp() {
    const serial = $http.serial();
    
    // 步骤 1: 获取配置
    serial.addTask({
        name: 'config',
        execute: async () => {
            return $http.get('/api/config');
        }
    });
    
    // 步骤 2: 根据配置获取用户信息
    serial.addTask({
        name: 'user',
        execute: async () => {
            // 这里可以访问前面的结果
            const config = serial.getTaskResult('config');
            return $http.get(`${config.apiBase}/user`);
        }
    });
    
    // 步骤 3: 获取用户权限
    serial.addTask({
        name: 'permissions',
        execute: async () => {
            const user = serial.getTaskResult('user');
            return $http.get(`/api/permissions/${user.id}`);
        }
    });
    
    const { results, errors } = await serial.execute();
    
    if (errors.length > 0) {
        console.error('初始化失败:', errors);
        return;
    }
    
    return {
        config: serial.getTaskResult('config'),
        user: serial.getTaskResult('user'),
        permissions: serial.getTaskResult('permissions')
    };
}
```

---

### 管道请求

步骤间自动传递数据，适合复杂的业务流程。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

const pipeline = $http.pipeline()
    // 步骤 1: 获取用户
    .step('user', async () => {
        return $http.get('/api/user');
    })
    // 步骤 2: 获取用户订单
    .step('orders', async (ctx) => {
        const userId = ctx['user'].id;  // 访问上一步结果
        return $http.get(`/api/orders?userId=${userId}`);
    })
    // 步骤 3: 处理订单
    .step('process', async (ctx) => {
        const orders = ctx['orders'];
        return $http.post('/api/process', orders);
    });

const { context, errors } = await pipeline.execute();

if (errors.length === 0) {
    console.log('用户:', context['user']);
    console.log('订单:', context['orders']);
    console.log('处理结果:', context['process']);
}
```

#### 条件执行

```typescript
const pipeline = $http.pipeline()
    .step('check', async () => {
        return $http.get('/api/check');
    })
    .step('process', async (ctx) => {
        // 根据上一步结果决定是否执行
        if (ctx['check'].needsProcess) {
            return $http.post('/api/process');
        }
        return { skipped: true };
    }, {
        // 条件跳过
        skipIf: (ctx) => !ctx['check'].needsProcess
    });
```

#### 完整示例：订单流程

```typescript
async function processOrder(orderId: string) {
    const pipeline = $http.pipeline()
        // 1. 验证订单
        .step('validate', async () => {
            return $http.post('/api/orders/validate', { orderId });
        })
        // 2. 锁定库存
        .step('lockInventory', async (ctx) => {
            const { items } = ctx['validate'];
            return $http.post('/api/inventory/lock', { items });
        })
        // 3. 创建支付
        .step('payment', async (ctx) => {
            const { amount } = ctx['validate'];
            return $http.post('/api/payment/create', { 
                orderId, 
                amount 
            });
        })
        // 4. 确认订单
        .step('confirm', async (ctx) => {
            const { paymentId } = ctx['payment'];
            return $http.post('/api/orders/confirm', { 
                orderId, 
                paymentId 
            });
        });
    
    try {
        const { context } = await pipeline.execute();
        return {
            success: true,
            order: context['confirm']
        };
    } catch (error) {
        // 任何步骤失败都会抛出
        return {
            success: false,
            error: error.message
        };
    }
}
```

---

### 请求去重

合并相同时刻的相同请求，减少服务器压力。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

// 100ms 内相同的 GET 请求只发送一次
const result = await $http.dedup('/api/users', {
    dedupWindow: 100,    // 去重窗口（毫秒）
    enabled: true
});
```

#### 场景：防止重复点击

```typescript
// 用户快速点击按钮
async function handleSubmit() {
    // 相同请求在 1 秒内只发送一次
    const result = await $http.dedup('/api/submit', {
        dedupWindow: 1000
    });
    
    return result;
}
```

#### React 组件示例

```typescript
function UserList() {
    const [users, setUsers] = useState([]);
    
    useEffect(() => {
        // 组件多次渲染时，请求会被去重
        $http.dedup('/api/users').then(setUsers);
    }, []);
    
    return <div>{users.map(u => ...)}</div>;
}
```

---

### 请求节流

基于令牌桶算法的限流控制。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

// 创建节流器：每秒最多 10 次请求
const throttle = $http.throttle('/api/search', {
    rate: 10,           // 令牌数
    interval: 1000      // 时间窗口（毫秒）
});

// 使用节流器
const result = await throttle.execute(() => 
    $http.get('/api/search', { params: { q: keyword } })
);
```

#### 场景：限制 API 调用频率

```typescript
// 限制搜索接口：每秒最多 5 次
const searchThrottle = $http.throttle('/api/search', {
    rate: 5,
    interval: 1000
});

async function search(keyword: string) {
    return searchThrottle.execute(() =>
        $http.get('/api/search', { params: { q: keyword } })
    );
}

// 快速调用会被限流
search('a');
search('ab');
search('abc');  // 前两个可能被限流
```

---

### 幂等控制

防止重复提交，确保操作只执行一次。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

const handler = $http.idempotent({
    enabled: true,
    ttl: 60000          // 60 秒内重复请求返回相同结果
});

// 使用幂等键执行请求
const result = await handler.execute(
    'order-123',        // 幂等键
    () => $http.post('/api/orders', orderData)
);
```

#### 场景：防止重复下单

```typescript
async function createOrder(orderData: Order) {
    const handler = $http.idempotent({ ttl: 30000 });
    
    // 使用订单 ID 作为幂等键
    const idempotentKey = `order-${orderData.id}`;
    
    return handler.execute(idempotentKey, () =>
        $http.post('/api/orders', orderData)
    );
}

// 用户多次点击，只创建一个订单
document.getElementById('submit').addEventListener('click', () => {
    createOrder(orderData);  // 重复点击会被拦截
});
```

#### 自定义幂等键

```typescript
const handler = $http.idempotent();

// 基于用户 ID + 操作类型生成幂等键
await handler.execute(`user-${userId}-withdraw`, () =>
    $http.post('/api/withdraw', { amount, userId })
);
```

---

### 性能监控

收集请求性能数据，支持 P50/P90/P99 统计。

#### 基础用法

```typescript
import { $http } from '@zgm-core/request';

// 创建监控器
const monitor = $http.monitor({
    enabled: true,
    maxRecords: 1000,       // 最大记录数
    windowMs: 60000         // 统计窗口（1 分钟）
});

// 手动记录
monitor.record('/api/users', 'GET', true, 120);  // url, method, success, duration

// 获取统计
const stats = monitor.getStats('/api/users');
console.log('P50:', stats.p50, 'ms');   // 50% 请求的响应时间
console.log('P90:', stats.p90, 'ms');   // 90% 请求的响应时间
console.log('P99:', stats.p99, 'ms');   // 99% 请求的响应时间
console.log('平均:', stats.avg, 'ms');
console.log('错误率:', stats.errorRate, '%');
```

#### 集成监控

```typescript
// 在请求拦截器中记录
$http.configure({
    interceptors: {
        response: {
            onFulfilled: (response) => {
                monitor.record(
                    response.config.url,
                    response.config.method,
                    true,
                    response.duration
                );
                return response;
            },
            onRejected: (error) => {
                monitor.record(
                    error.config?.url,
                    error.config?.method,
                    false,
                    error.duration || 0
                );
                throw error;
            }
        }
    }
});
```

#### 性能报表

```typescript
// 获取所有 URL 的性能数据
const allStats = monitor.getAllStats();

// 按响应时间排序
const slowApis = Object.entries(allStats)
    .sort((a, b) => b[1].avg - a[1].avg)
    .slice(0, 10);

console.log('最慢的 10 个接口:');
slowApis.forEach(([url, stats]) => {
    console.log(`${url}: ${stats.avg}ms (P99: ${stats.p99}ms)`);
});
```

---

## 类型定义

```typescript
import type { GlobalConfig, IResponseData } from '@zgm-core/request';

// 请求配置
interface GlobalConfig {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    retryConfig?: RetryConfig;
    cache?: CacheConfig;
    requestCancel?: CancelConfig;
    env?: 'development' | 'production';
}

// 响应数据
interface IResponseData<T = any> {
    code: number;
    data: T;
    message: string;
}
```

---

## CLI 工具

从 Swagger/OpenAPI 自动生成类型安全的 API 代码。

### 安装

```bash
npm install -D @zgm-core/request
```

### 使用

```bash
# 从 Swagger 生成代码
npx request-gen swagger -i swagger.json -o ./src/api

# 带类型和 Mock
npx request-gen swagger -i swagger.json -o ./src/api --with-types --with-mock

# 生成配置文件
npx request-gen config -o ./src/request.config.ts

# 生成 API 服务
npx request-gen service -n user -o ./src/services
```

---

## 常见问题

<details>
<summary><b>如何处理跨域？</b></summary>

后端配置 CORS，或使用代理：

```typescript
$http.configure({
    baseURL: '/api'  // 使用代理
});
```

</details>

<details>
<summary><b>如何添加请求拦截器？</b></summary>

```typescript
$http.configure({
    interceptors: {
        request: {
            onFulfilled: (config) => {
                config.headers['Authorization'] = getToken();
                return config;
            }
        },
        response: {
            onFulfilled: (response) => {
                return response.data;
            },
            onRejected: (error) => {
                if (error.response?.status === 401) {
                    // 跳转登录
                }
                return Promise.reject(error);
            }
        }
    }
});
```

</details>

<details>
<summary><b>如何取消正在进行的请求？</b></summary>

```typescript
// 方式 1：使用 CancelToken
const source = axios.CancelToken.source();

$http.get('/api/data', {
    cancelToken: source.token
});

// 取消请求
source.cancel('请求已取消');

// 方式 2：使用 AbortController
const controller = new AbortController();

$http.get('/api/data', {
    signal: controller.signal
});

// 取消请求
controller.abort();
```

</details>

<details>
<summary><b>如何处理文件上传？</b></summary>

```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('type', 'avatar');

await $http.post('/api/upload', formData, {
    headers: {
        'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progress) => {
        console.log(`上传进度: ${progress.loaded / progress.total * 100}%`);
    }
});
```

</details>

<details>
<summary><b>如何处理文件下载？</b></summary>

```typescript
const response = await $http.get('/api/download', {
    responseType: 'blob'
});

// 创建下载链接
const url = window.URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'file.pdf';
link.click();
window.URL.revokeObjectURL(url);
```

</details>

---

## 浏览器支持

| 浏览器 | 版本 |
|--------|------|
| Chrome | 最新 2 个版本 |
| Firefox | 最新 2 个版本 |
| Safari | 最新 2 个版本 |
| Edge | 最新 2 个版本 |

---

## 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md)

---

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing`)
5. 提交 Pull Request

---

## License

[MIT](./LICENSE) © zgm-core

---

<div align="center">

如果觉得有用，请给一个 Star！

</div>
