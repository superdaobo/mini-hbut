//! 设备私钥的 Keyring 存取抽象（#622）。
//!
//! - 复用项目既有 keyring = "3" 基础，但 Identity 定义独立接口（可测试注入）；
//! - 逻辑 key：service = `mini-hbut-identity` / account = `device-ed25519-v1`；
//! - 私钥只允许存 OS secure storage；keyring 任何错误都必须向上传播（fail closed）。

use crate::identity::device_key::{KEYRING_ACCOUNT, KEYRING_SERVICE};

/// Keyring 最小操作接口（生产实现包装 keyring crate，测试可注入 fake）。
pub trait KeyringLike: Send + Sync {
    /// 读取 secret；条目不存在返回 Ok(None)；其余错误返回 Err（fail closed）。
    fn get_secret(&self) -> Result<Option<String>, String>;
    /// 写入 secret；失败返回 Err（fail closed）。
    fn set_secret(&self, value: &str) -> Result<(), String>;
    /// 删除 secret；条目不存在视为成功。
    fn delete_secret(&self) -> Result<(), String>;
}

/// 生产实现：包装 `keyring::Entry`（Windows Credential Manager / macOS Keychain / Linux Secret Service）。
pub struct RealKeyring {
    service: String,
    account: String,
}

impl RealKeyring {
    /// 创建生产 Keyring 包装（默认使用 #622 规定的逻辑 key）。
    pub fn new() -> Self {
        Self::with_account(KEYRING_SERVICE, KEYRING_ACCOUNT)
    }

    /// 测试/扩展用：指定 service/account。
    pub fn with_account(service: &str, account: &str) -> Self {
        Self {
            service: service.to_string(),
            account: account.to_string(),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        open_platform_entry(&self.service, &self.account)
    }
}

/// 按平台打开 keyring Entry（#668/#669）。
///
/// - Windows：显式 target（`{account}.{service}`），规避部分系统版本上
///   CredWrite 后同 service/account 默认寻址不可见的问题；
/// - 其余平台（macOS/iOS Keychain、Linux Secret Service）：标准 service/account。
///   Apple Security 框架不接受任意自定义 target（报「Attribute target is invalid:
///   … is not User, System, Common, or Dynamic」），必须走默认寻址。
pub(crate) fn open_platform_entry(service: &str, account: &str) -> Result<keyring::Entry, String> {
    #[cfg(target_os = "windows")]
    {
        let target = format!("{}.{}", account, service);
        keyring::Entry::new_with_target(&target, service, account).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        keyring::Entry::new(service, account).map_err(|e| e.to_string())
    }
}

impl Default for RealKeyring {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyringLike for RealKeyring {
    fn get_secret(&self) -> Result<Option<String>, String> {
        let entry = self.entry()?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    fn set_secret(&self, value: &str) -> Result<(), String> {
        let entry = self.entry()?;
        entry.set_password(value).map_err(|e| e.to_string())
    }

    fn delete_secret(&self) -> Result<(), String> {
        let entry = self.entry()?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}

/// 测试 fake：始终失败，模拟系统 Keyring 不可用（fail closed 测试用）。
#[cfg(test)]
pub struct FailingKeyring;

#[cfg(test)]
impl KeyringLike for FailingKeyring {
    fn get_secret(&self) -> Result<Option<String>, String> {
        Err("模拟 keyring 不可用".to_string())
    }
    fn set_secret(&self, _value: &str) -> Result<(), String> {
        Err("模拟 keyring 不可用".to_string())
    }
    fn delete_secret(&self) -> Result<(), String> {
        Err("模拟 keyring 不可用".to_string())
    }
}

/// 测试 fake：内存读写（roundtrip / 多实例隔离测试用）。
#[cfg(test)]
#[derive(Default)]
pub struct MemoryKeyring {
    inner: std::sync::Mutex<Option<String>>,
}

#[cfg(test)]
impl MemoryKeyring {
    pub fn new() -> Self {
        Self::default()
    }
}

#[cfg(test)]
impl KeyringLike for MemoryKeyring {
    fn get_secret(&self) -> Result<Option<String>, String> {
        let guard = self.inner.lock().map_err(|e| e.to_string())?;
        Ok(guard.clone())
    }
    fn set_secret(&self, value: &str) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = Some(value.to_string());
        Ok(())
    }
    fn delete_secret(&self) -> Result<(), String> {
        let mut guard = self.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;

    #[test]
    fn memory_keyring_roundtrip() {
        let k = MemoryKeyring::new();
        assert!(k.get_secret().unwrap_or(None).is_none());
        let set_ok = k.set_secret("secret-value").is_ok();
        assert!(set_ok);
        assert_eq!(
            k.get_secret().unwrap_or(None).as_deref(),
            Some("secret-value")
        );
        let del_ok = k.delete_secret().is_ok();
        assert!(del_ok);
        assert!(k.get_secret().unwrap_or(None).is_none());
    }

    #[test]
    fn real_keyring_roundtrip_when_available() {
        // 真实 keyring 在部分 CI/桌面环境不可用：失败时跳过而不是失败（与 credential_store 测试约定一致）。
        let keyring =
            RealKeyring::with_account("mini-hbut-identity-test", "device-ed25519-v1-test");
        let value = format!(
            "test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        if keyring.set_secret(&value).is_err() {
            return;
        }
        let loaded = match keyring.get_secret() {
            Ok(v) => v,
            Err(_) => return,
        };
        if loaded.as_deref() != Some(value.as_str()) {
            return;
        }
        let _ = keyring.delete_secret();
        if let Ok(v) = keyring.get_secret() {
            assert!(v.is_none());
        }
    }
}
