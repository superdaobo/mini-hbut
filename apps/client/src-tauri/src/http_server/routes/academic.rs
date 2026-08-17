//! 教务领域路由与 Handler：成绩同步、课表同步、考试、排名、学籍、
//! 教室、培养计划、校历、学业进度等。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use reqwest::header::HeaderMap;
use serde::Deserialize;

use crate::http_server::auth::ensure_sensitive_bridge_auth;
use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize, Default)]
struct SyncGradesRequest {
    current_only: Option<bool>,
    teacher_current_only: Option<bool>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct ExamRequest {
    semester: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct RankingRequest {
    student_id: Option<String>,
    semester: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize, Default)]
struct PersonalLoginAccessRequest {
    page: Option<i32>,
    page_size: Option<i32>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct ClassroomQueryRequest {
    week: Option<i32>,
    weekday: Option<i32>,
    periods: Option<Vec<i32>>,
    building: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct TrainingPlanJysRequest {
    yxid: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct TrainingPlanCoursesRequest {
    grade: Option<String>,
    kkxq: Option<String>,
    kkyx: Option<String>,
    kkjys: Option<String>,
    kcxz: Option<String>,
    kcgs: Option<String>,
    kcbh: Option<String>,
    kcmc: Option<String>,
    page: Option<i32>,
    page_size: Option<i32>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct CalendarRequest {
    semester: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct ScheduleQueryRequest {
    semester: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AcademicProgressRequest {
    fasz: Option<i32>,
}

// ────────────────────────────────────────────────────────────
async fn sync_grades(
    State(state): State<HttpState>,
    headers: HeaderMap,
    payload: Option<Json<SyncGradesRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let current_only = payload
        .as_ref()
        .and_then(|Json(req)| req.current_only.or(req.teacher_current_only))
        .unwrap_or(false);
    let client_handle = state.client.clone();
    let uid = {
        let client = client_handle.read().await;
        client.user_info.as_ref().map(|u| u.student_id.clone())
    };
    // 与 Tauri sync_grades 共用同一 GradeService：抓取 → 教师合并 →
    // 成功替换缓存 → 失败保留 offline 快照，保证双通道 payload 一致。
    let service = crate::grade::service::GradeService::new(
        client_handle.clone(),
        crate::grade::service::SqliteGradeCache,
    );
    match service.sync_grades(uid.as_deref(), current_only).await {
        Ok(result) => {
            if let Some(job) = result.enrichment {
                service.spawn_enrichment(job);
            }
            Ok(ok(result.payload))
        }
        Err(e) => Err(err(StatusCode::BAD_REQUEST, "业务错误", e.to_string())),
    }
}

// ────────────────────────────────────────────────────────────
async fn sync_schedule(
    State(state): State<HttpState>,
    headers: HeaderMap,
    payload: Option<Json<ScheduleQueryRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let semester = payload.and_then(|Json(req)| req.semester);
    // 统一课表同步用例：Tauri 与 HTTP Bridge 走同一 ScheduleService
    // （学期解析 → 抓取 → 成功写缓存 → 失败保留 offline 快照），本 handler 只做传输适配。
    let service = crate::application::ScheduleService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .sync_schedule(semester)
        .await
        .map(ok)
        .map_err(|error| err(StatusCode::BAD_REQUEST, "业务错误", error.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_exams(
    State(state): State<HttpState>,
    Json(req): Json<ExamRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_exams(req.semester)
        .await
        .map(ok)
        .map_err(|error| err(StatusCode::BAD_REQUEST, "业务错误", error.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_ranking(
    State(state): State<HttpState>,
    Json(req): Json<RankingRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_ranking(req.student_id, req.semester)
        .await
        .map(ok)
        .map_err(|error| {
            let status = if error.kind == crate::application::ApplicationErrorKind::Unauthorized {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::BAD_REQUEST
            };
            err(status, "业务错误", error.to_string())
        })
}

// ────────────────────────────────────────────────────────────
async fn fetch_student_info(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_student_info()
        .await
        .map(ok)
        .map_err(|error| err(StatusCode::BAD_REQUEST, "业务错误", error.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_personal_login_access_info(
    State(state): State<HttpState>,
    body: Option<Json<PersonalLoginAccessRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let req = body.map(|b| b.0).unwrap_or_default();
    // 与 Tauri fetch_personal_login_access_info 共用同一 AcademicReadService
    // （网络 → 缓存 → offline 降级），本 handler 只做传输适配。
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_personal_login_access_info(req.page, req.page_size)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "请求失败", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_semesters(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_semesters 共用同一 AcademicReadService（网络 → 缓存 → offline 降级）
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_semesters()
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_classroom_buildings(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_classroom_buildings 共用同一 AcademicReadService
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_classroom_buildings()
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_classrooms(
    State(state): State<HttpState>,
    Json(req): Json<ClassroomQueryRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_classrooms 共用同一 AcademicReadService
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_classrooms(req.week, req.weekday, req.periods, req.building)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_training_plan_options(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_training_plan_options 共用同一 AcademicReadService
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_training_plan_options()
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_training_plan_jys(
    State(state): State<HttpState>,
    Json(req): Json<TrainingPlanJysRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_training_plan_jys 共用同一 AcademicReadService
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_training_plan_jys(req.yxid)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_training_plan_courses(
    State(state): State<HttpState>,
    Json(req): Json<TrainingPlanCoursesRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_training_plan_courses 共用同一 AcademicReadService
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_training_plan_courses(
            req.grade,
            req.kkxq,
            req.kkyx,
            req.kkjys,
            req.kcxz,
            req.kcgs,
            req.kcbh,
            req.kcmc,
            req.page,
            req.page_size,
        )
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_calendar_data(
    State(state): State<HttpState>,
    Json(req): Json<CalendarRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_calendar_data 共用同一 AcademicReadService（含 #489 语义）
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_calendar_data(req.semester)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_academic_progress(
    State(state): State<HttpState>,
    Json(req): Json<AcademicProgressRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 与 Tauri fetch_academic_progress 共用同一 AcademicReadService
    let service = crate::application::AcademicReadService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    service
        .fetch_academic_progress(req.fasz)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/sync_grades", post(sync_grades))
        .route("/sync_schedule", post(sync_schedule))
        .route("/fetch_exams", post(fetch_exams))
        .route("/fetch_ranking", post(fetch_ranking))
        .route("/fetch_student_info", post(fetch_student_info))
        .route(
            "/fetch_personal_login_access_info",
            post(fetch_personal_login_access_info),
        )
        .route("/fetch_semesters", post(fetch_semesters))
        .route(
            "/fetch_classroom_buildings",
            post(fetch_classroom_buildings),
        )
        .route("/fetch_classrooms", post(fetch_classrooms))
        .route(
            "/fetch_training_plan_options",
            post(fetch_training_plan_options),
        )
        .route("/fetch_training_plan_jys", post(fetch_training_plan_jys))
        .route(
            "/fetch_training_plan_courses",
            post(fetch_training_plan_courses),
        )
        .route("/fetch_calendar_data", post(fetch_calendar_data))
        .route("/fetch_academic_progress", post(fetch_academic_progress))
}
