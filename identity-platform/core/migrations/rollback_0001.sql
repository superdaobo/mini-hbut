-- ============================================================================
-- rollback_0001.sql —— 0001_initial.sql 的显式回滚脚本
--
-- ⚠️ 危险操作：本脚本会删除 0001 创建的全部表。
--   - 仅允许在 Preview/开发环境显式人工执行；
--   - 生产环境 destructive migration 必须单独人工确认（#617 执行约束）；
--   - 禁止在任何 Function cold start 自动执行。
--
-- 执行方式（本地）：
--   psql "$IDENTITY_DATABASE_URL" -f migrations/rollback_0001.sql
-- 或：
--   pnpm migrate:rollback
-- ============================================================================

DROP TABLE IF EXISTS oidc_provider_records;
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS auth_requests;
DROP TABLE IF EXISTS oauth_consents;
DROP TABLE IF EXISTS oauth_application_scopes;
DROP TABLE IF EXISTS oauth_redirect_uris;
DROP TABLE IF EXISTS oauth_applications;
DROP TABLE IF EXISTS developers;
DROP TABLE IF EXISTS device_enrollment_challenges;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS linked_identities;
DROP TABLE IF EXISTS users;

-- 迁移执行器自建表（若存在一并清理）
DROP TABLE IF EXISTS schema_migrations;
