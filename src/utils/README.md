# 🛠️ 工具函数

前端工具函数和 API 封装。

## 📁 文件说明

### api.js / server_api.ts

同名入口已收敛（契约见 `api.d.ts` 与 `api.js.md` / `api.ts.md`）：

- `api.js`：前端 HTTP 缓存层（`fetchWithCache` / `getCachedData` / `setCachedData` / TTL 常量等），类型契约在 `api.d.ts`。
- `server_api.ts`：原 `api.ts` 重命名而来，仅保留服务器端 OCR / 数据同步配置（`SERVER_API_BASE` / `serverOcrRecognize` / `syncDataToServer`），避免与 `api.js` 同名冲突。

```typescript
// 示例：带缓存的请求
import { fetchWithCache, LONG_TTL } from './api.js';

const result = await fetchWithCache('key', async () => await doFetch(), LONG_TTL);
```

### crypto.ts

密码加密工具，用于登录时的密码加密。

```typescript
import { encryptPassword } from './crypto';

const encrypted = encryptPassword(password, publicKey);
```

### updater.js

版本更新检测工具。

```javascript
import { checkForUpdate, downloadUpdate } from './updater';

// 检查更新
const update = await checkForUpdate();
if (update.hasUpdate) {
  await downloadUpdate(update.downloadUrl);
}
```

### axios_adapter.js

Axios 适配器，用于在 Tauri 环境中使用 Axios。

### encryption.js

加密相关的 JavaScript 实现。

## 🔧 使用说明

### 在组件中使用

```vue
<script setup lang="ts">
import { fetchWithCache } from '@/utils/api.js';
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
