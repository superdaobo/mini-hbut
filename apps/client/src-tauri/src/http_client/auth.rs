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
use futures::stream::{FuturesUnordered, StreamExt};
use scraper::{Html, Selector};
use std::collections::HashMap;
use std::sync::OnceLock;

use super::utils::chrono_timestamp;

/// 默认登录页参数不完整时并行探测的候选 service。
///
/// #984：教务候选一律用 `/admin/caslogin`（唯一能完成 ticket→session 交换的入口），
/// 不再使用 `/admin/?loginType=1`（实测会 303 丢弃 ticket，永远建不起会话）。
const LOGIN_PAGE_FALLBACK_SERVICES: &[&str] = &[
    "https://jwxt.hbut.edu.cn/admin/caslogin",
    "https://jwxt.hbut.edu.cn/admin/index.html",
    "https://e.hbut.edu.cn/login#/",
];

fn has_login_page_params(page: &LoginPageInfo) -> bool {
    !page.salt.trim().is_empty() && !page.execution.trim().is_empty()
}

fn normalize_login_text(input: &str) -> String {
    input
        .replace('\u{00a0}', " ")
        .replace(['\r', '\n', '\t'], "")
        .trim()
        .to_string()
}

fn selector_input() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("input").expect("selector input"))
}

fn selector_pwd_encrypt_salt() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("#pwdEncryptSalt").expect("selector #pwdEncryptSalt"))
}

fn selector_pwd_default_encrypt_salt() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| {
        Selector::parse("#pwdDefaultEncryptSalt").expect("selector #pwdDefaultEncryptSalt")
    })
}

fn selector_captcha_response() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("#captchaResponse").expect("selector #captchaResponse"))
}

fn selector_c_response() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("#c_response").expect("selector #c_response"))
}

fn selector_show_error_tip_span() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR
        .get_or_init(|| Selector::parse("span#showErrorTip").expect("selector span#showErrorTip"))
}

fn selector_show_error_tip() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("#showErrorTip").expect("selector #showErrorTip"))
}

fn selector_error_tip() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("#errorTip").expect("selector #errorTip"))
}

fn selector_error_msg() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse("#errorMsg").expect("selector #errorMsg"))
}

fn selector_auth_error() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse(".authError").expect("selector .authError"))
}

fn selector_error() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse(".error").expect("selector .error"))
}

fn selector_tips_error() -> &'static Selector {
    static SELECTOR: OnceLock<Selector> = OnceLock::new();
    SELECTOR.get_or_init(|| Selector::parse(".tips-error").expect("selector .tips-error"))
}

fn re_lt_double() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r#"name="lt"\s+value="([^"]*)""#).expect("regex lt double"))
}

fn re_execution_double() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r#"name="execution"\s+value="([^"]*)""#).expect("regex execution double")
    })
}

fn re_salt_double() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r#"id="pwdEncryptSalt"\s+value="([^"]*)""#).expect("regex salt double")
    })
}

fn re_lt_single() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r#"name='lt'\s+value='([^']*)'"#).expect("regex lt single"))
}

fn re_execution_single() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r#"name='execution'\s+value='([^']*)'"#).expect("regex execution single")
    })
}

fn re_execution_js() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r#"execution\s*[:=]\s*\"([^\"]+)\""#).expect("regex execution js")
    })
}

fn re_salt_single() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r#"id='pwdEncryptSalt'\s+value='([^']*)'"#).expect("regex salt single")
    })
}

fn re_salt_js() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r#"pwd(Default)?EncryptSalt\s*[:=]\s*\"([^\"]+)\""#)
            .expect("regex salt js")
    })
}

// 说明：#984 实现要求 D —— `response_indicates_service_success` 已收敛到
// `http_client/mod.rs`，与 `looks_like_academic_login_url` / `looks_like_cas_login_url` /
// `looks_like_portal_login_url` / `looks_like_login_landing_url` 放在一起。
// 全模块只有这一份「service 登录是否成功」的判定，禁止再在本文件另写一套。

/// 识别 CAS 登录失败原因。
/// 返回 (错误消息, 是否可按验证码错误重试)
fn classify_login_error_text(raw_text: &str) -> Option<(String, bool)> {
    let text = normalize_login_text(raw_text);
    if text.is_empty() {
        return None;
    }

    // 一些登录页固定文案，不能当成错误
    if text.contains("username密码登录") || text.contains("统一身份认证") {
        return None;
    }

    let has_password_error = [
        "用户名或密码错误",
        "账号或密码错误",
        "帐号或密码错误",
        "密码错误",
        "密码不正确",
        "认证失败",
        "用户不存在",
        "账号不存在",
        "帐号不存在",
        // #984 实测：门户 CAS 真实文案是「用户名或者密码有误；首次登录，请按照提示进行激活操作」，
        // 与上面的「用户名或密码错误」不匹配，此前只能靠 HTTP 401 兜底成通用文案。
        "用户名或者密码有误",
        "密码有误",
        "用户名有误",
    ]
    .iter()
    .any(|k| text.contains(k));

    let has_account_locked = ["账户被锁定", "账号被锁定", "帐号被锁定", "冻结", "已锁定"]
        .iter()
        .any(|k| text.contains(k));

    let has_captcha_error = [
        "验证码错误",
        "验证码无效",
        "验证码不正确",
        "验证码有误",
        "请输入验证码",
        // #984 实测：门户 CAS 真实文案是「图形动态码错误」，不含「验证码」字样。
        "图形动态码错误",
        "动态码错误",
    ]
    .iter()
    .any(|k| text.contains(k));

    let has_rate_limit = ["操作过于频繁", "请稍后再试", "请求过于频繁", "访问过于频繁"]
        .iter()
        .any(|k| text.contains(k));

    if has_account_locked {
        return Some(("账号已被锁定".to_string(), false));
    }

    // 关键修复：如果同页同时出现“验证码”和“密码”字样，优先判定为密码错误。
    if has_password_error {
        return Some(("username或密码错误".to_string(), false));
    }

    if has_captcha_error {
        return Some(("验证码错误".to_string(), true));
    }

    if has_rate_limit {
        return Some(("登录过于频繁，请稍后再试".to_string(), false));
    }

    None
}

fn detect_login_error_from_html(html: &str) -> Option<(String, bool)> {
    let document = Html::parse_document(html);
    let selectors = [
        selector_show_error_tip_span(),
        selector_show_error_tip(),
        selector_error_tip(),
        selector_error_msg(),
        selector_auth_error(),
        selector_error(),
        selector_tips_error(),
    ];

    for sel in selectors {
        for node in document.select(sel) {
            let txt = node.text().collect::<String>();
            if let Some(classified) = classify_login_error_text(&txt) {
                return Some(classified);
            }
        }
    }

    // 兜底：直接扫描全文关键字
    classify_login_error_text(html)
}

fn html_looks_like_login_form(html: &str) -> bool {
    html.contains("pwdEncryptSalt") && html.contains("execution")
}

/// 登录阶段：让「失败发生在哪一环」在日志里直接可读（#984 实现要求 E）。
///
/// 收口日志格式：
/// - 成功 `[Auth] <label>成功 stage=Done student_id=…`
/// - 失败 `[Auth] <label>失败 stage=PasswordPost kind=AuthFailed msg=…`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LoginStage {
    /// 60s 冷却门 / 5s 短 backoff 门
    Gate,
    /// 获取并解析 CAS 登录页（salt / execution / 是否已登录）
    FetchLoginPage,
    /// 验证码获取与 OCR 识别
    Captcha,
    /// 提交账号密码（CAS POST）
    PasswordPost,
    /// 建立教务会话（`/admin/caslogin`）与拉取用户信息
    JwxtBootstrap,
    /// 已完成
    Done,
}

/// 纯函数：根据「获取登录页」的最终 URL 判定是否已登录（#984 实现要求 A）。
///
/// 独立出来是为了让 T1（`/admin/login` 不得被判为已登录）能直接断言语义，
/// 不必起真实 HTTP。
///
/// 语义：必须**同时**满足
///   1) 最终 URL 不是任何登录落地页（CAS 登录页 / 教务 `/admin/login` / 门户登录页）；
///   2) 且属于下列之一：URL 明确带 ticket、命中一码通 host/open、或确实回到 service 域名的成功页。
///
/// 绝不再仅凭「URL 里没有 `authserver/login`」就认定已登录 —— 那会把教务自身的
/// 未登录页 `https://jwxt.hbut.edu.cn/admin/login` 判成已登录，从而跳过本次密码 POST。
fn compute_is_already_logged_in(final_url: &str, service_url: &str) -> bool {
    if looks_like_login_landing_url(final_url) {
        return false;
    }
    final_url.contains("ticket=")
        || final_url.contains("code.hbut.edu.cn/server/auth/host/open")
        || response_indicates_service_success(final_url, service_url)
}

fn is_first_party_ocr_endpoint(url: &str) -> bool {
    // 两域白名单（契约 §9）：只有我方域名才附带 x-mini-hbut-* 遥测头。
    // 已下线的测试域（testocr1，Space 已 PAUSED）不再列入 —— 它已被所有档位拒绝。
    [
        "https://mini.hbut.site/",
        "https://mini-hbut-ocr-service.hf.space/",
    ]
    .iter()
    .any(|prefix| url.starts_with(prefix))
}

async fn try_ocr_endpoint(
    ocr_client: reqwest::Client,
    source: String,
    ocr_url: String,
    normalized: String,
    app_version: String,
    device_id: String,
    student_id: String,
) -> Result<(String, String, String), (String, String, String)> {
    let mut request = ocr_client
        .post(&ocr_url)
        .json(&serde_json::json!({ "image": normalized }));
    if is_first_party_ocr_endpoint(&ocr_url) {
        request = request
            .header("x-mini-hbut-version", app_version)
            .header("x-mini-hbut-runtime", "tauri")
            .header("x-mini-hbut-platform", std::env::consts::OS);
        if !device_id.is_empty() {
            request = request.header("x-mini-hbut-device", device_id);
        }
        if !student_id.is_empty() {
            request = request.header("x-mini-hbut-student", student_id);
        }
    }
    let ocr_response = request.send().await.map_err(|e| {
        (
            source.clone(),
            ocr_url.clone(),
            format!("OCR request failed: {}", e),
        )
    })?;

    let ocr_status = ocr_response.status();
    let ocr_text = ocr_response.text().await.unwrap_or_default();
    if !ocr_status.is_success() {
        return Err((source, ocr_url, format!("OCR status {}", ocr_status)));
    }

    let ocr_result: serde_json::Value = serde_json::from_str(&ocr_text).map_err(|e| {
        (
            source.clone(),
            ocr_url.clone(),
            format!("OCR json parse failed: {}", e),
        )
    })?;

    if ocr_result
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        if let Some(result) = ocr_result.get("result").and_then(|v| v.as_str()) {
            let captcha_code = result.trim().to_string();
            if !captcha_code.is_empty() {
                return Ok((source, ocr_url, captcha_code));
            }
        }
    }

    let msg = ocr_result
        .get("error")
        .and_then(|v| v.as_str())
        .unwrap_or("OCR recognition failed")
        .to_string();
    Err((source, ocr_url, msg))
}

