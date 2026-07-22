//! 运动场馆预约（内网 172.16.54.20:9000）
//!
//! 协议逆向（Playwright 抓取前端 JS）：
//! - 入口：一码通 third/open → `?token=` → `POST /reserve/index/authentication`
//! - 请求体 SM2 加密（C1C3C2，公钥硬编码），响应 data 字段 SM2 解密
//! - Header：`token` + 可选 `roleId`
//! - 主要接口：listAll / detailByStadiumId / reserve / orderInfo.*

use crate::modules::session_guard;
use crate::AppState;
use serde_json::{json, Value};
use smcrypto::sm2::{Decrypt, Encrypt};
use tauri::State;

const VENUE_BASE: &str = "http://172.16.54.20:9000";
const VENUE_HOME: &str = "http://172.16.54.20:9000/#/home";
const CODE_BASE: &str = "https://code.hbut.edu.cn";

/// 前端 sm-crypto 公钥（含 04 前缀）；smcrypto 会自动 trim
const SM2_PUB: &str = "0450EF25B15AFE52744BA4E028D5E1CB306468CD60EDB8E98BBF38C79FAF5C891A6C9386528DCCF7C96930DC89176482F3987167DA97FE3576B5F5E2A1A5D4EACD";
/// 前端硬编码私钥（响应解密）
const SM2_PRIV: &str = "579C7865BE2AE33721C6135579627783DFECAF3A869A3A603E2F50CE3F508A75";

fn url_encode(raw: &str) -> String {
    urlencoding::encode(raw).into_owned()
}

fn sm2_encrypt_payload(plain: &str) -> Result<String, String> {
    let enc = Encrypt::new(SM2_PUB);
    let hex = enc.encrypt_hex(plain.as_bytes());
    // 与官方 JS 对齐：密文前加 04
    Ok(format!("04{hex}"))
}

fn sm2_decrypt_payload(cipher: &str) -> Result<String, String> {
    let hex = cipher.trim().trim_start_matches("04");
    if hex.is_empty() {
        return Err("空密文".into());
    }
    let dec = Decrypt::new(SM2_PRIV);
    let bytes = dec.decrypt_hex(hex);
    String::from_utf8(bytes).map_err(|e| format!("解密非 UTF-8：{e}"))
}

fn extract_query_token(url: &str) -> Option<String> {
    if url.trim().is_empty() {
        return None;
    }
    // hash 路由常见：http://host/#/home?token=xxx 或 ?token=xxx#/home
    if let Ok(u) = reqwest::Url::parse(url) {
        if let Some(t) = u
            .query_pairs()
            .find(|(k, _)| k == "token")
            .map(|(_, v)| v.to_string())
        {
            if !t.is_empty() {
                return Some(t);
            }
        }
        // fragment 内再挖一层
        if let Some(frag) = u.fragment() {
            if let Some(t) = extract_token_raw(frag) {
                return Some(t);
            }
        }
    }
    extract_token_raw(url)
}

fn extract_token_raw(raw: &str) -> Option<String> {
    let patterns = [
        r#"[?&#]token=([^&#"'<\s]+)"#,
        r#""token"\s*:\s*"([^"]+)""#,
        r#"'token'\s*:\s*'([^']+)'"#,
        r#"token%3D([A-Za-z0-9._\-%]+)"#,
    ];
    for pat in patterns {
        if let Ok(re) = regex::Regex::new(pat) {
            if let Some(c) = re.captures(raw) {
                if let Some(m) = c.get(1) {
                    let s = urlencoding::decode(m.as_str())
                        .map(|c| c.into_owned())
                        .unwrap_or_else(|_| m.as_str().to_string());
                    let s = s.trim().to_string();
                    if !s.is_empty() && s.len() >= 8 {
                        return Some(s);
                    }
                }
            }
        }
    }
    None
}

/// 把可能带引号/字符串的整型字段规范成 JSON number，避免 Java `For input string: ""0"`
fn coerce_json_int(v: &Value, default: i64) -> Value {
    match v {
        Value::Number(n) => Value::Number(n.clone()),
        Value::String(s) => {
            let t = s
                .trim()
                .trim_matches(|c| c == '"' || c == '\'')
                .trim();
            if t.is_empty() {
                return json!(default);
            }
            if let Ok(i) = t.parse::<i64>() {
                json!(i)
            } else if let Ok(f) = t.parse::<f64>() {
                json!(f as i64)
            } else {
                json!(default)
            }
        }
        Value::Null => json!(default),
        Value::Bool(b) => json!(if *b { 1 } else { 0 }),
        other => other.clone(),
    }
}

