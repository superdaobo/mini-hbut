//! 登录与验证码模块。
//!
//! 负责：
//! - 获取登录页与隐藏表单参数（lt / execution / salt）
//! - 判断是否需要验证码
//! - OCR 识别验证码并组装登录表单
//! - 支持指定 service 的 CAS 登录（用于电费/一码通等）
//!
//! 注意：
//! - 登录请求必须复用 Cookie，避免 CAS 会话丢失
//! - 日志不输出 execution 全量内容（仅长度）

use super::*;
use base64::Engine;
use scraper::{Html, Selector};
use std::collections::HashMap;

use super::utils::chrono_timestamp;

impl HbutClient {
    /// 获取默认登录页并解析参数
    pub async fn get_login_page(&mut self) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        self.get_login_page_with_service(TARGET_SERVICE).await
    }

    /// 获取指定 service 的登录页并解析参数
    pub async fn get_login_page_with_service(&mut self, service_url: &str) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        let encoded_service = urlencoding::encode(service_url);
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, encoded_service);
        println!("[调试] 获取登录页: {}", login_url);
        
        let response = self.client.get(&login_url).send().await?;
        let status = response.status();
        let final_url = response.url().to_string();
        let html = response.text().await?;
        if html.contains("IP冻结") || html.contains("ip-freeze") || html.contains("ip冻结") {
            return Err("服务器 IP 被学校冻结，请稍后再试或联系管理员".into());
        }
        println!("[调试] 登录页状态: {}, final_url: {}", status, final_url);

        // 检测是否已经登录（根据 URL 跳转或页面内容）
        let is_already_logged_in = !final_url.contains("authserver/login") || final_url.contains("ticket=") || final_url.contains("code.hbut.edu.cn/server/auth/host/open");
        if is_already_logged_in {
            println!("[调试] 检测到已登录状态（已跳转到服务或拿到票据）");
        }

        // 解析并缓存表单 inputs（用于后续登录提交）
        let mut inputs = HashMap::new();
        let input_selector = Selector::parse("input").unwrap();
        let document = Html::parse_document(&html);
        
        // DEBUG: Dump form inputs
        println!("[调试] 解析登录页表单...");
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

        let lt = if lt.is_empty() {
            regex::Regex::new(r#"name='lt'\s+value='([^']*)'"#)
                .ok()
                .and_then(|re| re.captures(&html))
                .and_then(|cap| cap.get(1))
                .map(|m| m.as_str().to_string())
                .unwrap_or_default()
        } else {
            lt
        };

        let execution = if execution.is_empty() {
            regex::Regex::new(r#"name='execution'\s+value='([^']*)'"#)
                .ok()
                .and_then(|re| re.captures(&html))
                .and_then(|cap| cap.get(1))
                .map(|m| m.as_str().to_string())
                .or_else(|| {
                    regex::Regex::new(r#"execution\s*[:=]\s*\"([^\"]+)\""#)
                        .ok()
                        .and_then(|re| re.captures(&html))
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                })
                .unwrap_or_default()
        } else {
            execution
        };

        let salt = if salt.is_empty() {
            let salt_from_selector = Selector::parse("#pwdDefaultEncryptSalt").ok()
                .and_then(|sel| document.select(&sel).next())
                .and_then(|el| el.value().attr("value"))
                .map(|s| s.to_string())
                .unwrap_or_default();

            if !salt_from_selector.is_empty() {
                salt_from_selector
            } else {
                regex::Regex::new(r#"id='pwdEncryptSalt'\s+value='([^']*)'"#)
                    .ok()
                    .and_then(|re| re.captures(&html))
                    .and_then(|cap| cap.get(1))
                    .map(|m| m.as_str().to_string())
                    .or_else(|| {
                        regex::Regex::new(r#"pwd(Default)?EncryptSalt\s*[:=]\s*\"([^\"]+)\""#)
                            .ok()
                            .and_then(|re| re.captures(&html))
                            .and_then(|cap| cap.get(2))
                            .map(|m| m.as_str().to_string())
                    })
                    .unwrap_or_default()
            }
        } else {
            salt
        };
        

        println!(
            "[调试] 登录页参数: lt={}, execution长度={}, salt={}",
            lt,
            execution.len(),
            salt
        );

        if salt.is_empty() || execution.is_empty() {
            let debug_path = std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("debug_login_page_tauri.html");
            let _ = std::fs::write(&debug_path, &html);
            println!(
                "[调试] 登录页参数缺失, wrote {} (len={})",
                debug_path.display(),
                html.len()
            );
        }
        
        // 检查是否需要验证码
        let captcha_required = html.contains("captchaResponse") 
            || html.contains("getCaptcha") 
            || inputs.contains_key("captchaResponse")
            || inputs.contains_key("captcha")
            || document.select(&Selector::parse("#captchaResponse").unwrap()).next().is_some()
            || document.select(&Selector::parse("#c_response").unwrap()).next().is_some();
            
        println!("[调试] 需要验证码: {}", captcha_required);
        
        if !inputs.is_empty() {
            println!(
                "[调试] 登录页输入字段: {:?}",
                inputs.keys().collect::<Vec<_>>()
            );
            self.last_login_inputs = Some(inputs);
        }
        
        Ok(LoginPageInfo {
            lt,
            execution,
            captcha_required,
            salt,
            is_already_logged_in,
        })
    }

    /// 使用指定 service 发起 CAS 登录，返回用户信息
    pub async fn login_for_service(&mut self, username: &str, password: &str, service_url: &str) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let encoded_service = urlencoding::encode(service_url);
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, encoded_service);
        println!("[调试] 登录地址（服务）: {}", login_url);
        println!("[调试] 用户名: {}", username);
        println!("[调试] 密码长度 (plain): {}", password.len());

        // 缓存最近一次登录凭据（仅内存）
        self.last_username = Some(username.to_string());
        self.last_password = Some(password.to_string());

        println!("[调试] 开始服务登录: {}", service_url);
        let cookies_before = self.get_cookies();
        println!("[调试] 登录前 Cookie: {}", cookies_before);

        let max_attempts = 3;
        for attempt in 0..max_attempts {
            // 获取登录页面参数（execution 一次性），增加重试次数以应对验证码识别错误
            let page_info = self.get_login_page_with_service(service_url).await?;
            let current_salt = page_info.salt;
            let current_execution = page_info.execution;
            let current_lt = page_info.lt;

            // 如果已经登录，直接跳过 POST 步骤
            if page_info.is_already_logged_in {
                 println!("[调试] 已登录（获取登录页时检测到），跳过登录 POST");
                 break;
            }

            if current_salt.is_empty() {
                return Err("无法获取加密盐值".into());
            }

            // 加密密码
            let encrypted_password = encrypt_password_aes(password, &current_salt)?;

            let mut form_data = self.last_login_inputs.clone().unwrap_or_default();

            let set_key = |map: &mut HashMap<String, String>, keys: &[&str], default_key: &str, value: String| {
                for key in keys {
                    if map.contains_key(*key) {
                        map.insert((*key).to_string(), value.clone());
                        return;
                    }
                }
                map.insert(default_key.to_string(), value);
            };
            let set_all_keys = |map: &mut HashMap<String, String>, keys: &[&str], default_key: &str, value: &str| {
                let mut set_any = false;
                for key in keys {
                    if map.contains_key(*key) {
                        map.insert((*key).to_string(), value.to_string());
                        set_any = true;
                    }
                }
                if !set_any {
                    map.insert(default_key.to_string(), value.to_string());
                }
            };

            set_key(&mut form_data, &["username", "username", "loginname"], "username", username.to_string());
            set_key(&mut form_data, &["password", "passwd"], "password", encrypted_password);
            // 若页面存在 passwordText 字段，填入明文以贴近官方表单
            if form_data.contains_key("passwordText") {
                set_key(&mut form_data, &["passwordText"], "passwordText", password.to_string());
            }
            set_key(&mut form_data, &["cllt"], "cllt", "userNameLogin".to_string());
            set_key(&mut form_data, &["dllt"], "dllt", "generalLogin".to_string());
            if !current_execution.is_empty() {
                set_key(&mut form_data, &["execution"], "execution", current_execution);
            }
            if !current_lt.is_empty() {
                set_key(&mut form_data, &["lt"], "lt", current_lt);
            }
            set_key(&mut form_data, &["_eventId"], "_eventId", "submit".to_string());
            set_key(&mut form_data, &["rmShown"], "rmShown", "1".to_string());

            if page_info.captcha_required {
                let captcha_code = self.fetch_and_recognize_captcha().await.unwrap_or_default();
                let captcha_code = captcha_code.trim().to_string();
                if !captcha_code.is_empty() {
                    set_all_keys(&mut form_data, &["captcha", "captchaResponse", "c_response"], "captcha", &captcha_code);
                }
            }

            let response = self.client
                .post(&login_url)
                .header("Referer", &login_url)
                .form(&form_data)
                .send()
                .await?;

            let response_url = response.url().to_string();
            let status = response.status();
            let html = response.text().await?;

            if html.contains("验证码错误") || html.contains("验证码无效") {
                if attempt + 1 < max_attempts {
                    println!("[调试] 验证码错误，重试... ({}/{})", attempt + 1, max_attempts);
                    continue;
                }
                return Err("验证码错误，请重新登录".into());
            }
            if html.contains("密码错误") || html.contains("帐号或密码错误") || html.contains("认证失败") {
                return Err("username或密码错误".into());
            }
            if html.contains("账户被锁定") || html.contains("冻结") {
                return Err("账号已被锁定".into());
            }
            if status.as_u16() == 401 {
                return Err("登录失败，请检查账号密码或验证码".into());
            }

            let is_on_auth_page = response_url.contains("authserver/login")
                || response_url.contains("auth.hbut.edu.cn")
                || html.contains("统一身份认证")
                || html.contains("pwdEncryptSalt");

            if is_on_auth_page {
                if service_url.contains("code.hbut.edu.cn") {
                    if self.check_code_login().await {
                        println!("[调试] code 服务登录验证通过 via getLoginUser");
                        break;
                    }
                }
                if attempt + 1 < max_attempts {
                    println!("[调试] 仍在登录页，重试... ({}/{})", attempt + 1, max_attempts);
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }

            // 验证是否已建立 CAS 会话（避免 OCR 误识导致“看似成功”）
            let verify_url = format!("{}/login?service={}", AUTH_BASE_URL, urlencoding::encode(service_url));
            let verify_resp = self.client.get(&verify_url).send().await?;
            let verify_final = verify_resp.url().to_string();
            if verify_final.contains("authserver/login") {
                if service_url.contains("code.hbut.edu.cn") && self.check_code_login().await {
                    println!("[调试] CAS 校验重定向 but code 会话 is valid");
                    break;
                }
                if attempt + 1 < max_attempts {
                    println!("[警告] CAS 会话未建立，重试... ({}/{})", attempt + 1, max_attempts);
                    continue;
                }
                return Err("登录未生效，请重试或稍后再试".into());
            }

            break;
        }

        // 成功登录后尝试获取用户信息（如不可用则忽略）
        if service_url.contains("jwxt.hbut.edu.cn") {
            let jwxt_url = format!("{}/sso/jasiglogin", JWXT_BASE_URL);
            println!("[调试] 访问教务 SSO: {}", jwxt_url);
            let _ = self.client.get(&jwxt_url).send().await?;

            println!("[调试] 访问教务服务: {}", TARGET_SERVICE);
            let _ = self.client.get(TARGET_SERVICE).send().await?;
            
            // 获取用户信息（若会话未建立，补偿一次重试）
            let user_info = match self.fetch_user_info().await {
                Ok(info) => info,
                Err(err) => {
                    let err_msg = err.to_string();
                    if err_msg.contains("无法解析用户信息") {
                        println!("[调试] 用户信息解析失败，补偿一次 SSO 请求");
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
            self.save_cookie_snapshot_to_file();
            return Ok(user_info);
        } else {
             println!("[调试] 服务登录成功: {}", service_url);
             self.is_logged_in = true;
             self.save_cookie_snapshot_to_file();
             // 尝试从缓存返回用户信息 (若无则返回仅包含学号的默认信息)
             return Ok(self.user_info.clone().unwrap_or(UserInfo {
                student_id: username.to_string(),
                student_name: String::new(),
                college: None,
                major: None,
                class_name: None,
                grade: None,
            }));
        }
    }
    


    /// 获取验证码图片并返回 Base64 字符串
    pub async fn get_captcha(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let captcha_url = format!("{}/getCaptcha.htl?{}", AUTH_BASE_URL, chrono_timestamp());
        println!("[调试] 获取 captcha： {}", captcha_url);
        
        let response = self.client.get(&captcha_url).send().await?;
        let status = response.status();
        println!("[调试] 验证码响应状态: {}", status);
        
        let bytes = response.bytes().await?;
        println!("[调试] 验证码字节长度: {}", bytes.len());
        
        if bytes.is_empty() || bytes.len() < 100 {
            return Err(format!("Captcha image is too small: {} bytes", bytes.len()).into());
        }
        
        let base64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
        println!("[调试] 验证码 Base64 长度: {}", base64_str.len());
        
        Ok(format!("data:image/png;base64,{}", base64_str))
    }

    /// 检查是否已具备 code 服务登录会话
    async fn check_code_login(&self) -> bool {
        let url = "https://code.hbut.edu.cn/server/auth/getLoginUser";
        let resp = self.client.get(url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .send()
            .await;
        if let Ok(resp) = resp {
            if let Ok(text) = resp.text().await {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    return json.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                }
            }
        }
        false
    }

    /// 获取验证码并调用服务器 OCR API 识别
    /// 拉取验证码并调用 OCR 识别
    async fn fetch_and_recognize_captcha(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let captcha_url = format!("{}/getCaptcha.htl?{}", AUTH_BASE_URL, chrono_timestamp());
        println!("[调试] 获取验证码用于 OCR: {}", captcha_url);
        
        let response = self.client.get(&captcha_url).send().await?;
        let bytes = response.bytes().await?;
        
        if bytes.is_empty() || bytes.len() < 100 {
            return Err("验证码图片太小".into());
        }
        
        println!("[调试] 验证码图片大小: {} bytes", bytes.len());
        
        // 将验证码图片转为 Base64
        let base64_image = base64::engine::general_purpose::STANDARD.encode(&bytes);
        
        // 调用服务器 OCR API（可由前端配置覆盖）
        let default_ocr = "http://1.94.167.18:5080/api/ocr/recognize";
        let endpoint = self.ocr_endpoint.as_deref().unwrap_or(default_ocr);
        let ocr_url = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
            if endpoint.contains("/api/ocr/recognize") {
                endpoint.to_string()
            } else {
                format!("{}/api/ocr/recognize", endpoint.trim_end_matches('/'))
            }
        } else {
            format!("http://{}/api/ocr/recognize", endpoint.trim_end_matches('/'))
        };
        println!("[调试] 调用 OCR 服务: {}", ocr_url);
        
        // 使用独立 OCR 客户端（不带 cookie）
        let ocr_response = self.ocr_client
            .post(&ocr_url)
            .json(&serde_json::json!({
                "image": base64_image
            }))
            .send()
            .await?;
        
        let ocr_status = ocr_response.status();
        let ocr_text = ocr_response.text().await?;
        println!("[调试] OCR 返回状态: {}, body: {}", ocr_status, ocr_text);
        
        if !ocr_status.is_success() {
            return Err(format!("OCR API 请求失败: {}", ocr_status).into());
        }
        
        // 解析 JSON 响应
        let ocr_result: serde_json::Value = serde_json::from_str(&ocr_text)?;
        
        if ocr_result.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            if let Some(result) = ocr_result.get("result").and_then(|v| v.as_str()) {
                let captcha_code = result.trim().to_string();
                println!("[调试] OCR 识别验证码: {}", captcha_code);
                return Ok(captcha_code);
            }
        }
        
        let error_msg = ocr_result.get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("未知错误");
        Err(format!("OCR 识别失败: {}", error_msg).into())
    }

    /// 主登录入口（含验证码流程与会话保存）
    pub async fn login(
        &mut self,
        username: &str,
        password: &str,  // 原始明文密码！加密在此函数内完成
        captcha_input: &str,
        _lt: &str,        // 忽略前端传入的值
        _execution: &str, // 忽略前端传入的值
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, TARGET_SERVICE);
        println!("[调试] 登录地址: {}", login_url);
        println!("[调试] 用户名: {}", username);
        println!("[调试] 密码长度 (plain): {}", password.len());

        // 缓存最近一次登录凭据（仅内存）
        self.last_username = Some(username.to_string());
        self.last_password = Some(password.to_string());
        
        // 1. 获取登录页面获取最新的 salt, execution, lt
        println!("[调试] 获取登录页参数...");

        let max_retries = 2;
        for attempt in 0..max_retries {
            let page_info = self.get_login_page().await?;
            // get_login_page 使用 TARGET_SERVICE，如果已经登录会跳转到 JWXT
            if page_info.is_already_logged_in {
                println!("[调试] 已登录（检测到），跳过登录 POST");
                let user_info = self.fetch_user_info().await?;
                self.is_logged_in = true;
                self.user_info = Some(user_info.clone());
                self.save_cookie_snapshot_to_file();
                return Ok(user_info);
            }
            
            let current_salt = page_info.salt;
            let current_execution = page_info.execution;
            let current_lt = page_info.lt;
            let captcha_required = page_info.captcha_required;
            
            if current_salt.is_empty() {
                return Err("无法获取加密盐值".into());
            }
            
            println!("[调试] 获取到新参数 - salt: {}, execution长度: {}, lt: {}", 
                current_salt, current_execution.len(), current_lt);
            
            // 2. 在后端加密密码
            let encrypted_password = encrypt_password_aes(password, &current_salt)?;
            println!("[调试] 密码已加密, length: {}", encrypted_password.len());
            
            // 3. 获取并识别验证码（始终后端 OCR）
            let captcha_code = if captcha_required {
                if !captcha_input.trim().is_empty() {
                    println!("[调试] 需要验证码, using user input.");
                    captcha_input.trim().to_string()
                } else {
                    println!("[调试] 需要验证码, auto-fetching and recognizing...");
                    match self.fetch_and_recognize_captcha().await {
                        Ok(code) => {
                            println!("[调试] OCR 识别验证码: {}", code);
                            code
                        }
                        Err(e) => {
                            println!("[调试] OCR 失败: {}, trying without captcha", e);
                            String::new()
                        }
                    }
                }
            } else {
                String::new()
            };

            if captcha_required {
                let trimmed = captcha_code.trim();
                if trimmed.len() < 4 {
                    println!("[调试] OCR 验证码长度异常，重新获取验证码");
                    if attempt + 1 < max_retries {
                        continue;
                    }
                }
            }
            
            // 4. 构建表单数据（复用登录页隐藏字段）
            let mut form_data = self.last_login_inputs.clone().unwrap_or_default();

        let set_key = |map: &mut HashMap<String, String>, keys: &[&str], default_key: &str, value: String| {
            for key in keys {
                if map.contains_key(*key) {
                    map.insert((*key).to_string(), value.clone());
                    return;
                }
            }
            map.insert(default_key.to_string(), value);
        };
        let set_all_keys = |map: &mut HashMap<String, String>, keys: &[&str], default_key: &str, value: &str| {
            let mut set_any = false;
            for key in keys {
                if map.contains_key(*key) {
                    map.insert((*key).to_string(), value.to_string());
                    set_any = true;
                }
            }
            if !set_any {
                map.insert(default_key.to_string(), value.to_string());
            }
        };

        set_key(&mut form_data, &["username", "username", "loginname"], "username", username.to_string());
        set_key(&mut form_data, &["password", "passwd"], "password", encrypted_password);
        // 若页面存在 passwordText 字段，填入明文以贴近官方表单
        if form_data.contains_key("passwordText") {
            set_key(&mut form_data, &["passwordText"], "passwordText", password.to_string());
        }
        // 强制使用username登录模式，避免落入 dynamic/fido/qr 登录流程
        set_key(&mut form_data, &["cllt"], "cllt", "userNameLogin".to_string());
        set_key(&mut form_data, &["dllt"], "dllt", "generalLogin".to_string());
        set_key(&mut form_data, &["_eventId"], "_eventId", "submit".to_string());
        set_key(&mut form_data, &["rmShown"], "rmShown", "1".to_string());

        // 保留登录页原始 cllt 值（与 fast_auth.py 对齐）

        // 与 fast_auth.py 对齐：仅在有值时覆盖 execution/lt
        if !current_execution.is_empty() {
            set_key(&mut form_data, &["execution"], "execution", current_execution);
        }
        if !current_lt.is_empty() {
            set_key(&mut form_data, &["lt"], "lt", current_lt);
        }

        if !captcha_code.is_empty() {
            let captcha_clean = captcha_code.trim();
            set_all_keys(&mut form_data, &["captcha", "captchaResponse", "c_response"], "captcha", captcha_clean);
            println!("[调试] 使用验证码: {}", captcha_clean);
        }

        // 保留登录页隐藏字段（即使为空），某些学校 CAS 会校验字段存在性

        // 若页面默认是扫码登录(qrLogin)，改为username登录，避免 CAS 在 realSubmit 处 NPE
        if let Some(v) = form_data.get("cllt") {
            if v == "qrLogin" {
                form_data.insert("cllt".to_string(), "userNameLogin".to_string());
            }
        }
        
        let debug_keys = ["cllt", "dllt", "uuid", "responseJson", "dynamicCode", "lt", "execution"];
        let mut debug_fields: Vec<String> = Vec::new();
        for k in debug_keys {
            if let Some(v) = form_data.get(k) {
                let display = if k == "execution" { format!("{}(len={})", k, v.len()) } else { format!("{}={}", k, v) };
                debug_fields.push(display);
            }
        }
            println!("[调试] 表单字段名: {:?}", form_data.keys().collect::<Vec<_>>());
            if !debug_fields.is_empty() {
                println!("[调试] 表单字段值: {}", debug_fields.join(", "));
            }
            
            // 5. 提交登录请求
            println!("[调试] 发送登录 POST 请求...");
            let response = self.client
                .post(&login_url)
                .header("Referer", &login_url)
                .form(&form_data)
                .send()
                .await?;
            
            println!("[调试] 登录请求已发送，处理响应...");
            let response_url = response.url().to_string();
            let status = response.status();
            let html = response.text().await?;
        
            println!("[调试] 登录响应状态: {}, 最终地址: {}", status, response_url);
            println!("[调试] 响应 HTML 长度: {}", html.len());
            // 如果长度较短(<1000)，打印出来看看
            if html.len() < 1000 {
                println!("[调试] 响应 HTML 片段: {}", html);
            }

        if status.as_u16() >= 400 {
            let debug_path = std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("debug_login_error_response_tauri.html");
            let _ = std::fs::write(&debug_path, &html);
            println!(
                "[调试] 登录响应状态 >=400, wrote {} (len={})",
                debug_path.display(),
                html.len()
            );
        }

        if html.contains("IP冻结") || html.contains("ip-freeze") || html.contains("ip冻结") {
            return Err("服务器 IP 被学校冻结，请稍后再试或联系管理员".into());
        }

        if status.as_u16() >= 500 {
            let debug_path = std::env::current_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("debug_login_response_tauri.html");
            let _ = std::fs::write(&debug_path, &html);
            println!(
                "[调试] 登录响应状态 >=500, wrote {} (len={})",
                debug_path.display(),
                html.len()
            );
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&html) {
                if let Some(message) = json.get("message").and_then(|v| v.as_str()) {
                    return Err(format!("登录失败: {}", message).into());
                }
                if let Some(error) = json.get("error").and_then(|v| v.as_str()) {
                    return Err(format!("登录失败: {}", error).into());
                }
            }
            return Err("登录失败，认证服务返回 5xx".into());
        }
        
        // 5. 错误检测（与 fast_auth.py 一致）
            if html.contains("验证码错误") || html.contains("验证码无效") {
                if attempt + 1 < max_retries {
                    println!("[调试] 验证码错误，重试... ({}/{})", attempt + 1, max_retries);
                    continue;
                }
                return Err("验证码错误".into());
            }
            if html.contains("密码错误") || html.contains("帐号或密码错误") || html.contains("认证失败") {
                return Err("username或密码错误".into());
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
                if !error_text.is_empty() && !error_text.contains("username密码登录") {
                    println!("[调试] Error showErrorTip: {}", error_text);
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
                let debug_path = std::env::current_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("debug_login_401_response_tauri.html");
                let _ = std::fs::write(&debug_path, &html);
                println!(
                    "[调试] 登录响应状态 401, wrote {} (len={})",
                    debug_path.display(),
                    html.len()
                );
                if attempt + 1 < max_retries {
                    println!("[调试] 401 未授权，重试... ({}/{})", attempt + 1, max_retries);
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }
            if response_url.contains("authserver/login") && html.contains("pwdEncryptSalt") {
                if attempt + 1 < max_retries {
                    println!("[调试] 仍在登录页，重试... ({}/{})", attempt + 1, max_retries);
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }
        
        // 检查是否登录成功（URL 发生变化通常表示成功）
            if status.is_success()
                && (response_url.contains("ticket=") || response_url.contains("jwxt") || !response_url.contains("login"))
            {
                println!("[调试] 登录成功（基于重定向）");
            } else {
                // 备用错误检测
                if html.contains("认证失败") || html.contains("密码错误") || html.contains("帐号或密码错误") {
                    return Err("username或密码错误".into());
                }
                
                if html.contains("验证码") && (html.contains("错误") || html.contains("无效")) {
                    if attempt + 1 < max_retries {
                        println!("[调试] 验证码错误（兜底），重试... ({}/{})", attempt + 1, max_retries);
                        continue;
                    }
                    return Err("验证码错误".into());
                }
                
                if html.contains("账户被锁定") || html.contains("冻结") {
                    return Err("账号已被锁定，请稍后再试".into());
                }
                
                // 如果仍然停留在登录页面但没有明确错误
                if html.contains("统一身份认证") && html.contains("pwdEncryptSalt") {
                    println!("[调试] 仍在登录页, login may have failed");
                    if attempt + 1 < max_retries {
                        continue;
                    }
                    return Err("登录失败，请检查账号密码和验证码".into());
                }
            }
        
            // 访问教务系统完成 SSO
            let jwxt_url = format!("{}/sso/jasiglogin", JWXT_BASE_URL);
            println!("[调试] 访问教务 SSO: {}", jwxt_url);
            let _ = self.client.get(&jwxt_url).send().await?;

            println!("[调试] 访问教务服务: {}", TARGET_SERVICE);
            let _ = self.client.get(TARGET_SERVICE).send().await?;
            
            // 获取用户信息（若会话未建立，补偿一次重试）
            let user_info = match self.fetch_user_info().await {
                Ok(info) => info,
                Err(err) => {
                    let err_msg = err.to_string();
                    if err_msg.contains("无法解析用户信息") {
                    println!("[调试] 用户信息解析失败，补偿一次 SSO 请求");
                        let _ = self.client.get(&jwxt_url).send().await?;
                        let _ = self.client.get(TARGET_SERVICE).send().await?;
                        self.fetch_user_info().await?
                    } else {
                        return Err(err);
                    }
                }
            };
        // 成功登录
        self.last_login_time = Some(std::time::Instant::now());
        self.is_logged_in = true;
        self.user_info = Some(user_info.clone());
        self.save_cookie_snapshot_to_file();

        // 避免启动时触发频繁登录/验证码，SSO Token 改为按需获取
        
        return Ok(user_info);
        }

        Err("登录失败，请稍后重试".into())
    }

}



