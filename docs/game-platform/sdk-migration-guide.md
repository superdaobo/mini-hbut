# Game Platform SDK 迁移指南（#904 交付物）

> - 适用对象：**#907A–D 四个并行迁移 Agent**（把 10 个有 `game_rank.js` 的游戏接入 SDK）
> - SDK 位置：`website/modules-src/_sdk/`（包名 `mini-hbut-game-sdk`，SDK v1.0.0，protocol v1）
> - 协议依据：`docs/game-platform/protocol-v1.md`（#901 冻结）、`trust-model.md`、`compatibility.md`、`game-registry.md`
> - 参考实现：**`website/modules-src/hbut_stack/`**（唯一已迁移游戏，先读它再动手）
> - 测试参考：`apps/client/src/utils/_sdk_*.spec.ts`（SDK 单测）+ `_sdk_hbut_stack_integration.spec.ts`（接入守卫）

---

## 0. 一句话结论

> 迁移 = **新建一个 adapter 文件 + 替换 3 处调用**（import / run 生命周期 / 提交与查榜）。
> **玩法、计分公式、payload 数值语义、UI 文案、DOM 结构一律不动**；SDK 只接管「往哪提交、怎么降级、重复提交怎么办」。

**禁止事项（违反即回退）**：改玩法数值、改 `game_rank.js`（保留它做回滚）、删排行榜 UI、给 V2 传 `student_id`、把 token 写进 localStorage、硬编码生产 API 地址。

---

## 1. SDK 边界

### 1.1 SDK 负责（你不需要再写）

| 能力 | 实现位置 |
|---|---|
| Host 握手（postMessage + **origin 校验** + request_id/game_id 绑定校验） | `_sdk/src/host-bridge.js` |
| Launch Ticket 读取（URL `gpt`/`ticket`）与**读后立即清理 URL** | `host-bridge.js:readLaunchTicket/clearLaunchTicketFromUrl` |
| ticket → Game Session 兑换（内存态、幂等 key、过期后向宿主换新 ticket） | `game.js:exchangeSession/recoverSession` |
| `protocol_version` / `/meta` 版本协商、feature flags、registry 快照覆盖 | `game.js:bootstrap`、`platform/registry.js` |
| run_id 生成（CSPRNG）、run 生命周期、`POST /runs` 登记 | `run.js` |
| finish 幂等（同 run 只发一次、重试字节级同 payload、409 停止重试） | `run.js:finish/retry` |
| 超时（12s）+ 退避重试（1200/2600/5200ms，仅 submit） | `transport.js` |
| 错误码归一（只用协议 §5 的 17 码）、降级矩阵 | `errors.js`、`run.js:deliverOnce` |
| 三模式判定 verified / compatibility / standalone | `game.js:bootstrap` |
| Legacy `/api/game-rank/*` 兼容（模板协议 + jump_out 旧协议） | `legacy/legacy-rank.js`、`legacy/legacy-jump-out.js` |
| 排行榜读取（V2 榜 → 经典榜 fallback）与条目归一（去 PII） | `game.js:leaderboard` |
| telemetry correlation id（白名单字段、无 PII） | `telemetry.js` |

### 1.2 SDK 明确不做（硬约束）

- ❌ 不读 URL 里的 `student_id` 作为 V2 actor（只作为 Legacy 通道入参，见 `legacy-rank.js`）
- ❌ 不向服务端传奖励数量（`xp_amount`/`coin_amount`/`reward` 等出现即本地拦截）
- ❌ 不把 session token / ticket 写 localStorage / sessionStorage / cookie
- ❌ 不打日志（`_sdk/**` 内零 `console.*`；错误上报只有 `code` + `request_id`）
- ❌ 不自带 game_id 清单（registry 快照来自宿主/`/meta`，adapter 由游戏自己声明）

---

## 2. 三模式与信任级别

