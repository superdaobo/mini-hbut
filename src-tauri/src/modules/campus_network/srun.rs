//! 深澜 Srun API 登录适配器（逻辑参考 zu1k/srun，GPL-3.0）。

use super::xencode::param_i;
use reqwest::Client;
use serde::Deserialize;
use sha1::{Digest, Sha1};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const PATH_GET_CHALLENGE: &str = "/cgi-bin/get_challenge";
const PATH_PORTAL: &str = "/cgi-bin/srun_portal";

const LOGIN_TIMEOUT: Duration = Duration::from_secs(8);

fn build_client() -> Result<Client, String> {
  Client::builder()
    .redirect(reqwest::redirect::Policy::limited(4))
    .timeout(LOGIN_TIMEOUT)
    .user_agent("Mini-HBUT CampusNetwork/1.0")
    .build()
    .map_err(|e| e.to_string())
}

fn hmac_md5_hex(key: &str, data: &str) -> String {
  const BLOCK: usize = 64;
  let mut key_bytes = key.as_bytes().to_vec();
  if key_bytes.len() > BLOCK {
    key_bytes = md5::compute(&key_bytes).0.to_vec();
  }
  key_bytes.resize(BLOCK, 0);
  let mut ipad = [0x36u8; BLOCK];
  let mut opad = [0x5cu8; BLOCK];
  for (i, byte) in key_bytes.iter().enumerate() {
    ipad[i] ^= byte;
    opad[i] ^= byte;
  }
  let inner = md5::compute([ipad.as_ref(), data.as_bytes()].concat());
  let outer = md5::compute([opad.as_ref(), inner.0.as_ref()].concat());
  outer.0.iter().map(|b| format!("{:02x}", b)).collect()
}

fn unix_second() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0)
    .saturating_sub(2)
}

#[derive(Debug, Default, Deserialize)]
struct ChallengeResponse {
  challenge: Option<String>,
  client_ip: Option<String>,
  online_ip: Option<String>,
  error_msg: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct PortalResponse {
  access_token: Option<String>,
  error_msg: Option<String>,
  suc_msg: Option<String>,
  ecode: Option<serde_json::Value>,
}

fn parse_jsonp(body: &str) -> Result<serde_json::Value, String> {
  let bytes = body.as_bytes();
  if bytes.len() < 6 {
    return Err("Srun 响应过短".to_string());
  }
  let inner = &bytes[4..bytes.len().saturating_sub(1)];
  serde_json::from_slice(inner).map_err(|e| format!("解析 Srun JSONP 失败: {e}"))
}

async fn get_challenge(
  client: &Client,
  auth_server: &str,
  username: &str,
  client_ip: &str,
) -> Result<ChallengeResponse, String> {
  let time = unix_second().to_string();
  let url = format!("{auth_server}{PATH_GET_CHALLENGE}");
  let resp = client
    .get(&url)
    .query(&[
      ("callback", "sdu"),
      ("username", username),
      ("ip", client_ip),
      ("_", time.as_str()),
    ])
    .send()
    .await
    .map_err(|e| format!("get_challenge 请求失败: {e}"))?;
  let body = resp.text().await.map_err(|e| e.to_string())?;
  let value = parse_jsonp(&body)?;
  serde_json::from_value(value).map_err(|e| format!("解析 challenge 失败: {e}"))
}

/// 执行 Srun 登录。
pub async fn srun_login(
  auth_server: &str,
  username: &str,
  password: &str,
  client_ip_hint: Option<&str>,
  acid: i32,
) -> Result<(bool, String), String> {
  let auth_server = auth_server.trim().trim_end_matches('/');
  if auth_server.is_empty() {
    return Err("Srun 网关无效".to_string());
  }

  let client = build_client()?;
  let ip_hint = client_ip_hint.unwrap_or("0.0.0.0");

  let challenge = get_challenge(&client, auth_server, username, ip_hint).await?;
  let token = challenge
    .challenge
    .filter(|s| !s.is_empty())
    .ok_or_else(|| challenge.error_msg.unwrap_or_else(|| "未获取 challenge token".to_string()))?;

  let client_ip = challenge
    .online_ip
    .or(challenge.client_ip)
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| ip_hint.to_string());

  let hmd5 = hmac_md5_hex(&token, password);

  let info = param_i(username, password, &client_ip, acid, &token);
  let n = "200";
  let utype = "1";
  let check_sum_src = [
    "",
    username,
    &hmd5,
    &acid.to_string(),
    &client_ip,
    n,
    utype,
    &info,
  ]
  .join(&token);
  let mut sha1_hasher = Sha1::new();
  sha1_hasher.update(check_sum_src.as_bytes());
  let chksum = format!("{:x}", sha1_hasher.finalize());

  let time = unix_second().to_string();
  let password_param = format!("{{MD5}}{hmd5}");
  let url = format!("{auth_server}{PATH_PORTAL}");
  let resp = client
    .get(&url)
    .query(&[
      ("callback", "sdu"),
      ("action", "login"),
      ("username", username),
      ("password", password_param.as_str()),
      ("ip", client_ip.as_str()),
      ("ac_id", acid.to_string().as_str()),
      ("n", n),
      ("type", utype),
      ("os", "Windows 10"),
      ("name", "Windows"),
      ("double_stack", "0"),
      ("info", info.as_str()),
      ("chksum", chksum.as_str()),
      ("_", time.as_str()),
    ])
    .send()
    .await
    .map_err(|e| format!("srun_portal 请求失败: {e}"))?;

  let body = resp.text().await.map_err(|e| e.to_string())?;
  let value = parse_jsonp(&body)?;
  let portal: PortalResponse = serde_json::from_value(value).map_err(|e| e.to_string())?;

  let success = portal
    .access_token
    .as_ref()
    .is_some_and(|s| !s.is_empty());
  let message = portal
    .suc_msg
    .or(portal.error_msg)
    .unwrap_or_else(|| if success { "Srun 登录成功".to_string() } else { "Srun 登录失败".to_string() });

  Ok((success, message))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_jsonp_wrapper() {
    let body = r#"sdu({"challenge":"abc","client_ip":"1.1.1.1"})"#;
    let value = parse_jsonp(body).unwrap();
    assert_eq!(value.get("challenge").and_then(|v| v.as_str()), Some("abc"));
  }
}
