# 宿主注入契约：`host_origin` 与 `app_version`（#960）

> 实现依据：`apps/client/src/utils/game_center/module_context.ts`（注入器）、
> `apps/client/src/components/MoreView.vue`（游乐场正式注入点）、
> `apps/client/src/components/MoreModuleHostView.vue`（托管页注入点）、
> `website/modules-src/_sdk/src/host-bridge.js`（SDK 侧消费）、
> `website/modules-src/_sdk/src/runtime.js`（`client_version` 读取）。
>
> 本文面向宿主接入者与排障同学。宿主 → 游戏的唯一通道是 **iframe URL query**；
> 契约 C（宿主来源）与契约 B（版本隔离 / canary 版本名单）各依赖一个**必需**的注入参数。

## 1. 一句话结论

宿主在构造游戏模块 iframe URL 时**必须注入**两个参数：

| 参数 | 取值来源 | 缺失后果 |
|---|---|---|
| `host_origin` | 宿主自身 origin：`window.location.origin`（经 `normalizeGameOrigin` 归一） | SDK **fail closed**：允许集合为空 → `origin_unverifiable` → 不握手、**零 V2 请求** → verified 全链路静默不可用（对局徽标退化为"经典榜模式 / 本地模式"） |
| `app_version` | 构建期 stamp 的客户端版本：`resolveBuildAppVersion()`（即 `import.meta.env.VITE_APP_VERSION`） | 客户端被服务端记为 `unknown` → 服务端写入隔离名单（`GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS`）与 canary 版本名单（`allow_versions` / `deny_versions`）**永不命中** → 版本隔离与灰度放量**空转** |

两个参数都**非空才注入**（`module_context.ts#appendModuleEnvQueryParams` 的铁律，与
`rank_api` / `gomoku_api` 同一风格）：空值注入反而会让模块侧判为「宿主没声明」。
归一化后仍为空的值（如非特殊 scheme 下 `location.origin === "null"` 且无法重建）**宁缺勿假**——
不伪造版本串或 origin。

## 2. 取值来源（与实现逐字对应）

- **`host_origin`**：宿主页面 `window.location.origin`，先经 `normalizeGameOrigin`
  （`game_center/base.ts`，与 SDK `normalizeHostOrigin` 同规则）归一；
  归一为空时退化为 `${location.protocol}//${location.host}` 再归一一次（G10 兜底，
  覆盖 `tauri://localhost` / `capacitor://localhost` 等非特殊 scheme —— 它们的
  `location.origin` 是字符串 `"null"`）。两者都不可得才留空。
- **`app_version`**：构建期由 `vite.config.ts` 注入 `import.meta.env.VITE_APP_VERSION`，
  经 `resolveBuildAppVersion()`（`module_context.ts`，安全字符集校验）读取。
  口径细节（CI stamp 值 vs 本地未 stamp 构建的 `X.Y.Z+local` 后缀）见
  `canary-release-control.md` §9「版本名单的匹配串口径」。

## 3. 注入点（改代码只改这里）

| 场景 | 文件 | 说明 |
|---|---|---|
| 游乐场正式入口 | `MoreView.vue`（`resolveBuildAppVersion()` + `window.location.origin`） | 经 `appendModuleEnvQueryParams` 写入 iframe URL |
| 托管页 / 模块宿主 | `MoreModuleHostView.vue` | 同上，同一注入器 |
| 注入器本体 | `module_context.ts#appendModuleEnvQueryParams` | `app_version` / `host_origin` **非空才注入**；返回实际注入的参数名列表（诊断用） |

自研引擎 / 第三方宿主接入时，直接在 iframe URL 上带这两个 query 参数即可；
SDK 侧还会接受 `config.hostOrigins` 显式配置（优先级高于 URL 注入）。

## 4. 排障表（现象 → 可能缺的参数 → 检查方式）

| 现象 | 可能原因 | 检查方式 |
|---|---|---|
| 对局徽标恒为「经典榜模式 / 本地模式」，网络面板**无 `/meta` 请求** | `host_origin` 未注入（或注入了空串 / `"null"`） | 打开宿主侧日志或观察 iframe `frameSrc`，确认 URL 含 `host_origin=https://…`（或 `tauri://localhost` 等自定义 scheme 形态）；缺 → 检查注入点是否走了 `appendModuleEnvQueryParams` |
| SDK 诊断出现 `origin_unverifiable` / `host_origin_untrusted` | 同上（fail closed 生效） | 同上；另确认宿主握手消息的 `event.origin` 与注入值归一后一致 |
| 服务端「旧版本写入隔离」无命中；canary `allow_versions` / `deny_versions` 不生效 | `app_version` 未注入 → 服务端记 `unknown` | 观察 iframe URL 是否含 `app_version=…`；或看服务端请求日志的客户端版本字段是否为 `unknown` |
| `app_version` 形态与预期不符（如 `1.4.11+local`） | 该构建**未经过 CI stamp**（本地 / dev worktree 构建） | 见 `canary-release-control.md` §9；名单不要配 `1.4.11` 裸串去覆盖本地实例 |
| 老游戏 URL 直开仍可提交经典榜，但新游戏 verified 不工作 | 只注入了旧参数（`student_id` / `rank_api` …），缺新参数 | 对照本文 §1 逐项补齐（旧参数兼容见 `sdk-migration-guide.md` §9 第 17 条） |

## 5. 与其他文档的关系

- 信任级别与「`host_origin` 是自声明参数」的能力边界：`trust-model.md` §2.4；
- 版本名单的匹配串口径（stamp / 未 stamp 构建差异）：`canary-release-control.md` §9；
- 游戏迁移与老 URL 兼容清单：`sdk-migration-guide.md`（接入检查清单已引用本文）。
