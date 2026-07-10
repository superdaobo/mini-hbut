//! eportal `InterFace.do` 登录适配器。

use reqwest::Client;
use std::time::Duration;

const LOGIN_TIMEOUT: Duration = Duration::from_secs(8);

fn build_client() -> Result<Client, String> {
  Client::builder()
    .cookie_store(true)
    .redirect(reqwest::redirect::Policy::limited(6))
    .timeout(LOGIN_TIMEOUT)
    .user_agent("Mini-HBUT CampusNetwork/1.0")
    .build()
    .map_err(|e| e.to_string())
}

fn parse_login_message(body: &str) -> (bool, String) {
  let trimmed = body.trim();
  if trimmed.is_empty() {
    return (false, "认证服务器返回空响应".to_string());
  }

  if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
    let result = json
      .get("result")
      .or_else(|| json.get("Result"))
      .and_then(|v| v.as_str().or_else(|| v.as_i64().map(|_| "1")))
      .unwrap_or("");
    let message = json
      .get("message")
      .or_else(|| json.get("msg"))
      .and_then(|v| v.as_str())
      .unwrap_or(trimmed);
    let success = matches!(result, "success" | "1" | "ok") || json.get("success").and_then(|v| v.as_bool()) == Some(true);
    return (success, message.to_string());
  }

  let lower = trimmed.to_lowercase();
  if lower.contains("success") || lower.contains("成功") {
    return (true, trimmed.to_string());
  }
  (false, trimmed.to_string())
}

/// 执行 eportal 登录。
pub async fn eportal_login(
  gateway: &str,
  query_string: &str,
  user_id: &str,
  password: &str,
  service: &str,
) -> Result<(bool, String), String> {
  let gateway = gateway.trim().trim_end_matches('/');
  let query = query_string.trim().trim_start_matches('?');
  if gateway.is_empty() || query.is_empty() {
    return Err("网关或 queryString 无效".to_string());
  }
  if user_id.trim().is_empty() || password.is_empty() {
    return Err("学号或密码不能为空".to_string());
  }

  let client = build_client()?;
  let index_url = format!("{gateway}/eportal/index.jsp?{query}");
  client
    .get(&index_url)
    .send()
    .await
    .map_err(|e| format!("打开认证页失败: {e}"))?;

  let login_url = format!("{gateway}/eportal/InterFace.do?method=login");
  let resp = client
    .post(&login_url)
    .form(&[
      ("userId", user_id.trim()),
      ("password", password),
      ("service", service),
      ("queryString", query),
      ("passwordEncrypt", "false"),
    ])
    .send()
    .await
    .map_err(|e| format!("提交认证失败: {e}"))?;

  let body = resp.text().await.map_err(|e| e.to_string())?;
  let (success, message) = parse_login_message(&body);
  Ok((success, message))
}

#[cfg(test)]
mod tests {
  use super::*;
  use wiremock::matchers::{method, path};
  use wiremock::{Mock, MockServer, ResponseTemplate};

  #[test]
  fn parses_success_json() {
    let (ok, msg) = parse_login_message(r#"{"result":"success","message":"ok"}"#);
    assert!(ok);
    assert_eq!(msg, "ok");
  }

  #[test]
  fn parses_failure_json() {
    let (ok, _) = parse_login_message(r#"{"result":"fail","message":"密码错误"}"#);
    assert!(!ok);
  }

  #[tokio::test]
  async fn eportal_login_mock_contract() {
    let server = MockServer::start().await;
    let gateway = server.uri();
    let query = "wlanuserip=10.0.0.2&wlanacname=logic";

    Mock::given(method("GET"))
      .and(path("/eportal/index.jsp"))
      .respond_with(ResponseTemplate::new(200).set_body_string("ok"))
      .mount(&server)
      .await;

    Mock::given(method("POST"))
      .and(path("/eportal/InterFace.do"))
      .respond_with(
        ResponseTemplate::new(200).set_body_string(r#"{"result":"success","message":"dr1004"}"#),
      )
      .mount(&server)
      .await;

    let (ok, message) = eportal_login(&gateway, query, "2024123456", "secret", "default")
      .await
      .expect("mock login");
    assert!(ok);
    assert_eq!(message, "dr1004");
  }
}
