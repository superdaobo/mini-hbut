//! 🏆 绩点排名查询模块 - 与 Python modules/ranking.py 对应

use reqwest::Client;
use serde::{Deserialize, Serialize};
use regex::Regex;

const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ranking {
    pub student_id: String,
    pub name: String,
    pub semester: String,
    pub gpa: Option<f64>,
    pub average_score: Option<f64>,
    pub total_credits: Option<f64>,
    pub major_rank: Option<i32>,
    pub major_total: Option<i32>,
    pub class_rank: Option<i32>,
    pub class_total: Option<i32>,
}

pub struct RankingModule {
    client: Client,
}

impl RankingModule {
    pub fn new(client: Client) -> Self {
        Self { client }
    }

    pub async fn fetch_ranking(
        &self, 
        student_id: &str, 
        semester: Option<&str>,
        grade: Option<&str>
    ) -> Result<Ranking, Box<dyn std::error::Error + Send + Sync>> {
        let ranking_url = format!("{}/admin/cjgl/xscjbbdy/getXscjpm", JWXT_BASE_URL);
        
        // 如果未指定年级，从学号推断
        let grade_value = grade.map(|s| s.to_string()).unwrap_or_else(|| {
            if student_id.len() >= 2 {
                let year_prefix = &student_id[..2];
                if year_prefix.chars().all(|c| c.is_ascii_digit()) {
                    format!("20{}", year_prefix)
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        });
        
        let semester_value = semester.unwrap_or("");
        
        let params = [
            ("xh", student_id),
            ("sznj", &grade_value),
            ("xnxq", semester_value),
        ];
        
        println!("[调试] 获取 ranking 来自: {} with params: xh={}, sznj={}, xnxq={}", 
            ranking_url, student_id, grade_value, semester_value);
        
        let response = self.client
            .get(&ranking_url)
            .query(&params)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Referer", format!("{}/admin/cjgl/xscjbbdy/xsgrcjpmlist1", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] Ranking 响应 status: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        println!("[调试] Ranking HTML length: {}", html.len());
        
        self.parse_html(&html, student_id, semester_value)
    }

    fn parse_html(&self, html: &str, student_id: &str, semester: &str) -> Result<Ranking, Box<dyn std::error::Error + Send + Sync>> {
        let mut ranking = Ranking {
            student_id: student_id.to_string(),
            name: String::new(),
            semester: semester.to_string(),
            gpa: None,
            average_score: None,
            total_credits: None,
            major_rank: None,
            major_total: None,
            class_rank: None,
            class_total: None,
        };

        // 姓名
        if let Ok(re) = Regex::new(r"姓名[：:]\s*([^\s<]+)") {
            if let Some(cap) = re.captures(html) {
                ranking.name = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
            }
        }

        // 绩点 - 尝试多种模式
        let gpa_patterns = [
            r"平均学分绩点[：:]\s*([\d.]+)",
            r"绩点[：:]\s*([\d.]+)",
            r"GPA[：:]\s*([\d.]+)",
        ];
        for pattern in gpa_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(cap) = re.captures(html) {
                    if let Some(m) = cap.get(1) {
                        if let Ok(v) = m.as_str().parse::<f64>() {
                            ranking.gpa = Some(v);
                            break;
                        }
                    }
                }
            }
        }

        // 平均分
        if let Ok(re) = Regex::new(r"平均成绩[：:]\s*([\d.]+)") {
            if let Some(cap) = re.captures(html) {
                ranking.average_score = cap.get(1).and_then(|m| m.as_str().parse().ok());
            }
        }

        // 总学分
        if let Ok(re) = Regex::new(r"获得学分[：:]\s*([\d.]+)") {
            if let Some(cap) = re.captures(html) {
                ranking.total_credits = cap.get(1).and_then(|m| m.as_str().parse().ok());
            }
        }

        // 专业排名
        let major_patterns = [
            r"专业排名[：:]\s*(\d+)\s*/\s*(\d+)",
            r"专业排名[：:]\s*(\d+)[^\d]*(\d+)",
        ];
        for pattern in major_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(cap) = re.captures(html) {
                    ranking.major_rank = cap.get(1).and_then(|m| m.as_str().parse().ok());
                    ranking.major_total = cap.get(2).and_then(|m| m.as_str().parse().ok());
                    if ranking.major_rank.is_some() {
                        break;
                    }
                }
            }
        }

        // 班级排名
        let class_patterns = [
            r"班级排名[：:]\s*(\d+)\s*/\s*(\d+)",
            r"班级排名[：:]\s*(\d+)[^\d]*(\d+)",
        ];
        for pattern in class_patterns {
            if let Ok(re) = Regex::new(pattern) {
                if let Some(cap) = re.captures(html) {
                    ranking.class_rank = cap.get(1).and_then(|m| m.as_str().parse().ok());
                    ranking.class_total = cap.get(2).and_then(|m| m.as_str().parse().ok());
                    if ranking.class_rank.is_some() {
                        break;
                    }
                }
            }
        }

        println!("[调试] 已解析 ranking: GPA={:?}, Major={:?}/{:?}, Class={:?}/{:?}", 
            ranking.gpa, ranking.major_rank, ranking.major_total, 
            ranking.class_rank, ranking.class_total);

        Ok(ranking)
    }
}
