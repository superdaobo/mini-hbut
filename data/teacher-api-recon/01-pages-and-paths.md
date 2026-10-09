# 教师端页面 → 接口路径映射（原始抓取）

> 抓取时间：2026-10-09　账号：教师（工号 <教师工号>，`currentRoleId=js`）
> 方式：登录教务系统后，对 `getMenuList` 返回的每个菜单页发 **GET**（只读），
> 用正则从页面 HTML/内联 JS 中提取 `/admin/...` 路径。
> **本文件只是候选清单，不代表都已调用过；写型接口一律未调用。**

## 身份上下文（`POST /admin/getMenuList` 返回）

| 字段 | 值 |
| --- | --- |
| currentUserId | `<教务用户ID>` |
| currentRoleId | `js`（教师） |
| currentJsId | `<教务教师ID>` |
| currentUserName | `<教师工号>` |
| currentDepartmentId | `205` |
| dataXnxq | `2026-2027-1` |

## 菜单树（47 项）

| 层级 | 父级 | id | 名称 | 页面 url | 英文名 |
| --- | --- | --- | --- | --- | --- |
| 0 | — | M1600 | 我的申请 | /default | Teacher application |
| 1 | 我的申请 | M160000 | 调停补申请 | ../fe/#/pkgl/teacherTtbApply | Application of course adjustment / suspension / make up |
| 1 | 我的申请 | M160001 | 调停补课申请(移动端) | jsd/ttbgl | 同上（移动端） |
| 1 | 我的申请 | M160006 | 学生异动申请 | xjgl/xsydsq/teacherlist | Student transaction application |
| 1 | 我的申请 | b46ff0c4… | 工作流管理 | /default | — |
| 2 | 工作流管理 | M160400 | 我的申请 | activiti/myApply/listMyApply | My application |
| 2 | 工作流管理 | M160401 | 我的待办 | activiti/dbsy/toDbsyPage | My to-do list |
| 2 | 工作流管理 | 1af256d7… | 我的经办 | activiti/myApply/operationApply | — |
| 1 | 我的申请 | 3cc7b183… | 新增公选课开课申请 | https://gxkkk.v.chaoxing.com | — |
| 0 | — | M02 | 学籍管理 | xjgl | School Roll Management |
| 1 | 学籍管理 | M0204 | 学业情况 | /default | Academic situation |
| 2 | 学业情况 | M020400 | 学分统计 | /xjgl/xftj | Credit Statistics |
| 0 | — | M160101 | 我的课表 | pkgl/pkgljskb/queryKbForJsd | My schedule |
| 0 | — | M1606 | 成绩管理 | /default | Results entry |
| 1 | 成绩管理 | 97c0a892… | 成绩录入 | /jsd/jsdcjlr/list1 | — |
| 1 | 成绩管理 | c5cb6926… | 成绩修改 | jsd/jsdcjxgsq/list1 | — |
| 0 | — | M06 | 排课管理 | pkgl | Courses Arrangement Management |
| 0 | — | f631744f… | 班级课表 | /pkgl/kbcx/bjkb?qx=1 | — |
| 0 | — | M1607 | 试卷分析 | jsd/sjfx/list | Test paper analysis |
| 0 | — | M1601 | 信息查询 | /default | Information Service |
| 1 | 信息查询 | d1a9f4fc… | 学生信息查询 | xjgl/xsjbxx/xsxxcx | — |
| 1 | 信息查询 | M160108 | 校历 | system/zy/xlgl/queryForXsd | School calendar |
| 1 | 信息查询 | M160104 | 教学任务 | jsd/jxrw | Teaching task |
| 1 | 信息查询 | e2e8eafd… | 教室课表 | /pkgl/pkglcroomkb | — |
| 1 | 信息查询 | 93cfffa2… | 全校总课表 | jsd/qxzkb/list3 | School timetable (new) |
| 1 | 信息查询 | M160105 | 空教室查询 | system/jxzy/jsxx/toZyKjsPage | Empty classroom query |
| 1 | 信息查询 | M160102 | 班级考试信息 | jsd/kwglJsdJkcx/rkjxbkslist | Class examination information |
| 1 | 信息查询 | M160111 | 缓考任务查询 | kw/kwhkgl/hkrwcx | Postponement tasks query |
| 1 | 信息查询 | M160106 | 监考安排 | jsd/kwglJsdJkcx | Invigilation arrangement |
| 1 | 信息查询 | M160107 | 教学班成绩查询 | /jsd/jsdcjcx/jsdcjcx | Class results query |
| 1 | 信息查询 | M160110 | 评教信息查看 | pj/xspjxxcx | Teaching evaluation viewing |
| 1 | 信息查询 | M160114 | 剩余试卷 | jsd/sjgl/sysjList | Remaining test papers |
| 1 | 信息查询 | M160112 | 试卷管理 | jsd/sjgl | Test Paper Management |
| 1 | 信息查询 | a790a148… | 学生评价结果查询 | pj/xspjjgcx | Student evaluation result query |
| 1 | 信息查询 | b7bbc378… | 同行评教结果查询 | pj/thpjcx | Peer evaluation result query |
| 1 | 信息查询 | M160113 | 工作业绩考核登记 | jsd/gzyjkhdj | Work performance assessment registration |
| 1 | 信息查询 | M160100 | 教师卡片 | sz/szjsjbxx/queryJsxxFroJsd | Teacher card |
| 1 | 信息查询 | M160109 | 教师卡片修改 | sz/szjsjbxx/updateQueryJsxxFroJsd | Teacher card modification |
| 0 | — | 7ac758a7… | 教师端工作量 | ../../fe/#/workloadManage/eduStat | — |
| 0 | — | f2627037… | 学生考勤统计（老师） | jsd/xskq | — |
| 0 | — | 122c667b… | 导师管理 | https://vrknv.v.chaoxing.com | — |
| 0 | — | 405e47a6… | 通知管理 | /default | — |
| 1 | 通知管理 | M1602 | 通知管理 | jsd/notice/list | Notification management |
| 1 | 通知管理 | M1605 | 通知收件箱 | system/tzsjx | Notification inbox |
| 0 | — | M23 | 移动端 | /default | — |
| 1 | 移动端 | M2306 | 教师查询 | jwxtgld/jscx/list | — |
| 0 | — | e4c35b2c… | 格子达 | /admin/api/jumpToGezida | — |

