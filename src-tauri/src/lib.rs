// lib.rs
//
// 逻辑文档: lib_logic.md
// 妯″功能: Tauri 后端逻辑ュ彛
// 
// 本文件主要职?
// 1. 定义应用状态(AppState) 和全局单例 HbutClient
// 2. 灏?HbutClient 的功能包装为 Tauri Commands 供前端调?
// 3. 定义数据传输对象 (DTOs)
// 4. 实现€单的缓存/持久化策?(调用 db 妯″潡)
//
// 依赖关系:
// lib.rs -> http_client.rs (业务逻辑)
// lib.rs -> db.rs (数据存储)
// lib.rs -> modules/ (特定功能″潡)

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::collections::HashMap;
use std::time::Duration;
use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose, Engine as _};
use regex::Regex;
use reqwest::cookie::CookieStore;
use tauri::{State, Manager};
use tauri::path::BaseDirectory;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_notification::NotificationExt;
use chrono::{Datelike, Utc};
use rand::Rng;

pub mod http_client;
pub mod parser;
pub mod db;
pub mod modules;
pub mod http_server;
pub mod qxzkb_options;
pub mod debug_bridge;

use http_client::HbutClient;


use modules::ai::*;
use modules::one_code::*;

// ... imports


const DB_FILENAME: &str = "grades.db";
pub(crate) const DEFAULT_TEMP_UPLOAD_ENDPOINT: &str = "https://mini-hbut-testocr1.hf.space/api/temp/upload";
const DEFAULT_PORTAL_SERVICE_URL: &str = "https://e.hbut.edu.cn/login#/";
const CHAOXING_LOGIN_PAGE_URL: &str =
    "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
const CHAOXING_BASE_URL: &str = "https://passport2.chaoxing.com";
const CHAOXING_AES_KEY: &str = "u2oh6Vu^HWe4_AES";
static TEMP_UPLOAD_ENDPOINT: OnceLock<StdMutex<Option<String>>> = OnceLock::new();

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

fn temp_upload_endpoint_store() -> &'static StdMutex<Option<String>> {
    TEMP_UPLOAD_ENDPOINT.get_or_init(|| StdMutex::new(None))
}

fn normalize_upload_endpoint(input: Option<String>) -> Option<String> {
    input.and_then(|v| {
        let s = v.trim();
        if s.is_empty() {
            None
        } else {
            Some(s.to_string())
        }
    })
}

fn set_temp_upload_endpoint_config(endpoint: Option<String>) -> Result<(), String> {
    let mut guard = temp_upload_endpoint_store()
        .lock()
        .map_err(|e| format!("lock temp upload endpoint failed: {}", e))?;
    *guard = normalize_upload_endpoint(endpoint);
    Ok(())
}

