//! 反向代理领域路由与 Handler：小塔出行、学校官网、校园导览、
//! 校园地图、学习通视频直链、资源分享（WebDAV）。

use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, RawQuery, State};
use axum::http::{Method, StatusCode};
use axum::response::Response;
use axum::routing::{any, get, post};
use axum::{Json, Router};
use base64::{engine::general_purpose, Engine as _};
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use std::io::ErrorKind;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::Mutex;

use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;
use crate::modules::school_website_embed::{
    build_school_website_remote_url, parse_school_website_proxy_path, rewrite_school_website_html,
};

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct ResourceShareProxyQuery {
    endpoint: String,
    path: String,
    username: Option<String>,
    password: Option<String>,
}

// ────────────────────────────────────────────────────────────
fn normalize_resource_share_path(path: &str) -> String {
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

fn encode_resource_share_path(path: &str) -> String {
    normalize_resource_share_path(path)
        .split('/')
        .map(urlencoding::encode)
        .collect::<Vec<_>>()
        .join("/")
}

// ────────────────────────────────────────────────────────────
const CAMPUS_GUIDE_TARGET_BASE: &str = "https://wisdomscenic.map.qq.com";
const CAMPUS_GUIDE_APP: &str = "wisdom_scenic";
const CAMPUS_GUIDE_SECRET: &str = "gBtshVoSZriuTIxf";

const TOWERGO_TARGET_BASE: &str = "https://ebike-oper.chinatowercom.cn";
const TOWERGO_TARGET_HOST: &str = "ebike-oper.chinatowercom.cn";
const CAMPUS_MAP_QQ_KEY: &str = "LQBBZ-Y42ER-STHWC-WORES-QFUQS-SKFFV";
const CAMPUS_MAP_DIRECTION_BASE: &str = "https://apis.map.qq.com/ws/direction/v1/walking/";
const TOWERGO_APP_ID: &str = "wx278283883c249e3e";
const TOWERGO_MINIPROGRAM_REFERER: &str =
    "https://servicewechat.com/wx278283883c249e3e/47/page-frame.html";
const TOWERGO_USER_AGENT: &str = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.43 MiniProgramEnv/android NetType/WIFI Language/zh_CN ABI/arm64";

static TOWERGO_WAF_COOKIES: OnceLock<Mutex<String>> = OnceLock::new();
static TOWERGO_LOG_REDACT_RE: OnceLock<regex::Regex> = OnceLock::new();

// ────────────────────────────────────────────────────────────
// 小塔出行代理日志脱敏：屏蔽 Bearer token / JWT / 手机号，避免鉴权信息落盘
fn towergo_redact_log(text: &str) -> String {
    let re = TOWERGO_LOG_REDACT_RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)(Bearer\s+)[A-Za-z0-9._-]{8,}|eyJ[A-Za-z0-9._-]{20,}|\+86-?1[3-9]\d{9}|\b1[3-9]\d{9}\b",
        )
        .expect("towergo redact regex 编译失败")
    });
    re.replace_all(text, "[redacted]").to_string()
}

fn towergo_cookie_store() -> &'static Mutex<String> {
    TOWERGO_WAF_COOKIES.get_or_init(|| Mutex::new(String::new()))
}

// ────────────────────────────────────────────────────────────
fn towergo_is_hop_by_hop_header(name: &str) -> bool {
    matches!(
        name,
        "accept-encoding"
            | "connection"
            | "content-length"
            | "host"
            | "origin"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "referer"
            | "sec-fetch-dest"
            | "sec-fetch-mode"
            | "sec-fetch-site"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "user-agent"
    )
}

