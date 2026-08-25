//! Bridge 鉴权公共层：路由策略、可信 Origin、Bearer/会话令牌校验、
//! 访问决策中间件与 CORS 层。
//!
//! 拆分自原 http_server.rs，鉴权语义、状态码与错误响应完全不变。

use axum::extract::{Request, State};
use axum::http::{Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::{engine::general_purpose, Engine as _};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use rand::RngCore;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;
use std::sync::Arc;
use tower_http::cors::{AllowHeaders, AllowOrigin, CorsLayer};

use crate::debug_bridge;

use super::response::{err, ApiResponse};
use super::state::HttpState;

const LOCAL_API_SCOPE: &str = "cache:read";

// ────────────────────────────────────────────────────────────
#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct LocalClaims {
    sub: String,
    exp: usize,
    scope: Option<String>,
}

// ────────────────────────────────────────────────────────────
pub(crate) fn load_local_api_public_key() -> Option<DecodingKey> {
    if let Ok(pem) = std::env::var("HBUT_LOCAL_API_PUBLIC_KEY") {
        if let Ok(key) = DecodingKey::from_rsa_pem(pem.as_bytes()) {
            return Some(key);
        }
    }

    let path = std::env::var("HBUT_LOCAL_API_PUBLIC_KEY_PATH")
        .ok()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("keys")
                .join("local_api_public.pem")
        });
    if let Ok(bytes) = std::fs::read(&path) {
        if let Ok(key) = DecodingKey::from_rsa_pem(&bytes) {
            return Some(key);
        }
    }
    None
}

// ────────────────────────────────────────────────────────────
pub(crate) fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    if let Some(value) = headers.get("authorization") {
        if let Ok(raw) = value.to_str() {
            let raw = raw.trim();
            if raw.to_lowercase().starts_with("bearer ") {
                return Some(raw[7..].trim().to_string());
            }
            if !raw.is_empty() {
                return Some(raw.to_string());
            }
        }
    }
    headers
        .get("x-local-token")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// ────────────────────────────────────────────────────────────
