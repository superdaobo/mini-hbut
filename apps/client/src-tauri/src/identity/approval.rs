//! Approve 签名（#622）：本机私钥对 AuthRequest 授权上下文签名。
//!
//! 私钥永不离开 Rust 侧；前端 JS 只拿到 device_id/issued_at/nonce/signature，
//! 由前端携带 Handoff header 提交到 Identity Core（handoff 只存在于前端内存）。

use serde::Serialize;

use super::canonical::{self, AuthCanonicalInput, DECISION_APPROVE};
use super::device_key::DeviceKey;
use super::errors::IdentityError;

/// 签名完成后的审批载荷（#619 合同 §1.5 approve body：device_id/issued_at/nonce/signature）。
#[derive(Debug, Clone, Serialize)]
pub struct SignedApproval {
    pub device_id: String,
    pub issued_at: i64,
    pub nonce: String,
    /// base64url(64B Ed25519 签名)
    pub signature: String,
    /// canonical 版本头（固定 MINI-HBUT-AUTH-V1，供服务端选择解析规范）
    pub canonical_version: &'static str,
}

/// 签名输入（字段来自 Identity Core 的 AuthRequest 详情；scope 必须使用服务端下发的快照）。
pub struct SignApprovalInput<'a> {
    pub request_id: &'a str,
    /// AuthRequest 的 server_challenge（设备签名的对象，非 secret）
    pub challenge: &'a str,
    pub client_id: &'a str,
    /// 服务端下发的 scope 列表（乱序/重复均可，规范化在签名内完成）
    pub scopes: &'a [String],
    pub device_id: &'a str,
    /// 测试注入用；None = 当前 UNIX 秒
    pub issued_at: Option<i64>,
    /// 测试注入用；None = 随机 base64url 16B
    pub nonce: Option<String>,
}

/// 构建 approve canonical 并用设备私钥签名。
pub fn sign_auth_approval(
    key: &DeviceKey,
    input: SignApprovalInput<'_>,
) -> Result<SignedApproval, IdentityError> {
    let normalized = canonical::normalize_scopes(input.scopes);
    let scope_hash = canonical::scope_hash(&normalized);
    let issued_at = input.issued_at.unwrap_or_else(canonical::now_unix_seconds);
    let nonce = input.nonce.unwrap_or_else(canonical::new_nonce);

    let canonical_text = canonical::build_auth_canonical(&AuthCanonicalInput {
        request_id: input.request_id,
        challenge: input.challenge,
        client_id: input.client_id,
        scope_hash: &scope_hash,
        device_id: input.device_id,
        decision: DECISION_APPROVE,
        issued_at,
        nonce: &nonce,
    })?;

    let signature = canonical::encode_signature(&key.sign(canonical_text.as_bytes()));
    Ok(SignedApproval {
        device_id: input.device_id.to_string(),
        issued_at,
        nonce,
        signature,
        canonical_version: canonical::AUTH_VERSION,
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use crate::identity::device_key::DeviceKey;
    use crate::identity::device_key::DeviceKeyStore;
    use crate::identity::keyring::MemoryKeyring;

    fn test_key() -> DeviceKey {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        store.create_if_missing().expect("创建密钥失败")
    }

    #[test]
    fn sign_approval_returns_expected_fields() {
        let key = test_key();
        let scopes = vec!["profile".to_string(), "openid".to_string()];
        let signed = sign_auth_approval(
            &key,
            SignApprovalInput {
                request_id: "ar_qhjINIITtkzwIg5pU3K9ew",
                challenge: "challenge-abc",
                client_id: "client_1",
                scopes: &scopes,
                device_id: "dev_1",
                issued_at: Some(1755000000),
                nonce: Some("nonce-abc".to_string()),
            },
        )
        .expect("签名不应失败");
        assert_eq!(signed.device_id, "dev_1");
        assert_eq!(signed.issued_at, 1755000000);
        assert_eq!(signed.canonical_version, "MINI-HBUT-AUTH-V1");
        assert_eq!(signed.nonce, "nonce-abc");
        // 签名可被本机公钥验证
        let canonical = canonical::build_auth_canonical(&AuthCanonicalInput {
            request_id: "ar_qhjINIITtkzwIg5pU3K9ew",
            challenge: "challenge-abc",
            client_id: "client_1",
            scope_hash: &canonical::scope_hash(&canonical::normalize_scopes(&scopes)),
            device_id: "dev_1",
            decision: DECISION_APPROVE,
            issued_at: signed.issued_at,
            nonce: &signed.nonce,
        })
        .expect("canonical 构建失败");
        let sig = canonical::decode_signature(&signed.signature).expect("签名解码失败");
        key.verify(canonical.as_bytes(), &sig)
            .expect("签名必须可验证");
        // 篡改 scope（增加未授权 scope）→ 原签名验证失败
        let evil_scopes = vec![
            "openid".to_string(),
            "profile".to_string(),
            "admin".to_string(),
        ];
        let evil_canonical = canonical::build_auth_canonical(&AuthCanonicalInput {
            request_id: "ar_qhjINIITtkzwIg5pU3K9ew",
            challenge: "challenge-abc",
            client_id: "client_1",
            scope_hash: &canonical::scope_hash(&canonical::normalize_scopes(&evil_scopes)),
            device_id: "dev_1",
            decision: DECISION_APPROVE,
            issued_at: signed.issued_at,
            nonce: &signed.nonce,
        })
        .expect("canonical 构建失败");
        assert!(key.verify(evil_canonical.as_bytes(), &sig).is_err());
    }

    #[test]
    fn sign_approval_rejects_bad_input() {
        let key = test_key();
        let scopes = vec!["openid".to_string()];
        let result = sign_auth_approval(
            &key,
            SignApprovalInput {
                request_id: "ar_bad\nrequest_id",
                challenge: "c",
                client_id: "cl",
                scopes: &scopes,
                device_id: "d",
                issued_at: Some(1755000000),
                nonce: Some("n".to_string()),
            },
        );
        assert!(matches!(result, Err(IdentityError::InvalidInput(_))));
    }
}
