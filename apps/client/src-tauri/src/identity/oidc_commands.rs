//! P2-4：OIDC 授权码 + PKCE（Casdoor 统一登录）Tauri 命令层。
//!
//! 设计（与既有 v2 通道同构）：
//! - **传输抽象**：令牌交换 / JWKS 请求走可注入的 `OidcTransport`（单测用假实现，
//!   不依赖真网络；与 `V2Transport` 同款模式）；
//! - **返回语义**：可分类结果一律 `Ok(OidcFlowPayload{ok,kind,message,…})`；
//!   `Err(String)` 只留给内部故障（任务 join 失败等）；
//! - **零泄露**：`code` / `code_verifier` / `access_token` / `refresh_token` / `id_token`
//!   永不进日志与返回体（payload 只含 authorize_url、state、掩码学号、过期时间）；
//! - **失败即拒绝**：`complete` 任一步失败都不写会话；`state` 一次性
//!   （不匹配/重复/过期 → 对应 kind 且不发起令牌请求）。

use std::pin::Pin;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value;
use tauri::State;

use crate::app_state::AppState;

use super::models::{OidcAccessTokenInput, OidcAwaitCallbackInput, OidcCompleteInput};
use super::oidc_core::{
    build_authorize_url, generate_nonce, generate_pkce, generate_state,
    loopback_redirect_template_from_env, parse_callback, template_port, with_port, IdTokenClaims,
    IdTokenVerifier, OidcConfig, OidcError, PendingAuth, PendingStore, RingIdTokenVerifier,
    KIND_OIDC_CALLBACK_INVALID, KIND_OIDC_DISABLED, KIND_OIDC_ID_TOKEN_INVALID,
    KIND_OIDC_MISCONFIGURED, KIND_OIDC_NETWORK, KIND_OIDC_NO_PENDING, KIND_OIDC_TIMEOUT,
    KIND_OIDC_TOKEN_EXCHANGE_FAILED,
};
use super::oidc_loopback::LoopbackServer;
use super::oidc_session::{OidcSession, OidcSessionStore};
use super::v2_flow::KIND_SECURE_STORAGE_UNAVAILABLE;
use super::v2_signature::now_unix;

/// pending 授权 TTL（秒）：与 `oidc_core::PendingStore::take_matching` 的口径一致（规格 §2：600s）。
const PENDING_TTL_SECONDS: i64 = 600;
/// `identity_oidc_await_callback` 的等待上限（10 分钟；越界由命令层 clamp）。
const MAX_LOOPBACK_TIMEOUT_MS: i64 = 600_000;

// 便捷别名（本模块内部使用；值来自 `oidc_core` 的稳定 kind 常量）
const KIND_MISCONFIGURED: &str = KIND_OIDC_MISCONFIGURED;
const KIND_NO_PENDING: &str = KIND_OIDC_NO_PENDING;
const KIND_TIMEOUT: &str = KIND_OIDC_TIMEOUT;
const KIND_CALLBACK_INVALID: &str = KIND_OIDC_CALLBACK_INVALID;
const KIND_UNKNOWN: &str = "unknown";

/// 成功 / 会话态 kind（前端 §4.1 冻结表逐字一致；错误 kind 在 `oidc_core` 的 `KIND_*` 常量）。
pub const KIND_BEGIN_OK: &str = "oidc_begin_ok";
pub const KIND_LOGIN_OK: &str = "oidc_login_ok";
pub const KIND_SESSION_ACTIVE: &str = "oidc_session_active";
pub const KIND_SESSION_ABSENT: &str = "oidc_session_absent";
pub const KIND_LOGOUT_OK: &str = "oidc_logout_ok";
/// P2-5（#1209）refresh 系列 kind（与前端 `OIDC_MESSAGES` 逐字同步；文案见 `oidc_message`）。
pub const KIND_REFRESH_OK: &str = "oidc_refresh_ok";
pub const KIND_REFRESH_UNAVAILABLE: &str = "oidc_refresh_unavailable";
pub const KIND_REFRESH_FAILED: &str = "oidc_refresh_failed";

/// kind → 固定中文文案（与前端 §4.1 **逐字冻结**一致；不含令牌/URL/服务端原文）。
fn oidc_message(kind: &str) -> &'static str {
    match kind {
        KIND_BEGIN_OK => "已打开浏览器，请在浏览器中完成登录",
        KIND_LOGIN_OK => "登录成功",
        "oidc_disabled" => "该版本未启用统一登录",
        "oidc_misconfigured" => "登录配置不完整，请联系管理员",
        "oidc_no_pending" => "登录请求已失效，请重新发起",
        "oidc_state_mismatch" => "登录状态校验失败，请重新发起",
        "oidc_nonce_mismatch" => "登录凭证校验失败，请重新发起",
        "oidc_callback_invalid" => "回调地址无效，请重新发起",
        "oidc_token_exchange_failed" => "换取登录凭证失败，请重试",
        "oidc_id_token_invalid" => "登录凭证无效，请重试",
        "oidc_timeout" => "登录超时，请重试",
        "oidc_network" => "网络不可用，请检查网络后重试",
        KIND_SESSION_ACTIVE => "已登录",
        KIND_SESSION_ABSENT => "未登录",
        KIND_LOGOUT_OK => "已退出登录",
        KIND_REFRESH_OK => "登录状态已更新",
        KIND_REFRESH_UNAVAILABLE => "登录已过期，请重新登录",
        KIND_REFRESH_FAILED => "登录状态刷新失败，请重新登录",
        KIND_SECURE_STORAGE_UNAVAILABLE => "无法安全保存登录状态（系统凭据存储不可用）",
        _ => "操作失败，请稍后重试",
    }
}