## 页面 → 提取到的接口路径

> 说明：`/admin/system/attachment/showImage/...` 与 `/admin/system/gridfield/queryFieldByGridId`、
> `/admin/system/gridfield/getTranslation` 是**所有页面共用的框架调用**（头像/列配置/国际化），
> 下文只在首次出现处列出，不再逐页重复。

### 1. `/admin/xjgl/xftj`（学分统计）
`/admin/system/jcsj/zysj/getZyList`、`/admin/system/jcsj/bjxx/getbjxxList`、`/admin/system/jcsj/zyfx/getZyfxList`、
`/admin/xjgl/xftj/exportData`、`/admin/xjgl/xftj/getxftjlist`、`/admin/xsd/xskp`、`/admin/xjgl/xftj/getBjgKcxx`、
`/admin/system/export/urlExport`、`/admin/cjgl/tjfx/axzbzgcjcx/openChooseWindow`、`/admin/cjgl/archiveGrades/searchChooseStudents`

### 2. `/admin/pkgl/pkgljskb/queryKbForJsd`（我的课表）
`/admin/pkgl/kbcx/bjkb/ckbjkb`、`/admin/pkgl/pkgljskb/ckjskb`、`/admin/pkgl/pkglcroomkb/ckcroomkb`、
`/admin/pkgl/pkglkckb/openKcKbPage`、`/admin/pkgl/pkgljskb/report`、`/admin/api/getZclistByXnxq`、
`/admin/api/getRqListByWeek`、`/admin/pkgl/pkgljskb/ajaxJskbList`、`/admin/pkgl/pkgljskb/getJskbByXqid`、
`/admin/pkgl/pkgljskb/jskbprint`、`/admin/pkgl/pkgljskb/getJxbzcxq`

