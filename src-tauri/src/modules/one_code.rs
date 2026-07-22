//! 一码通模块：token、官方页打开链接、电量趋势（智能水电）

use crate::modules::session_guard;
use crate::AppState;
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

const CODE_BASE: &str = "https://code.hbut.edu.cn";
const LIGHTAPP_REDIRECT: &str = "https://code.hbut.edu.cn/lightappService/host/docking/geteWayForV8?state=da0c4cbd3f224986a79c5fe376a05ed6";
const SWAE_BASE: &str = "https://code.hbut.edu.cn/smartWaterAndElectricityService";

#[derive(Debug, Serialize, Deserialize)]
pub struct OneCodeTokenResponse {
    pub success: bool,
    pub tid: String,
    pub result_data: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OneCodeAppOpenPrepareResponse {
    pub success: bool,
    pub open_url: String,
    pub pay_url: String,
    pub app_code: String,
    pub hint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tid: Option<String>,
}

#[tauri::command]
pub async fn hbut_one_code_token(
    state: State<'_, AppState>,
) -> Result<OneCodeTokenResponse, String> {
    let mut client = state.client.write().await;
    let res = client
        .get_one_code_token()
        .await
        .map_err(|e| e.to_string())?;

    Ok(OneCodeTokenResponse {
        success: res
            .get("success")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        tid: res
            .get("tid")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        result_data: res
            .get("resultData")
            .cloned()
            .unwrap_or_else(|| json!({})),
    })
}

fn urlencoding_lite(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len() * 3);
    for b in raw.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 打开一码通官方应用入口。
///
/// 重要：不要同时声明 `app_code` 与 `appCode` 两个参数。
/// `rename_all = "camelCase"` 会把 `app_code` 映射为前端的 `appCode`；
/// 再声明同名 `appCode` 会导致 IPC 参数 schema 冲突，
/// 前端报：missing required key appCode。
#[tauri::command(rename_all = "camelCase")]
pub async fn one_code_app_open_prepare(
    state: State<'_, AppState>,
    app_code: Option<String>,
    app_name: Option<String>,
) -> Result<OneCodeAppOpenPrepareResponse, String> {
    let mut client = state.client.write().await;
    let code = app_code.unwrap_or_default().trim().to_string();
    let display = app_name.unwrap_or_default().trim().to_string();

    if code.is_empty() {
        return Ok(OneCodeAppOpenPrepareResponse {
            success: false,
            open_url: String::new(),
            pay_url: String::new(),
            app_code: code,
            hint: String::new(),
            message: Some("缺少 appCode".into()),
            tid: None,
        });
    }

    // 先确保 API 用 accessToken 可用（会消费一枚 tid，这是预期行为）
    let _ = session_guard::ensure_one_code_electricity(&mut client).await;
    let token = client
        .ensure_electricity_token()
        .await
        .unwrap_or_default();

    // 再单独签发「未消费」的浏览器 tid。
    // 切勿复用 get_one_code_token() 返回的 tid——那枚已被 getToken 换掉，外链会「无效TID」。
    let browser_tid = match client.mint_one_code_browser_tid().await {
        Ok(t) => t,
        Err(e) => {
            // 原生缴费页强依赖未消费 tid；第三方仍可用 accessToken
            let needs_browser_tid = matches!(code.as_str(), "electric" | "broadband")
                || !matches!(code.as_str(), "noQYzEiZ7L" | "jSJNLwI3bX");
            if needs_browser_tid {
                return Ok(OneCodeAppOpenPrepareResponse {
                    success: false,
                    open_url: String::new(),
                    pay_url: String::new(),
                    app_code: code,
                    hint: String::new(),
                    message: Some(format!("无法获取有效登录票：{e}")),
                    tid: None,
                });
            }
            String::new()
        }
    };
    let tid_q = if browser_tid.is_empty() {
        String::new()
    } else {
        urlencoding_lite(&browser_tid)
    };

    let name = if display.is_empty() {
        code.as_str()
    } else {
        display.as_str()
    };

    let spa_entry = |hash_path: &str| -> String {
        if tid_q.is_empty() {
            format!("{CODE_BASE}/#{hash_path}")
        } else {
            // 官方落地格式：/?tid=...&orgId=2#/pages_...
            format!("{CODE_BASE}/?tid={tid_q}&orgId=2#{hash_path}")
        }
    };

    let (open_url, hint) = match code.as_str() {
        // 缴电费：原生 H5（官方拼写 electricty）
        "electric" => (
            spa_entry(
                "/pages_payment/electrictyFees/electrictyFees?navbarTitle=%E7%BC%B4%E7%94%B5%E8%B4%B9&type=electric",
            ),
            "在官方页完成缴纳".to_string(),
        ),
        // 教育网网费
        "broadband" => (
            spa_entry(
                "/pages_payment/networkFees/networkFees?navbarTitle=%E7%BC%B4%E7%BA%B3%E6%95%99%E8%82%B2%E7%BD%91%E7%BD%91%E8%B4%B9&type=broadband",
            ),
            "在官方页完成缴纳".to_string(),
        ),
        // 运动场馆（第三方 + accessToken）
        "noQYzEiZ7L" => {
            let redirect = "http://172.16.54.20:9000/#/home";
            let encoded = urlencoding_lite(redirect);
            let mut url = format!("{CODE_BASE}/server/third/open?redirectUrl={encoded}");
            if !token.is_empty() {
                url.push_str(&format!("&accessToken={}", urlencoding_lite(&token)));
            }
            (url, "需校园网".to_string())
        }
        // 电量查询 / 智能水电
        "jSJNLwI3bX" => {
            let encoded = urlencoding_lite(LIGHTAPP_REDIRECT);
            let mut url = format!("{CODE_BASE}/server/third/open?redirectUrl={encoded}");
            if !token.is_empty() {
                url.push_str(&format!("&accessToken={}", urlencoding_lite(&token)));
            }
            (url, "官方电量查询".to_string())
        }
        _ => (
            spa_entry("/pages_home/home"),
            format!("打开「{name}」"),
        ),
    };

    Ok(OneCodeAppOpenPrepareResponse {
        success: !open_url.is_empty(),
        pay_url: open_url.clone(),
        open_url,
        app_code: code,
        hint,
        message: None,
        tid: if browser_tid.is_empty() {
            None
        } else {
            Some(browser_tid)
        },
    })
}

/// 电量查询（智能水电）趋势：weekuselist / monthuselist / todayuse
///
/// 宿舍数据集 room value 形如 `101-1--174-1101`，可直接作为 SWAE `roomverify`。
/// 优先查所选房间；失败再回退官方绑定房间。
#[tauri::command(rename_all = "camelCase")]
pub async fn electricity_usage_stats(
    state: State<'_, AppState>,
    room_path: Option<Vec<String>>,
    room_verify: Option<String>,
    room_label: Option<String>,
) -> Result<Value, String> {
    let mut client = state.client.write().await;
    let student_id = client
        .user_info
        .as_ref()
        .map(|u| u.student_id.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();

    // 候选 roomverify：选择器 room_id > path 末段 > 空（走绑定）
    let preferred = room_verify
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            room_path
                .as_ref()
                .and_then(|p| p.last().cloned())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_default();

    let label = room_label.unwrap_or_default();

    match fetch_smart_electricity_stats(&mut client, &student_id, &preferred, &label).await {
        Ok(v) => Ok(v),
        Err(e) => Ok(json!({
            "success": false,
            "summary": null,
            "points": [],
            "month_points": [],
            "today_use": null,
            "quantity": null,
            "room_name": null,
            "room_verify": if preferred.is_empty() { Value::Null } else { json!(preferred) },
            "source": null,
            "message": format!("电量趋势暂不可用：{e}"),
            "open_url": null
        })),
    }
}

/// 宿舍 room value 是否像 SWAE roomverify：`101-1--174-1101`
fn looks_like_roomverify(s: &str) -> bool {
    let s = s.trim();
    s.contains("--") || (s.matches('-').count() >= 2 && s.chars().any(|c| c.is_ascii_digit()))
}

async fn fetch_smart_electricity_stats(
    client: &mut crate::http_client::HbutClient,
    student_id: &str,
    preferred_room: &str,
    preferred_label: &str,
) -> Result<Value, String> {
    let _ = session_guard::ensure_one_code_electricity(client).await;
    let token = client
        .ensure_electricity_token()
        .await
        .map_err(|e| e.to_string())?;

    // 1) third/open → 跟随跳转到智能水电，提取 params
    let encoded = urlencoding_lite(LIGHTAPP_REDIRECT);
    let open_url = format!(
        "{CODE_BASE}/server/third/open?redirectUrl={encoded}&accessToken={}",
        urlencoding_lite(&token)
    );

    let resp = client
        .client
        .get(&open_url)
        .header("Accept", "text/html,application/json,*/*")
        .header("Referer", format!("{CODE_BASE}/"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let final_url = resp.url().to_string();
    let body_text = resp.text().await.unwrap_or_default();

    if body_text.contains("\"success\":false") {
        return Err("第三方电量服务打开失败，请稍后重试".into());
    }

    let params = extract_params_from_url(&final_url)
        .or_else(|| extract_params_from_html(&body_text))
        .ok_or_else(|| "未能解析电量查询会话参数".to_string())?;

    // 2) loginCheck
    let login_body = format!("data={}", urlencoding_lite(&params));
    let _ = client
        .client
        .post(format!("{SWAE_BASE}/loginCheck"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Origin", CODE_BASE)
        .header("Referer", &final_url)
        .body(login_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let sid = if student_id.trim().is_empty() {
        "0".to_string()
    } else {
        student_id.trim().to_string()
    };

    let ts = Local::now().format("%Y%m%d%H%M%S%3f").to_string();

    // 3) login
    let _ = swae_post(
        client,
        &final_url,
        "login",
        json!({
            "cmd": "login",
            "outid": sid,
            "account": sid,
            "timestamp": ts
        }),
    )
    .await;

    // 4) getbindroom → 绑定房间（回退用）
    let bind = swae_post(
        client,
        &final_url,
        "getbindroom",
        json!({
            "cmd": "getbindroom",
            "account": sid,
            "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
        }),
    )
    .await
    .ok();

    let mut bound_room = String::new();
    let mut bound_name = String::new();
    if let Some(b) = bind.as_ref() {
        if let Some(body) = parse_swae_body(b) {
            if let Some(rv) = body.get("roomverify").and_then(|v| v.as_str()) {
                bound_room = rv.trim().to_string();
            }
            if let Some(rn) = body.get("roomfullname").and_then(|v| v.as_str()) {
                bound_name = rn.to_string();
            }
        }
    }

    // 候选：所选房间优先，再绑定房间
    let mut candidates: Vec<(String, &'static str, String)> = Vec::new();
    if looks_like_roomverify(preferred_room) {
        candidates.push((
            preferred_room.trim().to_string(),
            "selected",
            preferred_label.trim().to_string(),
        ));
    }
    if !bound_room.is_empty()
        && !candidates
            .iter()
            .any(|(r, _, _)| r == &bound_room)
    {
        candidates.push((bound_room.clone(), "bound", bound_name.clone()));
    }
    if candidates.is_empty() {
        return Err("未选择有效房间，且官方电量查询未绑定宿舍".into());
    }

    // 5) 按候选依次拉 h5_getstuindexpage
    let mut last_err = String::new();
    for (room, source, mut room_name) in candidates {
        let index = match swae_post(
            client,
            &final_url,
            "h5_getstuindexpage",
            json!({
                "cmd": "h5_getstuindexpage",
                "roomverify": room,
                "account": sid,
                "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
            }),
        )
        .await
        {
            Ok(v) => v,
            Err(e) => {
                last_err = e;
                continue;
            }
        };

        let Some(body) = parse_swae_body(&index) else {
            last_err = "电量首页数据解析失败".into();
            continue;
        };

        if room_name.is_empty() {
            room_name = body
                .get("roomfullname")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }
        if room_name.is_empty() && !preferred_label.is_empty() && source == "selected" {
            room_name = preferred_label.trim().to_string();
        }

        let mod0 = body
            .get("modlist")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .cloned()
            .unwrap_or(json!({}));

        let mut week = mod0
            .get("weekuselist")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        if week.is_empty() {
            for method in ["h5_getweekuselist", "getweekuselist", "h5_getdayuselist"] {
                if let Ok(extra) = swae_post(
                    client,
                    &final_url,
                    method,
                    json!({
                        "cmd": method,
                        "roomverify": room,
                        "account": sid,
                        "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
                    }),
                )
                .await
                {
                    if let Some(b) = parse_swae_body(&extra) {
                        if let Some(arr) = b
                            .get("weekuselist")
                            .or_else(|| b.get("list"))
                            .or_else(|| b.get("dayuselist"))
                            .and_then(|v| v.as_array())
                        {
                            if !arr.is_empty() {
                                week = arr.clone();
                                break;
                            }
                        }
                    }
                }
            }
        }

        let points: Vec<Value> = week
            .iter()
            .map(|p| {
                json!({
                    "label": p.get("date").or_else(|| p.get("daydate")).cloned().unwrap_or(json!("")),
                    "date": p.get("date").or_else(|| p.get("daydate")).cloned().unwrap_or(json!("")),
                    "value": p.get("dayuse").or_else(|| p.get("use")).cloned().unwrap_or(json!(0)),
                    "unit": "度",
                    "weekday": p.get("weekday").cloned().unwrap_or(json!(""))
                })
            })
            .collect();

        let mut month = mod0
            .get("monthuselist")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        if month.is_empty() {
            for method in ["h5_getmonthuselist", "getmonthuselist"] {
                if let Ok(extra) = swae_post(
                    client,
                    &final_url,
                    method,
                    json!({
                        "cmd": method,
                        "roomverify": room,
                        "account": sid,
                        "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
                    }),
                )
                .await
                {
                    if let Some(b) = parse_swae_body(&extra) {
                        if let Some(arr) = b
                            .get("monthuselist")
                            .or_else(|| b.get("list"))
                            .and_then(|v| v.as_array())
                        {
                            if !arr.is_empty() {
                                month = arr.clone();
                                break;
                            }
                        }
                    }
                }
            }
        }

        let month_points: Vec<Value> = month
            .iter()
            .map(|p| {
                json!({
                    "label": p.get("yearmonth").or_else(|| p.get("month")).cloned().unwrap_or(json!("")),
                    "value": p.get("monthuse").or_else(|| p.get("use")).cloned().unwrap_or(json!(0)),
                    "unit": "度"
                })
            })
            .collect();

        // 所选房间若完全无数据，继续试绑定房间
        if points.is_empty() && month_points.is_empty() {
            last_err = format!("房间 {room} 暂无用电曲线");
            continue;
        }

        let today_use = mod0.get("todayuse").cloned();
        let quantity = mod0
            .get("odd")
            .or_else(|| mod0.get("sumbuy"))
            .cloned();
        let price = mod0.get("price").cloned();
        let device = mod0
            .get("devicename")
            .and_then(|v| v.as_str())
            .unwrap_or("电表")
            .to_string();
        let line_status = mod0
            .get("linestatus")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|o| o.get("desc"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let week_sum: f64 = points
            .iter()
            .filter_map(|p| {
                p.get("value")
                    .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()))
            })
            .sum();

        return Ok(json!({
            "success": true,
            "summary": format!("近{}日用电合计 {:.1} 度", points.len(), week_sum),
            "points": points,
            "month_points": month_points,
            "today_use": today_use,
            "quantity": quantity,
            "price": price,
            "device_name": device,
            "line_status": line_status,
            "room_name": room_name,
            "room_verify": room,
            "source": source,
            "bound_room_verify": if bound_room.is_empty() { Value::Null } else { json!(bound_room) },
            "bound_room_name": if bound_name.is_empty() { Value::Null } else { json!(bound_name) },
            "message": null,
            "hint": if source == "selected" {
                "用电趋势已跟随当前所选房间"
            } else {
                "所选房间无趋势数据，已显示官方绑定房间"
            },
            "open_url": final_url
        }));
    }

    Err(if last_err.is_empty() {
        "无法获取用电趋势".into()
    } else {
        last_err
    })
}

async fn swae_post(
    client: &crate::http_client::HbutClient,
    referer: &str,
    method: &str,
    param: Value,
) -> Result<Value, String> {
    let param_str = serde_json::to_string(&param).map_err(|e| e.to_string())?;
    let body = format!(
        "param={}&customercode=2&method={}&command=undefined",
        urlencoding_lite(&param_str),
        urlencoding_lite(method)
    );
    let resp = client
        .client
        .post(format!("{SWAE_BASE}/SWAEServlet"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Origin", CODE_BASE)
        .header("Referer", referer)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

fn parse_swae_body(v: &Value) -> Option<Value> {
    let body = v.get("body")?.as_str()?;
    serde_json::from_str(body).ok()
}

fn extract_params_from_url(url: &str) -> Option<String> {
    let u = reqwest::Url::parse(url).ok()?;
    u.query_pairs()
        .find(|(k, _)| k == "params")
        .map(|(_, v)| v.to_string())
}

fn extract_params_from_html(html: &str) -> Option<String> {
    // params=... 或 "params":"..."
    if let Some(i) = html.find("params=") {
        let rest = &html[i + 7..];
        let end = rest
            .find(|c: char| c == '&' || c == '"' || c == '\'' || c.is_whitespace())
            .unwrap_or(rest.len().min(2000));
        let p = rest[..end].to_string();
        if !p.is_empty() {
            return Some(p);
        }
    }
    None
}
