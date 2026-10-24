//! 学校消息中心（教务通知 / 学习通收件箱）抓取与归一化。

use crate::http_client::HbutClient;
use crate::modules::online_learning;
use chrono::Local;
use regex::Regex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 学习通收件箱列表（type=2 = 我收到的通知）
/// 分页：响应 `data.notices.lastGetId`，下一页带 `&lastGetId=`
const CHAOXING_NOTICE_LIST_BASE: &str =
    "https://notice.chaoxing.com/apis/other/getNoticeList?type=2&crossOrigin=true&pageSize=50";
/// 最多翻页数（50×20=1000 条，覆盖常见历史）
const CHAOXING_NOTICE_MAX_PAGES: usize = 20;
/// 首次/缓存未命中时先拉的页数，避免每次进收件箱等很久
const CHAOXING_NOTICE_FAST_PAGES: usize = 3;
/// 内存缓存 TTL（秒）
const INBOX_CACHE_TTL_SECS: i64 = 180;

static INBOX_CACHE: std::sync::OnceLock<
    std::sync::Mutex<Option<(i64, String, SchoolInboxResponse)>>,
> = std::sync::OnceLock::new();

fn inbox_cache() -> &'static std::sync::Mutex<Option<(i64, String, SchoolInboxResponse)>> {
    INBOX_CACHE.get_or_init(|| std::sync::Mutex::new(None))
}

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
    // ---- #1105（Epic #1106 共享契约 §6）：抓取完整性信号，前端据此判断去重基线是否可信 ----
    /// 本次抓取是否完整（`false` = 中途失败/只拿到部分页）；旧版本响应无此字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complete: Option<bool>,
    /// 实际抓取页数（门户为 1）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pages_fetched: Option<u32>,
    /// 是否因页数上限被截断（还有更多历史未取）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<bool>,
    /// 是否命中 180s 内存缓存
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_cache: Option<bool>,
    /// 本次返回条数（便于日志/诊断）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetched_item_count: Option<u32>,
}

fn looks_like_login_redirect(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("authserver/login")
        || lower.contains("/login") && (lower.contains("cas") || lower.contains("passport"))
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

/// 学习通分页抓取中「单页 API 数据层结果」（#1105：抽出为枚举，完整性标记才能写成可单测的纯函数）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChaoxingPageResult {
    /// API 正常返回数据（该页列表非空）
    OkPage {
        /// 去重后是否仍有新记录（全量重复 = 游标实际没有前进）
        has_new_items: bool,
        /// API 给出了可用的下一页游标（非空且与已用游标不同）
        next_cursor: bool,
        /// API 返回了重复游标（lastGetId 未前进）
        cursor_repeated: bool,
    },
    /// API 返回失败（result != "1"）
    Failed,
    /// API 返回空页（result="1" 但列表为空）
    Empty,
}

/// 分页完整性标记（#1105 共享契约 §6：前端用 `complete` 判断去重基线是否可信）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ChaoxingPagingAssessment {
    /// 抓取是否完整（false = 中途中断/只拿到部分页）
    complete: bool,
    /// 实际返回数据的页数（API 空页/失败页不计入）
    pages_fetched: u32,
    /// 到达页数上限但仍有下一页游标（结果可用，只是还有未取的历史）
    truncated: bool,
}

