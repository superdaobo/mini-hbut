# 🛠️ 工具函数

前端工具函数和 API 封装。

## 📁 文件说明

### api.ts / api.js

API 请求封装，统一处理与后端的通信。

```typescript
// 示例：登录
import { login, getGrades } from './api';

await login(username, password);
const grades = await getGrades(term);
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
import { login } from '@/utils/api';
import { encryptPassword } from '@/utils/crypto';

const handleLogin = async () => {
  const encryptedPwd = encryptPassword(password, key);
  await login(username, encryptedPwd);
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
