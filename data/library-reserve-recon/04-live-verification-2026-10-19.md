# 图书馆预约 · 第二轮线上实测（2026-10-19）

> 执行人：Agent（dev 构建 + 调试桥驱动）
> 账号：2510231106（杨道博）
> 环境：`fix/library-reserve-credentials` 工作树，`npm run tauri:dev:debug-bridge`，桥接 `127.0.0.1:4399`
> 结论先行：**静音仓 / 研讨室「预约 → 我的预约 → 取消」全链路已真机跑通**；
> **座位提交被 cxCaptcha 行为验证挡住**（图片验证码是旧模板死代码），并顺带定位/修复了 `wfwEngineEnc` 导致的「您不具备访问此应用的权限」。

---

## 一、座位（seatengine）

### 1.1 已修：`wfwEngineEnc` 不能取入口链的 `wfwEnc`

**证据**：官方快速预约页 `live/select` 的内联脚本（原文）：

```html
<script>
  var deptIdEnc = '',
      seatId = '3597',
      seatIdEnc = 'b146028eafa4eea9',
      wfwEngineEnc = ''
</script>
```

- 提交时官方传的就是**空串**。
- 旧实现把入口链的 `wfwEnc`（`AD4F8E616945858DD07BCC1124BDDEC4`）当 `wfwEngineEnc` 塞进提交体，服务端返回
  `{"msg":"您不具备访问此应用的权限, 请联系管理员处理","success":false}`。
- 改成空串后，同样的提交返回 `验证码校验未通过` —— 说明**权限校验已通过**，只剩验证码。

代码：`apps/client/src-tauri/src/modules/library_reserve_seat.rs` 的 `submit_params()`（已改，含注释）。

### 1.2 决定性发现：图片验证码是死路，真实验证是 cxCaptcha

| 探测 | 结果 |
| --- | --- |
| `POST seat/captcha/type {appType:2, appId:3597}` | `{"captchaType":0,"captchaOpen":true,"openType":0}` |
| `POST seat/risk/check/config` | `{"riskCheckOpen":false}` |
| `POST seat/captcha` | 返回 180×60 图片验证码（`data:image/jpeg;base64,...`，实为 PNG） |
| 座位配置 | `securityVerify=1`、`securityVerifyType=0` |

官方页面 `seat_live.js` 的 `submit()`：

```js
if (securityVerify === 1 && captchaOpen) {
  if (parseInt(captchaType) === 0) {
    $.when(cxCaptcha(_this, 'cxCaptcha', dtd)).done(... submitSeatReserve ...)
  } else { wyCaptcha(...) }
}
```

`cxCaptcha`（`staticreserve/js/src/front/apps/cxcaptcha/cxcaptcha.js`，jsjiami 混淆）调用：

```js
initCXCaptcha({
  captchaId: '42sxgHoTPTKbt0uZxPJ7ssOvtXr3ZgZ1',
  element: '#cxCaptcha',
  type: getType(parseInt(seatConfig.securityVerifyType)), // 0 → 默认分支
  mode: 'al',
  onVerify: function (err, result) {
    if (err) return
    _this.captcha = result.token   // ← 提交时 captcha 要传这个 token
  }
})
```

- `initCXCaptcha` 来自页面 `<head>` 加载的 `https://captcha.chaoxing.com/load-d.min.js` / `light.js`。
- **`seatengine/captcha`（图片）与 `seat/captcha` 均不是本页使用的验证码**；`loadCaptcha()` 在 `seat_live.js` 里没有被 `submit()` 调用（只有模板里点图片才会触发）。
- 实测：20 秒内、签名正确、验证码图片人工识别正确（`2bt7`/`ujSA` 等）提交，仍稳定返回
  `{"msg":"验证码校验未通过，请重新尝试验证","success":false}`。
- Rust 命令层还会在 `captcha` 为空时本地拦截（`invalid_params`），所以「空验证码绕过」也不成立。

**结论**：座位提交**必须拿到 cxCaptcha 的 `token`**，纯接口/无交互方案不可行。可行路线只有：
1. 在 App 的 WebView 里加载 cxCaptcha 组件（脚本可 `fetch` 后内联注入，CSP 已允许 https connect + inline script），用户完成行为验证 → 取 `token` → 再走现有 `library_reserve_seat_submit`；
2. 或直接嵌入官方页面（需解决 cookie 注入）。

### 1.3 仍不可用：`/front/apps/seatengine/list`（预约选座）

