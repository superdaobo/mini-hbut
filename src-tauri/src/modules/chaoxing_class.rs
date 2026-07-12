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

/// 产品固定班级（邀请码 → 已知课程/班级元数据）
/// 当在线中间页解析失败（登录页/已入班跳转）时作兜底。
struct FixedInviteMeta {
    code: &'static str,
    course_id: &'static str,
    clazz_id: &'static str,
    course_name: &'static str,
    teacher_name: &'static str,
}

const FIXED_INVITES: &[FixedInviteMeta] = &[FixedInviteMeta {
    code: "73202625",
    course_id: "264356359",
    clazz_id: "148246853",
    course_name: "库来西库",
    teacher_name: "周金阳",
}];

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

fn looks_like_login_url(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.contains("passport2.chaoxing.com")
        || u.contains("authserver/login")
        || (u.contains("/login") && u.contains("refer="))
}

/// 确保门户 SSO → 学习通会话可用（走统一会话层，可静默续期，禁止 force 全量课程）。
pub async fn ensure_sso_session(
    client: &mut HbutClient,
    student_id: Option<&str>,
) -> Result<Value, DynError> {
    use crate::modules::chaoxing_sso::{ensure_chaoxing_sso, EnsureSsoOptions};

    match ensure_chaoxing_sso(
        client,
        student_id,
        EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
        },
    )
    .await
    {
        Ok(v) => Ok(v),
        Err(e) => {
            // 固定班探测兜底：部分场景课程 API 抖动但资料页仍可用
            if let Some(meta) = fixed_meta("73202625") {
                if probe_class_accessible(client, meta.course_id, meta.clazz_id).await {
                    return Ok(json!({
                        "success": true,
                        "sso": true,
                        "partial": true,
                        "hint": "学习通会话部分可用（固定班级资料页探测成功）",
                        "diag": crate::modules::chaoxing_sso::get_sso_diag(),
                    }));
                }
            }
            Err(e)
        }
    }
}

