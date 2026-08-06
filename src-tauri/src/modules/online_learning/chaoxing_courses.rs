//! 学习通（Chaoxing）课程列表域：多数据源课程抓取（backclazzdata / fyportal
//! 定制平台 / 课程文件夹）、学期标签推断，以及课程列表进度填充。

use std::collections::HashSet;
use std::time::Duration;

use chrono::Datelike;
use scraper::Html;
use serde_json::{json, Value};

use crate::http_client::HbutClient;

use super::chaoxing_cards::json_str_field;
use super::chaoxing_outline::fetch_chaoxing_course_progress_fast;
use super::chaoxing_session::{
    chaoxing_cookie_blob, ensure_chaoxing_session_ready, has_chaoxing_bridge_cookie,
    propagate_chaoxing_key_cookies,
};
use super::shared::{
    cache_key, err_box, now_sync_time, parse_cookie_value, parse_href_param, read_cache,
    resolve_student_id, sanitize_text, save_cache, save_platform_state, selector, DynError,
    CACHE_CHAOXING_COURSES, CACHE_CHAOXING_PROGRESS, PLATFORM_CHAOXING,
};

fn write_chaoxing_course_progress_fields(course: &mut Value, progress: &Value) -> usize {
    let progress_text = progress
        .get("progress_text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let progress_percent = progress
        .get("progress_percent")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let pending_count = progress
        .get("pending_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let completed_count = progress
        .get("completed_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let total_count = progress
        .get("total_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    if let Some(map) = course.as_object_mut() {
        map.insert("progress_text".to_string(), json!(progress_text));
        map.insert("progress_rate".to_string(), json!(progress_percent));
        map.insert("progress_percent".to_string(), json!(progress_percent));
        map.insert("pending_count".to_string(), json!(pending_count));
        map.insert("completed_count".to_string(), json!(completed_count));
        map.insert("total_count".to_string(), json!(total_count));
        map.insert("auto_supported".to_string(), json!(total_count > 0));
    }
    pending_count
}

fn write_chaoxing_course_progress_fallback(
    course: &mut Value,
    role_type: u64,
    error_text: Option<&str>,
) -> usize {
    let message = if role_type == 1 {
        "教师视角课程，暂不统计学习进度"
    } else {
        "暂无章节任务点"
    };
    if let Some(map) = course.as_object_mut() {
        map.insert("progress_text".to_string(), json!(message));
        map.insert("progress_rate".to_string(), json!(0.0));
        map.insert("progress_percent".to_string(), json!(0.0));
        map.insert("pending_count".to_string(), json!(0));
        map.insert("completed_count".to_string(), json!(0));
        map.insert("total_count".to_string(), json!(0));
        map.insert("auto_supported".to_string(), json!(role_type != 1));
        if let Some(error_text) = error_text.map(str::trim).filter(|text| !text.is_empty()) {
            map.insert("progress_error".to_string(), json!(error_text));
        }
    }
    0
}
/// 从课程字段推断学期标签
/// 注意：字段缺失时优先日期/归档态，禁止一律标成「本学期」掩盖多学期
fn guess_semester_label(content: &Value, item: &Value, course_data: Option<&Value>) -> String {
    // 直接字段（含嵌套 course.data）
    for path in [
        content.get("semester"),
        content.get("term"),
        content.get("yearterm"),
        content.get("termName"),
        content.get("semesterName"),
        content.get("classterm"),
        item.get("semester"),
        item.get("term"),
        item.get("yearterm"),
        course_data.and_then(|c| c.get("semester")),
        course_data.and_then(|c| c.get("term")),
        course_data.and_then(|c| c.get("yearterm")),
        course_data.and_then(|c| c.get("termName")),
        course_data.and_then(|c| c.get("appinfo")),
    ] {
        if let Some(s) = path.and_then(|v| v.as_str()) {
            let t = s.trim();
            if !t.is_empty() && t.len() < 40 {
                // appinfo 可能是 HTML 描述，跳过太长的
                if t.contains("年") || t.contains("学期") || t.contains("-") {
                    return sanitize_text(t);
                }
            }
        }
    }
    // 起止日期 → 学年学期（多路径）
    for path in [
        content.get("begindate"),
        content.get("startDate"),
        content.get("starttime"),
        content.get("createTime"),
        content.get("createtimestamp"),
        item.get("createTime"),
        item.get("createtimestamp"),
        course_data.and_then(|c| c.get("startDate")),
        course_data.and_then(|c| c.get("begindate")),
        course_data.and_then(|c| c.get("createTime")),
    ] {
        let date_raw = path
            .and_then(|v| {
                v.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| v.as_i64().map(|n| n.to_string()))
                    .or_else(|| v.as_u64().map(|n| n.to_string()))
            })
            .unwrap_or_default();
        if let Some(label) = semester_from_date_str(&date_raw) {
            return label;
        }
    }
    // 已结束 / 归档 → 历史，避免与「本学期」混在一起
    let ended = content
        .get("isFiled")
        .and_then(|v| v.as_bool())
        .or_else(|| item.get("isFiled").and_then(|v| v.as_bool()))
        .or_else(|| {
            content
                .get("state")
                .and_then(|v| v.as_i64())
                .map(|n| n == 1)
        })
        .unwrap_or(false);
    if ended {
        "历史课程".into()
    } else {
        // 无法从字段/日期判断时标「未分学期」，勿假装「本学期」
        "未分学期".into()
    }
}

fn semester_from_date_str(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    // 毫秒时间戳
    if let Ok(ms) = s.parse::<i64>() {
        if ms > 1_000_000_000_000 {
            let secs = ms / 1000;
            if let Some(dt) = chrono::DateTime::from_timestamp(secs, 0) {
                let y = dt.year();
                let m = dt.month();
                return Some(if m >= 8 || m <= 1 {
                    format!("{}-{} 第一学期", y, y + 1)
                } else {
                    format!("{}-{} 第二学期", y - 1, y)
                });
            }
        }
    }
    // YYYY-MM-DD / YYYY/MM
    let re = regex::Regex::new(r"(\d{4})\D+(\d{1,2})").ok()?;
    let cap = re.captures(s)?;
    let y: i32 = cap.get(1)?.as_str().parse().ok()?;
    let m: u32 = cap.get(2)?.as_str().parse().ok()?;
    Some(if m >= 8 || m <= 1 {
        format!("{}-{} 第一学期", y, y + 1)
    } else {
        format!("{}-{} 第二学期", y - 1, y)
    })
}

/// 从课程文件夹 HTML 补充历史学期课程
async fn fetch_chaoxing_folder_courses(
    client: &HbutClient,
    seen: &mut HashSet<String>,
) -> Result<Vec<Value>, DynError> {
    propagate_chaoxing_key_cookies(client);
    let mut out = Vec::new();

    // 1) 交互页 + API 抽 folder id（多学期依赖课程夹）
    let mut folder_ids: Vec<(String, String)> = vec![("0".into(), "本学期".into())];
    let mut push_folder = |id: String, name: String| {
        let id = id.trim().to_string();
        if id.is_empty() {
            return;
        }
        if folder_ids.iter().any(|(i, _)| i == &id) {
            return;
        }
        let name = sanitize_text(&name);
        folder_ids.push((
            id,
            if name.is_empty() {
                "历史课程".into()
            } else {
                name
            },
        ));
    };

    // API：课程夹列表（比 HTML 正则更稳；兼容 data.list / folderList 等嵌套）
    let mut folder_api_hits = 0usize;
    for api in [
        "https://mooc1-api.chaoxing.com/mycourse/getCourseFolders?view=json",
        "https://mooc1.chaoxing.com/mooc-ans/visit/coursefolders?view=json",
        "https://mooc1-api.chaoxing.com/gas/folder?view=json",
        "https://mooc1.chaoxing.com/visit/coursefolders?view=json",
    ] {
        if let Ok(resp) = client
            .client
            .get(api)
            .header("Accept", "application/json, text/plain, */*")
            .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
            .timeout(Duration::from_secs(12))
            .send()
            .await
        {
            if let Ok(v) = resp.json::<Value>().await {
                let arr = extract_folder_array(&v);
                let mut added = 0usize;
                for item in arr {
                    let id = item
                        .get("id")
                        .or_else(|| item.get("folderId"))
                        .or_else(|| item.get("courseFolderId"))
                        .or_else(|| item.get("cfid"))
                        .or_else(|| item.get("folderid"))
                        .map(|x| match x {
                            Value::Number(n) => n.to_string(),
                            Value::String(s) => s.clone(),
                            _ => String::new(),
                        })
                        .unwrap_or_default();
                    let name = item
                        .get("name")
                        .or_else(|| item.get("folderName"))
                        .or_else(|| item.get("title"))
                        .or_else(|| item.get("foldername"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !id.trim().is_empty() {
                        added += 1;
                    }
                    push_folder(id, name);
                }
                if added > 0 {
                    folder_api_hits += added;
                    println!("[调试] course folders api ok url={api} candidates={added}");
                }
            }
        }
    }

    if let Ok(resp) = client
        .client
        .get("https://mooc1.chaoxing.com/mooc-ans/visit/interaction")
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Referer", "https://i.chaoxing.com/")
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        let html = resp.text().await.unwrap_or_default();
        // courseFolderId=123 / data-id="123" 课程夹
        let re_folder = regex::Regex::new(
            r#"courseFolderId[=:\s"']+(\d+)[^>]{0,200}?(?:title|data-name|folderName)[=:\s"']+([^"'<]{1,40})"#,
        )
        .ok();
        let re_folder2 =
            regex::Regex::new(r#"(?i)(?:folderid|courseFolderId|cfid)["'=\s:]+(\d+)"#).ok();
        let re_folder3 = regex::Regex::new(
            r#"(?i)data-(?:id|folderid|cfid)="(\d+)"[^>]{0,120}?(?:title|data-name)="([^"]{1,40})""#,
        )
        .ok();
        if let Some(re) = re_folder {
            for cap in re.captures_iter(&html) {
                let id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let name = cap.get(2).map(|m| m.as_str()).unwrap_or("历史").to_string();
                if id != "0" {
                    push_folder(id, name);
                }
            }
        }
        if let Some(re) = re_folder2 {
            for cap in re.captures_iter(&html) {
                let id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                push_folder(id, "历史课程".into());
            }
        }
        if let Some(re) = re_folder3 {
            for cap in re.captures_iter(&html) {
                let id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let name = cap.get(2).map(|m| m.as_str()).unwrap_or("历史").to_string();
                push_folder(id, name);
            }
        }
        // 常见：本学期 + 往年夹 1..N 试探（部分账号 HTML 不暴露 id）
        for probe in 1..=8 {
            push_folder(probe.to_string(), format!("课程夹 {probe}"));
        }
    }

    // 去重 folder，最多扫 16 个
    folder_ids.sort_by(|a, b| a.0.cmp(&b.0));
    folder_ids.dedup_by(|a, b| a.0 == b.0);
    folder_ids.truncate(16);
    println!(
        "[调试] course folders resolved count={} api_hits={} ids={:?}",
        folder_ids.len(),
        folder_api_hits,
        folder_ids
            .iter()
            .map(|(id, name)| format!("{id}:{name}"))
            .collect::<Vec<_>>()
    );

    for (folder_id, folder_name) in folder_ids {
        let body = format!("courseType=1&courseFolderId={folder_id}&superstarClass=0");
        let resp = match client
            .client
            .post("https://mooc1.chaoxing.com/mooc-ans/visit/courselistdata")
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .header("Accept", "text/html, */*")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            )
            .body(body)
            .timeout(Duration::from_secs(15))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };
        let html = resp.text().await.unwrap_or_default();
        // 课程卡片：courseid / clazzid / cpi
        let re_card = regex::Regex::new(
            r#"(?i)(?:courseid|courseId)=(\d+)[^"'>\s]{0,80}?(?:clazzid|classId)=(\d+)[^"'>\s]{0,80}?(?:cpi)=(\d+)"#,
        )
        .ok();
        let re_name = regex::Regex::new(r#"(?i)class="[^"]*course-name[^"]*"[^>]*>([^<]{1,80})<"#)
            .ok()
            .or_else(|| regex::Regex::new(r#"(?i)title="([^"]{2,80})""#).ok());

        let mut names: Vec<String> = Vec::new();
        if let Some(rn) = re_name.as_ref() {
            for cap in rn.captures_iter(&html) {
                let n = sanitize_text(cap.get(1).map(|m| m.as_str()).unwrap_or(""));
                if !n.is_empty() {
                    names.push(n);
                }
            }
        }

        if let Some(re) = re_card {
            for (idx, cap) in re.captures_iter(&html).enumerate() {
                let course_id = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let clazz_id = cap.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
                let cpi = cap.get(3).map(|m| m.as_str()).unwrap_or("").to_string();
                let key = format!("{course_id}:{clazz_id}");
                if course_id.is_empty() || clazz_id.is_empty() || !seen.insert(key.clone()) {
                    continue;
                }
                let name = names
                    .get(idx)
                    .cloned()
                    .unwrap_or_else(|| format!("课程 {course_id}"));
                let semester = if folder_id == "0" {
                    "本学期".to_string()
                } else if folder_name.contains("学期") || folder_name.contains("年") {
                    folder_name.clone()
                } else {
                    folder_name.clone()
                };
                let course_url = format!(
                    "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={course_id}&chapterId=0&clazzid={clazz_id}&cpi={cpi}&mooc2=1&isMicroCourse=false"
                );
                out.push(json!({
                    "id": key,
                    "course_id": course_id,
                    "clazz_id": clazz_id,
                    "cpi": cpi,
                    "name": name,
                    "title": name,
                    "teacher": "",
                    "image_url": "",
                    "course_url": course_url,
                    "role_type": 3,
                    "role_label": "student",
                    "auto_supported": true,
                    "semester": semester,
                    "folder_id": folder_id,
                    "source": "courselistdata",
                }));
            }
        }
    }

    println!(
        "[调试] fetch_chaoxing_folder_courses done extra_courses={}",
        out.len()
    );
    Ok(out)
}

/// 从课程夹 JSON 中尽量抠出 folder 数组（兼容多层嵌套）
fn extract_folder_array(v: &Value) -> Vec<Value> {
    if let Some(arr) = v.as_array() {
        return arr.clone();
    }
    for key in [
        "data",
        "folderList",
        "channelList",
        "list",
        "folders",
        "result",
    ] {
        if let Some(node) = v.get(key) {
            if let Some(arr) = node.as_array() {
                return arr.clone();
            }
            if let Some(arr) = node.get("list").and_then(|x| x.as_array()) {
                return arr.clone();
            }
            if let Some(arr) = node.get("folderList").and_then(|x| x.as_array()) {
                return arr.clone();
            }
            if let Some(arr) = node.get("data").and_then(|x| x.as_array()) {
                return arr.clone();
            }
        }
    }
    Vec::new()
}

/// 解析课程中心页 HTML 中的学期下拉（<select name="xq">，服务端渲染）
/// 返回 (section_id, semester_num, label)，如 ("43811", "20261", "2026-2027第一学期")
/// 对应网页端真实学期筛选：切换学期即 getStudyCourse?sectionId={section_id}
/// 注意：
/// - 必须限定 name="xq" 的 select，页面还有院系/部门等多个下拉（否则混入噪声 label）
/// - 真实 HTML 属性名是驼峰 `semesterNum`（部分场景小写），需两者兼容
/// - 排除 value=0 的「全部」占位项（前端会自行提供「全部」tab）
fn parse_fyportal_semester_options(html: &str) -> Vec<(String, String, String)> {
    let re_select = regex::Regex::new(r#"(?is)<select\s+name=["']xq["'][^>]*>(.*?)</select>"#)
        .expect("fyportal xq select regex");
    let re_option = regex::Regex::new(
        r#"(?i)<option\s+value="(\d+)"(?:\s+semesternum="(\d+)")?[^>]*>([^<]{2,40})</option>"#,
    )
    .expect("fyportal semester option regex");
    let mut out = Vec::new();
    for cap in re_select.captures_iter(html) {
        let inner = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        for opt in re_option.captures_iter(inner) {
            let value = match opt.get(1) {
                Some(m) => m.as_str().to_string(),
                None => continue,
            };
            let sem = opt
                .get(2)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
            let label = opt
                .get(3)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            // 排除「全部」(value=0) 与占位文本，避免污染学期 tab
            if value == "0" || label == "全部" || label.contains("请选择") {
                continue;
            }
            if label.is_empty() {
                continue;
            }
            out.push((value, sem, label));
        }
    }
    out
}

/// 解析 fyportal 课程卡片 HTML（<ul class="course-list"><li class="w_couritem ...">）
/// 每张卡片属性：state(0进行中/1已结课)、cid、classid、personId(=cpi)、ckenc、cname、封面图
fn parse_fyportal_course_cards(html: &str, semester_label: &str) -> Vec<Value> {
    let re_li = regex::Regex::new(r#"(?is)<li\s+class="[^"]*w_couritem[^"]*"([^>]*)>(.*?)</li>"#)
        .expect("fyportal course li regex");
    let re_attr = regex::Regex::new(
        r#"(?i)(cid|classid|personid|ckenc|kcenc|clazzenc|cname|state|source)="([^"]*)""#,
    )
    .expect("fyportal course attr regex");
    let re_img = regex::Regex::new(r#"(?i)<img\s+src="([^"]*)""#).expect("fyportal img regex");
    let mut out = Vec::new();
    for cap in re_li.captures_iter(html) {
        // capture(1) = li 开标签属性段（cid/classid/cname 等），capture(2) = inner HTML（封面图）
        let attrs_html = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let inner = cap.get(2).map(|m| m.as_str()).unwrap_or("");
        let mut attrs = std::collections::HashMap::new();
        for a in re_attr.captures_iter(attrs_html) {
            if let (Some(k), Some(v)) = (a.get(1), a.get(2)) {
                attrs.insert(
                    k.as_str().to_ascii_lowercase(),
                    v.as_str().trim().to_string(),
                );
            }
        }
        let course_id = attrs.get("cid").cloned().unwrap_or_default();
        let clazz_id = attrs.get("classid").cloned().unwrap_or_default();
        if course_id.is_empty() || clazz_id.is_empty() {
            continue;
        }
        let cname = attrs
            .get("cname")
            .cloned()
            .unwrap_or_else(|| format!("课程 {course_id}"));
        let cpi = attrs.get("personid").cloned().unwrap_or_default();
        let state = attrs.get("state").cloned().unwrap_or_default();
        let image_url = re_img
            .captures(inner)
            .and_then(|m| m.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let course_url = format!(
            "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={course_id}&chapterId=0&clazzid={clazz_id}&cpi={cpi}&mooc2=1&isMicroCourse=false"
        );
        out.push(json!({
            "id": format!("{course_id}:{clazz_id}"),
            "course_id": course_id,
            "clazz_id": clazz_id,
            "cpi": cpi,
            "name": cname,
            "title": cname,
            "teacher": "",
            "image_url": image_url,
            "course_url": course_url,
            "role_type": 3,
            "role_label": "student",
            "auto_supported": true,
            "semester": semester_label,
            "state": state,
            "source": "fyportal",
        }));
    }
    out
}

/// 从 fyportal 课程中心页面拉取学期下拉（服务端渲染在 HTML 里）
async fn fetch_fyportal_semester_options(client: &HbutClient) -> Vec<(String, String, String)> {
    let url = "https://fycourse.fanya.chaoxing.com/fyportal/courselist/course?version=1&s=null";
    let resp = match client
        .client
        .get(url)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Referer", "https://i.chaoxing.com/base")
        .timeout(Duration::from_secs(12))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            crate::hbut_session_log!("ChaoxingCourses", "fyportal 学期页请求失败: {}", e);
            return Vec::new();
        }
    };
    let final_url = resp.url().to_string();
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let opts = parse_fyportal_semester_options(&text);
    crate::hbut_session_log!(
        "ChaoxingCourses",
        "fyportal 学期页 status={} final={} len={} options={}",
        status.as_u16(),
        final_url,
        text.len(),
        opts.len()
    );
    opts
}

/// 按学期（sectionId）拉取 fyportal 课程卡片（返回 HTML 课程列表）
async fn fetch_fyportal_courses_by_section(
    client: &HbutClient,
    section_id: &str,
    semester_label: &str,
) -> Vec<Value> {
    let url = format!(
        "https://fycourse.fanya.chaoxing.com/fyportal/courselist/getStudyCourse?sectionId={}&semesterNum=&coursesource=0&coursename=&searchkkstatus=0&belongSchoolId=0",
        section_id
    );
    let resp = match client
        .client
        .get(&url)
        .header("Accept", "text/html, */*")
        .header("X-Requested-With", "XMLHttpRequest")
        .header(
            "Referer",
            "https://fycourse.fanya.chaoxing.com/fyportal/courselist/course?version=1&s=null",
        )
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            crate::hbut_session_log!(
                "ChaoxingCourses",
                "fyportal 学期课程页请求失败 section={} err={}",
                section_id,
                e
            );
            return Vec::new();
        }
    };
    let final_url = resp.url().to_string();
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let cards = parse_fyportal_course_cards(&text, semester_label);
    crate::hbut_session_log!(
        "ChaoxingCourses",
        "fyportal 学期课程 section={} label={} status={} final={} len={} cards={}",
        section_id,
        semester_label,
        status.as_u16(),
        final_url,
        text.len(),
        cards.len()
    );
    cards
}

async fn fetch_chaoxing_courses_remote(client: &HbutClient) -> Result<Value, DynError> {
    let url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
    let resp = client
        .client
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/base")
        .send()
        .await?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let text = resp.text().await?;
    if status.is_success() {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if value
                .get("status")
                .and_then(|item| item.as_bool())
                .is_some_and(|flag| !flag)
            {
                let msg = value
                    .get("errorMsg")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("msg").and_then(|v| v.as_str()))
                    .unwrap_or("学习通会话已失效，请重新登录")
                    .trim()
                    .to_string();
                return Err(err_box(msg));
            }
            let mut courses = Vec::new();
            let mut seen = HashSet::new();
            let list = value
                .get("channelList")
                .and_then(|v| v.as_array())
                .cloned()
                .or_else(|| {
                    value
                        .get("data")
                        .and_then(|data| data.get("channelList"))
                        .and_then(|v| v.as_array())
                        .cloned()
                })
                .or_else(|| value.get("courseList").and_then(|v| v.as_array()).cloned())
                .or_else(|| {
                    value
                        .get("data")
                        .and_then(|data| data.get("courseList"))
                        .and_then(|v| v.as_array())
                        .cloned()
                })
                .or_else(|| value.get("result").and_then(|v| v.as_array()).cloned())
                .unwrap_or_default();

            let list_len = list.len();
            for item in list {
                // backclazzdata 的 channelList 结构：
                // { cpi, key, content: { name, roletype, id(=clazzId), course: { data: [{ name, id(=courseId), teacherfactor, imageurl }] } } }
                let content = match item.get("content") {
                    Some(c) => c,
                    None => &item, // 兼容已扁平化的格式
                };
                let roletype = content
                    .get("roletype")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(3);
                // 获取课程核心数据（区分创建者 roletype=1 和学生 roletype=3）
                let course_data = content
                    .get("course")
                    .and_then(|c| c.get("data"))
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first());
                let (name, course_id, teacher, image_url) = if let Some(cd) = course_data {
                    // 学生视角：从 course.data[0] 提取
                    let n = sanitize_text(cd.get("name").and_then(|v| v.as_str()).unwrap_or(""));
                    let cid = cd
                        .get("id")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default();
                    let t = sanitize_text(
                        cd.get("teacherfactor")
                            .and_then(|v| v.as_str())
                            .unwrap_or(""),
                    );
                    let img = cd
                        .get("imageurl")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    (n, cid, t, img)
                } else {
                    // 创建者视角或扁平格式
                    let n = sanitize_text(
                        content
                            .get("name")
                            .and_then(|v| v.as_str())
                            .or_else(|| item.get("name").and_then(|v| v.as_str()))
                            .unwrap_or(""),
                    );
                    let cid = content
                        .get("id")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .or_else(|| {
                            item.get("courseid")
                                .map(|v| v.to_string().trim_matches('"').to_string())
                        })
                        .unwrap_or_default();
                    let t = sanitize_text(
                        content
                            .get("teacherfactor")
                            .and_then(|v| v.as_str())
                            .or_else(|| item.get("teacherfactor").and_then(|v| v.as_str()))
                            .unwrap_or(""),
                    );
                    let img = content
                        .get("imageurl")
                        .and_then(|v| v.as_str())
                        .or_else(|| item.get("imageurl").and_then(|v| v.as_str()))
                        .unwrap_or("")
                        .to_string();
                    (n, cid, t, img)
                };
                // clazzId：学生视角从 content.id，创建者视角从 content.clazz[0].clazzId
                let clazz_id = if roletype == 1 {
                    content
                        .get("clazz")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|c| c.get("clazzId"))
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .unwrap_or_default()
                } else {
                    content
                        .get("id")
                        .map(|v| v.to_string().trim_matches('"').to_string())
                        .or_else(|| {
                            item.get("clazzid")
                                .map(|v| v.to_string().trim_matches('"').to_string())
                        })
                        .unwrap_or_default()
                };
                let cpi = item
                    .get("cpi")
                    .or_else(|| content.get("cpi"))
                    .map(|v| v.to_string().trim_matches('"').to_string())
                    .unwrap_or_default();
                let key = format!("{}:{}", course_id, clazz_id);
                if course_id.is_empty() || clazz_id.is_empty() || !seen.insert(key.clone()) {
                    continue;
                }
                // 显示名称：优先使用班级名（含段号信息），其次课程名
                let display_name = content
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let final_name = if !name.is_empty() {
                    name.clone()
                } else {
                    sanitize_text(&display_name)
                };
                let course_url = format!(
                    "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={}&chapterId=0&clazzid={}&cpi={}&mooc2=1&isMicroCourse=false",
                    course_id, clazz_id, cpi
                );
                // 学期标签：优先班级时间 / 课程字段
                let semester = guess_semester_label(content, &item, course_data);
                courses.push(json!({
                    "id": key,
                    "course_id": course_id,
                    "clazz_id": clazz_id,
                    "cpi": cpi,
                    "name": final_name,
                    "title": final_name,
                    "teacher": teacher,
                    "image_url": image_url,
                    "course_url": course_url,
                    "role_type": roletype,
                    "role_label": if roletype == 1 { "teacher" } else { "student" },
                    "auto_supported": roletype != 1,
                    "semester": semester,
                    "folder_id": 0,
                    "source": "backclazzdata",
                }));
            }
            println!(
                "[调试] backclazzdata channelList={}, parsed courses={}",
                list_len,
                courses.len()
            );

            // fyportal 定制平台学期数据（湖工大网络教学平台）：学期下拉 + 各学期课程，
            // 与网页端课程中心完全同源；成功时优于文件夹试探（文件夹名不是真实学期）
            let mut fyportal_semesters: Vec<String> = Vec::new();
            let mut fyportal_matched = 0usize;
            let mut fyportal_added = 0usize;
            let sem_meta = fetch_fyportal_semester_options(client).await;
            let fyportal_ok = !sem_meta.is_empty();
            if fyportal_ok {
                fyportal_semesters = sem_meta.iter().map(|(_, _, label)| label.clone()).collect();
                // 逐学期拉课程（串行：量小且避免触发风控），标记学期归属
                for (section_id, _, label) in sem_meta.iter() {
                    let items = fetch_fyportal_courses_by_section(client, section_id, label).await;
                    if items.is_empty() {
                        continue;
                    }
                    for c in items {
                        let key = format!(
                            "{}:{}",
                            json_str_field(&c, &["course_id"]),
                            json_str_field(&c, &["clazz_id"])
                        );
                        if let Some(existing) = courses.iter_mut().find(|e| {
                            format!(
                                "{}:{}",
                                json_str_field(e, &["course_id"]),
                                json_str_field(e, &["clazz_id"])
                            ) == key
                        }) {
                            fyportal_matched += 1;
                            // 以网页端学期归属覆盖猜测值
                            existing["semester"] = c
                                .get("semester")
                                .cloned()
                                .unwrap_or_else(|| json!("未分学期"));
                        } else {
                            fyportal_added += 1;
                            courses.push(c);
                        }
                    }
                }
                println!(
                    "[调试] fyportal semesters={:?} matched={} added={}",
                    fyportal_semesters, fyportal_matched, fyportal_added
                );
            }

            // 再拉课程文件夹（历史学期），合并去重。
            // fyportal 学期数据可用时跳过：文件夹名不是真实学期，且 16 个试探请求拖慢加载
            let mut folder_extra = 0usize;
            if !fyportal_ok {
                match fetch_chaoxing_folder_courses(client, &mut seen).await {
                    Ok(extra) => {
                        folder_extra = extra.len();
                        for c in extra {
                            courses.push(c);
                        }
                    }
                    Err(e) => {
                        println!("[调试] fetch_chaoxing_folder_courses failed: {e}");
                    }
                }
            }

            let mut semesters: Vec<String> = if !fyportal_semesters.is_empty() {
                // fyportal 学期列表保持网页端顺序（最新在前）
                fyportal_semesters
            } else {
                // 回退：从课程自身收集
                courses
                    .iter()
                    .filter_map(|c| {
                        c.get("semester")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
                    .collect()
            };
            semesters.sort();
            semesters.dedup();
            // 本学期优先，其次带「年/学期」的标签
            semesters.sort_by(|a, b| {
                let rank = |s: &str| {
                    if s == "本学期" {
                        0
                    } else if s.contains("年") || s.contains("学期") {
                        1
                    } else if s == "未分学期" {
                        3
                    } else {
                        2
                    }
                };
                rank(a).cmp(&rank(b)).then_with(|| b.cmp(a))
            });

            println!(
                "[调试] chaoxing courses total={} folder_extra={} semesters={:?}",
                courses.len(),
                folder_extra,
                semesters
            );

            let pending_count = value
                .get("pending_count")
                .and_then(|v| v.as_u64())
                .or_else(|| value.get("pendingCount").and_then(|v| v.as_u64()))
                .or_else(|| value.get("unfinishedCount").and_then(|v| v.as_u64()))
                .unwrap_or(0) as usize;
            return Ok(json!({
                "success": true,
                "courses": courses,
                "semesters": semesters,
                "pending_count": pending_count,
                "folder_extra": folder_extra,
            }));
        }
    }

    if final_url.contains("/login") {
        return Err(err_box("学习通会话已失效，请重新登录"));
    }

    let doc = Html::parse_document(&text);
    let course_link_selector = selector("a[href*=\"courseid=\"]");
    let image_selector = selector("img");
    let mut courses = Vec::new();
    let mut seen = HashSet::new();
    for link in doc.select(&course_link_selector) {
        let href = link.value().attr("href").unwrap_or("").trim();
        if href.is_empty() {
            continue;
        }
        let course_id = parse_href_param(href, "courseid");
        let clazz_id = parse_href_param(href, "clazzid");
        let cpi = parse_href_param(href, "cpi");
        let name = sanitize_text(&link.text().collect::<Vec<_>>().join(" "));
        let uniq = format!("{}:{}:{}", course_id, clazz_id, name);
        if name.is_empty() || !seen.insert(uniq) {
            continue;
        }
        let image_url = link
            .select(&image_selector)
            .next()
            .and_then(|img| img.value().attr("src"))
            .unwrap_or("")
            .to_string();
        let teacher = link
            .value()
            .attr("title")
            .map(sanitize_text)
            .unwrap_or_default();
        let course_url = if href.starts_with("http") {
            href.to_string()
        } else {
            format!("https://mooc1.chaoxing.com{}", href)
        };
        courses.push(json!({
            "id": format!("{}:{}", course_id, clazz_id),
            "course_id": course_id,
            "clazz_id": clazz_id,
            "cpi": cpi,
            "name": name,
            "teacher": teacher,
            "image_url": image_url,
            "course_url": course_url,
            "role_type": 3,
            "role_label": "student",
            "auto_supported": true,
        }));
    }

    if courses.is_empty() {
        return Err(err_box("未解析到学习通课程"));
    }

    Ok(json!({
        "success": true,
        "courses": courses,
        "pending_count": 0
    }))
}
async fn enrich_chaoxing_courses_with_progress(
    client: &HbutClient,
    student_id: &str,
    courses: Vec<Value>,
    force_refresh: bool,
    allow_live_fetch: bool,
) -> (Vec<Value>, usize) {
    let mut enriched_courses = Vec::with_capacity(courses.len());
    let mut total_pending = 0usize;

    for mut course in courses {
        let role_type = course
            .get("role_type")
            .and_then(|v| v.as_u64())
            .unwrap_or(3);
        let course_id = course
            .get("course_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let clazz_id = course
            .get("clazz_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let cpi = course
            .get("cpi")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let course_url = course
            .get("course_url")
            .and_then(|v| v.as_str())
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        if course_id.is_empty() || clazz_id.is_empty() {
            total_pending += write_chaoxing_course_progress_fallback(
                &mut course,
                role_type,
                Some("课程标识缺失"),
            );
            enriched_courses.push(course);
            continue;
        }

        let cache_id = cache_key(student_id, &format!("progress:{}:{}", course_id, clazz_id));
        let mut progress_payload = if !force_refresh {
            read_cache(CACHE_CHAOXING_PROGRESS, &cache_id).map(|(cached, _)| cached)
        } else {
            None
        };

        if progress_payload.is_none() && allow_live_fetch {
            match fetch_chaoxing_course_progress_fast(
                client,
                &course_id,
                &clazz_id,
                &cpi,
                course_url.as_deref(),
            )
            .await
            {
                Ok(payload) => {
                    save_cache(CACHE_CHAOXING_PROGRESS, &cache_id, &payload);
                    progress_payload = Some(payload);
                }
                Err(error) => {
                    total_pending += write_chaoxing_course_progress_fallback(
                        &mut course,
                        role_type,
                        Some(&error.to_string()),
                    );
                    enriched_courses.push(course);
                    continue;
                }
            }
        }

        if let Some(progress) = progress_payload {
            total_pending += write_chaoxing_course_progress_fields(&mut course, &progress);
        } else {
            total_pending += write_chaoxing_course_progress_fallback(&mut course, role_type, None);
        }
        enriched_courses.push(course);
    }

    (enriched_courses, total_pending)
}

pub async fn chaoxing_fetch_courses(
    client: &mut HbutClient,
    student_id: Option<&str>,
    force: bool,
) -> Result<Value, DynError> {
    let timer = crate::runtime_log::ScopedTimer::start("ChaoxingCourses", "fetch_courses");
    let sid = resolve_student_id(client, student_id)?;
    let cache_id = cache_key(&sid, "courses");

    // 优先读缓存：避免每次进课程中心都走 ensure_session + 远程拉取
    if !force {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
            let count = cached
                .get("courses")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            // schema=2：含真实学期数据（fyportal）。旧缓存（无学期）直接跳过走远程
            let schema_ok = cached.get("schema").and_then(|v| v.as_u64()).unwrap_or(0) >= 2;
            if count > 0 && schema_ok {
                crate::hbut_session_log!(
                    "ChaoxingCourses",
                    "命中缓存 {} 门课 force=false，跳过会话探测与远程拉取",
                    count
                );
                timer.finish(Some(json!({ "from_cache": true, "count": count })));
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            if count > 0 {
                crate::hbut_session_log!(
                    "ChaoxingCourses",
                    "缓存 schema 过旧（无学期数据）count={}，忽略缓存走远程",
                    count
                );
            }
        }
    } else {
        crate::hbut_session_log!("ChaoxingCourses", "强制刷新 force=true");
    }

    let session_ready = ensure_chaoxing_session_ready(client, &sid).await;
    if !session_ready {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
            crate::hbut_session_log!("ChaoxingCourses", "会话未就绪，回退缓存课程");
            timer.finish(Some(json!({ "from_cache": true, "session_ready": false })));
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
        timer.finish(Some(json!({ "session_ready": false, "empty": true })));
        return Ok(json!({
            "success": true,
            "courses": [],
            "pending_count": 0,
            "platform_status": {
                "platform": PLATFORM_CHAOXING,
                "connected": false,
                "status": if has_chaoxing_bridge_cookie(client) { "票据待补全" } else { "未连接" },
                "offline": false,
                "message": if has_chaoxing_bridge_cookie(client) {
                    "已获取教务票据，但学习通票据补全失败，请稍后重试"
                } else {
                    "当前没有可用的学习通会话，请先在学习通登录页完成一次登录后自动同步"
                }
            }
        }));
    }

    match fetch_chaoxing_courses_remote(client).await {
        Ok(payload) => {
            let raw_courses = payload
                .get("courses")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let (courses, pending_count) =
                enrich_chaoxing_courses_with_progress(client, &sid, raw_courses, force, true).await;
            let enriched = json!({
                "success": true,
                "courses": courses,
                "semesters": payload.get("semesters").cloned().unwrap_or(json!([])),
                "pending_count": pending_count,
                "schema": 2,
                "platform_status": {
                    "platform": PLATFORM_CHAOXING,
                    "connected": true,
                    "status": "已连接",
                    "offline": false,
                    "message": "已复用本机学习通会话"
                }
            });
            save_cache(CACHE_CHAOXING_COURSES, &cache_id, &enriched);
            crate::hbut_session_log!(
                "ChaoxingCourses",
                "远程拉取完成 count={} pending={}",
                courses.len(),
                pending_count
            );
            timer.finish(Some(json!({ "from_cache": false, "count": courses.len() })));
            let display_name = client
                .user_info
                .as_ref()
                .map(|item| item.student_name.clone())
                .unwrap_or_default();
            save_platform_state(
                &sid,
                PLATFORM_CHAOXING,
                true,
                parse_cookie_value(&chaoxing_cookie_blob(client), "UID").unwrap_or_default(),
                display_name,
                chaoxing_cookie_blob(client),
                json!({
                    "course_count": enriched.get("courses").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0)
                }),
            );
            Ok(crate::attach_sync_time(enriched, &now_sync_time(), false))
        }
        Err(error) => {
            crate::hbut_session_log!("ChaoxingCourses", "远程拉取失败: {}", error);
            if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_COURSES, &cache_id) {
                timer.finish(Some(json!({ "from_cache": true, "remote_error": true })));
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            timer.fail(error.to_string());
            Err(error)
        }
    }
}

#[cfg(test)]
mod catalog_and_video_tests {
    use super::*;

    #[test]
    fn semester_from_date_str_covers_timestamp_and_ymd() {
        assert!(semester_from_date_str("2024-09-01")
            .unwrap_or_default()
            .contains("第一学期"));
        assert!(semester_from_date_str("2025-03-01")
            .unwrap_or_default()
            .contains("第二学期"));
        // 2024-09-01 00:00 UTC 附近毫秒
        let ms = "1725148800000";
        assert!(semester_from_date_str(ms).is_some());
    }
    #[test]
    fn guess_semester_label_avoids_fake_current_term() {
        let content = json!({});
        let item = json!({});
        let label = guess_semester_label(&content, &item, None);
        assert_eq!(label, "未分学期");

        let content2 = json!({ "begindate": "2023-09-10" });
        let label2 = guess_semester_label(&content2, &item, None);
        assert!(label2.contains("2023") || label2.contains("学期"));
    }
    #[test]
    fn extract_folder_array_nested() {
        let v = json!({ "data": { "list": [{ "id": 1, "name": "2023-2024" }] } });
        let arr = extract_folder_array(&v);
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["id"], 1);
    }
    #[test]
    fn fyportal_semester_options_parse_realistic_select() {
        // 对齐网页端实测结构：value=sectionId + semesterNum(驼峰) + selected
        // 同时包含干扰 select（院系/部门），验证只解析 name="xq"
        let html = r#"
        <select name="xq" data-placeholder="全部" style="width: 240px; display: none;" class="dept_select">
            <option value="0">全部</option>
            <option value="43811" semesterNum="20261" selected="true">2026-2027第一学期</option>
            <option value="38370" semesterNum="20252">2025-2026第二学期</option>
            <option value="35140" semesterNum="20251">2025-2026第一学期</option>
            <option value="2618" semesterNum="20191">2019-2020第二学期</option>
        </select>
        <select name="dept">
            <option value="0">请选择开课院系</option>
            <option value="123">马克思主义学院</option>
            <option value="456">电气与电子工程学院</option>
        </select>
        "#;
        let opts = parse_fyportal_semester_options(html);
        // 只保留真实学期：排除 value=0「全部」与干扰 select 的院系/占位
        assert_eq!(opts.len(), 4);
        assert_eq!(
            opts[0],
            ("43811".into(), "20261".into(), "2026-2027第一学期".into())
        );
        assert_eq!(
            opts[1],
            ("38370".into(), "20252".into(), "2025-2026第二学期".into())
        );
        assert_eq!(
            opts[3],
            ("2618".into(), "20191".into(), "2019-2020第二学期".into())
        );
        assert!(!opts
            .iter()
            .any(|(_, _, l)| l.contains("院系") || l.contains("学院") || l == "全部"));
    }

    #[test]
    fn fyportal_semester_options_empty_html() {
        assert!(parse_fyportal_semester_options("<html></html>").is_empty());
        assert!(parse_fyportal_semester_options("").is_empty());
    }
    #[test]
    fn fyportal_course_cards_parse_realistic_li() {
        // 对齐网页端实测课程卡片结构
        let html = r#"
        <ul class="course-list">
            <li class="w_couritem clearfix" state="0" kcenc="abc" ckenc="ck123" clazzenc="ce1"
                personId="487811746" iswzy="0" micid="" cid="254673763" classid="125938817"
                cname="军事理论" source="0">
                <div class="course-cover">
                    <a href='/fyportal/courselist/entercoursenewfy?role=3&courseId=254673763&clazzId=125938817&cpi=487811746&ckenc=ck123' target="_blank">
                        <img src="https://p.ananas.chaoxing.com/star3/origin/abc.jpg">
                    </a>
                </div>
                <div class="course-info">
                    <h3><span class="course-name">军事理论</span></h3>
                    <p class="line2 color3">李海燕</p>
                </div>
            </li>
            <li class="w_couritem clearfix" state="1" personId="487811746"
                cid="254918439" classid="126631792" cname="人工智能通识课" source="0">
                <div class="course-cover"><a href='/x'><img src="http://p.ananas.chaoxing.com/x.jpg"></a></div>
            </li>
        </ul>
        "#;
        let cards = parse_fyportal_course_cards(html, "2026-2027第一学期");
        assert_eq!(cards.len(), 2);
        let first = &cards[0];
        assert_eq!(first["course_id"], "254673763");
        assert_eq!(first["clazz_id"], "125938817");
        assert_eq!(first["cpi"], "487811746");
        assert_eq!(first["name"], "军事理论");
        assert_eq!(first["semester"], "2026-2027第一学期");
        assert_eq!(first["state"], "0");
        assert!(first["image_url"]
            .as_str()
            .unwrap_or("")
            .contains("p.ananas.chaoxing.com"));
        assert_eq!(cards[1]["state"], "1");
        assert_eq!(cards[1]["name"], "人工智能通识课");
    }

    #[test]
    fn fyportal_course_cards_skip_invalid() {
        let html = r#"<ul class="course-list"><li class="w_couritem" cname="无id课程"></li></ul>"#;
        assert!(parse_fyportal_course_cards(html, "2025-2026第一学期").is_empty());
    }
}
