//! v2 canonical 签名与自检（P0-7 / goal-10 身份 v2「设备签名直证」）。
//!
//! 边界（与 ocr-service `identity_auth/device_signature.py`（main=799827f）逐字节对齐）：
//! - canonical：`v1|<device_id>|<student_id>|<sha256(student_name utf8) 小写 hex>|<nonce>|<ts>`，
//!   **无末尾换行**（与既有 `canonical.rs` 的「行式 + 末尾 LF」完全不同，禁止照抄旧 builder）；
//! - `student_name` 为空 → 空串的 sha256（`e3b0c442...`）；
//! - 签名：Ed25519（`DeviceKey::sign`，64 字节）→ base64url **无 padding**（恒 86 字符）；
//! - `public_key_jwk` 固定字段序 `{"kty":"OKP","crv":"Ed25519","x":"<b64url 无 padding>"}`
//!   （紧凑 JSON，无多余空格；公钥本就公开，可进响应）；
//! - 私钥/签名材料绝不进日志、绝不进响应。
//!
//! 自检判定（规格 §2 的「见 §4 的判定」）：
//! `student_name_hash` 是单向哈希，无法反推 `student_name`，因此 `verify_v2_proof`
//! **不复算 canonical**，而是：
//! 1. 形状校验 `proof.canonical`：恰好 6 段、版本段为 `v1`、第 4 段为 64 位小写 hex、
//!    第 6 段（ts）与 `proof.ts` 相等；
//! 2. 一致性校验：`device_id`/`student_id`/`nonce` 与 canonical 第 2/3/5 段逐字相等；
//! 3. 加密学验证：从 `proof.public_key_jwk` 解析公钥，对 `proof.canonical` 字节验签
//!    （`DeviceKey::verify_with_public_key`）。
//! 任何一步失败 → `false`（不抛错、不打日志细节）。

use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};

use super::device_key::DeviceKey;
use super::errors::IdentityError;

/// v2 canonical 的版本前缀（与 ocr-service `device_signature.CANONICAL_VERSION` 一致）。
pub const V2_CANONICAL_VERSION: &str = "v1";

/// 本阶段唯一允许的签名算法。
pub const V2_ALG: &str = "Ed25519";

/// 设备签名证明（P0-8 四方联调时直接喂给新服务 `/debug/verify`）。
///
/// 序列化给前端/新服务；字段均为 snake_case。只含公开材料（公钥 JWK、哈希、签名）。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct V2Proof {
    pub device_id: String,
    pub student_id: String,
    /// sha256(student_name) 的 hex（小写）；不含姓名明文。
    pub student_name_hash: String,
    pub nonce: String,
    pub ts: i64,
    /// 恒 "Ed25519"。
    pub alg: String,
    /// v2 canonical 原文（无末尾换行）。
    pub canonical: String,
    /// base64url（无 padding），恒 86 字符。
    pub signature: String,
    /// 公钥 JWK JSON 字符串：`{"kty":"OKP","crv":"Ed25519","x":"..."}`。
    pub public_key_jwk: String,
}

/// sha256 小写 hex（`student_name` 为空 → 空串摘要 `e3b0c442...`）。
fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// 校验 canonical 拼接字段：非空且不含分隔符 `|`（含 `|` 会使管道拼接有歧义）。
fn assert_pipe_field(name: &str, value: &str) -> Result<(), IdentityError> {
    if value.is_empty() {
        return Err(IdentityError::InvalidInput(format!("{name} 不能为空")));
    }
    if value.contains('|') {
        return Err(IdentityError::InvalidInput(format!(
            "{name} 含非法分隔符 '|'"
        )));
    }
    Ok(())
}

