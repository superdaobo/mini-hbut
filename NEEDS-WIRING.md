# NEEDS-WIRING 合并存档（Integration 裁决：两侧均为独立交付物，原文逐字保留）

> 本文件由 Integration（#909 + #910 客户端联调）在合并两个 Worker 分支时产生：
> 两个 Worker 各自在自己 worktree 根目录写了同名 `NEEDS-WIRING.md`，冲突按
> 「两侧内容都保留」的并集原则解决（与 i18n 冲突同一原则）。

---

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

---

# 附：Worker E（#910）NEEDS-WIRING.md 原文

# NEEDS-WIRING —— Worker E（#910 漂流瓶客户端 + 更多页可发现性）

> 本文件说明 Integration 需要在**独占文件**里做的接线。Worker E 交付的文件全部可独立编译/测试通过，
> 未自行修改任何 Integration 独占文件（`GameCenterView.vue` / `MoreView.vue` / `api.ts` / `base.ts` / `flags.ts`）。

---

## 0. 交付文件（Worker E 独占，已提交）

| 文件 | 说明 |
| --- | --- |
| `apps/client/src/components/game-center/GameCenterDriftTab.vue` | **替换** #905 占位 → 漂流瓶真实 UI（捞瓶 / 投文本瓶 / 投红包瓶 / 领取红包 / 举报 / 隐藏 / 结果状态） |
| `apps/client/src/utils/game_center/drift.ts` | 漂流瓶 API 访问层（HTTPS/loopback 复用 `api.ts` 传输层、Identity AT、超时、错误归一化、无 console 输出） |
| `apps/client/src/components/game-center/GameCenterQuickEntries.vue` | 「更多」页快捷入口组件（**待 Integration 挂载**） |
| `apps/client/src/utils/game_center/quick_entries.ts` | 入口定义 + 可见性判定 + 一次性 Tab 意图通道 |
| `apps/client/src/utils/game_center/drift.spec.ts` | 24 个单测 |
| `apps/client/src/utils/game_center/quick_entries.spec.ts` | 12 个单测 |
| `apps/client/src/utils/game_center_wiring_contract.spec.ts` | **修改 1 处断言**：原 `expect(drift).toContain('placeholderTitle')`（#905 占位门禁）改为看守真实 UI 的 5 个动作锚点 + UGC/登录前置闸门（不是 Worker E 独占文件，但属本次交付的一部分，理由见 §4） |
| `apps/client/src/utils/i18n/messages/{zh-CN,en,ja}.ts` | 三语 key 新增/替换（见 §3；三个文件同步补齐，`i18n_coverage.spec.ts` 测试 2 会强制校验） |

---

## 1. `GameCenterView.vue` 需要什么

### 1.1 漂流瓶 Tab —— **无需任何改动即可生效**

`GameCenterView.vue` 第 436 行已有
`<GameCenterDriftTab v-else-if="activeTab === 'drift' && driftEnabled" />`，
`driftEnabled = flags.drift_bottle_enabled && capabilities.drift_bottle`（双层闸门）保持不变；
组件替换后自动挂载真实 UI。

**可选（推荐）**：把远程下发的 API base 传给该 Tab（当前缺省走环境派生默认源，与未传 `apiBase` 的其它调用一致）：

```vue
<GameCenterDriftTab v-else-if="activeTab === 'drift' && driftEnabled" :api-base="flags.api_base" />
```

组件已支持可选 `apiBase` prop（缺省 `''` = 环境默认源），无需其它改动。

### 1.2 「更多」页快捷入口的深链落位 —— **需要 1 处小改**

`GameCenterQuickEntries` 点击时只做两件事：登记一次性 Tab 意图（`requestGameCenterTabForEntry`）
+ `emit('open')`。要让意图真正落位，`GameCenterView.vue` 需要在 **flags 与能力表就绪之后**消费一次：

```ts
import { consumeGameCenterTab } from '../utils/game_center/quick_entries'

// onMounted 内、refreshPlatformAvailability() 之后（tabs 已按 driftEnabled 算出）：
const requestedTab = consumeGameCenterTab()
if (requestedTab && tabs.value.some((tab) => tab.key === requestedTab)) {
  activeTab.value = requestedTab
}
```

