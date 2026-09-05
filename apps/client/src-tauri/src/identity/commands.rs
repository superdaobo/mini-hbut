//! Identity Tauri commands（#622）。
//!
//! 统一 `identity_` 前缀；错误一律返回简体中文 String。
//! #777：授权历史命令改用结构化错误分类输出（status/error_kind/error_message），
//!       不再把设备密钥/签名链路错误压平成无类型字符串。
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
    // #672：Android 无 OS keyring 后端（keyring crate 不支持），显式降级而非误导性报错
    #[cfg(target_os = "android")]
    return Err("该平台暂不支持设备身份注册，敬请期待后续版本".to_string());
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
    // #672：Android 无 OS keyring 后端（keyring crate 不支持），显式降级而非误导性报错
    #[cfg(target_os = "android")]
    return Err("该平台暂不支持设备身份注册，敬请期待后续版本".to_string());
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
    // #672：Android 无 OS keyring 后端（keyring crate 不支持），显式降级而非误导性报错
    #[cfg(target_os = "android")]
    return Err("该平台暂不支持设备身份注册，敬请期待后续版本".to_string());
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
    // #672：Android 无 OS keyring 后端（keyring crate 不支持），显式降级而非误导性报错
    #[cfg(target_os = "android")]
    return Err("该平台暂不支持设备身份注册，敬请期待后续版本".to_string());
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

/// 拉取本机授权历史（「授权记录」页数据源）：
/// 设备签名（GET /api/v1/app/devices/me/auth-history）后返回 Core 响应体，
/// 与 revoke 同款签名链路（method/path 由服务端取请求自身值，防中间人改写）。
///
/// #777：错误不再被 `to_string()` 压平 —— 改用不抛错的结构化输出
/// （error_kind 机器码 + 已脱敏的 IdentityError Display 文本），
/// 前端可区分「未注册/安全存储不可用/网络失败/接口错误」并给出对应指引。
#[tauri::command]
pub(crate) async fn identity_fetch_auth_history(
    base_url: Option<String>,
    device_id: String,
) -> IdentityAuthHistoryOutput {
    let base_url = base_url
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| IDENTITY_CORE_ORIGIN.to_string());
    let device_id = device_id.trim().to_string();
    let store = real_store();
    fetch_auth_history_impl(&store, &base_url, &device_id).await
}

/// #777：授权历史输出。
/// - 原生层失败：`status = 0`，error_kind/error_message 描述失败类别与脱敏原因；
/// - 成功：`status` 为 Core HTTP 状态码（当前成功路径恒为 200），`body` 为响应体，
///   error_kind/error_message 为 None。
#[derive(serde::Serialize)]
pub(crate) struct IdentityAuthHistoryOutput {
    /// 0 = 原生层失败（未到达 HTTP）；>0 = Core HTTP 状态码
    pub status: i32,
    pub body: String,
    /// 稳定机器码：not_enrolled / keyring_unavailable / keyring_write_mismatch /
    /// keyring_backend_missing / invalid_input / core_base_url_missing / network / api / internal
    pub error_kind: Option<String>,
    /// 已脱敏的 IdentityError Display 文本（不含私钥/签名/token；不含 device_id 全文）
    pub error_message: Option<String>,
}

/// IdentityError → 稳定机器码（前端映射 IdentityUserSafeErrorCode 的契约源头）。
fn error_kind_of(err: &IdentityError) -> &'static str {
    match err {
        IdentityError::KeyringUnavailable(_) => "keyring_unavailable",
        IdentityError::KeyringWriteMismatch => "keyring_write_mismatch",
        IdentityError::KeyringBackendMissing(_) => "keyring_backend_missing",
        IdentityError::NoLocalLogin => "no_local_login",
        IdentityError::NotEnrolled => "not_enrolled",
        IdentityError::InvalidInput(_) => "invalid_input",
        IdentityError::CoreBaseUrlMissing => "core_base_url_missing",
        IdentityError::Network(_) => "network",
        IdentityError::Api { .. } => "api",
        IdentityError::Internal(_) => "internal",
    }
}

