# 移动端前端发布边界（Issue #591）

> 目标：Android/iOS 目标发布构建中「产品不可达页面」真正从 Vite 前端产物消失（不生成 chunk、不进安装包），源码保留。
> 相关：#589（父）、#590（基线口径）、#591（本任务）、#594（Rust 侧）、#595（CI 集成）。
> 审计日期：2026-08-09（基于 `main` @ 2a75421b）。

## 1. 候选视图可达性矩阵（审计结论）

审计方法：全 src 导航入口 grep（Dashboard 宫格 / MoreView 远程模块 / MeView 子页 / 底栏 / 深链）+ `app_navigation.ts` 映射 + `app_store_policy.ts` 会话策略 + 构建产物验证。

| view key | UI 入口证据 | 产品可见性 | 结论 |
|---|---|---|---|
| `forum` | 无任何 UI 入口（底栏 `MAIN_TABS` 无、Dashboard 宫格无、MeView 无）；仅 `#/{sid}/forum` 深链可触发（NavigationCoordinator.ts:261-265, 458-482） | **产品隐藏**（用户明确不使用；App Store 黑名单 :259） | **发布构建排除**（本任务实现） |
| `course_selection` | Dashboard.vue:493 宫格定义（available:true, requiresLogin:true），「展开更多→教务服务」可达，可拖入宫格 | 始终保留（真实登录全功能；仅合规 guest 会话隐藏，app_store_policy.ts:237） | **不排除**（真实用户可用） |
| `more_module_host` | MoreView 远程模块卡片 `handleOpenRemoteModule`（MoreView.vue:472-607）→ navigate，是远程模块容器宿主 | 始终保留（功能入口；合规包黑名单 :261） | **不排除** |
| `more_chaoxing_checkin` | remote_config.json:102-110 `module_center.modules` internal 卡片（view:'more_chaoxing_checkin'）→ MoreView `handleOpenInternalModule` | 仅渠道保留（合规包黑名单 :253；非合规移动发布经远程配置可达） | **不排除**（有真实入口） |
| `MoreShuakeView` | 零 import/零注册/零导航；远程 `shuake` 卡片（remote_config.json:92-100）指向未注册 view → 占位页 | 产品隐藏 | **已自然排除**（dist 无 chunk），仅剩远程死入口可清理 |
| `OnlineLearningChaoxingView` / `OnlineLearningYuketangView` | 零 import/零注册/零导航 | 产品隐藏 | **已自然排除**（dist 无 chunk） |

**结论**：本轮编译期排除目标仅 `forum`（唯一「产品隐藏但仍在依赖图」的视图）。course_selection / more_module_host / more_chaoxing_checkin 均有真实入口，不得排除。

## 2. 编译期排除机制

- 标志：`VITE_EXCLUDE_HIDDEN_VIEWS=1`（vite.config.ts 注入 `import.meta.env.VITE_EXCLUDE_HIDDEN_VIEWS`）。
- 注入方：Android release / iOS TestFlight 发布 workflow（#595 统一接入）；默认本地/dev/desktop 构建全功能。
- 消费点：
  - `src/app/viewRegistry.ts`：`loadForumView` 条件化为 reject loader（死分支的 `import()` 被 Rollup 消除，不生成 chunk）；`VIEW_PREFETCHERS.forum` 条件化为 noop（排除构建不触发 prefetch）。
  - `src/config/app_store_policy.ts`：`EXCLUDED_HIDDEN_VIEW_IDS`（编译期常量，排除构建含 `forum`），`isViewAllowed`/`isModuleAllowed` 对排除 view 恒 false → 导航/深链/模块宫格收敛回 home（`goToView` 的既有安全行为），不会找不到组件/白屏/未处理错误。
  - `src/App.vue` 渲染分支保留（`v-if="currentView === 'forum'"` 永不匹配），兼容 `forum_view_identity_contract` 的 `<ForumView` 断言。

## 3. 产物级验证（本地）

| 构建 | ForumView chunk | index 引用 |
|---|---|---|
| 默认（`npm run build`） | `ForumView-*.js` 79,816B + css 42,805B 存在 | 有（无回归） |
| `VITE_EXCLUDE_HIDDEN_VIEWS=1` | **无 chunk** | **无引用** |

- 类型检查：通过（仅剩预存 `@mini-hbut/capacitor-plugin-mini-hbut-widget` 模块缺失错误，与本任务无关）。
- 单测：`app_store_policy.spec.ts` + `forum_view_identity_contract.spec.ts` 23/23 通过。
- before/after 基线：见 §4（使用 #590 脚本口径）。

## 4. before/after 基线（#590 口径）

| 层 | before（默认构建） | after（VITE_EXCLUDE_HIDDEN_VIEWS=1） | 差值 |
|---|---|---|---|
| dist 总大小 | 4,755,718B（192 文件） | 4,627,507B（190 文件） | **-128,211B（-2.7%）** |
| dist/assets | 含 ForumView-*.js 79,816B + ForumView-*.css 42,805B | 无 | -122,621B（JS+CSS，其余为引用/索引变化） |

> 由执行 Agent 用 `node scripts/report_bundle_sizes.mjs`（OUT=json）分别对默认与排除构建记录后回填；APK/IPA 差值待 #595 接入 workflow 后由 CI 产物回填。

## 5. 后续

- 若产品决定隐藏更多页面（如 more_chaoxing_checkin），在 `EXCLUDED_HIDDEN_VIEW_IDS` 增加 key，并补充对应入口审计证据（本任务约定：**先证明不可达，再排除**）。
- 远程配置 `shuake` 死入口（remote_config.json:92-100）指向未注册 view，点击落占位页（安全行为），不阻塞本任务。
