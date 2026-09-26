-- ============================================================================
-- 0008_game_scopes_check.sql —— #902a 游戏平台 scope 扩展（协议 §6）
--
-- 目标：oauth_application_scopes.scope 的 CHECK 约束纳入两个游戏平台 scope：
--   - game.read  读取游戏平台数据（run 状态 / 榜单 / 本人钱包快照）
--   - game.play  游戏平台写路径（ticket / session / run 提交，协议 §6.2.1
--                的 POST /tickets 要求 scope game.play）
-- 审核策略：两者按敏感 scope 处理（风险分级权威定义在
-- core/src/domain/scope-risk.ts SENSITIVE_SCOPES，admin 过滤/统计与 step-up
-- 判定共用同一列表），本迁移只放宽 DB 白名单。
--
-- ⚠️ 命名状态：`game.play` 已在协议 §6.2.1 / §1.2 显式出现；`game.read` 由
-- #902 任务书指定，最终命名仍需用户确认（协议 §12 U1）。若改名，需同步的
-- 位置清单见 core/docs/contract.md §8（共 8 处，含本迁移）。
--
-- 实现方式说明（pg-mem 兼容性，沿用 0006_data_scopes_check.sql 的结论）：
--   PostgreSQL 标准做法是 ALTER TABLE ... DROP CONSTRAINT + ADD CONSTRAINT，
--   但 0001 中该 CHECK 为内联匿名定义，pg-mem 不按 PG 规则自动命名
--   （实际名为 t_constraint_1 形态），且其 UNIQUE 约束名占用全局命名空间，
--   DROP CONSTRAINT 在 pg-mem 下必然失败。因此采用「建新表 → 拷贝 → 换名」的
--   重建方案，真 PostgreSQL 与 pg-mem 行为一致：
--   - 全部既有行原样拷贝（含 requested_at/approved_at/status/review_note）；
--   - 新表沿用相同列定义与 FK（ON DELETE CASCADE）；
--   - 临时表名与 UNIQUE 约束名都带 0008 / rb 后缀：pg-mem 的**索引名是全局
--     命名空间**，0006 已占用 oauth_application_scopes_new(_pkey) /
--     uq_scope_per_app_v2，重名会让 CREATE TABLE 直接失败（已实测）；
--     语义与原约束完全一致：(application_id, scope) 唯一。
--
-- 回退：见 rollback_0008.sql（反向重建，回退前必须删除 / 撤销全部 game.* 行）。
-- ============================================================================

CREATE TABLE oauth_application_scopes_0008 (
  id              TEXT PRIMARY KEY,                 -- UUIDv7
  application_id  TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL
                  CHECK (scope IN ('openid', 'profile', 'student.identity', 'offline_access',
                                   'student.grades.read', 'student.timetable.read',
                                   'game.read', 'game.play')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'approved', 'rejected')),
  review_note     TEXT,
  CONSTRAINT uq_scope_per_app_0008 UNIQUE (application_id, scope)
);

INSERT INTO oauth_application_scopes_0008 (
  id, application_id, scope, requested_at, approved_at, status, review_note
)
SELECT id, application_id, scope, requested_at, approved_at, status, review_note
  FROM oauth_application_scopes;

DROP TABLE oauth_application_scopes;
ALTER TABLE oauth_application_scopes_0008 RENAME TO oauth_application_scopes;
