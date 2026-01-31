//! 📚 培养方案查询模块
//! 
//! 该模块对应教务系统的“学生培养方案查询”功能。
//! 主要提供以下能力：
//! 1. `fetch_options`: 抓取页面上的下拉框选项（年级、学期、学院等），用于构建前端筛选器。
//! 2. `fetch_courses`: 根据筛选条件，查询具体的执行计划课程列表。
//! 
//! 这里的逻辑与 `http_client.rs` 中的实现可能存在重叠，`http_client.rs` 是目前的实际调用路径。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use regex::Regex;
use html_escape::decode_html_entities;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

/// 通用下拉选项结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

/// 筛选器选项集合
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingPlanOptions {
    /// 年级选项 (如 2021, 2022)
    pub grade: Vec<SelectOption>,
    /// 开课学期选项
    pub kkxq: Vec<SelectOption>,
    pub kkyx: Vec<SelectOption>,
    pub kcxz: Vec<SelectOption>,
    pub kcgs: Vec<SelectOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Course {
    pub id: String,
    pub name: String,
    pub course_type: String,
    pub required: bool,
    pub grade: String,
    pub semester: String,
    pub credit: String,
    pub total_hours: String,
    pub theory_hours: String,
    pub practice_hours: String,
    pub college: String,
    pub department: String,
}

pub struct TrainingPlanModule {
    client: Client,
}

impl TrainingPlanModule {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn fetch_options(&self) -> Result<TrainingPlanOptions, Box<dyn std::error::Error + Send + Sync>> {
        let page_url = format!("{}/admin/xsd/studentpyfa", JWXT_BASE_URL);
        
        println!("[DEBUG] Fetching training plan options from: {}", page_url);

        let response = self.client
            .get(&page_url)
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Training plan page status: {}, URL: {}", status, final_url);

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }

        let html = response.text().await?;
        
        Ok(TrainingPlanOptions {
            grade: Self::extract_select_options(&html, "grade"),
            kkxq: Self::extract_select_options(&html, "kkxq"),
            kkyx: Self::extract_select_options(&html, "kkyx"),
            kcxz: Self::extract_select_options(&html, "kcxz"),
            kcgs: Self::extract_select_options(&html, "kcgs"),
        })
    }

    pub async fn fetch_jys(&self, yxid: &str) -> Result<Vec<SelectOption>, Box<dyn std::error::Error + Send + Sync>> {
        if yxid.is_empty() {
            return Ok(vec![]);
        }

        let jys_url = format!("{}/admin/pygcgl/kckgl/queryJYSNoAuth", JWXT_BASE_URL);
        
        println!("[DEBUG] Fetching JYS from: {} with yxid={}", jys_url, yxid);

        let response = self.client
            .get(&jys_url)
            .query(&[("yxid", yxid)])
            .send()
            .await?;

        if !response.status().is_success() {
            return Ok(vec![]);
        }

        let json: Value = response.json().await?;
        
        let mut options = Vec::new();
        if let Some(items) = json.as_array() {
            for item in items {
                let id = item.get("id").and_then(|v| {
                    v.as_str().map(|s| s.to_string())
                        .or_else(|| v.as_i64().map(|n| n.to_string()))
                });
                let name = item.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
                
                if let (Some(id_str), Some(name_str)) = (id, name) {
                    options.push(SelectOption {
                        value: id_str,
                        label: name_str,
                    });
                }
            }
        }

        Ok(options)
    }

    pub async fn fetch_courses(
        &self,
        grade: Option<&str>,
        kkxq: Option<&str>,
        kkyx: Option<&str>,
        kkjys: Option<&str>,
        kcxz: Option<&str>,
        kcgs: Option<&str>,
        kcbh: Option<&str>,
        kcmc: Option<&str>,
        page: i32,
        page_size: i32,
    ) -> Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        let list_url = format!("{}/admin/xsd/studentpyfa/ajaxList2", JWXT_BASE_URL);
        
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let query_fields = "id,kcmc,kcxz,sfbx,kcgs,gradename,kkxq,yxxdxq,xf,zongxs,llxs,syxs,shangjxs,shijianxs,qtxs,kkyxmc,kkjysmc,zyfxmc,sfsjhj,sjzs,ksxs";
        
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", query_fields),
            ("_search", "false"),
            ("nd", &timestamp.to_string()),
            ("page.size", &page_size.to_string()),
            ("page.pn", &page.to_string()),
            ("sort", "id"),
            ("order", "asc"),
            ("grade", grade.unwrap_or("")),
            ("kkxq", kkxq.unwrap_or("")),
            ("kkyx", kkyx.unwrap_or("")),
            ("kkjys", kkjys.unwrap_or("")),
            ("kcxz", kcxz.unwrap_or("")),
            ("kcgs", kcgs.unwrap_or("")),
            ("kcbh", kcbh.unwrap_or("")),
            ("kcmc", kcmc.unwrap_or("")),
        ];

        println!("[DEBUG] Fetching training plan courses from: {}", list_url);

        let response = self.client
            .get(&list_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/xsd/studentpyfa", JWXT_BASE_URL))
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Training plan courses status: {}, URL: {}", status, final_url);

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }

        let json: Value = response.json().await?;
        
        // 检查 API 返回状态
        if let Some(ret) = json.get("ret").and_then(|v| v.as_i64()) {
            if ret != 0 {
                let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("未知错误");
                return Err(format!("API 返回错误: {}", msg).into());
            }
        }

        Ok(json)
    }

    fn extract_select_options(html: &str, name: &str) -> Vec<SelectOption> {
        let pattern = format!(r#"<select[^>]*name="{}[^"]*"[^>]*>(.*?)</select>"#, regex::escape(name));
        let re = Regex::new(&pattern).ok();
        
        if let Some(re) = re {
            if let Some(cap) = re.captures(html) {
                if let Some(select_html) = cap.get(1) {
                    return Self::parse_options(select_html.as_str());
                }
            }
        }

        vec![]
    }

    fn parse_options(select_html: &str) -> Vec<SelectOption> {
        let mut options = Vec::new();
        let re = Regex::new(r#"<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>"#).ok();
        
        if let Some(re) = re {
            for cap in re.captures_iter(select_html) {
                let value = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                let label = cap.get(2).map(|m| m.as_str()).unwrap_or("");
                
                // 清理 HTML 标签和解码实体
                let clean_label = Regex::new(r"<.*?>")
                    .map(|re| re.replace_all(label, ""))
                    .unwrap_or_else(|_| label.into());
                let clean_label = decode_html_entities(&clean_label).to_string().trim().to_string();
                let clean_value = decode_html_entities(value).to_string().trim().to_string();
                
                // 过滤掉空选项
                if clean_value.is_empty() && (clean_label == "请选择" || clean_label == "全部" || clean_label.is_empty()) {
                    continue;
                }
                
                options.push(SelectOption {
                    value: clean_value,
                    label: clean_label,
                });
            }
        }

        options
    }
}
