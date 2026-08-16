# CI 分层设计（#598）

> 目标：**PR 快速阻断 + main 完整验证 + 定时安全扫描 + release 真正全平台打包**
> 普通 PR 尽量在 2~5 min 内得到可合并结论，同时完整保留主干、发布、TestFlight、Dev Build 验证。

---

## 四层架构

```text
Layer 1  PR Fast Gate（普通 PR 唯一关键路径）
Layer 2  main 合并后完整验证
Layer 3  Security / CodeQL（分层）
Layer 4  Release / Packaging（后置）
```

### Layer 1：PR Fast Gate（`ci.yml`）

普通 PR 只回答「这份代码是否具备安全合并到 main 的基本条件」：

```text
PR Checks
│
├─ changes          范围检测（dorny/paths-filter）
│   ├─ frontend: apps/client/src/**、apps/client/package*.json、apps/client/vite.config.*
│   └─ rust:    apps/client/src-tauri/**
│
├─ test-frontend    frontend 变更时运行（build + Vitest + vue-tsc + 安全/架构守卫）
├─ test-rust        rust 变更时运行（cargo test/fmt/clippy）
├─ test-rust-windows  rust 变更时运行（Windows-only cargo check，不打包）
│
└─ pr-gate          稳定名称的汇总门禁（只接受 success / skipped）
```

> 客户端已于 #641 迁入 `apps/client/`（唯一包根：src/、src-tauri/、android/、ios/、
> vite/vitest/tsconfig/tailwind 配置、package.json + lockfile）。所有客户端路径均以
> `apps/client/` 为前缀；根级 `scripts/`（check_all / check_release / guard_sensitive_uploads /
> build_website_modules 等）与 `website/`、`identity-platform/` 不变。

关键规则：

- **不用 workflow-level `paths:` 让 required workflow 整体消失**——`ci.yml` 始终创建，job 级 `if:` 条件裁剪，避免 required check 永久 Pending。
- **保留 job id `test-frontend` / `test-rust` 不变**——迁移期旧 required contexts 继续产生 check。
- **push main/dev 不做裁剪**（`github.event_name != 'pull_request'` 兜底），全量验证。
- `pr-gate` 用 `if: always()` + 逐项检查 `needs.*.result ∈ {success, skipped}`，**禁止 `continue-on-error` 伪装成功**。

### Layer 2：main 合并后完整验证（`release-readiness.yml`）

```text
PR → PR Fast Gate → Merge → main → Release Readiness（完整 check:release）
```

- 触发：`push main` + `workflow_dispatch`（**不再响应 pull_request**）。
- 完整能力保留：`npm run check:release` = check:all（前端 build / Vitest / typecheck / 安全 / 架构 / dist / cargo fmt/test/clippy）+ cargo check --release + website docs 契约 + website build + npm audit + release 配置验证。

### Layer 3：Security / CodeQL（`codeql.yml`）

- PR：仅 `Analyze (javascript-typescript)`（快速、非 required 反馈）。
- `push main` + 每周一 03:30 UTC 定时 + manual：完整 3 语言（javascript-typescript / rust / actions）。
- 分层理由：CodeQL Rust 在 PR 阶段重复准备完整构建环境（npm ci + frontend build + apt 依赖 + autobuild），与 test-rust 明显重叠。

### Layer 4：Release / Packaging

| Workflow | 触发 | 说明 |
| --- | --- | --- |
| `windows-release-dry-run.yml` | PR（仅 packaging 相关 paths）+ push main（同 paths）+ manual | 完整 NSIS build + smoke + artifact，不再对普通 `src/**` PR 触发 |
| `dev-build.yml` | `push dev` + manual | 五平台 beta 不变 |
| `release.yml` | `v*` tag | 正式五平台 release 不变 |
| `ios-testflight.yml` / `-finalize.yml` | manual | 签名 IPA + TestFlight 上传不变 |

Dry Run 的 packaging 触发路径（**不要扩大**）：

