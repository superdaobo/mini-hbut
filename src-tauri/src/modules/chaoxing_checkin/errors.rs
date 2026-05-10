// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 签到错误码定义与中文消息映射。

/// 签到操作错误码枚举。
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckinErrorCode {
    NetworkError,
    SessionExpired,
    BadRequest,
    ServerError,
    AlreadySigned,
    RateLimited,
    PermissionDenied,
    Unknown,
}

/// 将错误码映射为面向用户的中文提示消息。
///
/// `_body_hint` 保留用于未来根据响应体细化提示，当前不直出原文。
pub fn human_message(code: CheckinErrorCode, _body_hint: Option<&str>) -> String {
    match code {
        CheckinErrorCode::NetworkError => "网络连接失败，请检查网络后重试".to_string(),
        CheckinErrorCode::SessionExpired => "登录已过期，请重新登录学习通".to_string(),
        CheckinErrorCode::BadRequest => "请求参数错误，请检查输入".to_string(),
        CheckinErrorCode::ServerError => "学习通服务暂时不可用，请稍后再试".to_string(),
        CheckinErrorCode::AlreadySigned => "该活动已完成签到".to_string(),
        CheckinErrorCode::RateLimited => "操作太频繁，请稍后再试".to_string(),
        CheckinErrorCode::PermissionDenied => "当前设备不支持该功能".to_string(),
        CheckinErrorCode::Unknown => "签到失败，请稍后再试".to_string(),
    }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn all_variants_have_chinese_message() {
        let codes = [
            CheckinErrorCode::NetworkError,
            CheckinErrorCode::SessionExpired,
            CheckinErrorCode::BadRequest,
            CheckinErrorCode::ServerError,
            CheckinErrorCode::AlreadySigned,
            CheckinErrorCode::RateLimited,
            CheckinErrorCode::PermissionDenied,
            CheckinErrorCode::Unknown,
        ];
        for code in codes {
            let msg = human_message(code, None);
            assert!(!msg.is_empty(), "消息不应为空: {:?}", code);
            // 确保包含中文字符
            assert!(
                msg.chars().any(|c| c >= '\u{4e00}' && c <= '\u{9fff}'),
                "消息应包含中文: {:?} -> {}",
                code,
                msg
            );
        }
    }

    #[test]
    fn message_does_not_contain_html_tags() {
        let codes = [
            CheckinErrorCode::NetworkError,
            CheckinErrorCode::SessionExpired,
            CheckinErrorCode::BadRequest,
            CheckinErrorCode::ServerError,
            CheckinErrorCode::AlreadySigned,
            CheckinErrorCode::RateLimited,
            CheckinErrorCode::PermissionDenied,
            CheckinErrorCode::Unknown,
        ];
        for code in codes {
            let msg = human_message(code, None);
            assert!(!msg.contains('<'), "消息不应含 '<': {:?}", code);
            assert!(!msg.contains('>'), "消息不应含 '>': {:?}", code);
        }
    }

    #[test]
    fn body_hint_does_not_leak() {
        let msg = human_message(CheckinErrorCode::ServerError, Some("Internal Server Error 500"));
        assert!(!msg.contains("Internal"));
        assert!(!msg.contains("500"));
    }
}

#[cfg(test)]
mod proptest_p18_human_message {
    // Feature: chaoxing-checkin, Property 18: 错误消息中文化
    // Validates: Requirements 9.1, 9.6
    use super::*;
    use proptest::prelude::*;

    fn arb_error_code() -> impl Strategy<Value = CheckinErrorCode> {
        prop_oneof![
            Just(CheckinErrorCode::NetworkError),
            Just(CheckinErrorCode::SessionExpired),
            Just(CheckinErrorCode::BadRequest),
            Just(CheckinErrorCode::ServerError),
            Just(CheckinErrorCode::AlreadySigned),
            Just(CheckinErrorCode::RateLimited),
            Just(CheckinErrorCode::PermissionDenied),
            Just(CheckinErrorCode::Unknown),
        ]
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(128))]
        #[test]
        fn message_no_html_no_long_english(code in arb_error_code(), hint in proptest::option::of(".*")) {
            let msg = human_message(code, hint.as_deref());
            // 不含 HTML 标签字符
            prop_assert!(!msg.contains('<'), "消息含 '<': {}", msg);
            prop_assert!(!msg.contains('>'), "消息含 '>': {}", msg);
            // 不含超过 20 字节的连续 ASCII 英文片段
            let ascii_runs: Vec<&str> = msg.split(|c: char| !c.is_ascii_alphabetic()).collect();
            for run in ascii_runs {
                prop_assert!(
                    run.len() <= 20,
                    "消息含长英文片段(>20B): '{}' in '{}'",
                    run,
                    msg
                );
            }
            // 消息非空
            prop_assert!(!msg.is_empty());
        }
    }
}
