//! 智慧迎新只读（#457 / #458）
//!
//! 实测入口（**手机 UA** 融合门户）：
//! - `e.hbut.edu.cn` 办事大厅 → 综合 → 智慧迎新
//! - 落地：`https://stu.hbut.edu.cn/app/welcome/#/welcome/index`
//!
//! 鉴权：
//! 1. CAS `auth.hbut.edu.cn/authserver/login?service=https://stu.hbut.edu.cn/app/welcome/`
//! 2. 带 `ticket` 回跳后 `POST /account/sys/user/idaas/login`
//!    body: `{ ticket, platform: "welcome", appKey: "welcome", type: 1 }`
//! 3. 后续请求 Header：`token: <data.token>`
//!
//! **禁止** save/update/upload 等写接口。

use crate::http_client::HbutClient;
use chrono::Local;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MOBILE_UA: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const WELCOME_BASE: &str = "https://stu.hbut.edu.cn";
const WELCOME_APP: &str = "https://stu.hbut.edu.cn/app/welcome/";
const CAS_LOGIN: &str = "https://auth.hbut.edu.cn/authserver/login";
const APP_KEY: &str = "welcome";

const FIXTURE_STUDENT: &str =
    include_str!("../../tests/fixtures/smart-orientation/student_myInfo.json");
const FIXTURE_TEACHER: &str = include_str!("../../tests/fixtures/smart-orientation/myTeacher.json");
const FIXTURE_BED: &str = include_str!("../../tests/fixtures/smart-orientation/bed_myInfo.json");
const FIXTURE_CONFIG: &str =
    include_str!("../../tests/fixtures/smart-orientation/config_myInfo.json");
const FIXTURE_FORECAST: &str =
    include_str!("../../tests/fixtures/smart-orientation/forecast_myInfo.json");

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

fn now_iso() -> String {
    Local::now().to_rfc3339()
}

