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
    let weeks = parse_weeks(&grid::text_field(record, "zcstr").unwrap_or_default());
    json!({
        "courseName": grid::text_field(record, "kcmc"),
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

/// 解析 `sdpkkbList` 响应（**裸数组**）→ 归一化课表条目。
pub(crate) fn parse_class_schedule(payload: &Value) -> Vec<Value> {
    payload
        .as_array()
        .map(|rows| {
            rows.iter()
                .filter(|row| {
                    // 无课程名的行（如占位/分隔）直接丢弃
                    grid::text_field(row, "kcmc").is_some()
                })
                .map(normalize_class_schedule)
                .collect()
        })
        .unwrap_or_default()
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

    let encode_id = encode_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "缺少班级参数 encodeId（来自班级列表的 encodeId 字段）".to_string())?;

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "2026-2027-1".to_string());
    let campus_id = campus_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "1".to_string());

    let url = format!(
        "{}{}",
        client.jwxt_base_url(),
        readonly::PATH_CLASS_SCHEDULE_LIST
    );
    let referer = format!("{}/admin/pkgl/kbcx/bjkb?qx=1", client.jwxt_base_url());

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
            ("kcxz", ""),
        ])
        .header("Accept", "application/json, text/plain, */*")
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Referer", referer)
        .send()
        .await
        .map_err(|e| format!("班级课表请求失败: {e}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取班级课表响应失败: {e}"))?;
    if !(200..300).contains(&status) {
        return Err(format!("班级课表接口状态异常: HTTP {status}"));
    }
    let trimmed = body.trim_start_matches('\u{feff}');
    if trimmed.trim_start().starts_with('<') {
        return Err("班级课表返回 HTML（会话可能已过期）".to_string());
    }
    let payload: Value =
        serde_json::from_str(trimmed).map_err(|e| format!("班级课表响应解析失败: {e}"))?;

    let entries = parse_class_schedule(&payload);
    crate::hbut_debug!(
        "[TeacherClassSchedule] encodeId={} 学期={} 课程 {} 条",
        &encode_id[..encode_id.len().min(12)],
        semester,
        entries.len()
    );

    Ok(json!({
        "entries": entries,
        "count": entries.len(),
        "semester": semester,
        "encodeId": encode_id,
        "campusId": campus_id,
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
    fn parse_handles_empty_and_non_array() {
        assert!(parse_class_schedule(&json!([])).is_empty());
        assert!(parse_class_schedule(&json!({})).is_empty());
        assert!(parse_class_schedule(&json!(null)).is_empty());
    }
}
