use super::*;
use std::collections::HashMap;

impl HbutClient {
    /// 获取全校课表节次信息
    pub async fn fetch_qxzkb_jcinfo(&self, xnxq: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/admin/pkgl/pkglqxzkb/getJcinfo", JWXT_BASE_URL);
        let resp = self.client
            .get(&url)
            .query(&[("xnxq", xnxq)])
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{}/admin/jsd/qxzkb", JWXT_BASE_URL))
            .send()
            .await?;
        let text = resp.text().await.unwrap_or_default();
        if text.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("节次信息解析失败: {}", e))?;
        Ok(json)
    }

    /// 获取专业信息
    pub async fn fetch_qxzkb_zyxx(&self, yxid: &str, njdm: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/admin/system/jcsj/zysj/getZyxxList", JWXT_BASE_URL);
        let resp = self.client
            .get(&url)
            .query(&[("yxid", yxid), ("njdm", njdm)])
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{}/admin/jsd/qxzkb", JWXT_BASE_URL))
            .send()
            .await?;
        let text = resp.text().await.unwrap_or_default();
        if text.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("专业信息解析失败: {}", e))?;
        Ok(json)
    }

    /// 获取开课教研室信息（公开接口）
    pub async fn fetch_qxzkb_kkjys(&self, kkyxid: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/admin/system/jcsj/bmsj/getKkjysListNoAuth", JWXT_BASE_URL);
        let resp = self.client
            .get(&url)
            .query(&[("kkyxid", kkyxid)])
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{}/admin/jsd/qxzkb", JWXT_BASE_URL))
            .send()
            .await?;
        let text = resp.text().await.unwrap_or_default();
        if text.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("教研室信息解析失败: {}", e))?;
        Ok(json)
    }

    /// 查询全校课表
    pub async fn fetch_qxzkb_list(&self, params: &HashMap<String, String>) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 先访问页面建立会话（避免登录超时）
        let page_url = format!("{}/admin/jsd/qxzkb", JWXT_BASE_URL);
        let _ = self.client.get(&page_url).send().await;
        let url = format!("{}/admin/jsd/qxzkb/querylist?gridtype=jqgrid", JWXT_BASE_URL);
        let resp = self.client
            .get(&url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/jsd/qxzkb", JWXT_BASE_URL))
            .send()
            .await?;
        let status = resp.status();
        let final_url = resp.url().to_string();
        let text = resp.text().await.unwrap_or_default();

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        if !status.is_success() {
            return Err(format!("全校课表请求失败: {}", status).into());
        }

        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("全校课表响应解析失败: {}", e))?;
        Ok(json)
    }
}
