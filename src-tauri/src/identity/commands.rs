//! Identity Tauri commands（#622）。
//!
//! 统一 `identity_` 前缀；错误一律返回简体中文 String。
//! 私钥只在本模块与 device_key 内使用，任何 payload 都不携带私钥材料。

use tauri::State;

use crate::app_state::AppState;

use super::approval::{sign_auth_approval, SignApprovalInput, SignedApproval};
use super::canonical::{self, DeviceApiCanonicalInput};
use super::client::{EnrollDeviceBody, IdentityApiClient};
use super::device_key::{DeviceKey, DeviceKeyStore};
use super::enrollment::{build_enroll_assertion, EnrollAssertionInput};
use super::errors::IdentityError;
use super::models::{
    current_platform, DeviceStatusPayload, EnrollPayload, PublicKeyPayload, SignAuthRequestInput,
};

fn real_store() -> DeviceKeyStore {
    DeviceKeyStore::real()
}

/// 查询设备身份本地状态（keyring 不可用时返回 available=false，不抛错，便于前端展示降级原因）。
#[tauri::command]
pub(crate) async fn identity_device_status() -> Result<DeviceStatusPayload, String> {
    let store = real_store();
    match store.load() {
        Ok(key) => Ok(DeviceStatusPayload {
            available: true,
            has_key: key.is_some(),
            fingerprint: key.as_ref().map(DeviceKey::fingerprint),
            error: None,
        }),
        Err(err) => Ok(DeviceStatusPayload {
            available: false,
            has_key: false,
            fingerprint: None,
            error: Some(err.to_string()),
        }),
    }
}

/// 获取本机设备公钥（无私钥材料；首次调用自动创建密钥并写入 keyring）。
#[tauri::command]
pub(crate) async fn identity_get_public_key() -> Result<PublicKeyPayload, String> {
    let store = real_store();
    let key = store.create_if_missing().map_err(|e| e.to_string())?;
    Ok(PublicKeyPayload {
        public_jwk: key.public_jwk(),
        fingerprint: key.fingerprint(),
        key_algorithm: "Ed25519",
    })
}

