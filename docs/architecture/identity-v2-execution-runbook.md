# 身份迁移 v2 · 执行手册（设备签名直证）

> 配套：[`identity-v2-device-attestation.md`](identity-v2-device-attestation.md)（ADR / 为什么这么做）
> 状态：2026-11-09 定稿。**按阶段推进，每个阶段有出口条件，未达标不进入下一阶段。**
> 执行者：mini 团队（代码/测试/客户端）+ FDL（Casdoor 配置、NAS 部署、变更窗口）
> **禁止**：跳过阶段 0 直接做"上线"；**禁止**执行已作废的 [`nas-identity-deploy-runbook.md`](nas-identity-deploy-runbook.md) §14。

---

## 0. 一页速查

| 阶段 | 谁做 | 出口条件（可机械检查） | 是否会断线 |
|---|---|---|---|
| 0 调试接口 | mini | 本机四方联调跑通（贴真实输出） | 否（全在本机） |
| 1 设备登记与验签 | mini | ocr-service 单测/契约测试绿；冒领被拒用例通过 | 否 |
| 2 学生认证服务 | mini + FDL（Casdoor 上游） | discovery 正确 + 一次完整登录 | 否（灰度容器） |
| 3 ocr 退化为资源服务器 | mini | 全量测试绿 + 双 issuer 验证 + 回滚演练 | **是**（重启容器） |
| 4 客户端接 Casdoor | mini | 首次/换设备/退出/切号 全过 | 否（发版） |
| 5 清单仓库 + 接入程序 | mini + FDL | 一个示例应用自动接入 | 否 |
| 6 实测与验收 | mini（自测） | 验收矩阵全绿 | 视项 |
| 延后 | mini | 桥安全（成员应用进模块中心前必做） | 否 |

---

## 1. 阶段 0 · 调试接口（先做这个）

**目的**：让后面每一步都能**在本机自证**，不等 NAS、不等 FDL。

### 1.1 交付
| 组件 | 端点 / 缝 | 说明 |
|---|---|---|
| 新仓 `mini-hbut-student-auth` | `/health`、`/health/deps` | 轻量（几十毫秒）；依赖单列 |
| 同上 | `/debug/authorize`、`/debug/verify`、`/debug/devices` | **仅 `DEBUG_ENDPOINTS=1` 时挂载**；生产默认不存在（404） |
| ocr-service | `/identity/debug/device/{register,verify,list,revoke}` | 同上：`MINI_HBUT_IDENTITY_DEBUG=1` 才挂载 |
| App（Tauri） | DEV 签名自检缝 | 在 DEV 构建里对固定串签名并展示（复用 `__HBUT_IDENTITY_AT_STUB__` 同类做法） |

### 1.2 出口条件
- `npx tauri dev` 起 App；本机起新服务 + ocr-service（+ 假 Casdoor）；
- 走通：**App 签名 → 新服务验签（调 ocr）→ 登记 → 发 id_token → 假 Casdoor 换令牌**；
- 把命令与真实输出写进 `docs/architecture/identity-v2-phase0-evidence.md`。

### 1.3 明确不做
- 不动生产 Casdoor/NAS/DNS；
- 不修本地桥漏洞（列"延后"）；不碰测试应用清理。

---

## 2. 阶段 1 · 设备登记与验签（ocr-service）

- 设备表：`device_id`(PK)、`public_key`、`alg`、`student_id`(唯一索引)、`status`(pending/active/revoked)、`created_at`/`last_seen_at`、`bound_by`(首次/换机/人工)；
- 验签：canonical 串固定、`nonce` 一次性、`ts` 时间窗（默认 ±120s）、`kid` 轮换；
- **首次登记**：若学号已被绑定 → 拒绝（不得静默接管）；
- **换设备**：需旧设备签名批准，或管理员在 ocr 侧显式放行（写入审计 `bound_by=manual`）；
- 限流：按 IP / device_id / 学号；
- 一致性：学号↔姓名/院系首次登记后不得静默变更，变更 → `conflict` + 告警；
- 吊销：管理员可吊销设备（并发 `subjects`/令牌失效路径）。

**出口条件**：冒领（他人学号 + 新设备）被拒；换机走批准；吊销后旧设备签名失效。

---

## 3. 阶段 2 · 学生认证服务（新仓）

- 端点：`/.well-known/openid-configuration`、`/authorize`、`/token`、`/jwks.json`；
- 流程：Casdoor 登录页 → 本服务 → 深链拉起 App 产生设备签名（或本机桥）→ 调 ocr 验签/查登记 → 发 `id_token`（`sub`、`hbut_student_id`、`hbut_verification_method=device_attestation`）；
- **不收 cookie、不连教务、不存密码**；
- FDL 侧：在 Casdoor 建"上游提供方（type=OIDC）"指向本服务；具体字段见 `mini-hbut-student-auth/docs/oidc-upstream-contract.md`。

