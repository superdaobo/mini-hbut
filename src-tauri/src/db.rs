//! 本地数据库与缓存管理模块。
//!
//! 负责：
//! - 初始化 SQLite 数据库与表结构
//! - 保存/读取缓存数据与会话信息
//! - 提供统一的缓存读写接口
//!
//! 注意：
//! - 表结构由 init_db 统一创建
//! - 缓存表按 student_id 或 cache_key 索引

// db.rs
//
// 逻辑文档: N/A (简单的 SQLite 包装)
// 模块功能: 本地数据持久化与缓存
// 
// 本文件主要职责:
// 1. 初始化 SQLite 数据库连接和表结构 (grades 表, cache 表)。
// 2. 提供通用的 JSON 缓存存取接口 (get_cache/save_cache)。
// 3. 这里的缓存策略主要是为了支持离线模式 (Offline Mode) 和提升首屏加载速度。

use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use chrono::Local;
use base64::Engine;

#[derive(Debug, Clone)]
pub struct UserSessionData {
    pub cookies: String,
    pub password: String,
    pub one_code_token: String,
    pub refresh_token: String,
    pub token_expires_at: String,
}

#[derive(Debug, Clone)]
pub struct LatestUserSessionData {
    pub student_id: String,
    pub cookies: String,
    pub password: String,
    pub one_code_token: String,
    pub refresh_token: String,
    pub token_expires_at: String,
}

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
    pub created_at: String,
    pub updated_at: String,
}

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

fn ensure_user_session_columns(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE user_sessions ADD COLUMN one_code_token TEXT", []);
    let _ = conn.execute("ALTER TABLE user_sessions ADD COLUMN electricity_refresh_token TEXT", []);
    let _ = conn.execute("ALTER TABLE user_sessions ADD COLUMN electricity_token_expires_at TEXT", []);
}

fn resolve_db_path<P: AsRef<Path>>(path: P) -> PathBuf {
    if let Ok(raw) = std::env::var("HBUT_DB_PATH") {
        let candidate = PathBuf::from(raw);
        if !candidate.as_os_str().is_empty() {
            return candidate;
        }
    }
    path.as_ref().to_path_buf()
}

fn open_connection<P: AsRef<Path>>(path: P) -> Result<Connection> {
    let resolved = resolve_db_path(path);
    if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    Connection::open(resolved)
}

// 初始化数据库
pub fn init_db<P: AsRef<Path>>(path: P) -> Result<()> {
    let conn = open_connection(path)?;

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
        "calendar_public_cache",   // public

        "classroom_public_cache",  // public
        "semesters_public_cache",  // public
        "qxzkb_public_cache",      // public
        "library_public_cache",    // public
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
             format!("CREATE TABLE IF NOT EXISTS {} (
                cache_key TEXT PRIMARY KEY,
                data TEXT,
                sync_time TEXT
            )", table)
        } else {
            format!("CREATE TABLE IF NOT EXISTS {} (
                student_id TEXT PRIMARY KEY,
                data TEXT,
                sync_time TEXT
            )", table)
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
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        )",
        [],
    )?;
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

    ensure_user_session_columns(&conn);

    Ok(())
}

// 保存缓存
pub fn save_cache<P: AsRef<Path>>(path: P, table: &str, key: &str, data: &Value) -> Result<()> {
    let conn = open_connection(path)?;
    let payload = serde_json::to_string(data).unwrap_or_default();
    let sync_time = Local::now().to_rfc3339();

    let sql = if table.contains("public") {
        format!("INSERT OR REPLACE INTO {} (cache_key, data, sync_time) VALUES (?1, ?2, ?3)", table)
    } else {
        format!("INSERT OR REPLACE INTO {} (student_id, data, sync_time) VALUES (?1, ?2, ?3)", table)
    };

    conn.execute(&sql, params![key, payload, sync_time])?;
    Ok(())
}