| SDK 模式 | 触发条件 | trust level | 能力 |
|---|---|---|---|
| `verified` | 有合法 Launch Ticket 且 session 兑换成功 | `verified_session` | V2 run/finish/settlement、可进 V2 榜、可发奖（受 economy flag） |
| `compatibility` | 无 ticket（或 V2 不可用）但 `legacy_compatible=true` 且旧上下文（`student_id`+`rank_api`）可用 | `legacy` | **可玩、可上经典榜、不发新资产** |
| `standalone` | 无 ticket 且无 Legacy 上下文（如浏览器直接打开） | 无（`null`） | 纯本地：成绩本地展示、不上传、不查榜 |

降级是**单向**的（`verified → compatibility → standalone`），SDK 会自动处理并通知宿主。

---

## 3. 迁移四步法（每个游戏都一样）

### 步骤 1：新建 `<game>/project/src/utils/game_sdk_adapter.js`

以 `hbut_stack` 为模板（`website/modules-src/hbut_stack/project/src/utils/game_sdk_adapter.js`）：

```js
import { createGameAdapter } from '../../../../_sdk/src/adapters/adapter.js'

export const XXX_ADAPTER = createGameAdapter({
  gameId: 'xxx',                     // 必须等于 module.json 的 id（registry §3）
  displayName: '中文名',
  resultSchemaVersion: 1,
  capabilities: { ranked: true, multiplayer: false, economyEligible: true, classicMirror: true, seasonEligible: true, legacyCompatible: true },
  metric: { name: 'xxx', semantics: 'xxx', max: 100000, label: '中文标签' },
  leaderboard: { board: 'classic', order: 'score_desc' },
  legacy: { maxLevelRule: '1:1', fromLegacyMaxLevel: (v) => v, toLegacyMaxLevel: (v) => v, endedReasonMap: { /* legacy → V2 枚举 */ } },
  result: { extraKeys: [/* 与现有 payload.extra 完全一致 */] }
})
export default XXX_ADAPTER
```

> 相对路径深度固定为 `../../../../_sdk/...`（`project/src/utils/` → `modules-src/`），**不要**用别名（各游戏 vite config 无别名）。
> `extraKeys` 是**白名单**：不在白名单里的 extra 键会被丢弃（服务端 per-game schema 只认声明键）。

**`game_sdk_adapter.d.ts` 的相对深度必须与 `.js` 完全一致（4 层）**。写成 5 层不会在 `vue-tsc` 报错（`tsconfig.json` 开了 `skipLibCheck: true`，`.d.ts` 内的 "Cannot find module" 被静默吞掉），只会让 `GameAdapter` **退化为 `any`** —— 类型保护整体失效。自查方法（一次性探针，验证完删掉）：

```ts
// @ts-expect-error 若 adapter 类型是 any，这条指令会因「未被使用」而报 TS2578
export const __probe: number = XXX_ADAPTER
```

> 该探针的 `export` 不能省：`noUnusedLocals: true` 会让「未使用变量」也落在同一行，从而把 `@ts-expect-error` 变成「已使用」，探针失效。

### 步骤 2：替换 import 与句柄创建

```diff
- import { canUseGameRank, createRunId, fetchGameLeaderboard, readGameModuleContext, submitGameRank } from './utils/game_rank.js'
+ import { MiniHBUTGame, readLegacyModuleContext } from '../../../_sdk/src/index.js'
+ import { XXX_ADAPTER } from './utils/game_sdk_adapter.js'

- const moduleContext = readGameModuleContext()
- const rankEnabled = canUseGameRank(moduleContext)
- let currentRunId = createRunId()
- let runStartedAt = Date.now()
- let submitPending = null
+ // 同步创建句柄（握手/兑换在后台），不阻塞渲染与玩法
+ const sdkGame = MiniHBUTGame.create({ gameId: MODULE_ID, adapter: XXX_ADAPTER })
+ let rankEnabled = sdkGame.capabilities.canSubmit
+ let leaderboardAvailable = sdkGame.capabilities.leaderboard
+ let run = sdkGame.startRun()
```

> `currentLeaderboardScope` 若依赖班级上下文，用 `readLegacyModuleContext({ gameId: MODULE_ID }).className` 读取（展示用途）。

### 步骤 3：替换提交