- 带完整入口凭证（`enc/fidEnc/uid/mappIdEnc/formid/wfwEnc/mappId/appId/appKey/code/state`）访问
  `/front/apps/seatengine/list`，仍 302 到
  `/front/apps/reserve/error/code/500?msg=未查询到您所访问的应用...`。
- 与 10-16 勘察一致：该二级页依赖超星 App 原生桥接，浏览器/HTTP 走不通。

### 1.4 座位日期语义（结论）

- 配置：`reserveBeforeDay=1`、`reserveBeforeTime=08:00`、`allowReserveNow=0`、`reserveDuration=4`(小时)、`timeUnit=60`、开放 08:00–22:00。
  - 原始 `seatConfig` 的 `mon..sun` **七天全部** `08:00–22:00`；
  - UI 只显示 5 天（缺周二/周四）是**解析器键名 bug**：代码用 `tue`/`thu` 前缀，服务端实际键名是 `tues*` / `thur*`（见 §4）。
- `getstartendtime` 只返回**当天**：`{"ymd":"2026-10-19","startTime":0,"endTime":50400000}`。
- `getseatinfo` 只吃 `HH:mm`，服务端按**当天**匹配（11 个日期参数名均被忽略，见 10-16 勘察）。
- 因此：**快速预约只能约「今天」**；「明天/以后」的号源按 `reserveBeforeDay=1 + 08:00 放号` 存在，但**没有可用的网页入口**（`seatengine/list` 打不开），且提交还要过 cxCaptcha。
- 另：`allowReserveNow=0` 解释了 10-17 21:45 提交 20:00-22:00 失败的原因（已开始的时段不允许预约）。

---

## 二、静音仓 / 研讨室（reservepc）—— 全链路已跑通

### 2.1 真实提交契约（从 `reservepc/item` 页内联 JS 提取 + 实测）

`POST https://reserve.chaoxing.com/data/apps/reserve/multiple/submit`
（`application/x-www-form-urlencoded`）

| 字段 | 值 |
| --- | --- |
| `itemId` | 房间 ID（静音仓 49091/49134/49135/49136/49137；研讨室 48950/50941…50946） |
| `reserveId` | `24727`（静音仓）/ `24679`（研讨室） |
| `reserveUsers` | **JSON 字符串**：`[{"itemId":49134,"starttime":"2026-10-19 14:00","endtime":"2026-10-19 15:00","remark":"...","today":"2026-10-19","intervalIds":"[2035239]"}]` |
| `reserveNum` | `"1"`（`confirmDialog===0` 时固定 1） |
| `cycleType` | `"0"`（无重复） |
| `ua` | `"pc"` |
| `wfwEngineEnc` | `""`（与座位相同：空串） |
| `fidEnc` | `c7450f13f8a0e9ab` |
| `formsData` / `formUserId` / `aprvId` / `aprvStatusTypeId` | 可空（本次未填，提交成功） |

成功响应：

```json
{"success":true,"data":{"errData":[],"id":"30035260","payUrl":"","reserveUsers":[]}}
```

### 2.2 取消契约（实测）

`POST data/apps/reserve/item/user/cancel`，**只需 `{id, allCancel}`**：

```json
{"id":"30035260","allCancel":"0"}
→ {"success":true,"data":{"startTime":...,"endTime":...}}
```

取消后「我的预约」中该条：`status=7`、`isCancel=true`。

⚠️ 现有 Rust `cancel_params()` 发的是 `aprvId`（实测恒为 0），**不是**取消主键；本次是通过 `extra.id` 才成功的。UI 若要恢复取消按钮，必须改成 `id` + `allCancel`。

### 2.3 时段 ID 从哪来

- `POST data/apps/reserve/item/setting {reserveId, itemId, fidEnc}`
  → `data.commonIntervalMap["1".."7"][{id,startTime,endTime,week,available,userNum}]`
- 提交时 `reserveUsers[].intervalIds` 用这些 `id`（JSON 数组字符串）。
- 例（周一）：静音仓 08:00=2035233、11:00=2035236、12:00=2035237、14:00=2035239；研讨室 08:00=2030198、11:00=2232056、15:00=2232060、16:00=2232061。
- 房间/预约对象详情：`POST data/apps/reserve/item/detail {id: itemId, reserveIdEnc, fidEnc}`（`reserveIdEnc` 由页面注入，本次为 `838c48dae07db28c`）。

### 2.4 实测记录（全部已取消，无残留）

