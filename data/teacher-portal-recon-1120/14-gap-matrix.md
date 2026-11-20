# 14 · 功能缺口矩阵：学校教师端 ↔ App 教师端

> 交付核心：回答「学校教师端有的功能，App 里哪些还没有、必须移下来」。
> 判定口径：**学校有这个功能** + **App 无入口/无接口** = 缺口。
> 实测依据：`10-jwxt-teacher-full.md`（213 条）、`11-ehbut-portal-teacher.md`（142 条）、
> `12-code-teacher.md`（160 条）、`13-chaoxing-teacher.md`（18 条）。

---

## 一、结论速览

| 域 | 学校侧教师功能 | App 已覆盖 | 缺口 | 优先级 |
| --- | --- | --- | --- | --- |
| 教务 `jwxt` | 47 项菜单 | 11 项 | **约 26 项** | P0（教师日常主战场） |
| 融合门户 `e.hbut` | 3 菜单页 + 8 卡片 + 66 服务 | **0** | 全量 | P0（入口层，含一码通 SSO 入口） |
| 一码通 `code` | 卡务/流水/水电/校园码 | **0** | 全量 | P1（教师有账户与余额，但无实体卡） |
| 学习通 `chaoxing` | 课程/班级/考试/统计 | **0**（学生端有） | 全量 | P1（数据可读确定，功能页需抓包） |

**一句话**：App 教师端目前只覆盖「课表 + 考试 + 通知 + 空教室 + 校历」五块，
学校 47 项教务菜单缺 26 项，门户/一码通/学习通三个域在教师端是**零接入**。

---

## 二、教务 47 项菜单逐项对照

图例：✅ 已接入并有入口　⚠️ 接口已登记但无调用方/空壳　❌ 完全未接

### 2.1 我的申请 / 工作流

| 菜单 | 学校页面 | App | 实测状态（本轮） |
| --- | --- | --- | --- |
| 调停补申请 | `fe/#/pkgl/teacherTtbApply`（SPA） | ❌ | ✅ 已打通：`jsd/ttbgl/queryTtbxxList?listtype=js`（total 0）、`queryJsPkxx`（total 6）、`pk/pkttbgl/*` 系列 |
| 调停补课申请（移动端） | `jsd/ttbgl` | ❌ | ✅ 200 |
| 学生异动申请 | `xjgl/xsydsq/teacherlist` | ❌ | ✅ 200 |
| 工作流：我的申请/待办/经办 | `activiti/myApply/listMyApply`、`activiti/dbsy/toDbsyPage`、`activiti/myApply/operationApply` | ⚠️ | ✅ 200，接口已登记但 `TeacherWorkflowView` 是「暂未支持」空壳 |

### 2.2 学籍 / 学业

| 菜单 | 学校页面 | App | 实测状态 |
| --- | --- | --- | --- |
| 学分统计 | `xjgl/xftj` | ❌ | ✅ `getxftjlist` 0→4 条（随学期变） |

### 2.3 课表域

| 菜单 | 学校页面 | App | 实测状态 |
| --- | --- | --- | --- |
| 我的课表 | `pkgl/pkgljskb/queryKbForJsd` | ✅ | ✅ `ajaxJskbList` 用 `jsid`=加密 teacherId 可直接返回课表 |
| 班级课表 | `pkgl/kbcx/bjkb?qx=1` | ❌ | ✅ `qryBjxx` total 712→3315 |
| 教室课表 | `pkgl/pkglcroomkb` | ❌ | ✅ 547→1741 |
| 全校总课表 | `jsd/qxzkb/list3` | ✅ | ⚠️ `queryQxkbPage` total 6941，但**周次/星期/节次过滤参数被服务端忽略** |
| 空教室查询 | `system/jxzy/jsxx/toZyKjsPage` | ✅ | ✅ POST `getZyKjs` 时间维度过滤有效 |

### 2.4 成绩域

| 菜单 | 学校页面 | App | 实测状态 |
| --- | --- | --- | --- |
| 成绩录入 | `jsd/jsdcjlr/list1` | ❌ | ✅ 只读查询可用 |
| 成绩修改申请 | `jsd/jsdcjxgsq/list1` | ❌ | ✅ 只读列表可用 |
| 教学班成绩查询 | `jsd/jsdcjcx/jsdcjcx` | ✅ | ✅ `jsdQueryJxbList` 可用（含 `cjfbzt`） |

### 2.5 考试 / 试卷 / 评教

