//! 校园码子模块。
//!
//! 负责：
//! - 校园码配置（在线/高能模式开关、刷新周期）
//! - 校园码二维码（在线码 / 高能离线码）
//! - 校园码支付状态查询
//! - 统一的校园码 API 请求封装（含令牌失效重试与缓存令牌复用）
//!
//! 错误契约（前端 A2 消费）：
//! - 所有失败统一为 [`CampusCodeError`]，`kind` 固定六类：
//!   `campus_code_auth_required`（401/403 刷新后仍失败，或业务 JSON 明确令牌失效且重试耗尽）、
//!   `campus_code_empty_response`（2xx 但正文为空）、`campus_code_non_json`（2xx 但正文非 JSON）、
//!   `campus_code_upstream_unavailable`（5xx 或上游明确繁忙 429）、
//!   `campus_code_transport`（请求发送失败 / 超时 / 正文读取失败）、
//!   `campus_code_business_rejected`（合法 JSON 且 success=false 的非鉴权业务拒绝）
//! - 重试上限：令牌刷新后最多再请求 1 次（总尝试 [`MAX_CAMPUS_CODE_ATTEMPTS`] = 2），不无限重试、不死循环。
//! - 安全约束：错误消息与日志只含接口名 + HTTP 状态 + 错误类别，
//!   不含 Authorization/token、二维码值、学号、姓名、支付交易信息或完整响应体。

use crate::http_client::HbutClient;
use reqwest::StatusCode;

const CAMPUS_CODE_BASE_URL: &str = "https://code.hbut.edu.cn/server/virtualCard";
const DEFAULT_CAMPUS_CODE_DEV_CODE: &str = "17724566707419069471";

/// 每个校园码接口的总请求尝试上限：首次 1 次 + 令牌刷新后再请求最多 1 次（硬上限，防死循环）。
const MAX_CAMPUS_CODE_ATTEMPTS: usize = 2;

// ── 错误契约的六个固定 kind（前端按此分支，不得更改取值）─────────────────────
const KIND_AUTH_REQUIRED: &str = "campus_code_auth_required";
const KIND_EMPTY_RESPONSE: &str = "campus_code_empty_response";
const KIND_NON_JSON: &str = "campus_code_non_json";
const KIND_UPSTREAM_UNAVAILABLE: &str = "campus_code_upstream_unavailable";
const KIND_TRANSPORT: &str = "campus_code_transport";
const KIND_BUSINESS_REJECTED: &str = "campus_code_business_rejected";

/// 校园码 API 错误。
///
/// `message` 只含接口名 + HTTP 状态 + 错误类别：不回显上游正文、令牌、二维码值，
/// 也不含任何个人/支付字段（#1113 安全约束）。
#[derive(Debug)]
pub(crate) struct CampusCodeError {
    kind: &'static str,
    message: String,
}

impl CampusCodeError {
    /// 传输层失败：请求发送失败（连接/超时）或响应正文读取失败。
    fn transport(endpoint_name: &str, phase: &str) -> Self {
        Self {
            kind: KIND_TRANSPORT,
            message: format!("校园码 {endpoint_name} {phase}"),
        }
    }

    /// 授权失效：401/403 刷新令牌后仍失败，或业务 JSON 明确令牌失效且重试耗尽；
    /// 令牌获取本身失败（无 HTTP 状态）时省略状态段。
    fn auth_required(endpoint_name: &str, status: Option<StatusCode>) -> Self {
        let message = match status {
            Some(s) => format!("校园码 {endpoint_name} 授权失效（HTTP {}）", s.as_u16()),
            None => format!("校园码 {endpoint_name} 授权失效"),
        };
        Self {
            kind: KIND_AUTH_REQUIRED,
            message,
        }
    }

    /// 上游暂不可用：5xx 或上游明确繁忙（429）。
    fn upstream_unavailable(endpoint_name: &str, status: StatusCode) -> Self {
        Self {
            kind: KIND_UPSTREAM_UNAVAILABLE,
            message: format!(
                "校园码 {endpoint_name} 上游暂不可用（HTTP {}）",
                status.as_u16()
            ),
        }
    }

    /// 2xx 但正文为空（旧实现在此提前报 "EOF while parsing a value"，现已区分）。
    fn empty_response(endpoint_name: &str, status: StatusCode) -> Self {
        Self {
            kind: KIND_EMPTY_RESPONSE,
            message: format!(
                "校园码 {endpoint_name} 响应为空（HTTP {}）",
                status.as_u16()
            ),
        }
    }

