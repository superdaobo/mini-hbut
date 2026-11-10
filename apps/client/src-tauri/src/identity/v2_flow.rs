//! P1-2：首次登记 / 换机发起 / 换机批准 **三个客户端流程**（纯编排 + 稳定错误分类）。
//!
//! 为什么单独一层：
//! - **可测**：只依赖 `V2Transport`（注入），全部拒绝/成功分支都能用假实现穷举；
//! - **安全**：客户端**只有**「发起请求（新设备）」与「批准（旧设备）」两个换机动作，
//!   这里**不存在**任何「不经批准直接改绑」的调用路径；
//! - **不泄露**：面向用户的文案一律来自 `message_for_kind` 的固定表；服务端 `reason`
//!   只用于**映射**，未知 reason 一律 `unknown`，原文绝不透传。

use serde_json::{json, Value};

use super::v2_service_client::{TransportError, V2Transport};

// ── 稳定 kind（与前端 `identityV2Errors.ts` **逐字一致**）───────────────────
pub const KIND_FIRST_CLAIM_OK: &str = "first_claim_ok";
pub const KIND_ALREADY_REGISTERED: &str = "already_registered";
pub const KIND_STUDENT_TAKEN: &str = "student_taken";
pub const KIND_DEVICE_TAKEN: &str = "device_taken";
pub const KIND_NO_ACTIVE_DEVICE: &str = "no_active_device";
pub const KIND_REQUEST_PENDING: &str = "request_pending";
pub const KIND_APPROVED: &str = "approved";
pub const KIND_APPROVER_MISMATCH: &str = "approver_mismatch";
pub const KIND_REQUEST_EXPIRED: &str = "request_expired";
pub const KIND_REQUEST_DONE: &str = "request_done";
pub const KIND_CODE_INVALID: &str = "code_invalid";
pub const KIND_NOT_ENROLLED: &str = "not_enrolled";
pub const KIND_NOT_LOGGED_IN: &str = "not_logged_in";
pub const KIND_SECURE_STORAGE_UNAVAILABLE: &str = "secure_storage_unavailable";
pub const KIND_NETWORK: &str = "network";
pub const KIND_SERVICE_UNAVAILABLE: &str = "service_unavailable";
pub const KIND_UNKNOWN: &str = "unknown";

/// 面向用户的固定文案（**不得**含学号/签名/公钥/URL/request_id/reason 原文）。
pub fn message_for_kind(kind: &str) -> &'static str {
    match kind {
        KIND_FIRST_CLAIM_OK => "设备登记成功，本机已成为该学号的受信任设备",
        KIND_ALREADY_REGISTERED => "本机已完成登记，无需重复操作",
        KIND_STUDENT_TAKEN => "该学号已绑定其他设备：请在旧设备上批准换机，或联系管理员",
        KIND_DEVICE_TAKEN => "本机设备已绑定到其他学号，请先在该学号下解除绑定或联系管理员",
        KIND_NO_ACTIVE_DEVICE => "该学号当前没有可用的旧设备，请直接完成首次登记",
        KIND_REQUEST_PENDING => "换机请求已提交，请用旧设备输入/扫描换机码完成批准",
        KIND_APPROVED => "换机完成：本机已成为该学号的受信任设备",
        KIND_APPROVER_MISMATCH => "只有该学号当前的活跃设备才能批准换机",
        KIND_REQUEST_EXPIRED => "换机码已过期，请在新设备上重新发起换机",
        KIND_REQUEST_DONE => "该换机请求已被处理，无需重复批准",
        KIND_CODE_INVALID => "换机码无效或已损坏，请重新扫描/输入",
        KIND_NOT_ENROLLED => "本机尚未登记设备身份，请先完成首次登记",
        KIND_NOT_LOGGED_IN => "请先在本机登录学校账号后再操作",
        KIND_SECURE_STORAGE_UNAVAILABLE => "本机安全存储不可用，无法完成设备身份操作",
        KIND_NETWORK => "网络不可用或服务暂时不可达，请稍后重试",
        KIND_SERVICE_UNAVAILABLE => "服务暂时不可用，请稍后重试",
        _ => "操作失败，请稍后重试",
    }
}

