# 模块运行时隔离设计（T04 / #1165）

> 2026-11-02。实现于本 PR。上游契约：`docs/architecture/contracts/module-and-auth-contracts.md`（v1）。
> 本文件是**实现口径**，供 T05/T06/T07 接着做，避免各写一套。

## 一、问题

阶段 0+1 的事实基线与 T2 侦察确认了三件事：

1. 模块静态内容由 **Bridge 端口**（`127.0.0.1:4399`）提供，`/module_bundle/content/*` 与业务 API **同源**；
2. 同源意味着模块页面能读到桥响应体（即使 Protected 路由已要求令牌，`/exports/*`、`/school-website/*` 这类公开只读仍在同源可读范围）；
3. `MoreModuleHostView.vue` 的 iframe **没有 `sandbox`**，且有一处把 `http://127.0.0.1:4399` 写死。

## 二、方案（组合措施，Rust 仍是最终判定者）

| 措施 | 实现 | 作用 |
|---|---|---|
| **来源分离** | 新增「模块内容服务」独立监听（`127.0.0.1:4398`，`HBUT_MODULE_CONTENT_PORT` 可改且强制 ≠ Bridge 端口），只提供 `GET /module_bundle/content/*`，其余 404 | 模块 origin ≠ API origin；浏览器层直接拦住跨源读取 |
| 从业务路由摘除 | `routes::system::router()` 不再注册内容路由；`module_content_router()` 只给内容服务用 | Bridge 端口上该路径 404，不存在「两个入口都服务内容」 |
| 预览 URL | `module_bundle::build_preview_url()` 改用 `module_content_port()` | 新打开的模块一定落在独立 origin |
| `sandbox` | 仅对本机模块内容 iframe 加 `allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads` | 禁掉 top-level 导航、modals 之外的越权面；保住游戏需要的指针锁/下载 |
| 来源判定参数化 | `isLocalModuleContentOrigin()` 替代写死的 `4399` | 端口可配不改代码 |
| CSP | `tauri.conf.json` 的 `frame-src` 增加 `http://127.0.0.1:4398` | 父文档允许框住新 origin |

**为什么不是「只加 sandbox」或「只换端口」**：单加 sandbox 挡不住同源 `fetch`（sandbox 不限制同源 XHR）；单换端口挡不住 `allow-same-origin` 缺失时某些资源被 opaque 化后的降级使用。两者是组合措施，且真正的授权判定仍在 Rust（令牌 + 后续 T06 的能力登记）。

**远端 iframe（11 个游戏、远端模块）本轮不加 sandbox**：它们与宿主本就跨源，且依赖 fullscreen/输入聚焦；收紧留给 T07 的显式来源与能力握手，避免在 T04 顺手打断游戏。

## 三、边界与已知残余

1. **`/exports/*`、`/school-website/*` 仍在 Bridge 端口**：它们必须支持顶层导航（无 header），因此保持公开只读；现在模块无法同源读取，**但它仍可直接 `window.open` 或 `<img src>` 拉取**（与任意本机页面一致）。要彻底封闭需要「一次性下载链接」方案，属后续（未在本轮承诺）。
2. **模块内容服务无鉴权**：静态资源本身是公开产物（签名在 T05 才落地）；内容里的敏感数据由模块通过受控请求取，不写进静态包。
3. **端口冲突**：内容端口被占用时只告警、不影响 Bridge；此时模块会退回远端 URL（Android 本来就走这条）。
4. **平台**：Windows 实测；macOS/Android/iOS 未实测 → `unverified`。

## 四、验收要点（T4 执行）

- 模块 iframe 里直接 `fetch('http://127.0.0.1:4399/sync_grades')` → 跨源 + 无令牌，必须失败。
- 模块 iframe 里 `window.__TAURI_INTERNALS__.invoke('bridge_session_token')` → 不可用（跨源不注入）。
- 模块读 `parent.document` → 跨源拒绝。
- remount/关闭后旧窗口继续发消息 → 宿主丢弃（沿用既有 `event.source` 绑定）。
- 11 个游戏握手/票据/尺寸上报回归（至少 1 个完整跑通）。
