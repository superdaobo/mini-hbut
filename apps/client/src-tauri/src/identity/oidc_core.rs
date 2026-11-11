//! P2-4（issue #1208）：OIDC 授权码 + PKCE 客户端核心逻辑（纯函数、无 IO、全部可单测）。
//!
//! 「为什么」独立成纯逻辑模块：
//! - 登录全流程（打开浏览器 → 深链/回环回调 → 兑换令牌 → 校验 id_token）是身份 v2 的
//!   新信任入口；其中形状校验与密码学校验部分不依赖网络/keyring/Tauri 运行时，
//!   拆成纯函数后可以在无网络环境下把每条拒绝路径都用单测锁死；
//! - 命令层（`oidc_commands.rs`，agent B）只负责编排：`OidcConfig::from_env` →
//!   `generate_pkce` / `generate_state` / `generate_nonce` → `build_authorize_url` →
//!   `PendingStore::put` → 回调 `parse_callback` → `PendingStore::take_matching`
//!   → HTTP 兑换 → `verify_id_token`，任何一步失败一律拒绝、不写会话。
//!
//! 安全基线（规格 §0 冻结）：
//! - **不信任 id_token 头部**：先断言 `header.alg == "RS256"`（`none`/`HS256`/其它一律拒，
//!   不用头部 alg 去「选」验证算法）；`kid` 必须在注入的 JWKS `keys[]` 里命中；
//!   `iss`/`aud`/`nonce`/`exp`/`iat`/`sub` 全部强校验；
//! - **state 一次性**：`PendingStore::take_matching` 命中即移除；未知/过期/重复的
//!   `state` 一律拒绝，不得兑换；
//! - **错误文案固定**：`OidcError` 只携带稳定 `kind`，文案不含 `code`/`code_verifier`/
//!   任何 token 片段或服务端原文（`error=` 回调只记拒绝，不带 `error_description` 原文）；
//! - **地址纪律**：`http://` 的 issuer 仅 `debug_assertions` + 显式
//!   `HBUT_IDENTITY_OIDC_ALLOW_INSECURE_BASE=1` + host 为 127.0.0.1/localhost 时允许
//!   （与 `v2_service_client::V2_ALLOW_LOCAL_SERVICE_ENV` 同款双门，release 下无效）；
//! - **PKCE 向量**：`verifier` = 32 随机字节 base64url 无 padding（43 字符）；
//!   `challenge` = base64url(sha256(verifier))（43 字符）；由 RFC 7636 附录 B 固定向量锁死。

use std::sync::Mutex;

use base64::{engine::general_purpose, Engine as _};
use serde_json::Value;
use sha2::{Digest, Sha256};
use url::form_urlencoded;

// ── env 键与默认值（规格 §1，全部默认关闭） ──

/// 总开关：未设 = 关闭（新命令一律 `oidc_disabled`，不联网、不读 keyring）。
pub const ENV_ENABLED: &str = "HBUT_IDENTITY_OIDC_ENABLED";
/// issuer（默认生产域名，与 `v2_service_client::V2_SERVICE_ORIGIN` 同一域名）。
pub const ENV_ISSUER: &str = "HBUT_IDENTITY_OIDC_ISSUER";
/// OAuth2 client_id：启用时必填，空 → `oidc_misconfigured`。
pub const ENV_CLIENT_ID: &str = "HBUT_IDENTITY_OIDC_CLIENT_ID";
/// 自定义 scheme 回调（默认 `minihbut://identity/callback`）。
pub const ENV_REDIRECT_URI: &str = "HBUT_IDENTITY_OIDC_REDIRECT_URI";
/// 回环回调（回退方案）：形如 `http://127.0.0.1:<port>/callback`，`:0` = 系统分配端口。
pub const ENV_LOOPBACK_REDIRECT_URI: &str = "HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI";
/// 空格分隔的 scope 列表。
pub const ENV_SCOPES: &str = "HBUT_IDENTITY_OIDC_SCOPES";
/// 允许 `http://127.0.0.1` 作 issuer（仅 debug 构建生效；release 下忽略）。
pub const ENV_ALLOW_INSECURE_BASE: &str = "HBUT_IDENTITY_OIDC_ALLOW_INSECURE_BASE";

/// 生产 issuer（默认值）。
pub const DEFAULT_ISSUER: &str = "https://auth.xn--vhq74jc2fzpchter27a.com";
/// 默认回调（自定义 scheme 深链）。
pub const DEFAULT_REDIRECT_URI: &str = "minihbut://identity/callback";
/// 默认 scope。
pub const DEFAULT_SCOPES: &str = "openid";

/// 待完成授权 TTL（秒）：超过按过期处理（`oidc_no_pending`）。
pub const PENDING_TTL_SECS: i64 = 600;
/// `iat` 时钟偏移容忍（秒）。
pub const IAT_SKEW_SECS: i64 = 300;

// ── 错误分类（稳定 kind，前端映射固定文案；**不透传**服务端原文） ──

pub const KIND_OIDC_DISABLED: &str = "oidc_disabled";
pub const KIND_OIDC_MISCONFIGURED: &str = "oidc_misconfigured";
pub const KIND_OIDC_STATE_MISMATCH: &str = "oidc_state_mismatch";
pub const KIND_OIDC_NONCE_MISMATCH: &str = "oidc_nonce_mismatch";
pub const KIND_OIDC_CALLBACK_INVALID: &str = "oidc_callback_invalid";
pub const KIND_OIDC_TOKEN_EXCHANGE_FAILED: &str = "oidc_token_exchange_failed";
pub const KIND_OIDC_ID_TOKEN_INVALID: &str = "oidc_id_token_invalid";
pub const KIND_OIDC_NO_PENDING: &str = "oidc_no_pending";
pub const KIND_OIDC_TIMEOUT: &str = "oidc_timeout";
pub const KIND_OIDC_NETWORK: &str = "oidc_network";

/// OIDC 流程错误：每个变体对应一个稳定 `kind`（规格 §2 冻结）。
///
/// 错误信息是固定文案（见 [`OidcError::message`]），**不含** `code` / `code_verifier` /
/// `access_token` / `refresh_token` / `id_token` 片段，也不含服务端原文。
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OidcError {
    /// OIDC 未启用（env 关闭）。
    Disabled,
    /// 配置缺失/非法（client_id 为空、issuer 非法等）。
    Misconfigured,
    /// 回调 `state` 与待完成记录不一致。
    StateMismatch,
    /// id_token `nonce` 与预期不符。
    NonceMismatch,
    /// 回调 URL 形态/参数/与登记回调的绑定失败（`error=` 存在时统一此错误，不带原文）。
    CallbackInvalid,
    /// 授权码兑换令牌失败（HTTP 层，agent B 使用）。
    TokenExchangeFailed,
    /// id_token 校验失败（任一校验点）。
    IdTokenInvalid,
    /// 无待完成授权（未 put / 已过期 / 已清 / 已被取走）。
    NoPending,
    /// 流程超时。
    Timeout,
    /// 网络不可用。
    Network,
}

impl OidcError {
    /// 稳定 kind 字符串（前端按 §4.1 文案表映射固定中文文案）。
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Disabled => KIND_OIDC_DISABLED,
            Self::Misconfigured => KIND_OIDC_MISCONFIGURED,
            Self::StateMismatch => KIND_OIDC_STATE_MISMATCH,
            Self::NonceMismatch => KIND_OIDC_NONCE_MISMATCH,
            Self::CallbackInvalid => KIND_OIDC_CALLBACK_INVALID,
            Self::TokenExchangeFailed => KIND_OIDC_TOKEN_EXCHANGE_FAILED,
            Self::IdTokenInvalid => KIND_OIDC_ID_TOKEN_INVALID,
            Self::NoPending => KIND_OIDC_NO_PENDING,
            Self::Timeout => KIND_OIDC_TIMEOUT,
            Self::Network => KIND_OIDC_NETWORK,
        }
    }

    /// 固定用户文案（与规格 §4.1 逐字一致；不含令牌/URL/服务端原文）。
    pub fn message(&self) -> &'static str {
        match self {
            Self::Disabled => "该版本未启用统一登录",
            Self::Misconfigured => "登录配置不完整，请联系管理员",
            Self::StateMismatch => "登录状态校验失败，请重新发起",
            Self::NonceMismatch => "登录凭证校验失败，请重新发起",
            Self::CallbackInvalid => "回调地址无效，请重新发起",
            Self::TokenExchangeFailed => "换取登录凭证失败，请重试",
            Self::IdTokenInvalid => "登录凭证无效，请重试",
            Self::NoPending => "登录请求已失效，请重新发起",
            Self::Timeout => "登录超时，请重试",
            Self::Network => "网络不可用，请检查网络后重试",
        }
    }
}