### 3. `/admin/jsd/jsdcjlr/list1`（成绩录入）
`/admin/jsd/jsdcjlrjs/cjjssq`、`/admin/xkgl/xkmdgl/export/batchExport2ExcelByJxbid`、`/admin/xkgl/xkmdgl/export/axzb`、
`/admin/jsd/jsdcjlr/queryCjlrsz/1`、`/admin/jsd/jsdcjlr/toTempCjlrNewPage`、`/admin/cjgl/cjfbgl/xscjxxck`、
`/admin/jsd/jsdcjlr/exportData`、`/admin/jsd/jsdcjlr/cjprint`、`/admin/jsd/jsdcjlr/changeTemplate`、
`/admin/cjgl/cjlrgl/detailPage`、`/admin/jsd/jsdcjlr/sjfx`、`/admin/cjgl/cjjdxkz/checkXz`、
`/admin/cjgl/cjlrgl/createXscjData`、`/admin/kw/kwkssj/getKspcNew`、`/admin/jsd/jsdcjlr/querycjdlr/1`、
`/admin/cjgl/xnxqkfsz/checkAllowToUnlock`

### 4. `/admin/jsd/jsdcjxgsq/list1`（成绩修改）
`/admin/jsd/jsdcjxgsq/listCjxgsq/1`、`/admin/jsd/jsdcjxgsq/toCjxgPage`、`/admin/jsd/jsdcjxgsq/submit`、
`/admin/jsd/jsdcjxgsq/deleteCjxgsq`、`/admin/jsd/jsdcjxgsq/getCjxgjlByJxbid`、`/admin/jsd/jsdcjxgsq/recordDelete`、
`/admin/cjgl/cjxgsjsz/checkCjxgXz`

### 5. `/admin/pkgl/kbcx/bjkb?qx=1`（班级课表）
`/admin/pkgl/pkrwgl/getjsxx`、`/admin/pkgl/kbcx/bjkb/ckbjkb`、`/admin/pkgl/kbcx/bjkb/qryBjxx`、
`/admin/pkgl/kbcx/bjkb/report`、`/admin/api/getSetting`、`/admin/system/jcsj/xnxq/getSfcztqz`、
`/admin/pkgl/kbcx/bjkb/exportbjkbList2`、`/admin/pkgl/kbcx/bjkb/exportbjkbList`、`/admin/pkgl/kbcx/bjkb/isOK`、
`/admin/system/jcsj/zysj/getZyListByBjNjZyYxAuth`、`/admin/system/jcsj/bjxx/getbjxxList1`

### 6. `/admin/jsd/sjfx/list`（试卷分析）
`/admin/jsd/sjfx/jsdlistsjfx`、`/admin/jsd/sjfx`、`/admin/system/jcsj/bmsj/getKkjysList`

### 7. `/admin/xjgl/xsjbxx/xsxxcx`（学生信息查询）
`/admin/xjgl/xsjbxx/xsxxcxListCustom`、`/admin/xjgl/xsjbxx/xsjbxx`、`/admin/xjgl/xsjbxx/xsbjxx`