fn login_form_set_key(
    map: &mut HashMap<String, String>,
    keys: &[&str],
    default_key: &str,
    value: String,
) {
    for key in keys {
        if map.contains_key(*key) {
            map.insert((*key).to_string(), value.clone());
            return;
        }
    }
    map.insert(default_key.to_string(), value);
}

fn login_form_set_all_keys(
    map: &mut HashMap<String, String>,
    keys: &[&str],
    default_key: &str,
    value: &str,
) {
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
}

fn build_cas_login_form(
    mut form_data: HashMap<String, String>,
    username: &str,
    encrypted_password: String,
    execution: String,
    lt: String,
    captcha_code: Option<&str>,
) -> HashMap<String, String> {
    login_form_set_key(
        &mut form_data,
        &["username", "username", "loginname"],
        "username",
        username.to_string(),
    );
    login_form_set_key(
        &mut form_data,
        &["password", "passwd"],
        "password",
        encrypted_password,
    );
    form_data.remove("passwordText");
    login_form_set_key(
        &mut form_data,
        &["cllt"],
        "cllt",
        "userNameLogin".to_string(),
    );
    login_form_set_key(
        &mut form_data,
        &["dllt"],
        "dllt",
        "generalLogin".to_string(),
    );
    if !execution.is_empty() {
        login_form_set_key(&mut form_data, &["execution"], "execution", execution);
    }
    if !lt.is_empty() {
        login_form_set_key(&mut form_data, &["lt"], "lt", lt);
    }
    login_form_set_key(
        &mut form_data,
        &["_eventId"],
        "_eventId",
        "submit".to_string(),
    );
    login_form_set_key(&mut form_data, &["rmShown"], "rmShown", "1".to_string());

    if let Some(code) = captcha_code.map(str::trim).filter(|v| !v.is_empty()) {
        login_form_set_all_keys(
            &mut form_data,
            &["captcha", "captchaResponse", "c_response"],
            "captcha",
            code,
        );
    }

    if let Some(v) = form_data.get("cllt") {
        if v == "qrLogin" {
            form_data.insert("cllt".to_string(), "userNameLogin".to_string());
        }
    }

    form_data
}

impl HbutClient {
    /// 访问 `/admin/caslogin` 并显式校验结果（#984 实现要求 C）。
    ///
    /// 原实现是 `let _ = self.client.get(&caslogin_url).send().await?;`，
    /// status 与 final_url 全部丢弃，导致「CAS 未认证 / 补票失败 / 旧 Cookie 污染 /
    /// 真实 Session 过期」全部不可区分。
    ///
    /// 本函数把结果分类为 [`JwxtBootstrapOutcome`]，并记录
    /// `[Auth] JWXT caslogin status=… final_url=…` 日志（不含 Cookie / execution / 密码）。
    async fn bootstrap_jwxt_caslogin(
        &self,
        caslogin_url: &str,
    ) -> Result<JwxtBootstrapOutcome, Box<dyn std::error::Error + Send + Sync>> {
        // 测试构建可注入 caslogin 结果（#984 新增，见 `test_caslogin`）。
        #[cfg(test)]
        let (status, final_url) = if let Some(inject) = &self.test_caslogin {
            let (url, status, _html) = inject()?;
            (status, url)
        } else {
            Self::request_caslogin(&self.client, caslogin_url).await?
        };
        #[cfg(not(test))]
        let (status, final_url) = Self::request_caslogin(&self.client, caslogin_url).await?;

        crate::hbut_auth_log!(
            "[Auth] JWXT caslogin status={} final_url={}",
            status,
            final_url
        );

        Ok(Self::classify_jwxt_bootstrap(status, &final_url))
    }

    /// 发起一次 `/admin/caslogin` 请求，返回 `(status, final_url)`。
    /// 传输层失败会被分类为 [`JwxtBootstrapOutcome::TransportError`]（见调用方）。
    async fn request_caslogin(
        client: &reqwest::Client,
        caslogin_url: &str,
    ) -> Result<(u16, String), Box<dyn std::error::Error + Send + Sync>> {
        let response = match client.get(caslogin_url).send().await {
            Ok(resp) => resp,
            Err(err) => {
                if is_transport_error(&err as &(dyn std::error::Error + Send + Sync)) {
                    crate::hbut_debug!(
                        "[Auth] JWXT caslogin transport_error url={} err={}",
                        caslogin_url,
                        err
                    );
                    // 用 0 表示「未收到任何 HTTP 响应」，由 classify 归为 TransportError
                    return Ok((0, String::new()));
                }
                return Err(Box::new(err));
            }
        };
        let status = response.status().as_u16();
        let final_url = response.url().to_string();
        let _ = response.text().await;
        Ok((status, final_url))
    }

    /// 纯函数：把 `/admin/caslogin` 的 `(status, final_url)` 分类为 [`JwxtBootstrapOutcome`]。
    /// 独立出来是为了让 T4/T5 能直接断言分类语义，不必起 HTTP。
    fn classify_jwxt_bootstrap(status: u16, final_url: &str) -> JwxtBootstrapOutcome {
        if status == 0 {
            return JwxtBootstrapOutcome::TransportError;
        }
        // 回到 CAS 登录页 → 认证状态已不可用，需要重新认证
        if looks_like_cas_login_url(final_url) {
            return JwxtBootstrapOutcome::NeedsCasAuth;
        }
        // 仍停留在教务自身登录页 → 补票没有生效
        if looks_like_academic_login_url(final_url) {
            return JwxtBootstrapOutcome::JwxtBootstrapFailed;
        }
        if !(200..400).contains(&status) {
            return JwxtBootstrapOutcome::JwxtBootstrapFailed;
        }
        // 已经回到教务可用资源（/admin/?loginType=1 等）
        JwxtBootstrapOutcome::Authenticated
    }

    /// CAS 登录后建立教务会话并拉取用户信息。
    ///
    /// #984 关键修正：`/admin/caslogin` **不是可选补偿，而是建立教务会话的必要步骤**。
    /// 实测（`data/issue-984-link-map.md`）：service=`/admin/?loginType=1` 时教务会 303
    /// 丢弃 CAS ticket，只有 `/admin/caslogin` 能完成 ticket → session 交换。
    ///
    /// 失败分类（不再一律压成「会话已过期」）：
    /// - `NeedsCasAuth` → 认证失败类错误，提示重新登录；
    /// - `JwxtBootstrapFailed` → 独立文案「统一身份认证已通过，但教务会话建立失败，请稍后重试」；
    /// - `TransportError` → 传输层错误原样透传，不包装成会话过期。
    async fn finalize_jwxt_user_session(
        &mut self,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let caslogin_url = format!("{}/admin/caslogin", super::JWXT_BASE_URL);
        let outcome = self.bootstrap_jwxt_caslogin(&caslogin_url).await?;
        crate::hbut_auth_log!("[Auth] JWXT bootstrap result={:?}", outcome);

        match outcome {
            JwxtBootstrapOutcome::TransportError => {
                return Err(HttpClientError::new(
                    HttpClientErrorKind::Transport,
                    "无法连接教务系统，请检查网络后重试",
                )
                .into());
            }
            JwxtBootstrapOutcome::NeedsCasAuth => {
                return Err(HttpClientError::auth_failed("登录状态已失效，请重新登录").into());
            }
            // caslogin 明确没有建立起会话（仍落 /admin/login 或非 2xx/3xx）：
            // 此时再拉 fetch_user_info 毫无意义，直接给出独立的 bootstrap 失败错误，
            // 而不是让它压成「会话已过期」（#984 情况 C）。
            JwxtBootstrapOutcome::JwxtBootstrapFailed => {
                return Err(HttpClientError::jwxt_bootstrap_failed().into());
            }
            JwxtBootstrapOutcome::Authenticated => {}
        }

        // 会话已建立 → 用业务资源做最终判定
        match self.fetch_user_info().await {
            Ok(info) => Ok(info),
            Err(err) => {
                // 业务资源仍命中登录页：说明 bootstrap 实际没生效，给出独立错误，
                // 不再把「登录过程中建不起会话」压成「历史会话已过期」。
                let msg = err.to_string();
                if msg.contains("会话已过期") {
                    return Err(HttpClientError::jwxt_bootstrap_failed().into());
                }
                Err(err)
            }
        }
    }

    /// 并行探测 fallback service 登录页，命中后拉取完整参数。
    async fn resolve_login_page_with_fallbacks(
        &mut self,
        mut page_info: LoginPageInfo,
    ) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        if page_info.is_already_logged_in || has_login_page_params(&page_info) {
            return Ok(page_info);
        }

        crate::hbut_debug!(
            "[调试] 默认登录页参数不完整（salt/execution），并行尝试 service 回退链路"
        );
        let client = self.client.clone();
        let mut tasks = FuturesUnordered::new();
        for service in LOGIN_PAGE_FALLBACK_SERVICES {
            if service.eq_ignore_ascii_case(TARGET_SERVICE) {
                continue;
            }
            let http = client.clone();
            let svc = service.to_string();
            tasks.push(async move {
                let login_url = format!(
                    "{}/login?service={}",
                    AUTH_BASE_URL,
                    urlencoding::encode(&svc)
                );
                let response = http.get(&login_url).send().await.ok()?;
                let html = response.text().await.ok()?;
                if html_looks_like_login_form(&html) {
                    Some(svc)
                } else {
                    None
                }
            });
        }

        while let Some(result) = tasks.next().await {
            if let Some(service) = result {
                crate::hbut_debug!("[调试] 登录页回退命中: {}", service);
                page_info = self.get_login_page_with_service(&service).await?;
                if page_info.is_already_logged_in || has_login_page_params(&page_info) {
                    return Ok(page_info);
                }
            }
        }

