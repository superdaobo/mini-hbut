//! 考试与监考（只读）—— E6（#1026）。
//!
//! 依据 [`data/teacher-api-recon/05-exam-eval-apis.md`]：
//! - 我的监考安排：`GET /admin/jsd/kwglJsdJkcx/ajaxJsjkList`（jqGrid，实测 total=1）；
//! - 任课班级考试：`GET /admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList`（jqGrid，实测 total=1）。
//!
//! 红线（recon 05 §5）：
//! - **绝不**调用监考变更写接口（`changeJkjs` / `batchChangeJkjs`）；
//! - **绝不**调用试卷提交 / 上传 / 导出（`tjsq` / `sjsc` / `exportSysj`）。
//!
//! 设计要点：
//! 1. **只读**：两个接口均为 GET，路径取自 [`readonly`] 的 allowlist 常量，本文件不写路径字面量；
//! 2. **解析是纯函数**（[`parse_invigilations`] / [`parse_course_exams`] /
//!    [`interpret_grid_response`] / [`interpret_session_snapshot`]），与网络解耦，便于单测；
//! 3. **绝不返回假数据**：会话快照缺失 / 过期一律归一为「会话已过期」，由前端
//!    `classifyTeacherErrorKind` 归类为 `expired`；
//! 4. 字段原样透传，HTML 清洗由前端 `features/teacher/utils/normalizeTeacherData.ts` 统一完成。

use std::collections::HashSet;

use serde_json::{json, Value};

use super::readonly;
use crate::http_client::{looks_like_academic_login_url, HbutClient};

/// jqGrid 通用只读查询参数（recon 05 §0.3：列表接口统一带 `gridtype=jqgrid`）。
const GRID_QUERY: &[(&str, &str)] = &[
    ("gridtype", "jqgrid"),
    ("page", "1"),
    ("rows", "200"),
    ("_search", "false"),
];

/// 会话过期统一错误消息。
///
/// 前端 `classifyTeacherErrorKind` 依赖「会话已过期 / 重新登录」文案命中 `expired`，
/// 因此这里集中定义，避免多处漂移。
pub(crate) const SESSION_EXPIRED_MESSAGE: &str = "会话已过期，请重新登录";

// ────────────────────────────────────────────────────────────────
// 纯函数：响应解析
// ────────────────────────────────────────────────────────────────

/// 从 jqGrid 包裹（`{..., results[]}`）或裸数组中提取记录数组。
///
/// recon 05 §0.1：列表类接口统一为 jqGrid 形态；裸数组形态做兼容兜底。
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

/// 取记录中第一个非空白字符串字段值。
fn first_text<'a>(record: &'a Value, fields: &[&str]) -> Option<&'a str> {
    fields.iter().find_map(|field| {
        record
            .get(*field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    })
}

/// 监考记录稳定键：优先 `id`，退化到业务字段组合（`kcmc|ksrq|kscc|zjk`）。
///
/// 绝不使用时间戳/随机数，保证同一记录在任何刷新下键稳定。
fn invigilation_key(record: &Value) -> String {
    if let Some(id) = first_text(record, &["id"]) {
        return format!("id:{id}");
    }
    let parts = ["kcmc", "ksrq", "kscc", "zjk"].map(|field| {
        record
            .get(field)
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
    });
    format!("fallback:{}", parts.join("|"))
}

/// 任课班考试记录稳定键：优先 `id`，退化到业务字段组合（`kcmc|ksrq|kssj|jsmc`）。
fn course_exam_key(record: &Value) -> String {
    if let Some(id) = first_text(record, &["id"]) {
        return format!("id:{id}");
    }
    let parts = ["kcmc", "ksrq", "kssj", "jsmc"].map(|field| {
        record
            .get(field)
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
    });
    format!("fallback:{}", parts.join("|"))
}

