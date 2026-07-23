//! 智慧迎新只读模块（#458）
//!
//! - 复用 `HbutClient` CookieJar（融合门户 / CAS 会话）
//! - 按协议候选 base/path 尝试 live GET；失败回落 fixtures
//! - **禁止**任何填报/提交/上传写操作

use crate::http_client::HbutClient;
use chrono::Local;
use reqwest::cookie::CookieStore;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 协议文档候选 base（ASSUMPTION，见 docs/protocol/smart-orientation.md）
const BASE_CANDIDATES: &[&str] = &[
    "https://xg.hbut.edu.cn",
    "https://yx.hbut.edu.cn",
    "https://e.hbut.edu.cn",
];

const OVERVIEW_PATHS: &[&str] = &[
    "/api/orientation/overview",
    "/api/yingxin/home",
    "/open/orientation/panels",
];

const MESSAGES_PATHS: &[&str] = &["/api/orientation/messages", "/api/yingxin/notice/list"];

const MENTOR_PATHS: &[&str] = &["/api/orientation/mentor", "/api/yingxin/classAdvisor"];
const COUNSELOR_PATHS: &[&str] = &["/api/orientation/counselor", "/api/yingxin/counselor"];
const DORM_PATHS: &[&str] = &["/api/orientation/dorm", "/api/yingxin/dormitory"];
const PROFILE_PATHS: &[&str] = &["/api/orientation/profile", "/api/yingxin/student/info"];

const FIXTURE_OVERVIEW: &str = include_str!("../../tests/fixtures/smart-orientation/overview.json");
const FIXTURE_MESSAGES: &str = include_str!("../../tests/fixtures/smart-orientation/messages.json");
const FIXTURE_PROFILE_BLOCKS: &str =
    include_str!("../../tests/fixtures/smart-orientation/profile_blocks.json");

