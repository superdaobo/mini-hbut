//! 系统级路由与 Handler：健康检查、本地缓存读取、qxzkb 课表查询、
//! module_bundle 静态资源、图书馆、电费、交易、一码通、校园码。

use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;
use std::collections::HashMap;

use crate::http_server::auth::{ensure_local_cache_auth, is_allowed_cache_table};
use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;
use crate::modules::module_bundle::{
    self, ModuleBundlePrepareRequest, OpenModuleBundleWindowRequest,
};
use crate::{db, QxzkbQuery, DB_FILENAME};

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct CacheGetQuery {
    table: String,
    key: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct QxzkbJcinfoRequest {
    xnxq: String,
}

#[derive(Debug, Deserialize)]
struct QxzkbZyxxRequest {
    yxid: String,
    nj: String,
}

#[derive(Debug, Deserialize)]
struct QxzkbKkjysRequest {
    kkyxid: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct LibrarySearchRequest {
    params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct LibraryDetailRequest {
    title: String,
    isbn: String,
    record_id: Option<i64>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct ElectricityRequest {
    payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct TransactionRequest {
    start_date: String,
    end_date: String,
    page_no: i32,
    page_size: i32,
}

#[derive(Debug, Deserialize)]
struct CampusCodeRequest {
    payload: serde_json::Value,
}

// ────────────────────────────────────────────────────────────
async fn health(State(state): State<HttpState>) -> Json<ApiResponse<serde_json::Value>> {
    let service = crate::application::SessionService::new(
        crate::application::ApplicationContext::new(state.client, crate::DB_FILENAME),
    );
    ok(service.health().await)
}

// ────────────────────────────────────────────────────────────
fn module_content_type(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("wasm") => "application/wasm",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

// ────────────────────────────────────────────────────────────
async fn module_bundle_prepare(
    State(state): State<HttpState>,
    Json(req): Json<ModuleBundlePrepareRequest>,
) -> Result<
    Json<ApiResponse<module_bundle::ModuleBundlePrepareResult>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    module_bundle::prepare_module_bundle(&state.app, req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "模块准备失败", e))
}

// ────────────────────────────────────────────────────────────
async fn module_bundle_open(
    State(state): State<HttpState>,
    Json(req): Json<OpenModuleBundleWindowRequest>,
) -> Result<
    Json<ApiResponse<module_bundle::OpenModuleBundleWindowResult>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    module_bundle::open_module_bundle_window(state.app.clone(), req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "模块打开失败", e))
}

// ────────────────────────────────────────────────────────────
async fn module_bundle_content_index(
    State(state): State<HttpState>,
    Path((channel, module_id, version)): Path<(String, String, String)>,
) -> impl IntoResponse {
    serve_module_bundle_file(state, channel, module_id, version, None).await
}

// ────────────────────────────────────────────────────────────
async fn module_bundle_content(
    State(state): State<HttpState>,
    Path((channel, module_id, version, path)): Path<(String, String, String, String)>,
) -> impl IntoResponse {
    serve_module_bundle_file(state, channel, module_id, version, Some(path)).await
}

// ────────────────────────────────────────────────────────────
async fn serve_module_bundle_file(
    state: HttpState,
    channel: String,
    module_id: String,
    version: String,
    relative_path: Option<String>,
) -> Response {
    let file_path = match module_bundle::resolve_module_bundle_file(
        &state.app,
        &channel,
        &module_id,
        &version,
        relative_path.as_deref(),
    ) {
        Ok(path) => path,
        Err(message) => return (StatusCode::NOT_FOUND, message).into_response(),
    };

    let bytes = match tokio::fs::read(&file_path).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("读取模块文件失败: {}", err),
            )
                .into_response()
        }
    };

    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static(module_content_type(&file_path)),
    );
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

// ────────────────────────────────────────────────────────────
async fn cache_get(
    State(state): State<HttpState>,
    Query(req): Query<CacheGetQuery>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_local_cache_auth(&headers, &state)?;

    let table = req.table.trim();
    let key = req.key.trim();
    if table.is_empty() || key.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "table 和 key 不能为空".to_string(),
        ));
    }
    if !is_allowed_cache_table(table) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "不允许访问该缓存表".to_string(),
        ));
    }

    match db::get_cache(DB_FILENAME, table, key) {
        Ok(Some((data, sync_time))) => {
            let payload = serde_json::json!({
                "success": true,
                "data": data,
                "sync_time": sync_time,
                "offline": true
            });
            Ok(ok(payload))
        }
        Ok(None) => Err(err(
            StatusCode::NOT_FOUND,
            "未找到",
            "缓存不存在".to_string(),
        )),
        Err(e) => Err(err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "系统错误",
            e.to_string(),
        )),
    }
}

// ────────────────────────────────────────────────────────────
async fn fetch_qxzkb_options(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
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

    Ok(ok(payload))
}

