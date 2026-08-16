//! HTTP Bridge 领域路由与 Handler。

pub(super) mod academic;
pub(super) mod ai;
pub(super) mod auth;
pub(super) mod course_selection;
#[cfg(debug_assertions)]
pub(super) mod debug;
pub(super) mod online_learning;
pub(super) mod proxy;
pub(super) mod schedule;
pub(super) mod system;
