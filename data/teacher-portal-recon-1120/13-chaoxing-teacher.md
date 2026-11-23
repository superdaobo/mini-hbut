# 13 · 超星学习通（chaoxing）教师身份只读接口勘察

> **只读声明**：本勘察**全程只读**，未执行任何写操作（未发起签到/发布作业/批改/上传/删除/发帖/提交问卷/成绩录入/章节上报）。所有学生姓名/学号/工号/cookie/token 均已脱敏，学生名单只记录字段名与条数。

---

## 一、会话与身份

- 会话文件：`teacher_session_<工号>.json`，`.chaoxing.com` 父域 cookie 全套（`UID/_uid/fid/cx_p_token/p_auth_token/xxtenc/uf/vc3/roleEnc` 等）。
- **教师身份铁证**（`GET mooc1-api.chaoxing.com/mycourse/backclazzdata`）：
  - `channelList[i].content.roletype === 3` 的频道共 **5 个教学班**（学生号为 1）：`2026教创赛专题教学沙龙`(739人)、`土木建筑与环境学院`(231人)、`25建筑学2,25建筑学1`(61人)、`2025教学基本功培训`(81人)、`湖北工业大学`(1546人)。
  - `content.studentcount` 有值；`content.bbsid/chatid` 教师侧有权限。
- **教师课程列表**（`fycourse /fyportal/courselist/getMyCourseJson`）：9 门「我教」课程，`role=1`(主讲)/`role=2`(协作)，每门含 `courseId/courseIdentifier/enc/opencourseenc/studentCount/xqName/teacherFactor`。
- 教师泛雅站点：`hbutsie1.fanya.chaoxing.com`（学生 `hbutsie`）。教务镜像 `hbut.jw.chaoxing.com/admin/login2?role=js`。

---

## 二、教师 vs 学生核心差异（结论）

