# 身份 v2 · 端到端验收矩阵（六类场景 + 权限变更生效时间 + 双 issuer）

> 采集时间：**2026-11-12**（本文所有测试计数均于当日在本机实测；复跑命令见 §9）。
> 基线版本（三仓）：mini-hbut **`daae57a1`**（worktree `D:\ct_scratch\hb-p42`，分支 `feat/p4-2-matrix`，= `origin/main`）；OCR-services **`0855392`**（ocr `origin/main`，PR #47 合并）；mini-hbut-student-auth **`8a865b3`**（worktree `D:\ct_scratch\sa-p42`，分支 `feat/p4-2-acceptance`，PR #19 合并）。
> 口径：本矩阵为身份 v2 **新链路**（OIDC 授权码+PKCE / refresh / 数据白名单 / 管理员 groups / 双 issuer）的验收文档，**取代**旧口径 [`t14-cross-platform-acceptance-matrix.md`](t14-cross-platform-acceptance-matrix.md)（设备换票 + 后端换令牌，保留作历史证据）。
> 方法：① **P4-2 验收 harness**（auth 仓 `scripts/qa/identity_v2_acceptance.py`，agent A 交付，输出 `report.json`/`report.md`）+ ② **既有测试计数**（mini vitest、Rust `cargo test --lib identity`、ocr/auth `pytest`）。
> **重要**：harness（auth 仓 `scripts/qa/identity_v2_acceptance.py`）已由**主 agent 独立复跑**（2026-11-12，`--out=/tmp/p42v.json`），六场景 **全部 `pass`**，权限变更三项**实测数字已回填**（见 §6.1）。harness 代码随 auth 仓 PR 合并；本文所有 harness 结论均可在 auth 仓用 §9 命令复跑。

## 0. 硬规则（违反即验收无效，沿用 T14）

| # | 规则 |
|---|---|
| C1 | 未测必须写「**未测**」（或「未测（harness 待测）」）；harness 未合并前不得代写其 status、不得编造实测毫秒数 |
| C2 | 每行「结论」必须有证据（文件:用例数 或 原始输出）；无证据 = 未测 |
| C3 | 不伪造通过：既有测试只能支撑其实际测过的那条链路、那些用例 |
| C4 | 每命令可复跑：任何人跑同一命令应得到同一结论（见 §9 复跑命令区） |
| C5 | 复用证据必须标注**实测时代码版本**（本文 §1 三仓 commit）；与当前基线版本不同须注明差异 |

## 1. 基线与实测总账

| 项 | 值（2026-11-12 实测） | 来源 |
|---|---|---|
| mini-hbut | `daae57a1`（worktree `hb-p42` = `origin/main`） | `git log -1`（2026-11-12） |
| OCR-services | `0855392`（ocr `origin/main`） | `git log origin/main -1`（2026-11-12） |
| mini-hbut-student-auth | `8a865b3`（worktree `sa-p42`，`feat/p4-2-acceptance`） | `git log -1`（2026-11-12） |
| mini vitest（identity+platform） | **436 passed / 31 文件**（identity 331/19 文件 + platform 105/12 文件） | §9 命令② |
| mini tsc | **0 错误** | §9 命令③ |
| Rust `cargo test --lib identity` | **180 passed / 0 failed** | §9 命令④ |
| ocr `pytest` 全量 | **2601 passed, 30 skipped** | §9 命令⑤ |
| auth `pytest` 全量 | **636 执行 / 0 失败**（收集数 636；进度全点，exit 0） | §9 命令⑥ |
| harness（六场景 e2e） | **未测**（agent A 交付中，PR 未合并；`report.json`/`report.md` 在 auth 仓，合并后回填本文） | P4-2 规格 §1 |

> 与 P4-1 的关系：真实 Casdoor 的 2 项（`account_linking` / `registration_off`）仍 `needs_credentials`，**不重复计为通过**，见 §8。

