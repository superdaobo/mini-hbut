use base64::{engine::general_purpose, Engine as _};
use png::{BitDepth, ColorType, Encoder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex as StdMutex, OnceLock,
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
#[cfg(windows)]
use windows::Win32::Foundation::RECT;
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BI_RGB, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HGDIOBJ,
};
#[cfg(windows)]
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS, PW_CLIENTONLY};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetClientRect, SetForegroundWindow, ShowWindow, PW_RENDERFULLCONTENT, SW_RESTORE,
};

const DEBUG_CONFIG_PATH: &str = "debug/runtime_config.json";
const DEBUG_CAPTURE_DIR: &str = "debug-captures";
const SCREENSHOT_EVENT_NAME: &str = "hbu-debug-screenshot-request";
const OPEN_MODULE_EVENT_NAME: &str = "hbu-debug-open-module-request";
const RESET_MORE_MODULES_EVENT_NAME: &str = "hbu-debug-reset-more-modules-request";
const STATE_EVENT_NAME: &str = "hbu-debug-state-request";

static DEBUG_BRIDGE_READY: AtomicBool = AtomicBool::new(false);
static SCREENSHOT_SEQ: AtomicU64 = AtomicU64::new(1);
static OPEN_MODULE_SEQ: AtomicU64 = AtomicU64::new(1);
static RESET_MORE_MODULES_SEQ: AtomicU64 = AtomicU64::new(1);
static STATE_SEQ: AtomicU64 = AtomicU64::new(1);
static SCREENSHOT_WAITERS: OnceLock<
    StdMutex<HashMap<String, oneshot::Sender<Result<DebugScreenshotResponse, String>>>>,
> = OnceLock::new();
static OPEN_MODULE_WAITERS: OnceLock<StdMutex<HashMap<String, oneshot::Sender<Result<(), String>>>>> =
    OnceLock::new();
