//! 学号核验客户端流程（goal-18 T04）：纯逻辑 + 可注入传输，便于单测覆盖全部分支。
//!
//! 与服务端契约 `mini-hbut-student-auth/docs/school-verify-contract.md` 逐项对齐：
//! - `POST /school/verify/nonce {device_id}` → `{ok, nonce, expires_in}`；
//! - `POST /school/verify {device_id, student_id, student_name_sha256, nonce, ts, alg,
//!   public_key_jwk, signature[, campus_cookie]}`；
//! - 签名口径 = v1 canonical（`identity::v2_signature`，与服务端 `device_pop` 逐字节一致）。
//!
//! 流程（plan A6）：**先不带 cookie** 请求一次——已绑定设备在复用期内直接 `reused`，
//! 教务 cookie 根本不出本机；只有服务端明确回 `campus_cookie_required` 时，
//! 才重新取 nonce、带上裁剪后的教务 cookie 再请求一次。

use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};

use crate::identity::device_key::DeviceKey;
use crate::identity::errors::IdentityError;
use crate::identity::sign_canonical::{is_valid_device_id, mask_student_id};
use crate::identity::v2_service_client::{TransportError, V2Transport};
use crate::identity::v2_signature::{sign_v2_proof, verify_v2_proof, V2_ALG};

/// 生产入口（用户决定 U1：走现有 `mini.hbut.site`，入口只把 `/school/` 前缀转给学号核验服务）。
pub const SCHOOL_VERIFY_ORIGIN: &str = "https://mini.hbut.site";
pub const NONCE_PATH: &str = "/school/verify/nonce";
pub const VERIFY_PATH: &str = "/school/verify";

/// 本机假服务（仅 debug 构建 + 显式开关）：`HBUT_SCHOOL_VERIFY_ALLOW_LOCAL=1` 且
/// `HBUT_SCHOOL_VERIFY_BASE=http://127.0.0.1:<port>`。发布构建永远只用 [`SCHOOL_VERIFY_ORIGIN`]。
pub const ALLOW_LOCAL_ENV: &str = "HBUT_SCHOOL_VERIFY_ALLOW_LOCAL";
pub const LOCAL_BASE_ENV: &str = "HBUT_SCHOOL_VERIFY_BASE";

/// 与服务端 `MAX_COOKIE_HEADER_BYTES` 一致：校方 Nginx 对请求头有上限（约 8KB 即 400）。
pub const MAX_COOKIE_HEADER_BYTES: usize = 6000;
/// 单次 HTTP 请求超时：服务端一次核验最多 20 秒（校方）+ Casdoor 建号，留足余量。
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(35);
/// 整个流程（最多两轮 nonce + verify）的总时限；后台执行，绝不阻塞登录。
pub const FLOW_TIMEOUT: Duration = Duration::from_secs(80);

const DEVICE_ID_PREFIX: &str = "mhsv-";

pub const STATUS_VERIFIED: &str = "verified";
pub const STATUS_REUSED: &str = "reused";
pub const STATUS_FAILED: &str = "failed";
pub const STATUS_UNSUPPORTED: &str = "unsupported";

/// 本地原因码（服务端原因码原样透传，见契约 §5.4；这几个只在客户端产生）。
pub const REASON_UNSUPPORTED_PLATFORM: &str = "unsupported_platform";
pub const REASON_NO_LOCAL_LOGIN: &str = "no_local_login";
pub const REASON_DEVICE_KEY_UNAVAILABLE: &str = "device_key_unavailable";
pub const REASON_SIGNING_FAILED: &str = "signing_failed";
pub const REASON_NETWORK_ERROR: &str = "network_error";
pub const REASON_BAD_RESPONSE: &str = "bad_response";
pub const REASON_CLIENT_TIMEOUT: &str = "client_timeout";
pub const REASON_UNKNOWN: &str = "unknown";
/// 与服务端同名：需要真实核验但本次没带 cookie。
pub const REASON_CAMPUS_COOKIE_REQUIRED: &str = "campus_cookie_required";

const CASDOOR_STATES: [&str; 4] = ["done", "failed", "pending", "disabled"];

