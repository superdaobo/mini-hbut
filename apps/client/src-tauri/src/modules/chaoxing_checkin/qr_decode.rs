// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 二维码图像解码模块。
//!
//! 从图像字节或 `DynamicImage` 中解码 QR 码内容。
//! 严禁网络 IO（无 reqwest）与磁盘 IO（无 std::fs）。

use super::errors::CheckinErrorCode;

/// 从图像字节中解码 QR 码内容，返回解码后的 URL 字符串。
///
/// - 不发起任何网络请求
/// - 不进行任何磁盘读写
/// - 无 QR 码 / 损坏图像 / 非图像字节 → `BadRequest`
pub fn decode_qr_image(bytes: &[u8], _mime: &str) -> Result<String, CheckinErrorCode> {
    let img = image::load_from_memory(bytes).map_err(|_| CheckinErrorCode::BadRequest)?;

    decode_from_dynamic_image(&img)
}

/// 从 `DynamicImage` 中解码 QR 码（供 screen_capture 模块使用）。
pub fn decode_from_dynamic_image(img: &image::DynamicImage) -> Result<String, CheckinErrorCode> {
    let luma = img.to_luma8();
    let mut prepared = rqrr::PreparedImage::prepare(luma);
    let grids = prepared.detect_grids();

    if grids.is_empty() {
        return Err(CheckinErrorCode::BadRequest);
    }

    let (_, content) = grids[0]
        .decode()
        .map_err(|_| CheckinErrorCode::BadRequest)?;

    if content.is_empty() {
        return Err(CheckinErrorCode::BadRequest);
    }

    Ok(content)
}

#[cfg(test)]
mod unit {
    use super::*;

    /// 辅助函数：使用 qrcode crate 生成包含指定内容的 QR 码 PNG 字节。
    fn generate_qr_png(content: &str) -> Vec<u8> {
        use image::{DynamicImage, Luma};
        use qrcode::QrCode;
        use std::io::Cursor;

        let code = QrCode::new(content.as_bytes()).unwrap();
        let img = code
            .render::<Luma<u8>>()
            .quiet_zone(true)
            .min_dimensions(200, 200)
            .build();

        let dynamic = DynamicImage::ImageLuma8(img);
        let mut buf = Cursor::new(Vec::new());
        dynamic.write_to(&mut buf, image::ImageFormat::Png).unwrap();
        buf.into_inner()
    }

    #[test]
    fn decode_valid_qr() {
        let url = "https://mobilelearn.chaoxing.com/widget/sign?id=12345&enc=ABCDEF";
        let png_bytes = generate_qr_png(url);

        let result = decode_qr_image(&png_bytes, "image/png");
        assert_eq!(result.unwrap(), url);
    }

    #[test]
    fn decode_no_qr_in_image() {
        // 生成一张纯白 PNG（无 QR 码）
        let img = image::DynamicImage::ImageLuma8(image::GrayImage::from_pixel(
            100,
            100,
            image::Luma([255u8]),
        ));
        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
        let png_bytes = buf.into_inner();

        let result = decode_qr_image(&png_bytes, "image/png");
        assert_eq!(result.unwrap_err(), CheckinErrorCode::BadRequest);
    }

    #[test]
    fn decode_corrupted_bytes() {
        let garbage = vec![0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        let result = decode_qr_image(&garbage, "image/png");
        assert_eq!(result.unwrap_err(), CheckinErrorCode::BadRequest);
    }

    #[test]
    fn decode_from_dynamic_image_works() {
        let url = "https://example.com/test?param=value";
        let code = qrcode::QrCode::new(url.as_bytes()).unwrap();
        let img = code
            .render::<image::Luma<u8>>()
            .quiet_zone(true)
            .min_dimensions(200, 200)
            .build();
        let dynamic = image::DynamicImage::ImageLuma8(img);

        let result = decode_from_dynamic_image(&dynamic);
        assert_eq!(result.unwrap(), url);
    }

    #[test]
    fn decode_stability() {
        // 相同输入两次调用结果一致
        let url = "https://mobilelearn.chaoxing.com/sign?enc=XYZ123";
        let png_bytes = generate_qr_png(url);

        let r1 = decode_qr_image(&png_bytes, "image/png").unwrap();
        let r2 = decode_qr_image(&png_bytes, "image/png").unwrap();
        assert_eq!(r1, r2);
    }
}