// ────────────────────────────────────────────────────────────
fn towergo_sanitize_request_headers(headers: &HeaderMap, waf_cookies: &str) -> HeaderMap {
    let mut out = HeaderMap::new();
    for (name, value) in headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if towergo_is_hop_by_hop_header(&lower) {
            continue;
        }
        out.insert(name.clone(), value.clone());
    }
    out.insert(
        HeaderName::from_static("host"),
        HeaderValue::from_static(TOWERGO_TARGET_HOST),
    );
    out.insert(
        HeaderName::from_static("user-agent"),
        HeaderValue::from_static(TOWERGO_USER_AGENT),
    );
    out.insert(
        HeaderName::from_static("referer"),
        HeaderValue::from_static(TOWERGO_MINIPROGRAM_REFERER),
    );
    out.insert(
        HeaderName::from_static("origin"),
        HeaderValue::from_static("https://servicewechat.com"),
    );
    out.insert(
        HeaderName::from_static("x-miniprogram-appid"),
        HeaderValue::from_static(TOWERGO_APP_ID),
    );
    out.insert(
        HeaderName::from_static("x-requested-with"),
        HeaderValue::from_static("com.tencent.mm"),
    );
    if !out.contains_key("accept") {
        out.insert(
            HeaderName::from_static("accept"),
            HeaderValue::from_static("application/json, text/plain, */*"),
        );
    }
    if !waf_cookies.trim().is_empty() {
        if let Ok(value) = HeaderValue::from_str(waf_cookies) {
            out.insert(HeaderName::from_static("cookie"), value);
        }
    }
    out
}

// ────────────────────────────────────────────────────────────
async fn towergo_update_waf_cookies(headers: &HeaderMap) {
    let mut guard = towergo_cookie_store().lock().await;
    for value in headers.get_all("set-cookie").iter() {
        if let Ok(raw) = value.to_str() {
            if let Some(cookie_part) = raw.split(';').next() {
                let cookie = cookie_part.trim();
                if !cookie.is_empty() && !guard.contains(cookie) {
                    if !guard.is_empty() {
                        guard.push_str("; ");
                    }
                    guard.push_str(cookie);
                }
            }
        }
    }
}

// ────────────────────────────────────────────────────────────
fn towergo_copy_response_header(name: &str) -> bool {
    matches!(
        name,
        "content-type"
            | "content-length"
            | "cache-control"
            | "etag"
            | "last-modified"
            | "set-cookie"
    )
}

// ────────────────────────────────────────────────────────────
fn school_website_copy_response_header(name: &str) -> bool {
    matches!(
        name,
        "content-type"
            | "content-length"
            | "cache-control"
            | "etag"
            | "last-modified"
            | "set-cookie"
            | "content-encoding"
            | "accept-ranges"
            | "content-language"
    )
}

// ────────────────────────────────────────────────────────────
fn school_website_sanitize_request_headers(headers: &HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::new();
    for key in [
        "accept",
        "accept-language",
        "cache-control",
        "if-modified-since",
        "if-none-match",
        "range",
        "user-agent",
        "referer",
    ] {
        if let Some(value) = headers.get(key) {
            out.insert(key, value.clone());
        }
    }
    if !out.contains_key("accept") {
        out.insert(
            HeaderName::from_static("accept"),
            HeaderValue::from_static(
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ),
        );
    }
    if !out.contains_key("user-agent") {
        out.insert(
            HeaderName::from_static("user-agent"),
            HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
        );
    }
    out
}

// ────────────────────────────────────────────────────────────
async fn school_website_proxy_root(
    method: Method,
    raw_query: RawQuery,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    school_website_proxy(method, Path(String::new()), raw_query, headers, body).await
}

// ────────────────────────────────────────────────────────────
async fn school_website_proxy(
    method: Method,
    Path(path): Path<String>,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if method == Method::OPTIONS {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NO_CONTENT;
        return Ok(response);
    }

    let query_text = query.as_deref();
    let target = parse_school_website_proxy_path(&path, query_text)
        .map_err(|message| err(StatusCode::BAD_REQUEST, "参数错误", message))?;
    let remote_url = build_school_website_remote_url(&target, query_text);

    let request_headers = school_website_sanitize_request_headers(&headers);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("创建学校官网代理客户端失败: {}", e),
            )
        })?;

    let mut request_builder = client.request(method, remote_url).headers(request_headers);
    if !body.is_empty() {
        request_builder = request_builder.body(body);
    }

    let upstream = request_builder.send().await.map_err(|e| {
        err(
            StatusCode::BAD_GATEWAY,
            "代理错误",
            format!("学校官网代理请求失败: {}", e),
        )
    })?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let body_bytes = upstream.bytes().await.unwrap_or_default();
    let is_html = upstream_headers
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.contains("text/html"))
        .unwrap_or(false);
    let final_body = if is_html && status.is_success() {
        let html = String::from_utf8_lossy(&body_bytes).to_string();
        rewrite_school_website_html(&html).into_bytes()
    } else {
        body_bytes.to_vec()
    };

    let mut response = Response::new(Body::from(final_body));
    *response.status_mut() = status;

    for (name, value) in upstream_headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if school_website_copy_response_header(&lower) {
            if lower == "content-length" {
                continue;
            }
            response.headers_mut().insert(name.clone(), value.clone());
        }
    }
    if is_html && status.is_success() {
        response.headers_mut().insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("text/html; charset=utf-8"),
        );
    }
    Ok(response)
}

