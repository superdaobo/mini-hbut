//! 学习通邀请码入班：preview（解析课程/班级预览）+ accept（提交入班）。

use regex::Regex;
use reqwest::cookie::CookieStore;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http_client::HbutClient;

use super::parse::{
    clip_for_log, err_box, extract_from_url, extract_hidden, extract_js_or_attr,
    extract_text_class, looks_like_html_document, looks_like_login_html, looks_like_login_url,
    normalize_url, now_ms, DynError,
};
use super::session::probe_class_accessible;

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

fn is_invite_session_error_message(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    m.contains("非 json")
        || m.contains("未登录")
        || m.contains("会话未就绪")
        || m.contains("登录页")
        || m.contains("<!doctype")
        || m.contains("<html")
        || m.contains("mooc1")
        || m.contains("getinvitecode")
        || m.contains("[邀请码")
}

/// 会话诊断（不输出 cookie 明文，只输出是否有关键字段）
fn invite_session_diag(client: &HbutClient) -> String {
    let i = chaoxing_i_cookie_header(client);
    let mooc = chaoxing_mooc_cookie_header(client);
    let blob = format!("{};{}", i, mooc);
    let has_uid = blob.contains("UID=") || blob.contains("_uid=");
    let has_token = blob.contains("cx_p_token=")
        || blob.contains("p_auth_token=")
        || blob.contains("xxtenc=")
        || blob.contains("uf=");
    let has_jw = blob.contains("jw_uf=");
    format!(
        "has_uid={} has_token={} has_jw={} i_cookie_len={} mooc_cookie_len={} is_logged_in={}",
        has_uid,
        has_token,
        has_jw,
        i.len(),
        mooc.len(),
        client.is_logged_in
    )
}

/// 统一邀请码错误：路径 + 原因 + 诊断 + 用户指引（#376 详细日志）
fn invite_err(path: &str, reason: &str, client: &HbutClient, extra: Option<&str>) -> DynError {
    let diag = invite_session_diag(client);
    let extra = extra.unwrap_or("").trim();
    let msg = if extra.is_empty() {
        format!(
            "[{path}] {reason} | 诊断: {diag} | 说明: 融合门户/教务已登录 ≠ 学习通 i 站 Web 会话；App 会优先走 mooc1 入班中间页。请重登融合门户或核对邀请码。不是断网。"
        )
    } else {
        format!(
            "[{path}] {reason} | {extra} | 诊断: {diag} | 说明: 融合门户/教务已登录 ≠ 学习通 i 站 Web 会话；App 会优先走 mooc1 入班中间页。请重登融合门户或核对邀请码。不是断网。"
        )
    };
    println!("[chaoxing][invite-error] {}", msg);
    err_box(msg)
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

/// 合并 passport2 + i.chaoxing.com 的 Cookie，显式带到邀请码请求
fn chaoxing_i_cookie_header(client: &HbutClient) -> String {
    let passport = client
        .cookie_jar
        .cookies(
            &Url::parse("https://passport2.chaoxing.com")
                .unwrap_or_else(|_| Url::parse("https://i.chaoxing.com").unwrap()),
        )
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    let i = client
        .cookie_jar
        .cookies(&Url::parse("https://i.chaoxing.com").unwrap())
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    [passport, i]
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

fn chaoxing_mooc_cookie_header(client: &HbutClient) -> String {
    let passport = client
        .cookie_jar
        .cookies(&Url::parse("https://passport2.chaoxing.com").unwrap())
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    let mooc = client
        .cookie_jar
        .cookies(&Url::parse("https://mooc1.chaoxing.com").unwrap())
        .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    [passport, mooc]
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

/// Path A：i.chaoxing.com getInviteCode（需要 i 站 Web 会话，FYSSO 后常失败）
async fn fetch_invite_via_icode_api(
    client: &mut HbutClient,
    code: &str,
) -> Result<InvitePreview, DynError> {
    let cookie = chaoxing_i_cookie_header(client);
    let mut req = client
        .client
        .post("https://i.chaoxing.com/base/getInviteCode")
        .header("Referer", "https://i.chaoxing.com/")
        .header("Origin", "https://i.chaoxing.com")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );
    if !cookie.is_empty() {
        req = req.header("Cookie", &cookie);
    }
    let resp = req
        .body(format!(
            "invitecode={}&_t={}",
            urlencoding::encode(code),
            now_ms()
        ))
        .send()
        .await
        .map_err(|e| {
            invite_err(
                "邀请码/i站getInviteCode",
                "网络请求失败",
                client,
                Some(&format!("err={}", e)),
            )
        })?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return Err(invite_err(
            "邀请码/i站getInviteCode",
            "接口最终跳转到学习通登录页（i 站无有效会话）",
            client,
            Some(&format!(
                "http_status={} final_url={}",
                status,
                clip_for_log(&final_url, 100)
            )),
        ));
    }

    let body = resp.text().await.map_err(|e| {
        invite_err(
            "邀请码/i站getInviteCode",
            "读取响应正文失败",
            client,
            Some(&format!("err={}", e)),
        )
    })?;

    if looks_like_login_html(&body) || looks_like_html_document(&body) {
        return Err(invite_err(
            "邀请码/i站getInviteCode",
            "接口返回 HTML 而非 JSON（常见：门户 FYSSO 后 i.chaoxing.com 无 Web 会话）",
            client,
            Some(&format!(
                "http_status={} final_url={} body_len={} body_snip={}",
                status,
                clip_for_log(&final_url, 80),
                body.len(),
                clip_for_log(&body, 100)
            )),
        ));
    }

    let payload: Value = serde_json::from_str(body.trim()).map_err(|e| {
        invite_err(
            "邀请码/i站getInviteCode",
            "响应无法解析为 JSON",
            client,
            Some(&format!(
                "parse_err={} http_status={} body_len={} body_snip={}",
                e,
                status,
                body.len(),
                clip_for_log(&body, 100)
            )),
        )
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
        return Err(invite_err(
            "邀请码/i站getInviteCode",
            "业务 status=false",
            client,
            Some(&format!(
                "msg={} payload_keys={:?}",
                msg,
                payload
                    .as_object()
                    .map(|o| o.keys().cloned().collect::<Vec<_>>())
            )),
        ));
    }

    let middle = payload
        .get("url")
        .and_then(|v| v.as_str())
        .map(normalize_url)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            invite_err(
                "邀请码/i站getInviteCode",
                "JSON 成功但缺少中间页 url 字段",
                client,
                Some(&format!(
                    "payload={}",
                    clip_for_log(&payload.to_string(), 160)
                )),
            )
        })?;

    fetch_and_parse_middle_page(client, code, &middle, "https://i.chaoxing.com/").await
}

