//! DEV 自检缝（P0-7 / goal-10 身份 v2）：本地签名 + 自检，**不联网、不碰服务端**。
//!
//! 生产 fail closed（双层门禁，与 `__HBUT_IDENTITY_AT_STUB__` 同类做法）：编译期要求
//! `cfg!(debug_assertions)` 打开（release 构建恒为 false），运行期要求环境变量
//! `MINI_HBUT_IDENTITY_V2_DEV` 为 `"1"`。
//!
//! 任一条件不满足 → 命令仍注册存在但直接返回错误，绝不返回任何签名材料。
//!
//! 安全约定：
//! - 私钥只走既有 `DeviceKeyStore`（OS keyring），本模块不新增密钥、不降级；
//! - 日志只允许 `device_id`、alg、`self_check_ok`、签名长度、错误类型；
//!   绝不打印私钥、`student_name` 明文、canonical 全文。

use super::device_key::DeviceKeyStore;
use super::v2_signature::{self, V2Proof};

/// DEV 缝开关环境变量名（值必须为 `"1"` 才可用）。
pub const DEV_SEAM_ENV: &str = "MINI_HBUT_IDENTITY_V2_DEV";

/// DEV 缝是否可用：**仅当 debug 构建且 `MINI_HBUT_IDENTITY_V2_DEV == "1"`**。
///
/// 生产（release）构建中 `cfg!(debug_assertions)` 恒为 false → 恒返回 false（fail closed）。
pub fn v2_dev_seam_enabled() -> bool {
    v2_dev_seam_enabled_with(&|key| std::env::var(key).ok())
}

/// 可注入 env 查询的判定实现（`std::env::set_var` 在多线程测试里不安全，
/// 测试用注入函数代替真实环境变量；本函数即门禁逻辑的唯一实现）。
pub fn v2_dev_seam_enabled_with(env: &dyn Fn(&str) -> Option<String>) -> bool {
    // debug_assertions 是编译期条件：release 构建下此分支恒 false，
    // 环境变量在 release 里根本没有读取机会（fail closed）。
    cfg!(debug_assertions) && env(DEV_SEAM_ENV).as_deref() == Some("1")
}

/// DEV 自检命令的输出（序列化给前端；字段 snake_case）。
///
/// 只含公开材料：`V2Proof` 内是公钥 JWK/姓名哈希/签名，均非敏感；`message` 为脱敏人读文案。
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct V2DevSelfcheck {
    pub enabled: bool,
    pub proof: Option<V2Proof>,
    pub self_check_ok: bool,
    pub message: String,
}

/// Tauri 命令（登记名：`identity_v2_dev_sign_selfcheck`）。
///
/// 流程：门禁校验 → 取/建设备密钥（`DeviceKeyStore::create_if_missing`）→
/// 生成 nonce/ts → 签名 → 自检（`verify_v2_proof`）→ 返回结构。
/// 门禁不通过时直接 `Err`（生产构建/未开缝时前端拿不到任何签名材料）。
#[tauri::command]
pub fn identity_v2_dev_sign_selfcheck(
    device_id: String,
    student_id: String,
    student_name: Option<String>,
) -> Result<V2DevSelfcheck, String> {
    if !v2_dev_seam_enabled() {
        // fail closed：不打任何细节（device_id 也未进日志，避免为不可用路径留痕）
        return Err("identity v2 dev seam disabled".to_string());
    }
    let store = DeviceKeyStore::real();
    selfcheck_impl(
        &store,
        &device_id,
        &student_id,
        student_name.as_deref().unwrap_or(""),
    )
}

