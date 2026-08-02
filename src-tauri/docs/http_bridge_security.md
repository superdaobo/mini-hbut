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
| `PublicEmbed` | 模块包静态内容、学校官网只读嵌入 | 仅 `GET/HEAD`；显式不可信 Origin 仍拒绝 |
| `Protected` | 登录、成绩、课表、选课、学习、AI、代理和写操作 | 可信 WebView/Loopback Origin，或有效 Bearer / `X-Local-Token` |
| `DebugOnly` | `/debug/*`、`/campus-guide-debug/*` | 仅 Debug Router 注册，并继续要求运行时调试开关和统一访问控制 |

所有未知路由默认归入 `Protected`，新增路由不能因为遗漏登记而自动变成公开接口。

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

每次 Bridge 启动都会生成随机会话令牌，服务端仅在内存中保存。CLI 与自动化脚本可继续通过 `HBUT_BRIDGE_TOKEN` 提供受控兼容令牌。令牌比较会同时检查长度和全部字节。

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
npm run test:ci
npm run build
```
