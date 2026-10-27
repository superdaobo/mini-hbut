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
//! - 会话 / 凭证 / 权限 / 网络：`chaoxing_not_logged_in` / `credential_invalid`（凭证未取得或失效，
//!   可重试）/ `no_permission` / `network_unreachable`；
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
    self, LibraryApp, LibraryReserveError, ERR_CHAOXING_NOT_LOGGED_IN, ERR_INVALID_PARAMS,
    ERR_NETWORK_UNREACHABLE,
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

/// 取消预约请求体（**契约已实测**，2026-10-19）
///
/// 官方页面：`reserve/item/user/cancel` + `{ id, allCancel }`。
/// `id` 是「我的预约」条目的记录 ID；`aprvId` 实测恒为 0，**不能作主键**。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveCancelRequest {
    pub app: String,
    #[serde(default)]
    pub force: Option<bool>,
    /// 预约记录 ID（来自「我的预约」列表的 `id`）
    pub id: String,
    /// 是否同时取消同组预约（默认 false）
    #[serde(default)]
    pub all_cancel: Option<bool>,
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

/// 预约对象时段设置请求体（实测：`reserveId` / `itemId` / `fidEnc`）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveItemSettingRequest {
    pub app: String,
    #[serde(default)]
    pub force: Option<bool>,
    /// 预约对象（房间）ID，来自房间列表的 `itemId`
    pub item_id: i64,
}

/// 预约对象时段设置（拿到**真实时段 ID**，提交时组装 `reserveUsers[].intervalIds`）。
///
/// `POST reserve/item/setting` 返回 `data.commonIntervalMap["1".."7"]`，每项含
/// `id / startTime / endTime / week / available`。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_item_setting(
    state: State<'_, AppState>,
    req: LibraryReserveItemSettingRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let setting = library_reserve_pc::fetch_item_setting(
        &mut client,
        app,
        req.item_id,
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "intervals": setting.intervals,
        "raw": setting.raw,
    }))
}

/// 预约对象**实时占用**请求体（#1080）。
///
/// ⚠️ 嵌套字段一律 **snake_case**（命令级 `rename_all = "camelCase"` 不影响结构体字段）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveItemOccupancyRequest {
    /// 应用标识：`quiet_room`（静音仓）/ `seminar_room`（研讨室）
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
    /// 预约对象（房间）ID，来自房间列表的 `itemId`
    pub item_id: i64,
    /// 起始日期 `YYYY-MM-DD`（含）
    pub start_time: String,
    /// 结束日期 `YYYY-MM-DD`（含）
    pub end_time: String,
}

/// 预约对象**实时占用**（`GET reserve/item/user/list` + 服务端时间 `reserve/special/rule`）。
///
/// 返回：
/// - `records`：占用记录（`intervalId` + `date` + `reserveNum`，前端按 `intervalId_date` 聚合）；
/// - `serverNow`：服务端当前时间（Unix 毫秒；取不到为 `null` → 前端不做时间置灰）；
/// - `unkeyed`：无法归属到「时段 + 日期」的记录数（`> 0` → 前端必须按「占用未知」降级）。
///
/// ⚠️ `reserve/item/setting` 的 `available` 只是**配置层**开放标记，**不是**实时占用；
/// 本命令才是「某天某时段是否已被别人约满」的依据。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_item_occupancy(
    state: State<'_, AppState>,
    req: LibraryReserveItemOccupancyRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let mut client = state.client.write().await;
    let occupancy = library_reserve_pc::fetch_item_occupancy(
        &mut client,
        app,
        req.item_id,
        &req.start_time,
        &req.end_time,
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "records": occupancy.records,
        "serverNow": occupancy.server_now_ms,
        "unkeyed": occupancy.unkeyed,
        "raw": occupancy.raw,
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

/// 取消预约（**契约已实测**：记录 `id` + `allCancel`）。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_cancel(
    state: State<'_, AppState>,
    req: LibraryReserveCancelRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_pc_app(&req.app)?;
    let cancel = CancelReserveRequest {
        id: req.id,
        all_cancel: req.all_cancel.unwrap_or(false),
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

// ── #1054：座位预约余量查询 / 找空座位（POST 表单） ──

/// 区域列表请求体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveSeatLevelsRequest {
    /// 应用标识：`seat`（座位预约）；也接受 mAppId `19248837` 与中文名
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
    /// 层级：0 一级 / 1 二级 / 2 三级
    pub level_type: i64,
    /// 一级区域名（`level_type>=1` 时必填）
    #[serde(default)]
    pub first_level_name: Option<String>,
    /// 二级区域名（`level_type=2` 时必填）
    #[serde(default)]
    pub second_level_name: Option<String>,
}

/// 找空座位请求体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveSeatMatchRequest {
    /// 应用标识：`seat`（座位预约）
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
    /// 开始时间 `HH:mm`
    pub start_time: String,
    /// 结束时间 `HH:mm`
    pub end_time: String,
    /// 一级区域名（可选；不传 = 任意区域）
    #[serde(default)]
    pub first_level_name: Option<String>,
    /// 二级区域名（可选）
    #[serde(default)]
    pub second_level_name: Option<String>,
    /// 三级区域名（可选）
    #[serde(default)]
    pub third_level_name: Option<String>,
}

