//! 教务/学术领域 Tauri commands：考试、排名、学籍、学期、教室、培养方案、校历、图书馆。

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;
use crate::application;
use crate::db;
use crate::transport::tauri::common::attach_sync_time;
use crate::DB_FILENAME;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exam {
    pub course_name: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub location: String,
    pub seat_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ranking {
    pub class_rank: i32,
    pub class_total: i32,
    pub major_rank: i32,
    pub major_total: i32,
    pub college_rank: i32,
    pub college_total: i32,
    pub gpa: f64,
    pub average_score: f64,
    pub total_credits: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Classroom {
    pub name: String,
    pub building: String,
    pub capacity: i32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub date: String,
    pub title: String,
    pub event_type: String,
}

fn build_public_cache_key(prefix: &str, payload: &str) -> String {
    let encoded = general_purpose::STANDARD.encode(payload.as_bytes());
    format!("{}:{}", prefix, encoded)
}

#[tauri::command]
pub(crate) async fn fetch_exams(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    application::AcademicReadService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .fetch_exams(semester)
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_ranking(
    state: State<'_, AppState>,
    student_id: Option<String>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    application::AcademicReadService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .fetch_ranking(student_id, semester)
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_student_info(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    application::AcademicReadService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .fetch_student_info()
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_personal_login_access_info(
    state: State<'_, AppState>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let uid = client
        .user_info
        .as_ref()
        .map(|u| u.student_id.clone())
        .or_else(|| client.last_username.clone());
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(10).clamp(1, 100);
    let cache_key = uid
        .as_ref()
        .map(|u| format!("{}:p{}:s{}", u, page, page_size));

    match client
        .fetch_personal_login_access_info(Some(page), Some(page_size))
        .await
    {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(cache_key) = &cache_key {
                let _ = db::save_cache(
                    DB_FILENAME,
                    "student_login_access_cache",
                    cache_key,
                    &payload,
                );
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(cache_key) = &cache_key {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "student_login_access_cache", cache_key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_semesters(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match client.fetch_semesters().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "semesters_public_cache", "semesters", &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "semesters_public_cache", "semesters")
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_classroom_buildings(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match client.fetch_classroom_buildings().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "classroom_public_cache", "buildings", &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "classroom_public_cache", "buildings")
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_classrooms(
    state: State<'_, AppState>,
    week: Option<i32>,
    weekday: Option<i32>,
    periods: Option<Vec<i32>>,
    building: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let periods_key = periods
        .as_ref()
        .map(|p| {
            p.iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    let building_key = building.clone().unwrap_or_default();
    let cache_key = uid.as_ref().map(|u| {
        format!(
            "{}:classroom:{}:{}:{}:{}",
            u,
            week.unwrap_or_default(),
            weekday.unwrap_or_default(),
            periods_key,
            building_key
        )
    });

    match client
        .fetch_classrooms_query(week, weekday, periods, building)
        .await
    {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "classroom_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "classroom_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_training_plan_options(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let cache_key = uid.as_ref().map(|u| format!("{}:options", u));
    match client.fetch_training_plan_options().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "training_plan_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "training_plan_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_training_plan_jys(
    state: State<'_, AppState>,
    yxid: String,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let cache_key = uid.as_ref().map(|u| format!("{}:jys:{}", u, yxid));
    match client.fetch_training_plan_jys(&yxid).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "training_plan_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "training_plan_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_training_plan_courses(
    state: State<'_, AppState>,
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
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let cache_key = uid.as_ref().map(|u| {
        format!(
            "{}:courses:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
            u,
            grade.clone().unwrap_or_default(),
            kkxq.clone().unwrap_or_default(),
            kkyx.clone().unwrap_or_default(),
            kkjys.clone().unwrap_or_default(),
            kcxz.clone().unwrap_or_default(),
            kcgs.clone().unwrap_or_default(),
            kcbh.clone().unwrap_or_default(),
            kcmc.clone().unwrap_or_default(),
            page.unwrap_or(1),
            page_size.unwrap_or(50)
        )
    });

    match client
        .fetch_training_plan_courses(
            grade, kkxq, kkyx, kkjys, kcxz, kcgs, kcbh, kcmc, page, page_size,
        )
        .await
    {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "training_plan_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "training_plan_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_calendar(
    state: State<'_, AppState>,
) -> Result<Vec<CalendarEvent>, String> {
    let client = state.client.write().await;
    client.fetch_calendar().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_calendar_data(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let sem_key = semester.clone().unwrap_or_else(|| "current".to_string());
    match client.fetch_calendar_data(semester).await {
        Ok(data) => {
            let success = data
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let need_login = data
                .get("need_login")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            // 仅成功响应写缓存并刷新 sync_time；失败写缓存会污染离线语义（#489）
            if success {
                let sync_time = chrono::Local::now().to_rfc3339();
                let payload = attach_sync_time(data, &sync_time, false);
                let _ = db::save_cache(DB_FILENAME, "calendar_public_cache", &sem_key, &payload);
                return Ok(payload);
            }

            // 会话失效：透传 need_login，不把失败响应当成功离线数据
            if need_login {
                return Ok(data);
            }

            // 其它业务失败：有缓存则标 offline 返回，便于前端区分网络离线
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "calendar_public_cache", &sem_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Ok(data)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "calendar_public_cache", &sem_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_academic_progress(
    state: State<'_, AppState>,
    fasz: Option<i32>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let fasz_val = fasz.unwrap_or(1);
    let cache_key = uid.as_ref().map(|u| format!("{}:{}", u, fasz_val));
    match client.fetch_academic_progress(fasz_val).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "academic_progress_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "academic_progress_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_library_dict(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let cache_key = "dict";
    match client.fetch_library_dict().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "library_public_cache", cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "library_public_cache", cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn search_library_books(
    state: State<'_, AppState>,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let raw = params.to_string();
    let cache_key = build_public_cache_key("search", &raw);

    match client.search_library_books(params).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "library_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "library_public_cache", &cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_library_book_detail(
    state: State<'_, AppState>,
    title: String,
    isbn: String,
    record_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let raw = format!("{}|{}|{}", title, isbn, record_id.unwrap_or_default());
    let cache_key = build_public_cache_key("detail", &raw);

    match client
        .fetch_library_book_detail(&title, &isbn, record_id)
        .await
    {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "library_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "library_public_cache", &cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}
