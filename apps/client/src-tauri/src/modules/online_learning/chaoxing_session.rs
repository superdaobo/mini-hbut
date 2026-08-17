//! 学习通（Chaoxing）会话域：cookie 传播/恢复、会话探测与确保、
//! 签到用会话准备，以及学习通 AES 参数加密。

use std::collections::HashMap;

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose;
use base64::Engine;
use reqwest::cookie::CookieStore;
use reqwest::Url;
use scraper::Html;
use serde_json::{json, Value};

use crate::db;
use crate::http_client::HbutClient;

use super::shared::{
    cookie_header_for_url, err_box, parse_cookie_value, selector, DynError, PLATFORM_CHAOXING,
};

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

const CHAOXING_LOGIN_PAGE_URL: &str =
    "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
const CHAOXING_BASE_URL: &str = "https://passport2.chaoxing.com";
const CHAOXING_AES_KEY: &str = "u2oh6Vu^HWe4_AES";

pub(crate) fn propagate_chaoxing_key_cookies(client: &HbutClient) {
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

pub(crate) fn chaoxing_cookie_blob(client: &HbutClient) -> String {
    let passport_cookie = cookie_header_for_url(client, "https://passport2.chaoxing.com");
    let i_cookie = cookie_header_for_url(client, "https://i.chaoxing.com");
    let jw_cookie = cookie_header_for_url(client, "https://hbut.jw.chaoxing.com");
    [passport_cookie, i_cookie, jw_cookie]
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" | ")
}

pub(crate) fn has_chaoxing_bridge_cookie(client: &HbutClient) -> bool {
    let jw_cookie = cookie_header_for_url(client, "https://hbut.jw.chaoxing.com");
    jw_cookie.contains("jw_uf=") && jw_cookie.contains("username=")
}

pub(crate) fn has_chaoxing_full_session(client: &HbutClient) -> bool {
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

pub(crate) fn has_chaoxing_session(client: &HbutClient) -> bool {
    has_chaoxing_full_session(client)
}

/// 公开接口：检测是否已有超星会话（供 lib.rs 调用）
pub fn check_chaoxing_session(client: &HbutClient) -> bool {
    has_chaoxing_session(client)
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

pub(crate) async fn check_chaoxing_course_api_ready(client: &HbutClient) -> bool {
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

pub(crate) async fn ensure_chaoxing_session_ready(
    client: &mut HbutClient,
    student_id: &str,
) -> bool {
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
