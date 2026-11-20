//! 学分统计（教师视角）—— goal-21 / T04a。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! | 用途 | 页面（HTML） | 真实数据接口 | 实测 |
//! | --- | --- | --- | --- |
//! | 学分统计列表 | `/admin/xjgl/xftj` | `/admin/xjgl/xftj/getxftjlist` | 200，total 4 |
//! | 不及格课程明细 | `/admin/xjgl/xftj` | `/admin/xjgl/xftj/showBjgKcDetail?id=` | 200，total 0 |
//!
//! ## ⚠️ 学分列表是「宽表」
//!
//! `getxftjlist` 的每条记录**不是** `{kcmc, xf, …}` 这种常规结构，而是：
//!
//! ```json
//! { "11": "0.0/0.0", "12": "0.0/0.0", "16": "0.0/0.0", "31": "0.0/0.0", … }
//! ```
//!
//! 键是**学分档位编号**，值是 `已修/应修` 字符串。因此本模块**不做字段归一**，
//! 原样透传并把「键值对数组」按数值键升序排好，由前端按档位渲染直方图
//! （见 15-teacher-ui-spec §七）。
//!
//! 由于无法从单账号推断各档位编号的业务含义，本模块**不臆造档位标签**。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 把宽表记录转成「按数值键升序」的 `[{ key, value }]` 数组。
///
/// 非数字键（如注入的身份字段）会被过滤掉；`value` 保持原样（可能是 `"0.0/0.0"`）。
pub(crate) fn flatten_wide_row(record: &Value) -> Vec<Value> {
    let Some(map) = record.as_object() else {
        return Vec::new();
    };
    let mut pairs: Vec<(i64, Value)> = map
        .iter()
        .filter_map(|(key, value)| key.parse::<i64>().ok().map(|number| (number, value.clone())))
        .collect();
    pairs.sort_by_key(|(number, _)| *number);
    pairs
        .into_iter()
        .map(|(number, value)| json!({ "key": number.to_string(), "value": value }))
        .collect()
}

/// 解析学分列表响应 → `[{ id, cells: [{key,value}] }]`。
pub(crate) fn parse_credit_rows(payload: &Value) -> Vec<Value> {
    grid::parse_grid_list(payload)
        .iter()
        .map(|record| {
            let id = grid::text_field(record, "id")
                .or_else(|| grid::text_field(record, "kcdm"))
                .unwrap_or_default();
            json!({ "id": id, "cells": flatten_wide_row(record) })
        })
        .collect()
}

/// 解析不及格课程明细（常规 jqGrid，剔除身份字段）。
pub(crate) fn parse_failed_courses(payload: &Value) -> Vec<Value> {
    super::workflow::parse_workflow_list(payload)
}

/// 拉取学分统计 + 不及格明细，返回 `{ rows, failedCourses }`。
pub(crate) async fn fetch_credits_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_CREDITS_LIST
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_CREDITS_FAILED_COURSES
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let referer = format!("{}/admin/xjgl/xftj", client.jwxt_base_url());

    // 不及格明细必须带 `id`（页面自身以 `?id=` 空值调用，按当前登录身份过滤）。
    let (rows_result, failed_result) = tokio::join!(
        grid::fetch_grid(
            client,
            readonly::PATH_CREDITS_LIST,
            semester.as_deref(),
            &referer
        ),
        grid::fetch_grid_with_params(
            client,
            readonly::PATH_CREDITS_FAILED_COURSES,
            semester.as_deref(),
            &referer,
            &[("id", "")]
        ),
    );

    let rows = parse_credit_rows(&rows_result?);
    let failed_courses = parse_failed_courses(&failed_result?);

    crate::hbut_debug!(
        "[TeacherCredits] 学分行 {} 条 / 不及格课程 {} 条",
        rows.len(),
        failed_courses.len()
    );

    Ok(json!({
        "rows": rows,
        "failedCourses": failed_courses,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flatten_wide_row_sorts_numeric_keys() {
        let record = json!({
            "31": "0.0/0.0",
            "11": "12.0/16.0",
            "currentUserId": "u",
            "id": "r1"
        });
        let cells = flatten_wide_row(&record);
        assert_eq!(cells.len(), 2, "非数字键应被过滤");
        assert_eq!(cells[0].get("key").and_then(Value::as_str), Some("11"));
        assert_eq!(cells[1].get("key").and_then(Value::as_str), Some("31"));
        assert_eq!(cells[0].get("value").and_then(Value::as_str), Some("12.0/16.0"));
    }

    #[test]
    fn flatten_handles_non_object() {
        assert!(flatten_wide_row(&json!("x")).is_empty());
    }

    #[test]
    fn parse_credit_rows_keeps_id_and_cells() {
        let payload = json!({
            "ret": 0,
            "total": 1,
            "results": [{ "id": "r1", "11": "1.0/2.0" }]
        });
        let rows = parse_credit_rows(&payload);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].get("id").and_then(Value::as_str), Some("r1"));
        assert_eq!(
            rows[0].get("cells").and_then(Value::as_array).map(Vec::len),
            Some(1)
        );
    }

    #[test]
    fn parse_failed_courses_strips_identity() {
        let payload = json!({
            "ret": 0,
            "total": 1,
            "results": [{ "id": "c1", "kcmc": "建筑物理", "currentUserName": "张三" }]
        });
        let out = parse_failed_courses(&payload);
        assert_eq!(out.len(), 1);
        assert!(out[0].get("currentUserName").is_none());
    }
}
