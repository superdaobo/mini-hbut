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

fn extract_tid(one_code: &Value) -> String {
    one_code
        .pointer("/resultData/tid")
        .or_else(|| one_code.get("tid"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn extract_access_token(one_code: &Value, client_token: Option<&str>) -> String {
    if let Some(t) = client_token.map(str::trim).filter(|s| !s.is_empty()) {
        return t.to_string();
    }
    one_code
        .pointer("/resultData/accessToken")
        .or_else(|| one_code.pointer("/resultData/token"))
        .or_else(|| one_code.get("accessToken"))
        .or_else(|| one_code.get("token"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
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

    let _ = session_guard::ensure_one_code_electricity(&mut client).await;
    let one_code = match client.get_one_code_token().await {
        Ok(v) => v,
        Err(e) => {
            return Ok(OneCodeAppOpenPrepareResponse {
                success: false,
                open_url: String::new(),
                pay_url: String::new(),
                app_code: code,
                hint: String::new(),
                message: Some(format!("一码通会话不可用：{e}")),
                tid: None,
            });
        }
    };
    let tid = extract_tid(&one_code);
    let token = {
        let ensured = client.ensure_electricity_token().await.ok();
        extract_access_token(&one_code, ensured.as_deref())
    };

    let name = if display.is_empty() {
        code.as_str()
    } else {
        display.as_str()
    };

    let (open_url, hint) = match code.as_str() {
        // 缴电费：原生 H5 页（注意官方拼写 electricty）
        "electric" => {
            let url = if tid.is_empty() {
                format!(
                    "{CODE_BASE}/#/pages_payment/electrictyFees/electrictyFees?navbarTitle=%E7%BC%B4%E7%94%B5%E8%B4%B9&type=electric"
                )
            } else {
                format!(
                    "{CODE_BASE}/?tid={tid}&orgId=2#/pages_payment/electrictyFees/electrictyFees?navbarTitle=%E7%BC%B4%E7%94%B5%E8%B4%B9&type=electric"
                )
            };
            (
                url,
                "打开官方缴电费页，选择金额后完成支付（App 不内嵌支付）。".to_string(),
            )
        }
        // 教育网网费
        "broadband" => {
            let url = if tid.is_empty() {
                format!(
                    "{CODE_BASE}/#/pages_payment/networkFees/networkFees?navbarTitle=%E7%BC%B4%E7%BA%B3%E6%95%99%E8%82%B2%E7%BD%91%E7%BD%91%E8%B4%B9&type=broadband"
                )
            } else {
                format!(
                    "{CODE_BASE}/?tid={tid}&orgId=2#/pages_payment/networkFees/networkFees?navbarTitle=%E7%BC%B4%E7%BA%B3%E6%95%99%E8%82%B2%E7%BD%91%E7%BD%91%E8%B4%B9&type=broadband"
                )
            };
            (
                url,
                "打开官方网费缴纳页完成充值（App 不内嵌支付）。".to_string(),
            )
        }
        // 运动场馆
        "noQYzEiZ7L" => {
            let redirect = "http://172.16.54.20:9000/#/home";
            let encoded = urlencoding_lite(redirect);
            let mut url = format!("{CODE_BASE}/server/third/open?redirectUrl={encoded}");
            if !token.is_empty() {
                url.push_str(&format!("&accessToken={}", urlencoding_lite(&token)));
            }
            (
                url,
                "场馆系统可能仅校园网可达；若打不开请连接校园网。".to_string(),
            )
        }
        // 电量查询 / 其它第三方
        "jSJNLwI3bX" => {
            let encoded = urlencoding_lite(LIGHTAPP_REDIRECT);
            let mut url = format!("{CODE_BASE}/server/third/open?redirectUrl={encoded}");
            if !token.is_empty() {
                url.push_str(&format!("&accessToken={}", urlencoding_lite(&token)));
            }
            (
                url,
                "打开官方电量查询（智能水电）查看趋势与统计。".to_string(),
            )
        }
        _ => {
            let url = if tid.is_empty() {
                format!("{CODE_BASE}/#/pages_home/home")
            } else {
                format!("{CODE_BASE}/?tid={tid}&orgId=2#/pages_home/home")
            };
            (
                url,
                format!("打开后请在官方一码通中进入「{name}」。"),
            )
        }
    };

    Ok(OneCodeAppOpenPrepareResponse {
        success: !open_url.is_empty(),
        pay_url: open_url.clone(),
        open_url,
        app_code: code,
        hint,
        message: None,
        tid: if tid.is_empty() { None } else { Some(tid) },
    })
}

/// 电量查询（智能水电）趋势：weekuselist / monthuselist / todayuse
#[tauri::command(rename_all = "camelCase")]
pub async fn electricity_usage_stats(
    state: State<'_, AppState>,
    room_path: Option<Vec<String>>,
    room_verify: Option<String>,
) -> Result<Value, String> {
    let mut client = state.client.write().await;
    let student_id = client
        .user_info
        .as_ref()
        .map(|u| u.student_id.clone())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_default();

    let room = room_verify
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            // path 最后一段常是 room id，如 101-7--254-101
            room_path
                .as_ref()
                .and_then(|p| p.last().cloned())
                .filter(|s| s.contains('-'))
        })
        .unwrap_or_else(|| {
            // 前端 localStorage 可能有
            String::new()
        });

    match fetch_smart_electricity_stats(&mut client, &student_id, &room).await {
        Ok(v) => Ok(v),
        Err(e) => Ok(json!({
            "success": false,
            "summary": null,
            "points": [],
            "month_points": [],
            "today_use": null,
            "quantity": null,
            "room_name": null,
            "room_verify": room,
            "message": format!("电量趋势暂不可用：{e}"),
            "open_url": null
        })),
    }
}

async fn fetch_smart_electricity_stats(
    client: &mut crate::http_client::HbutClient,
    student_id: &str,
    room_verify: &str,
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

    // success:false 的 JSON 表示 token/第三方失败
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
        // 尝试从 getbindroom 拿
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

    // 4) getbindroom → roomverify
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

    let mut room = room_verify.to_string();
    let mut room_name = String::new();
    if let Some(b) = bind.as_ref() {
        if let Some(body) = parse_swae_body(b) {
            if let Some(rv) = body.get("roomverify").and_then(|v| v.as_str()) {
                if room.is_empty() {
                    room = rv.to_string();
                }
            }
            if let Some(rn) = body
                .get("roomfullname")
                .and_then(|v| v.as_str())
            {
                room_name = rn.to_string();
            }
        }
    }
    if room.is_empty() {
        return Err("未绑定宿舍房间，请先在官方电量查询中绑定".into());
    }

    // 5) h5_getstuindexpage — 含 weekuselist / monthuselist / todayuse
    let index = swae_post(
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
    .await?;

    let body = parse_swae_body(&index).ok_or_else(|| "电量首页数据解析失败".to_string())?;
    if room_name.is_empty() {
        room_name = body
            .get("roomfullname")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
    }

    let mod0 = body
        .get("modlist")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .cloned()
        .unwrap_or(json!({}));

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

    let week = mod0
        .get("weekuselist")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let points: Vec<Value> = week
        .iter()
        .map(|p| {
            json!({
                "label": p.get("date").or_else(|| p.get("daydate")).cloned().unwrap_or(json!("")),
                "date": p.get("date").cloned().unwrap_or(json!("")),
                "value": p.get("dayuse").or_else(|| p.get("use")).cloned().unwrap_or(json!(0)),
                "unit": "度",
                "weekday": p.get("weekday").cloned().unwrap_or(json!(""))
            })
        })
        .collect();

    let month = mod0
        .get("monthuselist")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let month_points: Vec<Value> = month
        .iter()
        .map(|p| {
            json!({
                "label": p.get("yearmonth").cloned().unwrap_or(json!("")),
                "value": p.get("monthuse").cloned().unwrap_or(json!(0)),
                "unit": "度"
            })
        })
        .collect();

    let week_sum: f64 = points
        .iter()
        .filter_map(|p| p.get("value").and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok())))
        .sum();

    Ok(json!({
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
        "message": null,
        "open_url": final_url
    }))
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
