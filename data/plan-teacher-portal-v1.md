# 教师端登录 + 教师课表（第一版）—— 逆向取证与落地方案

> 取证时间：2026-10-08
> 取证方式：MCP 浏览器真实登录（教师测试账号，工号 <教师工号>），抓包 + 页面 JS 分析
> 目标：教师与学生共用同一个 App，但提供两个登录入口；第一版重点落地「教师课表」，并隐藏学生专属功能

---

## 一、结论速览

1. **门户层无需区分教师/学生**。新融合门户登录页的输入框本身就是「请输入学号/工号」，教师工号走的是**完全相同的 CAS 接口与表单**（`POST /authserver/login`）。因此后端 CAS 登录代码可直接复用，教师端登录的差异**只体现在入口 UI 与登录之后的身份判定**。
2. **教师身份可从教务系统直接识别**，无需猜测：`POST /admin/getMenuList` 的每个节点都带 `currentRoleId`（教师 = `"js"`）、`currentUserName`（工号）、`currentJsId`、`currentDepartmentId`；顶层页 `/admin/?loginType=1` 还服务端渲染了 `#roleId`、`.admin_name`（工号）、`.arrowbt`（姓名）。
3. **教师课表有独立接口**：`GET /admin/pkgl/pkgljskb/getJskbByXqid`，返回结构与学生接口不同，**不能直接复用现有学生课表解析器**。
4. **`djs` 字段语义与学生端不同**（教师端 = 大节号，不是连堂数），这是本次最大的实现陷阱，已在 §3.4 给出证据与结论。
5. **App 现有的会话引导接口对教师会直接失败**（`/admin/xsd/xsjbxx/xskp` 返回「登录用户所属身份类型不是学生」），因此教师端必须走新的身份/引导路径。

---

## 二、逆向取证结果（真实抓包）

### 2.1 CAS 登录：教师与学生同接口

登录页 `https://auth.hbut.edu.cn/authserver/login`（标题「统一身份认证平台」），账号输入框占位符为 **「请输入学号/工号」**。

提交表单 `form#pwdFromId`（action=`/authserver/login`，method=POST）：

| 字段 | 说明 |
| --- | --- |
| `username` | 学号/工号 |
| `passwordText` | 明文密码（仅前端输入框） |
| `password` | 隐藏域，= AES(明文, `pwdEncryptSalt`)，提交时由 JS 计算 |
| `captcha` | 验证码 |
| `lt` | 登录票据（实测可为空） |
| `execution` | `e2s1` |
| `cllt` / `dllt` | `userNameLogin` / `generalLogin` |
| `_eventId` | `submit` |

真机实测提交体（密码已脱敏）：

```
username=<教师工号>&password=<AES密文>&captcha=3KDV&_eventId=submit
&cllt=userNameLogin&dllt=generalLogin&lt=&execution=e2s1
```

响应链：`POST /authserver/login → 302` → `GET /authserver/index.do → 302` → `.../login?service=... → 302` → `...?ticket=ST-2157548--...` → 落地。

> ✅ 与本地 `http_client/auth.rs::build_cas_login_form` / AES 加密 / `lt` 容错逻辑一致 —— **教师账号可直接复用现有 CAS 登录**。

验证码：`GET /authserver/getCaptcha.htl?<时间戳>`（80×30 JPEG）。
> ⚠️ 该端点**每次请求都会重新生成并写入会话**。App 现有实现「取一次图 → 同一份字节送 OCR」是正确的；调试时若多次取图会导致「看到的图 ≠ 会话里的图」。

### 2.2 教师身份识别

**来源 A（推荐，JSON，稳定）**：`POST /admin/getMenuList`

```json
[{"currentUserId":"<教务用户ID>",
  "userRoleId":"<用户角色ID>",
  "dataAuth":true,"dataXnxq":"2026-2027-1",
  "currentRoleId":"js",                          // ← 身份类型：js = 教师
  "currentJsId":"<教务教师ID>",  // ← 教师ID（与课表数据 ztid 一致）
  "currentUserName":"<教师工号>",                  // ← 工号
  "currentDepartmentId":"205",
  "id":"M1600","name":"我的申请","children":[...]}]
```

**来源 B（服务端渲染，兜底）**：`GET /admin/?loginType=1` 页面 HTML

