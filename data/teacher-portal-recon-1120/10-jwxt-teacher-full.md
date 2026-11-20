# 湖北工业大学教务系统 · 教师端全菜单接口勘察（第二轮补全）

> 勘察时间：**2026-11-20**
> 勘察账号：教师账号（`currentRoleId=js`，部门 205，学期 `2026-2027-1`）
> 目标系统：`https://jwxt.hbut.edu.cn`（Powered by ChaoXing）
> 基线：`data/teacher-api-recon/`（2026-10-09 第一轮，00~09 文件）
> 原始实测记录：`raw/jwxt-teacher-probe.json`（213 条，含状态码/ret/total/字段名，已脱敏）

---

## ⛔ 只读声明

本轮勘察**全程只读**：

- ✅ GET：全部页面 HTML、字典、列表、详情页
- ✅ POST：仅限「页面自身 `mtype:"post"` 的 jqGrid 列表查询」与「`get* / query* / search* / list*` 语义的纯查询」
  （`getZyKjs / getZcByXnxq / getXqrqxx / getSzInfo / getJxlList / SelectUnion* / qry* / ajax*List / acustomList / query*Page / yddyspList / jcsjsz/getJcsz / StuGrade/CurrentUserYx / xsydsq/qryXsydsqByBzr`）
- ❌ **未调用** `07-write-endpoints-denylist.md` 登记的任何接口；未调用 `checkRefresh`；未提交任何申请/成绩/通知/异动
- 响应中的姓名、工号、学号、cookie、token **均未落盘**；JSON 只保留**字段名**（不落值）

---

## 🪪 身份上下文

`POST /admin/getMenuList`（本轮未重复调用，沿用 10-09 结论）：`currentRoleId=js`，`currentDepartmentId=205`，`dataXnxq=2026-2027-1`。
`queryKbForJsd` 页面隐藏域本轮实测仍含 `xnxq / teacherId / xqid / mzpktsIpt`（`teacherId` 为服务端加密 id，不可客户端构造）。

---

## 📐 通用约定（本轮复核确认）

1. **jqGrid 列表的真实形态是 POST**：页面 `mtype:"post"` + `postData:{queryFields:<列名串>}` + `prmNames:{page:"page.pn",rows:"page.size",sort,order}`。响应 `{msg:"ok",ret:0,page,rows,total,totalPages,results[]}`。
   - **GET 同路径同样有效**（`qryBjxx`、`qryXsydsqByBzr` 实测 GET/POST 结果一致），接入可统一用 GET；但 `mtype=post` 才是页面真实形态，遇 405/不支持时按 POST 发。
2. **`queryFields` 列名可裁剪**：按页面 `query<gridId>Fields` 隐藏域原样回传即可；服务端只回所列字段。
3. **每条记录注入身份字段** `currentUserId/userRoleId/dataAuth/dataXnxq/currentRoleId/currentJsId/currentUserName/currentDepartmentId/new`——解析时忽略。
4. **`/twork/...` 是同 host 独立微服务**（工作量 SPA），响应形态 `{code:1=成功,message,data}`，**不是** `{ret:0}`，也不是 `/admin` 前缀。
5. 错误形态：`{ret:-1,msg:"参数传输异常"/"数据传输异常"/"关键参数缺失"}`、`HTTP 401 + Subject does not have permission [模块:子模块]`、`HTTP 404/500 + 错误页`、HTTP 200 + 「报错啦」页。

---

## 一、我的申请（M1600）

### 1.1 调停补申请 — `../fe/#/pkgl/teacherTtbApply`（SPA，本轮新覆盖）

页面是 Vite SPA（`fe/index.html` → `assets/index-71258dae.js`），路由 chunk `index-71f293db.js` + `index-8f9d87de.js` + `index-f5821ae7.js` 等。**静态提取 + 只读实测结果**：

