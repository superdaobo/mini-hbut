//! AI 辅助接口模块。
//!
//! 负责：
//! - 初始化 AI 会话
//! - 上传文件/对话内容
//! - 转发到后端 AI 服务并返回结果
//!
//! 注意：
//! - 依赖外部 AI 服务，需处理超时与失败重试
//! - 返回体可能较大，注意内存占用

use super::*;
use reqwest::{Client, Url};
use crate::db;
impl HbutClient {
    pub async fn init_ai_session(&mut self) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
        const REDIRECT_URLS_ENCODED: &[&str] = &[
            "https%3A%2F%2Fhub.17wanxiao.com%2Fbsacs%2Fdklight.action%3Fstate%3Dbjdk_hbgy_dk_echar",
        ];

        fn find_entry_url_in_text(text: &str) -> Option<String> {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(text) {
                if let Some(arr) = json.as_array() {
                    for item in arr.iter().rev() {
                        if let Some(url) = item.get("url").and_then(|v| v.as_str()) {
                            if url.contains("virtualhuman2h5.59wanmei.com/digitalPeople3/index.html") {
                                return Some(url.to_string());
                            }
                        }
                    }
                }
            } else {
                let mut iter = serde_json::Deserializer::from_str(text).into_iter::<serde_json::Value>();
                if let Some(Ok(json)) = iter.next() {
                    if let Some(arr) = json.as_array() {
                        for item in arr.iter().rev() {
                            if let Some(url) = item.get("url").and_then(|v| v.as_str()) {
                                if url.contains("virtualhuman2h5.59wanmei.com/digitalPeople3/index.html") {
                                    return Some(url.to_string());
                                }
                            }
                        }
                    }
                }
            }

            if let Ok(re) = regex::Regex::new(
                r#"https://virtualhuman2h5\.59wanmei\.com/digitalPeople3/index\.html[^\s"']+"#,
            ) {
                let mut last_match: Option<String> = None;
                for cap in re.captures_iter(text) {
                    if let Some(m) = cap.get(0) {
                        last_match = Some(m.as_str().to_string());
                    }
                }
                if let Some(found) = last_match {
                    return Some(found);
                }
            }
            None
        }

