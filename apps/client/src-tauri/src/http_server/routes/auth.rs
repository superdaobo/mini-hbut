//! 登录 / 会话恢复 / Cookie 导出导入 路由与 Handler。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::header::HeaderMap;
use serde::Deserialize;

use crate::http_server::auth::ensure_sensitive_bridge_auth;
use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;
use crate::UserInfo;

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
    captcha: Option<String>,
    lt: Option<String>,
    execution: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct RestoreRequest {
    cookies: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct CookieSnapshotRequest {
    code: Option<String>,
    auth: Option<String>,
    jwxt: Option<String>,
}

// ────────────────────────────────────────────────────────────
async fn login(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<Json<ApiResponse<UserInfo>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    // 与 Tauri login 共用同一 AuthService（登录 + 会话/凭据持久化），本 handler 只做传输适配。
    let service = crate::application::AuthService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .login(
            &req.username,
            &req.password,
            req.captcha,
            req.lt,
            req.execution,
        )
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn restore_session(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<RestoreRequest>,
) -> Result<Json<ApiResponse<UserInfo>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    // 与 Tauri restore_session 共用同一 AuthService（恢复 + 凭据回填），本 handler 只做传输适配。
    let service = crate::application::AuthService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .restore_session(&req.cookies)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn export_cookies(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let service = crate::application::SessionService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    Ok(ok(service.export_cookie_snapshot().await))
}

// ────────────────────────────────────────────────────────────
async fn import_cookies(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<CookieSnapshotRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    // 与 Tauri 会话恢复共用同一 AuthService（Cookie 快照恢复 + 用户信息校验）
    let service = crate::application::AuthService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .import_cookies(req.code, req.auth, req.jwxt)
        .await
        .map(|user| ok(crate::application::import_cookies_ok_payload(user)))
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/login", post(login))
        .route("/restore_session", post(restore_session))
        .route("/export_cookies", get(export_cookies))
        .route("/import_cookies", post(import_cookies))
}
