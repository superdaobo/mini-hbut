//! 数据库 schema 初始化与幂等迁移。
//!
//! 负责：
//! - `init_db` 统一建表（grades / cache / user_sessions / custom_schedule /
//!   online_learning / kv_store / auth_cookie_v2 等）
//! - 幂等补列（旧库 ALTER）与 schema_migrations 版本记录
//!
//! 注意：安全迁移（凭据加密重写）不在此模块自动执行，必须由用户显式触发。

use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::Path;

use super::connection::open_connection;

/// 幂等补列：仅当表存在且缺少目标列时才执行 ALTER。
/// 表不存在（新库由 init_db 统一建表）时静默跳过；表存在但缺列时如实补列，
/// 其余错误（锁、IO 等）会传播，不再静默吞掉（#550）。
pub(crate) fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> Result<()> {
    let table_exists: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
            params![table],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if !table_exists {
        return Ok(());
    }
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut exists = false;
    for r in rows {
        let name = r?;
        if name == column {
            exists = true;
            break;
        }
    }
    if !exists {
        conn.execute(ddl, [])?;
    }
    Ok(())
}

pub(crate) fn ensure_user_session_columns(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "user_sessions",
        "one_code_token",
        "ALTER TABLE user_sessions ADD COLUMN one_code_token TEXT",
    )?;
    ensure_column(
        conn,
        "user_sessions",
        "electricity_refresh_token",
        "ALTER TABLE user_sessions ADD COLUMN electricity_refresh_token TEXT",
    )?;
    ensure_column(
        conn,
        "user_sessions",
        "electricity_token_expires_at",
        "ALTER TABLE user_sessions ADD COLUMN electricity_token_expires_at TEXT",
    )?;
    Ok(())
}

/// `normalize_user_sessions_nulls` 的扫描/修复计数（#659 根因 2）。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UserSessionNullReport {
    /// 存在至少一个契约列 IS NULL 的行数
    pub scanned: usize,
    /// 实际执行的 (行, 列) NULL→'' 修复次数
    pub repaired: usize,
}

/// user_sessions 历史空壳 NULL 自愈（#659 根因 2）。
///
/// 幂等：仅把契约非空业务列中的 NULL 置为 ''，绝不覆盖非空值，
/// 不删除 Session/缓存行；`user_sessions` 表不存在时静默返回零计数。
/// 契约列 = 生产读取路径按 String 读取的列（session.rs 统一 row-mapper）：
/// cookies / encrypted_password / one_code_token / electricity_refresh_token /
/// electricity_token_expires_at。
/// 失败以 Result 传播（调用方如 init_db 可见），计数随 report 返回并 eprintln 记录。
pub fn normalize_user_sessions_nulls(conn: &Connection) -> Result<UserSessionNullReport> {
    const CONTRACT_COLUMNS: [&str; 5] = [
        "cookies",
        "encrypted_password",
        "one_code_token",
        "electricity_refresh_token",
        "electricity_token_expires_at",
    ];

    let empty = UserSessionNullReport::default();
    // 表不存在（新库尚未经过 init_db）时静默跳过，避免 "no such table"
    let table_exists: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_sessions'",
            [],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if !table_exists {
        return Ok(empty);
    }
    // 缺列的旧库先补列，保证后续 UPDATE 引用的列一定存在
    ensure_user_session_columns(conn)?;

    let where_clause = CONTRACT_COLUMNS
        .iter()
        .map(|column| format!("{column} IS NULL"))
        .collect::<Vec<_>>()
        .join(" OR ");
    let scanned: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM user_sessions WHERE {where_clause}"),
        [],
        |row| row.get(0),
    )?;

    let tx = conn.unchecked_transaction()?;
    let mut repaired = 0usize;
    for column in CONTRACT_COLUMNS {
        // 列名来自编译期常量数组，无注入面
        let affected = tx.execute(
            &format!("UPDATE user_sessions SET {column} = '' WHERE {column} IS NULL"),
            [],
        )?;
        repaired += affected;
    }
    tx.commit()?;

    let report = UserSessionNullReport {
        scanned: scanned as usize,
        repaired,
    };
    eprintln!(
        "[db] normalize_user_sessions_nulls: scanned={} repaired={}",
        report.scanned, report.repaired
    );
    Ok(report)
}

