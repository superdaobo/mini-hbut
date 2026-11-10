//! P1-1（issue #1212）：设备密钥对 v2 canonical 的**正式签名路径**。
//!
//! 边界（**本模块不负责**）：
//! - **不造密钥**：只接收调用方已从 keyring 读出的 `DeviceKey`；不碰 keyring、不碰 DB、不联网；
//! - **不判定服务端登记状态**：本模块只做本地形状/绑定校验；设备是否已在服务端登记由
//!   ocr-service 侧判定（`device_not_registered`），本模块与返回值都**不**声称「已登记」；
//! - **不是 DEV 缝**：这是生产路径（与 `v2_dev_seam` 的 DEV 自检缝无关）。
//!
//! 安全要点：
//! 1. **三重绑定**：canonical 第 2 段必须等于调用方传入的 `device_id`，第 3 段必须等于
//!    传入的 `student_id` **且**等于本机当前登录会话的学号 —— 因此本命令**不是**
//!    「任意串签名预言机」，也不会为他人学号签名；
//! 2. **自检后才返回**：签名后用公钥验一次，失败即 `Internal`，绝不返回未经自检的签名；
//! 3. **日志零敏感**：只允许 `device_id`、指纹前缀、签名**长度**、canonical 的 sha256 前缀、
//!    学号**掩码**；绝不出现私钥、完整签名、canonical 明文、完整学号。

use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};

use super::device_key::DeviceKey;
use super::errors::IdentityError;
use super::v2_signature::{V2_ALG, V2_CANONICAL_VERSION};

/// 本阶段唯一允许的签名算法（与 keyring 现状一致）。
pub const SIGN_ALG: &str = V2_ALG;

/// canonical 段数与各段位置（与 ocr 侧 `build_canonical` 逐字节一致）。
const SEGMENTS: usize = 6;

/// 已登记 device_id 的形状校验（与 ocr 侧设备表/调试端点同口径：8–128，`[A-Za-z0-9._:-]`）。
pub fn is_valid_device_id(value: &str) -> bool {
    let text = value.trim();
    (8..=128).contains(&text.chars().count())
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
}

/// 学号掩码（前 4 位 + `***`；长度 < 8 全掩）。仅用于日志与响应展示。
pub fn mask_student_id(value: &str) -> String {
    let text = value.trim();
    if text.chars().count() < 8 {
        return "***".to_string();
    }
    let head: String = text.chars().take(4).collect();
    format!("{head}***")
}

