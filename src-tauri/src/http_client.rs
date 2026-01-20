use reqwest::{Client, cookie::{Jar, CookieStore}, Url};
use scraper::{Html, Selector};
use std::sync::Arc;
use std::collections::HashMap;
use base64::Engine;
use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use rand::Rng;
use chrono::{Datelike, NaiveDate};

use crate::{
    UserInfo, LoginPageInfo, Grade, ScheduleCourse, Exam, CalendarEvent,
    parser,
};

// 学期URLs
const CURRENT_SEMESTER_URLS: &[&str] = &[
    "/admin/api/jcsj/xnxq/getCurrentXnxq",
    "/admin/xsd/xsdcjcx/getCurrentXnxq",
];

// AES-CBC 加密类型
type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

// 使用正确的 CAS 地址
const AUTH_BASE_URL: &str = "https://auth.hbut.edu.cn/authserver";
const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";
const TARGET_SERVICE: &str = "https://jwxt.hbut.edu.cn/admin/index.html";

/// 生成随机字符串（与学校 CAS 前端相同的字符集）
fn get_random_string(length: usize) -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARS.len());
            CHARS[idx] as char
        })
        .collect()
}

/// 使用 AES-CBC 加密密码（模拟 CAS 前端 encrypt.js 的加密逻辑）
fn encrypt_password_aes(password: &str, salt: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if salt.len() != 16 {
        return Err(format!("Salt must be 16 bytes, got {}", salt.len()).into());
    }
    
    // Salt 作为密钥和 IV（与学校 CAS 相同）
    let key = salt.as_bytes();
    let iv = salt.as_bytes();
    
    // 生成随机前缀 + 密码
    let random_prefix = get_random_string(64);
    let plain_text = format!("{}{}", random_prefix, password);
    let plain_bytes = plain_text.as_bytes();
    
    // 计算需要的缓冲区大小（PKCS7 填充）
    let block_size = 16;
    let padded_len = ((plain_bytes.len() / block_size) + 1) * block_size;
    let mut buf = vec![0u8; padded_len];
    buf[..plain_bytes.len()].copy_from_slice(plain_bytes);
    
    // AES-CBC 加密
    let cipher = Aes128CbcEnc::new(key.into(), iv.into());
    let encrypted = cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
        .map_err(|e| format!("Encryption failed: {:?}", e))?;
    
    // Base64 编码
    Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
}

pub struct HbutClient {
    client: Client,
    cookie_jar: Arc<Jar>,
    is_logged_in: bool,
    pub user_info: Option<UserInfo>,
    last_login_inputs: Option<HashMap<String, String>>,
    last_username: Option<String>,
    last_password: Option<String>,
    electricity_token: Option<String>,
    electricity_token_at: Option<std::time::Instant>,
}

impl HbutClient {
    pub fn new() -> Self {
        let jar = Arc::new(Jar::default());
        let client = Client::builder()
            .cookie_store(true)
            .cookie_provider(Arc::clone(&jar))
            .redirect(reqwest::redirect::Policy::limited(10))
            .danger_accept_invalid_certs(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        
        Self {
            client,
            cookie_jar: jar,
            is_logged_in: false,
            user_info: None,
            last_login_inputs: None,
            last_username: None,
            last_password: None,
            electricity_token: None,
            electricity_token_at: None,
        }
    }

    pub async fn get_login_page(&mut self) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, TARGET_SERVICE);
        println!("[DEBUG] Fetching login page: {}", login_url);
        
        let response = self.client.get(&login_url).send().await?;
        let html = response.text().await?;

