//! 学习通：邀请码入班 + 班级资料列表/下载（门户 CAS SSO，不二次登录）。
//!
//! 协议见 `docs/chaoxing-protocol.md`（2026-07-12 Web 逆向）。

use std::error::Error;
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use reqwest::Url;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http_client::HbutClient;

type DynError = Box<dyn Error + Send + Sync>;

/// 内置默认邀请码（与前端 remote_config DEFAULT 一致；课程元数据一律在线解析）
#[allow(dead_code)]
const DEFAULT_INVITE_CODE: &str = "18853572";

/// 可选：仅作邀请码列表兜底（无课程名/ID 硬编码；新班必须走在线 preview）
#[allow(dead_code)]
struct FixedInviteMeta {
    code: &'static str,
}

#[allow(dead_code)]
const FIXED_INVITES: &[FixedInviteMeta] = &[FixedInviteMeta {
    code: DEFAULT_INVITE_CODE,
}];

#[allow(dead_code)]
fn fixed_meta(code: &str) -> Option<&'static FixedInviteMeta> {
    FIXED_INVITES.iter().find(|m| m.code == code.trim())
}

fn err_box(message: impl Into<String>) -> DynError {
    Box::new(io::Error::other(message.into()))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// 快速进出目录时常见瞬时连接失败，可安全重试。
fn is_transient_reqwest_error(err: &reqwest::Error) -> bool {
    err.is_connect()
        || err.is_timeout()
        || err.is_request()
        || err
            .status()
            .map(|s| s.is_server_error() || s.as_u16() == 429)
            .unwrap_or(false)
}

/// GET + 有限次退避重试；仅对 send/读体前的瞬时错误重试。
async fn get_text_with_retry(
    client: &HbutClient,
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

fn short_net_err(raw: &str) -> String {
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

fn normalize_url(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with("//") {
        return format!("https:{t}");
    }
    if t.starts_with("http://") {
        return format!("https://{}", t.trim_start_matches("http://"));
    }
    t.to_string()
}

fn looks_like_login_html(html: &str) -> bool {
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
fn looks_like_html_document(body: &str) -> bool {
    let t = body.trim_start();
    let lower = t.to_ascii_lowercase();
    lower.starts_with("<!doctype")
        || lower.starts_with("<html")
        || lower.starts_with("<head")
        || (lower.starts_with('<') && lower.contains("<html"))
}

fn is_invite_session_error_message(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    m.contains("非 json")
        || m.contains("未登录")
        || m.contains("会话未就绪")
        || m.contains("登录页")
        || m.contains("<!doctype")
        || m.contains("<html")
}

fn looks_like_login_url(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.contains("passport2.chaoxing.com")
        || u.contains("authserver/login")
        || (u.contains("/login") && u.contains("refer="))
}

/// 资料列表页是否像「未加入班级 / 无权访问」（#360）
fn looks_like_not_joined_html(html: &str) -> bool {
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

/// 仅从 HTML 启发式推断 membership（会把空壳资料页误判为 ok，需配合 backclazzdata）
fn infer_list_membership_from_html(html: &str, resource_count: usize) -> &'static str {
    if looks_like_not_joined_html(html) {
        return "not_joined";
    }
    // 有资料行 → 肯定在班
    if resource_count > 0 {
        return "ok";
    }
    // 空列表但页面含资料区/班级壳 → HTML 侧多半仍像「在班」（退课后也可能如此）
    let h = html.to_ascii_lowercase();
    if h.contains("databody")
        || h.contains("databody_td")
        || h.contains("downloadData")
        || h.contains("objectid")
        || html.contains("教师课件")
    {
        return "ok";
    }
    // 仅有通用 coursedata 字样不再视为在班
    if html.len() < 400 || h.contains("error") || h.contains("404") {
        return "unknown";
    }
    "unknown"
}

/// 合并 HTML 启发式与课程列表权威结果。
/// 课程列表明确不在班时优先 not_joined（解决退课后空壳仍显示「暂无资料」）。
fn resolve_membership(html_membership: &'static str, enrolled: Option<bool>) -> &'static str {
    match enrolled {
        Some(false) => "not_joined",
        Some(true) => {
            if html_membership == "not_joined" {
                // 列表有课但资料页明确未加入文案 → 仍以页面为准
                "not_joined"
            } else {
                "ok"
            }
        }
        None => html_membership,
    }
}

/// 从 backclazzdata 解析 (course_id, clazz_id) 列表
fn parse_backclazz_pairs(payload: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Some(channel_list) = payload.get("channelList").and_then(|c| c.as_array()) else {
        return out;
    };
    for item in channel_list {
        let Some(content) = item.get("content") else {
            continue;
        };
        let course = content.get("course").unwrap_or(content);
        let course_id = course
            .get("data")
            .and_then(|d| d.get(0))
            .and_then(|d| d.get("id"))
            .map(|v| match v {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.trim().to_string(),
                _ => String::new(),
            })
            .filter(|s| !s.is_empty())
            .or_else(|| {
                course.get("courseId").map(|v| match v {
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s.trim().to_string(),
                    _ => String::new(),
                })
            })
            .unwrap_or_default();
        let clazz_id = content
            .get("id")
            .map(|v| match v {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.trim().to_string(),
                _ => String::new(),
            })
            .unwrap_or_default();
        if !course_id.is_empty() && !clazz_id.is_empty() {
            out.push((course_id, clazz_id));
        }
    }
    out
}

fn json_result_ok(payload: &Value) -> bool {
    match payload.get("result") {
        Some(Value::Bool(true)) => true,
        Some(Value::Number(n)) => n.as_i64() == Some(1) || n.as_u64() == Some(1),
        Some(Value::String(s)) => {
            let t = s.trim();
            t == "1" || t.eq_ignore_ascii_case("true") || t == "success"
        }
        _ => match payload.get("status") {
            Some(Value::Bool(true)) => true,
            Some(Value::Number(n)) => n.as_i64() == Some(1),
            _ => false,
        },
    }
}

/// 查询学生是否仍在指定课程/班级（权威：mycourse/backclazzdata）
/// - Some(true) 在班
/// - Some(false) 明确不在班（含已退课）
/// - None 接口失败/无法判断
async fn is_student_enrolled_in_clazz(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
) -> Option<bool> {
    let course_id = course_id.trim();
    let clazz_id = clazz_id.trim();
    if course_id.is_empty() || clazz_id.is_empty() {
        return None;
    }
    let url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
    let resp = client
        .client
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/base")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .ok()?;
    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return None;
    }
    let text = resp.text().await.ok()?;
    if looks_like_login_html(&text) {
        return None;
    }
    let payload: Value = serde_json::from_str(&text).ok()?;
    if !json_result_ok(&payload) {
        // 某些账号 result 字段异常但仍有 channelList
        if payload
            .get("channelList")
            .and_then(|c| c.as_array())
            .is_none()
        {
            return None;
        }
    }
    let pairs = parse_backclazz_pairs(&payload);
    // 能成功解析接口：列表中须同时命中 course_id + clazz_id
    let enrolled = pairs.iter().any(|(c, z)| c == course_id && z == clazz_id);
    // 仅有 course 无 clazz 精确匹配时：同 course 也视为仍在课（退课通常两者都消失）
    let enrolled = enrolled || pairs.iter().any(|(c, _)| c == course_id);
    Some(enrolled)
}

/// 确保门户 SSO → 学习通会话可用（走统一会话层，可静默续期，禁止 force 全量课程）。
/// `portal_password`：前端 Web 加密备份密码（#367 移动端密钥环空）
pub async fn ensure_sso_session(
    client: &mut HbutClient,
    student_id: Option<&str>,
    portal_password: Option<&str>,
) -> Result<Value, DynError> {
    use crate::modules::chaoxing_sso::{ensure_chaoxing_sso, EnsureSsoOptions};

    match ensure_chaoxing_sso(
        client,
        student_id,
        EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: portal_password
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
        },
    )
    .await
    {
        Ok(v) => Ok(v),
        Err(e) => Err(e),
    }
}

/// 探测学生/教师是否可访问该班资料（教师用 ut=t，学生用 ut=s + 课程列表）
async fn probe_class_accessible(client: &HbutClient, course_id: &str, clazz_id: &str) -> bool {
    // 学生：在「我的课程」列表中
    if let Some(true) = is_student_enrolled_in_clazz(client, course_id, clazz_id).await {
        return true;
    }
    // 教师或已入班：资料页可访问（优先学生视角，再教师视角）
    if probe_datalist_accessible(client, course_id, clazz_id, "s").await {
        return true;
    }
    probe_datalist_accessible(client, course_id, clazz_id, "t").await
}

async fn probe_datalist_accessible(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    ut: &str,
) -> bool {
    let t = now_ms();
    let list_url = format!(
        "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&clazzid={}&cpi=0&ut={}&t={}",
        urlencoding::encode(course_id),
        urlencoding::encode(clazz_id),
        urlencoding::encode(ut),
        t
    );
    let Ok(resp) = client
        .client
        .get(&list_url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .send()
        .await
    else {
        return false;
    };
    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return false;
    }
    let Ok(html) = resp.text().await else {
        return false;
    };
    if looks_like_login_html(&html) {
        return false;
    }
    if looks_like_not_joined_html(&html) {
        return false;
    }
    // 真实资料行 / 教师课件入口 / 资料区结构
    html.contains("dataBody_td")
        || html.contains("downloadData")
        || html.contains("objectid=")
        || html.contains("教师课件")
        || html.contains("dataBody")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvitePreview {
    pub invite_code: String,
    pub course_id: String,
    pub clazz_id: String,
    pub course_name: String,
    pub teacher_name: String,
    pub cover_url: String,
    pub addclz_enc: String,
    pub addclz_timestamp: String,
    pub middle_url: String,
}

fn extract_hidden(html: &str, id: &str) -> String {
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

fn extract_js_or_attr(html: &str, key: &str) -> String {
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

fn extract_from_url(url: &str, key: &str) -> String {
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

fn extract_text_class(html: &str, class: &str) -> String {
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

#[allow(dead_code)]
fn preview_from_fixed(code: &str) -> Option<InvitePreview> {
    // 不再内置课程 ID/名称（班课会换）；仅确认邀请码在内置表时返回空壳，迫使走在线解析
    let meta = fixed_meta(code)?;
    Some(InvitePreview {
        invite_code: meta.code.to_string(),
        course_id: String::new(),
        clazz_id: String::new(),
        course_name: String::new(),
        teacher_name: String::new(),
        cover_url: String::new(),
        addclz_enc: String::new(),
        addclz_timestamp: String::new(),
        middle_url: format!(
            "https://mooc1.chaoxing.com/addcourse/pcqrcodemiddleview?inviteCode={}",
            meta.code
        ),
    })
}

/// 解析邀请码 → 课程/班级预览（不入班）
/// `portal_password`：#375 会话假复用后静默重桥接
pub async fn preview_invite(
    client: &mut HbutClient,
    invite_code: &str,
    portal_password: Option<&str>,
) -> Result<InvitePreview, DynError> {
    let code = invite_code.trim();
    if code.is_empty() {
        return Err(err_box("请输入邀请码"));
    }

    let pwd = portal_password
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // 统一会话层：必须真有学习通会话，不可仅凭教务 jw 假复用
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: pwd.clone(),
        },
    )
    .await;

    // 在线解析 getInviteCode（课程元数据不内置，均来自学习通）
    let online = fetch_invite_preview_online(client, code).await;
    match online {
        Ok(p) if !p.course_id.is_empty() && !p.clazz_id.is_empty() => Ok(p),
        Ok(p) => Err(err_box(format!(
            "邀请码 {} 已识别但未返回完整课程/班级 ID（course={} clazz={}）",
            code, p.course_id, p.clazz_id
        ))),
        Err(e) => {
            let msg = e.to_string();
            if !is_invite_session_error_message(&msg) {
                return Err(e);
            }
            // #375：假「会话已复用」后接口回 HTML → 作废缓存、强制重桥接再试一次
            println!("[chaoxing] 邀请码会话失效，强制 SSO 后重试: {}", msg);
            crate::modules::chaoxing_sso::invalidate_sso_cache();
            let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
                client,
                None,
                crate::modules::chaoxing_sso::EnsureSsoOptions {
                    force: true,
                    allow_silent_relogin: true,
                    preheated: false,
                    portal_password: pwd,
                },
            )
            .await;
            match fetch_invite_preview_online(client, code).await {
                Ok(p) if !p.course_id.is_empty() && !p.clazz_id.is_empty() => Ok(p),
                Ok(p) => Err(err_box(format!(
                    "邀请码 {} 重试后仍未返回完整课程/班级 ID（course={} clazz={}）",
                    code, p.course_id, p.clazz_id
                ))),
                Err(e2) => Err(err_box(format!(
                    "学习通会话失效且重试仍失败：{}（请重新登录融合门户后重试，不是断网）",
                    e2
                ))),
            }
        }
    }
}

async fn fetch_invite_preview_online(
    client: &mut HbutClient,
    code: &str,
) -> Result<InvitePreview, DynError> {
    let resp = client
        .client
        .post("https://i.chaoxing.com/base/getInviteCode")
        .header("Referer", "https://i.chaoxing.com/")
        .header("Origin", "https://i.chaoxing.com")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .body(format!(
            "invitecode={}&_t={}",
            urlencoding::encode(code),
            now_ms()
        ))
        .send()
        .await
        .map_err(|e| err_box(format!("解析邀请码网络失败（请检查网络）：{}", e)))?;

    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return Err(err_box(
            "学习通会话未就绪（邀请码接口跳转登录页）。请重新登录融合门户后再试，并非断网",
        ));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| err_box(format!("解析邀请码响应失败: {}", e)))?;

    if looks_like_login_html(&body) || looks_like_html_document(&body) {
        return Err(err_box(
            "学习通会话未就绪（邀请码接口返回 HTML/登录页）。请重新登录融合门户后再试",
        ));
    }

    let payload: Value = serde_json::from_str(body.trim()).map_err(|_| {
        err_box(format!(
            "邀请码响应异常（非 JSON，可能未登录学习通）。片段: {}",
            body.chars().take(120).collect::<String>()
        ))
    })?;

    if !payload
        .get("status")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let msg = payload
            .get("msg")
            .or_else(|| payload.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("邀请码无效或已过期");
        return Err(err_box(msg));
    }

    let middle = payload
        .get("url")
        .and_then(|v| v.as_str())
        .map(normalize_url)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| err_box("邀请码返回缺少中间页 url"))?;

    let page = client
        .client
        .get(&middle)
        .header("Referer", "https://i.chaoxing.com/")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| err_box(format!("打开入班页失败: {}", e)))?;

    let page_url = page.url().to_string();
    if looks_like_login_url(&page_url) {
        return Err(err_box(
            "入班页跳转到学习通登录。门户 SSO 可能未完成，请重新登录门户",
        ));
    }

    let html = page
        .text()
        .await
        .map_err(|e| err_box(format!("读取入班页失败: {}", e)))?;

    if looks_like_login_html(&html) {
        return Err(err_box(
            "入班页为登录页。请重新登录融合门户以刷新学习通会话",
        ));
    }

    // 多策略解析 course / clazz
    let mut course_id = extract_hidden(&html, "courseId");
    if course_id.is_empty() {
        course_id = extract_js_or_attr(&html, "courseId");
    }
    if course_id.is_empty() {
        course_id = extract_js_or_attr(&html, "courseid");
    }
    if course_id.is_empty() {
        course_id = extract_from_url(&page_url, "courseId");
    }
    if course_id.is_empty() {
        course_id = extract_from_url(&page_url, "courseid");
    }

    let mut clazz_id = extract_hidden(&html, "clazzId");
    if clazz_id.is_empty() {
        clazz_id = extract_hidden(&html, "classId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_js_or_attr(&html, "clazzId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_js_or_attr(&html, "classId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_from_url(&page_url, "clazzId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_from_url(&page_url, "classId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_from_url(&page_url, "clazzid");
    }

    let mut addclz_enc = extract_hidden(&html, "addclzenc");
    if addclz_enc.is_empty() {
        addclz_enc = extract_js_or_attr(&html, "addclzenc");
    }
    if addclz_enc.is_empty() {
        addclz_enc = extract_from_url(&middle, "enc");
    }

    let mut addclz_timestamp = extract_hidden(&html, "addclztimeStamp");
    if addclz_timestamp.is_empty() {
        addclz_timestamp = extract_js_or_attr(&html, "addclztimeStamp");
    }
    if addclz_timestamp.is_empty() {
        addclz_timestamp = extract_js_or_attr(&html, "timeStamp");
    }

    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box(format!(
            "入班页未解析到课程/班级信息（page={} html_len={}）。可能已入班跳转或会话无效",
            page_url.chars().take(80).collect::<String>(),
            html.len()
        )));
    }

    let mut course_name = extract_text_class(&html, "course-name");
    if course_name.is_empty() {
        course_name = extract_text_class(&html, "colorDeep");
    }
    let mut teacher_name = extract_text_class(&html, "name");
    if teacher_name.is_empty() {
        teacher_name = extract_text_class(&html, "teacher");
    }
    let cover = {
        let re = Regex::new(r#"(?i)<img[^>]+src=["']([^"']+)["']"#).ok();
        re.and_then(|r| {
            r.captures(&html)
                .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        })
        .unwrap_or_default()
    };

    Ok(InvitePreview {
        invite_code: code.to_string(),
        course_id,
        clazz_id,
        course_name,
        teacher_name,
        cover_url: cover,
        addclz_enc,
        addclz_timestamp,
        middle_url: middle,
    })
}

/// 接受邀请入班
pub async fn accept_invite(
    client: &mut HbutClient,
    invite_code: &str,
    portal_password: Option<&str>,
) -> Result<Value, DynError> {
    let code = invite_code.trim();
    let preview = preview_invite(client, code, portal_password).await?;

    // 学生已入班 或 教师可访问资料 → 无需再走 participate
    if probe_class_accessible(client, &preview.course_id, &preview.clazz_id).await {
        return Ok(json!({
            "success": true,
            "already_joined": true,
            "message": "已可访问该班级资料（学生已入班或教师身份）",
            "preview": preview,
        }));
    }

    if preview.addclz_enc.is_empty() || preview.addclz_timestamp.is_empty() {
        // 再尝试在线拉一次完整凭证
        if let Ok(full) = fetch_invite_preview_online(client, code).await {
            if !full.addclz_enc.is_empty() && !full.addclz_timestamp.is_empty() {
                return submit_participate(client, &full).await;
            }
        }
        return Err(err_box(
            "无法获取入班凭证（enc）。通常是门户登录过期导致学习通 SSO 失败，请重新登录融合门户后再试",
        ));
    }

    submit_participate(client, &preview).await
}

async fn submit_participate(
    client: &mut HbutClient,
    preview: &InvitePreview,
) -> Result<Value, DynError> {
    let url = format!(
        "https://mooc1.chaoxing.com/mooc-ans/teachingClassPhoneManage/phone/participateCls?courseId={}&classId={}&enc={}&timeStamp={}&inviteCode={}",
        urlencoding::encode(&preview.course_id),
        urlencoding::encode(&preview.clazz_id),
        urlencoding::encode(&preview.addclz_enc),
        urlencoding::encode(&preview.addclz_timestamp),
        urlencoding::encode(&preview.invite_code),
    );
    let resp = client
        .client
        .get(&url)
        .header("Referer", &preview.middle_url)
        .send()
        .await
        .map_err(|e| err_box(format!("入班请求失败: {}", e)))?;
    let body = resp
        .text()
        .await
        .map_err(|e| err_box(format!("入班响应读取失败: {}", e)))?;
    let payload: Value = serde_json::from_str(&body).unwrap_or_else(
        |_| json!({ "result": 0, "errorMsg": body.chars().take(200).collect::<String>() }),
    );
    let result = payload
        .get("result")
        .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|u| u as i64)))
        .unwrap_or(0);
    if result != 1 {
        let msg = payload
            .get("errorMsg")
            .or_else(|| payload.get("msg"))
            .and_then(|v| v.as_str())
            .unwrap_or("加入课程失败");
        if msg.contains("已") && (msg.contains("加入") || msg.contains("在")) {
            return Ok(json!({
                "success": true,
                "already_joined": true,
                "message": msg,
                "preview": preview,
            }));
        }
        // 入班失败但资料页已可访问
        if probe_class_accessible(client, &preview.course_id, &preview.clazz_id).await {
            return Ok(json!({
                "success": true,
                "already_joined": true,
                "message": msg,
                "preview": preview,
            }));
        }
        return Err(err_box(msg));
    }
    Ok(json!({
        "success": true,
        "already_joined": false,
        "message": "加入成功",
        "preview": preview,
        "raw": payload,
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassResource {
    pub data_id: String,
    pub name: String,
    pub file_type: String,
    pub object_id: String,
    pub size_label: String,
    pub creator: String,
    pub created_at: String,
    pub is_folder: bool,
    /// `tch-courseware` | `afolder` | ``
    pub folder_kind: String,
    pub download_url: String,
    /// 弱降级用，主预览请走 get-preview-url
    pub preview_cdn_url: String,
    /// 列表缩略图（图片类，对齐网页 star3 缩略图）
    pub thumbnail_url: String,
    pub is_downloadable: bool,
}

fn looks_like_image(name: &str, file_type: &str) -> bool {
    let t = format!("{} {}", file_type, name).to_ascii_lowercase();
    t.contains("jpg")
        || t.contains("jpeg")
        || t.contains("png")
        || t.contains("gif")
        || t.contains("webp")
        || t.contains("bmp")
        || t.contains("heic")
}

fn looks_like_video(name: &str, file_type: &str) -> bool {
    let t = format!("{} {}", file_type, name).to_ascii_lowercase();
    t.contains("mp4")
        || t.contains("mov")
        || t.contains("avi")
        || t.contains("mkv")
        || t.contains("webm")
        || t.contains("m4v")
}

/// 网页列表常用缩略图：`star3/150_150c/{objectId}`
fn build_thumbnail_url(object_id: &str, name: &str, file_type: &str) -> String {
    let oid = object_id.trim();
    if oid.is_empty() || !looks_like_image(name, file_type) {
        return String::new();
    }
    format!("https://p.ananas.chaoxing.com/star3/150_150c/{oid}")
}

fn build_image_cdn_candidates(object_id: &str) -> Vec<String> {
    let oid = object_id.trim();
    if oid.is_empty() {
        return Vec::new();
    }
    vec![
        format!("https://p.ananas.chaoxing.com/star3/origin/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/400_400c/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/270_160c/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/150_150c/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/270_160c/{oid}.png"),
    ]
}

fn is_direct_media_url(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    if u.contains("objectshowpreview") || u.contains(".html") {
        return false;
    }
    u.contains(".jpg")
        || u.contains(".jpeg")
        || u.contains(".png")
        || u.contains(".gif")
        || u.contains(".webp")
        || u.contains(".bmp")
        || u.contains("/star3/")
        || u.contains("download")
        || u.contains("cloudstorage")
}

#[derive(Debug, Clone, Default)]
pub struct ListResourcesOpts {
    pub cpi: Option<String>,
    /// 普通文件夹 dataId；教师课件用 folder_kind=tch-courseware
    pub parent_data_id: Option<String>,
    pub data_name: Option<String>,
    pub parent_chain: Option<String>,
    /// `tch-courseware` 时走 mobilelearn 课件列表 API
    pub folder_kind: Option<String>,
}

fn classify_folder(
    file_type: &str,
    object_id: &str,
    name: &str,
    inner_html: &str,
) -> (bool, String) {
    let ft = file_type.trim().to_ascii_lowercase();
    if ft == "tch-courseware"
        || inner_html.contains("toCourseware")
        || inner_html.contains("coursewareFolder")
    {
        return (true, "tch-courseware".into());
    }
    if ft == "afolder" || ft == "folder" {
        return (true, "afolder".into());
    }
    if object_id.is_empty()
        && (ft.is_empty() || ft == "dir")
        && (name.contains("文件夹")
            || name.contains("课件")
            || inner_html.contains("folder")
            || inner_html.contains("Folder"))
    {
        return (
            true,
            if name.contains("课件") {
                "tch-courseware".into()
            } else {
                "afolder".into()
            },
        );
    }
    (false, String::new())
}

fn extract_cpi_from_html(html: &str) -> String {
    let from_id = extract_hidden(html, "cpi");
    if !from_id.is_empty() {
        return from_id;
    }
    extract_js_or_attr(html, "cpi")
}

fn row_display_name(row: scraper::ElementRef<'_>, attr_name: &str) -> String {
    if !attr_name.is_empty() {
        return attr_name.to_string();
    }
    // 教师课件等无 dataname：取名称列
    if let Ok(sel) = Selector::parse(".dataBody_name_stu, .dataBody_name, dl dt, .name") {
        if let Some(n) = row.select(&sel).next() {
            let t = n.text().collect::<String>().trim().to_string();
            if !t.is_empty() {
                return t.lines().next().unwrap_or(&t).trim().to_string();
            }
        }
    }
    row.text()
        .map(|s| s.trim().to_string())
        .find(|s| !s.is_empty() && *s != "-")
        .unwrap_or_else(|| "未命名".into())
}

/// 拉取班级资料列表（根目录 / 子文件夹 / 教师课件）
pub async fn list_resources(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    opts: ListResourcesOpts,
) -> Result<Value, DynError> {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await;

    let folder_kind = opts
        .folder_kind
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();

    if folder_kind == "tch-courseware" {
        return list_teacher_courseware(
            client,
            course_id,
            clazz_id,
            opts.parent_data_id.as_deref(),
            opts.cpi.as_deref(),
        )
        .await;
    }

    let mut cpi = opts.cpi.unwrap_or_default();
    if cpi.trim().is_empty() {
        cpi = "0".into();
    }
    let cpi = cpi.trim().to_string();
    let parent_id = opts
        .parent_data_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let data_name = opts.data_name.as_deref().unwrap_or("").trim();
    let parent_chain = opts.parent_chain.as_deref().unwrap_or("").trim();

    // 学生 ut=s 优先；失败或空列表时再试教师 ut=t（教师账号无需入班）
    let (html, list_url, cpi, ut_used) = fetch_datalist_student_or_teacher(
        client,
        course_id,
        clazz_id,
        &cpi,
        parent_id,
        data_name,
        parent_chain,
    )
    .await?;

    let resources = parse_stu_datalist_html(&html, course_id, clazz_id, &cpi);
    // 下载链里带上实际 ut，保证教师可下载
    let resources = rewrite_resources_ut(resources, ut_used);
    let html_membership = infer_list_membership_from_html(&html, resources.len());
    let enrolled = if parent_id.is_none() {
        is_student_enrolled_in_clazz(client, course_id, clazz_id).await
    } else {
        None
    };
    // 教师 ut=t 可访问时，即使学生列表 enrolled=false 也视为 ok
    let membership = if ut_used == "t" && !looks_like_not_joined_html(&html) {
        "ok"
    } else {
        resolve_membership(html_membership, enrolled)
    };
    let role = if ut_used == "t" {
        "teacher"
    } else if enrolled == Some(true) {
        "student"
    } else {
        "unknown"
    };

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "ut": ut_used,
        "role": role,
        "parent_data_id": parent_id.unwrap_or(""),
        "folder_kind": folder_kind,
        "count": resources.len(),
        "resources": resources,
        "list_url": list_url,
        "membership": membership,
        "enrolled": enrolled,
        "membership_html": html_membership,
    }))
}

fn build_stu_datalist_url(
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    parent_id: Option<&str>,
    data_name: &str,
    parent_chain: &str,
    ut: &str,
) -> String {
    let t = now_ms();
    if let Some(pid) = parent_id {
        format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&dataName={}&dataId={}&type=1&parent={}&clazzid={}&cpi={}&ut={}&t={}",
            urlencoding::encode(course_id.trim()),
            urlencoding::encode(data_name),
            urlencoding::encode(pid),
            urlencoding::encode(parent_chain),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(cpi),
            urlencoding::encode(ut),
            t
        )
    } else {
        format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&clazzid={}&cpi={}&ut={}&t={}",
            urlencoding::encode(course_id.trim()),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(cpi),
            urlencoding::encode(ut),
            t
        )
    }
}

