# Chaoxing Protocol Notes

## 收件箱 / 通知（2026-07-22 jshook 抓包）

```
GET https://notice.chaoxing.com/apis/other/getNoticeList
  ?type=2
  &crossOrigin=true
  &pageSize=50
  &lastGetId={上一页 data.notices.lastGetId}   # 首页省略
```

- `type=2`：我收到的通知  
- 响应：`{ result: 1, data: { notices: { list: [...], lastGetId } } }`  
- 分页：用返回的 `lastGetId` 继续请求，直到 `list` 为空或 id 不变  
- App：`school_inbox` 在 `login_mode=chaoxing` 时多页同步（最多 20 页 ≈ 1000 条）  
- 注意：学习通收件箱页必须强制 `login_mode=chaoxing`；门户模式只拉教务 tzsjx

课程列表：

```
POST https://mooc1.chaoxing.com/mooc-ans/visit/courselistdata
Content-Type: application/x-www-form-urlencoded
Body: courseType=1&courseFolderId=0&superstarClass=0
→ HTML 片段（课程卡片）
```

### 课程中心学期筛选（fyportal，2026-08-01 实测）

湖工大定制平台（`fycourse.fanya.chaoxing.com`）的课程中心支持真实学期筛选，App 课程中心已对接：

1. **学期列表**：`GET https://fycourse.fanya.chaoxing.com/fyportal/courselist/course?version=1&s=null`（带 `.chaoxing.com` cookie）返回的 HTML 中，`<select name="xq">` 服务端渲染全部学期：

```html
<select name="xq" class="dept_select">
  <option value="0">全部</option>
  <option value="43811" semesternum="20261" selected="true">2026-2027第一学期</option>
  <option value="38370" semesternum="20252">2025-2026第二学期</option>
  ...
</select>
```

- `value` = sectionId（切换学期请求参数）
- `semesternum` = 学年学期码（20261/20252/20251…）
- `getFolderList?type=1` 接口返回 `{"data":[]}`，**不可用**，学期数据源是页面 HTML

2. **切换学期**：`GET https://fycourse.fanya.chaoxing.com/fyportal/courselist/getStudyCourse?sectionId={sectionId}&semesterNum=&coursesource=0&coursename=&searchkkstatus=0&belongSchoolId=0` → HTML 课程卡片 `<li class="w_couritem" state="0|1" cid courseId classid clazzId personId=cpi ckenc cname>`；同一课程可出现在多个学期，归属由服务端按 sectionId 决定。

Rust 实现：`online_learning.rs` `fetch_fyportal_semester_options` / `fetch_fyportal_courses_by_section` / `parse_fyportal_*`，在 `fetch_chaoxing_courses_remote` 中与 backclazzdata 结果按 `courseId:clazzId` 合并，返回 `semesters` + 每课 `semester`。

---

## Auth（门户 SSO，禁止二次登录）

App 内学习通会话优先：

1. `HbutClient` 门户 CAS 已登录（`is_logged_in`）
2. `try_bridge_cas_to_chaoxing`：`AUTH_BASE/login?service=https://fysso.chaoxing.com/cassso/hbutsie` → FYSSO 链 → 种 `.chaoxing.com` cookie
3. `ensure_chaoxing_session_ready` / cookie 传播到 `mooc1` / `mobilelearn` / `pan-yz`

**MVP 不实现** passport 账号密码登录主路径；失败提示重登门户。

---

## 邀请码入班（2026-07-12 逆向，Web i.chaoxing.com）

实测邀请码：`73202625` → 课程「库来西库」/ 教师「周金阳」  
`courseId=264356359` `clazzId=148246853` `cpi≈509967218` `userId≈406591160`

### 1) 解析邀请码

```
POST https://i.chaoxing.com/base/getInviteCode
Content-Type: application/x-www-form-urlencoded
Body: invitecode={code}&_t={timestamp}

Response JSON:
{
  "status": true,
  "flag": 0,
  "url": "http://mooc1.chaoxing.com/addcourse/pcqrcodemiddleview?inviteCode=...&enc=...&checkEnc=1"
}
```

- `flag=0`：课程入班中间页（url）
- `flag=1`：应用类邀请
- `flag=2`：直接打开 url

### 2) 中间页 HTML（入班凭证）

```
GET {url from step 1}
```

页面 hidden 字段：

| id | 含义 | 示例 |
|----|------|------|
| courseId | 课程 id | 264356359 |
| clazzId | 班级 id | 148246853 |
| inviteCode | 邀请码 | 73202625 |
| addclzenc | 入班 enc | 8b602bc2… |
| addclztimeStamp | 时间戳 | 1783844344019 |
| cpi | 人员关系 id（中间页可能为 0） | 0 |

展示：课程名、教师名、封面图。

### 3) 接受入班

```
GET http://mooc1.chaoxing.com/mooc-ans/teachingClassPhoneManage/phone/participateCls
  ?courseId={courseId}
  &classId={clazzId}
  &enc={addclzenc}
  &timeStamp={addclztimeStamp}
  &inviteCode={inviteCode}

Response JSON: { "result": 1, ... }  // 1=成功；否则 errorMsg
```

成功后跳转课程页（示例）：

```
http://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu
  ?courseid=...&clazzid=...&cpi=...&enc=...&t=...
```

---

## 班级资料（资料 Tab）

### 列表页（服务端渲染 HTML）

```
GET https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist
  ?courseid={courseId}
  &clazzid={clazzId}
  &cpi={cpi}          # 必须用课程页真实 cpi，勿写死 0
  &ut=s
  &t={ms}
  &stuenc={enc from course page}
```

