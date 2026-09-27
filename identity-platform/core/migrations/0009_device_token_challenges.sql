-- ============================================================================
-- 0009_device_token_challenges.sql —— #902 第一方设备换票 challenge（一次性）
--
-- 目标：为「device-signed token exchange」提供**无状态部署下可验证的一次性凭据**。
--   POST /api/v1/app/device-token/challenge  设备签名认证 → 返回高熵一次性 challenge
--   POST /api/v1/app/device-token/exchange   设备签名（canonical 绑定 challenge）→ JWT AT
--
-- 为什么必须落库（不能只靠内存/无状态签名）：
--   Identity Core 部署为 Vercel serverless，多实例 + 每次请求可能换实例，
--   任何进程内 Map 都无法保证「同一 challenge 只被消费一次」；challenge 必须
--   持久化，且一次性消费必须是单条条件 UPDATE（禁止 SELECT-then-UPDATE 的 TOCTOU）。
--
-- 安全设计：
--   1. 只存 challenge_hash = sha256(challenge)（明文绝不入库、绝不回显给第三方）；
--      challenge 为 32 字节 CSPRNG（256 bit 熵），无字典攻击面，摘要用无密钥 SHA-256 足够；
--   2. 绑定 device_id：challenge 只能由签发它的设备兑换（防拿到摘要/明文后跨设备兑换）；
--   3. 短时（默认 120s，应用层写入 expires_at）+ 一次性（consumed_at 非空即失效）；
--   4. 与 device_enrollment_challenges 分表：两者用途、TTL、绑定维度都不同，
--      不得互相兑换（enrollment challenge 泄漏不等于可换 AT，反之亦然）；
--   5. devices 删除/级联时 challenge 一并消失（不留孤儿行）。
--
-- 回滚：见 rollback_0009.sql（显式人工执行，禁止自动 destructive）。
-- ============================================================================

CREATE TABLE device_token_challenges (
  id             TEXT PRIMARY KEY,                   -- UUIDv7
  challenge_hash TEXT NOT NULL,                      -- sha256(challenge) base64url，绝不存明文
  device_id      TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,                        -- 一次性：非 NULL 即已消费
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_token_challenges_expires ON device_token_challenges (expires_at);
CREATE INDEX idx_device_token_challenges_device ON device_token_challenges (device_id);
