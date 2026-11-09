//! P0-8 阶段 0（goal-10 / mini-hbut#1214）联调 example：App 侧 dev 签名命令行签名器。
//!
//! ⚠️ 定位（必读）：
//! - **这是阶段 0 的联调 example，不是生产路径**。生产的身份证明走 P1-1 的正式命令
//!   （Tauri 命令通道）；本文件只用于让联调脚本在**没有 GUI/webview** 的情况下，
//!   复用 App 同一份 `identity::v2_signature` 实现（canonical 拼接 / Ed25519 签名 /
//!   自检验签）产出与 App 字节一致的证明。
//! - `--seed-hex` **只用于可复现联调**（用给定的 32 字节 seed 派生 Ed25519 密钥）；
//!   **绝不可**用于生产——生产私钥只来自 OS keyring（service=`mini-hbut-identity`），
//!   且 fail closed，不允许任何文件/命令行降级。
//!
//! 用法（参数解析为**手写**，不引入 clap 等新依赖）：
//! ```bash
//! cargo run --quiet --example identity_v2_dev_sign -- \
//!   --device-id <8..128> --student-id <学号> [--student-name <姓名>] \
//!   [--seed-hex <64 位 hex>] [--nonce <n>] [--ts <unix 秒>]
//! ```
//!
//! 输出契约（规格 §3）：**stdout 恰好一行 JSON**（其余诊断全部走 stderr），
//! 字段序固定，`public_key_jwk` 为**字符串**（紧凑 JWK JSON）：
//! ```json
//! {"device_id":...,"student_id":...,"student_name":...,"student_name_hash":...,
//!  "nonce":...,"ts":...,"alg":"Ed25519","canonical":...,"signature":...,
//!  "public_key_jwk":"{\"kty\":\"OKP\",\"crv\":\"Ed25519\",\"x\":\"...\"}","self_check_ok":true}
//! ```
//!
//! 退出码：0 = 自检通过；1 = `self_check_ok` 为假（联调脚本据此断言）；
//! 2 = 参数错误（未知参数 / 缺必填 / 取值非法）；3 = 运行期错误（keyring 不可用等）。

use hbut_helper_lib::identity::device_key::{DeviceKey, DeviceKeyStore};
use hbut_helper_lib::identity::v2_signature::{
    generate_nonce, now_unix, sign_v2_proof, verify_v2_proof, V2Proof,
};

/// 解析后的命令行参数（全部取值已完成校验，`run` 不再关心参数细节）。
struct ParsedArgs {
    device_id: String,
    student_id: String,
    /// 可选姓名；缺省为空串（空串的 sha256 进 canonical，与规格一致）。
    student_name: String,
    /// 64 位 hex；Some 时用 seed 派生密钥（仅联调），None 时走真实 keyring。
    seed_hex: Option<String>,
    nonce: Option<String>,
    ts: Option<i64>,
}

/// 向 stderr 打印用法说明（stdout 只允许那一行 JSON，故用法一律走 stderr）。
fn usage() {
    eprintln!("用法:");
    eprintln!(
        "  identity_v2_dev_sign --device-id <8..128> --student-id <学号> [--student-name <姓名>]"
    );
    eprintln!("                  [--seed-hex <64 位 hex>] [--nonce <n>] [--ts <unix 秒>]");
    eprintln!();
    eprintln!("参数:");
    eprintln!("  --device-id     必填；设备标识，8–128 字符，不得含 '|'");
    eprintln!("  --student-id    必填；学号，不得为空、不得含 '|'");
    eprintln!(
        "  --student-name  可选；姓名，缺省空串（仅 sha256 进 canonical，明文不进 canonical）"
    );
    eprintln!("  --seed-hex      可选；64 位 hex 派生设备私钥（仅可复现联调用，生产绝不可用）");
    eprintln!("  --nonce         可选；一次性 nonce，缺省 generate_nonce()（32 位小写 hex）");
    eprintln!("  --ts            可选；unix 秒，缺省 now_unix()");
    eprintln!();
    eprintln!("密钥来源: 默认真实 OS keyring（service=mini-hbut-identity，fail closed）；");
    eprintln!("          给 --seed-hex 时改用 seed 派生（仅联调）。");
    eprintln!("退出码: 0=自检通过  1=self_check_ok=false  2=参数错误  3=运行期错误");
}

