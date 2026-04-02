# API 参考

本文档提供 @zgm-core/request 的完整 API 参考。

## 目录

- [$http](#http)
- [配置选项](#配置选项)
- [类型定义](#类型定义)

---

## $http

主入口对象，包含所有功能方法。

### 基础请求

#### `$http.get(url, config?)`

发起 GET 请求。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 请求 URL |
| `config` | `RequestConfig` | 否 | 请求配置 |

**返回：** `Promise<IResponseData>`

**示例：**

```typescript
const users = await $http.get('/api/users');
const user = await $http.get('/api/users/1', { cache: { enabled: true } });
```

---

#### `$http.post(url, data?, config?)`

发起 POST 请求。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 请求 URL |
| `data` | `any` | 否 | 请求体数据 |
| `config` | `RequestConfig` | 否 | 请求配置 |

**返回：** `Promise<IResponseData>`

**示例：**

```typescript
const result = await $http.post('/api/users', { name: 'John' });
```

---

#### `$http.put(url, data?, config?)`

发起 PUT 请求。

**参数：** 同 `$http.post`

**返回：** `Promise<IResponseData>`

---

#### `$http.patch(url, data?, config?)`

发起 PATCH 请求。

**参数：** 同 `$http.post`

**返回：** `Promise<IResponseData>`

---

#### `$http.delete(url, config?)`

发起 DELETE 请求。

**参数：** 同 `$http.get`

**返回：** `Promise<IResponseData>`

---

### 全局配置

#### `$http.configure(config)`

设置全局配置。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config` | `DeepPartial<GlobalConfig>` | 是 | 全局配置对象 |

**返回：** `void`

**示例：**

```typescript
$http.configure({
    baseURL: 'https://api.example.com',
    timeout: 10000,
    retryConfig: { enabled: true, retries: 3 },
    cache: { enabled: true, storage: 'memory' }
});
```

---

### WebSocket

#### `$http.ws(config)`

创建 WebSocket 连接。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config.url` | `string` | 是 | WebSocket URL |
| `config.reconnect` | `boolean` | 否 | 是否自动重连（默认 true） |
| `config.maxReconnectAttempts` | `number` | 否 | 最大重连次数（默认 5） |
| `config.reconnectInterval` | `number` | 否 | 重连间隔（默认 3000ms） |
| `config.heartbeat.enabled` | `boolean` | 否 | 是否启用心跳（默认 false） |
| `config.heartbeat.interval` | `number` | 否 | 心跳间隔（默认 30000ms） |

**返回：** `EnterpriseWebSocket`

**示例：**

```typescript
const ws = $http.ws({
    url: 'wss://api.example.com/ws',
    reconnect: true,
    heartbeat: { enabled: true, interval: 30000 }
});

ws.on('message', (data) => console.log(data));
ws.send({ type: 'ping' });
```

---

### 并发控制

#### `$http.concurrent()`

创建并发控制器。

**返回：** `EnterpriseConcurrentController`

**示例：**

```typescript
const controller = $http.concurrent();

const { results, stats } = await controller.execute(
    [() => $http.get('/api/1'), () => $http.get('/api/2')],
    { concurrency: 2 }
);
```

#### `controller.execute(tasks, options)`

执行并发任务。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tasks` | `TaskInput[]` | 是 | 任务数组 |
| `options.concurrency` | `number` | 否 | 并发数（默认 5） |
| `options.failFast` | `boolean` | 否 | 快速失败（默认 false） |
| `options.timeout` | `number` | 否 | 任务超时时间 |
| `options.onProgress` | `function` | 否 | 进度回调 |

---

### 批量请求

#### `$http.batch(config?)`

创建批量请求处理器。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config.batchSize` | `number` | 否 | 每批数量（默认 10） |
| `config.batchDelay` | `number` | 否 | 批次间隔（默认 100ms） |
| `config.continueOnError` | `boolean` | 否 | 出错继续（默认 true） |

**返回：** `BatchRequestHandler`

---

### 串行请求

#### `$http.serial()`

创建串行请求控制器。

**返回：** `SerialRequestController`

**示例：**

```typescript
const serial = $http.serial();
serial.addTask({ name: 'step1', execute: () => $http.get('/api/1') });
serial.addTask({ name: 'step2', execute: () => $http.get('/api/2') });

const { results } = await serial.execute();
```

---

### 管道请求

#### `$http.pipeline()`

创建请求管道。

**返回：** `PipelineBuilder`

**示例：**

```typescript
const pipeline = $http.pipeline()
    .step('user', async () => $http.get('/api/user'))
    .step('orders', async (ctx) => $http.get(`/api/orders/${ctx['user'].id}`));

const { context } = await pipeline.execute();
```

---

### 请求去重

#### `$http.dedup(url, config?)`

发起去重请求。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 请求 URL |
| `config.dedupWindow` | `number` | 否 | 去重窗口（默认 100ms） |

**返回：** `Promise<IResponseData>`

---

### 请求节流

#### `$http.throttle(url, config)`

创建 URL 节流器。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 要节流的 URL |
| `config.rate` | `number` | 是 | 令牌数 |
| `config.interval` | `number` | 是 | 时间窗口 |

**返回：** `RequestThrottle`

---

### 幂等控制

#### `$http.idempotent(config?)`

创建幂等处理器。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config.enabled` | `boolean` | 否 | 是否启用（默认 true） |
| `config.ttl` | `number` | 否 | 过期时间（默认 60000ms） |

**返回：** `IdempotentHandler`

**示例：**

```typescript
const handler = $http.idempotent({ ttl: 30000 });
await handler.execute('order-123', () => $http.post('/api/orders', data));
```

---

### 性能监控

#### `$http.monitor(config?)`

创建性能监控器。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `config.enabled` | `boolean` | 否 | 是否启用（默认 true） |
| `config.maxRecords` | `number` | 否 | 最大记录数（默认 1000） |
| `config.windowMs` | `number` | 否 | 统计窗口（默认 60000ms） |

**返回：** `PerformanceMonitor`

**示例：**

```typescript
const monitor = $http.monitor();
monitor.record('/api/users', 'GET', true, 120);

const stats = monitor.getStats('/api/users');
console.log('P50:', stats.p50, 'P99:', stats.p99);
```

---

## 配置选项

### GlobalConfig

全局配置对象。

```typescript
interface GlobalConfig {
    baseURL?: string;           // 基础 URL
    timeout?: number;           // 超时时间（默认 10000ms）
    headers?: Record<string, string>;  // 默认请求头
    env?: 'development' | 'production';  // 环境标识
    
    retryConfig?: RetryConfig;  // 重试配置
    cache?: CacheConfig;        // 缓存配置
    requestCancel?: CancelConfig;  // 取消配置
}
```

### RetryConfig

重试配置。

```typescript
interface RetryConfig {
    enabled?: boolean;          // 是否启用（默认 true）
    retries?: number;           // 重试次数（默认 3）
    shouldResetTimeout?: boolean;  // 重试时重置超时（默认 true）
    onRetry?: (count, error, config) => void;  // 重试回调
}
```

### CacheConfig

缓存配置。

```typescript
interface CacheConfig {
    enabled?: boolean;          // 是否启用（默认 false）
    storage?: 'memory' | 'localStorage' | 'sessionStorage';  // 存储方式
    defaultTTL?: number;        // 默认缓存时间（默认 60000ms）
    maxEntries?: number;        // 最大缓存条数（默认 100）
}
```

### CancelConfig

取消配置。

```typescript
interface CancelConfig {
    enabled?: boolean;          // 是否启用（默认 true）
    cancelTarget?: 'current' | 'previous';  // 取消策略
}
```

---

## 类型定义

### IResponseData

响应数据结构。

```typescript
interface IResponseData<T = any> {
    code: number;       // 状态码
    data: T;            // 响应数据
    message: string;    // 响应消息
}
```

### RequestError

请求错误类型。

```typescript
interface RequestError extends Error {
    code: ErrorCode;    // 错误码
    status?: number;    // HTTP 状态码
    config?: any;       // 请求配置
    response?: any;     // 响应数据
}
```

### ExecutionResult

并发执行结果。

```typescript
interface ExecutionResult {
    status: 'fulfilled' | 'rejected';
    value?: any;
    reason?: Error;
}
```

### ExecutionStats

执行统计信息。

```typescript
interface ExecutionStats {
    total: number;          // 总任务数
    completed: number;      // 完成数
    failed: number;         // 失败数
    totalDuration: number;  // 总耗时
}
```
