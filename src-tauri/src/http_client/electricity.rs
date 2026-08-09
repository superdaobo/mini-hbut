//! 电费/一码通相关模块。
//!
//! 负责：
//! - 获取电费授权 token（SSO + 令牌交换）
//! - 校验/刷新 token
//! - 查询电费位置、账户、交易记录
//! - 提供一码通 token 的独立获取接口
//!
//! 注意：
//! - 多次重登会触发风控，内部有冷却控制
//! - 部分接口会返回空响应，需要兜底重试
//!
//! 结构说明（按职责拆分子模块）：
//! - [`auth_session`]：SSO 取票 / token 刷新与缓存 / 一码通 token 与浏览器 tid / code 服务重登
//! - [`query`]：位置层级 / 账户 / 交易记录 / 余额查询
//! - [`campus_code`]：校园码配置 / 二维码 / 支付状态查询
//!
//! 所有业务方法仍挂在 `HbutClient` 上（`impl HbutClient` 分散在各子模块），
//! 对外方法签名、serde 字段、错误与网络语义与拆分前完全一致。

mod auth_session;
mod campus_code;
mod query;

#[allow(unused_imports)]
pub use auth_session::ElectricityTokenBundle;