pub(crate) fn ensure_local_cache_auth(
    headers: &HeaderMap,
    state: &HttpState,
) -> Result<(), (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let key = state.local_api_key.as_ref().ok_or_else(|| {
        err(
            StatusCode::UNAUTHORIZED,
            "权限不足",
            "本地缓存 API 未配置公钥".to_string(),
        )
    })?;
    let token = extract_bearer(headers).ok_or_else(|| {
        err(
            StatusCode::UNAUTHORIZED,
            "权限不足",
            "缺少本地缓存 API 令牌".to_string(),
        )
    })?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = true;
    let data = decode::<LocalClaims>(&token, key, &validation).map_err(|e| {
        err(
            StatusCode::UNAUTHORIZED,
            "权限不足",
            format!("令牌无效: {}", e),
        )
    })?;

    if let Some(scope) = data.claims.scope.as_ref() {
        let scopes: Vec<&str> = scope.split(|c| c == ' ' || c == ',').collect();
        if !scopes.iter().any(|s| s.trim() == LOCAL_API_SCOPE) {
            return Err(err(
                StatusCode::FORBIDDEN,
                "权限不足",
                "令牌无缓存读取权限".to_string(),
            ));
        }
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────
pub(crate) fn ensure_debug_bridge_enabled(
    state: &HttpState,
) -> Result<(), (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if !debug_bridge::is_bridge_tools_enabled(&state.app) {
        return Err(err(
            StatusCode::FORBIDDEN,
            "调试接口已禁用",
            "debug.enable_bridge_tools 未开启".to_string(),
        ));
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────
/// 登录、cookie 导出等敏感 Bridge 路由鉴权。
///
/// Router 中间件会先执行同一套策略；这里保留二次校验，避免未来将敏感 handler
/// 挂载到未受保护的 Router 时静默失守。
pub(crate) fn ensure_sensitive_bridge_auth(
    headers: &HeaderMap,
    state: &HttpState,
) -> Result<(), (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if has_explicit_untrusted_origin(headers) {
        return Err(bridge_auth_error(
            StatusCode::FORBIDDEN,
            "请求 Origin 不在 Bridge 白名单",
        ));
    }

    if has_trusted_bridge_context(headers) || bridge_token_matches(headers, state) {
        return Ok(());
    }

    Err(bridge_auth_error(
        StatusCode::UNAUTHORIZED,
        "缺少可信 WebView Origin 或有效 Bridge 令牌",
    ))
}

// ────────────────────────────────────────────────────────────
pub(crate) fn is_allowed_cache_table(table: &str) -> bool {
    matches!(
        table,
        "grades_cache"
            | "schedule_cache"
            | "exams_cache"
            | "studentinfo_cache"
            | "calendar_cache"
            | "ranking_cache"
            | "academic_progress_cache"
            | "training_plan_cache"
            | "classroom_cache"
            | "electricity_cache"
            | "transaction_cache"
            | "student_login_access_cache"
            | "calendar_public_cache"
            | "classroom_public_cache"
            | "semesters_public_cache"
            | "qxzkb_public_cache"
            | "library_public_cache"
    )
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BridgeRoutePolicy {
    PublicHealth,
    PublicEmbed,
    Protected,
    /// `/local/*` 只读数据端点族（#698）：传输层仅拦不可信 Origin，
    /// 真正鉴权由 handler 内 `ensure_local_data_auth` 校验本机 Agent 令牌。
    LocalData,
    DebugOnly,
}

pub(crate) fn bridge_route_policy(path: &str) -> BridgeRoutePolicy {
    if path == "/health" {
        BridgeRoutePolicy::PublicHealth
    } else if path.starts_with("/local/") {
        // #698：本机只读学业数据端点族，独立于 WebView/Bridge 令牌体系
        BridgeRoutePolicy::LocalData
    } else if path.starts_with("/exports/")
        || path.starts_with("/module_bundle/content/")
        || path == "/school-website"
        || path == "/school-website/"
        || path.starts_with("/school-website/")
    {
        // 这些 URL 会作为子 WebView 的顶层导航地址，请求可能没有 Origin。
        // 仅允许 GET/HEAD，且不得携带显式不可信 Origin。
        BridgeRoutePolicy::PublicEmbed
    } else if path.starts_with("/debug/") || path.starts_with("/campus-guide-debug/") {
        BridgeRoutePolicy::DebugOnly
    } else {
        BridgeRoutePolicy::Protected
    }
}

// ────────────────────────────────────────────────────────────
pub(crate) fn generate_bridge_session_token() -> Arc<str> {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    Arc::<str>::from(general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

// ────────────────────────────────────────────────────────────
pub(crate) fn tokens_equal(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

// ────────────────────────────────────────────────────────────
pub(crate) fn configured_bridge_token() -> Option<String> {
    std::env::var("HBUT_BRIDGE_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

// ────────────────────────────────────────────────────────────
pub(crate) fn is_trusted_bridge_origin(raw: &str) -> bool {
    let value = raw.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("null") {
        return false;
    }

    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    let scheme = url.scheme().to_ascii_lowercase();
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();

    match scheme.as_str() {
        "tauri" | "capacitor" => host == "localhost",
        "http" | "https" => matches!(
            host.as_str(),
            "localhost" | "127.0.0.1" | "::1" | "tauri.localhost"
        ),
        _ => false,
    }
}

// ────────────────────────────────────────────────────────────
pub(crate) fn has_explicit_untrusted_origin(headers: &HeaderMap) -> bool {
    headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|origin| !is_trusted_bridge_origin(origin))
}

// ────────────────────────────────────────────────────────────
pub(crate) fn has_trusted_bridge_context(headers: &HeaderMap) -> bool {
    if let Some(origin) = headers.get("origin").and_then(|value| value.to_str().ok()) {
        return is_trusted_bridge_origin(origin);
    }

    headers
        .get("referer")
        .and_then(|value| value.to_str().ok())
        .is_some_and(is_trusted_bridge_origin)
}

// ────────────────────────────────────────────────────────────
pub(crate) fn bridge_token_matches(headers: &HeaderMap, state: &HttpState) -> bool {
    let Some(provided) = extract_bearer(headers) else {
        return false;
    };

    tokens_equal(&provided, state.bridge_token.as_ref())
        || configured_bridge_token()
            .as_deref()
            .is_some_and(|expected| tokens_equal(&provided, expected))
}

// ────────────────────────────────────────────────────────────
pub(crate) fn bridge_auth_error(
    status: StatusCode,
    message: &str,
) -> (StatusCode, Json<ApiResponse<serde_json::Value>>) {
    err(status, "权限不足", message.to_string())
}

// ────────────────────────────────────────────────────────────
/// `/local/*` 端点族的机器可读错误码（#698 契约固定形状：`{"error": CODE}`）。
///
/// 该端点族面向外部本机 Agent，错误体不使用桥内 ApiResponse 包装，
/// 保证消费者按稳定错误码解析。
pub(crate) fn local_data_error(
    status: StatusCode,
    code: &str,
) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(serde_json::json!({ "error": code })))
}

/// 401 + `{"error":"LOCAL_TOKEN_INVALID"}`：缺头 / 格式错 / 不匹配。
pub(crate) fn local_token_invalid_error() -> (StatusCode, Json<serde_json::Value>) {
    local_data_error(StatusCode::UNAUTHORIZED, "LOCAL_TOKEN_INVALID")
}

/// 401 + `{"error":"NOT_LOGGED_IN"}`：未登录学校账号，无本地学业数据可用。
pub(crate) fn not_logged_in_error() -> (StatusCode, Json<serde_json::Value>) {
    local_data_error(StatusCode::UNAUTHORIZED, "NOT_LOGGED_IN")
}

// ────────────────────────────────────────────────────────────
/// 提取 `Authorization: LocalToken <hex>` 头中的令牌
/// （scheme 按 HTTP 规范大小写不敏感；Bearer 或缺失返回 None）。
pub(crate) fn extract_local_agent_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get("authorization")?.to_str().ok()?.trim();
    let (scheme, value) = raw.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("localtoken") {
        return None;
    }
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LocalTokenDecision {
    Valid,
    Invalid,
}

/// 本机令牌纯校验逻辑（expected 为 None 表示令牌未加载，一律拒绝 fail closed）。
pub(crate) fn check_local_agent_token(
    provided: Option<&str>,
    expected: Option<&str>,
) -> LocalTokenDecision {
    match (provided, expected) {
        (Some(provided), Some(expected)) if tokens_equal(provided, expected) => {
            LocalTokenDecision::Valid
        }
        _ => LocalTokenDecision::Invalid,
    }
}

// ────────────────────────────────────────────────────────────
/// `/local/*` 只读数据端点族的本机令牌门禁（三个端点共用的守卫函数）。
///
/// 通过 → Ok；缺头 / 格式错 / 与启动时加载的本机令牌不匹配 →
/// 401 `{"error":"LOCAL_TOKEN_INVALID"}`。
pub(crate) fn ensure_local_data_auth(
    headers: &HeaderMap,
    state: &HttpState,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let provided = extract_local_agent_token(headers);
    let expected = state.local_agent_token.as_deref();
    if check_local_agent_token(provided.as_deref(), expected) == LocalTokenDecision::Valid {
        Ok(())
    } else {
        Err(local_token_invalid_error())
    }
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BridgeAccessDecision {
    Allow,
    Unauthorized,
    ForbiddenOrigin,
    DebugRouteUnavailable,
}

pub(crate) fn decide_bridge_access(
    policy: BridgeRoutePolicy,
    method: &Method,
    headers: &HeaderMap,
    token_valid: bool,
    debug_build: bool,
) -> BridgeAccessDecision {
    if policy == BridgeRoutePolicy::PublicHealth && matches!(*method, Method::GET | Method::HEAD) {
        return BridgeAccessDecision::Allow;
    }

    if policy == BridgeRoutePolicy::DebugOnly && !debug_build {
        return BridgeAccessDecision::DebugRouteUnavailable;
    }

    if has_explicit_untrusted_origin(headers) {
        return BridgeAccessDecision::ForbiddenOrigin;
    }

    // #698：LocalData 传输层仅放行 GET/HEAD（端点严格只读），
    // 本机令牌校验由 handler 内 ensure_local_data_auth 完成。
    if policy == BridgeRoutePolicy::LocalData {
        return if matches!(*method, Method::GET | Method::HEAD) {
            BridgeAccessDecision::Allow
        } else {
            BridgeAccessDecision::Unauthorized
        };
    }

    if policy == BridgeRoutePolicy::PublicEmbed && matches!(*method, Method::GET | Method::HEAD) {
        return BridgeAccessDecision::Allow;
    }

    if has_trusted_bridge_context(headers) || token_valid {
        BridgeAccessDecision::Allow
    } else {
        BridgeAccessDecision::Unauthorized
    }
}

// ────────────────────────────────────────────────────────────
pub(crate) async fn bridge_access_middleware(
    State(state): State<HttpState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let policy = bridge_route_policy(&path);

    let token_valid = bridge_token_matches(request.headers(), &state);
    match decide_bridge_access(
        policy,
        &method,
        request.headers(),
        token_valid,
        cfg!(debug_assertions),
    ) {
        BridgeAccessDecision::Allow => next.run(request).await,
        BridgeAccessDecision::Unauthorized => bridge_auth_error(
            StatusCode::UNAUTHORIZED,
            "缺少可信 WebView Origin 或有效 Bridge 令牌",
        )
        .into_response(),
        BridgeAccessDecision::ForbiddenOrigin => {
            bridge_auth_error(StatusCode::FORBIDDEN, "请求 Origin 不在 Bridge 白名单")
                .into_response()
        }
        BridgeAccessDecision::DebugRouteUnavailable => {
            bridge_auth_error(StatusCode::NOT_FOUND, "调试路由在 Release 构建中不存在")
                .into_response()
        }
    }
}

// ────────────────────────────────────────────────────────────
pub(crate) fn bridge_cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin: &HeaderValue, _| {
            origin
                .to_str()
                .map(is_trusted_bridge_origin)
                .unwrap_or(false)
        }))
        .allow_methods([
            Method::GET,
            Method::HEAD,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(AllowHeaders::mirror_request())
}