// ────────────────────────────────────────────────────────────
fn campus_guide_should_include(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Null => false,
        serde_json::Value::Bool(flag) => *flag,
        serde_json::Value::Number(_) => true,
        serde_json::Value::String(text) => !text.is_empty(),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => true,
    }
}

// ────────────────────────────────────────────────────────────
fn campus_guide_format_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            serde_json::to_string(value).unwrap_or_default()
        }
        serde_json::Value::String(text) => text.clone(),
        serde_json::Value::Number(number) => number.to_string(),
        serde_json::Value::Bool(flag) => flag.to_string(),
        serde_json::Value::Null => String::new(),
    }
}

// ────────────────────────────────────────────────────────────
fn campus_guide_serialize_params(params: &serde_json::Map<String, serde_json::Value>) -> String {
    let mut keys: Vec<&String> = params.keys().collect();
    keys.sort();
    let mut parts = Vec::new();
    for key in keys {
        let value = &params[key];
        if !campus_guide_should_include(value) {
            continue;
        }
        parts.push(format!("{}={}", key, campus_guide_format_value(value)));
    }
    parts.join("&")
}

// ────────────────────────────────────────────────────────────
fn campus_guide_compute_sign(
    params: &serde_json::Map<String, serde_json::Value>,
    ts: i64,
) -> String {
    let serialized = campus_guide_serialize_params(params);
    let raw = format!(
        "{}{}{}{}",
        CAMPUS_GUIDE_APP, CAMPUS_GUIDE_SECRET, ts, serialized
    );
    format!("{:x}", md5::compute(raw.as_bytes()))
}

// ────────────────────────────────────────────────────────────
fn campus_guide_build_signed_headers(
    params: &serde_json::Map<String, serde_json::Value>,
) -> Result<HeaderMap, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let ts = chrono::Utc::now().timestamp();
    let sign = campus_guide_compute_sign(params, ts);
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("app"),
        HeaderValue::from_static(CAMPUS_GUIDE_APP),
    );
    headers.insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json"),
    );
    headers.insert(
        HeaderName::from_static("accept"),
        HeaderValue::from_static("application/json, text/plain, */*"),
    );
    headers.insert(
        HeaderName::from_static("ts"),
        HeaderValue::from_str(&ts.to_string()).map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("校园导览签名时间戳无效: {}", e),
            )
        })?,
    );
    headers.insert(
        HeaderName::from_static("sign"),
        HeaderValue::from_str(&sign).map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("校园导览签名无效: {}", e),
            )
        })?,
    );
    Ok(headers)
}