```html
<input id="roleId" type="hidden" value="js">        <!-- 身份类型 -->
...
<p><span class="admin_name"><教师工号></span><span class="arrowbt"><教师姓名></span></p>
<!--                ↑ 工号                          ↑ 姓名 -->
```

**来源 C（教师课表页，`teacherId` 唯一来源）**：`GET /admin/pkgl/pkgljskb/queryKbForJsd`

```html
<input type="hidden" id="teacherId" value="<加密teacherId:WGEyQ0…>">
<input type="hidden" id="xnxq" value="2026-2027-1">
```

> `teacherId` 为服务端加密 ID（`WGEyQ0…` 前缀），**未发现可客户端构造的算法**，需从该页 HTML 中抓取。该页标题为「教师端个人课表-Powered by ChaoXing」。

### 2.3 教师课表接口（核心）

```
GET /admin/pkgl/pkgljskb/getJskbByXqid
    ?xnxq=2026-2027-1        // 学年学期
    &id=<teacherId>          // §2.2 来源 C 抓取
    &xqdm=                   // 校区代码（空=全部；"1"=本部）
    &isjsd=0
    &sftqz=0                 // 是否提前周 0/1
    &xsqbkb=0
    &zc=                     // 周次（空=全部）
```

响应：

```json
{"ret":0,"msg":"操作成功","data":[ { …一条记录 = 某个课程在某个小节的一次排课… } ]}
```

单条记录字段（实测样本，已标注用途）：

| 字段 | 示例 | 用途 / 备注 |
| --- | --- | --- |
| `kcmc` | `<a …>计算机制图与表达-1</a>` | 课程名（**含 HTML**，需 strip） |
| `kcid` / `kcbh` | `20605005A` | 课程代码 |
| `encodeKcid` | `<加密ID:WGEyQ0…>` | 课程加密 ID |
| `jxbid` | `d7fad7022b66492a93e754e2b30da0dc` | 教学班 ID |
| `jxbbh` | `202613844` | 教学班编号 |
| `jxlmc` | `2号` / `5号` | 教学楼 |
| `tmc` / `zjsname` | `<教师姓名>` | 授课教师 |
| `croommc` | `<a …>2-209</a>` | 教室名（**含 HTML**） |
| `croombh` | `2-209` / `5B-704` | 教室编号 |
| `xingqi` | `1` | 星期几（1..7） |
| `djc` | `7` / `8` | **小节号（1..11）** ← 见 §3.4 |
| `djs` | `4` | **大节号（1..6）= ceil(djc/2)** ← 见 §3.4 |
| `zc` | `7` / `8-14` | 周次（紧凑文本） |
| `zcstr` | `7` / `8,9,10,11,12,13,14` | 周次（**展开数组文本，可直接解析**） |
| `zctype` | `0` / `1` / `2` | 周类型：0=全周，1=单周，2=双周 |
| `xf` / `zongxs` | `1` / `16` | 学分 / 总学时 |
| `jxbzc` | `<a …>26建筑学1</a>,<a …>26建筑学2</a>` | 教学班（班级名，**含 HTML、逗号分隔**） |
| `bjrs` / `jxbrs` / `xkrs` | `62` | 班级人数 / 教学班人数 / 选课人数 |
| `jslxmc` | `多媒体` | 教学类型 |
| `kkxq` / `xqmc` / `xqid` | `本部` / `1` | 校区 |
| `jslxmc`/`szlc`/`jxlmc` | `2号`/`2` | 楼栋/楼层 |
| `pkid` | `5a6e6d83cd58ef0ce065000000000001` | **排课唯一 ID（可用于去重）** |
| `id` | `9e90407965e048af9662bf5a6dd28cc9` | 同一次查询内**所有记录相同**，不可作唯一键 |
| `name` | `计算机制图与表达-1【上机】3844` | 课程全名（含教学班编号） |
| `ztid` / `currentJsId` | `<教务教师ID>` | 教师 ID |

### 2.4 节次时间设置与周次

```
GET /admin/api/getZclistByXnxq?xnxq=2026-2027-1&role=&userId=&xqid=
```
返回 `data.jcsjszList`（节次时间设置），实测：

| jc | 起止 | djs | sjd |
| --- | --- | --- | --- |
| 1 | 8:20–9:05 | 1 | sw |
| 2 | 9:10–9:55 | 1 | sw |
| 3 | 10:15–11:00 | 2 | sw |
| 4 | 11:05–11:50 | 2 | sw |
| 5 | 14:00–14:45 | … | … |

