//! 图书馆预约（超星 reserve）Tauri 命令层（#1052 地基）
//!
//! 只暴露「应用目录」与「真实入口 + 凭证解析」两类命令；
//! 具体业务接口（余量 / 时段 / 我的预约）由 #1053 / #1054 在各自模块中实现。
//!
//! 错误类型为 [`LibraryReserveError`]（实现 `Serialize`），
//! 前端可依据 `kind` 区分「未登录超星 / 已登录无权限 / 网络不可达」。

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

use crate::app_state::AppState;
use crate::modules::library_reserve::{
    self, LibraryApp, LibraryReserveError, ERR_CHAOXING_NOT_LOGGED_IN, ERR_NETWORK_UNREACHABLE,
};

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
    let entry = library_reserve::resolve_entry(&mut client, app, req.force.unwrap_or(false)).await?;
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
