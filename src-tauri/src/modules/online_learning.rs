use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::io;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose;
use chrono::{Local, Utc};
use futures::{SinkExt, StreamExt};
use reqwest::cookie::Jar;
use reqwest::cookie::CookieStore;
use reqwest::Url;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, protocol::Message},
};
use qrcode::QrCode;
use base64::Engine;

use crate::db::{
    self, OnlineLearningPlatformStateRecord, OnlineLearningSyncRunRecord,
};
use crate::http_client::HbutClient;

type DynError = Box<dyn Error + Send + Sync>;
type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

const PLATFORM_CHAOXING: &str = "chaoxing";
const PLATFORM_YUKETANG: &str = "yuketang";
const CACHE_OVERVIEW: &str = "online_learning_overview_cache";
const CACHE_CHAOXING_COURSES: &str = "online_learning_chaoxing_courses_cache";
const CACHE_CHAOXING_OUTLINE: &str = "online_learning_chaoxing_outline_cache";
const CACHE_CHAOXING_PROGRESS: &str = "online_learning_chaoxing_progress_cache";
const CACHE_YUKETANG_COURSES: &str = "online_learning_yuketang_courses_cache";
const CACHE_YUKETANG_OUTLINE: &str = "online_learning_yuketang_outline_cache";
const CACHE_YUKETANG_PROGRESS: &str = "online_learning_yuketang_progress_cache";
const CHAOXING_LOGIN_PAGE_URL: &str =
    "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
const CHAOXING_BASE_URL: &str = "https://passport2.chaoxing.com";
const CHAOXING_AES_KEY: &str = "u2oh6Vu^HWe4_AES";
const YUKETANG_WEB_URL: &str = "https://changjiang.yuketang.cn/web";
const YUKETANG_AUTHORIZE_URL: &str = "https://changjiang.yuketang.cn/authorize/wx-qrlogin";

/// 将登录 URL 转换为 base64 编码的 SVG 二维码 data URI
fn generate_qr_data_uri(url: &str) -> Result<String, DynError> {
    let code = QrCode::new(url.as_bytes())
        .map_err(|e| err_box(format!("生成二维码失败: {}", e)))?;
    let svg = code.render::<qrcode::render::svg::Color>()
        .min_dimensions(280, 280)
        .quiet_zone(true)
        .build();
    let b64 = base64::engine::general_purpose::STANDARD.encode(svg.as_bytes());
    Ok(format!("data:image/svg+xml;base64,{}", b64))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingYuketangLogin {
    session_id: String,
    student_id: String,
    status: String,
    message: String,
    login_url: String,
    authorize_url: String,
    qr_code_url: String,
    ticket_url: String,
    account_id: String,
    created_at: String,
    expires_at: String,
}

fn yuketang_pending_store() -> &'static StdMutex<HashMap<String, PendingYuketangLogin>> {
    static STORE: OnceLock<StdMutex<HashMap<String, PendingYuketangLogin>>> = OnceLock::new();
    STORE.get_or_init(|| StdMutex::new(HashMap::new()))
}

fn err_box(message: impl Into<String>) -> DynError {
    Box::new(io::Error::other(message.into()))
}

fn now_sync_time() -> String {
    Local::now().to_rfc3339()
}

fn now_date_time() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn cache_key(student_id: &str, suffix: &str) -> String {
    format!("{}:{}", student_id.trim(), suffix.trim())
}

fn sanitize_text(input: &str) -> String {
    let mut text = html_escape::decode_html_entities(input).to_string();
    text = text
        .replace('\u{a0}', " ")
        .replace('\n', " ")
        .replace('\r', " ")
        .replace('\t', " ");
    while text.contains("  ") {
        text = text.replace("  ", " ");
    }
    text.trim().to_string()
}

