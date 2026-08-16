//! AI 助手路由与 Handler：会话初始化、文件上传、普通/流式对话、
//! 会话管理，以及流式事件归一化辅助函数。

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::post;
use axum::{Json, Router};
use chrono::Utc;
use futures::{FutureExt, Stream, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;
use std::convert::Infallible;
use std::time::Instant;

use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AiUploadRequest {
    token: String,
    blade_auth: String,
    file_content: Option<String>,
    file_base64: Option<String>,
    file_mime: Option<String>,
    file_name: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AiChatRequest {
    token: String,
    blade_auth: String,
    question: String,
    upload_url: Option<String>,
    user_attachment: Option<String>,
    model: Option<String>,
    session_id: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AiSessionNewRequest {
    token: String,
    blade_auth: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AiSessionHistoryRequest {
    token: String,
    blade_auth: String,
    current: Option<i64>,
    size: Option<i64>,
    ask: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AiSessionMessagesRequest {
    token: String,
    blade_auth: String,
    session_id: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct AiSessionDeleteRequest {
    token: String,
    blade_auth: String,
    session_id: String,
}

// ────────────────────────────────────────────────────────────
async fn ai_init(
    State(state): State<HttpState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let mut client = state.client.write().await;
    let result = std::panic::AssertUnwindSafe(client.init_ai_session())
        .catch_unwind()
        .await;
    match result {
        Ok(Ok((token, blade_auth))) => Ok(ok(serde_json::json!({
            "success": true,
            "token": token,
            "blade_auth": blade_auth
        }))),
        Ok(Err(e)) => Err(err(StatusCode::BAD_REQUEST, "业务错误", e.to_string())),
        Err(panic) => {
            let msg = if let Some(s) = panic.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic.downcast_ref::<String>() {
                s.clone()
            } else {
                "unknown panic".to_string()
            };
            eprintln!("[HTTP] AI 初始化 panic: {}", msg);
            Err(err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "系统错误",
                format!("ai_init panic: {}", msg),
            ))
        }
    }
}

// ────────────────────────────────────────────────────────────
async fn ai_upload(
    State(_state): State<HttpState>,
    Json(req): Json<AiUploadRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let res = crate::modules::ai::hbut_ai_upload(
        req.token,
        req.blade_auth,
        req.file_content.unwrap_or_default(),
        req.file_name,
        req.file_base64,
        req.file_mime,
    )
    .await
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))?;
    Ok(ok(serde_json::json!({
        "success": res.success,
        "link": res.link,
        "msg": res.msg
    })))
}

// ────────────────────────────────────────────────────────────
async fn ai_chat_session_new(
    State(_state): State<HttpState>,
    Json(req): Json<AiSessionNewRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let session_id = crate::modules::ai::create_ai_remote_session(&req.token, &req.blade_auth)
        .await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e))?;
    Ok(ok(serde_json::json!({ "session_id": session_id })))
}

// ────────────────────────────────────────────────────────────
async fn ai_chat_session_history(
    State(_state): State<HttpState>,
    Json(req): Json<AiSessionHistoryRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let page = crate::modules::ai::fetch_ai_session_history(
        &req.token,
        &req.blade_auth,
        req.current.unwrap_or(1),
        req.size.unwrap_or(20),
        req.ask.as_deref(),
    )
    .await
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e))?;
    Ok(ok(
        serde_json::to_value(page).unwrap_or_else(|_| serde_json::json!({}))
    ))
}

// ────────────────────────────────────────────────────────────
async fn ai_chat_session_messages(
    State(_state): State<HttpState>,
    Json(req): Json<AiSessionMessagesRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let payload =
        crate::modules::ai::fetch_ai_session_messages(&req.token, &req.blade_auth, &req.session_id)
            .await
            .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e))?;
    Ok(ok(
        serde_json::to_value(payload).unwrap_or_else(|_| serde_json::json!({}))
    ))
}

// ────────────────────────────────────────────────────────────
async fn ai_chat_session_delete(
    State(_state): State<HttpState>,
    Json(req): Json<AiSessionDeleteRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    crate::modules::ai::delete_ai_session(&req.token, &req.blade_auth, &req.session_id)
        .await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e))?;
    Ok(ok(
        serde_json::json!({ "success": true, "session_id": req.session_id }),
    ))
}