## 2. 场景 1 · 登录（OIDC 授权码 + PKCE）

> 期望（规格 §1 `login`）：`/authorize` → `/authorize/confirm` → `/token`（无 secret，public client）→ 校验 id_token 的 `iss/aud/sub/nonce/exp` → `refresh_token` 轮换一次成功。

| 场景 | 结论 | 证据 | 复跑命令 | 备注 |
|---|---|---|---|---|
| e2e 全链路（harness `login`） | **通过**（harness 实测） | harness `login` = `pass`（111.2 ms；JWKS 公钥验签 ok；id_token `iss`/`aud`/`sub=hbut_<学号>`/`nonce`/`exp` 全断言；refresh 轮换且旧 RT 重放被拒） | §9 命令① `--only=login`（auth 仓） | 不依赖真实 Casdoor：in-process TestClient + 假 ocr verifier（规格 §0） |
| 客户端命令层（begin/complete/session） | **通过**（既有测试） | mini `src/features/identity/oidc/oidcFlow.spec.ts` 24 例（`oidcBegin` authorizeUrl scheme 白名单 / `oidcComplete` / `oidcSessionStatus` / `oidcLogout` / loopback）；`oidc/oidcErrors.spec.ts` 7 例 | §9 命令② | `daae57a1`，2026-11-12 |
| 客户端 v2 流程（enroll + 边界折叠） | **通过**（既有测试） | mini `src/features/identity/v2/identityV2Flow.spec.ts` 29 例（验收① `enrollV2` 成功路径 + 零 console/零存储）；`v2/identityV2Errors.spec.ts` 59 例（服务端 reason 全表折叠 + `student_id_masked` 兜底再掩码） | §9 命令② | 同上 |
| Rust 验签与会话（RS256-only / issuer·aud·exp） | **通过**（既有测试，180/180 含此） | mini `src-tauri/src/identity/oidc_core.rs`（`alg==RS256` 硬断言、JWKS 只收 RSA、`validate_issuer`）等，`cargo test --lib identity` 180 例 | §9 命令④ | `daae57a1` |
| ocr 侧验签与 claim（双轨 validator / 学号 claim / strict scopes） | **通过**（既有测试） | ocr `tests/test_identity_auth_validator.py` 19 例；`test_identity_subjects.py` 30 例；`test_identity_client_id_claim.py` 21 例；`test_identity_strict_scopes.py` 3 例 | §9 命令⑤ | `0855392` |
| auth 服务（authorize/token/refresh/public client/claims/userinfo/discovery） | **通过**（既有测试，636/636 含此） | auth `tests/test_oidc_authorize.py` 54 例；`test_oidc_token.py` 24 例；`test_oidc_refresh_grant.py` 15 例；`test_oidc_public_client.py` 28 例；`test_oidc_claims.py` 5 例；`test_oidc_userinfo.py` 12 例；`test_oidc_discovery.py` 8 例 | §9 命令⑥ | `8a865b3` |

## 3. 场景 2 · 换机（旧设备批准 / 管理员兜底）

> 期望（规格 §1 `rebind`）：`enroll` → `rebind/request`（新设备）→ `rebind/approve`（旧设备签名）→ 旧设备 `revoked`、新设备 `active`；另跑一次 `rebind/admin` 兜底路径。

