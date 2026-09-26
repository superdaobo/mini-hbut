# Game Platform V2 协议（v1 冻结稿）

> ⚠️ **P1 决策待用户确认**：Access Token 可验证化方案（introspection / JWT AT / userinfo）尚未获用户拍板。**§6.3–§6.5 为完整分析与推荐**，在用户确认前 `#902` 不得据此开工；其余章节（字段/状态机/错误码/trust level/账本/排行榜）不受 P1 选择影响，可先行冻结。
>
> - 文档编号：#901 交付物 A
> - 目标分支：`game-platform/901-protocol`，基点 `origin/main` = `1b8b755d`
> - **本文自包含**：所有依据都直接引用仓库内文件（`相对路径:行号`）；Epic #900 的原文（兼容原则 / Rollout / 兼容矩阵）逐字收录在 `docs/game-platform/compatibility.md` 附录 A，本文不依赖任何仓库外文档
> - 适用范围：`/api/game-platform/v1/*`（新经济语义唯一落点）；`/api/game-rank/*` 冻结为 Legacy 通道（三个路由：`runtime/entrypoint.py:4576` `/ping`、`:4606` `/submit`、`:4686` `/leaderboard`，函数体止于 `:4741`）
> - 机读副本：`docs/game-platform/schemas/result-envelope.schema.json`、`docs/game-platform/schemas/error-codes.json`
> - 配套：`docs/game-platform/trust-model.md`、`docs/game-platform/compatibility.md`、`docs/game-platform/game-registry.md`

---

## 0. 不可违反的不变量

1. **actor 只来自验证后的 principal**：绝不来自 body / query / URL / localStorage 的 `student_id`（见 `trust-model.md`）。
2. **奖励数量只由服务端规则计算**：客户端只能提交"发生了什么"（result envelope），不能提交"应得多少"。
3. **Legacy 通道永不产生 XP / 湖工币 / Verified Season 排名**：客户端伪造新版字段也不能绕过（见 `compatibility.md` §2）。
4. **`/api/game-rank/*` 请求 / 响应逐字段冻结**：V2 只做 additive 的 dual-write，不改 Legacy 语义。
5. **`run_id` 是全局幂等键**：跨 game、跨 player 全局唯一；同 `run_id` 绝不产生第二次结算（§3.3、§3.5）。
6. **纯 additive 演进**：不 DROP 表、不清空旧榜、不改既有 scope 的既有含义、不回填历史 Legacy run。
7. **凭据不落盘、不回显、不入日志**：ticket / Game Session token 只存摘要，明文只在签发响应出现一次（§10）。
8. **账本不可变**：已写入的 wallet ledger 行永不 UPDATE/DELETE；纠错用反向行（§8）。
9. **失败可恢复**：任何"提交成功但结算未完成"的状态必须有幂等补偿路径（§3.3 case I、§3.4）。

---

## 1. 协议版本与 API namespace

### 1.1 namespace 与版本

- 所有新接口位于 **`/api/game-platform/v1/*`**。
- **禁止**在 `/api/game-rank/*` 内叠加任何新经济语义（XP、湖工币、season 分、settlement 状态）。该路径只允许两种改动：
  - additive 的**新响应字段**（老客户端忽略未知字段：`website/modules-src/hbut_stack/project/src/utils/game_rank.js:85-98` 只在 HTTP 错误或 `success === false` 时报错）；
  - 服务端内部把 Legacy 提交镜像进 V2 classic 榜（dual-write，见 `compatibility.md` §3）。
- 未实现的路径（如 `/api/game-platform/v2/*`）返回 404 + `FEATURE_DISABLED`，不做语义猜测。

### 1.2 端点清单

| 方法 | 路径 | 用途 | 认证要求 | 幂等键 | 负责 issue |
|---|---|---|---|---|---|
| GET | `/api/game-platform/v1/meta` | 版本协商、能力清单、registry 快照 | 无 | — | #902 |
| POST | `/api/game-platform/v1/tickets` | 宿主用 Identity AT 换一次性 Launch Ticket | `Authorization: Bearer <Identity AT>` + scope `game.play` | `Idempotency-Key`（§6.2.4） | #902 |
| POST | `/api/game-platform/v1/sessions` | 游戏（iframe 内）用 ticket 换 Game Session | ticket（body），**不需要** Bearer | `Idempotency-Key`（§6.2.4） | #902 |
| POST | `/api/game-platform/v1/runs` | 显式开始 run（`CREATED`） | `Authorization: Bearer <GS token>` | `run_id` | #903 |
| GET | `/api/game-platform/v1/runs/{run_id}` | run 状态查询（断线恢复、幂等核对） | `Bearer <GS token>` | — | #903 |
| POST | `/api/game-platform/v1/runs/{run_id}/finish` | 提交结果、触发结算 | `Bearer <GS token>` | `run_id` + `content_hash`（§3.3） | #903 / #909 |
| GET | `/api/game-platform/v1/leaderboards` | 新榜读取（classic / verified / season） | 无（公开榜）或 `Bearer <GS token>`（本人态） | — | #909（契约见 §9） |
| GET | `/api/game-platform/v1/me/profile` | 玩家展示快照（服务端权威副本） | `Bearer <Identity AT>` 或 `Bearer <GS token>` | — | #903 |
| GET | `/api/game-platform/v1/me/wallet` | XP / 湖工币 / 每日进度 | `Bearer <Identity AT>` | — | #909 |
| POST | `/api/game-platform/v1/matches/{match_id}/result` | 对抗类结果上报（服务端复算） | `Bearer <GS token>` | `match_id` | #908 |

端点注册沿用 `register_forum_routes(app)` 的函数式范式（`forum_backend/main.py:238` 为定义处），**不得**在 `runtime/entrypoint.py` 内新增 `@app.post` 装饰器块（该文件 4798 行单文件，多 worktree 写冲突）。

### 1.3 版本协商

请求侧：所有 V2 请求**应当**携带 `X-Game-Platform-Protocol: 1`；body 内 `protocol_version`（integer）优先于请求头；两者都缺失 → 按 `1` 处理并递增 `game_platform_protocol_missing_total`。

服务端侧 `GET /api/game-platform/v1/meta`：

```json
{
  "success": true,
  "protocol_version": { "min": 1, "max": 1 },
  "server_version": "2026.09.1",
  "features": {
    "run_v2": true, "settlement": true, "economy": false,
    "daily_tasks": false, "drift_bottle": false, "competitive": false,
    "legacy_dual_write": true
  },
  "limits": {
    "max_result_bytes": 8192,
    "max_request_bytes": 65536,
    "max_duration_ms": 86400000,
    "max_score": 1000000000,
    "ticket_ttl_seconds": 120,
    "session_ttl_seconds": 1800,
    "leaderboard_max_limit": 100
  },
  "registry": { "synced_at": "2026-09-27T00:00:00Z", "games": 12 }
}
```

| 情形 | 服务端行为 | 客户端必须做什么 |
|---|---|---|
| `protocol_version` ∈ `[min,max]` | 正常处理，响应头回显 `X-Game-Platform-Protocol: 1` | 正常流程 |
| 缺失 | 按 `1` 处理 + 指标 | 无（但 SDK 必须补齐） |
| > `max` 或 < `min` | `400 PROTOCOL_VERSION_UNSUPPORTED` + `details.supported` | 不重试；降级 Legacy（`legacy_compatible=true`）或 standalone；上报"客户端过旧/过新" |
| 非整数 / 非法 JSON | `400 SCHEMA_INVALID` | 修复 payload；同一 run 不再重试 |
| `features.run_v2=false` | `403 FEATURE_DISABLED` | 降级 Legacy / standalone |

### 1.4 客户端版本门禁（软门禁）

`client_version` 与 registry `min_client_version` 比较，低于下限 → `426 CLIENT_VERSION_TOO_OLD`。**该门禁是软门禁**：`client_version` 可伪造，只用于引导升级与观测，绝不作为安全边界（真正的安全边界是 ticket/session 与 scope）。Legacy 通道不做该门禁。

---

## 2. 核心对象字段表

### 2.1 `finish` 请求体

```json
{
  "protocol_version": 1,
  "game_id": "hbut_stack",
  "run_id": "run_1758931200000_ab12cd34",
  "session_id": "sid_7f3a9c2e5b1d4a90",
  "client_version": "1.4.11",
  "platform": "ios",
  "runtime": "capacitor-local",
  "started_at": "2026-09-27T08:00:00.000Z",
  "finished_at": "2026-09-27T08:02:31.400Z",
  "duration_ms": 151400,
  "result": { "...": "见 §4" }
}
```

> `Authorization: Bearer <GS token>` 里携带的是 **token**（`gs_...`），body 里的 `session_id` 是**公开标识**（`sid_...`）；两者分离，token 只在兑换响应出现一次（§6.2.1）。

### 2.2 字段详表

> "客户端是否可信"：`不可信` = 服务端不得据此做鉴权/发奖裁决，只能作展示、诊断、软门禁或用边界校验后的输入；`不可信（仅作幂等 token）` = 值由客户端生成，但服务端只用它做 uniqueness/幂等。

