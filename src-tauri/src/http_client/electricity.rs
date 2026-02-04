//! 电费/一码通相关模块。
//!
//! 负责：
//! - 获取电费授权 token（SSO + 令牌交换）
//! - 校验/刷新 token
//! - 查询电费位置、账户、交易记录
//! - 提供一码通 token 的独立获取接口
//!
//! 注意：
//! - 多次重登会触发风控，内部有冷却控制
//! - 部分接口会返回空响应，需要兜底重试

use super::*;
use reqwest::{Client, Url, StatusCode};
use reqwest::cookie::CookieStore;
use std::sync::Arc;
use chrono::{Utc, Duration as ChronoDuration};

#[derive(Debug, Clone)]
pub struct ElectricityTokenBundle {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub cookies: String,
}

impl HbutClient {
    /// 获取电费 token（SSO -> tid/ticket -> token 交换）
    pub(super) async fn get_electricity_token(&mut self) -> Result<ElectricityTokenBundle, Box<dyn std::error::Error + Send + Sync>> {
        println!("[调试] 开始电费 SSO 流程...");
        // 0) 先通过融合门户建立会话（对齐 Python fast_auth.py）
        let portal_service = "https://e.hbut.edu.cn/login";
        let code_service = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        let portal_sso_url = format!("{}/login?service={}", AUTH_BASE_URL, urlencoding::encode(portal_service));
        let code_sso_url = format!("{}/login?service={}", AUTH_BASE_URL, urlencoding::encode(code_service));
        let _ = self.client.get(&portal_sso_url).send().await;
        let _ = self.client.get(&code_sso_url).send().await;
        
        // 创建一个不自动重定向的客户端来跟踪 SSO 流程
        let no_redirect_client = Client::builder()
            .cookie_store(true)
            .cookie_provider(Arc::clone(&self.cookie_jar))
            .redirect(reqwest::redirect::Policy::none()) // 禁用自动重定向
            .danger_accept_invalid_certs(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()?;
        
        let mut auth_token = String::new();
        let mut tid = String::new();
        let mut ticket = String::new();
        let mut refresh_token: Option<String> = None;
        let mut expires_in: Option<i64> = None;
        // 1. 触发电费 SSO 流程
        let sso_url = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        println!("[调试] 步骤 1: 开始 SSO {}", sso_url);
        
        const MAX_重定向S: i32 = 15;
        for attempt in 0..2 {
            auth_token.clear();
            tid.clear();
            let mut needs_login = false;

            let mut current_url = sso_url.to_string();
            let mut redirect_count = 0;

            // 手动跟踪重定向
            while redirect_count < MAX_重定向S {
                redirect_count += 1;
                println!("[调试] 重定向 {}: {}", redirect_count, current_url);

                let response = no_redirect_client.get(&current_url)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .send()
                    .await?;

                let status = response.status();

                // 检查响应头中的 Authorization
                if let Some(token_header) = response.headers().get("Authorization") {
                    auth_token = token_header.to_str()?.to_string();
                    println!("[调试] 获取到令牌头: {}...", &auth_token.chars().take(30).collect::<String>());
                }
                if auth_token.is_empty() {
                    if let Some(token_header) = response.headers().get("token") {
                        auth_token = token_header.to_str()?.to_string();
                        println!("[调试] 获取到令牌头: {}...", &auth_token.chars().take(30).collect::<String>());
                    }
                }

                // 提取 tid 从 URL 或 Location
                let url_str = response.url().to_string();
                if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(&url_str) {
                    tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    println!("[调试] 获取到 tid 地址: {}", tid);
                }
                if ticket.is_empty() {
                    if let Some(caps) = regex::Regex::new(r"ticket=([^&]+)")?.captures(&url_str) {
                        ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 获取到 ticket 地址: {}", ticket);
                    }
                }

                // 检查是否需要重定向
                if status.is_redirection() {
                    if let Some(location) = response.headers().get("Location") {
                        let location_str = location.to_str()?;

                        // 从 Location 提取 tid
                        if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(location_str) {
                            tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 获取到 tid 重定向: {}", tid);
                        }
                        if ticket.is_empty() {
                            if let Some(caps) = regex::Regex::new(r"ticket=([^&]+)")?.captures(location_str) {
                                ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                                println!("[调试] 获取到 ticket 重定向: {}", ticket);
                            }
                        }

                        // 处理相对路径
                        current_url = if location_str.starts_with("http") {
                            location_str.to_string()
                        } else if location_str.starts_with("/") {
                            let base: Url = current_url.parse()?;
                            format!("{}://{}{}", base.scheme(), base.host_str().unwrap_or(""), location_str)
                        } else {
                            location_str.to_string()
                        };

                        // 如果到达了最终的 code.hbut.edu.cn 页面并且有 tid，可以停止
                        if !tid.is_empty() && current_url.contains("code.hbut.edu.cn") && !current_url.contains("/server/auth/") {
                            println!("[调试] 已到达最终地址（tid）");
                            break;
                        }
                    } else {
                        break;
                    }
                } else {
                    // 非重定向，尝试从最终页面提取 tid
                    let html = response.text().await.unwrap_or_default();
                    if tid.is_empty() {
                        if let Some(caps) = regex::Regex::new(r#"tid=([^&"']+)"#)?.captures(&html) {
                            tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 获取到 tid HTML: {}", tid);
                        }
                    }
                    if ticket.is_empty() {
                        if let Some(caps) = regex::Regex::new(r#"ticket=([^&"']+)"#)?.captures(&html) {
                            ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 获取到 ticket HTML: {}", ticket);
                        }
                    }
                    if auth_token.is_empty() {
                        if let Some(caps) = regex::Regex::new(r"(C2CDB[0-9A-F]{10,}(?:\.[0-9A-Za-z]+){2,})")?.captures(&html) {
                            auth_token = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 获取到令牌 HTML: {}...", &auth_token.chars().take(30).collect::<String>());
                        }
                    }

                    // 如果停留在认证登录页，说明需要重新登录
                    if current_url.contains("authserver/login")
                        && (html.contains("pwdEncryptSalt") || html.contains("统一身份认证") || html.contains("login"))
                    {
                        needs_login = true;
                    }

                    break;
                }
            }

            if needs_login && attempt == 0 {
                println!("[调试] 电费 SSO 需要登录，重新登录后重试...");
                match self.relogin_for_code_service().await {
                    Ok(true) => {
                        println!("[调试] 重新登录成功，重试 SSO...");
                        continue;
                    },
                    Ok(false) => {
                        println!("[警告] 重登返回 false（无可用凭据）");
                        return Err("无法获取电费授权：未找到登录凭据，请重新登录后再试".into());
                    },
                    Err(e) => {
                        println!("[警告] 重登失败: {}", e);
                        return Err(format!("无法获取电费授权：登录失败 - {}", e).into());
                    }
                }
            }

            break;
        }

        // fallback: use normal client with 重定向s to get tid
        if tid.is_empty() {
            if let Ok(resp) = self.client.get(sso_url).send().await {
                let url_str = resp.url().to_string();
                if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(&url_str) {
                    tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    println!("[调试] 获取到最终 tid 地址: {}", tid);
                }
                if ticket.is_empty() {
                    if let Some(caps) = regex::Regex::new(r"ticket=([^&]+)")?.captures(&url_str) {
                        ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 获取到最终 ticket 地址: {}", ticket);
                    }
                }
                if tid.is_empty() {
                    let html = resp.text().await.unwrap_or_default();
                    if let Some(caps) = regex::Regex::new(r#"tid=([^&"']+)"#)?.captures(&html) {
                        tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 获取到最终 tid HTML: {}", tid);
                    }
                    if ticket.is_empty() {
                        if let Some(caps) = regex::Regex::new(r#"ticket=([^&"']+)"#)?.captures(&html) {
                            ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 获取到最终 ticket HTML: {}", ticket);
                        }
                    }
                    if auth_token.is_empty() {
                        if let Some(caps) = regex::Regex::new(r"(C2CDB[0-9A-F]{10,}(?:\.[0-9A-Za-z]+){2,})")?.captures(&html) {
                            auth_token = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 获取到最终令牌 HTML: {}...", &auth_token.chars().take(30).collect::<String>());
                        }
                    }
                }
            }
        }
        
        // 2. 如果有 tid，尝试多种方式交换 token (与 Python fast_auth.py 一致)
        if auth_token.is_empty() && (!tid.is_empty() || !ticket.is_empty()) {
            println!("[调试] 步骤 2: 使用 tid 换取令牌（多种方式）");
            
            let referer_url = if !tid.is_empty() {
                format!("https://code.hbut.edu.cn/?tid={}&orgId=2", tid)
            } else {
                "https://code.hbut.edu.cn/".to_string()
            };
            
            // 预先创建 URL 字符串，避免临时值借用问题
            let url_get1 = format!("https://code.hbut.edu.cn/server/auth/getToken?tid={}", tid);
            let url_get2 = format!("https://code.hbut.edu.cn/server/auth/getToken?tid={}&orgId=2", tid);
            let url_post = "https://code.hbut.edu.cn/server/auth/getToken".to_string();
            
            // 方法列表：先GET后POST，不同参数组合
            let mut token_urls: Vec<(String, Option<serde_json::Value>)> = Vec::new();
            if !tid.is_empty() {
                token_urls.push((url_get1, None));
                token_urls.push((url_get2, None));
                token_urls.push((url_post.clone(), Some(serde_json::json!({"tid": tid, "orgId": 2}))));
            }
            if !ticket.is_empty() {
                token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?ticket={}", ticket), None));
                token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?ticket={}&org=2", ticket), None));
                token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?ticket={}&orgId=2", ticket), None));
                token_urls.push((url_post.clone(), Some(serde_json::json!({"ticket": ticket, "orgId": 2}))));
            }
            
            for (url_str, post_body) in token_urls {
                let resp_result = if let Some(body) = post_body {
                    println!("[调试] 尝试 POST: {}", url_str);
                    self.client.post(&url_str)
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", &referer_url)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .header("Content-Type", "application/json")
                        .json(&body)
                        .send()
                        .await
                } else {
                    println!("[调试] 尝试 GET: {}", url_str);
                    self.client.get(&url_str)
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", &referer_url)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .send()
                        .await
                };
                
                if let Ok(resp) = resp_result {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        println!("[调试] 令牌交换响应: {:?}", json);
                        
                        if json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                            if let Some(result_data) = json.get("resultData") {
                                auth_token = result_data.get("accessToken")
                                    .or(result_data.get("token"))
                                    .or(result_data.get("access_token"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_default();
                                refresh_token = result_data.get("refreshToken")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                expires_in = result_data.get("accessTokenExpire")
                                    .and_then(|v| v.as_i64());
                                
                                if !auth_token.is_empty() {
                                    println!("[调试] 获取到令牌交换结果: {}...", &auth_token.chars().take(30).collect::<String>());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            // 尝试 getLoginUser 接口 (此路径常在 session 已建立时返回 token)
            if auth_token.is_empty() {
                println!("[调试] 尝试 getLoginUser 相关接口");
                for endpoint in &["getLoginUser", "getUserInfo", "getData"] {
                    let url = format!("https://code.hbut.edu.cn/server/auth/{}", endpoint);
                    if let Ok(resp) = self.client.get(&url)
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", &referer_url)
                        .send()
                        .await 
                    {
                        if let Ok(json) = resp.json::<serde_json::Value>().await {
                            // println!("[调试] {} 响应: {:?}", endpoint, json);
                            if json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                                if let Some(result_data) = json.get("resultData") {
                                    auth_token = result_data.get("accessToken")
                                        .or(result_data.get("token"))
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                        .unwrap_or_default();
                                    
                                    if !auth_token.is_empty() {
                                        println!("[调试] 获取到令牌 {}: {}...", endpoint, &auth_token.chars().take(20).collect::<String>());
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // 3. 获取 code.hbut.edu.cn 的 Cookies
        let code_url: Url = "https://code.hbut.edu.cn".parse()?;
        let cookies = if let Some(c) = self.cookie_jar.cookies(&code_url) {
            c.to_str()?.to_string()
        } else {
            String::new()
        };
        
        // 4. 最后尝试从 Cookie 提取 token
        if auth_token.is_empty() && cookies.contains("Authorization") {
            if let Some(caps) = regex::Regex::new(r"Authorization=([^;]+)")?.captures(&cookies) {
                auth_token = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                println!("[调试] 获取到令牌 Cookie");
            }
        }
        if auth_token.is_empty() {
            if let Some(caps) = regex::Regex::new(r"(C2CDB[0-9A-F]{10,}(?:\.[0-9A-Za-z]+){2,})")?.captures(&cookies) {
                auth_token = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                println!("[调试] 获取到令牌 Cookie 值");
            }
        }
        
        if auth_token.is_empty() {
            println!("[警告] 获取电费令牌失败 via Exchange. TID: '{}', Ticket: '{}'. Cookies present: {}", 
                tid, ticket, cookies.len());
            return Err(format!("无法获取电费 Authorization Token (tid={}, ticket={})", tid, ticket).into());
        }
        
        println!("[调试] 电费令牌获取成功");
        Ok(ElectricityTokenBundle {
            access_token: auth_token,
            refresh_token,
            expires_in,
            cookies,
        })
    }

    /// 使用 refreshToken 刷新电费授权
    async fn refresh_electricity_token(&mut self) -> Result<ElectricityTokenBundle, Box<dyn std::error::Error + Send + Sync>> {
        let refresh_token = match self.electricity_refresh_token.clone() {
            Some(rt) if !rt.trim().is_empty() => rt,
            _ => return Err("缺少 refreshToken，无法刷新电费授权".into()),
        };

        let current_token = self.electricity_token.clone().unwrap_or_default();
        let url = "https://code.hbut.edu.cn/server/auth/updateToken";
        let payloads = vec![
            serde_json::json!({
                "refreshToken": refresh_token,
                "token": current_token,
                "transferType": 0
            }),
            serde_json::json!({
                "refreshToken": refresh_token,
                "accessToken": current_token,
                "transferType": 0
            }),
            serde_json::json!({
                "refreshToken": refresh_token
            }),
        ];

        for body in payloads {
            let resp = self.client.post(url)
                .header("Origin", "https://code.hbut.edu.cn")
                .header("Referer", "https://code.hbut.edu.cn/")
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await?;

            let json: serde_json::Value = match resp.json().await {
                Ok(v) => v,
                Err(_) => continue,
            };

            if json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                let result = json.get("resultData").unwrap_or(&json);
                let access_token = result.get("accessToken")
                    .or(result.get("token"))
                    .or(result.get("access_token"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if access_token.is_empty() {
                    continue;
                }
                let refresh = result.get("refreshToken")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| self.electricity_refresh_token.clone().filter(|s| !s.trim().is_empty()));
                let expires_in = result.get("accessTokenExpire").and_then(|v| v.as_i64());
                let code_url: Url = "https://code.hbut.edu.cn".parse()?;
                let cookies = if let Some(c) = self.cookie_jar.cookies(&code_url) {
                    c.to_str()?.to_string()
                } else {
                    String::new()
                };
                return Ok(ElectricityTokenBundle {
                    access_token,
                    refresh_token: refresh,
                    expires_in,
                    cookies,
                });
            }
        }

        Err("刷新电费授权失败".into())
    }

    /// 确保电费 token 可用（必要时刷新）
    pub async fn ensure_electricity_token(&mut self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        const TOKEN_TTL: std::time::Duration = std::time::Duration::from_secs(600); // 10分钟
        let cached_token = self.electricity_token.clone();
        let now = Utc::now();
        let mut token_expiring = false;

        if let Some(token) = &self.electricity_token {
            let mut within_ttl = false;
            if let Some(exp) = self.electricity_token_expires_at.clone() {
                if exp > now + ChronoDuration::seconds(60) {
                    within_ttl = true;
                } else {
                    token_expiring = true;
                }
            } else if let Some(instant) = self.electricity_token_at {
                if instant.elapsed() < TOKEN_TTL {
                    within_ttl = true;
                }
            }

            if within_ttl {
                // 验证 token 有效性（优先使用官方 App 走的接口）
                println!("[调试] 检查电费令牌有效性...");
                let mut invalid = false;
                let mut uncertain = false;
                let check_endpoints = vec![
                    ("POST", "https://code.hbut.edu.cn/server/user/info"),
                    ("GET", "https://code.hbut.edu.cn/server/auth/getLoginUser"),
                    ("GET", "https://code.hbut.edu.cn/server/auth/getUserInfo"),
                ];

                for (method, check_url) in check_endpoints {
                    let request = if method == "POST" {
                        self.client.post(check_url)
                            .header("Content-Type", "application/json")
                            .body("")
                    } else {
                        self.client.get(check_url)
                    };

                    let check_resp = request
                        .header("Authorization", token)
                        .header("token", token)
                        .header("Accept", "*/*")
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", "https://code.hbut.edu.cn/")
                        .send()
                        .await;

                    if let Ok(resp) = check_resp {
                        let status = resp.status();
                        let text = resp.text().await.unwrap_or_default();
                        let text_lower = text.to_lowercase();
                        let is_ip_freeze = text.contains("IP冻结") || text.contains("ip-freeze");
                        let looks_like_login = text_lower.contains("unauthorized")
                            || text_lower.contains("login")
                            || text.contains("未登录")
                            || text.contains("统一身份认证");

                        if status.is_success() {
                            if is_ip_freeze {
                                println!("[警告] 令牌校验被 IP 冻结阻断, 保留缓存令牌");
                                return Ok(token.clone());
                            }
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                                let success = json.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                                if success || json.get("data").is_some() || json.get("resultData").is_some() {
                                    println!("[调试] 缓存电费令牌有效");
                                    return Ok(token.clone());
                                }
                            } else if !looks_like_login && !text.trim().is_empty() {
                                println!("[调试] 缓存电费令牌有效（非标准响应）");
                                return Ok(token.clone());
                            }
                            println!("[警告] 令牌校验未通过（{}），准备刷新", status);
                            invalid = true;
                            break;
                        } else if is_ip_freeze {
                            println!("[警告] 令牌校验被 IP 冻结阻断, 保留缓存令牌");
                            return Ok(token.clone());
                        } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN || looks_like_login {
                            println!("[警告] 令牌校验失败，状态 {}, 将尝试刷新", status);
                            invalid = true;
                            break;
                        } else if status == StatusCode::NOT_FOUND {
                            uncertain = true;
                            continue;
                        } else if status.is_server_error() {
                            uncertain = true;
                            continue;
                        } else if !text.trim().is_empty() {
                            println!("[警告] 令牌校验异常响应（状态 {}），准备刷新", status);
                            invalid = true;
                            break;
                        } else {
                            uncertain = true;
                            continue;
                        }
                    } else {
                        uncertain = true;
                        continue;
                    }
                }

                if !invalid && uncertain {
                    println!("[警告] 令牌校验结果不确定，保留缓存令牌");
                    return Ok(token.clone());
                }

                if invalid {
                    println!("[调试] 缓存电费令牌无效或过期");
                    self.electricity_token = None;
                    self.electricity_token_at = None;
                    self.electricity_token_expires_at = None;
                    token_expiring = true;
                }
            }
        }

        // 优先使用 refreshToken 刷新（若可用）
        if self.electricity_refresh_token.is_some() {
            println!("[调试] 尝试使用 refreshToken 刷新电费令牌...");
            if let Ok(bundle) = self.refresh_electricity_token().await {
                let refresh = bundle.refresh_token.clone().or(self.electricity_refresh_token.clone());
                let expires_at = bundle.expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
                self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
                return Ok(bundle.access_token);
            }
            if token_expiring {
                println!("[警告] refreshToken 刷新失败，继续走 SSO...");
            }
        }

        println!("[调试] 令牌无效或缺失，尝试 SSO...");

        let token_result = self.get_electricity_token().await;
        let bundle = match token_result {
            Ok(res) => res,
            Err(err) => {
                let err_msg = err.to_string();
                println!("[调试] 电费令牌失败: {}", err_msg);

                if err_msg.contains("tid=") && err_msg.contains("ticket=") {
                    if let Some(fallback) = cached_token.clone() {
                        println!("[警告] 使用缓存电费令牌 after SSO failure");
                        return Ok(fallback);
                    }
                    return Err(format!("无法获取电费授权，请重新登录后再试。{}", err_msg).into());
                }

                if let Some(remaining) = self.relogin_cooldown_remaining() {
                    if let Some(fallback) = cached_token.clone() {
                        println!("[警告] 重登冷却中，使用缓存电费令牌");
                        return Ok(fallback);
                    }
                    return Err(format!(
                        "登录频率过高，请{}秒后再试",
                        remaining.as_secs()
                    ).into());
                }
                println!("[调试] 尝试重新登录并重试...");
                match self.relogin_for_code_service().await {
                    Ok(true) => {
                        self.get_electricity_token().await?
                    },
                    Ok(false) => {
                        if let Some(cached) = &self.electricity_token {
                            println!("[警告] 跳过重登，使用缓存电费令牌");
                            return Ok(cached.clone());
                        }
                        if let Some(fallback) = cached_token.clone() {
                            println!("[警告] 重登被跳过，使用缓存电费令牌");
                            return Ok(fallback);
                        }
                        return Err("无法获取电费授权：未找到登录凭据，请重新登录".into());
                    },
                    Err(e) => {
                        if let Some(cached) = &self.electricity_token {
                            println!("[警告] 重登失败，使用缓存电费令牌: {}", e);
                            return Ok(cached.clone());
                        }
                        if let Some(fallback) = cached_token.clone() {
                            println!("[警告] 重登失败后使用缓存电费令牌");
                            return Ok(fallback);
                        }
                        return Err(format!("无法获取电费授权：登录失败 - {}", e).into());
                    }
                }
            }
        };

        let refresh = bundle.refresh_token.clone().or(self.electricity_refresh_token.clone());
        let expires_at = bundle.expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
        self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
        Ok(bundle.access_token)
    }

    /// 获取一码通 Token（对齐 backend/modules/fast_auth.py 的 get_code_token）
    /// 获取一码通 token（独立流程）
    pub async fn get_one_code_token(&mut self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let sso_url = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        println!("[调试] 一码通: 开始 SSO {}", sso_url);

        // 预热门户与 code SSO
        let portal_service = "https://e.hbut.edu.cn/login";
        let code_service = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        let portal_sso_url = format!("{}/login?service={}", AUTH_BASE_URL, urlencoding::encode(portal_service));
        let code_sso_url = format!("{}/login?service={}", AUTH_BASE_URL, urlencoding::encode(code_service));
        let _ = self.client.get(&portal_sso_url).send().await;
        let _ = self.client.get(&code_sso_url).send().await;

        let mut tid = String::new();
        let mut ticket = String::new();
        let no_redirect_client = Client::builder()
            .cookie_store(true)
            .cookie_provider(Arc::clone(&self.cookie_jar))
            .redirect(reqwest::redirect::Policy::none())
            .danger_accept_invalid_certs(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        for attempt in 0..2 {
            let mut current_url = sso_url.to_string();
            let mut needs_login = false;
            for _ in 0..15 {
                let resp = no_redirect_client.get(&current_url)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .send()
                    .await?;

                let status = resp.status();
                let url_str = resp.url().to_string();
                println!("[调试] 一码通：状态={}, url={}", status, url_str);
                if tid.is_empty() {
                    if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(&url_str) {
                        tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 一码通：tid 地址={}", tid);
                    }
                }
                if ticket.is_empty() {
                    if let Some(caps) = regex::Regex::new(r"ticket=([^&]+)")?.captures(&url_str) {
                        ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 一码通：ticket 地址={}", ticket);
                    }
                }

                if status.is_redirection() {
                    if let Some(location) = resp.headers().get("Location") {
                        let location_str = location.to_str().unwrap_or("");
                        println!("[调试] 一码通：重定向地址={}", location_str);
                        if tid.is_empty() {
                            if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(location_str) {
                                tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                                println!("[调试] 一码通：tid 重定向={}", tid);
                            }
                        }
                        if ticket.is_empty() {
                            if let Some(caps) = regex::Regex::new(r"ticket=([^&]+)")?.captures(location_str) {
                                ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                                println!("[调试] 一码通：ticket 重定向={}", ticket);
                            }
                        }
                        current_url = if location_str.starts_with("http") {
                            location_str.to_string()
                        } else if location_str.starts_with("/") {
                            let base: Url = current_url.parse()?;
                            format!("{}://{}{}", base.scheme(), base.host_str().unwrap_or(""), location_str)
                        } else {
                            location_str.to_string()
                        };
                        continue;
                    }
                }

                let body = resp.text().await.unwrap_or_default();
                if tid.is_empty() {
                    tid = regex::Regex::new(r#"tid=([^&\"']+)"#)?
                        .captures(&body)
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_default();
                    if !tid.is_empty() {
                        println!("[调试] 一码通：tid 内容={}", tid);
                    }
                }
                if ticket.is_empty() {
                    ticket = regex::Regex::new(r#"ticket=([^&\"']+)"#)?
                        .captures(&body)
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_default();
                    if !ticket.is_empty() {
                        println!("[调试] 一码通：ticket 内容={}", ticket);
                    }
                }

                if url_str.contains("authserver/login")
                    || body.contains("统一身份认证")
                    || body.contains("pwdEncryptSalt")
                {
                    needs_login = true;
                    println!("[调试] 一码通：检测到认证登录页");
                }
                break;
            }

            if tid.is_empty() && needs_login && attempt == 0 {
                println!("[调试] 一码通：SSO 需要登录，重新登录后重试...");
                if let Some(remaining) = self.relogin_cooldown_remaining() {
                    println!("[警告] 一码通：重登冷却中（{}s），跳过重登", remaining.as_secs());
                    break;
                }
                match self.relogin_for_code_service().await {
                    Ok(true) => {
                        println!("[调试] 一码通：重登成功，重试 SSO...");
                        continue;
                    }
                    Ok(false) => {
                        println!("[警告] 一码通：重登被跳过（无凭据）");
                        break;
                    }
                    Err(e) => {
                        println!("[警告] 一码通：重登失败: {}", e);
                        break;
                    }
                }
            }
            break;
        }

        if tid.is_empty() && ticket.is_empty() {
            if let Ok(resp) = self.client.get(sso_url).send().await {
                let url_str = resp.url().to_string();
                if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(&url_str) {
                    tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    println!("[调试] 一码通：最终 tid 地址={}", tid);
                }
                if ticket.is_empty() {
                    if let Some(caps) = regex::Regex::new(r"ticket=([^&]+)")?.captures(&url_str) {
                        ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 一码通：最终 ticket 地址={}", ticket);
                    }
                }
                if tid.is_empty() && ticket.is_empty() {
                    let html = resp.text().await.unwrap_or_default();
                    if let Some(caps) = regex::Regex::new(r#"tid=([^&\"']+)"#)?.captures(&html) {
                        tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[调试] 一码通：最终 tid HTML={}", tid);
                    }
                    if ticket.is_empty() {
                        if let Some(caps) = regex::Regex::new(r#"ticket=([^&\"']+)"#)?.captures(&html) {
                            ticket = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[调试] 一码通：最终 ticket HTML={}", ticket);
                        }
                    }
                }
            }
        }

        if tid.is_empty() && ticket.is_empty() {
            println!("[警告] 一码通获取 tid/ticket 失败，尝试使用缓存/刷新令牌回退...");
            if let Some(token) = self.electricity_token.clone() {
                return Ok(serde_json::json!({
                    "success": true,
                    "tid": "",
                    "resultData": { "accessToken": token }
                }));
            }
            if self.electricity_refresh_token.is_some() {
                if let Ok(bundle) = self.refresh_electricity_token().await {
                    let refresh = bundle.refresh_token.clone().or(self.electricity_refresh_token.clone());
                    let expires_at = bundle.expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
                    self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
                    return Ok(serde_json::json!({
                        "success": true,
                        "tid": "",
                        "resultData": { "accessToken": bundle.access_token }
                    }));
                }
            }
            return Err("一码通获取 tid 失败".into());
        }

        let referer = if !tid.is_empty() {
            format!("https://code.hbut.edu.cn/?tid={}&orgId=2", tid)
        } else {
            "https://code.hbut.edu.cn/".to_string()
        };
        let token_url = "https://code.hbut.edu.cn/server/auth/getToken";

        let mut token_urls: Vec<(String, Option<serde_json::Value>)> = Vec::new();
        if !tid.is_empty() {
            token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?tid={}", tid), None));
            token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?tid={}&orgId=2", tid), None));
            token_urls.push((token_url.to_string(), Some(serde_json::json!({"tid": tid, "orgId": 2}))));
        }
        if !ticket.is_empty() {
            token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?ticket={}", ticket), None));
            token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?ticket={}&org=2", ticket), None));
            token_urls.push((format!("https://code.hbut.edu.cn/server/auth/getToken?ticket={}&orgId=2", ticket), None));
            token_urls.push((token_url.to_string(), Some(serde_json::json!({"ticket": ticket, "orgId": 2}))));
        }

        for (url, body) in token_urls {
            let resp = if let Some(payload) = body {
                self.client.post(&url)
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", &referer)
                    .header("X-Requested-With", "XMLHttpRequest")
                    .header("Content-Type", "application/json")
                    .json(&payload)
                    .send()
                    .await?
            } else {
                self.client.get(&url)
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", &referer)
                    .header("X-Requested-With", "XMLHttpRequest")
                    .send()
                    .await?
            };

            let json = resp.json::<serde_json::Value>().await?;
            let success = json.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            if success {
                let result_data = json.get("resultData").cloned().unwrap_or_else(|| serde_json::json!({}));
                let access = result_data.get("accessToken")
                    .or(result_data.get("token"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                if !access.is_empty() {
                    let refresh = result_data.get("refreshToken").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let expires_in = result_data.get("accessTokenExpire").and_then(|v| v.as_i64());
                    let expires_at = expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
                    self.set_electricity_session(access.clone(), refresh.clone(), expires_at);
                }
                return Ok(serde_json::json!({
                    "success": true,
                    "tid": tid,
                    "resultData": result_data
                }));
            }
        }

        Err("一码通 getToken 失败".into())
    }

    /// 获取交易记录（带空响应/失效重试）
    pub async fn fetch_transaction_history(
        &mut self,
        start_date: &str,
        end_date: &str,
        page_no: i32,
        page_size: i32
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
        
        println!("[调试] 获取交易记录: {} 到 {}, 第 {} 页", start_date, end_date, page_no);
        
        let resp = self.client.post(url)
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
                    let refresh = bundle.refresh_token.clone().or(self.electricity_refresh_token.clone());
                    let expires_at = bundle.expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
                    self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
                    let retry_token = bundle.access_token;
                    let retry = self.client.post(url)
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
                let refresh = bundle.refresh_token.clone().or(self.electricity_refresh_token.clone());
                let expires_at = bundle.expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
                self.set_electricity_session(bundle.access_token.clone(), refresh, expires_at);
                let token = bundle.access_token;
                let retry = self.client.post(url)
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
                    let retry = self.client.post(url)
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
        let list_len = json.get("resultData")
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
            if let Ok(retry_resp) = self.client.post(url)
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
        if !json.get("success").and_then(|v| v.as_bool()).unwrap_or(true) {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
            if msg.contains("token") || msg.contains("授权") || msg.contains("Authentication") {
                println!("[调试] 获取交易记录时令牌无效，尝试刷新...");
                let token = self.ensure_electricity_token().await?;
                let retry = self.client.post(url)
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

    /// 从一码通返回体里提取 token 字段
    fn extract_one_code_token(one_code: &serde_json::Value) -> Option<String> {
        let data = one_code.get("resultData").unwrap_or(one_code);
        data.get("accessToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                data.get("token")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
    }

    #[allow(dead_code)]
    /// 使用缓存凭据执行重登（内部使用）
    async fn relogin_with_cached_credentials(&mut self) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let username = match &self.last_username {
            Some(v) => v.clone(),
            None => return Ok(false),
        };
        let password = match &self.last_password {
            Some(v) => v.clone(),
            None => return Ok(false),
        };

        let _ = self.login(&username, &password, "", "", "").await?;
        Ok(true)
    }

    /// 仅针对 code.hbut.edu.cn 的重登流程
    async fn relogin_for_code_service(&mut self) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let username = self.last_username.clone().unwrap_or_default();
        let password = self.last_password.clone().unwrap_or_default();

        println!("[调试] code 服务重登： 缓存用户名存在: {}, 缓存密码存在: {}", 
            !username.is_empty(), !password.is_empty());
        
        if username.is_empty() || password.is_empty() {
            println!("[警告] code 服务重登： 无缓存凭据");
            return Ok(false);
        }

        if let Some(remaining) = self.relogin_cooldown_remaining() {
            println!(
                "[警告] code 服务重登： 冷却中，跳过重登 {}s",
                remaining.as_secs()
            );
            return Ok(false);
        }

        self.last_relogin_attempt = Some(std::time::Instant::now());
        let code_service = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        let code_sso_url = format!("{}/login?service={}", AUTH_BASE_URL, urlencoding::encode(code_service));
        
        println!("[调试] code 服务重登： 检查 CAS 会话是否仍有效...");
        let check_resp = self.client.get(&code_sso_url).send().await?;
        let check_url = check_resp.url().to_string();
        let needs_login = check_url.contains("authserver/login") && !check_url.contains("ticket=");

        if needs_login {
            println!("[调试] code 服务重登： code 服务 CAS 会话已过期，需要重新登录...");
            if let Err(err) = self.login_for_service(&username, &password, code_service).await {
                self.last_relogin_failed_at = Some(std::time::Instant::now());
                println!("[警告] code 服务重登： code 服务登录失败: {}", err);
                return Err(err);
            }
        } else {
            println!("[调试] code 服务重登： code 服务 CAS 会话仍有效，跳过登录");
        }

        println!("[调试] code 服务重登： 建立 code.hbut.edu.cn 会话...");
        let _ = self.client.get(code_service).send().await;
        
        println!("[调试] relogin_for_code_service 完成。Cookies: {}", self.get_cookies());
        Ok(true)
    }

    /// 电费余额接口（目前为占位实现）
    pub async fn fetch_electricity_balance(&mut self, _room_id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let bundle = self.get_electricity_token().await?;
        let refresh = bundle.refresh_token.clone().or(self.electricity_refresh_token.clone());
        let expires_at = bundle.expires_in.map(|s| Utc::now() + ChronoDuration::seconds(s));
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
    pub async fn query_electricity_location(&mut self, payload: serde_json::Value) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.ensure_electricity_token().await?;
        
        let url = "https://code.hbut.edu.cn/server/utilities/location";
        let resp = self.client.post(url)
            .header("Authorization", token)
            .header("Content-Type", "application/json")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .json(&payload)
            .send()
            .await?;
            
        let json: serde_json::Value = resp.json().await?;

        // token 失效时刷新再重试一次
        if !json.get("success").and_then(|v| v.as_bool()).unwrap_or(true) {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
            if msg.contains("token") || msg.contains("授权") || msg.contains("Authentication") {
                let token = self.ensure_electricity_token().await?;
                let retry = self.client.post(url)
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
    pub async fn query_electricity_account(&mut self, payload: serde_json::Value) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let token = self.ensure_electricity_token().await?;
        
        let url = "https://code.hbut.edu.cn/server/utilities/account";
        let resp = self.client.post(url)
            .header("Authorization", token)
            .header("Content-Type", "application/json")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .json(&payload)
            .send()
            .await?;
            
        let json: serde_json::Value = resp.json().await?;

        // token 失效时刷新再重试一次
        if !json.get("success").and_then(|v| v.as_bool()).unwrap_or(true) {
            let msg = json.get("message").and_then(|v| v.as_str()).unwrap_or("");
            if msg.contains("token") || msg.contains("授权") || msg.contains("Authentication") {
                let token = self.ensure_electricity_token().await?;
                let retry = self.client.post(url)
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








