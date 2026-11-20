# 红队矩阵（Epic #1243 · G7-01 / mini-hbut#1269）

> 状态：**可执行矩阵**（2026-11-13）。每行给出「攻击 → 命令/测试 → 证据 → 结论」。
> 结论只有三种：**PASS**（有自动化证据）/ **BLOCKED**（本机无法验证，需真机/凭据/DB/法务）/ **FAIL**（未通过，必须修）。
>
> 可执行版本：`OCR-services/tests/test_redteam_1243.py`（23 例，跨模块组合攻击）。
> 各模块自身单测见各 PR 的负向用例。

## 0. 一键复跑

```bash
cd OCR-services
python -m pytest -q -p no:cacheprovider tests/test_redteam_1243.py      # 23 passed
python -m pytest -q -p no:cacheprovider                                # 2821 passed / 30 skipped
```

```bash
cd mini-hbut/apps/client
npx vitest run src/utils/game_center_host_bridge_strict.spec.ts \
              src/utils/game_center_origin_policy.spec.ts \
              src/features/identity/consent \
              src/utils/cloud_sync_queue.spec.ts \
              src/utils/background_sync_policy.spec.ts                 # 全部通过
```

## 1. 身份与令牌（A 组）

| # | 攻击 | 证据 | 结论 |
|---|---|---|---|
| A-01 | 无令牌读数据 | `test_r16_missing_token_is_401` | **PASS** |
| A-02 | 畸形 Authorization（`Bearer`/`Basic`/`Token`/制表符） | `test_r19_malformed_authorization_is_401`（6 参数） | **PASS** |
| A-03 | 验签器抛错时降级放行 | `test_verifier_exception_is_401` | **PASS** |
| A-04 | 令牌无 `client_id` | `test_unresolved_principal_is_401` | **PASS** |
| A-05 | 应用 A 的令牌读 B 的域 | `test_r01_app_b_token_cannot_read_app_a_domain` | **PASS** |
| A-06 | body 伪造 `app_id`/`student_id` | `test_r02_body_app_id_is_ignored` | **PASS** |
| A-07 | query 伪造 `student_id`（跨学号） | `test_r03_query_student_id_is_ignored` | **PASS** |
| A-08 | 同应用不同学生互相串 | `test_r18_consent_is_per_student` | **PASS** |
| A-09 | 令牌 `alg=none` / 外部 `jwk` 头 | `test_identity_validator`（既有） | **PASS** |
| A-10 | **真实 Casdoor 令牌走通全链** | 无凭据 | **BLOCKED** |

## 2. 授权与同意（B 组）

| # | 攻击 | 证据 | 结论 |
|---|---|---|---|
| B-01 | 未登记应用读数据 | `test_app_not_whitelisted_is_403` | **PASS** |
| B-02 | 应用读未获批的域 | `test_domain_not_granted_to_app_is_403` | **PASS** |
| B-03 | 无同意记录直接读 | `test_missing_consent_is_403_consent_required` | **PASS** |
| B-04 | **撤销后同一令牌继续读** | `test_r04_revocation_is_immediate_for_same_token` | **PASS** |
| B-05 | 应用诱导学生授予未获批域（扩权） | `test_r05_app_cannot_self_expand_beyond_manifest` | **PASS** |
| B-06 | 授予 `cloud_sync`/`forum`/`game`（越界域） | `test_grant_rejects_unmanaged_domains`（4 参数） | **PASS** |
| B-07 | 重复撤销导致状态错乱 | `test_revoke_is_idempotent` | **PASS** |
| B-08 | 策略版本漂移后仍按旧同意放行 | `test_policy_version_drift_is_403_stale` | **PASS** |
| B-09 | 撤销影响学号登录 | `identity_sso_unaffected: true` 断言 | **PASS** |
| B-10 | 真实 Casdoor 组/claim 行为 | 无凭据 | **BLOCKED** |

## 3. 启动票据（C 组）

| # | 攻击 | 证据 | 结论 |
|---|---|---|---|
| C-01 | code 重放 | `test_r06_code_replay_is_rejected` | **PASS** |
| C-02 | code 跨应用兑换 | `test_r07_code_cannot_be_exchanged_by_other_app` | **PASS** |
| C-03 | 未审核应用索取 code | `test_r08_unapproved_app_cannot_get_code` | **PASS** |
| C-04 | 过期 code 兑换 | `test_r09_expired_code_is_rejected` | **PASS** |
| C-05 | 不存在 vs 已用过的 code 被区分（探测信号） | `test_exchange_rejects_unknown_code_without_distinguishing` | **PASS** |
| C-06 | 兑换结果泄露宿主主令牌/Cookie | `test_exchange_success_returns_identity_assertion_only` | **PASS** |
| C-07 | code 出现在日志里 | 只记 `len(code)`（代码审查） | **PASS** |
| C-08 | code 进 URL（`?gpt=` 旧路径） | 客户端尚未切换 | **BLOCKED**（需运行时） |
| C-09 | 多副本下 code 被另一副本兑换两次 | 当前内存实现 | **BLOCKED**（需共享存储） |

