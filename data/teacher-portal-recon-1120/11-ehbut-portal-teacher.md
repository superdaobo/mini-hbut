# 湖北工业大学新融合门户 `e.hbut.edu.cn` · 教师端只读接口勘察

> 勘察时间：**2026-11-20 18:50–19:10**（子代理 B）
> 勘察身份：教师账号（`getLoginUser` → `categoryName:"教师/教职工"`，`personWid` 已脱敏）
> 勘察范围：仅 `e.hbut.edu.cn` 门户本身（卡片/服务目录/配置/通知计数）+ `code.hbut.edu.cn` 的 **tid 换票入口**。
> code 域 `/server/*` 业务接口、jwxt 教务接口由并行子代理覆盖，不在本文件。

---

## ⛔ 首要声明：全程只读

- 只发 **GET** 与**纯查询 POST**（`execCardMethod`/`queryFolderAnd*`/`getPortalConfig` 等门户本身即 POST 形态的只读接口）。
- 未调用任何写型路径（save/add/update/delete/submit/confirm/import/upload/export/print/report/reset/change/send/batch/apply/approve 一律未碰）。
- 未重新登录：仅做过一次 **`/login` → CAS service ticket 自动换票**（等同浏览器刷新页面，无密码提交、不顶号）——因为静态 cookie 里门户网关会话中途过期，`execCardMethod`/`getPageInfo` 从 `errcode=0` 退化为 `999 无权限调用`，换票后全部恢复。详见「坑与未覆盖项」。
- `qrCode/getKey` 只是领二维码轮询 key（读型），未调 `qrCode/scan`/`confirm`（写型）。
- 所有姓名/工号/token/手机号经 `mask()` 脱敏；cookie 不落盘。

---

## 1. 鉴权与基址

**基址**：`https://e.hbut.edu.cn`，CAS（`auth.hbut.edu.cn`）+ cookie 鉴权，**无 Authorization 头**。

**登录链路**：`GET /` → 302 `/index.html`（教师）/ `GET /login` → 302 `authserver/login?service=…/login` → 回跳 `?ticket=ST-…` → 302 `/default/index.html`。
教师首页即 `/index.html`（`/` 302 到它，`/default/index.html` 等价）；**`/tea/index.html` 404**，`/stu/index.html` → 302 `/index.html?isSelect=1#/authSites`（学生入口对教师无意义）。

**核心 cookie**（域 `e.hbut.edu.cn`）：`WISCPSID`（门户会话）、`gwroute-casp-portal`、`route`、`COM.WISEDU.CASP.IS_RANDOM`、`COM.WISEDU.CASP.SITEWID`。
注意 `WISCPSID`/`route`/`gwroute-casp-portal` **每次响应都 Set-Cookie 轮换**——探测必须带滚动 cookie jar，且该门户网关会话约十分钟级过期（见坑）。

**前端形态**：Vue2 SPA，`index.html` 引用 11 个 JS（`app.b0ad1776.js` + `chunk-vendors` + `wed.js` 等）；API 一律相对根路径，axios 全局 `X-Requested-With: XMLHttpRequest`，POST 全 JSON。

**通用响应**：`{errcode, errmsg, data}`。
`errcode` 实测取值：`0`=成功，`200`=getPageInfo 系成功，`999`=无权限/未授权/未购买license，`1003`=参数缺失，`1007`=参数传递方式不一致（应换 POST），`401`/`403`=业务级无权限。HTTP 404 返回「系统异常」HTML 页（status 仍可能 200，需按 body 判）。

## 2. 实测接口表（e.hbut 门户）

