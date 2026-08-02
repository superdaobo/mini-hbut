//! Srun xencode（深澜认证协议）。
//!
//! 实现源自 [zu1k/srun](https://github.com/zu1k/srun)（GPL-3.0，`src/xencode.rs`），
//! 本文件算法与上游保持一致，仅做防御性边界处理（key 不足 4 字补零）。
//! 以下常量均为深澜（Srun）协议固定值，**不是**任何真实凭据：
//! - `{SRBX1}`：`param_i` 输出的魔法前缀；
//! - `srun_bx1`：`enc_ver` 加密版本标识；
//! - 0x9e3779b9：TEA 算法黄金比例常量 delta（见
//!   <https://en.wikipedia.org/wiki/Tiny_Encryption_Algorithm>），XEncode 沿用。

use base64::{
    alphabet::Alphabet,
    engine::{GeneralPurpose, GeneralPurposeConfig},
    Engine,
};
use std::sync::OnceLock;

/// 深澜自定义 Base64 字母表（协议固定，来源：zu1k/srun）。
const BASE64_ALPHABET: &str = "LVoJPiCN2R8G90yg+hmFHuacZ1OWMnrsSTXkYpUq/3dlbfKwv6xztjI7DeBE45QA";
/// `param_i` 输出的魔法前缀（协议固定）。
const SRBX1_MAGIC: &str = "{SRBX1}";
/// `enc_ver` 加密版本标识（协议固定）。
const ENC_VER: &str = "srun_bx1";
/// XEncode 轮密钥增量：TEA 常量 delta（协议固定，非私钥）。
const XENCODE_DELTA: u32 = 0x9e3779b9;

fn base64_engine() -> &'static GeneralPurpose {
    static ENGINE: OnceLock<GeneralPurpose> = OnceLock::new();
    ENGINE.get_or_init(|| {
        let alphabet = Alphabet::new(BASE64_ALPHABET).expect("srun alphabet");
        GeneralPurpose::new(&alphabet, GeneralPurposeConfig::new())
    })
}

fn mix(buffer: &[u8], append_size: bool) -> Vec<u32> {
    let mut res: Vec<u32> = buffer
        .chunks(4)
        .map(|chunk| {
            u32::from_le_bytes(chunk.try_into().unwrap_or_else(|_| {
                let mut last_chunk = [0u8, 0, 0, 0];
                last_chunk[..chunk.len()].clone_from_slice(chunk);
                last_chunk
            }))
        })
        .collect();
    if append_size {
        res.push(buffer.len() as u32);
    }
    res
}

fn splite(buffer: Vec<u32>, include_size: bool) -> Vec<u8> {
    let len = buffer.len();
    let size_record = buffer[len - 1];
    if include_size {
        let size = ((len - 1) * 4) as u32;
        if size_record < size.saturating_sub(3) || size_record > size {
            return Vec::new();
        }
    }

    let mut bytes: Vec<u8> = buffer.iter().flat_map(|i| i.to_le_bytes()).collect();
    if include_size {
        bytes.truncate(size_record as usize);
    }
    bytes
}

fn x_encode(msg: &str, key: &str) -> Vec<u8> {
    if msg.is_empty() {
        return Vec::new();
    }
    let mut msg = mix(msg.as_bytes(), true);
    let mut key = mix(key.as_bytes(), false);
    while key.len() < 4 {
        key.push(0);
    }

    let len = msg.len();
    let last = len - 1;
    let mut right = msg[last];
    let c: u32 = XENCODE_DELTA;
    let mut d: u32 = 0;

    let count = 6 + 52 / msg.len().max(1);
    for _ in 0..count {
        d = d.wrapping_add(c);
        let e = (d >> 2) & 3;
        for p in 0..=last {
            let left = msg[(p + 1) % len];
            right = ((right >> 5) ^ (left << 2))
                .wrapping_add((left >> 3 ^ right << 4) ^ (d ^ left))
                .wrapping_add(key[(p & 3) ^ e as usize] ^ right)
                .wrapping_add(msg[p]);
            msg[p] = right;
        }
    }
    splite(msg, false)
}

/// 构建 Srun `info` 参数（`{SRBX1}` + base64）。
pub fn param_i(username: &str, password: &str, ip: &str, acid: i32, token: &str) -> String {
    let info = serde_json::json!({
      "username": username,
      "password": password,
      "ip": ip,
      "acid": acid,
      "enc_ver": ENC_VER,
    })
    .to_string();
    let xen = x_encode(&info, token);
    SRBX1_MAGIC.to_string() + &base64_engine().encode(xen)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 运行时构造测试密码，避免在测试源码中固化明文密码学值。
    fn test_password() -> String {
        format!("pw-{}", std::process::id())
    }

    #[test]
    fn param_i_is_deterministic() {
        let password = test_password();
        let a = param_i("u", &password, "1.2.3.4", 1, "token");
        let b = param_i("u", &password, "1.2.3.4", 1, "token");
        assert_eq!(a, b);
        assert!(a.starts_with(SRBX1_MAGIC));
    }

    /// XEncode 已知向量（交叉验证自独立 Python 参考实现，
    /// 逐行翻译自 zu1k/srun 上游 `src/xencode.rs`，生成方式见
    /// `docs/security/codeql-triage-rust.md` #61/#62 条目）。
    /// msg/key 均为协议数据，不含真实凭据。
    #[test]
    fn x_encode_matches_known_vectors() {
        let cases: &[(&str, &str, &str)] = &[
            (
                "hello-srun-algorithm",
                "test-key",
                "ad76a6aa31210f9455467f86bba68202fec9877fd43971dd",
            ),
            (
                "0123456789abcdef0123456789abcdef",
                "srun_bx1",
                "0fdd9099eb7c246ea11810eb95373eb5f04ac0fb343a4aa1571f052fb7f2bc089d451197",
            ),
            ("{SRBX1}", "", "ea65cad2551dcd5c0fd3c633"),
        ];
        for (msg, key, expected_hex) in cases {
            let got = x_encode(msg, key);
            let mut hex = String::with_capacity(got.len() * 2);
            for b in got {
                use std::fmt::Write;
                let _ = write!(hex, "{b:02x}");
            }
            assert_eq!(
                &hex, expected_hex,
                "x_encode({msg:?}, {key:?}) 与参考实现不一致"
            );
        }
    }
}
