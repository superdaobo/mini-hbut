//! 雨课堂（Yuketang）会话域：cookie 提取/恢复、待定登录会话存储，
//! 以及二维码登录的创建与轮询。

use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::Duration;

use chrono::Utc;
use futures::{SinkExt, StreamExt};
use reqwest::cookie::Jar;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, protocol::Message},
};

use crate::db;
use crate::http_client::HbutClient;

use super::shared::{
    cookie_header_for_jar, err_box, generate_qr_data_uri, now_sync_time, parse_cookie_value,
    read_json_response, resolve_student_id, save_platform_state, DynError, PLATFORM_YUKETANG,
    YUKETANG_AUTHORIZE_URL, YUKETANG_WEB_URL,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingYuketangLogin {
    session_id: String,
    student_id: String,
    status: String,
    message: String,
    login_url: String,
    authorize_url: String,
    qr_code_url: String,
    ticket_url: String,
    account_id: String,
    created_at: String,
    expires_at: String,
}

fn yuketang_pending_store() -> &'static StdMutex<HashMap<String, PendingYuketangLogin>> {
    static STORE: OnceLock<StdMutex<HashMap<String, PendingYuketangLogin>>> = OnceLock::new();
    STORE.get_or_init(|| StdMutex::new(HashMap::new()))
}

pub(crate) fn yuketang_cookie_blob(client: &HbutClient) -> String {
    yuketang_cookie_blob_from_jar(&client.cookie_jar)
}

