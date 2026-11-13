# Epic #1243 PR 审查指南（给审查者/AI 用）

> 本文件是**审查口径**。目的是让一个**没有上下文**的审查者能独立判断：
> 这个 PR 该做什么、怎么验、什么算通过、什么**不是**缺陷。

---

## 0. 审查前必读：三条判定规则

### 规则 A：这是「默认关」的增量代码，不是线上行为

Epic 所有新能力都在 env 开关后面，**默认全部关闭**：

| 开关 | 默认 |
|---|---|
| `MINI_HBUT_APP_DATA_CONSENT_ENFORCED` | false |
| `MINI_HBUT_APP_DATA_API_ENABLED` | false |
| `MINI_HBUT_APP_LAUNCH_ENABLED` | false |
| `MINI_HBUT_DATA_RIGHTS_ENABLED` | false |
| `MINI_HBUT_CLOUD_DOMAINS_ENABLED` | false |
| `MINI_HBUT_APP_CATALOG_ENABLED` | **true**（无数据时返回空目录） |
| `VITE_ENFORCE_REMOTE_MODULE_SANDBOX` | 关 |

**判定**：如果 PR 里某能力「没有调用点 / 默认不生效」，这**不是缺陷**，是刻意的零回归设计。
真正要问的是：**开关打开后行为对不对**，以及**开关关闭时是否与改动前逐字一致**。

### 规则 B：BLOCKED 不是缺陷

以下 4 类**本机无法验证**，已如实标注，审查时**不要**当缺陷报：

1. 学校可信身份根（`FailClosedVerifier` 就是生产行为：拿不到可信主体就拒绝）
2. Casdoor 真实联调（无凭据）
3. 真实 PostgreSQL（本机无 PG）
4. Android/iOS 真机、法律/商店审查

**判定**：看到「BLOCKED」字样，检查它是否**有对应的机制代码 + 单测**。有 → 通过；没有 → 缺陷。

### 规则 C：产品红线（违反任何一条 = 直接 FAIL）

| # | 红线 | 违反示例 |
|---|---|---|
| R1 | **学校登录是唯一显式登录** | 新增任何账号密码输入框、新增注册流程 |
| R2 | **真实学号是身份**，不能是设备签名/自报 | 用 device_id 或客户端传入的学号当身份 |
| R3 | **撤销只撤额外数据域，不影响学号登录** | 撤销时清 session / 登出 |
| R4 | **第三方只读 OCR 分类 API** | 让第三方直连学校教务、透传学生 Cookie |
| R5 | **云端禁止按数据年龄告警/强制刷新** | 出现「数据已过期」「超过 2 小时请刷新」「强制刷新」 |
| R6 | **第三方只看 `last_synced_at`** | 响应里出现 `school_fetched_at` |
| R7 | **旧备份不得复活已删数据** | 合并时按时间戳允许复活墓碑对象 |
| R8 | **应用不能靠用户同意扩权** | 授予域只查 `DOMAIN_REGISTRY`，不查应用白名单 |
| R9 | **不伪承诺** | 声称「进程被杀后仍能同步」、iOS 承诺固定周期 |
| R10 | **不静默上传** | 旧「关闭同步」用户直接开始上传，无告知 |

---

## 1. 怎么验证（命令 + 期望数字）

### OCR-services 仓库

```bash
# 该 PR 自己的测试
python -m pytest -q -p no:cacheprovider tests/<该PR的测试文件>

# 全量（必须无 failed）
python -m pytest -q -p no:cacheprovider

# 开关全开时的路由数（关键：确认端点真的注册了）
MINI_HBUT_APP_DATA_API_ENABLED=true MINI_HBUT_APP_DATA_CONSENT_ENFORCED=true \
MINI_HBUT_APP_LAUNCH_ENABLED=true MINI_HBUT_DATA_RIGHTS_ENABLED=true \
MINI_HBUT_CLOUD_DOMAINS_ENABLED=true \
python -c "import runtime.entrypoint as e; print(e._OPTIONAL_ROUTES, len(e.app.routes))"
```

