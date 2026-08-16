-- ============================================================================
-- 0001_initial.sql —— Mini-HBUT Identity Core 初始 schema（12 张表）
-- Issue #619：用户/学校身份/设备/Client/AuthRequest + oidc-provider 记录表
--
-- 核心原则（docs/issues/619.json、docs/issues/617.json 信任边界）：
--   1. student_id 绝不作主键/sub；用户主键为应用层生成的 UUIDv7（TEXT 列）。
--   2. 学校身份是 linked_identity（provider=hbut，verification_method=mini_hbut_app）。
--   3. 设备只存 Ed25519 公钥 JWK（public_key_jwk），私钥永不入库。
--   4. 短期 secret（handoff、challenge）只存 hash/HMAC 派生值。
--   5. client_secret 只存 application-layer 加密密文（AES-256-GCM，KEK 在环境变量）。
--   6. 本 migration 只 CREATE 对象，可重复执行（幂等性由迁移执行器保证）；
--      回滚脚本见 rollback_0001.sql（显式人工执行，禁止自动 destructive）。
--   7. 禁止在 Serverless cold start 自动执行本文件（见 src/db/migrate.ts 说明）。
--
-- 类型策略：V1 全部用 TEXT + CHECK 约束代替 PG enum，
--   便于未来通过 DROP CONSTRAINT / ADD CONSTRAINT 平滑演进（可回滚）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) users：Mini-HBUT 用户（主键是随机 UUIDv7，不是学号）
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              TEXT PRIMARY KEY,                 -- UUIDv7，应用层生成
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'disabled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ                       -- 经过签名验证的请求后才更新
);

-- ---------------------------------------------------------------------------
-- 2) linked_identities：学校身份（provider 内 subject 才允许是学号）
-- ---------------------------------------------------------------------------
CREATE TABLE linked_identities (
  id                    TEXT PRIMARY KEY,           -- UUIDv7
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('hbut')),
  subject               TEXT NOT NULL,              -- provider 内 subject（hbut = 学号），
                                                    -- 绝不用于 OIDC sub
  student_name_snapshot TEXT,
  college_snapshot      TEXT,
  major_snapshot        TEXT,
  class_name_snapshot   TEXT,
  grade_snapshot        TEXT,
  verification_method   TEXT NOT NULL CHECK (verification_method IN ('mini_hbut_app', 'hbut_oidc')),
  verification_level    TEXT NOT NULL DEFAULT 'low'
                        CHECK (verification_level IN ('low', 'medium', 'high')),
  verified_at           TIMESTAMPTZ NOT NULL,
  last_refreshed_at     TIMESTAMPTZ,
  metadata_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 相同学号不能静默并入新账户；冲突必须显式报 IDENTITY_ALREADY_BOUND
  CONSTRAINT uq_linked_identities_provider_subject UNIQUE (provider, subject)
);

CREATE INDEX idx_linked_identities_user ON linked_identities (user_id);

-- ---------------------------------------------------------------------------
-- 3) devices：绑定设备，只存 Ed25519 公钥 JWK
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
  id                      TEXT PRIMARY KEY,         -- UUIDv7
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key_jwk          JSONB NOT NULL,           -- Ed25519 public JWK（禁止含 d 字段）
  key_algorithm           TEXT NOT NULL DEFAULT 'Ed25519'
                          CHECK (key_algorithm = 'Ed25519'),
  public_key_fingerprint  TEXT NOT NULL UNIQUE,     -- sha256(canonical JWK) base64url
  platform                TEXT NOT NULL DEFAULT 'unknown'
                          CHECK (platform IN ('windows', 'macos', 'linux', 'android', 'ios', 'unknown')),
  app_version             TEXT,
  device_name             TEXT NOT NULL
                          CHECK (char_length(device_name) BETWEEN 1 AND 64),
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'active', 'revoked')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at            TIMESTAMPTZ,
  last_seen_at            TIMESTAMPTZ,              -- 只在签名验证成功后更新
  revoked_at              TIMESTAMPTZ,
  revoked_reason          TEXT
);

CREATE INDEX idx_devices_user ON devices (user_id);

