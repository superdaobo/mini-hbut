//! P1-2 端到端探针：用**真实 HTTP**（reqwest）驱动 `identity/v2_flow` 的三条流程。
//!
//! 用途：配合本机假服务（`D:\ct_scratch\p12-e2e\fake_service.py`）证明
//! 「首次登记成功 / 换机需旧设备批准（新设备单方面失败）/ 失败提示可读」三条验收。
//!
//! 与 App 的差别（如实说明）：本探针**不经过 Tauri 命令层与 keyring/DB**，
//! 而是用 `--seed-hex` 派生设备私钥、直接把材料交给流程函数——因此它验证的是
//! **线上契约与流程编排**，不覆盖 IPC/ACL/会话读取（那两条由
//! `cargo test --lib identity` 与 ACL 门禁覆盖）。
//!
//! 用法：
//! ```text
//! cargo run --example identity_v2_flow_probe -- \
//!   --base http://127.0.0.1:8960 --seed-hex 07… --device-id device-old-0001 \
//!   --student-id 2510231106 --mode enroll|request|approve \
//!   [--request-id … --new-device-id … --new-pubkey-sha256 … --expires-at …]
//! ```
//! 输出：一行 JSON（`{ok,kind,message,device_id,request_id,expires_at,new_pubkey_sha256}`）。

use base64::{engine::general_purpose, Engine as _};
use hbut_helper_lib::identity::device_key::DeviceKey;
use hbut_helper_lib::identity::models::FlowPayload;
use hbut_helper_lib::identity::v2_flow::{
    build_rebind_approve_canonical, build_rebind_request_canonical, enroll_v2, rebind_approve_v2,
    rebind_request_v2, EnrollV2Request, RebindApproveV2Request, RebindRequestV2Request,
};
use hbut_helper_lib::identity::v2_service_client::{pubkey_sha256, ReqwestV2Transport};

struct Args {
    base: String,
    seed_hex: String,
    device_id: String,
    student_id: String,
    mode: String,
    request_id: String,
    new_device_id: String,
    new_pubkey_sha256: String,
    expires_at: i64,
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args {
        base: String::new(),
        seed_hex: String::new(),
        device_id: String::new(),
        student_id: String::new(),
        mode: "enroll".to_string(),
        request_id: String::new(),
        new_device_id: String::new(),
        new_pubkey_sha256: String::new(),
        expires_at: 0,
    };
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < argv.len() {
        let key = argv[i].as_str();
        let val = argv
            .get(i + 1)
            .ok_or_else(|| format!("{key} 缺少取值"))?
            .clone();
        match key {
            "--base" => args.base = val,
            "--seed-hex" => args.seed_hex = val,
            "--device-id" => args.device_id = val,
            "--student-id" => args.student_id = val,
            "--mode" => args.mode = val,
            "--request-id" => args.request_id = val,
            "--new-device-id" => args.new_device_id = val,
            "--new-pubkey-sha256" => args.new_pubkey_sha256 = val,
            "--expires-at" => args.expires_at = val.parse::<i64>().map_err(|e| e.to_string())?,
            other => return Err(format!("未知参数：{other}")),
        }
        i += 2;
    }
    if args.base.is_empty() || args.seed_hex.is_empty() || args.device_id.is_empty() {
        return Err("--base / --seed-hex / --device-id 必填".to_string());
    }
    Ok(args)
}

fn key_from_seed(seed_hex: &str) -> Result<DeviceKey, String> {
    let raw = hex_to_bytes(seed_hex)?;
    let seed: [u8; 32] = raw
        .as_slice()
        .try_into()
        .map_err(|_| "--seed-hex 必须是 64 位 hex（32 字节）".to_string())?;
    Ok(DeviceKey::from_seed(seed))
}