/// P2-4 OIDC 命令统一返回（与既有 `FlowPayload` 同构：`ok/kind/message` + 流程字段）。
///
/// 说明：既有 `FlowPayload` 没有 `authorize_url`/`state` 字段，而规格 §3 冻结
/// `identity_oidc_begin` 的返回必须含二者（且绝不含 verifier/nonce）；`models.rs`
/// 按规格只允许追加 `OidcCompleteInput`，故本结构在本模块内定义
/// （前端 `OidcResult` 按 snake_case → camelCase 映射）。
#[derive(Debug, Clone, serde::Serialize)]
pub struct OidcFlowPayload {
    pub ok: bool,
    pub kind: String,
    pub message: String,
    /// P2-5（#1209）：access_token——**唯一**允许交给前端的 AT 出口。
    /// 只有 `identity_oidc_access_token` 成功时填充；begin/complete/refresh/status
    /// 等其余命令恒为空串（前端拿到后只进 `identity_access_token.ts` 的内存缓存，
    /// 不得落任何持久化）。
    pub access_token: String,
    /// begin 成功：授权 URL（前端只允许 http/https）；其余场景为空
    pub authorize_url: String,
    /// begin 成功：一次性 state（32 hex，前端随回调带回）；其余场景为空
    pub state: String,
    /// 登录成功 / 会话有效：学号掩码（前 4 位 + `***`）；其余场景为空
    pub student_id_masked: String,
    /// 过期时间（unix 秒）；0 = 无意义
    pub expires_at: i64,
    /// `begin_loopback` 成功：实际监听的端口（0 = 不适用/未使用回退）
    pub loopback_port: u16,
}

impl OidcFlowPayload {
    fn ok_with(kind: &'static str) -> Self {
        Self {
            ok: true,
            kind: kind.to_string(),
            message: oidc_message(kind).to_string(),
            access_token: String::new(),
            authorize_url: String::new(),
            state: String::new(),
            student_id_masked: String::new(),
            expires_at: 0,
            loopback_port: 0,
        }
    }

    /// 失败结果（`ok=false` + 稳定 kind + 固定文案；**不**透传服务端细节）。
    fn err(kind: &str) -> Self {
        Self {
            ok: false,
            kind: kind.to_string(),
            message: oidc_message(kind).to_string(),
            access_token: String::new(),
            authorize_url: String::new(),
            state: String::new(),
            student_id_masked: String::new(),
            expires_at: 0,
            loopback_port: 0,
        }
    }
}

// ── 传输抽象（与 v2_service_client::V2Transport 同款：可注入、可单测）─────────

/// 供 trait 使用的简化 boxed future（避免引入新依赖；与 `v2_service_client::BoxFuture` 同形）。
pub type OidcBoxFuture<'a, T> = Pin<Box<dyn std::future::Future<Output = T> + Send + 'a>>;

/// 传输层错误（**只区分类别**，不透传服务端原文；命令层统一映射 `oidc_network`）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OidcTransportError {
    /// 网络不可达 / 超时 / TLS 失败 / 响应读取失败。
    Network(String),
    /// 响应不是合法 JSON（或解析失败）。
    Decode(String),
}

/// 最小 OIDC 传输抽象：令牌端点 form POST + JWKS GET。
///
/// 令牌端点按 OAuth2/OIDC 规范必须 `application/x-www-form-urlencoded`
/// （不是 JSON，故与 `V2Transport::post_json` 不同形）。
pub trait OidcTransport: Send + Sync {
    /// POST 令牌端点（form 编码）。
    fn token_request<'a>(
        &'a self,
        token_url: &'a str,
        form: &'a [(&'a str, &'a str)],
    ) -> OidcBoxFuture<'a, Result<(u16, Value), OidcTransportError>>;

    /// GET JWKS 端点。
    fn jwks_request<'a>(
        &'a self,
        jwks_url: &'a str,
    ) -> OidcBoxFuture<'a, Result<(u16, Value), OidcTransportError>>;
}

/// 真实实现（reqwest）：15s 超时；响应体按 JSON 解析（解析失败 → Null 由上层按缺失处理）。
pub struct ReqwestOidcTransport {
    http: reqwest::Client,
}

impl ReqwestOidcTransport {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
        }
    }
}

impl OidcTransport for ReqwestOidcTransport {
    fn token_request<'a>(
        &'a self,
        token_url: &'a str,
        form: &'a [(&'a str, &'a str)],
    ) -> OidcBoxFuture<'a, Result<(u16, Value), OidcTransportError>> {
        Box::pin(async move {
            let resp = self
                .http
                .post(token_url)
                .form(form)
                .send()
                .await
                .map_err(|e| OidcTransportError::Network(e.to_string()))?;
            let status = resp.status().as_u16();
            let text = resp
                .text()
                .await
                .map_err(|e| OidcTransportError::Decode(e.to_string()))?;
            let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            Ok((status, value))
        })
    }

    fn jwks_request<'a>(
        &'a self,
        jwks_url: &'a str,
    ) -> OidcBoxFuture<'a, Result<(u16, Value), OidcTransportError>> {
        Box::pin(async move {
            let resp = self
                .http
                .get(jwks_url)
                .send()
                .await
                .map_err(|e| OidcTransportError::Network(e.to_string()))?;
            let status = resp.status().as_u16();
            let text = resp
                .text()
                .await
                .map_err(|e| OidcTransportError::Decode(e.to_string()))?;
            let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            Ok((status, value))
        })
    }
}

// ── JWKS 缓存（300s）────────────────────────────────────────────────────────

