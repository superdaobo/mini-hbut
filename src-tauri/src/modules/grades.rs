//! 📊 成绩查询模块 - 与 Python modules/grades.py 对应
//! 
//! 该模块主要负责：
//! 1. 向教务系统发送 jqgrid 格式的 POST 请求获取成绩列表。
//! 2. 处理 JSON 响应并解析为标准的 `Grade` 结构体。
//! 
//! 注意：本模块目前主要作为独立模块存在，整合逻辑在 `http_client.rs` 中也有实现。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// 教务系统基础 URL
const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

/// 成绩实体结构
/// 对应前端展示所需的字段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grade {
    /// 学年学期 (如 2024-2025-1)
    pub term: String,
    /// 课程名称
    pub course_name: String,
    /// 课程性质 (必修/选修)
    pub course_nature: String,
    /// 学分
    pub course_credit: String,
    /// 最终成绩
    pub final_score: String,
    /// 获得学分
    pub earned_credit: String,
    /// 任课教师
    pub teacher: Option<String>,
}

/// 成绩查询模块封装
pub struct GradesModule {
    /// HTTP 客户端引用
    client: Client,
    /// 当前会话的 Cookies
    cookies: HashMap<String, String>,
}

impl GradesModule {
    /// 创建新的成绩模块实例
    pub fn new(client: Client) -> Self {
        Self {
            client,
            cookies: HashMap::new(),
        }
    }

    /// 加载 Cookies (用于保持会话)
    pub fn load_cookies(&mut self, cookies: &HashMap<String, String>) {
        self.cookies = cookies.clone();
    }

    /// 获取所有成绩列表
    /// 
    /// 发送包含 `queryFields` 的 POST 请求，并解析返回的 JSON 数据。
    /// 如果会话过期 (重定向到 login)，返回错误。
    pub async fn fetch_grades(&self) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let grades_url = format!(
            "{}/admin/xsd/xsdcjcx/xsdQueryXscjList",
            JWXT_BASE_URL
        );
        
        println!("[调试] 获取 grades 来自: {}", grades_url);
        
        // 构建 JQGrid 请求参数
        // page.size 设置为 500 以一次性获取大部分成绩
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
        println!("[调试] Grades 响应 status: {}, 地址: {}", status, final_url);
        
        // 检查是否被重定向到登录页
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let text = response.text().await?;
        println!("[调试] Grades 响应 length: {}", text.len());
        
        let json: Value = serde_json::from_str(&text)?;
        self.parse_grades(&json)
    }

    /// 解析成绩接口返回的 JSON
    fn parse_grades(&self, json: &Value) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let mut grades = Vec::new();
        
        // 兼容不同的 JSON 结构 (results vs items)
        let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
            let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
            let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
            
            println!("[调试] Grades API ret={}, msg={}, results count={}", ret, msg, results.len());
            
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
            
            // 清理课程名称中的潜在 ID 前缀
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
        
        println!("[调试] 已解析 {} grades", grades.len());
        Ok(grades)
    }

    /// 辅助函数：提取数值或字符串字段
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
