//! Transport-neutral application layer.
//!
//! Tauri commands and the localhost HTTP bridge call the same services here.
//! Read-only network use cases clone a short-lived client snapshot so no
//! global RwLock guard is held across an external await.

mod academic;
mod context;
mod error;
mod session;

pub use academic::AcademicReadService;
pub use context::ApplicationContext;
pub use error::{ApplicationError, ApplicationErrorKind};
pub use session::SessionService;