fn json_str(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn data_obj(raw: &Value) -> Option<&Value> {
    raw.get("data").filter(|d| !d.is_null())
}

fn api_ok(raw: &Value) -> bool {
    match raw.get("code") {
        None => true,
        Some(Value::Number(n)) => n.as_i64() == Some(0) || n.as_i64() == Some(200),
        Some(Value::String(s)) => s == "0" || s == "200" || s.eq_ignore_ascii_case("ok"),
        _ => false,
    }
}

/// 解析学生档案（`/account/base/student/myInfo`）
pub fn parse_student_my_info(raw: &Value) -> Option<OrientationProfile> {
    let d = data_obj(raw)?;
    let name = json_str(d.get("studentName").or_else(|| d.get("name")));
    let sid = json_str(
        d.get("studentId")
            .or_else(|| d.get("studentNo"))
            .or_else(|| d.get("username")),
    );
    if name.is_empty() && sid.is_empty() {
        return None;
    }
    let phone = json_str(d.get("phoneNumber").or_else(|| d.get("phone")));
    let idc = json_str(d.get("idCard"));
    Some(OrientationProfile {
        student_id: sid,
        name,
        gender: non_empty(json_str(d.get("sexName").or_else(|| d.get("sex")))),
        college: non_empty(json_str(d.get("collegeName"))),
        major: non_empty(json_str(d.get("majorName"))),
        class_name: non_empty(json_str(d.get("className"))),
        grade: non_empty(json_str(d.get("grade").or_else(|| d.get("enrollmentYear")))),
        education_level: non_empty(json_str(d.get("academicDegreeName"))),
        id_number: non_empty(mask_id_card(&idc)),
        phone: non_empty(mask_phone(&phone)),
        orientation_status: non_empty(json_str(
            d.get("studentStatusName")
                .or_else(|| d.get("dormitoryInfo")),
        )),
    })
}

/// 解析辅导员/班导师（`/account/base/teacher/myTeacher`）
pub fn parse_my_teacher(raw: &Value) -> (Option<OrientationPerson>, Option<OrientationPerson>) {
    let Some(d) = data_obj(raw) else {
        return (None, None);
    };
    let counselor = d.get("counselor").and_then(parse_person_obj);
    let mentor = d
        .get("classTeacher")
        .or_else(|| d.get("class_teacher"))
        .and_then(parse_person_obj);
    (mentor, counselor)
}

fn parse_person_obj(v: &Value) -> Option<OrientationPerson> {
    let name = json_str(v.get("name"));
    if name.is_empty() {
        return None;
    }
    let phone = json_str(v.get("phoneNumber").or_else(|| v.get("phone")));
    let email = json_str(v.get("dzxx").or_else(|| v.get("email")));
    let title = json_str(v.get("jszc").or_else(|| v.get("gwmc")));
    Some(OrientationPerson {
        name,
        staff_id: non_empty(json_str(v.get("teacherId"))),
        college: non_empty(json_str(v.get("orgName"))),
        phone: non_empty(mask_phone(&phone)),
        email: non_empty(email),
        office: non_empty(json_str(v.get("gzdh"))),
        remark: non_empty(title),
    })
}

/// 解析宿舍床位（`/dormitory-accommodation/dormitory/student/bed/myInfo`）
pub fn parse_bed_my_info(raw: &Value) -> Option<OrientationDorm> {
    let d = data_obj(raw)?;
    let building = json_str(d.get("buildingName"));
    let room = json_str(d.get("houseName"));
    let bed = json_str(d.get("bedName"));
    let area = json_str(d.get("areaName"));
    let campus = json_str(d.get("campusName"));
    if building.is_empty() && room.is_empty() && bed.is_empty() {
        return None;
    }
    let type_name = json_str(d.get("typeName"));
    let checkin = json_str(d.get("checkinTime"));
    let mut remark_parts = Vec::new();
    if !type_name.is_empty() {
        remark_parts.push(type_name);
    }
    if !checkin.is_empty() {
        remark_parts.push(format!("入住 {checkin}"));
    }
    Some(OrientationDorm {
        campus: non_empty(if area.is_empty() {
            campus
        } else {
            format!("{campus} {area}").trim().to_string()
        }),
        building: non_empty(building),
        room: non_empty(room),
        bed: non_empty(bed),
        status: Some(if d.get("isPublish").and_then(|v| v.as_i64()) == Some(1) {
            "已分配".into()
        } else {
            "未发布".into()
        }),
        remark: non_empty(remark_parts.join(" · ")),
    })
}

/// 配置步骤 → 消息/状态列表（`/account/base/student/config/myInfo`）
pub fn parse_config_steps(raw: &Value) -> Vec<OrientationMessage> {
    let Some(arr) = data_obj(raw).and_then(|d| d.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in arr {
        let id = json_str(item.get("id").or_else(|| item.get("type")));
        let title = json_str(item.get("name"));
        if title.is_empty() {
            continue;
        }
        let brief = json_str(item.get("brief"));
        let done = item.get("isComplete").and_then(|v| v.as_i64()).unwrap_or(0) == 1;
        let status = item.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
        let status_txt = match status {
            2 if done => "已完成",
            1 => "进行中",
            0 => "未开始",
            _ if done => "已完成",
            _ => "状态未知",
        };
        out.push(OrientationMessage {
            id: if id.is_empty() {
                format!("step-{}", out.len() + 1)
            } else {
                id
            },
            title,
            summary: format!("{status_txt} · {brief}"),
            body: brief,
            published_at: json_str(item.get("endTime")),
            is_read: done,
            category: Some("info_step".into()),
        });
    }
    out
}

/// 预报到事项（`/welcome-forecast/student/forecast/myInfo`）
pub fn parse_forecast_items(raw: &Value) -> Vec<OrientationMessage> {
    let Some(arr) = data_obj(raw).and_then(|d| d.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in arr {
        let id = json_str(item.get("id").or_else(|| item.get("type")));
        let title = json_str(item.get("name"));
        if title.is_empty() {
            continue;
        }
        let brief = json_str(item.get("brief"));
        let done = json_str(item.get("doneStatus")) == "1";
        out.push(OrientationMessage {
            id: if id.is_empty() {
                format!("fc-{}", out.len() + 1)
            } else {
                id
            },
            title,
            summary: format!("{} · {}", if done { "已完成" } else { "未完成" }, brief),
            body: brief,
            published_at: json_str(item.get("applyTime")),
            is_read: done,
            category: Some("forecast".into()),
        });
    }
    out
}

fn non_empty(s: String) -> Option<String> {
    let t = s.trim().to_string();
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

fn mask_phone(s: &str) -> String {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 11 {
        format!("{}****{}", &digits[..3], &digits[7..])
    } else {
        s.to_string()
    }
}

fn mask_id_card(s: &str) -> String {
    let t = s.trim();
    if t.len() >= 15 {
        format!(
            "{}**********{}",
            &t[..4.min(t.len())],
            &t[t.len().saturating_sub(4)..]
        )
    } else {
        t.to_string()
    }
}

fn orientation_demo_allowed() -> bool {
    match std::env::var("MINI_HBUT_ORIENTATION_DEMO") {
        Ok(v) => {
            let t = v.trim().to_ascii_lowercase();
            t == "1" || t == "true" || t == "yes" || t == "on"
        }
        Err(_) => false,
    }
}

// ─── HTTP helpers ───────────────────────────────────────────

fn mobile_headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(USER_AGENT, HeaderValue::from_static(MOBILE_UA));
    h.insert(
        "Accept",
        HeaderValue::from_static("application/json, text/plain, */*"),
    );
    h.insert(
        "X-Requested-With",
        HeaderValue::from_static("XMLHttpRequest"),
    );
    h
}

fn extract_ticket(url: &str) -> Option<String> {
    let u = reqwest::Url::parse(url).ok()?;
    u.query_pairs()
        .find(|(k, _)| k == "ticket")
        .map(|(_, v)| v.to_string())
        .filter(|s| !s.is_empty())
}

/// CAS + idaas 换 token（依赖 HbutClient 已有融合门户/CAS cookie）
async fn mint_welcome_token(client: &HbutClient) -> Result<String, String> {
    let http = client.http_client();
    let service = WELCOME_APP;
    let cas_url = format!("{CAS_LOGIN}?service={}", urlencoding::encode(service));
    let resp = http
        .get(&cas_url)
        .headers(mobile_headers())
        .send()
        .await
        .map_err(|e| format!("CAS 跳转失败: {e}"))?;
    let final_url = resp.url().to_string();
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();

    let mut ticket = extract_ticket(&final_url);
    if ticket.is_none() {
        // 偶发 ticket 在 HTML 重定向链接中
        if let Ok(re) = regex::Regex::new(r#"ticket=([^&"'\s]+)"#) {
            if let Some(c) = re.captures(&body) {
                ticket = c.get(1).map(|m| {
                    urlencoding::decode(m.as_str())
                        .map(|c| c.into_owned())
                        .unwrap_or_else(|_| m.as_str().to_string())
                });
            }
        }
    }
    let ticket = ticket.ok_or_else(|| {
        if final_url.contains("authserver/login") {
            "融合门户会话已过期，请重新登录后再打开智慧迎新".to_string()
        } else {
            format!("未获取 CAS ticket（HTTP {status}）")
        }
    })?;

    let payload = json!({
        "ticket": ticket,
        "platform": APP_KEY,
        "appKey": APP_KEY,
        "type": 1
    });
    let login_url = format!("{WELCOME_BASE}/account/sys/user/idaas/login");
    let login_resp = http
        .post(&login_url)
        .headers(mobile_headers())
        .header("Content-Type", "application/json")
        .header("Origin", WELCOME_BASE)
        .header("Referer", WELCOME_APP)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("idaas 登录失败: {e}"))?;
    let login_json: Value = login_resp
        .json()
        .await
        .map_err(|e| format!("idaas 响应解析失败: {e}"))?;
    if !api_ok(&login_json) {
        let msg = json_str(login_json.get("msg").or_else(|| login_json.get("message")));
        return Err(if msg.is_empty() {
            "智慧迎新 idaas 登录失败".into()
        } else {
            msg
        });
    }
    let token = json_str(
        login_json
            .get("data")
            .and_then(|d| d.get("token"))
            .or_else(|| login_json.get("token")),
    );
    if token.is_empty() {
        return Err("idaas 未返回 token".into());
    }
    Ok(token)
}

async fn get_json_with_token(
    client: &HbutClient,
    token: &str,
    path: &str,
) -> Result<Value, String> {
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{WELCOME_BASE}{path}")
    };
    let resp = client
        .http_client()
        .get(&url)
        .headers(mobile_headers())
        .header("token", token)
        .header("Referer", WELCOME_APP)
        .send()
        .await
        .map_err(|e| format!("请求失败 {path}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.as_u16() == 403 || text.contains("token失效") {
        return Err("会话已过期".into());
    }
    serde_json::from_str(&text).map_err(|e| {
        format!(
            "JSON 解析失败 {path}: {e}; body={}",
            text.chars().take(120).collect::<String>()
        )
    })
}

async fn fetch_live_bundle(
    client: &HbutClient,
) -> Result<
    (
        OrientationProfileBlocksResponse,
        OrientationMessagesResponse,
        OrientationPanelsResponse,
    ),
    String,
> {
    let token = mint_welcome_token(client).await?;

    let student = get_json_with_token(client, &token, "/account/base/student/myInfo").await;
    let teacher = get_json_with_token(client, &token, "/account/base/teacher/myTeacher").await;
    let bed = get_json_with_token(
        client,
        &token,
        "/dormitory-accommodation/dormitory/student/bed/myInfo",
    )
    .await;
    let config = get_json_with_token(client, &token, "/account/base/student/config/myInfo").await;
    let forecast =
        get_json_with_token(client, &token, "/welcome-forecast/student/forecast/myInfo").await;
    let test_pass = get_json_with_token(client, &token, "/welcome-forecast/test/isPass").await;
    let forecast_done = get_json_with_token(
        client,
        &token,
        "/welcome-forecast/student/forecast/isComplete",
    )
    .await;

    let mut errors = Vec::new();
    let profile = match &student {
        Ok(v) => parse_student_my_info(v),
        Err(e) => {
            errors.push(format!("myInfo: {e}"));
            None
        }
    };
    let (mentor, counselor) = match &teacher {
        Ok(v) => parse_my_teacher(v),
        Err(e) => {
            errors.push(format!("myTeacher: {e}"));
            (None, None)
        }
    };
    let dorm = match &bed {
        Ok(v) => parse_bed_my_info(v),
        Err(e) => {
            errors.push(format!("bed: {e}"));
            None
        }
    };

    let mut messages = Vec::new();
    if let Ok(v) = &config {
        messages.extend(parse_config_steps(v));
    } else if let Err(e) = &config {
        errors.push(format!("config: {e}"));
    }
    if let Ok(v) = &forecast {
        messages.extend(parse_forecast_items(v));
    } else if let Err(e) = &forecast {
        errors.push(format!("forecast: {e}"));
    }
    if let Ok(v) = &test_pass {
        let pass = json_str(v.get("data").or_else(|| v.get("msg")));
        if !pass.is_empty() {
            messages.insert(
                0,
                OrientationMessage {
                    id: "entry-test".into(),
                    title: "入学测试".into(),
                    summary: pass.clone(),
                    body: pass,
                    published_at: String::new(),
                    is_read: true,
                    category: Some("test".into()),
                },
            );
        }
    }
    if let Ok(v) = &forecast_done {
        let s = json_str(v.get("data").or_else(|| v.get("msg")));
        if !s.is_empty() {
            messages.insert(
                0,
                OrientationMessage {
                    id: "forecast-complete".into(),
                    title: "在线预报到".into(),
                    summary: s.clone(),
                    body: s,
                    published_at: String::new(),
                    is_read: true,
                    category: Some("forecast".into()),
                },
            );
        }
    }

    let has_any = profile.is_some()
        || mentor.is_some()
        || counselor.is_some()
        || dorm.is_some()
        || !messages.is_empty();

    let notice = if has_any {
        None
    } else {
        Some("已登录智慧迎新，但当前无可展示只读数据".into())
    };

    let blocks = OrientationProfileBlocksResponse {
        mentor,
        counselor,
        dorm,
        profile: profile.clone(),
        fetched_at: now_iso(),
        source: "live".into(),
        demo: false,
        notice: notice.clone(),
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    };

    let msgs = OrientationMessagesResponse {
        items: messages,
        fetched_at: now_iso(),
        source: "live".into(),
        demo: false,
        notice: notice.clone(),
        error: None,
    };

    let mut panels = vec![
        OrientationPanel {
            id: "messages".into(),
            title: "事项与进度".into(),
            summary: format!("{} 条", msgs.items.len()),
            badge: if msgs.items.is_empty() {
                None
            } else {
                Some(msgs.items.len().to_string())
            },
            order: 1,
            icon_key: Some("messages".into()),
        },
        OrientationPanel {
            id: "mentor".into(),
            title: "班导师".into(),
            summary: blocks
                .mentor
                .as_ref()
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "暂无".into()),
            badge: None,
            order: 2,
            icon_key: Some("mentor".into()),
        },
        OrientationPanel {
            id: "counselor".into(),
            title: "辅导员".into(),
            summary: blocks
                .counselor
                .as_ref()
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "暂无".into()),
            badge: None,
            order: 3,
            icon_key: Some("counselor".into()),
        },
        OrientationPanel {
            id: "dorm".into(),
            title: "宿舍信息".into(),
            summary: blocks
                .dorm
                .as_ref()
                .map(|d| {
                    format!(
                        "{} {} {}",
                        d.building.clone().unwrap_or_default(),
                        d.room.clone().unwrap_or_default(),
                        d.bed.clone().map(|b| format!("{b}床")).unwrap_or_default()
                    )
                    .trim()
                    .to_string()
                })
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "暂无".into()),
            badge: None,
            order: 4,
            icon_key: Some("dorm".into()),
        },
        OrientationPanel {
            id: "profile".into(),
            title: "个人信息".into(),
            summary: profile
                .as_ref()
                .map(|p| format!("{} · {}", p.name, p.college.clone().unwrap_or_default()))
                .unwrap_or_else(|| "暂无".into()),
            badge: None,
            order: 5,
            icon_key: Some("profile".into()),
        },
    ];
    panels.sort_by_key(|p| p.order);

    let panels_resp = OrientationPanelsResponse {
        panels,
        fetched_at: now_iso(),
        source: "live".into(),
        demo: false,
        notice,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    };

    Ok((blocks, msgs, panels_resp))
}