| 菜单 | 学校页面 | App | 实测状态 |
| --- | --- | --- | --- |
| 监考安排 | `jsd/kwglJsdJkcx` | ✅ | ✅ `ajaxJsjkList` |
| 班级考试信息 | `jsd/kwglJsdJkcx/rkjxbkslist` | ✅ | ✅ `ajaxJsrkjxbksList` |
| 缓考任务查询 | `kw/kwhkgl/hkrwcx` | ❌ | ✅ 200 |
| 试卷分析 | `jsd/sjfx/list` | ❌ | ✅ 200 |
| 试卷管理 | `jsd/sjgl` | ❌ | ✅ 200 |
| 剩余试卷 | `jsd/sjgl/sysjList` | ❌ | ✅ 200 |
| 评教信息查看 | `pj/xspjxxcx` | ❌ | ✅ 200 |
| 学生评价结果 | `pj/xspjjgcx` | ❌ | ✅ 200（⚠️ 同域 `checkRefresh` 禁调） |
| 同行评教结果 | `pj/thpjcx` | ❌ | ✅ 200 |

### 2.6 学生 / 考勤 / 业绩

| 菜单 | 学校页面 | App | 实测状态 |
| --- | --- | --- | --- |
| 学生信息查询 | `xjgl/xsjbxx/xsxxcx` | ❌ | ⚠️ `xsxxcxListCustom` 返回全校 56957，**`yxdm` 过滤不生效**，必须强分页 |
| 学生考勤统计 | `jsd/xskq` | ❌ | ✅ 200 |
| 工作业绩考核登记 | `jsd/gzyjkhdj` | ❌ | ⚠️ 服务端渲染 HTML，**无 JSON API** |
| 教师端工作量 | `fe/#/workloadManage/eduStat`（SPA） | ❌ | ✅ 走同 host 微服务 **`/twork/*`**（`{code:1,message,data}`），`GET /twork/jsd/current-user-gzl` |

### 2.7 通知 / 个人 / 其它

| 菜单 | 学校页面 | App | 实测状态 |
| --- | --- | --- | --- |
| 通知管理 | `jsd/notice/list` | ✅ | ✅ `ajaxList1` |
| 通知收件箱 | `system/tzsjx` | ✅ | ✅ `ajaxList`（15 条） |
| 教师卡片 | `sz/szjsjbxx/queryJsxxFroJsd` | ✅ | ⚠️ 服务端渲染 HTML，无 JSON API（App 走 profile.rs 解析 HTML） |
| 教师卡片修改 | `sz/szjsjbxx/updateQueryJsxxFroJsd` | ❌ | 写接口，不做 |
| 移动端教师查询 | `jwxtgld/jscx/list` | ❌ | ✅ 200 |
| 格子达 | `api/jumpToGezida` | ❌ | 外链跳转 |
| 新增公选课 / 导师管理 | `gxkkk.v.chaoxing.com` / `vrknv.v.chaoxing.com` | ❌ | 外站系统，超出范围 |

---

## 三、融合门户 `e.hbut`（教师端零接入）

| 能力 | 接口 | 实测 | 对 App 的价值 |
| --- | --- | --- | --- |
| 教师身份 | `getLoginUser` | ✅ 200 `categoryName=教师/教职工` | 已由教务 `currentRoleId` 替代，可选 |
| 站点 | `getUserPermissionRouters` | ✅ 2 站点：普通教师(default)、行政人员(office) | 低 |
| 页面菜单 | `getPageInfo` menuTree | ✅ 首页/办事大厅/数据中台 | 中 |
| 首页 8 卡 | `getPageView` cardLayout | ✅ 待办/已办/我的任务/抄送/热门/收藏/我的服务/全部业务系统 | **高**（门户入口层） |
| 卡片数据 | `execCardMethod/{wid}/{cardId}` | ✅ `renderData`/`getConfig`/`getMarkNumber`（MYTASK 角标 4） | **高** |
| 办事大厅服务 | `CUS_CARD_ALLSERVICE` | ✅ **66 项**（zd.hbut 表单 22、chaoxing SSO 5、oanew 4、kypt 4、内网 10、其他 21） | **高**（一站式跳转） |
| 通知 | `userNotify/getNewsNotify` | ✅ 200 空（教师无通知） | 低 |
| 扫码登录 | `qrCode/getKey` | ✅ `{qrCodeId,expireTime:180}` | 中 |
| **一码通 SSO 入口** | `pcAccessUrl = code/server/auth/host/open?pc=1&org=2&host=28` | ✅ **3 次实测走通** | **高**（打通 code 域的唯一钥匙） |