// ────────────────────────────────────────────────────────────
async fn campus_guide_proxy(
    method: Method,
    Path(path): Path<String>,
    RawQuery(query): RawQuery,
    _headers: HeaderMap,
    body: Bytes,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if method == Method::OPTIONS {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NO_CONTENT;
        return Ok(response);
    }

    let clean_path = path.trim_start_matches('/');
    if clean_path.is_empty() || clean_path.contains("..") {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "校园导览代理路径非法".to_string(),
        ));
    }

    let params: serde_json::Map<String, serde_json::Value> = if body.is_empty() {
        serde_json::Map::new()
    } else {
        match serde_json::from_slice::<serde_json::Value>(&body) {
            Ok(serde_json::Value::Object(map)) => map,
            Ok(_) => serde_json::Map::new(),
            Err(e) => {
                return Err(err(
                    StatusCode::BAD_REQUEST,
                    "参数错误",
                    format!("校园导览请求体不是 JSON 对象: {}", e),
                ));
            }
        }
    };

    let request_headers = campus_guide_build_signed_headers(&params)?;
    let remote_url = match query {
        Some(q) if !q.trim().is_empty() => {
            format!("{}/{}?{}", CAMPUS_GUIDE_TARGET_BASE, clean_path, q)
        }
        _ => format!("{}/{}", CAMPUS_GUIDE_TARGET_BASE, clean_path),
    };

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("创建校园导览代理客户端失败: {}", e),
            )
        })?;

    let request_body = if body.is_empty() {
        Bytes::from_static(b"{}")
    } else {
        body
    };

    let upstream = client
        .request(method, remote_url)
        .headers(request_headers)
        .body(request_body.to_vec())
        .send()
        .await
        .map_err(|e| {
            err(
                StatusCode::BAD_GATEWAY,
                "代理错误",
                format!("校园导览代理请求失败: {}", e),
            )
        })?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let body_bytes = upstream.bytes().await.unwrap_or_default();
    let mut response = Response::new(Body::from(body_bytes));
    *response.status_mut() = status;
    for (name, value) in upstream_headers.iter() {
        if towergo_copy_response_header(name.as_str()) {
            response.headers_mut().insert(name.clone(), value.clone());
        }
    }
    Ok(response)
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct CampusGuideDebugProbeRequest {
    scenic_id: Option<String>,
    path: Option<String>,
    field: Option<Vec<String>>,
    #[serde(default)]
    extra: serde_json::Map<String, serde_json::Value>,
}

// ────────────────────────────────────────────────────────────
struct CampusGuideUpstreamProbe {
    remote_url: String,
    serialized_params: String,
    ts: i64,
    sign: String,
    http_status: u16,
    body_text: String,
    parsed: Option<serde_json::Value>,
}

// ────────────────────────────────────────────────────────────
async fn campus_guide_probe_upstream(
    path: &str,
    mut params: serde_json::Map<String, serde_json::Value>,
) -> Result<CampusGuideUpstreamProbe, String> {
    let clean_path = path.trim_start_matches('/');
    if clean_path.is_empty() || clean_path.contains("..") {
        return Err("校园导览调试路径非法".to_string());
    }

    let ts = chrono::Utc::now().timestamp();
    let sign = campus_guide_compute_sign(&params, ts);
    let serialized_params = campus_guide_serialize_params(&params);
    let remote_url = format!("{}/{}", CAMPUS_GUIDE_TARGET_BASE, clean_path);

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建校园导览调试客户端失败: {}", e))?;

    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("app"),
        HeaderValue::from_static(CAMPUS_GUIDE_APP),
    );
    headers.insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json"),
    );
    headers.insert(
        HeaderName::from_static("accept"),
        HeaderValue::from_static("application/json, text/plain, */*"),
    );
    headers.insert(
        HeaderName::from_static("ts"),
        HeaderValue::from_str(&ts.to_string())
            .map_err(|e| format!("校园导览调试时间戳无效: {}", e))?,
    );
    headers.insert(
        HeaderName::from_static("sign"),
        HeaderValue::from_str(&sign).map_err(|e| format!("校园导览调试签名无效: {}", e))?,
    );

    let body = serde_json::Value::Object(std::mem::take(&mut params));
    let upstream = client
        .post(&remote_url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("校园导览调试请求失败: {}", e))?;

    let http_status = upstream.status().as_u16();
    let body_text = upstream
        .text()
        .await
        .unwrap_or_else(|_| String::from("<empty>"));
    let parsed = serde_json::from_str::<serde_json::Value>(&body_text).ok();

    Ok(CampusGuideUpstreamProbe {
        remote_url,
        serialized_params,
        ts,
        sign,
        http_status,
        body_text,
        parsed,
    })
}