/// JWKS 缓存：TTL 300s，按 JWKS URL 单条缓存。
///
/// - 命中（同 URL 且未过期）→ 直接用缓存，**不**发起请求；
/// - 未命中 / 过期 / URL 变化 → 经 transport 拉取；拉取失败**不**缓存（下次重试）；
/// - `now` 由调用方注入（便于单测控制时钟）。
pub struct JwksCache {
    /// (jwks_url, 拉取时间 unix 秒, JWKS 体)
    inner: Mutex<Option<(String, i64, Value)>>,
}

impl JwksCache {
    /// JWKS 缓存有效期（秒）。
    pub const TTL_SECONDS: i64 = 300;

    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    /// 取 JWKS（缓存命中 → 零网络；否则经 transport 拉取并缓存）。
    pub async fn fetch(
        &self,
        jwks_url: &str,
        transport: &dyn OidcTransport,
        now: i64,
    ) -> Result<Value, OidcError> {
        {
            let guard = self.inner.lock().unwrap();
            if let Some((url, fetched_at, value)) = guard.as_ref() {
                if url == jwks_url && now - fetched_at < Self::TTL_SECONDS {
                    return Ok(value.clone());
                }
            }
        }
        let (status, value) = transport
            .jwks_request(jwks_url)
            .await
            .map_err(|_| OidcError::Network)?;
        if !(200..300).contains(&status) || !value.get("keys").map_or(false, |k| k.is_array()) {
            // 端点异常：不写缓存，按网络类错误上报
            return Err(OidcError::Network);
        }
        *self.inner.lock().unwrap() = Some((jwks_url.to_string(), now, value.clone()));
        Ok(value)
    }
}

// ── 进程内单例（begin/complete 跨命令共享 pending；JWKS 跨登录共享缓存）────

/// 待完成授权存储（state 一次性 + TTL 600s；begin 写入、complete 消费）。
static PENDING: std::sync::OnceLock<PendingStore> = std::sync::OnceLock::new();

fn production_pending() -> &'static PendingStore {
    PENDING.get_or_init(PendingStore::new)
}

/// JWKS 缓存（进程级）。
static JWKS_CACHE: std::sync::OnceLock<JwksCache> = std::sync::OnceLock::new();

fn production_jwks_cache() -> &'static JwksCache {
    JWKS_CACHE.get_or_init(JwksCache::new)
}

// ── 核心实现（依赖注入；命令层只做 env 解析 + 调用）─────────────────────────

/// begin 核心：生成 PKCE/state/nonce → 存入 pending → 返回授权 URL。
///
/// - **不联网、不读 keyring**（pending 是进程内一次性存储）；
/// - 返回体**不含** verifier/nonce（nonce 只在内部与 id_token 比对）。
fn begin_impl(cfg: &OidcConfig, pending: &PendingStore, now: i64) -> OidcFlowPayload {
    let pkce = generate_pkce();
    let state = generate_state();
    let nonce = generate_nonce();
    let authorize_url = build_authorize_url(cfg, &state, &nonce, &pkce.challenge);
    pending.put(PendingAuth {
        state: state.clone(),
        nonce,
        verifier: pkce.verifier,
        redirect_uri: cfg.redirect_uri.clone(),
        created_at: now,
    });
    let mut payload = OidcFlowPayload::ok_with(KIND_BEGIN_OK);
    payload.authorize_url = authorize_url;
    payload.state = state;
    payload.expires_at = now + PENDING_TTL_SECONDS;
    payload
}

/// complete 核心（规格 §3 顺序）：
/// 1) `parse_callback` → 2) `take_matching`（一次性）→ 3) 令牌交换 →
/// 4) JWKS（300s 缓存）→ `verifier.verify`（生产为 `RingIdTokenVerifier` = ring 真验签）
/// → 5) 产出会话（**写库在命令层**，见下）。
///
/// 任何失败 → `Failure(payload)`（稳定 kind + 固定文案），**绝不**写会话；
/// state 不匹配 / 无 pending / 过期 / 回调非法 时**不发起**令牌请求（transport 零调用）。
enum CompleteOutcome {
    /// 校验失败：payload 已是稳定分类（会话未写入）。
    Failure(OidcFlowPayload),
    /// 全部校验通过：等待写入 keyring（唯一写库点，失败 → `secure_storage_unavailable`）。
    Ready(OidcSession),
}