// ── PKCE / state / nonce 生成 ──

/// PKCE 对（RFC 7636，method 恒 S256）。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PkcePair {
    /// 32 随机字节的 base64url 无 padding（恒 43 字符）；只进兑换请求，不进 URL/日志。
    pub verifier: String,
    /// base64url(sha256(verifier))（恒 43 字符）；进授权 URL。
    pub challenge: String,
}

/// 生成 PKCE 对。
///
/// `verifier` = 32 随机字节（CSPRNG）base64url 无 padding（恒 43 字符）；
/// `challenge` = base64url(sha256(verifier))（恒 43 字符）。
pub fn generate_pkce() -> PkcePair {
    let mut buf = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut buf);
    let verifier = general_purpose::URL_SAFE_NO_PAD.encode(buf);
    PkcePair {
        challenge: pkce_challenge(&verifier),
        verifier,
    }
}

/// 纯函数：S256 challenge = base64url(sha256(verifier)，无 padding)。
///
/// 供测试与后续一致性校验；与 RFC 7636 附录 B 固定向量对齐（见 `tests` 模块）。
pub fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

/// 生成一次性 state（32 位小写 hex，16 字节 CSPRNG）。
pub fn generate_state() -> String {
    random_hex32()
}

/// 生成一次性 nonce（32 位小写 hex，16 字节 CSPRNG；与 state 同口径、独立命名）。
pub fn generate_nonce() -> String {
    random_hex32()
}

/// 32 位小写 hex（16 字节 CSPRNG），与 `v2_signature::generate_nonce` 同款。
fn random_hex32() -> String {
    let mut buf = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

// ── 配置 ──

/// OIDC 静态配置（env 读取并校验；`issuer` 已归一化去尾斜杠）。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OidcConfig {
    /// issuer（归一化，去尾斜杠）。
    pub issuer: String,
    /// OAuth2 client_id（启用时必填）。
    pub client_id: String,
    /// 空格分隔的 scope 列表。
    pub scopes: String,
    /// 回调地址（自定义 scheme 或 loopback 形态）。
    pub redirect_uri: String,
}

impl OidcConfig {
    /// 从 env 读取并校验：
    /// - `HBUT_IDENTITY_OIDC_ENABLED` 未设（或非 1/true）→ `Ok(None)`（未启用）；
    /// - 启用但 `client_id` 为空 → `Err(oidc_misconfigured)`；
    /// - issuer 为 `http://` 时，仅 `cfg!(debug_assertions)` 且
    ///   `HBUT_IDENTITY_OIDC_ALLOW_INSECURE_BASE=1`（且 host 必须 127.0.0.1/localhost）
    ///   才允许，否则 `Err(oidc_misconfigured)`（release 下 `http://` 一律拒绝）。
    pub fn from_env() -> Result<Option<Self>, OidcError> {
        Self::from_env_lookup(&|key| std::env::var(key).ok())
    }

    /// 可测版本：env 读取由 `lookup` 注入（单测不碰真实 env，避免并行测试相互干扰）。
    pub fn from_env_lookup<F: Fn(&str) -> Option<String>>(
        lookup: &F,
    ) -> Result<Option<Self>, OidcError> {
        let enabled = lookup(ENV_ENABLED)
            .map(|v| matches!(v.trim(), "1" | "true"))
            .unwrap_or(false);
        if !enabled {
            return Ok(None);
        }
        let issuer_raw = lookup(ENV_ISSUER)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_ISSUER.to_string());
        let issuer = validate_issuer(&issuer_raw, lookup)?;
        let client_id = lookup(ENV_CLIENT_ID)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .ok_or(OidcError::Misconfigured)?;
        let scopes = lookup(ENV_SCOPES)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_SCOPES.to_string());
        let redirect_uri = lookup(ENV_REDIRECT_URI)
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_REDIRECT_URI.to_string());
        Ok(Some(OidcConfig {
            issuer,
            client_id,
            scopes,
            redirect_uri,
        }))
    }

    /// 授权端点：`{issuer}/authorize`。
    pub fn authorize_endpoint(&self) -> String {
        format!("{}/authorize", self.issuer.trim_end_matches('/'))
    }

    /// 令牌兑换端点：`{issuer}/token`。
    pub fn token_endpoint(&self) -> String {
        format!("{}/token", self.issuer.trim_end_matches('/'))
    }

    /// JWKS 端点：`{issuer}/jwks.json`。
    pub fn jwks_uri(&self) -> String {
        format!("{}/jwks.json", self.issuer.trim_end_matches('/'))
    }
}

/// 校验 issuer 地址（与 `resolve_v2_service_base` 同款「地址纪律」）：
/// - 必须能解析、且是纯 origin（无凭据/query/fragment/路径）；
/// - `https://` 放行；
/// - `http://` 仅 `debug_assertions` + `HBUT_IDENTITY_OIDC_ALLOW_INSECURE_BASE=1`
///   且 host 为 127.0.0.1/localhost（dev 指本地假服务）；release 一律拒绝；
/// - 通过时返回归一化 origin（无尾斜杠）。
fn validate_issuer<F: Fn(&str) -> Option<String>>(
    raw: &str,
    lookup: &F,
) -> Result<String, OidcError> {
    let err = OidcError::Misconfigured;
    let parsed = url::Url::parse(raw).map_err(|_| err.clone())?;
    if parsed.username() != ""
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.path(), "" | "/")
    {
        return Err(err);
    }
    let allow_insecure = cfg!(debug_assertions)
        && lookup(ENV_ALLOW_INSECURE_BASE)
            .map(|v| v.trim() == "1")
            .unwrap_or(false);
    match parsed.scheme() {
        "https" => Ok(parsed.origin().ascii_serialization()),
        "http"
            if allow_insecure
                && matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost")) =>
        {
            Ok(parsed.origin().ascii_serialization())
        }
        _ => Err(err),
    }
}

// ── 授权 URL ──

/// 构造授权 URL（纯函数）。
///
/// 参数**顺序固定**（response_type, client_id, redirect_uri, scope, state, nonce,
/// code_challenge, code_challenge_method）且每个值都 percent-encode
/// （`redirect_uri`/`scope` 中的 `:` / `/` / 空格必须被编码），保证输出可确定性断言、
/// 且特殊字符不会破坏 URL 结构。
pub fn build_authorize_url(cfg: &OidcConfig, state: &str, nonce: &str, challenge: &str) -> String {
    let enc = |value: &str| urlencoding::encode(value).into_owned();
    format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}&nonce={}&code_challenge={}&code_challenge_method=S256",
        cfg.authorize_endpoint(),
        enc(&cfg.client_id),
        enc(&cfg.redirect_uri),
        enc(&cfg.scopes),
        enc(state),
        enc(nonce),
        enc(challenge),
    )
}

// ── 回调解析 ──

/// 合法回调的形态（内部用）：
#[derive(Clone, Copy, PartialEq)]
enum CallbackForm {
    /// `minihbut://identity/callback`（自定义 scheme；host 固定 `identity`，无端口）。
    DeepLink,
    /// `http://127.0.0.1|localhost:<port>/callback`（loopback；必须显式端口）。
    Loopback { host: &'static str, port: u16 },
}

/// 识别单个 URL 的回调形态；非两种合法形态之一 → `None`。
fn callback_form(u: &url::Url) -> Option<CallbackForm> {
    match u.scheme() {
        "minihbut" => {
            // host 必须 `identity`、path 必须 `/callback`；深链不允许带端口。
            if u.host_str() == Some("identity") && u.path() == "/callback" && u.port().is_none() {
                Some(CallbackForm::DeepLink)
            } else {
                None
            }
        }
        "http" => match u.host_str() {
            // 必须是 127.0.0.1 或 localhost，且必须显式带端口。
            Some("127.0.0.1") => {
                let port = u.port()?;
                Some(CallbackForm::Loopback {
                    host: "127.0.0.1",
                    port,
                })
            }
            Some("localhost") => {
                let port = u.port()?;
                Some(CallbackForm::Loopback {
                    host: "localhost",
                    port,
                })
            }
            _ => None,
        },
        _ => None,
    }
}

/// 形状校验：ASCII `[A-Za-z0-9._~-]`，长度在 `[min..=max]`。
fn shape_ok(value: &str, min: usize, max: usize) -> bool {
    value.len() >= min
        && value.len() <= max
        && value.bytes().all(
            |b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'.' | b'_' | b'~' | b'-'),
        )
}

