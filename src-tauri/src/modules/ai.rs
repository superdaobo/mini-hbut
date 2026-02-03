//! AI 模块封装。
//!
//! 将 http_client 的 AI 能力封装为统一接口，供前端调用。

use crate::AppState;
use crate::db;

const DB_FILENAME: &str = "grades.db";
use tauri::State;
use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use chrono::Utc;
use serde_json::Value;

/// AI 会话初始化响应
#[derive(Debug, Serialize, Deserialize)]
pub struct AiInitResponse {
    pub success: bool,
    pub msg: String,
    /// 核心 Token，用于 URL 参数
    pub token: String,
    /// 鉴权头，用于 Headers["blade-auth"]
    pub blade_auth: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<AiModelOption>>,
}

/// AI 上传响应
#[derive(Debug, Serialize, Deserialize)]
pub struct AiUploadResponse {
    pub success: bool,
    /// 文件 OSS 链接
    pub link: String,
    pub msg: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiModelOption {
    pub label: String,
    pub value: String,
}

fn normalize_model_item(item: &Value) -> Option<AiModelOption> {
    match item {
        Value::String(s) => {
            let label = s.trim();
            if label.is_empty() {
                None
            } else {
                Some(AiModelOption { label: label.to_string(), value: label.to_string() })
            }
        }
        Value::Object(map) => {
            let label = map.get("label")
                .or_else(|| map.get("name"))
                .or_else(|| map.get("modelName"))
                .or_else(|| map.get("title"))
                .or_else(|| map.get("display"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let value = map.get("value")
                .or_else(|| map.get("model"))
                .or_else(|| map.get("code"))
                .or_else(|| map.get("id"))
                .or_else(|| map.get("key"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            match (label, value) {
                (Some(l), Some(v)) => Some(AiModelOption { label: l, value: v }),
                (Some(l), None) => Some(AiModelOption { label: l.clone(), value: l }),
                (None, Some(v)) => Some(AiModelOption { label: v.clone(), value: v }),
                _ => None,
            }
        }
        _ => None,
    }
}

fn extract_models_from_value(value: &Value) -> Vec<AiModelOption> {
    let mut models: Vec<AiModelOption> = Vec::new();
    let mut candidates: Vec<Value> = Vec::new();

    if let Value::Object(map) = value {
        for key in ["modelList", "models", "model_list", "aiModels", "modelOptions"] {
            if let Some(Value::Array(list)) = map.get(key) {
                candidates.extend(list.clone());
                break;
            }
        }
        if candidates.is_empty() {
            for child in map.values() {
                if let Value::Object(_) = child {
                    let nested = extract_models_from_value(child);
                    if !nested.is_empty() {
                        models.extend(nested);
                        break;
                    }
                }
            }
        }
    }

    if let Some(Value::Array(list)) = value.get("data") {
        candidates.extend(list.clone());
    } else if let Some(data) = value.get("data") {
        if let Value::Object(_) = data {
            let nested = extract_models_from_value(data);
            models.extend(nested);
        }
    }

    for item in candidates {
        if let Some(normalized) = normalize_model_item(&item) {
            models.push(normalized);
        }
    }

    let mut seen = std::collections::HashSet::new();
    models.retain(|item| seen.insert(item.value.clone()));
    models
}

async fn fetch_ai_models(token: &str, blade_auth: &str) -> Result<Vec<AiModelOption>, String> {
    if blade_auth.trim().is_empty() {
        return Ok(Vec::new());
    }
    let client = reqwest::Client::new();
    let referer = format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", token);
    let mut headers = HeaderMap::new();
    headers.insert("blade-auth", HeaderValue::from_str(blade_auth).map_err(|e| e.to_string())?);
    headers.insert("Referer", HeaderValue::from_str(&referer).map_err(|e| e.to_string())?);
    headers.insert(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"));

    let url = "https://virtualhuman2h5.59wanmei.com/apis/virtualhuman/serverApi/config/initParam";
    let response = client.post(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;
    let json: Value = serde_json::from_str(&text).map_err(|e| format!("JSON Parse Error: {}", e))?;
    let models = extract_models_from_value(&json);
    Ok(models)
}

async fn upload_text_file(
    token: &str,
    blade_auth: &str,
    file_content: &str,
    file_name: &str,
) -> Result<AiUploadResponse, String> {
    let client = reqwest::Client::new();

    let form = reqwest::multipart::Form::new()
        .part("file", reqwest::multipart::Part::text(file_content.to_string())
            .file_name(file_name.to_string())
            .mime_str("text/plain")
            .map_err(|e| e.to_string())?);

    let mut headers = HeaderMap::new();
    if !blade_auth.is_empty() {
        headers.insert("blade-auth", HeaderValue::from_str(blade_auth).map_err(|e| e.to_string())?);
    }
    let referer = format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", token);
    headers.insert("Referer", HeaderValue::from_str(&referer).map_err(|e| e.to_string())?);
    headers.insert(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"));

    let url = "https://virtualhuman2h5.59wanmei.com/apis/blade-resource/oss/endpoint/put-file-attach-limit?code=ali";
    let response = client.post(url)
        .headers(headers)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let text = response.text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("JSON Parse Error: {}", e))?;

    if let Some(data) = json.get("data") {
        if let Some(link) = data.get("link").and_then(|v| v.as_str()) {
            return Ok(AiUploadResponse {
                success: true,
                link: link.to_string(),
                msg: "Upload successful".into(),
            });
        }
    }

    Err(format!("Upload failed or unexpected response: {}", text))
}

/// 命令: 初始化 AI 会话
/// 调用 HbutClient 的 SSO 逻辑获取第三方服务的凭证
#[tauri::command]
/// 初始化 AI 会话入口
pub async fn hbut_ai_init(state: State<'_, AppState>) -> Result<AiInitResponse, String> {
    let mut client = state.client.lock().await;
    if let Some(info) = client.user_info.clone() {
        let student_id = info.student_id.clone();
        if let Ok(Some(session)) = db::get_user_session(DB_FILENAME, &student_id) {
            if !session.password.is_empty() {
                client.set_credentials(student_id, session.password);
            }
            if !session.one_code_token.is_empty() {
                let expires_at = chrono::DateTime::parse_from_rfc3339(&session.token_expires_at)
                    .ok()
                    .map(|dt| dt.with_timezone(&chrono::Utc));
                let refresh = if session.refresh_token.trim().is_empty() {
                    None
                } else {
                    Some(session.refresh_token)
                };
                client.set_electricity_session(session.one_code_token, refresh, expires_at);
            }
        }
    }
    match client.init_ai_session().await {
        Ok((token, blade_auth)) => {
            let models = fetch_ai_models(&token, &blade_auth).await.ok().filter(|list| !list.is_empty());
            Ok(AiInitResponse {
                success: true,
                msg: "AI Session Initialized".into(),
                token,
                blade_auth,
                models,
            })
        }
        Err(e) => Err(format!("初始化 AI 会话失败: {}", e)),
    }
}

/// 命令: 上传文件到数字人知识库
/// 独立使用 reqwest Client，因为是跨域请求到第三方服务
#[tauri::command]
/// 上传文件入口
pub async fn hbut_ai_upload(
    token: String,
    blade_auth: String,
    file_content: String,
    file_name: String,
) -> Result<AiUploadResponse, String> {
    upload_text_file(&token, &blade_auth, &file_content, &file_name).await
}

#[tauri::command]
/// AI 对话入口
pub async fn hbut_ai_chat(
    token: String,
    blade_auth: String,
    question: String,
    upload_url: String, 
    model: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let mut headers = HeaderMap::new();
    if !blade_auth.is_empty() {
        headers.insert("blade-auth", HeaderValue::from_str(&blade_auth).map_err(|e| e.to_string())?);
    }
    let referer = format!("https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}", token);
    headers.insert("Referer", HeaderValue::from_str(&referer).map_err(|e| e.to_string())?);
    
    let url = "https://virtualhuman2h5.59wanmei.com/apis/virtualhuman/serverApi/question/streamAnswer";

    let mut final_upload_url = upload_url;
    if final_upload_url.trim().is_empty() {
        let empty_name = format!("empty_{}.txt", Utc::now().timestamp_millis());
        let empty = upload_text_file(&token, &blade_auth, "", &empty_name).await?;
        final_upload_url = empty.link;
    }

    let session_id = format!("session-{}", Utc::now().timestamp_millis());
    let timestamp = Utc::now().timestamp_millis().to_string();

    let selected_model = if model.trim().is_empty() { "qwen-max" } else { model.as_str() };

    let params = [
        ("ask", question.as_str()),
        ("sessionId", session_id.as_str()),
        ("model", selected_model),
        ("timestamp", timestamp.as_str()),
        ("serviceModel", "default"),
        ("datasetFlag", "0"),
        ("networkFlag", "0"),
        ("uploadUrl", final_upload_url.as_str()),
    ];
    
    let response = client.post(url)
        .headers(headers)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(parse_ai_stream_text(&text))
}

pub(crate) fn parse_ai_stream_text(raw: &str) -> String {
    if raw.trim().is_empty() {
        return String::new();
    }
    let trimmed = raw.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
            if let Some(found) = extract_text_from_value(&json) {
                let decoded = decode_hex_if_needed(&found).unwrap_or(found);
                let cleaned = strip_noise_prefix(&decoded);
                let expanded = decode_hex_fragments(&cleaned);
                if !expanded.trim().is_empty() {
                    return expanded;
                }
            }
        } else {
            let objs = extract_json_objects(raw);
            if !objs.is_empty() {
                let mut parts: Vec<String> = Vec::new();
                for item in objs {
                    if let Ok(json) = serde_json::from_str::<Value>(&item) {
                        if let Some(found) = extract_text_from_value(&json) {
                            let cleaned = strip_noise_prefix(&found);
                            if !cleaned.trim().is_empty() && !is_noise_message(&cleaned) {
                                parts.push(cleaned);
                            }
                        }
                    }
                }
                if !parts.is_empty() {
                    let joined = parts.join("");
                    let decoded = decode_hex_if_needed(&joined).unwrap_or(joined);
                    let cleaned = strip_noise_prefix(&decoded);
                    return trim_trailing_hex_noise(&decode_hex_fragments(&cleaned));
                }
                return String::new();
            }
        }
    }
    let mut parsed_any = false;
    let mut parts: Vec<String> = Vec::new();
    for line in raw.lines() {
        let mut trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with("data:") {
            trimmed = trimmed.trim_start_matches("data:").trim();
        }
        if trimmed == "[DONE]" {
            break;
        }
        if trimmed.starts_with(':') {
            continue;
        }
        if let Ok(json) = serde_json::from_str::<Value>(trimmed) {
            parsed_any = true;
            if let Some(chunk) = extract_text_from_value(&json) {
                let cleaned = strip_noise_prefix(&chunk);
                if !cleaned.trim().is_empty() && !is_noise_message(&cleaned) {
                    parts.push(cleaned);
                }
                continue;
            }
        } else if trimmed.starts_with('{') || trimmed.starts_with('[') {
            continue;
        }
        if !is_noise_message(trimmed) {
            parts.push(trimmed.to_string());
        }
    }
    if parsed_any {
        let joined = parts.join("");
        let decoded = decode_hex_if_needed(&joined).unwrap_or(joined);
        let cleaned = strip_noise_prefix(&decoded);
        return trim_trailing_hex_noise(&decode_hex_fragments(&cleaned));
    }
    if let Some(decoded) = decode_hex_if_needed(raw) {
        return trim_trailing_hex_noise(&decode_hex_fragments(&strip_noise_prefix(&decoded)));
    }
    trim_trailing_hex_noise(&decode_hex_fragments(&strip_noise_prefix(raw)))
}

pub(crate) fn extract_text_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            let trimmed = s.trim();
            if (trimmed.starts_with('{') && trimmed.ends_with('}')) || (trimmed.starts_with('[') && trimmed.ends_with(']')) {
                if let Ok(nested) = serde_json::from_str::<Value>(trimmed) {
                    if let Some(found) = extract_text_from_value(&nested) {
                        return Some(found);
                    }
                }
            }
            return Some(s.to_string());
        }
        Value::Array(list) => {
            let mut parts: Vec<String> = Vec::new();
            for item in list {
                if let Some(found) = extract_text_from_value(item) {
                    if !found.trim().is_empty() && !is_noise_message(&found) {
                        parts.push(found);
                    }
                }
            }
            if !parts.is_empty() {
                return Some(parts.join(""));
            }
        }
        Value::Object(map) => {
            if let Some((t, content, thinking)) = extract_stream_fields(value) {
                match t {
                    Some(1) => {
                        if let Some(text) = content.or(thinking) {
                            return Some(text);
                        }
                    }
                    Some(11) => {
                        return None;
                    }
                    Some(_) => {
                        return None;
                    }
                    None => {
                        if let Some(text) = content {
                            return Some(text);
                        }
                    }
                }
            }
            if let Some(data) = map.get("data") {
                if let Some(found) = extract_text_from_value(data) {
                    if !found.trim().is_empty() && !is_noise_message(&found) {
                        return Some(found);
                    }
                }
            }
            if let Some(proc_info) = map.get("processInfo") {
                if let Some(found) = extract_text_from_value(proc_info) {
                    if !found.trim().is_empty() && !is_noise_message(&found) {
                        return Some(found);
                    }
                }
            }
            for key in ["content", "answer", "text", "msg"] {
                if let Some(Value::String(s)) = map.get(key) {
                    if !is_noise_message(s) {
                        return Some(s.to_string());
                    }
                }
            }
            if let Some(Value::String(s)) = map.get("message") {
                if !is_noise_message(s) {
                    return Some(s.to_string());
                }
            }
        }
        _ => {}
    }
    None
}

fn decode_hex_if_needed(text: &str) -> Option<String> {
    let cleaned: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    if cleaned.len() < 8 || cleaned.len() % 2 != 0 {
        return None;
    }
    if !cleaned.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let mut bytes = Vec::with_capacity(cleaned.len() / 2);
    let chars: Vec<char> = cleaned.chars().collect();
    let mut i = 0;
    while i + 1 < chars.len() {
        let hex = format!("{}{}", chars[i], chars[i + 1]);
        let byte = u8::from_str_radix(&hex, 16).ok()?;
        bytes.push(byte);
        i += 2;
    }
    if let Ok(decoded) = String::from_utf8(bytes.clone()) {
        return Some(decoded);
    }
    if bytes.len() % 2 == 0 {
        let mut u16s = Vec::with_capacity(bytes.len() / 2);
        let mut i = 0;
        while i + 1 < bytes.len() {
            u16s.push(u16::from_le_bytes([bytes[i], bytes[i + 1]]));
            i += 2;
        }
        if let Ok(decoded) = String::from_utf16(&u16s) {
            return Some(decoded);
        }
        u16s.clear();
        let mut j = 0;
        while j + 1 < bytes.len() {
            u16s.push(u16::from_be_bytes([bytes[j], bytes[j + 1]]));
            j += 2;
        }
        if let Ok(decoded) = String::from_utf16(&u16s) {
            return Some(decoded);
        }
    }
    None
}

fn parse_type(value: &Value) -> Option<i64> {
    match value {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.parse::<i64>().ok(),
        _ => None,
    }
}

fn extract_string_field(map: &serde_json::Map<String, Value>, key: &str) -> Option<String> {
    map.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

pub(crate) fn extract_stream_fields(value: &Value) -> Option<(Option<i64>, Option<String>, Option<String>)> {
    match value {
        Value::Object(map) => {
            if let Some(data) = map.get("data") {
                if let Some(found) = extract_stream_fields(data) {
                    return Some(found);
                }
            }
            if let Some(proc_info) = map.get("processInfo") {
                if let Some(found) = extract_stream_fields(proc_info) {
                    return Some(found);
                }
            }
            let t = map.get("type").and_then(parse_type);
            let content = extract_string_field(map, "content")
                .or_else(|| extract_string_field(map, "answer"))
                .or_else(|| extract_string_field(map, "text"));
            let thinking = extract_string_field(map, "thinking")
                .or_else(|| extract_string_field(map, "reasoning"));

            if t.is_some() || content.is_some() || thinking.is_some() {
                return Some((t, content, thinking));
            }

            if let Some(msg) = extract_string_field(map, "msg") {
                return Some((None, Some(msg), None));
            }
            None
        }
        _ => None,
    }
}

fn decode_hex_fragments(text: &str) -> String {
    let mut out = String::new();
    let mut buf = String::new();
    for ch in text.chars() {
        if ch.is_ascii_hexdigit() {
            buf.push(ch);
        } else {
            out.push_str(&decode_hex_buffer(&buf));
            buf.clear();
            out.push(ch);
        }
    }
    out.push_str(&decode_hex_buffer(&buf));
    out
}

fn decode_hex_buffer(buf: &str) -> String {
    if buf.len() < 8 || buf.len() % 2 != 0 {
        return buf.to_string();
    }
    if let Some(decoded) = decode_hex_if_needed(buf) {
        if looks_like_text(&decoded) {
            return decoded;
        }
    }
    buf.to_string()
}

fn looks_like_text(text: &str) -> bool {
    let mut has_cjk = false;
    let mut printable = 0usize;
    for ch in text.chars() {
        if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
            return false;
        }
        if ('\u{4E00}'..='\u{9FFF}').contains(&ch) {
            has_cjk = true;
        }
        if ch.is_alphanumeric() || ch.is_whitespace() || ('\u{4E00}'..='\u{9FFF}').contains(&ch) {
            printable += 1;
        }
    }
    has_cjk || printable >= 4
}

fn trim_trailing_hex_noise(text: &str) -> String {
    if text.len() < 120 {
        return text.to_string();
    }
    let trimmed = text.trim_end();
    let end_len = trimmed.len();
    let tail_window = end_len.saturating_sub(end_len / 4);
    let mut last_run_start: Option<usize> = None;
    let mut last_run_end: usize = 0;
    let bytes = trimmed.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i].is_ascii_hexdigit() {
            let start = i;
            i += 1;
            while i < bytes.len() && bytes[i].is_ascii_hexdigit() {
                i += 1;
            }
            let run_len = i - start;
            if run_len >= 120 && i >= tail_window {
                last_run_start = Some(start);
                last_run_end = i;
            }
        } else {
            i += 1;
        }
    }
    if let Some(start) = last_run_start {
        let suffix = &trimmed[last_run_end..];
        if suffix.trim().is_empty() && has_meaningful_text(&trimmed[..start]) {
            let run = &trimmed[start..last_run_end];
            if is_hex_gibberish_run(run) {
                return trimmed[..start].trim_end().to_string();
            }
        }
    }
    trimmed.to_string()
}

