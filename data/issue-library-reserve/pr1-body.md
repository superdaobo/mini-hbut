## 概述

Epic #1051 第一阶段：建立图书馆预约（超星 reserve 三系统）的**地基**。

本 PR 只做地基，**暂不暴露完整功能**：Rust 侧打通凭证链路，前端侧搭好页面框架。
后续 PR 补齐静音仓/研讨室完整流程与座位预约查询。

## 包含的 sub-issue

| Issue | 内容 |
| --- | --- |
| Closes #1052 | [Rust] 基础模块与超星凭证链路 |
| Closes #1055 | [前端] 页面框架、模块注册与 i18n |

## 关键实现

### Rust（#1052）

- 新增 `modules/library_reserve.rs` + `transport/tauri/library_reserve.rs`，3 个命令注册到 `lib.rs`
- **复用既有 `ensure_chaoxing_sso`，不新建登录通道**
- 手动跟随 302 链（复用主客户端 `cookie_jar`）以拿到真实系统 URL 及其凭证
- 错误可区分：`chaoxing_not_logged_in` / `no_permission` / `network_unreachable`，前端可按 `kind` 分支
- 凭证（`enc` / `fidEnc` / `uid` / `*Enc`）**零硬编码，全部实时解析**（疑似短时效）

### 前端（#1055）

- 新增 `LibraryReserveView.vue`：单页四 Tab 框架（座位预约 / 静音仓 / 研讨室 / 我的预约）
- 注册到 `viewRegistry`、`home.cat.chaoxing` 分类、图标映射与商店策略清单
- i18n 三语齐备（各 19 条），含未登录引导态与加载/空/错误态

## 验证

- ✅ `cargo check` 通过（48 warnings，与改动前基线一致，**无新增**）
- ✅ `cargo test --lib modules::library_reserve` → **11 passed**
- ✅ `npm run typecheck` 通过
- ✅ 相关契约测试全绿（`role_capabilities` / `towergo_home_contract` / `i18n_coverage` / `icon_font_subset` 等 17 个 spec）

## 勘察纠正（实测推翻了文档）

未登录链路第一跳实测是 `unified-auth.chaoxing.com/login_auth/**`（勘察文档原写 `auth.chaoxing.com`），
且未登录时最终落到**学校 CAS 登录页**。

关键点：`login_auth` 在**已登录流程中同样会经过**，因此登录页判定**未采用**通用的「路径含 `/login`」规则
（那样会误杀已登录流程），改为只认 `passport*.chaoxing.com` / `sso.chaoxing.com` / 路径末段为 `login` 的
`chaoxing.com`、`hbut.edu.cn` 主机，外加登录页正文特征。已写成回归测试。

## 已知遗留

- **App.vue 已顶格 800 行 god-file 上限**，后续任何改动都会立即触发 `check:god-files` 违规
  （建议按既有范式把视图分支表整体外置）
- `library_reserve` 暂未加入首页宫格排序（布局编辑器 `homeModuleMeta` 未 i18n 化），将在 S5/S6 一并补
- 「已登录但无权限」的真实表现未勘察过，当前按 403 / 已知错误文案判定，联调时据实收紧
- 已登录态的落地 URL 未能在本地实测（无超星会话），返回体带 `contractMatch` 字段可在联调时立即暴露偏差

## 后续计划

| PR | 内容 |
| --- | --- |
| PR2 | #1053 + #1056（静音仓/研讨室 完整流程） |
| PR3 | #1054 + #1057（座位预约 查询） |
| PR4 | #1058（契约测试与 i18n 门闩收口） |

## 勘察产出

- `data/library-reserve-recon/00-README.md` — 可达性勘察、绕开微信的链路、三系统对照
- `data/library-reserve-recon/01-api-contract.md` — 接口契约（参数 + 响应 + 字段含义）

Refs #1051
