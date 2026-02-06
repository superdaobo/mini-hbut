//! HTTP 客户端主入口：负责会话保持、公共工具函数与模块拆分的统一管理。
//!
//! 该文件主要职责：
//! - 组装 `HbutClient`（统一的请求客户端与会话状态）
//! - 提供登录/学籍/电费等子模块的公共依赖
//! - 实现通用加密/随机串等基础工具
//!
//! 约束说明：
//! - 所有网络请求必须复用 `cookie_jar` 以保持 CAS 会话
//! - OCR 请求使用独立的 `ocr_client`，避免污染主会话
//! - 这里不直接实现业务接口，业务逻辑在子模块中实现

use reqwest::{Client, cookie::Jar};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use chrono::{DateTime, Utc};

use aes::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use base64::Engine;
use rand::Rng;

use crate::{
    UserInfo, LoginPageInfo, Grade, ScheduleCourse, Exam, CalendarEvent,
    parser,
};

mod auth;
mod session;
mod academic;
mod electricity;
mod qxzkb;
mod ai;
mod utils;

// 学期 URLs
#[allow(dead_code)]
pub(super) const CURRENT_SEMESTER_URLS: &[&str] = &[
    "/admin/api/jcsj/xnxq/getCurrentXnxq",
    "/admin/xsd/xsdcjcx/getCurrentXnxq",
];

// AES-CBC 加密类型
pub(super) type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;

// 使用正确的 CAS 地址
pub(super) const AUTH_BASE_URL: &str = "https://auth.hbut.edu.cn/authserver";
pub(super) const JWXT_BASE_URL: &str = "https://jwxt.hbut.edu.cn";
pub(super) const TARGET_SERVICE: &str = "https://jwxt.hbut.edu.cn/admin/index.html";

/// 生成随机字符串（与学校 CAS 前端相同的字符集）
pub(super) fn get_random_string(length: usize) -> String {
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
pub(super) fn encrypt_password_aes(password: &str, salt: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if salt.len() != 16 {
        return Err(format!("Salt must be 16 bytes, got {}", salt.len()).into());
    }

    // Salt 作为密钥，IV 使用随机 16 字符（与前端 encrypt.js 一致）
    let key = salt.as_bytes();
    let iv = get_random_string(16);
    let iv_bytes = iv.as_bytes();

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
    let cipher = Aes128CbcEnc::new(key.into(), iv_bytes.into());
    let encrypted = cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, plain_bytes.len())
        .map_err(|e| format!("Encryption failed: {:?}", e))?;

    // Base64 编码
    Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
}

/// 功能说明（待补充）
pub struct HbutClient {
    pub(super) client: Client,
    pub(super) ocr_client: Client,
    pub(super) cookie_jar: Arc<Jar>,
    pub(super) is_logged_in: bool,
    pub user_info: Option<UserInfo>,
    pub(super) last_login_inputs: Option<HashMap<String, String>>,
    pub(super) last_username: Option<String>,
    pub(super) last_password: Option<String>,
    pub(super) electricity_token: Option<String>,
    pub(super) electricity_token_at: Option<std::time::Instant>,
    pub(super) electricity_refresh_token: Option<String>,
    pub(super) electricity_token_expires_at: Option<DateTime<Utc>>,
    pub(super) ocr_endpoint: Option<String>,
    pub(super) last_login_attempt: Option<std::time::Instant>,
    pub(super) last_login_time: Option<std::time::Instant>,
    pub(super) last_relogin_attempt: Option<std::time::Instant>,
    pub(super) last_relogin_failed_at: Option<std::time::Instant>,
}

impl HbutClient {
    fn build_http_client(jar: Arc<Jar>) -> Client {
        Client::builder()
            .cookie_store(true)
            .cookie_provider(jar)
            .redirect(reqwest::redirect::Policy::limited(10))
            .danger_accept_invalid_certs(true)
            // DNS 兜底：某些环境 getaddrinfo 失败时，强制使用已知可用 IP。
            .resolve("auth.hbut.edu.cn", std::net::SocketAddr::from(([202, 114, 191, 47], 443)))
            .resolve("jwxt.hbut.edu.cn", std::net::SocketAddr::from(([202, 114, 191, 16], 443)))
            .resolve("code.hbut.edu.cn", std::net::SocketAddr::from(([202, 114, 191, 2], 443)))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("创建 HTTP 客户端失败")
    }