fn empty_panels(notice: &str, error: Option<&str>) -> OrientationPanelsResponse {
    OrientationPanelsResponse {
        panels: vec![],
        fetched_at: now_iso(),
        source: "empty".into(),
        demo: false,
        notice: Some(notice.into()),
        error: error.map(|s| s.into()),
    }
}

fn empty_messages(notice: &str, error: Option<&str>) -> OrientationMessagesResponse {
    OrientationMessagesResponse {
        items: vec![],
        fetched_at: now_iso(),
        source: "empty".into(),
        demo: false,
        notice: Some(notice.into()),
        error: error.map(|s| s.into()),
    }
}

fn empty_blocks(notice: &str, error: Option<&str>) -> OrientationProfileBlocksResponse {
    OrientationProfileBlocksResponse {
        mentor: None,
        counselor: None,
        dorm: None,
        profile: None,
        fetched_at: now_iso(),
        source: "empty".into(),
        demo: false,
        notice: Some(notice.into()),
        error: error.map(|s| s.into()),
    }
}

fn fixture_blocks() -> OrientationProfileBlocksResponse {
    let student: Value = serde_json::from_str(FIXTURE_STUDENT).unwrap_or(json!({}));
    let teacher: Value = serde_json::from_str(FIXTURE_TEACHER).unwrap_or(json!({}));
    let bed: Value = serde_json::from_str(FIXTURE_BED).unwrap_or(json!({}));
    let (mentor, counselor) = parse_my_teacher(&teacher);
    OrientationProfileBlocksResponse {
        mentor,
        counselor,
        dorm: parse_bed_my_info(&bed),
        profile: parse_student_my_info(&student),
        fetched_at: now_iso(),
        source: "fixture".into(),
        demo: true,
        notice: Some("开发样例数据（MINI_HBUT_ORIENTATION_DEMO=1）".into()),
        error: None,
    }
}

