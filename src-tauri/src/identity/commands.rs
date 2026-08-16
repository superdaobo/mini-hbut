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

const IDENTITY_CORE_ORIGIN: &str = "https://id.xn--vhq74jc2fzpchter27a.com";
const IDENTITY_AUTH_ORIGIN: &str = "https://auth.xn--vhq74jc2fzpchter27a.com";
const IDENTITY_ORIGIN_WHITELIST: &[&str] = &[IDENTITY_CORE_ORIGIN, IDENTITY_AUTH_ORIGIN];

fn real_store() -> DeviceKeyStore {
    DeviceKeyStore::real()
}

fn validate_identity_core_base_url(
    input: &str,
    allow_local_dev: bool,
) -> Result<String, IdentityError> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err(IdentityError::CoreBaseUrlMissing);
    }
    let parsed = url::Url::parse(raw)
        .map_err(|_| IdentityError::InvalidInput("Identity Core 地址格式非法".to_string()))?;
    if parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.path(), "" | "/")
    {
        return Err(IdentityError::InvalidInput(
            "Identity Core 地址只能是受信任 origin".to_string(),
        ));
    }
    let origin = parsed.origin().ascii_serialization();
    if origin == IDENTITY_CORE_ORIGIN {
        return Ok(IDENTITY_CORE_ORIGIN.to_string());
    }
    if allow_local_dev
        && parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost"))
    {
        return Ok(origin);
    }
    Err(IdentityError::InvalidInput(
        "拒绝向非受信任 Identity Core 发送设备身份数据".to_string(),
    ))
}

fn resolve_identity_core_base_url(input: &str) -> Result<String, IdentityError> {
    let allow_local_dev = cfg!(debug_assertions)
        && std::env::var("HBUT_IDENTITY_ALLOW_LOCAL_CORE")
            .map(|value| value == "1")
            .unwrap_or(false);
    validate_identity_core_base_url(input, allow_local_dev)
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
    handoff: String,
) -> Result<EnrollPayload, String> {
    let base_url = resolve_identity_core_base_url(&base_url).map_err(|e| e.to_string())?;
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

    // 设备密钥：不存在则创建（keyring 不可用 → fail closed）。
    // keyring 是同步 blocking API：在 spawn_blocking 线程池执行（tauri command 的 async 上下文
    // 在 Windows 上可能出现 CredWrite 后立即读取 NoEntry 的行为差异）。
    let store = real_store();
    let key = tauri::async_runtime::spawn_blocking(move || store.create_if_missing())
        .await
        .map_err(|e| format!("设备密钥创建任务失败：{e}"))?
        .map_err(|e| e.to_string())?;

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
        .enroll_device(&body, &handoff)
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
        let base_url = resolve_identity_core_base_url(&base_url).map_err(|e| e.to_string())?;
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

/// Identity 代理请求（#623 架构修正）：
/// WebView fetch 在部分 Windows 环境被系统网络策略阻断（仅 localhost 可达），
/// 身份请求改走 Rust 网络栈（与 App 其他业务一致）。
/// 安全：origin 白名单（Core + BFF，防 SSRF）；handoff 只经 header 传递。
/// 注意：/api/v1/requests/** 在 Core 受 service-token 保护（#626，BFF 通道），
/// App 侧详情/状态/resume 走 BFF（auth.域名），approve/enroll 走 Core app 端点。
#[derive(serde::Deserialize)]
pub(crate) struct IdentityCoreFetchInput {
    method: String,
    /// origin 白名单键：core（id.域名）| bff（auth.域名）
    origin: Option<String>,
    /// 路径（如 /api/v1/requests/ar_xxx 或 /api/auth/requests/ar_xxx），必须以 / 开头
    path: String,
    #[serde(default)]
    headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    body: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
pub(crate) struct IdentityCoreFetchOutput {
    status: u16,
    body: String,
}

/// 代理请求到 Identity Core（固定域名 + 路径白名单；10s 超时）。
#[tauri::command]
pub(crate) async fn identity_core_fetch(
    input: IdentityCoreFetchInput,
) -> Result<IdentityCoreFetchOutput, String> {
    let method = input.method.to_ascii_uppercase();
    if !matches!(method.as_str(), "GET" | "POST") {
        return Err("identity_core_fetch: 仅支持 GET/POST".to_string());
    }
    // SSRF 防护：origin 白名单 + path 必须是 / 开头且不含协议/域名/../
    let origin = match input.origin.as_deref() {
        Some("bff") => IDENTITY_ORIGIN_WHITELIST[1],
        _ => IDENTITY_ORIGIN_WHITELIST[0],
    };
    let path = input.path.trim();
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err("identity_core_fetch: 非法路径".to_string());
    }
    let url = format!("{origin}{path}");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("identity_core_fetch: 客户端构建失败: {e}"))?;
    let mut req = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?,
        &url,
    );
    for (k, v) in &input.headers {
        req = req.header(k, v);
    }
    if let Some(b) = &input.body {
        req = req.json(b);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("identity_core_fetch: 请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    Ok(IdentityCoreFetchOutput { status, body })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;

    #[test]
    fn identity_core_origin_accepts_only_canonical_production() {
        assert_eq!(
            validate_identity_core_base_url(IDENTITY_CORE_ORIGIN, false).unwrap(),
            IDENTITY_CORE_ORIGIN
        );
        assert_eq!(
            validate_identity_core_base_url("https://id.xn--vhq74jc2fzpchter27a.com/", false)
                .unwrap(),
            IDENTITY_CORE_ORIGIN
        );
    }

    #[test]
    fn identity_core_origin_rejects_untrusted_or_decorated_urls() {
        for value in [
            "https://evil.example",
            "https://id.xn--vhq74jc2fzpchter27a.com.evil.example",
            "https://id.xn--vhq74jc2fzpchter27a.com/api",
            "https://user@id.xn--vhq74jc2fzpchter27a.com",
            "https://id.xn--vhq74jc2fzpchter27a.com?next=https://evil.example",
            "https://id.xn--vhq74jc2fzpchter27a.com/#fragment",
        ] {
            assert!(
                validate_identity_core_base_url(value, false).is_err(),
                "应拒绝 {value}"
            );
        }
    }

    #[test]
    fn identity_core_local_origin_requires_explicit_dev_allowance() {
        for value in ["http://127.0.0.1:3300", "http://localhost:3300"] {
            assert!(validate_identity_core_base_url(value, false).is_err());
            assert_eq!(validate_identity_core_base_url(value, true).unwrap(), value);
        }
        assert!(validate_identity_core_base_url("https://localhost:3300", true).is_err());
        assert!(validate_identity_core_base_url("http://192.168.1.20:3300", true).is_err());
    }
}