**基线数字**（各 PR 分支上，合并全部 PR 后为 **2962 passed / 30 skipped**）：

| PR | 该分支全量 |
|---|---|
| #50 | 2688 |
| #51 | 2696 |
| #52 | 2653 |
| #53（栈在 #50 上） | 2719 |
| #54 | 2736 |
| #55 | 2759 |
| #56 | 2784 |
| #57 | 2802 |
| #58 | 2821 |
| #59 | 2844 |
| #60 | 2844 |
| #61 | 2844 |
| #62 | 2865 |
| #63 | 2929 |
| #64 | 2949 |
| 全合并 | **2962** |

### mini-hbut 仓库

```bash
cd apps/client
npm run typecheck     # 必须通过
npm run build         # 必须 ok
npm run test:ci       # 基线见下
```

**基线数字**：

| PR | test:ci |
|---|---|
| main 基线 | 4217 |
| #1274 | 4230 |
| #1275 | 4241 |
| #1276 | 4227 |
| #1277 | 4227 |
| #1278 | 4235 |
| #1279 | 4238 |
| #1280 | 4280 |
| #1281 | 4230 |
| #1287 | 4245 |
| #1288 | 4271 |
| #1289 | 4295 |
| #1290 | 4310 |
| #1291 | 4290 |
| 全合并 | **4442** |

**唯一允许的失败**：`src/utils/ios_deep_link_scheme_patch.spec.ts`
（`SyntaxError: Invalid or unexpected token`，主工作区同样复现，**与本 Epic 无关**）。

---

## 2. 每个 PR 的审查要点

### OCR-services

**#50 逐域同意层 + 学业域扩到 8 个**
- 必查：`decide_consent` 判定顺序（domain_unknown → required → revoked → policy_stale → allow）
- 必查：`PgAppDataConsentStore` 是否**注入 connect**（不得自己读 env / 自己建 pool / 自己建表）
- 必查：`consent_revision` 是否单调递增
- 红线：R3、R8

**#51 分域云快照 + 分层限流**
- 必查：`decide_domain_write` 的 CAS（`base_version` 不匹配 → `conflict`，回传服务端版本）
- 必查：`cloud_synced_at` **只取服务端时钟**，绝不用客户端 payload 里的时间
- 必查：限流「被拒不推进冷却」（拒绝路径不调 `store.mark`）
- 必查：迁移 `0006_*.sql` 与 `*_rollback.sql` 成对
- 已知设计：`rate_limit=None` 在注册处（接线在 #62 完成）—— 不是缺陷

**#52 同号多设备 school_verified**
- 必查：唯一索引条件改为 `WHERE status='active' AND bound_by <> 'school_verified'`
- 必查：`school_verified=True` 时**跳过**「已有活跃设备」守卫
- 必查：迁移 `0007_*.sql` 成对
- 红线：R2（不能把 device 当身份）

**#53 清单三字段校验**
- 必查：`allowed_origins` 只接受裸 https origin（拒绝 `*`、`http://`、带路径、大写 host）
- 必查：错误消息**只含字段路径**，不回显取值

**#54 公开应用目录**
- 必查：**字段白名单**（未知字段一律丢弃，`client_secret` 不得透出）
- 必查：fail closed（env 缺失/非法 → `{"manifest_version":0,"apps":[]}`，不是 500）
- 必查：目录**含 disabled**（带 status），白名单**不含**

**#55 逐类授权 API**
- 必查：**双层上限**（`DOMAIN_REGISTRY` ∩ 应用白名单 grant），越权 → 403 且**零写入**
- 必查：主体只从注入 principal 取（body 里的 `student_id` 必须被忽略）
- 必查：撤销幂等（`revoked=0` 不是错误）、响应含 `identity_sso_unaffected`
- 红线：R3、R8

