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

/// 解析学分列表响应 → `[{ studentId, majorName, className, cells: [{key,value}] }]`。
///
/// ## ⚠️ 隐私边界（2026-11-20 实测确认）
///
/// 该接口返回的是**学生个人明细**而非班级汇总：每行 113 个键，除 21 个学分档位数字键外，
/// 还含 `xm`（姓名）、`xh`（学号）、`sfzjh`（身份证号）、`zzmmdm`（政治面貌）等个人信息。
///
/// 本函数**只取三类字段**：
/// 1. `xh` —— 学号，作为行标识（教师有权看到自己学生的学号）；
/// 2. `zymc` / `bjmc` —— 专业/班级，用于分组展示；
/// 3. 数字键 —— 21 个学分档位（`{key,value}`，值为 `"已修/应修"`）。
///
/// **绝不透传**：`xm`（姓名）、`sfzjh`（身份证号）、`zzmmdm`（政治面貌）、
/// `xbdm`（性别）以及 92 个 `{档位}yxxf|yhxf|_wxg` 派生键（前端用不到，少传一份就少一份泄漏面）。
pub(crate) fn parse_credit_rows(payload: &Value) -> Vec<Value> {
    grid::parse_grid_list(payload)
        .iter()
        .map(|record| {
            // 学号优先；退化到 id（部分学期该接口可能不返回 xh）。
            let student_id = grid::text_field(record, "xh")
                .or_else(|| grid::text_field(record, "id"))
                .unwrap_or_default();
            json!({
                "studentId": student_id,
                "majorName": grid::text_field(record, "zymc"),
                "className": grid::text_field(record, "bjmc"),
                "cells": flatten_wide_row(record),
            })
        })
        .collect()
}

/// 解析不及格课程明细。
///
/// 该接口（`showBjgKcDetail`）实测 total=0，**无真实样本**，因此字段按 recon 的
/// `queryFields` 候选链取，并采用**白名单**而非黑名单：只放行课程类字段，
/// 其余（尤其是可能出现的 `xm`/`xh`/`sfzjh`）一律不传。
///
/// 白名单之外一律丢弃 —— 在拿不到真实样本时，白名单是唯一安全的策略。
pub(crate) fn parse_failed_courses(payload: &Value) -> Vec<Value> {
    const ALLOWED: &[&str] = &[
        "kcmc",   // 课程名称
        "kcdm",   // 课程代码
        "kcbh",   // 课程编号
        "xf",     // 学分
        "cj",     // 成绩
        "bkcj",   // 补考成绩
        "ksxs",   // 考试形式
        "kclb",   // 课程类别
        "jxbmc",  // 教学班
        "kkyxmc", // 开课院系
        "xnxq",   // 学期
    ];
    grid::parse_grid_list(payload)
        .iter()
        .map(|record| {
            let mut out = serde_json::Map::new();
            for field in ALLOWED {
                if let Some(value) = record.get(*field) {
                    if !value.is_null() {
                        out.insert((*field).to_string(), value.clone());
                    }
                }
            }
            Value::Object(out)
        })
        .collect()
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
    fn parse_credit_rows_keeps_student_id_and_drops_pii() {
        let payload = json!({
            "ret": 0,
            "total": 1,
            "results": [{
                "id": "r1",
                "xh": "2025001",
                "zymc": "建筑学",
                "bjmc": "25建筑学2班",
                "11": "1.0/2.0",
                "xm": "张*",
                "sfzjh": "4201***",
                "zzmmdm": "01"
            }]
        });
        let rows = parse_credit_rows(&payload);
        assert_eq!(rows.len(), 1);
        // 学号优先于 id
        assert_eq!(
            rows[0].get("studentId").and_then(Value::as_str),
            Some("2025001")
        );
        assert_eq!(
            rows[0].get("majorName").and_then(Value::as_str),
            Some("建筑学")
        );
        assert_eq!(
            rows[0].get("cells").and_then(Value::as_array).map(Vec::len),
            Some(1)
        );
        // PII 绝不能出现在输出里
        let serialized = rows[0].to_string();
        assert!(!serialized.contains("张*"), "姓名泄漏: {serialized}");
        assert!(!serialized.contains("4201"), "身份证泄漏: {serialized}");
        assert!(!serialized.contains("zzmmdm"), "政治面貌泄漏: {serialized}");
    }

    #[test]
    fn parse_failed_courses_whitelists_fields() {
        let payload = json!({
            "ret": 0,
            "total": 1,
            "results": [{ "id": "c1", "kcmc": "建筑物理", "xf": "2", "currentUserName": "张三", "xm": "李*", "sfzjh": "4201***" }]
        });
        let out = parse_failed_courses(&payload);
        assert_eq!(out.len(), 1);
        assert!(out[0].get("currentUserName").is_none());
        // 白名单只放行课程类字段
        assert_eq!(out[0].get("kcmc").and_then(Value::as_str), Some("建筑物理"));
        assert_eq!(out[0].get("xf").and_then(Value::as_str), Some("2"));
        // 白名单之外的字段（含 PII）一律不出现
        let serialized = out[0].to_string();
        assert!(!serialized.contains("李*"), "姓名泄漏: {serialized}");
        assert!(!serialized.contains("4201"), "身份证泄漏: {serialized}");
        assert!(!serialized.contains("c1"), "内部 id 不应透传: {serialized}");
    }
}
