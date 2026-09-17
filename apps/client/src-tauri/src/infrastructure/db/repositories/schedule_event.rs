//! 个人日程表仓储（personal_events，#835）。
//!
//! 与 `custom_schedule_courses` 完全独立：日程是「某个本地日历日期的某个时间段」，
//! 按 `date` 存储、不按学期/周次重复，也不参与课表云同步。
//!
//! 调用约定：所有写入口（HTTP handler / Tauri command）必须先调用
//! [`validate_schedule_event_input`] 校验并规范化，仓储层只负责 SQL 读写。
//! 隐私约束：本模块不打印 `title` / `note` 内容，错误信息只描述字段合法性问题。

use rand::Rng;
use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::super::connection::open_connection;

/// 个人日程记录（字段契约冻结，见 Epic #833 / #835）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleEventRecord {
    pub id: String,
    pub student_id: String,
    pub title: String,
    /// 本地日历日期 `YYYY-MM-DD`
    pub date: String,
    /// `HH:mm`
    pub start_time: String,
    /// `HH:mm`；V1 不允许跨日，必须晚于 `start_time`
    pub end_time: String,
    /// 可空文本列，NULL 读取时归一为空串
    pub location: String,
    pub note: String,
    pub color: String,
    /// 提前提醒分钟数；`None` = 不提醒
    pub reminder_minutes: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// 校验并规范化后的日程核心字段（HTTP / Tauri 共用，避免双份漂移）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedScheduleEventInput {
    pub student_id: String,
    pub title: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

/// 严格校验 `YYYY-MM-DD`：定长 10、分隔符位置固定、月 1-12、日不超当月天数（含闰年）。
pub fn is_valid_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let digits_ok = bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    if !digits_ok {
        return false;
    }
    let Ok(year) = value[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month) = value[5..7].parse::<u32>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u32>() else {
        return false;
    };
    if !(1..=12).contains(&month) || day < 1 {
        return false;
    }
    day <= days_in_month(year, month)
}

/// 严格校验 `HH:mm`：定长 5、两位补零、00:00-23:59；返回当天第几分钟。
fn parse_hh_mm(value: &str) -> Option<u32> {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return None;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(index, byte)| index == 2 || byte.is_ascii_digit())
    {
        return None;
    }
    let hour = value[0..2].parse::<u32>().ok()?;
    let minute = value[3..5].parse::<u32>().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some(hour * 60 + minute)
}

/// 后端统一校验 + 规范化个人日程输入（不信任前端）。
///
/// 规则：`student_id` 非空；`title` trim 后非空；`date` 为真实存在的日历日期；
/// `start_time` / `end_time` 为合法 `HH:mm`；`end_time > start_time`（按分钟比较，
/// V1 不支持跨日）；`reminder_minutes` 为 `null` 或 `>= 0`。
pub fn validate_schedule_event_input(
    student_id: &str,
    title: &str,
    date: &str,
    start_time: &str,
    end_time: &str,
    reminder_minutes: Option<i64>,
) -> std::result::Result<ValidatedScheduleEventInput, String> {
    let student_id = student_id.trim();
    if student_id.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    let title = title.trim();
    if title.is_empty() {
        return Err("日程标题不能为空".to_string());
    }
    let date = date.trim();
    if !is_valid_calendar_date(date) {
        return Err("日期不合法，请使用 YYYY-MM-DD 且为真实存在的日期".to_string());
    }
    let start_time = start_time.trim();
    let start_minutes = parse_hh_mm(start_time)
        .ok_or_else(|| "开始时间不合法，请使用 HH:mm（00:00-23:59）".to_string())?;
    let end_time = end_time.trim();
    let end_minutes = parse_hh_mm(end_time)
        .ok_or_else(|| "结束时间不合法，请使用 HH:mm（00:00-23:59）".to_string())?;
    if end_minutes <= start_minutes {
        return Err("结束时间必须晚于开始时间（暂不支持跨天日程）".to_string());
    }
    if let Some(minutes) = reminder_minutes {
        if minutes < 0 {
            return Err("提前提醒分钟数不能为负数".to_string());
        }
    }
    Ok(ValidatedScheduleEventInput {
        student_id: student_id.to_string(),
        title: title.to_string(),
        date: date.to_string(),
        start_time: start_time.to_string(),
        end_time: end_time.to_string(),
    })
}

