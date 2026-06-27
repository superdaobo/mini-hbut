// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! Tauri 命令层 — 将签到协议/模块功能暴露为前端可调用的命令。
//!
//! 签到模块复用 AppState 中的 HbutClient（共享 cookie_jar），
//! 通过 ensure_chaoxing_session_ready 确保学习通会话可用后再发起签到请求。

use tokio::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;

use super::errors::CheckinErrorCode;
use super::inflight::{CheckinSubmitResult, InflightRegistry, SubmitResultKind};
use super::protocol::{self, CheckinActivity, PhotoUploadResult};
use super::qr_decode;
use super::qr_url;
use super::screen_capture::{self, ScreenRect};
use super::types::{self, CheckinLogEntry};
use crate::AppState;

// ─── 签到模块独立状态（不含 HTTP client，复用 AppState.client） ──────────────

/// 签到模块共享状态，通过 `tauri::manage()` 注入。
/// 注意：HTTP 请求通过 AppState.client（HbutClient）发出，不使用独立 client。
pub struct CheckinState {
    pub inflight: InflightRegistry,
    /// 活动列表缓存：(timestamp_ms, activities)，60s TTL
    pub cached_activities: Mutex<Option<(i64, Vec<CheckinActivity>)>>,
}

impl CheckinState {
    /// 创建新的签到状态实例。
    pub fn new() -> Self {
        Self {
            inflight: InflightRegistry::new(),
            cached_activities: Mutex::new(None),
        }
    }
}

// ─── 响应 DTO ────────────────────────────────────────────────────────────────

/// QR URL 解析结果（可序列化版本）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrUrlPartsResponse {
    pub active_id: String,
    pub enc: String,
}

/// QR 解码结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrDecodeResponse {
    pub url: String,
}

// ─── 缓存 TTL ────────────────────────────────────────────────────────────────

const ACTIVITY_CACHE_TTL_MS: i64 = 60_000; // 60 秒

// ─── 辅助函数 ────────────────────────────────────────────────────────────────

/// 将 CheckinErrorCode 转为面向前端的错误字符串。
fn err_to_string(code: CheckinErrorCode) -> String {
    super::errors::human_message(code, None)
}

// ─── 命令 1: 拉取签到活动列表 ────────────────────────────────────────────────

/// 拉取签到活动列表，支持 60s 缓存。
///
/// - `force_refresh = true`：忽略缓存，强制刷新
/// - `force_refresh = false`：缓存有效期内直接返回
#[tauri::command]
pub async fn chaoxing_checkin_list(
    app_state: State<'_, AppState>,
    checkin_state: State<'_, CheckinState>,
    force_refresh: bool,
) -> Result<Vec<CheckinActivity>, String> {
    let now_ms = chrono::Utc::now().timestamp_millis();

    // 检查缓存
    if !force_refresh {
        let cache = checkin_state.cached_activities.lock().await;
        if let Some((ts, ref activities)) = *cache {
            if now_ms - ts < ACTIVITY_CACHE_TTL_MS {
                return Ok(activities.clone());
            }
        }
    }

    // 确保学习通会话可用（复用 HbutClient 的 SSO 桥接）
    let client_ref = {
        let mut client = app_state.client.write().await;
        // 尝试确保学习通会话就绪
        let student_id = client
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .unwrap_or_default();
        let session_ready = crate::modules::online_learning::ensure_chaoxing_session_for_checkin(
            &mut client,
            &student_id,
        )
        .await;
        if !session_ready {
            return Err(err_to_string(CheckinErrorCode::SessionExpired));
        }
        // 获取 HbutClient 的 reqwest::Client 引用（共享 cookie_jar）
        client.client.clone()
    };

    // 拉取活动列表（内部会先获取课程列表再逐课程查询）
    let raw_activities = protocol::list_activities(&client_ref, "")
        .await
        .map_err(err_to_string)?;

    // 归一化（clazz_list 已在 list_activities 内部使用，这里传空即可）
    let activities = protocol::normalize_activities(raw_activities, &[], now_ms);

    // 更新缓存
    {
        let mut cache = checkin_state.cached_activities.lock().await;
        *cache = Some((now_ms, activities.clone()));
    }

    Ok(activities)
}

// ─── 命令 2: 普通签到 ────────────────────────────────────────────────────────