// ────────────────────────────────────────────────────────────
fn campus_guide_debug_summarize(probe: &CampusGuideUpstreamProbe) -> serde_json::Value {
    let api_code = probe
        .parsed
        .as_ref()
        .and_then(|value| value.get("code"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let api_msg = probe
        .parsed
        .as_ref()
        .and_then(|value| value.get("msg").or_else(|| value.get("message")))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let data_keys = probe
        .parsed
        .as_ref()
        .and_then(|value| value.get("data"))
        .and_then(|data| data.as_object())
        .map(|obj| {
            let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
            keys.sort_unstable();
            keys
        })
        .unwrap_or_default();

    serde_json::json!({
        "http_status": probe.http_status,
        "api_code": api_code,
        "api_msg": api_msg,
        "data_keys": data_keys,
        "success": api_code == serde_json::json!(0) || api_code == serde_json::json!("0"),
    })
}

// ────────────────────────────────────────────────────────────
async fn campus_guide_debug_probe(
    Json(req): Json<CampusGuideDebugProbeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let scenic_id = req
        .scenic_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("48770");
    let path = req
        .path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("guide/v1/scenic/info");

    let mut params = req.extra;
    params.insert(
        "scenic_id".to_string(),
        serde_json::Value::String(scenic_id.to_string()),
    );
    if let Some(field) = req.field {
        params.insert("field".to_string(), serde_json::json!(field));
    }

    let probe = campus_guide_probe_upstream(path, params)
        .await
        .map_err(|message| err(StatusCode::BAD_GATEWAY, "代理错误", message))?;

    Ok(ok(serde_json::json!({
        "path": path,
        "scenic_id": scenic_id,
        "serialized_params": probe.serialized_params,
        "ts": probe.ts,
        "sign": probe.sign,
        "remote_url": probe.remote_url,
        "summary": campus_guide_debug_summarize(&probe),
        "upstream_body": probe.body_text,
    })))
}

// ────────────────────────────────────────────────────────────
async fn campus_guide_debug_field_matrix(
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let scenic_id = "48770";
    let candidates: Vec<(&str, Vec<&str>)> = vec![
        (
            "mini_program_main",
            vec!["basic", "ticket_info", "aoi", "bus_road_list"],
        ),
        (
            "legacy_broken",
            vec![
                "basic",
                "tags",
                "notice",
                "bus_road_list",
                "tour_road_list",
                "aoi",
            ],
        ),
        ("notice_only", vec!["notice"]),
        ("tour_road_only", vec!["tour_road_list"]),
    ];

    let mut results = Vec::new();
    for (label, field) in candidates {
        let mut params = serde_json::Map::new();
        params.insert(
            "scenic_id".to_string(),
            serde_json::Value::String(scenic_id.to_string()),
        );
        params.insert("field".to_string(), serde_json::json!(field));

        match campus_guide_probe_upstream("guide/v1/scenic/info", params).await {
            Ok(probe) => {
                results.push(serde_json::json!({
                    "label": label,
                    "field": field,
                    "summary": campus_guide_debug_summarize(&probe),
                    "serialized_params": probe.serialized_params,
                }));
            }
            Err(message) => {
                results.push(serde_json::json!({
                    "label": label,
                    "field": field,
                    "error": message,
                }));
            }
        }
    }

    Ok(ok(serde_json::json!({
        "scenic_id": scenic_id,
        "path": "guide/v1/scenic/info",
        "results": results,
    })))
}

// ────────────────────────────────────────────────────────────
async fn towergo_proxy(
    method: Method,
    Path(path): Path<String>,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    if method == Method::OPTIONS {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = StatusCode::NO_CONTENT;
        return Ok(response);
    }

    let clean_path = path.trim_start_matches('/');
    if clean_path.is_empty() || clean_path.contains("..") {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "小塔出行代理路径非法".to_string(),
        ));
    }
    let remote_url = match query {
        Some(q) if !q.trim().is_empty() => format!("{}/{}?{}", TOWERGO_TARGET_BASE, clean_path, q),
        _ => format!("{}/{}", TOWERGO_TARGET_BASE, clean_path),
    };

    let waf_cookies = towergo_cookie_store().lock().await.clone();
    let request_headers = towergo_sanitize_request_headers(&headers, &waf_cookies);
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("创建小塔代理客户端失败: {}", e),
            )
        })?;

    let mut request_builder = client.request(method, remote_url).headers(request_headers);
    if !body.is_empty() {
        request_builder = request_builder.body(body);
    }

    let upstream = request_builder.send().await.map_err(|e| {
        err(
            StatusCode::BAD_GATEWAY,
            "代理错误",
            format!("小塔出行代理请求失败: {}", e),
        )
    })?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    towergo_update_waf_cookies(&upstream_headers).await;

    // 2xx 流式透传（高效）；非 2xx 收集响应体后打印诊断摘要（脱敏）再回放
    let mut response = if status.is_success() {
        let stream = upstream
            .bytes_stream()
            .map(|chunk| chunk.map_err(|e| std::io::Error::new(ErrorKind::Other, e.to_string())));
        let mut resp = Response::new(Body::from_stream(stream));
        *resp.status_mut() = status;
        resp
    } else {
        let body_bytes = upstream.bytes().await.unwrap_or_default();
        let snippet: String = String::from_utf8_lossy(&body_bytes)
            .trim()
            .chars()
            .take(500)
            .collect();
        eprintln!(
            "[towergo] 代理上游非 2xx：path=/{} status={} body_len={} body_snippet={}",
            clean_path,
            status,
            body_bytes.len(),
            towergo_redact_log(&snippet)
        );
        let mut resp = Response::new(Body::from(body_bytes));
        *resp.status_mut() = status;
        resp
    };

    for (name, value) in upstream_headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if towergo_copy_response_header(&lower) {
            response.headers_mut().insert(name.clone(), value.clone());
        }
    }
    Ok(response)
}

