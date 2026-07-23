# 智慧迎新协议归档（只读）

> **Issue**：#460  
> **抓取状态**：无现场学号凭据，本档以功能盘点 + 融合门户惯例 + 学工体系常见落地形态撰写，**所有未实测路径均标注 ASSUMPTION**。  
> **范围**：**只读**展示（消息、班导师、辅导员、宿舍、个人信息等）。填报/提交/上传 **本 Epic 不做**。  
> **隐私**：样例学号/姓名/手机/身份证已脱敏；仓库禁止写入真实密码。

---

## 1. 门户入口（PC / 手机）

### 1.1 已观测线索（仓库内）

| 来源 | 内容 |
|------|------|
| `docs/feature-inventory/00-overview.md` | 热门服务含 **学工一体化**；办事大厅「综合」有「**学生工作一体化服务平台**」 |
| `docs/feature-inventory/03-yimatong-features.md` | 移动办事大厅「综合」另有学工入口：**智慧宿管 / 迎新 / 学管 / 离校**（非一码通内核） |
| `docs/feature-inventory/04-gap-matrix.md` | 学工一体化记为 P2 外链缺口 |

### 1.2 推荐入口链（操作步骤）

1. 浏览器登录融合门户学生端：`https://e.hbut.edu.cn`（经 `https://auth.hbut.edu.cn/authserver` CAS）。
2. **PC**：办事大厅 → 主题「综合」→「学生工作一体化服务平台」或搜索「迎新 / 智慧迎新」。
3. **手机端门户**：办事大厅「综合」→「迎新」类入口（页面实际文案可能为「智慧迎新」「迎新服务」等）。
4. 进入落地系统后，遍历只读 Tab/卡片（消息、班导师、辅导员、宿舍、个人信息），在 Network 中记录 **GET/JSON 成功响应**；跳过 POST 提交类。

### 1.3 入口 URL 候选（ASSUMPTION）

| 候选 | 说明 |
|------|------|
| `https://e.hbut.edu.cn/stu/index.html#/` | 学生门户首页 |
| 门户应用中心跳转 | 应用 code / appId 待 MCP 实测补全 |
| `https://e.hbut.edu.cn/login#/` | 未登录时门户登录壳 |

---

## 2. Base URL 候选与 SSO

### 2.1 Base URL 候选（按优先级尝试）

> 下列 host/path **尚未用真实会话实测**；后端实现应按序探测，成功者写入运行日志并优先复用。

| 优先级 | Base（ASSUMPTION） | 备注 |
|--------|-------------------|------|
| A | `https://xg.hbut.edu.cn` | 学工域常见命名 |
| B | `https://yx.hbut.edu.cn` | 迎新域常见命名 |
| C | `https://e.hbut.edu.cn` 下学工/迎新 path | 若嵌在融合门户 SPA |
| D | 学工一体化落地域（金智/WISEDU 类） | Cookie 名可能含 `COM.WISEDU.CASP.*`（见 `docs/portal-session.md`） |

### 2.2 SSO 模式（与成绩等模块同一体系）

```
用户登录 Mini-HBUT
  → HbutClient CookieJar（CASTGC / happyVoyage / 门户 cookie）
  → GET auth.hbut.edu.cn/authserver/login?service=<迎新系统回调 URL>
  → 302 带 ticket → 迎新系统落会话 cookie
  → 后续只读 API 复用 jar
```

要点：

- **不**单独实现迎新账号密码登录；只复用融合门户 / CAS 会话。
- Cookie 持久化沿用 `docs/portal-session.md` 的 jar → SQLite 路径；若实测出现新 host，在持久化域表追加一行（后续 issue）。
- 会话失效判据：最终 URL 含 `authserver/login`，或 HTTP 401/302 到登录页，或业务码表示未登录。

---

## 3. 只读 API 列表（契约）

> 路径为 **ASSUMPTION 候选**；字段字典为 **前端/后端稳定 DTO 契约**。  
> 实测后：保留 DTO，仅替换 path/parser；fixtures 同步更新。

### 3.1 通用约定

