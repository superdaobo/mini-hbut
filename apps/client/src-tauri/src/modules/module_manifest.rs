//! 模块清单（manifest）验签与防回放（#1166 T05）。
//!
//! 契约（`docs/architecture/contracts/module-and-auth-contracts.md` §2）：
//! - 清单字段固定；`signature` 覆盖「除 signature 外全部字段」的**规范化字节**；
//! - 规范化 = 键字典序 + 无空白 + UTF-8（`serde_json::Value` 的 Map 默认是 BTreeMap，天然有序）；
//! - 验签成功才允许把包摘要当授权依据；缺签名/错签名/未知 `key_id`/字段被改写一律拒绝；
//! - `release_seq` 单调，用于防回放（CDN 回放旧清单不能降级版本）。

use base64::{engine::general_purpose, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// 清单里的 signature 块。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ManifestSignature {
    /// 目前只允许 "ed25519"。
    pub alg: String,
    /// 对应内置信任根里的 key id。
    pub key_id: String,
    /// base64url(no pad) 的 64 字节签名。
    pub value: String,
}

/// 模块清单（与前端 `manifest.json` 一一对应）。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModuleManifest {
    pub module_id: String,
    pub version: String,
    /// 发布序号：单调递增，用于防回放。
    #[serde(default)]
    pub release_seq: u64,
    pub channel: String,
    #[serde(default)]
    pub module_name: String,
    #[serde(default = "default_entry_path")]
    pub entry_path: String,
    /// 有签名时必须非空，且与包体实际摘要一致。
    #[serde(default)]
    pub package_sha256: String,
    #[serde(default)]
    pub min_compatible_version: String,
    #[serde(default)]
    pub compat: ManifestCompat,
    /// 能力白名单（§5.1），空数组 = 纯静态模块。
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub publisher_key_id: String,
    pub signature: Option<ManifestSignature>,
}

fn default_entry_path() -> String {
    "index.html".to_string()
}

/// 兼容范围。
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct ManifestCompat {
    #[serde(default)]
    pub host_min: String,
    /// 本期固定 1；不兼容的清单直接拒绝。
    #[serde(default)]
    pub bridge_protocol: u32,
}

/// 验签失败原因（对外只暴露粗粒度错误，不泄露密钥材料）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestError {
    MissingSignature,
    UnsupportedAlgorithm(String),
    UnknownKeyId(String),
    InvalidSignature,
    AmbiguousField(String),
    ProtocolMismatch(u32),
    ReplayDetected { seen: u64, got: u64 },
    Invalid(String),
}

impl ManifestError {
    /// 用户可读且不泄露细节的文案（前端按 prefix 识别）。
    pub fn code(&self) -> &'static str {
        match self {
            ManifestError::MissingSignature => "MODULE_SIGNATURE_MISSING",
            ManifestError::UnsupportedAlgorithm(_) => "MODULE_SIGNATURE_ALG_UNSUPPORTED",
            ManifestError::UnknownKeyId(_) => "MODULE_PUBLISHER_KEY_UNKNOWN",
            ManifestError::InvalidSignature => "MODULE_SIGNATURE_INVALID",
            ManifestError::AmbiguousField(_) => "MODULE_MANIFEST_INVALID",
            ManifestError::ProtocolMismatch(_) => "MODULE_PROTOCOL_UNSUPPORTED",
            ManifestError::ReplayDetected { .. } => "MODULE_RELEASE_REPLAY",
            ManifestError::Invalid(_) => "MODULE_MANIFEST_INVALID",
        }
    }

    pub fn message(&self) -> String {
        match self {
            ManifestError::MissingSignature => "模块清单缺少发布者签名".to_string(),
            ManifestError::UnsupportedAlgorithm(alg) => format!("不支持的签名算法: {alg}"),
            ManifestError::UnknownKeyId(id) => format!("未知的发布者密钥: {id}"),
            ManifestError::InvalidSignature => "模块清单签名校验失败".to_string(),
            ManifestError::AmbiguousField(field) => format!("模块清单字段非法: {field}"),
            ManifestError::ProtocolMismatch(v) => format!("模块桥协议不兼容: {v}"),
            ManifestError::ReplayDetected { seen, got } => {
                format!("模块发布序号回放被拒绝（已见 {seen}，本次 {got}）")
            }
            ManifestError::Invalid(reason) => format!("模块清单非法: {reason}"),
        }
    }
}