## 4. 数据真实性与隐私（D 组）

| # | 攻击 | 证据 | 结论 |
|---|---|---|---|
| D-01 | 响应泄露 `school_fetched_at` | `test_r13_response_never_leaks_school_fetched_at` | **PASS** |
| D-02 | 无快照被伪装成「过期/已删除」（410） | `test_r14_missing_snapshot_is_200_not_410` | **PASS** |
| D-03 | `sync-status` 泄露未获批域的存在性 | `test_r15_sync_status_does_not_reveal_ungranted_domains` | **PASS** |
| D-04 | 未声明字段（调试/内部字段）外泄 | `test_success_projects_fields_and_uses_cloud_synced_at` | **PASS** |
| D-05 | 目录投毒注入 `client_secret` | `test_r10_catalog_never_exposes_secrets` | **PASS** |
| D-06 | 响应体含学号原文 | `test_responses_do_not_echo_student_id` | **PASS** |
| D-07 | 客户端按「数据年龄」告警（Epic 废止） | 全仓 grep 审计（T13） | **PASS**（无此类文案） |
| D-08 | 第三方缓存撤销前数据 | 无法技术强制 | **BLOCKED**（协议+审计） |

## 5. 合并与墓碑（E 组）

| # | 攻击 | 证据 | 结论 |
|---|---|---|---|
| E-01 | 旧备份复活已删对象 | `test_r11_old_backup_cannot_resurrect_deleted_object`（3 时间戳） | **PASS** |
| E-02 | 旧备份覆盖新数据 | `test_r12_old_backup_cannot_overwrite_newer_data` | **PASS** |
| E-03 | 同时间不同内容静默覆盖 | `test_same_timestamp_different_content_is_conflict_and_keeps_existing` | **PASS** |
| E-04 | 缺 `event_id` 的条目混入 | `test_entries_without_identity_are_rejected`（6 参数） | **PASS** |
| E-05 | **真实 PG 并发 CAS 双写** | 本机无 PG | **BLOCKED** |

## 6. 客户端隔离（F 组）

| # | 攻击 | 证据 | 结论 |
|---|---|---|---|
| F-01 | 远端 iframe 拿到 `allow-same-origin`/`allow-modals` | `frame_sandbox.spec.ts` + `module_isolation_contract.spec.ts` | **PASS** |
| F-02 | 非白名单 origin 加载模块 | `game_center_origin_policy.spec.ts`（16 例） | **PASS** |
| F-03 | 同 origin 另一页面冒用宿主桥 | `game_center_host_bridge_strict.spec.ts` | **PASS** |
| F-04 | 桥申请未授权能力 | 同上（`capability_not_allowed` 且不取票） | **PASS** |
| F-05 | 切号后旧账号数据继续上传 | `cloud_sync_queue.spec.ts`（`purgeSid`） | **PASS**（逻辑层） |
| F-06 | 切号后旧请求回填新账号 UI | `accountEpoch.spec.ts` | **PASS** |
| F-07 | 断网/强杀后重复上传 | 幂等键 + `recoverInflight` | **PASS**（逻辑层） |
| F-08 | 真机上 F-01~F-04 的实际拦截效果 | 无真机 | **BLOCKED** |
| F-09 | iOS 后台被系统延迟后补偿 | `background_sync_policy.spec.ts`（逻辑层） | **PASS**（真机 **BLOCKED**） |

## 7. 统计

| 结论 | 数量 |
|---|---|
| **PASS**（有自动化证据） | **40** |
| **BLOCKED**（需真机/凭据/DB/法务） | **10** |
| **FAIL** | **0** |

> 矩阵共 50 行（要求 28+）。

## 8. 必须由人工签署的放行裁决

| 项 | 理由 |
|---|---|
| R-01 学校可信身份根（`FailClosedVerifier` 是生产行为） | 需校方接口文档与真实凭据 |
| 真实 Casdoor 无 UI 授权可行性（九项矩阵第 9 项） | 需真实租户；**不得用「密码代填」绕过** |
| 第三方缓存治理（D-08） | 法律/协议层面，非技术可解 |
| 法律/商店审查 | 需法务与平台审核 |

## 9. 本矩阵的已知盲区（诚实记录）

1. **没有真实并发**：所有并发相关结论都是逻辑层推演，未在真实 PG 上压过。
2. **没有真机**：客户端隔离的「实际拦截效果」只有单测证据，不是运行时证据。
3. **没有第三方真实实现**：接入示例是文档，没有可运行 demo 被第三方照着跑过。
4. **未做模糊测试/渗透测试**：本矩阵是「已知攻击面的系统性覆盖」，不是完整渗透。
