//! goal-20 T05：「用 Mini-HBUT 登录」客户端流程单测（假传输，不联网、不碰 keyring）。
#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::collections::VecDeque;
use std::sync::Mutex;

use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};

use crate::identity::device_key::DeviceKey;
use crate::identity::v2_service_client::{BoxFuture, TransportError, V2Transport};

use super::flow::*;
use super::login::*;

type Reply = Result<(u16, Value), TransportError>;

struct FakeTransport {
    replies: Mutex<VecDeque<Reply>>,
    requests: Mutex<Vec<(String, Value)>>,
}

impl FakeTransport {
    fn new(replies: Vec<Reply>) -> Self {
        Self {
            replies: Mutex::new(replies.into()),
            requests: Mutex::new(Vec::new()),
        }
    }

    fn requests(&self) -> Vec<(String, Value)> {
        self.requests.lock().unwrap().clone()
    }

    fn paths(&self) -> Vec<String> {
        self.requests().into_iter().map(|(p, _)| p).collect()
    }
}

impl V2Transport for FakeTransport {
    fn post_json<'a>(&'a self, path: &'a str, body: Value) -> BoxFuture<'a, Reply> {
        self.requests.lock().unwrap().push((path.to_string(), body));
        let next = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_else(|| Err(TransportError::Network("脚本已用完".to_string())));
        Box::pin(async move { next })
    }
}

const SID: &str = "9900000101";
const REQUEST_ID: &str = "slr_AAAAAAAAAAAAAAAAAAAAAA";
const CODE: &str = "BBBBBBBBBBBBBBBBBBBBBB";
const NONCE_A: &str = "0123456789abcdef0123456789abcdef";
const NONCE_B: &str = "fedcba9876543210fedcba9876543210";
const COOKIE: &str = "JSESSIONID=abc123; route=r1";
const TS: i64 = 1_800_000_000;

fn key() -> DeviceKey {
    DeviceKey::from_seed([7u8; 32])
}

fn now() -> i64 {
    TS
}

fn input(cookie: &str) -> VerifyInput {
    VerifyInput {
        student_id: SID.to_string(),
        student_name: "登录同学".to_string(),
        campus_cookie: cookie.to_string(),
    }
}

fn nonce_ok(nonce: &str) -> Reply {
    Ok((200, json!({"ok": true, "nonce": nonce, "expires_in": 300})))
}

fn verify_ok(status: &str) -> Reply {
    Ok((
        200,
        json!({"ok": true, "status": status, "student_id_masked": "9900***",
               "verified_at": 1_799_990_000, "reuse_until": 1_815_542_000, "casdoor": "disabled"}),
    ))
}

fn reject(code: u16, reason: &str) -> Reply {
    Ok((code, json!({"ok": false, "reason": reason})))
}

fn approved() -> Reply {
    Ok((
        200,
        json!({"ok": true, "status": "approved", "student_id_masked": "9900***"}),
    ))
}

fn approve(
    transport: &FakeTransport,
    cookie: &str,
    request_id: &str,
    code: &str,
) -> SchoolLoginApproval {
    tauri::async_runtime::block_on(run_school_login_approve(
        transport,
        &key(),
        &input(cookie),
        request_id,
        code,
        &now,
    ))
}

fn approve_path() -> String {
    format!("{LOGIN_REQUESTS_PATH}/{REQUEST_ID}/approve")
}

/// 按服务端的方式重建 canonical（request_id 取自 URL 路径）并验签。
fn assert_login_signature(path: &str, body: &Value) {
    let request_id = path
        .strip_prefix(&format!("{LOGIN_REQUESTS_PATH}/"))
        .and_then(|rest| rest.strip_suffix("/approve"))
        .unwrap();
    let s = |k: &str| body[k].as_str().unwrap().to_string();
    let canonical = build_login_canonical(
        request_id,
        &s("code"),
        &s("device_id"),
        &s("student_id"),
        body["ts"].as_i64().unwrap(),
    );
    let raw = general_purpose::URL_SAFE_NO_PAD
        .decode(s("signature"))
        .unwrap();
    let sig: [u8; 64] = raw.try_into().unwrap();
    let jwk: Value = serde_json::from_str(&s("public_key_jwk")).unwrap();
    DeviceKey::verify_with_public_key(jwk["x"].as_str().unwrap(), canonical.as_bytes(), &sig)
        .unwrap();
    assert_eq!(body["alg"], "Ed25519");
}

