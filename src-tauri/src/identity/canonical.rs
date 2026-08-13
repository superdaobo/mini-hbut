//! Canonical 签名文本（#622 跨语言 golden fixture 共享规范）。
//!
//! 规范（Rust 与 Node 必须逐字节一致，golden fixture 测试保证）：
//! - UTF-8 编码；
//! - `\n` LF 换行；字段固定顺序；**最后一行后有一个 LF**（canonical 文本以 `\n` 结尾）；
//! - 除 `student_name` 外，字段值只允许 RFC 3986 unreserved 字符（A-Za-z0-9._~-，长度 1..=128）；
//! - `issued_at` 为 UNIX 秒（正整数，长度 ≤ 20）；
//! - scope 规范化：空白分割 → 去空 → 去重 → 字典序排序 → 单空格 join → SHA-256 → base64url；
//! - Ed25519 直接对 canonical 字节签名（禁止对 JSON.stringify 后文本签名）。

use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};

use super::errors::IdentityError;

/// approve 签名版本头（#622 定义）。
pub const AUTH_VERSION: &str = "MINI-HBUT-AUTH-V1";
/// enrollment assertion 版本头（#622 定义）。
pub const ENROLL_VERSION: &str = "MINI-HBUT-ENROLL-V1";
/// 设备签名 API（devices/me、devices/revoke）认证版本头（#622 定义）。
pub const DEVICE_API_VERSION: &str = "MINI-HBUT-DEVICE-API-V1";

/// approve 决策值（V1 只支持 approve；deny 不需要设备签名）。
pub const DECISION_APPROVE: &str = "approve";

/// 数字字段最大值（UNIX 秒；2100-01-01 之前均合法，用于拒绝极端输入）。
const MAX_UNIX_SECONDS: i64 = 4102444800;

/// 校验协议 token 字段值（unreserved 字符集 + 长度约束）。
fn assert_token_field(name: &str, value: &str) -> Result<(), IdentityError> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '~' | '-'));
    if !valid {
        return Err(IdentityError::InvalidInput(format!(
            "{name} 含协议外字符或长度非法"
        )));
    }
    Ok(())
}

/// 校验 UTF-8 展示字段（student_name）：无控制字符、字符数 ≤ 64。
fn assert_display_field(name: &str, value: &str) -> Result<(), IdentityError> {
    let valid = value.chars().count() <= 64 && !value.chars().any(char::is_control);
    if !valid {
        return Err(IdentityError::InvalidInput(format!(
            "{name} 含控制字符或超长"
        )));
    }
    Ok(())
}

/// 校验 UNIX 秒字段。
fn assert_issued_at(value: i64) -> Result<(), IdentityError> {
    if !(1..=MAX_UNIX_SECONDS).contains(&value) {
        return Err(IdentityError::InvalidInput(
            "issued_at 超出合法范围".to_string(),
        ));
    }
    Ok(())
}

/// scope 规范化：空白分割 → trim → 去空 → 去重 → 字典序（BTreeSet，码点序，与 Node sort() 对 ASCII 一致）→ 有序列表。
pub fn normalize_scopes(scopes: &[String]) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    for raw in scopes {
        for part in raw.split_whitespace() {
            if !part.is_empty() {
                seen.insert(part.to_string());
            }
        }
    }
    seen.into_iter().collect()
}

/// scope_hash = sha256(规范化 scope 单空格 join) base64url。
pub fn scope_hash(normalized_scopes: &[String]) -> String {
    let joined = normalized_scopes.join(" ");
    let digest = Sha256::digest(joined.as_bytes());
    general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

/// 生成 base64url 随机 nonce（16 字节 CSPRNG）。
pub fn new_nonce() -> String {
    let mut buf = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut buf);
    general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

/// 当前 UNIX 秒。
pub fn now_unix_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// MINI-HBUT-AUTH-V1 输入。
pub struct AuthCanonicalInput<'a> {
    pub request_id: &'a str,
    pub challenge: &'a str,
    pub client_id: &'a str,
    pub scope_hash: &'a str,
    pub device_id: &'a str,
    pub decision: &'a str,
    pub issued_at: i64,
    pub nonce: &'a str,
}

