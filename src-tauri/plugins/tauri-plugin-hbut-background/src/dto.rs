//! 统一跨端 DTO 契约（Rust / Kotlin / Swift 共享语义）。
//!
//! 设计约束（对应 #611 验收标准）：
//! - 所有落盘/跨端 JSON 必带 `schema` 版本字段，禁止把「当前 struct 布局」当作永久磁盘协议；
//! - `schema` 字段无默认值：缺失版本的文件按「不兼容」处理，由 store 层安全降级而不是 crash；
//! - 所有字段 `camelCase`，与 Kotlin/Swift（android/、ios/ 骨架）保持一致；
//! - DTO 中不承载任何认证材料：JS `syncContext` 只能提交开关/scope/业务选择等非敏感信息，
//!   敏感材料由 Rust 会话层（credential_store/secret_envelope）内部传递，见 #608 红线 2。
//! - 本文件为契约唯一事实源（contract-fixtures/ 与 tests/contract.rs 都从本文件出发校验）。

use serde::{Deserialize, Serialize};

/// 当前插件数据 schema 版本（用户配置/context/state/event 统一使用）。
/// 升级不兼容布局时必须递增，并在 store 层实现迁移或降级。
pub const BG_SCHEMA_VERSION: u32 = 1;

/// 事件 inbox 容量上限：最多保留有限数量事件，超出丢弃最旧（防无限增长）。
pub const EVENT_INBOX_CAP: usize = 50;

/// 插件支持的平台。desktop/web 为明确 unsupported/no-op 语义（见 mobile.rs）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundPlatform {
    Desktop,
    Android,
    Ios,
    Web,
}

/// 状态/事件的实际来源。骨架阶段规则（#611 验收「不统一伪造 ready」）：
/// - Android：JNI 调 Kotlin 成功后 source = Android，失败如实返回 error；
/// - iOS：Swift 骨架未接入前 source = Ios（平台真实存在，业务 synthetic）；
/// - desktop/web：source = Rust + synthetic 标记，明确 no-op。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackgroundSource {
    None,
    Rust,
    Android,
    Ios,
}

/// 用户后台配置（configure 入参 + 落盘对象）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundConfig {
    /// 数据 schema 版本（必填，见模块注释）。
    pub schema: u32,
    /// 是否启用系统调度。
    pub enabled: bool,
    /// 调度偏好（分钟）。Android WorkManager / iOS BGAppRefresh 的间隔是偏好不是定时器（#608 红线 7）。
    pub interval_minutes: Option<u32>,
    /// 业务选择，如 ["grades", "exams", "school_inbox"]（真实业务由后续 Issue 消费）。
    pub business: Vec<String>,
    /// 学生 scope（账号隔离；切换账号时按 scope 清理）。
    pub scope: Option<String>,
}

impl Default for BackgroundConfig {
    fn default() -> Self {
        Self {
            schema: BG_SCHEMA_VERSION,
            enabled: false,
            interval_minutes: Some(30),
            business: Vec::new(),
            scope: None,
        }
    }
}

/// 后台执行所需最小上下文（syncContext 入参 + 落盘对象）。
/// JS 只能提交非敏感控制信息；敏感材料禁止出现在此 DTO 中。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundContext {
    pub schema: u32,
    /// 学生 scope，必填（无 scope 的 context 无法按账号清理）。
    pub scope: String,
    /// 业务选择（与 config.business 对齐）。
    pub business: Vec<String>,
    /// RFC3339 最后更新时间。
    pub updated_at: String,
}

/// runNow 单次执行摘要（native 返回给 Rust/JS 的「状态/结果摘要」，不含敏感材料）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    /// 执行是否成功（native 侧真实结果，骨架阶段可返回 synthetic）。
    pub ok: bool,
    /// true 表示本次结果是开发态 synthetic/假业务（未执行真实成绩检查）。
    pub synthetic: bool,
    /// 本次执行产生的事件数。
    pub events_produced: u32,
    /// 人类可读摘要（不得包含认证材料/敏感字段）。
    pub message: Option<String>,
}

impl RunSummary {
    /// 构造一个成功（或无业务可执行）的 synthetic 摘要。
    pub fn synthetic(message: impl Into<String>) -> Self {
        Self {
            ok: true,
            synthetic: true,
            events_produced: 1,
            message: Some(message.into()),
        }
    }

    /// 构造失败摘要。
    pub fn failed(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            synthetic: false,
            events_produced: 0,
            message: Some(message.into()),
        }
    }
}

