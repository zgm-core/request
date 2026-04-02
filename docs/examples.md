# 示例集合

本文档包含 @zgm-core/request 的实际使用示例。

## 目录

- [React 集成](#react-集成)
- [Vue 集成](#vue-集成)
- [Node.js 使用](#nodejs-使用)
- [真实场景示例](#真实场景示例)

---

## React 集成

### 基础封装

```typescript
// src/utils/request.ts
import { $http, GlobalConfig } from '@zgm-core/request';

// 配置
$http.configure({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// 请求拦截器
$http.configure({
    interceptors: {
        request: {
            onFulfilled: (config) => {
                const token = localStorage.getItem('token');
                if (token) {
                    config.headers['Authorization'] = `Bearer ${token}`;
                }
                return config;
            }
        },
        response: {
            onFulfilled: (response) => response.data,
            onRejected: (error) => {
                if (error.response?.status === 401) {
                    // 跳转登录
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }
        }
    }
});

export default $http;
```

### 自定义 Hook

```typescript
// src/hooks/useRequest.ts
import { useState, useEffect, useCallback } from 'react';
import { $http } from '@zgm-core/request';

interface UseRequestOptions<T> {
    url: string;
    params?: Record<string, any>;
    immediate?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
}

export function useRequest<T = any>(options: UseRequestOptions<T>) {
    const { url, params, immediate = true, onSuccess, onError } = options;
    
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    const execute = useCallback(async (newParams?: Record<string, any>) => {
        setLoading(true);
        setError(null);
        
        try {
            const result = await $http.get<T>(url, {
                params: { ...params, ...newParams }
            });
            setData(result);
            onSuccess?.(result);
            return result;
        } catch (err) {
            setError(err as Error);
            onError?.(err as Error);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [url, params]);
    
    useEffect(() => {
        if (immediate) {
            execute();
        }
    }, []);
    
    return { data, loading, error, execute, refresh: execute };
}
```

### 使用示例

```tsx
// src/pages/UserList.tsx
import { useRequest } from '@/hooks/useRequest';

interface User {
    id: number;
    name: string;
    email: string;
}

export function UserList() {
    const { data: users, loading, error, refresh } = useRequest<User[]>({
        url: '/api/users',
        params: { page: 1, size: 10 }
    });
    
    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;
    
    return (
        <div>
            <button onClick={refresh}>Refresh</button>
            <ul>
                {users?.map(user => (
                    <li key={user.id}>{user.name}</li>
                ))}
            </ul>
        </div>
    );
}
```

---

## Vue 集成

### 基础封装

```typescript
// src/utils/request.ts
import { $http } from '@zgm-core/request';

$http.configure({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10000
});

export default $http;
```

### Composable

```typescript
// src/composables/useRequest.ts
import { ref, watchEffect } from 'vue';
import { $http } from '@zgm-core/request';

export function useRequest<T>(url: string, params?: Record<string, any>) {
    const data = ref<T | null>(null);
    const loading = ref(false);
    const error = ref<Error | null>(null);
    
    const execute = async (newParams?: Record<string, any>) => {
        loading.value = true;
        error.value = null;
        
        try {
            const result = await $http.get<T>(url, {
                params: { ...params, ...newParams }
            });
            data.value = result;
            return result;
        } catch (err) {
            error.value = err as Error;
            throw err;
        } finally {
            loading.value = false;
        }
    };
    
    return { data, loading, error, execute };
}
```

### 使用示例

```vue
<!-- src/views/UserList.vue -->
<script setup lang="ts">
import { useRequest } from '@/composables/useRequest';

interface User {
    id: number;
    name: string;
    email: string;
}

const { data: users, loading, error, execute } = useRequest<User[]>('/api/users');
</script>

<template>
    <div v-if="loading">Loading...</div>
    <div v-else-if="error">Error: {{ error.message }}</div>
    <ul v-else>
        <li v-for="user in users" :key="user.id">
            {{ user.name }}
        </li>
    </ul>
</template>
```

---

## Node.js 使用

### 基础配置

```typescript
// src/request.ts
import { $http } from '@zgm-core/request';

$http.configure({
    baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    timeout: 30000,
    retryConfig: {
        enabled: true,
        retries: 3
    }
});

export default $http;
```

### 服务端调用

```typescript
// src/services/user.service.ts
import { $http } from '@zgm-core/request';

export class UserService {
    static async getUsers() {
        return $http.get('/api/users');
    }
    
    static async createUser(data: { name: string; email: string }) {
        return $http.post('/api/users', data);
    }
    
    static async batchCreate(users: Array<{ name: string; email: string }>) {
        const batch = $http.batch({ batchSize: 10 });
        
        const items = users.map(user => ({
            url: '/api/users',
            method: 'POST',
            data: user
        }));
        
        return batch.execute(items);
    }
}
```

---

## 真实场景示例

### 场景 1：搜索防抖 + 自动取消

```typescript
import { $http } from '@zgm-core/request';

// 配置自动取消前一个请求
$http.configure({
    requestCancel: {
        enabled: true,
        cancelTarget: 'previous'
    }
});

// 搜索函数
async function search(keyword: string) {
    // 快速输入时，自动取消前一个请求
    return $http.get('/api/search', {
        params: { keyword }
    });
}

// 配合防抖使用
import { debounce } from 'lodash';

const debouncedSearch = debounce(async (keyword: string) => {
    const results = await search(keyword);
    console.log(results);
}, 300);

searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});
```

### 场景 2：批量数据导出

```typescript
import { $http } from '@zgm-core/request';

async function exportUsers(userIds: string[]) {
    // 创建并发控制器
    const controller = $http.concurrent();
    
    // 创建任务
    const tasks = userIds.map(id => 
        () => $http.get(`/api/users/${id}/detail`)
    );
    
    // 并发执行（限制并发数 10）
    const { results, stats } = await controller.execute(tasks, {
        concurrency: 10,
        onProgress: (done, total) => {
            console.log(`导出进度: ${done}/${total}`);
        }
    });
    
    // 过滤成功结果
    const userDetails = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
    
    // 导出为 CSV
    const csv = userDetails.map(user => 
        `${user.id},${user.name},${user.email}`
    ).join('\n');
    
    // 下载
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    
    return { count: userDetails.length, duration: stats.totalDuration };
}
```

### 场景 3：订单提交流程

```typescript
import { $http } from '@zgm-core/request';

async function submitOrder(orderData: Order) {
    // 使用管道确保流程顺序
    const pipeline = $http.pipeline()
        // 1. 验证库存
        .step('inventory', async () => {
            return $http.post('/api/inventory/check', {
                items: orderData.items
            });
        })
        // 2. 锁定库存
        .step('lock', async (ctx) => {
            const { items } = ctx['inventory'];
            return $http.post('/api/inventory/lock', {
                orderId: orderData.id,
                items
            });
        })
        // 3. 创建订单
        .step('order', async (ctx) => {
            return $http.post('/api/orders', {
                ...orderData,
                lockId: ctx['lock'].lockId
            });
        })
        // 4. 创建支付
        .step('payment', async (ctx) => {
            const order = ctx['order'];
            return $http.post('/api/payment/create', {
                orderId: order.id,
                amount: order.total
            });
        });
    
    try {
        const { context } = await pipeline.execute();
        return {
            success: true,
            orderId: context['order'].id,
            paymentUrl: context['payment'].paymentUrl
        };
    } catch (error) {
        // 失败时，需要回滚
        console.error('订单提交失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
```

### 场景 4：实时数据推送

```typescript
import { $http } from '@zgm-core/request';

class RealtimeDataService {
    private ws: ReturnType<typeof $http.ws>;
    private callbacks: Map<string, Set<(data: any) => void>> = new Map();
    
    connect() {
        this.ws = $http.ws({
            url: 'wss://api.example.com/realtime',
            reconnect: true,
            maxReconnectAttempts: 10,
            heartbeat: { enabled: true, interval: 25000 }
        });
        
        this.ws.on('message', (data) => {
            const { type, payload } = data;
            const callbacks = this.callbacks.get(type);
            callbacks?.forEach(cb => cb(payload));
        });
        
        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }
    
    subscribe(type: string, callback: (data: any) => void) {
        if (!this.callbacks.has(type)) {
            this.callbacks.set(type, new Set());
        }
        this.callbacks.get(type)!.add(callback);
        
        // 发送订阅请求
        this.ws.send({ action: 'subscribe', type });
        
        // 返回取消订阅函数
        return () => {
            this.callbacks.get(type)?.delete(callback);
            this.ws.send({ action: 'unsubscribe', type });
        };
    }
    
    disconnect() {
        this.ws?.close();
    }
}

// 使用
const service = new RealtimeDataService();
service.connect();

// 订阅股票价格
const unsubscribe = service.subscribe('stock-price', (data) => {
    console.log('Stock price update:', data);
});

// 取消订阅
unsubscribe();
```

### 场景 5：缓存 + 后台刷新

```typescript
import { $http } from '@zgm-core/request';

async function getConfig() {
    // 先返回缓存数据
    const cached = await $http.get('/api/config', {
        cache: { enabled: true, ttl: 300000 }  // 5 分钟
    });
    
    // 后台静默刷新
    $http.get('/api/config', {
        cache: { enabled: false }  // 强制刷新
    }).then(fresh => {
        // 更新缓存
        localStorage.setItem('config', JSON.stringify(fresh));
    }).catch(err => {
        console.warn('Background refresh failed:', err);
    });
    
    return cached;
}
```

### 场景 6：防重复提交

```typescript
import { $http } from '@zgm-core/request';

async function submitForm(formData: FormData) {
    // 使用幂等控制，防止重复提交
    const handler = $http.idempotent({ ttl: 10000 });  // 10 秒
    
    const idempotentKey = `form-${formData.id}-${Date.now()}`;
    
    return handler.execute(idempotentKey, () => 
        $http.post('/api/form/submit', formData)
    );
}

// 按钮点击处理
let isSubmitting = false;

async function handleSubmit() {
    if (isSubmitting) return;
    isSubmitting = true;
    
    try {
        const result = await submitForm(formData);
        console.log('Submit success:', result);
    } finally {
        isSubmitting = false;
    }
}
```