        fn load_entry_url_template() -> Option<String> {
            let mut dir = std::env::current_dir().ok()?;
            for _ in 0..=6 {
                let candidate = dir.join("captured_requests.json");
                if candidate.exists() {
                    if let Ok(text) = std::fs::read_to_string(candidate) {
                        if let Some(url) = find_entry_url_in_text(&text) {
                            return Some(url);
                        }
                    }
                }
                let remote_cfg = dir.join("remote_config.json");
                if remote_cfg.exists() {
                    if let Ok(text) = std::fs::read_to_string(remote_cfg) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(url) = json.get("ai_entry_url_template").and_then(|v| v.as_str()) {
                                if !url.trim().is_empty() {
                                    return Some(url.to_string());
                                }
                            }
                        }
                    }
                }
                if !dir.pop() {
                    break;
                }
            }
            None
        }

        fn default_entry_url_template() -> Option<String> {
            Some("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?NCPNavBarAlpha=0&customerServiceConfId=122&response_type=code&identityTypeCode=null&flag=bjdk_hbgy_dk_echar&hidden=true&isBindEcard=true&customerCode=2002135&force_login=false&client_id=c20653ee0dd54a8faca19fb127680714&token=".to_string())
        }

        fn load_cached_entry_url() -> Option<String> {
            if let Some(dir) = HbutClient::app_data_dir() {
                let candidate = dir.join("ai_entry_url_cache.json");
                if candidate.exists() {
                    if let Ok(text) = std::fs::read_to_string(candidate) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(url) = json.get("entry_url").and_then(|v| v.as_str()) {
                                if !url.trim().is_empty() {
                                    return Some(url.to_string());
                                }
                            }
                        } else if !text.trim().is_empty() {
                            return Some(text.trim().to_string());
                        }
                    }
                }
            }
            let mut dir = std::env::current_dir().ok()?;
            for _ in 0..=6 {
                let candidate = dir.join("ai_entry_url_cache.json");
                if candidate.exists() {
                    if let Ok(text) = std::fs::read_to_string(candidate) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(url) = json.get("entry_url").and_then(|v| v.as_str()) {
                                if !url.trim().is_empty() {
                                    return Some(url.to_string());
                                }
                            }
                        } else if !text.trim().is_empty() {
                            return Some(text.trim().to_string());
                        }
                    }
                }
                if !dir.pop() {
                    break;
                }
            }
            None
        }

        fn save_cached_entry_url(entry_url: &str) {
            if entry_url.trim().is_empty() {
                return;
            }
            if let Some(dir) = HbutClient::app_data_dir() {
                let path = dir.join("ai_entry_url_cache.json");
                let payload = serde_json::json!({ "entry_url": entry_url });
                let _ = std::fs::write(path, payload.to_string());
                return;
            }
            if let Ok(dir) = std::env::current_dir() {
                let path = dir.join("ai_entry_url_cache.json");
                let payload = serde_json::json!({ "entry_url": entry_url });
                let _ = std::fs::write(path, payload.to_string());
            }
        }

        fn replace_token_in_entry_url(entry_url: &str, token: &str) -> Option<String> {
            let mut url: Url = entry_url.parse().ok()?;
            let mut pairs: Vec<(String, String)> = url.query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();
            let mut replaced = false;
            for (k, v) in pairs.iter_mut() {
                if k == "token" {
                    *v = token.to_string();
                    replaced = true;
                }
            }
            if !replaced {
                pairs.push(("token".to_string(), token.to_string()));
            }
            url.set_query(None);
            url.query_pairs_mut().extend_pairs(pairs);
            Some(url.to_string())
        }

        fn encode_redirect_url_without_token(entry_url: &str) -> Option<String> {
            let mut url: Url = entry_url.parse().ok()?;
            let pairs: Vec<(String, String)> = url.query_pairs()
                .filter(|(k, _)| k != "token")
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            url.set_query(None);
            if !pairs.is_empty() {
                url.query_pairs_mut().extend_pairs(pairs);
            }
            Some(urlencoding::encode(url.as_str()).to_string())
        }

        fn extract_token_from_url(url: &str) -> Option<String> {
            regex::Regex::new(r"token=([^&]+)").ok()?
                .captures(url)
                .and_then(|cap| cap.get(1))
                .map(|m| m.as_str().to_string())
        }

        fn is_hub_dklight(url: &str) -> bool {
            url.contains("hub.17wanxiao.com/bsacs/dklight.action")
        }

        async fn get_entry_url_via_hub(client: &Client, access_token: &str) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
            if access_token.trim().is_empty() {
                return Ok(None);
            }
            let redirect_encoded = "https%3A%2F%2Fhub.17wanxiao.com%2Fbsacs%2Fdklight.action%3Fstate%3Dbjdk_hbgy_dk_echar";
            let open_url = format!(
                "https://code.hbut.edu.cn/server/third/open?redirectUrl={}&accessToken={}",
                redirect_encoded,
                access_token
            );
            let open_resp = client.get(&open_url).send().await?;
            let mut hub_url = open_resp.headers().get("Location")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            if hub_url.is_empty() && open_resp.url().as_str().contains("hub.17wanxiao.com/bsacs/dklight.action") {
                hub_url = open_resp.url().as_str().to_string();
            }
            if hub_url.is_empty() || !is_hub_dklight(&hub_url) {
                return Ok(None);
            }
            let _ = client.get(&hub_url)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .send()
                .await;
            let token = extract_token_from_url(&hub_url).unwrap_or_default();
            if token.is_empty() {
                return Ok(None);
            }
            let payload = serde_json::json!({
                "flag": "bjdk_hbgy_dk_echar",
                "state": "bjdk_hbgy_dk_echar",
                "token": token
            });
            let redirect_resp = client.post("https://hub.17wanxiao.com/bsacs/redirect.action")
                .header("Origin", "https://hub.17wanxiao.com")
                .header("Referer", "https://hub.17wanxiao.com/bsacs/dklight.action")
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                .form(&[("userData", payload.to_string())])
                .send()
                .await?;
            let redirect_text = redirect_resp.text().await.unwrap_or_default();
            if redirect_text.contains("token已失效") || redirect_text.contains("Access timeout") {
                return Ok(None);
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redirect_text) {
                if let Some(url) = json.get("url").and_then(|v| v.as_str()) {
                    if url.contains("virtualhuman2h5.59wanmei.com/digitalPeople3/index.html") {
                        return Ok(Some(url.to_string()));
                    }
                }
                if let Some(token) = json.get("token").and_then(|v| v.as_str()) {
                    return Ok(Some(format!(
                        "https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}",
                        token
                    )));
                }
            }
            Ok(None)
        }

        async fn fetch_blade_auth(client: &Client, entry_url: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
            let url = "https://virtualhuman2h5.59wanmei.com/apis/blade-auth/oauth/token";
            let referer_url: Url = entry_url.parse()?;
            let mut params: Vec<(String, String)> = referer_url
                .query_pairs()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            params.push(("grant_type".to_string(), "wmxy".to_string()));
            params.push(("scope".to_string(), "all".to_string()));

            let _ = client.get(entry_url)
                .header("Origin", "https://virtualhuman2h5.59wanmei.com")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .send()
                .await;

            let resp = client.post(url)
                .header("Origin", "https://virtualhuman2h5.59wanmei.com")
                .header("Referer", entry_url)
                .header("Accept", "application/json, text/plain, */*")
                .header("authorization", "Basic d214eTp3bXh5X3NlY3JldA==")
                .header("tenant-id", "000000")
                .header("role-id", "1664528453134516226")
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                .form(&params)
                .send()
                .await?;

            let text = resp.text().await.unwrap_or_default();
            let json: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            let access_token = json.get("access_token")
                .or_else(|| json.get("accessToken"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if access_token.is_empty() {
                println!("[调试] fetch_blade_auth 返回空响应: {}", text);
                return Ok(String::new());
            }

            let token_type = json.get("token_type")
                .or_else(|| json.get("tokenType"))
                .and_then(|v| v.as_str())
                .unwrap_or("bearer");

            Ok(format!("{} {}", token_type, access_token))
        }

        async fn follow_redirect_for_entry(client: &Client, start_url: &str) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
            let mut current_url = start_url.to_string();
            for _ in 0..10 {
                let resp = client.get(&current_url)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .send()
                    .await?;

                if let Some(_token) = extract_token_from_url(resp.url().as_str()) {
                    let url_str = resp.url().as_str().to_string();
                    if !is_hub_dklight(&url_str) {
                        return Ok(Some(url_str));
                    }
                    println!("[调试] follow_redirect_for_entry：检测到 hub 令牌，继续 redirect.action");
                }

                if resp.status().is_redirection() {
                    if let Some(location) = resp.headers().get("Location") {
                        let location_str = location.to_str().unwrap_or("");
                        current_url = if location_str.starts_with("http") {
                            location_str.to_string()
                        } else if location_str.starts_with("/") {
                            let base: Url = current_url.parse()?;
                            format!("{}://{}{}", base.scheme(), base.host_str().unwrap_or(""), location_str)
                        } else {
                            location_str.to_string()
                        };
                        if current_url.contains("virtualhuman2h5.59wanmei.com/digitalPeople3/index.html") {
                            return Ok(Some(current_url));
                        }
                        if extract_token_from_url(&current_url).is_some() && !is_hub_dklight(&current_url) {
                            return Ok(Some(current_url));
                        }
                        continue;
                    }
                }

                let body = resp.text().await.unwrap_or_default();
                if body.contains("/bsacs/redirect.action") {
                    let token = regex::Regex::new(r#""token"\s*:\s*"([^"]+)""#)
                        .ok()
                        .and_then(|re| re.captures(&body))
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_default();
                    let flag = regex::Regex::new(r#""flag"\s*:\s*"([^"]+)""#)
                        .ok()
                        .and_then(|re| re.captures(&body))
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_else(|| "bjdk_hbgy_dk_echar".to_string());
                    let state = regex::Regex::new(r#""state"\s*:\s*"([^"]+)""#)
                        .ok()
                        .and_then(|re| re.captures(&body))
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_else(|| flag.clone());
                    if !token.is_empty() {
                        let payload = serde_json::json!({
                            "flag": flag,
                            "state": state,
                            "token": token
                        });
                        let redirect_resp = client.post("https://hub.17wanxiao.com/bsacs/redirect.action")
                            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                            .header("X-Requested-With", "XMLHttpRequest")
                            .header("Accept", "application/json, text/javascript, */*; q=0.01")
                            .form(&[("userData", payload.to_string())])
                            .send()
                            .await?;
                        let redirect_text = redirect_resp.text().await.unwrap_or_default();
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&redirect_text) {
                            if let Some(url) = json.get("url").and_then(|v| v.as_str()) {
                                if url.contains("virtualhuman2h5.59wanmei.com/digitalPeople3/index.html") {
                                    return Ok(Some(url.to_string()));
                                }
                            }
                            if let Some(token) = json.get("token").and_then(|v| v.as_str()) {
                                return Ok(Some(format!(
                                    "https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}",
                                    token
                                )));
                            }
                        }
                    }
                }
                if body.contains("virtualhuman2h5.59wanmei.com/digitalPeople3/index.html") {
                    if let Ok(re) = regex::Regex::new(r#"(https?://[^"'\s]+virtualhuman2h5\.59wanmei\.com/digitalPeople3/index\.html[^"'\s]*)"#) {
                        if let Some(cap) = re.captures(&body) {
                            if let Some(m) = cap.get(1) {
                                return Ok(Some(m.as_str().to_string()));
                            }
                        }
                    }
                }
                if let Some(token) = extract_token_from_url(&body) {
                    return Ok(Some(format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", token)));
                }
                break;
            }
            Ok(None)
        }

        // 0) 尝试从本地会话恢复 one_code_token（避免当次登录未能获取令牌）
        if self.electricity_token.is_none() {
            if let Some(dir) = HbutClient::app_data_dir() {
                let path = dir.join("grades.db");
                if let Ok(Some((_sid, _cookies, _password, token))) = db::get_latest_user_session(&path) {
                    if !token.trim().is_empty() {
                        self.set_electricity_token(token);
                    }
                }
            }
        }

        // 1) 先尝试使用本地抓包入口模板
        let jump_url = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        println!("[调试] 初始化AI会话：请求 {}", jump_url);

        let direct_client = Client::builder()
            .cookie_store(true)
            .cookie_provider(Arc::clone(&self.cookie_jar))
            .redirect(reqwest::redirect::Policy::none())
            .danger_accept_invalid_certs(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        let template_entry_url = load_entry_url_template()
            .or_else(load_cached_entry_url)
            .or_else(default_entry_url_template);
        if let Some(template) = &template_entry_url {
            let blade_auth = fetch_blade_auth(&self.client, template).await.unwrap_or_default();
            if !blade_auth.is_empty() {
                if let Some(token) = extract_token_from_url(template) {
                    println!("[调试] 初始化AI会话：使用模板 entry_url 令牌");
                    save_cached_entry_url(template);
                    return Ok((token, blade_auth));
                }
            }
        }

        if let Some(cached_token) = self.electricity_token.clone() {
            if !cached_token.trim().is_empty() {
                let access_entry_url = if let Some(template) = &template_entry_url {
                    replace_token_in_entry_url(template, &cached_token)
                        .unwrap_or_else(|| format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", cached_token))
                } else {
                    format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", cached_token)
                };
                let blade_auth = fetch_blade_auth(&self.client, &access_entry_url).await.unwrap_or_default();
                if !blade_auth.is_empty() {
                    println!("[调试] 初始化AI会话：使用缓存 one_code_令牌 获取 blade-auth");
                    save_cached_entry_url(&access_entry_url);
                    return Ok((cached_token, blade_auth));
                }
                println!("[调试] 初始化AI会话：缓存 one_code_令牌 获取 blade-auth 失败");
            }
        }

        // 1) 先尝试直接跳转
        if let Some(entry_url) = follow_redirect_for_entry(&direct_client, jump_url).await? {
            if let Some(token) = extract_token_from_url(&entry_url) {
                println!("[调试] 初始化AI会话：从直接跳转获取令牌: {}", token);
                let mut candidates = vec![entry_url.clone()];
                if let Some(template) = &template_entry_url {
                    if let Some(merged_url) = replace_token_in_entry_url(template, &token) {
                        candidates.insert(0, merged_url);
                    }
                }
                for candidate in candidates {
                    let blade_auth = fetch_blade_auth(&self.client, &candidate).await.unwrap_or_default();
                    if !blade_auth.is_empty() {
                        save_cached_entry_url(&candidate);
                        return Ok((token, blade_auth));
                    }
                }
            }
        }

        // 2) 通过已有电费/一码通 token 走 third/open
        let cached_auth = self.electricity_token.clone().unwrap_or_default();
        let mut access_token = String::new();

        // 优先用已缓存 Authorization 获取 accessToken，避免触发重新登录
        if !cached_auth.is_empty() {
            if let Ok(resp) = self.client
                .get("https://code.hbut.edu.cn/server/auth/getLoginUser")
                .header("Authorization", &cached_auth)
                .header("Origin", "https://code.hbut.edu.cn")
                .header("Referer", "https://code.hbut.edu.cn/")
                .send()
                .await
            {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    access_token = json.get("resultData")
                        .and_then(|v| v.get("accessToken"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }

        if access_token.is_empty() {
            if let Ok(resp) = self.client.get("https://code.hbut.edu.cn/server/auth/getLoginUser").send().await {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    access_token = json.get("resultData")
                        .and_then(|v| v.get("accessToken"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }

        // 备用：尝试 One Code getToken（尽量不触发频繁登录）
        if access_token.is_empty() {
            if let Ok(one_code) = self.get_one_code_token().await {
                access_token = one_code.get("resultData")
                    .and_then(|v| v.get("accessToken"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
            }
        }

        if access_token.is_empty() {
            access_token = match self.ensure_electricity_token().await {
                Ok(t) => t,
                Err(_) => String::new(),
            };
        }

        if access_token.is_empty() {
            return Err("获取 AI 会话 accessToken 失败".into());
        }

        if let Some(entry_url) = get_entry_url_via_hub(&direct_client, &access_token).await? {
            if let Some(token) = extract_token_from_url(&entry_url) {
                println!("[调试] 初始化AI会话：从 hub 重定向获取令牌: {}", token);
                let mut candidates = vec![entry_url.clone()];
                if let Some(template) = &template_entry_url {
                    if let Some(merged_url) = replace_token_in_entry_url(template, &token) {
                        candidates.insert(0, merged_url);
                    }
                }
                for candidate in candidates {
                    let blade_auth = fetch_blade_auth(&self.client, &candidate).await.unwrap_or_default();
                    if !blade_auth.is_empty() {
                        save_cached_entry_url(&candidate);
                        return Ok((token, blade_auth));
                    }
                }
            }
        }

        let mut redirect_candidates: Vec<String> = REDIRECT_URLS_ENCODED.iter().map(|s| s.to_string()).collect();
        if let Some(template) = &template_entry_url {
            if let Some(encoded) = encode_redirect_url_without_token(template) {
                redirect_candidates.push(encoded);
            }
        }

        for redirect_encoded in redirect_candidates.iter() {
            let open_url = format!(
                "https://code.hbut.edu.cn/server/third/open?redirectUrl={}&accessToken={}",
                redirect_encoded,
                access_token
            );
            if let Some(entry_url) = follow_redirect_for_entry(&direct_client, &open_url).await? {
                if let Some(token) = extract_token_from_url(&entry_url) {
                    println!("[调试] 初始化AI会话：从 third/open 获取令牌: {}", token);
                    let mut candidates = vec![entry_url.clone()];
                    if let Some(template) = &template_entry_url {
                        if let Some(merged_url) = replace_token_in_entry_url(template, &token) {
                            candidates.insert(0, merged_url);
                        }
                    }
                    for candidate in candidates {
                        let blade_auth = fetch_blade_auth(&self.client, &candidate).await.unwrap_or_default();
                        if !blade_auth.is_empty() {
                            save_cached_entry_url(&candidate);
                            return Ok((token, blade_auth));
                        }
                    }
                }
            }
        }

        // 备用：若 third/open 无 token，尝试直接用 access_token 申请 blade-auth
        let access_entry_url = if let Some(template) = &template_entry_url {
            replace_token_in_entry_url(template, &access_token).unwrap_or_else(|| format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", access_token))
        } else {
            format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", access_token)
        };
        let blade_auth_direct = fetch_blade_auth(&self.client, &access_entry_url).await.unwrap_or_default();
        if !blade_auth_direct.is_empty() {
            println!("[调试] 初始化AI会话：直接使用 access令牌 获取 blade-auth");
            save_cached_entry_url(&access_entry_url);
            return Ok((access_token, blade_auth_direct));
        }

        if let Ok((new_token, _)) = self.get_electricity_token().await {
            if let Some(entry_url) = get_entry_url_via_hub(&direct_client, &new_token).await? {
                if let Some(token) = extract_token_from_url(&entry_url) {
                    println!("[调试] 初始化AI会话：刷新后从 hub 获取令牌: {}", token);
                    let mut candidates = vec![entry_url.clone()];
                    if let Some(template) = &template_entry_url {
                        if let Some(merged_url) = replace_token_in_entry_url(template, &token) {
                            candidates.insert(0, merged_url);
                        }
                    }
                    for candidate in candidates {
                        let blade_auth = fetch_blade_auth(&self.client, &candidate).await.unwrap_or_default();
                        if !blade_auth.is_empty() {
                            save_cached_entry_url(&candidate);
                            return Ok((token, blade_auth));
                        }
                    }
                }
            }
            for redirect_encoded in redirect_candidates.iter() {
                let open_url = format!(
                    "https://code.hbut.edu.cn/server/third/open?redirectUrl={}&accessToken={}",
                    redirect_encoded,
                    new_token
                );
                if let Some(entry_url) = follow_redirect_for_entry(&direct_client, &open_url).await? {
                    if let Some(token) = extract_token_from_url(&entry_url) {
                        println!("[调试] 初始化AI会话：刷新后获取令牌: {}", token);
                        let mut candidates = vec![entry_url.clone()];
                        if let Some(template) = &template_entry_url {
                            if let Some(merged_url) = replace_token_in_entry_url(template, &token) {
                                candidates.insert(0, merged_url);
                            }
                        }
                        for candidate in candidates {
                            let blade_auth = fetch_blade_auth(&self.client, &candidate).await.unwrap_or_default();
                            if !blade_auth.is_empty() {
                                save_cached_entry_url(&candidate);
                                return Ok((token, blade_auth));
                            }
                        }
                    }
                }
            }

            let refresh_entry_url = if let Some(template) = &template_entry_url {
                replace_token_in_entry_url(template, &new_token).unwrap_or_else(|| format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", new_token))
            } else {
                format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", new_token)
            };
            let blade_auth_refresh = fetch_blade_auth(&self.client, &refresh_entry_url).await.unwrap_or_default();
            if !blade_auth_refresh.is_empty() {
                println!("[调试] 初始化AI会话：直接使用刷新后的 access令牌 获取 blade-auth");
                save_cached_entry_url(&refresh_entry_url);
                return Ok((new_token, blade_auth_refresh));
            }
        }

        Err("未能从重定向地址中获取令牌".into())
    }

}



