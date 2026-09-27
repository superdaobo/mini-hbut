# Game Platform V2 兼容契约（compatibility）

> - 文档编号：#901 交付物 C
> - 配套：`docs/game-platform/protocol-v1.md`（§1 namespace、§3 幂等、§5 错误码、§8 账本）、`docs/game-platform/trust-model.md`（§2 三档信任）
> - 适用对象：#904（SDK fallback）、#905（Game Center）、#906（Legacy 保护层）、#907（游戏迁移）、#909（经济）、#911（Release Gate）
> - **本文自包含**：Epic #900 的原文（核心兼容原则 5 条 / Rollout A–F / 兼容测试矩阵 8 项）逐字收录在 **附录 A**；正文所有规则都可由附录 A 与仓库内文件推导，不依赖任何仓库外文档
> - 所有引用格式 `相对路径:行号`，基于 `origin/main` = `1b8b755d`；1.4.11 为回归基线版本（`RELEASE_v1.4.11.md`，发布日 2026-09-23）

---

## 0. 唯一底线

> **V2 可以增加能力，但绝不能让"没升级的客户端 / 没迁移的游戏 / 已存在的排行榜数据"变差。**
> 任何改动如果回答不了"1.4.11 的客户端 + 今天的后端"这条组合还能正常工作，就不许合并。

---

## 1. 兼容契约（Epic 核心原则 5 条 → 可执行规则 + 1 条派生约束）

> Epic 原文见附录 A.1（逐字）。本节是它的可执行化；**第 6 条为本协议派生的工程约束**（Epic 原则 4 的达标手段），不是 Epic 原文。

### 契约 1 ← Epic 原则 1：不删除旧游戏 URL / 静态资源

- 模块产物目录**只增不删**：`website/public/modules/<channel>/<id>/<version>/` 保留至少 5 个历史版本（裁剪逻辑 `scripts/prune_website_module_versions.mjs`）。
- `website/modules-src/<id>/module.json` 的 `entry_path` / `source_dir` 不得改动既有值（契约测试强制 `dirName === id`、`entry_path === 'index.html'`、`source_dir === 'project'`：`apps/client/src/utils/website_game_modules_contract.spec.ts:110-120`）。
- 旧 module id 永久保留；Game Center 只**新增**入口，不替换/移除既有卡片（`apps/client/src/utils/module_center.js:202-255` 的内置项永不消失）。
- 判定：契约测试 + 构建冒烟（`node scripts/build_website_modules.mjs --modules <changed>`）+ 老版本 manifest 与 bundle 仍可下载。

### 契约 2 ← Epic 原则 2：不删除或破坏 `/api/game-rank/*`

- 三个路由的 method / path / 请求字段名 / 响应字段名**逐字节冻结**：`/ping` `runtime/entrypoint.py:4576`、`/submit` `:4606`、`/leaderboard` `:4686`（函数体止于 `:4741`）。
- 允许 additive：新响应字段可追加；老客户端只按 `success === false` 与 HTTP 状态报错（`website/modules-src/hbut_stack/project/src/utils/game_rank.js:85-98`）。
- 禁止：改状态码语义、把 `error` 从 string 改成 object、要求新必填字段、给 Legacy 端点加 Bearer 要求。
- 判定：`ocr-service/tests/test_game_rank_legacy_compat.py`（#906 新增，ocr-service 第一个 game-rank 测试）用 1.4.11 形状样本做契约断言（§7.3）。

### 契约 3 ← Epic 原则 5：Game Platform 故障不能让游戏整体不可玩

| 故障 | 必须发生 | 禁止发生 |
|---|---|---|
| Game Platform API 全挂 | 游戏可继续玩；SDK 降级 `compatibility` / `standalone`；成绩本地展示 + pending 重试 | 白屏、卡加载、丢分不清 |
| Economy 关或挂 | run 可提交、榜可查，`reward_status=disabled`（`REWARD_DISABLED` 语义） | 因发奖失败拒绝 run（`SETTLED` 与发奖解耦） |
| Drift Bottle 关 | 其他 Tab 与游戏不受影响 | 入口报错阻塞整页 |
| Auth（Identity）不可用 | 旧游戏与 Legacy 提交不受影响；V2 新链路明确降级 + 中文提示 | 全站 401、把 Legacy 一起关掉 |
| Legacy 通道不可用 | V2 链路不受影响（依赖只能是 V2→Legacy 数据，**不能是**在线可用性依赖） | V2 请求被 Legacy 故障拖垮 |