/// 解析回调 URL（纯函数）。
///
/// 只接受两种形态（且必须与 `expected_redirect` 的 origin 绑定，不匹配或
/// `expected_redirect` 本身非法 → 一律拒绝，fail closed）：
/// 1. `minihbut://identity/callback?code=..&state=..`（host=`identity`、path=`/callback`）；
/// 2. `http://127.0.0.1:<port>/callback?...` 或 `http://localhost:<port>/callback?...`
///    （必须 http、host 必须 127.0.0.1/localhost、必须显式带端口；
///    expected 侧端口为 `0` 时视为「系统分配」占位，放行任意实际端口）。
///
/// 成功返回 `(code, state)`；
/// - 存在 `error=` 参数 → `CallbackInvalid`（**不带** `error_description` 原文）；
/// - `code` 形状 `[A-Za-z0-9._~-]{16,512}`；`state` 形状 `[A-Za-z0-9._~-]{16,128}`。
pub fn parse_callback(url: &str, expected_redirect: &str) -> Result<(String, String), OidcError> {
    let err = || OidcError::CallbackInvalid;
    let actual = url::Url::parse(url).map_err(|_| OidcError::CallbackInvalid)?;
    let expected = url::Url::parse(expected_redirect).map_err(|_| OidcError::CallbackInvalid)?;
    let a = callback_form(&actual).ok_or_else(err)?;
    let e = callback_form(&expected).ok_or_else(err)?;
    match (a, e) {
        (CallbackForm::DeepLink, CallbackForm::DeepLink) => {}
        (
            CallbackForm::Loopback { host: ha, port: pa },
            CallbackForm::Loopback { host: he, port: pe },
        ) => {
            // host 必须一致；实际端口必须真实（>0）；expected 端口 0 = 占位（通配）。
            if ha != he || pa == 0 || (pe != 0 && pe != pa) {
                return Err(err());
            }
        }
        // 形态不一致（如 expected 是深链、实际是 loopback）→ 拒绝。
        _ => return Err(err()),
    }
    // `error=` 存在即拒绝（不带 error_description 原文；前端按 kind 显示固定文案）。
    let query = actual.query().unwrap_or("").to_string();
    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            "error" => return Err(err()),
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            _ => {}
        }
    }
    let code = code.filter(|c| shape_ok(c, 16, 512)).ok_or_else(err)?;
    let state = state.filter(|s| shape_ok(s, 16, 128)).ok_or_else(err)?;
    Ok((code, state))
}

// ── 待完成授权（进程内、一次性、TTL 600s） ──

/// 待完成授权：`oidc_begin` 写入，`oidc_complete` 命中后取出（同一 state 只能完成一次）。
#[derive(Clone, Debug)]
pub struct PendingAuth {
    /// begin 时生成的 state（与回调里的 state 比对）。
    pub state: String,
    /// begin 时生成的 nonce（兑换后与 id_token 的 nonce 比对）。
    pub nonce: String,
    /// PKCE verifier（只进兑换请求，不返回给前端）。
    pub verifier: String,
    /// begin 时使用的回调地址（用于兑换请求的 `redirect_uri` 字段）。
    pub redirect_uri: String,
    /// 创建时间（unix 秒）。
    pub created_at: i64,
}

/// 进程内待完成存储：至多 1 条在途（`Mutex<Option<_>>`）；命中即**移除**（一次性）。
#[derive(Default)]
pub struct PendingStore {
    inner: Mutex<Option<PendingAuth>>,
}

impl PendingStore {
    /// 新建空存储。
    pub fn new() -> Self {
        Self::default()
    }

    /// 写入/覆盖待完成记录。
    pub fn put(&self, p: PendingAuth) {
        *self.lock() = Some(p);
    }

    /// 取走 state 匹配的记录：命中即**移除**（一次性）。
    ///
    /// - state 不匹配 → `StateMismatch`（记录保留，正确的 state 仍可取）；
    /// - 无记录 / 已过期（> `PENDING_TTL_SECS`）→ `NoPending`（过期记录移除）；
    /// - 命中 → 返回并移除。
    pub fn take_matching(&self, state: &str, now: i64) -> Result<PendingAuth, OidcError> {
        let mut guard = self.lock();
        let Some(pending) = guard.as_ref() else {
            return Err(OidcError::NoPending);
        };
        if pending.state != state {
            return Err(OidcError::StateMismatch);
        }
        if now - pending.created_at > PENDING_TTL_SECS {
            *guard = None;
            return Err(OidcError::NoPending);
        }
        guard.take().ok_or(OidcError::NoPending)
    }

    /// 清空（登录完成/放弃后调用）。
    pub fn clear(&self) {
        *self.lock() = None;
    }

    /// 加锁（中毒时取回内部状态，不因历史 panic 让流程整体瘫痪）。
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<PendingAuth>> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

// ── id_token 校验 ──

/// id_token 校验结果（仅公开声明字段；不含任何 token 原文）。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdTokenClaims {
    /// subject（id_token 原文）。
    pub sub: String,
    /// issuer（id_token 原文；已校验与 `OidcConfig.issuer` 去尾斜杠后相等）。
    pub iss: String,
    /// audience（`aud` 为数组时，记录已校验命中的 `client_id`）。
    pub aud: String,
    /// 学号（`sub` 形如 `hbut_<学号>` 时从中解析；否则读 `hbut_student_id`
    /// claim，回退 `oauth_OIDC_id` / `student_id`）。
    pub student_id: String,
    /// 姓名（可选 claim）。
    pub student_name: Option<String>,
    /// nonce（已校验与预期逐字相等）。
    pub nonce: String,
    /// 过期时间（unix 秒；已校验 `exp > now`）。
    pub exp: i64,
    /// 签发时间（unix 秒；已校验 `iat <= now + 300`）。
    pub iat: i64,
}

/// 解码 JWS 的 header/payload 段（base64url；无 padding 优先，兼容带 padding）。
fn decode_jwt_part(part: &str) -> Option<Value> {
    let bytes = b64url_decode(part)?;
    let text = std::str::from_utf8(&bytes).ok()?;
    serde_json::from_str(text).ok()
}

/// base64url 解码（无 padding 优先，随后带 padding）。
fn b64url_decode(input: &str) -> Option<Vec<u8>> {
    if let Ok(bytes) = general_purpose::URL_SAFE_NO_PAD.decode(input.as_bytes()) {
        return Some(bytes);
    }
    general_purpose::URL_SAFE.decode(input.as_bytes()).ok()
}

/// issuer 比较：去尾斜杠后逐字相等（区分大小写）。
fn same_issuer(a: &str, b: &str) -> bool {
    a.trim_end_matches('/') == b.trim_end_matches('/')
}

/// 在注入的 JWKS 中按 `kid` 找 **RSA** 公钥（`n`/`e` 均为 base64url 大端无符号整数）。
///
/// 为什么用 `ring` 而不是 `jsonwebtoken`：`jsonwebtoken` 的 `rust_crypto` 后端会引入
/// `rsa` crate，其 RUSTSEC-2023-0071（Marvin 时序侧信道）**至今无修复版本**；
/// 登录验签路径不应依赖未修复的 crypto。`ring` 已在依赖树中（rustls 使用），零新增依赖。
fn lookup_rsa_key(jwks: &Value, kid: &str) -> Option<(Vec<u8>, Vec<u8>)> {
    let keys = jwks.get("keys")?.as_array()?;
    for key in keys {
        if key.get("kid").and_then(Value::as_str) != Some(kid) {
            continue;
        }
        // 只接受 RSA 公钥（RS256）；其它 kty（EC/OKP/oct）一律视为未命中。
        if key.get("kty").and_then(Value::as_str) != Some("RSA") {
            return None;
        }
        // 若声明了 alg，必须是 RS256（避免把 ES256 的键当 RS256 用）。
        if let Some(alg) = key.get("alg").and_then(Value::as_str) {
            if alg != "RS256" {
                return None;
            }
        }
        // 若声明了 use，必须是 sig。
        if let Some(use_) = key.get("use").and_then(Value::as_str) {
            if use_ != "sig" {
                return None;
            }
        }
        let n = b64url_decode(key.get("n")?.as_str()?)?;
        let e = b64url_decode(key.get("e")?.as_str()?)?;
        if n.is_empty() || e.is_empty() {
            return None;
        }
        return Some((n, e));
    }
    None
}

