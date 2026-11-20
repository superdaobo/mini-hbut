//! 调停补申请（教师只读）—— goal-21 / T04b。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! | 用途 | 接口 | 实测 |
//! | --- | --- | --- |
//! | 我的调停补申请 | `/admin/jsd/ttbgl/queryTtbxxList?listtype=js&xnxq=` | 200，total **0** |
//! | 可申请调停补的课程 | `/admin/jsd/ttbgl/queryJsPkxx` | 200，total **6** |
//!
//! 两者都是 jqGrid JSON。`queryJsPkxx` 的字段包含 `kcmc`（课程名）/`jxbmc`（教学班）/
//! `jxbbh`（教学班号）/`zsqs`（周学时）/`tzzxs`（总学时）/`leaf`（是否叶子节点）。
//!
//! ## 只读边界
//!
//! `pk/pkttbgl/*` 下的提交/撤回/审批类路径属写型，**不在 allowlist 内**。
//! App 内只做「能看到能申请哪些课 + 我的申请进度」，不提供提交入口。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 解析调停补列表响应（剔除框架注入的身份字段）。
pub(crate) fn parse_adjustment_list(payload: &Value) -> Vec<Value> {
    super::workflow::parse_workflow_list(payload)
}

/// 归一化「可申请课程」记录。
///
/// 字段映射：`kcmc`→`courseName`、`jxbmc`→`className`、`jxbbh`→`classNo`、
/// `zsqs`→`weeklyHours`、`tzzxs`→`totalHours`、`leaf`→`isLeaf`。
pub(crate) fn normalize_applicable_course(record: &Value) -> Value {
    json!({
        "courseName": grid::text_field(record, "kcmc"),
        "className": grid::text_field(record, "jxbmc"),
        "classNo": grid::text_field(record, "jxbbh"),
        "weeklyHours": grid::number_field(record, "zsqs"),
        "totalHours": grid::number_field(record, "tzzxs"),
        "isLeaf": record.get("leaf").and_then(Value::as_i64).map(|v| v != 0),
    })
}

/// 拉取调停补数据，返回 `{ myApply, applicable }`。
pub(crate) async fn fetch_adjustment_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ADJUSTMENT_MY_APPLY
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ADJUSTMENT_APPLICABLE
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let referer = format!("{}/admin/", client.jwxt_base_url());

    // 我的申请必须带 `listtype=js`（页面自身以 `?listtype=js&xnxq=` 调用）。
    let (apply_result, applicable_result) = tokio::join!(
        grid::fetch_grid_with_params(
            client,
            readonly::PATH_ADJUSTMENT_MY_APPLY,
            semester.as_deref(),
            &referer,
            &[("listtype", "js")]
        ),
        grid::fetch_grid(
            client,
            readonly::PATH_ADJUSTMENT_APPLICABLE,
            semester.as_deref(),
            &referer
        ),
    );

    let my_apply = parse_adjustment_list(&apply_result?);
    let applicable: Vec<Value> = parse_adjustment_list(&applicable_result?)
        .iter()
        .map(normalize_applicable_course)
        .collect();

    crate::hbut_debug!(
        "[TeacherAdjustment] 我的申请 {} 条 / 可申请课程 {} 条",
        my_apply.len(),
        applicable.len()
    );

    Ok(json!({ "myApply": my_apply, "applicable": applicable }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_maps_contract_fields() {
        let record = json!({
            "kcmc": "计算机制图与表达-1",
            "jxbmc": "计算机制图与表达-1(专业必修课)-01",
            "jxbbh": "01",
            "zsqs": "2",
            "tzzxs": "32",
            "leaf": 1,
            "currentUserName": "张三"
        });
        let out = normalize_applicable_course(&record);
        assert_eq!(out.get("courseName").and_then(Value::as_str), Some("计算机制图与表达-1"));
        assert_eq!(out.get("classNo").and_then(Value::as_str), Some("01"));
        assert_eq!(out.get("weeklyHours").and_then(Value::as_f64), Some(2.0));
        assert_eq!(out.get("totalHours").and_then(Value::as_f64), Some(32.0));
        assert_eq!(out.get("isLeaf").and_then(Value::as_bool), Some(true));
        // 归一化后不应残留身份字段
        assert!(out.get("currentUserName").is_none());
    }

    #[test]
    fn parse_handles_empty_grid() {
        assert!(parse_adjustment_list(&json!({ "ret": 0, "total": 0, "results": [] })).is_empty());
    }
}
