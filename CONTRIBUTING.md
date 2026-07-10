# Contributing to Mini-HBUT

感谢参与贡献。本文说明本地开发、代码规范与 PR 流程。

## 环境要求

- Node.js（见 `.nvmrc`）
- Rust stable（见 `src-tauri/rust-toolchain.toml`）
- 桌面端：Tauri 2.x 依赖（WebView2 / 平台 SDK）
- 移动端：Android Studio / Xcode（Capacitor 路径）

## 本地开发

```bash
npm ci
npm run dev              # 前端 Vite（:15173，可用 VITE_DEV_PORT 覆盖，需同步 tauri devUrl）
npm run tauri dev        # Tauri 桌面开发
npm run tauri:dev:debug-bridge   # 带 HTTP Bridge 的调试启动
```

```bash
npm run test:ci
npx vue-tsc --noEmit -p tsconfig.ci.json
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
node scripts/guard_sensitive_uploads.mjs pre-commit
node scripts/check-frontend-safety.mjs
node scripts/check-design-tokens.mjs
```

## 分支与 PR

1. 从 `main` 拉取功能分支：`feat/...` 或 `fix/...`
2. 小步提交，PR 描述写清动机与验证方式
3. 关联 Issue：`Closes #123`
4. 确保 CI（`.github/workflows/ci.yml`）通过

## 代码约定

### Rust（`src-tauri/`）

- 业务逻辑优先放在 `http_client/`、`modules/`，避免继续膨胀 `lib.rs`
- 数据库访问集中在 `db.rs`；密码走 `credential_store.rs`
- 新增 HTTP Bridge 路由必须评估鉴权（`HBUT_BRIDGE_TOKEN`）
- `cargo fmt` 后再提交；Clippy 全绿为长期目标，勿在未修复存量告警时强行 `-D warnings`

### 前端（`src/`）

- 导航常量放 `src/navigation/`，避免 `App.vue` 继续增大
- 禁止前端裸调 `*.chaoxing.com`（见 `scripts/check-frontend-safety.mjs`）
- 敏感字段勿 `console.log`

### 双栈边界（Tauri + Capacitor）

| 平台 | 运行时 | 构建入口 |
|------|--------|----------|
| Windows / macOS / Linux | Tauri | `npm run tauri build` |
| Android / iOS | Capacitor | `npm run cap:sync` + 原生工程 |

勿将 Capacitor 同步产物（`android/app/build/` 等）提交到仓库。

## 安全相关环境变量

| 变量 | 用途 |
|------|------|
| `HBUT_HTTP_BRIDGE_ENABLED=1` | 桌面 Release 下启动本地 Bridge；Tauri iOS Release 默认已开启 |
| `HBUT_BRIDGE_TOKEN` | Bridge 敏感 API Bearer 令牌 |
| `MINI_HBUT_INSECURE_TLS=1` | 禁用 TLS 校验（仅排障） |

详见 [SECURITY.md](./SECURITY.md)。