### 契约 4 ← Epic 原则 3：Legacy 成绩不得产生新资产

可执行规则 = §2 的三禁止（展开见下）。

### 契约 5 ← Epic 原则 4：V2 可信链路 + 兼容更新经典榜

- V2 `verified_session` 完成一局后：写 V2 run / settlement；按 economy 规则结算；进赛季统计（若 `season_eligible`）；**必要时**同步更新 `game_rank_best`，保证旧客户端仍能看到新纪录。
- 同步方式 = dual-write（§3）；**Legacy 数据零迁移丢失**（§6 P7）。
- 判定：§5 矩阵第 2/4 项 + §3 的对账与负向测试。

### 契约 6（派生工程约束）：V2 与经典榜 dual-write 一致且不重复结算

- 规则见 §3；核心不变式：`settlements.run_id` 唯一键是**唯一发奖裁决点**，投影/镜像失败只影响经典榜可见性，绝不影响结算次数。

---

## 2. Legacy 三禁止（不产生 XP / 不产生 coin / 不进 Verified Season）

### 2.1 规则

| # | 禁止 | 精确定义 |
|---|---|---|
| L1 | Legacy run **不产生 XP** | `trust_level=legacy` 的 run 不得写 `wallet_ledger` 任何 XP 条目，不得推进 `daily_progress`，不得进任何等级/经验聚合 |
| L2 | Legacy run **不产生湖工币** | 同上，`coin` 条目零写入；Legacy 提交**不得触达 wallet 表**（#903 验收：wallet 任意变化必有 ledger 行，且 ledger 行必须可追溯到 `verified_session`/`server_verified_match` 的 run） |
| L3 | Legacy run **不进 Verified Season** | 赛季榜数据源必须是 `runs.trust_level IN ('verified_session','server_verified_match')`；Legacy run 只允许进 `classic` 榜 |

补充（消除灰区）：

- Legacy run 可进 **classic 榜**（V2 视角的经典榜 = Legacy 榜镜像），但 classic 榜**不得**出现在 Season UI、不得作为赛季结算输入。
- 历史 Legacy run（`game_rank_runs` 既有数据）**永久保留原样**，不回填 `trust_level`。
- Legacy run 不参与"每日任务进度"（#909）：任务进度只由 verified run 推进。
- escrow（漂流瓶）等 UGC 经济对 Legacy 完全关闭（`protocol-v1.md` §8.5）。

### 2.2 "客户端伪造新版字段也不能绕过"的防护设计

攻击方式：在 Legacy 请求体里塞 `protocol_version` / `trust_level` / `xp` / `coin` / `reward` / `season_id`，期望被当作 V2 请求处理。

防护（必须全部实现，#906 负向测试逐条覆盖）：

1. **通道隔离**：`trust_level` 由服务端按端点与凭据推导，不读请求体（`/api/game-rank/*` → 恒为 `legacy`；`/api/game-platform/v1/*` → 由 session 推导）。请求体出现 `trust_level` 一律忽略并告警（`legacy_reward_injection_attempt_total`）。
2. **端点白名单**：经济写入（wallet / daily_progress / season）只接受 V2 端点 + 非 legacy run；Legacy 端点在代码层面**不 import** 经济模块（结构性防护，而非运行时 if）。
3. **结算入口唯一**：结算函数只接受来自 `/runs/{id}/finish` 的 run，且断言 `run.trust_level != 'legacy'`；违反断言 → `500` + 告警（编程错误，不是用户错误）。
4. **reward 数量字段不存在**：协议里没有"客户端提交奖励数量"的字段（`trust-model.md` §4）；此类字段在 V2 端点按 `400 SCHEMA_INVALID` 处理，在 Legacy 端点忽略 + 告警。
5. **负向测试**（#906 验收，必须真实存在）：
   - Legacy 提交带 `xp_gain=999999` → 落 Legacy 表成功、wallet 表零变化；
   - Legacy 提交带 `trust_level=verified_session` → 落库行 `trust_level` 仍为 `legacy`；
   - Legacy 提交带 `season_id` / `rank_scope=verified` → 赛季榜查询结果不含该学员；
   - 用 Legacy 形态凭据直连 V2 端点（无 GS token）→ `401 AUTH_REQUIRED`，不产生 run。

---

## 3. dual-write 与反向镜像

