//! 教师端工作量汇总（只读）—— goal-21 / T04a。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! ```text
//! GET /twork/jsd/current-user-gzl
//! → { code: 1, message: "…", data: { … } }      ← 不是 { ret: 0 }
//! ```
//!
//! **三个必须记住的差异**（与教务主站 `/admin/*` 不同）：
//! 1. **前缀不是 `/admin`**：这是同 host 的独立微服务，路径以 `/twork/` 开头；
//! 2. **成功码是 `code: 1`**，不是 `ret: 0`；
//! 3. **只接 GET**：`POST /twork/jsd/search` 实测返回「数据异常」。
//!
//! 因此本模块的路径校验走 [`readonly::is_teacher_workload_readonly_path`]（独立白名单），
//! 而不是主 allowlist 的 [`readonly::is_teacher_readonly_path`]（后者强制 `/admin/` 前缀）。
//!
//! ## 数据可能为空
//!
//! 该教师本学期 `data` 可能为 `null`（学校尚未生成工作量）。此时本模块返回
//! `{ available: false, ... }` 而不是伪造 0 —— 前端据此显示「—」而不是「0 课时」。

use serde_json::{json, Value};

use super::readonly;
use crate::http_client::{looks_like_academic_login_url, HbutClient};

/// 把一次 `/twork` 响应归一为 `data` 载荷。
///
/// 与 [`super::grid::interpret_grid_response`] 的区别：
/// - 成功判定是 `code == 1`（也接受字符串 `"1"`），不是 `ret == 0`；
/// - `code` 缺失时**不判失败**（部分端点直接返回裸对象），交给调用方处理。
pub(crate) fn interpret_workload_response(
    status: u16,
    final_url: &str,
    body: &str,
) -> Result<Value, String> {
    if looks_like_academic_login_url(final_url) {
        return Err("会话已过期，请重新登录".to_string());
    }
    if status == 401 {
        return Err("没有访问当前接口的权限（HTTP 401）".to_string());
    }
    if !(200..300).contains(&status) {
        return Err(format!("工作量微服务状态异常: HTTP {status}"));
    }
    let body = body.trim_start_matches('\u{feff}');
    if body.trim_start().starts_with('<') {
        return Err("工作量微服务返回异常页面".to_string());
    }
    let payload: Value =
        serde_json::from_str(body).map_err(|e| format!("工作量响应解析失败: {e}"))?;

    // 成功码：数字 1 或字符串 "1"；缺失视为「无 code 字段」直接透传。
    let code_value = payload.get("code");
    if let Some(code) = code_value {
        let ok = match code {
            Value::Number(number) => number.as_i64() == Some(1),
            Value::String(text) => text.trim() == "1",
            _ => false,
        };
        if !ok {
            let message = payload
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            return Err(format!(
                "工作量微服务返回 code={} message={message}",
                code
            ));
        }
    }
    Ok(payload)
}

/// 把 `{code,message,data}` 归一为前端契约结构。
///
/// `data` 为 `null` / 缺失时返回 `available: false`，**不把 null 当 0**。
pub(crate) fn normalize_workload(payload: &Value) -> Value {
    let data = payload.get("data").filter(|value| !value.is_null());
    match data {
        Some(data) => json!({
            "available": true,
            "raw": data,
        }),
        None => json!({
            "available": false,
            "raw": Value::Null,
        }),
    }
}

/// 拉取教师工作量汇总。
pub(crate) async fn fetch_workload_with(
    client: &HbutClient,
    _semester: Option<String>,
) -> Result<Value, String> {
    // fail-closed：独立白名单校验（`/twork` 不走 `/admin` 前缀）。
    assert!(readonly::is_teacher_workload_readonly_path(
        readonly::PATH_WORKLOAD_SUMMARY
    ));

    let url = format!(
        "{}{}",
        client.jwxt_base_url(),
        readonly::PATH_WORKLOAD_SUMMARY
    );
    let response = client
        .http_client()
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header(
            "Referer",
            format!("{}/admin/", client.jwxt_base_url()),
        )
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    let payload = interpret_workload_response(status, &final_url, &body)?;
    let normalized = normalize_workload(&payload);
    crate::hbut_debug!(
        "[TeacherWorkload] available={}",
        normalized
            .get("available")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    );
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn interpret_accepts_numeric_code_one() {
        let payload =
            interpret_workload_response(200, "https://jwxt.hbut.edu.cn/twork/x", r#"{"code":1,"data":{"gzl":320}}"#)
                .expect("应成功");
        assert_eq!(
            payload.get("data").and_then(|d| d.get("gzl")).and_then(Value::as_i64),
            Some(320)
        );
    }

    #[test]
    fn interpret_accepts_string_code_one() {
        assert!(interpret_workload_response(
            200,
            "https://jwxt.hbut.edu.cn/twork/x",
            r#"{"code":"1","data":null}"#
        )
        .is_ok());
    }

    #[test]
    fn interpret_rejects_non_one_code() {
        let err = interpret_workload_response(
            200,
            "https://jwxt.hbut.edu.cn/twork/x",
            r#"{"code":0,"message":"数据异常"}"#,
        )
        .unwrap_err();
        assert!(err.contains("数据异常"), "实际: {err}");
    }

    #[test]
    fn interpret_allows_payload_without_code() {
        assert!(interpret_workload_response(
            200,
            "https://jwxt.hbut.edu.cn/twork/x",
            r#"{"gzl":320}"#
        )
        .is_ok());
    }

    #[test]
    fn normalize_null_data_is_unavailable_not_zero() {
        let value = normalize_workload(&json!({ "code": 1, "data": null }));
        assert_eq!(value.get("available").and_then(Value::as_bool), Some(false));
        assert!(value.get("raw").map(Value::is_null).unwrap_or(false));
    }

    #[test]
    fn normalize_present_data_is_available() {
        let value = normalize_workload(&json!({ "code": 1, "data": { "gzl": 320 } }));
        assert_eq!(value.get("available").and_then(Value::as_bool), Some(true));
        assert_eq!(
            value.get("raw").and_then(|r| r.get("gzl")).and_then(Value::as_i64),
            Some(320)
        );
    }

    #[test]
    fn workload_path_whitelist_rejects_writes() {
        assert!(readonly::is_teacher_workload_readonly_path(
            readonly::PATH_WORKLOAD_SUMMARY
        ));
        assert!(!readonly::is_teacher_workload_readonly_path(
            "/twork/jsd/save"
        ));
        assert!(!readonly::is_teacher_workload_readonly_path("/other/x"));
    }
}
