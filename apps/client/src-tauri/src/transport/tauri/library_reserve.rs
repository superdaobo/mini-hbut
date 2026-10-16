//! 图书馆预约（超星 reserve）Tauri 命令层。
//!
//! - **#1052 地基**：应用目录 + 真实入口 / 凭证解析（`library_reserve_list_apps` 等）；
//! - **#1053 业务**：静音仓 / 研讨室（PC 版 `reservepc` 接口体系）的查询、提交与取消；
//! - **#1054 业务**：座位预约（`seatengine` 接口体系）的**只读查询**
//!   （核心配置 / 开放时段 / 规则原文 / 我的预约 / 入口开关 / 文案 / 身份校验）。
//!   选座 / 提交 / 签到 / 暂离契约未抓到，**本层不提供、也不猜测**这些命令。
//!
//! 错误类型为 [`LibraryReserveError`]（实现 `Serialize`），前端可依据 `kind` 区分：
//!
//! - 会话 / 权限 / 网络：`chaoxing_not_logged_in` / `no_permission` / `network_unreachable`；
//! - 业务规则（#1053 / #1054 共用）：`slot_unavailable`（时段被占）/ `reserve_limit_exceeded`（超限）/
//!   `reserve_suspended`（违约停用）/ `business_rejected`（其它拒绝）/
//!   `invalid_params`（本地参数校验拦截）。
//!
//! ⚠️ 命令层请求体统一使用 **snake_case** 字段名（与仓库其它命令层一致）。
//! ⚠️ 座位预约的时间判断**必须以返回的 `serverNow` 为准**，不得使用本地时间。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

use crate::app_state::AppState;
use crate::modules::library_reserve::{
    self, LibraryApp, LibraryReserveError, ERR_CHAOXING_NOT_LOGGED_IN, ERR_NETWORK_UNREACHABLE,
};
use crate::modules::library_reserve_pc::{self, CancelReserveRequest, SubmitReserveRequest};
use crate::modules::library_reserve_seat;

/// 解析单个应用入口
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveResolveRequest {
    /// 应用标识：`seat` / `quiet_room` / `seminar_room`（也接受 mAppId 与中文名）
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false：复用进程内 SSO 缓存）
    #[serde(default)]
    pub force: Option<bool>,
}

/// 解析全部三套应用入口
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LibraryReserveResolveAllRequest {
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
}

/// 三套预约系统的静态目录（mAppId / 系统路径 / 业务主键；**不含时效凭证**）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_list_apps() -> Result<serde_json::Value, LibraryReserveError> {
    Ok(json!({
        "success": true,
        "apps": library_reserve::app_catalog(),
        "hint": "此处仅返回稳定标识；enc/fidEnc/uid 等凭证为短时效，需调用 library_reserve_resolve_entry 实时获取",
    }))
}

/// 解析指定应用的真实系统入口地址与凭证
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_resolve_entry(
    state: State<'_, AppState>,
    req: LibraryReserveResolveRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = LibraryApp::from_key(&req.app).ok_or_else(|| {
        LibraryReserveError::invalid_app(format!(
            "未知应用标识「{}」；可选值：seat / quiet_room / seminar_room（或对应 mAppId）",
            req.app
        ))
    })?;

    let mut client = state.client.write().await;
    let entry =
        library_reserve::resolve_entry(&mut client, app, req.force.unwrap_or(false)).await?;
    Ok(json!({
        "success": true,
        "entry": entry,
    }))
}

/// 解析全部三套应用入口。
///
/// - 单个应用「无权限」不影响其它应用：逐项返回成功或失败；
/// - 「未登录超星」「网络不可达」属全局性失败，直接短路返回对应错误。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_resolve_all(
    state: State<'_, AppState>,
    req: LibraryReserveResolveAllRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let force = req.force.unwrap_or(false);
    let mut client = state.client.write().await;

    let apps = LibraryApp::all();
    let mut entries: Vec<serde_json::Value> = Vec::with_capacity(apps.len());
    let mut resolved_count = 0usize;

    for (index, app) in apps.iter().enumerate() {
        // SSO 只在首轮 force：ensure_chaoxing_sso 自带进程内缓存，后续直接复用
        let force_this = force && index == 0;
        match library_reserve::resolve_entry(&mut client, *app, force_this).await {
            Ok(entry) => {
                resolved_count += 1;
                entries.push(json!({
                    "app": app.key(),
                    "appName": app.name(),
                    "ok": true,
                    "entry": entry,
                }));
            }
            Err(err) => {
                // 全局性失败：三套系统必然同样失败，直接短路，避免无意义的重试风暴
                if matches!(
                    err.kind.as_str(),
                    ERR_CHAOXING_NOT_LOGGED_IN | ERR_NETWORK_UNREACHABLE
                ) {
                    return Err(err);
                }
                entries.push(json!({
                    "app": app.key(),
                    "appName": app.name(),
                    "ok": false,
                    "error": err,
                }));
            }
        }
    }

    Ok(json!({
        "success": resolved_count > 0,
        "resolvedCount": resolved_count,
        "total": apps.len(),
        "entries": entries,
        "hint": "凭证为短时效值，请勿持久化；每次调用业务接口前重新解析",
    }))
}