**关键坑**：门户网关会话约 **10 分钟**过期，`execCardMethod`/`getPageInfo` 会退化为 `errcode=999`「无权限调用」，
但 `getLoginUser` 仍 200（**不能拿它判活**）；重走一次 `GET /login`（CAS 换票）即恢复，无副作用。

---

## 四、一码通 `code`（教师端零接入）

| 能力 | 接口 | 实测 | 备注 |
| --- | --- | --- | --- |
| 教师身份 | `POST /server/user/info` | ✅ `positionCode=01`、`positionName=教职工` | **必须 POST**，SM4 解密 |
| 账户余额 | `user/tradeListConfig` | ✅ **主账户 0.00 + 补助钱包 2629.42** | 展示必须聚合 `accTypes` |
| 交易流水 | `user/tradeList`、`balanceTradeList`、`custom/tradeList` | ✅ 有真实数据（补助钱包 24 条） | **教师能查自己流水** |
| 卡务 | `card/config`、`card/lossList`、`card/pickupList` | ✅ | `hasCard=false`，挂失入口应隐藏 |
| 校园码 | `virtualCard/config`、`getTicketInfo` | ✅ 只读三件套 | **付款码接口刻意未接** |
| 通知 | `home/noticeList{type}`、`home/notice{id}` | ✅ 4+ 条 | 有 unread |
| 应用入口 | `home/appList` | ✅ **19 项**（开门助手、美餐点餐、场馆预约、湖工小实…） | 与学生清单不同源 |
| 水电 | `utilities/typeList` | ⚠️ 教师 **water/electric 未绑定**，仅 broadband 绑工号 | 教师只能缴网费 |
| 账单聚合 | `bllt/*` | ❌ 全家 `CORE10004`（服务端未实现，学生一致） | **不要接** |
| 商户 / IoT | `merchant/*`、`iotdevice/*` | ❌ **403 角色墙** | 不要接 |

---

## 五、学习通 `chaoxing`（教师端零接入）

实测 **102 条**接口（`raw/chaoxing-teacher-probe.json`），其中 200 成功 95 条。

| 能力 | 接口 | 实测 |
| --- | --- | --- |
| 教师身份 | `mooc1-api/mycourse/backclazzdata` | ✅ `content.roletype=3`，5 个教学班（739/231/61/81/1546 人） |
| 教师课程列表 | `fycourse /fyportal/courselist/getMyCourseJson` | ✅ **9 门我教课程**（role=1 主讲/2 协作，含 enc） |
| 工作台导航 | `mooc2-ans/coursemanagev3/base-info?view=json` | ✅ `courseNavigationListV3` 7 模块 |
| 教学活动 | `mobilelearn /v2/apis/active/pcActivelist` | ✅ 管理视角（`attendNum`/`releaseNum`/`beManagedPlanIds`） |
| 学情统计 | `stat2 /stat2/teach-data/*`（16 个） | ✅ 课堂/作业/考试/签到/讨论/积分/错题/成绩 |
| 课程画像 | `stat2 /stat2/base-data/v3/*`（17 个） | ✅ |
| **全班成绩** | `stat2 /stat2/score-data/scoreList` | ✅ **60 字段明细** + `initTable` 权重配置 |
| **学习监控** | `stat2 /stat2/study-monitor/v2/studyList` | ✅ 全班列表 + `unnormalType` 异常标记 |
| 班级名单 | `scoreList`/`studyList`/`get-stucount` | ✅ 按学生全字段（只记字段名，不落姓名学号） |
| 章节树 | `mooc2-ans/mycourse/tchcourselist?flag=0` | ✅ JSON API |
| 作业 / 考试 | `mooc2-ans/work/list`、`exam/test` | ⚠️ **服务端渲染 HTML，无 JSON API**（Playwright 实点确认） |
| 课程管理 | `mooc2-ans/tcm/course-manage` | ❌ **教师无权限**（页面渲染「该身份无权限进入管理页面」） |
| 签到明细 | `mobilelearn /v2/apis/signStat/*` | ⚠️ 需 `denc/duid`，未解 |

**三条决定性结论**：

