// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 屏幕区域截图模块（仅桌面端）。
//!
//! 使用 `xcap` 截取主显示器画面，可选裁剪指定区域，
//! 然后交给 `qr_decode` 解码 QR 码。不写盘、不开临时文件。

use super::errors::CheckinErrorCode;

/// 屏幕截取区域定义。
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScreenRect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// 截取屏幕（主显示器）并解码其中的 QR 码。
///
/// - `rect = None`：全屏截图后解码
/// - `rect = Some(r)`：裁剪指定区域后解码
/// - 不写盘、不开临时文件（满足 Property 14）
/// - 非桌面平台返回 `PermissionDenied`
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
pub fn capture_screen_qr(rect: Option<ScreenRect>) -> Result<String, CheckinErrorCode> {
    use xcap::Monitor;

    if let Some(r) = &rect {
        if r.w == 0 || r.h == 0 {
            return Err(CheckinErrorCode::BadRequest);
        }
    }

    let monitors = Monitor::all().map_err(|_| CheckinErrorCode::PermissionDenied)?;
    let primary = monitors
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .or_else(|| Monitor::all().ok().and_then(|ms| ms.into_iter().next()))
        .ok_or(CheckinErrorCode::PermissionDenied)?;

    let screenshot = primary
        .capture_image()
        .map_err(|_| CheckinErrorCode::PermissionDenied)?;

    let img = image::DynamicImage::ImageRgba8(screenshot);

    let final_img = if let Some(r) = rect {
        img.crop_imm(r.x as u32, r.y as u32, r.w, r.h)
    } else {
        img
    };

    super::qr_decode::decode_from_dynamic_image(&final_img)
}

/// 非桌面平台：直接返回 `PermissionDenied`。
#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn capture_screen_qr(_rect: Option<ScreenRect>) -> Result<String, CheckinErrorCode> {
    Err(CheckinErrorCode::PermissionDenied)
}

#[cfg(test)]
#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
mod unit_desktop_only {
    use super::*;

    #[test]
    fn bad_request_on_zero_dimension() {
        // w=0 应返回 BadRequest
        let result = capture_screen_qr(Some(ScreenRect {
            x: 0,
            y: 0,
            w: 0,
            h: 100,
        }));
        assert_eq!(result.unwrap_err(), CheckinErrorCode::BadRequest);

        // h=0 应返回 BadRequest
        let result = capture_screen_qr(Some(ScreenRect {
            x: 0,
            y: 0,
            w: 100,
            h: 0,
        }));
        assert_eq!(result.unwrap_err(), CheckinErrorCode::BadRequest);
    }

    // 注意：实际截屏测试在 CI 中可能因无显示器而失败，
    // 因此仅验证参数校验逻辑。完整截屏测试需在有显示器的环境中运行。
}