// 读取缓存
pub fn get_cache<P: AsRef<Path>>(path: P, table: &str, key: &str) -> Result<Option<(Value, String)>> {
    let conn = open_connection(path)?;
    
    let sql = if table.contains("public") {
        format!("SELECT data, sync_time FROM {} WHERE cache_key = ?1", table)
    } else {
        format!("SELECT data, sync_time FROM {} WHERE student_id = ?1", table)
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

// 保存用户会话 (包括密码，用于自动重登录)
// 注意：实际生产应使用系统密钥环 (Keytar) 或更安全的加密方式
pub fn save_user_session<P: AsRef<Path>>(
    path: P, 
    student_id: &str, 
    cookies: &str, 
    password: &str,
    one_code_token: &str,
    refresh_token: Option<&str>,
    token_expires_at: Option<&str>,
) -> Result<()> {
    let conn = open_connection(path)?;
    // 简单 Base64 编码作为"加密" (仅防君子)
    let encrypted_password = base64::engine::general_purpose::STANDARD.encode(password);
    
    ensure_user_session_columns(&conn);

    conn.execute(
        "INSERT OR REPLACE INTO user_sessions (
            student_id, cookies, encrypted_password, one_code_token,
            electricity_refresh_token, electricity_token_expires_at, last_login
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
        params![
            student_id,
            cookies,
            encrypted_password,
            one_code_token,
            refresh_token.unwrap_or_default(),
            token_expires_at.unwrap_or_default()
        ],
    )?;
    Ok(())
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

// 获取用户会话
pub fn get_user_session<P: AsRef<Path>>(path: P, student_id: &str) -> Result<Option<UserSessionData>> {
    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn);

    let mut stmt = conn.prepare(
        "SELECT cookies, encrypted_password, one_code_token, electricity_refresh_token, electricity_token_expires_at
         FROM user_sessions WHERE student_id = ?1"
    )?;
    let mut rows = stmt.query(params![student_id])?;
    
    if let Some(row) = rows.next()? {
        let cookies: String = row.get(0)?;
        let encrypted: String = row.get(1)?;
        let token: String = row.get(2).unwrap_or_default();
        let refresh_token: String = row.get(3).unwrap_or_default();
        let token_expires_at: String = row.get(4).unwrap_or_default();
        
        // 解码密码
        let password_bytes = base64::engine::general_purpose::STANDARD.decode(encrypted).unwrap_or_default();
        let password = String::from_utf8(password_bytes).unwrap_or_default();
        
        Ok(Some(UserSessionData {
            cookies,
            password,
            one_code_token: token,
            refresh_token,
            token_expires_at,
        }))
    } else {
        Ok(None)
    }
}

// 获取最近一次用户会话
pub fn get_latest_user_session<P: AsRef<Path>>(path: P) -> Result<Option<LatestUserSessionData>> {
    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn);

    let mut stmt = conn.prepare(
        "SELECT student_id, cookies, encrypted_password, one_code_token, electricity_refresh_token, electricity_token_expires_at
         FROM user_sessions ORDER BY last_login DESC LIMIT 1"
    )?;
    let mut rows = stmt.query([])?;

    if let Some(row) = rows.next()? {
        let student_id: String = row.get(0)?;
        let cookies: String = row.get(1)?;
        let encrypted: String = row.get(2)?;
        let token: String = row.get(3).unwrap_or_default();
        let refresh_token: String = row.get(4).unwrap_or_default();
        let token_expires_at: String = row.get(5).unwrap_or_default();

        let password_bytes = base64::engine::general_purpose::STANDARD.decode(encrypted).unwrap_or_default();
        let password = String::from_utf8(password_bytes).unwrap_or_default();

        Ok(Some(LatestUserSessionData {
            student_id,
            cookies,
            password,
            one_code_token: token,
            refresh_token,
            token_expires_at,
        }))
    } else {
        Ok(None)
    }
}

// 仅更新电费授权相关字段（access/refresh/expire）
pub fn save_electricity_tokens<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    one_code_token: &str,
    refresh_token: &str,
    token_expires_at: &str,
) -> Result<()> {
    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn);
    // 确保记录存在
    let _ = conn.execute(
        "INSERT OR IGNORE INTO user_sessions (student_id, last_login) VALUES (?1, CURRENT_TIMESTAMP)",
        params![student_id],
    );
    conn.execute(
        "UPDATE user_sessions
         SET one_code_token = ?2,
             electricity_refresh_token = ?3,
             electricity_token_expires_at = ?4,
             electricity_token_updated_at = CURRENT_TIMESTAMP
         WHERE student_id = ?1",
        params![student_id, one_code_token, refresh_token, token_expires_at],
    )?;
    Ok(())
}