| 时间 | 系统 | 房间 | 时段 | 结果 |
| --- | --- | --- | --- | --- |
| 10:09 | 静音仓 | 2号（49134） | 2026-10-19 14:00-15:00 | ✅ id=30035260，随后取消 → status=7 |
| 10:10 | 研讨室 | 4号（50943） | 2026-10-19 16:00-17:00 | ✅ id=30035270，随后取消 → status=7 |
| 10:11 | 静音仓 | 1号（49091） | 2026-10-22 14:00-15:00 | ✅ id=30035287，随后取消 |
| 10:11 | 静音仓 | 1号（49091） | 2026-10-23 14:00-15:00 | ❌ 「当前预约时间段未开放，请重新选择」 |
| 10:11 | 研讨室 | 2号（50941） | 2026-10-21 14:00-15:00 | ✅ id=30035289，随后取消 |
| 10:11 | 研讨室 | 2号（50941） | 2026-10-22 14:00-15:00 | ❌ 「当前预约时间段未开放，请重新选择」 |

> 注：10:10 首次取消用错 id（脚本 bug）导致 30035270 多存活 ~30 秒，随后已正确取消。
> 「已约满」= 该房间该时段已被占用（用户/他人），换房间或时段即可。

### 2.5 房间日期语义（结论 + 实测验证）

页面 `initHeader` 逻辑（原文）：

```js
var advanceDays = _this.reserve.advanceDays            // 3
var configHour = parseInt(_this.reserve.advanceTime.split(':')[0])
var current = serverNow
if ((current.getHours()*60 + current.getMinutes()) > (configHour*60 + configMinutes)) {
  advanceDays = advanceDays + 1                        // 放号时间已过 → 多给一天
}
initHeader(_this, now, advanceDays, diff)              // 生成 advanceDays - diff 天
```

| 系统 | advanceDays | advanceTime | 现在 10:1x | 可约日期 | 实测 |
| --- | --- | --- | --- | --- | --- |
| 静音仓 | 3 | `00:00` | 已过 → 4 天 | **10-19 ~ 10-22（今天起 4 天）** | 10-22 ✅ / 10-23 ❌ |
| 研讨室 | 3 | `22:00` | 未到 → 3 天 | **10-19 ~ 10-21（今天起 3 天）**；22:00 后会变成 4 天 | 10-21 ✅ / 10-22 ❌ |

- 两端都是**包含今天**，不是「只能约明天」。
- 时段粒度：研讨室 13 段（`08:00` … `20:00-21:30`，**最后一档 1.5 小时**）；静音仓同为 13 段。
- 静音仓要求 2-6 人（页面弹窗），但**表单未填也能提交成功**（`isForms=1` 的表单本次未强制校验）。

### 2.6 ⚠️ 两个必须记住的坑（本轮 UI 修复时踩到）

**坑 1：`advanceDays` 必须取「预约项」而不是「房间」**

| 来源 | 值 | 是否权威 |
| --- | --- | --- |
| `reserve/info` → `reserveData.advanceDays` | **3** | ✅ 官方页面用这个；与实测边界一致 |
| `reserve/item/list/time` 房间条目 `advanceDays` | **14** | ❌ 房间自身配置，**不是**可约窗口 |

若优先取房间值（旧实现如此），网格会渲染 **15 天**（10-19 ~ 11-02），用户选第 5 天起提交必然被拒
（`当前预约时间段未开放，请重新选择`）。已改为 `itemInfo → room → 顶层` 的优先级，并加回归测试。

**坑 2：网格列必须用服务端真实时段，不能按 `timeUnit` 自己切分**

研讨室最后一档服务端配置是 **`20:00-21:30`**（1.5 小时）。旧实现按 `timeUnit=60` 切分窗口，
产出 `20:00-21:00` → 提交报
`预约时间段与系统设置时间段不一致，请重新选择`。
正确做法：列直接取自 `reserve/item/setting` 的真实时段（`startTime-endTime` 原样），
提交时 `intervalIds` 用对应 `id`，`starttime/endtime` 与配置**逐字一致**。

---

## 三、接口可用性矩阵（2026-10-19 实测）

