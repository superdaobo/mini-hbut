//! HTTP 客户端主入口：负责会话保持、公共工具函数与模块拆分的统一管理。
//!
//! 该文件主要职责：
//! - 组装 `HbutClient`（统一的请求客户端与会话状态）
//! - 提供登录/学籍/电费等子模块的公共依赖
//! - 实现通用加密/随机串等基础工具
//!
//! 约束说明：
//! - 所有网络请求必须复用 `cookie_jar` 以保持 CAS 会话
//! - OCR 请求使用独立的 `ocr_client`，避免污染主会话
//! - 这里不直接实现业务接口，业务逻辑在子模块中实现

/// 始终写入 runtime_log + stderr（前端调试窗 / HTTP bridge 可拉取）
#[macro_export]
macro_rules! hbut_debug {
    ($($arg:tt)*) => {{
        let __msg = format!($($arg)*);
        // 尝试识别 [scope] 前缀
        let (__scope, __body) = if let Some(rest) = __msg.strip_prefix('[') {
            if let Some(end) = rest.find(']') {
                let s = &rest[..end];
                let b = rest[end + 1..].trim_start();
                (s.to_string(), if b.is_empty() { __msg.clone() } else { b.to_string() })
            } else {
                ("Rust".to_string(), __msg.clone())
            }
        } else {
            ("Rust".to_string(), __msg.clone())
        };
        $crate::runtime_log::log_debug(__scope, __body);
    }};
}

/// 学习通/一码通重登等关键路径：始终 info 级别，便于用户在调试窗看到
#[macro_export]
macro_rules! hbut_session_log {
    ($scope:expr, $($arg:tt)*) => {{
        $crate::runtime_log::log_info($scope, format!($($arg)*));
    }};
}

/// 登录/会话链路的关键日志出口（#984 要求 E）。
///
/// 同时写两个通道，保证 dev 与 release 两种构建都「看得见」：
/// 1. `runtime_log`（info）→ 应用内调试窗、bridge `/debug/logs`、stderr；
/// 2. `log` crate（info）→ 落盘 `%LOCALAPPDATA%\com.hbut.mini\logs\mini-hbut.log`。
///
/// 只用 `println!` 是不够的：release 版 GUI 的 stdout 会被丢弃，日志不落盘。
#[macro_export]
macro_rules! hbut_auth_log {
    ($($arg:tt)*) => {{
        let __msg = format!($($arg)*);
        let __body = __msg.strip_prefix("[Auth] ").unwrap_or(__msg.as_str());
        $crate::runtime_log::log_info("Auth", __body);
        log::info!("{}", __msg);
    }};
}

use chrono::{DateTime, Utc};
use reqwest::{
    cookie::{CookieStore, Jar},
    Client,
};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::Engine;
use rand::Rng;

use crate::{parser, CalendarEvent, Exam, Grade, LoginPageInfo, ScheduleCourse, UserInfo};

mod academic;
mod ai;
mod auth;
mod electricity;
mod library;
mod qxzkb;
mod session;
mod utils;

// AES-CBC 加密类型
pub(super) type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

// 使用正确的 CAS 地址
pub(super) const AUTH_BASE_URL: &str = "https://auth.hbut.edu.cn/authserver";
pub(super) const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";
pub(super) const CHAOXING_JWXT_BASE_URL: &str = "https://hbut.jw.chaoxing.com";
/// 教务 CAS service：**必须**用 `/admin/caslogin`，不能用 `/admin/?loginType=1`。
///
/// 依据 #984 实测（`data/issue-984-link-map.md` 路径 A/C 对照实验）：
/// - service = `/admin/?loginType=1`：CAS 发出有效 ticket 后，教务在
///   `/admin/?loginType=1&ticket=ST-…` 上返回 **303 → `/admin/login`**，会话始终建立不起来；
/// - service = `/admin/caslogin`：CAS → `/admin/caslogin?ticket=ST-…` → **302 → `/admin/?loginType=1`**，
///   一步建立会话。
/// 两条路径除 service 字符串外条件完全相同，因此 service 是决定性变量。
pub(super) const TARGET_SERVICE: &str = "https://jwxt.hbut.edu.cn/admin/caslogin";

/// 生产主域（契约 docs/architecture/backend-endpoints-contract.md §9：两域模型）
pub(super) const PRODUCTION_OCR_ENDPOINT: &str = "https://mini.hbut.site/api/ocr/recognize";
/// 唯一兜底域（原自建机明文端点已随两域模型下架；契约 §9）
pub(super) const FALLBACK_OCR_ENDPOINT: &str =
    "https://mini-hbut-ocr-service.hf.space/api/ocr/recognize";
