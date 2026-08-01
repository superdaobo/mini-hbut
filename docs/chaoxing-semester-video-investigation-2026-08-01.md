# 学习通课程中心 Bug 实况调查笔记（2026-08-01）

> 对应 GitHub Issue: https://github.com/superdaobo/mini-hbut/issues/524
> 调查方式：Playwright 实测（门户 SSO → 学习通课程中心 → 章节视频）
> 账号：杨道博 2510231106（电气与电子工程学院 25通信1）

## 一、Bug 1：学期筛选缺失

### 网页端真实机制（实测）

1. **课程中心页面**：`https://fycourse.fanya.chaoxing.com/fyportal/courselist/course?version=1&s=...&space_token=...`（在 i.chaoxing.com/base 的个人空间 iframe 内）
2. **学期列表是服务端渲染在课程页 HTML 里的 `<select name="xq">`**，不是接口返回（`getFolderList?type=1` 返回 `{"data":[]}` 空数据，不可用）
3. select 选项结构（当前账号实测 15 个学期）：

```html
<select name="xq" data-placeholder="全部" class="dept_select">
  <option value="0">全部</option>
  <option value="43811" semesternum="20261" selected="true">2026-2027第一学期</option>
  <option value="38370" semesternum="20252">2025-2026第二学期</option>
  <option value="35140" semesternum="20251">2025-2026第一学期</option>
  <option value="27353" semesternum="20242">2024-2025第二学期</option>
  <option value="24511" semesternum="20241">2024-2025第一学期</option>
  <option value="19919" semesternum="20232">2023-2024第二学期</option>
  <option value="15800" semesternum="20231">2023-2024第一学期</option>
  ...（2022~2019 学期省略）
</select>
```

   - `value` = sectionId（如 43811/38370/35140）
   - `semesternum` 属性 = 学年学期码（20261/20252/20251）
   - 文本 = 「2026-2027第一学期」等

4. **切换学期请求**（切到 sectionId=24511 实测）：

```
GET https://fycourse.fanya.chaoxing.com/fyportal/courselist/getStudyCourse
  ?sectionId=24511&semesterNum=&coursesource=0&coursename=&searchkkstatus=0&belongSchoolId=0&_=...
```

   - 注意 `semesterNum` 为空，学期完全由 `sectionId` 决定
   - 响应：HTML 课程卡片列表（`<ul class="course-list"><li class="w_couritem" ...>`）

5. **课程卡片 `<li>` 属性**（全部/单学期请求返回同构 HTML）：

```
<li class="w_couritem clearfix"
    state="0"            # 0=进行中 1=已结课（封面显示「本课程已结课」）
    kcenc="..."          # 课程加密
    ckenc="..."          # 课程跳转加密（entercoursenewfy 用）
    clazzenc="..."
    personId="487811746" # = cpi
    cid="254673763"      # courseId
    classid="125938817"  # clazzId
    cname="军事理论"     # 课程名
    source="0">
  <a href='/fyportal/courselist/entercoursenewfy?role=3&courseId=...&clazzId=...&cpi=...&ckenc=...'>
  <img src="https://p.ananas.chaoxing.com/star3/origin/xxx.jpg">
</li>
```

6. 实测结果：sectionId=0（全部）返回 23 门；sectionId=35140（20251）返回 7 门（军事理论、高数、思道法×2、劳育、安全教育、人工智能通识课[已结课]）；sectionId=24511（20241）返回空。**同一课程可出现在多个学期**（如军事理论 20251+当前），课程归属由服务端按 sectionId 决定。

### 现有 App 实现差距

- `src-tauri/src/modules/online_learning.rs`：
  - `chaoxing_fetch_courses`（L2256）→ `fetch_chaoxing_courses_remote`（L1809）：用 `mooc1-api.chaoxing.com/mycourse/backclazzdata`（通用学习通接口），channelList **无学期字段** → `guess_semester_label`（L1435）猜不出就标「未分学期」
  - `fetch_chaoxing_folder_courses`（L1541）：试探 `getCourseFolders` API + `visit/courselistdata`，folder 名当学期名（常是「历史课程」「课程夹 N」）——与网页端真实学期机制**完全不同**
