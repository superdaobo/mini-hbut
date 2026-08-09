//! 本地数据库与缓存管理模块（薄 facade）。
//!
//! 历史 `db.rs` 已按职责拆分为 `infrastructure::db` 下的多个模块：
//! 连接（connection）、schema 初始化与迁移（migrations）、凭据加密
//! （credential）、缓存（cache）、备份/恢复（backup）与业务仓储
//! （repositories）。
//!
//! 本文件只做 re-export，保持 `crate::db::*` 公共 API 与调用方完全兼容；
//! 数据库文件格式、表结构、函数签名与安全语义均未改变。
//!
//! 注意：
//! - 表结构由 init_db 统一创建
//! - 缓存表按 student_id 或 cache_key 索引
//! - 安全迁移必须由用户显式触发，启动阶段只建表

#[path = "infrastructure/db/mod.rs"]
mod db_impl;

pub use db_impl::*;