/// 64 位 hex → 32 字节 seed。非法（长度/字符）→ None。
/// 手写解码，避免引入 hex 依赖。
fn decode_seed_hex(hex: &str) -> Option<[u8; 32]> {
    if hex.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (slot, pair) in out.iter_mut().zip(hex.as_bytes().chunks(2)) {
        let hi = (pair[0] as char).to_digit(16)?;
        let lo = (pair[1] as char).to_digit(16)?;
        *slot = (hi * 16 + lo) as u8;
    }
    Some(out)
}

/// 手写参数解析 + 取值校验（规格 §3；不引入 clap）。
/// 任何未知参数 / 缺必填 / 取值非法 → Err(说明)，由调用方转退出码 2。
fn parse_args(args: &[String]) -> Result<ParsedArgs, String> {
    let mut device_id: Option<String> = None;
    let mut student_id: Option<String> = None;
    let mut student_name: Option<String> = None;
    let mut seed_hex: Option<String> = None;
    let mut nonce: Option<String> = None;
    let mut ts: Option<i64> = None;

    // 逐个消费「flag + value」；flag 后的值缺失同样是参数错误（退出码 2）。
    let mut i = 0usize;
    while i < args.len() {
        let flag = args[i].as_str();
        let take_value = |i: &mut usize| -> Result<String, String> {
            *i += 1;
            args.get(*i)
                .cloned()
                .ok_or_else(|| "参数缺少取值".to_string())
        };
        match flag {
            "--device-id" => device_id = Some(take_value(&mut i)?),
            "--student-id" => student_id = Some(take_value(&mut i)?),
            "--student-name" => student_name = Some(take_value(&mut i)?),
            "--seed-hex" => seed_hex = Some(take_value(&mut i)?),
            "--nonce" => nonce = Some(take_value(&mut i)?),
            "--ts" => {
                let raw = take_value(&mut i)?;
                ts = Some(
                    raw.parse::<i64>()
                        .map_err(|e| format!("--ts 不是合法整数: {e}"))?,
                );
            }
            other => return Err(format!("未知参数: {other}")),
        }
        i += 1;
    }

    let device_id = device_id.ok_or_else(|| "缺少必填参数: --device-id".to_string())?;
    let student_id = student_id.ok_or_else(|| "缺少必填参数: --student-id".to_string())?;

    // device_id 长度 8–128（规格 §3）
    let d_len = device_id.chars().count();
    if !(8..=128).contains(&d_len) {
        return Err(format!("--device-id 长度必须为 8–128（实际 {d_len}）"));
    }
    // 进 canonical 的必填字段禁止空值与分隔符 '|'
    // （与 `build_v2_canonical` 的约束同口径；提前在此拦，保证报错走退出码 2 而非 3）。
    for (name, value) in [
        ("--device-id", device_id.as_str()),
        ("--student-id", student_id.as_str()),
    ] {
        if value.is_empty() {
            return Err(format!("{name} 不能为空"));
        }
        if value.contains('|') {
            return Err(format!("{name} 不得含分隔符 '|'"));
        }
    }
    // --nonce 为可选：仅在用户显式给出时校验（未给 → 后面用 generate_nonce() 生成）。
    if let Some(nonce) = &nonce {
        if nonce.is_empty() {
            return Err("--nonce 不能为空".to_string());
        }
        if nonce.contains('|') {
            return Err("--nonce 不得含分隔符 '|'".to_string());
        }
    }

    // --seed-hex 必须恰好 64 位 hex（32 字节 seed）
    if let Some(hex) = &seed_hex {
        decode_seed_hex(hex)
            .ok_or_else(|| format!("--seed-hex 必须是 64 位 hex（实际长度 {}）", hex.len()))?;
    }

    Ok(ParsedArgs {
        device_id,
        student_id,
        student_name: student_name.unwrap_or_default(),
        seed_hex,
        nonce,
        ts,
    })
}