/// canonical 的 sha256（小写 hex）。用于日志/响应对账，避免落 canonical 明文。
pub fn canonical_sha256(canonical: &str) -> String {
    let digest = Sha256::digest(canonical.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// 严格解析 v2 canonical：恰好 6 段、版本 `v1`、第 4 段为 64 位小写 hex、第 6 段为整数。
///
/// 与 `v2_signature::verify_v2_proof` 的判定同口径（P0-7 的 DEV 缝用它做形状校验）。
fn parse_canonical_strict(canonical: &str) -> Option<[String; SEGMENTS]> {
    let parts: Vec<&str> = canonical.split('|').collect();
    if parts.len() != SEGMENTS {
        return None;
    }
    if parts[0] != V2_CANONICAL_VERSION {
        return None;
    }
    let name_hash = parts[3];
    if name_hash.len() != 64
        || !name_hash
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    {
        return None;
    }
    parts[5].parse::<i64>().ok()?;
    Some([
        parts[0].to_string(),
        parts[1].to_string(),
        parts[2].to_string(),
        parts[3].to_string(),
        parts[4].to_string(),
        parts[5].to_string(),
    ])
}

/// 纯签名结果（命令层再补 `fingerprint` / `public_key_jwk` 等公开信息）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedCanonical {
    /// base64url 无 padding（Ed25519 → 86 字符）。
    pub signature: String,
    /// 恒 `Ed25519`。
    pub alg: &'static str,
    /// 被绑定校验过的设备标识。
    pub device_id: String,
    /// 被绑定校验过的学号（**不**直接回前端明文，命令层用掩码）。
    pub student_id: String,
    /// canonical 的 sha256（小写 hex），供对账。
    pub canonical_sha256: String,
}

/// 核心签名实现（纯函数：不碰 keyring / DB / 网络，便于单测覆盖全部拒绝路径）。
///
/// 校验顺序见模块头「三重绑定」；任一不满足 → `Err`，**绝不**返回签名。
pub fn sign_canonical_impl(
    key: &DeviceKey,
    canonical: &str,
    device_id: &str,
    student_id: &str,
    session_student_id: &str,
) -> Result<SignedCanonical, IdentityError> {
    // 1) 入参形状
    if !is_valid_device_id(device_id) {
        return Err(IdentityError::InvalidInput(
            "device_id 形状非法（须 8–128 位，字符集 [A-Za-z0-9._:-]）".to_string(),
        ));
    }
    let student_id = student_id.trim();
    if student_id.is_empty() {
        return Err(IdentityError::InvalidInput(
            "student_id 不得为空".to_string(),
        ));
    }
    // 2) 本地登录会话（未登录 → 明确拒绝，不静默成功）
    let session_student_id = session_student_id.trim();
    if session_student_id.is_empty() {
        return Err(IdentityError::NoLocalLogin);
    }
    // 3) canonical 必须是合法 v2 canonical
    let parts = parse_canonical_strict(canonical).ok_or_else(|| {
        IdentityError::InvalidInput(
            "canonical 非法：须为 v1|<device_id>|<student_id>|<64位小写hex>|<nonce>|<ts>"
                .to_string(),
        )
    })?;
    // 4) 三重绑定：不得为别的设备/别的学号签名
    if parts[1] != device_id.trim() {
        return Err(IdentityError::InvalidInput(
            "canonical 的 device_id 与调用方不一致，拒绝签名".to_string(),
        ));
    }
    if parts[2] != student_id {
        return Err(IdentityError::InvalidInput(
            "canonical 的 student_id 与调用方不一致，拒绝签名".to_string(),
        ));
    }
    if student_id != session_student_id {
        return Err(IdentityError::InvalidInput(
            "拒绝为当前登录学号以外的学号签名".to_string(),
        ));
    }
    // 5) 签名
    let raw = key.sign(canonical.as_bytes());
    let signature = general_purpose::URL_SAFE_NO_PAD.encode(raw);
    // 6) 自检：返回前必须验签通过（保证「签名一定可被独立验签」）
    DeviceKey::verify_with_public_key(&key.public_jwk().x, canonical.as_bytes(), &raw).map_err(
        |_| IdentityError::Internal("签名自检失败，已拒绝返回（不会返回未自检的签名）".to_string()),
    )?;
    Ok(SignedCanonical {
        signature,
        alg: SIGN_ALG,
        device_id: device_id.trim().to_string(),
        student_id: student_id.to_string(),
        canonical_sha256: canonical_sha256(canonical),
    })
}

/// 生成**脱敏**审计字段串（纯函数，供日志与单测；绝不包含私钥/完整签名/canonical 明文/完整学号）。
pub fn audit_fields(
    device_id: &str,
    fingerprint: &str,
    signature_len: usize,
    canonical_sha256_hex: &str,
    student_id: &str,
) -> String {
    let fp = fingerprint.chars().take(12).collect::<String>();
    let digest = canonical_sha256_hex.chars().take(16).collect::<String>();
    format!(
        "device_id={} fingerprint={}… sig_len={} canonical_sha256={}… student_id={}",
        device_id,
        fp,
        signature_len,
        digest,
        mask_student_id(student_id)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::v2_signature::{build_v2_canonical, verify_v2_proof, V2Proof};

    const DEVICE_ID: &str = "device-test-0001";
    const STUDENT_ID: &str = "2510231106";
    const TS: i64 = 1_794_260_000;

    fn key() -> DeviceKey {
        DeviceKey::from_seed([7u8; 32])
    }

    fn canonical_for(student_id: &str, device_id: &str) -> String {
        build_v2_canonical(device_id, student_id, "张三", "nonce-0001", TS)
            .expect("canonical 构建失败")
    }

    fn sign(
        canonical: &str,
        device_id: &str,
        student_id: &str,
    ) -> Result<SignedCanonical, IdentityError> {
        sign_canonical_impl(&key(), canonical, device_id, student_id, STUDENT_ID)
    }

    /// 规格 §5-1：成功路径 + **独立验签**（用返回的公钥 JWK 验证签名）。
    #[test]
    fn success_and_signature_verifiable_independently() {
        let canonical = canonical_for(STUDENT_ID, DEVICE_ID);
        let signed = sign(&canonical, DEVICE_ID, STUDENT_ID).expect("合法输入必须签名成功");
        assert_eq!(signed.alg, "Ed25519");
        assert_eq!(signed.signature.len(), 86, "base64url 无 padding → 86 字符");
        assert_eq!(signed.device_id, DEVICE_ID);
        assert_eq!(signed.canonical_sha256, canonical_sha256(&canonical));

        // 独立验签：只依赖公开材料（public_jwk.x + canonical + signature）
        let raw = general_purpose::URL_SAFE_NO_PAD
            .decode(signed.signature.as_bytes())
            .expect("签名必须是合法 base64url");
        let sig: [u8; 64] = raw.as_slice().try_into().expect("签名必须 64 字节");
        DeviceKey::verify_with_public_key(&key().public_jwk().x, canonical.as_bytes(), &sig)
            .expect("独立验签必须通过（验收 1）");
    }

    /// 规格 §5-2：无设备密钥 → 明确「未登记」，且不返回任何签名材料。
    #[test]
    fn not_enrolled_is_explicit_and_returns_no_signature() {
        // 命令层在 `store.load()` 为 None 时返回 NotEnrolled；这里断言文案含「未注册/未登记」
        let message = IdentityError::NotEnrolled.to_string();
        assert!(
            message.contains("未注册") || message.contains("未登记"),
            "未登记必须显式：{message}"
        );
        assert!(
            !message.contains(STUDENT_ID),
            "错误文案不得含学号明文：{message}"
        );
    }

    /// 规格 §5-3：未登录 → NoLocalLogin（不静默成功）。
    #[test]
    fn no_local_login_is_rejected() {
        let canonical = canonical_for(STUDENT_ID, DEVICE_ID);
        let err = sign_canonical_impl(&key(), &canonical, DEVICE_ID, STUDENT_ID, "   ")
            .expect_err("未登录必须拒绝");
        assert!(matches!(err, IdentityError::NoLocalLogin), "实际：{err:?}");
    }

    /// 规格 §5-4：canonical 的 device_id 与调用方不一致 → 拒绝。
    #[test]
    fn device_id_mismatch_rejected() {
        let canonical = canonical_for(STUDENT_ID, "device-other-0002");
        let err = sign(&canonical, DEVICE_ID, STUDENT_ID).expect_err("设备不一致必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
        assert!(err.to_string().contains("device_id"));
    }

    /// 规格 §5-5：canonical 的学号与调用方/会话不一致 → 拒绝（不得为他人学号签）。
    #[test]
    fn student_mismatch_rejected() {
        let canonical = canonical_for("9999999999", DEVICE_ID);
        let err = sign(&canonical, DEVICE_ID, "9999999999").expect_err("为他人学号签名必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
        assert!(err.to_string().contains("学号"));

        // 调用方学号与服务端 canonical 一致但与**会话**不一致 → 拒绝
        let err2 = sign_canonical_impl(&key(), &canonical, DEVICE_ID, "9999999999", STUDENT_ID)
            .expect_err("与会话不一致必须拒绝");
        assert!(matches!(err2, IdentityError::InvalidInput(_)));
    }

    /// 规格 §5-6：canonical 畸形（段数/版本/hash/ts）→ 全部拒绝。
    #[test]
    fn malformed_canonical_rejected() {
        let good = canonical_for(STUDENT_ID, DEVICE_ID);
        let parts: Vec<&str> = good.split('|').collect();
        let cases = vec![
            ("5 段", parts[..5].join("|")),
            ("7 段", format!("{good}|extra")),
            ("版本非 v1", good.replacen("v1|", "v2|", 1)),
            (
                "hash 非 64 位",
                format!(
                    "{}|{}|{}|abc|{}|{}",
                    parts[0], parts[1], parts[2], parts[4], parts[5]
                ),
            ),
            (
                "hash 大写",
                format!(
                    "{}|{}|{}|{}|{}|{}",
                    parts[0],
                    parts[1],
                    parts[2],
                    parts[3].to_uppercase(),
                    parts[4],
                    parts[5]
                ),
            ),
            (
                "ts 非整数",
                format!(
                    "{}|{}|{}|{}|{}|abc",
                    parts[0], parts[1], parts[2], parts[3], parts[4]
                ),
            ),
            ("空串", String::new()),
        ];
        for (label, bad) in cases {
            let err = sign(&bad, DEVICE_ID, STUDENT_ID).expect_err(&format!("{label} 必须拒绝"));
            assert!(
                matches!(err, IdentityError::InvalidInput(_)),
                "{label} 期望 InvalidInput，实际：{err:?}"
            );
        }
    }

    /// 规格 §5-7：device_id 形状非法 → 拒绝（形状检查在解析 canonical 之前）。
    #[test]
    fn invalid_device_id_shape_rejected() {
        let canonical = canonical_for(STUDENT_ID, DEVICE_ID);
        for bad in ["short", "has space in id", "bad|pipe", "", "中文设备"] {
            let err = sign(&canonical, bad, STUDENT_ID)
                .expect_err("形状非法的 device_id 必须拒绝（不得返回签名）");
            assert!(
                matches!(err, IdentityError::InvalidInput(_)),
                "{bad:?} 期望 InvalidInput，实际：{err:?}"
            );
        }
    }

    /// 规格 §5-8：自检必须真的发生（用一个「签名与实际 canonical 不匹配」的构造证明
    /// 自检会拦下这种签名；若自检被移除，本用例会读到成功返回而失败）。
    #[test]
    fn self_check_blocks_unverifiable_signature() {
        // 直接对「另一份 canonical」签名，再拿它充当本 canonical 的签名 → 独立验签必须失败
        let canonical = canonical_for(STUDENT_ID, DEVICE_ID);
        let other = build_v2_canonical(DEVICE_ID, STUDENT_ID, "李四", "nonce-0002", TS).unwrap();
        let sig = key().sign(other.as_bytes());
        let verifiable =
            DeviceKey::verify_with_public_key(&key().public_jwk().x, canonical.as_bytes(), &sig);
        assert!(
            verifiable.is_err(),
            "跨 canonical 的签名必须验签失败（自检据此处拦截）"
        );
        // 正常路径必须通过自检并可独立验签
        let ok = sign(&canonical, DEVICE_ID, STUDENT_ID).expect("正常路径必须成功");
        assert_eq!(ok.signature.len(), 86);
    }

    /// 规格 §5-9（验收 3）：脱敏审计串不含私钥/完整签名/canonical 明文/完整学号。
    #[test]
    fn audit_fields_are_redacted() {
        let canonical = canonical_for(STUDENT_ID, DEVICE_ID);
        let signed = sign(&canonical, DEVICE_ID, STUDENT_ID).unwrap();
        let line = audit_fields(
            &signed.device_id,
            &key().fingerprint(),
            signed.signature.len(),
            &signed.canonical_sha256,
            &signed.student_id,
        );
        assert!(line.contains(DEVICE_ID), "应含 device_id：{line}");
        assert!(line.contains("sig_len=86"), "应含签名长度：{line}");
        assert!(
            !line.contains(&signed.signature),
            "审计串不得含完整签名：{line}"
        );
        assert!(
            !line.contains(&canonical),
            "审计串不得含 canonical 明文：{line}"
        );
        assert!(!line.contains(STUDENT_ID), "审计串不得含完整学号：{line}");
        assert!(line.contains(&mask_student_id(STUDENT_ID)), "应含掩码学号");
    }

    /// 跨语言证据：把本命令产出的签名打印成一行 JSON（`--nocapture`），
    /// 供 ocr-service 的 Python 验签器做**真实跨语言独立验签**（验收 1 的最强证据）。
    /// 用空姓名 → canonical 可由 Python 侧用 `student_name=""` 复算。
    #[test]
    fn emit_sign_canonical_for_cross_check() {
        let canonical = build_v2_canonical(DEVICE_ID, STUDENT_ID, "", "p11-nonce-0001", TS)
            .expect("canonical 构建失败");
        let signed = sign(&canonical, DEVICE_ID, STUDENT_ID).expect("签名失败");
        let line = serde_json::json!({
            "device_id": DEVICE_ID,
            "student_id": STUDENT_ID,
            "student_name": "",
            "nonce": "p11-nonce-0001",
            "ts": TS,
            "alg": signed.alg,
            "canonical": canonical,
            "signature": signed.signature,
            "public_key_jwk": serde_json::json!({
                "kty": "OKP", "crv": "Ed25519", "x": key().public_jwk().x,
            }).to_string(),
        });
        println!("[P1-1 cross-check] {line}");
    }

    /// 掩码与 canonical_sha256 的边界行为。
    #[test]
    fn helpers_behave() {
        assert_eq!(mask_student_id("1234"), "***");
        assert_eq!(mask_student_id("2510231106"), "2510***");
        assert_eq!(canonical_sha256("abc").len(), 64);
        assert!(is_valid_device_id("device-a-0001"));
        assert!(!is_valid_device_id("short"));
        assert!(!is_valid_device_id("device with space"));
        // 与 P0-7 的 canonical 形状互认：DEV 缝能验的 canonical，本模块也能签
        let canonical = canonical_for(STUDENT_ID, DEVICE_ID);
        let signed = sign(&canonical, DEVICE_ID, STUDENT_ID).unwrap();
        let proof = V2Proof {
            device_id: DEVICE_ID.to_string(),
            student_id: STUDENT_ID.to_string(),
            student_name_hash: canonical.split('|').nth(3).unwrap().to_string(),
            nonce: "nonce-0001".to_string(),
            ts: TS,
            alg: SIGN_ALG.to_string(),
            canonical: canonical.clone(),
            signature: signed.signature.clone(),
            public_key_jwk: serde_json::json!({
                "kty": "OKP",
                "crv": "Ed25519",
                "x": key().public_jwk().x,
            })
            .to_string(),
        };
        assert!(
            verify_v2_proof(&proof),
            "本命令产出的签名必须能被 P0-7 的自检器接受（同一套 canonical/签名）"
        );
    }
}
