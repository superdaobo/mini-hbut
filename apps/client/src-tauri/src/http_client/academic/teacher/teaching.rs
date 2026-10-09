//! 我的教学：教学任务 + 教学班（只读）—— E5（#1025）。
//!
//! 关键陷阱（recon 04 §1.1 / §1.4，必须遵守）：
//! - `ajaxListJsJxrw`（实测 6 条）与 `jsdQueryJxbList`（实测 4 条）**粒度不同**，
//!   **禁止按数组索引拼接**，只能按可靠教学班 ID（`jxbid`）关联；
//! - `/admin/jsd/xskq/ajaxListJsJxrw` 是**学生考勤统计模块**，与教学任务接口末段同名，
//!   **禁止误用**（本模块只引用 [`readonly`] 里已登记的常量，不写任何路径字面量）。
//!
//! 设计要点：
//! 1. **只读**：两个接口均为 GET，路径取自 [`readonly`] 的 allowlist 常量；
//! 2. **解析与关联是纯函数**（见 [`parse_teaching_tasks`] / [`link_tasks_to_classes`]），
//!    与网络解耦，便于单测覆盖「6 对 4」不误合并/丢失；
//! 3. HTML 清洗**不在本层做**：教务字段原样透传，由前端
//!    `features/teacher/utils/normalizeTeacherData.ts` 统一清洗（单一清洗入口）。

use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};

use super::readonly;
use crate::http_client::{looks_like_academic_login_url, HbutClient};

/// jqGrid 通用只读查询参数（recon 04 §0.4：列表接口统一带 `gridtype=jqgrid`）。
const GRID_QUERY: &[(&str, &str)] = &[
    ("gridtype", "jqgrid"),
    ("page", "1"),
    ("rows", "200"),
    ("_search", "false"),
];

// ────────────────────────────────────────────────────────────────
// 纯函数：响应解析
// ────────────────────────────────────────────────────────────────

/// 从 jqGrid 包裹（`{..., results[]}`）或裸数组中提取记录数组。
///
/// recon 04 §0.1：列表类接口统一为 jqGrid 形态；裸数组形态做兼容兜底。
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
    let mut seen = HashSet::new();
    let mut out = Vec::with_capacity(records.len());
    for record in records {
        if seen.insert(record_key(&record)) {
            out.push(record);
        }
    }
    out
}

/// 解析教学任务响应 → 教学任务记录（已按稳定键去重）。
pub(crate) fn parse_teaching_tasks(payload: &Value) -> Vec<Value> {
    dedupe_records(extract_grid_results(payload))
}

/// 解析教学班响应 → 教学班记录（已按稳定键去重）。
pub(crate) fn parse_teaching_classes(payload: &Value) -> Vec<Value> {
    dedupe_records(extract_grid_results(payload))
}

/// 解释一次 jqGrid 只读响应：把 401 / 会话过期 / 错误 HTML 页 / `ret != 0` 归一为错误消息。
///
/// 与网络解耦，便于单测直接覆盖各错误形态（recon 04 §0.3）。
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
        // HTTP 200 + 错误 HTML 页（recon 04 §0.3「报错啦 / 错误原因」）
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

// ────────────────────────────────────────────────────────────────
// 纯函数：按 `jxbid` 关联（禁止按数组索引拼接）
// ────────────────────────────────────────────────────────────────

/// 取记录的 `jxbid`（教学班 id）；缺失/空白返回 `None`。
pub(crate) fn record_jxbid(record: &Value) -> Option<&str> {
    record
        .get("jxbid")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

/// 按 `jxbid` 建立教学班索引：`jxbid → 首个教学班下标`。
///
/// 同一 `jxbid` 重复出现时只保留首个（确定性，不随机覆盖）。
pub(crate) fn index_classes_by_jxbid(classes: &[Value]) -> HashMap<String, usize> {
    let mut index = HashMap::new();
    for (position, class) in classes.iter().enumerate() {
        if let Some(jxbid) = record_jxbid(class) {
            index.entry(jxbid.to_string()).or_insert(position);
        }
    }
    index
}

/// 教学任务 ↔ 教学班 关联项（**按 `jxbid` 精确匹配，绝不用数组下标对齐**）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TeachingLink {
    /// 教学任务下标（对应传入的 `tasks`）。
    pub task_index: usize,
    /// 关联到的教学班下标；无匹配为 `None`。
    pub class_index: Option<usize>,
}

