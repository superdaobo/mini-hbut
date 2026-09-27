//! #902 第一方设备换票（device-signed token exchange）。
//!
//! 链路：**Device Key → Identity Access Token →（#902c Game Launch Ticket → Game Session）**
//!
//! 流程（两步，均为设备私钥签名，私钥永不离开本进程）：
//!   1. `POST /api/v1/app/device-token/challenge`
//!      Authorization: `Device <device_id> <issued_at> <nonce> <signature>`
//!      canonical = MINI-HBUT-DEVICE-API-V1（method=POST + 该 path）→ 返回一次性 challenge；
//!   2. `POST /api/v1/app/device-token/exchange`
//!      body = { device_id, challenge, issued_at, nonce, signature }
//!      canonical = MINI-HBUT-DEVICE-TOKEN-V1（challenge 在签名内）→ 返回 resource-scoped JWT AT。
//!
//! 安全约定（任务书硬约束，逐条落到代码）：
//! - AT **只以返回值形式交给前端内存**，本模块不缓存、不落盘、不打印；
//! - `refresh_token` V1 不存在：Core 不签发，本模块的类型里也没有该字段（反序列化即忽略）；
//! - Debug 输出对 token 与签名做脱敏（只留长度），避免 `{:?}` 意外进日志（协议 §10）；
//! - 失败一律返回 Err（由命令层转成简体中文文案），绝不"降级"用旧 token 或跳过验签。

use serde::{Deserialize, Serialize};

use super::canonical::{self, DeviceApiCanonicalInput, DeviceTokenCanonicalInput};
use super::client::{DeviceTokenExchangeBody, IdentityApiClient};
use super::device_key::DeviceKey;
use super::errors::IdentityError;

/// 一次性 challenge 端点（Device 签名认证；canonical 绑定 method+path）。
pub const DEVICE_TOKEN_CHALLENGE_PATH: &str = "/api/v1/app/device-token/challenge";
/// 设备换票端点（body 内设备签名，canonical 绑定 challenge）。
pub const DEVICE_TOKEN_EXCHANGE_PATH: &str = "/api/v1/app/device-token/exchange";

/// challenge 端点响应（Core：`{ challenge, expires_at, expires_in }`）。
#[derive(Clone, Deserialize)]
pub struct DeviceTokenChallengeResponse {
    pub challenge: String,
    pub expires_at: Option<String>,
    pub expires_in: Option<i64>,
}

/// Debug 只输出字段存在性与长度，绝不输出 challenge 明文/长度敏感信息（challenge 非 secret，
/// 但仍遵循"凭据材料不进日志"的最低标准；协议 §10 覆盖 Authorization/ticket/token 原值）。
impl std::fmt::Debug for DeviceTokenChallengeResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeviceTokenChallengeResponse")
            .field("challenge_len", &self.challenge.len())
            .field("expires_at", &self.expires_at)
            .field("expires_in", &self.expires_in)
            .finish()
    }
}

/// 换票端点响应（Core：`{ access_token, token_type, expires_in, expires_at, scope, audience }`）。
/// **V1 无 refresh_token**：Core 不签发，这里也不声明该字段（多余字段被 serde 忽略）。
#[derive(Clone, Deserialize)]
pub struct DeviceTokenExchangeResponse {
    pub access_token: String,
    pub token_type: Option<String>,
    pub expires_in: Option<i64>,
    pub expires_at: Option<String>,
    pub scope: Option<String>,
    pub audience: Option<String>,
}

/// Debug 脱敏：只输出 token 长度与元数据（禁止 token 原值进任何日志/遥测）。
impl std::fmt::Debug for DeviceTokenExchangeResponse {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeviceTokenExchangeResponse")
            .field("access_token_len", &self.access_token.len())
            .field("token_type", &self.token_type)
            .field("expires_in", &self.expires_in)
            .field("expires_at", &self.expires_at)
            .field("scope", &self.scope)
            .field("audience", &self.audience)
            .finish()
    }
}

/// 返回给前端的换票结果（只含 AT 与元数据；前端只把 AT 放进内存）。
#[derive(Clone, Serialize)]
pub struct DeviceTokenPayload {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub expires_at: String,
}

/// Debug 脱敏（同上：token 只输出长度）。
impl std::fmt::Debug for DeviceTokenPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeviceTokenPayload")
            .field("access_token_len", &self.access_token.len())
            .field("token_type", &self.token_type)
            .field("expires_in", &self.expires_in)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

/// 校验 Core 返回的 AT 形状（防响应被中间人/代理篡改成非 JWT 或注入控制字符）。
/// 只做形状校验（三段落、无空白/控制字符、长度上限）；**签名由资源服务器用 JWKS 验证**，
/// 客户端不做也不需要做验签（本地"验签通过"不构成任何信任提升）。
fn assert_access_token_shape(token: &str) -> Result<(), IdentityError> {
    let valid = token.len() >= 32
        && token.len() <= 4096
        && token.matches('.').count() == 2
        && !token.chars().any(|c| c.is_whitespace() || c.is_control());
    if !valid {
        return Err(IdentityError::Internal(
            "身份服务返回的访问令牌形状非法".to_string(),
        ));
    }
    Ok(())
}