/// 按稳定键去重：保留首次出现顺序，**不丢数据、不重排、不合并不同记录**。
fn dedupe_records(records: Vec<Value>, key_of: fn(&Value) -> String) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(records.len());
    for record in records {
        if seen.insert(key_of(&record)) {
            out.push(record);
        }
    }
    out
}

/// 解析监考安排响应 → 监考记录（已按稳定键去重）。
pub(crate) fn parse_invigilations(payload: &Value) -> Vec<Value> {
    dedupe_records(extract_grid_results(payload), invigilation_key)
}

/// 解析任课班级考试响应 → 考试记录（已按稳定键去重）。
pub(crate) fn parse_course_exams(payload: &Value) -> Vec<Value> {
    dedupe_records(extract_grid_results(payload), course_exam_key)
}

/// 解释一次 jqGrid 只读响应：把 401 / 会话过期 / 错误 HTML 页 / `ret != 0` 归一为错误消息。
///
/// 与网络解耦，便于单测直接覆盖各错误形态（recon 05 §0.4）。
pub(crate) fn interpret_grid_response(
    status: u16,
    final_url: &str,
    body: &str,
) -> Result<Value, String> {
    if looks_like_academic_login_url(final_url) {
        return Err(SESSION_EXPIRED_MESSAGE.to_string());
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
        // HTTP 200 + 错误 HTML 页（recon 05 §0.4「报错啦 / 错误原因」）
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

/// 会话快照可用性归一：无有效会话 cookie → 「会话已过期」错误。
///
/// 会话由 `application::TeacherService` 透传的共享 `&HbutClient` 提供；本函数只做
/// 「会话 cookie 是否可用」的判定。快照缺失 / 过期时**绝不发请求、绝不返回假数据**，
/// 直接归一为 `expired`。
pub(crate) fn interpret_session_snapshot(has_session_cookies: bool) -> Result<(), String> {
    if has_session_cookies {
        Ok(())
    } else {
        Err(SESSION_EXPIRED_MESSAGE.to_string())
    }
}

/// 判断 cookie 头是否包含有效会话（`None` / 空白 → 无会话）。
pub(crate) fn cookie_header_has_session(header: Option<&str>) -> bool {
    header.map(|raw| !raw.trim().is_empty()).unwrap_or(false)
}

/// 教务域名下是否已恢复会话 cookie（即本地快照是否可用）。
fn has_jwxt_session_cookies(client: &HbutClient) -> bool {
    use reqwest::cookie::CookieStore;

    let url = match reqwest::Url::parse(client.jwxt_base_url()) {
        Ok(url) => url,
        Err(_) => return false,
    };
    let header = client.cookie_jar.cookies(&url);
    cookie_header_has_session(header.as_ref().and_then(|value| value.to_str().ok()))
}

// ────────────────────────────────────────────────────────────────
// 网络：两个只读 GET
// ────────────────────────────────────────────────────────────────

/// 请求一个 jqGrid 只读列表并归一化错误。
async fn fetch_grid(
    client: &HbutClient,
    path: &str,
    semester: Option<&str>,
    referer: &str,
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
    let response = request.send().await.map_err(|e| format!("请求失败: {e}"))?;

    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;
    interpret_grid_response(status, &final_url, &body)
}

/// 拉取监考安排与任课班级考试，返回 E0 冻结载荷 `{ invigilations, exams }`。
///
/// 会话由调用方通过 [`fetch_exams_with`] 传入的共享 `&HbutClient` 提供；
/// 会话失效（快照缺失 / 过期）时返回 `expired` 错误，**绝不返回假数据**。
pub(crate) async fn fetch_exams_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    // fail-closed：只允许已登记的只读路径（常量取自 readonly.rs，不写字面量）。
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_INVIGILATION_LIST
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_COURSE_EXAM_LIST
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    // 本地会话快照缺失 / 过期：归一为 expired，不发请求、不返回假数据。
    interpret_session_snapshot(has_jwxt_session_cookies(client))?;

    let referer = format!("{}/admin/", client.jwxt_base_url());

    let invigilation_payload = fetch_grid(
        client,
        readonly::PATH_INVIGILATION_LIST,
        semester.as_deref(),
        &referer,
    )
    .await?;
    let exam_payload = fetch_grid(
        client,
        readonly::PATH_COURSE_EXAM_LIST,
        semester.as_deref(),
        &referer,
    )
    .await?;

    let invigilations = parse_invigilations(&invigilation_payload);
    let exams = parse_course_exams(&exam_payload);

    crate::hbut_debug!(
        "[TeacherExams] 监考 {} 条 / 任课班级考试 {} 条",
        invigilations.len(),
        exams.len()
    );

    Ok(json!({ "invigilations": invigilations, "exams": exams }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 脱敏监考样本（字段取自 recon 05 §1.1；不含真实工号 / 姓名 / Cookie）。
    fn invigilation(id: &str, kcmc: &str, ksrq: &str, kscc: &str, zjk: &str, jsmc: &str) -> Value {
        json!({
            "id": id,
            "xnxq": "2026-2027-1",
            "xqmc": "本部",
            "zjk": zjk,
            "ksrq": ksrq,
            "kscc": kscc,
            "kcmc": kcmc,
            "jsmc": jsmc,
            "ksrs": 23,
            "kspcmc": "示例批次",
            "currentUserId": "SECRET",
            "new": true
        })
    }

    /// 脱敏任课班考试样本（字段取自 recon 05 §1.2）。
    fn course_exam(id: &str, kcmc: &str, ksrq: &str, kssj: &str, jsmc: &str) -> Value {
        json!({
            "id": id,
            "kcmc": kcmc,
            "jsmc": jsmc,
            "kssj": kssj,
            "ksrq": ksrq,
            "ksrs": 23,
            "jxbmc": "示例教学班",
            "bjmc": "示例班级",
            "jsname": "示例教师",
            "kcbh": "00000000A",
            "currentUserId": "SECRET",
            "new": true
        })
    }

    #[test]
    fn extracts_results_from_jqgrid_and_bare_array() {
        let grid = json!({ "ret": 0, "total": 2, "results": [{ "id": "a" }, { "id": "b" }] });
        assert_eq!(extract_grid_results(&grid).len(), 2);

        let bare = json!([{ "id": "a" }]);
        assert_eq!(extract_grid_results(&bare).len(), 1);

        assert!(extract_grid_results(&json!({ "ret": 0 })).is_empty());
        assert!(extract_grid_results(&json!("oops")).is_empty());
    }

    #[test]
    fn parse_dedupes_by_id_and_keeps_first_occurrence() {
        let payload = json!({
            "results": [
                invigilation("dup", "课程甲", "2026-08-30", "第1场", "主监考", "2-302"),
                invigilation("dup", "课程甲", "2026-08-30", "第1场", "主监考", "2-302"),
                invigilation("keep", "课程乙", "2026-08-31", "第2场", "副监考", "3-101")
            ]
        });
        let items = parse_invigilations(&payload);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["id"], json!("dup"));
        assert_eq!(items[1]["id"], json!("keep"));
    }

    #[test]
    fn invigilation_fallback_key_dedupes_without_id() {
        // 无 id 时按 kcmc|ksrq|kscc|zjk 去重；日期不同则是两条不同记录。
        let payload = json!({
            "results": [
                { "kcmc": "课程甲", "ksrq": "2026-08-30", "kscc": "第1场", "zjk": "主监考" },
                { "kcmc": "课程甲", "ksrq": "2026-08-30", "kscc": "第1场", "zjk": "主监考" },
                { "kcmc": "课程甲", "ksrq": "2026-08-31", "kscc": "第1场", "zjk": "主监考" }
            ]
        });
        assert_eq!(parse_invigilations(&payload).len(), 2);
    }

    #[test]
    fn course_exam_dedupes_by_id_and_keeps_distinct_records() {
        let payload = json!({
            "results": [
                course_exam("e1", "课程甲", "2026-08-30", "2026-08-30 14:30~18:00", "2-302"),
                course_exam("e1", "课程甲", "2026-08-30", "2026-08-30 14:30~18:00", "2-302"),
                course_exam("e2", "课程乙", "2026-09-01", "2026-09-01 09:00~11:00", "3-101")
            ]
        });
        let items = parse_course_exams(&payload);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["kcmc"], json!("课程甲"));
        assert_eq!(items[1]["kcmc"], json!("课程乙"));
    }

    /// 核心验收：解析**不交叉错配** —— 每条记录的课程/日期/地点/身份必须来自同一条源记录。
    #[test]
    fn parse_does_not_cross_mix_fields_across_records() {
        let payload = json!({
            "results": [
                invigilation("i1", "课程甲", "2026-08-30", "第1场", "主监考", "2-302"),
                invigilation("i2", "课程乙", "2026-08-31", "第2场", "副监考", "3-101")
            ]
        });
        let items = parse_invigilations(&payload);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0]["kcmc"], json!("课程甲"));
        assert_eq!(items[0]["ksrq"], json!("2026-08-30"));
        assert_eq!(items[0]["jsmc"], json!("2-302"));
        assert_eq!(items[0]["zjk"], json!("主监考"));
        assert_eq!(items[1]["kcmc"], json!("课程乙"));
        assert_eq!(items[1]["ksrq"], json!("2026-08-31"));
        assert_eq!(items[1]["jsmc"], json!("3-101"));
        assert_eq!(items[1]["zjk"], json!("副监考"));
    }

    #[test]
    fn interpret_response_handles_all_error_shapes() {
        // 正常
        let ok = interpret_grid_response(
            200,
            "https://jwxt.example/admin/x",
            r#"{"ret":0,"results":[]}"#,
        );
        assert!(ok.is_ok());

        // 登录页重定向 → 会话过期
        let expired = interpret_grid_response(
            200,
            "https://auth.example/authserver/login",
            "<html>登录</html>",
        );
        assert!(expired.unwrap_err().contains("会话已过期"));

        // HTTP 401 → 无权限
        let unauthorized = interpret_grid_response(401, "https://jwxt.example/admin/x", "");
        assert!(unauthorized.unwrap_err().contains("401"));

        // HTTP 500 → 状态异常
        let server_error = interpret_grid_response(500, "https://jwxt.example/admin/x", "");
        assert!(server_error.unwrap_err().contains("500"));

        // HTTP 200 + 错误 HTML 页
        let error_html =
            interpret_grid_response(200, "https://jwxt.example/admin/x", "<html>报错啦</html>");
        assert!(error_html.unwrap_err().contains("报错啦"));

        // ret != 0
        let ret_error = interpret_grid_response(
            200,
            "https://jwxt.example/admin/x",
            r#"{"ret":-1,"msg":"参数传输异常"}"#,
        );
        assert!(ret_error.unwrap_err().contains("ret=-1"));

        // 非 JSON 正文
        assert!(interpret_grid_response(200, "https://jwxt.example/admin/x", "not json").is_err());
    }

    #[test]
    fn session_snapshot_missing_is_normalized_to_expired() {
        // 快照缺失 → 过期错误（绝不返回假数据）
        let err = interpret_session_snapshot(false).unwrap_err();
        assert!(err.contains("会话已过期"));

        // 快照可用 → 放行
        assert!(interpret_session_snapshot(true).is_ok());
    }

    #[test]
    fn cookie_header_blank_is_not_a_session() {
        assert!(!cookie_header_has_session(None));
        assert!(!cookie_header_has_session(Some("")));
        assert!(!cookie_header_has_session(Some("   ")));
        assert!(cookie_header_has_session(Some("JSESSIONID=abc")));
    }
}
