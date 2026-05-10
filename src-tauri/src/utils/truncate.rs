//! 敏感字段截断工具函数。

/// 截断敏感值用于日志输出。
///
/// - 若值长度 ≤ 8 字节，返回 `<len-N>` 格式（不暴露内容）
/// - 否则保留前 8 个字符并追加 `...`
pub fn truncate_sensitive(value: &str) -> String {
    if value.len() <= 8 {
        return format!("<len-{}>", value.len());
    }
    let head: String = value.chars().take(8).collect();
    format!("{}...", head)
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn short_value_hidden() {
        assert_eq!(truncate_sensitive(""), "<len-0>");
        assert_eq!(truncate_sensitive("abc"), "<len-3>");
        assert_eq!(truncate_sensitive("12345678"), "<len-8>");
    }

    #[test]
    fn long_value_truncated() {
        assert_eq!(truncate_sensitive("123456789"), "12345678...");
        assert_eq!(truncate_sensitive("abcdefghijklmnop"), "abcdefgh...");
    }
}

#[cfg(test)]
mod proptest_p16_truncate {
    // Feature: chaoxing-checkin, Property 16: 日志字段截断
    // Validates: Requirements 13.5
    use super::*;
    use proptest::prelude::*;

    /// 生成字节长度 ≤ 8 的 ASCII 字符串（避免多字节字符导致 byte len > 8）
    fn short_ascii_string() -> impl Strategy<Value = String> {
        "[a-z0-9]{0,8}"
    }

    /// 生成字节长度 > 8 的字符串
    fn long_string() -> impl Strategy<Value = String> {
        "[a-z0-9]{9,50}"
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]
        #[test]
        fn short_values_never_leak_content(value in short_ascii_string()) {
            prop_assume!(value.len() <= 8);
            let result = truncate_sensitive(&value);
            prop_assert!(result.starts_with("<len-"), "短值应以 '<len-' 开头: '{}'", result);
            prop_assert!(result.ends_with('>'), "短值应以 '>' 结尾: '{}'", result);
            // 验证长度标注正确
            let expected = format!("<len-{}>", value.len());
            prop_assert_eq!(result, expected);
        }

        #[test]
        fn long_values_truncated_with_ellipsis(value in long_string()) {
            prop_assume!(value.len() > 8);
            let result = truncate_sensitive(&value);
            prop_assert!(result.ends_with("..."), "长值应以 '...' 结尾: '{}'", result);
            // 截断后总长度有限（8 chars + "..." = 最多 11 字符 + 多字节字符）
            let without_ellipsis = &result[..result.len() - 3];
            prop_assert!(
                without_ellipsis.chars().count() <= 8,
                "截断前缀不应超过 8 字符: '{}'",
                without_ellipsis
            );
        }

        #[test]
        fn result_never_contains_full_long_value(value in long_string()) {
            prop_assume!(value.len() > 8);
            let result = truncate_sensitive(&value);
            prop_assert_ne!(result, value, "截断结果不应等于原始值");
        }
    }
}