pub(crate) fn yuketang_cookie_blob_from_jar(jar: &Arc<Jar>) -> String {
    let root_cookie = cookie_header_for_jar(jar, "https://changjiang.yuketang.cn");
    let web_cookie = cookie_header_for_jar(jar, "https://changjiang.yuketang.cn/web");
    [root_cookie, web_cookie]
        .into_iter()
        .filter(|item| !item.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

pub(crate) fn has_yuketang_session(client: &HbutClient) -> bool {
    let blob = yuketang_cookie_blob(client);
    parse_cookie_value(&blob, "sessionid").is_some()
        || parse_cookie_value(&blob, "csrftoken").is_some()
        || parse_cookie_value(&blob, "university_id").is_some()
}

pub(crate) fn restore_yuketang_cookie_blob(client: &HbutClient, cookie_blob: &str) {
    if cookie_blob.trim().is_empty() {
        return;
    }
    let Ok(url) = Url::parse("https://changjiang.yuketang.cn") else {
        return;
    };
    for segment in cookie_blob.split(';') {
        let item = segment.trim();
        if item.is_empty() || !item.contains('=') {
            continue;
        }
        let Some((name_raw, value_raw)) = item.split_once('=') else {
            continue;
        };
        let name = name_raw.trim();
        let value = value_raw.trim();
        if name.is_empty() || value.is_empty() {
            continue;
        }
        let cookie_line = format!("{}={}; Domain=.yuketang.cn; Path=/", name, value);
        client.cookie_jar.add_cookie_str(&cookie_line, &url);
    }
}
fn update_pending_yuketang_login(
    session_id: &str,
    updater: impl FnOnce(&mut PendingYuketangLogin),
) -> Result<PendingYuketangLogin, DynError> {
    let mut store = yuketang_pending_store()
        .lock()
        .map_err(|_| err_box("雨课堂登录状态锁获取失败"))?;
    let record = store
        .get_mut(session_id)
        .ok_or_else(|| err_box("雨课堂登录会话不存在"))?;
    updater(record);
    Ok(record.clone())
}
pub async fn yuketang_create_qr_login(
    client: &HbutClient,
    req: &crate::YuketangQrCreateRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let session_id = format!("ykt-{}", Utc::now().timestamp_millis());
    let created_at = now_sync_time();
    let expires_at = (Utc::now() + chrono::Duration::minutes(10)).to_rfc3339();
    let mut ws_request = "wss://changjiang.yuketang.cn/wsapp/"
        .into_client_request()
        .map_err(|e| err_box(format!("构建雨课堂登录请求失败: {}", e)))?;
    ws_request.headers_mut().insert(
        "Origin",
        HeaderValue::from_static("https://changjiang.yuketang.cn"),
    );
    ws_request.headers_mut().insert(
        "User-Agent",
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    );
    let (mut ws_stream, _) =
        tokio::time::timeout(Duration::from_secs(20), connect_async(ws_request))
            .await
            .map_err(|_| err_box("连接雨课堂登录服务超时"))?
            .map_err(|e| err_box(format!("连接雨课堂登录服务失败: {}", e)))?;
    ws_stream
        .send(Message::Text(
            json!({
                "op": "requestlogin",
                "role": "web",
                "version": 1.4,
                "type": "qrcode"
            })
            .to_string()
            .into(),
        ))
        .await
        .map_err(|e| err_box(format!("请求雨课堂二维码失败: {}", e)))?;

    let mut qr_code_url = String::new();
    let mut ticket_url = String::new();
    let waiting_message = "请使用微信扫码登录长江雨课堂".to_string();
    let first_event = tokio::time::timeout(Duration::from_secs(12), async {
        while let Some(message) = ws_stream.next().await {
            let message = message.map_err(|e| err_box(format!("读取雨课堂二维码失败: {}", e)))?;
            if !message.is_text() {
                continue;
            }
            let payload: Value = serde_json::from_str(message.to_text().unwrap_or("{}"))
                .map_err(|e| err_box(format!("解析雨课堂二维码消息失败: {}", e)))?;
            let op = payload.get("op").and_then(|v| v.as_str()).unwrap_or("");
            if op == "requestlogin" {
                qr_code_url = payload
                    .get("qrcode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                ticket_url = payload
                    .get("ticket")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if qr_code_url.is_empty() {
                    return Err(err_box("雨课堂未返回有效二维码"));
                }
                return Ok::<(), DynError>(());
            }
            if op == "error" {
                let msg = payload
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("雨课堂登录服务返回错误");
                return Err(err_box(msg));
            }
        }
        Err(err_box("雨课堂登录服务未返回二维码"))
    })
    .await
    .map_err(|_| err_box("等待雨课堂二维码超时"))?;
    first_event?;

    let initial = PendingYuketangLogin {
        session_id: session_id.clone(),
        student_id: sid.clone(),
        status: "waiting_scan".to_string(),
        message: waiting_message.clone(),
        login_url: YUKETANG_WEB_URL.to_string(),
        authorize_url: YUKETANG_AUTHORIZE_URL.to_string(),
        qr_code_url: qr_code_url.clone(),
        ticket_url: ticket_url.clone(),
        account_id: String::new(),
        created_at: created_at.clone(),
        expires_at: expires_at.clone(),
    };
    if let Ok(mut store) = yuketang_pending_store().lock() {
        store.insert(session_id.clone(), initial.clone());
    }

    let reqwest_client = client.client.clone();
    let cookie_jar = client.cookie_jar.clone();
    let bg_session_id = session_id.clone();
    let bg_sid = sid.clone();
    tokio::spawn(async move {
        let finish_with = |status: &str, message: String, account_id: Option<String>| {
            let _ = update_pending_yuketang_login(&bg_session_id, |record| {
                record.status = status.to_string();
                record.message = message;
                if let Some(value) = account_id {
                    record.account_id = value;
                }
            });
        };

        while let Some(message) = ws_stream.next().await {
            let Ok(message) = message else {
                finish_with("failed", "雨课堂登录通道已断开".to_string(), None);
                return;
            };
            if !message.is_text() {
                continue;
            }
            let Ok(payload) = serde_json::from_str::<Value>(message.to_text().unwrap_or("{}"))
            else {
                continue;
            };
            let op = payload.get("op").and_then(|v| v.as_str()).unwrap_or("");
            match op {
                "requestlogin" => {
                    let _ = update_pending_yuketang_login(&bg_session_id, |record| {
                        record.status = "waiting_scan".to_string();
                        record.message = "二维码已刷新，请使用微信扫码".to_string();
                        record.qr_code_url = payload
                            .get("qrcode")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        record.ticket_url = payload
                            .get("ticket")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                    });
                }
                "scan" | "scanned" => {
                    let _ = update_pending_yuketang_login(&bg_session_id, |record| {
                        record.status = "scanned".to_string();
                        record.message = "已扫码，请在微信内确认登录".to_string();
                    });
                }
                "loginsuccess" => {
                    let auth = payload
                        .get("Auth")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let user_id = payload
                        .get("UserID")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if auth.is_empty() || user_id.is_empty() {
                        finish_with("failed", "雨课堂登录回调缺少授权信息".to_string(), None);
                        return;
                    }
                    let login_resp = reqwest_client
                        .post("https://changjiang.yuketang.cn/pc/web_login")
                        .json(&json!({
                            "Auth": auth,
                            "UserID": user_id,
                            "host_name": "changjiang.yuketang.cn"
                        }))
                        .send()
                        .await;
                    match login_resp {
                        Ok(resp) => match read_json_response(resp, "完成雨课堂登录失败").await
                        {
                            Ok(login_value) => {
                                let success = login_value
                                    .get("success")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                if !success {
                                    let message = login_value
                                        .get("msg")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("雨课堂登录失败")
                                        .to_string();
                                    finish_with("failed", message, None);
                                    return;
                                }
                                let account_id = login_value
                                    .get("user_id")
                                    .and_then(|v| v.as_i64())
                                    .map(|v| v.to_string())
                                    .unwrap_or_else(|| user_id.clone());
                                let cookie_blob = yuketang_cookie_blob_from_jar(&cookie_jar);
                                save_platform_state(
                                    &bg_sid,
                                    PLATFORM_YUKETANG,
                                    true,
                                    account_id.clone(),
                                    String::new(),
                                    cookie_blob,
                                    json!({ "source": "qr_login" }),
                                );
                                finish_with(
                                    "confirmed",
                                    "雨课堂登录成功".to_string(),
                                    Some(account_id),
                                );
                            }
                            Err(error) => finish_with("failed", error.to_string(), None),
                        },
                        Err(error) => {
                            finish_with("failed", format!("完成雨课堂登录失败: {}", error), None)
                        }
                    }
                    return;
                }
                "cancel" | "timeout" => {
                    let message = payload
                        .get("message")
                        .and_then(|v| v.as_str())
                        .unwrap_or("雨课堂扫码已取消或超时")
                        .to_string();
                    finish_with("expired", message, None);
                    return;
                }
                _ => {}
            }
        }
    });

    // 生成二维码图片（SVG base64 data URI）
    let qr_image_base64 = generate_qr_data_uri(&qr_code_url).unwrap_or_default();

    Ok(json!({
        "success": true,
        "session_id": session_id,
        "status": initial.status,
        "message": waiting_message,
        "login_url": initial.login_url,
        "authorize_url": initial.authorize_url,
        "qr_code_url": qr_code_url,
        "qr_image_base64": qr_image_base64,
        "ticket_url": ticket_url,
        "created_at": created_at,
        "expires_at": expires_at,
    }))
}

pub async fn yuketang_poll_qr_login(
    client: &HbutClient,
    req: &crate::YuketangPollQrLoginRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let session_id = req.session_id.trim().to_string();
    let pending = {
        let store = yuketang_pending_store()
            .lock()
            .map_err(|_| err_box("雨课堂登录状态锁获取失败"))?;
        store.get(&session_id).cloned()
    };
    if pending.is_none() {
        return Ok(crate::attach_sync_time(
            json!({
                "success": true,
                "session_id": session_id,
                "status": "expired",
                "message": "登录会话不存在或已过期"
            }),
            &now_sync_time(),
            false,
        ));
    }
    let mut output = pending.unwrap();
    if output.student_id != sid {
        return Err(err_box("登录会话与当前学号不匹配"));
    }
    let expired = chrono::DateTime::parse_from_rfc3339(&output.expires_at)
        .ok()
        .map(|expires_at| expires_at.with_timezone(&Utc) <= Utc::now())
        .unwrap_or(false);
    if expired {
        if let Ok(mut store) = yuketang_pending_store().lock() {
            store.remove(&session_id);
        }
        output.status = "expired".to_string();
        output.message = "登录会话已过期，请重新发起扫码".to_string();
        return Ok(crate::attach_sync_time(
            json!({
                "success": true,
                "session_id": output.session_id,
                "status": output.status,
                "message": output.message,
                "login_url": output.login_url,
                "authorize_url": output.authorize_url,
                "qr_code_url": output.qr_code_url,
                "qr_image_base64": generate_qr_data_uri(&output.qr_code_url).unwrap_or_default(),
                "ticket_url": output.ticket_url,
                "account_id": output.account_id,
                "created_at": output.created_at,
                "expires_at": output.expires_at,
            }),
            &now_sync_time(),
            false,
        ));
    }
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    if output.status != "confirmed" && has_yuketang_session(client) {
        let cookie_blob = yuketang_cookie_blob(client);
        if !cookie_blob.trim().is_empty() {
            save_platform_state(
                &sid,
                PLATFORM_YUKETANG,
                true,
                parse_cookie_value(&cookie_blob, "university_id")
                    .unwrap_or_else(|| output.account_id.clone()),
                "".to_string(),
                cookie_blob,
                json!({ "source": "poll" }),
            );
            output.status = "confirmed".to_string();
            output.message = "雨课堂登录已生效".to_string();
        }
    }
    if let Ok(mut store) = yuketang_pending_store().lock() {
        store.insert(output.session_id.clone(), output.clone());
    }
    Ok(crate::attach_sync_time(
        json!({
            "success": true,
            "session_id": output.session_id,
            "status": output.status,
            "message": output.message,
            "login_url": output.login_url,
            "authorize_url": output.authorize_url,
            "qr_code_url": output.qr_code_url,
            "qr_image_base64": generate_qr_data_uri(&output.qr_code_url).unwrap_or_default(),
            "ticket_url": output.ticket_url,
            "account_id": output.account_id,
            "created_at": output.created_at,
            "expires_at": output.expires_at,
        }),
        &now_sync_time(),
        false,
    ))
}
