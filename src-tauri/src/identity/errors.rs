//! Identity 领域错误类型（#622）。
//!
//! 安全约定：
//! - 错误文本只允许携带用户可读的简体中文说明，绝不含私钥/签名/handoff/密码等敏感材料；
//! - keyring 不可用时一律 KeyringUnavailable（fail closed，不自动降级到文件/SQLite）。

/// 设备身份领域统一错误类型。
#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    /// 系统安全存储（Keyring）不可用或读写失败。携带底层错误描述（不含密钥材料）用于诊断。
    #[error("系统安全存储不可用，设备身份功能已停用（fail closed，不降级）：{0}")]
    KeyringUnavailable(String),

    /// keyring 写入后回读校验不一致（写入损坏），按 fail closed 处理。
    #[error("系统安全存储写入校验失败，已拒绝使用（fail closed）")]
    KeyringWriteMismatch,

    /// 本地没有已登录的学校会话，不能创建/使用设备身份。
    #[error("本地未登录学校账号，无法使用设备身份功能")]
    NoLocalLogin,

    /// 本机还没有设备密钥/未完成注册。
    #[error("本设备尚未注册身份，请先完成设备注册")]
    NotEnrolled,

    /// 输入参数不符合协议约束。
    #[error("输入无效：{0}")]
    InvalidInput(String),

    /// 身份服务地址未配置或格式非法。
    #[error("身份服务地址未配置")]
    CoreBaseUrlMissing,

    /// 与 Identity Core 的网络通信失败。
    #[error("身份服务网络请求失败：{0}")]
    Network(String),

    /// Identity Core 返回了业务错误（status + message 均已脱敏）。
    #[error("身份服务返回错误（HTTP {status}）：{message}")]
    Api { status: u16, message: String },

    /// 内部逻辑错误（不可达分支/序列化失败等）。
    #[error("内部错误：{0}")]
    Internal(String),
}
