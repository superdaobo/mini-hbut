//! Tauri command 分模块入口（逐步从 lib.rs 迁出）。

pub mod campus_network;
pub mod credentials;

pub use campus_network::{campus_network_login, campus_network_logout, campus_network_probe};
pub use credentials::{
    delete_remembered_credential, load_remembered_credential, load_session_password,
    save_remembered_credential,
};