/// 取得设备密钥：给了 `--seed-hex` → seed 派生（仅联调）；否则真实 keyring（fail closed）。
fn build_key(seed_hex: &Option<String>) -> Result<DeviceKey, String> {
    match seed_hex {
        // 可复现联调：seed 直接派生，不碰 keyring。
        Some(hex) => decode_seed_hex(hex)
            .map(DeviceKey::from_seed)
            .ok_or_else(|| "invalid --seed-hex".to_string()),
        // 默认：真实 OS keyring（service=mini-hbut-identity / account=device-ed25519-v1）；
        // 不存在则生成并写入，写后读校验失败 → fail closed（错误上抛，不降级）。
        None => DeviceKeyStore::real()
            .create_if_missing()
            .map_err(|e| format!("读取/创建设备密钥失败: {e}")),
    }
}

/// 按规格 §3 的固定字段序拼出一行 JSON。
/// 手工拼接 + 每个字符串字段走 `serde_json` 转义（不手写转义规则、不引额外库），
/// 保证恰好一行、字段序与规格一致、`public_key_jwk` 是字符串。
fn build_output_line(
    proof: &V2Proof,
    student_name: &str,
    self_check_ok: bool,
) -> Result<String, serde_json::Error> {
    let j = |v: &str| serde_json::to_string(v);
    Ok(format!(
        "{{\"device_id\":{},\"student_id\":{},\"student_name\":{},\"student_name_hash\":{},\
         \"nonce\":{},\"ts\":{},\"alg\":{},\"canonical\":{},\"signature\":{},\
         \"public_key_jwk\":{},\"self_check_ok\":{}}}",
        j(&proof.device_id)?,
        j(&proof.student_id)?,
        j(student_name)?,
        j(&proof.student_name_hash)?,
        j(&proof.nonce)?,
        proof.ts,
        j(&proof.alg)?,
        j(&proof.canonical)?,
        j(&proof.signature)?,
        j(&proof.public_key_jwk)?,
        self_check_ok,
    ))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();

    // 1) 参数解析：失败 → stderr 用法 + 退出码 2。
    let parsed = match parse_args(&args) {
        Ok(p) => p,
        Err(msg) => {
            eprintln!("[dev-sign] 参数错误: {msg}");
            usage();
            std::process::exit(2);
        }
    };

    // 2) 取密钥（seed 派生或真实 keyring）：失败 → 退出码 3。
    let key = match build_key(&parsed.seed_hex) {
        Ok(k) => k,
        Err(msg) => {
            eprintln!("[dev-sign] 运行期错误: {msg}");
            std::process::exit(3);
        }
    };
    // 诊断（stderr）：只允许公开指纹，绝不打私钥/签名材料。
    eprintln!("[dev-sign] 设备密钥指纹: {}", key.fingerprint());

    let nonce = parsed.nonce.unwrap_or_else(generate_nonce);
    let ts = parsed.ts.unwrap_or_else(now_unix);

    // 3) 签名（复用 identity::v2_signature，不另写 canonical）。
    let proof = match sign_v2_proof(
        &key,
        &parsed.device_id,
        &parsed.student_id,
        &parsed.student_name,
        &nonce,
        ts,
    ) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[dev-sign] 签名失败: {e}");
            std::process::exit(3);
        }
    };

    // 4) 自检（复用 verify_v2_proof：形状 + 一致性 + Ed25519 验签）。
    let self_check_ok = verify_v2_proof(&proof);

    // 5) 输出：stdout 恰好一行 JSON（其余诊断已在上面走 stderr）。
    match build_output_line(&proof, &parsed.student_name, self_check_ok) {
        Ok(line) => println!("{line}"),
        Err(e) => {
            eprintln!("[dev-sign] JSON 序列化失败: {e}");
            std::process::exit(3);
        }
    }

    // 6) 自检为假 → 退出码 1（规格 §3：联调脚本据此断言）。
    if !self_check_ok {
        std::process::exit(1);
    }
}
