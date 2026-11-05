//! 模块受控请求内核（#1167 T06）。
//!
//! 目标：模块**永远拿不到会话**，只能按「已登记能力」让 Rust 代为发一次请求。
//!
//! 设计要点（对应契约 §4）：
//! - 能力登记表是唯一的准入来源：host / port / method / path / 允许的 query 与 form 键都在这里写死；
//! - 模块只能提供「参数值」，不能提供 URL、头、Cookie；
//! - Cookie 由 Rust 的 reqwest `Jar` 自动携带，响应剥掉 `Set-Cookie`；
//! - 请求/响应都有上限（超时、体积、并发），且账号切换后在途结果作废；
//! - 所有失败都映射到固定的 `MODULE_*` 错误码，前端可用它做三语文案。

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};

/// 单次请求的最大响应体（字节）。超过直接失败，不截断 —— 截断会让模块拿到半个 JSON。
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
/// 单次请求的最大表单体（字节）。
const MAX_FORM_BYTES: usize = 4 * 1024;
/// 默认超时与上限。
const DEFAULT_TIMEOUT_MS: u64 = 10_000;
const MAX_TIMEOUT_MS: u64 = 15_000;
/// 全局并发上限（同时进行的模块请求数）。
const MAX_CONCURRENT_REQUESTS: usize = 4;

/// 一个已登记能力。
#[derive(Debug, Clone)]
pub struct ModuleCapability {
    /// 能力 id（清单 permissions 里的字符串）。
    pub id: &'static str,
    pub scheme: &'static str,
    pub host: &'static str,
    pub port: u16,
    pub method: Method,
    /// 精确路径（不接受前缀匹配，避免「参数里塞路径」）。
    pub path: &'static str,
    /// 允许模块提供的 query 键（顺序无意义；未列出的键一律拒绝）。
    pub allowed_query_keys: &'static [&'static str],
    /// 允许模块提供的 form 键（仅 POST）。
    pub allowed_form_keys: &'static [&'static str],
    /// 固定发送的 Referer（值来自登记表，模块不可覆盖）。
    pub referer: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
}

impl Method {
    fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
        }
    }
}

/// 能力登记表（本阶段只登记**已在应用代码中实际使用**的只读接口）。
///
/// 说明：`auth.hbut.edu.cn` 的两个 GET 接口来自 `http_client/academic/student_info.rs`
/// （`USER_ONLINE_URL` / `USER_LOGS_URL`），是应用现有的只读查询，返回 JSON。
/// 需要 POST 的课表/成绩接口等 T08 用真实账号核对参数后再登记，避免把没验证过的路径写进来。
pub const CAPABILITIES: &[ModuleCapability] = &[
    ModuleCapability {
        id: "school.profile_online",
        scheme: "https",
        host: "auth.hbut.edu.cn",
        port: 443,
        method: Method::Get,
        path: "/personalInfo/UserOnline/user/queryUserOnline",
        allowed_query_keys: &["t"],
        allowed_form_keys: &[],
        referer: "https://auth.hbut.edu.cn/",
    },
    ModuleCapability {
        id: "school.login_logs",
        scheme: "https",
        host: "auth.hbut.edu.cn",
        port: 443,
        method: Method::Get,
        path: "/personalInfo/UserLogs/user/queryUserLogs",
        allowed_query_keys: &["t"],
        allowed_form_keys: &[],
        referer: "https://auth.hbut.edu.cn/",
    },
];

/// 请求（来自宿主 SDK，不是模块原样透传）。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModuleFetchRequest {
    /// 模块实例 id（宿主分配）。
    pub instance_id: String,
    /// 请求 id（宿主生成，响应原样带回，用于对齐 postMessage）。
    pub request_id: String,
    /// 能力 id。
    pub capability: String,
    /// 打开实例时的账号作用域（学号/身份键）；与当前会话不一致 → 拒绝。
    #[serde(default)]
    pub account_scope: String,
    /// 模块提供的 query 参数（只允许登记过的键）。
    #[serde(default)]
    pub query: BTreeMap<String, String>,
    /// 模块提供的表单字段（只允许登记过的键，仅 POST）。
    #[serde(default)]
    pub form: BTreeMap<String, String>,
    /// 期望超时（会被夹到上限内）。
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