/// 房间列表（容量 / 放号 / 开放时间）。
///
/// `POST seatengine/room/list`。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_rooms(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let rooms =
        library_reserve_seat::fetch_seat_rooms(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({
        "success": true,
        "rooms": rooms.rooms,
        "raw": rooms.raw,
    }))
}

/// 区域列表（按层级：0 一级 / 1 二级 / 2 三级）。
///
/// `POST seatengine/levels`。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_levels(
    state: State<'_, AppState>,
    req: LibraryReserveSeatLevelsRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    // 层级必须是 0/1/2；否则前端传参有误，本地拦截（不发请求）。
    // 常量取自模块层，保证「命令层校验」与「模块层解析」共用同一份取值定义。
    if !matches!(
        req.level_type,
        library_reserve_seat::LEVEL_TYPE_FIRST
            | library_reserve_seat::LEVEL_TYPE_SECOND
            | library_reserve_seat::LEVEL_TYPE_THIRD
    ) {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!(
                "区域层级 level_type={} 非法；应为 0（一级）/ 1（二级）/ 2（三级）",
                req.level_type
            ),
        ));
    }
    let mut client = state.client.write().await;
    let levels = library_reserve_seat::fetch_seat_levels(
        &mut client,
        app,
        req.level_type,
        req.first_level_name.as_deref(),
        req.second_level_name.as_deref(),
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "levelType": levels.level_type,
        "levels": levels.levels,
        "raw": levels.raw,
    }))
}

/// 当日可选时间范围（`startOffsetMs` / `endOffsetMs` 为当日毫秒偏移）。
///
/// `POST seatengine/getstartendtime`。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_time_range(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let range =
        library_reserve_seat::fetch_seat_time_range(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({
        "success": true,
        "ymd": range.ymd,
        "startOffsetMs": range.start_offset_ms,
        "endOffsetMs": range.end_offset_ms,
        "pauseTimes": range.pause_times,
        "raw": range.raw,
    }))
}

/// 按时间找空座位（余量匹配）。
///
/// `POST seatengine/getseatinfo`；返回**单个**匹配座位（服务端自动分配，非座位图）。
/// ⚠️ 该座位会被服务端临时锁定，需在倒计时内提交（提交能力不在本命令组内）。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_match(
    state: State<'_, AppState>,
    req: LibraryReserveSeatMatchRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let result = library_reserve_seat::fetch_seat_match(
        &mut client,
        app,
        &req.start_time,
        &req.end_time,
        req.first_level_name.as_deref(),
        req.second_level_name.as_deref(),
        req.third_level_name.as_deref(),
        req.force.unwrap_or(false),
    )
    .await?;
    Ok(json!({
        "success": true,
        "match": result.matched,
        "raw": result.raw,
    }))
}

// ── #1054：座位预约提交（快速预约链路） ──

