# Mini-HBUT 联调实验室（Integration Lab）方案 · 待审批

> Epic #1243 · 目的：从「单元测试全绿」推进到**可复现的端到端验收证据**。
> 本文件是**审批件**：未获批准前，不执行任何需要改 NAS 路由 / 部署容器 / 建库 / 影响现有服务的操作。

---

## 0. 前置核对：35 个 PR 的修复状态

### 已修复并推送（5 项，均已独立复现）

| PR | 问题 | 提交 |
|---|---|---|
| OCR#51 | CAS 非原子（并发丢更新）+ `_PgQueryResult` 未解包（PG 模式必坏） | `2a00977` |
| OCR#62 | 限流配置坏 → fail-open（改为 `DenyAllRateLimitGuard`） | `3a74935` |
| OCR#63 | 墓碑可被旧整包复活（R7）+ 合入 #51 的 CAS | `a50ff6f` |
| mini-hbut#1280 | 429 `blocked` 永久卡死（`isSendable` 未含 blocked） | `f871404` |
| mini-hbut#1291 | 计划当成功 / 未登录扫全队列 / 降频未生效 | `9c0ad9ba` |

### 待修复（7 项，冻结集成版本前必须完成）

| PR | 问题 | 优先级 |
|---|---|---|
| OCR#57 / #58 | **缺 `school_verified` 可信门禁**（JWT 签名 ≠ 学校证明属于本人） | **P0** |
| OCR#64 | `_list_consents` 用 `hasattr(list_for_student)`，两个 store 都只有 `list_for_app` → **导出恒为空** | P1 |
| OCR#50 | InMemory `revoke()` 局部 max → `consent_revision` 可能回退 | P1 |
| OCR#61 | 门禁 SKIP 被统计成 PASS | P1 |
| OCR#60 | `_register_app_catalog` 恒 `return True`（注册结果不可观测） | P2 |
| mini-hbut#1276 | **沙箱方案②待实现**（见 §0.1） | **P0** |
| #1292 | 审查指南需修订（红线口径 / 沙箱契约 / SKIP 状态） | P2 |

### 0.1 沙箱方案②（已定，待实现）

**现状**：`SANDBOX_REMOTE_APPROVED = SANDBOX_LOCAL`（含 `allow-same-origin`）。

**目标**：
- 远端第三方应用 → **严格沙箱**：`allow-scripts allow-forms allow-popups`，
  **不含** `allow-same-origin` / `allow-modals` / `allow-top-navigation`
- 持久化 → 走 **postMessage Bridge 受限存储**：宿主代理读写，键空间前缀 `app:<client_id>:`，
  宿主校验 `event.origin` 白名单后才落盘
- **旧 11 个小游戏保持现状**（`enforceRemoteSandbox=false`），逐个迁移验证后再切换
- Android 额外审查：Tauri 原生命令 ACL 与 iframe 的隔离（iframe 不得间接触达 `invoke`）

**为什么必须做**：含 `allow-same-origin` 的远端 iframe 与宿主同源 → 可读宿主 `localStorage`
（含身份/配置），等于把宿主权限借给第三方，违反 R4。

---

## 1. 联调实验室（Lab）设计

### 1.1 定位与铁律

| 项 | 决定 |
|---|---|
| 形态 | **独立静态站点**，注册为应用中心里的第三方应用（`app_id = mini-hbut-lab`） |
| 可见性 | **仅开发者账号可见**（目录里 `status=active` 但客户端按开发者标记过滤；后端仍按正常应用校验） |
| 身份/权限 | **走真实 SDK/API**：一次性票据 → 应用令牌 → 逐域同意 → 分类读取 |
| **禁止** | 任何测试后门（跳过令牌/同意/白名单/`aud` 校验）；不得内嵌调试端点绕过鉴权 |
| 第二个应用 | `app_id = mini-hbut-lab-alt`，用于**跨应用越权**验证（A 的票据/令牌读 B 的数据必须失败） |

### 1.2 面板（每个面板都要能给出 PASS/FAIL 证据）

