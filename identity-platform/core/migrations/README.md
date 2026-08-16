# migrations（Identity Core 显式 migration）

本目录存放 Identity Core 的 PostgreSQL 显式 migration。

## 铁律（来自 #617/#618/#619）

1. **Migration 必须显式执行**（本地手动或 CI 门禁任务），
   **禁止函数 cold start 自动执行生产 schema migration**。
2. Preview 与 Production **分库或至少完全独立 schema/credential**，
   禁止共用迁移链。
3. 连接串只来自环境变量 `IDENTITY_DATABASE_URL`，不写进任何文件。
4. **回滚**：`rollback_0001.sql` 只允许 Preview/开发环境显式人工执行；
   生产 destructive migration 必须单独人工确认。
5. 迁移执行器记账于 `schema_migrations` 表（幂等、可重复部署）。

## 文件

| 文件 | 说明 |
|---|---|
| `0001_initial.sql` | 12 张业务表（users / linked_identities / devices / device_enrollment_challenges / developers / oauth_applications / oauth_redirect_uris / oauth_application_scopes / oauth_consents / auth_requests / audit_events / oidc_provider_records） |
| `rollback_0001.sql` | 0001 的显式回滚（删除全部业务表，危险操作） |

## 执行方式

```bash
# 应用全部未执行的 migration（本地/Preview）
pnpm migrate:up

# 回滚（⚠️ 危险：删除全部业务表，仅开发环境）
pnpm migrate:rollback
```

实现：`src/scripts/migrate.ts` + `src/db/migrate.ts`（显式、事务化、幂等）。
