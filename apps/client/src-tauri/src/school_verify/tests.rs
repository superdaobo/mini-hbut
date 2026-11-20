//! goal-18 T04：学号核验客户端流程单测（假传输，不联网、不碰 keyring）。
#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::collections::VecDeque;
use std::sync::Mutex;

use serde_json::{json, Value};

use crate::identity::device_key::DeviceKey;
use crate::identity::errors::IdentityError;
use crate::identity::v2_service_client::{BoxFuture, TransportError, V2Transport};
use crate::identity::v2_signature::{verify_v2_proof, V2Proof};

use super::flow::*;

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

const SID: &str = "2510231106";
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
        student_name: "张三".to_string(),
        campus_cookie: cookie.to_string(),
    }
}

fn nonce_ok(nonce: &str) -> Reply {
    Ok((200, json!({"ok": true, "nonce": nonce, "expires_in": 300})))
}

fn success(status: &str) -> Reply {
    Ok((
        200,
        json!({
            "ok": true, "status": status, "student_id_masked": "2510***",
            "verified_at": 1_799_990_000, "reuse_until": 1_815_542_000, "casdoor": "done"
        }),
    ))
}

fn reject(code: u16, reason: &str) -> Reply {
    Ok((code, json!({"ok": false, "reason": reason})))
}

fn run(transport: &FakeTransport, input: &VerifyInput) -> SchoolVerifyPayload {
    tauri::async_runtime::block_on(run_school_verify(transport, &key(), input, &now))
}

/// 按服务端的方式用请求体里的字段重建 canonical 并验签：证明服务端收到的签名一定成立。
fn assert_signed_for(body: &Value, nonce: &str) {
    let s = |k: &str| body[k].as_str().unwrap().to_string();
    assert_eq!(s("nonce"), nonce);
    assert_eq!(s("student_id"), SID);
    assert_eq!(s("alg"), "Ed25519");
    let ts = body["ts"].as_i64().unwrap();
    assert_eq!(ts, TS);
    let canonical = format!(
        "v1|{}|{}|{}|{}|{}",
        s("device_id"),
        s("student_id"),
        s("student_name_sha256"),
        s("nonce"),
        ts
    );
    let proof = V2Proof {
        device_id: s("device_id"),
        student_id: s("student_id"),
        student_name_hash: s("student_name_sha256"),
        nonce: s("nonce"),
        ts,
        alg: s("alg"),
        canonical,
        signature: s("signature"),
        public_key_jwk: s("public_key_jwk"),
    };
    assert!(
        verify_v2_proof(&proof),
        "请求体里的签名必须能被服务端按契约验过"
    );
}

// ── 编排 ────────────────────────────────────────────────────────────────────────

#[test]
fn reuse_path_never_sends_the_cookie() {
    let t = FakeTransport::new(vec![nonce_ok(NONCE_A), success(STATUS_REUSED)]);
    let out = run(&t, &input(COOKIE));
    assert!(out.ok && out.status == STATUS_REUSED && !out.cookie_sent);
    assert_eq!(out.casdoor.as_deref(), Some("done"));
    assert_eq!(out.student_id_masked.as_deref(), Some("2510***"));
    let reqs = t.requests();
    assert_eq!(reqs.len(), 2);
    assert_eq!(reqs[0].0, NONCE_PATH);
    assert_eq!(reqs[0].1, json!({"device_id": device_id_for_key(&key())}));
    assert_eq!(reqs[1].0, VERIFY_PATH);
    assert!(
        reqs[1].1.get("campus_cookie").is_none(),
        "复用路径绝不能带 cookie"
    );
    assert_signed_for(&reqs[1].1, NONCE_A);
}

#[test]
fn cookie_is_sent_only_after_server_asks_and_with_a_fresh_nonce() {
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
        nonce_ok(NONCE_B),
        success(STATUS_VERIFIED),
    ]);
    let out = run(&t, &input(COOKIE));
    assert!(out.ok && out.status == STATUS_VERIFIED && out.cookie_sent);
    let reqs = t.requests();
    assert_eq!(
        reqs.iter().map(|r| r.0.as_str()).collect::<Vec<_>>(),
        [NONCE_PATH, VERIFY_PATH, NONCE_PATH, VERIFY_PATH]
    );
    assert!(reqs[1].1.get("campus_cookie").is_none());
    assert_eq!(reqs[3].1["campus_cookie"], json!(COOKIE));
    assert_signed_for(&reqs[1].1, NONCE_A);
    assert_signed_for(&reqs[3].1, NONCE_B);
}

#[test]
fn cookie_required_but_none_available_stops_without_sending_anything_more() {
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
    ]);
    let out = run(&t, &input(""));
    assert!(!out.ok && !out.cookie_sent);
    assert_eq!(out.reason.as_deref(), Some(REASON_CAMPUS_COOKIE_REQUIRED));
    assert_eq!(t.requests().len(), 2);
}

