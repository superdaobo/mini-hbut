//! Identity Tauri commands 的传输模型（#622）。
//!
//! 命名约定：payload 字段使用 snake_case（与项目既有命令一致，如 ChaoxingLoginResult.student_id）。

use serde::{Deserialize, Serialize};

use super::device_key::PublicJwk;

/// `identity_device_status` 返回值：设备身份本地状态（含 keyring 可用性，fail closed 可见）。
#[derive(Debug, Clone, Serialize)]
pub struct DeviceStatusPayload {
    /// keyring 可用且设备身份功能可工作
    pub available: bool,
    /// 本机是否已有设备密钥
    pub has_key: bool,
    /// 已有密钥时的指纹（sha256(canonical JWK) base64url；无密钥为 null）
    pub fingerprint: Option<String>,
    /// 不可用原因（简体中文；不含敏感材料；可用时为 null）
    pub error: Option<String>,
}

/// `identity_get_public_key` 返回值：公开 JWK + 指纹（无任何私钥材料）。
#[derive(Debug, Clone, Serialize)]
pub struct PublicKeyPayload {
    pub public_jwk: PublicJwk,
    pub fingerprint: String,
    pub key_algorithm: &'static str,
}

/// `identity_enroll_device` 返回值（Core 签发）。
#[derive(Debug, Clone, Serialize)]
pub struct EnrollPayload {
    pub user_id: String,
    pub device_id: String,
    pub status: String,
    pub fingerprint: String,
}

/// `identity_sign_auth_request` 输入（request 详情来自 Core；scope 必须使用服务端快照）。
#[derive(Debug, Clone, Deserialize)]
pub struct SignAuthRequestInput {
    pub request_id: String,
    /// AuthRequest 的 server_challenge（设备签名的对象，非 secret）
    pub challenge: String,
    pub client_id: String,
    /// 服务端下发的 scope 列表
    pub scopes: Vec<String>,
    /// 本机已注册的 device_id（enroll 返回值，由前端持有）
    pub device_id: String,
}

/// 当前运行平台（与 core devices.platform CHECK 枚举一致）。
pub fn current_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "android") {
        "android"
    } else if cfg!(target_os = "ios") {
        "ios"
    } else {
        "unknown"
    }
}

/// P1-1：`identity_build_v2_canonical` 输入。
///
/// `device_id` 由前端保存的已登记 id 传入（本地无「服务端登记状态」缓存）；
/// 学号与姓名**不由前端传**（学号取本地登录会话、姓名取可信 user_info 快照）。
#[derive(Debug, Clone, Deserialize)]
pub struct BuildCanonicalInput {
    /// 本机已登记 device_id（enroll 返回值，由前端持有）
    pub device_id: String,
    /// 姓名（仅在可信 user_info 快照为空时作为兜底；进 canonical 的只是它的 sha256）
    pub student_name: Option<String>,
    /// 一次性 nonce（缺省 → 内部生成 32 位小写 hex）
    pub nonce: Option<String>,
    /// unix 秒（缺省 → 当前时间）
    pub ts: Option<i64>,
}

/// P1-1：`identity_build_v2_canonical` 返回（不含明文完整学号）。
#[derive(Debug, Clone, Serialize)]
pub struct BuildCanonicalPayload {
    /// v2 canonical 原文（无末尾换行）
    pub canonical: String,
    pub device_id: String,
    /// 学号掩码（前 4 位 + `***`）
    pub student_id_masked: String,
    pub student_name_hash: String,
    pub nonce: String,
    pub ts: i64,
}

/// P1-1：`identity_sign_canonical` 输入。
#[derive(Debug, Clone, Deserialize)]
pub struct SignCanonicalInput {
    /// 本机已登记 device_id（必须与 canonical 第 2 段一致）
    pub device_id: String,
    /// 期望绑定的学号（必须与 canonical 第 3 段一致，且与本机登录会话学号一致）
    pub student_id: String,
    /// v2 canonical 原文（由 `identity_build_v2_canonical` 构造）
    pub canonical: String,
}

