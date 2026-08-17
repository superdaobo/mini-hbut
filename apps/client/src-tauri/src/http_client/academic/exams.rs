//! 考试查询：按学期拉取考试安排列表。

use super::super::*;
use crate::parser;
use chrono::Local;

impl HbutClient {
    /// 获取考试列表（未指定学期时按校历上下文自动解析）
    pub async fn fetch_exams(
        &self,
        semester: Option<&str>,
    ) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
        // 1. ???????????????
        let semester = match semester {
            Some(s) if !s.trim().is_empty() => s.to_string(),
            _ => {
                let context = self.resolve_schedule_context(None).await;
                context
                    .get("semester")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| Self::semester_by_date(Local::now().date_naive()))
            }
        };
        println!("[调试] 考试学期: {}", semester);

        // ??????? API?? Python ?????
        let exams_url = format!(
            "{}/admin/xsd/kwglXsdKscx/ajaxXsksList",
            self.academic_base_url()
        );

        let params = [
            ("gridtype", "jqgrid"),
            (
                "queryFields",
                "id,kcmc,ksrq,kssj,xnxq,jsmc,ksdd,zwh,sddz,ksrs,kslx,kslxmc,kscddz,kcxxdz",
            ),
            ("_search", "false"),
            ("page.size", "100"),
            ("page.pn", "1"),
            ("sort", "ksrq"),
            ("order", "desc"),
            ("xnxq", semester.as_str()),
        ];

        println!("[调试] 获取考试：{}", exams_url);

        let mut repaired = false;
        let json: serde_json::Value = loop {
            let response = self
                .client
                .get(&exams_url)
                .query(&params)
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header(
                    "Referer",
                    format!("{}/admin/xsd/kwglXsdKscx", self.academic_base_url()),
                )
                .send()
                .await?;
            let status = response.status();
            let final_url = response.url().to_string();
            println!("[调试] 考试响应状态: {}, 地址: {}", status, final_url);

            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 考试请求命中登录页，已补票后重试");
                    continue;
                }
                return Err("会话已过期，请重新登录".into());
            }

            break response.json().await?;
        };
        println!(
            "[调试] 考试响应: ret={}, results count={}",
            json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1),
            json.get("results")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0)
        );

        parser::parse_exams(&json)
    }
}
