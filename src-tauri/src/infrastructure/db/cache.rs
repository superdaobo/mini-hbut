//! JSON 缓存读写仓储。
//!
//! 负责按 `student_id`（普通表）或 `cache_key`（public 表）读写缓存，
//! 以及 `grade_teacher_cache` 的并发安全合并与异步包装。

use chrono::Local;
use rusqlite::{params, OptionalExtension, Result, TransactionBehavior};
use serde_json::Value;
use std::path::Path;

use super::connection::open_connection;

// 保存缓存
pub fn save_cache<P: AsRef<Path>>(path: P, table: &str, key: &str, data: &Value) -> Result<()> {
    let conn = open_connection(path)?;
    let payload = serde_json::to_string(data).unwrap_or_default();
    let sync_time = Local::now().to_rfc3339();

    let sql = if table.contains("public") {
        format!(
            "INSERT OR REPLACE INTO {} (cache_key, data, sync_time) VALUES (?1, ?2, ?3)",
            table
        )
    } else {
        format!(
            "INSERT OR REPLACE INTO {} (student_id, data, sync_time) VALUES (?1, ?2, ?3)",
            table
        )
    };

    conn.execute(&sql, params![key, payload, sync_time])?;
    Ok(())
}

// 读取缓存
pub fn get_cache<P: AsRef<Path>>(
    path: P,
    table: &str,
    key: &str,
) -> Result<Option<(Value, String)>> {
    let conn = open_connection(path)?;

    let sql = if table.contains("public") {
        format!("SELECT data, sync_time FROM {} WHERE cache_key = ?1", table)
    } else {
        format!(
            "SELECT data, sync_time FROM {} WHERE student_id = ?1",
            table
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![key])?;

    if let Some(row) = rows.next()? {
        let data_str: String = row.get(0)?;
        let sync_time: String = row.get(1)?;
        let data: Value = serde_json::from_str(&data_str).unwrap_or(Value::Null);
        Ok(Some((data, sync_time)))
    } else {
        Ok(None)
    }
}

pub fn delete_cache<P: AsRef<Path>>(path: P, table: &str, key: &str) -> Result<usize> {
    let conn = open_connection(path)?;
    let sql = if table.contains("public") {
        format!("DELETE FROM {} WHERE cache_key = ?1", table)
    } else {
        format!("DELETE FROM {} WHERE student_id = ?1", table)
    };
    conn.execute(&sql, params![key])
}

pub fn delete_cache_by_prefix<P: AsRef<Path>>(path: P, table: &str, prefix: &str) -> Result<usize> {
    let conn = open_connection(path)?;
    let sql = if table.contains("public") {
        format!("DELETE FROM {} WHERE cache_key LIKE ?1", table)
    } else {
        format!("DELETE FROM {} WHERE student_id LIKE ?1", table)
    };
    conn.execute(&sql, params![format!("{}%", prefix)])
}

/// 在单个 IMMEDIATE 事务内合并任课教师缓存，避免并发 read-modify-write 丢更新。
///
/// 该函数只操作固定表 `grade_teacher_cache`，不接受动态表名。每次只替换指定
/// `semester` 的映射，同时把有效课程教师合并进全局 `by_kcbh`。
pub fn merge_grade_teacher_cache<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    semester: &str,
    courses: &[(String, String)],
) -> Result<Value> {
    let mut conn = open_connection(path)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let existing_raw: Option<String> = tx
        .query_row(
            "SELECT data FROM grade_teacher_cache WHERE student_id = ?1",
            params![student_id],
            |row| row.get(0),
        )
        .optional()?;

    let mut existing = existing_raw
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| {
            serde_json::json!({
                "success": true,
                "by_kcbh": {},
                "semesters": {}
            })
        });

    let object = existing
        .as_object_mut()
        .ok_or_else(|| rusqlite::Error::InvalidQuery)?;
    object.insert("success".to_string(), Value::Bool(true));
    object.insert(
        "updated_at".to_string(),
        Value::String(Local::now().to_rfc3339()),
    );

    let semester = semester.trim();
    if !semester.is_empty() {
        object.insert(
            "current_semester".to_string(),
            Value::String(semester.to_string()),
        );
    }

    let mut by_kcbh = object
        .remove("by_kcbh")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let mut semesters = object
        .remove("semesters")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let mut semester_map = serde_json::Map::new();

    for (kcbh, teacher) in courses {
        let key = kcbh.trim();
        let teacher = teacher.trim();
        if key.is_empty() || teacher.is_empty() {
            continue;
        }
        let teacher_value = Value::String(teacher.to_string());
        by_kcbh.insert(key.to_string(), teacher_value.clone());
        semester_map.insert(key.to_string(), teacher_value);
    }

    if !semester.is_empty() {
        semesters.insert(semester.to_string(), Value::Object(semester_map));
    }
    object.insert("by_kcbh".to_string(), Value::Object(by_kcbh));
    object.insert("semesters".to_string(), Value::Object(semesters));

    let payload = serde_json::to_string(&existing)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    let sync_time = Local::now().to_rfc3339();
    tx.execute(
        "INSERT INTO grade_teacher_cache (student_id, data, sync_time)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(student_id) DO UPDATE SET
           data = excluded.data,
           sync_time = excluded.sync_time",
        params![student_id, payload, sync_time],
    )?;
    tx.commit()?;
    Ok(existing)
}