// ── #1053：静音仓 / 研讨室（reservepc）业务命令 ──

/// 业务命令公共请求体（`app` + `force`）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReservePcRequest {
    /// 应用标识：`quiet_room`（静音仓）/ `seminar_room`（研讨室）；也接受 mAppId 与中文名
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false：复用进程内 SSO 缓存）
    #[serde(default)]
    pub force: Option<bool>,
}

/// 可预约时段请求体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveTimeListRequest {
    pub app: String,
    #[serde(default)]
    pub force: Option<bool>,
    /// 起始时间（可选；实测为空串时返回全量时段）
    #[serde(default)]
    pub start_time: Option<String>,
    /// 结束时间（可选）
    #[serde(default)]
    pub end_time: Option<String>,
}

/// 提醒对话框请求体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveDialogRequest {
    pub app: String,
    #[serde(default)]
    pub force: Option<bool>,
    /// 是否已同意提醒（默认 false，首次进入传 false 以拉取提醒内容）
    #[serde(default)]
    pub dialog_agree_status: Option<bool>,
}

/// 提交预约请求体
///
/// ⚠️ 提交接口的**完整字段契约未实测**（见 issue #1053）。已确认字段：
/// `aprv_id` / `aprv_status_type_id` / `form_user_id` / `cycle_type`；
/// `form_data` 用于回填 `customFormConfig` 渲染出的动态表单字段，
/// `extra` 为契约补齐前的透传逃生口（受保护键会被忽略）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveSubmitRequest {
    pub app: String,
    #[serde(default)]
    pub force: Option<bool>,
    #[serde(default)]
    pub aprv_id: Option<String>,
    #[serde(default)]
    pub aprv_status_type_id: Option<String>,
    #[serde(default)]
    pub form_user_id: Option<String>,
    #[serde(default)]
    pub cycle_type: Option<i64>,
    #[serde(default)]
    pub form_data: BTreeMap<String, String>,
    #[serde(default)]
    pub extra: BTreeMap<String, String>,
}

/// 取消预约请求体
///
/// ⚠️ 取消接口路径与字段契约**未实测**（见 issue #1053）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveCancelRequest {
    pub app: String,
    #[serde(default)]
    pub force: Option<bool>,
    /// 审批 / 预约记录 ID（来自「我的预约」列表）
    pub aprv_id: String,
    #[serde(default)]
    pub form_user_id: Option<String>,
    #[serde(default)]
    pub extra: BTreeMap<String, String>,
}

/// 解析静音仓 / 研讨室应用标识（座位预约属 seatengine，明确拦截并给出可读错误）
fn parse_pc_app(raw: &str) -> Result<LibraryApp, LibraryReserveError> {
    let app = LibraryApp::from_key(raw).ok_or_else(|| {
        LibraryReserveError::invalid_app(format!(
            "未知应用标识「{raw}」；本命令组仅支持 quiet_room（静音仓）/ seminar_room（研讨室）或其 mAppId"
        ))
    })?;
    if matches!(app, LibraryApp::Seat) {
        return Err(LibraryReserveError::invalid_app(
            "座位预约属于 seatengine 接口体系，不在静音仓/研讨室（reservepc）命令组内",
        ));
    }
    Ok(app)
}

/// 预约项详情（含 `advanceDays` / `durationLimitMin` / `dialogTitle` 等约束字段）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_item_info(
    state: State<'_, AppState>,
    req: LibraryReservePcRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let info =
        library_reserve_pc::fetch_item_info(&mut client, app, req.force.unwrap_or(false)).await?;
    Ok(json!({ "success": true, "info": info }))
}

/// 可预约时段列表（核心；含解析后的 `customFormConfig` 动态表单定义）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_time_list(
    state: State<'_, AppState>,
    req: LibraryReserveTimeListRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let list = library_reserve_pc::fetch_time_list(
        &mut client,
        app,
        req.start_time.as_deref(),
        req.end_time.as_deref(),
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "items": list.items,
        "advanceDays": list.advance_days,
        "raw": list.raw,
    }))
}

/// 我的预约列表
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_my_reservations(
    state: State<'_, AppState>,
    req: LibraryReservePcRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let list =
        library_reserve_pc::fetch_my_reservations(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({
        "success": true,
        "items": list.items,
        "total": list.total,
        "raw": list.raw,
    }))
}

/// 用户视图标记（`showStyle`）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_user_view_flag(
    state: State<'_, AppState>,
    req: LibraryReservePcRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let flag =
        library_reserve_pc::fetch_user_view_flag(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({ "success": true, "flag": flag }))
}

/// 是否开放团队预约
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_open_team(
    state: State<'_, AppState>,
    req: LibraryReservePcRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let team =
        library_reserve_pc::fetch_open_team(&mut client, app, req.force.unwrap_or(false)).await?;
    Ok(json!({ "success": true, "openTeam": team }))
}

/// 团队列表
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_team_list(
    state: State<'_, AppState>,
    req: LibraryReservePcRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let teams =
        library_reserve_pc::fetch_team_list(&mut client, app, req.force.unwrap_or(false)).await?;
    Ok(json!({ "success": true, "teams": teams }))
}

