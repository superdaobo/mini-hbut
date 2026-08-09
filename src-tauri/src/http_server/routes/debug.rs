//! 调试领域路由与 Handler（仅 debug 构建注册）。

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::header::HeaderMap;
use serde::Deserialize;
use tauri::{path::BaseDirectory, Emitter, Manager};

use crate::debug_bridge::{
    self, DebugOpenModuleBridgeError, DebugOpenModuleRequest, DebugResetMoreModulesBridgeError,
    DebugResetMoreModulesRequest, DebugScreenshotBridgeError, DebugScreenshotRequest,
    DebugStateBridgeError, DebugStateRequest,
};
use crate::http_server::auth::{ensure_debug_bridge_enabled, ensure_sensitive_bridge_auth};
use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct DebugNavigateRequest {
    view: String,
    student_id: Option<String>,
    payload: Option<serde_json::Value>,
}

// ────────────────────────────────────────────────────────────
async fn debug_open_module(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<DebugOpenModuleRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;
    match debug_bridge::request_debug_open_module(&state.app, req, 12_000).await {
        Ok(()) => Ok(ok(serde_json::json!({ "opened": true }))),
        Err(DebugOpenModuleBridgeError::NotReady) => Err(err(
            StatusCode::CONFLICT,
            "页面未就绪",
            "当前页面尚未注册调试模块点击响应器".to_string(),
        )),
        Err(DebugOpenModuleBridgeError::Timeout) => Err(err(
            StatusCode::GATEWAY_TIMEOUT,
            "点击超时",
            "12 秒内未完成模块按钮点击".to_string(),
        )),
        Err(DebugOpenModuleBridgeError::Failed(message)) => {
            Err(err(StatusCode::UNPROCESSABLE_ENTITY, "点击失败", message))
        }
    }
}

async fn debug_screenshot(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<DebugScreenshotRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;
    match debug_bridge::capture_native_debug_screenshot(&state.app, req) {
        Ok(result) => Ok(ok(serde_json::json!({
            "saved_path": result.saved_path,
            "mime": result.mime,
            "width": result.width,
            "height": result.height,
            "captured_at": result.captured_at,
            "base64": result.base64
        }))),
        Err(message) => Err(err(StatusCode::UNPROCESSABLE_ENTITY, "截图失败", message)),
    }
}

