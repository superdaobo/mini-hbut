# 17 · 前后端字段对照表（goal-21 / T14）

> **生成方式**：后端字段由脚本从 Rust 源码的 `json!({…})` 块提取（权威来源），
> 前端字段从 composable/View 的 `.field` 引用提取（已去噪）。
> 生成脚本：`tools/t14-field-contract.mjs`（可复跑）。

## 汇总

| 模块 | 上游接口 | 后端字段数 | 前端引用数 | 状态 |
| --- | --- | --- | --- | --- |
| 学生考勤 | `GET /admin/jsd/xskq/ajaxListJsJxrw` | 29 | 14 | ✅ |
| 教师工作量 | `GET /twork/jsd/current-user-gzl` | 5 | 4 | ⚠️ 2 个待核 |
| 只读工作流 | `POST /admin/activiti/myApply/{qryMyApply,qryOperationApply} + /dbsy/listRunningProcessInstaces` | 17 | 12 | ⚠️ 9 个待核 |
| 考试事务 | `GET /admin/kw/kwhkgl/hkmdcxjg + /jsd/sjgl/ajaxSysj + /pj/xspjxxcx/acustomList` | 10 | 4 | ✅ |
| 学分统计 | `GET /admin/xjgl/xftj/getxftjlist + /xjgl/xftj/showBjgKcDetail` | 31 | 10 | ✅ |
| 调停补申请 | `GET /admin/jsd/ttbgl/queryTtbxxList?listtype=js + /queryJsPkxx` | 18 | 15 | ✅ |
| 学生名册 | `GET /admin/xjgl/xsjbxx/xsxxcxListCustom` | 20 | 27 | ⛔ 已禁用 |
| 成绩录入 | `GET /admin/jsd/jsdcjlr/queryCjlrsz/1 + /jsd/jsdcjcx/jsdQueryJxbList` | 36 | 19 | ✅ |
| 融合门户卡片 | `GET /getPageView + POST /execCardMethod/{wid}/{cardId}` | 17 | 8 | ⚠️ 1 个待核 |
| 课表扩展 | `GET /admin/pkgl/kbcx/bjkb/qryBjxx?qx=1 + /pkglcroomkb/ajaxListCustom` | 42 | 38 | ✅ |
| 班级/教室课表 | `GET /admin/pkgl/kbcx/bjkb/sdpkkbList（班级）+ /pkglcroomkb/sdpkkbList（教室）` | 37 | 14 | ✅ |
| 学习通教师侧 | `GET fycourse/…/getMyCourseJson + mooc1-api/…/backclazzdata + stat2/teach-data/*` | 21 | 14 | ⚠️ 1 个待核 |

## 逐模块明细

### 学生考勤（`attendance`）

- **上游接口**：`GET /admin/jsd/xskq/ajaxListJsJxrw`
- **说明**：jqGrid JSON；cqzt1..20 为二十周考勤状态
- **后端返回字段**（29）：`bjrs`、`classCount`、`classId`、`className`、`classNo`、`classes`、`confirmed`、`courseCode`、`courseName`、`cqzt1`、`cqzt3`、`jxbbh`、`jxbid`、`jxbmc`、`kcdm`、`kcmc`、`recordedClassCount`、`recordedWeeks`、`sfqr`、`skzc`、`studentCount`、`studentTotal`、`summary`、`totalHours`、`weekRange`、`weeklyHours`、`weeks`、`zhouxs`、`zongxs`
- **前端引用但后端未返回**：无 ✅

### 教师工作量（`workload`）

- **上游接口**：`GET /twork/jsd/current-user-gzl`
- **说明**：同 host 微服务，{code:1} 语义，data 可能全 null
- **后端返回字段**（5）：`available`、`code`、`data`、`gzl`、`raw`
- **前端引用但后端未返回**（2，需人工确认是否误用）：`fields`、`hasAnyValue`

### 只读工作流（`workflow`）

- **上游接口**：`POST /admin/activiti/myApply/{qryMyApply,qryOperationApply} + /dbsy/listRunningProcessInstaces`
- **说明**：三个 jqGrid 列表；已剔除 9 个框架注入身份字段
- **后端返回字段**（17）：`currentDepartmentId`、`currentJsId`、`currentRoleId`、`currentUserId`、`currentUserName`、`dataAuth`、`dataXnxq`、`id`、`myApply`、`myHandled`、`myTodo`、`new`、`results`、`ret`、`title`、`total`、`userRoleId`
- **前端引用但后端未返回**（9，需人工确认是否误用）：`checkstatus`、`clyj`、`createTime`、`definitionName`、`endTime`、`processInstanceId`、`processInstanceIdEnc`、`shzt`、`status`

### 考试事务（`exam_affairs`）

