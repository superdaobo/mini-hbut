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
        // 显式 target（与 Windows 默认拼接 {user}.{service} 一致），
        // 避免默认路径在部分 Windows 版本上 CredWrite 后不可见的问题。
        let target = format!("{}.{}", self.account, self.service);
        keyring::Entry::new_with_target(&target, &self.service, &self.account)
            .map_err(|e| e.to_string())
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

    /// set 失败是否允许按环境跳过：仅 Linux CI（runner 无 Secret Service 守护进程）允许；
    /// Windows/macOS 的系统凭据存储始终可用，set 失败必须硬失败（#670）。
    #[cfg(target_os = "linux")]
    fn set_error_may_skip_env() -> bool {
        true
    }

    #[cfg(not(target_os = "linux"))]
    fn set_error_may_skip_env() -> bool {
        false
    }

    #[test]
    fn real_keyring_roundtrip_when_available() {
        // #670 回归护栏：keyring 必须走真实平台后端并真正落盘。
        // 历史 bug：keyring 缺平台 feature 时静默回退零持久化 mock 存储，
        // 本测试旧版在 set/get 失败时静默 return，防线全空，bug 存活近两个月。
        // 现改为硬断言：实例 A 写入成功后，独立实例 B 必须读到同值，否则 panic。
        const SERVICE: &str = "mini-hbut-identity-ci-probe";
        const ACCOUNT: &str = "roundtrip-probe";

        // 探测值带时间戳，避免历史残留条目干扰断言
        let value = format!(
            "probe-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );

        // 实例 A：写入探测值
        let writer = RealKeyring::with_account(SERVICE, ACCOUNT);
        if let Err(err) = writer.set_secret(&value) {
            if !set_error_may_skip_env() {
                panic!(
                    "keyring set_password 失败：{err}（当前平台的系统凭据存储应始终可用，不允许跳过）"
                );
            }
            // 仅 Linux CI：无 Secret Service 守护进程，允许按环境跳过
            return;
        }

        // 实例 B：全新句柄读取（等价于进程重启后的持久化读取路径，mock 存储在此必然失守）
        let reader = RealKeyring::with_account(SERVICE, ACCOUNT);
        let loaded = match reader.get_secret() {
            Ok(v) => v,
            Err(err) => {
                panic!("keyring 写入后跨实例不可读：疑似 mock 后端或存储异常（读取报错：{err}）")
            }
        };
        if loaded.as_deref() != Some(value.as_str()) {
            panic!(
                "keyring 写入后跨实例不可读：疑似 mock 后端或存储异常（读到 {loaded:?}，期望 {value:?}）"
            );
        }

        // 清理探测条目并确认删除生效，避免污染用户真实凭据库
        writer.delete_secret().expect("清理 keyring 探测条目失败");
        assert!(
            reader.get_secret().ok().flatten().is_none(),
            "keyring 探测条目删除后仍可读"
        );
    }
}
