//! 一码通/电费/流水与校园码 Tauri commands。

use tauri::State;

use crate::app_state::AppState;
use crate::db;
use crate::transport::tauri::common::{attach_sync_time, persist_electricity_tokens};
use crate::DB_FILENAME;

#[tauri::command]
pub(crate) async fn electricity_query_location(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let key_suffix = payload.to_string();
    let cache_key = uid.as_ref().map(|u| format!("{}:loc:{}", u, key_suffix));

    match client.query_electricity_location(payload).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "electricity_cache", key, &payload);
            }
            persist_electricity_tokens(&client);
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "electricity_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn electricity_query_account(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let key_suffix = payload.to_string();
    let cache_key = uid.as_ref().map(|u| format!("{}:acct:{}", u, key_suffix));

    match client.query_electricity_account(payload).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "electricity_cache", key, &payload);
            }
            persist_electricity_tokens(&client);
            Ok(payload)
        }
        Err(e) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "electricity_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn refresh_electricity_token(state: State<'_, AppState>) -> Result<bool, String> {
    let mut client = state.client.write().await;
    client
        .ensure_electricity_token()
        .await
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_transaction_history(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
    page_no: i32,
    page_size: i32,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let cache_key = uid.as_ref().map(|u| {
        format!(
            "{}:{}:{}:{}:{}",
            u, start_date, end_date, page_no, page_size
        )
    });

    match client
        .fetch_transaction_history(&start_date, &end_date, page_no, page_size)
        .await
    {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                let _ = db::save_cache(DB_FILENAME, "transaction_cache", key, &payload);
            }
            persist_electricity_tokens(&client);
            Ok(payload)
        }
        Err(e) => {
            println!(
                "[璀﹀憡] Transaction network fetch failed: {}, trying cache...",
                e
            );
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "transaction_cache", key)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn campus_code_fetch_config(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let result = client
        .query_campus_code_config(payload)
        .await
        .map_err(|e| e.to_string())?;
    persist_electricity_tokens(&client);
    Ok(result)
}

#[tauri::command]
pub(crate) async fn campus_code_fetch_qrcode(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let result = client
        .query_campus_code_qrcode(payload)
        .await
        .map_err(|e| e.to_string())?;
    persist_electricity_tokens(&client);
    Ok(result)
}

#[tauri::command]
pub(crate) async fn campus_code_fetch_order_status(
    state: State<'_, AppState>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut client = state.client.write().await;
    let result = client
        .query_campus_code_order_status(payload)
        .await
        .map_err(|e| e.to_string())?;
    persist_electricity_tokens(&client);
    Ok(result)
}
