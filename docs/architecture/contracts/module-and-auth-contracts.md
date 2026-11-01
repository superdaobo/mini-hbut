# 模块与授权公共契约（T01-B · Epic #1161 / Issue #1162）

> 版本：**v1（冻结）**，2026-11-01。作者：Mini-HBUT 客户端维护者（统筹者）。
> 前置：[事实基线与跨端能力矩阵](./facts-and-baseline.md)（T01-A）。
> **契约稳定性**：字段名一经冻结，下游不得自行改名；**允许**新增可选字段（向后兼容），**删除/改名/改变语义**必须先回到 Epic #1161 更新本文件并通知下游任务负责人。
>
> | 消费者 | 依赖本文件哪些章节 |
> |---|---|
> | T04 模块隔离 #1165 | §2（身份）、§3（实例）、§5（权限） |
> | T05 签名与验证 #1166 | §2（清单与签名覆盖范围） |
> | T06 受控请求 #1167 | §4（信封）、§5（权限）、§6（能力语义） |
> | T07 宿主 SDK 与目录 #1168 | §3、§4、§7（目录条目） |
> | T08 样板模块 #1169 | §2、§4、§7 |
> | T11 数据授权（后端） | §5、§7 |
> | T12 接入流程 #1170 | §7（目录条目）、§9（R1–R9） |

---

## 1. 术语与边界

- **模块**：在应用中心打开、可独立更新的一组页面与业务代码（可含 JS 解析规则）。本期只允许**只读**业务能力。
- **能力（capability）**：模块可请求的最小权限单元，用字符串标识（§5.1）。模块**不得**直接获得 IPC、桥令牌、Cookie 或原生句柄。
- **宿主**：Mini-HBUT 主壳（含模块容器）。
- **受控请求**：模块请求学校数据时，由 Rust 按「登记 host/path/method ∩ 已验证清单权限 ∩ 用户同意 ∩ 当前实例与账号」执行并返回结构化结果（§6）。
- **不变量**：任何权限判断的**最终裁决在 Rust**；前端校验只用于提前提示，不作为授权依据。

## 2. 模块身份（manifest，T05 冻结实现细节）

模块包根目录必须含 `manifest.json`。字段（**JSON 键名为 snake_case**，同时接受既有 camelCase 别名）：

| 字段 | 类型 | 必填 | 语义 |
|---|---|---|---|
| `module_id` | string | 是 | 全局唯一，`[a-z0-9_-]{2,48}`；同一 ID 的不同渠道视为同一模块 |
| `version` | string | 是 | 语义版本；同 ID 内单调 |
| `release_seq` | integer | 是 | **发布序号**，单调递增；用于防回放（比 `version` 更可靠） |
| `channel` | `"main"\|"dev"\|"latest"` | 是 | 与既有 `normalizeModuleCenterChannel` 一致 |
| `module_name` / `entry_path` | string | 是 | 展示名 / 入口相对路径（默认 `index.html`） |
| `package_sha256` | string(hex64) | 是 | **必填**（现状为可选，T05 收紧） |
| `min_compatible_version` | string | 否 | 兼容的宿主最低版本 |
| `compat` | object | 是 | `{ "host_min": string, "bridge_protocol": integer }`；协议版本本期固定 `1` |
| `permissions` | string[] | 是 | 能力标识列表（§5.1），空数组表示纯静态模块（无受控请求） |
| `publisher_key_id` | string | 是 | 发布公钥标识（客户端内置信任根索引） |
| `signature` | object | 是 | `{ "alg": "ed25519", "key_id": string, "value": base64url }` |

**签名覆盖范围（规范化字节）**：对「上述除 `signature` 外全部字段」按 key 字典序、无空白、UTF-8 序列化后的字节签名。数组保持给定顺序。**任何字段被改写都必须导致验签失败**；T05 负责给出规范化实现与测试向量。

**与现状的映射**：现有 `prepare_module_bundle` 请求字段 `module_id/version/channel/package_url/package_sha256/entry_path/module_name/min_compatible_version`（`apps/client/src-tauri/src/modules/module_bundle.rs:22-35`）全部保留，新增字段为可选扩展；**本契约只把 `package_sha256` 从「可选」改成「有签名时必须匹配」**，向后兼容期内无签名包仍可加载（但不得获得任何敏感能力）。

## 3. 运行实例（instance）

模块一旦在宿主中打开即产生**实例**；所有受控调用都绑定实例，而不是绑定「某个页面」或「某个模块 ID」。

