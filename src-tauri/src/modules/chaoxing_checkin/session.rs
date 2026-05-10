// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 会话过期检测与自愈逻辑。

use reqwest::StatusCode;

/// 检测学习通会话是否已过期。
///
/// 规则（与 design.md §3.8 一致）：
/// - HTTP 302 且最终 URL 包含 `authserver/login`
/// - 响应体包含 `请先登录`
/// - 响应体包含 `passport2.chaoxing.com/login`
/// - 最终 URL 包含 `passport2.chaoxing.com`
pub fn detect_session_expired(status: StatusCode, final_url: &str, body: &str) -> bool {
    // 302 重定向到登录页
    if status == StatusCode::FOUND && final_url.contains("authserver/login") {
        return true;
    }
    // 响应体中包含登录提示
    if body.contains("请先登录") {
        return true;
    }
    // 响应体中包含 passport2 登录链接
    if body.contains("passport2.chaoxing.com/login") {
        return true;
    }
    // 最终 URL 被重定向到 passport2
    if final_url.contains("passport2.chaoxing.com") {
        return true;
    }
    false
}

#[cfg(test)]
mod detect_unit {
    use super::*;

    #[test]
    fn detects_302_redirect_to_authserver() {
        assert!(detect_session_expired(
            StatusCode::FOUND,
            "https://cas.hbut.edu.cn/authserver/login?service=...",
            ""
        ));
    }

    #[test]
    fn detects_body_contains_please_login() {
        assert!(detect_session_expired(
            StatusCode::OK,
            "https://mobilelearn.chaoxing.com/page",
            "<html><body>请先登录再操作</body></html>"
        ));
    }

    #[test]
    fn detects_body_contains_passport2_login_url() {
        assert!(detect_session_expired(
            StatusCode::OK,
            "https://mobilelearn.chaoxing.com/page",
            r#"<script>location.href="https://passport2.chaoxing.com/login?..."</script>"#
        ));
    }

    #[test]
    fn detects_final_url_is_passport2() {
        assert!(detect_session_expired(
            StatusCode::OK,
            "https://passport2.chaoxing.com/login?fid=123",
            "<html>登录页面</html>"
        ));
    }

    #[test]
    fn normal_response_not_expired() {
        assert!(!detect_session_expired(
            StatusCode::OK,
            "https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist",
            r#"{"data":{"activeList":[]}}"#
        ));
    }

    #[test]
    fn server_error_not_expired() {
        assert!(!detect_session_expired(
            StatusCode::INTERNAL_SERVER_ERROR,
            "https://mobilelearn.chaoxing.com/error",
            "Internal Server Error"
        ));
    }

    #[test]
    fn redirect_to_non_login_not_expired() {
        assert!(!detect_session_expired(
            StatusCode::FOUND,
            "https://mobilelearn.chaoxing.com/redirect/other",
            ""
        ));
    }

    #[test]
    fn empty_body_and_normal_url_not_expired() {
        assert!(!detect_session_expired(
            StatusCode::OK,
            "https://mooc1-api.chaoxing.com/mycourse/backclazzdata",
            ""
        ));
    }
}

#[cfg(test)]
mod proptest_p9_session_selfheal {
    // Feature: chaoxing-checkin, Property 9: 会话自愈一致性
    // **Validates: Requirements 2.6, 9.2, 9.3**
    use super::*;
    use proptest::prelude::*;

    /// 生成已知会导致过期检测的场景。
    fn arb_expired_scenario() -> impl Strategy<Value = (StatusCode, String, String)> {
        prop_oneof![
            // 302 + authserver/login in URL
            Just((
                StatusCode::FOUND,
                "https://cas.hbut.edu.cn/authserver/login?service=xxx".to_string(),
                "".to_string()
            )),
            // body 含 "请先登录"
            any::<u8>().prop_map(|_| (
                StatusCode::OK,
                "https://mobilelearn.chaoxing.com/page".to_string(),
                "页面内容请先登录后操作".to_string()
            )),
            // body 含 passport2 login URL
            any::<u8>().prop_map(|_| (
                StatusCode::OK,
                "https://mobilelearn.chaoxing.com/page".to_string(),
                "redirect to passport2.chaoxing.com/login?fid=0".to_string()
            )),
            // final_url 含 passport2.chaoxing.com
            any::<u8>().prop_map(|_| (
                StatusCode::OK,
                "https://passport2.chaoxing.com/login?fid=123".to_string(),
                "login page".to_string()
            )),
        ]
    }

    /// 生成正常（非过期）场景。
    fn arb_normal_scenario() -> impl Strategy<Value = (StatusCode, String, String)> {
        let normal_urls = vec![
            "https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist",
            "https://mooc1-api.chaoxing.com/mycourse/backclazzdata",
            "https://pan-yz.chaoxing.com/upload",
        ];
        let normal_bodies = vec![
            r#"{"data":{"activeList":[]}}"#,
            r#"{"channelList":[]}"#,
            r#"{"objectId":"abc123"}"#,
            "success",
            "",
        ];
        (
            prop_oneof![Just(StatusCode::OK), Just(StatusCode::CREATED)],
            proptest::sample::select(normal_urls),
            proptest::sample::select(normal_bodies),
        )
            .prop_map(|(status, url, body)| (status, url.to_string(), body.to_string()))
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// 所有已知过期场景都应被检测到。
        #[test]
        fn expired_scenarios_detected((status, url, body) in arb_expired_scenario()) {
            prop_assert!(
                detect_session_expired(status, &url, &body),
                "应检测为过期: status={:?}, url={}, body={}",
                status, url, body
            );
        }

        /// 正常场景不应被误判为过期。
        #[test]
        fn normal_scenarios_not_expired((status, url, body) in arb_normal_scenario()) {
            prop_assert!(
                !detect_session_expired(status, &url, &body),
                "不应检测为过期: status={:?}, url={}, body={}",
                status, url, body
            );
        }

        /// detect_session_expired 是纯函数：相同输入始终返回相同结果。
        #[test]
        fn detection_is_deterministic(
            (status, url, body) in arb_expired_scenario()
        ) {
            let r1 = detect_session_expired(status, &url, &body);
            let r2 = detect_session_expired(status, &url, &body);
            prop_assert_eq!(r1, r2, "检测结果应确定性");
        }
    }
}
