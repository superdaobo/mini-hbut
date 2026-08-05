//! 教学评价 Tauri commands。

use tauri::State;

use crate::app_state::AppState;
use crate::modules;

#[tauri::command]
pub(crate) async fn teaching_eval_list(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.read().await;
    let response = modules::teaching_eval::list_evals(&client).await;
    serde_json::to_value(response).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn teaching_eval_form(
    state: State<'_, AppState>,
    eval_id: String,
) -> Result<serde_json::Value, String> {
    let client = state.client.read().await;
    let response = modules::teaching_eval::fetch_form(&client, &eval_id).await;
    serde_json::to_value(response).map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn teaching_eval_submit(
    state: State<'_, AppState>,
    eval_id: String,
    answers: Option<Vec<serde_json::Value>>,
    quick_full_score: Option<bool>,
) -> Result<serde_json::Value, String> {
    let client = state.client.read().await;
    let list = answers.unwrap_or_default();
    let response = modules::teaching_eval::submit_eval(
        &client,
        &eval_id,
        &list,
        quick_full_score.unwrap_or(false),
    )
    .await;
    serde_json::to_value(response).map_err(|e| e.to_string())
}
