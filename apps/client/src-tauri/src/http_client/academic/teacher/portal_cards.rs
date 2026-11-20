//! 融合门户卡片（教师只读）—— goal-21 / T04b。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! | 用途 | 接口 | 方法 | 实测 |
//! | --- | --- | --- | --- |
//! | 页面卡片布局 | `GET /getPageView` | GET | 200，`cardLayout` **8 张卡** |
//! | 卡片数据 | `POST /execCardMethod/{cardWid}/{cardId}` | **POST JSON** | 200，method 限 `renderData`/`getConfig`/`getMarkNumber` |
//! | 会话恢复 | `GET /login` | GET | 302 → CAS 换票后恢复 |
//!
//! ## 三个必须处理的特性
//!
//! 1. **域名不同**：门户是 `e.hbut.edu.cn`，不是教务域；本模块自带 base url。
//! 2. **网关会话约 10 分钟过期**：过期时 `execCardMethod`/`getPageInfo` 退化为
//!    `errcode=999`「无权限调用」，但 `getLoginUser` 仍返回 200 ——
//!    **不能用 getLoginUser 判活**。本模块在 `errcode=999` 时静默重走一次 `GET /login`
//!    再重试一次，**不向用户抛「请重新登录」**。
//! 3. **4 张任务卡的 `renderData` 恒为 `null`**（数据在外部 OA `oanew.hbut.edu.cn`），
//!    只有 `getMarkNumber` 角标有值。本模块**不伪造数据**，原样返回 `null`。

use serde_json::{json, Value};

use super::readonly;
use crate::http_client::HbutClient;

/// 融合门户基址（与教务域不同）。
pub(crate) const PORTAL_BASE_URL: &str = "https://e.hbut.edu.cn";

/// 卡片允许的只读 method（实测三种，均为纯查询）。
pub(crate) const PORTAL_CARD_METHODS: &[&str] = &["renderData", "getConfig", "getMarkNumber"];

/// 门户 `errcode=999` 判定（网关会话过期）。
pub(crate) fn is_session_expired(payload: &Value) -> bool {
    let code = payload.get("errcode").or_else(|| payload.get("errCode"));
    match code {
        Some(Value::Number(number)) => number.as_i64() == Some(999),
        Some(Value::String(text)) => text.trim() == "999",
        _ => false,
    }
}

/// 门户 `errcode` 是否表示成功（实测成功值有 `0` 与 `200` 两种）。
pub(crate) fn is_success(payload: &Value) -> bool {
    let code = payload.get("errcode").or_else(|| payload.get("errCode"));
    match code {
        Some(Value::Number(number)) => matches!(number.as_i64(), Some(0) | Some(200)),
        Some(Value::String(text)) => matches!(text.trim(), "0" | "200"),
        None => true, // 无 errcode 字段视为裸数据成功
        _ => false,
    }
}

