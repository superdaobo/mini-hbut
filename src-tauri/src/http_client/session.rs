//! 会话与 Cookie 管理模块。
//!
//! 负责：
//! - 获取/恢复用户信息
//! - Cookie 快照的保存与加载
//! - 会话刷新与清理
//! - 提供统一的 Cookie 输出格式
//!
//! 注意：
//! - 恢复会话需要确保 Cookie 字符串完整
//! - 快照文件位于应用数据目录（不同平台路径不同）

use super::*;
use reqwest::cookie::CookieStore;
use reqwest::Url;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::OnceLock;

fn normalize_cookie_blob(raw: &str) -> String {
    raw.replace('\r', "")
        .replace('\n', "")
        .replace("Code:", "")
        .replace("Auth:", "")
        .replace("Jwxt:", "")
        .replace('|', ";")
}

fn is_valid_cookie_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 128 {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

fn parse_cookie_pairs(raw: &str) -> Vec<(String, String)> {
    let normalized = normalize_cookie_blob(raw);
    let mut seen: HashSet<String> = HashSet::new();
    let mut pairs = Vec::new();
    for chunk in normalized.split(';') {
        let item = chunk.trim();
        if item.is_empty() {
            continue;
        }
        let Some((name_raw, value_raw)) = item.split_once('=') else {
            continue;
        };
        let name = name_raw.trim();
        if !is_valid_cookie_name(name) {
            continue;
        }
        let value = value_raw.trim();
        if value.is_empty() {
            continue;
        }
        if seen.insert(name.to_string()) {
            pairs.push((name.to_string(), value.to_string()));
        }
    }
    pairs
}

fn extract_scoped_cookie_blob(raw: &str, scope: &str) -> Option<String> {
    let prefix = format!("{}:", scope);
    raw.split('|')
        .map(|item| item.trim())
        .find_map(|item| item.strip_prefix(&prefix))
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

fn regex_chaoxing_xxtlogin_url() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(
            r#"(?i)(?:https?:)?(?:\\\\/\\\\/|//)?[a-z0-9\.-]*(?:\\\\/|/)?admin(?:\\\\/|/)?api(?:\\\\/|/)?xxtlogin\?loginUrl=[^"'<>\s]+"#,
        )
        .expect("regex xxtlogin")
    })
}

fn normalize_chaoxing_bridge_url(raw: &str) -> String {
    raw.trim()
        .trim_matches('"')
        .trim_matches('\'')
        .replace("\\/", "/")
        .replace("\\u0026", "&")
        .replace("\\u003d", "=")
        .replace("\\u003f", "?")
        .replace("\\u002f", "/")
        .replace("&amp;", "&")
        .replace("&#x26;", "&")
        .replace("&quot;", "\"")
}

fn collect_chaoxing_xxtlogin_urls(html: &str) -> Vec<String> {
    let mut urls: Vec<String> = Vec::new();
    for mat in regex_chaoxing_xxtlogin_url().find_iter(html) {
        let mut candidate = normalize_chaoxing_bridge_url(mat.as_str());
        if candidate.is_empty() {
            continue;
        }
        if candidate.starts_with("//") {
            candidate = format!("https:{}", candidate);
        } else if candidate.starts_with("http://") {
            candidate = candidate.replacen("http://", "https://", 1);
        } else if !candidate.starts_with("https://") && !candidate.starts_with("/admin/") {
            candidate = format!("https://{}", candidate.trim_start_matches('/'));
        }

        if candidate.starts_with("/admin/api/xxtlogin") {
            for host in [
                "https://vkb.jw.chaoxing.com",
                "https://hbut.jw.chaoxing.com",
                "https://i.chaoxing.com",
            ] {
                let merged = format!("{}{}", host, candidate);
                if !urls.iter().any(|item| item == &merged) {
                    urls.push(merged);
                }
            }
            continue;
        }
        if !urls.iter().any(|item| item == &candidate) {
            urls.push(candidate);
        }
    }

    let fallback = "https://vkb.jw.chaoxing.com/admin/api/xxtlogin?loginUrl=https%3A%2F%2Fhbut.jw.chaoxing.com%2Fadmin%2Flogin2%3Frole%3Dxs%26url%3Dhttps%253A%252F%252Fmitudz.jw.chaoxing.com%252Fviews%252FhomePage.html%253Frole%253D1%2526domainUrl%253Dhbut.jw.chaoxing.com".to_string();
    if !urls.iter().any(|item| item == &fallback) {
        urls.push(fallback);
    }
    urls
}