fn has_meaningful_text(text: &str) -> bool {
    let mut count = 0usize;
    for ch in text.chars() {
        if ('\u{4E00}'..='\u{9FFF}').contains(&ch) || ch.is_ascii_alphabetic() {
            count += 1;
            if count >= 4 {
                return true;
            }
        }
    }
    false
}

pub(crate) fn is_hex_gibberish_run(run: &str) -> bool {
    if run.len() < 80 {
        return false;
    }
    let zeros = run.chars().filter(|c| *c == '0').count();
    if zeros * 2 > run.len() {
        return true;
    }
    if let Some(decoded) = decode_hex_if_needed(run) {
        return !looks_like_text(&decoded);
    }
    true
}

fn strip_noise_prefix(text: &str) -> String {
    let mut current = text.trim_start().to_string();
    let noise_prefixes = [
        "操作成功",
        "请求完成",
        "success",
        "正在阅读文件",
        "正在读取文件",
    ];
    loop {
        let trimmed = current.trim_start();
        let mut changed = false;
        for prefix in noise_prefixes {
            if trimmed.starts_with(prefix) {
                current = trimmed[prefix.len()..].trim_start().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }
    current
}

fn is_noise_message(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.is_empty()
        || trimmed == "操作成功"
        || trimmed == "请求完成"
        || trimmed == "success"
        || trimmed.starts_with("正在阅读文件")
        || trimmed.starts_with("正在读取文件")
}

pub(crate) fn clean_stream_chunk(raw: &str) -> Option<String> {
    if raw.trim().is_empty() {
        return None;
    }
    let cleaned = strip_noise_prefix(raw);
    if cleaned.trim().is_empty() || is_noise_message(&cleaned) {
        return None;
    }
    let decoded = decode_hex_fragments(&cleaned);
    let final_text = strip_noise_prefix(&decoded);
    if final_text.trim().is_empty() || is_noise_message(&final_text) {
        None
    } else {
        Some(final_text)
    }
}

fn extract_json_objects(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut start: Option<usize> = None;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;

    for (i, ch) in raw.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        } else if ch == '"' {
            in_string = true;
            continue;
        }

        if ch == '{' || ch == '[' {
            if depth == 0 {
                start = Some(i);
            }
            depth += 1;
            continue;
        }

        if ch == '}' || ch == ']' {
            if depth > 0 {
                depth -= 1;
                if depth == 0 {
                    if let Some(s) = start {
                        out.push(raw[s..=i].to_string());
                        start = None;
                    }
                }
            }
        }
    }
    out
}
