//! 自定义课程表仓储（custom_schedule_courses）。

use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::super::connection::open_connection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomScheduleCourseRecord {
    pub id: String,
    pub student_id: String,
    pub semester: String,
    pub name: String,
    pub teacher: String,
    pub room: String,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    /// 用户设定主色（#RRGGBB）；空字符串表示未设定，前端回退自动配色
    #[serde(default)]
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 规范化用户课程色：空 → ""；合法 hex → #rrggbb；非法 → None。
/// 无 # 时仅接受 6/8 位，避免 "bad" 等被当成 3 位 hex。
pub fn normalize_course_color(value: Option<&str>) -> Option<String> {
    let raw = match value {
        None => return Some(String::new()),
        Some(v) => v.trim(),
    };
    if raw.is_empty() {
        return Some(String::new());
    }
    let has_hash = raw.starts_with('#');
    let body = if has_hash { raw[1..].trim() } else { raw };
    let expanded = if has_hash && body.len() == 3 && body.chars().all(|c| c.is_ascii_hexdigit()) {
        body.chars().flat_map(|c| [c, c]).collect::<String>()
    } else if body.len() == 8 && body.chars().all(|c| c.is_ascii_hexdigit()) {
        body[..6].to_string()
    } else if body.len() == 6 && body.chars().all(|c| c.is_ascii_hexdigit()) {
        body.to_string()
    } else {
        return None;
    };
    Some(format!("#{}", expanded.to_ascii_lowercase()))
}

pub fn add_custom_schedule_course<P: AsRef<Path>>(
    path: P,
    course: &CustomScheduleCourseRecord,
) -> Result<()> {
    let conn = open_connection(path)?;
    let weeks_json = serde_json::to_string(&course.weeks).unwrap_or_else(|_| "[]".to_string());
    let color = normalize_course_color(Some(course.color.as_str())).unwrap_or_default();
    conn.execute(
        "INSERT OR REPLACE INTO custom_schedule_courses (
            id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, color, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, CURRENT_TIMESTAMP)",
        params![
            course.id,
            course.student_id,
            course.semester,
            course.name,
            course.teacher,
            course.room,
            course.weekday,
            course.period,
            course.djs,
            weeks_json,
            color
        ],
    )?;
    Ok(())
}

fn map_custom_schedule_course_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<CustomScheduleCourseRecord> {
    let weeks_json: String = row.get(9)?;
    let weeks = serde_json::from_str::<Vec<i32>>(&weeks_json).unwrap_or_default();
    let color_raw: String = row.get(10).unwrap_or_default();
    let color = normalize_course_color(Some(color_raw.as_str())).unwrap_or_default();
    Ok(CustomScheduleCourseRecord {
        id: row.get(0)?,
        student_id: row.get(1)?,
        semester: row.get(2)?,
        name: row.get(3)?,
        teacher: row.get(4)?,
        room: row.get(5)?,
        weekday: row.get(6)?,
        period: row.get(7)?,
        djs: row.get(8)?,
        weeks,
        color,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub fn list_custom_schedule_courses<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    semester: &str,
) -> Result<Vec<CustomScheduleCourseRecord>> {
    let conn = open_connection(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, color, created_at, updated_at
         FROM custom_schedule_courses
         WHERE student_id = ?1 AND semester = ?2
         ORDER BY weekday ASC, period ASC, name ASC",
    )?;

    let mut rows = stmt.query(params![student_id, semester])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        result.push(map_custom_schedule_course_row(row)?);
    }
    Ok(result)
}

pub fn list_all_custom_schedule_courses<P: AsRef<Path>>(
    path: P,
    student_id: &str,
) -> Result<Vec<CustomScheduleCourseRecord>> {
    let conn = open_connection(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, color, created_at, updated_at
         FROM custom_schedule_courses
         WHERE student_id = ?1
         ORDER BY semester DESC, weekday ASC, period ASC, name ASC",
    )?;

    let mut rows = stmt.query(params![student_id])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        result.push(map_custom_schedule_course_row(row)?);
    }
    Ok(result)
}

pub fn get_custom_schedule_course<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    course_id: &str,
) -> Result<Option<CustomScheduleCourseRecord>> {
    let conn = open_connection(path)?;
    conn.query_row(
        "SELECT id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, color, created_at, updated_at
         FROM custom_schedule_courses
         WHERE student_id = ?1 AND id = ?2
         LIMIT 1",
        params![student_id, course_id],
        map_custom_schedule_course_row,
    )
    .optional()
}