| 面板 | 内容 | 对应红线 |
|---|---|---|
| **身份** | 展示当前 `sid`（脱敏）、`aud`、票据过期倒计时、令牌剩余有效期；「换票据」按钮 | R1/R2 |
| **授权** | 逐域勾选（课表/成绩/考试/资料/排名）、单项撤销、一键撤销；显示 `consent_revision` | R3/R8 |
| **数据读取** | 按域读取，展示 `data_version` + **只展示 `last_synced_at`**；故意请求未授权域看 403 | R4/R5/R6 |
| **云同步** | 触发一次本地变更 → 观察队列（queued/inflight/acked）、手动刷新优先级、失败退避 | R9 |
| **多设备** | 生成设备 B 会话，与 A 并发写同一域 → 验证 CAS（一个成功、一个 `version_conflict`） | R7 |
| **故障注入** | 断网、429（`Retry-After`）、5xx、超时、快照缺失 | R9 |
| **安全测试** | 跨应用兑换、跨学号查询、篡改 `student_id`、重放票据、非法 origin 预检 | R2/R4/R8 |
| **沙箱自检** | 尝试 `window.parent.localStorage`（应抛错）、走 Bridge 存取存档（应成功） | R4 |

### 1.3 存档迁移（沙箱方案②）

- Lab 用 **Bridge 存档**（`postMessage` → 宿主代理 → 前缀隔离的 localStorage）
- 旧 11 游戏：先在 Lab 里用**同一 Bridge 协议**跑通，再逐个迁移

---

## 2. 测试环境部署拓扑（全隔离）

```
┌─ 生产（禁止触碰）───────────────────────────────┐
│  OCR-prod · Casdoor-prod · PG-prod · 学校真实接口 │
└────────────────────────────────────────────────┘
        ║ 物理隔离：无凭据、无网络路由、无共享库
┌─ Staging（本次新建）───────────────────────────┐
│                                                │
│  [客户端 staging 构建]                          │
│    Windows (.staging) / Android (applicationId 后缀) / iOS (bundleId 后缀)
│         │                                      │
│         ├──► OCR-staging（新容器，独立端口）     │
│         │      └──► PG-staging（独立库+独立角色）│
│         ├──► Casdoor-staging（独立组织/租户）    │
│         └──► student-auth-staging（新容器）      │
│                                                │
│  [学校模拟器] mock-jwxt（本地/容器，合成学生）    │
│  [Lab 站点] lab.staging（静态，独立 origin）     │
│  [Alt 站点] lab-alt.staging（跨应用越权用）      │
└────────────────────────────────────────────────┘
```

**硬隔离措施（逐条可验证）**

1. staging 容器**不挂载**任何生产凭据（env 文件独立、不含 prod secret）
2. staging 出网白名单：只允许 `mock-jwxt` 与 `Casdoor-staging`；**禁止**访问学校真实域名与生产 API
3. PG-staging 用**独立数据库 + 独立角色**，角色无权访问 prod 库（`REVOKE ALL ... FROM lab_role`）
4. 客户端 staging 构建用**独立 applicationId/bundleId**，可与生产版并存安装
5. 反向代理按 host 分流，staging 域名不指向生产上游（路由表截图留证）
6. 所有 staging 服务打 `X-Env: staging` 响应头，测试断言响应头存在（防误连生产）

---

## 3. 需要新增的资源（**请批准**）

| # | 资源 | 规格 | 影响面 |
|---|---|---|---|
| 1 | OCR-staging 容器 | 1 个，独立端口，复用镜像 | 新增，不改现有 |
| 2 | student-auth-staging 容器 | 1 个 | 新增 |
| 3 | PostgreSQL staging | 1 个库 + 1 个角色（无 prod 权限） | 新增库 |
| 4 | Casdoor staging | 1 个组织（或独立租户） | 新增组织 |
| 5 | 反向代理路由 | 3 条（ocr/lab/lab-alt 的 staging 子域） | **需改 NAS 路由** |
| 6 | TLS 证书 | 3 张（或 1 张通配 `*.staging`） | 新增 |
| 7 | Lab / Lab-alt 静态站点 | 2 个目录 | 新增 |
| 8 | 学校模拟器 | 1 个容器或本地进程 | 新增 |
| 9 | 测试账号 | 合成学生 ≥3、真实授权学生 1（**需校方**） | 需外部 |
| 10 | 测试设备 | Android 1 台、iOS 1 台、Windows 本机 | 需外部 |