// ── 跨仓 golden ──────────────────────────────────────────────────────────────────────
//
// `golden_login_v1_approve.json` 由**服务端侧的独立实现**（Python cryptography）生成；
// student-auth 仓 `tests/fixtures/client_golden_login_v1_approve.json` 是同一份文件，并在那边原样验签。

const GOLDEN: &str = include_str!("golden_login_v1_approve.json");

#[test]
fn golden_approval_body_matches_the_cross_repo_fixture() {
    let golden: Value = serde_json::from_str(GOLDEN).unwrap();
    let expected = &golden["request"];
    let key = key();
    let device_id = device_id_for_key(&key);
    assert_eq!(device_id, expected["device_id"].as_str().unwrap());
    let request_id = golden["request_id"].as_str().unwrap();
    let code = expected["code"].as_str().unwrap();
    let sid = expected["student_id"].as_str().unwrap();
    let ts = expected["ts"].as_i64().unwrap();
    assert_eq!(
        build_login_canonical(request_id, code, &device_id, sid, ts),
        golden["canonical"].as_str().unwrap()
    );
    let body = sign_login_approval(&key, request_id, code, &device_id, sid, ts).unwrap();
    assert_eq!(&body, expected, "批准请求体必须与服务端独立实现逐字段相等");
}

#[test]
fn login_prefix_differs_from_school_verify_canonical() {
    assert_eq!(LOGIN_CANONICAL_PREFIX, "login-v1");
    assert_ne!(
        LOGIN_CANONICAL_PREFIX,
        crate::identity::v2_signature::V2_CANONICAL_VERSION
    );
}

// ── 形状 ─────────────────────────────────────────────────────────────────────────────

#[test]
fn request_id_and_code_shapes_follow_the_contract() {
    assert!(is_valid_request_id(REQUEST_ID));
    assert!(is_valid_code(CODE));
    for bad in [
        "slr_short",
        "xyz_AAAAAAAAAAAAAAAAAAAAAA",
        "slr_AAAAAAAAAAAAAAAAAAAA/A",
        "slr_AAAAAAAAAAAAAAAAAAAAAAA",
        "",
    ] {
        assert!(!is_valid_request_id(bad), "{bad}");
    }
    for bad in [
        "B",
        "BBBBBBBBBBBBBBBBBBBBB|",
        "BBBBBBBBBBBBBBBBBBBBBBB",
        "BBBBBBBBBBB BBBBBBBBBB",
    ] {
        assert!(!is_valid_code(bad), "{bad}");
    }
    assert!(
        sign_login_approval(&key(), REQUEST_ID, CODE, "mhsv-ok-device-01", "12345", TS).is_none()
    );
}

#[test]
fn invalid_link_never_touches_the_network() {
    let transport = FakeTransport::new(vec![]);
    let approval = approve(&transport, COOKIE, "slr_bad", CODE);
    assert_eq!(
        (approval.ok, approval.reason.as_deref()),
        (false, Some(REASON_INVALID_LINK))
    );
    let detail = tauri::async_runtime::block_on(fetch_login_detail(&transport, REQUEST_ID, "bad"));
    assert_eq!(detail.reason.as_deref(), Some(REASON_INVALID_LINK));
    let denial = tauri::async_runtime::block_on(run_school_login_deny(&transport, "x", CODE));
    assert_eq!(denial.reason.as_deref(), Some(REASON_INVALID_LINK));
    assert!(transport.requests().is_empty());
}

// ── 批准编排 ─────────────────────────────────────────────────────────────────────────

#[test]
fn reuse_path_verifies_then_signs_and_approves_without_sending_cookie() {
    let transport = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        verify_ok(STATUS_REUSED),
        approved(),
    ]);
    let approval = approve(&transport, COOKIE, REQUEST_ID, CODE);
    assert!(approval.ok, "{approval:?}");
    assert_eq!(approval.status, LOGIN_STATUS_APPROVED);
    assert_eq!(approval.student_id_masked.as_deref(), Some("9900***"));
    let verify = approval.verify.as_ref().unwrap();
    assert_eq!(
        (verify.status.as_str(), verify.cookie_sent),
        (STATUS_REUSED, false)
    );
    let requests = transport.requests();
    assert_eq!(
        transport.paths(),
        vec![
            NONCE_PATH.to_string(),
            VERIFY_PATH.to_string(),
            approve_path()
        ]
    );
    assert!(
        requests[1].1.get("campus_cookie").is_none(),
        "复用路径不发 cookie"
    );
    let (path, body) = &requests[2];
    assert_login_signature(path, body);
    assert_eq!(body["code"], CODE);
    assert_eq!(body["student_id"], SID);
    assert!(
        body.get("campus_cookie").is_none(),
        "批准请求体永远不带 cookie"
    );
}

