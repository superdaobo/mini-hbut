//! 「用 Mini-HBUT 登录」客户端流程（goal-20 T05）：纯逻辑 + 可注入传输。
//!
//! 与服务端契约 `mini-hbut-student-auth/docs/school-login-contract.md` 逐项对齐：
//! - `POST /school/login/requests/{id}/detail  {code}` → 来源 / 要共享的字段 / 剩余秒数；
//! - `POST /school/login/requests/{id}/approve {code, device_id, student_id, ts, alg, public_key_jwk, signature}`；
//! - `POST /school/login/requests/{id}/deny    {code}`；
//! - 签名口径：`login-v1|request_id|code|device_id|student_id|ts`，Ed25519，base64url 无填充
//!   （与学号核验的 `v1|…` 前缀不同，两种签名不能互相挪用）。
//!
//! 批准流程（plan A4）：**先学号核验**（复用期内直接 `reused`，否则按核验流程带教务 cookie），
//! 核验成功后才签名批准；核验失败就把原因带回前端，不批准。
//!
//! 隐私：`code` / 签名只在内存里；返回值与日志都不含它们，也不含完整学号。

use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};

use crate::identity::device_key::DeviceKey;
use crate::identity::sign_canonical::is_valid_device_id;
use crate::identity::v2_service_client::{TransportError, V2Transport};
use crate::identity::v2_signature::V2_ALG;

use super::flow::{
    device_id_for_key, run_school_verify, SchoolVerifyPayload, VerifyInput, REASON_BAD_RESPONSE,
    REASON_NETWORK_ERROR, REASON_SIGNING_FAILED, REASON_UNKNOWN, REASON_UNSUPPORTED_PLATFORM,
};

pub const LOGIN_REQUESTS_PATH: &str = "/school/login/requests";
pub const LOGIN_CANONICAL_PREFIX: &str = "login-v1";

pub const LOGIN_STATUS_PENDING: &str = "pending";
pub const LOGIN_STATUS_APPROVED: &str = "approved";
pub const LOGIN_STATUS_DENIED: &str = "denied";
pub const LOGIN_STATUS_FAILED: &str = "failed";
pub const LOGIN_STATUS_UNSUPPORTED: &str = "unsupported";

/// 本地原因码：二维码 / 深链里的 request_id 或 code 形状不对（只在客户端产生）。
pub const REASON_INVALID_LINK: &str = "invalid_link";
/// 本地原因码：批准前的学号核验没通过（具体原因见 `verify.reason`）。
pub const REASON_SCHOOL_VERIFY_FAILED: &str = "school_verify_failed";

/// 契约 §10 的共享字段（detail 返回值只接受这个集合里的名字）。
const KNOWN_SHARED_FIELDS: [&str; 4] = ["student_id", "verified_at", "approved_at", "device_id"];
const MAX_CLIENT_NAME_CHARS: usize = 64;

fn is_base64url(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// `slr_` + 22 位 base64url（服务端 `REQUEST_ID_RE`）。
pub fn is_valid_request_id(value: &str) -> bool {
    value
        .strip_prefix("slr_")
        .map(|rest| is_base64url(rest, 22))
        .unwrap_or(false)
}

/// 22 位 base64url（服务端 `CODE_RE`）。
pub fn is_valid_code(value: &str) -> bool {
    is_base64url(value, 22)
}

/// 批准签名的 canonical（字段形状由调用方先校验；含 `|` 的值在形状校验阶段就会被拒）。
pub fn build_login_canonical(
    request_id: &str,
    code: &str,
    device_id: &str,
    student_id: &str,
    ts: i64,
) -> String {
    format!("{LOGIN_CANONICAL_PREFIX}|{request_id}|{code}|{device_id}|{student_id}|{ts}")
}

fn public_key_jwk_json(key: &DeviceKey) -> String {
    let jwk = key.public_jwk();
    format!(
        "{{\"kty\":\"{}\",\"crv\":\"{}\",\"x\":\"{}\"}}",
        jwk.kty, jwk.crv, jwk.x
    )
}

/// 构造批准请求体（签名只在内存里）。形状不合法时返回 None。
pub fn sign_login_approval(
    key: &DeviceKey,
    request_id: &str,
    code: &str,
    device_id: &str,
    student_id: &str,
    ts: i64,
) -> Option<Value> {
    let sid_ok = student_id.len() == 10 && student_id.bytes().all(|b| b.is_ascii_digit());
    if !is_valid_request_id(request_id)
        || !is_valid_code(code)
        || !is_valid_device_id(device_id)
        || !sid_ok
    {
        return None;
    }
    let canonical = build_login_canonical(request_id, code, device_id, student_id, ts);
    let signature = general_purpose::URL_SAFE_NO_PAD.encode(key.sign(canonical.as_bytes()));
    // 自检：用公钥重新验一次，防止签出一份服务端必拒的请求
    let raw = general_purpose::URL_SAFE_NO_PAD.decode(&signature).ok()?;
    let sig: [u8; 64] = raw.try_into().ok()?;
    if key.verify(canonical.as_bytes(), &sig).is_err() {
        return None;
    }
    Some(json!({
        "alg": V2_ALG,
        "code": code,
        "device_id": device_id,
        "public_key_jwk": public_key_jwk_json(key),
        "signature": signature,
        "student_id": student_id,
        "ts": ts,
    }))
}

fn request_path(request_id: &str, action: &str) -> String {
    format!("{LOGIN_REQUESTS_PATH}/{request_id}/{action}")
}

/// 只认契约形状的原因码（小写字母开头的 `[a-z0-9_]`，≤ 64），其余一律 `unknown`。
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

fn masked(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .filter(|s| s.len() <= 16 && s.chars().all(|c| c.is_ascii_digit() || c == '*'))
        .map(str::to_string)
}

// ── detail ───────────────────────────────────────────────────────────────────────────

/// 确认弹窗需要的请求信息（只含公开信息）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SchoolLoginDetail {
    pub ok: bool,
    /// `pending` / `failed` / `unsupported`
    pub status: String,
    pub reason: Option<String>,
    pub http_status: Option<u16>,
    pub client_name: Option<String>,
    pub shared_fields: Vec<String>,
    pub expires_in: Option<u64>,
}

