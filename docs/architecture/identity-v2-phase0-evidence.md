# Identity V2 · 阶段 0 四方联调证据（P0-8 / mini-hbut#1214）

> 配套：[`identity-v2-execution-runbook.md`](identity-v2-execution-runbook.md) §1.2 出口条件
> 规格：`goal-10/evidence/p0-8-phase0-e2e-spec.md`（冻结版，§4 脚本 / §5 证据）
> 一键脚本：[`../../scripts/identity_v2_phase0_e2e.py`](../../scripts/identity_v2_phase0_e2e.py)
> 假 Casdoor：[`../../scripts/identity_v2_phase0_fake_casdoor.py`](../../scripts/identity_v2_phase0_fake_casdoor.py)
> JSON 证据（脚本 `--json-out` 产物，含每步命令/状态码/响应体/断言/时间戳）：[`identity-v2-phase0-evidence.json`](identity-v2-phase0-evidence.json)
> 状态：**[RESULT] PASS，退出码 0**（2026-11-10，11 步全部通过；总耗时 113.0s）

---

## 1. 环境

| 项 | 值 |
|---|---|
| 机器 | Windows（本机回环联调；不连 NAS、不连真实 Casdoor、不碰生产配置） |
| 日期 | 2026-11-10（运行时间戳见 JSON `meta.generated_at`） |
| mini-hbut（本 worktree） | `D:\ct_scratch\hb-p08`，分支 `feat/p0-8-phase0`（基线 = `origin/main` `92de0263`；分支上的 P0-8 提交见 PR） |
| ocr-service 检出 | `D:\ct_scratch\ocr-golden`，`799827ff`（main=799827f，只读） |
| mini-hbut-student-auth 检出 | `D:\ct_scratch\sa-p08`，分支 `feat/p0-8-exchange`（基线 = `origin/main` `58774b0`；`/debug/exchange` 为分支上的新交付） |
| App 签名 | `cargo run --quiet --example identity_v2_dev_sign`（worktree 新文件 `apps/client/src-tauri/examples/identity_v2_dev_sign.rs`；脚本**默认** `--cargo-target-dir` = 主仓预热 target `D:/Documents/C_learn/成绩查询/tauri-app/apps/client/src-tauri/target`，故命令行里不显式出现——检查 2 复核 A 指出该措辞与记录命令不符，已在此说明） |
| Python | 3.13.7（两个脚本均纯标准库） |
| 命令 | `python scripts/identity_v2_phase0_e2e.py --root . --ocr-dir /d/ct_scratch/ocr-golden --sa-dir /d/ct_scratch/sa-p08` |
| 端口 | 8941 ocr / 8942 新服务 / 8943 假 Casdoor（探测结果：均空闲，直接使用基准端口） |
| 服务日志 | `D:/ct_scratch/p08-logs/{ocr,student-auth,fake-casdoor}.log` |
| 种子 | `--seed-hex` = `5a`×32（阶段 0 联调**测试**种子；每次运行 nonce 随机、idtoken 密钥随机）。检查 2 复核 B 指出旧默认 `07`×32 与本机 keyring 设备密钥相同 → 已换值，且证据文件里种子**脱敏**（只记「用了默认值」） |
| 假 Casdoor 自检 | 一键脚本 step 1 先跑 `identity_v2_phase0_fake_casdoor.py --selftest`（8 条：真票通过 + alg=none/篡改/错钥/过期×2/缺 jti/坏 sub 全拒）——给「拒绝路径」加回归保护（复核 B 变异发现原来会被静默放过） |

**三类清单（诚实口径，规格 §0/§5）**：

- **真实实现**（本次实测有效）：
  - P0-6 canonical 验签（`identity_auth.device_signature`，判定顺序 缺失→alg→时间窗→canonical→登记行→公钥→签名→nonce）；
  - P0-4/5 设备登记表（ocr 侧 `/identity/debug/device/{register,verify,list,revoke}`，登记/掩码/吊销语义真实）；
  - P0-7 App 侧 Ed25519 签名（`identity::v2_signature`，example 只是 CLI 壳，canonical/签名/自检与 App 同一份代码）；
  - 跨语言 nonce 一次性（ocr 侧 `InMemoryNonceStore`：Rust 签的 nonce 被 Python 服务消费/拒重放）。