| 接口 | 状态 | 备注 |
| --- | --- | --- |
| `seatengine/index` | ✅ | 107 字段配置 + `curReserves/nearReserves` |
| `seatengine/room/list` | ✅（返回） | 实际键名是 **`seatRoomList`**；现有解析器只找 `rows/rooms/list/records` → `rooms=0`（bug） |
| `seatengine/levels` | ✅ | 2 个区域 |
| `seatengine/getstartendtime` | ✅ | 当天、`0/50400000` |
| `seatengine/getseatinfo` | ✅ | 返回单个座位并临时锁定 |
| `seat/captcha` | ✅ | 图片验证码（本应用不使用） |
| `seat/captcha/type` | ✅ | `captchaType=0, captchaOpen=true` |
| `seat/risk/check/config` | ✅ | `riskCheckOpen=false`（不需要 wyToken） |
| `seatengine/submit` | ⚠️ | 可达；`wfwEngineEnc=''` 后只剩验证码门槛，无 cxCaptcha token 必失败 |
| `seatengine/list` | ❌ | 500「未查询到您所访问的应用」（带全套凭证也一样） |
| `reserve/info` | ✅ | 静音仓/研讨室 |
| `reserve/item/list/time` | ✅ | **start/end 必须留空**；传日期范围返回 0 条 |
| `reservepc/user/histroy` | ✅ | 我的预约（含 `id/itemId/starttime/endtime/status/isCancel`） |
| `reserve/item/detail` | ✅ | 需 `reserveIdEnc` |
| `reserve/item/setting` | ✅ | `commonIntervalMap` / `hoildays` |
| `reserve/multiple/submit` | ✅ | 契约见 §2.1 |
| `reserve/item/user/cancel` | ✅ | `{id, allCancel}` |
| `reserve/verify/reserveuser/status` 等 | 未测 | 非本次范围 |

---

## 四、本次暴露的缺陷 / 待办

1. **座位验证码链路整体错误**（P0，未修）：`prepare/提交` 用的是 `seat/captcha` 图片验证码；本应用真实要求 cxCaptcha token。要么接 cxCaptcha 组件，要么放弃原生提交。
2. ✅ **已修**：`wfwEngineEnc` 座位提交改空串（否则「不具备访问此应用的权限」）。
3. ✅ **已修**：取消契约改为记录 `id` + `allCancel`（原用 `aprvId`，恒为 0）。
4. ✅ **已修**：房间 UI 提交改官方 `reserveUsers`（含 `intervalIds`）+ `reserveNum` + `cycleType`。
5. **`seatengine/room/list` 解析键名 bug**（P2，未修）：补 `seatRoomList` 即可。
6. `library_reserve_time_list` 的 `advanceDays` 未解析（返回 null）—— 已由 §2.6 坑 1 的优先级修正绕过。
7. 座位「预约选座」页仍打不开（与 10-16 一致），座位暂无法约未来日期。
8. **座位开放日解析键名 bug**（P2，未修）：`COMMON_TIME_DAY_PREFIXES` 用 `tue`/`thu`，服务端是 `tues*`/`thur*` → UI 误显示「周二/周四不开放」。原始配置七天都开放。

### 4.1 本轮已落地的修复（2026-10-19 下午）

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| 取消契约 | `library_reserve_pc.rs` / `transport/tauri/library_reserve.rs` | `CancelReserveRequest{id, all_cancel}` → body `{id, allCancel}`；命令入参 `id` |
| 新增时段设置命令 | 同上 + `lib.rs` | `library_reserve_item_setting`（`reserve/item/setting` → 真实时段 ID） |
| 房间提交契约 | `ReserveRoomPanel.vue` | `reserveUsers` JSON 字符串 + `intervalIds`；`reserveNum='1'`、`cycleType=0`、`wfwEngineEnc=''` |
| 可约天数来源 | `ReserveRoomPanel.vue` | `itemInfo.advanceDays` 优先（§2.6 坑 1） |
| 网格列来源 | `roomCatalog.ts` `buildRoomGrid(..., slots)` | 用真实时段作列，杜绝非整点档错位（§2.6 坑 2） |
| 我的预约取消 | `ReserveMinePanel.vue` | 重新接入取消（确认弹窗 + 服务端原文错误）；两套记录合并展示、倒序 |
| i18n | `zh-CN/en/ja` | 新增 `booking.setting*` / `mine.cancel*` / `toast.intervalMissing` |
| 提交条定位 | `ReserveRoomPanel.vue` | 由 `sticky; bottom:72px` 改为 **`fixed` 贴屏幕底部**（用户反馈：原来停在内容中段挡住网格）。实测 `library_reserve` 非主 Tab → 该页**无底部导航栏**，故直接贴底（`bottom: 12px + 安全区`）；宽屏居中限宽 720px |

### 4.2 本轮 UI 端到端实测（真机，全部已取消）

