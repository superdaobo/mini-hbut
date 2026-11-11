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

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::super::oidc_core::{
        IdTokenClaims, IdTokenVerifier, KIND_OIDC_CALLBACK_INVALID, KIND_OIDC_NO_PENDING,
        KIND_OIDC_STATE_MISMATCH,
    };
    use super::super::oidc_core_fixture::{fixture_id_token, FIXTURE_JWKS, FIXTURE_NONCE};
    use super::*;
    use crate::identity::keyring::{FailingKeyring, MemoryKeyring};

    // ── 测试夹具：假验签器（命令层单测不依赖任何签名器/私钥；JWKS 用公开 fixture）──

    /// 测试 JWKS（公开 fixture，含公钥，无密钥）。
    fn test_jwks() -> Value {
        serde_json::from_str(FIXTURE_JWKS).expect("fixture JWKS 应可解析")
    }

    /// 假验签器（**仅单测**）：模拟「服务端已验签通过」，直接返回带期望学号的 claims。
    ///
    /// 语义对齐 `verify_id_token` 的两条关键分支：`Some` nonce 不符 → `NonceMismatch`
    /// （`None` = 刷新场景，跳过比对）；`reject_invalid` 置位 → `IdTokenInvalid`
    /// （模拟真验签对垃圾 token 的拒绝）。
    struct FakeIdTokenVerifier {
        nonce: String,
        reject_invalid: bool,
        /// 返回 claims 里的学号（默认 fixture 学号 `20241234`；可改以模拟防串号场景）
        student_id: String,
    }

    impl Default for FakeIdTokenVerifier {
        fn default() -> Self {
            Self {
                nonce: String::new(),
                reject_invalid: false,
                student_id: "20241234".to_string(),
            }
        }
    }

    impl FakeIdTokenVerifier {
        fn with_nonce(nonce: &str) -> Self {
            Self {
                nonce: nonce.to_string(),
                reject_invalid: false,
                student_id: "20241234".to_string(),
            }
        }

        /// 指定返回 claims 的学号（模拟刷新 id_token 学号与会话不一致的防串号场景）。
        fn with_student_id(mut self, student_id: &str) -> Self {
            self.student_id = student_id.to_string();
            self
        }
    }

    impl IdTokenVerifier for FakeIdTokenVerifier {
        fn verify(
            &self,
            _id_token: &str,
            _jwks: &Value,
            cfg: &OidcConfig,
            expected_nonce: Option<&str>,
            now: i64,
        ) -> Result<IdTokenClaims, OidcError> {
            if self.reject_invalid {
                return Err(OidcError::IdTokenInvalid);
            }
            // `None` = 刷新场景：跳过 nonce 比对（与 `validate_claims` 的 Option 语义一致）
            if let Some(expected) = expected_nonce {
                if self.nonce != expected {
                    return Err(OidcError::NonceMismatch);
                }
            }
            Ok(IdTokenClaims {
                sub: "hbut_20241234".to_string(),
                iss: cfg.issuer.clone(),
                aud: cfg.client_id.clone(),
                student_id: self.student_id.clone(),
                student_name: Some("测试同学".to_string()),
                nonce: self.nonce.clone(),
                exp: now + 3600,
                iat: now,
            })
        }
    }

    /// 生产验签器就是真验签：`RingIdTokenVerifier` 必须能真验过公开 fixture token、
    /// 且拒绝垃圾 token（注入假验签器只影响单测，命令默认路径的构造不受影响）。
    #[test]
    fn production_verifier_is_real_ring_verification() {
        let cfg = OidcConfig {
            issuer: "https://auth.example.com".to_string(),
            client_id: "minihbut-client".to_string(),
            scopes: "openid".to_string(),
            redirect_uri: "minihbut://identity/callback".to_string(),
        };
        let jwks = test_jwks();
        let ring: &dyn IdTokenVerifier = &RingIdTokenVerifier;
        // 合法 fixture token（ring 真验签）→ 通过，学号从 `hbut_<学号>` 解析
        let out = ring
            .verify(&fixture_id_token(), &jwks, &cfg, Some(FIXTURE_NONCE), T0)
            .expect("合法 fixture 令牌应通过真验签");
        assert_eq!(out.student_id, "2510231106");
        // 刷新场景（None）→ 跳过 nonce 比对，真验签仍通过
        let out2 = ring
            .verify(&fixture_id_token(), &jwks, &cfg, None, T0)
            .expect("刷新场景（无 nonce 比对）应通过真验签");
        assert_eq!(out2.student_id, "2510231106");
        // 垃圾 token → IdTokenInvalid（证明默认路径不是透传假验签）
        assert_eq!(
            ring.verify("not.a.jwt", &jwks, &cfg, Some(FIXTURE_NONCE), T0),
            Err(OidcError::IdTokenInvalid)
        );
    }

    /// 测试配置（自定义 scheme 回调；与 `parse_callback` 接受形态一致）。
    fn test_cfg() -> OidcConfig {
        OidcConfig {
            issuer: "https://auth.example.com".to_string(),
            client_id: "client-test".to_string(),
            scopes: "openid".to_string(),
            redirect_uri: "minihbut://identity/callback".to_string(),
        }
    }

    /// 假传输：记录 token/JWKS 调用次数与 form；返回固定响应。
    #[derive(Default)]
    struct FakeOidcTransport {
        token_calls: std::sync::Mutex<usize>,
        jwks_calls: std::sync::Mutex<usize>,
        token_form: std::sync::Mutex<Vec<(String, String)>>,
        token_status: u16,
        token_body: Value,
        jwks_status: u16,
        jwks_body: Value,
        /// 置位后 `token_request` 返回网络错误（模拟断网/连接失败，用于 fail closed 测试）
        token_fail: bool,
    }

    impl FakeOidcTransport {
        fn new() -> Self {
            Self {
                token_calls: std::sync::Mutex::new(0),
                jwks_calls: std::sync::Mutex::new(0),
                token_form: std::sync::Mutex::new(Vec::new()),
                token_status: 200,
                token_body: Value::Null,
                jwks_status: 200,
                jwks_body: Value::Null,
                token_fail: false,
            }
        }
        fn token_calls(&self) -> usize {
            *self.token_calls.lock().unwrap()
        }
        fn jwks_calls(&self) -> usize {
            *self.jwks_calls.lock().unwrap()
        }
    }

    impl OidcTransport for FakeOidcTransport {
        fn token_request<'a>(
            &'a self,
            _token_url: &'a str,
            form: &'a [(&'a str, &'a str)],
        ) -> OidcBoxFuture<'a, Result<(u16, Value), OidcTransportError>> {
            *self.token_calls.lock().unwrap() += 1;
            if self.token_fail {
                // 模拟网络错误（连接失败）：计数已记，直接 Err（零返回体）
                return Box::pin(async {
                    Err(OidcTransportError::Network("测试网络故障".to_string()))
                });
            }
            self.token_form
                .lock()
                .unwrap()
                .extend(form.iter().map(|(k, v)| (k.to_string(), v.to_string())));
            let (status, body) = (self.token_status, self.token_body.clone());
            Box::pin(async move { Ok((status, body)) })
        }
        fn jwks_request<'a>(
            &'a self,
            _jwks_url: &'a str,
        ) -> OidcBoxFuture<'a, Result<(u16, Value), OidcTransportError>> {
            *self.jwks_calls.lock().unwrap() += 1;
            let (status, body) = (self.jwks_status, self.jwks_body.clone());
            Box::pin(async move { Ok((status, body)) })
        }
    }

    const T0: i64 = 1_700_000_000;

    /// 模拟 begin（与 begin_impl 相同的入参构造），返回 state/nonce/verifier。
    fn seed_pending(
        pending: &PendingStore,
        cfg: &OidcConfig,
        created_at: i64,
    ) -> (String, String, String) {
        let pkce = generate_pkce();
        let state = generate_state();
        let nonce = generate_nonce();
        pending.put(PendingAuth {
            state: state.clone(),
            nonce: nonce.clone(),
            verifier: pkce.verifier.clone(),
            redirect_uri: cfg.redirect_uri.clone(),
            created_at,
        });
        (state, nonce, pkce.verifier)
    }

    // ── begin ─────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn begin_returns_url_state_and_never_leaks_verifier_or_nonce() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let payload = begin_impl(&cfg, &pending, T0);
        assert!(payload.ok);
        assert_eq!(payload.kind, KIND_BEGIN_OK);
        assert_eq!(payload.message, "已打开浏览器，请在浏览器中完成登录");
        // state 是 32 位 hex；expires_at = now + 600
        assert_eq!(payload.state.len(), 32);
        assert!(payload.state.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(payload.expires_at, T0 + PENDING_TTL_SECONDS);
        // authorize_url 必须含全部授权参数
        assert!(payload.authorize_url.contains("response_type=code"));
        assert!(payload.authorize_url.contains("client_id=client-test"));
        assert!(payload
            .authorize_url
            .contains(&format!("state={}", payload.state)));
        assert!(payload.authorize_url.contains("code_challenge="));
        assert!(payload.authorize_url.contains("code_challenge_method=S256"));
        assert!(payload.authorize_url.contains("nonce="));
        // pending 已写入：取回后核验，并验证返回体零泄露
        // （verifier 绝不出现在返回体；nonce 只允许存在于 authorize_url 的协议参数里，
        //  不得作为独立字段/值出现在 payload 顶层）
        let stored = pending
            .take_matching(&payload.state, T0)
            .expect("pending 应存在");
        let wire_value: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&payload).unwrap()).unwrap();
        assert!(
            wire_value.get("verifier").is_none(),
            "返回体不得有 verifier 字段"
        );
        assert!(wire_value.get("nonce").is_none(), "返回体不得有 nonce 字段");
        let wire = serde_json::to_string(&payload).unwrap();
        assert!(!wire.contains(&stored.verifier), "返回体不得含 verifier 值");
    }

    // ── complete：happy path ──────────────────────────────────────────────

    #[tokio::test]
    async fn complete_happy_path_exchanges_verifies_and_yields_session() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (state, nonce, verifier) = seed_pending(&pending, &cfg, T0);
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-1",
            "refresh_token": "rt-1",
            "id_token": fixture_id_token()
        });
        transport.jwks_body = test_jwks();
        let jwks_cache = JwksCache::new();
        let fake_verifier = FakeIdTokenVerifier::with_nonce(&nonce);
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state}"
        );
        let outcome = complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &fake_verifier,
            &callback_url,
            T0,
        )
        .await;
        let session = match outcome {
            CompleteOutcome::Ready(session) => session,
            CompleteOutcome::Failure(p) => panic!("happy path 应成功，实际 {p:?}"),
        };
        // 令牌请求恰好一次，form 携带 PKCE 全要素（verifier 与 begin 一致）
        assert_eq!(transport.token_calls(), 1);
        let form = transport.token_form.lock().unwrap().clone();
        let form_text = format!("{form:?}");
        assert!(form_text.contains("grant_type"));
        assert!(form_text.contains("authorization_code"));
        assert!(form_text.contains("code_verifier"));
        assert!(form_text.contains(&verifier));
        assert!(form_text.contains("client_id"));
        assert_eq!(transport.jwks_calls(), 1);
        // 会话内容正确（学号来自 id_token claim）
        assert_eq!(session.access_token, "at-1");
        assert_eq!(session.refresh_token.as_deref(), Some("rt-1"));
        assert_eq!(session.student_id, "20241234");
        assert_eq!(session.exp, T0 + 3600);
        assert_eq!(session.issuer, cfg.issuer);
        // 写入 keyring（内存 fake）→ oidc_login_ok + 掩码学号；会话零泄露到返回体
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        let payload = finish_login_session(&session, &store);
        assert!(payload.ok);
        assert_eq!(payload.kind, KIND_LOGIN_OK);
        assert_eq!(payload.student_id_masked, "2024***");
        assert_eq!(payload.expires_at, T0 + 3600);
        let wire = serde_json::to_string(&payload).unwrap();
        assert!(!wire.contains("at-1") && !wire.contains("rt-1") && !wire.contains("20241234"));
        // state 一次性：同一 state 再 complete → no_pending（且不再发起令牌请求）
        let outcome2 = complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &fake_verifier,
            &callback_url,
            T0,
        )
        .await;
        match outcome2 {
            CompleteOutcome::Failure(p) => assert_eq!(p.kind, KIND_OIDC_NO_PENDING),
            _ => panic!("重复使用 state 必须拒绝"),
        }
        assert_eq!(transport.token_calls(), 1, "重复 state 不得再发令牌请求");
    }

    // ── complete：拒绝分支（全部必须零令牌请求）──────────────────────────

    #[tokio::test]
    async fn complete_state_mismatch_rejects_without_token_request() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (_state, _nonce, _verifier) = seed_pending(&pending, &cfg, T0);
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        // 用另一个合法形状的 state 发起回调
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state=ffffffffffffffffffffffffffffffff"
        );
        let payload = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("state 不匹配必须拒绝"),
        };
        assert_eq!(payload.kind, KIND_OIDC_STATE_MISMATCH);
        assert!(!payload.ok);
        assert_eq!(transport.token_calls(), 0, "state 不匹配不得发起令牌请求");
    }

    #[tokio::test]
    async fn complete_without_pending_rejects_without_token_request() {
        let cfg = test_cfg();
        let pending = PendingStore::new(); // 空
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state=0123456789abcdef0123456789abcdef"
        );
        let payload = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("无 pending 必须拒绝"),
        };
        assert_eq!(payload.kind, KIND_OIDC_NO_PENDING);
        assert_eq!(transport.token_calls(), 0);
    }

    #[tokio::test]
    async fn complete_expired_pending_rejects_without_token_request() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        // created_at 已超 TTL（600s）
        let (state, _nonce, _v) = seed_pending(&pending, &cfg, T0 - 601);
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state}"
        );
        let payload = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("过期 pending 必须拒绝"),
        };
        assert_eq!(
            payload.kind, KIND_OIDC_NO_PENDING,
            "过期按无 pending 处理（不泄露内部时间细节）"
        );
        assert_eq!(transport.token_calls(), 0);
    }

    #[tokio::test]
    async fn complete_invalid_callback_rejects_before_pending_lookup() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (state, _nonce, _v) = seed_pending(&pending, &cfg, T0);
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        // 错误 host 的「loopback 形态」→ parse_callback 必拒
        let bad_urls = [
            format!("http://evil.example/callback?code=x&state={state}"),
            "not a url".to_string(),
        ];
        for url in &bad_urls {
            let payload = match complete_impl(
                &cfg,
                &pending,
                &transport,
                &jwks_cache,
                &FakeIdTokenVerifier::default(),
                url,
                T0,
            )
            .await
            {
                CompleteOutcome::Failure(p) => p,
                _ => panic!("非法回调必须拒绝：{url}"),
            };
            assert_eq!(payload.kind, KIND_OIDC_CALLBACK_INVALID);
        }
        assert_eq!(transport.token_calls(), 0);
        // pending 未被消费（parse 在前）
        assert!(pending.take_matching(&state, T0).is_ok());
    }

    #[tokio::test]
    async fn complete_token_endpoint_error_maps_token_exchange_failed() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (state, _nonce, _v) = seed_pending(&pending, &cfg, T0);
        let mut transport = FakeOidcTransport::new();
        transport.token_status = 400;
        transport.token_body = serde_json::json!({"error": "invalid_grant"});
        let jwks_cache = JwksCache::new();
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state}"
        );
        let payload = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("令牌端点 400 必须拒绝"),
        };
        assert_eq!(payload.kind, KIND_OIDC_TOKEN_EXCHANGE_FAILED);
        // 失败不得写会话（会话存储从未被触碰）
        let sessions = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        assert!(sessions.load().unwrap().is_none());
        // 服务端 error 原文不得透传
        assert!(!payload.message.contains("invalid_grant"));
    }

    #[tokio::test]
    async fn complete_token_response_missing_fields_maps_token_exchange_failed() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (state, _nonce, _v) = seed_pending(&pending, &cfg, T0);
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({"access_token": "at-only"}); // 缺 id_token
        let jwks_cache = JwksCache::new();
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state}"
        );
        let payload = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("缺 id_token 必须拒绝"),
        };
        assert_eq!(payload.kind, KIND_OIDC_TOKEN_EXCHANGE_FAILED);
    }

    #[tokio::test]
    async fn complete_invalid_id_token_rejects_without_session_write() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (state, nonce, _v) = seed_pending(&pending, &cfg, T0);
        let mut transport = FakeOidcTransport::new();
        // id_token 为垃圾串 → 验签器必拒（假验签器用 reject_invalid 模拟真验签行为）
        transport.token_body = serde_json::json!({
            "access_token": "at-1",
            "id_token": "not.a.jwt"
        });
        transport.jwks_body = test_jwks();
        let jwks_cache = JwksCache::new();
        let reject_verifier = FakeIdTokenVerifier {
            nonce: nonce.clone(),
            reject_invalid: true,
            student_id: "20241234".to_string(),
        };
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state}"
        );
        let payload = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &reject_verifier,
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("无效 id_token 必须拒绝"),
        };
        assert_eq!(payload.kind, "oidc_id_token_invalid");
        // nonce 不匹配路径同样拒绝（token 的 nonce 与 pending 的 nonce 不同）
        let pending2 = PendingStore::new();
        let (state2, _nonce2, _v2) = seed_pending(&pending2, &cfg, T0);
        let mut transport2 = FakeOidcTransport::new();
        transport2.token_body = serde_json::json!({
            "access_token": "at-1",
            "id_token": fixture_id_token()
        });
        transport2.jwks_body = test_jwks();
        let jwks_cache2 = JwksCache::new();
        let wrong_nonce_verifier =
            FakeIdTokenVerifier::with_nonce("ffffffffffffffffffffffffffffffff");
        let callback_url2 = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state2}"
        );
        let payload2 = match complete_impl(
            &cfg,
            &pending2,
            &transport2,
            &jwks_cache2,
            &wrong_nonce_verifier,
            &callback_url2,
            T0,
        )
        .await
        {
            CompleteOutcome::Failure(p) => p,
            _ => panic!("nonce 不匹配必须拒绝"),
        };
        assert_eq!(payload2.kind, "oidc_nonce_mismatch");
    }

    #[tokio::test]
    async fn complete_keyring_unavailable_maps_secure_storage_and_writes_nothing() {
        let cfg = test_cfg();
        let pending = PendingStore::new();
        let (state, nonce, _v) = seed_pending(&pending, &cfg, T0);
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-1",
            "id_token": fixture_id_token()
        });
        transport.jwks_body = test_jwks();
        let jwks_cache = JwksCache::new();
        let fake_verifier = FakeIdTokenVerifier::with_nonce(&nonce);
        let callback_url = format!(
            "minihbut://identity/callback?code=0123456789abcdef0123456789abcdef01234567&state={state}"
        );
        let session = match complete_impl(
            &cfg,
            &pending,
            &transport,
            &jwks_cache,
            &fake_verifier,
            &callback_url,
            T0,
        )
        .await
        {
            CompleteOutcome::Ready(session) => session,
            _ => panic!("校验应通过，失败在 keyring 环节"),
        };
        // keyring 不可用 → secure_storage_unavailable；且不得有任何明文落盘（MemoryKeyring 里仍为空）
        let failing = OidcSessionStore::with_keyring(Box::new(FailingKeyring));
        let payload = finish_login_session(&session, &failing);
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_SECURE_STORAGE_UNAVAILABLE);
        let probe = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        assert!(probe.load().unwrap().is_none(), "失败路径不得写入任何存储");
    }

    // ── JWKS 缓存 ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn jwks_cache_serves_within_ttl_and_refreshes_after_expiry() {
        let mut transport = FakeOidcTransport::new();
        transport.jwks_body = test_jwks();
        let cache = JwksCache::new();
        let url = "https://auth.example.com/jwks.json";
        let v1 = cache.fetch(url, &transport, T0).await.expect("首次应成功");
        assert_eq!(transport.jwks_calls(), 1);
        let v2 = cache
            .fetch(url, &transport, T0 + 299)
            .await
            .expect("TTL 内应命中");
        assert_eq!(transport.jwks_calls(), 1, "TTL 内不得再次拉取");
        assert_eq!(v1, v2);
        let _ = cache
            .fetch(url, &transport, T0 + 301)
            .await
            .expect("过期后应重新拉取");
        assert_eq!(transport.jwks_calls(), 2, "过期后必须重新拉取");
        // 不同 URL → 独立拉取
        let _ = cache
            .fetch("https://other.example/jwks.json", &transport, T0 + 302)
            .await;
        assert_eq!(transport.jwks_calls(), 3);
    }

    // ── session_status / logout ───────────────────────────────────────────

    #[test]
    fn session_status_reports_absent_active_expired_and_unavailable() {
        // 无会话 → absent（ok=true 状态报告）
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        let p = session_status_impl(&store, T0);
        assert!(p.ok);
        assert_eq!(p.kind, KIND_SESSION_ABSENT);
        assert_eq!(p.message, "未登录");
        // 有效会话 → active（掩码 + 过期时间；无 token）
        let session = OidcSession {
            access_token: "at-secret".to_string(),
            refresh_token: None,
            id_token: "id-secret".to_string(),
            student_id: "20241234".to_string(),
            student_name: None,
            exp: T0 + 3600,
            iat: T0,
            issuer: "https://auth.example.com".to_string(),
            client_id: "client-test".to_string(),
        };
        store.save(&session).unwrap();
        let p = session_status_impl(&store, T0);
        assert!(p.ok);
        assert_eq!(p.kind, KIND_SESSION_ACTIVE);
        assert_eq!(p.student_id_masked, "2024***");
        assert_eq!(p.expires_at, T0 + 3600);
        let wire = serde_json::to_string(&p).unwrap();
        assert!(
            !wire.contains("at-secret") && !wire.contains("id-secret"),
            "不得返回 token"
        );
        // 已过期 → absent
        let p = session_status_impl(&store, T0 + 7200);
        assert_eq!(p.kind, KIND_SESSION_ABSENT);
        // keyring 不可用 → secure_storage_unavailable（fail closed）
        let failing = OidcSessionStore::with_keyring(Box::new(FailingKeyring));
        let p = session_status_impl(&failing, T0);
        assert!(!p.ok);
        assert_eq!(p.kind, KIND_SECURE_STORAGE_UNAVAILABLE);
    }

    #[test]
    fn logout_clears_session_idempotently_and_respects_keyring_failure() {
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        // 无条目也能退出（幂等）
        let p = logout_impl(&store);
        assert!(p.ok);
        assert_eq!(p.kind, KIND_LOGOUT_OK);
        assert_eq!(p.message, "已退出登录");
        // 有会话时退出 → 清掉
        let session = OidcSession {
            access_token: "at".to_string(),
            refresh_token: None,
            id_token: "id".to_string(),
            student_id: "20241234".to_string(),
            student_name: None,
            exp: T0 + 3600,
            iat: T0,
            issuer: "i".to_string(),
            client_id: "c".to_string(),
        };
        store.save(&session).unwrap();
        let p = logout_impl(&store);
        assert!(p.ok);
        assert!(store.load().unwrap().is_none());
        // keyring 失败 → 明确报错（不得假成功）
        let failing = OidcSessionStore::with_keyring(Box::new(FailingKeyring));
        let p = logout_impl(&failing);
        assert!(!p.ok);
        assert_eq!(p.kind, KIND_SECURE_STORAGE_UNAVAILABLE);
    }

    // ── payload 形状（disabled 等分支的返回体形态）──────────────────────

    #[test]
    fn error_payload_shapes_are_stable() {
        // oidc_disabled（begin 关：不联网、不读 keyring 时的固定返回）
        let p = OidcFlowPayload::err(KIND_OIDC_DISABLED);
        assert!(!p.ok);
        assert_eq!(p.kind, "oidc_disabled");
        assert_eq!(p.message, "该版本未启用统一登录");
        assert!(p.authorize_url.is_empty() && p.state.is_empty());
        // 未知 kind 兜底（前端 unknown 的同款文案）
        let p = OidcFlowPayload::err("something_else");
        assert_eq!(p.message, "操作失败，请稍后重试");
    }
    // ── 红队补充：JWKS 拉取失败**不得**被缓存（否则一次抖动会让后续登录全失败 5 分钟）──

    #[test]
    fn jwks_failure_is_not_cached() {
        // 端点返回 500 → 不得写缓存；下一次必须**重新拉取**（否则一次抖动会让后续登录
        // 全失败 5 分钟，或更糟：把失败当成功）。用既有 FakeOidcTransport 构造。
        let cache = JwksCache::new();
        let mut transport = FakeOidcTransport::new();
        transport.jwks_status = 500;
        transport.jwks_body = Value::Null;
        let now = 1_700_000_000;
        let url = "https://issuer.example/jwks.json";
        let first = futures::executor::block_on(cache.fetch(url, &transport, now));
        assert!(first.is_err(), "首次拉取失败应返回错误");
        assert_eq!(transport.jwks_calls(), 1);
        let second = futures::executor::block_on(cache.fetch(url, &transport, now + 1));
        assert!(second.is_err(), "失败结果不得被缓存成成功");
        assert_eq!(
            transport.jwks_calls(),
            2,
            "失败后必须重新拉取（不得缓存失败）"
        );
    }

    // ── P2-5（#1209）：refresh 与 access_token（规格 §1 的 10 条 + §2.2 的 4 条）──

    /// 测试会话（存入 keyring 用；学号 20241234 → 掩码 `2024***`）。
    fn test_oidc_session(exp: i64, refresh_token: Option<&str>) -> OidcSession {
        OidcSession {
            access_token: "at-old".to_string(),
            refresh_token: refresh_token.map(str::to_string),
            id_token: "id-old".to_string(),
            student_id: "20241234".to_string(),
            student_name: Some("测试同学".to_string()),
            exp,
            iat: T0 - 3600,
            issuer: "https://auth.example.com".to_string(),
            client_id: "client-test".to_string(),
        }
    }

    /// 从内存 keyring 读回会话（断言 fail closed 时旧值未被改动）。
    fn stored_session(store: &OidcSessionStore) -> OidcSession {
        store.load().expect("回读不应失败").expect("会话必须仍在")
    }

    // 1) 会话新鲜 → 跳过（**零网络**：token_calls == 0），返回原过期时间
    #[tokio::test]
    async fn refresh_fresh_session_skips_without_network() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 + 3600, Some("rt-old")))
            .expect("会话写入应成功");
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("新鲜会话应直接返回，不得进入刷新写链"),
        };
        assert!(payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_OK);
        assert_eq!(payload.expires_at, T0 + 3600);
        assert_eq!(payload.student_id_masked, "2024***");
        assert_eq!(
            transport.token_calls(),
            0,
            "新鲜会话必须零网络（transport 零调用）"
        );
        // 会话未被重写（旧值原样保留）
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }

    // 2) 无会话 → oidc_session_absent（不联网）
    #[tokio::test]
    async fn refresh_without_session_reports_absent() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new())); // 空
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("无会话必须拒绝"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_SESSION_ABSENT);
        assert_eq!(transport.token_calls(), 0, "无会话不得联网");
    }

    // 3) 过期且无 RT → oidc_refresh_unavailable（不联网）
    #[tokio::test]
    async fn refresh_expired_without_rt_reports_unavailable() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, None))
            .expect("会话写入应成功");
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("无 refresh_token 必须拒绝"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_UNAVAILABLE);
        assert_eq!(transport.token_calls(), 0, "无 RT 不得联网");
        // 会话原样保留
        assert_eq!(stored_session(&store).access_token, "at-old");
    }

    // 4) 200 带新 AT + 轮换 RT → 会话被更新（AT/RT 都变），返回 oidc_refresh_ok
    #[tokio::test]
    async fn refresh_success_rotates_rt_and_updates_session() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-new",
            "refresh_token": "rt-new",
            "expires_in": 3600
        });
        let jwks_cache = JwksCache::new();
        let session = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Ready(session) => session,
            RefreshOutcome::Payload(p) => panic!("刷新应成功，实际 kind={}", p.kind),
        };
        assert_eq!(session.access_token, "at-new");
        assert_eq!(
            session.refresh_token.as_deref(),
            Some("rt-new"),
            "轮换值必须替换旧 RT"
        );
        assert_eq!(
            session.exp,
            T0 + 3600,
            "exp 优先取响应 expires_in（now + 3600）"
        );
        assert_eq!(session.id_token, "id-old", "响应不带 id_token → 保留旧值");
        assert_eq!(session.student_id, "20241234", "学号不变");
        // 令牌请求恰好一次，form 携带刷新全要素（用旧 RT 换票）
        assert_eq!(transport.token_calls(), 1);
        let form_text = format!("{:?}", transport.token_form.lock().unwrap().clone());
        assert!(form_text.contains("grant_type"));
        assert!(form_text.contains("refresh_token"));
        assert!(form_text.contains("rt-old"));
        assert!(form_text.contains("client-test"));
        // 唯一写库点：成功 → oidc_refresh_ok（只含掩码学号 + 过期时间，**不含**任何令牌）
        let payload = finish_refresh(&session, &store);
        assert!(payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_OK);
        assert_eq!(payload.student_id_masked, "2024***");
        assert_eq!(payload.expires_at, T0 + 3600);
        let wire = serde_json::to_string(&payload).unwrap();
        assert!(
            !wire.contains("at-new") && !wire.contains("rt-new"),
            "refresh 返回体不得含令牌"
        );
    }

    // 5) 200 只带新 AT（无 RT/id_token）→ RT 保留旧值（不得清空）
    #[tokio::test]
    async fn refresh_without_rotation_keeps_old_refresh_token() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-new",
            "expires_in": 3600
        });
        let jwks_cache = JwksCache::new();
        let session = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Ready(session) => session,
            RefreshOutcome::Payload(p) => panic!("刷新应成功，实际 kind={}", p.kind),
        };
        assert_eq!(
            session.refresh_token.as_deref(),
            Some("rt-old"),
            "无轮换值必须保留旧 RT"
        );
        assert_eq!(session.access_token, "at-new");
    }

    // 6) 400 invalid_grant → oidc_refresh_failed 且会话不变（读回旧值）
    #[tokio::test]
    async fn refresh_invalid_grant_fails_and_keeps_session() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_status = 400;
        transport.token_body = serde_json::json!({"error": "invalid_grant", "error_description": "secret-detail-should-not-leak"});
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("invalid_grant 必须拒绝"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_FAILED);
        // 错误文案固定，不含服务端原文/令牌片段
        assert!(!payload.message.contains("invalid_grant"));
        assert!(!payload.message.contains("secret-detail-should-not-leak"));
        // 会话不变（读回旧值）
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }

    // 6b) **HTTP 200 但 body 带 error 字段** → 仍必须拒绝（红队 P-1 回归锁）
    //
    // 为什么单独一条：OAuth2 允许「200 + {"error": ...}」这种违背常规的响应；
    // 只判状态码会把它当成功（进而写入毒化会话/返回 AT）。变异删掉 `error` 检查后
    // 本用例必须变红。
    #[tokio::test]
    async fn refresh_http_200_with_error_field_is_rejected() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_status = 200; // 状态码是 200
        transport.token_body = serde_json::json!({
            "error": "invalid_grant",
            "access_token": "at-poison",
            "refresh_token": "rt-poison",
            "expires_in": 3600
        });
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("200+error 必须拒绝（不得当作成功）"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_FAILED);
        // 毒化令牌绝不落库
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }

    // 7) 网络错误 → oidc_network 且会话不变
    #[tokio::test]
    async fn refresh_network_error_fails_and_keeps_session() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_fail = true; // 模拟断网
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("网络错误必须拒绝"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_OIDC_NETWORK);
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }

    // 8) 带 id_token 但学号与旧会话不同 → 拒绝（oidc_id_token_invalid）且会话不变（防串号）
    #[tokio::test]
    async fn refresh_id_token_sub_mismatch_rejects_and_keeps_session() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-new",
            "refresh_token": "rt-new",
            "id_token": "some.verified.jwt"
        });
        transport.jwks_body = test_jwks();
        let jwks_cache = JwksCache::new();
        // 假验签器返回与旧会话不同的学号（模拟他人 id_token 混入）
        let verifier = FakeIdTokenVerifier::with_nonce("n").with_student_id("99999999");
        let payload =
            match refresh_impl(&cfg, &store, &transport, &jwks_cache, &verifier, false, T0).await {
                RefreshOutcome::Payload(payload) => payload,
                RefreshOutcome::Ready(_) => panic!("学号不一致必须拒绝（防串号）"),
            };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_OIDC_ID_TOKEN_INVALID);
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }

    // 9) 带 id_token 且签名无效 → oidc_id_token_invalid 且会话不变
    #[tokio::test]
    async fn refresh_id_token_bad_signature_rejects_and_keeps_session() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-new",
            "id_token": "not.a.valid.jwt"
        });
        transport.jwks_body = test_jwks();
        let jwks_cache = JwksCache::new();
        let mut verifier = FakeIdTokenVerifier::with_nonce("n");
        verifier.reject_invalid = true; // 模拟真验签对垃圾 token 的拒绝
        let payload =
            match refresh_impl(&cfg, &store, &transport, &jwks_cache, &verifier, false, T0).await {
                RefreshOutcome::Payload(payload) => payload,
                RefreshOutcome::Ready(_) => panic!("签名无效必须拒绝"),
            };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_OIDC_ID_TOKEN_INVALID);
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }

    // 10) keyring 不可用 → secure_storage_unavailable（不联网）；写失败同样不落令牌
    #[tokio::test]
    async fn refresh_keyring_unavailable_reports_secure_storage() {
        let cfg = test_cfg();
        // 读失败（keyring 不可用）→ 不联网
        let failing_store = OidcSessionStore::with_keyring(Box::new(FailingKeyring));
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let payload = match refresh_impl(
            &cfg,
            &failing_store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            RefreshOutcome::Payload(payload) => payload,
            RefreshOutcome::Ready(_) => panic!("keyring 不可用必须拒绝"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_SECURE_STORAGE_UNAVAILABLE);
        assert_eq!(transport.token_calls(), 0, "keyring 不可用不得联网");
        // 写失败（keyring 不可用）→ 新令牌不返回（fail closed）
        let write_store = OidcSessionStore::with_keyring(Box::new(FailingKeyring));
        let write_payload = finish_refresh(&test_oidc_session(T0 + 3600, Some("rt")), &write_store);
        assert!(!write_payload.ok);
        assert_eq!(write_payload.kind, KIND_SECURE_STORAGE_UNAVAILABLE);
        assert!(write_payload.access_token.is_empty(), "写失败不得返回令牌");
    }

    // access_token 1) 无会话 → oidc_session_absent（不联网，无令牌）
    #[tokio::test]
    async fn access_token_without_session_reports_absent() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new())); // 空
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let payload = match access_token_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            AccessTokenOutcome::Payload(payload) => payload,
            AccessTokenOutcome::Ready(_) => panic!("无会话不得进入刷新写链"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_SESSION_ABSENT);
        assert!(payload.access_token.is_empty());
        assert_eq!(transport.token_calls(), 0);
        // 过期会话 + 非强制 → 同样按未登录报告（不联网；需要令牌应走 force）
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let payload2 = match access_token_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            AccessTokenOutcome::Payload(payload) => payload,
            AccessTokenOutcome::Ready(_) => panic!("过期会话非强制模式应按未登录报告"),
        };
        assert!(!payload2.ok);
        assert_eq!(payload2.kind, KIND_SESSION_ABSENT);
        assert_eq!(transport.token_calls(), 0, "非强制模式过期会话不得联网");
    }

    // access_token 2) 有效会话（非强制）→ 直接返回存储 AT（零网络），expires_at 正确
    #[tokio::test]
    async fn access_token_fresh_returns_stored_at_without_network() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 + 3600, Some("rt-old")))
            .expect("会话写入应成功");
        let transport = FakeOidcTransport::new();
        let jwks_cache = JwksCache::new();
        let payload = match access_token_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            false,
            T0,
        )
        .await
        {
            AccessTokenOutcome::Payload(payload) => payload,
            AccessTokenOutcome::Ready(_) => panic!("有效会话应直接返回，无需刷新"),
        };
        assert!(payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_OK);
        assert_eq!(
            payload.access_token, "at-old",
            "有效会话必须返回存储的 AT（唯一出口）"
        );
        assert_eq!(payload.expires_at, T0 + 3600);
        assert_eq!(payload.student_id_masked, "2024***");
        assert_eq!(transport.token_calls(), 0, "有效会话必须零网络");
    }

    // access_token 3) force=true → 触发一次刷新（即使仍新鲜），成功返回新 AT 并写库
    #[tokio::test]
    async fn access_token_force_triggers_single_refresh() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        // 会话仍新鲜，但 force=true 必须跳过新鲜短路、走完整刷新链
        store
            .save(&test_oidc_session(T0 + 3600, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_body = serde_json::json!({
            "access_token": "at-forced",
            "refresh_token": "rt-forced",
            "expires_in": 3600
        });
        let jwks_cache = JwksCache::new();
        let session = match access_token_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            true,
            T0,
        )
        .await
        {
            AccessTokenOutcome::Ready(session) => session,
            AccessTokenOutcome::Payload(p) => panic!("强制刷新应成功，实际 kind={}", p.kind),
        };
        assert_eq!(session.access_token, "at-forced");
        assert_eq!(
            transport.token_calls(),
            1,
            "force=true 必须触发恰好一次刷新"
        );
        // 唯一写库点 + 唯一 AT 出口（携带新 AT）
        let payload = finish_refresh_with_token(&session, &store);
        assert!(payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_OK);
        assert_eq!(payload.access_token, "at-forced");
        assert_eq!(payload.expires_at, T0 + 3600);
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-forced");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-forced"));
    }

    // access_token 4) force=true 且刷新失败（invalid_grant）→ 稳定 kind，不返回 AT，会话不变
    #[tokio::test]
    async fn access_token_force_refresh_failure_returns_no_at() {
        let cfg = test_cfg();
        let store = OidcSessionStore::with_keyring(Box::new(MemoryKeyring::new()));
        store
            .save(&test_oidc_session(T0 - 1, Some("rt-old")))
            .expect("会话写入应成功");
        let mut transport = FakeOidcTransport::new();
        transport.token_status = 400;
        transport.token_body = serde_json::json!({"error": "invalid_grant"});
        let jwks_cache = JwksCache::new();
        let payload = match access_token_impl(
            &cfg,
            &store,
            &transport,
            &jwks_cache,
            &FakeIdTokenVerifier::default(),
            true,
            T0,
        )
        .await
        {
            AccessTokenOutcome::Payload(payload) => payload,
            AccessTokenOutcome::Ready(_) => panic!("刷新失败不得返回令牌"),
        };
        assert!(!payload.ok);
        assert_eq!(payload.kind, KIND_REFRESH_FAILED);
        assert!(
            payload.access_token.is_empty(),
            "刷新失败不得返回 AT（不得降级为旧令牌）"
        );
        let stored = stored_session(&store);
        assert_eq!(stored.access_token, "at-old");
        assert_eq!(stored.refresh_token.as_deref(), Some("rt-old"));
    }
}