| 接口 | 方法 | 实测 | 说明 |
| --- | --- | --- | --- |
| `/admin/jsd/ttbgl/queryTtbxxList?listtype=js&xnxq=` | GET | 200 `total:0` | **本教师调停补申请列表**（新旧学期均为 0——该教师无申请记录） |
| `/admin/jsd/ttbgl/queryJsPkxx` | GET | 200 `total:6` | **教师排课信息**（可调停补的课程；字段含 `kcmc,jxbmc,jxbbh,jxbzc,sksjdd,tzzxs,zsqs` 等 26+ 字段，见 ttbxxnew 同构） |
| `/admin/jsd/ttbgl/ttbxxnew` | GET | 200 数组 | 调停补课程树（含 `leaf,hasChildren,jhxs,tzjcs,skxs,bkxs`） |
| `/admin/pk/pkttbgl/queryTtbxxList` | GET | 200 | SPA 申请列表（表格 `api-url` 声明） |
| `/admin/pk/pkttbgl/yddyspList` | POST | 200 `ret:0` | 已调待审批列表（`pagesize,pageno,listtype:'js',xnxq`） |
| `/admin/pk/pkttbgl/dspList` | GET | 200 `total:0` | 待审批列表（教师端本角色无数据） |
| `/admin/pk/pkttbgl/getTtbPz` | GET | 200 | **调停补配置**（`ttbglqx,zdxs,yxcsbk,ttbjssfbt,bxytkjlcnbk,ygtksfscsxz,...`） |
| `/admin/pk/pkttbgl/queryttbparam` | GET | 200 | 申请参数配置 |
| `/admin/pk/pkttbgl/querysqr` | GET | 200 | 申请人信息 `{opttb,sqr,xnxq,sfkqjsdxnxq}` |
| `/admin/pk/pkttbgl/getTtbqxkzcs` | GET | 200 `{ttbsfxstjcs}` | 权限控制参数 |
| `/admin/pk/pkttbgl/ttbctxx` | GET | 200 `{}` | 调停补提示信息（空对象） |
| `/admin/pk/pkttbgl/querybcpzxx` | GET | 200 空体 | 补充凭证信息 |
| `/admin/pk/pkttbgl/jssqsnapshot` | GET | 200 `array(len=0)` | 教师申请快照 |
| `/admin/pkgl/jyjs2/initGetTeacherList` | GET | 200 `array(1)` | **当前教师** `{dqzt,yxbmm,id,xm,jsbh}` |
| `/admin/pkgl/jyjs2/getTeacherPageList?pageNo,pageSize` | GET | 200 `total:1` | 教师分页（含 `xm,jsbh,lxdh,yxmc...` ⚠️ PII） |
| `/admin/pkgl/sdznpk/getPkxxByJxbid?jxbid=` | GET | 200 | 教学班排课 `{XM,croomid,xq,jcstr,zcstr,TID,pkxx}` |
| `/admin/pkgl/sdznpk/getZcxspzByJxbid?jxbid=` | GET | 200 | 周次学时配置 |
| `/admin/pkgl/sdznpk/checkThjsCtzc?jxbid,xnxq` | GET | 200 `ret:-1` | 调停补场地冲突检查（需完整参数） |
| `/admin/pkgl/jcsjsz/getJcsz` | POST | 200 | 节次设置（POST 查询；GET 404） |
| `/admin/pkgl/zkb/list?xnxq` | GET | 200 | 班级周课表组件数据 |
| `/admin/pkgl/zkb/getZkb?xnxq,bjid` | GET | 200 `ret:-1` | 需合法班级 id（`bjid` 非 `bjbh`） |
| `/admin/pkgl/xqkb/getXqkb/getBjList/getBjTkxx/getTop` | GET | 200/`ret:-1`/500 | 学期课表组件，均需合法 `bjid`/上下文参数 |
| `/admin/pkgl/jcsjsz/getJcsz` | POST | — | 见上 |
| `/admin/xkgl/xkrwgl/ajaxListDatas` | GET | 200 `total:0` | 选课任务数据 |
| `/admin/sjfx/pkgl/pkrcfbtj · pkzcfbtj · pkjcfbtj` | GET | 200 | **排课分布统计**（人次/周次/节次 × 学院，`{PKMCXQ1..7,KKYX,XNXQ}`） |
| `/admin/system/jxzy/jxl/getJxlList` | GET | 200 `array` | 教学楼 `{id,jxlbh,jxlmc,xqdm}` |
| 字典：`jcsj/njsj/getNjList`、`jcsj/xnxq/getXnxqList`、`jcsj/bmsj/getKkYxList` | GET | **401** | ⚠️ 教师无权限 `[jcsj:njsj]` 等——SPA 里这些字典是教师端不可用的 |
| 字典：`jcsj/xqsj/getXqList` | GET | 200 | 校区字典可用 |
| `system/xtsz/getParam?key=PKGL_JSTJC_SFYXCTTK` | GET | 200 `ret:-1` | 参数名需核实（可能 key 不对） |

写型（登记，未调）：`pk/pkttbgl/spExecute、delSqjl、deleteFormCh、sendTtbNotice、savebcpzsq、updateBatch、cancelTtb、exportSpList、/{id}/update、sdznpk/saveThjsCtzc、sdznpk/saveZcxspzThjs、sdznpk/updateDhjcArgs、attachment/upload`、移动端 `jsd/ttbgl/ttbpzbj`（POST 补交凭证）、`jsd/ttbgl/exportData`。

### 1.2 调停补课申请（移动端）— `/admin/jsd/ttbgl`

