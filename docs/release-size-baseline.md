# 全平台安装包 / 前端资源体积基线与门禁

## 目标

- **全平台同等关注**（Win / macOS / Linux / Android / iOS）。
- **全部本地资源**（禁止为瘦身引入 CDN）。
- 可复现测量 + CI/本地门禁，防止相对基线异常膨胀。

## 1. 前端打入包的可跟踪资源（本地脚本）

```bash
node scripts/report_release_asset_sizes.mjs
node scripts/report_release_asset_sizes.mjs --out size-report.json
node scripts/report_release_asset_sizes.mjs --baseline size-before.json --out size-after.json
```

跟踪文件见脚本内 `TRACKED` 列表（splash 图标、favicon、app-icon、字体子集等）。

**软门禁（脚本内建）**：相对 baseline `totalBytes` 增长 **> 5%** 时 exit 1。

### 基线快照（main 合入 #269 后补丁前 → 本轮后）

| 资源 | 之前 | 之后 |
|------|------|------|
| `public/splash/app_icon.png` | ~388.5 KB | ~91.4 KB |
| `public/splash/app_icon.webp` | ~54 KB | ~34 KB |
| `public/favicon.svg` | ~358 KB（内嵌 1024 PNG base64） | ~42 KB（256 PNG） |
| `src/assets/app-icon.svg` | 与 favicon 重复 ~358 KB | 与 favicon 同 ~42 KB |
| `public/fonts/material-symbols-outlined.subset.woff2` | ~311 KB | 重建子集后仍约 311–312 KB（见下） |

字体：`node scripts/build_font_subset.mjs` 从全量 Material Symbols 按源码引用重建子集；当前引用约 168 icons 时子集约 **311 KB**（相对全量约 3.8 MB 已 92% 压缩）。进一步下降需减少图标种类。

## 2. 各平台发布物体积（GitHub Release）

对 tag（示例 v1.4.2 / v1.4.3）：

```bash
gh release view v1.4.2 --json assets --jq '.assets[] | {name,size}'
gh release view v1.4.3 --json assets --jq '.assets[] | {name,size}'
```

历史对比（调研记录）：

| 产物 | v1.4.2 | v1.4.3 | Δ |
|------|--------|--------|---|
| arm64.apk | 24.6 MB | 25.0 MB | +316 KB |
| iOS.ipa | 18.1 MB | 18.5 MB | +405 KB |
| universal.dmg | 15.4 MB | 16.2 MB | +816 KB |
| x64-setup.exe | 6.3 MB | 6.4 MB | +39 KB |

## 3. CI / 本地策略

| 层级 | 策略 |
|------|------|
| PR 本地/CI 前端 | 对 `TRACKED` 资源跑 `report_release_asset_sizes.mjs`；可选与上一 release 基线 JSON 比较，**>5% fail** |
| Release | 发布后记录各平台 asset size 到 release notes；相对上一 tag **APK/IPA 增长 >3%** 需说明原因 |
| 告警 vs 失败 | 开发分支：告警日志；`main` release 工作流：超阈值失败（配置 `SIZE_GATE_STRICT=1`） |

可选 CI 片段：

```yaml
- name: Frontend asset size gate
  run: node scripts/report_release_asset_sizes.mjs --baseline docs/size-baseline.json
```

将当前 `node scripts/report_release_asset_sizes.mjs --out docs/size-baseline.json` 提交为基线。

## 4. 不在此门禁内

- `node_modules` / `target` / 未打入安装包的 `website/` 构建缓存。
- 腾讯地图 SDK 运行时下载（非本仓库静态资源）。

## 5. 同 commit 可归因包体基线（Issue #590）

> 统一 Android/iOS 移动端裁剪工作的测量口径：**同一 commit、同一平台、同一套 Release 参数**下做 before/after，禁止拿不同版本或不同构建参数直接比较。

### 5.1 命令入口（可重复测量）