### 8. `/admin/system/zy/xlgl/queryForXsd`（校历）
`/admin/system/zy/xlgl/exportXl`、`/admin/baseData/exportXlType`、`/admin/system/zy/xlgl/exportNewXl`、
`/admin/system/zy/xlgl/exportXlbb`、`/admin/system/zy/xlgl/exportXlbbToDownloadCenter`、`/admin/zy/xlxx/getBz`、
`/admin/system/zy/xlgl/selectJxzxsj`、`/admin/system/zy/xlgl/selectJxzxsjXq`、`/admin/system/systemxlzc/getZcbzbyxq`、
`/admin/system/zy/xlgl/getData`、`/admin/system/zy/xlgl/selectRows`、`/admin/system/zy/xlyf/updateByZc`、
`/admin/system/zy/xlyf/updateByYf`、`/admin/baseData/weekRemarkEdit`、`/admin/system/zy/xlrq/allXlbz`

### 9. `/admin/jsd/jxrw`（教学任务）
`/admin/jsd/jxrw/reportJsjxrws`、`/admin/jsd/jxrw/exportJsjxrws`、`/admin/jsd/jxrw/ajaxListJsJxrw`、
`/admin/jsd/jxrw/jsdJxrws`、`/admin/xkgl/xkrwgl/export/exportXscjjfcByJxbid`、`/admin/jsd/jxrw/jlnkuDmc`、
`/admin/xkgl/xkrwgl/export/dcjfc`、`/admin/cjgl/cjlrgl/printbbdyReqparamkey`、`/admin/jsd/jxrw/reportjxrws`、
`/admin/jsd/jxrw/changeJxbxx`、`/admin/sz/szjsjbxx/ckkc`、`/admin/api/raqsoft/printbbdyReqparamkey`、
`/admin/xkgl/xkmdgl/export/xsqdbByJxb`、`/admin/xkgl/xkmdgl/export/xsqdbByXzb`、`/admin/jsd/jxrw/confirmJxrw`、
`/admin/jsd/kwglJsdJkcx/jumpJxrwMenu`、`/admin/jsd/jxrw/jxbzc`、`/admin/jsd/kwglJsdJkcx/getZkKsrwByJxbid`、
`/admin/system/attachment/downloadFile`、`/admin/jsd/jxrw/sendIds`、`/admin/pygcgl/pygccxtj/kkxxcxdy/sendIds`

### 10. `/admin/pkgl/pkglcroomkb`（教室课表）
`/admin/pkgl/pkglcroomkb/ckcroomkb`、`/admin/pkgl/pkglcroomkb/ajaxListCustom`、`/admin/pkgl/pkglcroomkb/exportExcel`、
`/admin/pkgl/pkjssz/getJxlList`、`/admin/pkgl/pkglqxzkb/getJcinfo`、`/admin/system/jxzy/jsxx/getjiaosList1`、
`/admin/system/jxzy/jsxx/getjiaosList`、`/admin/pkgl/pkglcroomkb/reportclassroomkb`、
`/admin/pkgl/pkglcroomkb/reportclassroomkb2`、`/admin/pkgl/pkglcroomkb/isOK`

### 11. `/admin/jsd/qxzkb/list3`（全校总课表）
`/admin/system/jcsj/zysj/getZyList`、`/admin/system/jcsj/bjxx/getBjList`、`/admin/system/jcsj/bmsj/getJysListForTeacher`、
`/admin/system/jcsj/bmsj/getKkjysListNoAuth`、`/admin/jsd/qxzkb/skrwprint`、`/admin/pkgl/pkglqxzkb/getJcinfo`、
`/admin/jsd/qxzkb/tjskqk`、`/admin/jsd/qxzkb/queryQxkbPage`、`/admin/jsd/qxzkb/xkrsxq`、
`/admin/jsd/qxzkb/exportDataList`、`/admin/jsd/qxzkb/exportTjxxMx`