/// 提交座位预约请求体。
///
/// ⚠️ 嵌套字段沿用仓库既有约定 **snake_case**（与 `start_time` / `aprv_id` 一致）；
/// 命令级 `rename_all = "camelCase"` 只影响命令入参名，不影响本结构体。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryReserveSeatSubmitRequest {
    /// 应用标识：`seat`（座位预约）
    pub app: String,
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
    /// 房间 ID（来自「找空座位」结果的 `roomId`）
    pub room_id: i64,
    /// 座位号（**保留前导零的字符串**，如 `"016"`）
    pub seat_num: String,
    /// 开始时间 `HH:mm`
    pub start_time: String,
    /// 结束时间 `HH:mm`
    pub end_time: String,
    /// 预约日期 `YYYY-MM-DD`
    pub day: String,
    /// 验证码（用户按验证码图片输入）
    pub captcha: String,
    /// 客户端签名（由前端计算后传入；本层原样透传）
    pub enc: String,
}

/// 提交前准备：验证码图片 + 页面注入的提交随机串。
///
/// `POST seat/captcha`（验证码与会话绑定，必须由同一会话即时获取）+
/// 抓取 `/front/apps/seatengine/live/select` 提取 `#submit_enc`（best-effort）。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_submit_prepare(
    state: State<'_, AppState>,
    req: LibraryReserveSeatRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let mut client = state.client.write().await;
    let prepare =
        library_reserve_seat::prepare_seat_submit(&mut client, app, req.force.unwrap_or(false))
            .await?;
    Ok(json!({
        "success": true,
        "captchaUrl": prepare.captcha_url,
        "submitEnc": prepare.submit_enc,
        "raw": prepare.raw,
    }))
}