        // 解析并缓存表单 inputs（用于后续登录提交）
        let mut inputs = HashMap::new();
        let input_selector = Selector::parse("input").unwrap();
        let document = Html::parse_document(&html);
        for el in document.select(&input_selector) {
            if let Some(name) = el.value().attr("name") {
                let value = el.value().attr("value").unwrap_or("");
                inputs.insert(name.to_string(), value.to_string());
            }
        }
        // 使用正则提取参数（更稳健）
        // 优先从 inputs 中获取参数
        let lt = inputs.get("lt").cloned().or_else(|| {
             regex::Regex::new(r#"name="lt"\s+value="([^"]*)""#)
            .ok()
            .and_then(|re| re.captures(&html))
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
        }).unwrap_or_default();

        let execution = inputs.get("execution").cloned().or_else(|| {
             regex::Regex::new(r#"name="execution"\s+value="([^"]*)""#)
            .ok()
            .and_then(|re| re.captures(&html))
            .and_then(|cap| cap.get(1))
            .map(|m| m.as_str().to_string())
        }).unwrap_or_default();
            
        let salt = inputs.get("pwdEncryptSalt").cloned()
            .or_else(|| inputs.get("pwdDefaultEncryptSalt").cloned())
            .or_else(|| {
                // 尝试使用 Selector 查找 ID (比正则更稳健)
                let salt_selector = Selector::parse("#pwdEncryptSalt").unwrap();
                document.select(&salt_selector).next()
                    .and_then(|el| el.value().attr("value"))
                    .map(|s| s.to_string())
            })
            .or_else(|| {
                // 最后尝试正则
                regex::Regex::new(r#"id="pwdEncryptSalt"\s+value="([^"]*)""#)
                .ok()
                .and_then(|re| re.captures(&html))
                .and_then(|cap| cap.get(1))
                .map(|m| m.as_str().to_string())
            })
            .unwrap_or_default();
        

        println!("[DEBUG] Login page params: lt={}, execution={}, salt={}", lt, execution, salt);
        
        // 检查是否需要验证码
        let captcha_required = html.contains("captchaResponse") 
            || html.contains("getCaptcha") 
            || inputs.contains_key("captchaResponse")
            || inputs.contains_key("captcha")
            || document.select(&Selector::parse("#captchaResponse").unwrap()).next().is_some()
            || document.select(&Selector::parse("#c_response").unwrap()).next().is_some();
            
        println!("[DEBUG] Captcha required: {}", captcha_required);
        
        if !inputs.is_empty() {
            println!("[DEBUG] Login page input keys: {:?}", inputs.keys().collect::<Vec<_>>());
            self.last_login_inputs = Some(inputs);
        }
        
        Ok(LoginPageInfo {
            lt,
            execution,
            captcha_required,
            salt,
        })
    }

    pub async fn get_captcha(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let captcha_url = format!("{}/getCaptcha.htl?{}", AUTH_BASE_URL, chrono_timestamp());
        println!("[DEBUG] Fetching captcha from: {}", captcha_url);
        
        let response = self.client.get(&captcha_url).send().await?;
        let status = response.status();
        println!("[DEBUG] Captcha response status: {}", status);
        
        let bytes = response.bytes().await?;
        println!("[DEBUG] Captcha bytes length: {}", bytes.len());
        
        if bytes.is_empty() || bytes.len() < 100 {
            return Err(format!("Captcha image is too small: {} bytes", bytes.len()).into());
        }
        
        let base64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
        println!("[DEBUG] Captcha base64 length: {}", base64_str.len());
        
        Ok(format!("data:image/png;base64,{}", base64_str))
    }

    /// 获取验证码并调用服务器 OCR API 识别
    async fn fetch_and_recognize_captcha(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let captcha_url = format!("{}/getCaptcha.htl?{}", AUTH_BASE_URL, chrono_timestamp());
        println!("[DEBUG] Fetching captcha for OCR from: {}", captcha_url);
        
        let response = self.client.get(&captcha_url).send().await?;
        let bytes = response.bytes().await?;
        
        if bytes.is_empty() || bytes.len() < 100 {
            return Err("验证码图片太小".into());
        }
        
        println!("[DEBUG] Captcha image size: {} bytes", bytes.len());
        
        // 将验证码图片转为 Base64
        let base64_image = base64::engine::general_purpose::STANDARD.encode(&bytes);
        
        // 调用服务器 OCR API
        const OCR_SERVER: &str = "http://1.94.167.18:5080";
        let ocr_url = format!("{}/api/ocr/recognize", OCR_SERVER);
        println!("[DEBUG] Calling server OCR API: {}", ocr_url);
        
        // 创建一个简单的 HTTP 客户端（不带 cookie）
        let ocr_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;
        
        let ocr_response = ocr_client
            .post(&ocr_url)
            .json(&serde_json::json!({
                "image": base64_image
            }))
            .send()
            .await?;
        
        let ocr_status = ocr_response.status();
        let ocr_text = ocr_response.text().await?;
        println!("[DEBUG] OCR API response status: {}, body: {}", ocr_status, ocr_text);
        
        if !ocr_status.is_success() {
            return Err(format!("OCR API 请求失败: {}", ocr_status).into());
        }
        
        // 解析 JSON 响应
        let ocr_result: serde_json::Value = serde_json::from_str(&ocr_text)?;
        
        if ocr_result.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            if let Some(result) = ocr_result.get("result").and_then(|v| v.as_str()) {
                let captcha_code = result.trim().to_string();
                println!("[DEBUG] OCR recognized captcha: {}", captcha_code);
                return Ok(captcha_code);
            }
        }
        
        let error_msg = ocr_result.get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("未知错误");
        Err(format!("OCR 识别失败: {}", error_msg).into())
    }

    pub async fn login(
        &mut self,
        username: &str,
        password: &str,  // 原始明文密码！加密在此函数内完成
        captcha: &str,
        _lt: &str,        // 忽略前端传入的值
        _execution: &str, // 忽略前端传入的值
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, TARGET_SERVICE);
        println!("[DEBUG] Login URL: {}", login_url);
        println!("[DEBUG] Username: {}", username);
        println!("[DEBUG] Password length (plain): {}", password.len());

        // 缓存最近一次登录凭据（仅内存）
        self.last_username = Some(username.to_string());
        self.last_password = Some(password.to_string());
        
        // 1. 获取登录页面获取最新的 salt, execution, lt
        println!("[DEBUG] Fetching fresh login page for parameters...");
        let page_info = self.get_login_page().await?;
        
        let current_salt = page_info.salt;
        let current_execution = page_info.execution;
        let current_lt = page_info.lt;
        
        if current_salt.is_empty() {
            return Err("无法获取加密盐值".into());
        }
        
        println!("[DEBUG] Got fresh params - salt: {}, execution len: {}, lt: {}", 
            current_salt, current_execution.len(), current_lt);
        
        // 2. 在后端加密密码
        let encrypted_password = encrypt_password_aes(password, &current_salt)?;
        println!("[DEBUG] Password encrypted, length: {}", encrypted_password.len());
        
        // 3. 获取并识别验证码（如果未提供）
        let captcha_code = if captcha.is_empty() {
            println!("[DEBUG] Captcha empty, auto-fetching and recognizing...");
            match self.fetch_and_recognize_captcha().await {
                Ok(code) => {
                    println!("[DEBUG] OCR recognized captcha: {}", code);
                    code
                }
                Err(e) => {
                    println!("[DEBUG] OCR failed: {}, trying without captcha", e);
                    String::new()
                }
            }
        } else {
            captcha.to_string()
        };
        
        // 4. 构建表单数据
        let mut form_data = HashMap::new();
        form_data.insert("username".to_string(), username.to_string());
        form_data.insert("password".to_string(), encrypted_password);
        form_data.insert("_eventId".to_string(), "submit".to_string());
        form_data.insert("rmShown".to_string(), "1".to_string());
        
        if !captcha_code.is_empty() {
            form_data.insert("captcha".to_string(), captcha_code.clone());
            println!("[DEBUG] Using captcha: {}", captcha_code);
        }
        if !current_execution.is_empty() {
            form_data.insert("execution".to_string(), current_execution);
        }
        if !current_lt.is_empty() {
            form_data.insert("lt".to_string(), current_lt);
        }
        
        println!("[DEBUG] Form data keys: {:?}", form_data.keys().collect::<Vec<_>>());
        
        // 5. 提交登录请求
        let response = self.client
            .post(&login_url)
            .header("Referer", &login_url)
            .form(&form_data)
            .send()
            .await?;
        
        let response_url = response.url().to_string();
        let status = response.status();
        let html = response.text().await?;
        
        println!("[DEBUG] Login response status: {}", status);
        println!("[DEBUG] Login response URL: {}", response_url);
        println!("[DEBUG] Response length: {}", html.len());
        
        // 5. 错误检测（与 fast_auth.py 一致）
        if html.contains("验证码错误") || html.contains("验证码无效") {
            return Err("验证码错误".into());
        }
        if html.contains("密码错误") || html.contains("帐号或密码错误") || html.contains("认证失败") {
            return Err("用户名或密码错误".into());
        }
        if html.contains("账户被锁定") || html.contains("冻结") {
            return Err("账号已被锁定".into());
        }
        
        // 尝试提取 span#showErrorTip
        let login_error: Option<String> = {
            let document = Html::parse_document(&html);
            
            let error_selector = Selector::parse("span#showErrorTip").unwrap();
            if let Some(error_elem) = document.select(&error_selector).next() {
                let error_text: String = error_elem.text().collect::<String>().trim().to_string();
                if !error_text.is_empty() && !error_text.contains("用户名密码登录") {
                    println!("[DEBUG] Error from showErrorTip: {}", error_text);
                    Some(error_text)
                } else {
                    None
                }
            } else {
                None
            }
        };
        
        if let Some(err) = login_error {
            return Err(err.into());
        }

        // 明确的失败判定（避免继续走 SSO 导致“会话已过期”）
        if status.as_u16() == 401 {
            return Err("登录失败，请检查账号密码或验证码".into());
        }
        if response_url.contains("authserver/login") && html.contains("pwdEncryptSalt") {
            return Err("登录失败，请检查账号密码或验证码".into());
        }
        
        // 检查是否登录成功（URL 发生变化通常表示成功）
        if status.is_success()
            && (response_url.contains("ticket=") || response_url.contains("jwxt") || !response_url.contains("login"))
        {
            println!("[DEBUG] Login appears successful based on URL redirect");
        } else {
            // 备用错误检测
            if html.contains("认证失败") || html.contains("密码错误") || html.contains("帐号或密码错误") {
                return Err("用户名或密码错误".into());
            }
            
            if html.contains("验证码") && (html.contains("错误") || html.contains("无效")) {
                return Err("验证码错误".into());
            }
            
            if html.contains("账户被锁定") || html.contains("冻结") {
                return Err("账号已被锁定，请稍后再试".into());
            }
            
            // 如果仍然停留在登录页面但没有明确错误
            if html.contains("统一身份认证") && html.contains("pwdEncryptSalt") {
                println!("[DEBUG] Still on login page, login may have failed");
                return Err("登录失败，请检查账号密码和验证码".into());
            }
        }
        
        // 访问教务系统完成 SSO
        let jwxt_url = format!("{}/sso/jasiglogin", JWXT_BASE_URL);
        println!("[DEBUG] Accessing JWXT SSO: {}", jwxt_url);
        let _ = self.client.get(&jwxt_url).send().await?;

        println!("[DEBUG] Accessing JWXT service: {}", TARGET_SERVICE);
        let _ = self.client.get(TARGET_SERVICE).send().await?;
        
        // 获取用户信息（若会话未建立，补偿一次重试）
        let user_info = match self.fetch_user_info().await {
            Ok(info) => info,
            Err(err) => {
                let err_msg = err.to_string();
                if err_msg.contains("无法解析用户信息") {
                    println!("[DEBUG] User info parse failed, retrying SSO once");
                    let _ = self.client.get(&jwxt_url).send().await?;
                    let _ = self.client.get(TARGET_SERVICE).send().await?;
                    self.fetch_user_info().await?
                } else {
                    return Err(err);
                }
            }
        };
        
        self.is_logged_in = true;
        self.user_info = Some(user_info.clone());
        Ok(user_info)
    }

