# Issue #984 全链路抓包与错误形态建档

- 抓包时间：2026-10-04
- 工具：Chrome DevTools MCP
- 基线：`origin/main` = `32a246eb`
- 说明：本文档**不含**账号、密码或完整 Cookie 值。CAS ticket 为一次性且已被消费，仅保留前 12 位用于形态识别。

---

## 链路 1：新融合门户 → 教务系统

### 1.1 门户登录（CAS → 门户）

入口：`https://e.hbut.edu.cn/`（新融合门户，标题「融合门户」）

登录页形态：`https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Fe.hbut.edu.cn%2Flogin%3FportalService%3D...`

- 三个 tab：**账号登录**（学号/工号 + 密码 + 图形验证码）、短信登录、扫码登录
- 图形验证码：`https://auth.hbut.edu.cn/authserver/getCaptcha.htl?<timestamp>`，80×30 JPEG，4 字符
- 验证码**大小写不敏感**，OCR 服务识别准确（本项目 OCR 端点实测可用）

成功链路（HTTP 302/303）：

```
POST authserver/login?service=https://e.hbut.edu.cn/login?portalService=...   [302]
GET  e.hbut.edu.cn/login?portalService=...&ticket=ST-2073119-...              [302]
GET  e.hbut.edu.cn/login?portalService=...                                    [303]
GET  e.hbut.edu.cn/index.html#/                                               [302]
GET  e.hbut.edu.cn/stu/index.html#/                                           [200]  ← 最终落地
```

门户会话校验端点：`e.hbut.edu.cn/getLoginUser`、`e.hbut.edu.cn/getLoginUserAndGuest`

**关键事实**：CAS 认证成功后 302 到 service 时，`ticket=ST-...` 出现在 **URL 查询串**中。

### 1.2 教务系统 —— 决定性发现

#### 路径 A：用 App 当前 `TARGET_SERVICE` 直接走 CAS（失败）

`TARGET_SERVICE` = `https://jwxt.hbut.edu.cn/admin/?loginType=1`（`http_client/mod.rs:72`）

在**全新干净上下文**（无任何 jwxt cookie、CAS 未登录）中，输入正确账号密码完成 CAS 认证：

```
114 POST authserver/login?service=https://jwxt.hbut.edu.cn/admin/?loginType=1   [302]
115 GET  jwxt.hbut.edu.cn/admin/?loginType=1&ticket=ST-2073166-L-WQEZEu...      [303]
116 GET  jwxt.hbut.edu.cn/admin/login                                           [200]  ← 最终落地
```

**CAS 认证成功、ticket 已发出，但 JWXT 在 `/admin/?loginType=1` 上不接受 ticket，303 跳到 `/admin/login`。**

在**已持有有效 CAS TGT** 的上下文中重复同一导航，结果完全相同：

```
204 GET authserver/login?service=...jwxt.../admin/?loginType=1                  [302]
205 GET jwxt.hbut.edu.cn/admin/?loginType=1&ticket=ST-2073135-7JCzes...         [303]
206 GET jwxt.hbut.edu.cn/admin/login                                            [200]
```

#### 路径 B：`/admin/caslogin`（成功）

在路径 A 失败后的**同一上下文**（仍然没有 jwxt 会话）中访问 `/admin/caslogin`：

```
140 GET  jwxt.hbut.edu.cn/admin/caslogin                                        [302]
141 GET  auth.hbut.edu.cn/authserver/login?service=https://jwxt.hbut.edu.cn/admin/caslogin  [302]
142 GET  jwxt.hbut.edu.cn/admin/caslogin?ticket=ST-2073173-YUcN-O4...           [302]
143 GET  jwxt.hbut.edu.cn/admin/?loginType=1                                    [200]  ← 最终落地
```

随后验证业务资源：

```
GET jwxt.hbut.edu.cn/admin/xsd/xsjbxx/xskp  →  200，213,677 字节，
<title>学生基本信息详情-Powered by ChaoXing</title>，含真实学籍字段
```

#### 路径 C：把 service 换成 `/admin/caslogin`，全新登录（一步成功）—— **决定性对照实验**

在**另一个全新隔离上下文**（无 CAS TGT、无任何 jwxt cookie）中，仅把 CAS 登录页的 `service` 参数
从 `/admin/?loginType=1` 换成 `/admin/caslogin`，其余完全不变（同一账号、同一密码、同样图形验证码）：

```
115 POST authserver/login?service=https://jwxt.hbut.edu.cn/admin/caslogin      [302]
116 GET  jwxt.hbut.edu.cn/admin/caslogin?ticket=ST-2073195-rNgWXQmW...         [302]
117 GET  jwxt.hbut.edu.cn/admin/?loginType=1                                   [200]  ← 最终落地
```