/// 授权历史核心逻辑（可注入 store，便于单测覆盖密钥链路错误分类）。
/// 参数约定：base_url 已由调用方 trim；device_id 已由调用方 trim。
async fn fetch_auth_history_impl(
    store: &DeviceKeyStore,
    base_url: &str,
    device_id: &str,
) -> IdentityAuthHistoryOutput {
    let failure = |err: &IdentityError| IdentityAuthHistoryOutput {
        status: 0,
        body: String::new(),
        error_kind: Some(error_kind_of(err).to_string()),
        error_message: Some(err.to_string()),
    };
    let base_url = match resolve_identity_core_base_url(base_url) {
        Ok(url) => url,
        Err(err) => return failure(&err),
    };
    if device_id.is_empty() {
        return failure(&IdentityError::InvalidInput(
            "查询授权历史需要 device_id（enroll 返回值）".to_string(),
        ));
    }
    let key = match store.load() {
        Ok(Some(key)) => key,
        Ok(None) => return failure(&IdentityError::NotEnrolled),
        Err(err) => return failure(&err),
    };
    let issued_at = canonical::now_unix_seconds();
    let nonce = canonical::new_nonce();
    let canonical_text = match canonical::build_device_api_canonical(&DeviceApiCanonicalInput {
        method: "GET",
        path: "/api/v1/app/devices/me/auth-history",
        device_id,
        issued_at,
        nonce: &nonce,
    }) {
        Ok(text) => text,
        Err(err) => return failure(&err),
    };
    let signature = canonical::encode_signature(&key.sign(canonical_text.as_bytes()));
    let client = IdentityApiClient::new(base_url);
    match client
        .fetch_auth_history(device_id, issued_at, &nonce, &signature)
        .await
    {
        Ok(body) => IdentityAuthHistoryOutput {
            status: 200,
            body,
            error_kind: None,
            error_message: None,
        },
        // #776：Api{status} 携带 Core HTTP 状态码，透传给前端按状态码分类；
        // 其余错误保持 status=0 + error_kind 分类。所有文本均为已脱敏 Display。
        Err(IdentityError::Api { status, ref message }) => IdentityAuthHistoryOutput {
            status: i32::from(status),
            body: message.clone(),
            error_kind: Some("api".to_string()),
            error_message: Some(IdentityError::Api {
                status,
                message: message.clone(),
            }
            .to_string()),
        },
        Err(err) => failure(&err),
    }
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

    // ── #777：授权历史命令错误分类（不依赖网络：密钥链路错误在网络边界之前返回） ──

    use crate::identity::keyring::{FailingKeyring, MemoryKeyring};

    /// 合法测试 base_url：Production Core origin（密钥链路失败时不发起任何网络请求）。
    fn test_base_url() -> String {
        IDENTITY_CORE_ORIGIN.to_string()
    }

    /// 测试用假 device_id（不含真实凭据）。
    fn test_device_id() -> String {
        "device-test-0001".to_string()
    }

    #[tokio::test]
    async fn auth_history_without_key_returns_not_enrolled_kind() {
        // 无密钥（MemoryKeyring 空）：NotEnrolled → error_kind=not_enrolled，不 panic
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let output = fetch_auth_history_impl(&store, &test_base_url(), &test_device_id()).await;
        assert_eq!(output.status, 0, "未到达 HTTP，status 应为 0");
        assert_eq!(output.error_kind.as_deref(), Some("not_enrolled"));
        assert!(output.body.is_empty());
        let message = output.error_message.unwrap_or_default();
        assert!(!message.is_empty(), "应有用户可读脱敏文案");
        // 脱敏约定：错误文本不携带 device_id 全文与签名材料
        assert!(!message.contains(&test_device_id()));
        assert!(!message.contains("signature"));
    }

    #[tokio::test]
    async fn auth_history_with_failing_keyring_returns_keyring_unavailable_kind() {
        // keyring 不可用（#668 fail closed）：error_kind=keyring_unavailable，绝不降级
        let store = DeviceKeyStore::with_keyring(Box::new(FailingKeyring));
        let output = fetch_auth_history_impl(&store, &test_base_url(), &test_device_id()).await;
        assert_eq!(output.status, 0);
        assert_eq!(output.error_kind.as_deref(), Some("keyring_unavailable"));
        let message = output.error_message.unwrap_or_default();
        assert!(message.contains("安全存储"), "应透传 KeyringUnavailable 脱敏文案");
        assert!(!message.contains(&test_device_id()));
    }

    #[tokio::test]
    async fn auth_history_with_empty_device_id_returns_invalid_input_kind() {
        // device_id 为空：error_kind=invalid_input（在 keyring 之前校验）
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let output = fetch_auth_history_impl(&store, &test_base_url(), "").await;
        assert_eq!(output.status, 0);
        assert_eq!(output.error_kind.as_deref(), Some("invalid_input"));
    }

    #[tokio::test]
    async fn auth_history_with_untrusted_base_url_returns_invalid_input_kind() {
        // 非受信任 origin：SSRF 防护在密钥链路之前生效
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let output =
            fetch_auth_history_impl(&store, "https://evil.example", &test_device_id()).await;
        assert_eq!(output.status, 0);
        assert_eq!(output.error_kind.as_deref(), Some("invalid_input"));
    }

    #[test]
    fn error_kind_covers_all_identity_error_variants() {
        // 契约：每个 IdentityError 变体都有稳定机器码（漏配时本用例失败）
        let cases: Vec<(IdentityError, &str)> = vec![
            (
                IdentityError::KeyringUnavailable("存储写入失败".to_string()),
                "keyring_unavailable",
            ),
            (IdentityError::KeyringWriteMismatch, "keyring_write_mismatch"),
            (
                IdentityError::KeyringBackendMissing("mock 后端".to_string()),
                "keyring_backend_missing",
            ),
            (IdentityError::NoLocalLogin, "no_local_login"),
            (IdentityError::NotEnrolled, "not_enrolled"),
            (
                IdentityError::InvalidInput("参数非法".to_string()),
                "invalid_input",
            ),
            (IdentityError::CoreBaseUrlMissing, "core_base_url_missing"),
            (IdentityError::Network("连接超时".to_string()), "network"),
            (
                IdentityError::Api {
                    status: 403,
                    message: "设备签名验证失败".to_string(),
                },
                "api",
            ),
            (IdentityError::Internal("不可达".to_string()), "internal"),
        ];
        for (err, expected) in cases {
            assert_eq!(error_kind_of(&err), expected, "{err:?} 的 error_kind 应为 {expected}");
        }
    }
}