fn fixture_messages() -> OrientationMessagesResponse {
    let config: Value = serde_json::from_str(FIXTURE_CONFIG).unwrap_or(json!({}));
    let forecast: Value = serde_json::from_str(FIXTURE_FORECAST).unwrap_or(json!({}));
    let mut items = parse_config_steps(&config);
    items.extend(parse_forecast_items(&forecast));
    OrientationMessagesResponse {
        items,
        fetched_at: now_iso(),
        source: "fixture".into(),
        demo: true,
        notice: Some("开发样例数据（MINI_HBUT_ORIENTATION_DEMO=1）".into()),
        error: None,
    }
}

// ─── Public API ─────────────────────────────────────────────

pub async fn list_panels(client: &HbutClient) -> Result<OrientationPanelsResponse, String> {
    match fetch_live_bundle(client).await {
        Ok((_, _, panels)) => Ok(panels),
        Err(e) => {
            if e.contains("会话已过期") || e.contains("重新登录") {
                return Err(e);
            }
            if orientation_demo_allowed() {
                let blocks = fixture_blocks();
                let msgs = fixture_messages();
                return Ok(OrientationPanelsResponse {
                    panels: vec![
                        OrientationPanel {
                            id: "messages".into(),
                            title: "事项与进度".into(),
                            summary: format!("{} 条", msgs.items.len()),
                            badge: Some(msgs.items.len().to_string()),
                            order: 1,
                            icon_key: Some("messages".into()),
                        },
                        OrientationPanel {
                            id: "mentor".into(),
                            title: "班导师".into(),
                            summary: blocks
                                .mentor
                                .as_ref()
                                .map(|p| p.name.clone())
                                .unwrap_or_default(),
                            badge: None,
                            order: 2,
                            icon_key: Some("mentor".into()),
                        },
                        OrientationPanel {
                            id: "counselor".into(),
                            title: "辅导员".into(),
                            summary: blocks
                                .counselor
                                .as_ref()
                                .map(|p| p.name.clone())
                                .unwrap_or_default(),
                            badge: None,
                            order: 3,
                            icon_key: Some("counselor".into()),
                        },
                        OrientationPanel {
                            id: "dorm".into(),
                            title: "宿舍信息".into(),
                            summary: "样例".into(),
                            badge: None,
                            order: 4,
                            icon_key: Some("dorm".into()),
                        },
                        OrientationPanel {
                            id: "profile".into(),
                            title: "个人信息".into(),
                            summary: "样例".into(),
                            badge: None,
                            order: 5,
                            icon_key: Some("profile".into()),
                        },
                    ],
                    fetched_at: now_iso(),
                    source: "fixture".into(),
                    demo: true,
                    notice: Some(format!("live 失败，展示样例：{e}")),
                    error: Some(e),
                });
            }
            Ok(empty_panels(
                "暂未获取智慧迎新数据。请使用手机 UA 门户会话，或确认处于迎新相关时段。",
                Some(&e),
            ))
        }
    }
}