随后业务资源：

```
GET jwxt.hbut.edu.cn/admin/xsd/xsjbxx/xskp  →  200，213,677 字节，
<title>学生基本信息详情-Powered by ChaoXing</title>
```

**一步直达教务首页，无需任何补偿步骤。**

| 实验 | 上下文 | service | 最终 URL | 结果 |
|------|--------|---------|----------|------|
| A | 干净 | `/admin/?loginType=1` | `/admin/login` | ❌ 会话未建立 |
| A' | 已持 CAS TGT | `/admin/?loginType=1` | `/admin/login` | ❌ 会话未建立 |
| B | 干净（承接 A 之后） | `/admin/caslogin`（二次跳转） | `/admin/?loginType=1` | ✅ 会话建立 |
| C | 干净（独立） | `/admin/caslogin` | `/admin/?loginType=1` | ✅ 一步建立 |

### 1.3 结论（对修复的直接含义）

1. **`/admin/?loginType=1` 永远无法建立教务会话**。CAS 发的 ticket 在它上面被丢弃（303 → `/admin/login`）。
2. **`/admin/caslogin` 才是唯一能完成 ticket → session 交换的入口**。它自身是一个完整 CAS 往返（`service=/admin/caslogin`，无查询串）。
3. 两条路径的唯一差异是 **service 字符串是否带查询串 `?loginType=1`**；其余条件（CAS TGT、jwxt cookie 状态）完全相同。高度怀疑 JWXT 的 ticket 校验要求 service 精确匹配，带查询串导致校验失败。**该因果需在 Phase 3 前用一次对照实验确认**（把 `TARGET_SERVICE` 改为 `/admin/caslogin` 后走一次全新登录）。
4. 因此 `finalize_jwxt_user_session()` 里的 `/admin/caslogin` **不是「补偿重试」，而是建立教务会话的唯一必要步骤**——当前代码把它写成 `let _ = ...` 并当作可选补偿，是根本性的定位错误。
5. `auth.rs:564` 的 `is_already_logged_in` 判定在此链路上**必然为 true**：最终 URL `https://jwxt.hbut.edu.cn/admin/login` 不含 `authserver/login`。因此只要用户残留了有效 CAS TGT，本次密码 POST 就会被跳过，且**直接调用 `fetch_user_info()` 而不经过 `finalize_jwxt_user_session()`**（`auth.rs:1099-1107`）——即连唯一的 caslogin 建立步骤也被绕过。

### 1.4 与 Issue 假设的差异

Issue 假设「CAS 看起来有状态但 JWXT 落在 `/admin/login`」时，代码会走 `finalize_jwxt_user_session()` 并因不校验结果而失败。
实测更严重：**该分支根本不会进入 `finalize_jwxt_user_session()`**（`auth.rs:1099` 直接 `fetch_user_info()`），只有 `fetch_user_info()` 内部（`session.rs:599-609`）有一次 caslogin 修复，且该修复在 `prefer_chaoxing_jwxt == true` 时被跳过（`session.rs:592-598`）。

---

## 链路 2：一码通 `code.hbut.edu.cn`

**前置**：门户登录后必须把浏览器 UA 切为手机端，才会渲染移动端一码通页面（实测 iPhone UA 生效）。

### 关键发现：门户 CAS 会话**不足以**进入一码通

直接用门户会话访问 `https://code.hbut.edu.cn/`：

- 页面直接加载（**没有**跳 CAS），但渲染内容为 **「Token已失效 请退出后重新进入 确定」**
- `GET /server/auth/getLoginUser` → **401**，响应体为空
- `document.cookie` 为空

### 正确链路：必须走 `host/open` 发起独立 CAS 往返

```
522 GET https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2                    [302]
523 GET https://auth.hbut.edu.cn/authserver/login?service=https://code.hbut.edu.cn/server/auth/host/open?org%3D2%26host%3D28  [302]
524 GET https://code.hbut.edu.cn/server/auth/host/open?org=2&host=28&ticket=ST-2073216-vwhB26kg...  [302]
525 GET https://code.hbut.edu.cn/?tid=yqDLu2rItoVtPRswno485&orgId=2                    [200]
```

成功后渲染真实移动端 UI：「湖北工业大学 个人中心 本科生 学工号 账户余额 扫一扫 校园码 交易记录 …」。

### 对修复的含义