/// 校验 id_token（**只**接受 RS256；JWKS 注入以便测试）。
///
/// 校验点（任一失败 → `OidcError`；nonce 失败为 `oidc_nonce_mismatch`，其余为
/// `oidc_id_token_invalid`）：
/// 1. JWS 恰好三段，header 可解析；
/// 2. `header.alg` 必须逐字等于 `"RS256"`（拒绝 `none`/`HS256`/缺失等；
///    不用 token 头部的 alg 去选择验证算法后再放行其它值）；
/// 3. `header.kid` 必须在 `jwks.keys[]` 中命中，且该键为 RSA 族；
/// 4. RS256 签名验证（message 为 `header.payload` 原文字节）；
/// 5. claims 校验（委托 [`validate_claims`]）：`iss` 去尾斜杠逐字相等、`aud` 含
///    `client_id`（字符串/数组）、`nonce` 逐字相等、`exp > now`、`iat <= now + 300`、
///    `sub` 非空 + 学号解析（`hbut_<学号>` 优先，回退 `hbut_student_id` /
///    `oauth_OIDC_id` / `student_id`）。
///
/// 错误文案固定（`OidcError::message`），不含 token 片段。
pub fn verify_id_token(
    id_token: &str,
    jwks: &Value,
    cfg: &OidcConfig,
    expected_nonce: &str,
    now: i64,
) -> Result<IdTokenClaims, OidcError> {
    let invalid = || OidcError::IdTokenInvalid;

    // 1) JWS 三段形状。
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() != 3 {
        return Err(invalid());
    }
    // 2) header：alg 只接受 RS256（先断言相等，防 alg 混淆）。
    let header = decode_jwt_part(parts[0]).ok_or_else(invalid)?;
    if header.get("alg").and_then(Value::as_str) != Some("RS256") {
        return Err(invalid());
    }
    let kid = header
        .get("kid")
        .and_then(Value::as_str)
        .filter(|k| !k.is_empty())
        .ok_or_else(invalid)?;
    // 3) kid 必须在注入的 JWKS 中命中（RSA 公钥，含 kty/alg/use 检查）。
    let (n, e) = lookup_rsa_key(jwks, kid).ok_or_else(invalid)?;
    // 4) RS256 签名验证（**固定算法**；`ring` 的 RSA_PKCS1_2048_8192_SHA256，
    //    即便头部伪装其它 alg 也在此被打回）。
    let message = format!("{}.{}", parts[0], parts[1]).into_bytes();
    let signature = b64url_decode(parts[2]).ok_or_else(invalid)?;
    let components = ring::signature::RsaPublicKeyComponents {
        n: &n[..],
        e: &e[..],
    };
    components
        .verify(
            &ring::signature::RSA_PKCS1_2048_8192_SHA256,
            &message,
            &signature,
        )
        .map_err(|_| invalid())?;
    // 5) claims（验签通过后才采信载荷字段）。
    let claims = decode_jwt_part(parts[1]).ok_or_else(invalid)?;
    validate_claims(&claims, cfg, expected_nonce, now)
}

// ── loopback 回退（验收③）：模板读取与端口替换 ───────────────────────────────

/// 读 `HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI` 并校验形状。
///
/// 只接受 `http://127.0.0.1:<port>/callback` 或 `http://localhost:<port>/callback`
/// （端口 0 = 由系统分配）。未设置/空/形状非法 → `None`（= 不使用回退）。
pub fn loopback_redirect_template_from_env() -> Option<String> {
    let raw = std::env::var(ENV_LOOPBACK_REDIRECT_URI).unwrap_or_default();
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    match split_loopback_redirect(trimmed) {
        Some(_) => Some(trimmed.to_string()),
        None => None,
    }
}

/// 解析 loopback 模板 → `(host, port)`；形状不符返回 `None`。
pub fn split_loopback_redirect(template: &str) -> Option<(String, u16)> {
    let rest = template.strip_prefix("http://")?;
    let (authority, path) = rest.split_once('/')?;
    if path != "callback" {
        return None;
    }
    // 不接受 userinfo / 端口缺失 / 非回环 host。
    if authority.contains('@') {
        return None;
    }
    let (host, port_str) = authority.rsplit_once(':')?;
    if host != "127.0.0.1" && host != "localhost" {
        return None;
    }
    let port: u16 = port_str.parse().ok()?;
    Some((host.to_string(), port))
}

/// 把模板里的端口替换为**实际**端口（`begin_loopback` 用系统分配到的端口）。
pub fn with_port(template: &str, port: u16) -> Option<String> {
    let (host, _) = split_loopback_redirect(template)?;
    Some(format!("http://{host}:{port}/callback"))
}

/// 模板里的端口（0 = 由系统分配）。
pub fn template_port(template: &str) -> Option<u16> {
    split_loopback_redirect(template).map(|(_, port)| port)
}