/// 提交普通签到（通过 InflightRegistry 保证幂等）。
#[tauri::command]
pub async fn chaoxing_checkin_submit_common(
    app_state: State<'_, AppState>,
    checkin_state: State<'_, CheckinState>,
    active_id: String,
) -> Result<CheckinSubmitResult, String> {
    if active_id.is_empty() {
        return Err(err_to_string(CheckinErrorCode::BadRequest));
    }

    let client_ref = {
        let client = app_state.client.write().await;
        client.client.clone()
    };
    let aid = active_id.clone();

    let result = checkin_state
        .inflight
        .run(&active_id, || async move {
            // 预签到
            let _ = protocol::pre_sign(&client_ref, &aid, "0", "0", "", "").await;

            // PPT 签到
            let params = protocol::PptSignParams {
                active_id: aid.clone(),
                uid: String::new(),
                fid: String::new(),
                name: String::new(),
                latitude: None,
                longitude: None,
                address: None,
                object_id: None,
                enc: None,
            };

            match protocol::ppt_sign(&client_ref, &params).await {
                Ok(body) => {
                    if body.contains("success") || body.contains("签到成功") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Success,
                            message: "签到成功".to_string(),
                            error_code: None,
                        }
                    } else if body.contains("已签到") || body.contains("您已签到") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::AlreadySigned,
                            message: "该活动已完成签到".to_string(),
                            error_code: Some(CheckinErrorCode::AlreadySigned),
                        }
                    } else {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Failure,
                            message: "签到失败，请稍后再试".to_string(),
                            error_code: Some(CheckinErrorCode::Unknown),
                        }
                    }
                }
                Err(code) => CheckinSubmitResult {
                    result: SubmitResultKind::Failure,
                    message: err_to_string(code),
                    error_code: Some(code),
                },
            }
        })
        .await;

    Ok(result)
}

// ─── 命令 3: 位置签到 ────────────────────────────────────────────────────────

/// 提交位置签到。
#[tauri::command]
pub async fn chaoxing_checkin_submit_location(
    app_state: State<'_, AppState>,
    checkin_state: State<'_, CheckinState>,
    active_id: String,
    latitude: f64,
    longitude: f64,
    address: String,
) -> Result<CheckinSubmitResult, String> {
    // 输入校验
    types::validate_location(latitude, longitude, &address).map_err(err_to_string)?;

    if active_id.is_empty() {
        return Err(err_to_string(CheckinErrorCode::BadRequest));
    }

    let client_ref = {
        let client = app_state.client.write().await;
        client.client.clone()
    };

    let aid = active_id.clone();

    let result = checkin_state
        .inflight
        .run(&active_id, || async move {
            // 预签到
            let _ = protocol::pre_sign(&client_ref, &aid, "0", "0", "", "").await;

            // PPT 签到（带位置）
            let params = protocol::PptSignParams {
                active_id: aid.clone(),
                uid: String::new(),
                fid: String::new(),
                name: String::new(),
                latitude: Some(latitude),
                longitude: Some(longitude),
                address: Some(address),
                object_id: None,
                enc: None,
            };

            match protocol::ppt_sign(&client_ref, &params).await {
                Ok(body) => {
                    if body.contains("success") || body.contains("签到成功") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Success,
                            message: "位置签到成功".to_string(),
                            error_code: None,
                        }
                    } else if body.contains("已签到") || body.contains("您已签到") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::AlreadySigned,
                            message: "该活动已完成签到".to_string(),
                            error_code: Some(CheckinErrorCode::AlreadySigned),
                        }
                    } else {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Failure,
                            message: "签到失败，请稍后再试".to_string(),
                            error_code: Some(CheckinErrorCode::Unknown),
                        }
                    }
                }
                Err(code) => CheckinSubmitResult {
                    result: SubmitResultKind::Failure,
                    message: err_to_string(code),
                    error_code: Some(code),
                },
            }
        })
        .await;

    Ok(result)
}

// ─── 命令 4: 上传签到照片 ────────────────────────────────────────────────────

/// 上传签到照片，返回 object_id 供后续 submit_photo 使用。
#[tauri::command]
pub async fn chaoxing_checkin_upload_photo(
    app_state: State<'_, AppState>,
    image_bytes: Vec<u8>,
    mime_type: String,
    file_name: String,
) -> Result<PhotoUploadResult, String> {
    // 输入校验
    types::validate_photo_input(&image_bytes, &mime_type).map_err(err_to_string)?;

    let client_ref = {
        let client = app_state.client.write().await;
        client.client.clone()
    };

    protocol::upload_photo(&client_ref, &image_bytes, &mime_type, &file_name, "")
        .await
        .map_err(err_to_string)
}

// ─── 命令 5: 照片签到 ────────────────────────────────────────────────────────