    /// 2xx 但正文不是 JSON（HTML/文本等）。
    fn non_json(endpoint_name: &str, status: StatusCode) -> Self {
        Self {
            kind: KIND_NON_JSON,
            message: format!(
                "校园码 {endpoint_name} 响应不是 JSON（HTTP {}）",
                status.as_u16()
            ),
        }
    }

    /// 合法 JSON 且 `success=false` 的非鉴权业务拒绝；其它 4xx（400/404/405…）
    /// 表示上游明确拒绝本次请求，同样归入此类。
    fn business_rejected(endpoint_name: &str, status: StatusCode) -> Self {
        Self {
            kind: KIND_BUSINESS_REJECTED,
            message: format!(
                "校园码 {endpoint_name} 上游业务拒绝（HTTP {}）",
                status.as_u16()
            ),
        }
    }

    /// 错误类别（稳定字符串，供前端/路由分支使用）。
    pub(crate) fn kind(&self) -> &'static str {
        self.kind
    }
}

impl std::fmt::Display for CampusCodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CampusCodeError {}

/// Tauri 命令的结构化错误：`invoke` 的 reject 值为 `{ kind, message }`，
/// 与 HTTP 桥的 `error` 对象字段一致，前端 A2 可复用同一套适配逻辑。
#[derive(Debug, serde::Serialize)]
pub(crate) struct CampusCodeCommandError {
    pub(crate) kind: &'static str,
    pub(crate) message: String,
}

impl From<CampusCodeError> for CampusCodeCommandError {
    fn from(err: CampusCodeError) -> Self {
        Self {
            kind: err.kind(),
            message: err.to_string(),
        }
    }
}