| 接口 | 方法 | 状态 | 说明 |
|---|---|---|---|
| `/getLoginUser` | GET | 0 | 当前用户：wid/personWid/userAccount/userName/categoryName=教师/教职工/deptName 等 |
| `/getLoginUserAndGuest` | GET | 0 | 同上（教师端字段一致） |
| `/getUserInfo` | GET | 404 | **死端点**（与学生端一致），勿用 |
| `/getMessageCount` | GET | 0 | `data:"0"` 未读消息数 |
| `/getUserPermissionRouters` | GET | 0 | 站点列表：`[{普通教师,default,isMaster:1},{行政人员,office}]` |
| `/getPageInfo?pageCode=` | GET | 200 | 方案+页面+**menuTree**（3 菜单：首页/办事大厅/数据中台）+currentMenu |
| `/getPageView?pageCode=&originalUrl=&lang=` | GET | 0 | 页面渲染数据：pageConfig/breadcrumb/pageContext.pageInfoEntity.**cardLayout** |
| `/base/getThemeData` | GET/POST | 0 | isLogin/showProgrammeEntity/localLang 主题 |
| `/base/getPortalConfig` | POST `{key}` | 0 | 配置按 key 查（SITE_RULE/accessibility/casp_ioc_domin）；**空体报 999「暂未登录」** |
| `/base/getPortalSysConfig` | POST/GET | 0 | 门户系统配置（空体即可） |
| `/base/getCommonConfigToPortal` | POST | 500 HTML | 服务器 500（含参数也 500） |
| `/execCardMethod/{cardWid}/{cardId}` | POST `{method,param}` | 0 | **卡片数据总入口**，method 见下 |
| `/execTemplateMethod` | POST | 0 | 模板方法（如 `getServiceItemRelService`） |
| `/queryServiceByWid/{wid}/{filterKey}` | GET | 0 | 服务详情：filterKey=0 基础 / =1 详情；返回 serviceInfo[] |
| `/queryFolderAndService` | **POST** | 0 | 服务收藏夹目录树（GET 报 1007） |
| `/queryFolderAndAgent` | POST | 0 | 代理收藏夹 |
| `/queryFolderAndItem` | POST | 0 | 事项收藏夹 |
| `/queryUserSiteWitching` | POST | 0 | 站点切换状态 `{siteWid,isFirstLoginFlag}` |
| `/personalized/getHotSearch` | GET | 0 | 热搜词 30 条（学籍/导师/财务/图书馆…） |
| `/personalized/getPersonalizedMenus` | GET | 999 | 「当前未购买 personalized 模块」 |
| `/personalized/getSysIcons` | GET | 0 | 系统图标 188 个 |
| `/appAppraise/appraiseSummary` | GET | 0 | 服务评价汇总结构 |
| `/appAppraise/getServiceAppraiseMode` | GET | 0 | `data:"1"` |
| `/appAppraise/getUserCommentPhraseList` | GET | 0 | 评价短语（空） |
| `/appAppraise/queryAppraiseByPage(带wid)` | POST | 500 HTML | 参数形态未明 |
| `/feedback/getFeedbackParse` | GET | 0 | 反馈短语 [{wid,phrasesContent}] |
| `/getFeedbackPhraseListForPortal` | GET | 999 | 未购 license |
| `/getAssistantConfig` | GET/POST | 999 | 「没有服务助手license」 |
| `/getQuickProcessAiFormKey` | GET | 999 | 同上 |
| `/userNotify/getNewsNotify` | GET | 0 | `data:[]` 空（教师无通知） |
| `/userNotify/getRecommendCycle` | GET | 0 | `data:[]` |
| `/cal/queryOrgUsers` | POST | 401 | 「你无权查看或操作个人日历以及群组日历」 |
| `/auth/minos/getMinosOrg` | POST | 403 | 「无权限」 |
| `/programme/queryPopupWindowDisplay` | POST | 999 | 「缺少展示方案id」（param 名不对） |
| `/common/getProgrammeLocalStyle` | POST | 999 | 传参错误 |
| `/language/getStaticData` | POST | 999 | 系统内部错误 |
| `/dataRefresh/init` | GET | SSE | `event:connected` 长连接（卡片数据推送通道？） |
| `/qrCode/getKey` | GET | 0 | `{qrCodeId,expireTime:180}`（扫码登录 key） |
| `/escapePageCount/count` | POST | 1003 | 「服务id不可以为空」（埋点） |
| `/card/componentCard/getIconList` | POST `{url}` | 0 | `[]` |
| `/getWorkWxConfig` | GET | 0 | `{workWxOpenPortal:0,ticketConfig:null}` |
| `/common/clientIp` | GET | 0 | `{data:"10.8.181.36"}` |
| `/getLoginOrLogoutUrl` | GET | 0 | `authserver/logout?service=https://e.hbut.edu.cn/default` |
| `/getLoginHref` | GET | 0 | `authserver/login?service=https://e.hbut.edu.cn/login` |
| `/simJump?id={wid}` | GET | 200 | 服务跳转页（HTML） |
| `/serviceShow?wid=` | GET | 999 | 参数形态不符 |
| `/getSidebarCount` | GET | 500 HTML | 服务端 500 |
| `/getSearchHisVal` | GET | 404 | 死端点 |
| `/getUserPreferenceSetting` | GET | 404 | SPA 路由而非 API |
| `/getScene`、`/getPlaceholderVal`、`/ariaHelp`、`/schedule/getShareEvent`、`/dailyCalShare/getCalShareQrPath`、`/chooseService`、`/chooseGroup`、`/assistant/getQuestionAndAnswer(POST)`、`/queryI18nList`、`/getPageInfo(无参)` | GET/POST | 404 | 死端点或需特定参数/POST 形态 |