**#56 对象级合并与墓碑**
- 必查：**墓碑粘性**（已删对象不能被任何非墓碑条目复活，哪怕 `updated_at` 更新）
- 必查：更旧的数据**不回退**；同时间不同内容 → 保留既有 + `conflicts`
- 必查：缺 `event_id` 的条目**不参与合并**（计入 `rejected`）
- 红线：R7

**#57 第三方分类只读 API**
- 必查：7 步鉴权链顺序（Bearer → 验签 → client_id→app_id → 白名单 → SID 只取令牌 → **每次实时查同意** → 字段投影）
- 必查：**撤销后同一令牌立即 403**
- 必查：响应**不含** `school_fetched_at`
- 必查：无快照 → **200 + `snapshot_missing`**，不是 410、不是「过期」
- 红线：R4、R5、R6

**#58 一次性启动票据**
- 必查：`consume` 原子「取走即删」；TTL 60s；绑 `app_id`
- 必查：**「不存在」与「已用过」返回同一个 `code_used`**（不给探测信号）
- 必查：兑换结果**只含身份断言**，不含宿主令牌/Cookie/私钥
- 必查：签发端校验应用白名单（未审核应用拿不到 code）
- 红线：R4

**#59 跨模块红队（纯测试）**
- 必查：23 例是否**真的**覆盖跨模块组合（两个应用 + 两个学生独立 fixture）
- 必查：测试名与文档引用一致（文档引 14 个名字，应能 grep 到）
- 本 PR 无产品代码，重点是**测试有效性**

**#60 注册收敛（重构）**
- 必查：**行为中性**（路由数、开关语义、失败隔离语义与改动前一致）
- 必查：单个能力注册失败只 WARNING，不阻止启动
- 已知：合并 #51 时仍会冲突一次（删 #51 尾部块）—— 这是预期，不是缺陷

**#61 容量基准 + 集成门禁（工具脚本）**
- 必查：基准脚本是否**明确标注**「进程内、不含真实网络/PG/学校接口」
- 必查：门禁脚本跨仓库时是否**跳过并显示原因**（不得伪装成通过）
- 必查：迁移成对检查（G7）真的会拦

**#62 CORS 白名单 + 限流接线**
- 必查：CORS 是**路径作用域**（只 `/api/app-data/*`、`/api/app-launch/*`），**没有动全局 `allow_origins`**
- 必查：回**精确 origin**（绝不回 `*`）+ `Vary: Origin`
- 必查：限流器不可用/异常 → **fail closed**（拒绝，不放行）
- 必查：429 带 `Retry-After` 且**不返回数据**

**#63 对象级合并接进 put（集成分支）**
- 必查：合并发生在 **CAS 判定之前**，合并后**重算 content_hash**
- 必查：只在 user 域合并；域级墓碑行不合并；非 `{"items":[...]}` 形状原样写入
- 必查：旧备份复活已删对象 → **noop（连写都写不进去）**
- 注意：本 PR 是集成分支（含 #51 合并提交），这是刻意的（两条链才能验证接线）
- 红线：R7

**#64 数据导出/删除**
- 必查：导出**递归剔除** `school_fetched_at`/`source_device_id`/token/cookie/私钥
- 必查：**只能删用户域**；学校权威域 → 403 `domain_not_deletable` 且**零墓碑**
- 必查：主体只从 provider 取；重复删幂等
- 红线：R5、R6

### mini-hbut（客户端）

**#1273 契约冻结（纯文档）**
- 必查：契约是否**可执行**（域映射表、错误码、开关清单齐全）
- 必查：三仓基线 SHA 是否真实（`ee3d2549` / `5be5121` / `9d54108b`）

**#1274 无感 SSO + Casdoor 矩阵**
- 必查：bootstrap **永不抛**、**不做永久熔断**（失败要能重试）
- 必查：epoch 检查在 `session/begin` **之前**和 await **之后**都有
- 必查：矩阵第 9 项（无 UI 授权）是否**如实留空 + 标高风险**（不得假装通过）

