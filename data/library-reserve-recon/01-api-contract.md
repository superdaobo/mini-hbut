# 图书馆预约系统 · 接口契约（实测抓取）

> 抓取时间：**2026-10-15 23:2x–23:4x**
> 抓取方式：Playwright 有头浏览器全量流量捕获（request headers / postData / response body）
> 系统：`reserve.chaoxing.com`（超星预约引擎）
> 声明：**本次仅走通到「进入预约入口」这一步，未提交任何预约**。
> 提交类接口（`reserve/multiple/submit` 等）仅从 JS 静态提取到调用形态，**未实际调用**。

---

## 一、两套子应用，架构不同（重要）

| 应用 | 前端形态 | 页面基址 | 二级页面可达性 |
| --- | --- | --- | --- |
| **座位预约** | 移动端 SPA（Vue + requirejs） | `/front/apps/seatengine/` | ❌ **依赖超星 App 原生桥接，浏览器走不通** |
| **静音仓 / 研讨室** | **PC 版**页面 | `/front/web/apps/reservepc/` | ✅ 浏览器可直接访问 |

### 座位预约为何走不通（已定位到源码）

```javascript
// 页面内联 Vue 方法
toSeatListPage: function () {
  AppUtils.openUrl({ title: '', webUrl: location.origin + '/front/apps/seatengine/list?deptIdEnc=...&seatId=3597&wfwEngineEnc=' })
}
// AppUtils.openUrl 的实现（app.utils.js）
AppUtils.prototype.openUrl = function (option) {
  B.postNotification('CLIENT_OPEN_URL', $.extend({ loadType: 1, webUrl: '' }, option))
}
```

`openUrl` 通过 **`postNotification('CLIENT_OPEN_URL')` 调原生桥接**。
在纯浏览器里没有宿主 → **空操作**（这解释了"点击快速预约完全没反应"）。
且直接访问二级页 URL 会 500：

```
GET /front/apps/seatengine/list?...  →  500
「未查询到您所访问的应用，请咨询管理员配置是否正确」
```

> **结论**：座位预约的选座/提交必须在超星 App（或微信内）的 webview 中完成；
> 客户端若要实现座位预约，**不能走页面，只能直接调 `/data/apps/seatengine/**` 接口**。

### 另一个隐蔽坑：页面用的是服务端注入时间

```javascript
serverNow = new Date('2026-10-15T23:31:03.073+08:00'),   // ← 服务端注入
currentServerTime = seatBaseUtils.createServerClock(serverNow)
```

所有开放时段判断都用 `serverNow`，**不是浏览器时间**（`page.clock` 时间模拟对它无效）。
这是超星的防作弊设计，客户端做本地校验时要注意：**以服务端返回的时间为准**。

---

## 二、静音仓 / 研讨室 接口（PC 版，已实测）

所有接口统一：
- Base：`https://reserve.chaoxing.com/data/apps/`
- Method：**POST**
- Content-Type：**`application/x-www-form-urlencoded; charset=UTF-8`**

### 1) 预约项详情

```
POST /data/apps/reserve/info
Body: reserveId=24727&reserveIdEnc=838c48dae07db28c&fidEnc=c7450f13f8a0e9ab
```

响应关键字段：

```json
{"data":{"reserveData":{
  "id":24727, "deptId":25285,
  "advanceDays":3, "advanceTime":"00:00",
  "durationLimitOpen":1, "durationLimitMin":241,
  "confirmDialog":1, "dialogTitle":"特别提醒",
  "dialogContent":"<p>静音仓要求使用人数为2-6人，如特殊情况下需1人单独使用静音仓，请到图书馆2楼服务台咨询。</p>",
  "allowReserveSameTime":1, "allowReserveNowTime":0,
  "cancelLimit":-1.0, "cycleType":0
}}}
```

> `advanceDays:3` = 可提前 3 天预约；`durationLimitMin:241` = 单次最长 241 分钟。

### 2) 可预约时段列表（核心）

```
POST /data/apps/reserve/item/list/time
Body: sw=&reserveId=24727&resvAppId=24727&startTime=&endTime=&reserveIdEnc=838c48dae07db28c&fidEnc=c7450f13f8a0e9ab
```

响应：`{"data":{"reserveItemList":[ { "advanceDays":14, "aprvId":0, "customFormConfig":"[...]", ... } ]}}`

> `customFormConfig` 是**动态表单定义**（JSON 字符串，含字段类型/校验/默认值）——
> 说明预约需要填写表单，客户端实现时要能解析并渲染这份配置。

### 3) 用户视图 / 团队 / 角色

```
POST /data/apps/reservepc/user/view/flag   Body: reserveId=24727&fidEnc=c7450f13f8a0e9ab
   → {"data":{"showStyle":"0"},"success":true}

POST /data/apps/reservepc/open/team        Body: reserveId=24727&fidEnc=c7450f13f8a0e9ab
   → {"data":{"openTeam":false},"success":true}

POST /data/apps/reservepc/team/list        Body: reserveId=24727&fidEnc=c7450f13f8a0e9ab

POST /data/apps/seat/person/role           Body: fidEnc=c7450f13f8a0e9ab
   → {"data":{"roleListSelf":[{"alias":"2510231106","aliasName":"2510231106","roleId":3}]},"success":true}
```

### 4) 提醒对话框确认

```
GET /data/apps/reserve/dialog?reserveId=24727&fidEnc=c7450f13f8a0e9ab&dialogAgreeStatus=false
```