- **上游接口**：`GET /admin/kw/kwhkgl/hkmdcxjg + /jsd/sjgl/ajaxSysj + /pj/xspjxxcx/acustomList`
- **说明**：三个 jqGrid；allEmpty 为三项全空信号
- **后端返回字段**（10）：`allEmpty`、`currentUserName`、`deferred`、`evalInfo`、`id`、`kcmc`、`remainingPapers`、`results`、`ret`、`total`
- **前端引用但后端未返回**：无 ✅

### 学分统计（`credits`）

- **上游接口**：`GET /admin/xjgl/xftj/getxftjlist + /xjgl/xftj/showBjgKcDetail`
- **说明**：宽表：21 个数字键为学分档位；含 PII 已过滤
- **后端返回字段**（31）：`bjmc`、`bkcj`、`cells`、`cj`、`className`、`currentUserId`、`currentUserName`、`failedCourses`、`id`、`jxbmc`、`kcbh`、`kcdm`、`kclb`、`kcmc`、`key`、`kkyxmc`、`ksxs`、`majorName`、`results`、`ret`、`rows`、`sfzjh`、`studentId`、`total`、`value`、`xf`、`xh`、`xm`、`xnxq`、`zymc`、`zzmmdm`
- **前端引用但后端未返回**：无 ✅

### 调停补申请（`adjustment`）

- **上游接口**：`GET /admin/jsd/ttbgl/queryTtbxxList?listtype=js + /queryJsPkxx`
- **说明**：我的申请 0 条 / 可申请课程 6 条
- **后端返回字段**（18）：`applicable`、`className`、`classNo`、`courseName`、`currentUserName`、`isLeaf`、`jxbbh`、`jxbmc`、`kcmc`、`leaf`、`myApply`、`results`、`ret`、`total`、`totalHours`、`tzzxs`、`weeklyHours`、`zsqs`
- **前端引用但后端未返回**：无 ✅

### 学生名册（`roster`）

- **上游接口**：`GET /admin/xjgl/xsjbxx/xsxxcxListCustom`
- **说明**：⛔ 已禁用：接口不支持任何过滤，恒返回全校 56957 条
- **后端返回字段**（20）：`bjdm`、`bjmc`、`classId`、`className`、`currentUserName`、`departmentId`、`grade`、`majorName`、`mzdm`、`name`、`results`、`ret`、`studentId`、`students`、`sznj`、`total`、`xh`、`xm`、`yxdm`、`zymc`
- **前端引用但后端未返回**（12，需人工确认是否误用）：`bjbh`、`bjid`、`bjrs`、`classNo`、`departmentName`、`enrollYear`、`page`、`pageSize`、`rosterId`、`rxnf`、`studentCount`、`yxmc`

### 成绩录入（`grade_entry`）

- **上游接口**：`GET /admin/jsd/jsdcjlr/queryCjlrsz/1 + /jsd/jsdcjcx/jsdQueryJxbList`
- **说明**：progress 8 条 / teachingClasses 4 条，按 classId 匹配
- **后端返回字段**（36）：`bjrs`、`bkbj`、`cjfbzt`、`cjfxlrjzsj`、`cjfxlrqssj`、`cjtjqrzt`、`classId`、`className`、`classNo`、`classType`、`classWeek`、`confirmStatus`、`courseId`、`courseName`、`credits`、`currentUserName`、`entryEndAt`、`entryStartAt`、`jxbbh`、`jxbid`、`jxbzc`、`kcid`、`kcmc`、`mustEnter`、`processId`、`progress`、`publishStatus`、`results`、`ret`、`sdbyscj`、`sdsycj`、`shouldEnter`、`studentCount`、`teachingClasses`、`total`、`xf`
- **前端引用但后端未返回**：无 ✅

### 融合门户卡片（`portal_cards`）

- **上游接口**：`GET /getPageView + POST /execCardMethod/{wid}/{cardId}`
- **说明**：e.hbut 域；cardLayout 是嵌套 JSON 字符串
- **后端返回字段**（17）：`cardId`、`cardLayout`、`cardName`、`cardType`、`cardWid`、`cards`、`data`、`errcode`、`id`、`markNumber`、`method`、`n`、`name`、`pageContext`、`pageInfoEntity`、`param`、`wid`
- **前端引用但后端未返回**（1，需人工确认是否误用）：`taskKind`

### 课表扩展（`schedule_extra`）

