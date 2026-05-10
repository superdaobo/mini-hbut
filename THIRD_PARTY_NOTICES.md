# Third-Party Notices

## AneryCoft/course_helper

- **Upstream**: https://github.com/AneryCoft/course_helper
- **License**: GPL-3.0-or-later
- **Use**: 本项目的 `src-tauri/src/modules/chaoxing_checkin/` 从 course_helper 参考移植了
  学习通签到协议流程（`preSign` / `pptSign` / `activelist` / `backclazzdata` / `upload`
  端点的请求参数组装、header 指纹、QR URL 结构）。移植使用 Rust 重写，未逐行拷贝 Dart 源。
- **Attribution Notes**: 文件级 SPDX 头注释（见 `protocol.rs` 等）。