| 步骤 | 结果 |
| --- | --- |
| 静音仓网格天数 | 4 行（10-19 ~ 10-22）✅ 与实测边界一致（修复前是 15 行） |
| 研讨室网格天数 | 3 行（10-19 ~ 10-21）✅（`advanceTime=22:00`） |
| 研讨室网格列 | 含 `20:00-21:30`（真实非整点档）✅ |
| UI 提交（静音仓） | 1号静音仓 10-19 18:00-19:00 → **id=30035738** ✅ |
| UI 取消（静音仓） | 同一条 → `status=7 / isCancel=true`，列表变「已取消」且按钮消失 ✅ |
| UI 提交（研讨室） | 研讨室2 10-20 20:00-21:30 → **id=30035806** ✅ |
| UI 取消（研讨室） | 同一条 → `status=7 / isCancel=true` ✅ |
| 业务拒绝透传 | 已约满 / 时间段不一致 均按「i18n 文案 + · 服务端：原文」展示 ✅ |
| 遗留 | 全部测试预约已取消；仅剩用户本人 7 月历史记录（服务端拒绝取消已结束记录，属正确行为） |

### 4.3 门闩（本轮最后一次全绿）

- `cargo fmt --all -- --check` → 0 diff
- `cargo test --lib library_reserve` → **103 passed**（新增 2 条：取消契约 / 时段设置解析）
- `cargo test --lib runtime_log` → 5 passed
- `npm run typecheck` → 0 错误
- `npm run test:ci` → **3623 passed**（仅 `src/utils/ios_deep_link_scheme_patch.spec.ts` 失败，Windows CRLF shebang **既有环境问题**，与本轮无关）

### 4.4 布局修复实测（提交条贴底）

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| `position` | `sticky`（内容中段 → 不吸底） | `fixed` |
| 距视口底部 | ~200px（压住网格第 3/4 行） | **12px** |
| 滚到底后是否遮挡内容 | — | 否（通知卡片底边距提交条顶边仍有 ~170px） |
| 宽屏 | 横跨整屏 | 居中限宽 720px |

> ⚠️ **god-file 守卫现状（既有问题，非本轮引入）**：`npm run check:god-files` 报 6 个超限文件。
> 其中 `http_client/auth.rs`（HEAD 已 2420 行）与 `modules/library_reserve.rs`（HEAD 已 1838 行）
> 在 **HEAD 就已超 1800 行**；`library_reserve_pc.rs`（HEAD 1343 → 现 1939）与
> `library_reserve_seat.rs`（HEAD 1241 → 现 2529）是**本分支未提交的累计改动**推高的。
> 该守卫不在 PR CI 中（仅 release-readiness 跑 `check:all`），但合入 main 前建议拆分
> `library_reserve_pc.rs` / `library_reserve_seat.rs`（本轮新增的时段设置逻辑可独立成模块）。
> 本轮的 `.vue` 均未超限（`ReserveRoomPanel.vue` 1029 < 1500）。

### 4.5 座位提交类型 bug（用户实测报错，已修）

**现象**（用户真机操作）：点「提交预约」后弹窗内红字报

```
invalid args `req` for command `library_reserve_seat_submit`:
invalid type: string "13248", expected i64
```

**根因**：`SeatMatchView.roomId` 在归一化时被 `toStr()` 转成**字符串**，
`resolveSeatSubmitParams` 原样透传 → 前端下发 `room_id: "13248"`，
而 Rust `LibraryReserveSeatSubmitRequest.room_id` 是 `i64`。

**修法**：`SeatSubmitParams.roomId` 改为 `number`，新增严格解析 `parseRoomId`
（仅接受正整数；`"abc"` / `""` / `"0"` / `"-1"` / `"12.5"` → `null`，宁可不提交）。

**验证**：修复后重跑同一 UI 流程，服务端响应由 `invalid type …` 变为
`提交座位预约失败：验证码校验未通过，请重新尝试验证` —— 说明**请求体已通过 Rust 与
服务端的形状校验**，只剩验证码这一道门（见 §1.2）。

### 4.6 cxCaptcha 组件在 App 内能否自举（探测结论：暂不可行）

在 App 的 WebView 里 `fetch` 官方 `<head>` 注入的两个脚本并内联执行：

| 步骤 | 结果 |
| --- | --- |
| `captcha.chaoxing.com/load-d.min.js`（292KB） | 200，注入成功 |
| `captcha.chaoxing.com/light.js`（17.6KB） | 200，注入成功 |
| `typeof window.initCXCaptcha` | **仍为 `undefined`**（注入后无任何相关全局） |

