//! HTTP 客户端通用工具函数。
//!
//! 负责：
//! - 时间戳/日期的辅助转换
//! - 供教务接口拼装参数使用

pub(super) fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

pub(super) fn app_data_dir() -> Option<std::path::PathBuf> {
    if let Ok(raw) = std::env::var("HBUT_APP_DATA_DIR") {
        let dir = std::path::PathBuf::from(raw.trim());
        if !dir.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(&dir);
            return Some(dir);
        }
    }

    let base = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("APPDATA"))
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let dir = std::path::PathBuf::from(base).join("Mini-HBUT");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir)
}

/// 仅 Debug 构建写入应用数据目录，避免污染 cwd。
pub(super) fn write_debug_artifact(filename: &str, content: &str) {
    #[cfg(debug_assertions)]
    if let Some(dir) = app_data_dir() {
        let _ = std::fs::write(dir.join(filename), content);
    }
}

#[cfg(test)]
mod tests {
    use super::super::encrypt_password_aes;

    #[test]
    fn test_encrypt_password() {
        // 测试数据在运行时构造，避免测试源码中出现明文密码/盐值。
        // 密码固定 15 字节、盐固定 16 字节，以维持下方 108 字符断言不变。
        let password = format!("TEST_PW_{:0>7}", std::process::id() % 10_000_000);
        let salt = format!("{:0>16}", std::process::id());

        let result = encrypt_password_aes(&password, &salt).unwrap();

        println!("Password: {} (len: {})", password, password.len());
        println!("Salt: {}", salt);
        println!("Encrypted: {} (len: {})", result, result.len());

        // 正确的加密结果应该是 108 字符
        // 64 字节随机前缀 + 15 字节密码 = 79 字节
        // PKCS7 填充到 80 字节
        // Base64(80) = 108 字符
        assert_eq!(
            result.len(),
            108,
            "Encrypted password should be 108 chars, got {}",
            result.len()
        );
    }
}