/// 由逐页结果序列标记完整性/页数/截断（纯函数，单测无需真实 HTTP）。
///
/// 规则（与共享契约 §6 一致）：
/// - 首页 `Failed`：调用方此时已按错误处理返回，这里防御性地标记不完整；
/// - 第 2 页起 `Failed` → `complete = false`（不再把部分结果冒充完整）；
/// - `Empty`（首页或后续页）= 分页自然耗尽 → `complete = true`；
///   首页空页即「空收件箱」（`pages_fetched = 0`）。刻意不把后续空页判成中断：
///   API 究竟用「空页」还是「无游标」宣告结束，客户端无从区分，而误判为不完整
///   会让该账号每次检查都不可信 → 彻底收不到通知（比少推一批历史更糟）；
/// - `lastGetId` 重复（整页全重复或游标不前进）→ `complete = false`；
/// - 翻到「无下一页」（无游标）→ `complete = true`；
/// - 到达 `max_pages` 且最后一页仍有可用游标 → `truncated = true`（`complete` 保持 `true`）。
fn assess_chaoxing_paging(
    page_results: &[ChaoxingPageResult],
    max_pages: usize,
) -> ChaoxingPagingAssessment {
    let mut complete = true;
    let mut pages_fetched: u32 = 0;
    let mut truncated = false;
    let mut broke = false;

    for (idx, page) in page_results.iter().copied().enumerate() {
        let page_no = idx + 1;
        match page {
            ChaoxingPageResult::Failed => {
                complete = false;
                broke = true;
                break;
            }
            ChaoxingPageResult::Empty => {
                // 空页 = 分页自然耗尽（首页空页即空收件箱）。
                // 不判为中断：见函数头注释 —— 误判会让该账号永久静默。
                broke = true;
                break;
            }
            ChaoxingPageResult::OkPage {
                has_new_items,
                next_cursor,
                cursor_repeated,
            } => {
                pages_fetched = page_no as u32;
                if !has_new_items || cursor_repeated {
                    // 整页全重复或 lastGetId 不前进：无法继续翻页，按中途中断处理
                    complete = false;
                    broke = true;
                    break;
                }
                if !next_cursor {
                    // API 表示无更多数据：自然结束
                    broke = true;
                    break;
                }
            }
        }
    }

    // 循环耗尽页数（到达上限）且最后一页仍有可用游标 → truncated
    if !broke && page_results.len() >= max_pages {
        truncated = matches!(
            page_results.last(),
            Some(ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: true,
                ..
            })
        );
    }

    ChaoxingPagingAssessment {
        complete,
        pages_fetched,
        truncated,
    }
}

/// 一次学习通分页抓取的结果：条目 + 完整性标记（#1105 共享契约 §6）。
/// 标记在 `fetch_chaoxing_inbox` 内单点产生，调用方不允许自行猜测。
#[derive(Debug, Clone, PartialEq, Eq)]
struct ChaoxingInboxOutcome {
    items: Vec<SchoolInboxItem>,
    /// 抓取是否完整（false = 中途中断/只拿到部分页）
    complete: bool,
    /// 实际返回数据的页数
    pages_fetched: u32,
    /// 到达页数上限但仍有下一页游标
    truncated: bool,
}