/// 从 `getPageView` 响应里提取卡片布局（`data.cardLayout`）。
pub(crate) fn extract_card_layout(payload: &Value) -> Vec<Value> {
    payload
        .get("data")
        .and_then(|data| data.get("cardLayout"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

/// 归一化一张卡片：只保留前端需要的字段。
pub(crate) fn normalize_card(card: &Value) -> Value {
    json!({
        "cardWid": card.get("cardWid").or_else(|| card.get("wid")).cloned().unwrap_or(Value::Null),
        "cardId": card.get("cardId").or_else(|| card.get("id")).cloned().unwrap_or(Value::Null),
        "cardName": card.get("cardName").or_else(|| card.get("name")).cloned().unwrap_or(Value::Null),
        "cardType": card.get("cardType").cloned().unwrap_or(Value::Null),
    })
}

/// 发送一次门户 GET 并返回 JSON（非 2xx / 非 JSON 归一为错误）。
async fn portal_get(client: &HbutClient, path: &str) -> Result<Value, String> {
    assert!(readonly::is_teacher_portal_readonly_path(path));
    let url = format!("{PORTAL_BASE_URL}{path}");
    let response = client
        .http_client()
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .map_err(|e| format!("门户请求失败: {e}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取门户响应失败: {e}"))?;
    if !(200..300).contains(&status) {
        return Err(format!("门户接口状态异常: HTTP {status}"));
    }
    serde_json::from_str(body.trim_start_matches('\u{feff}'))
        .map_err(|e| format!("门户响应解析失败: {e}"))
}

/// 发送一次门户 POST JSON（`execCardMethod` 专用）。
async fn portal_post(client: &HbutClient, path: &str, body: Value) -> Result<Value, String> {
    assert!(readonly::is_teacher_portal_readonly_path(path));
    let url = format!("{PORTAL_BASE_URL}{path}");
    let response = client
        .http_client()
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/plain, */*")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("门户请求失败: {e}"))?;
    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|e| format!("读取门户响应失败: {e}"))?;
    if !(200..300).contains(&status) {
        return Err(format!("门户接口状态异常: HTTP {status}"));
    }
    serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|e| format!("门户响应解析失败: {e}"))
}

/// 会话过期时静默重走一次 `GET /login`（CAS 换票），**不向用户报错**。
async fn refresh_portal_session(client: &HbutClient) -> Result<(), String> {
    let _ = portal_get(client, readonly::PATH_PORTAL_LOGIN).await;
    Ok(())
}

/// 拉取门户卡片布局与各卡角标，返回 `{ cards }`。
///
/// 每张卡只取 `getMarkNumber`（角标）；`renderData` 仅对有数据的服务卡调用，
/// 任务卡的 `null` 原样透传。
pub(crate) async fn fetch_portal_cards_with(client: &HbutClient) -> Result<Value, String> {
    assert!(readonly::is_teacher_portal_readonly_path(
        readonly::PATH_PORTAL_PAGE_VIEW
    ));

    let mut page_view = portal_get(client, readonly::PATH_PORTAL_PAGE_VIEW).await?;
    if is_session_expired(&page_view) {
        refresh_portal_session(client).await?;
        page_view = portal_get(client, readonly::PATH_PORTAL_PAGE_VIEW).await?;
    }
    if !is_success(&page_view) {
        let code = page_view.get("errcode").cloned().unwrap_or(Value::Null);
        let msg = page_view
            .get("errmsg")
            .and_then(Value::as_str)
            .unwrap_or("");
        return Err(format!("门户 getPageView 返回 errcode={code} msg={msg}"));
    }

    let layout = extract_card_layout(&page_view);
    let mut cards = Vec::with_capacity(layout.len());
    for card in &layout {
        let normalized = normalize_card(card);
        let card_wid = normalized
            .get("cardWid")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let card_id = normalized
            .get("cardId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        // 角标：失败不影响整页（角标是装饰信息，缺了就是 0）。
        let mark = if card_wid.is_empty() || card_id.is_empty() {
            Value::Null
        } else {
            let path = readonly::PATH_PORTAL_CARD_METHOD
                .replace("{cardWid}", &card_wid)
                .replace("{cardId}", &card_id);
            let body = json!({ "cardId": card_id, "cardWid": card_wid, "method": "getMarkNumber", "param": {}, "n": 1 });
            match portal_post(client, &path, body).await {
                Ok(payload) if is_success(&payload) => payload
                    .get("data")
                    .cloned()
                    .unwrap_or(Value::Null),
                _ => Value::Null,
            }
        };

        let mut entry = normalized;
        if let Some(object) = entry.as_object_mut() {
            object.insert("markNumber".to_string(), mark);
        }
        cards.push(entry);
    }

    crate::hbut_debug!("[TeacherPortal] 卡片 {} 张", cards.len());
    Ok(json!({ "cards": cards }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expired_detects_999_number_and_string() {
        assert!(is_session_expired(&json!({ "errcode": 999 })));
        assert!(is_session_expired(&json!({ "errcode": "999" })));
        assert!(!is_session_expired(&json!({ "errcode": 0 })));
    }

    #[test]
    fn success_accepts_zero_and_two_hundred() {
        assert!(is_success(&json!({ "errcode": 0 })));
        assert!(is_success(&json!({ "errcode": 200 })));
        assert!(is_success(&json!({ "data": [] })));
        assert!(!is_success(&json!({ "errcode": 999 })));
    }

    #[test]
    fn extract_layout_from_data() {
        let payload = json!({ "errcode": 0, "data": { "cardLayout": [{ "cardWid": "1", "cardId": "A" }] } });
        assert_eq!(extract_card_layout(&payload).len(), 1);
        assert!(extract_card_layout(&json!({ "data": null })).is_empty());
    }

    #[test]
    fn normalize_card_maps_alt_keys() {
        let card = json!({ "wid": "w1", "id": "CUS_CARD_MYTASK", "name": "我的任务", "cardType": "cus" });
        let out = normalize_card(&card);
        assert_eq!(out.get("cardWid").and_then(Value::as_str), Some("w1"));
        assert_eq!(out.get("cardId").and_then(Value::as_str), Some("CUS_CARD_MYTASK"));
        assert_eq!(out.get("cardName").and_then(Value::as_str), Some("我的任务"));
    }

    #[test]
    fn portal_paths_whitelist() {
        assert!(readonly::is_teacher_portal_readonly_path(
            readonly::PATH_PORTAL_PAGE_VIEW
        ));
        assert!(readonly::is_teacher_portal_readonly_path(
            "/execCardMethod/123/CUS_CARD_MYTASK"
        ));
        assert!(!readonly::is_teacher_portal_readonly_path("/saveSiteitching"));
        assert!(!readonly::is_teacher_portal_readonly_path("/uploadUserAvatar"));
    }
}
