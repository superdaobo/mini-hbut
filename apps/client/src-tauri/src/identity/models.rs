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