```diff
  const payload = {
-   runId: currentRunId,
    score: ...,
    maxLevel: ...,          // 关键：语义见 §5 映射表，不要改数值
    durationMs: ...,
    moveCount: ...,
    endedReason: ...,
    extra: { ... }
  }
- submitPending = payload
- await submitGameRank(moduleContext, payload)
+ const outcome = await run.finish(payload)     // 幂等：重复调用不会重复提交
+ if (!outcome.success) { /* outcome.retryable 决定是否给「点此重试」 */ }
```

规则：

1. **`finish()` 的输入是 camelCase**（`maxLevel` / `moveCount` / `durationMs` / `endedReason` / `extra`）。
   `jump_out_hbut` 现在是 snake_case（`max_level`/`move_count`/...）→ **必须改字段名**，数值不变。
2. **一个 run 只能有一份 payload**：同一 run 用不同成绩再次 `finish()` 会被本地判定为 `RUN_ALREADY_FINISHED`（不发请求）。重开一局必须 `run = sdkGame.startRun({ replaceActive: true })`。
3. **重试**：`await run.retry()`（复用同一 pending payload，保证服务端 `content_hash` 稳定）。`outcome.retryable === true` 才给用户「点此重试」。
4. **不要**再自己拼 `runId`/`durationMs` 或做 requestJson/重试逻辑。
5. `outcome` 字段：`success / uploaded / mode / trustLevel / settled / rewardStatus / duplicate / message / retryable / error.code / requestId`。UI 文案直接用 `outcome.message`（已是简体中文）。

### 步骤 4：替换排行榜

```diff
- const data = await fetchGameLeaderboard(moduleContext, { scope, limit: 20 })
- const list = data.leaderboard || data.data || []
+ const data = await sdkGame.leaderboard({ scope, limit: 20 })
+ const list = data.entries || []
+ if (!data.success && data.message) { /* 用 textContent 写错误提示（禁止 innerHTML 插值） */ }
```

条目字段：`{ rank, display_name, player_name, class_name, score, total_score, metric_value, is_self, updated_at }`
（`display_name` 已按 scope 解析：`class_total` 用班级名，其余用玩家名/匿名；**条目不含学号**）

排行榜入口显隐（standalone 时隐藏）：

```js
void sdkGame.ready.then(() => {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  /* 隐藏/显示排行榜按钮，见 hbut_stack main.js:applyRankAvailability */
})
```

---

## 4. 开始/结束事件挂载点清单（**10/12 游戏没有"开始"事件**）

### 4.1 开始事件：全部用「加载即开局 + 显式重开」

| 事件 | 迁移前 | 迁移后 |
|---|---|---|
| 加载即开局（模块顶层） | `let currentRunId = createRunId(); let runStartedAt = Date.now()` | `let run = sdkGame.startRun()`（`run.id` / `run.startedAt` 取代两个变量） |
| 重开按钮 / 再来一局 | `currentRunId = createRunId(); runStartedAt = Date.now()` | `run = sdkGame.startRun({ replaceActive: true })` |
| 关卡内重开（如 miner 关卡重试） | 同上 | 同上（**注意**：若旧代码在同一局内重开仍复用同一个 run_id，则保持复用，不要新建 run，否则会改变榜上局数语义） |

> 不需要 `sdkGame.startRun()` 的返回值以外的任何东西；**不要**等待 `sdkGame.ready` 才开始玩。

### 4.2 结束事件：分四层，逐个游戏对照

