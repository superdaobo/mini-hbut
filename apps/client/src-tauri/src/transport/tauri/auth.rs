//! 认证领域 Tauri commands：门户/学习通登录、扫码、会话恢复、OCR 验证码。
//!
//! 从 lib.rs 拆分，仅做参数/状态/错误映射；业务逻辑在 http_client 与 modules。

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use regex::Regex;
use reqwest::cookie::CookieStore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

use crate::app_state::AppState;
use crate::application;
use crate::credential_store;
use crate::db;
use crate::http_client::HbutClient;
use crate::modules;
use crate::transport::tauri::common::{
    spawn_chaoxing_sso_warmup, spawn_electricity_session_warmup,
};
use crate::DB_FILENAME;

const DEFAULT_PORTAL_SERVICE_URL: &str = "https://e.hbut.edu.cn/login#/";
const CHAOXING_LOGIN_PAGE_URL: &str =
    "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
const CHAOXING_BASE_URL: &str = "https://passport2.chaoxing.com";
const CHAOXING_AES_KEY: &str = "u2oh6Vu^HWe4_AES";

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

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

fn normalize_portal_service_url(service: Option<String>) -> String {
    let normalized = service.unwrap_or_default().trim().to_string();
    if normalized.is_empty() {
        DEFAULT_PORTAL_SERVICE_URL.to_string()
    } else {
        normalized
    }
}

