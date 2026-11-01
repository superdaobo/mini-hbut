# 本地 HTTP Bridge 安全边界

阶段一安全收口对应 GitHub Issues #532–#538。

## 监听与启用

- Bridge 始终绑定 IPv4 Loopback：`127.0.0.1`。
- `HBUT_HTTP_BRIDGE_HOST` 不再生效，避免误暴露到局域网或公网。
- `HBUT_HTTP_BRIDGE_PORT` 仅可修改端口。
- Debug 构建默认启用；Tauri iOS 因内嵌页面依赖默认启用；桌面 Release 仅在显式配置后启用。

## 路由访问级别

| 级别 | 示例 | 要求 |
| --- | --- | --- |
| `PublicHealth` | `GET /health` | 仅用于进程健康探测，不返回凭证 |
| `PublicEmbed` | 导出的日历文件、模块包静态内容、学校官网只读嵌入 | 仅 `GET/HEAD`；显式不可信 Origin 仍拒绝 |
| `Protected` | 登录、成绩、课表、选课、学习、AI、代理和写操作 | **只认凭据**：有效 Bridge 令牌（`Authorization: Bearer` 或 `X-Local-Token`）。**来源（Origin/Referer）不再构成授权** |
| `PublicEmbedWrite` | `/reserve-embed*`（图书馆官方预约页代理） | 仅 `GET/HEAD` 免令牌；写方法仍要求可信桥上下文（**已知残余**，官方第三方页无法携带我们下发的令牌） |
| `MediaProxy` | `/proxy/video`（学习通视频流） | 仅 `GET/HEAD` 由传输层放行；handler 内校验「桥令牌」或「媒体能力串」 |
| `LocalData` | `/local/{profile,grades,timetable}` | 传输层仅放行 `GET/HEAD`；handler 内校验本机 Agent 令牌（`Authorization: LocalToken <64hex>`） |
| `LocalCacheRead` | `/cache/get` | 传输层仅放行 `GET/HEAD`；handler 内校验 `local_api` RS256 JWT（`scope=cache:read`） |
| `DebugOnly` | `/debug/*`、`/campus-guide-debug/*` | 仅 Debug Router 注册，并继续要求运行时调试开关和统一访问控制 |

所有未知路由默认归入 `Protected`，新增路由不能因为遗漏登记而自动变成公开接口。

公开只读路由仅用于浏览器顶层导航或内嵌资源：`/exports/*`、`/module_bundle/content/*` 与 `/school-website/*`。对应的创建、下载准备、代理和写入接口仍属于 `Protected`。

## Origin 白名单

允许：

- `tauri://localhost`
- `capacitor://localhost`
- `http(s)://localhost[:port]`
- `http(s)://127.0.0.1[:port]`
- `http(s)://[::1][:port]`
- `https://tauri.localhost`

拒绝公网、局域网 IP、`file:` 和 `null` Origin。CORS 不再使用 `Any`。

## 令牌

每次 Bridge 启动都会生成随机会话令牌，服务端仅在内存中保存；Bridge respawn 会换新令牌。

**宿主如何取得令牌（#1163 T02）**

- 主窗口通过原生命令 `bridge_session_token` 取得（Rust 侧校验 `label == "main"`）。
- 模块窗口（`more-module-*`）、其他窗口、网页与 CLI 一律拿不到；模块 iframe 不注入 IPC，也没有该命令。
- 前端统一在 `src/utils/bridge_auth.ts` 注入：内存缓存 + 并发去重，**绝不**写 `localStorage/sessionStorage`、URL、日志或子页面。
- CLI 与自动化脚本继续使用 `HBUT_BRIDGE_TOKEN`（进程级兼容入口，属已知边界：能读到该环境变量的本机进程同样可用）。

**令牌何时失效**

- Bridge 进程退出 / respawn：旧令牌立即作废（服务端比较的是内存中新值）。
- 前端遇到 `401` 会清掉本地缓存，下次调用重新取；若某条路径吞掉 401 不重试，该次请求会失败（可由用户操作重试）。
- 前端没有任何「持久化令牌」逻辑，因此不存在「退出登录后令牌仍留在设备上」的问题。

令牌比较会同时检查长度和全部字节（常量时间）。

**媒体能力串（`/proxy/video`）**

`<video src>` 无法携带 header，因此主窗口用桥令牌派生一个**路由级短时能力串**：
`base64url(HMAC-SHA256(令牌, "media|<目标地址>|<exp>"))`，TTL 30 分钟；
Rust 用同一令牌复算校验（常量时间比较），只授权该目标地址，不授予其他路由权限，
且**主令牌永不进入 URL**。模块拿不到令牌 ⇒ 派生不出能力串。

## Release 隔离

- Release Router 不合并 Debug Router。
- `rust_backend_session.json`、`captured_requests.json` 和 `captured_requests1.json` 仅在 Debug 构建读取。
- Release 即使开启普通 Bridge，也无法通过运行时配置重新注册调试路由。

## Capability 最小权限审查

| 权限组 | 结论 | 原因 |
| --- | --- | --- |
| `core:default` | 保留 | 主窗口生命周期与基础事件能力 |
| 子 WebView create/show/hide/close/position/size/auto-resize | 保留显式条目 | 学校官网、模块预览等现有子 WebView 流程依赖 |
| `notification:*` | 移除 `notification:default`，改用显式权限 | 仅保留通知、权限查询/申请、Channel 和 Action Listener 实际调用 |
| `shell:default` | 保留 | Tauri 生成的默认 scope 仅允许 `http(s)`、`tel`、`mailto` 外链打开，不授予任意命令执行 |
| `window-state:default` | 保留 | 桌面窗口尺寸与位置恢复依赖 |
| `fs` | 不向前端授予 | 文件能力由受控 Rust command 处理，主窗口 Capability 中没有文件系统权限 |

新增插件或前端命令时，必须先补充此矩阵并证明现有显式权限不足，不能直接恢复插件 `default` 全权限集合。

## 变更检查

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo check --release --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
# Bridge 模块由 #[cfg(feature = "bridge")] 门控，必须单独跑一遍（CI 已加入该步骤）
cargo test --manifest-path src-tauri/Cargo.toml --lib --features bridge
npm run test:ci
npm run build
```
