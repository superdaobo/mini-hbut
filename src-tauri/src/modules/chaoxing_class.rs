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
use crate::modules::online_learning;

type DynError = Box<dyn Error + Send + Sync>;

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
        // 统一 https，避免混合内容/重定向丢 cookie
        return format!("https://{}", t.trim_start_matches("http://"));
    }
    t.to_string()
}

/// 确保门户 SSO → 学习通会话可用；失败返回可读错误。
pub async fn ensure_sso_session(client: &mut HbutClient, student_id: Option<&str>) -> Result<Value, DynError> {
    let ready = online_learning::chaoxing_get_session_status(client, student_id)
        .await
        .unwrap_or_else(|_| json!({ "connected": false }));

    // 再强制走一次 ensure（内部会 try_bridge_cas_to_chaoxing）
    let sid = student_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("")
        .to_string();
    let courses = online_learning::chaoxing_fetch_courses(client, if sid.is_empty() { None } else { Some(&sid) }, false)
        .await;
    match courses {
        Ok(v) => Ok(json!({
            "success": true,
            "sso": true,
            "session": ready,
            "hint": "门户 CAS→学习通桥接",
            "course_probe": v.get("success").cloned().unwrap_or(json!(true))
        })),
        Err(e) => {
            if !client.is_logged_in {
                return Err(err_box("请先登录新融合门户，本模块通过门户会话 SSO 进入学习通，无需学习通密码"));
            }
            Err(err_box(format!(
                "学习通会话未就绪（门户 SSO 桥接失败）：{}。请重新登录门户后重试",
                e
            )))
        }
    }
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
    // id="courseId" value="..."
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

/// 解析邀请码 → 课程/班级预览（不入班）
pub async fn preview_invite(client: &mut HbutClient, invite_code: &str) -> Result<InvitePreview, DynError> {
    let code = invite_code.trim();
    if code.is_empty() {
        return Err(err_box("请输入邀请码"));
    }
    if !client.is_logged_in {
        return Err(err_box("请先登录新融合门户（学习通通过门户 SSO 接入）"));
    }
    // 确保 cookie 已桥接
    let _ = client.try_bridge_cas_to_chaoxing().await;

    let resolve_url = format!(
        "https://i.chaoxing.com/base/getInviteCode?invitecode={}&_t={}",
        urlencoding::encode(code),
        now_ms()
    );
    let resp = client
        .client
        .post("https://i.chaoxing.com/base/getInviteCode")
        .header("Referer", "https://i.chaoxing.com/")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(format!("invitecode={}&_t={}", urlencoding::encode(code), now_ms()))
        .send()
        .await
        .map_err(|e| err_box(format!("解析邀请码失败: {}", e)))?;
    let body = resp
        .text()
        .await
        .map_err(|e| err_box(format!("解析邀请码响应失败: {}", e)))?;
    let payload: Value = serde_json::from_str(&body)
        .map_err(|e| err_box(format!("邀请码响应非 JSON: {} / {}", e, body.chars().take(200).collect::<String>())))?;
    if !payload.get("status").and_then(|v| v.as_bool()).unwrap_or(false) {
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
        .send()
        .await
        .map_err(|e| err_box(format!("打开入班页失败: {}", e)))?;
    let html = page
        .text()
        .await
        .map_err(|e| err_box(format!("读取入班页失败: {}", e)))?;

    let course_id = extract_hidden(&html, "courseId");
    let clazz_id = extract_hidden(&html, "clazzId");
    let addclz_enc = extract_hidden(&html, "addclzenc");
    let addclz_timestamp = extract_hidden(&html, "addclztimeStamp");
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("入班页未解析到课程/班级信息，可能邀请码类型不支持（仅支持课程班级码）"));
    }
    let course_name = extract_text_class(&html, "course-name");
    let teacher_name = extract_text_class(&html, "name");
    let cover = {
        let re = Regex::new(r#"(?i)<img[^>]+src=["']([^"']+)["']"#).ok();
        re.and_then(|r| {
            r.captures(&html)
                .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        })
        .unwrap_or_default()
    };

    // 丢弃未用的 resolve_url 警告
    let _ = resolve_url;

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
    let preview = preview_invite(client, invite_code).await?;
    if preview.addclz_enc.is_empty() || preview.addclz_timestamp.is_empty() {
        return Err(err_box("入班凭证不完整（enc/timeStamp 缺失）"));
    }
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
    let payload: Value = serde_json::from_str(&body).unwrap_or_else(|_| {
        json!({ "result": 0, "errorMsg": body.chars().take(200).collect::<String>() })
    });
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
        // 已在班也算可继续
        if msg.contains("已") && (msg.contains("加入") || msg.contains("在")) {
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
    if !client.is_logged_in {
        return Err(err_box("请先登录新融合门户"));
    }
    let _ = client.try_bridge_cas_to_chaoxing().await;
    let cpi = cpi.unwrap_or("0").trim();
    let t = now_ms();
    // stuenc 可选；部分环境无 enc 也可打开列表
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
        .map_err(|e| err_box(format!("资料列表请求失败: {}", e)))?;
    let html = resp
        .text()
        .await
        .map_err(|e| err_box(format!("资料列表读取失败: {}", e)))?;

    let doc = Html::parse_document(&html);
    let row_sel = Selector::parse("ul.dataBody_td, .dataBody_td").map_err(|e| err_box(e.to_string()))?;
    let mut resources: Vec<ClassResource> = Vec::new();
    for row in doc.select(&row_sel) {
        let id = row.value().attr("id").unwrap_or("").trim().to_string();
        let object_id = row.value().attr("objectid").unwrap_or("").trim().to_string();
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
        // size / creator / date: list items order
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
                .find(|s| !s.contains("MB") && !s.contains("KB") && !s.contains("-") && s.chars().count() < 20)
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

    // 若 selector 未命中，用 regex 兜底
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

/// 解析预览：优先 CDN origin；下载返回官方 downloadData URL（由前端/原生打开）
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

    // 尝试官方 get-preview-url
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
    fn extract_text_class_reads_course_name() {
        let html = r#"<div class="course-name">库来西库</div><div class="name">周金阳</div>"#;
        assert_eq!(extract_text_class(html, "course-name"), "库来西库");
        assert_eq!(extract_text_class(html, "name"), "周金阳");
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
        assert_eq!(
            normalize_url("https://mooc1.chaoxing.com/a"),
            "https://mooc1.chaoxing.com/a"
        );
    }

    #[test]
    fn parse_resource_rows_from_datalist_html() {
        let html = r#"
        <ul class="dataBody_td" id="12345" objectid="abcdef0123456789abcdef0123456789" dataname="课件1.jpg" type="jpg">
          <li>课件1.jpg</li><li>1.2MB</li><li>周老师</li><li>2026-07-01 12:00</li>
        </ul>
        <ul class="dataBody_td" id="67890" objectid="fedcba9876543210fedcba9876543210" dataname="demo.mp4" type="mp4">
          <li>demo.mp4</li><li>10MB</li>
        </ul>
        "#;
        let doc = Html::parse_document(html);
        let row_sel = Selector::parse("ul.dataBody_td, .dataBody_td").unwrap();
        let count = doc.select(&row_sel).count();
        assert_eq!(count, 2);
        let first = doc.select(&row_sel).next().unwrap();
        assert_eq!(first.value().attr("id").unwrap(), "12345");
        assert_eq!(first.value().attr("dataname").unwrap(), "课件1.jpg");
    }
}
