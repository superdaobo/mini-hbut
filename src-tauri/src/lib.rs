use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tauri::State;
use chrono::Datelike;

mod http_client;
mod parser;
mod db;

use http_client::HbutClient;

// ... imports

const DB_FILENAME: &str = "grades.db";

// ... existing code ...

// 应用状态
pub struct AppState {
    pub client: Mutex<HbutClient>,
}

// 数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub student_id: String,
    pub student_name: String,
    pub college: Option<String>,
    pub major: Option<String>,
    pub class_name: Option<String>,
    pub grade: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginPageInfo {
    pub lt: String,
    pub execution: String,
    pub captcha_required: bool,
    pub salt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grade {
    pub term: String,
    pub course_name: String,
    pub course_nature: String,
    pub course_credit: String,
    pub final_score: String,
    pub earned_credit: String,
    pub teacher: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCourse {
    pub id: String,
    pub name: String,
    pub teacher: String,
    pub room: String,
    pub room_code: String,
    pub building: String,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    pub weeks_text: String,
    pub credit: String,
    pub class_name: String,
}

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

// Tauri 命令

#[tauri::command]
async fn get_login_page(state: State<'_, AppState>) -> Result<LoginPageInfo, String> {
    let mut client = state.client.lock().await;
    client.get_login_page().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_captcha(state: State<'_, AppState>) -> Result<String, String> {
    let client = state.client.lock().await;
    client.get_captcha().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn recognize_captcha(image_base64: String) -> Result<String, String> {
    // 调用 OCR 服务识别验证码
    // 这里可以使用本地 OCR 或远程服务
    let client = reqwest::Client::new();
    
    // 尝试调用本地 Python 后端的 OCR
    let response = client
        .post("http://127.0.0.1:8000/api/ocr/base64")
        .json(&serde_json::json!({ "image": image_base64 }))
        .send()
        .await
        .map_err(|e| format!("OCR 请求失败: {}", e))?;
    
    if response.status().is_success() {
        let result: serde_json::Value = response.json().await
            .map_err(|e| format!("解析 OCR 响应失败: {}", e))?;
        
        if let Some(code) = result.get("code").and_then(|v| v.as_str()) {
            return Ok(code.to_string());
        }
    }
    
    Err("OCR 识别失败".to_string())
}

#[tauri::command]
async fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
    captcha: Option<String>,
    lt: Option<String>,
    execution: Option<String>,
) -> Result<UserInfo, String> {
    println!("[DEBUG] Command login called with: username={}, password len={}, captcha={:?}, lt={:?}, execution={:?}", 
             username, password.len(), captcha, lt, execution);
    let mut client = state.client.lock().await;
    client
        .login(
            &username, 
            &password, 
            &captcha.unwrap_or_default(), 
            &lt.unwrap_or_default(), 
            &execution.unwrap_or_default()
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let mut client = state.client.lock().await;
    client.clear_session();
    Ok(())
}

#[tauri::command]
async fn restore_session(
    state: State<'_, AppState>,
    cookies: String,
) -> Result<UserInfo, String> {
    let mut client = state.client.lock().await;
    client.restore_session(&cookies).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_cookies(state: State<'_, AppState>) -> Result<String, String> {
    let client = state.client.lock().await;
    Ok(client.get_cookies())
}

#[tauri::command]
async fn refresh_session(state: State<'_, AppState>) -> Result<UserInfo, String> {
    let mut client = state.client.lock().await;
    client.refresh_session().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_grades(state: State<'_, AppState>) -> Result<Vec<Grade>, String> {
    let client = state.client.lock().await;
    let grades = client.fetch_grades().await.map_err(|e| e.to_string())?;
    
    // 保存到本地数据库
    if let Some(user_info) = &client.user_info {
        if let Ok(json) = serde_json::to_value(&grades) {
            let _ = db::save_cache(DB_FILENAME, "grades_cache", &user_info.student_id, &json);
        }
    }
    
    Ok(grades)
}

#[tauri::command]
async fn get_grades_local(student_id: String) -> Result<Option<serde_json::Value>, String> {
    match db::get_cache(DB_FILENAME, "grades_cache", &student_id) {
        Ok(Some((data, sync_time))) => {
            Ok(Some(serde_json::json!({
                "success": true,
                "data": data,
                "sync_time": sync_time
            })))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ... sync_schedule, get_schedule_local similarly ...

#[tauri::command]
async fn sync_schedule(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    
    // 获取当前学期（基于日期计算）
    let semester = client.get_current_semester().await.unwrap_or_else(|_| "2024-2025-1".to_string());
    
    // 获取校历数据计算当前周次和开始日期
    let calendar_data = client.fetch_calendar_data(Some(semester.clone())).await;
    let (current_week, start_date) = if let Ok(ref cal) = calendar_data {
        let meta = cal.get("meta");
        let week = meta.and_then(|m| m.get("current_week")).and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let start = meta.and_then(|m| m.get("start_date")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        (week, start)
    } else {
        (1, String::new())
    };
    
    let (course_list, _now_week) = client.fetch_schedule().await.map_err(|e| e.to_string())?;
    
    // 使用 Python 格式的响应结构
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
        "sync_time": chrono::Local::now().to_rfc3339()
    });

    if let Some(user_info) = &client.user_info {
        let _ = db::save_cache(DB_FILENAME, "schedule_cache", &user_info.student_id, &result);
    }
    
    Ok(result)
}

#[tauri::command]
async fn get_schedule_local(student_id: String) -> Result<Option<serde_json::Value>, String> {
    match db::get_cache(DB_FILENAME, "schedule_cache", &student_id) {
        Ok(Some((data, sync_time))) => {
            Ok(Some(serde_json::json!({
                "success": true,
                "data": data,
                "sync_time": sync_time
            })))
        },
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_exams(state: State<'_, AppState>, semester: Option<String>) -> Result<Vec<Exam>, String> {
    let client = state.client.lock().await;
    client.fetch_exams(semester.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_ranking(
    state: State<'_, AppState>, 
    student_id: Option<String>,
    semester: Option<String>
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let sid = student_id.or_else(|| client.user_info.as_ref().map(|u| u.student_id.clone()));
    client.fetch_ranking(sid.as_deref(), semester.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_student_info(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_student_info().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_semesters(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_semesters().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_classroom_buildings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_classroom_buildings().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_classrooms(
    state: State<'_, AppState>,
    week: Option<i32>,
    weekday: Option<i32>,
    periods: Option<Vec<i32>>,
    building: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_classrooms_query(week, weekday, periods, building).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_training_plan_options(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_training_plan_options().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_training_plan_jys(state: State<'_, AppState>, yxid: String) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_training_plan_jys(&yxid).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_training_plan_courses(
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
    let client = state.client.lock().await;
    client.fetch_training_plan_courses(grade, kkxq, kkyx, kkjys, kcxz, kcgs, kcbh, kcmc, page, page_size)
        .await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_calendar(state: State<'_, AppState>) -> Result<Vec<CalendarEvent>, String> {
    let client = state.client.lock().await;
    client.fetch_calendar().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_calendar_data(state: State<'_, AppState>, semester: Option<String>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_calendar_data(semester).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_academic_progress(state: State<'_, AppState>, fasz: Option<i32>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    client.fetch_academic_progress(fasz.unwrap_or(1)).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn electricity_query_location(state: State<'_, AppState>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    client.query_electricity_location(payload).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn electricity_query_account(state: State<'_, AppState>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    client.query_electricity_account(payload).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn refresh_electricity_token(state: State<'_, AppState>) -> Result<bool, String> {
    let mut client = state.client.lock().await;
    client.ensure_electricity_token().await.map(|_| true).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化数据库
    if let Err(e) = db::init_db(DB_FILENAME) {
        eprintln!("Failed to initialize database: {}", e);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            client: Mutex::new(HbutClient::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_login_page,
            get_captcha,
            recognize_captcha,
            login,
            logout,
            restore_session,
            get_cookies,
            refresh_session,
            sync_grades,
            get_grades_local,
            sync_schedule,
            get_schedule_local,
            fetch_exams,
            fetch_ranking,
            fetch_student_info,
            fetch_semesters,
            fetch_classroom_buildings,
            fetch_classrooms,
            fetch_training_plan_options,
            fetch_training_plan_jys,
            fetch_training_plan_courses,
            fetch_calendar,
            fetch_calendar_data,
            fetch_academic_progress,
            electricity_query_location,
            electricity_query_account,
            refresh_electricity_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
