//! HTTP Bridge 共享状态。

use jsonwebtoken::DecodingKey;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::RwLock;

use crate::http_client::HbutClient;

/// Bridge 路由共享状态。
#[derive(Clone)]
pub(crate) struct HttpState {
    pub(crate) client: Arc<RwLock<HbutClient>>,
    pub(crate) local_api_key: Option<DecodingKey>,
    pub(crate) bridge_token: Arc<str>,
    /// 本机 Agent 令牌（#698）：`/local/*` 只读端点族门禁；
    /// None 表示令牌文件初始化失败，端点一律拒绝（fail closed）。
    pub(crate) local_agent_token: Option<Arc<str>>,
    pub(crate) app: AppHandle,
}
