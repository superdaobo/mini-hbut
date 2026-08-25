-- #700 回滚：撤销授权数据快照表（危险操作，仅开发/Preview 显式人工执行）
DROP INDEX IF EXISTS idx_data_snapshots_expires;
DROP TABLE IF EXISTS data_snapshots;
