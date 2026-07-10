//! Srun xencode（源自 zu1k/srun，GPL-3.0）。

use base64::{
  alphabet::Alphabet,
  engine::{GeneralPurpose, GeneralPurposeConfig},
  Engine,
};
use std::sync::OnceLock;

const BASE64_ALPHABET: &str = "LVoJPiCN2R8G90yg+hmFHuacZ1OWMnrsSTXkYpUq/3dlbfKwv6xztjI7DeBE45QA";

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
  let c: u32 = 0x9e3779b9;
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
    "enc_ver": "srun_bx1",
  })
  .to_string();
  let xen = x_encode(&info, token);
  format!("{{SRBX1}}") + &base64_engine().encode(xen)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn param_i_is_deterministic() {
    let a = param_i("u", "p", "1.2.3.4", 1, "token");
    let b = param_i("u", "p", "1.2.3.4", 1, "token");
    assert_eq!(a, b);
    assert!(a.starts_with("{SRBX1}"));
  }
}