### 3.1 正向投影（V2 → Legacy 经典榜）

- 范围：仅 registry `classic_mirror=true` 的游戏（当前 = 10 个有 `game_rank.js` 的游戏，`game-registry.md` §2）。
- **顺序铁律**：结算事务（`runs` + `settlements` + wallet + ledger）先提交；投影后执行且独立幂等。
- **投影幂等**：`legacy_projection_outbox(run_id UNIQUE, payload_json, attempts, last_error)`；投影 = 按 `run_id` 写 Legacy 表，沿用 `game_ranking_storage.submit()` 的 `INSERT ... ON DUPLICATE KEY UPDATE`（`modules/game_ranking_storage.py:449-492`）。
- **投影内容**必须满足 Legacy 契约：`student_id` = principal 的 `hbut_student_id`（**不是**请求体）；`max_level` 由 registry 换算（如 `hbut_monopoly` 为 `metric.value + 1`）；`payload_json` = `result.extra` + `{"_source":"v2","trust_level":"verified_session"}` 诊断标记；**禁止**把 XP/coin/season 写进 Legacy 表。
- **串写防护**：若 Legacy 表中同 `run_id` 已存在且其 `student_id` ≠ 本次 principal → **不覆盖**，跳过 + 告警（`legacy_projection_owner_mismatch_total`）。
- **限流豁免**：投影是服务端内部路径，**不得**消耗 Legacy 的每 IP / 每学号限流配额（否则产生"内部投影被限流"的伪故障）。
- 可关闭：flag `game_platform_legacy_dual_write=false`；重开后续跑（幂等键保证不重复）。

### 3.2 反向镜像（Legacy → V2 classic）：**只允许 INSERT**

- Legacy 提交成功后（异步、outbox 模式）镜像一条 `runs.trust_level='legacy'` + classic 榜记录，用于 Game Center 统一展示。
- **只 INSERT**：`insert_mirror_run(run_id, …)` 若 `run_id` 已存在 → **不更新、不覆盖、不报错**，跳过 + `legacy_mirror_conflict_total` + 告警。
- **绝不修改既有非 legacy 行**：镜像路径禁止任何 `UPDATE`；`ON DUPLICATE KEY UPDATE` 一律不得出现在反向镜像实现里。
- 理由：Legacy `run_id` 由客户端生成（`createRunId()` = `run_<Date.now()>_<rand>`，`website/modules-src/hbut_stack/project/src/utils/game_rank.js:227-230`），可被碰撞/恶意复用；V2 的 `run_id` 是全局唯一键（`protocol-v1.md` §3.5），因此镜像撞键时必须让位给已有（可能是 verified）行。
- 镜像行永不进 `settlements` / wallet / season（§2），镜像失败不影响 Legacy 响应（契约 2）。

### 3.3 失败补偿（dual-write 失败不得导致 settlement 重复）

```text
finish
 └─ 事务 T：runs(FINISHED) + settlements(run_id UNIQUE) + wallet/ledger   ← 成功即 SETTLED，永不回滚
       └─（提交后）投影 P：outbox 取任务 → 写 Legacy 表 → done
              失败 → attempts+1 + 退避（1s/5s/30s/5min，最多 12 次）
                     超上限 → 死信 + 告警（game_platform_legacy_projection_dlq_total）
                     重放仍用同一 run_id 幂等键 → 不产生第二条 Legacy 记录
```

- **不变式**：无论 P 重试多少次、无论 finish 被重试多少次，`settlements.run_id` 唯一键保证**发奖恰好一次**；Legacy 表 `run_id` 唯一性保证**经典榜恰好一条**。
- **禁止**把 Legacy 写操作放进事务 T（会让 Legacy 抖动回滚结算 → 用户奖励丢失；若幂等键设计不当再重试还会重复发奖，这正是本规则要避免的失败模式）。
- **可见性**：结算成功但投影失败时，V2 榜立刻可见、经典榜延迟可见；UI 不得宣称"经典榜同步失败"（内部对账问题，不是用户错误）。
- **孤儿结算补偿**与本节正交但同源：`FINISHED` 但无 settlement 的 run 由 `protocol-v1.md` §3.3 case I（重试即补偿）+ 60s 兜底扫描恢复。

---

## 4. Rollout Stage A–F（Epic 原文阶段 → 判定条件与回退动作）

> 阶段定义逐字来源：附录 A.2。下表补上每阶段的进入/退出判定与一步可停的回退动作；`#911` 逐阶段留证。

