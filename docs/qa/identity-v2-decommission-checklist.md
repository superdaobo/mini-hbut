# 身份 v2 · 旧平台下线清单（数据迁移 + 境外数据删除 + 回滚演练）

> 用途：goal-10 / **P4-3**（issue **mini-hbut#1218**：`[身份 v2] 数据迁移与旧平台下线（含回滚演练）`）的人工执行清单。
> 依据：`goal-10/evidence/p4-3-migration-rollback-spec.md` §2.1（本清单）与 §2.2（回滚演练）；迁移工具 CLI 与导出件格式以规格 §1 冻结口径为准。
> 基线：mini-hbut `f15c8c58`（worktree `hb-p43`，分支 `feat/p4-3-checklist`）；mini-hbut-student-auth `3a5a254`（worktree `sa-p43`，分支 `feat/p4-3-migration`）。
> 现状（issue）：旧平台（Vercel 香港 + Neon 新加坡）在线；线上 **3 用户 / 4 设备 / 0 快照**；schema 只到 0007。
>
> **口径声明**：本文所有「已验证/实测」均指**本地演练**（in-process，假数据）；**不声称「生产已迁移/已回滚」**。生产执行由人工按本清单逐步操作并留痕；文中主机/项目一律用占位符（`<neon-host>` / `<casdoor-host>` / `<vercel-project>` / `<auth-domain>` / `<new-domain>`），凭据一律走环境变量（如 `CASDOOR_ADMIN_TOKEN`），**不写入本文档与仓库**。
>
> 硬规则（规格 §0，违反即操作无效）：
>
> | #   | 规则                                                                                                                                                 |
> | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
> | H1  | **默认 dry-run**：写/删操作必须显式 `--apply`；不带 `--apply` 只打印计划与核对表                                                                      |
> | H2  | **幂等**：重复 `--apply` 不产生重复属性、不重复删除（报告 `already_present` / 已删除）                                                                 |
> | H3  | **不删未确认数据**：删除前必须先生成删除清单（表 + 行数 + 校验和），并持有与清单 hash 一致的人工确认文件（`--confirm=<file>`）                        |
> | H4  | **零泄露**：报告与日志不得含密码/令牌/公钥原文（公钥只允许 `kid` 或 sha256 前 12 字符；学号一律掩码）                                                    |
> | H5  | 生产执行前必须先完成 §1 前置条件核对与 §5 回滚演练（D4 解除 `unavailable`）                                                                            |

## 1. 前置条件

> 执行 §2 之前逐项核对。任何一项不满足 → 停止，回到对应阶段补齐。