- **dev 缝（阶段 0 专用，生产默认不存在）**：
  - 全部 `/debug/*` 端点（新服务 `DEBUG_ENDPOINTS=1`、ocr `MINI_HBUT_IDENTITY_DEBUG=1` 门控，关闭即 404）；
  - `/debug/exchange` 的 HS256 id_token（密钥 `MINI_HBUT_DEBUG_IDTOKEN_SECRET` 由脚本每 run 随机注入；生产签名是 RS256/ES256 + JWKS，属 P2-1）；
  - 假 Casdoor（`identity_v2_phase0_fake_casdoor.py`，stdlib stub，只回 claims + 16 位指纹）；
  - InMemory 设备存储与 `DebugCodeStore`（TTL 60s、一次性）。
- **尚未实现（不得描述为已有）**：
  - P2-1 生产 OIDC（discovery / authorize / token + JWKS）；
  - P2-2 客户端对接（Tauri 正式命令通道 + Casdoor 原生客户端）；
  - P2-3 Casdoor 上游配置与 NAS 部署；
  - PG 设备存储（本次 InMemory）；
  - 真机 webview IPC（本联调全程无 GUI，example 是控制台程序，未启动 `tauri dev`/任何窗口）。

---

## 2. 逐步真实输出（脚本 stdout 原样，最终一次运行）

> 本次 stdout 与配套 `identity-v2-phase0-evidence.json` 是**同一次运行**，且**在合并后的 main 上跑的**
> （`mini-hbut c6caa4c9` + `mini-hbut-student-auth bb27607` + `ocr-service 799827f`，见 JSON `meta.repos`；
> 检查 2 复核 B 指出旧版 meta 记录的是合并前的分支快照，已重跑消除歧义）。
> 命令：`python scripts/identity_v2_phase0_e2e.py --root . --ocr-dir <ocr 检出> --sa-dir <新仓检出>`
> 结果：`[RESULT] PASS`、退出码 `0`、总耗时 `113.0s`。

