//! 学习通（Chaoxing）课程内容域：知识卡片抓取与附件解析、附件类型推断、
//! 视频状态查询与进度上报、课程成绩统计，以及学习页面打开链接生成。

use std::collections::HashSet;
use std::time::Duration;

use serde_json::{json, Value};

use crate::http_client::HbutClient;

use super::chaoxing_session::{has_chaoxing_session, propagate_chaoxing_key_cookies};
use super::shared::{err_box, read_json_response, DynError};

/// 从 knowledge/cards 页 HTML 提取 attachments 数组（任务点列表）
/// 容错解析：mArg 整体可能含 JS 语法，只提取 `"attachments":[...]` 数组
pub(crate) fn parse_cards_attachments(html: &str) -> Vec<Value> {
    let marker = "\"attachments\":";
    let Some(marker_pos) = html.find(marker) else {
        return Vec::new();
    };
    let after = &html[marker_pos + marker.len()..];
    let Some(arr_start_rel) = after.find('[') else {
        return Vec::new();
    };
    let arr_start = marker_pos + marker.len() + arr_start_rel;
    let bytes = html.as_bytes();
    // bracket 深度：arr 自身 `[` 计入（从 0 开始，遇 `[` +1）；跟踪 [] 配对避免内嵌数组提前截断
    let mut depth_bracket = 0i32;
    let mut in_str = false;
    let mut i = arr_start;
    while i < bytes.len() {
        let c = bytes[i];
        if in_str {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == b'"' {
                in_str = false;
            }
        } else {
            match c {
                b'"' => in_str = true,
                b'[' => depth_bracket += 1,
                b']' => {
                    depth_bracket -= 1;
                    if depth_bracket == 0 {
                        let arr_text = &html[arr_start..=i];
                        return serde_json::from_str(arr_text).unwrap_or_default();
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    Vec::new()
}
pub fn chaoxing_get_launch_url(req: &crate::ChaoxingLaunchUrlRequest) -> Result<Value, DynError> {
    if let Some(raw) = req
        .launch_url
        .as_ref()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
    {
        return Ok(json!({ "success": true, "launch_url": raw }));
    }
    let course_id = req.course_id.trim();
    let clazz_id = req.clazz_id.trim();
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("course_id 和 clazz_id 不能为空"));
    }
    let chapter_id = req.chapter_id.as_deref().unwrap_or("").trim();
    let knowledge_id = req.knowledge_id.as_deref().unwrap_or("").trim();
    let cpi = req.cpi.as_deref().unwrap_or("").trim();
    let mut url = format!(
        "https://mooc1-api.chaoxing.com/mycourse/studentcourse?courseid={}&clazzid={}&cpi={}&ut=s",
        course_id, clazz_id, cpi
    );
    if !chapter_id.is_empty() || !knowledge_id.is_empty() {
        url = format!(
            "https://mooc1-api.chaoxing.com/mycourse/studentstudy?chapterId={}&courseid={}&clazzid={}&knowledgeid={}&cpi={}&ut=s",
            chapter_id,
            course_id,
            clazz_id,
            knowledge_id,
            cpi
        );
    }
    Ok(json!({ "success": true, "launch_url": url }))
}
// ────────────────────────────────────────────────────────────
// 自动刷课 API —— 超星学习通
// ────────────────────────────────────────────────────────────

const CHAOXING_ENC_SALT: &str = "d_yHJ!$pdA~5";

fn make_chaoxing_enc(
    clazz_id: &str,
    userid: &str,
    jobid: &str,
    object_id: &str,
    playing_time_ms: u64,
    duration_ms: u64,
    clip_time: &str,
) -> String {
    let raw = format!(
        "[{}][{}][{}][{}][{}][{}][{}][{}]",
        clazz_id,
        userid,
        jobid,
        object_id,
        playing_time_ms,
        CHAOXING_ENC_SALT,
        duration_ms,
        clip_time
    );
    format!("{:x}", md5::compute(raw.as_bytes()))
}

/// 从 HTML 中按括号匹配提取 `mArg = {...}`（非贪婪正则会截断嵌套 JSON）
fn extract_balanced_object_after(html: &str, after: usize) -> Option<String> {
    let bytes = html.as_bytes();
    let mut i = after;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b'{' {
        return None;
    }
    let begin = i;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_str = false;
            }
        } else {
            match c {
                '"' => in_str = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(html[begin..=i].to_string());
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

fn extract_m_arg_json(html: &str) -> Option<String> {
    // 多处 mArg / AttachmentSetting；跳过注释或残缺片段
    let keys = ["mArg", "AttachmentSetting", "attachmentSetting"];
    for key in keys {
        let mut search_from = 0usize;
        while let Some(rel) = html[search_from..].find(key) {
            let pos = search_from + rel;
            let after_key = pos + key.len();
            // 允许 mArg = / mArg= / mArg=
            let rest = html.get(after_key..).unwrap_or("");
            let trimmed = rest.trim_start();
            if !trimmed.starts_with('=') {
                search_from = after_key;
                continue;
            }
            let eq_off = rest.len() - trimmed.len();
            let after_eq = after_key + eq_off + 1; // skip '='
            if let Some(obj) = extract_balanced_object_after(html, after_eq) {
                // 必须像 JSON 对象
                if obj.contains("attachments") || obj.contains("defaults") || obj.len() > 40 {
                    return Some(obj);
                }
            }
            search_from = after_key;
        }
    }
    None
}
/// 根据 att_type / module / 文件名推断任务类型
/// att_type 为空时**不得**默认 video：优先扩展名与 module，未知标 unknown
pub fn infer_attachment_kind(att_type: &str, module: &str, name: &str) -> String {
    let t = att_type.trim().to_lowercase();
    let m = module.trim().to_lowercase();
    let n = name.trim().to_lowercase();
    let ext = n
        .rsplit_once('.')
        .map(|(_, e)| e.trim())
        .unwrap_or("")
        .to_string();

    let is_video_ext = matches!(
        ext.as_str(),
        "mp4" | "flv" | "m3u8" | "avi" | "mov" | "wmv" | "mkv" | "webm" | "ts" | "m4v"
    );
    let is_doc_ext = matches!(
        ext.as_str(),
        "pdf"
            | "ppt"
            | "pptx"
            | "doc"
            | "docx"
            | "xls"
            | "xlsx"
            | "txt"
            | "epub"
            | "csv"
            | "rtf"
            | "odt"
            | "wps"
    );

    // 显式 type 优先
    if !t.is_empty() {
        if t.contains("video") || t == "视频" {
            return "video".into();
        }
        if t.contains("doc")
            || t.contains("pdf")
            || t.contains("ppt")
            || t.contains("book")
            || t == "document"
            || t == "文档"
        {
            return "document".into();
        }
        if t.contains("work") || t == "作业" {
            return "work".into();
        }
        if t == "unknown" || t == "task" {
            // 继续用 module/name 细化
        } else {
            return t;
        }
    }

    if m.contains("video") || m.contains("insertvideo") || m == "insertmicrocourse" {
        return "video".into();
    }
    if m.contains("doc")
        || m.contains("pdf")
        || m.contains("ppt")
        || m.contains("book")
        || m.contains("insertbook")
        || m.contains("insertfile")
    {
        return "document".into();
    }
    if m.contains("work") {
        return "work".into();
    }

    if is_video_ext {
        return "video".into();
    }
    if is_doc_ext
        || n.contains(".ppt")
        || n.contains("课件")
        || n.contains("幻灯")
        || n.contains("讲义")
    {
        return "document".into();
    }

    // 无可靠信号：标 unknown，禁止因有 objectId 就当视频
    "unknown".into()
}
/// 从 knowledge/cards HTML 中兜底抠 objectId / jobid
fn scrape_tasks_from_cards_html(html: &str, knowledge_id: &str) -> Vec<Value> {
    let mut tasks = Vec::new();
    let mut seen = HashSet::new();
    // objectid 常见写法
    let re_oid =
        regex::Regex::new(r#"(?i)(?:objectid|objectId|object_id)["'\s:=]+([a-f0-9]{16,})"#).ok();
    let re_job = regex::Regex::new(r#"(?i)(?:jobid|jobId)["'\s:=]+([a-zA-Z0-9_\-]+)"#).ok();
    let re_name = regex::Regex::new(r#""name"\s*:\s*"([^"]{1,120})""#).ok();
    let re_module = regex::Regex::new(r#""module"\s*:\s*"([^"]{1,80})""#).ok();
    let re_type = regex::Regex::new(r#""type"\s*:\s*"([^"]{1,40})""#).ok();

    if let Some(re) = re_oid {
        for (idx, cap) in re.captures_iter(html).enumerate() {
            let oid = cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
            if oid.is_empty() || !seen.insert(oid.clone()) {
                continue;
            }
            let jobid = re_job
                .as_ref()
                .and_then(|rj| rj.captures_iter(html).nth(idx))
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                .unwrap_or_default();
            let name = re_name
                .as_ref()
                .and_then(|rn| rn.captures_iter(html).nth(idx))
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                .unwrap_or_else(|| format!("任务 {}", idx + 1));
            let module = re_module
                .as_ref()
                .and_then(|rm| rm.captures_iter(html).nth(idx))
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                .unwrap_or_default();
            let att_type = re_type
                .as_ref()
                .and_then(|rt| rt.captures_iter(html).nth(idx))
                .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
                .unwrap_or_default();
            let kind = infer_attachment_kind(&att_type, &module, &name);
            let module_out = if module.is_empty() {
                "unknown".to_string()
            } else {
                module
            };
            tasks.push(json!({
                "id": if jobid.is_empty() { format!("{knowledge_id}-{idx}") } else { jobid.clone() },
                "title": name,
                "name": name,
                "type": kind.clone(),
                "task_type": kind,
                "objectId": oid.clone(),
                "object_id": oid,
                "jobid": jobid,
                "module": module_out,
                "otherInfo": "",
                "attDuration": "0",
                "attDurationEnc": "",
                "videoFaceCaptureEnc": "",
                "isPassed": false,
                "completed": false,
                "status": "未完成",
            }));
            if tasks.len() >= 30 {
                break;
            }
        }
    }
    tasks
}
pub(crate) fn json_str_field(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
        // 数字 id 也兼容
        if let Some(n) = v.get(*k).and_then(|x| x.as_i64()) {
            return n.to_string();
        }
        if let Some(n) = v.get(*k).and_then(|x| x.as_u64()) {
            return n.to_string();
        }
    }
    String::new()
}

fn json_str_pointer(v: &Value, paths: &[&str]) -> String {
    for p in paths {
        if let Some(s) = v.pointer(p).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
        if let Some(n) = v.pointer(p).and_then(|x| x.as_i64()) {
            return n.to_string();
        }
    }
    String::new()
}

fn prefer_https_url(url: &str) -> String {
    let t = url.trim();
    if t.starts_with("http://") {
        format!("https://{}", &t[7..])
    } else {
        t.to_string()
    }
}

fn collect_play_urls(data: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let push = |list: &mut Vec<String>, raw: &str| {
        let u = prefer_https_url(raw);
        if u.is_empty() || !u.starts_with("http") {
            return;
        }
        if !list.iter().any(|x| x == &u) {
            list.push(u);
        }
    };
    // 优先高清 / https 直链
    for key in [
        "https", "hd", "http", "download", "play_url", "url", "mp3", "cdn", "sd",
    ] {
        if let Some(s) = data.get(key).and_then(|v| v.as_str()) {
            push(&mut out, s);
        }
    }
    out
}
/// 获取章节知识卡片（含视频任务列表）
pub async fn chaoxing_get_knowledge_cards(
    client: &HbutClient,
    clazz_id: &str,
    course_id: &str,
    knowledge_id: &str,
    cpi: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    if knowledge_id.trim().is_empty() {
        return Err(err_box("knowledge_id 为空"));
    }

    // mooc1 域需要从其它域传播 cookie
    propagate_chaoxing_key_cookies(client);

    let study_referer = format!(
        "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudy?chapterId={knowledge_id}&courseId={course_id}&clazzid={clazz_id}&cpi={cpi}&mooc2=1"
    );

    // 预热学生页（部分课程要先打开 studentstudy 才出 mArg）
    let _ = client
        .client
        .get(&study_referer)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    let card_bases = [
        "https://mooc1.chaoxing.com/mooc-ans/knowledge/cards",
        "https://mooc1.chaoxing.com/knowledge/cards",
        "https://mooc1-api.chaoxing.com/knowledge/cards",
    ];

    let mut all_attachments: Vec<Value> = Vec::new();
    let mut defaults = json!({});
    let mut pages_fetched = 0u32;
    let mut last_html = String::new();
    let mut used_base = card_bases[0].to_string();

    'bases: for base in card_bases {
        all_attachments.clear();
        defaults = json!({});
        for num in 0..16 {
            let num_s = num.to_string();
            let resp = match client
                .client
                .get(base)
                .query(&[
                    ("clazzid", clazz_id),
                    ("courseid", course_id),
                    ("knowledgeid", knowledge_id),
                    ("num", num_s.as_str()),
                    ("ut", "s"),
                    ("cpi", cpi),
                    ("v", "2025-0424-1038-3"),
                    ("mooc2", "1"),
                    ("isMicroCourse", "false"),
                    ("editorPreview", "0"),
                ])
                .header("Referer", &study_referer)
                .header(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                )
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .timeout(Duration::from_secs(15))
                .send()
                .await
            {
                Ok(r) => r,
                Err(_) => break,
            };
            let html = resp.text().await.unwrap_or_default();
            pages_fetched += 1;
            last_html = html.clone();
            used_base = base.to_string();

            let Some(marg_json) = extract_m_arg_json(&html) else {
                if num == 0 {
                    break; // 换下一个 base
                }
                break;
            };
            let marg: Value = match serde_json::from_str(&marg_json) {
                Ok(v) => v,
                Err(_) => {
                    if num == 0 {
                        break;
                    }
                    break;
                }
            };

            if num == 0 {
                defaults = marg.get("defaults").cloned().unwrap_or_else(|| json!({}));
            }
            let page_atts = marg
                .get("attachments")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            if page_atts.is_empty() {
                // num=0 无附件也算成功解析，停止翻页
                break;
            }
            for att in page_atts {
                all_attachments.push(att);
            }
        }
        if !all_attachments.is_empty()
            || !defaults.is_null() && defaults.as_object().map(|o| !o.is_empty()).unwrap_or(false)
        {
            break 'bases;
        }
    }

    let report_url = json_str_field(&defaults, &["reportUrl", "report_url"]);
    let fid = json_str_field(&defaults, &["fid"]);
    let userid = json_str_field(&defaults, &["userid", "userId", "uid"]);
    let clazz_from_def = json_str_field(&defaults, &["clazzId", "clazzid", "classId"]);
    let clazz_out = if clazz_from_def.is_empty() {
        clazz_id.to_string()
    } else {
        clazz_from_def
    };

    let mut videos = Vec::new();
    let mut tasks = Vec::new();
    for (idx, att) in all_attachments.iter().enumerate() {
        let jobid = json_str_field(att, &["jobid", "jobId", "job_id"]);
        let att_type = json_str_field(att, &["type", "attachmentType"]);
        let object_id = {
            let a = json_str_field(att, &["objectId", "objectid", "object_id"]);
            if !a.is_empty() {
                a
            } else {
                json_str_pointer(
                    att,
                    &[
                        "/property/objectid",
                        "/property/objectId",
                        "/property/object_id",
                        "/property/mid",
                    ],
                )
            }
        };
        let name = {
            let n = json_str_pointer(att, &["/property/name", "/property/title"]);
            if n.is_empty() {
                json_str_field(att, &["name", "title"])
            } else {
                n
            }
        };
        let module = json_str_pointer(att, &["/property/module", "/property/type"]);
        let other_info = json_str_field(att, &["otherInfo", "other_info"]);
        let att_duration = att
            .get("attDuration")
            .map(|v| match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => "0".into(),
            })
            .unwrap_or_else(|| "0".into());
        let att_duration_enc = json_str_field(att, &["attDurationEnc", "att_duration_enc"]);
        let video_face_capture_enc =
            json_str_field(att, &["videoFaceCaptureEnc", "video_face_capture_enc"]);
        let is_passed = att
            .get("isPassed")
            .and_then(|v| v.as_bool())
            .or_else(|| att.get("ispassed").and_then(|v| v.as_bool()))
            .or_else(|| att.get("passed").and_then(|v| v.as_bool()))
            .unwrap_or(false);

        // 以后端 type/module/文件名为准；有 objectId 也不默认 video
        let kind = infer_attachment_kind(&att_type, &module, &name);

        let task = json!({
            "id": if !jobid.is_empty() { jobid.clone() } else { format!("{knowledge_id}-{idx}") },
            "title": if name.is_empty() { format!("任务 {}", idx + 1) } else { name.clone() },
            "name": name,
            "type": kind.clone(),
            "task_type": kind.clone(),
            "objectId": object_id.clone(),
            "object_id": object_id,
            "jobid": jobid,
            "module": module,
            "otherInfo": other_info,
            "attDuration": att_duration,
            "attDurationEnc": att_duration_enc,
            "videoFaceCaptureEnc": video_face_capture_enc,
            "isPassed": is_passed,
            "completed": is_passed,
            "status": if is_passed { "已完成" } else { "未完成" },
        });

        if kind == "video" {
            videos.push(task.clone());
        }
        tasks.push(task);
    }

    // mArg 无附件：从 HTML 兜底抠 objectId
    if tasks.is_empty() && !last_html.is_empty() {
        let scraped = scrape_tasks_from_cards_html(&last_html, knowledge_id);
        for t in scraped {
            if t.get("type").and_then(|v| v.as_str()) == Some("video") {
                videos.push(t.clone());
            }
            tasks.push(t);
        }
    }

    // 仍无任务：给一个可读占位，避免前端整页空白
    if tasks.is_empty() {
        tasks.push(json!({
            "id": format!("{knowledge_id}-page"),
            "title": "本小节暂无视频任务点",
            "name": "本小节暂无视频任务点",
            "type": "task",
            "task_type": "task",
            "objectId": "",
            "object_id": "",
            "jobid": "",
            "module": "",
            "otherInfo": "",
            "attDuration": "0",
            "attDurationEnc": "",
            "videoFaceCaptureEnc": "",
            "isPassed": false,
            "completed": false,
            "status": "无可播放任务",
            "empty_hint": true,
        }));
    }

    Ok(json!({
        "success": true,
        "reportUrl": report_url,
        "report_url": report_url,
        "userid": userid,
        "clazzId": clazz_out.clone(),
        "clazz_id": clazz_out,
        "fid": fid,
        "knowledge_id": knowledge_id,
        "course_id": course_id,
        "cpi": cpi,
        "pages_fetched": pages_fetched,
        "card_base": used_base,
        "videos": videos,
        "tasks": tasks,
        "attachments": tasks,
        "raw_defaults": defaults,
    }))
}
/// 课程成绩组成 + 当前得分（stat2 study-data）
pub async fn chaoxing_fetch_course_score(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    if course_id.trim().is_empty() || clazz_id.trim().is_empty() {
        return Err(err_box("课程参数不完整（courseId/clazzId）"));
    }
    // 先打开统计页拿 pEnc
    let index_url = format!(
        "https://stat2-ans.chaoxing.com/study-data/index?courseid={course_id}&clazzid={clazz_id}&cpi={cpi}&ut=s"
    );
    let index_html = client
        .client
        .get(&index_url)
        .header("Referer", "https://mooc1.chaoxing.com/")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .timeout(Duration::from_secs(20))
        .send()
        .await?
        .text()
        .await?;

    // 多种 pEnc 写法兼容
    let penc = [
        r#"id="pEnc"\s+value="([a-fA-F0-9]{32})""#,
        r#"id='pEnc'\s+value='([a-fA-F0-9]{32})'"#,
        r#"name="pEnc"\s+value="([a-fA-F0-9]{32})""#,
        r#"pEnc["']?\s*[:=]\s*["']([a-fA-F0-9]{32})["']"#,
        r#"pEnc=([a-fA-F0-9]{32})"#,
    ]
    .iter()
    .find_map(|pat| {
        regex::Regex::new(pat)
            .ok()
            .and_then(|re| re.captures(&index_html))
            .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
    })
    .unwrap_or_default();

    if penc.is_empty() {
        // 无权限时页面可能是登录跳转或空壳
        let hint = if index_html.contains("login") || index_html.contains("passport") {
            "成绩页需要重新桥接学习通会话，请退出后重新登录门户"
        } else if index_html.len() < 80 {
            "成绩统计页返回为空，课程可能未开通统计"
        } else {
            "未能解析成绩页凭证 pEnc，请确认课程已开通学情统计"
        };
        return Err(err_box(hint));
    }

    let score_url = format!(
        "https://stat2-ans.chaoxing.com/stat2/study-data/score?clazzid={clazz_id}&courseid={course_id}&cpi={cpi}&ut=s&pEnc={penc}&fromData=false"
    );
    let job_url = format!(
        "https://stat2-ans.chaoxing.com/stat2/study-data/job?clazzid={clazz_id}&courseid={course_id}&cpi={cpi}&ut=s&pEnc={penc}"
    );

    let score_resp = client
        .client
        .get(&score_url)
        .header("Referer", &index_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let score_json = read_json_response(score_resp, "成绩接口失败").await?;

    let job_json = match client
        .client
        .get(&job_url)
        .header("Referer", &index_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await
    {
        Ok(r) => read_json_response(r, "任务统计失败").await.ok(),
        Err(_) => None,
    };

    let data = score_json
        .get("data")
        .cloned()
        .unwrap_or(score_json.clone());
    let score = data.get("score").cloned().unwrap_or(json!({}));
    let weight = data.get("weight").cloned().unwrap_or(json!({}));
    let weight_list = data.get("weightList").cloned().unwrap_or_else(|| json!([]));

    // weightList 可能为空时，用 weight 对象拼一份
    let weight_list = if weight_list.as_array().map(|a| a.is_empty()).unwrap_or(true) {
        let mut list = Vec::new();
        for (key, label) in [
            ("work", "作业"),
            ("test", "考试"),
            ("video", "视频"),
            ("attend", "签到"),
            ("bbs", "讨论"),
            ("live", "直播"),
            ("read", "阅读"),
            ("task", "任务点"),
        ] {
            if let Some(v) = weight.get(key) {
                list.push(json!({ "name": label, "key": key, "value": v }));
            }
        }
        json!(list)
    } else {
        weight_list
    };

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "p_enc": penc,
        "total_score": score.get("score").cloned().unwrap_or(json!(null)),
        "user_name": score.get("userName").cloned().unwrap_or(json!(null)),
        "score": score,
        "weight": weight,
        "weight_list": weight_list,
        "job": job_json.and_then(|v| v.get("data").cloned()),
        "show_score": data.get("showScore").and_then(|v| v.as_bool()).unwrap_or(true),
    }))
}
/// 构造 ananas status 候选 URL（纯函数，单测覆盖）
pub fn chaoxing_video_status_candidate_urls(
    object_id: &str,
    fid: &str,
    ts_ms: &str,
) -> Vec<String> {
    let oid = object_id.trim();
    let fid_s = if fid.trim().is_empty() {
        "0"
    } else {
        fid.trim()
    };
    let ts = if ts_ms.trim().is_empty() {
        "0"
    } else {
        ts_ms.trim()
    };
    vec![
        format!("https://mooc1.chaoxing.com/ananas/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!(
            "https://mooc1-api.chaoxing.com/ananas/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"
        ),
        format!("https://mooc1.chaoxing.com/ananas/status/{oid}?flag=normal&_dc={ts}"),
        format!("https://s1.ananas.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://s2.ananas.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://s3.ananas.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://cloud1-0.cldisk.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
        format!("https://noteyd.chaoxing.com/status/{oid}?k={fid_s}&flag=normal&_dc={ts}"),
    ]
}
/// 获取视频文件状态（dtoken、duration、播放直链 http/https）
pub async fn chaoxing_get_video_status(
    client: &HbutClient,
    object_id: &str,
    fid: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let oid = object_id.trim();
    if oid.is_empty() {
        return Err(err_box("object_id 为空"));
    }
    let fid_s = if fid.trim().is_empty() {
        "0"
    } else {
        fid.trim()
    };
    let ts = chrono::Utc::now().timestamp_millis().to_string();
    // 依次尝试不同域名 / 参数，提高成功率
    // 预热学习通 cookie 到 ananas/mooc 域
    propagate_chaoxing_key_cookies(client);
    let _ = client
        .client
        .get("https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642")
        .header("Referer", "https://mooc1.chaoxing.com/")
        .timeout(Duration::from_secs(8))
        .send()
        .await;

    let candidates = chaoxing_video_status_candidate_urls(oid, fid_s, &ts);
    let mut last_err = String::new();
    for url in candidates {
        let resp = match client
            .client
            .get(&url)
            .header(
                "Referer",
                "https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642",
            )
            .header("Origin", "https://mooc1.chaoxing.com")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("X-Requested-With", "XMLHttpRequest")
            .header(
                "User-Agent",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ChaoXingStudy/3.2.0",
            )
            .timeout(Duration::from_secs(15))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };
        match read_json_response(resp, "获取视频状态失败").await {
            Ok(data) => {
                // status 字段可能是 "success" / "failed"
                let status = data
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_lowercase();
                if status == "failed" || status == "error" {
                    last_err = format!(
                        "status={status}: {}",
                        data.get("msg")
                            .or_else(|| data.get("message"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("视频状态失败")
                    );
                    continue;
                }

                let play_urls = collect_play_urls(&data);
                // 官方 ananas 播放器页：直链被 CDN 拒时可由前端 iframe 兜底
                let player_url = format!(
                    "https://mooc1.chaoxing.com/ananas/modules/video/index.html?objectid={oid}&fid={fid_s}&isPhone=true"
                );
                let mut out = data.clone();
                if let Some(obj) = out.as_object_mut() {
                    if let Some(first) = play_urls.first() {
                        obj.insert("play_url".into(), json!(first));
                        // 统一把 http 字段写成 https 优先，方便前端 <video>
                        obj.insert("http".into(), json!(first));
                    }
                    obj.insert("play_urls".into(), json!(play_urls.clone()));
                    obj.insert("player_url".into(), json!(player_url.clone()));
                }
                if play_urls.is_empty() && status != "success" && status.is_empty() {
                    last_err = "响应无播放地址".into();
                    continue;
                }
                return Ok(json!({
                    "success": true,
                    "data": out,
                    "play_url": play_urls.first().cloned().unwrap_or_default(),
                    "play_urls": play_urls,
                    "player_url": player_url,
                }));
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(err_box(format!("获取视频状态失败：{last_err}")))
}
/// 上报超星视频观看进度
pub async fn chaoxing_report_progress(
    client: &HbutClient,
    report_url: &str,
    dtoken: &str,
    clazz_id: &str,
    object_id: &str,
    jobid: &str,
    userid: &str,
    other_info: &str,
    playing_time: u64,
    duration: u64,
    isdrag: u8,
    video_face_capture_enc: &str,
    att_duration: &str,
    att_duration_enc: &str,
) -> Result<Value, DynError> {
    if !has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let clip_time = format!("0_{}", duration);
    let enc = make_chaoxing_enc(
        clazz_id,
        userid,
        jobid,
        object_id,
        playing_time * 1000,
        duration * 1000,
        &clip_time,
    );
    let ts = chrono::Utc::now().timestamp_millis();
    // otherInfo 含 &courseId=xxx 作为 query param 的一部分（不能被 URL 编码）
    let url = format!(
        "{}/{}?clazzId={}&playingTime={}&duration={}&clipTime={}&objectId={}&otherInfo={}&jobid={}&userid={}&isdrag={}&view=pc&enc={}&rt=0.9&videoFaceCaptureEnc={}&dtype=Video&_t={}&attDuration={}&attDurationEnc={}&courseEngineInfo=false",
        report_url, dtoken, clazz_id, playing_time, duration, clip_time, object_id,
        other_info, jobid, userid, isdrag, enc, video_face_capture_enc, ts, att_duration, att_duration_enc
    );
    let resp = client
        .client
        .get(&url)
        .header(
            "Referer",
            "https://mooc1.chaoxing.com/ananas/modules/video/index.html?v=2026-0327-1642",
        )
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "进度上报失败").await?;
    Ok(json!({
        "success": true,
        "data": data,
    }))
}

#[cfg(test)]
mod attachment_tests {
    use super::*;

    #[test]
    fn video_status_urls_cover_mooc_and_ananas() {
        let urls = chaoxing_video_status_candidate_urls("obj123", "16820", "99");
        assert!(urls.len() >= 5);
        assert!(urls
            .iter()
            .any(|u| u.contains("mooc1.chaoxing.com/ananas/status/obj123")));
        assert!(urls
            .iter()
            .any(|u| u.contains("s1.ananas.chaoxing.com/status/obj123")));
        assert!(urls.iter().all(|u| u.contains("_dc=99")));
    }
    #[test]
    fn infer_attachment_kind_does_not_default_object_to_video() {
        assert_eq!(infer_attachment_kind("video", "", ""), "video");
        assert_eq!(infer_attachment_kind("document", "", ""), "document");
        assert_eq!(
            infer_attachment_kind("", "insertbook", "课件.pptx"),
            "document"
        );
        assert_eq!(infer_attachment_kind("", "", "第1章 绪论.pdf"), "document");
        assert_eq!(
            infer_attachment_kind("", "insertvideo", "讲解.mp4"),
            "video"
        );
        // 仅有 objectId 场景：att_type/module/name 皆空 → unknown，禁止 video
        assert_eq!(infer_attachment_kind("", "", ""), "unknown");
        assert_eq!(infer_attachment_kind("", "", "未命名资源"), "unknown");
    }
    #[test]
    fn parse_cards_attachments_extracts_array() {
        // 模拟 knowledge/cards 的 mArg（attachments 数组）
        let html = r#"<html>mArg = {"hiddenConfig":false,"attachments":[
            {"otherInfo":"nodeId_1-cpi_1","isPassed":false,"type":"video","property":{"name":"a.mp4"}},
            {"otherInfo":"nodeId_2-cpi_1","isPassed":true,"type":"document","job":true}
        ],"coursename":"x"};</html>"#;
        let atts = parse_cards_attachments(html);
        assert_eq!(atts.len(), 2);
        assert!(!atts[0]["isPassed"].as_bool().unwrap_or(true));
        assert!(atts[1]["isPassed"].as_bool().unwrap_or(false));
        assert_eq!(atts[1]["type"], "document");
    }

    #[test]
    fn parse_cards_attachments_handles_escaped_and_no_marker() {
        // 含转义引号与嵌套
        let html = r#"<html>mArg = {"attachments":[{"otherInfo":"a\"b","isPassed":true}]};</html>"#;
        let atts = parse_cards_attachments(html);
        assert_eq!(atts.len(), 1);
        assert!(atts[0]["isPassed"].as_bool().unwrap_or(false));
        // 无 attachments 标记
        assert!(parse_cards_attachments("<html>mArg = {};</html>").is_empty());
        assert!(parse_cards_attachments("").is_empty());
    }

    #[test]
    fn parse_cards_attachments_handles_nested_arrays() {
        // 附件含内嵌数组字段（如 jumpTimePointList:[]），不得提前截断
        let html = r#"<html>mArg = {"attachments":[
            {"otherInfo":"n1","isPassed":false,"jumpTimePointList":[],"randomFaceCaptureTimeList":[],"type":"video"},
            {"otherInfo":"n2","isPassed":true,"type":"document"}
        ]};</html>"#;
        let atts = parse_cards_attachments(html);
        assert_eq!(atts.len(), 2, "内嵌数组不应导致提前截断: {:?}", atts);
        assert!(!atts[0]["isPassed"].as_bool().unwrap_or(true));
        assert!(atts[1]["isPassed"].as_bool().unwrap_or(false));
    }
}