### 12. `/admin/system/jxzy/jsxx/toZyKjsPage`（空教室查询）
`/admin/system/jxzy/jsxx/getZyKjs`、`/admin/pkgl/pkgljsjyhmd/checkHmdInTime`、`/admin/pkgl/jyjs/getZcXqJC`、
`/admin/pkgl/jyjs/getXnxqByJcxx`、`/admin/system/jxzy/jsxx/getSzInfo`、`/admin/system/jxzy/jsxx/getZcByXnxq`、
`/admin/system/xtsz/getParam`、`/admin/system/jxzy/jsxx/getXqrqxx`、`/admin/pkgl/jyjs/checkJysjfw`、
`/admin/pkgl/jyjs/checkSxzJs`、`/admin/system/jxzy/jsxx/printData`、`/admin/system/attachment/getFileViewUrl`、
`/admin/system/jxzy/jsxx/getXnxqInformation`

### 13. `/admin/jsd/kwglJsdJkcx/rkjxbkslist`（任课班级考试查询）
`/admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList`

### 14. `/admin/kw/kwhkgl/hkrwcx`（缓考任务查询）
`/admin/kw/kwhkgl/hkmdcxjg`、`/admin/kw/kwhkgl/exportmdcx`、`/admin/xjgl/xsjbxx/getZyxx`、`/admin/xjgl/xsjbxx/getBjxx`

### 15. `/admin/jsd/kwglJsdJkcx`（监考查询）
`/admin/jsd/kwglJsdJkcx/ajaxJsjkList`、`/admin/jsd/kwglJsdJkcx/detail`、`/admin/jsd/kwglJsdJkcx/jumpMenu`、
`/admin/kw/ksap/xsdetail`、`/admin/jsd/kwglJsdJkcx/batchChangeJkjs`、`/admin/jsd/kwglJsdJkcx/changeJkjs`

### 16. `/admin/jsd/jsdcjcx/jsdcjcx`（学生成绩查询）
`/admin/jsd/jsdcjcx/jsdQueryJxbList`、`/admin/jsd/jsdcjcx/jsdxscjck`、`/admin/jsd/jsdcjcx`

### 17. `/admin/pj/xspjxxcx`（学生评教信息查询）
`/admin/pj/xspjxxcx/acustomList`、`/admin/pj/zbmbwh/getZbmbxx`、`/admin/xjgl/xsjbxx/getZyxx`、
`/admin/system/jcsj/bjxx/getBjList`、`/admin/system/dict/getDictList`

### 18. `/admin/jsd/sjgl/sysjList`（剩余试卷）
`/admin/kw/sjgl/exportSysj`、`/admin/jsd/sjgl/ajaxSysj`、`/admin/jsd/sjgl/sjck`、`/admin/kw/kwkssj/getKspc`

### 19. `/admin/jsd/sjgl`（考试任务管理）
`/admin/jsd/sjgl/sjsc`、`/admin/jsd/sjgl/tjsq`、`/admin/jsd/sjgl/ajaxOwnList`、`/admin/jsd/sjgl/getTjsqZdyh`、
`/admin/jsd/sjgl/checkScrq`、`/admin/jsd/sjgl/resetSfbk`、`/admin/kwgl/kspc/getKspc`

### 20. `/admin/pj/xspjjgcx`（学生评价结果查询）
`/admin/pj/xspjjgcx/acustomList`、`/admin/pj/xspjjk/acustomListWwcpjxsExport`、`/admin/pj/xspjjgcx/getZbmbxx`、
`/admin/pj/xspjjgcx/sxxspjjg`、`/admin/pj/xspjjgcx/checkRefresh`、`/admin/system/jcsj/zysj/getZyList`

### 21. `/admin/pj/thpjcx`（同行评教结果查询）
`/admin/pj/thpjcx/exportHzDataAsyn`、`/admin/pj/thpjcx/exportEjDataAsyn`、`/admin/pj/thpjcx/acustomList`、
`/admin/pj/thpjcx/getThpjZbmbList`、`/admin/pj/thpjcx/getExportPyxx`

### 22. `/admin/jsd/gzyjkhdj`（工作业绩考核登记）
`/admin/jsd/gzyjkhdj/saveJsGrsz`（**写型**）

