-- 回滚 0009：删除 device_token_challenges（该表只承载短时一次性 challenge，
-- 删除后所有在途 challenge 立即失效：客户端重新走 challenge 端点即可，
-- 不涉及任何持久资产，属可安全回退的 schema 变更）。
DROP TABLE device_token_challenges;
