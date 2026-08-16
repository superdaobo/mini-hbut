//! 设备级 Ed25519 密钥（#622）。
//!
//! 安全模型（#617 信任边界 13-14）：
//! - V1 固定 Ed25519（OKP/Ed25519 JWK），禁止各平台自行选算法导致协议碎片化；
//! - 私钥（32B seed）只进 OS keyring：service=`mini-hbut-identity` / account=`device-ed25519-v1`；
//! - keyring 不可用/写回校验失败 → fail closed，禁止文件/SQLite/localStorage 降级；
//! - Debug 输出只允许 fingerprint，任何路径都不打印私钥。

use base64::{engine::general_purpose, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::fmt;

use super::errors::IdentityError;
use super::keyring::{KeyringLike, RealKeyring};

/// #622 规定的 Keyring 逻辑 key。
pub const KEYRING_SERVICE: &str = "mini-hbut-identity";
pub const KEYRING_ACCOUNT: &str = "device-ed25519-v1";

/// Ed25519 公钥 JWK（只含公开材料；序列化字段顺序固定 kty,crv,x，与 Node 侧 fingerprint 计算一致）。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct PublicJwk {
    pub kty: &'static str,
    pub crv: &'static str,
    pub x: String,
}

/// canonical 紧凑 JWK JSON（手工拼接：字段顺序与无空格格式固定，供 fingerprint 使用）。
fn canonical_jwk_json(jwk: &PublicJwk) -> String {
    format!(
        "{{\"kty\":\"{}\",\"crv\":\"{}\",\"x\":\"{}\"}}",
        jwk.kty, jwk.crv, jwk.x
    )
}

/// 设备密钥：包装 Ed25519 SigningKey，seed 由调用方从 Keyring 注入。
pub struct DeviceKey {
    signing_key: SigningKey,
}

impl fmt::Debug for DeviceKey {
    /// Debug 只允许 fingerprint；私钥材料不可进入任何日志/调试输出。
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DeviceKey")
            .field("fingerprint", &self.fingerprint())
            .finish()
    }
}

impl DeviceKey {
    /// 从 32 字节 seed 恢复密钥（seed 来自 Keyring）。
    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self {
            signing_key: SigningKey::from_bytes(&seed),
        }
    }

    /// 生成新密钥（CSPRNG；seed 立即写入 Keyring 后即丢弃）。
    pub fn generate() -> Self {
        let mut seed = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut seed);
        Self::from_seed(seed)
    }

    /// 私钥 seed（仅 Keyring 持久化使用，禁止打印/入库/发网络）。
    pub(crate) fn seed_bytes(&self) -> [u8; 32] {
        self.signing_key.to_bytes()
    }

    /// 公钥 JWK（无 d 字段）。
    pub fn public_jwk(&self) -> PublicJwk {
        let x =
            general_purpose::URL_SAFE_NO_PAD.encode(self.signing_key.verifying_key().to_bytes());
        PublicJwk {
            kty: "OKP",
            crv: "Ed25519",
            x,
        }
    }

    /// 设备指纹 = sha256(canonical 紧凑 JWK JSON) base64url（与 Node 侧 devices.deviceFingerprint 一致）。
    pub fn fingerprint(&self) -> String {
        let json = canonical_jwk_json(&self.public_jwk());
        let digest = Sha256::digest(json.as_bytes());
        general_purpose::URL_SAFE_NO_PAD.encode(digest)
    }

    /// 对 canonical 文本字节签名，返回 64 字节 Ed25519 签名。
    pub fn sign(&self, canonical_bytes: &[u8]) -> [u8; 64] {
        self.signing_key.sign(canonical_bytes).to_bytes()
    }

    /// 验证签名（Rust 侧自验/测试用）。
    pub fn verify(
        &self,
        canonical_bytes: &[u8],
        signature: &[u8; 64],
    ) -> Result<(), IdentityError> {
        let sig = Signature::from_slice(signature)
            .map_err(|e| IdentityError::Internal(format!("签名解析失败：{e}")))?;
        self.signing_key
            .verifying_key()
            .verify_strict(canonical_bytes, &sig)
            .map_err(|_| IdentityError::InvalidInput("签名验证失败".to_string()))
    }

    /// 用给定公钥验证签名（跨设备/测试场景）。
    pub fn verify_with_public_key(
        public_x: &str,
        canonical_bytes: &[u8],
        signature: &[u8; 64],
    ) -> Result<(), IdentityError> {
        let raw = general_purpose::URL_SAFE_NO_PAD
            .decode(public_x)
            .map_err(|_| IdentityError::InvalidInput("公钥格式非法".to_string()))?;
        let bytes: [u8; 32] = raw
            .as_slice()
            .try_into()
            .map_err(|_| IdentityError::InvalidInput("公钥长度非法".to_string()))?;
        let verifying = VerifyingKey::from_bytes(&bytes)
            .map_err(|_| IdentityError::InvalidInput("公钥解析失败".to_string()))?;
        let sig = Signature::from_slice(signature)
            .map_err(|e| IdentityError::Internal(format!("签名解析失败：{e}")))?;
        verifying
            .verify_strict(canonical_bytes, &sig)
            .map_err(|_| IdentityError::InvalidInput("签名验证失败".to_string()))
    }
}

