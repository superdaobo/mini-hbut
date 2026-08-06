//! 电费查询子模块。
//!
//! 负责：
//! - 位置层级查询（区域/楼栋/单元）
//! - 账户信息查询
//! - 交易记录查询（含空响应/失效令牌兜底重试）
//! - 余额查询（占位实现）

use crate::http_client::HbutClient;
use chrono::{Duration as ChronoDuration, Utc};
use reqwest::StatusCode;

impl HbutClient {
    pub async fn fetch_transaction_history(
        &mut self,
        start_date: &str,
        end_date: &str,
        page_no: i32,
        page_size: i32,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = match self.ensure_electricity_token().await {
            Ok(token) => token,
            Err(e) => {
                println!("[警告] 获取电费令牌失败: {}", e);
                if let Ok(one_code) = self.get_one_code_token().await {
                    if let Some(auth) = Self::extract_one_code_token(&one_code) {
                        auth
                    } else {
                        return Err(e);
                    }
                } else {
                    return Err(e);
                }
            }
        };

        let url = "https://code.hbut.edu.cn/server/user/tradeList";
        let payload = serde_json::json!({
            "pageSize": page_size,
            "tradeType": "1,2,3",
            "fromDate": start_date,
            "toDate": end_date,
            "pageNo": page_no
        });

        println!(
            "[调试] 获取交易记录: {} 到 {}, 第 {} 页",
            start_date, end_date, page_no
        );

        let resp = self
            .client
            .post(url)
            .header("Authorization", token.clone())
            .header("token", token.clone())
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .json(&payload)
            .send()
            .await?;
        let status = resp.status();
        let final_url = resp.url().to_string();
        let response_text = resp.text().await.unwrap_or_default();
        println!(
            "[调试] 交易记录响应: 状态={}, 地址={}, 长度={}",
            status,
            final_url,
            response_text.len()
        );

        let should_retry = response_text.trim().is_empty()
            || status == StatusCode::UNAUTHORIZED
            || status == StatusCode::FORBIDDEN
            || response_text.contains("未获取到电费授权")
            || response_text.contains("未登录")
            || response_text.to_lowercase().contains("unauthorized");

        if should_retry {
            println!("[警告] 交易记录响应异常，尝试刷新令牌...");
            if self.electricity_refresh_token.is_some() {
                if let Ok(bundle) = self.refresh_electricity_token().await {
                    let refresh = bundle
                        .refresh_token
                        .clone()
                        .or(self.electricity_refresh_token.clone());
                    let expires_at = bundle
                        .expires_in
                        .map(|s| Utc::now() + ChronoDuration::seconds(s));
                    self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
                    let retry_token = bundle.access_token;
                    let retry = self
                        .client
                        .post(url)
                        .header("Authorization", retry_token.clone())
                        .header("token", retry_token.clone())
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", "https://code.hbut.edu.cn/")
                        .json(&payload)
                        .send()
                        .await?;
                    let retry_text = retry.text().await.unwrap_or_default();
                    if !retry_text.trim().is_empty() {
                        let retry_json: serde_json::Value = serde_json::from_str(&retry_text)?;
                        return Ok(retry_json);
                    }
                }
            }
            if let Ok(bundle) = self.get_electricity_token().await {
                let refresh = bundle
                    .refresh_token
                    .clone()
                    .or(self.electricity_refresh_token.clone());
                let expires_at = bundle
                    .expires_in
                    .map(|s| Utc::now() + ChronoDuration::seconds(s));
                self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
                let token = bundle.access_token;
                let retry = self
                    .client
                    .post(url)
                    .header("Authorization", token.clone())
                    .header("token", token.clone())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", "https://code.hbut.edu.cn/")
                    .json(&payload)
                    .send()
                    .await?;
                let retry_status = retry.status();
                let retry_url = retry.url().to_string();
                let retry_text = retry.text().await.unwrap_or_default();
                println!(
                    "[调试] 交易记录重试响应: 状态={}, 地址={}, 长度={}",
                    retry_status,
                    retry_url,
                    retry_text.len()
                );
                if !retry_text.trim().is_empty() {
                    let retry_json: serde_json::Value = serde_json::from_str(&retry_text)?;
                    return Ok(retry_json);
                }
            }
            // 尝试 OneCode getToken（尽量避免频繁登录）
            if let Ok(one_code) = self.get_one_code_token().await {
                if let Some(auth) = Self::extract_one_code_token(&one_code) {
                    let retry = self
                        .client
                        .post(url)
                        .header("Authorization", auth.clone())
                        .header("token", auth)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", "https://code.hbut.edu.cn/")
                        .json(&payload)
                        .send()
                        .await?;
                    let retry_text = retry.text().await.unwrap_or_default();
                    if !retry_text.trim().is_empty() {
                        let retry_json: serde_json::Value = serde_json::from_str(&retry_text)?;
                        return Ok(retry_json);
                    }
                }
            }
        }

        if response_text.trim().is_empty() {
            return Err("交易记录返回空响应".into());
        }

        let json: serde_json::Value = match serde_json::from_str(&response_text) {
            Ok(v) => v,
            Err(e) => {
                let preview: String = response_text.chars().take(200).collect();
                return Err(format!("交易记录响应解析失败: {}, 预览: {}", e, preview).into());
            }
        };

        // 若成功但列表为空，兼容 pageNo=0 的接口行为
        let list_len = json
            .get("resultData")
            .and_then(|v| v.as_array())
            .map(|arr| arr.len())
            .unwrap_or(0);
        if list_len == 0 && page_no > 0 {
            let retry_payload = serde_json::json!({
                "pageSize": page_size,
                "tradeType": "1,2,3",
                "fromDate": start_date,
                "toDate": end_date,
                "pageNo": 0
            });
            if let Ok(retry_resp) = self
                .client
                .post(url)
                .header("Authorization", token.clone())
                .header("token", token.clone())
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("Origin", "https://code.hbut.edu.cn")
                .header("Referer", "https://code.hbut.edu.cn/")
                .json(&retry_payload)
                .send()
                .await
            {
                let retry_text = retry_resp.text().await.unwrap_or_default();
                if !retry_text.trim().is_empty() {
                    if let Ok(retry_json) = serde_json::from_str::<serde_json::Value>(&retry_text) {
                        return Ok(retry_json);
                    }
                }
            }
        }

        // token 失效重试
        if !json
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
        {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
            if msg.contains("token") || msg.contains("授权") || msg.contains("Authentication") {
                crate::hbut_debug!("[调试] 获取交易记录时令牌无效，尝试刷新...");
                let token = self.ensure_electricity_token().await?;
                let retry = self
                    .client
                    .post(url)
                    .header("Authorization", token.clone())
                    .header("token", token.clone())
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", "https://code.hbut.edu.cn/")
                    .json(&payload)
                    .send()
                    .await?;
                let retry_json: serde_json::Value = retry.json().await?;
                return Ok(retry_json);
            }
        }

        Ok(json)
    }
    /// 电费余额接口（目前为占位实现）
    pub async fn fetch_electricity_balance(
        &mut self,
        _room_id: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let bundle = self.get_electricity_token().await?;
        let refresh = bundle
            .refresh_token
            .clone()
            .or(self.electricity_refresh_token.clone());
        let expires_at = bundle
            .expires_in
            .map(|s| Utc::now() + ChronoDuration::seconds(s));
        self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
        let token = bundle.access_token;

        // 查询位置信息 (Area -> Building -> Unit -> Room)
        // 为简化，我们假设用户已经知道 room_id 或者我们先只实现余额查询
        // Python 版其实也需要层层查询，但这里直接构造 Account 查询
        // room_id 格式可能是 "area-building-level-room"
        // TODO: 完整的房间选择逻辑比较复杂，需要多次请求。
        // 这里先实现 Account API 调用，假设 room_id 透传了必要参数
        // 用户给的 room_id 可能只是房间号，我们需要先获取层级结构。

        // 既然从前端移植，前端应该会负责层级选择（调用 get_root_areas 等），
        // 还是说后端直接根据学号查？不，电费通常需要绑定房间。
        // 为了 "渲染一模一样"，我们需要提供 `get_root_areas`, `get_buildings`, `get_units` 等接口。

        // 暂时只实现 "获取所有层级" 的通用接口
        Ok(serde_json::json!({ "token": token }))
    }