/// Path B：直接 mooc1 中间页（门户 FYSSO 后 UID 可用，不依赖 i.chaoxing.com）
async fn fetch_invite_via_mooc_middleview(
    client: &mut HbutClient,
    code: &str,
) -> Result<InvitePreview, DynError> {
    let middle = format!(
        "https://mooc1.chaoxing.com/addcourse/pcqrcodemiddleview?inviteCode={}&checkEnc=1",
        urlencoding::encode(code)
    );
    println!("[chaoxing] 邀请码 mooc1 中间页路径: {}", middle);
    fetch_and_parse_middle_page(client, code, &middle, "https://mooc1.chaoxing.com/").await
}

async fn fetch_and_parse_middle_page(
    client: &mut HbutClient,
    code: &str,
    middle: &str,
    referer: &str,
) -> Result<InvitePreview, DynError> {
    let cookie = if middle.contains("mooc1.chaoxing.com") {
        chaoxing_mooc_cookie_header(client)
    } else {
        chaoxing_i_cookie_header(client)
    };
    let mut req = client
        .client
        .get(middle)
        .header("Referer", referer)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );
    if !cookie.is_empty() {
        req = req.header("Cookie", cookie);
    }
    let path_tag = if middle.contains("mooc1.chaoxing.com") {
        "邀请码/mooc1中间页"
    } else {
        "邀请码/入班中间页"
    };
    let page = req.send().await.map_err(|e| {
        invite_err(
            path_tag,
            "打开入班中间页网络失败",
            client,
            Some(&format!("url={} err={}", clip_for_log(middle, 100), e)),
        )
    })?;

    let http_status = page.status();
    let page_url = page.url().to_string();
    if looks_like_login_url(&page_url) {
        return Err(invite_err(
            path_tag,
            "入班中间页跳转到学习通登录（门户 SSO 未完成到学习通域）",
            client,
            Some(&format!(
                "http_status={} final_url={} request_url={}",
                http_status,
                clip_for_log(&page_url, 100),
                clip_for_log(middle, 100)
            )),
        ));
    }

    let html = page.text().await.map_err(|e| {
        invite_err(
            path_tag,
            "读取入班中间页正文失败",
            client,
            Some(&format!("err={}", e)),
        )
    })?;

    if looks_like_login_html(&html) {
        return Err(invite_err(
            path_tag,
            "入班中间页 HTML 为登录页",
            client,
            Some(&format!(
                "http_status={} final_url={} body_len={} body_snip={}",
                http_status,
                clip_for_log(&page_url, 80),
                html.len(),
                clip_for_log(&html, 100)
            )),
        ));
    }

    parse_invite_middle_html(code, middle, &page_url, &html).map_err(|e| {
        // 保留 parse 错误并叠加诊断
        let base = e.to_string();
        invite_err(
            path_tag,
            "入班中间页解析失败（未拿到 courseId/clazzId）",
            client,
            Some(&format!(
                "parse={} http_status={} final_url={} body_len={}",
                base,
                http_status,
                clip_for_log(&page_url, 80),
                html.len()
            )),
        )
    })
}