impl SchoolLoginDetail {
    pub fn failed(reason: &str, http_status: Option<u16>) -> Self {
        Self {
            ok: false,
            status: LOGIN_STATUS_FAILED.to_string(),
            reason: Some(reason.to_string()),
            http_status,
            client_name: None,
            shared_fields: Vec::new(),
            expires_in: None,
        }
    }

    pub fn unsupported() -> Self {
        Self {
            status: LOGIN_STATUS_UNSUPPORTED.to_string(),
            ..Self::failed(REASON_UNSUPPORTED_PLATFORM, None)
        }
    }
}

fn transport_failure(err: &TransportError) -> &'static str {
    match err {
        TransportError::Network(_) => REASON_NETWORK_ERROR,
        TransportError::Decode(_) => REASON_BAD_RESPONSE,
    }
}

pub async fn fetch_login_detail<T: V2Transport + ?Sized>(
    transport: &T,
    request_id: &str,
    code: &str,
) -> SchoolLoginDetail {
    if !is_valid_request_id(request_id) || !is_valid_code(code) {
        return SchoolLoginDetail::failed(REASON_INVALID_LINK, None);
    }
    let (status, body) = match transport
        .post_json(&request_path(request_id, "detail"), json!({ "code": code }))
        .await
    {
        Ok(result) => result,
        Err(err) => return SchoolLoginDetail::failed(transport_failure(&err), None),
    };
    if status != 200 || body.get("ok").and_then(Value::as_bool) != Some(true) {
        return if status == 200 {
            SchoolLoginDetail::failed(REASON_BAD_RESPONSE, Some(status))
        } else {
            SchoolLoginDetail::failed(&sanitize_reason(body.get("reason")), Some(status))
        };
    }
    if body.get("status").and_then(Value::as_str) != Some(LOGIN_STATUS_PENDING) {
        return SchoolLoginDetail::failed(REASON_BAD_RESPONSE, Some(status));
    }
    let client_name = body
        .pointer("/client/name")
        .and_then(Value::as_str)
        .map(|s| {
            s.chars()
                .filter(|c| !c.is_control())
                .take(MAX_CLIENT_NAME_CHARS)
                .collect::<String>()
        })
        .filter(|s| !s.trim().is_empty());
    let shared_fields = body
        .get("shared_fields")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter(|s| KNOWN_SHARED_FIELDS.contains(s))
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    SchoolLoginDetail {
        ok: true,
        status: LOGIN_STATUS_PENDING.to_string(),
        reason: None,
        http_status: Some(status),
        client_name,
        shared_fields,
        expires_in: body
            .get("expires_in")
            .and_then(Value::as_u64)
            .map(|v| v.min(3600)),
    }
}

// ── approve ──────────────────────────────────────────────────────────────────────────

/// 批准结果：含批准前那次学号核验的摘要（「首次核验 / 复用」由前端据 `verify.status` 显示）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SchoolLoginApproval {
    pub ok: bool,
    /// `approved` / `failed` / `unsupported`
    pub status: String,
    pub reason: Option<String>,
    pub http_status: Option<u16>,
    pub student_id_masked: Option<String>,
    /// 批准前的学号核验结果（没走到核验时为 None）。
    pub verify: Option<SchoolVerifyPayload>,
}

impl SchoolLoginApproval {
    pub fn failed(
        reason: &str,
        http_status: Option<u16>,
        verify: Option<SchoolVerifyPayload>,
    ) -> Self {
        Self {
            ok: false,
            status: LOGIN_STATUS_FAILED.to_string(),
            reason: Some(reason.to_string()),
            http_status,
            student_id_masked: None,
            verify,
        }
    }