impl HbutClient {
    /// 学习通登录后补齐教务票据链，确保 `hbut.jw.chaoxing.com` 接口可直接访问。
    pub async fn ensure_chaoxing_academic_session(&self) -> bool {
        if !self.prefer_chaoxing_jwxt {
            return false;
        }

        let has_ready_cookie = || {
            let jw_raw = Url::parse("https://hbut.jw.chaoxing.com")
                .ok()
                .and_then(|url| self.cookie_jar.cookies(&url))
                .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
                .unwrap_or_default();
            let has_jw = jw_raw.contains("jw_uf=") && jw_raw.contains("username=");
            if !has_jw {
                return false;
            }
            let passport_raw = Url::parse("https://passport2.chaoxing.com")
                .ok()
                .and_then(|url| self.cookie_jar.cookies(&url))
                .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
                .unwrap_or_default();
            let i_raw = Url::parse("https://i.chaoxing.com")
                .ok()
                .and_then(|url| self.cookie_jar.cookies(&url))
                .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
                .unwrap_or_default();
            [passport_raw.as_str(), i_raw.as_str(), jw_raw.as_str()]
                .iter()
                .any(|cookie| {
                    cookie.contains("p_auth_token=")
                        || cookie.contains("cx_p_token=")
                        || cookie.contains("xxtenc=")
                })
        };
        if has_ready_cookie() {
            return true;
        }

        let base_url = format!(
            "https://i.chaoxing.com/base?t={}",
            super::utils::chrono_timestamp()
        );
        let base_resp = match self.client.get(&base_url).send().await {
            Ok(resp) => resp,
            Err(e) => {
                println!("[调试] 学习通补票失败：访问 base 失败: {}", e);
                return false;
            }
        };

        let base_status = base_resp.status();
        let base_final_url = base_resp.url().to_string();
        let base_html = match base_resp.text().await {
            Ok(text) => text,
            Err(e) => {
                println!("[调试] 学习通补票失败：读取 base 响应失败: {}", e);
                return false;
            }
        };
        println!(
            "[调试] 学习通补票：base status={}, final_url={}",
            base_status, base_final_url
        );

        // 如果 base 被重定向到 passport2 登录页，说明 i.chaoxing.com 不识别当前会话
        // 直接返回，避免 passport2 登录页通过 Set-Cookie 清除已有的 UID/auth cookie
        if base_final_url.contains("passport2.chaoxing.com/login")
            || base_final_url.contains("passport2.chaoxing.com/mlogin")
        {
            println!("[调试] 学习通补票：base 重定向到登录页，跳过补票避免 cookie 被清除");
            return false;
        }

        let bridge_urls = collect_chaoxing_xxtlogin_urls(&base_html);
        if bridge_urls.len() <= 1 {
            println!("[调试] 学习通补票：未在首页提取到 xxtlogin 链路，使用兜底链路");
        }
        for (idx, bridge_url) in bridge_urls.iter().enumerate() {
            let bridge_resp = self
                .client
                .get(bridge_url)
                .header("Referer", "https://i.chaoxing.com/")
                .send()
                .await;
            match bridge_resp {
                Ok(resp) => {
                    println!(
                        "[调试] 学习通补票：xxtlogin[{}] status={}, final_url={}",
                        idx + 1,
                        resp.status(),
                        resp.url()
                    );
                    let _ = resp.text().await;
                }
                Err(e) => {
                    println!("[调试] 学习通补票：xxtlogin[{}] 请求失败: {}", idx + 1, e);
                }
            }
        }

        let _ = self
            .client
            .get("https://hbut.jw.chaoxing.com/admin/")
            .header("Referer", "https://i.chaoxing.com/")
            .send()
            .await;
        let _ = self
            .client
            .post("https://hbut.jw.chaoxing.com/admin/getMenuList")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Origin", "https://hbut.jw.chaoxing.com")
            .header("Referer", "https://hbut.jw.chaoxing.com/admin/")
            .send()
            .await;
        let _ = self
            .client
            .post("https://hbut.jw.chaoxing.com/admin/xsd/pkgl/xskb/checkWfwSfpj")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Origin", "https://hbut.jw.chaoxing.com")
            .header("Referer", "https://hbut.jw.chaoxing.com/admin/")
            .send()
            .await;
        let _ = self
            .client
            .get(&format!(
                "https://i.chaoxing.com/base?t={}",
                super::utils::chrono_timestamp()
            ))
            .header("Referer", "https://hbut.jw.chaoxing.com/admin/")
            .send()
            .await;

        let jw_url = match Url::parse("https://hbut.jw.chaoxing.com") {
            Ok(v) => v,
            Err(_) => return false,
        };
        let raw = self
            .cookie_jar
            .cookies(&jw_url)
            .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
            .unwrap_or_default();
        let passport_raw = Url::parse("https://passport2.chaoxing.com")
            .ok()
            .and_then(|url| self.cookie_jar.cookies(&url))
            .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
            .unwrap_or_default();
        let i_raw = Url::parse("https://i.chaoxing.com")
            .ok()
            .and_then(|url| self.cookie_jar.cookies(&url))
            .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
            .unwrap_or_default();
        let ready = raw.contains("jw_uf=") && raw.contains("username=");
        let has_learning_token = [passport_raw.as_str(), i_raw.as_str(), raw.as_str()]
            .iter()
            .any(|cookie| {
                cookie.contains("p_auth_token=")
                    || cookie.contains("cx_p_token=")
                    || cookie.contains("xxtenc=")
            });
        let has_learning_uid = [passport_raw.as_str(), i_raw.as_str(), raw.as_str()]
            .iter()
            .any(|cookie| cookie.contains("UID=") || cookie.contains("_uid="));
        println!(
            "[调试] 学习通补票完成: ready={}, jw_len={}, i_len={}, passport_len={}, has_learning_uid={}, has_learning_token={}",
            ready,
            raw.len(),
            i_raw.len(),
            passport_raw.len(),
            has_learning_uid,
            has_learning_token
        );
        ready
    }