/// 探测是否已能访问班级资料（表示已入班且 cookie 有效）
async fn probe_class_accessible(client: &HbutClient, course_id: &str, clazz_id: &str) -> bool {
    let t = now_ms();
    let list_url = format!(
        "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&clazzid={}&cpi=0&ut=s&t={}",
        urlencoding::encode(course_id),
        urlencoding::encode(clazz_id),
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
    // 资料页特征：dataBody / 下载 / 教师课件 等
    html.contains("dataBody")
        || html.contains("downloadData")
        || html.contains("coursedata")
        || html.contains("objectid")
        || html.contains("资料")
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

fn preview_from_fixed(code: &str) -> Option<InvitePreview> {
    let meta = fixed_meta(code)?;
    Some(InvitePreview {
        invite_code: meta.code.to_string(),
        course_id: meta.course_id.to_string(),
        clazz_id: meta.clazz_id.to_string(),
        course_name: meta.course_name.to_string(),
        teacher_name: meta.teacher_name.to_string(),
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
pub async fn preview_invite(
    client: &mut HbutClient,
    invite_code: &str,
) -> Result<InvitePreview, DynError> {
    let code = invite_code.trim();
    if code.is_empty() {
        return Err(err_box("请输入邀请码"));
    }

    // 统一会话层：缓存命中则跳过重复 FYSSO
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
        },
    )
    .await;

    // 1) 在线解析 getInviteCode
    let online = fetch_invite_preview_online(client, code).await;
    match online {
        Ok(p) if !p.course_id.is_empty() && !p.clazz_id.is_empty() => return Ok(p),
        Ok(_) => { /* 字段不全，继续兜底 */ }
        Err(e) => {
            let msg = e.to_string();
            // 登录态问题：固定班级仍可返回预览（供 UI 展示），enc 可能为空
            if msg.contains("登录") || msg.contains("会话") {
                if let Some(fixed) = preview_from_fixed(code) {
                    // 若已入班可访问资料，直接当预览成功
                    if probe_class_accessible(client, &fixed.course_id, &fixed.clazz_id).await {
                        return Ok(fixed);
                    }
                    // 返回固定预览，前端可询问加入；真正加入时再要求会话
                    return Ok(fixed);
                }
                return Err(e);
            }
            // 其它错误：固定班级兜底
            if let Some(fixed) = preview_from_fixed(code) {
                println!("[学习通] 邀请码在线解析失败，使用固定班级兜底: {}", msg);
                return Ok(fixed);
            }
            return Err(e);
        }
    }

    // 2) 固定班级兜底
    if let Some(fixed) = preview_from_fixed(code) {
        return Ok(fixed);
    }
    Err(err_box(
        "入班页未解析到课程/班级信息，可能邀请码类型不支持或学习通会话未就绪，请重新登录门户后重试",
    ))
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

    if looks_like_login_html(&body) {
        return Err(err_box(
            "学习通会话未就绪（邀请码接口返回登录页）。请重新登录融合门户后再试",
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

    // 已入班场景：中间页可能跳到课程页，hidden 缺失；用固定元数据补全
    if (course_id.is_empty() || clazz_id.is_empty()) && fixed_meta(code).is_some() {
        if let Some(fixed) = preview_from_fixed(code) {
            return Ok(InvitePreview {
                addclz_enc,
                addclz_timestamp,
                cover_url: {
                    let re = Regex::new(r#"(?i)<img[^>]+src=["']([^"']+)["']"#).ok();
                    re.and_then(|r| {
                        r.captures(&html)
                            .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
                    })
                    .unwrap_or_default()
                },
                middle_url: middle,
                ..fixed
            });
        }
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
    if course_name.is_empty() {
        if let Some(m) = fixed_meta(code) {
            course_name = m.course_name.to_string();
        }
    }
    let mut teacher_name = extract_text_class(&html, "name");
    if teacher_name.is_empty() {
        if let Some(m) = fixed_meta(code) {
            teacher_name = m.teacher_name.to_string();
        }
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
pub async fn accept_invite(client: &mut HbutClient, invite_code: &str) -> Result<Value, DynError> {
    let code = invite_code.trim();
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
        },
    )
    .await;

    let preview = preview_invite(client, code).await?;

    // 已可访问资料 → 视为已入班（无需 enc）
    if probe_class_accessible(client, &preview.course_id, &preview.clazz_id).await {
        return Ok(json!({
            "success": true,
            "already_joined": true,
            "message": "已在该班级",
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
    pub download_url: String,
    pub preview_cdn_url: String,
}

/// 拉取班级资料列表（解析 stu-datalist HTML）
pub async fn list_resources(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: Option<&str>,
) -> Result<Value, DynError> {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
        },
    )
    .await;
    let cpi = cpi.unwrap_or("0").trim();
    let t = now_ms();
    let list_url = format!(
        "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&clazzid={}&cpi={}&ut=s&t={}",
        urlencoding::encode(course_id.trim()),
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(cpi),
        t
    );
    let resp = client
        .client
        .get(&list_url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .send()
        .await
        .map_err(|e| err_box(format!("资料列表网络失败: {}", e)))?;

    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return Err(err_box(
            "资料页跳转登录。请重新登录融合门户以刷新学习通会话（非断网）",
        ));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| err_box(format!("资料列表读取失败: {}", e)))?;

    if looks_like_login_html(&html) {
        return Err(err_box("资料页为登录页。请重新登录融合门户后再试"));
    }

    let doc = Html::parse_document(&html);
    let row_sel = Selector::parse("ul.dataBody_td, .dataBody_td, li.dataBody_td")
        .map_err(|e| err_box(e.to_string()))?;
    let mut resources: Vec<ClassResource> = Vec::new();
    for row in doc.select(&row_sel) {
        let id = row.value().attr("id").unwrap_or("").trim().to_string();
        let object_id = row
            .value()
            .attr("objectid")
            .unwrap_or("")
            .trim()
            .to_string();
        let name = row
            .value()
            .attr("dataname")
            .unwrap_or("")
            .trim()
            .to_string();
        let file_type = row.value().attr("type").unwrap_or("").trim().to_string();
        if id.is_empty() && name.is_empty() {
            continue;
        }
        let is_folder = file_type.is_empty()
            && object_id.is_empty()
            && (name.contains("课件") || row.inner_html().contains("coursewareFolder"));
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
        let download_url = if id.is_empty() || is_folder {
            String::new()
        } else {
            format!(
                "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
                urlencoding::encode(&id),
                urlencoding::encode(clazz_id.trim()),
                urlencoding::encode(cpi),
                urlencoding::encode(course_id.trim())
            )
        };
        let preview_cdn_url = if object_id.is_empty() {
            String::new()
        } else {
            format!("https://p.ananas.chaoxing.com/star3/origin/{object_id}")
        };
        resources.push(ClassResource {
            data_id: id,
            name: if name.is_empty() {
                texts.first().cloned().unwrap_or_else(|| "未命名".into())
            } else {
                name
            },
            file_type,
            object_id,
            size_label,
            creator: texts
                .iter()
                .find(|s| {
                    !s.contains("MB")
                        && !s.contains("KB")
                        && !s.contains('-')
                        && s.chars().count() < 20
                })
                .cloned()
                .unwrap_or_default(),
            created_at: texts
                .iter()
                .find(|s| s.contains('-') && s.contains(':'))
                .cloned()
                .unwrap_or_default(),
            is_folder,
            download_url,
            preview_cdn_url,
        });
    }

    if resources.is_empty() {
        let re = Regex::new(
            r#"(?is)id=["'](\d+)["'][^>]*objectid=["']([a-f0-9]+)["'][^>]*dataname=["']([^"']+)["']|objectid=["']([a-f0-9]+)["'][^>]*id=["'](\d+)["'][^>]*dataname=["']([^"']+)["']"#,
        )
        .map_err(|e| err_box(e.to_string()))?;
        for c in re.captures_iter(&html) {
            let (data_id, object_id, name) = if c.get(1).is_some() {
                (
                    c.get(1).unwrap().as_str().to_string(),
                    c.get(2).unwrap().as_str().to_string(),
                    c.get(3).unwrap().as_str().to_string(),
                )
            } else {
                (
                    c.get(5).unwrap().as_str().to_string(),
                    c.get(4).unwrap().as_str().to_string(),
                    c.get(6).unwrap().as_str().to_string(),
                )
            };
            resources.push(ClassResource {
                download_url: format!(
                    "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
                    urlencoding::encode(&data_id),
                    urlencoding::encode(clazz_id.trim()),
                    urlencoding::encode(cpi),
                    urlencoding::encode(course_id.trim())
                ),
                preview_cdn_url: format!("https://p.ananas.chaoxing.com/star3/origin/{object_id}"),
                data_id,
                object_id,
                name,
                file_type: String::new(),
                size_label: String::new(),
                creator: String::new(),
                created_at: String::new(),
                is_folder: false,
            });
        }
    }

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "count": resources.len(),
        "resources": resources,
        "list_url": list_url,
    }))
}

/// 解析预览：优先 CDN origin；下载返回官方 downloadData URL
pub async fn resolve_resource_access(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
) -> Result<Value, DynError> {
    let cpi = cpi.unwrap_or("0");
    let download_url = format!(
        "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
        urlencoding::encode(data_id.trim()),
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(cpi.trim()),
        urlencoding::encode(course_id.trim())
    );
    let mut preview_url = object_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|oid| format!("https://p.ananas.chaoxing.com/star3/origin/{oid}"))
        .unwrap_or_default();

    if preview_url.is_empty() {
        let probe = format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/get-preview-url?dataId={}&courseId={}&classId={}&cpi={}&ut=s",
            urlencoding::encode(data_id.trim()),
            urlencoding::encode(course_id.trim()),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(cpi.trim())
        );
        if let Ok(resp) = client.client.get(&probe).send().await {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if let Some(u) = v
                        .get("url")
                        .or_else(|| v.get("previewUrl"))
                        .or_else(|| v.pointer("/data/url"))
                        .and_then(|x| x.as_str())
                    {
                        preview_url = normalize_url(u);
                    }
                } else if text.starts_with("http") {
                    preview_url = normalize_url(text.trim());
                }
            }
        }
    }

    let _ = Url::parse(&download_url);
    Ok(json!({
        "success": true,
        "download_url": download_url,
        "preview_url": preview_url,
        "data_id": data_id,
        "course_id": course_id,
        "clazz_id": clazz_id,
    }))
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
    fn fixed_invite_catalog_has_73202625() {
        let p = preview_from_fixed("73202625").unwrap();
        assert_eq!(p.course_id, "264356359");
        assert_eq!(p.clazz_id, "148246853");
        assert_eq!(p.course_name, "库来西库");
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
}