页面 `type:'get'`：`pk/pkttbgl/getTtbPz`、`jsd/ttbgl/ttbxxnew`；`type:'post'`：`pk/pkttbgl/yddyspList{pagesize,pageno,listtype:'js',xnxq}`、`jsd/ttbgl/ttbpzbj`（⚠️ POST 写——补交凭证，**禁调**）。另含 `/admin/api/toQrCode?ttbId=`、`/admin/pk/pkttbgl/spdetail?ttbId=`。

### 1.3 学生异动申请 — `/admin/xjgl/xsydsq/teacherlist`

| 接口 | 方法 | 实测 | 说明 |
| --- | --- | --- | --- |
| `/admin/xjgl/xsydsq/qryXsydsqByBzr?gridtype=jqgrid` | GET/POST | 200 `total:0` | 班主任名下异动申请列表（本账号 0 条） |
| `/admin/xjgl/xsydsq/showDetail?id=` | GET | 200 报错页 | 需有效 `id`（加密） |
| `/admin/system/dict/getDictInfo` | GET | 200 | 字典详情 |
| `/admin/activiti/dbsy/toTaskTrace/` | GET | 404 | 流程跟踪（需流程实例 id） |

写型（禁调）：`teachercreate?ydmcid=`（07/09/10 三类异动发起）、`reApply?id=`、`cxsq?id=`（撤销）。

### 1.4 工作流：我的申请 / 待办 / 经办

| 页面 | 接口（POST+queryFields，jqGrid） | 实测 |
| --- | --- | --- |
| `activiti/myApply/listMyApply` | `/admin/activiti/myApply/qryMyApply?zdysq=&processInstanceId=` | 200 `total:2` |
| `activiti/dbsy/toDbsyPage` | `/admin/activiti/dbsy/listRunningProcessInstaces?zdydb=&showAll=` | 200 `total:0` |
| `activiti/myApply/operationApply` | `/admin/activiti/myApply/qryOperationApply?zdyjb=` | 200 `total:2` |

列配置 gridId：`wdsqGridIdGrid / wddbGridIdGrid / wdjbGridIdGrid`。待办字段含 `sqxx,sqyy,dqspzt,sqxnxq,startUserXx`；经办多 `taskEndTime,checkstatus`。
禁调：`chehuiProcessIng`（撤回）、`exportDataToDownloadCenter`、`printCJXGBB`、`doTransFields`。

---

## 二、学籍管理（M02）

### 学分统计 — `/admin/xjgl/xftj`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/xjgl/xftj/getxftjlist?encodeId=1&gridtype=jqgrid` | POST | 200 `total:4`（⚠️ 与 10-09 的 0 不同——本学期有数据） |
| `/admin/xjgl/xftj/getBjgKcxx` | GET | 200 HTML「学分统计列表」页 |
| `/admin/system/jcsj/zysj/getZyList`、`bjxx/getbjxxList`、`zyfx/getZyfxList` | GET | 200 空数组（需院系/年级参数） |
| `/admin/cjgl/archiveGrades/searchChooseStudents?urlType=xj_xftj` | GET | 200 `total:0` |

过滤参数 `yxdm=205` 对 `getxftjlist` 不生效（total 不变），筛选用页面查询表单字段（`xh/xm/sznj/zymc`）。
`getxftjlist` 返回字段含 `xfjd,gpazypm,cxxf,cxtgxf,zxfjd,yixzxf,jhwxf` 及动态课程列。⚠️ 含学生 `xh/xm`，PII。

---

## 三、我的课表（M160101）— `/admin/pkgl/pkgljskb/queryKbForJsd`

| 接口 | 方法 | 实测 | 说明 |
| --- | --- | --- | --- |
| `/admin/pkgl/pkgljskb/getJskbByXqid?xnxq&id=<teacherId>&xqdm&isjsd=0&sftqz=0&xsqbkb=0&zc=` | GET | 200 `data[6]` | **核心**。`id`=#teacherId 加密值（页面隐藏域） |
| 同上 `zc=7` | GET | 200 | 周次过滤生效 |
| `/admin/pkgl/pkgljskb/ajaxJskbList?xnxq&jsid=` | GET | 200 `ret:0` | `jsid` 传加密 teacherId 亦有效（本学期课表另一种返回形态） |
| `/admin/pkgl/pkgljskb/getJxbzcxq?xnxq&jxbid=` | GET | 200 `ret:0` | 教学班组成查询（有效 jxbid 有数据；空 → `数据传输错误`） |
| `/admin/api/getZclistByXnxq?xnxq&role&userId&xqid` | GET | 200 | 节次设置（11 小节） |
| `/admin/api/getRqListByWeek?xnxq&week=` | GET | 200 | 某周 7 天日期 |
| `/admin/pkgl/kbcx/bjkb/ckbjkb?id=`、`pkglcroomkb/ckcroomkb?id=`、`pkgljskb/ckjskb?id=` | GET | — | 班级/教室/教师课表查看页（HTML） |

