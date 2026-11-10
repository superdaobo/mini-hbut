//! P1-2（issue #1213）：换绑 canonical 的**专用**签名（角色白名单 + 本地绑定校验 + 自检）。
//!
//! **为什么不是「任意串签名预言机」**（四层门槛，任一层不满足即拒绝、绝不签名）：
//! 1. **角色白名单**：只接受 `request` / `approve` 两个角色；`admin` / 空 / `REQUEST`（大小写变体）
//!    等一律 `InvalidInput`，不解析、不签名；
//! 2. **canonical 严格形状**：只接受两种冻结形状——
//!    `hbut-rebind-v1|request|…`（7 段）与 `hbut-rebind-v1|approve|…`（8 段）；
//!    前缀/角色不符、段数错、空字段、`|` 注入、`request_id` 非 32 位小写 hex、
//!    `new_pubkey_sha256` 非 64 位小写 hex、设备 id 形状非法、`ts` 非整数 → 一律拒绝；
//! 3. **本地绑定校验**（不得为别的设备/学号签名，与 P1-1 的「三重绑定」同纪律）：
//!    - `request`（新设备发起）：canonical 的 `new_device_id` 必须等于**本机** device_id，
//!      且 canonical 的学号必须等于调用方传入的 `student_id` **且**等于本机当前登录会话学号；
//!    - `approve`（旧设备批准）：canonical 的 `approver_device_id` 必须等于**本机** device_id
//!      （只有当前活跃设备能批准，新设备单方面永远签不出合法 approve）；
//! 4. **自检后才返回**：签名后必须用公钥独立验签，失败 → `Internal`，绝不返回未自检的签名。
//!
//! 边界（**本模块不负责**）：
//! - **不造密钥 / 不碰 keyring / DB / 网络**：与 `sign_canonical` 同纯函数纪律，
//!   由命令层加载密钥、提交请求；
//! - **不构建 canonical**：只对调用方交来的 canonical 做校验 + 签名；canonical 由服务端
//!   按其存储的 pending 记录独立重建并验签（换机码里的材料与 canonical 不一致时签名必然验不过）；
//! - **不做换机码编解码**：按规格 §3.0，transfer code 的 codec 只在 TS 侧实现一份，
//!   Rust 侧只做形状校验（已由本模块的 `parse_rebind_canonical` 承担）。
//!
//! 日志/返回零敏感：错误文案为稳定简体中文，绝不含 canonical 明文、完整学号、完整签名、
//! 私钥或公钥材料；成功返回复用 P1-1 的 `SignedCanonical`（签名 + canonical 的 sha256 摘要）。

use base64::{engine::general_purpose, Engine as _};

use super::device_key::DeviceKey;
use super::errors::IdentityError;
use super::sign_canonical::{canonical_sha256, is_valid_device_id, SignedCanonical, SIGN_ALG};

/// 换绑 canonical 前缀（与 ocr-service P1-3 冻结口径一致）。
pub const REBIND_PREFIX: &str = "hbut-rebind-v1";

/// 角色：发起换绑（新设备用本机密钥签）。
pub const ROLE_REQUEST: &str = "request";

/// 角色：批准换绑（旧设备用本机密钥签）。
pub const ROLE_APPROVE: &str = "approve";

/// 换绑 canonical 的严格解析结果（一个结构覆盖两种角色；canonical 中不存在的段为空串）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebindCanonicalParts {
    /// `request` 或 `approve`。
    pub role: String,
    /// approve 第 3 段（32 位小写 hex）；request 串**无此段**，为空串。
    pub request_id: String,
    /// 新设备 id（request 第 3 段 / approve 第 5 段）。
    pub new_device_id: String,
    /// request 第 4 段（学号）；approve 串**不含学号段**，为空串。
    pub student_id: String,
    /// approve 第 4 段（批准方 = 旧设备 id）；request 串无此段，为空串。
    pub approver_device_id: String,
    /// 新设备公钥 sha256（64 位小写 hex）。
    pub new_pubkey_sha256: String,
    /// 一次性 nonce。
    pub nonce: String,
    /// unix 秒。
    pub ts: i64,
}