| 字段 | 类型 | 边界约束 | 必填 | 客户端是否可信 | 进入幂等键 | 进入签名/绑定 | Legacy 对应字段 |
|---|---|---|---|---|---|---|---|
| `protocol_version` | integer | `1`（支持区间 `[1,1]`） | 否（缺失=1） | 不可信（仅协商） | 否 | 否 | 无 |
| `game_id` | string | `^[a-z0-9_]{3,64}$`；必须存在于服务端 registry 且 `status=active` | **是** | 不可信（必须与 session 绑定值一致） | **是** | **是**（ticket/session 绑定 game_id） | `game_id`（`game_rank.js:187`） |
| `run_id` | string | `^[A-Za-z0-9_-]{8,128}$`；**全局唯一**（跨 game、跨 player） | **是** | 不可信（仅作幂等 token） | **是**（全局） | **是**（与 session 的 player 绑定校验） | `run_id`（`game_rank.js:188`；`createRunId()` 生成 `run_<ts>_<rand>`，`game_rank.js:227-230`） |
| `session_id` | string | `^sid_[a-z0-9]{16,64}$`；服务端签发，公开可见 | 是（`verified_session` 及以上） | 不可信（服务端签发，但仍校验授权链） | 否 | **是**（run 绑定 session；finish 校验归属） | 无（Legacy 无会话） |
| `client_version` | string | `^[0-9A-Za-z._+-]{1,64}$` | 否（`unknown` 兜底） | 不可信（软门禁） | 否 | 否 | `client_version`（`game_rank.js:199`） |
| `platform` | enum string | `ios\|android\|web\|windows\|macos\|linux\|unknown`（§7） | 否（`unknown` 兜底） | 不可信 | 否 | 否 | `platform`（Legacy 自由文本，`game_rank.js:200`） |
| `runtime` | enum string | `tauri-local\|capacitor-local\|remote-site\|module-web\|unknown`（§7） | 否（`unknown` 兜底） | 不可信 | 否 | 否 | `runtime`（Legacy 自由文本，`game_rank.js:201`） |
| `started_at` | string(RFC3339 UTC, ms) | 不早于 session 签发时间 −300s；不晚于服务器当前时间 +120s；`finished_at >= started_at` | 否 | 不可信 | 否 | 否 | 无 |
| `finished_at` | string(RFC3339 UTC, ms) | 同上 | 否 | 不可信 | 否 | 否 | 无 |
| `duration_ms` | integer | `0..86400000`；服务端另算 `server_duration_ms`，若 `duration_ms > server_duration_ms + 120000` → `QUARANTINED` | **是** | 不可信（仅作展示与异常检测输入） | **是**（纳入 content_hash） | 否 | `duration_ms`（`game_rank.js:196`） |
| `result` | object | §4；序列化 ≤ **8192** 字节（`max_result_bytes`） | **是** | 不可信（服务端按 registry 规则重新校验/派生） | **是**（content_hash 主体） | 否 | `score / max_level / move_count / ended_reason / payload`（`game_rank.js:194-202`） |
| `require_rewards` | boolean | 默认 `false`；仅在 `POST /runs/{id}/finish` 上有效 | 否 | 不可信（仅表达客户端期望，不改变服务端发奖判定） | **是**（纳入 content_hash） | 否 | 无（Legacy 无奖励语义） |
| `idempotency_key` | string | `^[A-Za-z0-9_-]{16,128}$`；传输位置与作用域见 §6.2.4 | 否（仅 ticket/session 端点建议必带） | 不可信（仅作重放识别） | **是**（ticket/session 签发） | 否 | 无 |

**`require_rewards` 校验规则**：值为 `true` 且服务端 `features.economy=false` → run 仍按正常流程 `SETTLED`（`reward_status=disabled`），并额外在响应 `error` 中以 `REWARD_DISABLED`（HTTP 200）提示；值为 `true` 但请求未携带有效 session → `401 AUTH_REQUIRED`（不得因"索要奖励"而放宽认证）。该字段**不得**影响 `f/g` 奖励函数（`trust-model.md` §4.3）——它只决定"是否把 disabled 状态作为提示性错误返回"。

### 2.3 服务端权威字段的拒绝码划分（#906/#903 直接照此实现）

| 字段类别 | 字段清单 | 拒绝码 | 理由 |
|---|---|---|---|
| **actor 类** | `student_id` / `player_id` / `user_id` | **403 `FORBIDDEN_ACTOR`** | 出现即代表调用方仍按"自报身份"模型工作，是必须暴露的安全信号（`trust-model.md` §3.1） |
| **其他服务端权威 / 未知写入意图** | `xp_amount` / `coin_amount` / `reward` / `reward_amount` / `season_id` / `trust_level` / `settled_at` / `server_received_at` | **400 `SCHEMA_INVALID`** | 这些字段在 V2 契约里根本不存在（`additionalProperties: false`），属于格式/契约违规，不需要按安全事件处理 |
| Legacy 端点（`/api/game-rank/*`） | 上述任意字段 | 忽略 + 告警（`legacy_reward_injection_attempt_total`） | Legacy 冻结契约不允许因未知字段报错（`game_rank.js` 只读已知字段） |

### 2.4 Legacy → V2 字段映射表

| Legacy 字段（`game_rank.js:186-203`） | V2 位置 | 转换规则 |
|---|---|---|
| `game_id` | `game_id` | 原样，registry 校验 |
| `run_id` | `run_id` | 原样（全局幂等键） |
| `student_id` | **丢弃**（Legacy 专用） | V2 actor 来自 principal；提交值 ≠ principal 的 `hbut_student_id` → `403 FORBIDDEN_ACTOR` |
| `player_name` | 服务端玩家快照（P2 待确认项 U2） | 权威来源 = Identity `hbut_student_name`（`identity-platform/core/src/oidc/account.ts:96-103`）或服务端快照；Legacy 值仅作首次导入 |
| `class_name` / `school_name` / `major` | 服务端玩家快照 | 同上 |
| `score` | `result.score` | 原样（`0..1e9`） |
| `max_level` | `result.metric.value` | 逐游戏不同（`game-registry.md` §3）；例如 `hbut_monopoly` 为 `stage_index + 1` → V2 存 `metric.value = max_level - 1` |
| `duration_ms` | `duration_ms` | 原样（`0..86400000`） |
| `move_count` | `result.moves` | 原样（`0..1e6`） |
| `ended_reason` | `result.ended_reason` | 归一化到 §4 枚举（映射表 `game-registry.md` §4） |
| `client_version` | `client_version` | 原样 |
| `platform` | `platform` | 自由文本 → 枚举 normalize，无法识别 → `unknown`（原值记 `platform_raw`） |
| `runtime` | `runtime` | 自由文本 → 枚举 normalize，无法识别 → `unknown` |
| `payload` | `result.extra` | 原样保留，**不参与结算** |

---

## 3. Run 生命周期状态机

### 3.1 状态定义

| 状态 | 含义 | 终态 | 会发奖 | 能进榜 |
|---|---|---|---|---|
| `CREATED` | run 已登记，游戏尚未开始 | 否 | 否 | 否 |
| `STARTED` | 游戏进行中（有开始信号或首次进度） | 否 | 否 | 否 |
| `FINISHED` | 结果已接收且通过确定性校验，等待结算 | 否 | 否 | 否 |
| `SETTLED` | 结算事务已提交（含"经济关闭、奖励为 0"） | **是** | 视 `reward_status` | 是 |
| `REJECTED` | 确定性校验失败，run 作废 | **是** | 否 | 否 |
| `QUARANTINED` | 结果可疑，暂缓结算待复核 | **是**（复核后可改写为 `SETTLED`/`REJECTED`） | 否 | 否 |

### 3.2 转移表（#903 直接落库）

| # | 从 | 到 | 触发 | 前置校验（全部满足） | 副作用 / 实现要点 |
|---|---|---|---|---|---|
| T1 | ∅ | `CREATED` | `POST /runs` | ① GS token 有效（§6.6）；② `game_id` 在 registry 且 `status=active`；③ `run_id` 未被占用（占用且同 player 同 game → 返回现有 run，HTTP 200 `idempotent_replay=true`；占用但 player 不同 → `403 FORBIDDEN_ACTOR`；占用但 game 不同 → `409 RUN_ALREADY_FINISHED`） | `INSERT` runs（`status=CREATED`, `player_id`（来自 session）, `game_id`, `run_id`, `session_id`, `server_received_at`） |
| T2 | `CREATED` | `STARTED` | `POST /runs/{id}/start` 或首次进度心跳；**或** finish 时隐式补齐 | ① run 属于该 session/player；② 未处于终态 | 写 `started_at_server`；隐式补齐与 T3 同事务（禁止两次写入） |
| T3 | `CREATED`/`STARTED` | `FINISHED` | `POST /runs/{id}/finish` 校验通过 | ① GS token 有效（过期/撤销 → `401 GAME_SESSION_EXPIRED`）；② session 绑定的 `game_id` == 请求 `game_id`（不一致 → `401 GAME_SESSION_EXPIRED`，run 状态**不变**）；③ run 属于该 session 绑定的 player（否则 `403 FORBIDDEN_ACTOR`；run 不存在/格式非法 → `400 RUN_INVALID`）；④ `result` 通过 envelope + per-game schema 校验（失败 → `400 SCHEMA_INVALID` → `REJECTED`）；⑤ 数值边界通过；⑥ run 未处于终态 | 单事务：`UPDATE runs SET status='FINISHED', finished_at_server=?, content_hash=? WHERE run_id=? AND status IN ('CREATED','STARTED')`；写不可变 `end_result_json`；返回 `settlement.state ∈ {pending, applied}` |
| T4 | `FINISHED` | `SETTLED` | 结算事务提交 | ① `settlements.run_id` 唯一键插入成功（唯一裁决点）；② `wallet_ledger(player_id, idempotency_key='settle:{game_id}:{run_id}')` 插入成功；③ 日限额行加锁成功 | 同事务写 `settlements` + `wallet_accounts`（余额）+ `wallet_ledger`；`reward_status ∈ {granted, disabled, capped, zero}` |
| T5 | `FINISHED` | `QUARANTINED` | 服务端异常检测命中 | 命中任一条：① `duration_ms > server_duration_ms + 120000`；② `result.metric.value` 或 `score` 超出 registry 上限；③ 同 session 窗口内 finish 次数超阈值；④ 同 `run_id` 的结果摘要与已存 `content_hash` 冲突（正常由 T3 前置拦截，此处为兜底）；⑤ **`result_fingerprint`（`sha256(canonical_json(result))`，不含 `run_id`）在窗口内出现在 ≥3 个不同 player 上**（同一 result 跨账号批量复制的强信号） | 写 `quarantine_reason`；**不得**写 wallet / 榜；进运维观察队列 |
| T6 | `CREATED`/`STARTED` | `REJECTED` | 确定性失败 | 任一条：`SCHEMA_INVALID` / `RUN_INVALID` / 签名与 session 不符 / registry `status=disabled`（`GAME_DISABLED`）。**不含** `game_id` 与 session 不一致（该情形统一为 `401 GAME_SESSION_EXPIRED`，见 T3 ②） | 写 `rejected_code`；终态；必须新建 run 才能重试 |
| T7 | `QUARANTINED` | `SETTLED` | 复核通过 | 复核记录 + 原 `content_hash` 未变 | 走 T4 同一结算路径（幂等键不变） |
| T8 | `QUARANTINED` | `REJECTED` | 复核判定作弊/无效 | 复核记录 | `rejected_code=QUARANTINE_CONFIRMED`；不发奖 |

**禁止的转移**：任何终态回到 `CREATED`/`STARTED`/`FINISHED`；`REJECTED` → `SETTLED`（复活旧 run 是作弊路径，必须用新 `run_id`）。

**瞬态错误不是 `REJECTED`**：`INTERNAL_ERROR`（500）或 DB 短暂不可用发生在 T3/T4 时，run 必须停留原状态并允许客户端按幂等语义重试；只有**确定性**校验失败才允许进 `REJECTED`。