| 层 | 游戏 | 具体锚点（迁移前调用点） | 迁移动作 |
|---|---|---|---|
| **纯逻辑层（同步状态机）** | `hbut_stack` | `main.js:dropNow → maybeSubmitTerminal()`（塔倒即提交） | 参考实现已迁：`run.finish(...)` |
| | `hbut_match3` | `main.js:194 maybeSubmitTerminal()`（步数耗尽） | 同 |
| | `hbut_parking` | `main.js:225 maybeSubmitTerminal()`（**仅通关 won**） | 同（`endedReason` 仍传 `'won'`，由 adapter 映射为 `cleared`） |
| **rAF tick 轮询终局** | `hbut_miner` | `main.js:467-474`（tick 内检测 `state.status`，`main.js:473` 触发提交） | tick 内保持原判断，只替换提交函数体 |
| | `hbut_memory_match` | `main.js:383-396`（tick 轮询 + `main.js:278` 副作用触发 `maybeSubmitTerminal`） | 同上 |
| **Vue 组件层** | `hecheng_hugongda` | `App.vue:1090-1111 buildRankPayload/finalizeRankSubmission`；`hasSubmittedResult` 保证一局只提交一次 | 保留 `hasSubmittedResult` 语义（SDK 也幂等，双保险） |
| | `jump_out_hbut` | `App.vue:164 submitScore()` / `App.vue:185 handleRetryUpload()`（Vue 方法） | `submitScore` → `run.finish(...)`；`handleRetryUpload` → `run.retry()` |
| **引擎回调** | `hbut_2048` | `main.js:131 handleGameEnd(result)`（`GameManager.js:177-185` 只在无步可走时回调） | 回调整体保留，只替换提交部分 |
| | `clumsy_bird_hbut` | `main.js:137 submitScore(data)`，挂载于 `main.js:306 game.onGameOver` | 同上 |

**绝不能做的**：把提交从原触发点搬到别处（会改变"一局"的定义）；给 `hbut_parking` 增加"失败也提交"（会改变榜上数据语义）。

---

## 5. 各游戏 adapter 配置 + payload 字段映射表（逐游戏写准）

> `metric.name/max/semantics` 取自 `game-registry.md` §3/§4（**服务端 registry 是权威**；冲突时 SDK 以服务端为准并记 `diagnostics.conflicts`）。
> `Legacy max_level` 列是**旧榜上已有数据的语义**，迁移后必须保持不变（1:1 或 ±1）。

### 5.1 一览表

| # | game_id | metric.name | semantics | metric.max | Legacy `max_level` 换算 | extra 键（白名单） | ended_reason 映射 |
|---|---|---|---|---|---|---|---|
| 1 | `hecheng_hugongda` | `school_level` | `progress_index` | 9 | **1:1** | `source/is_mobile/from/runtime` | `cleared→cleared`、`failed→failed` |
| 2 | `jump_out_hbut` | `jump_count` | `count` | 100000 | **1:1** | 无 | `fall→lost` |
| 3 | `hbut_2048` | `max_tile` | `value` | 131072 | **1:1** | `maxTile` | `win→won`、`game_over→game_over` |
| 4 | `clumsy_bird_hbut` | `best_score_legacy` | `historical_best` | 100000 | **1:1**（历史最高分语义，勿当本局等级） | 无 | `collision→collision` |
| 5 | `hbut_monopoly` | `stage_index` | `progress_index` | 2 | **`max_level = value + 1`**（`fromLegacyMaxLevel: v => v-1`，`toLegacyMaxLevel: v => v+1`） | `credits/influence/coins/energy/stress/stage/stageIndex` | `won→won`、`lost→lost` |
| 6 | `hbut_miner` | `level_index` | `progress_index` | 6 | **`value + 1`** | `levelName/targetScore` | `won→won`、`lost→lost` |
| 7 | `hbut_memory_match` | `level_index` | `progress_index` | 3 | **`value + 1`** | `mistakes/levelIndex/combo` | `won→won`、`lost→lost` |
| 8 | `hbut_stack` | `layers` | `count` | 100000 | **1:1** | `perfectCount/perfectCombo` | `lost→lost` ✅已迁 |
| 9 | `hbut_parking` | `cleared_levels` | `count` | 6 | **1:1**（仅通关提交，正常 1..6） | `clearedLevels/totalSteps/levelIndex` | `won→cleared` |
| 10 | `hbut_match3` | `score_only` | `none` | 0 | **硬编码 `max_level = 1`**：`fromLegacyMaxLevel: () => 0` + `toLegacyMaxLevel: () => 1`（**两个方向都要写**，见 §9.10） | `movesLeft/chainPeak/moveLimit` | `lost→lost` |