| 阶段（Epic） | 内容 | 进入条件（判定） | 退出条件 | 回退动作 |
|---|---|---|---|---|
| **A. 后端先部署，Feature Flag 关闭（用户无感）** | #903 数据层（additive 建表）+ #902c 路由注册上线，所有 flag 默认 false；`/api/game-rank/*` 原位保留 | #901 协议冻结；空库 migrate 幂等通过；`game_rank_*` DDL 快照零差异；1.4.11 形状的 Legacy 契约测试通过 | 部署后观察 ≥24h：无 5xx 增量、Legacy 指标无变化 | 移除注册行 / 回滚部署；flag 保持 false；不 DROP 新表 |
| **B. Dev：Game Center ON，Legacy 入口仍 ON** | #905 Game Center + #904 SDK 在 Dev 通道可用；P1 认证链路（ticket/session）上线并端到端跑通 | ① 用户确认 P1（`protocol-v1.md` U1）；② Core 侧 scope/audience 就绪且实发 token 可被 `identity_auth` 验证（端到端证据）；③ ticket 重放/过期/跨 game 负向测试全绿；④ `FORBIDDEN_ACTOR` 计数为 0（说明无未迁移调用方） | Dev 稳定运行 ≥7 天；无 Legacy 认证回归（`forum_auth_*` / `cloud_sync_auth_*` 不恶化） | `MINI_HBUT_IDENTITY_ENABLED=false`；`game_platform_enabled=false`；Dev 通道回滚到上一个模块版本 |
| **C. TestFlight / Android Beta：Game Center 为主入口，经典游戏保留 fallback** | 首批游戏接 `verified_session`（#907 分支），dual-write 影子运行；经济仍未开 | B 退出条件达成；SDK 单测 + 至少 1 个游戏真机全链路（ticket→session→run→finish→榜）；投影成功率 ≥99.9%；经典榜与 V2 classic 抽样一致 | 影子期 ≥7 天：对账零差异、outbox 零积压、两个平台无阻断性问题 | 游戏级：`game_registry.games[<id>].enabled=false` → SDK 落 `compatibility`；全局：`game_platform_run_v2=false`；`game_platform_legacy_dual_write=false` |
| **D. 正式版：Game Center 默认，经典入口折叠** | 10 个有 rank 的游戏迁移完成；`ranked=true` 游戏进 verified 榜；**D2（派生）** 开启 economy（#909）+ 赛季 | C 退出条件达成；10 游戏迁移验收清单全绿；结算并发/幂等测试全绿；日限额生效；`rule_version` 可追踪；wallet 对账脚本覆盖 | 观察 ≥14 天：无重复发奖、无对账差异、无 App Store policy 回归 | economy：`game_platform_economy=false`（已结算不回滚，新 run `reward_status=disabled`）；迁移：单游戏回退到 `compatibility`；客户端：remote_config feature flag 关闭 Game Center |
| **E. 新客户端停止主动使用 Legacy API，服务端仍继续支持旧客户端** | SDK 默认 `verified`，Legacy 只作 fallback；`legacy_submit_total` 持续下降 | D 退出条件达成；「更多」页经典入口折叠；老版本客户端占比达到可接受阈值（由用户定义） | `legacy_submit_total` 趋于只由旧版本客户端产生；新客户端 0 主动 Legacy 调用（指标留证） | 恢复 SDK 默认 `compatibility` 回退优先级；Legacy 通道始终保持可用（不得关闭） |
| **F. 按真实 legacy DAU / 版本占比决定长期维护或退役（禁止按日期硬切）** | 决策点：继续维护 / 只读化 / 退役 | 必须由用户基于**真实指标**决策（legacy API DAU、版本占比、投诉量） | — | 任何退役动作都属于不可逆生产变更，需用户明确授权 + 备份 + 回滚演练；**禁止**按日期硬切（附录 A.2 原文） |

**全程回退原则**：客户端走 feature flag（remote_config）；网站模块走 5 版本保留；ocr-service 走环境变量（默认 false）；DB 只做 additive（不做 down migration）；Identity 走 scope 白名单回退 + Vercel 重新部署。

---

## 5. 兼容测试矩阵

### 5.1 Epic 原文 8 项（逐字见附录 A.3；#911 逐项填证，B 阶段起）

