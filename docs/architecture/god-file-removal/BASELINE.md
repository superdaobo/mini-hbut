# Phase 5 上帝文件拆除基线

- 基线提交：`54537d45`
- 采集日期：2026-08-05
- 父 Issue：#571
- 扫描范围：`src/**`、`src-tauri/src/**`
- 统计方式：`scripts/check_god_files.mjs` 与 PowerShell 结构扫描

## 1. 核心入口基线

| 文件 | 行数 | 结构计数 | 主要职责 |
|---|---:|---:|---|
| `src/App.vue` | 4997 | 47 个 `ref`、12 个 `computed`、4 个 `watch`、1 个 `onMounted` | 页面注册与宿主、导航、登录与退出、会话恢复、成绩加载、生命周期恢复、Widget 深链、远端配置、更新、公告、通知、窗口退出与全局弹层 |
| `src-tauri/src/lib.rs` | 6987 | 135 个 `#[tauri::command]`，`generate_handler!` 中约 191 个注册项 | Tauri 初始化、Command Transport、平台能力、调试、更新、登录、校园业务和状态注册 |
| `src-tauri/src/http_server.rs` | 6333 | 118 个 `.route(...)`、117 个异步 Handler | HTTP 服务生命周期、路由、鉴权、参数与响应映射，以及仍未完全迁出的业务流程 |
| `src-tauri/src/db.rs` | 3232 | 45 个公开函数、67 个函数 | 连接与 schema、缓存、凭据加密、Cookie/Token、备份恢复、多个业务仓储 |

## 2. 超限文件基线

最终红线：`App.vue ≤ 800`、`lib.rs/http_server.rs ≤ 1200`、`db.rs ≤ 1000`、一般 Vue ≤ 1500、一般 Rust ≤ 1800、一般 TS/JS ≤ 1000。

### Rust

- `src-tauri/src/modules/online_learning.rs`：5365
- `src-tauri/src/http_client/academic.rs`：4274
- `src-tauri/src/modules/chaoxing_class.rs`：2827
- `src-tauri/src/http_client/electricity.rs`：2173

### Vue

- `src/components/ScheduleView.vue`：5394
- `src/components/ForumView.vue`：4099
- `src/components/ChaoxingClassView.vue`：3356
- `src/components/SettingsView.vue`：3008
- `src/components/CourseSelectionView.vue`：2849
- `src/components/AiChatView.vue`：2752
- `src/components/NotificationView.vue`：2508
- `src/components/ResourceShareView.vue`：2152
- `src/components/ChaoxingHubView.vue`：2123
- `src/components/ExportCenterView.vue`：2109
- `src/components/Dashboard.vue`：2076
- `src/components/GlobalScheduleView.vue`：2045
- `src/components/LoginV3.vue`：1676
- `src/components/TowerGoView.vue`：1599
- `src/components/ElectricityView.vue`：1524

### TypeScript / JavaScript

- `src/utils/cloud_sync.runtime.js`：1904
- `src/utils/more_modules.js`：1628
- `src/utils/notify_center.runtime.js`：1433
- `src/utils/axios_adapter.ts`：1402
- `src/utils/remote_config.runtime.js`：1099

## 3. runtime 桥接基线

必须移除的 JavaScript runtime：

- `src/utils/cloud_sync.runtime.js`
- `src/utils/notify_center.runtime.js`
- `src/utils/remote_config.runtime.js`
- `src/utils/updater.runtime.js`

对应 TypeScript 门面仍通过显式 `.runtime.js` import 调用旧实现：

- `src/utils/cloud_sync.ts`
- `src/utils/notify_center.ts`
- `src/utils/remote_config.ts`
- `src/utils/updater.ts`

## 4. 基线保护

- `npm run check:god-files`：迁移模式。所有现有债务必须在 `god_file_debt.json` 中登记 Issue、负责人和到期日；新增未登记超限会立即失败。
- `npm run check:god-files:strict`：最终模式。任何债务、runtime 文件、runtime import 或超限文件都会失败。
- `npm run test:god-files`：验证未登记超限、runtime 桥接、严格模式和陈旧债务均可被机械捕获。
- `npm run check:architecture`：在原有架构守卫后执行迁移模式守卫。
- `npm run check:release`：在原有发布检查后执行严格模式守卫。

`god_file_debt.json` 只是迁移期断言，不是永久豁免。某项完成后必须立即删除对应条目；陈旧条目本身会导致检查失败。
