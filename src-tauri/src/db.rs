// db.rs
//
// 逻辑文档: N/A (简单的 SQLite 包装)
// 模块功能: 本地数据持久化与缓存
// 
// 本文件主要职责:
// 1. 初始化 SQLite 数据库连接和表结构 (grades 表, cache 表)。
// 2. 提供通用的 JSON 缓存存取接口 (get_cache/save_cache)。
// 3. 这里的缓存策略主要是为了支持离线模式 (Offline Mode) 和提升首屏加载速度。

use rusqlite::{params, Connection, Result};
use std::path::Path;
use serde_json::Value;
use chrono::Local;
use base64::Engine;

// 初始化数据库
pub fn init_db<P: AsRef<Path>>(path: P) -> Result<()> {
    let conn = Connection::open(path)?;

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
        "calendar_public_cache",   // public

        "classroom_public_cache",  // public
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
            last_login TIMESTAMP,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    Ok(())
}

// 保存缓存
pub fn save_cache<P: AsRef<Path>>(path: P, table: &str, key: &str, data: &Value) -> Result<()> {
    let conn = Connection::open(path)?;
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
    let conn = Connection::open(path)?;
    
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
    one_code_token: &str
) -> Result<()> {
    let conn = Connection::open(path)?;
    // 简单 Base64 编码作为"加密" (仅防君子)
    let encrypted_password = base64::engine::general_purpose::STANDARD.encode(password);
    
    // 检查是否有 one_code_token 列，如果没有则添加 (为了兼容性)
    let _ = conn.execute("ALTER TABLE user_sessions ADD COLUMN one_code_token TEXT", []);

    conn.execute(
        "INSERT OR REPLACE INTO user_sessions (
            student_id, cookies, encrypted_password, one_code_token, last_login
        ) VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
        params![student_id, cookies, encrypted_password, one_code_token],
    )?;
    Ok(())
}

// 获取用户会话
pub fn get_user_session<P: AsRef<Path>>(path: P, student_id: &str) -> Result<Option<(String, String, String)>> {
    let conn = Connection::open(path)?;
    
    // 检查是否有 one_code_token 列
    let has_token_col = conn.prepare("SELECT one_code_token FROM user_sessions LIMIT 1").is_ok();
    
    let sql = if has_token_col {
        "SELECT cookies, encrypted_password, one_code_token FROM user_sessions WHERE student_id = ?1"
    } else {
        "SELECT cookies, encrypted_password, '' FROM user_sessions WHERE student_id = ?1"
    };

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(params![student_id])?;
    
    if let Some(row) = rows.next()? {
        let cookies: String = row.get(0)?;
        let encrypted: String = row.get(1)?;
        let token: String = row.get(2).unwrap_or_default();
        
        // 解码密码
        let password_bytes = base64::engine::general_purpose::STANDARD.decode(encrypted).unwrap_or_default();
        let password = String::from_utf8(password_bytes).unwrap_or_default();
        
        Ok(Some((cookies, password, token)))
    } else {
        Ok(None)
    }
}

// 获取最近一次用户会话
pub fn get_latest_user_session<P: AsRef<Path>>(path: P) -> Result<Option<(String, String, String, String)>> {
    let conn = Connection::open(path)?;

    // 检查是否有 one_code_token 列
    let has_token_col = conn.prepare("SELECT one_code_token FROM user_sessions LIMIT 1").is_ok();

    let sql = if has_token_col {
        "SELECT student_id, cookies, encrypted_password, one_code_token FROM user_sessions ORDER BY last_login DESC LIMIT 1"
    } else {
        "SELECT student_id, cookies, encrypted_password, '' FROM user_sessions ORDER BY last_login DESC LIMIT 1"
    };

    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query([])?;

    if let Some(row) = rows.next()? {
        let student_id: String = row.get(0)?;
        let cookies: String = row.get(1)?;
        let encrypted: String = row.get(2)?;
        let token: String = row.get(3).unwrap_or_default();

        let password_bytes = base64::engine::general_purpose::STANDARD.decode(encrypted).unwrap_or_default();
        let password = String::from_utf8(password_bytes).unwrap_or_default();

        Ok(Some((student_id, cookies, password, token)))
    } else {
        Ok(None)
    }
}