/// P1-1：`identity_sign_canonical` 返回（只含公开材料 + 签名，无任何私钥材料）。
#[derive(Debug, Clone, Serialize)]
pub struct SignedCanonicalPayload {
    pub device_id: String,
    /// 恒 "Ed25519"
    pub alg: &'static str,
    /// base64url 无 padding（86 字符）
    pub signature: String,
    /// 设备公钥指纹（sha256(canonical JWK) base64url）
    pub fingerprint: String,
    /// 公钥 JWK JSON 字符串（便于**独立验签**；公开材料）
    pub public_key_jwk: String,
    /// canonical 的 sha256（小写 hex），供调用方与 Core 对账
    pub canonical_sha256: String,
    /// 学号掩码
    pub student_id_masked: String,
}

/// P1-2：换绑 canonical 的**专用**签名输入（角色白名单；不是任意串签名）。
#[derive(Debug, Clone, Deserialize)]
pub struct SignRebindInput {
    /// `"request"`（新设备发起）或 `"approve"`（旧设备批准）。
    pub role: String,
    /// `hbut-rebind-v1|…` canonical 原文。
    pub canonical: String,
    /// 本机 device_id（必须与 canonical 中对应角色段一致）。
    pub device_id: String,
    /// request 角色必填：学号（必须等于 canonical 第 4 段且等于本机登录会话学号）。
    pub student_id: Option<String>,
}

/// P1-2：首次登记（v2）输入。
#[derive(Debug, Clone, Deserialize)]
pub struct EnrollV2Input {
    pub device_id: String,
    /// 服务地址覆盖（缺省 → 生产常量；dev 允许本机回环）。
    pub service_base: Option<String>,
}

/// P1-2：发起换机（新设备）输入。
#[derive(Debug, Clone, Deserialize)]
pub struct RebindRequestV2Input {
    pub device_id: String,
    pub service_base: Option<String>,
}

/// P1-2：批准换机（旧设备）输入（字段来自**前端解析的换机码**；服务端会以自己存的 pending 重建 canonical 交叉校验）。
#[derive(Debug, Clone, Deserialize)]
pub struct RebindApproveV2Input {
    pub request_id: String,
    pub new_device_id: String,
    pub new_pubkey_sha256: String,
    /// 换机码里的过期时间（本机先挡过期码，避免白发请求）。
    pub expires_at: i64,
    /// 本机 device_id（批准方，必须是该学号当前活跃设备）。
    pub approver_device_id: String,
    pub service_base: Option<String>,
}

/// P1-2：三个流程的统一返回（`ok=false` 时仍带稳定 `kind` 与固定文案；**不含**服务端原文）。
#[derive(Debug, Clone, Serialize)]
pub struct FlowPayload {
    pub ok: bool,
    pub kind: String,
    pub message: String,
    pub device_id: String,
    pub student_id_masked: String,
    pub request_id: String,
    pub expires_at: i64,
    pub new_pubkey_sha256: String,
    /// 供前端组装换机码（= 本机公钥指纹用的同一份 sha256 口径）。
    pub public_key_jwk: String,
}

/// P2-4（#1208）：`identity_oidc_complete` 输入（浏览器回调 URL 由深链/loopback 页交回）。
///
/// `callback_url` 是**完整回调 URL**（`minihbut://identity/callback?code=..&state=..`
/// 或 loopback 形态 `http://127.0.0.1:<port>/callback?code=..&state=..`）；
/// code/state 在 Rust 侧解析，前端不接触 verifier/nonce/token。
#[derive(Debug, Clone, Deserialize)]
pub struct OidcCompleteInput {
    pub callback_url: String,
}

/// P2-4（loopback 回退）：等待回环回调的入参。
#[derive(Debug, Clone, serde::Deserialize)]
pub struct OidcAwaitCallbackInput {
    /// 等待上限（毫秒）；命令层会 clamp 到 1..=600000。
    pub timeout_ms: i64,
}
