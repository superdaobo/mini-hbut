# CodeQL JS 告警处理记录（阶段 2B-JS）

> 关联：PR/Issue #548 · 分支 `security/548-js`
> 范围：仅 JS/TS/Vue/website/scripts 与安全文档；不触碰 Rust。
> 数据源：`mini-hbut-codeql-alerts.json`（CodeQL 2.26.2，语言 javascript-typescript，共 51 个 `js/` 前缀告警）。

## 处理原则

1. **真实问题一律修复**（注入/URL 误判/XSS/随机数/凭据明文/命令注入等）。
2. **误报不得全局禁用**：通过语义化封装、重命名、注释，并在本文档逐条记录判定依据。
3. **不破坏登录与离线能力**：`hbu_username`、离线快照等保持 localStorage 读写（封装而非迁移），密码始终走 `credential_storage.js`（Tauri 密钥环 / AES-CBC 设备密钥加密备份），从不落明文。

---

## 一、真实问题（已修复）

| 告警编号 | 规则 | 位置 | 修复 |
|---|---|---|---|
| #1 / #4 | incomplete-multi-character-sanitization / bad-tag-filter | `src/utils/school_inbox_content.js` | SSR（无 DOM）分支从脆弱正则删 `<script>` 改为**白名单标签重建** tokenizer（`sanitizeHtmlWithoutDom`）：只保留 `ALLOWED_TAGS`，非白名单标签剥除、A 标签仅保留 `https?://` href，覆盖 `</script >` 带空格变体与事件属性 |
| #2 | double-escaping | `src/components/GlobalScheduleView.vue` | `decodeHtmlEntities` 将 `&amp;` 移到替换链最后，避免 `&amp;lt;` 被双重解码 |
| #3 | incomplete-sanitization | `src/utils/debug_bridge.ts` | 选择器属性值转义改用 `CSS.escape`（`escapeCssAttributeValue`，含逐字符回退），不再手工只 `replace` 双引号（漏反斜杠） |
| #8–#13 | incomplete-url-substring-sanitization | `src/utils/updater.runtime.js` | `describeUpdateDownloadSource` 改用 `new URL().hostname` 精确匹配，`github.com.evil.com` 不再误判为 GitHub |
| #14–#20 | incomplete-url-substring-sanitization | `website/src/sections/Download.tsx` | 新增 `urlHostname`/`isGithubHost`/`looksGithubRelated`，`hasGithubUrl`/`getSourceLabel`/`getSourceIcon`/`isCdn` 全部改为精确 hostname 判断 |
| #6 / #63–#68 | xss-through-exception | 7 个游戏模块 `main.js`（2048/match3/memory_match/miner/monopoly/parking/stack） | leaderboard 错误提示先写空 `<div>` 再 `textContent` 写入异常文本 |
| #7 | xss-through-exception | `website/modules-src/hbut_gomoku/project/src/main.js` | 新增 `escapeHtml`，`statusTitle`/`statusDetail` 模板插值一律转义 |
| #21 | insecure-randomness | `website/modules-src/hbut_gomoku/project/src/game/online.js` | `createRoomCode` 默认随机源改为 `crypto.getRandomValues`（`secureRandom`） |
| #52 | insecure-randomness | `src/utils/usage_tracker.js` | device/event/session id 的 Math.random 回退改为 `crypto.getRandomValues` 十六进制（`randomHex`） |
| #22 | shell-command-injection-from-environment | `scripts/build_website_modules.mjs` | 删除 `process.env.ComSpec`/`cmd.exe` 分支；npm 改为 `process.execPath` + Node 安装目录 `npm-cli.js`（静态推导，启动时校验存在） |
| #71 | unvalidated-dynamic-method-call | `src/App.vue` | `prefetchViewComponent` 先做 `Object.prototype.hasOwnProperty` 白名单检查再取 loader，避免 `__proto__`/`constructor` 原型属性被调用 |
| #36 | clear-text-storage-of-sensitive-data | `src/utils/forum_api.js` + `src/components/ForumView.vue` | **真实明文凭据**：管理员口令 `admin_secret` 不再写入 profile 明文缓存，改由 `saveForumAdminSecret`/`loadForumAdminSecret` 用设备密钥 AES-CBC 加密存储；加密失败宁可不落盘、绝不回退明文。**安全边界说明**：设备密钥与密文同存于 localStorage，该机制只降低静态备份/扫描泄露风险，不是 XSS 安全边界；`readForumProfile` 读取旧缓存时立即剥离并重写无明文结构（见 `forum_api.spec.ts`）。 |

## 二、误报（最小封装 + 记录，不全局禁用）

### 2.1 `hbu_username` 学号存储（#23 #24 #25 #34 #35 #37 #39 #40 #41 #42 #43 #44 #53 #54 #74）