/// 构建 v2 canonical（**与 ocr-service 逐字节一致**，无末尾换行）。
///
/// 校验（与 ocr 侧对齐）：
/// - `device_id` / `student_id` / `nonce` 为空 → `IdentityError::InvalidInput`；
/// - 三者含 `|` → `IdentityError::InvalidInput`；
/// - 拼接：`v1|<device_id>|<student_id>|<sha256_hex(student_name)>|<nonce>|<ts>`。
/// `student_name` 本身不进入 canonical 明文（只进 hash），不做字符集限制。
pub fn build_v2_canonical(
    device_id: &str,
    student_id: &str,
    student_name: &str,
    nonce: &str,
    ts: i64,
) -> Result<String, IdentityError> {
    assert_pipe_field("device_id", device_id)?;
    assert_pipe_field("student_id", student_id)?;
    assert_pipe_field("nonce", nonce)?;
    let name_hash = sha256_hex(student_name);
    Ok(format!(
        "{V2_CANONICAL_VERSION}|{device_id}|{student_id}|{name_hash}|{nonce}|{ts}"
    ))
}

/// 用设备私钥对 canonical 签名，产出完整证明（含公钥 JWK）。
///
/// 签名：`key.sign(canonical.as_bytes())` → 64 字节 → base64url 无 padding（86 字符）。
pub fn sign_v2_proof(
    key: &DeviceKey,
    device_id: &str,
    student_id: &str,
    student_name: &str,
    nonce: &str,
    ts: i64,
) -> Result<V2Proof, IdentityError> {
    let canonical = build_v2_canonical(device_id, student_id, student_name, nonce, ts)?;
    let signature = key.sign(canonical.as_bytes());
    let signature_b64 = general_purpose::URL_SAFE_NO_PAD.encode(signature);
    let jwk = key.public_jwk();
    // 固定字段序 kty/crv/x 的紧凑 JSON（与 ocr-service / Node fingerprint 契约一致，无多余空格）。
    let public_key_jwk = format!(
        "{{\"kty\":\"{}\",\"crv\":\"{}\",\"x\":\"{}\"}}",
        jwk.kty, jwk.crv, jwk.x
    );
    Ok(V2Proof {
        device_id: device_id.to_string(),
        student_id: student_id.to_string(),
        student_name_hash: sha256_hex(student_name),
        nonce: nonce.to_string(),
        ts,
        alg: V2_ALG.to_string(),
        canonical,
        signature: signature_b64,
        public_key_jwk,
    })
}

/// 自检：用证明里的公钥 JWK 重新验签（不碰 keyring，不接触私钥）。
///
/// 判定（见模块头「自检判定」注释，即规格 §2 的「见 §4 的判定」）：
/// 形状校验 + 字段一致性校验 + Ed25519 验签，任何不一致 → `false`。
pub fn verify_v2_proof(proof: &V2Proof) -> bool {
    // 1) 形状校验：6 段、版本 v1、第 4 段 64 位小写 hex、第 6 段与 proof.ts 相等
    let parts: Vec<&str> = proof.canonical.split('|').collect();
    if parts.len() != 6 {
        return false;
    }
    if parts[0] != V2_CANONICAL_VERSION {
        return false;
    }
    let name_hash = parts[3];
    if name_hash.len() != 64
        || !name_hash
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    {
        return false;
    }
    if parts[5] != proof.ts.to_string() {
        return false;
    }
    // 2) 一致性校验：device_id/student_id/nonce 与第 2/3/5 段一致；
    //    第 4 段必须与 proof.student_name_hash 相同（红队 F2：字段与 canonical 脱钩时
    //    旧实现会放行「字段称李四、canonical 实为张三哈希」的自洽伪造）；
    //    算法字段必须就是本阶段唯一允许的 Ed25519（红队 F2：alg="ES256" 旧实现放行）。
    if parts[1] != proof.device_id || parts[2] != proof.student_id || parts[4] != proof.nonce {
        return false;
    }
    if parts[3] != proof.student_name_hash || proof.alg != V2_ALG {
        return false;
    }
    // 2b) 服务端会拒的空值/负时间戳，本地自检也必须拒（红队 O1：旧实现放行
    //     空 student_id/nonce 与负 ts，导致 self_check_ok 语义弱于服务端）
    if parts[1].is_empty() || parts[2].is_empty() || parts[4].is_empty() || proof.ts < 0 {
        return false;
    }
    // 3) 公钥 JWK 解析（kty/crv 固定值 + x 必须为 base64url 32 字节）
    let Ok(jwk) = serde_json::from_str::<serde_json::Value>(&proof.public_key_jwk) else {
        return false;
    };
    if jwk.get("kty").and_then(|v| v.as_str()) != Some("OKP")
        || jwk.get("crv").and_then(|v| v.as_str()) != Some("Ed25519")
    {
        return false;
    }
    // 私钥材料不允许出现（与服务端 `_public_key_jwk_sane` 同口径；红队 O2）
    if jwk.get("d").is_some() {
        return false;
    }
    let Some(x) = jwk.get("x").and_then(|v| v.as_str()) else {
        return false;
    };
    // 4) 签名解码（base64url 无 padding → 64 字节）
    let Ok(raw) = general_purpose::URL_SAFE_NO_PAD.decode(proof.signature.as_bytes()) else {
        return false;
    };
    let Ok(signature) = raw.as_slice().try_into() else {
        return false;
    };
    // 5) Ed25519 验签（对 proof.canonical 原文）
    DeviceKey::verify_with_public_key(x, proof.canonical.as_bytes(), &signature).is_ok()
}

