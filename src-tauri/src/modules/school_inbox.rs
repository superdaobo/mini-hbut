//! 学校消息中心（教务通知 / 学习通收件箱）抓取与归一化。

use crate::http_client::HbutClient;
use crate::modules::online_learning;
use chrono::Local;
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
            let send_time = json_string(row.get("sendTime"));
            let isread = json_string(row.get("isread"));
            let is_read = isread == "1";
            Some(SchoolInboxItem {
                id: format!("chaoxing:notice:{id_raw}"),
                title: if title.is_empty() {
                    "学习通通知".to_string()
                } else {
                    title
                },
                summary: trim_summary(&content, 160),
                body: content.trim().to_string(),
                created_at: send_time,
                is_read,
                source: "chaoxing".to_string(),
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
}