| 字段 | 类型 | 语义 |
|---|---|---|
| `instance_id` | string | 宿主生成，随机且不可预测 |
| `module_id` / `version` / `release_seq` | — | 打开时固定；**运行中不因目录或 CDN 变化而切换版本** |
| `account_scope` | string | 绑定的账号作用域（学校账号主体哈希），切账号即失效 |
| `granted_capabilities` | string[] | 本次实例被批准的 ∩ 实例权限、清单权限、原生上限 |
| `permission_epoch` | integer | 生成实例时的用户同意版本（§5.2） |
| `created_at` / `last_active_at` | RFC3339 | 用于超时与回收 |

**失效触发（全部必须实现，缺一即视为未验收）**：关闭、导航离开、remount、协议版本不兼容、账号切换、用户撤销授权、权限清单升级、宿主重启。

**失效后的行为**：旧 `instance_id` 的任何请求一律拒绝（错误码 `instance_invalid`），不得「自动续期给新实例」。

## 4. 请求 / 响应 / 错误 / 超时信封

所有「模块 → 宿主能力」的调用使用同一信封（HTTP 桥与 postMessage 通道一致，仅传输方式不同）：

```json
// 请求
{ "request_id": "uuid-v4", "instance_id": "…", "capability": "school.fetch",
  "params": { }, "deadline_ms": 8000 }

// 成功
{ "request_id": "uuid-v4", "ok": true, "data": { } }

// 失败
{ "request_id": "uuid-v4", "ok": false,
  "error": { "kind": "…", "message": "可显示给用户的中文短语", "retryable": false } }
```

- `request_id` 用于去重与重放防护：同一实例内重复 `request_id` 只执行一次，第二次直接返回首次结果或 `duplicate_request`。
- `deadline_ms` 上限 **15000**，缺省 8000；宿主必须在超时后返回 `timeout`，不得挂起。
- **错误 `kind` 固定集合**（新增需本文件升级）：
  `unauthenticated`（学校会话缺失/过期）、`forbidden`（未授权/越域）、`not_supported`（平台或能力不支持）、`not_registered`（host/path/method 未登记）、`invalid_params`、`duplicate_request`、`timeout`、`too_large`（响应超限）、`instance_invalid`、`protocol_mismatch`、`internal`。
- 响应体**不得**包含 Cookie / Set-Cookie / Authorization / 宿主令牌；`message` 不得回显凭据片段。
- 桥传输层另有 `401 { success:false, error:{ kind:"bridge_auth_required"|"bridge_auth_invalid" } }`（T02 契约，与上面信封不冲突：前者是「页面→桥」，后者是「模块→宿主能力」）。

### 4.1 媒体子资源能力串（§4 的补充，T02 实现）

无法携带 header 的媒体加载（`<video>`/`<img>`）使用**路由级短时能力串**，与主令牌严格区分：

- 形式：`base64url(HMAC-SHA256(bridge_session_token, "media|<目标地址>|<exp>"))`，`exp` 为 Unix 秒；
- 只授权**一个**目标地址，不授予任何其他路由权限；与主令牌不同源、不可复用；
- 由已持有令牌的主窗口派生（WebCrypto），Rust 用同一令牌复算校验（常量时间比较）；
- TTL 30 分钟（视频 Range 请求需要跨时长有效）；过期或目标不符一律 401；
- 模块 iframe 拿不到令牌 ⇒ 无法派生 ⇒ 无法代理学校媒体内容；
- 传输层对 `/proxy/video` 只放行 `GET/HEAD`，其余方法一律拒绝。

## 5. 权限与用户同意

### 5.1 能力标识（本期全集，只读）

| capability | 语义 | 首个消费者 |
|---|---|---|
| `school.fetch` | 受控只读学校请求（§6） | T06/T08 |
| `school.profile` | 本人基础信息（学号/姓名/学院等） | T08 |
| `school.schedule` | 本人课表 | T08 |
| `school.grades` | 本人成绩 | 后续（本期不开放给远程模块） |
| `ui.badge` | 在应用中心区域展示未读/状态角标 | 后续 |

- 模块**不得**声明或使用本期全集之外的能力；声明了但未登记的能力一律拒绝（`not_supported`）。
- 能力是**字符串白名单**，不做前缀通配。

### 5.2 用户同意与权限版本

- 用户在打开模块时看到「用途 + 申请的能力清单」，可逐项同意/拒绝；**同意按能力记录**，不是「一次同意全部」。
- `permission_epoch` 单调递增：应用新增能力（清单 `permissions` 变化）必须递增 epoch，旧 epoch 的同意**不得**覆盖新能力（即：只改代码不加能力不打扰用户；加能力必须重新征求同意）。
- 撤销即时生效：用户撤销后，当前实例的相关能力立刻失效（不必等待重启）。
- 同意与拒绝都要留审计记录，**不得**记录 Cookie/令牌/完整敏感数据。