```text
[step 1] 端口探测 + 启动 3 个服务（ocr / 新服务 / 假 Casdoor）+ 等 /health
  · 端口探测：实际使用 ocr=8941 / 新服务=8942 / 假Casdoor=8943（尝试记录见 JSON）
  · MINI_HBUT_DEBUG_IDTOKEN_SECRET 已生成（不回显，只注入 env/参数）
  · [selftest] 真票通过: claims=True err=None -> PASS
  · [selftest] alg=none 拒绝: claims=False err=invalid_shape -> PASS
  · [selftest] 签名篡改拒绝: claims=False err=bad_signature -> PASS
  · [selftest] 错钥拒绝: claims=False err=bad_signature -> PASS
  · [selftest] 缺 jti 拒绝: claims=False err=missing_claim -> PASS
  · [selftest] 过期拒绝: claims=False err=expired -> PASS
  · [selftest] 过期（now-1）拒绝: claims=False err=expired -> PASS
  · [selftest] sub 非 hbut_ 拒绝: claims=False err=bad_sub -> PASS
  · [selftest] 全部 8 条符合预期（拒绝路径有回归保护）
  ✓ 断言「假 Casdoor 验签器自检（拒绝路径回归）」：期望 `--selftest` 退出码 0（含 alg=none/篡改/错钥/过期/缺 claim/坏 sub 全拒）；实际 exit=0
  已启动 ocr（pid=281400，日志 D:/ct_scratch/p08-logs\ocr.log）
  已启动 student-auth（pid=151084，日志 D:/ct_scratch/p08-logs\student-auth.log）
  已启动 fake-casdoor（pid=315608，日志 D:/ct_scratch/p08-logs\fake-casdoor.log）
  · ocr /health 200（5.5s，响应体见 JSON 证据 meta.health）
  · student-auth /health 200（0.0s，响应体见 JSON 证据 meta.health）
  · fake-casdoor /health 200（0.0s，响应体见 JSON 证据 meta.health）
[step 2] App 签名：cargo run --example identity_v2_dev_sign（复用 identity::v2_signature）
  · cargo 命令：cargo run --quiet --example identity_v2_dev_sign -- --device-id phase0-dev-0001 --student-id 2510234567 --student-name 张三 --seed-hex *** --nonce 20e873a6c5adac2cb4629da3a5ac1dc2 --ts 1794267459（cwd=.\apps\client\src-tauri，耗时 86.9s）
  · cargo 退出码：0；stderr 尾部：d: Option<&OnlineLearningPlatformStateRecord>) -> Value {
    |               ^^^^^^^^^^^^^^^^^

warning: function `resolve_online_learning_student_id` is never used
   --> src\transport\tauri\chaoxing.rs:241:4
    |
241 | fn resolve_online_learning_student_id(
    |    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ …（截断，共 600 字符）
  · App 证明（stdout 那行 JSON）：{"device_id": "phase0-dev-0001", "student_id": "2510234567", "student_name": "张三", "student_name_hash": "1d841bc0ee98309cb7916670b7f0fdef5f4c35150711a41405ef3633b56322cf", "nonce": "20e873a6c5adac2cb4629da3a5ac1dc2", "ts": 1794267459, "alg": "Ed25519", "canonical": "v1|phase0-dev-0001|2510234567|1d841bc0ee98309cb7916670b7f0fdef5f4c35150711a41405ef3633b56322cf|20e873a6c5adac2cb4629da3a5ac1dc2|1794267459", "signature": "SFqOFZo__ti4XSzO-59drX0qfhbUOdgYgNEj7r7W7jh8q07XqbMidsggI4Obhqsi6CtPAJYrcxs2yqjKneR6AA", "public_key_jwk": "{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"DXVQdU4IAKXSN-71gmA1dmubPloVhoqUCrKJlYeI47A\"}", "self_check_ok": true}
  ✓ 断言「self_check_ok」：期望 self_check_ok == true 且退出码 0；实际 self_check_ok=True, exit=0
  ✓ 断言「canonical 跨语言一致」：期望 Rust build_v2_canonical 输出 == Python 重算；实际 rust='v1|phase0-dev-0001|2510234567|1d841bc0ee98309cb7916670b7f0fdef5f4c35150711a41405ef3633b56322cf|20e873a6c5adac2cb4629da3a5ac1dc2|1794267459' py='v1|phase0-dev-0001|2510234567|1d841bc0ee98309cb7916670b7f0fdef5f4c35150711a41405ef3633b56322cf|20e873a6c5adac2cb4629da3a5ac1dc2|1794267459'
  ✓ 断言「public_key_jwk」：期望 OKP/Ed25519 公钥 JWK（43 位 base64url x，无 d）；实际 {"kty":"OKP","crv":"Ed25519","x":"DXVQdU4IAKXSN-71gmA1dmubPloVhoqUCrKJlYeI47A"}
[step 3] 未登记失败路径：device_id 尚未登记时 /debug/verify 必须 fail-closed
  → POST http://127.0.0.1:8942/debug/verify
    HTTP 401
    响应体（截断 800）：{"error":"not_verified","reason":"upstream_unauthorized"}
  ✓ 断言「SA 层 fail-closed」：期望 401 not_verified（冻结映射）或 200 ok:false（规格字面）；实际 401 not_verified（fail-closed）
  → POST http://127.0.0.1:8941/identity/debug/device/verify（直接探 ocr 根因）
    HTTP 401
    响应体（截断 800）：{"error":"signature_invalid","reason":"device_not_registered"}
  ✓ 断言「ocr 层根因」：期望 401 且 reason==device_not_registered；实际 401 reason=device_not_registered
[step 4] 登记：POST ocr /identity/debug/device/register（JWK 来自 App 证明）
  → POST http://127.0.0.1:8941/identity/debug/device/register
    HTTP 200
    响应体（截断 800）：{"ok":true,"action":"create","reason":"no_existing_row","status":"active","bound_by":"first_claim","device_id":"phase0-dev-0001","student_id_masked":"2510***"}
  ✓ 断言「登记成功」：期望 200 且 ok=true，student_id_masked==2510***；实际 HTTP 200 {"ok":true,"action":"create","reason":"no_existing_row","status":"active","bound_by":"first_claim","device_id":"phase0-dev-0001","student_id_masked":"2510***"}
[step 5] 验签成功：同一证明再发 → /debug/verify ok:true（跨语言 Ed25519）
  → POST http://127.0.0.1:8942/debug/verify
    HTTP 200
    响应体（截断 800）：{"ok":true,"status":"active","bound":true,"student_id_masked":"2510***","reason":null}
  ✓ 断言「验签通过」：期望 200 且 ok=true 且 bound=true；实际 HTTP 200 {"ok":true,"status":"active","bound":true,"student_id_masked":"2510***","reason":null}
[step 6] 重放失败路径：同一证明再发一次 → 必须命中 nonce_replayed（跨语言 nonce 一次性）
  → POST http://127.0.0.1:8942/debug/verify（重放）
    HTTP 401
    响应体（截断 800）：{"error":"not_verified","reason":"upstream_unauthorized"}
  ✓ 断言「SA 层 fail-closed」：期望 401 not_verified 或 200 ok:false；实际 401 not_verified（fail-closed）
  → POST http://127.0.0.1:8941/identity/debug/device/verify（重放，直接探 ocr 根因）
    HTTP 401
    响应体（截断 800）：{"error":"signature_invalid","reason":"nonce_replayed"}
  ✓ 断言「nonce 一次性」：期望 401 且 reason==nonce_replayed（必须命中）；实际 401 reason=nonce_replayed
[step 7] 授权码：/debug/authorize（新证明/新 nonce）→ 200 且 code 匹配 dbg_+32hex
  · cargo 命令：cargo run --quiet --example identity_v2_dev_sign -- --device-id phase0-dev-0001 --student-id 2510234567 --student-name 张三 --seed-hex *** --nonce 811d6812d37beb7925c2d482a87fc236 --ts 1794267555（cwd=.\apps\client\src-tauri，耗时 1.9s）（退出码 0）
  · 新证明 B（nonce=811d6812d37beb7925c2d482a87fc236）
  → POST http://127.0.0.1:8942/debug/authorize
    HTTP 200
    响应体（截断 800）：{"ok":true,"code":"dbg_66f1692feee3511b9e5ba6c799515ed9","student_id_masked":"2510***","redirect_uri":null,"expires_in":60}
  ✓ 断言「授权码签发」：期望 200 且 ok=true 且 code 匹配 ^dbg_[0-9a-f]{32}$；实际 HTTP 200 code='dbg_66f1692feee3511b9e5ba6c799515ed9'
[step 8] 假 Casdoor 换令牌：fake /oidc/exchange → 新服务 /debug/exchange → JWT 校验
  → POST http://127.0.0.1:8943/oidc/exchange
    HTTP 200
    响应体（截断 800）：{"ok": true, "claims": {"alg": "Ed25519", "aud": "phase0-fake-casdoor", "auth_time": 1794267559, "device_id": "phase0-dev-0001", "exp": 1794268159, "iat": 1794267559, "iss": "http://127.0.0.1:8942", "jti": "dab43d4e1d1923f89c47e759fb99346a", "nonce": "811d6812d37beb7925c2d482a87fc236", "student_id_masked": "2510***", "sub": "hbut_2510234567"}, "id_token_fingerprint": "95096bbd5d4f103d"}
  ✓ 断言「换令牌成功」：期望 200 且 ok=true，claims 含 iss/aud/exp/sub/jti 且 sub 以 hbut_ 开头，指纹 16 位 hex；实际 HTTP 200 ok=True err=None fp='95096bbd5d4f103d' sub='hbut_2510234567'
[step 9] 错签失败路径：签名改一个 base64url 字符（新证明/新 nonce）→ signature_invalid
  · cargo 命令：cargo run --quiet --example identity_v2_dev_sign -- --device-id phase0-dev-0001 --student-id 2510234567 --student-name 张三 --seed-hex *** --nonce 1aa640cccee7652dfd5244862823d103 --ts 1794267559（cwd=.\apps\client\src-tauri，耗时 1.1s）（退出码 0）
  · 错签构造：原签名首字符 'u' → 'A'（nonce 为新的 1aa640cc…）
  → POST http://127.0.0.1:8942/debug/verify（错签）
    HTTP 401
    响应体（截断 800）：{"error":"not_verified","reason":"upstream_unauthorized"}
  ✓ 断言「SA 层 fail-closed」：期望 401 not_verified 或 200 ok:false（ok 必须为假）；实际 401 not_verified（fail-closed）
  → POST http://127.0.0.1:8941/identity/debug/device/verify（错签，直接探 ocr 根因）
    HTTP 401
    响应体（截断 800）：{"error":"signature_invalid","reason":"signature_invalid"}
  ✓ 断言「签名校验」：期望 401 且 reason==signature_invalid；实际 401 reason=signature_invalid
[step 10] 设备列表：GET /debug/devices → 含该设备、条目恰好 10 字段、学号掩码
  → GET http://127.0.0.1:8942/debug/devices
    HTTP 200
    响应体（截断 800）：{"devices":[{"device_id":"phase0-dev-0001","status":"active","bound_by":"first_claim","alg":"Ed25519","student_id_masked":"2510***","created_at":1794267549,"updated_at":1794267549,"last_verified_at":null,"revoked_at":null,"revoked_reason":null}],"count":1}
  ✓ 断言「条目形状」：期望 恰好 10 个字段、无 public_key_jwk、status=active、学号掩码 2510***；实际 fields=['device_id', 'status', 'bound_by', 'alg', 'student_id_masked', 'created_at', 'updated_at', 'last_verified_at', 'revoked_at', 'revoked_reason'] status=active mask='2510***'
[step 11] 汇总：写 JSON 证据 + 打印 [RESULT]
  · 全部 11 步执行完毕，总耗时 113.0s
  已停止 fake-casdoor
  已停止 student-auth
  已停止 ocr
[evidence] JSON 已写入 .\docs\architecture\identity-v2-phase0-evidence.json
[RESULT] PASS
```