---

## 三、座位预约 接口（seatengine，实测可达）

```
GET  /data/apps/seat/i18n                                     ← 全量文案（含业务提示语）
GET  /data/apps/reserve/link/domain/rules                      ← 跳转域名白名单（当前为空）
GET  /data/apps/seat/entrance/config?appType=2&appId=3597      ← 入口能力开关
GET  /data/apps/seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9    ← 核心配置
GET  /data/apps/seatengine/identity/verify?mappId=19248837&seatId=3597&seatIdEnc=...
```

### `seatengine/index` 关键配置（107 字段，摘要）

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `reserveBeforeDay` | 1 | 提前 1 天可约 |
| `reserveBeforeTime` | `08:00` | **每天 08:00 放次日号** |
| `reserveDuration` | 4 | 预约时长（小时） |
| `reserveNumLimit` | 1 | 同时仅 1 个预约 |
| `violateTimes` / `violationLimitDay` / `violationLimitDuration` | 3 / 7 / 3 | 7 天内违约 3 次 → 停用 3 天 |
| `superviseNum` / `superviseDuration` | 2 / 10 | 监督规则 |
| `timeUnit` | 60 | 时间粒度（分钟） |
| `onlySupportsApiSignIn` | true | **签到只能走接口，无网页按钮** |
| `commonTimeConfig` | 08:00–22:00 | 每日开放时段 |

### 规则原文（`noticeContent`，摘录）

1. 遵守图书馆座位使用规则，按预约的座位号就坐和使用。
2. **读者应在预约起始时间后 20 分钟内完成签到**，否则视为违约。
3. 如临时离开座位，请在座位界面使用"暂离"功能，**每日最多 3 次**。
4. 座位预约时间结束后将会自动签退。
5. **若一周内违约达 3 次会被限制本周的预约使用**；未在要求时间内签到、预约座位长时间未投入使用均视为违约。

---

## 四、写接口（静态提取，未调用）

### 静音仓/研讨室 提交

```javascript
// reserveUtils.js
$.post('data/apps/reserve/multiple/submit', data)
// data 含：formUserId / aprvId / aprvStatusTypeId / fidEnc / cycleType:0 / ua:'pc' / ...
```

### 其它已提取的路径

| 路径 | 用途 |
| --- | --- |
| `data/apps/reserve/multiple/submit` | 提交预约（多人/表单） |
| `data/apps/reserve/del/form/aprv` | 删除表单审批 |
| `data/apps/reserve/latest/data` | 最近预约数据 |
| `data/apps/reservepc/web/file/upload` | 表单附件上传（multipart） |
| `data/apps/seat/add/location/log` | **位置上报**（座位预约疑似有位置校验） |
| `data/apps/seat/captcha/type` | **验证码类型**（预约流程可能触发验证码） |
| `data/apps/seat/risk/check/config` | **风控配置** |
| `data/apps/seatengine/borrow/book` | 借书 |
| `data/apps/seatengine/in/room` / `seat/in/room` / `reserve/bjsyhg/in/room` | 进房间（按 deptId 路由） |

### deptId → 接口路由（baseUtils.js）

```javascript
switch (deptId) {
  case 24676: url = 'data/apps/seat/in/room';        break
  case 40125: url = 'data/apps/reserve/bjsyhg/in/room'; break
  case 23242: default: url = 'data/apps/seatengine/in/room'; break
}
```

> 图书馆 `deptId=25285` 未列出 → 走 `default`（`seatengine/in/room`）。

---

## 五、页面路径地图（seatengine，供参考）

```javascript
toSeatListPage:      '/front/apps/seatengine/list?deptIdEnc=...&seatId=3597&wfwEngineEnc='
sceneChoseSeat:      '/front/apps/seatengine/live/select?deptIdEnc=...&seatId=3597&wfwEngineEnc='
toReserveListPage:   '/front/apps/seatengine/reserve/list?seatId=3597&wfwEngineEnc='
```

### Vue 实例方法清单（27 个，`document.querySelector('.seat_index').__vue__`）

`toSeatListPage` `sceneChoseSeat` `toReserveListPage` `reReserve` `signIn` `signBack` `leave`
`cancel` `askCancel` `askSignBack` `askLeave` `unlock` `goNotice` `toRulePage` `bindLinkSecurity`
`confirmLinkHint` `closeLinkHint` `goBindSno` `showRenewal` `getCountDown` ...

> 调试提示：页面遮罩（"您即将访问外部网站"）的正规关闭方式是 **`vm.closeLinkHint()`**，
> 不要硬删 DOM，否则后续逻辑可能异常。

---

## 六、待办（下一步需要的信息）

1. **写接口完整契约**：`reserve/multiple/submit` 的完整字段（含 `customFormConfig` 映射）
   —— 需要在 **08:00–21:30 时段内** 走一遍真实预约才能抓全（提交动作需用户授权）。
2. **座位预约是否真能纯 API 完成**：因二级页面走 App 桥接，需验证 `/data/apps/seatengine/**`
   是否可脱离页面直接调用（含 `seatIdEnc` 的生成规则）。
3. **风控/验证码/位置校验**的触发条件（`risk/check/config`、`captcha/type`、`add/location/log`）。
4. **凭证时效**：`enc` / `reserveIdEnc` / `seatIdEnc` / `code` 的有效期与刷新方式。
