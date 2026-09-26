# Game Platform 游戏 Registry（game-registry）

> - 文档编号：#901 交付物 D
> - 配套：`docs/game-platform/protocol-v1.md`（§2 字段表、§4 result envelope、§3.2 T5 风控上限）、`docs/game-platform/trust-model.md`（三档信任）、`docs/game-platform/compatibility.md`（§4 Rollout 阶段判定）
> - **本文件是 game_id 与 per-game 语义的唯一权威清单**；客户端 / SDK / 后端三方不得各自解释
> - 顺序即 `module_center.js` 的 `order` 顺序（1..11），与 `module.json`、契约测试 `gameModuleIds` 三方逐字一致
> - 所有引用格式 `相对路径:行号`，基于 `origin/main` = `1b8b755d`

---

## 1. ID 规则（不可违反）

| # | 规则 | 说明 |
|---|---|---|
| R1 | **game_id 一经发布不可复用** | 即使游戏下架、改名、重写，`game_id` 也不得转给另一个游戏。id 是历史数据（`game_rank_runs.game_id`、V2 `runs.game_id`、结算、赛季）的关联键；复用会让两段历史混为一谈且无法对账 |
| R2 | **slug 与 display name 分离** | `game_id` = slug（`^[a-z0-9_]{3,64}$`）；展示名在 `module.json.name` 与客户端 `module_center.js` 的 `name`（`apps/client/src/utils/module_center.js:8`），由 i18n 负责多语言。禁止中文/大写/空格进 `game_id` |
| R3 | **目录名必须等于 game_id** | 契约测试强制 `mod.dirName === mod.id`（`apps/client/src/utils/website_game_modules_contract.spec.ts:112`） |
| R4 | **禁用 = `module.json.disabled: true`** | 构建脚本读取并跳过整个模块（`scripts/build_website_modules.mjs:240-247`）；产物与 catalog 不含该 id；客户端内置 `DEFAULT_MODULE_CENTER` 也不得包含它 |
| R5 | **禁用不等于删除** | 源码目录、历史数据、`game_rank_runs` 记录全部保留；V2 registry 登记 `status=disabled`，调用 V2 返回 `404 GAME_DISABLED` |
| R6 | **恢复 = 删除 `disabled` 字段 + 保留原 id/order** | 恢复必须沿用原 `game_id`（R1）；`order` 冲突时只允许改 `order`（需三方同步），不允许改 id；恢复需重跑构建 + 三方契约测试 + 真机验收 |
| R7 | **order 冲突处理** | 当前 `hugongda_escape/module.json` 的 `order: 5` 与 `hbut_monopoly` 冲突；因 disabled 被 `enabledModules()` 过滤（`website_game_modules_contract.spec.ts:38`），现网无影响。恢复该游戏前必须先解决冲突（插入 1..N 整数序列且不打乱既有相对顺序） |
| R8 | **新增只能追加** | 新 id 的 order = 当前最大 + 1；禁止插入既有 id 之间（会破坏 `website_game_modules_contract.spec.ts:95-108` 的顺序断言） |
| R9 | **三方同源** | 任何 id/order/ranked/metric 变更必须三方同 PR 更新（§6），缺一处即 CI 红 |

---

## 2. registry 字段清单（服务端权威 schema）

`modules/game_platform/registry.py`（#903 新建）必须为每个 game 提供以下字段；`GET /api/game-platform/v1/meta` 暴露可公开子集（不含内部阈值）：

