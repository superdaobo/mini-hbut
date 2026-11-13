# Epic #1243 跨仓接口契约（G0-01 · Issue #1244）

> 版本：v1（2026-11-13）。作者：Mini-HBUT 客户端维护者（DeepSeek 主 Agent 统筹）。
> 适用范围：Epic [#1243](https://github.com/superdaobo/mini-hbut/issues/1243) 的 29 条原生子 Issue（#1244–#1272，`G0-01`…`G8-02`）。
> 姊妹文档：[事实基线与跨端能力矩阵](./facts-and-baseline.md)、[模块与授权公共契约](./module-and-auth-contracts.md)。
> **本文件是 Epic #1243 期间的唯一接口事实源**：任何实现 PR 与本文冲突时，先改本文并说明理由，再改代码。

**状态图例（与 facts-and-baseline.md 一致）**

- `已核实`：仓库代码或本机命令可复现，给了 `file:line` 或命令。
- `已定目标`：Epic 已确认要这么做，代码尚未实现。
- `待实测`：需要真实 Casdoor / NAS PostgreSQL / 真机 / 学校凭据，当前不标通过。
- `待决策`：需人工拍板，未定前相关能力保持关闭。

> **事实边界**：本文所有「现状」都基于 2026-11-13 的三仓 `origin/main` 只读核查（SHA 见 §1），**不代表生产部署已启用**。本文不含任何真实学号、Cookie、token、密钥。

---

## 0. 与旧文档冲突时以谁为准

1. **Epic #1243 已确认的产品决策** > 本文件 > 各仓历史 ADR/旧 Issue。
2. 旧文档中与新决策冲突的条目，逐条登记在 §11「废止与变更清单」，**不允许悄悄沿用**。
3. 与各仓硬约束冲突时以硬约束为准：`OCR-services/AGENTS.md` §5.2「路由路径、请求/响应字段名与结构、错误码一律不许改，只能新增」。
4. 任何「模拟通过」不得替代「真实环境验收」（§13 BLOCKED 清单）。

---

## 1. 三仓基线（`已核实`，2026-11-13）

| 仓库 | 本地分支 | 本地 HEAD | `origin/main` | 脏文件数 | 本契约采用的基线 |
|---|---|---|---|---|---|
| `superdaobo/mini-hbut` | `feat/exam-timeline-overlay` | `4f66ef4c` | `ee3d2549eda510f58a1cbd75dd9b172d1dbaaca2`（2026-11-13 Merge PR #1242） | 62（**全部未跟踪，0 个已跟踪文件被改**） | **`origin/main` = `ee3d2549`** |
| `superdaobo/OCR-services`（私有） | `docs/identity-resource-server` | `f9c07b9` | `5be5121597c245dfe48531a182b9e4cdcec5709f`（2026-11-13 Merge PR #49 `fix/check8-pg-store`） | 3（全部未跟踪） | **`origin/main` = `5be5121`** |
| `superdaobo/mini-hbut-student-auth`（私有） | 本机未克隆 | — | `9d54108b4079b2979651f99d2bbe4c13a610409e`（2026-11-13 Merge PR #22 `fix/check8-device-proxy`） | — | **`main` = `9d54108b`** |

**工作树规则（全部 Task 通用）**

1. 每个工作包一个 `git worktree`，**从 `origin/main` 新建分支**，不从本地旧分支切（OCR 本地分支落后 26 个提交、2.5 万行）。
2. 工作树路径：`D:/wt/1243-<pkg>`（mini-hbut）、`D:/wt/ocr-1243-<pkg>`（OCR）、`D:/wt/sa-1243-<pkg>`（student-auth）。
3. 分支名：`feat/1243-<gX-YY>-<slug>`；PR 标题 `feat(1243-<gX-YY>): …`，正文含 `Refs superdaobo/mini-hbut#12xx`。
4. 主工作区的 62 个未跟踪文件（`data/`、`goal-*`、`*.png` 等）**不得**带入任何 PR。
5. 同一文件同一时刻只允许一个工作树写（写锁表见 `goal-11/tasks.md`）。

**门禁命令（`已核实`）**

| 仓库 | 命令 |
|---|---|
| mini-hbut | `cd apps/client && npm run typecheck` / `npm run test:ci` / `npm run check:all`（含 build + CSP + module-platform + arch guards；`RUST_CHECKS=1` 时加 cargo fmt/test/clippy） |
| OCR-services | `python -m pytest -q -p no:cacheprovider`（无 `PG_TEST_DSN` 时 PG 用例整文件 skip，不许 fail） |
| student-auth | `python -m pytest -q` |

### 1.1 必须复用的既有基座（禁止重造）

| 基座 | 出处 | 用在哪 |
|---|---|---|
| OIDC 授权码 + PKCE（`minihbut://` 深链回调、loopback 回退、ring RS256 验签、keyring 会话） | #1232 `a788ba9a` | G1-04 无感 SSO |
| refresh token 默认刷新 + 登出/切号三清 | #1233 `bccdb52c` | G1-04 / G1-05 |
| 模块隔离（独立 origin 4398 + sandbox + 桥 origin 白名单 + 15 字段签名 + 259 命令 ACL 收窄） | #1183 `f731e08d`、#1184 `63b0c969`、#1196 `b6e1ffd8` | G2-02 |
| OCR 数据域注册表 + 14 条判定矩阵（默认拒绝） | OCR #8 `0cfcc24b`、#10 `fe85e016`、#12 `7ba8702a` | G3-01/G3-04/G5-02（**不含**其 consent 部分，已退役） |
| 设备/主体存储 PG 工厂 | OCR `5be5121`（`identity_auth/store_factory.py`） | G3-01 扩展 consent |
| Casdoor 实测结论（JWKS 单把 RSA/RS256；`claims_supported` 无 `groups`/`hbut_student_id`；无自定义 scope） | #1238 `daae57a1` | G1-03 联调硬约束 |

> 旧 Issue/PR 的逐条交付状态见 [`facts-and-baseline.md`](./facts-and-baseline.md) §11.3。

---

## 2. 四个独立安全边界（不得相互推导）

| # | 边界 | 证明什么 | 谁判定 | 现状 |
|---|---|---|---|---|
| B1 | **学校身份核验** | 「此人确实拥有该学号」 | student-auth（`SchoolVerifier`） | `已定目标`：现无学校可验签断言，默认 fail-closed |
| B2 | **Casdoor SSO** | 「这是哪个学生主体」 | Casdoor + student-auth 断言 | `待实测`：真实建号/组/无 UI 授权未联调 |
| B3 | **数据访问授权** | 「这个应用能否读这个学生的这个域」 | OCR-services（应用白名单 ∩ 用户同意） | `已定目标`：白名单已有；用户同意层**当前不存在**（见 §4.1） |
| B4 | **Tauri 宿主隔离** | 「这个 iframe 能否碰宿主能力」 | 客户端 + Tauri capability | `已定目标`：远端 iframe 目前无统一沙箱（`MoreModuleHostView.vue:271`） |

**核心不变量**：`已登录（B2）` **绝不**推出 `有数据读取权（B3）`；`设备有私钥（B4）` **绝不**推出 `学号归属（B1）`。

---

## 3. scope 双词汇表与数据域（`已定目标`）

### 3.1 为什么有两套词汇

客户端「统一身份」用的是 **Identity Core scope**（`student.grades.read`，见 `apps/client/src/features/identity/learningDataConsent.ts:16`）；OCR 资源服务器用的是 **数据域 scope**（`grades.read`，见 `identity_auth/data_authz.py:95-146`，`origin/main` @ `5be5121`）。两套必须显式映射，**不允许**任一方向隐式转换。

### 3.2 映射表（冻结）

| Identity Core scope（客户端/授权 UI） | OCR scope（资源服务器） | 数据域 key | 展示文案（沿用 #699 冻结文案，逐字不改） |
|---|---|---|---|
| `student.grades.read` | `grades.read` | `grades` | 全部成绩单（含各学期成绩与绩点） |
| `student.timetable.read` | `schedule.read` | `schedule` | 完整课表 |
| `student.profile.read` | `profile.read` | `profile` | 姓名与院系班级等基本资料 |
| `student.exams.read` | `exams.read` | `exams` | 考试安排 |
| `student.rank.read` | `rank.read` | `rank` | 成绩排名 |
| —（不属于额外授权） | `cloud_sync.read` / `cloud_sync.write` | `cloud_sync` | 宿主专用，**永不**对第三方开放 |
| —（既有域，不变） | `forum.read` / `forum.write` | `forum` | 论坛（既有，不引入用户同意层） |
| —（既有域，不变） | `game.read` / `game.play` | `game` | 游戏（既有，不引入用户同意层） |

> **学号本身不是 scope**：经学校验证的真实学号属于**默认身份**，不弹授权（Epic §5 已确认），但必须在应用详情/隐私说明中披露。

### 3.3 数据域字段白名单（草案 → 由 G3-04 冻结）

| 域 | 允许字段 | 明确不含 |
|---|---|---|
| `schedule` | `course_name`、`weekday`、`sections`、`location`、`teacher`、`weeks`、`term` | 学号以外任何标识、原始 Cookie、内部调试字段 |
| `grades` | `course_name`、`credit`、`score`、`gpa`、`term` | 同班他人成绩、绩点算法内部中间值 |
| `exams` | `exam_name`、`exam_time`、`location`、`status`、`term` | 监考/考场内部备注 |
| `profile` | `name`、`department`、`major`、`class_name` | 手机号、身份证、家庭住址、照片、邮箱 |
| `rank` | `rank_type`、`rank_value`、`total`、`term` | 他人排名明细 |
| `custom_courses` / `personal_events` | `event_id`、`title`、`start_at`、`end_at`、`deleted_at` | 通知内容、设备信息 |

**规则**：字段白名单只增不改；新增字段 = **扩权** → 必须提升 `policy_version`，旧同意不得自动覆盖新字段（Epic「新增类别不得继承旧授权」）。

### 3.4 两套「域」集合的关系（**不要混用**，2026-11-13 检查点 A 补）

实现里存在两个**不同**的域集合，名字像但不是一回事：

| 集合 | 出处 | 成员 | 用途 |
|---|---|---|---|
| **可同步域**（7） | OCR `modules/cloud_domains_storage.py::DOMAINS` | `profile` / `schedule` / `grades` / `exams` / `rank` / `custom_courses` / `personal_events` | 云快照按域存储、发号、CAS、墓碑 |
| **可授权域**（8） | OCR `identity_auth/data_authz.py::DOMAIN_REGISTRY` | 上述 5 个学业域 + `cloud_sync` / `forum` / `game` | 第三方数据授权判定（白名单 ∩ 用户同意 ∩ 字段白名单） |

映射规则（冻结）：

- 第三方可申请的**学业域** = 可同步域 ∩ 可授权域 = `{profile, schedule, grades, exams, rank}`（5 个）。
- `custom_courses` / `personal_events`：**只同步、不对外授权**——用户私有编辑内容，第三方拿不到。
- `cloud_sync` / `forum` / `game`：**只授权、不可同步**——它们不是学业快照（`cloud_sync` 还是宿主专用，永不对第三方开放）。
- **新增域时必须同时检查两个集合**：只加进「可同步」不代表可以对外读；只加进「可授权」则没有数据源。
- 两个集合的一致性由测试守住（OCR 侧各自有契约测试）；本契约是唯一的口径来源，任何一边新增域都要回来更新这张表。

---

## 4. 授权模型（`已定目标`，G3-01/G3-02/G5-02）

### 4.1 与现状的重大冲突（必须读）

`已核实`：OCR-services `origin/main`（`5be5121`）上，**用户同意记录（consent）已被整体退役**——`P3-2 / OCR-services#29` 删除了 `ConsentGrant`、内存/PG 同意存储与 `/identity/consents*` 路由（现在落到 404），放行**只看** `client_id → 数据域` 白名单（`identity_auth/data_whitelist.py:1-30`、`modules/identity_data_authz/routes.py:1-20`）。

`已定目标`（Epic #1243 覆盖 P3-2 的口径，理由见 §11 #C4）：**恢复用户级逐域同意层**，且与既有白名单**同时成立**才放行：

```
放行 = 应用级白名单（manifest → MINI_HBUT_DATA_WHITELIST）   # 应用「能申请」的上限
     ∩ 用户级逐域同意（app_data_consents，PG 持久化）        # 学生「已同意」的当前状态
     ∩ 令牌校验（iss/aud/exp/kid/client_id→app_id/SID 来自 token）
     ∩ 字段白名单（§3.3）
```

- **不恢复旧路径**：不复用 `/identity/consents*`（其退役是显式决定，恢复会让人误以为回退）；新路径见 §4.4。
- **`forum` / `game` 域保持现状**（只走白名单），避免破坏论坛/游戏既有消费者。
- 仅 `profile / schedule / grades / exams / rank` 五个学业域引入用户同意层。

### 4.2 存储模型（新表，PG）

```sql
-- 表名/列名冻结；DDL 由 G3-01 落在 identity_auth/data_authz.py + deploy 迁移脚本
CREATE TABLE IF NOT EXISTS mini_hbut_app_data_consents (
  student_id       text        NOT NULL,
  app_id           text        NOT NULL,   -- = client_id
  domain           text        NOT NULL,   -- 必须存在于 DOMAIN_REGISTRY
  policy_version   integer     NOT NULL,
  granted_at       timestamptz NOT NULL,
  revoked_at       timestamptz,            -- NULL = 有效
  consent_revision bigint      NOT NULL,
  updated_at       timestamptz NOT NULL,
  PRIMARY KEY (student_id, app_id, domain)
);
```

- `consent_revision`：**按 (student_id, app_id) 单调 +1**，任何 grant/revoke 都 +1；读取时比对，用于「撤销后旧 token 立即失效」。
- 存储选择沿用既有工厂模式：`MINI_HBUT_IDENTITY_STORE=memory|pg`（`identity_auth/store_factory.py`，`已核实` 已存在，当前只管设备/主体）→ **G3-01 扩展到 consent**；`pg` 连不上必须**启动失败**（fail-closed），不得静默退回 memory。
- 迁移脚本：`deploy/identity/migrations/0005_app_data_consents.sql` + 配套 `.rollback.sql`（沿用既有编号与「正向 + 回滚成对」习惯；`已核实` `0001`–`0004` 均已存在正反两文件）。

### 4.3 判定语义（冻结）

| 情形 | 结果 |
|---|---|
| 无该 (student, app, domain) 行 | `403 consent_required` |
| 行存在且 `revoked_at IS NULL` 且 `policy_version` 匹配 | 放行 |
| `revoked_at IS NOT NULL` | `403 consent_revoked`（**旧 JWT 仍有效也不放行**） |
| `policy_version` 不匹配（域扩权） | `403 consent_required` + 需重新申请 |
| 应用不在白名单 / 已 `disabled` | `403 app_not_approved` |
| token `aud`/`client_id` 与 app_id 不符 | `403 subject_mismatch` |

**撤销即时性**：每次受保护读取**实时查存储**（可加短 TTL 缓存，但缓存必须带 `consent_revision` 且**不跨应用/不跨学号**）；禁止把撤销状态只放 JWT。

### 4.4 用户授权管理 API（新增，学生本人 principal）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/identity/app-consents?app_id=` | 列出该应用逐域状态（granted/revoked/never + policy_version） |
| `POST` | `/identity/app-consents/grant` | body `{app_id, domains:[...]}`；单事务原子写入；越权域（不在白名单）拒绝 |
| `POST` | `/identity/app-consents/revoke` | body `{app_id, domains:[...]}` 或 `{app_id, all:true}`（只撤**额外数据域**，不影响学号 SSO） |

- principal 必须是**学生本人**（Identity AT 验签后取 SID），**绝不**从 body 取学号。
- `all:true` 幂等；重复 revoke 返回 `revoked: 0` 而不是报错。
- 再次申请：服务端不主动推送；客户端只在用户**主动点击相关功能**或点「重新授权」时调用 `grant`（Epic 已确认的防骚扰口径）。

---

## 5. 云同步分域模型（`已定目标`，G4-01/G4-05）

### 5.1 时间语义（**最容易搞错的一条**）

| 字段 | 含义 | 时钟来源 | 能否给第三方看 |
|---|---|---|---|
| `school_fetched_at` | 客户端从学校**实际采集**到该数据的时间 | 客户端（不可信） | **不能**（会让人误以为新采集） |
| `cloud_synced_at` | 服务端**成功写入**云端的时间 | 服务端（权威） | **能**，即第三方看到的「最后同步」 |
| `local_updated_at` | 本地缓存更新成功时间 | 客户端 | 不能 |

> 禁止：用上传尝试时间当成功时间；用 `school_fetched_at` 冒充 `cloud_synced_at`；把「重传旧缓存」显示成新采集。

### 5.2 存储模型（新表）

```sql
CREATE TABLE IF NOT EXISTS mini_hbut_student_cloud_domains (
  student_id         text        NOT NULL,
  domain             text        NOT NULL,   -- profile/schedule/grades/exams/rank/custom_courses/personal_events
  server_version     bigint      NOT NULL,   -- 服务端发号，单调 +1，仅内容变化时增
  content_hash       text        NOT NULL,
  payload            jsonb       NOT NULL,
  source_kind        text        NOT NULL,   -- school | user
  source_observed_at timestamptz,            -- = school_fetched_at（仅信息）
  cloud_synced_at    timestamptz NOT NULL,
  source_device_id   text,
  deleted_at         timestamptz,            -- 墓碑（仅 user 域）
  PRIMARY KEY (student_id, domain)
);
```

### 5.3 端点（只增不改）

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/cloud-sync/v2/domains` | 单域上传；body 带 `base_version`；冲突 → `409` + `{error:"version_conflict", server_version}` |
| `GET` | `/api/cloud-sync/v2/domains?domains=` | 按域读取（宿主专用） |
| 不变 | `/api/cloud-sync/upload`、`/api/cloud-sync/download` | 旧整包协议**零变化**；服务端把整包**投影**写入分域表（`source_kind=school`，hash 不变则 `server_version` 不增） |

### 5.4 冲突策略（冻结）

| 域类型 | 冲突判定 | 解决 |
|---|---|---|
| 学校只读域（`schedule/grades/exams/rank/profile`） | `source_observed_at`（`school_fetched_at`）较新者胜；客户端时钟不可单独作权威 | 旧包不覆盖新域，返回 `409` + 服务端当前 `server_version` |
| 用户可编辑域（`custom_courses/personal_events`） | 按 `event_id` 合并；`deleted_at` 墓碑优先 | 同 `event_id` 冲突 → `409`，保留双方 + 审计 |

---

## 6. 第三方分类只读 API（`已定目标`，G5-01/G5-02）

### 6.1 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/app-data/v1/schedule?semester=` | 课表 |
| `GET` | `/api/app-data/v1/grades?semester=` | 成绩 |
| `GET` | `/api/app-data/v1/exams?semester=` | 考试 |
| `GET` | `/api/app-data/v1/profile` | 基本资料 |
| `GET` | `/api/app-data/v1/rank?semester=` | 排名 |
| `GET` | `/api/app-data/v1/sync-status` | 各域最后同步时间与数据版本 |

> 路径以本节为准（Epic 报告 §7.1 的路径是提案，本节冻结）。**开关默认关闭**：`MINI_HBUT_APP_DATA_API_ENABLED=false` → 全部 `503 service_unavailable`（fail-closed）。

### 6.2 鉴权链（每次请求，顺序固定）

1. `Authorization: Bearer <app token>` → JWKS 验签（`kid` 轮换；未知 `kid` → `401`）
2. `iss` / `aud` / `exp` / `nbf` 校验
3. `client_id` → `app_id`，与 `aud` 一致
4. `app_id` 在 `manifest/apps.json` 中且 `status=active`
5. SID **只从 token 主体取**（请求体/查询参数里的学号一律忽略并记审计）
6. §4.3 同意判定（实时，含 `consent_revision`）
7. §3.3 字段白名单投影

### 6.3 响应契约

```json
{
  "data": { "semester": "2026-2027-1", "courses": [] },
  "meta": {
    "domain": "schedule",
    "data_version": 29,
    "last_synced_at": "2026-11-13T06:30:00Z"
  }
}
```

- `last_synced_at` = `cloud_synced_at`（**只此一个**时间字段对外）。
- **无数据年龄阈值**：30 天没同步照样返回 `200`，只是 `last_synced_at` 是旧值。**禁止** `410 Gone`、禁止 `stale` 标志、禁止「可能过期」文案。
- 云端无该域快照 → `200` + `data: null` + `meta.reason="snapshot_missing"`（与「无授权」严格区分）。
- 错误体统一：`{"error": {"code": "...", "message": "...", "retry_after": 30}}`。

### 6.4 错误码（稳定机器码，冻结）

| code | HTTP | 何时 |
|---|---|---|
| `identity_required` | 401 | 缺/坏 token、未知 kid |
| `app_not_approved` | 403 | 不在 manifest / `disabled` |
| `consent_required` | 403 | 无同意记录 / `policy_version` 不符 |
| `consent_revoked` | 403 | 已撤销 |
| `subject_mismatch` | 403 | token 主体与 `aud`/app_id 不符 |
| `snapshot_missing` | 200 | 授权有效但云端无该域数据（走 `meta.reason`） |
| `rate_limited` | 429 | 带 `Retry-After`（秒） |
| `service_unavailable` | 503 | 开关关闭 / 依赖不可用 |

### 6.5 CORS 与限流

- **CORS**：仅 `/api/app-data/*` 使用 `MINI_HBUT_APP_DATA_ALLOWED_ORIGINS`（精确 origin 列表，逗号分隔，**禁止** `*`）；全局 `allow_origins=["*"]` **不动**（OCR 硬约束「只增不改」，且论坛/游戏依赖现状）。
- **限流三层**：`student_id` 60 次/分；`app_id` 120 次/分；IP 300 次/分（**仅反恶意**，校园 NAT 不得误伤）。超限 `429` + `Retry-After` + 抖动建议。
- **写入侧**沿用现有 `CLOUD_SYNC_UPLOAD_MIN_INTERVAL_SECONDS`（默认 120s/学号），**不得**用 `force=true` 绕过。

---

## 7. 应用清单与宿主契约（`已定目标`，G2-01/G2-02/G2-03）

### 7.1 权威源（`已核实`）

应用接入的唯一权威源是 **`OCR-services/manifest/apps.json` + PR 审核**（`identity-platform` 自建注册表已于 #1241 退役为 410）。格式**冻结**，只允许**新增可选字段**：

| 新增可选字段 | 语义 | 缺省 |
|---|---|---|
| `allowed_origins` | 允许承载该应用的 HTTPS origin 精确列表 | 空 = 不允许内嵌 |
| `privacy_url` | 隐私说明地址（应用详情展示） | 空 = 未提供（审核态） |
| `review_version` | 审核版本号（扩权需递增） | 1 |

生成器 `scripts/manifest/gen_data_whitelist.py` **必须忽略未知字段**（保证旧生成器不被新字段打断）；域仍只能取自 `DOMAIN_REGISTRY`。

### 7.2 客户端应用目录

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/app-catalog/v1/apps` | 公开只读，返回 `app_id/label/owner/allowed_origins/privacy_url/status/data_domains`；**不含任何密钥** |

客户端 `module_center` / `remote_config` 只能**引用**该目录，**不得**据此提升权限（远端配置不是权威源）。

### 7.3 一次性启动票据（替代 `?gpt=` 长期票据）

| 步骤 | 端点 | 说明 |
|---|---|---|
| 1 | `POST /api/app-launch/v1/code` | 宿主可信上下文（Identity AT）调用；body `{app_id, instance_nonce}`；返回 `{code, expires_at, exchange_url}` |
| 2 | `POST /api/app-launch/v1/exchange` | 应用后端调用；body `{code, app_id}`；返回该应用**受限会话** `{access_token, token_type, expires_in, sid}` |

- `code`：TTL **60 秒**、**一次性**（消费即删）、绑定 `(sid, app_id, aud, device_id, instance_nonce)`。
- 失败码：`code_invalid` / `code_expired` / `code_used` / `app_mismatch` / `aud_mismatch`（均 400/403）。
- 应用换到的 token：`expires_in` ≤ 600s，`aud=app_id`，**不含** `cloud_sync.*` scope，**不能**换主 AT/RT。
- URL 传递限制：若必须经 URL 回跳，**立即** `history.replaceState` 清理 + `Referrer-Policy: no-referrer`；**禁止**把长期 token 放 URL。

### 7.4 宿主隔离（B4）

| 要求 | 现状 | 目标 |
|---|---|---|
| 远端 iframe sandbox | `已核实` `MoreModuleHostView.vue:271` 远端返回 `undefined`（= 无沙箱） | 默认拒绝；仅清单内 `allowed_origins` 精确匹配才给 `allow-scripts` |
| 桥消息校验 | `已核实` 校验 `event.source` + origin | 追加 `app_id + instance_nonce + request_id + 协议版本 + capability 白名单` |
| Tauri capability | `已核实` 仅 `main` 窗口有 capability | 远端**零** native capability；模块窗口不继承宿主 |
| Android/Linux iframe 继承 | `待实测`（Tauri 官方提示） | 真机负向用例；无法证明则**不开放**敏感能力 |

---

## 8. 客户端同步与调度契约（`已定目标`，G4-02/G4-03/G4-06）

### 8.1 三类频率相互独立

| 类别 | 前台周期（首期基线） | 手动刷新 | 备注 |
|---|---|---|---|
| 学校查询 `schedule` | 30 分钟 | 立即查（不等周期） | 同一在途请求复用，不重复拉 |
| 学校查询 `grades` | 2 小时 | 立即查 | 同上 |
| 学校查询 `exams` | 2 小时 | 立即查 | 同上 |
| 学校查询 `rank` | 12 小时 | 立即查 | 同上 |
| 学校查询 `profile` | 24 小时 / 登录首次 | 立即查 | — |
| 本地编辑（`custom_courses`/`personal_events`） | 不查学校 | — | 事件驱动 + 10–30s 去抖 |
| 客户端 → OCR 上传 | 变更驱动 | 高优先级 | 受 `120s/学号` 冷却与 429 约束 |
| 第三方 → OCR 读取 | **不触发**学校查询 | 非强制「通过 Mini-HBUT 刷新」 | 绝不由读取反向触发教务请求 |

### 8.2 待同步队列状态机（客户端）

```
idle → dirty → queued → inflight → acked
                    ↘ failed(backoff+Retry-After) → queued
                    ↘ blocked(429/限流) → queued(最早允许时刻)
```

- key = `sid × domain`；同 key **单飞**。
- `idempotency_key = sha256(sid | domain | base_server_version | content_hash)`。
- 持久化：断网/杀进程/重启/切号都不丢；切号只处理新学号队列。
- **状态分离**：`local_updated_at`（本地刷新成功）≠ `cloud_synced_at`（后端确认）；未确认前 UI 不得显示「已同步」。

### 8.3 三端后台（尽力，不承诺）

| 平台 | 最小化/后台 | 恢复前台 |
|---|---|---|
| Windows | 进程未结束 → 低频（前台 2–4 倍周期）；**彻底退出不建常驻进程** | 按「是否到计划时点」补偿 |
| Android | WorkManager 非精确定时（最小 15 分钟、Doze 可延迟）；优先补传 | 补偿 + 限流内补查 |
| iOS | BGAppRefreshTask 由系统决定；只做短任务补传 | 同上 |

**禁止**：常驻高耗电前台服务、伪承诺「每 15 分钟必刷」、后台强制重登教务。

---

## 9. 身份与设备契约（`已定目标`，G1-01…G1-05）

### 9.1 可信学号（B1）

```python
# student-auth: mini_hbut_student_auth/verified_subject.py（新增）
@dataclass(frozen=True)
class VerifiedSchoolSubject:
    sid: str            # 学号（仅来自学校验证结果）
    method: str         # 学校验证方式标识（可审计）
    verified_at: int    # unix 秒
    aud: str            # 目标受众
    nonce: str          # 一次性挑战
    device_id: str
```

- `SchoolVerifier` 协议 + **默认 `FailClosedVerifier`**：没有学校可验签断言时**拒绝签发**（不得降级为「设备签名 + 自报学号」）。
- 断言签名：服务端私钥（Ed25519），绑 `aud/nonce/device_id/exp`（≤ 300s）。
- `已核实` 现状：`student-auth` 已有 OIDC/设备代理，但 README 明示「真实 Casdoor 尚未联调」；`已定目标` 的学校验证根 **`待实测`**（这是 Epic 的 R-01 P0 阻断）。

### 9.2 多设备

```sql
-- 表名沿用既有迁移命名（已核实 0001 已有设备表），新增列只增不改
-- 语义：一个 sid ↔ N 台设备；每台独立密钥/会话，可独立撤销
```

- 新设备**只需** §9.1 的可信验证即可登记，**不要求旧设备批准**（Epic 已确认方案 A）。
- 旧「换机需旧设备批准」保留为**异常兜底**，不作常规门（§11 #C1）。
- 异常风控：短时间大量登记 → 要求加强学校验证或人工审核，**不得**恢复普遍旧设备批准。

### 9.3 会话与切号

- 单设备可记住多账号，但**同时只有一个 active SID**。
- `account_epoch`（客户端 + 服务端可选）：任何异步回调/桥响应必须带 epoch，切号即 bump，晚到结果丢弃。
- 切号必须原子失效：iframe、launch ticket、待发 API、host bridge、本地缓存 key 前缀。
- refresh token 仅存 OS 安全存储（`已核实` 客户端已有 keyring 链路）；JS/URL/localStorage/日志零长期 token。

---

## 10. 测试 fixture 与证据规范

1. **合成学号**统一前缀 `T9`（如 `T9000001`…`T9000099`），一眼可辨非真实学号。
2. 文档/测试/PR 正文**禁止**出现真实学号、Cookie、密码、token、私钥；`check_all.mjs` 的 SecretGuard 会拦。
3. 每条新测试在文件头写清「守的是什么契约」（OCR 仓库硬规矩）。
4. 证据四态：`PASS`（真跑 + 命令 + 输出）/ `FAIL` / `BLOCKED`（缺什么条件）/ `NOT-TESTED`。
5. 每个 Task 的证据落 `goal-11/evidence/<Task>/`；PR 正文引用对应条目。

---

## 11. 废止与变更清单（旧文档冲突逐条登记）

| # | 旧口径 | 出处 | 状态 | 替代口径 |
|---|---|---|---|---|
| C1 | 换机必须**旧设备批准**；首次登记即占有 | `docs/architecture/identity-v2-device-attestation.md:65-83`、`mini-hbut-student-auth/docs/oidc-upstream-contract.md` §3.4 | **废止** | 学校可信验证 + 设备一对多（§9.2） |
| C2 | 设备签名 + 自报学号可作为身份依据 | 同上（旧实现隐含） | **废止** | 仅 `VerifiedSchoolSubject`（§9.1），缺证明 fail-closed |
| C3 | 成绩/课表 `source=device`，只能端侧读 | `identity_auth/data_authz.py:103,113`（`origin/main`）、OCR `docs/t11-data-authz.md` | **变更** | `source` 可配置（`MINI_HBUT_CLOUD_DOMAINS`），默认仍 device 保兼容（§3.2） |
| C4 | 用户同意记录已整体退役，授权只看 `client_id` 白名单 | `identity_auth/data_whitelist.py:1-30`（P3-2 / OCR#29） | **变更（部分）** | 白名单 = 应用上限；**重新引入**用户逐域同意层（§4）。理由：P3-2 退役的是「scope 式同意」，Epic #1243 要求的是「学生可逐项撤销的可见同意」，语义不同 |
| C5 | 学校数据默认留设备、不默认上云 | `docs/architecture/contracts/facts-and-baseline.md` §5 | **变更** | 核心云同步常开（Epic 已确认）；「不上云」改为「不直给第三方」 |
| C6 | 课表 2h / 成绩·考试 6h / 排名 24h / 基本资料 72h 过期阈值；「可能过期」告警；强制刷新 | Epic 早期提案（已废止） | **废止** | 只显示「最后同步：YYYY-MM-DD HH:mm」，无阈值、无告警、刷新非强制（§6.3） |
| C7 | 自建应用注册表 / 门户写入口 | `identity-platform`（#1241） | **已退役（410）** | `manifest/apps.json` + PR（§7.1）；**禁止复活** |
| C8 | 「V1 无 refresh token」 | `facts-and-baseline.md` §4 C2 | **已变更（事实）** | #1209 已加 refresh rotation；本文件以新事实为准 |
| C9 | 「用户同意：不存在（无数据域/同意/撤销模型）」 | `facts-and-baseline.md` §8 | **变更** | 目标态为 §4；实现进度以 tasks.md 为准 |
| C10 | 游戏 `?gpt=<ticket>` 走 URL 传票 | `MoreModuleHostView.vue:227` | **变更** | 一次性 `code` + 后端 exchange（§7.3）；兼容路径必须清 URL 且禁 referrer |

---

## 12. 29 条子 Issue → 契约落点映射

| Issue | 代号 | 本契约落点 |
|---|---|---|
| #1244 | G0-01 | 全文（本文件即产出） |
| #1245 | G1-01 | §2 B1、§9.1 |
| #1246 | G1-02 | §9.2 |
| #1247 | G1-03 | §2 B2、§9.1（真实联调 = `待实测`） |
| #1248 | G1-04 | §9.1、§9.3 |
| #1249 | G1-05 | §9.3 |
| #1250 | G2-01 | §7.1、§7.2 |
| #1251 | G2-02 | §7.4 |
| #1252 | G2-03 | §7.3 |
| #1253 | G2-04 | §7.2、§7.3 |
| #1254 | G3-01 | §4.1、§4.2 |
| #1255 | G3-02 | §4.3、§4.4 |
| #1256 | G3-03 | §3.2（冻结文案）、§4.4 |
| #1257 | G3-04 | §3.2、§3.3 |
| #1258 | G3-05 | §4、§13（法律 BLOCKED） |
| #1259 | G4-01 | §5.1–§5.4 |
| #1260 | G4-02 | §8.2 |
| #1261 | G4-03 | §8.1 |
| #1262 | G4-04 | §6.5 |
| #1263 | G4-05 | §5.4 |
| #1264 | G4-06 | §8.3 |
| #1265 | G5-01 | §6.1–§6.3 |
| #1266 | G5-02 | §6.2、§6.4、§6.5 |
| #1267 | G5-03 | §6、§7.3 |
| #1268 | G6-01 | §6.3、§8.2 |
| #1269 | G7-01 | §6.4、§10 |
| #1270 | G7-02 | §6.5、§8.1 |
| #1271 | G8-01 | §1、§11 |
| #1272 | G8-02 | 全文 + `facts-and-baseline.md` |

---

## 13. 已知缺口与 BLOCKED（不实测不标通过）

| # | 缺口 | 影响 Issue | 未解决时的处理 |
|---|---|---|---|
| B1 | 学校可验签的身份断言是否存在（R-01 P0） | #1245 #1247 #1271 | `FailClosedVerifier` 默认拒绝；真实建号不开放 |
| B2 | 真实 Casdoor/FDL 凭据（建号幂等/学生组/token exchange/无 UI 授权） | #1247 #1248 #1252 #1267 | 只交可跑脚本 + 模拟证据并标 BLOCKED |
| B3 | 本机无 PostgreSQL / docker（NAS PG 无法往返验证） | #1254 #1259 #1262 #1263 #1270 | 用 fake-cursor 契约测试；真实往返标 BLOCKED |
| B4 | Android/iOS 真机、Tauri 原生隔离真机负向用例 | #1251 #1253 #1264 #1269 | 代码默认拒绝 + 真机项标 BLOCKED |
| B5 | NAS/学校接口压测许可 | #1262 #1270 | 只做隔离环境脚本，压生产一律禁止 |
| B6 | 隐私法律/商店审核结论 | #1258 #1271 | 方案 + 清单交付，结论标 BLOCKED |
| B7 | `identity-platform` 与 OCR 的 consent 归属（本契约 §4.1 已定：OCR 为权威） | #1254 #1255 #1265 | 若需 Core 侧展示，只读代理，不做放行判定 |

---

## 14. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-11-13 | v1 | 首版：冻结 scope 映射、数据域、授权两层模型、云同步分域、第三方只读 API、应用清单、票据、调度、身份、错误码、废止清单 |
| 2026-11-13 | v1.1 | 检查点 A：补 §3.4（可同步域 vs 可授权域两个集合的关系）与 §15（跨 PR 合并顺序与冲突处理） |

## 15. 跨 PR 合并顺序与冲突处理（2026-11-13 检查点 A 补）

| 顺序 | PR | 仓库 | 触及的共享文件 |
|---|---|---|---|
| 1 | #1273（T01 契约） | mini-hbut | 仅 `docs/**`，无冲突 |
| 2 | OCR#50（T02 同意层 + 学业域） | OCR-services | `identity_auth/{app_consents,data_authz,store_factory}.py`、`runtime/entrypoint.py`、`manifest/README.md`、`docs/t11-data-authz.md`、`deploy/identity/migrations/0005*` |
| 3 | OCR#51（T03 分域快照 + 限流） | OCR-services | `runtime/entrypoint.py`、`modules/cloud_domains_storage.py`、`modules/cloud_sync_domains_routes.py`、`modules/rate_limit/policy.py`、`deploy/identity/migrations/0006*` |

**唯一冲突点**：OCR#50 与 OCR#51 都改 `runtime/entrypoint.py`。

- 位置不同（#50 在 data-authz 接线区 ≈221 行与 cloud-sync 中部；#51 在 cloud-sync 上传区 ≈5690 行与文件末尾），git 可自动合并；
- **合并后必须重跑全量**：`python -m pytest -q -p no:cacheprovider`（两者都新增了启动期接线，单看 diff 无法证明组合后可启动）；
- 顺序理由：授权层（#50）是分域读取（#51）的上游——分域表的第三方读取必须经过 consent 判定，所以先合 #50。

**合并后必须额外验证的三条**（单 PR 测试覆盖不到）：

1. `import runtime.entrypoint` 成功，且 `len(app.routes)` 增量 = 预期（#51 的 2 条 v2 路由，仅当 `MINI_HBUT_CLOUD_DOMAINS_ENABLED` 为真）；
2. `MINI_HBUT_CLOUD_DOMAINS_ENABLED=true` 时旧整包上传仍返回 200（投影失败不得改变旧语义）；
3. 两个迁移 `0005` / `0006` 在同一测试库顺序执行成功（编号不冲突）。
