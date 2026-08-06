//! 运行配置类 Tauri commands：OCR 运行时配置、远程 JSON、临时上传端点。

use std::sync::{Mutex as StdMutex, OnceLock};
use tauri::State;

use crate::app_state::AppState;
use crate::modules;

pub(crate) const DEFAULT_TEMP_UPLOAD_ENDPOINT: &str =
    "https://mini-hbut-testocr1.hf.space/api/temp/upload";

static TEMP_UPLOAD_ENDPOINT: OnceLock<StdMutex<Option<String>>> = OnceLock::new();

fn temp_upload_endpoint_store() -> &'static StdMutex<Option<String>> {
    TEMP_UPLOAD_ENDPOINT.get_or_init(|| StdMutex::new(None))
}

fn normalize_upload_endpoint(input: Option<String>) -> Option<String> {
    input.and_then(|v| {
        let s = v.trim();
        if s.is_empty() {
            None
        } else {
            Some(s.to_string())
        }
    })
}

fn set_temp_upload_endpoint_config(endpoint: Option<String>) -> Result<(), String> {
    let mut guard = temp_upload_endpoint_store()
        .lock()
        .map_err(|e| format!("lock temp upload endpoint failed: {}", e))?;
    *guard = normalize_upload_endpoint(endpoint);
    Ok(())
}

pub(crate) fn get_temp_upload_endpoint_config() -> Option<String> {
    temp_upload_endpoint_store()
        .lock()
        .ok()
        .and_then(|v| v.clone())
}

#[tauri::command]
pub(crate) async fn set_ocr_endpoint(
    state: State<'_, AppState>,
    endpoint: String,
) -> Result<(), String> {
    let mut client = state.client.write().await;
    client.set_ocr_endpoint(endpoint);
    Ok(())
}

#[tauri::command]
pub(crate) async fn set_ocr_runtime_config(
    state: State<'_, AppState>,
    endpoints: Option<Vec<String>>,
    local_fallback_endpoints: Option<Vec<String>>,
) -> Result<(), String> {
    let mut client = state.client.write().await;
    client.set_ocr_runtime_config(
        endpoints.unwrap_or_default(),
        local_fallback_endpoints.unwrap_or_default(),
    );
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_ocr_runtime_status(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    Ok(client.get_ocr_runtime_status())
}

#[tauri::command]
pub(crate) async fn fetch_remote_config(
    state: State<'_, AppState>,
    url: String,
) -> Result<serde_json::Value, String> {
    let parsed = fetch_remote_json(url.clone()).await?;

    let ocr = parsed.get("ocr").cloned().unwrap_or_default();
    let ocr_enabled = ocr.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);

    let mut remote_endpoints = Vec::new();
    if ocr_enabled {
        if let Some(arr) = ocr.get("endpoints").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(text) = item.as_str() {
                    remote_endpoints.push(text.to_string());
                }
            }
        }
        if let Some(single) = ocr
            .get("endpoint")
            .and_then(|v| v.as_str())
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
        {
            remote_endpoints.push(single.to_string());
        }
    }

    let mut local_fallback_endpoints = Vec::new();
    if let Some(arr) = ocr
        .get("local_fallback_endpoints")
        .and_then(|v| v.as_array())
    {
        for item in arr {
            if let Some(text) = item.as_str() {
                local_fallback_endpoints.push(text.to_string());
            }
        }
    }
    if let Some(arr) = ocr.get("localFallbackEndpoints").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(text) = item.as_str() {
                local_fallback_endpoints.push(text.to_string());
            }
        }
    }

    {
        let mut hbut = state.client.write().await;
        hbut.set_ocr_runtime_config(remote_endpoints.clone(), local_fallback_endpoints.clone());
    }

    // 提取 temp_upload 端点配置
    let temp_upload = parsed
        .get("temp_upload")
        .or_else(|| parsed.get("tempUpload"));
    if let Some(ep) = temp_upload
        .and_then(|v| v.get("endpoint").or_else(|| v.get("url")))
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        let _ = set_temp_upload_endpoint_config(Some(ep.to_string()));
        println!("[Config] apply temp_upload endpoint: {}", ep);
    }

    // 提取 cloud_sync.proxy_endpoint（已在前端消费，此处仅日志确认）
    if let Some(proxy) = parsed
        .get("cloud_sync")
        .and_then(|v| v.get("proxy_endpoint").or_else(|| v.get("proxyEndpoint")))
        .and_then(|v| v.as_str())
    {
        println!("[Config] cloud_sync proxy_endpoint: {}", proxy);
    }

    println!(
        "[Config] apply OCR runtime config: enabled={}, remote_endpoints={}, local_fallback_endpoints={}",
        ocr_enabled,
        remote_endpoints.len(),
        local_fallback_endpoints.len(),
    );

    Ok(parsed)
}

#[tauri::command]
pub(crate) async fn fetch_remote_json(url: String) -> Result<serde_json::Value, String> {
    if let Some(local_file) = modules::module_bundle::resolve_local_dev_module_file_from_url(&url) {
        let text = tokio::fs::read_to_string(&local_file)
            .await
            .map_err(|e| format!("读取本地模块 JSON 失败: {} ({})", e, local_file.display()))?;
        return serde_json::from_str(&text)
            .map_err(|e| format!("解析本地模块 JSON 失败: {} ({})", e, local_file.display()));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建远程 JSON 客户端失败: {}", e))?;

    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求远程 JSON 失败: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取远程 JSON 响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("远程 JSON 请求失败: {}", status));
    }

    serde_json::from_str(&text).map_err(|e| format!("解析远程 JSON 失败: {}", e))
}

#[tauri::command]
pub(crate) fn set_temp_upload_endpoint(endpoint: Option<String>) -> Result<(), String> {
    set_temp_upload_endpoint_config(endpoint)
}
