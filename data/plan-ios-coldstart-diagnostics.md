# 计划：iOS 冷启动卡死 + 启动诊断能力

- 关联 Issue：[#991](https://github.com/superdaobo/mini-hbut/issues/991)（父）、[#992](https://github.com/superdaobo/mini-hbut/issues/992)（诊断）、[#993](https://github.com/superdaobo/mini-hbut/issues/993)（入口瘦身）
- 分支：`fix/ios-coldstart-diagnostics`
- worktree：`D:\Documents\C_learn\成绩查询\wt\tauri-ios-coldstart`
- 基点：`32a246eb`（= 用户复现的 TestFlight 构建 commit）

---

## 1. 现象与证据

### 1.1 用户现象

最新 TestFlight（`32a246eb`，版本串 `1.4.12-beta.N`）**冷启动**：长时间停在启动页 → 校徽 / 楼宇插画 / 背景图全部缺失、三环转圈不出现 → 突然弹出「miniHUBT 已崩溃」→ 二次启动一切正常。v1.4.10 无此问题。

### 1.2 截图时序定位（关键证据）

用户截图与 `apps/client/index.html` 的原生 Splash 逐元素对应，且各元素的入场动画延迟不同，可反推冻结时刻：

| 元素 | 动画延迟 | 截图中是否可见 |
|---|---|---|
| `.native-splash-content`（品牌 + 副标题） | 0s（0.7s 时长） | ✅ 可见 |
| `.native-splash-building`（楼宇插画） | 0.4s | ❌ 不可见 |
| `.native-splash-loader`（三环 + 文字） | 0.7s（`fill-mode: both`，起始 `opacity: 0`） | ❌ 不可见 |
| `.native-splash-particles`（粒子） | 分散延迟，合成层 | ✅ 可见 |

⇒ **主线程冻结发生在首绘后约 0.4–0.8s**，即 `<script type="module">` 开始求值的时刻。

三个必然推论：
1. 图片解码后无法上屏（渲染更新排队在主线程之后）；
2. 依赖定时器的 loader 动画无法推进；
3. `index.html` 的 2s / 5s 兜底移除、`main.ts` 的 4s 兜底、`useAppRuntime` 的 2.5s failsafe **全部无法触发**（定时器回调同样排队）→ 最终由 iOS 启动看门狗判定超时。

### 1.3 已排除项（均有证据）

| 假设 | 结论 | 证据 |
|---|---|---|
| splash 资源没进包 | 排除 | `public/splash/` 6 文件被 git 跟踪；`dist/splash/` 存在；`scripts/check_dist_boundary.mjs:13` 白名单允许 `splash`；Tauri `WalkDir` 递归嵌入整个 dist；CI 在 xcodebuild 前先 build |
| 协议 / CSP 拦截 | 排除 | iOS 走 `tauri://localhost`，`/splash/*` 与 `/assets/*` 同源同机制；`img-src 'self'` 已放行 |
| splash 代码近期改动 | 排除 | `git log v1.4.10..32a246eb -- index.html public/splash SplashScreen.vue` 为空 |

### 1.4 已证明的启动期同步开销回归

- `i18n/messages/ja.ts`（268,937 B 源码）于 v1.4.11（`be2c4686`）新增，被 `messages/index.ts:10-16` **顶层静态 import**，经 `app_i18n.ts:21` → `App.vue:12` 进入**入口 chunk**；入口产物 **988,603 B**。
- 入口另有约 **457 KB** 静态依赖同步求值，其中 `html2canvas`（204,264 B，仅用于导出截图）经 `capture_service.ts:1` 静态进入启动图。

---

## 2. 根因假设（按可信度排序）

| # | 假设 | 可信度 | 判别方式 |
|---|---|---|---|
| H1 | 入口模块求值期主线程被长时间占用（大 bundle 冷编译 + 顶层同步初始化），超过 iOS 启动看门狗阈值 | 高 | 诊断报告中的阶段耗时；`initDebugLogger` 之前是否有记录；模块求值是否走到 `mountApp` |
| H2 | WebContent 进程在冷编译期被杀（内存 / 编译预算），画面冻结在最后一帧，Tauri 等不到 `didFinishLoad` | 中高 | 报告中「是否发生 WebView 重载 / 是否再次收到 early log」；页面 `visibilityState` 与 `performance.memory` |
| H3 | 原生层（Rust setup 的 `block_on` 会话恢复 / DB 迁移）阻塞主线程，连带 `WKURLSchemeHandler` 无法服务资源 | 中低 | Rust `runtime_log` 的 `elapsed_ms` 时间线；启动期资源失败清单是否整批超时 |

**结论：当前证据不足以在 H1/H2/H3 中定论，必须先落地诊断取证（#992）。** #993 的入口瘦身是 H1/H2 的直接缓解手段，且本身是相对 v1.4.10 的可证明回归，无论最终根因如何都值得修。

---

## 3. 执行方案

### 阶段 A（#992）：启动诊断能力 —— 本 PR 核心

1. **早期时间线缓冲（必须在 JS 之前）**
   - 在 `apps/client/index.html` 的内联脚本中建立 `window.__hbuBootDiag` 桥，记录：`performance.now()` 时间戳、事件名、附加信息（含 splash 移除原因、资源加载失败、`document.readyState`、`visibilitychange`、`pageshow`）。
   - 监听**捕获阶段**的 `error` 事件，捕获所有子资源（`img` / `link` / `script`）加载失败 → 这是「图片没上屏」归因的关键证据。
   - 为 splash 的两张 `<img>` 显式加 `onerror` / `onload` 打点，记录 `naturalWidth`（区分「没拿到」与「拿到了但没上屏」）。
   - 记录 `performance.memory`（若可用）与 `navigator.userAgent`、`document.visibilityState`。
   - **跨启动持久化（对原计划的偏离，见第 6 节假设 3）**：时间线写入 `localStorage['hbu_boot_diag_v1']`，只保留最近两次启动。原因：崩溃发生在启动 #1，用户能在启动 #2 打开「设置-调试信息」，若只驻留内存则崩溃那一轮证据已丢失。持久化内容严格限定为时间戳 / 事件名 / 阶段耗时 / 失败资源 URL（去 query/hash），统一脱敏 + 截断，不含凭据与用户内容，容量有界（240 条 + 8 条长阻塞）。
   - **主线程冻结心跳**：250ms 定时器，间隔 ≥700ms 记一次 `main-thread-stall`（含起止时间与间隔）。这是区分「主线程被阻塞」与「进程被杀」的核心证据；启动完成后立即停止，避免长期唤醒。

2. **早期日志回放**
   - `main.ts` 在 `initDebugLogger()` 之后，把 `__HBU_BOOT_EARLY__` 的条目按序回放进 `pushDebugLog('Boot', ...)`，使启动页阶段日志进入环形缓冲，从而在「设置-调试信息」可见、可复制。

3. **阶段打点**
   - `main.ts` 的 `bootstrap()` 各步（`initThemeBridge` / `initDebugLogger` / settings / `mountApp` / deferred）使用既有 `markBootMetric`（`utils/boot_metrics.js:60`），自动进入调试日志。
   - `useAppRuntime` 的 splash 移除原因、2.5s failsafe、会话恢复阶段补打点。

4. **「设置-调试信息」启动诊断区块**
   - 在 `templates/views/SettingsView.html` 的 debug tab 增加可折叠「启动诊断」区块 + 「复制启动诊断」按钮。
   - 报告为纯文本，包含：构建版本 / 首启判定 / UA / 早期时间线 / 启动阶段耗时 / 资源失败清单 / 最近错误 / `boot_metrics` 快照。
   - 复用既有 `handleCopyDebugLogs` 的剪贴板模式，不新增持久化存储。

5. **Splash 兜底加固（顺带，低风险）**
   - 保留 2s/5s/4s 兜底，但记录原因与耗时；`removeNativeSplash` 幂等性保持。

### 阶段 B（#993）：入口 chunk 瘦身

1. `i18n/messages/index.ts` 只静态保留 `zh-CN`（默认语言）；`en` / `ja` 改为**按需动态 import**。
2. `app_i18n.ts` 的 `setLocale` 触发字典异步加载；加载完成前 `t()` 回落默认语言，加载完成后经既有响应式 `locale` ref 触发重渲染。
3. `capture_service.ts` 的 `html2canvas` 改为**函数内动态 import**，使该 chunk 脱离入口静态图。
4. 构建产物对比：入口 chunk 体积、`dist/index.html` 的 `modulepreload` 列表。

---

## 4. 验证方式

| 项 | 手段 |
|---|---|
| 类型检查 | `npm run typecheck`（`vue-tsc`） |
| 单测 | `npm test`（新增早期日志回放 / 报告格式化单测） |
| 构建 | `npm run build` + `node scripts/check_dist_boundary.mjs` |
| 体积对比 | `ls -la dist/assets/*.js`、`grep ログイン dist/assets/index-*.js` |
| i18n 回归 | `i18n_coverage.spec.ts` + 手动切 en/ja |
| 导出截图回归 | 相关单测 + 手动触发 |
| 真机取证 | 用户安装新 TestFlight 构建，冷启动复现后从「设置-调试信息」复制启动诊断报告回传 |

---

## 5. 回滚方案

- 全部改动集中在客户端前端（`index.html` / `main.ts` / `useAppRuntime.ts` / `debug_logger.ts` / `SettingsView` / `i18n` / `capture_service.ts`），**不涉及 Rust、不涉及数据迁移、不涉及服务端配置**。
- 回滚 = `git revert` 对应提交；无数据副作用。
- 诊断埋点为纯增量，关闭方式是直接 revert；入口瘦身若导致 i18n 异常，可单独 revert 阶段 B 的提交而不影响阶段 A。

---

## 6. 默认假设（无人值守下自行拍板）

1. **用户当前构建 = `32a246eb`**（已由 `gh run view 37180943991` 证实 `headSha`）。
2. **不做 i18n 行为回退以外的交互改动**：切换语言首次异步加载期间回落默认语言，可接受。
3. **~~不新增持久化存储~~ → 修正为「新增有界、已脱敏的启动时间线持久化」**：早期日志仍不进 `debug_logger` 的持久化路径（该模块禁止落盘），但启动时间线必须跨启动保留最近两次 —— 否则「首启卡死后进程消失」这一唯一要抓的场景无法取证。数据边界见 §3 阶段 A 第 1 条。
4. **不改 Rust 侧**：本轮不引入 Rust 改动，避免把 iOS 构建风险叠加到取证版本上。
5. **不动 `SplashScreen.vue` 的视觉**：仅补打点，避免引入视觉回归干扰判断。
6. 若阶段 B 的动态 import 导致 `i18n_coverage.spec.ts` 或构建失败且短期内无法收敛，则把阶段 B 拆为独立 PR，先保证阶段 A（取证能力）可发版。
