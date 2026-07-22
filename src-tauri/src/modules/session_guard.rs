//! 会话护栏：业务失败时优先灌缓存 / 静默续期（#436）
//!
//! 不替代各域 ensure，只提供统一入口与错误分类，避免新模块各自造轮子。

use serde::Serialize;

use crate::http_client::HbutClient;
use crate::modules::chaoxing_sso::{self, EnsureSsoOptions};

#[derive(Debug, Clone, Serialize)]
pub struct SessionError {
    pub kind: String,
    pub message: String,
    pub can_relogin: bool,
}

impl SessionError {
    pub fn new(kind: impl Into<String>, message: impl Into<String>, can_relogin: bool) -> Self {
        Self {
            kind: kind.into(),
            message: message.into(),
            can_relogin,
        }
    }
}

/// 确保学习通会话可用（内部已含 hydrate / 静默门户重登 / FYSSO）。
pub async fn ensure_chaoxing(
    client: &mut HbutClient,
    student_id: &str,
) -> Result<serde_json::Value, String> {
    let opts = EnsureSsoOptions {
        force: false,
        allow_silent_relogin: true,
        preheated: false,
        portal_password: None,
    };
    chaoxing_sso::ensure_chaoxing_sso(client, Some(student_id), opts)
        .await
        .map_err(|e| e.to_string())
}

/// 确保一码通 / 电费 token 可用。
pub async fn ensure_one_code_electricity(client: &mut HbutClient) -> Result<String, String> {
    client
        .ensure_electricity_token()
        .await
        .map_err(|e| e.to_string())
}

pub fn looks_like_auth_failure(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("login")
        || lower.contains("auth")
        || lower.contains("401")
        || lower.contains("未登录")
        || lower.contains("会话")
        || lower.contains("token")
        || lower.contains("unauthorized")
        || lower.contains("passport")
}
