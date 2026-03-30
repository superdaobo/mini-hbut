use std::collections::HashMap;
use std::error::Error;
use std::io;

use serde_json::{json, Value};

use tokio::time::{sleep, Duration};

use crate::http_client::HbutClient;

type DynError = Box<dyn Error + Send + Sync>;

fn now_sync_time() -> String {
    chrono::Local::now().to_rfc3339()
}

fn err_box(message: impl Into<String>) -> DynError {
    Box::new(io::Error::other(message.into()))
}

fn with_sync_fields(mut payload: Value) -> Value {
    let sync_time = now_sync_time();
    match payload {
        Value::Object(ref mut map) => {
            map.insert("sync_time".to_string(), Value::String(sync_time));
            map.insert("offline".to_string(), Value::Bool(false));
        }
        _ => {
            payload = json!({
                "data": payload,
                "sync_time": sync_time,
                "offline": false,
            });
        }
    }
    payload
}

fn academic_referer(base: &str) -> String {
    format!("{}/frontend/views/student/xkPage/index.html", base)
}

fn default_from(input: Option<&str>) -> String {
    input
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("ggxxk")
        .to_string()
}

fn as_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(v)) => v.trim().to_string(),
        Some(Value::Number(v)) => v.to_string(),
        Some(Value::Bool(v)) => {
            if *v {
                "true".to_string()
            } else {
                "false".to_string()
            }
        }
        Some(Value::Null) | None => String::new(),
        Some(other) => other.as_str().unwrap_or_default().trim().to_string(),
    }
}

fn get_string(value: &Value, key: &str) -> String {
    as_string(value.get(key))
}

fn boolish(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(v)) => *v,
        Some(Value::Number(v)) => v.as_i64().unwrap_or_default() != 0,
        Some(Value::String(v)) => {
            let normalized = v.trim().to_ascii_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "y")
        }
        _ => false,
    }
}

fn normalize_text(input: &str) -> String {
    let mut text = input
        .replace("<br />", " / ")
        .replace("<br/>", " / ")
        .replace("<br>", " / ")
        .replace("<BR />", " / ")
        .replace("<BR/>", " / ")
        .replace("<BR>", " / ")
        .replace("&nbsp;", " ")
        .replace('\\', " / ");

    while text.contains("  ") {
        text = text.replace("  ", " ");
    }
    while text.contains(" /  / ") {
        text = text.replace(" /  / ", " / ");
    }

    text.trim().trim_matches('/').trim().to_string()
}

fn is_online_course(schedule: &str) -> bool {
    let normalized = normalize_text(schedule);
    if normalized.is_empty() || normalized == "--/--" {
        return true;
    }
    let has_time_or_room = normalized.contains("星期")
        || normalized.contains("【")
        || normalized.contains("第")
        || normalized.contains("节");
    !has_time_or_room
}

fn is_login_expired(final_url: &str, body: &str) -> bool {
    final_url.contains("authserver/login")
        || final_url.contains("/login?")
        || body.contains("authserver/login")
}