/// 提交照片签到（需先调用 upload_photo 获取 object_id）。
#[tauri::command]
pub async fn chaoxing_checkin_submit_photo(
    app_state: State<'_, AppState>,
    checkin_state: State<'_, CheckinState>,
    active_id: String,
    object_id: String,
) -> Result<CheckinSubmitResult, String> {
    if active_id.is_empty() || object_id.is_empty() {
        return Err(err_to_string(CheckinErrorCode::BadRequest));
    }

    let client_ref = {
        let client = app_state.client.write().await;
        client.client.clone()
    };

    let aid = active_id.clone();

    let result = checkin_state
        .inflight
        .run(&active_id, || async move {
            // 预签到
            let _ = protocol::pre_sign(&client_ref, &aid, "0", "0", "", "").await;

            // PPT 签到（带 objectId）
            let params = protocol::PptSignParams {
                active_id: aid.clone(),
                uid: String::new(),
                fid: String::new(),
                name: String::new(),
                latitude: None,
                longitude: None,
                address: None,
                object_id: Some(object_id),
                enc: None,
            };

            match protocol::ppt_sign(&client_ref, &params).await {
                Ok(body) => {
                    if body.contains("success") || body.contains("签到成功") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Success,
                            message: "照片签到成功".to_string(),
                            error_code: None,
                        }
                    } else if body.contains("已签到") || body.contains("您已签到") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::AlreadySigned,
                            message: "该活动已完成签到".to_string(),
                            error_code: Some(CheckinErrorCode::AlreadySigned),
                        }
                    } else {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Failure,
                            message: "签到失败，请稍后再试".to_string(),
                            error_code: Some(CheckinErrorCode::Unknown),
                        }
                    }
                }
                Err(code) => CheckinSubmitResult {
                    result: SubmitResultKind::Failure,
                    message: err_to_string(code),
                    error_code: Some(code),
                },
            }
        })
        .await;

    Ok(result)
}

// ─── 命令 6: 二维码签到 ──────────────────────────────────────────────────────

/// 提交二维码签到。
#[tauri::command]
pub async fn chaoxing_checkin_submit_qrcode(
    app_state: State<'_, AppState>,
    checkin_state: State<'_, CheckinState>,
    active_id: String,
    enc: String,
) -> Result<CheckinSubmitResult, String> {
    if active_id.is_empty() || enc.is_empty() {
        return Err(err_to_string(CheckinErrorCode::BadRequest));
    }

    let client_ref = {
        let client = app_state.client.write().await;
        client.client.clone()
    };

    let aid = active_id.clone();

    let result = checkin_state
        .inflight
        .run(&active_id, || async move {
            // QR 预签到
            match protocol::qr_pre_sign(&client_ref, &aid, &enc, "", "", "").await {
                Ok(body) => {
                    if body.contains("success") || body.contains("签到成功") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Success,
                            message: "二维码签到成功".to_string(),
                            error_code: None,
                        }
                    } else if body.contains("已签到") || body.contains("您已签到") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::AlreadySigned,
                            message: "该活动已完成签到".to_string(),
                            error_code: Some(CheckinErrorCode::AlreadySigned),
                        }
                    } else {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Failure,
                            message: "签到失败，请稍后再试".to_string(),
                            error_code: Some(CheckinErrorCode::Unknown),
                        }
                    }
                }
                Err(code) => CheckinSubmitResult {
                    result: SubmitResultKind::Failure,
                    message: err_to_string(code),
                    error_code: Some(code),
                },
            }
        })
        .await;

    Ok(result)
}

// ─── 命令 7: 手势签到 ────────────────────────────────────────────────────────

/// 提交手势签到。
#[tauri::command]
pub async fn chaoxing_checkin_submit_gesture(
    app_state: State<'_, AppState>,
    checkin_state: State<'_, CheckinState>,
    active_id: String,
    pattern: String,
) -> Result<CheckinSubmitResult, String> {
    // 输入校验
    types::validate_gesture_pattern(&pattern).map_err(err_to_string)?;

    if active_id.is_empty() {
        return Err(err_to_string(CheckinErrorCode::BadRequest));
    }

    let client_ref = {
        let client = app_state.client.write().await;
        client.client.clone()
    };

    let aid = active_id.clone();

    let result = checkin_state
        .inflight
        .run(&active_id, || async move {
            // 手势签到（带 signCode）
            match protocol::ppt_sign_with_code(&client_ref, &aid, "", "", "", &pattern).await {
                Ok(body) => {
                    if body.contains("success") || body.contains("签到成功") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Success,
                            message: "手势签到成功".to_string(),
                            error_code: None,
                        }
                    } else if body.contains("已签到") || body.contains("您已签到") {
                        CheckinSubmitResult {
                            result: SubmitResultKind::AlreadySigned,
                            message: "该活动已完成签到".to_string(),
                            error_code: Some(CheckinErrorCode::AlreadySigned),
                        }
                    } else {
                        CheckinSubmitResult {
                            result: SubmitResultKind::Failure,
                            message: "签到失败，请稍后再试".to_string(),
                            error_code: Some(CheckinErrorCode::Unknown),
                        }
                    }
                }
                Err(code) => CheckinSubmitResult {
                    result: SubmitResultKind::Failure,
                    message: err_to_string(code),
                    error_code: Some(code),
                },
            }
        })
        .await;

    Ok(result)
}