// ────────────────────────────────────────────────────────────
async fn ai_chat(
    State(_state): State<HttpState>,
    Json(req): Json<AiChatRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let res = crate::modules::ai::hbut_ai_chat(
        req.token,
        req.blade_auth,
        req.question,
        req.user_attachment.or(req.upload_url).unwrap_or_default(),
        req.model.unwrap_or_else(|| "qwen-max".to_string()),
        req.session_id,
    )
    .await
    .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))?;
    Ok(ok(serde_json::json!({"success": true, "data": res})))
}

// ────────────────────────────────────────────────────────────
async fn ai_chat_stream(
    State(_state): State<HttpState>,
    Json(req): Json<AiChatRequest>,
) -> Result<
    Sse<impl Stream<Item = Result<Event, Infallible>>>,
    (StatusCode, Json<ApiResponse<serde_json::Value>>),
> {
    let token = req.token;
    let blade_auth = req.blade_auth;
    let question = req.question;
    let model = req.model.unwrap_or_else(|| "qwen-max".to_string());
    let user_attachment = req.user_attachment.or(req.upload_url).unwrap_or_default();
    let final_upload_url =
        crate::modules::ai::ensure_stream_upload_url(&token, &blade_auth, user_attachment.trim())
            .await;
    let effective_question = crate::modules::ai::build_effective_ask(&question);
    let network_flag = "1";

    let remote_session_id = req.session_id.unwrap_or_default().trim().to_string();
    let session_id = if remote_session_id.is_empty() {
        crate::modules::ai::create_ai_remote_session(&token, &blade_auth)
            .await
            .unwrap_or_else(|_| format!("session-{}", Utc::now().timestamp_millis()))
    } else {
        remote_session_id
    };

    let url =
        "https://virtualhuman2h5.59wanmei.com/apis/virtualhuman/serverApi/question/streamAnswer";
    let mut headers = HeaderMap::new();
    if !blade_auth.is_empty() {
        headers.insert(
            "blade-auth",
            HeaderValue::from_str(&blade_auth)
                .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))?,
        );
    }
    headers.insert("Accept", HeaderValue::from_static("text/event-stream"));
    headers.insert("Accept-Encoding", HeaderValue::from_static("identity"));
    headers.insert("Cache-Control", HeaderValue::from_static("no-cache"));
    let referer = format!(
        "https://virtualhuman2h5.59wanmei.com/digitalPeople3/index.html?token={}",
        token
    );
    headers.insert(
        "Referer",
        HeaderValue::from_str(&referer)
            .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))?,
    );

    let timestamp = Utc::now().timestamp_millis().to_string();

    let mut params: Vec<(&str, String)> = vec![
        ("ask", effective_question),
        ("sessionId", session_id.clone()),
        ("model", model.clone()),
        ("timestamp", timestamp),
        ("serviceModel", "default".to_string()),
        ("datasetFlag", "0".to_string()),
        // 按用户要求强制走检索/知识模式。
        ("networkFlag", network_flag.to_string()),
    ];
    if !final_upload_url.trim().is_empty() {
        params.push(("uploadUrl", final_upload_url));
    }

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .headers(headers)
        .form(&params)
        .send()
        .await
        .map_err(|e| err(StatusCode::BAD_REQUEST, "业务错误", e.to_string()))?;

    let mut stream = response.bytes_stream();
    let event_stream = async_stream::stream! {
        let mut buffer = String::new();
        let mut utf8_pending: Vec<u8> = Vec::new();
        let mut emitted_content: bool = false;
        let session_payload = serde_json::json!({
            "event": "session",
            "session_id": session_id
        }).to_string();
        yield Ok(Event::default().data(session_payload));
        use tokio::time::{timeout, Duration};
        let start = Instant::now();
        let max_duration = Duration::from_secs(180);
        let idle_timeout = Duration::from_secs(60);
        let output_idle_timeout = Duration::from_secs(8);
        let mut last_output_at = Instant::now();
        loop {
            if start.elapsed() > max_duration {
                let payload = serde_json::json!({"event":"done","reason":"timeout"}).to_string();
                yield Ok(Event::default().data(payload));
                return;
            }
            if emitted_content && last_output_at.elapsed() > output_idle_timeout {
                let payload = serde_json::json!({"event":"done","reason":"output_idle_timeout"}).to_string();
                yield Ok(Event::default().data(payload));
                return;
            }
            let next = timeout(idle_timeout, stream.next()).await;
            let item = match next {
                Ok(Some(item)) => item,
                Ok(None) => break,
                Err(_) => {
                    let payload = serde_json::json!({"event":"done","reason":"idle_timeout"}).to_string();
                    yield Ok(Event::default().data(payload));
                    return;
                }
            };
            let chunk = match item {
                Ok(bytes) => {
                    utf8_pending.extend_from_slice(&bytes);
                    decode_utf8_stream_chunk(&mut utf8_pending)
                }
                Err(_) => break,
            };
            if chunk.is_empty() {
                continue;
            }
            buffer.push_str(&chunk);
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();
                if line.is_empty() {
                    continue;
                }
                for event_payload in normalize_ai_stream_events(&line) {
                    if is_done_event(&event_payload) {
                        yield Ok(Event::default().data(event_payload.to_string()));
                        return;
                    }
                    if let Some(event_name) = event_payload.get("event").and_then(|v| v.as_str()) {
                        if event_name == "delta" || event_name == "thinking" || event_name == "progress" {
                            last_output_at = Instant::now();
                        }
                        if event_name == "delta" || event_name == "thinking" {
                            emitted_content = true;
                        }
                    }
                    yield Ok(Event::default().data(event_payload.to_string()));
                }
            }
            for raw in drain_json_objects(&mut buffer) {
                if raw.trim().is_empty() {
                    continue;
                }
                for event_payload in normalize_ai_stream_events(&raw) {
                    if is_done_event(&event_payload) {
                        yield Ok(Event::default().data(event_payload.to_string()));
                        return;
                    }
                    if let Some(event_name) = event_payload.get("event").and_then(|v| v.as_str()) {
                        if event_name == "delta" || event_name == "thinking" || event_name == "progress" {
                            last_output_at = Instant::now();
                        }
                        if event_name == "delta" || event_name == "thinking" {
                            emitted_content = true;
                        }
                    }
                    yield Ok(Event::default().data(event_payload.to_string()));
                }
            }
        }
        if !utf8_pending.is_empty() {
            let tail = String::from_utf8_lossy(&utf8_pending).to_string();
            if !tail.is_empty() {
                buffer.push_str(&tail);
            }
            utf8_pending.clear();
        }
        if !buffer.trim().is_empty() {
            let final_text = crate::modules::ai::parse_ai_stream_text(&buffer);
            if !final_text.trim().is_empty() {
                if !emitted_content {
                    let payload = serde_json::json!({"event":"delta","delta":final_text}).to_string();
                    yield Ok(Event::default().data(payload));
                }
            }
        }
        let done = serde_json::json!({"event":"done"}).to_string();
        yield Ok(Event::default().data(done));
    };

    Ok(Sse::new(event_stream).keep_alive(
        KeepAlive::new()
            .interval(std::time::Duration::from_secs(10))
            .text("keep-alive"),
    ))
}