/// 设备注册（enrollment）：
/// 1. 本地前置：必须存在真实本地登录会话（读 user_sessions，私钥不出设备、学校凭据不上传）；
/// 2. 确保设备密钥存在（keyring fail closed）；
/// 3. 用新私钥对 enrollment assertion 签名并提交 Core；
/// 4. 返回 Core 签发的 user_id/device_id（前端保存 device_id 供后续 approve/revoke 使用）。
#[tauri::command]
pub(crate) async fn identity_enroll_device(
    state: State<'_, AppState>,
    base_url: String,
    challenge: String,
    device_name: String,
) -> Result<EnrollPayload, String> {
    let base_url = base_url.trim().to_string();
    if base_url.is_empty() {
        return Err(IdentityError::CoreBaseUrlMissing.to_string());
    }
    let device_name = device_name.trim().to_string();
    if device_name.is_empty() || device_name.chars().count() > 64 {
        return Err(
            IdentityError::InvalidInput("device_name 长度须为 1..=64".to_string()).to_string(),
        );
    }

    // 本地前置：真实登录会话（#617 信任边界：测试账号/demo 不能创建 Production identity）
    let latest = crate::db::get_latest_user_session(crate::DB_FILENAME)
        .map_err(|e| IdentityError::Internal(format!("读取本地会话失败：{e}")))
        .map_err(|e| e.to_string())?;
    let student_id = latest
        .map(|s| s.student_id)
        .filter(|s| !s.trim().is_empty())
        .ok_or(IdentityError::NoLocalLogin)
        .map_err(|e| e.to_string())?;

    // 本地可信 UserInfo snapshot（内存缓存；无缓存时只携带学号，姓名可为空）
    let user_info = state.client.read().await.user_info.clone();
    let student_name = user_info
        .as_ref()
        .map(|u| u.student_name.clone())
        .unwrap_or_default();

    // 设备密钥：不存在则创建（keyring 不可用 → fail closed）
    let store = real_store();
    let key = store.create_if_missing().map_err(|e| e.to_string())?;

    // 新私钥签名 enrollment assertion
    let assertion = build_enroll_assertion(
        &key,
        EnrollAssertionInput {
            challenge: challenge.trim(),
            student_id: student_id.trim(),
            student_name: student_name.trim(),
            issued_at: None,
            nonce: None,
        },
    )
    .map_err(|e| e.to_string())?;

    let body = EnrollDeviceBody {
        public_jwk: key.public_jwk(),
        platform: current_platform(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        device_name,
        challenge: challenge.trim().to_string(),
        student_id: student_id.trim().to_string(),
        student_name: student_name.trim().to_string(),
        issued_at: assertion.issued_at,
        nonce: assertion.nonce,
        signature: assertion.signature,
    };

    let client = IdentityApiClient::new(base_url);
    let resp = client
        .enroll_device(&body)
        .await
        .map_err(|e| e.to_string())?;
    Ok(EnrollPayload {
        user_id: resp.user_id,
        device_id: resp.device_id,
        status: resp.status,
        fingerprint: key.fingerprint(),
    })
}

/// 对 AuthRequest 授权上下文签名（approve）。
/// 返回 device_id/issued_at/nonce/signature；由前端携带 Handoff header 提交 Core
/// （handoff secret 只存在于前端内存，POST 必须由前端发起）。
#[tauri::command]
pub(crate) async fn identity_sign_auth_request(
    input: SignAuthRequestInput,
) -> Result<SignedApproval, String> {
    let store = real_store();
    let key = store
        .load()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| IdentityError::NotEnrolled.to_string())?;
    sign_auth_approval(
        &key,
        SignApprovalInput {
            request_id: &input.request_id,
            challenge: &input.challenge,
            client_id: &input.client_id,
            scopes: &input.scopes,
            device_id: &input.device_id,
            issued_at: None,
            nonce: None,
        },
    )
    .map_err(|e| e.to_string())
}

/// 撤销当前设备并删除本地密钥：
/// - 提供 base_url 时：先以设备签名调用 Core revoke（成功后才删本地 key，保留恢复途径）；
/// - 未提供 base_url 时：仅删除本地 key（明确本地操作，用于离线/测试场景）。
#[tauri::command]
pub(crate) async fn identity_revoke_current_device_local(
    base_url: Option<String>,
    device_id: Option<String>,
) -> Result<(), String> {
    let store = real_store();
    let base_url = base_url
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty());

    if let Some(base_url) = base_url {
        let device_id = device_id
            .ok_or_else(|| {
                IdentityError::InvalidInput(
                    "撤销当前设备需要 device_id（enroll 返回值）".to_string(),
                )
            })
            .map_err(|e| e.to_string())?;
        let key = store
            .load()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| IdentityError::NotEnrolled)
            .map_err(|e| e.to_string())?;
        // 设备签名（method/path 由服务端取请求自身值，防中间人改写）
        let issued_at = canonical::now_unix_seconds();
        let nonce = canonical::new_nonce();
        let canonical_text = canonical::build_device_api_canonical(&DeviceApiCanonicalInput {
            method: "POST",
            path: &format!("/api/v1/app/devices/{device_id}/revoke"),
            device_id: &device_id,
            issued_at,
            nonce: &nonce,
        })
        .map_err(|e| e.to_string())?;
        let signature = canonical::encode_signature(&key.sign(canonical_text.as_bytes()));
        let client = IdentityApiClient::new(base_url);
        client
            .revoke_current_device(&device_id, issued_at, &nonce, &signature)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 服务端 revoke 成功（或未配置服务端）后删除本地 key
    store.delete().map_err(|e| e.to_string())
}
