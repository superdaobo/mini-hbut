//! 成绩录入进度（教师只读）—— goal-21 / T04b。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! | 用途 | 接口 | 实测 |
//! | --- | --- | --- |
//! | 录入进度 | `/admin/jsd/jsdcjlr/queryCjlrsz/1` | 200，total **8** |
//! | 教学班发布状态 | `/admin/jsd/jsdcjcx/jsdQueryJxbList` | 200，total **4**（含 `cjfbzt`） |
//!
//! ## 只读边界
//!
//! `jsdcjlr/createXscjData`、`jsdcjxgsq/submit`、`jsdcjxgsq/deleteCjxgsq` 属写型，
//! **不在 allowlist 内**。本模块只读，不提供任何提交入口。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 录入进度默认学期序号（实测 `/1` 可用）。
pub(crate) const DEFAULT_PROGRESS_INDEX: &str = "1";

/// 归一化一条「录入进度」记录。
///
/// 字段映射：`jxbbh`→`classNo`、`jxbid`→`classId`、`kcid`→`courseId`、
/// `bkbj`→`className`、`cjtjqrzt`→`confirmStatus`、`cjfxlrqssj`→`entryStartAt`、
/// `cjfxlrjzsj`→`entryEndAt`、`sdsycj`/`sdbyscj`→`shouldEnter`/`mustEnter`。
pub(crate) fn normalize_progress(record: &Value) -> Value {
    json!({
        "classId": grid::text_field(record, "jxbid"),
        "courseId": grid::text_field(record, "kcid"),
        "classNo": grid::text_field(record, "jxbbh"),
        "className": grid::text_field(record, "bkbj"),
        "confirmStatus": grid::text_field(record, "cjtjqrzt"),
        "entryStartAt": grid::text_field(record, "cjfxlrqssj"),
        "entryEndAt": grid::text_field(record, "cjfxlrjzsj"),
        "shouldEnter": grid::text_field(record, "sdsycj"),
        "mustEnter": grid::text_field(record, "sdbyscj"),
        "processId": grid::text_field(record, "cjtjprocessid"),
    })
}

/// 归一化一条「教学班」记录（含成绩发布状态）。
///
/// 字段映射：`kcmc`→`courseName`、`jxbid`→`classId`、`bjrs`→`studentCount`、
/// `xf`→`credits`、`cjfbzt`→`publishStatus`、`jxbzc`→`classWeek`。
pub(crate) fn normalize_teaching_class(record: &Value) -> Value {
    json!({
        "courseName": grid::text_field(record, "kcmc"),
        "classId": grid::text_field(record, "jxbid"),
        "classWeek": grid::text_field(record, "jxbzc"),
        "studentCount": grid::number_field(record, "bjrs"),
        "credits": grid::number_field(record, "xf"),
        "publishStatus": grid::text_field(record, "cjfbzt"),
        "classType": grid::text_field(record, "ksxs"),
    })
}

/// 解析录入进度响应。
pub(crate) fn parse_progress(payload: &Value) -> Vec<Value> {
    grid::parse_grid_list(payload)
        .iter()
        .map(normalize_progress)
        .collect()
}

/// 解析教学班响应。
pub(crate) fn parse_teaching_classes(payload: &Value) -> Vec<Value> {
    grid::parse_grid_list(payload)
        .iter()
        .map(normalize_teaching_class)
        .collect()
}

/// 拉取成绩录入进度与教学班状态，返回 `{ progress, teachingClasses }`。
pub(crate) async fn fetch_grade_entry_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_GRADE_ENTRY_PROGRESS
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHING_CLASSES
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let referer = format!("{}/admin/jsd/jsdcjlr/list1", client.jwxt_base_url());
    let progress_path = readonly::PATH_GRADE_ENTRY_PROGRESS.replace(
        "{index}",
        DEFAULT_PROGRESS_INDEX,
    );
    // 实例化后的路径必须仍在 allowlist 内（前缀匹配兜底）。
    assert!(readonly::is_teacher_readonly_path(&progress_path));

    let (progress_result, classes_result) = tokio::join!(
        grid::fetch_grid(client, &progress_path, semester.as_deref(), &referer),
        grid::fetch_grid(
            client,
            readonly::PATH_TEACHING_CLASSES,
            semester.as_deref(),
            &referer
        ),
    );

    let progress = parse_progress(&progress_result?);
    let teaching_classes = parse_teaching_classes(&classes_result?);

    crate::hbut_debug!(
        "[TeacherGradeEntry] 录入进度 {} 条 / 教学班 {} 条",
        progress.len(),
        teaching_classes.len()
    );

    Ok(json!({
        "progress": progress,
        "teachingClasses": teaching_classes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_progress_maps_fields() {
        let record = json!({
            "jxbid": "j1",
            "kcid": "c1",
            "jxbbh": "01",
            "bkbj": "25建筑学2班",
            "cjtjqrzt": "0",
            "cjfxlrqssj": "2026-11-01 08:00",
            "cjfxlrjzsj": "2026-11-20 23:59",
            "sdsycj": "61",
            "sdbyscj": "61",
            "currentUserName": "张三"
        });
        let out = normalize_progress(&record);
        assert_eq!(out.get("classNo").and_then(Value::as_str), Some("01"));
        assert_eq!(out.get("className").and_then(Value::as_str), Some("25建筑学2班"));
        assert_eq!(out.get("entryEndAt").and_then(Value::as_str), Some("2026-11-20 23:59"));
        assert!(out.get("currentUserName").is_none());
    }

    #[test]
    fn normalize_teaching_class_maps_publish_status() {
        let record = json!({
            "kcmc": "计算机制图与表达-1",
            "jxbid": "j1",
            "bjrs": "61",
            "xf": "3",
            "cjfbzt": "1",
            "jxbzc": "2-13:2"
        });
        let out = normalize_teaching_class(&record);
        assert_eq!(out.get("courseName").and_then(Value::as_str), Some("计算机制图与表达-1"));
        assert_eq!(out.get("studentCount").and_then(Value::as_f64), Some(61.0));
        assert_eq!(out.get("credits").and_then(Value::as_f64), Some(3.0));
        assert_eq!(out.get("publishStatus").and_then(Value::as_str), Some("1"));
    }

    #[test]
    fn parse_progress_handles_empty() {
        assert!(parse_progress(&json!({ "ret": 0, "total": 0, "results": [] })).is_empty());
    }
}