#[test]
fn server_asking_for_cookie_twice_is_reported_not_looped() {
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
        nonce_ok(NONCE_B),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
    ]);
    let out = run(&t, &input(COOKIE));
    assert!(!out.ok && out.cookie_sent);
    assert_eq!(out.reason.as_deref(), Some(REASON_CAMPUS_COOKIE_REQUIRED));
    assert_eq!(t.requests().len(), 4);
}

#[test]
fn nonce_rate_limit_maps_reason_and_retry_after() {
    let t = FakeTransport::new(vec![Ok((
        429,
        json!({"ok": false, "reason": "rate_limited", "retry_after_seconds": 42}),
    ))]);
    let out = run(&t, &input(COOKIE));
    assert_eq!(
        (out.ok, out.http_status, out.retry_after_seconds),
        (false, Some(429), Some(42))
    );
    assert_eq!(out.reason.as_deref(), Some("rate_limited"));
    assert_eq!(t.requests().len(), 1);
}

#[test]
fn verify_rejections_pass_contract_reason_codes_through() {
    for (code, reason) in [
        (403, "student_id_mismatch"),
        (401, "nonce_invalid"),
        (502, "timeout"),
        (503, "store_unavailable"),
    ] {
        let t = FakeTransport::new(vec![nonce_ok(NONCE_A), reject(code, reason)]);
        let out = run(&t, &input(COOKIE));
        assert_eq!(
            (out.ok, out.http_status, out.reason.as_deref()),
            (false, Some(code), Some(reason))
        );
    }
}

#[test]
fn gate_throttling_carries_retry_after_and_caps_it() {
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        Ok((
            429,
            json!({"ok": false, "reason": "daily_budget_exhausted", "retry_after_seconds": 10_000_000}),
        )),
    ]);
    let out = run(&t, &input(COOKIE));
    assert_eq!(out.reason.as_deref(), Some("daily_budget_exhausted"));
    assert_eq!(out.retry_after_seconds, Some(86_400));
}

#[test]
fn network_errors_report_whether_the_cookie_left_the_device() {
    let t = FakeTransport::new(vec![Err(TransportError::Network("dns".into()))]);
    let out = run(&t, &input(COOKIE));
    assert_eq!(
        (out.reason.as_deref(), out.cookie_sent),
        (Some(REASON_NETWORK_ERROR), false)
    );

    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
        nonce_ok(NONCE_B),
        Err(TransportError::Network("reset".into())),
    ]);
    let out = run(&t, &input(COOKIE));
    assert_eq!(
        (out.reason.as_deref(), out.cookie_sent),
        (Some(REASON_NETWORK_ERROR), true)
    );
}

#[test]
fn arbitrary_server_text_never_reaches_the_frontend() {
    for weird in [
        "<script>alert(1)</script>",
        "Some Text",
        "",
        "UPPER",
        "a".repeat(65).as_str(),
    ] {
        let t = FakeTransport::new(vec![nonce_ok(NONCE_A), reject(403, weird)]);
        assert_eq!(
            run(&t, &input(COOKIE)).reason.as_deref(),
            Some(REASON_UNKNOWN)
        );
    }
    // 入口 502（非 JSON）→ unknown + 真实 HTTP 状态
    let t = FakeTransport::new(vec![Ok((502, Value::Null))]);
    let out = run(&t, &input(COOKIE));
    assert_eq!(
        (out.reason.as_deref(), out.http_status),
        (Some(REASON_UNKNOWN), Some(502))
    );
}

#[test]
fn malformed_success_shapes_are_bad_response() {
    let t = FakeTransport::new(vec![Ok((200, json!({"ok": true, "nonce": "not-hex"})))]);
    assert_eq!(
        run(&t, &input(COOKIE)).reason.as_deref(),
        Some(REASON_BAD_RESPONSE)
    );
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        Ok((200, json!({"ok": true, "status": "weird"}))),
    ]);
    assert_eq!(
        run(&t, &input(COOKIE)).reason.as_deref(),
        Some(REASON_BAD_RESPONSE)
    );
    let t = FakeTransport::new(vec![nonce_ok(NONCE_A), Ok((200, Value::Null))]);
    assert_eq!(
        run(&t, &input(COOKIE)).reason.as_deref(),
        Some(REASON_BAD_RESPONSE)
    );
}

#[test]
fn success_fields_are_whitelisted() {
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        Ok((
            200,
            json!({"ok": true, "status": "verified", "student_id_masked": "2510231106-full", "casdoor": "evil"}),
        )),
    ]);
    let out = run(&t, &input(COOKIE));
    assert!(out.ok);
    assert_eq!((out.student_id_masked, out.casdoor), (None, None));
}

