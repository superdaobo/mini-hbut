//! 校园网认证共享类型与常量。

use serde::{Deserialize, Serialize};

/// 探测/连接状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CampusNetworkStatus {
    Authenticated,
    NeedsAuth,
    Unknown,
    Checking,
    Error,
}

/// 运营商（与前端 option-chip 一致）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CampusCarrier {
    Campus,
    Cmcc,
    Cucc,
    Ctcc,
}

impl CampusCarrier {
    /// eportal `service` 字段值。
    pub fn eportal_service(self) -> &'static str {
        match self {
            Self::Campus => "default",
            Self::Cmcc => "YD",
            Self::Cucc => "LT",
            Self::Ctcc => "DX",
        }
    }

    /// Srun 登录用户名（含运营商后缀）。
    pub fn srun_username(self, student_id: &str) -> String {
        let sid = student_id.trim();
        match self {
            Self::Campus => sid.to_string(),
            Self::Cmcc => format!("{sid}@cmcc"),
            Self::Cucc => format!("{sid}@cucc"),
            Self::Ctcc => format!("{sid}@ctcc"),
        }
    }
}

/// 探测结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampusNetworkProbeResult {
    pub status: CampusNetworkStatus,
    pub gateway: Option<String>,
    pub query_string: Option<String>,
    pub client_ip: Option<String>,
    pub message: Option<String>,
}

/// 登录结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampusNetworkLoginResult {
    pub success: bool,
    pub message: String,
    pub adapter_used: Option<String>,
}

/// 湖工大预置认证网关（可被高级设置覆盖）。
pub const DEFAULT_GATEWAYS: &[&str] = &[
    "http://172.16.54.18",
    "http://202.114.177.246",
    "http://202.114.177.113",
    "http://202.114.177.114",
    "http://202.114.177.115",
];

pub const PROBE_URL: &str = "http://123.123.123.123";
pub const MSFT_CONNECT_TEST: &str = "http://www.msftconnecttest.com/connecttest.txt";
