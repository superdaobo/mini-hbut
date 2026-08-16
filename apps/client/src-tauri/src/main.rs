//! Tauri 应用入口（桌面/移动端）。
//!
//! 作用：
//! - 将 lib.rs 中的 run() 作为应用启动点
//! - 遵循 Tauri 2.x 的移动端/桌面端入口约定

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hbut_helper_lib::run()
}
