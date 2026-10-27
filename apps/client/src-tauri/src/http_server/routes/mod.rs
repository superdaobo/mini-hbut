//! HTTP Bridge 领域路由与 Handler。

pub(super) mod academic;
pub(super) mod ai;
pub(super) mod auth;
pub(super) mod course_selection;
#[cfg(debug_assertions)]
pub(super) mod debug;
// #1081：图书馆预约官方页反向代理（iOS 内嵌方案；与 school-website 同构但放行写方法）
pub(super) mod library_reserve;
pub(super) mod local_data;
pub(super) mod online_learning;
pub(super) mod proxy;
pub(super) mod schedule;
pub(super) mod system;
pub(super) mod teacher;
