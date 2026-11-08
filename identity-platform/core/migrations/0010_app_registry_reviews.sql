-- ============================================================================
-- 0010_app_registry_reviews.sql —— T12（mini-hbut#1170）应用注册审核记录
--
-- 设计依据：docs/architecture/t12-app-registry-lifecycle.md §2.2（字段表）
-- 与 §3（状态机）。本 migration 是纯增量：不改动 0001-0009 的任何表/约束。
--
-- 决策记录：
--   - 【为何不扩展 application_reviews（依据）】
--     (1) 外键冲突：application_reviews.application_id 是
--         REFERENCES oauth_applications(id) 的硬外键（migrations/0002_admin_roles.sql:40），
--         而 T12 的 app_id 是业务标识 [a-z0-9_-]{2,48}（docs/architecture/
--         t12-app-registry-lifecycle.md §2.2 字段表），不是 oauth_applications
--         的 UUID。复用旧表必须为每个新应用在待退役的 oauth_applications 里
--         补造 UUID 行——与 T15 旧 client 退役路线直接冲突（迁移计划 §9-7：
--         新记录从零开始，旧记录由 T13/T15 退役，不自动迁移）。
--     (2) 状态词表冲突：旧表 CHECK status IN ('pending','approved','rejected',
--         'superseded')（migrations/0002_admin_roles.sql:49-50），新状态机需要
--         draft/submitted/provisioned/active/suspended/revoked（本文件 CHECK；
--         领域实现 src/domain/app-registry/lifecycle.ts:28-39）。扩旧表必须
--         ALTER 既有 CHECK 约束（对 0002 契约的破坏性修改，违反本目录"纯增量"
--         铁律，migrations/README.md:5-14），且两套词表混在一张表里必然产生
--         双事实源。
--     (3) 缺字段：旧表无 form/entry/allowed_groups/data_domains/compat/module/
--         casdoor/owner/version/decision_reason/artifact_receipts（§2.2 新增
--         字段），扩列要么 NOT NULL 加默认（旧行语义被污染）要么可空（新表
--         契约被稀释）。
--   - 【双事实源结论】app_registry_reviews 是 T12 审核记录的【唯一权威】。
--     旧 application_reviews 仅服务待退役的旧 OAuth client 审核流
--     （读取路径 src/api/admin/queries.ts 的 listReviewsForApplication 等，
--     行为不变，随 T15 旧 client 退役）；同一个应用（新 app_id）的任何时刻
--     只在本表持有审核状态，两套表之间不存在同一应用的双写/同步，
--     也不做数据迁移（迁移计划 §9-7：新记录从零开始）。
--   - (app_id, version) 硬唯一：同一应用版本单调递增；
--     (app_id, revision) 只建普通索引：§4.1 的提交幂等键（应用层在
--     submitted 态内按 (app_id, revision) 查重返回既有 pending）。
--     刻意【不】建 (app_id, revision) UNIQUE —— 旧记录 superseded 后保留
--     审计行，同内容再次回炉重提必须允许（硬唯一会误杀「改过 → 再改回
--     原内容」的合法重提）。
--   - status 含 'superseded'：它是幂等作废标记（§3.2 #1/#4 的「旧 review
--     自动 superseded」），不是 §3.1 状态机节点（REVIEW_TRANSITIONS 不含
--     它），沿用旧表 application_reviews.status 的 superseded 约定。
--   - 「单 pending 不变量」（每 app_id 至多一条 submitted）沿用 0002 的
--     决策：不用 partial unique index（pg-mem 规划器缺陷，见
--     0002_admin_roles.sql:59-64 注释），由应用层
--     SELECT ... FOR UPDATE + 条件 UPDATE 保证（见 app_registry.repo.ts）。
--   - CHECK 只用 IN / char_length（pg-mem 已验证支持，0001:50/73）；
--     app_id 的字符集 [a-z0-9_-] 由路由层校验（pg-mem 不支持正则 CHECK）。
-- ============================================================================

CREATE TABLE app_registry_reviews (
  id                  TEXT PRIMARY KEY,            -- UUIDv7（沿用 application_reviews.id 约定）
  app_id              TEXT NOT NULL
                      CHECK (char_length(app_id) BETWEEN 2 AND 48),   -- 业务标识 [a-z0-9_-]{2,48}
  version             INTEGER NOT NULL
                      CHECK (version > 0),         -- 同一 app_id 单调递增
  revision            TEXT NOT NULL
                      CHECK (char_length(revision) = 64),  -- 内容寻址 sha256 hex64
  form                TEXT NOT NULL
                      CHECK (form IN ('embedded', 'external')),
  entry               TEXT,                        -- embedded 必填（宿主 route/manifest 入口）；external 为 NULL
  redirect_uris       JSONB NOT NULL,              -- [{uri, kind}]，kind: web_https / native_custom / native_loopback
  allowed_groups      JSONB NOT NULL,              -- ["hbut-students", ...]（fdl-users 群组，非空）
  data_domains        JSONB NOT NULL,              -- [{domain, operations[], purpose}]（非空，用途可读）
  compat              JSONB NOT NULL,              -- {min_host, platforms[], store_policy}
  module              JSONB,                       -- {manifest_url, artifact_url, publisher_key_id, release_seq}（remote 必填）
  casdoor             JSONB NOT NULL,              -- {application_name, client_id, expire_in_hours, refresh_expire_in_hours, token_format, token_fields[]}
  owner               TEXT NOT NULL,               -- 负责人 developer_id（审核/撤销/轮换的授权主体）
  submitted_by        TEXT NOT NULL,               -- 提交人内部 user_id
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewer            TEXT,                        -- 审核人内部 user_id（禁止 self-review）
  reviewed_at         TIMESTAMPTZ,
  decision            TEXT
                      CHECK (decision IS NULL OR decision IN ('approved', 'rejected')),
  decision_reason     TEXT,                        -- rejected 必填（1..2000，开发者可读）
  status              TEXT NOT NULL DEFAULT 'submitted'
                      CHECK (status IN ('draft', 'submitted', 'rejected', 'approved',
                                         'provisioned', 'active', 'suspended', 'revoked',
                                         'superseded')),  -- §3.1 状态机 + superseded 作废标记
  artifact_receipts   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {casdoor|policy|catalog|module: {at, result, detail?}}
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_app_registry_app_version UNIQUE (app_id, version)
);

-- 幂等/查询索引（(app_id, revision) 为 §4.1 审核记录幂等键；均为普通索引）
CREATE INDEX idx_app_registry_app_status   ON app_registry_reviews (app_id, status);
CREATE INDEX idx_app_registry_app_revision ON app_registry_reviews (app_id, revision);
CREATE INDEX idx_app_registry_status       ON app_registry_reviews (status);