`load-d.min.js` 是重度混淆（含 pako/deflate + 字符串表），`initCXCaptcha` 只作为
字符串表条目出现；可见其引导依赖运行环境探测（很可能依赖 `document.currentScript`
或真实 `<script src>`），而 **CSP 的 `script-src` 不含远程域**，只能内联注入 —— 二者冲突。

> 另：脚本里可见 `'#prompt'`、`'Please click in order'` → 该验证是**需要人工点击**的
> textclick，无法用纯接口绕过。

**因此座位「本机提交」目前只有两条现实路径**：
1. 继续逆 `load-d.min.js` 的引导条件（不确定，且需用户点击验证）；
2. **在 App 内嵌入官方快速预约页**（✅ **已实现，见 §4.7**）。

### 4.7 已落地：官方页面内嵌（座位可真实预约）

**结论：可用**。官方「快速预约」页已在 App 内以已登录状态完整加载（时间片 / 区域 / 开始匹配 /
安全验证都由官方页自己处理）。

**实现**：`modules/library_reserve_embed.rs`（子 WebView + cookie 注入）+ 前端
`LibraryReserveEmbed.vue`（挂在座位面板，含打开/关闭 + bounds 跟随）。

#### 关键：cookie 必须注入，且有两个坑

Rust 的 `reqwest` cookie jar 与 WebView2 的 cookie 存储是**两套**；入口 URL 即使带一次性
`code`，在无 cookie 环境下也会 302 到登录页（Playwright 实测确认）。故必须用
`Webview::set_cookie`（Tauri 2.11 起提供）把 App 会话写进子 WebView。

| 坑 | 现象 | 解法 |
| --- | --- | --- |
| **域带前导点** | `domain(".chaoxing.com")` 被 WebView2 忽略 | 用**无点**域（按 origin 各自 host，如 `reserve.chaoxing.com`） |
| **提交时序竞争** | 日志显示「已注入 39 条」但页面仍跳登录页 | `set_cookie` 是异步提交，注入后 **sleep 700ms** 再 `navigate` |

**自检证据**（运行时日志，实测）：

```
cookie 注入完成 提交=39 目标域回读=39
内嵌页最终 URL=https://reserve.chaoxing.com/front/apps/seatengine/live/select?... 落在登录页=false
```

#### 加载时序（避免闪登录页）

1. 先在**屏外 1×1** 创建子 WebView（首次加载必然未带 cookie）；
2. 注入 cookie + sleep 700ms + 回读自检；
3. `navigate(目标)` 重新加载（这次带会话）；
4. 再搬到 DOM 容器的真实位置。

前端打开前会先 `scrollIntoView({block:'nearest'})` —— 实测容器若在视口外（y≈987 / 视口 801），
浮层会完全不可见。

#### 顺带修掉的两个调试工具缺陷（同一根因）

存在**子 WebView** 时 `get_webview_window("main")` 返回 `None`，导致：

| 工具 | 修复 |
| --- | --- |
| 原生截图 `/debug/screenshot` | 改用 `get_window("main")`（只需 HWND；且子 WebView 区域会被一并截到） |
| `/debug/frontend-eval` | 改用 `get_webview("main")` 执行 JS，标题回读另取 `get_window` |

> 影响面评估：`get_webview_window("main")` 在仓库内仅上述 2 处 + 单实例聚焦（`lib.rs`）。
> 单实例那条会降级为「不聚焦」（仅在子 WebView 打开时第二次启动才触发），无核心功能受损。

---

## 五、复现配方（本次用的调试手法）

- 前端执行任意命令：`POST /debug/frontend-eval {"js": "..."}`（fire-and-forget）
- 回传结果：在 JS 里 `fetch('http://127.0.0.1:4399/debug/logs/push', {method:'POST', body: JSON.stringify({scope:'Probe', level:'info', message:'PROBE_x '+JSON.stringify(result)})})`
- 读取：`GET /debug/logs?scope=Probe&q=PROBE_x`
- 调用：`window.__TAURI_INTERNALS__.invoke('<command>', { req: {...} })`
- 座位签名：`fetch` 官方 `md5.js` + `submitVerify.min.js` → AMD shim 内联注入 → 设 `#submit_enc` → `verifyParam({roomId,startTime,endTime,day,captcha,seatNum,wyToken:'',wfwEngineEnc:''})`
- ⚠️ 本轮临时加的 `debug_library_reserve_post` / `debug_library_reserve_seat_html` 两条调试命令**已删除**，未留在工作树。