/// 响应。
#[derive(Debug, Clone, Serialize)]
pub struct ModuleFetchResponse {
    pub request_id: String,
    pub status: u16,
    pub content_type: String,
    pub body: String,
    /// 是否发生了账号切换（在途结果作废时直接返回错误，这里恒为 false）。
    pub account_scope: String,
}

/// 错误（对外只暴露码与安全文案）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModuleFetchError {
    UnknownCapability,
    NotTrusted,
    TargetRejected,
    ParamRejected(String),
    AccountSwitched,
    Timeout,
    ResponseTooLarge { limit: usize },
    TooManyRequests,
    Upstream(String),
}

impl ModuleFetchError {
    pub fn code(&self) -> &'static str {
        match self {
            ModuleFetchError::UnknownCapability => "MODULE_CAPABILITY_UNKNOWN",
            ModuleFetchError::NotTrusted => "MODULE_NOT_TRUSTED",
            ModuleFetchError::TargetRejected => "MODULE_TARGET_REJECTED",
            ModuleFetchError::ParamRejected(_) => "MODULE_PARAM_REJECTED",
            ModuleFetchError::AccountSwitched => "MODULE_ACCOUNT_SWITCHED",
            ModuleFetchError::Timeout => "MODULE_REQUEST_TIMEOUT",
            ModuleFetchError::ResponseTooLarge { .. } => "MODULE_RESPONSE_TOO_LARGE",
            ModuleFetchError::TooManyRequests => "MODULE_TOO_MANY_REQUESTS",
            ModuleFetchError::Upstream(_) => "MODULE_UPSTREAM_ERROR",
        }
    }

    pub fn message(&self) -> String {
        match self {
            ModuleFetchError::UnknownCapability => "模块请求的能力未登记".to_string(),
            ModuleFetchError::NotTrusted => "模块未通过发布者验签，不允许发起受控请求".to_string(),
            ModuleFetchError::TargetRejected => "目标地址不在该能力的允许范围内".to_string(),
            ModuleFetchError::ParamRejected(reason) => format!("请求参数被拒绝: {reason}"),
            ModuleFetchError::AccountSwitched => "账号已切换，旧实例的请求已作废".to_string(),
            ModuleFetchError::Timeout => "模块请求超时".to_string(),
            ModuleFetchError::ResponseTooLarge { limit } => {
                format!("响应体超过上限（{limit} 字节）")
            }
            ModuleFetchError::TooManyRequests => "模块请求过于频繁，请稍后重试".to_string(),
            ModuleFetchError::Upstream(_) => "上游请求失败".to_string(),
        }
    }

    /// 给前端用的完整错误串（`CODE: 文案`）。
    pub fn to_string_with_code(&self) -> String {
        format!("{}: {}", self.code(), self.message())
    }
}

/// 查出能力（`None` = 未登记）。
pub fn lookup_capability(capability_id: &str) -> Option<&'static ModuleCapability> {
    CAPABILITIES.iter().find(|item| item.id == capability_id)
}

/// 参数值安全检查：不允许控制字符、CRLF、超长、非 ASCII 之外的奇怪内容。
fn validate_param_value(key: &str, value: &str) -> Result<(), ModuleFetchError> {
    if value.len() > 512 {
        return Err(ModuleFetchError::ParamRejected(format!("{key} 过长")));
    }
    if value
        .chars()
        .any(|ch| ch.is_control() || ch == '\r' || ch == '\n' || ch == '\0')
    {
        return Err(ModuleFetchError::ParamRejected(format!("{key} 含控制字符")));
    }
    Ok(())
}

