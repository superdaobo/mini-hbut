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
        result_data: res.get("resultData").cloned().unwrap_or_else(|| json!({})),
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
        client.ensure_electricity_token().await.unwrap_or_default()
    } else {
        // 缴费页不强制 accessToken；有则更好
        client.ensure_electricity_token().await.unwrap_or_default()
    };

    let name = if display.is_empty() {
        code.as_str()
    } else {
        display.as_str()
    };

    // 缴电费/网费：必须走 build_one_code_pay_open_url（与单测/MCP 官方 URL 形状一致）
    let (open_url, hint) = match code.as_str() {
        "electric" => (
            build_one_code_pay_open_url("electric", &browser_tid),
            "在官方页完成缴纳".to_string(),
        ),
        "broadband" => (
            build_one_code_pay_open_url("broadband", &browser_tid),
            "在官方页完成缴纳".to_string(),
        ),
        // 运动场馆（第三方 + accessToken，内网）
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
            build_one_code_pay_open_url("home", &browser_tid),
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
    let result = match primary {
        Ok(v) => Ok(v),
        Err(e1) if !alt.is_empty() => {
            crate::runtime_log::log_info(
                "ElectricityUsage",
                format!("主表失败，尝试空调表 alt={alt} err={e1}"),
            );
            match fetch_smart_electricity_stats(&mut client, &student_id, &alt, &label).await {
                Ok(mut v) => {
                    if let Some(obj) = v.as_object_mut() {
                        obj.insert("hint".into(), json!("用电趋势：当前所选房间（空调表）"));
                    }
                    Ok(v)
                }
                Err(e2) => Err(format!("{e1}；空调表：{e2}")),
            }
        }
        Err(e) => Err(e),
    };

    match result {
        Ok(v) => Ok(v),
        Err(e) => {
            // 最后兜底：用一码通 utilities/account 拉所选房余额/剩余电量（非绑定房也能查）
            if let Some(path) = room_path.as_ref() {
                if path.len() >= 4 {
                    if let Ok(snap) =
                        utilities_room_snapshot(&mut client, path, &label, &preferred).await
                    {
                        crate::runtime_log::log_info(
                            "ElectricityUsage",
                            format!("SWAE 无曲线，已用 utilities 快照兜底: {e}"),
                        );
                        return Ok(snap);
                    }
                }
            }
            Ok(json!({
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
            }))
        }
    }
}

/// 一码通原生 utilities/account：任意选房可查余额/剩余电量（作趋势失败时的快照）
async fn utilities_room_snapshot(
    client: &mut crate::http_client::HbutClient,
    path: &[String],
    label: &str,
    room_verify: &str,
) -> Result<Value, String> {
    let area = path.first().map(|s| s.as_str()).unwrap_or("");
    let building = path.get(1).map(|s| s.as_str()).unwrap_or("");
    let mut level = path.get(2).map(|s| s.as_str()).unwrap_or("").to_string();
    let room = path.get(3).map(|s| s.as_str()).unwrap_or(room_verify);
    // merged_1_light_ac → 取照明 layer
    if level.starts_with("merged_") {
        let parts: Vec<&str> = level.split('_').collect();
        if parts.len() >= 3 && !parts[2].is_empty() {
            level = parts[2].to_string();
        }
    }
    let payload = json!({
        "utilityType": "electric",
        "bigArea": "",
        "area": area,
        "building": building,
        "unit": "",
        "level": level,
        "room": room,
        "subArea": ""
    });
    let res = client
        .query_electricity_account(payload)
        .await
        .map_err(|e| e.to_string())?;
    if !res
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return Err(res
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("utilities 查询失败")
            .to_string());
    }
    let result_data = res.get("resultData").cloned().unwrap_or(json!({}));
    let mut balance = json!(null);
    let mut quantity = json!(null);
    if let Some(list) = result_data.get("templateList").and_then(|v| v.as_array()) {
        for item in list {
            let code = item.get("code").and_then(|v| v.as_str()).unwrap_or("");
            let val = item.get("value").cloned().unwrap_or(json!(null));
            if code == "balance" {
                balance = val;
            } else if code == "quantity" {
                quantity = val;
            }
        }
    }
    let status = result_data
        .get("utilityStatusName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(json!({
        "success": true,
        "summary": format!("所选房间当前剩余电量 {}", quantity.as_str().unwrap_or("—")),
        "points": [],
        "month_points": [],
        "today_use": null,
        "quantity": quantity,
        "balance": balance,
        "price": null,
        "device_name": "电表",
        "line_status": status,
        "room_name": label,
        "room_verify": room_verify,
        "source": "selected",
        "bound_room_verify": Value::Null,
        "bound_room_name": Value::Null,
        "message": "智能水电未返回分日曲线，已显示该房间当前电量/余额快照",
        "hint": "用电快照：已切换为所选房间；曲线暂无时显示余额/余量",
        "open_url": null
    }))
}

