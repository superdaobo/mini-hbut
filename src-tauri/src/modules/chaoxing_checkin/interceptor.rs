// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 请求目的地拦截器 — 域名白名单强制校验。
//!
//! 所有签到相关 HTTP 请求在发起前必须通过域名白名单检查，
//! 防止恶意 QR URL 或参数注入导致请求发往非预期目标。

use super::errors::CheckinErrorCode;

/// 安全域名白名单（与 design.md §9.1 一致）。
pub const SAFE_DOMAIN_WHITELIST: &[&str] = &[
    "passport2.chaoxing.com",
    "i.chaoxing.com",
    "mobilelearn.chaoxing.com",
    "mooc1-api.chaoxing.com",
    "mooc1.chaoxing.com",
    "pan-yz.chaoxing.com",
    "k.chaoxing.com",
    "www.chaoxing.com",
    "hbut.edu.cn",
    "hbut.jw.chaoxing.com",
];

/// 检查 URL 的 host 是否在白名单中。
///
/// 匹配规则：
/// - 仅允许 HTTPS 协议
/// - 精确匹配白名单中的域名
/// - 后缀匹配 `.chaoxing.com`
/// - 后缀匹配 `.hbut.edu.cn`
pub fn is_domain_allowed(url: &str) -> bool {
    if let Ok(parsed) = url::Url::parse(url) {
        // 仅允许 HTTPS
        if parsed.scheme() != "https" {
            return false;
        }
        if let Some(host) = parsed.host_str() {
            return SAFE_DOMAIN_WHITELIST.contains(&host)
                || host.ends_with(".chaoxing.com")
                || host.ends_with(".hbut.edu.cn");
        }
    }
    false
}

/// 断言 URL 域名在白名单中，否则返回 `PermissionDenied`。
///
/// - debug 模式下额外 panic（便于开发期发现问题）
/// - release 模式返回错误码
pub fn assert_domain_allowed(url: &str) -> Result<(), CheckinErrorCode> {
    if is_domain_allowed(url) {
        Ok(())
    } else {
        #[cfg(debug_assertions)]
        panic!(
            "域名白名单拦截：URL '{}' 的 host 不在允许列表中",
            url
        );
        #[cfg(not(debug_assertions))]
        Err(CheckinErrorCode::PermissionDenied)
    }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn allows_whitelisted_domains() {
        assert!(is_domain_allowed("https://mobilelearn.chaoxing.com/pptSign?activeId=123"));
        assert!(is_domain_allowed("https://mooc1-api.chaoxing.com/mycourse/backclazzdata"));
        assert!(is_domain_allowed("https://pan-yz.chaoxing.com/upload"));
        assert!(is_domain_allowed("https://passport2.chaoxing.com/login"));
        assert!(is_domain_allowed("https://hbut.edu.cn/something"));
        assert!(is_domain_allowed("https://hbut.jw.chaoxing.com/path"));
    }

    #[test]
    fn allows_subdomain_suffix_match() {
        // 任何 .chaoxing.com 子域名
        assert!(is_domain_allowed("https://new-service.chaoxing.com/api"));
        assert!(is_domain_allowed("https://deep.sub.chaoxing.com/path"));
        // 任何 .hbut.edu.cn 子域名
        assert!(is_domain_allowed("https://jwxt.hbut.edu.cn/login"));
        assert!(is_domain_allowed("https://lib.hbut.edu.cn/search"));
    }

    #[test]
    fn rejects_non_whitelisted_domains() {
        assert!(!is_domain_allowed("https://evil.com/steal"));
        assert!(!is_domain_allowed("https://chaoxing.com.evil.com/phish"));
        assert!(!is_domain_allowed("https://notchaoxing.com/fake"));
        assert!(!is_domain_allowed("https://example.org/test"));
        assert!(!is_domain_allowed("http://localhost:8080/api"));
    }

    #[test]
    fn rejects_invalid_urls() {
        assert!(!is_domain_allowed("not a url"));
        assert!(!is_domain_allowed(""));
        assert!(!is_domain_allowed("ftp://mobilelearn.chaoxing.com/path"));
    }

    #[test]
    fn assert_allowed_returns_ok_for_valid() {
        assert!(assert_domain_allowed("https://mobilelearn.chaoxing.com/api").is_ok());
    }

    #[test]
    #[cfg(not(debug_assertions))]
    fn assert_allowed_returns_err_for_invalid() {
        let result = assert_domain_allowed("https://evil.com/steal");
        assert_eq!(result, Err(CheckinErrorCode::PermissionDenied));
    }
}

#[cfg(test)]
mod proptest_p8_domain_whitelist {
    // Feature: chaoxing-checkin, Property 8: 网络目的地白名单
    // **Validates: Requirements 11.5, 13.1, 13.2**
    use super::*;
    use proptest::prelude::*;

    /// 生成白名单内的 URL。
    fn arb_allowed_url() -> impl Strategy<Value = String> {
        let domains = vec![
            "mobilelearn.chaoxing.com",
            "mooc1-api.chaoxing.com",
            "pan-yz.chaoxing.com",
            "passport2.chaoxing.com",
            "i.chaoxing.com",
            "k.chaoxing.com",
            "www.chaoxing.com",
            "hbut.edu.cn",
        ];
        let paths = vec!["/api", "/login", "/upload", "/pptSign", "/preSign", "/mycourse"];
        (
            proptest::sample::select(domains),
            proptest::sample::select(paths),
        )
            .prop_map(|(domain, path)| format!("https://{}{}", domain, path))
    }

    /// 生成白名单外的 URL。
    fn arb_rejected_url() -> impl Strategy<Value = String> {
        let evil_domains = vec![
            "evil.com",
            "chaoxing.com.evil.com",
            "notchaoxing.com",
            "example.org",
            "google.com",
            "attacker.io",
            "phish.net",
        ];
        let paths = vec!["/steal", "/phish", "/api", "/login"];
        (
            proptest::sample::select(evil_domains),
            proptest::sample::select(paths),
        )
            .prop_map(|(domain, path)| format!("https://{}{}", domain, path))
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// 白名单内的 URL 始终被允许。
        #[test]
        fn whitelisted_urls_always_allowed(url in arb_allowed_url()) {
            prop_assert!(is_domain_allowed(&url), "应允许: {}", url);
        }

        /// 白名单外的 URL 始终被拒绝。
        #[test]
        fn non_whitelisted_urls_always_rejected(url in arb_rejected_url()) {
            prop_assert!(!is_domain_allowed(&url), "应拒绝: {}", url);
        }

        /// 任意 .chaoxing.com 子域名被允许（后缀匹配）。
        #[test]
        fn any_chaoxing_subdomain_allowed(
            sub in "[a-z]{1,10}",
        ) {
            let url = format!("https://{}.chaoxing.com/path", sub);
            prop_assert!(is_domain_allowed(&url), "应允许子域名: {}", url);
        }

        /// 任意 .hbut.edu.cn 子域名被允许（后缀匹配）。
        #[test]
        fn any_hbut_subdomain_allowed(
            sub in "[a-z]{1,10}",
        ) {
            let url = format!("https://{}.hbut.edu.cn/path", sub);
            prop_assert!(is_domain_allowed(&url), "应允许子域名: {}", url);
        }
    }
}