/// 校验请求是否落在能力范围内（纯函数，便于单测）。
///
/// 返回 `(query 串, form 体)`；两者都由登记表过滤后重建，模块无法注入额外键。
pub fn validate_request(
    request: &ModuleFetchRequest,
) -> Result<
    (
        &'static ModuleCapability,
        Vec<(String, String)>,
        Vec<(String, String)>,
    ),
    ModuleFetchError,
> {
    let capability =
        lookup_capability(request.capability.trim()).ok_or(ModuleFetchError::UnknownCapability)?;

    // query：只允许登记过的键，且每个键只能出现一次（BTreeMap 本身保证唯一）
    let mut query = Vec::new();
    for (key, value) in &request.query {
        if !capability.allowed_query_keys.contains(&key.as_str()) {
            return Err(ModuleFetchError::ParamRejected(format!(
                "query 键 {key} 未登记"
            )));
        }
        validate_param_value(key, value)?;
        // 时间戳类参数只允许数字，避免下游把它当路径/协议拼接
        if key == "t" && !value.chars().all(|ch| ch.is_ascii_digit()) {
            return Err(ModuleFetchError::ParamRejected("t 只能是数字".to_string()));
        }
        query.push((key.clone(), value.clone()));
    }
    if capability.method == Method::Get && !request.form.is_empty() {
        return Err(ModuleFetchError::ParamRejected(
            "GET 能力不允许表单".to_string(),
        ));
    }

    // form：只允许登记过的键
    let mut form = Vec::new();
    let mut total = 0usize;
    for (key, value) in &request.form {
        if !capability.allowed_form_keys.contains(&key.as_str()) {
            return Err(ModuleFetchError::ParamRejected(format!(
                "form 键 {key} 未登记"
            )));
        }
        validate_param_value(key, value)?;
        total += key.len() + value.len();
        form.push((key.clone(), value.clone()));
    }
    if total > MAX_FORM_BYTES {
        return Err(ModuleFetchError::ParamRejected("表单体过大".to_string()));
    }

    Ok((capability, query, form))
}

/// 目标 URL（由登记表拼出，模块无法参与）。
pub fn build_target_url(capability: &ModuleCapability, query: &[(String, String)]) -> String {
    match query.is_empty() {
        true => format!(
            "{}://{}:{}{}",
            capability.scheme, capability.host, capability.port, capability.path
        ),
        false => {
            let pairs: Vec<String> = query
                .iter()
                .map(|(key, value)| format!("{key}={}", urlencode(value)))
                .collect();
            format!(
                "{}://{}:{}{}?{}",
                capability.scheme,
                capability.host,
                capability.port,
                capability.path,
                pairs.join("&")
            )
        }
    }
}

/// 最小 URL 编码（只处理 query 值）。
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// 超时夹取。
pub fn clamp_timeout(requested: Option<u64>) -> Duration {
    let millis = requested
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .min(MAX_TIMEOUT_MS)
        .max(1);
    Duration::from_millis(millis)
}

/// 并发闸门（进程级）。
static IN_FLIGHT: AtomicU64 = AtomicU64::new(0);

/// 预留一个并发槽位；返回 `None` 表示超限。
pub struct ConcurrencyGuard;

impl ConcurrencyGuard {
    pub fn acquire() -> Option<Self> {
        let current = IN_FLIGHT.fetch_add(1, Ordering::SeqCst) + 1;
        if current as usize > MAX_CONCURRENT_REQUESTS {
            IN_FLIGHT.fetch_sub(1, Ordering::SeqCst);
            return None;
        }
        Some(ConcurrencyGuard)
    }
}

impl Drop for ConcurrencyGuard {
    fn drop(&mut self) {
        IN_FLIGHT.fetch_sub(1, Ordering::SeqCst);
    }
}

/// 当前并发数（测试用）。
pub fn in_flight() -> u64 {
    IN_FLIGHT.load(Ordering::SeqCst)
}

