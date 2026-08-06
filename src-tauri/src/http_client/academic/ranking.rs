//! 成绩排名查询：按学号/学期拉取排名 HTML 并解析。

use super::super::*;
use crate::parser;
use reqwest::Url;

impl HbutClient {
    /// 获取成绩排名（学号/学期可选，默认取自登录用户与当前校历上下文）
    pub async fn fetch_ranking(
        &self,
        student_id: Option<&str>,
        semester: Option<&str>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let mut xh = student_id
            .map(|s| s.to_string())
            .or_else(|| self.user_info.as_ref().map(|u| u.student_id.clone()))
            .unwrap_or_default();

        if xh.is_empty() {
            return Err("未提供学号".into());
        }

        let jwxt_url = Url::parse(JWXT_BASE_URL)?;
        let chaoxing_jwxt_url = Url::parse(CHAOXING_JWXT_BASE_URL)?;
        let jwxt_cookie = self
            .cookie_jar
            .cookies(&jwxt_url)
            .map(|v| v.to_str().unwrap_or_default().to_string())
            .unwrap_or_default();
        let chaoxing_cookie = self
            .cookie_jar
            .cookies(&chaoxing_jwxt_url)
            .map(|v| v.to_str().unwrap_or_default().to_string())
            .unwrap_or_default();
        let has_chaoxing_cookie = !chaoxing_cookie.trim().is_empty();
        let has_jwxt_cookie = !jwxt_cookie.trim().is_empty();

        let academic_base = self.academic_base_url();
        let primary_base = resolve_ranking_base_url(
            academic_base,
            self.prefer_chaoxing_jwxt,
            has_jwxt_cookie,
            has_chaoxing_cookie,
        );
        println!(
            "[调试] 排名域名决策: academic_base={}, primary={}, prefer_chaoxing={}, cookie_len(jwxt)={}, cookie_len(cx_jwxt)={}",
            academic_base,
            primary_base,
            self.prefer_chaoxing_jwxt,
            jwxt_cookie.len(),
            chaoxing_cookie.len()
        );

        // 走超星教务时，前端 student_id 可能是手机号；从 cookie username 回落学号。
        let use_chaoxing_primary =
            primary_base.contains("chaoxing") || self.prefer_chaoxing_jwxt || has_chaoxing_cookie;
        if use_chaoxing_primary
            && xh.starts_with('1')
            && xh.len() == 11
            && xh.chars().all(|c| c.is_ascii_digit())
        {
            if let Some(cookie_xh) = chaoxing_cookie
                .split(';')
                .map(|v| v.trim())
                .find_map(|pair| pair.strip_prefix("username=").map(|v| v.trim().to_string()))
                .filter(|v| v.chars().all(|c| c.is_ascii_digit()) && v.len() >= 8)
            {
                println!("[调试] 排名学号修正: {} -> {}", xh, cookie_xh);
                xh = cookie_xh;
            }
        }

        let grade = if xh.len() >= 2 {
            let prefix = &xh[..2];
            if prefix.chars().all(|c| c.is_ascii_digit()) {
                format!("20{}", prefix)
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let semester_value = semester.unwrap_or("").to_string();
        let params = [
            ("xh", xh.as_str()),
            ("sznj", grade.as_str()),
            ("xnxq", semester_value.as_str()),
        ];

        let bases = ranking_base_fallback_chain(primary_base, has_jwxt_cookie, has_chaoxing_cookie);
        let mut last_login_error: Option<String> = None;

        for (idx, base) in bases.iter().enumerate() {
            let ranking_url = format!("{}/admin/cjgl/xscjbbdy/getXscjpm", base);
            println!(
                "[调试] 获取排名[{}/{}]：{} with params: {:?}",
                idx + 1,
                bases.len(),
                ranking_url,
                params
            );

            let response = self
                .client
                .get(&ranking_url)
                .query(&params)
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .header(
                    "Referer",
                    format!("{}/admin/cjgl/xscjbbdy/xsgrcjpmlist1", base),
                )
                .send()
                .await?;
            let mut status = response.status();
            let mut final_url = response.url().to_string();
            println!("[调试] 排名响应状态: {}, 地址: {}", status, final_url);
            let mut html = response.text().await?;

            // 命中登录页：超星域先补票；jwxt 域则尝试备选域名（链上的下一项）
            if looks_like_academic_login_url(&final_url) {
                if base.contains("chaoxing") {
                    println!("[调试] 排名命中超星教务登录页，尝试补票后重试");
                    let _ = self.ensure_chaoxing_academic_session().await;
                    let retry_resp = self
                        .client
                        .get(&ranking_url)
                        .query(&params)
                        .header(
                            "Accept",
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        )
                        .header(
                            "Referer",
                            format!("{}/admin/cjgl/xscjbbdy/xsgrcjpmlist1", base),
                        )
                        .send()
                        .await?;
                    status = retry_resp.status();
                    final_url = retry_resp.url().to_string();
                    println!("[调试] 排名补票重试状态: {}, 地址: {}", status, final_url);
                    html = retry_resp.text().await?;
                }

                if looks_like_academic_login_url(&final_url) {
                    last_login_error =
                        Some(format!("排名会话失效 base={} final={}", base, final_url));
                    println!("[调试] 排名域名 {} 仍为登录页，尝试下一候选（若有）", base);
                    continue;
                }
            }

            let html_lower = html.to_lowercase();
            if html_lower.contains("authserver/login")
                || html_lower.contains("id=\"casloginform\"")
                || html_lower.contains("pwdencryptsalt")
                || html.contains("统一身份认证")
            {
                last_login_error = Some("会话已失效，请重新登录后再查询排名".into());
                continue;
            }
            if !status.is_success() {
                last_login_error = Some(format!("排名接口请求失败: {}", status));
                continue;
            }

            return parser::parse_ranking_html(&html, &xh, &semester_value, &grade);
        }

        Err(last_login_error
            .unwrap_or_else(|| "会话已过期，请重新登录".to_string())
            .into())
    }
}