## 6. 受控请求语义（T06 实现，契约层要求）

1. 只接受**登记过的** `(host, port, method, path 规范形)`；不接受完整 URL、不跟随到未登记目标（含重定向）。
2. 请求自动携带对应账号的学校会话；**模块自带 Cookie / Host / Authorization / 会话头一律拒绝或丢弃**。
3. 响应剔除 `Set-Cookie` 等凭据字段；超过体积上限返回 `too_large`。
4. 并发、频率、响应体、总时长均有上限；非幂等请求不得因重试或重登被盲目重放。
5. 账号切换后，在途请求的结果**不得**进入新账号的界面（丢弃或返回 `instance_invalid`）。
6. 首期**只读**；写操作一律 `forbidden`。

## 7. 目录条目（T12 生成 → T07 消费）

统一目录条目（数组元素），**向后兼容**现有 `normalizeModuleCenterEntry`（`apps/client/src/utils/module_center.js:150-185`）字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `app_id` | string | 是 | 应用标识；可等于 `module_id` |
| `name` / `icon` / `summary` | string | 是 | 应用中心展示 |
| `kind` | `"internal"\|"remote"` | 是 | 沿用现有语义 |
| `form` | `"embedded"\|"external"\|"native"` | 是 | 内嵌宿主 / 外部网页 / 原生页面 |
| `entry` | string | 条件 | `embedded`/`native` 必填（route 或 manifest 入口） |
| `order` | number | 否 | 展示排序 |
| `compat` | object | 是 | `{ "min_host": string, "platforms": ["windows","macos","android","ios"], "store_policy": "allowed"\|"disabled" }` |
| `data_domains` | object[] | 是 | `[{ "domain": "school.schedule", "operations": ["read"], "purpose": string }]` |
| `module` | object | `remote` 必填 | `{ "manifest_url", "artifact_url", "publisher_key_id", "release_seq" }` |
| `status` | `"active"\|"pending"\|"disabled"` | 是 | 仅 `active` 可进入用户可见目录 |
| `review_version` | string | 是 | 与 T12 审核记录对应；**同一条目只能对应一个已审核版本** |

**装载规则**：`status != "active"`、平台不支持、`min_host` 不满足、或 remote 条目缺 `publisher_key_id`/`release_seq` → **不可用并给出可理解原因**，不得静默隐藏、不得降级为「无签名也运行」。
**未签名远程配置**只能影响展示与已有开关，**不得**扩张原生权限、替换信任根或授权执行新代码。

**与现有目录字段的映射（消费方 T07 必须两种都接受）**

| 新字段 | 现有字段（`apps/client/src/utils/module_center.js:150-185`） | 说明 |
|---|---|---|
| `app_id` | `id` / `module_id` | 新条目用 `app_id`，旧条目用 `id` |
| `summary` | `description` / `desc` | 两者都接受 |
| `entry` | `view` / `route` | `embedded`/`native` 的入口 |
| `module.manifest_url` | `manifest_url` / `manifestUrl` | remote 条目 |
| `compat.min_host` | `min_compatible_version` | 含义相同，新条目用 `compat.min_host` |
| `kind` | `kind` / `type` | 语义不变（`internal`/`remote`） |
| — | `key_required` / `order` | 旧字段 `key_required` 仅对内置 `shuake` 等旧条目不废弃；`order` 沿用 |

**旧条目兼容策略**：缺 `app_id`/`compat`/`status` 的旧条目按 `kind=internal`、`status=active` 处理（保持现有可用性）；**remote 旧条目缺 `publisher_key_id` 时一律降级为不可用**并提示「模块未签名」，不得为了兼容而运行未验证代码。

## 8. 四类职责边界（细化 §8 of T01-A）

| 边界 | 决定什么 | 谁裁决 | 不得做什么 |
|---|---|---|---|
| 原生权限 | 模块能否调用某条 IPC/桥/系统能力 | Rust（capability + 运行时检查） | 前端「同意」不能替代原生上限；远程配置不能扩张 |
| 签名清单 | 这个包是不是发布者签的、字段有没有被改 | Rust（内置信任根验签） | 不因缓存命中、离线、回退而跳过；不因「旧包兼容」给未签名代码敏感能力 |
| 用户同意 | 这个用户允许这个应用用哪些能力 | 宿主记录 + Rust 复核 epoch | 不把「内嵌免登录」解释为「自动同意数据权限」 |
| 业务资源授权 | 这个应用能否读写这个用户的这类数据 | 后端（应用 × 用户 × 数据域 × 操作） | 不把资源 audience 与调用客户端标识混为一谈（依 T09 实测） |

