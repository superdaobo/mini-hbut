//! 学校消息中心（教务通知 / 学习通收件箱）抓取与归一化。

use crate::http_client::HbutClient;
use crate::modules::online_learning;
use chrono::Local;
use regex::Regex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const CHAOXING_NOTICE_LIST_URL: &str =
    "https://notice.chaoxing.com/apis/other/getNoticeList?type=2&crossOrigin=true&pageSize=50";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchoolInboxItem {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub created_at: String,
    pub is_read: bool,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolInboxDetailResponse {
    pub id: String,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub is_read: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolInboxMarkReadResponse {
    pub id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolInboxResponse {
    pub items: Vec<SchoolInboxItem>,
    pub fetched_at: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn looks_like_login_redirect(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("authserver/login")
        || lower.contains("/login")
            && (lower.contains("cas") || lower.contains("passport"))
}

fn trim_summary(text: &str, max_len: usize) -> String {
    let collapsed = text
        .replace(['\r', '\n'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.chars().count() <= max_len {
        return collapsed;
    }
    let mut out = String::new();
    for ch in collapsed.chars().take(max_len.saturating_sub(1)) {
        out.push(ch);
    }
    out.push('…');
    out
}

fn json_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn is_chaoxing_login_mode(login_mode: &str) -> bool {
    let mode = login_mode.trim().to_lowercase();
    mode.starts_with("chaoxing")
}

pub fn parse_normalized_item_id(item_id: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = item_id.splitn(3, ':').collect();
    if parts.len() != 3 {
        return None;
    }
    let source = match parts[0] {
        "portal" | "chaoxing" => parts[0].to_string(),
        _ => return None,
    };
    if parts[1].is_empty() || parts[2].is_empty() {
        return None;
    }
    Some((source, parts[2].to_string()))
}

fn parse_chaoxing_attachment_links(value: Option<&Value>) -> Vec<(String, String)> {
    let raw = json_string(value);
    if raw.is_empty() {
        return Vec::new();
    }
    let parsed = serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null);
    let Some(items) = parsed.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let name = item
                .pointer("/att_clouddisk/name")
                .and_then(|v| v.as_str())
                .unwrap_or("附件")
                .trim()
                .to_string();
            let url = item
                .pointer("/att_clouddisk/downPath")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())?;
            Some((name, url.to_string()))
        })
        .collect()
}

fn append_attachment_links_html(body: &str, attachments: &[(String, String)]) -> String {
    if attachments.is_empty() {
        return body.trim().to_string();
    }
    let mut out = body.trim().to_string();
    if !out.is_empty() {
        out.push_str("<br/><br/>");
    }
    out.push_str("<p><strong>附件</strong></p><ul>");
    for (name, url) in attachments {
        out.push_str(&format!(
            "<li><a href=\"{url}\" target=\"_blank\" rel=\"noopener noreferrer\">{name}</a></li>"
        ));
    }
    out.push_str("</ul>");
    out
}

fn extract_portal_detail_body(html: &str) -> String {
    let document = Html::parse_document(html);
    let selectors = [
        ".detail-content",
        ".notice-content",
        ".content",
        "#content",
        ".article-content",
        "article",
    ];
    for selector_text in selectors {
        if let Ok(selector) = Selector::parse(selector_text) {
            if let Some(node) = document.select(&selector).next() {
                let text = node.html().trim().to_string();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }

    if let Ok(re) = Regex::new(r#"(?is)<body[^>]*>(.*)</body>"#) {
        if let Some(caps) = re.captures(html) {
            if let Some(body) = caps.get(1) {
                let text = body.as_str().trim().to_string();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }

    html.trim().to_string()
}

pub fn parse_portal_tzsjx_payload(payload: &Value) -> Vec<SchoolInboxItem> {
    let rows = payload
        .get("results")
        .or_else(|| payload.get("rows"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    rows.into_iter()
        .filter_map(|row| {
            let id_raw = json_string(row.get("id"));
            if id_raw.is_empty() {
                return None;
            }
            let title = json_string(row.get("title"));
            let content = json_string(row.get("content"));
            let release_date = json_string(row.get("releaseDate"));
            let dqstatus = json_string(row.get("dqstatus"));
            let is_read = dqstatus == "1" || dqstatus.eq_ignore_ascii_case("read");
            Some(SchoolInboxItem {
                id: format!("portal:tzsjx:{id_raw}"),
                title: if title.is_empty() {
                    "教务通知".to_string()
                } else {
                    title
                },
                summary: trim_summary(&content, 160),
                body: content.trim().to_string(),
                created_at: release_date,
                is_read,
                source: "portal".to_string(),
                uuid: None,
            })
        })
        .collect()
}

pub fn parse_chaoxing_notice_payload(payload: &Value) -> Vec<SchoolInboxItem> {
    let list = payload
        .pointer("/data/notices/list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    list.into_iter()
        .filter_map(|row| {
            let id_raw = json_string(row.get("id"));
            if id_raw.is_empty() {
                return None;
            }
            let title = json_string(row.get("title"));
            let content = json_string(row.get("content"));
            let rtf_content = json_string(row.get("rtf_content"));
            let is_rtf = json_string(row.get("isRtf")) == "1";
            let send_time = json_string(row.get("sendTime"));
            let isread = json_string(row.get("isread"));
            let is_read = isread == "1";
            let uuid = json_string(row.get("uuid"));
            let attachments = parse_chaoxing_attachment_links(row.get("attachment"));
            let mut body = if is_rtf && !rtf_content.is_empty() {
                rtf_content
            } else {
                content.trim().to_string()
            };
            body = append_attachment_links_html(&body, &attachments);
            let summary_source = if content.trim().is_empty() {
                trim_summary(&body.replace('<', " "), 160)
            } else {
                trim_summary(&content, 160)
            };
            Some(SchoolInboxItem {
                id: format!("chaoxing:notice:{id_raw}"),
                title: if title.is_empty() {
                    "学习通通知".to_string()
                } else {
                    title
                },
                summary: summary_source,
                body,
                created_at: send_time,
                is_read,
                source: "chaoxing".to_string(),
                uuid: if uuid.is_empty() { None } else { Some(uuid) },
            })
        })
        .collect()
}

async fn fetch_portal_inbox(client: &HbutClient) -> Result<Vec<SchoolInboxItem>, String> {
    let base = client.jwxt_base_url();
    let url = format!(
        "{base}/admin/system/tzsjx/ajaxList?gridtype=jqgrid&queryFields=id%2Cdqstatus%2Ccollectstatus%2Ctitle%2Ccontent%2CreleaseDate%2C&_search=false&page.size=500&page.pn=1&sort=id&order=desc"
    );
    let referer = format!("{base}/admin/");

    let response = client
        .http_client()
        .get(&url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", referer.clone())
        .send()
        .await
        .map_err(|e| format!("教务通知请求失败: {e}"))?;

    let status = response.status();
    let final_url = response.url().to_string();
    if looks_like_login_redirect(&final_url) {
        return Err("教务会话已过期，请重新登录".into());
    }

    if !status.is_success() {
        return Err(format!("教务通知 HTTP {status}"));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("教务通知响应读取失败: {e}"))?;
    let payload: Value =
        serde_json::from_str(&text).map_err(|e| format!("教务通知 JSON 解析失败: {e}"))?;
    Ok(parse_portal_tzsjx_payload(&payload))
}

async fn fetch_chaoxing_inbox(client: &mut HbutClient, student_id: &str) -> Result<Vec<SchoolInboxItem>, String> {
    if !online_learning::ensure_chaoxing_session_for_checkin(client, student_id).await {
        return Err("学习通会话未就绪，请重新登录".into());
    }

    let response = client
        .http_client()
        .get(CHAOXING_NOTICE_LIST_URL)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/")
        .send()
        .await
        .map_err(|e| format!("学习通通知请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("学习通通知 HTTP {}", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("学习通通知响应读取失败: {e}"))?;
    let payload: Value = serde_json::from_str(&text)
        .map_err(|e| format!("学习通通知 JSON 解析失败: {e}"))?;

    let result = json_string(payload.get("result"));
    if result != "1" {
        let msg = json_string(payload.get("msg"));
        return Err(if msg.is_empty() {
            "学习通通知接口返回失败".into()
        } else {
            msg
        });
    }

    Ok(parse_chaoxing_notice_payload(&payload))
}

/// 按登录方式抓取学校消息中心并归一化。
pub async fn fetch_school_inbox(
    client: &mut HbutClient,
    login_mode: &str,
) -> Result<SchoolInboxResponse, String> {
    let use_chaoxing = is_chaoxing_login_mode(login_mode);
    client.set_chaoxing_login_mode(use_chaoxing);

    let fetched_at = Local::now().to_rfc3339();
    let source = if use_chaoxing { "chaoxing" } else { "portal" };

    let items = if use_chaoxing {
        let sid = client
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .unwrap_or_default();
        if sid.trim().is_empty() {
            return Err("缺少学号，无法检查学习通消息".into());
        }
        fetch_chaoxing_inbox(client, &sid).await?
    } else {
        fetch_portal_inbox(client).await?
    };

    Ok(SchoolInboxResponse {
        items,
        fetched_at,
        source: source.to_string(),
        error: None,
    })
}

async fn fetch_portal_detail_body(client: &HbutClient, raw_id: &str) -> Result<String, String> {
    let base = client.jwxt_base_url();
    let url = format!("{base}/admin/system/tzsjx/showdetail?id={raw_id}");
    let referer = format!("{base}/admin/");

    let response = client
        .http_client()
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Referer", referer)
        .send()
        .await
        .map_err(|e| format!("教务通知详情请求失败: {e}"))?;

    let final_url = response.url().to_string();
    if looks_like_login_redirect(&final_url) {
        return Err("教务会话已过期，请重新登录".into());
    }
    if !response.status().is_success() {
        return Err(format!("教务通知详情 HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("教务通知详情读取失败: {e}"))?;
    Ok(extract_portal_detail_body(&html))
}

async fn fetch_chaoxing_notice_detail(
    client: &mut HbutClient,
    student_id: &str,
    raw_id: &str,
) -> Result<String, String> {
    if !online_learning::ensure_chaoxing_session_for_checkin(client, student_id).await {
        return Err("学习通会话未就绪，请重新登录".into());
    }

    let url = format!(
        "https://notice.chaoxing.com/apis/other/getNotice?noticeId={raw_id}&type=2&crossOrigin=true"
    );
    let response = client
        .http_client()
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/")
        .send()
        .await
        .map_err(|e| format!("学习通通知详情请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("学习通通知详情 HTTP {}", response.status()));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("学习通通知详情读取失败: {e}"))?;
    let payload: Value =
        serde_json::from_str(&text).map_err(|e| format!("学习通通知详情 JSON 解析失败: {e}"))?;

    let result = json_string(payload.get("result"));
    if result != "1" {
        let msg = json_string(payload.get("msg"));
        return Err(if msg.is_empty() {
            "学习通通知详情接口返回失败".into()
        } else {
            msg
        });
    }

    let notice = payload
        .pointer("/data/notice")
        .or_else(|| payload.pointer("/data/notices/list/0"))
        .cloned()
        .unwrap_or(Value::Null);
    let content = json_string(notice.get("content"));
    let rtf_content = json_string(notice.get("rtf_content"));
    let is_rtf = json_string(notice.get("isRtf")) == "1";
    let attachments = parse_chaoxing_attachment_links(notice.get("attachment"));
    let mut body = if is_rtf && !rtf_content.is_empty() {
        rtf_content
    } else {
        content
    };
    body = append_attachment_links_html(&body, &attachments);
    if body.trim().is_empty() {
        return Err("学习通通知详情为空".into());
    }
    Ok(body)
}

async fn mark_portal_read(client: &HbutClient, raw_id: &str) -> Result<(), String> {
    let base = client.jwxt_base_url();
    let referer = format!("{base}/admin/");
    let _ = fetch_portal_detail_body(client, raw_id).await;

    let url = format!("{base}/admin/system/tzsjx/updateState");
    let response = client
        .http_client()
        .post(&url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", referer)
        .form(&[("id", raw_id)])
        .send()
        .await
        .map_err(|e| format!("教务通知标记已读失败: {e}"))?;

    if response.status().is_success() {
        return Ok(());
    }
    Ok(())
}

async fn mark_chaoxing_read(
    client: &mut HbutClient,
    student_id: &str,
    raw_id: &str,
) -> Result<(), String> {
    let _ = fetch_chaoxing_notice_detail(client, student_id, raw_id).await?;
    Ok(())
}

/// 拉取单条学校消息详情（门户 showdetail / 学习通 getNotice）。
pub async fn fetch_school_inbox_detail(
    client: &mut HbutClient,
    _login_mode: &str,
    item_id: &str,
    fallback: Option<SchoolInboxItem>,
) -> Result<SchoolInboxDetailResponse, String> {
    let (source, raw_id) = parse_normalized_item_id(item_id)
        .ok_or_else(|| "无效的消息 ID".to_string())?;

    let body = if source == "portal" {
        fetch_portal_detail_body(client, &raw_id).await?
    } else {
        let sid = client
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .unwrap_or_default();
        if sid.trim().is_empty() {
            return Err("缺少学号，无法获取学习通消息详情".into());
        }
        fetch_chaoxing_notice_detail(client, &sid, &raw_id)
            .await
            .or_else(|_| {
                fallback
                    .as_ref()
                    .map(|item| item.body.clone())
                    .filter(|body| !body.trim().is_empty())
                    .ok_or_else(|| "学习通通知详情为空".to_string())
            })?
    };

    let title = fallback
        .as_ref()
        .map(|item| item.title.clone())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| {
            if source == "chaoxing" {
                "学习通通知".to_string()
            } else {
                "教务通知".to_string()
            }
        });
    let created_at = fallback
        .as_ref()
        .map(|item| item.created_at.clone())
        .unwrap_or_default();
    let is_read = fallback.as_ref().map(|item| item.is_read).unwrap_or(false);

    Ok(SchoolInboxDetailResponse {
        id: item_id.to_string(),
        title,
        body,
        created_at,
        is_read,
        source,
    })
}

/// 将单条学校消息标记为已读。
pub async fn mark_school_inbox_read(
    client: &mut HbutClient,
    _login_mode: &str,
    item_id: &str,
) -> Result<SchoolInboxMarkReadResponse, String> {
    let (source, raw_id) = parse_normalized_item_id(item_id)
        .ok_or_else(|| "无效的消息 ID".to_string())?;

    let result = if source == "portal" {
        mark_portal_read(client, &raw_id).await
    } else {
        let sid = client
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .unwrap_or_default();
        if sid.trim().is_empty() {
            return Err("缺少学号，无法标记学习通消息已读".into());
        }
        mark_chaoxing_read(client, &sid, &raw_id).await
    };

    match result {
        Ok(()) => Ok(SchoolInboxMarkReadResponse {
            id: item_id.to_string(),
            success: true,
            message: None,
        }),
        Err(message) => Ok(SchoolInboxMarkReadResponse {
            id: item_id.to_string(),
            success: false,
            message: Some(message),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_portal_tzsjx_rows() {
        let payload = json!({
            "results": [
                {
                    "id": "abc123",
                    "title": "期末考试安排",
                    "content": "请同学们注意考试时间",
                    "releaseDate": "2026-03-01",
                    "dqstatus": "0"
                }
            ]
        });
        let items = parse_portal_tzsjx_payload(&payload);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "portal:tzsjx:abc123");
        assert!(!items[0].is_read);
        assert_eq!(items[0].source, "portal");
        assert_eq!(items[0].body, "请同学们注意考试时间");
    }

    #[test]
    fn parse_chaoxing_notice_rows() {
        let payload = json!({
            "result": 1,
            "data": {
                "notices": {
                    "list": [
                        {
                            "id": 1048653913,
                            "title": "作业提醒",
                            "content": "第一章作业已发布",
                            "sendTime": "2026-03-18 19:32:42",
                            "isread": 1
                        }
                    ]
                }
            }
        });
        let items = parse_chaoxing_notice_payload(&payload);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "chaoxing:notice:1048653913");
        assert!(items[0].is_read);
    }

    #[test]
    fn parse_normalized_item_id_splits_source_and_raw_id() {
        assert_eq!(
            parse_normalized_item_id("portal:tzsjx:abc123"),
            Some(("portal".to_string(), "abc123".to_string()))
        );
        assert_eq!(
            parse_normalized_item_id("chaoxing:notice:42"),
            Some(("chaoxing".to_string(), "42".to_string()))
        );
    }

    #[test]
    fn parse_chaoxing_rtf_and_attachments() {
        let payload = json!({
            "result": 1,
            "data": {
                "notices": {
                    "list": [{
                        "id": 1,
                        "title": "通知",
                        "content": "摘要",
                        "isRtf": 1,
                        "rtf_content": "<p>详情 <a href=\"https://example.com\">链接</a></p>",
                        "attachment": "[{\"att_clouddisk\":{\"name\":\"文件.pdf\",\"downPath\":\"https://example.com/file.pdf\"}}]",
                        "sendTime": "2026-03-01",
                        "isread": 0,
                        "uuid": "abc"
                    }]
                }
            }
        });
        let items = parse_chaoxing_notice_payload(&payload);
        assert_eq!(items.len(), 1);
        assert!(items[0].body.contains("https://example.com"));
        assert!(items[0].body.contains("文件.pdf"));
        assert_eq!(items[0].uuid.as_deref(), Some("abc"));
    }
}
