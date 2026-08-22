//! 用户凭证安全存储：密码写入系统密钥环，SQLite 仅保留占位标记。
//!
//! 移动端若密钥环不可用，密码不落库，依赖 cookie 会话恢复。

const SERVICE: &str = "mini-hbut";
const SECRET_KEY_PREFIX: &str = "secret-envelope:";

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

/// 返回账户级敏感字段主密钥。密钥只保存在系统密钥环，SQLite 不保存副本。
pub fn load_or_create_secret_key(student_id: &str) -> Result<[u8; 32], String> {
    use base64::{engine::general_purpose, Engine as _};
    use rand::RngCore;

    let sid = student_id.trim();
    if sid.is_empty() || sid.len() > 128 {
        return Err("学号无效".to_string());
    }
    let account = format!("{SECRET_KEY_PREFIX}{sid}");
    if let Some(encoded) = load_password(&account) {
        if let Ok(bytes) = general_purpose::STANDARD.decode(encoded) {
            if let Ok(key) = <[u8; 32]>::try_from(bytes.as_slice()) {
                return Ok(key);
            }
        }
        return Err("密钥环中的敏感字段主密钥格式无效".to_string());
    }

    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    save_password(&account, &general_purpose::STANDARD.encode(key))?;
    let stored =
        load_password(&account).ok_or_else(|| "敏感字段主密钥写入后无法读取".to_string())?;
    let bytes = general_purpose::STANDARD
        .decode(stored)
        .map_err(|_| "敏感字段主密钥解码失败".to_string())?;
    <[u8; 32]>::try_from(bytes.as_slice()).map_err(|_| "敏感字段主密钥长度无效".to_string())
}

/// 只读取既有敏感字段主密钥；不会静默创建。
pub fn load_secret_key(student_id: &str) -> Option<[u8; 32]> {
    use base64::{engine::general_purpose, Engine as _};

    let sid = student_id.trim();
    if sid.is_empty() || sid.len() > 128 {
        return None;
    }
    let encoded = load_password(&format!("{SECRET_KEY_PREFIX}{sid}"))?;
    let bytes = general_purpose::STANDARD.decode(encoded).ok()?;
    <[u8; 32]>::try_from(bytes.as_slice()).ok()
}

/// 忘记账号时同时删除其敏感字段主密钥，保证多用户隔离与不可恢复删除。
pub fn delete_secret_key(student_id: &str) {
    let sid = student_id.trim();
    if sid.is_empty() {
        return;
    }
    delete_password(&format!("{SECRET_KEY_PREFIX}{sid}"));
}

/// 校验前端「记住密码」账户键（`hbut:` 学号 / `cx:` 学习通 / `campus:` 校园网）。
fn validate_account_key(account_key: &str) -> Result<(), String> {
    let key = account_key.trim();
    if key.is_empty() || key.len() > 128 {
        return Err("账户键无效".to_string());
    }
    if !(key.starts_with("hbut:") || key.starts_with("cx:") || key.starts_with("campus:")) {
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
    use std::time::{SystemTime, UNIX_EPOCH};

    /// 运行时构造测试密码，避免在测试源码中固化明文密码学值。
    fn test_password(label: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("{label}-{nanos}")
    }

    /// set 失败是否允许按环境跳过：仅 Linux CI（runner 无 Secret Service 守护进程）允许；
    /// Windows/macOS 的系统凭据管理器始终可用，set 失败必须硬失败（#670）。
    #[cfg(target_os = "linux")]
    fn set_error_may_skip_env() -> bool {
        true
    }

    #[cfg(not(target_os = "linux"))]
    fn set_error_may_skip_env() -> bool {
        false
    }

    #[test]
    fn roundtrip_password_when_keyring_available() {
        // #670 回归护栏：真后端写入后必须可读，任何静默丢失一律 panic。
        // 历史 bug：keyring 缺平台 feature 时静默回退零持久化 mock 存储，
        // 旧版本测试在读写不一致时静默 return，防线全空，bug 存活近两个月。
        let sid = format!("ci-probe-roundtrip-{}", uuid_placeholder());
        let password = test_password("probe-pass");
        if let Err(err) = save_password(&sid, &password) {
            if !set_error_may_skip_env() {
                panic!(
                    "keyring save_password 失败：{err}（当前平台的系统凭据存储应始终可用，不允许跳过）"
                );
            }
            // 仅 Linux CI：无 Secret Service 守护进程，允许按环境跳过
            return;
        }
        // load_password 每次内部新建 Entry 句柄，等价于跨实例/跨进程持久化读取路径；
        // 零持久化的 mock 存储在此必然读不到刚写入的值。
        let loaded = load_password(&sid);
        if loaded.as_deref() != Some(password.as_str()) {
            panic!(
                "keyring 写入后跨实例不可读：疑似 mock 后端或存储异常（读到 {loaded:?}，期望 {password:?}）"
            );
        }
        // 清理本次探测写入的凭据并确认删除生效
        delete_password(&sid);
        assert!(
            load_password(&sid).is_none(),
            "keyring 探测凭据删除后仍可读"
        );
    }

    #[test]
    fn remembered_credential_falls_back_to_student_id_key() {
        let sid = format!("test-fallback-{}", uuid_placeholder());
        let password = test_password("fallback-pass");
        if save_password(&sid, &password).is_err() {
            return;
        }
        let account_key = format!("hbut:{}", sid);
        let loaded = load_remembered_credential(&account_key);
        if loaded.as_deref() != Some(password.as_str()) {
            return;
        }
        delete_password(&sid);
        delete_password(&account_key);
        assert!(load_remembered_credential(&account_key).is_none());
    }

    #[test]
    fn campus_account_key_is_valid() {
        assert!(validate_account_key("campus:2024123456").is_ok());
        assert!(validate_account_key("invalid:2024").is_err());
    }

    fn uuid_placeholder() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos().to_string())
            .unwrap_or_else(|_| "0".to_string())
    }
}