/// 提交座位预约（**写操作**：只有显式成功才算成功，否则原样抛出服务端 `msg`）。
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn library_reserve_seat_submit(
    state: State<'_, AppState>,
    req: LibraryReserveSeatSubmitRequest,
) -> Result<serde_json::Value, LibraryReserveError> {
    let app = parse_seat_app(&req.app)?;
    let submit = library_reserve_seat::SeatSubmitRequest {
        room_id: req.room_id,
        seat_num: req.seat_num,
        start_time: req.start_time,
        end_time: req.end_time,
        day: req.day,
        captcha: req.captcha,
        enc: req.enc,
    };
    let mut client = state.client.write().await;
    let outcome = library_reserve_seat::submit_seat_reservation(
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

#[cfg(test)]
mod tests {
    //! 命令层纯逻辑契约（#1058）。
    //!
    //! 只覆盖「不触网」的部分：应用标识解析（命令组互斥）、请求体字段形状与
    //! 错误分支可判别性。真实链路（SSO / 接口）由模块层的既有测试与人工实测覆盖。

    use super::*;
    use crate::modules::library_reserve::ERR_INVALID_APP;

    // ── 应用标识解析：PC / seat 两组命令互斥 ──

    #[test]
    fn parse_pc_app_accepts_rooms_and_rejects_seat() {
        // 静音仓 / 研讨室：key、mAppId、中文名均可
        assert_eq!(parse_pc_app("quiet_room").unwrap(), LibraryApp::QuietRoom);
        assert_eq!(parse_pc_app("19261750").unwrap(), LibraryApp::QuietRoom);
        assert_eq!(parse_pc_app("静音仓预约").unwrap(), LibraryApp::QuietRoom);
        assert_eq!(
            parse_pc_app("seminar_room").unwrap(),
            LibraryApp::SeminarRoom
        );
        assert_eq!(parse_pc_app("19248835").unwrap(), LibraryApp::SeminarRoom);

        // 座位预约属 seatengine，必须被 PC 命令组明确拒绝（而不是误当成静音仓）
        for raw in ["seat", "19248837", "座位预约"] {
            let err = parse_pc_app(raw).expect_err("座位预约不应被 PC 命令组接受");
            assert_eq!(err.kind, ERR_INVALID_APP);
            assert!(
                err.message.contains("seatengine"),
                "错误应说明归属：{}",
                err.message
            );
        }

        // 未知标识同样是 invalid_app
        assert_eq!(parse_pc_app("nope").unwrap_err().kind, ERR_INVALID_APP);
        assert_eq!(parse_pc_app("").unwrap_err().kind, ERR_INVALID_APP);
    }

    #[test]
    fn parse_seat_app_accepts_seat_and_rejects_rooms() {
        assert_eq!(parse_seat_app("seat").unwrap(), LibraryApp::Seat);
        assert_eq!(parse_seat_app("19248837").unwrap(), LibraryApp::Seat);
        assert_eq!(parse_seat_app("座位预约").unwrap(), LibraryApp::Seat);

        for raw in ["quiet_room", "seminar_room", "19261750", "19248835"] {
            let err = parse_seat_app(raw).expect_err("非座位预约不应被 seat 命令组接受");
            assert_eq!(err.kind, ERR_INVALID_APP);
            assert!(
                err.message.contains("reservepc"),
                "错误应说明归属：{}",
                err.message
            );
        }

        assert_eq!(parse_seat_app("nope").unwrap_err().kind, ERR_INVALID_APP);
    }

    #[test]
    fn pc_and_seat_command_groups_are_mutually_exclusive() {
        // 每个应用恰好归属一个命令组：互斥且完备，避免「两边都收」或「两边都不收」
        for app in LibraryApp::all() {
            let in_pc = parse_pc_app(app.key()).is_ok();
            let in_seat = parse_seat_app(app.key()).is_ok();
            assert!(
                in_pc ^ in_seat,
                "应用 {} 必须恰好归属一个命令组（pc={in_pc}, seat={in_seat}）",
                app.key()
            );
            assert_eq!(in_seat, app == LibraryApp::Seat);
        }
    }

    // ── 请求体形状：snake_case 字段名 + 可选字段默认 ──

    #[test]
    fn resolve_requests_accept_app_and_default_force() {
        let one: LibraryReserveResolveRequest =
            serde_json::from_value(json!({ "app": "seat" })).expect("解析");
        assert_eq!(one.app, "seat");
        assert_eq!(one.force, None, "force 缺省应为 None，不强制重跑 SSO");

        let all: LibraryReserveResolveAllRequest = serde_json::from_value(json!({})).expect("解析");
        assert_eq!(all.force, None);
    }

    #[test]
    fn pc_requests_use_snake_case_fields() {
        let pc: LibraryReservePcRequest =
            serde_json::from_value(json!({ "app": "quiet_room", "force": true })).expect("解析");
        assert_eq!(pc.app, "quiet_room");
        assert_eq!(pc.force, Some(true));

        let time: LibraryReserveTimeListRequest = serde_json::from_value(json!({
            "app": "quiet_room",
            "start_time": "2026-10-16",
            "end_time": "2026-10-17"
        }))
        .expect("解析");
        assert_eq!(time.start_time.as_deref(), Some("2026-10-16"));
        assert_eq!(time.end_time.as_deref(), Some("2026-10-17"));

        // 命令层契约固定 snake_case：驼峰字段名被忽略（回落默认值），不会污染请求
        let camel: LibraryReserveTimeListRequest =
            serde_json::from_value(json!({ "app": "quiet_room", "startTime": "X" })).expect("解析");
        assert_eq!(
            camel.start_time, None,
            "驼峰字段名不应被接受（契约固定 snake_case）"
        );

        let dialog: LibraryReserveDialogRequest = serde_json::from_value(json!({
            "app": "quiet_room",
            "dialog_agree_status": true
        }))
        .expect("解析");
        assert_eq!(dialog.dialog_agree_status, Some(true));
    }

    #[test]
    fn submit_request_shape_and_defaults() {
        let submit: LibraryReserveSubmitRequest = serde_json::from_value(json!({
            "app": "seminar_room",
            "aprv_id": " 42 ",
            "cycle_type": 1,
            "form_data": { "userName": "张三" }
        }))
        .expect("解析");
        assert_eq!(submit.app, "seminar_room");
        // 命令层不做 trim（去空白属模块层职责），此处只锁形状
        assert_eq!(submit.aprv_id.as_deref(), Some(" 42 "));
        assert_eq!(submit.cycle_type, Some(1));
        assert_eq!(
            submit.form_data.get("userName").map(String::as_str),
            Some("张三")
        );
        // 未提供的可选字段回落默认（空 map / None），不 panic
        assert!(submit.extra.is_empty());
        assert_eq!(submit.form_user_id, None);
        assert_eq!(submit.aprv_status_type_id, None);
    }

    #[test]
    fn cancel_request_requires_record_id() {
        // id 必填：缺失即解析失败，而不是静默提交空 ID
        let err = serde_json::from_value::<LibraryReserveCancelRequest>(json!({
            "app": "quiet_room"
        }))
        .expect_err("缺少 id 应解析失败");
        assert!(err.to_string().contains("id"), "错误应指出缺失字段：{err}");

        let cancel: LibraryReserveCancelRequest = serde_json::from_value(json!({
            "app": "quiet_room",
            "id": "30035270"
        }))
        .expect("解析");
        assert_eq!(cancel.id, "30035270");
        // all_cancel 缺省为 None（模块层按 false 处理）
        assert_eq!(cancel.all_cancel, None);
        // 嵌套字段为 snake_case（all_cancel）
        let cancel: LibraryReserveCancelRequest = serde_json::from_value(json!({
            "app": "quiet_room",
            "id": "30035270",
            "all_cancel": true
        }))
        .expect("解析");
        assert_eq!(cancel.all_cancel, Some(true));
    }

    #[test]
    fn item_setting_request_shape() {
        let req: LibraryReserveItemSettingRequest = serde_json::from_value(json!({
            "app": "quiet_room",
            "item_id": 49091
        }))
        .expect("解析");
        assert_eq!(req.item_id, 49091);
        assert_eq!(req.force, None);
    }

    #[test]
    fn item_occupancy_request_shape_and_required_fields() {
        // #1080：item_id / start_time / end_time 必填，嵌套字段 snake_case
        let req: LibraryReserveItemOccupancyRequest = serde_json::from_value(json!({
            "app": "quiet_room",
            "item_id": 49091,
            "start_time": "2026-10-19",
            "end_time": "2026-10-25"
        }))
        .expect("解析");
        assert_eq!(req.app, "quiet_room");
        assert_eq!(req.item_id, 49091);
        assert_eq!(req.start_time, "2026-10-19");
        assert_eq!(req.end_time, "2026-10-25");
        assert_eq!(req.force, None);

        // 缺日期即解析失败（服务端对日期强校验，缺了会返回 400 HTML）
        for missing in ["start_time", "end_time", "item_id"] {
            let mut value = json!({
                "app": "quiet_room",
                "item_id": 49091,
                "start_time": "2026-10-19",
                "end_time": "2026-10-25"
            });
            value.as_object_mut().expect("对象").remove(missing);
            let err = serde_json::from_value::<LibraryReserveItemOccupancyRequest>(value)
                .expect_err("缺少必填字段应解析失败");
            assert!(
                err.to_string().contains(missing),
                "错误应指出缺失字段 {missing}：{err}"
            );
        }

        // 驼峰字段名不被接受（会 missing field，实测踩过）
        let err = serde_json::from_value::<LibraryReserveItemOccupancyRequest>(json!({
            "app": "quiet_room",
            "item_id": 49091,
            "startTime": "2026-10-19",
            "endTime": "2026-10-25"
        }))
        .expect_err("驼峰字段名不应被接受");
        assert!(err.to_string().contains("start_time"), "{err}");
    }

    #[test]
    fn seat_requests_share_same_shape() {
        for raw in ["seat", "19248837"] {
            let req: LibraryReserveSeatRequest =
                serde_json::from_value(json!({ "app": raw })).expect("解析");
            assert_eq!(req.app, raw);
            assert_eq!(req.force, None);
        }
    }

    #[test]
    fn seat_levels_request_shape_and_defaults() {
        let req: LibraryReserveSeatLevelsRequest = serde_json::from_value(json!({
            "app": "seat",
            "level_type": 1,
            "first_level_name": "四楼D区（有插座）"
        }))
        .expect("解析");
        assert_eq!(req.app, "seat");
        assert_eq!(req.level_type, 1);
        assert_eq!(req.first_level_name.as_deref(), Some("四楼D区（有插座）"));
        assert_eq!(req.second_level_name, None);
        assert_eq!(req.force, None);

        // level_type 必填：缺失即解析失败，而不是静默当成一级
        let err =
            serde_json::from_value::<LibraryReserveSeatLevelsRequest>(json!({ "app": "seat" }))
                .expect_err("缺少 level_type 应解析失败");
        assert!(
            err.to_string().contains("level_type"),
            "错误应指出缺失字段：{err}"
        );
    }

    #[test]
    fn seat_match_request_shape_and_defaults() {
        let req: LibraryReserveSeatMatchRequest = serde_json::from_value(json!({
            "app": "seat",
            "start_time": "09:00",
            "end_time": "11:00"
        }))
        .expect("解析");
        assert_eq!(req.start_time, "09:00");
        assert_eq!(req.end_time, "11:00");
        assert_eq!(req.first_level_name, None);
        assert_eq!(req.second_level_name, None);
        assert_eq!(req.third_level_name, None);

        // start_time / end_time 必填
        let err =
            serde_json::from_value::<LibraryReserveSeatMatchRequest>(json!({ "app": "seat" }))
                .expect_err("缺少时间应解析失败");
        assert!(
            err.to_string().contains("start_time"),
            "错误应指出缺失字段：{err}"
        );
    }

    #[test]
    fn seat_submit_request_uses_snake_case_fields() {
        let req: LibraryReserveSeatSubmitRequest = serde_json::from_value(json!({
            "app": "seat",
            "room_id": 10892,
            "seat_num": "016",
            "start_time": "09:00",
            "end_time": "11:00",
            "day": "2026-10-17",
            "captcha": "8a9b",
            "enc": "SIGN"
        }))
        .expect("解析");
        assert_eq!(req.app, "seat");
        assert_eq!(req.room_id, 10892);
        assert_eq!(req.seat_num, "016");
        assert_eq!(req.start_time, "09:00");
        assert_eq!(req.end_time, "11:00");
        assert_eq!(req.day, "2026-10-17");
        assert_eq!(req.captcha, "8a9b");
        assert_eq!(req.enc, "SIGN");
        assert_eq!(req.force, None);

        // 必填字段缺失 → 解析失败（不静默提交空值）
        let err = serde_json::from_value::<LibraryReserveSeatSubmitRequest>(json!({
            "app": "seat"
        }))
        .expect_err("缺少必填字段应解析失败");
        assert!(
            err.to_string().contains("room_id"),
            "错误应指出缺失字段：{err}"
        );

        // 命令层契约固定 snake_case：驼峰 roomId 被忽略
        let camel: LibraryReserveSeatSubmitRequest = serde_json::from_value(json!({
            "app": "seat",
            "room_id": 1,
            "seat_num": "1",
            "start_time": "09:00",
            "end_time": "10:00",
            "day": "2026-10-17",
            "captcha": "c",
            "enc": "e",
            "roomId": 999
        }))
        .expect("解析");
        assert_eq!(camel.room_id, 1, "驼峰字段名不应被接受");
    }

    // ── 错误分支可判别（前端按 kind 分支） ──

    #[test]
    fn invalid_app_error_serializes_kind_for_frontend() {
        let err = parse_pc_app("seat").unwrap_err();
        let value = serde_json::to_value(&err).expect("可序列化");
        assert_eq!(
            value.get("kind").and_then(|k| k.as_str()),
            Some(ERR_INVALID_APP)
        );
        // 参数类失败不能提示「重新登录」修复
        assert_eq!(
            value.get("canRelogin").and_then(|b| b.as_bool()),
            Some(false)
        );
    }
}
