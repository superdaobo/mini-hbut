//! Tauri Command 领域模块（从 lib.rs 拆分）。
//!
//! 每个模块只包含对应领域的 `#[tauri::command]` 函数及其私有 DTO/辅助函数；
//! 跨领域共享的传输辅助位于 [`common`]。

pub mod academic;
pub mod account;
pub mod auth;
pub mod chaoxing;
pub mod common;
pub mod config;
pub mod course_selection;
pub mod electricity;
pub mod forum;
pub mod grades;
// #1052：图书馆预约（超星 reserve）入口解析命令层
pub mod library_reserve;
pub mod notification;
pub mod qxzkb;
pub mod schedule;
pub mod system;
pub mod teacher;
pub mod teaching_eval;
pub mod update;
pub mod widget;
