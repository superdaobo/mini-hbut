## TL;DR

「我的预约」读不到数据：现用端点 `POST /data/apps/reserve/latest/data` 实测返回 HTTP 400（缺 `itemId`，它并非列表接口），而正确端点 `POST /data/apps/reservepc/user/histroy` 实测返回该账号 **1 条**静音仓记录。即使换成正确端点，真实字段名与前端期待的字段也全部不一致，需一并核对。

## 决策点

- [ ] **取消预约端点是否本次一并核对**：页面实际引用的是 `data/apps/reserve/item/user/cancel`（现用 `reserve/del/form/aprv`），但取消是**写操作**，需要单独授权后才能实测。本次是只读核对 + 改路径，还是等写路径授权后再一起做？
- [ ] **`reserve/latest/data` 的定位**：实测它要求 `itemId`，说明它是「单个预约项的最近数据」而非列表。是直接替换掉，还是保留给未来的详情场景（当前无调用方）？

## 问题描述

用户上报：「预约界面显示『当前没有正在进行的座位预约』，实际上是它的接口根本没有读到数据。」

实测把这一句话拆成两半，结论是**前半句数据正确、后半句确实存在缺陷，但落点不在座位侧**：

1. **座位侧的空态是真实的**：带正确 `seatIdEnc` 请求 `seatengine/index` 返回
   `{"data":{"seatConfig":{…},"curReserves":[],"nearReserves":[]}}`，超星官方座位页自身也显示
   「当前预约：暂无预约 / 最近预约：空」。该账号当前确实没有座位预约。
2. **真正读不到数据的是「我的预约」**：App 调用的端点错误，导致服务端确实存在的记录无法呈现。

## 当前行为

### 1）座位侧（实测为空，非缺陷）

```
GET /data/apps/seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9
→ 200 {"data":{"seatConfig":{…107 字段…},"curReserves":[],"nearReserves":[]},"success":true}
```

官方座位页同步显示「暂无预约」（已截图存档）。Rust→IPC→前端字段链路已核对一致：
`transport/tauri/library_reserve.rs:462` 返回 `currentReservations`，`ReserveSeatPanel.vue:143` 读同名字段；
请求失败时走 `v-else-if="error"` 错误卡，不会静默变空态。

### 2）「我的预约」端点错误（实测）

```
POST /data/apps/reserve/latest/data   {reserveId:24727, reserveIdEnc:838c48dae07db28c, fidEnc:c7450f13f8a0e9ab}
→ HTTP 400  HTML 错误页
   errorMsg: Required request parameter 'itemId' for method parameter type Integer is not present
```

该路径在勘察期只是从页面 JS **静态提取**，从未实测过（`01-api-contract.md` 亦只把它标为「最近预约数据」）。

正确端点实测：

```
POST /data/apps/reservepc/user/histroy  {reserveId:24727, resvAppId:24727, reserveIdEnc:838c48dae07db28c, fidEnc:c7450f13f8a0e9ab}
→ 200 {"data":{"totalRow":1,"totalPage":1,"rows":[ … ]}}      ← 静音仓有 1 条
POST /data/apps/reservepc/user/histroy  {reserveId:24679, …}  → 200 {"data":{"totalRow":0,…}}   ← 研讨室 0 条
```

返回记录实测（节选）：

```json
{"id":29589158,"itemId":49136,"name":"4号静音仓","today":"2026-07-11",
 "starttime":1783760400000,"endtime":1783767600000,"status":2,"isCancel":0,
 "reserveDuration":206000,"remark":"讨论问题","aprvId":0,"reserveId":24727,"resvAppId":24727}
```

### 3）字段映射对不上

`ReserveMinePanel.vue:44-60 normalizeItem` 期待的字段与真实字段对照：

| 前端期待 | 真实字段 | 说明 |
| --- | --- | --- |
| `itemName` | `name` | 预约项名称（如「4号静音仓」） |
| `date` | `today` | 形如 `2026-07-11` |
| `startTime` / `endTime` | `starttime` / `endtime` | **Unix 毫秒时间戳**，不是 `HH:mm` 字符串 |
| `statusName` | `status` | 数字状态码（实测 2），无文案字段 |
| `aprvId` | `id` / `itemId` | 实测 `aprvId` 恒为 0 |
| （无） | `isCancel` | 是否已取消 |

即：即便端点换成正确的，现有映射仍会渲染出「时间待定 / 已预约」等兜底文案，取消按钮也会因
`aprvId` 为空而无法使用。

## 期望行为

- 「我的预约」能展示服务端实际存在的记录（本次实测账号：静音仓 1 条，研讨室 0 条）。
- 记录上的日期 / 起止时间按服务端真实字段正确呈现（毫秒时间戳需正确转换）。
- 已取消 / 状态信息能正确区分展示。
- 端点不可用或契约不符时给出可读错误，而不是「暂无预约记录」。

---

## 影响范围

| 文件 | 行号 | 当前状态 |
| --- | --- | --- |
| `apps/client/src-tauri/src/modules/library_reserve_pc.rs` | 82 | `ENDPOINT_MY_RESERVATIONS = "reserve/latest/data"`（实测 400） |
| `apps/client/src-tauri/src/modules/library_reserve_pc.rs` | 522-570, 835-845 | 我的预约条目模型与取数逻辑（字段多为推测，靠 `raw` 兜底） |
| `apps/client/src-tauri/src/modules/library_reserve_pc.rs` | 88 | `ENDPOINT_CANCEL = "reserve/del/form/aprv"`（页面实际引用 `reserve/item/user/cancel`） |
| `apps/client/src-tauri/src/modules/library_reserve_pc.rs` | 971 | 取消依赖 `aprvId`（实测该字段恒为 0） |
| `apps/client/src/components/library-reserve/ReserveMinePanel.vue` | 44-60 | `normalizeItem` 字段映射 |
| `apps/client/src/components/library-reserve/ReserveMinePanel.vue` | 104-111 | `askCancel` 依赖 `item.aprvId` |
| `apps/client/src/components/library-reserve/catalog.ts` | — | `extractHm` 等时间处理（当前只处理字符串时分） |
| `data/library-reserve-recon/01-api-contract.md` | — | 端点与字段契约需按实测更新 |

## 触发/复现方式

1. 登录后进入「图书馆预约」→「我的预约」页签。
2. 观察：无记录 / 报错，但服务端实际有 1 条静音仓记录。
3. 对照复现（浏览器，只读）：
   `POST https://reserve.chaoxing.com/data/apps/reservepc/user/histroy`
   body `reserveId=24727&resvAppId=24727&reserveIdEnc=838c48dae07db28c&fidEnc=c7450f13f8a0e9ab`
   → `totalRow=1`。

## 验收标准

- [ ] 「我的预约」不再调用返回 400 的端点
- [ ] 登录态正常时能展示服务端实际存在的记录（对照实测：静音仓 1 条）
- [ ] 日期与起止时间按真实字段正确渲染（毫秒时间戳转本地时分，不再落到「时间待定」）
- [ ] 状态与已取消记录能正确区分
- [ ] 无记录时展示空态、接口失败时展示错误态，二者不混淆
- [ ] 相关单测覆盖字段映射（含毫秒时间戳、`aprvId` 为 0 的情形）
- [ ] `cargo test --lib library_reserve` 全绿、`npm run typecheck` 通过

## 关联

- 父单：Epic（本 Epic）
- Epic #1051
- 证据文档：`data/library-reserve-recon/02-live-verification-2026-10-16.md`
- 写路径（选座 / 提交 / 签到 / 取消）契约仍缺，需单独授权后勘察
