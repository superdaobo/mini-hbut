# 身份 v2 · 客户端 PKCE 授权码流程 Runbook

> 对应 issue：`mini-hbut#1208`（P2-4）；契约：`mini-hbut-student-auth/docs/oidc-upstream-contract.md`。
> 读者：实现者、测试、运维。**本文只描述客户端侧流程与回退切换**；服务端（学生认证服务）见 `mini-hbut-student-auth` 仓的 `docs/casdoor-upstream-setup.md` 与 `deploy/nas/RUNBOOK.md`。

---

## 1. 流程时序

```
┌─────────────┐   ① identity_oidc_begin      ┌──────────────────┐
│  Tauri App  │ ───────────────────────────► │ Rust 身份模块    │
│  (前端 TS)  │ ◄─── authorize_url + state ── │ (oidc_commands)  │
└──────┬──────┘                              └────────┬─────────┘
       │ ② 系统浏览器打开 authorize_url                │ 生成 PKCE/state/nonce
       ▼                                              │ 存 PendingAuth（一次性 600s）
┌──────────────────┐  ③ 用户完成登录                │
│ Casdoor / 学生认证 │ ──── 302 redirect_uri?code&state ──┐
└──────────────────┘                                   │
       ┌───────────────────────────────────────────────┘
       ▼ ④ 回调（两条路径之一）
  A) minihbut://identity/callback?code&state      ← 默认（自定义 scheme）
  B) http://127.0.0.1:<port>/callback?code&state  ← 回退（loopback）
       │
       ▼ ⑤ identity_oidc_complete(callback_url) 或 identity_oidc_await_callback()
┌──────────────────┐  ⑥ parse_callback → take_matching(state) → POST /token(PKCE)
│ Rust 身份模块    │     → GET /jwks.json → verify_id_token(RS256, iss/aud/nonce/exp)
└────────┬─────────┘     → 写 keyring 会话（不落明文）
         ▼
   ⑦ ok:true / 固定 kind 文案
```

**不可跳过的校验**：`state` 一次性、`nonce` 逐字比对、`alg` 必须 `RS256`、`kid` 必须命中 JWKS、`iss`/`aud`/`exp`/`iat` 全校验。任一失败 → 拒绝且**不写会话**。

---

## 2. 两条回调路径

| 路径 | redirect_uri | 注册要求 | 适用 |
|---|---|---|---|
| **A 深链（默认）** | `minihbut://identity/callback` | ① `apps/client/src-tauri/tauri.conf.json` 的 `plugins.deep-link.desktop.schemes` 已含 `minihbut`（移动端 `plugins.deep-link.mobile.schemes` 同）；② Casdoor 应用的回调白名单登记该值；③ 安装器/OS 已完成协议注册（Windows 由 `deep_link_register.rs` 守卫写 HKCU） | 桌面与移动端的常规路径 |
| **B 回退（loopback）** | `http://127.0.0.1:<port>/callback` | ① Casdoor 回调白名单登记 `http://127.0.0.1:<port>/callback`（**若 Casdoor 不支持通配端口，则固定一个端口**，例如 `8765`）；② 配置 `HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI` | 自定义 scheme 未被 Casdoor/OS 接受、或某平台深链不可靠 |

---

## 3. 何时用回退、怎么切

**触发条件**（任一）：
1. Casdoor 侧**不允许**自定义 scheme 作为回调（部分部署会强制 http/https）；
2. 目标平台深链注册失败（例如 Linux 无桌面文件、或安装器未写注册表）；
3. 深链被其它实例/系统抢占，回调丢失。

**切换步骤**：
```bash
# 1) 客户端：配置回退模板（端口 0 = 由系统分配；生产建议固定端口，便于 Casdoor 白名单）
HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI="http://127.0.0.1:8765/callback"

# 2) 前端改用回退两条命令（不再是 begin/complete）
identity_oidc_begin_loopback()        # 返回 authorize_url + state + loopback_port
identity_oidc_await_callback(60000)   # 在本机回环等回调，收到后走同一条完成链路

# 3) Casdoor 侧：把 http://127.0.0.1:8765/callback 加入该应用的 redirect_uri 白名单
```
- `begin_loopback` 会**实际绑定**端口（端口 0 时由系统分配，返回值里的 `loopback_port` 就是实际端口），并把授权 URL 的 `redirect_uri` 换成实际值——token 交换必须逐字回传同一个 `redirect_uri`，否则服务端会拒（`invalid_grant`）。
- 再次 `begin_loopback` 会**丢弃**上一轮未完成的监听（旧句柄 drop 即关闭 socket）。

---

## 4. 安全注意（loopback）

1. **只监听 `127.0.0.1`**，绝不 `0.0.0.0`（否则同网段可劫持回调）；
2. **只接受一次**请求，处理完立即退出（`LoopbackServer` 一次性 TCP）；
3. **`Host` 必须回环**（`127.0.0.1`/`localhost`），防 **DNS rebinding**；
4. 响应页是**固定文案**的极简 HTML，**不含** `code`/`token`；
5. 等待有**上界**（命令层 clamp 到 1..600000ms），超时 → `oidc_timeout`，不会永久阻塞；
6. 回调 URL 里的 `code` 只用于一次兑换；`state` 不匹配/重复/过期 → 拒绝且不发起兑换。

> 已知本机限制：本机代理（Karing/S302）会劫持到 loopback 的**明文 HTTP 出站**请求，因此单元测试只覆盖纯函数（`handle_callback_request`）、绑定与超时，**不做真实回环 HTTP 往返**。

---

## 5. 环境变量一览（客户端）

| env | 默认 | 语义 |
|---|---|---|
| `HBUT_IDENTITY_OIDC_ENABLED` | 未设=关 | 关 → 新命令一律 `oidc_disabled`（不联网、不读 keyring） |
| `HBUT_IDENTITY_OIDC_ISSUER` | `https://auth.xn--vhq74jc2fzpchter27a.com` | 生产 issuer（`http://` 仅在 debug 构建 + `…ALLOW_INSECURE_BASE=1` + 回环 host 时允许） |
| `HBUT_IDENTITY_OIDC_CLIENT_ID` | 空 | 启用时必填；空 → `oidc_misconfigured` |
| `HBUT_IDENTITY_OIDC_REDIRECT_URI` | `minihbut://identity/callback` | 深链回调 |
| `HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI` | 空 | 回退模板（`http://127.0.0.1:<port>/callback`）；空 = 不用回退 |
| `HBUT_IDENTITY_OIDC_SCOPES` | `openid` | 空格分隔 |
| `HBUT_IDENTITY_OIDC_ALLOW_INSECURE_BASE` | 未设=关 | 仅 debug + 回环 issuer 时生效；**release 下无效** |

---

## 6. 未实测项（如实）

| 项 | 状态 |
|---|---|
| 真机深链回调（Windows / Android / iOS） | **未实测**（无真机环境） |
| 系统浏览器唤起与回前台 | **未实测** |
| 真实 Casdoor 联调（issuer/aud/claim 名） | **未实测**（FDL 条件未就绪，见 `P4-1`） |
| loopback 真回环 HTTP 往返 | **未实测**（本机代理劫持 loopback 明文 HTTP，只覆盖纯函数/绑定/超时） |
| 登录 UI（发起按钮、回调消费、错误展示） | **未接线**（本任务只交付可调用模块；`NotificationCoordinator` 目前显式忽略 `identity-callback` 深链） |
