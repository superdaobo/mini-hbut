//! 学习通公共解析/网络工具（供 session / invite / resource / download 复用）。

use std::error::Error;
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use reqwest::Url;
use scraper::{Html, Selector};

pub(crate) type DynError = Box<dyn Error + Send + Sync>;

pub(super) fn err_box(message: impl Into<String>) -> DynError {
    Box::new(io::Error::other(message.into()))
}

pub(super) fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// 快速进出目录时常见瞬时连接失败，可安全重试。
pub(super) fn is_transient_reqwest_error(err: &reqwest::Error) -> bool {
    err.is_connect()
        || err.is_timeout()
        || err.is_request()
        || err
            .status()
            .map(|s| s.is_server_error() || s.as_u16() == 429)
            .unwrap_or(false)
}

/// GET + 有限次退避重试；仅对 send/读体前的瞬时错误重试。
pub(super) async fn get_text_with_retry(
    client: &crate::http_client::HbutClient,
    url: &str,
    referer: &str,
    label: &str,
) -> Result<(String, String), DynError> {
    const MAX_ATTEMPTS: u32 = 3;
    let mut last_err = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        if attempt > 1 {
            // 120ms / 280ms 退避，避免连打
            let delay_ms = 80u64 + 100u64 * u64::from(attempt - 1);
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        }
        let send = client
            .client
            .get(url)
            .header("Referer", referer)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            )
            .send()
            .await;
        let resp = match send {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                if is_transient_reqwest_error(&e) && attempt < MAX_ATTEMPTS {
                    eprintln!(
                        "[chaoxing_class] {} send 瞬时失败 attempt={}/{}: {}",
                        label, attempt, MAX_ATTEMPTS, last_err
                    );
                    continue;
                }
                return Err(err_box(format!(
                    "{}网络失败（已重试 {} 次）: {}",
                    label,
                    attempt,
                    short_net_err(&last_err)
                )));
            }
        };
        let final_url = resp.url().to_string();
        match resp.text().await {
            Ok(text) => return Ok((text, final_url)),
            Err(e) => {
                last_err = e.to_string();
                // 响应体中途断开也重试（快速导航时常见）
                if attempt < MAX_ATTEMPTS {
                    eprintln!(
                        "[chaoxing_class] {} body 失败 attempt={}/{}: {}",
                        label, attempt, MAX_ATTEMPTS, last_err
                    );
                    continue;
                }
                return Err(err_box(format!(
                    "{}读取失败（已重试 {} 次）: {}",
                    label,
                    attempt,
                    short_net_err(&last_err)
                )));
            }
        }
    }
    Err(err_box(format!(
        "{}网络失败: {}",
        label,
        short_net_err(&last_err)
    )))
}

pub(super) fn short_net_err(raw: &str) -> String {
    // 去掉超长 URL 噪声，保留错误类型
    let s = raw.trim();
    if let Some(idx) = s.find(" for url ") {
        let head = s[..idx].trim();
        if head.is_empty() {
            return "连接中断或超时，请重试".into();
        }
        // error sending request → 更口语
        if head.contains("error sending request") {
            return "连接中断或超时，请稍后重试（非业务权限问题）".into();
        }
        return head.to_string();
    }
    if s.len() > 160 {
        format!("{}…", &s[..160])
    } else {
        s.to_string()
    }
}

pub(super) fn normalize_url(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with("//") {
        return format!("https:{t}");
    }
    if t.starts_with("http://") {
        return format!("https://{}", t.trim_start_matches("http://"));
    }
    t.to_string()
}

pub(super) fn looks_like_login_html(html: &str) -> bool {
    let h = html.to_ascii_lowercase();
    h.contains("passport2.chaoxing.com")
        || h.contains("用户登录")
        || h.contains("id=\"loginname\"")
        || h.contains("name=\"uname\"")
        || (h.contains("login")
            && h.contains("password")
            && h.contains("fid")
            && !h.contains("courseid"))
}

/// getInviteCode 等接口应返回 JSON；HTML 文档视为会话失效（#375）
pub(super) fn looks_like_html_document(body: &str) -> bool {
    let t = body.trim_start();
    let lower = t.to_ascii_lowercase();
    lower.starts_with("<!doctype")
        || lower.starts_with("<html")
        || lower.starts_with("<head")
        || (lower.starts_with('<') && lower.contains("<html"))
}

/// 截断响应片段供日志/UI（去换行，防刷屏）
pub(super) fn clip_for_log(s: &str, max_chars: usize) -> String {
    s.chars()
        .take(max_chars)
        .collect::<String>()
        .replace(['\r', '\n', '\t'], " ")
        .trim()
        .to_string()
}

pub(super) fn looks_like_login_url(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.contains("passport2.chaoxing.com")
        || u.contains("authserver/login")
        || (u.contains("/login") && u.contains("refer="))
}