### 23. `/admin/sz/szjsjbxx/queryJsxxFroJsd`（教师卡片）
`/admin/sz/szjsjbxx/queryJsxxFroJsd`

### 24. `/admin/jsd/xskq`（学生考勤统计）
`/admin/jsd/xskq/exportData`、`/admin/jsd/xskq/ajaxListJsJxrw`、`/admin/jsd/xskq/jcwdxskq`、`/admin/jsd/xskq/xswdxskq`

### 25. `/admin/jsd/notice/list`（通知管理）
`/admin/jsd/notice/create`（**写型**）、`/admin/jsd/notice/ajaxList1`、`/admin/jsd/notice/update`（**写型**）、
`/admin/jsd/notice/updateTopping`（**写型**）

### 26. `/admin/system/tzsjx`（通知收件箱）
`/admin/system/tzsjx/ajaxList`、`/admin/system/tzsjx/showdetail`、`/admin/system/tzsjx/collect`（**写型**）、
`/admin/system/tzsjx/deletecollect`（**写型**）、`/admin/workcenter/message/deleteNoticeToRecycleBin`（**写型**）、
`/admin/system/tzsjx/updateState`（**写型**）、`/admin/workcenter/message/batchQxzd`（**写型**）

### 27. `/admin/jwxtgld/jscx/list`（教师查询）
`/admin/jwxtgld/jscx/getJscxYxxx`、`/admin/jwxtgld/jscx/jsxxlist`

### 28. `/admin/xjgl/xsydsq/teacherlist`（学生异动申请）
`/admin/xjgl/xsydsq/teachercreate`（**写型**）、`/admin/xjgl/xsydsq/qryXsydsqByBzr`、
`/admin/xjgl/xsydsq/showDetail`、`/admin/activiti/dbsy/toTaskTrace`、`/admin/xjgl/xsydsq/reApply`（**写型**）、
`/admin/xjgl/xsydsq/cxsq`、`/admin/system/dict/getDictInfo`

### 29. `/admin/activiti/myApply/listMyApply`（我的申请）
`/admin/activiti/myApply/qryMyApply`、`/admin/activiti/myApply/viewDetail`、`/admin/activiti/myApply/chehuiProcessIng`（**写型**）

### 30. `/admin/activiti/dbsy/toDbsyPage`（我的待办）
`/admin/activiti/dbsy/exportDataToDownloadCenter`（**写型**）、`/admin/activiti/dbsy/toPlblPage`、
`/admin/activiti/dbsy/listRunningProcessInstaces`、`/admin/activiti/dbsy/toTaskMain`、
`/admin/checkImage/index`、`/admin/pygcgl/kckkcxxjxdg/wordToPdf`

### 31. `/admin/activiti/myApply/operationApply`（我的经办）
`/admin/activiti/myApply/qryOperationApply`、`/admin/activiti/myApply/viewDetail`、
`/admin/system/fields/doTransFields`、`/admin/activiti/myApply/exportDataToDownloadCenter`（**写型**）、
`/admin/activiti/myApply/printCJXGBB`、`/admin/pygcgl/kckkcxxjxdg/wordToPdf`

## 未纳入页面抓取的菜单（需另行确认）

| 菜单 | 原因 |
| --- | --- |
| 调停补申请 | 前端 SPA（`../fe/#/pkgl/teacherTtbApply`），页面不返回可解析 HTML |
| 教师端工作量 | 前端 SPA（`../../fe/#/workloadManage/eduStat`） |
| 新增公选课开课申请 | 外站 `https://gxkkk.v.chaoxing.com` |
| 导师管理 | 外站 `https://vrknv.v.chaoxing.com` |
| 格子达 | `/admin/api/jumpToGezida`（跳转） |
| 排课管理 `M06` / 学籍管理 `M02` | 父节点为分组，无自身页面 |
| 教师卡片修改 | 页面名即「修改」，**未访问**（写型语义） |