// ────────────────────────────────────────────────────────────
/// 学习通视频直链本地代理：
/// 绕过 cldisk 视频 CDN 的 Referer 防盗链（App WebView 播直链会被 403 拒绝），
/// 以及 WebView 与 Rust reqwest CookieJar 不共享导致的官方播放器失效问题。
///
/// GET /proxy/video?url={encodeURIComponent(ananas/status 返回的签名直链)}
/// - 用主会话 client（自带 .chaoxing.com cookie jar）请求直链
/// - 强制 Referer/Origin 为 mooc1.chaoxing.com 通过防盗链校验
/// - 透传 Range / Content-Range / Accept-Ranges，支持 `<video>` 进度拖动
/// - 域名白名单（chaoxing.com / cldisk.com）防 SSRF
async fn chaoxing_video_proxy(
    State(state): State<HttpState>,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let target_raw = query
        .as_deref()
        .unwrap_or("")
        .split('&')
        .find_map(|kv| kv.strip_prefix("url="))
        .unwrap_or("")
        .to_string();
    if target_raw.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "缺少 url 参数".to_string(),
        ));
    }
    let target = urlencoding::decode(&target_raw)
        .map(|s| s.into_owned())
        .unwrap_or(target_raw);
    // 安全白名单：仅允许学习通视频 CDN 域名（防 SSRF 拉取内网/任意地址）
    // 精确 host 匹配（拒绝 userinfo 混淆、子串伪域如 evilchaoxing.com）
    let host_ok = match reqwest::Url::parse(&target) {
        Ok(u) => {
            let has_userinfo = !u.username().is_empty() || u.password().is_some();
            let host = u.host_str().unwrap_or("");
            let scheme_ok = matches!(u.scheme(), "http" | "https");
            let host_ok = host == "cldisk.com"
                || host.ends_with(".cldisk.com")
                || host == "chaoxing.com"
                || host.ends_with(".chaoxing.com");
            !has_userinfo && scheme_ok && host_ok
        }
        Err(_) => false,
    };
    if !host_ok {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "代理目标不在允许的域名内".to_string(),
        ));
    }

    let client = state.client.read().await;
    let mut builder = client
        .client
        .get(&target)
        .header("Referer", "https://mooc1.chaoxing.com/")
        .header("Origin", "https://mooc1.chaoxing.com");
    if let Some(range) = headers.get("range") {
        builder = builder.header("Range", range.clone());
    }
    let upstream = match builder.send().await {
        Ok(r) => r,
        Err(e) => {
            return Err(err(
                StatusCode::BAD_GATEWAY,
                "代理错误",
                format!("视频代理请求失败: {e}"),
            ));
        }
    };

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    // 2xx 流式透传（<video> 边下边播）；非 2xx 收集响应体原样回放
    let mut response = if status.is_success() {
        let stream = upstream
            .bytes_stream()
            .map(|chunk| chunk.map_err(|e| std::io::Error::new(ErrorKind::Other, e.to_string())));
        let mut resp = Response::new(Body::from_stream(stream));
        *resp.status_mut() = status;
        resp
    } else {
        let body_bytes = upstream.bytes().await.unwrap_or_default();
        let mut resp = Response::new(Body::from(body_bytes));
        *resp.status_mut() = status;
        resp
    };
    // 透传媒体相关响应头（Range 拖动、类型、长度）
    for (name, value) in upstream_headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "content-type"
                | "content-length"
                | "accept-ranges"
                | "content-range"
                | "content-disposition"
                | "etag"
                | "last-modified"
                | "cache-control"
        ) {
            response.headers_mut().insert(name.clone(), value.clone());
        }
    }
    Ok(response)
}