/// 构建 approve canonical 文本（固定字段顺序 + 末尾 LF；与 golden fixture 逐字节一致）。
pub fn build_auth_canonical(input: &AuthCanonicalInput<'_>) -> Result<String, IdentityError> {
    assert_token_field("request_id", input.request_id)?;
    assert_token_field("challenge", input.challenge)?;
    assert_token_field("client_id", input.client_id)?;
    assert_token_field("scope_hash", input.scope_hash)?;
    assert_token_field("device_id", input.device_id)?;
    assert_token_field("decision", input.decision)?;
    assert_token_field("nonce", input.nonce)?;
    assert_issued_at(input.issued_at)?;
    if input.decision != DECISION_APPROVE {
        return Err(IdentityError::InvalidInput(format!(
            "decision 只支持 {DECISION_APPROVE}"
        )));
    }
    Ok(format!(
        "{version}\n\
         request_id={request_id}\n\
         challenge={challenge}\n\
         client_id={client_id}\n\
         scope_hash={scope_hash}\n\
         device_id={device_id}\n\
         decision={decision}\n\
         issued_at={issued_at}\n\
         nonce={nonce}\n",
        version = AUTH_VERSION,
        request_id = input.request_id,
        challenge = input.challenge,
        client_id = input.client_id,
        scope_hash = input.scope_hash,
        device_id = input.device_id,
        decision = input.decision,
        issued_at = input.issued_at,
        nonce = input.nonce,
    ))
}

/// MINI-HBUT-ENROLL-V1 输入。
pub struct EnrollCanonicalInput<'a> {
    pub challenge: &'a str,
    pub public_key_fingerprint: &'a str,
    pub student_id: &'a str,
    pub student_name: &'a str,
    pub issued_at: i64,
    pub nonce: &'a str,
}

/// 构建 enrollment assertion canonical 文本（末尾 LF；student_name 允许 UTF-8 可见字符）。
pub fn build_enroll_canonical(input: &EnrollCanonicalInput<'_>) -> Result<String, IdentityError> {
    assert_token_field("challenge", input.challenge)?;
    assert_token_field("public_key_fingerprint", input.public_key_fingerprint)?;
    assert_token_field("student_id", input.student_id)?;
    assert_display_field("student_name", input.student_name)?;
    assert_token_field("nonce", input.nonce)?;
    assert_issued_at(input.issued_at)?;
    Ok(format!(
        "{version}\n\
         challenge={challenge}\n\
         public_key_fingerprint={fingerprint}\n\
         student_id={student_id}\n\
         student_name={student_name}\n\
         issued_at={issued_at}\n\
         nonce={nonce}\n",
        version = ENROLL_VERSION,
        challenge = input.challenge,
        fingerprint = input.public_key_fingerprint,
        student_id = input.student_id,
        student_name = input.student_name,
        issued_at = input.issued_at,
        nonce = input.nonce,
    ))
}

/// MINI-HBUT-DEVICE-API-V1 输入（设备签名 API 认证）。
pub struct DeviceApiCanonicalInput<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub device_id: &'a str,
    pub issued_at: i64,
    pub nonce: &'a str,
}

/// 构建设备签名 API canonical 文本（method/path 由服务端从请求自身取值，防中间人改写）。
pub fn build_device_api_canonical(
    input: &DeviceApiCanonicalInput<'_>,
) -> Result<String, IdentityError> {
    let method = input.method.trim().to_ascii_uppercase();
    if method.is_empty() || method.len() > 16 {
        return Err(IdentityError::InvalidInput("method 非法".to_string()));
    }
    if input.path.is_empty() || input.path.len() > 256 || input.path.starts_with('?') {
        return Err(IdentityError::InvalidInput("path 非法".to_string()));
    }
    assert_token_field("device_id", input.device_id)?;
    assert_token_field("nonce", input.nonce)?;
    assert_issued_at(input.issued_at)?;
    Ok(format!(
        "{version}\n\
         method={method}\n\
         path={path}\n\
         device_id={device_id}\n\
         issued_at={issued_at}\n\
         nonce={nonce}\n",
        version = DEVICE_API_VERSION,
        method = method,
        path = input.path,
        device_id = input.device_id,
        issued_at = input.issued_at,
        nonce = input.nonce,
    ))
}