/// 统一后台检查状态（getState 返回；desktop/web 为 unsupported 语义但结构一致）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundCheckState {
    pub schema: u32,
    /// 当前运行平台（真实值，不伪造）。
    pub platform: BackgroundPlatform,
    /// 状态/事件来源（真实值，不统一伪造 ready）。
    pub source: BackgroundSource,
    /// 用户配置是否已启用。
    pub enabled: bool,
    /// 是否已调用过 configure（区分「未配置」与「配置为关闭」）。
    pub configured: bool,
    /// 当前生效的学生 scope。
    pub scope: Option<String>,
    /// RFC3339 最后执行时间。
    pub last_run_at: Option<String>,
    /// 最后执行是否成功。
    pub last_run_ok: Option<bool>,
    /// 尚未消费的 inbox 事件数。
    pub pending_events: usize,
    /// 最近一次错误摘要（不得含敏感字段）。
    pub error: Option<String>,
}

impl BackgroundCheckState {
    /// 构造未配置的初始状态（platform 由调用方按真实运行平台填充）。
    pub fn initial(platform: BackgroundPlatform, source: BackgroundSource) -> Self {
        Self {
            schema: BG_SCHEMA_VERSION,
            platform,
            source,
            enabled: false,
            configured: false,
            scope: None,
            last_run_at: None,
            last_run_ok: None,
            pending_events: 0,
            error: None,
        }
    }
}

/// 后台事件（event inbox 条目；consumeEvents 返回并清理）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundEvent {
    pub schema: u32,
    /// 全局唯一 id（Rust 侧 uuid 由 timestamp+seq 生成，不引入 uuid 依赖）。
    pub id: String,
    /// 事件来源（android/ios/rust）。
    pub source: BackgroundSource,
    /// 事件类型：骨架阶段固定 "synthetic_run"；真实业务为 "grades_changed" 等。
    pub kind: String,
    /// 所属学生 scope（无 scope 的全局事件为 None）。
    pub scope: Option<String>,
    /// RFC3339 发生时间。
    pub occurred_at: String,
    /// 业务负载（不得包含认证材料）。
    pub payload: serde_json::Value,
}

/// consumeEvents 返回结构。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeEventsResult {
    pub schema: u32,
    /// 本次消费的事件（已从 inbox 清除）。
    pub events: Vec<BackgroundEvent>,
    /// 剩余未消费事件数。
    pub remaining: usize,
}

/// clearContext 返回结构。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearContextResult {
    pub schema: u32,
    /// 是否确有数据被清理。
    pub cleared: bool,
    /// 被清理的事件数。
    pub removed_events: usize,
}

/// runNow 入参（可选）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunNowRequest {
    /// 指定执行 scope（缺省用当前 context scope）。
    pub scope: Option<String>,
    /// true 时强制走 synthetic 假业务（跨端管道验证用）。
    pub force_synthetic: Option<bool>,
}

/// 版本校验结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaCheck {
    /// 版本一致，可安全使用。
    Ok,
    /// 版本缺失或高于当前支持版本：视为不兼容，调用方应降级（备份 + 重置）。
    Incompatible,
}

/// 校验反序列化后的 schema 字段。
pub fn check_schema(schema: u32) -> SchemaCheck {
    if schema == BG_SCHEMA_VERSION {
        SchemaCheck::Ok
    } else {
        SchemaCheck::Incompatible
    }
}

/// 生成事件/文件备份用的单调 id（时间戳 + 进程内自增，不引入 uuid 依赖）。
pub fn new_event_id(seq: u64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("evt-{millis}-{seq}")
}

