# Game Platform V2 信任模型（trust-model）

> - 文档编号：#901 交付物 B
> - 配套：`docs/game-platform/protocol-v1.md`（§6 认证链路、§5 错误码、§8 账本）、`docs/game-platform/compatibility.md`、`docs/game-platform/game-registry.md`
> - 三档信任级别命名在全部文档与代码中必须逐字一致：`legacy` / `verified_session` / `server_verified_match`
> - 所有引用格式 `相对路径:行号`，基于 `origin/main` = `1b8b755d`

---

## 0. 一句话结论

**谁在玩（actor）只能由服务端从验证后的凭据链里推导，永远不能由客户端"告诉"服务端；能拿多少奖励只能由服务端规则计算，永远不能由客户端"要求"。**

两处落地：认证侧 `Authorization: Bearer <token>` → principal → actor（§2–§3）；结算侧 result envelope 只描述"发生了什么"，奖励由服务端 registry + economy 规则派生（§4）。

---

## 1. 为什么需要分档（现状事实）

| 事实 | 证据 |
|---|---|
| Legacy 排行完全信任客户端自报 `student_id`（仅 `^\d{10}$` 格式校验） | `ocr-service/runtime/entrypoint.py:4612-4613`；`ocr-service/modules/game_ranking_storage.py` 直接落库 |
| Legacy 榜查询也把 `student_id` 当"我是谁"（用于标记 `is_self`） | `ocr-service/runtime/entrypoint.py:4708-4709` |
| 游戏源码把 URL / localStorage 里的 `student_id` 直接塞进提交体 | `website/modules-src/hbut_stack/project/src/utils/game_rank.js:165,189`；`website/modules-src/jump_out_hbut/project/src/utils/game_rank.js:126-131` |
| 宿主把 `student_id/player_name/class_name/major/school_name` 作为 URL query 注入 iframe（唯一宿主→游戏通道） | `apps/client/src/components/MoreView.vue:236-244` |
| 已有一套"已验证 principal"实现（Identity AT 验签 + 双轨 + 指标），但 **opaque AT 目前走不到 JWT 通道**（`token_shape` 对无点形状返回 `unknown`） | `ocr-service/identity_auth/validator.py:60-67,124-128`；`identity_auth/dependencies.py:94-99,141-142` |
| Identity 侧 pairwise `sub` ≠ 学号；学号只在受控 claim（仅 userinfo）返回 | `identity-platform/core/src/oidc/provider.ts:205-212`；`core/src/oidc/account.ts:96-103` |
| 五子棋胜负**完全由客户端判定**，relay 只转发消息（无棋局复算） | `website/modules-src/hbut_gomoku/project/src/game/online.js:683,738`；relay 端点 `ocr-service/runtime/entrypoint.py:3636-3750` |

结论：现有系统只有"零信任"（Legacy 自报）与"身份已验证"（Identity principal）两种能力，缺"结果被服务端确认"这一档。V2 必须显式定义三档并按档位开放权益。

---

## 2. 三档信任级别定义

### 2.1 总表

| 维度 | `legacy` | `verified_session` | `server_verified_match` |
|---|---|---|---|
| **actor 如何推导** | 客户端提交的 `student_id`（Legacy 冻结契约），仅格式校验 | 服务端从 Identity AT 验签得 principal → `hbut_student_id` / `player_id`；再经 Launch Ticket（一次性、60–120s、绑 game）→ Game Session（≤1800s、绑 player+game、每请求校验、可撤销，`protocol-v1.md` §6.6）；run 绑定 session，finish 校验归属 | 在 `verified_session` 基础上，**服务端另行持有比赛状态**（如五子棋 move 序列并复算五连），结果由服务端判定而非客户端上报 |
| **凭据形态** | 无（自报） | `gs_` Game Session token（凭 `gpt_` ticket 兑换），run 归属校验 | `gs_` token + `match_id` 服务端状态机 |
| **可以做什么** | 提交 Legacy 经典榜（`game_rank_runs` / `game_rank_best`）；展示 Legacy 榜；被服务端内部镜像进 V2 的 **classic** 榜 | 提交 V2 run；`SETTLED`；进 **classic / verified** 榜；参与每日任务与（受 economy 规则约束的）XP/湖工币结算；查看本人钱包 | `verified_session` 全部能力 + 官方竞技榜（胜负/胜率/连胜）、赛季积分、对抗类奖励、UGC 经济（漂流瓶）交互 |
| **明确禁止做什么** | **禁止**产生 XP / 湖工币 / 每日任务进度 / Verified Season 排名；**禁止**进 verified/season 榜；**禁止**作为任何奖励或赛果证据 | **禁止**声称"服务端已确认"（竞技语义）；**禁止**在没有 `match_id` 服务端状态时写胜负/连胜；**禁止**把客户端时间戳/时长当真值用于风控裁决 | **禁止**绕过服务端状态直接改赛果；**禁止**由客户端提交 `winner`/`score` 作为最终赛果（仅可作为待复算输入） |
| **能否进 settlement** | 否 | 是（`settlements` 行 + 可选 wallet 变更） | 是（同左 + 对抗奖励） |
| **能否产生 XP** | **否** | 是（服务端规则计算，受日限） | 是 |
| **能否产生 coin（湖工币）** | **否** | 是（服务端规则计算，受日限） | 是 |
| **能否进 Season 排行** | **否**（"Verified Season" 亦不可） | 是（仅 registry `ranked=true` 且 `season_eligible=true` 的 game） | 是（竞技赛季，独立榜） |
| **可否被撤销** | 不适用（无凭据）；历史 legacy run 永久保留 | 是（撤 session / 登出，撤销延迟 ≤30s，`protocol-v1.md` §6.6）；**已结算的 run 与账本不回滚** | 同左 + 赛果可被服务端改判（记录裁决日志） |
| **风控要求** | 无（历史现状）；必须打 `trust_level=legacy` 标记 | 限流 + 时长/数值异常检测 → `QUARANTINED` | 服务端状态一致性 + 反刷频率控制 + 对手匹配校验 |
| **降级目标（失败时）** | — | Identity/session 不可用 → registry `legacy_compatible=true` 则回落 Legacy 提交，否则 `standalone`（本地展示、不上传） | 服务端状态不可用 → 该局不产生竞技结果（可降级为 `verified_session` 的普通对局记录，但**不得**产生胜负/连胜） |

