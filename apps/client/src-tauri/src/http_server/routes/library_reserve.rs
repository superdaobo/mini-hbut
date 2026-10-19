//! 图书馆预约官方页 Bridge 反向代理（issue #1081：iOS 内嵌官方预约页）。
//!
//! 与学校官网代理（`routes/proxy.rs` 的 `/school-website/*`）同构，但有四处**必须**不同：
//!
//! 1. **用 `state.client`**（`HbutClient`，`cookie_store(true)`，jar 里有 `.chaoxing.com` 会话）——
//!    官方页与 `data/apps/*` 接口都靠这份 cookie 鉴权，照抄官网那种裸 `reqwest::Client`
//!    必然被 302 到登录页；
//! 2. **强制 `Referer/Origin = https://reserve.chaoxing.com/`**（上游与 cxCaptcha 都校验来源）；
//! 3. **不回传 `set-cookie`**（会话由 Rust 侧 jar 统一持有）与 **`content-encoding`**
//!    （reqwest 已解压，回传会让浏览器二次解压失败 —— 官网路由复制它是个既有隐患）；
//! 4. **放行写方法**：官方提交是 `POST data/apps/seatengine/submit`，策略见
//!    `http_server/auth.rs` 的 `PublicEmbedWrite`。
//!
//! 纯逻辑（路径解析 / 主机白名单 / HTML 重写）在 `modules/library_reserve_proxy.rs`。

use axum::body::{Body, Bytes};
use axum::extract::{Path, RawQuery, State};
use axum::http::{Method, StatusCode};
use axum::response::Response;
use axum::routing::any;
use axum::{Json, Router};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

use crate::http_server::response::{err, ApiResponse};
use crate::http_server::state::HttpState;
use crate::modules::library_reserve_proxy::{
    build_reserve_embed_remote_url, parse_reserve_embed_proxy_path, rewrite_reserve_embed_html,
};

/// 强制上游 Referer / Origin（实测：空 Referer 会被 cxCaptcha 以 `10030 r verify error` 拒绝）
const UPSTREAM_REFERER: &str = "https://reserve.chaoxing.com/";
const UPSTREAM_ORIGIN: &str = "https://reserve.chaoxing.com";

/// 浏览器没带 UA 时的兜底（桌面版页面形态；正常路径透传 iframe 的真实 UA）
const DEFAULT_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/// 允许透传给上游的请求头（白名单；其余一律丢弃，避免把桥内上下文 / 令牌泄漏给上游）
fn sanitize_request_headers(headers: &HeaderMap) -> HeaderMap {
    let mut out = HeaderMap::new();
    for key in [
        "accept",
        "accept-language",
        "cache-control",
        "content-type",
        "if-modified-since",
        "if-none-match",
        "range",
        "user-agent",
        "x-requested-with",
    ] {
        if let Some(value) = headers.get(key) {
            out.insert(key, value.clone());
        }
    }
    if !out.contains_key("accept") {
        out.insert(
            HeaderName::from_static("accept"),
            HeaderValue::from_static("*/*"),
        );
    }
    if !out.contains_key("user-agent") {
        out.insert(
            HeaderName::from_static("user-agent"),
            HeaderValue::from_static(DEFAULT_USER_AGENT),
        );
    }
    // 来源头由桥统一钉死：iframe 内的来源是 http://127.0.0.1:4399，上游不认
    out.insert(
        HeaderName::from_static("referer"),
        HeaderValue::from_static(UPSTREAM_REFERER),
    );
    out.insert(
        HeaderName::from_static("origin"),
        HeaderValue::from_static(UPSTREAM_ORIGIN),
    );
    out
}

/// 允许回传给浏览器的响应头（白名单）
///
/// 刻意排除：
/// - `set-cookie`：会话只在 Rust 侧 jar 里，回传 chaoxing 域 cookie 对 loopback 源无意义；
/// - `content-encoding`：reqwest 已解压；
/// - `content-length`：HTML 会被重写，长度由 axum 重算。
fn copy_response_header(name: &str) -> bool {
    matches!(
        name,
        "content-type"
            | "cache-control"
            | "etag"
            | "last-modified"
            | "accept-ranges"
            | "content-language"
    )
}

// ────────────────────────────────────────────────────────────
async fn reserve_embed_proxy_root(
    State(state): State<HttpState>,
    method: Method,
    raw_query: RawQuery,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, (StatusCode, Json<ApiResponse<serde_json::Value>>)> {
    reserve_embed_proxy(
        State(state),
        method,
        Path(String::new()),
        raw_query,
        headers,
        body,
    )
    .await
}

// ────────────────────────────────────────────────────────────
async fn reserve_embed_proxy(
    State(state): State<HttpState>,
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

    let target = parse_reserve_embed_proxy_path(&path)
        .map_err(|message| err(StatusCode::BAD_REQUEST, "参数错误", message))?;
    let query_text = query.as_deref();
    let remote_url = build_reserve_embed_remote_url(&target, query_text);

    let request_headers = sanitize_request_headers(&headers);

    // 主会话客户端：自带 `.chaoxing.com` cookie jar（这是整条链路能过鉴权的唯一原因）
    let client = state.client.read().await;
    let mut request_builder = client
        .client
        .request(method, remote_url.clone())
        .headers(request_headers);
    if !body.is_empty() {
        request_builder = request_builder.body(body);
    }

    let upstream = request_builder.send().await.map_err(|e| {
        err(
            StatusCode::BAD_GATEWAY,
            "代理错误",
            format!("预约页代理请求失败: {e}"),
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
        rewrite_reserve_embed_html(&String::from_utf8_lossy(&body_bytes)).into_bytes()
    } else {
        body_bytes.to_vec()
    };

    let mut response = Response::new(Body::from(final_body));
    *response.status_mut() = status;

    for (name, value) in upstream_headers.iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if lower == "content-length" {
            continue;
        }
        if copy_response_header(&lower) {
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
pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/reserve-embed", any(reserve_embed_proxy_root))
        .route("/reserve-embed/", any(reserve_embed_proxy_root))
        .route("/reserve-embed/*path", any(reserve_embed_proxy))
}