要点：
- 必须在 `refreshPlatformAvailability()` **之后**：`drift` Tab 是否存在于 `tabs` 取决于 `driftEnabled`，
  目标 Tab 不可用时保持默认 `home`（这就是「点了不会报错」的兜底）；
- `consumeGameCenterTab()` 一次性（consume 即清空），历史恢复 / 二次进入不会重复跳 Tab；
- 若不接这一步，四个入口仍可用（进入首页），只是不自动落到目标 Tab。

### 1.3 `api.ts` 需要导出什么 —— **无需新增导出**

`drift.ts` 只使用 `api.ts` **已有** 导出：`requestGamePlatformJson`、`resolveGamePlatformApiBase`、
`GamePlatformError`、`LOCAL_ERROR_CODES`、`createIdempotencyKey`、`GAME_PLATFORM_REQUEST_TIMEOUT_MS`、
`GAME_PLATFORM_PROTOCOL_VERSION`。

**可选**（保持「API 调用只能经 api.ts」的仓库惯例，若 Integration 希望收敛入口）：

```ts
export { drawRandomDriftBottle, publishDriftBottle, claimDriftBottle, reportDriftBottle, hideDriftBottle } from './drift'
```

`flags.ts` / `base.ts` 同样无需改动：UGC 前置隐藏已由既有 `applyGameCenterPolicyClamp`
（`!= policy.userGeneratedContent → drift_bottle_enabled = false`）覆盖，组件内**再验一次** `userGeneratedContent` 作为纵深防御。

---

## 2. `MoreView.vue` 需要什么（快捷入口挂载）

### 2.1 挂载位置建议（不破坏经典 11 个游戏入口）

插在 **Game Center 主入口按钮之后、`classic-games` 折叠区之前**（即现有 `<!-- #905 湖工游乐场主入口 -->`
按钮的 `</button>` 与 `<!-- 经典游戏入口 -->` 之间）：

```vue
<!-- #910 游乐场快捷入口：积分中心 / 总排行榜 / 漂流瓶 / 全部游戏 -->
<GameCenterQuickEntries
  v-if="gameCenterEntryVisible"
  :flags="gameCenterFlags"
  @open="openGameCenter"
/>
```

```ts
import GameCenterQuickEntries from './game-center/GameCenterQuickEntries.vue'
```

要点：
- `openGameCenter` 是 MoreView **已有**方法（内部 `emit('navigate', 'game_center')`，受
  `isViewAllowed('game_center')` 门禁）；`@open="openGameCenter"` 传入的事件参数会被 JS 忽略，无需改函数签名；
- `:flags="gameCenterFlags"` 是当前生效 flags（MoreView 已在 `onMounted` 用
  `resolveEffectiveGameCenterFlags` 更新过）；**不要**传 `capabilities`（MoreView 不探测 `/meta`，
  组件在 capability 缺省时只按 flag 判定，点击后由 GameCenterView 双层闸门兜底）；
- 组件自带标题（`more.quickEntries.title`）与 2×2 卡片网格，整体包裹在
  `data-section="game-center-quick-entries"` 的独立 `<section>` 内。

### 2.2 不破坏经典入口的说明（可写进 review 记录）

- 快捷入口是**新增独立 section**：不触碰 `moduleCards` / `classic-games` 折叠区 / `consumeGameOpen` 链路；
- `classic_game_entries_visible` 语义与默认值（true）零改动 → 11 个游戏入口与旧版路径逐字保持；
- 无入口可见时（flags 全关 / MoreView 未传 flags）组件渲染为**空**（`v-if="entries.length"`），
  不产生空白占位块；
- 组件自身只读 flags 与派发导航事件，不复制 MoreView 的模块打开状态机。

---

## 3. i18n key 清单（三语已同步，Integration 无需补 key）

**删除**（#905 占位，已随交付移除）：`gameCenter.drift.placeholderTitle`、`gameCenter.drift.placeholderBody`。

