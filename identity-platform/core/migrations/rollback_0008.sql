-- ============================================================================
-- rollback_0008.sql —— 0008_game_scopes_check.sql 的显式回退（仅 Preview/开发）
--
-- ⚠️ 执行前置条件（破坏性操作，生产必须单独人工确认）：
--   1. 先删除 / 撤销全部 game.* scope 行（否则重建时 CHECK 会拒绝这些行，
--      或迁移中途失败留下半成品）：
--        DELETE FROM oauth_application_scopes WHERE scope IN ('game.read','game.play');
--      （生产更推荐先把对应 client 的 scope 改为 rejected / 撤销 client，
--        保留审计痕迹后再删除行）
--   2. 确认没有 active client 仍依赖 game.* scope（否则 provider 会拒绝其授权请求）。
--
-- 回退方式：与 0008 同构的「建新表 → 拷贝 → 换名」，把 CHECK 白名单还原为
-- 0006 的 6 项（pg-mem 兼容性与命名唯一性原因见 0008 注释）。
-- 回退后代码侧还需同步回退：OIDC_SCOPES / SCOPE_WHITELIST / web scopes.ts
-- （清单见 core/docs/contract.md §8）。
-- ============================================================================

CREATE TABLE oauth_application_scopes_rb0008 (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL
                  CHECK (scope IN ('openid', 'profile', 'student.identity', 'offline_access',
                                   'student.grades.read', 'student.timetable.read')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'approved', 'rejected')),
  review_note     TEXT,
  CONSTRAINT uq_scope_per_app_rb0008 UNIQUE (application_id, scope)
);

INSERT INTO oauth_application_scopes_rb0008 (
  id, application_id, scope, requested_at, approved_at, status, review_note
)
SELECT id, application_id, scope, requested_at, approved_at, status, review_note
  FROM oauth_application_scopes
 WHERE scope NOT IN ('game.read', 'game.play');

DROP TABLE oauth_application_scopes;
ALTER TABLE oauth_application_scopes_rb0008 RENAME TO oauth_application_scopes;
