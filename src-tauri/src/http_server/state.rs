//! HTTP Bridge 共享状态。

use jsonwebtoken::DecodingKey;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

use crate::http_client::HbutClient;

/// Bridge 路由共享状态（字段与拆分前完全一致）。
#[derive(Clone)]
pub(crate) struct HttpState {
    pub(crate) client: Arc<RwLock<HbutClient>>,
    pub(crate) local_api_key: Option<DecodingKey>,
    pub(crate) bridge_token: Arc<str>,
    pub(crate) app: AppHandle,
}