    /// 利用已有的 CAS 会话 SSO 到超星学习通，无需单独登录。
    /// 流程：CAS?service=fysso/cassso/hbutsie → fysso/hbutsie?ticket=ST → logindsso → loginfanya → 建立超星会话
    pub async fn try_bridge_cas_to_chaoxing(&mut self) -> bool {
        if !self.is_logged_in {
            println!("[调试] CAS→超星桥接: CAS 未登录，跳过");
            return false;
        }

        // 直接走 CAS service URL，绕过 tohbutsie 避免 i.chaoxing.com 的 HTTPS→HTTP 降级重定向
        // 链路（共 6 步）：CAS?service=fysso/hbutsie → fysso/hbutsie?ticket=ST
        //     → logindsso → loginfanya（设置 UID cookies）→ login/auth → fanya portal
        let cas_fysso_url = format!(
            "{}/login?service=https://fysso.chaoxing.com/cassso/hbutsie",
            super::AUTH_BASE_URL
        );
        println!("[调试] CAS→超星桥接: 发起 CAS→FYSSO {}", cas_fysso_url);

        let resp = match self.client.get(&cas_fysso_url).send().await {
            Ok(r) => r,
            Err(e) => {
                println!("[调试] CAS→超星桥接: FYSSO 请求失败: {}", e);
                return false;
            }
        };

        let final_url = resp.url().to_string();
        let _body = resp.text().await.unwrap_or_default();
        println!("[调试] CAS→超星桥接: 跳转到 {}", final_url);

        // 检查是否回到了 CAS 登录页（说明 TGT 失效）
        // 注意：此处不立即清 is_logged_in，交由 chaoxing_sso 统一层尝试静默重登后再决定
        if final_url.contains("authserver/login") {
            println!("[调试] CAS→超星桥接: TGT 已失效，跳转回登录页");
            return false;
        }

        // 设置学习通教务域名优先模式
        self.set_chaoxing_login_mode(true);

        // 访问学习通教务首页以激活完整会话
        let _ = self
            .client
            .get("https://hbut.jw.chaoxing.com/admin/")
            .header("Referer", "https://i.chaoxing.com/")
            .send()
            .await;

        // 注意：不再访问 i.chaoxing.com/base，因为 FYSSO 桥接后 i.chaoxing.com 不认识此会话，
        // 会重定向到 passport2.chaoxing.com/login，passport2 登录页可能清除已设置的 UID Cookie。
        // backclazzdata 只需 .chaoxing.com 域的 UID/p_auth_token cookie，FYSSO 链已设置好。

        // 验证超星会话是否可用
        let passport_url = Url::parse("https://passport2.chaoxing.com").ok();
        let i_url = Url::parse("https://i.chaoxing.com").ok();
        let jw_url = Url::parse("https://hbut.jw.chaoxing.com").ok();

        let mut all_cookies = String::new();
        for url in [&passport_url, &i_url, &jw_url]
            .iter()
            .filter_map(|u| u.as_ref())
        {
            if let Some(c) = self.cookie_jar.cookies(url) {
                if let Ok(s) = c.to_str() {
                    if !s.trim().is_empty() {
                        if !all_cookies.is_empty() {
                            all_cookies.push_str("; ");
                        }
                        all_cookies.push_str(s);
                    }
                }
            }
        }

        let has_uid = all_cookies.contains("UID=") || all_cookies.contains("_uid=");
        let has_jw = all_cookies.contains("jw_uf=");
        println!(
            "[调试] CAS→超星桥接完成: has_uid={}, has_jw={}, cookie_len={}",
            has_uid,
            has_jw,
            all_cookies.len()
        );

        // FYSSO 链的 Set-Cookie 可能不带 Domain=.chaoxing.com，
        // 导致 mooc1.chaoxing.com 等子域无法继承关键 cookies（UID, _uid, fid, cx_p_token 等）。
        // 将这些关键 cookies 显式种到 mooc1 域以确保章节页面可正常访问。
        if has_uid {
            self.propagate_chaoxing_cookies_to_mooc();
        }

        has_uid || has_jw
    }