/// 已下线的测试域（Space 已被 HuggingFace 置为 PAUSED）。
///
/// 2026-10-06 起**所有构建档位**统一走生产主域 + 唯一兜底域，测试域不再被任何档位使用；
/// 这里保留它的唯一目的是**拒绝**存量配置里的历史值 —— 否则请求会被带回一个不存在的后端，
/// 而失败形态是「返回 HTML 而非 JSON」这类静默错误（前端只报「无效响应」）。
const RETIRED_TEST_OCR_HOST: &str = "mini-hbut-testocr1.hf.space";
/// OCR 端点候选：主域失败时按序回落唯一兜底域。
pub(super) const DEFAULT_OCR_FALLBACK_ENDPOINTS: &[&str] =
    &[PRODUCTION_OCR_ENDPOINT, FALLBACK_OCR_ENDPOINT];

/// 登录风控：完整 CAS 尝试（收到认证服务器真实响应）的冷却时长（60s）。
pub(super) const LOGIN_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(60);
/// 传输层失败（未收到认证服务器响应，如网络/DNS/TLS/超时）后的短 backoff，
/// 仅用于避免连点刷屏，远小于 60s 登录冷却，绝不把用户锁死（#659 根因 5）。
pub(super) const TRANSPORT_BACKOFF: std::time::Duration = std::time::Duration::from_secs(5);

/// 客户端错误分类（风控与错误判定用，不改变对外字符串文案）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpClientErrorKind {
    /// 传输层失败：未收到认证服务器真实响应（DNS/TCP/TLS/超时等）。
    Transport,
    /// 认证失败：收到认证服务器返回的业务失败响应（账号/密码/验证码/锁定等）。
    AuthFailed,
    /// 教务会话落地失败：CAS 认证已通过（拿到 ticket 或已持 TGT），
    /// 但教务系统的 Session 没有建立起来（#984 情况 C）。
    /// 必须与「账号密码错误」「历史会话自然过期」「网络错误」区分开。
    JwxtBootstrapFailed,
    /// 其它/业务错误（参数缺失、登录页异常、未知）。
    Other,
}

/// 教务 Session 落地结果（#984 实现要求 C）。
///
/// 语义收敛点：CAS 认证状态、教务会话落地状态、业务 Session 过期状态三者不再互相覆盖。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum JwxtBootstrapOutcome {
    /// 教务在线会话确实可用。
    Authenticated,
    /// 回到 CAS 登录页：需要重新认证。
    NeedsCasAuth,
    /// CAS 通过但教务会话未建立。
    JwxtBootstrapFailed,
    /// 传输层失败（网络/DNS/TLS/超时）。
    TransportError,
}

/// 带分类的客户端错误。`Display` 只输出原始消息，保持对外字符串/结构兼容；
/// 同时可经 `Box<dyn Error + Send + Sync>` 向下转型（downcast）获取 `kind`。
#[derive(Debug, Clone)]
pub struct HttpClientError {
    kind: HttpClientErrorKind,
    message: String,
}