// ─── 命令 8: 签到历史 ────────────────────────────────────────────────────────

/// 查询签到历史记录。
///
/// - `student_id`：学号（None 时返回空列表）
/// - `limit`：最大返回条数
#[tauri::command]
pub async fn chaoxing_checkin_history(
    student_id: Option<String>,
    limit: u32,
) -> Result<Vec<CheckinLogEntry>, String> {
    let _sid = match student_id {
        Some(ref s) if !s.is_empty() => s.as_str(),
        _ => return Ok(Vec::new()),
    };

    // 限制最大查询条数
    let _limit = limit.min(200);

    // 使用内存数据库路径（实际集成时从 AppState 获取 DB 连接）
    // 当前阶段：返回空列表，待 HbutClient 集成后接入真实 DB
    // TODO: 接入真实数据库连接
    Ok(Vec::new())
}

// ─── 命令 9: 解析 QR URL ─────────────────────────────────────────────────────

/// 解析二维码 URL，提取 active_id 和 enc。
#[tauri::command]
pub async fn chaoxing_checkin_parse_qr_url(url: String) -> Result<QrUrlPartsResponse, String> {
    let parts = qr_url::parse(&url).map_err(err_to_string)?;
    Ok(QrUrlPartsResponse {
        active_id: parts.active_id,
        enc: parts.enc,
    })
}

// ─── 命令 10: 解码 QR 图像 ───────────────────────────────────────────────────

/// 从图像字节中解码 QR 码内容。
#[tauri::command]
pub async fn chaoxing_checkin_decode_qr_image(
    image_bytes: Vec<u8>,
    mime_type: String,
) -> Result<QrDecodeResponse, String> {
    // 在阻塞线程中执行图像解码（CPU 密集型）
    let result =
        tokio::task::spawn_blocking(move || qr_decode::decode_qr_image(&image_bytes, &mime_type))
            .await
            .map_err(|e| format!("解码任务失败: {}", e))?
            .map_err(err_to_string)?;

    Ok(QrDecodeResponse { url: result })
}

// ─── 命令 11: 屏幕截图 QR ────────────────────────────────────────────────────

/// 截取屏幕区域并解码其中的 QR 码。
#[tauri::command]
pub async fn chaoxing_checkin_capture_screen_qr(
    rect: Option<ScreenRect>,
) -> Result<QrDecodeResponse, String> {
    // 在阻塞线程中执行截屏（涉及系统调用）
    let result = tokio::task::spawn_blocking(move || screen_capture::capture_screen_qr(rect))
        .await
        .map_err(|e| format!("截屏任务失败: {}", e))?
        .map_err(err_to_string)?;

    Ok(QrDecodeResponse { url: result })
}

// ─── 命令 12: 清空签到数据 ───────────────────────────────────────────────────

/// 清空签到相关数据（级联清理）。
///
/// 按 design.md §9.3 四步级联：
/// 1. 清 cookie（由调用方在 HbutClient 层处理）
/// 2. 清签到日志（TODO: 接入真实 DB）
/// 3. 重置内存状态（inflight registry + list cache）
/// 4. 整体 2s 超时保护
#[tauri::command]
pub async fn clear_chaoxing_data(checkin_state: State<'_, CheckinState>) -> Result<(), String> {
    // 使用 2s 超时保护
    let result = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        // Step 1: Cookie 清理由上层 HbutClient 负责（此处跳过）

        // Step 2: 清签到日志（TODO: 接入真实 DB 连接后实现）
        // let _ = log_repo::delete_by_student(&conn, student_id);

        // Step 3: 重置内存状态
        checkin_state.inflight.clear();
        {
            let mut cache = checkin_state.cached_activities.lock().await;
            *cache = None;
        }
    })
    .await;

    match result {
        Ok(()) => Ok(()),
        Err(_) => Err("清空数据超时（>2s）".to_string()),
    }
}

// ─── 测试辅助命令 ────────────────────────────────────────────────────────────

/// 测试辅助：组装 QR URL（仅在测试/testing feature 下可见）。
#[cfg(any(test, feature = "testing"))]
#[tauri::command]
pub fn chaoxing_checkin_compose_qr_url(active_id: String, enc: String) -> String {
    qr_url::compose(&active_id, &enc)
}