    /// 将关键学习通 cookies 从 passport2/i 域传播到 mooc1 域
    fn propagate_chaoxing_cookies_to_mooc(&self) {
        let source_urls = ["https://passport2.chaoxing.com", "https://i.chaoxing.com"];
        let target_urls = [
            "https://mooc1.chaoxing.com",
            "https://mooc1-api.chaoxing.com",
            "https://mooc2-ans.chaoxing.com",
            "https://i.chaoxing.com",
            "https://mobilelearn.chaoxing.com",
        ];
        let key_names: &[&str] = &[
            "UID",
            "_uid",
            "fid",
            "cx_p_token",
            "p_auth_token",
            "xxtenc",
            "_d",
            "uf",
            "spaceFid",
            "spaceRoleId",
        ];

        // 收集所有源域 cookies
        let mut collected: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for src in &source_urls {
            if let Ok(url) = Url::parse(src) {
                if let Some(header) = self.cookie_jar.cookies(&url) {
                    if let Ok(s) = header.to_str() {
                        for pair in s.split(';') {
                            let pair = pair.trim();
                            if let Some((name, value)) = pair.split_once('=') {
                                let name = name.trim();
                                if key_names.iter().any(|k| k.eq_ignore_ascii_case(name)) {
                                    collected
                                        .entry(name.to_string())
                                        .or_insert_with(|| value.trim().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        if collected.is_empty() {
            return;
        }

        // 种到所有目标域
        for tgt in &target_urls {
            if let Ok(url) = Url::parse(tgt) {
                for (name, value) in &collected {
                    let cookie_str = format!("{}={}; Path=/", name, value);
                    self.cookie_jar.add_cookie_str(&cookie_str, &url);
                }
            }
        }
        println!(
            "[调试] CAS→超星桥接: 已传播 {} 个关键 cookie 到 mooc1 域",
            collected.len()
        );
    }

    /// 拉取当前登录用户信息
    pub async fn fetch_user_info(
        &self,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!("{}/admin/xsd/xsjbxx/xskp", self.academic_base_url());
        println!("[调试] 获取用户信息： {}", info_url);

        let mut repaired = false;
        let html = loop {
            let response = self
                .client
                .get(&info_url)
                .header(
                    "Referer",
                    format!("{}/admin/indexMain/M1402", self.academic_base_url()),
                )
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .send()
                .await?;

            let status = response.status();
            let final_url = response.url().to_string();
            println!("[调试] 用户信息响应状态: {}, 地址: {}", status, final_url);

            if super::looks_like_academic_login_url(&final_url) {
                // v3: 尝试通过 /admin/caslogin 补偿会话
                if !repaired {
                    if self.prefer_chaoxing_jwxt {
                        if self.ensure_chaoxing_academic_session().await {
                            repaired = true;
                            println!("[调试] 用户信息请求命中登录页，已补票后重试（学习通）");
                            continue;
                        }
                    } else {
                        let caslogin_url = format!("{}/admin/caslogin", super::JWXT_BASE_URL);
                        println!("[调试] 用户信息请求命中登录页，尝试 /admin/caslogin 恢复");
                        let caslogin_resp = self.client.get(&caslogin_url).send().await;
                        if let Ok(resp) = caslogin_resp {
                            let cas_final = resp.url().to_string();
                            if !super::looks_like_academic_login_url(&cas_final) {
                                repaired = true;
                                println!("[调试] /admin/caslogin 会话恢复成功，重试获取用户信息");
                                continue;
                            }
                        }
                    }
                }
                return Err("会话已过期，请重新登录".into());
            }

            if status.as_u16() != 200 {
                return Err(format!("获取个人信息失败: {}", status).into());
            }

            break response.text().await?;
        };
        println!("[调试] 用户信息 HTML 长度: {}", html.len());

        match parser::parse_user_info(&html) {
            Ok(info) => {
                println!("[调试] 解析出的用户信息: {:?}", info);
                Ok(info)
            }
            Err(e) => {
                println!("[调试] 用户信息解析失败: {}", e);
                // 打印 HTML 的前 500 字符帮助调试
                println!(
                    "[调试] HTML 预览: {}",
                    &html.chars().take(500).collect::<String>()
                );
                Err(e)
            }
        }
    }

    /// 使用 Cookie 字符串恢复会话并返回用户信息
    pub async fn restore_session(
        &mut self,
        cookies: &str,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        // 先重置会话，避免历史脏 cookie 污染。
        self.reset_http_state();

        let code_url: Url = "https://code.hbut.edu.cn".parse()?;
        let auth_url: Url = "https://auth.hbut.edu.cn".parse()?;
        let jwxt_url: Url = JWXT_BASE_URL.parse()?;
        let chaoxing_url: Url = CHAOXING_JWXT_BASE_URL.parse()?;
        let has_scoped = cookies.contains("Code:")
            || cookies.contains("Auth:")
            || cookies.contains("Jwxt:")
            || cookies.contains("ChaoxingJwxt:");

        let add_pairs = |jar: &Arc<Jar>, target_url: &Url, domain: &str, raw: &str| {
            for (name, value) in parse_cookie_pairs(raw) {
                jar.add_cookie_str(
                    &format!("{}={}; Domain={}; Path=/", name, value, domain),
                    target_url,
                );
            }
        };

        if has_scoped {
            if let Some(raw) = extract_scoped_cookie_blob(cookies, "Code") {
                add_pairs(&self.cookie_jar, &code_url, ".hbut.edu.cn", &raw);
            }
            if let Some(raw) = extract_scoped_cookie_blob(cookies, "Auth") {
                add_pairs(&self.cookie_jar, &auth_url, ".hbut.edu.cn", &raw);
            }
            if let Some(raw) = extract_scoped_cookie_blob(cookies, "Jwxt") {
                add_pairs(&self.cookie_jar, &jwxt_url, ".hbut.edu.cn", &raw);
            }
            if let Some(raw) = extract_scoped_cookie_blob(cookies, "ChaoxingJwxt") {
                add_pairs(&self.cookie_jar, &chaoxing_url, ".chaoxing.com", &raw);
                self.prefer_chaoxing_jwxt = true;
            }
        } else {
            add_pairs(&self.cookie_jar, &jwxt_url, ".hbut.edu.cn", cookies);
            if cookies.contains("xxtenc=")
                || cookies.contains("p_auth_token=")
                || cookies.contains("cx_p_token=")
                || cookies.contains("jw_uf=")
            {
                add_pairs(&self.cookie_jar, &chaoxing_url, ".chaoxing.com", cookies);
                self.prefer_chaoxing_jwxt = true;
            }
        }

        // 学习通补票改为按需：仅在 fetch_user_info 命中登录页时由 session 模块触发。

        // 验证会话
        let user_info = self.fetch_user_info().await?;
        self.is_logged_in = true;
        self.user_info = Some(user_info.clone());
        self.save_cookie_snapshot_to_file();

        Ok(user_info)
    }

    /// 刷新会话（保持登录态）
    pub async fn refresh_session(
        &mut self,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let user_info = self.fetch_user_info().await?;
        // 成功登录
        self.last_login_time = Some(std::time::Instant::now());
        self.is_logged_in = true;
        self.user_info = Some(user_info.clone());
        self.save_cookie_snapshot_to_file();

        // 自动预热 SSO Token (如电费)
        let _ = self.ensure_electricity_token().await;

        Ok(user_info)
    }

    /// 会话相关域（#348/#350）：门户 + 学习通长效 cookie 全量。
    /// (snapshot_key, origin_url, Domain= attribute)
    pub fn session_cookie_domains() -> &'static [(&'static str, &'static str, &'static str)] {
        &[
            ("code", "https://code.hbut.edu.cn", ".hbut.edu.cn"),
            ("auth", "https://auth.hbut.edu.cn", ".hbut.edu.cn"),
            ("portal", "https://e.hbut.edu.cn", ".hbut.edu.cn"),
            ("jwxt", "https://jwxt.hbut.edu.cn", ".hbut.edu.cn"),
            (
                "chaoxing_jwxt",
                "https://hbut.jw.chaoxing.com",
                ".chaoxing.com",
            ),
            (
                "passport",
                "https://passport2.chaoxing.com",
                ".chaoxing.com",
            ),
            ("i_chaoxing", "https://i.chaoxing.com", ".chaoxing.com"),
            ("mooc1", "https://mooc1.chaoxing.com", ".chaoxing.com"),
            ("mooc2_ans", "https://mooc2-ans.chaoxing.com", ".chaoxing.com"),
            ("pan_yz", "https://pan-yz.chaoxing.com", ".chaoxing.com"),
            (
                "mobilelearn",
                "https://mobilelearn.chaoxing.com",
                ".chaoxing.com",
            ),
            ("fysso", "https://fysso.chaoxing.com", ".chaoxing.com"),
        ]
    }

    fn cookie_header_for_origin(&self, origin: &str) -> String {
        let Ok(url) = Url::parse(origin) else {
            return String::new();
        };
        self.cookie_jar
            .cookies(&url)
            .and_then(|c| c.to_str().ok().map(|s| s.to_string()))
            .unwrap_or_default()
    }

    /// 获取当前 Cookie（用于前端存储/调试；保留旧 Code/Auth/Jwxt/ChaoxingJwxt 标签兼容）
    pub fn get_cookies(&self) -> String {
        let mut all_cookies = Vec::new();
        // 旧标签（兼容 restore_session / 前端）
        let code = self.cookie_header_for_origin("https://code.hbut.edu.cn");
        let auth = self.cookie_header_for_origin("https://auth.hbut.edu.cn");
        let jwxt = self.cookie_header_for_origin("https://jwxt.hbut.edu.cn");
        let cx_jw = self.cookie_header_for_origin("https://hbut.jw.chaoxing.com");
        if !code.is_empty() {
            all_cookies.push(format!("Code: {}", code));
        }
        if !auth.is_empty() {
            all_cookies.push(format!("Auth: {}", auth));
        }
        if !jwxt.is_empty() {
            all_cookies.push(format!("Jwxt: {}", jwxt));
        }
        if !cx_jw.is_empty() {
            all_cookies.push(format!("ChaoxingJwxt: {}", cx_jw));
        }
        // 扩展域（新标签，restore_session 可识别 Key:）
        for (key, origin, _) in Self::session_cookie_domains() {
            if matches!(
                *key,
                "code" | "auth" | "jwxt" | "chaoxing_jwxt"
            ) {
                continue;
            }
            let raw = self.cookie_header_for_origin(origin);
            if !raw.is_empty() {
                all_cookies.push(format!("{}: {}", key, raw));
            }
        }
        all_cookies.join(" | ")
    }

    /// 结构化快照：含全部会话域 + 旧字段兼容
    pub fn get_cookie_snapshot(&self) -> serde_json::Value {
        let mut map = serde_json::Map::new();
        for (key, origin, _) in Self::session_cookie_domains() {
            let raw = self.cookie_header_for_origin(origin);
            map.insert(key.to_string(), serde_json::Value::String(raw));
        }
        // 旧键名别名
        map.insert(
            "chaoxing_jwxt".to_string(),
            map.get("chaoxing_jwxt").cloned().unwrap_or_default(),
        );
        serde_json::Value::Object(map)
    }

    /// 导出 (domain_host, cookie_header) 供 auth_cookie_v2 落库
    pub fn export_domain_cookie_rows(&self) -> Vec<(String, String)> {
        let mut rows = Vec::new();
        for (key, origin, _) in Self::session_cookie_domains() {
            let raw = self.cookie_header_for_origin(origin);
            if raw.trim().is_empty() {
                continue;
            }
            // cookie_json: 存为 name=value 对数组
            let pairs = parse_cookie_pairs(&raw);
            if pairs.is_empty() {
                continue;
            }
            let arr: Vec<serde_json::Value> = pairs
                .into_iter()
                .map(|(n, v)| {
                    serde_json::json!({
                        "name": n,
                        "value": v,
                        "path": "/",
                    })
                })
                .collect();
            let json = serde_json::to_string(&arr).unwrap_or_else(|_| "[]".into());
            // 用 origin host 作 domain 主键，便于 hydrate
            let host = origin
                .trim_start_matches("https://")
                .trim_start_matches("http://")
                .to_string();
            rows.push((host, json));
            let _ = key;
        }
        rows
    }

    /// 将当前 jar 持久化到 DB v2 + 旧 user_sessions.cookies + 文件快照（#349/#350）
    pub fn persist_session_cookies(&self, student_id: &str) {
        let sid = student_id.trim();
        if sid.is_empty() {
            return;
        }
        let rows = self.export_domain_cookie_rows();
        if !rows.is_empty() {
            if let Err(e) =
                crate::db::upsert_auth_cookies_batch(crate::DB_FILENAME, sid, &rows, "jar")
            {
                eprintln!("[session] auth_cookie_v2 写入失败: {}", e);
            }
        }
        // 旧列双写：只改 cookies，避免 save_user_session 空 token 抹掉电费会话
        let legacy = self.get_cookies();
        if !legacy.trim().is_empty() {
            if let Err(e) =
                crate::db::update_user_session_cookies_only(crate::DB_FILENAME, sid, &legacy)
            {
                eprintln!("[session] user_sessions.cookies 双写失败: {}", e);
            }
        }
        self.save_cookie_snapshot_to_file();
    }

    /// 冷启动：优先 auth_cookie_v2，再文件快照（#348）
    pub fn hydrate_session_cookies_from_store(&mut self, student_id: Option<&str>) {
        let sid = student_id
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                crate::db::get_latest_user_session(crate::DB_FILENAME)
                    .ok()
                    .flatten()
                    .map(|s| s.student_id)
            });

        let mut restored = false;
        if let Some(ref sid) = sid {
            if let Ok(rows) = crate::db::load_auth_cookies_for_student(crate::DB_FILENAME, sid) {
                if !rows.is_empty() {
                    self.restore_auth_cookie_v2_rows(&rows);
                    restored = true;
                    println!(
                        "[session] 已从 auth_cookie_v2 恢复 {} 个域 cookie student={}",
                        rows.len(),
                        sid
                    );
                }
            }
        }
        if !restored {
            self.load_cookie_snapshot_from_file();
        }
    }

    fn restore_auth_cookie_v2_rows(&mut self, rows: &[crate::db::AuthCookieDomainRow]) {
        for row in rows {
            let host = row.domain.trim();
            if host.is_empty() {
                continue;
            }
            let origin = if host.starts_with("http") {
                host.to_string()
            } else {
                format!("https://{}", host)
            };
            let Ok(url) = Url::parse(&origin) else {
                continue;
            };
            let domain_attr = if host.contains("chaoxing.com") {
                ".chaoxing.com"
            } else if host.contains("hbut.edu.cn") {
                ".hbut.edu.cn"
            } else {
                host
            };
            // cookie_json 可能是数组或裸 cookie 串
            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&row.cookie_json) {
                for item in arr {
                    let name = item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim();
                    let value = item
                        .get("value")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim();
                    if name.is_empty() || value.is_empty() {
                        continue;
                    }
                    let path = item
                        .get("path")
                        .and_then(|v| v.as_str())
                        .unwrap_or("/");
                    self.cookie_jar.add_cookie_str(
                        &format!(
                            "{}={}; Domain={}; Path={}",
                            name, value, domain_attr, path
                        ),
                        &url,
                    );
                }
            } else {
                for (name, value) in parse_cookie_pairs(&row.cookie_json) {
                    self.cookie_jar.add_cookie_str(
                        &format!("{}={}; Domain={}; Path=/", name, value, domain_attr),
                        &url,
                    );
                }
            }
            if host.contains("chaoxing.com") {
                self.prefer_chaoxing_jwxt = true;
            }
        }
    }

    /// 从 Cookie 快照恢复（仅写入 Cookie，不做登录校验）
    /// 从结构化 Cookie 快照恢复会话（旧 API：三参，兼容）
    pub fn restore_cookie_snapshot(
        &mut self,
        code: Option<String>,
        auth: Option<String>,
        jwxt: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.restore_cookie_snapshot_extended(code, auth, jwxt, None)
    }

    /// 扩展恢复：含 chaoxing_jwxt 与其它域
    pub fn restore_cookie_snapshot_extended(
        &mut self,
        code: Option<String>,
        auth: Option<String>,
        jwxt: Option<String>,
        chaoxing_jwxt: Option<String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let code_url: Url = "https://code.hbut.edu.cn".parse()?;
        let auth_url: Url = "https://auth.hbut.edu.cn".parse()?;
        let jwxt_url: Url = "https://jwxt.hbut.edu.cn".parse()?;
        let cx_url: Url = "https://hbut.jw.chaoxing.com".parse()?;

        let add = |jar: &Arc<Jar>, url: &Url, domain: &str, raw: &str| {
            for (name, value) in parse_cookie_pairs(raw) {
                jar.add_cookie_str(
                    &format!("{}={}; Domain={}; Path=/", name, value, domain),
                    url,
                );
            }
        };

        if let Some(raw) = code {
            if !raw.trim().is_empty() {
                add(&self.cookie_jar, &code_url, ".hbut.edu.cn", &raw);
            }
        }
        if let Some(raw) = auth {
            if !raw.trim().is_empty() {
                add(&self.cookie_jar, &auth_url, ".hbut.edu.cn", &raw);
            }
        }
        if let Some(raw) = jwxt {
            if !raw.trim().is_empty() {
                add(&self.cookie_jar, &jwxt_url, ".hbut.edu.cn", &raw);
            }
        }
        if let Some(raw) = chaoxing_jwxt {
            if !raw.trim().is_empty() {
                add(&self.cookie_jar, &cx_url, ".chaoxing.com", &raw);
                self.prefer_chaoxing_jwxt = true;
            }
        }
        Ok(())
    }

    /// 获取应用数据目录（用于持久化 Cookie / SSO 诊断）
    pub(crate) fn app_data_dir() -> Option<PathBuf> {
        if let Ok(raw) = std::env::var("HBUT_APP_DATA_DIR") {
            let dir = PathBuf::from(raw.trim());
            if !dir.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(&dir);
                return Some(dir);
            }
        }

        let base = std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .or_else(|_| std::env::var("HOME"))
            .ok()?;
        let dir = PathBuf::from(base).join("Mini-HBUT");
        let _ = std::fs::create_dir_all(&dir);
        Some(dir)
    }

    fn cookie_snapshot_path() -> Option<PathBuf> {
        Self::app_data_dir().map(|dir| dir.join("hbut_cookie_snapshot.json"))
    }

    fn legacy_cookie_snapshot_path() -> Option<PathBuf> {
        std::env::current_dir()
            .ok()
            .map(|dir| dir.join("hbut_cookie_snapshot.json"))
    }

    /// 将 Cookie 快照写入本地文件
    pub fn save_cookie_snapshot_to_file(&self) {
        if let Some(path) = Self::cookie_snapshot_path() {
            let payload = self.get_cookie_snapshot();
            if let Ok(text) = serde_json::to_string(&payload) {
                let _ = std::fs::write(path, text);
            }
        }
    }

    /// 从本地文件加载 Cookie 快照
    pub fn load_cookie_snapshot_from_file(&mut self) {
        let primary = Self::cookie_snapshot_path();
        let legacy = Self::legacy_cookie_snapshot_path();
        let path = primary
            .as_ref()
            .filter(|p| p.exists())
            .cloned()
            .or_else(|| legacy.as_ref().filter(|p| p.exists()).cloned());
        let path = match path {
            Some(p) => p,
            None => return,
        };
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => return,
        };
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            // 新格式：按 session_cookie_domains 的 key 存
            for (key, origin, domain_attr) in Self::session_cookie_domains() {
                let raw = json
                    .get(*key)
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if raw.is_empty() {
                    continue;
                }
                if let Ok(url) = Url::parse(origin) {
                    for (name, value) in parse_cookie_pairs(raw) {
                        self.cookie_jar.add_cookie_str(
                            &format!("{}={}; Domain={}; Path=/", name, value, domain_attr),
                            &url,
                        );
                    }
                    if domain_attr.contains("chaoxing") {
                        self.prefer_chaoxing_jwxt = true;
                    }
                }
            }
            // 旧格式兜底
            let code = json.get("code").and_then(|v| v.as_str()).map(|s| s.to_string());
            let auth = json.get("auth").and_then(|v| v.as_str()).map(|s| s.to_string());
            let jwxt = json.get("jwxt").and_then(|v| v.as_str()).map(|s| s.to_string());
            let cx = json
                .get("chaoxing_jwxt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let _ = self.restore_cookie_snapshot_extended(code, auth, jwxt, cx);
        }
    }

    /// 设置离线用户上下文（用于教务维护时命中本地缓存）
    pub fn set_offline_user_context(&mut self, student_id: &str) {
        let sid = student_id.trim();
        if sid.is_empty() {
            return;
        }

        if let Some(info) = self.user_info.as_mut() {
            if info.student_id.trim().is_empty() {
                info.student_id = sid.to_string();
            }
            if info.student_name.trim().is_empty() {
                info.student_name = sid.to_string();
            }
        } else {
            self.user_info = Some(UserInfo {
                student_id: sid.to_string(),
                student_name: sid.to_string(),
                college: None,
                major: None,
                class_name: None,
                grade: None,
            });
        }

        // 仅用于离线缓存兜底场景：保证缓存键可定位到当前账号。
        self.is_logged_in = true;
    }

    /// 清理会话缓存与用户信息
    pub fn clear_session(&mut self) {
        let sid = self
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .or_else(|| self.last_username.clone());
        self.reset_http_state();
        self.is_logged_in = false;
        self.user_info = None;
        self.last_login_inputs = None;
        self.last_username = None;
        self.last_password = None;
        self.electricity_token = None;
        self.electricity_token_at = None;
        self.electricity_refresh_token = None;
        self.electricity_token_expires_at = None;
        // 登出清 cookie 持久化（#353）；记住密码仍保留在密钥环/DB 密码列
        if let Some(sid) = sid {
            let _ = crate::db::clear_auth_cookies(crate::DB_FILENAME, Some(&sid));
            let _ = crate::db::update_user_session_cookies_only(crate::DB_FILENAME, &sid, "");
        }
        if let Some(path) = Self::cookie_snapshot_path() {
            let _ = std::fs::remove_file(path);
        }
    }
}