> 不在本次迁移范围：`hbut_gomoku`（无 `game_rank.js`，等 #908 服务端复算，`legacyCompatible:false` → 只能 standalone）、`hugongda_escape`（`disabled:true`）。

### 5.2 逐游戏 payload 映射（把现有 `payload` 原样喂给 `finish()`）

所有游戏都是 **1:1 搬字段**，只改字段名与目标函数；`maxLevel` 数值语义一律不改（换算由 adapter 声明）。

| game_id | 迁移前 payload 关键字段（证据行） | 迁移后 finish 输入 |
|---|---|---|
| `hbut_2048` | `main.js:134-142`：`score/maxTile/durationMs/moveCount/won?'win':'game_over'/extra{maxTile}` | `<同名，去掉 runId>` |
| `clumsy_bird_hbut` | `main.js:139-146`：`score=data.score, maxLevel=data.bestScore, durationMs, moveCount=data.flapCount, 'collision'` | 同名（**不要**把 `maxLevel` 改成 `data.score`：Legacy 榜语义是历史最高分，V2 主排序用本局 `score`） |
| `hbut_monopoly` | `main.js:256-272`：`score=computeRankScore(state), maxLevel=(stageIndex\|\|0)+1, moveCount=state.turn, extra{credits,influence,coins,energy,stress,stage,stageIndex}` | 同名（`maxLevel` 保持 `+1`；adapter 的 `fromLegacyMaxLevel` 负责 −1） |
| `hbut_miner` | `main.js:207-218`：`score, maxLevel=levelNumber\|\|1, moveCount=shotCount, extra{levelName,targetScore}` | 同名 |
| `hbut_memory_match` | `main.js:163-175`：`score, maxLevel=levelNumber\|\|1, moveCount=moves, extra{mistakes,levelIndex,combo}` | 同名 |
| `hbut_parking` | `main.js:126-144`：`score=computeParkingScore(...), maxLevel=clearedLevels\|\|levelNumber\|\|1, moveCount=totalSteps, extra{clearedLevels,totalSteps,levelIndex}` | 同名（`durationMs` 用同一个 `durationMs()` 结果，避免两次取整不同） |
| `hbut_match3` | `main.js:99-113`：`score, maxLevel:1(硬编码), moveCount=moveLimit-movesLeft, extra{movesLeft,chainPeak,moveLimit}` | 同名（`maxLevel: 1` 保留，adapter 的 `toLegacyMaxLevel` 保证反算也是 1） |
| `hecheng_hugongda` | `App.vue:1093-1107 buildRankPayload`：`score, maxLevel=computeCurrentMaxLevel(), moveCount, extra{source,is_mobile,from,runtime}` | 同名（保留 `hasSubmittedResult` 一局一次） |
| `jump_out_hbut` | `App.vue:166-175`：**snake_case** `score, max_level=jumpCount, duration_ms, move_count=jumpCount, run_id, ended_reason:'fall'` | `{ score, maxLevel: jumpCount, durationMs: duration, moveCount: jumpCount, endedReason: 'fall' }`（字段名必须改） |

---

## 6. 特殊适配：`jump_out_hbut`（旧协议，独立通道）

该游戏的 `project/src/utils/game_rank.js` 与其余 10 个**语义不兼容**（snake_case 上下文、失败不 throw、无默认 API base、run_id 无 `run_` 前缀）。SDK 已提供独立适配层：

```js
const sdkGame = MiniHBUTGame.create({
  gameId: 'jump_out_hbut',
  adapter: JUMP_OUT_ADAPTER,
  legacyProtocol: 'jump_out'      // ← 关键：走旧协议独立适配层（legacy-jump-out.js）
})
```

差异与要求：