---

## 3. 失败路径证据

| 路径 | 层 | 断言 | 实际 | 结果 |
|---|---|---|---|---|
| 未登记（步骤 3） | SA `/debug/verify` | fail-closed | `401 {"error":"not_verified","reason":"upstream_unauthorized"}` | ✓ |
| 未登记（步骤 3） | ocr `/identity/debug/device/verify` | `reason==device_not_registered` | `401 {"error":"signature_invalid","reason":"device_not_registered"}` | ✓ |
| 重放（步骤 6） | SA `/debug/verify`（同证明再发） | fail-closed | `401 {"error":"not_verified","reason":"upstream_unauthorized"}` | ✓ |
| 重放（步骤 6） | ocr 直探（同证明再发） | **必须** `reason==nonce_replayed` | `401 {"error":"signature_invalid","reason":"nonce_replayed"}` | ✓ 命中 |
| 错签（步骤 9） | SA `/debug/verify`（新 nonce，签名改 1 个 base64url 字符） | fail-closed（ok 必为假） | `401 {"error":"not_verified","reason":"upstream_unauthorized"}` | ✓ |
| 错签（步骤 9） | ocr 直探 | `reason==signature_invalid` | `401 {"error":"signature_invalid","reason":"signature_invalid"}` | ✓ |

