## 概述

Epic #1051 第二阶段：**静音仓/研讨室功能完整可用**，同时 Rust 侧座位预约查询接口就绪。

> ⚠️ **本 PR 堆叠在 #1059 之上**（base 为 `feat/seat-reservation`）。请**先合并 #1059**，本 PR 的 base 会自动指向 `main`。

## 包含的 sub-issue

| Issue | 内容 |
| --- | --- |
| Closes #1053 | [Rust] 静音仓/研讨室 预约接口 |
| Closes #1054 | [Rust] 座位预约 查询接口 |
| Closes #1056 | [前端] 静音仓/研讨室 预约流程 UI |

> 说明：原计划把 #1054 放到 PR3，但 #1054 对 #1053 的文件做了 DRY 重构
> （通用工具上提到基础模块，`library_reserve_pc.rs` 净减约 250 行），两者已交织，
> 强行拆分会让 PR2 无法独立编译。故 Rust 层在本 PR 一次性交付。

## 交付内容

### Rust（#1053 静音仓/研讨室）

- 新增 `modules/library_reserve_pc.rs`：预约项详情 / 可预约时段 / 动态表单解析 /
  我的预约 / 提交 / 取消
- 提交失败可区分**业务失败**（时段被占 / 超限 / 违约停用）与**网络失败**
- `reserveId` / `reserveIdEnc` / `fidEnc` 全部实时获取，零硬编码

### Rust（#1054 座位预约查询）

- 新增 `modules/library_reserve_seat.rs`：核心配置（107 字段）/ 文案 / 身份校验 / 当前与最近预约
- **服务端时间优先**：座位预约页面用服务端注入的 `serverNow` 做开放判断，本地时间不可信；
  本实现从响应中提取服务端时间并标注来源（`serverNowSource: response | page`），
  两者都没有时**留空而非回退本地时间**

### 前端（#1056）

- 新增 `components/library-reserve/`：领域层 `catalog.ts` + 三个面板组件
  （`ReserveRoomPanel` / `ReserveFormFields` / `ReserveMinePanel`）
- `LibraryReserveView.vue` 接入静音仓 / 研讨室 / 我的预约三个 Tab
- 动态表单按 `customFormConfig` 渲染，含必填与格式校验
- **提交前二次确认**，并明确提示违约后果（未签到记违约 / 7 天内 3 次停用 3 天）
- i18n 三语各 77 条

## 验证

- ✅ `cargo check` 通过（48 warnings，与基线一致，**无新增**）
- ✅ `cargo fmt --all -- --check` → **0 diff**（CI 有 fmt 门闩）
- ✅ `cargo test --lib library_reserve` → **50 passed**
- ✅ `npm run typecheck` 通过
- ✅ 相关契约测试全绿（`role_capabilities` / `i18n_coverage` / `icon_font_subset` / `towergo` 等）

## 明确边界（未做，也未猜测）

- **座位预约的选座 / 提交 / 签到 / 暂离**：契约尚未抓到，本次**未实现也未猜测接口形态**。
  其二级页面依赖超星 App 原生桥接，且需在 08:00–22:00 开放时段内抓包。
- `multiple/submit` 的完整字段与 `customFormConfig` → 提交体映射**未实测**，
  已在代码中显式标 `TODO(#1053)`，只做「原样透传 + 保护键防覆盖」，不做字段名猜测。
- 取消接口（`reserve/del/form/aprv`）与「我的预约」端点（`reserve/latest/data`）为**候选**，
  需在开放时段实测确认。
- 错误分类目前是**提示语启发式**（依据中文关键词），超星改文案会退化为 `business_rejected`
  （仍能与网络失败区分）。建议 S7 阶段抓真实失败文案做回归样本。

## 已知遗留

- `LibraryReserveView.vue` 的 `.sub-hint` 样式因移除占位而暂未使用，故意保留以免与并行工作冲突，
  将在 #1058 收口时清理
- 「我的预约」当前合并展示静音仓 + 研讨室；#1057 接入座位预约时需协调该 Tab 的归属
- 房间 ↔ 时段绑定未在客户端强制过滤（契约未暴露可靠房间维度，避免误隐藏数据），
  确认弹窗优先采用后端返回的 `itemName` 作为权威值

## 后续

| PR | 内容 |
| --- | --- |
| PR3 | #1057（座位预约 查询 UI） |
| PR4 | #1058（契约测试与 i18n 门闩收口） |

Refs #1051