pub fn add_custom_schedule_course<P: AsRef<Path>>(
    path: P,
    course: &CustomScheduleCourseRecord,
) -> Result<()> {
    let conn = open_connection(path)?;
    let weeks_json = serde_json::to_string(&course.weeks).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "INSERT OR REPLACE INTO custom_schedule_courses (
            id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP)",
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
            weeks_json
        ],
    )?;
    Ok(())
}

pub fn list_custom_schedule_courses<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    semester: &str,
) -> Result<Vec<CustomScheduleCourseRecord>> {
    let conn = open_connection(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, created_at, updated_at
         FROM custom_schedule_courses
         WHERE student_id = ?1 AND semester = ?2
         ORDER BY weekday ASC, period ASC, name ASC",
    )?;

    let mut rows = stmt.query(params![student_id, semester])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        let weeks_json: String = row.get(9)?;
        let weeks = serde_json::from_str::<Vec<i32>>(&weeks_json).unwrap_or_default();
        result.push(CustomScheduleCourseRecord {
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
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        });
    }
    Ok(result)
}

pub fn list_all_custom_schedule_courses<P: AsRef<Path>>(
    path: P,
    student_id: &str,
) -> Result<Vec<CustomScheduleCourseRecord>> {
    let conn = open_connection(path)?;
    let mut stmt = conn.prepare(
        "SELECT id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, created_at, updated_at
         FROM custom_schedule_courses
         WHERE student_id = ?1
         ORDER BY semester DESC, weekday ASC, period ASC, name ASC",
    )?;

    let mut rows = stmt.query(params![student_id])?;
    let mut result = Vec::new();
    while let Some(row) = rows.next()? {
        let weeks_json: String = row.get(9)?;
        let weeks = serde_json::from_str::<Vec<i32>>(&weeks_json).unwrap_or_default();
        result.push(CustomScheduleCourseRecord {
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
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        });
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
        "SELECT id, student_id, semester, name, teacher, room, weekday, period, djs, weeks_json, created_at, updated_at
         FROM custom_schedule_courses
         WHERE student_id = ?1 AND id = ?2
         LIMIT 1",
        params![student_id, course_id],
        |row| {
            let weeks_json: String = row.get(9)?;
            let weeks = serde_json::from_str::<Vec<i32>>(&weeks_json).unwrap_or_default();
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
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
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
            weeks_json
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

pub fn save_online_learning_platform_state<P: AsRef<Path>>(
    path: P,
    record: &OnlineLearningPlatformStateRecord,
) -> Result<()> {
    let conn = open_connection(path)?;
    conn.execute(
        "INSERT OR REPLACE INTO online_learning_platform_state (
            student_id, platform, connected, account_id, display_name, cookie_blob, meta_json, sync_time, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)",
        params![
            record.student_id,
            record.platform,
            if record.connected { 1 } else { 0 },
            record.account_id,
            record.display_name,
            record.cookie_blob,
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
    conn.query_row(
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
    .optional()
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
        result.push(OnlineLearningPlatformStateRecord {
            student_id: row.get(0)?,
            platform: row.get(1)?,
            connected: row.get::<_, i64>(2)? != 0,
            account_id: row.get(3)?,
            display_name: row.get(4)?,
            cookie_blob: row.get(5)?,
            meta_json: row.get(6)?,
            sync_time: row.get(7)?,
            updated_at: row.get(8)?,
        });
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