/// 32 位小写 hex（`request_id` 的形状口径）。
fn is_request_id(value: &str) -> bool {
    value.len() == 32
        && value
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// 64 位小写 hex（`new_pubkey_sha256` 的形状口径，与服务端 `rebind.pubkey_sha256` 同口径）。
fn is_pubkey_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// 严格解析换绑 canonical；任何形状异常 → `None`（不返回部分字段，避免「形状校验被绕过」）。
///
/// 接受的形状（与 ocr-service P1-3 逐字节一致，无末尾换行）：
/// - request（7 段）：`hbut-rebind-v1|request|<new_device_id>|<student_id>|<new_pubkey_sha256>|<nonce>|<ts>`
/// - approve（8 段）：`hbut-rebind-v1|approve|<request_id>|<approver_device_id>|<new_device_id>|<new_pubkey_sha256>|<nonce>|<ts>`
///
/// 拒绝（任一命中 → `None`）：前缀/角色不符、段数不符、任意空字段、`|` 注入（段数必然溢出）、
/// `request_id` 非 32 位小写 hex、`new_pubkey_sha256` 非 64 位小写 hex、设备 id 形状非法、`ts` 非整数。
pub fn parse_rebind_canonical(text: &str) -> Option<RebindCanonicalParts> {
    let parts: Vec<&str> = text.split('|').collect();
    match parts.len() {
        7 => {
            // request 形状：第 1 段固定前缀，第 2 段固定角色
            if parts[0] != REBIND_PREFIX || parts[1] != ROLE_REQUEST {
                return None;
            }
            let new_device_id = parts[2];
            let student_id = parts[3];
            // 空字段 → 拒绝（含 `|` 的字段已被段数检查拦截）
            if new_device_id.is_empty() || student_id.is_empty() || parts[5].is_empty() {
                return None;
            }
            if !is_valid_device_id(new_device_id) {
                return None;
            }
            if !is_pubkey_sha256(parts[4]) {
                return None;
            }
            let ts = parts[6].parse::<i64>().ok()?;
            Some(RebindCanonicalParts {
                role: ROLE_REQUEST.to_string(),
                request_id: String::new(),
                new_device_id: new_device_id.to_string(),
                student_id: student_id.to_string(),
                approver_device_id: String::new(),
                new_pubkey_sha256: parts[4].to_string(),
                nonce: parts[5].to_string(),
                ts,
            })
        }
        8 => {
            // approve 形状：第 1 段固定前缀，第 2 段固定角色
            if parts[0] != REBIND_PREFIX || parts[1] != ROLE_APPROVE {
                return None;
            }
            let request_id = parts[2];
            let approver_device_id = parts[3];
            let new_device_id = parts[4];
            if request_id.is_empty()
                || approver_device_id.is_empty()
                || new_device_id.is_empty()
                || parts[6].is_empty()
            {
                return None;
            }
            if !is_request_id(request_id)
                || !is_valid_device_id(approver_device_id)
                || !is_valid_device_id(new_device_id)
            {
                return None;
            }
            if !is_pubkey_sha256(parts[5]) {
                return None;
            }
            let ts = parts[7].parse::<i64>().ok()?;
            Some(RebindCanonicalParts {
                role: ROLE_APPROVE.to_string(),
                request_id: request_id.to_string(),
                new_device_id: new_device_id.to_string(),
                student_id: String::new(),
                approver_device_id: approver_device_id.to_string(),
                new_pubkey_sha256: parts[5].to_string(),
                nonce: parts[6].to_string(),
                ts,
            })
        }
        _ => None,
    }
}

/// 换绑专用签名实现（纯函数：不碰 keyring / DB / 网络，便于单测覆盖全部拒绝路径）。
///
/// 校验顺序（与模块头「四层门槛」一致）：
/// 角色白名单 → 本机 device_id 形状 →（request：会话学号必须存在）→ canonical 严格解析 →
/// canonical 角色 == 请求角色 → 本地绑定 → 签名 → 公钥自检。任一失败 → `Err`，**绝不**签名。
///
/// `student_id` 仅 `request` 角色使用（必须等于 canonical 学号且等于会话学号）；`approve`
/// 不使用学号，忽略该参数。
pub fn sign_rebind_impl(
    key: &DeviceKey,
    role: &str,
    canonical: &str,
    local_device_id: &str,
    session_student_id: &str,
    student_id: Option<&str>,
) -> Result<SignedCanonical, IdentityError> {
    // 1) 角色白名单：只接受 request/approve（大小写敏感，未知角色直接拒绝）
    let role = role.trim();
    if role != ROLE_REQUEST && role != ROLE_APPROVE {
        return Err(IdentityError::InvalidInput(
            "role 非法：换绑专用签名只接受 request / approve".to_string(),
        ));
    }
    // 2) 本机 device_id 形状（与 P1-1 同口径：8–128 位，字符集 [A-Za-z0-9._:-]）
    let local_device_id = local_device_id.trim();
    if !is_valid_device_id(local_device_id) {
        return Err(IdentityError::InvalidInput(
            "device_id 形状非法（须 8–128 位，字符集 [A-Za-z0-9._:-]）".to_string(),
        ));
    }
    // 3) request 必须有本地登录会话（未登录 → 明确拒绝，不静默成功）；approve 不依赖会话
    let session_student_id = session_student_id.trim();
    if role == ROLE_REQUEST && session_student_id.is_empty() {
        return Err(IdentityError::NoLocalLogin);
    }
    // 4) canonical 严格解析（前缀/角色/段数/字段形状/hex/ts）
    let parts = parse_rebind_canonical(canonical).ok_or_else(|| {
        IdentityError::InvalidInput(
            "canonical 非法：须为 hbut-rebind-v1|request|…（7 段）或 hbut-rebind-v1|approve|…（8 段）"
                .to_string(),
        )
    })?;
    // 5) canonical 的角色必须与请求角色一致（role=request 不能签 approve 串，反之亦然）
    if parts.role != role {
        return Err(IdentityError::InvalidInput(
            "canonical 角色与请求角色不符，拒绝签名".to_string(),
        ));
    }
    // 6) 本地绑定：不得为别的设备/别的学号签名
    let signed_student_id = if role == ROLE_REQUEST {
        let caller_student_id = match student_id {
            Some(value) => value.trim(),
            None => {
                return Err(IdentityError::InvalidInput(
                    "request 角色必须提供 student_id".to_string(),
                ))
            }
        };
        if caller_student_id.is_empty() {
            return Err(IdentityError::InvalidInput(
                "student_id 不得为空".to_string(),
            ));
        }
        if parts.new_device_id != local_device_id {
            return Err(IdentityError::InvalidInput(
                "canonical 的 new_device_id 与本机 device_id 不一致，拒绝签名".to_string(),
            ));
        }
        if parts.student_id != caller_student_id {
            return Err(IdentityError::InvalidInput(
                "canonical 的学号与调用方学号不一致，拒绝签名".to_string(),
            ));
        }
        if caller_student_id != session_student_id {
            return Err(IdentityError::InvalidInput(
                "拒绝为当前登录学号以外的学号签名".to_string(),
            ));
        }
        caller_student_id.to_string()
    } else {
        // approve：只有本机（当前活跃设备）能批准
        if parts.approver_device_id != local_device_id {
            return Err(IdentityError::InvalidInput(
                "canonical 的 approver_device_id 与本机 device_id 不一致，拒绝签名".to_string(),
            ));
        }
        // approve 的 canonical 不含学号段：返回结构中学号留空（命令层按掩码处理）
        String::new()
    };
    // 7) 签名（Ed25519 64 字节 → base64url 无 padding）
    let raw = key.sign(canonical.as_bytes());
    let signature = general_purpose::URL_SAFE_NO_PAD.encode(raw);
    // 8) 自检：返回前必须独立验签通过（与 P1-1 同纪律；失败 → Internal，绝不返回未自检的签名）
    DeviceKey::verify_with_public_key(&key.public_jwk().x, canonical.as_bytes(), &raw).map_err(
        |_| IdentityError::Internal("签名自检失败，已拒绝返回（不会返回未自检的签名）".to_string()),
    )?;
    Ok(SignedCanonical {
        signature,
        alg: SIGN_ALG,
        device_id: local_device_id.to_string(),
        student_id: signed_student_id,
        canonical_sha256: canonical_sha256(canonical),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCAL_DEVICE: &str = "device-test-0001";
    const OTHER_DEVICE: &str = "device-other-0002";
    const STUDENT_ID: &str = "2510231106";
    const OTHER_STUDENT: &str = "9999999999";
    const REQUEST_ID: &str = "0123456789abcdef0123456789abcdef";
    const PUBKEY_SHA: &str = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const NONCE: &str = "nonce-rebind-0001";
    const TS: i64 = 1_794_260_000;

    fn key() -> DeviceKey {
        DeviceKey::from_seed([7u8; 32])
    }

    fn request_canonical(new_device_id: &str, student_id: &str) -> String {
        format!(
            "{REBIND_PREFIX}|{ROLE_REQUEST}|{new_device_id}|{student_id}|{PUBKEY_SHA}|{NONCE}|{TS}"
        )
    }

    fn approve_canonical(request_id: &str, approver_device_id: &str) -> String {
        format!("{REBIND_PREFIX}|{ROLE_APPROVE}|{request_id}|{approver_device_id}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|{TS}")
    }

    /// 独立验签：只依赖公开材料（public_jwk.x + canonical + 签名）。
    fn verify_independently(signed: &SignedCanonical, canonical: &str) {
        let raw = general_purpose::URL_SAFE_NO_PAD
            .decode(signed.signature.as_bytes())
            .expect("签名必须是合法 base64url");
        let sig: [u8; 64] = raw.as_slice().try_into().expect("签名必须 64 字节");
        DeviceKey::verify_with_public_key(&key().public_jwk().x, canonical.as_bytes(), &sig)
            .expect("独立验签必须通过");
    }

    /// 用例 1：request 角色成功 + 独立验签。
    #[test]
    fn request_success_and_independent_verify() {
        let canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        let signed = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(STUDENT_ID),
        )
        .expect("合法 request 必须签名成功");
        assert_eq!(signed.alg, "Ed25519");
        assert_eq!(signed.signature.len(), 86, "base64url 无 padding → 86 字符");
        assert_eq!(signed.device_id, LOCAL_DEVICE);
        assert_eq!(signed.student_id, STUDENT_ID);
        assert_eq!(signed.canonical_sha256, canonical_sha256(&canonical));
        verify_independently(&signed, &canonical);
    }

    /// 用例 2a：request 的 new_device_id 不是本机 → 不签名（新设备单方面不能冒充别的设备）。
    #[test]
    fn request_rejects_wrong_new_device_id() {
        let canonical = request_canonical(OTHER_DEVICE, STUDENT_ID);
        let err = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(STUDENT_ID),
        )
        .expect_err("new_device_id 不是本机必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
    }

    /// 用例 2b：学号与调用方/会话不一致 → 全部拒绝（不得为他人学号签名）。
    #[test]
    fn request_rejects_student_mismatches() {
        // canonical 学号 == 调用方学号，但与**会话学号**不一致 → 拒绝
        let other_canonical = request_canonical(LOCAL_DEVICE, OTHER_STUDENT);
        let err = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &other_canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(OTHER_STUDENT),
        )
        .expect_err("为他人学号签名必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
        assert!(err.to_string().contains("学号"));

        // 调用方学号与 canonical 学号不一致 → 拒绝
        let good_canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        let err2 = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &good_canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(OTHER_STUDENT),
        )
        .expect_err("调用方学号与 canonical 不一致必须拒绝");
        assert!(
            matches!(err2, IdentityError::InvalidInput(_)),
            "实际：{err2:?}"
        );

        // 未提供 student_id → 拒绝
        let err3 = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &good_canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            None,
        )
        .expect_err("request 缺 student_id 必须拒绝");
        assert!(
            matches!(err3, IdentityError::InvalidInput(_)),
            "实际：{err3:?}"
        );
    }

    /// 用例 2c：会话学号为空（未登录）→ NoLocalLogin。
    #[test]
    fn request_rejects_empty_session() {
        let canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        let err = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &canonical,
            LOCAL_DEVICE,
            "",
            Some(STUDENT_ID),
        )
        .expect_err("会话学号为空必须拒绝");
        assert!(matches!(err, IdentityError::NoLocalLogin), "实际：{err:?}");
    }

    /// 用例 3a：approve 角色成功 + 独立验签。
    #[test]
    fn approve_success_and_independent_verify() {
        let canonical = approve_canonical(REQUEST_ID, LOCAL_DEVICE);
        let signed = sign_rebind_impl(&key(), ROLE_APPROVE, &canonical, LOCAL_DEVICE, "", None)
            .expect("合法 approve 必须签名成功");
        assert_eq!(signed.alg, "Ed25519");
        assert_eq!(signed.device_id, LOCAL_DEVICE);
        assert_eq!(signed.canonical_sha256, canonical_sha256(&canonical));
        verify_independently(&signed, &canonical);
    }

    /// 用例 3b：approve 的 approver 不是本机 → 不签名（只有旧设备/当前活跃设备能批准）。
    #[test]
    fn approve_rejects_wrong_approver() {
        let canonical = approve_canonical(REQUEST_ID, OTHER_DEVICE);
        let err = sign_rebind_impl(&key(), ROLE_APPROVE, &canonical, LOCAL_DEVICE, "", None)
            .expect_err("approver 不是本机必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
    }

    /// 用例 4a：角色白名单——未知/空/大小写变体 → 全部 InvalidInput（不签名）。
    #[test]
    fn role_whitelist_enforced() {
        let canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        for bad_role in ["admin", "", "REQUEST", "Request", "approve-x"] {
            let err = sign_rebind_impl(
                &key(),
                bad_role,
                &canonical,
                LOCAL_DEVICE,
                STUDENT_ID,
                Some(STUDENT_ID),
            )
            .expect_err("{bad_role:?} 必须拒绝");
            assert!(
                matches!(err, IdentityError::InvalidInput(_)),
                "{bad_role:?} 期望 InvalidInput，实际：{err:?}"
            );
        }
    }

    /// 用例 4b：canonical 角色与请求角色不符（双向）→ InvalidInput。
    #[test]
    fn canonical_role_mismatch_rejected() {
        let approve_str = approve_canonical(REQUEST_ID, LOCAL_DEVICE);
        let request_str = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        let err = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &approve_str,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(STUDENT_ID),
        )
        .expect_err("role=request 但串是 approve 必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
        let err2 = sign_rebind_impl(&key(), ROLE_APPROVE, &request_str, LOCAL_DEVICE, "", None)
            .expect_err("role=approve 但串是 request 必须拒绝");
        assert!(
            matches!(err2, IdentityError::InvalidInput(_)),
            "实际：{err2:?}"
        );
    }

    /// 用例 5：形状全拒绝——段数错/前缀角色错/hex 错/空字段/| 注入/ts 非整数/设备 id 形状非法。
    #[test]
    fn parse_rejects_malformed_shapes() {
        let cases: Vec<(&str, String)> = vec![
            ("request 6 段", format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}")),
            (
                "request 8 段",
                format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|{TS}|extra"),
            ),
            (
                "approve 7 段",
                format!("{REBIND_PREFIX}|{ROLE_APPROVE}|{REQUEST_ID}|{LOCAL_DEVICE}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}"),
            ),
            (
                "approve 9 段",
                format!("{REBIND_PREFIX}|{ROLE_APPROVE}|{REQUEST_ID}|{LOCAL_DEVICE}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|{TS}|extra"),
            ),
            ("前缀错误", format!("v1|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|{TS}")),
            ("canonical 角色白名单外", format!("{REBIND_PREFIX}|admin|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|{TS}")),
            ("canonical 角色大写", format!("{REBIND_PREFIX}|Request|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|{TS}")),
            (
                "request_id 非 hex",
                format!("{REBIND_PREFIX}|{ROLE_APPROVE}|0123456789abcdef0123456789abcdez|{LOCAL_DEVICE}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|{TS}"),
            ),
            (
                "request_id 31 位",
                format!("{REBIND_PREFIX}|{ROLE_APPROVE}|0123456789abcdef0123456789abcde|{LOCAL_DEVICE}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|{TS}"),
            ),
            (
                "request_id 大写",
                format!("{REBIND_PREFIX}|{ROLE_APPROVE}|0123456789ABCDEF0123456789ABCDEF|{LOCAL_DEVICE}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|{TS}"),
            ),
            (
                "pubkey 63 位",
                format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{}|{NONCE}|{TS}", &PUBKEY_SHA[..63]),
            ),
            (
                "pubkey 大写",
                format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{}|{NONCE}|{TS}", PUBKEY_SHA.to_uppercase()),
            ),
            (
                "pubkey 非 hex",
                format!(
                    "{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{}z|{NONCE}|{TS}",
                    &PUBKEY_SHA[..63]
                ),
            ),
            ("空字段（request 学号）", format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}||{PUBKEY_SHA}|{NONCE}|{TS}")),
            ("空字段（nonce）", format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}||{TS}")),
            ("空字段（approver）", format!("{REBIND_PREFIX}|{ROLE_APPROVE}|{REQUEST_ID}||{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|{TS}")),
            ("| 注入（段数溢出）", format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|{TS}||x")),
            ("ts 非整数（request）", format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|abc")),
            (
                "ts 非整数（approve）",
                format!("{REBIND_PREFIX}|{ROLE_APPROVE}|{REQUEST_ID}|{LOCAL_DEVICE}|{LOCAL_DEVICE}|{PUBKEY_SHA}|{NONCE}|12.5"),
            ),
            ("设备 id 形状非法", format!("{REBIND_PREFIX}|{ROLE_REQUEST}|short|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}|{TS}")),
            ("空串", String::new()),
        ];
        for (label, bad) in cases {
            assert!(
                parse_rebind_canonical(&bad).is_none(),
                "{label} 必须解析失败：{bad}"
            );
        }
    }

    /// 用例 5 补：形状非法的 canonical 走 sign_rebind_impl 也必须 InvalidInput（不签名）。
    #[test]
    fn sign_rejects_malformed_canonical_without_signing() {
        let bad = format!(
            "{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}"
        ); // 6 段
        let err = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &bad,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(STUDENT_ID),
        )
        .expect_err("形状非法必须拒绝");
        assert!(
            matches!(err, IdentityError::InvalidInput(_)),
            "实际：{err:?}"
        );
    }

    /// 用例 5 补：合法串解析后字段与段位置一一对应（缺失段为空串）。
    #[test]
    fn parse_valid_request_and_approve() {
        let req = parse_rebind_canonical(&request_canonical(LOCAL_DEVICE, STUDENT_ID))
            .expect("合法 request 必须可解析");
        assert_eq!(req.role, ROLE_REQUEST);
        assert_eq!(req.new_device_id, LOCAL_DEVICE);
        assert_eq!(req.student_id, STUDENT_ID);
        assert_eq!(req.new_pubkey_sha256, PUBKEY_SHA);
        assert_eq!(req.nonce, NONCE);
        assert_eq!(req.ts, TS);
        assert!(
            req.request_id.is_empty(),
            "request 串无 request_id 段，应为空串"
        );
        assert!(
            req.approver_device_id.is_empty(),
            "request 串无 approver 段，应为空串"
        );

        let app = parse_rebind_canonical(&approve_canonical(REQUEST_ID, LOCAL_DEVICE))
            .expect("合法 approve 必须可解析");
        assert_eq!(app.role, ROLE_APPROVE);
        assert_eq!(app.request_id, REQUEST_ID);
        assert_eq!(app.approver_device_id, LOCAL_DEVICE);
        assert_eq!(app.new_device_id, LOCAL_DEVICE);
        assert!(app.student_id.is_empty(), "approve 串不含学号段，应为空串");
    }

    /// 用例 6：日志/返回零敏感——所有错误文案不含 canonical 明文/完整学号/公钥材料/request_id。
    #[test]
    fn error_messages_leak_no_sensitive_data() {
        let req_canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        let app_canonical = approve_canonical(REQUEST_ID, LOCAL_DEVICE);
        let errs: Vec<IdentityError> = vec![
            sign_rebind_impl(&key(), "admin", &req_canonical, LOCAL_DEVICE, STUDENT_ID, Some(STUDENT_ID)).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_REQUEST, &req_canonical, LOCAL_DEVICE, "", Some(STUDENT_ID)).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_REQUEST, &request_canonical(OTHER_DEVICE, STUDENT_ID), LOCAL_DEVICE, STUDENT_ID, Some(STUDENT_ID)).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_REQUEST, &req_canonical, LOCAL_DEVICE, OTHER_STUDENT, Some(OTHER_STUDENT)).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_REQUEST, &req_canonical, LOCAL_DEVICE, STUDENT_ID, None).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_APPROVE, &approve_canonical(REQUEST_ID, OTHER_DEVICE), LOCAL_DEVICE, "", None).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_REQUEST, &app_canonical, LOCAL_DEVICE, STUDENT_ID, Some(STUDENT_ID)).unwrap_err(),
            sign_rebind_impl(&key(), ROLE_APPROVE, &req_canonical, LOCAL_DEVICE, "", None).unwrap_err(),
            sign_rebind_impl(
                &key(),
                ROLE_REQUEST,
                &format!("{REBIND_PREFIX}|{ROLE_REQUEST}|{LOCAL_DEVICE}|{STUDENT_ID}|{PUBKEY_SHA}|{NONCE}"),
                LOCAL_DEVICE,
                STUDENT_ID,
                Some(STUDENT_ID),
            )
            .unwrap_err(),
        ];
        for err in &errs {
            let message = err.to_string();
            assert!(
                !message.contains(&req_canonical),
                "错误文案不得含 request canonical 明文：{message}"
            );
            assert!(
                !message.contains(&app_canonical),
                "错误文案不得含 approve canonical 明文：{message}"
            );
            assert!(
                !message.contains(STUDENT_ID),
                "错误文案不得含完整学号：{message}"
            );
            assert!(
                !message.contains(OTHER_STUDENT),
                "错误文案不得含他人完整学号：{message}"
            );
            assert!(
                !message.contains(PUBKEY_SHA),
                "错误文案不得含公钥 sha256：{message}"
            );
            assert!(
                !message.contains(REQUEST_ID),
                "错误文案不得含 request_id：{message}"
            );
        }
        // 返回结构也不含 canonical 明文（只有 86 字符签名 + 64 位摘要 + 公开设备 id）
        let signed = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &req_canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(STUDENT_ID),
        )
        .expect("成功路径必须返回");
        let rendered = format!("{signed:?}");
        assert!(
            !rendered.contains(&req_canonical),
            "返回不得含 canonical 明文：{rendered}"
        );
        assert!(
            !rendered.contains(PUBKEY_SHA),
            "返回不得含公钥 sha256：{rendered}"
        );
    }

    /// 自检必须真的发生：跨 canonical 的签名独立验签必然失败（自检据此拦截）；正常路径成功。
    #[test]
    fn self_check_blocks_unverifiable_signature() {
        let canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        let other = approve_canonical(REQUEST_ID, LOCAL_DEVICE);
        let sig = key().sign(other.as_bytes());
        let unverifiable =
            DeviceKey::verify_with_public_key(&key().public_jwk().x, canonical.as_bytes(), &sig);
        assert!(
            unverifiable.is_err(),
            "跨 canonical 的签名必须验签失败（自检据此拦截）"
        );
        let ok = sign_rebind_impl(
            &key(),
            ROLE_REQUEST,
            &canonical,
            LOCAL_DEVICE,
            STUDENT_ID,
            Some(STUDENT_ID),
        )
        .expect("正常路径必须成功");
        assert_eq!(ok.signature.len(), 86);
    }

    /// 本机 device_id 形状非法 → 拒绝（形状检查在解析 canonical 之前，与 P1-1 同纪律）。
    #[test]
    fn invalid_local_device_id_shape_rejected() {
        let canonical = request_canonical(LOCAL_DEVICE, STUDENT_ID);
        for bad in ["short", "bad|pipe", "", "中文设备"] {
            let err = sign_rebind_impl(
                &key(),
                ROLE_REQUEST,
                &canonical,
                bad,
                STUDENT_ID,
                Some(STUDENT_ID),
            )
            .expect_err("形状非法的 device_id 必须拒绝（不得返回签名）");
            assert!(
                matches!(err, IdentityError::InvalidInput(_)),
                "{bad:?} 期望 InvalidInput，实际：{err:?}"
            );
        }
    }
}