async fn complete_impl(
    cfg: &OidcConfig,
    pending: &PendingStore,
    transport: &dyn OidcTransport,
    jwks_cache: &JwksCache,
    verifier: &dyn IdTokenVerifier,
    callback_url: &str,
    now: i64,
) -> CompleteOutcome {
    // 1) 解析回调（形状错误 → callback_invalid；不发起令牌请求）
    let (code, state) = match parse_callback(callback_url, &cfg.redirect_uri) {
        Ok(pair) => pair,
        Err(err) => return CompleteOutcome::Failure(OidcFlowPayload::err(err.kind())),
    };
    // 2) take_matching（一次性）：不匹配/重复/过期 → 对应 kind（不发起令牌请求）
    let pending_auth = match pending.take_matching(&state, now) {
        Ok(p) => p,
        Err(err) => return CompleteOutcome::Failure(OidcFlowPayload::err(err.kind())),
    };
    // 3) 令牌交换（form POST；verifier 只在此处使用，永不进日志/返回体）
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", pending_auth.redirect_uri.as_str()),
        ("code_verifier", pending_auth.verifier.as_str()),
        ("client_id", cfg.client_id.as_str()),
    ];
    let (status, body) = match transport.token_request(&cfg.token_endpoint(), &form).await {
        Ok(result) => result,
        Err(_) => return CompleteOutcome::Failure(OidcFlowPayload::err(KIND_OIDC_NETWORK)),
    };
    if !(200..300).contains(&status) {
        return CompleteOutcome::Failure(OidcFlowPayload::err(KIND_OIDC_TOKEN_EXCHANGE_FAILED));
    }
    let access_token = body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());
    let id_token = body
        .get("id_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());
    let (Some(access_token), Some(id_token)) = (access_token, id_token) else {
        return CompleteOutcome::Failure(OidcFlowPayload::err(KIND_OIDC_TOKEN_EXCHANGE_FAILED));
    };
    let refresh_token = body
        .get("refresh_token")
        .and_then(Value::as_str)
        .map(str::to_string);
    // 4) JWKS（300s 缓存；失败 → oidc_network，不写会话）
    let jwks = match jwks_cache.fetch(&cfg.jwks_uri(), transport, now).await {
        Ok(value) => value,
        Err(err) => return CompleteOutcome::Failure(OidcFlowPayload::err(err.kind())),
    };
    // 5) id_token 校验（生产 `RingIdTokenVerifier` = ring RS256 真验签；
    //    nonce 与 begin 时存的 nonce 比对）
    let claims = match verifier.verify(id_token, &jwks, cfg, Some(pending_auth.nonce.as_str()), now)
    {
        Ok(c) => c,
        Err(err) => return CompleteOutcome::Failure(OidcFlowPayload::err(err.kind())),
    };
    // 全部通过 → 产出会话（后续唯一写库点是 keyring；失败即拒绝、不降级）
    CompleteOutcome::Ready(OidcSession {
        access_token: access_token.to_string(),
        refresh_token,
        id_token: id_token.to_string(),
        student_id: claims.student_id.clone(),
        student_name: claims.student_name.clone(),
        exp: claims.exp,
        iat: claims.iat,
        issuer: cfg.issuer.clone(),
        client_id: cfg.client_id.clone(),
    })
}

/// 校验全部通过后的唯一写库点：会话写入 keyring。
/// 成功 → `oidc_login_ok`（只返回掩码学号 + 过期时间）；失败 → `secure_storage_unavailable`
/// （**不**落明文文件，会话即失败，无「无令牌继续」的降级路径）。
fn finish_login_session(session: &OidcSession, sessions: &OidcSessionStore) -> OidcFlowPayload {
    match sessions.save(session) {
        Ok(()) => {
            let mut payload = OidcFlowPayload::ok_with(KIND_LOGIN_OK);
            payload.student_id_masked = session.student_id_masked();
            payload.expires_at = session.exp;
            payload
        }
        Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
    }
}

/// session_status 核心（只读本地会话，**不联网**）：
/// - 无会话 / 已过期 → `oidc_session_absent`（ok=true 的状态报告）；
/// - 有效 → `oidc_session_active` + 掩码学号 + 过期时间（**不**返回任何 token）；
/// - keyring 不可用 → `secure_storage_unavailable`（fail closed）。
fn session_status_impl(sessions: &OidcSessionStore, now: i64) -> OidcFlowPayload {
    match sessions.load() {
        Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
        Ok(None) => OidcFlowPayload::ok_with(KIND_SESSION_ABSENT),
        Ok(Some(session)) if session.exp > now => {
            let mut payload = OidcFlowPayload::ok_with(KIND_SESSION_ACTIVE);
            payload.student_id_masked = session.student_id_masked();
            payload.expires_at = session.exp;
            payload
        }
        // 已过期：按未登录报告（不在此处删条目，保持状态查询只读）
        Ok(Some(_)) => OidcFlowPayload::ok_with(KIND_SESSION_ABSENT),
    }
}

/// logout 核心：只清 OIDC 会话条目（**不清设备密钥**）。
fn logout_impl(sessions: &OidcSessionStore) -> OidcFlowPayload {
    match sessions.delete() {
        Ok(()) => OidcFlowPayload::ok_with(KIND_LOGOUT_OK),
        Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
    }
}

// ── P2-5（issue #1209）：refresh token 刷新 + access_token 出口 ────────────────

/// 会话「仍新鲜」边距（秒）：`now + 30 < exp` 视为新鲜 → 刷新短路、**零网络**
/// （规格 §1 第 2 步，顺序冻结）。
const FRESH_MARGIN_SECONDS: i64 = 30;

/// refresh 核心结果：
enum RefreshOutcome {
    /// 直接返回（会话仍新鲜 / 无会话 / 无 RT / 任何失败）：payload 已是稳定分类；
    /// **没有**发生会话写入（fail closed：旧令牌原样保留）。
    Payload(OidcFlowPayload),
    /// 全部校验通过：等待原子写 keyring（唯一写库点，失败 → `secure_storage_unavailable`）。
    Ready(OidcSession),
}