/// 生成 RFC3339 UTC 时间字符串（本地时钟）。
pub fn now_rfc3339() -> String {
    // 手动拼 UTC 时间戳，避免引入 chrono 依赖；精度到秒。
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}Z")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 完整 DTO roundtrip：Rust 序列化 -> JSON -> Rust 反序列化，字段名必须 camelCase。
    #[test]
    fn config_roundtrip_camel_case() {
        let cfg = BackgroundConfig {
            schema: BG_SCHEMA_VERSION,
            enabled: true,
            interval_minutes: Some(60),
            business: vec!["grades".to_string(), "exams".to_string()],
            scope: Some("2024010101".to_string()),
        };
        let json = serde_json::to_string(&cfg).expect("序列化失败");
        // 字段名必须 camelCase（跨端契约）
        assert!(json.contains("\"intervalMinutes\""));
        assert!(json.contains("\"schema\""));
        assert!(
            !json.contains("interval_minutes"),
            "禁止 snake_case 字段名: {json}"
        );

        let back: BackgroundConfig = serde_json::from_str(&json).expect("反序列化失败");
        assert_eq!(back, cfg);
    }

    /// 缺 schema 字段必须拒绝（版本契约硬约束）。
    #[test]
    fn missing_schema_field_is_rejected() {
        let json = r#"{"enabled":true,"intervalMinutes":30,"business":[],"scope":null}"#;
        let result: Result<BackgroundConfig, _> = serde_json::from_str(json);
        assert!(result.is_err(), "缺 schema 字段必须反序列化失败");
    }

    /// 未知额外字段必须被容忍（前向兼容：新端写旧端读）。
    #[test]
    fn unknown_fields_are_tolerated() {
        let json = r#"{"schema":1,"enabled":true,"intervalMinutes":30,"business":[],"scope":null,"futureField":42}"#;
        let back: BackgroundConfig = serde_json::from_str(json).expect("未知字段应被容忍");
        assert_eq!(back.schema, BG_SCHEMA_VERSION);
    }

    /// check_schema 版本边界：一致 Ok，缺失/更高版本 Incompatible。
    #[test]
    fn schema_version_boundary() {
        assert_eq!(check_schema(BG_SCHEMA_VERSION), SchemaCheck::Ok);
        assert_eq!(check_schema(0), SchemaCheck::Incompatible);
        assert_eq!(
            check_schema(BG_SCHEMA_VERSION + 1),
            SchemaCheck::Incompatible
        );
        assert_eq!(check_schema(u32::MAX), SchemaCheck::Incompatible);
    }

    /// 平台与来源枚举序列化语义（Kotlin/Swift 依赖同一字符串值）。
    #[test]
    fn platform_source_serialize_semantics() {
        let state =
            BackgroundCheckState::initial(BackgroundPlatform::Android, BackgroundSource::Android);
        let json = serde_json::to_string(&state).expect("序列化失败");
        assert!(json.contains("\"platform\":\"android\""));
        assert!(json.contains("\"source\":\"android\""));
        assert!(json.contains("\"lastRunAt\":null"));

        let state =
            BackgroundCheckState::initial(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        let json = serde_json::to_string(&state).expect("序列化失败");
        assert!(json.contains("\"platform\":\"desktop\""));
        assert!(json.contains("\"source\":\"rust\""));
    }

    /// 状态必须不包含任何敏感字段名（认证材料防线：即使误加字段也会被此测试拦下）。
    #[test]
    fn state_never_contains_sensitive_fields() {
        let state = BackgroundCheckState::initial(BackgroundPlatform::Ios, BackgroundSource::Ios);
        let json = serde_json::to_string(&state).expect("序列化失败");
        for sensitive in [
            "password",
            "cookie",
            "token",
            "credential",
            "secret",
            "authorization",
        ] {
            assert!(
                !json.to_lowercase().contains(sensitive),
                "状态 JSON 泄露敏感字段名 {sensitive}: {json}"
            );
        }
    }

    /// event 与 consume 结果 roundtrip。
    #[test]
    fn event_roundtrip() {
        let evt = BackgroundEvent {
            schema: BG_SCHEMA_VERSION,
            id: "evt-1-2".to_string(),
            source: BackgroundSource::Android,
            kind: "synthetic_run".to_string(),
            scope: Some("2024010101".to_string()),
            occurred_at: "1700000000Z".to_string(),
            payload: serde_json::json!({"note": "synthetic"}),
        };
        let json = serde_json::to_string(&evt).expect("序列化失败");
        let back: BackgroundEvent = serde_json::from_str(&json).expect("反序列化失败");
        assert_eq!(back, evt);
        assert!(json.contains("\"occurredAt\""));

        let result = ConsumeEventsResult {
            schema: BG_SCHEMA_VERSION,
            events: vec![evt],
            remaining: 0,
        };
        let json = serde_json::to_string(&result).expect("序列化失败");
        let back: ConsumeEventsResult = serde_json::from_str(&json).expect("反序列化失败");
        assert_eq!(back, result);
    }

    /// runNow 入参可选字段语义。
    #[test]
    fn run_now_request_defaults() {
        let req: RunNowRequest =
            serde_json::from_str(r#"{"scope":"s1","forceSynthetic":true}"#).expect("反序列化失败");
        assert_eq!(req.scope.as_deref(), Some("s1"));
        assert_eq!(req.force_synthetic, Some(true));
    }
}