/// 设备密钥存储：Keyring 读写 + fail closed 语义。
pub struct DeviceKeyStore {
    keyring: Box<dyn KeyringLike>,
}

impl DeviceKeyStore {
    /// 生产实例：OS Keyring（service/account 按 #622 固定）。
    pub fn real() -> Self {
        Self::with_keyring(Box::new(RealKeyring::new()))
    }

    /// 测试/注入用：自定义 Keyring 实现。
    pub fn with_keyring(keyring: Box<dyn KeyringLike>) -> Self {
        Self { keyring }
    }

    /// 读取当前设备密钥；不存在返回 Ok(None)。keyring 错误 → KeyringUnavailable（fail closed）。
    pub fn load(&self) -> Result<Option<DeviceKey>, IdentityError> {
        let encoded = self
            .keyring
            .get_secret()
            .map_err(IdentityError::KeyringUnavailable)?;
        let Some(encoded) = encoded else {
            // 仅显式测试环境允许文件后备；正常 debug/release 均不会自动读取磁盘私钥。
            #[cfg(debug_assertions)]
            if let Some(path) = debug_key_file_path() {
                match std::fs::read(&path) {
                    Ok(bytes) if bytes.len() == 32 => {
                        let seed: [u8; 32] = bytes
                            .as_slice()
                            .try_into()
                            .map_err(|_| IdentityError::KeyringWriteMismatch)?;
                        return Ok(Some(DeviceKey::from_seed(seed)));
                    }
                    Ok(_) => return Err(IdentityError::KeyringWriteMismatch),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                    Err(err) => {
                        return Err(IdentityError::Internal(format!(
                            "读取显式测试设备密钥文件失败：{err}"
                        )))
                    }
                }
            }
            return Ok(None);
        };
        let bytes = general_purpose::URL_SAFE_NO_PAD
            .decode(encoded.as_bytes())
            .map_err(|e| {
                eprintln!(
                    "[identity] keyring load decode 失败: len={} err={e}",
                    encoded.len()
                );
                IdentityError::KeyringWriteMismatch
            })?;
        let seed: [u8; 32] = bytes.as_slice().try_into().map_err(|_| {
            eprintln!(
                "[identity] keyring load seed 长度不符: bytes_len={}",
                bytes.len()
            );
            IdentityError::KeyringWriteMismatch
        })?;
        Ok(Some(DeviceKey::from_seed(seed)))
    }
}

/// 显式测试密钥文件路径。
/// 仅 debug/test 且调用者主动设置 `HBUT_IDENTITY_KEY_FILE` 时启用；
/// 不再自动回退 `%APPDATA%`，正常开发与发布构建始终保持 Keyring fail closed。
#[cfg(debug_assertions)]
fn debug_key_file_path() -> Option<std::path::PathBuf> {
    std::env::var("HBUT_IDENTITY_KEY_FILE")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
}

/// 文件存储的 Keyring 实现（仅显式测试注入，不用于正常 debug/release）。
#[cfg(debug_assertions)]
pub struct FileKeyring {
    path: std::path::PathBuf,
}