async fn fetch_chaoxing_inbox(
    client: &mut HbutClient,
    student_id: &str,
    max_pages: usize,
) -> Result<ChaoxingInboxOutcome, String> {
    let timer = crate::runtime_log::ScopedTimer::start("ChaoxingInbox", "fetch_list");
    crate::hbut_session_log!(
        "ChaoxingInbox",
        "开始拉取收件箱 student_id={} max_pages={}",
        student_id,
        max_pages
    );
    if !online_learning::ensure_chaoxing_session_for_checkin(client, student_id).await {
        timer.fail("学习通会话未就绪");
        return Err("学习通会话未就绪，请重新登录".into());
    }
    crate::hbut_session_log!("ChaoxingInbox", "会话就绪，开始分页拉取");

    let mut all: Vec<SchoolInboxItem> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut last_get_id: Option<String> = None;
    let pages = max_pages.clamp(1, CHAOXING_NOTICE_MAX_PAGES);
    // 逐页「数据层结果」：循环结束后交给 assess_chaoxing_paging 统一标记
    let mut page_results: Vec<ChaoxingPageResult> = Vec::new();

    for page in 0..pages {
        let url = match &last_get_id {
            Some(id) if !id.is_empty() => {
                format!("{CHAOXING_NOTICE_LIST_BASE}&lastGetId={id}")
            }
            _ => CHAOXING_NOTICE_LIST_BASE.to_string(),
        };

        let response = match client
            .http_client()
            .get(&url)
            .header("Accept", "application/json, text/plain, */*")
            .header("Referer", "https://i.chaoxing.com/")
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                timer.fail(format!("请求失败: {e}"));
                return Err(format!("学习通通知请求失败: {e}"));
            }
        };

        if !response.status().is_success() {
            let st = response.status();
            timer.fail(format!("HTTP {st}"));
            return Err(format!("学习通通知 HTTP {st}"));
        }

        let text = response
            .text()
            .await
            .map_err(|e| format!("学习通通知响应读取失败: {e}"))?;
        let payload: Value =
            serde_json::from_str(&text).map_err(|e| format!("学习通通知 JSON 解析失败: {e}"))?;

        let result = json_string(payload.get("result"));
        if result != "1" {
            let msg = json_string(payload.get("msg"));
            // 第一页失败才算错；后续页失败则保留已抓到的部分结果并标记为不完整（#1105）
            if all.is_empty() {
                timer.fail(if msg.is_empty() {
                    "学习通通知接口返回失败".into()
                } else {
                    msg.clone()
                });
                return Err(if msg.is_empty() {
                    "学习通通知接口返回失败".into()
                } else {
                    msg
                });
            }
            page_results.push(ChaoxingPageResult::Failed);
            break;
        }

        let page_items = parse_chaoxing_notice_payload(&payload);
        crate::hbut_session_log!(
            "ChaoxingInbox",
            "第 {} 页解析 {} 条",
            page + 1,
            page_items.len()
        );
        if page_items.is_empty() {
            // #1105：空页也记录数据层结果——首页空页（合法空收件箱）与后续空页（中途中断）由标记函数按页号区分
            page_results.push(ChaoxingPageResult::Empty);
            break;
        }

        let mut new_count = 0usize;
        for item in page_items {
            if seen_ids.insert(item.id.clone()) {
                all.push(item);
                new_count += 1;
            }
        }

        // 官方分页游标：区分「无更多数据」与「游标重复」两种停止原因
        let next = json_string(payload.pointer("/data/notices/lastGetId"));
        let cursor_repeated = !next.is_empty() && last_get_id.as_ref() == Some(&next);
        let next_cursor = !next.is_empty() && !cursor_repeated;

        page_results.push(ChaoxingPageResult::OkPage {
            has_new_items: new_count > 0,
            next_cursor,
            cursor_repeated,
        });
        if new_count == 0 || cursor_repeated || next.is_empty() {
            // 整页全重复 / lastGetId 不前进 / 无下一页游标：停止翻页
            break;
        }
        last_get_id = Some(next);
    }

    // #1105：完整性标记在函数内单点产生，调用方不再根据条数猜测
    let assessment = assess_chaoxing_paging(&page_results, pages);
    timer.finish(Some(serde_json::json!({
        "count": all.len(),
        "pages": pages,
        "complete": assessment.complete,
        "truncated": assessment.truncated
    })));
    crate::hbut_session_log!(
        "ChaoxingInbox",
        "抓取完成 count={} pages_fetched={} complete={} truncated={}",
        all.len(),
        assessment.pages_fetched,
        assessment.complete,
        assessment.truncated
    );
    Ok(ChaoxingInboxOutcome {
        items: all,
        complete: assessment.complete,
        pages_fetched: assessment.pages_fetched,
        truncated: assessment.truncated,
    })
}

/// 按登录方式抓取学校消息中心并归一化。
/// `force=true` 时忽略短时缓存并尽量拉全页。
pub async fn fetch_school_inbox(
    client: &mut HbutClient,
    login_mode: &str,
) -> Result<SchoolInboxResponse, String> {
    fetch_school_inbox_ex(client, login_mode, false).await
}