- 前端 `ChaoxingHubView.vue` 已有学期 tab 框架（semesterTabs + activeSemester 过滤 L196-200、L363-387），只需后端提供正确学期数据

### 修复方向（Bug 1）

Rust 端 `fetch_chaoxing_courses_remote` 增加 fyportal 数据源：
1. `GET https://fycourse.fanya.chaoxing.com/fyportal/courselist/course?version=1&s=null`（带 .chaoxing.com cookie），正则/HTML 解析 `<select name="xq">` 选项 → 学期列表 `[{sectionId, semesterNum, label}]`
2. 对 sectionId=0（全部）及各学期逐个 `GET getStudyCourse?sectionId=X&semesterNum=&coursesource=0&coursename=&searchkkstatus=0&belongSchoolId=0`，解析 `<li>` 课程卡片（cid/classid/personId/ckenc/cname/state）
3. 返回 `semesters`（label 列表）+ 每门课 `semester` 归属；与 backclazzdata 结果按 courseId:clazzId 去重合并
4. 前端 semesterTabs 直接可用；「本学期」由 semesternum 与当前日期推断（或取默认选中项）

## 二、Bug 2：视频播放卡死

### 网页端真实播放链路（实测）

1. 进入章节：`mooc1.chaoxing.com/mycourse/studentstudy?chapterId=...&courseId=...&clazzid=...&cpi=...&enc=...`
2. 知识卡片页 `mooc-ans/knowledge/cards` 内每个视频一个 iframe 播放器：**src = `https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0721-1025`（无 objectid/fid 参数，数据经父页 postMessage 传入）**
3. 播放器请求（带 cookie 会话 + `k=25368` fid）：

```
GET https://mooc1.chaoxing.com/ananas/status/{objectId}?k=25368&flag=normal&ro=0&_dc={ts}
→ 200 JSON:
{
  "length": 34398924, "duration": 124,
  "dtoken": "e88bb7eb...",
  "http": "https://s2.cldisk.com/sv-s2/video/2d/d9/cf/{objectId}/sd.mp4?at_=...&ak_=...&ad_=...",
  "download": "http://d0.cldisk.com/download/{objectId}?at_=...&ak_=...&ad_=...",
  "mp3": "...", "screenshot": "...", "filename": "运动学习题1.mp4",
  "status": "success"
}
```

4. 直链 `http` 字段 = 带签名（at_/ak_/ad_）的 sd.mp4 地址
5. 播放中额外请求：`richvideo/initdatawithviewerV2?mid=...&cpi=...&classid=...&courseid=...`（返回 []）、`ananas/getpoints`、`richvideo/viewpic`（缩略图）、`richvideo/allsubtitle`（字幕）、`multimedia/log`（进度上报）

### 直链 403 根因（实测验证）

对直链（带签名）做 fetch 对比：

| 请求方式 | 结果 |
|---|---|
| 无 Referer（`referrer: ''`） | **403 Forbidden**（text/html 拦截页） |
| Referer = `https://mooc1.chaoxing.com/` | **200 OK** `video/mp4`（7.7MB） |

→ **cldisk.com 视频 CDN 有 Referer 防盗链**。App 内 `<video>` 直接播直链时 Referer 是 App 自身 origin（`tauri://localhost` / `capacitor://localhost` 等）→ 403 → 直链播放失败 → 触发 `onVideoError` 切官方播放器。

补充：UA 不影响（ChaoXingStudy UA vs Chrome UA 返回相同直链）；`k=0` vs `k=25368` 不影响直链字段。

### 官方播放器卡死根因（实测复现）

`https://mooc1.chaoxing.com/ananas/modules/video/index.html?objectid=...&fid=25368&isPhone=true`（App 当前拼的 URL）直接打开：

- 页面停留「正在为您加载文件...」**永不加载**
- Console 报错：`TypeError: Cannot read properties of null (reading 'getAttribute')` at `index.js?v=2026-0710-1840:1:4207` (config → loadVideo)
- **没有任何 ananas/status 网络请求发出**

