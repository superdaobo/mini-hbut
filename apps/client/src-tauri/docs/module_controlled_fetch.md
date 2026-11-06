# 模块受控请求内核（T06 / #1167）

> 2026-11-05。实现：`modules/module_session_fetch.rs`（准入与执行）、`modules/module_instance_registry.rs`（实例信任）、
> `transport/tauri/module_fetch.rs`（Tauri 命令入口）。

## 一、原则

**模块永远拿不到会话。** 它只能按「已登记能力」请求宿主代发一次 HTTP，Cookie 只存在于 Rust 的 `reqwest::Jar`。

```
模块 iframe ──postMessage──▶ 宿主(主窗口) ──invoke──▶ Rust 内核 ──reqwest(Jar)──▶ 学校接口
     ▲                                                      │
     └──────────── {request_id,status,body} ◀─────── 清洗后的响应 ◀┘
```

三道闸门，缺一不可：

1. **窗口**：命令只允许 `label == "main"`（模块 iframe / 模块独立窗口都没有 IPC，这里再校验一次）；
2. **实例**：`module_instance_registry` 里必须已登记且 `trusted=true`（来自 T05 的清单验签结果），前端不能自报；
3. **能力**：host / port / method / path / 可提供的参数键，全部来自登记表。

## 二、能力登记表（唯一准入来源）

| 能力 id | 方法 | 目标 | 允许模块提供的参数 |
|---|---|---|---|
| `school.portal_client_ip` | GET | `https://e.hbut.edu.cn:443/common/clientIp` | 无 |
| `school.portal_page_view` | GET | `https://e.hbut.edu.cn:443/getPageView` | query `_t` / `pageCode` / `originalUrl` / `lang` |

两个接口都是应用**现有代码在用的只读查询、且按 JSON 解析**
（`http_client/academic/student_info.rs` 的 `fetch_portal_client_ip` / `getPageView`）。

### 为什么不是 `auth.hbut.edu.cn` 与超星接口（2026-11-06 真机实测）

登记表的原则是「**实测返回 JSON 才登记**」。真机逐个实测的结果：

| 候选 | 实测 | 结论 |
|---|---|---|
| `auth.hbut.edu.cn/.../queryUserOnline`（原 `school.profile_online`） | 200 但 **门户登录 HTML** | 该校门户会话在 `e.hbut.edu.cn`，该域不在会话范围 → 不登记 |
| `auth.hbut.edu.cn/.../queryUserLogs` | 同上 | 不登记 |
| `mooc1-api.chaoxing.com/mycourse/getCourseFolders` | **404** | 接口已不存在 → 不登记 |
| `mooc1.chaoxing.com/mooc-ans/visit/coursefolders` | **404** | 不登记 |
| `mooc1-api.chaoxing.com/gas/folder` | **403** | 不登记 |
| `mooc1.chaoxing.com/mooc-ans/visit/interaction` | **登录页**（`<title>用户登录</title>`） | 超星会话不覆盖该域 → 不登记 |
| `e.hbut.edu.cn/common/clientIp` | **200 `application/json`** | ✅ 登记 |
| `e.hbut.edu.cn/getPageView` | **200 `application/json`** | ✅ 登记 |

真机证据（模块身份走完整链路，宿主代取）：
`controlled_fetch_portal_client_ip → 200 {"errcode":"0","errmsg":"请求成功","data":"<自身校园网 IP>"}`。

需要 POST 的课表/成绩接口，等用真实账号核对参数后再登记 —— 登记表里不写没验证过的东西。

## 三、模块能提供什么、不能提供什么

| 可以 | 不可以 |
|---|---|
| 参数**值**（如 `t=1700000000`） | URL、host、path、method |
| 登记过的参数**键** | 未登记的键（直接拒绝，`MODULE_PARAM_REJECTED`） |
| 期望超时（会被夹到 ≤15s） | 任何请求头（Cookie / Origin / Referer / UA 全由 Rust 决定） |

实现上：query / form 都用登记表的白名单过滤后**重建**，模块塞不进额外键；
参数值拒绝控制字符、CRLF、NUL，`t` 只允许纯数字。

## 四、上限与失效

| 项 | 值 | 失败码 |
|---|---|---|
| 响应体 | 2 MB（超过直接失败，不截断） | `MODULE_RESPONSE_TOO_LARGE` |
| 表单体 | 4 KB | `MODULE_PARAM_REJECTED` |
| 请求超时 | 默认 10s，上限 15s | `MODULE_REQUEST_TIMEOUT` |
| 全局并发 | 4（进程级信号量） | `MODULE_TOO_MANY_REQUESTS` |
| 账号切换 | 请求携带的 `account_scope` ≠ 当前会话 | `MODULE_ACCOUNT_SWITCHED` |
| 未验签模块 | `trusted=false` | `MODULE_NOT_TRUSTED` |

响应头只保留 `content-type / cache-control / date / etag`，`Set-Cookie` 一律丢弃。

## 五、错误码（前端可做三语文案）

`MODULE_CAPABILITY_UNKNOWN`、`MODULE_NOT_TRUSTED`、`MODULE_TARGET_REJECTED`、`MODULE_PARAM_REJECTED`、
`MODULE_ACCOUNT_SWITCHED`、`MODULE_REQUEST_TIMEOUT`、`MODULE_RESPONSE_TOO_LARGE`、
`MODULE_TOO_MANY_REQUESTS`、`MODULE_UPSTREAM_ERROR`、`MODULE_FORBIDDEN_WINDOW`、`MODULE_INSTANCE_REQUIRED`。

## 六、测试

```bash
cd apps/client/src-tauri
cargo test --lib module_session_fetch   # 11 条：能力登记/未登记键/CRLF/GET 带表单/URL 拼接/超时夹取/并发/响应头过滤
cargo test --lib module_instance_registry  # 4 条：未登记不可信、只信 trusted、能力按实例隔离、clear_all
cargo test --lib module_fetch          # 2 条：只有 main 窗口可发起
```

## 七、留给 T07

1. 实例生命周期：`register_instance` / `unregister_instance` 要接到「打开 → 关闭/导航/切账号/撤权」上（当前只在准备模块时登记）；
2. 切账号时调用 `module_instance_registry::clear_all()`；
3. 宿主 SDK 的能力握手要把 `instance_id` / `request_id` 与之对齐（当前只定义了协议字段）。