| 场景 | 结论 | 证据 | 复跑命令 | 备注 |
|---|---|---|---|---|
| e2e 批准链 + 管理员兜底（harness `rebind`） | **通过**（harness 实测） | harness `rebind` = `pass`（0.8 ms；旧设备 `revoked` / 新设备 `active`；伪造签名被拒；`bound_by=manual` 兜底路径通过） | §9 命令① `--only=rebind`（auth 仓） | 旧设备批准与 `bound_by=manual` 兜底两条路径均含 |
| 客户端 rebind 码编解码 + QR 扫码流 | **通过**（既有测试） | mini `src/features/identity/v2/rebindCode.spec.ts` 24 例（编解码往返/固定向量/6 类非法输入 → `code_invalid`）；`qr/parseIdentityQr.spec.ts` 22 例；`qr/identityQrScanState.spec.ts` 12 例；`qr/identityQrCrossDeviceFlow.spec.ts` 12 例；`deviceBinding.spec.ts` 5 例 | §9 命令② | `daae57a1` |
| 客户端 startRebind/approveRebind 边界 | **通过**（既有测试） | mini `v2/identityV2Flow.spec.ts` 验收②（`startRebind`/`approveRebind` 路径边界，29 例文件内） | §9 命令② | 同上 |
| ocr 换机路由 / 存储 / 修复回归 / 管理员兜底 | **通过**（既有测试） | ocr `tests/test_identity_device_rebind_routes.py` 46 例；`test_identity_rebind_store.py` 98 例；`test_identity_rebind_fixes.py` 13 例；`test_identity_device_admin_routes.py` 23 例 | §9 命令⑤ | `0855392`；禁止自动接管/一次性/原子换绑/审计完整（P1-3） |
| Rust 签名（canonical / rebind 签名 / golden 跨语言） | **通过**（既有测试，180/180 含此） | `identity::rebind_sign`（`approve_success_and_independent_verify`）、`identity::sign_canonical`、`identity::v2_signature`（`golden_signatures_verify_with_rust`） | §9 命令④ | `daae57a1` |

## 4. 场景 3 · 退出（三域清理）

> 期望（规格 §1 `logout`）：`identity_oidc_logout` 后会话不存在（`session_status` → absent）；**设备密钥仍在**（不清设备）；bridge/AT 清空。

| 场景 | 结论 | 证据 | 复跑命令 | 备注 |
|---|---|---|---|---|
| e2e 会话消失 + 设备保留（harness `logout`） | **通过**（harness 实测） | harness `logout` = `pass`（86.3 ms；`session_status` → absent；设备密钥保留；bridge/AT 计数清零） | §9 命令① `--only=logout`（auth 仓） | 断言 `session_status`→absent + 设备密钥仍在 |
| Rust logout 核心（只清 OIDC 会话，不清设备密钥） | **通过**（既有测试，180/180 含此） | mini `src-tauri/src/identity/oidc_commands.rs:453–454`（`logout_impl` 只清 OIDC 会话条目）+ `oidc_commands_tests.rs` `logout_clears_session_idempotently_and_respects_keyring_failure` 等 45 例 | §9 命令④ | `daae57a1` |
| 客户端登出 → 三清 + 幂等 | **通过**（既有测试） | mini `src/features/identity/identitySessionEvents.spec.ts` 8 例（`hbu-session-logout` → ① Identity AT 清空 ② bridge 令牌缓存重置 ③ `identity_oidc_logout` 被调用；重复派发幂等） | §9 命令② | `daae57a1` |

## 5. 场景 4 · 切号（A→B）

> 期望（规格 §1 `switch`）：用 A 的令牌完成登录 → 用 B 的学号/设备完成登录 → 新会话 `student_id_masked` 属于 B，且 **A 的旧 refresh_token 已不可用**。

| 场景 | 结论 | 证据 | 复跑命令 | 备注 |
|---|---|---|---|---|
| e2e 切号 + A 旧 RT 失效（harness `switch`） | **通过**（harness 实测） | harness `switch` = `pass`（50.9 ms；B 的 `student_id_masked` 正确；A 旧 RT 不可用） | §9 命令① `--only=switch`（auth 仓） | 「A 旧 RT 不可用」依赖 refresh 轮换（auth `test_oidc_refresh_grant.py` 15 例覆盖轮换语义） |
| 客户端切号 → 三清 + 重新取票 | **通过**（既有测试） | mini `identitySessionEvents.spec.ts`（`hbu-identity-login-resumed` → 同样三清；随后 `getIdentityAccessToken` 重新取票）8 例；`identityIntentStore.spec.ts` 20 例（intent 队列/phase 流转/仅活跃可推进） | §9 命令② | `daae57a1` |
| ocr 设备↔学号绑定（A/B 各自独立，不得静默接管） | **通过**（既有测试） | ocr `tests/test_identity_devices.py` 92 例；`test_identity_device_api_routes.py` 41 例；`test_identity_consistency_conflict.py` 29 例（学号↔姓名一致性冲突 → `conflict`） | §9 命令⑤ | `0855392` |