/// 服务端稳定 `reason` → 客户端 kind（未知一律 `unknown`，**绝不**透传原文）。
pub fn kind_for_reason(reason: &str) -> &'static str {
    match reason.trim() {
        "student_active_on_other_device" => KIND_STUDENT_TAKEN,
        "device_active_for_other_student" => KIND_DEVICE_TAKEN,
        "rebind_no_active_device" => KIND_NO_ACTIVE_DEVICE,
        "rebind_request_expired" => KIND_REQUEST_EXPIRED,
        "rebind_request_already_done" => KIND_REQUEST_DONE,
        "rebind_approver_mismatch" | "rebind_approver_not_active" => KIND_APPROVER_MISMATCH,
        "rebind_new_device_taken" => KIND_DEVICE_TAKEN,
        "rebind_request_not_found" => KIND_CODE_INVALID,
        "rebind_pubkey_mismatch" => KIND_CODE_INVALID,
        "device_not_registered" => KIND_NOT_ENROLLED,
        "no_local_login" => KIND_NOT_LOGGED_IN,
        "keyring_unavailable" => KIND_SECURE_STORAGE_UNAVAILABLE,
        "not_enrolled" => KIND_NOT_ENROLLED,
        "invalid_input" => KIND_UNKNOWN,
        _ => KIND_UNKNOWN,
    }
}

/// 失败结果（面向用户只带 kind + 固定文案）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlowErr {
    pub kind: &'static str,
    pub message: &'static str,
}

impl FlowErr {
    pub fn new(kind: &'static str) -> Self {
        Self {
            kind,
            message: message_for_kind(kind),
        }
    }
}

/// 成功结果（字段均非敏感：学号一律掩码）。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FlowOk {
    pub kind: &'static str,
    pub message: &'static str,
    pub device_id: String,
    pub student_id_masked: String,
    pub request_id: String,
    pub expires_at: i64,
    pub new_pubkey_sha256: String,
}

impl FlowOk {
    fn new(kind: &'static str) -> Self {
        Self {
            kind,
            message: message_for_kind(kind),
            ..Default::default()
        }
    }
}

// ── 三流程的请求材料（由命令层准备好：本机签名材料 + 服务地址）──────────────

/// 首次登记（本机为新设备；`signature` 由本机密钥对 `v1|…` canonical 签出）。
#[derive(Debug, Clone)]
pub struct EnrollV2Request {
    pub device_id: String,
    pub student_id: String,
    pub alg: String,
    pub public_key_jwk: String,
    pub student_name_hash: String,
    pub nonce: String,
    pub ts: i64,
    pub signature: String,
}

/// 发起换机（本机为新设备；签 `hbut-rebind-v1|request|…`）。
#[derive(Debug, Clone)]
pub struct RebindRequestV2Request {
    pub new_device_id: String,
    pub student_id: String,
    pub alg: String,
    pub public_key_jwk: String,
    pub student_name_hash: String,
    pub new_pubkey_sha256: String,
    pub nonce: String,
    pub ts: i64,
    pub signature: String,
}

/// 批准换机（本机为旧设备；签 `hbut-rebind-v1|approve|…`）。
#[derive(Debug, Clone)]
pub struct RebindApproveV2Request {
    pub request_id: String,
    pub new_device_id: String,
    pub new_pubkey_sha256: String,
    pub expires_at: i64,
    pub approver_device_id: String,
    pub student_id: String,
    pub nonce: String,
    pub ts: i64,
    pub signature: String,
}

// ── 形状校验（签名之前就要挡住，避免把畸形材料当请求发出去）───────────────────

