# 离线可用性调研 + 教学评教白屏根因（2026-10-29）

> 触发：用户反馈 ①「教学评教」页面一进去就白屏；② 断网连不上教务系统时，所有模块进不去、
> 显示不出来、缓存也加载不出来。本文记录两条线索的结论与证据。

---

## 一、教学评教白屏（已修复）

### 结论

`TeachingEvalView.vue` 模板使用了 `tf('eval.list.pending', …)` 等 3 处带插值的取词调用，
但 `<script setup>` 里只有 `const { t } = useI18n()`，**没有导入 `tf`**。

- `useI18n` 是 `useLocale` 的别名（`apps/client/src/utils/app_i18n.ts:176`），
  返回值只有 `{ locale, t }`（`app_i18n.ts:161`）——**不返回 `tf`**。
- Vue 3 模板编译时，未定义的标识符编译为 `_ctx.tf`；运行时 `_ctx.tf === undefined`，
  首次渲染调用即抛 `TypeError: … is not a function` → 该视图渲染中断 → 白屏。
- 触发点：第 170 行 `{{ tf('eval.list.pending', { n: pending.length }) }}` 位于
  `v-if="!selected"` 的默认列表分支，**进入页面即渲染**，所以「一进去就白屏」。

### 证据

1. 全仓扫描：所有在模板里用 `tf(` 的组件中，**唯一**未导入 `tf` 的就是
   `TeachingEvalView.vue`（其余组件均为 `import { useI18n, tf } from '../utils/app_i18n'`，
   例：`ExamView.vue:13`、`RankingView.vue:7`）。
2. i18n 键本身无问题：`eval.*` 共 29 个键在 zh-CN / en / ja 三语齐全，
   排除「缺键」可能。
3. 该组件的契约测试（`utils/teaching_eval_contract.spec.ts`）只检查功能字符串
   （skip_confirm / fillFullScore / 命令名），不检查 i18n 符号解析，所以没拦住。

### 修复

一行：`import { useI18n, tf } from '../utils/app_i18n'`
（分支 `fix/teaching-eval-whitescreen`，worktree `.wt-teaching-eval-fix/`）

### 为什么此前没被发现

- dev 下 Vue 只打 warning（"Property 'tf' was accessed during render but is not defined"），
  生产构建静默编译为 `_ctx.tf`，到运行时才抛错。
- 该页面入口在教务分组，使用频率低；渲染错误被错误捕获记录进调试日志，不崩整个 App。

---

## 二、断网时「所有模块都进不去 / 缓存加载不出来」

### 先说结论

**App 的启动链路和核心教务模块本身具备离线降级能力；用户感受到的「全部不可用」
来自覆盖缺口 + 恢复链路长等待，不是单点 bug。**

### 架构事实（基于代码阅读）

1. **启动不阻塞于网络**
   - Splash 在本地身份恢复后即关闭：`useAppRuntime.ts:219-224`
     （`restoreCachedIdentityFromLocal()` → `dismissSplash('cached-identity')`），
     另有 2.5s failsafe（`useAppRuntime.ts:192-199`）。
   - 在线会话恢复 `restoreTask` 是 fire-and-forget（`void restoreTask.then(…)`，
     `useAppRuntime.ts:250`），不阻塞 UI。
   - 全仓**没有**全局 `navigator.onLine` 门闩：`navigator.onLine` 只用于
     临时扫码会话判定（`SessionCoordinator.ts:194`）、certProbe 状态点、
     campus-guide 客户端，均不拦截 UI。

2. **登录态不因断网丢失**
   - `isLoggedIn = computed(() => studentId.value.length > 0)`（`stores/auth.ts:54`）。
   - 断网时本地缓存身份（#355）保留：`restoreCachedIdentityFromLocal` 把
     `onlineSessionState` 置为 `cached_offline`（`SessionCoordinator.ts:161`），
     `studentId` 不清空 → **模块入口不锁死，不会强制踢回登录页**（#355 明确禁止）。

