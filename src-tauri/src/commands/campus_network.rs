//! 校园网认证 Tauri commands。

use crate::modules::campus_network::{
  login_campus_network, logout_campus_network, probe_network, CampusCarrier,
  CampusNetworkLoginResult, CampusNetworkProbeResult,
};

/// 探测校园网认证状态。
#[tauri::command]
pub async fn campus_network_probe(
  gateway_override: Option<String>,
) -> Result<CampusNetworkProbeResult, String> {
  probe_network(gateway_override.as_deref()).await
}

/// 执行校园网登录。
#[tauri::command]
pub async fn campus_network_login(
  student_id: String,
  password: String,
  carrier: CampusCarrier,
  gateway_override: Option<String>,
  query_string: Option<String>,
) -> Result<CampusNetworkLoginResult, String> {
  Ok(login_campus_network(
    &student_id,
    &password,
    carrier,
    gateway_override.as_deref(),
    query_string.as_deref(),
  )
  .await)
}

/// 执行校园网登出（best-effort）。
#[tauri::command]
pub async fn campus_network_logout(
  student_id: String,
  carrier: CampusCarrier,
  gateway_override: Option<String>,
  client_ip: Option<String>,
) -> Result<String, String> {
  logout_campus_network(
    gateway_override.as_deref(),
    &student_id,
    carrier,
    client_ip.as_deref(),
  )
  .await
}
