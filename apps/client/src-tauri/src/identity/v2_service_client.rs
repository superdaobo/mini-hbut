//! P1-2：**学生认证服务**（v2 通道）HTTP 客户端与地址纪律。
//!
//! 边界与安全约定：
//! - App **绝不持有** ocr-service 的内部令牌；本模块只与「学生认证服务」通信
//!   （P2-2 接真实通道前，dev 可指向本机假服务）；
//! - `Transport` 抽象出来是为了**可单测**：流程层只依赖 `V2Transport`，
//!   测试用假实现即可覆盖全部分支，无需真网络；
//! - 服务地址沿用既有纪律：生产只允许固定 origin；本机回环仅在
//!   `debug_assertions` + 显式开关下允许（与 `resolve_identity_core_base_url` 同款）。

use std::pin::Pin;

use serde_json::Value;
use sha2::{Digest, Sha256};

use super::device_key::PublicJwk;
use super::errors::IdentityError;

/// 学生认证服务生产 origin（与既有 Identity Core origin **不同**：那是旧的 v1 Core）。
pub const V2_SERVICE_ORIGIN: &str = "https://auth.xn--vhq74jc2fzpchter27a.com";

/// 允许本机假服务（仅 dev）：`HBUT_IDENTITY_V2_ALLOW_LOCAL_SERVICE=1` 且 `debug_assertions`。
pub const V2_ALLOW_LOCAL_SERVICE_ENV: &str = "HBUT_IDENTITY_V2_ALLOW_LOCAL_SERVICE";

/// 供 trait 使用的简化 boxed future（避免引入新依赖）。
pub type BoxFuture<'a, T> = Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

/// 传输层错误（**只区分类别**，不把底层细节透传到面向用户的文案）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportError {
    /// 网络不可达 / 超时 / TLS 失败。
    Network(String),
    /// 响应不是合法 JSON（或读取失败）。
    Decode(String),
}

/// 最小传输抽象：POST 一个 JSON、拿到 (HTTP 状态码, JSON 体)。
pub trait V2Transport: Send + Sync {
    fn post_json<'a>(
        &'a self,
        path: &'a str,
        body: Value,
    ) -> BoxFuture<'a, Result<(u16, Value), TransportError>>;
}

/// 真实实现（reqwest）。
pub struct ReqwestV2Transport {
    base: String,
    http: reqwest::Client,
}

impl ReqwestV2Transport {
    pub fn new(base_url: &str) -> Self {
        Self {
            base: base_url.trim_end_matches('/').to_string(),
            http: reqwest::Client::new(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }
}

impl V2Transport for ReqwestV2Transport {
    fn post_json<'a>(
        &'a self,
        path: &'a str,
        body: Value,
    ) -> BoxFuture<'a, Result<(u16, Value), TransportError>> {
        Box::pin(async move {
            let url = format!("{}{}", self.base, path);
            let resp = self
                .http
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| TransportError::Network(e.to_string()))?;
            let status = resp.status().as_u16();
            let text = resp
                .text()
                .await
                .map_err(|e| TransportError::Decode(e.to_string()))?;
            let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            Ok((status, value))
        })
    }
}

/// 设备公钥指纹的 sha256（**与 ocr-service `identity_auth/rebind.pubkey_sha256` 同口径**）：
/// `sha256("{"kty":…,"crv":…,"x":…}")` —— 紧凑 JSON（无空格）、固定键序 `kty,crv,x`、仅公钥成员。
///
/// 跨语言一致性有 golden 向量单测锁定（见文件末 `pubkey_sha256_matches_server_golden_vector`）。
pub fn pubkey_sha256(jwk: &PublicJwk) -> String {
    let json = format!(
        r#"{{"kty":"{}","crv":"{}","x":"{}"}}"#,
        jwk.kty, jwk.crv, jwk.x
    );
    let digest = Sha256::digest(json.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// 解析服务地址：
/// - 生产：只允许 `V2_SERVICE_ORIGIN`（忽略输入的 path/query/凭据）；
/// - 本机：`debug_assertions` + `HBUT_IDENTITY_V2_ALLOW_LOCAL_SERVICE=1` 时允许 `http://127.0.0.1[:port]`。
pub fn resolve_v2_service_base(input: &str, allow_local: bool) -> Result<String, IdentityError> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err(IdentityError::InvalidInput(
            "学生认证服务地址未配置".to_string(),
        ));
    }
    let parsed = url::Url::parse(raw)
        .map_err(|_| IdentityError::InvalidInput("学生认证服务地址格式非法".to_string()))?;
    if parsed.username() != ""
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.path(), "" | "/")
    {
        return Err(IdentityError::InvalidInput(
            "学生认证服务地址只能是受信任 origin".to_string(),
        ));
    }
    let origin = parsed.origin().ascii_serialization();
    if origin == V2_SERVICE_ORIGIN {
        return Ok(V2_SERVICE_ORIGIN.to_string());
    }
    if allow_local
        && parsed.scheme() == "http"
        && matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost"))
    {
        return Ok(origin);
    }
    Err(IdentityError::InvalidInput(
        "拒绝向非受信任的学生认证服务发送设备身份数据".to_string(),
    ))
}

/// 默认服务地址：环境变量（dev 覆盖）→ 生产常量。
pub fn default_v2_service_base() -> String {
    std::env::var("HBUT_IDENTITY_V2_SERVICE_BASE")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| V2_SERVICE_ORIGIN.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::device_key::DeviceKey;

    /// **跨语言 golden 向量**：与 ocr-service（P1-3，`main=bddbd17`）的
    /// `identity_auth.rebind.pubkey_sha256` 对同一 JWK 的结果逐字一致。
    #[test]
    fn pubkey_sha256_matches_server_golden_vector() {
        let key = DeviceKey::from_seed([7u8; 32]);
        let jwk = key.public_jwk();
        assert_eq!(
            jwk.x, "6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw",
            "P0-7 golden seed 的公钥应固定（跨语言向量前提）"
        );
        assert_eq!(
            pubkey_sha256(&jwk),
            "9cea3b1b1a6c091c2f915d5c2ad39860c01b40984efa8404e39b059521f7211b",
            "必须与 ocr-service `rebind.pubkey_sha256` 同口径（Python 侧独立复算过）"
        );
    }

    #[test]
    fn resolve_v2_service_base_discipline() {
        assert_eq!(
            resolve_v2_service_base(V2_SERVICE_ORIGIN, false).unwrap(),
            V2_SERVICE_ORIGIN
        );
        // 生产 origin 带路径/查询/凭据 → 拒绝
        for bad in [
            "https://auth.xn--vhq74jc2fzpchter27a.com/x",
            "https://auth.xn--vhq74jc2fzpchter27a.com/?a=1",
            "https://u:p@auth.xn--vhq74jc2fzpchter27a.com",
            "https://evil.example",
            "",
        ] {
            assert!(
                resolve_v2_service_base(bad, false).is_err(),
                "{bad} 必须拒绝"
            );
        }
        // 本机回环：默认拒绝；显式允许时通过
        assert!(resolve_v2_service_base("http://127.0.0.1:8099", false).is_err());
        assert_eq!(
            resolve_v2_service_base("http://127.0.0.1:8099", true).unwrap(),
            "http://127.0.0.1:8099"
        );
        assert!(resolve_v2_service_base("http://10.0.0.5:8099", true).is_err());
    }
}