async fn debug_dom_screenshot(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<DebugScreenshotRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;
    match debug_bridge::request_debug_screenshot(&state.app, req, 15_000).await {
        Ok(result) => Ok(ok(serde_json::json!({
            "saved_path": result.saved_path,
            "mime": result.mime,
            "width": result.width,
            "height": result.height,
            "base64": result.base64
        }))),
        Err(DebugScreenshotBridgeError::NotReady) => Err(err(
            StatusCode::CONFLICT,
            "页面未就绪",
            "当前页面尚未注册调试截图响应器".to_string(),
        )),
        Err(DebugScreenshotBridgeError::Timeout) => Err(err(
            StatusCode::GATEWAY_TIMEOUT,
            "截图超时",
            "15 秒内未收到页面截图响应".to_string(),
        )),
        Err(DebugScreenshotBridgeError::Failed(message)) => {
            Err(err(StatusCode::UNPROCESSABLE_ENTITY, "截图失败", message))
        }
    }
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct DebugLogsQuery {
    limit: Option<u32>,
    #[serde(alias = "sinceId")]
    since_id: Option<u64>,
    scope: Option<String>,
    level: Option<String>,
    q: Option<String>,
}

// ────────────────────────────────────────────────────────────
fn ensure_debug_or_dev(
    state: &HttpState,
) -> Result<(), (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if !cfg!(debug_assertions) {
        return Err(err(
            StatusCode::NOT_FOUND,
            "调试接口不可用",
            "Debug routes are not compiled into the Release router".to_string(),
        ));
    }
    ensure_debug_bridge_enabled(state)
}

// ────────────────────────────────────────────────────────────
async fn debug_logs_get(
    State(state): State<HttpState>,
    Query(q): Query<DebugLogsQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let logs = crate::runtime_log::query_logs(crate::runtime_log::LogQuery {
        limit: q.limit.unwrap_or(300) as usize,
        since_id: q.since_id,
        scope_contains: q.scope,
        level: q.level,
        message_contains: q.q,
    });
    Ok(ok(serde_json::json!({
        "stats": crate::runtime_log::stats(),
        "logs": logs,
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_logs_clear(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    crate::runtime_log::clear_logs();
    Ok(ok(serde_json::json!({ "cleared": true })))
}

// ────────────────────────────────────────────────────────────
async fn debug_logs_query(
    State(state): State<HttpState>,
    Json(body): Json<DebugLogsQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let logs = crate::runtime_log::query_logs(crate::runtime_log::LogQuery {
        limit: body.limit.unwrap_or(300) as usize,
        since_id: body.since_id,
        scope_contains: body.scope,
        level: body.level,
        message_contains: body.q,
    });
    Ok(ok(serde_json::json!({
        "stats": crate::runtime_log::stats(),
        "logs": logs,
    })))
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct DebugLogPushBody {
    scope: Option<String>,
    message: String,
    level: Option<String>,
    details: Option<serde_json::Value>,
}

// ────────────────────────────────────────────────────────────
async fn debug_logs_push(
    State(state): State<HttpState>,
    Json(body): Json<DebugLogPushBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let scope = body.scope.unwrap_or_else(|| "HTTP".into());
    let level = body.level.unwrap_or_else(|| "info".into());
    if let Some(d) = body.details {
        crate::runtime_log::log_with_details(&level, scope, body.message, d);
    } else {
        match level.as_str() {
            "error" => crate::runtime_log::log_error(scope, body.message),
            "warn" => crate::runtime_log::log_warn(scope, body.message),
            "debug" => crate::runtime_log::log_debug(scope, body.message),
            _ => crate::runtime_log::log_info(scope, body.message),
        }
    }
    Ok(ok(serde_json::json!({ "ok": true })))
}

// ────────────────────────────────────────────────────────────
async fn debug_diag(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let client = state.client.read().await;
    let sid = client
        .user_info
        .as_ref()
        .map(|u| u.student_id.clone())
        .unwrap_or_default();
    let cookies = client.get_cookies();
    let has_keys: Vec<&str> = ["UID", "_uid", "CASTGC", "JSESSIONID", "fid"]
        .into_iter()
        .filter(|k| cookies.contains(&format!("{k}=")))
        .collect();
    Ok(ok(serde_json::json!({
        "student_id": sid,
        "is_logged_in": client.is_logged_in,
        "has_user_info": client.user_info.is_some(),
        "cookie_len": cookies.len(),
        "cookie_keys": has_keys,
        "runtime_log": crate::runtime_log::stats(),
        "bridge_tools": debug_bridge::is_bridge_tools_enabled(&state.app),
        "time": chrono::Local::now().to_rfc3339(),
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_routes_list(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    Ok(ok(serde_json::json!({
        "routes": [
            { "method": "GET", "path": "/debug/logs", "desc": "拉取运行时日志 ?limit&since_id&scope&level&q" },
            { "method": "DELETE", "path": "/debug/logs", "desc": "清空运行时日志" },
            { "method": "POST", "path": "/debug/logs/query", "desc": "JSON 查询日志" },
            { "method": "POST", "path": "/debug/logs/push", "desc": "写入一条日志" },
            { "method": "GET", "path": "/debug/diag", "desc": "会话/cookie/日志统计诊断" },
            { "method": "GET", "path": "/debug/routes", "desc": "本列表" },
            { "method": "POST", "path": "/debug/chaoxing/session", "desc": "探测学习通会话并写日志" },
            { "method": "POST", "path": "/debug/chaoxing/courses", "desc": "拉课程列表并计时 body.force" },
            { "method": "POST", "path": "/debug/inbox", "desc": "拉收件箱 body.login_mode / force" },
            { "method": "GET", "path": "/debug/state", "desc": "前端页面状态" },
            { "method": "POST", "path": "/debug/screenshot", "desc": "原生截图" },
            { "method": "POST", "path": "/debug/navigate", "desc": "导航到视图" },
        ]
    })))
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize, Default)]
struct DebugForceBody {
    force: Option<bool>,
    #[serde(alias = "loginMode")]
    login_mode: Option<String>,
    #[serde(alias = "studentId")]
    student_id: Option<String>,
}

// ────────────────────────────────────────────────────────────
async fn debug_chaoxing_session(
    State(state): State<HttpState>,
    body: Option<Json<DebugForceBody>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let mut client = state.client.write().await;
    let sid = body
        .as_ref()
        .and_then(|b| b.student_id.clone())
        .or_else(|| client.user_info.as_ref().map(|u| u.student_id.clone()))
        .unwrap_or_default();
    crate::runtime_log::log_info("DebugAPI", format!("手动探测学习通会话 student_id={sid}"));
    let status = crate::modules::online_learning::chaoxing_get_session_status(
        &mut client,
        if sid.is_empty() {
            None
        } else {
            Some(sid.as_str())
        },
    )
    .await
    .map_err(|e| err(StatusCode::BAD_GATEWAY, "会话探测失败", e.to_string()))?;
    Ok(ok(status))
}

// ────────────────────────────────────────────────────────────
async fn debug_chaoxing_courses(
    State(state): State<HttpState>,
    body: Option<Json<DebugForceBody>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let force = body.as_ref().and_then(|b| b.force).unwrap_or(false);
    let mut client = state.client.write().await;
    let sid = body
        .as_ref()
        .and_then(|b| b.student_id.clone())
        .or_else(|| client.user_info.as_ref().map(|u| u.student_id.clone()));
    crate::runtime_log::log_info("DebugAPI", format!("手动拉取课程 force={force}"));
    let started = std::time::Instant::now();
    let payload =
        crate::modules::online_learning::chaoxing_fetch_courses(&mut client, sid.as_deref(), force)
            .await
            .map_err(|e| err(StatusCode::BAD_GATEWAY, "课程拉取失败", e.to_string()))?;
    let ms = started.elapsed().as_millis() as u64;
    Ok(ok(serde_json::json!({
        "elapsed_ms": ms,
        "payload": payload,
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_inbox_fetch(
    State(state): State<HttpState>,
    body: Option<Json<DebugForceBody>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let force = body.as_ref().and_then(|b| b.force).unwrap_or(false);
    let mode = body
        .as_ref()
        .and_then(|b| b.login_mode.clone())
        .unwrap_or_else(|| "chaoxing".into());
    let mut client = state.client.write().await;
    crate::runtime_log::log_info(
        "DebugAPI",
        format!("手动拉取收件箱 mode={mode} force={force}"),
    );
    let started = std::time::Instant::now();
    let payload = crate::modules::school_inbox::fetch_school_inbox_ex(&mut client, &mode, force)
        .await
        .map_err(|e| err(StatusCode::BAD_GATEWAY, "收件箱拉取失败", e.to_string()))?;
    let ms = started.elapsed().as_millis() as u64;
    Ok(ok(serde_json::json!({
        "elapsed_ms": ms,
        "count": payload.items.len(),
        "source": payload.source,
        "payload": payload,
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_state(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;

    match debug_bridge::request_debug_state(&state.app, DebugStateRequest::default(), 8_000).await {
        Ok(result) => Ok(ok(result.state)),
        Err(DebugStateBridgeError::NotReady) => Err(err(
            StatusCode::CONFLICT,
            "页面未就绪",
            "当前页面尚未注册调试状态响应器".to_string(),
        )),
        Err(DebugStateBridgeError::Timeout) => Err(err(
            StatusCode::GATEWAY_TIMEOUT,
            "状态读取超时",
            "8 秒内未收到页面状态响应".to_string(),
        )),
        Err(DebugStateBridgeError::Failed(message)) => Err(err(
            StatusCode::UNPROCESSABLE_ENTITY,
            "状态读取失败",
            message,
        )),
    }
}

// ────────────────────────────────────────────────────────────
async fn debug_reset_more_modules(
    State(state): State<HttpState>,
    headers: HeaderMap,
    payload: Option<Json<DebugResetMoreModulesRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;

    let request = payload
        .map(|json| json.0)
        .unwrap_or_else(DebugResetMoreModulesRequest::default);

    match debug_bridge::request_debug_reset_more_modules(&state.app, request, 8_000).await {
        Ok(()) => {}
        Err(DebugResetMoreModulesBridgeError::NotReady) => {
            return Err(err(
                StatusCode::CONFLICT,
                "页面未就绪",
                "当前页面尚未注册调试模块缓存重置响应器".to_string(),
            ));
        }
        Err(DebugResetMoreModulesBridgeError::Timeout) => {
            return Err(err(
                StatusCode::GATEWAY_TIMEOUT,
                "重置超时",
                "8 秒内未完成模块缓存状态清理".to_string(),
            ));
        }
        Err(DebugResetMoreModulesBridgeError::Failed(message)) => {
            return Err(err(StatusCode::UNPROCESSABLE_ENTITY, "重置失败", message));
        }
    }

    let cache_dir = state
        .app
        .path()
        .resolve("more_modules", BaseDirectory::AppCache)
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "路径解析失败",
                format!("解析模块缓存目录失败: {}", e),
            )
        })?;
    let cache_deleted = if cache_dir.exists() {
        std::fs::remove_dir_all(&cache_dir).map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "删除失败",
                format!("删除模块缓存目录失败: {}", e),
            )
        })?;
        true
    } else {
        false
    };

    Ok(ok(serde_json::json!({
        "storage_cleared": true,
        "cache_deleted": cache_deleted,
        "cache_dir": cache_dir.to_string_lossy().to_string()
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_navigate(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<DebugNavigateRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;

    let view = req.view.trim().to_string();
    if view.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "view 不能为空".to_string(),
        ));
    }

    let student_id = req
        .student_id
        .as_deref()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    let payload = serde_json::json!({
        "view": view,
        "studentId": student_id,
        "payload": req.payload,
    });

    state
        .app
        .emit("hbu-debug-navigate-request", payload)
        .map_err(|e| {
            err(
                StatusCode::UNPROCESSABLE_ENTITY,
                "导航失败",
                format!("发送导航事件失败: {}", e),
            )
        })?;

    Ok(ok(serde_json::json!({
        "accepted": true,
        "view": req.view,
        "student_id": req.student_id
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_save_export_file(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<crate::SaveExportFileRequest>,
) -> Result<
    Json<ApiResponse<crate::SaveExportFileResult>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_debug_bridge_enabled(&state)?;
    ensure_sensitive_bridge_auth(&headers, &state)?;

    crate::save_export_file_impl(state.app.clone(), req)
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "导出失败", e))
}

pub(crate) fn debug_router() -> Router<HttpState> {
    Router::new()
        .route("/debug/navigate", post(debug_navigate))
        .route("/debug/open_module", post(debug_open_module))
        .route("/debug/reset_more_modules", post(debug_reset_more_modules))
        .route("/debug/screenshot", post(debug_screenshot))
        .route("/debug/dom_screenshot", post(debug_dom_screenshot))
        .route("/debug/state", get(debug_state))
        .route("/debug/save_export_file", post(debug_save_export_file))
        .route("/debug/logs", get(debug_logs_get).delete(debug_logs_clear))
        .route("/debug/logs/query", post(debug_logs_query))
        .route("/debug/logs/push", post(debug_logs_push))
        .route("/debug/diag", get(debug_diag))
        .route("/debug/routes", get(debug_routes_list))
        .route("/debug/chaoxing/session", post(debug_chaoxing_session))
        .route("/debug/chaoxing/courses", post(debug_chaoxing_courses))
        .route("/debug/inbox", post(debug_inbox_fetch))
}
