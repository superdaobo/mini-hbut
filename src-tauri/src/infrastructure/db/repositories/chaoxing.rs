//! 超星签到日志仓储（chaoxing_checkin_log）。

use rusqlite::{params, Result};
use std::path::Path;

use super::super::connection::open_connection;

/// 按学号删除签到日志（供 clear_chaoxing_data 级联调用）。
pub fn delete_chaoxing_checkin_log_by_student<P: AsRef<Path>>(
    path: P,
    student_id: &str,
) -> Result<usize> {
    let conn = open_connection(path)?;
    conn.execute(
        "DELETE FROM chaoxing_checkin_log WHERE student_id = ?1",
        params![student_id],
    )
}