/// 人员角色（`roleListSelf`）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_person_roles(
    state: State<'_, AppState>,
    req: LibraryReservePcRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let roles =
        library_reserve_pc::fetch_person_roles(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({ "success": true, "roles": roles }))
}

/// 提醒对话框（GET）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_dialog(
    state: State<'_, AppState>,
    req: LibraryReserveDialogRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let dialog = library_reserve_pc::fetch_dialog(
        &mut client,
        app,
        req.dialog_agree_status.unwrap_or(false),
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({ "success": true, "dialog": dialog }))
}

/// 提交预约。
///
/// 业务失败（时段被占 / 超限 / 违约停用）以业务 `kind` 返回；网络失败以 `network_unreachable` 返回。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_submit(
    state: State<'_, AppState>,
    req: LibraryReserveSubmitRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let submit = SubmitReserveRequest {
        aprv_id: req.aprv_id,
        aprv_status_type_id: req.aprv_status_type_id,
        form_user_id: req.form_user_id,
        cycle_type: req.cycle_type,
        form_data: req.form_data,
        extra: req.extra,
    };
    let mut client = state.client.write().await;
    let outcome = library_reserve_pc::submit_reservation(
        &mut client,
        app,
        &submit,
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "message": outcome.message,
        "data": outcome.data,
        "raw": outcome.raw,
    }))
}

/// 取消预约。
///
/// ⚠️ 取消接口路径与字段契约未实测（见 issue #1053）；`aprv_id` 必填。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_cancel(
    state: State<'_, AppState>,
    req: LibraryReserveCancelRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let cancel = CancelReserveRequest {
        aprv_id: req.aprv_id,
        form_user_id: req.form_user_id,
        extra: req.extra,
    };
    let mut client = state.client.write().await;
    let outcome = library_reserve_pc::cancel_reservation(
        &mut client,
        app,
        &cancel,
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "message": outcome.message,
        "data": outcome.data,
        "raw": outcome.raw,
    }))
}

// ── #1054：座位预约（seatengine）只读查询命令 ──

/// 座位预约命令公共请求体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveSeatRequest {
    /// 应用标识：`seat`（座位预约）；也接受 mAppId `19248837` 与中文名
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false：复用进程内 SSO 缓存）
    #[serde(default)]
    pub force: Option<bool>,
}

/// 解析座位预约应用标识（静音仓 / 研讨室属 reservepc，明确拦截并给出可读错误）
fn parse_seat_app(raw: &str) -> Result<LibraryApp, LibraryReserveError> {
    let app = LibraryApp::from_key(raw).ok_or_else(|| {
        LibraryReserveError::invalid_app(format!(
            "未知应用标识「{raw}」；本命令组仅支持 seat（座位预约）或其 mAppId 19248837"
        ))
    })?;
    if app != LibraryApp::Seat {
        return Err(LibraryReserveError::invalid_app(
            "静音仓 / 研讨室属于 reservepc 接口体系，不在座位预约（seatengine）命令组内",
        ));
    }
    Ok(app)
}

/// 座位预约核心配置（开放时段 / 放号时间 / 时长与限额 / 违约规则 / 规则原文 / 服务端时间）。
///
/// 同时返回当前预约（`currentReservations`）与最近预约（`recentReservations`）。
/// ⚠️ 前端判断开放时段**必须使用返回的 `serverNow`**，本地时间不可信。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_config(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let view = library_reserve_seat::fetch_seat_index(&mut client, app, req.force.unwrap_or(false))
        .await?;
    Ok(json!({
        "success": true,
        "config": view.config,
        "currentReservations": view.current_reservations,
        "recentReservations": view.recent_reservations,
        "serverNow": view.server_now,
        "serverNowSource": view.server_now_source,
        "raw": view.raw,
    }))
}

/// 我的座位预约（当前预约 + 最近预约）。
///
/// 契约里没有独立的「我的预约」端点，本命令与 [`library_reserve_seat_config`] 同源
/// （`seatengine/index` 的 `curReserves` / `nearReserves`）。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_my_reservations(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let mine =
        library_reserve_seat::fetch_my_reservations(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({
        "success": true,
        "current": mine.current,
        "recent": mine.recent,
        "serverNow": mine.server_now,
        "serverNowSource": mine.server_now_source,
        "raw": mine.raw,
    }))
}

/// 座位预约入口能力开关（含 `onlySupportsApiSignIn`：签到只能走接口）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_entrance_config(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let cfg =
        library_reserve_seat::fetch_entrance_config(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({ "success": true, "config": cfg }))
}

/// 座位预约身份校验
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_identity_verify(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let identity =
        library_reserve_seat::fetch_identity_verify(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({ "success": true, "identity": identity }))
}

/// 座位预约全量文案（`seat/i18n`；键空间未实测，原样透传）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_i18n(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let i18n =
        library_reserve_seat::fetch_i18n(&mut client, app, req.force.unwrap_or(false)).await?;
    Ok(json!({ "success": true, "i18n": i18n }))
}
