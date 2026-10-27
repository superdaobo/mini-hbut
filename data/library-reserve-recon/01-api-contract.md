# 图书馆预约系统 · 接口契约（勘察期抓取 · 含 2026-10-16 实测更正）

> 抓取时间：**2026-10-15 23:2x–23:4x**
> 抓取方式：Playwright 有头浏览器全量流量捕获（request headers / postData / response body）
> 系统：`reserve.chaoxing.com`（超星预约引擎）
> 声明：**本次仅走通到「进入预约入口」这一步，未提交任何预约**。
> 提交类接口（`reserve/multiple/submit` 等）仅从 JS 静态提取到调用形态，**未实际调用**。

---

## 〇、⚠️ 验证状态图例（2026-10-16 追加，阅读前提）

> **本文档 2026-10-15 成稿时，绝大多数端点只做了「静态 JS 提取 / 只读可达性确认」，
> 并未实际发起请求去验证参数与响应结构。** 2026-10-16 用**已登录超星的浏览器会话**
> 做了全量实测，发现多处与本文档原文不符。
>
> 完整实测证据（先读它）：**[`02-live-verification-2026-10-16.md`](./02-live-verification-2026-10-16.md)**

| 标记 | 含义 | 可信度 |
| --- | --- | --- |
| ✅ **已实测（2026-10-16）** | 用真实登录态实际请求过，附请求参数 + 响应样本 | 高，可作为实现依据 |
| ⚠️ **静态提取、待验证** | 仅从页面内联 JS / `reserveUtils.js` 等静态提取到调用形态，**未实际调用** | 低，参数与响应均可能不符 |
| 🚫 **实测证伪** | 2026-10-16 实测确认与本文档原描述不符 | 原描述**不可用**，以更正为准 |

> ⛔ **不要把「⚠️ 静态提取、待验证」的内容当成既有事实直接实现。**
> 本轮已在相关条目下就地插入「⚠️ 2026-10-16 实测更正」小节：**保留原文 + 给出更正**，
> 而不是覆盖删除，以便追溯勘察期的判断偏差。

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

### ⚠️ 2026-10-16 实测更正：「未查询到您所访问的应用」不等于无权限

原文把 `未查询到您所访问的应用，请咨询管理员配置是否正确` 记为「页面 500 / 应用不可用」。
实测表明**这句话的触发条件远更宽**，且极易被误读：

| 请求 | 实测响应 |
| --- | --- |
| `GET /data/apps/seatengine/index?seatId=3597`（**无** `seatIdEnc`） | `HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}` |
| `GET /data/apps/seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9` | `HTTP 200 {"data":{"seatConfig":{…107字段…},"curReserves":[],"nearReserves":[]},"success":true}` |
| `POST /data/apps/reserve/info`（**无** `reserveIdEnc`） | `HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}` |
| `POST /data/apps/reserve/info`（**有** `reserveIdEnc`） | `HTTP 200 {"data":{"reserveData":{…}},"success":true}` |

**关键事实（易误读，务必记住）**：

1. 缺 `*Enc` 时超星返回的是 **`HTTP 200` + JSON**，**不是 403、不是 500、不是无权限**。
2. 该文案的真实语义是 **「应用未找到（凭证缺失/失效）」**，而不是「当前账号没有权限」。
3. 客户端实现**绝不能**把这句话判定为 `no_permission`（否则会把「凭证没抓到」误报成「无权限」，
   且通常会附带「重新登录也没用」的错误引导）。应单独归类为 `credential_missing` / `credential_invalid`。
4. 2026-10-15 原文记录的「直接访问二级页 → 500」与实测的「200 JSON」不一致，
   推测是「页面路由 500」与「数据接口 200 JSON」两条不同路径的差异，**待复测确认**；
   无论哪种，**都不能据此判断账号无权限**。

### ⚠️ 2026-10-16 实测更正：入口链 `redirect_uri` 不含 `seatIdEnc` / `reserveIdEnc`

原文示例里写了 `redirect_uri=.../seatengine/index?seatId=3597&enc=...&fidEnc=...&uid=...`，
但**没有说明这两个 `*Enc` 从哪来**。实测澄清：