/// 单次校园码响应的纯判定结果（不触碰网络，便于单测）。
#[derive(Debug)]
enum CampusCodeVerdict {
    /// 业务成功：原值保留，返回上游 JSON。
    Success(serde_json::Value),
    /// 令牌失效（401/403 或业务 JSON 明确令牌失效）：应刷新令牌后重试（仅首次尝试允许）。
    RefreshToken,
    /// 失败：已分类，直接返回对应错误。
    Fail(CampusCodeError),
}

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

    /// 业务 JSON 是否算成功：`success` 为 true，或缺失该字段（与历史语义兼容）。
    fn campus_code_json_is_success(json: &serde_json::Value) -> bool {
        json.get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
    }

    /// 「HTTP 状态 + 正文」的纯判定（不触碰网络，合成字符串即可单测）。
    ///
    /// 判定顺序（状态优先于正文，空正文不阻塞 401/403）：
    /// 1. 401/403 → 允许重试 ? `RefreshToken` : `auth_required`
    /// 2. 5xx / 429（上游明确繁忙）→ `upstream_unavailable`
    /// 3. 其它 4xx（400/404/405…，上游明确拒绝请求）→ `business_rejected`
    /// 4. 2xx 空正文 → `empty_response`
    /// 5. 2xx 非 JSON → `non_json`
    /// 6. 2xx JSON 且令牌失效 → 允许重试 ? `RefreshToken` : `auth_required`
    /// 7. 2xx JSON 且 success=false（非鉴权）→ `business_rejected`
    /// 8. 2xx JSON 成功 → `Success`（原值保留）
    fn classify_campus_code_response(
        endpoint_name: &str,
        status: StatusCode,
        body: &str,
        allow_retry: bool,
    ) -> CampusCodeVerdict {
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            // 401/403 与正文内容无关：即使正文为空也必须进入刷新/鉴权判定
            return if allow_retry {
                CampusCodeVerdict::RefreshToken
            } else {
                CampusCodeVerdict::Fail(CampusCodeError::auth_required(endpoint_name, Some(status)))
            };
        }

        if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
            return CampusCodeVerdict::Fail(CampusCodeError::upstream_unavailable(
                endpoint_name,
                status,
            ));
        }

        if status.is_client_error() {
            return CampusCodeVerdict::Fail(CampusCodeError::business_rejected(
                endpoint_name,
                status,
            ));
        }

        if body.is_empty() {
            return CampusCodeVerdict::Fail(CampusCodeError::empty_response(endpoint_name, status));
        }

        let json = match serde_json::from_str::<serde_json::Value>(body) {
            Ok(value) => value,
            // 不记录正文预览：HTML/截断 JSON 可能夹带敏感内容
            Err(_) => {
                return CampusCodeVerdict::Fail(CampusCodeError::non_json(endpoint_name, status))
            }
        };

        if Self::campus_code_need_token_retry(status, &json) {
            return if allow_retry {
                CampusCodeVerdict::RefreshToken
            } else {
                CampusCodeVerdict::Fail(CampusCodeError::auth_required(endpoint_name, Some(status)))
            };
        }

        if !Self::campus_code_json_is_success(&json) {
            return CampusCodeVerdict::Fail(CampusCodeError::business_rejected(
                endpoint_name,
                status,
            ));
        }

        CampusCodeVerdict::Success(json)
    }

    /// 获取校园码请求令牌：短期缓存 → `ensure_electricity_token` → 一码通 token 兜底。
    ///
    /// 任一路径失败统一归为 `auth_required`（不带上游错误原文，避免泄露令牌/正文）。
    async fn campus_code_acquire_token(
        &mut self,
        endpoint_name: &str,
        prefer_cached: bool,
    ) -> Result<String, CampusCodeError> {
        if prefer_cached {
            if let Some(cached) = self.get_cached_electricity_token_fast() {
                return Ok(cached);
            }
        }
        if let Ok(token) = self.ensure_electricity_token().await {
            return Ok(token);
        }
        if let Ok(one_code) = self.get_one_code_token().await {
            if let Some(auth) = Self::extract_one_code_token(&one_code) {
                return Ok(auth);
            }
        }
        Err(CampusCodeError::auth_required(endpoint_name, None))
    }

    async fn post_campus_code_api(
        &mut self,
        endpoint: &str,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, CampusCodeError> {
        let endpoint_name = endpoint.trim_start_matches('/').to_lowercase();
        // 校园码页面进入时会连续请求 config + qrcode，优先复用短期缓存令牌，
        // 避免每个接口都重复走一次令牌有效性探测；若令牌失效，再按下方重试逻辑刷新。
        let prefer_cached_token = matches!(
            endpoint_name.as_str(),
            "orderstatus" | "config" | "qrcodeonline" | "qrcodeoffline"
        );

        let mut token = self
            .campus_code_acquire_token(&endpoint_name, prefer_cached_token)
            .await?;

        let url = format!(
            "{}/{}",
            CAMPUS_CODE_BASE_URL,
            endpoint.trim_start_matches('/')
        );

        // 总尝试次数硬上限 2 次：首次 + 令牌刷新后最多再请求 1 次
        for attempt in 0..MAX_CAMPUS_CODE_ATTEMPTS {
            let resp = match self
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
                .await
            {
                Ok(resp) => resp,
                // 传输层错误原文可能含 URL/正文片段，一律不落错误消息
                Err(_) => return Err(CampusCodeError::transport(&endpoint_name, "请求发送失败")),
            };

            let status = resp.status();
            let body = match resp.text().await {
                Ok(body) => body,
                Err(_) => {
                    return Err(CampusCodeError::transport(
                        &endpoint_name,
                        "响应正文读取失败",
                    ))
                }
            };

            match Self::classify_campus_code_response(&endpoint_name, status, &body, attempt == 0) {
                CampusCodeVerdict::Success(json) => return Ok(json),
                CampusCodeVerdict::Fail(err) => return Err(err),
                // 令牌失效：刷新后仅允许再请求 1 次
                CampusCodeVerdict::RefreshToken => {
                    crate::hbut_debug!("[调试] 校园码 {} 令牌失效，刷新后重试", endpoint_name);
                    token = self
                        .ensure_electricity_token()
                        .await
                        .map_err(|_| CampusCodeError::auth_required(&endpoint_name, None))?;
                }
            }
        }

        // 防御性兜底：循环内每条路径都会返回，理论上不可达
        Err(CampusCodeError::auth_required(&endpoint_name, None))
    }

    /// 查询校园码配置（在线/高能模式开关、刷新周期等）。
    pub async fn query_campus_code_config(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, CampusCodeError> {
        let req = serde_json::json!({
            "devCode": Self::campus_code_dev_code_from(&payload)
        });
        self.post_campus_code_api("config", &req).await
    }

    /// 获取校园码二维码：online=在线码，offline=高能模式（离线码）。
    pub async fn query_campus_code_qrcode(
        &mut self,
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, CampusCodeError> {
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
    ) -> Result<serde_json::Value, CampusCodeError> {
        let qrcode = payload
            .get("qrcode")
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let qrcode = match qrcode {
            Some(value) => value,
            // 本地参数缺失：不发出请求，按业务拒绝上报（无 HTTP 状态）
            None => {
                return Err(CampusCodeError {
                    kind: KIND_BUSINESS_REJECTED,
                    message: "校园码 orderstatus 缺少 qrcode 参数".to_string(),
                });
            }
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

    // ────────────────────────────────────────────────────────────
    // 既有：devCode 解析（语义保留）
    // ────────────────────────────────────────────────────────────

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

    // ────────────────────────────────────────────────────────────
    // 既有：令牌失效判定（语义保留）
    // ────────────────────────────────────────────────────────────

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

    // ────────────────────────────────────────────────────────────
    // 新增：纯分类函数（全部合成字符串，不触网）
    // ────────────────────────────────────────────────────────────

    fn expect_fail(verdict: CampusCodeVerdict) -> CampusCodeError {
        match verdict {
            CampusCodeVerdict::Fail(err) => err,
            other => panic!("期望分类失败，实际：{:?}", other),
        }
    }

    fn expect_success(verdict: CampusCodeVerdict) -> serde_json::Value {
        match verdict {
            CampusCodeVerdict::Success(json) => json,
            other => panic!("期望业务成功，实际：{:?}", other),
        }
    }

    #[test]
    fn classify_200_empty_body_is_empty_response() {
        let verdict = HbutClient::classify_campus_code_response("config", StatusCode::OK, "", true);
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_empty_response");
        assert_eq!(err.to_string(), "校园码 config 响应为空（HTTP 200）");
    }

    #[test]
    fn classify_200_html_is_non_json() {
        let html = "<html><body>系统维护中</body></html>";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::OK, html, true);
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_non_json");
    }

    #[test]
    fn classify_200_malformed_json_is_non_json() {
        let broken = "{\"success\": true, \"data\":";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::OK, broken, true);
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_non_json");
    }

    #[test]
    fn classify_500_empty_body_is_upstream_unavailable() {
        let verdict = HbutClient::classify_campus_code_response(
            "config",
            StatusCode::INTERNAL_SERVER_ERROR,
            "",
            true,
        );
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_upstream_unavailable");
        assert!(err.to_string().contains("500"));
    }

    #[test]
    fn classify_429_busy_is_upstream_unavailable() {
        let verdict = HbutClient::classify_campus_code_response(
            "config",
            StatusCode::TOO_MANY_REQUESTS,
            "",
            true,
        );
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_upstream_unavailable");
    }

    #[test]
    fn classify_401_empty_body_refreshes_on_first_attempt() {
        // 空正文不能挡住 401 状态判定
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::UNAUTHORIZED, "", true);
        assert!(matches!(verdict, CampusCodeVerdict::RefreshToken));
    }

    #[test]
    fn classify_403_json_refreshes_on_first_attempt() {
        let body = "{\"success\":false,\"message\":\"forbidden\"}";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::FORBIDDEN, body, true);
        assert!(matches!(verdict, CampusCodeVerdict::RefreshToken));
    }

    #[test]
    fn classify_401_second_attempt_is_auth_required() {
        let verdict = HbutClient::classify_campus_code_response(
            "config",
            StatusCode::UNAUTHORIZED,
            "",
            false,
        );
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_auth_required");
        assert!(err.to_string().contains("401"));
    }

    #[test]
    fn classify_403_second_attempt_is_auth_required() {
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::FORBIDDEN, "", false);
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_auth_required");
        assert!(err.to_string().contains("403"));
    }

    #[test]
    fn classify_400_other_client_error_is_business_rejected() {
        let verdict = HbutClient::classify_campus_code_response(
            "orderstatus",
            StatusCode::BAD_REQUEST,
            "",
            true,
        );
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_business_rejected");
    }

    #[test]
    fn classify_200_success_json_preserves_value() {
        let body = "{\"success\":true,\"data\":{\"mode\":\"online\",\"refreshSeconds\":60}}";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::OK, body, true);
        let json = expect_success(verdict);
        assert_eq!(
            json,
            serde_json::json!({
                "success": true,
                "data": { "mode": "online", "refreshSeconds": 60 }
            })
        );
    }

    #[test]
    fn classify_200_token_invalid_json_refreshes_on_first_attempt() {
        let body = "{\"success\":false,\"message\":\"token 已失效\"}";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::OK, body, true);
        assert!(matches!(verdict, CampusCodeVerdict::RefreshToken));
    }

    #[test]
    fn classify_200_token_invalid_json_is_auth_on_second_attempt() {
        let body = "{\"success\":false,\"msg\":\"Authentication failed\"}";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::OK, body, false);
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_auth_required");
    }

    #[test]
    fn classify_200_other_rejection_is_business_rejected() {
        let body = "{\"success\":false,\"message\":\"余额不足\"}";
        let verdict =
            HbutClient::classify_campus_code_response("orderstatus", StatusCode::OK, body, true);
        let err = expect_fail(verdict);
        assert_eq!(err.kind(), "campus_code_business_rejected");
    }

    #[test]
    fn classify_200_json_without_success_field_kept_as_success() {
        // 缺失 success 字段按历史语义视为成功（原值保留）
        let body = "{\"data\":{\"value\":\"abc\"}}";
        let verdict =
            HbutClient::classify_campus_code_response("config", StatusCode::OK, body, true);
        let json = expect_success(verdict);
        assert_eq!(json, serde_json::json!({ "data": { "value": "abc" } }));
    }

    // ────────────────────────────────────────────────────────────
    // 新增：传输错误 / 重试上限 / 敏感信息约束 / 命令错误映射
    // ────────────────────────────────────────────────────────────

    #[test]
    fn transport_send_failure_is_transport_kind() {
        let err = CampusCodeError::transport("config", "请求发送失败");
        assert_eq!(err.kind(), "campus_code_transport");
        assert_eq!(err.to_string(), "校园码 config 请求发送失败");
    }

    #[test]
    fn transport_body_read_failure_is_transport_kind() {
        // 正文读取失败与发送失败同样归入 transport（不携带上游错误原文）
        let err = CampusCodeError::transport("config", "响应正文读取失败");
        assert_eq!(err.kind(), "campus_code_transport");
        assert_eq!(err.to_string(), "校园码 config 响应正文读取失败");
    }

    #[test]
    fn max_attempts_is_bounded_to_two() {
        // 总尝试上限常量 = 2（首次 + 刷新后 1 次），防止无限重试/死循环
        assert_eq!(MAX_CAMPUS_CODE_ATTEMPTS, 2);
    }

    #[test]
    fn error_strings_contain_no_sensitive_fields() {
        // 各 kind 的 Display/Debug 只含接口名 + HTTP 状态 + 错误类别，
        // 不含 token / qrcode（二维码值）/ Authorization 等敏感字样
        let cases = [
            CampusCodeError::auth_required("config", Some(StatusCode::UNAUTHORIZED)),
            CampusCodeError::auth_required("config", None),
            CampusCodeError::upstream_unavailable("config", StatusCode::INTERNAL_SERVER_ERROR),
            CampusCodeError::empty_response("config", StatusCode::OK),
            CampusCodeError::non_json("orderstatus", StatusCode::OK),
            CampusCodeError::transport("orderstatus", "请求发送失败"),
            CampusCodeError::transport("orderstatus", "响应正文读取失败"),
            CampusCodeError::business_rejected("orderstatus", StatusCode::OK),
        ];
        let sensitive = [
            "token",
            "qrcode",
            "authorization",
            "bearer",
            "学号",
            "姓名",
            "password",
        ];
        for err in &cases {
            let display = err.to_string().to_lowercase();
            let debug = format!("{:?}", err).to_lowercase();
            for word in sensitive {
                assert!(
                    !display.contains(word),
                    "Display 含敏感字样 {word}: {}",
                    err
                );
                assert!(!debug.contains(word), "Debug 含敏感字样 {word}: {debug}");
            }
        }
    }

    #[test]
    fn command_error_from_preserves_kind_and_message() {
        let src = CampusCodeError::empty_response("config", StatusCode::OK);
        let cmd: CampusCodeCommandError = src.into();
        assert_eq!(cmd.kind, "campus_code_empty_response");
        assert_eq!(cmd.message, "校园码 config 响应为空（HTTP 200）");
        // 序列化后前端 invoke 的 reject 值必须是 { kind, message } 结构
        let json = serde_json::to_value(&cmd).expect("命令错误应可序列化");
        assert_eq!(json["kind"], "campus_code_empty_response");
        assert_eq!(json["message"], "校园码 config 响应为空（HTTP 200）");
    }
}
