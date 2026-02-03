//! 👤 个人信息查询模块
//! 
//! 负责获取学生的学籍基本信息。
//! 数据来源：教务系统学籍卡片页面。
//! 解析方式：通常使用正则表达式从 HTML 中提取字段。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use regex::Regex;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

/// 学生详细信息实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentInfo {
    /// 学号
    pub student_id: String,
    /// 姓名
    pub name: String,
    /// 性别
    pub gender: String,
    /// 身份证号 (通常需脱敏)
    pub id_number: String,
    /// 民族
    pub ethnicity: String,
    /// 年级 (如 2021)
    pub grade: String,
    /// 学院
    pub college: String,
    /// 专业
    pub major: String,
    /// 班级
    pub class_name: String,
    /// 培养层次 (本科/硕士)
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
        
        println!("[调试] 获取 student info 来自: {}", info_url);
        
        let response = self.client
            .get(&info_url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Referer", format!("{}/admin/indexMain/M1402", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] Student info 响应 status: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        println!("[调试] Student info HTML length: {}", html.len());
        
        self.parse_html(&html)
    }

    fn parse_html(&self, html: &str) -> Result<StudentInfo, Box<dyn std::error::Error + Send + Sync>> {
        let extract_field = |label: &str| -> String {
            let patterns = [
                format!(
                    r#"(?s){}[：:]?\s*</label>\s*</div>\s*<div class="item-content">\s*(?:<label[^>]*>)?([^<★]+)"#,
                    regex::escape(label)
                ),
                format!(
                    r#"(?s){}[：:]?\s*</span>\s*</div>\s*<div class="item-content">\s*(?:<label[^>]*>)?([^<★]+)"#,
                    regex::escape(label)
                ),
                format!(
                    r#"(?s){}[：:]?\s*</td>\s*<td[^>]*>\s*([^<★]+)"#,
                    regex::escape(label)
                ),
            ];

            for pattern in patterns {
                if let Ok(re) = Regex::new(&pattern) {
                    if let Some(cap) = re.captures(html) {
                        let value = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
                        if !value.is_empty() && value != "★★★★" {
                            return value;
                        }
                    }
                }
            }

            String::new()
        };

        let extract_any = |labels: &[&str]| -> String {
            for label in labels {
                let v = extract_field(label);
                if !v.is_empty() {
                    return v;
                }
            }
            String::new()
        };

        let info = StudentInfo {
            student_id: extract_any(&["学号"]),
            name: extract_any(&["姓名"]),
            gender: extract_any(&["性别"]),
            id_number: extract_any(&["身份证件号", "身份证号", "身份证号码"]),
            ethnicity: extract_any(&["民族", "民族(族别)", "民族（族别）"]),
            grade: extract_any(&["所在年级", "年级"]),
            college: extract_any(&["院系信息", "学院", "院系"]),
            major: extract_any(&["专业信息", "专业"]),
            class_name: extract_any(&["班级信息", "班级"]),
            education_level: extract_any(&["培养层次", "培养类别"]),
            study_years: extract_any(&["学制", "学制年限", "学制(年)", "学制（年）"]),
        };

        if info.student_id.is_empty() && info.name.is_empty() {
            return Err("无法解析学生信息，可能会话已过期".into());
        }

        println!("[调试] 已解析 student info: {} - {}", info.student_id, info.name);
        Ok(info)
    }
}
