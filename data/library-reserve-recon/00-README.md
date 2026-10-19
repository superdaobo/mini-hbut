# 湖北工业大学图书馆预约系统 · 网页端可达性勘察

> 勘察时间：**2026-10-15**
> 勘察方式：Playwright（有头 Chrome）全量流量捕获 + 静态 JS 提取
> 目标：为 Mini-HBUT 增加「图书馆预约」功能（座位 / 静音仓 / 研讨室）
> 勘察账号：学生账号（学号 `2510231106`，超星 uid `406591160`，图书馆 fid `25285`）

---

## ⛔ 首要声明：本次勘察全程只读

**唯一目的是「摸清可达路径与接口形态」。严禁任何会修改数据的调用。**

本次勘察：

- ✅ 只发 **GET** 请求与页面加载
- ✅ 只做**页面 HTML / 内联 JS 的静态提取**
- ❌ **没有提交任何预约**（未点「快速预约」「预约」「确认」等按钮）
- ❌ 没有调用任何 `save/add/submit/reserve/confirm/cancel` 类写接口

后续接入时的写接口契约**尚未勘察**，需要单独的、有明确授权的交互轮次。

---

## 🔍 实测 vs 静态提取的边界（2026-10-16 补充）

> **本节用于防止本文档（及 `01-api-contract.md`）的勘察期结论被当成「已实测事实」使用。**

- **2026-10-15 勘察期**：只做**只读可达性确认** + **页面 HTML / 内联 JS 静态提取**，
  绝大多数端点**未实际发起请求**去验证参数与响应。
- **2026-10-16 实测轮**：用**已登录超星的浏览器会话**对三个预约系统做了**全量实测**，
  发现多处与勘察期结论不符（含 2 个契约错误）。

| 类别 | 可信度 | 使用方式 |
| --- | --- | --- |
| ✅ 已实测（2026-10-16，附请求/响应证据） | 高 | 可作为实现依据 |
| ⚠️ 静态提取、待验证 | 低 | **不得**当作既定事实实现 |
| 🚫 实测证伪 | — | 原结论不可用，以更正为准 |

**完整实测证据（先读它）**：**[`02-live-verification-2026-10-16.md`](./02-live-verification-2026-10-16.md)**

`01-api-contract.md` 已在相关条目下就地插入「⚠️ 2026-10-16 实测更正」小节
（**保留原文 + 给出更正**，便于追溯勘察期的判断偏差）。

### 已确认需要更正的勘察期结论（摘要）

1. **入口链不含 `seatIdEnc` / `reserveIdEnc`**：整条 `redirectUrlMobile → OAuth → 真实系统` 的
   `redirect_uri` 只带 `enc / fidEnc / uid / mappIdEnc / formid / wfwEnc / mappId / appId / appKey / state`；
   两个 `*Enc` 由**落地页 HTML 服务端注入**（座位页 `seatIdEnc: 'b146028eafa4eea9'`；
   静音仓页 `reserveIdEnc: '838c48dae07db28c'`）。客户端必须**先抓落地页再抠值**。
2. **静音仓 / 研讨室落地路径是两跳**：`redirect_uri` 先给
   `/front/apps/reserve/item/index?reserveId=…&resvAppId=…`，服务端再跳 `/front/web/apps/reservepc/index`
   （**不是**直达 `reservepc`）。
3. **缺 `*Enc` ≠ 无权限**：超星返回
   `HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}`
   —— 这句文案的真实语义是「应用未找到（凭证缺失/失效）」，**极易被误读为「无权限」**。
4. **`reserve/latest/data` 不是「最近预约数据」**：实测需要 `itemId` 参数，缺则 **HTTP 400**；
   「我的预约」的正确端点是 `reservepc/user/histroy`。
5. **取消预约**：页面实际引用 `reserve/item/user/cancel`
   （勘察期静态提取的是 `reserve/del/form/aprv`）。

> ⚠️ **边界**：上表 1~5 是「已实测」；`01-api-contract.md` 中未标注 ✅ 的端点仍属
> 「静态提取、待验证」，**不要**直接实现。

---

## 🎯 核心结论

**三个预约系统都可以在电脑浏览器直接打开，完全不需要微信客户端。**

图书馆官网 `lib.hbut.edu.cn` / `opac.hbut.edu.cn` 当前返回 **403**（不可用），
但超星侧入口完全可用，且存在一条**绕开微信授权**的纯超星 OAuth 链路。

