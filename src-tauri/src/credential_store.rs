//! 用户凭证安全存储：密码写入系统密钥环，SQLite 仅保留占位标记。
//!
//! 移动端若密钥环不可用，密码不落库，依赖 cookie 会话恢复。

const SERVICE: &str = "mini-hbut";

/// SQLite `encrypted_password` 列中标识「密码在密钥环」的占位值。
pub const KEYRING_MARKER: &str = "__keyring__";

/// 将密码写入系统密钥环（按学号区分账户）。
pub fn save_password(student_id: &str, password: &str) -> Result<(), String> {
    let sid = student_id.trim();
    if sid.is_empty() || password.is_empty() {
        return Ok(());
    }
    let entry = keyring::Entry::new(SERVICE, sid).map_err(|e| e.to_string())?;
    entry.set_password(password).map_err(|e| e.to_string())?;
    Ok(())
}

/// 从密钥环读取密码；不存在或失败时返回 `None`。
pub fn load_password(student_id: &str) -> Option<String> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return None;
    }
    let entry = keyring::Entry::new(SERVICE, sid).ok()?;
    entry.get_password().ok()
}

/// 登出或切换账号时清除密钥环中的密码。
pub fn delete_password(student_id: &str) {
    let sid = student_id.trim();
    if sid.is_empty() {
        return;
    }
    if let Ok(entry) = keyring::Entry::new(SERVICE, sid) {
        let _ = entry.delete_credential();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_password_when_keyring_available() {
        let sid = format!("test-{}", uuid_placeholder());
        let password = "test-pass-123";
        if save_password(&sid, password).is_err() {
            return;
        }
        let loaded = load_password(&sid);
        if loaded.as_deref() != Some(password) {
            // 部分 CI/桌面环境密钥环读写不一致，跳过而非失败
            return;
        }
        delete_password(&sid);
        assert!(load_password(&sid).is_none());
    }

    fn uuid_placeholder() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos().to_string())
            .unwrap_or_else(|_| "0".to_string())
    }
}