/// refresh 核心（规格 §1 顺序冻结）：
/// 1. 读 keyring 会话：不可用 → `secure_storage_unavailable`（fail closed，不联网）；
///    无会话 → `oidc_session_absent`（不联网）；
/// 2. 仍新鲜（`now + 30 < exp`）且 `force=false` → `oidc_refresh_ok` + 原过期时间，
///    **零网络**（transport 一次都不调用）；`force=true` 跳过本步（**仍新鲜也强制刷新**，
///    供 `identity_oidc_access_token` 的 401 场景）；
/// 3. 过期且无 `refresh_token` → `oidc_refresh_unavailable`（不联网）；
/// 4. `POST {token_endpoint}`（form：`grant_type=refresh_token` / `refresh_token` / `client_id`，
///    复用 `OidcTransport::token_request`，**不**新增 trait 方法）：
///    网络错误 → `oidc_network`；非 2xx 或 `error` 字段存在 → `oidc_refresh_failed`
///    （日志只记状态码类别，不透传服务端原文）；`access_token` 缺失/空 → `oidc_refresh_failed`；
/// 5. 响应含 `id_token` → 验签（签名 + iss + aud + exp + iat + sub；**刷新场景没有 nonce**
///    → `expected_nonce = None` 仅跳过 nonce 比对，其余校验一项不少）；
///    失败 → `oidc_id_token_invalid`（不写会话）；
/// 6. 组装新会话：`access_token` 用新值；`refresh_token` **响应带轮换值才替换**，否则保留旧值；
///    `id_token` 同理；`exp` 优先级 = 响应 `expires_in`（`now + expires_in`）> 已校验
///    id_token 的 `exp` > 旧 `exp`；`student_id` / `issuer` / `client_id` 不变；
///    **防串号**：id_token 解析出的学号与旧会话 `student_id` 不一致 → 拒绝（不写会话）。
///
/// 任何失败路径**绝不写会话**，也不返回新令牌（零泄露：令牌永不进日志/错误文案）。
async fn refresh_impl(
    cfg: &OidcConfig,
    sessions: &OidcSessionStore,
    transport: &dyn OidcTransport,
    jwks_cache: &JwksCache,
    verifier: &dyn IdTokenVerifier,
    force: bool,
    now: i64,
) -> RefreshOutcome {
    // 1) 读 keyring 会话（keyring 错误/无会话：不联网）
    let session = match sessions.load() {
        Err(_) => {
            return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE))
        }
        Ok(None) => return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_SESSION_ABSENT)),
        Ok(Some(session)) => session,
    };
    // 2) 仍新鲜（now + 30 < exp）且非强制 → 直接返回（零网络；transport 零调用）
    if !force && session.exp > now + FRESH_MARGIN_SECONDS {
        let mut payload = OidcFlowPayload::ok_with(KIND_REFRESH_OK);
        payload.student_id_masked = session.student_id_masked();
        payload.expires_at = session.exp;
        return RefreshOutcome::Payload(payload);
    }
    // 3) 过期且无 refresh_token → unavailable（不联网）
    let Some(refresh_token) = session.refresh_token.clone() else {
        return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_REFRESH_UNAVAILABLE));
    };
    // 4) 刷新换票（form POST；refresh_token 只进请求，不进日志/返回体）
    let form = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
        ("client_id", cfg.client_id.as_str()),
    ];
    let (status, body) = match transport.token_request(&cfg.token_endpoint(), &form).await {
        Ok(result) => result,
        Err(_) => return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_OIDC_NETWORK)),
    };
    // 非 2xx 或 error 字段存在 → refresh_failed（只记状态码类别；不写会话）
    if !(200..300).contains(&status) || body.get("error").is_some() {
        log::warn!("[identity] OIDC refresh：令牌端点返回失败（status={status}）");
        return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_REFRESH_FAILED));
    }
    let access_token = match body
        .get("access_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        Some(token) => token.to_string(),
        // access_token 缺失/空 → refresh_failed（不写会话）
        None => return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_REFRESH_FAILED)),
    };
    // 5) 响应含 id_token → 校验（刷新场景无 nonce → None 跳过 nonce 比对；其余不削弱）
    let new_id_token = body
        .get("id_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let claims: Option<IdTokenClaims> = match new_id_token.as_deref() {
        Some(id_token) => {
            let jwks = match jwks_cache.fetch(&cfg.jwks_uri(), transport, now).await {
                Ok(value) => value,
                Err(err) => return RefreshOutcome::Payload(OidcFlowPayload::err(err.kind())),
            };
            match verifier.verify(id_token, &jwks, cfg, None, now) {
                Ok(c) => Some(c),
                Err(err) => return RefreshOutcome::Payload(OidcFlowPayload::err(err.kind())),
            }
        }
        // 响应不带 id_token → 保留旧 id_token（规格允许），无需校验
        None => None,
    };
    // 防串号：id_token 解析出的学号必须与旧会话一致（sub = hbut_<学号> 或 hbut_student_id
    // 等 claim，已由 validate_claims 解析）；不一致 → 拒绝且不写会话
    if let Some(claims) = &claims {
        if claims.student_id != session.student_id {
            log::warn!("[identity] OIDC refresh：id_token 学号与会话不一致，拒绝（防串号）");
            return RefreshOutcome::Payload(OidcFlowPayload::err(KIND_OIDC_ID_TOKEN_INVALID));
        }
    }
    // 6) 组装新会话（RT 轮换：响应带新值才替换，否则保留旧值；绝不清空）
    let new_refresh_token = body
        .get("refresh_token")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| session.refresh_token.clone());
    // exp 优先级：响应 expires_in（正整数）> 已校验 id_token 的 exp > 旧 exp
    let expires_in = body.get("expires_in").and_then(Value::as_i64);
    let new_exp = match expires_in {
        Some(delta) if delta > 0 => now + delta,
        _ => claims.as_ref().map_or(session.exp, |c| c.exp),
    };
    RefreshOutcome::Ready(OidcSession {
        access_token,
        refresh_token: new_refresh_token,
        id_token: new_id_token.unwrap_or_else(|| session.id_token.clone()),
        // student_id / issuer / client_id 不变（防串号已在上面通过）
        student_id: session.student_id,
        student_name: session.student_name,
        exp: new_exp,
        iat: session.iat,
        issuer: session.issuer,
        client_id: session.client_id,
    })
}

/// refresh 命令的唯一写库点（测试用）：成功 → `oidc_refresh_ok`（**不含** token，只回掩码学号
/// + 过期时间）；失败 → `secure_storage_unavailable`（新令牌不返回，也不落明文）。
fn finish_refresh(session: &OidcSession, sessions: &OidcSessionStore) -> OidcFlowPayload {
    match sessions.save(session) {
        Ok(()) => {
            let mut payload = OidcFlowPayload::ok_with(KIND_REFRESH_OK);
            payload.student_id_masked = session.student_id_masked();
            payload.expires_at = session.exp;
            payload
        }
        Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
    }
}

