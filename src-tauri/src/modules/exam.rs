//! 📝 考试查询模块 - 与 Python modules/exam.py 对应

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exam {
    pub course_name: String,
    pub exam_date: String,
    pub exam_time: String,
    pub location: String,
    pub address: String,
    pub seat_number: Option<String>,
    pub exam_type: String,
    pub semester: String,
}

pub struct ExamModule {
    client: Client,
}

impl ExamModule {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn fetch_exams(&self, semester: Option<&str>) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
        let exams_url = format!(
            "{}/admin/xsd/kwglXsdKscx/ajaxXsksList",
            JWXT_BASE_URL
        );
        
        let semester_value = semester.unwrap_or("2024-2025-1");
        
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", "id,kcmc,ksrq,kssj,xnxq,jsmc,ksdd,zwh,sddz,ksrs,kslx,kslxmc,kscddz,kcxxdz"),
            ("_search", "false"),
            ("page.size", "100"),
            ("page.pn", "1"),
            ("sort", "ksrq"),
            ("order", "desc"),
            ("xnxq", semester_value),
        ];
        
        println!("[DEBUG] Fetching exams from: {}", exams_url);
        
        let response = self.client
            .get(&exams_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/xsd/kwglXsdKscx", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Exams response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let json: Value = response.json().await?;
        self.parse_exams(&json)
    }

    fn parse_exams(&self, json: &Value) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
        let mut exams = Vec::new();
        
        let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
            let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
            let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
            
            println!("[DEBUG] Exams API ret={}, msg={}, results count={}", ret, msg, results.len());
            
            if ret != 0 {
                return Err(format!("考试 API 返回错误: ret={}, msg={}", ret, msg).into());
            }
            
            results.clone()
        } else if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
            items.clone()
        } else {
            return Ok(vec![]);
        };
        
        for item in &items {
            let course_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let exam_date = item.get("ksrq").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let exam_time = item.get("kssj").and_then(|v| v.as_str()).unwrap_or("").to_string();
            
            let location = item.get("jsmc")
                .or_else(|| item.get("ksdd"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            
            let address = item.get("sddz")
                .or_else(|| item.get("kscddz"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            
            let seat_number = item.get("zwh")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            
            let exam_type = item.get("kslxmc").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let semester = item.get("xnxq").and_then(|v| v.as_str()).unwrap_or("").to_string();
            
            exams.push(Exam {
                course_name,
                exam_date,
                exam_time,
                location,
                address,
                seat_number,
                exam_type,
                semester,
            });
        }
        
        println!("[DEBUG] Parsed {} exams", exams.len());
        Ok(exams)
    }
}