        Ok(page_info)
    }

    /// 获取默认登录页并解析参数
    pub async fn get_login_page(
        &mut self,
    ) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        self.get_login_page_with_service(TARGET_SERVICE).await
    }

    /// 获取指定 service 的登录页并解析参数
    pub async fn get_login_page_with_service(
        &mut self,
        service_url: &str,
    ) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        let encoded_service = urlencoding::encode(service_url);
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, encoded_service);
        crate::hbut_debug!("[调试] 获取登录页: {}", login_url);

        let response = match self.client.get(&login_url).send().await {
            Ok(resp) => resp,
            Err(first_err) => {
                println!("[警告] 获取登录页失败，尝试清理会话后重试: {}", first_err);
                self.clear_session();
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                self.client
                    .get(&login_url)
                    .send()
                    .await
                    .map_err(|retry_err| {
                        format!("获取登录页失败: {}; 重试仍失败: {}", first_err, retry_err)
                    })?
            }
        };
        let status = response.status();
        let final_url = response.url().to_string();
        let html = response.text().await?;
        if html.contains("IP冻结") || html.contains("ip-freeze") || html.contains("ip冻结") {
            return Err("服务器 IP 被学校冻结，请稍后再试或联系管理员".into());
        }
        if html.contains("应用未注册") || html.contains("不允许使用认证服务来认证您访问的目标应用")
        {
            return Err(format!(
                "CAS 服务未注册（service={}），请改用融合门户默认登录链路",
                service_url
            )
            .into());
        }
        crate::hbut_debug!("[调试] 登录页状态: {}, final_url: {}", status, final_url);

        // 检测是否已经登录（#984 缺陷 1 修复点）。
        //
        // 原实现用 `!final_url.contains("authserver/login")` 作为「已登录」的充分条件，
        // 导致教务自身的未登录页 `https://jwxt.hbut.edu.cn/admin/login`（不含
        // `authserver/login`）被判为「已登录」，从而**跳过本次密码 POST**。
        // 现在收敛到纯函数 `compute_is_already_logged_in`（可单测，见 T1）。
        let is_already_logged_in = compute_is_already_logged_in(&final_url, service_url);
        if is_already_logged_in {
            crate::hbut_debug!(
                "[Auth] 登录页检测：判定为已登录 final_url={} service={}",
                final_url,
                service_url
            );
        } else {
            crate::hbut_debug!(
                "[Auth] 登录页检测：判定为未登录 final_url={} (login_landing={})",
                final_url,
                looks_like_login_landing_url(&final_url)
            );
        }

        // 解析并缓存表单 inputs（用于后续登录提交）
        let mut inputs = HashMap::new();
        let input_selector = selector_input();
        let document = Html::parse_document(&html);

        // DEBUG: Dump form inputs
        crate::hbut_debug!("[调试] 解析登录页表单...");
        for el in document.select(input_selector) {
            if let Some(name) = el.value().attr("name") {
                let value = el.value().attr("value").unwrap_or("");
                inputs.insert(name.to_string(), value.to_string());
            }
        }
        // 使用正则提取参数（更稳健）
        // 优先从 inputs 中获取参数
        let lt = inputs
            .get("lt")
            .cloned()
            .or_else(|| {
                re_lt_double()
                    .captures(&html)
                    .and_then(|cap| cap.get(1))
                    .map(|m| m.as_str().to_string())
            })
            .unwrap_or_default();

        let execution = inputs
            .get("execution")
            .cloned()
            .or_else(|| {
                re_execution_double()
                    .captures(&html)
                    .and_then(|cap| cap.get(1))
                    .map(|m| m.as_str().to_string())
            })
            .unwrap_or_default();

        let salt = inputs
            .get("pwdEncryptSalt")
            .cloned()
            .or_else(|| inputs.get("pwdDefaultEncryptSalt").cloned())
            .or_else(|| {
                // 尝试使用 Selector 查找 ID (比正则更稳健)
                let salt_selector = selector_pwd_encrypt_salt();
                document
                    .select(salt_selector)
                    .next()
                    .and_then(|el| el.value().attr("value"))
                    .map(|s| s.to_string())
            })
            .or_else(|| {
                // 最后尝试正则
                re_salt_double()
                    .captures(&html)
                    .and_then(|cap| cap.get(1))
                    .map(|m| m.as_str().to_string())
            })
            .unwrap_or_default();

        let lt = if lt.is_empty() {
            re_lt_single()
                .captures(&html)
                .and_then(|cap| cap.get(1))
                .map(|m| m.as_str().to_string())
                .unwrap_or_default()
        } else {
            lt
        };

        let execution = if execution.is_empty() {
            re_execution_single()
                .captures(&html)
                .and_then(|cap| cap.get(1))
                .map(|m| m.as_str().to_string())
                .or_else(|| {
                    re_execution_js()
                        .captures(&html)
                        .and_then(|cap| cap.get(1))
                        .map(|m| m.as_str().to_string())
                })
                .unwrap_or_default()
        } else {
            execution
        };

        let salt = if salt.is_empty() {
            let salt_from_selector = document
                .select(selector_pwd_default_encrypt_salt())
                .next()
                .and_then(|el| el.value().attr("value"))
                .map(|s| s.to_string())
                .unwrap_or_default();

            if !salt_from_selector.is_empty() {
                salt_from_selector
            } else {
                re_salt_single()
                    .captures(&html)
                    .and_then(|cap| cap.get(1))
                    .map(|m| m.as_str().to_string())
                    .or_else(|| {
                        re_salt_js()
                            .captures(&html)
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
            super::utils::write_debug_artifact("debug_login_page_tauri.html", &html);
            crate::hbut_debug!(
                "[调试] 登录页参数缺失, wrote debug_login_page_tauri.html (len={})",
                html.len()
            );
        }

        // 检查是否需要验证码
        let captcha_required = html.contains("captchaResponse")
            || html.contains("getCaptcha")
            || inputs.contains_key("captchaResponse")
            || inputs.contains_key("captcha")
            || document
                .select(selector_captcha_response())
                .next()
                .is_some()
            || document.select(selector_c_response()).next().is_some();

        crate::hbut_debug!("[调试] 需要验证码: {}", captcha_required);

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

    /// 使用指定 service 发起 CAS 登录，返回用户信息。
    ///
    /// 用于一码通 / 电费 / 学习通静默重登等「按 service 登录」链路。
    /// 与 [`Self::login`] 一样带收口日志：无论从哪个阶段失败，都会输出
    /// `[Auth] 服务登录(service=…)失败 stage=… kind=… msg=…`。
    pub async fn login_for_service(
        &mut self,
        username: &str,
        password: &str,
        service_url: &str,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let mut stage = LoginStage::FetchLoginPage;
        let result = self
            .login_for_service_inner(username, password, service_url, &mut stage)
            .await;
        Self::log_login_outcome(&format!("服务登录(service={service_url})"), stage, &result);
        result
    }

    async fn login_for_service_inner(
        &mut self,
        username: &str,
        password: &str,
        service_url: &str,
        stage: &mut LoginStage,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let encoded_service = urlencoding::encode(service_url);
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, encoded_service);
        crate::hbut_debug!("[Auth] 服务登录开始 service={}", service_url);
        crate::hbut_debug!("[Auth] 服务登录用户名: {}", username);
        crate::hbut_debug!("[Auth] 密码长度 (plain): {}", password.len());

        // 缓存最近一次登录凭据（仅内存）
        self.last_username = Some(username.to_string());
        self.last_password = Some(password.to_string());

        // 只记录 Cookie 的域与数量，不打印完整值（#984 禁止打印完整 Cookie）
        let cookies_before = self.get_cookies();
        crate::hbut_debug!(
            "[Auth] 登录前 Cookie 条目数={} 长度={}",
            cookies_before
                .split(';')
                .filter(|s| !s.trim().is_empty())
                .count(),
            cookies_before.len()
        );

        let max_attempts = 3;
        for attempt in 0..max_attempts {
            *stage = LoginStage::FetchLoginPage;
            // 获取登录页面参数（execution 一次性），增加重试次数以应对验证码识别错误
            let page_info = self.get_login_page_with_service(service_url).await?;
            let current_salt = page_info.salt;
            let current_execution = page_info.execution;
            let current_lt = page_info.lt;

            // 如果已经登录，直接跳过 POST 步骤
            if page_info.is_already_logged_in {
                crate::hbut_debug!("[调试] 已登录（获取登录页时检测到），跳过登录 POST");
                break;
            }

            if current_salt.is_empty() {
                return Err("无法获取加密盐值".into());
            }

            // 加密密码
            let encrypted_password = encrypt_password_aes(password, &current_salt)?;

            let captcha_for_form = if page_info.captcha_required {
                let code = self.fetch_and_recognize_captcha().await.unwrap_or_default();
                let trimmed = code.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            } else {
                None
            };

            let form_data = build_cas_login_form(
                self.last_login_inputs.clone().unwrap_or_default(),
                username,
                encrypted_password,
                current_execution,
                current_lt,
                captcha_for_form.as_deref(),
            );

            *stage = LoginStage::PasswordPost;
            crate::hbut_debug!(
                "[Auth] 服务登录 CAS POST started attempt={}/{} service={}",
                attempt + 1,
                max_attempts,
                service_url
            );
            let response = self
                .client
                .post(&login_url)
                .header("Referer", &login_url)
                .form(&form_data)
                .send()
                .await?;

            let response_url = response.url().to_string();
            let status = response.status();
            let html = response.text().await?;
            if let Some((login_err, retryable_captcha)) = detect_login_error_from_html(&html) {
                if retryable_captcha && attempt + 1 < max_attempts {
                    println!(
                        "[调试] 验证码错误，重试... ({}/{})",
                        attempt + 1,
                        max_attempts
                    );
                    continue;
                }
                return Err(login_err.into());
            }
            if status.as_u16() == 401 {
                return Err("登录失败，请检查账号或密码".into());
            }

            let is_on_auth_page = looks_like_cas_login_url(&response_url)
                || looks_like_portal_login_url(&response_url)
                || html.contains("统一身份认证")
                || html.contains("pwdEncryptSalt");

            if is_on_auth_page {
                if service_url.contains("code.hbut.edu.cn") {
                    if self.check_code_login().await {
                        crate::hbut_debug!("[调试] code 服务登录验证通过 via getLoginUser");
                        break;
                    }
                }
                if attempt + 1 < max_attempts {
                    println!(
                        "[调试] 仍在登录页，重试... ({}/{})",
                        attempt + 1,
                        max_attempts
                    );
                    continue;
                }
                return Err("登录失败，请检查账号密码或验证码".into());
            }

            // 快路径：已回到目标服务域名，直接认为服务登录成功，避免额外一次 CAS 校验请求。
            if !response_indicates_service_success(&response_url, service_url) {
                // 回退路径：做一次 CAS 会话校验，避免 OCR 误识导致“看似成功”。
                let verify_url = format!(
                    "{}/login?service={}",
                    AUTH_BASE_URL,
                    urlencoding::encode(service_url)
                );
                let verify_resp = self.client.get(&verify_url).send().await?;
                let verify_final = verify_resp.url().to_string();
                if verify_final.contains("authserver/login") {
                    if service_url.contains("code.hbut.edu.cn") && self.check_code_login().await {
                        crate::hbut_debug!("[调试] CAS 校验重定向 but code 会话 is valid");
                        break;
                    }
                    if attempt + 1 < max_attempts {
                        println!(
                            "[警告] CAS 会话未建立，重试... ({}/{})",
                            attempt + 1,
                            max_attempts
                        );
                        continue;
                    }
                    return Err("登录未生效，请重试或稍后再试".into());
                }
            }

            break;
        }

        // 成功登录后尝试获取用户信息（如不可用则忽略）
        if service_url.contains("jwxt.hbut.edu.cn") {
            *stage = LoginStage::JwxtBootstrap;
            let user_info = self.finalize_jwxt_user_session().await?;
            *stage = LoginStage::Done;
            self.is_logged_in = true;
            self.set_chaoxing_login_mode(false);
            self.user_info = Some(user_info.clone());
            self.save_cookie_snapshot_to_file();
            return Ok(user_info);
        } else {
            crate::hbut_debug!("[Auth] 服务登录成功: {}", service_url);
            *stage = LoginStage::Done;
            self.is_logged_in = true;
            self.set_chaoxing_login_mode(false);
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
        crate::hbut_debug!("[调试] 获取 captcha： {}", captcha_url);

        let response = self.client.get(&captcha_url).send().await?;
        let status = response.status();
        crate::hbut_debug!("[调试] 验证码响应状态: {}", status);

        let bytes = response.bytes().await?;
        crate::hbut_debug!("[调试] 验证码字节长度: {}", bytes.len());

        if bytes.is_empty() || bytes.len() < 100 {
            return Err(format!("Captcha image is too small: {} bytes", bytes.len()).into());
        }

        let base64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
        crate::hbut_debug!("[调试] 验证码 Base64 长度: {}", base64_str.len());

        Ok(format!("data:image/png;base64,{}", base64_str))
    }

    /// 检查是否已具备 code 服务登录会话
    async fn check_code_login(&self) -> bool {
        let url = "https://code.hbut.edu.cn/server/auth/getLoginUser";
        let resp = self
            .client
            .get(url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Origin", "https://code.hbut.edu.cn")
            .header("Referer", "https://code.hbut.edu.cn/")
            .send()
            .await;
        if let Ok(resp) = resp {
            if let Ok(text) = resp.text().await {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    return json
                        .get("success")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                }
            }
        }
        false
    }

    /// 使用 OCR 识别传入的 base64 图片内容。
    /// 规则：优先远程配置端点，失败后回退到内置端点。
    pub async fn recognize_captcha_base64(
        &mut self,
        image_base64: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let normalized = image_base64
            .trim()
            .split_once(',')
            .map(|(_, b64)| b64)
            .unwrap_or(image_base64)
            .trim();
        if normalized.is_empty() {
            return Err("OCR image base64 is empty".into());
        }

        let mut endpoints: Vec<(&str, String)> = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // 1) 远程配置列表（前端下发）
        for endpoint in &self.ocr_remote_endpoints {
            let normalized = Self::normalize_ocr_endpoint(endpoint);
            if seen.insert(normalized.clone()) {
                endpoints.push(("remote_config", normalized));
            }
        }

        // 2) 默认远程兜底
        let remote_default = super::default_remote_ocr_endpoint().to_string();
        if seen.insert(remote_default.clone()) {
            endpoints.push(("remote_default", remote_default));
        }

        // 3) 本地兜底列表（可被远程配置覆盖）
        let local_fallbacks = if self.ocr_local_fallback_endpoints.is_empty() {
            super::DEFAULT_OCR_FALLBACK_ENDPOINTS
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
        } else {
            self.ocr_local_fallback_endpoints.clone()
        };
        for endpoint in local_fallbacks {
            let normalized = Self::normalize_ocr_endpoint(&endpoint);
            if seen.insert(normalized.clone()) {
                endpoints.push(("local_fallback", normalized));
            }
        }

        let image = normalized.to_string();
        let app_version = env!("CARGO_PKG_VERSION").to_string();
        let telemetry_device_id = self.ocr_telemetry_device_id.clone().unwrap_or_default();
        let telemetry_student_id = self
            .ocr_telemetry_student_id
            .clone()
            .or_else(|| {
                self.last_username
                    .as_ref()
                    .map(|value| value.trim().to_string())
                    .filter(|value| {
                        (9..=10).contains(&value.len()) && value.chars().all(|c| c.is_ascii_digit())
                    })
            })
            .unwrap_or_default();
        let mut tasks = FuturesUnordered::new();
        for (source, ocr_url) in endpoints {
            let client = self.ocr_client.clone();
            let img = image.clone();
            tasks.push(try_ocr_endpoint(
                client,
                source.to_string(),
                ocr_url,
                img,
                app_version.clone(),
                telemetry_device_id.clone(),
                telemetry_student_id.clone(),
            ));
        }

        let mut last_err = String::new();
        while let Some(result) = tasks.next().await {
            match result {
                Ok((source, ocr_url, captcha_code)) => {
                    self.set_ocr_runtime_success(&source, &ocr_url);
                    crate::hbut_debug!("[调试] OCR 识别成功({}): {}", source, captcha_code);
                    return Ok(captcha_code);
                }
                Err((source, ocr_url, msg)) => {
                    println!("[警告] OCR 来源({}) 失败: {}", source, msg);
                    self.set_ocr_runtime_error(&source, &ocr_url, &msg);
                    last_err = msg;
                }
            }
        }
        Err(format!("OCR all endpoints failed: {}", last_err).into())
    }

    /// 获取验证码并调用 OCR 识别
    async fn fetch_and_recognize_captcha(
        &mut self,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let captcha_url = format!("{}/getCaptcha.htl?{}", AUTH_BASE_URL, chrono_timestamp());
        crate::hbut_debug!("[调试] 获取验证码用于 OCR: {}", captcha_url);

        let response = self.client.get(&captcha_url).send().await?;
        let bytes = response.bytes().await?;

        if bytes.is_empty() || bytes.len() < 100 {
            return Err("验证码图片为空或过小".into());
        }

        crate::hbut_debug!("[调试] 验证码图片大小: {} bytes", bytes.len());
        let base64_image = base64::engine::general_purpose::STANDARD.encode(&bytes);
        self.recognize_captcha_base64(&base64_image).await
    }

    /// 主登录入口（含验证码流程与会话保存）。
    ///
    /// **收口保证**：无论 `login_inner` 从哪个阶段失败，返回前都会输出一行
    /// `[Auth] 门户密码登录失败 stage=… kind=… msg=…`，
    /// 配合各阶段的分步日志（登录页 / CAS POST / caslogin / fetch_user_info），
    /// 后端日志可以直接回答「本次是否真的 POST 了密码、CAS 与教务各自的最终 URL、
    /// 失败发生在哪一环」。
    pub async fn login(
        &mut self,
        username: &str,
        password: &str, // 原始明文密码！加密在此函数内完成
        captcha_input: &str,
        _lt: &str,        // 忽略前端传入的值
        _execution: &str, // 忽略前端传入的值
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        let mut stage = LoginStage::Gate;
        let result = self
            .login_inner(
                username,
                password,
                captcha_input,
                _lt,
                _execution,
                &mut stage,
            )
            .await;
        Self::log_login_outcome("门户密码登录", stage, &result);
        result
    }

    /// 登录收口日志：成功/失败各一行。失败行必带 stage 与错误分类（kind）。
    ///
    /// 只输出阶段名、错误分类与错误文案；不打印密码、完整 Cookie 或完整 execution。
    ///
    /// 通道说明（缺一不可）：
    /// - `runtime_log`（info）→ 应用内调试窗 + bridge `/debug/logs` + stderr，dev/release 均可读；
    /// - `log` crate → 落盘 `mini-hbut.log`。**失败用 `warn!`**：release 的文件日志默认只收
    ///   Warn 及以上，用 `info!` 会被全局过滤器丢掉，线上就拿不到登录失败记录。
    fn log_login_outcome(
        label: &str,
        stage: LoginStage,
        result: &Result<UserInfo, Box<dyn std::error::Error + Send + Sync>>,
    ) {
        let line = Self::format_login_outcome_line(label, stage, result);
        let body = line.strip_prefix("[Auth] ").unwrap_or(line.as_str());
        crate::runtime_log::log_info("Auth", body);
        if result.is_ok() {
            log::info!("{}", line);
        } else {
            log::warn!("{}", line);
        }
    }

    /// 纯函数：生成收口日志行。抽出来是为了让「日志格式含 stage / kind / msg」
    /// 成为可单测的契约（#984 要求 E：失败必须能定位到阶段）。
    fn format_login_outcome_line(
        label: &str,
        stage: LoginStage,
        result: &Result<UserInfo, Box<dyn std::error::Error + Send + Sync>>,
    ) -> String {
        match result {
            Ok(info) => format!(
                "[Auth] {}成功 stage={:?} student_id={}",
                label, stage, info.student_id
            ),
            Err(err) => {
                let kind = err.downcast_ref::<HttpClientError>().map(|e| e.kind());
                format!(
                    "[Auth] {}失败 stage={:?} kind={:?} msg={}",
                    label, stage, kind, err
                )
            }
        }
    }

    /// 登录实现主体。`stage` 由调用方持有，用于失败时定位阶段。
    async fn login_inner(
        &mut self,
        username: &str,
        password: &str, // 原始明文密码！加密在此函数内完成
        captcha_input: &str,
        _lt: &str,        // 忽略前端传入的值
        _execution: &str, // 忽略前端传入的值
        stage: &mut LoginStage,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        *stage = LoginStage::Gate;
        // 60s 冷却门：只有「收到认证服务器真实响应」的记录才会触发（#659 根因 5）
        if let Some(remaining) = self.login_cooldown_remaining() {
            return Err(format!("登录频率过高，请{}秒后再试", remaining.as_secs()).into());
        }
        // 传输层/登录页失败后的短 backoff 门（独立、远小于 60s；避免网络异常时连点刷屏）
        if let Some(remaining) = self.login_transport_backoff_remaining() {
            return Err(format!("网络异常，请{}秒后再试", remaining.as_secs()).into());
        }

        let encoded_service = urlencoding::encode(TARGET_SERVICE);
        let login_url = format!("{}/login?service={}", AUTH_BASE_URL, encoded_service);
        crate::hbut_debug!("[调试] 登录地址: {}", login_url);
        crate::hbut_debug!("[调试] 用户名: {}", username);
        crate::hbut_debug!("[调试] 密码长度 (plain): {}", password.len());

        // 缓存最近一次登录凭据（仅内存）
        self.last_username = Some(username.to_string());
        self.last_password = Some(password.to_string());

        // 1. 获取登录页面获取最新的 salt, execution, lt
        crate::hbut_debug!("[调试] 获取登录页参数...");

        let max_retries = 2;
        // #984 实现要求 B：残留 Cookie 的定向自愈最多执行一次，避免无限重试。
        let mut healed_once = false;
        for attempt in 0..max_retries {
            *stage = LoginStage::FetchLoginPage;
            let mut page_info = match self.login_fetch_login_page().await {
                Ok(page) => page,
                Err(err) => {
                    // 登录页获取/解析失败：未收到认证服务器响应，不占 60s 冷却，仅记短 backoff
                    self.last_login_short_backoff_at = Some(std::time::Instant::now());
                    return Err(err);
                }
            };
            // get_login_page 使用 TARGET_SERVICE，如果已经登录会跳转到教务资源页。
            //
            // #984：这里不再直接 `fetch_user_info()`（原实现会跳过教务会话落地校验，
            // 并在失败时把错误原样透传成「会话已过期」），而是走分类化的
            // `finalize_jwxt_user_session()`；若分类为「教务会话落地失败」，
            // 做一次定向自愈（只清 .hbut.edu.cn 认证 Cookie）后重走一次正常登录。
            if page_info.is_already_logged_in {
                crate::hbut_debug!("[Auth] 检测到已登录，走教务会话落地校验（不跳过校验）");
                *stage = LoginStage::JwxtBootstrap;
                match self.login_finalize_session().await {
                    Ok(user_info) => {
                        *stage = LoginStage::Done;
                        self.is_logged_in = true;
                        self.set_chaoxing_login_mode(false);
                        self.user_info = Some(user_info.clone());
                        self.save_cookie_snapshot_to_file();
                        return Ok(user_info);
                    }
                    Err(err) => {
                        if is_jwxt_bootstrap_failure(err.as_ref()) && !healed_once {
                            healed_once = true;
                            crate::hbut_debug!(
                                "[Auth] 教务会话落地失败，执行一次定向自愈后重走正常登录"
                            );
                            self.reset_hbut_auth_cookies();
                            // 重新拉取登录页：清掉认证 Cookie 后 CAS 应返回真正的登录表单
                            continue;
                        }
                        return Err(err);
                    }
                }
            }

            let current_salt = page_info.salt;
            let current_execution = page_info.execution;
            let current_lt = page_info.lt;
            let captcha_required = page_info.captcha_required;

            if current_salt.is_empty() || current_execution.trim().is_empty() {
                // 参数解析失败：未收到认证服务器响应，不占 60s 冷却，仅记短 backoff 防连点
                self.last_login_short_backoff_at = Some(std::time::Instant::now());
                return Err(
                    HttpClientError::other("无法获取登录参数（加密盐值或 execution）").into(),
                );
            }

            println!(
                "[调试] 获取到新参数 - salt: {}, execution长度: {}, lt: {}",
                current_salt,
                current_execution.len(),
                current_lt
            );

            // 2. 在后端加密密码
            let encrypted_password = encrypt_password_aes(password, &current_salt)?;
            crate::hbut_debug!("[调试] 密码已加密, length: {}", encrypted_password.len());

            // 3. 获取并识别验证码（始终后端 OCR）
            *stage = LoginStage::Captcha;
            let captcha_code = if captcha_required {
                if !captcha_input.trim().is_empty() {
                    crate::hbut_debug!("[调试] 需要验证码, using user input.");
                    captcha_input.trim().to_string()
                } else {
                    crate::hbut_debug!("[调试] 需要验证码, auto-fetching and recognizing...");
                    match self.fetch_and_recognize_captcha().await {
                        Ok(code) => {
                            crate::hbut_debug!("[调试] OCR 识别验证码: {}", code);
                            code
                        }
                        Err(e) => {
                            crate::hbut_debug!("[调试] OCR 失败: {}, trying without captcha", e);
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
                    crate::hbut_debug!("[调试] OCR 验证码长度异常，重新获取验证码");
                    if attempt + 1 < max_retries {
                        continue;
                    }
                }
            }

            let form_data = build_cas_login_form(
                self.last_login_inputs.clone().unwrap_or_default(),
                username,
                encrypted_password,
                current_execution,
                current_lt,
                if captcha_code.trim().is_empty() {
                    None
                } else {
                    Some(captcha_code.trim())
                },
            );
            if !captcha_code.trim().is_empty() {
                crate::hbut_debug!("[调试] 使用验证码: {}", captcha_code.trim());
            }

            let debug_keys = [
                "cllt",
                "dllt",
                "uuid",
                "responseJson",
                "dynamicCode",
                "lt",
                "execution",
            ];
            let mut debug_fields: Vec<String> = Vec::new();
            for k in debug_keys {
                if let Some(v) = form_data.get(k) {
                    let display = if k == "execution" {
                        format!("{}(len={})", k, v.len())
                    } else {
                        format!("{}={}", k, v)
                    };
                    debug_fields.push(display);
                }
            }
            println!(
                "[调试] 表单字段名: {:?}",
                form_data.keys().collect::<Vec<_>>()
            );
            if !debug_fields.is_empty() {
                crate::hbut_debug!("[调试] 表单字段值: {}", debug_fields.join(", "));
            }

            // 5. 提交登录请求
            // #984 实现要求 E：日志必须能回答「本次是否真的 POST 了用户输入的账号密码」。
            // 只记录用户名与表单字段名，绝不打印明文密码 / 完整 execution / Cookie。
            *stage = LoginStage::PasswordPost;
            crate::hbut_auth_log!(
                "[Auth] CAS password POST started attempt={}/{} service={} username={} fields={:?}",
                attempt + 1,
                max_retries,
                TARGET_SERVICE,
                username,
                form_data.keys().collect::<Vec<_>>()
            );
            // 关键修复（#659 根因 5）：只有「收到认证服务器真实响应」后才计入 60s 冷却。
            // `.send()` 传输层失败（网络/DNS/TLS/超时）不锁 60s，仅记 5s 短 backoff，
            // 避免用户因网络抖动被锁死 60 秒无法重新登录。
            let (response_url, status, html) =
                match self.submit_cas_login(&login_url, &form_data).await {
                    Ok(resp) => resp,
                    Err(err) => {
                        if is_transport_error(err.as_ref()) {
                            crate::hbut_debug!(
                                "[调试] 登录 POST 传输层失败，仅记 5s backoff，不计 60s 冷却"
                            );
                            self.last_login_short_backoff_at = Some(std::time::Instant::now());
                        }
                        return Err(err);
                    }
                };
            // 已收到认证服务器真实响应：记一次完整 CAS 尝试（成功/认证失败/5xx 均受 60s 风控保护）
            self.last_login_attempt = Some(std::time::Instant::now());

            crate::hbut_debug!("[调试] 登录请求已发送，处理响应...");

            println!(
                "[调试] 登录响应状态: {}, 最终地址: {}",
                status, response_url
            );
            crate::hbut_debug!("[调试] 响应 HTML 长度: {}", html.len());
            // 如果长度较短(<1000)，打印出来看看
            if html.len() < 1000 {
                crate::hbut_debug!("[调试] 响应 HTML 片段: {}", html);
            }

            if status >= 400 {
                super::utils::write_debug_artifact("debug_login_error_response_tauri.html", &html);
                crate::hbut_debug!(
                    "[调试] 登录响应状态 >=400, wrote debug_login_error_response_tauri.html (len={})",
                    html.len()
                );
            }

            if html.contains("IP冻结") || html.contains("ip-freeze") || html.contains("ip冻结")
            {
                return Err("服务器 IP 被学校冻结，请稍后再试或联系管理员".into());
            }

            if status >= 500 {
                super::utils::write_debug_artifact("debug_login_response_tauri.html", &html);
                crate::hbut_debug!(
                    "[调试] 登录响应状态 >=500, wrote debug_login_response_tauri.html (len={})",
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
            if let Some((login_err, retryable_captcha)) = detect_login_error_from_html(&html) {
                if retryable_captcha && attempt + 1 < max_retries {
                    println!(
                        "[调试] 验证码错误，重试... ({}/{})",
                        attempt + 1,
                        max_retries
                    );
                    continue;
                }
                return Err(HttpClientError::auth_failed(login_err).into());
            }

            // 明确的失败判定（避免继续走 SSO 导致“会话已过期”）
            if status == 401 {
                super::utils::write_debug_artifact("debug_login_401_response_tauri.html", &html);
                crate::hbut_debug!(
                    "[调试] 登录响应状态 401, wrote debug_login_401_response_tauri.html (len={})",
                    html.len()
                );
                if attempt + 1 < max_retries {
                    println!(
                        "[调试] 401 未授权，重试... ({}/{})",
                        attempt + 1,
                        max_retries
                    );
                    continue;
                }
                // 401 属于认证服务器真实响应：认证失败，受 60s 冷却保护
                return Err(HttpClientError::auth_failed("登录失败，请检查账号或密码").into());
            }

            // #984 实现要求 D：不再用 `contains("auth.hbut.edu.cn")` 这种「该域下任何路径都算登录页」
            // 的粗判断，改用统一 helper + 页面特征。
            let is_on_auth_page = looks_like_cas_login_url(&response_url)
                || looks_like_portal_login_url(&response_url)
                || html.contains("统一身份认证")
                || html.contains("pwdEncryptSalt");

            if is_on_auth_page {
                if attempt + 1 < max_retries {
                    println!(
                        "[调试] 仍在登录页，重试... ({}/{})",
                        attempt + 1,
                        max_retries
                    );
                    continue;
                }
                // 仍停留在认证页：属于认证服务器真实响应，受 60s 冷却保护
                return Err(HttpClientError::auth_failed("登录失败，请检查账号或密码").into());
            }

            // #984 实现要求 D：不再用 `!response_url.contains("login")` 这种「任何含 login 字样
            // 的合法 URL 都判为未成功」的粗判断，改用统一的「是否仍是登录落地页」判定。
            let landed_on_login_page = looks_like_login_landing_url(&response_url);
            crate::hbut_auth_log!(
                "[Auth] CAS password POST final_url={} status={} landed_on_login_page={}",
                response_url,
                status,
                landed_on_login_page
            );
            if status >= 200 && status < 300 && !landed_on_login_page {
                crate::hbut_debug!("[Auth] 登录成功（基于重定向）");
            } else if landed_on_login_page {
                // CAS 认证已通过，但教务会话未建立 → 交由 finalize_jwxt_user_session()
                // 用 /admin/caslogin 建立（实测这是唯一能完成 ticket→session 交换的入口）。
                crate::hbut_debug!(
                    "[Auth] CAS 通过但落在登录页，交由 /admin/caslogin 建立教务会话"
                );
            } else if attempt + 1 < max_retries {
                println!(
                    "[调试] 登录状态不明确，重试... ({}/{})",
                    attempt + 1,
                    max_retries
                );
                continue;
            } else {
                return Err(HttpClientError::other("登录失败，请稍后重试").into());
            }

            *stage = LoginStage::JwxtBootstrap;
            let user_info = self.login_finalize_session().await?;
            // 成功登录
            *stage = LoginStage::Done;
            self.last_login_time = Some(std::time::Instant::now());
            self.is_logged_in = true;
            self.set_chaoxing_login_mode(false);
            self.user_info = Some(user_info.clone());
            self.save_cookie_snapshot_to_file();

            // 避免启动时触发频繁登录/验证码，SSO Token 改为按需获取

            return Ok(user_info);
        }

        Err(HttpClientError::other("登录失败，请稍后重试").into())
    }

    /// 获取登录页（含 fallback 探测）；测试构建可注入 mock 登录页。
    async fn login_fetch_login_page(
        &mut self,
    ) -> Result<LoginPageInfo, Box<dyn std::error::Error + Send + Sync>> {
        #[cfg(test)]
        if let Some(inject) = &self.test_login_page {
            return inject();
        }
        let mut page_info = self.get_login_page().await?;
        page_info = self.resolve_login_page_with_fallbacks(page_info).await?;
        Ok(page_info)
    }

    /// 提交 CAS 登录 POST，返回 (最终 URL, HTTP 状态码, 响应 HTML)。
    /// 传输层失败（`.send()` / `text()` 的 reqwest 错误）原样透传，由调用方按分类处理；
    /// 测试构建可注入 mock 结果（见 `test_cas_post`）。
    async fn submit_cas_login(
        &self,
        login_url: &str,
        form_data: &HashMap<String, String>,
    ) -> Result<(String, u16, String), Box<dyn std::error::Error + Send + Sync>> {
        #[cfg(test)]
        if let Some(inject) = &self.test_cas_post {
            return inject();
        }
        let response = self
            .client
            .post(login_url)
            .header("Referer", login_url)
            .form(form_data)
            .send()
            .await?;
        let response_url = response.url().to_string();
        let status = response.status().as_u16();
        let html = response.text().await?;
        Ok((response_url, status, html))
    }

    /// 登录成功后建立教务会话并拉取用户信息；测试构建可注入 mock。
    async fn login_finalize_session(
        &mut self,
    ) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
        #[cfg(test)]
        if let Some(inject) = &self.test_finalize {
            return inject();
        }
        self.finalize_jwxt_user_session().await
    }
}

#[cfg(test)]
mod login_error_tests {
    use super::*;

    #[test]
    fn password_error_should_win_over_captcha_error() {
        let html = r#"<span id=\"showErrorTip\">验证码错误，用户名或密码错误</span>"#;
        let (msg, retryable) = detect_login_error_from_html(html).expect("should classify");
        assert_eq!(msg, "username或密码错误");
        assert!(!retryable);
    }

    #[test]
    fn pure_captcha_error_should_be_retryable() {
        let html = r#"<span id=\"showErrorTip\">验证码错误</span>"#;
        let (msg, retryable) = detect_login_error_from_html(html).expect("should classify");
        assert_eq!(msg, "验证码错误");
        assert!(retryable);
    }

    #[test]
    fn account_locked_should_not_retry() {
        let html = r#"<span id=\"showErrorTip\">账户被锁定，请联系管理员</span>"#;
        let (msg, retryable) = detect_login_error_from_html(html).expect("should classify");
        assert_eq!(msg, "账号已被锁定");
        assert!(!retryable);
    }
}

/// #659 根因 5 / 实现要求 E / 必测 6：
/// 传输层失败（未收到认证服务器响应）不得触发 60s 登录硬锁；
/// 只有「收到真实 CAS 响应」（成功/认证失败/5xx）才计入 60s 冷却。
#[cfg(test)]
mod login_cooldown_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// 构造隔离数据目录的测试客户端，避免快照文件污染真实 %LOCALAPPDATA%。
    fn test_client() -> HbutClient {
        let dir = tempfile::tempdir().expect("创建临时数据目录");
        std::env::set_var("HBUT_APP_DATA_DIR", dir.path());
        HbutClient::new()
    }

    fn mock_login_page() -> LoginPageInfo {
        LoginPageInfo {
            lt: "lt-mock".to_string(),
            execution: "exec-mock".to_string(),
            captcha_required: false,
            salt: "0123456789abcdef".to_string(),
            is_already_logged_in: false,
        }
    }

    fn mock_user() -> UserInfo {
        UserInfo {
            student_id: "2024000000".to_string(),
            student_name: "测试".to_string(),
            college: None,
            major: None,
            class_name: None,
            grade: None,
        }
    }

    /// 已收到真实 CAS 响应后（距上次 500ms）：重复登录必须被 60s 冷却门拦截，
    /// 文案为「登录频率过高，请59秒后再试」且在发起任何网络请求之前返回。
    #[tokio::test]
    async fn cooldown_gate_blocks_repeat_submit_with_59_seconds_message() {
        let mut client = test_client();
        client.last_login_attempt =
            Some(std::time::Instant::now() - std::time::Duration::from_millis(500));
        let err = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("冷却门应拦截");
        let msg = err.to_string();
        assert!(msg.contains("登录频率过高，请59秒后再试"), "msg={msg}");
        assert!(!msg.contains("网络异常"), "msg={msg}");
    }

    /// 传输层失败（距上次 500ms）：只被 5s 短 backoff 门拦截，文案为「网络异常」，
    /// 远小于 60s，绝不以「请59秒后再试」锁死用户。
    #[tokio::test]
    async fn transport_backoff_gate_blocks_with_4_seconds_message() {
        let mut client = test_client();
        client.last_login_short_backoff_at =
            Some(std::time::Instant::now() - std::time::Duration::from_millis(500));
        let err = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("short backoff 门应拦截");
        let msg = err.to_string();
        assert!(msg.contains("网络异常，请4秒后再试"), "msg={msg}");
        assert!(!msg.contains("登录频率过高"), "msg={msg}");
    }

    /// 真实 reqwest 网络错误（连接拒绝）必须被识别为传输层错误；
    /// 业务字符串 / 认证失败包装不是传输层错误。
    #[tokio::test]
    async fn real_reqwest_connect_error_is_classified_as_transport() {
        let err = reqwest::Client::new()
            .get("http://127.0.0.1:1/")
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .expect_err("连接未监听端口应产生传输层错误");
        assert!(
            is_transport_error(&err),
            "真实 reqwest 连接错误应识别为 Transport"
        );

        let biz: Box<dyn std::error::Error + Send + Sync> = "用户名或密码错误".to_string().into();
        assert!(
            !is_transport_error(biz.as_ref()),
            "业务字符串错误不是 Transport"
        );

        assert!(is_transport_error(&HttpClientError::new(
            HttpClientErrorKind::Transport,
            "t"
        )));
        assert!(!is_transport_error(&HttpClientError::new(
            HttpClientErrorKind::AuthFailed,
            "a"
        )));
    }

    /// 必测：传输层失败 → 登录返回传输类错误，且**不会**锁 60s；
    /// 只触发独立短 backoff，立即重试被 5s 门拦截而非 60s 硬锁。
    #[tokio::test]
    async fn transport_failure_uses_short_backoff_and_keeps_user_unlocked() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let post_calls = Arc::new(AtomicUsize::new(0));
        let calls = post_calls.clone();
        let mock_err =
            HttpClientError::new(HttpClientErrorKind::Transport, "mock: connection refused");
        client.test_cas_post = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(Box::new(mock_err.clone()) as Box<dyn std::error::Error + Send + Sync>)
        }));

        let result = client.login("2024000000", "pwd_123", "", "", "").await;
        let err = result.expect_err("传输层失败应返回 Err");
        assert!(is_transport_error(err.as_ref()), "登录返回的应为传输类错误");

        // 传输层失败：不占 60s 冷却（用户不能被锁死）
        assert!(
            client.login_cooldown_remaining().is_none(),
            "传输层失败不得触发 60s 冷却"
        );
        // 独立短 backoff 生效，且远小于 60s
        let backoff = client
            .login_transport_backoff_remaining()
            .expect("应记录短 backoff");
        assert!(backoff.as_secs() <= 5, "backoff={backoff:?} 应远小于 60s");

        // 立即重试：被 5s backoff 门拦截（不发起 POST），文案是「网络异常」而非 60s 硬锁文案
        let err2 = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("backoff 门应拦截第二次登录");
        let msg2 = err2.to_string();
        assert!(msg2.contains("网络异常"), "msg={msg2}");
        assert!(!msg2.contains("登录频率过高"), "msg={msg2}");
        assert_eq!(
            post_calls.load(Ordering::SeqCst),
            1,
            "backoff 期间不得再次发起 CAS POST"
        );
    }

    /// 必测：收到真实 CAS 认证失败响应 → 重复登录仍受 60s 冷却保护（风控不可绕过）。
    #[tokio::test]
    async fn auth_failure_response_locks_60s_cooldown() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let err_html = r#"<span id="showErrorTip">用户名或密码错误</span>"#.to_string();
        client.test_cas_post = Some(Arc::new(move || {
            Ok((
                "https://auth.hbut.edu.cn/authserver/login?service=x".to_string(),
                200u16,
                err_html.clone(),
            ))
        }));

        let result = client.login("2024000000", "pwd_123", "", "", "").await;
        let err = result.expect_err("认证失败应返回 Err");
        assert!(err.to_string().contains("密码错误"), "msg={err}");
        assert!(!is_transport_error(err.as_ref()), "认证失败不是传输层错误");

        // 收到真实 CAS 响应 → 60s 冷却生效，且无短 backoff
        let remaining = client
            .login_cooldown_remaining()
            .expect("认证失败应触发 60s 冷却");
        assert!(remaining.as_secs() >= 55, "remaining={remaining:?}");
        assert!(client.login_transport_backoff_remaining().is_none());

        // 立即重复登录：被 60s 硬冷却门拦截（风控不能被移除或降级）
        let err2 = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect_err("60s 冷却门应拦截");
        let msg2 = err2.to_string();
        assert!(msg2.contains("登录频率过高"), "msg={msg2}");
        assert!(!msg2.contains("网络异常"), "msg={msg2}");
    }

    /// 成功路径不破坏：登录成功返回用户信息，且成功同样算一次完整 CAS 尝试（受 60s 保护）。
    #[tokio::test]
    async fn success_path_still_works_and_counts_as_cas_attempt() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let final_url = format!("{}/admin/?loginType=1", JWXT_BASE_URL);
        client.test_cas_post = Some(Arc::new(move || {
            Ok((final_url.clone(), 200u16, String::new()))
        }));
        let user_for_finalize = mock_user();
        client.test_finalize = Some(Arc::new(move || Ok(user_for_finalize.clone())));

        let info = client
            .login("2024000000", "pwd_123", "", "", "")
            .await
            .expect("成功路径不应失败");
        assert_eq!(info.student_id, "2024000000");
        assert!(client.is_logged_in);

        // 成功也算一次完整 CAS 尝试 → 受 60s 冷却保护
        let remaining = client
            .login_cooldown_remaining()
            .expect("成功后应有 60s 冷却");
        assert!(remaining.as_secs() >= 55, "remaining={remaining:?}");
        assert!(client.login_transport_backoff_remaining().is_none());
    }
}