/// access_token 核心结果：
enum AccessTokenOutcome {
    /// 直接返回（payload 已分类；access_token 为空，或已为存储的 AT）。
    Payload(OidcFlowPayload),
    /// 强制刷新校验通过：等待原子写 keyring（唯一写库点）。
    Ready(OidcSession),
}

/// access_token 核心（规格 §2.2，**唯一 AT 出口**；`force` 由入参传入）：
/// - keyring 不可用 → `secure_storage_unavailable`（不联网）；
/// - `force=true`：直接走完整刷新链（**仍新鲜也强制刷新**——provider 的 401 场景），
///   任何失败 → 稳定 kind，**不返回 AT**；
/// - `force=false`：无会话 → `oidc_session_absent`（不联网）；会话有效
///   （`now + 30 < exp`）→ 直接返回存储的 AT（**零网络**）；已过期 → `oidc_session_absent`
///   （不联网；需要令牌时调用方应走 `force=true`）。
async fn access_token_impl(
    cfg: &OidcConfig,
    sessions: &OidcSessionStore,
    transport: &dyn OidcTransport,
    jwks_cache: &JwksCache,
    verifier: &dyn IdTokenVerifier,
    force: bool,
    now: i64,
) -> AccessTokenOutcome {
    if force {
        // 强制刷新语义：无论会话是否仍新鲜，都走完整刷新链（跳过「仍新鲜」短路）
        return match refresh_impl(cfg, sessions, transport, jwks_cache, verifier, true, now).await {
            RefreshOutcome::Payload(payload) => AccessTokenOutcome::Payload(payload),
            RefreshOutcome::Ready(session) => AccessTokenOutcome::Ready(session),
        };
    }
    let session = match sessions.load() {
        Err(_) => {
            return AccessTokenOutcome::Payload(OidcFlowPayload::err(
                KIND_SECURE_STORAGE_UNAVAILABLE,
            ))
        }
        Ok(None) => return AccessTokenOutcome::Payload(OidcFlowPayload::err(KIND_SESSION_ABSENT)),
        Ok(Some(session)) => session,
    };
    if session.exp > now + FRESH_MARGIN_SECONDS {
        // 有效会话：直接返回存储的 AT（零网络；附掩码学号 + 过期时间）
        let mut payload = OidcFlowPayload::ok_with(KIND_REFRESH_OK);
        payload.student_id_masked = session.student_id_masked();
        payload.expires_at = session.exp;
        payload.access_token = session.access_token.clone();
        return AccessTokenOutcome::Payload(payload);
    }
    // 已过期：按未登录报告（不联网；强制刷新走 force 路径）
    AccessTokenOutcome::Payload(OidcFlowPayload::err(KIND_SESSION_ABSENT))
}

/// access_token 强制刷新成功后的唯一写库点（测试用）：成功 → `oidc_refresh_ok` 且**携带新 AT**
/// （唯一允许交给前端的出口）；失败 → `secure_storage_unavailable`（新令牌不返回）。
fn finish_refresh_with_token(
    session: &OidcSession,
    sessions: &OidcSessionStore,
) -> OidcFlowPayload {
    match sessions.save(session) {
        Ok(()) => {
            let mut payload = OidcFlowPayload::ok_with(KIND_REFRESH_OK);
            payload.student_id_masked = session.student_id_masked();
            payload.expires_at = session.exp;
            payload.access_token = session.access_token.clone();
            payload
        }
        Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
    }
}

// ── Tauri 命令（薄包装：env 解析 → 核心实现）──────────────────────────────

/// 解析 OIDC 配置（`OidcConfig::from_env`）：
/// - `Ok(None)` → `oidc_disabled`（**不联网、不读 keyring**）；
/// - `Err` → 配置错误 kind（如 `oidc_misconfigured`）。
fn resolve_config() -> Result<OidcConfig, OidcFlowPayload> {
    match OidcConfig::from_env() {
        Ok(Some(cfg)) => Ok(cfg),
        Ok(None) => Err(OidcFlowPayload::err(KIND_OIDC_DISABLED)),
        Err(err) => Err(OidcFlowPayload::err(err.kind())),
    }
}

/// P2-4：发起 OIDC 登录（授权码 + PKCE）。
///
/// 成功返回 `authorize_url` / `state` / `expires_at`（**不**返回 verifier/nonce）；
/// 未启用 → `oidc_disabled`（不联网、不读 keyring）。
#[tauri::command]
pub(crate) async fn identity_oidc_begin(
    _state: State<'_, AppState>,
) -> Result<OidcFlowPayload, String> {
    let now = now_unix();
    match resolve_config() {
        Ok(cfg) => Ok(begin_impl(&cfg, production_pending(), now)),
        Err(payload) => Ok(payload),
    }
}

/// P2-4：完成 OIDC 登录（浏览器回调后由前端携 `callback_url` 调用）。
///
/// 顺序 = 解析回调 → take_matching（一次性）→ 令牌交换 → JWKS（300s 缓存）→
/// id_token 校验 → 写 keyring 会话。**任何失败都不写会话**；state 不匹配/重复/过期
/// → 对应 kind 且不发起令牌请求。
#[tauri::command]
pub(crate) async fn identity_oidc_complete(
    _state: State<'_, AppState>,
    input: OidcCompleteInput,
) -> Result<OidcFlowPayload, String> {
    let now = now_unix();
    let cfg = match resolve_config() {
        Ok(cfg) => cfg,
        Err(payload) => return Ok(payload),
    };
    let _ = now;
    finish_complete(&input.callback_url).await
}

