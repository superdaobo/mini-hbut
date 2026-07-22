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

    // 缴电费/网费强依赖「未消费」浏览器 tid。
    // 重要：先 mint tid，再（可选）换 accessToken，避免 getToken 把会话打乱后拿不到票。
    let needs_browser_tid = matches!(code.as_str(), "electric" | "broadband")
        || !matches!(code.as_str(), "noQYzEiZ7L" | "jSJNLwI3bX");

    let mut browser_tid = String::new();
    let mut tid_err = String::new();
    for attempt in 0..2 {
        match client.mint_one_code_browser_tid().await {
            Ok(t) if !t.trim().is_empty() => {
                browser_tid = t;
                break;
            }
            Ok(_) => {
                tid_err = "签发的 tid 为空".into();
            }
            Err(e) => {
                tid_err = e.to_string();
            }
        }
        if attempt == 0 {
            // 会话掉线：走一次完整 SSO/静默重登后再 mint
            let _ = session_guard::ensure_one_code_electricity(&mut client).await;
            let _ = client.get_one_code_token().await;
        }
    }

    if needs_browser_tid && browser_tid.is_empty() {
        return Ok(OneCodeAppOpenPrepareResponse {
            success: false,
            open_url: String::new(),
            pay_url: String::new(),
            app_code: code,
            hint: String::new(),
            message: Some(format!(
                "无法获取有效登录票（tid）：{tid_err}。请重新登录门户后再试"
            )),
            tid: None,
        });
    }

    // 第三方应用（场馆/电量）需要 accessToken
    let token = if matches!(code.as_str(), "noQYzEiZ7L" | "jSJNLwI3bX") || !needs_browser_tid {
        let _ = session_guard::ensure_one_code_electricity(&mut client).await;
        client
            .ensure_electricity_token()
            .await
            .unwrap_or_default()
    } else {
        // 缴费页不强制 accessToken；有则更好
        client
            .ensure_electricity_token()
            .await
            .unwrap_or_default()
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
    // 双计费空调表 roomverify（可选）
    room_verify_alt: Option<String>,
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
    let alt = room_verify_alt
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s != &preferred)
        .unwrap_or_default();

    let label = room_label.unwrap_or_default();

    // 主房间失败时再试空调表（仍算所选房间，不是绑定房）
    let primary = fetch_smart_electricity_stats(&mut client, &student_id, &preferred, &label).await;
    match primary {
        Ok(v) => Ok(v),
        Err(e1) if !alt.is_empty() => {
            crate::runtime_log::log_info(
                "ElectricityUsage",
                format!("主表失败，尝试空调表 alt={alt} err={e1}"),
            );
            match fetch_smart_electricity_stats(&mut client, &student_id, &alt, &label).await {
                Ok(mut v) => {
                    if let Some(obj) = v.as_object_mut() {
                        obj.insert(
                            "hint".into(),
                            json!("用电趋势：当前所选房间（空调表）"),
                        );
                    }
                    Ok(v)
                }
                Err(e2) => Ok(json!({
                    "success": false,
                    "summary": null,
                    "points": [],
                    "month_points": [],
                    "today_use": null,
                    "quantity": null,
                    "room_name": label,
                    "room_verify": preferred,
                    "source": "selected",
                    "message": format!("电量趋势暂不可用：{e1}；空调表：{e2}"),
                    "open_url": null
                })),
            }
        }
        Err(e) => Ok(json!({
            "success": false,
            "summary": null,
            "points": [],
            "month_points": [],
            "today_use": null,
            "quantity": null,
            "room_name": label,
            "room_verify": if preferred.is_empty() { Value::Null } else { json!(preferred) },
            "source": if preferred.is_empty() { Value::Null } else { json!("selected") },
            "message": format!("电量趋势暂不可用：{e}"),
            "open_url": null
        })),
    }
}

