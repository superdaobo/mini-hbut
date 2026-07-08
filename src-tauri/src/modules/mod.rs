//! 业务模块注册入口。
//!
//! 该模块负责集中导出各业务子模块，方便 lib.rs 统一引用。

// 模块化设计 - 与 Python backend/modules 对应
pub mod ai;
pub mod calendar;
pub mod chaoxing_checkin;
pub mod classroom;
pub mod course_selection;
pub mod electricity;
pub mod exam;
#[allow(dead_code)]
pub mod grades;
pub mod module_bundle;
pub mod notification;
pub mod one_code;
pub mod online_learning;
pub mod ranking;
pub mod schedule;
pub mod school_inbox;
pub mod school_website_embed;
pub mod student_info;
pub mod training_plan;
pub mod transaction;
pub mod usage_stats;
pub mod weather;
pub mod campus_network;
