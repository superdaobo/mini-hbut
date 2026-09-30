# NEEDS-WIRING —— #909 积分中心 + 总排行榜（Worker C）

> 本文件只描述 **Integration 需要在独占文件里做的事**。Worker C 的交付物已在 worktree 内自测通过
> （typecheck 0 error；定向测试 21 文件 / 274 用例全绿，含既有 `game_center_*` 契约测试）。
> 分支：`feat/909-game-center-points`，基线 `origin/main = 5246792f`。

---

## 1. 交付物（Worker C 独占，Integration 勿改）

| 文件 | 作用 |
| --- | --- |
| `apps/client/src/utils/game_center/points.ts` | 积分 / 每日任务 / 账本 / 总榜的**唯一网络入口**（复用 api.ts 传输层与 base.ts 安全判定；白名单归一化；无任何 console/debug 输出） |
| `apps/client/src/utils/game_center/points.spec.ts` | 访问层单测（29 用例） |
| `apps/client/src/utils/game_center/global_rank.spec.ts` | 总榜单测（14 用例） |
| `apps/client/src/components/game-center/GameCenterPointsTab.vue` | 积分中心（自加载：钱包 / 今日进度 / 每日上限 / 每日任务 / 账本分页） |
| `apps/client/src/components/game-center/GameCenterGlobalRankTab.vue` | 总排行榜（自加载：`board=global_xp`、「我」置顶高亮、加载更多） |
| `apps/client/src/components/game-center/__tests__/points_tab.spec.ts` | 组件源码契约 + 行为测试（24 用例） |
| `apps/client/src/utils/i18n/messages/{zh-CN,en,ja}.ts` | 新增 **77** 个 key（三语同步，`i18n_coverage.spec.ts` 看守） |

---

## 2. 需要在 `GameCenterView.vue` 挂的 tab

两个组件都是**自包含**（自己请求、自己管理 loading / error / retry），Integration 只需传 props。

### 2.1 新 Tab「积分」（`points`）

- 组件路径：`./game-center/GameCenterPointsTab.vue`
- 建议位置：`rank` 之后、`me` 之前 → 顺序 `home / games / rank / points / [drift] / me`
- tab 项：`{ key: 'points', label: t('gameCenter.tabs.points'), icon: '💰' }`
- 建议显隐：`pointsEnabled = economyEnabled || dailyTasksEnabled`（两者都是既有「flag && capability」结果），
  为真才把 tab 项 push 进 `tabs`（能力不可用时整项不出现）。
- 挂载（props 名与组件 `defineProps` 一一对应）：

```html
<GameCenterPointsTab
  v-else-if="activeTab === 'points'"
  :api-base="flags.api_base"
  :wallet-enabled="economyEnabled"
  :daily-tasks-enabled="dailyTasksEnabled"
/>
```

- 不需要给 `watch(activeTab)` 加预取分支：组件在 `onMounted` 自行加载，并在 props 闸门
  `false → true` 时自动补加载（远程配置 / 能力探测晚到时也正确）。
- 与现有 `loadWalletIfEnabled()`（供 Me tab 的 wallet 卡）**互不冲突**；若想避免 `/me/wallet` 重复请求，
  可另开 issue 把 Me tab 的 wallet 卡替换为 PointsTab（本轮不做）。

### 2.2 新 Tab「总榜」（`globalRank`）

- 组件路径：`./game-center/GameCenterGlobalRankTab.vue`
- 建议位置：紧跟 `rank` → 顺序 `home / games / rank / globalRank / points / [drift] / me`
- tab 项：`{ key: 'globalRank', label: t('gameCenter.tabs.globalRank'), icon: '🌍' }`
- 建议显隐：复用既有 `verifiedEnabled`（= `game_verified_session_enabled && capabilities.leaderboards`）。
- 挂载：

```html
<GameCenterGlobalRankTab
  v-else-if="activeTab === 'globalRank'"
  :api-base="flags.api_base"
  :leaderboards-enabled="verifiedEnabled"
/>
```

### 2.3 若产品决定不新增 tab（最小接线）

把两个组件追加到现有 tab 内容里即可（都是自包含组件，顺序无约束）：

- `<GameCenterPointsTab :api-base="flags.api_base" :wallet-enabled="economyEnabled" :daily-tasks-enabled="dailyTasksEnabled" />`
  追加在 `GameCenterMeTab` 之后（`activeTab === 'me'` 分支内）；
- `<GameCenterGlobalRankTab :api-base="flags.api_base" :leaderboards-enabled="verifiedEnabled" />`
  追加在 `GameCenterRankTab` 之后（`activeTab === 'rank'` 分支内）。

---

## 3. `api.ts` 需要导出什么（**可选**）