pub async fn fetch_school_inbox_ex(
    client: &mut HbutClient,
    login_mode: &str,
    force: bool,
) -> Result<SchoolInboxResponse, String> {
    let use_chaoxing = is_chaoxing_login_mode(login_mode);
    client.set_chaoxing_login_mode(use_chaoxing);
    let source = if use_chaoxing { "chaoxing" } else { "portal" };
    let cache_key = format!(
        "{source}:{}",
        client
            .user_info
            .as_ref()
            .map(|u| u.student_id.as_str())
            .unwrap_or("-")
    );

    if !force {
        if let Ok(guard) = inbox_cache().lock() {
            if let Some((ts, key, cached)) = guard.as_ref() {
                let age = Local::now().timestamp() - *ts;
                if key == &cache_key && age >= 0 && age < INBOX_CACHE_TTL_SECS {
                    crate::hbut_session_log!(
                        "SchoolInbox",
                        "命中内存缓存 age={}s count={}",
                        age,
                        cached.items.len()
                    );
                    // #1105：缓存里存的是原始响应（from_cache=Some(false)）；
                    // 命中时复制一份并标记 fromCache=true，保留原有 complete/truncated/pagesFetched/fetchedItemCount
                    let mut hit = cached.clone();
                    hit.from_cache = Some(true);
                    return Ok(hit);
                }
            }
        }
    }

    let fetched_at = Local::now().to_rfc3339();

    let (items, complete, pages_fetched, truncated) = if use_chaoxing {
        let sid = client
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .unwrap_or_default();
        if sid.trim().is_empty() {
            return Err("缺少学号，无法检查学习通消息".into());
        }
        let pages = if force {
            CHAOXING_NOTICE_MAX_PAGES
        } else {
            CHAOXING_NOTICE_FAST_PAGES
        };
        // #1105：完整性标记由抓取函数单点传出，不在此处根据条数猜测
        let outcome = fetch_chaoxing_inbox(client, &sid, pages).await?;
        (
            outcome.items,
            Some(outcome.complete),
            Some(outcome.pages_fetched),
            Some(outcome.truncated),
        )
    } else {
        // 门户：单页抓取，请求成功即视为完整结果
        (
            fetch_portal_inbox(client).await?,
            Some(true),
            Some(1),
            Some(false),
        )
    };

    let fetched_item_count = items.len() as u32;
    let resp = SchoolInboxResponse {
        items,
        fetched_at,
        source: source.to_string(),
        error: None,
        // #1105（Epic #1106 共享契约 §6）：新字段均为 Option，None 不序列化，旧前端不受影响
        complete,
        pages_fetched,
        truncated,
        from_cache: Some(false),
        fetched_item_count: Some(fetched_item_count),
    };
    if let Ok(mut guard) = inbox_cache().lock() {
        *guard = Some((Local::now().timestamp(), cache_key, resp.clone()));
    }
    Ok(resp)
}

async fn fetch_portal_detail_body(client: &HbutClient, raw_id: &str) -> Result<String, String> {
    let base = client.jwxt_base_url();
    let url = format!("{base}/admin/system/tzsjx/showdetail?id={raw_id}");
    let referer = format!("{base}/admin/");

    let response = client
        .http_client()
        .get(&url)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
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

/// 教师端本地已读提示（绝不写服务端）。
///
/// #1023：教师通知标记已读只保存在本机，不写回教务系统。
pub const TEACHER_LOCAL_ONLY_READ_MESSAGE: &str = "教师端标记已读仅保存在本机，未写回教务系统";

/// 标记已读的执行计划（#1023 教师只读红线的可测试决策点）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkReadPlan {
    /// 教师身份：仅本地记录，**绝不**下发状态更新写请求。
    LocalOnly,
    /// 学生身份：沿用既有链路（portal 来源会向教务发起状态更新 POST）。
    Remote,
}

/// 依身份决定「标记已读」策略：教师一律本地，学生保持原语义。
///
/// 这是教师只读红线的**唯一决策点**，被单元测试直接断言，
/// 避免将来有人把教师分支误改回写型链路。
pub fn plan_school_inbox_mark_read(is_teacher: bool) -> MarkReadPlan {
    if is_teacher {
        MarkReadPlan::LocalOnly
    } else {
        MarkReadPlan::Remote
    }
}