static RESET_MORE_MODULES_WAITERS: OnceLock<
    StdMutex<HashMap<String, oneshot::Sender<Result<(), String>>>>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugOpenModuleRequest {
    #[serde(alias = "module_id")]
    pub module_id: String,
    #[serde(default, alias = "student_id")]
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugOpenModuleBridgeRequest {
    request_id: String,
    module_id: String,
    student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DebugResetMoreModulesRequest {
    #[serde(default)]
    pub cdn_base_override: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugResetMoreModulesBridgeRequest {
    request_id: String,
    cdn_base_override: Option<String>,
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
pub struct DebugOpenModuleCompletePayload {
    pub request_id: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugResetMoreModulesCompletePayload {
    pub request_id: String,
    pub success: bool,
    pub error: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDebugScreenshotResponse {
    pub saved_path: String,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub captured_at: String,
    pub base64: Option<String>,
}

#[derive(Debug)]
pub enum DebugScreenshotBridgeError {
    NotReady,
    Timeout,
    Failed(String),
}

#[derive(Debug)]
pub enum DebugOpenModuleBridgeError {
    NotReady,
    Timeout,
    Failed(String),
}

#[derive(Debug)]
pub enum DebugResetMoreModulesBridgeError {
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

fn open_module_waiters() -> &'static StdMutex<HashMap<String, oneshot::Sender<Result<(), String>>>> {
    OPEN_MODULE_WAITERS.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn reset_more_modules_waiters(
) -> &'static StdMutex<HashMap<String, oneshot::Sender<Result<(), String>>>> {
    RESET_MORE_MODULES_WAITERS.get_or_init(|| StdMutex::new(HashMap::new()))
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
    let saved_path = save_debug_capture_bytes(&app, req.filename.as_deref(), &req.mime_type, &bytes)?;
    Ok(DebugCaptureSaveResult {
        path: saved_path,
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
pub async fn complete_debug_open_module(
    payload: DebugOpenModuleCompletePayload,
) -> Result<bool, String> {
    let sender = open_module_waiters()
        .lock()
        .map_err(|e| format!("模块点击回调锁定失败: {}", e))?
        .remove(payload.request_id.as_str());
    let Some(sender) = sender else {
        return Ok(false);
    };

    let result = if payload.success {
        Ok(())
    } else {
        Err(payload.error.unwrap_or_else(|| "模块点击失败".to_string()))
    };
    let _ = sender.send(result);
    Ok(true)
}

#[tauri::command]
pub async fn complete_debug_reset_more_modules(
    payload: DebugResetMoreModulesCompletePayload,
) -> Result<bool, String> {
    let sender = reset_more_modules_waiters()
        .lock()
        .map_err(|e| format!("模块缓存重置回调锁定失败: {}", e))?
        .remove(payload.request_id.as_str());
    let Some(sender) = sender else {
        return Ok(false);
    };

    let result = if payload.success {
        Ok(())
    } else {
        Err(payload.error.unwrap_or_else(|| "模块缓存重置失败".to_string()))
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

pub(crate) async fn request_debug_open_module(
    app: &AppHandle,
    req: DebugOpenModuleRequest,
    timeout_ms: u64,
) -> Result<(), DebugOpenModuleBridgeError> {
    if !DEBUG_BRIDGE_READY.load(Ordering::SeqCst) {
        return Err(DebugOpenModuleBridgeError::NotReady);
    }

    let request_id = format!(
        "dbgopen-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        OPEN_MODULE_SEQ.fetch_add(1, Ordering::SeqCst)
    );
    let bridge_payload = DebugOpenModuleBridgeRequest {
        request_id: request_id.clone(),
        module_id: req.module_id,
        student_id: req.student_id,
    };
    let (tx, rx) = oneshot::channel::<Result<(), String>>();
    open_module_waiters()
        .lock()
        .map_err(|e| DebugOpenModuleBridgeError::Failed(format!("模块点击请求注册失败: {}", e)))?
        .insert(request_id.clone(), tx);

    if let Err(e) = app.emit(OPEN_MODULE_EVENT_NAME, &bridge_payload) {
        let _ = open_module_waiters()
            .lock()
            .map(|mut waiters| waiters.remove(request_id.as_str()));
        return Err(DebugOpenModuleBridgeError::Failed(format!("发送模块点击事件失败: {}", e)));
    }

    match tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms.max(1000)),
        rx,
    )
    .await
    {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(message))) => Err(DebugOpenModuleBridgeError::Failed(message)),
        Ok(Err(_)) => Err(DebugOpenModuleBridgeError::Failed(
            "模块点击响应通道已关闭".to_string(),
        )),
        Err(_) => {
            let _ = open_module_waiters()
                .lock()
                .map(|mut waiters| waiters.remove(request_id.as_str()));
            Err(DebugOpenModuleBridgeError::Timeout)
        }
    }
}

pub(crate) async fn request_debug_reset_more_modules(
    app: &AppHandle,
    req: DebugResetMoreModulesRequest,
    timeout_ms: u64,
) -> Result<(), DebugResetMoreModulesBridgeError> {
    if !DEBUG_BRIDGE_READY.load(Ordering::SeqCst) {
        return Err(DebugResetMoreModulesBridgeError::NotReady);
    }

    let request_id = format!(
        "dbgresetmods-{}-{}",
        chrono::Utc::now().timestamp_millis(),
        RESET_MORE_MODULES_SEQ.fetch_add(1, Ordering::SeqCst)
    );
    let bridge_payload = DebugResetMoreModulesBridgeRequest {
        request_id: request_id.clone(),
        cdn_base_override: req.cdn_base_override,
    };
    let (tx, rx) = oneshot::channel::<Result<(), String>>();
    reset_more_modules_waiters()
        .lock()
        .map_err(|e| DebugResetMoreModulesBridgeError::Failed(format!(
            "模块缓存重置请求注册失败: {}",
            e
        )))?
        .insert(request_id.clone(), tx);

    if let Err(e) = app.emit(RESET_MORE_MODULES_EVENT_NAME, &bridge_payload) {
        let _ = reset_more_modules_waiters()
            .lock()
            .map(|mut waiters| waiters.remove(request_id.as_str()));
        return Err(DebugResetMoreModulesBridgeError::Failed(format!(
            "发送模块缓存重置事件失败: {}",
            e
        )));
    }

    match tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms.max(1000)),
        rx,
    )
    .await
    {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(message))) => Err(DebugResetMoreModulesBridgeError::Failed(message)),
        Ok(Err(_)) => Err(DebugResetMoreModulesBridgeError::Failed(
            "模块缓存重置响应通道已关闭".to_string(),
        )),
        Err(_) => {
            let _ = reset_more_modules_waiters()
                .lock()
                .map(|mut waiters| waiters.remove(request_id.as_str()));
            Err(DebugResetMoreModulesBridgeError::Timeout)
        }
    }
}

fn resolve_debug_capture_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve(DEBUG_CAPTURE_DIR, BaseDirectory::AppCache)
        .map_err(|e| format!("解析截图缓存目录失败: {}", e))
}

fn save_debug_capture_bytes(
    app: &AppHandle,
    file_name: Option<&str>,
    mime: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let base_dir = resolve_debug_capture_dir(app)?;
    std::fs::create_dir_all(&base_dir).map_err(|e| format!("创建截图缓存目录失败: {}", e))?;
    let file_path = base_dir.join(resolve_capture_filename(file_name, mime));
    std::fs::write(&file_path, bytes).map_err(|e| format!("写入调试截图失败: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

fn encode_rgba_to_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut encoder = Encoder::new(&mut out, width, height);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|e| format!("写入 PNG 头失败: {}", e))?;
    writer
        .write_image_data(rgba)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;
    drop(writer);
    Ok(out)
}

#[cfg(windows)]
fn capture_window_client_rgba(window: &tauri::WebviewWindow) -> Result<(Vec<u8>, u32, u32), String> {
    let hwnd = window.hwnd().map_err(|e| format!("获取窗口句柄失败: {}", e))?;
    let _ = window.set_focus();
    unsafe {
        let _ = ShowWindow(hwnd, SW_RESTORE);
        let _ = SetForegroundWindow(hwnd);

        let mut client_rect = RECT::default();
        if GetClientRect(hwnd, &mut client_rect).is_err() {
            return Err("读取窗口客户区失败".to_string());
        }
        let width = client_rect.right - client_rect.left;
        let height = client_rect.bottom - client_rect.top;
        if width <= 0 || height <= 0 {
            return Err("窗口客户区尺寸无效".to_string());
        }

        let window_dc = GetDC(Some(hwnd));
        if window_dc.0.is_null() {
            return Err("获取窗口 DC 失败".to_string());
        }
        let memory_dc = CreateCompatibleDC(Some(window_dc));
        if memory_dc.0.is_null() {
            let _ = ReleaseDC(Some(hwnd), window_dc);
            return Err("创建兼容内存 DC 失败".to_string());
        }
        let bitmap = CreateCompatibleBitmap(window_dc, width, height);
        if bitmap.0.is_null() {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(Some(hwnd), window_dc);
            return Err("创建截图位图失败".to_string());
        }

        let previous = SelectObject(memory_dc, HGDIOBJ(bitmap.0));
        let capture_flags = PRINT_WINDOW_FLAGS(PW_CLIENTONLY.0 | PW_RENDERFULLCONTENT);
        let capture_ok = PrintWindow(hwnd, memory_dc, capture_flags).as_bool();

        let mut bmi = BITMAPINFO::default();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB.0 as u32;

        let mut buffer = vec![0u8; width as usize * height as usize * 4];
        let scanlines = GetDIBits(
            memory_dc,
            bitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr().cast()),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        if !previous.0.is_null() {
            let _ = SelectObject(memory_dc, previous);
        }
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(Some(hwnd), window_dc);

        if !capture_ok {
            return Err("PrintWindow 捕获窗口客户区失败".to_string());
        }
        if scanlines == 0 {
            return Err("读取位图像素失败".to_string());
        }

        for pixel in buffer.chunks_exact_mut(4) {
            pixel.swap(0, 2);
        }

        Ok((buffer, width as u32, height as u32))
    }
}

#[cfg(windows)]
pub fn capture_native_debug_screenshot(
    app: &AppHandle,
    req: DebugScreenshotRequest,
) -> Result<NativeDebugScreenshotResponse, String> {
    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "未找到可截图的 Tauri 主窗口".to_string())?;
    let (rgba, width, height) = capture_window_client_rgba(&window)?;
    let png_bytes = encode_rgba_to_png(&rgba, width, height)?;
    let mime = "image/png";
    let saved_path = save_debug_capture_bytes(app, req.filename.as_deref(), mime, &png_bytes)?;
    let return_mode = req.return_mode.unwrap_or_default().to_ascii_lowercase();
    let base64 = if return_mode == "base64" || return_mode == "both" {
        Some(general_purpose::STANDARD.encode(&png_bytes))
    } else {
        None
    };
    Ok(NativeDebugScreenshotResponse {
        saved_path,
        mime: mime.to_string(),
        width,
        height,
        captured_at: chrono::Utc::now().to_rfc3339(),
        base64,
    })
}

#[cfg(not(windows))]
pub fn capture_native_debug_screenshot(
    _app: &AppHandle,
    _req: DebugScreenshotRequest,
) -> Result<NativeDebugScreenshotResponse, String> {
    Err("当前平台尚未实现 Tauri 原生窗口截图".to_string())
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
