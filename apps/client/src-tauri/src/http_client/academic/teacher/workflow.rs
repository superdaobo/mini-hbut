//! 教师只读工作流：我的申请 / 我的经办 / 我的待办 —— goal-21 / T04a。
//!
//! ## 背景
//!
//! `TeacherWorkflowView.vue` 此前是 17 行的占位组件（`TeacherPlaceholder`，零网络）。
//! 三个只读端点其实**早已登记在 allowlist 里**（recon 06 实测 total 2 / 2 / 0），
//! 但全仓无调用方。本模块把它们接成真数据。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! | 用途 | 路径 | 实测 |
//! | --- | --- | --- |
//! | 我的申请 | `/admin/activiti/myApply/qryMyApply` | 200，total 2 |
//! | 我的经办 | `/admin/activiti/myApply/qryOperationApply` | 200，total 2 |
//! | 我的待办 | `/admin/activiti/dbsy/listRunningProcessInstaces` | 200，total 0 |
//!
//! 三者都是 jqGrid 列表；每条记录注入 `currentUserId` 等身份字段，解析时忽略。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 从 jqGrid 记录里剔除框架注入的身份字段。
///
/// recon 02 §6：几乎所有数组响应都会被注入
/// `currentUserId / userRoleId / dataAuth / dataXnxq / currentRoleId / currentJsId /
/// currentUserName / currentDepartmentId / new`。这些不属于业务数据，必须剔除，
/// 否则会把工号/姓名误当成业务字段透传到前端。
pub(crate) fn strip_identity_fields(record: &Value) -> Value {
    const INJECTED: &[&str] = &[
        "currentUserId",
        "userRoleId",
        "dataAuth",
        "dataXnxq",
        "currentRoleId",
        "currentJsId",
        "currentUserName",
        "currentDepartmentId",
        "new",
    ];
    match record {
        Value::Object(map) => {
            let mut out = map.clone();
            for key in INJECTED {
                out.remove(*key);
            }
            Value::Object(out)
        }
        other => other.clone(),
    }
}

/// 批量剔除身份字段。
pub(crate) fn strip_identity_fields_all(records: &[Value]) -> Vec<Value> {
    records.iter().map(strip_identity_fields).collect()
}

/// 解析工作流列表响应 → 剔除身份字段后的记录数组。
pub(crate) fn parse_workflow_list(payload: &Value) -> Vec<Value> {
    strip_identity_fields_all(&grid::parse_grid_list(payload))
}

/// 拉取三个只读工作流列表，返回 `{ myApply, myHandled, myTodo }`。
///
/// 三个请求互相独立，默认并发（`tokio::join!`）；错误优先级固定为
/// 申请 → 经办 → 待办（与原串行实现一致）。
pub(crate) async fn fetch_workflow_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_WORKFLOW_MY_APPLY
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_WORKFLOW_MY_HANDLED
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_WORKFLOW_MY_TODO
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let referer = format!("{}/admin/", client.jwxt_base_url());

    let (apply_result, handled_result, todo_result) = tokio::join!(
        grid::fetch_grid(
            client,
            readonly::PATH_WORKFLOW_MY_APPLY,
            semester.as_deref(),
            &referer
        ),
        grid::fetch_grid(
            client,
            readonly::PATH_WORKFLOW_MY_HANDLED,
            semester.as_deref(),
            &referer
        ),
        grid::fetch_grid(
            client,
            readonly::PATH_WORKFLOW_MY_TODO,
            semester.as_deref(),
            &referer
        ),
    );

    let my_apply = parse_workflow_list(&apply_result?);
    let my_handled = parse_workflow_list(&handled_result?);
    let my_todo = parse_workflow_list(&todo_result?);

    crate::hbut_debug!(
        "[TeacherWorkflow] 申请 {} 条 / 经办 {} 条 / 待办 {} 条",
        my_apply.len(),
        my_handled.len(),
        my_todo.len()
    );

    Ok(json!({
        "myApply": my_apply,
        "myHandled": my_handled,
        "myTodo": my_todo,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_removes_all_injected_identity_fields() {
        let record = json!({
            "id": "w1",
            "title": "调停补申请",
            "currentUserId": "u",
            "userRoleId": "r",
            "dataAuth": true,
            "dataXnxq": "2026-2027-1",
            "currentRoleId": "js",
            "currentJsId": "j",
            "currentUserName": "张三",
            "currentDepartmentId": "205",
            "new": false
        });
        let out = strip_identity_fields(&record);
        let map = out.as_object().expect("应为对象");
        assert_eq!(map.len(), 2, "只应保留 id 与 title");
        assert!(map.contains_key("id"));
        assert!(map.contains_key("title"));
    }

    #[test]
    fn parse_workflow_list_handles_grid_and_strips() {
        let payload = json!({
            "ret": 0,
            "total": 1,
            "results": [{ "id": "w1", "title": "A", "currentUserName": "张三" }]
        });
        let out = parse_workflow_list(&payload);
        assert_eq!(out.len(), 1);
        assert!(out[0].get("currentUserName").is_none());
        assert_eq!(out[0].get("title").and_then(Value::as_str), Some("A"));
    }

    #[test]
    fn parse_workflow_list_handles_empty() {
        let payload = json!({ "ret": 0, "total": 0, "results": [] });
        assert!(parse_workflow_list(&payload).is_empty());
    }
}
