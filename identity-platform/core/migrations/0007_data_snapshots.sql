-- ============================================================================
-- 0007_data_snapshots.sql —— #700 授权数据快照（父 #697）
--
-- 目标：App 端把用户授权范围内的成绩/课表快照上传到 Identity，加密存储，
--       由 /oauth/userinfo 按 (user_id, client_id) 注入 claims。
--
-- 设计要点：
--   1. payload 只存 AES-256-GCM 密文（payload_enc，enc:v1:... 格式），
--      明文成绩/课表绝不入库；KEK = IDENTITY_CLIENT_SECRET_KEK；
--   2. (user_id, client_id) 唯一：同一用户对同一应用只保留最新一份快照，
--      重传即覆盖（upsert），防止旧数据残留与跨版本串读；
--   3. scope_set 记录本次快照实际覆盖的 scope 数组（JSONB），
--      userinfo 注入时以「授权 scope ∩ 快照 scope_set」为准；
--   4. expires_at = 上传时间 + 7 天（应用层写入）；过期行由读取路径惰性清理，
--      不依赖外部定时任务（serverless 友好）；
--   5. client_id 外键指向 oauth_applications(client_id)，应用被吊销/删除时
--      快照级联消失（吊销时另有显式删除，见 src/domain/clients.ts）；
--   6. fetched_at 由客户端声明（数据抓取时间），仅作展示元数据，不参与信任决策。
--
-- 回滚脚本见 rollback_0007.sql（显式人工执行，禁止自动 destructive）。
-- ============================================================================

CREATE TABLE data_snapshots (
  id           TEXT PRIMARY KEY,                    -- UUIDv7
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES oauth_applications(client_id) ON DELETE CASCADE,
  scope_set    JSONB NOT NULL,                      -- 本次快照覆盖的 scope 数组
  payload_enc  TEXT NOT NULL,                       -- enc:v1:iv:tag:ciphertext（AES-256-GCM）
  fetched_at   TIMESTAMPTZ,                         -- 客户端声明的数据抓取时间
  expires_at   TIMESTAMPTZ NOT NULL,                -- now + 7 天
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_snapshot_per_user_client UNIQUE (user_id, client_id)
);

CREATE INDEX idx_data_snapshots_expires ON data_snapshots(expires_at);
