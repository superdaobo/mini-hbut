//! eportal `InterFace.do` 登录适配器。
//!
//! eportal 为华为/新华三（H3C）校园网认证协议，登录流程：
//! 1. GET `/eportal/index.jsp` 打开认证页；
//! 2. POST `/eportal/InterFace.do?method=login` 提交表单完成认证。
//!
//! 路径与方法均为协议固定值，不是凭据。

use reqwest::Client;
use std::time::Duration;

const LOGIN_TIMEOUT: Duration = Duration::from_secs(8);

/// eportal 认证页路径（协议固定）。
const INDEX_JSP_PATH: &str = "/eportal/index.jsp";
/// eportal 登录接口路径（协议固定）。
const INTERFACE_DO_PATH: &str = "/eportal/InterFace.do";
/// 登录接口 method 参数值（协议固定）。
const LOGIN_METHOD: &str = "login";
/// passwordEncrypt 表单值：明文提交（协议固定，网关侧负责校验）。
const PASSWORD_ENCRYPT_DISABLED: &str = "false";

fn build_client() -> Result<Client, String> {
    Client::builder()
        .cookie_store(true)
        .redirect(reqwest::redirect::Policy::limited(6))
        .timeout(LOGIN_TIMEOUT)
        .user_agent("Mini-HBUT CampusNetwork/1.0")
        .build()
        .map_err(|e| e.to_string())
}

/// ASCII 大小写不敏感的子串查找，返回匹配起点（字节偏移）。
///
/// needle 须为 ASCII：匹配点必为 ASCII 字节，可安全用于 UTF-8 字符串切片。
fn find_ignore_case(haystack: &str, needle: &str) -> Option<usize> {
    let hay = haystack.as_bytes();
    let pat = needle.as_bytes();
    if pat.is_empty() || hay.len() < pat.len() {
        return None;
    }
    (0..=hay.len() - pat.len()).find(|&i| hay[i..i + pat.len()].eq_ignore_ascii_case(pat))
}

/// 折叠连续空白为单个空格并截断至 max_chars 个字符；无有效文本时返回 None。
fn collapse_and_truncate(text: &str, max_chars: usize) -> Option<String> {
    let mut collapsed = String::with_capacity(text.len());
    let mut pending_space = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            // 已有内容时记录一个待写入的空格，避免首尾空白。
            pending_space = !collapsed.is_empty();
            continue;
        }
        if pending_space {
            collapsed.push(' ');
            pending_space = false;
        }
        collapsed.push(ch);
    }
    let collapsed = collapsed.trim();
    if collapsed.is_empty() {
        return None;
    }
    if collapsed.chars().count() <= max_chars {
        return Some(collapsed.to_string());
    }
    let truncated: String = collapsed.chars().take(max_chars).collect();
    Some(format!("{truncated}…"))
}

/// 提取 HTML `<title>` 标签文本（大小写不敏感），无有效 title 时返回 None。
fn extract_html_title(body: &str) -> Option<String> {
    const OPEN_TAG: &str = "<title";
    let open = find_ignore_case(body, OPEN_TAG)?;
    let after_open = &body[open + OPEN_TAG.len()..];
    // 排除 <titlefoo> 这类前缀巧合：紧跟字符必须是 '>'、空白或 '/'。
    match after_open.chars().next()? {
        '>' | '/' => {}
        c if c.is_whitespace() => {}
        _ => return None,
    }
    let tag_end = after_open.find('>')?;
    let content = &after_open[tag_end + 1..];
    let close = find_ignore_case(content, "</title")?;
    Some(content[..close].to_string())
}

/// 从非 JSON 响应（通常是 queryString 过期时 302 重定向回的认证页 HTML）中
/// 提取可读文本作为失败原因：优先 `<title>`，否则去标签取正文；兜底通用文案。
fn extract_readable_text(body: &str) -> String {
    const MAX_LEN: usize = 120;
    const FALLBACK: &str = "认证服务器返回异常响应，请稍后重试";

    if let Some(title) = extract_html_title(body) {
        if let Some(text) = collapse_and_truncate(&title, MAX_LEN) {
            return text;
        }
    }

    // 去除所有 HTML 标签后取正文文本；在标签边界补一个空格，
    // 避免相邻块级标签的文本粘连（多余空格由 collapse_and_truncate 折叠）。
    let mut plain = String::with_capacity(body.len());
    let mut in_tag = false;
    let mut pending_space = false;
    for ch in body.chars() {
        match ch {
            '<' => {
                in_tag = true;
                pending_space = !plain.is_empty();
            }
            '>' => in_tag = false,
            c if !in_tag => {
                if pending_space {
                    plain.push(' ');
                    pending_space = false;
                }
                plain.push(c);
            }
            _ => {}
        }
    }
    if let Some(text) = collapse_and_truncate(&plain, MAX_LEN) {
        return text;
    }

    FALLBACK.to_string()
}

