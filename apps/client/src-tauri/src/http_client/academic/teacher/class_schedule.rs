//! 班级课表（结构化数据）—— goal-22 / T01。
//!
//! ## 为什么要有这个模块
//!
//! goal-21 时误判「班级课表没有 JSON 接口」，只生成了 `ckbjkb` 的页面 URL 并交给外部浏览器打开，
//! 用户明确要求**必须在应用内完成**。
//!
//! 2026-11-21 重新挖 `ckbjkb` 页面源码，发现它内部调用：
//!
//! ```text
//! GET /admin/pkgl/kbcx/bjkb/sdpkkbList?xnxq=&id=<encodeId>&xqdm=&…  → 46 条
//! ```
//!
//! 这与**学生课表用的是同一个接口、同一套字段**（只是路径前缀 `bjkb` vs `xskb`），
//! 因此可以复用学生课表的网格组件，在应用内渲染。
//!
//! ## 上游字段（实测）
//!
//! | 字段 | 含义 | 备注 |
//! | --- | --- | --- |
//! | `kcmc` | 课程名称 | |
//! | `tmc` | 教师姓名 | **HTML 片段**（`<a onclick="openJskb(...)">蔡睿</a>`） |
//! | `croommc` | 教室 | **HTML 片段**（`<a onclick="openCrkb(...)">2-412</a>`） |
//! | `xingqi` | 星期 | 1-7 |
//! | `zcstr` | 周次 | `"1,2,3,4,5,6,7,8,10,11,12,13"` |
//! | `djc` | 起始节次 | 1-11 |
//! | `jxbbh` | 教学班号 | |
//! | `xf` / `zongxs` | 学分 / 总学时 | |
//! | `kcxz` | 课程性质 | |
//! | `kkxq` | 开课校区 | |
//! | `jslxmc` | 教室类型 | 如「多媒体」 |
//! | `jxlmc` | 教学楼 | |
//!
//! ⚠️ `tmc`/`croommc` 里的 `openJskb`/`openCrkb` 是**跳转/写入口**，
//! 本模块只剥文本，**不实现这些回调**。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 剥离 `<a …>文本</a>` 这类 HTML 片段，只留纯文本。
///
/// 上游把教师名和教室名渲染成带 `onclick` 的链接，直接透传会把 HTML 塞进前端。
/// 三种输入都要正确处理：
/// - `<a href="javascript:void(0);" onclick="openJskb('…')">蔡睿</a>` → `蔡睿`
/// - `2-412`（纯文本）→ `2-412`
/// - `""` / 全标签无文本 → `None`
pub(crate) fn strip_html_anchor(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    // 取**第一个** `>` 之后、**第一个** `<` 之前的文本。
    // 注意不能用 rfind：`<a …>蔡睿</a>` 的最后一个 `>` 是闭合标签的，会取到空串。
    let text = if let Some(open_end) = trimmed.find('>') {
        let tail = &trimmed[open_end + 1..];
        match tail.find('<') {
            Some(end) => &tail[..end],
            None => tail,
        }
    } else if let Some(lt) = trimmed.find('<') {
        // 形如 `文本<a …>`（极少见）：取标签前部分
        &trimmed[..lt]
    } else {
        trimmed
    };
    let cleaned = text.trim();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

/// 把 `"1,2,3,4"` 解析成 `[1,2,3,4]`（去空、去非数字、去重、升序）。
pub(crate) fn parse_weeks(raw: &str) -> Vec<i64> {
    let mut weeks: Vec<i64> = raw
        .split(',')
        .filter_map(|part| part.trim().parse::<i64>().ok())
        .filter(|week| *week > 0 && *week <= 30)
        .collect();
    weeks.sort_unstable();
    weeks.dedup();
    weeks
}

/// 归一化一条班级课表记录。
///
/// 字段映射见模块文档。`startSection` 取 `djc`（起始节次），
/// 结束节次由前端按连堂合并（上游没有可靠的结束节字段）。
pub(crate) fn normalize_class_schedule(record: &Value) -> Value {
    let raw_teacher = grid::text_field(record, "tmc").unwrap_or_default();
    let raw_room = grid::text_field(record, "croommc").unwrap_or_default();
    // 班级课表的 `kcmc` 是纯文本，但**教室课表**的 `kcmc` 是 HTML
    // （`<a onclick="openKckb('…')">课程名</a>`），统一剥离一次，纯文本不受影响。
    let raw_course = grid::text_field(record, "kcmc").unwrap_or_default();
    let weeks = parse_weeks(&grid::text_field(record, "zcstr").unwrap_or_default());
    json!({
        "courseName": strip_html_anchor(&raw_course),
        "teacherName": strip_html_anchor(&raw_teacher),
        "roomName": strip_html_anchor(&raw_room),
        "weekday": grid::number_field(record, "xingqi"),
        "startSection": grid::number_field(record, "djc"),
        "weeks": weeks,
        "weekCount": weeks.len(),
        "weekText": grid::text_field(record, "zcstr"),
        "classNo": grid::text_field(record, "jxbbh"),
        "credits": grid::number_field(record, "xf"),
        "hours": grid::number_field(record, "zongxs"),
        "courseType": grid::text_field(record, "kcxz"),
        "campus": grid::text_field(record, "kkxq"),
        "roomType": grid::text_field(record, "jslxmc"),
        "buildingName": grid::text_field(record, "jxlmc"),
    })
}

/// 解析 `sdpkkbList` 响应（**裸数组**）→ 归一化课表条目（已合并连堂）。
///
/// ## 为什么要合并
///
/// 实测上游把**每一节**单独返回一行：
/// - 「概率论与数理统计」周一 → `djc=3` 和 `djc=4` 两条
/// - 「建筑构造-1」周一 → `djc=5,6,7,8` 四条，**而且每节还有两个教室**
///   （`5B-707` / `5B-704`，分班上课）
///
/// 直接渲染会出现一堆单节小卡片。所以按 `课程名 + 星期 + 周次 + 教学班号` 分组，
/// 取最小节次为起点、`max-min+1` 为跨度（`djs`），把同节的多个教室合并成
/// `roomNames` 数组（前端显示第一个 + 「等 N 间」）。
pub(crate) fn parse_class_schedule(payload: &Value) -> Vec<Value> {
    let rows = payload.as_array().cloned().unwrap_or_default();
    let normalized: Vec<Value> = rows
        .iter()
        .filter(|row| grid::text_field(row, "kcmc").is_some())
        .map(normalize_class_schedule)
        .collect();
    merge_consecutive(normalized)
}

/// 把同课程、同星期、同周次、同教学班的连续节次合并成一个课程块。
pub(crate) fn merge_consecutive(entries: Vec<Value>) -> Vec<Value> {
    use std::collections::BTreeMap;

    // 分组键：courseName|weekday|weekText|classNo
    let mut groups: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for entry in entries {
        let key = format!(
            "{}|{}|{}|{}",
            entry.get("courseName").and_then(Value::as_str).unwrap_or(""),
            entry.get("weekday").and_then(Value::as_f64).unwrap_or(0.0) as i64,
            entry.get("weekText").and_then(Value::as_str).unwrap_or(""),
            entry.get("classNo").and_then(Value::as_str).unwrap_or(""),
        );
        groups.entry(key).or_default().push(entry);
    }

    let mut out = Vec::new();
    for (_, mut rows) in groups {
        // 按起始节次排序，便于取 min/max
        rows.sort_by(|a, b| {
            let sa = a.get("startSection").and_then(Value::as_f64).unwrap_or(0.0);
            let sb = b.get("startSection").and_then(Value::as_f64).unwrap_or(0.0);
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        });
        let first = rows.first().cloned().unwrap_or(Value::Null);
        let min_section = rows
            .iter()
            .filter_map(|r| r.get("startSection").and_then(Value::as_f64))
            .fold(f64::INFINITY, f64::min);
        let max_section = rows
            .iter()
            .filter_map(|r| r.get("startSection").and_then(Value::as_f64))
            .fold(f64::NEG_INFINITY, f64::max);
        // 同节多教室去重（保持出现顺序）
        let mut rooms: Vec<String> = Vec::new();
        for row in &rows {
            if let Some(room) = row.get("roomName").and_then(Value::as_str) {
                if !room.is_empty() && !rooms.iter().any(|r| r == room) {
                    rooms.push(room.to_string());
                }
            }
        }
        let span = if min_section.is_finite() && max_section.is_finite() {
            (max_section - min_section + 1.0).max(1.0)
        } else {
            1.0
        };

        let mut merged = first;
        if let Some(object) = merged.as_object_mut() {
            object.insert("startSection".to_string(), json!(min_section));
            object.insert("spanSections".to_string(), json!(span));
            object.insert("roomName".to_string(), json!(rooms.first()));
            object.insert("roomNames".to_string(), json!(rooms));
            object.insert("rowCount".to_string(), json!(rows.len()));
        }
        out.push(merged);
    }

    // 稳定输出：按 星期 → 起始节 → 课程名 排序
    out.sort_by(|a, b| {
        let wa = a.get("weekday").and_then(Value::as_f64).unwrap_or(0.0);
        let wb = b.get("weekday").and_then(Value::as_f64).unwrap_or(0.0);
        let sa = a.get("startSection").and_then(Value::as_f64).unwrap_or(0.0);
        let sb = b.get("startSection").and_then(Value::as_f64).unwrap_or(0.0);
        wa.partial_cmp(&wb)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal))
    });
    out
}

