//! 学习通/雨课堂在线学习与班级资料 Tauri commands。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;
use crate::http_client::HbutClient;
use crate::modules;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningOverviewRequest {
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningSyncRequest {
    pub student_id: Option<String>,
    pub platform: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningSyncRunsRequest {
    pub student_id: Option<String>,
    pub platform: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningClearCacheRequest {
    pub student_id: Option<String>,
    pub platform: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingSessionStatusRequest {
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCoursesRequest {
    pub student_id: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCourseOutlineRequest {
    pub student_id: Option<String>,
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    pub course_url: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCourseProgressRequest {
    pub student_id: Option<String>,
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    pub course_url: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingLaunchUrlRequest {
    pub student_id: Option<String>,
    pub course_id: String,
    pub clazz_id: String,
    pub chapter_id: Option<String>,
    pub knowledge_id: Option<String>,
    pub cpi: Option<String>,
    pub launch_url: Option<String>,
}

/// 学习通班级资料：SSO 状态 / 邀请码 / 资料列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingClassSsoRequest {
    pub student_id: Option<String>,
    /// 前端本地加密备份的门户密码（移动端密钥环常空，#367）
    #[serde(default)]
    pub portal_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingClassInviteRequest {
    pub invite_code: String,
    pub student_id: Option<String>,
    /// 前端 Web 备份门户密码，邀请码会话失效时静默重桥接（#375）
    #[serde(default)]
    pub portal_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingClassResourcesRequest {
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: Option<String>,
    pub student_id: Option<String>,
    /// 子目录 dataId（普通文件夹）
    pub parent_data_id: Option<String>,
    pub data_name: Option<String>,
    pub parent_chain: Option<String>,
    /// `tch-courseware` | `afolder`
    pub folder_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingClassResourceAccessRequest {
    pub course_id: String,
    pub clazz_id: String,
    pub data_id: String,
    pub object_id: Option<String>,
    pub cpi: Option<String>,
    pub student_id: Option<String>,
    /// 用于判断图片/视频预览模式
    pub file_name: Option<String>,
    pub file_type: Option<String>,
}

/// 学习通资料鉴权下载（应用内 cookie，避免系统浏览器 403）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingClassDownloadRequest {
    pub course_id: String,
    pub clazz_id: String,
    pub data_id: String,
    pub object_id: Option<String>,
    pub cpi: Option<String>,
    pub student_id: Option<String>,
    pub file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangQrCreateRequest {
    pub student_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangPollQrLoginRequest {
    pub student_id: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCoursesRequest {
    pub student_id: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCourseOutlineRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub sign: Option<String>,
    pub force: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCourseProgressRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub sku_id: Option<String>,
    pub force: Option<bool>,
}

// ── 自动刷课 Request DTO ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingKnowledgeCardsRequest {
    pub student_id: Option<String>,
    #[serde(alias = "clazzId", alias = "classId")]
    pub clazz_id: String,
    #[serde(alias = "courseId")]
    pub course_id: String,
    #[serde(alias = "knowledgeId")]
    pub knowledge_id: String,
    #[serde(default)]
    pub cpi: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingVideoStatusRequest {
    pub student_id: Option<String>,
    #[serde(alias = "objectId")]
    pub object_id: String,
    #[serde(default)]
    pub fid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingCourseScoreRequest {
    pub student_id: Option<String>,
    #[serde(alias = "courseId")]
    pub course_id: String,
    #[serde(alias = "clazzId", alias = "classId")]
    pub clazz_id: String,
    #[serde(default)]
    pub cpi: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaoxingReportProgressRequest {
    pub student_id: Option<String>,
    pub report_url: String,
    pub dtoken: String,
    pub clazz_id: String,
    pub object_id: String,
    pub jobid: String,
    pub userid: String,
    pub other_info: String,
    pub playing_time: u64,
    pub duration: u64,
    pub isdrag: Option<u8>,
    pub video_face_capture_enc: Option<String>,
    pub att_duration: Option<String>,
    pub att_duration_enc: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangCourseChaptersRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub sign: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangLeafInfoRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub leaf_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YuketangHeartbeatRequest {
    pub student_id: Option<String>,
    pub classroom_id: String,
    pub events: serde_json::Value,
}

fn resolve_online_learning_student_id(
    client: &HbutClient,
    student_id: Option<&str>,
) -> Result<String, String> {
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
        .ok_or_else(|| "缺少 student_id，且当前未登录".to_string())
}

#[tauri::command]
pub(crate) async fn online_learning_overview(
    state: State<'_, AppState>,
    req: OnlineLearningOverviewRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::fetch_online_learning_overview(&client, req.student_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn online_learning_sync_now(
    state: State<'_, AppState>,
    req: OnlineLearningSyncRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::online_learning::online_learning_sync_now(
        &mut client,
        req.student_id.as_deref(),
        req.platform.as_deref().unwrap_or(""),
        req.force.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn online_learning_list_sync_runs(
    state: State<'_, AppState>,
    req: OnlineLearningSyncRunsRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let student_id = resolve_online_learning_student_id(&client, req.student_id.as_deref())?;
    modules::online_learning::list_online_learning_sync_runs(
        &student_id,
        req.platform.as_deref(),
        req.limit.unwrap_or(20),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn online_learning_clear_cache(
    state: State<'_, AppState>,
    req: OnlineLearningClearCacheRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let student_id = resolve_online_learning_student_id(&client, req.student_id.as_deref())?;
    modules::online_learning::clear_online_learning_cache(&student_id, req.platform.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_get_session_status(
    state: State<'_, AppState>,
    req: ChaoxingSessionStatusRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::online_learning::chaoxing_get_session_status(&mut client, req.student_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// 学习通班级：确保门户 CAS → 学习通 SSO（不二次登录）
#[tauri::command]
pub(crate) async fn chaoxing_class_ensure_sso(
    state: State<'_, AppState>,
    req: ChaoxingClassSsoRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::chaoxing_class::ensure_sso_session(
        &mut client,
        req.student_id.as_deref(),
        req.portal_password.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

/// 学习通班级：预览邀请码（不入班）
#[tauri::command]
pub(crate) async fn chaoxing_class_preview_invite(
    state: State<'_, AppState>,
    req: ChaoxingClassInviteRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let preview = modules::chaoxing_class::preview_invite(
        &mut client,
        &req.invite_code,
        req.portal_password.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(preview).unwrap_or_default())
}

/// 学习通班级：接受邀请入班
#[tauri::command]
pub(crate) async fn chaoxing_class_accept_invite(
    state: State<'_, AppState>,
    req: ChaoxingClassInviteRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::chaoxing_class::accept_invite(
        &mut client,
        &req.invite_code,
        req.portal_password.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

/// 学习通班级：资料列表
#[tauri::command]
pub(crate) async fn chaoxing_class_list_resources(
    state: State<'_, AppState>,
    req: ChaoxingClassResourcesRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::chaoxing_class::list_resources(
        &mut client,
        &req.course_id,
        &req.clazz_id,
        modules::chaoxing_class::ListResourcesOpts {
            cpi: req.cpi,
            parent_data_id: req.parent_data_id,
            data_name: req.data_name,
            parent_chain: req.parent_chain,
            folder_kind: req.folder_kind,
        },
    )
    .await
    .map_err(|e| e.to_string())
}

/// 学习通 SSO 诊断（不含密码）
#[tauri::command]
pub(crate) async fn chaoxing_sso_get_diag() -> Result<serde_json::Value, String> {
    Ok(modules::chaoxing_sso::get_sso_diag())
}

/// 学习通班级：解析资料预览/下载 URL
#[tauri::command]
pub(crate) async fn chaoxing_class_resolve_resource(
    state: State<'_, AppState>,
    req: ChaoxingClassResourceAccessRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::chaoxing_class::resolve_resource_access(
        &mut client,
        &req.course_id,
        &req.clazz_id,
        &req.data_id,
        req.object_id.as_deref(),
        req.cpi.as_deref(),
        req.file_name.as_deref(),
        req.file_type.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

/// 学习通班级：用会话 cookie 下载课件到本机（#358/#359）
/// - 鉴权拉取 + 重试 + Range 续传/多分片
/// - 移动端优先缓存目录，前端再调系统分享（方案 A）
#[tauri::command]
pub(crate) async fn chaoxing_class_download_resource(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    req: ChaoxingClassDownloadRequest,
) -> Result<serde_json::Value, String> {
    use tauri::Manager;

    // 选落盘根目录：移动优先 cache/app_data（再分享）；桌面优先 Downloads
    let is_mobile = cfg!(target_os = "android") || cfg!(target_os = "ios");
    let mut candidates: Vec<(std::path::PathBuf, &'static str)> = Vec::new();
    if is_mobile {
        if let Ok(dir) = app.path().app_cache_dir() {
            candidates.push((dir, "cache"));
        }
        if let Ok(dir) = app.path().app_data_dir() {
            candidates.push((dir, "app_data"));
        }
        if let Ok(dir) = app.path().download_dir() {
            candidates.push((dir, "download"));
        }
    } else {
        if let Ok(dir) = app.path().download_dir() {
            candidates.push((dir, "download"));
        }
        if let Ok(dir) = app.path().document_dir() {
            candidates.push((dir, "document"));
        }
        if let Ok(dir) = app.path().app_data_dir() {
            candidates.push((dir, "app_data"));
        }
    }
    if candidates.is_empty() {
        return Err("无法定位本机可写目录".into());
    }

    let (base_dir, dir_label) = &candidates[0];
    let export_dir = base_dir.join("Mini-HBUT-Chaoxing");
    std::fs::create_dir_all(&export_dir)
        .map_err(|e| format!("创建目录失败({}): {}", dir_label, e))?;

    // 续传 part：按 data_id 固定名，避免多文件冲突
    let part_name = format!(".part_{}.download", req.data_id.trim());
    let part_path = export_dir.join(&part_name);

    let mut client = state.client.write().await;
    let (bytes, file_name, source_url) =
        modules::chaoxing_class::download_resource_bytes_with_part(
            &mut client,
            &req.course_id,
            &req.clazz_id,
            &req.data_id,
            req.object_id.as_deref(),
            req.cpi.as_deref(),
            req.file_name.as_deref(),
            Some(part_path.as_path()),
        )
        .await
        .map_err(|e| e.to_string())?;
    drop(client);

    // 成功后清理 part
    let _ = std::fs::remove_file(&part_path);

    // 重名追加序号
    let mut path = export_dir.join(&file_name);
    if path.exists() {
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s))
            .unwrap_or_default();
        for i in 1..50 {
            let alt = export_dir.join(format!("{} ({}){}", stem, i, ext));
            if !alt.exists() {
                path = alt;
                break;
            }
        }
    }

    // 先写 part 再 rename，便于中断后续传（完整文件）
    let tmp = export_dir.join(format!("{}.writing", part_name));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("写入失败: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("重命名失败: {}", e))?;

    let path_str = path.to_string_lossy().to_string();
    let file_uri = if path_str.starts_with("file:") {
        path_str.clone()
    } else {
        format!("file:///{}", path_str.replace('\\', "/"))
    };

    Ok(serde_json::json!({
        "success": true,
        "path": path_str,
        "file_uri": file_uri,
        "file_name": path.file_name().and_then(|s| s.to_str()).unwrap_or(&file_name),
        "bytes": bytes.len(),
        "source_url": source_url,
        "mobile_share": is_mobile,
        "hint": if is_mobile {
            "已下载，请在系统分享面板中保存或发给好友"
        } else {
            "已用学习通会话下载到本机（非系统浏览器）"
        },
    }))
}

#[tauri::command]
pub(crate) async fn chaoxing_fetch_courses(
    state: State<'_, AppState>,
    req: ChaoxingCoursesRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::online_learning::chaoxing_fetch_courses(
        &mut client,
        req.student_id.as_deref(),
        req.force.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_fetch_course_outline(
    state: State<'_, AppState>,
    req: ChaoxingCourseOutlineRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::online_learning::chaoxing_fetch_course_outline(&mut client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_fetch_course_progress(
    state: State<'_, AppState>,
    req: ChaoxingCourseProgressRequest,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    modules::online_learning::chaoxing_fetch_course_progress(&mut client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_get_launch_url(
    _state: State<'_, AppState>,
    req: ChaoxingLaunchUrlRequest,
) -> Result<serde_json::Value, String> {
    modules::online_learning::chaoxing_get_launch_url(&req).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_create_qr_login(
    state: State<'_, AppState>,
    req: YuketangQrCreateRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_create_qr_login(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_poll_qr_login(
    state: State<'_, AppState>,
    req: YuketangPollQrLoginRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_poll_qr_login(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_fetch_courses(
    state: State<'_, AppState>,
    req: YuketangCoursesRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_fetch_courses(
        &client,
        req.student_id.as_deref(),
        req.force.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_fetch_course_outline(
    state: State<'_, AppState>,
    req: YuketangCourseOutlineRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_fetch_course_outline(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_fetch_course_progress(
    state: State<'_, AppState>,
    req: YuketangCourseProgressRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_fetch_course_progress(&client, &req)
        .await
        .map_err(|e| e.to_string())
}

// ── 自动刷课 Tauri Commands ──

#[tauri::command]
pub(crate) async fn chaoxing_get_knowledge_cards(
    state: State<'_, AppState>,
    req: ChaoxingKnowledgeCardsRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::chaoxing_get_knowledge_cards(
        &client,
        &req.clazz_id,
        &req.course_id,
        &req.knowledge_id,
        &req.cpi,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_get_video_status(
    state: State<'_, AppState>,
    req: ChaoxingVideoStatusRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::chaoxing_get_video_status(&client, &req.object_id, &req.fid)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_fetch_course_score(
    state: State<'_, AppState>,
    req: ChaoxingCourseScoreRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::chaoxing_fetch_course_score(
        &client,
        &req.course_id,
        &req.clazz_id,
        &req.cpi,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn chaoxing_report_progress(
    state: State<'_, AppState>,
    req: ChaoxingReportProgressRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::chaoxing_report_progress(
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
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_get_course_chapters(
    state: State<'_, AppState>,
    req: YuketangCourseChaptersRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_get_course_chapters(&client, &req.classroom_id, &req.sign)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_get_leaf_info(
    state: State<'_, AppState>,
    req: YuketangLeafInfoRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_get_leaf_info(&client, &req.classroom_id, &req.leaf_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn yuketang_send_heartbeat(
    state: State<'_, AppState>,
    req: YuketangHeartbeatRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    modules::online_learning::yuketang_send_heartbeat(&client, &req.classroom_id, &req.events)
        .await
        .map_err(|e| e.to_string())
}