/// 学生 ut=s → 教师 ut=t；返回 (html, list_url, cpi, ut)
async fn fetch_datalist_student_or_teacher(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    parent_id: Option<&str>,
    data_name: &str,
    parent_chain: &str,
) -> Result<(String, String, String, &'static str), DynError> {
    let mut last_err: Option<DynError> = None;
    for ut in ["s", "t"] {
        let list_url = build_stu_datalist_url(
            course_id,
            clazz_id,
            cpi,
            parent_id,
            data_name,
            parent_chain,
            ut,
        );
        match get_text_with_retry(
            client,
            &list_url,
            "https://mooc2-ans.chaoxing.com/",
            if ut == "t" {
                "资料列表(教师)"
            } else {
                "资料列表"
            },
        )
        .await
        {
            Ok((html, final_url)) => {
                if looks_like_login_url(&final_url) || looks_like_login_html(&html) {
                    last_err = Some(err_box(
                        "资料页跳转登录。请重新登录融合门户以刷新学习通会话（非断网）",
                    ));
                    continue;
                }
                if looks_like_not_joined_html(&html) && ut == "s" {
                    // 学生视角未加入，继续试教师
                    last_err = Some(err_box("学生视角未加入该班级"));
                    continue;
                }
                let page_cpi = extract_cpi_from_html(&html);
                let cpi_out = if !page_cpi.is_empty() {
                    page_cpi
                } else {
                    cpi.to_string()
                };
                let parsed = parse_stu_datalist_html(&html, course_id, clazz_id, &cpi_out);
                // 学生空列表但教师可能有：根目录且 ut=s 空时再试 t
                if parsed.is_empty()
                    && ut == "s"
                    && parent_id.is_none()
                    && !looks_like_not_joined_html(&html)
                {
                    // 先记下学生结果，若教师更好则用教师
                    let teacher_url = build_stu_datalist_url(
                        course_id,
                        clazz_id,
                        &cpi_out,
                        parent_id,
                        data_name,
                        parent_chain,
                        "t",
                    );
                    if let Ok((html_t, final_t)) = get_text_with_retry(
                        client,
                        &teacher_url,
                        "https://mooc2-ans.chaoxing.com/",
                        "资料列表(教师)",
                    )
                    .await
                    {
                        if !looks_like_login_url(&final_t)
                            && !looks_like_login_html(&html_t)
                            && !looks_like_not_joined_html(&html_t)
                        {
                            let cpi_t = {
                                let p = extract_cpi_from_html(&html_t);
                                if p.is_empty() {
                                    cpi_out.clone()
                                } else {
                                    p
                                }
                            };
                            let parsed_t =
                                parse_stu_datalist_html(&html_t, course_id, clazz_id, &cpi_t);
                            if !parsed_t.is_empty()
                                || html_t.contains("dataBody")
                                || html_t.contains("教师课件")
                            {
                                return Ok((html_t, teacher_url, cpi_t, "t"));
                            }
                        }
                    }
                    return Ok((html, list_url, cpi_out, "s"));
                }
                if ut == "t" && looks_like_not_joined_html(&html) && parsed.is_empty() {
                    last_err = Some(err_box("教师视角也无法访问该班级资料"));
                    continue;
                }
                return Ok((html, list_url, cpi_out, if ut == "t" { "t" } else { "s" }));
            }
            Err(e) => {
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| err_box("资料列表请求失败")))
}

fn rewrite_resources_ut(mut resources: Vec<ClassResource>, ut: &str) -> Vec<ClassResource> {
    if ut != "t" {
        return resources;
    }
    for item in &mut resources {
        if !item.download_url.is_empty() {
            item.download_url = item
                .download_url
                .replace("ut=s", "ut=t")
                .replace("ut%3Ds", "ut%3Dt");
            if !item.download_url.contains("ut=") {
                let sep = if item.download_url.contains('?') {
                    '&'
                } else {
                    '?'
                };
                item.download_url = format!("{}{}ut=t", item.download_url, sep);
            }
        }
    }
    resources
}

fn parse_stu_datalist_html(
    html: &str,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Vec<ClassResource> {
    let doc = Html::parse_document(html);
    let row_sel = match Selector::parse("ul.dataBody_td, .dataBody_td") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut resources: Vec<ClassResource> = Vec::new();
    for row in doc.select(&row_sel) {
        let id = row.value().attr("id").unwrap_or("").trim().to_string();
        let object_id = row
            .value()
            .attr("objectid")
            .unwrap_or("")
            .trim()
            .to_string();
        let attr_name = row
            .value()
            .attr("dataname")
            .unwrap_or("")
            .trim()
            .to_string();
        let file_type = row.value().attr("type").unwrap_or("").trim().to_string();
        let isdown = row.value().attr("isdown").unwrap_or("").trim();
        let inner = row.inner_html();
        let name = row_display_name(row, &attr_name);
        let (is_folder, folder_kind) = classify_folder(&file_type, &object_id, &name, &inner);

        // 跳过完全空行
        if id.is_empty() && name.is_empty() && !is_folder {
            continue;
        }
        // 教师课件无 id 也要保留
        if id.is_empty() && !is_folder && object_id.is_empty() {
            continue;
        }

        let texts: Vec<String> = row
            .text()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let size_label = texts
            .iter()
            .find(|s| s.contains("MB") || s.contains("KB") || s.contains("GB") || *s == "-")
            .cloned()
            .unwrap_or_else(|| "-".into());
        let is_downloadable = !is_folder && isdown != "0" && !id.is_empty();
        let download_url = if is_downloadable {
            format!(
                "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
                urlencoding::encode(&id),
                urlencoding::encode(clazz_id.trim()),
                urlencoding::encode(cpi),
                urlencoding::encode(course_id.trim())
            )
        } else {
            String::new()
        };
        // 仅作弱降级标记，主预览禁止依赖此 URL
        let preview_cdn_url = if object_id.is_empty() {
            String::new()
        } else {
            format!("https://p.ananas.chaoxing.com/star3/origin/{object_id}")
        };
        let thumbnail_url = build_thumbnail_url(&object_id, &name, &file_type);
        resources.push(ClassResource {
            data_id: id,
            name,
            file_type,
            object_id,
            size_label,
            creator: texts
                .iter()
                .find(|s| {
                    !s.contains("MB")
                        && !s.contains("KB")
                        && !s.contains("GB")
                        && !s.contains('-')
                        && s.chars().count() < 20
                        && *s != "-"
                })
                .cloned()
                .unwrap_or_default(),
            created_at: texts
                .iter()
                .find(|s| {
                    s.contains('-') && (s.contains(':') || s.chars().any(|c| c.is_ascii_digit()))
                })
                .cloned()
                .unwrap_or_default(),
            is_folder,
            folder_kind,
            download_url,
            preview_cdn_url,
            thumbnail_url,
            is_downloadable,
        });
    }
    resources
}

/// 教师课件列表 API（mobilelearn）
async fn list_teacher_courseware(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    parent_folder_id: Option<&str>,
    cpi: Option<&str>,
) -> Result<Value, DynError> {
    let parent = parent_folder_id.unwrap_or("0").trim();
    let parent = if parent.is_empty() { "0" } else { parent };
    let api = format!(
        "https://mobilelearn.chaoxing.com/v2/apis/activePlan/getStudentCourseWareList?DB_STRATEGY=COURSEID&STRATEGY_PARA=courseId&classId={}&courseId={}&page=1&pageSize=50&parentFolderId={}&keyWord=&search=0&createUid=-1&orderByCreateTime=-1&_={}",
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(course_id.trim()),
        urlencoding::encode(parent),
        now_ms()
    );
    let (text, _) = get_text_with_retry(
        client,
        &api,
        "https://mobilelearn.chaoxing.com/",
        "教师课件列表",
    )
    .await?;
    if looks_like_login_html(&text) {
        return Err(err_box("教师课件接口跳转登录，请重登门户"));
    }
    let payload: Value =
        serde_json::from_str(&text).map_err(|e| err_box(format!("教师课件响应非 JSON: {}", e)))?;
    let list = payload
        .pointer("/data/list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let cpi = cpi.unwrap_or("0");
    let mut resources = Vec::new();
    for item in list {
        let data_id = item
            .get("id")
            .or_else(|| item.get("dataId"))
            .or_else(|| item.get("aid"))
            .map(|v| v.to_string().trim_matches('"').to_string())
            .unwrap_or_default();
        let name = item
            .get("name")
            .or_else(|| item.get("title"))
            .or_else(|| item.get("dataName"))
            .and_then(|v| v.as_str())
            .unwrap_or("未命名")
            .to_string();
        let object_id = item
            .get("objectId")
            .or_else(|| item.get("objectid"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let file_type = item
            .get("type")
            .or_else(|| item.get("dataType"))
            .or_else(|| item.get("extension"))
            .map(|v| v.as_str().unwrap_or("").to_string())
            .unwrap_or_default();
        let is_folder = item
            .get("isFolder")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || file_type.eq_ignore_ascii_case("folder")
            || file_type.eq_ignore_ascii_case("afolder");
        let download_url = if !is_folder && !data_id.is_empty() {
            format!(
                "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
                urlencoding::encode(&data_id),
                urlencoding::encode(clazz_id.trim()),
                urlencoding::encode(cpi),
                urlencoding::encode(course_id.trim())
            )
        } else {
            String::new()
        };
        let thumbnail_url = build_thumbnail_url(&object_id, &name, &file_type);
        resources.push(ClassResource {
            data_id: data_id.clone(),
            name: name.clone(),
            file_type: file_type.clone(),
            object_id: object_id.clone(),
            size_label: item
                .get("size")
                .or_else(|| item.get("sizeLabel"))
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_else(|| "-".into()),
            creator: item
                .get("creatorName")
                .or_else(|| item.get("createName"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: item
                .get("createTime")
                .or_else(|| item.get("updateTime"))
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_default(),
            is_folder,
            folder_kind: if is_folder {
                "tch-courseware".into()
            } else {
                String::new()
            },
            download_url,
            preview_cdn_url: if object_id.is_empty() {
                String::new()
            } else {
                format!("https://p.ananas.chaoxing.com/star3/origin/{object_id}")
            },
            thumbnail_url,
            is_downloadable: !is_folder && !data_id.is_empty(),
        });
    }

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "folder_kind": "tch-courseware",
        "parent_data_id": parent,
        "count": resources.len(),
        "resources": resources,
        "list_url": format!(
            "https://mobilelearn.chaoxing.com/page/ppt/studentCourseware/studentCoursewareList?courseId={}&classId={}",
            course_id, clazz_id
        ),
        "raw_total": payload.pointer("/data/allCount").cloned().unwrap_or(json!(resources.len())),
    }))
}

/// 官方预览：必须 get-preview-url；图片优先直链 `<img>`，避免 iframe 黑屏
pub async fn resolve_resource_access(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
    file_name: Option<&str>,
    file_type: Option<&str>,
) -> Result<Value, DynError> {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await;

    let cpi = cpi.unwrap_or("0").trim();
    let oid = object_id.map(str::trim).unwrap_or("").to_string();
    let fname = file_name.unwrap_or("").trim();
    let ftype = file_type.unwrap_or("").trim();
    let is_image = looks_like_image(fname, ftype);
    let is_video = looks_like_video(fname, ftype);

    // 学生 ut=s / 教师 ut=t 双试预览与下载
    let mut preview_url = String::new();
    let mut preview_status = false;
    let mut raw_preview = Value::Null;
    let mut used_ut = "s";
    for ut in ["s", "t"] {
        let probe = format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/get-preview-url?dataId={}&cpi={}&clazzid={}&ut={}&courseid={}",
            urlencoding::encode(data_id.trim()),
            urlencoding::encode(cpi),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(ut),
            urlencoding::encode(course_id.trim())
        );
        if let Ok(resp) = client
            .client
            .get(&probe)
            .header("Referer", "https://mooc2-ans.chaoxing.com/")
            .send()
            .await
        {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    let ok = v.get("status").and_then(|x| x.as_bool()).unwrap_or(false);
                    let u = v
                        .get("url")
                        .or_else(|| v.get("previewUrl"))
                        .or_else(|| v.pointer("/data/url"))
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    if ok && !u.is_empty() {
                        raw_preview = v;
                        preview_status = true;
                        preview_url = normalize_url(&u);
                        used_ut = ut;
                        break;
                    }
                    if raw_preview.is_null() {
                        raw_preview = v;
                    }
                } else if text.trim().starts_with("http") {
                    preview_url = normalize_url(text.trim());
                    preview_status = true;
                    used_ut = ut;
                    break;
                }
            }
        }
    }
    let download_url = format!(
        "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut={}",
        urlencoding::encode(data_id.trim()),
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(cpi),
        urlencoding::encode(course_id.trim()),
        used_ut
    );

    // ananas/status 常返回可直链的 http(s) 字段（图片/视频）
    let mut ananas_http = String::new();
    let mut raw_ananas = Value::Null;
    if !oid.is_empty() {
        let status_url = format!(
            "https://mooc1.chaoxing.com/ananas/status/{}?k=&flag=normal&_={}",
            urlencoding::encode(&oid),
            now_ms()
        );
        if let Ok(resp) = client
            .client
            .get(&status_url)
            .header(
                "Referer",
                "https://mooc1.chaoxing.com/ananas/modules/video/index.html",
            )
            .send()
            .await
        {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    raw_ananas = v.clone();
                    for key in ["https", "http", "download", "pdf", "thumb"] {
                        if let Some(u) = v.get(key).and_then(|x| x.as_str()) {
                            let n = normalize_url(u);
                            if !n.is_empty() {
                                ananas_http = n;
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    let fallback_cdn = if oid.is_empty() {
        String::new()
    } else {
        format!("https://p.ananas.chaoxing.com/star3/origin/{oid}")
    };

    let mut candidates: Vec<String> = Vec::new();
    let push_unique = |list: &mut Vec<String>, u: String| {
        let t = u.trim().to_string();
        if t.is_empty() {
            return;
        }
        if !list.iter().any(|x| x == &t) {
            list.push(t);
        }
    };

    // 图片：必须走 <img> 直链；WebView iframe 不共享 reqwest cookie，objectshowpreview 易黑屏
    let mut preview_mode = if is_image {
        "image"
    } else if is_video {
        "iframe"
    } else {
        "iframe"
    }
    .to_string();

    if is_image {
        if !ananas_http.is_empty() {
            push_unique(&mut candidates, ananas_http.clone());
        }
        if !preview_url.is_empty() && is_direct_media_url(&preview_url) {
            push_unique(&mut candidates, preview_url.clone());
        }
        // 鉴权下载（依赖客户端 cookie，前端无法直接用；优先尝试服务端转 data URL）
        if let Some(data_url) = try_fetch_image_data_url(client, &download_url).await {
            push_unique(&mut candidates, data_url);
            preview_status = true;
        }
        for u in build_image_cdn_candidates(&oid) {
            push_unique(&mut candidates, u);
        }
        if !preview_url.is_empty() {
            push_unique(&mut candidates, preview_url.clone());
        }
        if candidates.is_empty() && !download_url.is_empty() {
            // 最后：系统打开下载链
            push_unique(&mut candidates, download_url.clone());
        }
        preview_url = candidates.first().cloned().unwrap_or_default();
    } else {
        if preview_url.is_empty() {
            if !ananas_http.is_empty() {
                preview_url = ananas_http.clone();
            } else {
                preview_url = fallback_cdn.clone();
            }
        }
        if !preview_url.is_empty() {
            push_unique(&mut candidates, preview_url.clone());
        }
        if !ananas_http.is_empty() {
            push_unique(&mut candidates, ananas_http.clone());
        }
        // 若官方页是 HTML 预览器，保持 iframe；若已是直链媒体可前端降级
        if is_direct_media_url(&preview_url) && is_video {
            preview_mode = "video".into();
        }
    }

    let official = preview_status
        && !preview_url.contains("star3/origin")
        && !preview_url.starts_with("data:");

    Ok(json!({
        "success": true,
        "download_url": download_url,
        "preview_url": preview_url,
        "preview_mode": preview_mode,
        "preview_candidates": candidates,
        "thumbnail_url": build_thumbnail_url(&oid, fname, ftype),
        "official_preview": official,
        "fallback_cdn_url": fallback_cdn,
        "embeddable": preview_status || !preview_url.is_empty(),
        "data_id": data_id,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "raw": raw_preview,
        "ananas": raw_ananas,
    }))
}

/// 用会话 cookie 拉取图片并转为 data URL，供 WebView `<img>` 直显（绕开 iframe cookie 隔离）
async fn try_fetch_image_data_url(client: &HbutClient, download_url: &str) -> Option<String> {
    use base64::{engine::general_purpose, Engine as _};
    let resp = client
        .client
        .get(download_url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    // 下载接口有时返回 application/octet-stream，仍可能是图
    let bytes = resp.bytes().await.ok()?;
    if bytes.len() < 32 || bytes.len() > 12 * 1024 * 1024 {
        return None;
    }
    let sniff = if ctype.starts_with("image/") {
        ctype
            .split(';')
            .next()
            .unwrap_or("image/jpeg")
            .trim()
            .to_string()
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg".into()
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png".into()
    } else if bytes.starts_with(b"GIF8") {
        "image/gif".into()
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp".into()
    } else {
        return None;
    };
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{sniff};base64,{b64}"))
}

fn sanitize_download_filename(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let s = s.trim().trim_matches('.');
    if s.is_empty() {
        "download.bin".into()
    } else if s.len() > 180 {
        format!("{}…", &s[..160])
    } else {
        s.to_string()
    }
}

fn filename_from_content_disposition(header: &str) -> Option<String> {
    let h = header.trim();
    if h.is_empty() {
        return None;
    }
    // filename*=UTF-8''encoded
    if let Some(idx) = h.to_ascii_lowercase().find("filename*") {
        let rest = &h[idx + "filename*".len()..];
        let rest = rest.trim_start_matches('=').trim();
        let encoded = rest
            .trim_matches('"')
            .split("''")
            .nth(1)
            .unwrap_or(rest)
            .trim_matches('"');
        if let Ok(decoded) = urlencoding::decode(encoded) {
            let name = sanitize_download_filename(&decoded);
            if !name.is_empty() && name != "download.bin" {
                return Some(name);
            }
        }
    }
    // filename="..."
    if let Some(idx) = h.to_ascii_lowercase().find("filename") {
        let rest = &h[idx + "filename".len()..];
        let rest = rest.trim_start_matches('*').trim_start_matches('=').trim();
        let name = rest.trim_matches('"').trim_matches('\'');
        let name = sanitize_download_filename(name);
        if !name.is_empty() && name != "download.bin" {
            return Some(name);
        }
    }
    None
}

const CX_DOWNLOAD_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CX_MAX_BYTES: usize = 200 * 1024 * 1024;
const CX_RETRY: u32 = 3;
const CX_MULTI_PART_MIN: u64 = 4 * 1024 * 1024; // ≥4MB 才多分片
const CX_MULTI_PARTS: u64 = 4;

async fn ensure_sso_for_download(client: &mut HbutClient) {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await;
}

async fn collect_download_urls(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    cpi: &str,
    oid: &str,
) -> Vec<String> {
    let mut try_urls: Vec<String> = Vec::new();
    if !oid.is_empty() {
        let status_url = format!(
            "https://mooc1.chaoxing.com/ananas/status/{}?k=&flag=normal&_={}",
            urlencoding::encode(oid),
            now_ms()
        );
        if let Ok(resp) = client
            .client
            .get(&status_url)
            .header(
                "Referer",
                "https://mooc1.chaoxing.com/ananas/modules/video/index.html",
            )
            .send()
            .await
        {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    for key in ["https", "http", "download", "pdf"] {
                        if let Some(u) = v.get(key).and_then(|x| x.as_str()) {
                            let n = normalize_url(u);
                            if !n.is_empty() && !try_urls.iter().any(|x| x == &n) {
                                try_urls.push(n);
                            }
                        }
                    }
                }
            }
        }
    }
    try_urls.push(format!(
        "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
        urlencoding::encode(data_id.trim()),
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(cpi),
        urlencoding::encode(course_id.trim())
    ));
    try_urls
}

/// HEAD/GET 探测：Content-Length 与是否支持 Range
async fn probe_download_meta(
    client: &HbutClient,
    url: &str,
) -> (Option<u64>, bool, Option<String>, Option<String>) {
    let mut len = None;
    let mut ranges = false;
    let mut cd = None;
    let mut ctype = None;
    // 优先 HEAD
    if let Ok(resp) = client
        .client
        .head(url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .header("User-Agent", CX_DOWNLOAD_UA)
        .send()
        .await
    {
        if resp.status().is_success() {
            len = resp
                .headers()
                .get(reqwest::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok());
            ranges = resp
                .headers()
                .get(reqwest::header::ACCEPT_RANGES)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_ascii_lowercase().contains("bytes"))
                .unwrap_or(false);
            cd = resp
                .headers()
                .get(reqwest::header::CONTENT_DISPOSITION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            ctype = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
        }
    }
    (len, ranges, cd, ctype)
}

/// 多分片并行（需 Accept-Ranges + Content-Length）
async fn download_multipart(client: &HbutClient, url: &str, total: u64) -> Result<Vec<u8>, String> {
    if total == 0 || total > CX_MAX_BYTES as u64 {
        return Err("invalid total".into());
    }
    let n = CX_MULTI_PARTS.min(total).max(1);
    let chunk = (total + n - 1) / n;
    let mut handles = Vec::new();
    for i in 0..n {
        let start = i * chunk;
        if start >= total {
            break;
        }
        let end = (start + chunk - 1).min(total - 1);
        let http = client.client.clone();
        let url = url.to_string();
        handles.push(tokio::spawn(async move {
            // 分片内再重试 2 次
            let mut last = String::new();
            for attempt in 0..3u32 {
                let resp = http
                    .get(&url)
                    .header("Referer", "https://mooc2-ans.chaoxing.com/")
                    .header("User-Agent", CX_DOWNLOAD_UA)
                    .header("Range", format!("bytes={}-{}", start, end))
                    .send()
                    .await;
                match resp {
                    Ok(r) => {
                        let st = r.status().as_u16();
                        if st == 206 || r.status().is_success() {
                            match r.bytes().await {
                                Ok(b) => return Ok::<(u64, Vec<u8>), String>((i, b.to_vec())),
                                Err(e) => last = e.to_string(),
                            }
                        } else {
                            last = format!("HTTP {}", st);
                        }
                    }
                    Err(e) => last = e.to_string(),
                }
                if attempt < 2 {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        300 * (attempt as u64 + 1),
                    ))
                    .await;
                }
            }
            Err(format!("part {} failed: {}", i, last))
        }));
    }
    let mut parts: Vec<(u64, Vec<u8>)> = Vec::new();
    for h in handles {
        match h.await {
            Ok(Ok(part)) => parts.push(part),
            Ok(Err(e)) => return Err(e),
            Err(e) => return Err(e.to_string()),
        }
    }
    parts.sort_by_key(|(i, _)| *i);
    let mut out = Vec::with_capacity(total as usize);
    for (_, b) in parts {
        out.extend_from_slice(&b);
    }
    if out.len() as u64 != total {
        return Err(format!(
            "multipart size mismatch: got {} expect {}",
            out.len(),
            total
        ));
    }
    Ok(out)
}

/// 整文件下载；若 part_path 有未完成字节且服务端支持 Range，则续传并边下边写 .part
async fn download_single_or_resume(
    client: &HbutClient,
    url: &str,
    part_path: Option<&std::path::Path>,
) -> Result<(Vec<u8>, String, String, String), String> {
    use futures::StreamExt;
    use std::io::Write;

    let existing = part_path
        .and_then(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0);

    let mut req = client
        .client
        .get(url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .header("User-Agent", CX_DOWNLOAD_UA);
    if existing > 0 {
        req = req.header("Range", format!("bytes={}-", existing));
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let final_url = resp.url().to_string();
    let code = status.as_u16();
    if code == 403 {
        return Err("403 Forbidden：会话可能失效，请重新进入学习通后再试".into());
    }
    if code == 416 {
        return Err("range_not_satisfiable".into());
    }
    if code != 206 && !status.is_success() {
        return Err(format!("HTTP {} ({})", code, final_url));
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let cd = resp
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // 边下边写 part，便于中断后 Range 续传
    let mut file = if let Some(p) = part_path {
        if existing > 0 && code == 206 {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(p)
                .map_err(|e| e.to_string())?
        } else {
            // 200 整包或新任务：覆盖写
            std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(p)
                .map_err(|e| e.to_string())?
        }
    } else {
        // 无 part：仅内存
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        return Ok((bytes.to_vec(), final_url, cd, ctype));
    };

    let mut stream = resp.bytes_stream();
    let mut written: u64 = if existing > 0 && code == 206 {
        existing
    } else {
        0
    };
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        written = written.saturating_add(chunk.len() as u64);
        if written > CX_MAX_BYTES as u64 {
            return Err(format!(
                "文件过大（{} MB），暂不支持",
                written / 1024 / 1024
            ));
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);

    let bytes = std::fs::read(part_path.unwrap()).map_err(|e| e.to_string())?;
    Ok((bytes, final_url, cd, ctype))
}

fn validate_download_payload(bytes: &[u8], ctype: &str) -> Result<(), String> {
    if bytes.len() < 16 {
        return Err("下载内容过小".into());
    }
    if bytes.len() > CX_MAX_BYTES {
        return Err(format!(
            "文件过大（{} MB），暂不支持",
            bytes.len() / 1024 / 1024
        ));
    }
    let ct = ctype.to_ascii_lowercase();
    if ct.contains("text/html") {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(400)]).to_ascii_lowercase();
        if head.contains("login") || head.contains("passport") || head.contains("403") {
            return Err("下载被重定向到登录页，请重新接入学习通会话".into());
        }
    }
    Ok(())
}

/// 用学习通会话鉴权下载课件（#358/#359）：
/// - 失败最多重试 3 次（含 SSO 续期）
/// - 支持 Range 断点续传（.part）
/// - 大文件且服务端支持 Range 时多分片并行
pub async fn download_resource_bytes(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
    file_name: Option<&str>,
) -> Result<(Vec<u8>, String, String), DynError> {
    download_resource_bytes_with_part(
        client, course_id, clazz_id, data_id, object_id, cpi, file_name, None,
    )
    .await
}

/// `part_path`：可选的本地未完成文件路径，用于断点续传
pub async fn download_resource_bytes_with_part(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
    file_name: Option<&str>,
    part_path: Option<&std::path::Path>,
) -> Result<(Vec<u8>, String, String), DynError> {
    let cpi = cpi.unwrap_or("0").trim().to_string();
    let preferred_name = sanitize_download_filename(file_name.unwrap_or(""));
    let oid = object_id.map(str::trim).unwrap_or("").to_string();
    let mut last_err = String::from("下载失败");

    for attempt in 0..CX_RETRY {
        if attempt > 0 {
            // 重试前强制静默 SSO，处理 403/登录页
            ensure_sso_for_download(client).await;
            let backoff_ms = 400 * (1u64 << (attempt.min(3) - 1));
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
            println!(
                "[chaoxing] 下载重试 attempt={}/{} backoff={}ms",
                attempt + 1,
                CX_RETRY,
                backoff_ms
            );
        } else {
            ensure_sso_for_download(client).await;
        }

        let try_urls =
            collect_download_urls(client, course_id, clazz_id, data_id, &cpi, &oid).await;

        for url in try_urls {
            // 探测元数据：大文件多分片
            let (content_len, accept_ranges, probe_cd, _) = probe_download_meta(client, &url).await;

            let result = if accept_ranges
                && content_len.unwrap_or(0) >= CX_MULTI_PART_MIN
                && part_path
                    .map(|p| !p.exists() || std::fs::metadata(p).map(|m| m.len()).unwrap_or(0) == 0)
                    .unwrap_or(true)
            {
                // 多分片（无本地 part 时）
                match download_multipart(client, &url, content_len.unwrap()).await {
                    Ok(bytes) => Ok((
                        bytes,
                        url.clone(),
                        probe_cd.clone().unwrap_or_default(),
                        String::new(),
                    )),
                    Err(e) => {
                        println!("[chaoxing] multipart 失败，降级单连接: {}", e);
                        download_single_or_resume(client, &url, part_path).await
                    }
                }
            } else {
                download_single_or_resume(client, &url, part_path).await
            };

            match result {
                Ok((bytes, final_url, cd, ctype)) => {
                    if let Err(e) = validate_download_payload(&bytes, &ctype) {
                        last_err = e;
                        // 416/脏 part：清 part 再试
                        if last_err == "range_not_satisfiable" {
                            if let Some(p) = part_path {
                                let _ = std::fs::remove_file(p);
                            }
                        }
                        continue;
                    }
                    let mut name = filename_from_content_disposition(&cd).unwrap_or_default();
                    if name.is_empty() || name == "download.bin" {
                        name = if preferred_name != "download.bin" {
                            preferred_name.clone()
                        } else {
                            format!("chaoxing_{}.bin", data_id.trim())
                        };
                    }
                    name = sanitize_download_filename(&name);
                    println!(
                        "[chaoxing] 鉴权下载成功 bytes={} name={} url={} attempt={}",
                        bytes.len(),
                        name,
                        final_url,
                        attempt + 1
                    );
                    return Ok((bytes, name, final_url));
                }
                Err(e) => {
                    last_err = e;
                    if last_err == "range_not_satisfiable" {
                        if let Some(p) = part_path {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                    continue;
                }
            }
        }
    }

    Err(err_box(format!("{}（已重试 {} 次）", last_err, CX_RETRY)))
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
    fn default_invite_catalog_has_18853572() {
        assert!(fixed_meta("18853572").is_some());
        assert!(fixed_meta("73202625").is_none());
        let p = preview_from_fixed("18853572").unwrap();
        assert_eq!(p.invite_code, "18853572");
        // 不再内置课程 ID/名称，必须在线解析
        assert!(p.course_id.is_empty());
        assert!(p.clazz_id.is_empty());
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
    fn detect_not_joined_and_membership() {
        assert!(looks_like_not_joined_html("你还没有加入该课程，请先加入"));
        assert!(!looks_like_not_joined_html(
            r#"<ul class="dataBody_td" id="1"></ul>"#
        ));
        assert_eq!(
            infer_list_membership_from_html("请先加入班级后再查看资料", 0),
            "not_joined"
        );
        assert_eq!(
            infer_list_membership_from_html(r#"<ul class="dataBody_td" id="x"></ul>班级资料"#, 0),
            "ok"
        );
        assert_eq!(
            infer_list_membership_from_html(r#"<ul class="dataBody_td"></ul>"#, 3),
            "ok"
        );
        // 退课后：课程列表明确不在班 → 即使 HTML 像空资料页也是 not_joined
        assert_eq!(resolve_membership("ok", Some(false)), "not_joined");
        assert_eq!(resolve_membership("unknown", Some(false)), "not_joined");
        assert_eq!(resolve_membership("ok", Some(true)), "ok");
        assert_eq!(resolve_membership("unknown", None), "unknown");
    }

    #[test]
    fn parse_backclazz_pairs_matches_course() {
        let payload = json!({
            "result": 1,
            "channelList": [{
                "content": {
                    "id": 148246853,
                    "teacherfactor": "周金阳",
                    "course": {
                        "data": [{ "id": 264356359, "name": "库来西库" }]
                    }
                }
            }]
        });
        let pairs = parse_backclazz_pairs(&payload);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, "264356359");
        assert_eq!(pairs[0].1, "148246853");
    }

    #[test]
    fn classify_tch_courseware_folder() {
        let (is_f, kind) = classify_folder(
            "tch-courseware",
            "",
            "教师课件",
            r#"onclick="toCourseware()" coursewareFolder.png"#,
        );
        assert!(is_f);
        assert_eq!(kind, "tch-courseware");
    }

    #[test]
    fn classify_afolder() {
        let (is_f, kind) = classify_folder("afolder", "", "作业", "");
        assert!(is_f);
        assert_eq!(kind, "afolder");
    }

    #[test]
    fn parse_datalist_detects_folder_and_files() {
        let html = r#"
        <input id="cpi" value="509967218" />
        <ul class="dataBody_td" type="tch-courseware">
          <li class="dataBody_file" onclick="toCourseware()"><img src="/coursewareFolder.png"></li>
          <li class="dataBody_name_stu"><dl><dt>教师课件</dt></dl></li>
        </ul>
        <ul class="dataBody_td" id="132" objectid="abc" dataname="a.mp4" type="mp4" isdown="1">
          <li>a.mp4</li><li>10MB</li>
        </ul>
        "#;
        let list = parse_stu_datalist_html(html, "1", "2", "509967218");
        assert!(list
            .iter()
            .any(|r| r.is_folder && r.folder_kind == "tch-courseware"));
        assert!(list
            .iter()
            .any(|r| r.file_type == "mp4" && r.is_downloadable));
        assert_eq!(extract_cpi_from_html(html), "509967218");
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
    fn image_thumbnail_url_for_jpg() {
        let u = build_thumbnail_url("abc123", "photo.JPG", "jpg");
        assert!(u.contains("150_150c/abc123"));
        assert!(looks_like_image("a.png", ""));
        assert!(!looks_like_image("a.mp4", "mp4"));
        assert!(is_direct_media_url(
            "https://p.ananas.chaoxing.com/star3/origin/x"
        ));
        assert!(!is_direct_media_url(
            "https://pan-yz.chaoxing.com/preview/v2/objectshowpreview.html?x=1"
        ));
    }

    #[test]
    fn parse_datalist_sets_thumbnail_for_image() {
        let html = r#"
        <ul class="dataBody_td" id="9" objectid="oidimg" dataname="shot.jpg" type="jpg" isdown="1">
          <li>shot.jpg</li><li>1MB</li>
        </ul>
        "#;
        let list = parse_stu_datalist_html(html, "1", "2", "3");
        let img = list.iter().find(|r| r.name.contains("shot")).unwrap();
        assert!(img.thumbnail_url.contains("150_150c/oidimg"));
    }

    #[test]
    fn short_net_err_strips_long_url() {
        let raw = "error sending request for url (https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid=1&dataName=%E8%B5%84%E6%96)";
        let s = short_net_err(raw);
        assert!(!s.contains("mooc2-ans"));
        assert!(s.contains("重试") || s.contains("连接"));
    }
}