```bash
# 完整报告（dist + 安装包 + 包内归因 + native 二进制）
node scripts/report_bundle_sizes.mjs

# 输出结构化 JSON（供 CI / 后续 Sub-issue 机械对比）
OUT=size-report.json node scripts/report_bundle_sizes.mjs

# 与基线产物目录对比（绝对 + 百分比差值）
BASELINE_DIR=<基线产物目录> OUT=size-after.json node scripts/report_bundle_sizes.mjs
```

关键环境变量（记录在 JSON `meta.env`，保证口径可复现）：

| 变量 | 说明 |
|------|------|
| `DIST_DIR` | 前端 `dist` 目录（默认 `dist`） |
| `BUNDLE_ROOT` | 安装包目录（默认 `src-tauri/target/release/bundle`） |
| `BASELINE_DIR` | 基线产物目录（可选，启用 before/after 差值） |
| `NATIVE_BINARY_DIR` | Rust native 产物目录（默认 `src-tauri/target/release`） |
| `OUT` | JSON 输出路径（可选） |
| `VITE_APP_STORE_BUILD` / `MINI_HBUT_BUILD_PROFILE` / `TARGET_ARCH` / `BUILD_TYPE` / `ANDROID_SHRINK` / `BRIDGE_EXPECTED` | 构建口径标记，原样记录进 `meta.env` |

报告固定输出：基线 `commit_sha`、`build_entry`、`dist` 总大小（字节 + MB + 文件数 + top chunk）、各平台安装包精确字节数与完整路径、包内 top 条目与顶层类别聚合（`lib/`、`assets/`、`classes.dex`、`resources.arsc` 等）、native 二进制总大小与 top 文件、before/after 绝对与百分比差值。

### 5.2 同 commit 基线表（生成中，CI 产物）

Android/iOS 基线数字以 **GitHub Actions 等价产物**为准（本机为 Windows 且未配置 JDK/NDK，无法生成正式 APK；iOS IPA 需 macOS 签名构建）。生成方式：

- **Android arm64 Release APK**：`dev-build.yml` / `release.yml` 的 Android job 构建后调用 `node scripts/report_bundle_sizes.mjs --out android-size-report.json`，产物路径与字节数登记到下表。
- **iOS device Release/TestFlight IPA**：`ios-testflight.yml` 构建后调用同一脚本，登记 `ios_ipa` 字节数；签名限制下使用与正式发布一致的 CI 产物（见 Issue #590 验收 3）。

| 平台 | 产物 | commit | 构建入口 | 精确字节数 | MB | 备注 |
|------|------|--------|----------|-----------:|----:|------|
| Android arm64 Release | `mini-hbut-*-arm64.apk` | 待 CI | `release.yml` Android job | 待生成 | 待生成 | R8/minify/resource shrink |
| iOS device Release | `mini-hbut_*.ipa` | 待 CI | `ios-testflight.yml` / `release.yml` iOS job | 待生成 | 待生成 | `VITE_APP_STORE_BUILD=1` |

表格由生成基线的 Agent 在 CI 产物产出后回填（Issue #595 会把该调用接入三个 workflow，并记录 before/after 到 release 说明）。

### 5.3 测量限制与来源追踪

- zip 包内归因基于内置最小 ZIP 中央目录读取器，**不支持 zip64**（APK/IPA 常规 <4GB 不受影响）；解析失败时仅报告文件总大小，不报错。
- 同 key 安装包多候选时，脚本选择 mtime 最新者并在报告中列出**全部候选路径**（来源可追踪，不因时间戳误取历史产物）。
- 基线差值只在 `BASELINE_DIR` 与当前产物同 commit、同构建参数时归因；否则脚本输出提示。
- 脚本测试：`node scripts/report_bundle_sizes.test.mjs`（覆盖 dist 归因、zip 包内解析、before/after 差值）。

### 5.4 后续 Sub-issue 使用约定

所有移动端瘦身 Sub-issue（#591/#592/#593/#594/#595）的「节省量」验收必须：