// ─── DTOs ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrientationPanel {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub badge: Option<String>,
    #[serde(default)]
    pub order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrientationPanelsResponse {
    pub panels: Vec<OrientationPanel>,
    pub fetched_at: String,
    pub source: String,
    #[serde(default)]
    pub demo: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrientationMessage {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub published_at: String,
    #[serde(default)]
    pub is_read: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrientationMessagesResponse {
    pub items: Vec<OrientationMessage>,
    pub fetched_at: String,
    pub source: String,
    #[serde(default)]
    pub demo: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrientationPerson {
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub staff_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub college: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub office: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrientationDorm {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub campus: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub building: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bed: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrientationProfile {
    #[serde(default)]
    pub student_id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gender: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub college: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub major: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grade: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub education_level: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id_number: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orientation_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrientationProfileBlocksResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mentor: Option<OrientationPerson>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub counselor: Option<OrientationPerson>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dorm: Option<OrientationDorm>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<OrientationProfile>,
    pub fetched_at: String,
    pub source: String,
    #[serde(default)]
    pub demo: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notice: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ─── Helpers ────────────────────────────────────────────────

fn now_iso() -> String {
    Local::now().to_rfc3339()
}

fn json_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn looks_like_login_redirect(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.contains("authserver/login")
        || (lower.contains("/login") && (lower.contains("cas") || lower.contains("passport")))
}

fn has_portal_session_cookie(client: &HbutClient) -> bool {
    let Ok(portal) = reqwest::Url::parse("https://e.hbut.edu.cn/") else {
        return false;
    };
    let Ok(auth) = reqwest::Url::parse("https://auth.hbut.edu.cn/") else {
        return false;
    };
    let jar = &client.cookie_jar;
    let portal_cookie = jar
        .cookies(&portal)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()));
    let auth_cookie = jar
        .cookies(&auth)
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()));
    let joined = format!(
        "{} {}",
        portal_cookie.unwrap_or_default(),
        auth_cookie.unwrap_or_default()
    );
    let lower = joined.to_lowercase();
    !joined.trim().is_empty()
        && (lower.contains("castgc")
            || lower.contains("happyvoyage")
            || lower.contains("wiscpsid")
            || lower.contains("mod_auth_cas")
            || lower.contains("route")
            || client.is_logged_in)
}

fn unwrap_data_payload(raw: &Value) -> &Value {
    if let Some(data) = raw.get("data") {
        return data;
    }
    if let Some(result) = raw.get("result") {
        if result.is_object() || result.is_array() {
            return result;
        }
    }
    raw
}

fn is_business_ok(raw: &Value) -> bool {
    match raw.get("code") {
        None => true,
        Some(Value::Number(n)) => {
            let v = n.as_i64().unwrap_or(-1);
            v == 0 || v == 200
        }
        Some(Value::String(s)) => {
            let t = s.trim();
            t.is_empty() || t == "0" || t == "200" || t.eq_ignore_ascii_case("ok") || t == "1"
        }
        _ => true,
    }
}

// ─── Fixture loaders ────────────────────────────────────────

pub fn parse_panels_fixture(raw: &str) -> Result<OrientationPanelsResponse, String> {
    let mut resp: OrientationPanelsResponse =
        serde_json::from_str(raw).map_err(|e| format!("overview fixture 解析失败: {e}"))?;
    if resp.fetched_at.is_empty() {
        resp.fetched_at = now_iso();
    }
    resp.panels.sort_by_key(|p| p.order);
    Ok(resp)
}

pub fn parse_messages_fixture(raw: &str) -> Result<OrientationMessagesResponse, String> {
    let mut resp: OrientationMessagesResponse =
        serde_json::from_str(raw).map_err(|e| format!("messages fixture 解析失败: {e}"))?;
    if resp.fetched_at.is_empty() {
        resp.fetched_at = now_iso();
    }
    Ok(resp)
}

pub fn parse_profile_blocks_fixture(raw: &str) -> Result<OrientationProfileBlocksResponse, String> {
    let mut resp: OrientationProfileBlocksResponse =
        serde_json::from_str(raw).map_err(|e| format!("profile_blocks fixture 解析失败: {e}"))?;
    if resp.fetched_at.is_empty() {
        resp.fetched_at = now_iso();
    }
    Ok(resp)
}

fn fixture_panels(notice: &str) -> OrientationPanelsResponse {
    let mut resp =
        parse_panels_fixture(FIXTURE_OVERVIEW).unwrap_or_else(|_| OrientationPanelsResponse {
            panels: vec![],
            fetched_at: now_iso(),
            source: "fixture".into(),
            demo: true,
            notice: Some(notice.to_string()),
            error: None,
        });
    resp.source = "fixture".into();
    resp.demo = true;
    resp.notice = Some(notice.to_string());
    resp.fetched_at = now_iso();
    resp
}

fn fixture_messages(notice: &str) -> OrientationMessagesResponse {
    let mut resp =
        parse_messages_fixture(FIXTURE_MESSAGES).unwrap_or_else(|_| OrientationMessagesResponse {
            items: vec![],
            fetched_at: now_iso(),
            source: "fixture".into(),
            demo: true,
            notice: Some(notice.to_string()),
            error: None,
        });
    resp.source = "fixture".into();
    resp.demo = true;
    resp.notice = Some(notice.to_string());
    resp.fetched_at = now_iso();
    resp
}

fn fixture_profile_blocks(notice: &str) -> OrientationProfileBlocksResponse {
    let mut resp = parse_profile_blocks_fixture(FIXTURE_PROFILE_BLOCKS).unwrap_or_else(|_| {
        OrientationProfileBlocksResponse {
            mentor: None,
            counselor: None,
            dorm: None,
            profile: None,
            fetched_at: now_iso(),
            source: "fixture".into(),
            demo: true,
            notice: Some(notice.to_string()),
            error: None,
        }
    });
    resp.source = "fixture".into();
    resp.demo = true;
    resp.notice = Some(notice.to_string());
    resp.fetched_at = now_iso();
    resp
}

// ─── Live HTTP (readonly GET only) ──────────────────────────

async fn get_json_first_hit(
    client: &HbutClient,
    paths: &[&str],
) -> Result<(String, Value), String> {
    let http = client.http_client();
    let mut last_err = String::from("无可用迎新只读接口");

    for base in BASE_CANDIDATES {
        for path in paths {
            let url = format!("{base}{path}");
            let response = match http
                .get(&url)
                .header("Accept", "application/json, text/plain, */*")
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Referer", format!("{base}/"))
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    last_err = format!("请求失败 {url}: {e}");
                    continue;
                }
            };

            let status = response.status();
            let final_url = response.url().to_string();
            if looks_like_login_redirect(&final_url) {
                return Err("迎新会话已过期，请重新登录融合门户".into());
            }
            if !status.is_success() {
                last_err = format!("HTTP {status} @ {url}");
                continue;
            }

            let text = match response.text().await {
                Ok(t) => t,
                Err(e) => {
                    last_err = format!("读取响应失败 {url}: {e}");
                    continue;
                }
            };
            if text.trim().is_empty() || text.trim_start().starts_with('<') {
                last_err = format!("非 JSON 响应 @ {url}");
                continue;
            }
            let raw: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(e) => {
                    last_err = format!("JSON 解析失败 {url}: {e}");
                    continue;
                }
            };
            if !is_business_ok(&raw) {
                last_err = format!("业务码失败 @ {url}");
                continue;
            }
            return Ok((url, raw));
        }
    }

    Err(last_err)
}