| 字段 | 类型 | 取值/约束 | 用途 | 公开 |
|---|---|---|---|---|
| `game_id` | string | `^[a-z0-9_]{3,64}$`，与 §3 表逐字一致 | 主键 | 是 |
| `display_name` | string | 中文展示名（与 `module_center.js` 一致） | 展示 | 是 |
| `status` | enum | `active` / `disabled` / `legacy_only` | 决定 `GAME_DISABLED` / `LEGACY_ONLY` | 是 |
| `ranked` | bool | 是否进 V2 排行榜（classic/verified/season 的准入前提） | 榜与结算准入 | 是 |
| `classic_mirror` | bool | 是否允许 dual-write 投影到 Legacy 经典榜（`compatibility.md` §3.1） | 投影准入门 | 是 |
| **`legacy_compatible`** | **bool** | **该游戏是否有可用的 Legacy `/api/game-rank/*` 提交通道；`false` 时客户端在 V2 不可用时只能 `standalone`，不得回落 Legacy** | **降级目标判定（`protocol-v1.md` §1.3/§5、`trust-model.md` §2.1）** | 是 |
| `season_eligible` | bool | 是否允许进 Verified Season | 赛季准入门 | 是 |
| `result_schema_version` | int | 该游戏 `result.extra` 的 schema 版本（envelope 基础版本恒为 1） | 校验 | 是 |
| `metric.name` | string | `^[a-z][a-z0-9_]{1,31}$`；必须等于 §4 声明值 | 校验 + 排序语义 | 是 |
| `metric.max` | int | 该 metric 的合法上限（§4 给出证据），超出 → `QUARANTINED`（`protocol-v1.md` §3.2 T5 ②） | 风控 | 是 |
| `metric.semantics` | enum | `progress_index` / `count` / `value` / `historical_best` / `none` | 防语义误用 | 是 |
| `score.max` | int | 该游戏 `score` 的合法上限（默认 `1000000000`） | 风控 | 是 |
| `extra_schema` | object | per-game `extra` 的 JSON Schema（键名/类型/上限） | `SCHEMA_INVALID` 判定 | 否（体积原因） |
| `min_client_version` | string | 软门禁（可空 = 不设） | `CLIENT_VERSION_TOO_OLD` | 是 |
| `ended_reason_map` | object | Legacy 值 → V2 枚举（§5） | 归一化 | 是 |
| `legacy_max_level_rule` | string | Legacy `max_level` 与 `metric.value` 的换算表达式（§4） | dual-write 反算 | 是 |
| `economy_enabled` | bool | 该游戏是否参与 XP/coin 结算（数值规则由 #909） | 结算准入 | 否（随 flag） |

---

## 3. 全量 game_id registry（11 active + 1 disabled）

> `legacy_compatible` 是本轮新增字段（决定降级目标）；`season_eligible` 用于 §4 赛季准入。