impl HttpClientError {
    pub fn new(kind: HttpClientErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// 构造认证失败类错误（收到认证服务器业务失败响应）。
    pub fn auth_failed(message: impl Into<String>) -> Self {
        Self::new(HttpClientErrorKind::AuthFailed, message)
    }

    /// 构造教务会话落地失败类错误（CAS 已通过但教务 Session 未建立，#984 情况 C）。
    pub fn jwxt_bootstrap_failed() -> Self {
        Self::new(
            HttpClientErrorKind::JwxtBootstrapFailed,
            "统一身份认证已通过，但教务会话建立失败，请稍后重试",
        )
    }

    /// 构造其它/业务类错误。
    pub fn other(message: impl Into<String>) -> Self {
        Self::new(HttpClientErrorKind::Other, message)
    }

    pub fn kind(&self) -> HttpClientErrorKind {
        self.kind
    }
}

impl std::fmt::Display for HttpClientError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for HttpClientError {}

/// 判定错误是否为「传输层失败」（未收到认证服务器真实响应）。
/// 识别 `HttpClientError::Transport` 与原生 `reqwest::Error`（connect/timeout/request/body）。
pub(super) fn is_transport_error(err: &(dyn std::error::Error + Send + Sync + 'static)) -> bool {
    if let Some(e) = err.downcast_ref::<HttpClientError>() {
        return e.kind() == HttpClientErrorKind::Transport;
    }
    if let Some(re) = err.downcast_ref::<reqwest::Error>() {
        return re.is_timeout() || re.is_connect() || re.is_request() || re.is_body();
    }
    false
}

/// 判定错误是否为「教务会话落地失败」（CAS 已通过但教务 Session 建不起来，#984 情况 C）。
/// 用于触发一次定向自愈，并保证不会把它误当成「历史会话自然过期」。
pub(super) fn is_jwxt_bootstrap_failure(
    err: &(dyn std::error::Error + Send + Sync + 'static),
) -> bool {
    err.downcast_ref::<HttpClientError>()
        .map(|e| e.kind() == HttpClientErrorKind::JwxtBootstrapFailed)
        .unwrap_or(false)
}

fn is_retired_test_ocr_endpoint(endpoint: &str) -> bool {
    endpoint
        .trim()
        .to_ascii_lowercase()
        .contains(RETIRED_TEST_OCR_HOST)
}

/// 默认远程 OCR 端点：恒为生产主域。
///
/// 2026-10-06 决策前，dev / 本地档位默认走 testocr1；该 Space 被 HF 置为 PAUSED 后
/// dev 包没有任何可用后端，故所有档位统一走生产主域（见 `statistics_environment.ts` 文件头）。
pub(super) fn default_remote_ocr_endpoint() -> &'static str {
    PRODUCTION_OCR_ENDPOINT
}

/// 过滤 OCR 端点：只允许 HTTPS，并拒绝已下线的测试域。
///
/// 原实现按构建档位分两套规则（dev 档位反过来拒生产域）；档位分流取消后收敛为单套。
pub(super) fn filter_ocr_endpoints(endpoints: Vec<String>) -> Vec<String> {
    endpoints
        .into_iter()
        .filter(|endpoint| {
            endpoint.trim().starts_with("https://") && !is_retired_test_ocr_endpoint(endpoint)
        })
        .collect()
}

fn default_local_ocr_fallback_endpoints() -> Vec<String> {
    DEFAULT_OCR_FALLBACK_ENDPOINTS
        .iter()
        .map(|v| v.to_string())
        .collect()
}

/// 判断是否跳转到了教务登录页（包含 CAS 登录与教务自身登录页）。
/// 注意：不匹配 `/admin/caslogin`，因为它是学习通 CAS 的 service URL 本身，
/// 成功跳转后 final_url 仍然包含该路径，会造成误判。
pub(super) fn looks_like_academic_login_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("authserver/login")
        || (lower.contains("/admin/login") && !lower.contains("/admin/login2"))
}

/// CAS 登录页判定（唯一权威入口，禁止各文件自写 `contains("authserver/login")`）。
pub(super) fn looks_like_cas_login_url(url: &str) -> bool {
    url.to_lowercase().contains("authserver/login")
}

/// 门户自身登录页判定。
///
/// 门户换票成功的那一跳是 `e.hbut.edu.cn/login?portalService=…&ticket=ST-…`，
/// **带 ticket 时是成功页**；不带 ticket 的 `e.hbut.edu.cn/login` 才是登录页。
pub(super) fn looks_like_portal_login_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("e.hbut.edu.cn/login") && !lower.contains("ticket=")
}

/// 「是否仍停留在登录落地页」的统一判定。
///
/// 覆盖三个概念：CAS 登录页 / 教务自身登录页（`/admin/login`，排除 `/admin/login2`）/ 门户登录页。
/// 注意：**不匹配 `/admin/caslogin`** —— 它既是 CAS service 本身，也是换票成功后的中间跳转路径。
pub(super) fn looks_like_login_landing_url(url: &str) -> bool {
    looks_like_cas_login_url(url)
        || looks_like_academic_login_url(url)
        || looks_like_portal_login_url(url)
}

/// 判断 service 登录是否真的成功：既不在任何登录落地页，又确实回到了 service 域名。
///
/// 收敛自原 `auth.rs` 私有实现（#984 实现要求 A / D），避免「A 文件认为已登录、B 文件认为未登录」。
pub(super) fn response_indicates_service_success(response_url: &str, service_url: &str) -> bool {
    if looks_like_login_landing_url(response_url) {
        return false;
    }
    let Some(host) = reqwest::Url::parse(service_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
    else {
        return false;
    };
    response_url.contains(&host)
}

/// 教务业务域名选择（排名 / 校历等复用）。
/// 双侧 cookie 时信任 academic_base，避免过期 jwxt cookie 强制走 jwxt（#390/#393）。
pub(super) fn resolve_ranking_base_url(
    academic_base: &str,
    prefer_chaoxing: bool,
    has_jwxt_cookie: bool,
    has_chaoxing_cookie: bool,
) -> &'static str {
    if prefer_chaoxing && has_chaoxing_cookie {
        return CHAOXING_JWXT_BASE_URL;
    }
    if has_chaoxing_cookie && !has_jwxt_cookie {
        return CHAOXING_JWXT_BASE_URL;
    }
    if has_jwxt_cookie && !has_chaoxing_cookie {
        return JWXT_BASE_URL;
    }
    if has_chaoxing_cookie && academic_base.contains("chaoxing") {
        return CHAOXING_JWXT_BASE_URL;
    }
    if has_jwxt_cookie {
        return JWXT_BASE_URL;
    }
    if has_chaoxing_cookie {
        return CHAOXING_JWXT_BASE_URL;
    }
    JWXT_BASE_URL
}

/// 主域名失败（登录页）时的备选域名顺序。
pub(super) fn ranking_base_fallback_chain(
    primary: &'static str,
    has_jwxt_cookie: bool,
    has_chaoxing_cookie: bool,
) -> Vec<&'static str> {
    let mut chain = vec![primary];
    if primary == JWXT_BASE_URL && has_chaoxing_cookie {
        chain.push(CHAOXING_JWXT_BASE_URL);
    } else if primary == CHAOXING_JWXT_BASE_URL && has_jwxt_cookie {
        chain.push(JWXT_BASE_URL);
    }
    chain
}