// ── 纯函数 ──────────────────────────────────────────────────────────────────────

#[test]
fn merge_cookie_headers_prefers_primary_and_drops_unsafe_pairs() {
    let merged = merge_cookie_headers(&[
        "JSESSIONID=cx; route=a; mini_hbut_token=x; bad name=v; ok=val;ue",
        "JSESSIONID=old; jwxt_only=1; hbu_session_cookies=x; cf_clearance=y; =empty; novalue=",
    ]);
    assert_eq!(merged, "JSESSIONID=cx; jwxt_only=1; ok=val; route=a");
}

#[test]
fn merge_cookie_headers_trims_longest_values_first_to_fit_the_school_limit() {
    let huge = "x".repeat(5_000);
    let big = "y".repeat(1_500);
    let merged =
        merge_cookie_headers(&[&format!("huge={huge}; big={big}; JSESSIONID=keep; route=r")]);
    assert!(merged.len() <= MAX_COOKIE_HEADER_BYTES);
    assert_eq!(merged, format!("JSESSIONID=keep; big={big}; route=r"));
    assert_eq!(merge_cookie_headers(&["", "   "]), "");
}

#[test]
fn device_id_is_stable_valid_and_per_key() {
    let a = device_id_for_key(&key());
    assert_eq!(a, device_id_for_key(&key()));
    assert!(a.starts_with("mhsv-") && crate::identity::sign_canonical::is_valid_device_id(&a));
    assert_ne!(a, device_id_for_key(&DeviceKey::from_seed([8u8; 32])));
}

#[test]
fn base_url_is_pinned_unless_debug_loopback_is_explicitly_allowed() {
    assert_eq!(
        resolve_base(false, Some("http://127.0.0.1:8000")),
        SCHOOL_VERIFY_ORIGIN
    );
    assert_eq!(
        resolve_base(true, Some("http://127.0.0.1:8000")),
        "http://127.0.0.1:8000"
    );
    assert_eq!(
        resolve_base(true, Some("http://localhost:9")),
        "http://localhost:9"
    );
    for rejected in [
        "https://evil.example",
        "http://127.0.0.1:8000/school",
        "http://127.0.0.1:8000/?a=1",
        "http://u:p@127.0.0.1:8000",
        "ftp://127.0.0.1",
        "not a url",
    ] {
        assert_eq!(
            resolve_base(true, Some(rejected)),
            SCHOOL_VERIFY_ORIGIN,
            "{rejected}"
        );
    }
    assert_eq!(resolve_base(true, None), SCHOOL_VERIFY_ORIGIN);
    assert_eq!(SCHOOL_VERIFY_ORIGIN, "https://mini.hbut.site");
}

#[test]
fn android_is_unsupported_everything_else_is_allowed() {
    assert!(!platform_supports_device_signing("android"));
    for os in ["windows", "macos", "ios", "linux"] {
        assert!(platform_supports_device_signing(os), "{os}");
    }
    let out = SchoolVerifyPayload::unsupported();
    assert_eq!(
        (out.ok, out.status.as_str(), out.reason.as_deref()),
        (false, STATUS_UNSUPPORTED, Some(REASON_UNSUPPORTED_PLATFORM))
    );
}

#[test]
fn local_errors_map_to_stable_reasons() {
    assert_eq!(
        reason_for_identity_error(&IdentityError::NoLocalLogin),
        REASON_NO_LOCAL_LOGIN
    );
    assert_eq!(
        reason_for_identity_error(&IdentityError::KeyringWriteMismatch),
        REASON_DEVICE_KEY_UNAVAILABLE
    );
}

#[test]
fn audit_line_and_payload_never_carry_secrets() {
    let t = FakeTransport::new(vec![
        nonce_ok(NONCE_A),
        reject(400, REASON_CAMPUS_COOKIE_REQUIRED),
        nonce_ok(NONCE_B),
        success(STATUS_VERIFIED),
    ]);
    let out = run(&t, &input(COOKIE));
    let line = audit_message(SID, &out);
    assert!(
        line.contains("2510***")
            && !line.contains(SID)
            && !line.contains("JSESSIONID")
            && !line.contains(NONCE_B)
    );
    let value = serde_json::to_value(&out).unwrap();
    let mut keys: Vec<&str> = value
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "casdoor",
            "cookie_sent",
            "http_status",
            "ok",
            "reason",
            "retry_after_seconds",
            "reuse_until",
            "status",
            "student_id_masked",
            "verified_at"
        ]
    );
    let text = value.to_string();
    assert!(!text.contains("JSESSIONID") && !text.contains(SID) && !text.contains(NONCE_B));
}