/// 宿舍 room value 是否像 SWAE roomverify：`101-1--174-1101`
#[allow(dead_code)]
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

    // 用户已选房间：只查该房，绝不静默换成绑定房；未选才用绑定房
    let mut candidates: Vec<(String, &'static str, String)> = Vec::new();
    let pref = preferred_room.trim();
    if !pref.is_empty() {
        candidates.push((
            pref.to_string(),
            "selected",
            preferred_label.trim().to_string(),
        ));
        crate::runtime_log::log_info(
            "ElectricityUsage",
            format!("按所选房间查趋势 roomverify={pref}"),
        );
    } else if !bound_room.is_empty() {
        candidates.push((bound_room.clone(), "bound", bound_name.clone()));
        crate::runtime_log::log_info(
            "ElectricityUsage",
            format!("未选房间，使用绑定房 roomverify={bound_room}"),
        );
    }
    if candidates.is_empty() {
        return Err("请先在上方选择房间，或到一码通绑定宿舍后再查趋势".into());
    }

    // 5) 按候选依次拉趋势（增强：全 modlist + 多接口 + roomverify 变体）
    let mut last_err = String::new();
    for (room, source, room_name) in candidates {
        match fetch_usage_for_room(
            client,
            &final_url,
            &sid,
            &room,
            &room_name,
            source,
            &bound_room,
            &bound_name,
            preferred_label,
        )
        .await
        {
            Ok(v) => return Ok(v),
            Err(e) => {
                last_err = e;
                crate::runtime_log::log_warn(
                    "ElectricityUsage",
                    format!("房间 {room} 趋势失败: {last_err}"),
                );
            }
        }
    }

    Err(if last_err.is_empty() {
        "无法获取用电趋势".into()
    } else {
        last_err
    })
}