`getJskbByXqid` 返回字段（41 个业务字段，含 `pkid 唯一键、kcbh,kcmc(含HTML),jxbid,jxbbh,xingqi,djc,djs,ztid,zjsname/tmc,croombh,croommc,jxlmc,zc,zcstr,zctype,xf,zongxs,bjrs,xkrs`）；`djs`=大节号=ceil(djc/2)（沿用 10-09 H0 结论，本轮 `djs` 值与 `djc` 再次自洽）。

---

## 四、成绩管理（M1606）

### 4.1 成绩录入 — `/admin/jsd/jsdcjlr/list1`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/jsd/jsdcjlr/queryCjlrsz/1?bkbj=0|1|2` | POST | 200 `total:4/4/0`（三个 tab：可录/未开放/已截止） |
| `/admin/jsd/jsdcjlr/querycjdlr/1` | GET | 200 `array(2)`（成绩录入档案两分页） |
| `/admin/cjgl/cjjdxkz/checkXz` | GET | 200 `{ret:0}` |
| `/admin/kw/kwkssj/getKspcNew?xnxq` | GET | 200 `array(4)`（考试批次） |
| `/admin/jsd/jsdcjlr/sjfx?jxbid=` | GET | 200 | 试卷分析入口页 |

字段：`sfklr,cjfxlrqssj,cjlrzt,tjzt,kcbh,kcmc,jxbmc,sfbhbys,jxbzc,bkbj,cjfxms,jsmc,ylrs,kkjysmc`。
禁调：`cjjssq`（解锁申请）、`toTempCjlrNewPage`、`changeTemplate`、`exportData`、`cjprint`、`createXscjData`、`checkAllowToUnlock`（500）。

### 4.2 成绩修改 — `/admin/jsd/jsdcjxgsq/list1`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=0|1|2` | POST | 200 `total:0/4/0`（待提交/已提交/已办结） |
| `/admin/jsd/jsdcjxgsq/getCjxgjlByJxbid?kslx=0|1|2&jxbid=` | POST | 200 `total:0`（本轮新测：该教学班无修改记录） |
| `/admin/cjgl/cjxgsjsz/checkCjxgXz?xnxq` | GET | 200 `{ret:0}` |

`getCjxgjlByJxbid` 是 10-09 未测项，本轮确认 jqGrid POST 形态有效。禁调：`submit、deleteCjxgsq、recordDelete、toCjxgPage`。

### 4.3 教学班成绩查询 — `/admin/jsd/jsdcjcx/jsdcjcx`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/jsd/jsdcjcx/jsdQueryJxbList` | POST | 200 `total:4`（`cjfbzt` 成绩发布状态、`bkbj`） |
| `/admin/jsd/jsdcjcx/jsdxscjck?id=` | GET | 200 HTML 页（明文 jxbid 也可打开「教学班成绩查看」页） |

---

## 五、排课管理（M06）

### 5.1 班级课表 — `/admin/pkgl/kbcx/bjkb?qx=1`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1` | POST/GET | 200 `total:3315`（本轮：上学期 712 → 现在 3315，数据源随学期/权限口径变化） |
| 同上 `rxnf=2025&yxmc=` | POST | 200 `total:194`（过滤生效；GET 同效） |
| `/admin/pkgl/kbcx/bjkb/ckbjkb?id=` | GET | — | 班级课表查看页 |
| `/admin/api/jcsj/bmsj/getYxSelectUnionByStudent`、`zysj/getZySelectUnion`、`bjxx/getBjSelectUnion` | **POST** | 200 | ⚠️ **GET 报 500「method not supported」**（与 10-09 不同——这三个是 POST-only） |
| `/admin/pkgl/pkrwgl/getjsxx` | GET | 200 `array(1087)`（教室） |
| `/admin/api/getSetting`、`jcsj/xnxq/getSfcztqz`、`bjkb/isOK` | GET | 200 |

### 5.2 教室课表 — `/admin/pkgl/pkglcroomkb`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `ajaxListCustom` | POST | 200 `total:1741`（含 `jxldm=24` 过滤 → `total:116` 生效） |
| `/admin/pkgl/pkjssz/getJxlList?xqdm=` | GET | 200 `array(35)` |
| `/admin/pkgl/pkglqxzkb/getJcinfo?xnxq` | GET | 200 `data[11]` |
| `/admin/system/jxzy/jsxx/getjiaosList(1)` | GET | 200 `array(1087)` |
| `pkglcroomkb/isOK` | GET | 200 `-1` |