| # | 组合 | 期望 | 证据形式 |
|---|---|---|---|
| 1 | 旧版客户端 + 新 Backend + 旧游戏 | 可玩 | 真机/模拟器 + `/api/game-rank/*` 兼容契约测试 |
| 2 | 旧版客户端 + 新 Backend + Legacy Rank | 可上传、榜可见、无奖励 | 兼容契约测试 + wallet 零变化断言 |
| 3 | 新客户端 + 新 Backend + Legacy Game | 可玩（`compatibility` 降级） | SDK 单测 + 真机 |
| 4 | 新客户端 + 新 Backend + V2 Game | 完整能力（run/settle/榜/奖励） | 端到端真机 + 服务端日志 |
| 5 | Game Platform API 故障 | 游戏可降级游玩 | 故障注入（断网/503）真机记录 |
| 6 | Economy 关闭 | 游戏可玩但不发奖励 | flag 关闭下的端到端 |
| 7 | Drift Bottle 关闭 | 其他游戏功能不受影响 | flag 关闭下的页面回归 |
| 8 | **1.4.11 作为至少一个实际旧版回归基线** | 基线行为不回归 | §7 的点名用例 + 真机抽样 |

### 5.2 补充项（本协议新增，防止门禁与数据被绕过）

| # | 项 | 断言 |
|---|---|---|
| C1 | 11 个 game_id 三方一致 | `apps/client/src/utils/website_game_modules_contract.spec.ts:39-51,90-108` vs `module_center.js:5-105` vs 各 `module.json` vs catalog 构建输出 |
| C2 | run 幂等 | 同 `run_id` 相同 payload 重放 → 200 不重复发奖；不同 payload → 409 |
| C3 | 孤儿结算恢复 | 人为在 T3 后中断（注入崩溃）→ 重试或 60s 扫描后 `settlements` 恰好 1 行（`protocol-v1.md` §3.3 case I） |
| C4 | 并发结算 | 同 run 并发 finish ×N → wallet 恰好 +1 条 ledger |
| C5 | actor 不可伪造 | V2 body/query 带 `student_id` → 403 `FORBIDDEN_ACTOR`；带 `xp_amount` → 400 `SCHEMA_INVALID`；Legacy 带 `xp_gain` → 忽略且 wallet 零变化 |
| C6 | ticket 一次性与并发兑换 | 重放/过期/跨 game 全部失败；并发兑换同一 ticket 只有一个成功（`protocol-v1.md` §6.2.1） |
| C7 | exchange 幂等 | 同 ticket 在 session TTL 内重复兑换 → 返回同一 session（200 `replayed_session`）；session 过期后 → 409 `TICKET_USED` |
| C8 | WebView 恢复 | 模拟 resume remount（`MoreModuleHostView.vue:377-379`）→ 游戏仍能拿到 session（策略 A 或 B），成绩不丢、不重复结算 |
| C9 | session 隔离与撤销 | 跨游戏不可复用；logout 后旧 session 在 ≤30s 内 401（`protocol-v1.md` §6.6） |
| C10 | 数值边界与字节上限 | `score=1e9+1`、`metric.value` 超上限、`duration_ms=86400001`、`result` 序列化 >8192、`extra` >6144 → `SCHEMA_INVALID` |
| C11 | 时钟容差与隔离 | `duration_ms` 远超 server 时长 → `QUARANTINED`；`result_fingerprint` 跨 3 账号 → `QUARANTINED`（`protocol-v1.md` §3.2 T5） |
| C12 | 错误码一致性 | `protocol-v1.md` §5 表格与 `schemas/error-codes.json` 逐字段一致（脚本断言） |
| C13 | 反向镜像不覆盖 | Legacy 提交撞已有 V2 `run_id` → 镜像被拒绝 + 告警，V2 行零修改（§3.2） |
| C14 | 经典榜不被污染 | 投影行 `student_id` 来自 principal；旧表无奖励字段；`legacy_mirror_conflict_total` 与 `legacy_projection_owner_mismatch_total` 有断言 |
| C15 | 数据零丢失 | 变更前后 `game_rank_runs` / `game_rank_best` 行数与内容摘要一致（除新增镜像行） |
| C16 | 模块构建冒烟 | 构建成功；`disabled` 模块（`hugongda_escape`）不进 catalog（`scripts/build_website_modules.mjs:240-247`） |
| C17 | 日志脱敏 | CI 静态检查：`Authorization` / ticket / token 不与 logger/print/console 共现（`protocol-v1.md` §10 L6） |
| C18 | 排行榜 PII | V2 榜响应不含 `student_id`/`hbut_student_id`/`player_id`/`user_id`/`sub`；`is_self` 由 principal 推导（`protocol-v1.md` §9.3） |