> **第 5 项（改 NAS 路由）与第 3/4 项（建库/建组织）是需要你明确批准的操作。**

---

## 4. 测试清单（逐条可判定）

> 结果列：**PASS / FAIL / BLOCKED**。BLOCKED 必须写明缺什么，不得写成 PASS。

### A. 产品红线 R1–R10

| # | 场景 | 方法 | 期望 |
|---|---|---|---|
| A1 | R1 唯一显式登录 | 全流程截图 | 只有学校登录入口，无账号密码框 |
| A2 | R2 真实学号即身份 | Lab 展示 `sid` + 后端审计 | `sid` 来自可信令牌，非客户端自报 |
| A3 | R2 设备签名≠身份 | 用设备签名但无学校证明的令牌调 `/api/app-data` | **401/403** |
| A4 | R3 撤销不影响登录 | 撤销成绩授权后继续用 App | 仍登录、其它域可用 |
| A5 | R3 撤销即时 | 撤销后同一令牌读该域 | **403 `consent_revoked`** |
| A6 | R4 第三方不直连学校 | 抓包 Lab 出网 | 只有 OCR 域名，无学校域名 |
| A7 | R5 无数据年龄告警 | 30 天未同步的域 | 页面只显示「最后同步：…」 |
| A8 | R6 只暴露 `last_synced_at` | 响应体检查 | 无 `school_fetched_at` |
| A9 | R7 旧备份不复活 | 删除日程 → 旧整包重放 | 仍墓碑、版本不推进 |
| A10 | R8 不能靠同意扩权 | Lab 请求未获批域并点同意 | **403 `domain_not_allowed`** |
| A11 | R9 不伪承诺 | 三端后台说明 | 无「进程被杀仍同步」表述 |
| A12 | R10 不静默上传 | 旧「关闭同步」账号首启 | 先出告知页，选「暂不」不上传 |

### B. 功能开关关闭零回归

| # | 场景 | 方法 | 期望 |
|---|---|---|---|
| B1 | 全部开关关 | 启动 staging（全关） | 新端点 404；旧功能与 main 一致 |
| B2 | 路由数对比 | 开关关/开各取一次路由表 | 关=90、开=105（含五能力） |
| B3 | 旧云同步 | 开关关时跑一次 upload/download | 行为与改动前一致 |

### C. 端到端主链路

| # | 场景 | 期望 |
|---|---|---|
| C1 | 学校登录 → 无感 SSO | 无二次登录 |
| C2 | 进入 Lab（应用中心） | 卡片显示、点击进入 |
| C3 | 一次性票据兑换 | 60s 内成功，`sid` 正确 |
| C4 | 逐域授权（课表+成绩） | 授予成功，`consent_revision` 递增 |
| C5 | 读取真实授权数据 | 200 + `data_version` + `last_synced_at` |
| C6 | 撤销成绩 | 立即 403，课表仍可用 |
| C7 | 手动刷新 | 立即执行（不受退避影响），队列 high 优先 |
| C8 | 429 后重试 | `blocked` 到期可续，`attempts` 不增 |
| C9 | 多设备并发写 | 一成功一 `version_conflict` |
| C10 | 历史快照读取 | 30 天前快照仍可读，无过期提示 |

### D. 沙箱方案②

| # | 场景 | 期望 |
|---|---|---|
| D1 | 新应用 iframe sandbox 属性 | **不含** `allow-same-origin` |
| D2 | 子页尝试 `parent.localStorage` | 抛错/被拒 |
| D3 | Bridge 存档读写 | 成功，且键有 `app:<client_id>:` 前缀 |
| D4 | 跨应用读存档 | 被拒（前缀隔离） |
| D5 | 旧 11 游戏（未迁移） | 行为不变（`enforceRemoteSandbox=false`） |
| D6 | Android 原生命令隔离 | iframe 无法触达 `invoke` |

