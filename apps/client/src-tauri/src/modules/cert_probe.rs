//! #719 冷启动校内 HTTPS 证书探测模块。
//!
//! 主要职责:
//! 1. 冷启动时对校内两个域名各发起一次 HTTPS GET 根路径探测
//!    （`https://jwxt.hbut.edu.cn` 与 `https://e.hbut.edu.cn`，两台服务器两张独立证书）
//! 2. 依赖 rustls 默认严格校验判定证书是否可被系统信任链验证通过
//! 3. 结果三分类: ok / cert-error / network-error，供前端「我的」页面在
//!    cert-error 时显示「兼容模式」黄色提示；ok 与网络故障均不显示任何内容
//!
//! ⚠️ 关键约束（成败关键）:
//! - 业务 HTTP 客户端即将无条件放行证书异常（另一分支），其通道感知不到证书问题，
//!   因此本模块必须使用独立构建的一次性客户端；
//! - 绝对禁止复用 `HbutClient::build_http_client` 或任何共享客户端；
//! - 客户端构建时绝不配置 `danger_accept_invalid_certs`，保持 rustls 严格校验，
//!   这样 TLS 握手阶段的证书校验失败会原样体现在错误链中，供分类函数识别。

use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// 校内两个探测目标域（两台服务器两张独立证书）
pub const PROBE_DOMAINS: [&str; 2] = ["jwxt.hbut.edu.cn", "e.hbut.edu.cn"];

/// 连接超时（TCP/TLS 建连阶段）
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// 单域请求整体超时；两域并行探测，整体耗时约等于单域上限（8s 内）
const TOTAL_TIMEOUT: Duration = Duration::from_secs(8);

/// 证书探测结果三分类。
///
/// serde 以 kebab-case 输出，与前端约定的 `ok` / `cert-error` / `network-error` 一致。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CertProbeStatus {
    /// 握手与请求成功（收到任意 HTTP 状态码均算成功，含 302/403）
    Ok,
    /// 证书类错误（过期 / 未知颁发者 / 域名不匹配等 rustls/webpki 校验失败）
    CertError,
    /// 其他失败（超时 / DNS / 拒绝连接等网络故障），前端不提示
    NetworkError,
}

/// 单个域名的探测结果（返回给前端）
#[derive(Debug, Clone, Serialize)]
pub struct DomainCertStatus {
    /// 被探测的域名
    pub domain: String,
    /// 三分类结果
    pub status: CertProbeStatus,
}

// ─── 分类纯函数 ─────────────────────────────────────────────

