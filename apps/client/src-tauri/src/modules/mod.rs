//! 业务模块注册入口。
//!
//! 该模块负责集中导出各业务子模块，方便 lib.rs 统一引用。
//!
//! 注：成绩领域已收敛到 `crate::grade`（domain/service），不再使用独立 grades 模块。

// 模块化设计 - 与 Python backend/modules 对应
pub mod ai;
pub mod calendar;
pub mod campus_network;
// #719：冷启动校内 HTTPS 证书探测（独立严格校验客户端，不复用业务共享客户端）
pub mod cert_probe;
pub mod chaoxing_checkin;
pub mod chaoxing_class;
pub mod chaoxing_sso;
pub mod classroom;
pub mod course_selection;
pub mod electricity;
pub mod exam;
pub mod module_bundle;
pub mod notification;
pub mod one_code;
pub mod online_learning;
pub mod ranking;
pub mod schedule;
pub mod school_inbox;
pub mod school_website_embed;
pub mod session_guard;
pub mod smart_orientation;
pub mod sports_venue;
pub mod student_info;
pub mod teaching_eval;
pub mod training_plan;
pub mod transaction;
pub mod usage_stats;
pub mod weather;