fn normalize_venue_json_body(body: Value) -> Value {
    let Some(mut obj) = body.as_object().cloned() else {
        return body;
    };
    for key in [
        "stadiumId",
        "half",
        "placeId",
        "pageNum",
        "pageSize",
        "orderId",
        "price",
        "totalPrice",
        "roleId",
        "followNum",
    ] {
        if let Some(v) = obj.get(key) {
            let def = if key == "pageNum" || key == "pageSize" {
                1
            } else {
                0
            };
            obj.insert(key.to_string(), coerce_json_int(v, def));
        }
    }
    // selectDate 必须是纯日期字符串
    if let Some(Value::String(s)) = obj.get("selectDate").cloned() {
        let t = s.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
        obj.insert("selectDate".into(), json!(t));
    }
    Value::Object(obj)
}

fn clean_role_id(role_id: Option<&str>) -> Option<String> {
    let s = role_id?.trim().trim_matches(|c| c == '"' || c == '\'').trim();
    if s.is_empty() {
        return None;
    }
    Some(s.to_string())
}

/// 场馆 HTTP：自动 SM2 加解密 + token 头
async fn venue_post(
    client: &reqwest::Client,
    path: &str,
    token: Option<&str>,
    role_id: Option<&str>,
    body: Option<Value>,
) -> Result<Value, String> {
    let url = format!("{VENUE_BASE}{path}");
    let mut req = client
        .post(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Origin", VENUE_BASE)
        .header("Referer", format!("{VENUE_BASE}/"));

    if let Some(t) = token.map(|s| s.trim().trim_matches(|c| c == '"' || c == '\'')).filter(|s| !s.is_empty()) {
        req = req.header("token", t);
    }
    if let Some(r) = clean_role_id(role_id) {
        req = req.header("roleId", r);
    }

    let req = if let Some(b) = body {
        let plain = if b.is_string() {
            b.as_str()
                .unwrap_or("")
                .trim()
                .trim_matches(|c| c == '"' || c == '\'')
                .to_string()
        } else {
            let normalized = normalize_venue_json_body(b);
            serde_json::to_string(&normalized).map_err(|e| e.to_string())?
        };
        let cipher = sm2_encrypt_payload(&plain)?;
        // axios 会把 string 再 JSON 序列化成 "\"04..\""
        req.json(&cipher)
    } else {
        req
    };

    let resp = req.send().await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("timed out") || msg.contains("error sending") {
            format!("场馆服务不可达（需校园网）：{msg}")
        } else {
            format!("场馆请求失败：{msg}")
        }
    })?;

    let status = resp.status();
    let raw: Value = resp
        .json()
        .await
        .map_err(|e| format!("场馆响应非 JSON（{status}）：{e}"))?;

    let code = raw
        .get("code")
        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()))
        .unwrap_or(0);
    let msg = raw
        .get("msg")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // 解密 data
    let mut data = raw.get("data").cloned().unwrap_or(Value::Null);
    if let Some(s) = data.as_str() {
        if s.starts_with("04") || s.len() > 64 {
            match sm2_decrypt_payload(s) {
                Ok(plain) => {
                    data = serde_json::from_str(&plain).unwrap_or(Value::String(plain));
                }
                Err(_) => {
                    // 可能未加密或已是明文
                }
            }
        }
    }

    if code != 200 && code != 0 {
        return Err(if msg.is_empty() {
            format!("场馆接口错误 code={code}")
        } else {
            msg
        });
    }

    Ok(json!({
        "code": code,
        "msg": msg,
        "success": true,
        "data": data
    }))
}

async fn mint_yimatong_access_token(
    client: &mut crate::http_client::HbutClient,
) -> Result<String, String> {
    // 失败时再走完整 get_one_code_token（含静默重登）
    match client.ensure_electricity_token().await {
        Ok(t) if !t.trim().is_empty() => Ok(t),
        _ => {
            let _ = session_guard::ensure_one_code_electricity(client).await;
            match client.ensure_electricity_token().await {
                Ok(t) if !t.trim().is_empty() => Ok(t),
                Ok(_) => Err("一码通 accessToken 为空，请重新登录门户".into()),
                Err(e) => Err(format!("一码通授权失败：{e}")),
            }
        }
    }
}