fn response_msg(payload: &Value, fallback: &str) -> String {
    let mut candidates = vec![
        get_string(payload, "msg"),
        get_string(payload, "message"),
        get_string(payload, "error"),
        get_string(payload, "errorMessage"),
        get_string(payload, "errmsg"),
    ];

    if let Some(data) = payload.get("data") {
        candidates.push(as_string(Some(data)));
        if let Value::Object(map) = data {
            for key in ["msg", "message", "error", "errorMessage", "errmsg"] {
                candidates.push(as_string(map.get(key)));
            }
        }
    }

    candidates
        .into_iter()
        .map(|item| item.trim().to_string())
        .find(|item| !item.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn default_conditions() -> Value {
    json!({
        "kcgsList": [],
        "kcxzList": [],
        "kclxList": [],
        "kkxqList": [],
        "jxmsList": [],
        "kclbList": [],
    })
}

fn build_student_payload(data: &Value) -> Value {
    json!({
        "student_id": get_string(data, "xsxh"),
        "student_name": get_string(data, "xsxm"),
        "semester": get_string(data, "xkxnxq"),
        "show_go_home": get_string(data, "showGoHome"),
        "has_no_teaching_class": boolish(data.get("sfwjxb")),
    })
}

fn build_conditions_payload(data: &Value) -> Value {
    json!({
        "kcgsList": data.get("kcgsList").cloned().unwrap_or_else(|| json!([])),
        "kcxzList": data.get("kcxzList").cloned().unwrap_or_else(|| json!([])),
        "kclxList": data.get("kclxList").cloned().unwrap_or_else(|| json!([])),
        "kkxqList": data.get("kkxqList").cloned().unwrap_or_else(|| json!([])),
        "jxmsList": data.get("jxmsList").cloned().unwrap_or_else(|| json!([])),
        "kclbList": data.get("kclbList").cloned().unwrap_or_else(|| json!([])),
    })
}

fn extract_tabs_from_list_v2(data: &Value) -> Vec<Value> {
    data.get("mapsList")
        .and_then(|value| value.as_array())
        .map(|items| items.iter().map(normalize_tab).collect::<Vec<_>>())
        .unwrap_or_default()
}

fn extract_tabs_from_show_tab(payload: &Value) -> Vec<Value> {
    payload
        .get("extend")
        .and_then(|value| value.get("mapsList"))
        .and_then(|value| value.as_array())
        .map(|items| items.iter().map(normalize_tab).collect::<Vec<_>>())
        .unwrap_or_default()
}

fn has_valid_pcencs(value: &Value) -> bool {
    value
        .as_object()
        .map(|items| !items.is_empty())
        .unwrap_or(false)
}

async fn fetch_list_v2_raw(client: &HbutClient, base: &str, referer: &str) -> Result<Value, DynError> {
    let url = format!("{}/admin/xsd/xk/listV2", base);

    // 第一次：空 body（与 Python _post_form({}) 一致，必须带 Content-Type）
    let resp = client
        .client
        .post(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header("Origin", base)
        .header("Referer", referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .body(String::new())
        .send()
        .await?;

    let raw = read_json_response(resp, "获取选课总览失败").await?;
    if raw.is_object() {
        return Ok(raw);
    }

    // 第二次：带 from 参数重试（对齐 Python detect_base_and_fetch_overview 逻辑）
    let resp2 = client
        .client
        .post(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header("Origin", base)
        .header("Referer", referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&[("from", "ggxxk")])
        .send()
        .await?;

    read_json_response(resp2, "获取选课总览失败").await
}

async fn fetch_show_tab_raw(client: &HbutClient, base: &str, referer: &str) -> Result<Value, DynError> {
    let url = format!("{}/admin/xsd/xk/getShowTab", base);
    let resp = client
        .client
        .get(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await?;

    read_json_response(resp, "获取选课批次失败").await
}

fn normalize_tab(item: &Value) -> Value {
    json!({
        "xkgzid": get_string(item, "xkgzid"),
        "xkgzMc": get_string(item, "xkgzMc"),
        "xkPromptMessage": get_string(item, "xkPromptMessage"),
        "sfkxk": get_string(item, "sfkxk"),
        "sfkzjxbrl": get_string(item, "sfkzjxbrl"),
        "type": get_string(item, "type"),
        "kklx": get_string(item, "kklx"),
        "time": get_string(item, "time"),
    })
}

fn normalize_course(item: &Value) -> Value {
    let schedule = normalize_text(&get_string(item, "sksjdd"));
    let teacher = normalize_text(&get_string(item, "teacher"));
    let child_ids = get_string(item, "childJxbIds");
    let has_child_classes = boolish(item.get("sfyzjxb")) || !child_ids.is_empty();
    json!({
        "id": get_string(item, "id"),
        "source_id": get_string(item, "id"),
        "jxbmc": get_string(item, "jxbmc"),
        "kcmc": get_string(item, "kcmc"),
        "xf": get_string(item, "xf"),
        "teacher": teacher,
        "sksjdd": schedule,
        "sksjddstr": get_string(item, "sksjddstr"),
        "yxrl": get_string(item, "yxrl"),
        "status": get_string(item, "status"),
        "sfkxk": get_string(item, "sfkxk"),
        "sfct": get_string(item, "sfct"),
        "kkxqmc": get_string(item, "kkxqmc"),
        "kcxz": get_string(item, "kcxz"),
        "kclbname": get_string(item, "kclbname"),
        "kcjj": get_string(item, "kcjj"),
        "jxbzc": get_string(item, "jxbzc"),
        "label": get_string(item, "label"),
        "childJxbIds": child_ids,
        "kclx": get_string(item, "kclx"),
        "jxms": get_string(item, "jxms"),
        "ksxs": get_string(item, "ksxs"),
        "is_online": is_online_course(&schedule),
        "has_child_classes": has_child_classes,
    })
}

fn normalize_child_class(item: &Value) -> Value {
    let id = ["id", "jxbid", "fjxbid", "zjxbid"]
        .iter()
        .map(|key| get_string(item, key))
        .find(|value| !value.is_empty())
        .unwrap_or_default();
    let name = ["name", "jxbmc", "fjxbmc", "zjxbmc"]
        .iter()
        .map(|key| get_string(item, key))
        .find(|value| !value.is_empty())
        .unwrap_or_default();
    let teacher = ["teacher", "jsmc", "skjs"]
        .iter()
        .map(|key| normalize_text(&get_string(item, key)))
        .find(|value| !value.is_empty())
        .unwrap_or_default();
    let schedule = ["sksjdd", "schedule", "sksjddstr"]
        .iter()
        .map(|key| normalize_text(&get_string(item, key)))
        .find(|value| !value.is_empty())
        .unwrap_or_default();

    json!({
        "id": id,
        "name": name,
        "teacher": teacher,
        "schedule": schedule,
        "raw": item,
    })
}

fn parse_child_classes(payload: &Value) -> Vec<Value> {
    if let Some(items) = payload.as_array() {
        return items.iter().map(normalize_child_class).collect();
    }

    if let Some(items) = payload.get("data").and_then(|value| value.as_array()) {
        return items.iter().map(normalize_child_class).collect();
    }

    if let Some(items) = payload
        .get("extend")
        .and_then(|value| value.get("xsjhxkDTOS"))
        .and_then(|value| value.as_array())
    {
        return items.iter().map(normalize_child_class).collect();
    }

    Vec::new()
}

fn countdown_text(seconds: i64) -> String {
    if seconds <= 0 {
        return "已结束".to_string();
    }
    let days = seconds / 86_400;
    let hours = (seconds % 86_400) / 3_600;
    let minutes = (seconds % 3_600) / 60;
    let secs = seconds % 60;

    let mut parts = Vec::new();
    if days > 0 {
        parts.push(format!("{}天", days));
    }
    if hours > 0 {
        parts.push(format!("{}小时", hours));
    }
    if minutes > 0 {
        parts.push(format!("{}分钟", minutes));
    }
    if secs > 0 || parts.is_empty() {
        parts.push(format!("{}秒", secs));
    }
    parts.join("")
}

async fn read_json_response(resp: reqwest::Response, fallback: &str) -> Result<Value, DynError> {
    let status = resp.status();
    let final_url = resp.url().to_string();
    let text = resp.text().await?;

    if is_login_expired(&final_url, &text) {
        return Err(err_box("会话已过期，请重新登录"));
    }
    if !status.is_success() {
        return Err(err_box(format!("{}（HTTP {}）", fallback, status.as_u16())));
    }

    serde_json::from_str::<Value>(&text).map_err(|_| err_box(format!("{}：响应解析失败", fallback)))
}

async fn read_text_response(resp: reqwest::Response, fallback: &str) -> Result<String, DynError> {
    let status = resp.status();
    let final_url = resp.url().to_string();
    let text = resp.text().await?;

    if is_login_expired(&final_url, &text) {
        return Err(err_box("会话已过期，请重新登录"));
    }
    if !status.is_success() {
        return Err(err_box(format!("{}（HTTP {}）", fallback, status.as_u16())));
    }
    Ok(text)
}

pub async fn fetch_course_selection_overview(client: &HbutClient) -> Result<Value, DynError> {
    let base = client.academic_base_url();
    let referer = academic_referer(base);

    // 预热选课 session，与 Python 原始爬虫 _bootstrap_selection_session 一致
    let warmup_urls = [
        format!("{}/admin/", base),
        format!("{}/admin/xsd/xkgl/xsdxk", base),
        referer.clone(),
    ];
    for warmup_url in &warmup_urls {
        let _ = client
            .client
            .get(warmup_url)
            .header("Accept", "text/html, application/xhtml+xml, */*")
            .header("Referer", base)
            .send()
            .await;
    }

    let mut data = json!({});
    let mut tabs = Vec::new();
    let mut pcencs = json!({});
    let mut conditions = default_conditions();
    let mut student = build_student_payload(&data);
    let mut last_msg = String::from("获取成功");
    let mut is_empty = false;
    let mut has_full_overview = false;

    for attempt in 0..3 {
        let raw = fetch_list_v2_raw(client, base, &referer).await?;
        let ret = raw.get("ret").and_then(|v| v.as_i64()).unwrap_or_default();
        let msg = response_msg(&raw, "获取成功");
        let empty = ret == -1 && msg.contains("没有可选的教学班");
        println!("[选课调试] overview attempt={}, ret={}, msg={}, empty={}", attempt, ret, msg, empty);
        if ret != 0 && !empty {
            return Err(err_box(msg));
        }

        let next_data = raw.get("data").cloned().unwrap_or_else(|| json!({}));
        let next_tabs = extract_tabs_from_list_v2(&next_data);
        let next_pcencs = next_data.get("pcencs").cloned().unwrap_or_else(|| json!({}));
        let pcenc_keys: Vec<_> = next_pcencs.as_object().map(|m| m.keys().collect::<Vec<_>>()).unwrap_or_default();
        println!("[选课调试] overview attempt={}: tabs={}, pcenc_keys={:?}", attempt, next_tabs.len(), pcenc_keys);

        data = next_data;
        tabs = next_tabs;
        pcencs = next_pcencs;
        conditions = build_conditions_payload(&data);
        student = build_student_payload(&data);
        last_msg = msg;
        is_empty = empty;
        has_full_overview = !tabs.is_empty() && has_valid_pcencs(&pcencs);

        if has_full_overview {
            break;
        }

        if attempt < 2 {
            sleep(Duration::from_millis(220)).await;
        }
    }

    if tabs.is_empty() {
        let show_tab = fetch_show_tab_raw(client, base, &referer).await?;
        let fallback_tabs = extract_tabs_from_show_tab(&show_tab);
        if !fallback_tabs.is_empty() {
            tabs = fallback_tabs;
        }
    }

    let message = if is_empty {
        "当前暂无可选课程".to_string()
    } else if !tabs.is_empty() && !has_valid_pcencs(&pcencs) {
        "选课批次已加载，正在等待凭证初始化，请稍后重试".to_string()
    } else {
        last_msg
    };

    Ok(with_sync_fields(json!({
        "student": student,
        "tabs": tabs,
        "conditions": conditions,
        "pcencs": pcencs,
        "has_valid_pcencs": has_full_overview,
        "empty": is_empty,
        "message": message,
    })))
}

pub async fn fetch_course_selection_list(
    client: &HbutClient,
    req: &crate::CourseSelectionListRequest,
) -> Result<Value, DynError> {
    if req.pcid.trim().is_empty() {
        return Err(err_box("pcid 不能为空"));
    }
    if req.pcenc.trim().is_empty() {
        return Err(err_box("pcenc 不能为空"));
    }

    let base = client.academic_base_url();
    let url = format!("{}/admin/xsd/xk/listjxbDataV2", base);
    let referer = academic_referer(base);
    let from = default_from(req.from.as_deref());

    let mut params = HashMap::<String, String>::new();
    params.insert("from".to_string(), from.clone());
    params.insert("kcmc".to_string(), req.kcmc.clone().unwrap_or_default());
    params.insert("kcxz".to_string(), req.kcxz.clone().unwrap_or_default());
    params.insert("jxms".to_string(), req.jxms.clone().unwrap_or_default());
    params.insert("kcgs".to_string(), req.kcgs.clone().unwrap_or_default());
    params.insert("teacher".to_string(), req.teacher.clone().unwrap_or_default());
    params.insert("pcid".to_string(), req.pcid.clone());
    params.insert("kkxq".to_string(), req.kkxq.clone().unwrap_or_default());
    params.insert("kclb".to_string(), req.kclb.clone().unwrap_or_default());
    params.insert("pcenc".to_string(), req.pcenc.clone());
    params.insert("kclx".to_string(), req.kclx.clone().unwrap_or_default());

    let resp = client
        .client
        .post(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header("Origin", base)
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&params)
        .send()
        .await?;

    let raw = read_json_response(resp, "获取选课列表失败").await?;
    let ret = raw.get("ret").and_then(|v| v.as_i64()).unwrap_or_default();
    let msg = response_msg(&raw, "获取成功");
    let is_empty = ret == -1 && msg.contains("没有可选的教学班");
    if ret != 0 && !is_empty {
        return Err(err_box(msg));
    }

    let data = raw.get("data").cloned().unwrap_or_else(|| json!({}));
    let courses = data
        .get("initData")
        .and_then(|value| value.as_array())
        .map(|items| items.iter().map(normalize_course).collect::<Vec<_>>())
        .unwrap_or_default();

    Ok(with_sync_fields(json!({
        "pcid": req.pcid,
        "from": from,
        "pcenc": req.pcenc,
        "courses": courses,
        "condition": data.get("condition").cloned().unwrap_or_else(|| json!({})),
        "occupied_slots": data.get("mysksjd").cloned().unwrap_or_else(|| json!([])),
        "available_ratio": get_string(&data, "kfrlbfb"),
        "count": data.get("initData").and_then(|value| value.as_array()).map(|items| items.len()).unwrap_or(0),
        "empty": is_empty,
        "message": if is_empty { "当前批次暂无可选课程" } else { msg.as_str() },
    })))
}

pub async fn fetch_course_selection_end_time(
    client: &HbutClient,
    req: &crate::CourseSelectionEndTimeRequest,
) -> Result<Value, DynError> {
    if req.pcid.trim().is_empty() {
        return Err(err_box("pcid 不能为空"));
    }
    if req.kklx.trim().is_empty() {
        return Err(err_box("kklx 不能为空"));
    }

    let base = client.academic_base_url();
    let referer = academic_referer(base);
    let url = format!("{}/admin/xsd/xk/getEndTime/{}?pcid={}", base, req.kklx.trim(), req.pcid.trim());

    let resp = client
        .client
        .get(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await?;

    let raw = read_text_response(resp, "获取选课结束时间失败").await?;
    let trimmed = raw.trim().trim_matches('"').trim();
    let remaining_seconds = trimmed.parse::<i64>().ok();

    Ok(with_sync_fields(json!({
        "pcid": req.pcid,
        "kklx": req.kklx,
        "raw": trimmed,
        "remaining_seconds": remaining_seconds,
        "countdown_text": remaining_seconds.map(countdown_text).unwrap_or_else(|| trimmed.to_string()),
        "is_preview": remaining_seconds.map(|v| v <= 0).unwrap_or(false),
    })))
}

pub async fn fetch_course_selection_child_classes(
    client: &HbutClient,
    req: &crate::CourseSelectionChildClassesRequest,
) -> Result<Value, DynError> {
    if req.pcid.trim().is_empty() || req.pcenc.trim().is_empty() || req.jxbid.trim().is_empty() {
        return Err(err_box("pcid、pcenc、jxbid 不能为空"));
    }

    let base = client.academic_base_url();
    let url = format!("{}/admin/xsd/xk/queryChildClassesV2", base);
    let referer = academic_referer(base);
    let from = default_from(req.from.as_deref());

    let mut params = HashMap::<String, String>::new();
    params.insert("pcid".to_string(), req.pcid.clone());
    params.insert("pcenc".to_string(), req.pcenc.clone());
    params.insert("jxbid".to_string(), req.jxbid.clone());
    params.insert("from".to_string(), from.clone());

    let resp = client
        .client
        .post(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header("Origin", base)
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&params)
        .send()
        .await?;

    let raw = read_json_response(resp, "获取子教学班失败").await?;
    let classes = parse_child_classes(&raw);
    let raw_child_ids = raw
        .get("extend")
        .and_then(|value| value.get("zjxb"))
        .cloned()
        .unwrap_or_else(|| json!([]));

    Ok(with_sync_fields(json!({
        "pcid": req.pcid,
        "jxbid": req.jxbid,
        "from": from,
        "classes": classes,
        "child_ids": raw_child_ids,
    })))
}

pub async fn select_course_selection_course(
    client: &HbutClient,
    req: &crate::CourseSelectionSelectRequest,
) -> Result<Value, DynError> {
    if req.pcid.trim().is_empty() || req.jxbid.trim().is_empty() {
        return Err(err_box("pcid、jxbid 不能为空"));
    }

    let base = client.academic_base_url();
    let url = format!("{}/admin/xsd/xk/xsdXkV2", base);
    let referer = academic_referer(base);
    let from = default_from(req.from.as_deref());

    let mut params = HashMap::<String, String>::new();
    params.insert("pcid".to_string(), req.pcid.clone());
    params.insert("jxbid".to_string(), req.jxbid.clone());
    params.insert("from".to_string(), from.clone());
    if let Some(zjxbid) = req.zjxbid.as_ref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        params.insert("zjxbid".to_string(), zjxbid.to_string());
    }

    let resp = client
        .client
        .post(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header("Origin", base)
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&params)
        .send()
        .await?;

    let raw = read_json_response(resp, "提交选课失败").await?;
    let ret = raw.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
    let msg = response_msg(&raw, "提交选课失败");
    if ret != 0 {
        return Err(err_box(msg));
    }

    Ok(with_sync_fields(json!({
        "ret": ret,
        "msg": msg,
        "pcid": req.pcid,
        "jxbid": req.jxbid,
        "zjxbid": req.zjxbid,
        "from": from,
    })))
}

pub async fn withdraw_course_selection_course(
    client: &HbutClient,
    req: &crate::CourseSelectionWithdrawRequest,
) -> Result<Value, DynError> {
    if req.pcid.trim().is_empty() || req.jxbid.trim().is_empty() {
        return Err(err_box("pcid、jxbid 不能为空"));
    }

    let base = client.academic_base_url();
    let url = format!("{}/admin/xsd/xk/xsdTkV2", base);
    let referer = academic_referer(base);

    let mut params = HashMap::<String, String>::new();
    params.insert("pcid".to_string(), req.pcid.clone());
    params.insert("jxbid".to_string(), req.jxbid.clone());

    let resp = client
        .client
        .post(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
        .header("Origin", base)
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .form(&params)
        .send()
        .await?;

    let raw = read_json_response(resp, "退课失败").await?;
    let ret = raw.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
    let msg = response_msg(&raw, "退课失败");
    if ret != 0 {
        return Err(err_box(msg));
    }

    Ok(with_sync_fields(json!({
        "ret": ret,
        "msg": msg,
        "pcid": req.pcid,
        "jxbid": req.jxbid,
    })))
}

pub async fn fetch_course_selection_detail_intro(
    client: &HbutClient,
    req: &crate::CourseSelectionDetailRequest,
) -> Result<Value, DynError> {
    if req.jxbid.trim().is_empty() {
        return Err(err_box("jxbid 不能为空"));
    }

    let base = client.academic_base_url();
    let referer = academic_referer(base);
    let url = format!("{}/admin/xsd/xk/getKcjj?jxbid={}", base, req.jxbid.trim());

    let resp = client
        .client
        .get(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await?;

    let text = read_text_response(resp, "获取课程简介失败").await?;
    let parsed = serde_json::from_str::<Value>(&text).ok();
    let content = parsed
        .as_ref()
        .and_then(|value| value.get("data").cloned())
        .unwrap_or_else(|| Value::String(text.clone()));

    Ok(with_sync_fields(json!({
        "jxbid": req.jxbid,
        "content": content,
        "raw": parsed.unwrap_or_else(|| Value::String(text)),
    })))
}

pub async fn fetch_course_selection_detail_teacher(
    client: &HbutClient,
    req: &crate::CourseSelectionDetailRequest,
) -> Result<Value, DynError> {
    if req.jxbid.trim().is_empty() {
        return Err(err_box("jxbid 不能为空"));
    }

    let base = client.academic_base_url();
    let referer = academic_referer(base);
    let url = format!("{}/admin/xsd/xk/getJsxx?jxbid={}", base, req.jxbid.trim());

    let resp = client
        .client
        .get(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", &referer)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await?;

    let text = read_text_response(resp, "获取教师详情失败").await?;
    let parsed = serde_json::from_str::<Value>(&text).ok();
    let content = parsed
        .as_ref()
        .and_then(|value| value.get("data").cloned())
        .unwrap_or_else(|| Value::String(text.clone()));

    Ok(with_sync_fields(json!({
        "jxbid": req.jxbid,
        "content": content,
        "raw": parsed.unwrap_or_else(|| Value::String(text)),
    })))
}

// 根据当前日期计算学期标识
fn current_semester_by_date() -> String {
    use chrono::{Datelike, Local};
    let now = Local::now();
    let year = now.year();
    let month = now.month();
    let day = now.day();
    let (start, term) = if month >= 9 {
        (year, 1)
    } else if month >= 3 {
        (year - 1, 2)
    } else if month == 2 && day >= 15 {
        (year - 1, 2)
    } else {
        (year - 1, 1)
    };
    format!("{}-{}-{}", start, start + 1, term)
}

// 生成当前学期附近的候选学期列表（倒序，最新在前）
fn build_semester_candidates() -> Vec<String> {
    let current = current_semester_by_date();
    let parts: Vec<&str> = current.split('-').collect();
    if parts.len() != 3 {
        return vec![current];
    }
    let start_year: i32 = parts[0].parse().unwrap_or(2025);
    let term: i32 = parts[2].parse().unwrap_or(2);
    let base_idx = start_year * 2 + (term - 1);
    let mut semesters = Vec::new();
    // 当前学期 + 往前 5 个学期
    for offset in (-5..=0).rev() {
        let idx = base_idx + offset;
        let sy = idx.div_euclid(2);
        let t = idx.rem_euclid(2) + 1;
        semesters.push(format!("{}-{}-{}", sy, sy + 1, t));
    }
    semesters
}

// 通过 /admin/xsd/yxkccx/listYxkc 获取已选课程（无需选课时段开放）
pub async fn fetch_course_selection_selected_courses(
    client: &HbutClient,
    req: &crate::CourseSelectionSelectedCoursesRequest,
) -> Result<Value, DynError> {
    let base = client.academic_base_url();
    let current = current_semester_by_date();
    let semester = req
        .semester
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(&current);

    let query_fields = "id,kcid,xnxq,xdxz,xdfs,kcbh,kcjj,kcbz,jxbmc,jxbbh,zxs,llxs,syxs,shangjxs,shijianxs,qtxs,jxbzc,kclb,kcxz,type,kclx,kcgs,rkjs,jxms,sksjdd,xf,skfs,xkfs,xklx,";
    let url = format!(
        "{}/admin/xsd/yxkccx/listYxkc?gridtype=jqgrid&async=1&queryFields={}&_search=false&page.size=10000&page.pn=1&sort=id&order=asc&xnxq={}&kklx=&kcxz=&xdxz=&xklx=&query.xnxq%7C%7C={}&query.kklx%7C%7C=&query.kcxz%7C%7C=&query.xdxz%7C%7C=&query.xklx%7C%7C=",
        base, query_fields, semester, semester
    );

    let resp = client
        .client
        .get(&url)
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", format!("{}/admin/xsd/yxkccx", base))
        .send()
        .await?;

    let raw = read_json_response(resp, "获取已选课程失败").await?;
    let ret = raw.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
    if ret != 0 {
        let msg = response_msg(&raw, "未知错误");
        return Err(err_box(format!("获取已选课程失败: ret={}, msg={}", ret, msg)));
    }

    let results = raw
        .get("results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // 映射 rkjs→teacher，标记 status=1（已选），保持与选课列表字段一致
    let courses: Vec<Value> = results
        .into_iter()
        .map(|mut item| {
            if let Value::Object(ref mut map) = item {
                if let Some(rkjs) = map.get("rkjs").cloned() {
                    map.entry("teacher".to_string()).or_insert(rkjs);
                }
                map.entry("status".to_string())
                    .or_insert(Value::String("1".to_string()));
            }
            item
        })
        .collect();

    let count = courses.len();
    let semesters = build_semester_candidates();
    Ok(with_sync_fields(json!({
        "courses": courses,
        "count": count,
        "current_semester": current,
        "semesters": semesters,
    })))
}
