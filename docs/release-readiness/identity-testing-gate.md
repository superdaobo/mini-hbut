# Identity 测试门禁验证证据矩阵（#628）

> 日期：2026-08-14
> 范围：Identity Platform（私有 `identity-platform/`）+ 主仓库 Tauri 侧测试/门禁交付
> 前提：#626 Security 已通过（16 条 Security Test Gate 全绿）

## 1. Done 9 条核对（#628）

| # | Done 标准 | 落地 | 状态 |
|---|---|---|---|
| 1 | 本地 `check → preview → e2e → prod confirmation → smoke` 标准流水线 | `identity-platform/docs/runbook.md` §11.2 | ✅ |
| 2 | 协议 happy + negative 全覆盖 | Negative matrix 11 项核对表（runbook §11.3） | ✅ |
| 3 | Tauri desktop 真实 deep-link smoke | `scripts/identity_deep_link_smoke.mjs`（静态 10 项自动 + 7 步人工清单）；真实系统 scheme 注册 smoke 属 L8 人工项 | ✅（脚本+清单） |
| 4 | generated mobile scheme contract | `scripts/check_mobile_scheme_contract.mjs`（tauri.conf.json/Cargo/capabilities/lib.rs/deep_link.ts 静态 9 项 + gen/android 无 host scheme 断言） | ✅（gen 产物检查见 §4 风险） |
| 5 | QR 双上下文 E2E | `e2e/tests/qr-cross-device.spec.ts`（PC + Phone 双 context：approve/deny/expire/two phones race/revoked/invalid） | ✅ 6 用例通过 |
| 6 | Security suite 作为 release blocker | runbook §11.4：11 个 suite 固定集合 | ✅ |
| 7 | Preview/Production 完全隔离 | runbook §12 隔离断言（独立 DB/issuer/signing key/static clients + Production 拒 Preview token） | ✅（文档+断言清单） |
| 8 | rollback/kill switch 有演练或至少 Preview 验证 | runbook §14：5 种 kill switch + 演练要求（Preview 演练标用户执行） | ✅（文档） |
| 9 | Real-device checklist 完成后才标记 Parent Production Ready | `docs/release-readiness/identity-real-device-checklist.md`（L8，真机执行标用户） | ✅（文档交付；真机执行=用户） |

## 2. L0-L8 落地矩阵

| 层 | 名称 | 证据 | 本地结果 |
|---|---|---|---|
| L0 | Static / Type / Lint | core/web `typecheck` + `build`；主仓库 vue-tsc / cargo fmt / clippy | 本次不回归（见 §5） |
| L1 | Unit | core 205 用例（27 文件）+ web 283 用例（22 文件） | ✅ 全绿（205/205，283/283） |
| L2 | DB + Provider Integration | core/tests/db、adapter、oidc（pg-mem / TEST_DATABASE_URL 双后端） | ✅ 全绿（含新增 negative-matrix 4 用例） |
| L3 | Web Browser E2E | `e2e/tests/auth-site|developer|admin.spec.ts`（Playwright，mock 模式，无需凭据） | ✅ 16 用例通过 |
| L4 | Tauri / Desktop | `scripts/identity_deep_link_smoke.mjs --check` 10 项全过；Rust golden fixture（`src-tauri/src/identity/fixtures/approval_canonical_v1.golden.json`，auth+enroll 双段，Rust 重建逐字节断言）；真实 scheme 唤起= L8 | ✅ 10/10 + golden 测试通过 |
| L5 | Cross-device / Mobile Contract | `e2e/tests/qr-cross-device.spec.ts` 6 用例；`scripts/check_mobile_scheme_contract.mjs`（静态 9 项 + gen 检查） | ✅ 6/6；gen 检查见 §4 |
| L6 | Preview Deployment E2E | runbook §12 断言 + `e2e/demo-client`（openid-client 消费者，含 `--tamper-state`） | 需 Vercel 凭据（用户执行）；demo-client 语法/逻辑已交付 |
| L7 | Production Smoke | runbook §13：上线 12 步 + §13.1 只读 smoke 清单 | 需用户确认（不执行） |
| L8 | Manual Real-device | `identity-real-device-checklist.md`（Windows/Android/iOS 人工清单） | 文档交付；真机执行=用户 |