/// 校验 claims（**不验签**，由 `verify_id_token` 在验签通过后调用；也供单测直接覆盖各分支）。
///
/// 校验点与顺序（与 `verify_id_token` 原内联逻辑逐字一致）：
/// 1. 载荷必须是 JSON 对象；
/// 2. `iss` 与 `cfg.issuer` 去尾斜杠后逐字相等；
/// 3. `aud` 必须含 `cfg.client_id`（字符串须等于、数组须包含；其它形态畸形拒绝）；
/// 4. `nonce` 与 `expected_nonce` 逐字相等（独立 kind `oidc_nonce_mismatch`）；
/// 5. `exp > now`；`iat <= now + 300`（时钟偏移容忍）；
/// 6. `sub` 非空；形如 `hbut_<学号>` 时解析学号，否则要求 `hbut_student_id`
///    claim（回退 `oauth_OIDC_id` / `student_id`）存在。
pub fn validate_claims(
    claims: &Value,
    cfg: &OidcConfig,
    expected_nonce: &str,
    now: i64,
) -> Result<IdTokenClaims, OidcError> {
    let invalid = || OidcError::IdTokenInvalid;
    let claims = match claims.as_object() {
        Some(object) => object,
        None => return Err(invalid()),
    };

    // 1) iss：去尾斜杠后逐字相等。
    let iss = claims
        .get("iss")
        .and_then(Value::as_str)
        .ok_or_else(invalid)?;
    if !same_issuer(iss, &cfg.issuer) {
        return Err(invalid());
    }
    // 2) aud：字符串须等于 client_id；数组须包含 client_id。
    let aud_value = match claims.get("aud").ok_or_else(invalid)? {
        Value::String(s) => {
            if s.as_str() != cfg.client_id {
                return Err(invalid());
            }
            s.as_str().to_string()
        }
        Value::Array(items) => {
            let matched = items
                .iter()
                .find(|item| item.as_str() == Some(cfg.client_id.as_str()))
                .and_then(Value::as_str)
                .ok_or_else(invalid)?;
            matched.to_string()
        }
        _ => return Err(invalid()),
    };
    // 3) nonce 逐字相等（独立 kind，供前端区分文案）。
    let nonce = claims.get("nonce").and_then(Value::as_str).unwrap_or("");
    if nonce != expected_nonce {
        return Err(OidcError::NonceMismatch);
    }
    // 4) exp / iat。
    let exp = claims
        .get("exp")
        .and_then(Value::as_i64)
        .ok_or_else(invalid)?;
    if !(exp > now) {
        return Err(invalid());
    }
    let iat = claims
        .get("iat")
        .and_then(Value::as_i64)
        .ok_or_else(invalid)?;
    if !(iat <= now + IAT_SKEW_SECS) {
        return Err(invalid());
    }
    // 5) sub 非空；学号解析。
    let sub = claims
        .get("sub")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if sub.is_empty() {
        return Err(invalid());
    }
    let student_id = match sub.strip_prefix("hbut_") {
        Some(rest) => {
            if rest.is_empty() {
                return Err(invalid());
            }
            rest.to_string()
        }
        None => claims
            .get("hbut_student_id")
            .or_else(|| claims.get("oauth_OIDC_id"))
            .or_else(|| claims.get("student_id"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .ok_or_else(invalid)?,
    };
    let student_name = claims
        .get("student_name")
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok(IdTokenClaims {
        sub,
        iss: iss.to_string(),
        aud: aud_value,
        student_id,
        student_name,
        nonce: nonce.to_string(),
        exp,
        iat,
    })
}

/// id_token 验签器抽象（可注入以便命令层单测；**生产必须**使用 [`RingIdTokenVerifier`]）。
///
/// 实现不得削弱 [`verify_id_token`] 的任何校验（alg 白名单 / kid / 签名 /
/// iss / aud / nonce / exp / iat / sub）。
pub trait IdTokenVerifier: Send + Sync {
    /// 校验 `id_token`（语义与 [`verify_id_token`] 完全一致）。
    fn verify(
        &self,
        id_token: &str,
        jwks: &Value,
        cfg: &OidcConfig,
        expected_nonce: &str,
        now: i64,
    ) -> Result<IdTokenClaims, OidcError>;
}

/// 生产验签实现：直接委托 [`verify_id_token`]（ring RS256 真验签，零削弱）。
pub struct RingIdTokenVerifier;

impl IdTokenVerifier for RingIdTokenVerifier {
    fn verify(
        &self,
        id_token: &str,
        jwks: &Value,
        cfg: &OidcConfig,
        expected_nonce: &str,
        now: i64,
    ) -> Result<IdTokenClaims, OidcError> {
        verify_id_token(id_token, jwks, cfg, expected_nonce, now)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::super::oidc_core_fixture::{
        fixture_id_token, FIXTURE_JWKS, FIXTURE_KID, FIXTURE_NONCE,
    };
    use super::*;
    use serde_json::json;

    // ── 公开 fixture（预生成 RS256 token + JWKS，**不含任何私钥**）────────────
    // 签名类负例通过对 fixture 的 header/签名段改字节构造（无签名器）；
    // claims 类负例直接调 `validate_claims`（验签与 claims 校验解耦后无需真 token）。

    /// fixture 的 payload 段（base64url 原文；运行时从 hex 分片组装，返回 `String`）。
    fn fixture_payload_b64() -> String {
        fixture_id_token()
            .split('.')
            .nth(1)
            .expect("fixture 令牌必须有 payload 段")
            .to_string()
    }

    /// fixture 的签名段（base64url 原文）。
    fn fixture_signature_b64() -> String {
        fixture_id_token()
            .split('.')
            .nth(2)
            .expect("fixture 令牌必须有签名段")
            .to_string()
    }

    /// fixture 的 claims（载荷 JSON 对象，逐字解码自 fixture payload）。
    fn fixture_claims() -> Value {
        let bytes = general_purpose::URL_SAFE_NO_PAD
            .decode(fixture_payload_b64())
            .expect("fixture payload 应可 base64url 解码");
        serde_json::from_slice(&bytes).expect("fixture payload 应为 JSON 对象")
    }

    /// fixture 的 JWKS（公开常量解析为 `Value`）。
    fn fixture_jwks() -> Value {
        serde_json::from_str(FIXTURE_JWKS).expect("fixture JWKS 应可解析")
    }

    /// 手工拼 JWS（header 经 base64url 编码；payload/签名段原样使用——用于 alg 伪装 /
    /// kid 不存在 / 空签名等 fixture 无法直接表达的情形）。
    fn raw_parts(header_json: &str, payload_b64: &str, signature: &str) -> String {
        let b64 = |s: &str| general_purpose::URL_SAFE_NO_PAD.encode(s.as_bytes());
        format!("{}.{}.{}", b64(header_json), payload_b64, signature)
    }

    fn base_cfg() -> OidcConfig {
        OidcConfig {
            issuer: "https://auth.example.com".to_string(),
            client_id: "minihbut-client".to_string(),
            scopes: "openid".to_string(),
            redirect_uri: DEFAULT_REDIRECT_URI.to_string(),
        }
    }

    fn assert_id_token_invalid(token: &str, jwks: &Value, cfg: &OidcConfig, nonce: &str, now: i64) {
        assert_eq!(
            verify_id_token(token, jwks, cfg, nonce, now),
            Err(OidcError::IdTokenInvalid),
            "应拒绝且 kind=oidc_id_token_invalid"
        );
    }

    // ── PKCE 向量 ────────────────────────────────────────────────────────────

    /// RFC 7636 附录 B 固定向量（Python `hashlib.sha256` + `base64.urlsafe_b64encode`
    /// 独立复算逐字一致）：verifier → challenge。
    #[test]
    fn pkce_rfc7636_appendix_b_vector() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn pkce_shape_and_consistency() {
        let pair = generate_pkce();
        assert_eq!(
            pair.verifier.len(),
            43,
            "verifier 必须 43 字符（32 字节 base64url 无 padding）"
        );
        assert_eq!(
            pair.challenge.len(),
            43,
            "challenge 必须 43 字符（sha256 base64url 无 padding）"
        );
        assert_eq!(
            pair.challenge,
            pkce_challenge(&pair.verifier),
            "challenge 必须是 verifier 的 S256"
        );
        let other = generate_pkce();
        assert_ne!(pair.verifier, other.verifier, "verifier 必须随机");
        for ch in pair.verifier.bytes().chain(pair.challenge.bytes()) {
            assert!(
                matches!(ch, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_'),
                "base64url 字符域"
            );
        }
    }

    #[test]
    fn state_nonce_32_hex() {
        for v in [generate_state(), generate_nonce()] {
            assert_eq!(v.len(), 32);
            assert!(v.bytes().all(|b| b.is_ascii_hexdigit()));
            assert!(v.chars().all(|c| c.is_lowercase() || c.is_ascii_digit()));
        }
        assert_ne!(generate_state(), generate_state());
    }

    // ── 授权 URL ─────────────────────────────────────────────────────────────

    /// 参数完整、逐个 percent-encode（`:`/`/`/空格均被编码）、顺序固定、issuer 去尾斜杠。
    #[test]
    fn authorize_url_fixed_order_and_encoding() {
        let cfg = OidcConfig {
            issuer: "https://auth.example.com/".to_string(),
            client_id: "minihbut-client".to_string(),
            scopes: "openid profile".to_string(),
            redirect_uri: "minihbut://identity/callback".to_string(),
        };
        let url = build_authorize_url(
            &cfg,
            "state0123456789abcde",
            "nonce0123456789abcde",
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        );
        assert_eq!(
            url,
            "https://auth.example.com/authorize?response_type=code\
             &client_id=minihbut-client\
             &redirect_uri=minihbut%3A%2F%2Fidentity%2Fcallback\
             &scope=openid%20profile\
             &state=state0123456789abcde\
             &nonce=nonce0123456789abcde\
             &code_challenge=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk\
             &code_challenge_method=S256"
        );
    }

    #[test]
    fn authorize_url_loopback_redirect_encoded() {
        let cfg = OidcConfig {
            issuer: "https://auth.example.com".to_string(),
            client_id: "client-x".to_string(),
            scopes: "openid".to_string(),
            redirect_uri: "http://127.0.0.1:8443/callback".to_string(),
        };
        let url = build_authorize_url(&cfg, "s", "n", "c");
        assert!(
            url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A8443%2Fcallback"),
            "loopback 回调中的 : 与 / 必须编码，实际：{url}"
        );
    }

    // ── 回调解析 ─────────────────────────────────────────────────────────────

    const GOOD_CODE: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const GOOD_STATE: &str = "state0123456789abcdef";

    #[test]
    fn callback_deep_link_ok() {
        let (code, state) = parse_callback(
            &format!("minihbut://identity/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            "minihbut://identity/callback",
        )
        .expect("合法深链回调应通过");
        assert_eq!(code, GOOD_CODE);
        assert_eq!(state, GOOD_STATE);
    }

    #[test]
    fn callback_loopback_ok_and_port_binding() {
        // 精确端口匹配
        let (code, state) = parse_callback(
            &format!("http://127.0.0.1:8443/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            "http://127.0.0.1:8443/callback",
        )
        .expect("合法 loopback 回调应通过");
        assert_eq!(code, GOOD_CODE);
        assert_eq!(state, GOOD_STATE);
        // localhost 亦可
        assert!(parse_callback(
            &format!("http://localhost:8443/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            "http://localhost:8443/callback",
        )
        .is_ok());
        // expected 端口 :0（系统分配占位）→ 放行任意真实端口
        assert!(parse_callback(
            &format!("http://127.0.0.1:56789/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            "http://127.0.0.1:0/callback",
        )
        .is_ok());
        // 实际端口与 expected 精确端口不一致 → 拒绝
        assert!(parse_callback(
            &format!("http://127.0.0.1:56789/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            "http://127.0.0.1:8443/callback",
        )
        .is_err());
    }

    /// 规格 §5 的 8 类畸形回调，一律 `oidc_callback_invalid`。
    #[test]
    fn callback_malformed_all_rejected() {
        let cases: Vec<String> = vec![
            // 1) 缺 code
            format!("minihbut://identity/callback?state={GOOD_STATE}"),
            // 2) 缺 state
            format!("minihbut://identity/callback?code={GOOD_CODE}"),
            // 3) error= 存在（带 error_description 原文——只拒绝，不带原文）
            format!("minihbut://identity/callback?error=access_denied&error_description=secret%20details&code={GOOD_CODE}&state={GOOD_STATE}"),
            // 4) 错 host
            format!("minihbut://evil/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            // 5) 错 path
            format!("minihbut://identity/other?code={GOOD_CODE}&state={GOOD_STATE}"),
            // 6) code 超长（513 > 512）
            format!("minihbut://identity/callback?code={}&state={GOOD_STATE}", "A".repeat(513)),
            // 7) 非 URL
            "not a url".to_string(),
            // 8) code 含非法字符（空格 + 斜杠，长度在范围内）
            format!("minihbut://identity/callback?code=ab%20cd/efghij0123456789&state={GOOD_STATE}"),
        ];
        for (i, case) in cases.iter().enumerate() {
            let err = parse_callback(case, "minihbut://identity/callback").unwrap_err();
            assert_eq!(
                err.kind(),
                KIND_OIDC_CALLBACK_INVALID,
                "畸形回调 #{i}（{case}）必须 kind=oidc_callback_invalid"
            );
        }
    }

    #[test]
    fn callback_loopback_discipline() {
        let q = |port: u16| {
            format!("http://127.0.0.1:{port}/callback?code={GOOD_CODE}&state={GOOD_STATE}")
        };
        // 无显式端口 → 拒绝
        assert!(parse_callback(
            &format!("http://127.0.0.1/callback?code={GOOD_CODE}&state={GOOD_STATE}"),
            "http://127.0.0.1/callback"
        )
        .is_err());
        // host 非 127.0.0.1/localhost → 拒绝
        assert!(parse_callback(
            &q(8443).replace("127.0.0.1", "10.0.0.5"),
            "http://127.0.0.1:8443/callback"
        )
        .is_err());
        // 形态不匹配（expected 深链，实际 loopback）→ 拒绝
        assert!(parse_callback(&q(8443), "minihbut://identity/callback").is_err());
        // https → 拒绝
        assert!(parse_callback(
            &q(8443).replace("http://", "https://"),
            "http://127.0.0.1:8443/callback"
        )
        .is_err());
        // expected 为空/非法 → 拒绝（fail closed）
        assert!(parse_callback(&q(8443), "").is_err());
    }

    // ── PendingStore ─────────────────────────────────────────────────────────

    fn pending_at(created_at: i64) -> PendingAuth {
        PendingAuth {
            state: "state0123456789abcdef".to_string(),
            nonce: "nonce0123456789".to_string(),
            verifier: "verifier0123456789".to_string(),
            redirect_uri: "minihbut://identity/callback".to_string(),
            created_at,
        }
    }

    #[test]
    fn pending_store_one_shot_ttl_and_mismatch() {
        let store = PendingStore::new();
        // 无 pending → NoPending
        assert_eq!(
            store.take_matching("state0123456789abcdef", 1000).err(),
            Some(OidcError::NoPending)
        );

        // state 不匹配 → StateMismatch（记录保留）
        store.put(pending_at(1000));
        assert_eq!(
            store.take_matching("otherstate0123456789ab", 1001).err(),
            Some(OidcError::StateMismatch)
        );
        // 正确的 state 仍可取（未误删）
        let taken = store
            .take_matching("state0123456789abcdef", 1001)
            .expect("应命中");
        assert_eq!(taken.nonce, "nonce0123456789");
        // 一次性：再次取 → NoPending
        assert_eq!(
            store.take_matching("state0123456789abcdef", 1002).err(),
            Some(OidcError::NoPending)
        );

        // TTL：601s 已过期 → NoPending；恰好 600s 仍有效
        store.put(pending_at(1000));
        assert_eq!(
            store
                .take_matching("state0123456789abcdef", 1000 + PENDING_TTL_SECS + 1)
                .err(),
            Some(OidcError::NoPending)
        );
        store.put(pending_at(1000));
        assert!(store
            .take_matching("state0123456789abcdef", 1000 + PENDING_TTL_SECS)
            .is_ok());

        // clear 后 → NoPending
        store.put(pending_at(1000));
        store.clear();
        assert_eq!(
            store.take_matching("state0123456789abcdef", 1001).err(),
            Some(OidcError::NoPending)
        );
    }

    // ── verify_id_token / validate_claims（基于公开 fixture，无签名器/私钥）──

    const NOW: i64 = 1_700_000_000;

    /// 12l 正常：合法 RS256 fixture 令牌通过，claims 解析正确（学号从 `hbut_<学号>` 解析）。
    #[test]
    fn verify_id_token_fixture_ok_and_claims_parsed() {
        let cfg = base_cfg();
        let jwks = fixture_jwks();
        let out = verify_id_token(&fixture_id_token(), &jwks, &cfg, FIXTURE_NONCE, NOW)
            .expect("合法 fixture 令牌应通过");
        assert_eq!(out.sub, "hbut_2510231106");
        assert_eq!(out.student_id, "2510231106");
        assert_eq!(out.iss, "https://auth.example.com");
        assert_eq!(out.aud, "minihbut-client");
        assert_eq!(out.nonce, FIXTURE_NONCE);
        assert_eq!(out.exp, 4102444800);
        assert_eq!(out.iat, NOW);
        assert_eq!(out.student_name, None);
    }

    /// 12a/12b：`alg=none`（空签名）与 `alg=HS256`、缺 `alg` → 一律拒绝
    /// （重拼 JWS：header 换掉，payload 用 fixture 原段）。
    #[test]
    fn verify_id_token_alg_none_or_hs256_rejected() {
        let cfg = base_cfg();
        let jwks = fixture_jwks();
        let payload = fixture_payload_b64();
        let signature = fixture_signature_b64();
        let t_none = raw_parts("{\"alg\":\"none\",\"typ\":\"JWT\"}", &payload, "");
        assert_eq!(
            verify_id_token(&t_none, &jwks, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
        // header 带 fixture 的合法 kid，只换 alg（HS256）→ 仍须拒绝
        let t_hs256 = raw_parts(
            &format!("{{\"alg\":\"HS256\",\"kid\":\"{FIXTURE_KID}\"}}"),
            &payload,
            &signature,
        );
        assert_eq!(
            verify_id_token(&t_hs256, &jwks, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
        let t_noalg = raw_parts("{\"typ\":\"JWT\"}", &payload, &signature);
        assert_eq!(
            verify_id_token(&t_noalg, &jwks, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
        // 两段（缺签名段）→ 拒绝
        let t_two = raw_parts(
            &format!("{{\"alg\":\"RS256\",\"kid\":\"{FIXTURE_KID}\"}}"),
            &payload,
            "",
        );
        assert!(t_two.ends_with('.'));
        assert_eq!(
            verify_id_token(t_two.trim_end_matches('.'), &jwks, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
    }

    /// 12c：header `kid` 不在 JWKS 中 → 拒绝。
    #[test]
    fn verify_id_token_kid_miss_rejected() {
        let cfg = base_cfg();
        let jwks = fixture_jwks(); // JWKS 里只有 fixture-kid-1
        let token = raw_parts(
            "{\"alg\":\"RS256\",\"kid\":\"no-such-kid-999\"}",
            &fixture_payload_b64(),
            "Zm9vYmFy",
        );
        assert_id_token_invalid(&token, &jwks, &cfg, FIXTURE_NONCE, NOW);
    }

    /// 12d：签名被篡改 → 拒绝（翻签名段**中部**一个字符；末字符在 base64url 里
    /// 可能只是填充位，翻了未必改变解码结果，故不动末字符）。
    #[test]
    fn verify_id_token_bad_signature_rejected() {
        let cfg = base_cfg();
        let jwks = fixture_jwks();
        let token = fixture_id_token();
        let parts: Vec<&str> = token.split('.').collect();
        let sig_chars: Vec<char> = parts[2].chars().collect();
        let mid = sig_chars.len() / 2;
        let mut new_sig = sig_chars;
        new_sig[mid] = if new_sig[mid] == 'A' { 'B' } else { 'A' };
        let tampered = format!(
            "{}.{}.{}",
            parts[0],
            parts[1],
            new_sig.iter().collect::<String>()
        );
        assert_id_token_invalid(&tampered, &jwks, &cfg, FIXTURE_NONCE, NOW);
    }

    /// 12e（JWKS 键族）：同 `kid` 但 `kty:"EC"` / `alg:"ES256"` / `use:"enc"` → 拒绝
    /// （非 RSA 公钥/非 RS256 用途的键不得被当成 RS256 验签密钥）。
    #[test]
    fn verify_id_token_jwks_key_type_mismatch_rejected() {
        let cfg = base_cfg();
        let kid = "fixture-kid-1";
        let bad_jwks: Vec<Value> = vec![
            json!({"keys":[{"kty":"EC","kid":kid,"n":"q92N","e":"AQAB"}]}),
            json!({"keys":[{"kty":"RSA","kid":kid,"alg":"ES256","n":"q92N","e":"AQAB"}]}),
            json!({"keys":[{"kty":"RSA","kid":kid,"use":"enc","n":"q92N","e":"AQAB"}]}),
        ];
        for jwks in &bad_jwks {
            assert_id_token_invalid(&fixture_id_token(), jwks, &cfg, FIXTURE_NONCE, NOW);
        }
    }

    /// 12e/12f：iss 不符/尾斜杠等价；aud 字符串/数组/畸形（直接调 `validate_claims`）。
    #[test]
    fn validate_claims_iss_and_aud() {
        let cfg = base_cfg();
        // iss 不符
        let mut c = fixture_claims();
        c["iss"] = json!("https://evil.example");
        assert_eq!(
            validate_claims(&c, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
        // iss 带尾斜杠（去尾斜杠后比较）→ 通过
        let mut c = fixture_claims();
        c["iss"] = json!("https://auth.example.com/");
        assert!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).is_ok());
        // aud（字符串）不符
        let mut c = fixture_claims();
        c["aud"] = json!("other-client");
        assert_eq!(
            validate_claims(&c, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
        // aud 为数组但不含 client_id
        let mut c = fixture_claims();
        c["aud"] = json!(["other-client"]);
        assert_eq!(
            validate_claims(&c, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
        // aud 为数组且含 client_id → 通过
        let mut c = fixture_claims();
        c["aud"] = json!(["other-client", "minihbut-client"]);
        let out =
            validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).expect("数组 aud 含 client_id 应通过");
        assert_eq!(out.aud, "minihbut-client");
        // aud 为对象（畸形）→ 拒绝
        let mut c = fixture_claims();
        c["aud"] = json!({"weird": true});
        assert_eq!(
            validate_claims(&c, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::IdTokenInvalid)
        );
    }

    /// 12g：nonce 不符 → 独立 kind `oidc_nonce_mismatch`（直接调用 + 全路径各一例）。
    #[test]
    fn validate_claims_nonce_mismatch_kind() {
        let cfg = base_cfg();
        let mut c = fixture_claims();
        c["nonce"] = json!("other-nonce-01234567");
        assert_eq!(
            validate_claims(&c, &cfg, FIXTURE_NONCE, NOW),
            Err(OidcError::NonceMismatch)
        );
        // 全路径：合法签名 token + 传入错误的 expected_nonce → 同样 nonce_mismatch
        let jwks = fixture_jwks();
        assert_eq!(
            verify_id_token(
                &fixture_id_token(),
                &jwks,
                &cfg,
                "other-nonce-01234567",
                NOW
            ),
            Err(OidcError::NonceMismatch)
        );
    }

    /// 12h/12i：exp 须严格 > now；iat 超前 301s 拒绝、恰好 300s 通过；缺 exp/iat 拒绝。
    #[test]
    fn validate_claims_exp_iat_and_missing() {
        let cfg = base_cfg();
        let invalid = || Err(OidcError::IdTokenInvalid);
        // exp == now（须严格 >）→ 拒绝
        let mut c = fixture_claims();
        c["exp"] = json!(NOW);
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // exp 已过期 → 拒绝
        let mut c = fixture_claims();
        c["exp"] = json!(NOW - 1);
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // iat 超前超过容忍（now+301）→ 拒绝
        let mut c = fixture_claims();
        c["iat"] = json!(NOW + 301);
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // iat 恰好 now+300 → 通过
        let mut c = fixture_claims();
        c["iat"] = json!(NOW + 300);
        assert!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).is_ok());
        // 缺 exp → 拒绝
        let mut c = fixture_claims();
        c.as_object_mut().unwrap().remove("exp");
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // 缺 iat → 拒绝
        let mut c = fixture_claims();
        c.as_object_mut().unwrap().remove("iat");
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
    }

    /// 12j/12k：缺 sub / sub 形态异常；学号 claim 回退链；`hbut_` 形态优先。
    #[test]
    fn validate_claims_sub_and_student_id_fallback_chain() {
        let cfg = base_cfg();
        let invalid = || Err(OidcError::IdTokenInvalid);
        // 缺 sub
        let mut c = fixture_claims();
        c.as_object_mut().unwrap().remove("sub");
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // sub 为空串 → 拒绝
        let mut c = fixture_claims();
        c["sub"] = json!("");
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // sub = "hbut_"（学号为空）→ 拒绝
        let mut c = fixture_claims();
        c["sub"] = json!("hbut_");
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // sub 非 hbut_ 形态且无学号 claim → 拒绝
        let mut c = fixture_claims();
        c["sub"] = json!("anonymous-user-001");
        c.as_object_mut().unwrap().remove("hbut_student_id");
        assert_eq!(validate_claims(&c, &cfg, FIXTURE_NONCE, NOW), invalid());
        // hbut_student_id 存在 → 通过
        let mut c = fixture_claims();
        c["sub"] = json!("anonymous-user-001");
        c["hbut_student_id"] = json!("2510234567");
        let out = validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).expect("有学号 claim 应通过");
        assert_eq!(out.student_id, "2510234567");
        // 回退 oauth_OIDC_id
        let mut c = fixture_claims();
        c["sub"] = json!("anonymous-user-001");
        c.as_object_mut().unwrap().remove("hbut_student_id");
        c["oauth_OIDC_id"] = json!("2510237777");
        let out = validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).expect("回退 oauth_OIDC_id");
        assert_eq!(out.student_id, "2510237777");
        // 回退 student_id
        let mut c = fixture_claims();
        c["sub"] = json!("anonymous-user-001");
        c.as_object_mut().unwrap().remove("hbut_student_id");
        c["student_id"] = json!("2510238888");
        let out = validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).expect("回退 student_id");
        assert_eq!(out.student_id, "2510238888");
        // sub 为 hbut_ 形态时优先从 sub 解析（即使同时有学号 claim）
        let mut c = fixture_claims();
        c["hbut_student_id"] = json!("9999999999");
        let out = validate_claims(&c, &cfg, FIXTURE_NONCE, NOW).expect("hbut_ 形态应优先");
        assert_eq!(out.student_id, "2510231106");
    }

    // ── OidcConfig::from_env ─────────────────────────────────────────────────

    fn env_lookup<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<String> + 'a {
        move |k| {
            pairs
                .iter()
                .find(|(key, _)| *key == k)
                .map(|(_, v)| v.to_string())
        }
    }

    #[test]
    fn config_from_env_disabled_by_default() {
        // 未设 ENABLED → Ok(None)
        assert_eq!(OidcConfig::from_env_lookup(&|_| None), Ok(None));
        // 非 1/true 也算未启用
        assert_eq!(
            OidcConfig::from_env_lookup(&env_lookup(&[(ENV_ENABLED, "0")])),
            Ok(None)
        );
    }

    #[test]
    fn config_from_env_requires_client_id() {
        // 启用但 client_id 空 → Misconfigured
        let lookup = env_lookup(&[(ENV_ENABLED, "1")]);
        assert_eq!(
            OidcConfig::from_env_lookup(&lookup),
            Err(OidcError::Misconfigured)
        );
        // 启用 + client_id → Ok（默认 issuer / 回调 / scope）
        let lookup = env_lookup(&[(ENV_ENABLED, "1"), (ENV_CLIENT_ID, "minihbut-client")]);
        let cfg = OidcConfig::from_env_lookup(&lookup)
            .expect("应启用")
            .expect("应有配置");
        assert_eq!(cfg.issuer, DEFAULT_ISSUER);
        assert_eq!(cfg.client_id, "minihbut-client");
        assert_eq!(cfg.redirect_uri, DEFAULT_REDIRECT_URI);
        assert_eq!(cfg.scopes, DEFAULT_SCOPES);
    }

    #[test]
    fn config_from_env_issuer_discipline() {
        // http://127.0.0.1：debug + 显式 flag → 允许（本测试恒在 debug 下运行）
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "http://127.0.0.1:8099"),
            (ENV_ALLOW_INSECURE_BASE, "1"),
        ]);
        #[cfg(debug_assertions)]
        {
            let cfg = OidcConfig::from_env_lookup(&lookup)
                .expect("debug+flag 应允许")
                .expect("应有配置");
            assert_eq!(cfg.issuer, "http://127.0.0.1:8099");
        }
        // flag 未设 → Misconfigured（debug 下也拒绝）
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "http://127.0.0.1:8099"),
        ]);
        assert_eq!(
            OidcConfig::from_env_lookup(&lookup),
            Err(OidcError::Misconfigured)
        );
        // flag 设了但 host 非回环 → Misconfigured
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "http://10.0.0.5:8099"),
            (ENV_ALLOW_INSECURE_BASE, "1"),
        ]);
        assert_eq!(
            OidcConfig::from_env_lookup(&lookup),
            Err(OidcError::Misconfigured)
        );
        // http://localhost + flag → 允许（debug）
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "http://localhost:8099"),
            (ENV_ALLOW_INSECURE_BASE, "1"),
        ]);
        #[cfg(debug_assertions)]
        {
            let cfg = OidcConfig::from_env_lookup(&lookup)
                .expect("debug+flag 应允许")
                .expect("应有配置");
            assert_eq!(cfg.issuer, "http://localhost:8099");
        }
        // issuer 带路径 → Misconfigured
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "https://auth.example.com/x"),
        ]);
        assert_eq!(
            OidcConfig::from_env_lookup(&lookup),
            Err(OidcError::Misconfigured)
        );
        // 非 http(s) scheme → Misconfigured
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "ftp://auth.example.com"),
        ]);
        assert_eq!(
            OidcConfig::from_env_lookup(&lookup),
            Err(OidcError::Misconfigured)
        );
        // 尾斜杠归一化
        let lookup = env_lookup(&[
            (ENV_ENABLED, "1"),
            (ENV_CLIENT_ID, "c"),
            (ENV_ISSUER, "https://auth.example.com/"),
        ]);
        let cfg = OidcConfig::from_env_lookup(&lookup)
            .expect("应通过")
            .expect("应有配置");
        assert_eq!(cfg.issuer, "https://auth.example.com");
    }

    #[test]
    fn config_endpoints() {
        let cfg = OidcConfig {
            issuer: "https://auth.example.com".to_string(),
            client_id: "c".to_string(),
            scopes: "openid".to_string(),
            redirect_uri: "minihbut://identity/callback".to_string(),
        };
        assert_eq!(
            cfg.authorize_endpoint(),
            "https://auth.example.com/authorize"
        );
        assert_eq!(cfg.token_endpoint(), "https://auth.example.com/token");
        assert_eq!(cfg.jwks_uri(), "https://auth.example.com/jwks.json");
    }

    // ── 错误 kind/文案冻结 ───────────────────────────────────────────────────

    #[test]
    fn error_kind_and_message_frozen() {
        let table = [
            (
                OidcError::Disabled,
                KIND_OIDC_DISABLED,
                "该版本未启用统一登录",
            ),
            (
                OidcError::Misconfigured,
                KIND_OIDC_MISCONFIGURED,
                "登录配置不完整，请联系管理员",
            ),
            (
                OidcError::StateMismatch,
                KIND_OIDC_STATE_MISMATCH,
                "登录状态校验失败，请重新发起",
            ),
            (
                OidcError::NonceMismatch,
                KIND_OIDC_NONCE_MISMATCH,
                "登录凭证校验失败，请重新发起",
            ),
            (
                OidcError::CallbackInvalid,
                KIND_OIDC_CALLBACK_INVALID,
                "回调地址无效，请重新发起",
            ),
            (
                OidcError::TokenExchangeFailed,
                KIND_OIDC_TOKEN_EXCHANGE_FAILED,
                "换取登录凭证失败，请重试",
            ),
            (
                OidcError::IdTokenInvalid,
                KIND_OIDC_ID_TOKEN_INVALID,
                "登录凭证无效，请重试",
            ),
            (
                OidcError::NoPending,
                KIND_OIDC_NO_PENDING,
                "登录请求已失效，请重新发起",
            ),
            (OidcError::Timeout, KIND_OIDC_TIMEOUT, "登录超时，请重试"),
            (
                OidcError::Network,
                KIND_OIDC_NETWORK,
                "网络不可用，请检查网络后重试",
            ),
        ];
        for (err, kind, message) in table {
            assert_eq!(err.kind(), kind);
            assert_eq!(err.message(), message);
            // 错误文案不得泄漏令牌/URL 类内容（固定文案天然满足；此断言防回归）
            assert!(!err.message().contains("token"));
        }
    }
}

