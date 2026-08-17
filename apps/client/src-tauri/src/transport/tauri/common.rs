//! Tauri 传输层共享工具（跨领域命令复用）。
//!
//! 从 lib.rs 拆分：会话预热、payload 包装等通用传输辅助。

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::db;
use crate::http_client::HbutClient;
use crate::modules;
use crate::DB_FILENAME;

pub(crate) fn persist_electricity_tokens(client: &HbutClient) {
    let student_id = match client.user_info.as_ref() {
        Some(info) => info.student_id.clone(),
        None => return,
    };
    let (token_opt, refresh_opt, expires_opt) = client.get_electricity_session();
    let token = match token_opt {
        Some(t) if !t.trim().is_empty() => t,
        _ => return,
    };
    let refresh_token = refresh_opt.unwrap_or_default();
    let expires_at = expires_opt.map(|dt| dt.to_rfc3339()).unwrap_or_default();
    let _ = db::save_electricity_tokens(
        DB_FILENAME,
        &student_id,
        &token,
        &refresh_token,
        &expires_at,
    );
}

/// 登录成功后后台预热一码通 Token，避免阻塞返回用户信息。
/// 门户登录成功后后台预热 CAS→学习通 SSO（#324）
pub(crate) fn spawn_chaoxing_sso_warmup(client_arc: Arc<RwLock<HbutClient>>, student_id: String) {
    let sid = student_id.trim().to_string();
    if sid.is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut client = client_arc.write().await;
        modules::chaoxing_sso::preheat_after_portal_login(&mut client, &sid).await;
    });
}

pub(crate) fn spawn_electricity_session_warmup(
    client_arc: Arc<RwLock<HbutClient>>,
    session_key: String,
    password: String,
) {
    if session_key.trim().is_empty() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let (cookies, one_code_token, refresh_token, expires_at) = {
            let mut client = client_arc.write().await;
            let token = match client.ensure_electricity_token().await {
                Ok(t) => t,
                Err(e) => {
                    println!("[警告] 后台获取 one_code_token 失败: {}", e);
                    return;
                }
            };
            let (_token_opt, refresh_opt, expires_at_opt) = client.get_electricity_session();
            (
                client.get_cookies(),
                token,
                refresh_opt.unwrap_or_default(),
                expires_at_opt.map(|dt| dt.to_rfc3339()).unwrap_or_default(),
            )
        };
        if let Err(e) = db::save_user_session(
            DB_FILENAME,
            &session_key,
            &cookies,
            &password,
            &one_code_token,
            Some(refresh_token.as_str()),
            Some(expires_at.as_str()),
        ) {
            println!("[警告] 后台保存 one_code 会话失败: {}", e);
        }
        let client = client_arc.read().await;
        persist_electricity_tokens(&client);
    });
}

pub(crate) fn attach_sync_time(
    payload: serde_json::Value,
    sync_time: &str,
    offline: bool,
) -> serde_json::Value {
    match payload {
        serde_json::Value::Object(mut map) => {
            if !map.contains_key("success") {
                map.insert("success".to_string(), serde_json::Value::Bool(true));
            }
            map.insert(
                "sync_time".to_string(),
                serde_json::Value::String(sync_time.to_string()),
            );
            map.insert("offline".to_string(), serde_json::Value::Bool(offline));
            serde_json::Value::Object(map)
        }
        _ => serde_json::json!({
            "success": true,
            "data": payload,
            "sync_time": sync_time,
            "offline": offline
        }),
    }
}