/// 完成链路（深链与 loopback **共用**）：解析回调 → take_matching → 令牌交换 →
/// JWKS → id_token 校验（ring 真验签）→ 写 keyring 会话。
///
/// **任何失败都不写会话**；state 不匹配/重复/过期不发起令牌请求。
async fn finish_complete(callback_url: &str) -> Result<OidcFlowPayload, String> {
    let now = now_unix();
    let cfg = match resolve_config() {
        Ok(cfg) => cfg,
        Err(payload) => return Ok(payload),
    };
    let jwks_cache = production_jwks_cache();
    let pending = production_pending();
    let transport = ReqwestOidcTransport::new();
    // 生产验签走 `RingIdTokenVerifier`（ring RS256 真验签，绝不旁路）
    let verifier = RingIdTokenVerifier;
    match complete_impl(
        &cfg,
        pending,
        &transport,
        jwks_cache,
        &verifier,
        callback_url,
        now,
    )
    .await
    {
        CompleteOutcome::Failure(payload) => Ok(payload),
        CompleteOutcome::Ready(session) => {
            let masked = session.student_id_masked();
            let exp = session.exp;
            let sessions = OidcSessionStore::real();
            let result = tauri::async_runtime::spawn_blocking(move || sessions.save(&session))
                .await
                .map_err(|e| format!("会话写入任务失败：{e}"))?;
            Ok(match result {
                Ok(()) => {
                    let mut payload = OidcFlowPayload::ok_with(KIND_LOGIN_OK);
                    payload.student_id_masked = masked;
                    payload.expires_at = exp;
                    payload
                }
                Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
            })
        }
    }
}

// ── loopback 回退（验收③）：真实接线 ─────────────────────────────────────────

/// 进程内 loopback 单例：`(server, 实际 redirect_uri)`。
///
/// 为什么单例：`begin_loopback` 起监听、`await_callback` 在同一进程里等回调；
/// 二者必须共享同一个 server 句柄（`LoopbackServer` 持有 TcpListener，drop 即关闭）。
fn loopback_slot() -> &'static Mutex<Option<(LoopbackServer, String)>> {
    static SLOT: OnceLock<Mutex<Option<(LoopbackServer, String)>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// P2-4（回退）：发起 OIDC 登录并**在本机回环**上等回调。
///
/// 何时用：自定义 scheme（`minihbut://`）未被 Casdoor/OS 接受时的回退路径。
/// 需要 `HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI`（形如
/// `http://127.0.0.1:0/callback`，端口 0 = 系统分配）。
#[tauri::command]
pub(crate) async fn identity_oidc_begin_loopback(
    _state: State<'_, AppState>,
) -> Result<OidcFlowPayload, String> {
    let now = now_unix();
    let cfg = match resolve_config() {
        Ok(cfg) => cfg,
        Err(payload) => return Ok(payload),
    };
    let Some(template) = loopback_redirect_template_from_env() else {
        return Ok(OidcFlowPayload::err(KIND_MISCONFIGURED));
    };
    let Some(want_port) = template_port(&template) else {
        return Ok(OidcFlowPayload::err(KIND_MISCONFIGURED));
    };
    // 绑定失败（端口被占/权限）→ 配置不可用（不降级到深链，避免状态错配）
    let server = match LoopbackServer::start(want_port) {
        Ok(server) => server,
        Err(_) => return Ok(OidcFlowPayload::err(KIND_MISCONFIGURED)),
    };
    let actual_port = server.local_port();
    let Some(actual_redirect) = with_port(&template, actual_port) else {
        return Ok(OidcFlowPayload::err(KIND_MISCONFIGURED));
    };
    // 授权 URL 必须用**实际** redirect_uri（token 交换要逐字回传同一个值）
    let mut cfg = cfg;
    cfg.redirect_uri = actual_redirect.clone();

    // 丢弃上一轮未完成的 loopback（旧句柄 drop 即关闭监听）
    {
        let slot = loopback_slot();
        let mut guard = match slot.lock() {
            Ok(guard) => guard,
            Err(_) => return Ok(OidcFlowPayload::err(KIND_UNKNOWN)),
        };
        *guard = Some((server, actual_redirect));
    }

    let mut payload = begin_impl(&cfg, production_pending(), now);
    payload.loopback_port = actual_port;
    Ok(payload)
}

/// P2-4（回退）：在本机回环上等待回调，收到后走**同一条**完成链路。
#[tauri::command]
pub(crate) async fn identity_oidc_await_callback(
    _state: State<'_, AppState>,
    input: OidcAwaitCallbackInput,
) -> Result<OidcFlowPayload, String> {
    let timeout_ms = input.timeout_ms.clamp(1, MAX_LOOPBACK_TIMEOUT_MS);
    let taken = {
        let slot = loopback_slot();
        let mut guard = match slot.lock() {
            Ok(guard) => guard,
            Err(_) => return Ok(OidcFlowPayload::err(KIND_UNKNOWN)),
        };
        guard.take()
    };
    let Some((server, redirect_uri)) = taken else {
        return Ok(OidcFlowPayload::err(KIND_NO_PENDING));
    };
    // 阻塞等待放到阻塞池（绝不阻塞 async 运行时）
    let waited = tauri::async_runtime::spawn_blocking(move || {
        server.wait_for_callback(Duration::from_millis(timeout_ms as u64))
    })
    .await
    .map_err(|e| format!("loopback 等待任务失败：{e}"))?;

    let (code, state) = match waited {
        Ok(pair) => pair,
        Err(err) => {
            return Ok(OidcFlowPayload::err(match err.kind() {
                KIND_TIMEOUT => KIND_TIMEOUT,
                _ => KIND_CALLBACK_INVALID,
            }))
        }
    };
    // 用实际 redirect_uri 拼回调 URL（与深链路径**完全同一**校验链）
    let callback_url = format!("{redirect_uri}?code={code}&state={state}");
    finish_complete(&callback_url).await
}