/// 拉取单房间用电趋势
async fn fetch_usage_for_room(
    client: &crate::http_client::HbutClient,
    final_url: &str,
    sid: &str,
    room: &str,
    room_name_hint: &str,
    source: &str,
    bound_room: &str,
    bound_name: &str,
    preferred_label: &str,
) -> Result<Value, String> {
    let mut room_name = room_name_hint.to_string();
    let room_variants = roomverify_variants(room);
    crate::runtime_log::log_info(
        "ElectricityUsage",
        format!("查询房间 variants={room_variants:?}"),
    );

    let mut best_week: Vec<Value> = Vec::new();
    let mut best_month: Vec<Value> = Vec::new();
    let mut best_mod = json!({});
    let mut used_room = room.to_string();

    for rv in &room_variants {
        let index = match swae_post(
            client,
            final_url,
            "h5_getstuindexpage",
            json!({
                "cmd": "h5_getstuindexpage",
                "roomverify": rv,
                "account": sid,
                "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
            }),
        )
        .await
        {
            Ok(v) => v,
            Err(e) => {
                crate::runtime_log::log_warn(
                    "ElectricityUsage",
                    format!("h5_getstuindexpage fail {rv}: {e}"),
                );
                continue;
            }
        };

        let ret = index
            .get("ret")
            .or_else(|| index.get("retcode"))
            .or_else(|| index.get("code"))
            .cloned()
            .unwrap_or(json!(null));
        let msg = index
            .get("msg")
            .or_else(|| index.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        crate::runtime_log::log_debug(
            "ElectricityUsage",
            format!("index ret={ret} msg={msg} shape={}", describe_swae_shape(&index)),
        );

        let body = match parse_swae_body(&index) {
            Some(b) => b,
            None => {
                // 列表可能直接在根
                if extract_list_any(&index, &["weekuselist", "dayuselist", "list"]).is_empty()
                    && extract_list_any(&index, &["monthuselist"]).is_empty()
                {
                    continue;
                }
                index.clone()
            }
        };

        if room_name.is_empty() {
            room_name = body
                .get("roomnumber")
                .or_else(|| body.get("roomNumber"))
                .or_else(|| body.get("roomname"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }
        if room_name.is_empty() && !preferred_label.is_empty() && source == "selected" {
            room_name = preferred_label.trim().to_string();
        }

        let (mut week, mut month, mod0) = collect_usage_from_body(&body);

        if week.is_empty() {
            week = fetch_usage_list(
                client,
                final_url,
                sid,
                rv,
                &[
                    "h5_getweekuselist",
                    "getweekuselist",
                    "h5_getdayuselist",
                    "getdayuselist",
                    "h5_getusedetail",
                    "getusedetail",
                    "queryweekuse",
                ],
                &["weekuselist", "dayuselist", "list", "uselist", "data"],
            )
            .await;
        }
        if month.is_empty() {
            month = fetch_usage_list(
                client,
                final_url,
                sid,
                rv,
                &[
                    "h5_getmonthuselist",
                    "getmonthuselist",
                    "querymonthuse",
                    "h5_getmonthuse",
                ],
                &["monthuselist", "list", "uselist", "data"],
            )
            .await;
        }

        crate::runtime_log::log_info(
            "ElectricityUsage",
            format!(
                "room={rv} week_pts={} month_pts={} mods={}",
                week.len(),
                month.len(),
                body.get("modlist")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0)
            ),
        );

        if week.len() > best_week.len() || month.len() > best_month.len() {
            best_week = week;
            best_month = month;
            best_mod = mod0;
            used_room = rv.clone();
        } else if best_mod.as_object().map(|o| o.is_empty()).unwrap_or(true)
            && (mod0.get("todayuse").is_some()
                || mod0.get("odd").is_some()
                || mod0.get("sumbuy").is_some())
        {
            best_mod = mod0;
            used_room = rv.clone();
        }

        if !best_week.is_empty() || !best_month.is_empty() {
            break;
        }
    }

    let points = map_day_points(&best_week);
    let month_points = map_month_points(&best_month);

    let today_use = best_mod.get("todayuse").cloned();
    let quantity = best_mod
        .get("odd")
        .or_else(|| best_mod.get("sumbuy"))
        .cloned();
    let has_snapshot = today_use.as_ref().map(|v| !v.is_null()).unwrap_or(false)
        || quantity.as_ref().map(|v| !v.is_null()).unwrap_or(false);

    if points.is_empty() && month_points.is_empty() && !has_snapshot {
        return Err(format!(
            "所选房间（{} / {}）暂无用电趋势数据",
            if room_name.is_empty() {
                preferred_label
            } else {
                room_name.as_str()
            },
            room
        ));
    }

    let price = best_mod.get("price").cloned();
    let device = best_mod
        .get("devicename")
        .and_then(|v| v.as_str())
        .unwrap_or("电表")
        .to_string();
    let line_status = best_mod
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

    let summary = if !points.is_empty() {
        format!("近{}日用电合计 {:.1} 度", points.len(), week_sum)
    } else if !month_points.is_empty() {
        format!("近{}月用电数据", month_points.len())
    } else {
        "已查询到房间电表状态（暂无分日曲线）".to_string()
    };

    Ok(json!({
        "success": true,
        "summary": summary,
        "points": points,
        "month_points": month_points,
        "today_use": today_use,
        "quantity": quantity,
        "price": price,
        "device_name": device,
        "line_status": line_status,
        "room_name": if room_name.is_empty() { preferred_label.to_string() } else { room_name },
        "room_verify": used_room,
        "source": source,
        "bound_room_verify": if bound_room.is_empty() { Value::Null } else { json!(bound_room) },
        "bound_room_name": if bound_name.is_empty() { Value::Null } else { json!(bound_name) },
        "message": if points.is_empty() && month_points.is_empty() {
            json!("房间可查询，但接口未返回分日/分月曲线")
        } else {
            Value::Null
        },
        "hint": if source == "selected" {
            "用电趋势：当前所选房间"
        } else {
            "用电趋势：一码通绑定房间（上方未选房）"
        },
        "open_url": final_url
    }))
}

fn roomverify_variants(room: &str) -> Vec<String> {
    let mut out = Vec::new();
    let base = room.trim().to_string();
    if base.is_empty() {
        return out;
    }
    out.push(base.clone());
    let compact = base.replace(' ', "");
    if compact != base {
        out.push(compact);
    }
    let single_dash = base.replace("--", "-");
    if single_dash != base {
        out.push(single_dash);
    }
    out.dedup();
    out
}

fn describe_swae_shape(v: &Value) -> &'static str {
    if v.get("body").and_then(|b| b.as_str()).is_some() {
        "body:string"
    } else if v.get("body").map(|b| b.is_object()).unwrap_or(false) {
        "body:object"
    } else if v.get("modlist").is_some() {
        "top:modlist"
    } else {
        "other"
    }
}

fn extract_list_any(v: &Value, keys: &[&str]) -> Vec<Value> {
    for k in keys {
        if let Some(arr) = v.get(*k).and_then(|x| x.as_array()) {
            if !arr.is_empty() {
                return arr.clone();
            }
        }
        if let Some(arr) = v
            .pointer(&format!("/data/{k}"))
            .and_then(|x| x.as_array())
        {
            if !arr.is_empty() {
                return arr.clone();
            }
        }
    }
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        if !arr.is_empty() {
            return arr.clone();
        }
    }
    Vec::new()
}