/// 在 Tokio 阻塞线程池执行同步 SQLite，避免长时间占用 async worker。
pub async fn run_blocking<T, F>(f: F) -> std::result::Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| format!("db blocking task failed: {e}"))?
        .map_err(|e| e.to_string())
}

/// 异步读取缓存（内部 `spawn_blocking`）。
pub async fn get_cache_async<P>(
    path: P,
    table: &str,
    key: &str,
) -> std::result::Result<Option<(Value, String)>, String>
where
    P: AsRef<Path> + Send + 'static,
{
    let table = table.to_string();
    let key = key.to_string();
    run_blocking(move || get_cache(path, &table, &key)).await
}

/// 异步写入缓存（内部 `spawn_blocking`）。
pub async fn save_cache_async<P>(
    path: P,
    table: &str,
    key: &str,
    data: &Value,
) -> std::result::Result<(), String>
where
    P: AsRef<Path> + Send + 'static,
{
    let table = table.to_string();
    let key = key.to_string();
    let data = data.clone();
    run_blocking(move || save_cache(path, &table, &key, &data)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_cache_{label}_{nanos}.db"))
    }

    /// 缓存读写 roundtrip：普通表 + public 表，save/get/delete/delete_by_prefix。
    #[test]
    fn cache_roundtrip_and_delete_by_prefix() {
        let path = temp_db_path("roundtrip");
        let _ = std::fs::remove_file(&path);
        super::super::migrations::init_db(&path).expect("init");

        // 普通表：按 student_id
        save_cache(
            &path,
            "schedule_cache",
            "2510231001",
            &serde_json::json!({"term": "2025-2026-1"}),
        )
        .expect("save");
        let (data, _) = get_cache(&path, "schedule_cache", "2510231001")
            .expect("get")
            .expect("exists");
        assert_eq!(
            data.pointer("/term").and_then(Value::as_str),
            Some("2025-2026-1")
        );
        let n = delete_cache(&path, "schedule_cache", "2510231001").expect("delete");
        assert_eq!(n, 1);
        assert!(get_cache(&path, "schedule_cache", "2510231001")
            .expect("get2")
            .is_none());

        // public 表：按 cache_key
        save_cache(
            &path,
            "semesters_public_cache",
            "semesters",
            &serde_json::json!(["2024-2025-1", "2024-2025-2"]),
        )
        .expect("save public");
        let (data, _) = get_cache(&path, "semesters_public_cache", "semesters")
            .expect("get public")
            .expect("exists");
        assert_eq!(data.as_array().map(Vec::len), Some(2));

        // 前缀删除
        save_cache(
            &path,
            "classroom_cache",
            "b1_2025",
            &serde_json::json!({"ok": 1}),
        )
        .expect("save p1");
        save_cache(
            &path,
            "classroom_cache",
            "b2_2025",
            &serde_json::json!({"ok": 2}),
        )
        .expect("save p2");
        save_cache(
            &path,
            "classroom_cache",
            "c3_2025",
            &serde_json::json!({"ok": 3}),
        )
        .expect("save p3");
        let n = delete_cache_by_prefix(&path, "classroom_cache", "b").expect("del prefix");
        assert_eq!(n, 2);
        assert!(get_cache(&path, "classroom_cache", "b1_2025")
            .expect("gone1")
            .is_none());
        assert!(get_cache(&path, "classroom_cache", "c3_2025")
            .expect("kept")
            .is_some());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn concurrent_teacher_cache_merges_do_not_lose_semesters() {
        let path = temp_db_path("teacher_cache_merge");
        let _ = std::fs::remove_file(&path);
        super::super::migrations::init_db(&path).expect("init");
        let sid = "2510232099";
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let jobs = [
            (
                "2024-2025-1".to_string(),
                vec![("MATH101".to_string(), "张老师".to_string())],
            ),
            (
                "2024-2025-2".to_string(),
                vec![("EE202".to_string(), "李老师".to_string())],
            ),
        ];
        let handles: Vec<_> = jobs
            .into_iter()
            .map(|(semester, courses)| {
                let path = path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    merge_grade_teacher_cache(&path, sid, &semester, &courses)
                        .expect("merge teacher cache");
                })
            })
            .collect();
        for handle in handles {
            handle.join().expect("thread panicked");
        }

        let (payload, _) = get_cache(&path, "grade_teacher_cache", sid)
            .expect("read cache")
            .expect("cache exists");
        assert_eq!(
            payload.pointer("/semesters/2024-2025-1/MATH101"),
            Some(&Value::String("张老师".to_string()))
        );
        assert_eq!(
            payload.pointer("/semesters/2024-2025-2/EE202"),
            Some(&Value::String("李老师".to_string()))
        );
        assert_eq!(
            payload.pointer("/by_kcbh/MATH101"),
            Some(&Value::String("张老师".to_string()))
        );
        assert_eq!(
            payload.pointer("/by_kcbh/EE202"),
            Some(&Value::String("李老师".to_string()))
        );
        let _ = std::fs::remove_file(&path);
    }
}