**#1275 账号代际**
- 必查：`accountEpoch` 是**单一事实源**（AuthCoordinator 里不得再留本地 epoch 变量）
- 必查：`discardIfStale` 能拦住旧账号的迟到回包
- 红线：R3

**#1276 iframe 沙箱**
- 必查：默认**不强制**（`VITE_ENFORCE_REMOTE_MODULE_SANDBOX` 关时行为与改动前一致）
- 必查：远端沙箱**不含** `allow-same-origin` / `allow-modals` / `allow-popups-to-escape-sandbox`
- 必查：`frame_sandbox.ts` 不 import `core.js`（TS7016 会挂）

**#1277 宿主桥严格模式**
- 必查：两个配置**默认关闭**（现有 11 游戏与 SDK 都不发 nonce，强制会全挂）
- 必查：校验顺序 `source → origin → nonce → type`（origin 在 nonce 之前，不泄露 nonce 是否匹配）
- 必查：拒绝记录**只含 reason/at**，不含消息载荷

**#1278 应用目录客户端数据层**
- 必查：`normalizeCatalog` **丢弃未知字段**（`client_secret` 不得留在内存）
- 必查：`canEmbed` 的**空 `allowed_origins` = 不允许内嵌**（不是「不限制」）
- 必查：`loadAppCatalog` **永不抛**，且区分 `empty` 与 `error`

**#1279 逐类同意客户端**
- 必查：**没有改 `learningDataConsent.ts`**（旧 Core approve 流程是全或无，改了会静默扩权）
- 必查：新模块与旧模块**无交叉 import**
- 必查：scope→域映射是**显式冻结表**，未知丢弃
- 红线：R8

**#1280 队列 + 调度 + 降频**
- 必查：同 key 单飞；同摘要不重复入队；手动刷新提优先级但**不重置退避**
- 必查：**429 不算失败**（`blocked`，attempts 不加）；`Retry-After` 取大
- 必查：崩溃恢复 `inflight → queued`
- 必查：调度**失败不更新 `lastCheckedAt`**
- 红线：R5（降频只决定「何时问学校」，不决定「数据能不能看」）

**#1281 三端后台矩阵**
- 必查：`promisesAfterTermination()` **恒 false**
- 必查：iOS `minIntervalMs === null`（不承诺固定周期）
- 红线：R9

**#1282 接入示例文档**
- 必查：示例里的**域名/app_id/学号全是合成值**（学号统一 `T9` 前缀）
- 必查：是否写明「撤销不能删掉第三方已拿走的副本」

**#1283 隐私方案 + 红队矩阵**
- 必查：矩阵是否 **28 行以上**（实际 50 行）
- 必查：引用的测试名是否**真实存在**（抽查 grep）
- 必查：是否单列「已知盲区」（无真实并发/无真机/非渗透测试）
- 必查：是否明说「应用层不额外加密」是已知限制（不粉饰）

**#1284 容量 + 灰度文档**
- 必查：容量表是否**明确说明**「不能当生产容量承诺」
- 必查：是否写明**不可回滚项**（同意记录删了不可恢复、第三方已拿走的副本无法回收）

**#1285 交接手册**
- 必查：合并顺序是否**与 stacked 链一致**
- 必查：`#51` 冲突处理方式是否写明（删其尾部块）
- 必查：BLOCKED 清单是否完整（不得漏项）

**#1286 最终 review**
- 必查：29 条覆盖统计是否**与矩阵逐行对得上**（25 ✅ / 4 ⚠️ / 0 ❌）
- 必查：是否明确 GO/NO-GO（NO-GO for production）

**#1287 同步状态页**
- 必查：**不存在**按数据年龄的过期告警；有测试断言「30 天前的数据仍显示已同步」
- 必查：只展示「最后同步：YYYY-MM-DD HH:mm」
- 红线：R5

