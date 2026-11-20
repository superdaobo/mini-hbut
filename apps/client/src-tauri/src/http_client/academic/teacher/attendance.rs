//! 学生考勤统计（教师侧只读）—— goal-21 / T04a。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! 学校页面 `/admin/jsd/xskq` 的表格 `#jsdxskqIdGrid` 是**空壳**，数据走 AJAX：
//!
//! ```text
//! GET /admin/jsd/xskq/ajaxListJsJxrw?gridtype=jqgrid&xnxq=2026-2027-1
//! → { ret:0, total:6, results:[…] }   ← jqGrid JSON，不是 HTML
//! ```
//!
//! ⚠️ **路径陷阱**：本接口末段与教学任务 `/admin/jsd/jxrw/ajaxListJsJxrw` 同名，
//! 但路径不同、语义完全不同（前者是「考勤统计的教学班列表」，后者是「我的教学任务」）。
//! 因此本模块只引用 [`readonly`] 里的常量，绝不写字面量。
//!
//! ## 二十周考勤列
//!
//! 每条记录带 `cqzt1` … `cqzt20`（第 1–20 周考勤状态，字符串）。
//! 实测该教师 6 个教学班全部为 `"0"`（= 本学期未录入考勤）。
//! 由于无法从单账号推断 `1`/`2` 的确切语义，本模块**只做原样透传 + 已录入周计数**，
//! 不臆造「出勤/缺勤」判定 —— 语义判定留给前端在拿到真实非零样本后再定。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 教务固定 20 周考勤列（`cqzt1`…`cqzt20`）。
pub(crate) const ATTENDANCE_WEEKS: usize = 20;

/// 解析一条教学班记录的二十周考勤状态（缺失字段记为 `""`）。
///
/// 返回长度恒为 [`ATTENDANCE_WEEKS`]，保证前端可以按固定列渲染热力矩阵。
pub(crate) fn parse_week_status(record: &Value) -> Vec<String> {
    (1..=ATTENDANCE_WEEKS)
        .map(|week| {
            record
                .get(format!("cqzt{week}"))
                .map(|value| match value {
                    Value::String(text) => text.trim().to_string(),
                    Value::Number(number) => number.to_string(),
                    Value::Null => String::new(),
                    _ => String::new(),
                })
                .unwrap_or_default()
        })
        .collect()
}

/// 统计「已录入考勤」的周数（`cqzt` 非空且非 `"0"`）。
pub(crate) fn recorded_week_count(weeks: &[String]) -> usize {
    weeks
        .iter()
        .filter(|status| !status.is_empty() && status.as_str() != "0")
        .count()
}

/// 把一条教学班记录归一为前端契约结构。
///
/// 字段映射（上游 → 前端）：
/// - `kcmc` → `courseName`；`kcdm` → `courseCode`
/// - `jxbmc` → `className`；`jxbid` → `classId`；`jxbbh` → `classNo`
/// - `bjrs` → `studentCount`（字符串数字，已转 f64）
/// - `zongxs` → `totalHours`；`skzc` → `weekRange`；`zhouxs` → `weeklyHours`
/// - `cqzt1..20` → `weeks[]`；`recordedWeeks` → 已录入周数
pub(crate) fn normalize_attendance_row(record: &Value) -> Value {
    let weeks = parse_week_status(record);
    json!({
        "courseCode": grid::text_field(record, "kcdm"),
        "courseName": grid::text_field(record, "kcmc"),
        "classId": grid::text_field(record, "jxbid"),
        "className": grid::text_field(record, "jxbmc"),
        "classNo": grid::text_field(record, "jxbbh"),
        "studentCount": grid::number_field(record, "bjrs"),
        "totalHours": grid::number_field(record, "zongxs"),
        "weeklyHours": grid::number_field(record, "zhouxs"),
        "weekRange": grid::text_field(record, "skzc"),
        "confirmed": grid::text_field(record, "sfqr"),
        "weeks": weeks,
        "recordedWeeks": recorded_week_count(&parse_week_status(record)),
    })
}

/// 解析考勤列表响应 → 归一化记录数组（已按稳定键去重）。
pub(crate) fn parse_attendance_rows(payload: &Value) -> Vec<Value> {
    grid::parse_grid_list(payload)
        .iter()
        .map(normalize_attendance_row)
        .collect()
}