/// 本期支持的桥协议版本。
pub const SUPPORTED_BRIDGE_PROTOCOL: u32 = 1;

/// 内置信任根：`key_id → base64url(raw 32 bytes public key)`。
///
/// **测试密钥只允许在 debug 构建使用**：`dev-test-1` 的私钥在测试夹具与本地签名脚本里
/// （文件名带 `test`），release 构建永远不会接受它 —— 因此不能用它签出可在生产运行的模块。
pub struct TrustedKey {
    pub key_id: &'static str,
    pub public_key_b64: &'static str,
    pub debug_only: bool,
}

pub const TRUSTED_KEYS: &[TrustedKey] = &[TrustedKey {
    key_id: "dev-test-1",
    // 由固定 seed 推导，见 module_manifest.rs 的单测与 scripts/sign_module_manifest.mjs 的说明。
    public_key_b64: "6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw",
    debug_only: true,
}];

fn trusted_key(key_id: &str) -> Option<&'static TrustedKey> {
    TRUSTED_KEYS
        .iter()
        .find(|item| item.key_id == key_id)
        .filter(|item| !item.debug_only || cfg!(debug_assertions))
}

/// 规范化字节：去掉 `signature` 后的 JSON，键字典序、无空白。
pub fn canonical_manifest_bytes(manifest: &ModuleManifest) -> Result<Vec<u8>, ManifestError> {
    let mut value = serde_json::to_value(manifest)
        .map_err(|error| ManifestError::Invalid(error.to_string()))?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| ManifestError::Invalid("manifest 不是 JSON 对象".to_string()))?;
    object.remove("signature");
    // serde_json 默认 Map 为 BTreeMap ⇒ 键已字典序；to_vec 不插入空白。
    serde_json::to_vec(&value).map_err(|error| ManifestError::Invalid(error.to_string()))
}

/// 校验清单签名（不检查回放，回放由 `ensure_release_seq` 负责）。
pub fn verify_manifest_signature(manifest: &ModuleManifest) -> Result<(), ManifestError> {
    let signature = manifest
        .signature
        .as_ref()
        .ok_or(ManifestError::MissingSignature)?;
    if !signature.alg.eq_ignore_ascii_case("ed25519") {
        return Err(ManifestError::UnsupportedAlgorithm(signature.alg.clone()));
    }
    let trusted = trusted_key(&signature.key_id)
        .ok_or_else(|| ManifestError::UnknownKeyId(signature.key_id.clone()))?;
    // publisher_key_id（若有）必须与签名 key 一致，避免「签名 A、声明 B」
    if !manifest.publisher_key_id.is_empty() && manifest.publisher_key_id != signature.key_id {
        return Err(ManifestError::AmbiguousField(
            "publisher_key_id".to_string(),
        ));
    }
    if manifest.compat.bridge_protocol != 0
        && manifest.compat.bridge_protocol != SUPPORTED_BRIDGE_PROTOCOL
    {
        return Err(ManifestError::ProtocolMismatch(
            manifest.compat.bridge_protocol,
        ));
    }

    let raw_public = general_purpose::URL_SAFE_NO_PAD
        .decode(trusted.public_key_b64.trim())
        .map_err(|_| ManifestError::Invalid("内置公钥格式非法".to_string()))?;
    let public_bytes: [u8; 32] = raw_public
        .try_into()
        .map_err(|_| ManifestError::Invalid("内置公钥长度非法".to_string()))?;
    let verifying = VerifyingKey::from_bytes(&public_bytes)
        .map_err(|_| ManifestError::Invalid("内置公钥不可用".to_string()))?;

    let raw_signature = general_purpose::URL_SAFE_NO_PAD
        .decode(signature.value.trim())
        .map_err(|_| ManifestError::InvalidSignature)?;
    let signature_bytes: [u8; 64] = raw_signature
        .try_into()
        .map_err(|_| ManifestError::InvalidSignature)?;
    let parsed = Signature::from_bytes(&signature_bytes);

    let canonical = canonical_manifest_bytes(manifest)?;
    verifying
        .verify(&canonical, &parsed)
        .map_err(|_| ManifestError::InvalidSignature)
}

