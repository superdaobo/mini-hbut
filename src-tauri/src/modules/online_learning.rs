use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::io;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose;
use base64::Engine;
use chrono::{Datelike, Local, Utc};
use futures::{SinkExt, StreamExt};
use qrcode::QrCode;
use reqwest::cookie::CookieStore;
use reqwest::cookie::Jar;
use reqwest::Url;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, protocol::Message},
};

use crate::db::{self, OnlineLearningPlatformStateRecord, OnlineLearningSyncRunRecord};
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
    let code =
        QrCode::new(url.as_bytes()).map_err(|e| err_box(format!("生成二维码失败: {}", e)))?;
    let svg = code
        .render::<qrcode::render::svg::Color>()
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
        "UID",
        "_uid",
        "fid",
        "cx_p_token",
        "p_auth_token",
        "xxtenc",
        "_d",
        "uf",
        "spaceFid",
        "spaceRoleId",
        "uname",
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
                                collected
                                    .entry(name.to_string())
                                    .or_insert_with(|| value.trim().to_string());
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
        let Ok(url) = Url::parse(domain_url) else {
            continue;
        };
        for pair in segment.split(';') {
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
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, student_id, PLATFORM_CHAOXING)
    {
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
        client
            .cookie_jar
            .add_cookie_str(&cookie_line, &chaoxing_url);
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

async fn ensure_portal_cas_session_ready(client: &mut HbutClient, student_id: &str) -> bool {
    let code_service = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
    let code_sso_url = format!(
        "{}/login?service={}",
        crate::http_client::AUTH_BASE_URL,
        urlencoding::encode(code_service)
    );
    println!(
        "[调试] 学习通会话重建：检查融合门户 CAS 会话 {}",
        code_sso_url
    );

    match client.client.get(&code_sso_url).send().await {
        Ok(resp) => {
            let final_url = resp.url().to_string();
            println!("[调试] 学习通会话重建：融合门户 CAS 检查跳转 {}", final_url);
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

/// 轻量探测：课程列表 API 是否可用（供 SSO 统一层使用，非 force 业务同步）
pub async fn chaoxing_session_probe_ready(client: &HbutClient) -> bool {
    check_chaoxing_course_api_ready(client).await
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
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
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
        (
            "fid".to_string(),
            pick_hidden_value(&hidden, &["fid"], "-1"),
        ),
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
        (
            "validate".to_string(),
            pick_hidden_value(&hidden, &["validate"], ""),
        ),
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
    let timer = crate::runtime_log::ScopedTimer::start("ChaoxingSession", "ensure_session_ready");
    crate::hbut_session_log!(
        "ChaoxingSession",
        "开始确保学习通会话 student_id={}",
        student_id
    );
    try_restore_chaoxing_session(client, student_id);
    if !has_chaoxing_full_session(client) {
        let _ = seed_chaoxing_cookie_from_jwxt(client);
    }
    if check_chaoxing_course_api_ready(client).await {
        crate::hbut_session_log!("ChaoxingSession", "会话已就绪（API 探测通过）");
        timer.finish(Some(json!({ "path": "already_ready" })));
        return true;
    }
    crate::hbut_session_log!("ChaoxingSession", "API 未就绪，尝试补票/桥接/重登…");
    if has_chaoxing_full_session(client) {
        crate::hbut_session_log!(
            "ChaoxingSession",
            "有完整 cookie，ensure_chaoxing_academic_session"
        );
        let _ = client.ensure_chaoxing_academic_session().await;
        if check_chaoxing_course_api_ready(client).await {
            crate::hbut_session_log!("ChaoxingSession", "补票后 API 就绪");
            timer.finish(Some(json!({ "path": "academic_session" })));
            return true;
        }
    } else if has_chaoxing_bridge_cookie(client) {
        crate::hbut_session_log!("ChaoxingSession", "仅有教务桥接 cookie，补票中");
        // 仅有教务域 Cookie 时，先执行一次补票，再继续走 CAS 重建。
        let _ = client.ensure_chaoxing_academic_session().await;
        if check_chaoxing_course_api_ready(client).await {
            crate::hbut_session_log!("ChaoxingSession", "教务桥接补票成功");
            timer.finish(Some(json!({ "path": "bridge_cookie" })));
            return true;
        }
    }

    if client.is_logged_in && client.try_bridge_cas_to_chaoxing().await {
        crate::hbut_session_log!("ChaoxingSession", "CAS→学习通桥接返回 true，探测 API");
        // 桥接后先直接检查 API —— FYSSO 链已设置 .chaoxing.com 域 UID cookie，
        // 可能不需要 ensure_chaoxing_academic_session（该函数会访问 i.chaoxing.com/base，
        // 在 FYSSO 桥接模式下 i.chaoxing.com 不识别会话会重定向到 passport2 登录页，
        // 可能反而清除好的 cookie）
        if check_chaoxing_course_api_ready(client).await {
            crate::hbut_session_log!("ChaoxingSession", "CAS 桥接后 API 就绪");
            timer.finish(Some(json!({ "path": "cas_bridge" })));
            return true;
        }
        let _ = client.ensure_chaoxing_academic_session().await;
        if check_chaoxing_course_api_ready(client).await {
            crate::hbut_session_log!("ChaoxingSession", "CAS 桥接+补票后 API 就绪");
            timer.finish(Some(json!({ "path": "cas_bridge_academic" })));
            return true;
        }
    }

    if ensure_portal_cas_session_ready(client, student_id).await {
        crate::hbut_session_log!(
            "ChaoxingSession",
            "融合门户 CAS 会话可用，重试 CAS→学习通桥接（重新登录路径）"
        );
        if client.try_bridge_cas_to_chaoxing().await {
            let _ = client.ensure_chaoxing_academic_session().await;
            if check_chaoxing_course_api_ready(client).await {
                crate::hbut_session_log!("ChaoxingSession", "门户 CAS 重登桥接成功");
                timer.finish(Some(json!({ "path": "portal_cas_relogin" })));
                return true;
            }
        }
    }

    let password = resolve_student_password(client, student_id).unwrap_or_default();

    crate::hbut_session_log!("ChaoxingSession", "尝试学习通账号密码补全票据（静默重登）");
    if password.trim().is_empty() {
        crate::hbut_session_log!(
            "ChaoxingSession",
            "缺少本地密码，无法执行学习通账号密码补全"
        );
        let ok = check_chaoxing_course_api_ready(client).await;
        timer.finish(Some(json!({ "path": "no_password", "ready": ok })));
        return ok;
    }
    match try_chaoxing_password_login(client, student_id, &password).await {
        Ok(_) => {
            crate::hbut_session_log!("ChaoxingSession", "学习通账号密码补全成功（已重新登录）");
            timer.finish(Some(json!({ "path": "password_relogin", "ok": true })));
            true
        }
        Err(e) => {
            crate::hbut_session_log!("ChaoxingSession", "学习通账号密码补全失败: {}", e);
            let ok = check_chaoxing_course_api_ready(client).await;
            timer.finish(Some(
                json!({ "path": "password_relogin", "ok": false, "ready": ok }),
            ));
            ok
        }
    }
}

/// 公开接口：为签到模块确保学习通会话就绪。
/// 复用 ensure_chaoxing_session_ready 的逻辑，但不要求课程 API 可用（签到只需要 UID cookie）。
/// 同时将关键 cookie 传播到 mobilelearn.chaoxing.com 域（签到 API 所在域）。
pub async fn ensure_chaoxing_session_for_checkin(
    client: &mut HbutClient,
    student_id: &str,
) -> bool {
    eprintln!(
        "[签到调试] ensure_chaoxing_session_for_checkin: student_id={}",
        student_id
    );
    try_restore_chaoxing_session(client, student_id);
    if has_chaoxing_full_session(client) {
        eprintln!("[签到调试] 学习通会话已就绪（从 DB 恢复或内存中已有）");
        propagate_chaoxing_cookies_for_checkin(client);
        return true;
    }
    eprintln!("[签到调试] 尝试从教务域 seed cookie...");
    let _ = seed_chaoxing_cookie_from_jwxt(client);
    if has_chaoxing_full_session(client) {
        eprintln!("[签到调试] seed 后会话就绪");
        propagate_chaoxing_cookies_for_checkin(client);
        return true;
    }
    // 尝试 CAS→学习通桥接
    eprintln!(
        "[签到调试] 尝试 CAS→学习通桥接, is_logged_in={}",
        client.is_logged_in
    );
    if client.is_logged_in && client.try_bridge_cas_to_chaoxing().await {
        if has_chaoxing_full_session(client) {
            eprintln!("[签到调试] CAS 桥接后会话就绪");
            propagate_chaoxing_cookies_for_checkin(client);
            return true;
        }
    }
    eprintln!("[签到调试] 所有尝试失败，会话未就绪");
    false
}

/// 将学习通关键 cookies 传播到签到 API 所需的域名（mobilelearn / mooc1-api / pan-yz）。
fn propagate_chaoxing_cookies_for_checkin(client: &HbutClient) {
    let source_urls = [
        "https://passport2.chaoxing.com",
        "https://i.chaoxing.com",
        "https://hbut.jw.chaoxing.com",
    ];
    let target_urls = [
        "https://mobilelearn.chaoxing.com",
        "https://mooc1-api.chaoxing.com",
        "https://pan-yz.chaoxing.com",
    ];
    let key_names: &[&str] = &[
        "UID",
        "_uid",
        "fid",
        "cx_p_token",
        "p_auth_token",
        "xxtenc",
        "_d",
        "uf",
        "spaceFid",
        "spaceRoleId",
        "uname",
        "sso_puid",
        "KI4SO_SERVER_EC",
        "_tid",
        "DSSTASH_LOG",
    ];

    let mut collected: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for src in &source_urls {
        if let Ok(url) = Url::parse(src) {
            if let Some(header) = client.cookie_jar.cookies(&url) {
                if let Ok(s) = header.to_str() {
                    for pair in s.split(';') {
                        let pair = pair.trim();
                        if let Some((name, value)) = pair.split_once('=') {
                            let name = name.trim();
                            if key_names.iter().any(|k| k.eq_ignore_ascii_case(name)) {
                                collected
                                    .entry(name.to_string())
                                    .or_insert_with(|| value.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    if collected.is_empty() {
        eprintln!("[签到调试] propagate_chaoxing_cookies_for_checkin: 无可传播的 cookie");
        return;
    }

    eprintln!(
        "[签到调试] propagate_chaoxing_cookies_for_checkin: 传播 {} 个 cookie 到签到域",
        collected.len()
    );

    for target in &target_urls {
        if let Ok(target_url) = Url::parse(target) {
            for (name, value) in &collected {
                let cookie_str = format!("{}={}; Path=/; Domain=.chaoxing.com", name, value);
                client.cookie_jar.add_cookie_str(&cookie_str, &target_url);
            }
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
        .or_else(|| {
            payload
                .get("data")
                .and_then(|v| v.as_array())
                .map(|v| v.len())
        })
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
    let states =
        db::list_online_learning_platform_states(crate::DB_FILENAME, &sid).unwrap_or_default();
    let mut state_map: HashMap<String, OnlineLearningPlatformStateRecord> = HashMap::new();
    for item in states {
        state_map.insert(item.platform.clone(), item);
    }

    let chaoxing_state = state_map.get(PLATFORM_CHAOXING);
    let yuketang_state = state_map.get(PLATFORM_YUKETANG);
    let chaoxing_course_cache = read_cache(CACHE_CHAOXING_COURSES, &cache_key(&sid, "courses"));
    let yuketang_course_cache = read_cache(CACHE_YUKETANG_COURSES, &cache_key(&sid, "courses"));
    let recent_runs =
        db::list_online_learning_sync_runs(crate::DB_FILENAME, &sid, None, 10).unwrap_or_default();

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
                    outputs.push(
                        json!({ "platform": key, "success": false, "error": error.to_string() }),
                    );
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

pub fn clear_online_learning_cache(
    student_id: &str,
    platform: Option<&str>,
) -> Result<Value, DynError> {
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
    let _ = db::clear_online_learning_platform_state(
        crate::DB_FILENAME,
        sid,
        clear_platform.as_deref(),
    );
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
    let persisted =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_CHAOXING)
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

/// 从课程字段推断学期标签
fn guess_semester_label(content: &Value, item: &Value, course_data: Option<&Value>) -> String {
    // 直接字段
    for path in [
        content.get("semester"),
        content.get("term"),
        content.get("yearterm"),
        item.get("semester"),
        course_data.and_then(|c| c.get("semester")),
        course_data.and_then(|c| c.get("appinfo")),
    ] {
        if let Some(s) = path.and_then(|v| v.as_str()) {
            let t = s.trim();
            if !t.is_empty() && t.len() < 40 {
                // appinfo 可能是 HTML 描述，跳过太长的
                if t.contains("年") || t.contains("学期") || t.contains("-") {
                    return sanitize_text(t);
                }
            }
        }
    }
    // 起止日期 → 学年学期
    let date_raw = content
        .get("begindate")
        .or_else(|| content.get("startDate"))
        .or_else(|| content.get("starttime"))
        .or_else(|| course_data.and_then(|c| c.get("startDate")))
        .or_else(|| course_data.and_then(|c| c.get("begindate")))
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
                .or_else(|| v.as_u64().map(|n| n.to_string()))
        })
        .unwrap_or_default();
    if let Some(label) = semester_from_date_str(&date_raw) {
        return label;
    }
    // 已结束标记
    let ended = content
        .get("isFiled")
        .and_then(|v| v.as_bool())
        .or_else(|| {
            content
                .get("state")
                .and_then(|v| v.as_i64())
                .map(|n| n == 1)
        })
        .unwrap_or(false);
    if ended {
        "历史课程".into()
    } else {
        "本学期".into()
    }
}

fn semester_from_date_str(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    // 毫秒时间戳
    if let Ok(ms) = s.parse::<i64>() {
        if ms > 1_000_000_000_000 {
            let secs = ms / 1000;
            if let Some(dt) = chrono::DateTime::from_timestamp(secs, 0) {
                let y = dt.year();
                let m = dt.month();
                return Some(if m >= 8 || m <= 1 {
                    format!("{}-{} 第一学期", y, y + 1)
                } else {
                    format!("{}-{} 第二学期", y - 1, y)
                });
            }
        }
    }
    // YYYY-MM-DD / YYYY/MM
    let re = regex::Regex::new(r"(\d{4})\D+(\d{1,2})").ok()?;
    let cap = re.captures(s)?;
    let y: i32 = cap.get(1)?.as_str().parse().ok()?;
    let m: u32 = cap.get(2)?.as_str().parse().ok()?;
    Some(if m >= 8 || m <= 1 {
        format!("{}-{} 第一学期", y, y + 1)
    } else {
        format!("{}-{} 第二学期", y - 1, y)
    })
}

/// 从课程文件夹 HTML 补充历史学期课程
async fn fetch_chaoxing_folder_courses(
    client: &HbutClient,
    seen: &mut HashSet<String>,
) -> Result<Vec<Value>, DynError> {
    propagate_chaoxing_key_cookies(client);
    let mut out = Vec::new();

    // 1) 交互页 + API 抽 folder id（多学期依赖课程夹）
    let mut folder_ids: Vec<(String, String)> = vec![("0".into(), "本学期".into())];
    let mut push_folder = |id: String, name: String| {
        let id = id.trim().to_string();
        if id.is_empty() {
            return;
        }
        if folder_ids.iter().any(|(i, _)| i == &id) {
            return;
        }
        let name = sanitize_text(&name);
        folder_ids.push((
            id,
            if name.is_empty() {
                "历史课程".into()
            } else {
                name
            },
        ));
    };

    // API：课程夹列表（比 HTML 正则更稳）
    for api in [
        "https://mooc1-api.chaoxing.com/mycourse/getCourseFolders?view=json",
        "https://mooc1.chaoxing.com/mooc-ans/visit/coursefolders?view=json",
        "https://mooc1-api.chaoxing.com/gas/folder?view=json",
    ] {
        if let Ok(resp) = client
            .client
            .get(api)
            .header("Accept", "application/json, text/plain, */*")
            .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
            .timeout(Duration::from_secs(12))
            .send()
            .await
        {
            if let Ok(v) = resp.json::<Value>().await {
                let arr = v
                    .get("data")
                    .and_then(|d| d.as_array())
                    .or_else(|| v.get("channelList").and_then(|d| d.as_array()))
                    .or_else(|| v.get("folderList").and_then(|d| d.as_array()))
                    .or_else(|| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                for item in arr {
                    let id = item
                        .get("id")
                        .or_else(|| item.get("folderId"))
                        .or_else(|| item.get("courseFolderId"))
                        .or_else(|| item.get("cfid"))
                        .map(|x| match x {
                            Value::Number(n) => n.to_string(),
                            Value::String(s) => s.clone(),
                            _ => String::new(),
                        })
                        .unwrap_or_default();
                    let name = item
                        .get("name")
                        .or_else(|| item.get("folderName"))
                        .or_else(|| item.get("title"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    push_folder(id, name);
                }
            }
        }
    }

    if let Ok(resp) = client
        .client
        .get("https://mooc1.chaoxing.com/mooc-ans/visit/interaction")
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Referer", "https://i.chaoxing.com/")
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        let html = resp.text().await.unwrap_or_default();
        // courseFolderId=123 / data-id="123" 课程夹
        let re_folder = regex::Regex::new(
            r#"courseFolderId[=:\s"']+(\d+)[^>]{0,200}?(?:title|data-name|folderName)[=:\s"']+([^"'<]{1,40})"#,
        )
        .ok();
        let re_folder2 =
            regex::Regex::new(r#"(?i)(?:folderid|courseFolderId|cfid)["'=\s:]+(\d+)"#).ok();
        let re_folder3 = regex::Regex::new(
            r#"(?i)data-(?:id|folderid|cfid)="(\d+)"[^>]{0,120}?(?:title|data-name)="([^"]{1,40})""#,
        )
        .ok();
        if let Some(re) = re_folder {
            for cap in re.captures_iter(&html) {
                let id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let name = cap.get(2).map(|m| m.as_str()).unwrap_or("历史").to_string();
                if id != "0" {
                    push_folder(id, name);
                }
            }
        }
        if let Some(re) = re_folder2 {
            for cap in re.captures_iter(&html) {
                let id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                push_folder(id, "历史课程".into());
            }
        }
        if let Some(re) = re_folder3 {
            for cap in re.captures_iter(&html) {
                let id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let name = cap.get(2).map(|m| m.as_str()).unwrap_or("历史").to_string();
                push_folder(id, name);
            }
        }
        // 常见：本学期 + 往年夹 1..N 试探（部分账号 HTML 不暴露 id）
        for probe in 1..=8 {
            push_folder(probe.to_string(), format!("课程夹 {probe}"));
        }
    }

    // 去重 folder，最多扫 16 个
    folder_ids.sort_by(|a, b| a.0.cmp(&b.0));
    folder_ids.dedup_by(|a, b| a.0 == b.0);
    folder_ids.truncate(16);

    for (folder_id, folder_name) in folder_ids {
        let body = format!("courseType=1&courseFolderId={folder_id}&superstarClass=0");
        let resp = match client
            .client
            .post("https://mooc1.chaoxing.com/mooc-ans/visit/courselistdata")
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .header("Accept", "text/html, */*")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            )
            .body(body)
            .timeout(Duration::from_secs(15))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };
        let html = resp.text().await.unwrap_or_default();
        // 课程卡片：courseid / clazzid / cpi
        let re_card = regex::Regex::new(
            r#"(?i)(?:courseid|courseId)=(\d+)[^"'>\s]{0,80}?(?:clazzid|classId)=(\d+)[^"'>\s]{0,80}?(?:cpi)=(\d+)"#,
        )
        .ok();
        let re_name = regex::Regex::new(r#"(?i)class="[^"]*course-name[^"]*"[^>]*>([^<]{1,80})<"#)
            .ok()
            .or_else(|| regex::Regex::new(r#"(?i)title="([^"]{2,80})""#).ok());

        let mut names: Vec<String> = Vec::new();
        if let Some(rn) = re_name.as_ref() {
            for cap in rn.captures_iter(&html) {
                let n = sanitize_text(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
                if !n.is_empty() {
                    names.push(n);
                }
            }
        }

        if let Some(re) = re_card {
            for (idx, cap) in re.captures_iter(&html).enumerate() {
                let course_id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let clazz_id = cap.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
                let cpi = cap.get(3).map(|m| m.as_str()).unwrap_or("").to_string();
                let key = format!("{course_id}:{clazz_id}");
                if course_id.is_empty() || clazz_id.is_empty() || !seen.insert(key.clone()) {
                    continue;
                }
                let name = names
                    .get(idx)
                    .cloned()
                    .unwrap_or_else(|| format!("课程 {course_id}"));
                let semester = if folder_id == "0" {
                    "本学期".to_string()
                } else if folder_name.contains("学期") || folder_name.contains("年") {
                    folder_name.clone()
                } else {
                    folder_name.clone()
                };
                let course_url = format!(
                    "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={course_id}&chapterId=0&clazzid={clazz_id}&cpi={cpi}&mooc2=1&isMicroCourse=false"
                );
                out.push(json!({
                    "id": key,
                    "course_id": course_id,
                    "clazz_id": clazz_id,
                    "cpi": cpi,
                    "name": name,
                    "title": name,
                    "teacher": "",
                    "image_url": "",
                    "course_url": course_url,
                    "role_type": 3,
                    "role_label": "student",
                    "auto_supported": true,
                    "semester": semester,
                    "folder_id": folder_id,
                    "source": "courselistdata",
                }));
            }
        }
    }

    Ok(out)
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
                .or_else(|| {
                    value
                        .get("data")
                        .and_then(|data| data.get("channelList"))
                        .and_then(|v| v.as_array())
                        .cloned()
                })
                .or_else(|| value.get("courseList").and_then(|v| v.as_array()).cloned())
                .or_else(|| {
                    value
                        .get("data")
                        .and_then(|data| data.get("courseList"))
                        .and_then(|v| v.as_array())
                        .cloned()
                })
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
                let roletype = content
                    .get("roletype")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(3);
                // 获取课程核心数据（区分创建者 roletype=1 和学生 roletype=3）
                let course_data = content
                    .get("course")
                    .and_then(|c| c.get("data"))
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first());
                let (name, course_id, teacher, image_url) = if let Some(cd) = course_data {
                    // 学生视角：从 course.data[0] 提取
                    let n = sanitize_text(cd.get("name").and_then(|v| v.as_str()).unwrap_or(""));
                    let cid = cd
                        .get("id")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default();
                    let t = sanitize_text(
                        cd.get("teacherfactor")
                            .and_then(|v| v.as_str())
                            .unwrap_or(""),
                    );
                    let img = cd
                        .get("imageurl")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    (n, cid, t, img)
                } else {
                    // 创建者视角或扁平格式
                    let n = sanitize_text(
                        content
                            .get("name")
                            .and_then(|v| v.as_str())
                            .or_else(|| item.get("name").and_then(|v| v.as_str()))
                            .unwrap_or(""),
                    );
                    let cid = content
                        .get("id")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .or_else(|| {
                            item.get("courseid")
                                .map(|v| v.to_string().trim_matches('"').to_string())
                        })
                        .unwrap_or_default();
                    let t = sanitize_text(
                        content
                            .get("teacherfactor")
                            .and_then(|v| v.as_str())
                            .or_else(|| item.get("teacherfactor").and_then(|v| v.as_str()))
                            .unwrap_or(""),
                    );
                    let img = content
                        .get("imageurl")
                        .and_then(|v| v.as_str())
                        .or_else(|| item.get("imageurl").and_then(|v| v.as_str()))
                        .unwrap_or("")
                        .to_string();
                    (n, cid, t, img)
                };
                // clazzId：学生视角从 content.id，创建者视角从 content.clazz[0].clazzId
                let clazz_id = if roletype == 1 {
                    content
                        .get("clazz")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|c| c.get("clazzId"))
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default()
                } else {
                    content
                        .get("id")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .or_else(|| {
                            item.get("clazzid")
                                .map(|v| v.to_string().trim_matches('"').to_string())
                        })
                        .unwrap_or_default()
                };
                let cpi = item
                    .get("cpi")
                    .or_else(|| content.get("cpi"))
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .unwrap_or_default();
                let key = format!("{}:{}", course_id, clazz_id);
                if course_id.is_empty() || clazz_id.is_empty() || !seen.insert(key.clone()) {
                    continue;
                }
                // 显示名称：优先使用班级名（含段号信息），其次课程名
                let display_name = content
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let final_name = if !name.is_empty() {
                    name.clone()
                } else {
                    sanitize_text(&display_name)
                };
                let course_url = format!(
                    "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={}&chapterId=0&clazzid={}&cpi={}&mooc2=1&isMicroCourse=false",
                    course_id, clazz_id, cpi
                );
                // 学期标签：优先班级时间 / 课程字段
                let semester = guess_semester_label(content, &item, course_data);
                courses.push(json!({
                    "id": key,
                    "course_id": course_id,
                    "clazz_id": clazz_id,
                    "cpi": cpi,
                    "name": final_name,
                    "title": final_name,
                    "teacher": teacher,
                    "image_url": image_url,
                    "course_url": course_url,
                    "role_type": roletype,
                    "role_label": if roletype == 1 { "teacher" } else { "student" },
                    "auto_supported": roletype != 1,
                    "semester": semester,
                    "folder_id": 0,
                    "source": "backclazzdata",
                }));
            }
            println!(
                "[调试] backclazzdata channelList={}, parsed courses={}",
                list_len,
                courses.len()
            );

            // 再拉课程文件夹（历史学期），合并去重
            if let Ok(extra) = fetch_chaoxing_folder_courses(client, &mut seen).await {
                for c in extra {
                    courses.push(c);
                }
            }

            let mut semesters: Vec<String> = courses
                .iter()
                .filter_map(|c| {
                    c.get("semester")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .collect();
            semesters.sort();
            semesters.dedup();
            // 本学期优先
            if let Some(pos) = semesters.iter().position(|s| s == "本学期") {
                let cur = semesters.remove(pos);
                semesters.insert(0, cur);
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
                "semesters": semesters,
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
    let outline =
        fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, course_url).await?;
    let nodes = outline
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let total_count = nodes.len();
    let completed_count = nodes
        .iter()
        .filter(|item| {
            item.get("completed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
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
        let role_type = course
            .get("role_type")
            .and_then(|v| v.as_u64())
            .unwrap_or(3);
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
            total_pending += write_chaoxing_course_progress_fallback(
                &mut course,
                role_type,
                Some("课程标识缺失"),
            );
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
    let timer = crate::runtime_log::ScopedTimer::start("ChaoxingCourses", "fetch_courses");
    let sid = resolve_student_id(client, student_id)?;
    let cache_id = cache_key(&sid, "courses");

    // 优先读缓存：避免每次进课程中心都走 ensure_session + 远程拉取
    if !force {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
            let count = cached
                .get("courses")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            if count > 0 {
                crate::hbut_session_log!(
                    "ChaoxingCourses",
                    "命中缓存 {} 门课 force=false，跳过会话探测与远程拉取",
                    count
                );
                timer.finish(Some(json!({ "from_cache": true, "count": count })));
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
        }
    } else {
        crate::hbut_session_log!("ChaoxingCourses", "强制刷新 force=true");
    }

    let session_ready = ensure_chaoxing_session_ready(client, &sid).await;
    if !session_ready {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
            crate::hbut_session_log!("ChaoxingCourses", "会话未就绪，回退缓存课程");
            timer.finish(Some(json!({ "from_cache": true, "session_ready": false })));
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
        timer.finish(Some(json!({ "session_ready": false, "empty": true })));
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
            let (courses, pending_count) =
                enrich_chaoxing_courses_with_progress(client, &sid, raw_courses, force, true).await;
            let enriched = json!({
                "success": true,
                "courses": courses,
                "semesters": payload.get("semesters").cloned().unwrap_or(json!([])),
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
            crate::hbut_session_log!(
                "ChaoxingCourses",
                "远程拉取完成 count={} pending={}",
                courses.len(),
                pending_count
            );
            timer.finish(Some(json!({ "from_cache": false, "count": courses.len() })));
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
            crate::hbut_session_log!("ChaoxingCourses", "远程拉取失败: {}", error);
            if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
                timer.finish(Some(json!({ "from_cache": true, "remote_error": true })));
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            timer.fail(error.to_string());
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
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
        .send()
        .await?;
    let final_url = resp.url().to_string();
    let html = resp.text().await?;
    if final_url.contains("/login") {
        return Err(err_box("学习通会话已失效，请重新登录"));
    }

    // 生产路径：与单测共用 assemble_chaoxing_outline_from_html / extract_chaoxing_catalog_leaves
    assemble_chaoxing_outline_from_html(&html, course_id, clazz_id, cpi, &target)
}

/// 从章节 HTML 组装大纲（生产 fetch_chaoxing_outline_remote + 单测共用）
pub fn assemble_chaoxing_outline_from_html(
    html: &str,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: &str,
) -> Result<Value, DynError> {
    let re_section = regex::Regex::new(
        r#"(?i)(?:posCatalog_select\s+firstLayer|firstLayer)[^>]*id="(\d+)"[\s\S]{0,500}?title="([^"]+)""#,
    )
    .expect("regex section");
    let re_section_alt =
        regex::Regex::new(r#"(?i)class="[^"]*catalog_name[^"]*"[^>]*>([^<]{1,80})<"#).ok();

    let mut section_marks: Vec<(usize, String, String)> = Vec::new();
    for cap in re_section.captures_iter(html) {
        let pos = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let sid = cap[1].to_string();
        let title = cap[2].trim().to_string();
        if !title.is_empty() {
            section_marks.push((pos, sid, title));
        }
    }
    if section_marks.is_empty() {
        if let Some(re) = re_section_alt.as_ref() {
            for (i, cap) in re.captures_iter(html).enumerate() {
                let title = cap[1].trim().to_string();
                if title.is_empty() {
                    continue;
                }
                section_marks.push((
                    cap.get(0).map(|m| m.start()).unwrap_or(0),
                    format!("sec{i}"),
                    title,
                ));
            }
        }
    }

    let raw_leaves = extract_chaoxing_catalog_leaves(html);
    let mut leaves: Vec<(usize, Value)> = Vec::new();
    for (pos, knowledge_id, title, cap_course_id, cap_clazz_id, cur_id) in raw_leaves {
        let chapter_id = if cur_id.is_empty() {
            knowledge_id.clone()
        } else {
            cur_id
        };
        let cid = if cap_course_id.is_empty() {
            course_id.to_string()
        } else {
            cap_course_id
        };
        let clz = if cap_clazz_id.is_empty() {
            clazz_id.to_string()
        } else {
            cap_clazz_id
        };
        leaves.push((
            pos,
            json!({
                "id": knowledge_id.clone(),
                "title": title.clone(),
                "name": title,
                "course_id": cid,
                "clazz_id": clz,
                "cpi": cpi,
                "chapter_id": chapter_id,
                "knowledge_id": knowledge_id,
                "completed": false,
                "task_type": "knowledge",
                "type": "knowledge",
                "children": [],
                "tasks": []
            }),
        ));
    }

    println!(
        "[调试] 章节解析: sections={} leaves={}",
        section_marks.len(),
        leaves.len()
    );

    if leaves.is_empty() {
        return Err(err_box(
            "未解析到可展开的小节。请尝试刷新章节，或重新登录学习通后再打开该课程",
        ));
    }

    let mut sections: Vec<Value> = Vec::new();
    if section_marks.is_empty() {
        let tasks: Vec<Value> = leaves.into_iter().map(|(_, v)| v).collect();
        let total = tasks.len();
        sections.push(json!({
            "id": "all",
            "title": "全部章节",
            "tasks": tasks,
            "children": []
        }));
        return Ok(json!({
            "success": true,
            "sections": sections,
            "nodes": sections[0]["tasks"].clone(),
            "total_count": total,
            "completed_count": 0,
            "pending_count": total,
            "course_id": course_id,
            "clazz_id": clazz_id,
            "cpi": cpi,
            "course_url": course_url
        }));
    }

    for (idx, (pos, sid, title)) in section_marks.iter().enumerate() {
        let next_pos = section_marks
            .get(idx + 1)
            .map(|(p, _, _)| *p)
            .unwrap_or(usize::MAX);
        let tasks: Vec<Value> = leaves
            .iter()
            .filter(|(p, _)| *p >= *pos && *p < next_pos)
            .map(|(_, v)| v.clone())
            .collect();
        sections.push(json!({
            "id": sid,
            "title": title,
            "tasks": tasks,
            "children": []
        }));
    }

    let any_tasks = sections.iter().any(|s| {
        s.get("tasks")
            .and_then(|t| t.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false)
    });
    if !any_tasks && !leaves.is_empty() {
        let tasks: Vec<Value> = leaves.iter().map(|(_, v)| v.clone()).collect();
        sections = vec![json!({
            "id": "all",
            "title": "全部章节",
            "tasks": tasks,
            "children": []
        })];
    } else if any_tasks {
        let first_pos = section_marks[0].0;
        let orphan: Vec<Value> = leaves
            .iter()
            .filter(|(p, _)| *p < first_pos)
            .map(|(_, v)| v.clone())
            .collect();
        if !orphan.is_empty() {
            sections.insert(
                0,
                json!({
                    "id": "intro",
                    "title": "导学",
                    "tasks": orphan,
                    "children": []
                }),
            );
        }
    }

    let mut total_count = 0usize;
    for sec in &sections {
        if let Some(arr) = sec.get("tasks").and_then(|v| v.as_array()) {
            total_count += arr.len();
        }
    }

    Ok(json!({
        "success": true,
        "sections": sections,
        "nodes": sections
            .iter()
            .flat_map(|s| s.get("tasks").and_then(|t| t.as_array()).cloned().unwrap_or_default())
            .collect::<Vec<_>>(),
        "total_count": total_count,
        "completed_count": 0,
        "pending_count": total_count,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "course_url": course_url
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
    match fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, req.course_url.as_deref())
        .await
    {
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
    if let Some(raw) = req
        .launch_url
        .as_ref()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
    {
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
    ws_request.headers_mut().insert(
        "Origin",
        HeaderValue::from_static("https://changjiang.yuketang.cn"),
    );
    ws_request.headers_mut().insert(
        "User-Agent",
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    );
    let (mut ws_stream, _) =
        tokio::time::timeout(Duration::from_secs(20), connect_async(ws_request))
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
                let msg = payload
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("雨课堂登录服务返回错误");
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
            let Ok(payload) = serde_json::from_str::<Value>(message.to_text().unwrap_or("{}"))
            else {
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
                    let auth = payload
                        .get("Auth")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let user_id = payload
                        .get("UserID")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
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
                        Ok(resp) => match read_json_response(resp, "完成雨课堂登录失败").await
                        {
                            Ok(login_value) => {
                                let success = login_value
                                    .get("success")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
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
                                finish_with(
                                    "confirmed",
                                    "雨课堂登录成功".to_string(),
                                    Some(account_id),
                                );
                            }
                            Err(error) => finish_with("failed", error.to_string(), None),
                        },
                        Err(error) => {
                            finish_with("failed", format!("完成雨课堂登录失败: {}", error), None)
                        }
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
        return Ok(crate::attach_sync_time(
            json!({
                "success": true,
                "session_id": session_id,
                "status": "expired",
                "message": "登录会话不存在或已过期"
            }),
            &now_sync_time(),
            false,
        ));
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
        return Ok(crate::attach_sync_time(
            json!({
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
            }),
            &now_sync_time(),
            false,
        ));
    }
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    if output.status != "confirmed" && has_yuketang_session(client) {
        let cookie_blob = yuketang_cookie_blob(client);
        if !cookie_blob.trim().is_empty() {
            save_platform_state(
                &sid,
                PLATFORM_YUKETANG,
                true,
                parse_cookie_value(&cookie_blob, "university_id")
                    .unwrap_or_else(|| output.account_id.clone()),
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
    Ok(crate::attach_sync_time(
        json!({
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
        }),
        &now_sync_time(),
        false,
    ))
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
            value
                .get("errmsg")
                .and_then(|v| v.as_str())
                .unwrap_or("获取雨课堂课程列表失败"),
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
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
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
                parse_cookie_value(&yuketang_cookie_blob(client), "university_id")
                    .unwrap_or_default(),
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
            if err_msg.contains("401")
                || err_msg.contains("Unauthorized")
                || err_msg.contains("认证")
                || err_msg.contains("登录")
            {
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
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
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
            let chapter_name = chapter
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(section_list) = chapter.get("section_leaf_list").and_then(|v| v.as_array())
            {
                for section in section_list {
                    let section_name = section
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
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
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
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
        .get(format!(
            "https://changjiang.yuketang.cn/v2/api/web/classrooms/{}",
            classroom_id
        ))
        .query(&[("role", "5")])
        .header("classroom-id", classroom_id)
        .send()
        .await?;
    let classroom_value = read_json_response(classroom_resp, "获取雨课堂课堂详情失败").await?;
    let classroom_data = classroom_value
        .get("data")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let sku_id = req
        .sku_id
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .or_else(|| {
            classroom_data
                .get("course_sku_id")
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string())
        })
        .or_else(|| {
            classroom_data
                .get("sku_id")
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string())
        })
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
        detail_value
            .get("data")
            .cloned()
            .unwrap_or_else(|| json!({}))
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
        clazz_id,
        userid,
        jobid,
        object_id,
        playing_time_ms,
        CHAOXING_ENC_SALT,
        duration_ms,
        clip_time
    );
    format!("{:x}", md5::compute(raw.as_bytes()))
}

/// 从 HTML 中按括号匹配提取 `mArg = {...}`（非贪婪正则会截断嵌套 JSON）
fn extract_balanced_object_after(html: &str, after: usize) -> Option<String> {
    let bytes = html.as_bytes();
    let mut i = after;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b'{' {
        return None;
    }
    let begin = i;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_str = false;
            }
        } else {
            match c {
                '"' => in_str = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(html[begin..=i].to_string());
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

fn extract_m_arg_json(html: &str) -> Option<String> {
    // 多处 mArg / AttachmentSetting；跳过注释或残缺片段
    let keys = ["mArg", "AttachmentSetting", "attachmentSetting"];
    for key in keys {
        let mut search_from = 0usize;
        while let Some(rel) = html[search_from..].find(key) {
            let pos = search_from + rel;
            let after_key = pos + key.len();
            // 允许 mArg = / mArg= / mArg=
            let rest = html.get(after_key..).unwrap_or("");
            let trimmed = rest.trim_start();
            if !trimmed.starts_with('=') {
                search_from = after_key;
                continue;
            }
            let eq_off = rest.len() - trimmed.len();
            let after_eq = after_key + eq_off + 1; // skip '='
            if let Some(obj) = extract_balanced_object_after(html, after_eq) {
                // 必须像 JSON 对象
                if obj.contains("attachments") || obj.contains("defaults") || obj.len() > 40 {
                    return Some(obj);
                }
            }
            search_from = after_key;
        }
    }
    None
}

/// 从 knowledge/cards HTML 中兜底抠 objectId / jobid
fn scrape_tasks_from_cards_html(html: &str, knowledge_id: &str) -> Vec<Value> {
    let mut tasks = Vec::new();
    let mut seen = HashSet::new();
    // objectid 常见写法
    let re_oid =
        regex::Regex::new(r#"(?i)(?:objectid|objectId|object_id)["'\s:=]+([a-f0-9]{16,})"#).ok();
    let re_job = regex::Regex::new(r#"(?i)(?:jobid|jobId)["'\s:=]+([a-zA-Z0-9_\-]+)"#).ok();
    let re_name = regex::Regex::new(r#""name"\s*:\s*"([^"]{1,120})""#).ok();

    if let Some(re) = re_oid {
        for (idx, cap) in re.captures_iter(html).enumerate() {
            let oid = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
            if oid.is_empty() || !seen.insert(oid.clone()) {
                continue;
            }
            let jobid = re_job
                .as_ref()
                .and_then(|rj| rj.captures_iter(html).nth(idx))
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                .unwrap_or_default();
            let name = re_name
                .as_ref()
                .and_then(|rn| rn.captures_iter(html).nth(idx))
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                .unwrap_or_else(|| format!("视频 {}", idx + 1));
            tasks.push(json!({
                "id": if jobid.is_empty() { format!("{knowledge_id}-{idx}") } else { jobid.clone() },
                "title": name,
                "name": name,
                "type": "video",
                "task_type": "video",
                "objectId": oid.clone(),
                "object_id": oid,
                "jobid": jobid,
                "module": "insertvideo",
                "otherInfo": "",
                "attDuration": "0",
                "attDurationEnc": "",
                "videoFaceCaptureEnc": "",
                "isPassed": false,
                "completed": false,
                "status": "未完成",
            }));
            if tasks.len() >= 30 {
                break;
            }
        }
    }
    tasks
}

fn json_str_field(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
        // 数字 id 也兼容
        if let Some(n) = v.get(*k).and_then(|x| x.as_i64()) {
            return n.to_string();
        }
        if let Some(n) = v.get(*k).and_then(|x| x.as_u64()) {
            return n.to_string();
        }
    }
    String::new()
}

fn json_str_pointer(v: &Value, paths: &[&str]) -> String {
    for p in paths {
        if let Some(s) = v.pointer(p).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
        if let Some(n) = v.pointer(p).and_then(|x| x.as_i64()) {
            return n.to_string();
        }
    }
    String::new()
}

fn prefer_https_url(url: &str) -> String {
    let t = url.trim();
    if t.starts_with("http://") {
        format!("https://{}", &t[7..])
    } else {
        t.to_string()
    }
}

fn collect_play_urls(data: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let push = |list: &mut Vec<String>, raw: &str| {
        let u = prefer_https_url(raw);
        if u.is_empty() || !u.starts_with("http") {
            return;
        }
        if !list.iter().any(|x| x == &u) {
            list.push(u);
        }
    };
    // 优先高清 / https 直链
    for key in [
        "https", "hd", "http", "download", "play_url", "url", "mp3", "cdn", "sd",
    ] {
        if let Some(s) = data.get(key).and_then(|v| v.as_str()) {
            push(&mut out, s);
        }
    }
    out
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
    if knowledge_id.trim().is_empty() {
        return Err(err_box("knowledge_id 为空"));
    }

    // mooc1 域需要从其它域传播 cookie
    propagate_chaoxing_key_cookies(client);

    let study_referer = format!(
        "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudy?chapterId={knowledge_id}&courseId={course_id}&clazzid={clazz_id}&cpi={cpi}&mooc2=1"
    );

    // 预热学生页（部分课程要先打开 studentstudy 才出 mArg）
    let _ = client
        .client
        .get(&study_referer)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    let card_bases = [
        "https://mooc1.chaoxing.com/mooc-ans/knowledge/cards",
        "https://mooc1.chaoxing.com/knowledge/cards",
        "https://mooc1-api.chaoxing.com/knowledge/cards",
    ];

    let mut all_attachments: Vec<Value> = Vec::new();
    let mut defaults = json!({});
    let mut pages_fetched = 0u32;
    let mut last_html = String::new();
    let mut used_base = card_bases[0].to_string();

    'bases: for base in card_bases {
        all_attachments.clear();
        defaults = json!({});
        for num in 0..16 {
            let num_s = num.to_string();
            let resp = match client
                .client
                .get(base)
                .query(&[
                    ("clazzid", clazz_id),
                    ("courseid", course_id),
                    ("knowledgeid", knowledge_id),
                    ("num", num_s.as_str()),
                    ("ut", "s"),
                    ("cpi", cpi),
                    ("v", "2025-0424-1038-3"),
                    ("mooc2", "1"),
                    ("isMicroCourse", "false"),
                    ("editorPreview", "0"),
                ])
                .header("Referer", &study_referer)
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                )
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .timeout(Duration::from_secs(15))
                .send()
                .await
            {
                Ok(r) => r,
                Err(_) => break,
            };
            let html = resp.text().await.unwrap_or_default();
            pages_fetched += 1;
            last_html = html.clone();
            used_base = base.to_string();

            let Some(marg_json) = extract_m_arg_json(&html) else {
                if num == 0 {
                    break; // 换下一个 base
                }
                break;
            };
            let marg: Value = match serde_json::from_str(&marg_json) {
                Ok(v) => v,
                Err(_) => {
                    if num == 0 {
                        break;
                    }
                    break;
                }
            };

            if num == 0 {
                defaults = marg.get("defaults").cloned().unwrap_or_else(|| json!({}));
            }
            let page_atts = marg
                .get("attachments")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            if page_atts.is_empty() {
                // num=0 无附件也算成功解析，停止翻页
                break;
            }
            for att in page_atts {
                all_attachments.push(att);
            }
        }
        if !all_attachments.is_empty()
            || !defaults.is_null() && defaults.as_object().map(|o| !o.is_empty()).unwrap_or(false)
        {
            break 'bases;
        }
    }

    let report_url = json_str_field(&defaults, &["reportUrl", "report_url"]);
    let fid = json_str_field(&defaults, &["fid"]);
    let userid = json_str_field(&defaults, &["userid", "userId", "uid"]);
    let clazz_from_def = json_str_field(&defaults, &["clazzId", "clazzid", "classId"]);
    let clazz_out = if clazz_from_def.is_empty() {
        clazz_id.to_string()
    } else {
        clazz_from_def
    };

    let mut videos = Vec::new();
    let mut tasks = Vec::new();
    for (idx, att) in all_attachments.iter().enumerate() {
        let jobid = json_str_field(att, &["jobid", "jobId", "job_id"]);
        let att_type = json_str_field(att, &["type", "attachmentType"]);
        let object_id = {
            let a = json_str_field(att, &["objectId", "objectid", "object_id"]);
            if !a.is_empty() {
                a
            } else {
                json_str_pointer(
                    att,
                    &[
                        "/property/objectid",
                        "/property/objectId",
                        "/property/object_id",
                        "/property/mid",
                    ],
                )
            }
        };
        let name = {
            let n = json_str_pointer(att, &["/property/name", "/property/title"]);
            if n.is_empty() {
                json_str_field(att, &["name", "title"])
            } else {
                n
            }
        };
        let module = json_str_pointer(att, &["/property/module", "/property/type"]);
        let other_info = json_str_field(att, &["otherInfo", "other_info"]);
        let att_duration = att
            .get("attDuration")
            .map(|v| match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => "0".into(),
            })
            .unwrap_or_else(|| "0".into());
        let att_duration_enc = json_str_field(att, &["attDurationEnc", "att_duration_enc"]);
        let video_face_capture_enc =
            json_str_field(att, &["videoFaceCaptureEnc", "video_face_capture_enc"]);
        let is_passed = att
            .get("isPassed")
            .and_then(|v| v.as_bool())
            .or_else(|| att.get("ispassed").and_then(|v| v.as_bool()))
            .or_else(|| att.get("passed").and_then(|v| v.as_bool()))
            .unwrap_or(false);

        let kind = if att_type == "video"
            || module.contains("video")
            || module.eq_ignore_ascii_case("insertvideo")
        {
            "video"
        } else if att_type == "document"
            || module.contains("doc")
            || module.contains("pdf")
            || module.contains("book")
            || module.contains("insertbook")
        {
            "document"
        } else if att_type == "work" || module.contains("work") {
            "work"
        } else if att_type.is_empty() && !object_id.is_empty() {
            "video"
        } else if att_type.is_empty() {
            "task"
        } else {
            att_type.as_str()
        };

        let task = json!({
            "id": if !jobid.is_empty() { jobid.clone() } else { format!("{knowledge_id}-{idx}") },
            "title": if name.is_empty() { format!("任务 {}", idx + 1) } else { name.clone() },
            "name": name,
            "type": kind,
            "task_type": kind,
            "objectId": object_id.clone(),
            "object_id": object_id,
            "jobid": jobid,
            "module": module,
            "otherInfo": other_info,
            "attDuration": att_duration,
            "attDurationEnc": att_duration_enc,
            "videoFaceCaptureEnc": video_face_capture_enc,
            "isPassed": is_passed,
            "completed": is_passed,
            "status": if is_passed { "已完成" } else { "未完成" },
        });

        if kind == "video" {
            videos.push(task.clone());
        }
        tasks.push(task);
    }

    // mArg 无附件：从 HTML 兜底抠 objectId
    if tasks.is_empty() && !last_html.is_empty() {
        let scraped = scrape_tasks_from_cards_html(&last_html, knowledge_id);
        for t in scraped {
            if t.get("type").and_then(|v| v.as_str()) == Some("video") {
                videos.push(t.clone());
            }
            tasks.push(t);
        }
    }

    // 仍无任务：给一个可读占位，避免前端整页空白
    if tasks.is_empty() {
        tasks.push(json!({
            "id": format!("{knowledge_id}-page"),
            "title": "本小节暂无视频任务点",
            "name": "本小节暂无视频任务点",
            "type": "task",
            "task_type": "task",
            "objectId": "",
            "object_id": "",
            "jobid": "",
            "module": "",
            "otherInfo": "",
            "attDuration": "0",
            "attDurationEnc": "",
            "videoFaceCaptureEnc": "",
            "isPassed": false,
            "completed": false,
            "status": "无可播放任务",
            "empty_hint": true,
        }));
    }

    Ok(json!({
        "success": true,
        "reportUrl": report_url,
        "report_url": report_url,
        "userid": userid,
        "clazzId": clazz_out.clone(),
        "clazz_id": clazz_out,
        "fid": fid,
        "knowledge_id": knowledge_id,
        "course_id": course_id,
        "cpi": cpi,
        "pages_fetched": pages_fetched,
        "card_base": used_base,
        "videos": videos,
        "tasks": tasks,
        "attachments": tasks,
        "raw_defaults": defaults,
    }))
}

/// 课程成绩组成 + 当前得分（stat2 study-data）
pub async fn chaoxing_fetch_course_score(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    if course_id.trim().is_empty() || clazz_id.trim().is_empty() {
        return Err(err_box("课程参数不完整（courseId/clazzId）"));
    }
    // 先打开统计页拿 pEnc
    let index_url = format!(
        "https://stat2-ans.chaoxing.com/study-data/index?courseid={course_id}&clazzid={clazz_id}&cpi={cpi}&ut=s"
    );
    let index_html = client
        .client
        .get(&index_url)
        .header("Referer", "https://mooc1.chaoxing.com/")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .timeout(Duration::from_secs(20))
        .send()
        .await?
        .text()
        .await?;

    // 多种 pEnc 写法兼容
    let penc = [
        r#"id="pEnc"\s+value="([a-fA-F0-9]{32})""#,
        r#"id='pEnc'\s+value='([a-fA-F0-9]{32})'"#,
        r#"name="pEnc"\s+value="([a-fA-F0-9]{32})""#,
        r#"pEnc["']?\s*[:=]\s*["']([a-fA-F0-9]{32})["']"#,
        r#"pEnc=([a-fA-F0-9]{32})"#,
    ]
    .iter()
    .find_map(|pat| {
        regex::Regex::new(pat)
            .ok()
            .and_then(|re| re.captures(&index_html))
            .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
    })
    .unwrap_or_default();

    if penc.is_empty() {
        // 无权限时页面可能是登录跳转或空壳
        let hint = if index_html.contains("login") || index_html.contains("passport") {
            "成绩页需要重新桥接学习通会话，请退出后重新登录门户"
        } else if index_html.len() < 80 {
            "成绩统计页返回为空，课程可能未开通统计"
        } else {
            "未能解析成绩页凭证 pEnc，请确认课程已开通学情统计"
        };
        return Err(err_box(hint));
    }

    let score_url = format!(
        "https://stat2-ans.chaoxing.com/stat2/study-data/score?clazzid={clazz_id}&courseid={course_id}&cpi={cpi}&ut=s&pEnc={penc}&fromData=false"
    );
    let job_url = format!(
        "https://stat2-ans.chaoxing.com/stat2/study-data/job?clazzid={clazz_id}&courseid={course_id}&cpi={cpi}&ut=s&pEnc={penc}"
    );

    let score_resp = client
        .client
        .get(&score_url)
        .header("Referer", &index_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let score_json = read_json_response(score_resp, "成绩接口失败").await?;

    let job_json = match client
        .client
        .get(&job_url)
        .header("Referer", &index_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        Ok(r) => read_json_response(r, "任务统计失败").await.ok(),
        Err(_) => None,
    };

    let data = score_json
        .get("data")
        .cloned()
        .unwrap_or(score_json.clone());
    let score = data.get("score").cloned().unwrap_or(json!({}));
    let weight = data.get("weight").cloned().unwrap_or(json!({}));
    let weight_list = data.get("weightList").cloned().unwrap_or_else(|| json!([]));

    // weightList 可能为空时，用 weight 对象拼一份
    let weight_list = if weight_list.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        let mut list = Vec::new();
        for (key, label) in [
            ("work", "作业"),
            ("test", "考试"),
            ("video", "视频"),
            ("attend", "签到"),
            ("bbs", "讨论"),
            ("live", "直播"),
            ("read", "阅读"),
            ("task", "任务点"),
        ] {
            if let Some(v) = weight.get(key) {
                list.push(json!({ "name": label, "key": key, "value": v }));
            }
        }
        json!(list)
    } else {
        weight_list
    };

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "p_enc": penc,
        "total_score": score.get("score").cloned().unwrap_or(json!(null)),
        "user_name": score.get("userName").cloned().unwrap_or(json!(null)),
        "score": score,
        "weight": weight,
        "weight_list": weight_list,
        "job": job_json.and_then(|v| v.get("data").cloned()),
        "show_score": data.get("showScore").and_then(|v| v.as_bool()).unwrap_or(true),
    }))
}

/// 构造 ananas status 候选 URL（纯函数，单测覆盖）
pub fn chaoxing_video_status_candidate_urls(
    object_id: &str,
    fid: &str,
    ts_ms: &str,
) -> Vec<String> {
    let oid = object_id.trim();
    let fid_s = if fid.trim().is_empty() {
        "0"
    } else {
        fid.trim()
    };
    let ts = if ts_ms.trim().is_empty() {
        "0"
    } else {
        ts_ms.trim()
    };
    vec![
        format!("https://mooc1.chaoxing.com/ananas/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!(
            "https://mooc1-api.chaoxing.com/ananas/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"
        ),
        format!("https://mooc1.chaoxing.com/ananas/status/{oid}?flag=normal&_dc={ts}"),
        format!("https://s1.ananas.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://s2.ananas.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://s3.ananas.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://cloud1-0.cldisk.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://noteyd.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
    ]
}

/// 从章节页 HTML 提取 knowledge 叶子（纯函数）
/// 返回 (pos, knowledge_id, title, course_id, clazz_id, chapter_cur_id)
pub fn extract_chaoxing_catalog_leaves(
    html: &str,
) -> Vec<(usize, String, String, String, String, String)> {
    let re_leaf = regex::Regex::new(
        r#"id="cur(\d+)"[\s\S]{0,2500}?getTeacherAjax\('(\d+)','(\d+)','(\d+)'\)"#,
    )
    .expect("regex leaf");
    let re_leaf_title = regex::Regex::new(r#"title="\s*([^"]*?)\s*""#).expect("regex leaf title");
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for cap in re_leaf.captures_iter(html) {
        let pos = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let cur_id = cap[1].to_string();
        let course_id = cap[2].to_string();
        let clazz_id = cap[3].to_string();
        let knowledge_id = cap[4].to_string();
        if !seen.insert(knowledge_id.clone()) {
            continue;
        }
        let end = html[pos + 1..]
            .find(r#"id="cur"#)
            .map(|p| pos + 1 + p)
            .unwrap_or((pos + 1200).min(html.len()));
        let block = &html[pos..end];
        let title = re_leaf_title
            .captures(block)
            .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| format!("小节 {knowledge_id}"));
        out.push((pos, knowledge_id, title, course_id, clazz_id, cur_id));
    }
    if out.is_empty() {
        let re_ajax =
            regex::Regex::new(r#"getTeacherAjax\('(\d+)','(\d+)','(\d+)'\)"#).expect("ajax");
        for cap in re_ajax.captures_iter(html) {
            let pos = cap.get(0).map(|m| m.start()).unwrap_or(0);
            let knowledge_id = cap[3].to_string();
            if !seen.insert(knowledge_id.clone()) {
                continue;
            }
            let window_start = pos.saturating_sub(400);
            let window = &html[window_start..pos.min(html.len())];
            let title = re_leaf_title
                .captures(window)
                .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| format!("小节 {knowledge_id}"));
            out.push((
                pos,
                knowledge_id,
                title,
                cap[1].to_string(),
                cap[2].to_string(),
                String::new(),
            ));
        }
    }
    out
}

/// 获取视频文件状态（dtoken、duration、播放直链 http/https）
pub async fn chaoxing_get_video_status(
    client: &HbutClient,
    object_id: &str,
    fid: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let oid = object_id.trim();
    if oid.is_empty() {
        return Err(err_box("object_id 为空"));
    }
    let fid_s = if fid.trim().is_empty() {
        "0"
    } else {
        fid.trim()
    };
    let ts = chrono::Utc::now().timestamp_millis().to_string();
    // 依次尝试不同域名 / 参数，提高成功率
    // 预热学习通 cookie 到 ananas/mooc 域
    propagate_chaoxing_key_cookies(client);
    let _ = client
        .client
        .get("https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642")
        .header("Referer", "https://mooc1.chaoxing.com/")
        .timeout(Duration::from_secs(8))
        .send()
        .await;

    let candidates = chaoxing_video_status_candidate_urls(oid, fid_s, &ts);
    let mut last_err = String::new();
    for url in candidates {
        let resp = match client
            .client
            .get(&url)
            .header(
                "Referer",
                "https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642",
            )
            .header("Origin", "https://mooc1.chaoxing.com")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("X-Requested-With", "XMLHttpRequest")
            .header(
                "User-Agent",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ChaoXingStudy/3.2.0",
            )
            .timeout(Duration::from_secs(15))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };
        match read_json_response(resp, "获取视频状态失败").await {
            Ok(data) => {
                // status 字段可能是 "success" / "failed"
                let status = data
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                if status == "failed" || status == "error" {
                    last_err = format!(
                        "status={status}: {}",
                        data.get("msg")
                            .or_else(|| data.get("message"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("视频状态失败")
                    );
                    continue;
                }

                let play_urls = collect_play_urls(&data);
                let mut out = data.clone();
                if let Some(obj) = out.as_object_mut() {
                    if let Some(first) = play_urls.first() {
                        obj.insert("play_url".into(), json!(first));
                        // 统一把 http 字段写成 https 优先，方便前端 <video>
                        obj.insert("http".into(), json!(first));
                    }
                    obj.insert("play_urls".into(), json!(play_urls.clone()));
                }
                if play_urls.is_empty() && status != "success" && status.is_empty() {
                    last_err = "响应无播放地址".into();
                    continue;
                }
                return Ok(json!({
                    "success": true,
                    "data": out,
                    "play_url": play_urls.first().cloned().unwrap_or_default(),
                    "play_urls": play_urls,
                }));
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(err_box(format!("获取视频状态失败：{last_err}")))
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
        .header(
            "Referer",
            "https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642",
        )
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
    if let Some(chapters) = chapter_data
        .get("course_chapter")
        .and_then(|v| v.as_array())
    {
        for chapter in chapters {
            let chapter_name = chapter
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(sections) = chapter.get("section_leaf_list").and_then(|v| v.as_array()) {
                for section in sections {
                    let leaf_type = section
                        .get("leaf_type")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(-1);
                    if leaf_type == 0 {
                        let leaf_id = section.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                        let leaf_name = section
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
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
                                let lname = leaf
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
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
    let content_info = leaf_data
        .get("content_info")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let media = content_info
        .get("media")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let ccid = media
        .get("ccid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let duration = media
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

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

#[cfg(test)]
mod catalog_and_video_tests {
    use super::*;

    #[test]
    fn extract_leaves_from_realistic_html() {
        let html = r#"
        <div class="posCatalog_select firstLayer" id="1" title="第一章 绪论"></div>
        <div id="cur1001" class="posCatalog_name" title=" 1.1 电路模型" onclick="getTeacherAjax('2288','3399','100239488')"></div>
        <div id="cur1002" title="1.2 电源" onclick="getTeacherAjax('2288','3399','100239489')"></div>
        "#;
        let leaves = extract_chaoxing_catalog_leaves(html);
        assert!(leaves.len() >= 2, "expected >=2 leaves, got {:?}", leaves);
        assert!(leaves
            .iter()
            .any(|(_, kid, title, _, _, _)| kid == "100239488" && title.contains("电路")));
        assert!(leaves.iter().any(|(_, kid, _, _, _, _)| kid == "100239489"));
    }

    #[test]
    fn empty_html_has_no_leaves() {
        assert!(extract_chaoxing_catalog_leaves("<html></html>").is_empty());
    }

    #[test]
    fn assemble_outline_drives_extract_leaves() {
        let html = r#"
        <div class="posCatalog_select firstLayer" id="1" title="第一章 绪论"></div>
        <div id="cur1001" title=" 1.1 电路模型" onclick="getTeacherAjax('2288','3399','100239488')"></div>
        <div id="cur1002" title="1.2 电源" onclick="getTeacherAjax('2288','3399','100239489')"></div>
        "#;
        let out = assemble_chaoxing_outline_from_html(
            html,
            "2288",
            "3399",
            "1",
            "https://example/course",
        )
        .expect("outline");
        assert_eq!(out["success"], true);
        let total = out["total_count"].as_u64().unwrap_or(0);
        assert!(total >= 2, "total={total} out={out}");
        let leaves = extract_chaoxing_catalog_leaves(html);
        assert_eq!(leaves.len() as u64, total);
    }

    #[test]
    fn video_status_urls_cover_mooc_and_ananas() {
        let urls = chaoxing_video_status_candidate_urls("obj123", "16820", "99");
        assert!(urls.len() >= 5);
        assert!(urls
            .iter()
            .any(|u| u.contains("mooc1.chaoxing.com/ananas/status/obj123")));
        assert!(urls
            .iter()
            .any(|u| u.contains("s1.ananas.chaoxing.com/status/obj123")));
        assert!(urls.iter().all(|u| u.contains("_dc=99")));
    }
}