**#1288 应用中心页 + 授权管理页**
- 必查：`status !== 'active'` → 「已下架」且**不可点击**
- 必查：授权管理**没有「全部开启」**（逐项独立）
- 必查：**「撤销不影响学号登录」必须显示**（文案由模型产出，契约测试双向锁定）
- 红线：R3

**#1289 数据导出/删除页 + 迁移告知页**
- 必查：学校权威域**不可勾选**且当场给原因
- 必查：**「暂不」必须 `allowUpload=false` 且 `markAcknowledged=false`**（否则变成永久静默上传）
- 红线：R10

**#1290 第三方示例 SDK**
- 必查：`describeError('consent_revoked')` 文案**要求删除缓存**
- 必查：`formatLastSynced` **不含任何过期判断**
- 必查：`vitest.ci.config.ts` 是否真的把 `packages/**` 纳入（用例数应从 4295 → 4310）
- 红线：R5、R6

**#1291 同步编排层**
- 必查：`start()` 是否真的**订阅账号代际并在切号时清旧学号队列**
- 必查：上传失败 → 退避重排**不丢**，且本轮停止
- 必查：未登录**不入队**
- 必查：任何异常都不抛（不打断定时器）

### student-auth

**#23 学校已验证主体的信任模型**
- 必查：`decide_subject_trust` 默认 `require_school_verified=True`
- 必查：`build_assertion_payload` **只接受** `school_verified` 级别
- 必查：`FailClosedVerifier` 恒返回 None（拿不到可信主体就拒绝，不降级）
- 必查：与 `oidc/verifier.py::NotConfiguredVerifier` 的区别是否写清（两者都 fail closed，但语义不同）
- 红线：R2

---

## 3. 什么情况该判 FAIL

| 现象 | 判定 |
|---|---|
| 红线 R1–R10 任一被违反 | **FAIL** |
| 开关关闭时行为与改动前不一致 | **FAIL**（零回归被破坏） |
| 测试里出现 mock 冒充真实联调（如假的 Casdoor 返回被标成 PASS） | **FAIL**（最严重） |
| 文档声称完成，但代码里没有对应实现 | **FAIL** |
| 新增端点未校验「应用白名单」或「用户同意」 | **FAIL** |
| 响应体出现 `school_fetched_at` / token / cookie / 学号原文 | **FAIL** |
| 迁移缺 `*_rollback.sql` | **FAIL** |

## 4. 什么情况**不要**判 FAIL（常见误报）

| 现象 | 为什么不是缺陷 |
|---|---|
| 新模块「没有调用点」 | 刻意的默认关设计，见规则 A |
| `rate_limit=None` 传参 | 接线在 #62，两个 PR 独立可合 |
| 测试里有 fake executor / 注入式 fetch | 这是本仓库的既定测试风格（无 DB/无网络环境） |
| `entrypoint.py` 合并冲突 | 已知且已给处理方式（删 #51 尾部块） |
| 某个能力只支持单进程（内存票据存储） | 已标 BLOCKED（多副本需 PG/Redis） |
| 视觉/无障碍未验证 | 本机无运行时，已标 BLOCKED |
| 中文注释/文案 | 项目语言就是中文 |

---

## 5. 审查产出建议格式

```
PR #<编号>：PASS / FAIL / 需修改
- 红线检查：R1..R10 逐条 ✅/❌
- 零回归：开关关闭时行为一致？✅/❌（依据：<测试名或命令>）
- 测试：<命令> → <实际输出>（与基线 <数字> 对比）
- 发现的问题：<文件:行> <描述> <严重度>
- BLOCKED 项是否如实标注：✅/❌
```

---

## 6. 一句话

**重点不是「代码写得好不好看」，而是：开关关闭时有没有改变既有行为、开关打开时产品红线有没有被破、以及有没有把没验证的东西说成验证过。**