/// 解析 eportal 登录接口响应。
///
/// 判定规则（修复 #762 假成功）：
/// - 仅当响应体为 JSON 且含结构化成功标志（`result: "success"` 等 eportal
///   协议字段，或 `success: true` 布尔字段）才判成功；
/// - 非 JSON 响应（如重定向回的认证页 HTML，几乎必含「认证成功」字样）
///   一律判失败，禁止任何「包含 success/成功」的子串猜测。
fn parse_login_message(body: &str) -> (bool, String) {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return (false, "认证服务器返回空响应".to_string());
    }

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
        let result = json
            .get("result")
            .or_else(|| json.get("Result"))
            .and_then(|v| v.as_str().or_else(|| v.as_i64().map(|_| "1")))
            .unwrap_or("");
        let success = matches!(result, "success" | "1" | "ok")
            || json.get("success").and_then(|v| v.as_bool()) == Some(true);
        let message = json
            .get("message")
            .or_else(|| json.get("msg"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| {
                // 无 message/msg 字段时不透传 JSON 原文，改用通用文案。
                if success {
                    "登录成功".to_string()
                } else {
                    "登录失败".to_string()
                }
            });
        return (success, message);
    }

    // 非 JSON 响应一律判失败，message 取 HTML 可读摘要而非整段原文。
    (false, extract_readable_text(trimmed))
}