-- ---------------------------------------------------------------------------
-- 4) device_enrollment_challenges：一次性短时挑战（只存 hash）
-- ---------------------------------------------------------------------------
CREATE TABLE device_enrollment_challenges (
  id             TEXT PRIMARY KEY,                  -- UUIDv7
  challenge_hash TEXT NOT NULL,                     -- sha256(challenge)，绝不存明文
  purpose        TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,                       -- 一次性：非 NULL 即已消费
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_enrollment_challenges_expires ON device_enrollment_challenges (expires_at);

-- ---------------------------------------------------------------------------
-- 5) developers：开发者身份（绑定 Mini-HBUT user，不直接绑学号）
-- ---------------------------------------------------------------------------
CREATE TABLE developers (
  id            TEXT PRIMARY KEY,                   -- UUIDv7
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  contact_email TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6) oauth_applications：第三方 Client 注册表（唯一权威来源）
-- ---------------------------------------------------------------------------
CREATE TABLE oauth_applications (
  id                        TEXT PRIMARY KEY,       -- UUIDv7（内部 id）
  client_id                 TEXT NOT NULL UNIQUE,   -- 不透明随机 OIDC client_id
  owner_developer_id        TEXT NOT NULL REFERENCES developers(id),
  name                      TEXT NOT NULL,
  description               TEXT,
  homepage_url              TEXT,
  privacy_policy_url        TEXT,
  client_type               TEXT NOT NULL
                            CHECK (client_type IN ('web_confidential', 'native_public', 'browser_public')),
  status                    TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'pending_review', 'approved',
                                              'active', 'rejected', 'suspended', 'revoked')),
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_basic'
                            CHECK (token_endpoint_auth_method IN ('client_secret_basic', 'client_secret_post', 'none')),
  -- client_secret 明文只允许：创建时向开发者展示一次；此后仅以 AES-256-GCM(KEK) 密文入库
  client_secret_encrypted   TEXT,
  client_secret_expires_at  TIMESTAMPTZ,            -- rotate 后旧 secret 的失效时间（NULL=永不过期）
  subject_type              TEXT NOT NULL DEFAULT 'pairwise'
                            CHECK (subject_type IN ('pairwise', 'public')),
  sector_identifier         TEXT,                   -- 预留：未来 pairwise sector 语义
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at              TIMESTAMPTZ,
  reviewed_at               TIMESTAMPTZ,
  activated_at              TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_applications_owner ON oauth_applications (owner_developer_id);
CREATE INDEX idx_oauth_applications_status ON oauth_applications (status);

-- ---------------------------------------------------------------------------
-- 7) oauth_redirect_uris：精确匹配的注册 redirect_uri（禁止通配/后缀匹配）
-- ---------------------------------------------------------------------------
CREATE TABLE oauth_redirect_uris (
  id             TEXT PRIMARY KEY,                  -- UUIDv7
  application_id TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,                     -- 服务端存规范化后的注册值
  kind           TEXT NOT NULL CHECK (kind IN ('web_https', 'native_custom', 'native_loopback')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_redirect_uri_per_app UNIQUE (application_id, redirect_uri)
);

-- ---------------------------------------------------------------------------
-- 8) oauth_application_scopes：Client 申请的 scope 与审核状态
--    V1 scope 白名单：openid / profile / student.identity / offline_access
-- ---------------------------------------------------------------------------
CREATE TABLE oauth_application_scopes (
  id              TEXT PRIMARY KEY,                 -- UUIDv7
  application_id  TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  scope           TEXT NOT NULL
                  CHECK (scope IN ('openid', 'profile', 'student.identity', 'offline_access')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'approved', 'rejected')),
  review_note     TEXT,
  CONSTRAINT uq_scope_per_app UNIQUE (application_id, scope)
);

-- ---------------------------------------------------------------------------
-- 9) oauth_consents：产品级用户授权记录（OIDC Grant 由 oidc-provider Adapter 管）
-- ---------------------------------------------------------------------------
CREATE TABLE oauth_consents (
  id              TEXT PRIMARY KEY,                 -- UUIDv7
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  TEXT NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  granted_scopes  JSONB NOT NULL,                   -- 已授权 scope 数组快照
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  CONSTRAINT uq_consent_per_user_app UNIQUE (user_id, application_id)
);

