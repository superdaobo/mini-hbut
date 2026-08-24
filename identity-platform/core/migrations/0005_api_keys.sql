-- ============================================================================
-- 0005_api_keys.sql —— 账户级 API Key（#688，父 #686）
--
-- 核心原则：
--   1. secret_hash = sha256Base64url(整串 Key)，绝不存明文；
--      明文只在签发响应中出现一次（POST /api/v1/developer/keys）。
--   2. Key 形态：mhbat_<8位小写hex>_<43位base64url>
--      （"mhbat_" + 8 hex prefix + "_" + 32 字节随机 base64url 无填充）。
--      prefix 列存 "mhbat_<8位hex>"（14 字符），带 UNIQUE 约束供认证时按前缀定位行。
--   3. status 用 TEXT + CHECK（与 0001 类型策略一致，便于平滑演进可回滚）。
--   4. scopes JSONB 默认 ["account.full"]（一期唯一 scope）。
--
-- 回滚脚本见 rollback_0005.sql（显式人工执行，禁止自动 destructive）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '["account.full"]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
