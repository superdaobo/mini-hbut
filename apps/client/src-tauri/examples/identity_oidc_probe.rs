//! P2-4 验收①②（本机替代证据）：授权码 + PKCE → 换令牌 → 校验 id_token 全链探针。
//!
//! 服务端为本机假 OIDC provider（`D:\ct_scratch\p24-e2e\fake_provider.py`，纯标准库 +
//! cryptography，RSA 现场签发 RS256 id_token）；本探针**全部使用真实被测代码**
//! （`identity::oidc_core`）：`OidcConfig` / `generate_pkce` / `generate_state` /
//! `generate_nonce` / `build_authorize_url` / `parse_callback` / `PendingStore` /
//! `verify_id_token`；仅 HTTP 腿（GET /authorize、POST /token、GET /jwks.json）用
//! reqwest（**不跟随重定向**，自行读取 Location），且 `no_proxy` 直连 127.0.0.1。
//!
//! 用法：
//! ```bash
//! cargo run --example identity_oidc_probe -- \
//!   --issuer http://127.0.0.1:PORT --client-id <id> \
//!   [--tamper-nonce] [--tamper-state] [--bad-verifier] [--alg-none]
//! ```
//!
//! 输出：一行一事件；`code` / `code_verifier` / `id_token` **只打印前 8 字符 + 长度**，
//! 绝不完整打印。末行恒为二者之一：
//! - `[RESULT] PASS`（无 flag：全链通过）
//! - `[RESULT] REJECTED kind=<kind>`（篡改场景：拒绝即通过）
//!
//! 场景预期：
//! - 无 flag → 全链通过：`[RESULT] PASS`
//! - `--tamper-state` → take_matching 用错 state → `kind=oidc_state_mismatch`（**不**发起令牌兑换）
//! - `--bad-verifier` → 篡改 verifier 兑换 → provider 400 → `kind=oidc_token_exchange_failed`
//! - `--tamper-nonce` → 校验时传错期望 nonce → `kind=oidc_nonce_mismatch`
//! - `--alg-none` → 换入自造 `alg=none` token → `kind=oidc_id_token_invalid`

use std::time::Duration;

use hbut_helper_lib::identity::oidc_core::{
    build_authorize_url, generate_nonce, generate_pkce, generate_state, parse_callback,
    verify_id_token, OidcConfig, PendingAuth, PendingStore, KIND_OIDC_ID_TOKEN_INVALID,
    KIND_OIDC_NONCE_MISMATCH, KIND_OIDC_STATE_MISMATCH, KIND_OIDC_TOKEN_EXCHANGE_FAILED,
};

/// 固定回调（与规格 §1 默认值一致；parse_callback 只接受深链或 loopback 形态）。
const REDIRECT_URI: &str = "minihbut://identity/callback";

/// 敏感材料脱敏：只留前 8 字符 + 长度（`code`/`verifier`/`id_token` 绝不完整打印）。
fn mask8(v: &str) -> String {
    let head: String = v.chars().take(8).collect();
    format!("{head}…(len={})", v.len())
}

/// 篡改首字符（保持长度与字符集形状，保证值必然改变）。
fn tamper_first(v: &str) -> String {
    let mut s = v.to_string();
    if let Some(c) = s.chars().next() {
        let flipped = if c == 'A' { 'B' } else { 'A' };
        s.replace_range(0..c.len_utf8(), &flipped.to_string());
    }
    s
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

struct Args {
    issuer: String,
    client_id: String,
    tamper_nonce: bool,
    tamper_state: bool,
    bad_verifier: bool,
    alg_none: bool,
}

/// 手写参数解析（不引入 clap 等新依赖，与既有 example 同款）。
fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        issuer: String::new(),
        client_id: String::new(),
        tamper_nonce: false,
        tamper_state: false,
        bad_verifier: false,
        alg_none: false,
    };
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        match argv[i].as_str() {
            "--issuer" => {
                args.issuer = argv.get(i + 1).cloned().ok_or("--issuer 缺少取值")?;
                i += 2;
            }
            "--client-id" => {
                args.client_id = argv.get(i + 1).cloned().ok_or("--client-id 缺少取值")?;
                i += 2;
            }
            "--tamper-nonce" => {
                args.tamper_nonce = true;
                i += 1;
            }
            "--tamper-state" => {
                args.tamper_state = true;
                i += 1;
            }
            "--bad-verifier" => {
                args.bad_verifier = true;
                i += 1;
            }
            "--alg-none" => {
                args.alg_none = true;
                i += 1;
            }
            other => return Err(format!("未知参数：{other}")),
        }
    }
    if args.issuer.is_empty() || args.client_id.is_empty() {
        return Err("--issuer 与 --client-id 均为必填".to_string());
    }
    Ok(args)
}

