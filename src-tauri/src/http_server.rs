//! æ¬å° HTTP Bridge æå¡ã?
//!
//! ç¨éï¼
//! - æä¾ç»å¤é¨èæ?æµè¯å·¥å·è°ç¨åç«¯è½å
//! - ç»ä¸è¿åç»æï¼ApiResponseï¼ä¸éè¯¯ç±»åï¼ApiErrorï¼?
//! - ä»çå¬æ¬å°å°åï¼é¿åå¤é¨è®¿é?
//!
//! æ³¨æï¼?
//! - è¿æ¯æµè¯æ¡¥æ¥ï¼ä¸åºæ´é²å°å¬ç½
//! - è¿åä½åºå®ä¸º { success, data, error, time }

use axum::{routing::{get, post}, Json, Router, extract::State, extract::Query};
use axum::response::sse::{Event, KeepAlive, Sse};
use serde::Deserialize;
use serde::Serialize;

#[derive(Serialize)]
struct ApiError {
    kind: String,
    message: String,
}

#[derive(Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<ApiError>,
    time: String,
}

const DB_FILENAME: &str = "grades.db";
const LOCAL_API_SCOPE: &str = "cache:read";

#[derive(Debug, Deserialize)]
struct LocalClaims {
    sub: String,
    exp: usize,
    scope: Option<String>,
}

