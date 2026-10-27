//! 教师端 HTTP Bridge 路由（Teacher Portal V2 / #1019）。
//!
//! Web / 浏览器模式走本地 bridge（与 Tauri 命令**同源鉴权**）：
//! 敏感鉴权 [`ensure_sensitive_bridge_auth`] + 教师身份校验 + 只读路径 allowlist
//! 全部由 [`crate::application::TeacherService`] 承担，本文件只做传输适配。
//!
//! 路由前缀固定 `/v2/teacher/*`（与前端 `features/teacher/api/teacherApi.ts` 契约一致）。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use reqwest::header::HeaderMap;
use serde::Deserialize;

use crate::http_server::auth::ensure_sensitive_bridge_auth;
use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;

#[derive(Debug, Deserialize, Default)]
struct TeacherSemesterRequest {
    semester: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct TeacherNoticesRequest {
    page: Option<i64>,
    page_size: Option<i64>,
    keyword: Option<String>,
}

fn service(state: &HttpState) -> crate::application::TeacherService {
    crate::application::TeacherService::new(crate::application::ApplicationContext::new(
        state.client.clone(),
        crate::DB_FILENAME,
    ))
}

fn map_error(
    error: crate::application::ApplicationError,
) -> (StatusCode, Json<ApiResponse<serde_json::Value>>) {
    let status = if error.kind == crate::application::ApplicationErrorKind::Unauthorized {
        StatusCode::UNAUTHORIZED
    } else {
        StatusCode::BAD_REQUEST
    };
    err(status, "业务错误", error.to_string())
}

async fn teacher_profile(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_profile()
        .await
        .map(ok)
        .map_err(map_error)
}

async fn teacher_teaching(
    State(state): State<HttpState>,
    headers: HeaderMap,
    body: Option<Json<TeacherSemesterRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let semester = body.and_then(|Json(req)| req.semester);
    service(&state)
        .fetch_teaching(semester)
        .await
        .map(ok)
        .map_err(map_error)
}

async fn teacher_exams(
    State(state): State<HttpState>,
    headers: HeaderMap,
    body: Option<Json<TeacherSemesterRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let semester = body.and_then(|Json(req)| req.semester);
    service(&state)
        .fetch_exams(semester)
        .await
        .map(ok)
        .map_err(map_error)
}

async fn teacher_notices(
    State(state): State<HttpState>,
    headers: HeaderMap,
    body: Option<Json<TeacherNoticesRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let req = body.map(|Json(req)| req).unwrap_or_default();
    service(&state)
        .fetch_notices(req.page, req.page_size, req.keyword)
        .await
        .map(ok)
        .map_err(map_error)
}

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/v2/teacher/profile", post(teacher_profile))
        .route("/v2/teacher/teaching", post(teacher_teaching))
        .route("/v2/teacher/exams", post(teacher_exams))
        .route("/v2/teacher/notices", post(teacher_notices))
}