// ────────────────────────────────────────────────────────────
async fn campus_map_direction_proxy(
    RawQuery(query): RawQuery,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let query_text = query.unwrap_or_default();
    if query_text.trim().is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "缺少 from/to 参数".to_string(),
        ));
    }
    let remote_url = format!(
        "{}?{}&key={}",
        CAMPUS_MAP_DIRECTION_BASE, query_text, CAMPUS_MAP_QQ_KEY
    );

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("创建校园地图代理客户端失败: {}", e),
            )
        })?;

    let upstream = client.get(remote_url).send().await.map_err(|e| {
        err(
            StatusCode::BAD_GATEWAY,
            "代理错误",
            format!("校园地图路线代理请求失败: {}", e),
        )
    })?;

    let status = upstream.status();
    let body_bytes = upstream.bytes().await.unwrap_or_default();
    let mut response = Response::new(Body::from(body_bytes));
    *response.status_mut() = status;
    response.headers_mut().insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    Ok(response)
}

// ────────────────────────────────────────────────────────────
async fn resource_share_proxy(
    State(_state): State<HttpState>,
    headers: HeaderMap,
    Query(req): Query<ResourceShareProxyQuery>,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    let endpoint = req.endpoint.trim().trim_end_matches('/').to_string();
    if endpoint.is_empty() || !(endpoint.starts_with("http://") || endpoint.starts_with("https://"))
    {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "endpoint 非法或为空".to_string(),
        ));
    }

    let username = req.username.unwrap_or_default();
    let password = req.password.unwrap_or_default();
    if username.trim().is_empty() || password.trim().is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "缺少 WebDAV 账号或密码".to_string(),
        ));
    }

    let encoded_path = encode_resource_share_path(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = format!(
        "Basic {}",
        general_purpose::STANDARD.encode(format!("{}:{}", username, password).as_bytes())
    );

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("创建代理客户端失败: {}", e),
            )
        })?;

    let mut request_builder = client.get(remote_url).header("Authorization", auth);
    if let Some(range) = headers.get("range") {
        request_builder = request_builder.header("Range", range.clone());
    }
    if let Some(if_range) = headers.get("if-range") {
        request_builder = request_builder.header("If-Range", if_range.clone());
    }

    let upstream = request_builder.send().await.map_err(|e| {
        err(
            StatusCode::BAD_GATEWAY,
            "代理错误",
            format!("资源代理请求失败: {}", e),
        )
    })?;

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let stream = upstream
        .bytes_stream()
        .map(|chunk| chunk.map_err(|e| std::io::Error::new(ErrorKind::Other, e.to_string())));

    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;
    for key in [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "cache-control",
        "etag",
        "last-modified",
    ] {
        if let Some(value) = upstream_headers.get(key) {
            response.headers_mut().insert(key, value.clone());
        }
    }
    Ok(response)
}