/// 手动跟随 third/open 重定向，从 Location / 最终 URL / HTML 抽 token
async fn fetch_venue_sso_token(
    client: &crate::http_client::HbutClient,
    access: &str,
    redirect_target: &str,
) -> Result<String, String> {
    let open_url = format!(
        "{CODE_BASE}/server/third/open?redirectUrl={}&accessToken={}",
        url_encode(redirect_target),
        url_encode(access)
    );

    // 1) 自动跟随
    if let Ok(resp) = client
        .client
        .get(&open_url)
        .header("Accept", "text/html,application/json,*/*")
        .header("Referer", format!("{CODE_BASE}/"))
        .header("Authorization", access)
        .header("token", access)
        .send()
        .await
    {
        let final_url = resp.url().to_string();
        let body = resp.text().await.unwrap_or_default();
        if let Some(t) = extract_query_token(&final_url).or_else(|| extract_query_token(&body)) {
            return Ok(t);
        }
        // JSON 里可能带跳转地址
        if let Ok(v) = serde_json::from_str::<Value>(&body) {
            for key in ["url", "redirectUrl", "redirect", "data", "resultData"] {
                if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
                    if let Some(t) = extract_query_token(s) {
                        return Ok(t);
                    }
                }
                if let Some(obj) = v.get(key) {
                    for k2 in ["url", "redirectUrl", "token"] {
                        if let Some(s) = obj.get(k2).and_then(|x| x.as_str()) {
                            if k2 == "token" && s.len() >= 8 {
                                return Ok(s.to_string());
                            }
                            if let Some(t) = extract_query_token(s) {
                                return Ok(t);
                            }
                        }
                    }
                }
            }
            if v.get("success").and_then(|b| b.as_bool()) == Some(false) {
                let msg = v
                    .get("message")
                    .or_else(|| v.get("msg"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("一码通未授权场馆");
                return Err(msg.to_string());
            }
        }
        if body.contains("\"success\":false") {
            return Err("一码通未授权场馆应用，请稍后重试".into());
        }
    }

    // 2) 手动跟踪 Location（fragment 上的 token 常只出现在中间跳转）
    let no_redir = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::clone(&client.cookie_jar))
        .redirect(reqwest::redirect::Policy::none())
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let mut current = open_url;
    for _ in 0..14 {
        let resp = no_redir
            .get(&current)
            .header("Accept", "text/html,application/json,*/*")
            .header("Referer", format!("{CODE_BASE}/"))
            .header("Authorization", access)
            .header("token", access)
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => return Err(format!("场馆跳转失败：{e}")),
        };
        let status = resp.status();
        let this_url = resp.url().to_string();
        if let Some(t) = extract_query_token(&this_url) {
            return Ok(t);
        }
        let loc = resp
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        if let Some(ref location) = loc {
            if let Some(t) = extract_query_token(location) {
                return Ok(t);
            }
            current = if location.starts_with("http") {
                location.clone()
            } else if location.starts_with('/') {
                format!("{CODE_BASE}{location}")
            } else {
                location.clone()
            };
            if status.is_redirection() {
                continue;
            }
        }
        let body = resp.text().await.unwrap_or_default();
        if let Some(t) = extract_query_token(&body) {
            return Ok(t);
        }
        if !status.is_redirection() {
            break;
        }
    }

    Err(format!(
        "未能从跳转结果解析场馆 token（目标 {redirect_target}）"
    ))
}

/// 一码通 third/open → 场馆 URL 带 token → authentication
async fn login_venue(
    client: &mut crate::http_client::HbutClient,
) -> Result<(String, Value), String> {
    let access = mint_yimatong_access_token(client).await?;

    // 多种 redirect 形态：官方 H5 常把 token 挂在 query 或 hash
    let redirect_targets = [
        VENUE_HOME,
        "http://172.16.54.20:9000/",
        "http://172.16.54.20:9000/#/",
        "http://172.16.54.20:9000/index.html",
    ];

    let mut last_err = String::new();
    let mut sso_token = None;
    for target in redirect_targets {
        match fetch_venue_sso_token(client, &access, target).await {
            Ok(t) => {
                sso_token = Some(t);
                break;
            }
            Err(e) => last_err = e,
        }
    }

    // accessToken 可能过期：强制重新 ensure 再试一次
    let sso_token = match sso_token {
        Some(t) => t,
        None => {
            let access2 = client
                .ensure_electricity_token()
                .await
                .map_err(|e| format!("刷新一码通 token 失败：{e}"))?;
            match fetch_venue_sso_token(client, &access2, VENUE_HOME).await {
                Ok(t) => t,
                Err(e) => {
                    return Err(format!(
                        "{last_err}；重试后仍失败：{e}。请确认已连校园网且门户会话有效"
                    ));
                }
            }
        }
    };

    // authentication：body 为加密后的 token 字符串
    let auth = venue_post(
        &client.client,
        "/reserve/index/authentication",
        None,
        None,
        Some(Value::String(sso_token)),
    )
    .await?;

    let data = auth.get("data").cloned().unwrap_or(json!({}));
    let token = data
        .get("token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if token.is_empty() {
        return Err("场馆登录未返回 token".into());
    }
    let user = data.get("userInfo").cloned().unwrap_or(json!({}));
    Ok((token, user))
}

fn role_id_of(user: &Value) -> Option<String> {
    user.get("roleId")
        .and_then(|v| v.as_i64().map(|n| n.to_string()).or_else(|| v.as_str().map(|s| s.to_string())))
}