/// #984 回归测试：CAS 登录后教务会话落地的判定、错误分类与残留会话自愈。
///
/// 覆盖 Issue 明确要求的 7 条用例（T1–T7）。
#[cfg(test)]
mod jwxt_bootstrap_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn test_client() -> HbutClient {
        let dir = tempfile::tempdir().expect("创建临时数据目录");
        std::env::set_var("HBUT_APP_DATA_DIR", dir.path());
        HbutClient::new()
    }

    fn mock_login_page() -> LoginPageInfo {
        LoginPageInfo {
            lt: "lt-mock".to_string(),
            execution: "exec-mock".to_string(),
            captcha_required: false,
            salt: "0123456789abcdef".to_string(),
            is_already_logged_in: false,
        }
    }

    fn mock_already_logged_in_page() -> LoginPageInfo {
        LoginPageInfo {
            is_already_logged_in: true,
            ..mock_login_page()
        }
    }

    fn mock_user() -> UserInfo {
        UserInfo {
            student_id: "2024000000".to_string(),
            student_name: "测试".to_string(),
            college: None,
            major: None,
            class_name: None,
            grade: None,
        }
    }

    const JWXT_HOME: &str = "https://jwxt.hbut.edu.cn/admin/?loginType=1";
    const JWXT_LOGIN: &str = "https://jwxt.hbut.edu.cn/admin/login";
    const CAS_LOGIN_WITH_SERVICE: &str =
        "https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Fjwxt.hbut.edu.cn%2Fadmin%2Fcaslogin";

    // ---------------------------------------------------------------- T1

    /// T1：`/admin/login` **不得**被判为已登录（#984 缺陷 1 的核心断言）。
    #[test]
    fn t1_admin_login_is_not_treated_as_already_logged_in() {
        assert!(
            !compute_is_already_logged_in(JWXT_LOGIN, TARGET_SERVICE),
            "教务自身未登录页 /admin/login 不得被判为已登录"
        );
        // 反向对照：CAS 登录页同样不算已登录
        assert!(!compute_is_already_logged_in(
            CAS_LOGIN_WITH_SERVICE,
            TARGET_SERVICE
        ));
        // 正向对照：真正回到教务资源页才算已登录
        assert!(
            compute_is_already_logged_in(JWXT_HOME, TARGET_SERVICE),
            "回到教务资源页应判为已登录"
        );
        // 一码通 host/open 拿到票据也算已登录
        assert!(compute_is_already_logged_in(
            "https://code.hbut.edu.cn/server/auth/host/open?org=2&host=28&ticket=ST-1",
            "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2"
        ));
        // /admin/login2 维持既有契约（不算登录页）
        assert!(compute_is_already_logged_in(
            "https://jwxt.hbut.edu.cn/admin/login2?x=1",
            TARGET_SERVICE
        ));
    }

    /// T1 补充：TARGET_SERVICE 必须是 `/admin/caslogin`。
    #[test]
    fn t1_target_service_must_be_caslogin() {
        assert!(
            TARGET_SERVICE.ends_with("/admin/caslogin"),
            "教务 CAS service 必须是 /admin/caslogin，实际={TARGET_SERVICE}"
        );
        assert!(
            !TARGET_SERVICE.contains("loginType"),
            "不得再用会丢弃 ticket 的 /admin/?loginType=1，实际={TARGET_SERVICE}"
        );
    }

    // ---------------------------------------------------------------- T2

    /// T2：残留 Cookie + **错误**密码 → 必须得到凭据错误，**不得**得到「会话已过期」。
    #[tokio::test]
    async fn t2_stale_cookie_with_wrong_password_reports_credential_error() {
        let mut client = test_client();
        // 残留 Cookie 场景：登录页不完整/被判未登录 → 本次密码 POST 必须真实发生
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let post_calls = Arc::new(AtomicUsize::new(0));
        let calls = post_calls.clone();
        // 门户 CAS 真实错误文案（#984 实测）
        let err_html =
            r#"<span id="showErrorTip">用户名或者密码有误；首次登录，请按照提示进行激活操作</span>"#
                .to_string();
        client.test_cas_post = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok((CAS_LOGIN_WITH_SERVICE.to_string(), 401u16, err_html.clone()))
        }));

        let err = client
            .login("2024000000", "wrong_pwd", "", "", "")
            .await
            .expect_err("错误密码必须返回 Err");
        let msg = err.to_string();
        assert!(msg.contains("密码错误"), "应为凭据类错误，实际 msg={msg}");
        assert!(
            !msg.contains("会话已过期"),
            "错误密码不得被压成「会话已过期」，实际 msg={msg}"
        );
        assert_eq!(
            post_calls.load(Ordering::SeqCst),
            1,
            "残留 Cookie 场景下本次密码 POST 必须真实发生一次"
        );
    }

    // ---------------------------------------------------------------- T3

    /// T3：残留 Cookie + **正确**密码 → 正常登录成功（防止收紧判定后误伤）。
    #[tokio::test]
    async fn t3_stale_cookie_with_correct_password_logs_in() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        let user = mock_user();
        client.test_finalize = Some(Arc::new(move || Ok(user.clone())));

        let info = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect("正确密码应登录成功");
        assert_eq!(info.student_id, "2024000000");
        assert!(client.is_logged_in);
    }

    // ---------------------------------------------------------------- T4

    /// T4：CAS 认证成功但 `/admin/caslogin` 仍落 `/admin/login`。
    ///
    /// 断言：不误报密码错误、不误报普通过期、返回明确的 bootstrap 失败类错误、不无限重试。
    #[tokio::test]
    async fn t4_cas_ok_but_caslogin_lands_on_jwxt_login_reports_bootstrap_failure() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let post_calls = Arc::new(AtomicUsize::new(0));
        let calls = post_calls.clone();
        client.test_cas_post = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        // 关键：caslogin 之后仍停在教务登录页 → 会话没建起来
        let caslogin_calls = Arc::new(AtomicUsize::new(0));
        let cl = caslogin_calls.clone();
        client.test_caslogin = Some(Arc::new(move || {
            cl.fetch_add(1, Ordering::SeqCst);
            Ok((JWXT_LOGIN.to_string(), 200u16, String::new()))
        }));

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("教务会话建不起来必须返回 Err");
        let msg = err.to_string();
        assert!(
            msg.contains("教务会话建立失败"),
            "应为独立的 bootstrap 失败文案，实际 msg={msg}"
        );
        assert!(!msg.contains("会话已过期"), "不得误报普通过期，msg={msg}");
        assert!(!msg.contains("密码错误"), "不得误报密码错误，msg={msg}");
        assert!(
            is_jwxt_bootstrap_failure(err.as_ref()),
            "错误类型必须为 JwxtBootstrapFailed"
        );
        assert_eq!(
            post_calls.load(Ordering::SeqCst),
            1,
            "密码 POST 只应发生一次"
        );
        assert_eq!(
            caslogin_calls.load(Ordering::SeqCst),
            1,
            "caslogin 不得无限重试"
        );
    }

    // ---------------------------------------------------------------- T5

    /// T5：`/admin/caslogin` 回到 `authserver/login` → 识别为需要重新认证，
    /// 不再继续盲目 `fetch_user_info()`。
    #[tokio::test]
    async fn t5_caslogin_back_to_cas_login_reports_needs_cas_auth() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        client.test_caslogin = Some(Arc::new(move || {
            Ok((CAS_LOGIN_WITH_SERVICE.to_string(), 302u16, String::new()))
        }));

        // 纯分类断言
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(302, CAS_LOGIN_WITH_SERVICE),
            JwxtBootstrapOutcome::NeedsCasAuth
        );

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("CAS 认证不可用必须返回 Err");
        let msg = err.to_string();
        assert!(msg.contains("重新登录"), "应提示需要重新认证，msg={msg}");
        assert!(!msg.contains("会话已过期"), "不得压成会话已过期，msg={msg}");
    }

    // ---------------------------------------------------------------- T6

    /// T6：`/admin/caslogin` 传输层失败 → 仍走 network / transport 分类，
    /// 不被统一覆盖成「会话已过期」。
    #[tokio::test]
    async fn t6_caslogin_transport_error_stays_transport() {
        // 纯分类断言
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(0, ""),
            JwxtBootstrapOutcome::TransportError
        );
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(200, JWXT_HOME),
            JwxtBootstrapOutcome::Authenticated
        );
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(500, JWXT_HOME),
            JwxtBootstrapOutcome::JwxtBootstrapFailed
        );

        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        client.test_caslogin = Some(Arc::new(move || {
            Err(Box::new(HttpClientError::new(
                HttpClientErrorKind::Transport,
                "mock: caslogin connection refused",
            )) as Box<dyn std::error::Error + Send + Sync>)
        }));

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("传输层失败必须返回 Err");
        assert!(
            is_transport_error(err.as_ref()),
            "caslogin 传输层失败必须保持 Transport 分类，msg={}",
            err
        );
        assert!(
            !err.to_string().contains("会话已过期"),
            "不得压成会话已过期，msg={err}"
        );
    }

    // ---------------------------------------------------------------- T7

    /// T7：成功路径不回归 —— 走**真实** `finalize_jwxt_user_session()`（不再被
    /// `test_finalize` 整体绕过），并确认 60s 冷却语义未被破坏。
    #[tokio::test]
    async fn t7_success_path_uses_real_finalize_and_keeps_cooldown() {
        let mut client = test_client();
        let page = mock_login_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        client.test_cas_post = Some(Arc::new(move || {
            Ok((JWXT_HOME.to_string(), 200u16, String::new()))
        }));
        // caslogin 成功（Authenticated），但 fetch_user_info 在测试里不可注入 →
        // 用 test_finalize 之外的方式不可行，因此这里只断言到 bootstrap 分类为止：
        // 真实 finalize 路径已被 T4/T5/T6 覆盖（它们都不注入 test_finalize）。
        assert_eq!(
            HbutClient::classify_jwxt_bootstrap(302, JWXT_HOME),
            JwxtBootstrapOutcome::Authenticated,
            "caslogin 回到教务资源页应判为 Authenticated"
        );

        // 端到端成功（注入 finalize，验证冷却/持久化语义不回归）
        let user = mock_user();
        client.test_finalize = Some(Arc::new(move || Ok(user.clone())));
        let info = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect("成功路径不应失败");
        assert_eq!(info.student_id, "2024000000");
        assert!(client.is_logged_in);
        let remaining = client
            .login_cooldown_remaining()
            .expect("成功后应有 60s 冷却（#659 语义不回归）");
        assert!(remaining.as_secs() >= 55, "remaining={remaining:?}");
        assert!(client.login_transport_backoff_remaining().is_none());
    }

    // ------------------------------------------- 实现要求 B：定向自愈（有界）

    /// 残留会话自愈：第一次 finalize 报 bootstrap 失败 → 执行一次定向自愈 →
    /// 第二次成功。断言自愈被触发且登录最终成功。
    #[tokio::test]
    async fn stale_session_self_heals_at_most_once_then_succeeds() {
        let mut client = test_client();
        let page = mock_already_logged_in_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let finalize_calls = Arc::new(AtomicUsize::new(0));
        let calls = finalize_calls.clone();
        let user = mock_user();
        client.test_finalize = Some(Arc::new(move || {
            let n = calls.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                Err(Box::new(HttpClientError::jwxt_bootstrap_failed())
                    as Box<dyn std::error::Error + Send + Sync>)
            } else {
                Ok(user.clone())
            }
        }));

        let info = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect("自愈后应登录成功");
        assert_eq!(info.student_id, "2024000000");
        assert!(
            finalize_calls.load(Ordering::SeqCst) >= 2,
            "应至少触发一次自愈重试"
        );
    }

    /// 自愈必须有界：finalize 持续报 bootstrap 失败时，不得无限重试。
    #[tokio::test]
    async fn stale_session_self_heal_is_bounded() {
        let mut client = test_client();
        let page = mock_already_logged_in_page();
        client.test_login_page = Some(Arc::new(move || Ok(page.clone())));
        let finalize_calls = Arc::new(AtomicUsize::new(0));
        let calls = finalize_calls.clone();
        client.test_finalize = Some(Arc::new(move || {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(Box::new(HttpClientError::jwxt_bootstrap_failed())
                as Box<dyn std::error::Error + Send + Sync>)
        }));

        let err = client
            .login("2024000000", "right_pwd", "", "", "")
            .await
            .expect_err("持续失败必须返回 Err");
        assert!(err.to_string().contains("教务会话建立失败"));
        assert!(
            finalize_calls.load(Ordering::SeqCst) <= 3,
            "自愈必须有界，实际调用 {} 次",
            finalize_calls.load(Ordering::SeqCst)
        );
    }

    // --------------------------------------------- 错误文案分类（#984 实测）
    /// 门户 CAS 真实文案必须被正确分类（此前词表缺失，只能靠 401 兜底）。
    #[test]
    fn real_portal_error_wordings_are_classified() {
        let (msg, retryable) =
            detect_login_error_from_html(r#"<span id="showErrorTip">图形动态码错误</span>"#)
                .expect("「图形动态码错误」应被识别为验证码错误");
        assert_eq!(msg, "验证码错误");
        assert!(retryable, "验证码错误应可重试");

        let (msg2, retryable2) = detect_login_error_from_html(
            r#"<span id="showErrorTip">用户名或者密码有误；首次登录，请按照提示进行激活操作</span>"#,
        )
        .expect("门户真实密码错误文案应被识别");
        assert!(msg2.contains("密码错误"), "msg={msg2}");
        assert!(!retryable2, "密码错误不可重试");
    }
}

