# 阶段 3 架构收敛记录

验证基线：Mini-HBUT `1.4.5`，分支 `stability/547-phase2b-phase3-completion`。

## 本阶段已完成

### 成绩领域单一业务入口

- 新增 `src-tauri/src/grade/`，统一 DTO、成绩语义、缓存与教师补齐。
- Tauri Command 与 HTTP Bridge 的 `sync_grades` 均调用同一个 `GradeService`。
- 删除旧 `src-tauri/src/modules/grades.rs` 重复实现。
- 前端使用统一 `GradeOutcome` 与绩点来源：官方绩点优先，缺失时才显示估算值。
- 成功同步整表替换缓存；失败保留旧快照并标记离线。

### SQLite 与数据可靠性

- 所有连接统一设置 busy timeout，保留 WAL 与 `synchronous=NORMAL`。
- 会话保存改为原子 UPSERT，补并发写与字段保留测试。
- 增加显式数据库备份能力、完整性验证、有界锁重试、唯一命名与保留策略；不会自动覆盖真实数据库。备份完整包含会话 Cookie、令牌及离线缓存，属于敏感文件，应仅保存在受当前用户权限保护的应用数据目录，不应上传或分享。
- 前端核心请求统一超时、维护状态分类与跨实例缓存失效广播。

### 会话凭据保留语义

- `save_user_session` 的空 password/token 表示“本次调用没有新值”，UPSERT 会保留数据库中的既有非空值。这是“记住密码”和离线恢复的有意产品语义，不是清除操作。
- 普通 `logout` 只清理内存会话，继续保留用户明确选择的“记住密码”。需要真正删除凭据时必须调用 `delete_remembered_credential`（隐私清理/忘记账号流程），不得通过向 `save_user_session` 传空串间接清除。

### 平台判断单一来源

- iOS、Android、桌面与移动端判断集中在 `src/platform/runtime.ts`。
- App 壳、课程、通知、设置、二维码与平台适配器不再各自维护品牌 UA 正则。
- 保留 `Mobile`、`HarmonyOS` 等业务特定兜底，以及诊断/上报用途的原始 UA 采集。

### 共享纯函数

- `sanitize_filename_part`、`escape_ics_text`、`fold_ics_line`、`parse_ics_datetime` 收敛到 `src-tauri/src/utils/ics.rs`。
- Tauri 与 HTTP 两个传输层只导入复用，不再各自定义。

### 工具与安全边界

- 旧 `src/utils/api.ts` 重命名为 `server_api.ts`，避免与缓存层 `api.js` 同名误导入。
- CodeQL 的真实 JS/Rust 问题已修复；协议常量、测试字面量与必要本地标识有逐条风险说明。
- 日志和敏感字段继续复用 Rust `utils::mask`、前端安全存储与 URL/HTML 安全封装。
- 新增 `check:architecture`，阻止成绩双通道重新分叉、ICS 重复定义、组件平台 UA 正则和 `api.js/api.ts` 同名入口回归。

## 本阶段明确未做

以下任务属于阶段 4，已建立 Epic #552 与 Sub-issues #553–#557：

- App.vue 全量拆分、Pinia 状态层与 AppShell。
- `lib.rs`、`http_server.rs`、HbutClient 全量拆分及全局错误模型迁移。
- 所有核心 JavaScript 一次性迁移 TypeScript。
- Base64 凭据兜底、Cookie/Refresh Token 与备份加密格式迁移。
- 真实用户数据库自动恢复或静默迁移。

## 仍需真实环境验证

自动化不能替代以下证据，已由 #556 追踪：

- iOS 低内存、大课程数、前后台恢复与 Widget。
- Android 厂商后台限制和通知触达。
- 长时间闲置后的真实教务/学习通会话恢复。
- 学习通视频、学期、签到以及校园网真实网关。
- 教务维护、认证页、断网与网络切换。

## 自动化守卫

发布前应至少运行：

```text
npm run check:architecture
npm run check:all
npm run check:release
```

本阶段不修改应用版本，不创建 Tag、Release 或 TestFlight 构建。