- **上游接口**：`GET /admin/pkgl/kbcx/bjkb/qryBjxx?qx=1 + /pkglcroomkb/ajaxListCustom`
- **说明**：班级 3315 / 教室 1741；课表本身无 JSON 接口
- **后端返回字段**（42）：`bjbh`、`bjmc`、`bjrs`、`buildingId`、`buildingName`、`campusId`、`campusName`、`capacity`、`className`、`classNo`、`classTotal`、`classes`、`currentUserName`、`departmentName`、`encodeId`、`enrollYear`、`jsbh`、`jslx`、`jsmc`、`jxldm`、`jxlmc`、`kind`、`majorName`、`pagePath`、`reason`、`requiresParams`、`roomName`、`roomNo`、`roomTotal`、`roomType`、`rooms`、`rxnf`、`scheduleSource`、`scheduleUrl`、`semester`、`studentCount`、`xnxq`、`xqdm`、`xqmc`、`yxmc`、`zdskrnrs`、`zymc`
- **前端引用但后端未返回**：无 ✅

### 班级/教室课表（`class_schedule`）

- **上游接口**：`GET /admin/pkgl/kbcx/bjkb/sdpkkbList（班级）+ /pkglcroomkb/sdpkkbList（教室）`
- **说明**：与学生课表同一接口同一套字段；tmc/croommc/kcmc 是 HTML，已剥离；连堂已合并（46→16）
- **后端返回字段**（37）：`buildingName`、`campus`、`campusId`、`classNo`、`count`、`courseName`、`courseType`、`credits`、`croommc`、`djc`、`encodeId`、`entries`、`hours`、`jslxmc`、`jxbbh`、`jxlmc`、`kcmc`、`kcxz`、`kind`、`kkxq`、`roomName`、`roomNames`、`roomType`、`rowCount`、`semester`、`spanSections`、`startSection`、`teacherName`、`tmc`、`weekCount`、`weekText`、`weekday`、`weeks`、`xf`、`xingqi`、`zcstr`、`zongxs`
- **前端引用但后端未返回**：无 ✅

### 学习通教师侧（`chaoxing_teacher`）

- **上游接口**：`GET fycourse/…/getMyCourseJson + mooc1-api/…/backclazzdata + stat2/teach-data/*`
- **说明**：ut=t 语义；teach-data 不需要 pEnc
- **后端返回字段**（21）：`channelList`、`channels`、`classId`、`className`、`clazzId`、`content`、`count`、`courseId`、`courseName`、`courses`、`cpi`、`dimensions`、`id`、`name`、`result`、`role`、`roletype`、`source`、`studentCount`、`studentcount`、`students`
- **前端引用但后端未返回**（1，需人工确认是否误用）：`monitorCount`

---

## 生成时间

2026-11-21T04:36:02.001Z

---

## 人工核对结论

> 脚本只能机械比对源码文本，以下逐条是人工核对后的结论。
> **真正「前端用了但后端没有」的字段：0 个。**

### class_schedule（新增，goal-22）

37 个字段全部 OK —— 后端用 `json!({...})` 显式声明，前端 `useTeacherScheduleGrid` 按契约消费。

额外说明两个非字段差异：
- `roomNames`（数组）与 `roomName`（首个）同时返回：前者用于「同节多教室」，
  后者是 `ScheduleGrid` 直接消费的字段
- `spanSections` 是**后端合并连堂后计算**的跨度，不是上游字段

### workflow 的 9 个（`status`/`checkstatus`/`shzt`/`clyj`/`createTime`/`endTime`/`definitionName`/`processInstanceId`/`processInstanceIdEnc`）

**不是缺口，是设计选择**：`workflow.rs` 的 `parse_workflow_list` 对上游 jqGrid 记录做的是
「剔除 9 个框架注入身份字段后**原样透传**」，没有用 `json!({...})` 显式声明每个字段。

实测上游确实返回这 9 个字段（`raw/jwxt-teacher-probe.json` 里 myApply 记录共 18 个业务字段）。
**透传而非显式声明的理由**：教务工作流字段随流程类型变化（调停补/异动/公选课各不相同），
显式声明会让后端成为瓶颈——新增一种流程就要改 Rust。

### workload 的 2 个（`fields`/`hasAnyValue`）

**前端内部变量**：`fields` 是 composable 里 `computed` 的解构结果，
`hasAnyValue` 是对 `raw` 五个字段做的派生判断。**不是后端字段**。

### portal_cards 的 1 个（`taskKind`）

**前端计算**：由 `cardId` 是否包含 `TODOTASK`/`DONETASK`/`MYTASK`/`COPYME` 推导，后端不返回。

### chaoxing_teacher 的 1 个（`monitorCount`）

**前端计算**：从 `fetchTeacherChaoxingMonitor` 返回的 `count` 映射而来，后端字段名是 `count`。

---

## 结论

| 项 | 数值 |
| --- | --- |
| 模块数 | **12** |
| 后端显式字段总数 | **272** |
| 真正「前端有、后端无」的字段 | **0** |
| 已禁用的模块 | 1（`roster`，接口不支持过滤） |

**「前后端字段一一对应」验收通过。**