/// 签名结果（base64url 编码的 64 字节 Ed25519 签名）。
pub fn encode_signature(signature: &[u8; 64]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(signature)
}

/// 解码 base64url 签名为 64 字节。
pub fn decode_signature(encoded: &str) -> Result<[u8; 64], IdentityError> {
    let raw = general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| IdentityError::InvalidInput("signature 编码非法".to_string()))?;
    raw.as_slice()
        .try_into()
        .map_err(|_| IdentityError::InvalidInput("signature 长度非法".to_string()))
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use crate::identity::device_key::DeviceKey;

    /// 读取共享 golden fixture（与 Node 服务端测试共用同一文件）。
    fn fixture() -> serde_json::Value {
        let raw = include_str!("fixtures/approval_canonical_v1.golden.json");
        serde_json::from_str(raw).expect("golden fixture 必须是合法 JSON")
    }

    fn fixture_auth(fx: &serde_json::Value) -> serde_json::Value {
        fx.get("auth").expect("fixture 缺少 auth 段").clone()
    }

    fn seed_from_fixture(fx: &serde_json::Value) -> [u8; 32] {
        let seed_hex = fx
            .get("signing_key")
            .and_then(|k| k.get("seed_hex"))
            .and_then(|v| v.as_str())
            .expect("fixture 缺少 seed_hex");
        hex_decode(seed_hex).expect("seed hex 解码失败")
    }

    #[test]
    fn golden_rebuild_auth_canonical_matches_fixture() {
        let fx = fixture();
        let auth = fixture_auth(&fx);
        let scopes: Vec<String> = auth
            .get("scopes")
            .and_then(|v| v.as_array())
            .expect("scopes 必须是数组")
            .iter()
            .map(|v| v.as_str().expect("scope 必须是字符串").to_string())
            .collect();
        let normalized = normalize_scopes(&scopes);
        // 规范化结果与 fixture 一致（去重 + 字典序）
        let expected_norm: Vec<String> = auth
            .get("normalized_scopes")
            .and_then(|v| v.as_array())
            .expect("normalized_scopes 必须是数组")
            .iter()
            .map(|v| v.as_str().expect("scope 必须是字符串").to_string())
            .collect();
        assert_eq!(normalized, expected_norm);
        let hash = scope_hash(&normalized);
        assert_eq!(
            hash,
            auth.get("scope_hash")
                .and_then(|v| v.as_str())
                .expect("scope_hash")
        );

        let canonical = build_auth_canonical(&AuthCanonicalInput {
            request_id: auth
                .get("request_id")
                .and_then(|v| v.as_str())
                .expect("request_id"),
            challenge: auth
                .get("challenge")
                .and_then(|v| v.as_str())
                .expect("challenge"),
            client_id: auth
                .get("client_id")
                .and_then(|v| v.as_str())
                .expect("client_id"),
            scope_hash: &hash,
            device_id: auth
                .get("device_id")
                .and_then(|v| v.as_str())
                .expect("device_id"),
            decision: auth
                .get("decision")
                .and_then(|v| v.as_str())
                .expect("decision"),
            issued_at: auth
                .get("issued_at")
                .and_then(|v| v.as_i64())
                .expect("issued_at"),
            nonce: auth.get("nonce").and_then(|v| v.as_str()).expect("nonce"),
        })
        .expect("canonical 构建不应失败");
        assert_eq!(
            canonical,
            auth.get("canonical_text")
                .and_then(|v| v.as_str())
                .expect("canonical_text"),
            "Rust 重建 canonical 必须与 golden fixture 逐字节一致"
        );
        // 规范：canonical 文本以单个 LF 结尾
        assert!(canonical.ends_with('\n'));
        assert!(!canonical.ends_with("\n\n"));
    }

    #[test]
    fn golden_rebuild_enroll_canonical_matches_fixture() {
        let fx = fixture();
        let enroll = fx.get("enroll").expect("fixture 缺少 enroll 段").clone();
        let key = fx.get("signing_key").expect("fixture 缺少 signing_key 段");
        let canonical = build_enroll_canonical(&EnrollCanonicalInput {
            challenge: enroll
                .get("challenge")
                .and_then(|v| v.as_str())
                .expect("challenge"),
            public_key_fingerprint: key
                .get("public_key_fingerprint")
                .and_then(|v| v.as_str())
                .expect("public_key_fingerprint"),
            student_id: enroll
                .get("student_id")
                .and_then(|v| v.as_str())
                .expect("student_id"),
            student_name: enroll
                .get("student_name")
                .and_then(|v| v.as_str())
                .expect("student_name"),
            issued_at: enroll
                .get("issued_at")
                .and_then(|v| v.as_i64())
                .expect("issued_at"),
            nonce: enroll.get("nonce").and_then(|v| v.as_str()).expect("nonce"),
        })
        .expect("canonical 构建不应失败");
        assert_eq!(
            canonical,
            enroll
                .get("canonical_text")
                .and_then(|v| v.as_str())
                .expect("canonical_text"),
            "Rust 重建 enroll canonical 必须与 golden fixture 逐字节一致"
        );
    }

    #[test]
    fn golden_fixture_signature_verifies_with_rust() {
        // Rust 用 fixture 公钥验证 fixture 签名（= Node 按同一规范签出的签名可被 Rust 验证）
        let fx = fixture();
        let auth = fixture_auth(&fx);
        let key = fx.get("signing_key").expect("signing_key");
        let canonical = auth
            .get("canonical_text")
            .and_then(|v| v.as_str())
            .expect("canonical_text");
        let signature = decode_signature(
            auth.get("signature")
                .and_then(|v| v.as_str())
                .expect("signature"),
        )
        .expect("签名解码失败");
        let x = key
            .get("public_x_b64url")
            .and_then(|v| v.as_str())
            .expect("public_x");
        DeviceKey::verify_with_public_key(x, canonical.as_bytes(), &signature)
            .expect("fixture 签名必须能通过 Rust 验证");
    }

    #[test]
    fn golden_rust_signature_matches_fixture() {
        // Rust 用 fixture seed 签出与 Node 完全一致的签名（Ed25519 确定性签名 + 同一 canonical）
        let fx = fixture();
        let auth = fixture_auth(&fx);
        let device_key = DeviceKey::from_seed(seed_from_fixture(&fx));
        let canonical = auth
            .get("canonical_text")
            .and_then(|v| v.as_str())
            .expect("canonical_text");
        let signature = device_key.sign(canonical.as_bytes());
        assert_eq!(
            encode_signature(&signature),
            auth.get("signature")
                .and_then(|v| v.as_str())
                .expect("signature"),
            "Rust 签出的签名必须与 golden fixture（Node 生成）一致"
        );
    }

    #[test]
    fn golden_fingerprint_matches_fixture() {
        let fx = fixture();
        let device_key = DeviceKey::from_seed(seed_from_fixture(&fx));
        let expected = fx
            .get("signing_key")
            .and_then(|k| k.get("public_key_fingerprint"))
            .and_then(|v| v.as_str())
            .expect("fingerprint");
        assert_eq!(device_key.fingerprint(), expected);
    }

    #[test]
    fn tamper_any_field_breaks_verification() {
        let fx = fixture();
        let auth = fixture_auth(&fx);
        let key = fx.get("signing_key").expect("signing_key");
        let original = auth
            .get("canonical_text")
            .and_then(|v| v.as_str())
            .expect("canonical_text");
        let signature = decode_signature(
            auth.get("signature")
                .and_then(|v| v.as_str())
                .expect("signature"),
        )
        .expect("签名解码失败");
        let x = key
            .get("public_x_b64url")
            .and_then(|v| v.as_str())
            .expect("public_x");

        // 对每个字段做篡改：改出的文本与原签名验证必须失败
        let cases: [(&str, &str); 8] = [
            ("request_id", "ar_changed"),
            ("challenge", "changed"),
            ("client_id", "client_changed"),
            ("scope_hash", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
            ("device_id", "0198changed"),
            ("decision", "deny"),
            ("issued_at", "1755000001"),
            ("nonce", "changed"),
        ];
        for (field, value) in cases {
            let mut lines: Vec<String> = original.split('\n').map(|s| s.to_string()).collect();
            for line in lines.iter_mut() {
                if let Some((name, _)) = line.split_once('=') {
                    if name == field {
                        *line = format!("{field}={value}");
                    }
                }
            }
            let tampered = lines.join("\n");
            assert!(
                DeviceKey::verify_with_public_key(x, tampered.as_bytes(), &signature).is_err(),
                "篡改 {field} 后原签名必须验证失败"
            );
        }
    }

    #[test]
    fn scope_normalization_rules() {
        // 去重 + 字典序 + 单空格 join 后的 hash 固定
        let scopes = vec![
            "profile".to_string(),
            "openid".to_string(),
            " openid ".to_string(),
            "student.identity".to_string(),
        ];
        let normalized = normalize_scopes(&scopes);
        assert_eq!(normalized, vec!["openid", "profile", "student.identity"]);
        let hash1 = scope_hash(&normalized);
        // 乱序输入先规范化再 hash → 与 hash1 一致
        let normalized2 = normalize_scopes(&[
            "openid".to_string(),
            "student.identity".to_string(),
            "profile".to_string(),
        ]);
        let hash2 = scope_hash(&normalized2);
        assert_eq!(hash1, hash2);
        assert_eq!(hash1, "dOQbUxnF_2WvdYoMq0brghFj_-Hb1YfJG4YIcOV41kk");
    }

    #[test]
    fn device_api_canonical_format() {
        let canonical = build_device_api_canonical(&DeviceApiCanonicalInput {
            method: "post",
            path: "/api/v1/app/devices/me",
            device_id: "dev_abc123",
            issued_at: 1755000000,
            nonce: "nonce_abc",
        })
        .expect("构建不应失败");
        let expected = "MINI-HBUT-DEVICE-API-V1\nmethod=POST\npath=/api/v1/app/devices/me\ndevice_id=dev_abc123\nissued_at=1755000000\nnonce=nonce_abc\n";
        assert_eq!(canonical, expected);
    }

    #[test]
    fn invalid_field_values_rejected() {
        // 换行注入 / 空值 / 超长一律拒绝
        let bad_request_id = build_auth_canonical(&AuthCanonicalInput {
            request_id: "ar_\nEVIL",
            challenge: "c",
            client_id: "cl",
            scope_hash: "h",
            device_id: "d",
            decision: DECISION_APPROVE,
            issued_at: 1755000000,
            nonce: "n",
        });
        assert!(bad_request_id.is_err());
        let bad_decision = build_auth_canonical(&AuthCanonicalInput {
            request_id: "ar_ok",
            challenge: "c",
            client_id: "cl",
            scope_hash: "h",
            device_id: "d",
            decision: "approve\n",
            issued_at: 1755000000,
            nonce: "n",
        });
        assert!(bad_decision.is_err());
        // student_name 含控制字符拒绝
        let bad_name = build_enroll_canonical(&EnrollCanonicalInput {
            challenge: "c",
            public_key_fingerprint: "f",
            student_id: "2023010101",
            student_name: "张\u{0007}三",
            issued_at: 1755000000,
            nonce: "n",
        });
        assert!(bad_name.is_err());
        // issued_at 越界拒绝
        let bad_time = build_auth_canonical(&AuthCanonicalInput {
            request_id: "ar_ok",
            challenge: "c",
            client_id: "cl",
            scope_hash: "h",
            device_id: "d",
            decision: DECISION_APPROVE,
            issued_at: -1,
            nonce: "n",
        });
        assert!(bad_time.is_err());
    }

    /// 手写 hex 解码（避免引入 hex crate）。
    fn hex_decode(hex: &str) -> Option<[u8; 32]> {
        if hex.len() != 64 {
            return None;
        }
        let mut out = [0u8; 32];
        for (i, pair) in hex.as_bytes().chunks_exact(2).enumerate() {
            let hi = (pair[0] as char).to_digit(16)? as u8;
            let lo = (pair[1] as char).to_digit(16)? as u8;
            out[i] = (hi << 4) | lo;
        }
        Some(out)
    }
}