> 两点重要印证：
> 1. `djs` 在节次设置表里同样表现为 **大节号**（jc=1,2 → djs=1；jc=3,4 → djs=2），与 §3.4 结论一致。
> 2. 这些时间与 App 前端 `features/schedule/constants.ts:54-66` 的 `timeSchedule` **完全一致**（1 节 08:20–09:05、2 节 09:10–09:55、3 节 10:15–11:00、4 节 11:05–11:50、5 节 14:00–14:45）。`sjd`（sw/…）对应上午/下午/晚上分组。

### 2.5 教师端可用的其他接口（供后续版本）

教师账号下可用的菜单（来自 `getMenuList`，URL 形如 `/admin/indexMain/<ID>`）：

- 我的申请 `M1600`
- **我的课表 `M160101`** ← 第一版
- 成绩管理 `M1606`
- 排课管理 `M06`
- 班级课表
- 试卷分析 `M1607`
- 信息查询 `M1601`
- 教师端工作量
- 学生考勤统计（老师）
- 导师管理 / 通知管理
- 移动端 `M23`

教师课表页内出现的相关接口：
`/admin/pkgl/pkgljskb/queryKbForJsd`（页面）、`/admin/pkgl/pkgljskb/getJskbByXqid`（数据）、`/admin/api/getZclistByXnxq`（周次+节次）、`/admin/api/getRqListByWeek`、`/admin/pkgl/pkgljskb/jskbprint`（打印）、`/admin/pkgl/pkglkckb/openKcKbPage`（课程课表）、`/admin/pkgl/pkglcroomkb/ckcroomkb`（教室课表）、`/admin/pkgl/kbcx/bjkb/ckbjkb`（班级课表）。

### 2.6 教师账号下**不可用**的接口（重要）

| 接口 | 教师账号返回 | 影响 |
| --- | --- | --- |
| `/admin/xsd/xsjbxx/xskp` | 错误页：「获取学生基本信息出错或登录用户所属身份类型不是学生」 | **App 现有 `fetch_user_info` 会失败** → 会话引导必须改 |
| `/admin/xsd/pkgl/xskb/queryKbForXsd` | 错误页（报错啦） | App 现有 `xhid` 探测不可用 |
| `/admin/xsd/pkgl/xskb/sdpkkbList` | `{"ret":-1,"msg":"功能暂时停用，请联系管理员"}` | 学生课表接口不可用于教师 |

> 结论：教师端**不能复用**现有的学生会话引导（`session.rs::fetch_user_info`）与学生课表抓取（`academic/schedule.rs::fetch_schedule`），需要独立的教师分支。

### 2.7 校历 / 当前周次（可复用）

```
GET /admin/xsd/jcsj/xlgl/getData/2026-2027-1
```
教师账号下**正常返回**逐周日期数组（`{xnxqh, ny, zc, monday…sunday, …remark}`），格式与 App 现有 `http_client/academic/semester.rs` 期望一致。

> 教师课表页显示「当前周次：第 6 周」，与上述校历可推算的周次一致 → **当前周次/开学日期逻辑可复用现有实现**。

### 2.8 一个待确认的发现：多角色切换

顶层页面存在 `continueRoleSwitch`、`cyjsClick`、`setCyjs`、`/admin/system/usermanage/roleCache` 等痕迹，说明教务系统**支持同一账号在多个身份间切换**（例如既是教师又是学生的账号）。第一版不处理该场景，但需在设计中预留（见 §6 风险）。

---

## 三、与本地实现的对照（差异清单）