- `redirectUrlMobile` → `auth.chaoxing.com` → 真实系统的整条跳转链，携带的凭证只有：

  ```
  enc / fidEnc / uid / mappIdEnc / formid / wfwEnc / mappId / appId / appKey / state
  （座位链额外带 seatId=3597；静音仓/研讨室链额外带 reserveId / resvAppId）
  ```

- **`seatIdEnc` / `reserveIdEnc` 不在跳转链上**，而是由**落地页 HTML 由服务端注入**：

  | 页面 | 内联 JS 注入值（实测原值） |
  | --- | --- |
  | 座位页 `/front/apps/seatengine/index` | `seatIdEnc: 'b146028eafa4eea9'` |
  | 静音仓页（reservepc 落地页） | `reserveIdEnc: '838c48dae07db28c'` |

- 因此客户端必须**先 GET 落地页 HTML，再从内联 JS 里抠出 `*Enc`**，才能调用 `/data/apps/**`。
  实测该值跨天同值（倾向**稳定值**而非短时效），但仍建议每次实时抓取。

### ⚠️ 2026-10-16 实测更正：静音仓 / 研讨室的落地路径是两跳

原文 §一 表格（及 `00-README.md`）把静音仓/研讨室的「真实系统」直接写成
`/front/web/apps/reservepc/index`。实测 `redirect_uri` 指向的是 **`reserve/item/index`**，
再由**服务端 302 跳到 `reservepc/index`**：

| 应用 | mAppId | `redirect_uri` 指向 | 实测最终落地路径 |
| --- | --- | --- | --- |
| 座位预约 | `19248837` | `/front/apps/seatengine/index?seatId=3597` | `/front/apps/seatengine/index`（一跳到位） |
| 静音仓 | `19261750` | `/front/apps/reserve/item/index?reserveId=24727&resvAppId=24727` | 服务端再跳 `/front/web/apps/reservepc/index` |
| 研讨室 | `19248835` | `/front/apps/reserve/item/index?reserveId=24679&resvAppId=24679` | 同上 |

> 客户端若按「直接拼 reservepc/index」实现，会漏掉 `reserve/item/index` 这一跳可能携带的上下文；
> 建议**跟随 302**（或先请求 `reserve/item/index` 再跳），不要硬编码终点。

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

> ✅ **验证状态（2026-10-16 复测）**：本节 1)~4) 的端点、参数与响应结构已用登录态**实测复现**，
> 可视为 ✅ 已实测。**但注意**：所有请求都必须带正确的 `reserveIdEnc`（实测值 `838c48dae07db28c`），
> 缺失时返回的是 `HTTP 200 {"msg":"未查询到您所访问的应用…","success":false}`（见 §一 更正），
> **不是** 400/403。其余实测新增端点见 §七。

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
GET  /data/apps/seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9    ← 核心配置  ✅ 已实测
GET  /data/apps/seatengine/identity/verify?mappId=19248837&seatId=3597&seatIdEnc=...
```

### ⚠️ 2026-10-16 实测更正 / 补充：页面真实引用的 seatengine 端点更全

原文只列了 5 个端点。实测落地页内联 JS 还引用了以下端点
（**存在性已确认，参数与响应 ⚠️ 待逐个实测**）：

```
GET/POST /data/apps/seatengine/room/info        ← 房间/座位详情
GET/POST /data/apps/seatengine/check/exist      ← 存在性/占用校验
GET/POST /data/apps/seatengine/dialog           ← 弹窗配置
GET/POST /data/apps/seatengine/unlock/qrcode    ← 解锁二维码
```

> 其中 `seatengine/index` 已 ✅ 实测：**必须带 `seatIdEnc`**，否则返回
> `200 {"msg":"未查询到您所访问的应用…","success":false}`（见 §一 更正）。

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

> ⚠️ **整表均为「静态提取、待验证」**（仅从 JS 里读到调用形态，未实际调用）。
> 其中两行已被 2026-10-16 实测**证伪**，见下方更正小节。

| 路径 | 用途 | 验证状态 |
| --- | --- | --- |
| `data/apps/reserve/multiple/submit` | 提交预约（多人/表单） | ⚠️ 静态提取、待验证 |
| `data/apps/reserve/del/form/aprv` | 删除表单审批 | 🚫 实测证伪（见下） |
| `data/apps/reserve/latest/data` | 最近预约数据 | 🚫 实测证伪（见下） |
| `data/apps/reservepc/web/file/upload` | 表单附件上传（multipart） | ⚠️ 静态提取、待验证 |
| `data/apps/seat/add/location/log` | **位置上报**（座位预约疑似有位置校验） | ⚠️ 静态提取、待验证 |
| `data/apps/seat/captcha/type` | **验证码类型**（预约流程可能触发验证码） | ⚠️ 静态提取、待验证 |
| `data/apps/seat/risk/check/config` | **风控配置** | ⚠️ 静态提取、待验证 |
| `data/apps/seatengine/borrow/book` | 借书 | ⚠️ 静态提取、待验证 |
| `data/apps/seatengine/in/room` / `seat/in/room` / `reserve/bjsyhg/in/room` | 进房间（按 deptId 路由） | ⚠️ 静态提取、待验证 |

### ⚠️ 2026-10-16 实测更正：`reserve/latest/data` 不是「最近预约数据」

原文把它记为「最近预约数据」（暗示是列表接口）。**实测证伪**：

```
POST /data/apps/reserve/latest/data  {reserveId, reserveIdEnc, fidEnc}
→ HTTP 400  HTML 错误页：
  errorMsg: Required request parameter 'itemId' for method parameter type Integer is not present