### E. 跨应用越权（Lab-alt）

| # | 场景 | 期望 |
|---|---|---|
| E1 | A 的 code 被 B 兑换 | `app_mismatch` |
| E2 | A 的令牌读 B 的域 | 403 |
| E3 | A 的存档被 B 读 | 被拒 |

---

## 5. 分阶段执行

### P0 · 本地模拟（无外部依赖，**建议立即批准**）

- **准入**：无需新资源
- **内容**：mock 学校 + 合成学生 + 本地 PG（docker/本地实例）+ Lab 静态站（localhost）
- **产出**：C1–C10、A1–A12、B1–B3 的大部分证据；沙箱 D1–D4
- **退出标准**：除真机/真实学校外全部 PASS 或 BLOCKED

### P1 · 隔离后端（需批准第 1–7 项资源）

- **内容**：staging 容器 + staging PG + Casdoor staging + 反代路由
- **产出**：真实网络路径下的 E2E、CORS 实际行为、多设备跨客户端
- **退出标准**：staging 域名可访问、隔离措施逐条验证（§2 六条）

### P2 · 真机（需 Android/iOS 设备）

- **内容**：三端安装 staging 构建，跑 D5/D6、后台行为、切号隔离
- **产出**：录屏 + 设备日志
- **退出标准**：D5/D6 PASS；真机行为无阻断

### P3 · 真实学校账号（**需校方授权 + 可信验证机制**）

- **准入**：student-auth 接入真实 `SchoolVerifier`；校方书面授权 1 个测试学生
- **内容**：真实登录、真实学号归属、真实课表成绩读取
- **产出**：完整录屏 + 脱敏日志
- **注意**：此阶段才可宣称「真实学校链路通过」

---

## 6. 回滚措施

| 层 | 手段 | 影响 |
|---|---|---|
| 路由 | 反代删除 3 条 staging 路由 | 只影响 staging 域名 |
| 容器 | 停止/删除 staging 容器 | 无生产影响 |
| 数据库 | `DROP DATABASE staging`（独立库） | 无生产影响 |
| Casdoor | 删除 staging 组织 | 无生产影响 |
| 客户端 | 卸载 staging 构建（独立 applicationId） | 与生产版共存，无影响 |
| 代码 | 各 PR 独立 revert | 见交接手册 |

**前置约束**：所有 staging 操作**不得**指向生产库/生产 Casdoor/学校真实接口；
执行前先跑一次「隔离自检」（断言 `X-Env: staging`、断言 prod 库连接被拒）。

---

## 7. 风险与已知 BLOCKED

| 风险 | 说明 |
|---|---|
| 误连生产 | 已用独立凭据 + 出网白名单 + `X-Env` 头 + 独立库角色 四重隔离；P1 前先跑隔离自检 |
| 真实学校接口 | **BLOCKED**：需校方授权与接口文档 |
| Casdoor 真实租户 | **BLOCKED**：需管理员 |
| iOS 真机 | **BLOCKED**：需开发者证书/设备 |
| 旧 11 游戏迁移 | 需逐个验证存档，工作量大；未迁移前保持现状 |

---

## 8. 需要你确认的 4 个决策点

1. **P0 是否可以先启动？**（不需要任何新资源，纯本地）
2. **P1 的资源清单（§3 第 1–7 项）是否批准？** 特别是**改 NAS 路由**与**建 staging 库/组织**
3. **真实学校账号**：是否已获得校方书面授权？谁提供？
4. **Lab 可见性**：仅开发者账号可见（我建议），还是所有学生可见（便于众测但暴露测试应用）？

---

## 9. 冻结计划（批准后执行）

1. 完成 §0 的 7 项待修（含沙箱方案②）
2. 重跑三仓门禁，记录基线（OCR 2699+ / client 4284+ / sa 718）
3. 打 `epic-1243-rc1` 标签（三仓各一个），冻结接口与开关清单
4. 按 P0 → P1 → P2 → P3 执行，每阶段产出证据目录
5. **全程不合并生产 main**，只在 staging 验证
