//! 教师教务只读查询的**共享工具层**（goal-21 / T04a）。
//!
//! 为什么单独抽出来：`teaching.rs` 与 `exams.rs` 各自复制了一份 `fetch_grid` /
//! `interpret_grid_response` / `extract_grid_results`，新增 10 个模块时若继续复制会
//! 让「错误归一化」和「jqGrid 包裹兼容」两处逻辑分裂成十几份。本模块作为**唯一实现**，
//! 新模块统一复用（旧模块暂不改动，避免超出写作用域）。
//!
//! 硬约束：
//! 1. 只发 GET（唯一例外见 `readonly.rs` 的 `post_ok` 项，本层不提供 POST 入口）；
//! 2. 路径必须由调用方从 [`super::readonly`] 的常量取，本层不接收字面量；
//! 3. 任何非 2xx / 登录页重定向 / 错误 HTML 页 / `ret != 0` 一律归一为 `Err`，
//!    **绝不返回假数据**。

use serde_json::Value;

use crate::http_client::{looks_like_academic_login_url, HbutClient};

/// jqGrid 通用只读查询参数（recon 04 §0.4）。
///
/// `rows` 取 200：教师侧列表最长实测 15 条（通知收件箱），200 足够一次取完；
/// 超过 200 的列表（如全校课表 6941 条）**不应走本函数**，需单独分页。
pub(crate) const GRID_QUERY: &[(&str, &str)] = &[
    ("gridtype", "jqgrid"),
    ("page", "1"),
    ("rows", "200"),
    ("_search", "false"),
];

/// 把一次 HTTP 响应归一为 jqGrid 载荷。
///
/// 覆盖 recon 记录的四种错误形态：
/// - 重定向到登录页 → 「会话已过期」
/// - HTTP 401 → 「没有访问当前接口的权限」
/// - 非 2xx → 「状态异常」
/// - HTTP 200 + 错误 HTML 页（「报错啦」）→ 「返回异常页面」
/// - `ret != 0` → 带 `msg` 的业务错误
pub(crate) fn interpret_grid_response(
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
        return Err(format!("教务接口状态异常: HTTP {status}"));
    }
    // 去掉可能的 UTF-8 BOM 再判定正文形态（BOM 既非空白也不是合法 JSON 起始）。
    let body = body.trim_start_matches('\u{feff}');
    if body.trim_start().starts_with('<') {
        return Err("教务系统返回异常页面（报错啦）".to_string());
    }
    let payload: Value = serde_json::from_str(body).map_err(|e| format!("响应解析失败: {e}"))?;
    if let Some(ret) = payload.get("ret").and_then(Value::as_i64) {
        if ret != 0 {
            let msg = payload.get("msg").and_then(Value::as_str).unwrap_or("");
            return Err(format!("教务接口返回 ret={ret} msg={msg}"));
        }
    }
    Ok(payload)
}

/// 请求一个 jqGrid 只读列表（GET）并归一化错误。
///
/// `path` 必须是 [`super::readonly`] 中已登记的常量；`semester` 非空时附加 `xnxq`。
pub(crate) async fn fetch_grid(
    client: &HbutClient,
    path: &str,
    semester: Option<&str>,
    referer: &str,
) -> Result<Value, String> {
    fetch_grid_with_params(client, path, semester, referer, &[]).await
}

/// 同 [`fetch_grid`]，但可附加业务查询参数（如缓考的 `lx`、不及格明细的 `id`）。
///
/// `extra` 里的键**不得**是 `xnxq`（学期由 `semester` 参数统一注入，避免重复键）。
pub(crate) async fn fetch_grid_with_params(
    client: &HbutClient,
    path: &str,
    semester: Option<&str>,
    referer: &str,
    extra: &[(&str, &str)],
) -> Result<Value, String> {
    let url = format!("{}{}", client.jwxt_base_url(), path);
    let mut request = client
        .http_client()
        .get(&url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Referer", referer)
        .query(GRID_QUERY);
    if let Some(semester) = semester {
        request = request.query(&[("xnxq", semester)]);
    }
    if !extra.is_empty() {
        request = request.query(extra);
    }
    // 教务部分端点极慢（实测 /admin/jsd/xskq/xswdxskqListCustom 耗时 35.9 秒），
    // 全局 client 超时是 30s 会失败。教师侧只读请求统一放宽到 90s。
    let response = request
        .timeout(std::time::Duration::from_secs(90))
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    interpret_grid_response(status, &final_url, &body)
}

/// 从 jqGrid 包裹（`{..., results[]}`）或裸数组中提取记录数组。
pub(crate) fn extract_grid_results(payload: &Value) -> Vec<Value> {
    match payload {
        Value::Array(items) => items.clone(),
        Value::Object(_) => payload
            .get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// 记录稳定键：优先 `id`，退化到 `jxbid`，再退化到 `kcmc|name`。
///
/// 绝不使用时间戳/随机数，保证同一记录在任何刷新下键稳定。
fn record_key(record: &Value) -> String {
    for field in ["id", "jxbid"] {
        if let Some(text) = record.get(field).and_then(Value::as_str) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return format!("{field}:{trimmed}");
            }
        }
    }
    let kcmc = record
        .get("kcmc")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let name = record
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    format!("fallback:{kcmc}|{name}")
}

/// 按稳定键去重：保留首次出现顺序，**不丢数据、不重排、不合并不同记录**。
pub(crate) fn dedupe_records(records: Vec<Value>) -> Vec<Value> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(records.len());
    for record in records {
        if seen.insert(record_key(&record)) {
            out.push(record);
        }
    }
    out
}

