//! 电费查询子模块。
//!
//! 负责：
//! - 位置层级查询（区域/楼栋/单元）
//! - 账户信息查询
//! - 交易记录查询（消费流水 / 余额明细，含空响应/失效令牌兜底重试）
//! - 交易类型配置查询
//! - 余额查询（占位实现）

use crate::http_client::HbutClient;
use chrono::{Duration as ChronoDuration, Utc};
use reqwest::StatusCode;

/// 一卡通交易流水端点（消费流水：`tradeType` 1/2/3）
const TRADE_LIST_URL: &str = "https://code.hbut.edu.cn/server/user/tradeList";
/// 一卡通余额明细端点（余额域：`tradeType` **11/12/13**，与消费流水不是同一套编码）
const BALANCE_TRADE_LIST_URL: &str = "https://code.hbut.edu.cn/server/user/balanceTradeList";
/// 交易类型字典端点（`{balance:true}` 拿余额域类型表）
const TRADE_LIST_CONFIG_URL: &str = "https://code.hbut.edu.cn/server/user/tradeListConfig";

/// 交易流水请求参数。
///
/// `tradeList` 与 `balanceTradeList` 的**协议完全一致**，只差端点与 `tradeType` 取值域，
/// 故共用 [`HbutClient::post_trade_list`] 的整套令牌恢复逻辑。
struct TradeListQuery<'a> {
    /// 上游端点
    url: &'a str,
    /// `tradeType` 逗号串（消费流水 `1,2,3`；余额明细 `11,12,13`）
    trade_type: &'a str,
    /// 日志里的接口名（不含任何业务数据）
    label: &'a str,
    start_date: &'a str,
    end_date: &'a str,
    page_no: i32,
    page_size: i32,
}

impl HbutClient {
    /// 消费流水（`tradeList`，tradeType 1/2/3）。
    pub async fn fetch_transaction_history(
        &mut self,
        start_date: &str,
        end_date: &str,
        page_no: i32,
        page_size: i32,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        self.post_trade_list(TradeListQuery {
            url: TRADE_LIST_URL,
            trade_type: "1,2,3",
            label: "交易记录",
            start_date,
            end_date,
            page_no,
            page_size,
        })
        .await
    }

    /// 余额明细（`balanceTradeList`，tradeType **11/12/13**）。
    ///
    /// 实测坑（goal-17 `backend-call-spec.md` §2.4）：余额域的类型编码是 11/12/13，
    /// 传消费流水的 1/2/3 会拿到空列表；类型表由 [`Self::query_trade_list_config`] 提供。
    pub async fn fetch_balance_trade_list(
        &mut self,
        start_date: &str,
        end_date: &str,
        page_no: i32,
        page_size: i32,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        self.post_trade_list(TradeListQuery {
            url: BALANCE_TRADE_LIST_URL,
            trade_type: "11,12,13",
            label: "余额明细",
            start_date,
            end_date,
            page_no,
            page_size,
        })
        .await
    }

    /// 取电费令牌；失败时用一码通 token 兜底（避免频繁触发登录）。
    async fn electricity_token_with_fallback(
        &mut self,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        match self.ensure_electricity_token().await {
            Ok(token) => Ok(token),
            Err(e) => {
                println!("[警告] 获取电费令牌失败: {}", e);
                if let Ok(one_code) = self.get_one_code_token().await {
                    if let Some(auth) = Self::extract_one_code_token(&one_code) {
                        return Ok(auth);
                    }
                }
                Err(e)
            }
        }
    }

    /// 交易流水通用请求（消费流水 / 余额明细共用）。
    ///
    /// 三级令牌恢复顺序：`refresh_token` → `getToken` → 一码通 token；
    /// 列表为空时兼容 `pageNo=0` 的接口行为。
    async fn post_trade_list(
        &mut self,
        query: TradeListQuery<'_>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let TradeListQuery {
            url,
            trade_type,
            label,
            start_date,
            end_date,
            page_no,
            page_size,
        } = query;

        let token = self.electricity_token_with_fallback().await?;

        let payload = serde_json::json!({
            "pageSize": page_size,
            "tradeType": trade_type,
            "fromDate": start_date,
            "toDate": end_date,
            "pageNo": page_no
        });

        println!(
            "[调试] 获取{}: {} 到 {}, 第 {} 页",
            label, start_date, end_date, page_no
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
            "[调试] {}响应: 状态={}, 地址={}, 长度={}",
            label,
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
            println!("[警告] {}响应异常，尝试刷新令牌...", label);
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
                    "[调试] {}重试响应: 状态={}, 地址={}, 长度={}",
                    label,
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
            return Err(format!("{}返回空响应", label).into());
        }

        let json: serde_json::Value = match serde_json::from_str(&response_text) {
            Ok(v) => v,
            Err(e) => {
                let preview: String = response_text.chars().take(200).collect();
                return Err(format!("{}响应解析失败: {}, 预览: {}", label, e, preview).into());
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
                "tradeType": trade_type,
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
                crate::hbut_debug!("[调试] 获取{}时令牌无效，尝试刷新...", label);
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

    /// 查询交易类型字典（`{balance:true}` 拿余额域 11/12/13 的类型名）。
    ///
    /// 响应结构未在实测笔记里留样，前端按多别名宽松解析；失败只影响「类型」下拉，
    /// 不影响明细列表本身。
    pub async fn query_trade_list_config(
        &mut self,
        balance: bool,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.electricity_token_with_fallback().await?;
        let payload = serde_json::json!({ "balance": balance });

        let resp = self
            .client
            .post(TRADE_LIST_CONFIG_URL)
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
        let response_text = resp.text().await.unwrap_or_default();
        println!(
            "[调试] 交易类型配置响应: 状态={}, 长度={}",
            status,
            response_text.len()
        );

        if response_text.trim().is_empty() {
            return Err("交易类型配置返回空响应".into());
        }

        let json: serde_json::Value = serde_json::from_str(&response_text)
            .map_err(|e| format!("交易类型配置响应解析失败: {}", e))?;

        // token 失效重试一次
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
                    .post(TRADE_LIST_CONFIG_URL)
                    .header("Authorization", token.clone())
                    .header("token", token)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", "https://code.hbut.edu.cn/")
                    .json(&payload)
                    .send()
                    .await?;
                return Ok(retry.json().await?);
            }
        }

        Ok(json)
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