### 3.3 `finish` 的幂等语义

#### 3.3.1 `canonical_json` 与 `content_hash` 定义（#903 必须逐字实现）

```
canonical_json(v):
  1) 只允许 object / array / string / integer / boolean / null；**禁止浮点**（出现浮点即 SCHEMA_INVALID）
  2) object 键按 Unicode 码点升序排列，不允许重复键
  3) 输出无空白（分隔符 , 与 :），字符串按 UTF-8 编码前先做 NFC 归一化
  4) 整数按最短十进制输出（禁止前导零、禁止指数记法）；boolean/null 用小写字面量
content_hash = "sha256:" + hex_lower(sha256(utf8(canonical_json({
  game_id, run_id, duration_ms, result, require_rewards      // 仅这五个字段，顺序无关（canonical_json 会排序）
}))))
result_fingerprint = "sha256:" + hex_lower(sha256(utf8(canonical_json(result))))   // 用于 T5 ⑤，不含 run_id
```

服务端计算并落库 `content_hash`；客户端**不提交** `content_hash`（避免客户端自证）。

#### 3.3.2 幂等 case 表

| case | 请求 | 服务端行为 | HTTP | 响应要点 |
|---|---|---|---|---|
| A | 新 `run_id` | T3 →（T4 或 pending） | 200 | `{success:true, run:{status:"FINISHED"\|"SETTLED"}, settlement:{...}, idempotent_replay:false}` |
| B | 同 `run_id` + **相同** `content_hash`，run ∈ `FINISHED`/`SETTLED` 且已有 settlement 行 | **不重放任何副作用**：不重复结算、不重复发奖、不重复 dual-write | 200 | 返回**首次**的 `settlement` 与 `run.status`，`idempotent_replay:true` |
| C | 同 `run_id` + **不同** `content_hash` | 拒绝，任何行不被修改 | 409 | `RUN_ALREADY_FINISHED`，`details.first_finished_at`、`details.content_hash_mismatch=true` |
| D | 同 `run_id` 但 `player_id` 不同 | 拒绝 + 安全指标 | 403 | `FORBIDDEN_ACTOR` |
| E | 同 `run_id`、同 player，但 `game_id` 不同 | 拒绝（run_id 为全局键） | 409 | `RUN_ALREADY_FINISHED`，`details.reason="game_id_mismatch"` |
| F | run 已 `REJECTED` | 拒绝 | 409 | `RUN_ALREADY_FINISHED`，`details.rejected_code=...` |
| G | run 已 `QUARANTINED` | 幂等返回（不再结算） | 200 | `run.status="QUARANTINED"`，`settlement.state="pending_review"` |
| H | session 过期/撤销 | 拒绝，不创建/不修改 run | 401 | `GAME_SESSION_EXPIRED` |
| I | 同 `run_id` + **相同** `content_hash`，run = `FINISHED` 但 **`settlements` 无行**（T3 提交后、T4 提交前崩溃） | **在该幂等裁决点重新执行 T4**（不做任何"跳过副作用"的短路），返回真实结算结果 | 200 | `idempotent_replay:false`，`recovered:true`，`settlement.state` 为本次结算的真实结果 |

**case I 是 P1 强约束**：`settlements.run_id` 唯一键始终是唯一裁决点，因此"重试即补偿"是安全的——即使 T4 已在别处成功，重试也会命中唯一键并读取既有结果（退化为 case B）。除此之外，服务端另设**兜底扫描**（#903/#909）：每 60s 扫描 `runs.status='FINISHED' AND finished_at_server < now()-60s AND NOT EXISTS(settlements)`，逐条调用与正常路径**同一个结算函数**（幂等、可重入），并记录 `game_platform_settlement_recovered_total`。

SDK 侧配套（#904）：
- 同一 run 的 finish 重试必须**字节级同 payload**（保证 `content_hash` 稳定）；本地保存 pending payload（现有游戏已如此：`website/modules-src/hbut_stack/project/src/main.js:118`）。
- 200 + `idempotent_replay:true` 或 `recovered:true` 都视为成功，清除 pending。
- 409 一律**停止重试**（语义冲突，非抖动）。
- 429/500/超时按 1200/2600/5200ms 退避重试（4 次尝试），沿用既有策略（`game_rank.js:54-59,101-116`）。

### 3.4 并发 settlement 的仲裁规则

1. **单一裁决点**：`settlements.run_id` 的 `UNIQUE`。发奖流程 = "插入成功者继续，失败者读取既有结果"（`INSERT ... ON DUPLICATE KEY UPDATE id=id` 后检查 affected_rows，或条件 `UPDATE runs SET status='FINISHED' ... WHERE status IN (...)` 检查 affected_rows）。**禁止**先 `SELECT` 判断再 `INSERT`（TOCTOU）。
2. **钱包二次保险**：`wallet_ledger(player_id, idempotency_key)` 唯一，键格式 `settle:{game_id}:{run_id}`（全文统一此格式）；余额变更与 ledger 插入**同事务**。
3. **日限额**：`daily_progress(player_id, game_id, progress_date)` 唯一 + `SELECT ... FOR UPDATE`，同事务内检查并累加；超限 → `reward_status=capped`，run 仍 `SETTLED`。
4. **并发同 run 双 finish**：胜者继续结算；败者 affected_rows=0 后不得立即读（可能读到未提交快照）→ 短轮询（3 次，最长 200ms）；仍不可见 → `202 Accepted` + `settlement.state="pending"`，客户端按幂等重试（同一 payload；此时会走 case B 或 case I）。
5. **顺序铁律（dual-write）**：结算事务先提交；Legacy 经典榜投影是之后的**独立幂等步骤**（outbox，`run_id` 唯一），失败**不回滚**结算、不重复发奖（`compatibility.md` §3）。

### 3.5 DDL 约束清单（#903 直接落成）

```sql
-- runs：run_id 全局唯一（幂等基座；与 Legacy game_rank_runs 的 uk_game_rank_runs_run_id 语义一致）
UNIQUE KEY uk_gp_runs_run_id (run_id)
-- 玩家维度只做普通索引（不要 (player_id, game_id, run_id) 唯一键：它既冗余又暗示 run_id 可按 game 复用）
KEY idx_gp_runs_player_game (player_id, game_id)
KEY idx_gp_runs_session (session_id)
-- 结算：每个 run 一次（唯一裁决点）
UNIQUE KEY uk_gp_settlements_run (run_id)
-- 钱包账本：发奖幂等（命名空间见 §8）
UNIQUE KEY uk_gp_wallet_ledger_idem (player_id, idempotency_key)
-- 每日限额
UNIQUE KEY uk_gp_daily_progress (player_id, game_id, progress_date)
-- Legacy 正向投影 outbox（V2 → Legacy）
UNIQUE KEY uk_gp_legacy_outbox_run (run_id)
-- Legacy 反向镜像去重（Legacy → V2 classic）
UNIQUE KEY uk_gp_mirror_run (run_id)
-- ticket：一次性（明文不入库）
UNIQUE KEY uk_gp_tickets_hash (ticket_hash)
-- session：只存 token 摘要
UNIQUE KEY uk_gp_sessions_token_hash (token_hash)
KEY idx_gp_sessions_player (player_id, revoked_at)
-- 幂等记录（ticket/session 签发端点，§6.2.4）
UNIQUE KEY uk_gp_idempotency (endpoint, player_id, game_id, idempotency_key)
-- escrow（漂流瓶，#910 使用本 schema）
UNIQUE KEY uk_gp_escrow_bottle (bottle_id)
```

`run_id` 全局唯一的语义说明必须写进 DDL 注释（迁移评审可见），且 `game_rank_runs` 侧的 `uk_game_rank_runs_run_id`（`ocr-service/modules/game_ranking_storage.py:204`）保持不变。

---

## 4. Result Contract

### 4.1 统一 envelope

```json
{
  "schema_version": 1,
  "score": 0,
  "metric": { "name": "layers", "value": 0 },
  "moves": 0,
  "ended_reason": "unknown",
  "extra": {}
}
```

| 字段 | 类型 | 边界 | 必填 | 说明 |
|---|---|---|---|---|
| `schema_version` | integer | `1` | **是** | 未知版本 → `400 SCHEMA_INVALID`（不猜测） |
| `score` | integer | `0..1000000000` | **是** | 主排序分；公式由每个 game 定义（`game-registry.md` §3） |
| `metric` | object | `{name: ^[a-z][a-z0-9_]{1,31}$, value: 0..1000000000}` | **是** | 取代 Legacy `max_level` 的单一表征指标；`name` 必须等于 registry 声明值 |
| `moves` | integer | `0..1000000` | **是** | 取代 Legacy `move_count` |
| `ended_reason` | enum | `won\|lost\|cleared\|failed\|timeout\|abandoned\|draw\|collision\|game_over\|restart\|unknown` | **是** | 归一化结束原因 |
| `extra` | object | 仅标量（`string ≤512 chars` / **integer（禁止浮点，含 1.0、1e3）** / boolean / null）；≤32 键；键名 `^[a-z][A-Za-z0-9_]{0,31}$`（允许 camelCase 以原样承载 Legacy `payload`；新游戏推荐 snake_case）；**序列化 ≤6144 字节** | 否 | 游戏自定义量；**绝不参与结算裁决**，只作展示与风控输入；字符串先 NFC 归一化再比较 |

### 4.2 字节上限口径（唯一口径，禁止各处自行解释）

| 约束 | 值 | 作用对象 |
|---|---|---|
| `max_request_bytes` | 65536（64 KiB） | 整个 finish 请求体（服务端按 `Content-Length` 预检，超限 `413`，不解析） |
| `max_result_bytes` | 8192 | `result` 对象整体序列化后的**上限**（`/meta.limits` 暴露该值） |
| `extra` 序列化上限 | 6144 | `result.extra` 单独序列化后 ≤6144，为 `schema_version/score/metric/moves/ended_reason` 预留 ≥2048 字节 |

校验顺序：`Content-Length` → JSON 解析 → envelope 结构 → 字节上限（result 8192 / extra 6144）→ per-game `extra` schema（registry 声明）→ 数值边界 → 语义校验（如 `hbut_parking` 的 `ended_reason` 必须是 `cleared`）。任一步失败 → `SCHEMA_INVALID` + `REJECTED`（确定性），不进结算。

机读版：`docs/game-platform/schemas/result-envelope.schema.json`（JSON Schema 2020-12；字节上限不能由 Schema 表达，必须由服务端代码实现）。