fn load_local_api_public_key() -> Option<DecodingKey> {
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

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
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
    headers.get("x-local-token").and_then(|v| v.to_str().ok()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn ensure_local_cache_auth(headers: &HeaderMap, state: &HttpState) -> Result<(), (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let key = state.local_api_key.as_ref().ok_or_else(|| {
        err(StatusCode::UNAUTHORIZED, "权限不足", "本地缓存 API 未配置公钥".to_string())
    })?;
    let token = extract_bearer(headers).ok_or_else(|| {
        err(StatusCode::UNAUTHORIZED, "权限不足", "缺少本地缓存 API 令牌".to_string())
    })?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = true;
    let data = decode::<LocalClaims>(&token, key, &validation)
        .map_err(|e| err(StatusCode::UNAUTHORIZED, "权限不足", format!("令牌无效: {}", e)))?;

    if let Some(scope) = data.claims.scope.as_ref() {
        let scopes: Vec<&str> = scope.split(|c| c == ' ' || c == ',').collect();
        if !scopes.iter().any(|s| s.trim() == LOCAL_API_SCOPE) {
            return Err(err(StatusCode::FORBIDDEN, "权限不足", "令牌无缓存读取权限".to_string()));
        }
    }
    Ok(())
}

fn is_allowed_cache_table(table: &str) -> bool {
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
            | "calendar_public_cache"
            | "classroom_public_cache"
            | "semesters_public_cache"
            | "qxzkb_public_cache"
    )
}

fn ok<T: Serialize>(data: T) -> Json<ApiResponse<T>> {
    Json(ApiResponse {
        success: true,
        data: Some(data),
        error: None,
        time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// å¤±è´¥ååºåè£
fn err(status: StatusCode, kind: &str, message: String) -> (StatusCode, Json<ApiResponse<serde_json::Value>>) {
    (
        status,
        Json(ApiResponse {
            success: false,
            data: None,
            error: Some(ApiError {
                kind: kind.to_string(),
                message,
            }),
            time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }),
    )
}
use std::net::{SocketAddr, IpAddr};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::sync::Arc;
use tokio::sync::Mutex;
use axum::http::StatusCode;
use chrono::{Datelike, Utc};
use futures::Stream;
use futures::StreamExt;
use futures::FutureExt;
use std::time::Instant;
use std::convert::Infallible;
use reqwest::header::{HeaderMap, HeaderValue};
use tower_http::cors::{Any, CorsLayer};
use crate::{UserInfo, QxzkbQuery};
use crate::db;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use crate::http_client::HbutClient;

#[derive(Clone)]
struct HttpState {
    client: Arc<Mutex<HbutClient>>,
    local_api_key: Option<DecodingKey>,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
    captcha: Option<String>,
    lt: Option<String>,
    execution: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RestoreRequest {
    cookies: String,
}

#[derive(Debug, Deserialize)]
struct CookieSnapshotRequest {
    code: Option<String>,
    auth: Option<String>,
    jwxt: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExamRequest {
    semester: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RankingRequest {
    student_id: Option<String>,
    semester: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClassroomQueryRequest {
    week: Option<i32>,
    weekday: Option<i32>,
    periods: Option<Vec<i32>>,
    building: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TrainingPlanJysRequest {
    yxid: String,
}

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

#[derive(Debug, Deserialize)]
struct CalendarRequest {
    semester: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AcademicProgressRequest {
    fasz: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct CacheGetQuery {
    table: String,
    key: String,
}

#[derive(Debug, Deserialize)]
struct QxzkbJcinfoRequest {
    xnxq: String,
}

#[derive(Debug, Deserialize)]
struct QxzkbZyxxRequest {
    yxid: String,
    nj: String,
}

#[derive(Debug, Deserialize)]
struct QxzkbKkjysRequest {
    kkyxid: String,
}

#[derive(Debug, Deserialize)]
struct ElectricityRequest {
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct TransactionRequest {
    start_date: String,
    end_date: String,
    page_no: i32,
    page_size: i32,
}

#[derive(Debug, Deserialize)]
struct AiUploadRequest {
    token: String,
    blade_auth: String,
    file_content: String,
    file_name: String,
}

#[derive(Debug, Deserialize)]
struct AiChatRequest {
    token: String,
    blade_auth: String,
    question: String,
    upload_url: Option<String>,
    model: String,
}

/// å¯å¨æ¬å° Bridge æå¡
pub fn spawn_http_server(client: Arc<Mutex<HbutClient>>) {
    let state = HttpState { 
        client,
        local_api_key: load_local_api_public_key(),
    };
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_http_server(state).await {
            eprintln!("[HTTP] æå¡éè¯¯: {}", e);
        }
    });
}

async fn run_http_server(state: HttpState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port = std::env::var("HBUT_HTTP_BRIDGE_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(4399);
    let host = std::env::var("HBUT_HTTP_BRIDGE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let ip: IpAddr = host.parse().unwrap_or_else(|_| IpAddr::from([127, 0, 0, 1]));
    let addr = SocketAddr::from((ip, port));

    let app = Router::new()
        .route("/health", get(health))
        .route("/login", post(login))
        .route("/restore_session", post(restore_session))
        .route("/export_cookies", get(export_cookies))
        .route("/import_cookies", post(import_cookies))
        .route("/sync_grades", post(sync_grades))
        .route("/sync_schedule", post(sync_schedule))
        .route("/fetch_exams", post(fetch_exams))
        .route("/fetch_ranking", post(fetch_ranking))
        .route("/fetch_student_info", post(fetch_student_info))
        .route("/fetch_semesters", post(fetch_semesters))
        .route("/fetch_classroom_buildings", post(fetch_classroom_buildings))
        .route("/fetch_classrooms", post(fetch_classrooms))
        .route("/fetch_training_plan_options", post(fetch_training_plan_options))
        .route("/fetch_training_plan_jys", post(fetch_training_plan_jys))
        .route("/fetch_training_plan_courses", post(fetch_training_plan_courses))
        .route("/fetch_calendar_data", post(fetch_calendar_data))
        .route("/fetch_academic_progress", post(fetch_academic_progress))
        .route("/cache/get", get(cache_get))
        .route("/qxzkb/options", get(fetch_qxzkb_options))
        .route("/qxzkb/jcinfo", post(fetch_qxzkb_jcinfo))
        .route("/qxzkb/zyxx", post(fetch_qxzkb_zyxx))
        .route("/qxzkb/kkjys", post(fetch_qxzkb_kkjys))
        .route("/qxzkb/query", post(fetch_qxzkb_list))
        .route("/electricity_query_location", post(electricity_query_location))
        .route("/electricity_query_account", post(electricity_query_account))
        .route("/fetch_transaction_history", post(fetch_transaction_history))
        .route("/one_code_token", post(one_code_token))
        .route("/ai_init", post(ai_init))
        .route("/ai_upload", post(ai_upload))
        .route("/ai_chat", post(ai_chat))
        .route("/ai_chat_stream", post(ai_chat_stream))
        .with_state(state)
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any));

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(err) if err.kind() == ErrorKind::AddrInUse => {
            eprintln!("[HTTP] ¶Ë¿ÚÒÑ±»Õ¼ÓÃ£¬ÇÅ½Ó·þÎñÎ´Æô¶¯: http://{}", addr);
            return Ok(());
        }
        Err(err) => return Err(err.into()),
    };
    println!("[HTTP] ÇÅ½Ó·þÎñ¼àÌý: http://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health(State(state): State<HttpState>) -> Json<ApiResponse<serde_json::Value>> {
    let client = state.client.lock().await;
    ok(serde_json::json!({
        "success": true,
        "logged_in": client.user_info.is_some()
    }))
}

async fn login(State(state): State<HttpState>, Json(req): Json<LoginRequest>) -> Result<Json<ApiResponse<UserInfo>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.login(
        &req.username,
        &req.password,
        &req.captcha.unwrap_or_default(),
        &req.lt.unwrap_or_default(),
        &req.execution.unwrap_or_default(),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn restore_session(State(state): State<HttpState>, Json(req): Json<RestoreRequest>) -> Result<Json<ApiResponse<UserInfo>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.restore_session(&req.cookies)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn export_cookies(State(state): State<HttpState>) -> Json<ApiResponse<serde_json::Value>> {
    let client = state.client.lock().await;
    ok(serde_json::json!({
        "success": true,
        "data": client.get_cookie_snapshot()
    }))
}

async fn import_cookies(State(state): State<HttpState>, Json(req): Json<CookieSnapshotRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.restore_cookie_snapshot(req.code, req.auth, req.jwxt)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?;

    match client.fetch_user_info().await {
        Ok(info) => Ok(ok(serde_json::json!({"success": true, "user": info}))),
        Err(e) => Err(err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
    }
}

async fn sync_grades(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    match client.fetch_grades().await {
        Ok(grades) => {
            let payload = serde_json::json!({
                "success": true,
                "data": grades,
                "sync_time": chrono::Local::now().to_rfc3339(),
                "offline": false
            });
            Ok(ok(payload))
        }
        Err(e) => Err(err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
    }
}

async fn sync_schedule(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;

    let semester = client.get_current_semester().await.unwrap_or_else(|_| "2024-2025-1".to_string());
    let calendar_data = client.fetch_calendar_data(Some(semester.clone())).await;
    let (current_week, start_date) = if let Ok(ref cal) = calendar_data {
        let meta = cal.get("meta");
        let week = meta.and_then(|m| m.get("current_week")).and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let start = meta.and_then(|m| m.get("start_date")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        (week, start)
    } else {
        (1, String::new())
    };

    let (course_list, _now_week) = client.fetch_schedule().await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?;

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

async fn fetch_exams(State(state): State<HttpState>, Json(req): Json<ExamRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    match client.fetch_exams(req.semester.as_deref()).await {
        Ok(exams) => {
            let payload = serde_json::json!({
                "success": true,
                "data": exams,
                "sync_time": chrono::Local::now().to_rfc3339(),
                "offline": false
            });
            Ok(ok(payload))
        }
        Err(e) => Err(err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
    }
}

async fn fetch_ranking(State(state): State<HttpState>, Json(req): Json<RankingRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_ranking(req.student_id.as_deref(), req.semester.as_deref()).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_student_info(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_student_info().await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_semesters(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_semesters().await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_classroom_buildings(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_classroom_buildings().await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_classrooms(State(state): State<HttpState>, Json(req): Json<ClassroomQueryRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_classrooms_query(req.week, req.weekday, req.periods, req.building).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_training_plan_options(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_training_plan_options().await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_training_plan_jys(State(state): State<HttpState>, Json(req): Json<TrainingPlanJysRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_training_plan_jys(&req.yxid).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_training_plan_courses(State(state): State<HttpState>, Json(req): Json<TrainingPlanCoursesRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_training_plan_courses(
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
    ).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_calendar_data(State(state): State<HttpState>, Json(req): Json<CalendarRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_calendar_data(req.semester).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_academic_progress(State(state): State<HttpState>, Json(req): Json<AcademicProgressRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_academic_progress(req.fasz.unwrap_or(1)).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn cache_get(
    State(state): State<HttpState>,
    Query(req): Query<CacheGetQuery>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    ensure_local_cache_auth(&headers, &state)?;

    let table = req.table.trim();
    let key = req.key.trim();
    if table.is_empty() || key.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "参数错误", "table 和 key 不能为空".to_string()));
    }
    if !is_allowed_cache_table(table) {
        return Err(err(StatusCode::BAD_REQUEST, "参数错误", "不允许访问该缓存表".to_string()));
    }

    match db::get_cache(DB_FILENAME, table, key) {
        Ok(Some((data, sync_time))) => {
            let payload = serde_json::json!({
                "success": true,
                "data": data,
                "sync_time": sync_time,
                "offline": true
            });
            Ok(ok(payload))
        }
        Ok(None) => Err(err(StatusCode::NOT_FOUND, "未找到", "缓存不存在".to_string())),
        Err(e) => Err(err(StatusCode::INTERNAL_SERVER_ERROR, "系统错误", e.to_string())),
    }
}

async fn fetch_qxzkb_options() -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    Ok(ok(crate::qxzkb_options::qxzkb_options()))
}

async fn fetch_qxzkb_jcinfo(State(state): State<HttpState>, Json(req): Json<QxzkbJcinfoRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_qxzkb_jcinfo(&req.xnxq).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_qxzkb_zyxx(State(state): State<HttpState>, Json(req): Json<QxzkbZyxxRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_qxzkb_zyxx(&req.yxid, &req.nj).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_qxzkb_kkjys(State(state): State<HttpState>, Json(req): Json<QxzkbKkjysRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let client = state.client.lock().await;
    client.fetch_qxzkb_kkjys(&req.kkyxid).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_qxzkb_list(State(state): State<HttpState>, Json(query): Json<QxzkbQuery>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if query.xnxq.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", "请选择学年学期".to_string()));
    }

    let client = state.client.lock().await;
    let mut params: HashMap<String, String> = HashMap::new();
    params.insert("queryFields".to_string(), crate::qxzkb_options::QXZKB_QUERY_FIELDS.to_string());
    params.insert("_search".to_string(), "false".to_string());
    params.insert("nd".to_string(), Utc::now().timestamp_millis().to_string());
    params.insert("xnxq".to_string(), query.xnxq.clone());

    let get_val = |val: &Option<String>| -> String {
        val.as_ref()
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .unwrap_or("")
            .to_string()
    };

    params.insert("xqid".to_string(), get_val(&query.xqid));
    params.insert("nj".to_string(), get_val(&query.nj));
    params.insert("yxid".to_string(), get_val(&query.yxid));
    params.insert("zyid".to_string(), get_val(&query.zyid));
    params.insert("kkyxid".to_string(), get_val(&query.kkyxid));
    params.insert("kkjysid".to_string(), get_val(&query.kkjysid));
    params.insert("kcxz".to_string(), get_val(&query.kcxz));
    params.insert("kclb".to_string(), get_val(&query.kclb));
    params.insert("xslx".to_string(), get_val(&query.xslx));
    params.insert("kcmc".to_string(), get_val(&query.kcmc));
    params.insert("skjs".to_string(), get_val(&query.skjs));
    params.insert("jxlid".to_string(), get_val(&query.jxlid));
    params.insert("jslx".to_string(), get_val(&query.jslx));
    params.insert("ksxs".to_string(), get_val(&query.ksxs));
    params.insert("ksfs".to_string(), get_val(&query.ksfs));
    params.insert("jsmc".to_string(), get_val(&query.jsmc));
    params.insert("zxjc".to_string(), get_val(&query.zxjc));
    params.insert("zdjc".to_string(), get_val(&query.zdjc));
    params.insert("zxxq".to_string(), get_val(&query.zxxq));
    params.insert("zdxq".to_string(), get_val(&query.zdxq));

    let xsqbkb = query.xsqbkb.clone().unwrap_or_else(|| "0".to_string());
    params.insert("xsqbkb".to_string(), xsqbkb.clone());
    if xsqbkb != "1" {
        params.insert("zxzc".to_string(), get_val(&query.zxzc));
        params.insert("zdzc".to_string(), get_val(&query.zdzc));
    }

    let kklx = query.kklx.as_ref()
        .map(|list| list.iter()
            .filter(|v| !v.trim().is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join(","))
        .unwrap_or_default();
    params.insert("kklx".to_string(), kklx.clone());

    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50);
    params.insert("page.pn".to_string(), page.to_string());
    params.insert("page.size".to_string(), page_size.to_string());
    let sort = query.sort.as_deref().unwrap_or("kcmc");
    let sort = if sort.trim().is_empty() { "kcmc" } else { sort };
    let order = query.order.as_deref().unwrap_or("asc");
    let order = if order.trim().is_empty() { "asc" } else { order };
    params.insert("sort".to_string(), sort.to_string());
    params.insert("order".to_string(), order.to_string());

    let query_fields = vec![
        "xnxq", "xqid", "nj", "yxid", "zyid", "kkyxid", "kkjysid", "kcxz", "kclb",
        "xslx", "kcmc", "skjs", "jxlid", "jslx", "ksxs", "ksfs", "jsmc",
        "zxjc", "zdjc", "zxzc", "zdzc", "zxxq", "zdxq", "xsqbkb", "kklx"
    ];
    for key in query_fields {
        if xsqbkb == "1" && (key == "zxzc" || key == "zdzc") {
            continue;
        }
        let value = params.get(key).cloned().unwrap_or_default();
        params.insert(format!("query.{}||", key), value);
    }

    client.fetch_qxzkb_list(&params).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn electricity_query_location(State(state): State<HttpState>, Json(req): Json<ElectricityRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.query_electricity_location(req.payload).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn electricity_query_account(State(state): State<HttpState>, Json(req): Json<ElectricityRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.query_electricity_account(req.payload).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn fetch_transaction_history(State(state): State<HttpState>, Json(req): Json<TransactionRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.fetch_transaction_history(&req.start_date, &req.end_date, req.page_no, req.page_size).await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn one_code_token(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    client.get_one_code_token().await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))
}

async fn ai_init(State(state): State<HttpState>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let mut client = state.client.lock().await;
    let result = std::panic::AssertUnwindSafe(client.init_ai_session())
        .catch_unwind()
        .await;
    match result {
        Ok(Ok((token, blade_auth))) => Ok(ok(serde_json::json!({
            "success": true,
            "token": token,
            "blade_auth": blade_auth
        }))),
        Ok(Err(e)) => Err(err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string())),
        Err(panic) => {
            let msg = if let Some(s) = panic.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic".to_string()
            };
            eprintln!("[HTTP] AI åå§å?panic: {}", msg);
            Err(err(StatusCode::INTERNAL_SERVER_ERROR, "ç³»ç»éè¯¯", format!("ai_init panic: {}", msg)))
        }
    }
}

async fn ai_upload(State(_state): State<HttpState>, Json(req): Json<AiUploadRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let res = crate::modules::ai::hbut_ai_upload(req.token, req.blade_auth, req.file_content, req.file_name).await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?;
    Ok(ok(serde_json::json!({
        "success": res.success,
        "link": res.link,
        "msg": res.msg
    })))
}

async fn ai_chat(State(_state): State<HttpState>, Json(req): Json<AiChatRequest>) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let res = crate::modules::ai::hbut_ai_chat(
        req.token,
        req.blade_auth,
        req.question,
        req.upload_url.unwrap_or_default(),
        req.model,
    ).await.map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?;
    Ok(ok(serde_json::json!({"success": true, "data": res})))
}

async fn ai_chat_stream(
    State(_state): State<HttpState>,
    Json(req): Json<AiChatRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let token = req.token;
    let blade_auth = req.blade_auth;
    let question = req.question;
    let model = req.model;
    let mut final_upload_url = req.upload_url.unwrap_or_default();

    if final_upload_url.trim().is_empty() {
        let empty_name = format!("empty_{}.txt", Utc::now().timestamp_millis());
        let upload = crate::modules::ai::hbut_ai_upload(
            token.clone(),
            blade_auth.clone(),
            "".to_string(),
            empty_name,
        )
        .await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?;
        final_upload_url = upload.link;
    }

    let url = "https://virtualhuman2h5.59wanmei.com/apis/virtualhuman/serverApi/question/streamAnswer";
    let mut headers = HeaderMap::new();
    if !blade_auth.is_empty() {
        headers.insert("blade-auth", HeaderValue::from_str(&blade_auth).map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?);
    }
    headers.insert("Accept", HeaderValue::from_static("text/event-stream"));
    headers.insert("Accept-Encoding", HeaderValue::from_static("identity"));
    headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));
    let referer = format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", token);
    headers.insert("Referer", HeaderValue::from_str(&referer).map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?);

    let session_id = format!("session-{}", Utc::now().timestamp_millis());
    let timestamp = Utc::now().timestamp_millis().to_string();
    let selected_model = if model.trim().is_empty() { "qwen-max" } else { model.as_str() };

    let params = [
        ("ask", question.as_str()),
        ("sessionId", session_id.as_str()),
        ("model", selected_model),
        ("timestamp", timestamp.as_str()),
        ("serviceModel", "default"),
        ("datasetFlag", "0"),
        ("networkFlag", "0"),
        ("uploadUrl", final_upload_url.as_str()),
    ];

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .headers(headers)
        .form(&params)
        .send()
        .await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "ä¸å¡éè¯¯", e.to_string()))?;

    let mut stream = response.bytes_stream();
    let event_stream = async_stream::stream! {
        let mut buffer = String::new();
        let mut emitted_count: usize = 0;
        use tokio::time::{timeout, Duration};
        let start = Instant::now();
        let max_duration = Duration::from_secs(180);
        let idle_timeout = Duration::from_secs(60);
        loop {
            if start.elapsed() > max_duration {
                yield Ok(Event::default().data("[DONE]"));
                return;
            }
            let next = timeout(idle_timeout, stream.next()).await;
            let item = match next {
                Ok(Some(item)) => item,
                Ok(None) => break,
                Err(_) => {
                    yield Ok(Event::default().data("[DONE]"));
                    return;
                }
            };
            let chunk = match item {
                Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
                Err(_) => break,
            };
            if chunk.is_empty() {
                continue;
            }
            buffer.push_str(&chunk);
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();
                if line.is_empty() {
                    continue;
                }
                for payload in handle_ai_stream_line(&line) {
                    if payload == "[DONE]" {
                        yield Ok(Event::default().data("[DONE]"));
                        return;
                    }
                    emitted_count += 1;
                    yield Ok(Event::default().data(payload));
                    tokio::time::sleep(Duration::from_millis(8)).await;
                }
            }
            for raw in drain_json_objects(&mut buffer) {
                if raw.trim().is_empty() {
                    continue;
                }
                for payload in handle_ai_stream_line(&raw) {
                    if payload == "[DONE]" {
                        yield Ok(Event::default().data("[DONE]"));
                        return;
                    }
                    emitted_count += 1;
                    yield Ok(Event::default().data(payload));
                    tokio::time::sleep(Duration::from_millis(8)).await;
                }
            }
        }
        if !buffer.trim().is_empty() {
            let final_text = crate::modules::ai::parse_ai_stream_text(&buffer);
            if !final_text.trim().is_empty() {
                if emitted_count == 0 {
                    for chunk in chunk_stream_text(&final_text) {
                        let payload = serde_json::json!({"type": 1, "content": chunk}).to_string();
                        yield Ok(Event::default().data(payload));
                        tokio::time::sleep(Duration::from_millis(25)).await;
                    }
                } else {
                    let payload = serde_json::json!({"type": 1, "content": final_text}).to_string();
                    yield Ok(Event::default().data(payload));
                }
            }
        }
        yield Ok(Event::default().data("[DONE]"));
    };

    Ok(Sse::new(event_stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(10))
            .text("keep-alive"),
    ))
}

fn handle_ai_stream_line(raw_line: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut raw = raw_line.trim();
    if let Some(stripped) = raw.strip_prefix("data:") {
        raw = stripped.trim();
    }
    if raw.is_empty() {
        return out;
    }
    if raw == "[DONE]" {
        out.push("[DONE]".to_string());
        return out;
    }
    if raw.len() >= 120 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
        if crate::modules::ai::is_hex_gibberish_run(raw) {
            out.push("[DONE]".to_string());
            return out;
        }
    }
    let mut extracted: Option<String> = None;
    let mut found_type: Option<i64> = None;
    if raw.starts_with('{') || raw.starts_with('[') {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(raw) {
            if let Some((t, content, thinking)) = crate::modules::ai::extract_stream_fields(&json) {
                found_type = t;
                if t == Some(11) {
                    if let Some(thinking_text) = thinking {
                        out.push(serde_json::json!({"type": 11, "thinking": thinking_text}).to_string());
                    }
                    return out;
                }
                if t == Some(1) {
                    let content_text = content.or(thinking);
                    if let Some(content_text) = content_text {
                        if content_text.trim().is_empty() {
                            return out;
                        }
                        for chunk in chunk_stream_text(&content_text) {
                            out.push(serde_json::json!({"type": 1, "content": chunk}).to_string());
                        }
                        return out;
                    }
                }
            }
            if let Some(t) = found_type {
                if t != 1 && t != 11 {
                    if let Some(extracted_text) = crate::modules::ai::extract_text_from_value(&json) {
                        let cleaned = crate::modules::ai::clean_stream_chunk(&extracted_text);
                        if let Some(cleaned) = cleaned {
                            for chunk in chunk_stream_text(&cleaned) {
                                out.push(serde_json::json!({"type": 1, "content": chunk}).to_string());
                            }
                        }
                    }
                    return out;
                }
            }
            extracted = crate::modules::ai::extract_text_from_value(&json);
        }
    }
    let candidate = extracted.unwrap_or_else(|| raw.to_string());
    if let Some(cleaned) = crate::modules::ai::clean_stream_chunk(&candidate) {
        for chunk in chunk_stream_text(&cleaned) {
            out.push(serde_json::json!({"type": 1, "content": chunk}).to_string());
        }
    }
    out
}

fn drain_json_objects(buffer: &mut String) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut start: Option<usize> = None;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;
    let mut last_end = 0usize;

    for (i, ch) in buffer.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        } else if ch == '"' {
            in_string = true;
            continue;
        }

        if ch == '{' || ch == '[' {
            if depth == 0 {
                start = Some(i);
            }
            depth += 1;
            continue;
        }

        if ch == '}' || ch == ']' {
            if depth > 0 {
                depth -= 1;
                if depth == 0 {
                    if let Some(s) = start {
                        out.push(buffer[s..=i].to_string());
                        last_end = i + 1;
                        start = None;
                    }
                }
            }
        }
    }

    if last_end > 0 {
        buffer.replace_range(0..last_end, "");
    } else if start.is_none() && buffer.len() > 65536 {
        buffer.clear();
    }

    out
}

fn chunk_stream_text(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.len() <= 80 {
        return vec![text.to_string()];
    }
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if current.len() >= 24 {
            out.push(current);
            current = String::new();
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}