## 9. R1–R9 需求追踪（10-30 需求 → 本期任务）

来源：`docs/architecture/mini-hbut-architecture-and-migration-requirements.md` §5.2（逐条现状审计）与 `docs/architecture/mini-hbut-migration-plan-2026-11-01.md` §4。

| R | 需求 | 本期状态 | 归属任务 | 落点/证据 |
|---|---|---|---|---|
| R1 | 登录后自动在 Casdoor 注册账户 | **待实测/待决策**（幂等 upsert vs 每次新建、唯一键、合并规则均未定） | T10（依赖 T09） | OCR#2；需测试应用与管理员 |
| R2 | 开发者平台改为后端代理 Casdoor | **待决策**（后端角色＝OIDC 客户端 / 管理 API 调用方？） | T12 | #1170；本期先做「审核清单为权威 + 门户只读状态」 |
| R3 | 两种接入形态（内嵌 / 网页扫码） | R3-内嵌：**已定目标**（复用模块宿主，免重复学校登录 ≠ 免数据授权）；R3-网页扫码：**待实测** | T07 / T09 | 内嵌见 §3/§7；网页扫码见 T09 矩阵 |
| R4 | 数据互通 | **待决策**（方向、粒度、存储位置） | T11 | OCR#3；本期只定义「端侧读取 vs 云端分享」两条路径，不做全量上传 |
| R5 | Rust 收缩为全链路 Cookie 层 | **已定目标**（本期只新增受控请求能力，**不迁存量命令**） | T06 / T08 | 存量 238 命令保持；新业务优先模块化 |
| R6 | 前端热更承载增量请求与页面 | **已定目标**（本期＝模块页面/解析更新；**不含整包热更激活器**） | T05/T07/T08 | §2/§3；整包热更现状见 T01-A §7 |
| R7 | 应用独立窗口 + 持续 NAS 通信 | **本期不扩大**（复用现有宿主窗口；不建 NAS 状态通道） | 后续 | 需求文档 §5.2.8；Epic §9 明列不扩大 |
| R8 | 两家新接口 | **阻塞**（无域名/协议/鉴权输入） | 后续 | 事实缺口 G6；不猜测、不预开放任意 host |
| R9 | 迁移 identity-platform | **未开始**（依赖 T13/T14） | T13/T15 | 需映射对账与兼容窗口 |

## 10. 两个验收门（可勾选版）

**旧认证止损门（T03 #1164 关闭前必须全部勾选）**
- [ ] 合成身份下，自报学号＋新设备密钥不能接管既有身份，也不能读取其受保护数据。
- [ ] 缺失/错误/过期/跨事务证明不产生部分绑定或部分设备记录，失败可重复复现。
- [ ] 论坛客户端自报字段不能取得他人身份或管理员权限（不能只堵管理员自动判定）。
- [ ] 坏 JWT 不降级为 HMAC 或其他弱认证成功。
- [ ] 旧论坛签发 / 旧 HMAC / 旧 Identity JWT 三条路径各自写明支持条件与停用条件，无旁路重新取得已停用凭据。
- [ ] 主仓与后端配对 PR 互链，写明版本组合、部署先后、回退方式。

**新身份切换门（T13 #1171 关闭前必须全部勾选）**
- [ ] 每个被接受的 issuer 单独绑定 JWKS/aud/算法/claim/权限规则；未知 issuer、串 kid、错 aud 一律拒绝且不降级。
- [ ] 登录、刷新/重认证、单设备退出、登出、切账号的真实流程可用，凭据按约定保存。
- [ ] 论坛历史、游戏资产、云同步在切换后归属正确；注销重建不串号。
- [ ] 旧凭据兼容窗口有明确起止与观测指标，关闭后无旁路。
- [ ] 统一身份不可用时，学校本地功能与离线缓存不受影响，云端功能给出可理解提示。

## 11. 变更流程

1. 任何字段/语义变更 → 先提 Epic #1161 评论说明动机与影响面 → 更新本文件版本号（v1 → v2）→ 通知 §头部表格中的下游负责人。
2. 下游任务**不得**为了让自己测试通过而放宽本文件中的安全约束（Epic §8）。
3. 本文件与子 Issue 正文冲突时，以子 Issue 的验收标准为准，并立即修正本文件（记录在 PR 描述里）。
