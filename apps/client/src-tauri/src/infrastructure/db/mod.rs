//! 数据库基础设施：连接、迁移、凭据加密、缓存、备份与业务仓储。
//!
//! `crate::db` 是此模块的薄 facade（re-export），公开 API 与历史 `db.rs`
//! 完全兼容：所有函数签名、表结构、安全语义均保持不变。
//!
//! 模块划分（按职责）：
//! - `connection`：路径解析、连接打开与 PRAGMA、错误构造
//! - `migrations`：schema 初始化与幂等补列
//! - `credential`：账户主密钥、AES/HMAC 信封、凭据迁移
//! - `cache`：JSON 缓存读写与异步包装
//! - `backup`：明文/加密备份、恢复、校验、保留策略
//! - `repositories`：user_sessions / auth_cookie_v2 / custom_schedule_courses /
//!   online_learning / chaoxing_checkin_log 业务仓储

pub mod backup;
pub mod cache;
pub mod connection;
pub mod credential;
pub mod migrations;
pub mod repositories;

pub use backup::{
    backup_database, backup_database_encrypted, list_backups, restore_encrypted_backup,
    verify_backup, BackupReport, EncryptedBackupReport, BACKUP_KEEP_DEFAULT, BACKUP_KEEP_MAX,
};
pub use cache::{
    delete_cache, delete_cache_by_prefix, get_cache, get_cache_async, merge_grade_teacher_cache,
    run_blocking, save_cache, save_cache_async,
};
pub use connection::open_db_connection;
pub use credential::{
    migrate_session_passwords_v2, migrate_session_secrets_v1, CredMigrateReport,
    SessionSecretMigrationReport,
};
pub use migrations::init_db;
pub use repositories::*;
