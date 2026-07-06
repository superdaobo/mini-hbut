//! 本地试用频率统计 DTO。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageEventInput {
    pub event_id: String,
    pub student_id: String,
    pub device_id: String,
    pub event_type: String,
    pub target_kind: String,
    pub target_id: String,
    #[serde(default)]
    pub load_mode: String,
    #[serde(default)]
    pub launch_mode: String,
    #[serde(default)]
    pub duration_ms: i64,
    #[serde(default)]
    pub app_version: String,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub extra_json: String,
    pub occurred_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSessionInput {
    pub session_id: String,
    pub student_id: String,
    pub device_id: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub duration_ms: i64,
    #[serde(default)]
    pub app_version: String,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageDeviceProfileInput {
    pub device_id: String,
    pub student_id: String,
    #[serde(default)]
    pub app_version: String,
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub platform: String,
    #[serde(default)]
    pub os_version: String,
    #[serde(default)]
    pub arch: String,
    #[serde(default)]
    pub locale: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageCountRow {
    pub target_id: String,
    pub open_count: i64,
    pub duration_ms_total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageLoadModeRow {
    pub load_mode: String,
    pub open_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageDailyTrendRow {
    pub stat_date: String,
    pub open_count: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageTodaySummary {
    pub stat_date: String,
    pub open_count: i64,
    pub duration_ms: i64,
    pub module_open_count: i64,
    pub view_open_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsagePersonalSummary {
    pub today: UsageTodaySummary,
    pub top_modules: Vec<UsageCountRow>,
    pub load_mode_split: Vec<UsageLoadModeRow>,
    pub daily_trend: Vec<UsageDailyTrendRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsagePendingUploadBatch {
    pub events: Vec<UsageEventInput>,
    pub sessions: Vec<UsageSessionInput>,
    pub device_profile: Option<UsageDeviceProfileInput>,
}