3. **核心教务模块有完整的离线回退（`fetchWithCache`，`utils/api.ts`）**
   - 链路：TTL 内缓存命中 → stale-while-revalidate → 请求失败回落 stale 缓存
     （`withOfflineMeta` 注入 `offline: true` + `sync_time`）。
   - 网络类错误（reqwest「error sending request for url」等）不触发「教务维护」误报，
     但仍回退缓存展示（#587 的 `looksLikeNetworkIssue` 分支）。
   - 走这条路径的视图（10 个）：Dashboard、成绩(GradeView 数据经 grade store)、
     Schedule、Exam、Ranking、Calendar、AcademicProgress、TrainingPlan、Classroom、
     Electricity、ExportCenter 等。
   - 这些视图自带离线横幅（`exam.offlineBanner` / `ranking.offlineBanner` /
     `tx.offlineBanner` / schedule `offlineBannerText` 等）：
     「显示离线缓存数据 · 上次更新 xx」。
   - Rust 侧 `/api` 端点在断网时也会返回带 `offline: true` 的缓存快照，
     前端 `cacheOfflinePayload` 选项可将其落本地缓存（`api.ts:907-917`）。

4. **覆盖缺口：走 `invokeNative`（Rust → 远端教务）且无本地 stale 回退的模块**
   - 共 23 个视图使用 `invokeNative`，其中多数没有本地缓存兜底，断网即
     报错 / 空白 / 无限 loading：
     - `SchoolInboxView`（invokeNative=4，fetchWithCache=0）
     - `TeachingEvalView`（纯 Rust 链路；且后端 `protocol_ready: false`，
       协议未定，本来就不可用）
     - Chaoxing 系（ChaoxingClass / ChaoxingInbox / 学习通内嵌页）
     - LibraryReserve 系（ReserveSeat / ReserveRoom / ReserveMine 面板）
     - ResourceShare、SmartOrientation、SportsVenue、AiChat 等
   - 数量对比：73 个视图组件中，仅 10 个走 `fetchWithCache` 全量离线回退。

5. **断网时恢复链路的长等待放大「卡死感」**
   - 会话恢复失败且有记住密码时，App 进入「恢复中」维护态：
     `markJwxtMaintenance('会话需恢复，正在后台自动登录…', { phase: 'recovering' })`
     + `startJwxtRecoveryPolling()`（65s 轮询，`JWXT_RECOVERY_INTERVAL`）
     + 静默 `attemptOnlineRecovery`。
   - 断网时每次重登/恢复都要等 HTTP 超时（单请求 30s，登录门失联阈值 90s，
     `sessionGate.ts:29`），期间横幅一直显示「正在后台自动登录…」，
     用户观感 = 「App 卡住 / 连不上」。
   - `navigator.onLine === false` 时本可立即判定（`isDeviceOffline` 已存在于
     `SessionCoordinator.ts:127`），但恢复链没有据此快速失败。

### 结论（用户视角的完整解释）

- 「进不去 / 显示不出来」的模块 = 缺口清单里的 `invokeNative`/外链模块（无本地兜底）；
  核心教务模块实际会显示 stale 数据 + 离线横幅，但若用户断网时**本地没有历史缓存**
  （新装 / 缓存被清 / 首次使用即断网），则同样空白。
- 「缓存都没法加载」= 上述两类叠加 + 恢复期长横幅造成的整体印象。
- 不存在「断网即全应用锁死」的硬门闩；问题本质是**离线降级覆盖不一致**
  + **离线检测不快速失败**。

### 待决策方向（不指定实现，留给执行者）

1. 离线降级覆盖范围：优先补齐哪些 `invokeNative` 模块的本地缓存快照？
   （候选：校邮/收件箱、评教、图书馆预约、学习通列表类）
2. 断网快速失败：`navigator.onLine === false` 时是否跳过/缩短会话恢复与
   后台重登等待（避免 30–90s 的无效等待与「正在自动登录」长横幅）？
3. 全局离线状态提示：是否在 App 级（而非仅单模块横幅）展示
   「离线模式 · 数据为缓存」统一指示？