fn parse_invite_middle_html(
    code: &str,
    middle: &str,
    page_url: &str,
    html: &str,
) -> Result<InvitePreview, DynError> {
    // 多策略解析 course / clazz
    let mut course_id = extract_hidden(html, "courseId");
    if course_id.is_empty() {
        course_id = extract_js_or_attr(html, "courseId");
    }
    if course_id.is_empty() {
        course_id = extract_js_or_attr(html, "courseid");
    }
    if course_id.is_empty() {
        course_id = extract_from_url(page_url, "courseId");
    }
    if course_id.is_empty() {
        course_id = extract_from_url(page_url, "courseid");
    }

    let mut clazz_id = extract_hidden(html, "clazzId");
    if clazz_id.is_empty() {
        clazz_id = extract_hidden(html, "classId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_js_or_attr(html, "clazzId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_js_or_attr(html, "classId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_from_url(page_url, "clazzId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_from_url(page_url, "classId");
    }
    if clazz_id.is_empty() {
        clazz_id = extract_from_url(page_url, "clazzid");
    }

    let mut addclz_enc = extract_hidden(html, "addclzenc");
    if addclz_enc.is_empty() {
        addclz_enc = extract_js_or_attr(html, "addclzenc");
    }
    if addclz_enc.is_empty() {
        addclz_enc = extract_from_url(middle, "enc");
    }
    if addclz_enc.is_empty() {
        addclz_enc = extract_from_url(page_url, "enc");
    }

    let mut addclz_timestamp = extract_hidden(html, "addclztimeStamp");
    if addclz_timestamp.is_empty() {
        addclz_timestamp = extract_js_or_attr(html, "addclztimeStamp");
    }
    if addclz_timestamp.is_empty() {
        addclz_timestamp = extract_js_or_attr(html, "timeStamp");
    }

    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box(format!(
            "入班页未解析到课程/班级信息（page={} html_len={}）。可能已入班跳转或会话无效",
            page_url.chars().take(80).collect::<String>(),
            html.len()
        )));
    }

    let mut course_name = extract_text_class(html, "course-name");
    if course_name.is_empty() {
        course_name = extract_text_class(html, "colorDeep");
    }
    let mut teacher_name = extract_text_class(html, "name");
    if teacher_name.is_empty() {
        teacher_name = extract_text_class(html, "teacher");
    }
    let cover = {
        let re = Regex::new(r#"(?i)<img[^>]+src=["']([^"']+)["']"#).ok();
        re.and_then(|r| {
            r.captures(html)
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
        middle_url: middle.to_string(),
    })
}

async fn fetch_invite_preview_online(
    client: &mut HbutClient,
    code: &str,
) -> Result<InvitePreview, DynError> {
    // #376：优先 mooc1 中间页（门户 FYSSO 后可用）；i 站 getInviteCode 作补充
    // FYSSO 故意不碰 i.chaoxing.com/base，故 getInviteCode 常回 HTML
    let mooc_err = match fetch_invite_via_mooc_middleview(client, code).await {
        Ok(p) if !p.course_id.is_empty() && !p.clazz_id.is_empty() => {
            println!("[chaoxing] 邀请码 mooc1 中间页成功 course={}", p.course_id);
            return Ok(p);
        }
        Ok(p) => format!(
            "mooc1 返回不完整 course={} clazz={}",
            p.course_id, p.clazz_id
        ),
        Err(e) => e.to_string(),
    };
    println!(
        "[chaoxing] mooc1 中间页失败，尝试 i.chaoxing.com getInviteCode | {}",
        clip_for_log(&mooc_err, 200)
    );
    match fetch_invite_via_icode_api(client, code).await {
        Ok(p) => Ok(p),
        Err(e_api) => {
            let api_err = e_api.to_string();
            // 双路径失败：合并两条路径的详细错误，便于用户反馈 / 调试面板
            Err(invite_err(
                "邀请码/双路径失败",
                "mooc1 中间页与 i 站 getInviteCode 均未成功",
                client,
                Some(&format!(
                    "invite_code_len={} mooc_path_err={} | icode_path_err={}",
                    code.len(),
                    clip_for_log(&mooc_err, 220),
                    clip_for_log(&api_err, 220)
                )),
            ))
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