| # | game_id | 显示名 | order | status | ranked | classic_mirror | legacy_compatible | season_eligible | schema_version | metric.name | metric.max | 主要 metric 语义 | 特殊说明 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `hecheng_hugongda` | 合成湖工大 | 1 | active | 是 | 是 | **是** | 是 | 1 | `school_level` | 9 | 合成到的最高学校等级（0 基） | 一局只提交一次（`App.vue:1111`）；`game_rank.js` 用全局共享 storage key（`utils/game_rank.js:4`），#907a 需消除串味 |
| 2 | `jump_out_hbut` | 跳出湖工大 | 2 | active | 是 | 是 | **是** | 是 | 1 | `jump_count` | 100000 | 本局跳跃次数 | **异构旧协议**：snake_case、不 throw、无默认 API base（`utils/game_rank.js:115-136`）；#904 单独适配 |
| 3 | `hbut_2048` | 2048 湖工大版 | 3 | active | 是 | 是 | **是** | 是 | 1 | `max_tile` | 131072 | 本局最大方块数值（2^17 理论上限） | **仅当无步可走**才提交（`game/GameManager.js:177-185`）；`ended_reason ∈ {win, game_over}` |
| 4 | `clumsy_bird_hbut` | 笨鸟先飞 | 4 | active | 是 | 是 | **是** | 是 | 1 | `best_score_legacy` | 100000 | **历史最高分**（非本局），`semantics=historical_best` | 全仓唯一异类（`main.js:142` + `game/FlappyGame.js:355-365`）；V2 主排序用本局 `score`，Legacy 镜像仍写 bestScore（U-R4） |
| 5 | `hbut_monopoly` | 湖工大富翁 | 5 | active | 是 | 是 | **是** | 是 | 1 | `stage_index` | 2 | 阶段索引（0 基；3 阶段：`monopoly.js:10-38`） | Legacy `max_level = value + 1`；`score = credits*100 + influence*100 + max(0,coins)`（`monopoly.js:642-648`） |
| 6 | `hbut_miner` | 湖工矿工 | 6 | active | 是 | 是 | **是** | 是 | 1 | `level_index` | 6 | 关卡索引（0 基；7 关 `game/miner.js`） | Legacy `max_level = value + 1`；rAF tick 轮询终局（`main.js:467-474`） |
| 7 | `hbut_memory_match` | 湖工记忆牌 | 7 | active | 是 | 是 | **是** | 是 | 1 | `level_index` | 3 | 关卡索引（0 基；4 关 `game/memory.js`） | 同上；rAF tick 轮询终局（`main.js:383-396`） |
| 8 | `hbut_gomoku` | 湖工五子棋 | 8 | active | **否** | **否** | **否** | **否**（待 #908） | —（待定） | —（待定） | — | 无 game_rank.js；只有 relay（`ocr-service/runtime/entrypoint.py:3636-3750`），胜负当前由客户端判定（`game/online.js:683,738`） | 目标 `server_verified_match`（#908）；在此之前不 rank、不发奖、不进经典榜、V2 不可用时只能 standalone |
| 9 | `hbut_stack` | 湖工叠塔 | 9 | active | 是 | 是 | **是** | 是 | 1 | `layers` | 100000 | 已叠层数（0 基） | SDK 首个参考接入游戏（逻辑最简） |
| 10 | `hbut_parking` | 湖工挪车 | 10 | active | 是 | 是 | **是** | 是 | 1 | `cleared_levels` | 6 | 累计通关数（6 关 `project/src/game/levels.json`） | **只有通关（`won`）才提交**（`main.js:225-230`）；`score = cleared*10000 - steps*10 - seconds`（`game/parking.js:7-15`） |
| 11 | `hbut_match3` | 湖工消消乐 | 11 | active | 是 | 是 | **是** | 是 | 1 | `score_only` | 0 | 无等级语义（`metric.value` 恒 0），排序只看 `score` | **Legacy `max_level` 硬编码 1**（`main.js:104`）；dual-write 反算必须写回 1（U-R1/U5） |
| — | `hugongda_escape` | 湖工大逃生 | 5（冲突，见 R7） | **disabled** | 否 | 否 | **否** | 否 | — | — | — | 无 `game_rank.js` | `module.json:10` 的 `disabled: true`；不进构建/catalog/模块中心；调用 V2 → `404 GAME_DISABLED` |

---

## 4. metric 语义逐游戏证据（Legacy `max_level` 的 10 种语义）

> `metric.value` 是"0 基/结果本位"的规范值，Legacy `max_level` 是历史语义；换算由 registry 声明一次（`legacy_max_level_rule`）、由兼容层执行一次。

### 4.1 `hecheng_hugongda` → `school_level`

- 证据：`App.vue:917-929`（通关返回 `schools.length - 1 = 9`，否则取 `bestLevelReached` 与场上球体 `schoolLevel` 最大值）、`App.vue:935,1097`（写入 payload）。
- 换算：`max_level = metric.value`（1:1）。`metric.max = 9`（`schools` 10 项）。
- `extra`：`source/is_mobile/from/runtime`（`App.vue:1101-1106`）。

### 4.2 `jump_out_hbut` → `jump_count`

- 证据：`App.vue:168-175,191-198`（`max_level: jumpCount`）、`App.vue:126-128`（`gameOver` 提供 `jumpCount`）。
- 换算：1:1。`metric.max = 100000`（工程上限，非游戏常量）。

### 4.3 `hbut_2048` → `max_tile`

