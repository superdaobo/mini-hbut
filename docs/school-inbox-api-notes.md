# 学校消息中心 API 调研笔记

> 来源：本地抓包 `captures/network_capture_20260330_101304.csv`、`network_capture_20260323_085734.csv` 与门户/教务页面 JS 静态分析。Cookie 值不入库。

## 分流规则

| 登录方式（`hbu_login_method`） | 数据源 | 会话 |
|--------------------------------|--------|------|
| `portal_*` | 教务 `jwxt.hbut.edu.cn` 通知列表 | 现有教务 Cookie（`jw_uf` 等） |
| `chaoxing_*` | 学习通 `notice.chaoxing.com` 收件箱 API | `ensure_chaoxing_session_for_checkin` |

Rust 以 Cookie 有效性为最终判据；`login_mode` 仅作路由提示。

---

## 门户 / 教务（强智 jwxt）

### 通知公告列表（主列表 API）

- **URL**：`GET {jwxt_base}/admin/system/tzsjx/ajaxList`
- **Query**（示例）：
  - `gridtype=jqgrid`
  - `queryFields=id,dqstatus,collectstatus,title,content,releaseDate,`
  - `_search=false`
  - `page.size=500`
  - `page.pn=1`
  - `sort=id`
  - `order=desc`
- **Headers**：
  - `X-Requested-With: XMLHttpRequest`
  - `Referer: {jwxt_base}/admin/`
- **响应**（JSON）：
  - `results`: 数组，元素字段：
    - `id` — 唯一 ID（字符串或数字）
    - `title` — 标题
    - `content` — 正文摘要
    - `releaseDate` — 发布时间
    - `dqstatus` — 阅读状态（`0` 未读 / `1` 已读，以实网为准）
- **归一化 ID**：`portal:tzsjx:{id}`

### 红点计数（非列表，仅辅助）

- `GET {jwxt_base}/admin/workcenter/message/getTotalRedCount`
- 响应 body 为纯数字 JSON（如 `0`）

### 消息中心入口（页面，非 API）

- `/admin/workcenter/homepage/list?center=msg`
- 未读快捷列表 JS 引用：`/admin/getWdxxList`（抓包中未见到实网列表响应，实现以 `tzsjx/ajaxList` 为准）

---

## 学习通（chaoxing）

### 通知列表

- **URL**：`GET https://notice.chaoxing.com/apis/other/getNoticeList`
- **Query**：
  - `type=2`
  - `crossOrigin=true`
  - `pageSize=50`（应用固定值；原抓包默认 30，可增大）
  - 可选分页：`lastGetId`（响应 `data.notices.lastGetId`）
- **Headers**：
  - `Accept: application/json`
  - Cookie：需 `UID` / `vc3` / `uf` 等学习通域 Cookie（由 Rust 会话复用）
- **响应**（JSON）：
  - `result`: `1` 成功
  - `data.notices.list[]`：
    - `id` — 数字唯一 ID
    - `title` — 标题
    - `content` — 纯文本摘要
    - `sendTime` — 发送时间字符串
    - `isread` — `1` 已读 / `0` 未读
    - `uuid` — 备用唯一键
- **归一化 ID**：`chaoxing:notice:{id}`

### 未读计数（辅助）

- `GET https://i.chaoxing.com/base/getNoticeCount`（门户首页亦有 `e.hbut.edu.cn/getMessageCount`）

---

## 归一化结构（应用内）

```json
{
  "items": [
    {
      "id": "chaoxing:notice:1048653913",
      "title": "...",
      "summary": "...",
      "created_at": "2026-03-18 19:32:42",
      "is_read": true,
      "source": "chaoxing"
    }
  ],
  "fetched_at": "2026-06-25T12:00:00+08:00",
  "source": "chaoxing",
  "complete": true,
  "pagesFetched": 3,
  "truncated": true,
  "fromCache": false,
  "fetchedItemCount": 150
}
```

`source` 取值：`portal` | `chaoxing`。

新增可选字段（#1105 / Epic #1106，均 `Option`，`None` 时不出现在 JSON 中，旧前端忽略即可）：

| 字段 | 含义 |
|------|------|
| `complete` | 本次抓取是否完整。`false` = 中途失败/只拿到部分页（第 2 页起 API 失败、`lastGetId` 不前进/整页全重复）。空页**不算**中断（视为分页自然耗尽，见下文）。前端应视为**去重基线不可信**（只影响基线写入，并有连续 3 次后降级的护栏，不能永久禁推） |
| `pagesFetched` | 实际返回数据的页数（门户为 1；API 空页/失败页不计入） |
| `truncated` | 是否因页数上限被截断（到达 `max_pages` 且仍持有可用下一页游标；`complete` 仍为 `true`） |
| `fromCache` | 是否命中 180s 内存缓存（命中时返回缓存副本并置 `true`，其余标记保持原值） |
| `fetchedItemCount` | 本次返回条数（= `items.len()`，便于日志/诊断） |

---

## 分页与基线策略

- 首次拉取：写入全部 `id` 到 `hbu_notify_school_inbox_state:{studentId}`，**不推送**。
- 后续：仅 `id` 不在快照中的条目入队本地通知。
- 快照为 `schema: 2`（`initialized` / `ids` / `untrustedStreak`）：`ids` 只增不减（新 ∪ 旧，上限 2000），短抓取不得抹掉已知 id；`initialized` 只由「可信完整抓取」置位，连续 3 次不可信后一次性降级为已初始化（防永久禁推）。
- 判新只看列表**头部窗口**（前 50 条）：新消息总在最前面，深抓补回来的历史只追加在尾部，不得逐条推送。
- 门户列表默认 `page.size=500`（单页，`complete=true` / `pagesFetched=1` / `truncated=false`）。
- 学习通默认 `pageSize=50`，按 `lastGetId` 追加：快速路径 `CHAOXING_NOTICE_FAST_PAGES=3` 页，强制全量 `CHAOXING_NOTICE_MAX_PAGES=20` 页。
- 完整性信号由 Rust 在 `fetch_chaoxing_inbox` 内单点产生（`complete` / `pagesFetched` / `truncated`），调用方不根据条数猜测：
  - 第 2 页起 API 失败（`result != "1"`）、`lastGetId` 不前进/整页全重复 → `complete=false`（部分结果）；
  - 翻到「无下一页游标」或遇到空页（含首页空页 = 空收件箱）→ `complete=true`。空页刻意不判为中断：API 用空页还是「无游标」宣告结束，客户端无从区分，误判会让该账号每次检查都不可信、彻底收不到通知；
  - 到达页数上限且仍有下一页游标 → `truncated=true`（结果仍可用，`complete` 保持 `true`）。
- 180s 单槽内存缓存（key = `{source}:{studentId}`）：命中时返回缓存副本并置 `fromCache=true`，其余标记保持原值；新抓取写缓存时 `fromCache=false`。

---

## 风险

- 教务工作台 `center=msg` 的独立列表 API 未在抓包中确认；当前以 `tzsjx/ajaxList` 覆盖门户登录场景。
- Android Headless 无 Rust Cookie 时仅能依赖前台同步的 Cookie 快照与去重状态（见 `background_fetch.js`）。
