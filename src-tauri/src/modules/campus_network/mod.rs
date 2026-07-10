//! 湖工大 iHBUT 校园网认证（eportal + Srun 双适配）。

mod eportal;
mod probe;
mod srun;
mod types;
mod xencode;

pub use probe::{build_probe_client, extract_client_ip, extract_query_string, probe_network};
pub use types::{
  CampusCarrier, CampusNetworkLoginResult, CampusNetworkProbeResult, CampusNetworkStatus,
  DEFAULT_GATEWAYS,
};

use eportal::eportal_login;
use reqwest::Client;
use srun::srun_login;
use std::time::Duration;

const LOGIN_TIMEOUT: Duration = Duration::from_secs(12);

fn gateway_list(override_gw: Option<&str>) -> Vec<String> {
  if let Some(gw) = override_gw.filter(|s| !s.trim().is_empty()) {
    let mut list = vec![gw.trim().trim_end_matches('/').to_string()];
    for item in DEFAULT_GATEWAYS {
      let normalized = (*item).trim_end_matches('/').to_string();
      if !list.iter().any(|v| v == &normalized) {
        list.push(normalized);
      }
    }
    list
  } else {
    DEFAULT_GATEWAYS.iter().map(|s| (*s).to_string()).collect()
  }
}

/// 综合登录：优先 eportal，失败后 fallback Srun。
pub async fn login_campus_network(
  student_id: &str,
  password: &str,
  carrier: CampusCarrier,
  gateway_override: Option<&str>,
  query_string: Option<&str>,
) -> CampusNetworkLoginResult {
  let gateways = gateway_list(gateway_override);
  let mut query = query_string.map(str::to_string);
  let mut client_ip = query.as_ref().and_then(|q| extract_client_ip(q));
  let mut preferred_gateway = gateway_override.map(str::to_string);

  if query.is_none() {
    if let Ok(probe) = probe_network(gateway_override).await {
      if probe.status == CampusNetworkStatus::NeedsAuth {
        query = probe.query_string;
        client_ip = probe.client_ip.or(client_ip);
        preferred_gateway = probe.gateway.or(preferred_gateway);
      } else if probe.status == CampusNetworkStatus::Authenticated {
        return CampusNetworkLoginResult {
          success: true,
          message: "当前网络已认证，无需重复登录".to_string(),
          adapter_used: None,
        };
      }
    }
  }

  let service = carrier.eportal_service();
  let srun_username = carrier.srun_username(student_id);

  if let Some(ref q) = query {
    let eportal_gateways: Vec<String> = preferred_gateway
      .clone()
      .into_iter()
      .chain(gateways.clone())
      .collect();
    let mut seen = std::collections::HashSet::new();
    for gw in eportal_gateways {
      if !seen.insert(gw.clone()) {
        continue;
      }
      match eportal_login(&gw, q, student_id, password, service).await {
        Ok((true, message)) => {
          return CampusNetworkLoginResult {
            success: true,
            message,
            adapter_used: Some(format!("eportal:{gw}")),
          };
        }
        Ok((false, message)) => {
          if preferred_gateway.as_deref() == Some(gw.as_str()) {
            // 记录首选网关失败原因，继续尝试 Srun
            let _ = message;
          }
        }
        Err(_) => continue,
      }
    }
  }

  for gw in gateways {
    for acid in [1_i32, 12_i32] {
      match srun_login(
        &gw,
        &srun_username,
        password,
        client_ip.as_deref(),
        acid,
      )
      .await
      {
        Ok((true, message)) => {
          return CampusNetworkLoginResult {
            success: true,
            message,
            adapter_used: Some(format!("srun:{gw}:ac{acid}")),
          };
        }
        Ok((false, _)) => continue,
        Err(_) => continue,
      }
    }
  }

  CampusNetworkLoginResult {
    success: false,
    message: "所有网关认证均失败，请检查账号密码或在校内网络重试".to_string(),
    adapter_used: None,
  }
}

/// 登出（best-effort Srun logout）。
pub async fn logout_campus_network(
  gateway_override: Option<&str>,
  student_id: &str,
  carrier: CampusCarrier,
  client_ip: Option<&str>,
) -> Result<String, String> {
  let gateways = gateway_list(gateway_override);
  let username = carrier.srun_username(student_id);
  let client = Client::builder()
    .timeout(LOGIN_TIMEOUT)
    .build()
    .map_err(|e| e.to_string())?;

  for gw in gateways {
    let time = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| d.as_secs())
      .unwrap_or(0)
      .to_string();
    let url = format!("{gw}/cgi-bin/srun_portal");
    if client
      .get(&url)
      .query(&[
        ("callback", "sdu"),
        ("action", "logout"),
        ("username", username.as_str()),
        ("ip", client_ip.unwrap_or("0.0.0.0")),
        ("ac_id", "1"),
        ("_", time.as_str()),
      ])
      .send()
      .await
      .is_ok()
    {
      return Ok(format!("已向 {gw} 发送登出请求"));
    }
  }
  Err("登出请求失败".to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn gateway_list_prefers_override() {
    let list = gateway_list(Some("http://172.16.54.18"));
    assert_eq!(list.first().map(String::as_str), Some("http://172.16.54.18"));
    assert!(list.len() > 1);
  }
}
