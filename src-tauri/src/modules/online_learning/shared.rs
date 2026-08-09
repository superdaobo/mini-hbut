//! 在线学习域共享基础设施：常量、错误包装、时间、缓存读写、
//! 平台状态/同步记录持久化，以及跨子模块复用的 JSON / cookie / HTML 工具。

use std::error::Error;
use std::io;
use std::sync::Arc;

use base64::Engine;
use chrono::{Local, Utc};
#[cfg(feature = "mobile-full")]
use qrcode::QrCode;
use reqwest::cookie::CookieStore;
use reqwest::cookie::Jar;
use reqwest::Url;
use scraper::Selector;
use serde_json::{json, Value};

use crate::db::{self, OnlineLearningPlatformStateRecord, OnlineLearningSyncRunRecord};
use crate::http_client::HbutClient;

pub(crate) type DynError = Box<dyn Error + Send + Sync>;

pub(crate) const PLATFORM_CHAOXING: &str = "chaoxing";
pub(crate) const PLATFORM_YUKETANG: &str = "yuketang";
pub(crate) const CACHE_OVERVIEW: &str = "online_learning_overview_cache";
pub(crate) const CACHE_CHAOXING_COURSES: &str = "online_learning_chaoxing_courses_cache";
pub(crate) const CACHE_CHAOXING_OUTLINE: &str = "online_learning_chaoxing_outline_cache";
pub(crate) const CACHE_CHAOXING_PROGRESS: &str = "online_learning_chaoxing_progress_cache";
pub(crate) const CACHE_YUKETANG_COURSES: &str = "online_learning_yuketang_courses_cache";
pub(crate) const CACHE_YUKETANG_OUTLINE: &str = "online_learning_yuketang_outline_cache";
pub(crate) const CACHE_YUKETANG_PROGRESS: &str = "online_learning_yuketang_progress_cache";
pub(crate) const YUKETANG_WEB_URL: &str = "https://changjiang.yuketang.cn/web";
pub(crate) const YUKETANG_AUTHORIZE_URL: &str =
    "https://changjiang.yuketang.cn/authorize/wx-qrlogin";

/// 将登录 URL 转换为 base64 编码的 SVG 二维码 data URI（Yuketang QR 登录专用，#594 mobile-full）
#[cfg(feature = "mobile-full")]
pub(crate) fn generate_qr_data_uri(url: &str) -> Result<String, DynError> {
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

pub(crate) fn err_box(message: impl Into<String>) -> DynError {
    Box::new(io::Error::other(message.into()))
}

pub(crate) fn now_sync_time() -> String {
    Local::now().to_rfc3339()
}

pub(crate) fn now_date_time() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub(crate) fn cache_key(student_id: &str, suffix: &str) -> String {
    format!("{}:{}", student_id.trim(), suffix.trim())
}

pub(crate) fn sanitize_text(input: &str) -> String {
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

pub(crate) fn parse_cookie_value(cookie_header: &str, key: &str) -> Option<String> {
    let marker = format!("{}=", key);
    cookie_header
        .split(';')
        .map(|segment| segment.trim())
        .find_map(|segment| segment.strip_prefix(&marker))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn cookie_header_for_url(client: &HbutClient, url: &str) -> String {
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

pub(crate) fn cookie_header_for_jar(jar: &Arc<Jar>, url: &str) -> String {
    let parsed = match Url::parse(url) {
        Ok(url) => url,
        Err(_) => return String::new(),
    };
    jar.cookies(&parsed)
        .and_then(|value| value.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default()
}

pub(crate) fn read_cache(table: &str, key: &str) -> Option<(Value, String)> {
    db::get_cache(crate::DB_FILENAME, table, key).ok().flatten()
}

pub(crate) fn save_cache(table: &str, key: &str, data: &Value) {
    let _ = db::save_cache(crate::DB_FILENAME, table, key, data);
}

pub(crate) fn clear_cache(table: &str, key: &str) {
    let _ = db::delete_cache(crate::DB_FILENAME, table, key);
}

pub(crate) fn clear_cache_prefix(table: &str, prefix: &str) {
    let _ = db::delete_cache_by_prefix(crate::DB_FILENAME, table, prefix);
}

pub(crate) fn record_sync_run(
    student_id: &str,
    platform: &str,
    status: &str,
    summary: &str,
    detail: Value,
) {
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

pub(crate) fn save_platform_state(
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

pub(crate) fn resolve_student_id(
    client: &HbutClient,
    student_id: Option<&str>,
) -> Result<String, DynError> {
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

pub(crate) fn selector(input: &str) -> Selector {
    Selector::parse(input).expect("selector parse failed")
}

pub(crate) fn parse_href_param(href: &str, key: &str) -> String {
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

pub(crate) async fn read_json_response(
    resp: reqwest::Response,
    fallback: &str,
) -> Result<Value, DynError> {
    let status = resp.status();
    let final_url = resp.url().to_string();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(err_box(format!("{}: {} {}", fallback, status, final_url)));
    }
    serde_json::from_str(&text).map_err(|_| err_box(format!("{}: 返回不是 JSON", fallback)))
}

pub(crate) fn summarize_course_count(payload: &Value) -> usize {
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

pub(crate) fn summarize_pending_count(payload: &Value) -> usize {
    payload
        .get("pending_count")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(0)
}

pub(crate) fn extract_display_name_from_state(
    record: Option<&OnlineLearningPlatformStateRecord>,
) -> String {
    record
        .map(|item| item.display_name.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

pub(crate) fn extract_account_from_state(
    record: Option<&OnlineLearningPlatformStateRecord>,
) -> String {
    record
        .map(|item| item.account_id.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

pub(crate) fn extract_meta_json(record: Option<&OnlineLearningPlatformStateRecord>) -> Value {
    record
        .and_then(|item| serde_json::from_str::<Value>(&item.meta_json).ok())
        .unwrap_or_else(|| json!({}))
}
