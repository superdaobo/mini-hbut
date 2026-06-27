//! 应用全局状态定义。
//!
//! `HbutClient` 使用 `tokio::sync::RwLock`：只读路径（cookie 快照、缓存读取）用 `read()`，
//! 登录/同步等会改变会话状态的路径用 `write()`，避免长同步饿死短操作。

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::http_client::HbutClient;

/// 全局共享的教务 HTTP 客户端实例。
pub struct AppState {
    pub client: Arc<RwLock<HbutClient>>,
}

impl AppState {
    pub fn new(client: HbutClient) -> Self {
        Self {
            client: Arc::new(RwLock::new(client)),
        }
    }
}