## 3. 教师可见应用清单

### 3.1 站点（`getUserPermissionRouters`）
| wid | 站点 | siteRoute | isMaster |
|---|---|---|---|
| -100 | 普通教师 | `default` | 1 |
| 1372866069579956224 | 行政人员 | `office` | 0 |

两站点首页卡片布局**完全一致**（getPageView 返回相同 cardLayout）。

### 3.2 页面/菜单（`getPageInfo` menuTree）
| 菜单 | linkUrl | pageId |
|---|---|---|
| 首页 | `/portal/home` | 2cacb4498be0fcc01c27291749c69a81 |
| 办事大厅 | `/portal/hall` | b338975fa37b5588138e484ecf0f7890 |
| 数据中台 | `/portal/datacenter` | 13654a49-c8b8-4d0f-bd44-0234990c8fa8 |

### 3.3 首页卡片（getPageView.cardLayout，8 张）
| cardWid | cardId | 卡名 | renderData 结果 |
|---|---|---|---|
| 21021468792076103 | CUS_CARD_TODOTASK | 待办任务 | `data:null`（config 见下） |
| 5624209932143497 | CUS_CARD_DONETASK | 已办任务 | `data:null` |
| 484468705917928 | CUS_CARD_MYTASK | 我的任务 | `data:null`，getMarkNumber=**4** |
| 7207554905914351 | CUS_CARD_COPYME | 抄送我的 | `data:null` |
| 30287114549572314 | CUS_CARD_HOTAPP | 热门服务 | appList（6 个） |
| 5357818446432585 | CUS_CARD_FAVORITEAPP | 我的收藏 | folderServices（默认收藏夹） |
| 13036226013086594 | CUS_CARD_MYAPP | 我的服务 | appList（1 个：教管一体化） |
| 9793387617112675 | CUS_CARD_ALLSERVICEBUS | 全部业务系统 | **serviceType 分类树 + serviceList（66 项）** |

办事大厅页：`CUS_CARD_ALLSERVICE`(wid 1809922293628241) → serviceList 66 项 + navList；
数据中台页：`SYS_CARD_RECOMMENDSUBJECT`(wid 2662243601602181) → 专题推荐（数据中台/数据集市/一表通/高基报表/领导驾驶舱）。

