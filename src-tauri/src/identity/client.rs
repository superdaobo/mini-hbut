//! Identity Core API 客户端（#622）。
//!
//! 仅用于设备身份相关端点（enroll / revoke / me），与学校会话的 HbutClient 完全隔离：
//! - 不携带学校 Cookie/Token（#617 信任边界 15）；
//! - 设备私钥永不离开本进程，网络只发送公钥与签名。

use serde::{Deserialize, Serialize};

use super::device_key::PublicJwk;
use super::errors::IdentityError;

/// 设备签名 API 的 Authorization header 格式：`Device <device_id> <issued_at> <nonce> <signature>`。
pub const DEVICE_AUTH_SCHEME: &str = "Device";

/// POST /api/v1/app/devices/enroll 请求体。
#[derive(Debug, Clone, Serialize)]
pub struct EnrollDeviceBody {
    pub public_jwk: PublicJwk,
    pub platform: &'static str,
    pub app_version: String,
    pub device_name: String,
    pub challenge: String,
    pub student_id: String,
    pub student_name: String,
    pub issued_at: i64,
    pub nonce: String,
    pub signature: String,
}

/// POST /api/v1/app/devices/enroll 响应。
#[derive(Debug, Clone, Deserialize)]
pub struct EnrollDeviceResponse {
    pub user_id: String,
    pub device_id: String,
    pub status: String,
}

/// 设备身份 API 客户端。
pub struct IdentityApiClient {
    base_url: String,
    http: reqwest::Client,
}

impl IdentityApiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            http: reqwest::Client::new(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    /// 提交设备注册（enrollment）。
    pub async fn enroll_device(
        &self,
        body: &EnrollDeviceBody,
        handoff: &str,
    ) -> Result<EnrollDeviceResponse, IdentityError> {
        let resp = self
            .http
            .post(self.url("/api/v1/app/devices/enroll"))
            .header("Authorization", format!("Handoff {handoff}"))
            .json(body)
            .send()
            .await
            .map_err(|e| IdentityError::Network(e.to_string()))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| IdentityError::Network(e.to_string()))?;
        if status.is_success() {
            serde_json::from_str(&text)
                .map_err(|e| IdentityError::Internal(format!("enroll 响应解析失败: {e}")))
        } else {
            Err(parse_api_error(status.as_u16(), &text))
        }
    }

    /// 撤销当前设备（设备签名认证；服务端 revoke 成功后由调用方删除本地 key）。
    pub async fn revoke_current_device(
        &self,
        device_id: &str,
        issued_at: i64,
        nonce: &str,
        signature: &str,
    ) -> Result<(), IdentityError> {
        // 防御：device_id 直接拼进 URL，必须拒绝路径分隔符（签名前 canonical 已校验过 token 字符集）
        if device_id.is_empty() || device_id.contains('/') {
            return Err(IdentityError::InvalidInput("device_id 非法".to_string()));
        }
        let auth = format!("{DEVICE_AUTH_SCHEME} {device_id} {issued_at} {nonce} {signature}");
        let resp = self
            .http
            .post(self.url(&format!("/api/v1/app/devices/{device_id}/revoke")))
            .header(reqwest::header::AUTHORIZATION, auth)
            .send()
            .await
            .map_err(|e| IdentityError::Network(e.to_string()))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| IdentityError::Network(e.to_string()))?;
        if status.is_success() {
            Ok(())
        } else {
            Err(parse_api_error(status.as_u16(), &text))
        }
    }
}

/// 解析 Core 错误响应（error.message 或 error 字符串），已脱敏，不回显敏感材料。
fn parse_api_error(status: u16, text: &str) -> IdentityError {
    let parsed = serde_json::from_str::<serde_json::Value>(text).ok();
    let message = parsed
        .as_ref()
        .and_then(|v| v.get("error"))
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
        .or_else(|| {
            parsed
                .as_ref()
                .and_then(|v| v.get("error"))
                .and_then(|e| e.as_str())
        })
        .unwrap_or_else(|| "请求被身份服务拒绝");
    IdentityError::Api {
        status,
        message: message.to_string(),
    }
}