/// 执行完整换票流程（challenge → 设备签名 → 换取 AT）。
///
/// 参数：
/// - `key`：本机设备私钥（来自 keyring，绝不外传）；
/// - `client`：Identity Core API 客户端（origin 白名单已由命令层校验）；
/// - `device_id`：本机注册返回的 device_id（服务端据此查设备公钥与 user_id）。
pub async fn exchange_device_token(
    key: &DeviceKey,
    client: &IdentityApiClient,
    device_id: &str,
) -> Result<DeviceTokenPayload, IdentityError> {
    // 1) 取一次性 challenge：Device 签名认证（canonical 绑定 POST + challenge 路径）
    let issued_at = canonical::now_unix_seconds();
    let nonce = canonical::new_nonce();
    let canonical_text = canonical::build_device_api_canonical(&DeviceApiCanonicalInput {
        method: "POST",
        path: DEVICE_TOKEN_CHALLENGE_PATH,
        device_id,
        issued_at,
        nonce: &nonce,
    })?;
    let signature = canonical::encode_signature(&key.sign(canonical_text.as_bytes()));
    let challenge = client
        .request_device_token_challenge(device_id, issued_at, &nonce, &signature)
        .await?;
    let challenge_value = challenge.challenge.trim().to_string();
    if challenge_value.is_empty() {
        return Err(IdentityError::Internal(
            "身份服务返回了空 challenge".to_string(),
        ));
    }

    // 2) 用同一把私钥对新 challenge 签名（canonical 绑定 challenge，防签名与 challenge 拼接错配）
    let issued_at = canonical::now_unix_seconds();
    let nonce = canonical::new_nonce();
    let token_canonical = canonical::build_device_token_canonical(&DeviceTokenCanonicalInput {
        challenge: &challenge_value,
        device_id,
        issued_at,
        nonce: &nonce,
    })?;
    let token_signature = canonical::encode_signature(&key.sign(token_canonical.as_bytes()));

    let response = client
        .exchange_device_token(&DeviceTokenExchangeBody {
            device_id,
            challenge: &challenge_value,
            issued_at,
            nonce: &nonce,
            signature: &token_signature,
        })
        .await?;

    assert_access_token_shape(&response.access_token)?;
    Ok(DeviceTokenPayload {
        access_token: response.access_token,
        token_type: response.token_type.unwrap_or_else(|| "Bearer".to_string()),
        expires_in: response.expires_in.unwrap_or(0),
        expires_at: response.expires_at.unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;

    #[test]
    fn access_token_shape_accepts_jwt_and_rejects_junk() {
        let ok = format!("{}.{}.{}", "a".repeat(40), "b".repeat(60), "c".repeat(60));
        assert!(assert_access_token_shape(&ok).is_ok());
        for bad in [
            "".to_string(),
            "opaque-token-without-dots".to_string(),
            "a.b".to_string(),
            "a.b.c.d".to_string(),
            format!("{}.{}.{}", "a".repeat(40), "b".repeat(60), "c d"),
            format!("{}.{}.{}", "a".repeat(40), "b".repeat(60), "c\n"),
            "x".repeat(5000),
        ] {
            assert!(
                assert_access_token_shape(&bad).is_err(),
                "非法 AT 形状必须被拒绝：len={}",
                bad.len()
            );
        }
    }

    #[test]
    fn debug_output_redacts_access_token() {
        // 协议 §10：任何日志/遥测都不得出现 AT 原值 —— Debug 只允许输出长度
        let secret_token = format!(
            "{}.{}.{}",
            "hdr".repeat(15),
            "pay".repeat(20),
            "sig".repeat(20)
        );
        let response = DeviceTokenExchangeResponse {
            access_token: secret_token.clone(),
            token_type: Some("Bearer".to_string()),
            expires_in: Some(900),
            expires_at: Some("2026-09-27T10:15:00.000Z".to_string()),
            scope: Some("game.read game.play".to_string()),
            audience: Some("mini-hbut-hf-api".to_string()),
        };
        let payload = DeviceTokenPayload {
            access_token: secret_token.clone(),
            token_type: "Bearer".to_string(),
            expires_in: 900,
            expires_at: "2026-09-27T10:15:00.000Z".to_string(),
        };
        for debug in [format!("{response:?}"), format!("{payload:?}")] {
            assert!(
                !debug.contains(&secret_token),
                "Debug 输出不得包含 AT 原值：{debug}"
            );
            assert!(debug.contains("access_token_len"));
        }
        let challenge = DeviceTokenChallengeResponse {
            challenge: "7pQ2sV5wY8aB1cD4eF7gH0iJ3kL6mN9qR2sU5wX8yA1b".to_string(),
            expires_at: None,
            expires_in: Some(120),
        };
        let debug = format!("{challenge:?}");
        assert!(!debug.contains("7pQ2sV5wY8aB1cD4eF7gH0iJ3kL6mN9qR2sU5wX8yA1b"));
    }

    #[test]
    fn payload_serialization_has_no_refresh_token() {
        // V1 明确不签发 refresh token：返回结构与注释都不得出现该字段
        let payload = DeviceTokenPayload {
            access_token: format!("{}.{}.{}", "a".repeat(40), "b".repeat(60), "c".repeat(60)),
            token_type: "Bearer".to_string(),
            expires_in: 900,
            expires_at: "2026-09-27T10:15:00.000Z".to_string(),
        };
        let json = serde_json::to_string(&payload).expect("序列化不应失败");
        assert!(!json.contains("refresh"));
        assert!(json.contains("\"token_type\":\"Bearer\""));
        assert!(json.contains("\"expires_in\":900"));
    }
}