/// 执行 eportal 登录。
pub async fn eportal_login(
    gateway: &str,
    query_string: &str,
    user_id: &str,
    password: &str,
    service: &str,
) -> Result<(bool, String), String> {
    let gateway = gateway.trim().trim_end_matches('/');
    let query = query_string.trim().trim_start_matches('?');
    if gateway.is_empty() || query.is_empty() {
        return Err("网关或 queryString 无效".to_string());
    }
    if user_id.trim().is_empty() || password.is_empty() {
        return Err("学号或密码不能为空".to_string());
    }

    let client = build_client()?;
    let index_url = format!("{gateway}{INDEX_JSP_PATH}?{query}");
    // 打开认证页仅用于预热会话 Cookie（best-effort）：
    // 失败或非 2xx 都不阻断登录提交，最终以 InterFace.do 的响应为准。
    let _ = client.get(&index_url).send().await;

    let login_url = format!("{gateway}{INTERFACE_DO_PATH}?method={LOGIN_METHOD}");
    let resp = client
        .post(&login_url)
        .form(&[
            ("userId", user_id.trim()),
            ("password", password),
            ("service", service),
            ("queryString", query),
            ("passwordEncrypt", PASSWORD_ENCRYPT_DISABLED),
        ])
        .send()
        .await
        .map_err(|e| format!("提交认证失败: {e}"))?;

    // 非 2xx（网关异常页/重定向残留）直接判结构化失败并携带状态码，
    // 不读取响应体，避免把异常页面内容误当登录结果。
    let status = resp.status();
    if !status.is_success() {
        return Ok((
            false,
            format!("认证服务器响应异常（HTTP {}），请稍后重试", status.as_u16()),
        ));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取认证响应失败: {e}"))?;
    let (success, message) = parse_login_message(&body);
    Ok((success, message))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn parses_success_json() {
        let (ok, msg) = parse_login_message(r#"{"result":"success","message":"ok"}"#);
        assert!(ok);
        assert_eq!(msg, "ok");
    }

    #[test]
    fn parses_failure_json() {
        let (ok, _) = parse_login_message(r#"{"result":"fail","message":"密码错误"}"#);
        assert!(!ok);
    }

    /// #762 回归：认证页 HTML 几乎必含「认证成功」等文案，绝不能据此判成功。
    #[test]
    fn html_with_success_keyword_is_failure() {
        let html = r#"<html><head><title>校园网认证</title></head><body>
            <h3>登录成功后即可访问互联网</h3><form action="/eportal/InterFace.do"></form>
        </body></html>"#;
        let (ok, msg) = parse_login_message(html);
        assert!(!ok);
        // message 应为 <title> 提取结果，而非整段 HTML。
        assert_eq!(msg, "校园网认证");
        assert!(!msg.contains('<'));
    }

    /// 无 <title> 时应去标签提取正文文本。
    #[test]
    fn html_without_title_extracts_plain_text() {
        let html = r#"<html><body><div>网络异常</div><p>请重新登录</p></body></html>"#;
        let (ok, msg) = parse_login_message(html);
        assert!(!ok);
        assert_eq!(msg, "网络异常 请重新登录");
    }

    /// HTML 无任何可读文本时使用通用中文文案兜底。
    #[test]
    fn html_without_readable_text_uses_fallback() {
        let (ok, msg) = parse_login_message("   <div>   </div>   ");
        assert!(!ok);
        assert_eq!(msg, "认证服务器返回异常响应，请稍后重试");
    }

    /// 提取文本应截断至约 120 字符（含省略号）。
    #[test]
    fn long_html_message_is_truncated() {
        let body = format!("<html><body>{}</body></html>", "超".repeat(300));
        let (ok, msg) = parse_login_message(&body);
        assert!(!ok);
        assert_eq!(msg.chars().count(), 121);
        assert!(msg.ends_with('…'));
    }

    /// 纯文本（非 JSON、非 HTML）响应判失败并原样（截断后）返回。
    #[test]
    fn plain_text_response_is_failure() {
        let (ok, msg) = parse_login_message("请重新登录");
        assert!(!ok);
        assert_eq!(msg, "请重新登录");
    }

    /// 有效 JSON 但无 message/msg 字段时不得透传 JSON 原文。
    #[test]
    fn success_json_without_message_uses_generic_text() {
        let (ok, msg) = parse_login_message(r#"{"result":"success"}"#);
        assert!(ok);
        assert_eq!(msg, "登录成功");
        assert!(!msg.contains("result"));
    }

    #[test]
    fn failure_json_without_message_uses_generic_text() {
        let (ok, msg) = parse_login_message(r#"{"result":"fail"}"#);
        assert!(!ok);
        assert_eq!(msg, "登录失败");
        assert!(!msg.contains("result"));
    }

    /// <title> 提取的边界：大小写不敏感、带属性、前缀巧合不算 title。
    #[test]
    fn extract_html_title_edge_cases() {
        assert_eq!(
            extract_html_title("<HTML><TITLE>登录页</TITLE></HTML>").as_deref(),
            Some("登录页")
        );
        assert_eq!(
            extract_html_title(r#"<title lang="zh-CN">校园网</title>"#).as_deref(),
            Some("校园网")
        );
        // <titlefoo> 不是 title 标签，应返回 None。
        assert_eq!(extract_html_title("<titlefoo>x</titlefoo>"), None);
        // 有开无闭不提取。
        assert_eq!(extract_html_title("<title>未闭合"), None);
    }

    /// 登录接口返回非 2xx 时应得到结构化失败（含状态码），而不是 Err 或解析异常页。
    #[tokio::test]
    async fn eportal_login_non_2xx_is_structured_failure() {
        let server = MockServer::start().await;
        // 故意不挂 GET index.jsp 的 mock：验证 best-effort 不因 404 阻断。
        Mock::given(method("POST"))
            .and(path("/eportal/InterFace.do"))
            .respond_with(ResponseTemplate::new(500).set_body_string("server error"))
            .mount(&server)
            .await;

        let password = format!("secret-{}", std::process::id());
        let (ok, message) = eportal_login(
            server.uri().as_str(),
            "wlanuserip=10.0.0.2&wlanacname=logic",
            "2024123456",
            &password,
            "default",
        )
        .await
        .expect("非 2xx 应为结构化失败而非 Err");
        assert!(!ok);
        assert!(message.contains("500"), "失败文案应含状态码: {message}");
        assert!(!message.contains("server error"));
    }

    #[tokio::test]
    async fn eportal_login_mock_contract() {
        let server = MockServer::start().await;
        let gateway = server.uri();
        let query = "wlanuserip=10.0.0.2&wlanacname=logic";

        Mock::given(method("GET"))
            .and(path("/eportal/index.jsp"))
            .respond_with(ResponseTemplate::new(200).set_body_string("ok"))
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/eportal/InterFace.do"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(r#"{"result":"success","message":"dr1004"}"#),
            )
            .mount(&server)
            .await;

        // 测试密码在运行时构造，避免测试源码中出现明文密码学值。
        let password = format!("secret-{}", std::process::id());
        let (ok, message) = eportal_login(&gateway, query, "2024123456", &password, "default")
            .await
            .expect("mock login");
        assert!(ok);
        assert_eq!(message, "dr1004");
    }
}
