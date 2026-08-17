//! 校园码子模块。
//!
//! 负责：
//! - 校园码配置（在线/高能模式开关、刷新周期）
//! - 校园码二维码（在线码 / 高能离线码）
//! - 校园码支付状态查询
//! - 统一的校园码 API 请求封装（含令牌失效重试与缓存令牌复用）

use crate::http_client::HbutClient;
use reqwest::StatusCode;

const CAMPUS_CODE_BASE_URL: &str = "https://code.hbut.edu.cn/server/virtualCard";
const DEFAULT_CAMPUS_CODE_DEV_CODE: &str = "17724566707419069471";

impl HbutClient {
    fn campus_code_dev_code_from(payload: &serde_json::Value) -> String {
        payload
            .get("devCode")
            .or_else(|| payload.get("dev_code"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| DEFAULT_CAMPUS_CODE_DEV_CODE.to_string())
    }

    fn campus_code_need_token_retry(status: StatusCode, json: &serde_json::Value) -> bool {
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return true;
        }

        if json
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
        {
            return false;
        }

        let msg = json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let msg_lower = msg.to_lowercase();
        msg.contains("token")
            || msg.contains("授权")
            || msg_lower.contains("auth")
            || msg_lower.contains("unauthorized")
    }

    async fn post_campus_code_api(
        &mut self,
        endpoint: &str,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let endpoint_name = endpoint.trim_start_matches('/').to_lowercase();
        // 校园码页面进入时会连续请求 config + qrcode，优先复用短期缓存令牌，
        // 避免每个接口都重复走一次令牌有效性探测；若令牌失效，再按下方重试逻辑刷新。
        let prefer_cached_token = matches!(
            endpoint_name.as_str(),
            "orderstatus" | "config" | "qrcodeonline" | "qrcodeoffline"
        );

        let mut token = if prefer_cached_token {
            if let Some(cached) = self.get_cached_electricity_token_fast() {
                cached
            } else {
                match self.ensure_electricity_token().await {
                    Ok(value) => value,
                    Err(err) => {
                        if let Ok(one_code) = self.get_one_code_token().await {
                            if let Some(auth) = Self::extract_one_code_token(&one_code) {
                                auth
                            } else {
                                return Err(err);
                            }
                        } else {
                            return Err(err);
                        }
                    }
                }
            }
        } else {
            match self.ensure_electricity_token().await {
                Ok(value) => value,
                Err(err) => {
                    if let Ok(one_code) = self.get_one_code_token().await {
                        if let Some(auth) = Self::extract_one_code_token(&one_code) {
                            auth
                        } else {
                            return Err(err);
                        }
                    } else {
                        return Err(err);
                    }
                }
            }
        };

        let url = format!(
            "{}/{}",
            CAMPUS_CODE_BASE_URL,
            endpoint.trim_start_matches('/')
        );

        for attempt in 0..2 {
            let resp = self
                .client
                .post(&url)
                .header("Authorization", token.clone())
                .header("token", token.clone())
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("Origin", "https://code.hbut.edu.cn")
                .header("Referer", "https://code.hbut.edu.cn/")
                .json(payload)
                .send()
                .await?;

            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let json: serde_json::Value = match serde_json::from_str(&body) {
                Ok(value) => value,
                Err(e) => {
                    let preview: String = body.chars().take(180).collect();
                    return Err(format!("校园码接口响应解析失败: {} / {}", e, preview).into());
                }
            };

            if attempt == 0 && Self::campus_code_need_token_retry(status, &json) {
                token = self.ensure_electricity_token().await?;
                continue;
            }

            return Ok(json);
        }

        Err("校园码接口重试失败".into())
    }

    /// 查询校园码配置（在线/高能模式开关、刷新周期等）。
    pub async fn query_campus_code_config(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let req = serde_json::json!({
            "devCode": Self::campus_code_dev_code_from(&payload)
        });
        self.post_campus_code_api("config", &req).await
    }

    /// 获取校园码二维码：online=在线码，offline=高能模式（离线码）。
    pub async fn query_campus_code_qrcode(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let mode = payload
            .get("mode")
            .and_then(|v| v.as_str())
            .unwrap_or("online")
            .trim()
            .to_lowercase();
        let is_offline = matches!(
            mode.as_str(),
            "offline" | "high" | "high_performance" | "high_energy"
        );

        if is_offline {
            let req = serde_json::json!({
                "devCode": Self::campus_code_dev_code_from(&payload)
            });
            return self.post_campus_code_api("qrcodeOffline", &req).await;
        }

        let qrcode_type = payload
            .get("qrcodeType")
            .or_else(|| payload.get("qrcode_type"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let req = serde_json::json!({ "qrcodeType": qrcode_type });
        self.post_campus_code_api("qrcodeOnline", &req).await
    }

    /// 查询校园码支付状态。
    pub async fn query_campus_code_order_status(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let qrcode = payload
            .get("qrcode")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let qrcode = match qrcode {
            Some(value) => value,
            None => return Err("缺少 qrcode 参数".into()),
        };
        let offline = payload
            .get("offline")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let req = serde_json::json!({
            "qrcode": qrcode,
            "offline": offline
        });
        self.post_campus_code_api("orderStatus", &req).await
    }
}

#[cfg(test)]
mod campus_code_tests {
    use super::*;

    #[test]
    fn dev_code_from_payload_prefers_dev_code_field() {
        let payload = serde_json::json!({ "devCode": "abc123" });
        assert_eq!(HbutClient::campus_code_dev_code_from(&payload), "abc123");
    }

    #[test]
    fn dev_code_from_payload_falls_back_to_snake_case() {
        let payload = serde_json::json!({ "dev_code": "  snake-9  " });
        assert_eq!(HbutClient::campus_code_dev_code_from(&payload), "snake-9");
    }

    #[test]
    fn dev_code_from_payload_defaults_when_missing() {
        let payload = serde_json::json!({});
        assert_eq!(
            HbutClient::campus_code_dev_code_from(&payload),
            DEFAULT_CAMPUS_CODE_DEV_CODE
        );
    }

    #[test]
    fn need_token_retry_on_unauthorized_status() {
        let json = serde_json::json!({ "success": true });
        assert!(HbutClient::campus_code_need_token_retry(
            StatusCode::UNAUTHORIZED,
            &json
        ));
        assert!(HbutClient::campus_code_need_token_retry(
            StatusCode::FORBIDDEN,
            &json
        ));
    }

    #[test]
    fn need_token_retry_false_on_success_json() {
        let json = serde_json::json!({ "success": true });
        assert!(!HbutClient::campus_code_need_token_retry(
            StatusCode::OK,
            &json
        ));
    }

    #[test]
    fn need_token_retry_on_token_related_message() {
        let json = serde_json::json!({ "success": false, "message": "token 已失效" });
        assert!(HbutClient::campus_code_need_token_retry(
            StatusCode::OK,
            &json
        ));
        let auth_msg = serde_json::json!({ "success": false, "msg": "Authentication failed" });
        assert!(HbutClient::campus_code_need_token_retry(
            StatusCode::OK,
            &auth_msg
        ));
    }

    #[test]
    fn need_token_retry_false_on_unrelated_error() {
        let json = serde_json::json!({ "success": false, "message": "网络繁忙" });
        assert!(!HbutClient::campus_code_need_token_retry(
            StatusCode::OK,
            &json
        ));
    }
}