1. **没有默认 API base**：URL 无 `rank_api` 时 `canSubmit=false` → SDK 落 standalone（等价旧 `{success:false,error:'no_api'}`）。
2. **run_id 无 `run_` 前缀**：`run.id` 由 SDK 生成（`run_<ts>_<rand>`）。V2 与 Legacy 都接受该形状（Legacy 无格式约束）；这是**有意的统一**，不要为了"看起来一样"去覆写 run_id。
3. **payload 必须改成 camelCase**（见 §5.2）。
4. **旧 `App.vue` 的 `gameData.uploadFailed` / `handleRetryUpload` 保留**：`run.retry()` 复用同一 payload；`outcome.retryable` 决定是否显示重试按钮。
5. `readGameModuleContext()` 读的是 `localStorage` 顶层键（`student_id`/`rank_api`），SDK 的 `legacy-jump-out.js` 已按同样方式读取（不写新存储）。

---

## 7. 特殊适配：`hecheng_hugongda`（共享 storage key 串味）

`utils/game_rank.js:4` 用的是**全局共享** key `hbut_game_rank_context_v1`（跨模块串味，`trust-model.md:99`）。

```js
const sdkGame = MiniHBUTGame.create({
  gameId: 'hecheng_hugongda',
  adapter: HECHENG_ADAPTER,
  // 读：优先模块私有 key，回落旧共享 key（兼容已落盘的老上下文）；写：只写模块私有 key
  legacy: { storageKeys: ['hecheng_hugongda_rank_context_v1', 'hbut_game_rank_context_v1'] }
})
```

验收：迁移后 `localStorage` 里 `hbut_game_rank_context_v1` **不再被写入**（只在读路径出现）。

---

## 8. 每游戏验收 checklist（10 份，逐项打勾）

通用模板（每个游戏都要跑）：

- [ ] **standalone 可玩**：本地直接打开模块 URL（不带任何参数）→ 游戏可玩、成绩本地记录、无报错、排行榜入口隐藏
- [ ] **verified 可提交**：宿主注入 ticket 场景 → `run.finish()` 200 + `settled`，榜可见
- [ ] **compatibility 可提交经典榜**：老 URL（`student_id` + `rank_api`）→ 经典榜提交成功、`trustLevel==='legacy'`、**不发奖**
- [ ] **网络失败不崩**：断网/503 → 游戏继续可玩，`outcome.retryable===true` + 中文提示 + 手动重试可用
- [ ] **重复 finish 不重复结算**：同一 run 连续 `finish()` 两次 → 只有 1 次网络请求（`outcome.duplicate===true`）
- [ ] **leaderboard 正常**：班级/全校/班级总分三个 tab 都出数据；`class_total` 用班级名+总分
- [ ] **老 URL 入口有效**：迁移前的完整 URL（含 `student_id/player_name/class_name/major/school_name/runtime/rank_api/app_version/from`）直接打开仍可提交经典榜
- [ ] **mobile touch 无回归**：触控/滑动手势、`--module-vh`、安全区、`orientationchange` 全部照旧
- [ ] **数值不回归**：与迁移前同一局 → Legacy body 字段值完全一致（参考 `_sdk_submit.spec.ts` 的等价测试写法）
- [ ] **`game_rank.js` 保留**：文件仍在（回滚安全），但不再被 `main.js`/`App.vue` import

按游戏的**特别注意**：

| game_id | 特别注意 |
|---|---|
| `hecheng_hugongda` | 一局只提交一次（`hasSubmittedResult` 保留）；`storageKeys` 见 §7；Vue 内不要用 `this.` 访问 SDK 句柄（用模块作用域常量） |
| `jump_out_hbut` | `legacyProtocol: 'jump_out'`；payload 字段改名 camelCase；无 `rank_api` → standalone 是**预期行为** |
| `hbut_2048` | 只在无步可走时提交（别把 `win` 与 `game_over` 合并）；`ended_reason` 映射 `win→won` |
| `clumsy_bird_hbut` | `maxLevel` 是**历史最高分**（`historical_best`），别改成 `score`；排行榜与"最高分"展示解耦 |
| `hbut_monopoly` | `maxLevel = stageIndex+1` 保持不变；`extra.stage` 是**中文字符串**（服务端 extra 允许 string ≤512） |
| `hbut_miner` | rAF tick 内触发；tick 里不要 await（保持 `void submit...()` 风格）；关卡重试是否新建 run 见 §4.1 |
| `hbut_memory_match` | 同 miner（tick 轮询 + 副作用触发），注意别重复触发（旧代码用 `lastTerminalStatus` 去重，保留） |
| `hbut_stack` | ✅ 已完成，作为模板阅读 |
| `hbut_parking` | **只有通关才提交**；`durationMs` 只计算一次并复用（旧代码调用两次 `durationMs()`） |
| `hbut_match3` | `metric.max = 0`（`metric.value` 恒 0）；`max_level` Legacy 反算必须仍是 1 |

