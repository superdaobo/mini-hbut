# Contributing to Mini-HBUT

感谢参与贡献。本文说明本地开发、代码规范与 PR 流程。

> 客户端（Vue 前端 + Tauri/Capacitor）位于 `apps/client/`：以下客户端命令（`npm run ...`、`cargo ...`）与路径（`src/`、`src-tauri/`）均以 `apps/client/` 为工作目录；仓库级脚本（`scripts/guard_sensitive_uploads.mjs` 等）在仓库根目录执行。

## 环境要求

- Node.js（见 `.nvmrc`）
- Rust stable（见 `apps/client/src-tauri/rust-toolchain.toml`）
- 桌面端：Tauri 2.x 依赖（WebView2 / 平台 SDK）
- 移动端：Android Studio / Xcode（Capacitor 路径）

## 本地开发（客户端命令在 `apps/client/` 下执行）

```bash
cd apps/client
npm ci
npm run dev              # 前端 Vite（:15173，可用 VITE_DEV_PORT 覆盖，需同步 tauri devUrl）
npm run tauri dev        # Tauri 桌面开发
npm run tauri:dev:debug-bridge   # 带 HTTP Bridge 的调试启动
```

```bash
# 仍位于 apps/client/ 下
npm run test:ci
npx vue-tsc --noEmit -p tsconfig.ci.json
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --all
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
node scripts/check-frontend-safety.mjs
node scripts/check-design-tokens.mjs

# 仓库根目录执行（仓库级守卫脚本）
node scripts/guard_sensitive_uploads.mjs pre-commit
```

## 分支与 PR

1. 从 `main` 拉取功能分支：`feat/...` 或 `fix/...`
2. 小步提交，PR 描述写清动机与验证方式
3. 关联 Issue：`Closes #123`
4. 确保 CI（`.github/workflows/ci.yml`）通过

## 版本号与发布策略

### 正式版（Release）

1. 在 `main` 上做一次 bump 提交，同步以下版本号（任一不一致会挂 `check:release-config` 门禁）：
   - `apps/client/package.json` 与 `package-lock.json`
   - `apps/client/src-tauri/tauri.conf.json`
   - `apps/client/src-tauri/Cargo.toml`
   - `scripts/verify_release_config.mjs` 的 `const expected = '...'`
2. 发布说明写进仓库根目录的 `RELEASE_vX.Y.Z.md`，随 bump 提交合入（缺失则 Release 自动生成 Changed Files 列表）
3. 在该提交上打 tag `vX.Y.Z` 并推送 → 触发 `Release Build`（要求 tag 位于 `main`）
4. 产物命名、GitHub Release 与 CDN `latest.json` 均以 tag 为准自动生成

### 测试版（Dev Build）

- 版本号全自动，无需人为改任何文件：核心版本 = max(`main` / dev 分支 `package.json` 版本) 的 **patch+1**，
  再拼 `-beta.<run_number>`。例：正式版 v1.4.6 存续期间，测试版为 `1.4.7-beta.N`
- 正式版 bump 合入 `main` 后会自动同步并触发一次 Dev Build，测试版随即顺延为新的 patch+1
- 触发入口：push 到 `dev` 分支 / 手动 workflow_dispatch / push 到 `main` 自动同步触发
- 经 GitHub `dev-latest` 滚动 prerelease + CDN `releases/dev-latest.json` 分发，仅应用内打开「开发版」频道的用户可见

### iOS TestFlight

- 编号独立于上述两者：手动运行 `ios-testflight.yml` 输入 marketing version 与 build number
  （build 号按 App Store Connect 序列递增），与 dev-beta 编号互不影响

## 代码约定

### Rust（`apps/client/src-tauri/`）

- 业务逻辑优先放在 `http_client/`、`modules/`，避免继续膨胀 `lib.rs`
- 数据库访问集中在 `db.rs`；密码走 `credential_store.rs`
- 新增 HTTP Bridge 路由必须登记访问级别（PublicHealth / PublicEmbed / Protected / DebugOnly），默认按 Protected 处理
- `cargo fmt` 后再提交；Clippy 全绿为长期目标，勿在未修复存量告警时强行 `-D warnings`

### 前端（`apps/client/src/`）

- 导航常量放 `src/navigation/`，避免 `App.vue` 继续增大
- 禁止前端裸调 `*.chaoxing.com`（见 `apps/client/scripts/check-frontend-safety.mjs`）
- 敏感字段勿 `console.log`

### 双栈边界（Tauri + Capacitor）

| 平台 | 运行时 | 构建入口 |
|------|--------|----------|
| Windows / macOS / Linux | Tauri | `cd apps/client && npm run tauri build` |
| Android / iOS | Capacitor | `cd apps/client && npm run cap:sync` + 原生工程 |

勿将 Capacitor 同步产物（`apps/client/android/app/build/` 等）提交到仓库。

## 安全相关环境变量

| 变量 | 用途 |
|------|------|
| `HBUT_HTTP_BRIDGE_ENABLED=1` | 桌面 Release 下启动本地 Bridge；Tauri iOS Release 默认已开启 |
| `HBUT_BRIDGE_TOKEN` | CLI/自动化访问 Protected Bridge 路由时使用的兼容 Bearer 令牌；应用内 WebView 走可信 Origin |
| `HBUT_HTTP_BRIDGE_PORT` | 调整 Loopback Bridge 端口；监听地址始终固定为 `127.0.0.1` |
| `MINI_HBUT_INSECURE_TLS=1` | 禁用 TLS 校验（仅排障） |

详见 [SECURITY.md](./SECURITY.md)。
