//! Enrollment（#622）：本机私钥对 enrollment assertion 签名并提交 Core。
//!
//! 身份保证级别（#617 信任边界 18）：Enrollment 签名只证明“本机持有新私钥 +
//! 客户端声明本地学校会话属于此学号”，绝不把 mini_hbut_app 升级为官方认证。

use serde::Serialize;

use super::canonical::{self, EnrollCanonicalInput};
use super::device_key::DeviceKey;
use super::errors::IdentityError;

/// 签名完成的 Enrollment Assertion（提交给 Core 的字段）。
#[derive(Debug, Clone, Serialize)]
pub struct EnrollAssertion {
    pub public_key_fingerprint: String,
    pub issued_at: i64,
    pub nonce: String,
    /// base64url(64B Ed25519 签名)
    pub signature: String,
    /// canonical 版本头（固定 MINI-HBUT-ENROLL-V1）
    pub canonical_version: &'static str,
}

/// Assertion 输入。
pub struct EnrollAssertionInput<'a> {
    /// 一次性 enrollment challenge 明文（来自 Core）
    pub challenge: &'a str,
    /// 本地可信 UserInfo snapshot 的学号
    pub student_id: &'a str,
    /// 本地可信 UserInfo snapshot 的姓名（可为空字符串）
    pub student_name: &'a str,
    /// 测试注入用；None = 当前 UNIX 秒
    pub issued_at: Option<i64>,
    /// 测试注入用；None = 随机 base64url 16B
    pub nonce: Option<String>,
}

/// 构建 enrollment assertion canonical 并用新私钥签名（证明提交方持有私钥）。
pub fn build_enroll_assertion(
    key: &DeviceKey,
    input: EnrollAssertionInput<'_>,
) -> Result<EnrollAssertion, IdentityError> {
    let fingerprint = key.fingerprint();
    let issued_at = input.issued_at.unwrap_or_else(canonical::now_unix_seconds);
    let nonce = input.nonce.unwrap_or_else(canonical::new_nonce);

    let canonical_text = canonical::build_enroll_canonical(&EnrollCanonicalInput {
        challenge: input.challenge,
        public_key_fingerprint: &fingerprint,
        student_id: input.student_id,
        student_name: input.student_name,
        issued_at,
        nonce: &nonce,
    })?;

    let signature = canonical::encode_signature(&key.sign(canonical_text.as_bytes()));
    Ok(EnrollAssertion {
        public_key_fingerprint: fingerprint,
        issued_at,
        nonce,
        signature,
        canonical_version: canonical::ENROLL_VERSION,
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use crate::identity::device_key::DeviceKey;
    use crate::identity::device_key::DeviceKeyStore;
    use crate::identity::keyring::MemoryKeyring;

    #[test]
    fn enroll_assertion_signs_and_verifies() {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let key = store.create_if_missing().expect("创建密钥失败");
        let assertion = build_enroll_assertion(
            &key,
            EnrollAssertionInput {
                challenge: "challenge-xyz",
                student_id: "2023010101",
                student_name: "张三",
                issued_at: Some(1755000000),
                nonce: Some("nonce-fixed".to_string()),
            },
        )
        .expect("assertion 构建不应失败");
        assert_eq!(assertion.public_key_fingerprint, key.fingerprint());
        assert_eq!(assertion.canonical_version, "MINI-HBUT-ENROLL-V1");
        // 签名可验证
        let canonical = canonical::build_enroll_canonical(&EnrollCanonicalInput {
            challenge: "challenge-xyz",
            public_key_fingerprint: &assertion.public_key_fingerprint,
            student_id: "2023010101",
            student_name: "张三",
            issued_at: assertion.issued_at,
            nonce: &assertion.nonce,
        })
        .expect("canonical 构建失败");
        let sig = canonical::decode_signature(&assertion.signature).expect("签名解码失败");
        key.verify(canonical.as_bytes(), &sig)
            .expect("签名必须可验证");
        // 学号被篡改 → 验证失败
        let evil = canonical::build_enroll_canonical(&EnrollCanonicalInput {
            challenge: "challenge-xyz",
            public_key_fingerprint: &assertion.public_key_fingerprint,
            student_id: "2023999999",
            student_name: "张三",
            issued_at: assertion.issued_at,
            nonce: &assertion.nonce,
        })
        .expect("canonical 构建失败");
        assert!(key.verify(evil.as_bytes(), &sig).is_err());
    }

    #[test]
    fn enroll_assertion_rejects_bad_student_id() {
        let key = DeviceKey::generate();
        let result = build_enroll_assertion(
            &key,
            EnrollAssertionInput {
                challenge: "c",
                student_id: "2023010101\nEVIL",
                student_name: "张三",
                issued_at: Some(1755000000),
                nonce: Some("n".to_string()),
            },
        );
        assert!(matches!(result, Err(IdentityError::InvalidInput(_))));
    }
}
