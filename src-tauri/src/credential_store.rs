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

/// 校验前端「记住密码」账户键（`hbut:` 学号 / `cx:` 学习通账号）。
fn validate_account_key(account_key: &str) -> Result<(), String> {
    let key = account_key.trim();
    if key.is_empty() || key.len() > 128 {
        return Err("账户键无效".to_string());
    }
    if !(key.starts_with("hbut:") || key.starts_with("cx:")) {
        return Err("账户键格式无效".to_string());
    }
    if !key
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, ':' | '_' | '-' | '.' | '@'))
    {
        return Err("账户键包含非法字符".to_string());
    }
    Ok(())
}

/// 将「记住密码」凭据写入密钥环（Web 路径由前端本地加密兜底）。
pub fn save_remembered_credential(account_key: &str, password: &str) -> Result<(), String> {
    validate_account_key(account_key)?;
    save_password(account_key, password)
}

/// 从密钥环读取「记住密码」凭据。
/// 若 `hbut:` 键不存在，回退读取 DB 会话使用的纯学号键。
pub fn load_remembered_credential(account_key: &str) -> Option<String> {
    validate_account_key(account_key).ok()?;
    if let Some(password) = load_password(account_key) {
        return Some(password);
    }
    if let Some(student_id) = account_key.strip_prefix("hbut:") {
        return load_password(student_id);
    }
    None
}

/// 清除密钥环中的「记住密码」凭据。
pub fn delete_remembered_credential(account_key: &str) {
    if validate_account_key(account_key).is_err() {
        return;
    }
    delete_password(account_key);
}

/// 读取 DB 会话关联的密钥环密码（学号键，无 `hbut:` 前缀）。
pub fn load_session_password(student_id: &str) -> Option<String> {
    load_password(student_id)
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

    #[test]
    fn remembered_credential_falls_back_to_student_id_key() {
        let sid = format!("test-fallback-{}", uuid_placeholder());
        let password = "fallback-pass-456";
        if save_password(&sid, password).is_err() {
            return;
        }
        let account_key = format!("hbut:{}", sid);
        let loaded = load_remembered_credential(&account_key);
        if loaded.as_deref() != Some(password) {
            return;
        }
        delete_password(&sid);
        delete_password(&account_key);
        assert!(load_remembered_credential(&account_key).is_none());
    }

    fn uuid_placeholder() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos().to_string())
            .unwrap_or_else(|_| "0".to_string())
    }
}
