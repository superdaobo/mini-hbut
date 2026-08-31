//! Transport-neutral application layer.
//!
//! Tauri commands and the localhost HTTP bridge call the same services here.
//! Read-only network use cases clone a short-lived client snapshot so no
//! global RwLock guard is held across an external await; write-type cases
//! (login / session restore / cookie import) hold the write lock only for the
//! duration of the state change.
//!
//! Service 语义：
//! - 输入/输出：JSON payload（与历史 Tauri Command / HTTP 响应结构兼容）
//! - 错误：[`ApplicationError`]（kind + message），传输层负责映射
//! - 会话：写型业务收敛在 [`AuthService`]；只读业务用快照克隆
//! - 缓存：网络优先 + 缓存降级（offline=true）；缓存写失败仅告警，不拖垮网络结果

mod academic;
mod auth;
mod context;
mod error;
mod schedule;
mod session;

pub use academic::AcademicReadService;
pub use auth::{import_cookies_ok_payload, AuthService, SavedAccountInfo, mask_student_id};
pub use context::ApplicationContext;
pub use error::{ApplicationError, ApplicationErrorKind};
pub use schedule::ScheduleService;
pub use session::SessionService;