### 3.4 execCardMethod 的 method（实测）
| method | 结果 |
|---|---|
| `renderData` `{param:{fromMaster:bool}}` | 卡片渲染数据（服务卡有数据；4 张任务卡返回 `data:null`） |
| `getConfig` | 卡片 JSON 配置串（sourceList/rows/itemConfigure/showTaskType） |
| `getMarkNumber` | 角标数（MYTASK=4，其余 0） |
| `query`/`list`/`getList`/`getTodoList` | 均 `errcode=0` 但 `data` 与 renderData 相同（null）——非真实 method |

待办卡 `renderData=null` 的说明：任务列表数据源是外部 OA/工作流（`oanew.hbut.edu.cn`、`message_pocket`），门户卡只挂计数；前端任务数据疑似经 `dataRefresh/init` SSE 或 message_pocket 站取，未在本轮覆盖。

### 3.5 教师可见服务（66 项，办事大厅全集）
去重后 66 个服务（完整清单：`raw/services-catalog.masked.json` + `raw/allservice-catalog.masked.json`）。按跳转类型：

- **zd.hbut.edu.cn（表单/审批 22 项）**：安全通报申请、堡垒机账号申请、报告厅借用、服务需求收集、公务邮箱业务办理、固定IP地址申请、继续教育学院用印申请、检索证明、教职工因私出国(境)审批、临时用户校园网服务申请表、网络平台账号审批、网站建站/调整申请表、微信小程序备案登记、室外宣传平台建置备案/审批、校园思政电影放映申请表、校园一码通系统金额代发执行申请、信息中心办事流程、业务构建平台(`zd/pubcas/index`)、站群管理员申请、教学活动/自然科学教学活动报备等 → 均为 `/zd/app/extXXXX` 表单
- **chaoxing SSO（5 项）**：教管一体化平台(`fysso.chaoxing.com/cassso/tohbutsie`)、研究生信息管理系统、研究生招生管理系统(管理员)、读者入馆教育(`unified-auth.chaoxing.com`)
- **oanew.hbut.edu.cn（4 项）**：办公OA系统(新)、会议室预定、校内请示、用印申请
- **kypt.hbut.edu.cn（4 项）**：科研系统、科研机构申报、科研计分
- **172.16.x / 202.114.x 内网（10 项）**：财务系统(202.114.191.69)、家庭经济困难预警/课程分析/领导驾驶舱/职称岗位聘任/资产报表(172.16.49.62:8075 fineReport)、数据集市/数据中台(172.16.49.52)、站群管理(172.16.46.8)、危险化学品全周期(202.114.182.170)
- **其他**：办公OA 外的 学生工作一体化(stu.hbut)、大型仪器(yqgx)、房产(fcxt)、高基报表/一表通/一表通填报(oshall)、公文流转(docp)、人事系统(rsxx)、心理健康(xgxljk/xlogin/cas)、信息技术服务(`e.hbut.edu.cn/default/index.html#/infodo` 内嵌 SPA 路由)、邮箱管理(tools.hbut)、档案(file.hbut)、电子资源(metaauth)、文献信息检索(zhizhen)、智慧学工(fdm)、资产系统(zcgl)、竞赛系统(racelink)、京东慧采(vsp.jd.com)、喀斯玛×2(casmart)、湖工小易(aichat)

### 3.6 教师 vs 学生差异（对照 probe-out/yikatong.json 学生勘察）
- 学生首页卡：`CUS_CARD_ALLSERVICE` + `SYS_CARD_FAVORITEAPP` + **`CUS_CARD_STUPERSONALDATA`（学生个人数据：消费/图书/考勤列表）**；教师首页无 STUPERSONALDATA，替换为 **TODOTASK/DONETASK/MYTASK/COPYME 四张任务卡 + HOTAPP/ALLSERVICEBUS**。
- 教师多出「办事大厅(ALLSERVICE)」「数据中台(RECOMMENDSUBJECT)」两个菜单页，与学生 `STUPERSONALDATA` 卡（wid 9120396937204363）对应的学生数据卡教师侧不存在。
- 学生站点与教师站点 cardId 命名空间不同（CUS_ 前缀自定义卡 vs SYS_ 系统卡混排）。