1. 用同一 `report_bundle_sizes.mjs` 口径生成 before（基线）与 after 两份 JSON；
2. 报告 `dist`、安装包、native 三层各自的绝对与百分比变化；
3. 说明节省发生在哪一层，禁止拿不同版本或不同构建参数冒充同代码 A/B。

## 6. 移动端发布构建矩阵（Issue #595）

### 6.1 四变体统一口径

| 变体 | workflow | 前端 profile / 标志 | Rust features | target arch | R8/minify | Bridge 预期 |
|------|----------|---------------------|---------------|-------------|-----------|-------------|
| Android dev | `dev-build.yml` | `MINI_HBUT_BUILD_PROFILE=android-size` + `VITE_EXCLUDE_HIDDEN_VIEWS=1` | `mobile-slim`（`--config` 注入） | arm64（aarch64-linux-android） | 是（R8/minify/shrink 保持） | 不启动（无消费者，编译退出） |
| Android release | `release.yml` | `MINI_HBUT_BUILD_PROFILE=release` + `VITE_EXCLUDE_HIDDEN_VIEWS=1` | `mobile-slim`（`--config` 注入） | arm64 only | 是（R8/proguard 保持） | 不启动（编译退出） |
| iOS release | `release.yml` | `VITE_EXCLUDE_HIDDEN_VIEWS=1` | `mobile-slim,bridge`（`CARGO_BUILD_FEATURES`，xcodebuild 直调 cargo） | device arm64 | Xcode Release | 启动（proxy/system/ai 必需） |
| iOS TestFlight | `ios-testflight.yml` | `VITE_APP_STORE_BUILD=1` + `VITE_EXCLUDE_HIDDEN_VIEWS=1` | `mobile-slim,bridge`（`CARGO_BUILD_FEATURES`） | device arm64 | Xcode Release（archive/export） | 启动（必需路径保留） |

### 6.2 注入点

- **前端**：`VITE_EXCLUDE_HIDDEN_VIEWS=1` 触发 viewRegistry/app_store_policy 编译期排除论坛视图（#591）。
- **Rust Android**：`tauri android build --config '{"build":{"features":["mobile-slim"]}}'`——覆盖 tauri.conf.json 的 `build.features`（`mobile-full,bridge`），关闭刷课/自动化与 Bridge（#594）。
- **Rust iOS**：xcodebuild 直调 cargo，不经过 tauri CLI，故用 `CARGO_BUILD_FEATURES=mobile-slim,bridge`（#594）。
- **本地/桌面（Windows/mac/Linux dev 与发布）**：tauri.conf.json `build.features=["mobile-full","bridge"]` 保持全功能，不设 `VITE_EXCLUDE_HIDDEN_VIEWS`。

### 6.3 CI 反向守卫（每次移动端发布构建必跑）

`node scripts/check_mobile_boundary.mjs --expect-excluded ForumView,MoreShuake,OnlineLearning --expect-kept ChaoxingHubView --check-rust-registry`

- 隐藏模块（ForumView/MoreShuake/OnlineLearning）不得重新生成 chunk；
- 保留能力（ChaoxingHubView 课程中心 chunk + Rust 命令注册 `chaoxing_fetch_courses/knowledge_cards/video_status`）不得被精简误删；
- 脚本测试 `scripts/check_mobile_boundary.test.mjs`；守卫失败即构建失败（机械门禁）。

### 6.4 包体指标输出（CI 日志可追溯）

- Android raw/签名后各跑一次 `node scripts/report_bundle_sizes.mjs`（BUNDLE_ROOT 指向 APK 输出目录）。
- iOS release/TestFlight 的 IPA 大小在 xcodebuild 产物目录报告；`dist`/native 指标由同一脚本输出。
- before/after：同一 workflow 的两次运行对比（同 commit 同参数），或与 `docs/architecture/mobile-frontend-boundary.md` §4 的前端基线叠加。

> 基线数字回填约定：Android/iOS 首次跑通后，将精确字节数与 commit 登记到 §5.2 表格；后续瘦身 Sub-issue 以同表为准。