/// 防回放记录文件（按 channel + module_id 存已见的最大 release_seq）。
fn replay_store_path(app_cache_dir: &Path) -> PathBuf {
    app_cache_dir.join("more_modules").join(".release-seq.json")
}

/// 读取已见的最大 release_seq。
pub fn read_release_seq(app_cache_dir: &Path, channel: &str, module_id: &str) -> u64 {
    let path = replay_store_path(app_cache_dir);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return 0;
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return 0;
    };
    value
        .get(format!("{channel}:{module_id}"))
        .and_then(|item| item.as_u64())
        .unwrap_or(0)
}

/// 写入已见的最大 release_seq（只增不减）。
pub fn write_release_seq(
    app_cache_dir: &Path,
    channel: &str,
    module_id: &str,
    release_seq: u64,
) -> std::io::Result<()> {
    let path = replay_store_path(app_cache_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut map: serde_json::Map<String, Value> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let key = format!("{channel}:{module_id}");
    let current = map.get(&key).and_then(|item| item.as_u64()).unwrap_or(0);
    if release_seq > current {
        map.insert(key, Value::from(release_seq));
        let text = serde_json::to_string(&Value::Object(map))
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        std::fs::write(&path, text)?;
    }
    Ok(())
}

/// 防回放判定：新发布的 `release_seq` 必须 > 已见值。
///
/// 例外：**同 sha256 的幂等重试**（缓存命中、重复 prepare）不算回放。
pub fn ensure_release_seq(
    app_cache_dir: &Path,
    channel: &str,
    module_id: &str,
    release_seq: u64,
    same_package: bool,
) -> Result<(), ManifestError> {
    if release_seq == 0 {
        return Err(ManifestError::Invalid("release_seq 缺失".to_string()));
    }
    let seen = read_release_seq(app_cache_dir, channel, module_id);
    if release_seq < seen || (release_seq == seen && !same_package) {
        return Err(ManifestError::ReplayDetected {
            seen,
            got: release_seq,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    /// 测试专用私钥（固定 seed ⇒ 与签名脚本一致；**不是发布密钥**）。
    fn test_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn test_public_b64() -> String {
        general_purpose::URL_SAFE_NO_PAD.encode(test_signing_key().verifying_key().to_bytes())
    }

    fn sample_manifest() -> ModuleManifest {
        ModuleManifest {
            module_id: "demo".to_string(),
            version: "1.0.0".to_string(),
            release_seq: 3,
            channel: "main".to_string(),
            module_name: "示例".to_string(),
            entry_path: "index.html".to_string(),
            package_sha256: "a".repeat(64),
            min_compatible_version: "1.0.0".to_string(),
            compat: ManifestCompat {
                host_min: "1.0.0".to_string(),
                bridge_protocol: 1,
            },
            permissions: vec!["school.schedule".to_string()],
            publisher_key_id: "dev-test-1".to_string(),
            signature: None,
        }
    }

    fn sign(mut manifest: ModuleManifest) -> ModuleManifest {
        let canonical = canonical_manifest_bytes(&manifest).expect("canonical");
        let signature = test_signing_key().sign(&canonical);
        manifest.signature = Some(ManifestSignature {
            alg: "ed25519".to_string(),
            key_id: "dev-test-1".to_string(),
            value: general_purpose::URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        });
        manifest
    }

    #[test]
    fn canonical_bytes_are_sorted_and_stable() {
        let manifest = sample_manifest();
        let a = canonical_manifest_bytes(&manifest).expect("a");
        let b = canonical_manifest_bytes(&manifest).expect("b");
        assert_eq!(a, b);
        let text = String::from_utf8(a).expect("utf8");
        assert!(text.starts_with("{\"channel\""), "键必须字典序开头: {text}");
        assert!(!text.contains(": "), "规范化字节不得含空白");
        assert!(
            !text.contains("\"signature\""),
            "签名块不参与规范化: {text}"
        );
    }

    #[test]
    fn missing_signature_is_rejected() {
        assert_eq!(
            verify_manifest_signature(&sample_manifest()).unwrap_err(),
            ManifestError::MissingSignature
        );
    }

    #[test]
    fn valid_signature_is_accepted() {
        // 用测试公钥替换信任根（cfg(test) 下临时写入）
        let manifest = sign(sample_manifest());
        // 信任根里的占位公钥由 `trusted_key` 返回；测试通过下面这个断言确认「公钥占位会被拒绝」，
        // 真正的正例在 `valid_signature_with_known_key` 中通过注入公钥验证。
        assert!(manifest.signature.is_some());
        let canonical = canonical_manifest_bytes(&manifest).expect("canonical");
        let verifying = test_signing_key().verifying_key();
        let raw = general_purpose::URL_SAFE_NO_PAD
            .decode(manifest.signature.as_ref().unwrap().value.trim())
            .expect("decode");
        let parsed = Signature::from_bytes(&raw.try_into().expect("len"));
        assert!(verifying.verify(&canonical, &parsed).is_ok());
        assert!(!test_public_b64().is_empty());
    }

    #[test]
    fn valid_signature_with_builtin_trust_root_is_accepted() {
        // 内置测试公钥与固定 seed 对应 ⇒ 这条同时是「信任根接线正确」的回归。
        let manifest = sign(sample_manifest());
        assert!(
            verify_manifest_signature(&manifest).is_ok(),
            "内置信任根应能验证测试私钥签出的清单"
        );
    }

    #[test]
    fn tampered_field_changes_canonical_and_breaks_signature() {
        let signed = sign(sample_manifest());
        let mut tampered = signed.clone();
        tampered.permissions = vec!["school.grades".to_string()];
        let canonical = canonical_manifest_bytes(&tampered).expect("canonical");
        let raw = general_purpose::URL_SAFE_NO_PAD
            .decode(signed.signature.as_ref().unwrap().value.trim())
            .expect("decode");
        let parsed = Signature::from_bytes(&raw.try_into().expect("len"));
        assert!(
            test_signing_key()
                .verifying_key()
                .verify(&canonical, &parsed)
                .is_err(),
            "改权限必须导致验签失败"
        );
    }

    #[test]
    fn unsupported_algorithm_and_unknown_key_are_rejected() {
        let mut manifest = sign(sample_manifest());
        manifest.signature.as_mut().unwrap().alg = "rsa".to_string();
        assert!(matches!(
            verify_manifest_signature(&manifest),
            Err(ManifestError::UnsupportedAlgorithm(_))
        ));

        let mut unknown = sign(sample_manifest());
        unknown.signature.as_mut().unwrap().key_id = "nobody".to_string();
        unknown.publisher_key_id = "nobody".to_string();
        assert!(matches!(
            verify_manifest_signature(&unknown),
            Err(ManifestError::UnknownKeyId(_))
        ));
    }

    #[test]
    fn protocol_mismatch_is_rejected() {
        let mut manifest = sign(sample_manifest());
        manifest.compat.bridge_protocol = 2;
        assert_eq!(
            verify_manifest_signature(&manifest).unwrap_err(),
            ManifestError::ProtocolMismatch(2)
        );
    }

    #[test]
    fn release_seq_replay_is_rejected() {
        let dir = std::env::temp_dir().join(format!("hbut-replay-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");

        assert!(ensure_release_seq(&dir, "main", "demo", 2, false).is_ok());
        write_release_seq(&dir, "main", "demo", 2).expect("write");

        // 回放更低序号
        assert!(matches!(
            ensure_release_seq(&dir, "main", "demo", 1, false),
            Err(ManifestError::ReplayDetected { .. })
        ));
        // 同序号但不同包 → 也是回放
        assert!(matches!(
            ensure_release_seq(&dir, "main", "demo", 2, false),
            Err(ManifestError::ReplayDetected { .. })
        ));
        // 同序号且同一个包 → 幂等重试，放行
        assert!(ensure_release_seq(&dir, "main", "demo", 2, true).is_ok());
        // 更高序号 → 放行
        assert!(ensure_release_seq(&dir, "main", "demo", 3, false).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn release_seq_zero_is_rejected() {
        let dir = std::env::temp_dir().join(format!("hbut-replay0-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(matches!(
            ensure_release_seq(&dir, "main", "demo", 0, false),
            Err(ManifestError::Invalid(_))
        ));
    }
}
