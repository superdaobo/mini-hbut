// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 签到相关数据传输对象（DTO）与输入校验器。

use super::errors::CheckinErrorCode;

/// 签到日志条目。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CheckinLogEntry {
    pub student_id: String,
    pub active_id: String,
    pub activity_type: String,
    pub course_name: String,
    pub result: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub submitted_at: i64,
    pub payload_hash: String,
}

/// 位置历史条目。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LocationHistoryItem {
    pub address: String,
    pub latitude: f64,
    pub longitude: f64,
}

/// 校验位置签到输入参数。
///
/// - `lat` 必须在 [-90, 90]
/// - `lng` 必须在 [-180, 180]
/// - `addr` 长度必须在 [1, 80] 字节
pub fn validate_location(lat: f64, lng: f64, addr: &str) -> Result<(), CheckinErrorCode> {
    if lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0 {
        return Err(CheckinErrorCode::BadRequest);
    }
    let len = addr.len();
    if len < 1 || len > 80 {
        return Err(CheckinErrorCode::BadRequest);
    }
    Ok(())
}

/// 校验手势密码格式。
///
/// - 长度 4~9 个字符
/// - 每个字符必须是 '1'~'9'
/// - 不允许重复
pub fn validate_gesture_pattern(pattern: &str) -> Result<(), CheckinErrorCode> {
    let chars: Vec<char> = pattern.chars().collect();
    if chars.len() < 4 || chars.len() > 9 {
        return Err(CheckinErrorCode::BadRequest);
    }
    let mut seen = std::collections::HashSet::new();
    for c in &chars {
        if !('1'..='9').contains(c) || !seen.insert(*c) {
            return Err(CheckinErrorCode::BadRequest);
        }
    }
    Ok(())
}

/// 校验照片签到输入。
///
/// - 文件大小不超过 5MB
/// - MIME 类型必须为 jpeg / png / webp
pub fn validate_photo_input(bytes: &[u8], mime: &str) -> Result<(), CheckinErrorCode> {
    if bytes.len() > 5 * 1024 * 1024 {
        return Err(CheckinErrorCode::BadRequest);
    }
    match mime {
        "image/jpeg" | "image/png" | "image/webp" => Ok(()),
        _ => Err(CheckinErrorCode::BadRequest),
    }
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn valid_location() {
        assert!(validate_location(30.0, 114.0, "武汉市").is_ok());
        assert!(validate_location(-90.0, -180.0, "A").is_ok());
        assert!(validate_location(90.0, 180.0, &"x".repeat(80)).is_ok());
    }

    #[test]
    fn invalid_location_lat() {
        assert!(validate_location(91.0, 0.0, "addr").is_err());
        assert!(validate_location(-91.0, 0.0, "addr").is_err());
    }

    #[test]
    fn invalid_location_lng() {
        assert!(validate_location(0.0, 181.0, "addr").is_err());
        assert!(validate_location(0.0, -181.0, "addr").is_err());
    }

    #[test]
    fn invalid_location_addr() {
        assert!(validate_location(0.0, 0.0, "").is_err());
        assert!(validate_location(0.0, 0.0, &"x".repeat(81)).is_err());
    }

    #[test]
    fn valid_gesture() {
        assert!(validate_gesture_pattern("1234").is_ok());
        assert!(validate_gesture_pattern("123456789").is_ok());
    }

    #[test]
    fn invalid_gesture_too_short() {
        assert!(validate_gesture_pattern("123").is_err());
    }

    #[test]
    fn invalid_gesture_too_long() {
        assert!(validate_gesture_pattern("1234567890").is_err());
    }

    #[test]
    fn invalid_gesture_duplicate() {
        assert!(validate_gesture_pattern("1123").is_err());
    }

    #[test]
    fn invalid_gesture_bad_char() {
        assert!(validate_gesture_pattern("1230").is_err());
        assert!(validate_gesture_pattern("abcd").is_err());
    }

    #[test]
    fn valid_photo() {
        assert!(validate_photo_input(&[0u8; 100], "image/jpeg").is_ok());
        assert!(validate_photo_input(&[0u8; 100], "image/png").is_ok());
        assert!(validate_photo_input(&[0u8; 100], "image/webp").is_ok());
    }

    #[test]
    fn invalid_photo_too_large() {
        let big = vec![0u8; 5 * 1024 * 1024 + 1];
        assert!(validate_photo_input(&big, "image/jpeg").is_err());
    }

    #[test]
    fn invalid_photo_mime() {
        assert!(validate_photo_input(&[0u8; 100], "image/gif").is_err());
        assert!(validate_photo_input(&[0u8; 100], "application/pdf").is_err());
    }
}

