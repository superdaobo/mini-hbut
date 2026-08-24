-- #688 回滚：撤销账户级 API Key 表（危险操作，仅开发/Preview 显式人工执行）
DROP INDEX IF EXISTS idx_api_keys_user;
DROP TABLE IF EXISTS api_keys;
