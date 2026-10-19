## 概述

Epic #1051 第三阶段：**座位预约查询界面**。

> ⚠️ **堆叠 PR**：base 为 `feat/library-reserve-reservepc`（#1069），而 #1069 又堆叠在 #1059 之上。
> 合并顺序：**#1059 → #1069 → 本 PR**。

## 包含的 sub-issue

| Issue | 内容 |
| --- | --- |
| Closes #1057 | [前端] 座位预约 查询 UI |

## 交付内容

- 新增 `ReserveSeatPanel.vue`：座位预约查询面板
  （开放状态 / 放号时间 / 预约时长与限额 / 规则原文 / 当前与最近预约 / 暂不支持说明）
- 新增 `seatCatalog.ts` 领域纯函数层 + **20 个单测**
- `LibraryReserveView.vue` 接入座位面板，移除占位卡片与 Tab 级死代码
- i18n 三语各新增 41 条 `library.reserve.seat.*`，清理 5 个被重构置为孤儿的死键

## 关键约束落实

### 服务端时间优先（本功能最大的坑）

座位预约页面用**服务端注入的时间**做开放判断，本地时间不可信。实现上：

- 优先取后端返回的 `serverNow`；解析失败返回 `null`
- `null` 时**整块状态卡只显示"未获取到服务端时间，暂不显示开放与放号状态判断"**，
  **不产生任何时间推断文案**（宁可不说，不说错）
- 日期时间优先取字符串自带的**字面量**（与设备时区无关，已单测锁定）；
  仅时间戳路径按固定 UTC+8 换算（显式默认假设）

### 其他

- `noticeContent` 经既有白名单净化器 `sanitizeSchoolInboxHtml` 后再 `v-html`（XSS 防护），
  纯文本走 `linkifyPlainText`（先转义）
- **零死按钮**：选座 / 提交 / 签到 / 余量以"暂不支持的操作"说明 + 跳转引导呈现，不编造数据

## 「我的预约」Tab 归属的决策

**选择：座位记录就地展示在座位 Tab 内，不改动现有「我的预约」Tab。**

理由：

1. 座位预约的数据与核心配置**同源于一个响应**（`curReservations` / `nearReservations`），
   就地渲染零额外请求；
2. 座位预约**没有取消契约**（Rust 侧只提供只读查询），而现有「我的预约」面板对每条记录
   都渲染"取消预约"按钮。并入会强制加"座位行不显示取消"的分支，既改动已交付逻辑，
   又必然产生**死按钮**——与 issue 明确禁止的要求冲突。

## 验证

- ✅ `npm run typecheck` 通过
- ✅ `vite build` 成功（`LibraryReserveView` chunk 36.48 kB）
- ✅ 全量 `vitest run`：**3384 passed / 0 failed**
- ✅ `seatCatalog.spec.ts` 20 passed / `i18n_coverage.spec` 3 passed / `role_capabilities.spec` 15 passed

## 已知遗留

- **余量/选座时段列表不可得**：契约已确认座位预约二级页依赖超星原生桥接（浏览器 500），
  无可用接口，故以"暂不支持"条目如实说明，未编造数据
- **预约条目字段名未实测**（Rust 侧也是 best-effort）：当前按 `seatNo` / `roomName` / `date` /
  `startTime` / `endTime` / `statusName` 宽松解析，`raw` 已随响应返回；
  后续抓到真实字段名只需改 `normalizeSeatReservation` 一处
- `serverNowSource: 'page'` 依赖页面抓取：若页面结构变更导致提取失败，会退回"不做推断"
  （符合要求），但用户看不到开放状态；建议后续抓到响应内服务端时间字段名后收窄候选键

## 后续

| PR | 内容 |
| --- | --- |
| PR4 | #1058（契约测试与 i18n 门闩收口） |

Refs #1051