fn parse_cookie_value(cookie_header: &str, key: &str) -> Option<String> {
    let marker = format!("{}=", key);
    cookie_header
        .split(';')
        .map(|segment| segment.trim())
        .find_map(|segment| segment.strip_prefix(&marker))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn cookie_header_for_url(client: &HbutClient, url: &str) -> String {
    let parsed = match Url::parse(url) {
        Ok(url) => url,
        Err(_) => return String::new(),
    };
    client
        .cookie_jar
        .cookies(&parsed)
        .and_then(|value| value.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default()
}

fn cookie_header_for_jar(jar: &Arc<Jar>, url: &str) -> String {
    let parsed = match Url::parse(url) {
        Ok(url) => url,
        Err(_) => return String::new(),
    };
    jar.cookies(&parsed)
        .and_then(|value| value.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default()
}

/// 将学习通关键 cookies（_uid, UID, fid 等）从所有相关域传播到 mooc1 域
fn propagate_chaoxing_key_cookies(client: &HbutClient) {
    let source_urls = [
        "https://passport2.chaoxing.com",
        "https://i.chaoxing.com",
        "https://mooc1-api.chaoxing.com",
        "https://hbut.jw.chaoxing.com",
    ];
    let target_url = match Url::parse("https://mooc1.chaoxing.com") {
        Ok(u) => u,
        Err(_) => return,
    };
    let key_names: &[&str] = &[
        "UID", "_uid", "fid", "cx_p_token", "p_auth_token", "xxtenc",
        "_d", "uf", "spaceFid", "spaceRoleId", "uname",
    ];

    let mut collected: HashMap<String, String> = HashMap::new();
    for src in &source_urls {
        if let Ok(url) = Url::parse(src) {
            if let Some(header) = client.cookie_jar.cookies(&url) {
                if let Ok(s) = header.to_str() {
                    for pair in s.split(';') {
                        let pair = pair.trim();
                        if let Some((name, value)) = pair.split_once('=') {
                            let name = name.trim();
                            if key_names.iter().any(|k| k.eq_ignore_ascii_case(name)) {
                                collected.entry(name.to_string()).or_insert_with(|| value.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    if collected.is_empty() {
        return;
    }

    for (name, value) in &collected {
        let cookie_str = format!("{}={}; Path=/", name, value);
        client.cookie_jar.add_cookie_str(&cookie_str, &target_url);
    }
}

fn chaoxing_cookie_blob(client: &HbutClient) -> String {
    let passport_cookie = cookie_header_for_url(client, "https://passport2.chaoxing.com");
    let i_cookie = cookie_header_for_url(client, "https://i.chaoxing.com");
    let jw_cookie = cookie_header_for_url(client, "https://hbut.jw.chaoxing.com");
    [passport_cookie, i_cookie, jw_cookie]
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" | ")
}

fn has_chaoxing_bridge_cookie(client: &HbutClient) -> bool {
    let jw_cookie = cookie_header_for_url(client, "https://hbut.jw.chaoxing.com");
    jw_cookie.contains("jw_uf=") && jw_cookie.contains("username=")
}

fn has_chaoxing_full_session(client: &HbutClient) -> bool {
    let passport_cookie = cookie_header_for_url(client, "https://passport2.chaoxing.com");
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

fn has_chaoxing_session(client: &HbutClient) -> bool {
    has_chaoxing_full_session(client)
}

/// 公开接口：检测是否已有超星会话（供 lib.rs 调用）
pub fn check_chaoxing_session(client: &HbutClient) -> bool {
    has_chaoxing_session(client)
}

fn yuketang_cookie_blob(client: &HbutClient) -> String {
    yuketang_cookie_blob_from_jar(&client.cookie_jar)
}

fn yuketang_cookie_blob_from_jar(jar: &Arc<Jar>) -> String {
    let root_cookie = cookie_header_for_jar(jar, "https://changjiang.yuketang.cn");
    let web_cookie = cookie_header_for_jar(jar, "https://changjiang.yuketang.cn/web");
    [root_cookie, web_cookie]
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

fn has_yuketang_session(client: &HbutClient) -> bool {
    let blob = yuketang_cookie_blob(client);
    parse_cookie_value(&blob, "sessionid").is_some()
        || parse_cookie_value(&blob, "csrftoken").is_some()
        || parse_cookie_value(&blob, "university_id").is_some()
}

fn restore_yuketang_cookie_blob(client: &HbutClient, cookie_blob: &str) {
    if cookie_blob.trim().is_empty() {
        return;
    }
    let Ok(url) = Url::parse("https://changjiang.yuketang.cn") else {
        return;
    };
    for segment in cookie_blob.split(';') {
        let item = segment.trim();
        if item.is_empty() || !item.contains('=') {
            continue;
        }
        let Some((name_raw, value_raw)) = item.split_once('=') else {
            continue;
        };
        let name = name_raw.trim();
        let value = value_raw.trim();
        if name.is_empty() || value.is_empty() {
            continue;
        }
        let cookie_line = format!("{}={}; Domain=.yuketang.cn; Path=/", name, value);
        client.cookie_jar.add_cookie_str(&cookie_line, &url);
    }
}

/// 从 DB 持久化的 cookie_blob 恢复超星 Cookie 到 cookie jar
/// blob 格式: "passport cookies | i.chaoxing cookies | jw.chaoxing cookies"
fn restore_chaoxing_cookie_blob(client: &HbutClient, cookie_blob: &str) {
    if cookie_blob.trim().is_empty() {
        return;
    }
    let domains = [
        "https://passport2.chaoxing.com",
        "https://i.chaoxing.com",
        "https://hbut.jw.chaoxing.com",
    ];
    let segments: Vec<&str> = cookie_blob.split(" | ").collect();
    for (idx, segment) in segments.iter().enumerate() {
        let domain_url = domains.get(idx).unwrap_or(&domains[0]);
        let Ok(url) = Url::parse(domain_url) else { continue };
        for pair in segment.split(';') {
            let item = pair.trim();
            if item.is_empty() || !item.contains('=') {
                continue;
            }
            let Some((name_raw, value_raw)) = item.split_once('=') else { continue };
            let name = name_raw.trim();
            let value = value_raw.trim();
            if name.is_empty() || value.is_empty() {
                continue;
            }
            // 使用 .chaoxing.com 域以确保所有子域（mooc1、passport2 等）均可共享
            let cookie_line = format!("{}={}; Domain=.chaoxing.com; Path=/", name, value);
            client.cookie_jar.add_cookie_str(&cookie_line, &url);
        }
    }
}

/// 尝试从 DB 恢复超星 cookie（如果内存中无会话）
fn try_restore_chaoxing_session(client: &HbutClient, student_id: &str) {
    if has_chaoxing_session(client) {
        return;
    }
    if let Ok(Some(state)) = db::get_online_learning_platform_state(crate::DB_FILENAME, student_id, PLATFORM_CHAOXING) {
        if state.connected && !state.cookie_blob.trim().is_empty() {
            restore_chaoxing_cookie_blob(client, &state.cookie_blob);
        }
    }
}

fn seed_chaoxing_cookie_from_jwxt(client: &mut HbutClient) -> bool {
    let jwxt_cookie = cookie_header_for_url(client, "https://jwxt.hbut.edu.cn");
    if !(jwxt_cookie.contains("jw_uf=") && jwxt_cookie.contains("username=")) {
        return false;
    }
    let Ok(chaoxing_url) = Url::parse("https://hbut.jw.chaoxing.com") else {
        return false;
    };
    for pair in jwxt_cookie.split(';') {
        let item = pair.trim();
        if item.is_empty() || !item.contains('=') {
            continue;
        }
        let Some((name_raw, value_raw)) = item.split_once('=') else {
            continue;
        };
        let name = name_raw.trim();
        let value = value_raw.trim();
        if name.is_empty() || value.is_empty() {
            continue;
        }
        let cookie_line = format!("{}={}; Domain=.chaoxing.com; Path=/", name, value);
        client.cookie_jar.add_cookie_str(&cookie_line, &chaoxing_url);
    }
    client.set_chaoxing_login_mode(true);
    true
}

fn resolve_student_password(client: &HbutClient, student_id: &str) -> Option<String> {
    if let Some(password) = client
        .last_password
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return Some(password);
    }
    db::get_user_session(crate::DB_FILENAME, student_id)
        .ok()
        .flatten()
        .and_then(|session| {
            let pwd = session.password.trim().to_string();
            if pwd.is_empty() {
                None
            } else {
                Some(pwd)
            }
        })
        .or_else(|| {
            db::get_latest_user_session(crate::DB_FILENAME)
                .ok()
                .flatten()
                .and_then(|session| {
                    let pwd = session.password.trim().to_string();
                    if pwd.is_empty() {
                        None
                    } else {
                        Some(pwd)
                    }
                })
        })
}

async fn ensure_portal_cas_session_ready(
    client: &mut HbutClient,
    student_id: &str,
) -> bool {
    let code_service = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
    let code_sso_url = format!(
        "{}/login?service={}",
        crate::http_client::AUTH_BASE_URL,
        urlencoding::encode(code_service)
    );
    println!("[调试] 学习通会话重建：检查融合门户 CAS 会话 {}", code_sso_url);

    match client.client.get(&code_sso_url).send().await {
        Ok(resp) => {
            let final_url = resp.url().to_string();
            println!(
                "[调试] 学习通会话重建：融合门户 CAS 检查跳转 {}",
                final_url
            );
            if !final_url.contains("authserver/login") {
                client.is_logged_in = true;
                return true;
            }
        }
        Err(e) => {
            println!("[调试] 学习通会话重建：融合门户 CAS 检查失败: {}", e);
        }
    }

    let Some(password) = resolve_student_password(client, student_id) else {
        println!("[调试] 学习通会话重建：融合门户 CAS 已失效且缺少密码，无法重登");
        return false;
    };
    println!("[调试] 学习通会话重建：尝试使用 code 服务重登 CAS");
    match client
        .login_for_service(student_id, &password, code_service)
        .await
    {
        Ok(_) => {
            client.is_logged_in = true;
            true
        }
        Err(e) => {
            println!("[调试] 学习通会话重建：code 服务重登失败: {}", e);
            false
        }
    }
}

fn parse_hidden_input_map(html: &str) -> HashMap<String, String> {
    let document = Html::parse_document(html);
    let input_selector = selector("input");
    let mut map = HashMap::new();
    for input in document.select(&input_selector) {
        let name = input.value().attr("name").unwrap_or("").trim();
        let id = input.value().attr("id").unwrap_or("").trim();
        let value = input.value().attr("value").unwrap_or("").trim().to_string();
        if !name.is_empty() {
            map.insert(name.to_string(), value.clone());
        }
        if !id.is_empty() {
            map.insert(id.to_string(), value.clone());
        }
    }
    map
}

fn pick_hidden_value(map: &HashMap<String, String>, keys: &[&str], default_value: &str) -> String {
    keys.iter()
        .find_map(|k| map.get(*k))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default_value.to_string())
}

fn json_truthy(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(v)) => *v,
        Some(Value::String(v)) => v.eq_ignore_ascii_case("true") || v == "1",
        Some(Value::Number(v)) => v.as_i64().unwrap_or_default() != 0,
        _ => false,
    }
}

fn chaoxing_encrypt_value(raw: &str) -> Result<String, DynError> {
    if CHAOXING_AES_KEY.len() != 16 {
        return Err(err_box("学习通 AES 密钥长度异常"));
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
        .map_err(|e| err_box(format!("学习通 AES 加密失败: {:?}", e)))?;
    Ok(general_purpose::STANDARD.encode(encrypted))
}

async fn check_chaoxing_course_api_ready(client: &HbutClient) -> bool {
    let url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
    let resp = match client
        .client
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/base")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            println!("[调试] 学习通会话校验失败：课程接口请求异常: {}", e);
            return false;
        }
    };
    let final_url = resp.url().to_string();
    if final_url.contains("/login") {
        println!("[调试] 学习通会话校验失败：课程接口重定向到登录页");
        return false;
    }
    let text = match resp.text().await {
        Ok(text) => text,
        Err(e) => {
            println!("[调试] 学习通会话校验失败：课程接口读取异常: {}", e);
            return false;
        }
    };
    let payload: Value = match serde_json::from_str(&text) {
        Ok(payload) => payload,
        Err(_) => {
            println!("[调试] 学习通会话校验失败：课程接口返回非 JSON");
            return false;
        }
    };
    // backclazzdata 接口成功时返回 {"result": 1, "msg": "获取成功", "channelList": [...]}
    if json_truthy(payload.get("result")) || json_truthy(payload.get("status")) {
        return true;
    }
    let error_msg = payload
        .get("errorMsg")
        .and_then(|v| v.as_str())
        .or_else(|| payload.get("msg").and_then(|v| v.as_str()))
        .unwrap_or("")
        .trim()
        .to_string();
    if !error_msg.is_empty() {
        println!("[调试] 学习通会话校验失败：{}", error_msg);
    }
    false
}

async fn try_chaoxing_password_login(
    client: &mut HbutClient,
    account: &str,
    password: &str,
) -> Result<(), DynError> {
    let response = client
        .client
        .get(CHAOXING_LOGIN_PAGE_URL)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| err_box(format!("学习通登录页请求失败: {}", e)))?;
    if !response.status().is_success() {
        return Err(err_box(format!(
            "学习通登录页返回异常状态: {}",
            response.status()
        )));
    }
    let login_page_url = response.url().to_string();
    let html = response
        .text()
        .await
        .map_err(|e| err_box(format!("学习通登录页读取失败: {}", e)))?;
    let hidden = parse_hidden_input_map(&html);
    let need_vcode = pick_hidden_value(&hidden, &["needVcode"], "");
    if need_vcode == "1" {
        return Err(err_box("学习通当前要求验证码，无法自动补全会话"));
    }
    let should_encrypt = pick_hidden_value(&hidden, &["t"], "true").eq_ignore_ascii_case("true");
    let encoded_account = if should_encrypt {
        chaoxing_encrypt_value(account)?
    } else {
        account.to_string()
    };
    let encoded_password = if should_encrypt {
        chaoxing_encrypt_value(password)?
    } else {
        password.to_string()
    };
    let form = vec![
        ("fid".to_string(), pick_hidden_value(&hidden, &["fid"], "-1")),
        ("uname".to_string(), encoded_account),
        ("password".to_string(), encoded_password),
        (
            "refer".to_string(),
            pick_hidden_value(&hidden, &["refer"], "https%3A%2F%2Fi.chaoxing.com"),
        ),
        ("t".to_string(), pick_hidden_value(&hidden, &["t"], "true")),
        (
            "forbidotherlogin".to_string(),
            pick_hidden_value(&hidden, &["forbidotherlogin"], "0"),
        ),
        ("validate".to_string(), pick_hidden_value(&hidden, &["validate"], "")),
        (
            "doubleFactorLogin".to_string(),
            pick_hidden_value(&hidden, &["doubleFactorLogin"], "0"),
        ),
        (
            "independentId".to_string(),
            pick_hidden_value(&hidden, &["independentId"], "0"),
        ),
        (
            "independentNameId".to_string(),
            pick_hidden_value(&hidden, &["independentNameId"], "0"),
        ),
    ];

    let login_resp = client
        .client
        .post(&format!("{}/fanyalogin", CHAOXING_BASE_URL))
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Origin", CHAOXING_BASE_URL)
        .header("Referer", login_page_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| err_box(format!("学习通账号密码登录请求失败: {}", e)))?;
    if !login_resp.status().is_success() {
        return Err(err_box(format!(
            "学习通账号密码登录状态异常: {}",
            login_resp.status()
        )));
    }
    let body = login_resp
        .text()
        .await
        .map_err(|e| err_box(format!("学习通账号密码登录响应读取失败: {}", e)))?;
    let payload: Value = serde_json::from_str(&body)
        .map_err(|e| err_box(format!("学习通账号密码登录响应解析失败: {}", e)))?;
    if !json_truthy(payload.get("status")) {
        let msg = payload
            .get("msg2")
            .and_then(|v| v.as_str())
            .or_else(|| payload.get("mes").and_then(|v| v.as_str()))
            .or_else(|| payload.get("msg").and_then(|v| v.as_str()))
            .unwrap_or("学习通账号密码登录失败")
            .trim()
            .to_string();
        return Err(err_box(msg));
    }
    if json_truthy(payload.get("containTwoFactorLogin")) {
        return Err(err_box("学习通账号开启了双因子登录，无法自动补全会话"));
    }

    let redirect_url = payload
        .get("url")
        .and_then(|v| v.as_str())
        .map(|raw| {
            urlencoding::decode(raw)
                .map(|v| v.into_owned())
                .unwrap_or_else(|_| raw.to_string())
        })
        .unwrap_or_default();
    if !redirect_url.trim().is_empty() {
        let _ = client
            .client
            .get(&redirect_url)
            .header("Referer", "https://i.chaoxing.com/")
            .send()
            .await;
    }
    client.set_chaoxing_login_mode(true);
    let _ = client.ensure_chaoxing_academic_session().await;
    if !check_chaoxing_course_api_ready(client).await {
        return Err(err_box("学习通课程接口仍不可用"));
    }
    Ok(())
}

async fn ensure_chaoxing_session_ready(client: &mut HbutClient, student_id: &str) -> bool {
    try_restore_chaoxing_session(client, student_id);
    if !has_chaoxing_full_session(client) {
        let _ = seed_chaoxing_cookie_from_jwxt(client);
    }
    if check_chaoxing_course_api_ready(client).await {
        return true;
    }
    if has_chaoxing_full_session(client) {
        let _ = client.ensure_chaoxing_academic_session().await;
        if check_chaoxing_course_api_ready(client).await {
            return true;
        }
    } else if has_chaoxing_bridge_cookie(client) {
        // 仅有教务域 Cookie 时，先执行一次补票，再继续走 CAS 重建。
        let _ = client.ensure_chaoxing_academic_session().await;
        if check_chaoxing_course_api_ready(client).await {
            return true;
        }
    }

    if client.is_logged_in && client.try_bridge_cas_to_chaoxing().await {
        // 桥接后先直接检查 API —— FYSSO 链已设置 .chaoxing.com 域 UID cookie，
        // 可能不需要 ensure_chaoxing_academic_session（该函数会访问 i.chaoxing.com/base，
        // 在 FYSSO 桥接模式下 i.chaoxing.com 不识别会话会重定向到 passport2 登录页，
        // 可能反而清除好的 cookie）
        if check_chaoxing_course_api_ready(client).await {
            return true;
        }
        let _ = client.ensure_chaoxing_academic_session().await;
        if check_chaoxing_course_api_ready(client).await {
            return true;
        }
    }

    if ensure_portal_cas_session_ready(client, student_id).await {
        println!("[调试] 学习通会话重建：融合门户 CAS 会话可用，重试 CAS→学习通桥接");
        if client.try_bridge_cas_to_chaoxing().await {
            let _ = client.ensure_chaoxing_academic_session().await;
            if check_chaoxing_course_api_ready(client).await {
                return true;
            }
        }
    }

    let password = resolve_student_password(client, student_id).unwrap_or_default();

    println!("[调试] 学习通会话重建：尝试学习通账号密码补全票据");
    if password.trim().is_empty() {
        println!("[调试] 学习通会话重建：缺少本地密码，无法执行学习通账号密码补全");
        return check_chaoxing_course_api_ready(client).await;
    }
    match try_chaoxing_password_login(client, student_id, &password).await {
        Ok(_) => {
            println!("[调试] 学习通会话重建：学习通账号密码补全成功");
            true
        }
        Err(e) => {
            println!("[调试] 学习通会话重建：学习通账号密码补全失败: {}", e);
            check_chaoxing_course_api_ready(client).await
        }
    }
}

fn update_pending_yuketang_login(
    session_id: &str,
    updater: impl FnOnce(&mut PendingYuketangLogin),
) -> Result<PendingYuketangLogin, DynError> {
    let mut store = yuketang_pending_store()
        .lock()
        .map_err(|_| err_box("雨课堂登录状态锁获取失败"))?;
    let record = store
        .get_mut(session_id)
        .ok_or_else(|| err_box("雨课堂登录会话不存在"))?;
    updater(record);
    Ok(record.clone())
}

fn read_cache(table: &str, key: &str) -> Option<(Value, String)> {
    db::get_cache(crate::DB_FILENAME, table, key).ok().flatten()
}

fn save_cache(table: &str, key: &str, data: &Value) {
    let _ = db::save_cache(crate::DB_FILENAME, table, key, data);
}

fn clear_cache(table: &str, key: &str) {
    let _ = db::delete_cache(crate::DB_FILENAME, table, key);
}

fn clear_cache_prefix(table: &str, prefix: &str) {
    let _ = db::delete_cache_by_prefix(crate::DB_FILENAME, table, prefix);
}

fn record_sync_run(student_id: &str, platform: &str, status: &str, summary: &str, detail: Value) {
    let now = now_date_time();
    let record = OnlineLearningSyncRunRecord {
        id: format!("ol-{}-{}", platform, Utc::now().timestamp_millis()),
        student_id: student_id.to_string(),
        platform: platform.to_string(),
        status: status.to_string(),
        summary: summary.to_string(),
        detail_json: serde_json::to_string(&detail).unwrap_or_else(|_| "{}".to_string()),
        started_at: now.clone(),
        finished_at: now,
    };
    let _ = db::add_online_learning_sync_run(crate::DB_FILENAME, &record);
}

fn save_platform_state(
    student_id: &str,
    platform: &str,
    connected: bool,
    account_id: String,
    display_name: String,
    cookie_blob: String,
    meta: Value,
) {
    let record = OnlineLearningPlatformStateRecord {
        student_id: student_id.to_string(),
        platform: platform.to_string(),
        connected,
        account_id,
        display_name,
        cookie_blob,
        meta_json: serde_json::to_string(&meta).unwrap_or_else(|_| "{}".to_string()),
        sync_time: now_sync_time(),
        updated_at: now_date_time(),
    };
    let _ = db::save_online_learning_platform_state(crate::DB_FILENAME, &record);
}

fn resolve_student_id(client: &HbutClient, student_id: Option<&str>) -> Result<String, DynError> {
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
        .ok_or_else(|| err_box("缺少 student_id，且当前未登录"))
}

fn selector(input: &str) -> Selector {
    Selector::parse(input).expect("selector parse failed")
}

fn parse_href_param(href: &str, key: &str) -> String {
    let base = if href.starts_with("http") {
        href.to_string()
    } else {
        format!("https://mooc1-api.chaoxing.com{}", href)
    };
    Url::parse(&base)
        .ok()
        .and_then(|url| {
            url.query_pairs()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.to_string())
        })
        .unwrap_or_default()
}

async fn read_json_response(resp: reqwest::Response, fallback: &str) -> Result<Value, DynError> {
    let status = resp.status();
    let final_url = resp.url().to_string();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(err_box(format!("{}: {} {}", fallback, status, final_url)));
    }
    serde_json::from_str(&text).map_err(|_| err_box(format!("{}: 返回不是 JSON", fallback)))
}

fn summarize_course_count(payload: &Value) -> usize {
    payload
        .get("courses")
        .and_then(|v| v.as_array())
        .map(|v| v.len())
        .or_else(|| payload.get("data").and_then(|v| v.as_array()).map(|v| v.len()))
        .unwrap_or(0)
}

fn summarize_pending_count(payload: &Value) -> usize {
    payload
        .get("pending_count")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(0)
}

fn chaoxing_course_progress_ready(payload: &Value) -> bool {
    payload
        .get("courses")
        .and_then(|v| v.as_array())
        .map(|courses| {
            courses.is_empty()
                || courses.iter().all(|course| {
                    course
                        .get("progress_text")
                        .and_then(|v| v.as_str())
                        .map(|text| !text.trim().is_empty())
                        .unwrap_or(false)
                })
        })
        .unwrap_or(false)
}

fn write_chaoxing_course_progress_fields(course: &mut Value, progress: &Value) -> usize {
    let progress_text = progress
        .get("progress_text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let progress_percent = progress
        .get("progress_percent")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let pending_count = progress
        .get("pending_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let completed_count = progress
        .get("completed_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let total_count = progress
        .get("total_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    if let Some(map) = course.as_object_mut() {
        map.insert("progress_text".to_string(), json!(progress_text));
        map.insert("progress_rate".to_string(), json!(progress_percent));
        map.insert("progress_percent".to_string(), json!(progress_percent));
        map.insert("pending_count".to_string(), json!(pending_count));
        map.insert("completed_count".to_string(), json!(completed_count));
        map.insert("total_count".to_string(), json!(total_count));
        map.insert("auto_supported".to_string(), json!(total_count > 0));
    }
    pending_count
}

fn write_chaoxing_course_progress_fallback(
    course: &mut Value,
    role_type: u64,
    error_text: Option<&str>,
) -> usize {
    let message = if role_type == 1 {
        "教师视角课程，暂不统计学习进度"
    } else {
        "官方进度暂不可用"
    };
    if let Some(map) = course.as_object_mut() {
        map.insert("progress_text".to_string(), json!(message));
        map.insert("progress_rate".to_string(), json!(0.0));
        map.insert("progress_percent".to_string(), json!(0.0));
        map.insert("pending_count".to_string(), json!(0));
        map.insert("completed_count".to_string(), json!(0));
        map.insert("total_count".to_string(), json!(0));
        map.insert("auto_supported".to_string(), json!(role_type != 1));
        if let Some(error_text) = error_text.map(str::trim).filter(|text| !text.is_empty()) {
            map.insert("progress_error".to_string(), json!(error_text));
        }
    }
    0
}

fn extract_display_name_from_state(record: Option<&OnlineLearningPlatformStateRecord>) -> String {
    record
        .map(|item| item.display_name.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn extract_account_from_state(record: Option<&OnlineLearningPlatformStateRecord>) -> String {
    record
        .map(|item| item.account_id.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn extract_meta_json(record: Option<&OnlineLearningPlatformStateRecord>) -> Value {
    record
        .and_then(|item| serde_json::from_str::<Value>(&item.meta_json).ok())
        .unwrap_or_else(|| json!({}))
}

pub async fn fetch_online_learning_overview(
    client: &HbutClient,
    student_id: Option<&str>,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let states = db::list_online_learning_platform_states(crate::DB_FILENAME, &sid).unwrap_or_default();
    let mut state_map: HashMap<String, OnlineLearningPlatformStateRecord> = HashMap::new();
    for item in states {
        state_map.insert(item.platform.clone(), item);
    }

    let chaoxing_state = state_map.get(PLATFORM_CHAOXING);
    let yuketang_state = state_map.get(PLATFORM_YUKETANG);
    let chaoxing_course_cache = read_cache(CACHE_CHAOXING_COURSES, &cache_key(&sid, "courses"));
    let yuketang_course_cache = read_cache(CACHE_YUKETANG_COURSES, &cache_key(&sid, "courses"));
    let recent_runs = db::list_online_learning_sync_runs(crate::DB_FILENAME, &sid, None, 10).unwrap_or_default();

    let chaoxing_full_ready = has_chaoxing_full_session(client);
    let chaoxing_bridge_ready = has_chaoxing_bridge_cookie(client);
    let chaoxing_connected = chaoxing_full_ready
        || chaoxing_state
            .map(|item| item.connected && !item.cookie_blob.trim().is_empty())
            .unwrap_or(false);
    let yuketang_connected = yuketang_state
        .map(|item| item.connected)
        .unwrap_or_else(|| has_yuketang_session(client));
    let sync_runs = recent_runs
        .into_iter()
        .map(|item| {
            json!({
                "id": item.id,
                "platform": item.platform,
                "status": item.status,
                "summary": item.summary,
                "started_at": item.started_at,
                "finished_at": item.finished_at,
                "detail": serde_json::from_str::<Value>(&item.detail_json).unwrap_or_else(|_| json!({}))
            })
        })
        .collect::<Vec<_>>();
    let latest_sync_time = sync_runs
        .iter()
        .find_map(|item| item.get("finished_at").and_then(|v| v.as_str()))
        .unwrap_or_default()
        .to_string();
    let payload = json!({
        "success": true,
        "last_sync_time": latest_sync_time,
        "running_count": 0,
        "cache_status": if chaoxing_course_cache.is_some() || yuketang_course_cache.is_some() { "缓存可用" } else { "未命中缓存" },
        "platforms": {
            PLATFORM_CHAOXING: {
                "platform": PLATFORM_CHAOXING,
                "label": "学习通",
                "connected": chaoxing_connected,
                "status": if chaoxing_connected { "已连接" } else if chaoxing_bridge_ready { "票据待补全" } else { "未连接" },
                "bridge_only": chaoxing_bridge_ready && !chaoxing_connected,
                "display_name": extract_display_name_from_state(chaoxing_state),
                "account_id": extract_account_from_state(chaoxing_state),
                "course_count": chaoxing_course_cache.as_ref().map(|(data, _)| summarize_course_count(data)).unwrap_or(0),
                "pending_count": chaoxing_course_cache.as_ref().map(|(data, _)| summarize_pending_count(data)).unwrap_or(0),
                "last_sync_time": chaoxing_state.map(|item| item.sync_time.clone()).unwrap_or_else(|| {
                    chaoxing_course_cache.as_ref().map(|(_, sync_time)| sync_time.clone()).unwrap_or_default()
                }),
                "cache_state": if chaoxing_course_cache.is_some() { "缓存数据" } else { "实时数据" },
                "offline": chaoxing_course_cache.is_some(),
                "message": if chaoxing_connected {
                    "已复用本机学习通会话"
                } else if chaoxing_bridge_ready {
                    "已获取教务票据，正在补全学习通会话"
                } else {
                    "请先在登录页完成学习通登录"
                },
                "meta": extract_meta_json(chaoxing_state),
            },
            PLATFORM_YUKETANG: {
                "platform": PLATFORM_YUKETANG,
                "label": "长江雨课堂",
                "connected": yuketang_connected,
                "status": if yuketang_connected { "已连接" } else { "未连接" },
                "display_name": extract_display_name_from_state(yuketang_state),
                "account_id": extract_account_from_state(yuketang_state),
                "course_count": yuketang_course_cache.as_ref().map(|(data, _)| summarize_course_count(data)).unwrap_or(0),
                "pending_count": yuketang_course_cache.as_ref().map(|(data, _)| summarize_pending_count(data)).unwrap_or(0),
                "last_sync_time": yuketang_state.map(|item| item.sync_time.clone()).unwrap_or_else(|| {
                    yuketang_course_cache.as_ref().map(|(_, sync_time)| sync_time.clone()).unwrap_or_default()
                }),
                "cache_state": if yuketang_course_cache.is_some() { "缓存数据" } else { "实时数据" },
                "offline": yuketang_course_cache.is_some(),
                "message": if yuketang_connected { "雨课堂会话可用" } else { "请在详情页扫码登录雨课堂" },
                "meta": extract_meta_json(yuketang_state),
            }
        },
        "sync_runs": sync_runs
    });

    save_cache(CACHE_OVERVIEW, &sid, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}

pub async fn online_learning_sync_now(
    client: &mut HbutClient,
    student_id: Option<&str>,
    platform: &str,
    force: bool,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let platform = platform.trim().to_lowercase();
    if platform.is_empty() || platform == "all" {
        let mut outputs = Vec::new();
        for key in [PLATFORM_CHAOXING, PLATFORM_YUKETANG] {
            let result = match key {
                PLATFORM_CHAOXING => chaoxing_fetch_courses(client, Some(&sid), force).await,
                PLATFORM_YUKETANG => yuketang_fetch_courses(client, Some(&sid), force).await,
                _ => unreachable!(),
            };
            match result {
                Ok(payload) => {
                    record_sync_run(&sid, key, "success", "同步完成", payload.clone());
                    outputs.push(json!({ "platform": key, "success": true, "payload": payload }));
                }
                Err(error) => {
                    record_sync_run(
                        &sid,
                        key,
                        "failed",
                        &format!("同步失败: {}", error),
                        json!({ "error": error.to_string() }),
                    );
                    outputs.push(json!({ "platform": key, "success": false, "error": error.to_string() }));
                }
            }
        }
        return Ok(json!({
            "success": true,
            "platform": "all",
            "results": outputs,
        }));
    }

    let result = match platform.as_str() {
        PLATFORM_CHAOXING => chaoxing_fetch_courses(client, Some(&sid), force).await,
        PLATFORM_YUKETANG => yuketang_fetch_courses(client, Some(&sid), force).await,
        _ => Err(err_box("不支持的在线学习平台")),
    };

    match result {
        Ok(payload) => {
            record_sync_run(&sid, &platform, "success", "同步完成", payload.clone());
            Ok(payload)
        }
        Err(error) => {
            record_sync_run(
                &sid,
                &platform,
                "failed",
                &format!("同步失败: {}", error),
                json!({ "error": error.to_string() }),
            );
            Err(error)
        }
    }
}

pub fn list_online_learning_sync_runs(
    student_id: &str,
    platform: Option<&str>,
    limit: usize,
) -> Result<Value, DynError> {
    let runs = db::list_online_learning_sync_runs(crate::DB_FILENAME, student_id, platform, limit)
        .map_err(|e| err_box(e.to_string()))?;
    Ok(json!({
        "success": true,
        "runs": runs.into_iter().map(|item| {
            json!({
                "id": item.id,
                "platform": item.platform,
                "status": item.status,
                "summary": item.summary,
                "started_at": item.started_at,
                "finished_at": item.finished_at,
                "detail": serde_json::from_str::<Value>(&item.detail_json).unwrap_or_else(|_| json!({}))
            })
        }).collect::<Vec<_>>()
    }))
}

pub fn clear_online_learning_cache(student_id: &str, platform: Option<&str>) -> Result<Value, DynError> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return Err(err_box("student_id 不能为空"));
    }
    let clear_platform = platform.map(|item| item.trim().to_lowercase());

    clear_cache(CACHE_OVERVIEW, sid);
    match clear_platform.as_deref() {
        Some(PLATFORM_CHAOXING) => {
            clear_cache(CACHE_CHAOXING_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_CHAOXING_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_CHAOXING_PROGRESS, &cache_key(sid, "progress:"));
        }
        Some(PLATFORM_YUKETANG) => {
            clear_cache(CACHE_YUKETANG_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_YUKETANG_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_YUKETANG_PROGRESS, &cache_key(sid, "progress:"));
        }
        _ => {
            clear_cache(CACHE_CHAOXING_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_CHAOXING_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_CHAOXING_PROGRESS, &cache_key(sid, "progress:"));
            clear_cache(CACHE_YUKETANG_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_YUKETANG_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_YUKETANG_PROGRESS, &cache_key(sid, "progress:"));
        }
    }
    let _ = db::clear_online_learning_platform_state(crate::DB_FILENAME, sid, clear_platform.as_deref());
    let _ = db::clear_online_learning_sync_runs(crate::DB_FILENAME, sid, clear_platform.as_deref());

    Ok(json!({
        "success": true,
        "student_id": sid,
        "platform": clear_platform,
        "cleared_at": now_sync_time(),
    }))
}

pub async fn chaoxing_get_session_status(
    client: &mut HbutClient,
    student_id: Option<&str>,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let connected = ensure_chaoxing_session_ready(client, &sid).await;
    let current_cookie = chaoxing_cookie_blob(client);
    let persisted = db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_CHAOXING)
        .unwrap_or(None);
    let bridge_only = has_chaoxing_bridge_cookie(client) && !connected;
    let uid = parse_cookie_value(&current_cookie, "UID")
        .or_else(|| parse_cookie_value(&current_cookie, "_uid"))
        .unwrap_or_else(|| extract_account_from_state(persisted.as_ref()));
    let display_name = client
        .user_info
        .as_ref()
        .map(|item| item.student_name.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| extract_display_name_from_state(persisted.as_ref()));
    let status = if connected {
        "已连接"
    } else if bridge_only {
        "票据待补全"
    } else {
        "未连接"
    };

    let payload = json!({
        "success": true,
        "platform": PLATFORM_CHAOXING,
        "connected": connected,
        "bridge_only": bridge_only,
        "status": status,
        "student_id": sid,
        "account_id": uid,
        "display_name": display_name,
        "cookie_ready": !current_cookie.trim().is_empty(),
        "offline": false,
        "message": if connected {
            "已复用本机学习通会话"
        } else if bridge_only {
            "已获取教务票据，但学习通票据补全失败，请重试"
        } else {
            "当前没有可用的学习通会话，请先在学习通登录页完成一次登录后自动同步"
        },
        "launch_url": "https://i.chaoxing.com/base",
        "sync_time": persisted.map(|item| item.sync_time).unwrap_or_default(),
    });
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}

async fn fetch_chaoxing_courses_remote(client: &HbutClient) -> Result<Value, DynError> {
    let url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
    let resp = client
        .client
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/base")
        .send()
        .await?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let text = resp.text().await?;
    if status.is_success() {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if value
                .get("status")
                .and_then(|item| item.as_bool())
                .is_some_and(|flag| !flag)
            {
                let msg = value
                    .get("errorMsg")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("msg").and_then(|v| v.as_str()))
                    .unwrap_or("学习通会话已失效，请重新登录")
                    .trim()
                    .to_string();
                return Err(err_box(msg));
            }
            let mut courses = Vec::new();
            let mut seen = HashSet::new();
            let list = value
                .get("channelList")
                .and_then(|v| v.as_array())
                .cloned()
                .or_else(|| value.get("data").and_then(|data| data.get("channelList")).and_then(|v| v.as_array()).cloned())
                .or_else(|| value.get("courseList").and_then(|v| v.as_array()).cloned())
                .or_else(|| value.get("data").and_then(|data| data.get("courseList")).and_then(|v| v.as_array()).cloned())
                .or_else(|| value.get("result").and_then(|v| v.as_array()).cloned())
                .unwrap_or_default();

            let list_len = list.len();
            for item in list {
                // backclazzdata 的 channelList 结构：
                // { cpi, key, content: { name, roletype, id(=clazzId), course: { data: [{ name, id(=courseId), teacherfactor, imageurl }] } } }
                let content = match item.get("content") {
                    Some(c) => c,
                    None => &item, // 兼容已扁平化的格式
                };
                let roletype = content.get("roletype").and_then(|v| v.as_u64()).unwrap_or(3);
                // 获取课程核心数据（区分创建者 roletype=1 和学生 roletype=3）
                let course_data = content.get("course")
                    .and_then(|c| c.get("data"))
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first());
                let (name, course_id, teacher, image_url) = if let Some(cd) = course_data {
                    // 学生视角：从 course.data[0] 提取
                    let n = sanitize_text(cd.get("name").and_then(|v| v.as_str()).unwrap_or(""));
                    let cid = cd.get("id").map(|v| v.to_string().trim_matches('"').to_string()).unwrap_or_default();
                    let t = sanitize_text(cd.get("teacherfactor").and_then(|v| v.as_str()).unwrap_or(""));
                    let img = cd.get("imageurl").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    (n, cid, t, img)
                } else {
                    // 创建者视角或扁平格式
                    let n = sanitize_text(content.get("name").and_then(|v| v.as_str())
                        .or_else(|| item.get("name").and_then(|v| v.as_str()))
                        .unwrap_or(""));
                    let cid = content.get("id").map(|v| v.to_string().trim_matches('"').to_string())
                        .or_else(|| item.get("courseid").map(|v| v.to_string().trim_matches('"').to_string()))
                        .unwrap_or_default();
                    let t = sanitize_text(content.get("teacherfactor").and_then(|v| v.as_str())
                        .or_else(|| item.get("teacherfactor").and_then(|v| v.as_str()))
                        .unwrap_or(""));
                    let img = content.get("imageurl").and_then(|v| v.as_str())
                        .or_else(|| item.get("imageurl").and_then(|v| v.as_str()))
                        .unwrap_or("").to_string();
                    (n, cid, t, img)
                };
                // clazzId：学生视角从 content.id，创建者视角从 content.clazz[0].clazzId
                let clazz_id = if roletype == 1 {
                    content.get("clazz")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|c| c.get("clazzId"))
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default()
                } else {
                    content.get("id").map(|v| v.to_string().trim_matches('"').to_string())
                        .or_else(|| item.get("clazzid").map(|v| v.to_string().trim_matches('"').to_string()))
                        .unwrap_or_default()
                };
                let cpi = item.get("cpi")
                    .or_else(|| content.get("cpi"))
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .unwrap_or_default();
                let key = format!("{}:{}", course_id, clazz_id);
                if course_id.is_empty() || clazz_id.is_empty() || !seen.insert(key.clone()) {
                    continue;
                }
                // 显示名称：优先使用班级名（含段号信息），其次课程名
                let display_name = content.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let final_name = if !name.is_empty() { name.clone() } else { sanitize_text(&display_name) };
                let course_url = format!(
                    "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={}&chapterId=0&clazzid={}&cpi={}&mooc2=1&isMicroCourse=false",
                    course_id, clazz_id, cpi
                );
                courses.push(json!({
                    "id": key,
                    "course_id": course_id,
                    "clazz_id": clazz_id,
                    "cpi": cpi,
                    "name": final_name,
                    "teacher": teacher,
                    "image_url": image_url,
                    "course_url": course_url,
                    "role_type": roletype,
                    "role_label": if roletype == 1 { "teacher" } else { "student" },
                    "auto_supported": roletype != 1,
                }));
            }
            println!("[调试] backclazzdata channelList={}, parsed courses={}", list_len, courses.len());
            for (i, c) in courses.iter().enumerate() {
                println!("[调试] course[{}]: id={} name={}", i, c["course_id"], c["name"]);
            }
            let pending_count = value
                .get("pending_count")
                .and_then(|v| v.as_u64())
                .or_else(|| value.get("pendingCount").and_then(|v| v.as_u64()))
                .or_else(|| value.get("unfinishedCount").and_then(|v| v.as_u64()))
                .unwrap_or(0) as usize;
            return Ok(json!({
                "success": true,
                "courses": courses,
                "pending_count": pending_count
            }));
        }
    }

    if final_url.contains("/login") {
        return Err(err_box("学习通会话已失效，请重新登录"));
    }

    let doc = Html::parse_document(&text);
    let course_link_selector = selector("a[href*=\"courseid=\"]");
    let image_selector = selector("img");
    let mut courses = Vec::new();
    let mut seen = HashSet::new();
    for link in doc.select(&course_link_selector) {
        let href = link.value().attr("href").unwrap_or("").trim();
        if href.is_empty() {
            continue;
        }
        let course_id = parse_href_param(href, "courseid");
        let clazz_id = parse_href_param(href, "clazzid");
        let cpi = parse_href_param(href, "cpi");
        let name = sanitize_text(&link.text().collect::<Vec<_>>().join(" "));
        let uniq = format!("{}:{}:{}", course_id, clazz_id, name);
        if name.is_empty() || !seen.insert(uniq) {
            continue;
        }
        let image_url = link
            .select(&image_selector)
            .next()
            .and_then(|img| img.value().attr("src"))
            .unwrap_or("")
            .to_string();
        let teacher = link
            .value()
            .attr("title")
            .map(sanitize_text)
            .unwrap_or_default();
        let course_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://mooc1.chaoxing.com{}", href)
        };
        courses.push(json!({
            "id": format!("{}:{}", course_id, clazz_id),
            "course_id": course_id,
            "clazz_id": clazz_id,
            "cpi": cpi,
            "name": name,
            "teacher": teacher,
            "image_url": image_url,
            "course_url": course_url,
            "role_type": 3,
            "role_label": "student",
            "auto_supported": true,
        }));
    }

    if courses.is_empty() {
        return Err(err_box("未解析到学习通课程"));
    }

    Ok(json!({
        "success": true,
        "courses": courses,
        "pending_count": 0
    }))
}

async fn fetch_chaoxing_course_progress_remote(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: Option<&str>,
) -> Result<Value, DynError> {
    let outline = fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, course_url).await?;
    let nodes = outline
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let total_count = nodes.len();
    let completed_count = nodes
        .iter()
        .filter(|item| item.get("completed").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();
    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "total_count": total_count,
        "completed_count": completed_count,
        "pending_count": total_count.saturating_sub(completed_count),
        "progress_percent": if total_count == 0 { 0.0 } else { completed_count as f64 * 100.0 / total_count as f64 },
        "progress_text": format!("已完成 {} / {}", completed_count, total_count),
        "nodes": nodes
    }))
}

async fn enrich_chaoxing_courses_with_progress(
    client: &HbutClient,
    student_id: &str,
    courses: Vec<Value>,
    force_refresh: bool,
    allow_live_fetch: bool,
) -> (Vec<Value>, usize) {
    let mut enriched_courses = Vec::with_capacity(courses.len());
    let mut total_pending = 0usize;

    for mut course in courses {
        let role_type = course.get("role_type").and_then(|v| v.as_u64()).unwrap_or(3);
        let course_id = course
            .get("course_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let clazz_id = course
            .get("clazz_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let cpi = course
            .get("cpi")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let course_url = course
            .get("course_url")
            .and_then(|v| v.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        if course_id.is_empty() || clazz_id.is_empty() {
            total_pending += write_chaoxing_course_progress_fallback(&mut course, role_type, Some("课程标识缺失"));
            enriched_courses.push(course);
            continue;
        }

        let cache_id = cache_key(student_id, &format!("progress:{}:{}", course_id, clazz_id));
        let mut progress_payload = if !force_refresh {
            read_cache(CACHE_CHAOXING_PROGRESS, &cache_id).map(|(cached, _)| cached)
        } else {
            None
        };

        if progress_payload.is_none() && allow_live_fetch {
            match fetch_chaoxing_course_progress_remote(
                client,
                &course_id,
                &clazz_id,
                &cpi,
                course_url.as_deref(),
            )
            .await
            {
                Ok(payload) => {
                    save_cache(CACHE_CHAOXING_PROGRESS, &cache_id, &payload);
                    progress_payload = Some(payload);
                }
                Err(error) => {
                    total_pending += write_chaoxing_course_progress_fallback(
                        &mut course,
                        role_type,
                        Some(&error.to_string()),
                    );
                    enriched_courses.push(course);
                    continue;
                }
            }
        }

        if let Some(progress) = progress_payload {
            total_pending += write_chaoxing_course_progress_fields(&mut course, &progress);
        } else {
            total_pending += write_chaoxing_course_progress_fallback(&mut course, role_type, None);
        }
        enriched_courses.push(course);
    }

    (enriched_courses, total_pending)
}

pub async fn chaoxing_fetch_courses(
    client: &mut HbutClient,
    student_id: Option<&str>,
    force: bool,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let session_ready = ensure_chaoxing_session_ready(client, &sid).await;
    let cache_id = cache_key(&sid, "courses");
    if !force {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
            if chaoxing_course_progress_ready(&cached) {
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            if !session_ready {
                let cached_courses = cached
                    .get("courses")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let (courses, pending_count) = enrich_chaoxing_courses_with_progress(
                    client,
                    &sid,
                    cached_courses,
                    false,
                    false,
                )
                .await;
                let refreshed = json!({
                    "success": true,
                    "courses": courses,
                    "pending_count": pending_count,
                    "platform_status": cached
                        .get("platform_status")
                        .cloned()
                        .unwrap_or_else(|| json!({
                            "platform": PLATFORM_CHAOXING,
                            "connected": false,
                            "status": if has_chaoxing_bridge_cookie(client) { "票据待补全" } else { "未连接" },
                            "offline": true,
                            "message": "已加载缓存课程数据"
                        }))
                });
                save_cache(CACHE_CHAOXING_COURSES, &cache_id, &refreshed);
                return Ok(crate::attach_sync_time(refreshed, &sync_time, true));
            }
        }
    }
    if !session_ready {
        return Ok(json!({
            "success": true,
            "courses": [],
            "pending_count": 0,
            "platform_status": {
                "platform": PLATFORM_CHAOXING,
                "connected": false,
                "status": if has_chaoxing_bridge_cookie(client) { "票据待补全" } else { "未连接" },
                "offline": false,
                "message": if has_chaoxing_bridge_cookie(client) {
                    "已获取教务票据，但学习通票据补全失败，请稍后重试"
                } else {
                    "当前没有可用的学习通会话，请先在学习通登录页完成一次登录后自动同步"
                }
            }
        }));
    }

    match fetch_chaoxing_courses_remote(client).await {
        Ok(payload) => {
            let raw_courses = payload
                .get("courses")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let (courses, pending_count) = enrich_chaoxing_courses_with_progress(
                client,
                &sid,
                raw_courses,
                force,
                true,
            )
            .await;
            let enriched = json!({
                "success": true,
                "courses": courses,
                "pending_count": pending_count,
                "platform_status": {
                    "platform": PLATFORM_CHAOXING,
                    "connected": true,
                    "status": "已连接",
                    "offline": false,
                    "message": "已复用本机学习通会话"
                }
            });
            save_cache(CACHE_CHAOXING_COURSES, &cache_id, &enriched);
            let display_name = client
                .user_info
                .as_ref()
                .map(|item| item.student_name.clone())
                .unwrap_or_default();
            save_platform_state(
                &sid,
                PLATFORM_CHAOXING,
                true,
                parse_cookie_value(&chaoxing_cookie_blob(client), "UID").unwrap_or_default(),
                display_name,
                chaoxing_cookie_blob(client),
                json!({
                    "course_count": enriched.get("courses").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0)
                }),
            );
            Ok(crate::attach_sync_time(enriched, &now_sync_time(), false))
        }
        Err(error) => {
            if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            Err(error)
        }
    }
}

async fn fetch_chaoxing_outline_remote(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: Option<&str>,
) -> Result<Value, DynError> {
    let target = course_url
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| {
            format!(
                "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={}&chapterId=0&clazzid={}&cpi={}&mooc2=1&isMicroCourse=false",
                course_id, clazz_id, cpi
            )
        });

    // mooc1.chaoxing.com 章节页需要 _uid/UID/fid 等 cookies，
    // 这些可能仅在 mooc1-api/passport2/i.chaoxing.com 域上存在。
    // 收集所有相关域的关键 cookies 并种到 mooc1 域。
    propagate_chaoxing_key_cookies(client);

    let resp = client
        .client
        .get(&target)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
        .send()
        .await?;
    let final_url = resp.url().to_string();
    let html = resp.text().await?;
    if final_url.contains("/login") {
        return Err(err_box("学习通会话已失效，请重新登录"));
    }

    // mooc-ans 页面使用 span.posCatalog_name + onclick="getTeacherAjax()" 结构
    // 格式: id="cur{knowledgeId}" ... title="章节名" ... onclick="getTeacherAjax('courseId','clazzId','knowledgeId')"
    let re_chapter = regex::Regex::new(
        r#"id="cur(\d+)"[\s\S]*?title="([^"]*)"[\s\S]*?onclick="getTeacherAjax\('(\d+)','(\d+)','(\d+)'\)"#,
    )
    .expect("regex chapter");

    let mut nodes = Vec::new();
    let mut seen = HashSet::new();
    for cap in re_chapter.captures_iter(&html) {
        let cur_id = cap[1].to_string();
        let title = cap[2].trim().to_string();
        let cap_course_id = cap[3].to_string();
        let cap_clazz_id = cap[4].to_string();
        let knowledge_id = cap[5].to_string();

        if title.is_empty() || !seen.insert(cur_id.clone()) {
            continue;
        }

        // 从匹配位置到下一个 id="cur 之间的块来判断完成状态
        let start = cap.get(0).unwrap().start();
        let end = html[start + 1..]
            .find(r#"id="cur"#)
            .map(|pos| start + 1 + pos)
            .unwrap_or(html.len());
        let block = &html[start..end];
        let completed = block.contains("icon_Completed") || block.contains("icon_yiwanc");
        let has_unfinished = block.contains("jobUnfinishCount");

        let launch_url = format!(
            "https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid={}&courseid={}&knowledgeid={}&num=0&ut=s&cpi={}&v=20160407-3&mooc2=1",
            cap_clazz_id, cap_course_id, knowledge_id, cpi
        );

        nodes.push(json!({
            "id": knowledge_id,
            "title": title,
            "course_id": cap_course_id,
            "clazz_id": cap_clazz_id,
            "cpi": cpi,
            "chapter_id": cur_id,
            "knowledge_id": knowledge_id,
            "launch_url": launch_url,
            "completed": completed && !has_unfinished,
            "task_type": "chapter",
            "children": []
        }));
    }

    println!("[调试] 章节解析: mooc-ans 格式匹配 {} 个知识点", nodes.len());

    // 兜底：旧格式 a[href*="studentstudy"]
    if nodes.is_empty() {
        let doc = Html::parse_document(&html);
        let link_selector = selector("a[href*=\"studentstudy\"]");
        for link in doc.select(&link_selector) {
            let href = link.value().attr("href").unwrap_or("").trim();
            let title = sanitize_text(&link.text().collect::<Vec<_>>().join(" "));
            if href.is_empty() || title.is_empty() {
                continue;
            }
            let launch_url = if href.starts_with("http") {
                href.to_string()
            } else {
                format!("https://mooc1.chaoxing.com{}", href)
            };
            let chapter_id = parse_href_param(&launch_url, "chapterId");
            let knowledge_id = parse_href_param(&launch_url, "knowledgeid");
            let key = format!("{}:{}:{}", chapter_id, knowledge_id, title);
            if !seen.insert(key) {
                continue;
            }
            let link_html = link.html().to_lowercase();
            let completed = link_html.contains("icon_completed")
                || link_html.contains("icon_yiwanc");
            let has_unfinished = link_html.contains("jobunfinishcount");
            nodes.push(json!({
                "id": if !chapter_id.is_empty() { chapter_id.clone() } else if !knowledge_id.is_empty() { knowledge_id.clone() } else { launch_url.clone() },
                "title": title,
                "course_id": course_id,
                "clazz_id": clazz_id,
                "cpi": cpi,
                "chapter_id": chapter_id,
                "knowledge_id": knowledge_id,
                "launch_url": launch_url,
                "completed": completed && !has_unfinished,
                "task_type": "chapter",
                "children": []
            }));
        }
        println!("[调试] 章节解析: 旧格式兜底匹配 {} 个链接", nodes.len());
    }

    if nodes.is_empty() {
        return Err(err_box("未解析到学习通章节结构"));
    }
    let total_count = nodes.len();
    let completed_count = nodes
        .iter()
        .filter(|item| item.get("completed").and_then(|v| v.as_bool()).unwrap_or(false))
        .count();
    Ok(json!({
        "success": true,
        "nodes": nodes,
        "sections": nodes,
        "total_count": total_count,
        "completed_count": completed_count,
        "pending_count": total_count.saturating_sub(completed_count),
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "course_url": target
    }))
}

pub async fn chaoxing_fetch_course_outline(
    client: &mut HbutClient,
    req: &crate::ChaoxingCourseOutlineRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let _ = ensure_chaoxing_session_ready(client, &sid).await;
    let course_id = req.course_id.trim();
    let clazz_id = req.clazz_id.trim();
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("course_id 和 clazz_id 不能为空"));
    }
    let cpi = req.cpi.trim();
    let cache_id = cache_key(&sid, &format!("outline:{}:{}", course_id, clazz_id));
    if !req.force.unwrap_or(false) {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_OUTLINE, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    match fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, req.course_url.as_deref()).await {
        Ok(payload) => {
            save_cache(CACHE_CHAOXING_OUTLINE, &cache_id, &payload);
            Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
        }
        Err(error) => {
            if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_OUTLINE, &cache_id) {
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            Err(error)
        }
    }
}

pub async fn chaoxing_fetch_course_progress(
    client: &mut HbutClient,
    req: &crate::ChaoxingCourseProgressRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let _ = ensure_chaoxing_session_ready(client, &sid).await;
    let course_id = req.course_id.trim();
    let clazz_id = req.clazz_id.trim();
    let cpi_value = req.cpi.clone();
    let force_refresh = req.force.unwrap_or(false);
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("course_id 和 clazz_id 不能为空"));
    }
    let cache_id = cache_key(&sid, &format!("progress:{}:{}", course_id, clazz_id));
    if !force_refresh {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_PROGRESS, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    let payload = fetch_chaoxing_course_progress_remote(
        client,
        course_id,
        clazz_id,
        &cpi_value,
        req.course_url.as_deref(),
    )
    .await?;
    save_cache(CACHE_CHAOXING_PROGRESS, &cache_id, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}

pub fn chaoxing_get_launch_url(req: &crate::ChaoxingLaunchUrlRequest) -> Result<Value, DynError> {
    if let Some(raw) = req.launch_url.as_ref().map(|item| item.trim()).filter(|item| !item.is_empty()) {
        return Ok(json!({ "success": true, "launch_url": raw }));
    }
    let course_id = req.course_id.trim();
    let clazz_id = req.clazz_id.trim();
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("course_id 和 clazz_id 不能为空"));
    }
    let chapter_id = req.chapter_id.as_deref().unwrap_or("").trim();
    let knowledge_id = req.knowledge_id.as_deref().unwrap_or("").trim();
    let cpi = req.cpi.as_deref().unwrap_or("").trim();
    let mut url = format!(
        "https://mooc1-api.chaoxing.com/mycourse/studentcourse?courseid={}&clazzid={}&cpi={}&ut=s",
        course_id, clazz_id, cpi
    );
    if !chapter_id.is_empty() || !knowledge_id.is_empty() {
        url = format!(
            "https://mooc1-api.chaoxing.com/mycourse/studentstudy?chapterId={}&courseid={}&clazzid={}&knowledgeid={}&cpi={}&ut=s",
            chapter_id,
            course_id,
            clazz_id,
            knowledge_id,
            cpi
        );
    }
    Ok(json!({ "success": true, "launch_url": url }))
}

