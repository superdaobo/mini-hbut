use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct OneCodeTokenResponse {
    pub success: bool,
    pub tid: String,
    pub result_data: serde_json::Value,
}

/// 获取一码通 Token（对齐 backend/modules/fast_auth.py 逻辑）
#[tauri::command]
pub async fn hbut_one_code_token(state: State<'_, AppState>) -> Result<OneCodeTokenResponse, String> {
    let mut client = state.client.lock().await;
    let res = client.get_one_code_token().await.map_err(|e| e.to_string())?;

    Ok(OneCodeTokenResponse {
        success: res.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
        tid: res.get("tid").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        result_data: res.get("resultData").cloned().unwrap_or_else(|| serde_json::json!({})),
    })
}
