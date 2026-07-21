//! 一码通模块封装。
//!
//! 负责调用 http_client 的一码通 token 能力，并提供官方 App 打开链接准备（#438）。

use crate::modules::session_guard;
use crate::AppState;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

const CODE_BASE: &str = "https://code.hbut.edu.cn";

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

/// 获取一码通 Token
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
            .unwrap_or_else(|| serde_json::json!({})),
    })
}

fn extract_tid(one_code: &serde_json::Value) -> String {
    one_code
        .pointer("/resultData/tid")
        .or_else(|| one_code.get("tid"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// 为缴电费 / 网费 / 场馆等生成可打开的官方 URL（不内嵌支付）。
/// 参数使用扁平字段，与项目内其它 command 一致：`{ app_code, app_name? }`
#[tauri::command]
pub async fn one_code_app_open_prepare(
    state: State<'_, AppState>,
    app_code: String,
    app_name: Option<String>,
) -> Result<OneCodeAppOpenPrepareResponse, String> {
    let mut client = state.client.write().await;
    let code = app_code.trim().to_string();
    if code.is_empty() {
        return Ok(OneCodeAppOpenPrepareResponse {
            success: false,
            open_url: String::new(),
            pay_url: String::new(),
            app_code: code,
            hint: String::new(),
            message: Some("缺少 app_code".into()),
            tid: None,
        });
    }

    // 先确保一码通/电费会话
    if let Err(e) = session_guard::ensure_one_code_electricity(&mut client).await {
        if session_guard::looks_like_auth_failure(&e) {
            let _ = client.get_one_code_token().await;
        }
    }

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

    // 已知第三方落地（来自手机端 appList 抓取）
    let third_redirect = match code.as_str() {
        "noQYzEiZ7L" => Some("http://172.16.54.20:9000/#/home".to_string()),
        "jSJNLwI3bX" => Some(
            "https://code.hbut.edu.cn/lightappService/host/docking/geteWayForV8?state=da0c4cbd3f224986a79c5fe376a05ed6"
                .to_string(),
        ),
        _ => None,
    };

    let display_name = app_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(code.as_str());

    let (open_url, hint) = if let Some(redirect) = third_redirect {
        let encoded = urlencoding_lite(&redirect);
        let url = format!("{CODE_BASE}/server/third/open?redirectUrl={encoded}");
        let hint = if code == "noQYzEiZ7L" {
            "场馆系统可能仅校园网可达；若打不开请连接校园网或 VPN。"
        } else {
            "将打开一码通官方第三方页面。"
        }
        .to_string();
        (url, hint)
    } else {
        // 原生应用：落到移动端首页，带 tid
        let url = if tid.is_empty() {
            format!("{CODE_BASE}/#/pages_home/home")
        } else {
            format!("{CODE_BASE}/?tid={tid}&orgId=2#/pages_home/home")
        };
        (
            url,
            format!("打开后请在官方一码通中进入「{display_name}」完成操作；App 不内嵌支付。"),
        )
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

#[tauri::command]
pub async fn electricity_usage_stats(
    state: State<'_, AppState>,
    room_path: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let _client = state.client.read().await;
    Ok(json!({
        "success": true,
        "summary": null,
        "points": [],
        "room_path": room_path.unwrap_or_default(),
        "message": "电量分日统计协议待对接；余额/电量仍来自现有查询。"
    }))
}
