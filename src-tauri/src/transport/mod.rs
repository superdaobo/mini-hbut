//! Tauri 传输层（Transport）。
//!
//! 职责：把 HTTP/业务模块的能力包装为 Tauri Command，做参数/状态/错误映射，
//! 不新增业务策略。按领域拆分（auth / academic / schedule / forum / chaoxing /
//! system / update / debug 等），lib.rs 仅保留注册组合。

pub mod tauri;