### 4.3 示例 A —— 简单分数类（`hbut_stack`）

来源：`website/modules-src/hbut_stack/project/src/main.js:104-117`（Legacy：`score=state.score`、`maxLevel=state.layers`、`moveCount=state.layers`、`endedReason='lost'`、`extra.perfectCount/perfectCombo`）。`extra` 键名**原样保留**（camelCase），不做转换。

```json
{
  "schema_version": 1,
  "score": 1240,
  "metric": { "name": "layers", "value": 26 },
  "moves": 26,
  "ended_reason": "lost",
  "extra": { "perfectCount": 9, "perfectCombo": 4 }
}
```

### 4.4 示例 B —— 多指标类（`hbut_monopoly`）

来源：`website/modules-src/hbut_monopoly/project/src/main.js:254-272`（`score=computeRankScore(state)`、`maxLevel=(state.stageIndex||0)+1`、`moveCount=state.turn`、`extra={credits,influence,coins,energy,stress,stage,stageIndex}`）；分数公式 `credits*100 + influence*100 + max(0,coins)`（`project/src/game/monopoly.js:642-648`）。

```json
{
  "protocol_version": 1,
  "game_id": "hbut_monopoly",
  "run_id": "run_1758931500000_9f8e7d6c",
  "session_id": "sid_1a2b3c4d5e6f7081",
  "client_version": "1.4.12",
  "platform": "android",
  "runtime": "capacitor-local",
  "started_at": "2026-09-27T08:10:00.000Z",
  "finished_at": "2026-09-27T08:19:44.100Z",
  "duration_ms": 584100,
  "result": {
    "schema_version": 1,
    "score": 29150,
    "metric": { "name": "stage_index", "value": 2 },
    "moves": 47,
    "ended_reason": "lost",
    "extra": { "credits": 168, "influence": 123, "coins": 742, "energy": 4, "stress": 62, "stage": "毕业冲刺季" }
  }
}
```

> Legacy `max_level = stage_index + 1 = 3`，V2 `metric.value = 2`。该 −1 换算由 registry 声明一次、由兼容层执行一次（不允许两处各写一套）。

---

## 5. 统一错误码表

响应 envelope（V2）：

```json
{
  "success": false,
  "error": {
    "code": "RUN_ALREADY_FINISHED",
    "message": "该对局已提交过不同的结果",
    "retryable": false,
    "request_id": "req_01J8Z...",
    "details": { "first_finished_at": "2026-09-27T08:02:31Z" }
  }
}
```

- `message` 必须是**可直接展示的简体中文**（客户端不做二次映射）。
- `request_id` 必须存在；`details` 可选，只放非敏感结构化信息，**绝不回显 token**。
- `INTERNAL_ERROR` 的 `message` 是固定文案，**禁止**回显堆栈、异常文本、SQL、表名、内部标识。
- Legacy 通道保持 `{"success": false, "error": "文本"}` 形状不变（`game_rank.js:86,93-98` 按 `error` 文本与 `success===false` 双通道判断），**不得**把上面的对象塞进 Legacy 的 `error`。

下表与 `docs/game-platform/schemas/error-codes.json` 的 `code/http_status/retryable/description/client_action` **逐字一致**（#911 提供 diff 断言）：

