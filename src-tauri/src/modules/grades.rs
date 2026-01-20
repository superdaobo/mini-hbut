//! 📊 成绩查询模块 - 与 Python modules/grades.py 对应

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grade {
    pub term: String,
    pub course_name: String,
    pub course_nature: String,
    pub course_credit: String,
    pub final_score: String,
    pub earned_credit: String,
    pub teacher: Option<String>,
}

pub struct GradesModule {
    client: Client,
    cookies: HashMap<String, String>,
}

impl GradesModule {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            cookies: HashMap::new(),
        }
    }

    pub fn load_cookies(&mut self, cookies: &HashMap<String, String>) {
        self.cookies = cookies.clone();
    }

    pub async fn fetch_grades(&self) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let grades_url = format!(
            "{}/admin/xsd/xsdcjcx/xsdQueryXscjList",
            JWXT_BASE_URL
        );
        
        println!("[DEBUG] Fetching grades from: {}", grades_url);
        
        let params = [
            ("fxbz", "0"),
            ("gridtype", "jqgrid"),
            ("queryFields", "id,xnxq,kcmc,xf,kcxz,kclx,ksxs,kcgs,xdxz,kclb,cjfxms,zhcj,hdxf,tscjzwmc,sfbk,cjlrjsxm,kcsx,fxcj,dztmlfjcj"),
            ("_search", "false"),
            ("page.size", "500"),
            ("page.pn", "1"),
            ("sort", "xnxq desc,id"),
            ("order", "desc"),
            ("startXnxq", "001"),
            ("endXnxq", "001"),
        ];
        
        let response = self.client
            .post(&grades_url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .form(&params)
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Grades response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let text = response.text().await?;
        println!("[DEBUG] Grades response length: {}", text.len());
        
        let json: Value = serde_json::from_str(&text)?;
        self.parse_grades(&json)
    }

    fn parse_grades(&self, json: &Value) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let mut grades = Vec::new();
        
        let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
            let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
            let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
            
            println!("[DEBUG] Grades API ret={}, msg={}, results count={}", ret, msg, results.len());
            
            if ret != 0 {
                return Err(format!("成绩 API 返回错误: ret={}, msg={}", ret, msg).into());
            }
            
            results.clone()
        } else if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
            items.clone()
        } else {
            return Err("成绩数据格式不正确".into());
        };
        
        for item in &items {
            let term = item.get("xnxq").and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();
            
            let course_credit = Self::extract_number_field(item, &["xf"]);
            let final_score = Self::extract_number_field(item, &["zhcj", "cj"]);
            let earned_credit = Self::extract_number_field(item, &["hdxf", "jd"]);
            
            let mut course_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if let Some(idx) = course_name.find(']') {
                course_name = course_name[idx + 1..].to_string();
            }
            
            let course_nature = item.get("kcxz")
                .or_else(|| item.get("kcxzmc"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            
            let teacher = item.get("cjlrjsxm")
                .or_else(|| item.get("jsxm"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            
            grades.push(Grade {
                term,
                course_name,
                course_nature,
                course_credit,
                final_score,
                earned_credit,
                teacher,
            });
        }
        
        println!("[DEBUG] Parsed {} grades", grades.len());
        Ok(grades)
    }

    fn extract_number_field(item: &Value, keys: &[&str]) -> String {
        for key in keys {
            if let Some(v) = item.get(*key) {
                if let Some(s) = v.as_str() {
                    return s.to_string();
                } else if let Some(n) = v.as_f64() {
                    return n.to_string();
                } else if let Some(n) = v.as_i64() {
                    return n.to_string();
                }
            }
        }
        "0".to_string()
    }
}