---

## 9. 常见坑（按踩坑概率排序）

1. **相对路径深度**：`project/src/utils/*.js` → `../../../../_sdk/...`；`project/src/*.js` → `../../../_sdk/...`。少一层会在构建期报 `Could not resolve`（vite build 时才暴露，`npm run test:ci` 不会）。**多一层更危险**：`.d.ts` 里多写一层不会报错（`skipLibCheck: true` 吞掉 "Cannot find module"），只会让类型退化为 `any` —— 见 §3 步骤 1 的探针自查。
2. **不要在模块顶层 `await sdkGame.ready`**：会让渲染等握手（最长 ~1.2s）。用 `.then()`。
3. **`capabilities` 在 ready 前后语义不同**：ready 前是同步预判（`pending:true`），ready 后是最终值。UI 显隐要在 ready 后再刷一次。
4. **同一 run 不许改 payload**：想重新提交就 `startRun()`。SDK 会本地拒绝并给出 `RUN_ALREADY_FINISHED`。
5. **`outcome.success===true` 但 `uploaded===false`**（standalone）是正常结果，UI 应显示"本地记录"而不是"上传失败"。
6. **409 不重试**：`RUN_ALREADY_FINISHED`/`TICKET_USED`/`IDEMPOTENCY_CONFLICT` 都是确定性失败，别写自动重试循环。
7. **`extra` 白名单**：adapter 里没声明的 extra 键会被静默丢弃（`diagnostics.droppedExtraKeys` 可查），迁移时逐个对照旧 payload。
8. **extra 只允许标量整数**：旧代码里的浮点（如 `0.5`）会被丢弃 → 若业务需要，改成整数或字符串。
9. **字符串 extra ≤512 字符**（超长会被截断/丢弃）。
10. **`metric.max` 越界本地即拒**：如 `hbut_monopoly` 的 `metric.value` 必须 ≤2、`hbut_miner` ≤6。别把 `maxLevel` 直接当 metric 传（用 adapter 的 `fromLegacyMaxLevel`）。
11. **`ended_reason` 未声明 → `unknown`**：不会报错，但榜单原因展示会退化；逐个游戏写全映射表。
12. **排行榜 scope**：V2 用 `school|class|class_total`（与 Legacy 相同）；`class_total` 的 `score` 来自 `total_score`，`display_name` 是班级名。
13. **错误文案必须用 `outcome.message` / `data.message`**（服务端已是简体中文）；且**只能经 `textContent` 写入**（CodeQL `js/xss-through-exception` 门禁）。
14. **不要删除旧 `game_rank.js`**：只读契约测试 `apps/client/src/utils/<game>_rank_contract.spec.ts` 仍 import 它，删了 CI 直接红。
15. **不要改 `module.json` / `order` / `entry_path` / `source_dir`**：`website_game_modules_contract.spec.ts:110-120` 会红。
16. **不要动 `index.html` 的 viewport / `style.css` 的安全区变量**：`embeddedMobileGameIds` 契约会红。
17. **宿主上下文参数名不变**：`student_id/player_name/class_name/major/school_name/runtime/rank_api/app_version/from`（宿主注入链在 Stage E 之前必须保持可用）。
18. **别在游戏里写生产 API 地址**：SDK 有唯一默认值；URL `rank_api` 优先。
19. **`window.postMessage` 新增消息类型必须走 `HOST_MESSAGE_TYPES`**（`_sdk/src/version.js`），不要自造字符串。
20. **改完必须本地跑**：`cd apps/client && npx vitest run --config vitest.ci.config.ts src/utils/<game>_*_contract.spec.ts src/utils/_sdk_*.spec.ts`，再跑全量 `npm run test:ci`，最后 `npx vue-tsc --noEmit -p tsconfig.json`。
21. **写测试用的 fetch 路由时注意两点**（`_sdk_test_harness.ts` 的 `createFetchRouter`）：
    - 路由是**对象**，不是工厂函数：写 `metaRoute()`，漏掉 `()` 会在 `route.match.test()` 处抛 `TypeError`，被 SDK 当成网络故障 → 测试「通过」但完全没测到预期分支（vitest 不做类型检查，不会报错）；
    - 匹配**取首个命中**：要覆盖「/meta 返回 500」必须把 500 路由排在同 URL 的成功路由**之前**，否则永远命中前者。
    自查：给路由工厂加 `: FetchRoute` 返回类型注解（类型错误会在 `vue-tsc` 暴露），并断言 `router.callsFor(...)` 的调用次数。

