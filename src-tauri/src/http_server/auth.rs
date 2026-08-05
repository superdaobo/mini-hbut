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
    DebugOnly,
}

pub(crate) fn bridge_route_policy(path: &str) -> BridgeRoutePolicy {
    if path == "/health" {
        BridgeRoutePolicy::PublicHealth
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
