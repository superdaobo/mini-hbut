// lib.rs
//
// 逻辑文档: lib_logic.md
// 模块功能: Tauri 后端逻辑入口
// 
// 本文件主要职责:
// 1. 定义应用状态 (AppState) 和全局单例 HbutClient
// 2. 将 HbutClient 的功能包装为 Tauri Commands 供前端调用
// 3. 定义数据传输对象 (DTOs)
// 4. 实现简单的缓存/持久化策略 (调用 db 模块)
//
// 依赖关系:
// lib.rs -> http_client.rs (业务逻辑)
// lib.rs -> db.rs (数据存储)
// lib.rs -> modules/ (特定功能模块)

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use std::sync::Arc;
use tauri::{State, Manager};
use chrono::Datelike;

pub mod http_client;
pub mod parser;
pub mod db;
pub mod modules;
pub mod http_server;

use http_client::HbutClient;


use modules::ai::*;
use modules::one_code::*;

// ... imports


const DB_FILENAME: &str = "grades.db";

// ... existing code ...

// 应用状态
pub struct AppState {
    pub client: Arc<Mutex<HbutClient>>,
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
    pub is_already_logged_in: bool,
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
async fn set_ocr_endpoint(state: State<'_, AppState>, endpoint: String) -> Result<(), String> {
    let mut client = state.client.lock().await;
    client.set_ocr_endpoint(endpoint);
    Ok(())
}

#[tauri::command]
async fn fetch_remote_config(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;

    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| format!("读取响应失败: {}", e))?;

    if !status.is_success() {
        return Err(format!("请求失败: {}", status));
    }

    serde_json::from_str(&text).map_err(|e| format!("解析 JSON 失败: {}", e))
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
        .map_err(|e| e.to_string())?;

    // 尝试获取电费 Token (One Code)
    let one_code_token = match client.ensure_electricity_token().await {
        Ok(t) => {
            println!("[DEBUG] Login: Successfully obtained one_code_token");
            t
        },
        Err(e) => {
            println!("[WARN] Login: Failed to get one_code_token: {}", e);
            String::new()
        }
    };

    // 保存会话到本地数据库 (用于自动重连)
    if let Err(e) = db::save_user_session(DB_FILENAME, &username, &client.get_cookies(), &password, &one_code_token) {
        println!("[WARN] Failed to save session: {}", e);
    }

    Ok(client.user_info.clone().unwrap())
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
    let user_info = client.restore_session(&cookies).await.map_err(|e| e.to_string())?;

    // 尝试从数据库加载凭据 (用于 SSO)
    match db::get_user_session(DB_FILENAME, &user_info.student_id) {
        Ok(Some((_, password, token))) => {
            println!("[DEBUG] Restored credentials for user: {}", user_info.student_id);
            client.set_credentials(user_info.student_id.clone(), password);
            if !token.is_empty() {
                client.set_electricity_token(token);
                println!("[DEBUG] Restored one_code_token");
            }
        },
        Ok(None) => println!("[DEBUG] No saved credentials found for user: {}", user_info.student_id),
        Err(e) => println!("[WARN] Failed to load session credentials: {}", e),
    }