```text
.github/workflows/windows-release-dry-run.yml
apps/client/package.json / package-lock.json
apps/client/vite.config.*
apps/client/src-tauri/Cargo.toml / Cargo.lock / tauri.conf.json / build.rs / icons/**
apps/client/scripts/ci/windows_release_smoke.ps1 / scripts/verify_release_config.mjs
.github/workflows/release.yml
```

Windows-only 编译错误保护由 PR Fast Gate 的 `test-rust-windows`（`cargo check --lib`，~3-5 min）承担，无需完整 NSIS 打包。

---

## 触发矩阵

| 变更类型 | PR Fast Gate | Windows Dry Run | Dependency Audit | Release Readiness | CodeQL |
| --- | --- | --- | --- | --- | --- |
| frontend-only | test-frontend ✅ / rust skip | — | — | main 后 | PR: JS/TS only |
| rust-only | rust ✅ / frontend skip + Windows check | — | — | main 后 | PR: JS/TS only |
| packaging 相关 | 相关 job | ✅ | — | main 后 | PR: JS/TS only |
| 依赖文件变更 | 相关 job | — | ✅ | main 后 | PR: JS/TS only |
| docs-only | changes + pr-gate（~1 min） | — | — | main 后 | PR: JS/TS only |
| push main | 全量（不裁剪） | packaging 变更 | 依赖变更 | ✅ 完整 | ✅ 完整 |

---

## Required Checks 迁移记录

### 迁移前（基线）

```text
test-frontend
test-rust
Analyze (javascript-typescript)
Analyze (rust)
```

### 第一阶段（PR Gate 上线稳定后）

```text
test-frontend
test-rust
Analyze (javascript-typescript)
Analyze (rust)        ← 移除（配合 CodeQL PR 触发分层）
PR Gate               ← 新增
```

### 第二阶段（再稳定后收敛）

```text
PR Gate               ← 唯一 required
```

迁移顺序约束（防 required context 永久 Pending）：

1. 先合并 PR Fast Gate（保留旧 required）；
2. 确认 `PR Gate` 每个 PR 都出现、skip 处理正确；
3. branch protection **追加** `PR Gate`；
4. branch protection **先移除** `Analyze (rust)`，**再**合并 CodeQL PR 触发分层改动；
5. 稳定后收敛为单一 `PR Gate`。
6. 禁止关闭 branch protection / `--admin` 绕过。

---

## 性能基线（before / after）

### Before（PR 事件，2026-08-13 拉取，n≈10）

| Workflow | n | 中位耗时 | min | max |
| --- | ---: | ---: | ---: | ---: |
| CI | 11 | 2.57 min | 0.80 | 3.60 |
| CodeQL | 11 | 3.15 min | 0.05 | 3.80 |
| Dependency Audit | 10 | 3.45 min | 2.58 | 3.92 |
| Release Readiness | 9 | 4.53 min | 0.27 | 5.57 |
| Windows Release Dry Run | 9 | **20.97 min** | 0.05 | 23.10 |

普通 PR 实际等待 ≈ Dry Run 的 ~21 min。

### After（待 #598 落地后补充 ≥10 次代表性 PR）

| 变更类型 | PR 耗时 | PR Gate 结论 |
| --- | --- | --- |
| frontend-only | 待补 | test-frontend ✅ / rust skip |
| rust-only | 待补 | rust ✅ + Windows check |
| docs-only | 待补 | ~1 min 全 skip |
| dependency-only | 待补 | 相关 job + audit |

**验收目标**：普通 PR P50 ≤ 5 min，P95 ≤ 10 min；runner-min/PR 从 ~20-25 降至 ~4-7；cargo-audit 缓存命中后 rustsec 不再花 ~3 min 装工具。

---

## 禁止事项（防回退）

- 不把 `check:all` / Release Readiness 塞回普通 PR。
- 不把 `src/**` / `scripts/**` 重新加入 Dry Run 的 PR paths。
- 不把 CodeQL Rust 放回 PR required。
- 不用 `continue-on-error` 把真实失败伪装成成功。
- 不删除核心测试 / npm audit / RustSec / CodeQL / Release Readiness / Windows smoke / Dev Build / TestFlight。