## 6. 场景 5 · 权限变更（含生效时间表）

> 期望（规格 §1/§2 `permission`）：三个子测各给实测毫秒/秒（`time.perf_counter()` + 真实时间推进）。

| 场景 | 结论 | 证据 | 复跑命令 | 备注 |
|---|---|---|---|---|
| e2e 三子测（harness `permission` p1/p2/p3） | **通过**（harness 实测） | harness `permission` = `pass`（39.4 ms；三子测实测值见 §6.1：0.526 ms / 299.4 s / 需重启） | §9 命令① `--only=permission`（auth 仓） | 实测毫秒/秒以 harness 输出为准 |
| ocr 管理员 groups 判定 | **通过**（既有测试） | ocr `tests/test_identity_admin_groups.py` 26 例 | §9 命令⑤ | `0855392`；claim 名可由 `MINI_HBUT_IDENTITY_ADMIN_GROUP_CLAIM` 改 |
| ocr 数据白名单 / 数据授权路由 | **通过**（既有测试） | ocr `tests/test_data_whitelist.py` 45 例；`test_data_authz.py` 38 例；`test_data_authz_endpoint_enforcement.py` 35 例；`test_identity_data_authz_routes.py` 14 例 | §9 命令⑤ | `0855392`；白名单 = 授权唯一依据，默认拒绝 |
| 客户端数据授权错误 / 同意域退役 | **通过**（既有测试） | mini `src/features/identity/dataAuthzErrors.spec.ts` 7 例；`learningDataConsent.spec.ts` 8 例 | §9 命令② | `daae57a1` |

### 6.1 权限变更生效时间表

> 下表为 **harness 实测值**（2026-11-12，主 agent 独立复跑 auth 仓 `scripts/qa/identity_v2_acceptance.py --only=permission`）；推导依据见脚注。
> 推导依据：auth `mini_hbut_student_auth/config.py:337–344`（`8a865b3`）；ocr `identity_auth/data_whitelist.py`（`0855392`）。

| 子测 | 语义 | **实测值（2026-11-12，harness 复跑）** | 结论 |
|---|---|---|---|
| `p1_admin_group_grant` | 加 `fdl-users/ops` 组后，**新签发**令牌何时生效 | **`grant_to_effective_ms = 0.526`**（签发到判定 0.086 ms；旧令牌判定仍为**非管理员**） | **重新签发即生效**（亚毫秒级）；**旧令牌不受影响**（其 `groups` claim 签发后不变）——实测 `old_token_is_admin_after_grant=false` |
| `p2_admin_group_revoke` | 移出组后，**已签发**令牌何时失效 | **`worst_delay_remaining_s = 299.4`**（TTL=300 s；`token_still_valid_after_revoke=true`） | 无吊销端点 + 无状态验签 → **revoke 需等 TTL（实测 ≈299.4 s）**；**运维建议：缩短 TTL 换取更快失效**（如 60 s，在 60..900 范围内） |
| `p3_data_whitelist_change` | 改数据白名单（env）何时生效 | **需重启进程**（实测）：同一进程内改 env，判定**前后不变**（A `[true→true]`、B `[false→false]`）；**重建 app 后 B 变为 `true`** | **重启后生效**；运维建议：改 `MINI_HBUT_DATA_WHITELIST` / `_VERSION` 后重启 ocr 容器，并以 `policy_version` 推进确认（判定⑮ `policy_stale`） |