#[cfg(test)]
mod ranking_domain_tests {
    use super::*;

    #[test]
    fn dual_cookies_prefer_false_follows_academic_chaoxing() {
        let base = resolve_ranking_base_url("https://hbut.jw.chaoxing.com", false, true, true);
        assert_eq!(base, CHAOXING_JWXT_BASE_URL);
    }

    #[test]
    fn dual_cookies_prefer_false_does_not_force_stale_jwxt() {
        let base = resolve_ranking_base_url(CHAOXING_JWXT_BASE_URL, false, true, true);
        assert_ne!(base, JWXT_BASE_URL);
    }

    #[test]
    fn jwxt_primary_falls_back_to_chaoxing() {
        let chain = ranking_base_fallback_chain(JWXT_BASE_URL, true, true);
        assert_eq!(chain, vec![JWXT_BASE_URL, CHAOXING_JWXT_BASE_URL]);
    }
}

/// 生成随机字符串（与学校 CAS 前端相同的字符集）
pub(super) fn get_random_string(length: usize) -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect()
}

/// 使用 AES-CBC 加密密码（模拟 CAS 前端 encrypt.js 的加密逻辑）
pub(super) fn encrypt_password_aes(
    password: &str,
    salt: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if salt.len() != 16 {
        return Err(format!("Salt must be 16 bytes, got {}", salt.len()).into());
    }

    // Salt 作为密钥，IV 使用随机 16 字符（与前端 encrypt.js 一致）
    let key = salt.as_bytes();
    let iv = get_random_string(16);
    let iv_bytes = iv.as_bytes();

    // 生成随机前缀 + 密码
    let random_prefix = get_random_string(64);
    let plain_text = format!("{}{}", random_prefix, password);
    let plain_bytes = plain_text.as_bytes();

    // 计算需要的缓冲区大小（PKCS7 填充）
    let block_size = 16;
    let padded_len = ((plain_bytes.len() / block_size) + 1) * block_size;
    let mut buf = vec![0u8; padded_len];
    buf[..plain_bytes.len()].copy_from_slice(plain_bytes);

    // AES-CBC 加密
    let cipher = Aes128CbcEnc::new(key.into(), iv_bytes.into());
    let encrypted = cipher
        .encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
        .map_err(|e| format!("Encryption failed: {:?}", e))?;

    // Base64 编码
    Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
}

/// 功能说明（待补充）
#[derive(Clone)]
pub struct HbutClient {
    pub(crate) client: Client,
    pub(super) ocr_client: Client,
    pub(crate) cookie_jar: Arc<Jar>,
    /// 门户会话是否已登录（modules 侧桥接/业务会读取）
    pub(crate) is_logged_in: bool,
    pub user_info: Option<UserInfo>,
    pub(super) last_login_inputs: Option<HashMap<String, String>>,
    pub(crate) last_username: Option<String>,
    pub(crate) last_password: Option<String>,
    pub(super) electricity_token: Option<String>,
    pub(super) electricity_token_at: Option<std::time::Instant>,
    pub(super) electricity_refresh_token: Option<String>,
    pub(super) electricity_token_expires_at: Option<DateTime<Utc>>,
    pub(super) ocr_endpoint: Option<String>,
    pub(super) ocr_remote_endpoints: Vec<String>,
    pub(super) ocr_local_fallback_endpoints: Vec<String>,
    pub(super) ocr_active_endpoint: Option<String>,
    pub(super) ocr_active_source: Option<String>,
    pub(super) ocr_last_error: Option<String>,
    pub(super) ocr_telemetry_device_id: Option<String>,
    pub(super) ocr_telemetry_student_id: Option<String>,
    pub(super) last_login_attempt: Option<std::time::Instant>,
    /// 最近一次「未收到认证服务器响应」的登录失败时间（传输层/登录页获取/参数解析失败），
    /// 用于 5s 短 backoff（#659：传输层失败不再锁 60s）。
    pub(super) last_login_short_backoff_at: Option<std::time::Instant>,
    /// 测试专用：注入「获取登录页」结果（None = 走真实链路）。
    #[cfg(test)]
    pub(super) test_login_page: Option<
        std::sync::Arc<
            dyn Fn() -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>>
                + Send
                + Sync,
        >,
    >,
    /// 测试专用：注入「CAS 登录 POST」结果（None = 走真实链路）。
    #[cfg(test)]
    pub(super) test_cas_post: Option<
        std::sync::Arc<
            dyn Fn() -> Result<(String, u16, String), Box<dyn std::error::Error + Send + Sync>>
                + Send
                + Sync,
        >,
    >,
    /// 测试专用：注入「登录成功后建教务会话并拉取用户信息」结果（None = 走真实链路）。
    #[cfg(test)]
    pub(super) test_finalize: Option<
        std::sync::Arc<
            dyn Fn() -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> + Send + Sync,
        >,
    >,
    /// 测试专用：注入 `/admin/caslogin` 请求结果（None = 走真实链路）。
    ///
    /// #984 新增。此前只有 `test_finalize`，它整体替换 `finalize_jwxt_user_session()`，
    /// 导致 `/admin/caslogin` 这一跳在测试中**从未被真实执行过** —— 这正是 T4/T5
    /// （CAS 成功但教务落地失败 / 回到 CAS 登录页）此前写不出来的原因。
    /// 返回 `(final_url, status, html)`，与 `test_cas_post` 形状一致。
    #[cfg(test)]
    pub(super) test_caslogin: Option<
        std::sync::Arc<
            dyn Fn() -> Result<(String, u16, String), Box<dyn std::error::Error + Send + Sync>>
                + Send
                + Sync,
        >,
    >,
    pub(super) last_login_time: Option<std::time::Instant>,
    pub(super) last_relogin_attempt: Option<std::time::Instant>,
    pub(super) last_relogin_failed_at: Option<std::time::Instant>,
    pub(super) prefer_chaoxing_jwxt: bool,
}