| 项 | 约定 |
|----|------|
| Method | 只读一律 `GET`（列表/详情） |
| Header | `Accept: application/json`；`X-Requested-With: XMLHttpRequest`（门户同源 XHR 风格） |
| Cookie | 门户/CAS/迎新落地 cookie（经 CookieJar） |
| 成功 | HTTP 2xx + JSON；`code` 为 `0`/`200`/`"0"` 或无 code 直接 data |
| 未登录 | 跳转登录页 / 401 / 业务 code 表示会话失效 |
| 非迎新对象 | 业务空 data 或 code 表示无权限；前端展示「当前账号无迎新数据」 |

### 3.2 Overview 面板

| 字段 | 值 |
|------|-----|
| 方法 | `GET` |
| Path 候选 | `/api/orientation/overview`、`/api/yingxin/home`、`/open/orientation/panels` |
| 用途 | 首页卡片列表（消息未读数、宿舍状态、导师姓名摘要等） |

### 3.3 消息列表

| 字段 | 值 |
|------|-----|
| 方法 | `GET` |
| Path 候选 | `/api/orientation/messages`、`/api/yingxin/notice/list` |
| Query | `page=1&pageSize=50`（可选） |

### 3.4 班导师

| 字段 | 值 |
|------|-----|
| 方法 | `GET` |
| Path 候选 | `/api/orientation/mentor`、`/api/yingxin/classAdvisor` |

### 3.5 辅导员

| 字段 | 值 |
|------|-----|
| 方法 | `GET` |
| Path 候选 | `/api/orientation/counselor`、`/api/yingxin/counselor` |

### 3.6 宿舍

| 字段 | 值 |
|------|-----|
| 方法 | `GET` |
| Path 候选 | `/api/orientation/dorm`、`/api/yingxin/dormitory` |

### 3.7 个人信息（迎新侧档案）

| 字段 | 值 |
|------|-----|
| 方法 | `GET` |
| Path 候选 | `/api/orientation/profile`、`/api/yingxin/student/info` |

### 3.8 Mini-HBUT invoke 聚合（实现层）

后端不强制 1:1 暴露每个 HTTP path，而是聚合为：

| Command | 语义 |
|---------|------|
| `smart_orientation_list_panels` | Overview 面板 |
| `smart_orientation_list_messages` | 消息列表 |
| `smart_orientation_profile_blocks` | 班导师 + 辅导员 + 宿舍 + 个人信息等块 |

**禁止**注册任何 submit/save/upload/confirm 类 command。

---

## 4. 字段字典（中文名 ↔ JSON path）

### 4.1 Overview 面板项 `panels[]`

| 中文名 | JSON path | 类型 | 说明 |
|--------|-----------|------|------|
| 面板 ID | `id` | string | 稳定键：`messages` / `mentor` / `counselor` / `dorm` / `profile` 等 |
| 标题 | `title` | string | 展示标题 |
| 摘要 | `summary` | string | 一行摘要 |
| 徽章 | `badge` | string? | 如未读数 |
| 排序 | `order` | number | 升序 |
| 图标键 | `iconKey` | string? | 前端 FA / material 映射 |

### 4.2 消息 `messages[]`

| 中文名 | JSON path | 类型 |
|--------|-----------|------|
| 消息 ID | `id` | string |
| 标题 | `title` | string |
| 摘要 | `summary` | string |
| 正文 | `body` | string | 纯文本或受控 HTML |
| 发布时间 | `publishedAt` | string | ISO 或学校原文字 |
| 是否已读 | `isRead` | boolean |
| 分类 | `category` | string? |

### 4.3 班导师 `mentor`

| 中文名 | JSON path | 类型 |
|--------|-----------|------|
| 姓名 | `name` | string |
| 工号 | `staffId` | string? | 脱敏 |
| 学院 | `college` | string? |
| 手机 | `phone` | string? | 脱敏 |
| 邮箱 | `email` | string? |
| 办公地点 | `office` | string? |
| 备注 | `remark` | string? |

### 4.4 辅导员 `counselor`