/// 判断 SWAE 绑定/写接口响应是否表示成功（纯函数，单测覆盖）
pub fn swae_write_response_ok(resp: &Value) -> bool {
    let body = parse_swae_body(resp).unwrap_or_else(|| resp.clone());
    let ret = body
        .get("ret")
        .or_else(|| body.get("retcode"))
        .or_else(|| body.get("code"))
        .or_else(|| resp.get("ret"))
        .cloned()
        .unwrap_or(json!(null));
    let msg = body
        .get("msg")
        .or_else(|| body.get("message"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    matches!(
        ret.as_i64().or_else(|| ret.as_u64().map(|u| u as i64)),
        Some(0) | Some(200)
    ) || ret.as_str() == Some("0")
        || ret.as_str() == Some("success")
        || msg.contains("成功")
        || msg.to_ascii_lowercase().contains("success")
}

/// 官方一码通 H5 打开 URL（与 one_code_app_open_prepare 一致，可单测）
pub fn build_one_code_pay_open_url(app_code: &str, tid: &str) -> String {
    let tid_q = if tid.trim().is_empty() {
        String::new()
    } else {
        urlencoding_lite(tid.trim())
    };
    let spa = |hash_path: &str| -> String {
        if tid_q.is_empty() {
            format!("{CODE_BASE}/#{hash_path}")
        } else {
            format!("{CODE_BASE}/?tid={tid_q}&orgId=2#{hash_path}")
        }
    };
    match app_code {
        "electric" => spa(
            "/pages_payment/electrictyFees/electrictyFees?navbarTitle=%E7%BC%B4%E7%94%B5%E8%B4%B9&type=electric",
        ),
        "broadband" => spa(
            "/pages_payment/networkFees/networkFees?navbarTitle=%E7%BC%B4%E7%BA%B3%E6%95%99%E8%82%B2%E7%BD%91%E7%BD%91%E8%B4%B9&type=broadband",
        ),
        _ => spa("/pages_home/home"),
    }
}

/// 尝试将智能水电绑定房改为目标 roomverify（选房即绑定）。
/// 官方 H5 常见 cmd：setbindroom / bindroom / h5_setbindroom 等，逐个试到成功。
async fn try_swae_bind_room(
    client: &crate::http_client::HbutClient,
    final_url: &str,
    sid: &str,
    roomverify: &str,
) -> bool {
    let room = roomverify.trim();
    if room.is_empty() {
        return false;
    }
    let methods = [
        "setbindroom",
        "bindroom",
        "h5_setbindroom",
        "h5_bindroom",
        "savebindroom",
        "updatebindroom",
        "setroom",
        "h5_setroom",
    ];
    for method in methods {
        let ts = Local::now().format("%Y%m%d%H%M%S%3f").to_string();
        let param = json!({
            "cmd": method,
            "roomverify": room,
            "account": sid,
            "outid": sid,
            "timestamp": ts
        });
        match swae_post(client, final_url, method, param).await {
            Ok(resp) => {
                let ok = swae_write_response_ok(&resp);
                crate::runtime_log::log_info(
                    "ElectricityBind",
                    format!("cmd={method} room={room} ok={ok}"),
                );
                if ok {
                    return true;
                }
            }
            Err(e) => {
                crate::runtime_log::log_debug("ElectricityBind", format!("cmd={method} err={e}"));
            }
        }
    }
    false
}

/// 宿舍 room value 是否像 SWAE roomverify：`101-1--174-1101`
#[allow(dead_code)]
fn looks_like_roomverify(s: &str) -> bool {
    let s = s.trim();
    s.contains("--") || (s.matches('-').count() >= 2 && s.chars().any(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn synthesize_roomverify_replaces_trailing_room_no() {
        assert_eq!(
            synthesize_roomverify_from_bound("101-7--254-101", "102").as_deref(),
            Some("101-7--254-102")
        );
        assert_eq!(
            synthesize_roomverify_from_bound("101-1--174-1101", "1102").as_deref(),
            Some("101-1--174-1102")
        );
        assert!(synthesize_roomverify_from_bound("", "102").is_none());
    }

    #[test]
    fn extract_room_number_from_label() {
        assert_eq!(extract_room_number("102房间", ""), "102");
        assert_eq!(extract_room_number("东苑7栋1层 1102", ""), "1102");
    }

    #[test]
    fn swae_bind_response_ok_on_ret_zero() {
        let ok = json!({"ret": 0, "msg": "成功"});
        assert!(swae_write_response_ok(&ok));
        assert!(swae_write_response_ok(&json!({"retcode": 0})));
        assert!(!swae_write_response_ok(&json!({"ret": 1, "msg": "fail"})));
    }

    #[test]
    #[test]
    fn build_selected_roomverify_candidates_prefers_synth() {
        let c = build_selected_roomverify_candidates("101-7--254-102", "101-7--254-101", "102房间");
        assert_eq!(c.first().map(|s| s.as_str()), Some("101-7--254-102"));
        // preferred already 102; synth from bound may equal preferred
        assert!(!c.is_empty());
        let c2 =
            build_selected_roomverify_candidates("SOMETHING-ELSE", "101-7--254-101", "102房间");
        assert!(c2.contains(&"SOMETHING-ELSE".to_string()));
        assert!(c2.iter().any(|x| x.ends_with("102") || x.contains("102")));
    }

    #[test]
    fn build_pay_urls_include_tid_and_official_paths() {
        let tid = "TEST_TID_ABC";
        let elec = build_one_code_pay_open_url("electric", tid);
        assert!(elec.contains("tid=TEST_TID_ABC"));
        assert!(elec.contains("electrictyFees"));
        assert!(elec.contains("orgId=2"));
        let net = build_one_code_pay_open_url("broadband", tid);
        assert!(net.contains("networkFees"));
        assert!(net.contains("tid=TEST_TID_ABC"));
    }
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

    // 用户已选房间：只查该房（可多候选 roomverify），绝不静默换成绑定房趋势
    let mut candidates: Vec<(String, &'static str, String)> = Vec::new();
    let pref = preferred_room.trim();
    let label = preferred_label.trim();
    let room_no = extract_room_number(label, pref);

    if !pref.is_empty() {
        // preferred + 绑定模板改房号（与单测 build_selected_roomverify_candidates 一致）
        for rv in build_selected_roomverify_candidates(pref, &bound_room, label) {
            candidates.push((rv, "selected", label.to_string()));
        }
        // SWAE 房间树按房号匹配（宿舍数据集 value 可能与智能水电 roomverify 不一致）
        if let Some(resolved) =
            resolve_swae_roomverify_by_tree(client, &final_url, &sid, label, &room_no).await
        {
            if !candidates.iter().any(|(r, _, _)| r == &resolved) {
                candidates.push((resolved, "selected", label.to_string()));
            }
        }
        crate::runtime_log::log_info(
            "ElectricityUsage",
            format!(
                "所选房间候选 room_no={room_no} candidates={:?}",
                candidates
                    .iter()
                    .map(|(r, _, _)| r.as_str())
                    .collect::<Vec<_>>()
            ),
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

    // 5) 选房即绑定：先尝试把官方绑定改为所选房间，再拉趋势
    if !pref.is_empty() {
        for (room, _, _) in candidates.iter().take(3) {
            if try_swae_bind_room(client, &final_url, &sid, room).await {
                // 刷新绑定信息
                if let Ok(b) = swae_post(
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
                {
                    if let Some(body) = parse_swae_body(&b) {
                        if let Some(rv) = body.get("roomverify").and_then(|v| v.as_str()) {
                            bound_room = rv.trim().to_string();
                        }
                        if let Some(rn) = body.get("roomfullname").and_then(|v| v.as_str()) {
                            bound_name = rn.to_string();
                        }
                    }
                }
                crate::runtime_log::log_info(
                    "ElectricityBind",
                    format!("绑定已更新 bound={bound_room} name={bound_name}"),
                );
                break;
            }
        }
    }

    // 6) 按候选依次拉趋势
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
            Ok(mut v) => {
                // 标注是否已与绑定房对齐
                if let Some(obj) = v.as_object_mut() {
                    if !bound_room.is_empty() && bound_room == room {
                        obj.insert("hint".into(), json!("已切换绑定房间，并显示该房用电趋势"));
                        obj.insert("bound_updated".into(), json!(true));
                    }
                }
                return Ok(v);
            }
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

/// 从标签/value 提取房间号，如「102房间」→ 102
fn extract_room_number(label: &str, roomverify: &str) -> String {
    // 标签优先：102房间 / 102
    if let Some(caps) = regex::Regex::new(r"(\d{2,4})\s*房间")
        .ok()
        .and_then(|re| re.captures(label))
    {
        return caps
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
    }
    if let Some(caps) = regex::Regex::new(r"(\d{2,4})\s*$")
        .ok()
        .and_then(|re| re.captures(label.trim()))
    {
        let n = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        if !n.is_empty() {
            return n.to_string();
        }
    }
    // value 末段
    roomverify
        .split('-')
        .last()
        .map(|s| s.trim().to_string())
        .filter(|s| s.chars().all(|c| c.is_ascii_digit()) && s.len() >= 2)
        .unwrap_or_default()
}

/// 选房后参与趋势查询的 roomverify 候选（纯函数：preferred + 绑定模板改房号）
/// 供 electricity_usage_stats 与单测共用，保证「切换房间」路径可测。
pub fn build_selected_roomverify_candidates(
    preferred: &str,
    bound_room: &str,
    room_label: &str,
) -> Vec<String> {
    let pref = preferred.trim();
    let mut out = Vec::new();
    if pref.is_empty() {
        if !bound_room.trim().is_empty() {
            out.push(bound_room.trim().to_string());
        }
        return out;
    }
    out.push(pref.to_string());
    let room_no = extract_room_number(room_label, pref);
    if let Some(syn) = synthesize_roomverify_from_bound(bound_room, &room_no) {
        if !out.iter().any(|x| x == &syn) {
            out.push(syn);
        }
    }
    out
}

/// 绑定房 roomverify 末段换成目标房号
fn synthesize_roomverify_from_bound(bound: &str, room_no: &str) -> Option<String> {
    let room_no = room_no.trim();
    if bound.is_empty() || room_no.is_empty() {
        return None;
    }
    // 处理 `101-7--254-101`：按 `-` 切分，保留空段（对应 --）
    let mut parts: Vec<String> = bound.split('-').map(|s| s.to_string()).collect();
    if parts.is_empty() {
        return None;
    }
    // 从后往前找第一个纯数字段替换
    for i in (0..parts.len()).rev() {
        if !parts[i].is_empty() && parts[i].chars().all(|c| c.is_ascii_digit()) {
            parts[i] = room_no.to_string();
            return Some(parts.join("-"));
        }
    }
    None
}

/// 走 SWAE 区域→楼栋→楼层→房间树，按房号匹配 roomverify
async fn resolve_swae_roomverify_by_tree(
    client: &crate::http_client::HbutClient,
    final_url: &str,
    sid: &str,
    label: &str,
    room_no: &str,
) -> Option<String> {
    if room_no.is_empty() {
        return None;
    }
    let ts = || Local::now().format("%Y%m%d%H%M%S%3f").to_string();
    let building_hint = {
        // 「东苑公寓7栋」→ 7
        regex::Regex::new(r"(\d+)\s*栋")
            .ok()
            .and_then(|re| re.captures(label))
            .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
            .unwrap_or_default()
    };
    let floor_hint = {
        regex::Regex::new(r"(\d+)\s*层")
            .ok()
            .and_then(|re| re.captures(label))
            .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
            .unwrap_or_default()
    };

    // 常见树接口名
    let area_methods = ["getarealist", "h5_getarealist", "getarea"];
    let mut areas: Vec<Value> = Vec::new();
    for m in area_methods {
        if let Ok(resp) = swae_post(
            client,
            final_url,
            m,
            json!({
                "cmd": m,
                "account": sid,
                "timestamp": ts()
            }),
        )
        .await
        {
            if let Some(b) = parse_swae_body(&resp) {
                let list = extract_list_any(&b, &["arealist", "list", "data", "areaList"]);
                if !list.is_empty() {
                    areas = list;
                    break;
                }
            }
            let list = extract_list_any(&resp, &["arealist", "list", "data"]);
            if !list.is_empty() {
                areas = list;
                break;
            }
        }
    }
    if areas.is_empty() {
        crate::runtime_log::log_debug("ElectricityUsage", "SWAE 房间树：无区域列表");
        return None;
    }

    for area in areas.iter().take(12) {
        let area_id = json_id(area, &["areaid", "id", "value", "areaId"]);
        if area_id.is_empty() {
            continue;
        }
        let buildings = swae_child_list(
            client,
            final_url,
            sid,
            &["getbuildinglist", "h5_getbuildinglist", "getbuilding"],
            json!({
                "cmd": "getbuildinglist",
                "areaid": area_id,
                "account": sid,
                "timestamp": ts()
            }),
            &["buildinglist", "list", "data", "buildingList"],
        )
        .await;
        for building in buildings.iter().take(20) {
            let bname = json_name(building);
            let building_id = json_id(building, &["buildingid", "id", "value", "buildingId"]);
            if building_id.is_empty() {
                continue;
            }
            if !building_hint.is_empty()
                && !bname.contains(&building_hint)
                && !building_id.contains(&building_hint)
            {
                // 不硬过滤：部分命名不含栋号
            }
            let floors = swae_child_list(
                client,
                final_url,
                sid,
                &[
                    "getfloorlist",
                    "h5_getfloorlist",
                    "getfloor",
                    "getlevellist",
                ],
                json!({
                    "cmd": "getfloorlist",
                    "buildingid": building_id,
                    "areaid": area_id,
                    "account": sid,
                    "timestamp": ts()
                }),
                &["floorlist", "levellist", "list", "data", "floorList"],
            )
            .await;
            for floor in floors.iter().take(30) {
                let fname = json_name(floor);
                let floor_id = json_id(floor, &["floorid", "levelid", "id", "value", "floorId"]);
                if floor_id.is_empty() {
                    continue;
                }
                if !floor_hint.is_empty()
                    && !fname.contains(&floor_hint)
                    && !floor_id.contains(&floor_hint)
                {
                    // 宽松：仍查所有层
                }
                let rooms = swae_child_list(
                    client,
                    final_url,
                    sid,
                    &["getroomlist", "h5_getroomlist", "getroom"],
                    json!({
                        "cmd": "getroomlist",
                        "floorid": floor_id,
                        "buildingid": building_id,
                        "areaid": area_id,
                        "account": sid,
                        "timestamp": ts()
                    }),
                    &["roomlist", "list", "data", "roomList"],
                )
                .await;
                for room in rooms {
                    let rname = json_name(&room);
                    let rv = json_id(
                        &room,
                        &[
                            "roomverify",
                            "roomid",
                            "id",
                            "value",
                            "roomId",
                            "room_verify",
                        ],
                    );
                    if rv.is_empty() {
                        continue;
                    }
                    let hit = rname.contains(room_no)
                        || rv.ends_with(room_no)
                        || rv.split('-').last() == Some(room_no);
                    if hit {
                        crate::runtime_log::log_info(
                            "ElectricityUsage",
                            format!("SWAE 树命中 room={rname} roomverify={rv}"),
                        );
                        return Some(rv);
                    }
                }
            }
        }
    }
    None
}

fn json_id(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            if !s.trim().is_empty() {
                return s.trim().to_string();
            }
        }
        if let Some(n) = v.get(*k).and_then(|x| x.as_i64()) {
            return n.to_string();
        }
        if let Some(n) = v.get(*k).and_then(|x| x.as_u64()) {
            return n.to_string();
        }
    }
    String::new()
}

fn json_name(v: &Value) -> String {
    for k in ["name", "label", "roomname", "roomName", "title", "text"] {
        if let Some(s) = v.get(k).and_then(|x| x.as_str()) {
            if !s.trim().is_empty() {
                return s.trim().to_string();
            }
        }
    }
    String::new()
}

async fn swae_child_list(
    client: &crate::http_client::HbutClient,
    final_url: &str,
    sid: &str,
    methods: &[&str],
    base_param: Value,
    list_keys: &[&str],
) -> Vec<Value> {
    let _ = sid;
    for m in methods {
        let mut param = base_param.clone();
        if let Some(obj) = param.as_object_mut() {
            obj.insert("cmd".into(), json!(m));
            obj.insert(
                "timestamp".into(),
                json!(Local::now().format("%Y%m%d%H%M%S%3f").to_string()),
            );
        }
        if let Ok(resp) = swae_post(client, final_url, m, param).await {
            if let Some(b) = parse_swae_body(&resp) {
                let list = extract_list_any(&b, list_keys);
                if !list.is_empty() {
                    return list;
                }
            }
            let list = extract_list_any(&resp, list_keys);
            if !list.is_empty() {
                return list;
            }
        }
    }
    Vec::new()
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
            format!(
                "index ret={ret} msg={msg} shape={}",
                describe_swae_shape(&index)
            ),
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
                    "getmdusedaylist",
                    "h5_getmdusedaylist",
                    "getusedaylist",
                ],
                &[
                    "weekuselist",
                    "dayuselist",
                    "list",
                    "uselist",
                    "data",
                    "mdusedaylist",
                ],
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
                    "getmdusemonthlist",
                    "h5_getmdusemonthlist",
                ],
                &["monthuselist", "list", "uselist", "data", "mdusemonthlist"],
            )
            .await;
        }

        // 电表列表 → 按表拉日用量（非绑定房常见路径）
        if week.is_empty() {
            if let Ok(md_resp) = swae_post(
                client,
                final_url,
                "getmdlist",
                json!({
                    "cmd": "getmdlist",
                    "roomverify": rv,
                    "account": sid,
                    "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
                }),
            )
            .await
            {
                let md_body = parse_swae_body(&md_resp).unwrap_or(md_resp);
                let meters = extract_list_any(&md_body, &["mdlist", "list", "data", "meterlist"]);
                for meter in meters.iter().take(4) {
                    let mdid = json_id(meter, &["mdid", "id", "meterid", "value", "mdId"]);
                    if mdid.is_empty() {
                        continue;
                    }
                    for method in ["getmdusedaylist", "h5_getmdusedaylist", "getusedaylist"] {
                        if let Ok(day_resp) = swae_post(
                            client,
                            final_url,
                            method,
                            json!({
                                "cmd": method,
                                "roomverify": rv,
                                "mdid": mdid,
                                "account": sid,
                                "timestamp": Local::now().format("%Y%m%d%H%M%S%3f").to_string()
                            }),
                        )
                        .await
                        {
                            let day_body = parse_swae_body(&day_resp).unwrap_or(day_resp);
                            let arr = extract_list_any(
                                &day_body,
                                &["mdusedaylist", "dayuselist", "weekuselist", "list", "data"],
                            );
                            if !arr.is_empty() {
                                week = arr;
                                crate::runtime_log::log_info(
                                    "ElectricityUsage",
                                    format!("电表日用量命中 mdid={mdid} n={}", week.len()),
                                );
                                break;
                            }
                        }
                    }
                    if !week.is_empty() {
                        break;
                    }
                }
            }
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
        if let Some(arr) = v.pointer(&format!("/data/{k}")).and_then(|x| x.as_array()) {
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
        .enumerate()
        .map(|(i, p)| {
            let label = p
                .get("date")
                .or_else(|| p.get("daydate"))
                .or_else(|| p.get("rq"))
                .or_else(|| p.get("time"))
                .or_else(|| p.get("day"))
                .cloned()
                .unwrap_or_else(|| json!(format!("D{}", i + 1)));
            let value = p
                .get("dayuse")
                .or_else(|| p.get("use"))
                .or_else(|| p.get("yl"))
                .or_else(|| p.get("value"))
                .or_else(|| p.get("used"))
                .or_else(|| p.get("power"))
                .cloned()
                .unwrap_or(json!(0));
            json!({
                "label": label,
                "date": label,
                "value": value,
                "unit": "度",
                "weekday": p.get("weekday").cloned().unwrap_or(json!(""))
            })
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
    // customercode：多数学校为 2；失败时再试 1
    let mut last_err = String::new();
    for code in ["2", "1"] {
        let param_str = serde_json::to_string(&param).map_err(|e| e.to_string())?;
        let body = format!(
            "param={}&customercode={code}&method={}&command=undefined",
            urlencoding_lite(&param_str),
            urlencoding_lite(method)
        );
        match client
            .client
            .post(format!("{SWAE_BASE}/SWAEServlet"))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Origin", CODE_BASE)
            .header("Referer", referer)
            .header("X-Requested-With", "XMLHttpRequest")
            .header(
                "User-Agent",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
            )
            .body(body)
            .send()
            .await
        {
            Ok(resp) => match resp.json::<Value>().await {
                Ok(json) => {
                    // 若 body 非空或 ret 成功，直接返回
                    let body_ok = json
                        .get("body")
                        .map(|b| {
                            b.as_str()
                                .map(|s| !s.is_empty() && s != "null")
                                .unwrap_or(!b.is_null())
                        })
                        .unwrap_or(false);
                    if body_ok || code == "1" {
                        return Ok(json);
                    }
                    // body 空时继续试下一个 code
                    last_err = format!("customercode={code} 返回空 body");
                }
                Err(e) => last_err = e.to_string(),
            },
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(last_err)
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
