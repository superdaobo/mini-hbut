-- ============================================================================
-- 0002_admin_roles.sql —— Mini-HBUT Identity Admin 后台（issue #625）
--
-- 本 migration 是纯增量：不改动 0001 的任何现有表/约束，只新增两张表：
--
--   1) user_roles            管理员 RBAC（identity_admin / identity_reviewer）
--   2) application_reviews   审核快照（不可变，防 TOCTOU）
--
-- 决策记录（#625 交付报告同步说明）：
--   - 没有现有表能表达「角色成员关系」：developers 是开发者门户身份表
--     （与管理员无必然交集），audit_events 是追加式日志（不能作为授权源），
--     故新增专用表；migrations 目录由迁移执行器按文件名发现（见 src/db/migrate.ts），
--     新增文件不影响 0001 已应用的部署。
--   - 角色用软删除（revoked_at）保留历史，支持 re-grant 审计链。
--   - 审核快照把 metadata/redirect_uris/scopes 冻结为 JSONB，
--     approve 时重算 revision 比对（内容寻址），防止 TOCTOU。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) user_roles：管理员角色（绑定内部 user id，绝不绑定学号）
-- ---------------------------------------------------------------------------
CREATE TABLE user_roles (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL
             CHECK (role IN ('identity_admin', 'identity_reviewer')),
  granted_by TEXT,                   -- 授予人内部 user id；out-of-band 脚本为 NULL
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,            -- 非 NULL = 已撤销（软删除，保留审计链）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_roles_user_role UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles (user_id);

-- ---------------------------------------------------------------------------
-- 2) application_reviews：审核快照（提交时冻结，approve/reject 后不可变）
-- ---------------------------------------------------------------------------
CREATE TABLE application_reviews (
  id                          TEXT PRIMARY KEY,            -- UUIDv7
  application_id              TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  -- 内容寻址 revision：sha256(名称/描述/主页/隐私/类型/redirect_uris/scopes)
  -- 的规范化 JSON；approve 时必须与 application 当前内容一致，否则 superseded
  revision                    TEXT NOT NULL,
  submitted_by                TEXT NOT NULL,               -- 提交人 user_id（owner developer 的 user_id）
  submitted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_snapshot_json      JSONB NOT NULL,              -- 应用身份快照（不含 secret/学号）
  redirect_uris_snapshot_json JSONB NOT NULL,              -- [{uri, kind, created_at}]
  scopes_snapshot_json        JSONB NOT NULL,              -- [{scope, status, review_note, requested_at}]
  status                      TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  reviewer_user_id            TEXT,                        -- 处理该 review 的管理员 user_id
  reviewed_at                 TIMESTAMPTZ,
  decision_note               TEXT,                        -- 管理员整体意见（reject 必填，开发者可读）
  scope_decisions_json        JSONB,                       -- approve 时 [{scope, decision, note}]
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每个应用同时最多一个 pending review（历史 review 保留用于追溯）。
-- 说明：不使用 CREATE UNIQUE INDEX ... WHERE（partial unique index）——
-- pg-mem 的查询规划器会用该索引服务全列等值查询，导致漏行（pg-mem 缺陷）；
-- 「单 pending」不变量由应用层保证（ensurePendingReview 以 SELECT ... FOR UPDATE
-- 锁应用行后串行检查/重建，见 src/api/admin/reviews.ts）。
CREATE INDEX idx_reviews_application ON application_reviews (application_id, status);
CREATE INDEX idx_reviews_status ON application_reviews (status);