/// 校验日期区间查询参数：两端均为真实日历日期且 `start_date <= end_date`。
/// 返回规范化后的 `(start_date, end_date)`。
pub fn validate_schedule_event_date_range(
    start_date: &str,
    end_date: &str,
) -> std::result::Result<(String, String), String> {
    let start = start_date.trim();
    let end = end_date.trim();
    if !is_valid_calendar_date(start) {
        return Err("start_date 不合法，请使用 YYYY-MM-DD".to_string());
    }
    if !is_valid_calendar_date(end) {
        return Err("end_date 不合法，请使用 YYYY-MM-DD".to_string());
    }
    if start > end {
        return Err("start_date 不能晚于 end_date".to_string());
    }
    Ok((start.to_string(), end.to_string()))
}

/// 生成日程 ID：`ev{毫秒时间戳}{4 位随机数}`（应用层生成，与自定义课程同风格）。
pub fn new_schedule_event_id() -> String {
    let mut rng = rand::thread_rng();
    format!(
        "ev{}{:04}",
        chrono::Utc::now().timestamp_millis(),
        rng.gen_range(0..10000)
    )
}

/// canonical 日程 payload：字段白名单，不泄露 `student_id` 等内部标识，
/// 也不把 DB 行原样序列化（避免未来新增内部列被动泄露）。
pub fn schedule_event_payload(event: &ScheduleEventRecord) -> serde_json::Value {
    serde_json::json!({
        "id": event.id,
        "title": event.title,
        "date": event.date,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "location": event.location,
        "note": event.note,
        "color": event.color,
        "reminder_minutes": event.reminder_minutes,
        "created_at": event.created_at,
        "updated_at": event.updated_at
    })
}

