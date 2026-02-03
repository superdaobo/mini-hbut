//! ä¸ç éæ¨¡åå°è£ã
//!
//! è´è´£è°ç¨ http_client çä¸ç é token è½åï¼å¹¶ç»ä¸è¿åæ°æ®ç»æã

use tauri::State;
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct OneCodeTokenResponse {
    pub success: bool,
    pub tid: String,
    pub result_data: serde_json::Value,
}

/// è·åä¸ç é Tokenï¼å¯¹é½ backend/modules/fast_auth.py é»è¾ï¼
#[tauri::command]
/// è·åä¸ç é token å¥å£
pub async fn hbut_one_code_token(state: State<'_, AppState>) -> Result<OneCodeTokenResponse, String> {
    let mut client = state.client.lock().await;
    let res = client.get_one_code_token().await.map_err(|e| e.to_string())?;

    Ok(OneCodeTokenResponse {
        success: res.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
        tid: res.get("tid").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        result_data: res.get("resultData").cloned().unwrap_or_else(|| serde_json::json!({})),
    })
}