### 5.3 全校总课表 — `/admin/jsd/qxzkb/list3`

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0` | POST | 200 `total:6941`（全量） |
| 同上 `+kcmc=…` | POST | 200 `total:1`（**kcmc/jxbid/jxbbh 过滤生效**） |
| 同上 `+zc/xq/jc` 或 `zxzc/zxxq/zxjc` | POST | 200 `total:6941`（⚠️ **周次/星期/节次参数被忽略**——需客户端过滤或换 `skzc` 字段） |
| `/admin/jsd/qxzkb/querylist` | GET/POST | **500**（⚠️ 此路径不存在有效实现，勿用；父任务提示「POST 500」实测 GET 也 500） |
| `/admin/jsd/qxzkb/tjskqk?xnxq` | GET | 200 `ret:-1` 数据传输异常（需其它参数） |
| `/admin/jsd/qxzkb/getXlrqRqRange?xnxq` | GET | 200 | **新发现：校历日期范围** |
| `/admin/jsd/qxzkb/xkrsxq?jxbid=` | GET | 200 HTML（选课人数详情页） |
| `jcsj/zysj/getZyListByAuth`、`bjxx/getBjListByAuth` | GET | **500** 报错页（10-09 未列） |

字段（queryqxzkbGridIdFields 50+）：`kcbh,kcmc,kcxz,kclx,kclb,xnxq,xf,skjs,skjsbh,zymc,showzc,sksjdd,jxbzc,bjrs,cxrs,kkxs,kkzxs,llxs,syxs,ksfs,ksxs,xqmc,kkyxmc,kkjysmc,dqzcm,jxlName,jsmc,skdd`。

### 5.4 空教室 — `/admin/system/jxzy/jsxx/toZyKjsPage`（沿用 09 文档 + 本轮复核）

| 接口 | 方法 | 实测 |
| --- | --- | --- |
| `/admin/system/jxzy/jsxx/getZyKjs` | **POST** | 200 `total:25`（`zcStr=7&xqStr=1&jcStr=9,10,11&jxldm=24&type=1` 复核，与 09 一致） |
| `/admin/system/jxzy/jsxx/getZcByXnxq` | POST | 200 `array(22)`（zc:0..21） |
| `/admin/system/jxzy/jsxx/getXqrqxx` | POST | 200 `data[7]`（⚠️ 参数名是 **`zcStr`**；传 `zc` 或仅 `xnxq` → 500） |
| `/admin/system/jxzy/jsxx/getSzInfo` | POST | 200 配置对象 |
| `/admin/system/jxzy/jsxx/getXnxqInformation?xnxq` | GET | 200（按周 7 天） |
| `/admin/pkgl/jyjs/getZcXqJC?xnxq&zc=` | GET | 200（**需 `startTime/endTime`** 才返回 `{startZc,startXq,startJc,...}`，见 09 §3） |
| `/admin/pkgl/jyjs/getXnxqByJcxx?xnxq` | GET | 200 `array(11)` |
| `/admin/pkgl/jsjssz/getRqfw` | GET | 200 | **新发现：借用日期范围** |
| `pkgl/pkgljsjyhmd/checkHmdInTime` | GET | 401 | 教师无权限（沿用） |

---

## 六、信息查询（M1601）

### 6.1 学生信息查询 — `/admin/xjgl/xsjbxx/xsxxcx`

`xsxxcxListCustom`（POST）→ `total:56957`，字段 `xh,xm,mzdm,yxdm,sznj,rxnj,bjdm,xsdqztdm,xz,sfzx,zymc,bjmc,encodeId`。⚠️ `yxdm=205` 过滤**不生效**（返回全量），筛选用 `xh/xm/sznj/zymc` 等页面表单字段。⚠️ PII，仅字段名落盘。

### 6.2 校历 — `/admin/system/zy/xlgl/queryForXsd`

`getData/{xnxq}`、`selectRows/{xnxq}`、`selectJxzxsj/{xnxq}`、`selectJxzxsjXq/{xnxq}`（空 `{}`）、`systemxlzc/getZcbzbyxq/{xnxq}`、`zy/xlxx/getBz/{xnxq}`、新发现 `system/zy/xlrq/allXlbz?type=2&rq=`（日程备注「查看全部日程」页）。全部 GET 200。

### 6.3 教学任务 — `/admin/jsd/jxrw`

`ajaxListJsJxrw`（POST）→ `total:6`，字段最全班次（`cqzt1..20,sfqr,sjzs,ksxsname` 等 60+）。`xnxq=2025-2026-2` → `total:9`。
`jsdJxrws?zxjhid=`、`jxbzc?jxbid=` GET 200 HTML 页。
`kwglJsdJkcx/getZkKsrwByJxbid`（POST `jxbid|id`）→ `ret:-1`（参数形态仍不对，GET 404）。

### 6.4 监考 / 班级考试 / 缓考

| 接口 | 实测 |
| --- | --- |
| `kwglJsdJkcx/ajaxJsjkList` | 200 `total:1`（本学期）；`xnxq=2025-2026-2` → `total:3` |
| `kwglJsdJkcx/ajaxJsrkjxbksList?encodeId=1` | 200 `total:1` |
| `kw/kwhkgl/hkmdcxjg?lx=` | 200 `total:0`（`lx=1` 同） |
| `kwglJsdJkcx/detail`、`kw/ksap/xsdetail?rwid=` | 200 HTML 页 |
| `kw/kwkssj/getKspc(New)`、`kwgl/kspc/getKspc` | 200 `array(4)` |

### 6.5 试卷分析 / 试卷管理 / 剩余试卷

`jsd/sjfx/jsdlistsjfx`→`total:0`；`jsd/sjgl/ajaxSysj`→`total:0`；`jsd/sjgl/ajaxOwnList`→`{ret:-1,"请联系管理员设置需上传资料类型！"}`；`kwgl/kspc/getKspc`→`array(4)`。`jsd/sjgl/sjck` 页面（试卷查看）。禁调：`sjsc、tjsq、resetSfbk、checkScrq、exportSysj`。

### 6.6 评教三项

`pj/xspjxxcx/acustomList`→`total:0`；`pj/xspjjgcx/acustomList`→`total:0`；`pj/thpjcx/acustomList`→`total:0`；`getZbmbxx/getThpjZbmbList?xnxq`→空数组（本学期未开放评教）。**`xspjjgcx/checkRefresh` 未调**（触发服务端重算）。

### 6.7 工作业绩考核登记 — `/admin/jsd/gzyjkhdj`

页面服务端渲染（`姓名/性别/出生年月/所在部门` + 业绩列表），**无独立 JSON 读接口**；唯一写口 `saveJsGrsz`（禁调）。页面内 `if(false)` 控制「超出录入时间」。

### 6.8 教师卡片 — `/admin/sz/szjsjbxx/queryJsxxFroJsd`

服务端渲染 HTML（146KB），内联教师基本信息（姓名/工号/职称/学历/部门等）+ 头像附件。**无 JSON API**；`?json=1` 无效（仍返回 HTML）。取数需解析 HTML 或走 `updateQueryJsxxFroJsd`（写页，未访问）。

### 6.9 学生考勤统计 — `/admin/jsd/xskq`

`ajaxListJsJxrw`→`total:6`（考勤确认状态 `kqqrzt`）；`jcwdxskq?id=<jxbid>`/`xswdxskq?id=` GET 200 HTML 页（教师/学生维度考勤明细页）。

### 6.10 移动端教师查询 — `/admin/jwxtgld/jscx/list`

`getJscxYxxx`→200（院系下拉数据）；`jsxxlist?yxid=205`→200 HTML 页「土木建筑与环境学院」教师列表（服务端渲染，含教师姓名/联系方式 ⚠️ PII）。

---

## 七、通知管理

| 页面 | 接口 | 实测 |
| --- | --- | --- |
| `jsd/notice/list` | `jsd/notice/ajaxList1`（POST） | 200 `total:0`（我发布的） |
| `system/tzsjx` | `system/tzsjx/ajaxList`（POST） | 200 `total:15`（收件箱，`title/content` 含 HTML，`dqstatus,collectstatus,sfzd`） |
| `system/tzsjx` | `system/tzsjx/showdetail?id=` | 200 报错页（需有效 id） |

禁调：`notice/create,update,updateTopping`、`tzsjx/collect,deletecollect,updateState`、`workcenter/message/deleteNoticeToRecycleBin,batchQxzd`。

---

## 八、移动端（M23）— `/admin/jwxtgld/jscx/list`（见 6.10）

---

## 九、教师端工作量 — `../../fe/#/workloadManage/eduStat`（SPA，本轮新覆盖）