fn upsert_form_value(
    form: &mut HashMap<String, String>,
    keys: &[&str],
    default_key: &str,
    value: &str,
) {
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
            let key = cap
                .get(1)
                .map(|m| m.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
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

async fn load_chaoxing_login_page(
    client: &mut HbutClient,
) -> Result<ChaoxingLoginPagePayload, String> {
    let mut debug = Vec::new();
    let response = client
        .client
        .get(CHAOXING_LOGIN_PAGE_URL)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
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

    let passport_url =
        reqwest::Url::parse(CHAOXING_BASE_URL).map_err(|e| format!("学习通域名解析失败: {}", e))?;
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

    // 无密码提示时使用空串（保留 DB 旧值），运行时默认值而非字面量。
    let password_to_save = password_hint.unwrap_or_default();
    let _ = db::save_user_session(
        DB_FILENAME,
        &student_id,
        &merged_cookie,
        password_to_save,
        "",
        None,
        None,
    );
    // 全域 cookie 落库（#350）
    client.persist_session_cookies(&student_id);

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

#[tauri::command]
pub(crate) async fn get_login_page(state: State<'_, AppState>) -> Result<LoginPageInfo, String> {
    let mut client = state.client.write().await;
    client.get_login_page().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn get_captcha(state: State<'_, AppState>) -> Result<String, String> {
    let client = state.client.write().await;
    client.get_captcha().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn portal_qr_init_login(
    state: State<'_, AppState>,
    service: Option<String>,
) -> Result<PortalQrInitResponse, String> {
    let service_url = normalize_portal_service_url(service);
    let mut client = state.client.write().await;

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
pub(crate) async fn portal_qr_check_status(
    state: State<'_, AppState>,
    uuid: String,
) -> Result<PortalQrStatusResponse, String> {
    let qr_uuid = uuid.trim().to_string();
    if qr_uuid.is_empty() {
        return Err("二维码 uuid 不能为空".to_string());
    }

    let client = state.client.write().await;
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
pub(crate) async fn portal_qr_confirm_login(
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

    let mut client = state.client.write().await;
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
    upsert_form_value(
        &mut form_data,
        &["execution"],
        "execution",
        &execution_value,
    );
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

    let user_info =
        match fetch_portal_user_info_with_retry(&mut client, if confirmed_hint { 4 } else { 2 })
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
                let pending_like =
                    status_code == "0" || status_code == "2" || status_code.is_empty();
                if pending_like && !confirmed_hint {
                    return Err("扫码确认未完成，请在手机端确认后重试".to_string());
                }
                if !confirmed_hint
                    && (final_url.contains("authserver/login") || html.contains("qrLoginForm"))
                {
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
    client.persist_session_cookies(&user_info.student_id);

    let client_arc = Arc::clone(&state.client);
    spawn_electricity_session_warmup(
        client_arc.clone(),
        user_info.student_id.clone(),
        String::new(),
    );
    spawn_chaoxing_sso_warmup(client_arc, user_info.student_id.clone());

    Ok(user_info)
}

#[tauri::command]
pub(crate) async fn chaoxing_qr_init_login(
    state: State<'_, AppState>,
) -> Result<ChaoxingQrInitResponse, String> {
    let mut client = state.client.write().await;
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
pub(crate) async fn chaoxing_qr_refresh_login(
    state: State<'_, AppState>,
) -> Result<ChaoxingQrInitResponse, String> {
    let mut client = state.client.write().await;
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
pub(crate) async fn chaoxing_qr_check_status(
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
    let client = state.client.write().await;
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
pub(crate) async fn chaoxing_qr_confirm_login(
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

    let mut client = state.client.write().await;
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
pub(crate) async fn chaoxing_password_login(
    state: State<'_, AppState>,
    account: String,
    password: String,
) -> Result<ChaoxingLoginResult, String> {
    let raw_account = account.trim().to_string();
    let raw_password = password.trim().to_string();
    if raw_account.is_empty() || raw_password.is_empty() {
        return Err("学习通账号和密码不能为空".to_string());
    }

    let mut client = state.client.write().await;
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
        (
            "forbidotherlogin".to_string(),
            page.context.forbidotherlogin.clone(),
        ),
        ("validate".to_string(), page.context.validate.clone()),
        (
            "doubleFactorLogin".to_string(),
            page.context.double_factor_login.clone(),
        ),
        (
            "independentId".to_string(),
            page.context.independent_id.clone(),
        ),
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
pub(crate) async fn recognize_captcha(
    state: State<'_, AppState>,
    image_base64: String,
) -> Result<String, String> {
    let mut hbut = state.client.write().await;
    hbut.recognize_captcha_base64(&image_base64)
        .await
        .map_err(|e| format!("OCR recognize failed: {}", e))
}

#[tauri::command]
pub(crate) async fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
    captcha: Option<String>,
    lt: Option<String>,
    execution: Option<String>,
) -> Result<UserInfo, String> {
    println!("[调试] Command login called with: username={}, password len={}, captcha={:?}, lt={:?}, execution={:?}",
             username, password.len(), captcha, lt, execution);
    let service = application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ));
    let user_info = service
        .login(&username, &password, captcha, lt, execution)
        .await
        .map_err(|e| e.to_string())?;
    let session_key = if user_info.student_id.trim().is_empty() {
        username.clone()
    } else {
        user_info.student_id.clone()
    };

    let client_arc = Arc::clone(&state.client);
    spawn_electricity_session_warmup(client_arc.clone(), session_key.clone(), password);
    // #324：登录成功后预热学习通 SSO（不阻塞登录返回）
    spawn_chaoxing_sso_warmup(client_arc, session_key);

    Ok(user_info)
}

#[tauri::command]
pub(crate) async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    // 仅清理内存会话；保留密钥环中的「记住密码」与会话密码，供下次自动登录/表单回填。
    application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .logout()
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn restore_session(
    state: State<'_, AppState>,
    cookies: String,
) -> Result<UserInfo, String> {
    application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .restore_session(&cookies)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn restore_latest_session(state: State<'_, AppState>) -> Result<UserInfo, String> {
    let session = db::get_latest_user_session(DB_FILENAME)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "无可疑历史会话".to_string())?;

    if session.cookies.trim().is_empty() {
        return Err("历史会话缺少 cookies".to_string());
    }

    let mut client = state.client.write().await;
    let user_info = client
        .restore_session(&session.cookies)
        .await
        .map_err(|e| e.to_string())?;

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

/// 解析本地可恢复的门户凭据（DB 会话密码 + 密钥环双键），供自动重登判定。
/// 说明：login 命令无条件把密码写入 SQLite user_sessions（与前端「记住密码」勾选无关），
/// 因此前端 localStorage 标志为 false 时后端仍可能具备恢复能力，需以本函数为准。
fn resolve_stored_portal_password(student_id: &str) -> Option<String> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return None;
    }
    // 1) DB 会话密码（login 时无条件保存，密钥环可用时存 __keyring__ 标记）
    if let Ok(Some(session)) = db::get_user_session(DB_FILENAME, sid) {
        if !session.password.is_empty() {
            return Some(session.password);
        }
    }
    // 2) 密钥环：学号键（旧键）/ hbut: 学号键（记住密码键）
    if let Some(p) = credential_store::load_session_password(sid) {
        if !p.is_empty() {
            return Some(p);
        }
    }
    if let Some(p) = credential_store::load_remembered_credential(&format!("hbut:{}", sid)) {
        if !p.is_empty() {
            return Some(p);
        }
    }
    None
}

/// 查询本地是否存在可恢复的门户凭据（DB 密码 / 密钥环），供前端消除「未保存密码」误报。
#[tauri::command]
pub(crate) async fn has_restorable_credentials(
    _state: State<'_, AppState>,
    student_id: String,
) -> Result<bool, String> {
    Ok(resolve_stored_portal_password(&student_id).is_some())
}

/// 使用本地存储的门户凭据自动重登（DB 密码走完整 CAS 登录），恢复教务会话。
/// 与手动 login 命令一致：成功后写会话 DB、密钥环双写、持久化 cookies。
#[tauri::command]
pub(crate) async fn auto_relogin_from_stored(
    state: State<'_, AppState>,
    student_id: String,
) -> Result<UserInfo, String> {
    let sid = student_id.trim().to_string();
    if sid.is_empty() {
        return Err("学号为空，无法自动重登".to_string());
    }
    let password = resolve_stored_portal_password(&sid)
        .ok_or_else(|| "本地未找到可用的门户密码，无法自动重登".to_string())?;

    let mut client = state.client.write().await;
    client.set_credentials(sid.clone(), password.clone());
    let user_info = client
        .login(&sid, &password, "", "", "")
        .await
        .map_err(|e| e.to_string())?;
    client.set_chaoxing_login_mode(false);

    let session_key = if user_info.student_id.trim().is_empty() {
        sid.clone()
    } else {
        user_info.student_id.clone()
    };
    client.persist_session_cookies(&session_key);
    let _ = db::save_user_session(
        DB_FILENAME,
        &session_key,
        &client.get_cookies(),
        &password,
        "",
        Some(""),
        Some(""),
    );
    let _ = credential_store::save_password(&session_key, &password);
    let _ =
        credential_store::save_remembered_credential(&format!("hbut:{}", session_key), &password);
    Ok(user_info)
}

#[tauri::command]
pub(crate) async fn set_offline_user_context(
    state: State<'_, AppState>,
    student_id: String,
) -> Result<(), String> {
    let sid = student_id.trim().to_string();
    if sid.is_empty() {
        return Ok(());
    }
    let mut client = state.client.write().await;
    client.set_offline_user_context(&sid);
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_cookies(state: State<'_, AppState>) -> Result<String, String> {
    let client = state.client.read().await;
    Ok(client.get_cookies())
}

#[tauri::command]
pub(crate) async fn refresh_session(state: State<'_, AppState>) -> Result<UserInfo, String> {
    let info = application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .refresh_session()
    .await
    .map_err(|e| e.to_string())?;
    // #351：keep-alive（约 20min）顺带后台轻量学习通补票；不阻塞本次返回
    let client_arc = state.client.clone();
    let sid = info.student_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut client = client_arc.write().await;
        match modules::chaoxing_sso::ensure_chaoxing_sso(
            &mut client,
            Some(&sid),
            modules::chaoxing_sso::EnsureSsoOptions {
                force: false,
                allow_silent_relogin: true,
                preheated: false,
                portal_password: None,
            },
        )
        .await
        {
            Ok(v) => println!("[session] keep-alive 学习通补票: {}", v),
            Err(e) => println!("[session] keep-alive 学习通补票失败（不阻断）: {}", e),
        }
    });
    Ok(info)
}