Worker C 的 `points.ts` 已自包含 fetch，仅**只读复用** api.ts 既有导出
（`requestGamePlatformJson` / `pickEnvironmentCompatibleBase` / `GamePlatformError` / `LOCAL_ERROR_CODES`）
与 `base.ts`（`DEFAULT_GAME_PLATFORM_API_BASE` / `isSecureGamePlatformUrl` / `GAME_PLATFORM_PROTOCOL_VERSION`）。
**本 worktree 不要求改动 api.ts**。

如果 Integration 想把网络访问统一收敛回 api.ts（推荐但非必须），可追加三个导出：

```ts
export const fetchGamePlayerWalletLedger = (apiBase?: string, limit?: number, cursor?: string) => ...
export const fetchGameDailyTasks = (apiBase?: string) => ...
export const fetchGameGlobalXpLeaderboard = (apiBase?: string, limit?: number, cursor?: string) => ...
```

然后让 `points.ts` 的四个 `fetchPoints*` 改为 import 这些函数（组件与测试无需改动，
`points.spec.ts` 的 URL/头部断言需要同步，属 Integration 阶段机械调整）。

---

## 4. i18n key 清单（已三语同步，Integration 直接复用）

- tab 名：`gameCenter.tabs.points`（积分）/ `gameCenter.tabs.globalRank`（总榜）
- 积分中心 `gameCenter.points.*`（58 个）：
  - 容器/状态：`title` `walletDisabled` `loading` `loadFailed` `retry` `signInRequired` `piiNote`
  - 总览：`level` `levelProgress` `totalXp` `coins` `xpProgressValue` `xpForNextValue`
  - 今日：`todayTitle` `todayXp` `todayCoins` `todayRuns` `capXp` `capCoins` `capRuns` `capUnlimited`
  - 任务：`tasksTitle` `tasksDisabled` `tasksEmpty` `taskProgressValue` `taskReward`
    `rewardGranted` `rewardCapped` `rewardDisabled` `rewardNone` `rewardZero`
    `task.dailyPlay1` `task.dailyPlay3` `task.dailyDistinct3`
  - 账本：`ledgerTitle` `ledgerEmpty` `ledgerCount` `ledgerLoadMore` `ledgerLoadingMore`
    `reason.{runSettled,dailyCapApplied,rewardDisabled,bottleCreate,bottleClaim,bottleExpired,bottleSelfClaimRejected,seasonFinalized,adminManual,unknown}`
    `entryType.{reward,questReward,seasonReward,escrowHold,escrowRelease,escrowRefund,penalty,adminAdjust,unknown}`
- 总榜 `gameCenter.globalRank.*`（17 个）：`title` `subtitle` `disabled` `empty` `loading` `loadingMore`
  `loadMore` `loadFailed` `retry` `myRankTitle` `notRanked` `selfTag` `levelLabel` `metricName`
  `generatedAt` `signInHint` `piiNote`

> 增删任何 key 必须三语同步，并跑 `npx vitest run src/utils/i18n_coverage.spec.ts`。

---

## 5. `MoreView.vue` 是否需要入口

**不需要**。积分中心与总榜是游乐场内部 tab；`MoreView.vue` 的游乐场主入口
（`data-module-id="game_center"`）已由 #905 提供，本轮零改动（契约 §4.3 亦把 MoreView 列为独占文件）。

---

## 6. 假设与偏差（供 Integration 裁决）

1. `reason_code` 映射按 ocr-service `modules/game_platform/errors.py` 的 `LEDGER_REASON_CODES`（9 个）实现；
   `entry_type` 按 `LEDGER_ENTRY_TYPES`（8 个）。后端增删枚举时需同步 `points.ts` 映射 + 三语 key
   （`points.spec.ts` 的「枚举全覆盖」测试会先失败，避免 UI 静默漏文案）。
2. `/me/daily-tasks` 返回 404 `FEATURE_DISABLED` 按**占位语义**处理（不是错误、不给重试）。
3. `/leaderboards` 认证可选：未登录也请求（`me = null` → 显示「登录后即可查看你的排名」），
   带凭据时服务端返回 `me`；总榜 URL 不含 `game_id`，不要求用户先选游戏。
4. 总榜 `me.rank = 0`（服务端允许）显示「暂未上榜」，不伪造名次；列表行 rank 非法时回落稳定行号。
5. 账本只把 `entry_id` 当列表 key，`ref_id` / 幂等键不进入展示模型（保守 PII 处理）。
6. 未新增任何 npm 依赖；未触碰 Integration 独占文件（`GameCenterView.vue` / `MoreView.vue` /
   `api.ts` / `base.ts` / `flags.ts`）。
7. 组件降级路径全部为「中文提示 + 重试按钮」（能力关闭 / 未登录 / 请求失败），无白屏、无 `--` 占位。
