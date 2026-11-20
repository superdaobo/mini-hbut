//! Tauri 命令 `identity_school_verify`（goal-18 T04）。
//!
//! 只做「取本机事实 → 调纯流程 → 记一行脱敏日志」：
//! - 平台闸门：Android 直接返回 `unsupported`（前端据此继续走旧上报，见 T05）；
//! - 学号：本地登录会话（不接受前端传入）；姓名：内存里的 `user_info` 快照（只用于算哈希）；
//! - 教务 cookie：只在 Rust 侧从 cookie jar 读取，**不经过 WebView**，只发往钉死的 origin；
//! - 设备密钥：没有就按 `DeviceKeyStore::create_if_missing` 规程创建（只进 OS 保险箱，不可用即放弃）。

use std::time::Duration;

use serde_json::Value;
use tauri::State;

use crate::app_state::AppState;
use crate::identity::device_key::DeviceKeyStore;
use crate::identity::errors::IdentityError;
use crate::identity::v2_service_client::{BoxFuture, TransportError, V2Transport};
use crate::identity::v2_signature::now_unix;

use super::flow::{
    audit_message, platform_supports_device_signing, reason_for_identity_error, resolve_base,
    run_school_verify, SchoolVerifyPayload, VerifyInput, ALLOW_LOCAL_ENV, FLOW_TIMEOUT,
    LOCAL_BASE_ENV, REASON_CLIENT_TIMEOUT, REASON_DEVICE_KEY_UNAVAILABLE, REASON_NETWORK_ERROR,
    REQUEST_TIMEOUT,
};

/// 钉死 origin 的 reqwest 传输：带超时、**不跟随重定向**（防止被 307/308 带着 cookie 转去别的主机）。
pub struct SchoolVerifyTransport {
    base: String,
    http: reqwest::Client,
}

impl SchoolVerifyTransport {
    pub fn new(base: &str) -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            base: base.trim_end_matches('/').to_string(),
            http,
        })
    }
}

impl V2Transport for SchoolVerifyTransport {
    fn post_json<'a>(
        &'a self,
        path: &'a str,
        body: Value,
    ) -> BoxFuture<'a, Result<(u16, Value), TransportError>> {
        Box::pin(async move {
            let resp = self
                .http
                .post(format!("{}{}", self.base, path))
                .json(&body)
                .send()
                .await
                .map_err(|e| TransportError::Network(e.without_url().to_string()))?;
            let status = resp.status().as_u16();
            let text = resp
                .text()
                .await
                .map_err(|e| TransportError::Decode(e.without_url().to_string()))?;
            // 非 JSON（例如入口 502 页面）按「无字段」处理，由流程层映射成稳定原因码
            Ok((status, serde_json::from_str(&text).unwrap_or(Value::Null)))
        })
    }
}

fn allow_local_service() -> bool {
    cfg!(debug_assertions)
        && std::env::var(ALLOW_LOCAL_ENV)
            .map(|v| v.trim() == "1")
            .unwrap_or(false)
}

fn session_student_id() -> Result<String, IdentityError> {
    crate::db::get_latest_user_session(crate::DB_FILENAME)
        .map_err(|e| IdentityError::Internal(format!("读取本地会话失败：{e}")))?
        .map(|s| s.student_id.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or(IdentityError::NoLocalLogin)
}

/// 学号核验（静默、可重复调用；前端 fire-and-forget）。永远返回 `Ok(payload)`，失败也只是 `ok=false`。
#[tauri::command]
pub(crate) async fn identity_school_verify(
    state: State<'_, AppState>,
) -> Result<SchoolVerifyPayload, String> {
    if !platform_supports_device_signing(std::env::consts::OS) {
        return Ok(SchoolVerifyPayload::unsupported());
    }
    let student_id = match session_student_id() {
        Ok(sid) => sid,
        Err(err) => {
            return Ok(SchoolVerifyPayload::failed(
                reason_for_identity_error(&err),
                None,
                false,
            ))
        }
    };
    // 读锁内只拷出需要的两样东西，尽快释放（不在持锁时联网）
    let (student_name, campus_cookie) = {
        let client = state.client.read().await;
        let name = client
            .user_info
            .as_ref()
            .map(|u| u.student_name.trim().to_string())
            .unwrap_or_default();
        (name, client.school_session_cookie_header())
    };
    // keyring 是同步 blocking API（Windows CredRead 的既有经验），放 spawn_blocking
    let key =
        match tauri::async_runtime::spawn_blocking(|| DeviceKeyStore::real().create_if_missing())
            .await
        {
            Ok(Ok(key)) => key,
            Ok(Err(err)) => {
                return Ok(SchoolVerifyPayload::failed(
                    reason_for_identity_error(&err),
                    None,
                    false,
                ))
            }
            Err(_) => {
                return Ok(SchoolVerifyPayload::failed(
                    REASON_DEVICE_KEY_UNAVAILABLE,
                    None,
                    false,
                ))
            }
        };
    let base = resolve_base(
        allow_local_service(),
        std::env::var(LOCAL_BASE_ENV).ok().as_deref(),
    );
    let transport = match SchoolVerifyTransport::new(&base) {
        Ok(transport) => transport,
        Err(_) => {
            return Ok(SchoolVerifyPayload::failed(
                REASON_NETWORK_ERROR,
                None,
                false,
            ))
        }
    };
    let input = VerifyInput {
        student_id: student_id.clone(),
        student_name,
        campus_cookie,
    };
    let payload = match tokio::time::timeout(
        FLOW_TIMEOUT,
        run_school_verify(&transport, &key, &input, &now_unix),
    )
    .await
    {
        Ok(payload) => payload,
        // 超时时无法确知第二轮是否已发出：有 cookie 就按「可能已发送」保守报告
        Err(_) => SchoolVerifyPayload::failed(
            REASON_CLIENT_TIMEOUT,
            None,
            !input.campus_cookie.is_empty(),
        ),
    };
    log::info!("{}", audit_message(&student_id, &payload));
    Ok(payload)
}