    fn build_ocr_client() -> Client {
        Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
            .expect("创建 OCR 客户端失败")
    }

    /// 创建默认客户端并加载历史会话快照
    pub fn new() -> Self {
        let jar = Arc::new(Jar::default());
        let client = Self::build_http_client(Arc::clone(&jar));
        let ocr_client = Self::build_ocr_client();

        let mut instance = Self {
            client,
            ocr_client,
            cookie_jar: jar,
            is_logged_in: false,
            user_info: None,
            last_login_inputs: None,
            last_username: None,
            last_password: None,
            electricity_token: None,
            electricity_token_at: None,
            electricity_refresh_token: None,
            electricity_token_expires_at: None,
            ocr_endpoint: None,
            last_login_attempt: None,
            last_login_time: None,
            last_relogin_attempt: None,
            last_relogin_failed_at: None,
        };
        instance.load_cookie_snapshot_from_file();
        instance
    }

    /// 设置 OCR 服务端点（允许为空，空则走默认配置）
    pub fn set_ocr_endpoint(&mut self, endpoint: String) {
        let trimmed = endpoint.trim();
        if trimmed.is_empty() {
            self.ocr_endpoint = None;
        } else {
            self.ocr_endpoint = Some(trimmed.to_string());
        }
    }

    /// 缓存用户名/密码，用于后续 SSO 自动重登
    pub fn set_credentials(&mut self, username: String, password: String) {
        self.last_username = Some(username);
        self.last_password = Some(password);
    }

    /// 保存电费授权 token，并记录获取时间用于过期判断
    pub fn set_electricity_token(&mut self, token: String) {
        if !token.trim().is_empty() {
            self.electricity_token = Some(token);
            self.electricity_token_at = Some(std::time::Instant::now());
        }
    }

    /// 设置电费授权会话（access token + refresh token + 过期时间）
    pub fn set_electricity_session(
        &mut self,
        token: String,
        refresh_token: Option<String>,
        expires_at: Option<DateTime<Utc>>,
    ) {
        if !token.trim().is_empty() {
            self.electricity_token = Some(token);
            self.electricity_token_at = Some(std::time::Instant::now());
        }
        if let Some(rt) = refresh_token {
            if !rt.trim().is_empty() {
                self.electricity_refresh_token = Some(rt);
            }
        }
        if let Some(exp) = expires_at {
            self.electricity_token_expires_at = Some(exp);
        }
    }

    /// 获取当前电费会话快照（用于持久化）
    pub fn get_electricity_session(&self) -> (Option<String>, Option<String>, Option<DateTime<Utc>>) {
        (
            self.electricity_token.clone(),
            self.electricity_refresh_token.clone(),
            self.electricity_token_expires_at.clone(),
        )
    }

    /// 彻底重置 Cookie Jar 与 HTTP 客户端，清理异常会话污染。
    pub(super) fn reset_http_state(&mut self) {
        let jar = Arc::new(Jar::default());
        self.cookie_jar = Arc::clone(&jar);
        self.client = Self::build_http_client(jar);
        self.ocr_client = Self::build_ocr_client();
    }

    /// 登录频率控制：至少间隔 60 秒，降低 CAS 风控风险。
    pub(super) fn login_cooldown_remaining(&self) -> Option<std::time::Duration> {
        const COOLDOWN: std::time::Duration = std::time::Duration::from_secs(60);
        let last = self.last_login_attempt?;
        let elapsed = last.elapsed();
        if elapsed >= COOLDOWN {
            None
        } else {
            Some(COOLDOWN - elapsed)
        }
    }

    /// 计算“重登冷却期”剩余时间，避免频繁触发登录导致风控
    fn relogin_cooldown_remaining(&self) -> Option<std::time::Duration> {
        const COOLDOWN: std::time::Duration = std::time::Duration::from_secs(180);
        let last = self.last_relogin_failed_at.or(self.last_relogin_attempt)?;
        let elapsed = last.elapsed();
        if elapsed >= COOLDOWN {
            None
        } else {
            Some(COOLDOWN - elapsed)
        }
    }
}