impl HbutClient {
    /// 根据当前 Cookie 自动选择教务系统主域名。
    ///
    /// 说明：
    /// - 学校原始教务链路使用 `jwxt.hbut.edu.cn`
    /// - 学习通链路下，教务入口与接口主域名为 `hbut.jw.chaoxing.com`
    ///   若继续请求旧域名，可能出现“已登录但接口未授权”。
    pub(super) fn academic_base_url(&self) -> &'static str {
        if self.prefer_chaoxing_jwxt {
            return CHAOXING_JWXT_BASE_URL;
        }
        let chaoxing_url =
            reqwest::Url::parse(CHAOXING_JWXT_BASE_URL).expect("invalid CHAOXING_JWXT_BASE_URL");
        let has_chaoxing_cookie = match self.cookie_jar.cookies(&chaoxing_url) {
            Some(v) => v
                .to_str()
                .map(|raw| !raw.trim().is_empty())
                .unwrap_or(false),
            None => false,
        };

        if has_chaoxing_cookie {
            CHAOXING_JWXT_BASE_URL
        } else {
            JWXT_BASE_URL
        }
    }

    /// 显式设置“学习通教务域名优先”标记。
    pub fn set_chaoxing_login_mode(&mut self, enabled: bool) {
        self.prefer_chaoxing_jwxt = enabled;
    }

    /// 供业务模块发起教务域 HTTP 请求（如学校消息抓取）。
    pub(crate) fn http_client(&self) -> &Client {
        &self.client
    }

    /// 当前应使用的教务系统根地址。
    pub(crate) fn jwxt_base_url(&self) -> &'static str {
        self.academic_base_url()
    }

    fn build_http_client(jar: Arc<Jar>) -> Client {
        let mut builder = Client::builder()
            .cookie_store(true)
            .cookie_provider(jar)
            .redirect(reqwest::redirect::Policy::limited(10));
        if Self::insecure_tls_allowed() {
            builder = builder.danger_accept_invalid_certs(true);
        }
        // 说明：insecure_tls_allowed() 恒为 true（#717 统一 TLS 放行策略），
        // 此处保留条件写法是为了让「是否放行」的判断只存在于该函数一处。
        // 默认走系统 DNS。仅当 MINI_HBUT_DNS_PIN=1 时强制钉死校内 IP
        //（部分旧环境 getaddrinfo 失败才需要；误钉 IP 会导致“像断网一样登不上”）。
        if Self::dns_pin_enabled() {
            builder = builder
                .resolve(
                    "auth.hbut.edu.cn",
                    std::net::SocketAddr::from(([202, 114, 191, 47], 443)),
                )
                .resolve(
                    "jwxt.hbut.edu.cn",
                    std::net::SocketAddr::from(([202, 114, 191, 16], 443)),
                )
                .resolve(
                    "hbut.jw.chaoxing.com",
                    std::net::SocketAddr::from(([202, 114, 191, 16], 443)),
                )
                .resolve(
                    "code.hbut.edu.cn",
                    std::net::SocketAddr::from(([202, 114, 191, 2], 443)),
                );
        }
        builder
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            )
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("创建 HTTP 客户端失败")
    }

    fn dns_pin_enabled() -> bool {
        std::env::var("MINI_HBUT_DNS_PIN")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }

    /// 全应用 TLS 放行策略的唯一判定入口（#717 收口，恒为 true）。
    ///
    /// 安全权衡（产品决策）：
    /// - 放行即同时跳过三类证书校验：有效期校验、自签/未知 CA 校验、主机名匹配校验，
    ///   理论上会扩大中间人攻击面；
    /// - 但学校官方域名（jwxt.hbut.edu.cn 教务系统、e.hbut.edu.cn 门户等）历史上多次出现
    ///   证书过期/链不完整的情况，若严格校验会导致全校用户在证书异常期间完全无法使用
    ///   成绩查询、电费、一码通等核心业务；
    /// - 因此产品决策为：校内官方业务域名在**任何时候都必须可访问**，
    ///   Release 与 Debug 构建行为保持一致，无条件放行，不再读取环境变量或构建开关。
    /// - 风险缓解：请求目标 URL 均硬编码为校内官方域名，且 OCR 等第三方通道
    ///   （`build_ocr_client()`、`identity/*` 等）仍保留严格校验，不受本策略影响。
    pub(crate) fn insecure_tls_allowed() -> bool {
        true
    }

    fn build_ocr_client() -> Client {
        Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("创建 OCR 客户端失败")
    }

    /// 创建默认客户端并加载历史会话快照
    pub fn new() -> Self {
        let jar = Arc::new(Jar::default());
        let client = Self::build_http_client(Arc::clone(&jar));
        let ocr_client = Self::build_ocr_client();

        let mut instance = Self {
            client,
            ocr_client,
            cookie_jar: jar,
            is_logged_in: false,
            user_info: None,
            last_login_inputs: None,
            last_username: None,
            last_password: None,
            electricity_token: None,
            electricity_token_at: None,
            electricity_refresh_token: None,
            electricity_token_expires_at: None,
            ocr_endpoint: None,
            ocr_remote_endpoints: Vec::new(),
            ocr_local_fallback_endpoints: default_local_ocr_fallback_endpoints(),
            ocr_active_endpoint: None,
            ocr_active_source: None,
            ocr_last_error: None,
            ocr_telemetry_device_id: None,
            ocr_telemetry_student_id: None,
            last_login_attempt: None,
            last_login_short_backoff_at: None,
            #[cfg(test)]
            test_login_page: None,
            #[cfg(test)]
            test_cas_post: None,
            #[cfg(test)]
            test_finalize: None,
            #[cfg(test)]
            test_caslogin: None,
            last_login_time: None,
            last_relogin_attempt: None,
            last_relogin_failed_at: None,
            prefer_chaoxing_jwxt: false,
        };
        instance.load_cookie_snapshot_from_file();
        instance
    }

    /// 设置 OCR 服务端点（允许为空，空则走默认配置）
    pub fn set_ocr_endpoint(&mut self, endpoint: String) {
        let trimmed = endpoint.trim();
        if trimmed.is_empty() {
            self.ocr_endpoint = None;
            self.ocr_remote_endpoints.clear();
        } else {
            let normalized = Self::normalize_ocr_endpoint(trimmed);
            self.ocr_endpoint = Some(normalized.clone());
            self.ocr_remote_endpoints = filter_ocr_endpoints(vec![normalized]);
        }
        if self.ocr_local_fallback_endpoints.is_empty() {
            self.ocr_local_fallback_endpoints = default_local_ocr_fallback_endpoints();
        }
        self.ocr_local_fallback_endpoints =
            filter_ocr_endpoints(self.ocr_local_fallback_endpoints.clone());
        // 每次配置更新后清理运行态，下一次 OCR 请求会重新填充状态。
        self.ocr_active_endpoint = None;
        self.ocr_active_source = None;
        self.ocr_last_error = None;
    }

    pub fn set_ocr_telemetry_context(&mut self, device_id: String, student_id: String) {
        let did = device_id.trim();
        self.ocr_telemetry_device_id = if did.is_empty() {
            None
        } else {
            Some(did.chars().take(128).collect())
        };

        let sid = student_id.trim();
        self.ocr_telemetry_student_id =
            if (9..=10).contains(&sid.len()) && sid.chars().all(|c| c.is_ascii_digit()) {
                Some(sid.to_string())
            } else {
                None
            };
    }

    pub fn set_ocr_runtime_config(
        &mut self,
        endpoints: Vec<String>,
        local_fallback_endpoints: Vec<String>,
    ) {
        self.ocr_remote_endpoints =
            filter_ocr_endpoints(Self::normalize_ocr_endpoint_list(endpoints));
        self.ocr_endpoint = self.ocr_remote_endpoints.first().cloned();

        let normalized_local = Self::normalize_ocr_endpoint_list(local_fallback_endpoints);
        self.ocr_local_fallback_endpoints = if normalized_local.is_empty() {
            default_local_ocr_fallback_endpoints()
        } else {
            filter_ocr_endpoints(normalized_local)
        };

        self.ocr_active_endpoint = None;
        self.ocr_active_source = None;
        self.ocr_last_error = None;
    }

    pub(super) fn normalize_ocr_endpoint(input: &str) -> String {
        let endpoint = input.trim();
        if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
            if endpoint.contains("/api/ocr/recognize") {
                endpoint.to_string()
            } else {
                format!("{}/api/ocr/recognize", endpoint.trim_end_matches('/'))
            }
        } else {
            format!(
                "http://{}/api/ocr/recognize",
                endpoint.trim_end_matches('/')
            )
        }
    }

    pub(super) fn normalize_ocr_endpoint_list(values: Vec<String>) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        for value in values {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            let normalized = Self::normalize_ocr_endpoint(trimmed);
            if seen.insert(normalized.clone()) {
                result.push(normalized);
            }
        }
        filter_ocr_endpoints(result)
    }

    pub(super) fn set_ocr_runtime_success(&mut self, source: &str, endpoint: &str) {
        self.ocr_active_source = Some(source.to_string());
        self.ocr_active_endpoint = Some(endpoint.to_string());
        self.ocr_last_error = None;
    }

    pub(super) fn set_ocr_runtime_error(&mut self, source: &str, endpoint: &str, error: &str) {
        self.ocr_active_source = Some(source.to_string());
        self.ocr_active_endpoint = Some(endpoint.to_string());
        self.ocr_last_error = Some(error.to_string());
    }

    pub fn get_ocr_runtime_status(&self) -> serde_json::Value {
        serde_json::json!({
            "configured_endpoint": self.ocr_endpoint.clone().unwrap_or_default(),
            "configured_endpoints": self.ocr_remote_endpoints.clone(),
            "local_fallback_endpoints": self.ocr_local_fallback_endpoints.clone(),
            "default_remote_endpoint": default_remote_ocr_endpoint(),
            "fallback_endpoint": FALLBACK_OCR_ENDPOINT,
            "default_local_fallback_endpoints": DEFAULT_OCR_FALLBACK_ENDPOINTS,
            "active_endpoint": self.ocr_active_endpoint.clone(),
            "active_source": self.ocr_active_source.clone().unwrap_or_else(|| "unknown".to_string()),
            "fallback_used": self.ocr_active_source.as_deref().map(|v| v.contains("fallback")).unwrap_or(false),
            "last_error": self.ocr_last_error.clone(),
        })
    }

    /// 缓存用户名/密码，用于后续 SSO 自动重登
    pub fn set_credentials(&mut self, username: String, password: String) {
        self.last_username = Some(username);
        self.last_password = Some(password);
    }

    /// 保存电费授权 token，并记录获取时间用于过期判断
    pub fn set_electricity_token(&mut self, token: String) {
        if !token.trim().is_empty() {
            self.electricity_token = Some(token);
            self.electricity_token_at = Some(std::time::Instant::now());
        }
    }

    /// 设置电费授权会话（access token + refresh token + 过期时间）
    pub fn set_electricity_session(
        &mut self,
        token: String,
        refresh_token: Option<String>,
        expires_at: Option<DateTime<Utc>>,
    ) {
        if !token.trim().is_empty() {
            self.electricity_token = Some(token);
            self.electricity_token_at = Some(std::time::Instant::now());
        }
        if let Some(rt) = refresh_token {
            if !rt.trim().is_empty() {
                self.electricity_refresh_token = Some(rt);
            }
        }
        if let Some(exp) = expires_at {
            self.electricity_token_expires_at = Some(exp);
        }
    }

    /// 获取当前电费会话快照（用于持久化）
    pub fn get_electricity_session(
        &self,
    ) -> (Option<String>, Option<String>, Option<DateTime<Utc>>) {
        (
            self.electricity_token.clone(),
            self.electricity_refresh_token.clone(),
            self.electricity_token_expires_at.clone(),
        )
    }

    /// 彻底重置 Cookie Jar 与 HTTP 客户端，清理异常会话污染。
    pub(super) fn reset_http_state(&mut self) {
        let jar = Arc::new(Jar::default());
        self.cookie_jar = Arc::clone(&jar);
        self.client = Self::build_http_client(jar);
        self.ocr_client = Self::build_ocr_client();
        self.prefer_chaoxing_jwxt = false;
    }

    /// 定向自愈（#984 实现要求 B）：只清掉 `.hbut.edu.cn` 域的认证 Cookie
    /// （CAS / 教务 / 门户 / 一码通 共用该域），保留学习通域（`.chaoxing.com`）Cookie。
    ///
    /// 与 `clear_session()` 的区别（后者是登出语义，会连带清 DB 持久化 Cookie 与快照）：
    /// - 不动任何业务缓存（成绩 / 课表 / 用户信息）；
    /// - 不动数据库里的凭据与记住的密码；
    /// - 不重置 `is_logged_in` / `user_info`。
    ///
    /// 用途：出现「CAS 看似有状态但教务落在 `/admin/login`」时做一次最小范围修复，
    /// 之后重新拉取新鲜 CAS 登录页参数再提交用户本次密码。
    /// **调用方必须限制次数（最多一次）**，避免形成无限重试。
    pub(super) fn reset_hbut_auth_cookies(&mut self) {
        const CHAOXING_ORIGINS: &[&str] = &[
            "https://passport2.chaoxing.com",
            "https://i.chaoxing.com",
            "https://mooc1.chaoxing.com",
            "https://hbut.jw.chaoxing.com",
        ];
        let jar = Arc::new(Jar::default());
        for origin in CHAOXING_ORIGINS {
            let Ok(url) = reqwest::Url::parse(origin) else {
                continue;
            };
            let Some(raw) = self
                .cookie_jar
                .cookies(&url)
                .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
            else {
                continue;
            };
            for pair in raw.split(';') {
                let pair = pair.trim();
                if pair.is_empty() {
                    continue;
                }
                jar.add_cookie_str(&format!("{}; Domain=.chaoxing.com; Path=/", pair), &url);
            }
        }
        self.cookie_jar = Arc::clone(&jar);
        self.client = Self::build_http_client(jar);
        // 登录页参数（execution 一次性）必须重取，否则复用旧值必然失败
        self.last_login_inputs = None;
        println!("[Auth] 定向自愈：已清理 .hbut.edu.cn 域认证 Cookie，保留学习通域 Cookie");
    }

    /// 登录频率控制：至少间隔 60 秒，降低 CAS 风控风险。
    /// 仅在收到认证服务器真实响应（成功/认证失败/5xx 等业务响应）后才会记录，
    /// 传输层失败不触发（见 `login_transport_backoff_remaining`，#659 根因 5）。
    pub(super) fn login_cooldown_remaining(&self) -> Option<std::time::Duration> {
        let last = self.last_login_attempt?;
        let elapsed = last.elapsed();
        if elapsed >= LOGIN_COOLDOWN {
            None
        } else {
            Some(LOGIN_COOLDOWN - elapsed)
        }
    }

    /// 传输层失败（未收到认证服务器响应）后的短 backoff 剩余时间。
    /// 独立于 60s 登录冷却，时长为 `TRANSPORT_BACKOFF`（5s），仅防连点刷屏，不锁死用户。
    pub(super) fn login_transport_backoff_remaining(&self) -> Option<std::time::Duration> {
        let last = self.last_login_short_backoff_at?;
        let elapsed = last.elapsed();
        if elapsed >= TRANSPORT_BACKOFF {
            None
        } else {
            Some(TRANSPORT_BACKOFF - elapsed)
        }
    }

    /// 计算“重登冷却期”剩余时间，避免频繁触发登录导致风控
    fn relogin_cooldown_remaining(&self) -> Option<std::time::Duration> {
        const COOLDOWN: std::time::Duration = std::time::Duration::from_secs(180);
        let last = self.last_relogin_failed_at.or(self.last_relogin_attempt)?;
        let elapsed = last.elapsed();
        if elapsed >= COOLDOWN {
            None
        } else {
            Some(COOLDOWN - elapsed)
        }
    }
}