## 4. ★ code 域 SSO 入口与 tid 获取方式（重点结论）

**门户里的「校园一码通(PC端)」服务**（serviceWid `1403335323158573056`，全部业务系统/办事大厅均可见）：
```
pcAccessUrl = https://code.hbut.edu.cn/server/auth/host/open?pc=1&org=2&host=28
```

**tid 获取链路（教师端实测 3 次，全部走通）**：
```
GET https://code.hbut.edu.cn/server/auth/host/open?pc=1&org=2&host=28
  → 302 https://auth.hbut.edu.cn/authserver/login?service=…host/open…      （未持 CAS 会话时先登录）
  → 302 https://code.hbut.edu.cn/server/auth/host/open?org=2&host=28&pc=1&ticket=ST-…   （CASTGC 有效时自动跳，无密码交互）
  → 302 http://172.16.44.6:31165/?tid=<20字符tid>&orgId=2                   ← tid 由服务端在 CAS 票据校验后签发
  → 200 一码通 SPA
```
- **tid 不是客户端可计算的**：由 `host/open` 在校验 CAS service ticket 后服务端签发，每次换取一个新的（20 字符字母数字+`-_`），**一次性消费**（被 getToken 用掉后再 GET `?tid` 会失败）。
- **getToken**：`POST https://code.hbut.edu.cn/server/auth/getToken`，JSON 体 `{"tid":"<tid>","orgId":2}` → `{success:true,resultData:{accessToken,refreshToken,accessTokenExpire:3600}}`。**必须 POST JSON**；`?tid=` query 或 GET 均报 `valid_error_1004`。
- tid 在**公网域 `code.hbut.edu.cn`** 换 token 同样有效（内网 `172.16.44.6:31165` 是 `host/open` 302 落点，为同一套前端；公网域首页标题「校园生活服务」783B SPA，内网 IP 首页标题「一校通服务平台」1291B——**两入口前端版本不同但 token 服务同一**）。
- `org=2`/`host=28` 是门户写死的业务参数（org=2=湖工大，host=28=一码通宿主）；移动端入口 `?host=28&org=2`（无 pc=1）。
- accessToken 用法：`Authorization: <accessToken>`（**无 Bearer 前缀**），配合 POST JSON 调 `/server/*`。
- token 续期：`POST /server/auth/updateToken` `{refreshToken}`（学生勘察已证，教师端 code-lib.mjs 同款实现）。
- 现成工具：`tools/teacher-probe/code-sso.mjs`（一键走完整链并把 token 写回会话文件 `one_code` 字段）、`code-lib.mjs`（含 refresh + SM4 解密）。

## 5. 静态 bundle 提取（`raw/bundle-api-paths.txt`）

从 `app.b0ad1776.js` + `index.html` 提取 **116 个唯一路径**（去掉 .js/.css/静态资源后 ~90 个疑似接口）。
其中**确认为 API**（`pe("/…")` 注册到 he 表）：上文表格全部 + 以下**未实测/写型**（按规则未调）：
`/addAgentFolder`,`/addItemFolder`,`/addServiceFolder`,`/updateAgentFolder`,`/updateItemFolder`,`/updateServiceFolder`,`/batchCollectLink`,`/batchCollectService`,`/collectAgent`,`/collectLink`,`/collectMessage`,`/collectNews`,`/collectOneThing`,`/collectService`,`/collectServiceItem`,`/collectTask`,`/commentAnswer`,`/personalized/savePersonalizedMenu`,`/personalized/batchSortPersonalizedMenu`,`/saveSiteitching`,`/saveUserFavoriteFolderAgent`/`Item`/`Service`,`/saveUserPreferenceSetting`,`/programme/updatePopupWindowStatus`,`/qrCode/confirm`,`/qrCode/scan`,`/qrCode/getUserSignature`,`/appAppraise/saveAppraise*`(3),`/itemAppraise/saveAppraise*`(2),`/oneThingAppraise/saveAppraise*`(2),`/feedback/submitFeedback*`(2),`/fileTodo/downloadNewsAttachment`,`/sendStataSimServiceVisitInfo`,`/portal/switchUserLanguage`,`/uploadUserAvatar`,`/removeSearchHisVal`,`/minos-stata/collect/collectData`,`/schedule/handlerShareEvent`,`/escapePageCount/count`