| 维度 | 学生（ut=s / roletype=1） | 教师（ut=t / roletype=3） |
|---|---|---|
| 工作台导航 | `stu-base-info` → 4 项：章节/图谱/AI工作台/讨论 | `base-info` → `courseNavigationListV3` 7 模块：首页/**教学任务/教学活动/资源中心**/AI助教/**学情统计/课程管理** |
| 进入课程 | `mycourse/studentcourse` → `stu` 页 | `course/isNewCourse?edit=true` → `teachercourse` → `fanyav3/tch` SPA；或 `fycourse/entercoursenewfy?role=3` → `stu` 页 |
| 作业 | `mooc2/work/list` 学生待办 | `task.chaoxing.com/task/index` **任务引擎**（getTaskDataLists）+ `stat2/teach-data/worknum` 统计 |
| 考试 | `exam-ans/mooc2/exam/exam-list` 仅已发布 | 同 URL `ut=t` 可见全部 + `keeper/appeal` 复查链 + `stat2/teach-data/examnum` 统计 |
| 签到 | `student/activelist` 只列活动 | `pcActivelist`（含 `attendNum/releaseNum`）+ `signStat/*` 班级/学生签到率 + `teach-data/sign` |
| 学生成绩 | `study-data/v4/*` 个人数据（教师 ut=s **403**） | `score-data/scoreList` 全班成绩明细 + `initTable` 权重配置 |
| 学习监控 | 无 | `study-monitor/v2/studyList` 全班异常标记（unnormalType） |
| 学情 | `study-data/index` 个人页 | `stat-nav/teach` 6 入口 + `teach-data/*` 20+ 统计端点 + `base-data/v3/*` 14 模块 |
| 班级名单 | 无直接接口 | `scoreList/studyList/get-stucount` 按学生全字段（fid/userName/loginName/userid/personid/group1-3） |
| 活动 | `student/activelist` 参与视角 | `pcActivelist` 管理视角（含 beManagedPlanIds/typeTitle） |

**关键 enc 链**：`fycourse/entercoursenewfy?role=3` → `stucoursemiddle` → `mycourse/stu`，页面内嵌 `enc/oldenc/workEnc/examEnc/openc`，是解锁 `stat2 pEnc`、`work/list enc`、`signStat denc` 的钥匙。

---

## 三、按域分节接口表

### mooc1-api.chaoxing.com（移动 API 入口）

| 接口 | 方法 | 状态 | 说明 |
|---|---|---|---|
| `/mycourse/backclazzdata?view=json&rss=1` | GET | 200 | **教师频道总入口**，`roletype=3` 教学班 + `studentcount` |
| `/mycourse/studentcourse?ut=t` | GET | 302 | 教师也走学生入口链 |

### mooc1.chaoxing.com（旧门户）

| 接口 | 状态 | 说明 |
|---|---|---|
| `/course/isNewCourse?edit=true&enc={enc}` | 302→200 | **教师课程主页链** → `fanyav3/tch` SPA |
| `/mooc-ans/visit/interaction` | 200 | 课程列表页（role=1/2 我教） |
| `/exam-ans/mooc2/exam/exam-list?ut=t` | 200 | **考试列表**（31KB，教师全量） |
| `/mooc2/work/list?stuenc&enc` | 200 | 作业列表（学生式渲染） |
| `/mooc-ans/work/task-list` | 200 | 作业任务列表（学生式） |

### mooc2-ans.chaoxing.com（教师 SPA + 课程管理）

| 接口 | 状态 | 说明 |
|---|---|---|
| `/mooc2-ans-vue/fanyav3/tch` | 200 | **教师工作台 SPA**（需 enc） |
| `/mooc2-ans/coursemanagev3/base-info?view=json` | 200 | **教师导航 JSON**（7 模块） |
| `/mooc2-ans/coursemanagev3/stu-base-info` | 200 | 学生导航（4 项，对照） |
| `/mooc2-ans/coursemanagev3/resource-info` | 200 | 课程资源信息 |
| `/mooc2-ans/mycourse/stu?enc` | 200 | 教师课程主页（内嵌全部 enc） |
| `/mooc2-ans/mycourse/downloadcenter` | 200 | 下载中心 |
| `/mooc2-ans/tcm/course-manage` | **无权限** | ⚠️ HTTP 200 但页面渲染「**该身份无权限进入管理页面**」（Playwright 实点复核，见第七节） |
| `/mooc2-ans/exploration-interaction/sign-maic-enc` | 200 | 签到 enc 换发 |

### mobilelearn.chaoxing.com（活动/班级/签到/资源）

| 接口 | 状态 | 说明 |
|---|---|---|
| `/v2/apis/active/pcActivelist` | 200 | **教师活动列表**（含 attendNum/releaseNum/beManagedPlanIds） |
| `/v2/apis/active/student/activelist` | 200 | 学生活动列表（教师可调） |
| `/v2/apis/class/getClassDetail` | 200 | 班级详情（studentcount） |
| `/v2/apis/class/getClassList?isHaveAuth=1` | 200 | 我管理的班级 |
| `/v2/apis/class/getClassInviteCode` | 200 | 班级邀请码 |
| `/v2/apis/course/getCourseDetail` | 200 | 课程详情 |
| `/v2/apis/resource/getCourseResourceList` | 200 | 课程资源列表 |
| `/v2/apis/yunpan/listYunpanFiles` | 200 | 云盘文件列表 |
| `/page/sign/signStatistics` | 200 | 签到统计页 |
| `/v2/apis/signStat/*` | 200 | 签到率/活动列表/学生汇总（**需 denc/duid**，实测暂无权限） |
| `/v2/apis/sign/getAttendList` | 200 | 签到明细（需 denc/duid） |
| `/signStatApi/getSignPercent` | 200 | 签到率分段（需 signature=md5） |

### stat2-ans.chaoxing.com（教师学情/成绩/监控 —— 最大金矿）

| 接口 | 方法 | 说明 |
|---|---|---|
| `/stat2/stat-nav/teach?ut=t` | GET | **教师学情 6 入口** |
| `/stat2/base-data/v3/{courseInfo,workInfo,examInfo,activeInfo,resInfo,testInfo,bbsInfo,activeLog,selfInfo,agentInfo,aiEvaluateInfo,taskEngineInfo,aiAppTrend,aiAppGroup,knowledgeModel,knowledgeInfo,customSet}` | GET | **17 个课程画像模块** |
| `/stat2/base-data-new/getAiAssistantStatic` | GET | AI 助教静态数据 |
| `/stat2/study-ai/{base-info,welcome/data}` | GET | 学情分析助手 |
| `/stat2/teach-data/{monitor,pv,jobnum,testnum,worknum,examnum,supervise,target,knowledge,points,bbs,bbscloud,wrong-question,score}` | POST | **学情明细 16 个统计端点** |
| `/stat2/teach-data/{videoTest,live,cxclass,groupTask,digital-book,get-stucount}` | GET | 明细补充 |
| `/stat2/teach-data/student/point/sort` | POST | 互动积分排行 |
| `/stat2/chapter-ai/bot/analyze{,/trend,/circular}` | GET | AI 章节问答 |
| `/stat2/ai-practice/stat` | GET | AI 实践统计 |
| `/stat2/ai-evaluate/v2/stat/{clazz-info-portal,load-student-data,student-library-list}` | GET | AI 测评达成率/按学生数据 |
| `/stat2/score-data/{initTable,scoreList}` | GET | **学生成绩：权重配置 + 全班 60 字段明细** |
| `/stat2/study-monitor/v2/studyList` | GET | **学习监控全班列表**（异常标记） |
| `/stat2/study-data/v4/*` | GET | **403**（学生个人数据，教师隔离） |
| `/stat2/supervise/loadCache` | POST | 督学缓存 |
| `/stat2/serverHost/domain` | GET | 域名下发 |

### task.chaoxing.com（任务引擎 = 教师作业/任务中心）

| 接口 | 说明 |
|---|---|
| `/task/index?courseId` | 任务引擎页（137KB Vue3） |
| `/task/getTaskDataLists` | 任务/作业列表（分页/搜索/文件夹） |
| `/task/getCourseDatas` | 可复用课程（8门） |
| `/task/getCourseImportTasks` | 可导入任务 |
| `/task/haveTaskPermission` | 权限校验 |
| `/task/redirectPortal` | 任务类型重定向 |
| `/aitask/listUI` | AI 任务 |
| `/taskStatistics/index` | 任务统计 |
| `/taskPoints/index` | 任务点视频管理 |

### fycourse.fanya.chaoxing.com（教师课程后台）

| 接口 | 说明 |
|---|---|
| `/fyportal/courselist/course` | 新泛雅课程应用页 |
| `/fyportal/courselist/getMyCourseJson` | **教师课程 JSON 全量**（9 门，含 enc） |
| `/fyportal/courselist/getStudyCourse` | 教学班频道列表（含 ckenc/clazzenc） |
| `/fyportal/courselist/entercoursenewfy?role=3` | **教学班进课链**（生成 enc 组） |
| `/fyportal/courselist/getCourseClazz` | 教务关联教学班（参数严格） |
| `/fyportal/courselist/getCourseDetail` | 课程详情（参数严格） |
| `/fyportal/courselist/getstudyprogress` | 学习进度（需 ckenc） |
| `/fyportal/courselist/getCourseTeacher` | 教学团队（jwid 形态待解） |
| `/fyportal/common/api/getAllSemesters` | 学期列表（14 学期） |

### 其它域

| 接口 | 说明 |
|---|---|
| `groupweb.chaoxing.com/course/topic/topicList?ut=t&bbsid` | 讨论列表（需 bbsid） |
| `notice.chaoxing.com/apis/other/getNoticeList?type=0` | 收件箱（含真实教务调课通知） |
| `notice.chaoxing.com/pc/notice/myNotice?s=` | 收件箱页 |
| `pan-yz.cldisk.com/pcuserpan/index?s=` | 云盘页 |
| `live.chaoxing.com/courseLive/personLiveRoomManager?s=` | 直播管理 |
| `i.chaoxing.com/base` | 个人空间（s 令牌 + vkb 教务平台入口） |
| `contactsyd.chaoxing.com/pc/contacts/*` | 通讯录（参数待解） |
| `xueyinonline.chaoxing.com/schoolcourseInfo/teachingclassmanage` | 学银班级管理（本课程无权限） |
| `hbut.jw.chaoxing.com/admin/*` | 教务镜像（教师 role=js 已通） |
| `vkb.jw.chaoxing.com/admin/api/xxtlogin` | 虚拟仿真教学平台入口 |

---

## 四、需 Referer / 特殊头 / 会话预热的接口

| 接口 | 要求 |
|---|---|
| `mobilelearn /v2/apis/signStat/*`、`/v2/apis/sign/getAttendList` | **需 `signStatistics` 页暖会话 + `denc/duid`**（denc 验证失败=缺正确 enc） |
| `stat2 /stat2/teach-data/*`（POST） | `Content-Type: application/x-www-form-urlencoded`；`ut=t` 必需 |
| `stat2 /stat2/score-data/*`、`study-monitor`、`study-ai`、`ai-evaluate`、`ai-practice`、`chapter-ai` | `ut=t` 必需 |
| `mobilelearn /v2/apis/class/getClassList` | 需 `courseId`（教学班频道 id 无效，需教师课程 courseId） |
| `fycourse /fyportal/courselist/*` | 多数需 `Referer: /fyportal/courselist/course` + 暖 session；`getCourseClazz/getCourseDetail/getstudyprogress` 参数校验严格 |
| `task.chaoxing.com/task/index` | `courseId` 必须驼峰（`courseid` 无效→courseId=null） |
| `mooc2-ans/mycourse/stu`（教师版） | `enc` 必需（来自 entercoursenewfy 链） |

---

## 五、未覆盖项 / 待解

1. **`denc/duid` 生成**：`signStat/*`、`getAttendList` 报「暂无权限/denc验证失败」。`clazzenc`（getStudyCourse）与 `enc/stuenc` 均不符。推测 `denc = md5(duid+salt)` 或需从 `signStatistics` 页完整跳转链取。后续可用 Playwright 打开 `signStatistics` 页抓 denc。
2. **`getCourseClazz/getCourseDetail/getstudyprogress/getCourseTeacher`**：`fycourse` 参数校验「请求参数失效」，需精确 `uid/ckenc/jwid` 组合。
3. **`contactsyd` 通讯录 API**：`getDeptUsers/getCircleMembers/getChatgroupMembers` 参数形态未解。
4. **`stat2-vue/*` 懒加载路由后端 API**：`resource/learn-situation/taskEngine/teachingOperation` 等 SPA 内部 API 在 chunk 中，已用 Playwright 抓部分（base-data/teach-data/score-data/study-monitor），`resource` 等页面 API 未完全展开。
5. **`mobilelearn /v2/apis/class/{getTeachers,getHasPermissionTeacherAndClass,getClazzMembers}`、`/v2/apis/{activePlan,discuss,feedback,groupDiscuss}`**：实测 500/暂无权限，参数或 `denc` 待解。
6. **`work/list` 教师批改视图**：`mooc2/work/list` 带 enc 后仍渲染学生待办，教师「待批改列表」接口未定位（可能在 `task.chaoxing.com` 或 `exam-ans` 的批改子页）。
7. **`exam-ans` 试卷/批改详情**：`exam-list` 页内 `keeper/appeal` 复查链已见，但「试卷列表/批改队列」接口未单独挖。
8. **`hbut.jw.chaoxing.com` 教师教务端**：`/admin/login2?role=js` 已通，但教师教务子接口（排课/成绩录入等）未展开（涉写风险，本任务只读边界内未深探）。

---

## 六、原始数据

- 逐接口原始 JSON：`raw/chaoxing-teacher-probe.json`（82 条记录，已脱敏）
- 中间证据（HTML/JSON skeleton）：`data/teacher-portal-recon-1120/scratch/w*.html|json`

---

## 七、Playwright 实点复核（2026-11-20 19:15，Lead）

用 Playwright 注入教师 cookie 后**真实点击**教师工作台，补齐纯 HTTP 探不到的页面级事实。

### 7.1 从「我教的课」进课程的真实链路

```
GET  mooc1.chaoxing.com/visit/interaction                    「我教的课」tab，卡片带 courseId + enc
  →  mooc1.chaoxing.com/mooc-ans/coursecontroller/isNewCourse?courseId={cid}&edit=true&enc={enc}&v=2&cpi={cpi}&baseEducation=0
  →  （新标签）mooc2-ans.chaoxing.com/mooc2-ans-vue/fanyav3/tch?courseId&clazzId&cpi&enc&v=6&perspectiveType=0&ut=t
```

**`fanyav3/tch` 是教师工作台 SPA**，左侧 6 个模块 + iframe 内嵌功能区。

### 7.2 点菜单后各功能的真实 frame URL

| 点击 | 实际加载的 URL | 数据形态 |
| --- | --- | --- |
| 作业 | `mooc2-ans/mooc2-ans/work/list?courseid&clazzid&cpi&enc&ut=t` | **服务端渲染 HTML**（无 XHR），空态直接渲染「新建作业 / 作业库 / 全部班级 / 暂无作业 / 回收站」 |
| 考试 | `mooc2-ans/mooc2-ans/exam/test?courseid&cpi&enc&ut=t` | **服务端渲染 HTML**（无 XHR），「新建考试 / 试卷库 / 监考 / 暂无考试 / 回收站」 |
| 章节 | `mooc2-ans/mooc2-ans/mycourse/tchcourse?courseid&clazzid&cpi&enc&openc&ut=t` | **JSON API**：`mycourse/tchcourselist?temp&courseid&clazzid&cpi&searchChapterListByName=&flag=0` |
| 学情统计 | `stat2-ans.chaoxing.com/stat2-vue/statistics?courseId&clazzId&cpi&v=6&perspectiveType=0&ut=t` | JSON：`stat2/stat-nav/teach?courseid&clazzid&cpi&enc=&ut=t&sv=3&perspectiveType=0` + 内嵌 `study-ai/index` |
| AI 学情 | `stat2-ans.chaoxing.com/study-ai/index?courseid&clazzid&cpi&ut=t&new=true&sv=3` | JSON：`stat2/study-ai/welcome/data`、`stat2/study-ai/base-info`（`pEnc` 可空） |
| **课程管理** | `mooc2-ans/mooc2-ans/tcm/course-manage?...&ut=t` | ⚠️ **页面渲染「该身份无权限进入管理页面」** —— 教师身份进不去 |

### 7.3 工作台首页（`fanyav3/tch`）加载的 10 个接口

```
GET  /mooc2-ans/coursemanagev3/base-info?courseId&clazzId&cpi&navId=-1&pageHeader=-1&view=json
GET  /course-ans/ai/recentVisitModuleList?courseId&clazzId&cpi&ut=t&version=v4
GET  /mooc2-ans/fanya3/t/todoList?courseId&cpi
GET  stat2-ans/stat2/ai-study-alert/v3/board?courseid&clazzid&cpi&ut=t
GET  stat2-ans/stat2/ai-study-alert/v3/high-risk?courseid&clazzid&cpi&ut=t
GET  /teaching-alert/stat/ai-evaluate?courseid&clazzid&cpi
GET  /mooc2-ans/exam/test/exam-progress-reminder?courseid&cpi
GET  /mooc2-ans/work/teaching-alert?courseid&cpi
GET  /course-ans/ai/favoriteAgentList?courseId&cpi&clazzId&roleType=0
POST stat2-ans/stat2/ai-study-alert/v3/student-details
POST /course-ans/ai/aiCourseWorkbenchVisitLog
```

### 7.4 三条对实现有决定性的结论

1. **作业/考试是服务端渲染页，不是 JSON API** —— 想接这两个功能，要么解析 HTML，要么直接 WebView 内嵌页面；不存在「干净的作业列表 JSON」。
2. **教师进不了「课程管理」** —— `tcm/course-manage` 只对管理员/超管开放，教师侧的班级/学生管理入口在 `stat2`（`scoreList`/`studyList`）而不是这里。
3. **`enc` 是每次进课动态生成的，且一次性** —— 纯 HTTP 复用旧 enc 会失效；必须每次从 `isNewCourse` 或 `entercoursenewfy` 重新换。这也解释了为什么盲猜 `work/list` 一直返回「提示」。

### 7.5 交互坑

- 教师工作台有**新手引导遮罩**（`.guide-mask` / `.nav-guide-inner`），会拦截所有点击；自动化时必须先移除或改 DOM click。
- 作业/考试菜单点击会**开新标签**，不是同页跳转。