/// 逐条教学任务按 `jxbid` 关联教学班。
///
/// - 输出长度**恒等于教学任务数**（6 条任务 → 6 个关联项，一条都不会丢）；
/// - 教学班数少于任务数时，未匹配任务 `class_index = None`（**不会**错配到别的班）；
/// - 无 `jxbid` 的任务同样 `class_index = None`。
pub(crate) fn link_tasks_to_classes(tasks: &[Value], classes: &[Value]) -> Vec<TeachingLink> {
    let index = index_classes_by_jxbid(classes);
    tasks
        .iter()
        .enumerate()
        .map(|(task_index, task)| TeachingLink {
            task_index,
            class_index: record_jxbid(task).and_then(|jxbid| index.get(jxbid).copied()),
        })
        .collect()
}

/// 关联统计（供日志与单测断言，**不改变输出结构**）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TeachingLinkSummary {
    pub task_count: usize,
    pub class_count: usize,
    pub matched: usize,
    pub unmatched_tasks: usize,
    pub unused_classes: usize,
}

/// 汇总关联情况：用于确认「6 对 4」既不被合并也不丢失。
pub(crate) fn summarize_links(tasks: &[Value], classes: &[Value]) -> TeachingLinkSummary {
    let links = link_tasks_to_classes(tasks, classes);
    let matched = links
        .iter()
        .filter(|link| link.class_index.is_some())
        .count();
    let mut used = HashSet::new();
    for link in &links {
        if let Some(index) = link.class_index {
            used.insert(index);
        }
    }
    TeachingLinkSummary {
        task_count: tasks.len(),
        class_count: classes.len(),
        matched,
        unmatched_tasks: links.len() - matched,
        unused_classes: classes.len().saturating_sub(used.len()),
    }
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

/// 拉取教学任务与我的教学班，返回 E0 冻结载荷 `{ tasks, classes }`。
///
/// 会话由调用方通过 [`fetch_teaching_with`] 传入的共享 `&HbutClient` 提供；
/// 会话失效时接口会重定向登录页，被归一为「会话已过期」错误而非假数据。
pub(crate) async fn fetch_teaching_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    // fail-closed：只允许已登记的只读路径（常量取自 readonly.rs，不写字面量）。
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHING_TASKS
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHING_CLASSES
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let referer = format!("{}/admin/", client.jwxt_base_url());

    let tasks_payload = fetch_grid(
        client,
        readonly::PATH_TEACHING_TASKS,
        semester.as_deref(),
        &referer,
    )
    .await?;
    let classes_payload = fetch_grid(
        client,
        readonly::PATH_TEACHING_CLASSES,
        semester.as_deref(),
        &referer,
    )
    .await?;

    let tasks = parse_teaching_tasks(&tasks_payload);
    let classes = parse_teaching_classes(&classes_payload);

    // 关联统计只用于可观测性：确认「粒度不同」的两个列表既未合并也未丢失。
    let summary = summarize_links(&tasks, &classes);
    crate::hbut_debug!(
        "[TeacherTeaching] 教学任务 {} 条 / 教学班 {} 条 / 按 jxbid 关联 {} 条（未匹配任务 {}，未使用教学班 {}）",
        summary.task_count,
        summary.class_count,
        summary.matched,
        summary.unmatched_tasks,
        summary.unused_classes
    );

    Ok(json!({ "tasks": tasks, "classes": classes }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn task(id: &str, jxbid: &str, kcmc: &str, name: &str) -> Value {
        json!({
            "id": id,
            "jxbid": jxbid,
            "kcmc": kcmc,
            "name": name,
            "bjrs": 49,
            "xf": "1.5"
        })
    }

    fn class(id: &str, jxbid: &str, kcmc: &str, name: &str, xs: &str) -> Value {
        json!({
            "id": id,
            "jxbid": jxbid,
            "kcmc": kcmc,
            "name": name,
            "bjrs": 49,
            "xf": "1.5",
            "xs": xs
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
                { "id": "dup", "jxbid": "JX-1", "kcmc": "课程甲", "name": "班甲" },
                { "id": "dup", "jxbid": "JX-1", "kcmc": "课程甲", "name": "班甲" },
                { "id": "keep", "jxbid": "JX-2", "kcmc": "课程乙", "name": "班乙" }
            ]
        });
        let tasks = parse_teaching_tasks(&payload);
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0]["id"], json!("dup"));
        assert_eq!(tasks[1]["id"], json!("keep"));
    }

    /// 核心验收：**6 条教学任务 对 4 条教学班，粒度不同**。
    ///
    /// 教学班顺序与任务顺序**故意错位**（若按数组索引拼接必然错配），
    /// 断言只按 `jxbid` 精确关联：任务一条不丢、教学班一条不少、未匹配为 `None`。
    #[test]
    fn six_tasks_four_classes_link_by_jxbid_not_by_index() {
        let tasks = vec![
            task("t1", "JX-A", "课程一", "班一"),
            task("t2", "JX-B", "课程二", "班二"),
            task("t3", "JX-C", "课程三", "班三"),
            task("t4", "JX-D", "课程四", "班四"),
            task("t5", "JX-E", "课程五", "班五"),
            task("t6", "JX-F", "课程六", "班六"),
        ];
        // 教学班只有 4 条，且顺序与任务不一致（JX-C 在首位）。
        let classes = vec![
            class("c1", "JX-C", "课程三", "班三", "24"),
            class("c2", "JX-A", "课程一", "班一", "32"),
            class("c3", "JX-B", "课程二", "班二", "16"),
            class("c4", "JX-D", "课程四", "班四", "48"),
        ];

        let links = link_tasks_to_classes(&tasks, &classes);
        assert_eq!(links.len(), 6, "6 条教学任务必须全部保留");

        // t1(JX-A) → c2；按索引拼接会错配到 c1，这里断言按 jxbid 命中 c2。
        assert_eq!(links[0].class_index, Some(1));
        assert_eq!(links[1].class_index, Some(2));
        assert_eq!(links[2].class_index, Some(0));
        assert_eq!(links[3].class_index, Some(3));
        // t5(JX-E) / t6(JX-F) 在教学班列表中不存在 → None，绝不错配到别的班。
        assert_eq!(links[4].class_index, None);
        assert_eq!(links[5].class_index, None);

        let summary = summarize_links(&tasks, &classes);
        assert_eq!(
            summary,
            TeachingLinkSummary {
                task_count: 6,
                class_count: 4,
                matched: 4,
                unmatched_tasks: 2,
                unused_classes: 0,
            }
        );
    }

    #[test]
    fn link_returns_none_for_missing_or_blank_jxbid() {
        let tasks = vec![
            json!({ "id": "t1" }),
            json!({ "id": "t2", "jxbid": "   " }),
            json!({ "id": "t3", "jxbid": "JX-1" }),
        ];
        let classes = vec![class("c1", "JX-1", "课程", "班", "8")];
        let links = link_tasks_to_classes(&tasks, &classes);
        assert_eq!(links[0].class_index, None);
        assert_eq!(links[1].class_index, None);
        assert_eq!(links[2].class_index, Some(0));
    }

    #[test]
    fn index_keeps_first_class_for_duplicate_jxbid() {
        let classes = vec![
            class("c1", "JX-1", "课程", "班甲", "8"),
            class("c2", "JX-1", "课程", "班乙", "16"),
        ];
        let index = index_classes_by_jxbid(&classes);
        assert_eq!(index.get("JX-1"), Some(&0));
        assert_eq!(index.len(), 1);
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
}
