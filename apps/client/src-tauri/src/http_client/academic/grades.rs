//! 成绩查询：成绩列表、带任课教师成绩、课程教师映射。

use super::super::*;
use crate::parser;

impl HbutClient {
    /// 拉取成绩列表
    pub async fn fetch_grades(
        &self,
    ) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let grades_url = format!(
            "{}/admin/xsd/xsdcjcx/xsdQueryXscjList",
            self.academic_base_url()
        );

        println!("[调试] 获取成绩: {}", grades_url);

        // 使用正‘的成╂煡璇㈠弬鏁?
        let params = [
            ("fxbz", "0"),
            ("gridtype", "jqgrid"),
            ("queryFields", "id,xnxq,kcmc,kch,xf,kcxz,kclx,ksxs,kcgs,xdxz,kclb,cjfxms,zhcj,hdxf,tscjzwmc,sfbk,cjlrjsxm,jsxm,kcsx,fxcj,dztmlfjcj"),
            ("_search", "false"),
            ("page.size", "500"),
            ("page.pn", "1"),
            ("sort", "xnxq desc,id"),
            ("order", "desc"),
            ("startXnxq", "001"),
            ("endXnxq", "001"),
        ];

        let mut repaired = false;
        let text = loop {
            let response = self
                .client
                .post(&grades_url)
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .form(&params)
                .send()
                .await?;
            let status = response.status();
            let final_url = response.url().to_string();
            println!("[调试] 成绩响应状态: {}, 地址: {}", status, final_url);

            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 成绩请求命中登录页，已补票后重试");
                    continue;
                }
                return Err("会话已过期，请重新登录".into());
            }

            break response.text().await?;
        };
        println!("[调试] 成绩响应长度: {}", text.len());

        // 尝试解析 JSON
        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                println!("[调试] 成绩 JSON 解析失败: {}", e);
                println!(
                    "[调试] 响应预览: {}",
                    &text.chars().take(200).collect::<String>()
                );
                return Err(format!("成绩数据解析失败: {}", e).into());
            }
        };

        parser::parse_grades(&json)
    }

    /// 获取成绩（带任课教师）。
    /// 在原有成绩查询基础上，额外调用已选课程接口获取每门课的任课教师，通过 kcbh 匹配后注入。
    pub async fn fetch_grades_with_teachers(
        &self,
    ) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let mut grades = self.fetch_grades().await?;
        if grades.is_empty() {
            return Ok(grades);
        }

        // 收集所有唯一学期
        let mut semesters: Vec<String> = grades
            .iter()
            .filter_map(|g| {
                let t = g.term.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            })
            .collect();
        semesters.sort();
        semesters.dedup();

        // 对每个学期获取课程教师数据
        let mut teacher_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for sem in &semesters {
            if let Ok(courses) = self.fetch_course_teachers(sem).await {
                for (kcbh, rkjs) in courses {
                    if !kcbh.is_empty() && !rkjs.is_empty() {
                        teacher_map.entry(kcbh).or_insert(rkjs);
                    }
                }
            }
        }

        // 通过 kcbh 匹配并注入 course_teacher，不覆盖原有的 teacher（录入教师）
        for grade in &mut grades {
            if let Some(ref kcbh) = grade.kcbh {
                if let Some(teacher) = teacher_map.get(kcbh) {
                    grade.course_teacher = Some(teacher.clone());
                }
            }
        }

        Ok(grades)
    }

    /// 获取指定学期的已选课程，返回 (kcbh, rkjs) 映射
    pub async fn fetch_course_teachers(
        &self,
        semester: &str,
    ) -> Result<Vec<(String, String)>, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/admin/xsd/yxkccx/listYxkc", self.academic_base_url());

        let mut repaired = false;
        let text = loop {
            let response = self
                .client
                .get(&url)
                .query(&[
                    ("gridtype", "jqgrid"),
                    ("queryFields", "id,kcbh,kcmc,xf,rkjs,jxbmc"),
                    ("page.size", "100"),
                    ("page.pn", "1"),
                    ("xnxq", semester),
                ])
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header(
                    "Referer",
                    format!("{}/admin/indexMain/M1406", self.academic_base_url()),
                )
                .send()
                .await?;

            let _status = response.status();
            let final_url = response.url().to_string();

            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 课程教师请求命中登录页，已补票后重试");
                    continue;
                }
                return Err("会话已过期，请重新登录".into());
            }

            break response.text().await?;
        };

        let json: serde_json::Value = serde_json::from_str(&text)?;
        let mut result = Vec::new();

        if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
            for item in results {
                let kcbh = item
                    .get("kcbh")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let rkjs = item
                    .get("rkjs")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !kcbh.is_empty() && !rkjs.is_empty() {
                    result.push((kcbh, rkjs));
                }
            }
        }

        println!(
            "[调试] 学期 {} 获取到 {} 个课程教师",
            semester,
            result.len()
        );
        Ok(result)
    }
}