- 证据：`main.js:134-142`（`maxLevel: result.maxTile`）、`game/GameManager.js:177-185`（无步可走才回调 `onGameEnd`）。
- 换算：1:1。`metric.max = 131072`（2^17 理论可达上限）。
- `extra.maxTile` 与 metric 冗余（保留兼容）。

### 4.4 `clumsy_bird_hbut` → `best_score_legacy`（**异类**）

- 证据：`main.js:136-146`（`maxLevel: data.bestScore`）、`game/FlappyGame.js:355-365`（先更新历史 `bestScore` 再回调）。
- 语义：**historical_best**（历史最高分，非本局）；同一玩家多次游玩单调不减。
- 换算：1:1 保留，但 `metric.semantics=historical_best`，禁止被当作"本局等级"使用。
- 迁移要求（#907b）：V2 主排序用本局 `score`；Legacy 镜像保持 bestScore（U-R4）。

### 4.5 `hbut_monopoly` → `stage_index`

- 证据：`main.js:256-272`（`maxLevel: (state.stageIndex || 0) + 1`）、`game/monopoly.js:10-38`（3 阶段）、`:323-338`（`stageIndex` 0 基归一）、`:642-648`（分数公式）。
- 换算：`max_level = metric.value + 1`；`metric.max = 2`。
- `extra`：`credits/influence/coins/energy/stress/stage/stageIndex`（`main.js:263-271`）。

### 4.6 `hbut_miner` → `level_index`

- 证据：`main.js:207-218`（`maxLevel: state.levelNumber || 1`）、`game/miner.js:420-428`（`levelNumber = levelIndex + 1`）。
- 换算：`max_level = metric.value + 1`；`metric.max = 6`（7 关）。
- `extra`：`levelName/targetScore`（`main.js:214-217`）。

### 4.7 `hbut_memory_match` → `level_index`

- 证据：`main.js:163-175`（`maxLevel: state.levelNumber || 1`）、`game/memory.js:139-140`（`levelNumber = levelIndex + 1`）。
- 换算：`max_level = metric.value + 1`；`metric.max = 3`（4 关）。
- `extra`：`mistakes/levelIndex/combo`（`main.js:170-174`）。

### 4.8 `hbut_stack` → `layers`

- 证据：`main.js:104-117`（`maxLevel: state.layers || 0`、`moveCount: state.layers || 0`）。
- 换算：1:1；`metric.max = 100000`（工程上限）。
- `extra`：`perfectCount/perfectCombo`。

### 4.9 `hbut_parking` → `cleared_levels`

- 证据：`main.js:126-144`（`maxLevel: state.clearedLevels || state.levelNumber || 1`）、`game/parking.js:7-15`（分数公式）、`main.js:225-230`（**仅 `won` 提交**）。
- 换算：1:1；`metric.max = 6`（`project/src/game/levels.json` 6 关）。因"只有通关才提交"，正常取值 1..6；`metric.value = 0` 只可能来自异常路径 → `QUARANTINED`。
- `extra`：`clearedLevels/totalSteps/levelIndex`。

### 4.10 `hbut_match3` → `score_only`（**Legacy 硬编码 1**）

- 证据：`main.js:99-113`（`maxLevel: 1` 硬编码；`extra: {movesLeft, chainPeak, moveLimit}`）、`main.js:194-199`（步数耗尽提交 `lost`）。
- 换算：`metric.value` 恒 0（`metric.max = 0`），排序只看 `score`；dual-write 反算 `max_level = 1`（保持历史行为，不得改写）。
- 待定：`metric.name` 最终命名见 `protocol-v1.md` U5 / 本文 U-R1。

### 4.11 `hbut_gomoku`（无 metric）

- 证据：无 `website/modules-src/hbut_gomoku/project/src/utils/game_rank.js`；只有 `game/online.js`（relay 客户端）与 `ocr-service/runtime/entrypoint.py:3636-3750`（join/send/poll/leave）。
- 目标（#908）：`matches` 服务端状态机（move 序列 + 五连复算），`trust_level=server_verified_match`，赛果由服务端给出。

