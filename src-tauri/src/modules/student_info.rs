//! 👤 个人信息查询模块 - 与 Python modules/student_info.py 对应

use reqwest::Client;
use serde::{Deserialize, Serialize};
use regex::Regex;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentInfo {
    pub student_id: String,
    pub name: String,
    pub gender: String,
    pub id_number: String,
    pub ethnicity: String,
    pub grade: String,
    pub college: String,
    pub major: String,
    pub class_name: String,
    pub education_level: String,
    pub study_years: String,
}

pub struct StudentInfoModule {
    client: Client,
}

impl StudentInfoModule {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn fetch_info(&self) -> Result<StudentInfo, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!("{}/admin/xsd/xsjbxx/xskp", JWXT_BASE_URL);
        
        println!("[DEBUG] Fetching student info from: {}", info_url);
        
        let response = self.client
            .get(&info_url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Referer", format!("{}/admin/indexMain/M1402", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Student info response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        println!("[DEBUG] Student info HTML length: {}", html.len());
        
        self.parse_html(&html)
    }

    fn parse_html(&self, html: &str) -> Result<StudentInfo, Box<dyn std::error::Error + Send + Sync>> {
        let extract_field = |label: &str| -> String {
            let pattern = format!(
                r#"(?s){}[：:]?\s*</label>\s*</div>\s*<div class="item-content">\s*(?:<label[^>]*>)?([^<★]+)"#,
                regex::escape(label)
            );
            if let Ok(re) = Regex::new(&pattern) {
                if let Some(cap) = re.captures(html) {
                    let value = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
                    if !value.is_empty() && value != "★★★★" {
                        return value;
                    }
                }
            }
            String::new()
        };

        let info = StudentInfo {
            student_id: extract_field("学号"),
            name: extract_field("姓名"),
            gender: extract_field("性别"),
            id_number: extract_field("身份证件号"),
            ethnicity: extract_field("民族"),
            grade: extract_field("所在年级"),
            college: extract_field("院系信息"),
            major: extract_field("专业信息"),
            class_name: extract_field("班级信息"),
            education_level: extract_field("培养层次"),
            study_years: extract_field("学制"),
        };

        if info.student_id.is_empty() && info.name.is_empty() {
            return Err("无法解析学生信息，可能会话已过期".into());
        }

        println!("[DEBUG] Parsed student info: {} - {}", info.student_id, info.name);
        Ok(info)
    }
}