---

## 6. 明确禁止项（任何 Agent 都不得执行）

| # | 禁止 | 原因 |
|---|---|---|
| P1 | **清空旧榜**（`TRUNCATE`/`DELETE game_rank_runs|game_rank_best`） | 不可逆的用户资产；须产品决策 + 用户明确授权 + 备份后单独执行 |
| P2 | **批量把历史 Legacy run 标成 verified** | 等于给全部历史自报数据发放真实权益，直接击穿 §2 |
| P3 | **按旧 score 追发历史 XP / 湖工币** | 历史 score 不可验证，追发即凭空发行资产且无法对账 |
| P4 | 让 Legacy 端点要求 Bearer / 改错误形状 / 改 HTTP 状态 | 破坏契约 2，老客户端直接不可用 |
| P5 | 在 dual-write 失败时回滚已提交的 settlement | 触发重复发奖风险（§3.3） |
| P6 | 把 `student_id` 写进 V2 端点契约或 SDK 公共 API | 违反 `trust-model.md` §3 |
| P7 | `DROP TABLE game_rank_runs/game_rank_best` 或修改其列定义 | 破坏回滚能力；只允许 additive 索引/新表 |
| P8 | 关闭 Legacy 通道作为"灰度加速手段" | 只有 Stage F 且用户明确授权后才可只读化；且不得按日期硬切（附录 A.2） |
| P9 | 反向镜像使用 `ON DUPLICATE KEY UPDATE` / 任何 `UPDATE` | 可能覆盖 verified 行（§3.2） |
| P10 | 把 ticket / GS token 明文入库、写日志或写进 localStorage | 违反 `protocol-v1.md` §10 |

---

## 7. 1.4.11 回归基线（具体测试内容，改动前后必须跑）

### 7.1 客户端门禁（每 PR）

- `cd apps/client && npm run test:ci`（`apps/client/package.json:24`，`vitest run --config vitest.ci.config.ts`）
- `npx vue-tsc --noEmit -p tsconfig.json`
- `npm run check:all`（`apps/client/package.json:45`，含 architecture / god-files / design-tokens / frontend-safety）

### 7.2 与游戏/模块直接相关的点名用例

| 用例 | 位置 | 覆盖的 1.4.11 行为 |
|---|---|---|
| 模块中心三方一致性 | `apps/client/src/utils/website_game_modules_contract.spec.ts:67-108` | 11 个 game_id 顺序、内置模块中心、manifest 地址 |
| 宿主上下文注入 | `apps/client/src/utils/website_game_modules_contract.spec.ts`（同文件后续用例） | `student_id/player_name/class_name/rank_api` 注入链（迁移期必须保持可用） |
| 模块加载容灾 | `apps/client/src/utils/more_modules_resilience.spec.ts`、`p0_multi_module_contract.spec.ts` | Android 404 容灾（1.4.11 #883：主 CDN 失效刷新 manifest / 备用来源 / 不暴露 404 页） |
| 7 个游戏 rank 契约 | `apps/client/src/utils/{hbut_stack,hbut_match3,hbut_memory_match,hbut_miner,hbut_monopoly,hbut_parking,hecheng_hugongda}_rank_contract.spec.ts` | 各游戏 payload 构造与 Legacy 提交语义（例：`hbut_stack_rank_contract.spec.ts:33-45`） |
| 6 个游戏逻辑契约 | `apps/client/src/utils/{hbut_stack,hbut_match3,hbut_memory_match,hbut_miner,hbut_monopoly,hbut_parking}_game.spec.ts` | 游戏核心逻辑（迁移不得改规则） |
| 文本安全 | `apps/client/src/utils/website_game_text_safety.spec.ts` | 模块文案与异常文本渲染约束（`website/modules-src/hbut_stack/project/src/main.js:190-195`） |
| 模块构建冒烟 | `node scripts/build_website_modules.mjs --modules <changed>` | 产物结构、main/dev/latest 三 channel、`disabled` 跳过 |

### 7.3 后端基线