#[test]
fn first_time_device_verifies_with_cookie_then_approves() {
    let transport = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
        nonce_ok(NONCE_B),
        verify_ok(STATUS_VERIFIED),
        approved(),
    ]);
    let approval = approve(&transport, COOKIE, REQUEST_ID, CODE);
    assert!(approval.ok, "{approval:?}");
    let verify = approval.verify.as_ref().unwrap();
    assert_eq!(
        (verify.status.as_str(), verify.cookie_sent),
        (STATUS_VERIFIED, true)
    );
    let requests = transport.requests();
    assert_eq!(requests.len(), 5);
    assert_eq!(requests[3].1["campus_cookie"], COOKIE);
    assert_login_signature(&requests[4].0, &requests[4].1);
}

#[test]
fn failed_school_verification_blocks_the_approval() {
    let transport = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
        nonce_ok(NONCE_B),
        reject(403, "landed_on_login_page"),
    ]);
    let approval = approve(&transport, COOKIE, REQUEST_ID, CODE);
    assert!(!approval.ok);
    assert_eq!(
        approval.reason.as_deref(),
        Some(REASON_SCHOOL_VERIFY_FAILED)
    );
    assert_eq!(approval.http_status, Some(403));
    assert_eq!(
        approval.verify.as_ref().unwrap().reason.as_deref(),
        Some("landed_on_login_page")
    );
    assert!(
        !transport.paths().contains(&approve_path()),
        "核验失败不得发批准请求"
    );
}

#[test]
fn no_cookie_for_a_new_device_fails_before_approval() {
    let transport = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
    ]);
    let approval = approve(&transport, "", REQUEST_ID, CODE);
    assert_eq!(
        approval.reason.as_deref(),
        Some(REASON_SCHOOL_VERIFY_FAILED)
    );
    assert_eq!(
        approval.verify.as_ref().unwrap().reason.as_deref(),
        Some(REASON_CAMPUS_COOKIE_REQUIRED)
    );
    assert_eq!(transport.requests().len(), 2);
}

#[test]
fn server_rejections_are_mapped_to_stable_reasons() {
    for (code, reason) in [
        (409, "request_not_pending"),
        (410, "request_expired"),
        (403, "device_not_verified"),
        (403, "code_invalid"),
        (429, "rate_limited"),
    ] {
        let transport = FakeTransport::new(vec![
            nonce_ok(NONCE_A),
            verify_ok(STATUS_REUSED),
            reject(code, reason),
        ]);
        let approval = approve(&transport, COOKIE, REQUEST_ID, CODE);
        assert_eq!(
            (
                approval.ok,
                approval.reason.as_deref(),
                approval.http_status
            ),
            (false, Some(reason), Some(code))
        );
        assert!(approval.verify.as_ref().unwrap().ok);
    }
    let weird = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        verify_ok(STATUS_REUSED),
        reject(400, "Bad <script>"),
    ]);
    assert_eq!(
        approve(&weird, COOKIE, REQUEST_ID, CODE).reason.as_deref(),
        Some(REASON_UNKNOWN)
    );
    let odd_ok = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        verify_ok(STATUS_REUSED),
        Ok((200, json!({"ok": true, "status": "pending"}))),
    ]);
    assert_eq!(
        approve(&odd_ok, COOKIE, REQUEST_ID, CODE).reason.as_deref(),
        Some(REASON_BAD_RESPONSE)
    );
}

#[test]
fn network_failure_during_approval_is_reported() {
    let transport = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        verify_ok(STATUS_REUSED),
        Err(TransportError::Network("boom".to_string())),
    ]);
    let approval = approve(&transport, COOKIE, REQUEST_ID, CODE);
    assert_eq!(approval.reason.as_deref(), Some(REASON_NETWORK_ERROR));
}