// ────────────────────────────────────────────────────────────
fn normalize_ai_stream_events(raw_line: &str) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    let mut raw = raw_line.trim();
    if let Some(stripped) = raw.strip_prefix("data:") {
        raw = stripped.trim();
    }
    if raw.is_empty() {
        return out;
    }
    if raw == "[DONE]" {
        out.push(serde_json::json!({"event":"done"}));
        return out;
    }
    if raw.len() >= 120 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
        if crate::modules::ai::is_hex_gibberish_run(raw) {
            return out;
        }
    }
    // 一些源站会把多个 JSON 对象粘在同一行（无换行分隔），这里先拆包再递归归一化。
    if raw.starts_with('{') {
        let mut packed = raw.to_string();
        let objects = drain_json_objects(&mut packed);
        if objects.len() > 1 && packed.trim().is_empty() {
            for item in objects {
                for ev in normalize_ai_stream_events(&item) {
                    out.push(ev);
                }
            }
            return out;
        }
    }
    let mut extracted: Option<String> = None;
    if raw.starts_with('{') || raw.starts_with('[') {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(raw) {
            let should_emit_done = is_finish_event_payload(&json);
            if is_reference_payload(&json) {
                if should_emit_done {
                    out.push(serde_json::json!({"event":"done"}));
                }
                return out;
            }
            if let Some((t, content, thinking)) = crate::modules::ai::extract_stream_fields(&json) {
                if let Some(stream_type) = t {
                    match stream_type {
                        1 => {
                            let content_cleaned = content
                                .as_deref()
                                .and_then(crate::modules::ai::clean_stream_chunk);
                            let thinking_cleaned = thinking
                                .as_deref()
                                .and_then(crate::modules::ai::clean_stream_chunk);

                            if let Some(cleaned) = content_cleaned.clone() {
                                out.push(serde_json::json!({"event":"delta","delta":cleaned}));
                            } else if let Some(cleaned) = thinking_cleaned.clone() {
                                out.push(serde_json::json!({"event":"thinking","delta":cleaned}));
                            }

                            if let (Some(content_v), Some(thinking_v)) =
                                (content_cleaned, thinking_cleaned)
                            {
                                if content_v != thinking_v {
                                    out.push(
                                        serde_json::json!({"event":"thinking","delta":thinking_v}),
                                    );
                                }
                            }
                            if should_emit_done {
                                out.push(serde_json::json!({"event":"done"}));
                            }
                            return out;
                        }
                        11 => {
                            if let Some(thinking_text) = thinking {
                                if let Some(cleaned) =
                                    crate::modules::ai::clean_stream_chunk(&thinking_text)
                                {
                                    out.push(
                                        serde_json::json!({"event":"thinking","delta":cleaned}),
                                    );
                                }
                            }
                            if should_emit_done {
                                out.push(serde_json::json!({"event":"done"}));
                            }
                            return out;
                        }
                        // 源站正文分片事件（不同模型/通道会返回不同 type）
                        4 | 12 => {
                            if let Some(content_text) = content.or(thinking) {
                                if let Some(cleaned) =
                                    crate::modules::ai::clean_stream_chunk(&content_text)
                                {
                                    out.push(serde_json::json!({"event":"delta","delta":cleaned}));
                                }
                            }
                            if should_emit_done {
                                out.push(serde_json::json!({"event":"done"}));
                            }
                            return out;
                        }
                        24 | 999 => {
                            if let Some(progress) = extract_progress_text(&json) {
                                if !progress.trim().is_empty() {
                                    out.push(
                                        serde_json::json!({"event":"progress","message":progress}),
                                    );
                                }
                            }
                            if should_emit_done {
                                out.push(serde_json::json!({"event":"done"}));
                            }
                            return out;
                        }
                        // 引用/检索/推荐问题元数据对象，直接忽略，防止 JSON 污染正文。
                        13 | 14 | 23 => {
                            if should_emit_done {
                                out.push(serde_json::json!({"event":"done"}));
                            }
                            return out;
                        }
                        // 其他未知 type 不走兜底提取，避免整包 JSON 被当成正文输出。
                        _ => {
                            if should_emit_done {
                                out.push(serde_json::json!({"event":"done"}));
                            }
                            return out;
                        }
                    }
                } else {
                    if let Some(content_text) = content.or(thinking) {
                        if let Some(cleaned) = crate::modules::ai::clean_stream_chunk(&content_text)
                        {
                            out.push(serde_json::json!({"event":"delta","delta":cleaned}));
                        }
                    }
                    if should_emit_done {
                        out.push(serde_json::json!({"event":"done"}));
                    }
                    return out;
                }
            }
            extracted = crate::modules::ai::extract_text_from_value(&json);
            if should_emit_done && extracted.as_deref().unwrap_or("").trim().is_empty() {
                out.push(serde_json::json!({"event":"done"}));
                return out;
            }
        }
    }
    let candidate = extracted.unwrap_or_else(|| raw.to_string());
    if let Some(cleaned) = crate::modules::ai::clean_stream_chunk(&candidate) {
        out.push(serde_json::json!({"event":"delta","delta":cleaned}));
    }
    out
}

