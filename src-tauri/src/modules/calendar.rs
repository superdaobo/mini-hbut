//! 📅 校历模块 - 与 Python modules/calendar.py 对应

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarWeek {
    pub week: i32,
    pub month: String,
    pub dates: Vec<String>,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Semester {
    pub value: String,
    pub label: String,
    pub is_current: bool,
}

pub struct CalendarModule {
    client: Client,
}

impl CalendarModule {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    /// 根据当前日期计算学期（更可靠，不依赖 API）
    pub fn calculate_current_semester() -> String {
        use chrono::{Local, Datelike};
        let now = Local::now();
        let year = now.year();
        let month = now.month();
        let day = now.day();
        
        // 学期划分逻辑：
        // - 第一学期：8月下旬 ~ 次年2月中旬（寒假结束）
        // - 第二学期：2月中旬 ~ 7月（暑假前）
        let (academic_year_start, term) = if month >= 9 {
            // 9-12月：当年第一学期
            (year, 1)
        } else if month >= 3 {
            // 3-7月：上一学年第二学期
            (year - 1, 2)
        } else if month == 2 && day >= 15 {
            // 2月15日之后：上一学年第二学期（春季开学）
            (year - 1, 2)
        } else {
            // 1月 和 2月上旬：上一学年第一学期（寒假期间）
            (year - 1, 1)
        };
        
        format!("{}-{}-{}", academic_year_start, academic_year_start + 1, term)
    }

    pub async fn get_current_semester(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // 优先使用日期计算的学期（更可靠）
        let calculated = Self::calculate_current_semester();
        println!("[DEBUG] Calculated current semester: {}", calculated);
        Ok(calculated)
    }

    pub async fn get_semesters(&self) -> Result<Vec<Semester>, Box<dyn std::error::Error + Send + Sync>> {
        // 获取当前学期
        let current = Self::calculate_current_semester();

        // 返回预定义的学期列表（按时间倒序）
        let semesters = vec![
            Semester {
                value: "2025-2026-2".to_string(),
                label: "2025-2026学年第二学期".to_string(),
                is_current: current == "2025-2026-2",
            },
            Semester {
                value: "2025-2026-1".to_string(),
                label: "2025-2026学年第一学期".to_string(),
                is_current: current == "2025-2026-1",
            },
            Semester {
                value: "2024-2025-2".to_string(),
                label: "2024-2025学年第二学期".to_string(),
                is_current: current == "2024-2025-2",
            },
            Semester {
                value: "2024-2025-1".to_string(),
                label: "2024-2025学年第一学期".to_string(),
                is_current: current == "2024-2025-1",
            },
            Semester {
                value: "2023-2024-2".to_string(),
                label: "2023-2024学年第二学期".to_string(),
                is_current: current == "2023-2024-2",
            },
            Semester {
                value: "2023-2024-1".to_string(),
                label: "2023-2024学年第一学期".to_string(),
                is_current: current == "2023-2024-1",
            },
            // 全部学期选项
            Semester {
                value: "all".to_string(),
                label: "全部(从入学至今)".to_string(),
                is_current: false,
            },
        ];

        Ok(semesters)
    }

    pub async fn fetch_calendar(&self, semester: &str) -> Result<Vec<CalendarWeek>, Box<dyn std::error::Error + Send + Sync>> {
        let calendar_url = format!("{}/admin/xsd/jcsj/xlgl/getData/{}", JWXT_BASE_URL, semester);
        
        println!("[DEBUG] Fetching calendar from: {}", calendar_url);

        let response = self.client
            .get(&calendar_url)
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .await?;

        let status = response.status();
        println!("[DEBUG] Calendar response status: {}", status);

        if !status.is_success() {
            return Err(format!("获取校历失败: {}", status).into());
        }

        let json: Value = response.json().await?;
        self.parse_calendar(&json)
    }

    fn parse_calendar(&self, json: &Value) -> Result<Vec<CalendarWeek>, Box<dyn std::error::Error + Send + Sync>> {
        let mut weeks = Vec::new();

        if let Some(items) = json.as_array() {
            println!("[DEBUG] Found {} calendar weeks", items.len());
            for item in items {
                let week = item.get("zc")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0) as i32;
                
                let month = item.get("ny").and_then(|v| v.as_str()).unwrap_or("").to_string();
                
                // 提取每天的日期
                let dates = vec![
                    item.get("monday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item.get("tuesday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item.get("wednesday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item.get("thursday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item.get("friday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item.get("saturday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    item.get("sunday").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                ];

                weeks.push(CalendarWeek {
                    week,
                    month,
                    dates,
                    is_current: false, // TODO: 计算是否为当前周
                });
            }
        }

        Ok(weeks)
    }
}