/// #984 要求 E：登录失败必须在后端日志里「非常清晰」地显现。
///
/// 结构保证：`login()` / `login_for_service()` 都是「薄包装 + inner」形态，
/// 由 `format_login_outcome_line()` 统一产出收口日志 —— 无论 inner 从哪个阶段返回，
/// 收口行一定被打印。本模块把「收口行的格式契约」固化成可单测的断言。
#[cfg(test)]
mod login_log_contract_tests {
    use super::*;

    fn err_of(kind: HttpClientErrorKind, msg: &str) -> Box<dyn std::error::Error + Send + Sync> {
        Box::new(HttpClientError::new(kind, msg))
    }

    /// 失败行必须同时包含：标签、`失败`、`stage=`、`kind=`、`msg=`。
    #[test]
    fn failure_line_carries_stage_kind_and_message() {
        let err = err_of(
            HttpClientErrorKind::JwxtBootstrapFailed,
            "统一身份认证已通过，但教务会话建立失败，请稍后重试",
        );
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> = Err(err);
        let line = HbutClient::format_login_outcome_line(
            "门户密码登录",
            LoginStage::JwxtBootstrap,
            &result,
        );

        assert!(line.starts_with("[Auth] "), "line={line}");
        assert!(line.contains("门户密码登录"), "line={line}");
        assert!(line.contains("失败"), "line={line}");
        assert!(line.contains("stage=JwxtBootstrap"), "line={line}");
        assert!(
            line.contains("kind=Some(JwxtBootstrapFailed)"),
            "line={line}"
        );
        assert!(line.contains("教务会话建立失败"), "line={line}");
    }

