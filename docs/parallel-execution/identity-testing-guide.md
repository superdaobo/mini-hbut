# Mini-HBUT Identity 全链路测试指南（测试环境）

> 测试环境：id/auth/developer.湖北工业大学.com（Vercel Production 部署，标识为测试部署）
> 用途：验证「网页授权 → 唤起本机 Mini-HBUT App → App 内授权确认 → 回调」全链路。

## 一、测试数据

| 项 | 值 | 说明 |
|---|---|---|
| 测试 Client ID | `mini-hbut-test` | 测试应用（native_public + PKCE），状态 active |
| 测试 Client 名称 | Mini-HBUT 测试应用 | 接力页/授权栏显示"测试、不获取数据"横幅 |
| 授权 Scope | `openid profile`（可加 `student.identity`） | 不请求敏感数据时无需登录态 |
| 测试用户 | 用户本人 HBUT 账号（如 2510231106） | 通过 Mini-HBUT App 登录并绑定设备后授权 |
| PKCE Verifier | `mini-hbut-test-verifier-2026-0001-abcdefghijklmnopqrstuvwxyz` | 固定值，便于手动换 token |
| PKCE Challenge | `sV_DQFtWb6DZ4qC5W93_MqgpmuJeOCN4N-x0iutqfJo` | S256(verifier) |
| 回调地址 | `https://auth.xn--vhq74jc2fzpchter27a.com/callback` | 测试回调页（显示授权码） |

## 二、测试链接（一键发起）

```
https://id.xn--vhq74jc2fzpchter27a.com/oauth/authorize?client_id=mini-hbut-test&redirect_uri=https%3A%2F%2Fauth.xn--vhq74jc2fzpchter27a.com%2Fcallback&response_type=code&scope=openid+profile&state=mini-hbut-test-state-001&code_challenge=sV_DQFtWb6DZ4qC5W93_MqgpmuJeOCN4N-x0iutqfJo&code_challenge_method=S256&nonce=mini-hbut-test-nonce-001
```

## 三、全链路操作步骤

1. **打开测试链接** → 跳转到接力页 `auth.湖北工业大学.com/r/ar_xxx#handoff`
   - 页面显示"🧪 测试应用：不会获取你的真实数据"横幅
2. **点击「打开 Mini-HBUT」** → 唤起本机 App（`minihbut://identity?...`）
   - 若 App 未登录：先完成学校账号登录（可复用现有登录流程）
   - 若设备未绑定：App 自动触发设备 Enrollment（一次性）
3. **App 内授权确认 Overlay**：
   - 显示"🧪 测试应用"横幅 + 应用名 + 请求的权限
   - 点「允许」→ 设备 Ed25519 签名 → 提交 approve
4. **PC 接力页短轮询** → 状态变为 APPROVED → 跳转回调页
5. **回调页** 显示授权码（code）→ 用 verifier 换 token：

```bash
curl -X POST https://id.xn--vhq74jc2fzpchter27a.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "client_id=mini-hbut-test" \
  -d "code=<授权码>" \
  -d "redirect_uri=https://auth.xn--vhq74jc2fzpchter27a.com/callback" \
  -d "code_verifier=mini-hbut-test-verifier-2026-0001-abcdefghijklmnopqrstuvwxyz"
```

6. 用 access_token 调 UserInfo 验证：

```bash
curl https://id.xn--vhq74jc2fzpchter27a.com/oauth/userinfo \
  -H "Authorization: Bearer <access_token>"
```

## 四、测试中的安全说明（三处均展示）

- **网页接力页**：横幅「🧪 测试应用：仅用于链路测试，不会获取、保存或使用你的任何真实数据」
- **App 授权栏**：横幅「🧪 测试应用：本授权仅用于链路测试，不会获取你的真实数据」
- **App 本地设置**：「当前连接的身份服务为测试部署，正式环境上线后移除本说明」

## 五、排障

| 现象 | 处理 |
|---|---|
| 接力页 404 | 确认 host 为 auth 域名（vercel.app 域名不路由 auth-site） |
| 唤起 App 无反应 | 确认 App 已安装且注册 `minihbut://` 协议（Windows 注册表） |
| App 提示未绑定设备 | 先完成设备 Enrollment（授权流程会自动引导） |
| 授权码换 token 失败 | 检查 verifier 一致 + code 未过期（60 秒） |
| 要求 student.identity | 使用 `scope=openid profile student.identity`，App 内需在线刷新学校会话 |