| 维度 | 学生端（现状） | 教师端（新增） |
| --- | --- | --- |
| 身份字段 | 无角色概念，全部按学号硬编码 | 需新增角色维度：`student` / `teacher` |
| 身份来源 | `UserInfo{student_id, student_name, college, major, class_name, grade}`（`transport/tauri/auth.rs:35-43`） | 教师：`{工号, 姓名, department_id, js_id}`；工号取自 `#roleId`/`getMenuList` |
| 会话引导 | `fetch_user_info` → `/admin/xsd/xsjbxx/xskp`（`http_client/session.rs:563`） | 教师该接口报错 → 需新引导（`getMenuList` + `queryKbForJsd`） |
| 课表接口 | `/admin/xsd/pkgl/xskb/sdpkkbList`（`academic/schedule.rs:142-157`） | `/admin/pkgl/pkgljskb/getJskbByXqid` |
| 课表前置 | 需先探测 `xhid`（`queryKbForXsd`） | 需先抓 `teacherId`（`queryKbForJsd`） |
| `djc` | 起始节 | 小节号（**逐小节返回**） |
| `djs` | 连堂数 | **大节号 = ceil(djc/2)** ⚠️ |
| 单双周 | 从 `zc` 文本 `(单)/(双)` 后缀解析（`parser.rs:549-589`） | 直接给 `zctype`（0/1/2）+ `zcstr` 展开周次 |
| 数据行粒度 | 一条 = 一个课程块（假设） | **一条 = 一个小节**；跨大节的课会返回 2 行（需去重） |
| 学生专属字段 | — | 新增：`班级人数`、`教学类型`、`教学班编号`、`班级名列表` |
| 存储 key | keyring `mini-hbut` / `user_sessions` 表 / `hbu_username`，均按学号 | 必须带角色区分，否则工号与学号可能撞 key |

### 3.4 关键证据：`djs` = 大节号（非连堂数）

同一教师、三个学期实测 `(djc/djs)` 组合：

| 学期 | 出现的 (djc/djs) | 课程条数 |
| --- | --- | --- |
| 2026-2027-1 | `7/4`、`8/4` | 4 |
| 2025-2026-1 | `1/1`、`2/1`、`3/2`、`4/2` | 8 |
| 2025-2026-2 | `1/1`、`2/1`、`3/2`、`4/2`、`5/3`、`6/3`、`7/4`、`8/4` | 20 |

**若 `djs` 是「连堂数」**：`djc=4, djs=2` 会跨大节 2–3（不合理，且与 `djc=3,djs=2` 重叠）。
**若 `djs` 是「大节号」**：`1,2→1`；`3,4→2`；`5,6→3`；`7,8→4` —— 三学期全部自洽 ✅

另两点旁证：
1. `getZclistByXnxq` 的节次设置表里，`djs` 同样呈「每两小节一个大节号」。
2. 参考页 JS 中**只使用 `djc`**（`#Cell<周几><djc>`），`djs` 完全未被使用 —— 说明它只是派生的大节编号。

> 因此教师端应：以 `djs` 定位大节；把大节 N 映射为 App 的 `period = 2N-1`、`djs(连堂) = 2`（大节 6 为 `period=11`、`djs=1`）；并按 `(name/jxbbh + weekday + 大节 + zc + croombh + zctype)` 去重掉同大节的重复行。

---

## 四、第一版范围

### ✅ 做

1. 登录页新增**教师端入口**（与学生端并列的两个入口，可切换）。
2. 教师走**同一 CAS 账号密码 + OCR 验证码**流程（复用现有登录链路）。
3. 登录后识别身份为教师，进入**教师模式**。
4. **教师课表**落地到现有课表页面：学期切换、周次、当前周、单双周、教室、教学楼、班级名与人数、教学类型、学分、总学时。
5. 教师模式下**隐藏学生专属功能**：成绩查询、考试安排、学习通（超星）相关内容、以及所有依赖学号的功能。
6. 云同步：教师模式保留（自定义课程 + 个人日程），但**不同步/不展示学业成绩类数据**。

### ❌ 第一版不做

- 成绩管理 / 成绩录入、排课管理、班级课表、试卷分析、教师端工作量、学生考勤统计、导师管理、通知管理等（仅登记为后续版本候选）。
- 多角色账号的运行时切换。
- 教师课表的打印/导出（可选，视工作量）。

---

## 五、设计要点

### 5.1 角色维度（贯穿全链路）

引入 `IdentityRole`：`student` | `teacher`。

- **登录入参**：`login(username, password, captcha, lt, execution, role)`。
- **身份判定**：登录成功后不依赖入口选择，**以教务系统返回为准**（`getMenuList.currentRoleId` / `#roleId`）：
  - `js` → teacher
  - 其他（学生预期 `xs`，待学生账号实测确认）→ student
  - 入口选择与实测不一致时，以实测为准并提示用户。
