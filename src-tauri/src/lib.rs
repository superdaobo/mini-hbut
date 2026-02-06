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
use std::collections::HashMap;
use std::time::Duration;
use tauri::{State, Manager};
use tauri::path::BaseDirectory;
use chrono::{Datelike, Utc};

pub mod http_client;
pub mod parser;
pub mod db;
pub mod modules;
pub mod http_server;
pub mod qxzkb_options;

use http_client::HbutClient;


use modules::ai::*;
use modules::one_code::*;

// ... imports


const DB_FILENAME: &str = "grades.db";

// ... existing code ...

fn persist_electricity_tokens(client: &HbutClient) {
    let student_id = match client.user_info.as_ref() {
        Some(info) => info.student_id.clone(),
        None => return,
    };
    let (token_opt, refresh_opt, expires_opt) = client.get_electricity_session();
    let token = match token_opt {
        Some(t) if !t.trim().is_empty() => t,
        _ => return,
    };
    let refresh_token = refresh_opt.unwrap_or_default();
    let expires_at = expires_opt.map(|dt| dt.to_rfc3339()).unwrap_or_default();
    let _ = db::save_electricity_tokens(
        DB_FILENAME,
        &student_id,
        &token,
        &refresh_token,
        &expires_at,
    );
}

fn attach_sync_time(payload: serde_json::Value, sync_time: &str, offline: bool) -> serde_json::Value {
    match payload {
        serde_json::Value::Object(mut map) => {
            if !map.contains_key("success") {
                map.insert("success".to_string(), serde_json::Value::Bool(true));
            }
            map.insert("sync_time".to_string(), serde_json::Value::String(sync_time.to_string()));
            map.insert("offline".to_string(), serde_json::Value::Bool(offline));
            serde_json::Value::Object(map)
        }
        _ => serde_json::json!({
            "success": true,
            "data": payload,
            "sync_time": sync_time,
            "offline": offline
        })
    }
}