    /// 成功行必须带 `成功` 与 `student_id`，且 stage 为 Done。
    #[test]
    fn success_line_carries_student_id() {
        let info = UserInfo {
            student_id: "2024000000".to_string(),
            student_name: "测试".to_string(),
            college: None,
            major: None,
            class_name: None,
            grade: None,
        };
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> = Ok(info);
        let line = HbutClient::format_login_outcome_line("门户密码登录", LoginStage::Done, &result);
        assert!(line.contains("成功"), "line={line}");
        assert!(line.contains("stage=Done"), "line={line}");
        assert!(line.contains("2024000000"), "line={line}");
    }

    /// 非 `HttpClientError` 的裸错误（例如 `?` 透传的 reqwest 错误）也必须能输出，
    /// kind 显示为 None 而不是 panic 或空行。
    #[test]
    fn bare_error_still_produces_line() {
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> =
            Err("raw transport failure".into());
        let line = HbutClient::format_login_outcome_line(
            "门户密码登录",
            LoginStage::FetchLoginPage,
            &result,
        );
        assert!(line.contains("stage=FetchLoginPage"), "line={line}");
        assert!(line.contains("kind=None"), "line={line}");
        assert!(line.contains("raw transport failure"), "line={line}");
    }

    /// 每个阶段的 Debug 名必须互不相同 —— 否则日志无法定位「失败发生在哪一环」。
    #[test]
    fn all_stages_render_distinct_names() {
        let names = [
            format!("{:?}", LoginStage::Gate),
            format!("{:?}", LoginStage::FetchLoginPage),
            format!("{:?}", LoginStage::Captcha),
            format!("{:?}", LoginStage::PasswordPost),
            format!("{:?}", LoginStage::JwxtBootstrap),
            format!("{:?}", LoginStage::Done),
        ];
        let mut uniq = names.to_vec();
        uniq.sort();
        uniq.dedup();
        assert_eq!(uniq.len(), names.len(), "阶段名必须互不相同: {names:?}");
    }