/// 空串按「未填写」处理，落库为 NULL（三列契约声明为可空）。
fn optional_text(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn map_schedule_event_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ScheduleEventRecord> {
    Ok(ScheduleEventRecord {
        id: row.get(0)?,
        student_id: row.get(1)?,
        title: row.get(2)?,
        date: row.get(3)?,
        start_time: row.get(4)?,
        end_time: row.get(5)?,
        // 三个可空文本列：NULL 归一为空串，调用方无需处理 null
        location: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
        note: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        color: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        reminder_minutes: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

pub fn add_schedule_event<P: AsRef<Path>>(path: P, event: &ScheduleEventRecord) -> Result<()> {
    let conn = open_connection(path)?;
    conn.execute(
        "INSERT INTO personal_events (
            id, student_id, title, date, start_time, end_time, location, note, color,
            reminder_minutes, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            event.id,
            event.student_id,
            event.title,
            event.date,
            event.start_time,
            event.end_time,
            optional_text(&event.location),
            optional_text(&event.note),
            optional_text(&event.color),
            event.reminder_minutes,
            event.created_at,
            event.updated_at
        ],
    )?;
    Ok(())
}

/// 按 `student_id + date` 区间查询（闭区间，`date` 为 `YYYY-MM-DD` 文本可直接比较）。
pub fn list_schedule_events_range<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<ScheduleEventRecord>> {
    let conn = open_connection(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, student_id, title, date, start_time, end_time, location, note, color,
                reminder_minutes, created_at, updated_at
         FROM personal_events
         WHERE student_id = ?1 AND date >= ?2 AND date <= ?3
         ORDER BY date ASC, start_time ASC, id ASC",
    )?;
    let mut rows = stmt.query(params![student_id, start_date, end_date])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        result.push(map_schedule_event_row(row)?);
    }
    Ok(result)
}

pub fn get_schedule_event<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    event_id: &str,
) -> Result<Option<ScheduleEventRecord>> {
    let conn = open_connection(path)?;
    conn.query_row(
        "SELECT id, student_id, title, date, start_time, end_time, location, note, color,
                reminder_minutes, created_at, updated_at
         FROM personal_events
         WHERE student_id = ?1 AND id = ?2
         LIMIT 1",
        params![student_id, event_id],
        map_schedule_event_row,
    )
    .optional()
}

/// 更新日程内容；`student_id + id` 双条件定位，不允许跨账号改写。
/// 返回受影响行数（0 表示该账号下不存在此日程）。
pub fn update_schedule_event<P: AsRef<Path>>(
    path: P,
    event: &ScheduleEventRecord,
) -> Result<usize> {
    let conn = open_connection(path)?;
    conn.execute(
        "UPDATE personal_events
         SET title = ?3,
             date = ?4,
             start_time = ?5,
             end_time = ?6,
             location = ?7,
             note = ?8,
             color = ?9,
             reminder_minutes = ?10,
             updated_at = CURRENT_TIMESTAMP
         WHERE student_id = ?1 AND id = ?2",
        params![
            event.student_id,
            event.id,
            event.title,
            event.date,
            event.start_time,
            event.end_time,
            optional_text(&event.location),
            optional_text(&event.note),
            optional_text(&event.color),
            event.reminder_minutes
        ],
    )
}

/// 删除日程；`student_id + id` 双条件定位，返回受影响行数。
pub fn delete_schedule_event<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    event_id: &str,
) -> Result<usize> {
    let conn = open_connection(path)?;
    conn.execute(
        "DELETE FROM personal_events WHERE student_id = ?1 AND id = ?2",
        params![student_id, event_id],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::db_impl::migrations::init_db;
    use rusqlite::Connection as RawConnection;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_evt_{label}_{nanos}.db"))
    }

    /// 构造一条合法日程；`id` / `reminder_minutes` 由调用方覆盖。
    fn sample_event(id: &str, student_id: &str, date: &str) -> ScheduleEventRecord {
        ScheduleEventRecord {
            id: id.to_string(),
            student_id: student_id.to_string(),
            title: "项目例会".to_string(),
            date: date.to_string(),
            start_time: "09:00".to_string(),
            end_time: "10:30".to_string(),
            location: "A101".to_string(),
            note: "带上周报".to_string(),
            color: "#72b9ff".to_string(),
            reminder_minutes: None,
            created_at: "2026-01-01T00:00:00+08:00".to_string(),
            updated_at: "2026-01-01T00:00:00+08:00".to_string(),
        }
    }

    fn table_exists(path: &Path, table: &str) -> bool {
        let conn = open_connection(path).expect("open");
        conn.query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
            params![table],
            |_| Ok(true),
        )
        .optional()
        .expect("query sqlite_master")
        .unwrap_or(false)
    }

    /// 1. 空库 migration：init_db 后 personal_events 表与索引存在。
    #[test]
    fn empty_db_migration_creates_personal_events() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("migrate_empty");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        assert!(table_exists(&path, "personal_events"), "表未创建");
        let conn = open_connection(&path).expect("open");
        let index_exists: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_personal_events_student_date'",
                [],
                |_| Ok(true),
            )
            .optional()
            .expect("query index")
            .unwrap_or(false);
        assert!(index_exists, "(student_id, date) 索引未创建");
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    /// 2. 已有库升级：先建 custom_schedule_courses 并写入数据，init_db 后两表都在、
    ///    自定义课程数据不丢。
    #[test]
    fn legacy_db_upgrades_in_place_without_losing_custom_courses() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("legacy_upgrade");
        let _ = std::fs::remove_file(&path);
        {
            let conn = RawConnection::open(&path).expect("open legacy");
            conn.execute_batch(
                "CREATE TABLE custom_schedule_courses (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    semester TEXT NOT NULL,
                    name TEXT NOT NULL,
                    teacher TEXT NOT NULL DEFAULT '',
                    room TEXT NOT NULL DEFAULT '',
                    weekday INTEGER NOT NULL,
                    period INTEGER NOT NULL,
                    djs INTEGER NOT NULL,
                    weeks_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
                );
                INSERT INTO custom_schedule_courses
                    (id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json)
                    VALUES ('lc1', '2510231000', '2025-2026-1', '旧课', '', '', 1, 1, 2, '[1,2]');",
            )
            .expect("seed legacy");
        }

        init_db(&path).expect("init over legacy");

        assert!(table_exists(&path, "personal_events"), "升级后缺少新表");
        let conn = open_connection(&path).expect("open");
        let name: String = conn
            .query_row(
                "SELECT name FROM custom_schedule_courses WHERE id = 'lc1'",
                [],
                |row| row.get(0),
            )
            .expect("旧数据仍可读");
        assert_eq!(name, "旧课");
        let has_v7: bool = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 7",
                [],
                |_| Ok(true),
            )
            .optional()
            .expect("query v7")
            .unwrap_or(false);
        assert!(has_v7, "schema migration v7 未记录");
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    /// 3. init_db 幂等：连跑两次不报错，schema_migrations 行数稳定（1,2,3,5,6,7）。
    #[test]
    fn init_db_is_idempotent_with_schedule_event_version() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("idempotent");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init 1");
        init_db(&path).expect("init 2");
        let conn = open_connection(&path).expect("open");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("count");
        assert_eq!(count, 6);
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    /// 4. create + get 往返：reminder_minutes 为 None 与 Some(30) 两种；
    ///    未填写的可空文本列读回空串。
    #[test]
    fn add_and_get_roundtrip_with_and_without_reminder() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("roundtrip");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let plain = sample_event("ev1", "2510231000", "2026-03-01");
        add_schedule_event(&path, &plain).expect("add plain");
        let loaded = get_schedule_event(&path, "2510231000", "ev1")
            .expect("get")
            .expect("exists");
        assert_eq!(loaded.title, "项目例会");
        assert_eq!(loaded.date, "2026-03-01");
        assert_eq!(loaded.start_time, "09:00");
        assert_eq!(loaded.end_time, "10:30");
        assert_eq!(loaded.location, "A101");
        assert_eq!(loaded.note, "带上周报");
        assert_eq!(loaded.color, "#72b9ff");
        assert_eq!(loaded.reminder_minutes, None);
        assert_eq!(loaded.created_at, "2026-01-01T00:00:00+08:00");

        let mut reminded = sample_event("ev2", "2510231000", "2026-03-02");
        reminded.reminder_minutes = Some(30);
        // 空串 / 空白串 → NULL → 读回空串
        reminded.location = String::new();
        reminded.note = "   ".to_string();
        add_schedule_event(&path, &reminded).expect("add reminded");
        let loaded2 = get_schedule_event(&path, "2510231000", "ev2")
            .expect("get2")
            .expect("exists2");
        assert_eq!(loaded2.reminder_minutes, Some(30));
        assert_eq!(loaded2.location, "");
        assert_eq!(loaded2.note, "");
        let _ = std::fs::remove_file(&path);
    }

    /// 5. 区间查询边界：区间内包含、区间外排除、首尾边界包含。
    #[test]
    fn list_range_includes_bounds_and_excludes_outside() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("range");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        for (id, date) in [
            ("ev_before", "2026-02-28"),
            ("ev_start", "2026-03-01"),
            ("ev_mid", "2026-03-05"),
            ("ev_end", "2026-03-10"),
            ("ev_after", "2026-03-11"),
        ] {
            add_schedule_event(&path, &sample_event(id, "2510231000", date)).expect("add");
        }
        // 其他账号的日程不得混入
        add_schedule_event(&path, &sample_event("ev_other", "2510239999", "2026-03-05"))
            .expect("add other");

        let list = list_schedule_events_range(&path, "2510231000", "2026-03-01", "2026-03-10")
            .expect("list");
        let ids = list.iter().map(|item| item.id.as_str()).collect::<Vec<_>>();
        assert_eq!(ids, vec!["ev_start", "ev_mid", "ev_end"]);

        // 单日区间（start == end）命中当天
        let single = list_schedule_events_range(&path, "2510231000", "2026-03-05", "2026-03-05")
            .expect("single");
        assert_eq!(single.len(), 1);
        assert_eq!(single[0].id, "ev_mid");

        // 空区间返回空
        let empty = list_schedule_events_range(&path, "2510231000", "2026-04-01", "2026-04-30")
            .expect("empty");
        assert!(empty.is_empty());

        // 排序：同一天按 start_time 升序
        add_schedule_event(
            &path,
            &ScheduleEventRecord {
                start_time: "08:00".to_string(),
                end_time: "08:30".to_string(),
                ..sample_event("ev_mid_early", "2510231000", "2026-03-05")
            },
        )
        .expect("add early");
        let same_day = list_schedule_events_range(&path, "2510231000", "2026-03-05", "2026-03-05")
            .expect("same day");
        let same_day_ids = same_day
            .iter()
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(same_day_ids, vec!["ev_mid_early", "ev_mid"]);
        let _ = std::fs::remove_file(&path);
    }

    /// 6. update 生效且受影响行数为 1；跨账号 update 不生效（行数 0）。
    #[test]
    fn update_applies_and_reports_affected_rows() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("update");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        add_schedule_event(&path, &sample_event("ev1", "2510231000", "2026-03-01")).expect("add");

        let mut edited = sample_event("ev1", "2510231000", "2026-03-03");
        edited.title = "改期例会".to_string();
        edited.start_time = "14:00".to_string();
        edited.end_time = "15:00".to_string();
        edited.reminder_minutes = Some(15);
        let affected = update_schedule_event(&path, &edited).expect("update");
        assert_eq!(affected, 1);

        let loaded = get_schedule_event(&path, "2510231000", "ev1")
            .expect("get")
            .expect("exists");
        assert_eq!(loaded.title, "改期例会");
        assert_eq!(loaded.date, "2026-03-03");
        assert_eq!(loaded.start_time, "14:00");
        assert_eq!(loaded.reminder_minutes, Some(15));

        // 别的账号用同一 id 更新：定位不到 → 0 行，且不影响原记录
        let stolen = sample_event("ev1", "2510239999", "2026-05-05");
        assert_eq!(
            update_schedule_event(&path, &stolen).expect("update other"),
            0
        );
        let untouched = get_schedule_event(&path, "2510231000", "ev1")
            .expect("get again")
            .expect("still exists");
        assert_eq!(untouched.date, "2026-03-03");
        let _ = std::fs::remove_file(&path);
    }

    /// 7. delete 生效、受影响行数为 1，再 get 返回 None。
    #[test]
    fn delete_removes_row_and_get_returns_none() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("delete");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        add_schedule_event(&path, &sample_event("ev1", "2510231000", "2026-03-01")).expect("add");

        assert_eq!(
            delete_schedule_event(&path, "2510231000", "ev1").expect("delete"),
            1
        );
        assert!(get_schedule_event(&path, "2510231000", "ev1")
            .expect("get")
            .is_none());
        // 重复删除返回 0
        assert_eq!(
            delete_schedule_event(&path, "2510231000", "ev1").expect("delete again"),
            0
        );
        let _ = std::fs::remove_file(&path);
    }

    /// 8. 多账号隔离：A 查不到 B 的日程，A 也删不掉 B 的。
    #[test]
    fn students_are_isolated_on_list_get_and_delete() {
        std::env::remove_var("HBUT_DB_PATH");
        let path = temp_db_path("isolation");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        add_schedule_event(&path, &sample_event("ev_a", "student_A", "2026-03-01")).expect("add A");
        add_schedule_event(&path, &sample_event("ev_b", "student_B", "2026-03-01")).expect("add B");

        let list_a = list_schedule_events_range(&path, "student_A", "2026-03-01", "2026-03-31")
            .expect("list A");
        assert_eq!(list_a.len(), 1);
        assert_eq!(list_a[0].id, "ev_a");

        assert!(get_schedule_event(&path, "student_A", "ev_b")
            .expect("cross get")
            .is_none());
        assert_eq!(
            delete_schedule_event(&path, "student_A", "ev_b").expect("cross delete"),
            0
        );
        // B 的记录仍在
        assert!(get_schedule_event(&path, "student_B", "ev_b")
            .expect("get B")
            .is_some());
        let _ = std::fs::remove_file(&path);
    }

    /// 9. 校验拒绝：标题空、日期非法、HH:mm 非法、end <= start、负提醒分钟、student_id 空。
    #[test]
    fn validation_rejects_invalid_inputs() {
        // 合法基线：应当通过
        assert!(validate_schedule_event_input(
            "2510231000",
            "  例会  ",
            "2026-03-01",
            "09:00",
            "10:00",
            Some(0)
        )
        .is_ok());

        // 标题 trim 后为空
        assert!(validate_schedule_event_input(
            "2510231000",
            "   ",
            "2026-03-01",
            "09:00",
            "10:00",
            None
        )
        .is_err());
        // student_id 为空
        assert!(
            validate_schedule_event_input("  ", "例会", "2026-03-01", "09:00", "10:00", None)
                .is_err()
        );
        // 日期非法：月份越界 / 该月无此日 / 非数字 / 格式不符
        for bad_date in [
            "2026-13-01",
            "2026-02-30",
            "abc",
            "2026-3-1",
            "2026-00-10",
            "2026-04-31",
        ] {
            assert!(
                validate_schedule_event_input(
                    "2510231000",
                    "例会",
                    bad_date,
                    "09:00",
                    "10:00",
                    None
                )
                .is_err(),
                "应拒绝日期 {bad_date}"
            );
        }
        // 时间非法：小时越界 / 分钟越界 / 未补零
        for (start, end) in [
            ("24:00", "25:00"),
            ("12:60", "13:00"),
            ("8:2", "9:00"),
            ("0900", "10:00"),
        ] {
            assert!(
                validate_schedule_event_input("2510231000", "例会", "2026-03-01", start, end, None)
                    .is_err(),
                "应拒绝时间 {start}-{end}"
            );
        }
        // end <= start
        assert!(validate_schedule_event_input(
            "2510231000",
            "例会",
            "2026-03-01",
            "10:00",
            "10:00",
            None
        )
        .is_err());
        assert!(validate_schedule_event_input(
            "2510231000",
            "例会",
            "2026-03-01",
            "10:00",
            "09:59",
            None
        )
        .is_err());
        // 负的提醒分钟
        assert!(validate_schedule_event_input(
            "2510231000",
            "例会",
            "2026-03-01",
            "09:00",
            "10:00",
            Some(-1)
        )
        .is_err());

        // 规范化：标题与时间被 trim
        let normalized = validate_schedule_event_input(
            " 2510231000 ",
            "  例会  ",
            " 2026-03-01 ",
            " 09:00 ",
            " 10:00 ",
            None,
        )
        .expect("normalized");
        assert_eq!(normalized.title, "例会");
        assert_eq!(normalized.student_id, "2510231000");
        assert_eq!(normalized.start_time, "09:00");
    }

    /// 10. 闰年：2028-02-29 合法，2026-02-29 非法；日期区间参数同样校验。
    #[test]
    fn leap_year_dates_are_validated() {
        assert!(is_valid_calendar_date("2028-02-29"));
        assert!(!is_valid_calendar_date("2026-02-29"));
        assert!(is_valid_calendar_date("2000-02-29")); // 400 年闰
        assert!(!is_valid_calendar_date("1900-02-29")); // 100 年非闰
        assert!(is_valid_calendar_date("2026-12-31"));
        assert!(!is_valid_calendar_date("2026-12-32"));

        assert!(validate_schedule_event_date_range("2026-03-01", "2026-03-31").is_ok());
        assert!(validate_schedule_event_date_range("2028-02-29", "2028-02-29").is_ok());
        assert!(validate_schedule_event_date_range("2026-02-29", "2026-03-01").is_err());
        assert!(validate_schedule_event_date_range("2026-03-31", "2026-03-01").is_err());
        assert!(validate_schedule_event_date_range("2026-03-01", "abc").is_err());
    }

    /// 11. canonical payload 字段白名单：不包含 student_id，且 id 前缀符合 ev 约定。
    #[test]
    fn payload_is_whitelisted_and_id_has_expected_shape() {
        let event = sample_event("ev123", "2510231000", "2026-03-01");
        let payload = schedule_event_payload(&event);
        assert_eq!(payload["id"], "ev123");
        assert_eq!(payload["title"], "项目例会");
        assert_eq!(payload["reminder_minutes"], serde_json::Value::Null);
        assert!(
            payload.get("student_id").is_none(),
            "payload 不应泄露 student_id"
        );

        let id = new_schedule_event_id();
        assert!(id.starts_with("ev"), "id={id}");
        assert_eq!(id.len(), 2 + 13 + 4, "id={id}");
        assert!(id[2..].chars().all(|c| c.is_ascii_digit()), "id={id}");
    }
}
