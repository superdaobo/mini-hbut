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
use reqwest::Url;
use reqwest::cookie::CookieStore;
impl HbutClient {
    /// 拉取当前登录用户信息
    pub async fn fetch_user_info(&self) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!("{}/admin/xsd/xsjbxx/xskp", JWXT_BASE_URL);
        println!("[调试] 获取用户信息： {}", info_url);
        
        let response = self.client
            .get(&info_url)
            .header("Referer", "https://jwxt.hbut.edu.cn/admin/indexMain/M1402")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 用户信息响应状态: {}, 地址: {}", status, final_url);

        if status.as_u16() != 200 {
            return Err(format!("获取个人信息失败: {}", status).into());
        }

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }

        let html = response.text().await?;
        println!("[调试] 用户信息 HTML 长度: {}", html.len());
        
        match parser::parse_user_info(&html) {
            Ok(info) => {
                println!("[调试] 解析出的用户信息: {:?}", info);
                Ok(info)
            }
            Err(e) => {
                println!("[调试] 用户信息解析失败: {}", e);
                // 打印 HTML 的前 500 字符帮助调试
                println!("[调试] HTML 预览: {}", &html.chars().take(500).collect::<String>());
                Err(e)
            }
        }
    }

    /// 使用 Cookie 字符串恢复会话并返回用户信息
    pub async fn restore_session(&mut self, cookies: &str) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        // 恢复 cookies
        for cookie_str in cookies.split(';') {
            let cookie_str = cookie_str.trim();
            if !cookie_str.is_empty() {
                if let Some((name, value)) = cookie_str.split_once('=') {
                    let url: Url = JWXT_BASE_URL.parse()?;
                    self.cookie_jar.add_cookie_str(
                        &format!("{}={}; Domain=.hbut.edu.cn; Path=/", name.trim(), value.trim()),
                        &url,
                    );
                }
            }
        }
        
        // 验证会话
        let user_info = self.fetch_user_info().await?;
        self.is_logged_in = true;
        self.user_info = Some(user_info.clone());
        self.save_cookie_snapshot_to_file();
        
        Ok(user_info)
    }

    /// 刷新会话（保持登录态）
    pub async fn refresh_session(&mut self) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
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

    /// 获取当前 Cookie（用于前端存储/调试）
    pub fn get_cookies(&self) -> String {
        let code_url = "https://code.hbut.edu.cn".parse().unwrap();
        let auth_url = "https://auth.hbut.edu.cn".parse().unwrap();
        let jwxt_url = "https://jwxt.hbut.edu.cn".parse().unwrap();
        
        let mut all_cookies = Vec::new();
        if let Some(c) = self.cookie_jar.cookies(&code_url) { all_cookies.push(format!("Code: {}", c.to_str().unwrap_or_default())); }
        if let Some(c) = self.cookie_jar.cookies(&auth_url) { all_cookies.push(format!("Auth: {}", c.to_str().unwrap_or_default())); }
        if let Some(c) = self.cookie_jar.cookies(&jwxt_url) { all_cookies.push(format!("Jwxt: {}", c.to_str().unwrap_or_default())); }
        all_cookies.join(" | ")
    }

    /// 导出 Cookie 快照（不带前缀，适合外部缓存/导入）
    /// 获取当前 Cookie 快照（结构化 JSON）
    pub fn get_cookie_snapshot(&self) -> serde_json::Value {
        let code_url: Url = "https://code.hbut.edu.cn".parse().unwrap();
        let auth_url: Url = "https://auth.hbut.edu.cn".parse().unwrap();
        let jwxt_url: Url = "https://jwxt.hbut.edu.cn".parse().unwrap();

        let code = self.cookie_jar.cookies(&code_url)
            .map(|c| c.to_str().unwrap_or_default().to_string())
            .unwrap_or_default();
        let auth = self.cookie_jar.cookies(&auth_url)
            .map(|c| c.to_str().unwrap_or_default().to_string())
            .unwrap_or_default();
        let jwxt = self.cookie_jar.cookies(&jwxt_url)
            .map(|c| c.to_str().unwrap_or_default().to_string())
            .unwrap_or_default();

        serde_json::json!({
            "code": code,
            "auth": auth,
            "jwxt": jwxt
        })
    }

    /// 从 Cookie 快照恢复（仅写入 Cookie，不做登录校验）
    /// 从结构化 Cookie 快照恢复会话
    pub fn restore_cookie_snapshot(
        &mut self,
        code: Option<String>,
        auth: Option<String>,
        jwxt: Option<String>
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let code_url: Url = "https://code.hbut.edu.cn".parse()?;
        let auth_url: Url = "https://auth.hbut.edu.cn".parse()?;
        let jwxt_url: Url = "https://jwxt.hbut.edu.cn".parse()?;

        if let Some(raw) = code {
            for cookie_str in raw.split(';') {
                let cookie_str = cookie_str.trim();
                if let Some((name, value)) = cookie_str.split_once('=') {
                    self.cookie_jar.add_cookie_str(
                        &format!("{}={}; Domain=.hbut.edu.cn; Path=/", name.trim(), value.trim()),
                        &code_url,
                    );
                }
            }
        }
        if let Some(raw) = auth {
            for cookie_str in raw.split(';') {
                let cookie_str = cookie_str.trim();
                if let Some((name, value)) = cookie_str.split_once('=') {
                    self.cookie_jar.add_cookie_str(
                        &format!("{}={}; Domain=.hbut.edu.cn; Path=/", name.trim(), value.trim()),
                        &auth_url,
                    );
                }
            }
        }
        if let Some(raw) = jwxt {
            for cookie_str in raw.split(';') {
                let cookie_str = cookie_str.trim();
                if let Some((name, value)) = cookie_str.split_once('=') {
                    self.cookie_jar.add_cookie_str(
                        &format!("{}={}; Domain=.hbut.edu.cn; Path=/", name.trim(), value.trim()),
                        &jwxt_url,
                    );
                }
            }
        }

        Ok(())
    }

    /// 获取应用数据目录（用于持久化 Cookie）
    pub(super) fn app_data_dir() -> Option<PathBuf> {
        let base = std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .ok()?;
        let dir = PathBuf::from(base).join("Mini-HBUT");
        let _ = std::fs::create_dir_all(&dir);
        Some(dir)
    }

    fn cookie_snapshot_path() -> Option<PathBuf> {
        Self::app_data_dir().map(|dir| dir.join("hbut_cookie_snapshot.json"))
    }

    fn legacy_cookie_snapshot_path() -> Option<PathBuf> {
        std::env::current_dir().ok().map(|dir| dir.join("hbut_cookie_snapshot.json"))
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
            let raw_code = json.get("code").and_then(|v| v.as_str()).map(|s| s.to_string());
            let raw_auth = json.get("auth").and_then(|v| v.as_str()).map(|s| s.to_string());
            let raw_jwxt = json.get("jwxt").and_then(|v| v.as_str()).map(|s| s.to_string());

            let extract_segment = |raw: Option<String>, label: &str| -> Option<String> {
                let raw = raw.unwrap_or_default();
                if raw.contains("Code:") || raw.contains("Auth:") || raw.contains("Jwxt:") {
                    if let Ok(re) = regex::Regex::new(&format!(r"(?:^|\\|)\\s*{}:\\s*([^|]+)", label)) {
                        if let Some(cap) = re.captures(&raw) {
                            if let Some(m) = cap.get(1) {
                                return Some(m.as_str().trim().to_string());
                            }
                        }
                    }
                }
                if raw.trim().is_empty() { None } else { Some(raw) }
            };

            let code = extract_segment(raw_code, "Code");
            let auth = extract_segment(raw_auth, "Auth");
            let jwxt = extract_segment(raw_jwxt, "Jwxt");
            let _ = self.restore_cookie_snapshot(code, auth, jwxt);
        }
    }

    /// 清理会话缓存与用户信息
    pub fn clear_session(&mut self) {
        self.is_logged_in = false;
        self.user_info = None;
    }

}