**规格偏差说明（重要，未放宽任何断言）**：

规格 §4 步骤 3 的字面期望是「200 `{"ok":false,"reason":"device_not_registered"}`」。但新服务（`mini-hbut-student-auth`，`main=58774b0` 已冻结）的 `/debug/verify` 是透传层，其冻结实现把**上游 ocr 的 401 固定映射**为
`401 {"error":"not_verified","reason":"upstream_unauthorized"}`（`tests/test_debug_routes.py:1263` 已固化该行为；规格 §1 同时禁止修改既有实现/测试）。因此根因 reason 码（`device_not_registered` / `nonce_replayed` / `signature_invalid`）只可能在 **ocr 层**直接观察到。

本脚本的处理（两处都过才算通过）：
1. SA 层断言 fail-closed（`401 not_verified` 或 `200 ok:false` 均接受——规格 §4 步骤 6 自身即写明「200/401」）；
2. ocr 层对**同一证明**直接断言根因 reason（步骤 3 为 `device_not_registered`、步骤 6 为 `nonce_replayed`（必须命中）、步骤 9 为 `signature_invalid`）。

这与规格 §4 步骤 6 括号里的目的表述一致——「必须命中，证明跨语言 nonce 一次性」：Rust 签出的 nonce 被 Python 服务（ocr）消费一次后拒绝，跨语言成立。

