// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 签到日志持久化读写 + 位置历史 kv_store 封装。

use rusqlite::{params, Connection, Result};
use super::types::{CheckinLogEntry, LocationHistoryItem};

/// 追加一条签到日志，写入后触发惰性 90 天清理。
pub fn append(conn: &Connection, entry: &CheckinLogEntry) -> Result<()> {
    conn.execute(
        "INSERT INTO chaoxing_checkin_log (
            student_id, active_id, activity_type, course_name, result,
            error_code, error_message, submitted_at, payload_hash
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            entry.student_id,
            entry.active_id,
            entry.activity_type,
            entry.course_name,
            entry.result,
            entry.error_code,
            entry.error_message,
            entry.submitted_at,
            entry.payload_hash,
        ],
    )?;

    // 惰性清理：删除该学号 90 天前的记录
    conn.execute(
        "DELETE FROM chaoxing_checkin_log
         WHERE student_id = ?1
           AND submitted_at < (CAST(strftime('%s','now') AS INTEGER) * 1000 - 90 * 86400000)",
        params![entry.student_id],
    )?;

    Ok(())
}

/// 查询签到历史，按 submitted_at 降序，限制条数。
pub fn query_history(conn: &Connection, student_id: &str, limit: u32) -> Result<Vec<CheckinLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT student_id, active_id, activity_type, course_name, result,
                error_code, error_message, submitted_at, payload_hash
         FROM chaoxing_checkin_log
         WHERE student_id = ?1
         ORDER BY submitted_at DESC
         LIMIT ?2",
    )?;

    let mut rows = stmt.query(params![student_id, limit])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        result.push(CheckinLogEntry {
            student_id: row.get(0)?,
            active_id: row.get(1)?,
            activity_type: row.get(2)?,
            course_name: row.get(3)?,
            result: row.get(4)?,
            error_code: row.get(5)?,
            error_message: row.get(6)?,
            submitted_at: row.get(7)?,
            payload_hash: row.get(8)?,
        });
    }
    Ok(result)
}

/// 按学号删除所有签到日志，返回删除行数。
pub fn delete_by_student(conn: &Connection, student_id: &str) -> Result<usize> {
    conn.execute(
        "DELETE FROM chaoxing_checkin_log WHERE student_id = ?1",
        params![student_id],
    )
}

// ─── 位置历史 kv_store 封装 ───────────────────────────────────────────────────

/// kv_store key 格式
fn location_history_key(student_id: &str) -> String {
    format!("chaoxing_checkin.location_history.{}", student_id)
}

/// 追加一条位置历史，保留最近 5 条（FIFO）。
pub fn push_location_history(
    conn: &Connection,
    student_id: &str,
    item: LocationHistoryItem,
) -> Result<()> {
    let key = location_history_key(student_id);

    // 读取现有数据
    let mut items = get_location_history_inner(conn, &key)?;

    // 追加新条目
    items.push(item);

    // FIFO：只保留最近 5 条
    if items.len() > 5 {
        let start = items.len() - 5;
        items = items[start..].to_vec();
    }

    // 序列化写回
    let json = serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?1, ?2)",
        params![key, json],
    )?;

    Ok(())
}

/// 获取位置历史列表。
pub fn get_location_history(conn: &Connection, student_id: &str) -> Result<Vec<LocationHistoryItem>> {
    let key = location_history_key(student_id);
    get_location_history_inner(conn, &key)
}