// 应用状态
/// 全局状态：共享 HbutClient 实例
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleExportEvent {
    pub summary: String,
    pub start: String,
    pub end: String,
    pub description: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleExportRequest {
    pub student_id: Option<String>,
    pub semester: Option<String>,
    pub week: Option<i32>,
    pub events: Vec<ScheduleExportEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QxzkbQuery {
    pub xnxq: String,
    pub xqid: Option<String>,
    pub nj: Option<String>,
    pub yxid: Option<String>,
    pub zyid: Option<String>,
    pub kkyxid: Option<String>,
    pub kkjysid: Option<String>,
    pub kcxz: Option<String>,
    pub kclb: Option<String>,
    pub xslx: Option<String>,
    pub kcmc: Option<String>,
    pub skjs: Option<String>,
    pub jxlid: Option<String>,
    pub jslx: Option<String>,
    pub ksxs: Option<String>,
    pub ksfs: Option<String>,
    pub jsmc: Option<String>,
    pub zxjc: Option<String>,
    pub zdjc: Option<String>,
    pub zxzc: Option<String>,
    pub zdzc: Option<String>,
    pub zxxq: Option<String>,
    pub zdxq: Option<String>,
    pub xsqbkb: Option<String>,
    pub kklx: Option<Vec<String>>,
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub sort: Option<String>,
    pub order: Option<String>,
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
async fn download_deyihei_font(app: tauri::AppHandle, url: String, force: Option<bool>) -> Result<String, String> {
    let force = force.unwrap_or(false);
    let cache_dir = app
        .path()
        .resolve("fonts", BaseDirectory::AppCache)
        .map_err(|e| format!("解析缓存目录失败: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("创建缓存目录失败: {}", e))?;

    let font_path = cache_dir.join("SmileySans-Oblique.ttf");
    if !force {
        if let Ok(meta) = tokio::fs::metadata(&font_path).await {
            if meta.len() > 50_000 {
                return Ok(font_path.to_string_lossy().to_string());
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建下载请求失败: {}", e))?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载字体失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("字体下载失败: {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取字体数据失败: {}", e))?;
    if bytes.len() < 50_000 {
        return Err("字体文件过小，下载失败。".to_string());
    }
    tokio::fs::write(&font_path, &bytes)
        .await
        .map_err(|e| format!("写入缓存失败: {}", e))?;
    Ok(font_path.to_string_lossy().to_string())
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
    println!("[调试] Command login called with: username={}, password len={}, captcha={:?}, lt={:?}, execution={:?}", 
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
            println!("[调试] Login: Successfully obtained one_code_令牌");
            t
        },
        Err(e) => {
            println!("[警告] 登录：获取 one_code_令牌 失败: {}", e);
            String::new()
        }
    };

    // 保存会话到本地数据库 (用于自动重连)
    let (_token_opt, refresh_opt, expires_at_opt) = client.get_electricity_session();
    let refresh_token = refresh_opt.unwrap_or_default();
    let expires_at = expires_at_opt.map(|dt| dt.to_rfc3339()).unwrap_or_default();
    if let Err(e) = db::save_user_session(
        DB_FILENAME,
        &username,
        &client.get_cookies(),
        &password,
        &one_code_token,
        Some(refresh_token.as_str()),
        Some(expires_at.as_str()),
    ) {
        println!("[警告] 保存会话失败: {}", e);
    }

    let user_info = client
        .user_info
        .clone()
        .ok_or_else(|| "登录成功但未读取到用户信息".to_string())?;
    let session_key = if user_info.student_id.trim().is_empty() {
        username.clone()
    } else {
        user_info.student_id.clone()
    };
    if session_key != username {
        let _ = db::save_user_session(
            DB_FILENAME,
            &session_key,
            &client.get_cookies(),
            &password,
            &one_code_token,
            Some(refresh_token.as_str()),
            Some(expires_at.as_str()),
        );
    }

    Ok(user_info)
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

    // 优先按学号加载，失败时回退到最近一次会话并自动迁移为学号主键。
    let mut session_opt = match db::get_user_session(DB_FILENAME, &user_info.student_id) {
        Ok(v) => v,
        Err(e) => {
            println!("[警告] 加载会话凭据失败: {}", e);
            None
        }
    };
    if session_opt.is_none() {
        if let Ok(Some(latest)) = db::get_latest_user_session(DB_FILENAME) {
            if !latest.password.is_empty() {
                session_opt = Some(db::UserSessionData {
                    cookies: latest.cookies,
                    password: latest.password,
                    one_code_token: latest.one_code_token,
                    refresh_token: latest.refresh_token,
                    token_expires_at: latest.token_expires_at,
                });
            }
        }
    }

    match session_opt {
        Some(session) => {
            println!("[调试] Restored credentials for user: {}", user_info.student_id);
            if !session.password.is_empty() {
                client.set_credentials(user_info.student_id.clone(), session.password.clone());
            }
            if !session.one_code_token.is_empty() {
                let expires_at = chrono::DateTime::parse_from_rfc3339(&session.token_expires_at)
                    .ok()
                    .map(|dt| dt.with_timezone(&chrono::Utc));
                let refresh = if session.refresh_token.trim().is_empty() {
                    None
                } else {
                    Some(session.refresh_token.clone())
                };
                client.set_electricity_session(session.one_code_token.clone(), refresh, expires_at);
                println!("[调试] Restored one_code_令牌");
            }
            let _ = db::save_user_session(
                DB_FILENAME,
                &user_info.student_id,
                &client.get_cookies(),
                &session.password,
                &session.one_code_token,
                Some(session.refresh_token.as_str()),
                Some(session.token_expires_at.as_str()),
            );
        }
        None => println!("[调试] No saved credentials found for user: {}", user_info.student_id),
    }

    Ok(user_info)
}

#[tauri::command]
async fn restore_latest_session(state: State<'_, AppState>) -> Result<UserInfo, String> {
    let session = db::get_latest_user_session(DB_FILENAME)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "无可用的历史会话".to_string())?;

    if session.cookies.trim().is_empty() {
        return Err("历史会话缺少 cookies".to_string());
    }

    let mut client = state.client.lock().await;
    let user_info = client.restore_session(&session.cookies).await.map_err(|e| e.to_string())?;

    if !session.password.is_empty() {
        client.set_credentials(user_info.student_id.clone(), session.password);
    }
    if !session.one_code_token.is_empty() {
        let expires_at = chrono::DateTime::parse_from_rfc3339(&session.token_expires_at)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc));
        let refresh = if session.refresh_token.trim().is_empty() {
            None
        } else {
            Some(session.refresh_token)
        };
        client.set_electricity_session(session.one_code_token, refresh, expires_at);
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
async fn sync_grades(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    match client.fetch_grades().await {
        Ok(grades) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = serde_json::json!({
                "success": true,
                "data": grades,
                "sync_time": sync_time,
                "offline": false
            });
            if let Some(uid) = &uid {
                let _ = db::save_cache(DB_FILENAME, "grades_cache", uid, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "grades_cache", uid) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
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
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    
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
    
    match client.fetch_schedule().await {
        Ok((course_list, _now_week)) => {
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
                "sync_time": chrono::Local::now().to_rfc3339(),
                "offline": false
            });

            if let Some(uid) = &uid {
                let _ = db::save_cache(DB_FILENAME, "schedule_cache", uid, &result);
            }
            
            Ok(result)
        }
        Err(e) => {
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "schedule_cache", uid) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
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

fn sanitize_filename_part(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>()
}

fn escape_ics_text(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace("\r\n", "\\n")
        .replace('\n', "\\n")
        .replace('\r', "")
}

fn parse_ics_datetime(input: &str) -> Option<chrono::NaiveDateTime> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(input) {
        return Some(dt.naive_local());
    }
    chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S").ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%d %H:%M:%S").ok())
}

fn export_dir() -> std::path::PathBuf {
    if let Ok(raw) = std::env::var("HBUT_EXPORT_DIR") {
        let path = std::path::PathBuf::from(raw);
        if !path.as_os_str().is_empty() {
            return path;
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("exports")
}

fn export_base_url() -> String {
    if let Ok(base) = std::env::var("HBUT_PUBLIC_BASE") {
        if !base.trim().is_empty() {
            return base.trim_end_matches('/').to_string();
        }
    }
    "http://127.0.0.1:4399".to_string()
}

#[tauri::command]
async fn export_schedule_calendar(req: ScheduleExportRequest) -> Result<serde_json::Value, String> {
    if req.events.is_empty() {
        return Err("没有可导出的课程数据".to_string());
    }

    let export_root = export_dir();
    if let Err(e) = std::fs::create_dir_all(&export_root) {
        return Err(format!("创建导出目录失败: {}", e));
    }

    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let sid = sanitize_filename_part(req.student_id.as_deref().unwrap_or("student"));
    let semester = sanitize_filename_part(req.semester.as_deref().unwrap_or("semester"));
    let week = req.week.unwrap_or(0);
    let filename = format!("schedule_{}_{}_w{}_{}.ics", sid, semester, week, ts);
    let file_path = export_root.join(&filename);

    let mut ics = String::new();
    ics.push_str("BEGIN:VCALENDAR\r\n");
    ics.push_str("VERSION:2.0\r\n");
    ics.push_str("CALSCALE:GREGORIAN\r\n");
    ics.push_str("METHOD:PUBLISH\r\n");
    ics.push_str("X-WR-CALNAME:HBUT 课表\r\n");
    ics.push_str("X-WR-TIMEZONE:Asia/Shanghai\r\n");
    ics.push_str("PRODID:-//Mini-HBUT//Schedule Export//CN\r\n");

    let dtstamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    for (idx, ev) in req.events.iter().enumerate() {
        let start = match parse_ics_datetime(&ev.start) {
            Some(v) => v,
            None => continue,
        };
        let end = match parse_ics_datetime(&ev.end) {
            Some(v) => v,
            None => continue,
        };
        let summary = escape_ics_text(ev.summary.as_str());
        let desc = ev.description.as_deref().map(escape_ics_text);
        let location = ev.location.as_deref().map(escape_ics_text);
        let uid = format!("hbut-{}-{}@mini-hbut", ts, idx);

        ics.push_str("BEGIN:VEVENT\r\n");
        ics.push_str(&format!("UID:{}\r\n", uid));
        ics.push_str(&format!("DTSTAMP:{}\r\n", dtstamp));
        ics.push_str(&format!("DTSTART;TZID=Asia/Shanghai:{}\r\n", start.format("%Y%m%dT%H%M%S")));
        ics.push_str(&format!("DTEND;TZID=Asia/Shanghai:{}\r\n", end.format("%Y%m%dT%H%M%S")));
        ics.push_str(&format!("SUMMARY:{}\r\n", summary));
        if let Some(desc) = desc {
            ics.push_str(&format!("DESCRIPTION:{}\r\n", desc));
        }
        if let Some(location) = location {
            ics.push_str(&format!("LOCATION:{}\r\n", location));
        }
        ics.push_str("END:VEVENT\r\n");
    }
    ics.push_str("END:VCALENDAR\r\n");

    if let Err(e) = std::fs::write(&file_path, ics) {
        return Err(format!("写入导出文件失败: {}", e));
    }

    let base = export_base_url();
    let url = format!("{}/exports/{}", base.trim_end_matches('/'), filename);
    Ok(serde_json::json!({
        "success": true,
        "url": url,
        "filename": filename,
        "count": req.events.len()
    }))
}

#[tauri::command]
async fn fetch_exams(state: State<'_, AppState>, semester: Option<String>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let sem_key = semester.clone().unwrap_or_else(|| "current".to_string());
    let cache_key = uid.as_ref().map(|u| format!("{}:{}", u, sem_key));

    match client.fetch_exams(semester.as_deref()).await {
        Ok(exams) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = serde_json::json!({
                "success": true,
                "data": exams,
                "sync_time": sync_time,
                "offline": false
            });
            if let (Some(_uid), Some(key)) = (uid.as_ref(), cache_key.as_ref()) {
                let _ = db::save_cache(DB_FILENAME, "exams_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "exams_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_ranking(
    state: State<'_, AppState>, 
    student_id: Option<String>,
    semester: Option<String>
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let sid = student_id.or_else(|| client.user_info.as_ref().map(|u| u.student_id.clone()));
    let sem_key = semester.clone().unwrap_or_else(|| "current".to_string());
    let cache_key = sid.as_ref().map(|s| format!("{}:{}", s, sem_key));

    match client.fetch_ranking(sid.as_deref(), semester.as_deref()).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "ranking_cache", key, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "ranking_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_student_info(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    match client.fetch_student_info().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(uid) = &uid {
                let _ = db::save_cache(DB_FILENAME, "studentinfo_cache", uid, &payload);
            }
            Ok(payload)
        }
        Err(e) => {
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "studentinfo_cache", uid) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_semesters(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match client.fetch_semesters().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "semesters_public_cache", "semesters", &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "semesters_public_cache", "semesters") {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_classroom_buildings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match client.fetch_classroom_buildings().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "classroom_public_cache", "buildings", &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "classroom_public_cache", "buildings") {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
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
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let periods_key = periods.as_ref().map(|p| p.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(",")).unwrap_or_default();
    let building_key = building.clone().unwrap_or_default();
    let cache_key = uid.as_ref().map(|u| format!(
        "{}:classroom:{}:{}:{}:{}",
        u,
        week.unwrap_or_default(),
        weekday.unwrap_or_default(),
        periods_key,
        building_key
    ));

    match client.fetch_classrooms_query(week, weekday, periods, building).await {
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
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "classroom_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_training_plan_options(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
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
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "training_plan_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_training_plan_jys(state: State<'_, AppState>, yxid: String) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
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
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "training_plan_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
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
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let cache_key = uid.as_ref().map(|u| format!(
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
    ));

    match client.fetch_training_plan_courses(grade, kkxq, kkyx, kkjys, kcxz, kcgs, kcbh, kcmc, page, page_size).await {
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
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "training_plan_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_calendar(state: State<'_, AppState>) -> Result<Vec<CalendarEvent>, String> {
    let client = state.client.lock().await;
    client.fetch_calendar().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_calendar_data(state: State<'_, AppState>, semester: Option<String>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let sem_key = semester.clone().unwrap_or_else(|| "current".to_string());
    match client.fetch_calendar_data(semester).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "calendar_public_cache", &sem_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "calendar_public_cache", &sem_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_academic_progress(state: State<'_, AppState>, fasz: Option<i32>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
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
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "academic_progress_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_qxzkb_options() -> Result<serde_json::Value, String> {
    Ok(crate::qxzkb_options::qxzkb_options())
}

#[tauri::command]
async fn fetch_qxzkb_jcinfo(state: State<'_, AppState>, xnxq: String) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let cache_key = format!("jcinfo:{}", xnxq);
    match client.fetch_qxzkb_jcinfo(&xnxq).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_qxzkb_zyxx(state: State<'_, AppState>, yxid: String, nj: String) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let cache_key = format!("zyxx:{}:{}", yxid, nj);
    match client.fetch_qxzkb_zyxx(&yxid, &nj).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_qxzkb_kkjys(state: State<'_, AppState>, kkyxid: String) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let cache_key = format!("kkjys:{}", kkyxid);
    match client.fetch_qxzkb_kkjys(&kkyxid).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_qxzkb_list(state: State<'_, AppState>, query: QxzkbQuery) -> Result<serde_json::Value, String> {
    if query.xnxq.trim().is_empty() {
        return Err("请选择学年学期".to_string());
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

    let mut items: Vec<(&String, &String)> = params.iter()
        .filter(|(k, _)| k.as_str() != "nd")
        .collect();
    items.sort_by(|a, b| a.0.cmp(b.0));
    let cache_key = items.iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    match client.fetch_qxzkb_list(&params).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn electricity_query_location(state: State<'_, AppState>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let key_suffix = payload.to_string();
    let cache_key = uid.as_ref().map(|u| format!("{}:loc:{}", u, key_suffix));

    match client.query_electricity_location(payload).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "electricity_cache", key, &payload);
            }
            persist_electricity_tokens(&client);
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "electricity_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn electricity_query_account(state: State<'_, AppState>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let key_suffix = payload.to_string();
    let cache_key = uid.as_ref().map(|u| format!("{}:acct:{}", u, key_suffix));

    match client.query_electricity_account(payload).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "electricity_cache", key, &payload);
            }
            persist_electricity_tokens(&client);
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "electricity_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
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
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let cache_key = uid.as_ref().map(|u| format!(
        "{}:{}:{}:{}:{}",
        u,
        start_date,
        end_date,
        page_no,
        page_size
    ));

    match client.fetch_transaction_history(&start_date, &end_date, page_no, page_size).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "transaction_cache", key, &payload);
            }
            persist_electricity_tokens(&client);
            Ok(payload)
        }
        Err(e) => {
            println!("[警告] Transaction network fetch failed: {}, trying cache...", e);
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "transaction_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            if let Ok(db_path) = app.path().resolve("grades.db", BaseDirectory::AppData) {
                if let Some(parent) = db_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                std::env::set_var("HBUT_DB_PATH", db_path.to_string_lossy().to_string());
            }
            if let Ok(export_path) = app.path().resolve("exports", BaseDirectory::AppCache) {
                let _ = std::fs::create_dir_all(&export_path);
                std::env::set_var("HBUT_EXPORT_DIR", export_path.to_string_lossy().to_string());
            }
            if let Err(e) = db::init_db(DB_FILENAME) {
                eprintln!("初始化数据库失败: {}", e);
            }

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
            if let Ok(Some(session)) = db::get_latest_user_session(DB_FILENAME) {
                let student_id = session.student_id.clone();
                let cookies = session.cookies.clone();
                let password = session.password.clone();
                let token = session.one_code_token.clone();
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
                            let expires_at = chrono::DateTime::parse_from_rfc3339(&session.token_expires_at)
                                .ok()
                                .map(|dt| dt.with_timezone(&chrono::Utc));
                            let refresh = if session.refresh_token.trim().is_empty() {
                                None
                            } else {
                                Some(session.refresh_token.clone())
                            };
                            client.set_electricity_session(token, refresh, expires_at);
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
            download_deyihei_font,
            login,
            logout,
            restore_session,
            restore_latest_session,
            get_cookies,
            refresh_session,
            sync_grades,
            get_grades_local,
            sync_schedule,
            get_schedule_local,
            export_schedule_calendar,
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
            fetch_qxzkb_options,
            fetch_qxzkb_jcinfo,
            fetch_qxzkb_zyxx,
            fetch_qxzkb_kkjys,
            fetch_qxzkb_list,
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
