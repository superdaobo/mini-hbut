//! 学号核验（身份 v2 第二步 / goal-18）：新版本客户端调用 student-auth 的 `POST /school/verify`。
//!
//! 为什么单独成模块、不放进 `identity`：`identity` 的信任边界（#617）规定「学校密码 / Cookie /
//! Token 绝不参与本模块任何网络请求」。学号核验恰恰要把**裁剪后的教务会话 cookie** 交给我们自己的
//! 服务端读学籍页（用户 2026-11-19 确认的方案 B），所以放在这里，只**调用** `identity` 的签名原语，
//! 不改变 `identity` 的边界。
//!
//! 硬约束：
//! - 服务地址钉死 `https://mini.hbut.site`（发布构建无法改）；不跟随重定向；
//! - cookie 只在 Rust 侧读取与发送，不经过 WebView，不进日志、不进返回值；
//! - 复用优先：先不带 cookie 请求，服务端明确要求时才带；
//! - Android 无设备保险箱 → 直接 `unsupported`，前端继续走旧上报（用户决定 U2）；
//! - 静默：任何失败只体现在返回值里，绝不弹窗、不阻塞登录。

pub mod command;
pub mod flow;
/// 「用 Mini-HBUT 登录」（goal-20）：扫码 / 深链 → 确认 → 先学号核验再设备签名批准。
pub mod login;
pub mod login_command;

#[cfg(test)]
mod login_tests;
#[cfg(test)]
mod tests;