#[test]
fn results_and_audit_never_contain_code_signature_or_cookie() {
    let transport = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        verify_ok(STATUS_REUSED),
        approved(),
    ]);
    let approval = approve(&transport, COOKIE, REQUEST_ID, CODE);
    let signature = transport.requests()[2].1["signature"]
        .as_str()
        .unwrap()
        .to_string();
    let serialized = serde_json::to_string(&approval).unwrap() + &approval.audit_line();
    for secret in [CODE, signature.as_str(), "JSESSIONID", SID] {
        assert!(!serialized.contains(secret), "{secret}");
    }
    assert_eq!(short_request_id(REQUEST_ID), "slr_AAAA…");
}

// ── detail / deny ────────────────────────────────────────────────────────────────────

#[test]
fn detail_returns_only_known_public_fields() {
    let transport = FakeTransport::new(vec![Ok((
        200,
        json!({"ok": true, "status": "pending", "expires_in": 999_999,
               "client": {"name": "Mini-HBUT 新认证测试应用\u{0007}"},
               "shared_fields": ["student_id", "verified_at", "approved_at", "device_id", "student_name"]}),
    ))]);
    let detail = tauri::async_runtime::block_on(fetch_login_detail(&transport, REQUEST_ID, CODE));
    assert!(detail.ok, "{detail:?}");
    assert_eq!(
        detail.client_name.as_deref(),
        Some("Mini-HBUT 新认证测试应用")
    );
    assert_eq!(
        detail.shared_fields,
        vec!["student_id", "verified_at", "approved_at", "device_id"]
    );
    assert_eq!(detail.expires_in, Some(3600));
    let (path, body) = &transport.requests()[0];
    assert_eq!(path, &format!("{LOGIN_REQUESTS_PATH}/{REQUEST_ID}/detail"));
    assert_eq!(body, &json!({"code": CODE}));
}

#[test]
fn detail_failures_are_mapped() {
    let gone = FakeTransport::new(vec![reject(404, "request_not_found")]);
    let detail = tauri::async_runtime::block_on(fetch_login_detail(&gone, REQUEST_ID, CODE));
    assert_eq!(
        (detail.reason.as_deref(), detail.http_status),
        (Some("request_not_found"), Some(404))
    );
    let odd = FakeTransport::new(vec![Ok((200, json!({"ok": true, "status": "approved"})))]);
    let detail = tauri::async_runtime::block_on(fetch_login_detail(&odd, REQUEST_ID, CODE));
    assert_eq!(detail.reason.as_deref(), Some(REASON_BAD_RESPONSE));
    let offline = FakeTransport::new(vec![Err(TransportError::Decode("x".to_string()))]);
    let detail = tauri::async_runtime::block_on(fetch_login_detail(&offline, REQUEST_ID, CODE));
    assert_eq!(detail.reason.as_deref(), Some(REASON_BAD_RESPONSE));
}

#[test]
fn deny_posts_only_the_code() {
    let transport = FakeTransport::new(vec![Ok((200, json!({"ok": true, "status": "denied"})))]);
    let denial =
        tauri::async_runtime::block_on(run_school_login_deny(&transport, REQUEST_ID, CODE));
    assert!(denial.ok && denial.status == LOGIN_STATUS_DENIED);
    assert_eq!(
        transport.requests()[0],
        (
            format!("{LOGIN_REQUESTS_PATH}/{REQUEST_ID}/deny"),
            json!({"code": CODE})
        )
    );
    let wrong = FakeTransport::new(vec![reject(403, "code_invalid")]);
    let denial = tauri::async_runtime::block_on(run_school_login_deny(&wrong, REQUEST_ID, CODE));
    assert_eq!(
        (denial.ok, denial.reason.as_deref()),
        (false, Some("code_invalid"))
    );
}

#[test]
fn unsupported_results_are_explicit() {
    assert_eq!(
        SchoolLoginApproval::unsupported().status,
        LOGIN_STATUS_UNSUPPORTED
    );
    assert_eq!(
        SchoolLoginDetail::unsupported().reason.as_deref(),
        Some(REASON_UNSUPPORTED_PLATFORM)
    );
    assert_eq!(
        SchoolLoginDenial::unsupported().status,
        LOGIN_STATUS_UNSUPPORTED
    );
    assert!(!platform_supports_device_signing("android"));
}