- ocr-service：`python -m pytest tests -q`（27 文件，**游戏排行零覆盖**）→ #906 必须**先**补 `tests/test_game_rank_legacy_compat.py` 作为"改动前的安全网"，再动 Legacy 代码。
- 兼容契约样本（#906 建立，长期作为 1.4.11 形状基线）：按 `website/modules-src/<game>/project/src/utils/game_rank.js:186-203` 的字段构造 10 个游戏的 submit 样本 + `/leaderboard` 三种 scope 样本，断言响应字段名/类型/`success` 语义。

### 7.4 真机基线（#911）

iOS / Android 各抽样覆盖：模块加载、游戏可玩、Legacy 提交、排行榜打开、前后台恢复（`apps/client/src/components/MoreModuleHostView.vue:339-379` 的 `hbu-embed-resume` 路径）、iOS 长后台恢复（1.4.11 修复项）。

---

## 8. 待用户确认项

| # | 事项 | 说明 |
|---|---|---|
| U-C1 | Stage E 的"老版本客户端占比阈值"与 Stage F 的退役判定指标 | Epic 原文只规定"按真实 DAU / 版本占比、禁止按日期硬切"，具体阈值需用户给出 |
| U-C2 | Legacy 通道最终形态（Stage F 只读化）的时间点与授权方式 | 本文件只定义能力与门禁，不承诺时间 |
| U-C3 | 经典榜 dual-write 的可见性口径 | 投影延迟期间经典榜暂时看不到新成绩，是否在 Game Center 经典榜 Tab 标注"数据同步中" |
| U-C4 | `game_platform_legacy_dual_write` 的默认值 | 默认 `false`（Stage A–B 不开），Stage C 起开启 |
| U-C5 | 反向镜像冲突（C13）时是否需要对账告警值班 | 默认：只告警（`legacy_mirror_conflict_total`），不阻塞 Legacy 响应 |

---

## 附录 A：Epic #900 原文（逐字收录）

> 收录用途：让本文档与 `protocol-v1.md` / `trust-model.md` 自包含、可离线核验。原文中的 ✅/❌ 符号与清单格式保持原样。

### A.1 核心兼容原则（不可违反）

1. **不删除旧游戏 URL / 静态资源** — 旧客户端可能长期持有现有模块 URL。新 Game Center 上线不能导致旧 App 中的游戏入口失效。
2. **不删除或破坏 `/api/game-rank/*`** — 旧版请求协议保持可用；旧客户端仍允许提交"经典历史榜"成绩。
3. **Legacy 成绩不得产生新资产** — 旧协议当前仍依赖客户端提交 `student_id` 等字段，可信度不足。因此 Legacy 请求只能：✅ 继续写经典排行榜；✅ 继续更新历史 best；❌ 不产生 XP；❌ 不产生湖工币；❌ 不进入 Verified Season；❌ 不获得可转移或可消费资产。
4. **新版本采用 Verified V2 链路，并兼容更新经典榜** — V2 可信 Game Session 完成一局后：写 V2 run / settlement；结算 XP / 湖工币；进入赛季统计；必要时同步更新现有 `game_rank_best`，保证旧客户端仍能看到新纪录。
5. **Game Platform 故障不能让游戏整体不可玩** — Game Session / Economy 故障时，游戏至少应降级为无奖励模式，必要时继续走 Legacy Rank。

### A.2 Rollout

- **Stage A**：后端能力先部署但 Feature Flag 关闭。用户无感。
- **Stage B**：Dev。Game Center ON，Legacy 入口仍 ON。
- **Stage C**：TestFlight / Android Beta。Game Center 为主入口，经典游戏保留 fallback。
- **Stage D**：正式版。Game Center 默认，经典入口折叠。
- **Stage E**：新客户端停止主动使用 Legacy API。服务端仍继续支持旧客户端。
- **Stage F**：根据真实 legacy API DAU / 版本占比决定是否长期维护或最终退役。禁止按日期硬切。

### A.3 兼容测试矩阵（原文 8 项）

- [ ] 旧版客户端 + 新 Backend + 旧游戏：可玩
- [ ] 旧版客户端 + 新 Backend + Legacy Rank：可上传
- [ ] 新客户端 + 新 Backend + Legacy Game：可玩
- [ ] 新客户端 + 新 Backend + V2 Game：完整能力
- [ ] Game Platform API 故障：游戏可降级游玩
- [ ] Economy 关闭：游戏可玩但不发奖励
- [ ] Drift Bottle 关闭：其他游戏功能不受影响
- [ ] 1.4.11 作为至少一个实际旧版回归基线
