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

#[cfg(test)]
mod tests {
    use super::super::encrypt_password_aes;

    #[test]
    fn test_encrypt_password() {
        let password = "TEST_PASSWORD";
        let salt = "bs2jwEB0FWpj6MW0";
        
        let result = encrypt_password_aes(password, salt).unwrap();
        
        println!("Password: {} (len: {})", password, password.len());
        println!("Salt: {}", salt);
        println!("Encrypted: {} (len: {})", result, result.len());
        
        // 正确的加密结果应该是 108 字符
        // 64 字节随机前缀 + 15 字节密码 = 79 字节
        // PKCS7 填充到 80 字节
        // Base64(80) = 108 字符
        assert_eq!(result.len(), 108, "Encrypted password should be 108 chars, got {}", result.len());
    }
}



