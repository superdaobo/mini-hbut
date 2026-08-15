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
        .route("/debug/identity-core-diag", get(identity_core_diag))
        .route("/debug/identity-intent", post(debug_identity_intent))
        .route("/debug/frontend-eval", post(debug_frontend_eval))
        .route("/debug/keyring-probe", post(debug_keyring_probe))
}

// ────────────────────────────────────────────────────────────
/// 身份服务（Mini-HBUT Identity Core）连通性诊断（测试链路调试用）
/// GET /debug/identity-core-diag
/// 返回：App 本机（Rust reqwest 网络栈）到 id.湖北工业大学.com 的真实连通性，
/// 用于区分"App 网络/域名问题"与"身份服务问题"。
async fn identity_core_diag(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let core_url = "https://id.xn--vhq74jc2fzpchter27a.com";
    let mut result = serde_json::json!({
        "core_base_url": core_url,
        "checks": {},
        "hint": "前端实际请求地址由 src/features/identity/identityService.ts 的 IDENTITY_CORE_BASE_URL_DEFAULT 决定（可被 localStorage hbu_identity_core_base_url 覆盖）",
    });

    for (name, path) in [("healthz", "/healthz"), ("readyz", "/readyz")] {
        let url = format!("{core_url}{path}");
        let started = std::time::Instant::now();
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build();
        match client {
            Err(e) => {
                result["checks"][name] = serde_json::json!({ "ok": false, "error": format!("客户端构建失败: {e}") });
            }
            Ok(c) => match c.get(&url).send().await {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let body = resp.text().await.unwrap_or_default();
                    result["checks"][name] = serde_json::json!({
                        "ok": status == 200,
                        "status": status,
                        "ms": started.elapsed().as_millis(),
                        "body": body.chars().take(120).collect::<String>(),
                    });
                }
                Err(e) => {
                    result["checks"][name] = serde_json::json!({
                        "ok": false,
                        "error": format!("请求失败: {e}"),
                        "ms": started.elapsed().as_millis(),
                    });
                }
            },
        }
    }
    Ok(ok(result))
}

// ────────────────────────────────────────────────────────────
/// 模拟身份授权 deep link（测试链路用）：注入 minihbut://identity intent
/// POST /debug/identity-intent  body: { "request_id": "ar_...", "handoff": "..." }
/// 与真实 deep link 走同一条前端路径（appUrlOpen 事件 → IdentityCoordinator）。
#[derive(Debug, Deserialize)]
struct DebugIdentityIntentRequest {
    request_id: String,
    handoff: String,
}

async fn debug_identity_intent(
    State(state): State<HttpState>,
    Json(req): Json<DebugIdentityIntentRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let url = format!(
        "minihbut://identity?request_id={}&handoff={}",
        req.request_id, req.handoff
    );
    // Tauri 分支监听 deep-link://new-url（tauri-plugin-deep-link onOpenUrl）；
    // appUrlOpen 是 Capacitor 分支事件（App 已迁移 Tauri，仅保留兼容注释）。
    state
        .app
        .emit("deep-link://new-url", serde_json::json!([url]))
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "intent 注入失败", e.to_string()))?;
    Ok(ok(serde_json::json!({ "injected": true, "url": url })))
}

// ────────────────────────────────────────────────────────────
/// 前端诊断（测试链路用）：Rust 侧在 WebView 里执行 JS 并返回结果
/// POST /debug/frontend-eval  body: { "js": "..." }
/// 用于读取前端状态/localStorage（如身份流程诊断），仅 debug 构建。
#[derive(Debug, Deserialize)]
struct DebugFrontendEvalRequest {
    js: String,
}

async fn debug_frontend_eval(
    State(state): State<HttpState>,
    Json(req): Json<DebugFrontendEvalRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let window = state
        .app
        .get_webview_window("main")
        .ok_or_else(|| err(StatusCode::INTERNAL_SERVER_ERROR, "webview_missing", "找不到 main WebView".to_string()))?;
    // tauri eval 是 fire-and-forget；约定前端把诊断结果写入 document.title（DIAG:... 前缀），
    // 这里执行后读回 title 作为返回值（仅 debug 构建的测试链路约定）。
    window
        .eval(&req.js)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "eval_failed", e.to_string()))?;
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    let title = window.title().unwrap_or_default();
    let result = title.strip_prefix("DIAG:").map(|s| s.to_string());
    Ok(ok(serde_json::json!({ "diag": result })))
}

// ────────────────────────────────────────────────────────────
/// 在 App 进程内直接探测 keyring set/get（定位设备密钥写后读不一致）
#[derive(Debug, Deserialize)]
struct DebugKeyringProbeRequest {
    value: String,
}

async fn debug_keyring_probe(
    State(state): State<HttpState>,
    Json(req): Json<DebugKeyringProbeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_debug_or_dev(&state)?;
    let entry = keyring::Entry::new("mini-hbut-identity", "device-ed25519-v1")
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, "entry_failed", e.to_string()))?;
    let set_result = entry.set_password(&req.value);
    let get_result = entry.get_password();
    let same = match (&set_result, &get_result) {
        (Ok(()), Ok(v)) => Some(v == &req.value),
        _ => None,
    };
    let _ = entry.delete_credential();

    // 复现 create_if_missing 流程：先 get（NoEntry）→ set 同值 → get
    let e2 = keyring::Entry::new("mini-hbut-identity", "device-ed25519-v1").unwrap();
    let pre = e2.get_password();
    let set2 = e2.set_password(&req.value);
    let post = e2.get_password();
    let _ = e2.delete_credential();

    // 真实路径：DeviceKeyStore::real().create_if_missing()（enroll 的同款调用）
    let store = crate::identity::device_key::DeviceKeyStore::real();
    let real_result = store.create_if_missing().map(|k| k.fingerprint());

    Ok(ok(serde_json::json!({
        "set": set_result.is_ok(),
        "get_ok": get_result.is_ok(),
        "get_len": get_result.as_ref().map(|v| v.len()).unwrap_or(0),
        "same": same,
        "get_err": get_result.as_ref().err().map(|e| e.to_string()),
        "repro_pre": pre.is_ok(),
        "repro_set": set2.is_ok(),
        "repro_post": post.as_ref().map(|v| v.len()).unwrap_or(0),
        "repro_post_err": post.as_ref().err().map(|e| e.to_string()),
        "real_create": real_result.is_ok(),
        "real_fp": real_result.unwrap_or_default(),
    })))
}
