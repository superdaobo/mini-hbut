# 凭据、Token 与备份加密迁移方案（Issue #557）

> 阶段 4E。**执行原则：禁止无人值守直接迁移真实用户数据。** 本文档给出现状核验结论、剩余缺口与改造方案；真实数据迁移需用户明确确认后执行。

## 1. 现状（Phase 0 核验 + 2026-08-09 复核）

| #557 要求 | 现状 | 证据 |
|---|---|---|
| 移除 Base64 密码兜底 | ✅ 新写入不再以 Base64/明文落库；Base64 仅作为**迁移期受控降级**（keyring 不可用时显式保留，供 v2 迁移重试） | `repositories/session.rs:3-4`、`infrastructure/db/credential.rs:51-63,222-234` |
| Keyring 不可用降级 | ✅ `try_persist_password_to_keyring`（写入并读回校验）失败时返回 false，调用方保留 base64 并记日志；读取走 `load_password_from_keyring_or_remembered` | `credential.rs:63-80` |
| Cookie/Refresh Token 加密 | ✅ cookies / one_code_token / refresh_token 以版本化加密信封落库（`protect_session_secret`/`reveal_session_secret`），按学号隔离解密 | `repositories/session.rs:3-4`、`credential.rs:119-144` |
| 版本化迁移和回滚 | ✅ `migrate_session_passwords_v2`（Base64→keyring）与 `migrate_session_secrets_v1`（旧字段→加密信封）均为显式/幂等迁移，**不自动执行**；回滚=保留迁移前标记（`KEYRING_MARKER`/`legacy` 键） | `credential.rs:173-271` |
| 多用户隔离 | ✅ 密钥环按学号/账户键分条目；`delete_secret_key` 按账号删除 | `credential_store.rs:87-93` |
| 账号数据清除 | ✅ `clear_chaoxing_data`（级联删签到数据）+ `commands/credentials.rs`（删密钥环 + DB 凭据） | `chaoxing_checkin/commands.rs:582`、`commands/credentials.rs:18` |
| 备份加密 | ✅ `backup_database_encrypted`（secret_envelope AES+HMAC 加密整库） | `infrastructure/db/backup.rs:169-191` |

## 2. 剩余缺口与建议（需用户确认后执行）

| # | 缺口 | 建议方案 | 风险 |
|---|---|---|---|
| 1 | **真实用户数据迁移**：存量 SQLite 中的旧 Base64 密码列是否执行 v2 迁移 | 发布版首次启动/登录成功时静默迁移单账号（迁移后校验，失败保留 legacy 键）；批量迁移仅在用户显式触发（设置页入口） | 迁移中断/校验失败需回滚路径 |
| 2 | Keyring 在**极端环境**（无系统密钥环服务）的长期降级策略 | 维持"密码不落库、依赖 Cookie 会话恢复"；可加一次性提示"记住密码不可用" | 部分平台（旧 Android）keyring 支持差异 |
| 3 | `chaoxing_get_launch_url` 无消费者（#592 标注）——非凭据项，顺带确认不涉及 Token 泄露 | 保持 mobile-slim 裁剪即可 | 无 |
| 4 | 备份加密的密钥生命周期（主密钥轮换） | 新增 `rotate_secret_key` 命令（仅用户触发），轮换后重加密 cookie/token | 轮换失败需保留旧密钥读取 |

## 3. 执行边界

- **本方案文档不包含真实数据迁移代码的启用**；如需实施，单独开 PR 并：
  1. 在设置页/首启流程加入显式迁移入口（默认关闭）；
  2. 迁移前备份 DB，迁移后校验（学号→密码可读）；
  3. 迁移失败自动回滚到旧键，不删除 legacy 数据；
  4. 全量真机回归（iOS/Android）后再灰度。
- 任何涉及生产凭据的变更需在合并说明中标注"已确认执行"。

## 4. 关联

- 相关实现：`src-tauri/src/credential_store.rs`、`infrastructure/db/credential.rs`、`repositories/session.rs`、`secret_envelope.rs`、`infrastructure/db/backup.rs`。