/// P2-4：查询 OIDC 会话状态（只读本地 keyring，**不联网、不返回 token**）。
#[tauri::command]
pub(crate) async fn identity_oidc_session_status() -> Result<OidcFlowPayload, String> {
    let sessions = OidcSessionStore::real();
    let now = now_unix();
    let payload = tauri::async_runtime::spawn_blocking(move || session_status_impl(&sessions, now))
        .await
        .map_err(|e| format!("会话读取任务失败：{e}"))?;
    Ok(payload)
}

/// P2-4：退出 OIDC 登录（只清本地会话条目，**不清设备密钥**）。
#[tauri::command]
pub(crate) async fn identity_oidc_logout() -> Result<OidcFlowPayload, String> {
    let sessions = OidcSessionStore::real();
    let payload = tauri::async_runtime::spawn_blocking(move || logout_impl(&sessions))
        .await
        .map_err(|e| format!("会话删除任务失败：{e}"))?;
    Ok(payload)
}

/// P2-5（issue #1209）：刷新 OIDC 会话（**默认路径**，refresh token 换票）。
///
/// 顺序 = keyring 读取 → 新鲜短路（**零网络**）→ 刷新换票 → id_token 校验（无 nonce）→
/// 原子写 keyring。**任何失败都不写会话**（旧令牌原样保留，fail closed），
/// 返回体只含稳定 kind + 掩码学号 + 过期时间（**不含** AT/RT）。
#[tauri::command]
pub(crate) async fn identity_oidc_refresh(
    _state: State<'_, AppState>,
) -> Result<OidcFlowPayload, String> {
    let now = now_unix();
    let cfg = match resolve_config() {
        Ok(cfg) => cfg,
        Err(payload) => return Ok(payload),
    };
    let jwks_cache = production_jwks_cache();
    let transport = ReqwestOidcTransport::new();
    // 生产验签走 `RingIdTokenVerifier`（ring RS256 真验签，绝不旁路）
    let verifier = RingIdTokenVerifier;
    let sessions = OidcSessionStore::real();
    match refresh_impl(
        &cfg, &sessions, &transport, jwks_cache, &verifier, false, now,
    )
    .await
    {
        RefreshOutcome::Payload(payload) => Ok(payload),
        RefreshOutcome::Ready(session) => {
            // 唯一写库点：keyring 写入放阻塞池（绝不阻塞 async 运行时）
            let masked = session.student_id_masked();
            let exp = session.exp;
            let result = tauri::async_runtime::spawn_blocking(move || sessions.save(&session))
                .await
                .map_err(|e| format!("会话写入任务失败：{e}"))?;
            Ok(match result {
                Ok(()) => {
                    let mut payload = OidcFlowPayload::ok_with(KIND_REFRESH_OK);
                    payload.student_id_masked = masked;
                    payload.expires_at = exp;
                    payload
                }
                Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
            })
        }
    }
}

/// P2-5（issue #1209）：获取 OIDC access_token（**唯一 AT 出口**，入参 `{input:{force}}`）。
///
/// - **只在有有效会话时返回 AT**（前端拿到后只进 `identity_access_token.ts` 的内存缓存，
///   不得落任何持久化）；
/// - `force=false`：会话有效 → 直接返回存储的 AT（零网络）；无会话/已过期 →
///   `oidc_session_absent`（不联网）；
/// - `force=true`：先走完整刷新链（**仍新鲜也强制刷新**，供 401 场景）；
///   成功 → 返回新 AT；任何失败 → 稳定 kind，**不返回 AT**；
/// - `session_status` 保持不返回令牌（不变）。
#[tauri::command]
pub(crate) async fn identity_oidc_access_token(
    _state: State<'_, AppState>,
    input: OidcAccessTokenInput,
) -> Result<OidcFlowPayload, String> {
    let now = now_unix();
    let cfg = match resolve_config() {
        Ok(cfg) => cfg,
        Err(payload) => return Ok(payload),
    };
    let jwks_cache = production_jwks_cache();
    let transport = ReqwestOidcTransport::new();
    // 生产验签走 `RingIdTokenVerifier`（ring RS256 真验签，绝不旁路）
    let verifier = RingIdTokenVerifier;
    let sessions = OidcSessionStore::real();
    match access_token_impl(
        &cfg,
        &sessions,
        &transport,
        jwks_cache,
        &verifier,
        input.force,
        now,
    )
    .await
    {
        AccessTokenOutcome::Payload(payload) => Ok(payload),
        AccessTokenOutcome::Ready(session) => {
            let masked = session.student_id_masked();
            let exp = session.exp;
            let access_token = session.access_token.clone();
            let result = tauri::async_runtime::spawn_blocking(move || sessions.save(&session))
                .await
                .map_err(|e| format!("会话写入任务失败：{e}"))?;
            Ok(match result {
                Ok(()) => {
                    let mut payload = OidcFlowPayload::ok_with(KIND_REFRESH_OK);
                    payload.student_id_masked = masked;
                    payload.expires_at = exp;
                    payload.access_token = access_token;
                    payload
                }
                Err(_) => OidcFlowPayload::err(KIND_SECURE_STORAGE_UNAVAILABLE),
            })
        }
    }
}

// 单测拆到独立文件（见 oidc_commands_tests.rs 头部说明）；`#[path]` 让文件名不必遵循
// 目录嵌套规则（模块名仍为 `tests`，`super::` 指向本模块）。
#[cfg(test)]
#[path = "oidc_commands_tests.rs"]
mod tests;