// ────────────────────────────────────────────────────────────
async fn fetch_qxzkb_jcinfo(
    State(state): State<HttpState>,
    Json(req): Json<QxzkbJcinfoRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    client
        .fetch_qxzkb_jcinfo(&req.xnxq)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_qxzkb_zyxx(
    State(state): State<HttpState>,
    Json(req): Json<QxzkbZyxxRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    client
        .fetch_qxzkb_zyxx(&req.yxid, &req.nj)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_qxzkb_kkjys(
    State(state): State<HttpState>,
    Json(req): Json<QxzkbKkjysRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    client
        .fetch_qxzkb_kkjys(&req.kkyxid)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_qxzkb_list(
    State(state): State<HttpState>,
    Json(query): Json<QxzkbQuery>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    if query.xnxq.trim().is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "业务错误",
            "请选择学年学期".to_string(),
        ));
    }

    let client = state.client.write().await;
    let mut params: HashMap<String, String> = HashMap::new();
    params.insert(
        "queryFields".to_string(),
        crate::qxzkb_options::QXZKB_QUERY_FIELDS.to_string(),
    );
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

    let kklx = query
        .kklx
        .as_ref()
        .map(|list| {
            list.iter()
                .filter(|v| !v.trim().is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    params.insert("kklx".to_string(), kklx.clone());

    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50);
    params.insert("page.pn".to_string(), page.to_string());
    params.insert("page.size".to_string(), page_size.to_string());
    let sort = query.sort.as_deref().unwrap_or("kcmc");
    let sort = if sort.trim().is_empty() { "kcmc" } else { sort };
    let order = query.order.as_deref().unwrap_or("asc");
    let order = if order.trim().is_empty() {
        "asc"
    } else {
        order
    };
    params.insert("sort".to_string(), sort.to_string());
    params.insert("order".to_string(), order.to_string());

    let query_fields = vec![
        "xnxq", "xqid", "nj", "yxid", "zyid", "kkyxid", "kkjysid", "kcxz", "kclb", "xslx", "kcmc",
        "skjs", "jxlid", "jslx", "ksxs", "ksfs", "jsmc", "zxjc", "zdjc", "zxzc", "zdzc", "zxxq",
        "zdxq", "xsqbkb", "kklx",
    ];
    for key in query_fields {
        if xsqbkb == "1" && (key == "zxzc" || key == "zdzc") {
            continue;
        }
        let value = params.get(key).cloned().unwrap_or_default();
        params.insert(format!("query.{}||", key), value);
    }

    client
        .fetch_qxzkb_list(&params)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_library_dict(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    // 图书馆业务统一走 AcademicReadService（缓存降级语义与 Tauri 端一致），本 handler 只做传输适配。
    crate::application::AcademicReadService::new(crate::application::ApplicationContext::new(
        state.client,
        crate::DB_FILENAME,
    ))
    .fetch_library_dict()
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn search_library_books(
    State(state): State<HttpState>,
    Json(req): Json<LibrarySearchRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    crate::application::AcademicReadService::new(crate::application::ApplicationContext::new(
        state.client,
        crate::DB_FILENAME,
    ))
    .search_library_books(req.params)
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_library_book_detail(
    State(state): State<HttpState>,
    Json(req): Json<LibraryDetailRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    crate::application::AcademicReadService::new(crate::application::ApplicationContext::new(
        state.client,
        crate::DB_FILENAME,
    ))
    .fetch_library_book_detail(req.title.clone(), req.isbn.clone(), req.record_id)
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn electricity_query_location(
    State(state): State<HttpState>,
    Json(req): Json<ElectricityRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .query_electricity_location(req.payload)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn electricity_query_account(
    State(state): State<HttpState>,
    Json(req): Json<ElectricityRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .query_electricity_account(req.payload)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn fetch_transaction_history(
    State(state): State<HttpState>,
    Json(req): Json<TransactionRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .fetch_transaction_history(&req.start_date, &req.end_date, req.page_no, req.page_size)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn one_code_token(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .get_one_code_token()
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn campus_code_config(
    State(state): State<HttpState>,
    Json(req): Json<CampusCodeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .query_campus_code_config(req.payload)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn campus_code_qrcode(
    State(state): State<HttpState>,
    Json(req): Json<CampusCodeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .query_campus_code_qrcode(req.payload)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn campus_code_order_status(
    State(state): State<HttpState>,
    Json(req): Json<CampusCodeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    client
        .query_campus_code_order_status(req.payload)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/health", get(health))
        .route("/module_bundle/prepare", post(module_bundle_prepare))
        .route("/module_bundle/open", post(module_bundle_open))
        .route(
            "/module_bundle/content/:channel/:module_id/:version",
            get(module_bundle_content_index),
        )
        .route(
            "/module_bundle/content/:channel/:module_id/:version/*path",
            get(module_bundle_content),
        )
        .route("/cache/get", get(cache_get))
        .route("/qxzkb/options", get(fetch_qxzkb_options))
        .route("/qxzkb/jcinfo", post(fetch_qxzkb_jcinfo))
        .route("/qxzkb/zyxx", post(fetch_qxzkb_zyxx))
        .route("/qxzkb/kkjys", post(fetch_qxzkb_kkjys))
        .route("/qxzkb/query", post(fetch_qxzkb_list))
        .route("/library/dict", post(fetch_library_dict))
        .route("/library/search", post(search_library_books))
        .route("/library/detail", post(fetch_library_book_detail))
        .route(
            "/electricity_query_location",
            post(electricity_query_location),
        )
        .route(
            "/electricity_query_account",
            post(electricity_query_account),
        )
        .route(
            "/fetch_transaction_history",
            post(fetch_transaction_history),
        )
        .route("/one_code_token", post(one_code_token))
        .route("/campus_code/config", post(campus_code_config))
        .route("/campus_code/qrcode", post(campus_code_qrcode))
        .route("/campus_code/order_status", post(campus_code_order_status))
}