    pub fn unsupported() -> Self {
        Self {
            status: LOGIN_STATUS_UNSUPPORTED.to_string(),
            ..Self::failed(REASON_UNSUPPORTED_PLATFORM, None, None)
        }
    }

    /// 一行脱敏摘要（日志用）。
    pub fn audit_line(&self) -> String {
        format!(
            "status={} reason={} http={} verify={}",
            self.status,
            self.reason.as_deref().unwrap_or("-"),
            self.http_status
                .map(|s| s.to_string())
                .unwrap_or_else(|| "-".to_string()),
            self.verify
                .as_ref()
                .map(|v| v.status.as_str())
                .unwrap_or("-"),
        )
    }
}

/// 批准主流程：形状校验 → 学号核验（复用或带 cookie）→ 签名 → 批准。
pub async fn run_school_login_approve<T: V2Transport + ?Sized>(
    transport: &T,
    key: &DeviceKey,
    input: &VerifyInput,
    request_id: &str,
    code: &str,
    now: &(dyn Fn() -> i64 + Send + Sync),
) -> SchoolLoginApproval {
    if !is_valid_request_id(request_id) || !is_valid_code(code) {
        return SchoolLoginApproval::failed(REASON_INVALID_LINK, None, None);
    }
    // ① 学号核验：没有有效绑定就不可能批准成功（服务端 device_not_verified）
    let verify = run_school_verify(transport, key, input, now).await;
    if !verify.ok {
        let http = verify.http_status;
        return SchoolLoginApproval::failed(REASON_SCHOOL_VERIFY_FAILED, http, Some(verify));
    }
    // ② 签名
    let device_id = device_id_for_key(key);
    let Some(body) =
        sign_login_approval(key, request_id, code, &device_id, &input.student_id, now())
    else {
        return SchoolLoginApproval::failed(REASON_SIGNING_FAILED, None, Some(verify));
    };
    // ③ 批准
    let (status, reply) = match transport
        .post_json(&request_path(request_id, "approve"), body)
        .await
    {
        Ok(result) => result,
        Err(err) => {
            return SchoolLoginApproval::failed(transport_failure(&err), None, Some(verify))
        }
    };
    let approved = status == 200
        && reply.get("ok").and_then(Value::as_bool) == Some(true)
        && reply.get("status").and_then(Value::as_str) == Some(LOGIN_STATUS_APPROVED);
    if approved {
        return SchoolLoginApproval {
            ok: true,
            status: LOGIN_STATUS_APPROVED.to_string(),
            reason: None,
            http_status: Some(status),
            student_id_masked: masked(reply.get("student_id_masked")),
            verify: Some(verify),
        };
    }
    let reason = if status == 200 {
        REASON_BAD_RESPONSE.to_string()
    } else {
        sanitize_reason(reply.get("reason"))
    };
    SchoolLoginApproval::failed(&reason, Some(status), Some(verify))
}

// ── deny ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SchoolLoginDenial {
    pub ok: bool,
    /// `denied` / `failed` / `unsupported`
    pub status: String,
    pub reason: Option<String>,
    pub http_status: Option<u16>,
}

impl SchoolLoginDenial {
    pub fn failed(reason: &str, http_status: Option<u16>) -> Self {
        Self {
            ok: false,
            status: LOGIN_STATUS_FAILED.to_string(),
            reason: Some(reason.to_string()),
            http_status,
        }
    }

    pub fn unsupported() -> Self {
        Self {
            status: LOGIN_STATUS_UNSUPPORTED.to_string(),
            ..Self::failed(REASON_UNSUPPORTED_PLATFORM, None)
        }
    }
}

pub async fn run_school_login_deny<T: V2Transport + ?Sized>(
    transport: &T,
    request_id: &str,
    code: &str,
) -> SchoolLoginDenial {
    if !is_valid_request_id(request_id) || !is_valid_code(code) {
        return SchoolLoginDenial::failed(REASON_INVALID_LINK, None);
    }
    let (status, body) = match transport
        .post_json(&request_path(request_id, "deny"), json!({ "code": code }))
        .await
    {
        Ok(result) => result,
        Err(err) => return SchoolLoginDenial::failed(transport_failure(&err), None),
    };
    let denied = status == 200
        && body.get("ok").and_then(Value::as_bool) == Some(true)
        && body.get("status").and_then(Value::as_str) == Some(LOGIN_STATUS_DENIED);
    if denied {
        return SchoolLoginDenial {
            ok: true,
            status: LOGIN_STATUS_DENIED.to_string(),
            reason: None,
            http_status: Some(status),
        };
    }
    let reason = if status == 200 {
        REASON_BAD_RESPONSE.to_string()
    } else {
        sanitize_reason(body.get("reason"))
    };
    SchoolLoginDenial::failed(&reason, Some(status))
}

/// 日志用的请求号：只留前 8 位（与服务端日志同口径）。
pub fn short_request_id(request_id: &str) -> String {
    let head: String = request_id.chars().take(8).collect();
    format!("{head}…")
}