- **会话存储 key 加角色前缀**，避免工号/学号撞 key：
  - keyring：`hbut:<role>:<id>`（现有 `hbut:` 需兼容既有数据）
  - `user_sessions` 表：主键改为 `(role, id)` 或新增 `role` 列 + 迁移
  - localStorage：`hbu_username` → 带角色；新增 `hbu_login_role`

### 5.2 后端

- 新增教师分支（**不污染**学生路径）：
  - `http_client/teacher/`（或 `academic/teacher_schedule.rs`）：`fetch_teacher_identity()`、`fetch_teacher_schedule(semester)`
  - 解析器 `parse_teacher_schedule()`：独立实现 §3.4 的大节映射与去重
- 教师 `ScheduleCourse` 复用现有结构，扩展可选字段（`class_size`、`teach_type`、`class_no`）—— 保持向后兼容（`Option`/默认值）。
- 会话引导：教师走 `getMenuList` + `queryKbForJsd`，**绕过** `/admin/xsd/xsjbxx/xskp`。
- 命令/路由：复用 `sync_schedule` 语义，按当前角色分派；新增角色查询命令（如 `get_identity_role`）。

### 5.3 前端

- 登录页：新增「教师端 / 学生端」入口切换（新增登录模式，不破坏 `portal_password` / `chaoxing` 现有模式与持久化契约）。
- 课表页：数据源按角色分派；教师模式下调整卡片信息密度（班级名+人数、教学类型）。
- 功能可见性：新增统一的「角色能力表」（capability matrix），把成绩/考试/学习通等入口按角色隐藏，避免散落各处的 `v-if`。
- i18n：新增教师端文案 key（`login.role.*`、`teacher.*`），同步 zh-CN / en / ja 并过 `i18n_coverage.spec.ts`。

---

## 六、风险与未决问题

| # | 风险 / 未决 | 处理 |
| --- | --- | --- |
| R1 | `djs` 语义差异若被忽略，教师课表会整体错位/卡片高度错误 | 独立解析器 + 契约单测（用 §3.4 三学期真实样本做 fixture） |
| R2 | 学生端 `djs` 是否也是大节号（若是，现有学生课表可能存在既存渲染偏差） | 需学生账号实测一次；本版不动学生逻辑，仅登记 |
| R3 | `teacherId` 无客户端构造算法，依赖抓取 `queryKbForJsd` HTML | 接受抓取；若该页结构变动需容错与降级提示 |
| R4 | 学生角色标识（预期 `xs`）未实测 | 以「非 `js` 即学生」做保守判定 + 学生账号实测后收紧 |
| R5 | 多角色账号（教师+学生）角色切换 | 第一版不处理，仅确保不崩溃；后续版本评估 |
| R6 | 云同步在教师模式下同步了学生语义数据 | 明确 payload 白名单：仅自定义课程 + 个人日程 |
| R7 | 工号与学号撞存储 key 导致串号 | 角色前缀 + 迁移脚本 + 契约测试 |
| R8 | 教师账号下 OCR/验证码链路 | 已验证验证码端点一致，无需改动 |
| R9 | 教师课表节次时间（6 大节/11 小节）与 App `timeSchedule` 一致性 | 已实测一致（§2.4），无需改表 |

---

## 七、验证方式

1. **契约单测**：以本文件 §2.3 / §3.4 的真实响应做 fixture，断言 `djc/djs → period/djs(连堂)` 映射与去重结果。
2. **角色判定单测**：`getMenuList` / `#roleId` 的多种取值（`js`、学生值、缺失）→ 角色判定与兜底。
3. **存储隔离单测**：同一账号不同角色、不同账号同角色，keyring / SQLite / localStorage 互不串扰。
4. **真机联调**：教师测试账号登录 → 教师课表与教务系统页面逐格比对（2026-2027-1 第 6 周）。
5. **能力表单测**：教师模式下成绩/考试/学习通入口确实不可见。
6. **回归**：学生端登录、课表、云同步全部现有测试保持通过（`vue-tsc` / vitest / cargo test）。

---

## 八、回滚方案

- 教师入口与教师分支以**独立提交**落地；新增代码路径不影响学生分支。
- 角色维度若出现不可控问题，可通过「隐藏教师入口」的单一开关快速回退（前端 capability 表 + 后端角色分派各留一处开关）。
- 存储迁移（key 加角色前缀）必须**向前兼容**：保留旧 key 读取路径，写入新 key；迁移失败不阻塞登录。