// ────────────────────────────────────────────────────────────
fn is_done_event(event: &serde_json::Value) -> bool {
    event.get("event").and_then(|v| v.as_str()) == Some("done")
}

// ────────────────────────────────────────────────────────────
fn is_reference_payload(value: &serde_json::Value) -> bool {
    if let Some(obj) = value.as_object() {
        if let Some(chat_type) = obj.get("chatType").and_then(|v| v.as_str()) {
            if chat_type == "network_ref" {
                return true;
            }
        }
        if obj.contains_key("shardingInformation") {
            return true;
        }
        if let Some(data) = obj.get("data") {
            if let Some(data_obj) = data.as_object() {
                if let Some(chat_type) = data_obj.get("chatType").and_then(|v| v.as_str()) {
                    if chat_type == "network_ref" {
                        return true;
                    }
                }
                if data_obj.contains_key("shardingInformation") {
                    return true;
                }
                if data_obj.get("ref_content").is_some() && data_obj.get("ref_name").is_some() {
                    return true;
                }
            }
        }
    }
    false
}

// ────────────────────────────────────────────────────────────
fn is_finish_event_payload(value: &serde_json::Value) -> bool {
    fn is_finish_flag(v: &serde_json::Value) -> bool {
        match v {
            serde_json::Value::Number(n) => n.as_i64() == Some(1),
            serde_json::Value::String(s) => s.trim() == "1",
            _ => false,
        }
    }
    if let Some(v) = value.get("finish") {
        if is_finish_flag(v) {
            return true;
        }
    }
    if let Some(data) = value.get("data") {
        if let Some(v) = data.get("finish") {
            if is_finish_flag(v) {
                return true;
            }
        }
    }
    false
}

