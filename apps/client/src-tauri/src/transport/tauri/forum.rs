//! 校务信箱与智慧迎新 Tauri commands。

use tauri::State;

use crate::app_state::AppState;
use crate::modules;

#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn school_inbox_fetch(
    state: State<'_, AppState>,
    login_mode: Option<String>,
    force: Option<bool>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let mode = login_mode.unwrap_or_default();
    let force = force.unwrap_or(false);
    let response = modules::school_inbox::fetch_school_inbox_ex(&mut client, &mode, force).await?;
    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub(crate) async fn school_inbox_detail_fetch(
    state: State<'_, AppState>,
    login_mode: Option<String>,
    item_id: String,
    fallback: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let mode = login_mode.unwrap_or_default();
    let fallback_item = fallback.and_then(|value| {
        serde_json::from_value::<modules::school_inbox::SchoolInboxItem>(value).ok()
    });
    let response = modules::school_inbox::fetch_school_inbox_detail(
        &mut client,
        &mode,
        &item_id,
        fallback_item,
    )
    .await?;
    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub(crate) async fn school_inbox_mark_read(
    state: State<'_, AppState>,
    login_mode: Option<String>,
    item_id: String,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let mode = login_mode.unwrap_or_default();
    let response =
        modules::school_inbox::mark_school_inbox_read(&mut client, &mode, &item_id).await?;
    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}

/// 智慧迎新：overview 面板列表（只读）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn smart_orientation_list_panels(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // write：可能静默续期 CAS（#485 个人信息复用）
    let mut client = state.client.write().await;
    let response = modules::smart_orientation::list_panels(&mut client).await?;
    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}

/// 智慧迎新：消息列表（只读）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn smart_orientation_list_messages(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let response = modules::smart_orientation::list_messages(&mut client).await?;
    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}

/// 智慧迎新：班导师/辅导员/宿舍/个人信息（只读）
#[tauri::command(rename_all = "camelCase")]
pub(crate) async fn smart_orientation_profile_blocks(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let response = modules::smart_orientation::profile_blocks(&mut client).await?;
    Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
}