| # | code | HTTP | retryable | description | client_action |
|---|---|---|---|---|---|
| 1 | `AUTH_REQUIRED` | 401 | false | 缺 Authorization: Bearer、token 为空或形状非法、Identity 校验链不可用（fail closed）。 | 触发一次 refreshAccessToken()；仍失败 → registry legacy_compatible=true 则走 Legacy 提交，否则 standalone（本地展示成绩、不上传）。 |
| 2 | `GAME_SESSION_EXPIRED` | 401 | false | Game Session 过期、已撤销、session_id 未知，或 session 绑定的 game_id 与请求不一致。 | 用宿主 Identity AT 重新换 ticket → session 后按幂等重试同一 run（run 状态不变）；两次失败则降级 compatibility/standalone，当前局按未结算处理。 |
| 3 | `TICKET_INVALID` | 401 | false | ticket 不存在、形状非法、已过期、签名不匹配，或绑定的 game_id 与请求不一致。 | 重新走授权流程签发新 ticket；不重试同一 ticket。 |
| 4 | `TICKET_USED` | 409 | false | ticket 已被兑换（重放或并发兑换），且其绑定的 session 已过期或已撤销。 | 若本地已持有有效 session 则复用；否则向宿主申请新 ticket。禁止再次提交同一 ticket。 |
| 5 | `RUN_ALREADY_FINISHED` | 409 | false | 同 run_id 已存在且 content_hash 不同、同 run_id 属于其他 game_id，或该 run 已被 REJECTED。content_hash 相同时服务端返回 200 幂等重放（idempotent_replay=true），不出现本码。 | 停止重试；本地结束该 run，重开新局（新 run_id）。 |
| 6 | `RUN_INVALID` | 400 | false | run_id 格式非法、run 不存在，或 run 不属于当前 session 绑定的 player。 | 新建 run（新 run_id）重试一次；再失败 → standalone。 |
| 7 | `REWARD_DISABLED` | 200 | false | 经济模块关闭（features.economy=false）；run 被接受但不发奖。默认以 settlement.reward_status=disabled 表达，仅当请求显式声明 require_rewards=true 时才以本码作为提示性结果返回。 | 正常展示分数；隐藏 XP / 湖工币 / 任务进度 UI，标注「本轮不计奖励」；不得重试期望拿到奖励。 |
| 8 | `GAME_DISABLED` | 404 | false | game_id 未在 registry 登记，或 registry status=disabled（如 hugongda_escape，website/modules-src/hugongda_escape/module.json:10）。 | 隐藏入口、不提交；已打开的 run 丢弃并本地提示。 |
| 9 | `RATE_LIMITED` | 429 | true | 超出 IP / 账号 / 游戏维度限流窗口；限流状态为进程内实现（部署约束见 protocol-v1.md §11）。 | 指数退避（1200/2600/5200ms，最多 3 次）；仍失败 → 保留 pending payload，UI 提供手动重试。 |
| 10 | `FEATURE_DISABLED` | 403 | false | /api/game-platform/v1/* 整体关闭（env flag，默认关闭灰度）。 | 回退 Legacy /api/game-rank/*（若 legacy_compatible=true），否则 standalone；不重试。 |
| 11 | `LEGACY_ONLY` | 409 | false | 该 game_id 未登记 V2（registry 无条目，或 status=legacy_only）。 | 走 Legacy 提交路径；不重试 V2；上报「游戏待迁移」埋点。 |
| 12 | `INTERNAL_ERROR` | 500 | true | 未捕获异常、DB 或依赖短暂不可用；响应体不得包含堆栈、异常文本、SQL、表名或任何内部标识。 | 退避重试（最多 3 次）+ 保留 pending；仍失败 → Legacy 兜底或本地暂存。 |
| 13 | `PROTOCOL_VERSION_UNSUPPORTED` | 400 | false | protocol_version 超出服务端支持区间 [min,max]。 | 不重试；降级 Legacy/standalone；提示升级客户端。 |
| 14 | `CLIENT_VERSION_TOO_OLD` | 426 | false | client_version 低于 registry 的 min_client_version（软门禁；client_version 可伪造，不得作为安全边界）。 | 提示升级；降级 Legacy/standalone。 |
| 15 | `SCHEMA_INVALID` | 400 | false | result envelope、per-game extra、数值边界或语义校验失败；或请求含非 actor 类的服务端权威字段（xp_amount / coin_amount / reward / reward_amount / season_id / trust_level / settled_at / server_received_at）。 | 结束本地 run（不重试同 run）；上报诊断信息；不产生结算。 |
| 16 | `IDEMPOTENCY_CONFLICT` | 409 | false | idempotency_key 被复用但请求内容摘要不同（ticket/session 签发接口）。 | 生成新的 key（新 run / 新 ticket）；绝不用旧 key 猜测既有结果。 |
| 17 | `FORBIDDEN_ACTOR` | 403 | false | body/query 出现 actor 字段（student_id / player_id / user_id），或 actor 与 principal 不匹配，或 run_id 属他人。 | 立即停止重试；记录安全事件；客户端移除该字段后才允许恢复。 |

覆盖校验：17 个错误码 ⊇ #901 要求的 12 个（`AUTH_REQUIRED` / `GAME_SESSION_EXPIRED` / `TICKET_INVALID` / `TICKET_USED` / `RUN_ALREADY_FINISHED` / `RUN_INVALID` / `REWARD_DISABLED` / `GAME_DISABLED` / `RATE_LIMITED` / `FEATURE_DISABLED` / `LEGACY_ONLY` / `INTERNAL_ERROR`）+ 5 个补充码。

---

## 6. 认证与信任链路（P1 决策章节）

### 6.1 现状事实（全部带证据）

| 事实 | 证据 |
|---|---|
| Access Token 是 **opaque 字符串**：`createIdentityProvider` 未配置任何 token format（既无顶层 `formats`，也无 `resourceIndicators.getResourceServerInfo`） | `identity-platform/core/src/oidc/provider.ts:139-233`；`provider.ts:182-184` 注释列明 introspection / resourceIndicators 等未开放 |
| oidc-provider 版本 **9.11.3**（纯 JS 包，无官方类型；仓库内自维护声明） | `identity-platform/core/package.json:24`；本地声明文件 `identity-platform/core/src/oidc/oidc-provider.d.ts:126-157`（`ProviderConfiguration` 有 `[key: string]: unknown` 兜底，新增配置项无需改类型即可通过） |
| **format 是按 Resource Server 逐 token 决定的**，不存在"全局 `formats.AccessToken='jwt'`"开关：`AccessTokenFormat = token.resourceServer?.accessTokenFormat ?? 'opaque'` | 依赖包源码（不在 worktree，需 `pnpm install` 后核验）：`identity-platform/core/node_modules/oidc-provider/lib/models/mixins/has_format.js:5-7`、`lib/helpers/resource_server.js:7`、`lib/models/formats/dynamic.js:6-12` |
| JWT AT **必须带 audience**，否则签发直接抛错（不是降级） | `node_modules/oidc-provider/lib/models/formats/jwt.js:145-147` |
| 自定义 claim 的官方配置键是 **`extraTokenClaims(ctx, token)`**（默认实现 + 注册处），它对 opaque 的 `AccessToken`/`ClientCredentials` 生效；JWT 复用同一 payload（`...extra` 展开），因此该键**同时适用于 opaque 与 JWT AT** | `node_modules/oidc-provider/lib/helpers/defaults.js:304,2866`；`lib/models/formats/opaque.js:41`；`lib/models/formats/jwt.js:97-115` |
| `features.resourceIndicators.enabled` 默认为 `true`，但未提供 `getResourceServerInfo` 时**任何带 resource 参数的请求都会 100% 抛错**（mustChange） | `node_modules/oidc-provider/lib/helpers/defaults.js:2237-2238`、`:296-300` |
| AT TTL 3600s；RefreshToken/Grant 30 天；AuthCode 60s | `identity-platform/core/src/oidc/provider.ts:103-109,191-198` |
| scope 白名单 6 项，两处硬编码必须同步 | `provider.ts:40-43` 与 `identity-platform/core/src/domain/clients.ts:38-41` |
| `hbut_student_id` 只在 userinfo 返回，绝不进 ID Token；依赖 scope `student.identity` | `identity-platform/core/src/oidc/account.ts:96-103`、`provider.ts:62-67` |
| pairwise `sub` = HMAC(sector‖0x00‖user_id)，密钥缺失 fail closed | `provider.ts:205-212` |
| ocr-service 已有完整 RS256/JWKS 验签模块，**当前是死代码**：`token_shape()` 对无点/单点形状返回 `unknown`/`legacy`，opaque AT → `unknown` → 直接 `malformed` 401 | `ocr-service/identity_auth/validator.py:60-67,124-128`；`identity_auth/dependencies.py:141-142` |
| **`LEGACY_GRACE` 只保护 2 段（legacy HMAC）形状**，不保护 opaque AT：opaque 无点 → `unknown` → 永远 401（与 grace 无关） | `identity_auth/dependencies.py:94-99,120-142`；`validator.py:60-67` |
| 现成能力：iss/aud/scope/alg 白名单/禁 `jku/jwk/x5u/x5c`/JWKS 缓存与 max_stale/双轨不降级/6 个灰度指标 | `identity_auth/validator.py:102-120`、`identity_auth/jwks.py`、`identity_auth/dependencies.py:48-161`、`identity_auth/metrics.py:1-30` |
| 配置与开关（默认全关）：settings dataclass 与 env loader；**时钟容忍默认 30s** | `identity_auth/config.py:78-145`（`clock_skew_seconds: int = 30` 见 `:103`，env `MINI_HBUT_IDENTITY_CLOCK_SKEW_SECONDS` 默认 30 见 `:143`）；`ocr-service/docs/identity_auth_rollout.md:8-36` |
| 模块规模：**7 个 `.py`**（含 `__init__.py`），合计 946 行 | `ocr-service/identity_auth/`（claims/config/dependencies/jwks/metrics/validator/`__init__`） |
| 生产开启 scope/aud 的前置条件（Core 未注册前配置 aud 会 100% 拒绝） | `ocr-service/docs/identity_auth_rollout.md:22-36` |
| 客户端 `setIdentityAccessTokenProvider` 尚无生产注入 | `apps/client/src/utils/identity_access_token.ts:14-30` |
| 宿主 resume 时**强制 remount iframe**（会重放 URL 里的 ticket） | `apps/client/src/components/MoreModuleHostView.vue:377-379`（注释 + `reloadFrame()`）；`onMounted` 事件绑定见 `:381-385` |
| Forum / Cloud Sync 已接入 `DualTrackAuthenticator`，改动不得破坏 | `runtime/entrypoint.py:4267-4278`；`identity_auth/dependencies.py:48-161` |
| 部署为 uvicorn **单进程**（限流/缓存为进程内实现的依据） | `ocr-service/Dockerfile:27`（`CMD ["uvicorn", "runtime.entrypoint:app", ...]`，无 `--workers`） |

### 6.2 目标信任链路

```text
[App 宿主 / MoreView]                     [游戏 iframe / SDK]                [ocr-service]
   │ 1. 取 Identity AT（内存，不落盘）        │                                │
   │    apps/client/src/utils/identity_access_token.ts                          │
   │ 2. POST /tickets  Bearer <AT> ──────────┼───────────────────────────────>│ 验签 AT → principal
   │ <── {ticket, expires_at} ───────────────┤                                │ 签发 ticket（一次性）
   │ 3. ticket 经 iframe URL query 传入 ─────>│                                │
   │                                          │ 4. POST /sessions {ticket, game_id}
   │                                          │ <── {session_id, session_token, expires_at}
   │                                          │ 5. runs/finish: Bearer <GS token>
   │                                          │ 6. actor = session.player_id（唯一来源）
```

#### 6.2.1 签发、原子兑换与撤销（可落 SQL）

- **签发 ticket**（`POST /tickets`，需 Bearer Identity AT）：
  - actor = `principal.hbut_student_id`（唯一来源）；
  - `ticket = "gpt_" + base64url(CSPRNG(32 bytes))`（256 bit 熵，满足 ≥128bit）；
  - 入库只存 `ticket_hash = HMAC-SHA256(TICKET_HASH_KEY, ticket)`，**明文不落库、不回显给第三方**；
  - `ttl ∈ [60, 120]` 秒（配置 `ticket_ttl_seconds`，上限写死 120）；`bound_game_id`、`player_id`、`issued_at`、`used_at NULL`。
- **兑换 session**（`POST /sessions`，body `{ticket, game_id}`）——**原子裁决，禁止 TOCTOU**：

```sql
-- 单条条件 UPDATE 即裁决：affected_rows=1 才继续签发
UPDATE game_platform_tickets
   SET used_at = UTC_TIMESTAMP(), session_id = :new_session_id
 WHERE ticket_hash = :ticket_hash
   AND used_at IS NULL
   AND expires_at > UTC_TIMESTAMP();
-- affected_rows = 1  → 同一事务内插入 sessions 行，返回 {session_id, session_token, expires_at}
-- affected_rows = 0  → 再读一次状态区分原因：
--     used_at IS NOT NULL → 409 TICKET_USED
--     expires_at <= now   → 401 TICKET_INVALID
--     行不存在            → 401 TICKET_INVALID
```

  - 明文写入禁止："先 `SELECT` 判断再 `UPDATE`"（TOCTOU）**一律视为实现缺陷**，code review 直接打回；与 §3.4 的 settlement 裁决写法同构。
  - 并发兑换同一 ticket：只有一个事务 `affected_rows=1`，其余按上面分支返回（不会产生两个 session）。
  - 会话绑定：`sessions.player_id` = ticket 的 `player_id`；`sessions.game_id` = ticket 的 `bound_game_id`（**不接受请求体覆盖**）；`sessions.session_id` 与 `token` 分离。
  - `session_token = "gs_" + base64url(CSPRNG(32 bytes))`；入库只存 `token_hash = HMAC-SHA256(SESSION_HASH_KEY, token)`；明文只在兑换响应出现一次，此后任何查询/列表**不得回显 token**。
  - 密钥缺失（`TICKET_HASH_KEY` / `SESSION_HASH_KEY` 未配置）→ **启动失败**（fail closed，与 `assertCookieKeys` 的既有风格一致，`provider.ts:112-116`）。
  - 比较必须用常量时间函数（Python `hmac.compare_digest`）；禁止 `==` 比较摘要。
- **撤销**：见 §6.6（校验点 / 延迟上界 / 范围）。

#### 6.2.2 exchange 幂等与重放语义（P1）

- **同一 ticket 在 session TTL 内重复兑换**：
  - 若该 ticket 已 `used_at` 且其绑定 session **未过期未撤销** → **返回同一 session**（HTTP 200，`replayed_session: true`，**重新返回一次该 session 的 token**；token 明文因此可在该窗口内被重复领取——这是为 WebView 恢复付出的必要代价，窗口 ≤ session TTL 且必须绑定同一 player）；
  - 若已 `used_at` 且绑定 session 已过期/已撤销 → `409 TICKET_USED`（宿主必须签发新 ticket）；
  - 未使用且未过期 → 正常兑换（`affected_rows=1`）；
  - 未使用但已过期 → `401 TICKET_INVALID`。
- 因此**不存在"一个 ticket 换出两个不同 session"**的情形；`sessions.ticket_hash` 上加唯一键（`UNIQUE(ticket_hash)`）作为第二道保险。
- 上述幂等由 ticket/session 自身状态保证；**调用方的重放识别**（`idempotency_key`）规则见 §6.2.4。

#### 6.2.3 WebView 恢复 / 刷新导致的重复兑换（P1）

宿主在 resume 时会 remount iframe（`apps/client/src/components/MoreModuleHostView.vue:377-379`），iframe URL 里的 ticket 会被**重放**。规则：

| 项 | 规定 |
|---|---|
| session token 持久化边界 | **仅内存**：SDK 内模块级变量；禁止写 `localStorage` / `sessionStorage` / IndexedDB / cookie；禁止上报到宿主 postMessage |
| ticket 读取后清理 | SDK 在首次读取 ticket 后立即 `history.replaceState` 清除 URL 中的 `gpt`/`ticket` 参数（纵深防御；§10） |
| 恢复策略 A（主） | 宿主在 resume 路径（`MoreModuleHostView.vue:377-379` 的 remount 分支）**重新申请 ticket 并更新 iframe URL**，游戏重新兑换；旧 ticket 是否已兑换都不阻塞 |
| 恢复策略 B（兜底，必须实现） | 依赖 §6.2.2 的 exchange 幂等：重放同一 ticket 在 session TTL 内返回同一 session |
| 两策略关系 | A 解决"URL 需要新凭据"，B 解决"并发/重试/竞态"；**二者都必须有**，不允许"只做幂等就不更新 URL" |
| 失败降级 | 两种策略都失败（如 Identity 不可用）→ SDK 落 `standalone`：游戏可玩、成绩本地展示、不发奖励、不进榜 |

#### 6.2.4 `idempotency_key`、token 熵、限流与探测防护（P1）

**`idempotency_key` 规则**（仅 ticket/session 签发端点）：

| 项 | 规定 |
|---|---|
| 传输位置 | 请求头 `Idempotency-Key`（首选）；或 body `idempotency_key`。两者同时存在且不同 → `400 SCHEMA_INVALID` |
| 格式 | `^[A-Za-z0-9_-]{16,128}$`（建议 UUIDv4 或 128bit CSPRNG hex） |
| 作用域 | `(endpoint, player_id, game_id, idempotency_key)` 唯一（`player_id` 来自 principal，绝不来自 body） |
| 存储 | `idempotency_records(endpoint, player_id, game_id, idempotency_key, request_hash, response_status, response_json, created_at, expires_at)`，TTL 24h |
| 同 key + 同 `request_hash` | 返回首次响应（原状态码 + `idempotent_replay: true`），**不重复签发**（不产生第二个 ticket/session） |
| 同 key + 不同 `request_hash` | `409 IDEMPOTENCY_CONFLICT` |

`runs` / `finish` **不使用**该头（它们用 `run_id` 自身作为幂等键，见 §3.3）；出现该头时忽略并记录指标。

**token 熵与摘要**：

- 熵与格式：ticket `gpt_` + CSPRNG 32 字节；GS token `gs_` + CSPRNG 32 字节；`session_id` `sid_` + 16 字节 hex（公开标识，与 token 分离）。
- 摘要：`HMAC-SHA256(<KEY>, token)`；禁止明文/可逆加密存储；禁止把 token 写进 URL 之外的任何持久化载体。

**限流与探测防护**：

- `/sessions` 与 `/tickets` 双向限流（进程内滑动窗口，与既有 `_allow_game_rank_request` 范式一致）：
  - `/sessions`：IP 维度 30 次/分钟、player 维度 10 次/分钟、game 维度 60 次/分钟；
  - `/tickets`：player 维度 10 次/分钟、IP 维度 60 次/分钟；
  - 命中 → `429 RATE_LIMITED`（`Retry-After` 头）。
- 存在性探测：`TICKET_INVALID` 与 `TICKET_USED` 的状态码必须可区分（客户端修复路径不同），因此**不靠"合并错误码"防探测**，而靠：① 256 bit 熵（枚举不可行）；② 上述限流；③ 两者 `message` 使用统一文案（"凭据无效或已失效"），细节只进服务端日志（`details.reason` 不下发）。
- 兑换响应**必须**包含 `X-Content-Type-Options: nosniff`、`Cache-Control: no-store`（防中间层缓存 token）。

### 6.3 P1：Access Token 可验证化方案（三候选完整对比）

#### 候选 (a) 启用 oidc-provider `introspection`，资源服务器调它验证 opaque AT

- 改动量：**大**。Core：启用 `features.introspection` + 注册 introspection 路由 + 端点调用方鉴权（introspection 必须要求 confidential client 认证）+ 生产部署。资源服务器：新增 introspection 客户端（HTTP + 缓存 + 指标），并扩展 `DualTrackAuthenticator` 的形状分支（当前 `unknown` 形状直接判非法，`identity_auth/dependencies.py:141-142`）——这是对既有 Forum/Cloud Sync 认证路径的**结构性改动**。
- 每请求成本：**一次跨服务 HTTPS 往返**（HF Space → Vercel），除非加进程内缓存；缓存 TTL 决定撤销延迟。
- 撤销能力：**最好**（`active:false` 立即反映 refresh 撤销/登出，受缓存 TTL 限制）。
- 与现有 `identity_auth` 复用度：**低**（JWT 验签与 JWKS 全部用不上；可复用 `claims.py` 映射与 `metrics.py`）。
- 对 Forum / Cloud Sync 影响：**中高**（形状判定要放行 opaque identity token，任何疏漏都可能让 legacy 误放行或新 token 被 401）。
- 安全边界：introspection 端点必须要求 client 认证（否则成为 token 有效性预言机）；资源服务器只允许调**配置写死的** `{issuer}/oauth/introspect`（https 强制、与 issuer 同源，防 SSRF）；同 token 并发请求 single-flight + 缓存 + 限流（防放大）；只消费 `active/sub/scope/exp/aud/client_id`。
- 失败模式：Identity 不可用 → 无法验证任何 AT → fail closed 401（游戏降级 Legacy/standalone；Forum/Cloud Sync 若已切新轨也 401）。**级联风险最高**。

#### 候选 (b) Identity Core 改发 JWT access token（推荐）

> **实现机制必须写对**（依据 9.11.3 源码）：**不是** `formats.AccessToken='jwt'`（该配置项在 9.11.3 不存在），而是 **Resource-Server 级**开关 + 官方 claim 注入钩子：
> 1. 启用 `features.resourceIndicators.getResourceServerInfo`（默认 `enabled:true` 但未提供该函数，任何带 `resource` 参数的请求会直接抛错：`defaults.js:2237-2238,296-300`）；
> 2. 在该函数返回的 Resource Server 描述里声明 `{ audience, scope, accessTokenFormat: 'jwt', accessTokenTTL?, jwt? }`（`resource_server.js:7` + `has_format.js:5-7`：format 按 **token 所属 resource server** 逐 token 决定）；
> 3. 用 **`extraTokenClaims(ctx, token)`** 注入 `hbut_student_id` 等受控 claim（`defaults.js:304,2866`；opaque 侧生效于 `opaque.js:41`，JWT 侧经 `jwt.js:97-115` 的 `...extra` 展开**同样生效**）；
> 4. JWT AT 必须带 `aud`，否则签发抛错（`jwt.js:145-147`）——所以 audience/resource 落地是**硬前提**，不是优化项。

- 改动量：**中**，且集中 Core；资源服务器**零改动**即可用既有 JWT 通道（前提：`MINI_HBUT_IDENTITY_ENABLED=true`、`AUDIENCE` 与 Core 实际 `aud` 一致、`SCOPES` 配置到位）。
- 每请求成本：**最低**（JWKS 本地缓存 TTL 300s / max_stale 3600s + PyJWT 本地验签，无跨服务调用）。
- 撤销能力：**弱**（AT TTL 3600s 内不可即时撤销）→ 由 Launch Ticket（60–120s 一次性）+ Game Session（≤1800s，可撤销，§6.6）代偿。
- 与现有 `identity_auth` 复用度：**最高**（946 行现成代码的假定形态变为真实形态）。
- 对 Forum / Cloud Sync 影响：**低**（重要修正）：format 是**按 resource server 逐 token** 决定的，只有请求了该 resource 的授权才会拿到 JWT AT；既有未使用 resource indicator 的授权继续拿到 opaque AT，行为不变。风险仅剩：① 新增配置必须正确（否则带 resource 的请求抛错）；② `hbut_student_id` 进入 AT 的方案必须按 audience/client 限定注入范围（见下"硬性前提 1"）。
- 安全边界：唯一出网依赖是 JWKS（已有缓存 + max_stale + fail closed，`validator.py:133-136`）；无新增入站端点、无 token 预言机、无 SSRF 面。
- 失败模式：JWKS 不可用且缓存超 max_stale → 401（仅影响新 token 验签；Legacy 通道与既有 opaque AT 不受影响，因为 opaque AT 从不进 JWT 验签路径）。

#### 候选 (c) 资源服务器调 `/oauth/userinfo` 验证 token 并取 claims

- 改动量：**小**（不改 Core），但要新增每请求 HTTP 调用 + 缓存 + 错误映射。
- 每请求成本：**高**（userinfo 语义是"取用户信息"，不是 token 验真端点）。
- 撤销能力：即时（无缓存时），代价是 Identity 成为每请求强依赖。
- 与现有 `identity_auth` 复用度：**低**（`claims.py` 可复用，验签语义全丢）。
- **致命缺陷**：userinfo **不返回 token 的 `aud`**（也不返回完整 scope 边界），资源服务器**无法校验 audience** → 任何第一方应用的 AT 都能换取 `hbut_student_id` 并冒用为游戏 principal；这与现有"aud 精确匹配"设计（`validator.py:138-146`；rollout §1 的 audience 前置条件）直接冲突。
- 失败模式：Identity 不可用 → 全链路 401（无本地兜底），且对 userinfo 形成每请求放大。
- 结论：**不推荐**；除非 (a)(b) 均被否决且用户明确接受 audience 校验缺失。

#### 对比总表

| 维度 | (a) introspection | (b) resource-scoped JWT AT | (c) userinfo |
|---|---|---|---|
| 实现改动量 | 大（Core + 资源服务器 + 双轨形状分支） | 中（Core 单点；资源服务器零改动） | 小（资源服务器新增调用） |
| 每请求成本 | 跨服务往返 + 缓存 | 本地验签（JWKS 缓存） | 跨服务往返 + 缓存 |
| 撤销能力 | 强（≤缓存 TTL） | 弱（AT TTL 内）→ 由 ticket/session 代偿 | 强（无缓存时） |
| `identity_auth` 复用度 | 低 | **最高（直接生效）** | 低 |
| 对既有 Forum/Cloud Sync 回归面 | 中高（形状判定改造） | **低（format 按 resource 逐 token，未请求 resource 者不变）** | 低（不改 provider） |
| audience / scope 强校验 | 可 | 可（PyJWT 原生） | **不可** |
| 新增攻击面 | introspection 端点（预言机/放大/SSRF） | 无新增入站端点 | userinfo 被当验真端点 + 每请求放大 |
| Identity 故障影响 | 认证全链路 | 仅新 token 验签（缓存兜底） | 认证全链路（无本地兜底） |
| 生产变更 | Vercel 部署 + 新 confidential client | Vercel 部署（resource indicator 配置） | 无 |

### 6.4 推荐方案与理由

> **推荐 (b)：在 `getResourceServerInfo` 中声明 `accessTokenFormat: 'jwt'` + 用 `extraTokenClaims(ctx, token)` 注入受控 claim，撤销语义交给 Launch Ticket + Game Session。**

3 条关键理由：

1. **复用度最高、新增攻击面最小**：`identity_auth/`（7 个 `.py`，946 行）的 RS256/JWKS 验签 + 双轨 + 指标零改动即生效；(a) 要新增跨服务调用 + 缓存 + 形状分支，(c) 无法校验 audience（安全硬伤）。
2. **游戏链路的撤销需求已由 Ticket/Session 覆盖**：真正暴露在外的是 Game Session（≤1800s、可撤销、每次请求校验，§6.6），Launch Ticket 更是一次性 + 60–120s；AT 层面的"1 小时不可即时撤销"在游戏链路上的边际风险，远小于 (a) 引入的"Identity 每请求强依赖 + 级联故障"。
3. **改动集中在 Core 一处，且既有链路默认不受影响**：format 按 resource server 逐 token 生效，未请求 resource 的既有授权仍是 opaque AT；Forum / Cloud Sync 不需要任何改动即可继续工作。

配套硬性前提（缺一不可，#902a 验收逐条）：

1. **学号 claim 只对第一方注入**：`extraTokenClaims(ctx, token)` 内必须按 `ctx`/token 的 client（与 audience）判定，第三方 client 的 AT 不得含 `hbut_student_id`（守住 `account.ts` 的信任边界 10）。
2. **audience 必须是 `mini-hbut-hf-api`**（`identity_auth/config.py:DEFAULT_HF_AUDIENCE`）且 resource indicator 落地；在此之前保持 `MINI_HBUT_IDENTITY_AUDIENCE` 为空（rollout §1：Core 未支持前配置 aud 会 100% 拒绝）。JWT AT 无 aud 会**直接抛错**（`jwt.js:145-147`），因此这两件事必须同一批次完成。
3. **`game.play` 等新 scope 走 5–6 处同步点**：`identity-platform/core/src/oidc/provider.ts:40-43`、`identity-platform/core/src/domain/clients.ts:38-41`、DB CHECK migration（沿用 `0006_data_scopes_check.sql` 范式）、`identity-platform/web/lib/developer/scopes.ts`、`apps/client/src/features/identity/identityScopes.ts`。
4. **对 `LEGACY_GRACE` 的正确预期**：它只保护 2 段 legacy HMAC 形状（`dependencies.py:120-142`），**不保护** opaque AT（无点 → `unknown` → 401）。所以灰度期不要指望 grace 兜住"AT 形态切换"；真正兜底是"未请求 resource 的授权继续 opaque + 客户端 401 后一次 refresh 换取新 AT + Legacy 游戏走 `/api/game-rank/*`"。
5. **Vercel 生产部署是生产变更**：代码可先合并，部署必须单独获得用户确认。

### 6.5 若用户选择非推荐方案：需要改动的章节清单

| 若最终选择 | 需改章节 | 具体改动 |
|---|---|---|
| **(a) introspection** | §6.1（新增 introspection 事实）、§6.4、§6.6、§8? 否、§12 | ① 新增 Core 配置与 confidential RS client；② 资源服务器新增 `identity_auth/introspection.py` + 缓存指标；③ `DualTrackAuthenticator` 形状分支规则同步进 `trust-model.md` §2；④ `compatibility.md` §4 的 Stage C 增补"introspection 端点上线 + 鉴权验证"；⑤ 错误码新增 `AUTH_SERVICE_UNAVAILABLE`（503，retryable=true） |
| **(b) 推荐** | 无需改动（本文即契约） | — |
| **(c) userinfo** | §6.1、§6.3(c)、§6.4、§6.6、§12；`trust-model.md` §2 | ① 明确接受"无法校验 audience"并写入禁止项；② 新增 `AUTH_SERVICE_UNAVAILABLE`（503）；③ 需额外设计"防第三方 scope 混用"的补偿控制（当前 userinfo 不返回 client 信息，做不到，必须在文档中记为已知风险） |
| 任何方案 | `compatibility.md` §4 | Stage C 的"就绪判定"随方案调整；客户端 token provider 接入点不变 |

### 6.6 Session 校验点、撤销范围与延迟上界（P1）

| 项 | 规定 |
|---|---|
| 每请求校验 | 所有 `runs`/`finish`/`matches` 请求：取 `Authorization: Bearer <gs_...>` → `token_hash = HMAC-SHA256(SESSION_HASH_KEY, token)` → 查 `game_sessions` 校验 `expires_at > now` 且 `revoked_at IS NULL`，并取出 `player_id` / `game_id`（actor 与 game 的唯一来源） |
| 缓存（可选优化） | 允许进程内 LRU 缓存 `token_hash → (player_id, game_id, expires_at, revoked_at)`，**TTL 写死上限 30s**（常量 `SESSION_REVOKE_CACHE_MAX_TTL_SECONDS = 30`，不可配置调大）；缓存命中不等于跳过绑定校验 |
| 撤销延迟上界 | 不启用缓存：**0**（下一次请求即失效）；启用缓存：**≤30s**。任何撤销动作必须同时递增进程内 `sessions_epoch` 使缓存立即失效（单进程部署成立，`Dockerfile:27`）；多副本部署时退化为"撤销写库 + 缓存 TTL ≤30s 兜底" |
| 撤销范围 | ① 客户端主动退出/`end_session`：该 `player_id` 的**全部活跃 session** 置 `revoked_at`；② 改密/改绑：同上；③ 管理封禁：同上；④ 单设备登出（未来）：`session_id` 粒度 |
| 撤销与已结算资产 | 撤销**不回滚**已 `SETTLED` 的 run 与已写账本（§8 不可变），只影响后续请求 |
| 失败模式 | 校验所需的 DB 不可用 → `500 INTERNAL_ERROR`（**不**退化为"无 session 放行"，也不降级到 body actor）；session 表无行 → `401 GAME_SESSION_EXPIRED` |
| 硬约束 | ① JWT 形状 token 验签失败绝不按 legacy 放行（`dependencies.py:95-118` 的既有安全区分）；② GS token 无效绝不回退到"匿名 + body student_id"；③ `game_id` 必须等于 session 绑定值（不一致 → `401 GAME_SESSION_EXPIRED`，run 状态不变，§3.2 T3 ②）；④ `run.player_id` 必须等于 session 的 `player_id`（否则 `403 FORBIDDEN_ACTOR`） |
| 限流分层 | ① IP/账号级（既有范式）；② ticket 维度（每 player 每 game 每分钟 ≤N）；③ session 维度 finish 次数上限（命中 → `QUARANTINED`）；④ `/sessions` 与 `/tickets` 见 §6.2.4 |
| 安全测试（#902 验收） | ticket 重放/过期/跨 game 交换全部安全失败；并发兑换同一 ticket 只有一次成功；伪造 `student_id` 无效；浏览器直连无法伪造 verified session；session 跨游戏不可复用；logout 后旧 session 失效（≤30s 上界留证）；Legacy 游戏走原无认证模式不受影响 |

---

## 7. `platform` 与 `runtime` 字段语义

现状基线（平台判定唯一来源）：`apps/client/src/platform/runtime.ts:78-113`（`detectRuntime()` 返回 `tauri|capacitor|web`；`isIOSLike()`/`isAndroidLike()`/`isDesktopLike()`）；宿主把加载模式写入 URL（`apps/client/src/components/MoreView.vue:306-313`，`loadMode` 见 `:337`）；游戏侧读取 URL 的 `runtime`（`website/modules-src/hbut_stack/project/src/utils/game_rank.js:170`，缺省 `module-web`）；宿主把 `runtime` 作为 query 传给游戏（`MoreView.vue:224-244`，函数默认值 `module-host`）。

### 7.1 `runtime` 取值定义

| 取值 | 定义 | 判定依据（客户端） | 现状映射 |
|---|---|---|---|
| `tauri-local` | 桌面 Tauri 本地包内运行 | `detectRuntime()==='tauri'` 且加载模式为 tauri-local | `MoreView.vue:310-313` |
| `capacitor-local` | iOS / Android Capacitor 本地包内运行 | `detectRuntime()==='capacitor'` | `MoreView.vue:308-309` |
| `remote-site` | 宿主 iframe 加载远端站点（CDN 模块） | 加载模式为 remote-site | `MoreView.vue:312-313,337` |
| `module-web` | 游戏源码缺省值（独立打开/未注入 runtime） | 游戏侧兜底 | `game_rank.js:170` |
| `unknown` | 无法识别（含宿主历史值 `module-host`） | 服务端 normalize 失败 | `MoreView.vue:229`（原值记 `runtime_raw`） |

**注**：Android 上 Tauri 会显式拦截 loopback（`invalid_reason='tauri-bridge-blocked'`，`MoreView.vue:331-336`），因此 Android 不会出现 `tauri-local`。

### 7.2 `platform` 取值定义

| 取值 | 定义 | 判定依据 | 说明 |
|---|---|---|---|
| `ios` | iOS / iPadOS（含 iPadOS 桌面伪装 `MacIntel + maxTouchPoints>1`） | `isIOSLike()`（`runtime.ts:88-97`） | Capacitor 包内或 Safari |
| `android` | Android（Capacitor WebView 或 Chrome） | `isAndroidLike()`（`runtime.ts:100-106`） | 同上 |
| `web` | 桌面/移动浏览器 | `detectRuntime()==='web'` | 桌面 Tauri 不判为 `web` |
| `windows` / `macos` / `linux` | 桌面 Tauri | Tauri 侧报告的 OS（#902b 提供） | 不得用 UA 猜 |
| `unknown` | 无法判定 | 兜底 | 原值记 `platform_raw` |

### 7.3 服务端处理规则

- 归一化失败 → `unknown` + 保存 `_raw`；**不得**因未知取值拒绝请求。
- `platform` / `runtime` **绝不**用于鉴权、信任级别、奖励数量、排行榜分桶的"安全"用途；只用于分端统计、灰度分流、风控输入。
- Legacy 侧保持自由文本原样写旧表（冻结契约），归一化结果只写 V2 表。

---

## 8. 钱包账本与 escrow 语义（冻结，影响 #909 / #910）

> 本章只冻结**结构与不变式**；**具体奖励数值规则（XP/湖工币公式、等级曲线、日限额度、赛季规则）由 #909 定义**，并以 `rule_version` 版本化。

### 8.1 ledger 不变式

1. **不可变**：`wallet_ledger` 只允许 `INSERT`；`UPDATE`/`DELETE` 一律禁止（#903 用 DB 权限或触发器保证）。纠错 = 追加反向行（`entry_type='admin_adjust'`），审计链完整。
2. **余额可推导**：`wallet_accounts.balance_*` 必须等于该 player 的 ledger 汇总（#909 提供对账脚本；断连注入测试见 #903 验收）。
3. **同事务**：余额变更与 ledger 插入同一事务，禁止先改余额后补账本。
4. **幂等**：`UNIQUE(player_id, idempotency_key)`；同 key 重复插入 → 读取既有行并跳过副作用（不报错、不重复加减）。
5. **actor**：`player_id` 只来自 principal/session（`trust-model.md` §3）。

### 8.2 `entry_type` 枚举（冻结）

| 值 | 语义 | 涉及 wallet |
|---|---|---|
| `reward` | 游戏结算基础奖励 | XP / coin |
| `quest_reward` | 每日任务奖励 | XP / coin |
| `season_reward` | 赛季结算奖励 | XP / coin |
| `escrow_hold` | 发布漂流瓶冻结（扣减可用余额） | coin |
| `escrow_release` | 领取成功：冻结转给领取者 | coin |
| `escrow_refund` | 过期/取消：冻结退回发布者 | coin |
| `penalty` | 违规扣减 | XP / coin |
| `admin_adjust` | 人工纠错（必须带操作人与工单） | XP / coin |

### 8.3 `reason_code` 枚举（冻结）

`run_settled` / `daily_cap_applied` / `reward_disabled` / `bottle_create` / `bottle_claim` / `bottle_expired` / `bottle_self_claim_rejected` / `season_finalized` / `admin_manual`。

`reason_code` 只描述"为什么"，**不携带数量**；数量由 #909 的规则与 `rule_version` 决定。

### 8.4 幂等键命名空间（冻结，全文统一）

| 命名空间 | 格式 | 唯一裁决对象 |
|---|---|---|
| 结算 | `settle:{game_id}:{run_id}` | 一个 run 只发一次奖 |
| 发布冻结 | `escrow:{bottle_id}` | 一个瓶子只冻结一次 |
| 领取转账 | `release:{bottle_id}` | 一个瓶子只被领取一次 |
| 过期退款 | `refund:{bottle_id}` | 一个瓶子只退款一次 |
| 每日任务 | `daily:{player_id}:{game_id}:{progress_date}` | 每日进度只推进一次 |
| 任务奖励 | `quest:{player_id}:{quest_id}:{progress_date}` | 单个任务奖励只发一次 |
| 赛季 | `season:{player_id}:{season_id}` | 赛季奖励只发一次 |

（`settle:` 前缀在 §3.4 已统一，`trust-model.md` 与本文不再出现其它写法。）

### 8.5 escrow 状态机（#910 直接落库）

```
held ──claim──> claimed            （领取成功，release:{bottle_id} 入账给领取者）
  │
  └──expire──> expired ──refund──> refunded（refund:{bottle_id} 退回发布者）
```

- 唯一裁决键：`escrows.bottle_id` UNIQUE + **条件 UPDATE**（`WHERE bottle_id=? AND status='held'`，`affected_rows=1` 才继续），禁止 TOCTOU（与 §3.4/§6.2.1 同构）。
- 并发领取：只有一个事务拿到 `held → claimed`；其余返回"已被领取"（不产生第二条 `release:`）。
- 过期退款：`held` 且 `expires_at <= now` → `expired` → `refunded`；退款与状态迁移同事务。
- 自领拒绝：`claimer_player_id == owner_player_id` → 拒绝 + `reason_code=bottle_self_claim_rejected`（不入账）。
- escrow 与结算共用同一 `wallet_ledger` 与同一幂等键唯一约束（`UNIQUE(player_id, idempotency_key)`）。

---

## 9. 排行榜响应契约与 PII 口径（P1）

### 9.1 请求

```text
GET /api/game-platform/v1/leaderboards
  ?game_id=hbut_stack
  &board=classic|verified|season        （默认 classic）
  &scope=school|class|class_total       （默认 school；无 class 上下文时 class/class_total → 400 RUN_INVALID 语义不适用，返回 400 SCHEMA_INVALID 或自动降级为 school 并在响应标注，见下）
  &limit=20                             （1..100，默认 20；越界 → 400 SCHEMA_INVALID）
  &cursor=<opaque>                      （可选；上一页返回的 next_cursor，服务端签名）
```

规则：只允许上述参数；出现其它过滤参数 → `400 SCHEMA_INVALID`；`scope=class|class_total` 而请求方无 class 归属时，服务端**自动降级为 `school`** 并在响应 `scope_applied` 中标注（与游戏侧既有降级一致：`website/modules-src/hecheng_hugongda/project/src/App.vue:1018-1027`）。分页只允许 cursor，禁止 offset 深分页。

### 9.2 响应

```json
{
  "success": true,
  "board": "verified",
  "scope_applied": "school",
  "game_id": "hbut_stack",
  "metric": { "name": "layers", "label": "层数" },
  "entries": [
    { "rank": 1, "player_ref": "a1b2c3d4e5f6", "player_name": "张三", "class_name": "机械2401",
      "score": 1240, "metric": { "name": "layers", "value": 26 }, "updated_at": "2026-09-27T08:02:31Z",
      "is_self": false }
  ],
  "next_cursor": null,
  "generated_at": "2026-09-27T09:00:00Z"
}
```

| 字段 | 规则 |
|---|---|
| `rank` | 服务端排序位次（并列按 `player_ref` 稳定排序） |
| `player_ref` | **不可逆展示用短 id**：`hex(sha256(player_id + ":" + board))[:12]`；用于前端列表 key，**不是学号**、不可反查 |
| `player_name` | 服务端快照（Identity `hbut_student_name` 或玩家表快照）；无快照时用脱敏占位（如"湖工学子"），**不得**回退成学号 |
| `class_name` | 仅 `class` / `class_total` 榜返回；其它榜不返回 |
| `is_self` | **由 principal 推导**：无有效凭据时恒 `false`；有凭据时按 `player_ref` 比对，**不得**通过接受 query `student_id` 判定 |
| `next_cursor` | 服务端 HMAC 签名的不透明游标（含 board/scope/最后的排序键）；非法/过期游标 → `400 SCHEMA_INVALID` |

### 9.3 PII 硬约束

- **禁止返回**：`hbut_student_id` / `student_id` / `player_id` / `user_id` / Identity `sub` / 姓名以外的身份字段（专业、学院等默认不返回，除非产品明确要求并单列）。
- `player_name` 只在榜单需要展示时返回；未来可选"匿名上榜"开关（#909/#911 决定）。
- Legacy `/api/game-rank/leaderboard`（`runtime/entrypoint.py:4686-4741`）保持既有行为（可含 `student_id`，冻结），**仅展示**用途；V2 榜不得复用该响应体。
- 榜单接口按 IP 限流（复用既有滑动窗口范式）；`limit` 上限 100；响应 `Cache-Control: public, max-age=30`（公开榜）或 `no-store`（含 `is_self`）。

---

## 10. 日志 / 遥测脱敏硬约束（P1）

| # | 规定 |
|---|---|
| L1 | **禁止**把 `Authorization` 原值、ticket 原值（`gpt_*`）、GS token 原值（`gs_*`）、`Idempotency-Key` 原值写入任何日志、指标标签、APM、访问日志、错误响应 |
| L2 | 学号只允许按既有脱敏约定记录：`前2位...(长度)#sha256前6位`（`ocr-service/docs/identity_auth_rollout.md:76-79`）；`mini-hbut-gp-901` 侧新增代码沿用（可抽公共函数） |
| L3 | ticket 经 URL 传递：访问日志**必须**对 query 打码；要求至少覆盖 `ticket` / `gpt` / `token` / `code` / `idempotency_key` 参数（值替换为 `***`），HF Space 的访问日志配置由 #911 核查并留证 |
| L4 | 指标标签白名单：`game_id`、`code`、`trust_level`、`platform`、`runtime`、`reason`、`board`、`scope`；禁止 token/学号/姓名/班级/`player_ref` 之外的任何主体标识 |
| L5 | SDK 卫生：读取 URL 中的 ticket 后立即 `history.replaceState` 清除该 query 参数（§6.2.3）；禁止 `console.log` token/ticket；错误上报只上报 `code` + `request_id` |
| L6 | 静态检查（#911）：CI 增加规则扫描 `Authorization` / `ticket` / `token` 与 logger/print/console 的共现（`ocr-service` 与 `website/modules-src/_sdk`），命中即失败 |
| L7 | 前端展示：错误提示只使用服务端 `message`（已脱敏）；禁止把异常对象整体渲染（沿用 `website/modules-src/hbut_stack/project/src/main.js:190-195` 的 `textContent` 规避写法） |

---

## 11. 部署约束（限流 / 缓存实现的前提）

| # | 约束 | 依据与要求 |
|---|---|---|
| D1 | ocr-service 为 **uvicorn 单进程** 部署 | `ocr-service/Dockerfile:27`（无 `--workers`）。所有"进程内限流/进程内缓存/sessions_epoch"的设计以此为前提 |
| D2 | 一旦改为多 worker / 多副本，`RATE_LIMITED` 的限流语义按"每副本各自计数"退化（实际阈值 × N） | #911 在扩容前必须重新评估；若需精确限流，必须先引入共享存储（Redis），本协议不假设其存在 |
| D3 | session 撤销缓存（§6.6）在多副本下退化为"撤销写库 + ≤30s TTL 兜底" | 同上；单副本时靠 `sessions_epoch` 立即失效 |
| D4 | 限流状态进程内 → 部署重启即清零 | 属可接受行为；禁止把它当作安全边界（真正边界是凭据校验与 DB 约束） |
| D5 | 结算/投影/镜像必须只依赖 **DB 唯一约束**，不得依赖进程内锁 | 跨进程正确性的唯一保证（§3.4、§3.5） |

---

## 12. 待用户确认项

| # | 事项 | 需要用户回答什么 | 阻塞谁 | 默认假设 |
|---|---|---|---|---|
| U1 | **P1 Access Token 可验证化方案**（§6.3–§6.5） | 采纳推荐 (b)（resource-scoped JWT AT + `extraTokenClaims`），还是 (a) introspection / (c) userinfo | #902 全部 | 按 (b) 设计；用户确认前 #902 不开工 |
| U2 | P2 展示字段来源：`player_name` / `class_name` / `major` / `school_name` 用 token claim 还是"客户端自报 + 服务端首次快照" | 选一种 | #903/#904 | 服务端快照优先，客户端值仅首次导入（§2.4） |
| U3 | P3 namespace 与 17 码错误码表最终形态 | 确认 `/api/game-platform/v1/*` 与 §5 表 | #903/#906/#909 | 按本文件冻结；补充码可后续 additive 新增 |
| U4 | `session_ttl_seconds` 默认值 | 1800s / 3600s / 跟随 AT | #902 | 1800s |
| U5 | `hbut_match3` 的 `metric.name` | `score_only` / 其它 | #907d | `score_only`（`metric.value=0`） |
| U6 | `hbut_gomoku` 是否纳入 V2 排行与竞技榜 metric | 纳入 / 不纳入 | #908 | 仅 `server_verified_match` 落地后进竞技榜；不进经典榜 |
| U7 | `hugongda_escape`（disabled）是否显示占位 | 显示 / 不显示 | #905 | 不显示 |
| U8 | §8 的 `entry_type` / `reason_code` / 幂等键命名空间是否与你对 #909/#910 的设想一致 | 确认或调整枚举 | #909/#910 | 按 §8 冻结；数值规则由 #909 定义 |
| U9 | `require_rewards` 是否保留（本协议用它区分"索要奖励但被关闭"与"普通提交"） | 保留 / 删除 | #904/#909 | 保留，默认 `false` |
| U10 | 榜单是否提供"匿名上榜" | 需要 / 不需要 | #909/#911 | 不提供（V1），`player_name` 用服务端快照 |