---

## 🔒 微信限制的真实机制（已定位到源码级）

在服务大厅点「座位预约」时，`openApp()` 拼的 URL 是：

```javascript
// v1.chaoxing.com/wechatSet/mobileIndex 页面内联 JS
function openApp(appId, fid, mAppId) {
  $.ajax({ url: '/wechatSet/getAppInfo',
           data: { id: appId, fid: fid, type: '1', mAppId: mAppId, uid: uid },
           success: function (data) {
             location.href = data.url + "&wxAppid=wx933b7bae40567783" + "&openid=" + "&enc=";
             //                                              ↑↑↑↑↑↑↑↑↑  openid 和 enc 是【空值】
           }});
}
```

`openid=` 为空 → 后端判定「未授权」→ 跳 `wx.chaoxing.com/weixin/user/jump`
→ 跳 `open.weixin.qq.com/connect/oauth2/authorize`。

而 `open.weixin.qq.com` 返回的是一个**纯前端 UA 检测页**：

```javascript
var ua = navigator.userAgent.toLowerCase();
var isWeixin = ua.indexOf('micromessenger') != -1;
if (!isWeixin) {
  document.head.innerHTML = '<title>抱歉，出错了</title>...';   // ← 就是那句"仅限微信打开"
  document.body.innerHTML = '<div class="weui_msg">...';
}
```

**结论：微信这一跳是「前端 UA 检测 + 空的 openid 参数」共同造成的，属于可以绕开的交互层限制，
而不是需要微信身份才能通过的服务端授权。**

---

## ✅ 可用的拼接规则（已验证）

### 规则 A：直达真实系统（推荐，本次已验证成功）

```
https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>
```

返回 `302`，自动经 `auth.chaoxing.com` **超星自家 OAuth**（非微信），
因浏览器已有超星登录态而**自动授权通过**，最终落地到真实系统。

完整链路示例（座位预约）：

```
1. GET https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=19248837
       ↓ 302
2. GET https://auth.chaoxing.com/connect/oauth2/authorize
         ?appid=0be8aa201f084dc2b6956535f906f0ce
         &redirect_uri=https://reserve.chaoxing.com/front/apps/seatengine/index
                        ?seatId=3597&enc=...&fidEnc=...&uid=...
       ↓ 授权通过（超星登录态）
3. GET https://reserve.chaoxing.com/front/apps/seatengine/index?...&code=...&state=25285
       → ✅ 座位预约页面
```

### APP_ID 对照表（图书馆 fid=25285）

| 应用 | mAppId | 真实系统 |
| --- | --- | --- |
| **座位预约** | `19248837` | `reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597` |
| **静音仓预约** | `19261750` | `reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24727` |
| **研讨室预约** | `19248835` | `reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24679` |

> ⚠️ **2026-10-16 实测更正**：静音仓 / 研讨室的 `redirect_uri` 实际先指向
> `/front/apps/reserve/item/index?reserveId=…&resvAppId=…`，再由**服务端 302** 跳到上表的
> `/front/web/apps/reservepc/index`。即**落地路径是两跳**，不是直达（见「实测 vs 静态提取的边界」）。

> 注：服务大厅 UI 上给的是**外层卡片 ID**，需要再解一层才到真实 appId：
> - 座位预约：卡片 `20796755` → 真实 `19248837`
> - 空间预约：卡片 `20832678` → 真实 `20905575` → 应用包 `appPackage?id=2399219`（内含静音仓 + 研讨室）

### 规则 B：服务大厅（移动端页面，可直接打开）

```
https://v1.chaoxing.com/wechatSet/mobileIndex
  ?logType=1&wxAppid=wx933b7bae40567783&type=1&pageId=6374
  &fidEnc=<fidEnc>&wxAppidDefault=<...>
  &_wxOpenid=<openid>&_wxEnc=<enc>&puidEnc=<...>&wxsn=<wxsn>
```

带 `_wxOpenid` / `_wxEnc` / `wxsn` 时返回 **200 + 正常「服务大厅」页面**（含全部 17 个应用入口）。
这也反证了：**超星侧在电脑浏览器是可用的，被卡的只是中间那步微信授权。**

---

## 📋 图书馆服务大厅应用清单（fid=25285，共 17 项）