/// 当前会话是否为教师身份（历史数据缺省学生）。
fn is_teacher_session(client: &HbutClient) -> bool {
    client
        .user_info
        .as_ref()
        .map(|user| user.role.is_teacher())
        .unwrap_or(false)
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
    let (source, raw_id) =
        parse_normalized_item_id(item_id).ok_or_else(|| "无效的消息 ID".to_string())?;

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
///
/// #1023 教师只读红线：教师身份下**绝不**向教务发起状态更新写请求
/// （对照 `data/teacher-api-recon/07-write-endpoints-denylist.md` A4），
/// 直接返回本地已读结果，由前端按教师作用域本地记录。
pub async fn mark_school_inbox_read(
    client: &mut HbutClient,
    _login_mode: &str,
    item_id: &str,
) -> Result<SchoolInboxMarkReadResponse, String> {
    // 教师分支必须在任何解析 / 网络调用之前短路：教师路径不得触达写型链路。
    if plan_school_inbox_mark_read(is_teacher_session(client)) == MarkReadPlan::LocalOnly {
        return Ok(SchoolInboxMarkReadResponse {
            id: item_id.to_string(),
            success: true,
            message: Some(TEACHER_LOCAL_ONLY_READ_MESSAGE.to_string()),
        });
    }

    let (source, raw_id) =
        parse_normalized_item_id(item_id).ok_or_else(|| "无效的消息 ID".to_string())?;

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

    /// #1023 教师只读红线：教师身份的标记已读计划必须是纯本地，
    /// 学生身份保持既有远端链路语义。
    #[test]
    fn teacher_mark_read_plan_is_local_only() {
        assert_eq!(plan_school_inbox_mark_read(true), MarkReadPlan::LocalOnly);
        assert_eq!(plan_school_inbox_mark_read(false), MarkReadPlan::Remote);
    }

    /// 教师本地已读提示必须明确「仅保存在本机」，供前端展示。
    #[test]
    fn teacher_local_only_message_mentions_local_device() {
        assert!(TEACHER_LOCAL_ONLY_READ_MESSAGE.contains("本机"));
        assert!(!TEACHER_LOCAL_ONLY_READ_MESSAGE.is_empty());
    }

    // ---- #1105（Epic #1106）分页完整性标记：assess_chaoxing_paging 纯函数测试 ----

    /// 第 2 页 API 失败 → 标记不完整，pages_fetched 只计真正返回数据的页。
    #[test]
    fn chaoxing_paging_second_page_failed_is_incomplete() {
        let pages = vec![
            ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: true,
                cursor_repeated: false,
            },
            ChaoxingPageResult::Failed,
        ];
        let a = assess_chaoxing_paging(&pages, CHAOXING_NOTICE_FAST_PAGES);
        assert!(!a.complete);
        assert_eq!(a.pages_fetched, 1);
        assert!(!a.truncated);
    }

    /// 到达页数上限且仍持有可用下一页游标 → truncated，complete 保持 true。
    #[test]
    fn chaoxing_paging_reached_max_pages_with_open_cursor_is_truncated() {
        let pages = vec![
            ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: true,
                cursor_repeated: false,
            };
            3
        ];
        let a = assess_chaoxing_paging(&pages, 3);
        assert!(a.complete);
        assert_eq!(a.pages_fetched, 3);
        assert!(a.truncated);
    }

    /// 单页抓完（API 无下一页游标）→ complete=true、truncated=false。
    #[test]
    fn chaoxing_paging_single_full_page_is_complete() {
        let pages = vec![ChaoxingPageResult::OkPage {
            has_new_items: true,
            next_cursor: false,
            cursor_repeated: false,
        }];
        let a = assess_chaoxing_paging(&pages, CHAOXING_NOTICE_MAX_PAGES);
        assert!(a.complete);
        assert_eq!(a.pages_fetched, 1);
        assert!(!a.truncated);
    }

    /// 空页 = 分页自然耗尽：首页空页即空收件箱（完整、0 页）；
    /// 后续空页同样判完整 —— 误判为中断会让该账号永久静默。
    #[test]
    fn chaoxing_paging_empty_page_is_natural_exhaustion() {
        let first_empty = vec![ChaoxingPageResult::Empty];
        let a1 = assess_chaoxing_paging(&first_empty, 3);
        assert!(a1.complete);
        assert_eq!(a1.pages_fetched, 0);
        assert!(!a1.truncated);

        let later_empty = vec![
            ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: true,
                cursor_repeated: false,
            },
            ChaoxingPageResult::Empty,
        ];
        let a2 = assess_chaoxing_paging(&later_empty, 3);
        assert!(a2.complete);
        assert_eq!(a2.pages_fetched, 1);
        assert!(!a2.truncated);
    }

    /// lastGetId 重复（游标不前进）或整页全重复 → 不完整；首页失败防御性判不完整。
    #[test]
    fn chaoxing_paging_repeated_cursor_or_all_dup_is_incomplete() {
        let repeated_cursor = vec![
            ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: true,
                cursor_repeated: false,
            },
            ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: false,
                cursor_repeated: true,
            },
        ];
        let a1 = assess_chaoxing_paging(&repeated_cursor, 3);
        assert!(!a1.complete);
        assert_eq!(a1.pages_fetched, 2);
        assert!(!a1.truncated);

        let all_dup = vec![
            ChaoxingPageResult::OkPage {
                has_new_items: true,
                next_cursor: true,
                cursor_repeated: false,
            },
            ChaoxingPageResult::OkPage {
                has_new_items: false,
                next_cursor: true,
                cursor_repeated: false,
            },
        ];
        let a2 = assess_chaoxing_paging(&all_dup, 3);
        assert!(!a2.complete);

        let first_failed = vec![ChaoxingPageResult::Failed];
        let a3 = assess_chaoxing_paging(&first_failed, 3);
        assert!(!a3.complete);
        assert_eq!(a3.pages_fetched, 0);
    }

    /// 序列化契约：新字段必须用 camelCase 名，Option::None 字段不出现在 JSON 中。
    #[test]
    fn school_inbox_response_new_fields_serialize_camel_case_and_skip_none() {
        let resp = SchoolInboxResponse {
            items: vec![],
            fetched_at: "2026-06-25T12:00:00+08:00".to_string(),
            source: "chaoxing".to_string(),
            error: None,
            complete: Some(true),
            pages_fetched: Some(3),
            truncated: Some(true),
            from_cache: Some(false),
            fetched_item_count: Some(150),
        };
        let v = serde_json::to_value(&resp).expect("应能序列化");
        // 新字段名（camelCase）与值
        assert_eq!(v.get("complete"), Some(&json!(true)));
        assert_eq!(v.get("pagesFetched"), Some(&json!(3)));
        assert_eq!(v.get("truncated"), Some(&json!(true)));
        assert_eq!(v.get("fromCache"), Some(&json!(false)));
        assert_eq!(v.get("fetchedItemCount"), Some(&json!(150)));
        // 旧字段名与形态不变
        assert!(v.get("items").is_some());
        assert!(v.get("fetchedAt").is_some());
        assert_eq!(v.get("source"), Some(&json!("chaoxing")));
        assert!(v.get("error").is_none());

        // 新字段全 None → 均不出现在 JSON
        let resp_none = SchoolInboxResponse {
            items: vec![],
            fetched_at: "2026-06-25T12:00:00+08:00".to_string(),
            source: "portal".to_string(),
            error: None,
            complete: None,
            pages_fetched: None,
            truncated: None,
            from_cache: None,
            fetched_item_count: None,
        };
        let v2 = serde_json::to_value(&resp_none).expect("应能序列化");
        for key in [
            "complete",
            "pagesFetched",
            "truncated",
            "fromCache",
            "fetchedItemCount",
        ] {
            assert!(v2.get(key).is_none(), "None 字段 {key} 不应出现在 JSON 中");
        }
    }
}