**关键发现：工作量数据不在 `/admin`，而是同 host 微服务 `https://jwxt.hbut.edu.cn/twork/...`**（响应 `{code:1,message,data}`，POST `jsd/search` 返回 `code:0 数据异常`——只接受 GET）。

静态提取（chunk `index-2b8e34f1.js`）：51 个接口，GET 22 个只读。实测：

| 接口 | 实测 | 说明 |
| --- | --- | --- |
| `/twork/jsd/current-user-info` | 200 `{id,username,roleId}` 全 null | 教师端工作量账号未初始化 |
| `/twork/jsd/current-user-gzl` | 200 `gzlSum/jsRzGzlSum/baseGzlSum/edGzlSum/jsRzGzlList` 全 null | **教师本人工作量汇总**（本账号本学期无数据） |
| `/twork/jsd/search` | 200 `data:{updateByMap}` | ⚠️ 无参 GET 返回 `updateByMap`（姓名→工号映射，PII） |
| `/twork/system/search`、`/twork/append/search` | 200 | **筛选元数据**：`kkXnxqList(6 学期),kcLxList,kkXyMap,gzlTypeMap,jxbScaleTypeList,jwSystemXnxqList,createByMap,updateByMap,studentType,xsTypeMap,xyInfoMap` |
| `/twork/system/all-enum` | 200 | 9 个枚举 Map：`jsDqtzMap,jxbScaleTypeMap,jsRzTypeMap,kcLbMap,gzlTypeMap,gzlStatusMap,jsDqtzMap,kcLxMap,kcXzMap` |
| `/twork/config/current-data` | 200 | `{dqnd:'2026',gzlSyetemXnxq:'2026-2027-1,2025-2026-2',modifyEndTime:'2026-12-20'}` |
| `/twork/config/current-nd-xnxq`、`currentXnxqList`、`ifLock`、`jw-system-xnxn`、`xnxq-search-info`、`xy-search-info` | 200 | 配置/字典类 |
| `/twork/append/js-xy-search-info` | 200 | `xyInfoMap(50 院系),jsInfoDTOList` |
| `/twork/append/jxb-js-xy-gzl`、`/twork/system/jxb-js-gzl`、`jxb-js-xy-gzl`、`read_jxbZcMx` | 200 | 教学班工作量关联（无参返回空/骨架） |
| `/twork/del/search` | 200 | 删除记录查询 |
| `/twork/system/data-import` | 200 `code:0` | GET 形态被拒（该端点语义为导入，**接入时勿调**） |
| `/admin/StuGrade/CurrentUserYx` | POST 200 `ret:0` | 当前用户院系（纯查询 POST） |
| `/admin/api/system/getYxForGzl` | GET 200 | 工作量院系配置 |