/// 登录并拉取场馆列表
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_bootstrap(state: State<'_, AppState>) -> Result<Value, String> {
    let mut client = state.client.write().await;
    let (token, user) = login_venue(&mut client).await?;
    let role = role_id_of(&user);

    let list = venue_post(
        &client.client,
        "/reserve/stadium/listAll",
        Some(&token),
        role.as_deref(),
        None,
    )
    .await;

    let stadiums = match list {
        Ok(v) => v.get("data").cloned().unwrap_or(json!([])),
        Err(e) => {
            return Ok(json!({
                "success": false,
                "token": token,
                "user": user,
                "stadiums": [],
                "message": e
            }));
        }
    };

    Ok(json!({
        "success": true,
        "token": token,
        "user": user,
        "stadiums": stadiums,
        "message": null,
        "need_campus_net": true
    }))
}

/// 某场馆某日场地/时段
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_detail(
    state: State<'_, AppState>,
    token: String,
    role_id: Option<String>,
    stadium_id: Value,
    select_date: String,
    half: Option<Value>,
) -> Result<Value, String> {
    let client = state.client.read().await;
    let half_n = half
        .as_ref()
        .map(|v| coerce_json_int(v, 0))
        .unwrap_or_else(|| json!(0));
    let stadium_n = coerce_json_int(&stadium_id, 0);
    let date = select_date
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .to_string();
    if date.is_empty() {
        return Err("请选择预约日期".into());
    }
    let body = json!({
        "stadiumId": stadium_n,
        "selectDate": date,
        "half": half_n
    });
    crate::runtime_log::log_info(
        "SportsVenue",
        format!("detail body={body}"),
    );
    venue_post(
        &client.client,
        "/reserve/place/detailByStadiumId",
        Some(token.trim()),
        role_id.as_deref(),
        Some(body),
    )
    .await
}

/// 提交预约
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_reserve(
    state: State<'_, AppState>,
    token: String,
    role_id: Option<String>,
    payload: Value,
) -> Result<Value, String> {
    let client = state.client.read().await;
    venue_post(
        &client.client,
        "/reserve/place/reserve",
        Some(token.trim()),
        role_id.as_deref(),
        Some(payload),
    )
    .await
}

/// 我的订单
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_orders(
    state: State<'_, AppState>,
    token: String,
    role_id: Option<String>,
    page_num: Option<i64>,
    page_size: Option<i64>,
    date_range: Option<Value>,
) -> Result<Value, String> {
    let client = state.client.read().await;
    let body = json!({
        "pageNum": page_num.unwrap_or(1),
        "pageSize": page_size.unwrap_or(10),
        "dateRange": date_range.unwrap_or(Value::Null)
    });
    venue_post(
        &client.client,
        "/reserve/orderInfo/list",
        Some(token.trim()),
        role_id.as_deref(),
        Some(body),
    )
    .await
}

/// 我的预约记录
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_records(
    state: State<'_, AppState>,
    token: String,
    role_id: Option<String>,
    page_num: Option<i64>,
    page_size: Option<i64>,
) -> Result<Value, String> {
    let client = state.client.read().await;
    let body = json!({
        "pageNum": page_num.unwrap_or(1),
        "pageSize": page_size.unwrap_or(10)
    });
    venue_post(
        &client.client,
        "/reserve/reserveRecord/list",
        Some(token.trim()),
        role_id.as_deref(),
        Some(body),
    )
    .await
}

/// 发起支付（校园卡密码）
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_pay(
    state: State<'_, AppState>,
    token: String,
    role_id: Option<String>,
    order_id: Value,
    price: Value,
    password: String,
) -> Result<Value, String> {
    let client = state.client.read().await;
    // 部分流程先 callPay 再 pay
    let _ = venue_post(
        &client.client,
        "/reserve/orderInfo/callPay",
        Some(token.trim()),
        role_id.as_deref(),
        Some(json!({ "orderId": order_id })),
    )
    .await;

    venue_post(
        &client.client,
        "/reserve/orderInfo/pay",
        Some(token.trim()),
        role_id.as_deref(),
        Some(json!({
            "orderId": order_id,
            "price": price,
            "password": password
        })),
    )
    .await
}

/// 取消未支付订单
#[tauri::command(rename_all = "camelCase")]
pub async fn sports_venue_cancel_pay(
    state: State<'_, AppState>,
    token: String,
    role_id: Option<String>,
    order_id: Value,
) -> Result<Value, String> {
    let client = state.client.read().await;
    venue_post(
        &client.client,
        "/reserve/orderInfo/cancelPay",
        Some(token.trim()),
        role_id.as_deref(),
        Some(json!({ "orderId": order_id })),
    )
    .await
}
