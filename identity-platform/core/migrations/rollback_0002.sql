-- ============================================================================
-- rollback_0002.sql —— 撤销 0002_admin_roles.sql（显式人工执行，禁止自动 destructive）
-- 删除顺序：先子表/索引，再父表
-- ============================================================================
DROP INDEX IF EXISTS idx_reviews_application;
DROP INDEX IF EXISTS idx_reviews_status;
DROP TABLE IF EXISTS application_reviews;
DROP INDEX IF EXISTS idx_user_roles_user;
DROP TABLE IF EXISTS user_roles;