写型（禁调）：`config/data,delete,insert-systemConfig,update-*,js/publish,data-status,update-jsrz,jsd/confirm,append/save,batchUpdate,updateSingleBatch,update-jxb-js-xy-gzl,del/restore,system/updateXs,updateX1,update-lock,update-jxb-js-xy-gzl,select-data-import/confirm,system/delete,batchUpdate,data-import(POST),jxb-js-gzl/update,update-single-batch`。

eduStat 页面数据加载链：`getBaseSetData(config/current-data)` → `getAllEnumData(system/all-enum)` → `system/search{nd,status:1}` 拿学期维度 → 表格组件按 `jwSystemXnxq/gzlXnxqList/kkXnxq/jxbInfo/kcInfo` 调 `system/search`（POST JSON）+ `jsd/current-user-gzl` 拿本人汇总 + `append/search` 申诉列表。**教师本人工作量 `current-user-gzl` 本学期 null**（该功能未开放/未计算，非接口故障）。

---

## 与 2026-10-09 版本的差异

### 新增（10-09 未覆盖 / 未实测）

1. **两个 SPA 首次打通**：`teacherTtbApply`（/admin 域）+ `eduStat`（**/twork 微服务**，同 host 独立服务，`{code,message,data}` 形态）。
2. **调停补接口族 20+ 新接口**：`pk/pkttbgl/*`（getTtbPz/queryttbparam/querysqr/ttbctxx/getTtbqxkzcs/dspList/yddyspList/jssqsnapshot/querybcpzxx/queryTtbxxList）、`jsd/ttbgl/{queryTtbxxList,queryJsPkxx,ttbxxnew}`、`pkgl/jyjs2/*`、`pkgl/sdznpk/getPkxxByJxbid`、`sjfx/pkgl/pk{rc,zc,jc}fbtj`。
3. **新读接口**：`jsd/qxzkb/getXlrqRqRange`、`pkgl/jsjssz/getRqfw`、`system/zy/xlrq/allXlbz`、4 个 `SelectUnion`（院系/专业/班级下拉）。
4. **twork 只读族**：`jsd/current-user-{info,gzl}`、`system/{search,all-enum,jw-system-xnxn,*-search-info,jxb-js-xy-gzl,read_jxbZcMx}`、`append/{search,js-xy-search-info,jxb-js-xy-gzl}`、`del/search`、`config/{current-data,current-nd-xnxq,currentXnxqList,ifLock}`。
5. `jsdcjxgsq/getCjxgjlByJxbid`、`getJxbzcxq`、`jsdxscjck`（明文 jxbid 有效）、`xskq/{jcwd,xswd}xskq` 页面、移动端 `jscx/jsxxlist`、`getZkKsrwByJxbid`（POST 但参数仍不对）首次实测。

### 修正 / 证伪

