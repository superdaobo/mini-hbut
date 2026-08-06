//! 教务领域路由与 Handler：成绩同步、课表同步、考试、排名、学籍、
//! 教室、培养计划、校历、学业进度等。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use chrono::Datelike;
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
#[allow(unreachable_code)]
async fn sync_schedule(
    State(state): State<HttpState>,
    headers: HeaderMap,
    payload: Option<Json<ScheduleQueryRequest>>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_sensitive_bridge_auth(&headers, &state)?;
    let client = state.client.write().await;
    let requested_semester = payload
        .and_then(|Json(req)| req.semester)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let explicit_semester = requested_semester.is_some();

    let schedule_context = client
        .resolve_schedule_context(requested_semester.as_deref())
        .await;
    let semester_to_query = schedule_context
        .get("semester")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| requested_semester.clone())
        .unwrap_or_else(|| "2024-2025-1".to_string());

    let (course_list, _now_week) = client
        .fetch_schedule(Some(semester_to_query.as_str()))
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if crate::http_client::HbutClient::is_no_schedule_error_message(&msg) {
                return err(
                    StatusCode::BAD_REQUEST,
                    "业务错误",
                    "暂无可用课表".to_string(),
                );
            }
            if explicit_semester {
                return err(StatusCode::BAD_REQUEST, "业务错误", msg);
            }
            err(StatusCode::BAD_REQUEST, "业务错误", msg)
        })?;

    let mut meta = schedule_context;
    if let Some(map) = meta.as_object_mut() {
        map.insert("semester".to_string(), serde_json::json!(semester_to_query));
        map.insert(
            "total_courses".to_string(),
            serde_json::json!(course_list.len()),
        );
        map.insert(
            "query_time".to_string(),
            serde_json::json!(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        );
    }

    let result = serde_json::json!({
        "success": true,
        "data": course_list,
        "meta": meta,
        "sync_time": chrono::Local::now().to_rfc3339(),
        "offline": false
    });

    return Ok(ok(result));

    let semester = match requested_semester {
        Some(s) => s,
        None => client
            .get_current_semester()
            .await
            .unwrap_or_else(|_| "2024-2025-1".to_string()),
    };
    let calendar_data = client.fetch_calendar_data(Some(semester.clone())).await;
    let (current_week, start_date) = if let Ok(ref cal) = calendar_data {
        let meta = cal.get("meta");
        let week = meta
            .and_then(|m| m.get("current_week"))
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32;
        let start = meta
            .and_then(|m| m.get("start_date"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        (week, start)
    } else {
        (1, String::new())
    };

    let (course_list, _now_week) = client
        .fetch_schedule(Some(semester.as_str()))
        .await
        .map_err(|e| {
            let msg = e.to_string();
            let lower = msg.to_lowercase();
            if explicit_semester
                && (msg.contains("该学期无课表")
                    || msg.contains("无课表")
                    || msg.contains("课表 API 返回错误")
                    || msg.contains("课表数据格式不正确")
                    || msg.contains("ret=-1")
                    || lower.contains("unknown schedule")
                    || lower.contains("no schedule"))
            {
                err(
                    StatusCode::BAD_REQUEST,
                    "业务错误",
                    "该学期无课表，请切换学期".to_string(),
                )
            } else {
                err(StatusCode::BAD_REQUEST, "业务错误", msg)
            }
        })?;

    let result = serde_json::json!({
        "success": true,
        "data": course_list,
        "meta": {
            "semester": semester,
            "current_week": current_week,
            "current_weekday": chrono::Local::now().weekday().num_days_from_monday() as i32 + 1,
            "start_date": start_date,
            "total_courses": course_list.len(),
            "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
        },
        "sync_time": chrono::Local::now().to_rfc3339(),
        "offline": false
    });

    Ok(ok(result))
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
    let page = req.page.unwrap_or(1).max(1);
    let page_size = req.page_size.unwrap_or(10).clamp(1, 100);
    let mut client = state.client.write().await;
    client
        .fetch_personal_login_access_info(Some(page), Some(page_size))
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "请求失败", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_semesters(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    client
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
    let client = state.client.write().await;
    client
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
    let client = state.client.write().await;
    client
        .fetch_classrooms_query(req.week, req.weekday, req.periods, req.building)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_training_plan_options(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    client
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
    let client = state.client.write().await;
    client
        .fetch_training_plan_jys(&req.yxid)
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
    let client = state.client.write().await;
    client
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
    let client = state.client.write().await;
    client
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
    let client = state.client.write().await;
    client
        .fetch_academic_progress(req.fasz.unwrap_or(1))
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