/// 内部：从 kv_store 读取并反序列化位置历史。
fn get_location_history_inner(conn: &Connection, key: &str) -> Result<Vec<LocationHistoryItem>> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();

    match value {
        Some(json) => {
            let items: Vec<LocationHistoryItem> =
                serde_json::from_str(&json).unwrap_or_default();
            Ok(items)
        }
        None => Ok(Vec::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_db;
    use rusqlite::Connection;

    /// 创建内存数据库并初始化 schema
    fn setup_db() -> Connection {
        // 使用临时文件让 init_db 创建 schema，然后打开内存连接
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let path = tmp.path().to_path_buf();
        init_db(&path).unwrap();
        Connection::open(&path).unwrap()
    }

    fn make_entry(student_id: &str, active_id: &str, submitted_at: i64) -> CheckinLogEntry {
        CheckinLogEntry {
            student_id: student_id.to_string(),
            active_id: active_id.to_string(),
            activity_type: "normal".to_string(),
            course_name: "测试课程".to_string(),
            result: "success".to_string(),
            error_code: None,
            error_message: None,
            submitted_at,
            payload_hash: "abc123".to_string(),
        }
    }

    #[test]
    fn test_append_and_query_history() {
        let conn = setup_db();
        let now = chrono::Utc::now().timestamp_millis();
        let entry1 = make_entry("stu001", "act001", now - 1000);
        let entry2 = make_entry("stu001", "act002", now);

        append(&conn, &entry1).unwrap();
        append(&conn, &entry2).unwrap();

        let history = query_history(&conn, "stu001", 10).unwrap();
        assert_eq!(history.len(), 2);
        // 按 submitted_at DESC 排序
        assert_eq!(history[0].active_id, "act002");
        assert_eq!(history[1].active_id, "act001");
    }

    #[test]
    fn test_delete_by_student() {
        let conn = setup_db();
        let now = chrono::Utc::now().timestamp_millis();
        let entry1 = make_entry("stu001", "act001", now);
        let entry2 = make_entry("stu002", "act002", now);

        append(&conn, &entry1).unwrap();
        append(&conn, &entry2).unwrap();

        let deleted = delete_by_student(&conn, "stu001").unwrap();
        assert_eq!(deleted, 1);

        let history = query_history(&conn, "stu001", 10).unwrap();
        assert!(history.is_empty());

        // stu002 不受影响
        let history2 = query_history(&conn, "stu002", 10).unwrap();
        assert_eq!(history2.len(), 1);
    }

    #[test]
    fn test_lazy_cleanup_removes_old_entries() {
        let conn = setup_db();

        // 插入一条 91 天前的记录（手动插入绕过 append 的清理）
        let old_ts = chrono::Utc::now().timestamp_millis() - 91 * 86_400_000;
        let old_entry = make_entry("stu001", "old_act", old_ts);
        conn.execute(
            "INSERT INTO chaoxing_checkin_log (
                student_id, active_id, activity_type, course_name, result,
                error_code, error_message, submitted_at, payload_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                old_entry.student_id,
                old_entry.active_id,
                old_entry.activity_type,
                old_entry.course_name,
                old_entry.result,
                old_entry.error_code,
                old_entry.error_message,
                old_entry.submitted_at,
                old_entry.payload_hash,
            ],
        ).unwrap();

        // 现在 append 一条新记录，触发清理
        let new_ts = chrono::Utc::now().timestamp_millis();
        let new_entry = make_entry("stu001", "new_act", new_ts);
        append(&conn, &new_entry).unwrap();

        // 旧记录应被清理
        let history = query_history(&conn, "stu001", 100).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].active_id, "new_act");
    }

    #[test]
    fn test_push_location_history_caps_at_five() {
        let conn = setup_db();
        let sid = "stu001";

        // 写入 7 条
        for i in 0..7 {
            let item = LocationHistoryItem {
                address: format!("地址{}", i),
                latitude: 30.0 + i as f64,
                longitude: 114.0 + i as f64,
            };
            push_location_history(&conn, sid, item).unwrap();
        }

        let history = get_location_history(&conn, sid).unwrap();
        assert_eq!(history.len(), 5);
        // FIFO：保留最后 5 条（索引 2..7）
        assert_eq!(history[0].address, "地址2");
        assert_eq!(history[4].address, "地址6");
    }

    #[test]
    fn test_get_location_history_empty() {
        let conn = setup_db();
        let history = get_location_history(&conn, "nonexistent").unwrap();
        assert!(history.is_empty());
    }

    #[test]
    fn test_push_location_history_single() {
        let conn = setup_db();
        let sid = "stu001";
        let item = LocationHistoryItem {
            address: "武汉市洪山区".to_string(),
            latitude: 30.5,
            longitude: 114.3,
        };
        push_location_history(&conn, sid, item.clone()).unwrap();

        let history = get_location_history(&conn, sid).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].address, "武汉市洪山区");
        assert!((history[0].latitude - 30.5).abs() < f64::EPSILON);
        assert!((history[0].longitude - 114.3).abs() < f64::EPSILON);
    }
}
