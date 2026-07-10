//! 校园网 captive / 连通性探测。

use super::types::{
  CampusNetworkProbeResult, CampusNetworkStatus, DEFAULT_GATEWAYS, MSFT_CONNECT_TEST, PROBE_URL,
};
use reqwest::Client;
use std::time::Duration;

const PROBE_TIMEOUT: Duration = Duration::from_secs(4);

/// 构建短超时、允许重定向的 HTTP 客户端。
pub fn build_probe_client() -> Result<Client, String> {
  Client::builder()
    .redirect(reqwest::redirect::Policy::limited(8))
    .timeout(PROBE_TIMEOUT)
    .user_agent("Mini-HBUT CampusNetwork/1.0")
    .build()
    .map_err(|e| e.to_string())
}

/// 从 URL 或文本中提取 eportal query（含 wlanuserip）。
pub fn extract_query_string(raw: &str) -> Option<String> {
  let text = raw.trim();
  if text.is_empty() {
    return None;
  }

  let query = if let Some(idx) = text.find('?') {
    text[idx + 1..].to_string()
  } else if text.contains("wlanuserip=") {
    text.to_string()
  } else {
    return None;
  };

  if query.contains("wlanuserip=") {
    Some(query)
  } else {
    None
  }
}

/// 从 query 中解析客户端 IP。
pub fn extract_client_ip(query: &str) -> Option<String> {
  for part in query.split('&') {
    if let Some(value) = part.strip_prefix("wlanuserip=") {
      let ip = value.trim();
      if !ip.is_empty() {
        return Some(ip.to_string());
      }
    }
  }
  None
}

/// 从响应 final URL 推断网关根地址。
pub fn gateway_from_url(url: &str) -> Option<String> {
  let parsed = url::Url::parse(url).ok()?;
  let host = parsed.host_str()?;
  let scheme = parsed.scheme();
  Some(format!("{scheme}://{host}"))
}

async fn msft_connect_test_ok(client: &Client) -> bool {
  let Ok(resp) = client.get(MSFT_CONNECT_TEST).send().await else {
    return false;
  };
  let Ok(body) = resp.text().await else {
    return false;
  };
  body.contains("Microsoft Connect Test") || body.contains("Microsoft NCSI")
}

/// 访问历史探测地址，解析 captive 重定向。
async fn probe_captive_redirect(client: &Client) -> Option<(String, String, Option<String>)> {
  let resp = client.get(PROBE_URL).send().await.ok()?;
  let final_url = resp.url().to_string();
  let body = resp.text().await.unwrap_or_default();

  if let Some(query) = extract_query_string(&final_url) {
    let gateway = gateway_from_url(&final_url)?;
    let ip = extract_client_ip(&query);
    return Some((gateway, query, ip));
  }

  if let Some(query) = extract_query_string(&body) {
    let gateway = gateway_from_url(&final_url).or_else(|| DEFAULT_GATEWAYS.first().map(|s| (*s).to_string()))?;
    let ip = extract_client_ip(&query);
    return Some((gateway, query, ip));
  }

  None
}

/// 对已认证网络做快速校验。
pub async fn probe_network(gateway_override: Option<&str>) -> Result<CampusNetworkProbeResult, String> {
  let client = build_probe_client()?;

  if msft_connect_test_ok(&client).await {
    return Ok(CampusNetworkProbeResult {
      status: CampusNetworkStatus::Authenticated,
      gateway: gateway_override.map(str::to_string),
      query_string: None,
      client_ip: None,
      message: Some("连通性探测正常".to_string()),
    });
  }

  if let Some((gateway, query, ip)) = probe_captive_redirect(&client).await {
    return Ok(CampusNetworkProbeResult {
      status: CampusNetworkStatus::NeedsAuth,
      gateway: Some(gateway_override.map(str::to_string).unwrap_or(gateway)),
      query_string: Some(query),
      client_ip: ip,
      message: Some("检测到校园网认证页".to_string()),
    });
  }

  if let Some(override_gw) = gateway_override.filter(|s| !s.trim().is_empty()) {
    let index_url = format!("{}/eportal/index.jsp", override_gw.trim_end_matches('/'));
    if let Ok(resp) = client.get(&index_url).send().await {
      let final_url = resp.url().to_string();
      if let Some(query) = extract_query_string(&final_url) {
        return Ok(CampusNetworkProbeResult {
          status: CampusNetworkStatus::NeedsAuth,
          gateway: Some(override_gw.to_string()),
          query_string: Some(query.clone()),
          client_ip: extract_client_ip(&query),
          message: Some("自定义网关返回认证页".to_string()),
        });
      }
    }
  }

  Ok(CampusNetworkProbeResult {
    status: CampusNetworkStatus::Unknown,
    gateway: None,
    query_string: None,
    client_ip: None,
    message: Some("未检测到 captive 页，可能已认证或不在校园网".to_string()),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn extracts_query_from_captive_url() {
    let url = "http://172.16.54.18/eportal/index.jsp?wlanuserip=10.9.188.79&wlanacname=logic";
    let query = extract_query_string(url).unwrap();
    assert!(query.contains("wlanuserip=10.9.188.79"));
    assert_eq!(extract_client_ip(&query).as_deref(), Some("10.9.188.79"));
  }

  #[test]
  fn gateway_from_captive_url() {
    let gw = gateway_from_url("http://172.16.54.18/eportal/index.jsp?wlanuserip=1").unwrap();
    assert_eq!(gw, "http://172.16.54.18");
  }
}