字段同班导师结构（`name` / `staffId` / `college` / `phone` / `email` / `office` / `remark`）。

### 4.5 宿舍 `dorm`

| 中文名 | JSON path | 类型 |
|--------|-----------|------|
| 校区 | `campus` | string? |
| 园区/楼栋 | `building` | string? |
| 房间号 | `room` | string? |
| 床位 | `bed` | string? |
| 入住状态 | `status` | string? |
| 备注 | `remark` | string? |

### 4.6 个人信息 `profile`

| 中文名 | JSON path | 类型 |
|--------|-----------|------|
| 学号 | `studentId` | string | 脱敏展示可用掩码 |
| 姓名 | `name` | string |
| 性别 | `gender` | string? |
| 学院 | `college` | string? |
| 专业 | `major` | string? |
| 班级 | `className` | string? |
| 年级 | `grade` | string? |
| 培养层次 | `educationLevel` | string? |
| 身份证号 | `idNumber` | string? | **必须脱敏** |
| 手机 | `phone` | string? | 脱敏 |
| 迎新状态 | `orientationStatus` | string? |

### 4.7 聚合响应壳

| 中文名 | JSON path | 类型 |
|--------|-----------|------|
| 拉取时间 | `fetchedAt` | string (ISO) |
| 数据来源 | `source` | `live` \| `fixture` \| `mixed` |
| 是否演示 | `demo` | boolean |
| 提示 | `notice` | string? | 如「离线样例」/「非迎新对象」 |
| 错误 | `error` | string? | 可与部分数据并存 |

---

## 5. 脱敏响应样例

完整 JSON 见：

- `docs/fixtures/smart-orientation/`（文档侧）
- `src-tauri/tests/fixtures/smart-orientation/`（单测侧，内容同步）

文件：

| 文件 | 内容 |
|------|------|
| `overview.json` | 面板列表 |
| `messages.json` | 消息列表 |
| `profile_blocks.json` | mentor / counselor / dorm / profile |

---

## 6. 写操作 / 填报（本 Epic **不做**）

下列类型接口 **仅登记禁止**，**不得**实现 invoke，也不得在 UI 提供提交：

| 类型（ASSUMPTION 名称） | 说明 |
|-------------------------|------|
| `POST /api/orientation/form/submit` | 迎新表单提交 |
| `POST /api/orientation/upload` | 材料上传 |
| `POST /api/orientation/confirm` | 信息确认签字 |
| `POST /api/orientation/dorm/choose` | 选宿提交 |
| 任意 `PUT`/`PATCH`/`DELETE` 业务写 | 档案修改、删除 |

官方填报若需完成：仅允许外链「去官网办理」，不在 App 内代填。

---

## 7. 可复现抓取步骤（有登录会话时）

1. 使用个人门户账号登录（**勿**把密码写入仓库/issue）。
2. 打开 DevTools Network，过滤 XHR/Fetch。
3. 从 §1.2 进入智慧迎新，逐 Tab 点击。
4. 对每条 2xx JSON：记录 URL、方法、关键 Request Headers、响应 body（脱敏后贴 PR）。
5. 对 POST/multipart：只记 path + 方法，标「写操作，不做」。
6. 用真实响应替换本档 ASSUMPTION path 与 fixtures。

---

## 8. 后端降级策略（无凭据 / 探测失败）

1. 若 CookieJar 无门户登录痕迹 → 返回明确错误「请先登录融合门户」。
2. 若有 cookie 但对全部 base/path 探测失败 → **回落 fixtures**，`source=fixture`，`demo=true`，`notice` 说明「未命中真实接口，展示协议样例」。
3. 部分成功 → `source=mixed`，成功块 live，失败块可空或 fixture（实现可选；默认空 + notice）。
4. 单元测试 **只**解析 fixtures，不发起外网请求。

---

## 9. 关联

- Parent Epic：#457  
- 后端：#458  
- 前端：#459  
- 入口：#461  
- 会话：`docs/portal-session.md`  
- 盘点：`docs/feature-inventory/00-overview.md`、`03-yimatong-features.md`
