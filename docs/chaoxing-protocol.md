# Chaoxing Protocol Notes

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
