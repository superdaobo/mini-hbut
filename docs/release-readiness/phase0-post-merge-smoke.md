# 阶段 0：PR #539 合并后冒烟验证

验证日期：2026-08-02（Asia/Singapore）

## 合并与版本基线

- PR：#539 `security: 阶段一安全收口`
- 合并方式：merge commit
- 合并提交：`23204d6d533e5614f923c1f847ac7a983d126bc4`
- 合并时间：2026-08-02 16:09:20（UTC+8）
- 应用版本：`1.4.4`，本阶段未修改版本号。
- 未创建新 Git tag、GitHub Release、TestFlight 构建或商店发布。
- 阶段一总 Issue #532 与 Sub-issues #533–#538 在合并后关闭。

## GitHub 合并后验证

合并提交 `23204d6d` 对应的工作流全部成功：

- CI：run `30739218410`
- CodeQL：run `30739218415`
- Sync Website：run `30739218427`
- Sync main to dev：run `30739218402`

CI 包含前端生产构建、Vitest、CI 类型检查、前端安全守卫、dist 边界检查、Rust `cargo test --lib`、`cargo fmt --check` 与 `cargo clippy --lib`。CodeQL 覆盖 JavaScript/TypeScript、Rust 和 GitHub Actions。

## 本地验证

### 已通过

- `npm run test:ci`
  - 117 个测试文件通过
  - 611 项测试通过
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- `node scripts/check-frontend-safety.mjs`
- `node scripts/check-design-tokens.mjs`
- `node scripts/check_dist_boundary.mjs`
- 官网：
  - `npm run test:docs-ia`
  - `npm run test:docs-developer-content`
  - `npm run test:docs-user-content`
  - `npm run build`
  - 32 个静态页面完成生成与导出

### 本地环境限制

1. 本机未安装或未加载 Visual Studio C++ Build Tools，`npm exec -- tauri info` 无法检测 MSVC 和 Windows SDK，新的 Rust target 目录执行 `cargo test` 时因找不到 `link.exe` 失败。该失败发生在依赖构建脚本链接阶段，不是代码测试失败；合并提交对应的 GitHub Linux Rust CI 已完整通过。
2. 用户已有的 Tauri 开发实例仍在运行。验证过程没有结束或干扰该实例。
3. 本地主应用 `npm run build` 在 `scripts/prepare_dist.mjs` 阶段长时间停留。根因是仓库存在 11 个历史 `.dist-trash-*` 目录，脚本会对每个目录串行执行最多 10 次阻塞重试，单目录累计等待约 75 秒。GitHub CI 的干净工作区生产构建通过；本地可重复性问题纳入 #544 修复。

## 结论与后续门禁

阶段一合并结果在干净 GitHub 环境下通过完整 CI、CodeQL 与网站部署验证，前端核心测试和官网构建在本地再次通过。当前没有发布新版本。

阶段 2A 必须在进入发布候选前完成：

- #542：Bridge 多运行时和流式请求兼容性测试。
- #543：Capacitor/Tauri 版本一致性与依赖风险治理。
- #544：修复 `prepare_dist` 阻塞并建立统一检查入口。
- #545：Windows 正式配置无发布干跑构建。