```

即该端点**需要 `itemId`（Integer）参数**，缺则 **HTTP 400**（返回的是 HTML 错误页，不是 JSON），
**根本不是「我的预约列表」接口**。勘察期只是从 JS 静态提取，从未实测。

**「我的预约」的正确端点是** ✅ 已实测：

```
POST /data/apps/reservepc/user/histroy
Body: reserveId=24727&resvAppId=24727&reserveIdEnc=838c48dae07db28c&fidEnc=c7450f13f8a0e9ab
→ 200 {"data":{"totalRow":1,"totalPage":1,"rows":[ … ]}}
```

单条 `rows` 实测样本（字段名与原文预期的完全不同）：

```json
{"id":29589158,"itemId":49136,"name":"4号静音仓","today":"2026-07-11",
 "starttime":1783760400000,"endtime":1783767600000,"status":2,"isCancel":0,
 "reserveDuration":206000,"remark":"讨论问题","aprvId":0,"reserveId":24727}
```

> ⚠️ 实现注意：真实字段是 `name / today / starttime(ms) / endtime(ms) / status(数字) / isCancel / id / itemId`，
> 与客户端 `ReserveMinePanel.vue` 期待的 `itemName / date / startTime / endTime / statusName / aprvId` **不一致**，
> 且 `aprvId` 恒为 0。即使换成正确端点，也必须同时改字段映射。

### ⚠️ 2026-10-16 实测更正：取消预约端点

原文（静态提取）写的是 `data/apps/reserve/del/form/aprv`。**页面实际引用的是**：

```
data/apps/reserve/item/user/cancel
```

> ⚠️ 该端点仅**页面引用已确认**；因属**写操作**，本轮只读验证**未调用**，
> 其**参数与响应契约仍待授权后单独实测**。`reserve/del/form/aprv` 是否仍存在亦未验证。

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

### ⚠️ 2026-10-16 更新：上述待办的状态

| 原待办 | 2026-10-16 实测后的状态 |
| --- | --- |
| 1. 写接口完整契约 | ❌ **仍待验证**（本轮只读，未提交/取消任何预约） |
| 2. 座位能否纯 API 完成 | 🟡 **部分结论**：`seatengine/index` 等**读接口可脱离页面直接调用**，但**必须带落地页注入的 `seatIdEnc`**；选座/提交等**写接口仍待验证** |
| 3. 风控/验证码/位置校验 | ❌ **仍待验证** |
| 4. 凭证时效 | 🟡 **部分结论**：`seatIdEnc` / `reserveIdEnc` 实测跨天同值，倾向**稳定值**；`enc` / `code` 时效仍未知 |

---

## 七、2026-10-16 实测补充端点清单（✅ 已实测）

> 本节汇总**实测已确认**的端点。完整请求/响应证据见
> [`02-live-verification-2026-10-16.md`](./02-live-verification-2026-10-16.md)。

### 7.1 页面真实引用的端点集（比 App 现用契约更全）

| 端点 | 用途 | 状态 |
| --- | --- | --- |
| `reservepc/user/histroy` | **我的预约列表**（正确端点） | ✅ 已实测（`data.totalRow` / `data.rows`） |
| `reserve/item/user/cancel` | 取消预约 | 🟡 页面引用已确认；**写操作待授权实测** |
| `reserve/verify/reserveuser/status` | 预约用户状态校验 | ✅ 已实测（当前无进行中预约 → `{"msg":"预约记录不存在","success":false}`） |
| `reserve/special/rule` | 规则 + **服务端时间** | ✅ 已实测（`data.serverNow`，Unix 毫秒） |
| `reserve/form/getuserinfo` | 表单用户信息 | ⚠️ 页面引用，待实测 |
| `reservepc/team/verify` | 团队校验 | ⚠️ 页面引用，待实测 |
| `reserve/team/out` | 退出团队 | ⚠️ 页面引用，待实测 |
| `seatengine/index` | 座位核心配置 | ✅ 已实测（**必须带 `seatIdEnc`**） |
| `seatengine/identity/verify` | 身份校验 | ⚠️ 页面引用，待实测 |
| `seatengine/room/info` | 房间信息 | ⚠️ 页面引用，待实测 |
| `seatengine/check/exist` | 存在性/占用校验 | ⚠️ 页面引用，待实测 |
| `seatengine/dialog` | 弹窗配置 | ⚠️ 页面引用，待实测 |
| `seatengine/unlock/qrcode` | 解锁二维码 | ⚠️ 页面引用，待实测 |

### 7.2 服务端时间（✅ 已实测，重要）

- `POST /data/apps/reserve/special/rule` → `{"data":{"serverNow":1792149829247}}`（**Unix 毫秒**）。
- 座位页则以内联 JS 注入 `serverNow = new Date('2026-10-16T19:08:05.992+08:00')`。
- 两者都以服务端时间为准（呼应 §一「页面用的是服务端注入时间」）。

### 7.3 实测补充事实

- 入口链携带的凭证集合（无 `*Enc`）：`enc / fidEnc / uid / mappIdEnc / formid / wfwEnc / mappId / appId / appKey / state`。
- 缺 `*Enc` 的统一表现：`HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}`。
- `reserve/item/list/time` 在静音仓页内联 JS 中的调用形态已实测确认（`doRequest('data/apps/reserve/item/list/time'…)`）。

---

## 八、仍需实测才能定论的条目（清单）

> 以下条目**本轮未验证或仅页面引用**，**不得**当作既定契约使用。

**写路径（全部未验证，最高优先级）**

1. `reserve/multiple/submit` 完整字段契约（含 `customFormConfig` 映射）。
2. `reserve/item/user/cancel` 的**实际参数与响应**（写操作，需授权后单独验证）。
3. 座位侧选座 / 提交 / 签到 / 暂离 / 签退 / 解锁（`unlock/qrcode`）的写接口契约。
4. `seatengine/in/room` / `seat/in/room` / `reserve/bjsyhg/in/room` 的调用形态与参数。

**读路径（仅页面引用，参数/响应未知）**

5. `reserve/form/getuserinfo`、`reservepc/team/verify`、`reserve/team/out`。
6. `seatengine/room/info`、`seatengine/check/exist`、`seatengine/dialog`、`seatengine/unlock/qrcode`。
7. `seatengine/identity/verify` 的实际返回结构。

**语义 / 时效 / 风控**

8. `reserve/latest/data` 的 `itemId` 语义（不确定它是否真与「我的预约」无关）。
9. `reservepc/user/histroy` 的**分页参数**（`totalPage` 存在但请求参数未追），
   以及 `curReserves`/`nearReserves` **非空**时的字段解析（当前账号只有 1 条历史记录，无法验证）。
10. `enc` / `code` 的有效期与刷新方式（`seatIdEnc` / `reserveIdEnc` 倾向稳定，但仍建议实时抓取）。
11. 风控 / 验证码 / 位置校验的触发条件（`risk/check/config`、`captcha/type`、`add/location/log`）。
12. `reserve/del/form/aprv`、`reservepc/web/file/upload` 等静态提取端点**是否仍存在**。
