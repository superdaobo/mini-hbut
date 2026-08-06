//! 学业进度：按方案类别（fasz）拉取学业完成情况并解析为树形结构。

use super::super::*;

impl HbutClient {
    /// 获取学业完成情况 (与 Python academic_progress.py 一致)
    pub async fn fetch_academic_progress(
        &self,
        fasz: i32,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        println!("[DEBUG] Fetching academic progress with fasz={}", fasz);

        // 1. 获取 xhid
        let base_url = format!("{}/admin/xsd/xskp?fasz={}", self.academic_base_url(), fasz);
        let mut repaired = false;
        let html = loop {
            let response = self.client.get(&base_url).send().await?;
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 学业进度请求命中登录页，已补票后重试");
                    continue;
                }
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "会话已过期，请重新登录",
                    "need_login": true
                }));
            }
            break response.text().await?;
        };

        // 提取 xhid
        let xhid = regex::Regex::new(r#"id="xhid"\s+value="([^"]+)""#)?
            .captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .or_else(|| {
                regex::Regex::new(r#"xhid\s*[:=]\s*["']([^"']+)["']"#)
                    .ok()?
                    .captures(&html)?
                    .get(1)
                    .map(|m| m.as_str().to_string())
            });

        let xhid = match xhid {
            Some(id) => id,
            None => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "无法获取学号ID",
                    "need_login": true
                }));
            }
        };

        println!("[DEBUG] Got xhid: {}", xhid);

        // 2. 获取基本信息
        let info_url = format!("{}/admin/xsd/xskp/xskp", self.academic_base_url());
        let info_resp = self
            .client
            .get(&info_url)
            .query(&[("fasz", fasz.to_string()), ("xhid", xhid.clone())])
            .send()
            .await?;
        let info_data: serde_json::Value = info_resp.json().await.unwrap_or_default();

        // 3. 获取统计信息
        let summary_url = format!("{}/admin/xsd/xskp/xyqk", self.academic_base_url());
        let summary_resp = self
            .client
            .get(&summary_url)
            .query(&[("fasz", fasz.to_string()), ("xhid", xhid.clone())])
            .send()
            .await?;
        let summary_data: serde_json::Value = summary_resp.json().await.unwrap_or_default();

        // 4. 获取树形数据
        let tree_url = format!("{}/admin/xsd/xskp/xyjc", self.academic_base_url());
        let tree_resp = self
            .client
            .get(&tree_url)
            .query(&[
                ("fasz", fasz.to_string()),
                ("xhid", xhid.clone()),
                ("flag", "1".to_string()),
            ])
            .send()
            .await?;
        let tree_data: serde_json::Value = tree_resp.json().await.unwrap_or_default();

        // 提取实际数据
        let basic = if info_data.get("ret").and_then(|v| v.as_i64()) == Some(0) {
            info_data.get("data").cloned()
        } else {
            None
        };

        let summary = if summary_data.get("ret").and_then(|v| v.as_i64()) == Some(0) {
            summary_data.get("data").cloned()
        } else {
            None
        };

        let tree = if tree_data.get("ret").and_then(|v| v.as_i64()) == Some(0) {
            tree_data.get("data").cloned()
        } else {
            None
        };

        Ok(serde_json::json!({
            "success": true,
            "data": {
                "xhid": xhid,
                "basic": basic,
                "summary": summary,
                "tree": tree
            },
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }
}