/// 从响应头里挑出允许回传给模块的部分（不含 Set-Cookie 等）。
pub fn sanitize_response_headers(headers: &[(String, String)]) -> BTreeMap<String, String> {
    const ALLOWED: &[&str] = &["content-type", "cache-control", "date", "etag"];
    let mut out = BTreeMap::new();
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        if ALLOWED.contains(&lower.as_str()) {
            out.insert(lower, value.clone());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(capability: &str) -> ModuleFetchRequest {
        ModuleFetchRequest {
            instance_id: "inst_1".to_string(),
            request_id: "req_1".to_string(),
            capability: capability.to_string(),
            account_scope: "20230001".to_string(),
            query: BTreeMap::new(),
            form: BTreeMap::new(),
            timeout_ms: None,
        }
    }

    #[test]
    fn registered_capabilities_are_well_formed() {
        for capability in CAPABILITIES {
            assert!(!capability.id.is_empty());
            assert!(
                capability.path.starts_with('/'),
                "{} 路径必须以 / 开头",
                capability.id
            );
            assert!(capability.scheme == "https", "{} 必须 https", capability.id);
            assert!(
                !capability.allowed_query_keys.is_empty()
                    || !capability.allowed_form_keys.is_empty()
                    || capability.method == Method::Get,
                "{} 至少要声明允许的参数来源",
                capability.id
            );
        }
    }

    #[test]
    fn unknown_capability_is_rejected() {
        let error = validate_request(&request("school.grades_everything")).unwrap_err();
        assert_eq!(error.code(), "MODULE_CAPABILITY_UNKNOWN");
    }

    #[test]
    fn unregistered_query_key_is_rejected() {
        let mut req = request("school.profile_online");
        req.query
            .insert("redirect".to_string(), "https://evil.example".to_string());
        let error = validate_request(&req).unwrap_err();
        assert_eq!(error.code(), "MODULE_PARAM_REJECTED");
    }

    #[test]
    fn crlf_injection_in_params_is_rejected() {
        let mut req = request("school.profile_online");
        req.query
            .insert("t".to_string(), "1\r\nX-Injected: 1".to_string());
        assert!(validate_request(&req).is_err());

        let mut req2 = request("school.profile_online");
        req2.query.insert("t".to_string(), "123abc".to_string());
        // t 必须是纯数字
        assert!(validate_request(&req2).is_err());
    }

    #[test]
    fn form_on_get_capability_is_rejected() {
        let mut req = request("school.profile_online");
        req.form.insert("xnm".to_string(), "2024".to_string());
        let error = validate_request(&req).unwrap_err();
        assert_eq!(error.code(), "MODULE_PARAM_REJECTED");
    }

    #[test]
    fn target_url_is_built_from_registry_only() {
        let mut req = request("school.profile_online");
        req.query.insert("t".to_string(), "1700000000".to_string());
        let (capability, query, _) = validate_request(&req).expect("valid");
        let url = build_target_url(capability, &query);
        assert_eq!(
            url,
            "https://auth.hbut.edu.cn:443/personalInfo/UserOnline/user/queryUserOnline?t=1700000000"
        );
        // 模块无法影响 host/path
        assert!(url.starts_with("https://auth.hbut.edu.cn:443/personalInfo/"));
    }

    #[test]
    fn timeout_is_clamped() {
        assert_eq!(
            clamp_timeout(None),
            Duration::from_millis(DEFAULT_TIMEOUT_MS)
        );
        assert_eq!(
            clamp_timeout(Some(999_999)),
            Duration::from_millis(MAX_TIMEOUT_MS)
        );
        assert_eq!(clamp_timeout(Some(0)), Duration::from_millis(1));
    }

    #[test]
    fn concurrency_limit_is_enforced_and_released() {
        let baseline = in_flight();
        let mut guards = Vec::new();
        for _ in 0..MAX_CONCURRENT_REQUESTS {
            guards.push(ConcurrencyGuard::acquire().expect("should acquire"));
        }
        assert!(ConcurrencyGuard::acquire().is_none(), "超过上限必须拒绝");
        guards.pop();
        assert!(
            ConcurrencyGuard::acquire().is_some(),
            "释放槽位后应可再获取"
        );
        drop(guards);
        assert_eq!(in_flight(), baseline);
    }

    #[test]
    fn response_headers_are_filtered() {
        let headers = vec![
            ("Set-Cookie".to_string(), "sid=1".to_string()),
            ("Content-Type".to_string(), "application/json".to_string()),
            ("X-Powered-By".to_string(), "php".to_string()),
        ];
        let sanitized = sanitize_response_headers(&headers);
        assert_eq!(sanitized.len(), 1);
        assert_eq!(
            sanitized.get("content-type").map(String::as_str),
            Some("application/json")
        );
        assert!(!sanitized.contains_key("set-cookie"));
    }

    #[test]
    fn response_size_limit_is_declared() {
        // 文档化断言：上限存在且不为 0（真正的超限在 fetch 层判断）
        assert!(MAX_RESPONSE_BYTES > 0 && MAX_RESPONSE_BYTES <= 4 * 1024 * 1024);
    }

    #[test]
    fn urlencode_escapes_non_ascii_and_reserved() {
        assert_eq!(urlencode("2024-2025"), "2024-2025");
        assert_eq!(urlencode("a b&c=中"), "a%20b%26c%3D%E4%B8%AD");
    }
}

/// 实际执行受控请求（#1167 T06）。
///
/// 调用方必须是**宿主**（主窗口），模块自身拿不到 `HbutClient`：
/// - `trusted=false` 直接拒绝（未验签模块不得取数）；
/// - 账号作用域与当前会话不一致 → `MODULE_ACCOUNT_SWITCHED`（切账号后在途请求作废）；
/// - Cookie 由 reqwest `Jar` 自动携带；响应头只保留安全子集。
pub async fn fetch_with_session(
    client: &crate::http_client::HbutClient,
    current_account: &str,
    trusted: bool,
    request: ModuleFetchRequest,
) -> Result<ModuleFetchResponse, ModuleFetchError> {
    if !trusted {
        return Err(ModuleFetchError::NotTrusted);
    }
    let requested_scope = request.account_scope.trim().to_string();
    if !requested_scope.is_empty() && !current_account.trim().is_empty() {
        if requested_scope != current_account.trim() {
            return Err(ModuleFetchError::AccountSwitched);
        }
    }

    let (capability, query, form) = validate_request(&request)?;
    let url = build_target_url(capability, &query);
    let timeout = clamp_timeout(request.timeout_ms);
    let guard = ConcurrencyGuard::acquire().ok_or(ModuleFetchError::TooManyRequests)?;
    let http = client.http_client();

    let mut builder = match capability.method {
        Method::Get => http.get(&url),
        Method::Post => {
            let pairs: Vec<(String, String)> = form.clone();
            http.post(&url).form(&pairs)
        }
    };
    builder = builder
        .timeout(timeout)
        .header(reqwest::header::ACCEPT, "application/json, text/plain, */*")
        .header(reqwest::header::REFERER, capability.referer)
        .header("X-Requested-With", "XMLHttpRequest")
        // 明确不带模块可控的头：Cookie/Origin/User-Agent 均由 Rust 侧决定
        ;
    let response = builder.send().await.map_err(|error| {
        if error.is_timeout() {
            ModuleFetchError::Timeout
        } else {
            ModuleFetchError::Upstream(error.to_string())
        }
    })?;
    drop(guard);

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| ModuleFetchError::Upstream(error.to_string()))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(ModuleFetchError::ResponseTooLarge {
            limit: MAX_RESPONSE_BYTES,
        });
    }
    let body = String::from_utf8_lossy(&bytes).to_string();
    Ok(ModuleFetchResponse {
        request_id: request.request_id,
        status,
        content_type,
        body,
        account_scope: requested_scope,
    })
}

/// 当前账号（用于账号切换判定）。
pub fn current_account(client: &crate::http_client::HbutClient) -> String {
    client
        .user_info
        .as_ref()
        .map(|info| info.student_id.clone())
        .unwrap_or_default()
}
