//! 系统级 Tauri commands：应用退出/外部打开、数据库备份、资源分享（WebDAV）、运行时诊断日志。

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::app_state::AppState;
use crate::runtime_log;

/// 显式备份数据库（#550）：备份到应用数据目录 backup 子目录，保留最近 keep 份。
/// 只备份不恢复、不覆盖正式库；失败时返回错误信息。
#[tauri::command]
pub(crate) async fn backup_database_now(
    app: tauri::AppHandle,
    keep: Option<usize>,
) -> Result<serde_json::Value, String> {
    use crate::db::{backup_database, BACKUP_KEEP_DEFAULT};

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let backup_dir = app_data.join("backup");
    let keep = keep.unwrap_or(BACKUP_KEEP_DEFAULT);
    let report =
        crate::db::run_blocking(move || backup_database(crate::DB_FILENAME, &backup_dir, keep))
            .await?;
    Ok(serde_json::json!({
        "backup_path": report.backup_path.to_string_lossy().to_string(),
        "kept": report.kept,
        "keep_policy": report.keep_policy,
        "pruned": report.pruned.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub(crate) fn exit_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResourceShareNativeRequest {
    endpoint: String,
    path: String,
    username: String,
    password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResourceShareFetchPayloadRequest {
    endpoint: String,
    path: String,
    username: String,
    password: String,
    max_bytes: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResourceShareListDirRequest {
    endpoint: String,
    path: String,
    username: String,
    password: String,
    depth: Option<u8>,
}

#[tauri::command]
pub(crate) fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    open_external_url_impl(&app, &url)
}

pub(crate) fn open_external_url_impl(app: &tauri::AppHandle, url: &str) -> Result<(), String> {
    let mut target = url.trim().to_string();
    if target.is_empty() {
        return Err("url is empty".to_string());
    }

    // 兼容微信小程序口令：#小程序://校园导览/AWm9BvLlALOD9xG
    // 若收到该口令，自动转换为微信深链，提升 iOS/Android 唤起成功率。
    if target.starts_with("#小程序://") || target.starts_with("小程序://") {
        let normalized = target.trim_start_matches('#').to_string();
        if let Some(token) = normalized.rsplit('/').next() {
            if !token.is_empty() {
                target = format!("weixin://dl/business/?t={}", token);
            }
        }
    }

    if !(target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || target.starts_with("tel:")
        || target.starts_with("weixin://")
        || target.starts_with("wechat://")
        || target.starts_with("小程序://")
        || target.starts_with("#小程序://"))
    {
        return Err("unsupported url scheme".to_string());
    }

    #[allow(deprecated)]
    app.shell()
        .open(&target, None)
        .map_err(|e| format!("open external url failed: {}", e))
}

fn normalize_resource_share_path_native(path: &str) -> String {
    let replaced = path.replace('\\', "/");
    let mut normalized = replaced.trim().to_string();
    if normalized.is_empty() {
        return "/".to_string();
    }
    if !normalized.starts_with('/') {
        normalized = format!("/{}", normalized);
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized.len() > 1 {
        normalized = normalized.trim_end_matches('/').to_string();
    }
    if normalized.is_empty() {
        "/".to_string()
    } else {
        normalized
    }
}

fn encode_resource_share_path_native(path: &str) -> String {
    normalize_resource_share_path_native(path)
        .split('/')
        .map(urlencoding::encode)
        .collect::<Vec<_>>()
        .join("/")
}

fn validate_resource_share_request(
    endpoint: &str,
    username: &str,
    password: &str,
) -> Result<String, String> {
    let cleaned = endpoint.trim().trim_end_matches('/').to_string();
    if cleaned.is_empty() || !(cleaned.starts_with("http://") || cleaned.starts_with("https://")) {
        return Err("resource_share endpoint 非法或为空".to_string());
    }
    if username.trim().is_empty() || password.trim().is_empty() {
        return Err("resource_share 缺少账号或密码".to_string());
    }
    Ok(cleaned)
}

fn build_resource_share_auth(username: &str, password: &str) -> String {
    format!(
        "Basic {}",
        general_purpose::STANDARD.encode(format!("{}:{}", username, password).as_bytes())
    )
}

#[tauri::command]
pub(crate) async fn resource_share_direct_url_native(
    req: ResourceShareNativeRequest,
) -> Result<serde_json::Value, String> {
    let endpoint = validate_resource_share_request(&req.endpoint, &req.username, &req.password)?;
    let encoded_path = encode_resource_share_path_native(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = build_resource_share_auth(&req.username, &req.password);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("创建资源直链客户端失败: {}", e))?;

    let head_resp = client
        .head(&remote_url)
        .header("Authorization", auth.clone())
        .send()
        .await
        .map_err(|e| format!("资源直链 HEAD 请求失败: {}", e))?;

    let mut direct_url = String::new();
    let mut need_auth = false;
    let mut status_code = head_resp.status().as_u16();

    if let Some(loc) = head_resp
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
    {
        direct_url = loc.to_string();
    }

    if direct_url.is_empty() {
        let mut probe_error: Option<String> = None;
        match client
            .get(&remote_url)
            .header("Authorization", auth.clone())
            .header("Range", "bytes=0-0")
            .send()
            .await
        {
            Ok(get_resp) => {
                status_code = get_resp.status().as_u16();
                if let Some(loc) = get_resp
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                {
                    direct_url = loc.to_string();
                } else if get_resp.status().is_success() {
                    need_auth = true;
                    direct_url = remote_url.clone();
                }
            }
            Err(e) => {
                probe_error = Some(e.to_string());
            }
        }

        if direct_url.is_empty() && head_resp.status().is_success() {
            status_code = head_resp.status().as_u16();
            need_auth = true;
            direct_url = remote_url.clone();
        }

        if direct_url.is_empty() {
            if let Some(e) = probe_error {
                return Err(format!("资源直链 GET 探测失败: {}", e));
            }
        }
    }

    if direct_url.is_empty() {
        return Err("未获取到可用直链".to_string());
    }

    Ok(serde_json::json!({
        "url": direct_url,
        "status": status_code,
        "needAuth": need_auth
    }))
}

#[tauri::command]
pub(crate) async fn resource_share_fetch_file_payload_native(
    req: ResourceShareFetchPayloadRequest,
) -> Result<serde_json::Value, String> {
    let endpoint = validate_resource_share_request(&req.endpoint, &req.username, &req.password)?;
    let encoded_path = encode_resource_share_path_native(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = build_resource_share_auth(&req.username, &req.password);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建资源下载客户端失败: {}", e))?;

    let response = client
        .get(&remote_url)
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| format!("资源下载请求失败: {}", e))?;

    let status = response.status().as_u16();
    if !(status == 200 || status == 206) {
        return Err(format!("资源下载失败 HTTP {}", status));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取资源字节失败: {}", e))?;

    if let Some(limit) = req.max_bytes {
        if bytes.len() > limit {
            return Err(format!(
                "资源体积超过上限: {} bytes > {} bytes",
                bytes.len(),
                limit
            ));
        }
    }

    Ok(serde_json::json!({
        "status": status,
        "contentType": content_type,
        "size": bytes.len(),
        "base64": general_purpose::STANDARD.encode(bytes),
    }))
}

#[tauri::command]
pub(crate) async fn resource_share_list_dir_native(
    req: ResourceShareListDirRequest,
) -> Result<serde_json::Value, String> {
    let endpoint = validate_resource_share_request(&req.endpoint, &req.username, &req.password)?;
    let encoded_path = encode_resource_share_path_native(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = build_resource_share_auth(&req.username, &req.password);
    let depth = req.depth.unwrap_or(1).to_string();

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("创建目录客户端失败: {}", e))?;

    let method = reqwest::Method::from_bytes(b"PROPFIND")
        .map_err(|e| format!("构造 PROPFIND 方法失败: {}", e))?;
    let body = r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>"#;

    let mut last_error = String::new();
    for with_body in [true, false] {
        let mut builder = client
            .request(method.clone(), &remote_url)
            .header("Authorization", auth.clone())
            .header("Depth", depth.clone())
            .header("Accept", "application/xml,text/xml;q=0.9,*/*;q=0.8");
        if with_body {
            builder = builder
                .header("Content-Type", "application/xml; charset=utf-8")
                .body(body.to_string());
        }

        match builder.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let text = response
                    .text()
                    .await
                    .map_err(|e| format!("读取目录响应失败: {}", e))?;
                if status == 207 || (200..300).contains(&status) {
                    return Ok(serde_json::json!({
                        "status": status,
                        "xml": text
                    }));
                }
                let snippet: String = text.chars().take(240).collect();
                last_error = format!("PROPFIND 失败 HTTP {}: {}", status, snippet);
            }
            Err(e) => {
                last_error = format!("PROPFIND 请求失败: {}", e);
            }
        }
    }

    if last_error.is_empty() {
        last_error = "PROPFIND 失败：未知错误".to_string();
    }
    Err(last_error)
}

#[tauri::command]
pub(crate) fn open_file_with_system(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = path.trim().to_string();
    if target.is_empty() {
        return Err("path is empty".to_string());
    }
    #[allow(deprecated)]
    app.shell()
        .open(&target, None)
        .map_err(|e| format!("open file failed: {}", e))
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn get_runtime_logs(
    limit: Option<u32>,
    since_id: Option<u64>,
    scope: Option<String>,
    level: Option<String>,
    q: Option<String>,
) -> Result<serde_json::Value, String> {
    let logs = runtime_log::query_logs(runtime_log::LogQuery {
        limit: limit.unwrap_or(300) as usize,
        since_id,
        scope_contains: scope,
        level,
        message_contains: q,
    });
    Ok(serde_json::json!({
        "success": true,
        "stats": runtime_log::stats(),
        "logs": logs,
    }))
}

#[tauri::command]
pub(crate) async fn clear_runtime_logs() -> Result<serde_json::Value, String> {
    runtime_log::clear_logs();
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub(crate) async fn push_runtime_log(
    scope: Option<String>,
    message: String,
    level: Option<String>,
    details: Option<serde_json::Value>,
) -> Result<bool, String> {
    let scope = scope.unwrap_or_else(|| "Frontend".into());
    let level = level.unwrap_or_else(|| "info".into());
    if let Some(d) = details {
        runtime_log::log_with_details(&level, scope, message, d);
    } else {
        match level.as_str() {
            "error" => runtime_log::log_error(scope, message),
            "warn" => runtime_log::log_warn(scope, message),
            "debug" => runtime_log::log_debug(scope, message),
            _ => runtime_log::log_info(scope, message),
        }
    }
    Ok(true)
}

#[tauri::command]
pub(crate) async fn get_runtime_diag(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.read().await;
    let sid = client
        .user_info
        .as_ref()
        .map(|u| u.student_id.clone())
        .unwrap_or_default();
    let logged_in = client.is_logged_in;
    let has_user = client.user_info.is_some();
    let cookie_summary = {
        let blob = client.get_cookies();
        let keys: Vec<&str> = ["UID", "_uid", "CASTGC", "JSESSIONID", "fid"]
            .into_iter()
            .filter(|k| blob.contains(&format!("{k}=")))
            .collect();
        serde_json::json!({
            "length": blob.len(),
            "has_keys": keys,
        })
    };
    Ok(serde_json::json!({
        "success": true,
        "student_id": sid,
        "is_logged_in": logged_in,
        "has_user_info": has_user,
        "cookie": cookie_summary,
        "runtime_log": runtime_log::stats(),
        "debug_bridge_tools": true,
        "time": chrono::Local::now().to_rfc3339(),
    }))
}