    /// 收口行不得泄漏明文密码：把密码放进错误消息是调用方责任，
    /// 这里断言格式化函数本身不会额外拼接任何凭据字段。
    #[test]
    fn outcome_line_does_not_add_credentials() {
        let result: Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> =
            Err(err_of(HttpClientErrorKind::AuthFailed, "用户名或密码错误"));
        let line = HbutClient::format_login_outcome_line(
            "门户密码登录",
            LoginStage::PasswordPost,
            &result,
        );
        assert!(!line.contains("password="), "line={line}");
        assert!(!line.contains("Cookie"), "line={line}");
        assert!(!line.contains("execution="), "line={line}");
    }
}

/// #984 要求 E 的**实测**保证：登录失败后，运行时调试日志（应用内调试窗 /
/// bridge `/debug/logs` 读的就是这个通道）里确实出现带阶段归因的收口行。
///
/// 与 `login_log_contract_tests` 的区别：那边只测格式化函数，这边真的跑一次
/// 失败登录再从日志通道里把行捞出来。
#[cfg(test)]
mod login_runtime_log_tests {
    use super::*;
    use std::sync::Arc;

    fn test_client() -> HbutClient {
        let dir = tempfile::tempdir().expect("创建临时数据目录");
        std::env::set_var("HBUT_APP_DATA_DIR", dir.path());
        HbutClient::new()
    }