/// 拉取某班级的课表。
///
/// 参数 `encode_id` 来自 `qryBjxx` 的 `encodeId`（**不是** `bjbh`），
/// `campus_id` 来自 `xqdm`。
pub(crate) async fn fetch_class_schedule_with(
    client: &HbutClient,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_CLASS_SCHEDULE_LIST
    ));
    fetch_schedule_common(
        client,
        readonly::PATH_CLASS_SCHEDULE_LIST,
        "kcxz",
        "班级",
        encode_id,
        semester,
        campus_id,
    )
    .await
}

/// 拉取某**教室**的课表（goal-22 / T02 实测接口）。
///
/// 与班级课表是同一套解析逻辑，只有两点不同：
/// 1. 路径是 `pkglcroomkb/sdpkkbList`
/// 2. 末位参数是 `schoolCode`（班级版是 `kcxz`）
///
/// `encode_id` 来自教室列表（`schedule_extra` 的 `rooms[].encodeId`）。
/// 大部分教室返回 `[]` 属正常 —— 该教室本学期没排课。
pub(crate) async fn fetch_room_schedule_with(
    client: &HbutClient,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ROOM_SCHEDULE_LIST
    ));
    fetch_schedule_common(
        client,
        readonly::PATH_ROOM_SCHEDULE_LIST,
        "schoolCode",
        "教室",
        encode_id,
        semester,
        campus_id,
    )
    .await
}