/// 解析 jqGrid 列表响应 → 记录数组（已去重）。
pub(crate) fn parse_grid_list(payload: &Value) -> Vec<Value> {
    dedupe_records(extract_grid_results(payload))
}

/// 取记录的字符串字段（去空白；空串返回 `None`）。
///
/// 教务响应里大量字段是「空串代表无值」而非 `null`，统一用本函数取值，
/// 避免各模块各写一套 `trim().is_empty()`。
pub(crate) fn text_field(record: &Value, field: &str) -> Option<String> {
    record
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

/// 取记录的数值字段（字符串数字也能解析；非法返回 `None`）。
///
/// 教务很多数值字段以字符串下发（`"61"` / `"94.2"`），直接 `as_i64()` 会拿到 `None`。
pub(crate) fn number_field(record: &Value, field: &str) -> Option<f64> {
    let raw = record.get(field)?;
    if let Some(value) = raw.as_f64() {
        return Some(value);
    }
    raw.as_str()
        .map(str::trim)
        .and_then(|text| text.parse::<f64>().ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extract_supports_grid_and_bare_array() {
        let grid = json!({ "ret": 0, "total": 2, "results": [{ "id": "a" }, { "id": "b" }] });
        assert_eq!(extract_grid_results(&grid).len(), 2);

        let bare = json!([{ "id": "a" }]);
        assert_eq!(extract_grid_results(&bare).len(), 1);

        assert!(extract_grid_results(&json!(null)).is_empty());
    }

    #[test]
    fn interpret_rejects_login_redirect() {
        let err = interpret_grid_response(302, "https://auth.hbut.edu.cn/authserver/login", "")
            .unwrap_err();
        assert!(err.contains("会话已过期"), "实际: {err}");
    }

    #[test]
    fn interpret_rejects_401_and_html_page() {
        assert!(interpret_grid_response(401, "https://jwxt.hbut.edu.cn/admin/x", "")
            .unwrap_err()
            .contains("401"));
        assert!(
            interpret_grid_response(200, "https://jwxt.hbut.edu.cn/admin/x", "<html>报错啦</html>")
                .unwrap_err()
                .contains("异常页面")
        );
    }

    #[test]
    fn interpret_rejects_non_zero_ret() {
        let err = interpret_grid_response(
            200,
            "https://jwxt.hbut.edu.cn/admin/x",
            r#"{"ret":-1,"msg":"参数传输异常"}"#,
        )
        .unwrap_err();
        assert!(err.contains("参数传输异常"), "实际: {err}");
    }

    #[test]
    fn interpret_accepts_valid_payload_with_bom() {
        let payload =
            interpret_grid_response(200, "https://jwxt.hbut.edu.cn/admin/x", "\u{feff}{\"ret\":0,\"results\":[]}")
                .expect("应解析成功");
        assert_eq!(payload.get("ret").and_then(Value::as_i64), Some(0));
    }

    #[test]
    fn dedupe_keeps_first_and_preserves_order() {
        let records = vec![
            json!({ "id": "1", "kcmc": "A" }),
            json!({ "id": "1", "kcmc": "A-dup" }),
            json!({ "id": "2", "kcmc": "B" }),
        ];
        let out = dedupe_records(records);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].get("kcmc").and_then(Value::as_str), Some("A"));
    }

    #[test]
    fn number_field_accepts_string_numbers() {
        let record = json!({ "rs": "61", "rate": 94.2, "bad": "x" });
        assert_eq!(number_field(&record, "rs"), Some(61.0));
        assert_eq!(number_field(&record, "rate"), Some(94.2));
        assert_eq!(number_field(&record, "bad"), None);
        assert_eq!(number_field(&record, "missing"), None);
    }

    #[test]
    fn text_field_trims_and_filters_empty() {
        let record = json!({ "a": "  x  ", "b": "   ", "c": null });
        assert_eq!(text_field(&record, "a").as_deref(), Some("x"));
        assert_eq!(text_field(&record, "b"), None);
        assert_eq!(text_field(&record, "c"), None);
    }
}