    Ok(user_info)
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

#[tauri::command]
async fn fetch_transaction_history(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
    page_no: i32,
    page_size: i32
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;

    // 缓存键名构造: transaction_{学号}
    // 只有在已登录状态下才能正确读写缓存
    
    // 策略: Network First (优先网络请求)
    // 如果网络请求成功，且数据量较大(>=50条)，则视为可以更新缓存
    // 如果网络请求失败，侧降级读取本地缓存
    match client.fetch_transaction_history(&start_date, &end_date, page_no, page_size).await {
        Ok(data) => {
             // 成功获取数据
             // 仅当请求数据量足够覆盖常规显示时，更新缓存
             if page_size >= 50 {
                 if let Some(uid) = &client.user_info.as_ref().map(|u| u.student_id.clone()) {
                     let _ = db::save_cache(DB_FILENAME, "transaction_cache", uid, &data);
                 }
             }
             Ok(data)
        },
        Err(e) => {
            println!("[WARN] Transaction network fetch failed: {}, trying cache...", e);
            // 网络失败，尝试读取缓存
            if let Some(uid) = &client.user_info.as_ref().map(|u| u.student_id.clone()) {
                 if let Ok(Some((cached_data, _))) = db::get_cache(DB_FILENAME, "transaction_cache", uid) {
                     return Ok(cached_data);
                 }
            }
            // 既无网络也无缓存，返回错误
            Err(e.to_string())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化数据库
    if let Err(e) = db::init_db(DB_FILENAME) {
        eprintln!("Failed to initialize database: {}", e);
    }

    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--flag1", "--flag2"])));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            fn find_file_in_parents(file_name: &str, max_depth: usize) -> Option<std::path::PathBuf> {
                let mut dir = std::env::current_dir().ok()?;
                for _ in 0..=max_depth {
                    let candidate = dir.join(file_name);
                    if candidate.exists() {
                        return Some(candidate);
                    }
                    if !dir.pop() {
                        break;
                    }
                }
                None
            }
            fn extract_cookie_segment(raw: &str, label: &str) -> Option<String> {
                let marker = format!("{}:", label);
                let pos = raw.find(&marker)?;
                let after = &raw[pos + marker.len()..];
                let end = after.find('|').unwrap_or(after.len());
                let segment = after[..end].trim();
                if segment.is_empty() { None } else { Some(segment.to_string()) }
            }

            fn clean_cookie_string(raw: &str) -> String {
                raw.replace("Code:", "")
                    .replace("Auth:", "")
                    .replace("Jwxt:", "")
                    .replace(" | ", "; ")
                    .trim()
                    .to_string()
            }

            fn read_access_token_from_capture(paths: &[std::path::PathBuf]) -> Option<String> {
                let token_re = regex::Regex::new(r#"\"accessToken\"\s*:\s*\"([^\"]+)\""#).ok()?;
                let auth_re = regex::Regex::new(r#"\"authorization\"\s*:\s*\"([^\"]+)\""#).ok()?;
                for path in paths {
                    let text = std::fs::read_to_string(path).ok()?;
                    let mut last: Option<String> = None;
                    for cap in token_re.captures_iter(&text) {
                        if let Some(m) = cap.get(1) {
                            let value = m.as_str().trim().to_string();
                            if !value.is_empty() {
                                last = Some(value);
                            }
                        }
                    }
                    if last.is_none() {
                        for cap in auth_re.captures_iter(&text) {
                            if let Some(m) = cap.get(1) {
                                let value = m.as_str().trim().to_string();
                                if !value.is_empty() {
                                    last = Some(value);
                                }
                            }
                        }
                    }
                    if last.is_some() {
                        return last;
                    }
                }
                None
            }

            let app_handle = app.handle().clone();
            crate::modules::notification::init_background_task(app_handle);
            // 启动时尝试加载最近一次会话凭据
            let mut restored_any = false;
            let mut token_loaded = false;
            if let Ok(Some((student_id, cookies, password, token))) = db::get_latest_user_session(DB_FILENAME) {
                let mut code_cookie = None;
                let mut auth_cookie = None;
                let mut jwxt_cookie = None;
                if !cookies.is_empty() {
                    code_cookie = extract_cookie_segment(&cookies, "Code");
                    auth_cookie = extract_cookie_segment(&cookies, "Auth");
                    jwxt_cookie = extract_cookie_segment(&cookies, "Jwxt");
                }

                let should_restore = code_cookie.is_some() || auth_cookie.is_some() || jwxt_cookie.is_some();
                let should_set_credentials = !password.is_empty();
                let should_set_token = !token.is_empty();

                if should_restore {
                    restored_any = true;
                }
                if should_set_token {
                    token_loaded = true;
                }

                if should_restore || should_set_credentials || should_set_token {
                    let state = app.state::<AppState>();
                    tauri::async_runtime::block_on(async {
                        let mut client = state.client.lock().await;
                        if should_restore {
                            let _ = client.restore_cookie_snapshot(code_cookie, auth_cookie, jwxt_cookie);
                        }
                        if should_set_credentials {
                            client.set_credentials(student_id, password);
                        }
                        if should_set_token {
                            client.set_electricity_token(token);
                        }
                    });
                }
            }
            if !restored_any {
                if let Some(path) = find_file_in_parents("rust_backend_session.json", 6) {
                    if let Ok(text) = std::fs::read_to_string(path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(snapshot) = json.get("cookie_snapshot") {
                            let code_raw = snapshot.get("code").and_then(|v| v.as_str()).unwrap_or("");
                            let auth_raw = snapshot.get("auth").and_then(|v| v.as_str()).unwrap_or("");
                            let jwxt_raw = snapshot.get("jwxt").and_then(|v| v.as_str()).unwrap_or("");

                            let cleaned_code = clean_cookie_string(code_raw);
                            let cleaned_auth = clean_cookie_string(auth_raw);
                            let cleaned_jwxt = clean_cookie_string(jwxt_raw);

                            let code_cookie = extract_cookie_segment(code_raw, "Code")
                                .or_else(|| extract_cookie_segment(auth_raw, "Code"))
                                .or_else(|| extract_cookie_segment(jwxt_raw, "Code"))
                                .or_else(|| if cleaned_code.is_empty() { None } else { Some(cleaned_code) });
                            let auth_cookie = extract_cookie_segment(auth_raw, "Auth")
                                .or_else(|| extract_cookie_segment(code_raw, "Auth"))
                                .or_else(|| extract_cookie_segment(jwxt_raw, "Auth"))
                                .or_else(|| if cleaned_auth.is_empty() { None } else { Some(cleaned_auth) });
                            let jwxt_cookie = extract_cookie_segment(jwxt_raw, "Jwxt")
                                .or_else(|| extract_cookie_segment(code_raw, "Jwxt"))
                                .or_else(|| extract_cookie_segment(auth_raw, "Jwxt"))
                                .or_else(|| if cleaned_jwxt.is_empty() { None } else { Some(cleaned_jwxt) });

                            if code_cookie.is_some() || auth_cookie.is_some() || jwxt_cookie.is_some() {
                                let state = app.state::<AppState>();
                                tauri::async_runtime::block_on(async {
                                    let mut client = state.client.lock().await;
                                    let _ = client.restore_cookie_snapshot(code_cookie, auth_cookie, jwxt_cookie);
                                });
                            }
                        }
                        }
                    }
                }
            }
            if !token_loaded {
                let mut capture_paths: Vec<std::path::PathBuf> = Vec::new();
                if let Some(path) = find_file_in_parents("captured_requests1.json", 6) {
                    capture_paths.push(path);
                }
                if let Some(path) = find_file_in_parents("captured_requests.json", 6) {
                    capture_paths.push(path);
                }
                if let Some(token) = read_access_token_from_capture(&capture_paths) {
                    let state = app.state::<AppState>();
                    tauri::async_runtime::block_on(async {
                        let mut client = state.client.lock().await;
                        client.set_electricity_token(token);
                    });
                }
            }
            // 启动本地 HTTP 测试桥接服务（用于外部 Python 验证脚本）
            let client = app.state::<AppState>().client.clone();
            crate::http_server::spawn_http_server(client);
            Ok(())
        })
        .manage(AppState {
            client: Arc::new(Mutex::new(HbutClient::new())),
        })
        .invoke_handler(tauri::generate_handler![
            get_login_page,
            get_captcha,
            recognize_captcha,
            set_ocr_endpoint,
            fetch_remote_config,
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
            fetch_transaction_history,
            hbut_ai_init,
            hbut_ai_upload,
            hbut_ai_chat,
            hbut_one_code_token,
        ])

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
