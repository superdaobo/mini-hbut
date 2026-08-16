//! 版本化敏感字段加密信封。
//!
//! 格式：PREFIX + base64(version | iv | ciphertext_len | ciphertext | hmac_sha256)。
//! 主密钥必须由系统密钥环或调用方提供，模块中不包含硬编码密钥。

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};
use thiserror::Error;

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

pub const SECRET_ENVELOPE_PREFIX: &str = "mhbsec:v1:";
const VERSION: u8 = 1;
const IV_LEN: usize = 16;
const TAG_LEN: usize = 32;
const HEADER_LEN: usize = 1 + IV_LEN + 4;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SecretEnvelopeError {
    #[error("敏感数据主密钥长度不足")]
    InvalidKey,
    #[error("敏感数据格式无效")]
    InvalidFormat,
    #[error("敏感数据完整性校验失败")]
    Integrity,
    #[error("敏感数据解密失败")]
    Decrypt,
    #[error("敏感数据不是 UTF-8")]
    Utf8,
}

fn derive_key(master_key: &[u8], label: &[u8]) -> Result<[u8; 32], SecretEnvelopeError> {
    if master_key.len() < 16 {
        return Err(SecretEnvelopeError::InvalidKey);
    }
    let mut digest = Sha256::new();
    digest.update(b"mini-hbut-secret-envelope-v1");
    digest.update(label);
    digest.update(master_key);
    Ok(digest.finalize().into())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut normalized = [0u8; BLOCK];
    if key.len() > BLOCK {
        let hashed = Sha256::digest(key);
        normalized[..32].copy_from_slice(&hashed);
    } else {
        normalized[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for index in 0..BLOCK {
        ipad[index] ^= normalized[index];
        opad[index] ^= normalized[index];
    }

    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(data);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_hash);
    outer.finalize().into()
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

pub fn is_encrypted_secret(value: &str) -> bool {
    value.starts_with(SECRET_ENVELOPE_PREFIX)
}

pub fn encrypt_bytes(master_key: &[u8], plaintext: &[u8]) -> Result<String, SecretEnvelopeError> {
    let encryption_key = derive_key(master_key, b"encryption")?;
    let authentication_key = derive_key(master_key, b"authentication")?;
    let mut iv = [0u8; IV_LEN];
    rand::thread_rng().fill_bytes(&mut iv);

    let mut buffer = plaintext.to_vec();
    buffer.resize(plaintext.len() + IV_LEN, 0);
    let ciphertext = Aes256CbcEnc::new((&encryption_key).into(), (&iv).into())
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, plaintext.len())
        .map_err(|_| SecretEnvelopeError::InvalidFormat)?
        .to_vec();

    let length = u32::try_from(ciphertext.len()).map_err(|_| SecretEnvelopeError::InvalidFormat)?;
    let mut payload = Vec::with_capacity(HEADER_LEN + ciphertext.len() + TAG_LEN);
    payload.push(VERSION);
    payload.extend_from_slice(&iv);
    payload.extend_from_slice(&length.to_be_bytes());
    payload.extend_from_slice(&ciphertext);
    let tag = hmac_sha256(&authentication_key, &payload);
    payload.extend_from_slice(&tag);

    Ok(format!(
        "{}{}",
        SECRET_ENVELOPE_PREFIX,
        general_purpose::STANDARD.encode(payload)
    ))
}

pub fn decrypt_bytes(master_key: &[u8], envelope: &str) -> Result<Vec<u8>, SecretEnvelopeError> {
    let encoded = envelope
        .strip_prefix(SECRET_ENVELOPE_PREFIX)
        .ok_or(SecretEnvelopeError::InvalidFormat)?;
    let payload = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| SecretEnvelopeError::InvalidFormat)?;
    if payload.len() < HEADER_LEN + TAG_LEN || payload[0] != VERSION {
        return Err(SecretEnvelopeError::InvalidFormat);
    }

    let iv: [u8; IV_LEN] = payload[1..1 + IV_LEN]
        .try_into()
        .map_err(|_| SecretEnvelopeError::InvalidFormat)?;
    let length = u32::from_be_bytes(
        payload[1 + IV_LEN..HEADER_LEN]
            .try_into()
            .map_err(|_| SecretEnvelopeError::InvalidFormat)?,
    ) as usize;
    let ciphertext_end = HEADER_LEN
        .checked_add(length)
        .ok_or(SecretEnvelopeError::InvalidFormat)?;
    if ciphertext_end + TAG_LEN != payload.len() {
        return Err(SecretEnvelopeError::InvalidFormat);
    }

    let authentication_key = derive_key(master_key, b"authentication")?;
    let expected = hmac_sha256(&authentication_key, &payload[..ciphertext_end]);
    if !constant_time_eq(&expected, &payload[ciphertext_end..]) {
        return Err(SecretEnvelopeError::Integrity);
    }

    let encryption_key = derive_key(master_key, b"encryption")?;
    let mut ciphertext = payload[HEADER_LEN..ciphertext_end].to_vec();
    Aes256CbcDec::new((&encryption_key).into(), (&iv).into())
        .decrypt_padded_mut::<Pkcs7>(&mut ciphertext)
        .map(|plain| plain.to_vec())
        .map_err(|_| SecretEnvelopeError::Decrypt)
}

pub fn encrypt_string(master_key: &[u8], plaintext: &str) -> Result<String, SecretEnvelopeError> {
    encrypt_bytes(master_key, plaintext.as_bytes())
}

pub fn decrypt_string(master_key: &[u8], envelope: &str) -> Result<String, SecretEnvelopeError> {
    String::from_utf8(decrypt_bytes(master_key, envelope)?).map_err(|_| SecretEnvelopeError::Utf8)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; 32] {
        Sha256::digest(b"phase4 synthetic test key").into()
    }

    #[test]
    fn roundtrip_and_random_iv() {
        let first = encrypt_string(&key(), "cookie=value; token=abc").expect("encrypt");
        let second = encrypt_string(&key(), "cookie=value; token=abc").expect("encrypt");
        assert_ne!(first, second);
        assert_eq!(
            decrypt_string(&key(), &first).expect("decrypt"),
            "cookie=value; token=abc"
        );
    }

    #[test]
    fn rejects_tampered_payload() {
        let encrypted = encrypt_string(&key(), "secret").expect("encrypt");
        let mut bytes = encrypted.into_bytes();
        let last = bytes.len() - 2;
        bytes[last] = if bytes[last] == b'A' { b'B' } else { b'A' };
        let tampered = String::from_utf8(bytes).expect("utf8");
        assert!(matches!(
            decrypt_string(&key(), &tampered),
            Err(SecretEnvelopeError::Integrity | SecretEnvelopeError::InvalidFormat)
        ));
    }

    #[test]
    fn rejects_wrong_key() {
        let encrypted = encrypt_string(&key(), "secret").expect("encrypt");
        let other: [u8; 32] = Sha256::digest(b"other key").into();
        assert_eq!(
            decrypt_string(&other, &encrypted),
            Err(SecretEnvelopeError::Integrity)
        );
    }
}