/// 命令返回给前端的结果（只含公开信息：无 cookie、无签名、无完整学号）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SchoolVerifyPayload {
    pub ok: bool,
    /// `verified` / `reused` / `failed` / `unsupported`
    pub status: String,
    pub reason: Option<String>,
    pub http_status: Option<u16>,
    pub retry_after_seconds: Option<u64>,
    pub student_id_masked: Option<String>,
    pub verified_at: Option<i64>,
    pub reuse_until: Option<i64>,
    pub casdoor: Option<String>,
    /// 本次是否把教务 cookie 发给了服务端（隐私可观测：复用路径恒为 false）。
    pub cookie_sent: bool,
}

impl SchoolVerifyPayload {
    pub fn failed(reason: &str, http_status: Option<u16>, cookie_sent: bool) -> Self {
        Self {
            ok: false,
            status: STATUS_FAILED.to_string(),
            reason: Some(reason.to_string()),
            http_status,
            retry_after_seconds: None,
            student_id_masked: None,
            verified_at: None,
            reuse_until: None,
            casdoor: None,
            cookie_sent,
        }
    }

    pub fn unsupported() -> Self {
        Self {
            status: STATUS_UNSUPPORTED.to_string(),
            ..Self::failed(REASON_UNSUPPORTED_PLATFORM, None, false)
        }
    }

    /// 一行脱敏摘要（日志用）：只有状态 / 原因码 / HTTP 状态 / 是否发过 cookie。
    pub fn audit_line(&self) -> String {
        format!(
            "status={} reason={} http={} cookie_sent={} casdoor={}",
            self.status,
            self.reason.as_deref().unwrap_or("-"),
            self.http_status
                .map(|s| s.to_string())
                .unwrap_or_else(|| "-".to_string()),
            self.cookie_sent,
            self.casdoor.as_deref().unwrap_or("-"),
        )
    }
}

/// 设备密钥只在 Android 以外可用（keyring 无安卓后端，且禁止降级到文件；见 identity #672）。
pub fn platform_supports_device_signing(os: &str) -> bool {
    os != "android"
}

/// 设备标识：由设备公钥指纹派生，稳定且无需另存（服务端按「学号 + 设备公钥」判定复用）。
pub fn device_id_for_key(key: &DeviceKey) -> String {
    let fingerprint = key.fingerprint();
    format!(
        "{DEVICE_ID_PREFIX}{}",
        &fingerprint[..fingerprint.len().min(32)]
    )
}

/// 解析服务地址：发布构建恒为 [`SCHOOL_VERIFY_ORIGIN`]；只有 debug 构建 + 显式开关才允许本机回环。
pub fn resolve_base(allow_local: bool, local_base: Option<&str>) -> String {
    if allow_local {
        if let Some(raw) = local_base {
            if let Ok(url) = url::Url::parse(raw.trim()) {
                let loopback = matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"));
                let bare = url.username().is_empty()
                    && url.password().is_none()
                    && url.query().is_none()
                    && url.fragment().is_none()
                    && matches!(url.path(), "" | "/");
                if url.scheme() == "http" && loopback && bare {
                    return url.origin().ascii_serialization();
                }
            }
        }
    }
    SCHOOL_VERIFY_ORIGIN.to_string()
}

// ── 教务 cookie：合并两个基址的会话项并裁剪（与服务端 build_forward_cookie_header 同口径）────

fn is_cookie_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c))
}

fn is_cookie_value(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|b| (0x21..=0x7e).contains(&b) && b != b';')
}

fn is_own_key(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "cf_clearance" || lower.contains("mini_hbut") || lower.contains("hbu_session")
}