fn hex_to_bytes(text: &str) -> Result<Vec<u8>, String> {
    let t = text.trim();
    if t.len() % 2 != 0 {
        return Err("hex 长度为奇数".to_string());
    }
    (0..t.len() / 2)
        .map(|i| u8::from_str_radix(&t[i * 2..i * 2 + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

fn b64u(raw: &[u8]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(raw)
}

fn print_payload(payload: FlowPayload) {
    let json = serde_json::json!({
        "ok": payload.ok,
        "kind": payload.kind,
        "message": payload.message,
        "device_id": payload.device_id,
        "student_id_masked": payload.student_id_masked,
        "request_id": payload.request_id,
        "expires_at": payload.expires_at,
        "new_pubkey_sha256": payload.new_pubkey_sha256,
    });
    println!("{json}");
}

fn err_payload(message: &str) -> FlowPayload {
    FlowPayload {
        ok: false,
        kind: "unknown".to_string(),
        message: message.to_string(),
        device_id: String::new(),
        student_id_masked: String::new(),
        request_id: String::new(),
        expires_at: 0,
        new_pubkey_sha256: String::new(),
        public_key_jwk: String::new(),
    }
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            println!(
                "{}",
                serde_json::json!({"ok": false, "kind": "unknown", "message": e})
            );
            std::process::exit(2);
        }
    };
    let key = match key_from_seed(&args.seed_hex) {
        Ok(k) => k,
        Err(e) => {
            println!(
                "{}",
                serde_json::json!({"ok": false, "kind": "unknown", "message": e})
            );
            std::process::exit(2);
        }
    };
    let jwk = key.public_jwk();
    let public_key_jwk = format!(
        r#"{{"kty":"{}","crv":"{}","x":"{}"}}"#,
        jwk.kty, jwk.crv, jwk.x
    );
    let key_sha = pubkey_sha256(&jwk);
    let transport = ReqwestV2Transport::new(&args.base);
    let now = hbut_helper_lib::identity::v2_signature::now_unix();
    let nonce = "11".repeat(16);

    let result: FlowPayload = tauri::async_runtime::block_on(async move {
        match args.mode.as_str() {
            "enroll" => {
                let canonical = match hbut_helper_lib::identity::v2_signature::build_v2_canonical(
                    &args.device_id,
                    &args.student_id,
                    "",
                    &nonce,
                    now,
                ) {
                    Ok(c) => c,
                    Err(e) => return err_payload(&e.to_string()),
                };
                let name_hash = canonical.split('|').nth(3).unwrap_or_default().to_string();
                let sig = b64u(&key.sign(canonical.as_bytes()));
                let req = EnrollV2Request {
                    device_id: args.device_id.clone(),
                    student_id: args.student_id.clone(),
                    alg: "Ed25519".to_string(),
                    public_key_jwk: public_key_jwk.clone(),
                    student_name_hash: name_hash,
                    nonce: nonce.clone(),
                    ts: now,
                    signature: sig,
                };
                match enroll_v2(&transport, &req).await {
                    Ok(ok) => FlowPayload {
                        ok: true,
                        kind: ok.kind.to_string(),
                        message: ok.message.to_string(),
                        device_id: req.device_id,
                        student_id_masked: ok.student_id_masked,
                        request_id: String::new(),
                        expires_at: 0,
                        new_pubkey_sha256: key_sha.clone(),
                        public_key_jwk: public_key_jwk.clone(),
                    },
                    Err(err) => FlowPayload {
                        ok: false,
                        kind: err.kind.to_string(),
                        message: err.message.to_string(),
                        device_id: args.device_id.clone(),
                        student_id_masked: String::new(),
                        request_id: String::new(),
                        expires_at: 0,
                        new_pubkey_sha256: key_sha.clone(),
                        public_key_jwk: public_key_jwk.clone(),
                    },
                }
            }
            "request" => {
                let canonical = build_rebind_request_canonical(
                    &args.device_id,
                    &args.student_id,
                    &key_sha,
                    &nonce,
                    now,
                );
                let sig = b64u(&key.sign(canonical.as_bytes()));
                let req = RebindRequestV2Request {
                    new_device_id: args.device_id.clone(),
                    student_id: args.student_id.clone(),
                    alg: "Ed25519".to_string(),
                    public_key_jwk: public_key_jwk.clone(),
                    student_name_hash: String::new(),
                    new_pubkey_sha256: key_sha.clone(),
                    nonce: nonce.clone(),
                    ts: now,
                    signature: sig,
                };
                match rebind_request_v2(&transport, &req).await {
                    Ok(ok) => FlowPayload {
                        ok: true,
                        kind: ok.kind.to_string(),
                        message: ok.message.to_string(),
                        device_id: req.new_device_id.clone(),
                        student_id_masked: ok.student_id_masked,
                        request_id: ok.request_id.clone(),
                        expires_at: ok.expires_at,
                        new_pubkey_sha256: ok.new_pubkey_sha256.clone(),
                        public_key_jwk: public_key_jwk.clone(),
                    },
                    Err(err) => FlowPayload {
                        ok: false,
                        kind: err.kind.to_string(),
                        message: err.message.to_string(),
                        device_id: req.new_device_id.clone(),
                        student_id_masked: String::new(),
                        request_id: String::new(),
                        expires_at: 0,
                        new_pubkey_sha256: key_sha.clone(),
                        public_key_jwk: public_key_jwk.clone(),
                    },
                }
            }
            "approve" => {
                let canonical = build_rebind_approve_canonical(
                    &args.request_id,
                    &args.device_id,
                    &args.new_device_id,
                    &args.new_pubkey_sha256,
                    &nonce,
                    now,
                );
                let sig = b64u(&key.sign(canonical.as_bytes()));
                let req = RebindApproveV2Request {
                    request_id: args.request_id.clone(),
                    new_device_id: args.new_device_id.clone(),
                    new_pubkey_sha256: args.new_pubkey_sha256.clone(),
                    expires_at: args.expires_at,
                    approver_device_id: args.device_id.clone(),
                    student_id: args.student_id.clone(),
                    nonce: nonce.clone(),
                    ts: now,
                    signature: sig,
                };
                match rebind_approve_v2(&transport, &req).await {
                    Ok(ok) => FlowPayload {
                        ok: true,
                        kind: ok.kind.to_string(),
                        message: ok.message.to_string(),
                        device_id: ok.device_id.clone(),
                        student_id_masked: ok.student_id_masked,
                        request_id: req.request_id.clone(),
                        expires_at: req.expires_at,
                        new_pubkey_sha256: req.new_pubkey_sha256.clone(),
                        public_key_jwk: public_key_jwk.clone(),
                    },
                    Err(err) => FlowPayload {
                        ok: false,
                        kind: err.kind.to_string(),
                        message: err.message.to_string(),
                        device_id: req.approver_device_id.clone(),
                        student_id_masked: String::new(),
                        request_id: req.request_id.clone(),
                        expires_at: req.expires_at,
                        new_pubkey_sha256: req.new_pubkey_sha256.clone(),
                        public_key_jwk: public_key_jwk.clone(),
                    },
                }
            }
            other => err_payload(&format!("未知模式：{other}")),
        }
    });

    print_payload(result);
}
