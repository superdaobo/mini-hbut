//! 在线学习（学习通 / 雨课堂）领域路由与 Handler：总览、同步、
//! 会话状态、课程/大纲/进度/知识卡片/视频状态/上报进度等。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};

use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;
use crate::{
    ChaoxingCourseOutlineRequest, ChaoxingCourseProgressRequest, ChaoxingCoursesRequest,
    ChaoxingKnowledgeCardsRequest, ChaoxingSessionStatusRequest, ChaoxingVideoStatusRequest,
};
#[cfg(feature = "mobile-full")]
use crate::{
    ChaoxingLaunchUrlRequest, ChaoxingReportProgressRequest, OnlineLearningClearCacheRequest,
    OnlineLearningOverviewRequest, OnlineLearningSyncRequest, OnlineLearningSyncRunsRequest,
    YuketangCourseChaptersRequest, YuketangCourseOutlineRequest, YuketangCourseProgressRequest,
    YuketangCoursesRequest, YuketangHeartbeatRequest, YuketangLeafInfoRequest,
    YuketangPollQrLoginRequest, YuketangQrCreateRequest,
};

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn fetch_online_learning_overview(
    State(state): State<HttpState>,
    Json(req): Json<OnlineLearningOverviewRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::fetch_online_learning_overview(
        &client,
        req.student_id.as_deref(),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn online_learning_sync_now(
    State(state): State<HttpState>,
    Json(req): Json<OnlineLearningSyncRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    crate::modules::online_learning::online_learning_sync_now(
        &mut client,
        req.student_id.as_deref(),
        req.platform.as_deref().unwrap_or(""),
        req.force.unwrap_or(false),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn online_learning_list_sync_runs(
    State(state): State<HttpState>,
    Json(req): Json<OnlineLearningSyncRunsRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    let student_id = req
        .student_id
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .or_else(|| {
            client
                .user_info
                .as_ref()
                .map(|info| info.student_id.clone())
        })
        .ok_or_else(|| {
            err(
                StatusCode::BAD_REQUEST,
                "业务错误",
                "缺少 student_id，且当前未登录".to_string(),
            )
        })?;
    crate::modules::online_learning::list_online_learning_sync_runs(
        &student_id,
        req.platform.as_deref(),
        req.limit.unwrap_or(20),
    )
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn online_learning_clear_cache(
    State(state): State<HttpState>,
    Json(req): Json<OnlineLearningClearCacheRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    let student_id = req
        .student_id
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .or_else(|| {
            client
                .user_info
                .as_ref()
                .map(|info| info.student_id.clone())
        })
        .ok_or_else(|| {
            err(
                StatusCode::BAD_REQUEST,
                "业务错误",
                "缺少 student_id，且当前未登录".to_string(),
            )
        })?;
    crate::modules::online_learning::clear_online_learning_cache(
        &student_id,
        req.platform.as_deref(),
    )
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_get_session_status(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingSessionStatusRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    crate::modules::online_learning::chaoxing_get_session_status(
        &mut client,
        req.student_id.as_deref(),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_fetch_courses(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingCoursesRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    crate::modules::online_learning::chaoxing_fetch_courses(
        &mut client,
        req.student_id.as_deref(),
        req.force.unwrap_or(false),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_fetch_course_outline(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingCourseOutlineRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    crate::modules::online_learning::chaoxing_fetch_course_outline(&mut client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_fetch_course_progress(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingCourseProgressRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    crate::modules::online_learning::chaoxing_fetch_course_progress(&mut client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn chaoxing_get_launch_url(
    Json(req): Json<ChaoxingLaunchUrlRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    crate::modules::online_learning::chaoxing_get_launch_url(&req)
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_create_qr_login(
    State(state): State<HttpState>,
    Json(req): Json<YuketangQrCreateRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_create_qr_login(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_poll_qr_login(
    State(state): State<HttpState>,
    Json(req): Json<YuketangPollQrLoginRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_poll_qr_login(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_fetch_courses(
    State(state): State<HttpState>,
    Json(req): Json<YuketangCoursesRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_fetch_courses(
        &client,
        req.student_id.as_deref(),
        req.force.unwrap_or(false),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_fetch_course_outline(
    State(state): State<HttpState>,
    Json(req): Json<YuketangCourseOutlineRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_fetch_course_outline(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_fetch_course_progress(
    State(state): State<HttpState>,
    Json(req): Json<YuketangCourseProgressRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_fetch_course_progress(&client, &req)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_get_knowledge_cards(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingKnowledgeCardsRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::chaoxing_get_knowledge_cards(
        &client,
        &req.clazz_id,
        &req.course_id,
        &req.knowledge_id,
        &req.cpi,
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_get_video_status(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingVideoStatusRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::chaoxing_get_video_status(&client, &req.object_id, &req.fid)
        .await
        .map(ok)
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
async fn chaoxing_fetch_course_score(
    State(state): State<HttpState>,
    Json(req): Json<crate::ChaoxingCourseScoreRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::chaoxing_fetch_course_score(
        &client,
        &req.course_id,
        &req.clazz_id,
        &req.cpi,
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn chaoxing_report_progress(
    State(state): State<HttpState>,
    Json(req): Json<ChaoxingReportProgressRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::chaoxing_report_progress(
        &client,
        &req.report_url,
        &req.dtoken,
        &req.clazz_id,
        &req.object_id,
        &req.jobid,
        &req.userid,
        &req.other_info,
        req.playing_time,
        req.duration,
        req.isdrag.unwrap_or(3),
        req.video_face_capture_enc.as_deref().unwrap_or(""),
        req.att_duration.as_deref().unwrap_or("0"),
        req.att_duration_enc.as_deref().unwrap_or(""),
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_get_course_chapters(
    State(state): State<HttpState>,
    Json(req): Json<YuketangCourseChaptersRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_get_course_chapters(
        &client,
        &req.classroom_id,
        &req.sign,
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_get_leaf_info(
    State(state): State<HttpState>,
    Json(req): Json<YuketangLeafInfoRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_get_leaf_info(
        &client,
        &req.classroom_id,
        &req.leaf_id,
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// ────────────────────────────────────────────────────────────
#[cfg(feature = "mobile-full")]
async fn yuketang_send_heartbeat(
    State(state): State<HttpState>,
    Json(req): Json<YuketangHeartbeatRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let client = state.client.write().await;
    crate::modules::online_learning::yuketang_send_heartbeat(
        &client,
        &req.classroom_id,
        &req.events,
    )
    .await
    .map(ok)
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    // 保留能力路由：ChaoxingHubView 正常课程中心（#592/#594，全构建注册）
    let mut app = Router::new()
        .route(
            "/online_learning/chaoxing/session_status",
            post(chaoxing_get_session_status),
        )
        .route(
            "/online_learning/chaoxing/courses",
            post(chaoxing_fetch_courses),
        )
        .route(
            "/online_learning/chaoxing/outline",
            post(chaoxing_fetch_course_outline),
        )
        .route(
            "/online_learning/chaoxing/course_outline",
            post(chaoxing_fetch_course_outline),
        )
        .route(
            "/online_learning/chaoxing/progress",
            post(chaoxing_fetch_course_progress),
        )
        .route(
            "/online_learning/chaoxing/course_progress",
            post(chaoxing_fetch_course_progress),
        )
        .route(
            "/online_learning/chaoxing/knowledge_cards",
            post(chaoxing_get_knowledge_cards),
        )
        .route(
            "/online_learning/chaoxing/course_score",
            post(chaoxing_fetch_course_score),
        )
        .route(
            "/online_learning/chaoxing/video_status",
            post(chaoxing_get_video_status),
        );
    // 可裁能力路由：刷课同步/自动化/Yuketang（#592/#594 mobile-slim 关闭，源码保留）
    #[cfg(feature = "mobile-full")]
    {
        app = app
            .route(
                "/online_learning/overview",
                post(fetch_online_learning_overview),
            )
            .route("/online_learning/sync_now", post(online_learning_sync_now))
            .route(
                "/online_learning/sync_runs",
                post(online_learning_list_sync_runs),
            )
            .route(
                "/online_learning/list_sync_runs",
                post(online_learning_list_sync_runs),
            )
            .route(
                "/online_learning/clear_cache",
                post(online_learning_clear_cache),
            )
            .route(
                "/online_learning/chaoxing/launch_url",
                post(chaoxing_get_launch_url),
            )
            .route(
                "/online_learning/yuketang/create_qr_login",
                post(yuketang_create_qr_login),
            )
            .route(
                "/online_learning/yuketang/qr_login/create",
                post(yuketang_create_qr_login),
            )
            .route(
                "/online_learning/yuketang/poll_qr_login",
                post(yuketang_poll_qr_login),
            )
            .route(
                "/online_learning/yuketang/qr_login/poll",
                post(yuketang_poll_qr_login),
            )
            .route(
                "/online_learning/yuketang/courses",
                post(yuketang_fetch_courses),
            )
            .route(
                "/online_learning/yuketang/outline",
                post(yuketang_fetch_course_outline),
            )
            .route(
                "/online_learning/yuketang/course_outline",
                post(yuketang_fetch_course_outline),
            )
            .route(
                "/online_learning/yuketang/progress",
                post(yuketang_fetch_course_progress),
            )
            .route(
                "/online_learning/yuketang/course_progress",
                post(yuketang_fetch_course_progress),
            )
            .route(
                "/online_learning/chaoxing/report_progress",
                post(chaoxing_report_progress),
            )
            .route(
                "/online_learning/yuketang/course_chapters",
                post(yuketang_get_course_chapters),
            )
            .route(
                "/online_learning/yuketang/leaf_info",
                post(yuketang_get_leaf_info),
            )
            .route(
                "/online_learning/yuketang/heartbeat",
                post(yuketang_send_heartbeat),
            );
    }
    app
}
