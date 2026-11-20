//! Tauri 命令：「用 Mini-HBUT 登录」的 detail / approve / deny（goal-20 T05）。
//!
//! 与 `identity_school_verify` 同一套本机事实与闸门：
//! - Android 直接 `unsupported`（无设备保险箱，用户决定 U2）；
//! - 学号来自本地登录会话，姓名来自内存快照，教务 cookie 只在 Rust 侧读取、只发往钉死的 origin；
//! - 前端只传二维码 / 深链里的 `request_id` 与 `code`，Rust 侧按契约形状校验后才拼路径；
//! - 日志只记请求号前 8 位与掩码学号，绝不记 code / 签名 / cookie。

use tauri::State;

use crate::app_state::AppState;
use crate::identity::device_key::DeviceKeyStore;
use crate::identity::sign_canonical::mask_student_id;
use crate::identity::v2_signature::now_unix;

use super::command::{allow_local_service, session_student_id, SchoolVerifyTransport};
use super::flow::{
    platform_supports_device_signing, reason_for_identity_error, resolve_base, VerifyInput,
    FLOW_TIMEOUT, LOCAL_BASE_ENV, REASON_CLIENT_TIMEOUT, REASON_DEVICE_KEY_UNAVAILABLE,
    REASON_NETWORK_ERROR,
};
use super::login::{
    fetch_login_detail, run_school_login_approve, run_school_login_deny, short_request_id,
    SchoolLoginApproval, SchoolLoginDenial, SchoolLoginDetail,
};

fn transport() -> Option<SchoolVerifyTransport> {
    let base = resolve_base(
        allow_local_service(),
        std::env::var(LOCAL_BASE_ENV).ok().as_deref(),
    );
    SchoolVerifyTransport::new(&base).ok()
}

fn supported() -> bool {
    platform_supports_device_signing(std::env::consts::OS)
}

/// 读请求信息（确认弹窗用）。永远返回 `Ok(detail)`，失败也只是 `ok=false`。
#[tauri::command]
pub(crate) async fn identity_school_login_detail(
    request_id: String,
    code: String,
) -> Result<SchoolLoginDetail, String> {
    if !supported() {
        return Ok(SchoolLoginDetail::unsupported());
    }
    let Some(transport) = transport() else {
        return Ok(SchoolLoginDetail::failed(REASON_NETWORK_ERROR, None));
    };
    let detail = fetch_login_detail(&transport, &request_id, &code).await;
    log::info!(
        "school_login detail request={} ok={} reason={}",
        short_request_id(&request_id),
        detail.ok,
        detail.reason.as_deref().unwrap_or("-")
    );
    Ok(detail)
}

/// 确认登录：先学号核验，再用设备密钥签名批准。
#[tauri::command]
pub(crate) async fn identity_school_login_approve(
    state: State<'_, AppState>,
    request_id: String,
    code: String,
) -> Result<SchoolLoginApproval, String> {
    if !supported() {
        return Ok(SchoolLoginApproval::unsupported());
    }
    let student_id = match session_student_id() {
        Ok(sid) => sid,
        Err(err) => {
            return Ok(SchoolLoginApproval::failed(
                reason_for_identity_error(&err),
                None,
                None,
            ))
        }
    };
    // 读锁内只拷出姓名与教务 cookie，尽快释放（不在持锁时联网）
    let (student_name, campus_cookie) = {
        let client = state.client.read().await;
        let name = client
            .user_info
            .as_ref()
            .map(|u| u.student_name.trim().to_string())
            .unwrap_or_default();
        (name, client.school_session_cookie_header())
    };
    let key =
        match tauri::async_runtime::spawn_blocking(|| DeviceKeyStore::real().create_if_missing())
            .await
        {
            Ok(Ok(key)) => key,
            Ok(Err(err)) => {
                return Ok(SchoolLoginApproval::failed(
                    reason_for_identity_error(&err),
                    None,
                    None,
                ))
            }
            Err(_) => {
                return Ok(SchoolLoginApproval::failed(
                    REASON_DEVICE_KEY_UNAVAILABLE,
                    None,
                    None,
                ))
            }
        };
    let Some(transport) = transport() else {
        return Ok(SchoolLoginApproval::failed(
            REASON_NETWORK_ERROR,
            None,
            None,
        ));
    };
    let input = VerifyInput {
        student_id: student_id.clone(),
        student_name,
        campus_cookie,
    };
    let approval = match tokio::time::timeout(
        FLOW_TIMEOUT,
        run_school_login_approve(&transport, &key, &input, &request_id, &code, &now_unix),
    )
    .await
    {
        Ok(approval) => approval,
        Err(_) => SchoolLoginApproval::failed(REASON_CLIENT_TIMEOUT, None, None),
    };
    log::info!(
        "school_login approve request={} student={} {}",
        short_request_id(&request_id),
        mask_student_id(&student_id),
        approval.audit_line()
    );
    Ok(approval)
}

/// 拒绝登录（不需要签名：持有 code 的人本来就可以不批准）。
#[tauri::command]
pub(crate) async fn identity_school_login_deny(
    request_id: String,
    code: String,
) -> Result<SchoolLoginDenial, String> {
    if !supported() {
        return Ok(SchoolLoginDenial::unsupported());
    }
    let Some(transport) = transport() else {
        return Ok(SchoolLoginDenial::failed(REASON_NETWORK_ERROR, None));
    };
    let denial = run_school_login_deny(&transport, &request_id, &code).await;
    log::info!(
        "school_login deny request={} ok={} reason={}",
        short_request_id(&request_id),
        denial.ok,
        denial.reason.as_deref().unwrap_or("-")
    );
    Ok(denial)
}
