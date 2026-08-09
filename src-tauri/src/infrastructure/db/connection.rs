//! SQLite 连接管理。
//!
//! 负责：
//! - 解析数据库路径（支持 `HBUT_DB_PATH` 环境变量覆盖）
//! - 打开连接并设置统一 PRAGMA（busy_timeout / WAL / synchronous）
//! - 提供公开的 `open_db_connection` 供 usage_stats 等模块复用
//! - 构造 rusqlite 错误（backup 目录/文件操作与 Busy 超时用）

use rusqlite::{Connection, Result};
use std::path::{Path, PathBuf};

use super::migrations::ensure_custom_schedule_color_column;

/// 解析数据库路径：`HBUT_DB_PATH` 非空时优先，否则使用调用方传入路径。
pub(crate) fn resolve_db_path<P: AsRef<Path>>(path: P) -> PathBuf {
    if let Ok(raw) = std::env::var("HBUT_DB_PATH") {
        let candidate = PathBuf::from(raw);
        if !candidate.as_os_str().is_empty() {
            return candidate;
        }
    }
    path.as_ref().to_path_buf()
}

/// 打开 SQLite 连接并应用统一 PRAGMA（5s busy 等待 + WAL + NORMAL）。
pub(crate) fn open_connection<P: AsRef<Path>>(path: P) -> Result<Connection> {
    let resolved = resolve_db_path(path);
    if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    let conn = Connection::open(resolved)?;
    // 统一 5s busy 等待：并发写锁冲突时等待而非立即报错（#550）
    // 必须在切换 WAL 之前设置，切换 journal_mode 本身也可能需要短暂锁
    conn.execute_batch(
        "PRAGMA busy_timeout=5000;
         PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;",
    )?;
    // 幂等补列：旧库缺少 color 时不影响后续 custom_schedule CRUD
    ensure_custom_schedule_color_column(&conn)?;
    Ok(conn)
}

/// 打开 SQLite 连接（供 usage_stats 等模块复用 HBUT_DB_PATH）。
pub fn open_db_connection<P: AsRef<Path>>(path: P) -> Result<Connection> {
    open_connection(path)
}

/// 将 std::io::Error 包装为 rusqlite::Error（backup 目录/文件操作用）。
pub(crate) fn io_to_rusqlite_err(e: std::io::Error) -> rusqlite::Error {
    let code = match e.kind() {
        std::io::ErrorKind::NotFound => rusqlite::ffi::ErrorCode::CannotOpen,
        std::io::ErrorKind::PermissionDenied => rusqlite::ffi::ErrorCode::PermissionDenied,
        _ => rusqlite::ffi::ErrorCode::SystemIoFailure,
    };
    let err = rusqlite::ffi::Error {
        code,
        extended_code: 0,
    };
    rusqlite::Error::SqliteFailure(err, Some(e.to_string()))
}

/// 构造 DatabaseBusy 类型的 rusqlite 错误（备份重试超时用）。
pub(crate) fn busy_timeout_error(message: &str) -> rusqlite::Error {
    let err = rusqlite::ffi::Error {
        code: rusqlite::ffi::ErrorCode::DatabaseBusy,
        extended_code: 0,
    };
    rusqlite::Error::SqliteFailure(err, Some(message.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_conn_{label}_{nanos}.db"))
    }

    #[test]
    fn busy_timeout_waits_for_locked_writer() {
        let path = temp_db_path("busy_wait");
        let _ = std::fs::remove_file(&path);
        super::super::migrations::init_db(&path).expect("init");
        let sid = "2510232003";
        let empty = String::new();
        super::super::repositories::session::save_user_session(
            &path,
            sid,
            "pre=1",
            &empty,
            "seed-token",
            None,
            None,
        )
        .expect("seed");

        // 连接 A：BEGIN IMMEDIATE 持写锁 ~1.2s 不提交
        let holder = open_connection(&path).unwrap();
        holder
            .execute_batch("BEGIN IMMEDIATE; UPDATE user_sessions SET cookies='locked=1' WHERE student_id='2510232003';")
            .expect("holder lock");

        // 连接 B：在另一线程写同一行，busy_timeout=5000 应等待而非立即报错
        let (tx, rx) = std::sync::mpsc::channel::<std::result::Result<(), String>>();
        let path_b = path.clone();
        let sid_b = sid.to_string();
        let writer = std::thread::spawn(move || {
            let result = open_connection(&path_b)
                .and_then(|conn| {
                    conn.execute(
                        "UPDATE user_sessions SET cookies='after=1' WHERE student_id=?1",
                        params![sid_b],
                    )
                    .map(|_| ())
                })
                .map_err(|e| e.to_string());
            tx.send(result).unwrap();
        });

        // 给 B 一点时间进入等待；随后释放写锁
        std::thread::sleep(Duration::from_millis(800));
        holder.execute_batch("COMMIT").expect("holder commit");
        writer.join().expect("writer panicked");

        let _result = rx
            .recv()
            .unwrap()
            .expect("writer must succeed after lock release");
        let session = super::super::repositories::session::get_user_session(&path, sid)
            .unwrap()
            .expect("session");
        assert_eq!(session.cookies, "after=1");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn busy_timeout_value_is_5000ms() {
        let path = temp_db_path("busy_value");
        let _ = std::fs::remove_file(&path);
        super::super::migrations::init_db(&path).expect("init");
        let conn = open_connection(&path).unwrap();
        let ms: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(ms, 5000);
        let _ = std::fs::remove_file(&path);
    }
}