/// 自定义课程可选颜色列（#470）：旧库幂等 ALTER，新建表 DDL 已含 color。
pub(crate) fn ensure_custom_schedule_color_column(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "custom_schedule_courses",
        "color",
        "ALTER TABLE custom_schedule_courses ADD COLUMN color TEXT NOT NULL DEFAULT ''",
    )
}

/// 记录已应用的 schema 版本，便于追溯与回滚说明。
pub(crate) fn ensure_schema_migration(
    conn: &Connection,
    version: i64,
    description: &str,
) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL DEFAULT '',
            applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )",
        [],
    )?;
    let applied: bool = conn
        .query_row(
            "SELECT 1 FROM schema_migrations WHERE version = ?1",
            params![version],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if !applied {
        conn.execute(
            "INSERT INTO schema_migrations (version, description) VALUES (?1, ?2)",
            params![version, description],
        )?;
    }
    Ok(())
}

/// 多域会话 cookie（#348/#349）：按 student_id + domain 存 JSON 数组。
pub(crate) fn migrate_auth_cookie_v2_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS auth_cookie_v2 (
            student_id TEXT NOT NULL,
            domain TEXT NOT NULL,
            cookie_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            source TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (student_id, domain)
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_cookie_v2_student
         ON auth_cookie_v2 (student_id, updated_at DESC)",
        [],
    )?;
    Ok(())
}

/// 创建本地试用频率统计相关表（幂等迁移）。
pub(crate) fn migrate_add_app_usage_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_usage_events (
            event_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            load_mode TEXT NOT NULL DEFAULT 'native',
            launch_mode TEXT NOT NULL DEFAULT '',
            duration_ms INTEGER NOT NULL DEFAULT 0,
            app_version TEXT NOT NULL DEFAULT '',
            runtime TEXT NOT NULL DEFAULT '',
            platform TEXT NOT NULL DEFAULT '',
            extra_json TEXT NOT NULL DEFAULT '{}',
            occurred_at INTEGER NOT NULL,
            uploaded_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_app_usage_events_student_time
            ON app_usage_events (student_id, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS idx_app_usage_events_upload
            ON app_usage_events (uploaded_at, occurred_at ASC);

        CREATE TABLE IF NOT EXISTS app_usage_sessions (
            session_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            ended_at INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            app_version TEXT NOT NULL DEFAULT '',
            runtime TEXT NOT NULL DEFAULT '',
            platform TEXT NOT NULL DEFAULT '',
            uploaded_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_app_usage_sessions_upload
            ON app_usage_sessions (uploaded_at, started_at ASC);

        CREATE TABLE IF NOT EXISTS app_usage_daily_rollup (
            student_id TEXT NOT NULL,
            stat_date TEXT NOT NULL,
            target_kind TEXT NOT NULL,
            target_id TEXT NOT NULL,
            load_mode TEXT NOT NULL DEFAULT 'native',
            open_count INTEGER NOT NULL DEFAULT 0,
            duration_ms_total INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (student_id, stat_date, target_kind, target_id, load_mode)
        );

        CREATE INDEX IF NOT EXISTS idx_app_usage_daily_rollup_student_date
            ON app_usage_daily_rollup (student_id, stat_date DESC);

        CREATE TABLE IF NOT EXISTS app_usage_device_profile (
            device_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            app_version TEXT NOT NULL DEFAULT '',
            runtime TEXT NOT NULL DEFAULT '',
            platform TEXT NOT NULL DEFAULT '',
            os_version TEXT NOT NULL DEFAULT '',
            arch TEXT NOT NULL DEFAULT '',
            locale TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL DEFAULT 0
        );",
    )?;
    Ok(())
}

/// 创建 chaoxing_checkin_log 表与索引（幂等迁移）。
pub(crate) fn migrate_add_chaoxing_checkin_log(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS chaoxing_checkin_log (
            student_id    TEXT    NOT NULL,
            active_id     TEXT    NOT NULL,
            activity_type TEXT    NOT NULL CHECK (activity_type IN ('normal','location','photo','qrcode','gesture')),
            course_name   TEXT    NOT NULL DEFAULT '',
            result        TEXT    NOT NULL CHECK (result IN ('success','already_signed','failure')),
            error_code    TEXT,
            error_message TEXT,
            submitted_at  INTEGER NOT NULL,
            payload_hash  TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (student_id, active_id, submitted_at)
        );

        CREATE INDEX IF NOT EXISTS idx_checkin_log_student_time
            ON chaoxing_checkin_log (student_id, submitted_at DESC);",
    )?;
    Ok(())
}

