# Rust / Tauri 安装包体积因素评估

## 结论摘要

| 因素 | 影响 | 现状 | 建议 |
|------|------|------|------|
| 前端静态资源（图标/字体） | 中（百 KB 级） | 本轮已压缩 PNG/SVG；字体子集 ~311KB | 继续子集/减 icon |
| WebView 壳 + Tauri runtime | 大（数 MB 级） | 固定依赖 | 难砍，跟随上游 |
| Rust 依赖树（reqwest/openssl 等） | 大 | `Cargo.toml` 已部分 feature 化 | 审计 optional features |
| Release profile strip/LTO | 中–大 | **已开启** | 保持 |
| 调试符号 / 未 strip 开发包 | 极大 | debug 未 strip | 仅 release 分发 |

## 已启用的 release 优化（代码现状）

`src-tauri/Cargo.toml` / profile：

- `strip = true`（或等价 strip 配置，以仓库当前 `Cargo.toml` `[profile.release]` 为准）
- `lto` / `codegen-units` / `opt-level` 以仓库配置为准

请在改 profile 时用同机 before/after 对比：

```bash
# 示例（Windows）
cd src-tauri
cargo build --release
# 对比 target/release/*.exe 或打包产物
```

## Top 贡献（定性，本环境未完整重打 APK/IPA）

1. **Tauri + WebView2/WKWebView 运行时** — 平台固定成本。  
2. **Rust 网络/TLS/序列化依赖**（reqwest、serde、tokio 等）— 业务必需。  
3. **前端 dist**（JS/CSS/字体/图标）— 本轮可测下降主要在此。  
4. **可选业务模块**（AI、地图、超星等）— 未来可 feature-flag 编译裁剪（成本高）。

## 可执行下一步（未全部落地）

1. 保持 release strip + LTO，禁止 debug 包作为对外分发。  
2. 用 `cargo bloat` / `cargo tree` 在 CI 可选 job 输出 top crates（不阻断）。  
3. 前端 `report_release_asset_sizes.mjs` 作为 PR 门禁（见 `docs/release-size-baseline.md`）。  
4. 各平台 Release asset size 写入 changelog，相对上一 tag 异常增长需 PR 说明。

## 平台 Δ 说明

v1.4.2→v1.4.3 各端 +0.6%–5.4% 中，DMG 增幅最大（+816KB）更可能来自 **macOS 壳 + 资源** 而非单一前端文件；前端 `app_icon`/`favicon` 压缩对 APK/IPA 有明确百 KB 级收益，对 DMG 需连同 native 资源一并量。
