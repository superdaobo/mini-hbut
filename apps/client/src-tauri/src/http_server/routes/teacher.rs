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
        // goal-21：教师端新增只读路由
        .route("/v2/teacher/attendance", post(teacher_attendance))
        .route("/v2/teacher/workload", post(teacher_workload))
        .route("/v2/teacher/workflow", post(teacher_workflow))
        .route("/v2/teacher/exam-affairs", post(teacher_exam_affairs))
        .route("/v2/teacher/credits", post(teacher_credits))
        .route("/v2/teacher/adjustment", post(teacher_adjustment))
        .route("/v2/teacher/roster", post(teacher_roster))
        .route("/v2/teacher/roster-by-class", post(teacher_roster_by_class))
        .route("/v2/teacher/grade-entry", post(teacher_grade_entry))
        .route("/v2/teacher/schedule-lists", post(teacher_schedule_lists))
        .route("/v2/teacher/class-schedule", post(teacher_class_schedule))
        .route("/v2/teacher/room-schedule", post(teacher_room_schedule))
        .route("/v2/teacher/portal-cards", post(teacher_portal_cards))
        .route("/v2/teacher/chaoxing-courses", post(teacher_chaoxing_courses))
        .route("/v2/teacher/chaoxing-analytics", post(teacher_chaoxing_analytics))
        .route("/v2/teacher/chaoxing-scores", post(teacher_chaoxing_scores))
        .route("/v2/teacher/chaoxing-monitor", post(teacher_chaoxing_monitor))
}

// ────────────────────────────────────────────────────────────────
// goal-21：教师端新增只读 bridge 路由（与 14 个 Tauri 命令一一对应）
// ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Default)]
struct TeacherRosterRequest {
    bjid: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
    keyword: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct TeacherChaoxingRequest {
    courseid: String,
    clazzid: String,
    cpi: String,
}

/// 生成「只接受 semester 参数」的 bridge 处理函数，避免 10 段重复样板。
macro_rules! semester_route {
    ($name:ident, $method:ident) => {
        async fn $name(
            State(state): State<HttpState>,
            headers: HeaderMap,
            Json(request): Json<TeacherSemesterRequest>,
        ) -> Result<
            Json<ApiResponse<serde_json::Value>>,
            (StatusCode, Json<ApiResponse<serde_json::Value>>),
        > {
            ensure_sensitive_bridge_auth(&headers, &state)?;
            service(&state)
                .$method(request.semester)
                .await
                .map(ok)
                .map_err(map_error)
        }
    };
}

semester_route!(teacher_attendance, fetch_attendance);
semester_route!(teacher_workload, fetch_workload);
semester_route!(teacher_workflow, fetch_workflow);
semester_route!(teacher_exam_affairs, fetch_exam_affairs);
semester_route!(teacher_credits, fetch_credits);
semester_route!(teacher_adjustment, fetch_adjustment);
semester_route!(teacher_grade_entry, fetch_grade_entry);

/// 课表扩展：班级列表 + 教室列表（semester + keyword）。
async fn teacher_schedule_lists(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherRosterRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_schedule_lists(None, request.keyword)
        .await
        .map(ok)
        .map_err(map_error)
}

/// 学生名册（`bjid` 必填；缺失由服务层拒绝且不发请求）。
async fn teacher_roster(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherRosterRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_roster(request.bjid, request.page, request.page_size, request.keyword)
        .await
        .map(ok)
        .map_err(map_error)
}

/// 融合门户卡片。
async fn teacher_portal_cards(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_portal_cards()
        .await
        .map(ok)
        .map_err(map_error)
}

/// 学习通教师侧：课程。
async fn teacher_chaoxing_courses(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_chaoxing_courses()
        .await
        .map(ok)
        .map_err(map_error)
}

/// 学习通教师侧：学情。
async fn teacher_chaoxing_analytics(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherChaoxingRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_chaoxing_analytics(request.courseid, request.clazzid, request.cpi)
        .await
        .map(ok)
        .map_err(map_error)
}

/// 学习通教师侧：全班成绩。
async fn teacher_chaoxing_scores(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherChaoxingRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_chaoxing_scores(request.courseid, request.clazzid, request.cpi)
        .await
        .map(ok)
        .map_err(map_error)
}

/// 学习通教师侧：学习监控。
async fn teacher_chaoxing_monitor(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherChaoxingRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_chaoxing_monitor(request.courseid, request.clazzid, request.cpi)
        .await
        .map(ok)
        .map_err(map_error)
}

/// 班级课表结构化数据（goal-22）。
async fn teacher_class_schedule(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherClassScheduleRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_class_schedule(request.encode_id, request.semester, request.campus_id)
        .await
        .map(ok)
        .map_err(map_error)
}

#[derive(Debug, Deserialize, Default)]
struct TeacherClassScheduleRequest {
    #[serde(alias = "encodeId")]
    encode_id: Option<String>,
    semester: Option<String>,
    #[serde(alias = "campusId")]
    campus_id: Option<String>,
}

/// 教室课表结构化数据（goal-22）。
async fn teacher_room_schedule(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherClassScheduleRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_room_schedule(request.encode_id, request.semester, request.campus_id)
        .await
        .map(ok)
        .map_err(map_error)
}

/// 按教学班列学生（goal-22）。
async fn teacher_roster_by_class(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<TeacherRosterByClassRequest>,
) -> Result<
    Json<ApiResponse<serde_json::Value>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    ensure_sensitive_bridge_auth(&headers, &state)?;
    service(&state)
        .fetch_roster_by_class(request.jxbid, request.page, request.page_size)
        .await
        .map(ok)
        .map_err(map_error)
}

#[derive(Debug, Deserialize, Default)]
struct TeacherRosterByClassRequest {
    jxbid: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
}