### 2.2 能力细则表（#903 落库、#906 断言、#909 计费引用）

| 能力项 | `legacy` | `verified_session` | `server_verified_match` |
|---|---|---|---|
| 写 `game_rank_runs` / `game_rank_best`（旧表） | 允许（唯一客户端写入者） | 允许（dual-write 投影，classic 榜） | 允许（同左，若该游戏参与经典榜） |
| 写 `runs`（V2 表） | 允许，`trust_level=legacy`（仅由 Legacy 提交镜像产生） | 允许，`trust_level=verified_session` | 允许，`trust_level=server_verified_match` |
| 写 `settlements` | **禁止** | 允许（一次；`settlements.run_id` 唯一裁决） | 允许 |
| 写 `wallet_accounts` / `wallet_ledger` | **禁止** | 允许（幂等键 `settle:{game_id}:{run_id}`，见 `protocol-v1.md` §8.4） | 允许 |
| 写 `daily_progress` | **禁止** | 允许 | 允许 |
| 写赛季榜（verified / competitive） | **禁止** | 允许（仅 `ranked=true` 且 `season_eligible=true`） | 允许 |
| 参与漂流瓶等 UGC 经济 | **禁止** | 允许（escrow 状态机与幂等键见 `protocol-v1.md` §8.5） | 允许 |
| `is_self` / 本人视角 | Legacy 榜按自报 `student_id` 标记（冻结行为，仅展示） | 由 principal 推导（`protocol-v1.md` §9.2） | 同左 |
| 客户端伪造 `protocol_version`/`trust_level`/`xp`/`coin` | **不生效**（Legacy 路径不读这些字段；出现即告警） | **不生效**（`trust_level` 是服务端列，不接受客户端值） | **不生效**（同左） |

### 2.3 会话撤销（`verified_session` / `server_verified_match` 的关键补偿设计）

P1 推荐方案 (b) 下 AT 在 3600s 内不可即时撤销，因此**撤销能力必须由 Game Session 承担**：

| 项 | 规定 |
|---|---|
| 校验点 | 每个 `runs` / `finish` / `matches` 请求都校验 session（`token_hash` 查库，见 `protocol-v1.md` §6.6） |
| 撤销延迟上界 | 不启用缓存：0（下一次请求即失效）；启用进程内缓存：**≤30s**（TTL 写死上限 30s） |
| 撤销范围 | logout / `end_session` / 改密 / 封禁 → 该 `player_id` 的**全部活跃 session** 置 `revoked_at` |
| 与资产的关系 | 撤销**不回滚**已 `SETTLED` 的 run 与已写账本（账本不可变，`protocol-v1.md` §8.1） |
| 失败姿态 | session 校验所需的 DB 不可用 → `500 INTERNAL_ERROR`；**绝不**退化为"无 session 放行"或"改用 body 里的 student_id" |

---

## 3. 硬约束：actor 必须来自验证后的 principal

### 3.1 约束文本

> **任何写操作的 actor（`player_id` / `hbut_student_id`）必须由服务端从已验证凭据（Identity access token 的受控 claim，或 Game Session 绑定的 principal）推导。请求 body、query、URL fragment、header（除 `Authorization`）、cookie、localStorage 中出现的 `student_id` / `player_id` / `user_id` 一律不得作为 actor 来源；在 V2 端点上出现即返回 `403 FORBIDDEN_ACTOR`，其余服务端权威字段按 `400 SCHEMA_INVALID` 处理（划分见 `protocol-v1.md` §2.3）。**

