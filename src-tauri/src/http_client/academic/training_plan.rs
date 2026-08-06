//! 培养方案：筛选选项、教研室（jys）与课程列表。

use super::super::utils::chrono_timestamp;
use super::super::*;
use chrono::Datelike;

impl HbutClient {
    /// 拉取培养方案筛选选项（年级/开课学期/开课院系/课程性质/课程归属）
    pub async fn fetch_training_plan_options(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 从培养方案页面获取真正的筛选选项 (与 Python training_plan.py 一致)
        let url = format!("{}/admin/xsd/studentpyfa", self.academic_base_url());

        println!("[DEBUG] Fetching training plan options from: {}", url);

        let mut repaired = false;
        let response = loop {
            let response = self
                .client
                .get(&url)
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .send()
                .await?;
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 培养方案选项请求命中登录页，已补票后重试");
                    continue;
                }
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "会话已过期，请重新登录",
                    "need_login": true
                }));
            }
            break response;
        };

        if !response.status().is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", response.status())
            }));
        }

        let html = response.text().await?;

        // 解析各个 select 选项
        let grade_options = self.extract_select_options(&html, "grade");
        let kkxq_options = self.extract_select_options(&html, "kkxq");
        let kkyx_options = self.extract_select_options(&html, "kkyx");
        let kcxz_options = self.extract_select_options(&html, "kcxz");
        let kcgs_options = self.extract_select_options(&html, "kcgs");

        // 根据学号推断默认年级
        let default_grade = self
            .user_info
            .as_ref()
            .and_then(|u| Self::infer_year_of_study(&u.student_id))
            .unwrap_or_default();

        // 推断默认学期（走自动学期策略）
        let semester = {
            let context = self.resolve_schedule_context(None).await;
            context
                .get("semester")
                .and_then(|v| v.as_str())
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .unwrap_or_default()
        };
        let default_kkxq = Self::infer_term_from_semester(&semester);

        println!(
            "[DEBUG] Training plan options: grade={} kkxq={} kkyx={} kcxz={} kcgs={}",
            grade_options.len(),
            kkxq_options.len(),
            kkyx_options.len(),
            kcxz_options.len(),
            kcgs_options.len()
        );

        Ok(serde_json::json!({
            "success": true,
            "options": {
                "grade": grade_options,
                "kkxq": kkxq_options,
                "kkyx": kkyx_options,
                "kcxz": kcxz_options,
                "kcgs": kcgs_options
            },
            "defaults": {
                "grade": default_grade,
                "kkxq": default_kkxq
            },
            "semester": semester
        }))
    }
    /// 根据学号推断当前学年 (1-4)
    fn infer_year_of_study(student_id: &str) -> Option<String> {
        if student_id.len() < 2 {
            return None;
        }

        let prefix = &student_id[..2];
        if !prefix.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }

        let entry_year = 2000 + prefix.parse::<i32>().ok()?;
        let now = chrono::Local::now();
        let academic_year = if now.month() >= 9 {
            now.year()
        } else {
            now.year() - 1
        };
        let mut year_of_study = academic_year - entry_year + 1;

        if year_of_study < 1 {
            year_of_study = 1;
        }
        if year_of_study > 4 {
            year_of_study = 4;
        }

        Some(year_of_study.to_string())
    }

    /// 从学期字符串推断学期序号 (如 "2024-2025-1" -> "1")
    fn infer_term_from_semester(semester: &str) -> String {
        if semester.is_empty() {
            return String::new();
        }
        let parts: Vec<&str> = semester.split('-').collect();
        if let Some(last) = parts.last() {
            if last.chars().all(|c| c.is_ascii_digit()) {
                return last.to_string();
            }
        }
        String::new()
    }
    pub async fn fetch_training_plan_jys(
        &self,
        yxid: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 获取教研室列表 (与 Python training_plan.py 一致)
        let url = format!(
            "{}/admin/pygcgl/kckgl/queryJYSNoAuth",
            self.academic_base_url()
        );

        println!("[DEBUG] Fetching JYS from: {} with yxid={}", url, yxid);

        let response = self
            .client
            .get(&url)
            .query(&[("yxid", yxid)])
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .await?;

        let json: serde_json::Value = response.json().await?;

        // 转换格式
        let mut jys_list = vec![];
        if let Some(arr) = json.as_array() {
            for item in arr {
                let id = item
                    .get("id")
                    .and_then(|v| v.as_str())
                    .or_else(|| item.get("id").and_then(|v| v.as_i64()).map(|_| ""))
                    .unwrap_or("");
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if !id.is_empty() {
                    jys_list.push(serde_json::json!({
                        "value": id.to_string(),
                        "label": name
                    }));
                }
            }
        }

        Ok(serde_json::json!({
            "success": true,
            "data": jys_list
        }))
    }

    pub async fn fetch_training_plan_courses(
        &self,
        grade: Option<String>,
        kkxq: Option<String>,
        kkyx: Option<String>,
        kkjys: Option<String>,
        kcxz: Option<String>,
        kcgs: Option<String>,
        kcbh: Option<String>,
        kcmc: Option<String>,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "{}/admin/xsd/studentpyfa/ajaxList2",
            self.academic_base_url()
        );

        let page_num = page.unwrap_or(1);
        let size = page_size.unwrap_or(50);

        let grade_str = grade.unwrap_or_default();
        let mut kkxq_str = kkxq.unwrap_or_default();
        let kkyx_str = kkyx.unwrap_or_default();
        let kkjys_str = kkjys.unwrap_or_default();
        let kcxz_str = kcxz.unwrap_or_default();
        let kcgs_str = kcgs.unwrap_or_default();
        let kcbh_str = kcbh.unwrap_or_default();
        let kcmc_str = kcmc.unwrap_or_default();
        if kkxq_str.trim().is_empty() {
            let context = self.resolve_schedule_context(None).await;
            let semester = context
                .get("semester")
                .and_then(|v| v.as_str())
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .unwrap_or_default();
            kkxq_str = Self::infer_term_from_semester(&semester);
        }
        let nd = chrono_timestamp().to_string();

        // 与 Python training_plan.py 完全一致的参数
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", "id,kcmc,kcxz,sfbx,kcgs,gradename,kkxq,yxxdxq,xf,zongxs,llxs,syxs,shangjxs,shijianxs,qtxs,kkyxmc,kkjysmc,zyfxmc,sfsjhj,sjzs,ksxs"),
            ("_search", "false"),
            ("nd", &nd),
            ("page.size", &size.to_string()),
            ("page.pn", &page_num.to_string()),
            ("sort", "id"),
            ("order", "asc"),
            ("grade", &grade_str),
            ("kkxq", &kkxq_str),
            ("kkyx", &kkyx_str),
            ("kkjys", &kkjys_str),
            ("kcxz", &kcxz_str),
            ("kcgs", &kcgs_str),
            ("kcbh", &kcbh_str),
            ("kcmc", &kcmc_str),
            ("query.grade||", &grade_str),
            ("query.kkxq||", &kkxq_str),
            ("query.kkyx||", &kkyx_str),
            ("query.kkjys||", &kkjys_str),
            ("query.kcxz||", &kcxz_str),
            ("query.kcgs||", &kcgs_str),
            ("query.kcbh||", &kcbh_str),
            ("query.kcmc||", &kcmc_str),
        ];

        println!("[DEBUG] Fetching training plan courses from: {}", url);

        let mut repaired = false;
        let response = loop {
            let response = self
                .client
                .get(&url)
                .query(&params)
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header(
                    "Referer",
                    format!("{}/admin/xsd/studentpyfa", self.academic_base_url()),
                )
                .send()
                .await?;
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 培养方案课程请求命中登录页，已补票后重试");
                    continue;
                }
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "会话已过期，请重新登录",
                    "need_login": true
                }));
            }
            break response;
        };
        let status = response.status();

        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }

        let json: serde_json::Value = response.json().await?;

        // 解析 jqgrid 格式响应
        let results = json
            .get("results")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let total = json.get("total").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let total_pages = json.get("totalPages").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let current_page = json
            .get("page")
            .and_then(|v| v.as_i64())
            .unwrap_or(page_num as i64) as i32;

        println!(
            "[DEBUG] Training plan courses: {} results, page {}/{}",
            results.len(),
            current_page,
            total_pages
        );

        Ok(serde_json::json!({
            "success": true,
            "data": results,
            "page": current_page,
            "totalPages": total_pages,
            "total": total
        }))
    }
}