// ── loopback 模板辅助（P2-4 补缺：把回退真正接线后的纯逻辑）──────────────

#[test]
fn split_loopback_redirect_accepts_only_loopback_callback() {
    assert_eq!(
        split_loopback_redirect("http://127.0.0.1:8080/callback"),
        Some(("127.0.0.1".to_string(), 8080))
    );
    assert_eq!(
        split_loopback_redirect("http://localhost:0/callback"),
        Some(("localhost".to_string(), 0))
    );
    // 以下一律拒绝
    for bad in [
        "https://127.0.0.1:8080/callback",     // 必须 http（回环明文）
        "http://0.0.0.0:8080/callback",        // 不得监听全网卡
        "http://127.0.0.1/callback",           // 缺端口
        "http://127.0.0.1:8080/other",         // 路径必须是 /callback
        "http://user@127.0.0.1:8080/callback", // 不接受 userinfo
        "http://127.0.0.1:70000/callback",     // 端口越界
        "http://evil.example:8080/callback",   // 非回环
        "minihbut://identity/callback",        // 深链不是 loopback 模板
    ] {
        assert!(split_loopback_redirect(bad).is_none(), "应拒绝：{bad}");
    }
}

#[test]
fn with_port_and_template_port_round_trip() {
    let template = "http://127.0.0.1:0/callback";
    assert_eq!(template_port(template), Some(0));
    assert_eq!(
        with_port(template, 43210),
        Some("http://127.0.0.1:43210/callback".to_string())
    );
    // 固定端口模板替换后仍是同 host
    assert_eq!(
        with_port("http://localhost:8080/callback", 9999),
        Some("http://localhost:9999/callback".to_string())
    );
    // 非法模板 → None
    assert_eq!(with_port("http://0.0.0.0:0/callback", 1), None);
}