#[cfg(debug_assertions)]
impl FileKeyring {
    pub fn new() -> Option<Self> {
        Some(Self {
            path: debug_key_file_path()?,
        })
    }
}

#[cfg(debug_assertions)]
impl KeyringLike for FileKeyring {
    fn get_secret(&self) -> Result<Option<String>, String> {
        let bytes = std::fs::read(&self.path).map_err(|e| e.to_string())?;
        if bytes.len() != 32 {
            return Err("文件密钥长度不符".to_string());
        }
        Ok(Some(general_purpose::URL_SAFE_NO_PAD.encode(bytes)))
    }
    fn set_secret(&self, value: &str) -> Result<(), String> {
        let bytes = general_purpose::URL_SAFE_NO_PAD
            .decode(value.as_bytes())
            .map_err(|e| e.to_string())?;
        std::fs::write(&self.path, bytes).map_err(|e| e.to_string())
    }
    fn delete_secret(&self) -> Result<(), String> {
        std::fs::remove_file(&self.path).map_err(|e| e.to_string())
    }
}

impl DeviceKeyStore {
    /// 读取密钥；不存在则生成并写入 Keyring（写后回读校验）。
    /// keyring 不可用或写回校验失败 → fail closed，不返回任何降级密钥。
    pub fn create_if_missing(&self) -> Result<DeviceKey, IdentityError> {
        if let Some(existing) = self.load()? {
            return Ok(existing);
        }
        let key = DeviceKey::generate();
        let encoded = general_purpose::URL_SAFE_NO_PAD.encode(key.seed_bytes());
        self.keyring
            .set_secret(&encoded)
            .map_err(IdentityError::KeyringUnavailable)?;
        // 写后读校验（与 credential_store::load_or_create_secret_key 的既有约定一致）。
        // Windows Credential Manager 新建条目后读取可能短暂 NoEntry（写入时序），
        // 重试最多 10 次、间隔 300ms（最长约 3s）；仍不一致才 fail closed。
        for attempt in 1..=10 {
            match self.load()? {
                Some(stored) if stored.fingerprint() == key.fingerprint() => {
                    return Ok(key);
                }
                other => {
                    // 只记录公开指纹/存在性，不读取或打印任何私钥编码材料。
                    eprintln!(
                        "[identity] keyring 写后读校验第 {attempt} 次未匹配: present={} new_fp={} stored_fp={}",
                        other.is_some(),
                        key.fingerprint(),
                        other.as_ref().map(|k| k.fingerprint()).unwrap_or_default()
                    );
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        // 正常 debug/release 始终 fail closed。只有显式设置测试文件路径时，
        // 才允许测试链路验证 Windows Keyring 写后不可见场景。
        #[cfg(debug_assertions)]
        if let Some(path) = debug_key_file_path() {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    IdentityError::Internal(format!("创建显式测试密钥目录失败：{e}"))
                })?;
            }
            std::fs::write(&path, key.seed_bytes())
                .map_err(|e| IdentityError::Internal(format!("写入显式测试设备密钥失败：{e}")))?;
            return Ok(key);
        }
        Err(IdentityError::KeyringWriteMismatch)
    }