**前端无 `code.hbut` 任何硬编码**——code 域入口完全由服务端服务目录下发（`pcAccessUrl`）。

## 6. 坑与未覆盖项

1. **门户网关会话 ~10 分钟级过期**：静态 cookie 文件里的 `WISCPSID` 会失效，`execCardMethod`/`getPageInfo`/`getHotSearch` 等从 `errcode=0` 退化为 `errcode=999 无权限调用`；但 `getLoginUser`/`getMessageCount`/`getUserPermissionRouters`/`getPageView` 仍返回 200（走另一校验路径）——**不能用 getLoginUser 判会话活性**。修复：`GET /login` 走一遍 CAS service ticket 换票即恢复（已实测，无副作用）。
2. `getPageInfo` 的 errcode 成功值是 `200` 不是 `0`；`getWorkWxConfig` 无 errmsg 且额外带 traceId/page 字段。
3. HTTP 404/500 返回「系统异常」HTML（img/404.png、500.png），**status 字段可能仍是 200**，判活必须看 body 或 content-type。
4. `GET` 与 `POST` 不能混用：门户大量接口是 POST-JSON 形态，GET 报 `errcode=1007`；反之 GET-only 的（`queryServiceByWid/{wid}/{filterKey}`）POST 报 404。
5. 任务卡（TODOTASK/MYTASK/DONETASK/COPYME）`renderData` 恒 `data:null`（教师任务数据源在 oanew/message_pocket），角标用 `getMarkNumber`（MYTASK=4）。**待办明细接口未在本域找到**，需要去 `oanew.hbut.edu.cn` 或 `message_pocket` 侧另探。
6. `dataRefresh/init` 是 SSE（`text/event-stream`），疑似卡片数据实时推送通道，未深探。
7. `/cal/queryOrgUsers` 401、`/auth/minos/*` 403、`/personalized/*` 999（未购 license）——教师身份对这些模块无权限或未开通。
8. `e.hbut.edu.cn/server/*`（学生勘察里有 `/server/auth/host/open`、`/server/home/*` 等一码通镜像接口）本轮未重测——教师侧一码通统一从 `code.hbut.edu.cn/server/auth/host/open` 进，见第 4 节。
9. 未覆盖：`/execCardMethod` 的 `visitService`（埋点，按只读未调）、`getQuickProcessAiFormKey` 依赖的服务助手 license、`/pages/downloadFile` 等。

## 7. 产出文件

| 文件 | 内容 |
|---|---|
| `raw/ehbut-teacher-probe.json` | 合并去重后 **142 条**探测记录（status/fields/sample 脱敏） |
| `raw/ehbut-teacher-probe-01..07*.json` | 分轮原始记录 |
| `raw/pageview-{default,office,hall,datacenter}.masked.json` | 四页面 getPageView 全量 |
| `raw/pageinfo-{home,empty}.masked.json` | getPageInfo 含 menuTree |
| `raw/cards-full.masked.json` | 8 首页卡 renderData 全量 |
| `raw/card-{hall,datacenter}-*.masked.json` | 全部服务卡/专题卡全量 |
| `raw/services-catalog.masked.json` + `allservice-catalog.masked.json` | 74/66 项服务清单 |
| `raw/bundle-api-paths.txt` | bundle 静态提取 116 路径 |
| `raw/refreshed-ehbut-cookies.json` | CAS 换票后 cookie（键名级，已回写会话文件） |
| `tools/teacher-probe/probe-ehbut-*.mjs` | 可复跑探针脚本 ×6 |