#[cfg(test)]
mod proptest_p5_location {
    // Feature: chaoxing-checkin, Property 5: 位置签到输入合法性
    // Validates: Requirements 5.2, 5.3, 5.7
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]
        #[test]
        fn valid_inputs_accepted(
            lat in -90.0f64..=90.0f64,
            lng in -180.0f64..=180.0f64,
            addr_len in 1usize..=80usize
        ) {
            let addr: String = "x".repeat(addr_len);
            prop_assert!(validate_location(lat, lng, &addr).is_ok());
        }

        #[test]
        fn out_of_range_lat_rejected(
            lat in prop_oneof![
                (-1000.0f64..=-90.001f64),
                (90.001f64..=1000.0f64)
            ],
            lng in -180.0f64..=180.0f64,
            addr_len in 1usize..=80usize
        ) {
            let addr: String = "x".repeat(addr_len);
            prop_assert!(validate_location(lat, lng, &addr).is_err());
        }

        #[test]
        fn out_of_range_lng_rejected(
            lat in -90.0f64..=90.0f64,
            lng in prop_oneof![
                (-1000.0f64..=-180.001f64),
                (180.001f64..=1000.0f64)
            ],
            addr_len in 1usize..=80usize
        ) {
            let addr: String = "x".repeat(addr_len);
            prop_assert!(validate_location(lat, lng, &addr).is_err());
        }

        #[test]
        fn empty_addr_rejected(
            lat in -90.0f64..=90.0f64,
            lng in -180.0f64..=180.0f64,
        ) {
            prop_assert!(validate_location(lat, lng, "").is_err());
        }

        #[test]
        fn long_addr_rejected(
            lat in -90.0f64..=90.0f64,
            lng in -180.0f64..=180.0f64,
            extra in 1usize..=200usize
        ) {
            let addr: String = "x".repeat(80 + extra);
            prop_assert!(validate_location(lat, lng, &addr).is_err());
        }
    }
}

#[cfg(test)]
mod proptest_p6_gesture {
    // Feature: chaoxing-checkin, Property 6: 手势密码格式
    // Validates: Requirements 8.2, 8.3
    use super::*;
    use proptest::prelude::*;

    /// 生成合法手势密码：从 '1'-'9' 中随机选取 4~9 个不重复字符
    fn valid_gesture_strategy() -> impl Strategy<Value = String> {
        (4usize..=9usize).prop_flat_map(|len| {
            proptest::sample::subsequence(vec!['1','2','3','4','5','6','7','8','9'], len)
                .prop_map(|chars| chars.into_iter().collect::<String>())
        })
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]
        #[test]
        fn valid_patterns_accepted(pattern in valid_gesture_strategy()) {
            prop_assert!(validate_gesture_pattern(&pattern).is_ok());
        }

        #[test]
        fn too_short_rejected(pattern in "[1-9]{1,3}") {
            prop_assert!(validate_gesture_pattern(&pattern).is_err());
        }

        #[test]
        fn too_long_rejected(len in 10usize..=20usize) {
            // 生成超长字符串（可能有重复，但长度已超限）
            let pattern: String = (1..=len).map(|i| char::from_digit((i % 9 + 1) as u32, 10).unwrap()).collect();
            prop_assert!(validate_gesture_pattern(&pattern).is_err());
        }

        #[test]
        fn invalid_chars_rejected(pattern in "[0a-z]{4,9}") {
            // 含 '0' 或字母的 4~9 位字符串应被拒绝
            prop_assert!(validate_gesture_pattern(&pattern).is_err());
        }
    }
}

#[cfg(test)]
mod proptest_p7_photo {
    // Feature: chaoxing-checkin, Property 7: 图片 MIME 与大小
    // Validates: Requirements 6.2, 6.3
    use super::*;
    use proptest::prelude::*;

    const VALID_MIMES: &[&str] = &["image/jpeg", "image/png", "image/webp"];
    const INVALID_MIMES: &[&str] = &[
        "image/gif", "image/bmp", "image/tiff", "application/pdf",
        "text/plain", "video/mp4", "application/octet-stream",
    ];

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]
        #[test]
        fn valid_size_and_mime_accepted(
            size in 0usize..=(5 * 1024 * 1024usize),
            mime_idx in 0usize..3usize
        ) {
            let bytes = vec![0u8; size];
            let mime = VALID_MIMES[mime_idx];
            prop_assert!(validate_photo_input(&bytes, mime).is_ok());
        }

        #[test]
        fn oversized_rejected(
            extra in 1usize..=1024usize,
            mime_idx in 0usize..3usize
        ) {
            let bytes = vec![0u8; 5 * 1024 * 1024 + extra];
            let mime = VALID_MIMES[mime_idx];
            prop_assert!(validate_photo_input(&bytes, mime).is_err());
        }

        #[test]
        fn invalid_mime_rejected(
            size in 0usize..=(5 * 1024 * 1024usize),
            mime_idx in 0usize..7usize
        ) {
            let bytes = vec![0u8; size];
            let mime = INVALID_MIMES[mime_idx];
            prop_assert!(validate_photo_input(&bytes, mime).is_err());
        }
    }
}