/// 自检核心逻辑（store 可注入，便于单测用内存 keyring 覆盖成功/失败路径）。
fn selfcheck_impl(
    store: &DeviceKeyStore,
    device_id: &str,
    student_id: &str,
    student_name: &str,
) -> Result<V2DevSelfcheck, String> {
    let key = match store.create_if_missing() {
        Ok(key) => key,
        // 只打错误类型（IdentityError 的 Display 文案本身不含密钥材料）
        Err(err) => {
            log::warn!("[identity] v2 dev 自检：设备密钥获取失败 kind={err:?}");
            return Err(err.to_string());
        }
    };
    let nonce = v2_signature::generate_nonce();
    let ts = v2_signature::now_unix();
    let proof =
        match v2_signature::sign_v2_proof(&key, device_id, student_id, student_name, &nonce, ts) {
            Ok(proof) => proof,
            Err(err) => {
                log::warn!("[identity] v2 dev 自检：签名失败 kind={err:?}");
                return Err(err.to_string());
            }
        };
    let self_check_ok = v2_signature::verify_v2_proof(&proof);
    // 日志只允许：device_id、alg、self_check_ok、签名长度（规格 §3）
    log::info!(
        "[identity] v2 dev 自检：device_id={} alg={} self_check_ok={} sig_len={}",
        device_id,
        proof.alg,
        self_check_ok,
        proof.signature.len()
    );
    let message = if self_check_ok {
        "签名自检通过（verify_v2_proof=true）".to_string()
    } else {
        "签名自检未通过，请检查设备密钥与 proof 字段一致性".to_string()
    };
    Ok(V2DevSelfcheck {
        enabled: true,
        proof: Some(proof),
        self_check_ok,
        message,
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use crate::identity::keyring::{FailingKeyring, MemoryKeyring};

    /// DEV 门禁（规格 §4-5，用可注入判定函数，不碰真实环境变量）：
    /// - 变量缺失 → 不可用；
    /// - 值为 "0"/"true"/" 1"（非精确 "1"）→ 不可用；
    /// - 值为 "1" → 可用（debug 构建）。
    /// release 构建的恒 false 由 `cfg!(debug_assertions)` 编译期保证（本测试为 debug 构建，
    /// 另由 `command_fails_closed_without_dev_env` 覆盖「未开缝 → 命令拒绝」路径）。
    #[test]
    fn seam_gate_is_strict_on_env_value() {
        assert!(!v2_dev_seam_enabled_with(&|_| None), "变量缺失必须不可用");
        assert!(
            !v2_dev_seam_enabled_with(&|_| Some("0".to_string())),
            "\"0\" 必须不可用"
        );
        assert!(
            !v2_dev_seam_enabled_with(&|_| Some("true".to_string())),
            "\"true\" 必须不可用"
        );
        assert!(
            !v2_dev_seam_enabled_with(&|_| Some(" 1".to_string())),
            "带空格的 \" 1\" 必须不可用"
        );
        // 编译期门（独立复核提示）：debug 构建下 env="1" 必须可用；
        // release 构建下 `cfg!(debug_assertions)` 恒 false → 即使 env="1" 也不可用
        // （fail closed 的编译期保证）。两种 profile 下本用例都必须绿。
        if cfg!(debug_assertions) {
            assert!(
                v2_dev_seam_enabled_with(&|_| Some("1".to_string())),
                "debug 构建 + \"1\" 必须可用"
            );
        } else {
            assert!(
                !v2_dev_seam_enabled_with(&|_| Some("1".to_string())),
                "release 构建 + \"1\" 仍必须不可用（编译期门）"
            );
        }
        // 读取的变量名必须是约定的 DEV_SEAM_ENV（Fn 闭包 + RefCell 内部可变性）
        let seen: std::cell::RefCell<Option<String>> = std::cell::RefCell::new(None);
        let _ = v2_dev_seam_enabled_with(&|key| {
            *seen.borrow_mut() = Some(key.to_string());
            Some("1".to_string())
        });
        assert_eq!(seen.borrow().as_deref(), Some(DEV_SEAM_ENV));
        assert_eq!(DEV_SEAM_ENV, "MINI_HBUT_IDENTITY_V2_DEV");
    }

    /// 生产/未开缝路径：环境变量未设时命令直接拒绝（fail closed，不触 keyring）。
    /// 注意：只 remove 不 set，避免多线程 set_var 竞态。
    #[test]
    fn command_fails_closed_without_dev_env() {
        unsafe { std::env::remove_var(DEV_SEAM_ENV) };
        let result = identity_v2_dev_sign_selfcheck(
            "dev-test-0001".to_string(),
            "2510231106".to_string(),
            None,
        );
        let Err(message) = result else {
            panic!("未开缝时命令必须返回 Err");
        };
        assert_eq!(message, "identity v2 dev seam disabled");
    }

    /// 成功路径（注入内存 keyring，不碰真实 keyring）：enabled=true、自检通过、
    /// proof 字段完整、签名 86 字符。
    #[test]
    fn selfcheck_roundtrip_with_memory_keyring() {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let out =
            selfcheck_impl(&store, "dev-test-0001", "2510231106", "张三").expect("自检应成功");
        assert!(out.enabled);
        assert!(out.self_check_ok, "自检必须通过");
        let proof = out.proof.expect("proof 必须存在");
        assert_eq!(proof.device_id, "dev-test-0001");
        assert_eq!(proof.student_id, "2510231106");
        assert_eq!(proof.alg, "Ed25519");
        assert_eq!(proof.signature.len(), 86);
        verify_proof_is_wellformed(&proof);
        // 响应不含姓名明文（只有 sha256 哈希）
        assert!(
            !proof.canonical.contains("张三"),
            "canonical 不得含 student_name 明文"
        );
        assert!(!proof.public_key_jwk.contains("张三"));
    }

    /// 失败路径（keyring 不可用 → fail closed，绝不降级）。
    #[test]
    fn selfcheck_fails_closed_on_keyring_unavailable() {
        let store = DeviceKeyStore::with_keyring(Box::new(FailingKeyring));
        let result = selfcheck_impl(&store, "dev-test-0001", "2510231106", "");
        assert!(
            result.is_err(),
            "keyring 不可用时自检必须失败（fail closed）"
        );
        let message = result.err().expect("已有断言保证 is_err");
        assert!(!message.is_empty(), "错误文案必须非空");
    }

    /// 空 student_name 合法（空串 sha256），且自检通过。
    #[test]
    fn selfcheck_with_empty_student_name() {
        let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
        let out = selfcheck_impl(&store, "dev-test-0001", "2510231106", "").expect("空姓名应合法");
        assert!(out.self_check_ok);
        let proof = out.proof.expect("proof 必须存在");
        assert!(
            proof.student_name_hash.starts_with("e3b0c442"),
            "空姓名必须对应空串 sha256"
        );
    }

    /// 辅助：断言 proof 结构自洽（6 段 canonical + 字段一致）。
    fn verify_proof_is_wellformed(proof: &V2Proof) {
        let parts: Vec<&str> = proof.canonical.split('|').collect();
        assert_eq!(parts.len(), 6);
        assert_eq!(parts[0], "v1");
        assert_eq!(parts[1], proof.device_id);
        assert_eq!(parts[2], proof.student_id);
        assert_eq!(parts[4], proof.nonce);
        assert_eq!(parts[5], proof.ts.to_string());
        assert_eq!(v2_signature::verify_v2_proof(proof), true);
    }
}