/// 从 index body 汇总所有电表 mod 的周/月列表
fn collect_usage_from_body(body: &Value) -> (Vec<Value>, Vec<Value>, Value) {
    let mut week = extract_list_any(body, &["weekuselist", "dayuselist", "uselist"]);
    let mut month = extract_list_any(body, &["monthuselist"]);
    let mut best_mod = json!({});

    if let Some(mods) = body.get("modlist").and_then(|v| v.as_array()) {
        for m in mods {
            let w = extract_list_any(m, &["weekuselist", "dayuselist", "uselist"]);
            let mo = extract_list_any(m, &["monthuselist"]);
            if w.len() > week.len() {
                week = w;
                best_mod = m.clone();
            }
            if mo.len() > month.len() {
                month = mo;
                if best_mod.as_object().map(|o| o.is_empty()).unwrap_or(true) {
                    best_mod = m.clone();
                }
            }
            if best_mod.as_object().map(|o| o.is_empty()).unwrap_or(true)
                && (m.get("todayuse").is_some()
                    || m.get("odd").is_some()
                    || m.get("sumbuy").is_some())
            {
                best_mod = m.clone();
            }
        }
        if best_mod.as_object().map(|o| o.is_empty()).unwrap_or(true) {
            if let Some(first) = mods.first() {
                best_mod = first.clone();
            }
        }
    }

    if best_mod.as_object().map(|o| o.is_empty()).unwrap_or(true) {
        best_mod = body.clone();
    }

    (week, month, best_mod)
}

async fn fetch_usage_list(
    client: &crate::http_client::HbutClient,
    final_url: &str,
    sid: &str,
    room: &str,
    methods: &[&str],
    list_keys: &[&str],
) -> Vec<Value> {
    for method in methods {
        let param = json!({
            "cmd": method,
            "roomverify": room,
            "account": sid,
            "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
        });
        if let Ok(extra) = swae_post(client, final_url, method, param).await {
            if let Some(b) = parse_swae_body(&extra) {
                let arr = extract_list_any(&b, list_keys);
                if !arr.is_empty() {
                    return arr;
                }
            }
            let arr = extract_list_any(&extra, list_keys);
            if !arr.is_empty() {
                return arr;
            }
        }
    }
    Vec::new()
}

fn map_day_points(week: &[Value]) -> Vec<Value> {
    week.iter()
        .map(|p| {
            json!({
                "label": p.get("date").or_else(|| p.get("daydate")).or_else(|| p.get("rq")).cloned().unwrap_or(json!("")),
                "date": p.get("date").or_else(|| p.get("daydate")).or_else(|| p.get("rq")).cloned().unwrap_or(json!("")),
                "value": p.get("dayuse").or_else(|| p.get("use")).or_else(|| p.get("yl")).or_else(|| p.get("value")).cloned().unwrap_or(json!(0)),
                "unit": "度",
                "weekday": p.get("weekday").cloned().unwrap_or(json!(""))
            })
        })
        .filter(|p| {
            let label = p.get("label").and_then(|v| v.as_str()).unwrap_or("");
            let val = p.get("value");
            !label.is_empty() || val.map(|v| !v.is_null()).unwrap_or(false)
        })
        .collect()
}

fn map_month_points(month: &[Value]) -> Vec<Value> {
    month
        .iter()
        .map(|p| {
            json!({
                "label": p.get("yearmonth").or_else(|| p.get("month")).or_else(|| p.get("rq")).cloned().unwrap_or(json!("")),
                "value": p.get("monthuse").or_else(|| p.get("use")).or_else(|| p.get("yl")).or_else(|| p.get("value")).cloned().unwrap_or(json!(0)),
                "unit": "度"
            })
        })
        .filter(|p| {
            let label = p.get("label").and_then(|v| v.as_str()).unwrap_or("");
            !label.is_empty()
        })
        .collect()
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
    // body 可能是 JSON 字符串、对象，或数据直接在根上
    if let Some(body_val) = v.get("body") {
        if let Some(s) = body_val.as_str() {
            let s = s.trim();
            if !(s.is_empty() || s == "null") {
                if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                    return Some(parsed);
                }
                return Some(json!({ "raw": s }));
            }
        } else if body_val.is_object() || body_val.is_array() {
            return Some(body_val.clone());
        }
    }
    if v.get("modlist").is_some()
        || v.get("weekuselist").is_some()
        || v.get("monthuselist").is_some()
        || v.get("dayuselist").is_some()
    {
        return Some(v.clone());
    }
    if let Some(data) = v.get("data") {
        if data.is_object() || data.is_array() {
            return Some(data.clone());
        }
        if let Some(s) = data.as_str() {
            if let Ok(parsed) = serde_json::from_str::<Value>(s) {
                return Some(parsed);
            }
        }
    }
    None
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
