//! 业务模块注册入口。
//!
//! 该模块负责集中导出各业务子模块，方便 lib.rs 统一引用。
//!
//! 注：成绩领域已收敛到 `crate::grade`（domain/service），不再使用独立 grades 模块。

// 模块化设计 - 与 Python backend/modules 对应
pub mod ai;
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
// #1052：图书馆预约（超星 reserve）基础链路：mAppId → 真实系统入口 + 凭证
pub mod library_reserve;
// #1053：图书馆预约 · 静音仓 / 研讨室业务接口（PC 版 reservepc 接口体系）
pub mod library_reserve_pc;
// #1054：图书馆预约 · 座位预约只读查询（seatengine 接口体系；写接口契约未抓到，暂不实现）
pub mod library_reserve_seat;
// 2026-10-19：图书馆预约 · 官方页面内嵌子 WebView（座位提交需 cxCaptcha 人工验证，纯接口不可行）
pub mod library_reserve_embed;
// #1081：图书馆预约 · 官方页 Bridge 反向代理（iOS 无 add_child，改走「代理 + iframe」）
pub mod library_reserve_proxy;
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
