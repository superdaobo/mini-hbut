//! 在线学习平台状态与同步记录仓储
//! （online_learning_platform_state / online_learning_sync_runs）。

use rusqlite::{params, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::super::connection::open_connection;
use super::super::credential::{protect_session_secret, reveal_session_secret};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningPlatformStateRecord {
    pub student_id: String,
    pub platform: String,
    pub connected: bool,
    pub account_id: String,
    pub display_name: String,
    pub cookie_blob: String,
    pub meta_json: String,
    pub sync_time: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineLearningSyncRunRecord {
    pub id: String,
    pub student_id: String,
    pub platform: String,
    pub status: String,
    pub summary: String,
    pub detail_json: String,
    pub started_at: String,
    pub finished_at: String,
}

pub fn save_online_learning_platform_state<P: AsRef<Path>>(
    path: P,
    record: &OnlineLearningPlatformStateRecord,
) -> Result<()> {
    let conn = open_connection(path)?;
    let protected_cookie_blob = protect_session_secret(
        &record.student_id,
        &record.cookie_blob,
        "online_learning_platform_state.cookie_blob",
    );
    conn.execute(
        "INSERT INTO online_learning_platform_state (
            student_id, platform, connected, account_id, display_name, cookie_blob, meta_json, sync_time, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id, platform) DO UPDATE SET
            connected = excluded.connected,
            account_id = excluded.account_id,
            display_name = excluded.display_name,
            cookie_blob = CASE WHEN excluded.cookie_blob <> '' THEN excluded.cookie_blob ELSE online_learning_platform_state.cookie_blob END,
            meta_json = excluded.meta_json,
            sync_time = excluded.sync_time,
            updated_at = CURRENT_TIMESTAMP",
        params![
            record.student_id,
            record.platform,
            if record.connected { 1 } else { 0 },
            record.account_id,
            record.display_name,
            protected_cookie_blob,
            record.meta_json,
            record.sync_time
        ],
    )?;
    Ok(())
}

pub fn get_online_learning_platform_state<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    platform: &str,
) -> Result<Option<OnlineLearningPlatformStateRecord>> {
    let conn = open_connection(path)?;
    let record = conn
        .query_row(
            "SELECT student_id, platform, connected, account_id, display_name, cookie_blob, meta_json, sync_time, updated_at
             FROM online_learning_platform_state
             WHERE student_id = ?1 AND platform = ?2
             LIMIT 1",
            params![student_id, platform],
            |row| {
                Ok(OnlineLearningPlatformStateRecord {
                    student_id: row.get(0)?,
                    platform: row.get(1)?,
                    connected: row.get::<_, i64>(2)? != 0,
                    account_id: row.get(3)?,
                    display_name: row.get(4)?,
                    cookie_blob: row.get(5)?,
                    meta_json: row.get(6)?,
                    sync_time: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .optional()?;
    Ok(record.map(|mut state| {
        state.cookie_blob = reveal_session_secret(
            &state.student_id,
            &state.cookie_blob,
            "online_learning_platform_state.cookie_blob",
        );
        state
    }))
}

pub fn list_online_learning_platform_states<P: AsRef<Path>>(
    path: P,
    student_id: &str,
) -> Result<Vec<OnlineLearningPlatformStateRecord>> {
    let conn = open_connection(path)?;
    let mut stmt = conn.prepare(
        "SELECT student_id, platform, connected, account_id, display_name, cookie_blob, meta_json, sync_time, updated_at
         FROM online_learning_platform_state
         WHERE student_id = ?1
         ORDER BY platform ASC",
    )?;
    let mut rows = stmt.query(params![student_id])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        let mut state = OnlineLearningPlatformStateRecord {
            student_id: row.get(0)?,
            platform: row.get(1)?,
            connected: row.get::<_, i64>(2)? != 0,
            account_id: row.get(3)?,
            display_name: row.get(4)?,
            cookie_blob: row.get(5)?,
            meta_json: row.get(6)?,
            sync_time: row.get(7)?,
            updated_at: row.get(8)?,
        };
        state.cookie_blob = reveal_session_secret(
            &state.student_id,
            &state.cookie_blob,
            "online_learning_platform_state.cookie_blob",
        );
        result.push(state);
    }
    Ok(result)
}

pub fn clear_online_learning_platform_state<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    platform: Option<&str>,
) -> Result<usize> {
    let conn = open_connection(path)?;
    if let Some(platform) = platform {
        conn.execute(
            "DELETE FROM online_learning_platform_state WHERE student_id = ?1 AND platform = ?2",
            params![student_id, platform],
        )
    } else {
        conn.execute(
            "DELETE FROM online_learning_platform_state WHERE student_id = ?1",
            params![student_id],
        )
    }
}

pub fn add_online_learning_sync_run<P: AsRef<Path>>(
    path: P,
    record: &OnlineLearningSyncRunRecord,
) -> Result<()> {
    let conn = open_connection(path)?;
    conn.execute(
        "INSERT OR REPLACE INTO online_learning_sync_runs (
            id, student_id, platform, status, summary, detail_json, started_at, finished_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            record.id,
            record.student_id,
            record.platform,
            record.status,
            record.summary,
            record.detail_json,
            record.started_at,
            record.finished_at
        ],
    )?;
    Ok(())
}

pub fn list_online_learning_sync_runs<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    platform: Option<&str>,
    limit: usize,
) -> Result<Vec<OnlineLearningSyncRunRecord>> {
    let conn = open_connection(path)?;
    let safe_limit = limit.max(1).min(100) as i64;
    let mut result = Vec::new();
    if let Some(platform) = platform {
        let mut stmt = conn.prepare(
            "SELECT id, student_id, platform, status, summary, detail_json, started_at, finished_at
             FROM online_learning_sync_runs
             WHERE student_id = ?1 AND platform = ?2
             ORDER BY started_at DESC
             LIMIT ?3",
        )?;
        let mut rows = stmt.query(params![student_id, platform, safe_limit])?;
        while let Some(row) = rows.next()? {
            result.push(OnlineLearningSyncRunRecord {
                id: row.get(0)?,
                student_id: row.get(1)?,
                platform: row.get(2)?,
                status: row.get(3)?,
                summary: row.get(4)?,
                detail_json: row.get(5)?,
                started_at: row.get(6)?,
                finished_at: row.get(7)?,
            });
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, student_id, platform, status, summary, detail_json, started_at, finished_at
             FROM online_learning_sync_runs
             WHERE student_id = ?1
             ORDER BY started_at DESC
             LIMIT ?2",
        )?;
        let mut rows = stmt.query(params![student_id, safe_limit])?;
        while let Some(row) = rows.next()? {
            result.push(OnlineLearningSyncRunRecord {
                id: row.get(0)?,
                student_id: row.get(1)?,
                platform: row.get(2)?,
                status: row.get(3)?,
                summary: row.get(4)?,
                detail_json: row.get(5)?,
                started_at: row.get(6)?,
                finished_at: row.get(7)?,
            });
        }
    }
    Ok(result)
}