/// 把一个或多个 `k=v; k2=v2` 串合成可转发的请求头：
/// - **前面的串优先**（超星域现行站点排在前面：服务端先请求它，同名 cookie 必须用它的值）；
/// - 丢弃本项目自己的键、非法名 / 值（防请求头注入）；
/// - 超过 [`MAX_COOKIE_HEADER_BYTES`] 时按值长度从大到小丢弃，最后按名字排序拼接（结果稳定）。
pub fn merge_cookie_headers(headers: &[&str]) -> String {
    let mut pairs: Vec<(String, String)> = Vec::new();
    for raw in headers {
        for part in raw.split(';') {
            let Some((name, value)) = part.split_once('=') else {
                continue;
            };
            let (name, value) = (name.trim(), value.trim());
            if !is_cookie_name(name) || !is_cookie_value(value) || is_own_key(name) {
                continue;
            }
            if pairs.iter().any(|(existing, _)| existing == name) {
                continue;
            }
            pairs.push((name.to_string(), value.to_string()));
        }
    }
    pairs.sort_by(|a, b| b.1.len().cmp(&a.1.len()));
    while !pairs.is_empty() && joined_len(&pairs) > MAX_COOKIE_HEADER_BYTES {
        pairs.remove(0);
    }
    pairs.sort_by(|a, b| a.0.cmp(&b.0));
    pairs
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

fn joined_len(pairs: &[(String, String)]) -> usize {
    let content: usize = pairs.iter().map(|(n, v)| n.len() + 1 + v.len()).sum();
    content + pairs.len().saturating_sub(1) * 2
}

// ── 响应解析（只认契约内的字段与取值；不把服务端任意文本透传给前端）──────────────────────

fn sanitize_reason(value: Option<&Value>) -> String {
    let text = value.and_then(Value::as_str).unwrap_or_default();
    let ok = !text.is_empty()
        && text.len() <= 64
        && text.starts_with(|c: char| c.is_ascii_lowercase())
        && text
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    if ok {
        text.to_string()
    } else {
        REASON_UNKNOWN.to_string()
    }
}

fn retry_after(body: &Value) -> Option<u64> {
    body.get("retry_after_seconds")
        .and_then(Value::as_u64)
        .map(|v| v.min(86_400))
}

fn failure_from(status: u16, body: &Value, cookie_sent: bool) -> SchoolVerifyPayload {
    let mut payload = SchoolVerifyPayload::failed(
        &sanitize_reason(body.get("reason")),
        Some(status),
        cookie_sent,
    );
    payload.retry_after_seconds = retry_after(body);
    payload
}

fn success_from(status: u16, body: &Value, cookie_sent: bool) -> Option<SchoolVerifyPayload> {
    if status != 200 || body.get("ok").and_then(Value::as_bool) != Some(true) {
        return None;
    }
    let state = body.get("status").and_then(Value::as_str)?;
    if state != STATUS_VERIFIED && state != STATUS_REUSED {
        return None;
    }
    let masked = body
        .get("student_id_masked")
        .and_then(Value::as_str)
        .filter(|s| s.len() <= 16 && s.chars().all(|c| c.is_ascii_digit() || c == '*'))
        .map(str::to_string);
    let casdoor = body
        .get("casdoor")
        .and_then(Value::as_str)
        .filter(|s| CASDOOR_STATES.contains(s))
        .map(str::to_string);
    Some(SchoolVerifyPayload {
        ok: true,
        status: state.to_string(),
        reason: None,
        http_status: Some(status),
        retry_after_seconds: None,
        student_id_masked: masked,
        verified_at: body.get("verified_at").and_then(Value::as_i64),
        reuse_until: body.get("reuse_until").and_then(Value::as_i64),
        casdoor,
        cookie_sent,
    })
}

fn is_hex_nonce(value: &str) -> bool {
    value.len() == 32
        && value
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

// ── 编排 ─────────────────────────────────────────────────────────────────────────────

/// 一次核验所需的本机事实（学号 / 姓名来自本地登录会话，绝不接受前端传入）。
pub struct VerifyInput {
    pub student_id: String,
    pub student_name: String,
    /// 已经 [`merge_cookie_headers`] 处理过的教务 cookie；可能为空。
    pub campus_cookie: String,
}

enum Round {
    Done(SchoolVerifyPayload),
    NeedCookie,
}

async fn one_round<T: V2Transport + ?Sized>(
    transport: &T,
    key: &DeviceKey,
    device_id: &str,
    input: &VerifyInput,
    cookie: Option<&str>,
    now: &(dyn Fn() -> i64 + Send + Sync),
) -> Round {
    let cookie_sent = cookie.is_some();
    // ① 取 nonce（绑定本设备，一次性，TTL 300 秒）
    let (status, body) = match transport
        .post_json(NONCE_PATH, json!({ "device_id": device_id }))
        .await
    {
        Ok(result) => result,
        Err(TransportError::Network(_)) => {
            return Round::Done(SchoolVerifyPayload::failed(
                REASON_NETWORK_ERROR,
                None,
                false,
            ))
        }
        Err(TransportError::Decode(_)) => {
            return Round::Done(SchoolVerifyPayload::failed(
                REASON_BAD_RESPONSE,
                None,
                false,
            ))
        }
    };
    let nonce = body
        .get("nonce")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if status != 200
        || body.get("ok").and_then(Value::as_bool) != Some(true)
        || !is_hex_nonce(&nonce)
    {
        return Round::Done(if status == 200 {
            SchoolVerifyPayload::failed(REASON_BAD_RESPONSE, Some(status), false)
        } else {
            failure_from(status, &body, false)
        });
    }
    // ② 签名（v1 canonical；签名前后都只在内存里，返回前先自检）
    let ts = now();
    let proof = match sign_v2_proof(
        key,
        device_id,
        &input.student_id,
        &input.student_name,
        &nonce,
        ts,
    ) {
        Ok(proof) if verify_v2_proof(&proof) => proof,
        _ => {
            return Round::Done(SchoolVerifyPayload::failed(
                REASON_SIGNING_FAILED,
                None,
                false,
            ))
        }
    };
    let mut request = json!({
        "device_id": device_id,
        "student_id": input.student_id,
        "student_name_sha256": proof.student_name_hash,
        "nonce": nonce,
        "ts": ts,
        "alg": V2_ALG,
        "public_key_jwk": proof.public_key_jwk,
        "signature": proof.signature,
    });
    if let Some(cookie) = cookie {
        request["campus_cookie"] = Value::String(cookie.to_string());
    }
    // ③ 核验
    let (status, body) = match transport.post_json(VERIFY_PATH, request).await {
        Ok(result) => result,
        Err(TransportError::Network(_)) => {
            return Round::Done(SchoolVerifyPayload::failed(
                REASON_NETWORK_ERROR,
                None,
                cookie_sent,
            ))
        }
        Err(TransportError::Decode(_)) => {
            return Round::Done(SchoolVerifyPayload::failed(
                REASON_BAD_RESPONSE,
                None,
                cookie_sent,
            ))
        }
    };
    if let Some(success) = success_from(status, &body, cookie_sent) {
        return Round::Done(success);
    }
    if status == 200 {
        return Round::Done(SchoolVerifyPayload::failed(
            REASON_BAD_RESPONSE,
            Some(status),
            cookie_sent,
        ));
    }
    let reason = sanitize_reason(body.get("reason"));
    if status == 400 && reason == REASON_CAMPUS_COOKIE_REQUIRED && cookie.is_none() {
        return Round::NeedCookie;
    }
    Round::Done(failure_from(status, &body, cookie_sent))
}

/// 学号核验主流程：先不带 cookie；服务端要求时再带 cookie 重来一轮（重新取 nonce）。
///
/// 不做任何 IO 以外的副作用；`transport` 注入（生产为钉死 origin 的 reqwest，测试为假实现）。
pub async fn run_school_verify<T: V2Transport + ?Sized>(
    transport: &T,
    key: &DeviceKey,
    input: &VerifyInput,
    now: &(dyn Fn() -> i64 + Send + Sync),
) -> SchoolVerifyPayload {
    let device_id = device_id_for_key(key);
    if !is_valid_device_id(&device_id) {
        return SchoolVerifyPayload::failed(REASON_SIGNING_FAILED, None, false);
    }
    match one_round(transport, key, &device_id, input, None, now).await {
        Round::Done(payload) => payload,
        Round::NeedCookie if input.campus_cookie.is_empty() => {
            SchoolVerifyPayload::failed(REASON_CAMPUS_COOKIE_REQUIRED, Some(400), false)
        }
        Round::NeedCookie => match one_round(
            transport,
            key,
            &device_id,
            input,
            Some(&input.campus_cookie),
            now,
        )
        .await
        {
            Round::Done(payload) => payload,
            Round::NeedCookie => {
                SchoolVerifyPayload::failed(REASON_CAMPUS_COOKIE_REQUIRED, Some(400), true)
            }
        },
    }
}

/// 把命令层的本地错误映射成稳定原因码（不透传内部错误文案）。
pub fn reason_for_identity_error(err: &IdentityError) -> &'static str {
    match err {
        IdentityError::NoLocalLogin => REASON_NO_LOCAL_LOGIN,
        _ => REASON_DEVICE_KEY_UNAVAILABLE,
    }
}

/// 日志用：掩码学号 + 结果摘要（不含 cookie / 签名 / nonce / 完整学号）。
pub fn audit_message(student_id: &str, payload: &SchoolVerifyPayload) -> String {
    format!(
        "school_verify student={} {}",
        mask_student_id(student_id),
        payload.audit_line()
    )
}