pub fn update_custom_schedule_course_weeks<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    course_id: &str,
    weeks: &[i32],
) -> Result<usize> {
    let conn = open_connection(path)?;
    let weeks_json = serde_json::to_string(weeks).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE custom_schedule_courses
         SET weeks_json = ?3, updated_at = CURRENT_TIMESTAMP
         WHERE student_id = ?1 AND id = ?2",
        params![student_id, course_id, weeks_json],
    )
}

pub fn update_custom_schedule_course<P: AsRef<Path>>(
    path: P,
    course: &CustomScheduleCourseRecord,
) -> Result<usize> {
    let conn = open_connection(path)?;
    let weeks_json = serde_json::to_string(&course.weeks).unwrap_or_else(|_| "[]".to_string());
    let color = normalize_course_color(Some(course.color.as_str())).unwrap_or_default();
    conn.execute(
        "UPDATE custom_schedule_courses
         SET semester = ?3,
             name = ?4,
             teacher = ?5,
             room = ?6,
             weekday = ?7,
             period = ?8,
             djs = ?9,
             weeks_json = ?10,
             color = ?11,
             updated_at = CURRENT_TIMESTAMP
         WHERE student_id = ?1 AND id = ?2",
        params![
            course.student_id,
            course.id,
            course.semester,
            course.name,
            course.teacher,
            course.room,
            course.weekday,
            course.period,
            course.djs,
            weeks_json,
            color
        ],
    )
}

pub fn delete_custom_schedule_course<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    course_id: &str,
) -> Result<usize> {
    let conn = open_connection(path)?;
    conn.execute(
        "DELETE FROM custom_schedule_courses WHERE student_id = ?1 AND id = ?2",
        params![student_id, course_id],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::db_impl::migrations::init_db;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_ccolor_{label}_{nanos}.db"))
    }

    #[test]
    fn normalize_course_color_accepts_and_rejects() {
        assert_eq!(normalize_course_color(None).as_deref(), Some(""));
        assert_eq!(normalize_course_color(Some("")).as_deref(), Some(""));
        assert_eq!(normalize_course_color(Some("  ")).as_deref(), Some(""));
        assert_eq!(
            normalize_course_color(Some("#72B9FF")).as_deref(),
            Some("#72b9ff")
        );
        assert_eq!(
            normalize_course_color(Some("#AbC")).as_deref(),
            Some("#aabbcc")
        );
        assert_eq!(
            normalize_course_color(Some("72B9FF")).as_deref(),
            Some("#72b9ff")
        );
        assert_eq!(normalize_course_color(Some("bad")), None);
        assert_eq!(normalize_course_color(Some("#12")), None);
        assert_eq!(normalize_course_color(Some("not-a-color")), None);
    }

    #[test]
    fn custom_schedule_color_persists_roundtrip_and_legacy_empty() {
        let path = temp_db_path("roundtrip");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let now = "2026-01-01T00:00:00+08:00".to_string();
        let record = CustomScheduleCourseRecord {
            id: "c_color_1".to_string(),
            student_id: "2510231000".to_string(),
            semester: "2025-2026-1".to_string(),
            name: "测试课".to_string(),
            teacher: "张三".to_string(),
            room: "A101".to_string(),
            weekday: 1,
            period: 1,
            djs: 2,
            weeks: vec![1, 2, 3],
            color: "#72B9FF".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        add_custom_schedule_course(&path, &record).expect("add");
        let loaded = get_custom_schedule_course(&path, "2510231000", "c_color_1")
            .expect("get")
            .expect("exists");
        assert_eq!(loaded.color, "#72b9ff");

        {
            let conn = open_connection(&path).unwrap();
            let mut stmt = conn
                .prepare("PRAGMA table_info(custom_schedule_courses)")
                .unwrap();
            let names: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect();
            assert!(
                names.iter().any(|n| n == "color"),
                "color column missing: {:?}",
                names
            );
        }

        let plain = CustomScheduleCourseRecord {
            id: "c_color_2".to_string(),
            color: String::new(),
            ..record
        };
        add_custom_schedule_course(&path, &plain).expect("add plain");
        let plain_loaded = get_custom_schedule_course(&path, "2510231000", "c_color_2")
            .expect("get2")
            .expect("exists2");
        assert_eq!(plain_loaded.color, "");

        let _ = std::fs::remove_file(&path);
    }
}