设计理由（为什么不"静默忽略"）：静默忽略会掩盖"调用方仍按旧信任模型工作"的现实。显式拒绝能在灰度期立刻暴露未迁移调用方（#911 指标 `game_platform_forbidden_actor_total`），并让伪造尝试在服务端留痕。

### 3.2 当前代码中违反该约束的位置（#904 / #905 / #906 / #907 / #908 必须逐个处理）

| # | 位置 | 违反方式 | 处理要求 |
|---|---|---|---|
| 1 | `ocr-service/runtime/entrypoint.py:4612-4613` | `/api/game-rank/submit` 用 `req.student_id` 作为 actor | **Legacy 冻结**：保留行为并落 `trust_level=legacy`；镜像进 V2 的行必须明确标记不可信 |
| 2 | `ocr-service/runtime/entrypoint.py:4708-4709` | `/api/game-rank/leaderboard` 接受 query `student_id` 作为"我是谁" | 仅用于 `is_self`（展示）；V2 榜必须由 principal 推导（`protocol-v1.md` §9.2） |
| 3 | `website/modules-src/hbut_stack/project/src/utils/game_rank.js:165` | 从 URL `student_id` / localStorage 读取 actor 来源 | #904 SDK 禁止把该值当 V2 actor；**只**可作为 legacy fallback 入参 |
| 4 | `website/modules-src/hbut_stack/project/src/utils/game_rank.js:189` | 提交体带 `student_id`（Legacy 契约） | V2 提交体不得包含该字段（出现即 `FORBIDDEN_ACTOR`）；Legacy 路径保留 |
| 5 | `website/modules-src/jump_out_hbut/project/src/utils/game_rank.js:126-131` | 同上（旧协议：snake_case、不 throw、无默认 base） | #907a 迁移时单独适配：V2 路径剥离 `student_id`，Legacy 路径原样 |
| 6 | `website/modules-src/hecheng_hugongda/project/src/App.vue:1073` | 排行榜把 `rankContext.studentId` 作为 query 传参 | 同 #2：V2 榜不接受；Legacy 保留 |
| 7 | `apps/client/src/components/MoreView.vue:236-244` | 宿主把 `student_id/player_name/class_name/major/school_name` 拼进 iframe URL（唯一注入通道） | #905 改为注入 Launch Ticket（`gpt_...`），灰度期可并存但 V2 SDK 不得消费 `student_id` |
| 8 | `website/modules-src/hecheng_hugongda/project/src/utils/game_rank.js:4` | 使用**全局共享** storage key `hbut_game_rank_context_v1`（跨模块上下文串味） | #907a 改为模块私有 key，或 SDK 不再落盘 actor |
| 9 | `website/modules-src/hbut_gomoku/project/src/game/online.js:683,738` | `winner` 由客户端状态决定并随 relay 消息上报 | #908：relay 必须持有 move 序列并复算，赛果由服务端给出 |

> 1–2 是**服务端**历史包袱（靠冻结 + `trust_level=legacy` 隔离）；3–9 是**客户端**违规（靠 SDK 抽象与迁移消除）。任何"在 V2 端点上先接受 `student_id` 再决定是否信任"的中间态实现都不接受。

### 3.3 actor 推导伪代码（#902 / #904 照此实现）

```text
# 服务端（ticket 签发）
principal = validate_identity_access_token(authorization)      # identity_auth.validator
require_scope(principal, "game.play")
if body/query 含 student_id|player_id|user_id: 403 FORBIDDEN_ACTOR
actor_student_id = principal.student_id                         # 唯一来源
ticket = issue_ticket(actor_student_id, game_id, ttl<=120, single_use=True)

# 服务端（session 兑换，原子裁决；详见 protocol-v1.md §6.2.1）
UPDATE tickets SET used_at=now() WHERE ticket_hash=? AND used_at IS NULL AND expires_at>now()
# affected_rows=1 → 同事务签发 session；=0 → 按 used/expired 分别 TICKET_USED / TICKET_INVALID

# 服务端（finish）
session = load_session(gs_token)                                # HMAC 摘要比对 + expires/revoked 校验
require(session.game_id == body.game_id)                         # 否则 401 GAME_SESSION_EXPIRED（run 状态不变）
require(session.player_id == run.player_id)                      # 否则 403 FORBIDDEN_ACTOR
actor = session.player_id                                        # 唯一来源；body 无 actor 字段

# 客户端（SDK）
ticket = host_injected_query_param("gpt")                        # 只读 ticket，不读 student_id
history.replaceState(...)                                        # 立即清理 URL 中的 ticket
session = POST /api/game-platform/v1/sessions {ticket, game_id}   # 不携带、也不允许携带 actor
```