pub fn clear_online_learning_sync_runs<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    platform: Option<&str>,
) -> Result<usize> {
    let conn = open_connection(path)?;
    if let Some(platform) = platform {
        conn.execute(
            "DELETE FROM online_learning_sync_runs WHERE student_id = ?1 AND platform = ?2",
            params![student_id, platform],
        )
    } else {
        conn.execute(
            "DELETE FROM online_learning_sync_runs WHERE student_id = ?1",
            params![student_id],
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::db_impl::migrations::init_db;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str, extension: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_online_{label}_{nanos}.{extension}"))
    }

    /// 运行时构造测试值，避免在测试源码中固化明文密码学值。
    fn test_secret(label: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("{label}-{nanos}")
    }

    #[test]
    fn online_learning_cookie_is_encrypted_and_roundtrips() {
        let path = temp_path("online_cookie", "db");
        init_db(&path).expect("init");
        let sid = "phase4-online-user";
        let cookie_blob = test_secret("online-cookie");
        let record = OnlineLearningPlatformStateRecord {
            student_id: sid.to_string(),
            platform: "chaoxing".to_string(),
            connected: true,
            account_id: "account".to_string(),
            display_name: "display".to_string(),
            cookie_blob: cookie_blob.clone(),
            meta_json: "{}".to_string(),
            sync_time: "2026-08-04T00:00:00Z".to_string(),
            updated_at: String::new(),
        };
        save_online_learning_platform_state(&path, &record).expect("save state");

        let raw: String = open_connection(&path)
            .expect("open")
            .query_row(
                "SELECT cookie_blob FROM online_learning_platform_state WHERE student_id = ?1 AND platform = ?2",
                params![sid, "chaoxing"],
                |row| row.get(0),
            )
            .expect("raw state");
        assert!(raw.starts_with(crate::secret_envelope::SECRET_ENVELOPE_PREFIX));

        let loaded = get_online_learning_platform_state(&path, sid, "chaoxing")
            .expect("load")
            .expect("state");
        assert_eq!(loaded.cookie_blob, cookie_blob);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn sync_runs_crud_and_limit() {
        let path = temp_path("sync_runs", "db");
        init_db(&path).expect("init");
        let sid = "online-sync-user";
        let mut records = Vec::new();
        for i in 0..5 {
            let record = OnlineLearningSyncRunRecord {
                id: format!("run-{i}"),
                student_id: sid.to_string(),
                platform: "yuketang".to_string(),
                status: "success".to_string(),
                summary: format!("run {i}"),
                detail_json: "{}".to_string(),
                started_at: format!("2026-08-0{}T00:00:00Z", i + 1),
                finished_at: format!("2026-08-0{}T01:00:00Z", i + 1),
            };
            add_online_learning_sync_run(&path, &record).expect("add");
            records.push(record);
        }
        let list = list_online_learning_sync_runs(&path, sid, Some("yuketang"), 3).expect("list");
        assert_eq!(list.len(), 3);
        // 按 started_at 倒序
        assert_eq!(list[0].id, "run-4");
        assert_eq!(list[2].id, "run-2");

        let n = clear_online_learning_sync_runs(&path, sid, Some("yuketang")).expect("clear");
        assert_eq!(n, 5);
        assert!(list_online_learning_sync_runs(&path, sid, None, 10)
            .expect("list2")
            .is_empty());
        let _ = std::fs::remove_file(path);
    }
}