    /// 查询电费位置层级（区域/楼栋/单元）
    pub async fn query_electricity_location(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.ensure_electricity_token().await?;

        let url = "https://code.hbut.edu.cn/server/utilities/location";
        let resp = self
            .client
            .post(url)
            .header("Authorization", token)
            .header("Content-Type", "application/json")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .json(&payload)
            .send()
            .await?;

        let json: serde_json::Value = resp.json().await?;

        // token 失效时刷新再重试一次
        if !json
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
        {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
            if msg.contains("token") || msg.contains("授权") || msg.contains("Authentication") {
                let token = self.ensure_electricity_token().await?;
                let retry = self
                    .client
                    .post(url)
                    .header("Authorization", token)
                    .header("Content-Type", "application/json")
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", "https://code.hbut.edu.cn/")
                    .json(&payload)
                    .send()
                    .await?;
                let retry_json: serde_json::Value = retry.json().await?;
                return Ok(retry_json);
            }
        }

        Ok(json)
    }

    /// 查询电费账户信息
    pub async fn query_electricity_account(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.ensure_electricity_token().await?;

        let url = "https://code.hbut.edu.cn/server/utilities/account";
        let resp = self
            .client
            .post(url)
            .header("Authorization", token)
            .header("Content-Type", "application/json")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .json(&payload)
            .send()
            .await?;

        let json: serde_json::Value = resp.json().await?;

        // token 失效时刷新再重试一次
        if !json
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
        {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
            if msg.contains("token") || msg.contains("授权") || msg.contains("Authentication") {
                let token = self.ensure_electricity_token().await?;
                let retry = self
                    .client
                    .post(url)
                    .header("Authorization", token)
                    .header("Content-Type", "application/json")
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", "https://code.hbut.edu.cn/")
                    .json(&payload)
                    .send()
                    .await?;
                let retry_json: serde_json::Value = retry.json().await?;
                return Ok(retry_json);
            }
        }

        Ok(json)
    }
}