/// 资料列表页是否像「未加入班级 / 无权访问」（#360）
pub(super) fn looks_like_not_joined_html(html: &str) -> bool {
    let h = html.to_ascii_lowercase();
    // 常见中文提示（保留原文匹配，避免全 lower 弄丢中文）
    let raw = html;
    raw.contains("未加入")
        || raw.contains("请先加入")
        || raw.contains("不在该班")
        || raw.contains("不是该班")
        || raw.contains("无权访问")
        || raw.contains("无权限")
        || raw.contains("未选课")
        || raw.contains("已退课")
        || raw.contains("你还没有加入")
        || raw.contains("尚未加入")
        || h.contains("not in class")
        || h.contains("not join")
        || h.contains("no permission")
        || h.contains("access denied")
}

pub(super) fn extract_hidden(html: &str, id: &str) -> String {
    let re = Regex::new(&format!(
        r#"(?i)id\s*=\s*["']{}["'][^>]*value\s*=\s*["']([^"']*)["']|value\s*=\s*["']([^"']*)["'][^>]*id\s*=\s*["']{}["']"#,
        regex::escape(id),
        regex::escape(id)
    ))
    .ok();
    if let Some(re) = re {
        if let Some(c) = re.captures(html) {
            return c
                .get(1)
                .or_else(|| c.get(2))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
        }
    }
    // name= 兜底
    let re2 = Regex::new(&format!(
        r#"(?i)name\s*=\s*["']{}["'][^>]*value\s*=\s*["']([^"']*)["']|value\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']{}["']"#,
        regex::escape(id),
        regex::escape(id)
    ))
    .ok();
    if let Some(re2) = re2 {
        if let Some(c) = re2.captures(html) {
            return c
                .get(1)
                .or_else(|| c.get(2))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
        }
    }
    String::new()
}

pub(super) fn extract_js_or_attr(html: &str, key: &str) -> String {
    // courseId: "123" / courseId='123' / "courseId":"123" / courseid=123
    let patterns = [
        format!(
            r#"(?i)["']?{}["']?\s*[:=]\s*["'](\d{{5,}})["']"#,
            regex::escape(key)
        ),
        format!(r#"(?i)\b{}=(\d{{5,}})\b"#, regex::escape(key)),
    ];
    for p in patterns {
        if let Ok(re) = Regex::new(&p) {
            if let Some(c) = re.captures(html) {
                if let Some(m) = c.get(1) {
                    return m.as_str().to_string();
                }
            }
        }
    }
    String::new()
}

pub(super) fn extract_from_url(url: &str, key: &str) -> String {
    let Ok(parsed) = Url::parse(url) else {
        return String::new();
    };
    for (k, v) in parsed.query_pairs() {
        if k.eq_ignore_ascii_case(key) && !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    String::new()
}

pub(super) fn extract_text_class(html: &str, class: &str) -> String {
    let doc = Html::parse_document(html);
    let sel = match Selector::parse(&format!(".{}", class)) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };
    doc.select(&sel)
        .next()
        .map(|n| n.text().collect::<String>().trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_hidden_reads_course_and_clazz_ids() {
        let html = r#"
            <input type="hidden" id="courseId" value="264356359" />
            <input id="clazzId" type="hidden" value="148246853"/>
            <input value="8b602bc2" id="addclzenc" type="hidden" />
            <input type="hidden" id="addclztimeStamp" value="1783844344019" />
        "#;
        assert_eq!(extract_hidden(html, "courseId"), "264356359");
        assert_eq!(extract_hidden(html, "clazzId"), "148246853");
        assert_eq!(extract_hidden(html, "addclzenc"), "8b602bc2");
        assert_eq!(extract_hidden(html, "addclztimeStamp"), "1783844344019");
    }

    #[test]
    fn extract_js_or_attr_reads_ids() {
        let html = r#"var courseId = "264356359"; clazzId:'148246853'"#;
        assert_eq!(extract_js_or_attr(html, "courseId"), "264356359");
        assert_eq!(extract_js_or_attr(html, "clazzId"), "148246853");
    }

    #[test]
    fn detect_login_html() {
        assert!(looks_like_login_html(
            r#"<title>用户登录</title><input id="loginName" />"#
        ));
        assert!(!looks_like_login_html(
            r#"<input id="courseId" value="1" /><div class="course-name">x</div>"#
        ));
    }

    #[test]
    fn normalize_url_upgrades_http_and_protocol_relative() {
        assert_eq!(
            normalize_url("//mooc1.chaoxing.com/a"),
            "https://mooc1.chaoxing.com/a"
        );
        assert_eq!(
            normalize_url("http://mooc1.chaoxing.com/a"),
            "https://mooc1.chaoxing.com/a"
        );
    }

    #[test]
    fn short_net_err_strips_long_url() {
        let raw = "error sending request for url (https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid=1&dataName=%E8%B5%84%E6%96)";
        let s = short_net_err(raw);
        assert!(!s.contains("mooc2-ans"));
        assert!(s.contains("重试") || s.contains("连接"));
    }
}
