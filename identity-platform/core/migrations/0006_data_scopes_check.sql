-- ============================================================================
-- 0006_data_scopes_check.sql —— #699 数据域 scope 扩展（父 #697）
--
-- 目标：oauth_application_scopes.scope 的 CHECK 约束纳入两个新数据域 scope：
--   - student.grades.read   （成绩读取）
--   - student.timetable.read（课表读取）
-- 审核策略沿用 student.identity 的敏感审核流（开发者提交用途说明 + 管理员人工审批），
-- 本迁移只放宽 DB 白名单；风险分级元数据由 API 层维护。
--
-- 实现方式说明（pg-mem 兼容性自查结论）：
--   PostgreSQL 标准做法是 ALTER TABLE ... DROP CONSTRAINT <name> + ADD CONSTRAINT，
--   但 0001 中该 CHECK 为内联匿名定义，pg-mem 不按 PG 规则自动命名
--   （实际名为 t_constraint_1 形态），且其 UNIQUE 约束名占用全局命名空间，
--   DROP CONSTRAINT 在 pg-mem 下必然失败。因此采用「建新表 → 拷贝 → 换名」的
--   重建方案，真 PostgreSQL 与 pg-mem 行为一致：
--   - 全部既有行原样拷贝（含 requested_at/approved_at/status/review_note）；
--   - 新表沿用相同列定义与 FK（ON DELETE CASCADE）；
--   - UNIQUE 约束更名 uq_scope_per_app_v2（避免 pg-mem 下与旧表同名冲突），
--     语义与原 uq_scope_per_app 完全一致：(application_id, scope) 唯一。
-- ============================================================================

CREATE TABLE oauth_application_scopes_new (
  id              TEXT PRIMARY KEY,                 -- UUIDv7
  application_id  TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL
                  CHECK (scope IN ('openid', 'profile', 'student.identity', 'offline_access',
                                   'student.grades.read', 'student.timetable.read')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'approved', 'rejected')),
  review_note     TEXT,
  CONSTRAINT uq_scope_per_app_v2 UNIQUE (application_id, scope)
);

INSERT INTO oauth_application_scopes_new (
  id, application_id, scope, requested_at, approved_at, status, review_note
)
SELECT id, application_id, scope, requested_at, approved_at, status, review_note
  FROM oauth_application_scopes;

DROP TABLE oauth_application_scopes;
ALTER TABLE oauth_application_scopes_new RENAME TO oauth_application_scopes;