    async fn fetch_user_info(&self) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!("{}/admin/xsd/xsjbxx/xskp", JWXT_BASE_URL);
        println!("[DEBUG] Fetching user info from: {}", info_url);
        
        let response = self.client
            .get(&info_url)
            .header("Referer", "https://jwxt.hbut.edu.cn/admin/indexMain/M1402")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] User info response status: {}, URL: {}", status, final_url);

        if status.as_u16() != 200 {
            return Err(format!("获取个人信息失败: {}", status).into());
        }

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }

        let html = response.text().await?;
        println!("[DEBUG] User info HTML length: {}", html.len());
        
        match parser::parse_user_info(&html) {
            Ok(info) => {
                println!("[DEBUG] Parsed user info: {:?}", info);
                Ok(info)
            }
            Err(e) => {
                println!("[DEBUG] Failed to parse user info: {}", e);
                // 打印 HTML 的前 500 字符帮助调试
                println!("[DEBUG] HTML preview: {}", &html.chars().take(500).collect::<String>());
                Err(e)
            }
        }
    }

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
        
        Ok(user_info)
    }

    pub async fn refresh_session(&mut self) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let user_info = self.fetch_user_info().await?;
        self.is_logged_in = true;
        self.user_info = Some(user_info.clone());
        Ok(user_info)
    }

    pub fn get_cookies(&self) -> String {
        let url: Url = JWXT_BASE_URL.parse().unwrap();
        if let Some(header) = self.cookie_jar.cookies(&url) {
            header.to_str().unwrap_or("").to_string()
        } else {
            String::new()
        }
    }

    pub fn clear_session(&mut self) {
        self.is_logged_in = false;
        self.user_info = None;
    }

    /// 获取当前学期 (与 Python calendar.py 一致)
    /// 优先根据当前日期计算，而不是 API（因为 API 可能返回下学期）
    pub async fn get_current_semester(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // 先根据当前日期计算学期（更可靠）
        let now = chrono::Local::now();
        let year = now.year();
        let month = now.month();
        let day = now.day();
        
        // 学期划分逻辑（基于中国高校通用校历）：
        // - 第一学期：8月下旬 ~ 次年1月（寒假前）
        // - 第二学期：2月中旬 ~ 7月（暑假前）
        // 
        // 1月通常还在第一学期（期末考试/寒假），2月中旬才开始第二学期
        let (academic_year_start, term) = if month >= 9 {
            // 9-12月：当年第一学期
            (year, 1)
        } else if month >= 3 {
            // 3-7月：上一学年第二学期（开学后）
            (year - 1, 2)
        } else if month == 2 && day >= 15 {
            // 2月15日之后：上一学年第二学期（春季开学）
            (year - 1, 2)
        } else {
            // 1月 和 2月上旬：上一学年第一学期（寒假期间）
            (year - 1, 1)
        };
        
        let semester = format!("{}-{}-{}", academic_year_start, academic_year_start + 1, term);
        println!("[DEBUG] Calculated current semester based on date: {} (month={}, day={})", semester, month, day);
        Ok(semester)
    }

    fn extract_semester_from_json(json: &serde_json::Value) -> Option<String> {
        // 尝试多种格式
        if let Some(s) = json.get("xnxqh").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        if let Some(s) = json.get("xnxq").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        if let Some(s) = json.get("dataXnxq").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        if let Some(s) = json.get("xqhjc").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        // 嵌套 data 字段
        if let Some(data) = json.get("data") {
            return Self::extract_semester_from_json(data);
        }
        None
    }

    pub async fn fetch_grades(&self) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let grades_url = format!(
            "{}/admin/xsd/xsdcjcx/xsdQueryXscjList",
            JWXT_BASE_URL
        );
        
        println!("[DEBUG] Fetching grades from: {}", grades_url);
        
        // 使用正确的成绩查询参数
        let params = [
            ("fxbz", "0"),
            ("gridtype", "jqgrid"),
            ("queryFields", "id,xnxq,kcmc,xf,kcxz,kclx,ksxs,kcgs,xdxz,kclb,cjfxms,zhcj,hdxf,tscjzwmc,sfbk,cjlrjsxm,kcsx,fxcj,dztmlfjcj"),
            ("_search", "false"),
            ("page.size", "500"),
            ("page.pn", "1"),
            ("sort", "xnxq desc,id"),
            ("order", "desc"),
            ("startXnxq", "001"),
            ("endXnxq", "001"),
        ];
        
        let response = self.client
            .post(&grades_url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .form(&params)
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Grades response status: {}, URL: {}", status, final_url);
        
        // 检查是否被重定向到登录页
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let text = response.text().await?;
        println!("[DEBUG] Grades response length: {}", text.len());
        
        // 尝试解析 JSON
        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                println!("[DEBUG] Failed to parse grades JSON: {}", e);
                println!("[DEBUG] Response preview: {}", &text.chars().take(200).collect::<String>());
                return Err(format!("成绩数据解析失败: {}", e).into());
            }
        };
        
        parser::parse_grades(&json)
    }

    pub async fn fetch_schedule(&self) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
        // 1. 动态获取当前学期
        let semester = self.get_current_semester().await?;
        println!("[DEBUG] Using semester for schedule: {}", semester);
        
        // 2. 先获取 xhid（加密学号）
        let xhid_url = format!(
            "{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}",
            JWXT_BASE_URL, semester
        );
        
        println!("[DEBUG] Fetching xhid from: {}", xhid_url);
        
        let xhid_resp = self.client
            .get(&xhid_url)
            .header("Referer", format!("{}/admin/index.html", JWXT_BASE_URL))
            .send()
            .await?;
        
        let xhid_html = xhid_resp.text().await?;
        
        // 从 HTML 中提取 xhid
        let xhid = if let Some(cap) = regex::Regex::new(r#"xhid['\"]?\s*[:=]\s*['\"]([^'\"]+)['\"]"#)?
            .captures(&xhid_html) {
            cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default()
        } else if let Some(cap) = regex::Regex::new(r"WGEyQ[A-Za-z0-9]+")?
            .captures(&xhid_html) {
            cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
        } else {
            return Err("无法获取学号ID (xhid)".into());
        };
        
        println!("[DEBUG] Got xhid: {}", xhid);
        
        // 3. 使用正确的课表 API
        let schedule_url = format!(
            "{}/admin/pkgl/xskb/sdpkkbList",
            JWXT_BASE_URL
        );
        
        let params = [
            ("xnxq", semester.as_str()),
            ("xhid", &xhid),
            ("xqdm", "1"),
            ("zdzc", ""),
            ("zxzc", ""),
            ("xskbxslx", "0"),
        ];
        
        println!("[DEBUG] Fetching schedule from: {}", schedule_url);
        
        let response = self.client
            .get(&schedule_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}", JWXT_BASE_URL, semester))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Schedule response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let json: serde_json::Value = response.json().await?;
        println!("[DEBUG] Schedule response: ret={}, data count={}", 
            json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1),
            json.get("data").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
        );
        
        parser::parse_schedule(&json)
    }

    pub async fn fetch_exams(&self, semester: Option<&str>) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
        // 1. 动态获取当前学期或使用指定学期
        let semester = match semester {
            Some(s) if !s.trim().is_empty() => s.to_string(),
            _ => self.get_current_semester().await?,
        };
        println!("[DEBUG] Using semester for exams: {}", semester);
        
        // 使用正确的考试 API (与 Python 模块一致)
        let exams_url = format!(
            "{}/admin/xsd/kwglXsdKscx/ajaxXsksList",
            JWXT_BASE_URL
        );
        
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", "id,kcmc,ksrq,kssj,xnxq,jsmc,ksdd,zwh,sddz,ksrs,kslx,kslxmc,kscddz,kcxxdz"),
            ("_search", "false"),
            ("page.size", "100"),
            ("page.pn", "1"),
            ("sort", "ksrq"),
            ("order", "desc"),
            ("xnxq", semester.as_str()),
        ];
        
        println!("[DEBUG] Fetching exams from: {}", exams_url);
        
        let response = self.client
            .get(&exams_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/xsd/kwglXsdKscx", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Exams response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let json: serde_json::Value = response.json().await?;
        println!("[DEBUG] Exams response: ret={}, results count={}", 
            json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1),
            json.get("results").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
        );
        
        parser::parse_exams(&json)
    }

    pub async fn fetch_ranking(&self, student_id: Option<&str>, semester: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 使用正确的排名 API (与 Python 模块一致)
        let ranking_url = format!(
            "{}/admin/cjgl/xscjbbdy/getXscjpm",
            JWXT_BASE_URL
        );
        
        // 获取学号
        let xh = student_id.map(|s| s.to_string())
            .or_else(|| self.user_info.as_ref().map(|u| u.student_id.clone()))
            .unwrap_or_default();
        
        if xh.is_empty() {
            return Err("未提供学号".into());
        }
        
        // 从学号推断年级
        let grade = if xh.len() >= 2 {
            let prefix = &xh[..2];
            if prefix.chars().all(|c| c.is_ascii_digit()) {
                format!("20{}", prefix)
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        
        let semester_value = semester.unwrap_or("").to_string();
        
        let params = [
            ("xh", xh.as_str()),
            ("sznj", grade.as_str()),
            ("xnxq", semester_value.as_str()),
        ];
        
        println!("[DEBUG] Fetching ranking from: {} with params: {:?}", ranking_url, params);
        
        let response = self.client
            .get(&ranking_url)
            .query(&params)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Referer", format!("{}/admin/cjgl/xscjbbdy/xsgrcjpmlist1", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Ranking response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        
        // 解析 HTML
        parser::parse_ranking_html(&html, &xh, &semester_value, &grade)
    }

    pub async fn fetch_student_info(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!(
            "{}/admin/xsd/xsjbxx/xskp",
            JWXT_BASE_URL
        );
        
        println!("[DEBUG] Fetching student info from: {}", info_url);
        
        let response = self.client
            .get(&info_url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[DEBUG] Student info response status: {}, URL: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        parser::parse_student_info_html(&html)
    }

    pub async fn fetch_semesters(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 获取当前学期 (使用统一的方法)
        let current_semester = self.get_current_semester().await.unwrap_or_else(|_| {
            let now = chrono::Local::now();
            let year = now.year();
            let month = now.month();
            if month >= 9 {
                format!("{}-{}-1", year, year + 1)
            } else if month >= 2 {
                format!("{}-{}-2", year - 1, year)
            } else {
                format!("{}-{}-1", year - 1, year)
            }
        });
        
        // 生成学期列表 (近5年)
        let current_year: i32 = chrono::Local::now().format("%Y").to_string().parse().unwrap_or(2025);
        let mut semesters = vec![];
        
        for year in (current_year - 5)..=current_year {
            semesters.push(format!("{}-{}-2", year, year + 1));
            semesters.push(format!("{}-{}-1", year, year + 1));
        }
        semesters.reverse();
        
        // 确保当前学期在列表最前面（如果不存在则添加）
        if !semesters.contains(&current_semester) {
            semesters.insert(0, current_semester.clone());
        } else {
            // 将当前学期移到最前面
            semesters.retain(|s| s != &current_semester);
            semesters.insert(0, current_semester.clone());
        }
        
        Ok(serde_json::json!({
            "success": true,
            "semesters": semesters,
            "current": current_semester
        }))
    }

    pub async fn fetch_classroom_buildings(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 教学楼列表 (与 Python classroom.py 一致)
        let buildings = vec![
            serde_json::json!({"code": "", "name": "全部教学楼"}),
            serde_json::json!({"code": "4教", "name": "4教"}),
            serde_json::json!({"code": "5教", "name": "5教"}),
            serde_json::json!({"code": "6教", "name": "6教"}),
            serde_json::json!({"code": "8教", "name": "8教"}),
            serde_json::json!({"code": "2教", "name": "2教"}),
            serde_json::json!({"code": "3教", "name": "3教"}),
            serde_json::json!({"code": "艺术楼", "name": "艺术楼"}),
            serde_json::json!({"code": "电气学院楼", "name": "电气学院楼"}),
        ];
        
        Ok(serde_json::json!({
            "success": true,
            "data": buildings
        }))
    }

    pub async fn fetch_classrooms_query(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        building: Option<String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let classrooms_url = format!(
            "{}/admin/pkgl/jyjs/mobile/jsxx",
            JWXT_BASE_URL
        );
        
        // 从校历计算当前周次
        let now = chrono::Local::now();
        let default_weekday = now.weekday().num_days_from_monday() as i32 + 1; // 1=周一
        
        // 获取当前学期和校历数据来计算周次
        let semester = self.get_current_semester().await.unwrap_or_else(|_| "2025-2026-1".to_string());
        let calendar_data = self.fetch_calendar_data(Some(semester.clone())).await;
        let default_week = if let Ok(ref cal) = calendar_data {
            self.calculate_current_week(cal.get("data").unwrap_or(&serde_json::json!(null)))
        } else {
            1 // 如果无法获取校历，默认第1周
        };
        
        // 构建节次参数
        let jc_str = periods.as_ref()
            .filter(|p| !p.is_empty())
            .map(|p| p.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(","))
            .unwrap_or_else(|| "1,2,3,4,5,6,7,8,9,10,11".to_string());
        
        let week_val = week.unwrap_or(default_week);
        let weekday_val = weekday.unwrap_or(default_weekday);
        let building_str = building.clone().unwrap_or_default();
        
        // 使用 form 表单格式 (与 Python 一致)
        let params = [
            ("zcStr", week_val.to_string()),
            ("xqStr", weekday_val.to_string()),
            ("jcStr", jc_str.clone()),
            ("xqdm", "1".to_string()), // 校区: 1=本部
            ("xnxq", semester.clone()), // 使用动态学期
            ("type", "1".to_string()),
            ("jsrlMin", "".to_string()),
            ("jsrlMax", "".to_string()),
            ("jslx", "".to_string()),
            ("jsbq", "".to_string()),
            ("zylx", "".to_string()),
            ("pxfs", "5".to_string()), // 按座位数排序
        ];
        
        println!("[DEBUG] Fetching classrooms from: {} with params: {:?}", classrooms_url, params);
        
        let response = self.client
            .post(&classrooms_url)
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Origin", JWXT_BASE_URL)
            .header("Referer", format!("{}/admin/pkgl/jyjs/mobile/jysq?kjy=0&role=&cpdx=", JWXT_BASE_URL))
            .form(&params)
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }
        
        let data: serde_json::Value = response.json().await?;
        
        // 解析并格式化返回数据
        let mut classrooms = vec![];
        if let Some(arr) = data.as_array() {
            for room in arr {
                // 如果指定了教学楼，进行筛选
                if !building_str.is_empty() {
                    let jxlmc = room.get("jxlmc").and_then(|v| v.as_str()).unwrap_or("");
                    if !jxlmc.to_lowercase().contains(&building_str.to_lowercase()) {
                        continue;
                    }
                }
                
                classrooms.push(serde_json::json!({
                    "id": room.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                    "name": room.get("jsmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "code": room.get("jsbh").and_then(|v| v.as_str()).unwrap_or(""),
                    "building": room.get("jxlmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "campus": room.get("xqmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "seats": room.get("zdskrnrs").and_then(|v| v.as_i64()).unwrap_or(0),
                    "floor": room.get("szlc").and_then(|v| v.as_str()).unwrap_or(""),
                    "type": room.get("jslx").and_then(|v| v.as_str()).unwrap_or(""),
                    "department": room.get("jsglbmmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "status": if room.get("jyzt").and_then(|v| v.as_str()) == Some("0") { "可用" } else { "已借用" }
                }));
            }
        }
        
        // 计算星期几名称
        let weekday_names = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        let weekday_name = weekday_names.get(weekday_val as usize).unwrap_or(&"");
        
        // 解析节次
        let periods_vec: Vec<i32> = jc_str.split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        
        Ok(serde_json::json!({
            "success": true,
            "data": classrooms,
            "meta": {
                "semester": semester,
                "date_str": chrono::Local::now().format("%Y年%m月%d日").to_string(),
                "week": week_val,
                "weekday": weekday_val,
                "weekday_name": weekday_name,
                "periods": periods_vec,
                "periods_str": format!("第{}节", jc_str),
                "total": classrooms.len(),
                "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
            },
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }

    pub async fn fetch_training_plan_options(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 从培养方案页面获取真正的筛选选项 (与 Python training_plan.py 一致)
        let url = format!("{}/admin/xsd/studentpyfa", JWXT_BASE_URL);
        
        println!("[DEBUG] Fetching training plan options from: {}", url);
        
        let response = self.client
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await?;
        
        let final_url = response.url().to_string();
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        if !response.status().is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", response.status())
            }));
        }
        
        let html = response.text().await?;
        
        // 解析各个 select 选项
        let grade_options = self.extract_select_options(&html, "grade");
        let kkxq_options = self.extract_select_options(&html, "kkxq");
        let kkyx_options = self.extract_select_options(&html, "kkyx");
        let kcxz_options = self.extract_select_options(&html, "kcxz");
        let kcgs_options = self.extract_select_options(&html, "kcgs");
        
        // 根据学号推断默认年级
        let default_grade = self.user_info.as_ref()
            .and_then(|u| Self::infer_year_of_study(&u.student_id))
            .unwrap_or_default();
        
        // 推断默认学期
        let semester = self.get_current_semester().await.unwrap_or_default();
        let default_kkxq = Self::infer_term_from_semester(&semester);
        
        println!("[DEBUG] Training plan options: grade={} kkxq={} kkyx={} kcxz={} kcgs={}", 
            grade_options.len(), kkxq_options.len(), kkyx_options.len(), kcxz_options.len(), kcgs_options.len());
        
        Ok(serde_json::json!({
            "success": true,
            "options": {
                "grade": grade_options,
                "kkxq": kkxq_options,
                "kkyx": kkyx_options,
                "kcxz": kcxz_options,
                "kcgs": kcgs_options
            },
            "defaults": {
                "grade": default_grade,
                "kkxq": default_kkxq
            },
            "semester": semester
        }))
    }

    /// 从 HTML 中提取 select 选项 (与 Python training_plan.py 一致)
    fn extract_select_options(&self, html: &str, name: &str) -> Vec<serde_json::Value> {
        let pattern = format!(r#"<select[^>]*name="{}"[^>]*>([\s\S]*?)</select>"#, regex::escape(name));
        let select_re = regex::Regex::new(&pattern).ok();
        
        let mut options = vec![];
        
        if let Some(re) = select_re {
            if let Some(caps) = re.captures(html) {
                let select_html = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                
                // 提取所有 option
                let option_re = regex::Regex::new(r#"<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)</option>"#).unwrap();
                for cap in option_re.captures_iter(select_html) {
                    let value = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    let label = cap.get(2).map(|m| m.as_str()).unwrap_or("");
                    
                    // 清理标签内容
                    let clean_label = regex::Regex::new(r"<[^>]+>").unwrap()
                        .replace_all(label, "")
                        .trim()
                        .to_string();
                    
                    // 跳过空值选项（value为空的都跳过，因为前端会添加"请选择"）
                    if value.is_empty() {
                        continue;
                    }
                    
                    // 跳过空标签
                    if clean_label.is_empty() {
                        continue;
                    }
                    
                    options.push(serde_json::json!({
                        "value": value,
                        "label": clean_label
                    }));
                }
            }
        }
        
        options
    }

    /// 根据学号推断当前学年 (1-4)
    fn infer_year_of_study(student_id: &str) -> Option<String> {
        if student_id.len() < 2 {
            return None;
        }
        
        let prefix = &student_id[..2];
        if !prefix.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        
        let entry_year = 2000 + prefix.parse::<i32>().ok()?;
        let now = chrono::Local::now();
        let academic_year = if now.month() >= 9 { now.year() } else { now.year() - 1 };
        let mut year_of_study = academic_year - entry_year + 1;
        
        if year_of_study < 1 { year_of_study = 1; }
        if year_of_study > 4 { year_of_study = 4; }
        
        Some(year_of_study.to_string())
    }

    /// 从学期字符串推断学期序号 (如 "2024-2025-1" -> "1")
    fn infer_term_from_semester(semester: &str) -> String {
        if semester.is_empty() {
            return String::new();
        }
        let parts: Vec<&str> = semester.split('-').collect();
        if let Some(last) = parts.last() {
            if last.chars().all(|c| c.is_ascii_digit()) {
                return last.to_string();
            }
        }
        String::new()
    }

    pub async fn fetch_training_plan_jys(&self, yxid: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 获取教研室列表 (与 Python training_plan.py 一致)
        let url = format!("{}/admin/pygcgl/kckgl/queryJYSNoAuth", JWXT_BASE_URL);
        
        println!("[DEBUG] Fetching JYS from: {} with yxid={}", url, yxid);
        
        let response = self.client
            .get(&url)
            .query(&[("yxid", yxid)])
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .await?;
        
        let json: serde_json::Value = response.json().await?;
        
        // 转换格式
        let mut jys_list = vec![];
        if let Some(arr) = json.as_array() {
            for item in arr {
                let id = item.get("id").and_then(|v| v.as_str()).or_else(|| item.get("id").and_then(|v| v.as_i64()).map(|_| "")).unwrap_or("");
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if !id.is_empty() {
                    jys_list.push(serde_json::json!({
                        "value": id.to_string(),
                        "label": name
                    }));
                }
            }
        }
        
        Ok(serde_json::json!({
            "success": true,
            "data": jys_list
        }))
    }

    pub async fn fetch_training_plan_courses(
        &self,
        grade: Option<String>,
        kkxq: Option<String>,
        kkyx: Option<String>,
        kkjys: Option<String>,
        kcxz: Option<String>,
        kcgs: Option<String>,
        kcbh: Option<String>,
        kcmc: Option<String>,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/admin/xsd/studentpyfa/ajaxList2", JWXT_BASE_URL);
        
        let page_num = page.unwrap_or(1);
        let size = page_size.unwrap_or(50);
        
        let grade_str = grade.unwrap_or_default();
        let kkxq_str = kkxq.unwrap_or_default();
        let kkyx_str = kkyx.unwrap_or_default();
        let kkjys_str = kkjys.unwrap_or_default();
        let kcxz_str = kcxz.unwrap_or_default();
        let kcgs_str = kcgs.unwrap_or_default();
        let kcbh_str = kcbh.unwrap_or_default();
        let kcmc_str = kcmc.unwrap_or_default();
        let nd = chrono_timestamp().to_string();
        
        // 与 Python training_plan.py 完全一致的参数
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", "id,kcmc,kcxz,sfbx,kcgs,gradename,kkxq,yxxdxq,xf,zongxs,llxs,syxs,shangjxs,shijianxs,qtxs,kkyxmc,kkjysmc,zyfxmc,sfsjhj,sjzs,ksxs"),
            ("_search", "false"),
            ("nd", &nd),
            ("page.size", &size.to_string()),
            ("page.pn", &page_num.to_string()),
            ("sort", "id"),
            ("order", "asc"),
            ("grade", &grade_str),
            ("kkxq", &kkxq_str),
            ("kkyx", &kkyx_str),
            ("kkjys", &kkjys_str),
            ("kcxz", &kcxz_str),
            ("kcgs", &kcgs_str),
            ("kcbh", &kcbh_str),
            ("kcmc", &kcmc_str),
            ("query.grade||", &grade_str),
            ("query.kkxq||", &kkxq_str),
            ("query.kkyx||", &kkyx_str),
            ("query.kkjys||", &kkjys_str),
            ("query.kcxz||", &kcxz_str),
            ("query.kcgs||", &kcgs_str),
            ("query.kcbh||", &kcbh_str),
            ("query.kcmc||", &kcmc_str),
        ];
        
        println!("[DEBUG] Fetching training plan courses from: {}", url);
        
        let response = self.client
            .get(&url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/xsd/studentpyfa", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }
        
        let json: serde_json::Value = response.json().await?;
        
        // 解析 jqgrid 格式响应
        let results = json.get("results").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let total = json.get("total").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let total_pages = json.get("totalPages").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let current_page = json.get("page").and_then(|v| v.as_i64()).unwrap_or(page_num as i64) as i32;
        
        println!("[DEBUG] Training plan courses: {} results, page {}/{}", results.len(), current_page, total_pages);
        
        Ok(serde_json::json!({
            "success": true,
            "data": results,
            "page": current_page,
            "totalPages": total_pages,
            "total": total
        }))
    }

    pub async fn fetch_classrooms(&self) -> Result<Vec<crate::Classroom>, Box<dyn std::error::Error + Send + Sync>> {
        let classrooms_url = format!(
            "{}/cdjy/cdjy_cxKxcdlb.html?doType=query&gnmkdm=N2155",
            JWXT_BASE_URL
        );
        
        let response = self.client
            .post(&classrooms_url)
            .form(&[("xnm", "2024"), ("xqm", "12")])
            .send()
            .await?;
        
        let json: serde_json::Value = response.json().await?;
        parser::parse_classrooms(&json)
    }

    // ... existing methods ...

    pub async fn fetch_calendar(&self) -> Result<Vec<CalendarEvent>, Box<dyn std::error::Error + Send + Sync>> {
        // 校历数据通常是静态的，这里返回示例数据
        Ok(vec![
            CalendarEvent {
                date: "2024-09-02".to_string(),
                title: "开学日".to_string(),
                event_type: "event".to_string(),
            },
            CalendarEvent {
                date: "2024-10-01".to_string(),
                title: "国庆节".to_string(),
                event_type: "holiday".to_string(),
            },
            CalendarEvent {
                date: "2025-01-13".to_string(),
                title: "期末考试开始".to_string(),
                event_type: "exam".to_string(),
            },
        ])
    }

    /// 获取校历数据 (与 Python calendar.py 一致)
    pub async fn fetch_calendar_data(&self, semester: Option<String>) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 1. 获取当前学期 (如果未指定) - 使用基于日期的计算
        let sem = if let Some(s) = semester.filter(|s| !s.is_empty()) {
            s
        } else {
            // 使用基于日期的学期计算（更可靠）
            self.get_current_semester().await.unwrap_or_else(|_| "2024-2025-1".to_string())
        };

        println!("[DEBUG] Fetching calendar for semester: {}", sem);

        // 2. 获取校历数据
        let calendar_url = format!("{}/admin/xsd/jcsj/xlgl/getData/{}", JWXT_BASE_URL, sem);
        let response = self.client.get(&calendar_url).send().await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }

        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }

        let data: serde_json::Value = response.json().await?;
        
        // 计算当前周次
        let current_week = self.calculate_current_week(&data);
        
        // 构建元数据
        let meta = serde_json::json!({
            "semester": sem,
            "current_week": current_week,
            "total_weeks": data.as_array().map(|a| a.len()).unwrap_or(0)
        });
        
        Ok(serde_json::json!({
            "success": true,
            "data": data,
            "meta": meta,
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }

    fn calculate_current_week(&self, calendar_data: &serde_json::Value) -> i32 {
        if let Some(arr) = calendar_data.as_array() {
            let today = chrono::Local::now().date_naive();
            println!("[DEBUG] Calculating current week for date: {}", today);
            
            // 首先找到学期第一周的开始日期
            let mut semester_start: Option<chrono::NaiveDate> = None;
            for item in arr.iter() {
                let zc_num = item.get("zc")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0);
                
                if zc_num == 1 {
                    // 第一周的周一日期
                    if let Some(start) = self.parse_calendar_date(item, "monday") {
                        semester_start = Some(start);
                        println!("[DEBUG] Found semester start date: {}", start);
                        break;
                    }
                }
            }
            
            // 如果找到了学期开始日期，直接计算周次
            if let Some(start) = semester_start {
                let days = (today - start).num_days();
                if days < 0 {
                    println!("[DEBUG] Date is before semester start, returning week 1");
                    return 1;
                }
                let week = (days / 7 + 1) as i32;
                println!("[DEBUG] Calculated week {} (days from start: {})", week, days);
                return week.max(1).min(25);
            }
            
            // 备用方案：遍历每周，查找当前日期所在周
            for item in arr {
                let zc_num: i32 = item.get("zc")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0) as i32;
                
                if let (Some(start), Some(end)) = (
                    self.parse_calendar_date(item, "monday"),
                    self.parse_calendar_date(item, "sunday")
                ) {
                    if today >= start && today <= end {
                        println!("[DEBUG] Found current week {} ({} to {})", zc_num, start, end);
                        return zc_num;
                    }
                }
            }
        }
        println!("[DEBUG] Could not determine week from calendar, defaulting to 1");
        1 // 默认第1周
    }
    
    /// 解析校历中的日期（处理跨月情况）
    fn parse_calendar_date(&self, item: &serde_json::Value, day_field: &str) -> Option<chrono::NaiveDate> {
        let ny = item.get("ny").and_then(|v| v.as_str())?; // 格式: "2024-08" 或 "2024-09"
        let day_str = item.get(day_field).and_then(|v| v.as_str())?;
        
        if ny.is_empty() || day_str.is_empty() {
            return None;
        }
        
        // 尝试直接解析
        let date_str = format!("{}-{}", ny, day_str);
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
            return Some(date);
        }
        
        // 如果是两位数日期格式（如 "01"），补零解析
        let day: u32 = day_str.parse().ok()?;
        let parts: Vec<&str> = ny.split('-').collect();
        if parts.len() != 2 {
            return None;
        }
        
        let year: i32 = parts[0].parse().ok()?;
        let month: u32 = parts[1].parse().ok()?;
        
        // 检查日期是否合法（处理跨月情况）
        // 例如：ny="2024-08", monday="26", sunday="01"
        // 这时候 sunday 应该是下个月的 01
        if day <= 7 && day_field == "sunday" {
            // 可能是跨月，尝试下个月
            let next_month = if month == 12 { 1 } else { month + 1 };
            let next_year = if month == 12 { year + 1 } else { year };
            if let Some(date) = chrono::NaiveDate::from_ymd_opt(next_year, next_month, day) {
                return Some(date);
            }
        }
        
        chrono::NaiveDate::from_ymd_opt(year, month, day)
    }

    /// 获取学业完成情况 (与 Python academic_progress.py 一致)
    pub async fn fetch_academic_progress(&self, fasz: i32) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        println!("[DEBUG] Fetching academic progress with fasz={}", fasz);
        
        // 1. 获取 xhid
        let base_url = format!("{}/admin/xsd/xskp?fasz={}", JWXT_BASE_URL, fasz);
        let response = self.client.get(&base_url).send().await?;
        
        let final_url = response.url().to_string();
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        let html = response.text().await?;
        
        // 提取 xhid
        let xhid = regex::Regex::new(r#"id="xhid"\s+value="([^"]+)""#)?
            .captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .or_else(|| {
                regex::Regex::new(r#"xhid\s*[:=]\s*["']([^"']+)["']"#).ok()?
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
        let info_url = format!("{}/admin/xsd/xskp/xskp", JWXT_BASE_URL);
        let info_resp = self.client.get(&info_url)
            .query(&[("fasz", fasz.to_string()), ("xhid", xhid.clone())])
            .send()
            .await?;
        let info_data: serde_json::Value = info_resp.json().await.unwrap_or_default();
        
        // 3. 获取统计信息
        let summary_url = format!("{}/admin/xsd/xskp/xyqk", JWXT_BASE_URL);
        let summary_resp = self.client.get(&summary_url)
            .query(&[("fasz", fasz.to_string()), ("xhid", xhid.clone())])
            .send()
            .await?;
        let summary_data: serde_json::Value = summary_resp.json().await.unwrap_or_default();
        
        // 4. 获取树形数据
        let tree_url = format!("{}/admin/xsd/xskp/xyjc", JWXT_BASE_URL);
        let tree_resp = self.client.get(&tree_url)
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
    
    // ========== 电费部分 ==========

    async fn get_electricity_token(&mut self) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
        println!("[DEBUG] Starting electricity SSO flow...");
        
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
        let mut needs_login = false;
        
        // 1. 触发电费 SSO 流程
        let sso_url = "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2";
        println!("[DEBUG] Step 1: Starting SSO from {}", sso_url);
        
        const MAX_REDIRECTS: i32 = 15;
        for attempt in 0..2 {
            auth_token.clear();
            tid.clear();
            needs_login = false;

            let mut current_url = sso_url.to_string();
            let mut redirect_count = 0;

            // 手动跟踪重定向
            while redirect_count < MAX_REDIRECTS {
                redirect_count += 1;
                println!("[DEBUG] Redirect {}: {}", redirect_count, current_url);

                let response = no_redirect_client.get(&current_url)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .send()
                    .await?;

                let status = response.status();

                // 检查响应头中的 Authorization
                if let Some(token_header) = response.headers().get("Authorization") {
                    auth_token = token_header.to_str()?.to_string();
                    println!("[DEBUG] Got token from header: {}...", &auth_token.chars().take(30).collect::<String>());
                }

                // 提取 tid 从 URL 或 Location
                let url_str = response.url().to_string();
                if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(&url_str) {
                    tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    println!("[DEBUG] Got tid from URL: {}", tid);
                }

                // 检查是否需要重定向
                if status.is_redirection() {
                    if let Some(location) = response.headers().get("Location") {
                        let location_str = location.to_str()?;

                        // 从 Location 提取 tid
                        if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(location_str) {
                            tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                            println!("[DEBUG] Got tid from Location: {}", tid);
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
                            println!("[DEBUG] Reached final destination with tid");
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
                            println!("[DEBUG] Got tid from HTML: {}", tid);
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
                println!("[DEBUG] Electricity SSO requires login, re-login and retrying...");
                let relogin_ok = self.relogin_with_cached_credentials().await.unwrap_or(false);
                if relogin_ok {
                    continue;
                }
            }

            break;
        }

        // fallback: use normal client with redirects to get tid
        if tid.is_empty() {
            if let Ok(resp) = self.client.get(sso_url).send().await {
                let url_str = resp.url().to_string();
                if let Some(caps) = regex::Regex::new(r"tid=([^&]+)")?.captures(&url_str) {
                    tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                    println!("[DEBUG] Got tid from final URL: {}", tid);
                }
                if tid.is_empty() {
                    let html = resp.text().await.unwrap_or_default();
                    if let Some(caps) = regex::Regex::new(r#"tid=([^&"']+)"#)?.captures(&html) {
                        tid = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
                        println!("[DEBUG] Got tid from final HTML: {}", tid);
                    }
                }
            }
        }
        
        // 2. 如果有 tid，尝试多种方式交换 token (与 Python fast_auth.py 一致)
        if auth_token.is_empty() && !tid.is_empty() {
            println!("[DEBUG] Step 2: Exchanging tid for token using multiple methods");
            
            let referer_url = format!("https://code.hbut.edu.cn/?tid={}&orgId=2", tid);
            
            // 预先创建 URL 字符串，避免临时值借用问题
            let url_get1 = format!("https://code.hbut.edu.cn/server/auth/getToken?tid={}", tid);
            let url_get2 = format!("https://code.hbut.edu.cn/server/auth/getToken?tid={}&orgId=2", tid);
            let url_post = "https://code.hbut.edu.cn/server/auth/getToken".to_string();
            
            // 方法列表：先GET后POST，不同参数组合
            let token_urls: Vec<(&str, Option<serde_json::Value>)> = vec![
                // GET 方式
                (&url_get1, None),
                (&url_get2, None),
                // POST 方式
                (&url_post, Some(serde_json::json!({"tid": tid, "orgId": 2}))),
            ];
            
            for (url_str, post_body) in token_urls {
                let resp_result = if let Some(body) = post_body {
                    println!("[DEBUG] Trying POST: {}", url_str);
                    self.client.post(url_str)
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", &referer_url)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .header("Content-Type", "application/json")
                        .json(&body)
                        .send()
                        .await
                } else {
                    println!("[DEBUG] Trying GET: {}", url_str);
                    self.client.get(url_str)
                        .header("Origin", "https://code.hbut.edu.cn")
                        .header("Referer", &referer_url)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .send()
                        .await
                };
                
                if let Ok(resp) = resp_result {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        println!("[DEBUG] Token exchange response: {:?}", json);
                        
                        if json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                            if let Some(result_data) = json.get("resultData") {
                                auth_token = result_data.get("accessToken")
                                    .or(result_data.get("token"))
                                    .or(result_data.get("access_token"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_default();
                                
                                if !auth_token.is_empty() {
                                    println!("[DEBUG] Got token from exchange: {}...", &auth_token.chars().take(30).collect::<String>());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            // 尝试 getLoginUser 接口
            if auth_token.is_empty() {
                println!("[DEBUG] Trying getLoginUser endpoint");
                if let Ok(resp) = self.client.get("https://code.hbut.edu.cn/server/auth/getLoginUser")
                    .header("Origin", "https://code.hbut.edu.cn")
                    .header("Referer", &referer_url)
                    .send()
                    .await 
                {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        println!("[DEBUG] getLoginUser response: {:?}", json);
                        if json.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                            if let Some(result_data) = json.get("resultData") {
                                auth_token = result_data.get("accessToken")
                                    .or(result_data.get("token"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_default();
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
                println!("[DEBUG] Got token from cookie");
            }
        }
        
        if auth_token.is_empty() {
            return Err(format!("无法获取电费 Authorization Token (tid={})", tid).into());
        }
        
        println!("[DEBUG] Electricity token obtained successfully");
        Ok((auth_token, cookies))
    }

    pub async fn ensure_electricity_token(&mut self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        const TOKEN_TTL: std::time::Duration = std::time::Duration::from_secs(300); // 5分钟
        if let (Some(token), Some(instant)) = (&self.electricity_token, &self.electricity_token_at) {
            if instant.elapsed() < TOKEN_TTL {
                return Ok(token.clone());
            }
        }

        let token_result = self.get_electricity_token().await;
        let (token, _) = match token_result {
            Ok(res) => res,
            Err(err) => {
                println!("[DEBUG] Electricity token failed, trying relogin: {}", err);
                let _ = self.relogin_with_cached_credentials().await;
                self.get_electricity_token().await?
            }
        };
        self.electricity_token = Some(token.clone());
        self.electricity_token_at = Some(std::time::Instant::now());
        Ok(token)
    }

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

    pub async fn fetch_electricity_balance(&mut self, room_id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let (token, _) = self.get_electricity_token().await?;
        
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

fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_password() {
        let password = "TRTtVVWj4-AiGqA";
        let salt = "bs2jwEB0FWpj6MW0";
        
        let result = encrypt_password_aes(password, salt).unwrap();
        
        println!("Password: {} (len: {})", password, password.len());
        println!("Salt: {}", salt);
        println!("Encrypted: {} (len: {})", result, result.len());
        
        // 正确的加密结果应该是 108 字符
        // 64 字节随机前缀 + 15 字节密码 = 79 字节
        // PKCS7 填充到 80 字节
        // Base64(80) = 108 字符
        assert_eq!(result.len(), 108, "Encrypted password should be 108 chars, got {}", result.len());
    }
}
