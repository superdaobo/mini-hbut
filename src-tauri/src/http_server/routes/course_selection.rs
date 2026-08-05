//! 选课领域路由与 Handler。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};

use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;
use crate::{
    CourseSelectionChildClassesRequest, CourseSelectionDetailRequest,
    CourseSelectionEndTimeRequest, CourseSelectionListRequest, CourseSelectionSelectRequest,
    CourseSelectionSelectedCoursesRequest, CourseSelectionWithdrawRequest,
};

// ────────────────────────────────────────────────────────────
async fn fetch_course_selection_overview(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_overview(&client)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn fetch_course_selection_list(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionListRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_list(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn fetch_course_selection_end_time(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionEndTimeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_end_time(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn fetch_course_selection_child_classes(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionChildClassesRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_child_classes(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn select_course_selection_course(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionSelectRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::select_course_selection_course(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn withdraw_course_selection_course(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionWithdrawRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::withdraw_course_selection_course(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn fetch_course_selection_selected_courses(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionSelectedCoursesRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_selected_courses(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn fetch_course_selection_detail_intro(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionDetailRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_detail_intro(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

async fn fetch_course_selection_detail_teacher(
    State(state): State<HttpState>,
    Json(req): Json<CourseSelectionDetailRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::course_selection::fetch_course_selection_detail_teacher(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route(
            "/course_selection/overview",
            post(fetch_course_selection_overview),
        )
        .route("/course_selection/list", post(fetch_course_selection_list))
        .route(
            "/course_selection/end_time",
            post(fetch_course_selection_end_time),
        )
        .route(
            "/course_selection/child_classes",
            post(fetch_course_selection_child_classes),
        )
        .route(
            "/course_selection/select",
            post(select_course_selection_course),
        )
        .route(
            "/course_selection/withdraw",
            post(withdraw_course_selection_course),
        )
        .route(
            "/course_selection/selected_courses",
            post(fetch_course_selection_selected_courses),
        )
        .route(
            "/course_selection/detail_intro",
            post(fetch_course_selection_detail_intro),
        )
        .route(
            "/course_selection/detail_teacher",
            post(fetch_course_selection_detail_teacher),
        )
}