**新增/保留**（zh-CN / en / ja 三侧均已补齐，`i18n_coverage.spec.ts` 测试 2 + `game_center_wiring_contract.spec.ts`
「五语言 key 集合一致」会校验）：

```
gameCenter.drift.subtitle / retry / policyNote / policyDisabledTitle / policyDisabledBody
gameCenter.drift.session.checking
gameCenter.drift.guestTitle / guestBody
gameCenter.drift.draw.{title,action,busy,emptyTitle,emptyBody,again}
gameCenter.drift.bottle.{from,anonymous,mineBadge,coinBadge,textOnlyBadge,expiresAt,mineClaimNote}
gameCenter.drift.claim.{action,redeem,busy,credited,success,again}
gameCenter.drift.report.{action,cancel,reasonLabel,detailPlaceholder,submit,busy,success}
gameCenter.drift.report.reason.{spam,abuse,fraud,other}
gameCenter.drift.hide.{action,success}
gameCenter.drift.publish.{title,textMode,coinMode,placeholder,counter,coinLabel,coinPlaceholder,coinNote,textNote,action,busy,successTitle,successBody,successCoinBody,another}
gameCenter.drift.validate.{textEmpty,textTooLong,coinNotInteger,coinNotPositive,coinTooLarge}
gameCenter.drift.error.{title,poolEmpty,selfClaim,alreadyClaimed,expired,notFound,rateLimited,dailyLimit,insufficientBalance,textInvalid,unauthenticated,serviceUnavailable,unknown}
more.quickEntries.title
more.quickEntries.{points,rank,drift,games}.{title,desc}
```

含 `{n}` / `{name}` / `{time}` / `{max}` 占位的 key 一律经 `tf()` 插值（与项目既有约定一致）。

---

## 4. 契约测试改动说明（`game_center_wiring_contract.spec.ts`）

- 原断言（#905 时期）：「漂流瓶 Tab 必须是占位」`expect(drift).toContain('placeholderTitle')`；
- 现断言（#910 交付后）：不得回退成占位（`not.toContain('placeholderTitle')`），且必须保留
  5 个动作锚点（`data-action="draw" / publish / claim / report-submit / hide`）与前置闸门
  （`userGeneratedContent`、`gameCenter.drift.guestTitle`）；
- `GameCenterView` 侧的 `activeTab === 'drift' && driftEnabled`（未就绪整块不挂载）断言**保持不变**。

---

## 5. 风险与联调注意

1. **「余额不足」错误码未在契约里冻结**：`drift.ts` 不改写服务端码；组件对
   `code` 做宽松匹配（含 `INSUFFICIENT` / `BALANCE` 即映射「湖工币余额不足」），
   其余未知码回落服务端中文 `message`。联调时请与 Worker D 确认实际码，必要时收敛为精确匹配。
2. **空池 404 `DRIFT_POOL_EMPTY`**：API 层原样抛出，UI 按**正常状态**渲染（`tone=info` +「再捞一次」），
   不当作故障；`drawState='empty'` 与真正的错误（`drawState='error'`）分离。
3. **未登录**：入口在 flags 允许时仍可见（MoreView 拿不到会话态），进入漂流瓶 Tab 后显示
   「当前未登录」+ 重试，**不发请求**；Identity AT 中途失效（401 → `LOCAL_AUTH_MISSING`）会回到该状态。
4. **红包金额**：前端校验 1..10000 整数 + 文本 1..500（按 Unicode code point，与 Python `len` 对齐）；
   服务端仍是唯一约束，前端拦截只是体验层（越界在发请求前拦下，有单测断言零请求）。
5. **幂等**：同一份内容重试复用同一个 `client_request_id`；内容一经修改立即换新键（单测覆盖）。
6. **更多页入口乐观显示**：`GameCenterQuickEntries` 在 capability 未提供时只按 flag 显示
   （积分中心 / 总排行榜 / 漂流瓶在端点未实现时可能被点击）；按 §1.2 的 `tabs.some(...)` 守卫落位，
   用户会停在首页而不是看到报错页。若希望严格隐藏，需要 MoreView 额外探测 `/meta.capabilities`
   （超出本次交付范围）。
