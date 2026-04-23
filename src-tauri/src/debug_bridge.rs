use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex as StdMutex, OnceLock,
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

const DEBUG_CONFIG_PATH: &str = "debug/runtime_config.json";
const DEBUG_CAPTURE_DIR: &str = "debug-captures";
const SCREENSHOT_EVENT_NAME: &str = "hbu-debug-screenshot-request";
const STATE_EVENT_NAME: &str = "hbu-debug-state-request";

static DEBUG_BRIDGE_READY: AtomicBool = AtomicBool::new(false);
static SCREENSHOT_SEQ: AtomicU64 = AtomicU64::new(1);
static STATE_SEQ: AtomicU64 = AtomicU64::new(1);
static SCREENSHOT_WAITERS: OnceLock<
    StdMutex<HashMap<String, oneshot::Sender<Result<DebugScreenshotResponse, String>>>>,
> = OnceLock::new();
static STATE_WAITERS: OnceLock<
    StdMutex<HashMap<String, oneshot::Sender<Result<DebugStateResponse, String>>>>,
> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugRuntimeConfig {
    pub enable_bridge_tools: bool,
    pub enable_hot_update_framework: bool,
}

impl Default for DebugRuntimeConfig {
    fn default() -> Self {
        Self {
            enable_bridge_tools: false,
            enable_hot_update_framework: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugScreenshotRequest {
    pub selector: Option<String>,
    pub format: Option<String>,
    #[serde(rename = "return")]
    pub return_mode: Option<String>,
    pub filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugScreenshotBridgeRequest {
    request_id: String,
    selector: Option<String>,
    format: Option<String>,
    #[serde(rename = "return")]
    return_mode: Option<String>,
    filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DebugStateRequest {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugStateBridgeRequest {
    request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugStateResponse {
    pub state: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugStateCompletePayload {
    pub request_id: String,
    pub success: bool,
    pub error: Option<String>,
    pub state: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugScreenshotResponse {
    pub saved_path: Option<String>,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugScreenshotCompletePayload {
    pub request_id: String,
    pub success: bool,
    pub error: Option<String>,
    pub saved_path: Option<String>,
    pub mime: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub base64: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugCaptureSaveRequest {
    pub filename: Option<String>,
    pub mime_type: String,
    pub content_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugCaptureSaveResult {
    pub path: String,
    pub mime: String,
    pub size: u64,
}

#[derive(Debug)]
pub enum DebugScreenshotBridgeError {
    NotReady,
    Timeout,
    Failed(String),
}

#[derive(Debug)]
pub enum DebugStateBridgeError {
    NotReady,
    Timeout,
    Failed(String),
}

fn screenshot_waiters(
) -> &'static StdMutex<HashMap<String, oneshot::Sender<Result<DebugScreenshotResponse, String>>>> {
    SCREENSHOT_WAITERS.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn state_waiters(
) -> &'static StdMutex<HashMap<String, oneshot::Sender<Result<DebugStateResponse, String>>>> {
    STATE_WAITERS.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn read_env_flag(key: &str) -> Option<bool> {
    std::env::var(key).ok().and_then(|value| {
        let normalized = value.trim().to_ascii_lowercase();
        match normalized.as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        }
    })
}

fn resolve_debug_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(DEBUG_CONFIG_PATH, BaseDirectory::AppData)
        .map_err(|e| format!("解析调试配置路径失败: {}", e))
}

fn load_debug_runtime_config_inner(app: &AppHandle) -> Result<DebugRuntimeConfig, String> {
    let mut config = DebugRuntimeConfig::default();
    let path = resolve_debug_config_path(app)?;
    if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| format!("读取调试配置失败: {}", e))?;
        if let Ok(parsed) = serde_json::from_str::<DebugRuntimeConfig>(&raw) {
            config = parsed;
        }
    }
    if let Some(flag) = read_env_flag("HBUT_DEBUG_ENABLE_BRIDGE_TOOLS") {
        config.enable_bridge_tools = flag;
    }
    if let Some(flag) = read_env_flag("HBUT_DEBUG_ENABLE_HOT_UPDATE_FRAMEWORK") {
        config.enable_hot_update_framework = flag;
    }
    Ok(config)
}

fn save_debug_runtime_config_inner(
    app: &AppHandle,
    config: &DebugRuntimeConfig,
) -> Result<DebugRuntimeConfig, String> {
    let path = resolve_debug_config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建调试配置目录失败: {}", e))?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|e| format!("序列化调试配置失败: {}", e))?;
    std::fs::write(&path, text).map_err(|e| format!("写入调试配置失败: {}", e))?;
    Ok(config.clone())
}

fn sanitize_file_stem(raw: &str, fallback: &str) -> String {
    let mut out = raw
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    out = out.trim_matches('_').to_string();
    if out.is_empty() {
        fallback.to_string()
    } else {
        out
    }
}

fn extension_for_debug_capture(mime: &str, fallback_format: Option<&str>) -> &'static str {
    let normalized = mime.to_ascii_lowercase();
    if normalized.contains("webp") || fallback_format == Some("webp") {
        ".webp"
    } else {
        ".png"
    }
}

fn resolve_capture_filename(file_name: Option<&str>, mime: &str) -> String {
    let ext = extension_for_debug_capture(mime, None);
    let fallback = format!(
        "debug-capture-{}",
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    );
    let mut name = sanitize_file_stem(file_name.unwrap_or_default(), &fallback);
    if !name.to_ascii_lowercase().ends_with(ext) {
        name.push_str(ext);
    }
    name
}

#[tauri::command]
pub fn get_debug_runtime_config(app: AppHandle) -> Result<DebugRuntimeConfig, String> {
    load_debug_runtime_config_inner(&app)
}

#[tauri::command]
pub fn set_debug_runtime_config(
    app: AppHandle,
    config: DebugRuntimeConfig,
) -> Result<DebugRuntimeConfig, String> {
    save_debug_runtime_config_inner(&app, &config)
}

#[tauri::command]
pub fn set_debug_bridge_ready(ready: bool) -> Result<bool, String> {
    DEBUG_BRIDGE_READY.store(ready, Ordering::SeqCst);
    Ok(ready)
}

#[tauri::command]
pub fn save_debug_capture_file(
    app: AppHandle,
    req: DebugCaptureSaveRequest,
) -> Result<DebugCaptureSaveResult, String> {
    let bytes = general_purpose::STANDARD
        .decode(req.content_base64.trim())
        .map_err(|e| format!("调试截图 Base64 解析失败: {}", e))?;
    let base_dir = app
        .path()
        .resolve(DEBUG_CAPTURE_DIR, BaseDirectory::AppCache)
        .map_err(|e| format!("解析截图缓存目录失败: {}", e))?;
    std::fs::create_dir_all(&base_dir).map_err(|e| format!("创建截图缓存目录失败: {}", e))?;
    let file_name = resolve_capture_filename(req.filename.as_deref(), &req.mime_type);
    let file_path = base_dir.join(file_name);
    std::fs::write(&file_path, &bytes).map_err(|e| format!("写入调试截图失败: {}", e))?;
    Ok(DebugCaptureSaveResult {
        path: file_path.to_string_lossy().to_string(),
        mime: req.mime_type,
        size: bytes.len() as u64,
    })
}

#[tauri::command]
pub async fn complete_debug_screenshot(
    payload: DebugScreenshotCompletePayload,
) -> Result<bool, String> {
    let sender = screenshot_waiters()
        .lock()
        .map_err(|e| format!("调试截图回调锁定失败: {}", e))?
        .remove(payload.request_id.as_str());
    let Some(sender) = sender else {
        return Ok(false);
    };

    let result = if payload.success {
        Ok(DebugScreenshotResponse {
            saved_path: payload.saved_path,
            mime: payload
                .mime
                .unwrap_or_else(|| "image/png".to_string()),
            width: payload.width.unwrap_or(0),
            height: payload.height.unwrap_or(0),
            base64: payload.base64,
        })
    } else {
        Err(payload.error.unwrap_or_else(|| "截图失败".to_string()))
    };
    let _ = sender.send(result);
    Ok(true)
}

#[tauri::command]
pub async fn complete_debug_state(payload: DebugStateCompletePayload) -> Result<bool, String> {
    let sender = state_waiters()
        .lock()
        .map_err(|e| format!("调试状态回调锁定失败: {}", e))?
        .remove(payload.request_id.as_str());
    let Some(sender) = sender else {
        return Ok(false);
    };

    let result = if payload.success {
        Ok(DebugStateResponse {
            state: payload.state.unwrap_or(serde_json::Value::Null),
        })
    } else {
        Err(payload.error.unwrap_or_else(|| "读取调试状态失败".to_string()))
    };
    let _ = sender.send(result);
    Ok(true)
}

pub(crate) fn is_bridge_tools_enabled(app: &AppHandle) -> bool {
    load_debug_runtime_config_inner(app)
        .map(|config| config.enable_bridge_tools)
        .unwrap_or(false)
}

pub(crate) async fn request_debug_screenshot(
    app: &AppHandle,
    req: DebugScreenshotRequest,
    timeout_ms: u64,
) -> Result<DebugScreenshotResponse, DebugScreenshotBridgeError> {
    if !DEBUG_BRIDGE_READY.load(Ordering::SeqCst) {
        return Err(DebugScreenshotBridgeError::NotReady);
    }

    let request_id = format!(
        "dbgcap-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        SCREENSHOT_SEQ.fetch_add(1, Ordering::SeqCst)
    );
    let bridge_payload = DebugScreenshotBridgeRequest {
        request_id: request_id.clone(),
        selector: req.selector,
        format: req.format,
        return_mode: req.return_mode,
        filename: req.filename,
    };
    let (tx, rx) = oneshot::channel::<Result<DebugScreenshotResponse, String>>();
    screenshot_waiters()
        .lock()
        .map_err(|e| DebugScreenshotBridgeError::Failed(format!("截图请求注册失败: {}", e)))?
        .insert(request_id.clone(), tx);

    if let Err(e) = app.emit(SCREENSHOT_EVENT_NAME, &bridge_payload) {
        let _ = screenshot_waiters()
            .lock()
            .map(|mut waiters| waiters.remove(request_id.as_str()));
        return Err(DebugScreenshotBridgeError::Failed(format!("发送截图事件失败: {}", e)));
    }

    match tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms.max(1000)),
        rx,
    )
    .await
    {
        Ok(Ok(Ok(result))) => Ok(result),
        Ok(Ok(Err(message))) => Err(DebugScreenshotBridgeError::Failed(message)),
        Ok(Err(_)) => Err(DebugScreenshotBridgeError::Failed(
            "截图响应通道已关闭".to_string(),
        )),
        Err(_) => {
            let _ = screenshot_waiters()
                .lock()
                .map(|mut waiters| waiters.remove(request_id.as_str()));
            Err(DebugScreenshotBridgeError::Timeout)
        }
    }
}

pub(crate) async fn request_debug_state(
    app: &AppHandle,
    _req: DebugStateRequest,
    timeout_ms: u64,
) -> Result<DebugStateResponse, DebugStateBridgeError> {
    if !DEBUG_BRIDGE_READY.load(Ordering::SeqCst) {
        return Err(DebugStateBridgeError::NotReady);
    }

    let request_id = format!(
        "dbgstate-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        STATE_SEQ.fetch_add(1, Ordering::SeqCst)
    );
    let bridge_payload = DebugStateBridgeRequest {
        request_id: request_id.clone(),
    };
    let (tx, rx) = oneshot::channel::<Result<DebugStateResponse, String>>();
    state_waiters()
        .lock()
        .map_err(|e| DebugStateBridgeError::Failed(format!("状态请求注册失败: {}", e)))?
        .insert(request_id.clone(), tx);

    if let Err(e) = app.emit(STATE_EVENT_NAME, &bridge_payload) {
        let _ = state_waiters()
            .lock()
            .map(|mut waiters| waiters.remove(request_id.as_str()));
        return Err(DebugStateBridgeError::Failed(format!("发送状态事件失败: {}", e)));
    }

    match tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms.max(1000)),
        rx,
    )
    .await
    {
        Ok(Ok(Ok(result))) => Ok(result),
        Ok(Ok(Err(message))) => Err(DebugStateBridgeError::Failed(message)),
        Ok(Err(_)) => Err(DebugStateBridgeError::Failed(
            "状态响应通道已关闭".to_string(),
        )),
        Err(_) => {
            let _ = state_waiters()
                .lock()
                .map(|mut waiters| waiters.remove(request_id.as_str()));
            Err(DebugStateBridgeError::Timeout)
        }
    }
}