1. ⚠️ **`/admin/jsd/qxzkb/querylist` GET/POST 均 500** —— 父任务备忘「必须 GET」不准确：**该路径整体不可用**，正确接口是 `queryQxkbPage`（POST/GET 均可，本轮 `total:6941`）。
2. ⚠️ **jqGrid 真实形态是 POST**：10-09 全程用 GET 能通是因为服务端同时接受 GET；页面 `mtype:"post"` + `queryFields` + `page.pn/page.size` 才是真实调用形态。但 **SelectUnion 三个接口是 POST-only**（GET → 500 `method not supported`）。
3. ⚠️ **`getXqrqxx` 参数名是 `zcStr`**（不是 `zc`）：仅传 `xnxq` 或 `zc` → 500；`xnxq+zcStr=7` → 7 行。
4. ⚠️ **`queryQxkbPage` 的周次/星期/节次过滤参数不生效**（`zc/xq/jc`、`zxzc/zxxq/zxjc` 都被忽略，`total` 不变）；`kcmc/jxbid/jxbbh` 有效。**课表按周过滤必须客户端做**（用 `getXnxqInformation`/`getJskbByXqid` 的 `zcstr`）。
5. **`xsxxcxListCustom` 的 `yxdm` 过滤不生效**（56957 全量）；筛选需用学生表单字段。
6. **`ajaxJskbList` 可用**：`jsid` 传加密 teacherId 即可返回本学期课表（10-09 标「参数传输异常」是因为 jsid 传错）。
7. `qryBjxx` total 由 712 → **3315**（口径随学期/权限变化，非固定值）；`getxftjlist` total 由 0 → **4**（本学期有学分统计数据）。
8. 教室课表 `ajaxListCustom` 由 547 → **1741**（口径不同：本轮含更多 `xnxq` 记录，`jxldm=24` 过滤 → 116）。

### 仍失效 / 未解决

- `getJscxYxxx` 返回结构未展开（移动端接口，低优先级）
- `getZkKsrwByJxbid` 参数形态仍不对（`jxbid`/`id` 均 `ret:-1`）
- `pkgl/zkb/getZkb`、`xqkb/getXqkb` 需合法 `bjid`（`bjbh` 无效）
- `jcsj/zysj/getZyListByAuth`、`bjxx/getBjListByAuth` → 500（页面在调但教师端报错）
- `jcsj/njsj/getNjList`、`xnxq/getXnxqList`、`bmsj/getKkYxList` → **401**（教师无权限）
- `jlnkuDmc`、`checkAllowToUnlock`、`getTjsqZdyh`、`checkSxzJs` → 500/404（沿用 10-09 结论）
- `pj/*` 三个评教接口 `total:0`（本学期未开放）
- `workload` 教师本人 `current-user-gzl` 全 null（功能未开放/未计算）

### 未覆盖项及原因

| 项 | 原因 |
| --- | --- |
| `getMenuList` 再验证 | 10-09 已实测，本轮沿用 |
| `pkgl/xqkb/getZkb/getXqkb/getBjTkxx` 真实参数 | 需合法 `bjid`（encodeId 不可构造），需页面交互先拿 id |
| `checkImage/index`、`attachment/getFileViewUrl`、`tzsjx/showdetail`、`xsydsq/showDetail` | 需有效业务 id，无可构造值 |
| `updateQueryJsxxFroJsd`（教师卡片修改页） | 写型语义，未访问 |
| 外站 `gxkkk/vrknv.v.chaoxing.com`、`api/jumpToGezida` | 不在 jwxt 域 |
| `jsd/ttbgl/ttbpzbj`、`pk/pkttbgl/{save*,update*,del*,cancel*,send*,spExecute}`、`/twork` 全部 POST/写 | 只读红线 |
| 真实教学班成绩明细 `jsdxscjck` 内部数据 | 页面 HTML 已得，但其内部 `jsdcjcx` 数据接口未单独提取 |

---

## 附：分页/包裹形态速查

| 形态 | 接口族 |
| --- | --- |
| `{msg,ret,page,rows,total,totalPages,results[]}` | 全部 jqGrid（`query*/ajax*/acustom*/list*`） |
| 裸数组 | 字典类（`getJxlList,getZyxx,getBjxx,getJcsz,getRqListByWeek,getKspc*,getXnxqByJcxx,getZcByXnxq`） |
| `{ret,msg,data:[…]}` | `getJskbByXqid`,`getJcinfo`,`getXqrqxx` |
| `{ret,msg,extend:{…}}` | `getSetting`,getParam` |
| `{code:1,message,data}` | `/twork/*` 微服务 |
| HTML 页面 | `jsdJxrws,jxbzc,detail,xsdetail,jsdxscjck,jcwdxskq,xswdxskq,getBjgKcxx,queryJsxxFroJsd,gzyjkhdj,jsxxlist` |

**分页参数**：`page.pn` / `page.size` / `gridtype=jqgrid` / `_search=false` / `sort` / `order`（jqGrid `prmNames`）；部分 fe SPA 用 `pageNo/pageSize` 或 `pageno/pagesize`。
