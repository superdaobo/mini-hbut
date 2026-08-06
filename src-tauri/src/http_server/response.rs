//! HTTP Bridge 统一响应结构（协议固定：`{ success, data, error, time }`）。
//!
//! 拆分自原 `http_server.rs`，响应 JSON 结构、字段名与状态码语义完全不变。

use axum::http::StatusCode;
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct ApiError {
    kind: String,
    message: String,
}

#[derive(Serialize)]
pub(crate) struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<ApiError>,
    time: String,
}

pub(crate) fn ok<T: Serialize>(data: T) -> Json<ApiResponse<T>> {
    Json(ApiResponse {
        success: true,
        data: Some(data),
        error: None,
        time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// 失败响应包装。
pub(crate) fn err(
    status: StatusCode,
    kind: &str,
    message: String,
) -> (StatusCode, Json<ApiResponse<serde_json::Value>>) {
    (
        status,
        Json(ApiResponse {
            success: false,
            data: None,
            error: Some(ApiError {
                kind: kind.to_string(),
                message,
            }),
            time: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        }),
    )
}