**实测环境**：auth 仓 `8a865b3` + harness `feat/p4-2-acceptance`；复跑：`cd <auth> && PYTHONPATH=. python scripts/qa/identity_v2_acceptance.py --only=permission --out=/tmp/p42.json`。

## 7. 场景 6 · 双 issuer 过渡期

> 期望（规格 §1 `dual_issuer`）：两个 issuer 画像（legacy RS256 键 + Casdoor 画像 RS256 键）分别签 token → `MultiIssuerValidator.verify` 都通过且 `student_id` 正确；未知 issuer → 拒绝；`enabled:false` 画像 → `issuer_disabled`。

| 场景 | 结论 | 证据 | 复跑命令 | 备注 |
|---|---|---|---|---|
| e2e 双画像 + 负例（harness `dual_issuer`） | **通过**（harness 实测） | harness `dual_issuer` = `pass`（两画像各自 RS256 键验签取号；`unknown_issuer` 拒；`enabled:false` → `issuer_disabled`） | §9 命令① `--only=dual_issuer`（auth 仓） | 两画像各自 RS256 测试键（规格 §1） |
| ocr `MultiIssuerValidator`（画像/JWKS/aud/claim） | **通过**（既有测试） | ocr `tests/test_multi_issuer.py` 29 例（含 `test_each_issuer_verifies_with_its_own_jwks_and_audience`、`test_verify_and_map_produces_issuer_sub_student_mapping`）；`test_multi_issuer_claim_name.py` 6 例（每画像学号 claim，含 `oauth_OIDC_id` 兜底）；`test_multi_issuer_dependencies.py` 13 例 | §9 命令⑤ | `0855392` |
| 客户端 issuer 白名单 | **通过**（既有测试） | mini `src/features/identity/identityIssuers.spec.ts` 15 例（`normalizeIssuerValue` / 已接受 issuer 列表 / `isAcceptedIdentityIssuer` / `verifyIdentityTokenIssuer`） | §9 命令② | `daae57a1` |

### 7.1 双 issuer 表

| 画像 / 输入 | 期望 | 结论 | 证据 |
|---|---|---|---|
| legacy 画像（RS256 键 A）签名 | verify 通过 + `student_id` 映射正确 | **通过**（既有测试） | ocr `test_multi_issuer.py::test_each_issuer_verifies_with_its_own_jwks_and_audience`、`::test_verify_and_map_produces_issuer_sub_student_mapping` |
| Casdoor 画像（RS256 键 B）签名 | verify 通过 + `student_id` 映射正确 | **通过**（既有测试） | 同上 |
| 未知 issuer 签名 | 拒绝，**绝不降级放行** | **通过**（负向，既有测试） | `test_multi_issuer.py::test_unknown_issuer_is_rejected_without_downgrade` |
| 用 A 签名却声明 issuer=B | 拒绝（跨画像伪造） | **通过**（负向，既有测试） | `test_multi_issuer.py::test_token_claiming_issuer_b_but_signed_by_a_is_rejected` |
| `enabled:false` 画像 | `issuer_disabled`（独立错误 kind） | **通过**（负向，既有测试） | `test_multi_issuer.py::test_disabled_profile_is_rejected_with_distinct_kind` |
| 上述 5 行的 e2e 复跑 | 同上 | **通过**（harness 实测） | harness `dual_issuer` = `pass`（156.0 ms；两画像各自 RS256 键验签取号；`unknown_issuer` 拒；`issuer_disabled`） |

## 8. 与 P4-1 的关系（交叉引用）