### 4.12 `hugongda_escape`（disabled）

- 证据：`website/modules-src/hugongda_escape/module.json:10`；无 `utils/game_rank.js`。

---

## 5. `ended_reason` 归一化映射（Legacy → V2 枚举）

V2 合法枚举（`protocol-v1.md` §4.1）：`won|lost|cleared|failed|timeout|abandoned|draw|collision|game_over|restart|unknown`。

| game_id | Legacy 实际取值（证据） | V2 映射 |
|---|---|---|
| `hecheng_hugongda` | `cleared` / `failed`（`App.vue:1151,1153,1285,1363`） | `cleared` / `failed` |
| `jump_out_hbut` | `fall`（`App.vue:174,197` 硬编码） | `lost` |
| `hbut_2048` | `win` / `game_over`（`main.js:140`） | `won` / `game_over` |
| `clumsy_bird_hbut` | `collision`（`main.js:145` 硬编码） | `collision` |
| `hbut_monopoly` | `won` / `lost`（`main.js:254-262`） | `won` / `lost` |
| `hbut_miner` | `won` / `lost`（`main.js:471-473`） | `won` / `lost` |
| `hbut_memory_match` | `won` / `lost`（`main.js:286-288`） | `won` / `lost` |
| `hbut_gomoku` | 无 | 待定（`won`/`lost`/`draw`/`abandoned`） |
| `hbut_stack` | `lost`（`main.js:198-202`） | `lost` |
| `hbut_parking` | `won`（`main.js:225-229`，仅此一种） | `cleared` |
| `hbut_match3` | `lost`（`main.js:194-198`） | `lost` |

规则：归一化在服务端做（Legacy 表继续存原值，V2 表存枚举）；遇到未声明取值 → `unknown` + 告警，**不拒绝**。

---

## 6. 三方 registry 同步点（当前分散在 6 处，必须同 PR 改）

| 方 | 文件 | 定义内容 | 现状 |
|---|---|---|---|
| 客户端（宿主 UI） | `apps/client/src/utils/module_center.js:3-106` | 11 个内置模块：`id/name/icon/description/key_required/kind/order` | 硬编码；内置项永不消失（`module_center.js:202-255` 三方合并） |
| 客户端（上下文注入白名单） | `apps/client/src/components/MoreView.vue:70-82` | `CONTEXT_AWARE_GAME_MODULE_IDS`（11 个 id） | 与 `module_center.js` 双重门闩：漏改则新游戏拿不到 URL 上下文 |
| 网站（源 manifest） | `website/modules-src/<id>/module.json` | `id/name/icon/order/key_required/entry_path/source_dir/disabled` | 12 个目录（含 disabled 的 `hugongda_escape`） |
| 构建产物（catalog） | `scripts/build_website_modules.mjs:226-305` → `website/public/modules/<channel>/catalog.json` | 由 manifest 生成的 `catalogItem` | 每次构建三 channel（main/dev/latest）同写 |
| 契约门禁（源码断言） | `apps/client/src/utils/website_game_modules_contract.spec.ts:39-51,90-108` | `gameModuleIds` 顺序 = order 1..11 = `DEFAULT_MODULE_CENTER`；`dirName === id` | **三方的执行者**；改 UI 必撞 |
| 后端（V2） | **当前不存在**；Legacy 只做正则校验（`ocr-service/runtime/entrypoint.py:4616-4617` 的 `_GAME_RANK_GAME_ID_RE`） | §2 全字段 | #903 新建 `modules/game_platform/registry.py`；#911 加"服务端 registry ↔ 本文件 ↔ `module_center.js`"三方 diff 测试 |
| SDK（#904） | `website/modules-src/_sdk/`（新增） | 不得自带第二份 id 表：只消费 URL 注入的 `game_id`/ticket 与 `/meta` 的 registry 快照 | 设计约束，写入 #904 验收 |