---

## 10. 参考实现差异（hbut_stack，迁移已完成）

| 文件 | 变化 |
|---|---|
| `project/src/utils/game_sdk_adapter.js` | **新增**（adapter 声明） |
| `project/src/main.js` | import 替换；`sdkGame.create(...)`；`run = sdkGame.startRun()`；`run.finish/retry`；`sdkGame.leaderboard`；`applyRankAvailability`；`showSubmitStatus(status, text)` 增加文案参数 |
| `project/src/utils/game_rank.js` | **未改动**（回滚安全 + 只读契约测试依赖） |
| 玩法/计分/DOM/文案 | **未改动**（`score: state.score`、`maxLevel: state.layers || 0` 等数值语义逐字保留） |

回归证据（可直接复制到你的 PR）：

```bash
cd apps/client
npx vitest run --config vitest.ci.config.ts src/utils/_sdk_core.spec.ts src/utils/_sdk_modes.spec.ts \
  src/utils/_sdk_submit.spec.ts src/utils/_sdk_hbut_stack_integration.spec.ts
npx vitest run --config vitest.ci.config.ts src/utils/<你的游戏>_rank_contract.spec.ts
npm run test:ci          # 全量（基线 1986 + SDK 94 = 2080 全绿）
npx vue-tsc --noEmit -p tsconfig.json        # 必须 exit=0（CI 门禁）
# SDK 打包冒烟（无需网络）：确认 SDK 能被内联进 bundle
node website/modules-src/_sdk/tests/build-smoke.mjs
# 模块构建冒烟（需要网络装依赖，CI 会跑）
node scripts/build_website_modules.mjs --modules <你的游戏>
```

---

## 11. 构建期保障（#904 已落地）

`scripts/build_website_modules.mjs` 新增 SDK 步骤（对未引用 SDK 的模块**产物字节不变**）：

1. 构建前：校验 `_sdk/package.json`、入口存在、并对 `_sdk/src/**/*.js` 逐文件 `node --check`（语法错误 fail-fast）；
2. 计算 `sdk_sha256`（源码全量哈希）与 `sdk_version`；
3. 若模块源码 import 了 `_sdk`：构建后断言 dist **不残留 `_sdk/src` 引用**（即 SDK 已被打包内联），并把 `sdk_version` / `sdk_sha256` / `sdk_protocol_version` 写进 manifest 与 catalog。

→ 回滚时可直接看 manifest 判断某个历史模块版本内联的是哪一版 SDK。

---

## 12. 待确认项（迁移期间不要自行决定）

| # | 事项 | 默认假设 |
|---|---|---|
| M1 | `hbut_match3` 的 `metric.name` 最终命名 | `score_only`（`protocol-v1.md` U5） |
| M2 | `clumsy_bird_hbut` V2 主排序是否改为本局 `score` | 是（U-R4）；Legacy 镜像仍写 bestScore |
| M3 | 排行榜默认 board | `classic`（Stage D 前与经典榜内容一致；`verified` 榜由 #905/#909 决定入口） |
| M4 | 迁移期是否保留旧 `game_rank.js` 的 import 作为兜底 | 否（SDK 已内含 Legacy 通道；旧文件仅用于回滚） |
