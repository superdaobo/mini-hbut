//! 在线学习业务域 facade。
//!
//! 聚合学习通（Chaoxing）与雨课堂（Yuketang）两平台的会话、课程、大纲、
//! 进度、内容抓取与刷课能力，按职责委托给以下子模块：
//!
//! - [`shared`]：共享基础设施（常量/缓存/状态/工具）
//! - [`chaoxing_session`]：学习通会话域
//! - [`chaoxing_courses`]：学习通课程列表域
//! - [`chaoxing_outline`]：学习通大纲/进度域
//! - [`chaoxing_cards`]：学习通课程内容域（卡片/视频/成绩）
//! - [`yuketang_session`]：雨课堂会话域（含二维码登录）
//! - [`yuketang_courses`]：雨课堂课程域
//! - [`yuketang_video`]：雨课堂刷课域
//! - [`service`]：总览/同步服务
//!
//! 对外公开 API 路径（`crate::modules::online_learning::*`）保持不变。

pub mod chaoxing_cards;
pub mod chaoxing_courses;
pub mod chaoxing_outline;
pub mod chaoxing_session;
pub mod service;
mod shared;
pub mod yuketang_courses;
pub mod yuketang_session;
pub mod yuketang_video;

// 学习通会话
pub use chaoxing_session::{
    chaoxing_session_probe_ready, check_chaoxing_session, ensure_chaoxing_session_for_checkin,
};

// 学习通课程 / 大纲 / 进度
pub use chaoxing_courses::chaoxing_fetch_courses;
pub use chaoxing_outline::{
    assemble_chaoxing_outline_from_html, chaoxing_fetch_course_outline,
    chaoxing_fetch_course_progress, extract_chaoxing_catalog_leaves,
};

// 学习通课程内容（卡片 / 视频 / 成绩 / 打开链接）
pub use chaoxing_cards::{
    chaoxing_fetch_course_score, chaoxing_get_knowledge_cards, chaoxing_get_launch_url,
    chaoxing_get_video_status, chaoxing_report_progress, chaoxing_video_status_candidate_urls,
    infer_attachment_kind,
};

// 雨课堂
pub use yuketang_courses::{
    yuketang_fetch_course_outline, yuketang_fetch_course_progress, yuketang_fetch_courses,
};
pub use yuketang_session::{yuketang_create_qr_login, yuketang_poll_qr_login};
pub use yuketang_video::{
    yuketang_get_course_chapters, yuketang_get_leaf_info, yuketang_send_heartbeat,
};

// 总览 / 同步服务
pub use service::{
    chaoxing_get_session_status, clear_online_learning_cache, fetch_online_learning_overview,
    list_online_learning_sync_runs, online_learning_sync_now,
};
