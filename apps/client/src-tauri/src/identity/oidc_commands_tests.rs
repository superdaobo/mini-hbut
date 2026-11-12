// P2-6/检查 5 治理：`oidc_commands` 的单测从主文件拆出（god-file 门槛 1800 行）。
//
// 为什么单独成文件：主文件在 P2-4/P2-5 后达 2351 行，触发 `check_god_files.mjs --strict`
// （rust 上限 1800，债务登记为空）。拆出测试后主文件 ~1000 行、本文件 <1800。
//
// 注意：本文件是 `oidc_commands` 的**子模块**，`super::` / `use super::*` 语义与拆出前一致。

#![allow(clippy::unwrap_used, clippy::expect_used)]
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
    let wrong_nonce_verifier = FakeIdTokenVerifier::with_nonce("ffffffffffffffffffffffffffffffff");
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