pub(crate) fn get_temp_upload_endpoint_config() -> Option<String> {
    temp_upload_endpoint_store()
        .lock()
        .ok()
        .and_then(|v| v.clone())
}

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
/// 鍏ㄥ眬鐘舵€侊細鍏变韩 HbutClient 实例
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
pub struct PortalQrInitResponse {
    pub service: String,
    pub uuid: String,
    pub qr_image_base64: String,
    pub execution: String,
    pub lt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortalQrStatusResponse {
    pub uuid: String,
    pub status_code: String,
    pub status_label: String,
    pub should_submit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingLoginContext {
    pub fid: String,
    pub refer: String,
    pub t: String,
    pub forbidotherlogin: String,
    pub double_factor_login: String,
    pub independent_id: String,
    pub independent_name_id: String,
    pub need_vcode: String,
    pub validate: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingQrInitResponse {
    pub uuid: String,
    pub enc: String,
    pub qr_image_base64: String,
    pub expires_in_seconds: i32,
    pub context: ChaoxingLoginContext,
    pub debug: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingQrStatusResponse {
    pub status: bool,
    pub type_code: String,
    pub message: String,
    pub nickname: Option<String>,
    pub uid: Option<String>,
    pub contain_two_factor_login: bool,
    pub two_factor_login_pc_url: Option<String>,
    pub redirect_url: Option<String>,
    pub should_finish_login: bool,
    pub should_refresh_qr: bool,
    pub debug: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingLoginResult {
    pub success: bool,
    pub student_id: String,
    pub display_name: String,
    pub account: String,
    pub uid: Option<String>,
    pub redirect_url: String,
    pub message: String,
    pub limited_mode: bool,
    pub debug: Vec<String>,
}

#[derive(Debug, Clone)]
struct ChaoxingLoginPagePayload {
    context: ChaoxingLoginContext,
    uuid: String,
    enc: String,
    login_page_url: String,
    debug: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grade {
    pub term: String,
    pub course_name: String,
    pub course_code: Option<String>,
    pub course_nature: String,
    pub course_nature_code: String,
    pub course_credit: String,
    pub final_score: String,
    pub earned_credit: String,
    pub xfjd: String,
    pub sfbk: String,
    pub sfsq: String,
    pub cjbj: String,
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
    pub upload_endpoint: Option<String>,
    pub ttl_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddCustomScheduleCourseRequest {
    pub student_id: String,
    pub semester: String,
    pub name: String,
    pub teacher: Option<String>,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    pub room: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteCustomScheduleCourseRequest {
    pub student_id: String,
    pub semester: String,
    pub course_id: String,
    pub mode: Option<String>,
    pub current_week: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCustomScheduleCourseRequest {
    pub student_id: String,
    pub semester: String,
    pub course_id: String,
    pub name: String,
    pub teacher: Option<String>,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    pub room: Option<String>,
}

fn build_public_cache_key(prefix: &str, payload: &str) -> String {
    let encoded = general_purpose::STANDARD.encode(payload.as_bytes());
    format!("{}:{}", prefix, encoded)
}

fn normalize_portal_service_url(service: Option<String>) -> String {
    let normalized = service.unwrap_or_default().trim().to_string();
    if normalized.is_empty() {
        DEFAULT_PORTAL_SERVICE_URL.to_string()
    } else {
        normalized
    }
}

fn upsert_form_value(form: &mut HashMap<String, String>, keys: &[&str], default_key: &str, value: &str) {
    let mut replaced = false;
    for key in keys {
        if form.contains_key(*key) {
            form.insert((*key).to_string(), value.to_string());
            replaced = true;
        }
    }
    if !replaced {
        form.insert(default_key.to_string(), value.to_string());
    }
}

fn map_portal_qr_status(code: &str) -> (&'static str, bool) {
    match code {
        "1" => ("confirmed", true),
        "2" => ("scanned_waiting_confirm", false),
        "3" => ("expired", false),
        "0" => ("waiting_scan", false),
        _ => ("unknown", false),
    }
}

fn parse_hidden_input_map(html: &str) -> HashMap<String, String> {
    let input_re = Regex::new(r#"(?is)<input\b[^>]*>"#).expect("compile input regex");
    let attr_re =
        Regex::new(r#"(?i)\b(id|name|value)\s*=\s*["']([^"']*)["']"#).expect("compile attr regex");

    let mut map = HashMap::new();
    for input in input_re.find_iter(html) {
        let mut input_id = String::new();
        let mut input_name = String::new();
        let mut input_value = String::new();
        let tag = input.as_str();
        for cap in attr_re.captures_iter(tag) {
            let key = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_ascii_lowercase();
            let value = cap.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
            match key.as_str() {
                "id" => input_id = value,
                "name" => input_name = value,
                "value" => input_value = value,
                _ => {}
            }
        }
        if !input_name.is_empty() {
            map.insert(input_name.clone(), input_value.clone());
        }
        if !input_id.is_empty() {
            map.insert(input_id, input_value);
        }
    }
    map
}

fn pick_hidden_input(map: &HashMap<String, String>, keys: &[&str], default_value: &str) -> String {
    keys.iter()
        .find_map(|k| map.get(*k))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default_value.to_string())
}

fn build_chaoxing_login_context(map: &HashMap<String, String>) -> ChaoxingLoginContext {
    ChaoxingLoginContext {
        fid: pick_hidden_input(map, &["fid"], "-1"),
        refer: pick_hidden_input(map, &["refer"], "https%3A%2F%2Fi.chaoxing.com"),
        t: pick_hidden_input(map, &["t"], "true"),
        forbidotherlogin: pick_hidden_input(map, &["forbidotherlogin"], "0"),
        double_factor_login: pick_hidden_input(map, &["doubleFactorLogin"], "0"),
        independent_id: pick_hidden_input(map, &["independentId"], "0"),
        independent_name_id: pick_hidden_input(map, &["independentNameId"], "0"),
        need_vcode: pick_hidden_input(map, &["needVcode"], ""),
        validate: pick_hidden_input(map, &["validate"], ""),
    }
}

fn chaoxing_encrypt_value(raw: &str) -> Result<String, String> {
    if CHAOXING_AES_KEY.len() != 16 {
        return Err("学习通 AES 密钥长度异常".to_string());
    }
    let key = CHAOXING_AES_KEY.as_bytes();
    let iv = CHAOXING_AES_KEY.as_bytes();
    let plain = raw.as_bytes();
    let block_size = 16usize;
    let padded_len = ((plain.len() / block_size) + 1) * block_size;
    let mut buf = vec![0u8; padded_len];
    buf[..plain.len()].copy_from_slice(plain);
    let cipher = Aes128CbcEnc::new(key.into(), iv.into());
    let encrypted = cipher
        .encrypt_padded_mut::<Pkcs7>(&mut buf, plain.len())
        .map_err(|e| format!("学习通 AES 加密失败: {:?}", e))?;
    Ok(general_purpose::STANDARD.encode(encrypted))
}

fn parse_cookie_value(cookie_header: &str, key: &str) -> Option<String> {
    let marker = format!("{}=", key);
    cookie_header
        .split(';')
        .map(|seg| seg.trim())
        .find_map(|seg| seg.strip_prefix(&marker))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn cookie_header_for_url(client: &HbutClient, url: &str) -> String {
    let parsed = match reqwest::Url::parse(url) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };
    client
        .cookie_jar
        .cookies(&parsed)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default()
}

fn has_portal_login_cookie(client: &HbutClient) -> bool {
    let cookie_header = cookie_header_for_url(client, crate::http_client::AUTH_BASE_URL);
    parse_cookie_value(&cookie_header, "CASTGC").is_some()
        || parse_cookie_value(&cookie_header, "TGC").is_some()
        || parse_cookie_value(&cookie_header, "happyVoyage").is_some()
}

fn has_chaoxing_login_cookie(client: &HbutClient) -> bool {
    let passport_cookie = cookie_header_for_url(client, CHAOXING_BASE_URL);
    let i_cookie = cookie_header_for_url(client, "https://i.chaoxing.com");
    let merged_cookie = if passport_cookie.is_empty() {
        i_cookie
    } else if i_cookie.is_empty() {
        passport_cookie
    } else {
        format!("{}; {}", passport_cookie, i_cookie)
    };

    let has_uid = parse_cookie_value(&merged_cookie, "UID")
        .or_else(|| parse_cookie_value(&merged_cookie, "_uid"))
        .is_some();
    let has_token = parse_cookie_value(&merged_cookie, "p_auth_token")
        .or_else(|| parse_cookie_value(&merged_cookie, "cx_p_token"))
        .or_else(|| parse_cookie_value(&merged_cookie, "xxtenc"))
        .is_some();
    has_uid && has_token
}

fn normalize_student_id_candidate(value: &str) -> Option<String> {
    let text = value.trim();
    if text.len() == 10 && text.chars().all(|c| c.is_ascii_digit()) {
        return Some(text.to_string());
    }
    None
}

fn guess_chaoxing_student_id(account_hint: Option<&str>, cookie_header: &str) -> Option<String> {
    if let Some(username_cookie) = parse_cookie_value(cookie_header, "username") {
        if let Some(sid) = normalize_student_id_candidate(&username_cookie) {
            return Some(sid);
        }
    }
    if let Some(sid) = normalize_student_id_candidate(account_hint.unwrap_or("")) {
        return Some(sid);
    }
    None
}

fn pick_student_id_from_info_payload(value: &serde_json::Value) -> Option<String> {
    let direct = value
        .get("student_id")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("studentId").and_then(|v| v.as_str()))
        .or_else(|| value.get("xh").and_then(|v| v.as_str()));
    if let Some(sid) = direct.and_then(normalize_student_id_candidate) {
        return Some(sid);
    }

    if let Some(data) = value.get("data") {
        let nested = data
            .get("student_id")
            .and_then(|v| v.as_str())
            .or_else(|| data.get("studentId").and_then(|v| v.as_str()))
            .or_else(|| data.get("xh").and_then(|v| v.as_str()));
        if let Some(sid) = nested.and_then(normalize_student_id_candidate) {
            return Some(sid);
        }
    }

    None
}

fn json_bool(value: &serde_json::Value, key: &str) -> bool {
    match value.get(key) {
        Some(serde_json::Value::Bool(v)) => *v,
        Some(serde_json::Value::String(v)) => v.eq_ignore_ascii_case("true") || v == "1",
        Some(serde_json::Value::Number(v)) => v.as_i64().unwrap_or_default() != 0,
        _ => false,
    }
}

fn json_string(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value.get(*key).and_then(|v| match v {
            serde_json::Value::String(s) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            serde_json::Value::Number(n) => Some(n.to_string()),
            serde_json::Value::Bool(b) => Some(b.to_string()),
            _ => None,
        })
    })
}

async fn load_chaoxing_login_page(client: &mut HbutClient) -> Result<ChaoxingLoginPagePayload, String> {
    let mut debug = Vec::new();
    let response = client
        .client
        .get(CHAOXING_LOGIN_PAGE_URL)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("学习通登录页请求失败: {}", e))?;
    let status = response.status();
    let final_url = response.url().to_string();
    debug.push(format!(
        "login_page status={} final_url={}",
        status.as_u16(),
        final_url
    ));
    if !status.is_success() {
        return Err(format!("学习通登录页返回异常状态: {}", status));
    }
    let html = response
        .text()
        .await
        .map_err(|e| format!("学习通登录页响应读取失败: {}", e))?;
    debug.push(format!("login_page html_len={}", html.len()));
    let hidden_map = parse_hidden_input_map(&html);
    let context = build_chaoxing_login_context(&hidden_map);
    let uuid = pick_hidden_input(&hidden_map, &["uuid"], "");
    let enc = pick_hidden_input(&hidden_map, &["enc"], "");
    debug.push(format!(
        "context fid={} t={} need_vcode={} has_uuid={} has_enc={}",
        context.fid,
        context.t,
        context.need_vcode,
        !uuid.is_empty(),
        !enc.is_empty()
    ));
    Ok(ChaoxingLoginPagePayload {
        context,
        uuid,
        enc,
        login_page_url: final_url,
        debug,
    })
}

async fn fetch_chaoxing_qr_image(
    client: &mut HbutClient,
    uuid: &str,
    fid: &str,
    referer: &str,
    debug: &mut Vec<String>,
) -> Result<String, String> {
    let url = format!(
        "{}/createqr?uuid={}&fid={}",
        CHAOXING_BASE_URL,
        urlencoding::encode(uuid),
        urlencoding::encode(fid)
    );
    let response = client
        .client
        .get(&url)
        .header(
            "Accept",
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        )
        .header("Referer", referer)
        .send()
        .await
        .map_err(|e| format!("学习通二维码图片请求失败: {}", e))?;
    let status = response.status();
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("学习通二维码图片读取失败: {}", e))?;
    debug.push(format!(
        "createqr status={} content_type={} final_url={} bytes={}",
        status.as_u16(),
        content_type,
        final_url,
        bytes.len()
    ));
    if !status.is_success() {
        return Err(format!("学习通二维码图片状态异常: {}", status));
    }
    if !content_type.starts_with("image/") {
        let preview = String::from_utf8_lossy(&bytes)
            .chars()
            .take(120)
            .collect::<String>();
        return Err(format!(
            "学习通二维码返回非图片内容: content-type={}, preview={}",
            content_type, preview
        ));
    }
    if bytes.is_empty() {
        return Err("学习通二维码图片为空".to_string());
    }
    Ok(format!(
        "data:{};base64,{}",
        content_type,
        general_purpose::STANDARD.encode(bytes)
    ))
}

async fn fetch_portal_qr_status_code(client: &HbutClient, qr_uuid: &str) -> Result<String, String> {
    let status_url = format!(
        "{}/qrCode/getStatus.htl?ts={}&uuid={}",
        crate::http_client::AUTH_BASE_URL,
        Utc::now().timestamp_millis(),
        urlencoding::encode(qr_uuid)
    );
    client
        .client
        .get(&status_url)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await
        .map_err(|e| format!("查询二维码状态失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取二维码状态失败: {}", e))
        .map(|v| v.trim().to_string())
}

async fn fetch_portal_user_info_with_retry(
    client: &mut HbutClient,
    attempts: usize,
) -> Result<UserInfo, String> {
    let mut last_err = "未知错误".to_string();
    let total = attempts.max(1);
    for idx in 0..total {
        // 先触发一次门户与教务补票，再拉取用户信息。
        // v3: 通过 /admin/caslogin 建立教务会话（替代旧的 /sso/jasiglogin）
        let caslogin_url = format!("{}/admin/caslogin", crate::http_client::JWXT_BASE_URL);
        let _ = client.client.get(&caslogin_url).send().await;

        match client.fetch_user_info().await {
            Ok(info) => return Ok(info),
            Err(e) => {
                last_err = e.to_string();
                if idx + 1 < total {
                    tokio::time::sleep(Duration::from_millis(350)).await;
                }
            }
        }
    }
    Err(last_err)
}

async fn finalize_chaoxing_login(
    client: &mut HbutClient,
    account_hint: Option<&str>,
    password_hint: Option<&str>,
    redirect_hint: Option<&str>,
    debug: &mut Vec<String>,
) -> Result<ChaoxingLoginResult, String> {
    client.set_chaoxing_login_mode(true);
    let bridge_ready = client.ensure_chaoxing_academic_session().await;
    debug.push(format!("chaoxing_bridge_ready={}", bridge_ready));

    let passport_url = reqwest::Url::parse(CHAOXING_BASE_URL)
        .map_err(|e| format!("学习通域名解析失败: {}", e))?;
    let jw_url = reqwest::Url::parse("https://hbut.jw.chaoxing.com")
        .map_err(|e| format!("学习通教务域名解析失败: {}", e))?;
    let passport_cookie = client
        .cookie_jar
        .cookies(&passport_url)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    let jw_cookie = client
        .cookie_jar
        .cookies(&jw_url)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    let merged_cookie = format!("{}; {}", passport_cookie, jw_cookie);

    if merged_cookie.trim().is_empty() {
        return Err("学习通登录完成后未读取到有效 Cookie".to_string());
    }

    let uid = parse_cookie_value(&merged_cookie, "UID")
        .or_else(|| parse_cookie_value(&merged_cookie, "_uid"));

    let fetched_user = client.fetch_user_info().await.ok();
    let mut resolved_student_id = fetched_user
        .as_ref()
        .and_then(|u| normalize_student_id_candidate(&u.student_id));
    if resolved_student_id.is_none() {
        if let Ok(profile_payload) = client.fetch_student_info().await {
            resolved_student_id = pick_student_id_from_info_payload(&profile_payload);
        }
    }
    if resolved_student_id.is_none() {
        resolved_student_id = guess_chaoxing_student_id(account_hint, &merged_cookie);
    }
    let student_id = resolved_student_id.ok_or_else(|| {
        "学习通登录成功，但未解析到 10 位学号，请先使用融合门户登录一次后再重试".to_string()
    })?;
    let display_name = fetched_user
        .as_ref()
        .map(|u| u.student_name.clone())
        .filter(|v| !v.trim().is_empty())
        .or_else(|| parse_cookie_value(&merged_cookie, "username"))
        .unwrap_or_else(|| student_id.clone());
    debug.push(format!(
        "finalize student_id={} uid={}",
        student_id,
        uid.clone().unwrap_or_default()
    ));

    client.is_logged_in = true;
    client.user_info = Some(fetched_user.unwrap_or(UserInfo {
        student_id: student_id.clone(),
        student_name: display_name.clone(),
        college: None,
        major: None,
        class_name: None,
        grade: None,
    }));
    client.last_username = Some(student_id.clone());
    client.last_password = password_hint.map(|v| v.to_string());

    let password_to_save = password_hint.unwrap_or("");
    let _ = db::save_user_session(
        DB_FILENAME,
        &student_id,
        &merged_cookie,
        password_to_save,
        "",
        None,
        None,
    );

    Ok(ChaoxingLoginResult {
        success: true,
        student_id,
        display_name,
        account: account_hint.unwrap_or("").to_string(),
        uid,
        redirect_url: redirect_hint.unwrap_or("").to_string(),
        message: "学习通登录成功".to_string(),
        limited_mode: true,
        debug: debug.clone(),
    })
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionListRequest {
    pub pcid: String,
    pub from: Option<String>,
    pub pcenc: String,
    pub kcmc: Option<String>,
    pub kcxz: Option<String>,
    pub jxms: Option<String>,
    pub kcgs: Option<String>,
    pub teacher: Option<String>,
    pub kkxq: Option<String>,
    pub kclb: Option<String>,
    pub kclx: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionEndTimeRequest {
    pub pcid: String,
    pub kklx: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionChildClassesRequest {
    pub pcid: String,
    pub pcenc: String,
    pub jxbid: String,
    pub from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionSelectRequest {
    pub pcid: String,
    pub jxbid: String,
    pub zjxbid: Option<String>,
    pub from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionWithdrawRequest {
    pub pcid: String,
    pub jxbid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionDetailRequest {
    pub jxbid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionSelectedCoursesRequest {
    pub semester: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningOverviewRequest {
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningSyncRequest {
    pub student_id: Option<String>,
    pub platform: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningSyncRunsRequest {
    pub student_id: Option<String>,
    pub platform: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningClearCacheRequest {
    pub student_id: Option<String>,
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingSessionStatusRequest {
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCoursesRequest {
    pub student_id: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCourseOutlineRequest {
    pub student_id: Option<String>,
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    pub course_url: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCourseProgressRequest {
    pub student_id: Option<String>,
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    pub course_url: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingLaunchUrlRequest {
    pub student_id: Option<String>,
    pub course_id: String,
    pub clazz_id: String,
    pub chapter_id: Option<String>,
    pub knowledge_id: Option<String>,
    pub cpi: Option<String>,
    pub launch_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangQrCreateRequest {
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangPollQrLoginRequest {
    pub student_id: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCoursesRequest {
    pub student_id: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCourseOutlineRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub sign: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCourseProgressRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub sku_id: Option<String>,
    pub force: Option<bool>,
}

// ── 自动刷课 Request DTO ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingKnowledgeCardsRequest {
    pub student_id: Option<String>,
    pub clazz_id: String,
    pub course_id: String,
    pub knowledge_id: String,
    pub cpi: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingVideoStatusRequest {
    pub student_id: Option<String>,
    pub object_id: String,
    pub fid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingReportProgressRequest {
    pub student_id: Option<String>,
    pub report_url: String,
    pub dtoken: String,
    pub clazz_id: String,
    pub object_id: String,
    pub jobid: String,
    pub userid: String,
    pub other_info: String,
    pub playing_time: u64,
    pub duration: u64,
    pub isdrag: Option<u8>,
    pub video_face_capture_enc: Option<String>,
    pub att_duration: Option<String>,
    pub att_duration_enc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCourseChaptersRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub sign: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangLeafInfoRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub leaf_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangHeartbeatRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub events: serde_json::Value,
}

fn resolve_online_learning_student_id(client: &HbutClient, student_id: Option<&str>) -> Result<String, String> {
    if let Some(raw) = student_id {
        let sid = raw.trim();
        if !sid.is_empty() {
            return Ok(sid.to_string());
        }
    }
    client
        .user_info
        .as_ref()
        .map(|info| info.student_id.clone())
        .filter(|sid| !sid.trim().is_empty())
        .ok_or_else(|| "缺少 student_id，且当前未登录".to_string())
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
async fn portal_qr_init_login(
    state: State<'_, AppState>,
    service: Option<String>,
) -> Result<PortalQrInitResponse, String> {
    let service_url = normalize_portal_service_url(service);
    let mut client = state.client.lock().await;

    let page_info = client
        .get_login_page_with_service(&service_url)
        .await
        .map_err(|e| format!("获取扫码登录页失败: {}", e))?;

    let token_url = format!(
        "{}/qrCode/getToken?ts={}",
        crate::http_client::AUTH_BASE_URL,
        Utc::now().timestamp_millis()
    );
    let uuid = client
        .client
        .get(&token_url)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await
        .map_err(|e| format!("获取二维码 token 失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取二维码 token 失败: {}", e))?
        .trim()
        .to_string();

    if uuid.is_empty() {
        return Err("获取二维码 token 失败：返回为空".to_string());
    }

    let code_url = format!(
        "{}/qrCode/getCode?uuid={}",
        crate::http_client::AUTH_BASE_URL,
        urlencoding::encode(&uuid)
    );
    let qr_response = client
        .client
        .get(&code_url)
        .header(
            "Accept",
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        )
        .header(
            "Referer",
            format!(
                "{}/login?service={}",
                crate::http_client::AUTH_BASE_URL,
                urlencoding::encode(&service_url)
            ),
        )
        .send()
        .await
        .map_err(|e| format!("获取二维码图片失败: {}", e))?;
    let qr_status = qr_response.status();
    let qr_final_url = qr_response.url().to_string();
    let qr_content_type = qr_response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let qr_bytes = qr_response
        .bytes()
        .await
        .map_err(|e| format!("读取二维码图片失败: {}", e))?;

    if !qr_status.is_success() {
        return Err(format!("二维码图片请求失败: {}", qr_status));
    }

    if !qr_content_type.starts_with("image/") {
        let preview = String::from_utf8_lossy(&qr_bytes)
            .chars()
            .take(120)
            .collect::<String>();
        return Err(format!(
            "二维码内容异常：content-type={}, final_url={}, preview={}",
            qr_content_type, qr_final_url, preview
        ));
    }

    if qr_bytes.is_empty() {
        return Err("二维码图片为空，请重试".to_string());
    }

    let qr_image_base64 = format!(
        "data:{};base64,{}",
        qr_content_type,
        general_purpose::STANDARD.encode(qr_bytes)
    );

    Ok(PortalQrInitResponse {
        service: service_url,
        uuid,
        qr_image_base64,
        execution: page_info.execution,
        lt: page_info.lt,
    })
}

#[tauri::command]
async fn portal_qr_check_status(
    state: State<'_, AppState>,
    uuid: String,
) -> Result<PortalQrStatusResponse, String> {
    let qr_uuid = uuid.trim().to_string();
    if qr_uuid.is_empty() {
        return Err("二维码 uuid 不能为空".to_string());
    }

    let client = state.client.lock().await;
    let status_code = fetch_portal_qr_status_code(&client, &qr_uuid).await?;

    let (status_label, should_submit) = map_portal_qr_status(&status_code);
    Ok(PortalQrStatusResponse {
        uuid: qr_uuid,
        status_code,
        status_label: status_label.to_string(),
        should_submit,
    })
}

#[tauri::command]
async fn portal_qr_confirm_login(
    state: State<'_, AppState>,
    uuid: String,
    execution: Option<String>,
    lt: Option<String>,
    service: Option<String>,
) -> Result<UserInfo, String> {
    let qr_uuid = uuid.trim().to_string();
    if qr_uuid.is_empty() {
        return Err("二维码 uuid 不能为空".to_string());
    }
    let service_url = normalize_portal_service_url(service);
    let login_url = format!(
        "{}/login?display=qrLogin&service={}",
        crate::http_client::AUTH_BASE_URL,
        urlencoding::encode(&service_url)
    );
    let referer_url = format!(
        "{}/login?service={}",
        crate::http_client::AUTH_BASE_URL,
        urlencoding::encode(&service_url)
    );

    let mut client = state.client.lock().await;
    let mut form_data = client.last_login_inputs.clone().unwrap_or_default();

    let execution_value = execution
        .unwrap_or_else(|| form_data.get("execution").cloned().unwrap_or_default())
        .trim()
        .to_string();
    if execution_value.is_empty() {
        return Err("二维码登录参数 execution 缺失，请重新生成二维码".to_string());
    }

    let lt_value = lt
        .unwrap_or_else(|| form_data.get("lt").cloned().unwrap_or_default())
        .trim()
        .to_string();

    upsert_form_value(&mut form_data, &["uuid"], "uuid", &qr_uuid);
    upsert_form_value(&mut form_data, &["cllt"], "cllt", "qrLogin");
    upsert_form_value(&mut form_data, &["dllt"], "dllt", "generalLogin");
    upsert_form_value(&mut form_data, &["execution"], "execution", &execution_value);
    if !lt_value.is_empty() {
        upsert_form_value(&mut form_data, &["lt"], "lt", &lt_value);
    }
    upsert_form_value(&mut form_data, &["_eventId"], "_eventId", "submit");
    upsert_form_value(&mut form_data, &["rmShown"], "rmShown", "1");

    let response = client
        .client
        .post(&login_url)
        .header("Referer", &referer_url)
        .form(&form_data)
        .send()
        .await
        .map_err(|e| format!("提交扫码登录失败: {}", e))?;
    let final_url = response.url().to_string();
    let html = response
        .text()
        .await
        .map_err(|e| format!("读取扫码登录响应失败: {}", e))?;
    let portal_cookie_ready = has_portal_login_cookie(&client);
    let confirmed_hint = portal_cookie_ready
        || final_url.contains("ticket=ST-")
        || final_url.contains("e.hbut.edu.cn")
        || final_url.contains("code.hbut.edu.cn");

    let user_info = match fetch_portal_user_info_with_retry(
        &mut client,
        if confirmed_hint { 4 } else { 2 },
    )
    .await
    {
        Ok(info) => info,
        Err(fetch_err) => {
            let status_code = fetch_portal_qr_status_code(&client, &qr_uuid)
                .await
                .unwrap_or_default();
            if status_code == "3" {
                return Err("二维码已失效，请重新扫码".to_string());
            }
            let pending_like = status_code == "0" || status_code == "2" || status_code.is_empty();
            if pending_like && !confirmed_hint {
                return Err("扫码确认未完成，请在手机端确认后重试".to_string());
            }
            if !confirmed_hint && (final_url.contains("authserver/login") || html.contains("qrLoginForm")) {
                return Err("扫码确认未完成，请在手机端确认后重试".to_string());
            }
            if pending_like && confirmed_hint {
                if let Ok(info) = fetch_portal_user_info_with_retry(&mut client, 2).await {
                    info
                } else {
                    return Err(format!("扫码已确认，但同步教务信息失败: {}", fetch_err));
                }
            } else {
                return Err(format!("扫码已确认，但同步教务信息失败: {}", fetch_err));
            }
        }
    };

    client.is_logged_in = true;
    client.set_chaoxing_login_mode(false);
    client.user_info = Some(user_info.clone());
    client.last_username = Some(user_info.student_id.clone());
    client.last_password = None;
    client.save_cookie_snapshot_to_file();

    let one_code_token = client.ensure_electricity_token().await.unwrap_or_default();
    let (_token_opt, refresh_opt, expires_at_opt) = client.get_electricity_session();
    let refresh_token = refresh_opt.unwrap_or_default();
    let expires_at = expires_at_opt
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default();
    let _ = db::save_user_session(
        DB_FILENAME,
        &user_info.student_id,
        &client.get_cookies(),
        "",
        &one_code_token,
        Some(refresh_token.as_str()),
        Some(expires_at.as_str()),
    );

    Ok(user_info)
}

#[tauri::command]
async fn chaoxing_qr_init_login(state: State<'_, AppState>) -> Result<ChaoxingQrInitResponse, String> {
    let mut client = state.client.lock().await;
    let page = load_chaoxing_login_page(&mut client).await?;
    if page.uuid.is_empty() || page.enc.is_empty() {
        return Err("学习通二维码参数缺失，请重试".to_string());
    }
    let mut debug = page.debug.clone();
    let qr_image_base64 = fetch_chaoxing_qr_image(
        &mut client,
        &page.uuid,
        &page.context.fid,
        &page.login_page_url,
        &mut debug,
    )
    .await?;
    Ok(ChaoxingQrInitResponse {
        uuid: page.uuid,
        enc: page.enc,
        qr_image_base64,
        expires_in_seconds: 150,
        context: page.context,
        debug,
    })
}

#[tauri::command]
async fn chaoxing_qr_refresh_login(state: State<'_, AppState>) -> Result<ChaoxingQrInitResponse, String> {
    let mut client = state.client.lock().await;
    let page = load_chaoxing_login_page(&mut client).await?;
    let mut debug = page.debug.clone();
    let refresh_url = format!("{}/refreshQRCode", CHAOXING_BASE_URL);
    let refresh_resp = client
        .client
        .post(&refresh_url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Origin", CHAOXING_BASE_URL)
        .header("Referer", &page.login_page_url)
        .send()
        .await
        .map_err(|e| format!("学习通刷新二维码请求失败: {}", e))?;
    let refresh_status = refresh_resp.status();
    let refresh_text = refresh_resp
        .text()
        .await
        .map_err(|e| format!("学习通刷新二维码响应读取失败: {}", e))?;
    debug.push(format!(
        "refresh_qr status={} body_len={}",
        refresh_status.as_u16(),
        refresh_text.len()
    ));
    if !refresh_status.is_success() {
        return Err(format!("学习通刷新二维码状态异常: {}", refresh_status));
    }

    let refresh_json: serde_json::Value = serde_json::from_str(&refresh_text)
        .map_err(|e| format!("学习通刷新二维码响应解析失败: {}", e))?;
    let uuid = json_string(&refresh_json, &["uuid"]).unwrap_or(page.uuid);
    let enc = json_string(&refresh_json, &["enc"]).unwrap_or(page.enc);
    if uuid.trim().is_empty() || enc.trim().is_empty() {
        return Err("学习通刷新二维码返回了空 uuid/enc".to_string());
    }
    let qr_image_base64 = fetch_chaoxing_qr_image(
        &mut client,
        &uuid,
        &page.context.fid,
        &page.login_page_url,
        &mut debug,
    )
    .await?;

    Ok(ChaoxingQrInitResponse {
        uuid,
        enc,
        qr_image_base64,
        expires_in_seconds: 150,
        context: page.context,
        debug,
    })
}

#[tauri::command]
async fn chaoxing_qr_check_status(
    state: State<'_, AppState>,
    uuid: String,
    enc: String,
    forbidotherlogin: Option<String>,
    double_factor_login: Option<String>,
) -> Result<ChaoxingQrStatusResponse, String> {
    let qr_uuid = uuid.trim().to_string();
    let qr_enc = enc.trim().to_string();
    if qr_uuid.is_empty() || qr_enc.is_empty() {
        return Err("学习通二维码状态查询参数缺失".to_string());
    }
    let mut debug = Vec::new();
    let client = state.client.lock().await;
    let status_url = format!("{}/getauthstatus/v2", CHAOXING_BASE_URL);
    let form = vec![
        ("enc".to_string(), qr_enc.clone()),
        ("uuid".to_string(), qr_uuid.clone()),
        (
            "doubleFactorLogin".to_string(),
            double_factor_login
                .unwrap_or_else(|| "0".to_string())
                .trim()
                .to_string(),
        ),
        (
            "forbidotherlogin".to_string(),
            forbidotherlogin
                .unwrap_or_else(|| "0".to_string())
                .trim()
                .to_string(),
        ),
    ];

    let response = client
        .client
        .post(&status_url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Origin", CHAOXING_BASE_URL)
        .header("Referer", CHAOXING_LOGIN_PAGE_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("学习通二维码状态请求失败: {}", e))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .text()
        .await
        .map_err(|e| format!("学习通二维码状态读取失败: {}", e))?;
    debug.push(format!(
        "getauthstatus status={} content_type={} body_len={}",
        status.as_u16(),
        content_type,
        body.len()
    ));
    if !status.is_success() {
        return Err(format!("学习通二维码状态返回异常: {}", status));
    }
    let payload: serde_json::Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(parse_err) => {
            let cookie_ready = has_chaoxing_login_cookie(&client);
            debug.push(format!(
                "getauthstatus parse_failed cookie_ready={} err={}",
                cookie_ready, parse_err
            ));
            if cookie_ready {
                return Ok(ChaoxingQrStatusResponse {
                    status: true,
                    type_code: "1".to_string(),
                    message: "已完成学习通登录确认".to_string(),
                    nickname: None,
                    uid: None,
                    contain_two_factor_login: false,
                    two_factor_login_pc_url: None,
                    redirect_url: None,
                    should_finish_login: true,
                    should_refresh_qr: false,
                    debug,
                });
            }
            return Ok(ChaoxingQrStatusResponse {
                status: false,
                type_code: "3".to_string(),
                message: "等待扫码中...".to_string(),
                nickname: None,
                uid: None,
                contain_two_factor_login: false,
                two_factor_login_pc_url: None,
                redirect_url: None,
                should_finish_login: false,
                should_refresh_qr: false,
                debug,
            });
        }
    };

    let status_ok = json_bool(&payload, "status");
    let type_code = json_string(&payload, &["type"]).unwrap_or_default();
    let cookie_ready = has_chaoxing_login_cookie(&client);
    let mut message = json_string(&payload, &["mes", "msg2", "msg"]).unwrap_or_default();
    if message.is_empty() && cookie_ready {
        message = "已完成学习通登录确认".to_string();
    }
    let should_refresh_qr = type_code == "6" || type_code == "7";
    let should_finish_login = status_ok || (cookie_ready && !should_refresh_qr);
    let response_payload = ChaoxingQrStatusResponse {
        status: status_ok,
        type_code: type_code.clone(),
        message,
        nickname: json_string(&payload, &["nickname"]),
        uid: json_string(&payload, &["uid"]),
        contain_two_factor_login: json_bool(&payload, "containTwoFactorLogin"),
        two_factor_login_pc_url: json_string(&payload, &["twoFactorLoginPCUrl"]),
        redirect_url: json_string(&payload, &["url"]),
        should_finish_login,
        should_refresh_qr,
        debug,
    };
    Ok(response_payload)
}

#[tauri::command]
async fn chaoxing_qr_confirm_login(
    state: State<'_, AppState>,
    uuid: String,
    enc: String,
    account_hint: Option<String>,
) -> Result<ChaoxingLoginResult, String> {
    let qr_uuid = uuid.trim().to_string();
    let qr_enc = enc.trim().to_string();
    if qr_uuid.is_empty() || qr_enc.is_empty() {
        return Err("学习通扫码确认参数缺失".to_string());
    }

    let mut client = state.client.lock().await;
    let mut debug = Vec::new();
    let status_url = format!("{}/getauthstatus/v2", CHAOXING_BASE_URL);
    let form = vec![
        ("enc".to_string(), qr_enc),
        ("uuid".to_string(), qr_uuid),
        ("doubleFactorLogin".to_string(), "0".to_string()),
        ("forbidotherlogin".to_string(), "0".to_string()),
    ];
    let response = client
        .client
        .post(&status_url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Origin", CHAOXING_BASE_URL)
        .header("Referer", CHAOXING_LOGIN_PAGE_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("学习通扫码确认前置校验失败: {}", e))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .text()
        .await
        .map_err(|e| format!("学习通扫码确认状态读取失败: {}", e))?;
    debug.push(format!(
        "confirm_precheck status={} content_type={} body_len={}",
        status.as_u16(),
        content_type,
        body.len()
    ));
    if !status.is_success() {
        return Err(format!("学习通扫码确认状态异常: {}", status));
    }
    let mut redirect_url = String::new();
    match serde_json::from_str::<serde_json::Value>(&body) {
        Ok(payload) => {
            if !json_bool(&payload, "status") && !has_chaoxing_login_cookie(&client) {
                let msg = json_string(&payload, &["mes", "msg2", "msg"])
                    .unwrap_or_else(|| "请先在学习通完成扫码确认".to_string());
                return Err(msg);
            }
            redirect_url = json_string(&payload, &["url"]).unwrap_or_default();
        }
        Err(parse_err) => {
            let cookie_ready = has_chaoxing_login_cookie(&client);
            debug.push(format!(
                "confirm_precheck parse_failed cookie_ready={} err={}",
                cookie_ready, parse_err
            ));
            if !cookie_ready {
                return Err("扫码确认未完成，请在学习通完成确认后重试".to_string());
            }
        }
    }
    finalize_chaoxing_login(
        &mut client,
        account_hint.as_deref(),
        None,
        Some(redirect_url.as_str()),
        &mut debug,
    )
    .await
}

#[tauri::command]
async fn chaoxing_password_login(
    state: State<'_, AppState>,
    account: String,
    password: String,
) -> Result<ChaoxingLoginResult, String> {
    let raw_account = account.trim().to_string();
    let raw_password = password.trim().to_string();
    if raw_account.is_empty() || raw_password.is_empty() {
        return Err("学习通账号和密码不能为空".to_string());
    }

    let mut client = state.client.lock().await;
    let page = load_chaoxing_login_page(&mut client).await?;
    let mut debug = page.debug.clone();
    if page.context.need_vcode == "1" {
        return Err("学习通当前要求滑块/验证码，请先在浏览器完成验证后再试".to_string());
    }

    let should_encrypt = page.context.t.eq_ignore_ascii_case("true");
    let encoded_account = if should_encrypt {
        chaoxing_encrypt_value(&raw_account)?
    } else {
        raw_account.clone()
    };
    let encoded_password = if should_encrypt {
        chaoxing_encrypt_value(&raw_password)?
    } else {
        raw_password.clone()
    };
    debug.push(format!(
        "password_login encrypt={} fid={} refer={}",
        should_encrypt, page.context.fid, page.context.refer
    ));

    let form = vec![
        ("fid".to_string(), page.context.fid.clone()),
        ("uname".to_string(), encoded_account),
        ("password".to_string(), encoded_password),
        ("refer".to_string(), page.context.refer.clone()),
        ("t".to_string(), page.context.t.clone()),
        ("forbidotherlogin".to_string(), page.context.forbidotherlogin.clone()),
        ("validate".to_string(), page.context.validate.clone()),
        (
            "doubleFactorLogin".to_string(),
            page.context.double_factor_login.clone(),
        ),
        ("independentId".to_string(), page.context.independent_id.clone()),
        (
            "independentNameId".to_string(),
            page.context.independent_name_id.clone(),
        ),
    ];

    let login_url = format!("{}/fanyalogin", CHAOXING_BASE_URL);
    let response = client
        .client
        .post(&login_url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Origin", CHAOXING_BASE_URL)
        .header("Referer", &page.login_page_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("学习通账号密码登录请求失败: {}", e))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("学习通账号密码登录响应读取失败: {}", e))?;
    debug.push(format!(
        "fanyalogin status={} body_len={}",
        status.as_u16(),
        body.len()
    ));
    if !status.is_success() {
        return Err(format!("学习通账号密码登录状态异常: {}", status));
    }
    let payload: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("学习通账号密码登录响应解析失败: {}", e))?;
    if !json_bool(&payload, "status") {
        let msg = json_string(&payload, &["msg2", "mes", "msg"])
            .unwrap_or_else(|| "学习通账号密码登录失败".to_string());
        return Err(msg);
    }
    if json_bool(&payload, "containTwoFactorLogin") {
        return Err("学习通账号开启了双因子登录，当前版本暂不支持".to_string());
    }

    let redirect_url = json_string(&payload, &["url"])
        .map(|raw| {
            urlencoding::decode(&raw)
                .map(|v| v.into_owned())
                .unwrap_or(raw)
        })
        .unwrap_or_default();
    finalize_chaoxing_login(
        &mut client,
        Some(raw_account.as_str()),
        Some(raw_password.as_str()),
        Some(redirect_url.as_str()),
        &mut debug,
    )
    .await
}

#[tauri::command]
async fn recognize_captcha(state: State<'_, AppState>, image_base64: String) -> Result<String, String> {
    let mut hbut = state.client.lock().await;
    hbut
        .recognize_captcha_base64(&image_base64)
        .await
        .map_err(|e| format!("OCR recognize failed: {}", e))
}

#[tauri::command]
async fn set_ocr_endpoint(state: State<'_, AppState>, endpoint: String) -> Result<(), String> {
    let mut client = state.client.lock().await;
    client.set_ocr_endpoint(endpoint);
    Ok(())
}

#[tauri::command]
async fn set_ocr_runtime_config(
    state: State<'_, AppState>,
    endpoints: Option<Vec<String>>,
    local_fallback_endpoints: Option<Vec<String>>,
) -> Result<(), String> {
    let mut client = state.client.lock().await;
    client.set_ocr_runtime_config(
        endpoints.unwrap_or_default(),
        local_fallback_endpoints.unwrap_or_default(),
    );
    Ok(())
}

#[tauri::command]
async fn get_ocr_runtime_status(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    Ok(client.get_ocr_runtime_status())
}

#[tauri::command]
async fn fetch_remote_config(state: State<'_, AppState>, url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("??????: {}", e))?;

    let response = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("????: {}", e))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("??????: {}", e))?;

    if !status.is_success() {
        return Err(format!("????: {}", status));
    }

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("?? JSON ??: {}", e))?;

    let ocr = parsed.get("ocr").cloned().unwrap_or_default();
    let ocr_enabled = ocr
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let mut remote_endpoints = Vec::new();
    if ocr_enabled {
        if let Some(arr) = ocr.get("endpoints").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(text) = item.as_str() {
                    remote_endpoints.push(text.to_string());
                }
            }
        }
        if let Some(single) = ocr
            .get("endpoint")
            .and_then(|v| v.as_str())
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
        {
            remote_endpoints.push(single.to_string());
        }
    }

    let mut local_fallback_endpoints = Vec::new();
    if let Some(arr) = ocr.get("local_fallback_endpoints").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(text) = item.as_str() {
                local_fallback_endpoints.push(text.to_string());
            }
        }
    }
    if let Some(arr) = ocr.get("localFallbackEndpoints").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(text) = item.as_str() {
                local_fallback_endpoints.push(text.to_string());
            }
        }
    }

    {
        let mut hbut = state.client.lock().await;
        hbut.set_ocr_runtime_config(remote_endpoints.clone(), local_fallback_endpoints.clone());
    }

    // 提取 temp_upload 端点配置
    let temp_upload = parsed.get("temp_upload").or_else(|| parsed.get("tempUpload"));
    if let Some(ep) = temp_upload
        .and_then(|v| v.get("endpoint").or_else(|| v.get("url")))
        .and_then(|v| v.as_str())
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        let _ = set_temp_upload_endpoint_config(Some(ep.to_string()));
        println!("[Config] apply temp_upload endpoint: {}", ep);
    }

    // 提取 cloud_sync.proxy_endpoint（已在前端消费，此处仅日志确认）
    if let Some(proxy) = parsed.get("cloud_sync")
        .and_then(|v| v.get("proxy_endpoint").or_else(|| v.get("proxyEndpoint")))
        .and_then(|v| v.as_str())
    {
        println!("[Config] cloud_sync proxy_endpoint: {}", proxy);
    }

    println!(
        "[Config] apply OCR runtime config: enabled={}, remote_endpoints={}, local_fallback_endpoints={}",
        ocr_enabled,
        remote_endpoints.len(),
        local_fallback_endpoints.len(),
    );

    Ok(parsed)
}

#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle.exit(0);
    Ok(())
}

#[cfg(target_os = "android")]
fn notify_android_media_scanner(file_path: &std::path::Path, mime_type: &str) -> Result<(), String> {
    use jni::objects::{JObject, JValue};

    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("获取 Android VM 失败: {}", e))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("附加 Android 线程失败: {}", e))?;

    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let string_cls = env
        .find_class("java/lang/String")
        .map_err(|e| format!("加载 String 类失败: {}", e))?;
    let path_arr = env
        .new_object_array(1, &string_cls, JObject::null())
        .map_err(|e| format!("创建路径数组失败: {}", e))?;
    let mime_arr = env
        .new_object_array(1, &string_cls, JObject::null())
        .map_err(|e| format!("创建类型数组失败: {}", e))?;

    let path_str = env
        .new_string(file_path.to_string_lossy().to_string())
        .map_err(|e| format!("创建路径字符串失败: {}", e))?;
    let mime_str = env
        .new_string(mime_type)
        .map_err(|e| format!("创建类型字符串失败: {}", e))?;
    env.set_object_array_element(&path_arr, 0, &path_str)
        .map_err(|e| format!("写入路径数组失败: {}", e))?;
    env.set_object_array_element(&mime_arr, 0, &mime_str)
        .map_err(|e| format!("写入类型数组失败: {}", e))?;

    let media_cls = env
        .find_class("android/media/MediaScannerConnection")
        .map_err(|e| format!("加载 MediaScannerConnection 失败: {}", e))?;
    env.call_static_method(
        media_cls,
        "scanFile",
        "(Landroid/content/Context;[Ljava/lang/String;[Ljava/lang/String;Landroid/media/MediaScannerConnection$OnScanCompletedListener;)V",
        &[
            (&context).into(),
            (&path_arr).into(),
            (&mime_arr).into(),
            JValue::Object(&JObject::null()),
        ],
    )
    .map_err(|e| format!("触发媒体扫描失败: {}", e))?;

    // context 由 Android 生命周期管理，这里仅借用 JNI 句柄
    std::mem::forget(context);
    Ok(())
}

#[tauri::command]
fn set_temp_upload_endpoint(endpoint: Option<String>) -> Result<(), String> {
    set_temp_upload_endpoint_config(endpoint)
}

#[tauri::command]
async fn download_deyihei_font(
    app: tauri::AppHandle,
    url: Option<String>,
    urls: Option<Vec<String>>,
    force: Option<bool>,
) -> Result<String, String> {
    let force = force.unwrap_or(false);
    let cache_dir = app
        .path()
        .resolve("fonts", BaseDirectory::AppCache)
        .map_err(|e| format!("resolve cache dir failed: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create cache dir failed: {}", e))?;

    let font_path = cache_dir.join("SmileySans-Oblique.ttf");
    if !force {
        if let Ok(meta) = tokio::fs::metadata(&font_path).await {
            if meta.len() > 50_000 {
                return Ok(font_path.to_string_lossy().to_string());
            }
        }
    }

    let mut candidates: Vec<String> = Vec::new();
    if let Some(primary) = url {
        if !primary.trim().is_empty() {
            candidates.push(primary);
        }
    }
    if let Some(extra) = urls {
        for item in extra {
            if !item.trim().is_empty() {
                candidates.push(item);
            }
        }
    }
    for builtin in [
        "https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf",
    ] {
        candidates.push(builtin.to_string());
    }
    candidates.sort();
    candidates.dedup();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("create download client failed: {}", e))?;

    let mut last_error = "font download failed".to_string();
    for candidate in candidates {
        for _ in 0..2 {
            let response = match client
                .get(&candidate)
                .header(
                    reqwest::header::USER_AGENT,
                    "Mini-HBUT/1.0 (font-downloader; +https://github.com/superdaobo/mini-hbut)",
                )
                .header(reqwest::header::ACCEPT, "font/ttf,application/octet-stream,*/*")
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = format!("request failed: {} ({})", candidate, e);
                    continue;
                }
            };

            if !response.status().is_success() {
                last_error = format!("non-success status: {} ({})", candidate, response.status());
                continue;
            }

            let bytes = match response.bytes().await {
                Ok(data) => data,
                Err(e) => {
                    last_error = format!("read bytes failed: {} ({})", candidate, e);
                    continue;
                }
            };

            if bytes.len() < 50_000 {
                last_error = format!("downloaded file too small: {} ({} bytes)", candidate, bytes.len());
                continue;
            }

            tokio::fs::write(&font_path, &bytes)
                .await
                .map_err(|e| format!("write cached font failed: {}", e))?;
            return Ok(font_path.to_string_lossy().to_string());
        }
    }

    Err(last_error)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FontDownloadPayload {
    path: String,
    base64: String,
}

#[tauri::command]
async fn download_deyihei_font_payload(
    app: tauri::AppHandle,
    url: Option<String>,
    urls: Option<Vec<String>>,
    force: Option<bool>,
) -> Result<FontDownloadPayload, String> {
    let path = download_deyihei_font(app, url, urls, force).await?;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("read font file failed: {}", e))?;
    Ok(FontDownloadPayload {
        path,
        base64: general_purpose::STANDARD.encode(bytes),
    })
}

/// 通用远程字体下载命令：接受 URL 列表和缓存文件名，下载后返回 base64
#[tauri::command]
async fn download_remote_font_payload(
    app: tauri::AppHandle,
    urls: Vec<String>,
    cache_name: String,
    force: Option<bool>,
) -> Result<FontDownloadPayload, String> {
    let force = force.unwrap_or(false);
    let cache_dir = app
        .path()
        .resolve("fonts", BaseDirectory::AppCache)
        .map_err(|e| format!("resolve cache dir failed: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create cache dir failed: {}", e))?;

    let safe_name = cache_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect::<String>();
    if safe_name.is_empty() {
        return Err("invalid cache_name".to_string());
    }
    let font_path = cache_dir.join(&safe_name);

    if !force {
        if let Ok(meta) = tokio::fs::metadata(&font_path).await {
            if meta.len() > 10_000 {
                let bytes = tokio::fs::read(&font_path)
                    .await
                    .map_err(|e| format!("read cached font failed: {}", e))?;
                return Ok(FontDownloadPayload {
                    path: font_path.to_string_lossy().to_string(),
                    base64: general_purpose::STANDARD.encode(bytes),
                });
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("create download client failed: {}", e))?;

    let mut last_error = "remote font download failed".to_string();
    for candidate in &urls {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        for _ in 0..2 {
            let response = match client
                .get(trimmed)
                .header(
                    reqwest::header::USER_AGENT,
                    "Mini-HBUT/1.0 (font-downloader; +https://github.com/superdaobo/mini-hbut)",
                )
                .header(reqwest::header::ACCEPT, "font/woff2,font/woff,font/ttf,application/octet-stream,*/*")
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    last_error = format!("request failed: {} ({})", trimmed, e);
                    continue;
                }
            };

            if !response.status().is_success() {
                last_error = format!("non-success status: {} ({})", trimmed, response.status());
                continue;
            }

            let bytes = match response.bytes().await {
                Ok(data) => data,
                Err(e) => {
                    last_error = format!("read bytes failed: {} ({})", trimmed, e);
                    continue;
                }
            };

            if bytes.len() < 10_000 {
                last_error = format!("downloaded file too small: {} ({} bytes)", trimmed, bytes.len());
                continue;
            }

            tokio::fs::write(&font_path, &bytes)
                .await
                .map_err(|e| format!("write cached font failed: {}", e))?;

            return Ok(FontDownloadPayload {
                path: font_path.to_string_lossy().to_string(),
                base64: general_purpose::STANDARD.encode(&bytes),
            });
        }
    }

    Err(last_error)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RemoteImageCachePayload {
    path: String,
    from_cache: bool,
    updated_at: String,
    size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveExportFileRequest {
    file_name: String,
    mime_type: String,
    content_base64: String,
    prefer_media: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SaveExportFileResult {
    path: String,
    saved_to: String,
    size: u64,
    needs_manual_import: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceShareNativeRequest {
    endpoint: String,
    path: String,
    username: String,
    password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceShareFetchPayloadRequest {
    endpoint: String,
    path: String,
    username: String,
    password: String,
    max_bytes: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceShareListDirRequest {
    endpoint: String,
    path: String,
    username: String,
    password: String,
    depth: Option<u8>,
}

fn sanitize_cache_key(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let out = out.trim_matches('_');
    if out.is_empty() {
        "asset".to_string()
    } else {
        out.to_string()
    }
}

fn infer_image_extension(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".png") {
        ".png"
    } else if lower.contains(".webp") {
        ".webp"
    } else if lower.contains(".jpeg") || lower.contains(".jpg") {
        ".jpg"
    } else {
        ".jpg"
    }
}

fn extension_from_mime(mime_type: &str) -> &'static str {
    let normalized = mime_type.to_ascii_lowercase();
    if normalized.contains("json") {
        ".json"
    } else if normalized.contains("png") {
        ".png"
    } else if normalized.contains("jpeg") || normalized.contains("jpg") {
        ".jpg"
    } else if normalized.contains("webp") {
        ".webp"
    } else {
        ".bin"
    }
}

fn sanitize_export_file_name(raw: &str, default_ext: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let mut out = out.trim_matches('_').to_string();
    if out.is_empty() {
        out = format!("mini-hbut-export{}", default_ext);
    }
    if !out.to_ascii_lowercase().ends_with(default_ext) {
        out.push_str(default_ext);
    }
    out
}

#[cfg(target_os = "windows")]
fn pick_export_directory() -> Option<std::path::PathBuf> {
    rfd::FileDialog::new()
        .set_title("请选择导出目录")
        .pick_folder()
}

#[tauri::command]
#[allow(unused_variables)]
fn save_export_file(app: tauri::AppHandle, req: SaveExportFileRequest) -> Result<SaveExportFileResult, String> {
    let ext = extension_from_mime(&req.mime_type);
    let file_name = sanitize_export_file_name(&req.file_name, ext);
    let bytes = general_purpose::STANDARD
        .decode(req.content_base64.trim())
        .map_err(|e| format!("导出数据解析失败: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        // Windows 导出要求用户选择目录，便于企业环境下做路径管理
        let selected_dir = pick_export_directory().ok_or_else(|| "已取消选择保存目录".to_string())?;
        std::fs::create_dir_all(&selected_dir)
            .map_err(|e| format!("创建目录失败: {}", e))?;
        let file_path = selected_dir.join(file_name);
        std::fs::write(&file_path, &bytes)
            .map_err(|e| format!("写入导出文件失败: {}", e))?;
        return Ok(SaveExportFileResult {
            path: file_path.to_string_lossy().to_string(),
            saved_to: "windows-selected-dir".to_string(),
            size: bytes.len() as u64,
            needs_manual_import: false,
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        // 移动端与非 Windows 平台优先写入系统媒体目录，失败时回退到文档/缓存目录
        let mut candidates: Vec<(std::path::PathBuf, &'static str)> = Vec::new();
        let prefer_media = req.prefer_media.unwrap_or(false);

        if prefer_media {
            #[cfg(target_os = "android")]
            {
                if let Ok(dir) = app.path().resolve("Pictures", BaseDirectory::Public) {
                    candidates.push((dir, "public_picture"));
                }
            }
            if let Ok(dir) = app.path().picture_dir() {
                candidates.push((dir, "picture"));
            }
            if let Ok(dir) = app.path().download_dir() {
                candidates.push((dir, "download"));
            }
        } else if let Ok(dir) = app.path().download_dir() {
            candidates.push((dir, "download"));
        }

        if let Ok(dir) = app.path().document_dir() {
            candidates.push((dir, "document"));
        }
        if let Ok(dir) = app.path().app_data_dir() {
            candidates.push((dir, "app_data"));
        }
        if let Ok(dir) = app.path().app_cache_dir() {
            candidates.push((dir, "app_cache"));
        }

        let mut last_error = String::new();
        for (base_dir, label) in candidates {
            let export_dir = base_dir.join("Mini-HBUT-Export");
            if let Err(e) = std::fs::create_dir_all(&export_dir) {
                last_error = format!("创建目录失败({}): {}", label, e);
                continue;
            }
            let file_path = export_dir.join(&file_name);
            match std::fs::write(&file_path, &bytes) {
                Ok(_) => {
                    #[cfg(target_os = "android")]
                    let needs_manual_import = {
                        let wants_image_album =
                            prefer_media && req.mime_type.to_ascii_lowercase().starts_with("image/");
                        if wants_image_album {
                            notify_android_media_scanner(&file_path, &req.mime_type).is_err()
                        } else {
                            false
                        }
                    };

                    #[cfg(target_os = "ios")]
                    let needs_manual_import = true;

                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    let needs_manual_import = false;

                    return Ok(SaveExportFileResult {
                        path: file_path.to_string_lossy().to_string(),
                        saved_to: label.to_string(),
                        size: bytes.len() as u64,
                        needs_manual_import,
                    });
                }
                Err(e) => {
                    last_error = format!("写入失败({}): {}", label, e);
                }
            }
        }
        Err(if last_error.is_empty() {
            "没有可用的导出目录".to_string()
        } else {
            last_error
        })
    }
}

#[tauri::command]
async fn cache_remote_image(
    app: tauri::AppHandle,
    cache_key: String,
    url: String,
    force: Option<bool>,
) -> Result<RemoteImageCachePayload, String> {
    // 缓存目录固定放到 AppCache/maps，避免污染业务数据目录
    let cache_dir = app
        .path()
        .resolve("maps", BaseDirectory::AppCache)
        .map_err(|e| format!("resolve map cache dir failed: {}", e))?;
    tokio::fs::create_dir_all(&cache_dir)
        .await
        .map_err(|e| format!("create map cache dir failed: {}", e))?;

    let key = sanitize_cache_key(&cache_key);
    let ext = infer_image_extension(&url);
    let file_name = format!("{}{}", key, ext);
    let file_path = cache_dir.join(file_name);
    let force = force.unwrap_or(false);

    if !force {
        if let Ok(meta) = tokio::fs::metadata(&file_path).await {
            if meta.len() > 1_024 {
                return Ok(RemoteImageCachePayload {
                    path: file_path.to_string_lossy().to_string(),
                    from_cache: true,
                    updated_at: chrono::Local::now().to_rfc3339(),
                    size: meta.len(),
                });
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("create image download client failed: {}", e))?;

    let response = client
        .get(&url)
        .header(
            reqwest::header::USER_AGENT,
            "Mini-HBUT/1.0 (map-cache; +https://github.com/superdaobo/mini-hbut)",
        )
        .send()
        .await
        .map_err(|e| format!("download map failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("download map failed: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("read map bytes failed: {}", e))?;
    if bytes.len() < 1_024 {
        return Err(format!("downloaded map too small: {} bytes", bytes.len()));
    }

    tokio::fs::write(&file_path, &bytes)
        .await
        .map_err(|e| format!("write map cache failed: {}", e))?;

    Ok(RemoteImageCachePayload {
        path: file_path.to_string_lossy().to_string(),
        from_cache: false,
        updated_at: chrono::Local::now().to_rfc3339(),
        size: bytes.len() as u64,
    })
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let mut target = url.trim().to_string();
    if target.is_empty() {
        return Err("url is empty".to_string());
    }

    // 兼容微信小程序口令：#小程序://校园导览/AWm9BvLlALOD9xG
    // 若收到该口令，自动转换为微信深链，提升 iOS/Android 唤起成功率。
    if target.starts_with("#小程序://") || target.starts_with("小程序://") {
        let normalized = target.trim_start_matches('#').to_string();
        if let Some(token) = normalized.rsplit('/').next() {
            if !token.is_empty() {
                target = format!("weixin://dl/business/?t={}", token);
            }
        }
    }

    if !(target.starts_with("http://")
        || target.starts_with("https://")
        || target.starts_with("mailto:")
        || target.starts_with("tel:")
        || target.starts_with("weixin://")
        || target.starts_with("wechat://")
        || target.starts_with("小程序://")
        || target.starts_with("#小程序://"))
    {
        return Err("unsupported url scheme".to_string());
    }

    #[allow(deprecated)]
    app.shell()
        .open(&target, None)
        .map_err(|e| format!("open external url failed: {}", e))
}

fn normalize_resource_share_path_native(path: &str) -> String {
    let replaced = path.replace('\\', "/");
    let mut normalized = replaced.trim().to_string();
    if normalized.is_empty() {
        return "/".to_string();
    }
    if !normalized.starts_with('/') {
        normalized = format!("/{}", normalized);
    }
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    if normalized.len() > 1 {
        normalized = normalized.trim_end_matches('/').to_string();
    }
    if normalized.is_empty() {
        "/".to_string()
    } else {
        normalized
    }
}

fn encode_resource_share_path_native(path: &str) -> String {
    normalize_resource_share_path_native(path)
        .split('/')
        .map(urlencoding::encode)
        .collect::<Vec<_>>()
        .join("/")
}

fn validate_resource_share_request(
    endpoint: &str,
    username: &str,
    password: &str,
) -> Result<String, String> {
    let cleaned = endpoint.trim().trim_end_matches('/').to_string();
    if cleaned.is_empty() || !(cleaned.starts_with("http://") || cleaned.starts_with("https://")) {
        return Err("resource_share endpoint 非法或为空".to_string());
    }
    if username.trim().is_empty() || password.trim().is_empty() {
        return Err("resource_share 缺少账号或密码".to_string());
    }
    Ok(cleaned)
}

fn build_resource_share_auth(username: &str, password: &str) -> String {
    format!(
        "Basic {}",
        general_purpose::STANDARD.encode(format!("{}:{}", username, password).as_bytes())
    )
}

#[tauri::command]
async fn resource_share_direct_url_native(req: ResourceShareNativeRequest) -> Result<serde_json::Value, String> {
    let endpoint = validate_resource_share_request(&req.endpoint, &req.username, &req.password)?;
    let encoded_path = encode_resource_share_path_native(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = build_resource_share_auth(&req.username, &req.password);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("创建资源直链客户端失败: {}", e))?;

    let head_resp = client
        .head(&remote_url)
        .header("Authorization", auth.clone())
        .send()
        .await
        .map_err(|e| format!("资源直链 HEAD 请求失败: {}", e))?;

    let mut direct_url = String::new();
    let mut need_auth = false;
    let mut status_code = head_resp.status().as_u16();

    if let Some(loc) = head_resp.headers().get("location").and_then(|v| v.to_str().ok()) {
        direct_url = loc.to_string();
    }

    if direct_url.is_empty() {
        let mut probe_error: Option<String> = None;
        match client
            .get(&remote_url)
            .header("Authorization", auth.clone())
            .header("Range", "bytes=0-0")
            .send()
            .await
        {
            Ok(get_resp) => {
                status_code = get_resp.status().as_u16();
                if let Some(loc) = get_resp.headers().get("location").and_then(|v| v.to_str().ok()) {
                    direct_url = loc.to_string();
                } else if get_resp.status().is_success() {
                    need_auth = true;
                    direct_url = remote_url.clone();
                }
            }
            Err(e) => {
                probe_error = Some(e.to_string());
            }
        }

        if direct_url.is_empty() && head_resp.status().is_success() {
            status_code = head_resp.status().as_u16();
            need_auth = true;
            direct_url = remote_url.clone();
        }

        if direct_url.is_empty() {
            if let Some(e) = probe_error {
                return Err(format!("资源直链 GET 探测失败: {}", e));
            }
        }
    }

    if direct_url.is_empty() {
        return Err("未获取到可用直链".to_string());
    }

    Ok(serde_json::json!({
        "url": direct_url,
        "status": status_code,
        "needAuth": need_auth
    }))
}

#[tauri::command]
async fn resource_share_fetch_file_payload_native(
    req: ResourceShareFetchPayloadRequest,
) -> Result<serde_json::Value, String> {
    let endpoint = validate_resource_share_request(&req.endpoint, &req.username, &req.password)?;
    let encoded_path = encode_resource_share_path_native(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = build_resource_share_auth(&req.username, &req.password);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建资源下载客户端失败: {}", e))?;

    let response = client
        .get(&remote_url)
        .header("Authorization", auth)
        .send()
        .await
        .map_err(|e| format!("资源下载请求失败: {}", e))?;

    let status = response.status().as_u16();
    if !(status == 200 || status == 206) {
        return Err(format!("资源下载失败 HTTP {}", status));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取资源字节失败: {}", e))?;

    if let Some(limit) = req.max_bytes {
        if bytes.len() > limit {
            return Err(format!(
                "资源体积超过上限: {} bytes > {} bytes",
                bytes.len(),
                limit
            ));
        }
    }

    Ok(serde_json::json!({
        "status": status,
        "contentType": content_type,
        "size": bytes.len(),
        "base64": general_purpose::STANDARD.encode(bytes),
    }))
}

#[tauri::command]
async fn resource_share_list_dir_native(req: ResourceShareListDirRequest) -> Result<serde_json::Value, String> {
    let endpoint = validate_resource_share_request(&req.endpoint, &req.username, &req.password)?;
    let encoded_path = encode_resource_share_path_native(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = build_resource_share_auth(&req.username, &req.password);
    let depth = req.depth.unwrap_or(1).to_string();

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("创建目录客户端失败: {}", e))?;

    let method = reqwest::Method::from_bytes(b"PROPFIND")
        .map_err(|e| format!("构造 PROPFIND 方法失败: {}", e))?;
    let body = r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>"#;

    let mut last_error = String::new();
    for with_body in [true, false] {
        let mut builder = client
            .request(method.clone(), &remote_url)
            .header("Authorization", auth.clone())
            .header("Depth", depth.clone())
            .header("Accept", "application/xml,text/xml;q=0.9,*/*;q=0.8");
        if with_body {
            builder = builder
                .header("Content-Type", "application/xml; charset=utf-8")
                .body(body.to_string());
        }

        match builder.send().await {
            Ok(response) => {
                let status = response.status().as_u16();
                let text = response
                    .text()
                    .await
                    .map_err(|e| format!("读取目录响应失败: {}", e))?;
                if status == 207 || (200..300).contains(&status) {
                    return Ok(serde_json::json!({
                        "status": status,
                        "xml": text
                    }));
                }
                let snippet: String = text.chars().take(240).collect();
                last_error = format!("PROPFIND 失败 HTTP {}: {}", status, snippet);
            }
            Err(e) => {
                last_error = format!("PROPFIND 请求失败: {}", e);
            }
        }
    }

    if last_error.is_empty() {
        last_error = "PROPFIND 失败：未知错误".to_string();
    }
    Err(last_error)
}

#[tauri::command]
fn open_file_with_system(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = path.trim().to_string();
    if target.is_empty() {
        return Err("path is empty".to_string());
    }
    #[allow(deprecated)]
    app.shell()
        .open(&target, None)
        .map_err(|e| format!("open file failed: {}", e))
}

#[tauri::command]
fn send_test_notification_native(
    app: tauri::AppHandle,
    title: Option<String>,
    body: Option<String>,
) -> Result<(), String> {
    let real_title = title.unwrap_or_else(|| "Mini-HBUT".to_string());
    let real_body = body.unwrap_or_else(|| "这是一个测试通知。".to_string());

    app.notification()
        .builder()
        .title(&real_title)
        .body(&real_body)
        .show()
        .map_err(|e| format!("send native notification failed: {}", e))
}

fn map_notification_permission_state(state: tauri_plugin_notification::PermissionState) -> String {
    match state {
        tauri_plugin_notification::PermissionState::Granted => "granted".to_string(),
        tauri_plugin_notification::PermissionState::Denied => "denied".to_string(),
        tauri_plugin_notification::PermissionState::Prompt
        | tauri_plugin_notification::PermissionState::PromptWithRationale => "default".to_string(),
    }
}

#[tauri::command]
fn get_notification_permission_native(app: tauri::AppHandle) -> Result<String, String> {
    app.notification()
        .permission_state()
        .map(map_notification_permission_state)
        .map_err(|e| format!("get native notification permission failed: {}", e))
}

#[tauri::command]
fn request_notification_permission_native(app: tauri::AppHandle) -> Result<String, String> {
    app.notification()
        .request_permission()
        .map(map_notification_permission_state)
        .map_err(|e| format!("request native notification permission failed: {}", e))
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
    client.set_chaoxing_login_mode(false);

    // 尝试获取电费 Token (One Code)
    let one_code_token = match client.ensure_electricity_token().await {
        Ok(t) => {
            println!("[调试] Login: Successfully obtained one_code_浠ょ墝");
            t
        },
        Err(e) => {
            println!("[璀﹀憡] 登录：获?one_code_浠ょ墝 失败: {}", e);
            String::new()
        }
    };

    // 保存会话到本地数据库 (鐢ㄤ自动重连)
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
        println!("[璀﹀憡] 保存会话失败: {}", e);
    }

    let user_info = client
        .user_info
        .clone()
        .ok_or_else(|| "login succeeded but user info is missing".to_string())?;
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

    // Prefer session by student id; fallback to latest session if needed.
    let mut session_opt = match db::get_user_session(DB_FILENAME, &user_info.student_id) {
        Ok(v) => v,
        Err(e) => {
            println!("[璀﹀憡] 加载会话凭据失败: {}", e);
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
                println!("[调试] Restored one_code_浠ょ墝");
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
        .ok_or_else(|| "无可疑历史会话".to_string())?;

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
async fn set_offline_user_context(
    state: State<'_, AppState>,
    student_id: String,
) -> Result<(), String> {
    let sid = student_id.trim().to_string();
    if sid.is_empty() {
        return Ok(());
    }
    let mut client = state.client.lock().await;
    client.set_offline_user_context(&sid);
    Ok(())
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
#[allow(unreachable_code)]
async fn sync_schedule(state: State<'_, AppState>, semester: Option<String>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let requested_semester = semester
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let explicit_semester = requested_semester.is_some();
    let schedule_context = client.resolve_schedule_context(requested_semester.as_deref()).await;
    let semester_to_query = schedule_context
        .get("semester")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| requested_semester.clone())
        .unwrap_or_else(|| "2024-2025-1".to_string());

    let result = match client.fetch_schedule(Some(semester_to_query.as_str())).await {
        Ok((course_list, _now_week)) => {
            let mut meta = schedule_context;
            if let Some(map) = meta.as_object_mut() {
                map.insert("semester".to_string(), serde_json::json!(semester_to_query));
                map.insert("total_courses".to_string(), serde_json::json!(course_list.len()));
                map.insert(
                    "query_time".to_string(),
                    serde_json::json!(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                );
            }
            let payload = serde_json::json!({
                "success": true,
                "data": course_list,
                "meta": meta,
                "sync_time": chrono::Local::now().to_rfc3339(),
                "offline": false
            });
            if let Some(uid) = &uid {
                let _ = db::save_cache(DB_FILENAME, "schedule_cache", uid, &payload);
            }
            payload
        }
        Err(e) => {
            let msg = e.to_string();
            if crate::http_client::HbutClient::is_no_schedule_error_message(&msg) {
                return Err("暂无可用课表".to_string());
            }
            if explicit_semester {
                return Err(msg);
            }
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "schedule_cache", uid) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            return Err(msg);
        }
    };
    return Ok(result);
    
    // 获取当前︽（基于日期计算）
    let semester = match requested_semester {
        Some(s) => s,
        None => client
            .get_current_semester()
            .await
            .unwrap_or_else(|_| "2024-2025-1".to_string()),
    };
    
    // 获取″数据计算当前ㄦ和开始日?
    let calendar_data = client.fetch_calendar_data(Some(semester.clone())).await;
    let (current_week, start_date) = if let Ok(ref cal) = calendar_data {
        let meta = cal.get("meta");
        let week = meta.and_then(|m| m.get("current_week")).and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let start = meta.and_then(|m| m.get("start_date")).and_then(|v| v.as_str()).unwrap_or("").to_string();
        (week, start)
    } else {
        (1, String::new())
    };
    
    match client.fetch_schedule(Some(semester.as_str())).await {
        Ok((course_list, _now_week)) => {
            // Keep response shape consistent with Python backend.
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
            let msg = e.to_string();
            if explicit_semester {
                let lower = msg.to_lowercase();
                if msg.contains("该学期无课表")
                    || msg.contains("无课表")
                    || msg.contains("ret=-1")
                    || lower.contains("unknown schedule")
                    || lower.contains("no schedule")
                {
                    return Err("该学期无课表，请切换学期".to_string());
                }
                if msg.contains("课表 API 返回错误")
                    || msg.contains("课表数据格式不正确")
                    || msg.contains("ret=-1")
                {
                    return Err("该学期无课表，请切换学期".to_string());
                }
                return Err(msg);
            }
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "schedule_cache", uid) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(msg)
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

pub(crate) fn normalize_custom_weeks(input: &[i32]) -> Vec<i32> {
    let mut weeks = input
        .iter()
        .copied()
        .filter(|w| *w > 0 && *w <= 60)
        .collect::<Vec<_>>();
    weeks.sort_unstable();
    weeks.dedup();
    weeks
}

pub(crate) fn format_weeks_text(weeks: &[i32]) -> String {
    let values = normalize_custom_weeks(weeks);
    if values.is_empty() {
        return String::new();
    }
    let mut parts: Vec<String> = Vec::new();
    let mut start = values[0];
    let mut prev = values[0];
    for current in values.iter().skip(1).copied() {
        if current == prev + 1 {
            prev = current;
            continue;
        }
        if start == prev {
            parts.push(start.to_string());
        } else {
            parts.push(format!("{}-{}", start, prev));
        }
        start = current;
        prev = current;
    }
    if start == prev {
        parts.push(start.to_string());
    } else {
        parts.push(format!("{}-{}", start, prev));
    }
    parts.join(",")
}

pub(crate) fn strip_custom_course_id(value: &str) -> String {
    value.trim().trim_start_matches("custom:").to_string()
}

pub(crate) fn custom_course_to_payload(course: &db::CustomScheduleCourseRecord) -> serde_json::Value {
    serde_json::json!({
        "id": format!("custom:{}", course.id),
        "source_id": course.id,
        "name": course.name,
        "teacher": course.teacher,
        "room": course.room,
        "room_code": course.room,
        "building": "自定义",
        "weekday": course.weekday,
        "period": course.period,
        "djs": course.djs,
        "weeks": normalize_custom_weeks(&course.weeks),
        "weeks_text": format_weeks_text(&course.weeks),
        "credit": "",
        "class_name": "自定义课程",
        "semester": course.semester,
        "is_custom": true,
        "created_at": course.created_at,
        "updated_at": course.updated_at
    })
}

#[tauri::command]
async fn list_custom_schedule_courses(
    student_id: String,
    semester: String,
) -> Result<serde_json::Value, String> {
    let sid = student_id.trim().to_string();
    let sem = semester.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    let list = db::list_custom_schedule_courses(DB_FILENAME, sid.as_str(), sem.as_str())
        .map_err(|e| e.to_string())?;
    let data = list
        .iter()
        .map(custom_course_to_payload)
        .collect::<Vec<serde_json::Value>>();
    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

#[tauri::command]
async fn list_all_custom_schedule_courses(
    student_id: String,
) -> Result<serde_json::Value, String> {
    let sid = student_id.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    let list = db::list_all_custom_schedule_courses(DB_FILENAME, sid.as_str())
        .map_err(|e| e.to_string())?;
    let data = list
        .iter()
        .map(custom_course_to_payload)
        .collect::<Vec<serde_json::Value>>();
    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

#[tauri::command]
async fn add_custom_schedule_course(
    req: AddCustomScheduleCourseRequest,
) -> Result<serde_json::Value, String> {
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let name = req.name.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if name.is_empty() {
        return Err("课程名称不能为空".to_string());
    }
    if !(1..=7).contains(&req.weekday) {
        return Err("上课时间必须是周一到周日".to_string());
    }
    if !(1..=11).contains(&req.period) {
        return Err("开始节次必须在 1-11 节".to_string());
    }
    let max_span = 12 - req.period;
    if req.djs < 1 || req.djs > max_span {
        return Err(format!("上课节数不合法，当前最多可选 {} 节", max_span));
    }
    let weeks = normalize_custom_weeks(&req.weeks);
    if weeks.is_empty() {
        return Err("请至少选择一个上课周次".to_string());
    }

    let mut rng = rand::thread_rng();
    let id = format!("c{}{:04}", Utc::now().timestamp_millis(), rng.gen_range(0..10000));
    let now = chrono::Local::now().to_rfc3339();
    let record = db::CustomScheduleCourseRecord {
        id,
        student_id: sid.clone(),
        semester: sem,
        name,
        teacher: req.teacher.unwrap_or_default().trim().to_string(),
        room: req.room.unwrap_or_default().trim().to_string(),
        weekday: req.weekday,
        period: req.period,
        djs: req.djs,
        weeks,
        created_at: now.clone(),
        updated_at: now,
    };
    db::add_custom_schedule_course(DB_FILENAME, &record).map_err(|e| e.to_string())?;
    let saved = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), record.id.as_str())
        .map_err(|e| e.to_string())?
        .unwrap_or(record);
    Ok(serde_json::json!({
        "success": true,
        "data": custom_course_to_payload(&saved)
    }))
}

#[tauri::command]
async fn delete_custom_schedule_course(
    req: DeleteCustomScheduleCourseRequest,
) -> Result<serde_json::Value, String> {
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let course_id = strip_custom_course_id(req.course_id.as_str());
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if course_id.is_empty() {
        return Err("course_id 不能为空".to_string());
    }

    let mode = req.mode.unwrap_or_else(|| "all".to_string()).to_lowercase();
    if mode == "current_week" {
        let week = req.current_week.unwrap_or(0);
        if week <= 0 {
            return Err("current_week 参数不合法".to_string());
        }
        let existing = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "未找到要删除的自定义课程".to_string())?;
        if existing.semester != sem {
            return Err("学期不匹配，无法删除该课程".to_string());
        }
        let mut weeks = normalize_custom_weeks(&existing.weeks);
        let before_len = weeks.len();
        weeks.retain(|w| *w != week);
        if weeks.len() == before_len {
            return Err("当前周不在该课程周次中".to_string());
        }
        if weeks.is_empty() {
            db::delete_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
                .map_err(|e| e.to_string())?;
            return Ok(serde_json::json!({
                "success": true,
                "deleted": true,
                "mode": "current_week",
                "removed_week": week
            }));
        }
        db::update_custom_schedule_course_weeks(DB_FILENAME, sid.as_str(), course_id.as_str(), weeks.as_slice())
            .map_err(|e| e.to_string())?;
        let updated = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "更新后未找到课程记录".to_string())?;
        return Ok(serde_json::json!({
            "success": true,
            "deleted": false,
            "mode": "current_week",
            "removed_week": week,
            "data": custom_course_to_payload(&updated)
        }));
    }

    let affected = db::delete_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
        .map_err(|e| e.to_string())?;
    if affected <= 0 {
        return Err("未找到要删除的自定义课程".to_string());
    }
    Ok(serde_json::json!({
        "success": true,
        "deleted": true,
        "mode": "all"
    }))
}

#[tauri::command]
async fn update_custom_schedule_course(
    req: UpdateCustomScheduleCourseRequest,
) -> Result<serde_json::Value, String> {
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let course_id = strip_custom_course_id(req.course_id.as_str());
    let name = req.name.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if course_id.is_empty() {
        return Err("course_id 不能为空".to_string());
    }
    if name.is_empty() {
        return Err("课程名称不能为空".to_string());
    }
    if !(1..=7).contains(&req.weekday) {
        return Err("上课时间必须是周一到周日".to_string());
    }
    if !(1..=11).contains(&req.period) {
        return Err("开始节次必须在 1-11 节".to_string());
    }
    let max_span = 12 - req.period;
    if req.djs < 1 || req.djs > max_span {
        return Err(format!("上课节数不合法，当前最多可选 {} 节", max_span));
    }
    let weeks = normalize_custom_weeks(&req.weeks);
    if weeks.is_empty() {
        return Err("请至少选择一个上课周次".to_string());
    }

    let existing = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到要修改的自定义课程".to_string())?;
    if existing.semester != sem {
        return Err("学期不匹配，无法修改该课程".to_string());
    }

    let record = db::CustomScheduleCourseRecord {
        id: existing.id,
        student_id: sid.clone(),
        semester: sem,
        name,
        teacher: req.teacher.unwrap_or_default().trim().to_string(),
        room: req.room.unwrap_or_default().trim().to_string(),
        weekday: req.weekday,
        period: req.period,
        djs: req.djs,
        weeks,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
    };

    let affected = db::update_custom_schedule_course(DB_FILENAME, &record).map_err(|e| e.to_string())?;
    if affected <= 0 {
        return Err("未找到要修改的自定义课程".to_string());
    }
    let updated = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), record.id.as_str())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "更新后未找到课程记录".to_string())?;
    Ok(serde_json::json!({
        "success": true,
        "data": custom_course_to_payload(&updated)
    }))
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

/// RFC 5545 §3.1 行折叠：每行不超过 75 个字节，超出部分折行并以 CRLF+空格连接
fn fold_ics_line(line: &str) -> String {
    let max_bytes = 75;
    if line.len() <= max_bytes {
        return format!("{}\r\n", line);
    }
    let mut result = String::new();
    let mut byte_count = 0;
    let mut first_line = true;
    for ch in line.chars() {
        let ch_len = ch.len_utf8();
        // 折行后续行以空格开头，所以可用字节数减 1
        let limit = if first_line { max_bytes } else { max_bytes - 1 };
        if byte_count + ch_len > limit {
            result.push_str("\r\n ");
            byte_count = 1; // 空格占 1 字节
            first_line = false;
        }
        result.push(ch);
        byte_count += ch_len;
    }
    result.push_str("\r\n");
    result
}

fn parse_ics_datetime(input: &str) -> Option<chrono::NaiveDateTime> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(input) {
        return Some(dt.naive_local());
    }
    chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S").ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%d %H:%M:%S").ok())
}

fn export_upload_endpoint(req: &ScheduleExportRequest) -> String {
    if let Some(v) = req.upload_endpoint.as_ref() {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    if let Some(v) = get_temp_upload_endpoint_config() {
        if !v.trim().is_empty() {
            return v;
        }
    }
    if let Ok(v) = std::env::var("HBUT_TEMP_UPLOAD_ENDPOINT") {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    DEFAULT_TEMP_UPLOAD_ENDPOINT.to_string()
}

#[tauri::command]
async fn export_schedule_calendar(req: ScheduleExportRequest) -> Result<serde_json::Value, String> {
    if req.events.is_empty() {
        return Err("娌℃可导出的课▼数据".to_string());
    }

    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let sid = sanitize_filename_part(req.student_id.as_deref().unwrap_or("student"));
    let semester = sanitize_filename_part(req.semester.as_deref().unwrap_or("semester"));
    let week = req.week.unwrap_or(0);
    let filename = format!("schedule_{}_{}_w{}_{}.ics", sid, semester, week, ts);

    let mut ics = String::new();
    ics.push_str("BEGIN:VCALENDAR\r\n");
    ics.push_str("VERSION:2.0\r\n");
    ics.push_str("CALSCALE:GREGORIAN\r\n");
    ics.push_str("METHOD:PUBLISH\r\n");
    ics.push_str("X-WR-CALNAME:HBUT 课表\r\n");
    ics.push_str("X-WR-TIMEZONE:Asia/Shanghai\r\n");
    ics.push_str("PRODID:-//Mini-HBUT//Schedule Export//CN\r\n");
    // VTIMEZONE: Asia/Shanghai (UTC+8, 无 DST)
    ics.push_str("BEGIN:VTIMEZONE\r\n");
    ics.push_str("TZID:Asia/Shanghai\r\n");
    ics.push_str("X-LIC-LOCATION:Asia/Shanghai\r\n");
    ics.push_str("BEGIN:STANDARD\r\n");
    ics.push_str("DTSTART:19700101T000000\r\n");
    ics.push_str("TZOFFSETFROM:+0800\r\n");
    ics.push_str("TZOFFSETTO:+0800\r\n");
    ics.push_str("TZNAME:CST\r\n");
    ics.push_str("END:STANDARD\r\n");
    ics.push_str("END:VTIMEZONE\r\n");

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
        ics.push_str(&fold_ics_line(&format!("UID:{}", uid)));
        ics.push_str(&fold_ics_line(&format!("DTSTAMP:{}", dtstamp)));
        ics.push_str(&fold_ics_line(&format!("DTSTART;TZID=Asia/Shanghai:{}", start.format("%Y%m%dT%H%M%S"))));
        ics.push_str(&fold_ics_line(&format!("DTEND;TZID=Asia/Shanghai:{}", end.format("%Y%m%dT%H%M%S"))));
        ics.push_str(&fold_ics_line(&format!("SUMMARY:{}", summary)));
        if let Some(desc) = desc {
            ics.push_str(&fold_ics_line(&format!("DESCRIPTION:{}", desc)));
        }
        if let Some(location) = location {
            ics.push_str(&fold_ics_line(&format!("LOCATION:{}", location)));
        }
        ics.push_str("END:VEVENT\r\n");
    }
    ics.push_str("END:VCALENDAR\r\n");
    let upload_url = export_upload_endpoint(&req);
    let ttl = req.ttl_seconds.unwrap_or(24 * 3600).clamp(3600, 72 * 3600);
    let payload = serde_json::json!({
        "filename": filename.clone(),
        "content_base64": general_purpose::STANDARD.encode(ics.as_bytes()),
        "content_type": "text/calendar; charset=utf-8",
        "ttl_seconds": ttl
    });

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建上传客户端失败: {}", e))?;

    // 带轮询兜底的上传逻辑
    let mut last_err = String::new();
    let upload_endpoints = {
        let mut eps = vec![upload_url.clone()];
        // 如果运行时配置的端点与当前不同，追加为备选
        if let Some(rt) = get_temp_upload_endpoint_config() {
            if rt != upload_url && !rt.trim().is_empty() {
                eps.push(rt);
            }
        }
        // 硬编码默认值作为最终兜底
        let default_ep = DEFAULT_TEMP_UPLOAD_ENDPOINT.to_string();
        if !eps.contains(&default_ep) {
            eps.push(default_ep);
        }
        eps
    };

    let mut resp_body: Option<serde_json::Value> = None;
    for (idx, ep) in upload_endpoints.iter().enumerate() {
        println!("[调试] 上传尝试 #{}: {}", idx + 1, ep);
        match http.post(ep.as_str()).json(&payload).send().await {
            Ok(resp) => {
                let status = resp.status();
                match resp.json::<serde_json::Value>().await {
                    Ok(body) => {
                        if status.is_success() && body.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                            resp_body = Some(body);
                            break;
                        }
                        let msg = body.get("error").and_then(|v| v.as_str()).unwrap_or("上传服务返回失败");
                        last_err = format!("端点 {} 失败: {}", ep, msg);
                        println!("[警告] {}", last_err);
                    }
                    Err(e) => {
                        last_err = format!("端点 {} 解析响应失败: {}", ep, e);
                        println!("[警告] {}", last_err);
                    }
                }
            }
            Err(e) => {
                last_err = format!("端点 {} 请求失败: {}", ep, e);
                println!("[警告] {}", last_err);
            }
        }
    }

    let body = resp_body.ok_or_else(|| format!("课表导出上传失败（已尝试 {} 个端点）: {}", upload_endpoints.len(), last_err))?;

    let url = body
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "上传成功但未返回链接".to_string())?;
    let remote_filename = body
        .get("filename")
        .and_then(|v| v.as_str())
        .unwrap_or(filename.as_str())
        .to_string();
    let expires_at = body
        .get("expires_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(serde_json::json!({
        "success": true,
        "url": url,
        "filename": remote_filename,
        "count": req.events.len(),
        "expires_at": expires_at,
        "provider": "hf-temp-storage"
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
    let uid = client
        .user_info
        .as_ref()
        .map(|u| u.student_id.clone())
        .or_else(|| client.last_username.clone());

    // 基础个人信息优先走本地缓存，避免重复请求教务页面。
    if let Some(uid) = &uid {
        if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "studentinfo_cache", uid) {
            return Ok(attach_sync_time(cached_data, &sync_time, true));
        }
    }

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
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_personal_login_access_info(
    state: State<'_, AppState>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
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
                let _ = db::save_cache(DB_FILENAME, "student_login_access_cache", cache_key, &payload);
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
async fn fetch_qxzkb_options(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let context = client.resolve_schedule_context(None).await;
    let current_semester = context
        .get("semester")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_default();

    let mut payload = crate::qxzkb_options::qxzkb_options();
    if !current_semester.is_empty() {
        if let Some(defaults) = payload.get_mut("defaults").and_then(|v| v.as_object_mut()) {
            defaults.insert(
                "xnxq".to_string(),
                serde_json::json!(current_semester.clone()),
            );
        }
        if let Some(list) = payload
            .get_mut("options")
            .and_then(|v| v.get_mut("xnxq"))
            .and_then(|v| v.as_array_mut())
        {
            let mut normalized = Vec::with_capacity(list.len() + 1);
            normalized.push(serde_json::json!({
                "value": current_semester.clone(),
                "label": "当前学期"
            }));
            for item in list.iter() {
                let value = item
                    .get("value")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim())
                    .unwrap_or("");
                if value.is_empty() || value == current_semester {
                    continue;
                }
                normalized.push(item.clone());
            }
            *list = normalized;
        }
    }
    if let Some(map) = payload.as_object_mut() {
        map.insert("context".to_string(), context);
    }
    Ok(payload)
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
async fn fetch_library_dict(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let cache_key = "dict";
    match client.fetch_library_dict().await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "library_public_cache", cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "library_public_cache", cache_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn search_library_books(
    state: State<'_, AppState>,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
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
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "library_public_cache", &cache_key) {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_library_book_detail(
    state: State<'_, AppState>,
    title: String,
    isbn: String,
    record_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let raw = format!("{}|{}|{}", title, isbn, record_id.unwrap_or_default());
    let cache_key = build_public_cache_key("detail", &raw);

    match client.fetch_library_book_detail(&title, &isbn, record_id).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "library_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "library_public_cache", &cache_key) {
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
            println!("[璀﹀憡] Transaction network fetch failed: {}, trying cache...", e);
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) = db::get_cache(DB_FILENAME, "transaction_cache", key) {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn fetch_course_selection_overview(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_overview(&client).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_course_selection_list(
    state: State<'_, AppState>,
    req: CourseSelectionListRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_list(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_course_selection_end_time(
    state: State<'_, AppState>,
    req: CourseSelectionEndTimeRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_end_time(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_course_selection_child_classes(
    state: State<'_, AppState>,
    req: CourseSelectionChildClassesRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_child_classes(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn select_course_selection_course(
    state: State<'_, AppState>,
    req: CourseSelectionSelectRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::select_course_selection_course(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn withdraw_course_selection_course(
    state: State<'_, AppState>,
    req: CourseSelectionWithdrawRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::withdraw_course_selection_course(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_course_selection_selected_courses(
    state: State<'_, AppState>,
    req: CourseSelectionSelectedCoursesRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_selected_courses(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_course_selection_detail_intro(
    state: State<'_, AppState>,
    req: CourseSelectionDetailRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_detail_intro(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn fetch_course_selection_detail_teacher(
    state: State<'_, AppState>,
    req: CourseSelectionDetailRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    match modules::course_selection::fetch_course_selection_detail_teacher(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn online_learning_overview(
    state: State<'_, AppState>,
    req: OnlineLearningOverviewRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::fetch_online_learning_overview(&client, req.student_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn online_learning_sync_now(
    state: State<'_, AppState>,
    req: OnlineLearningSyncRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    modules::online_learning::online_learning_sync_now(
        &mut client,
        req.student_id.as_deref(),
        req.platform.as_deref().unwrap_or(""),
        req.force.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn online_learning_list_sync_runs(
    state: State<'_, AppState>,
    req: OnlineLearningSyncRunsRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let student_id = resolve_online_learning_student_id(&client, req.student_id.as_deref())?;
    modules::online_learning::list_online_learning_sync_runs(
        &student_id,
        req.platform.as_deref(),
        req.limit.unwrap_or(20),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn online_learning_clear_cache(
    state: State<'_, AppState>,
    req: OnlineLearningClearCacheRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    let student_id = resolve_online_learning_student_id(&client, req.student_id.as_deref())?;
    modules::online_learning::clear_online_learning_cache(&student_id, req.platform.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_get_session_status(
    state: State<'_, AppState>,
    req: ChaoxingSessionStatusRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    modules::online_learning::chaoxing_get_session_status(&mut client, req.student_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_fetch_courses(
    state: State<'_, AppState>,
    req: ChaoxingCoursesRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    modules::online_learning::chaoxing_fetch_courses(
        &mut client,
        req.student_id.as_deref(),
        req.force.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_fetch_course_outline(
    state: State<'_, AppState>,
    req: ChaoxingCourseOutlineRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    modules::online_learning::chaoxing_fetch_course_outline(&mut client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_fetch_course_progress(
    state: State<'_, AppState>,
    req: ChaoxingCourseProgressRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    modules::online_learning::chaoxing_fetch_course_progress(&mut client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_get_launch_url(
    _state: State<'_, AppState>,
    req: ChaoxingLaunchUrlRequest,
) -> Result<serde_json::Value, String> {
    modules::online_learning::chaoxing_get_launch_url(&req).map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_create_qr_login(
    state: State<'_, AppState>,
    req: YuketangQrCreateRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_create_qr_login(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_poll_qr_login(
    state: State<'_, AppState>,
    req: YuketangPollQrLoginRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_poll_qr_login(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_fetch_courses(
    state: State<'_, AppState>,
    req: YuketangCoursesRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_fetch_courses(
        &client,
        req.student_id.as_deref(),
        req.force.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_fetch_course_outline(
    state: State<'_, AppState>,
    req: YuketangCourseOutlineRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_fetch_course_outline(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_fetch_course_progress(
    state: State<'_, AppState>,
    req: YuketangCourseProgressRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_fetch_course_progress(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

// ── 自动刷课 Tauri Commands ──

#[tauri::command]
async fn chaoxing_get_knowledge_cards(
    state: State<'_, AppState>,
    req: ChaoxingKnowledgeCardsRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::chaoxing_get_knowledge_cards(
        &client,
        &req.clazz_id,
        &req.course_id,
        &req.knowledge_id,
        &req.cpi,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_get_video_status(
    state: State<'_, AppState>,
    req: ChaoxingVideoStatusRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::chaoxing_get_video_status(&client, &req.object_id, &req.fid)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn chaoxing_report_progress(
    state: State<'_, AppState>,
    req: ChaoxingReportProgressRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::chaoxing_report_progress(
        &client,
        &req.report_url,
        &req.dtoken,
        &req.clazz_id,
        &req.object_id,
        &req.jobid,
        &req.userid,
        &req.other_info,
        req.playing_time,
        req.duration,
        req.isdrag.unwrap_or(3),
        req.video_face_capture_enc.as_deref().unwrap_or(""),
        req.att_duration.as_deref().unwrap_or("0"),
        req.att_duration_enc.as_deref().unwrap_or(""),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_get_course_chapters(
    state: State<'_, AppState>,
    req: YuketangCourseChaptersRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_get_course_chapters(&client, &req.classroom_id, &req.sign)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_get_leaf_info(
    state: State<'_, AppState>,
    req: YuketangLeafInfoRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_get_leaf_info(&client, &req.classroom_id, &req.leaf_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn yuketang_send_heartbeat(
    state: State<'_, AppState>,
    req: YuketangHeartbeatRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.lock().await;
    modules::online_learning::yuketang_send_heartbeat(&client, &req.classroom_id, &req.events)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn campus_code_fetch_config(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let result = client
        .query_campus_code_config(payload)
        .await
        .map_err(|e| e.to_string())?;
    persist_electricity_tokens(&client);
    Ok(result)
}

#[tauri::command]
async fn campus_code_fetch_qrcode(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let result = client
        .query_campus_code_qrcode(payload)
        .await
        .map_err(|e| e.to_string())?;
    persist_electricity_tokens(&client);
    Ok(result)
}

#[tauri::command]
async fn campus_code_fetch_order_status(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.lock().await;
    let result = client
        .query_campus_code_order_status(payload)
        .await
        .map_err(|e| e.to_string())?;
    persist_electricity_tokens(&client);
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--flag1", "--flag2"]),
    ));

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder
        .plugin(tauri_plugin_keep_screen_on::init());

    let builder = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .setup(|app| {
            if let Ok(app_data_path) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&app_data_path);
                std::env::set_var(
                    "HBUT_APP_DATA_DIR",
                    app_data_path.to_string_lossy().to_string(),
                );
            }
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

            // 统一改为前端跨平台通知监控（Capacitor/Tauri 共用），
            // 这里不再启动 Rust 侧后台循环，避免桌面端重复通知。
            // 启动时尝试加载最近一′话凭?
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
            crate::http_server::spawn_http_server(client, app.handle().clone());
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
            set_ocr_runtime_config,
            get_ocr_runtime_status,
            set_temp_upload_endpoint,
            fetch_remote_config,
            exit_app,
            download_deyihei_font,
            download_deyihei_font_payload,
            download_remote_font_payload,
            cache_remote_image,
            save_export_file,
            debug_bridge::get_debug_runtime_config,
            debug_bridge::set_debug_runtime_config,
            debug_bridge::set_debug_bridge_ready,
            debug_bridge::complete_debug_screenshot,
            debug_bridge::save_debug_capture_file,
            open_external_url,
            open_file_with_system,
            resource_share_direct_url_native,
            resource_share_fetch_file_payload_native,
            resource_share_list_dir_native,
            send_test_notification_native,
            get_notification_permission_native,
            request_notification_permission_native,
            login,
            portal_qr_init_login,
            portal_qr_check_status,
            portal_qr_confirm_login,
            chaoxing_qr_init_login,
            chaoxing_qr_refresh_login,
            chaoxing_qr_check_status,
            chaoxing_qr_confirm_login,
            chaoxing_password_login,
            logout,
            restore_session,
            restore_latest_session,
            set_offline_user_context,
            get_cookies,
            refresh_session,
            sync_grades,
            get_grades_local,
            sync_schedule,
            get_schedule_local,
            list_custom_schedule_courses,
            list_all_custom_schedule_courses,
            add_custom_schedule_course,
            delete_custom_schedule_course,
            update_custom_schedule_course,
            export_schedule_calendar,
            fetch_exams,
            fetch_ranking,
            fetch_student_info,
            fetch_personal_login_access_info,
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
            fetch_course_selection_overview,
            fetch_course_selection_list,
            fetch_course_selection_end_time,
            fetch_course_selection_child_classes,
            select_course_selection_course,
            withdraw_course_selection_course,
            fetch_course_selection_selected_courses,
            fetch_course_selection_detail_intro,
            fetch_course_selection_detail_teacher,
            online_learning_overview,
            online_learning_sync_now,
            online_learning_list_sync_runs,
            online_learning_clear_cache,
            chaoxing_get_session_status,
            chaoxing_fetch_courses,
            chaoxing_fetch_course_outline,
            chaoxing_fetch_course_progress,
            chaoxing_get_launch_url,
            yuketang_create_qr_login,
            yuketang_poll_qr_login,
            yuketang_fetch_courses,
            yuketang_fetch_course_outline,
            yuketang_fetch_course_progress,
            chaoxing_get_knowledge_cards,
            chaoxing_get_video_status,
            chaoxing_report_progress,
            yuketang_get_course_chapters,
            yuketang_get_leaf_info,
            yuketang_send_heartbeat,
            fetch_library_dict,
            search_library_books,
            fetch_library_book_detail,
            electricity_query_location,
            electricity_query_account,
            refresh_electricity_token,
            fetch_transaction_history,
            campus_code_fetch_config,
            campus_code_fetch_qrcode,
            campus_code_fetch_order_status,
            hbut_ai_init,
            hbut_ai_upload,
            hbut_ai_chat,
            hbut_one_code_token,
        ])

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