进入普通文件夹（`type=afolder`，JS `changeFolder`）：

```
.../stu-datalist?courseid=...&dataName={encodeURIComponent name}&dataId={folderDataId}
  &type=1&parent={parentIds}&clazzid=...&enc=...&ut=s&t=...&cpi=...
```

列表项在 `ul.dataBody_td`：

| 属性/特征 | 含义 |
|-----------|------|
| `id` | dataId |
| `objectid` | 云盘 objectId（预览用） |
| `dataname` / `type` / `isdown` | 名称/扩展名/可否下载 |
| `type=tch-courseware` | **教师课件**虚拟夹（无 id），点击 `toCourseware()` |
| `type=afolder` | 普通文件夹 |
| 下载链 | `mooc1.../coursedata/downloadData?dataId&classId&cpi&courseId&ut=s` |

教师课件入口（非 stu-datalist 子目录）：

```
{mobilelearnDomain}/page/ppt/studentCourseware/studentCoursewareList
  ?courseId={courseId}&classId={clazzId}
```

`mobilelearnDomain` 默认 `https://mobilelearn.chaoxing.com`。

### 官方预览（禁止裸开 CDN origin）

```
GET https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/get-preview-url
  ?dataId={dataId}&cpi={cpi}&clazzid={clazzId}&ut=s&courseid={courseId}

Response JSON:
{
  "status": true,
  "url": "https://pan-yz.chaoxing.com/preview/v2/objectshowpreview.html?puid=...&objectid=...&fn=xxx.mp4&...&signature=..."
}
```

- 网页端 iframe 内嵌该 `url`（图片/视频/文档）
- 文档类也可能走 `/ananas/modules/pdf/mooc2-resource-index.html` + previewUrl
- **不要**默认用 `https://p.ananas.chaoxing.com/star3/origin/{objectId}` 作主预览（无签名/无 cookie →「资源不存在/无权限」）
- **列表缩略图**（对齐网页）：`https://p.ananas.chaoxing.com/star3/150_150c/{objectId}`
- **客户端图片预览**：WebView iframe **不共享** Rust `reqwest` CookieJar，对图片应优先：
  1. `ananas/status/{objectId}` 返回的 `http(s)` 直链
  2. 带会话 cookie 下载 `downloadData` 转 `data:image/...;base64,...` 用 `<img>` 直显
  3. 勿对图片只塞黑底 iframe 加载 `objectshowpreview`

### 视频播放（2026-08-01 实测修正）

1. **状态接口**：`GET https://mooc1.chaoxing.com/ananas/status/{objectId}?k={fid}&flag=normal&ro=0&_dc={ts}`，返回 `http` 字段 = 带签名直链（`sd.mp4?at_=..&ak_=..&ad_=..`）+ `dtoken`（进度上报用）+ `download` 字段
2. **⚠️ 直链有 Referer 防盗链**：cldisk CDN 无 chaoxing Referer 时返回 **403**。App WebView `<video>` 直链播放必失败 → 必须经 Rust 本地代理 `http_server.rs /proxy/video?url={直链}`（带学习通 cookie + `Referer: mooc1.chaoxing.com`，透传 Range）播放
3. **⚠️ 官方 ananas 播放器带参 URL 已废弃**：`index.html?objectid=&fid=&isPhone=true` 在新版 JS（v2026-0710+）初始化即抛 TypeError、零请求、永久「正在为您加载文件」。网页端现在用**无参** `index.html?v=2026-0721-1025` + 父页 postMessage 传数据（`knowledge/cards` 页内嵌）。App 不再兜底官方播放器
4. 播放中伴随请求：`richvideo/initdatawithviewerV2?mid=&cpi=&classid=&courseid=`（可能返回 `[]`）、`ananas/getpoints`、`richvideo/allsubtitle`、`multimedia/log`（进度上报，`dtoken` + `enc` 签名）
- **SSO 缓存**：`chaoxing_sso` 进程内 TTL 与浏览器「关浏览器才丢 cookie」不同；cookie 仍有效时应探针复用，勿短 TTL 误杀

可预览类型（JS `previewType`）：  
`ppt/pptx/pdf/doc/docx` + 多种视频 + `txt/mp3/xls/xlsx/m4a` 等。

实测根列表（库来西库）：教师课件夹 + 2×jpg + 1×mp4；`cpi=509967218`。

---

## 签到（既有）

### mobilelearn.chaoxing.com/v2/apis/active/student/activelist
### mobilelearn.chaoxing.com/newsign/preSign
### mobilelearn.chaoxing.com/pptSign
### mooc1-api.chaoxing.com/mycourse/backclazzdata
### pan-yz.chaoxing.com/upload

---

## App 命令映射（MVP）

| Tauri command | 作用 |
|---------------|------|
| `chaoxing_class_ensure_sso` | 门户 CAS → 学习通桥接自检 |
| `chaoxing_class_preview_invite` | 邀请码预览（不入班） |
| `chaoxing_class_accept_invite` | 接受邀请入班 |
| `chaoxing_class_list_resources` | 班级资料列表 |
| `chaoxing_class_resolve_resource` | 资料预览/下载 URL |

前端入口：首页模块「学习通」→ `ChaoxingClassView`（`currentView === 'chaoxing_class'`）。

---

## Upstream Sync Log

| Date | Source | Diff summary |
|------|--------|--------------|
| 2025-06-10 | course_helper | 签到五类端点 |
| 2026-07-12 | MCP Web 逆向 i.chaoxing + mooc1/mooc2 | 邀请码入班 + 资料列表/下载 |
| 2026-07-12 | app wiring | `chaoxing_class` 模块 + 首页入口 + 契约测试 |