// ────────────────────────────────────────────────────────────
fn extract_progress_text(value: &serde_json::Value) -> Option<String> {
    if let Some(obj) = value.as_object() {
        if let Some(process_info) = obj.get("processInfo") {
            if let Some(s) = process_info.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
            if let Some(proc_obj) = process_info.as_object() {
                for key in ["content", "msg", "text"] {
                    if let Some(s) = proc_obj.get(key).and_then(|v| v.as_str()) {
                        let trimmed = s.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
        for key in ["message", "msg"] {
            if let Some(s) = obj.get(key).and_then(|v| v.as_str()) {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

// ────────────────────────────────────────────────────────────
fn decode_utf8_stream_chunk(bytes: &mut Vec<u8>) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    loop {
        match std::str::from_utf8(bytes) {
            Ok(valid) => {
                out.push_str(valid);
                bytes.clear();
                break;
            }
            Err(err) => {
                let valid_up_to = err.valid_up_to();
                if valid_up_to > 0 {
                    if let Ok(valid) = std::str::from_utf8(&bytes[..valid_up_to]) {
                        out.push_str(valid);
                    }
                    bytes.drain(..valid_up_to);
                }
                match err.error_len() {
                    None => {
                        break;
                    }
                    Some(err_len) => {
                        let drop_len = err_len.min(bytes.len());
                        if drop_len == 0 {
                            break;
                        }
                        bytes.drain(..drop_len);
                        out.push('�');
                    }
                }
            }
        }
        if bytes.is_empty() {
            break;
        }
    }
    out
}

// ────────────────────────────────────────────────────────────
fn drain_json_objects(buffer: &mut String) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut start: Option<usize> = None;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape = false;
    let mut last_end = 0usize;

    for (i, ch) in buffer.char_indices() {
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
                        out.push(buffer[s..=i].to_string());
                        last_end = i + 1;
                        start = None;
                    }
                }
            }
        }
    }

    if last_end > 0 {
        buffer.replace_range(0..last_end, "");
    } else if start.is_none() && buffer.len() > 65536 {
        buffer.clear();
    }

    out
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/ai_init", post(ai_init))
        .route("/ai_upload", post(ai_upload))
        .route("/ai_chat", post(ai_chat))
        .route("/ai_chat_stream", post(ai_chat_stream))
        .route("/ai_chat_session/new", post(ai_chat_session_new))
        .route("/ai_chat_session/history", post(ai_chat_session_history))
        .route("/ai_chat_session/messages", post(ai_chat_session_messages))
        .route("/ai_chat_session/delete", post(ai_chat_session_delete))
}
