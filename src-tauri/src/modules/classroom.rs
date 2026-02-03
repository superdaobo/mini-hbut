//! 🏫 空教室查询模块
//! 
//! 该模块用于查询全校的空闲教室资源。
//! 主要功能：
//! 1. `get_buildings`: 获取所有教学楼列表。
//! 2. `get_available_classrooms`: 根据时间（周次、星期、节次）查询空教室。
//! 
//! 目前 `http_client.rs` 中的空教室查询处于暂未实现状态 (Stub)，本模块保留了相关的数据结构定义和部分逻辑骨架。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use chrono::{Local, NaiveDate, Datelike, Timelike};

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

/// 教室实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Classroom {
    /// 教室名称 (如 "教一-101")
    pub name: String,
    /// 所属教学楼
    pub building: String,
    /// 容量 (座位数)
    pub capacity: i32,
    /// 具体地址
    pub address: String,
    /// 校区
    pub campus: String,
}

/// 教学楼实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: String,
    pub name: String,
    pub campus: String,
}

pub struct ClassroomModule {
    client: Client,
    semester: String,
    semester_start: NaiveDate,
}

impl ClassroomModule {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            semester: "2024-2025-1".to_string(),
            semester_start: NaiveDate::from_ymd_opt(2024, 8, 26).unwrap(),
        }
    }

    pub fn set_semester(&mut self, semester: &str, start_date: NaiveDate) {
        self.semester = semester.to_string();
        self.semester_start = start_date;
    }

    pub fn get_current_week(&self) -> i32 {
        let today = Local::now().date_naive();
        let days = (today - self.semester_start).num_days();
        (days / 7 + 1).max(1).min(25) as i32
    }

    pub fn get_current_weekday(&self) -> i32 {
        Local::now().date_naive().weekday().num_days_from_monday() as i32 + 1
    }

    pub fn get_current_periods(&self) -> Vec<i32> {
        let now = Local::now();
        let hour = now.hour();
        let minute = now.minute();
        let current_minutes = hour * 60 + minute;

        // 节次时间表
        let class_schedule = [
            (8 * 60, 8 * 60 + 45),      // 第1节
            (8 * 60 + 55, 9 * 60 + 40), // 第2节
            (10 * 60 + 10, 10 * 60 + 55), // 第3节
            (11 * 60 + 5, 11 * 60 + 50),  // 第4节
            (14 * 60, 14 * 60 + 45),     // 第5节
            (14 * 60 + 55, 15 * 60 + 40), // 第6节
            (16 * 60 + 10, 16 * 60 + 55), // 第7节
            (17 * 60 + 5, 17 * 60 + 50),  // 第8节
            (19 * 60, 19 * 60 + 45),     // 第9节
            (19 * 60 + 55, 20 * 60 + 40), // 第10节
            (20 * 60 + 50, 21 * 60 + 35), // 第11节
        ];

        let mut periods = Vec::new();
        for (i, (start, _)) in class_schedule.iter().enumerate() {
            if current_minutes < *start + 45 {
                periods.push((i + 1) as i32);
            }
        }

        if periods.is_empty() {
            periods = vec![9, 10, 11];
        }

        periods
    }

    pub async fn get_buildings(&self) -> Result<Vec<Building>, Box<dyn std::error::Error + Send + Sync>> {
        // 返回预定义的教学楼列表
        Ok(vec![
            Building { id: "1".to_string(), name: "1号教学楼".to_string(), campus: "本部".to_string() },
            Building { id: "2".to_string(), name: "2号教学楼".to_string(), campus: "本部".to_string() },
            Building { id: "3".to_string(), name: "3号教学楼".to_string(), campus: "本部".to_string() },
            Building { id: "4".to_string(), name: "4号教学楼".to_string(), campus: "本部".to_string() },
            Building { id: "5".to_string(), name: "工程实训楼".to_string(), campus: "本部".to_string() },
            Building { id: "6".to_string(), name: "艺术楼".to_string(), campus: "本部".to_string() },
        ])
    }

    pub async fn query_empty_classrooms(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        campus: Option<&str>,
        building: Option<&str>,
        min_seats: Option<i32>,
        max_seats: Option<i32>,
    ) -> Result<Vec<Classroom>, Box<dyn std::error::Error + Send + Sync>> {
        let week_value = week.unwrap_or_else(|| self.get_current_week());
        let weekday_value = weekday.unwrap_or_else(|| self.get_current_weekday());
        let periods_value = periods.unwrap_or_else(|| self.get_current_periods());
        let campus_value = campus.unwrap_or("1");

        let classrooms_url = format!("{}/admin/pkgl/jyjs/mobile/jsxx", JWXT_BASE_URL);

        let periods_str = periods_value.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",");

        let mut params = vec![
            ("zcStr", week_value.to_string()),
            ("xqStr", weekday_value.to_string()),
            ("jcStr", periods_str),
            ("xqdm", campus_value.to_string()),
            ("xnxq", self.semester.clone()),
            ("type", "1".to_string()),
            ("pxfs", "5".to_string()),
        ];

        if let Some(min) = min_seats {
            params.push(("jsrlMin", min.to_string()));
        }
        if let Some(max) = max_seats {
            params.push(("jsrlMax", max.to_string()));
        }
        if let Some(b) = building {
            params.push(("jxlmc", b.to_string()));
        }

        println!("[调试] 查询 empty classrooms: week={}, weekday={}, periods={:?}", 
            week_value, weekday_value, periods_value);

        let response = self.client
            .post(&classrooms_url)
            .form(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "*/*")
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] Classrooms 响应 status: {}, 地址: {}", status, final_url);

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }

        let json: Value = response.json().await?;
        self.parse_classrooms(&json)
    }

    fn parse_classrooms(&self, json: &Value) -> Result<Vec<Classroom>, Box<dyn std::error::Error + Send + Sync>> {
        let mut classrooms = Vec::new();

        let items = json.get("list")
            .or_else(|| json.get("data"))
            .or_else(|| json.get("results"))
            .and_then(|v| v.as_array());

        if let Some(items) = items {
            println!("[调试] 找到 {} classrooms", items.len());
            for item in items {
                let classroom = Classroom {
                    name: item.get("jsmc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    building: item.get("jxlmc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    capacity: item.get("jsrl")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                        .unwrap_or(0) as i32,
                    address: item.get("jsdz").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    campus: item.get("xqmc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                };
                classrooms.push(classroom);
            }
        }

        Ok(classrooms)
    }
}