/// 汇总：总教学班数、总学生数、已录入考勤的班数。
///
/// 注意：`studentCount` 在部分教学班为 `0`（如微专业课程），汇总时按 `None` 跳过，
/// 不把 0 计入平均，避免拉低分母。
pub(crate) fn summarize(rows: &[Value]) -> Value {
    let class_count = rows.len();
    let student_total: f64 = rows
        .iter()
        .filter_map(|row| row.get("studentCount").and_then(Value::as_f64))
        .sum();
    let recorded_class_count = rows
        .iter()
        .filter(|row| {
            row.get("recordedWeeks")
                .and_then(Value::as_u64)
                .map(|count| count > 0)
                .unwrap_or(false)
        })
        .count();
    json!({
        "classCount": class_count,
        "studentTotal": student_total,
        "recordedClassCount": recorded_class_count,
        "weeks": ATTENDANCE_WEEKS,
    })
}

/// 拉取学生考勤统计，返回 `{ summary, classes }`。
///
/// fail-closed：路径必须已登记；会话失效归一为「会话已过期」，绝不返回假数据。
pub(crate) async fn fetch_attendance_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ATTENDANCE_LIST
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let referer = format!("{}/admin/jsd/xskq", client.jwxt_base_url());
    let payload = grid::fetch_grid(
        client,
        readonly::PATH_ATTENDANCE_LIST,
        semester.as_deref(),
        &referer,
    )
    .await?;

    let classes = parse_attendance_rows(&payload);
    let summary = summarize(&classes);
    crate::hbut_debug!(
        "[TeacherAttendance] 教学班 {} 条 / 学生合计 {} / 已录入考勤 {} 个班",
        summary
            .get("classCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        summary
            .get("studentTotal")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        summary
            .get("recordedClassCount")
            .and_then(Value::as_u64)
            .unwrap_or(0)
    );

    Ok(json!({ "summary": summary, "classes": classes }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_row() -> Value {
        let mut record = json!({
            "kcdm": "W10006002",
            "kcmc": "计算机制图与表达-1",
            "jxbid": "a65d084e",
            "jxbmc": "计算机制图与表达-1(专业必修课)-01",
            "jxbbh": "01",
            "bjrs": "61",
            "zongxs": "48",
            "zhouxs": "2",
            "skzc": "2-13:2",
            "sfqr": "0"
        });
        for week in 1..=ATTENDANCE_WEEKS {
            record[format!("cqzt{week}")] = json!("0");
        }
        record
    }

    #[test]
    fn parse_week_status_returns_fixed_length() {
        let weeks = parse_week_status(&sample_row());
        assert_eq!(weeks.len(), ATTENDANCE_WEEKS);
        assert!(weeks.iter().all(|w| w == "0"));
    }

    #[test]
    fn parse_week_status_handles_missing_and_numeric() {
        let record = json!({ "cqzt1": 1, "cqzt3": "2" });
        let weeks = parse_week_status(&record);
        assert_eq!(weeks[0], "1");
        assert_eq!(weeks[1], "");
        assert_eq!(weeks[2], "2");
    }

    #[test]
    fn recorded_week_count_ignores_zero_and_empty() {
        assert_eq!(recorded_week_count(&["0".into(), "".into(), "1".into()]), 1);
        assert_eq!(recorded_week_count(&[]), 0);
    }

    #[test]
    fn normalize_maps_all_contract_fields() {
        let row = normalize_attendance_row(&sample_row());
        assert_eq!(
            row.get("courseName").and_then(Value::as_str),
            Some("计算机制图与表达-1")
        );
        assert_eq!(row.get("studentCount").and_then(Value::as_f64), Some(61.0));
        assert_eq!(row.get("totalHours").and_then(Value::as_f64), Some(48.0));
        assert_eq!(row.get("weekRange").and_then(Value::as_str), Some("2-13:2"));
        assert_eq!(row.get("recordedWeeks").and_then(Value::as_u64), Some(0));
        assert_eq!(
            row.get("weeks").and_then(Value::as_array).map(Vec::len),
            Some(ATTENDANCE_WEEKS)
        );
    }

    #[test]
    fn summarize_skips_zero_students() {
        let rows = vec![
            normalize_attendance_row(&sample_row()),
            normalize_attendance_row(&json!({
                "kcmc": "微专业课", "bjrs": "0", "zongxs": "48"
            })),
        ];
        let summary = summarize(&rows);
        assert_eq!(summary.get("classCount").and_then(Value::as_u64), Some(2));
        assert_eq!(
            summary.get("studentTotal").and_then(Value::as_f64),
            Some(61.0)
        );
        assert_eq!(
            summary.get("recordedClassCount").and_then(Value::as_u64),
            Some(0)
        );
    }

    #[test]
    fn summarize_counts_recorded_classes() {
        let mut record = sample_row();
        record["cqzt5"] = json!("1");
        let rows = vec![normalize_attendance_row(&record)];
        let summary = summarize(&rows);
        assert_eq!(
            summary.get("recordedClassCount").and_then(Value::as_u64),
            Some(1)
        );
    }
}
