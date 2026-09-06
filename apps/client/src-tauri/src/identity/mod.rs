//! Identity 领域（#622）：设备 Enrollment、Ed25519 签名批准、设备关联与撤销。
//!
//! 边界（#617 信任边界）：
//! - 私钥只进 OS keyring（service=mini-hbut-identity / account=device-ed25519-v1），fail closed；
//! - 学校密码/Cookie/Token 绝不参与本模块任何网络请求；
//! - 与 `credential_store.rs` 的密码兼容逻辑完全隔离（设备私钥禁止 Base64/SQLite 降级）。

pub mod approval;
pub mod auth_history_tests;
pub mod canonical;
pub mod client;
pub mod commands;
pub mod device_key;
pub mod enrollment;
pub mod errors;
pub mod keyring;
pub mod models;
