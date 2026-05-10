// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 二维码 URL 解析与组装。
//!
//! 本文件为纯函数，严禁引入 `reqwest` / `tokio::fs` / `std::env` 等副作用依赖。

use super::errors::CheckinErrorCode;

/// 从二维码 URL 中解析出的签到参数。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QrUrlParts {
    pub active_id: String,
    pub enc: String,
}

/// 允许的二维码 URL 主机白名单。
pub const QR_HOST_WHITELIST: &[&str] = &[
    "mobilelearn.chaoxing.com",
    "www.chaoxing.com",
    "k.chaoxing.com",
];

/// 从二维码内容中解析签到参数。
///
/// 容忍 `&amp;` HTML 实体、`%20`/`+` 空格编码、额外 query 参数与 fragment。
/// 主机不在白名单内返回 `BadRequest`；缺少 `enc` 参数返回 `BadRequest`。
pub fn parse(url_str: &str) -> Result<QrUrlParts, CheckinErrorCode> {
    // 处理 HTML 实体编码：&amp; → &
    let decoded = url_str.replace("&amp;", "&");

    let parsed = url::Url::parse(&decoded).map_err(|_| CheckinErrorCode::BadRequest)?;

    // 校验主机白名单
    let host = parsed.host_str().ok_or(CheckinErrorCode::BadRequest)?;
    if !QR_HOST_WHITELIST.contains(&host) {
        return Err(CheckinErrorCode::BadRequest);
    }

    // 提取 query 参数
    let mut enc: Option<String> = None;
    let mut active_id: Option<String> = None;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "enc" => enc = Some(value.into_owned()),
            "activeId" | "id" => {
                if active_id.is_none() {
                    active_id = Some(value.into_owned());
                }
            }
            _ => {} // 容忍额外参数
        }
    }

    let enc = enc.ok_or(CheckinErrorCode::BadRequest)?;
    if enc.is_empty() {
        return Err(CheckinErrorCode::BadRequest);
    }

    // active_id 可选（某些 URL 可能不含），但优先提取
    let active_id = active_id.unwrap_or_default();

    Ok(QrUrlParts { active_id, enc })
}

/// 根据签到参数组装规范 URL（仅用于测试与 round-trip 验证）。
#[cfg(any(test, feature = "testing"))]
pub fn compose(active_id: &str, enc: &str) -> String {
    format!(
        "https://mobilelearn.chaoxing.com/newsign/preSign?activeId={}&enc={}",
        active_id, enc
    )
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn parse_standard_url() {
        let url = "https://mobilelearn.chaoxing.com/newsign/preSign?activeId=123456&enc=abcdef";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "123456");
        assert_eq!(parts.enc, "abcdef");
    }

    #[test]
    fn parse_with_html_entity() {
        let url = "https://mobilelearn.chaoxing.com/newsign/preSign?activeId=123456&amp;enc=abcdef";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "123456");
        assert_eq!(parts.enc, "abcdef");
    }

    #[test]
    fn parse_with_id_param() {
        let url = "https://mobilelearn.chaoxing.com/newsign/preSign?id=789&enc=ff00";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "789");
        assert_eq!(parts.enc, "ff00");
    }

    #[test]
    fn parse_with_extra_params_and_fragment() {
        let url = "https://mobilelearn.chaoxing.com/newsign/preSign?activeId=111&enc=aabb&foo=bar#section";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "111");
        assert_eq!(parts.enc, "aabb");
    }

    #[test]
    fn parse_with_space_encoding() {
        let url = "https://mobilelearn.chaoxing.com/newsign/preSign?activeId=222&enc=cc%20dd";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "222");
        assert_eq!(parts.enc, "cc dd");
    }

    #[test]
    fn parse_www_host() {
        let url = "https://www.chaoxing.com/path?activeId=333&enc=eeff";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "333");
        assert_eq!(parts.enc, "eeff");
    }

    #[test]
    fn parse_k_host() {
        let url = "https://k.chaoxing.com/path?activeId=444&enc=1122";
        let parts = parse(url).unwrap();
        assert_eq!(parts.active_id, "444");
        assert_eq!(parts.enc, "1122");
    }

    #[test]
    fn reject_unknown_host() {
        let url = "https://evil.com/path?activeId=555&enc=3344";
        assert_eq!(parse(url), Err(CheckinErrorCode::BadRequest));
    }

    #[test]
    fn reject_missing_enc() {
        let url = "https://mobilelearn.chaoxing.com/path?activeId=666";
        assert_eq!(parse(url), Err(CheckinErrorCode::BadRequest));
    }

    #[test]
    fn reject_invalid_url() {
        assert_eq!(parse("not a url"), Err(CheckinErrorCode::BadRequest));
    }

    #[test]
    fn roundtrip_compose_parse() {
        let url = compose("12345", "abcdef");
        let parts = parse(&url).unwrap();
        assert_eq!(parts.active_id, "12345");
        assert_eq!(parts.enc, "abcdef");
    }
}

#[cfg(test)]
mod proptest_p1_qr_url_roundtrip {
    // Feature: chaoxing-checkin, Property 1: QR URL 解析/构造 round-trip
    // Validates: Requirements 7.5, 7.6, 15.1, 15.2, 15.4
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(256))]
        #[test]
        fn roundtrip(
            active_id in "[1-9][0-9]{0,18}",
            enc in "[0-9a-fA-F]{1,64}"
        ) {
            let url = compose(&active_id, &enc);
            let parsed = parse(&url).unwrap();
            prop_assert_eq!(parsed.active_id, active_id);
            prop_assert_eq!(parsed.enc, enc);
        }
    }
}