/// #717：统一 TLS 放行策略的单测。
#[cfg(test)]
mod tls_policy_tests {
    use super::*;

    /// 放行判断必须无条件为 true（Release 与 Debug 一致），
    /// 且不读取任何环境变量、不看构建开关——防止证书过期时校内业务不可用的问题回归
    /// （放行策略唯一来源：`HbutClient::insecure_tls_allowed()`）。
    #[test]
    fn insecure_tls_allowed_is_unconditionally_true() {
        assert!(
            HbutClient::insecure_tls_allowed(),
            "TLS 放行策略必须恒为 true（#717：校内域名任何时候都必须可访问）"
        );
    }
}

#[cfg(test)]
mod statistics_environment_tests {
    use super::*;

    /// 2026-10-06 决策：所有构建档位统一走生产主域 + 唯一兜底域，
    /// 已下线的测试域（Space 已 PAUSED）在任何档位都必须被拒绝。
    #[test]
    fn ocr_endpoints_are_unified_on_production_and_reject_retired_test_host() {
        assert_eq!(default_remote_ocr_endpoint(), PRODUCTION_OCR_ENDPOINT);

        let retired_test = "https://mini-hbut-testocr1.hf.space/api/ocr/recognize".to_string();
        let filtered = filter_ocr_endpoints(vec![
            PRODUCTION_OCR_ENDPOINT.to_string(),
            FALLBACK_OCR_ENDPOINT.to_string(),
            retired_test.clone(),
            "http://plain.example.com/api/ocr/recognize".to_string(),
        ]);

        assert!(filtered.iter().any(|value| value == PRODUCTION_OCR_ENDPOINT));
        assert!(filtered.iter().any(|value| value == FALLBACK_OCR_ENDPOINT));
        // 已下线的测试域与非 HTTPS 地址都必须被剔除
        assert!(!filtered.iter().any(|value| value == &retired_test));
        assert!(!filtered.iter().any(|value| value.starts_with("http://")));
    }

    #[test]
    fn local_fallback_defaults_to_production_then_fallback_domain() {
        assert_eq!(
            default_local_ocr_fallback_endpoints(),
            vec![
                PRODUCTION_OCR_ENDPOINT.to_string(),
                FALLBACK_OCR_ENDPOINT.to_string()
            ]
        );
    }
}
