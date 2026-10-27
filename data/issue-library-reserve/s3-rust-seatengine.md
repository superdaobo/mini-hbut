## TL;DR

在 Rust 侧实现座位预约的**查询**能力（余量 / 时段 / 我的预约）。
写接口（选座、提交、签到）契约尚未抓到，本 issue **明确不含**这些。

## 需求描述

座位预约是图书馆预约里使用频率最高的功能。第一版先让用户能在 App 内
看到座位余量、开放时段与自己的预约记录，把数据链路跑通。

## 当前行为

Rust 侧不存在任何图书馆预约相关代码。

## 期望行为

Rust 侧提供座位预约的只读查询能力，前端可展示余量与我的预约。

## ⚠️ 为什么本 issue 只做查询

座位预约的前端是**移动端页面**，其二级页面（选座、提交）依赖超星 App 原生桥接：

```javascript
// 页面内联 Vue 方法
toSeatListPage: function () {
  AppUtils.openUrl({ webUrl: '/front/apps/seatengine/list?deptIdEnc=...&seatId=3597&wfwEngineEnc=' })
}
// app.utils.js
AppUtils.prototype.openUrl = function (option) {
  B.postNotification('CLIENT_OPEN_URL', { loadType: 1, webUrl: '' , ...option })
}
```

在纯浏览器里没有原生宿主，`postNotification` 是空操作；且直接访问二级页 URL 会被服务端拒绝：

```
GET /front/apps/seatengine/list?...  →  500
「未查询到您所访问的应用，请咨询管理员配置是否正确」
```

因此**座位预约只能走 API 接入**，而选座/提交/签到的 API 契约尚未抓到（需在
08:00–22:00 开放时段内真实走一遍）。

## 已知事实：接口契约（**已实测**）

```
GET /data/apps/seat/i18n                                            ← 全量文案（含业务提示语）
GET /data/apps/reserve/link/domain/rules                             ← 跳转域名白名单（当前为空数组）
GET /data/apps/seat/entrance/config?appType=2&appId=3597             ← 入口能力开关
GET /data/apps/seatengine/index?seatId=3597&seatIdEnc=<enc>          ← 核心配置（107 字段）
GET /data/apps/seatengine/identity/verify?mappId=19248837&seatId=3597&seatIdEnc=<enc>
```

### `seatengine/index` 关键配置（实测摘要）

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `reserveBeforeDay` | 1 | 提前 1 天可约 |
| `reserveBeforeTime` | `08:00` | **每天 08:00 放次日号** |
| `reserveDuration` | 4 | 预约时长（小时） |
| `reserveNumLimit` | 1 | 同时仅 1 个预约 |
| `violateTimes` / `violationLimitDay` / `violationLimitDuration` | 3 / 7 / 3 | 7 天内违约 3 次 → 停用 3 天 |
| `timeUnit` | 60 | 时间粒度（分钟） |
| `commonTimeConfig` | 08:00–22:00 | 每日开放时段 |
| `noticeName` / `noticeContent` | 试运规则说明 / HTML | 规则原文 |

### 规则原文（`noticeContent` 摘录）

1. 按预约的座位号就坐和使用。
2. **应在预约起始时间后 20 分钟内完成签到**，否则视为违约。
3. 临时离开请使用"暂离"功能，**每日最多 3 次**。
4. 预约时间结束后自动签退。
5. **一周内违约达 3 次将被限制本周预约**；未按时签到、座位长时间未投入使用均视为违约。

### 页面路径地图（供后续补齐写接口时参考）

```javascript
toSeatListPage:    '/front/apps/seatengine/list?deptIdEnc=...&seatId=3597&wfwEngineEnc='
sceneChoseSeat:    '/front/apps/seatengine/live/select?deptIdEnc=...&seatId=3597&wfwEngineEnc='
toReserveListPage: '/front/apps/seatengine/reserve/list?seatId=3597&wfwEngineEnc='
```

## 影响范围

涉及模块：Rust 侧图书馆预约模块与命令层（依赖 S1 建立的结构）

## 验收标准

- [ ] 可获取座位预约的核心配置（开放时段、放号时间、时长与限额、违约规则）
- [ ] 可获取规则说明原文（`noticeContent`）供前端展示
- [ ] 可获取"我的预约"（当前预约 + 最近预约）
- [ ] 返回的"当前时间"以**服务端时间**为准（页面使用服务端注入时间，本地时间不可信）
- [ ] `cargo check` 通过
- [ ] 关键流程有简体中文注释

## 待补齐（不阻塞本 issue）

- [ ] 选座接口（`seatengine/list`、`live/select` 对应 API）
- [ ] 提交预约接口
- [ ] 签到 / 签退 / 暂离接口（配置 `onlySupportsApiSignIn: true`，只能走 API）
- [ ] 风控 / 验证码 / 位置校验的触发条件
      （`seat/captcha/type`、`seat/add/location/log`、`seat/risk/check/config`）

> 以上补齐需在 **08:00–22:00 开放时段**内真实走一遍预约流程。

## 关联

- 父 Epic：图书馆预约三系统接入
- 依赖：S1（Rust 基础模块与超星凭证链路）
- 被依赖：S6（前端座位预约查询 UI）
- 契约文档：`data/library-reserve-recon/01-api-contract.md`