`账号绑定` `智能客服` `书目检索` `新闻公告` `数字资源` `借阅信息` `新书通报` `资源荐购`
`检索证明` `阅读推广` `入馆指南` `馆藏分布` `30分钟打卡` `借阅排行榜` `入馆教育`
**`座位预约`** **`空间预约`**（→ 静音仓 / 研讨室）

---

## 🔌 已捕获的业务 API

统一前缀：`https://reserve.chaoxing.com/data/apps/`

### 座位预约（seatengine）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/seat/i18n` | 国际化文案（含全部业务提示语） |
| GET | `/reserve/link/domain/rules` | 域名/跳转规则（本次返回空数组） |
| GET | `/seat/entrance/config?appType=2&appId=3597` | 入口能力开关 |
| GET | `/seatengine/index?seatId=3597&seatIdEnc=<enc>` | **座位配置（核心）** |
| GET | `/seatengine/identity/verify?mappId=19248837&seatId=3597&seatIdEnc=<enc>` | 身份/管理权限 |

### 静音仓 / 研讨室（reservepc）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/reserve/link/domain/rules` | 同上 |
| POST | `/reserve/info` | 预约项详情 |
| POST | `/reservepc/user/view/flag` | 用户视图标记 |
| POST | `/reservepc/open/team` | 开放团队/权限 |
| POST | `/reserve/item/list/time` | **可预约时段列表** |
| POST | `/seat/person/role` | 人员角色 |

### 关键响应样本（只读）

`GET /seatengine/index?seatId=3597&seatIdEnc=b146028eafa4eea9`：

```json
{"data":{"seatConfig":{"id":3597,"deptId":25285,"name":"座位预约","appType":0,
  "commonTimeConfig":{"monStartTime":"08:00","monEndTime":"22:00", "...":"..."}},
  "curReserves":[], "nearReserves":[]},
 "success":true}
```

`GET /seat/entrance/config?appType=2&appId=3597`：

```json
{"data":{"onlySupportsApiSignIn":true,"defaultReserve":false,
  "liveReserve":true,"recentlyReserve":true,"againReserve":true},"success":true}
```

> ⚠️ `onlySupportsApiSignIn: true` —— **只支持 API 签到**，意味着签到没有网页按钮，
> 必须走接口。这对客户端实现是重要信息（也说明纯 API 接入是被官方允许的形态）。

### 资源清单（页面实测）

- **静音仓**：1–5 号，图书馆四楼，开放 08:00–21:30，容纳 2–6 人
  （官方提醒：要求 2–6 人使用，1 人使用需到图书馆 2 楼服务台咨询）
- **研讨室**：1–7 号，图书馆 4 楼 D 区，开放 08:00–21:00，容纳 2–8 人（7 号为 6–30 人）

---

## 🧩 对 Mini-HBUT 的接入路径

```
① 复用现有学校 CAS 登录能力
     ↓
② 换超星登录态（fysso.chaoxing.com/cassso/hbutsie，已有 CAS 通道）
     ↓
③ GET v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>
     → 拿到带 enc/uid/mappIdEnc 的真实系统 URL（关键凭证）
     ↓
④ 直接调用 reserve.chaoxing.com/data/apps/** 接口
```

**优势**：整条链路与微信无关，且超星 OAuth 可由超星登录态自动通过 ——
不需要用户扫码、不需要微信客户端。

**待确认**：`enc` / `mappIdEnc` / `wxsn` 的生成规则与时效性，
以及写接口（提交预约 / 取消 / 签到）的完整契约。

---

## ⚠️ 风险与注意事项

1. **写接口尚未勘察**：提交预约、取消、签到等接口必须单独授权后勘察，
   绝不在无授权情况下试调。
2. **凭证时效**：`enc` / `code` / `wxsn` 疑似短时效，客户端需要每次重新走 ③ 拿新凭证。
3. **`onlySupportsApiSignIn`**：签到只能走接口，客户端必须实现。
4. **违约惩罚**（来自 i18n 文案）：未按时签到记违约；每 N 天违约达 M 次将暂停预约功能若干天
   —— 客户端应做好提醒与二次确认，避免用户误操作。
5. **图书馆官网 403**：`lib.hbut.edu.cn` / `opac.hbut.edu.cn` 当前不可用，超星侧为唯一可用通道。
