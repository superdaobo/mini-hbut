//! P2-4：OIDC 登录会话存储（Casdoor 授权码 + PKCE 流程的令牌落点）。
//!
//! 安全边界（规格 §3「会话存储」）：
//! - 会话（access_token / refresh_token / id_token 等）**只**进 OS keyring：
//!   service = `mini-hbut-identity-oidc` / account = `session`，值为紧凑 JSON；
//! - keyring 不可用 → fail closed 上报 `secure_storage_unavailable`，**绝不**落明文文件；
//! - 与设备密钥（service `mini-hbut-identity` / account `device-ed25519-v1`）完全隔离：
//!   退出登录（logout）只清本模块条目，不动设备密钥；
//! - 零泄露：本模块只做序列化/反序列化，任何路径不打印、不 Debug 会话内容
//!   （`OidcSession` 故意不 derive `Debug`）。

use super::keyring::{KeyringLike, RealKeyring};
use super::sign_canonical::mask_student_id;

/// OIDC 会话的 Keyring 逻辑 key（P2-4 固定；与设备密钥的 `mini-hbut-identity` 隔离）。
pub const OIDC_KEYRING_SERVICE: &str = "mini-hbut-identity-oidc";
pub const OIDC_KEYRING_ACCOUNT: &str = "session";

/// OIDC 会话内容（以单条 JSON 字符串存入 keyring）。
///
/// 全部字段来自「令牌交换 + id_token 校验通过」之后的可信结果；
/// 整个结构只允许进入 keyring，禁止进日志/返回体。
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct OidcSession {
    /// access_token（**禁止**打印/入库/进返回体）
    pub access_token: String,
    /// refresh_token（Casdoor 可能不返回 → None）
    pub refresh_token: Option<String>,
    /// id_token 原文（RS256 已校验；后续静默刷新/对账用）
    pub id_token: String,
    /// 学号（来自校验通过的 id_token claims）
    pub student_id: String,
    /// 姓名（可空）
    pub student_name: Option<String>,
    /// 过期时间（unix 秒；id_token 的 exp）
    pub exp: i64,
    /// 签发时间（unix 秒；id_token 的 iat）
    pub iat: i64,
    /// 签发方（= 配置 issuer，归一化后）
    pub issuer: String,
    /// 客户端 id（与登录配置一致）
    pub client_id: String,
}

impl OidcSession {
    /// 学号掩码（前 4 位 + `***`；长度 < 8 全掩，与既有 `mask_student_id` 同口径）。
    /// 这是本会话唯一允许对外输出的学号形态。
    pub fn student_id_masked(&self) -> String {
        mask_student_id(&self.student_id)
    }
}

/// 会话存储错误分类（只有一类：安全存储不可用）。
///
/// 细节（底层 keyring 报错原文）保留在内部供日志排障，但**不得**进入面向用户的
/// 返回体——命令层一律映射为固定 kind `secure_storage_unavailable`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OidcSessionError {
    /// keyring 不可用（条目无法打开 / 读写失败 / 写后读回校验失败）。
    Unavailable(String),
}

/// 会话存储：包装 `KeyringLike`（生产 = `RealKeyring`；测试注入 Memory/Failing fake）。
pub struct OidcSessionStore {
    keyring: Box<dyn KeyringLike>,
}

impl OidcSessionStore {
    /// 生产实例：OS Keyring（`mini-hbut-identity-oidc` / `session`）。
    pub fn real() -> Self {
        Self::with_keyring(Box::new(RealKeyring::with_account(
            OIDC_KEYRING_SERVICE,
            OIDC_KEYRING_ACCOUNT,
        )))
    }

    /// 测试/注入用：自定义 KeyringLike 实现。
    pub fn with_keyring(keyring: Box<dyn KeyringLike>) -> Self {
        Self { keyring }
    }

    /// 保存会话（**只在 keyring 可用时写**）：
    /// 1. 序列化为 JSON 写入 keyring；
    /// 2. 写后回读校验（全新句柄必须读到同值；防「零持久化 mock 后端」假成功，#669 同款防线）；
    /// 3. 任一步失败 → 清理可能半写入的条目并返回 `Unavailable`——**绝不**降级明文文件。
    pub fn save(&self, session: &OidcSession) -> Result<(), OidcSessionError> {
        let json = serde_json::to_string(session)
            .map_err(|e| OidcSessionError::Unavailable(format!("会话序列化失败：{e}")))?;
        self.keyring
            .set_secret(&json)
            .map_err(OidcSessionError::Unavailable)?;
        // 写后读回校验：RealKeyring 每次调用都新建 Entry，可发现 mock 后端的假写入。
        let stored = self
            .keyring
            .get_secret()
            .map_err(OidcSessionError::Unavailable)?;
        if stored.as_deref() != Some(json.as_str()) {
            // 不一致（mock 后端/半写入）：删除残留后 fail closed，绝不保留假会话。
            let _ = self.keyring.delete_secret();
            return Err(OidcSessionError::Unavailable(
                "会话写入后回读校验失败".to_string(),
            ));
        }
        Ok(())
    }

    /// 读取会话：
    /// - 条目不存在 → `Ok(None)`（未登录）；
    /// - keyring 错误 → `Err(Unavailable)`（fail closed，命令层映射固定 kind）；
    /// - 值损坏（非合法 JSON）→ 删除并视为无会话（自愈：令牌本就无法恢复，
    ///   不让坏条目永久卡死「安全存储不可用」状态，与 device_key 的自愈口径一致）。
    pub fn load(&self) -> Result<Option<OidcSession>, OidcSessionError> {
        let json = self
            .keyring
            .get_secret()
            .map_err(OidcSessionError::Unavailable)?;
        let Some(json) = json else {
            return Ok(None);
        };
        match serde_json::from_str::<OidcSession>(&json) {
            Ok(session) => Ok(Some(session)),
            Err(_) => {
                let _ = self.keyring.delete_secret();
                Ok(None)
            }
        }
    }