// ────────────────────────────────────────────────────────────
async fn resource_share_direct_url(
    State(_state): State<HttpState>,
    Query(req): Query<ResourceShareProxyQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let endpoint = req.endpoint.trim().trim_end_matches('/').to_string();
    if endpoint.is_empty() || !(endpoint.starts_with("http://") || endpoint.starts_with("https://"))
    {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "endpoint 非法或为空".to_string(),
        ));
    }

    let username = req.username.unwrap_or_default();
    let password = req.password.unwrap_or_default();
    if username.trim().is_empty() || password.trim().is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "缺少 WebDAV 账号或密码".to_string(),
        ));
    }

    let encoded_path = encode_resource_share_path(&req.path);
    let remote_url = format!("{}/dav{}", endpoint, encoded_path);
    let auth = format!(
        "Basic {}",
        general_purpose::STANDARD.encode(format!("{}:{}", username, password).as_bytes())
    );

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("创建客户端失败: {}", e),
            )
        })?;

    let mut direct_url = String::new();
    let mut need_auth = false;

    // 先 HEAD，减少流量；如果服务不支持再用 GET + bytes=0-0 探测跳转。
    let head_resp = client
        .head(&remote_url)
        .header("Authorization", auth.clone())
        .send()
        .await
        .map_err(|e| {
            err(
                StatusCode::BAD_GATEWAY,
                "代理错误",
                format!("HEAD 请求失败: {}", e),
            )
        })?;

    let mut status_code = head_resp.status().as_u16();
    if let Some(loc) = head_resp
        .headers()
        .get("location")
        .and_then(|v| v.to_str().ok())
    {
        direct_url = loc.to_string();
    }

    if direct_url.is_empty() {
        let mut get_probe_error: Option<String> = None;
        match client
            .get(&remote_url)
            .header("Authorization", auth.clone())
            .header("Range", "bytes=0-0")
            .send()
            .await
        {
            Ok(get_resp) => {
                status_code = get_resp.status().as_u16();
                if let Some(loc) = get_resp
                    .headers()
                    .get("location")
                    .and_then(|v| v.to_str().ok())
                {
                    direct_url = loc.to_string();
                } else if get_resp.status().is_success() {
                    need_auth = true;
                    direct_url = remote_url.clone();
                }
            }
            Err(e) => {
                get_probe_error = Some(e.to_string());
            }
        }

        // 某些服务 HEAD 成功但 GET 探测失败（或不返回 location）时，仍回退到需认证地址。
        if direct_url.is_empty() && head_resp.status().is_success() {
            status_code = head_resp.status().as_u16();
            need_auth = true;
            direct_url = remote_url.clone();
        }

        if direct_url.is_empty() {
            if let Some(e) = get_probe_error {
                return Err(err(
                    StatusCode::BAD_GATEWAY,
                    "代理错误",
                    format!("GET 探测失败: {}", e),
                ));
            }
        }
    }

    if direct_url.is_empty() {
        return Err(err(
            StatusCode::BAD_GATEWAY,
            "代理错误",
            "未获取到可用直链".to_string(),
        ));
    }

    Ok(ok(serde_json::json!({
        "url": direct_url,
        "status": status_code,
        "need_auth": need_auth
    })))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/towergo/*path", any(towergo_proxy))
        .route("/campus-map/direction", get(campus_map_direction_proxy))
        .route("/campus-guide/*path", any(campus_guide_proxy))
        .route("/school-website", any(school_website_proxy_root))
        .route("/school-website/", any(school_website_proxy_root))
        .route("/school-website/*path", any(school_website_proxy))
        .route("/resource_share/direct_url", get(resource_share_direct_url))
        .route("/resource_share/proxy", get(resource_share_proxy))
        .route("/proxy/video", get(chaoxing_video_proxy))
}

pub(crate) fn debug_router() -> Router<HttpState> {
    Router::new()
        .route("/campus-guide-debug/probe", post(campus_guide_debug_probe))
        .route(
            "/campus-guide-debug/field-matrix",
            get(campus_guide_debug_field_matrix),
        )
}