-- ---------------------------------------------------------------------------
-- 10) auth_requests：OIDC interaction 与 App Approval 的协调记录
--     request_id 格式：ar_<uuidv7>（#621 合同，见 docs/contract.md）
--     TTL 默认 120 秒（配置化，见 src/config/authRequest.ts）
--     状态机合法迁移表见 src/domain/auth-requests/state-machine.ts
-- ---------------------------------------------------------------------------
CREATE TABLE auth_requests (
  id                      TEXT PRIMARY KEY,         -- request_id: 'ar_' + uuidv7
  interaction_uid         TEXT NOT NULL UNIQUE,     -- oidc-provider interaction UID
  client_id               TEXT NOT NULL REFERENCES oauth_applications(client_id),
  requested_scopes        JSONB NOT NULL,           -- 创建后不可变的 scope 快照
  scope_hash              TEXT NOT NULL,            -- sha256(规范化 scope 列表)
  server_challenge        TEXT NOT NULL,            -- 高熵挑战（设备签名的对象，非 secret）
  handoff_secret_hash     TEXT NOT NULL,            -- HMAC-SHA256(handoff secret)，绝不存明文
  status                  TEXT NOT NULL DEFAULT 'CREATED'
                          CHECK (status IN ('CREATED', 'WAITING_APP', 'APP_OPENED', 'APPROVED',
                                            'INTERACTION_FINISHED', 'CODE_ISSUED', 'CONSUMED',
                                            'DENIED', 'EXPIRED', 'CANCELLED', 'FAILED')),
  expires_at              TIMESTAMPTZ NOT NULL,
  opened_at               TIMESTAMPTZ,
  approved_at             TIMESTAMPTZ,
  denied_at               TIMESTAMPTZ,
  approved_user_id        TEXT,                     -- approve 时由服务端按 device.user_id 决定
  approved_device_id      TEXT,
  approval_nonce          TEXT,                     -- approve 时生成，防重放/幂等标识
  interaction_finished_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_requests_status  ON auth_requests (status);
CREATE INDEX idx_auth_requests_expires ON auth_requests (expires_at);

-- ---------------------------------------------------------------------------
-- 11) audit_events：审计事件（metadata 必须经 observability/audit/serializer 脱敏）
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id                     TEXT PRIMARY KEY,          -- UUIDv7
  event_type             TEXT NOT NULL,
  actor_type             TEXT NOT NULL
                         CHECK (actor_type IN ('user', 'device', 'developer', 'admin', 'client', 'system')),
  actor_id               TEXT,
  target_type            TEXT,
  target_id              TEXT,
  result                 TEXT NOT NULL CHECK (result IN ('success', 'denied', 'error')),
  request_correlation_id TEXT,
  ip_hash                TEXT,                      -- 不保存原始 IP
  user_agent_summary     TEXT,                      -- 截断/脱敏
  metadata_json          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 白名单字段（敏感字段拒绝）
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor   ON audit_events (actor_type, actor_id);
CREATE INDEX idx_audit_created ON audit_events (created_at);

-- ---------------------------------------------------------------------------
-- 12) oidc_provider_records：oidc-provider Adapter 通用持久化表
--     覆盖模型：AccessToken / AuthorizationCode / RefreshToken / DeviceCode /
--               BackchannelAuthenticationRequest / PreAuthorizedCode /
--               Interaction / Session / Grant / ClientCredentials /
--               PushedAuthorizationRequest / RegistrationAccessToken 等
--     Client 模型除外：Client 动态读取自 oauth_applications（见 src/oidc/adapter/）
-- ---------------------------------------------------------------------------
CREATE TABLE oidc_provider_records (
  id            TEXT PRIMARY KEY,                   -- 内部 UUIDv7
  model_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,                      -- oidc-provider artifact id（jti/sid 等）
  payload_jsonb JSONB NOT NULL,                     -- 协议 artifact 完整 payload
  expires_at    TIMESTAMPTZ,                        -- NULL = 永不过期（expiresIn undefined）
  consumed_at   TIMESTAMPTZ,                        -- consume 标记（payload.consumed 同步写）
  grant_id      TEXT,                               -- payload.grantId 索引（revokeByGrantId）
  user_code     TEXT,                               -- payload.userCode 索引（DeviceCode/CIBA）
  uid           TEXT,                               -- payload.uid 索引（Session）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_oidc_model_record UNIQUE (model_name, record_id)
);

CREATE INDEX idx_oidc_records_grant_id  ON oidc_provider_records (grant_id);
CREATE INDEX idx_oidc_records_user_code ON oidc_provider_records (user_code);
CREATE INDEX idx_oidc_records_uid       ON oidc_provider_records (uid);
CREATE INDEX idx_oidc_records_expires   ON oidc_provider_records (expires_at);