/// 班级/教室课表的公共实现（路径与末位参数名不同，其余一致）。
async fn fetch_schedule_common(
    client: &HbutClient,
    path: &str,
    tail_param: &str,
    label: &str,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(path));

    let encode_id = encode_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("缺少{label}参数 encodeId（来自列表的 encodeId 字段）"))?;

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "2026-2027-1".to_string());
    let campus_id = campus_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "1".to_string());

    let url = format!("{}{}", client.jwxt_base_url(), path);
    let referer = format!("{}/admin/", client.jwxt_base_url());

    let response = client
        .http_client()
        .get(&url)
        .query(&[
            ("xnxq", semester.as_str()),
            ("id", encode_id.as_str()),
            ("xqdm", campus_id.as_str()),
            ("zxzc", ""),
            ("zdzc", ""),
            ("zc", ""),
            ("zxxq", ""),
            ("zdxq", ""),
            ("zxjc", ""),
            ("zdjc", ""),
            ("xsqbkb", ""),
            ("xslx", ""),
            (tail_param, ""),
        ])
        .header("Accept", "application/json, text/plain, */*")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", referer)
        .send()
        .await
        .map_err(|e| format!("{label}课表请求失败: {e}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取{label}课表响应失败: {e}"))?;
    if !(200..300).contains(&status) {
        return Err(format!("{label}课表接口状态异常: HTTP {status}"));
    }
    let trimmed = body.trim_start_matches('\u{feff}');
    if trimmed.trim_start().starts_with('<') {
        return Err(format!("{label}课表返回 HTML（会话可能已过期）"));
    }
    let payload: Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("{label}课表响应解析失败: {e}"))?;

    let entries = parse_class_schedule(&payload);
    crate::hbut_debug!(
        "[TeacherSchedule] {} {} → {} 条（学期 {}）",
        label,
        &encode_id[..encode_id.len().min(12)],
        entries.len(),
        semester
    );

    Ok(json!({
        "entries": entries,
        "count": entries.len(),
        "semester": semester,
        "encodeId": encode_id,
        "campusId": campus_id,
        "kind": if tail_param == "kcxz" { "class" } else { "room" },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_html_anchor_handles_three_forms() {
        assert_eq!(
            strip_html_anchor(r#"<a href="javascript:void(0);" onclick="openJskb('x')">蔡睿</a>"#),
            Some("蔡睿".to_string())
        );
        assert_eq!(strip_html_anchor("2-412"), Some("2-412".to_string()));
        assert_eq!(strip_html_anchor(""), None);
        assert_eq!(strip_html_anchor("   "), None);
        assert_eq!(strip_html_anchor("<a></a>"), None);
    }

    #[test]
    fn parse_weeks_sorts_and_dedupes() {
        assert_eq!(parse_weeks("1,2,3"), vec![1, 2, 3]);
        assert_eq!(parse_weeks("3,1,2,2"), vec![1, 2, 3]);
        assert_eq!(parse_weeks(""), Vec::<i64>::new());
        // 超范围与非法值被丢弃
        assert_eq!(parse_weeks("0,1,99,abc"), vec![1]);
    }

    #[test]
    fn normalize_maps_contract_fields() {
        let record = json!({
            "kcmc": "建筑设计基础",
            "tmc": "<a onclick=\"openJskb('x')\">蔡睿</a>",
            "croommc": "<a onclick=\"openCrkb('y')\">2-412</a>",
            "xingqi": 1,
            "zcstr": "1,2,3,4,5,6,7,8,10,11,12,13",
            "djc": 3,
            "jxbbh": "202613537",
            "xf": 2,
            "zongxs": 32,
            "kcxz": "专业必修课",
            "kkxq": "本部",
            "jslxmc": "多媒体",
            "jxlmc": "2号"
        });
        let out = normalize_class_schedule(&record);
        assert_eq!(out.get("courseName").and_then(Value::as_str), Some("建筑设计基础"));
        assert_eq!(out.get("teacherName").and_then(Value::as_str), Some("蔡睿"));
        assert_eq!(out.get("roomName").and_then(Value::as_str), Some("2-412"));
        assert_eq!(out.get("weekday").and_then(Value::as_f64), Some(1.0));
        assert_eq!(out.get("startSection").and_then(Value::as_f64), Some(3.0));
        assert_eq!(out.get("weekCount").and_then(Value::as_i64), Some(12));
        assert_eq!(out.get("credits").and_then(Value::as_f64), Some(2.0));
        // HTML 必须被剥掉
        let serialized = out.to_string();
        assert!(!serialized.contains("onclick"), "HTML 泄漏: {serialized}");
    }

    #[test]
    fn parse_skips_rows_without_course_name() {
        let payload = json!([
            { "kcmc": "A", "xingqi": 1, "djc": 1 },
            { "xingqi": 2, "djc": 3 },
            { "kcmc": "B", "xingqi": 3, "djc": 5 }
        ]);
        let out = parse_class_schedule(&payload);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn merge_consecutive_collapses_multi_section_course() {
        // 概率论周一 3、4 两节 → 合并成 period=3 span=2
        let payload = json!([
            { "kcmc": "概率论与数理统计", "xingqi": 1, "djc": 3, "zcstr": "1,2", "jxbbh": "A", "croommc": "2-412" },
            { "kcmc": "概率论与数理统计", "xingqi": 1, "djc": 4, "zcstr": "1,2", "jxbbh": "A", "croommc": "2-412" }
        ]);
        let out = parse_class_schedule(&payload);
        assert_eq!(out.len(), 1, "两节应合并成一条");
        assert_eq!(out[0].get("startSection").and_then(Value::as_f64), Some(3.0));
        assert_eq!(out[0].get("spanSections").and_then(Value::as_f64), Some(2.0));
        assert_eq!(out[0].get("rowCount").and_then(Value::as_i64), Some(2));
    }

    #[test]
    fn merge_consecutive_collects_multiple_rooms() {
        // 建筑构造周一 5、6 两节，每节两个教室 → 一条，roomNames 去重
        let payload = json!([
            { "kcmc": "建筑构造-1", "xingqi": 1, "djc": 5, "zcstr": "1", "jxbbh": "B", "croommc": "5B-707" },
            { "kcmc": "建筑构造-1", "xingqi": 1, "djc": 5, "zcstr": "1", "jxbbh": "B", "croommc": "5B-704" },
            { "kcmc": "建筑构造-1", "xingqi": 1, "djc": 6, "zcstr": "1", "jxbbh": "B", "croommc": "5B-707" },
            { "kcmc": "建筑构造-1", "xingqi": 1, "djc": 6, "zcstr": "1", "jxbbh": "B", "croommc": "5B-704" }
        ]);
        let out = parse_class_schedule(&payload);
        assert_eq!(out.len(), 1);
        let rooms = out[0]
            .get("roomNames")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        assert_eq!(rooms.len(), 2, "两个教室应去重成 2 项: {rooms:?}");
        assert_eq!(out[0].get("startSection").and_then(Value::as_f64), Some(5.0));
        assert_eq!(out[0].get("spanSections").and_then(Value::as_f64), Some(2.0));
    }

    #[test]
    fn merge_consecutive_keeps_different_weeks_separate() {
        // 同课程同星期但周次不同 → 不能合并
        let payload = json!([
            { "kcmc": "X", "xingqi": 1, "djc": 1, "zcstr": "1,2", "jxbbh": "C" },
            { "kcmc": "X", "xingqi": 1, "djc": 2, "zcstr": "9,10", "jxbbh": "C" }
        ]);
        let out = parse_class_schedule(&payload);
        assert_eq!(out.len(), 2, "周次不同应保持两条");
    }

    #[test]
    fn parse_handles_empty_and_non_array() {
        assert!(parse_class_schedule(&json!([])).is_empty());
        assert!(parse_class_schedule(&json!({})).is_empty());
        assert!(parse_class_schedule(&json!(null)).is_empty());
    }
}