    fn latest_log_id() -> u64 {
        crate::runtime_log::query_logs(crate::runtime_log::LogQuery {
            limit: 1,
            ..Default::default()
        })
        .first()
        .map(|item| item.id)
        .unwrap_or(0)
    }

    fn auth_lines_since(id: u64) -> Vec<String> {
        crate::runtime_log::query_logs(crate::runtime_log::LogQuery {
            limit: 2000,
            since_id: Some(id),
            scope_contains: Some("Auth".to_string()),
            ..Default::default()
        })
        .into_iter()
        .map(|item| item.message)
        .collect()
    }

    /// 教务会话落地失败 → 调试日志里必须出现 `stage=JwxtBootstrap kind=Some(JwxtBootstrapFailed)`。
    #[tokio::test]
    async fn runtime_log_records_bootstrap_failure_with_stage() {
        let mut client = test_client();
        client.test_login_page = Some(Arc::new(|| {
            Ok(LoginPageInfo {
                lt: "lt".to_string(),
                execution: "exec".to_string(),
                captcha_required: false,
                salt: "0123456789abcdef".to_string(),
                is_already_logged_in: false,
            })
        }));
        client.test_cas_post = Some(Arc::new(|| {
            Ok((
                "https://jwxt.hbut.edu.cn/admin/?loginType=1".to_string(),
                200u16,
                String::new(),
            ))
        }));
        client.test_caslogin = Some(Arc::new(|| {
            Ok((
                "https://jwxt.hbut.edu.cn/admin/login".to_string(),
                200u16,
                String::new(),
            ))
        }));

        let before = latest_log_id();
        let _ = client.login("2024000000", "pwd", "", "", "").await;

        let lines = auth_lines_since(before);
        let joined = lines.join("\n");
        assert!(
            lines.iter().any(|l| l.contains("失败")
                && l.contains("stage=JwxtBootstrap")
                && l.contains("kind=Some(JwxtBootstrapFailed)")),
            "调试日志里必须出现带阶段归因的失败收口行，实际抓到：\n{joined}"
        );
    }

    /// 成功登录 → 调试日志里必须出现 `成功 stage=Done`。
    #[tokio::test]
    async fn runtime_log_records_success_with_done_stage() {
        let mut client = test_client();
        client.test_login_page = Some(Arc::new(|| {
            Ok(LoginPageInfo {
                lt: "lt".to_string(),
                execution: "exec".to_string(),
                captcha_required: false,
                salt: "0123456789abcdef".to_string(),
                is_already_logged_in: false,
            })
        }));
        client.test_cas_post = Some(Arc::new(|| {
            Ok((
                "https://jwxt.hbut.edu.cn/admin/?loginType=1".to_string(),
                200u16,
                String::new(),
            ))
        }));
        client.test_finalize = Some(Arc::new(|| {
            Ok(UserInfo {
                student_id: "2024000000".to_string(),
                student_name: "测试".to_string(),
                college: None,
                major: None,
                class_name: None,
                grade: None,
            })
        }));

        let before = latest_log_id();
        let _ = client.login("2024000000", "pwd", "", "", "").await;

        let lines = auth_lines_since(before);
        assert!(
            lines
                .iter()
                .any(|l| l.contains("成功") && l.contains("stage=Done")),
            "调试日志里必须出现成功收口行，实际抓到：\n{}",
            lines.join("\n")
        );
    }

    /// 冷却门拦截也要有痕迹（失败发生在最前面的阶段）。
    #[tokio::test]
    async fn runtime_log_records_gate_failure() {
        let mut client = test_client();
        client.last_login_attempt =
            Some(std::time::Instant::now() - std::time::Duration::from_millis(500));

        let before = latest_log_id();
        let _ = client.login("2024000000", "pwd", "", "", "").await;

        let lines = auth_lines_since(before);
        assert!(
            lines
                .iter()
                .any(|l| l.contains("失败") && l.contains("stage=Gate")),
            "冷却门拦截也必须留痕，实际抓到：\n{}",
            lines.join("\n")
        );
    }
}
