//! 学习通：邀请码入班 + 班级资料列表/下载（门户 CAS SSO，不二次登录）。
//!
//! 协议见 `docs/chaoxing-protocol.md`（2026-07-12 Web 逆向）。
//!
//! 本文件为薄 facade：按职责拆分为 `chaoxing_class/` 子模块后统一 re-export，
//! 对外 API（公开类型/函数/serde 字段/错误语义）与拆分前完全一致。

mod download;
mod invite;
mod parse;
mod resource;
mod session;

pub use download::{download_resource_bytes, download_resource_bytes_with_part};
pub use invite::{accept_invite, preview_invite, InvitePreview};
pub use resource::{list_resources, resolve_resource_access, ClassResource, ListResourcesOpts};
pub use session::ensure_sso_session;