pub async fn yuketang_create_qr_login(
    client: &HbutClient,
    req: &crate::YuketangQrCreateRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let session_id = format!("ykt-{}", Utc::now().timestamp_millis());
    let created_at = now_sync_time();
    let expires_at = (Utc::now() + chrono::Duration::minutes(10)).to_rfc3339();
    let mut ws_request = "wss://changjiang.yuketang.cn/wsapp/"
        .into_client_request()
        .map_err(|e| err_box(format!("构建雨课堂登录请求失败: {}", e)))?;
    ws_request
        .headers_mut()
        .insert("Origin", HeaderValue::from_static("https://changjiang.yuketang.cn"));
    ws_request.headers_mut().insert(
        "User-Agent",
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    );
    let (mut ws_stream, _) = tokio::time::timeout(Duration::from_secs(20), connect_async(ws_request))
        .await
        .map_err(|_| err_box("连接雨课堂登录服务超时"))?
        .map_err(|e| err_box(format!("连接雨课堂登录服务失败: {}", e)))?;
    ws_stream
        .send(Message::Text(
            json!({
                "op": "requestlogin",
                "role": "web",
                "version": 1.4,
                "type": "qrcode"
            })
            .to_string()
            .into(),
        ))
        .await
        .map_err(|e| err_box(format!("请求雨课堂二维码失败: {}", e)))?;

    let mut qr_code_url = String::new();
    let mut ticket_url = String::new();
    let waiting_message = "请使用微信扫码登录长江雨课堂".to_string();
    let first_event = tokio::time::timeout(Duration::from_secs(12), async {
        while let Some(message) = ws_stream.next().await {
            let message = message.map_err(|e| err_box(format!("读取雨课堂二维码失败: {}", e)))?;
            if !message.is_text() {
                continue;
            }
            let payload: Value = serde_json::from_str(message.to_text().unwrap_or("{}"))
                .map_err(|e| err_box(format!("解析雨课堂二维码消息失败: {}", e)))?;
            let op = payload.get("op").and_then(|v| v.as_str()).unwrap_or("");
            if op == "requestlogin" {
                qr_code_url = payload
                    .get("qrcode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                ticket_url = payload
                    .get("ticket")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if qr_code_url.is_empty() {
                    return Err(err_box("雨课堂未返回有效二维码"));
                }
                return Ok::<(), DynError>(());
            }
            if op == "error" {
                let msg = payload.get("message").and_then(|v| v.as_str()).unwrap_or("雨课堂登录服务返回错误");
                return Err(err_box(msg));
            }
        }
        Err(err_box("雨课堂登录服务未返回二维码"))
    })
    .await
    .map_err(|_| err_box("等待雨课堂二维码超时"))?;
    first_event?;

    let initial = PendingYuketangLogin {
        session_id: session_id.clone(),
        student_id: sid.clone(),
        status: "waiting_scan".to_string(),
        message: waiting_message.clone(),
        login_url: YUKETANG_WEB_URL.to_string(),
        authorize_url: YUKETANG_AUTHORIZE_URL.to_string(),
        qr_code_url: qr_code_url.clone(),
        ticket_url: ticket_url.clone(),
        account_id: String::new(),
        created_at: created_at.clone(),
        expires_at: expires_at.clone(),
    };
    if let Ok(mut store) = yuketang_pending_store().lock() {
        store.insert(session_id.clone(), initial.clone());
    }

    let reqwest_client = client.client.clone();
    let cookie_jar = client.cookie_jar.clone();
    let bg_session_id = session_id.clone();
    let bg_sid = sid.clone();
    tokio::spawn(async move {
        let finish_with = |status: &str, message: String, account_id: Option<String>| {
            let _ = update_pending_yuketang_login(&bg_session_id, |record| {
                record.status = status.to_string();
                record.message = message;
                if let Some(value) = account_id {
                    record.account_id = value;
                }
            });
        };

        while let Some(message) = ws_stream.next().await {
            let Ok(message) = message else {
                finish_with("failed", "雨课堂登录通道已断开".to_string(), None);
                return;
            };
            if !message.is_text() {
                continue;
            }
            let Ok(payload) = serde_json::from_str::<Value>(message.to_text().unwrap_or("{}")) else {
                continue;
            };
            let op = payload.get("op").and_then(|v| v.as_str()).unwrap_or("");
            match op {
                "requestlogin" => {
                    let _ = update_pending_yuketang_login(&bg_session_id, |record| {
                        record.status = "waiting_scan".to_string();
                        record.message = "二维码已刷新，请使用微信扫码".to_string();
                        record.qr_code_url = payload
                            .get("qrcode")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        record.ticket_url = payload
                            .get("ticket")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                    });
                }
                "scan" | "scanned" => {
                    let _ = update_pending_yuketang_login(&bg_session_id, |record| {
                        record.status = "scanned".to_string();
                        record.message = "已扫码，请在微信内确认登录".to_string();
                    });
                }
                "loginsuccess" => {
                    let auth = payload.get("Auth").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let user_id = payload.get("UserID").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if auth.is_empty() || user_id.is_empty() {
                        finish_with("failed", "雨课堂登录回调缺少授权信息".to_string(), None);
                        return;
                    }
                    let login_resp = reqwest_client
                        .post("https://changjiang.yuketang.cn/pc/web_login")
                        .json(&json!({
                            "Auth": auth,
                            "UserID": user_id,
                            "host_name": "changjiang.yuketang.cn"
                        }))
                        .send()
                        .await;
                    match login_resp {
                        Ok(resp) => match read_json_response(resp, "完成雨课堂登录失败").await {
                            Ok(login_value) => {
                                let success = login_value.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                                if !success {
                                    let message = login_value
                                        .get("msg")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("雨课堂登录失败")
                                        .to_string();
                                    finish_with("failed", message, None);
                                    return;
                                }
                                let account_id = login_value
                                    .get("user_id")
                                    .and_then(|v| v.as_i64())
                                    .map(|v| v.to_string())
                                    .unwrap_or_else(|| user_id.clone());
                                let cookie_blob = yuketang_cookie_blob_from_jar(&cookie_jar);
                                save_platform_state(
                                    &bg_sid,
                                    PLATFORM_YUKETANG,
                                    true,
                                    account_id.clone(),
                                    String::new(),
                                    cookie_blob,
                                    json!({ "source": "qr_login" }),
                                );
                                finish_with("confirmed", "雨课堂登录成功".to_string(), Some(account_id));
                            }
                            Err(error) => finish_with("failed", error.to_string(), None),
                        },
                        Err(error) => finish_with("failed", format!("完成雨课堂登录失败: {}", error), None),
                    }
                    return;
                }
                "cancel" | "timeout" => {
                    let message = payload
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("雨课堂扫码已取消或超时")
                        .to_string();
                    finish_with("expired", message, None);
                    return;
                }
                _ => {}
            }
        }
    });

    // 生成二维码图片（SVG base64 data URI）
    let qr_image_base64 = generate_qr_data_uri(&qr_code_url).unwrap_or_default();

    Ok(json!({
        "success": true,
        "session_id": session_id,
        "status": initial.status,
        "message": waiting_message,
        "login_url": initial.login_url,
        "authorize_url": initial.authorize_url,
        "qr_code_url": qr_code_url,
        "qr_image_base64": qr_image_base64,
        "ticket_url": ticket_url,
        "created_at": created_at,
        "expires_at": expires_at,
    }))
}

pub async fn yuketang_poll_qr_login(
    client: &HbutClient,
    req: &crate::YuketangPollQrLoginRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let session_id = req.session_id.trim().to_string();
    let pending = {
        let store = yuketang_pending_store()
            .lock()
            .map_err(|_| err_box("雨课堂登录状态锁获取失败"))?;
        store.get(&session_id).cloned()
    };
    if pending.is_none() {
        return Ok(crate::attach_sync_time(json!({
            "success": true,
            "session_id": session_id,
            "status": "expired",
            "message": "登录会话不存在或已过期"
        }), &now_sync_time(), false));
    }
    let mut output = pending.unwrap();
    if output.student_id != sid {
        return Err(err_box("登录会话与当前学号不匹配"));
    }
    let expired = chrono::DateTime::parse_from_rfc3339(&output.expires_at)
        .ok()
        .map(|expires_at| expires_at.with_timezone(&Utc) <= Utc::now())
        .unwrap_or(false);
    if expired {
        if let Ok(mut store) = yuketang_pending_store().lock() {
            store.remove(&session_id);
        }
        output.status = "expired".to_string();
        output.message = "登录会话已过期，请重新发起扫码".to_string();
        return Ok(crate::attach_sync_time(json!({
            "success": true,
            "session_id": output.session_id,
            "status": output.status,
            "message": output.message,
            "login_url": output.login_url,
            "authorize_url": output.authorize_url,
            "qr_code_url": output.qr_code_url,
            "qr_image_base64": generate_qr_data_uri(&output.qr_code_url).unwrap_or_default(),
            "ticket_url": output.ticket_url,
            "account_id": output.account_id,
            "created_at": output.created_at,
            "expires_at": output.expires_at,
        }), &now_sync_time(), false));
    }
    if let Ok(Some(state)) = db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG) {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    if output.status != "confirmed" && has_yuketang_session(client) {
        let cookie_blob = yuketang_cookie_blob(client);
        if !cookie_blob.trim().is_empty() {
            save_platform_state(
                &sid,
                PLATFORM_YUKETANG,
                true,
                parse_cookie_value(&cookie_blob, "university_id").unwrap_or_else(|| output.account_id.clone()),
                "".to_string(),
                cookie_blob,
                json!({ "source": "poll" }),
            );
            output.status = "confirmed".to_string();
            output.message = "雨课堂登录已生效".to_string();
        }
    }
    if let Ok(mut store) = yuketang_pending_store().lock() {
        store.insert(output.session_id.clone(), output.clone());
    }
    Ok(crate::attach_sync_time(json!({
        "success": true,
        "session_id": output.session_id,
        "status": output.status,
        "message": output.message,
        "login_url": output.login_url,
        "authorize_url": output.authorize_url,
        "qr_code_url": output.qr_code_url,
        "qr_image_base64": generate_qr_data_uri(&output.qr_code_url).unwrap_or_default(),
        "ticket_url": output.ticket_url,
        "account_id": output.account_id,
        "created_at": output.created_at,
        "expires_at": output.expires_at,
    }), &now_sync_time(), false))
}

async fn fetch_yuketang_courses_remote(client: &HbutClient) -> Result<Value, DynError> {
    let resp = client
        .client
        .get("https://changjiang.yuketang.cn/v2/api/web/courses/list")
        .query(&[("identity", "2"), ("classroom_id", "0")])
        .header("Accept", "application/json, text/plain, */*")
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .send()
        .await?;
    let value = read_json_response(resp, "获取雨课堂课程列表失败").await?;
    let errcode = value.get("errcode").and_then(|v| v.as_i64()).unwrap_or(-1);
    if errcode != 0 {
        return Err(err_box(
            value.get("errmsg").and_then(|v| v.as_str()).unwrap_or("获取雨课堂课程列表失败"),
        ));
    }
    let list = value
        .get("data")
        .and_then(|v| v.get("list"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let courses = list
        .into_iter()
        .map(|item| {
            let teacher = item
                .get("teacher")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            json!({
                "id": item.get("classroom_id").cloned().unwrap_or(Value::Null),
                "classroom_id": item.get("classroom_id").cloned().unwrap_or(Value::Null),
                "course_id": item.get("course").and_then(|v| v.get("id")).cloned().unwrap_or(Value::Null),
                "name": item.get("name").cloned().unwrap_or(Value::Null),
                "teacher": teacher,
                "sign": item.get("course").and_then(|v| v.get("university_id")).cloned().unwrap_or(Value::Null),
                "image_url": item.get("picture").cloned().unwrap_or(Value::Null),
                "course": item.get("course").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "success": true,
        "courses": courses,
        "pending_count": 0
    }))
}

pub async fn yuketang_fetch_courses(
    client: &HbutClient,
    student_id: Option<&str>,
    force: bool,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    if let Ok(Some(state)) = db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG) {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    let cache_id = cache_key(&sid, "courses");
    if !force {
        if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_COURSES, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    match fetch_yuketang_courses_remote(client).await {
        Ok(payload) => {
            let enriched = json!({
                "success": true,
                "courses": payload.get("courses").cloned().unwrap_or_else(|| json!([])),
                "pending_count": payload.get("pending_count").cloned().unwrap_or_else(|| json!(0)),
                "platform_status": {
                    "platform": PLATFORM_YUKETANG,
                    "connected": true,
                    "status": "已连接",
                    "offline": false,
                    "message": "雨课堂会话可用"
                }
            });
            save_cache(CACHE_YUKETANG_COURSES, &cache_id, &enriched);
            save_platform_state(
                &sid,
                PLATFORM_YUKETANG,
                true,
                parse_cookie_value(&yuketang_cookie_blob(client), "university_id").unwrap_or_default(),
                "".to_string(),
                yuketang_cookie_blob(client),
                json!({
                    "course_count": enriched.get("courses").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0)
                }),
            );
            Ok(crate::attach_sync_time(enriched, &now_sync_time(), false))
        }
        Err(error) => {
            if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_COURSES, &cache_id) {
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            // 401等认证错误时返回未连接状态而非抛错
            let err_msg = error.to_string();
            if err_msg.contains("401") || err_msg.contains("Unauthorized") || err_msg.contains("认证") || err_msg.contains("登录") {
                return Ok(json!({
                    "success": true,
                    "courses": [],
                    "pending_count": 0,
                    "platform_status": {
                        "platform": PLATFORM_YUKETANG,
                        "connected": false,
                        "status": "未连接",
                        "offline": false,
                        "message": "雨课堂会话已过期，请重新扫码登录"
                    }
                }));
            }
            Err(error)
        }
    }
}

pub async fn yuketang_fetch_course_outline(
    client: &HbutClient,
    req: &crate::YuketangCourseOutlineRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    if let Ok(Some(state)) = db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG) {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    let classroom_id = req.classroom_id.trim();
    if classroom_id.is_empty() {
        return Err(err_box("classroom_id 不能为空"));
    }
    let cache_id = cache_key(&sid, &format!("outline:{}", classroom_id));
    if !req.force.unwrap_or(false) {
        if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_OUTLINE, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }

    let sign = req.sign.as_deref().unwrap_or("").trim().to_string();
    let resp = client
        .client
        .get("https://changjiang.yuketang.cn/mooc-api/v1/lms/learn/course/chapter")
        .query(&[
            ("cid", classroom_id),
            ("sign", sign.as_str()),
            ("term", "latest"),
            ("uv_id", classroom_id),
            ("classroom_id", classroom_id),
        ])
        .header("classroom-id", classroom_id)
        .send()
        .await?;
    let value = read_json_response(resp, "获取雨课堂章节失败").await?;
    let data = value.get("data").cloned().unwrap_or_else(|| json!({}));
    let mut nodes = Vec::new();
    if let Some(chapters) = data.get("course_chapter").and_then(|v| v.as_array()) {
        for chapter in chapters {
            let chapter_name = chapter.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if let Some(section_list) = chapter.get("section_leaf_list").and_then(|v| v.as_array()) {
                for section in section_list {
                    let section_name = section.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let mut children = Vec::new();
                    if section.get("leaf_type").and_then(|v| v.as_i64()) == Some(0) {
                        children.push(json!({
                            "id": section.get("id").cloned().unwrap_or(Value::Null),
                            "title": section_name,
                            "task_type": "video",
                            "leaf_type": 0,
                            "completed": false,
                            "children": []
                        }));
                    }
                    if let Some(leaf_list) = section.get("leaf_list").and_then(|v| v.as_array()) {
                        for leaf in leaf_list {
                            children.push(json!({
                                "id": leaf.get("id").cloned().unwrap_or(Value::Null),
                                "title": leaf.get("name").cloned().unwrap_or(Value::Null),
                                "task_type": if leaf.get("leaf_type").and_then(|v| v.as_i64()) == Some(0) { "video" } else { "leaf" },
                                "leaf_type": leaf.get("leaf_type").cloned().unwrap_or(Value::Null),
                                "completed": false,
                                "children": []
                            }));
                        }
                    }
                    nodes.push(json!({
                        "id": section.get("id").cloned().unwrap_or(Value::Null),
                        "title": if section_name.is_empty() { chapter_name.clone() } else { format!("{} / {}", chapter_name, section_name) },
                        "task_type": "section",
                        "completed": false,
                        "children": children
                    }));
                }
            }
        }
    }
    let total_count = nodes.len();
    let payload = json!({
        "success": true,
        "classroom_id": classroom_id,
        "sign": sign,
        "total_count": total_count,
        "completed_count": 0,
        "pending_count": total_count,
        "nodes": nodes,
        "sections": nodes,
        "raw": data,
    });
    save_cache(CACHE_YUKETANG_OUTLINE, &cache_id, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}

pub async fn yuketang_fetch_course_progress(
    client: &HbutClient,
    req: &crate::YuketangCourseProgressRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    if let Ok(Some(state)) = db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG) {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    let classroom_id = req.classroom_id.trim();
    if classroom_id.is_empty() {
        return Err(err_box("classroom_id 不能为空"));
    }
    let cache_id = cache_key(&sid, &format!("progress:{}", classroom_id));
    if !req.force.unwrap_or(false) {
        if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_PROGRESS, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    let classroom_resp = client
        .client
        .get(format!("https://changjiang.yuketang.cn/v2/api/web/classrooms/{}", classroom_id))
        .query(&[("role", "5")])
        .header("classroom-id", classroom_id)
        .send()
        .await?;
    let classroom_value = read_json_response(classroom_resp, "获取雨课堂课堂详情失败").await?;
    let classroom_data = classroom_value.get("data").cloned().unwrap_or_else(|| json!({}));
    let sku_id = req
        .sku_id
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .or_else(|| classroom_data.get("course_sku_id").and_then(|v| v.as_i64()).map(|v| v.to_string()))
        .or_else(|| classroom_data.get("sku_id").and_then(|v| v.as_i64()).map(|v| v.to_string()))
        .unwrap_or_default();

    let detail = if sku_id.is_empty() {
        json!({})
    } else {
        let detail_resp = client
            .client
            .get(format!(
                "https://changjiang.yuketang.cn/c27/online_courseware/schedule/score_detail/single/{}/0/",
                sku_id
            ))
            .header("classroom-id", classroom_id)
            .send()
            .await?;
        let detail_value = read_json_response(detail_resp, "获取雨课堂课程进度失败").await?;
        detail_value.get("data").cloned().unwrap_or_else(|| json!({}))
    };

    let payload = json!({
        "success": true,
        "classroom_id": classroom_id,
        "sku_id": sku_id,
        "summary": if detail.is_null() || detail == json!({}) { "官方进度暂缺" } else { "官方进度" },
        "progress_text": if detail.is_null() || detail == json!({}) { "官方进度暂缺" } else { "官方进度已同步" },
        "classroom_detail": classroom_data,
        "progress_detail": detail,
    });
    save_cache(CACHE_YUKETANG_PROGRESS, &cache_id, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}

// ────────────────────────────────────────────────────────────
// 自动刷课 API —— 超星学习通
// ────────────────────────────────────────────────────────────

const CHAOXING_ENC_SALT: &str = "d_yHJ!$pdA~5";

fn make_chaoxing_enc(
    clazz_id: &str,
    userid: &str,
    jobid: &str,
    object_id: &str,
    playing_time_ms: u64,
    duration_ms: u64,
    clip_time: &str,
) -> String {
    let raw = format!(
        "[{}][{}][{}][{}][{}][{}][{}][{}]",
        clazz_id, userid, jobid, object_id, playing_time_ms, CHAOXING_ENC_SALT, duration_ms, clip_time
    );
    format!("{:x}", md5::compute(raw.as_bytes()))
}

/// 获取章节知识卡片（含视频任务列表）
pub async fn chaoxing_get_knowledge_cards(
    client: &HbutClient,
    clazz_id: &str,
    course_id: &str,
    knowledge_id: &str,
    cpi: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let resp = client
        .client
        .get("https://mooc1.chaoxing.com/mooc-ans/knowledge/cards")
        .query(&[
            ("clazzid", clazz_id),
            ("courseid", course_id),
            ("knowledgeid", knowledge_id),
            ("num", "0"),
            ("ut", "s"),
            ("cpi", cpi),
            ("v", "2025-0424-1038-3"),
            ("mooc2", "1"),
            ("isMicroCourse", "false"),
            ("editorPreview", "0"),
        ])
        .header("Referer", "https://mooc1.chaoxing.com/ananas/modules/video/index.html")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let html = resp.text().await?;
    // 解析 mArg JSON：mArg = {...};
    let re = regex::Regex::new(r"mArg\s*=\s*(\{[\s\S]*?\});")?;
    let marg_json = re
        .captures(&html)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str())
        .unwrap_or("{}");
    let marg: Value = serde_json::from_str(marg_json).unwrap_or_else(|_| json!({}));

    // 从 mArg 提取视频任务
    let attachments = marg
        .get("attachments")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let defaults = marg.get("defaults").cloned().unwrap_or_else(|| json!({}));
    let report_url = defaults
        .get("reportUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let fid = defaults
        .get("fid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut videos = Vec::new();
    for att in &attachments {
        let jobid = att.get("jobid").and_then(|v| v.as_str()).unwrap_or("");
        if jobid.is_empty() {
            continue;
        }
        let object_id = att.get("objectId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let name = att
            .get("property")
            .and_then(|p| p.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let other_info = att.get("otherInfo").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let att_duration = att.get("attDuration").and_then(|v| v.as_str()).unwrap_or("0").to_string();
        let att_duration_enc = att.get("attDurationEnc").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let video_face_capture_enc = att.get("videoFaceCaptureEnc").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let is_passed = att
            .get("isPassed")
            .and_then(|v| v.as_bool())
            .or_else(|| att.get("ispassed").and_then(|v| v.as_bool()))
            .or_else(|| att.get("passed").and_then(|v| v.as_bool()))
            .unwrap_or(false);
        videos.push(json!({
            "objectId": object_id,
            "jobid": jobid,
            "name": name,
            "otherInfo": other_info,
            "attDuration": att_duration,
            "attDurationEnc": att_duration_enc,
            "videoFaceCaptureEnc": video_face_capture_enc,
            "isPassed": is_passed,
        }));
    }

    Ok(json!({
        "success": true,
        "reportUrl": report_url,
        "report_url": report_url,
        "userid": defaults.get("userid").and_then(|v| v.as_str()).unwrap_or(""),
        "clazzId": defaults.get("clazzId").and_then(|v| v.as_str()).unwrap_or(clazz_id),
        "clazz_id": defaults.get("clazzId").and_then(|v| v.as_str()).unwrap_or(clazz_id),
        "fid": fid,
        "knowledge_id": knowledge_id,
        "course_id": course_id,
        "cpi": cpi,
        "videos": videos,
        "raw_defaults": defaults,
    }))
}

/// 获取视频文件状态（dtoken、duration等）
pub async fn chaoxing_get_video_status(
    client: &HbutClient,
    object_id: &str,
    fid: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let ts = chrono::Utc::now().timestamp_millis();
    let resp = client
        .client
        .get(&format!("https://mooc1.chaoxing.com/ananas/status/{}", object_id))
        .query(&[("k", fid), ("flag", "normal")])
        .query(&[("_dc", &ts.to_string())])
        .header("Referer", "https://mooc1.chaoxing.com/ananas/modules/video/index.html")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "获取视频状态失败").await?;
    Ok(json!({
        "success": true,
        "data": data,
    }))
}

/// 上报超星视频观看进度
pub async fn chaoxing_report_progress(
    client: &HbutClient,
    report_url: &str,
    dtoken: &str,
    clazz_id: &str,
    object_id: &str,
    jobid: &str,
    userid: &str,
    other_info: &str,
    playing_time: u64,
    duration: u64,
    isdrag: u8,
    video_face_capture_enc: &str,
    att_duration: &str,
    att_duration_enc: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let clip_time = format!("0_{}", duration);
    let enc = make_chaoxing_enc(
        clazz_id,
        userid,
        jobid,
        object_id,
        playing_time * 1000,
        duration * 1000,
        &clip_time,
    );
    let ts = chrono::Utc::now().timestamp_millis();
    // otherInfo 含 &courseId=xxx 作为 query param 的一部分（不能被 URL 编码）
    let url = format!(
        "{}/{}?clazzId={}&playingTime={}&duration={}&clipTime={}&objectId={}&otherInfo={}&jobid={}&userid={}&isdrag={}&view=pc&enc={}&rt=0.9&videoFaceCaptureEnc={}&dtype=Video&_t={}&attDuration={}&attDurationEnc={}&courseEngineInfo=false",
        report_url, dtoken, clazz_id, playing_time, duration, clip_time, object_id,
        other_info, jobid, userid, isdrag, enc, video_face_capture_enc, ts, att_duration, att_duration_enc
    );
    let resp = client
        .client
        .get(&url)
        .header("Referer", "https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "进度上报失败").await?;
    Ok(json!({
        "success": true,
        "data": data,
    }))
}

// ────────────────────────────────────────────────────────────
// 自动刷课 API —— 雨课堂
// ────────────────────────────────────────────────────────────

/// 获取雨课堂课程章节树
pub async fn yuketang_get_course_chapters(
    client: &HbutClient,
    classroom_id: &str,
    sign: &str,
) -> Result<Value, DynError> {
    if !has_yuketang_session(client) {
        return Err(err_box("当前没有可用的雨课堂会话，请先扫码登录雨课堂"));
    }
    let resp = client
        .client
        .get("https://changjiang.yuketang.cn/mooc-api/v1/lms/learn/course/chapter")
        .query(&[
            ("cid", classroom_id),
            ("sign", sign),
            ("term", "latest"),
            ("uv_id", classroom_id),
            ("classroom_id", classroom_id),
        ])
        .header("classroom-id", classroom_id)
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "获取雨课堂章节失败").await?;
    let chapter_data = data.get("data").cloned().unwrap_or_else(|| json!({}));

    // 提取视频叶节点
    let mut video_leaves = Vec::new();
    if let Some(chapters) = chapter_data.get("course_chapter").and_then(|v| v.as_array()) {
        for chapter in chapters {
            let chapter_name = chapter.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if let Some(sections) = chapter.get("section_leaf_list").and_then(|v| v.as_array()) {
                for section in sections {
                    let leaf_type = section.get("leaf_type").and_then(|v| v.as_i64()).unwrap_or(-1);
                    if leaf_type == 0 {
                        let leaf_id = section.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                        let leaf_name = section.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        if leaf_id > 0 {
                            video_leaves.push(json!({
                                "id": leaf_id,
                                "name": leaf_name,
                                "chapter": chapter_name,
                                "leaf_type": 0,
                            }));
                        }
                    }
                    if let Some(sub_leaves) = section.get("leaf_list").and_then(|v| v.as_array()) {
                        for leaf in sub_leaves {
                            let lt = leaf.get("leaf_type").and_then(|v| v.as_i64()).unwrap_or(-1);
                            if lt == 0 {
                                let lid = leaf.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                                let lname = leaf.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                if lid > 0 {
                                    video_leaves.push(json!({
                                        "id": lid,
                                        "name": lname,
                                        "chapter": chapter_name,
                                        "leaf_type": 0,
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "success": true,
        "chapters": chapter_data,
        "video_leaves": video_leaves,
    }))
}

/// 获取雨课堂叶节点详情（含 ccid、时长）
pub async fn yuketang_get_leaf_info(
    client: &HbutClient,
    classroom_id: &str,
    leaf_id: &str,
) -> Result<Value, DynError> {
    if !has_yuketang_session(client) {
        return Err(err_box("当前没有可用的雨课堂会话，请先扫码登录雨课堂"));
    }
    let resp = client
        .client
        .get(&format!(
            "https://changjiang.yuketang.cn/mooc-api/v1/lms/learn/leaf_info/{}/{}/",
            classroom_id, leaf_id
        ))
        .query(&[("term", "latest")])
        .header("classroom-id", classroom_id)
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "获取叶节点信息失败").await?;
    let leaf_data = data.get("data").cloned().unwrap_or_else(|| json!({}));

    // 提取关键字段
    let content_info = leaf_data.get("content_info").cloned().unwrap_or_else(|| json!({}));
    let media = content_info.get("media").cloned().unwrap_or_else(|| json!({}));
    let ccid = media.get("ccid").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let duration = media.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);

    Ok(json!({
        "success": true,
        "leaf_data": leaf_data,
        "ccid": ccid,
        "duration": duration,
    }))
}

/// 发送雨课堂心跳上报
pub async fn yuketang_send_heartbeat(
    client: &HbutClient,
    classroom_id: &str,
    events: &Value,
) -> Result<Value, DynError> {
    if !has_yuketang_session(client) {
        return Err(err_box("当前没有可用的雨课堂会话，请先扫码登录雨课堂"));
    }
    let body = json!({ "heart_data": events });
    let resp = client
        .client
        .post("https://changjiang.yuketang.cn/video-log/heartbeat/")
        .query(&[("classroom_id", classroom_id)])
        .header("classroom-id", classroom_id)
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    let data: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({}));
    Ok(json!({
        "success": status == 200,
        "status_code": status,
        "data": data,
    }))
}