1. 作业/考试**不存在干净的 JSON 列表接口** → 要么解析 HTML，要么 WebView 内嵌
2. 教师**进不了课程管理页**，班级/学生管理入口在 `stat2` 的 `scoreList`/`studyList`
3. `enc` 每次进课动态生成且一次性 → 纯 HTTP 复用旧 enc 必失效，这解释了盲猜 `work/list` 一直返回「提示」

---

## 六、按移动端价值排序的落地建议

### P0（必做）

| # | 事项 | Issue |
| --- | --- | --- |
| 1 | **班级课表 + 教室课表**（教师最常被问「这节哪个班/哪个教室」） | #1348 |
| 2 | **学生考勤统计** `jsd/xskq` | #1349 |
| 3 | **教师端工作量** `GET /twork/jsd/current-user-gzl` | #1350 |
| 4 | **工作流接真**：3 个只读端点接进 `TeacherWorkflowView`（当前空壳） | #1351 |
| 5 | **缓考 / 剩余试卷 / 评教三项** | #1352 |
| 6 | **融合门户首页 8 卡 + 办事大厅 66 服务** | #1353 |

### P1（该做）

| # | 事项 | Issue |
| --- | --- | --- |
| 7 | 学生信息查询（**限权限范围 + 强分页**，服务端 `yxdm` 过滤无效） | #1354 |
| 8 | 成绩录入 / 成绩修改（只读列表） | #1355 |
| 9 | 学分统计 | #1356 |
| 10 | 调停补申请 / 调停补课申请（只读） | #1357 |
| 11 | 一码通：余额（补助钱包）+ 本人流水 + 通知 + 网费 | #1358 |
| 12 | 学习通教师侧干净 JSON：课程列表 / 学情统计 / 全班成绩 / 学习监控 | #1359 |

### P2（可延后）

| # | 事项 | Issue |
| --- | --- | --- |
| 13 | 一码通校园码（只读展示，生成码另立项） | #1360 |
| 14 | 学习通作业 / 考试 / 签到（无 JSON API，建议 WebView） | #1361 |

> Epic：**#1347**

---

## 七、对 App 现有实现的影响（本轮实测修正）

| # | App 现状 | 本轮发现 | 影响 |
| --- | --- | --- | --- |
| 1 | 全校课表用 `queryQxkbPage` + 分页全量拉取 | **周次/星期/节次过滤参数被服务端忽略**（zc/xq/jc、zxzc/zxxq/zxjc 都不生效，total 恒 6941） | App 现有「分页全量 + 客户端筛」是**唯一可行**做法；不要试图加服务端周次参数 |
| 2 | 注释写「教师用 `/admin/jsd/qxzkb/querylist`」 | **GET/POST 均 500**（10-09 recon 的「必须 GET」被证伪） | 确认只能用 `queryQxkbPage`，当前实现正确 |
| 3 | 校历 `getXqrqxx` | 参数名必须是 **`zcStr`**（传 `zc` 或只传 `xnxq` → 500） | 核对后端调用参数名 |
| 4 | 空教室 `getZyKjs` | 非法 `zcStr` **静默返回全量 191** | 客户端必须校验周次在 `getZcByXnxq` 集合内（App 已做） |
| 5 | jqGrid 列表 | 真实形态是 **POST + `queryFields` + `page.pn/page.size`**，GET 是服务端兼容 | 现有 GET 可用，但 3 个 `SelectUnion` 是 POST-only |
| 6 | 学生信息查询 | `xsxxcxListCustom` 的 `yxdm` 过滤不生效，返回全校 **56957** 条 | 若接入必须强分页 + 客户端二次过滤 |

---

## 八、硬约束（接入时必须遵守）

1. **只读**：`data/teacher-api-recon/07-write-endpoints-denylist.md` 是红线
2. **角色裁剪**：教务 `/admin/pkgl/*` 教师端点对学生 401；一码通 `merchant/*`、`iotdevice/*` 教师 403
3. **非法参数陷阱**：`getZyKjs` 非法 `zcStr` → 静默全量 191
4. **空集 ≠ 失败**：`results:[]` 且 `total>0`、`ret:-1 没有可选的教学班`、`bllt CORE10004`（服务端未实现）都是合法/已知态
5. **错误四形态**：`ret:-1`（缺参/无效值）、401（无权限点）、404/500（路径/方法错）、200+错误页（业务错）
6. **一码通 POST-only**：GET 返回 `{"success":false,"message":"??"}`，不是 405
7. **门户 10 分钟会话**：`errcode=999` 时重走 `GET /login` 换票，不要用 `getLoginUser` 判活
