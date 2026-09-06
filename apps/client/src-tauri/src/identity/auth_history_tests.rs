//! #775：授权历史命令层回归测试（store 注入 + canonical 确定性）。
//!
//! 协作约束下的分层设计（见 issue #775 / 任务说明）：
//! - 本文件只做 **store 层** 注入测试（`DeviceKeyStore::with_keyring`）与
//!   canonical 签名确定性测试 —— 不触碰 `commands.rs`，与 #777 的
//!   `fetch_auth_history_impl` 注入测试（命令层）完全正交，避免文件冲突；
//! - 命令层注入测试（无密钥→错误分类 / keyring 失败→错误分类 / device_id 空→
//!   InvalidInput / error_kind 全变体覆盖）由 #777 的实现提交，位于
//!   `commands.rs#[cfg(test)] mod tests`；若集成时该模块尚未落地，
//!   需在本文件补齐（对齐 #777 新契约 `IdentityAuthHistoryOutput`）。
//!
//! 覆盖场景（#775 客户端可测子集的 Rust 侧）：
//! 1. store.load()：无密钥 → Ok(None)（对应命令层 NotEnrolled 分类）；
//! 2. store.load()：keyring 失败 → Err(KeyringUnavailable)（fail closed 分类源头）；
//! 3. canonical：auth-history 请求的 canonical 文本逐字节确定性（GET + 固定 path +
//!    假 device_id + 固定 issued_at/nonce），签名可由公钥验证、篡改即失败；
//! 4. 测试数据一律假学号/假 device_id（device-test-0001），绝不含真实凭据。

#![cfg(test)]

use crate::identity::canonical::{build_device_api_canonical, DeviceApiCanonicalInput};
use crate::identity::device_key::{DeviceKey, DeviceKeyStore};
use crate::identity::errors::IdentityError;
use crate::identity::keyring::{FailingKeyring, MemoryKeyring};

/// 测试用假 device_id（不含真实凭据）。
const TEST_DEVICE_ID: &str = "device-test-0001";

/// auth-history 请求固定 path（与 identity_fetch_auth_history 命令一致）。
const AUTH_HISTORY_PATH: &str = "/api/v1/app/devices/me/auth-history";

// ─── 1/2. store 层错误分类源头（命令层 NotEnrolled/KeyringUnavailable 的上游） ──

#[test]
fn store_load_without_key_returns_none() {
    // 无密钥（MemoryKeyring 空）：load 必须返回 Ok(None)，
    // 命令层据此归类 NotEnrolled（#777 error_kind=not_enrolled），不得 panic。
    let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
    let loaded = store.load().expect("无密钥属于正常态，不应报错");
    assert!(loaded.is_none(), "空 keyring 应返回 None");
}

#[test]
fn store_load_with_failing_keyring_fails_closed() {
    // keyring 不可用：load 返回 KeyringUnavailable（fail closed），
    // 命令层据此归类 keyring_unavailable，绝不降级到文件/SQLite。
    let store = DeviceKeyStore::with_keyring(Box::new(FailingKeyring));
    match store.load() {
        Err(IdentityError::KeyringUnavailable(message)) => {
            assert!(!message.is_empty(), "应携带底层脱敏描述");
        }
        other => panic!("应返回 KeyringUnavailable，实际 {other:?}"),
    }
}

#[test]
fn store_load_after_create_returns_same_key() {
    // 注册后 load 与 create_if_missing 返回同一把密钥（指纹一致），
    // 保证 auth-history 签名设备与 enroll 设备一致。
    let store = DeviceKeyStore::with_keyring(Box::new(MemoryKeyring::new()));
    let created = store
        .create_if_missing()
        .expect("内存 keyring 创建不应失败");
    let loaded = store
        .load()
        .expect("创建后读取不应失败")
        .expect("创建后应有密钥");
    assert_eq!(loaded.fingerprint(), created.fingerprint());
}

// ─── 3. auth-history canonical 确定性（签名链路的可复现核心） ─────────────────

#[test]
fn auth_history_canonical_is_deterministic() {
    // 同一输入两次构建 → 逐字节一致；方法小写自动归一为大写
    let build = || {
        build_device_api_canonical(&DeviceApiCanonicalInput {
            method: "get",
            path: AUTH_HISTORY_PATH,
            device_id: TEST_DEVICE_ID,
            issued_at: 1_755_000_000,
            nonce: "nonce-test-0001",
        })
        .expect("canonical 构建不应失败")
    };
    let first = build();
    let second = build();
    assert_eq!(first, second);
    let expected = format!(
        "MINI-HBUT-DEVICE-API-V1\nmethod=GET\npath={AUTH_HISTORY_PATH}\ndevice_id={TEST_DEVICE_ID}\nissued_at=1755000000\nnonce=nonce-test-0001\n"
    );
    assert_eq!(first, expected, "canonical 必须与 #622 规范逐字节一致");
    assert!(first.ends_with('\n'), "canonical 以单个 LF 结尾");
}

#[test]
fn auth_history_signature_verifies_and_tamper_breaks() {
    // 用确定性 seed 密钥对 auth-history canonical 签名：
    // 公钥可验证；篡改 canonical 任一字节后验证必须失败。
    let seed = [7u8; 32]; // 固定 seed（测试专用，非真实凭据）
    let key = DeviceKey::from_seed(seed);
    let canonical = build_device_api_canonical(&DeviceApiCanonicalInput {
        method: "GET",
        path: AUTH_HISTORY_PATH,
        device_id: TEST_DEVICE_ID,
        issued_at: 1_755_000_000,
        nonce: "nonce-test-0002",
    })
    .expect("canonical 构建不应失败");
    let signature = key.sign(canonical.as_bytes());
    // 公钥（base64url x 字段）跨实例验证 = Core 侧验证路径
    let x = key.public_jwk().x;
    DeviceKey::verify_with_public_key(&x, canonical.as_bytes(), &signature)
        .expect("auth-history 签名必须能被公钥验证");
    // 篡改 path（换行注入等价于改写签名对象）→ 验证失败
    let tampered = canonical.replace(AUTH_HISTORY_PATH, "/api/v1/app/devices/other/history");
    assert_ne!(tampered, canonical);
    assert!(
        DeviceKey::verify_with_public_key(&x, tampered.as_bytes(), &signature).is_err(),
        "篡改 canonical 后原签名必须验证失败"
    );
}