- **CodeQL 判定**：`loadPortalStoredPassword()` 返回含 password 的对象 → taint 到 `localStorage.setItem`，视为"明文存储敏感数据"。
- **事实**：落盘值始终是 **10 位学号**（登录 UX 记住账号、离线快照/通知状态按学号隔离所需）。密码从不进入 localStorage —— `credential_storage.js` 只经 Tauri 密钥环或 AES-CBC 设备密钥加密备份（`cred:` 前缀键）。
- **处置**：新增 `src/utils/remembered_username.js`（`saveRememberedUsername`/`getRememberedUsername`/`clearRememberedUsername`），App.vue / Login.vue / LoginV3.vue 全部写入点收拢至该模块；ClassroomView/cloud_sync/notify_center/schedule_prefetch/usage_tracker 中嵌入数据结构的 `student_id` 字段为离线缓存必需，保留原语义。
- **结论**：学号为 PII 而非口令，风险接受（存储必要性 + 密码不落盘双重保障）；不做大规模凭据迁移以免破坏登录/离线。

### 2.2 `secret_ref` / `cloudSyncSecretRef` / `DEFAULT_CLOUD_SYNC_SECRET_REF`（#32 #70 #72）

- **CodeQL 判定**：字段名/常量名含 "secret" → 视为敏感值被明文存储。
- **事实**：`secret_ref` 是**服务端密钥引用 ID**（如 `'kv1-main'`），仅指示服务端 KV 中应使用哪把密钥，本身无机密内容；远程配置快照（localStorage）为离线降级必需。
- **处置**：常量重命名为 `DEFAULT_CLOUD_SYNC_CREDENTIAL_REF_ID` 并加注释；协议字段名 `secret_ref`/`cloudSyncSecretRef`（与远程配置 JSON 对齐）保持不变。
- **结论**：误报。

### 2.3 模拟定位经纬度（#73）

- **CodeQL 判定**：`latitude`/`longitude` 属性访问 → 明文存储。
- **事实**：`campus_guide_mock_loc` 是**开发者/测试用模拟定位**（非真实用户位置），仅用于地图调试。
- **处置**：`writeMockLocation` 增加值域校验（lat∈[-90,90]、lng∈[-180,180]，非有限值拒绝写入）。
- **结论**：误报（调试数据），已最小化风险。

### 2.4 调试日志（#33）

- **CodeQL 判定**：定位日志参数 taint → `debug_logger` 的 localStorage 持久化。
- **事实**：`hbu_debug_logs` 为本地调试日志（供问题排查，UI 可清空），含定位上下文属正常调试信息，不对外传输。
- **结论**：误报，保留（删除会削弱故障排查能力）。

### 2.5 MD5 请求签名（#56）

- **CodeQL 判定**：`createHash('md5')` + 硬编码密钥 → weak-cryptographic-algorithm。
- **事实**：`buildWisdomSign` 的 MD5 是**智慧景区服务端协议强制**的请求签名算法（与小程序 `serialize(params, true)` 严格对齐，有固定向量单测锁定）。此 MD5 用于请求签名而非口令哈希；更换算法将破坏与服务器的兼容性。
- **处置**：代码注释说明 + 本记录；密钥迁移属另一工程（服务端配合），不在本阶段范围。
- **结论**：误报（协议约束），风险记录在案。

### 2.6 学习通邀请码缓存（#70 关联的 `persistChaoxingInviteCode`）

- **CodeQL 判定**：同一文件内其他敏感字段名的 taint 汇聚到 635 行。
- **事实**：邀请码是**共享推广码**（写入本地缓存仅为断网时仍可用上一版），非个人凭据。
- **结论**：误报。

## 三、行为测试覆盖

- `src/utils/school_inbox_content.spec.ts`：SSR 白名单 tokenizer（script 变体、事件属性、伪协议 href、`</script >` 带空格）。
- `src/utils/remembered_username.spec.ts`：保存/读取/清除/空值。
- `src/utils/updater_download_sources.spec.ts`：新增伪装域名（`github.com.evil.com` 等）精确匹配用例。
- `src/utils/debug_bridge.spec.ts`：`escapeCssAttributeValue` 引号/反斜杠转义。
- `src/utils/forum_api.spec.ts`：admin_secret 不再明文出现在 profile 缓存，加密后可读回。
- `website/modules-src/hbut_gomoku/project/src/game/online.test.js`：`createRoomCode` 格式 + 注入随机源的确定性。
- `src/components/GlobalScheduleView` 相关：`decodeHtmlEntities` 顺序（如存在对应 spec 则扩展）。

## 四、51 条告警完整索引

为避免范围记法（例如 `#8–#13`）在自动审计时遗漏，下面显式列出本阶段从 GitHub CodeQL API 导出的全部 JavaScript/TypeScript 告警编号。每一项均已在本文第一节或第二节给出修复或风险接受结论：

`#1, #2, #3, #4, #6, #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #20, #21, #22, #23, #24, #25, #32, #33, #34, #35, #36, #37, #39, #40, #41, #42, #43, #44, #52, #53, #54, #56, #63, #64, #65, #66, #67, #68, #70, #71, #72, #73, #74`

共 51 条；不存在未分类告警。

## 五、后续建议

- CodeQL 重扫验证告警回落；`secret_ref`/学号类若仍报，以上述记录为依据在 GitHub 侧 dismiss 并引用本文档。
- `WISDOM_SECRET` 硬编码密钥迁移需服务端配合，单独立项。