/// 判断错误链上是否出现 TLS 证书类错误特征词（纯函数，便于单测）。
///
/// 对 `err` 及其 `source()` 链逐层取 Display 字符串，小写化后匹配以下关键词之一：
/// "certificate"、"invalid peer certificate"、"expired"、"unknownissuer"、"certexpired" 等。
/// 说明："invalid peer certificate" 已含 "certificate"，此处冗余列出仅为对齐需求描述、便于阅读。
fn error_chain_contains_cert_keyword(err: &(dyn std::error::Error + 'static)) -> bool {
    let mut current: Option<&dyn std::error::Error> = Some(err);
    while let Some(e) = current {
        let lower = e.to_string().to_lowercase();
        if lower.contains("certificate")
            || lower.contains("invalid peer certificate")
            || lower.contains("certexpired")
            || lower.contains("unknownissuer")
            || lower.contains("expired")
        {
            return true;
        }
        current = e.source();
    }
    false
}

/// 将单个错误三分类（纯函数）：命中证书特征词 → CertError，否则 → NetworkError。
fn classify_error(err: &(dyn std::error::Error + 'static)) -> CertProbeStatus {
    if error_chain_contains_cert_keyword(err) {
        CertProbeStatus::CertError
    } else {
        CertProbeStatus::NetworkError
    }
}

/// 将一次请求结果三分类（纯函数，便于单测）。
///
/// - `Ok(_)`：收到响应（任意 HTTP 状态码，含 302/403）→ 握手成功 → [`CertProbeStatus::Ok`]
/// - `Err(e)`：按错误链特征分类为 [`CertProbeStatus::CertError`] 或 [`CertProbeStatus::NetworkError`]
fn classify_request_result<T>(result: &Result<T, reqwest::Error>) -> CertProbeStatus {
    match result {
        Ok(_) => CertProbeStatus::Ok,
        Err(err) => classify_error(err),
    }
}

// ─── 探测实现 ───────────────────────────────────────────────

/// 构建本模块专用的一次性严格校验客户端。
///
/// ⚠️ 绝不调用 `danger_accept_invalid_certs(true)`：证书校验必须保持 rustls 默认严格行为。
/// 同时禁用代理，避免系统代理（尤其 MITM 类工具）干扰证书判定造成误报。
async fn build_probe_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(TOTAL_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .no_proxy()
        .build()
        .map_err(|e| format!("创建证书探测客户端失败: {}", e))
}

/// 对单个域名发起一次 GET 根路径探测并分类结果。
///
/// 收到任何 HTTP 状态码（含 302/403）都视为握手成功——我们只关心 TLS 层校验是否通过。
async fn probe_domain_once(client: &reqwest::Client, domain: &str) -> DomainCertStatus {
    let url = format!("https://{}/", domain);
    let outcome = client.get(&url).send().await;
    let status = classify_request_result(&outcome);
    DomainCertStatus {
        domain: domain.to_string(),
        status,
    }
}

/// 会话级缓存：整个应用进程只真正探测一轮（配合 MeView remount 特性，避免重复请求）。
static PROBE_CACHE: OnceLock<Mutex<Option<Vec<DomainCertStatus>>>> = OnceLock::new();

fn probe_cache() -> &'static Mutex<Option<Vec<DomainCertStatus>>> {
    PROBE_CACHE.get_or_init(|| Mutex::new(None))
}

/// Tauri Command：冷启动校内证书探测（带会话级缓存，重复调用直接返回缓存结果）。
#[tauri::command]
pub async fn probe_school_cert_status() -> Result<Vec<DomainCertStatus>, String> {
    // 命中缓存：本会话已探测过，直接复用（remount 场景零网络开销）
    if let Ok(cache) = probe_cache().lock() {
        if let Some(cached) = cache.as_ref() {
            return Ok(cached.clone());
        }
    }

    // 独立客户端：不复用任何业务共享客户端（见模块注释的关键约束）
    let client = build_probe_client().await?;

    // 两域并行探测（两台服务器两张独立证书），整体耗时受单域 8s 上限约束
    let (a, b) = tokio::join!(
        probe_domain_once(&client, PROBE_DOMAINS[0]),
        probe_domain_once(&client, PROBE_DOMAINS[1])
    );
    let results = vec![a, b];

    // 写入缓存（锁中毒时跳过缓存但不影响本次返回）
    if let Ok(mut cache) = probe_cache().lock() {
        *cache = Some(results.clone());
    }

    Ok(results)
}

// ─── 单元测试 ───────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error as StdError;
    use std::fmt;

    /// 测试用叶子错误：仅携带一段 Display 文案（模拟 rustls 错误串样式）
    #[derive(Debug)]
    struct LeafError(String);

    impl fmt::Display for LeafError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "{}", self.0)
        }
    }

    impl StdError for LeafError {}

    /// 测试用包装错误：模拟 reqwest → hyper → rustls 的多层 source 链结构
    #[derive(Debug)]
    struct WrappedError {
        msg: String,
        source: Option<Box<dyn StdError + 'static>>,
    }

    impl fmt::Display for WrappedError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "{}", self.msg)
        }
    }

    impl StdError for WrappedError {
        fn source(&self) -> Option<&(dyn StdError + 'static)> {
            self.source.as_deref()
        }
    }

    fn wrapped(msg: &str) -> WrappedError {
        WrappedError {
            msg: msg.to_string(),
            source: None,
        }
    }

    fn wrapping(msg: &str, inner: LeafError) -> WrappedError {
        WrappedError {
            msg: msg.to_string(),
            source: Some(Box::new(inner)),
        }
    }

    #[test]
    fn ok_result_is_classified_as_ok() {
        // ok 分支：不需要真实 Response，泛型占位即可验证分类逻辑
        let result: Result<(), reqwest::Error> = Ok(());
        assert_eq!(classify_request_result(&result), CertProbeStatus::Ok);
    }

    #[test]
    fn rustls_expired_certificate_chain_is_cert_error() {
        // 模拟 rustls: "invalid peer certificate: Expired"
        let err = wrapping(
            "error sending request for url (https://jwxt.hbut.edu.cn/)",
            LeafError("invalid peer certificate: Expired".to_string()),
        );
        assert_eq!(
            classify_error(&err),
            CertProbeStatus::CertError,
            "过期证书应命中错误链关键词"
        );
    }

    #[test]
    fn unknown_issuer_chain_is_cert_error() {
        // 模拟自签证书: UnknownIssuer
        let err = wrapping(
            "error sending request",
            LeafError("invalid peer certificate: UnknownIssuer".to_string()),
        );
        assert_eq!(classify_error(&err), CertProbeStatus::CertError);
    }

    #[test]
    fn generic_certificate_keyword_in_deep_chain_is_cert_error() {
        // 三层深链：reqwest → tls 层 → 底层 "CERTIFICATE verify failed"（大小写混合）
        let inner = Box::new(WrappedError {
            msg: "CERTIFICATE verify failed".to_string(),
            source: None,
        });
        let mid = WrappedError {
            msg: "tls handshake eof".to_string(),
            source: Some(inner),
        };
        let err = WrappedError {
            msg: "error sending request".to_string(),
            source: Some(Box::new(mid)),
        };
        assert_eq!(classify_error(&err), CertProbeStatus::CertError);
    }

    #[test]
    fn non_cert_errors_are_network_error() {
        // 典型网络故障文案不应被误判为证书问题
        for msg in [
            "connection refused",
            "dns error: failed to lookup address information",
            "operation timed out",
            "error sending request for url",
        ] {
            assert_eq!(
                classify_error(&wrapped(msg)),
                CertProbeStatus::NetworkError,
                "\"{}\" 应归类为网络故障",
                msg
            );
        }
    }

    #[test]
    fn keyword_matching_is_case_insensitive() {
        assert!(error_chain_contains_cert_keyword(&wrapped(
            "INVALID PEER CERTIFICATE: EXPIRED"
        )));
        // rustls 对未知颁发者的 Display 为 "UnknownIssuer"，小写化为 "unknownissuer"
        assert!(error_chain_contains_cert_keyword(&wrapped(
            "INVALID PEER CERTIFICATE: UNKNOWNISSUER"
        )));
    }

    /// 真实 reqwest 错误链回归：请求本机几乎必然无人监听的 1 号端口，
    /// 断言连接类失败被归为 network-error（而非误判为证书问题）。
    #[tokio::test]
    async fn real_unreachable_address_is_network_error() {
        let client = build_probe_client().await.expect("构建探测客户端失败");
        // 域名位携带 ":1" 使最终 URL 为 https://127.0.0.1:1/
        let status = probe_domain_once(&client, "127.0.0.1:1").await.status;
        assert_eq!(status, CertProbeStatus::NetworkError);
    }
}