/// 自造 `alg=none` token（**仅**用于验证 `verify_id_token` 拒收）：
/// header 声称 alg=none、签名段为空；载荷形状仿正常 token（验签前 alg 断言先拦）。
fn forge_alg_none_token(cfg: &OidcConfig, nonce: &str, now: i64) -> String {
    use base64::{engine::general_purpose, Engine as _};
    let header = r#"{"alg":"none","typ":"JWT"}"#;
    let claims = serde_json::json!({
        "iss": cfg.issuer,
        "aud": cfg.client_id,
        "sub": "hbut_20241234",
        "nonce": nonce,
        "iat": now,
        "exp": now + 300,
        "hbut_student_id": "20241234",
    });
    let h = general_purpose::URL_SAFE_NO_PAD.encode(header.as_bytes());
    let p = general_purpose::URL_SAFE_NO_PAD.encode(
        serde_json::to_string(&claims)
            .expect("claims 序列化应成功")
            .as_bytes(),
    );
    format!("{h}.{p}.")
}

#[tokio::main]
async fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("[FAIL] {e}");
            std::process::exit(2);
        }
    };

    // 1) 直接构造配置（不走 from_env，避免依赖环境）。
    let cfg = OidcConfig {
        issuer: args.issuer.trim_end_matches('/').to_string(),
        client_id: args.client_id.clone(),
        scopes: "openid".to_string(),
        redirect_uri: REDIRECT_URI.to_string(),
    };
    println!("[step] issuer={}", cfg.issuer);
    println!("[step] client_id={}", cfg.client_id);

    // 2) 生成 PKCE / state / nonce（真实被测代码）。
    let pkce = generate_pkce();
    let state = generate_state();
    let nonce = generate_nonce();
    println!(
        "[step] pkce verifier={} challenge={}",
        mask8(&pkce.verifier),
        pkce.challenge
    );
    println!("[step] state={state} nonce={}", mask8(&nonce));

    // 3) 构造授权 URL（真实被测代码；参数全 percent-encode、顺序固定）。
    let url = build_authorize_url(&cfg, &state, &nonce, &pkce.challenge);
    println!("[step] authorize_url={url}");

    // 4) HTTP GET（不跟随重定向，自行取 Location；no_proxy 直连回环）。
    let client = match reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            println!("[FAIL] HTTP 客户端创建失败：{e}");
            std::process::exit(1);
        }
    };
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            println!("[FAIL] GET /authorize 网络错误：{e}");
            std::process::exit(1);
        }
    };
    let status = resp.status();
    let location = resp
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    println!("[step] authorize_response status={status}");
    if status.as_u16() != 302 || location.is_empty() {
        println!(
            "[FAIL] 期望 302 + Location，实际 status={status} location_present={}",
            !location.is_empty()
        );
        std::process::exit(1);
    }

    // 5) 解析回调（真实被测代码）：取 (code, state) 并断言 state == 生成值。
    let (code, cb_state) = match parse_callback(&location, &cfg.redirect_uri) {
        Ok(pair) => pair,
        Err(e) => {
            println!("[step] parse_callback 被拒 kind={}", e.kind());
            println!("[RESULT] REJECTED kind={}", e.kind());
            std::process::exit(0);
        }
    };
    println!("[step] callback code={} state={cb_state}", mask8(&code));
    if cb_state != state {
        println!("[FAIL] 回调 state 与生成值不一致（provider 未原样回显）");
        std::process::exit(1);
    }
    println!("[step] state 断言通过（回调 state == 生成 state，32 位 hex）");

    let now = now_unix();

    // 6) PendingStore：put → take_matching（真实被测代码；state 一次性）。
    let store = PendingStore::new();
    store.put(PendingAuth {
        state: state.clone(),
        nonce: nonce.clone(),
        verifier: pkce.verifier.clone(),
        redirect_uri: cfg.redirect_uri.clone(),
        created_at: now,
    });
    println!("[step] pending 已写入（TTL 600s，一次性）");

    let lookup_state = if args.tamper_state {
        let t = tamper_first(&state);
        println!("[step] tamper-state：故意用错 state={t} 执行 take_matching");
        t
    } else {
        cb_state.clone()
    };
    let pending_auth = match store.take_matching(&lookup_state, now) {
        Ok(p) => {
            println!("[step] take_matching 命中（一次性，记录已移除）");
            p
        }
        Err(e) => {
            if args.tamper_state && e.kind() == KIND_OIDC_STATE_MISMATCH {
                println!(
                    "[step] take_matching 被拒（未发起令牌兑换） kind={}",
                    e.kind()
                );
                println!("[RESULT] REJECTED kind={}", e.kind());
                std::process::exit(0);
            }
            println!("[FAIL] take_matching 意外被拒 kind={}", e.kind());
            std::process::exit(1);
        }
    };

    // 7) 令牌兑换 POST /token（form 编码；verifier 只在此使用，绝不打印）。
    let verifier_for_token = if args.bad_verifier {
        let t = tamper_first(&pending_auth.verifier);
        println!("[step] bad-verifier：用篡改 verifier={} 兑换", mask8(&t));
        t
    } else {
        pending_auth.verifier.clone()
    };
    let form = [
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", pending_auth.redirect_uri.as_str()),
        ("code_verifier", verifier_for_token.as_str()),
        ("client_id", cfg.client_id.as_str()),
    ];
    let token_resp = match client.post(&cfg.token_endpoint()).form(&form).send().await {
        Ok(r) => r,
        Err(e) => {
            println!("[FAIL] POST /token 网络错误：{e}");
            std::process::exit(1);
        }
    };
    let token_status = token_resp.status();
    let token_body: serde_json::Value = token_resp.json().await.unwrap_or(serde_json::Value::Null);
    println!("[step] token_response status={token_status}");
    if !(200..300).contains(&token_status.as_u16()) {
        let provider_error = token_body
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        if args.bad_verifier {
            println!(
                "[step] 兑换被 provider 拒绝（PKCE S256 不通过，provider_error={provider_error}） kind={}",
                KIND_OIDC_TOKEN_EXCHANGE_FAILED
            );
            println!("[RESULT] REJECTED kind={KIND_OIDC_TOKEN_EXCHANGE_FAILED}");
            std::process::exit(0);
        }
        println!("[FAIL] 正常链兑换失败 status={token_status} provider_error={provider_error}");
        std::process::exit(1);
    }
    let id_token = match token_body
        .get("id_token")
        .and_then(serde_json::Value::as_str)
        .filter(|s| !s.is_empty())
    {
        Some(t) => t.to_string(),
        None => {
            println!("[FAIL] 令牌响应缺 id_token");
            std::process::exit(1);
        }
    };
    println!("[step] id_token 已取得 {}", mask8(&id_token));

    // 8) GET /jwks.json + verify_id_token（真实被测代码；只接受 RS256）。
    let jwks_resp = match client.get(&cfg.jwks_uri()).send().await {
        Ok(r) => r,
        Err(e) => {
            println!("[FAIL] GET /jwks.json 网络错误：{e}");
            std::process::exit(1);
        }
    };
    let jwks: serde_json::Value = jwks_resp.json().await.unwrap_or(serde_json::Value::Null);
    let key_count = jwks
        .get("keys")
        .and_then(serde_json::Value::as_array)
        .map_or(0, |k| k.len());
    println!("[step] jwks keys={key_count}");
    if key_count == 0 {
        println!("[FAIL] JWKS 无密钥");
        std::process::exit(1);
    }

    let expected_nonce = if args.tamper_nonce {
        let t = tamper_first(&nonce);
        println!(
            "[step] tamper-nonce：向 verify 传错期望 nonce={}",
            mask8(&t)
        );
        t
    } else {
        nonce.clone()
    };
    let token_to_verify = if args.alg_none {
        let forged = forge_alg_none_token(&cfg, &expected_nonce, now);
        println!("[step] alg-none：以自造 alg=none token 替代真实 id_token 送验");
        forged
    } else {
        id_token
    };

    match verify_id_token(&token_to_verify, &jwks, &cfg, &expected_nonce, now) {
        Ok(claims) => {
            if args.tamper_nonce || args.tamper_state || args.bad_verifier || args.alg_none {
                println!("[FAIL] 篡改场景应被拒绝，实际通过（sub={}）", claims.sub);
                std::process::exit(1);
            }
            println!(
                "[ok] claims sub={} student_id={} nonce={} exp={} iat={}",
                claims.sub,
                claims.student_id,
                mask8(&claims.nonce),
                claims.exp,
                claims.iat
            );
            println!("[RESULT] PASS");
            std::process::exit(0);
        }
        Err(e) => {
            let kind = e.kind();
            let expected_kind = if args.tamper_nonce {
                Some(KIND_OIDC_NONCE_MISMATCH)
            } else if args.alg_none {
                Some(KIND_OIDC_ID_TOKEN_INVALID)
            } else {
                None
            };
            if let Some(ek) = expected_kind {
                if kind != ek {
                    println!("[FAIL] 被拒但 kind 不符：期望 {ek} 实际 {kind}");
                    std::process::exit(1);
                }
                println!("[step] id_token 校验按预期拒绝 kind={kind}");
                println!("[RESULT] REJECTED kind={kind}");
                std::process::exit(0);
            }
            println!("[FAIL] 正常链应通过但被拒 kind={kind}");
            std::process::exit(1);
        }
    }
}