**出口条件**：discovery 字段正确；一次完整登录在 NAS 灰度容器上完成（Casdoor 侧由 FDL 配合）。

---

## 4. 阶段 3 · ocr-service 退化为资源服务器

按 FDL 与指南 §5：
1. 删 `/identity/bootstrap`、建号（管理 API）、断言签发；旧路径不可达要有测试；
2. 双 issuer（Casdoor + 旧平台）+ 学号 claim 名可配（`hbut_student_id` 或 `oauth_OIDC_id`）；
3. 数据授权改 `client_id → 数据域` 白名单（只验 `aud`），退役 scope 矩阵与 `consents`；
4. 权限改读令牌 `groups`，退役 `hf_role_table` 按学号判定；
5. **CORS 收紧**（当前是 `allow_origins=["*"]`）；
6. **`/health` 轻量**（当前 1.9–2.1s），依赖移 `/health/deps`；
7. 镜像交付改 **CI→ACR**（NAS 只拉取），tag 规范 + `:rollback` 保留。

**出口条件**：全量测试绿 + 双 issuer 各自验证通过 + `03:00–05:59` 窗口内完成一次回滚演练。

---

## 5. 阶段 4 · 客户端

- App 作为 Casdoor 原生客户端：授权码 + PKCE，回调 `minihbut://identity/callback`（若自定义 scheme 不被接受，退回 loopback）；
- 会话由 Casdoor `refresh_token` 接管；退役设备换票 provider（保留 legacy 开关一个过渡期）；
- 保留 `handoff`（浏览器 ↔ App 对齐）；
- 学号 claim 名适配（与阶段 3-2 同一开关）。

**出口条件**：首次登录、换设备、退出、切号、权限变更生效时间 全部按验收矩阵通过。

---

## 6. 阶段 5 · 清单仓库 + 接入程序

- 清单 YAML = 插槽规范 v2 的 8 维度 + 身份（client 类型/回调/放行群组/形态/数据域）+ 应用中心条目；
- PR 审核（1 位 `ops` 批准且非作者）为唯一门；
- NAS 接入程序幂等生成：Casdoor 应用 + `perm-<应用>-<群组>`、mini 数据域白名单、New API key、compose/Traefik/frpc、module_center 清单；secret 落 `secrets/`；
- 退役：自建应用注册表/审核/provisioner、developer 门户（改只读目录 + "新建应用"表单开 PR）。

**出口条件**：一个示例应用仅靠清单 PR 完成接入（含权限与数据域）。

---

## 7. 阶段 6 · 实测与验收（自测）

| 项 | 内容 |
|---|---|
| Casdoor 5 项 | device grant 二维码入口；token exchange 权限检查；**Token attributes 改名**；已有账号绑定上游；关闭注册时上游新用户建号 |
| 端到端矩阵 | 首次登录 / 换设备 / 退出 / 切号 / 权限变更生效时长 / 过渡期双 issuer |
| 数据 | 3 用户 / 4 设备 / 0 快照 的迁移核对（含学号↔用户映射导出） |
| 回滚 | 镜像 `:rollback` + 配置开关，逐项列症状 |

---

## 8. 延后项（**成员小应用进模块中心之前必须完成**）

1. 本地桥把 `127.0.0.1` **任意端口**当可信来源；远程模块从桥的同源地址加载且 **iframe 无 sandbox** → 任何远程模块代码都能用学生的学校会话调桥上的成绩、课表、cookie 导出接口；
2. 测试应用与空名应用清理（后台脏数据）。

---

## 9. FDL 协作清单（越早越好）

| # | 事项 | 备注 |
|---|---|---|
| 1 | 建 Casdoor 应用（mini，native public，授权码+PKCE）与 `perm-mini-*` | 阶段 4 前置 |
| 2 | 建"上游提供方（type=OIDC）"指向学生认证服务 | 阶段 2 前置 |
| 3 | 确认 Token attributes 能否把学号改名成 `hbut_student_id` | 决定 claim 名是否必须可配 |
| 4 | `POST /api/login` 30 次/分钟（全校同一 NAT 出口）需重定 | 否则 mini 接入会误伤 |
| 5 | NAS 上给学生认证服务分配容器/网络/Traefik 路由/secrets/资源上限 | 阶段 2 部署 |
| 6 | ACR 推送权限 + 变更窗口确认（03:00–05:59） | 阶段 3/5 |
| 7 | 清单仓库归属（FDL 建仓）与接入程序协作分工 | 阶段 5 |