---

## 4. 缺口与下一步

1. **`/debug/exchange` 的并行交付**：本证据运行发生时该端点已由并行 agent 交付（`sa-p08/mini_hbut_student_auth/debug_exchange.py`，`main=58774b0` 之上的未提交改动 + `app.py`/`debug.py` 小改），步骤 8 已真实跑通（HS256 验签通过、claims 完整、指纹 16 位）。其 `tests/test_debug_exchange.py` 是否全绿属并行 agent 的验收项（规格 §6 第 2 条），本文档不代验。
2. **dev 缝拆除清单（生产化前必做）**：`/debug/exchange` 的 HS256 与随机密钥、`/debug/*` 全部路由、假 Casdoor、InMemory 存储——生产侧必须走 P2-1 的 RS256/ES256 + JWKS + 真实 discovery/authorize/token。
3. **worktree 构建副作用**：在 `hb-p08` worktree 里跑 cargo 会重写 `tauri-plugin-hbut-background` 的 9 个 permissions 文件（LF 行尾 churn，非代码变更）；每次跑完 cargo 后这 9 个文件都会再次显示为 `M`（`git diff` 无内容差异，纯行尾），提交前用 `git checkout -- apps/client/src-tauri/plugins/` 撤销即可；**它们从未进入任何提交**。复核 A 已核对：逐个 `sha256` 与 HEAD 相同。
4. **脚本自身缺陷（开发迭代中发现并已修复，最终版无此问题）**：
   - Windows GBK 控制台无法编码 `✓`/`✗` → `UnicodeEncodeError`（修复：启动时 `sys.stdout.reconfigure(encoding="utf-8")`）；
   - `re.Match` 对象被直接写进 JSON 证据 → `Object of type Match is not JSON serializable`（修复：断言 cond 统一 `bool()` 化）；
   - 无断言的步骤（1/11）`pass` 字段误标 `False`（修复：置 `None` 表示不适用）。
5. **未验证项**：
   - 真机 webview / Tauri 正式命令通道（本联调全程控制台，`--no-app` 路径有但默认不启用）；
   - 端口被占用时 +10 递增（复核 B 已实测：占用 8941 时脚本改走 8951–8953 并 PASS）；
   - **一键脚本恒用 `--seed-hex`（07×32），App「真实 keyring 分支」未被脚本覆盖**（复核 B 指出；本机 keyring 恰为同一 seed，等价但未测该分支；如需覆盖可让脚本加 `--no-seed` 走 keyring）；
   - 假 Casdoor 自身的 `verify_hs256_jwt` 无独立单测（复核 B 手工验证全拒绝类均正确，但无回归保护）；
   - `--keep` 保留进程路径（默认 kill 已验证）；
   - 并发/多副本（nonce store 为进程内 InMemory，多副本需共享存储，属 P2 部署议题）。
6. **下一步**：P2-1 生产 OIDC（discovery/authorize/token + JWKS）；把本一键脚本挂进 CI 作为「阶段 0 回归」；真机 webview IPC 验证；`/debug/exchange` 与假 Casdoor 的拆除/门控审查。
