# T12 设计文档：统一应用申请审核与配置目录生命周期

> Issue：[superdaobo/mini-hbut#1170](https://github.com/superdaobo/mini-hbut/issues/1170)（Epic #1161，T12）
> 版本：v0.1（设计稿，未实现）｜ 日期：2026-11-07
> 前置：[模块与授权公共契约 v1（冻结）](./contracts/module-and-auth-contracts.md)（下称「契约」）、[迁移计划 2026-11-01](./mini-hbut-migration-plan-2026-11-01.md)（下称「迁移计划」）、[T09 实测报告](../../2026-11-07-mini-hbut-Casdoor-T09实测报告.md)
> 约定：文中 `file:line` 均为 2026-11-07 工作区快照的当前行号；查不到的事实一律标注「未核实」。

## 0. 一句话结论与范围

**T12 把「一个不可变审核版本」作为唯一事实源，派生出四份产物（Casdoor 应用配置、业务策略、目录条目、模块产物），全部写入动作幂等、全程 fail-closed、偏差由对账任务兜底发现。**

- 本文档只设计，不实现；不修改任何现有代码。
- 范围：申请/更新/驳回/启用/停用/撤销/secret 轮换的**状态、负责人、审计**（验收 1）；审核内容模型（验收 2）；单版本一致性与幂等对账（验收 3）；失败语义（验收 4）；权限与凭据边界（验收 5）；测试清单与 T07 字段一致（验收 6）；跨仓 PR 互链与交付位置登记（验收 7）；复用现有审核/发布流程、不建第二套账号认证（验收 8）。
- 术语：**应用（app）**＝一个可被审核、上架的接入单元；**审核版本（review version）**＝一次提交 + 一次审核决定的不可变快照；**provisioner（接入程序）**＝把审核版本写成四份产物的受控程序；**目录**＝客户端消费的 `catalog.json` 条目集。

---

## 1. 现状盘点（带 file:line）

### 1.1 旧开发者 API/门户提供的生命周期动作

主仓 `identity-platform/`（core 部署在 Vercel，见 `identity-platform/core/.vercel/` 目录；web 门户 `identity-platform/web/app/developer-site`）是待退役的基线。它已经实现了 T12 需要的**大部分审核机制**，T12 应复用其不变量而非重写。

**状态机（旧）**，`identity-platform/core/src/domain/clients.ts:53-61`：

```
draft → pending_review → approved → active → suspended ⇄ active → revoked
draft/rejected 可回 pending_review；rejected、revoked 是终态（L59-60 迁移表为空数组）
```

**开发者侧（申请方）动作**，路由实现 `identity-platform/core/src/api/developer/index.ts`（BFF 路由在 `identity-platform/web/app/developer-site/api/v1/developer/...`，经 service-token 只接受服务端调用，`identity-platform/web/lib/developer-api/client.ts:19,53`）：

| 动作 | 入口（file:line） | 行为与限制 |
|---|---|---|
| 建档 | `core/.../api/developer/index.ts:170-211`（GET/POST `/me`） | 按 user_id 幂等建档（`ensureDeveloper`，L115-131） |
| 创建应用 | `core/.../api/developer/index.ts:244-326`（POST `/apps`） | 先落 `draft`；`web_confidential` 的 `client_secret` 明文**只返回这一次**（L317-322 的 201 响应） |
| 查看/编辑 | `core/.../api/developer/index.ts:329-387`（GET/PATCH `/apps/:id`） | 编辑锁：`pending_review/suspended/revoked` 一律 409（L361-363）；`approved/active` 可改元数据（L359-360 注释） |
| 删除 | `core/.../api/developer/index.ts:390-410`（DELETE） | 仅 `draft` 可删（L401-403） |
| 回调增删 | `core/.../api/developer/index.ts:413-474`（POST/DELETE `redirect-uris`） | 仅 `draft/rejected` 可改（L424-426）；校验禁通配符 `clients.ts:110-112` |
| 权限申请 | `core/.../api/developer/index.ts:477-544`（PUT/GET `scopes`） | 仅 `draft/rejected`（L488-490）；scope 白名单见 `migrations/0001_initial.sql:168`（`openid/profile/student.identity/offline_access`） |
| 提交审核 | `core/.../api/developer/index.ts:547-572`（POST `submit`） | `draft/rejected → pending_review`（L558-565） |
| secret 轮换 | `core/.../api/developer/index.ts:575-598`（POST `credentials/rotate`） | 新 secret 明文只返回一次（L591-594）；旧 secret 有 `client_secret_expires_at`（`migrations/0001_initial.sql:134`） |
| 自我撤销 | `core/.../api/developer/index.ts:601-619`（POST `revoke`） | → `revoked` |
| 审计查询 | `core/.../api/developer/index.ts:622-651`（GET `audit`） | 按 target 返回最近 50 条 |

**管理侧（审核方）动作**，路由 `identity-platform/core/src/api/admin/index.ts`，RBAC/step-up 边界见其头部注释 L11-21：

| 动作 | 入口（file:line） | 权限 |
|---|---|---|
| 队列/详情/历史 | `admin/index.ts:261-279, 282-322` | `identity_reviewer` 可见 |
| 批准（含逐 scope 决策） | `admin/index.ts:327-351`；领域逻辑 `admin/reviews.ts:352-432` | reviewer；含敏感 scope 需 step-up 近期认证（`admin/index.ts:335`） |
| 驳回（必填可读原因） | `admin/index.ts:355-373`；`admin/reviews.ts:474-519` | reviewer |
| 停用/启用 | `admin/index.ts:376-403` | `identity_admin` + step-up |
| 撤销（终态不可逆） | `admin/index.ts:406-418` | `identity_admin` + step-up |
| 审计查询 | `admin/index.ts:421-439` | 仅 `identity_admin` |

**已存在的审核不变量**（`identity-platform/core/src/api/admin/reviews.ts:4-19` 头注释）：快照不可变、内容寻址 revision（sha256，`reviews.ts:132-143`）、review 与应用状态同事务迁移（`reviews.ts:377-403`，条件 UPDATE 带 `updated_at` 防并发）、幂等重放（`reviews.ts:350,472` 注释与 L360-374）、self-review 默认禁止（`reviews.ts:243-244`）。单 pending 不变量由 `SELECT ... FOR UPDATE` 保证（`reviews.ts:171-191`；`migrations/0002_admin_roles.sql:59-61`）。

**数据模型（旧）**：`oauth_applications`（`migrations/0001_initial.sql:117-144`：`client_id UNIQUE` L119、`status` CHECK L127-129、`client_secret_encrypted` L133）、`application_reviews`（`migrations/0002_admin_roles.sql:38-57`：`revision` L43、三个 JSONB 快照 L46-48、`status IN (pending/approved/rejected/superseded)` L49-50、`scope_decisions_json` L54）。secret 只以 AES-256-GCM 密文入库（`0001:133`），详情接口只暴露指纹/末 4 位（`core/.../api/developer/index.ts:678-690`）。

**已知现状矛盾（T12 须统一）**：状态机表把 `rejected` 列为终态（`clients.ts:59`，迁移表空数组），但开发者 API 允许 `rejected` 状态编辑并重新提交（`core/.../api/developer/index.ts:424,558` 均接受 `draft/rejected`）。旧系统实际按「rejected 可回炉」运行，但状态机表与代码不一致——T12 的新状态机必须显式定义 rejected 的回炉路径（见 §3）。

### 1.2 客户端目录消费了哪些字段

客户端消费链：`fetchModuleCatalog`（`apps/client/src/utils/more_modules/core.js:1006-1044`）拉取 `${moduleCdnBase}/${channel}/catalog.json`（`core.js:1014`，CDN 基址 `module_center.js:1`），payload 为 `{schema_version, generated_at, modules[]}`（`core.js:1026-1035`），按渠道回退并落本地缓存（缓存键 `core.js:24`）；`MoreView.vue:712-756` 再把「远程配置 `fetchRemoteConfig().module_center.modules`（configuredModules，`MoreView.vue:726-732`）」与「catalog（catalogModules，`MoreView.vue:738-740`）」合并进 `buildModuleCenterCards`（`module_center.js:210-263`）。

条目归一化字段（`apps/client/src/utils/module_center.js:150-193`，`normalizeModuleCenterEntry`）：

| 字段 | 行号 | 备注 |
|---|---|---|
| `id` / `module_id` | `module_center.js:157` | 必填，无 id 丢弃 |
| `name` / `module_name` / `title` | `module_center.js:167` | |
| `icon` | `module_center.js:168` | 缺省按 kind 给 emoji |
| `description` / `desc` | `module_center.js:169` | |
| `key_required` | `module_center.js:170` | 旧字段，内置 `shuake` 专用 |
| `kind`：`internal` / `remote` | `module_center.js:160-161` | |
| `view` / `route` | `module_center.js:162` | 内嵌入口 |
| `order` | `module_center.js:163` | 缺省 `index+1` |
| `min_compatible_version` | `module_center.js:174` | |
| **`release_seq` / `permissions` / `publisher_key_id` / `bridge_protocol`** | `module_center.js:175-182` | **T07 新契约字段**（`#1168`，注释见 L175-176：旧条目缺省按「未知」处理，不得因此判可信） |
| `manifest_url` | `module_center.js:183-191` | remote 条目，`${base}/${channel}/${id}/manifest.json` |

注意：归一化逻辑在仓内存在**两份实现**——`module_center.js:150` 与 `apps/client/src/utils/remote_config_defaults.ts:347-375`（后者是 TS 镜像）。验收 6 要求「与 T07 约定目录字段一致」，T12 生成目录前应先统一这两份（或声明哪份为准），否则同一条目在两条加载路径下归一化结果可能不一致。

内置兜底清单在 `module_center.js:3-106`（11 个 remote 游戏），契约的目录字段冻结见 `contracts/module-and-auth-contracts.md:5`（字段名不得改，可加可选字段）。

### 1.3 NAS 侧现状：哪些是文档、哪些是代码

NAS 服务树约定（`D:\Documents\C_learn\panda-club\fdl-server\docs\nas\services\README.md`，下称 `services/README.md`）：

- **约定（文档）**：一服务一目录一 `compose.yaml`（`services/README.md:27`）；`secrets/` 为 `0700 root:root` 且永不入 git（`services/README.md:17,54`）；16 个栈全部不发布宿主端口（`services/README.md:18`）；两条红线——容器不得挂 `/volume1` 整卷、不碰 `cf-tunnel`（`services/README.md:19`）；凭据一律放 `secrets/` 文件、compose 只读挂载、不进环境变量不写仓库（`services/README.md:83`）；数据库一应用一库一角色（`services/README.md:71,81`）。
- **代码（仓库内副本，NAS 上那份才是生效的，改两边同步）**：对账模块 `apps/account-sync/`——`src/sync.js`、`src/casdoor.js`（管理 API 用 Basic `clientId:clientSecret`，`casdoor.js:15`）、`src/hook.js`、`adapters/*`；webhook 接收器容器 `fdl-account-hook`（无凭据、只写触发标记，`apps/account-sync/README.md:25`）；主机脚本 `scripts/fdl-account-sync.sh`（cron 每分钟 `--if-triggered`、04:40 完整对账，`apps/account-sync/README.md:30`）；每轮从 `casdoor_db` 读 `app-built-in` 凭据写临时文件、跑完删（`apps/account-sync/README.md:38`）。
- **已确认的 mini-hbut 接入点**：分组与权限命名 `perm-<应用>-<群组>`（`docs/2026-10-23-统一身份与分组标准.md:12`）、用户群组 `hbut-students`/`hbut-teachers`/`other-users`（同文件 L24）。
- **未确认**：`fdl-server` 仓内没有 mini-hbut 专属的「接入程序/配置生成」代码（本工作区检索无命中，见 §9-1）。

---

## 2. 目标模型：一个审核版本 → 多份派生产物

### 2.1 总览

```
                    ┌────────────────────────────┐
   开发者 ──提交──▶ │  审核记录（review version）  │ ◀── 审核人（批准/驳回）
                    │  不可变 · 内容寻址 revision  │ ◀── 对账（只读比对）
                    └─────────────┬──────────────┘
      provisioner 幂等写入         │ 派生（每份产物都带 review_version）
        ┌──────────────┬───────────┼──────────────┐
        ▼              ▼           ▼              ▼
 ①Casdoor 应用    ②业务策略     ③目录条目      ④模块产物
   配置           （数据域/同意  catalog.json   签名包+manifest
  （T09 配方）      epoch，T11）   （契约 §7）    （T05 签名）
```

规则：

1. **单一事实源**：任何产物不得携带审核记录之外的权限语义；产物与记录不一致即视为偏差（§4.2）。
2. **派生是幂等重写**：provisioner 每次运行都按「读现状 → 算差 → 只补缺」执行（复用 `apps/account-sync/README.md:47-52` 的 snapshot→plan→apply 模式），同一审核版本重复执行结果不变（§4.1）。
3. **产物与记录一一对应**：目录条目 `review_version` 字段与审核记录绑定（契约 `module-and-auth-contracts.md:148`：同一条目只能对应一个已审核版本）。

### 2.2 审核记录字段表（与验收项 2 一一对应）

| 字段 | 类型 | 必填 | 含义 | 对应验收 2 的子项 |
|---|---|---|---|---|
| `review_id` | string (UUIDv7) | 是 | 审核记录主键（沿用 `application_reviews.id` 约定，`0002_admin_roles.sql:38-39`） | —（一致性基础设施） |
| `app_id` | string | 是 | 应用标识，`[a-z0-9_-]{2,48}`；同 ID 不同渠道视为同一模块（契约 §2 L33）；与目录条目 `app_id` 相等 | —（一致性基础设施） |
| `version` | integer | 是 | 审核版本序号，同一 `app_id` 单调递增 | —（一致性基础设施） |
| `revision` | string (hex64) | 是 | 内容寻址 sha256（沿用 `reviews.ts:132-143` 的 computeRevision 机制，输入扩展为下表全部审核字段） | — |
| `form` | `"embedded"` / `"external"` | 是 | 形态：内嵌（复用模块宿主）或网页（独立站点）；契约枚举含 `"native"`（`module-and-auth-contracts.md:141`），本期审核范围仅前两者 | **形态（内嵌/网页）** |
| `entry` | string | 条件 | `embedded` 必填：宿主 route 或 manifest 入口；`external` 为空 | **回调/入口** |
| `redirect_uris` | `{uri, kind}[]` | 是 | 回调/入口白名单；kind 沿用 `web_https / native_custom / native_loopback`（`identity-platform/web/lib/developer/contract.ts:32`；校验复用 `clients.ts:90-152` 的禁通配符规则） | **回调/入口** |
| `allowed_groups` | string[] | 是 | 允许登录/使用的 Casdoor `fdl-users` 群组名（命名约定见 §7.4 与 §9-5）；权限点 `perm-<应用>-<群组>`（`2026-10-23-统一身份与分组标准.md:12`） | **允许群组** |
| `data_domains` | `{domain, operations[], purpose}[]` | 是 | 申请的数据域与用途；域名/操作枚举以契约 §5.1（L103-114）为全集，`purpose` 为审核人可读的用途说明 | **权限/数据用途** |
| `compat` | `{min_host, platforms[], store_policy}` | 是 | 兼容范围：宿主最低版本、目标平台、商店策略（契约 L144） | **兼容范围** |
| `module` | `{manifest_url, artifact_url, publisher_key_id, release_seq}` | `remote` 必填 | 可信模块产物：发布公钥标识 + 发布序号 + 产物地址（契约 L146；`release_seq` 单调、防回放，契约 L35）；`form=embedded` 且 `kind=remote` 时必填 | **可信模块产物** |
| `casdoor` | `{application_name, client_id, expire_in_hours, refresh_expire_in_hours, token_format, token_fields[]}` | 是 | Casdoor 应用配置目标值（配方见 §7.3）；`application_name` = `app_id`（幂等键） | —（派生输入） |
| `owner` | string (developer_id) | 是 | 负责人（开发者/机构负责人）；审核、撤销、轮换的授权主体 | —（验收 1 的「负责人」） |
| `submitted_by` / `submitted_at` | string / RFC3339 | 是 | 提交人与时间（沿用 `0002_admin_roles.sql:44-45`） | 验收 1「用户可见状态」 |
| `reviewer` / `reviewed_at` | string / RFC3339 | 批准后必填 | 审核人（禁止 self-review，沿用 `reviews.ts:243-244`） | 验收 1「负责人」 |
| `decision` | `"approved"` / `"rejected"` / null | 审核后必填 | 审核结论；rejected 必须带可读原因（沿用 `reviews.ts:454-478` 的 `assertReason`） | 验收 1「审核结果」 |
| `status` | 见 §3 | 是 | 生命周期状态 | 验收 1 |
| `artifact_receipts` | `{casdoor, policy, catalog, module}` 各 `{at, result}` | 运行时 | 四份产物的写入回执（时间+成败），供对账与失败定位（§5） | 验收 1/3 |

> 与旧 `application_reviews` 的关系：旧表已有 `revision`、`submitted_by`、三个 JSONB 快照、`scope_decisions_json`（`0002_admin_roles.sql:43-54`）。新记录 = 旧结构 + 上表新增字段（`form/entry/allowed_groups/data_domains/compat/module/casdoor`），**不另建第二套账号认证**（验收 8）：审核人身份沿用 `users` + `user_roles`（`0002_admin_roles.sql:20-32`），开发者身份沿用 `developers` 表与 OIDC sub 解析（`core/.../api/developer/index.ts:78-93`）。

### 2.3 四份派生产物的边界

| 产物 | 写入者 | 内容 | 读取者 |
|---|---|---|---|
| ① Casdoor 应用配置 | provisioner（管理 API 机器凭据） | `add-application` 载荷（T09 配方，§7.3） | 登录/令牌链 |
| ② 业务策略 | provisioner → T11 的策略表 | `data_domains` 的落地（应用×数据域×操作）+ 用户同意 epoch 锚点 | 资源服务器（Rust 裁决，契约 L25） |
| ③ 目录条目 | provisioner → 目录生成器 | `catalog.json` 单条（契约 §7 全字段，§7.1） | 客户端（T07） |
| ④ 模块产物 | 开发者构建 + T05 签名链 | CDN 上的签名包/manifest | 客户端验签（Rust） |

---

## 3. 状态机

### 3.1 状态与迁移总图

```
 draft ──submit──▶ submitted ──approve──▶ approved ──provision──▶ provisioned ──activate──▶ active
   ▲                  │                      │                        │                       │   │
   └──（修改后回炉）◀──reject（可回炉）        │ 失败/回滚                │ 失败/回滚              │   │
   （见 3.2-4）                                ▼                        ▼                       │   │
                                         留在 approved         留在 approved                  suspend │   │
                                                                                                     ▼   │
                              任意非终态 ──revoke──▶ revoked（终态）          unsuspend ◀────────── suspended
```

与旧状态机（`clients.ts:53-61`）的映射：`submitted` ≈ `pending_review`；新增 `provisioned`（approved 与 active 之间的「四产物已就绪、未上架」态）；`approved` 在旧模型里是瞬态（approve 即 active，`reviews.ts:348` 注释「approve == activate」），T12 把它拉成显式态以容纳 provision 失败。

### 3.2 迁移表（触发者 / 前置 / 幂等 / 失败回滚）

| # | 迁移 | 触发者 | 前置条件 | 幂等要求 | 失败回滚 |
|---|---|---|---|---|---|
| 1 | `draft → submitted` | 开发者（owner 本人） | 必填字段齐（§2.2 必填列）；remote 条目的 `module.release_seq` 大于既有值；`revision` 可计算 | 同 `app_id` 同内容重复提交 → 返回既有 pending（复用 `ensurePendingReview` 语义，`reviews.ts:171-191`） | 无副作用：快照写入失败 → 状态不变（事务回滚，`types.ts:23-25` 的 `withTransaction`） |
| 2 | `submitted → approved` | 审核人（`identity_reviewer`，非 owner，`reviews.ts:243-244`） | `review.revision == 当前内容 revision`（`reviews.ts:258-267`）；敏感 scope 需 step-up（`admin/index.ts:335`） | 已 approved 重复批准 → 返回既有决策（`reviews.ts:360-374`） | revision 不一致 → review 标 `superseded` + 409（`reviews.ts:363,399-403`），应用留在 `submitted`，需重新提交（#4） |
| 3 | `submitted → rejected` | 审核人 | 原因 1..2000 可读（`assertReason`，`reviews.ts:56-68`） | 已 rejected 重复驳回 → 返回既有 reason（`reviews.ts:482-487`） | 同 #2（同事务条件 UPDATE） |
| 4 | `rejected → submitted`（回炉） | 开发者 | 修改后重新提交；旧 review 自动 `superseded`（复用 `reviews.ts:187-189`） | 内容未变重复提交 → 返回既有 pending | 同 #1。**修复旧模型矛盾**：旧表把 rejected 列终态（`clients.ts:59`）但 API 实际允许回炉（`core/.../api/developer/index.ts:424,558`）；T12 以「可回炉」为准并写进状态机 |
| 5 | `approved → provisioned` | provisioner（机器，非人） | 机器凭据可用；四产物按 ①→②→③→④ 顺序全部写入成功 | 全程幂等重跑（§4.1）：已成功的产物跳过或无副作用重写 | **部分失败不回滚已成功产物**，而是：状态留在 `approved` + `artifact_receipts` 记录失败环节；重试前先对账当前实际值再补缺（§5.2） |
| 6 | `provisioned → active` | provisioner 或管理员确认 | 对账通过（四产物均与记录一致）；目录条目 `status` 翻 `active`（契约 L147：仅 active 进用户可见目录） | 重复激活 → 返回既有 active 状态 | 目录翻失败 → 保持 `provisioned`（应用本就不可见，无泄漏面） |
| 7 | `active → suspended` | 管理员（`identity_admin` + step-up，沿用 `admin/index.ts:376-388`） | 必填原因 | 已 suspended 重复停用 → 返回既有状态 | 目录置 `disabled` 失败 → 保留 active 并告警（fail-closed 的反向：宁可多停一停，不可漏停；§5.3） |
| 8 | `suspended → active` | 管理员 | 对账确认无偏差 | 同 #7 | 同 #6 |
| 9 | 任意非终态 → `revoked` | 管理员（高风险，`admin/index.ts:406-418`）；developer 自我撤销仅允许 `draft/submitted`（沿用 `core/.../api/developer/index.ts:601-619` 的语义收窄） | 终态，不可逆；`allowed_groups` 权限即时收回 | 已 revoked 重复 → 返回既有 | 见 §5.4：目录先置 disabled、凭据先失效；Casdoor 侧删除能力受权限限制（§9-2），以「不再签发新令牌 + 旧 key 失效」为最低保证 |
| 10 | `provisioned → approved`（回滚） | provisioner | #5 重试仍失败且判定不可恢复 | — | 已写产物保持但应用不上架（目录不 active）；偏差由对账持续告警（§4.2） |

**secret 轮换不是状态迁移**：`active`/`suspended` 下均可执行（沿用 `rotateClientSecret`，`clients.ts:262`；`core/.../api/developer/index.ts:575-598`），语义为「旧 key 置失效时间 + 新 key 仅返回一次」（`0001_initial.sql:134`），写入审计（`secret.rotated`，契约 `contract.ts:53`）。轮换不改变状态、不触发对账偏差（产物不含 secret 明文）。

**可见性不变量**：只有 `active` 的目录条目 `status=active`（契约 L147）；其余状态一律 `pending`（仅管理员侧可见）或 `disabled`，客户端行为见 §5.1 与契约 L150。

---

## 4. 幂等与对账

### 4.1 重复处理不产生重复账户/密钥

| 资源 | 幂等键 | 机制（现状依据） |
|---|---|---|
| 学生账号（Casdoor） | `Name = hbut_<学号>` | T10 建号按该命名幂等 upsert（T10 交付记录：`provisioning.py` 幂等建号 + properties + 组归属）；T12 不新建账号，只消费 |
| 应用（Casdoor） | `application_name = app_id` | provisioner 先 `get-application` 查存在（组织管理员可读，T09 报告 `2026-11-07-...T09实测报告.md:20`），存在则比对配置，不存在才 `add-application` |
| secret | 轮换即生成新 key，旧 key 有失效时间 | `rotateClientSecret`（`clients.ts:262`）+ `client_secret_expires_at`（`0001_initial.sql:134`）；重复 rotate 产生新 key 是预期行为，旧 key 不删只失效 |
| 审核记录 | `(app_id, revision)` | 内容寻址：同内容重复提交返回既有 pending（`reviews.ts:184-185`）；单 pending 不变量（`reviews.ts:171-191`） |
| 目录条目 | `app_id` | `catalog.json` 按 id upsert（客户端侧本就按 id 合并，`module_center.js:225-253`）；重复生成覆盖同 id 条目，不追加 |
| 业务策略 | `(app_id, data_domain, operation)` | 由 T11 策略表主键保证（§7.2）；provisioner 用 upsert 语义 |
| 产物写入回执 | `(review_id, artifact)` | 每次重写前读 `artifact_receipts` + 实际值，已一致则跳过 |

**provisioner 执行模型**（复用 `apps/account-sync/README.md:47-52` 的 snapshot→plan→apply）：每一轮先对四产物取现状（snapshot），与审核记录算出 plan，plan 为空则本轮无操作（幂等达成）；安全阀沿用 account-sync 的「映射缺失即整轮停止（退出码 2）」（`apps/account-sync/README.md:47`）。

### 4.2 对账：发现「Casdoor 实际配置 ≠ 审核记录」的人工偏差

**对账时机**：① 每次 provision/activate 成功后立即一轮；② 定时全量（复用 04:40 全量对账的 cron 模式，`apps/account-sync/README.md:30`）；③ webhook 触发（复用 `fdl-account-hook` 无凭据触发器模式，`apps/account-sync/README.md:25`）。

**对账内容**（逐应用，四产物 × 审核记录）：

| 产物 | 读取方 | 比对项 |
|---|---|---|
| ① Casdoor | `get-application`（只读） | `expireInHours`、`refreshExpireInHours`、`redirectUris`、`tokenFormat`、`tokenFields`、`grantTypes`、owner/组织 |
| ② 业务策略 | T11 策略表（只读） | 已启用 `data_domains` 与记录一致；无记录外的域 |
| ③ 目录条目 | `catalog.json` 当前发布版（只读） | `status` 与生命周期一致；`review_version` = 记录版本；`module.*` 一致 |
| ④ 模块产物 | CDN manifest + 签名 | `release_seq` 不小于记录；`publisher_key_id` 在信任根内；包 sha256 与记录一致 |

**对账输出样例**：

| app_id | review_version | 产物 | 记录值 | 实际值 | 结论 | 动作 |
|---|---|---|---|---|---|---|
| `hbut_monopoly` | v3 | ①Casdoor.expireInHours | 24 | 0 | ⚠️ 不一致 | 告警 + 冻结再激活，待人工处理 |
| `hbut_monopoly` | v3 | ③目录.status | active | active | ✅ 一致 | — |
| `jump_out_hbut` | v2 | ②策略.school.grades | 无此域 | 已启用 | ⚠️ 记录外权限 | 告警 + 立即按记录**撤除**该域（记录为准，撤不升） |
| `demo_external` | v1 | ①Casdoor | 不应存在（revoked） | 仍存在 | ⚠️ 残留 | 告警 + 尝试 disable；无权限则登记 §9-2 |
| `demo_external` | v1 | ④artifact.release_seq | 1 | 3 | ⚠️ 未审核版本 | 目录强制 `disabled`，回炉重新审核 |

**偏差处理原则**：

1. **报告优先，不自动改生产 Casdoor**：T09 实测组织管理员无 update/delete 应用权限（`T09实测报告.md:21`），自动修复能力未证实（§9-2）；对账默认只告警 + 冻结受影响应用。
2. **记录为准**：实际值超出记录（多权限、多回调）→ 按记录撤除或禁用，直到重新审核；实际值低于记录（少配置）→ 冻结启用，不升级。
3. **偏差本身可审计**：每次对账结果（含一致项的计数）写审计（复用 `audit_events`，`0001_initial.sql:227` 起），actor_type 用 `system`（CHECK 允许值见 L231）。
4. **安全阀**：`allowed_groups` 引用的群组在 Casdoor 缺失 → 整轮对账停止并告警（复用 `apps/account-sync/README.md:47` 与 `2026-10-23-统一身份与分组标准.md:56`）。

---

## 5. 失败语义：任一步失败 → 应用不可用

### 5.1 总原则（fail-closed）

- 迁移计划已定死：「接入程序先创建不可用应用，完成身份权限、业务策略、签名目录和部署检查后再启用。部分失败不允许形成整个组织默认可登录的应用」（`mini-hbut-migration-plan-2026-11-01.md:118`）。
- 目录装载规则：`status != "active"`、平台不支持、`min_host` 不满足、remote 缺 `publisher_key_id`/`release_seq` → **不可用并给出可理解原因**，不得静默隐藏、不得降级为「无签名也运行」（契约 `module-and-auth-contracts.md:150`）。
- 集中检查门：「T10–T12 后……故障不创建默认开放应用」（`mini-hbut-migration-plan-2026-11-01.md:152`）。

### 5.2 失败矩阵（可见状态 × 访问结果）

| 失败场景 | 应用状态 | 目录条目 | 用户访问结果 | 说明 |
|---|---|---|---|---|
| provision ①Casdoor 失败（无凭据/403/网络） | 停在 `approved` | 不生成或 `pending` | 应用不存在/未上架 | 「权限缺失」即不可用：不得回退到「先开放后补配置」；`artifact_receipts.casdoor=failed` |
| provision ②业务策略失败 | 停在 `approved` | `pending` | 不可用 | 同上；即使 Casdoor 可登录，无策略 = 无数据访问，且目录不 active，整体不可用 |
| provision ③目录生成失败 | 停在 `provisioned` 或 `approved` | 缺条目或 `pending` | 不可用（客户端无条目） | 目录是用户可见性的唯一开关（契约 L147） |
| provision ④产物签名/校验失败 | 停在 `approved` | `pending` | 不可用 + 明确提示「模块未通过签名校验」 | 不得运行未验证代码（契约 L151、L165） |
| 部分产物成功（如 ①② 成、③ 败） | 停在 `approved`/`provisioned` | `pending` | **不可用**：目录不 active；已建 Casdoor 应用保持不可登录或不可见（§9-2 限制下以「目录不可见 + 不再推进」保证） | 不回滚已成功产物（回滚本身可能失败），靠幂等重跑 + 对账收敛 |
| 权限缺失（机器凭据未部署） | 停在 `approved` | 不生成 | 不可用 | 不得使用人的管理员账号代劳（T09 报告 `T09实测报告.md:28` 的结论） |
| 对账发现 ①②③④ 任一偏差 | 立即 `suspended`（若曾 active）或冻结激活 | `disabled` | 不可用 + 提示「配置异常已暂停」 | 见 §4.2 处理原则 |
| 管理员停用（suspended） | `suspended` | `disabled` | 不可用（明确原因，非静默消失，契约 L150） | 旧数据权限处理见 §5.3 |
| 撤销（revoked） | `revoked`（终态） | 删除或 `disabled` | 不可用 | 见 §5.4 |

### 5.3 旧数据权限不得残留的具体做法

1. **目录侧**：条目 `disabled`/删除 → 客户端不再加载（契约 L150）；已打开的实例按失效触发回收（契约 §3 失效触发清单 L62：关闭、导航离开、remount、切账号、撤销授权、宿主重启等，缺一即未验收）。
2. **用户同意侧**：权限清单升级/撤销 → `permission_epoch` 推进，旧 epoch 的同意对新能力无效（契约 §5.2 L119），撤销即时生效（L120）。
3. **令牌侧**：refresh 默认轮换、旧 AT/RT 立即失效（T09 实测 `T09实测报告.md:42-45`），因此「不签发 + 不 refresh」即可让存量会话自然收敛到 24h 内（`expireInHours`）；已轮换的旧 key 不再被接受。
4. **业务策略侧**：suspend/revoke 时把 ② 中该应用的策略行置失效 → 即使持有旧令牌，资源服务器（Rust 最终裁决，契约 L25）按「应用 × 用户 × 数据域 × 操作」交集拒绝（契约 §8 L174）。
5. **群组侧**：应用停用不影响 `hbut-students` 等用户群组的其它用途（群与权限点分离，`2026-10-23-统一身份与分组标准.md:12`）；仅收回 `perm-<应用>-<群组>` 的登录放行。
6. **secret 侧**：revoked 应用的 `client_secret` 置失效（`client_secret_expires_at`，`0001_initial.sql:134`）；旧密文保留供审计但不可再解密使用（沿用「KEK 不符即 fail-safe null」的保守语义，`core/.../api/developer/index.ts:678-690` 的注释精神）。

### 5.4 撤销（revoked）的最低保证与限制

- 最低保证（任何权限级别都能做到）：目录条目删除/`disabled`；业务策略失效；secret 失效；`perm-*` 权限点移除后不再放行登录。
- 限制：Casdoor 侧**删除应用**需要全局管理员（组织管理员 `delete-application` → 「未授权的操作」，`T09实测报告.md:21`）。无全局管理员时的替代＝上列最低保证 + 对账持续报告「已 revoked 但 Casdoor 应用仍存在」（§4.2 样例第 4 行）。删除能力是否可用，列入 §9-2。

---

## 6. 权限与凭据边界

### 6.1 申请门户能做什么 / 不能做什么

| 能（owner 本人，沿用现有 BFF 模式） | 不能（红线） |
|---|
| 提交/修改/回炉自己的申请（draft/rejected 态） | 直连 Casdoor 管理 API（门户到 Casdoor 的路由必须不存在） |
| 查看自己申请的**状态、审核结论、可读原因、审计结果**（`core/.../api/developer/index.ts:622-651` 的 audit 端点语义） | 写目录（`catalog.json` 只有 provisioner/生成器能写） |
| 查看 secret 元数据：指纹 + 末 4 位（`core/.../api/developer/index.ts:678-690`；契约 `contract.ts:86-95`） | 拿到 secret 明文（仅创建/rotate 响应一次，`contract.ts:189-194` 的 CreateAppResult 语义） |
| 轮换（§3.2 注：仅 active/suspended 且需 T12 决定是否保留自助） | 修改业务策略、修改其它应用的任何字段（owner 过滤，`core/.../api/developer/index.ts:654-665`，非本人 404 防枚举） |
| | 持有平台组织管理员、新 API 管理、NAS 管理凭据（验收 5：门户零平台凭据） |

实现约束：门户继续走 BFF + service-token 通道（`identity-platform/web/lib/developer-api/client.ts:19,53`），浏览器永不直接传 owner（契约 `contract.ts:7-10` 的 IDOR 约束）；CSRF 双提交 + Origin 校验（`identity-platform/web/lib/developer-api/bff.ts` 头注释 L4-9）。

### 6.2 机器凭据放哪（NAS secrets）

- **唯一位置**：`/volume1/services/secrets/`（`0700 root:root`，`services/README.md:17,54`），文件形态，compose 只读单文件挂载，不进环境变量、不进仓库（`services/README.md:83`）。
- **T12 需要的凭据**：Casdoor 管理 API 机器凭据（`app-built-in` Basic 或专用管理应用；T09 报告 `T09实测报告.md:28,86` 要求用机器凭据而非人的账号；现网参照：account-sync 每轮从 `casdoor_db` 读 `app-built-in` 凭据写临时文件、跑完删，`apps/account-sync/README.md:38`）。
- **使用边界**：只有 provisioner/对账容器能读到该文件；容器最小权限（参照 account-sync 的 nobody 运行、无 capability 模式，`apps/account-sync/README.md:25` 与 compose 约定 `services/README.md:150`）；凭据不落日志（`services/README.md:191`：绝不记录任何凭据）。

### 6.3 PR / 日志 / 前端红线（验收 5）

| 载体 | 红线 | 依据 |
|---|---|---|
| PR（任何仓库） | 不出现真实 secret/学号；目录/审核记录里只允许指纹、掩码 | `services/README.md:191`（文档/记录同样禁止）；审计「secret 值永不落 audit」（契约 `contract.ts:40` 注释） |
| 日志 | 请求/响应经 redact（沿用 `identity-platform/core/src/security/redact.ts` 的脱敏机制）；管理 API 调用只记非敏感结论（T09 复跑脚本即此模式：`T09实测报告.md:114`「只打印非敏感结论」） | T10 交付记录：`casdoor_admin.py`「secret 不进日志」 |
| 前端 | 只出现 `fingerprint`/`last4`/`status`/`decision`/`rejection_reason`（契约 `contract.ts:86-116`）；`Cache-Control: no-store`（`identity-platform/web/lib/developer-api/bff.ts` 头注释 L8） | 浏览器永不接触 client_secret 明文/student_id（契约 `contract.ts:5-10`） |
| 对话/工单 | 与 PR 同红线；测试清单里引用 secret 一律用 `***` + 指纹 | 验收 5 |

---

## 7. 与其它任务的接口

### 7.1 T07（客户端目录，#1168）

- **字段权威**：目录条目字段以契约 §7（`module-and-auth-contracts.md:132-165`）为准，T12 生成、T07 消费；`review_version` 是两者之间的绑定字段（L148）。
- **新字段清单**（T12 必须全部产出，remote 条目）：`app_id`、`name`/`icon`/`summary`、`kind`、`form`、`entry`、`order`、`compat{min_host,platforms,store_policy}`、`data_domains[]`、`module{manifest_url,artifact_url,publisher_key_id,release_seq}`、`status`、`review_version`（契约 L136-148）。
- **向后兼容**：客户端归一化已接受旧字段（`module_center.js:150-193`）；新条目用新字段名，映射表见契约 L155-163；旧条目缺 `publisher_key_id` 的 remote 条目一律降级为不可用（契约 L165）。
- **一致性要求（验收 6）**：T12 生成的条目必须通过 `module_center.js:150-193` 归一化后字段与契约 §7 一致；两份归一化实现（`module_center.js:150` 与 `remote_config_defaults.ts:347`）在 T12 上线前统一（见 §1.2 注意）。

### 7.2 T11（数据授权）

- T12 审核记录里的 `data_domains` 是**申请输入**；落地为「应用 × 数据域 × 操作」的策略行是 T11 的职责（契约 §8 边界表 L174：业务资源授权由后端裁决）。
- 用户同意按能力记录、`permission_epoch` 单调、撤销即时生效（契约 §5.2 L118-120）；provisioner 在 ② 中只写「策略已启用」的锚点，不直接改用户级同意。
- 验收 4 的「不残留旧数据权限」在 T11 侧的实现即策略行失效（§5.3-4）；接口约定：T12 提供 `revoke(app_id)`/`suspend(app_id)` 语义的调用点，T11 保证幂等与即时生效。

### 7.3 T09/T10（Casdoor 实测与建号）

- **T09 约束（实测，直接决定 provisioner 能力边界）**：
  - 组织管理员可**创建**应用但**改不动也删不掉**（`update-application`/`delete-application` → 「未授权的操作」，`T09实测报告.md:21`）→ provisioner 只写一次（`add-application`），后续修正依赖全局管理员（§9-2）或重新建号。
  - Casdoor 强制 `owner=admin`（`T09实测报告.md:21,57`）→ 审核记录里的 `owner` 是**业务负责人**，与 Casdoor owner 解耦，对账时不比对 Casdoor owner 字段。
  - `add-scope` 路由 404（`T09实测报告.md:25`）→ 权限表达用 `tokenFields` + 业务策略，不用 Casdoor Scope 实体（`T09实测报告.md:50,78`）。
  - device flow 未启用（`T09实测报告.md:49`）→ `form=external`（网页扫码形态）目前不可用，见 §9-4。
  - 可复制的应用配置配方（`T09实测报告.md:55-75`）：`expireInHours=24`、`refreshExpireInHours=168`（**默认 0 是陷阱**，L63-64）、`grantTypes=[authorization_code, refresh_token]`、`tokenFormat=JWT-Custom` + 4 个 `tokenFields`。provisioner 的 ① 产物模板 = 该配方 + 审核记录的 `redirect_uris`/`allowed_groups`。
  - 学号进 token 的唯一必要动作：后端建号时写 `properties.hbut_*`（`T09实测报告.md:77`）。
- **T10 接口**：自动建号 = 管理 API 建用户 + 写 properties + 组归属，幂等命名 `hbut_<学号>`（T10 交付记录）；运行时凭据 = NAS `secrets/` 里的管理 API 机器凭据（T09 报告 `T09实测报告.md:86`）。T12 的 provisioner **复用同一份机器凭据**，不另申请。
- 仍未就绪的外部条件（T10 记录）：机器凭据端到端、全局管理员权限、校园会话校验器、NAS 部署执行（SSH 关闭仅 SFTP 2222）。

### 7.4 跨仓 PR 互链与交付位置登记（验收 7）

- **涉及仓库**：`superdaobo/mini-hbut`（本仓：审核记录/门户/目录生成）× `fdl-server`（NAS 接入程序、secrets 文件、部署脚本）× `OCR-services`（T10/T11 后端所在仓，T10 记录：PR #7 即在此仓）× 可能新增的接入程序仓库（§9-1 未确认）。
- **互链格式**（沿用契约 §10 的互链要求 `module-and-auth-contracts.md:200`「主仓与后端配对 PR 互链，写明版本组合、部署先后、回退方式」）：
  1. 每个 PR 描述列出配对 PR 链接 + 必须同时部署的版本组合；
  2. 部署先后：secrets/接入程序（NAS）→ 审核/目录（主仓）→ 客户端（T07 消费端）；
  3. 回退方式：目录回退到上一 `review_version`（条目按 id 覆盖，§4.1）+ 对账恢复。
- **交付位置登记（验收 7 前半）**：未确认的 NAS 仓库/目录（如 provisioner 代码落点）由任务负责人在对应 issue 里**先登记交付位置**（仓库 + 目录路径 + 生效环境）再开工；本工作区检索未在 `fdl-server` 找到 mini-hbut 接入程序代码（§9-1），故 T12 开工前必须完成该登记。
- **群组命名**：`allowed_groups` 的取值必须来自 `fdl-users` 现有群组（`hbut-students`/`hbut-teachers`/`other-users` 等，`2026-10-23-统一身份与分组标准.md:20-24`）；新群组先改标准文档再加（「要改规则，先改这一篇」，同文件 L3）。

---

## 8. 验收映射表

| # | T12 验收项 | 本文落点 | 将来需要的测试/证据 |
|---|---|---|---|
| 1 | 申请/更新/驳回/启用/停用/撤销与 secret 轮换的用户可见状态、负责人、审计结果 | §2.2（字段表）、§3（状态机+迁移表）、§6.1（门户可见性） | 状态机表驱动测试：每个迁移的正/反例（合法迁移成功、非法迁移 409 且状态不变）；负责人解析（owner 过滤 404 防枚举）；审计断言：每个迁移产生且仅产生一条 `audit_events`（actor/result/target 齐全）；门户 DTO 只含 §6.1 允许的字段 |
| 2 | 审核内容含形态、回调/入口、允许群组、权限/数据用途、兼容范围、可信模块产物 | §2.2（字段表逐列对应）、§3.2（提交前置校验） | 提交校验测试：六类字段缺失/非法时 400 且状态不变；`allowed_groups` 引用不存在的群组 → 拒绝（安全阀）；remote 缺 `publisher_key_id`/`release_seq` → 拒绝上架 |
| 3 | 同一审核版本对应 Casdoor、业务策略、目录状态；重复处理无重复账户/key；人工偏差可被对账发现 | §2.1（单一事实源）、§4.1（幂等键表）、§4.2（对账+样例表） | 幂等测试：同一审核版本 provision 跑 N 次 → 账户/应用/条目/key 数量不变（断言用 get 类只读 API 计数）；重复提交返回既有 pending；偏差注入测试：测试 Casdoor 中手工改一个 `expireInHours`，下一轮对账必须报出（§4.2 样例行 1） |
| 4 | 配置任一环节失败或权限缺失时应用保持不可用（不出现全组织默认可登录、不残留旧数据权限） | §5（全部）、§3.2（#5/#10 回滚） | 故障注入清单：① 断凭据 ② 断 Casdoor 网络 ③ 目录写失败 ④ 产物签名坏 ⑤ 权限缺失（无全局管理员）——每类断言：目录条目 `status != active`、目录不可见、数据请求全部被拒；停用/撤销后旧令牌/旧实例的拒绝测试（§5.3 六条逐项） |
| 5 | 申请门户不持有平台组织管理员/新 API/NAS 管理凭据；不把真实 secret 存入 PR/日志/前端 | §6（全部） | 凭据面扫描：门户部署产物与 .env 清单中无管理凭据（grep + 部署清单审查）；日志断言：全链路抓包/日志中无 secret 明文（用指纹代替）；前端断言：网络面板/存储中无 `client_secret` 明文（仅 fingerprint/last4） |
| 6 | 用测试清单证明创建/更新/失败重试/停用/撤销的结果，并与 T07 约定目录字段一致 | §7.1、§1.2 | 端到端测试清单（5 类场景×4 产物×目录字段断言）：创建→目录条目逐字段等于契约 §7；更新（release_seq+1）→ 条目更新且旧 `review_version` 条目被替换；失败重试→不产生第二份产物；停用→`disabled`；撤销→条目删除/`disabled` 且不可再激活；归一化一致性：同一条目过 `module_center.js:150` 与 `remote_config_defaults.ts:347` 两份归一化结果一致 |
| 7 | 未确认的 NAS 仓库由负责人先登记交付位置；跨仓 PR 互链，不擅自在无关仓库部署 | §7.4、§9-1/§9-3 | 流程证据：T12 开工 issue 含「交付位置登记」（仓库+目录+生效环境）；每个跨仓 PR 描述含互链三要素（版本组合/部署先后/回退）；部署记录：所有变更只发生在登记过的仓库/目录 |
| 8 | 复用现有审核/发布流程，不建设第二套账号认证 | §1.1（复用清单）、§2.2（关系说明）、§6.1 | 代码审查断言：审核身份仍走 `users`+`user_roles`（`0002_admin_roles.sql:20-32`）与 OIDC sub 解析（`core/.../api/developer/index.ts:78-93`）；无新增认证服务/新 issuer；目录发布走既有 CDN 静态包通道（`core.js:1014`），无新增鉴权端点 |

---

## 9. 未核实事项清单（诚实列表）

以下事项在本工作区（含可读的 panda-club 文档）内**找不到确定证据**，T12 实施前必须逐项确认；设计中的相关决策已按「未证实＝不可用」处理：

1. **NAS 接入程序（provisioner）的实际仓库位置**：`fdl-server` 仓内 `docs/nas/` 下无 mini-hbut 专属接入/配置生成代码（本工作区检索 0 命中）；T10 记录表明 T10 的 Casdoor 代码在 `OCR-services` 仓（PR #7）。provisioner 落 `fdl-server`、`OCR-services` 还是新仓，**未确认**——需负责人按 §7.4 先登记交付位置。
2. **Casdoor 应用配置 API 的可达性边界**：组织管理员 `update-application`/`delete-application` 被拒（`T09实测报告.md:21`）已证实，但**专用机器凭据（`app-built-in`）是否拥有全局管理员权限未实测**（T09 只以组织管理员账号实测）。若机器凭据同样无 update/delete 权限，则 §5.4 的「Casdoor 侧删除」与 §4.2 的「自动修复」均不可用，只能靠最低保证 + 人工。
3. **目录（`catalog.json`）的生成物交付位置与发布通道**：客户端目前从 CDN 读 `${moduleCdnBase}/${channel}/catalog.json`（`apps/client/src/utils/more_modules/core.js:1014`，基址 `module_center.js:1`）；生成器代码放主仓还是 NAS、走静态 CDN 还是 NAS 服务（迁移计划 L119「目录可以来自 NAS，静态包继续用 CDN」给了两条路）——**未确认**，需登记。
4. **网页（external）形态的可行性**：`add-scope` 404 与 device flow 未启用（`T09实测报告.md:25,49`）意味着 R3「网页扫码」路径未实测（契约 L184 标「待实测」）。本期审核记录中 `form=external` 的设计以「待实测通过后才开放」为前提；**扫码/设备流的替代方案未定**。
5. **`allowed_groups` 的群组命名规范在应用审核场景的适用性**：`perm-<应用>-<群组>` 与 `hbut-students`/`hbut-teachers`/`other-users`（`2026-10-23-统一身份与分组标准.md:12,24`）已存在，但该标准写于 2026-10-23 且面向对账场景；应用审核是否新增专用群组（如按应用命名）还是复用现有群组，**未确认**（文档 L24 注「各应用自己的注册方式（以后定）」）。
6. **新门户的部署位置**：旧 core 部署在 Vercel（`identity-platform/core/.vercel/` 目录存在）；新审核/申请门户继续 Vercel、迁 NAS（`services/README.md` 的服务树）还是内嵌到主仓，R2 仍标「待决策」（契约 L183：本期先做「审核清单为权威 + 门户只读状态」）——**未确认**。
7. **旧 identity-platform 存量审核记录的迁移/对账方案**：R9「迁移 identity-platform」未开始（契约 L190），旧 `oauth_applications`/`application_reviews`（`0001_initial.sql:117`、`0002_admin_roles.sql:38`）中的存量应用如何映射到新审核记录（或直接随 T15 退役），**未确认**；T12 设计默认「新记录从零开始，存量走 T13/T15 退役线，两者不做自动迁移」。
8. **「撤销」在 Casdoor 侧的完成度**：无 update/delete 权限时（§9-2），revoked 应用只能做「目录不可见 + 策略失效 + secret 失效 + 不再签发」，应用对象本身残留在 Casdoor（对账会持续报告，§4.2 样例行 4）。该残留是否可接受、是否申请全局管理员清理，**未确认**（T09 报告 §5 已列出需全局管理员清理的测试应用清单，`T09实测报告.md:88-101`）。

---

## 附录 A：本文引用的证据文件清单

| 文件 | 用途 |
|---|---|
| `identity-platform/core/src/api/developer/index.ts` | 旧申请方 API（§1.1） |
| `identity-platform/core/src/api/admin/index.ts`、`admin/reviews.ts`、`domain/clients.ts` | 旧审核方/状态机（§1.1、§3 基线） |
| `identity-platform/web/lib/developer/contract.ts`、`web/lib/developer-api/{bff,client}.ts` | 旧契约/BFF 边界（§6） |
| `identity-platform/core/migrations/0001_initial.sql`、`0002_admin_roles.sql` | 数据模型（§1.1、§2.2） |
| `apps/client/src/utils/module_center.js`、`more_modules/core.js`、`utils/remote_config_defaults.ts`、`components/MoreView.vue` | 客户端目录消费（§1.2、§7.1） |
| `docs/architecture/contracts/module-and-auth-contracts.md` | 冻结契约（§2/§4/§5/§7 权威字段） |
| `docs/architecture/mini-hbut-migration-plan-2026-11-01.md` | 任务定义与 fail-closed 要求（§0、§5） |
| `D:\Documents\C_learn\panda-club\2026-11-07-mini-hbut-Casdoor-T09实测报告.md` | Casdoor 权限边界与配置配方（§7.3、§9） |
| `D:\Documents\C_learn\panda-club\fdl-server\docs\nas\services\README.md`、`apps/account-sync/README.md`、`src/casdoor.js`、`docs/2026-10-23-统一身份与分组标准.md` | NAS 侧现状与对账模式（§1.3、§4、§6.2） |