    /// 删除本地设备密钥（仅在用户确认或服务端 revoke 成功后调用）。
    /// 正常构建只有 Keyring；debug 显式测试文件存在时，即使 Keyring 删除报错也必须尝试清理测试文件。
    pub fn delete(&self) -> Result<(), IdentityError> {
        let keyring_result = self
            .keyring
            .delete_secret()
            .map_err(IdentityError::KeyringUnavailable);
        #[cfg(debug_assertions)]
        if let Some(path) = debug_key_file_path() {
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => {
                    return Err(IdentityError::Internal(format!(
                        "删除显式测试设备密钥文件失败：{err}"
                    )))
                }
            }
        }
        keyring_result
    }

    /// 当前密钥指纹（无密钥返回 None）。
    pub fn fingerprint(&self) -> Result<Option<String>, IdentityError> {
        Ok(self.load()?.map(|k| k.fingerprint()))
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use crate::identity::keyring::{FailingKeyring, MemoryKeyring};
    use base64::engine::general_purpose;

    fn seed_of(key: &DeviceKey) -> String {
        general_purpose::URL_SAFE_NO_PAD.encode(key.seed_bytes())
    }

    #[test]
    fn generate_and_load_same_key() {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let first = store
            .create_if_missing()
            .expect("内存 keyring 创建不应失败");
        let seed1 = seed_of(&first);
        // 重新 load 得到同一把密钥（fingerprint 一致、seed 一致）
        let loaded = store.load().unwrap_or(None).expect("应能读取密钥");
        assert_eq!(seed_of(&loaded), seed1);
        assert_eq!(loaded.fingerprint(), first.fingerprint());
        // 二次 create_if_missing 幂等复用
        let again = store.create_if_missing().expect("应复用既有密钥");
        assert_eq!(again.fingerprint(), first.fingerprint());
    }

    #[test]
    fn keyring_unavailable_fails_closed() {
        // keyring 不可用：load/create/delete 全部错误上抛，绝不降级到文件/SQLite
        let store = DeviceKeyStore::with_keyring(Box::new(FailingKeyring));
        assert!(matches!(
            store.load(),
            Err(IdentityError::KeyringUnavailable(_))
        ));
        assert!(matches!(
            store.create_if_missing(),
            Err(IdentityError::KeyringUnavailable(_))
        ));
        assert!(matches!(
            store.delete(),
            Err(IdentityError::KeyringUnavailable(_))
        ));
    }

    #[test]
    fn delete_removes_key() {
        // 显式测试文件后备：隔离到临时路径，验证 delete 会同步清理测试材料。
        let temp_file =
            std::env::temp_dir().join(format!("hbut-identity-test-{}.bin", std::process::id()));
        let _ = std::fs::remove_file(&temp_file);
        unsafe {
            std::env::set_var("HBUT_IDENTITY_KEY_FILE", &temp_file);
        }
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let key = store.create_if_missing().expect("创建不应失败");
        let fingerprint = key.fingerprint();
        assert_eq!(store.fingerprint().unwrap_or(None), Some(fingerprint));
        store.delete().expect("删除不应失败");
        assert!(store.load().unwrap_or(None).is_none());
        let _ = std::fs::remove_file(&temp_file);
        unsafe {
            std::env::remove_var("HBUT_IDENTITY_KEY_FILE");
        }
    }

    #[test]
    fn public_jwk_contains_no_private_material() {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let key = store.create_if_missing().expect("创建不应失败");
        let jwk_json = serde_json::to_string(&key.public_jwk()).expect("JWK 序列化不应失败");
        assert!(!jwk_json.contains("\"d\""));
        assert!(!jwk_json.contains("seed"));
        assert!(jwk_json.contains("\"kty\":\"OKP\""));
        assert!(jwk_json.contains("\"crv\":\"Ed25519\""));
        // fingerprint 与 canonical JWK JSON 的 sha256 一致（Node 侧共享契约）
        let expected = {
            let json = format!(
                "{{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"{}\"}}",
                key.public_jwk().x
            );
            let digest = Sha256::digest(json.as_bytes());
            general_purpose::URL_SAFE_NO_PAD.encode(digest)
        };
        assert_eq!(key.fingerprint(), expected);
    }

    #[test]
    fn debug_output_never_leaks_seed() {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let key = store.create_if_missing().expect("创建不应失败");
        let seed = seed_of(&key);
        let debug = format!("{key:?}");
        assert!(!debug.contains(&seed));
        assert!(debug.contains("fingerprint"));
    }

    #[test]
    fn sign_and_verify_roundtrip() {
        let key = DeviceKey::generate();
        let canonical = b"MINI-HBUT-AUTH-V1\nrequest_id=x\n";
        let sig = key.sign(canonical);
        assert!(key.verify(canonical, &sig).is_ok());
        // 篡改任意字节 → 验证失败
        let mut tampered = canonical.to_vec();
        if let Some(last) = tampered.last_mut() {
            *last = b'!';
        }
        assert!(key.verify(&tampered, &sig).is_err());
        // 跨实例验签：公钥 x 恢复验证
        let x = key.public_jwk().x;
        assert!(DeviceKey::verify_with_public_key(&x, canonical, &sig).is_ok());
        let wrong = DeviceKey::generate();
        assert!(wrong.verify(canonical, &sig).is_err());
    }
}