1. **会话载体是 `tid` 查询参数**（`/?tid=<token>&orgId=2`），**不是 Cookie**。`document.cookie` 为空。
2. CAS 会**重排** service 的查询串：请求里写 `host=28&org=2`，CAS 跳回时变成 `org=2&host=28`。任何依赖 service 字符串精确匹配的逻辑都要注意这一点。
3. **`check_code_login()`（`auth.rs:918-939`）判定失效**：它依赖 `/server/auth/getLoginUser` 返回 `success:true`，但该端点在移动端流程下返回 **401**。即使用户一码通完全可用，该函数也返回 `false`。
4. `auth.rs:566` 的 `final_url.contains("code.hbut.edu.cn/server/auth/host/open")` 判定同样失效：最终 URL 是 `/?tid=...`，不含 `/server/auth/host/open`。

---

## 链路 3：智慧迎新 `stu.hbut.edu.cn`

入口常量（`modules/smart_orientation.rs:24-26`）：`WELCOME_BASE = https://stu.hbut.edu.cn`，CAS service = `https://stu.hbut.edu.cn/app/welcome/`。

实测（用已有 CAS TGT）：

```
570 GET authserver/login?service=https://stu.hbut.edu.cn/app/welcome/   [302]
571 GET stu.hbut.edu.cn/app/welcome/?ticket=ST-2073229-KGxJ5HG...       [200]  ← 最终落地
```

最终页面：`https://stu.hbut.edu.cn/app/welcome/#/welcome/flyer`，标题「智慧迎新」。

**与教务的关键差异**：智慧迎新的 service **直接接受 ticket**（`?ticket=` 出现在最终 URL 上，200），而教务 `/admin/?loginType=1` 会 303 丢弃 ticket。因此 `extract_ticket(final_url)` 这类逻辑对智慧迎新有效，对教务无效。

---

## 链路 4：学习通

`https://i.chaoxing.com/base` → `https://passport2.chaoxing.com/mlogin?fid=12&refer=...`（标题「登录」）

**结论：学习通是独立凭证链路**，门户 CAS 会话不授予学习通访问权。这与 `ensure_chaoxing_academic_session()` 的设计一致（需要 `UID`/`_uid` + `cx_p_token`/`p_auth_token`/`xxtenc`）。

> 说明：本次未取得学习通账号，因此未深入抓取其登录与 `xxtlogin` 桥接链。若需补全，需要提供学习通凭证。

### 附带发现（与 #984 同根因）

`modules/chaoxing_sso.rs:479-482` 的**静默重登首选 service** 正是

```rust
"https://jwxt.hbut.edu.cn/admin/?loginType=1",
```

即本档案已证明**无法建立教务会话**的那个 service。静默重登因此会在教务链路上失败并退化到 code 服务。属于同一根因的第二个受害点。

---

## 错误形态分类（实测）

| 错误类型 | HTTP | 判定特征 | 是否被现有代码正确分类 |
|---------|------|---------|---------------------|
| 图形验证码错误 | **401** | 响应体为登录页；`#showErrorTip` = **「图形动态码错误」** | ✅ `classify_login_error_text` 含「验证码错误」等词，但**实际文案是「图形动态码错误」，词表里没有「动态码」** → 靠 401 分支兜底 |
| 用户名/密码错误 | **401** | 响应体为登录页；`#showErrorTip` = **「用户名或者密码有误；首次登录，请按照提示进行激活操作」** | ⚠️ **未命中**。现有词表有「用户名或密码错误」「密码错误」「认证失败」，但真实文案是「用户名**或者**密码**有误**」→ `detect_login_error_from_html` 返回 None，最终靠 `status == 401` 分支给出通用文案「登录失败，请检查账号或密码」 |
| CAS 认证成功但教务会话未建立 | 302 → **303** → 200 | POST 302 → `jwxt…/admin/?loginType=1&ticket=ST-…` 303 → `jwxt…/admin/login` 200 | ❌ 被 `auth.rs:564` 判为「已登录」→ 跳过密码 POST → 最终压成「会话已过期」 |
| 传输层错误（DNS/TLS/超时） | — | 未实测（避免人为断网影响会话） | ✅ 已有 `is_transport_error` + 5s 短 backoff |

### 补充实测事实

- 错误密码后 `_badCredentialsCount` 仍为 `"0"` —— 说明该计数器不因一次密码错误而递增，本次探测未造成账号风险。
- CAS 登录失败一律返回 **401 + 重新渲染登录页**，`#showErrorTip` 是唯一可靠的错误文案来源。
- 图形验证码在**页面二次加载后会重新生成**；读取验证码与提交之间若发生页面重载，必然验证码失配（401「图形动态码错误」）。这解释了自动化抓包时的间歇性失败，与 #984 无关。

---

## 待补链路（未完成）

- 学习通登录 + `xxtlogin` 桥接全链（缺学习通凭证）
- 传输层错误四点的实测样本（未人为断网）