→ 新版官方播放器 JS（v=2026-0710-1840+）**不再支持 URL query 传参模式**（objectid/fid/isPhone），必须用 `index.html?v=2026-0721-1025`（无参数）+ 父页 postMessage 传数据。App 拼的旧式带参 URL 直接初始化失败，永远卡在「正在为您加载文件」。

### 现有 App 实现差距

- `ChaoxingHubView.vue` `openVideo`（L656-697）：`playerUrl` = `index.html?objectid=...&fid=...&isPhone=true`（L673-676）→ 必卡死
- `onVideoError`（L771-789）：直链耗尽切 usePlayer=true → iframe 加载上述死 URL
- `online_learning.rs` `chaoxing_get_video_status`（L4191-4297）：能拿到直链（http 字段），但直链在 App WebView 被 Referer 防盗链拦截
- docs/chaoxing-protocol.md L165 已记录「WebView iframe 不共享 Rust reqwest CookieJar」——官方播放器兜底即使 URL 正确也会因无 cookie 失效

### 修复方向（Bug 2，待对齐后定稿）

**方案 A（推荐）：Rust 端本地流式代理**
- `http_server.rs` 新增路由 `GET /proxy/video?url={直链}`：reqwest 带 `Referer: https://mooc1.chaoxing.com/` + 学习通 cookie 拉直链，`stream` 响应体转发（支持 Range，`<video>` 拖动需要）
- 前端 `openVideo` 拿直链后把 `<video src>` 指向 `http://127.0.0.1:4399/proxy/video?url=...`（Web/远程模式经 HTTP Bridge 同构）
- 优点：确定性绕开 Referer 防盗链 + cookie 不共享；支持 Range 拖动；不暴露签名 URL
- 缺点：视频流经本地端口转发（性能可接受，局域网/本机）

**方案 B：前端 fetch+blob 播放**
- 前端 `fetch(direct, { referrer: 'https://mooc1.chaoxing.com/' })` → blob → `<video src=blobURL>`
- 风险：跨域 CORS 头实测为空（浏览器环境无 ACAO 仍成功，Tauri WebView 行为可能不同）；大视频全量下载内存占用高；不支持拖动 Range（需 fetch Range 分片，复杂）
- 不推荐作为主方案，可作 Web 端备选

**方案 C：修官方播放器 URL + postMessage 协议**
- 需要逆向 index.js 的 postMessage 协议（objectid/fid/mid 等字段），脆弱且依赖学习通前端
- 不推荐

## 三、验证标准（对齐网页端）

- [ ] 课程中心「全部」+ 真实学期 tab（2026-2027第一学期 … 2019-2020），课程正确归属，无「未分学期」
- [ ] 视频直链可播（本地代理），官方播放器兜底不再卡「正在为您加载文件」
- [ ] 拖动进度、播放进度上报（multimedia/log）不回归

## 四、附：关键请求清单（Playwright 抓包索引）

| # | 请求 | 用途 |
|---|---|---|
| 218 | GET fycourse.fanya.chaoxing.com/fyportal/courselist/getFolderList?type=1 | 学期文件夹（data 为空，废弃） |
| 219 | GET .../getStudyCourse?sectionId=0&semesterNum=... | 全部课程（23 门） |
| 241 | GET .../getStudyCourse?sectionId=24511 | 2024-2025 第一学期（空） |
| 242 | GET .../getStudyCourse?sectionId=35140 | 2025-2026 第一学期（7 门） |
| 1298 | GET mooc1.chaoxing.com/ananas/status/1f397c...?k=25368&flag=normal&ro=0 | 视频状态+签名直链 |
| 1392 | GET .../richvideo/initdatawithviewerV2?mid=... | 播放器数据（返回 []） |
| 1957 | GET .../multimedia/log/... | 播放进度上报 |

截图：`.playwright-mcp/evidence-player-stuck.png`（官方播放器卡「正在为您加载文件」）