/// 初始化数据库：建表 + 幂等迁移 + schema 版本记录。
///
/// 安全迁移（凭据加密重写）必须由用户明确触发。启动阶段只建表，
/// 不扫描或重写真实用户凭据。
pub fn init_db<P: AsRef<Path>>(path: P) -> Result<()> {
    let path_ref = path.as_ref();
    let conn = open_connection(path_ref)?;

    // 1. 创建 grades 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            term TEXT,
            course_name TEXT,
            course_credit REAL,
            course_nature TEXT,
            course_type TEXT,
            exam_form TEXT,
            course_dept TEXT,
            study_nature TEXT,
            course_category TEXT,
            score_desc TEXT,
            special_mark TEXT,
            final_score TEXT,
            earned_credit REAL,
            is_makeup TEXT,
            teacher TEXT,
            course_attr TEXT,
            sub_scores TEXT,
            record_id TEXT,
            extra_points TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // 2. 创建缓存表
    let cache_tables = vec![
        "grades_cache",
        "grade_teacher_cache",
        "schedule_cache",
        "exams_cache",
        "studentinfo_cache",
        "calendar_cache",
        "ranking_cache",
        "academic_progress_cache",
        "training_plan_cache",
        "classroom_cache",
        "electricity_cache",
        "transaction_cache",
        "student_login_access_cache",
        "ai_session_cache",
        "calendar_public_cache",  // public
        "classroom_public_cache", // public
        "semesters_public_cache", // public
        "qxzkb_public_cache",     // public
        "library_public_cache",   // public
        "online_learning_overview_cache",
        "online_learning_chaoxing_courses_cache",
        "online_learning_chaoxing_outline_cache",
        "online_learning_chaoxing_progress_cache",
        "online_learning_yuketang_courses_cache",
        "online_learning_yuketang_outline_cache",
        "online_learning_yuketang_progress_cache",
    ];

    for table in cache_tables {
        let sql = if table.contains("public") {
            format!(
                "CREATE TABLE IF NOT EXISTS {} (
                cache_key TEXT PRIMARY KEY,
                data TEXT,
                sync_time TEXT
            )",
                table
            )
        } else {
            format!(
                "CREATE TABLE IF NOT EXISTS {} (
                student_id TEXT PRIMARY KEY,
                data TEXT,
                sync_time TEXT
            )",
                table
            )
        };
        conn.execute(&sql, [])?;
    }

    // 3. 用户会话表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_sessions (
            student_id TEXT PRIMARY KEY,
            cookies TEXT,
            password_hash TEXT,
            encrypted_password TEXT,
            uuid TEXT UNIQUE,
            authorization TEXT,
            electricity_cookies TEXT,
            electricity_token_updated_at TEXT,
            one_code_token TEXT,
            electricity_refresh_token TEXT,
            electricity_token_expires_at TEXT,
            last_login TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS custom_schedule_courses (
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
            color TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )",
        [],
    )?;
    ensure_custom_schedule_color_column(&conn)?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_custom_schedule_student_semester
         ON custom_schedule_courses (student_id, semester)",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS online_learning_platform_state (
            student_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            connected INTEGER NOT NULL DEFAULT 0,
            account_id TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL DEFAULT '',
            cookie_blob TEXT NOT NULL DEFAULT '',
            meta_json TEXT NOT NULL DEFAULT '{}',
            sync_time TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            PRIMARY KEY (student_id, platform)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS online_learning_sync_runs (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            detail_json TEXT NOT NULL DEFAULT '{}',
            started_at TEXT NOT NULL,
            finished_at TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_online_learning_sync_runs_student_platform
         ON online_learning_sync_runs (student_id, platform, started_at DESC)",
        [],
    )?;

    ensure_user_session_columns(&conn)?;

    // kv_store 通用键值表（用于位置历史等小型 JSON 数据）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv_store (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;

    migrate_add_chaoxing_checkin_log(&conn)?;
    migrate_add_app_usage_tables(&conn)?;

    ensure_schema_migration(&conn, 1, "WAL journal_mode (open_connection)")?;
    ensure_schema_migration(&conn, 2, "chaoxing_checkin_log")?;
    ensure_schema_migration(
        &conn,
        3,
        "app_usage_events/sessions/daily_rollup/device_profile",
    )?;
    migrate_auth_cookie_v2_table(&conn)?;
    ensure_schema_migration(&conn, 5, "auth_cookie_v2 multi-domain session cookies")?;
    ensure_custom_schedule_color_column(&conn)?;
    ensure_schema_migration(
        &conn,
        6,
        "custom_schedule_courses.color optional user color",
    )?;

    // 历史空壳 NULL 自愈（#659 根因 2）：幂等，仅契约列 NULL→''，不覆盖非空值；
    // 失败直接传播（启动阶段 lib.rs 可见），计数经 eprintln/report 可观测。
    normalize_user_sessions_nulls(&conn)?;
    drop(conn);

    // 安全迁移必须由用户明确触发。启动阶段只建表，不扫描或重写真实用户凭据。
    // migrate_session_passwords_v2 / migrate_session_secrets_v1 仅供显式迁移流程调用。

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection as RawConnection;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_migr_{label}_{nanos}.db"))
    }

    /// 构造一个旧版本数据库：只有 user_sessions（旧列结构，无 one_code_token 等）
    /// 与旧版 custom_schedule_courses（无 color 列），然后通过 init_db 打开，
    /// 验证幂等补列成功且既有数据保持可读（兼容旧库/schema 初始化）。
    #[test]
    fn legacy_schema_opens_and_upgrades_in_place() {
        let path = temp_db_path("legacy_upgrade");
        let _ = std::fs::remove_file(&path);
        // 手工构造旧库：缺失若干列的表
        {
            let conn = RawConnection::open(&path).expect("open legacy");
            conn.execute_batch(
                "CREATE TABLE user_sessions (
                    student_id TEXT PRIMARY KEY,
                    cookies TEXT,
                    password_hash TEXT,
                    encrypted_password TEXT,
                    uuid TEXT UNIQUE,
                    authorization TEXT,
                    electricity_cookies TEXT,
                    electricity_token_updated_at TEXT,
                    last_login TIMESTAMP,
                    expires_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE custom_schedule_courses (
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
                INSERT INTO user_sessions (student_id, cookies, encrypted_password)
                    VALUES ('legacy-001', 'c=legacy', 'b64');
                INSERT INTO custom_schedule_courses
                    (id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json)
                    VALUES ('lc1', 'legacy-001', '2024-2025-1', '旧课', '', '', 1, 1, 2, '[1,2]');",
            )
            .expect("seed legacy schema");
        }

        // init_db 打开旧库：补列 + 建缺失表，不报错
        init_db(&path).expect("init over legacy");

        // 补列生效：user_sessions 有了新列
        let conn = open_connection(&path).expect("open");
        let user_session_columns: Vec<String> = {
            let mut stmt = conn.prepare("PRAGMA table_info(user_sessions)").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        for column in [
            "one_code_token",
            "electricity_refresh_token",
            "electricity_token_expires_at",
        ] {
            assert!(
                user_session_columns.iter().any(|n| n == column),
                "missing {column}"
            );
        }
        let custom_schedule_columns: Vec<String> = {
            let mut stmt = conn
                .prepare("PRAGMA table_info(custom_schedule_courses)")
                .unwrap();
            stmt.query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert!(
            custom_schedule_columns.iter().any(|n| n == "color"),
            "color missing"
        );

        // 既有数据保持可读
        let cookies: String = conn
            .query_row(
                "SELECT cookies FROM user_sessions WHERE student_id = 'legacy-001'",
                [],
                |row| row.get(0),
            )
            .expect("legacy row readable");
        assert_eq!(cookies, "c=legacy");

        // schema_migrations 版本已记录（1..=6 中至少 6 存在）
        let has_v6: bool = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = 6",
                [],
                |_| Ok(true),
            )
            .optional()
            .unwrap()
            .unwrap_or(false);
        assert!(has_v6, "schema migration v6 not recorded");
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    /// init_db 幂等：重复调用不报错、不改变表结构。
    #[test]
    fn init_db_is_idempotent() {
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
        // init_db 记录版本 1,2,3,5,6；version 4 由 migrate_session_passwords_v2 单独记录
        assert_eq!(count, 5);
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    /// normalize_user_sessions_nulls（#659 必测）：历史空壳 NULL 自愈、幂等、
    /// 绝不覆盖非空值、不删除行。
    #[test]
    fn normalize_user_sessions_nulls_repairs_and_is_idempotent() {
        let path = temp_db_path("normalize");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        {
            let conn = open_connection(&path).expect("open");
            // 等价 v1.4.4 空壳：只写 student_id + last_login，其余契约列 NULL
            conn.execute(
                "INSERT INTO user_sessions (student_id, last_login)
                 VALUES ('hist-001', CURRENT_TIMESTAMP)",
                [],
            )
            .expect("seed shell");
            // 部分 NULL 行（one_code_token / refresh / expires 为 NULL）
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token)
                 VALUES ('hist-002', 'c=1', '', NULL)",
                [],
            )
            .expect("seed partial");
            // 全非空行：不得被触碰、不得计入扫描
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token, electricity_refresh_token, electricity_token_expires_at)
                 VALUES ('hist-003', 'c=full', 'b64', 'tok', 'ref', '2099-01-01T00:00:00Z')",
                [],
            )
            .expect("seed full");
        }
        let conn = open_connection(&path).expect("open");
        let first = normalize_user_sessions_nulls(&conn).expect("normalize");
        // hist-001: 5 个契约列 NULL；hist-002: 3 个 → scanned=2, repaired=8
        assert_eq!(first.scanned, 2, "scanned={}", first.scanned);
        assert_eq!(first.repaired, 8, "repaired={}", first.repaired);

        // 全部契约列已非空
        let bad: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_sessions WHERE cookies IS NULL
                 OR encrypted_password IS NULL OR one_code_token IS NULL
                 OR electricity_refresh_token IS NULL OR electricity_token_expires_at IS NULL",
                [],
                |row| row.get(0),
            )
            .expect("bad count");
        assert_eq!(bad, 0);
        // 非空值未被覆盖，行未删除
        let full: (String, String) = conn
            .query_row(
                "SELECT cookies, encrypted_password FROM user_sessions WHERE student_id='hist-003'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("full row");
        assert_eq!(full, ("c=full".to_string(), "b64".to_string()));
        let (shell_cookies, shell_enc): (String, String) = conn
            .query_row(
                "SELECT cookies, encrypted_password FROM user_sessions WHERE student_id='hist-001'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("shell row");
        assert_eq!((shell_cookies, shell_enc), (String::new(), String::new()));

        // 幂等：第二次零扫描零修复
        let second = normalize_user_sessions_nulls(&conn).expect("normalize 2");
        assert_eq!(second.scanned, 0);
        assert_eq!(second.repaired, 0);
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }
}
