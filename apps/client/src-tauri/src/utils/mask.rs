//! 学号脱敏工具函数。

/// 对学号进行脱敏处理：保留前 2 位和后 2 位，中间用 `****` 替代。
///
/// 若学号少于 4 个字符，返回 `"****"`。
pub fn mask_student_id(sid: &str) -> String {
    if sid.chars().count() < 4 {
        return "****".to_string();
    }
    let chars: Vec<char> = sid.chars().collect();
    let head: String = chars[..2].iter().collect();
    let tail: String = chars[chars.len() - 2..].iter().collect();
    format!("{}****{}", head, tail)
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn normal_student_id() {
        assert_eq!(mask_student_id("2021123456"), "20****56");
    }

    #[test]
    fn exactly_four_chars() {
        assert_eq!(mask_student_id("abcd"), "ab****cd");
    }

    #[test]
    fn short_id() {
        assert_eq!(mask_student_id("abc"), "****");
        assert_eq!(mask_student_id(""), "****");
        assert_eq!(mask_student_id("a"), "****");
    }

    #[test]
    fn unicode_id() {
        // 4 个中文字符
        assert_eq!(mask_student_id("张三李四"), "张三****李四");
    }
}

#[cfg(test)]
mod proptest_p15_mask_student_id {
    // Feature: chaoxing-checkin, Property 15: 学号脱敏纯函数
    // Validates: Requirements 13.3
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]
        #[test]
        fn short_ids_fully_masked(sid in ".{0,3}") {
            let masked = mask_student_id(&sid);
            prop_assert_eq!(masked, "****");
        }

        #[test]
        fn long_ids_preserve_head_tail(sid in ".{4,30}") {
            let masked = mask_student_id(&sid);
            let chars: Vec<char> = sid.chars().collect();
            let head: String = chars[..2].iter().collect();
            let tail: String = chars[chars.len()-2..].iter().collect();
            prop_assert!(masked.starts_with(&head), "应以 '{}' 开头，实际: '{}'", head, masked);
            prop_assert!(masked.ends_with(&tail), "应以 '{}' 结尾，实际: '{}'", tail, masked);
            prop_assert!(masked.contains("****"), "应含 '****'，实际: '{}'", masked);
        }

        #[test]
        fn masked_never_contains_full_original(sid in ".{5,30}") {
            let masked = mask_student_id(&sid);
            // 脱敏后不应包含完整原始字符串（长度 >= 5 时中间被替换）
            prop_assert_ne!(masked, sid);
        }
    }
}
