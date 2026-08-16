-- #626 持久化限流桶（Postgres 原子计数，无外部依赖，Serverless 多实例共享）
-- 设计说明：
--   - bucket_key = <endpoint 分组>:<IP 哈希>（IP 只存哈希，不进日志/审计）；
--   - 固定窗口计数：window_start 为窗口起点（epoch ms），窗口过期自动轮换；
--   - 计数采用单条 INSERT ... ON CONFLICT DO UPDATE ... RETURNING 原子完成，
--     并发请求各自拿到正确的 count（行锁保证），无需外部锁/队列；
--   - updated_at 供概率清理旧桶（防止表无限膨胀）。

CREATE TABLE rate_limit_buckets (
  bucket_key   TEXT PRIMARY KEY,
  window_start BIGINT NOT NULL,
  count        BIGINT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX rate_limit_buckets_updated_at_idx ON rate_limit_buckets (updated_at);
