//! 📅 课表查询模块 - 与 Python modules/schedule.py 对应
//! 
//! 主要功能：
//! 1. 获取包含原始课表数据的 JSON。
//! 2. 解析复杂的周次字符串 (如 "1-16周(单)", "3,5-7周")。
//! 3. 计算当前周次。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use chrono::{Local, NaiveDate, Datelike};
use regex::Regex;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

/// 课表课程实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCourse {
    /// 课程ID
    pub id: String,
    /// 课程名称
    pub name: String,
    /// 教师名称
    pub teacher: String,
    /// 上课地点 (完整)
    pub location: String,
    /// 教室代码
    pub room_code: String,
    /// 教学楼
    pub building: String,
    /// 星期 (1=周一, 7=周日)
    pub weekday: i32,
    /// 开始节次 (1-12)
    pub period: i32,
    /// 持续节数
    pub periods: i32,
    /// 上课周次列表
    pub weeks: Vec<i32>,
    /// 周次原始文本
    pub weeks_text: String,
    /// 学分
    pub credit: String,
    /// 课程类型
    pub course_type: String,
}

/// 课表模块封装
pub struct ScheduleModule {
    client: Client,
    /// 当前查询的学期
    semester: String,
    /// 学期开始日期 (用于计算周次)
    semester_start: NaiveDate,
}

impl ScheduleModule {
    /// 初始化
    pub fn new(client: Client) -> Self {
        Self {
            client,
            semester: "2024-2025-1".to_string(), // 默认值，应从配置读取
            semester_start: NaiveDate::from_ymd_opt(2024, 8, 26).unwrap(),
        }
    }

    ///设置当前学期上下文
    pub fn set_semester(&mut self, semester: &str, start_date: NaiveDate) {
        self.semester = semester.to_string();
        self.semester_start = start_date;
    }

    /// 计算当前是第几周
    pub fn get_current_week(&self) -> i32 {
        let today = Local::now().date_naive();
        let days = (today - self.semester_start).num_days();
        let week = (days / 7 + 1).max(1).min(25) as i32;
        week
    }

    pub fn get_current_weekday(&self) -> i32 {
        Local::now().date_naive().weekday().num_days_from_monday() as i32 + 1
    }

    pub async fn fetch_schedule(&self, _student_id: &str) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
        // 1. 获取 xhid
        let xhid = self.get_xhid().await?;
        println!("[调试] 获取到 xhid: {}", xhid);
        
        // 2. 获取课表数据
        let schedule_url = format!("{}/admin/pkgl/xskb/sdpkkbList", JWXT_BASE_URL);
        
        let params = [
            ("xnxq", self.semester.as_str()),
            ("xhid", &xhid),
            ("xqdm", "1"),
            ("zdzc", ""),
            ("zxzc", ""),
            ("xskbxslx", "0"),
        ];
        
        println!("[调试] 获取 schedule 来自: {}", schedule_url);
        
        let response = self.client
            .get(&schedule_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}", JWXT_BASE_URL, self.semester))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] Schedule 响应 status: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let json: Value = response.json().await?;
        self.parse_schedule(&json)
    }

    async fn get_xhid(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let xhid_url = format!(
            "{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}",
            JWXT_BASE_URL, self.semester
        );
        
        let response = self.client
            .get(&xhid_url)
            .header("Referer", format!("{}/admin/index.html", JWXT_BASE_URL))
            .send()
            .await?;
        
        let html = response.text().await?;
        
        // 从 HTML 中提取 xhid
        if let Ok(re) = Regex::new(r#"xhid['\"]?\s*[:=]\s*['\"]([^'\"]+)['\"]"#) {
            if let Some(cap) = re.captures(&html) {
                return Ok(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
            }
        }
        
        if let Ok(re) = Regex::new(r"WGEyQ[A-Za-z0-9]+") {
            if let Some(cap) = re.find(&html) {
                return Ok(cap.as_str().to_string());
            }
        }
        
        Err("无法获取学号ID (xhid)".into())
    }

    fn parse_schedule(&self, json: &Value) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
        let mut courses = Vec::new();
        let current_week = self.get_current_week();
        
        let items = if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
            let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
            let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
            
            println!("[调试] Schedule API ret={}, msg={}, data count={}", ret, msg, data.len());
            
            if ret != 0 {
                return Err(format!("课表 API 返回错误: ret={}, msg={}", ret, msg).into());
            }
            
            data.clone()
        } else {
            return Err("课表数据格式不正确".into());
        };
        
        for item in &items {
            let raw_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("");
            let name = Self::extract_text_from_html(raw_name);
            
            let raw_teacher = item.get("tmc")
                .or_else(|| item.get("xm"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let teacher = Self::extract_text_from_html(raw_teacher);
            
            let raw_room = item.get("croommc")
                .or_else(|| item.get("cdmc"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let location = Self::extract_text_from_html(raw_room);
            
            let weekday = item.get("xingqi")
                .or_else(|| item.get("xqj"))
                .and_then(|v| v.as_i64())
                .unwrap_or(1) as i32;
            
            let period = item.get("djc")
                .and_then(|v| v.as_i64())
                .unwrap_or(1) as i32;
            
            let periods = item.get("djs")
                .and_then(|v| v.as_i64())
                .unwrap_or(2) as i32;
            
            let weeks_str = item.get("zcstr")
                .or_else(|| item.get("zc"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let weeks = Self::parse_weeks(weeks_str);
            
            let course = ScheduleCourse {
                id: item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                name,
                teacher,
                location,
                room_code: item.get("croombh").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                building: item.get("jxlmc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                weekday,
                period,
                periods,
                weeks,
                weeks_text: item.get("zc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                credit: item.get("xf").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                course_type: item.get("kcxz").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            };
            courses.push(course);
        }
        
        println!("[调试] 已解析 {} courses for current week {}", courses.len(), current_week);
        Ok((courses, current_week))
    }

    fn extract_text_from_html(html_str: &str) -> String {
        if html_str.is_empty() {
            return String::new();
        }
        if let Ok(re) = Regex::new(r">([^<]+)</a>") {
            if let Some(cap) = re.captures(html_str) {
                if let Some(m) = cap.get(1) {
                    return m.as_str().trim().to_string();
                }
            }
        }
        let re = Regex::new(r"<[^>]+>").unwrap();
        re.replace_all(html_str, "").trim().to_string()
    }

    fn parse_weeks(weeks_str: &str) -> Vec<i32> {
        let mut weeks = Vec::new();
        let clean_str = weeks_str.replace("周", "").replace("(单)", "").replace("(双)", "");
        
        for part in clean_str.split(',') {
            let part = part.trim();
            if part.contains('-') {
                let parts: Vec<&str> = part.split('-').collect();
                if parts.len() == 2 {
                    if let (Ok(start), Ok(end)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                        for w in start..=end {
                            weeks.push(w);
                        }
                    }
                }
            } else if let Ok(w) = part.parse::<i32>() {
                weeks.push(w);
            }
        }
        
        weeks
    }
}