/// 32 位小写 hex（`request_id`）。
pub fn is_hex32(value: &str) -> bool {
    value.len() == 32
        && value
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// 64 位小写 hex（`new_pubkey_sha256`）。
pub fn is_hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// 换机**请求** canonical（与 P1-3 服务端逐字同格式；两角色各一个构造器，格式只有一处）。
pub fn build_rebind_request_canonical(
    new_device_id: &str,
    student_id: &str,
    new_pubkey_sha256: &str,
    nonce: &str,
    ts: i64,
) -> String {
    format!(
        "hbut-rebind-v1|request|{}|{}|{}|{}|{}",
        new_device_id, student_id, new_pubkey_sha256, nonce, ts
    )
}

/// 换机**批准** canonical（服务端会用自己存的 pending 记录重建后交叉验签）。
#[allow(clippy::too_many_arguments)]
pub fn build_rebind_approve_canonical(
    request_id: &str,
    approver_device_id: &str,
    new_device_id: &str,
    new_pubkey_sha256: &str,
    nonce: &str,
    ts: i64,
) -> String {
    format!(
        "hbut-rebind-v1|approve|{}|{}|{}|{}|{}|{}",
        request_id, approver_device_id, new_device_id, new_pubkey_sha256, nonce, ts
    )
}

/// 批准输入的形状校验（**不联网**）：任一不符 → `code_invalid`（换机码来源不可信）。
pub fn validate_approve_shape(req: &RebindApproveV2Request, now: i64) -> Result<(), FlowErr> {
    if !is_hex32(req.request_id.trim())
        || !super::sign_canonical::is_valid_device_id(req.new_device_id.trim())
        || !is_hex64(req.new_pubkey_sha256.trim())
        || req.expires_at <= now
    {
        return Err(FlowErr::new(KIND_CODE_INVALID));
    }
    if req.approver_device_id.trim().is_empty() {
        return Err(FlowErr::new(KIND_NOT_ENROLLED));
    }
    Ok(())
}

// ── 通用：POST + 分类 ────────────────────────────────────────────────────────

async fn post_json<T: V2Transport>(
    transport: &T,
    path: &str,
    body: Value,
) -> Result<(u16, Value), FlowErr> {
    match transport.post_json(path, body).await {
        Ok(pair) => Ok(pair),
        Err(TransportError::Network(_)) => Err(FlowErr::new(KIND_NETWORK)),
        Err(TransportError::Decode(_)) => Err(FlowErr::new(KIND_UNKNOWN)),
    }
}

/// 失败体 → kind：优先用稳定 `reason`；缺失/未知 → `unknown`（state 级兜底用 HTTP 码）。
fn classify_failure(status: u16, body: &Value) -> FlowErr {
    let reason = body.get("reason").and_then(Value::as_str).unwrap_or("");
    let kind = if reason.is_empty() {
        match status {
            500..=599 => KIND_SERVICE_UNAVAILABLE,
            _ => KIND_UNKNOWN,
        }
    } else {
        kind_for_reason(reason)
    };
    FlowErr::new(kind)
}

fn masked(body: &Value) -> String {
    body.get("student_id_masked")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn stat(body: &Value) -> String {
    body.get("status")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

// ── ① 首次登记 ──────────────────────────────────────────────────────────────

/// 首次登记（合约为 `POST /identity/device/enroll`）。
pub async fn enroll_v2<T: V2Transport>(
    transport: &T,
    req: &EnrollV2Request,
) -> Result<FlowOk, FlowErr> {
    let body = json!({
        "device_id": req.device_id,
        "student_id": req.student_id,
        "alg": req.alg,
        "public_key_jwk": req.public_key_jwk,
        "student_name_hash": req.student_name_hash,
        "nonce": req.nonce,
        "ts": req.ts,
        "signature": req.signature,
    });
    let (status, value) = post_json(transport, "/identity/device/enroll", body).await?;
    if status != 200 || value.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(classify_failure(status, &value));
    }
    let action = value.get("action").and_then(Value::as_str).unwrap_or("");
    // 契约： 表示同设备同学号重复登记（幂等）；否则是首次登记成功
    let kind = if action == "idempotent" {
        KIND_ALREADY_REGISTERED
    } else {
        KIND_FIRST_CLAIM_OK
    };
    let mut ok = FlowOk::new(kind);
    ok.device_id = req.device_id.clone();
    ok.student_id_masked = masked(&value);
    Ok(ok)
}

// ── ② 发起换机（新设备）────────────────────────────────────────────────────

/// 发起换机（`POST /identity/device/rebind/request`）→ 成功即拿到 `request_id`（父层据此生成换机码）。
pub async fn rebind_request_v2<T: V2Transport>(
    transport: &T,
    req: &RebindRequestV2Request,
) -> Result<FlowOk, FlowErr> {
    let body = json!({
        "new_device_id": req.new_device_id,
        "student_id": req.student_id,
        "alg": req.alg,
        "public_key_jwk": req.public_key_jwk,
        "student_name_hash": req.student_name_hash,
        "nonce": req.nonce,
        "ts": req.ts,
        "signature": req.signature,
    });
    let (status, value) = post_json(transport, "/identity/device/rebind/request", body).await?;
    if status != 200 || value.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(classify_failure(status, &value));
    }
    let status_field = stat(&value);
    let mut ok = if status_field == "active" {
        // 契约：本机**已是**该学号活跃设备 → 不含 request_id（幂等）
        FlowOk::new(KIND_ALREADY_REGISTERED)
    } else {
        FlowOk::new(KIND_REQUEST_PENDING)
    };
    ok.device_id = req.new_device_id.clone();
    ok.student_id_masked = masked(&value);
    ok.request_id = value
        .get("request_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    ok.expires_at = value.get("expires_at").and_then(Value::as_i64).unwrap_or(0);
    ok.new_pubkey_sha256 = req.new_pubkey_sha256.clone();
    if ok.kind == KIND_REQUEST_PENDING && ok.request_id.is_empty() {
        // 契约违背（pending 却没有 request_id）→ 不当成功处理
        return Err(FlowErr::new(KIND_UNKNOWN));
    }
    Ok(ok)
}

// ── ③ 批准换机（旧设备）────────────────────────────────────────────────────

/// 批准换机（`POST /identity/device/rebind/approve`）。
pub async fn rebind_approve_v2<T: V2Transport>(
    transport: &T,
    req: &RebindApproveV2Request,
) -> Result<FlowOk, FlowErr> {
    let body = json!({
        "request_id": req.request_id,
        "approver_device_id": req.approver_device_id,
        "nonce": req.nonce,
        "ts": req.ts,
        "signature": req.signature,
    });
    let (status, value) = post_json(transport, "/identity/device/rebind/approve", body).await?;
    if status != 200 || value.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(classify_failure(status, &value));
    }
    let mut ok = FlowOk::new(KIND_APPROVED);
    ok.device_id = value
        .get("device_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    ok.student_id_masked = masked(&value);
    ok.request_id = req.request_id.clone();
    Ok(ok)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// 假传输：记录请求 + 回放预设响应（**不联网**）。
    struct FakeTransport {
        responses: Mutex<Vec<(u16, Value)>>,
        seen: Mutex<Vec<(String, Value)>>,
    }

    impl FakeTransport {
        fn new(responses: Vec<(u16, Value)>) -> Self {
            Self {
                responses: Mutex::new(responses),
                seen: Mutex::new(Vec::new()),
            }
        }
        fn calls(&self) -> Vec<(String, Value)> {
            self.seen.lock().unwrap().clone()
        }
    }

    impl V2Transport for FakeTransport {
        fn post_json<'a>(
            &'a self,
            path: &'a str,
            body: Value,
        ) -> super::super::v2_service_client::BoxFuture<'a, Result<(u16, Value), TransportError>>
        {
            Box::pin(async move {
                self.seen.lock().unwrap().push((path.to_string(), body));
                let mut guard = self.responses.lock().unwrap();
                if guard.is_empty() {
                    return Err(TransportError::Network("no response".to_string()));
                }
                Ok(guard.remove(0))
            })
        }
    }

    fn enroll_req() -> EnrollV2Request {
        EnrollV2Request {
            device_id: "device-new-0001".to_string(),
            student_id: "2510231106".to_string(),
            alg: "Ed25519".to_string(),
            public_key_jwk: r#"{"kty":"OKP","crv":"Ed25519","x":"AAA"}"#.to_string(),
            student_name_hash: "a".repeat(64),
            nonce: "b".repeat(32),
            ts: 1_794_260_000,
            signature: "SIG".to_string(),
        }
    }

    /// 验收①：首次登记成功路径 + **真的把本机材料发出去了**。
    #[test]
    fn enroll_success_sends_local_material_and_maps_kind() {
        let t = FakeTransport::new(vec![(
            200,
            json!({"ok": true, "status": "active", "device_id": "device-new-0001", "bound_by": "first_claim", "student_id_masked": "2510***"}),
        )]);
        let req = enroll_req();
        let out = tauri::async_runtime::block_on(enroll_v2(&t, &req)).expect("登记应成功");
        assert_eq!(out.kind, KIND_FIRST_CLAIM_OK);
        assert_eq!(out.message, "设备登记成功，本机已成为该学号的受信任设备");
        assert_eq!(out.device_id, "device-new-0001");
        assert_eq!(out.student_id_masked, "2510***");
        let calls = t.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "/identity/device/enroll");
        let sent = &calls[0].1;
        assert_eq!(sent["device_id"], "device-new-0001");
        assert_eq!(sent["student_id"], "2510231106");
        assert_eq!(sent["signature"], "SIG");
        assert_eq!(sent["alg"], "Ed25519");
    }

    /// 验收①：学号已被占 → 引导换机（kind 与文案可读，且不含学号明文）。
    #[test]
    fn enroll_student_taken_maps_to_readable_guidance() {
        let t = FakeTransport::new(vec![(
            409,
            json!({"ok": false, "reason": "student_active_on_other_device", "student_id_masked": "2510***"}),
        )]);
        let err = tauri::async_runtime::block_on(enroll_v2(&t, &enroll_req())).unwrap_err();
        assert_eq!(err.kind, KIND_STUDENT_TAKEN);
        assert!(
            err.message.contains("旧设备"),
            "文案必须给出下一步：{}",
            err.message
        );
        assert!(!err.message.contains("2510231106"), "文案不得含学号明文");
    }

    #[test]
    fn enroll_idempotent_maps_to_already_registered() {
        let t = FakeTransport::new(vec![(
            200,
            json!({"ok": true, "status": "active", "action": "idempotent", "student_id_masked": "2510***"}),
        )]);
        let out = tauri::async_runtime::block_on(enroll_v2(&t, &enroll_req())).unwrap();
        assert_eq!(out.kind, KIND_ALREADY_REGISTERED);
    }

    fn rebind_req() -> RebindRequestV2Request {
        RebindRequestV2Request {
            new_device_id: "device-new-0001".to_string(),
            student_id: "2510231106".to_string(),
            alg: "Ed25519".to_string(),
            public_key_jwk: "{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"AAA\"}".to_string(),
            student_name_hash: "a".repeat(64),
            new_pubkey_sha256: "c".repeat(64),
            nonce: "b".repeat(32),
            ts: 1_794_260_000,
            signature: "SIG".to_string(),
        }
    }

    /// 验收②（新设备侧）：发起换机只拿到 pending + request_id，**不产生任何绑定变更**。
    #[test]
    fn rebind_request_pending_returns_request_id_only() {
        let t = FakeTransport::new(vec![(
            200,
            json!({"ok": true, "status": "pending", "request_id": "d".repeat(32), "expires_at": 1_794_260_900i64, "student_id_masked": "2510***"}),
        )]);
        let out = tauri::async_runtime::block_on(rebind_request_v2(&t, &rebind_req())).unwrap();
        assert_eq!(out.kind, KIND_REQUEST_PENDING);
        assert_eq!(out.request_id, "d".repeat(32));
        assert_eq!(out.expires_at, 1_794_260_900);
        assert_eq!(out.new_pubkey_sha256, "c".repeat(64));
        assert_eq!(t.calls()[0].0, "/identity/device/rebind/request");
    }

    #[test]
    fn rebind_request_pending_without_request_id_is_not_success() {
        let t = FakeTransport::new(vec![(200, json!({"ok": true, "status": "pending"}))]);
        let err = tauri::async_runtime::block_on(rebind_request_v2(&t, &rebind_req())).unwrap_err();
        assert_eq!(err.kind, KIND_UNKNOWN, "契约违背不得当成成功");
    }

    #[test]
    fn rebind_request_no_active_device_maps_to_guidance() {
        let t = FakeTransport::new(vec![(
            400,
            json!({"ok": false, "reason": "rebind_no_active_device", "student_id_masked": "2510***"}),
        )]);
        let err = tauri::async_runtime::block_on(rebind_request_v2(&t, &rebind_req())).unwrap_err();
        assert_eq!(err.kind, KIND_NO_ACTIVE_DEVICE);
        assert!(err.message.contains("首次登记"));
    }

    fn approve_req() -> RebindApproveV2Request {
        RebindApproveV2Request {
            request_id: "d".repeat(32),
            new_device_id: "device-new-0001".to_string(),
            new_pubkey_sha256: "c".repeat(64),
            expires_at: 1_794_260_900,
            approver_device_id: "device-old-0001".to_string(),
            student_id: "2510231106".to_string(),
            nonce: "e".repeat(32),
            ts: 1_794_260_000,
            signature: "SIG".to_string(),
        }
    }

    /// 验收②（旧设备侧）：批准成功 → `approved`；服务端拒绝冒充 → `approver_mismatch`（不透传原文）。
    #[test]
    fn approve_success_and_mismatch_mapping() {
        let t = FakeTransport::new(vec![(
            200,
            json!({"ok": true, "status": "active", "device_id": "device-new-0001", "bound_by": "rebind_approved", "student_id_masked": "2510***"}),
        )]);
        let out = tauri::async_runtime::block_on(rebind_approve_v2(&t, &approve_req())).unwrap();
        assert_eq!(out.kind, KIND_APPROVED);
        assert_eq!(out.device_id, "device-new-0001");

        let t2 = FakeTransport::new(vec![(
            409,
            json!({"ok": false, "reason": "rebind_approver_mismatch", "detail": "内部细节不该出现"}),
        )]);
        let err =
            tauri::async_runtime::block_on(rebind_approve_v2(&t2, &approve_req())).unwrap_err();
        assert_eq!(err.kind, KIND_APPROVER_MISMATCH);
        assert!(!err.message.contains("内部细节"), "不得透传服务端细节");
    }

    /// 验收③：§4 全表 reason → kind/文案逐字正确（未知 → unknown，不透传）。

    /// 跨语言证据：把本模块**构造的两种 canonical** 与「用 P0-7 golden 私钥对其签名」
    /// 打印成一行 JSON（），交给 ocr-service（P1-3）的 Python 解析器/验签器核对
    /// —— 这是客户端与换绑服务端**线上格式一致**的最强证据（不依赖假服务）。
    #[test]
    fn emit_rebind_canonicals_for_cross_check() {
        use crate::identity::device_key::DeviceKey;
        use base64::{engine::general_purpose, Engine as _};

        let key = DeviceKey::from_seed([7u8; 32]);
        let request = build_rebind_request_canonical(
            "device-new-0001",
            "2510231106",
            &"ab".repeat(32),
            &"cd".repeat(16),
            1_794_260_000,
        );
        let approve = build_rebind_approve_canonical(
            &"ef".repeat(16),
            "device-old-0001",
            "device-new-0001",
            &"ab".repeat(32),
            &"cd".repeat(16),
            1_794_260_000,
        );
        let sig_req = general_purpose::URL_SAFE_NO_PAD.encode(key.sign(request.as_bytes()));
        let sig_apr = general_purpose::URL_SAFE_NO_PAD.encode(key.sign(approve.as_bytes()));
        let jwk = key.public_jwk();
        println!(
            "[P1-2 cross-check] {}",
            serde_json::json!({
                "request_canonical": request,
                "approve_canonical": approve,
                "request_signature": sig_req,
                "approve_signature": sig_apr,
                "public_key_x": jwk.x,
                "new_pubkey_sha256": "ab".repeat(32),
            })
        );
    }

    #[test]
    fn reason_table_is_complete_and_messages_are_fixed() {
        let table: [(&str, &str); 12] = [
            ("student_active_on_other_device", KIND_STUDENT_TAKEN),
            ("device_active_for_other_student", KIND_DEVICE_TAKEN),
            ("rebind_no_active_device", KIND_NO_ACTIVE_DEVICE),
            ("rebind_request_expired", KIND_REQUEST_EXPIRED),
            ("rebind_request_already_done", KIND_REQUEST_DONE),
            ("rebind_approver_mismatch", KIND_APPROVER_MISMATCH),
            ("rebind_approver_not_active", KIND_APPROVER_MISMATCH),
            ("rebind_new_device_taken", KIND_DEVICE_TAKEN),
            ("rebind_request_not_found", KIND_CODE_INVALID),
            ("rebind_pubkey_mismatch", KIND_CODE_INVALID),
            ("device_not_registered", KIND_NOT_ENROLLED),
            ("totally-unknown-reason", KIND_UNKNOWN),
        ];
        for (reason, kind) in table {
            let mapped = kind_for_reason(reason);
            assert_eq!(mapped, kind, "reason {reason} 映射错误");
            let msg = message_for_kind(mapped);
            assert!(!msg.is_empty());
            assert!(!msg.contains(reason), "文案不得含 reason 原文");
        }
    }

    #[test]
    fn network_and_malformed_body_map_to_stable_kinds() {
        let t = FakeTransport::new(vec![]);
        let err = tauri::async_runtime::block_on(enroll_v2(&t, &enroll_req())).unwrap_err();
        assert_eq!(err.kind, KIND_NETWORK);

        let t2 = FakeTransport::new(vec![(500, Value::Null)]);
        let err2 = tauri::async_runtime::block_on(enroll_v2(&t2, &enroll_req())).unwrap_err();
        assert_eq!(err2.kind, KIND_SERVICE_UNAVAILABLE);
    }

    /// 批准输入形状校验（签名前挡住）：换机码来源不可信。
    #[test]
    fn approve_shape_validation() {
        let now = 1_794_260_000;
        assert!(validate_approve_shape(&approve_req(), now).is_ok());
        for mutate in [
            |r: &mut RebindApproveV2Request| r.request_id = "SHORT".to_string(),
            |r: &mut RebindApproveV2Request| r.request_id = r.request_id.to_uppercase(),
            |r: &mut RebindApproveV2Request| r.new_device_id = "bad|device".to_string(),
            |r: &mut RebindApproveV2Request| r.new_pubkey_sha256 = "zz".to_string(),
            |r: &mut RebindApproveV2Request| r.expires_at = 1,
        ] {
            let mut req = approve_req();
            mutate(&mut req);
            let err = validate_approve_shape(&req, now).unwrap_err();
            assert_eq!(err.kind, KIND_CODE_INVALID, "非法形状必须是 code_invalid");
        }
        let mut no_device = approve_req();
        no_device.approver_device_id = String::new();
        assert_eq!(
            validate_approve_shape(&no_device, now).unwrap_err().kind,
            KIND_NOT_ENROLLED
        );
    }
}