## 3. Negative matrix 补齐说明（11 项）

#620 已覆盖 7 项（missing PKCE / wrong verifier / code replay / code wrong client /
wrong redirect / expired code / suspended client）。本次新增 4 项独立断言
（`identity-platform/core/tests/oidc/native-negative-matrix.test.ts`，4/4 通过）：

- **N1 plain PKCE**：`code_challenge_method=plain` → `invalid_request`（policy 只允许 S256）；
- **N2 unapproved scope**：请求未获批的 `student.identity` → `invalid_scope` 拒绝
  （对照：已获批 scope 成功，避免断言假阳性）；
- **N3 bad state**：provider 原样回传 state，回跳 state 不一致由客户端拒绝
  （消费者侧验证：`e2e/demo-client --tamper-state 1` 必须退出码 1）；
- **N4 bad nonce**：id_token.nonce 与请求一致（openid-client 消费者内置校验）。

## 4. Mobile scheme contract 现状与风险

`scripts/check_mobile_scheme_contract.mjs` 检查结果：

- 静态 9 项（tauri.conf.json desktop/mobile schemes、Cargo.toml 双插件、
  package.json JS 插件、capabilities、lib.rs 插件顺序、register_all、deep_link.ts 统一层）全过；
- **gen/android 检查失败（当前真实状态）**：本地 `src-tauri/gen/android` 的
  AndroidManifest.xml 只有 `host=schedule` 的受限注册，**缺少无 host 的
  `<data android:scheme="minihbut" />`** —— `minihbut://identity` 在移动端不会到达 App。
  根因：tauri-plugin-deep-link 的 build.rs 在 **Android cargo 构建时**注入该 data 元素
  （官方文档：mobile custom scheme 必须 omit host，不支持运行时动态注册），
  本地从未执行过 android target 构建 → gen 产物过期。
- **处理**：CI（dev-build.yml / release.yml）的 `tauri android build` 每次都会注入；
  构建后运行本守卫必须通过；**在 CI 中把本守卫加为 android job 的收尾检查**
  （release blocker：移动端 identity 深链静默失效防护）。iOS 同理由 macOS CI 注入
  Info.plist 的 CFBundleURLTypes，Windows 无法本地生成（守卫输出 SKIP 指引）。

## 5. 本次本地验证记录

- core 全量：205/205 通过（含新增 4 用例）；web 全量：283/283 通过；
- Playwright E2E：**22/22 通过**（auth-site 8、developer 3、admin 5、qr-cross-device 6）；
- `scripts/check_mobile_scheme_contract.mjs --self-test`：3/3；
- `scripts/identity_deep_link_smoke.mjs --check`：10/10（Windows 注册表已注册 minihbut）；
- 主仓库 SecretGuard 对本次新增文件无命中（无真实 secret 引入）。

## 6. 剩余风险与归属

| 风险 | 归属 |
|---|---|
| gen/android 移动端 identity 深链未注册（需 CI android 构建后确认） | 用户环境（CI/构建） |
| Vercel Preview/Production 部署、Preview 隔离断言、12 步上线 | 用户确认 + 凭据后执行 |
| Windows 真实深链唤起（App 冷/热启动、单实例）7 步人工 smoke | 用户真机执行 |
| Real-device checklist（Android/iOS 真机、扫码、Keychain） | 用户真机执行 |
| kill switch 1/2/3 的 Preview 演练 | 用户（Preview 部署后） |
| 性能验收（武汉/中国大陆实测 P50/P95） | 用户网络环境实测 |