    /// 删除会话（logout 用；条目不存在视为成功——RealKeyring 对 NoEntry 已按成功处理）。
    pub fn delete(&self) -> Result<(), OidcSessionError> {
        self.keyring
            .delete_secret()
            .map_err(OidcSessionError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;
    use crate::identity::keyring::{FailingKeyring, MemoryKeyring};

    /// MemoryKeyring 的共享句柄（它本身非 Clone，测试需要「store 持有一份、
    /// 测试侧再读一次原始值」做校验）。
    #[derive(Clone)]
    struct SharedMemoryKeyring(std::sync::Arc<MemoryKeyring>);

    impl SharedMemoryKeyring {
        fn new() -> Self {
            Self(std::sync::Arc::new(MemoryKeyring::new()))
        }
        fn raw(&self) -> Option<String> {
            self.0.get_secret().expect("内存 keyring 不应失败")
        }
        fn set_raw(&self, value: &str) {
            self.0.set_secret(value).expect("内存 keyring 不应失败")
        }
    }

    impl KeyringLike for SharedMemoryKeyring {
        fn get_secret(&self) -> Result<Option<String>, String> {
            self.0.get_secret()
        }
        fn set_secret(&self, value: &str) -> Result<(), String> {
            self.0.set_secret(value)
        }
        fn delete_secret(&self) -> Result<(), String> {
            self.0.delete_secret()
        }
    }

    /// 构造一个测试会话（学号 8 位，可走「前 4 位 + ***」掩码口径）。
    fn test_session() -> OidcSession {
        OidcSession {
            access_token: "at-test-token".to_string(),
            refresh_token: Some("rt-test-token".to_string()),
            id_token: "eyJtYXJrZXIiOiJpZC10b2tlbiJ9".to_string(),
            student_id: "20241234".to_string(),
            student_name: Some("测试同学".to_string()),
            exp: 2_000_000_000,
            iat: 1_999_999_000,
            issuer: "https://issuer.example".to_string(),
            client_id: "client-test".to_string(),
        }
    }

    #[test]
    fn save_load_roundtrip_via_memory_keyring() {
        let keyring = SharedMemoryKeyring::new();
        let store = OidcSessionStore::with_keyring(Box::new(keyring.clone()));
        let session = test_session();
        store.save(&session).expect("内存 keyring 写入应成功");
        let loaded = store.load().expect("读取不应失败").expect("应存在会话");
        assert_eq!(loaded.access_token, session.access_token);
        assert_eq!(loaded.student_id, session.student_id);
        assert_eq!(loaded.exp, session.exp);
        assert_eq!(loaded.client_id, session.client_id);
        // 值必须是 JSON（keyring 里存的是序列化结果，不是裸 token）
        let raw = keyring.raw().unwrap();
        assert!(raw.starts_with('{') && raw.contains("\"access_token\""));
        store.delete().expect("删除应成功");
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn failing_keyring_is_fail_closed() {
        // keyring 不可用：save/load/delete 全部 Err（绝不降级明文文件）
        let store = OidcSessionStore::with_keyring(Box::new(FailingKeyring));
        let session = test_session();
        assert!(matches!(
            store.save(&session),
            Err(OidcSessionError::Unavailable(_))
        ));
        assert!(matches!(
            store.load(),
            Err(OidcSessionError::Unavailable(_))
        ));
        assert!(matches!(
            store.delete(),
            Err(OidcSessionError::Unavailable(_))
        ));
    }

    /// 模拟「零持久化 mock 后端」（#669）：set 假成功、新句柄读不到 →
    /// save 必须回读校验失败并 fail closed，不得假成功。
    struct MockBackendKeyring;

    impl KeyringLike for MockBackendKeyring {
        fn get_secret(&self) -> Result<Option<String>, String> {
            Ok(None)
        }
        fn set_secret(&self, _value: &str) -> Result<(), String> {
            Ok(())
        }
        fn delete_secret(&self) -> Result<(), String> {
            Ok(())
        }
    }

    #[test]
    fn save_detects_zero_persistence_mock_backend() {
        let store = OidcSessionStore::with_keyring(Box::new(MockBackendKeyring));
        assert!(
            store.save(&test_session()).is_err(),
            "mock 后端必须被回读校验识破"
        );
    }

    #[test]
    fn corrupted_value_self_heals_to_absent() {
        // 预置一条损坏值（非 JSON）→ load 应删除并返回 None（自愈，不卡死）
        let keyring = SharedMemoryKeyring::new();
        keyring.set_raw("!! corrupted-json !!");
        let store = OidcSessionStore::with_keyring(Box::new(keyring.clone()));
        assert!(store.load().expect("读取不应失败").is_none());
        assert!(keyring.raw().is_none(), "损坏条目必须被删除（自愈）");
    }

    #[test]
    fn student_id_masked_never_leaks_full_id() {
        let session = test_session();
        let masked = session.student_id_masked();
        assert_eq!(masked, "2024***");
        assert!(!masked.contains(&session.student_id));
        // 短学号（<8 位）全掩
        let short = OidcSession {
            student_id: "123".to_string(),
            ..test_session()
        };
        assert_eq!(short.student_id_masked(), "***");
    }
}
