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

---

## 7. 【检查 5】生产三方对齐（G6/G7 部署必读）

> 检查 5 分工实测结论：三仓（auth / client / ocr）的默认值互异，**生产必须显式配齐下表**，
> 否则 authorize → confirm → token → refresh 链路会在某侧 400/401/拒收。dev 回环默认值仅用于本地联调。

### 7.1 三方对齐表

| 侧 | env | 必须与谁一致 |
|---|---|---|
| auth | `OIDC_CLIENTS`（客户端必须含 `"public": true` + `redirect_uris: ["minihbut://identity/callback"]`） | client 的 `HBUT_IDENTITY_OIDC_CLIENT_ID` / `HBUT_IDENTITY_OIDC_REDIRECT_URI`（**逐字相等**，含 `minihbut://` 自定义 scheme） |
| auth | `ISSUER` | client `HBUT_IDENTITY_OIDC_ISSUER`、ocr `MINI_HBUT_IDENTITY_ISSUERS[].issuer`（id_token 的 `iss` 逐字比对） |
| ocr | `MINI_HBUT_IDENTITY_ISSUERS[].jwks_url` | **必须显式写** `{auth issuer}/jwks.json`（默认推导路径与 auth 实际暴露路径不符，不显式写会取 JWKS 失败 → 验签失败） |
| client | `VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED`（**构建期** VITE 变量） | 与运行时 `HBUT_IDENTITY_OIDC_*` 的**生效时机不同**（见 7.2），不能假设两边自动同步 |

注意：

- auth 侧客户端必须显式 `public: true`（client 是 PKCE 公有客户端，**不发** `client_secret`）；同一 `client_id` 既 `public` 又配了 secret → auth 直接 `ConfigError`。
- `/token` 的 `redirect_uri` 必须与 `/authorize` **逐字相等**（尾斜杠/大小写差异仍拒）。
- G7 深链对齐：auth `/authorize` 返回 `deep_link = minihbut://student-auth?request_id=<32hex>&nonce=<16..128>`，client 深链解析器（`platform/deep_link.ts` 的 `identity-confirm` kind）已接受该 host 并交给 `IdentityCoordinator.submitConfirmIntent` 最小入口（UI 接线在后续任务）。

### 7.2 VITE 构建期 vs 运行时 env 生效时机

| 类别 | 例子 | 生效时机 | 修改后需要 |
|---|---|---|---|
| client 构建期（Vite） | `VITE_HBUT_IDENTITY_DEVICE_TOKEN_ENABLED` | **构建时**烧进前端 bundle；运行时 `import.meta.env` 只是读构建期快照 | 重新 `vite build` 并发布新包 |
| client 运行时（Rust/OS env） | `HBUT_IDENTITY_OIDC_ENABLED` / `…_ISSUER` / `…_CLIENT_ID` / `…_REDIRECT_URI` | 进程启动/命令执行时由 Rust 身份模块**实时读取**当前 env | 重启 App 进程即可（无需重建） |
| auth / ocr（服务端） | `OIDC_CLIENTS` / `ISSUER` / `MINI_HBUT_IDENTITY_ISSUERS` | 服务进程启动时加载 | 重启对应服务进程 |

> 常见坑：改了 `VITE_*` 变量但只重启 App（不重新构建）→ bundle 里仍是旧值；
> 改了 `HBUT_IDENTITY_OIDC_*` 但没重启 App → 旧 env 仍生效。两侧必须分别核对。

### 7.3 登出后 AT 在 exp 内仍有效（无吊销）

- auth **没有吊销端点**（无 `revoke`）：用户登出后，已签发的 AT 在其 `exp` 窗口内**仍然有效**（AT 有效期 ≤900s，默认 300s），ocr/client 侧只会在 `exp` 过后才将其视为过期。
- 若需要登出后尽快失效，只能缩短 AT 的 `exp`（与刷新流程换票频率做权衡）；这是**有意的安全取舍，不是缺陷**。
