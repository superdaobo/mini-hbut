# 🛠️ 工具函数

前端工具函数和 API 封装。

## 📁 文件说明

### api.ts / server_api.ts

同名入口已收敛：

- `api.ts`：类型安全的前端 HTTP 缓存层（`fetchWithCache` / `getCachedData` / `setCachedData` / TTL 常量等）。
- `server_api.ts`：服务器端 OCR / 数据同步配置（`SERVER_API_BASE` / `serverOcrRecognize` / `syncDataToServer`）。

```typescript
// 示例：带缓存的请求
import { fetchWithCache, LONG_TTL } from './api';

const result = await fetchWithCache('key', async () => await doFetch(), LONG_TTL);
```

### crypto.ts

密码加密工具，用于登录时的密码加密。

```typescript
import { encryptPassword } from './crypto';

const encrypted = encryptPassword(password, publicKey);
```

### updater.ts

版本更新检测工具。

```javascript
import { checkForUpdate, downloadUpdate } from './updater';

// 检查更新
const update = await checkForUpdate();
if (update.hasUpdate) {
  await downloadUpdate(update.downloadUrl);
}
```

### axios_adapter.ts

Axios 适配器，用于在 Tauri 环境中使用 Axios。

### encryption.ts

设备本地随机密钥与旧版密文兼容的 TypeScript 加密实现。

## 🔧 使用说明

### 在组件中使用

```vue
<script setup lang="ts">
import { fetchWithCache } from '@/utils/api';
import { encryptPassword } from '@/utils/crypto';

const handleLogin = async () => {
  const encryptedPwd = encryptPassword(password, key);
  const result = await fetchWithCache('login', () => doLogin(username, encryptedPwd));
};
</script>
```

### 错误处理

所有 API 函数都应该使用 try-catch 包装：

```typescript
try {
  const result = await apiFunction();
} catch (error) {
  // 处理错误
  console.error(error);
}
```
