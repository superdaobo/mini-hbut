// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 超星学习通签到模块 — 对外聚合入口。

pub mod commands;
pub mod errors;
pub mod inflight;
pub mod interceptor;
pub mod log_repo;
pub mod protocol;
pub mod qr_decode;
pub mod qr_url;
pub mod screen_capture;
pub mod session;
pub mod types;
