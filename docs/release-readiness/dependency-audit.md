# 阶段 2A 依赖安全审计

审计日期：2026-08-02（Asia/Singapore）

## 初始状态

GitHub Dependabot 在阶段开始时报告 29 条开放告警：

- High：19
- Medium：6
- Low：4
- Critical：0

根目录 `npm audit` 另外随着最新 advisory 数据刷新为 1 Critical、1 High，均来自 Capacitor 6 CLI 的 `node-tar` 传递依赖。

主要问题包括：

- 根目录 Capacitor CLI 声明为 8.x，但 Runtime/Android/iOS 为 6.2.1，锁文件实际安装版本又不同。
- Tauri CLI、Vite、Vue 插件、Vitest、Autoprefixer 的声明与锁文件不一致。
- Vite、Rollup、PostCSS、Brace Expansion、Esbuild 和 node-tar 命中安全公告。
- 官网 Next 15.5.x 固定携带旧 PostCSS 和 Sharp。
- 12 个模块项目拥有独立旧锁文件，均需单独治理。
- Rust 锁文件包含 glib、lru、rand 相关公告。

## 已完成的治理

### 主应用 npm

- Capacitor Core/Android/iOS/CLI 统一固定为 `6.2.1`，不进行破坏性的 Capacitor 8 迁移。
- Capacitor CLI 的 `tar` 传递依赖覆盖为已修复的 `7.5.22`。
- Tauri API 固定为 `2.11.1`，CLI 固定为 `2.11.4`。
- Vite 升级并固定为 `6.4.3`；Vue 插件、Vitest、Autoprefixer 和 PostCSS 与锁文件对齐。
- 根目录 `npm audit`：0 vulnerabilities。

### 官网与模块

- 官网 Next 固定为 `15.5.21`。
- 官网通过精确 override 使用 PostCSS `8.5.25`、Sharp `0.35.3`、Picomatch `4.0.5` 以及已修复的 Brace Expansion 分支版本。
- 12 个模块锁文件均覆盖 PostCSS `8.5.25`；`jump_out_hbut` 额外覆盖 Brace Expansion `2.1.3`。
- 官网和 12 个模块项目逐目录 `npm audit`：全部 0 vulnerabilities。

### Rust

- `rqrr` 从 `0.9.3` 升级到 `0.10.1`，使 `lru` 从 `0.12.5` 升级到 `0.16.4`，修复 RUSTSEC 对应的迭代器别名问题。
- `rand 0.9.2` 升级到 `0.9.3`。

## 临时接受的 Rust 传递风险

### RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g

- 依赖：`glib 0.18.5`
- 严重性：Medium
- 来源：Tauri 2 在 Linux 上的 GTK/WebKitGTK 依赖链。
- 原因：修复版本要求 glib 0.20，对应 GTK 生态 ABI 升级，无法由应用单独覆盖而不破坏 Tauri Linux 构建。
- 缓解：Windows/Android/iOS 产物不加载该 Linux GTK 依赖；持续跟随 Tauri/Wry 上游升级。

### RUSTSEC-2026-0097 / GHSA-cq8v-f236-94qc

- 依赖：`rand 0.7.3`
- 严重性：Low
- 来源：Tauri build-time HTML selector/codegen 依赖链中的旧 PHF 生成器。
- 原因：仅为构建依赖，应用运行时直接使用的 rand 已为 0.8.7/0.9.3；上游旧选择器链尚未迁移。
- 缓解：不使用自定义 logger 调用该构建依赖的 `rand::rng()`；持续跟随 Tauri 工具链升级。

上述两项使用明确 RustSec ID 配置在审计工作流中，任何新增 advisory 仍会使 CI 失败。

## 自动化门禁

- `npm run check:dependency-alignment`：验证平台工具链版本、锁文件实际版本和最低安全版本。
- `npm run audit:dependencies`：依次审计根目录、官网和 12 个模块锁文件。
- `.github/workflows/dependency-audit.yml`：PR、main、每周定时和手动触发，执行 NPM 全锁文件审计与 RustSec。

## 发布约束

本次治理未修改应用版本 `1.4.4`，未创建 tag、GitHub Release、TestFlight 构建或商店发布。