---

## 4. 客户端不能直接指定 actor 或 reward 数量的设计论证

### 4.1 为什么不能指定 actor

1. **归属即权限**：actor 决定记录归属。可指定 → 任何人可把成绩写进他人账号（刷榜、栽赃），也可把他人成绩据为己有（`game_rank_best` 的 `game_id+student_id` 唯一键会直接覆盖他人最佳成绩，`ocr-service/modules/game_ranking_storage.py:225`）。
2. **奖励即资产**：V2 钱包以 `player_id` 为主键，actor 可伪造会让 ledger 变成不可审计的账。
3. **可审计/可申诉的前提**：只有 actor 来自可验证凭据，才能回答"这条记录是谁在哪个 session 提交的"（`session_id` + `player_id` + `run_id` + `request_id`）；自报 actor 的记录事后无法自证。
4. **现状已证明风险真实**：Legacy 只做 `^\d{10}$` 校验（`runtime/entrypoint.py:4613`），实现上任意人可写任意学号成绩。

### 4.2 为什么不能指定 reward 数量

1. **定价必须在服务端**：奖励数量是"定价"，只能在版本化规则里（`rule_version`，`protocol-v1.md` §8）。客户端指定数量等于把定价权交给用户。
2. **客户端不可信且可改包**：游戏是 iframe 内的可替换静态资源（CDN 模块），`game_rank.js` 每个数值都可被篡改。
3. **结算必须可复算**：服务端必须能用 `(game_id, result, rule_version)` 复算出同一奖励值；客户端给定数量则无法对账（wallet ledger vs settlement）。
4. **幂等与限额依赖服务端规则**：日限、每局上限、赛季上限都需要服务端掌握参数；客户端一指定数量，这些闸门全部失效。

### 4.3 允许客户端提交的唯一合法集合

只能是 `protocol-v1.md` §2.2 定义的字段，其中 `result` envelope（`score` / `metric` / `moves` / `ended_reason` / `extra`）全部是**不可信输入**：服务端做边界校验、字节上限、异常检测（`QUARANTINED`）、registry 归一化，并只把它当作"游戏内发生了什么"的描述。

服务端派生（#909 落地）：

```text
xp_gain   = f(game_id, result.score, result.metric, rule_version, daily_caps)
coin_gain = g(game_id, result.score, result.metric, rule_version, daily_caps)
```

`f`/`g` 的参数里**没有**任何客户端可控的"数量"字段；`extra` 不进入 `f`/`g`（只用于展示与风控）。

---

## 5. 违规与滥用处置（#911 观测口径）

| 事件 | 服务端动作 | 指标 |
|---|---|---|
| V2 body/query 出现 actor 字段 | `403 FORBIDDEN_ACTOR`，不落库 | `game_platform_forbidden_actor_total{field,game_id}` |
| `run_id` 属他人 | `403 FORBIDDEN_ACTOR` | 同上 + `run_id_owner_mismatch_total` |
| Legacy 提交带 V2 奖励字段（`xp`/`coin`/`trust_level`） | Legacy 路径忽略 + 告警，**不产生奖励** | `legacy_reward_injection_attempt_total` |
| 数值/时长异常 | `QUARANTINED`（不结算、不进榜） | `game_platform_quarantine_total{reason}` |
| `result_fingerprint` 跨 ≥3 个账号复现（`protocol-v1.md` §3.2 T5 ⑤） | `QUARANTINED` + 人工队列 | `game_platform_replay_suspected_total` |
| 同 session 高频 finish | `RATE_LIMITED` 或 `QUARANTINED` | `game_platform_finish_rate_limited_total` |
| session 撤销后仍在使用 | `401 GAME_SESSION_EXPIRED` | `game_platform_session_revoked_total` |

---

## 6. 待用户确认项

| # | 事项 | 说明 |
|---|---|---|
| T1 | `verified_session` 是否允许进 Season 榜 | 本文件默认"是（仅 `ranked=true` 且 `season_eligible=true`）"；若要求赛季榜必须 `server_verified_match`，需改 §2.1/§2.2 与 `game-registry.md` 的 `season_eligible` 列 |
| T2 | Legacy 榜 `is_self` 展示口径 | 默认保持冻结（按自报 `student_id`，仅展示）；V2 榜一律按 principal |
| T3 | actor 字段是"拒绝"还是"灰度期忽略并告警" | 本文件定为**拒绝**；若选忽略，需同步改 `protocol-v1.md` §2.3/§5 与 §5 的指标口径 |
| T4 | 会话撤销缓存 TTL（默认 ≤30s 写死上限） | 若要求零延迟撤销，则必须关闭缓存（每次请求查库，成本换确定性） |