fn parse_panels_live(raw: &Value) -> Option<Vec<OrientationPanel>> {
    let data = unwrap_data_payload(raw);
    let arr = data
        .get("panels")
        .or_else(|| data.get("list"))
        .or_else(|| data.as_array().map(|_| data))
        .and_then(|v| v.as_array())?;

    let mut panels = Vec::new();
    for (idx, row) in arr.iter().enumerate() {
        let id = json_string(row.get("id").or_else(|| row.get("code")));
        if id.is_empty() {
            continue;
        }
        let title = json_string(row.get("title").or_else(|| row.get("name")));
        let summary = json_string(row.get("summary").or_else(|| row.get("desc")));
        let badge_raw = json_string(row.get("badge").or_else(|| row.get("unread")));
        let order = row
            .get("order")
            .and_then(|v| v.as_i64())
            .unwrap_or(idx as i64) as i32;
        let icon_key = {
            let s = json_string(row.get("iconKey").or_else(|| row.get("icon")));
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        panels.push(OrientationPanel {
            id,
            title: if title.is_empty() {
                "面板".into()
            } else {
                title
            },
            summary,
            badge: if badge_raw.is_empty() {
                None
            } else {
                Some(badge_raw)
            },
            order,
            icon_key,
        });
    }
    if panels.is_empty() {
        None
    } else {
        panels.sort_by_key(|p| p.order);
        Some(panels)
    }
}

fn parse_messages_live(raw: &Value) -> Option<Vec<OrientationMessage>> {
    let data = unwrap_data_payload(raw);
    let arr = data
        .get("items")
        .or_else(|| data.get("list"))
        .or_else(|| data.get("records"))
        .or_else(|| data.as_array().map(|_| data))
        .and_then(|v| v.as_array())?;

    let mut items = Vec::new();
    for row in arr {
        let id = json_string(row.get("id").or_else(|| row.get("noticeId")));
        if id.is_empty() {
            continue;
        }
        let title = json_string(row.get("title"));
        let summary = json_string(row.get("summary").or_else(|| row.get("content")));
        let body = json_string(
            row.get("body")
                .or_else(|| row.get("content"))
                .or_else(|| row.get("rtfContent")),
        );
        let published_at = json_string(
            row.get("publishedAt")
                .or_else(|| row.get("publishTime"))
                .or_else(|| row.get("createTime"))
                .or_else(|| row.get("releaseDate")),
        );
        let is_read = match row.get("isRead").or_else(|| row.get("read")) {
            Some(Value::Bool(b)) => *b,
            Some(Value::String(s)) => s == "1" || s.eq_ignore_ascii_case("true"),
            Some(Value::Number(n)) => n.as_i64() == Some(1),
            _ => false,
        };
        let category = {
            let s = json_string(row.get("category").or_else(|| row.get("type")));
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        };
        items.push(OrientationMessage {
            id,
            title: if title.is_empty() {
                "迎新消息".into()
            } else {
                title
            },
            summary,
            body,
            published_at,
            is_read,
            category,
        });
    }
    Some(items)
}

fn parse_person_live(raw: &Value) -> Option<OrientationPerson> {
    let data = unwrap_data_payload(raw);
    let obj = if data.is_object() {
        data
    } else {
        return None;
    };
    let name = json_string(obj.get("name").or_else(|| obj.get("xm")));
    if name.is_empty() {
        return None;
    }
    let opt = |keys: &[&str]| -> Option<String> {
        for k in keys {
            let s = json_string(obj.get(*k));
            if !s.is_empty() {
                return Some(s);
            }
        }
        None
    };
    Some(OrientationPerson {
        name,
        staff_id: opt(&["staffId", "gh", "jobNo"]),
        college: opt(&["college", "xy", "dept"]),
        phone: opt(&["phone", "mobile", "sjh"]),
        email: opt(&["email", "yx"]),
        office: opt(&["office", "bgdd"]),
        remark: opt(&["remark", "note"]),
    })
}

fn parse_dorm_live(raw: &Value) -> Option<OrientationDorm> {
    let data = unwrap_data_payload(raw);
    let obj = if data.is_object() {
        data
    } else {
        return None;
    };
    let opt = |keys: &[&str]| -> Option<String> {
        for k in keys {
            let s = json_string(obj.get(*k));
            if !s.is_empty() {
                return Some(s);
            }
        }
        None
    };
    let dorm = OrientationDorm {
        campus: opt(&["campus", "xq"]),
        building: opt(&["building", "ld", "ssl"]),
        room: opt(&["room", "fj", "roomNo"]),
        bed: opt(&["bed", "cwh"]),
        status: opt(&["status", "rzzt"]),
        remark: opt(&["remark", "note"]),
    };
    if dorm.campus.is_none() && dorm.building.is_none() && dorm.room.is_none() && dorm.bed.is_none()
    {
        return None;
    }
    Some(dorm)
}

fn parse_profile_live(raw: &Value) -> Option<OrientationProfile> {
    let data = unwrap_data_payload(raw);
    let obj = if data.is_object() {
        data
    } else {
        return None;
    };
    let student_id = json_string(
        obj.get("studentId")
            .or_else(|| obj.get("xh"))
            .or_else(|| obj.get("stuNo")),
    );
    let name = json_string(obj.get("name").or_else(|| obj.get("xm")));
    if student_id.is_empty() && name.is_empty() {
        return None;
    }
    let opt = |keys: &[&str]| -> Option<String> {
        for k in keys {
            let s = json_string(obj.get(*k));
            if !s.is_empty() {
                return Some(s);
            }
        }
        None
    };
    Some(OrientationProfile {
        student_id,
        name,
        gender: opt(&["gender", "xb"]),
        college: opt(&["college", "xy"]),
        major: opt(&["major", "zy"]),
        class_name: opt(&["className", "bj", "class"]),
        grade: opt(&["grade", "nj"]),
        education_level: opt(&["educationLevel", "pycc"]),
        id_number: opt(&["idNumber", "sfzh"]),
        phone: opt(&["phone", "mobile", "sjh"]),
        orientation_status: opt(&["orientationStatus", "status", "yxzt"]),
    })
}

// ─── Public API ─────────────────────────────────────────────

/// 列表 overview 面板（只读）
pub async fn list_panels(client: &HbutClient) -> Result<OrientationPanelsResponse, String> {
    if !has_portal_session_cookie(client) {
        // 无会话：返回 fixture + 明确 notice（前端可提示登录）
        let mut resp = fixture_panels("未检测到融合门户会话，已展示协议样例数据");
        resp.error = Some("请先登录融合门户".into());
        return Ok(resp);
    }

    match get_json_first_hit(client, OVERVIEW_PATHS).await {
        Ok((_url, raw)) => {
            if let Some(panels) = parse_panels_live(&raw) {
                return Ok(OrientationPanelsResponse {
                    panels,
                    fetched_at: now_iso(),
                    source: "live".into(),
                    demo: false,
                    notice: None,
                    error: None,
                });
            }
            let mut resp = fixture_panels("真实接口响应无法解析，已回落协议样例");
            resp.error = Some("overview 解析失败".into());
            Ok(resp)
        }
        Err(e) => {
            if e.contains("会话已过期") {
                return Err(e);
            }
            let mut resp = fixture_panels(
                "未命中真实迎新接口，已展示协议样例（见 docs/protocol/smart-orientation.md）",
            );
            resp.error = Some(e);
            Ok(resp)
        }
    }
}

/// 列表迎新消息（只读）
pub async fn list_messages(client: &HbutClient) -> Result<OrientationMessagesResponse, String> {
    if !has_portal_session_cookie(client) {
        let mut resp = fixture_messages("未检测到融合门户会话，已展示协议样例数据");
        resp.error = Some("请先登录融合门户".into());
        return Ok(resp);
    }

    match get_json_first_hit(client, MESSAGES_PATHS).await {
        Ok((_url, raw)) => {
            if let Some(items) = parse_messages_live(&raw) {
                return Ok(OrientationMessagesResponse {
                    items,
                    fetched_at: now_iso(),
                    source: "live".into(),
                    demo: false,
                    notice: None,
                    error: None,
                });
            }
            let mut resp = fixture_messages("真实接口响应无法解析，已回落协议样例");
            resp.error = Some("messages 解析失败".into());
            Ok(resp)
        }
        Err(e) => {
            if e.contains("会话已过期") {
                return Err(e);
            }
            let mut resp = fixture_messages(
                "未命中真实迎新消息接口，已展示协议样例（见 docs/protocol/smart-orientation.md）",
            );
            resp.error = Some(e);
            Ok(resp)
        }
    }
}

/// 班导师 / 辅导员 / 宿舍 / 个人信息聚合块（只读）
pub async fn profile_blocks(
    client: &HbutClient,
) -> Result<OrientationProfileBlocksResponse, String> {
    if !has_portal_session_cookie(client) {
        let mut resp = fixture_profile_blocks("未检测到融合门户会话，已展示协议样例数据");
        resp.error = Some("请先登录融合门户".into());
        return Ok(resp);
    }

    let mut mentor = None;
    let mut counselor = None;
    let mut dorm = None;
    let mut profile = None;
    let mut errors: Vec<String> = Vec::new();
    let mut live_hits = 0u8;

    match get_json_first_hit(client, MENTOR_PATHS).await {
        Ok((_, raw)) => {
            if let Some(p) = parse_person_live(&raw) {
                mentor = Some(p);
                live_hits += 1;
            }
        }
        Err(e) => {
            if e.contains("会话已过期") {
                return Err(e);
            }
            errors.push(format!("mentor: {e}"));
        }
    }
    match get_json_first_hit(client, COUNSELOR_PATHS).await {
        Ok((_, raw)) => {
            if let Some(p) = parse_person_live(&raw) {
                counselor = Some(p);
                live_hits += 1;
            }
        }
        Err(e) => errors.push(format!("counselor: {e}")),
    }
    match get_json_first_hit(client, DORM_PATHS).await {
        Ok((_, raw)) => {
            if let Some(d) = parse_dorm_live(&raw) {
                dorm = Some(d);
                live_hits += 1;
            }
        }
        Err(e) => errors.push(format!("dorm: {e}")),
    }
    match get_json_first_hit(client, PROFILE_PATHS).await {
        Ok((_, raw)) => {
            if let Some(p) = parse_profile_live(&raw) {
                profile = Some(p);
                live_hits += 1;
            }
        }
        Err(e) => errors.push(format!("profile: {e}")),
    }

    if live_hits == 0 {
        let mut resp = fixture_profile_blocks(
            "未命中真实迎新档案接口，已展示协议样例（见 docs/protocol/smart-orientation.md）",
        );
        if !errors.is_empty() {
            resp.error = Some(errors.join("; "));
        }
        return Ok(resp);
    }

    // 部分成功：缺省块用 fixture 补齐，避免 UI 空白
    let fb = fixture_profile_blocks("部分接口为协议样例");
    let source = if live_hits >= 4 { "live" } else { "mixed" };
    Ok(OrientationProfileBlocksResponse {
        mentor: mentor.or(fb.mentor),
        counselor: counselor.or(fb.counselor),
        dorm: dorm.or(fb.dorm),
        profile: profile.or(fb.profile),
        fetched_at: now_iso(),
        source: source.into(),
        demo: live_hits < 4,
        notice: if live_hits < 4 {
            Some("部分数据来自协议样例".into())
        } else {
            None
        },
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    })
}

// ─── Unit tests ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_overview_parses_and_has_required_panels() {
        let resp = parse_panels_fixture(FIXTURE_OVERVIEW).expect("parse overview");
        assert!(resp.panels.len() >= 5);
        let ids: Vec<_> = resp.panels.iter().map(|p| p.id.as_str()).collect();
        for need in ["messages", "mentor", "counselor", "dorm", "profile"] {
            assert!(ids.contains(&need), "missing panel {need}");
        }
        assert_eq!(resp.source, "fixture");
        assert!(resp.demo);
    }

    #[test]
    fn fixture_messages_parses() {
        let resp = parse_messages_fixture(FIXTURE_MESSAGES).expect("parse messages");
        assert!(!resp.items.is_empty());
        assert!(!resp.items[0].id.is_empty());
        assert!(!resp.items[0].title.is_empty());
    }

    #[test]
    fn fixture_profile_blocks_parses() {
        let resp = parse_profile_blocks_fixture(FIXTURE_PROFILE_BLOCKS).expect("parse blocks");
        let mentor = resp.mentor.expect("mentor");
        assert!(!mentor.name.is_empty());
        let counselor = resp.counselor.expect("counselor");
        assert!(!counselor.name.is_empty());
        let dorm = resp.dorm.expect("dorm");
        assert!(dorm.building.is_some() || dorm.room.is_some());
        let profile = resp.profile.expect("profile");
        assert!(!profile.student_id.is_empty());
        // 脱敏：不应出现完整明文手机号形态（11 位纯数字）
        if let Some(phone) = &profile.phone {
            assert!(
                phone.contains('*') || phone.chars().filter(|c| c.is_ascii_digit()).count() < 11,
                "phone should be desensitized: {phone}"
            );
        }
    }

    #[test]
    fn parse_panels_live_from_wrapped_payload() {
        let raw = serde_json::json!({
            "code": 0,
            "data": {
                "panels": [
                    {"id": "messages", "title": "消息", "summary": "s", "order": 1}
                ]
            }
        });
        let panels = parse_panels_live(&raw).expect("panels");
        assert_eq!(panels.len(), 1);
        assert_eq!(panels[0].id, "messages");
    }

    #[test]
    fn parse_messages_live_from_list() {
        let raw = serde_json::json!({
            "code": "200",
            "data": {
                "list": [
                    {"id": "1", "title": "t", "content": "c", "isRead": "0"}
                ]
            }
        });
        let items = parse_messages_live(&raw).expect("items");
        assert_eq!(items.len(), 1);
        assert!(!items[0].is_read);
    }

    #[test]
    fn login_redirect_detected() {
        assert!(looks_like_login_redirect(
            "https://auth.hbut.edu.cn/authserver/login?service=x"
        ));
        assert!(!looks_like_login_redirect(
            "https://xg.hbut.edu.cn/api/orientation/overview"
        ));
    }

    #[test]
    fn no_write_paths_in_readonly_constants() {
        // 契约：只读 path 不得包含 submit/upload/save/confirm
        for paths in [
            OVERVIEW_PATHS,
            MESSAGES_PATHS,
            MENTOR_PATHS,
            COUNSELOR_PATHS,
            DORM_PATHS,
            PROFILE_PATHS,
        ] {
            for p in paths {
                let lower = p.to_lowercase();
                assert!(!lower.contains("submit"), "{p}");
                assert!(!lower.contains("upload"), "{p}");
                assert!(!lower.contains("save"), "{p}");
                assert!(!lower.contains("confirm"), "{p}");
            }
        }
    }
}