pub async fn list_messages(client: &HbutClient) -> Result<OrientationMessagesResponse, String> {
    match fetch_live_bundle(client).await {
        Ok((_, msgs, _)) => Ok(msgs),
        Err(e) => {
            if e.contains("会话已过期") || e.contains("重新登录") {
                return Err(e);
            }
            if orientation_demo_allowed() {
                let mut m = fixture_messages();
                m.error = Some(e);
                return Ok(m);
            }
            Ok(empty_messages("暂无事项与进度", Some(&e)))
        }
    }
}

pub async fn profile_blocks(
    client: &HbutClient,
) -> Result<OrientationProfileBlocksResponse, String> {
    match fetch_live_bundle(client).await {
        Ok((blocks, _, _)) => Ok(blocks),
        Err(e) => {
            if e.contains("会话已过期") || e.contains("重新登录") {
                return Err(e);
            }
            if orientation_demo_allowed() {
                let mut b = fixture_blocks();
                b.error = Some(e);
                return Ok(b);
            }
            Ok(empty_blocks("暂无导师/宿舍/个人信息", Some(&e)))
        }
    }
}

// ─── Tests ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_student_fixture() {
        let raw: Value = serde_json::from_str(FIXTURE_STUDENT).unwrap();
        let p = parse_student_my_info(&raw).expect("profile");
        assert!(!p.name.is_empty());
        assert!(!p.student_id.is_empty());
        assert!(p.college.as_deref().unwrap_or("").contains("电气"));
        // 脱敏：手机不应 11 位全数字
        if let Some(ph) = &p.phone {
            assert!(ph.contains('*') || ph.chars().filter(|c| c.is_ascii_digit()).count() < 11);
        }
    }

    #[test]
    fn parse_teacher_fixture() {
        let raw: Value = serde_json::from_str(FIXTURE_TEACHER).unwrap();
        let (mentor, counselor) = parse_my_teacher(&raw);
        assert!(counselor.is_some());
        assert!(mentor.is_some());
        assert!(!counselor.unwrap().name.is_empty());
    }

    #[test]
    fn parse_bed_fixture() {
        let raw: Value = serde_json::from_str(FIXTURE_BED).unwrap();
        let d = parse_bed_my_info(&raw).expect("dorm");
        assert_eq!(d.building.as_deref(), Some("东7"));
        assert_eq!(d.room.as_deref(), Some("101"));
        assert_eq!(d.bed.as_deref(), Some("3"));
    }

    #[test]
    fn parse_config_and_forecast() {
        let cfg: Value = serde_json::from_str(FIXTURE_CONFIG).unwrap();
        let steps = parse_config_steps(&cfg);
        assert!(steps.len() >= 3);
        let fc: Value = serde_json::from_str(FIXTURE_FORECAST).unwrap();
        let items = parse_forecast_items(&fc);
        assert!(!items.is_empty());
    }

    #[test]
    fn ticket_extract() {
        assert_eq!(
            extract_ticket("https://stu.hbut.edu.cn/app/welcome/?ticket=ST-1-abc").as_deref(),
            Some("ST-1-abc")
        );
    }

    #[test]
    fn no_write_paths_in_readonly_module_source() {
        let src = include_str!("smart_orientation.rs");
        // 去掉 tests 模块自身字符串后再断言，避免自引用误报
        let prod = src.split("mod tests").next().unwrap_or(src);
        let forbidden = format!("smart_orientation_{}", "submit");
        assert!(!prod.contains(&forbidden));
        assert!(!prod.contains(".post(\"/account/base"));
        assert!(!prod.contains(".post(\"/welcome-forecast"));
        assert!(!prod.contains(".post(\"/dormitory"));
        assert!(prod.contains("idaas/login"));
        assert!(prod.contains("/account/base/student/myInfo"));
        assert!(prod.contains("/account/base/teacher/myTeacher"));
        assert!(prod.contains("/dormitory-accommodation/dormitory/student/bed/myInfo"));
    }

    #[test]
    fn empty_fallback_not_demo() {
        let p = empty_panels("n", Some("e"));
        assert!(!p.demo);
        assert!(p.panels.is_empty());
        let b = empty_blocks("n", None);
        assert!(b.profile.is_none());
        assert!(!b.demo);
    }
}