/// 生成一次性 nonce（32 位小写 hex，16 字节 CSPRNG）。
pub fn generate_nonce() -> String {
    let mut buf = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

/// 当前 unix 秒。
pub fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use base64::engine::general_purpose;

    /// 跨语言 golden 向量（由 ocr-service main=799827f 的 Python `build_canonical` 生成，
    /// 与 `goal-10/evidence/p0-7-golden-vectors.json` 逐条一致；私钥 = seed bytes([7]*32)，仅测试用）。
    fn golden_vectors() -> Vec<(
        &'static str,
        &'static str,
        &'static str,
        &'static str,
        i64,
        &'static str,
        &'static str,
    )> {
        vec![
            (
                "live-check-dev-0001",
                "2510231106",
                "",
                "N1",
                1700000000,
                "v1|live-check-dev-0001|2510231106|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|N1|1700000000",
                "cBNVQxioNaWDWUdtXXZ9yNyE8fl2ilbybv-i1ctTqyDAj37AWuEtRLRVgiHiaYdxWaRzk4BSy96OUvTd-k_RCQ",
            ),
            (
                "dev-0001",
                "2510234567",
                "张三",
                "0f1e2d3c4b5a6978",
                1794244737,
                "v1|dev-0001|2510234567|1d841bc0ee98309cb7916670b7f0fdef5f4c35150711a41405ef3633b56322cf|0f1e2d3c4b5a6978|1794244737",
                "fMveqN_09OxkmCvHcd1e3G6aJlF_shteppP9P9aBt_UnZqlfhJE3Bs8coT7R-00Ut5nlqsbcqEVPCawKYoo0DQ",
            ),
            (
                "aaaa-bbbb-cccc-0001",
                "2024000001",
                "Li Hua",
                "deadbeef",
                1600000000,
                "v1|aaaa-bbbb-cccc-0001|2024000001|b8cbbc69e8832805a413d46ac63508f4310d013f4a2cc580e6d10b1f33386b80|deadbeef|1600000000",
                "tq8H-bvDiANcWgFhapCRlZtjb3f7Ge4vkw_SazuYFd5B_Z4PssirvoOnJWh3oIdG4BHcFRbkNckQQGL7a2CGDg",
            ),
            (
                "dev.uuid:0001",
                "9999999999",
                "王小明 同学",
                "n-9",
                1780000000,
                "v1|dev.uuid:0001|9999999999|6ec2ac7fc370d1eeea9351398ce98b6b3bdf1b36a3ad318ceb701f489c1a9e44|n-9|1780000000",
                "fU1zhgbcXzsZ-zGKVr2fOm-nBe3JCIX_XatJkHq-ivBzBATCeS9rbqErWuP8rBQygAF9ZNPeclBgBTxTgc_BDA",
            ),
            (
                "d1",
                "2510231106",
                "张 三\n换行",
                "sp ace",
                1700000001,
                "v1|d1|2510231106|1f457cc0f01d2ee314cedfcbc7a938f309137d1239a7d101796eede622f2773e|sp ace|1700000001",
                "fSNepjepUdbR1T87tk-_SGbb4Ai-NIDreMSWQBLZ5bM3cg9ywX5KQR2TvmgD93f8AA37Vu4sKYF_BFcB2vP9Aw",
            ),
        ]
    }

    fn golden_seed() -> [u8; 32] {
        [7u8; 32]
    }

    /// 跨语言 golden（规格 §4-1）：5 组 canonical 与 ocr-service Python 输出逐字节相等，
    /// 含空 `student_name`（第 1 组）与中文姓名（第 2/4 组）。
    #[test]
    fn golden_canonical_matches_ocr_service_byte_for_byte() {
        assert!(golden_vectors().len() >= 5, "golden 向量必须 ≥5 组");
        for (device_id, student_id, student_name, nonce, ts, expected_canonical, _sig) in
            golden_vectors()
        {
            let canonical = build_v2_canonical(device_id, student_id, student_name, nonce, ts)
                .expect("golden 输入构建不应失败");
            assert_eq!(
                canonical, expected_canonical,
                "Rust canonical 必须与 ocr-service Python 逐字节一致（device_id={device_id:?}）"
            );
            // 无末尾换行（与 v1 行式 canonical 的关键区别）
            assert!(!canonical.ends_with('\n'));
        }
    }

    /// 跨语言 golden（规格 §4-3/4）：固定 seed 对 golden canonical 的签名与
    /// Python `base64.urlsafe_b64encode(...).rstrip('=')` 一致，且恒 86 字符（64 字节无 padding）。
    #[test]
    fn golden_signature_matches_python_b64url() {
        let key = DeviceKey::from_seed(golden_seed());
        for (device_id, _student_id, _student_name, _nonce, _ts, canonical, expected_sig) in
            golden_vectors()
        {
            // Ed25519 是确定性签名：同一 seed + 同一 canonical 字节 → 与 Python 侧逐字节相同
            let signature = key.sign(canonical.as_bytes());
            let encoded = general_purpose::URL_SAFE_NO_PAD.encode(signature);
            assert_eq!(
                encoded.len(),
                86,
                "签名必须 86 字符（64 字节 base64url 无 padding）"
            );
            assert_eq!(
                encoded, expected_sig,
                "Rust 签名必须与 Python golden（device_id={device_id:?}）一致"
            );
        }
    }

    /// 跨语言 golden（规格 §4-4）：固定 seed 派生的公钥 JWK 与 Python 侧一致（逐字节 x 值相等）。
    #[test]
    fn golden_public_key_jwk_matches_python() {
        let key = DeviceKey::from_seed(golden_seed());
        let jwk = key.public_jwk();
        assert_eq!(jwk.kty, "OKP");
        assert_eq!(jwk.crv, "Ed25519");
        assert_eq!(jwk.x, "6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw");
        // 序列化格式：紧凑 JSON、固定字段序 kty/crv/x（字段等值断言，不硬比空格）
        let proof = sign_v2_proof(
            &key,
            "dev-0001",
            "2510234567",
            "张三",
            "0f1e2d3c4b5a6978",
            1794244737,
        )
        .expect("签名不应失败");
        let parsed: serde_json::Value =
            serde_json::from_str(&proof.public_key_jwk).expect("public_key_jwk 必须是合法 JSON");
        let obj = parsed.as_object().expect("JWK 必须是对象");
        assert_eq!(obj.get("kty").and_then(|v| v.as_str()), Some("OKP"));
        assert_eq!(obj.get("crv").and_then(|v| v.as_str()), Some("Ed25519"));
        assert_eq!(
            obj.get("x").and_then(|v| v.as_str()),
            Some("6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw")
        );
        assert_eq!(obj.len(), 3, "JWK 只允许 kty/crv/x 三个字段");
    }

    /// 跨语言 golden 反向验证：Rust 验签器验证 Python 签出的 5 组签名（Python→Rust 方向）。
    #[test]
    fn golden_signatures_verify_with_rust() {
        let key = DeviceKey::from_seed(golden_seed());
        let x = key.public_jwk().x;
        for (_device_id, _student_id, _student_name, _nonce, _ts, canonical, signature) in
            golden_vectors()
        {
            let sig_bytes: [u8; 64] = general_purpose::URL_SAFE_NO_PAD
                .decode(signature)
                .expect("golden 签名可解码")
                .as_slice()
                .try_into()
                .expect("64 字节");
            DeviceKey::verify_with_public_key(&x, canonical.as_bytes(), &sig_bytes)
                .expect("Python 签名必须能通过 Rust 验签");
        }
    }

    /// 签名自检（规格 §4-2）：固定 seed 签出的 proof 自检为真；
    /// 篡改 canonical/签名/任一标识字段 → 自检必须为假。
    #[test]
    fn verify_v2_proof_true_and_tampered_false() {
        let key = DeviceKey::from_seed(golden_seed());
        let proof = sign_v2_proof(
            &key,
            "dev-0001",
            "2510234567",
            "张三",
            "0f1e2d3c4b5a6978",
            1794244737,
        )
        .expect("签名不应失败");
        assert!(verify_v2_proof(&proof), "合法 proof 自检必须通过");

        // 篡改 canonical 一个字符（第 2 段 device_id 尾部）
        let mut t1 = proof.clone();
        t1.canonical = t1.canonical.replace("dev-0001", "dev-0002");
        assert!(!verify_v2_proof(&t1), "canonical 篡改后自检必须失败");

        // 篡改签名一个字符（b64url 字符域内替换，保持长度/编码合法）
        let mut t2 = proof.clone();
        let mut sig = t2.signature.clone();
        let first = sig
            .char_indices()
            .find(|(_, c)| *c != 'c')
            .map(|(i, _)| i)
            .unwrap_or(0);
        sig.replace_range(first..first + 1, "Z");
        t2.signature = sig;
        assert!(!verify_v2_proof(&t2), "签名篡改后自检必须失败");

        // 篡改 student_id（一致性校验必须抓到，即使 canonical 未被同时改动）
        let mut t3 = proof.clone();
        t3.student_id = "9999999999".to_string();
        assert!(
            !verify_v2_proof(&t3),
            "student_id 与 canonical 不一致必须自检失败"
        );

        // 篡改 ts（第 6 段与 proof.ts 必须一致）
        let mut t4 = proof.clone();
        t4.ts = t4.ts + 1;
        assert!(!verify_v2_proof(&t4), "ts 与 canonical 不一致必须自检失败");

        // 篡改 nonce
        let mut t5 = proof.clone();
        t5.nonce = "0f1e2d3c4b5a6979".to_string();
        assert!(
            !verify_v2_proof(&t5),
            "nonce 与 canonical 不一致必须自检失败"
        );

        // 红队 F2：student_name_hash 字段与 canonical 第 4 段脱钩 → 必须拒绝
        let mut t7 = proof.clone();
        t7.student_name_hash = "0".repeat(64);
        assert!(
            !verify_v2_proof(&t7),
            "student_name_hash 与 canonical 第 4 段不一致必须自检失败"
        );

        // 红队 F2：alg 字段伪造（本阶段只允许 Ed25519）→ 必须拒绝
        let mut t8 = proof.clone();
        t8.alg = "ES256".to_string();
        assert!(!verify_v2_proof(&t8), "alg 非 Ed25519 必须自检失败");

        // 红队 O1：自洽但服务端会拒的形态（空 student_id/nonce、负 ts）→ 本地也必须拒
        for (label, canonical, ts) in [
            (
                "空 student_id",
                format!(
                    "v1|dev-0001||{}|0f1e2d3c4b5a6978|1794244737",
                    proof.student_name_hash
                ),
                1794244737,
            ),
            (
                "空 nonce",
                format!(
                    "v1|dev-0001|2510234567|{}||1794244737",
                    proof.student_name_hash
                ),
                1794244737,
            ),
            (
                "负 ts",
                format!(
                    "v1|dev-0001|2510234567|{}|0f1e2d3c4b5a6978|-5",
                    proof.student_name_hash
                ),
                -5,
            ),
        ] {
            let mut t = proof.clone();
            t.canonical = canonical;
            t.ts = ts;
            if label == "空 student_id" {
                t.student_id = String::new();
            }
            if label == "空 nonce" {
                t.nonce = String::new();
            }
            assert!(!verify_v2_proof(&t), "{label} 形态必须自检失败");
        }

        // 红队 O2：JWK 带私钥成员 d → 必须拒绝
        let mut t9 = proof.clone();
        let mut jwk: serde_json::Value = serde_json::from_str(&t9.public_key_jwk).unwrap();
        jwk["d"] = serde_json::Value::String("private".to_string());
        t9.public_key_jwk = jwk.to_string();
        assert!(!verify_v2_proof(&t9), "JWK 含私钥成员 d 必须自检失败");

        // 公钥 JWK 换成错误公钥（签名对不上）
        let mut t6 = proof.clone();
        let other = DeviceKey::generate();
        t6.public_key_jwk = format!(
            "{{\"kty\":\"{}\",\"crv\":\"{}\",\"x\":\"{}\"}}",
            other.public_jwk().kty,
            other.public_jwk().crv,
            other.public_jwk().x
        );
        assert!(!verify_v2_proof(&t6), "错误公钥 JWK 自检必须失败");
    }

    /// 形状校验（独立复核 M3 补测）：canonical 必须**恰好 6 段**、版本 `v1`、
    /// 第 4 段为 64 位**小写** hex；缺一不可（删掉该检查时本用例必须变红）。
    #[test]
    fn verify_v2_proof_rejects_malformed_canonical_shapes() {
        let key = DeviceKey::from_seed(golden_seed());
        let proof = sign_v2_proof(
            &key,
            "dev-0001",
            "2510234567",
            "张三",
            "0f1e2d3c4b5a6978",
            1794244737,
        )
        .expect("签名不应失败");
        let parts: Vec<&str> = proof.canonical.split('|').collect();
        assert_eq!(parts.len(), 6, "前置：合法 canonical 必须是 6 段");

        // 5 段 / 7 段
        for (label, canonical) in [
            ("5 段", parts[..5].join("|")),
            ("7 段", format!("{}|extra", proof.canonical)),
        ] {
            let mut t = proof.clone();
            t.canonical = canonical;
            assert!(!verify_v2_proof(&t), "{label} canonical 必须被判非法");
        }

        // 版本段不对
        let mut bad_version = proof.clone();
        bad_version.canonical = proof.canonical.replacen("v1|", "v2|", 1);
        assert!(!verify_v2_proof(&bad_version), "版本非 v1 必须非法");

        // 第 4 段不是 64 位小写 hex（过短 / 大写）
        for (label, hash) in [("过短", "abc"), ("大写", &parts[3].to_uppercase()[..])] {
            let mut t = proof.clone();
            t.canonical = format!(
                "{}|{}|{}|{}|{}|{}",
                parts[0], parts[1], parts[2], hash, parts[4], parts[5]
            );
            assert!(!verify_v2_proof(&t), "第 4 段{label}时必须非法");
        }
    }

    /// 输入校验（规格 §2）：空字段 / 含 `|` 一律 `InvalidInput`；
    /// `student_name` 含 `|` 允许（只进 hash，不进 canonical 明文）。
    #[test]
    fn build_v2_canonical_rejects_empty_and_pipe_fields() {
        let ts = 1794244737;
        let cases: Vec<(&str, &str, &str)> = vec![
            ("", "2510231106", "n1"),
            ("dev-1", "", "n1"),
            ("dev-1", "2510231106", ""),
            ("dev|1", "2510231106", "n1"),
            ("dev-1", "2510|2311", "n1"),
            ("dev-1", "2510231106", "n|1"),
        ];
        for (device_id, student_id, nonce) in cases {
            assert!(
                matches!(
                    build_v2_canonical(device_id, student_id, "张三", nonce, ts),
                    Err(IdentityError::InvalidInput(_))
                ),
                "非法输入必须被拒绝：device_id={device_id:?} student_id={student_id:?} nonce={nonce:?}"
            );
        }
        // student_name 含 | 合法（只进 sha256，不进 canonical 明文）
        let ok = build_v2_canonical("dev-1", "2510231106", "a|b", "n1", ts)
            .expect("student_name 含 | 应合法");
        assert!(
            ok.starts_with("v1|dev-1|2510231106|"),
            "前 3 段必须是明文标识"
        );
        assert!(!ok.contains("a|b"), "student_name 明文不得进入 canonical");
    }

    /// 空姓名 → 空串 sha256（e3b0c442...）。
    #[test]
    fn empty_student_name_uses_empty_sha256() {
        let canonical =
            build_v2_canonical("d1", "2510231106", "", "n1", 1700000000).expect("构建不应失败");
        assert_eq!(
            canonical,
            "v1|d1|2510231106|e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|n1|1700000000"
        );
    }

    /// nonce 工具：32 位小写 hex；now_unix 合理范围。
    #[test]
    fn nonce_and_time_helpers() {
        let nonce = generate_nonce();
        assert_eq!(nonce.len(), 32);
        assert!(nonce
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        // 两次生成的 nonce 不同（CSPRNG）
        assert_ne!(generate_nonce(), generate_nonce());
        let ts = now_unix();
        assert!(
            ts > 1_700_000_000 && ts < 2_000_000_000,
            "now_unix 应在 2023~2033 之间"
        );
    }

    /// 跨语言证据（供父代理用 ocr-service Python 验签器做真实跨语言验签）：
    /// 固定 seed 签出证明，打印一行 JSON（device_id/student_id/student_name/nonce/ts/canonical/
    /// signature/alg/public_key_jwk）；测试自身断言自检通过。
    #[test]
    fn emit_v2_proof_for_cross_check() {
        let key = DeviceKey::from_seed(golden_seed());
        let (device_id, student_id, student_name, nonce, ts) = (
            "cross-check-dev-0001",
            "2510231106",
            "张三",
            "crosscheck-nonce-0001",
            1794244737i64,
        );
        let proof = sign_v2_proof(&key, device_id, student_id, student_name, nonce, ts)
            .expect("签名不应失败");
        assert!(verify_v2_proof(&proof), "跨语言证据自检必须通过");
        let line = serde_json::json!({
            "device_id": proof.device_id,
            "student_id": proof.student_id,
            "student_name": student_name,
            "nonce": proof.nonce,
            "ts": proof.ts,
            "canonical": proof.canonical,
            "signature": proof.signature,
            "alg": proof.alg,
            "public_key_jwk": proof.public_key_jwk,
        });
        println!("[P0-7 cross-check] {}", line.to_string());
    }
}