**冻结结论**：本文件 §2/§3 是冻结后的权威源；服务端 `registry.py` 与前端 `module_center.js` 都是派生物，#911 必须提供自动 diff 测试（缺一即红），禁止"以代码为准、文档过期"。

---

## 7. 新增游戏登记 checklist（按顺序，缺一不合入）

| # | 步骤 | 产物/文件 | 验收 |
|---|---|---|---|
| 1 | 选定 `game_id`（slug，全仓无重名、未使用过） | 决策记录 | `grep -r "<id>" website/modules-src apps/client/src/utils` 无冲突 |
| 2 | 创建 `website/modules-src/<id>/module.json` | manifest | `dirName === id`；`order = 当前最大 + 1`；不写 `disabled` |
| 3 | 接入 SDK 并声明 metric（`metric.name` / `metric.semantics` / `metric.max` / score 公式 / `ended_reason` 映射 / `extra` schema） | 游戏源码 + registry | SDK 三模式单测；finish 幂等（重复调用不发第二次请求） |
| 4 | 更新 `apps/client/src/utils/module_center.js` | 客户端内置列表 | 顺序连续 1..N |
| 5 | 更新 `MoreView.vue:70-82` 的 `CONTEXT_AWARE_GAME_MODULE_IDS` | 白名单 | 与第 4 步同时改 |
| 6 | 更新契约测试 `website_game_modules_contract.spec.ts:39-51` 的 `gameModuleIds` | 门禁 | `npm run test:ci` 全绿 |
| 7 | 服务端 registry 登记（§2 全字段，含 `legacy_compatible` / `season_eligible` / `metric.max` / `min_client_version`） | `modules/game_platform/registry.py` | `/meta` 的 `registry.games` 含新 id |
| 8 | 新增该游戏的 rank/SDK 契约测试 | `apps/client/src/utils/<id>_rank_contract.spec.ts`（或 SDK 测试） | Legacy 与 V2 各 ≥1 正例 + ≥1 降级例 |
| 9 | 构建冒烟 + catalog 校验 | `node scripts/build_website_modules.mjs --modules <id>` | 三 channel 产物齐全；catalog order 正确 |
| 10 | 奖励规则登记（#909）：`ranked` / `season_eligible` / XP-coin 规则与日限 | economy 规则表 | `rule_version` 可追踪；Legacy 零奖励 |
| 11 | 真机验收（iOS/Android 抽样） | #911 证据 | 可玩 / 可提交 / 榜可见 / 网络失败不崩 / 重复 finish 不重复结算 |
| 12 | 更新本文件 §2/§3/§4/§5 | 本文档 | #911 三方 diff 测试通过 |

**禁止**：复用历史 id；中文/大写/空格做 id；插入既有顺序中间；只改 `module_center.js` 而漏 `MoreView.vue` 白名单或契约测试；只改客户端而漏服务端 registry（会导致该游戏 `RUN_INVALID`/`GAME_DISABLED`）。

---

## 8. 待用户确认项

| # | 事项 | 默认假设 |
|---|---|---|
| U-R1 | `hbut_match3` 的 `metric.name` 命名 | `score_only`（`metric.value=0`，仅按 `score` 排序） |
| U-R2 | `hbut_gomoku` 是否纳入 V2 排行榜与竞技榜 metric（胜负/胜率/连胜） | 仅 #908 服务端复算落地后进竞技榜 |
| U-R3 | `hugongda_escape` 是否显示"敬请期待"占位 | 不显示 |
| U-R4 | `clumsy_bird_hbut` 的 V2 主排序是否改为本局 `score`（Legacy 镜像仍 bestScore） | 是 |
| U-R5 | `season_eligible` 是否所有 `ranked=true` 游戏都为 `true` | 是（若要求赛季榜必须 `server_verified_match`，需同时改 `trust-model.md` T1） |
| U-R6 | `metric.max` 的工程上限值（如 `layers`/`jump_count` 的 100000）是否够用 | 是；超限即 `QUARANTINED`，宁可误挂起不误发奖 |