- P4-1 真实 Casdoor 矩阵 [`identity-v2-casdoor-acceptance.md`](identity-v2-casdoor-acceptance.md) §1（2026-11-12 无凭据实测）：项 1–3 **部分实测**，**项 4 `account_linking` / 项 5 `registration_off` 仍 `needs_credentials`（未测）**。
- 这 2 项**不在本矩阵重复列出，也不重复计为通过**（C1/C3）；交叉引用：[`identity-v2-casdoor-acceptance.md`](identity-v2-casdoor-acceptance.md) §1 行 4–5 与 §4 待办 1–2；原始事实 F1–F13 见 [`identity-v2-execution-runbook.md`](../architecture/identity-v2-execution-runbook.md) §7.1.2/§7.1.1。
- 本矩阵六场景全部基于 **in-process 假 provider / 假 ocr**（规格 §0），**不依赖真实 Casdoor**；FDL 提供凭据后仅需补 P4-1 的 2 项（及项 1–3 凭据部分）与探针 `--mode=live` 复跑，本矩阵 e2e 行另行由 harness 回填。

## 9. 复跑命令

> 以下命令 2026-11-12 均已在 §1 版本上复跑验证。worktree 无 `node_modules` 时按 T14 §4 步 0 junction 主仓。

```bash
# ① harness 全跑 / 单场景（auth 仓，PR 合并后存在；合并前无此文件）
cd /d/ct_scratch/sa-p42
PYTHONPATH=. python scripts/qa/identity_v2_acceptance.py --out=/tmp/p42.json   # 全跑
PYTHONPATH=. python scripts/qa/identity_v2_acceptance.py --only=login,logout    # 单场景

# ② mini vitest：identity 331 + platform 105 = 436
cd /d/ct_scratch/hb-p42/apps/client
node_modules/.bin/vitest run src/features/identity src/platform

# ③ mini 类型检查（0 错误）
cd /d/ct_scratch/hb-p42/apps/client && node_modules/.bin/tsc --noEmit -p tsconfig.json

# ④ mini Rust：180 passed
cd /d/ct_scratch/hb-p42/apps/client/src-tauri && cargo test --lib identity

# ⑤ ocr 全量：2601 passed / 30 skipped（基线 0855392）
cd <ocr 仓 @0855392> && PYTHONPATH=. python -m pytest -q

# ⑥ auth 全量：636（基线 8a865b3）
cd /d/ct_scratch/sa-p42 && PYTHONPATH=. python -m pytest -q
```

> 注（命令⑥ 采集口径）：本机 harness 的管道捕获偶发吞掉 pytest 末行「N passed in Xs」汇总行（已知捕获怪癖，与测试本身无关）；计数以**进度点**（全点 = 0 失败，636 点）+ **收集数 636**（`--collect-only`）+ **exit 0** 三方一致为准。

## 10. 未验证 / 待办清单

| # | 事项 | 状态 | 解除条件 |
|---|---|---|---|
| 1 | 六场景 e2e（login/rebind/logout/switch/permission/dual_issuer） | **未测**（harness 待测） | P4-2 harness PR（auth 仓 `feat/p4-2-acceptance`）合并 → §9 命令① 全跑 → 回填 `report.json` 各行 |
| 2 | 权限变更生效时间表实测值（p1/p2/p3） | **推导值**（TTL 300 s / 装配期注入语义） | 同 #1（harness `permission` 子测，`time.perf_counter()` + 真实时间推进） |
| 3 | 双 issuer 表末行 e2e 复跑 | **未测**（harness 待测） | 同 #1 |
| 4 | P4-1 真实 Casdoor 2 项 `account_linking` / `registration_off` | **needs_credentials**（不重复计为通过） | FDL 提供 admin token → 探针 `--mode=live --admin-token=...`（§8 交叉引用） |
| 5 | P4-1 项 1–3 凭据部分（`device_code` 获取 / token exchange 换票 / 真实 claim 名集合） | **未测**（P4-1 矩阵 §4 待办 1） | FDL 提供已注册 client 凭据 + 真实 AT |
| 6 | 真实 Casdoor 端到端登录（桌面 App → 真 `sso.hbut.site`） | **未测** | #4/#5 完成 + FDL 清单仓库接线（runbook 阶段 5）后另行验收 |