| # | 前置条件 | 验证方式 | 证据/判据 |
|---|---|---|---|
| 1 | 双 issuer 过渡期内旧平台仍可验签 | P4-2 验收矩阵 `dual_2issuer` → **`dual_issuer` pass**（本文 [§7 复跑命令](#7-复跑命令) ①） | [`identity-v2-acceptance-matrix.md`](identity-v2-acceptance-matrix.md) §7：harness `dual_issuer` = `pass`（两画像各自 RS256 键验签取号；`unknown_issuer` 拒；`enabled:false` → `issuer_disabled`）+ ocr `tests/test_multi_issuer.py` 29 例 + 客户端 `identityIssuers.spec.ts` 15 例 |
| 2 | 迁移映射/核对逻辑正确（本地） | 回滚演练 `D2`（本文 §5）：属性写错 → 重新 apply 覆盖 → `reconciled=true` | 本地演练实测（见 §5）；生产 `verify` 的核对表格式必须与规格 §1 一致 |
| 3 | 迁移后核对通过（生产，执行后填） | `verify` 输出 `reconciled=true`：导出件学号集合 == Casdoor 回读集合（逐字比较），`mismatches=[]` | 核对表 JSON（规格 §1 格式）归档到 `goal-10/evidence/` |
| 4 | 导出件就绪且计数与 Neon 一致 | 导出件行数核对（本文 §2 步骤 1 的验证命令） | `users=3 / devices=4 / snapshots=0`（线上现状口径）与 `SELECT count(*)` 一致 |
| 5 | 回滚演练通过（本地） | 本文 §5：D1–D5 全部 `pass`，或 D4 由 `unavailable` 转 `pass`（迁移脚本交付后） | 演练 `report.json` 归档 |
| 6 | 迁移工具就绪 | `scripts/migration/identity_v2_migrate.py` 存在且 `plan` 控制步退出 0（本地） | 演练 `D4` 状态 |

> 说明：条件 3 属于「生产执行后」的核对，列在此处是为了明确**验收①（迁移前后用户数/学号一致，有核对记录）的证据形态**；它不阻塞 §2 步骤 1–4 的开始，但阻塞 §2 步骤 7（purge）与 §4（下线顺序）。
>
> 现状（2026-11-12，本地口径）：条件 1 / 2 / 5 / 6 已满足（D1–D5 全 `pass`，见 §5 实测；`plan` 控制步 exit=0）；条件 3 / 4 待生产执行时填写。

## 2. 迁移步骤

> 顺序固定：导出 → plan → apply → verify → purge-plan → 人工确认 → purge。每步给出**验证命令**与**失败回退**。
> 工作目录：auth 仓（迁移工具所在）；导出件与中间产物建议放仓库外（如 `%TEMP%` 或 `D:\p43\`）。

### 2.1 步骤 1 · 导出 Neon（只读）

| 项 | 内容 |
|---|---|
| 操作 | 用**只读**账号连 `<neon-host>`，`pg_dump` 导出 `users` / `devices` / `auth_requests` / `consents` / `snapshots` 五张表（表名以 Neon 实际 schema 0007 为准；导出件 JSON 键名固定为规格 §1 口径），转成冻结格式 `export.json` |
| 命令 | `pg_dump --host=<neon-host> --dbname=<db> --username=<read-only-user> --table=users --table=devices --table=auth_requests --table=consents --table=snapshots --no-owner --no-privileges -f <workdir>/neon-dump.sql`（随后按规格 §1 转 `export.json`） |
| 验证 | ① `python -c "import json;d=json.load(open('export.json'));print({k:len(d[k]) for k in ('users','devices','auth_requests','consents','snapshots')})"` ② 与 Neon 只读 `SELECT count(*)` 逐表一致（期望 `users=3, devices=4, snapshots=0`） |
| 失败回退 | `pg_dump` 只读无副作用：失败重试即可；**不得**改用有写权限的账号「修库」；导出件损坏 → 重导，不得手工改导出件 |

### 2.2 步骤 2 · plan（只读盘点，默认 dry-run）

| 项 | 内容 |
|---|---|
| 操作 | 读导出件 → 生成迁移计划 + 核对表（**不写任何地方**） |
| 命令 | `python scripts/migration/identity_v2_migrate.py plan --export=export.json --out=<workdir>/p43-plan.json` |
| 验证 | 退出码 0；`p43-plan.json` 的 `before` 计数 == 导出件计数（3/4/0 + auth_requests/consents 计数）；报告零泄露（无公钥/令牌原文） |
| 失败回退 | 退出非 0 → 检查导出件是否符合规格 §1 冻结格式（缺字段/学号非 10 位/重复学号 → 修**导出件**）；工具 bug → 记录后找 agent A，**不得**跳过 plan 直接 apply |

### 2.3 步骤 3 · apply（写 Casdoor 用户属性，需显式 `--apply`）

| 项 | 内容 |
|---|---|
| 操作 | 按规格 §1 映射：`users[].student_id` + `display_name` → Casdoor 用户属性 `hbut_student_id` / `hbut_student_name`（按 `casdoor_user` 定位，缺省 `hbut_<学号>`）；**只写这两个属性**，不动 `groups`；公钥/设备不迁移（v2 重新登记） |
| 命令 | `python scripts/migration/identity_v2_migrate.py apply --export=export.json --casdoor=https://<casdoor-host> --admin-token-env=CASDOOR_ADMIN_TOKEN --apply`（`CASDOOR_ADMIN_TOKEN` 经环境变量传入，不落盘） |
| 验证 | 退出码 0；报告中每用户为 `applied`（或重跑时 `already_present`，幂等）；`groups` 未被改动（报告核对） |
| 失败回退 | 部分失败 → 直接**重跑同一命令**（幂等覆盖，H2）；仍失败 → 以导出件为唯一事实源，用 admin API 手工把已写错的属性**改回导出件值**（只改 `hbut_student_id` / `hbut_student_name` 两个属性），再重跑；**不得**删 Casdoor 用户 |

### 2.4 步骤 4 · verify（迁移后回读比对）

| 项 | 内容 |
|---|---|
| 操作 | 从 Casdoor 回读 `hbut_student_id` 集合，与导出件学号集合**逐字**比对 |
| 命令 | `python scripts/migration/identity_v2_migrate.py verify --export=export.json --casdoor=https://<casdoor-host> --admin-token-env=CASDOOR_ADMIN_TOKEN --out=<workdir>/p43-verify.json` |
| 验证 | `p43-verify.json` 的 `reconciled=true`、`student_ids_match=true`、`mismatches=[]`（规格 §1 格式）；**该文件即验收①的核对记录**，归档到 `goal-10/evidence/` |
| 失败回退 | `reconciled=false` → 按 `mismatches` 明细（掩码学号 + 原因）逐条定位：属性写错 → 回步骤 3 重跑 apply（幂等覆盖）；用户缺失 → 在 Casdoor 按 `hbut_<学号>` 建号后重跑；**不得**在 `reconciled=false` 时进入步骤 5（任何删除） |

### 2.5 步骤 5 · purge-plan（生成删除清单，只写文件）

| 项 | 内容 |
|---|---|
| 操作 | 生成境外数据删除清单（表 + 行数 + 校验和 + 快照 key/size/updated_at）；**只写清单文件，不执行删除** |
| 命令 | `python scripts/migration/identity_v2_migrate.py purge-plan --export=export.json --out=<workdir>/p43-purge.json` |
| 验证 | 退出码 0；清单计数与导出件一致（devices=4 / auth_requests / consents / snapshots=0）；清单含清单 hash（供 confirm 文件使用） |
| 失败回退 | 退出非 0 → 与步骤 2 同处理；清单与导出件计数不一致 → 停止，检查导出件与工具版本 |

### 2.6 步骤 6 · 人工确认（生成确认文件）

| 项 | 内容 |
|---|---|
| 操作 | 人工逐项审阅 `p43-purge.json`（对象/行数/校验和）→ 用清单 hash 生成确认文件。**必须人工执行，不得脚本代劳** |
| 命令 | `echo "<p43-purge.json 中的清单 hash>" > <workdir>/p43-purge-confirmed.txt`（hash 逐字取自清单文件） |
| 验证 | 确认文件内容 == 清单 hash（逐字符）；确认人在 `goal-10/evidence/` 登记确认时间/人 |
| 失败回退 | hash 抄错 → 重新逐字核对；**确认文件与清单 hash 不符时 purge 必须被拒**（演练 D4 已验证该拦截语义，见 §5） |

### 2.7 步骤 7 · purge --apply（执行删除，需 confirm + `--apply`）

| 项 | 内容 |
|---|---|
| 操作 | 按清单删除：设备公钥 / auth_requests / consents（R9）/ 快照（境外数据）；幂等（重复执行报「已删除」） |
| 命令 | `python scripts/migration/identity_v2_migrate.py purge --purge=<workdir>/p43-purge.json --confirm=<workdir>/p43-purge-confirmed.txt --apply` |
| 验证 | 退出码 0；回读 Neon 只读 `SELECT count(*)` 逐表 = 0（或报告逐表「已删除」）；报告零泄露（快照只出 key + size + updated_at，不出内容） |
| 失败回退 | 无 confirm / confirm 不符 → 工具必须**非零退出**（拦截，演练 D4 覆盖）；部分删除失败 → 重跑同一命令（幂等）；**删除后唯一恢复手段 = 导出件**（本文 §6），故执行前再次确认 §2.1 导出件完好且可重建（本地：演练 D1/D5 的语义） |

## 3. 境外数据删除清单

> 位置均为**境外**（Neon 新加坡）。删除方式统一为 §2.7 的 `purge --apply`（先清单 + 人工确认，H3）。

| 对象 | 位置 | 删除方式 | 校验方式 | 不可逆性 |
|---|---|---|---|---|
| 设备公钥（`devices`，4 台） | Neon `@<neon-host>`（新加坡） | `purge --apply`（按清单；公钥**不迁移**，v2 重新登记） | 回读 `count(*)=0` + 清单 hash 核对；报告只出 `device_id` + `pubkey_sha256` 前 12 字符 | **不可逆**：删除后仅能靠导出件恢复（设备 v2 链路下需重新登记，旧公钥仅存档于导出件） |
| `auth_requests`（授权请求记录） | 同上 | 同上 | 同上 | **不可逆**：仅导出件存档 |
| `consents`（数据同意记录，R9 口径） | 同上 | 同上 | 同上 | **不可逆**：仅导出件存档 |
| `snapshots`（快照，境外数据；当前 0 条） | 同上 | 同上（key + size + updated_at 逐条入清单，**不出内容**） | 同上；清单含 key/size/updated_at 逐条核对 | **不可逆**：内容仅存于导出件；当前线上 0 条，删后无存量 |
| Casdoor 用户属性（`hbut_student_id` / `hbut_student_name`） | Casdoor `@<casdoor-host>` | **不删**（属迁移目标，保留）；如需回退，按导出件改回/清空这两个属性 | 回读比对（§2.4 同款） | 可逆（属性级，导出件为准） |

> 说明：`users` 表（学号/姓名）在 v2 语义中已落到 Casdoor 用户属性（迁移目标）；Neon `users` 行是否随实例一并删除见 §4 步骤 3（实例级删除，不可逆，靠导出件）。

## 4. 下线顺序

> 顺序固定：**摘 DNS/流量 → 观察 → 删 Neon 实例 → 删 Vercel 项目**。每步给**回滚动作 + 时间窗**。
> 前置：§2 步骤 7 完成（境外数据已按清单删除）且 §1 条件 3 满足（`reconciled=true` 已归档）。

| 步 | 操作 | 回滚动作 | 时间窗（建议） |
|---|---|---|---|
| 1 | 摘 DNS/流量：`<auth-domain>` 等旧平台域名解析/路由切到 `<new-domain>`（新平台）；Vercel 侧只保留「已切走」状态，不动项目 | **改回 DNS 记录指回旧平台**（Vercel 域名/服务此时完好，秒级生效） | 切换后进入观察期；观察期 ≥ **24h**（含一个完整使用高峰） |
| 2 | 观察：旧平台流量应归零（Vercel 日志/监控）；新平台错误率/验签失败率无异常；确认无客户端仍持旧 issuer 令牌在活跃请求（双 issuer 窗口内旧 issuer 仍可验签，见 §1 条件 1） | 异常 → 立即执行步 1 回滚动作（DNS 指回）；排查后重新进入观察 | 观察期 ≥ 24h；双 issuer 窗口（`dual_issuer` 配置生效）期间执行本步 |
| 3 | 删 Neon 实例（`<neon-host>` 新加坡实例整体删除；数据级删除已在 §2.7 完成） | **实例删除不可回滚**；本步执行前 24h 内必须再做**最后一次只读导出**（覆盖观察期增量）并本地校验（§2.1 验证命令）——该导出件是**唯一**恢复源 | 步 1 切换后 **≥ 48h** 且观察期无异常；删除后 24h 内不做任何回滚决策（回滚 = 重建实例 + 用导出件 `pg_restore`/重建表，属「按导出件恢复」，**不是**一键回滚） |
| 4 | 删 Vercel 项目（`<vercel-project>`：部署、域名绑定、环境变量一并删除） | **不可回滚**（项目/环境变量/部署历史随项目删除）；执行前确认：代码仓（GitHub）完好、无仍在用的域名指向该项目、API 密钥已登记吊销 | 步 3 后 **≥ 72h**；删除前 7 天内为「软下线」窗口（项目保留但已无流量），期间发现遗漏可放弃本步 |

> 回滚语义说明（防误解）：步 1/2 是**可一键回滚**的（DNS）；步 3/4 的「回滚动作」= **按导出件恢复**（重建 + 导入），不是撤销删除。这就是 §6 不可逆项清单与 §5 回滚演练（D1/D5：导出件可重建假服务）的意义。

## 5. 回滚演练记录

> 演练脚本：auth 仓 `scripts/qa/identity_v2_rollback_drill.py`（本地 in-process、假数据、零泄露、≤120s）。
> 本节为**本地演练实测结果**（非生产回滚）；复跑命令见 §7。

**实测（2026-11-12，auth 仓 `3a5a254` 基线，worktree `sa-p43`；`--out=/tmp/p43-drill.json`，总耗时 1430 ms，含 D4 的 4 次 subprocess）**：

> **补充（主 agent 独立复跑）**：首次复跑时 **D4 假失败** —— 演练脚本用 `subprocess.run(..., text=True)` 调 `identity_v2_migrate.py`，被调脚本输出 UTF-8 中文，Windows 默认 locale（GBK）解码抛 `UnicodeDecodeError: 'gbk' codec can't decode byte 0xab`。
> 已修：显式 `encoding="utf-8", errors="replace"`；修后复跑 **5/5 pass**（D1 0.2ms / D2 0.1ms / D3 90.8ms / D4 1252.3ms / D5 0.1ms，总 ≈1.4s）。
> 回归锁：auth 仓 `tests/test_identity_v2_rollback_drill.py`（子进程跑整演练 + 静态断言 `encoding="utf-8"`）。

| 步 | 演练项 | status | 关键实测 | 备注 |
|---|---|---|---|---|
| D1 | 迁移前快照恢复（导出件 → 假服务） | `pass`（0.16 ms） | 计数逐项相等：`users=3 / devices=4 / snapshots=0 / auth_requests=2 / consents=1`（假数据导出件）；公钥指纹逐台一致 | 内存导出件（学号全假值、掩码 `25******01` 等）重建「旧平台假服务」成功 |
| D2 | 映射回滚（属性写错 → 重新 apply 覆盖） | `pass`（0.05 ms） | 基线 `reconciled=true` → 属性写错后 `reconciled=false`（2 条 mismatch：`student_id_mismatch` + `display_name_mismatch`，学号掩码）→ 重新 apply（1 覆盖 + 2 `already_present`）→ 恢复 `reconciled=true` | 幂等覆盖成功；核对表格式与规格 §1 一致 |
| D3 | issuer 回滚（双 issuer，P4-2 harness in-process 画像） | `pass`（204 ms） | 旧 issuer 令牌验签通过（按 `hbut_student_id` 取号）且新 issuer 仍通过（按 `student_id` 取号）；验证器切回「旧 issuer only」后旧令牌仍通过；未知 issuer → `unknown_issuer`；新画像停用 → `issuer_disabled` | 直接 import P4-2 harness `identity_v2_acceptance.py` 的 `_IssuerProfile` / `MultiIssuerValidator`（错误码与 ocr `multi_issuer.py` 逐字一致） |
| D4 | 删除前拦截（purge 无 confirm / confirm 不符 → 非零退出） | `pass`（1225 ms） | `purge` 无 `--confirm` → exit=1（`[拒绝] 删除被拒：缺 --confirm 确认文件`）；`--confirm` hash 不符 → exit=1（`[拒绝] 删除被拒：confirm 文件 sha256 与清单 purge_sha256 不符`）；两条拒绝均命中 **confirm 检查本身**（演练侧还按 purge 清单构造了假服务 `--state` 文件，使命令到达 confirm 检查而非被 `--state` 使用错误短路） | subprocess 调 `scripts/migration/identity_v2_migrate.py`（agent A 交付版）；控制步 `plan` / `purge-plan` 均 exit=0 |
| D5 | 删除后恢复演练（purge → 导出件恢复） | `pass`（0.08 ms） | purge 后 `devices=0 / snapshots=0`；用导出件恢复后 `devices=4 / snapshots=0` == 导出件，公钥指纹逐台一致 | 证明「删除后唯一恢复手段 = 导出件」在本演练中成立 |

> 汇总：`pass=5 / fail=0 / unavailable=0`（2026-11-12 复跑；D4 已由 `unavailable` 转 `pass`——迁移脚本交付后首跑即命中 confirm 拦截）。
> 口径：以上均为**本地演练**（内存假服务 + 假 Casdoor + ephemeral RSA/Ed25519 测试键 + 假数据 subprocess），**不声称生产已回滚**；生产执行与回滚以本清单 §2/§4/§6 为准。

## 6. 不可逆项清单

> 以下操作一经执行**无法撤销**，恢复只能**靠导出件**（§2.1 的最后一次只读导出 + 演练 D1/D5 验证的「导出件 → 重建」语义）。执行任何一项前，必须确认导出件完好、可重建、且已验证计数一致。

| 不可逆项 | 后果 | 唯一恢复手段 | 执行前缓解 |
|---|---|---|---|
| 删 Neon 实例（`<neon-host>`） | 实例、连接串、数据库对象、访问日志全部消失 | **导出件**（`pg_dump` 归档 + `export.json`）：重建实例 → 建表 → 按导出件导入 | 删除前 24h 内做最后一次只读导出并本地校验（§4 步 3）；导出件双副本（本地 + 离线） |
| 删 Vercel 项目（`<vercel-project>`） | 部署历史、域名绑定、环境变量、API 密钥全部消失 | **无 Vercel 侧恢复**；代码以 GitHub 仓为准重建部署（环境变量需人工重新配置，凭据走密钥管理） | 删除前 7 天软下线窗口（§4 步 4）；环境变量/密钥清单提前登记归档（**值不落文档**） |
| 删快照（境外数据，`snapshots`） | 快照内容消失 | **导出件**（当前线上 0 条，无存量内容；若将来有条目，内容须先进导出件/归档） | §2.5 清单逐条含 key/size/updated_at；`purge` 必须有 confirm（H3 + 演练 D4 拦截） |
| 删设备公钥 / auth_requests / consents（数据级） | 对应记录消失 | **导出件**（设备在 v2 下需重新登记，旧公钥仅存档） | 同 §2.5/§2.7：先清单、后确认、再 `--apply`；幂等重跑不产生重复删除（H2） |

> 明确**不属于**不可逆项：Casdoor 用户属性（`hbut_student_id` / `hbut_student_name`，属性级，可按导出件改回）；DNS/流量切换（秒级改回）；dry-run / plan / purge-plan（只读或只写文件）。

## 7. 复跑命令

> ①②③ 为本地验证（2026-11-12 已复跑）；④ 为生产步骤（人工，见 §2/§4，命令占位符需替换真实值，本文不存真实值）。

```bash
# ① 回滚演练（auth 仓；D4 依赖 scripts/migration/identity_v2_migrate.py，缺失时记 unavailable）
cd /d/ct_scratch/sa-p43
PYTHONPATH=. python scripts/qa/identity_v2_rollback_drill.py --out=/tmp/p43-drill.json && cat /tmp/p43-drill.md

# ② P4-2 双 issuer 依据（dual_issuer pass 的复跑）
cd /d/ct_scratch/sa-p43
PYTHONPATH=. python scripts/qa/identity_v2_acceptance.py --only=dual_issuer --out=/tmp/p42-di.json

# ③ mini 侧不回归（清单为纯文档，验证未破坏既有测试）
cd /d/ct_scratch/hb-p43
node_modules/.bin/vitest run src/features/identity src/platform   # 436 passed
node_modules/.bin/tsc --noEmit -p tsconfig.json                    # 0 错误
```

### 7.1 未验证 / 待办

| # | 事项 | 状态 | 解除条件 |
|---|---|---|---|
| 1 | D4 删除前拦截实测（无 confirm / confirm 不符 → 非零退出） | **已实测 pass**（2026-11-12，见 §5 D4 行：两次 exit=1，均命中 confirm 检查） | —（迁移脚本交付后首跑通过；迁移脚本若再变更 CLI，重跑 §7 命令① 复核） |
| 2 | 生产 `plan`/`apply`/`verify`/`purge` 全链路 | **未执行（生产不可触碰，规格 §0）** | 人工按 §2 执行；`verify` 的 `reconciled=true` 归档后验收①关闭 |
| 3 | Neon/Vercel 实际下线（§4 四步） | **未执行** | §2 完成 + 观察期达标 + 人工审批 |
| 4 | 真实 Casdoor 凭据下的属性回读（P4-1 遗留 2 项 `account_linking` / `registration_off`） | `needs_credentials`（交叉引用，不在本清单重复计为通过） | [`identity-v2-casdoor-acceptance.md`](identity-v2-casdoor-acceptance.md) §1 |
| 5 | 导出件 → 生产实例的重建（`pg_restore`/重建表）实操 | **未实操**（演练 D1/D5 只覆盖假服务语义） | 步 3 执行前用最后一次导出件做一次「导出 → 本地重建 → 计数核对」干跑 |
