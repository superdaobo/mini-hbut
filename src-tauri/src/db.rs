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

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Result, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

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
    /// 用户设定主色（#RRGGBB）；空字符串表示未设定，前端回退自动配色
    #[serde(default)]
    pub color: String,
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

/// 幂等补列：仅当表存在且缺少目标列时才执行 ALTER。
/// 表不存在（新库由 init_db 统一建表）时静默跳过；表存在但缺列时如实补列，
/// 其余错误（锁、IO 等）会传播，不再静默吞掉（#550）。
fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> Result<()> {
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

fn ensure_user_session_columns(conn: &Connection) -> Result<()> {
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

/// 自定义课程可选颜色列（#470）：旧库幂等 ALTER，新建表 DDL 已含 color。
fn ensure_custom_schedule_color_column(conn: &Connection) -> Result<()> {
    ensure_column(
        conn,
        "custom_schedule_courses",
        "color",
        "ALTER TABLE custom_schedule_courses ADD COLUMN color TEXT NOT NULL DEFAULT ''",
    )
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

fn try_decode_base64_password(raw: &str) -> Option<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(raw).ok()?;
    let password = String::from_utf8(bytes).ok()?;
    let password = password.trim().to_string();
    if password.is_empty() {
        None
    } else {
        Some(password)
    }
}

fn load_password_from_keyring_or_remembered(student_id: &str) -> String {
    use crate::credential_store;
    credential_store::load_password(student_id)
        .filter(|p| !p.trim().is_empty())
        .or_else(|| {
            credential_store::load_remembered_credential(&format!("hbut:{student_id}"))
                .filter(|p| !p.trim().is_empty())
        })
        .unwrap_or_default()
}

/// 将明文密码尽量写入密钥环；成功且可读返回 true，否则返回 false（调用方应保留 base64）。
fn try_persist_password_to_keyring(student_id: &str, password: &str) -> bool {
    use crate::credential_store;
    if password.trim().is_empty() {
        return false;
    }
    if credential_store::save_password(student_id, password).is_err() {
        return false;
    }
    let ok = credential_store::load_password(student_id)
        .map(|p| p == password)
        .unwrap_or(false);
    if ok {
        let _ =
            credential_store::save_remembered_credential(&format!("hbut:{student_id}"), password);
    }
    ok
}

#[cfg(not(test))]
fn session_secret_key(student_id: &str, create: bool) -> std::result::Result<[u8; 32], String> {
    if create {
        crate::credential_store::load_or_create_secret_key(student_id)
    } else {
        crate::credential_store::load_secret_key(student_id)
            .ok_or_else(|| "账户敏感字段主密钥不可用".to_string())
    }
}

#[cfg(test)]
fn session_secret_key(student_id: &str, _create: bool) -> std::result::Result<[u8; 32], String> {
    use sha2::{Digest, Sha256};
    if student_id.trim().is_empty() {
        return Err("学号无效".to_string());
    }
    Ok(Sha256::digest(format!("mini-hbut-test-secret:{}", student_id.trim()).as_bytes()).into())
}

fn encrypt_session_secret(student_id: &str, value: &str) -> std::result::Result<String, String> {
    if value.is_empty() {
        return Ok(String::new());
    }
    let key = session_secret_key(student_id, true)?;
    crate::secret_envelope::encrypt_string(&key, value).map_err(|error| error.to_string())
}

fn protect_session_secret(student_id: &str, value: &str, field: &str) -> String {
    match encrypt_session_secret(student_id, value) {
        Ok(encrypted) => encrypted,
        Err(error) => {
            eprintln!("[db] 无法安全持久化 {field}，已跳过该字段: {error}");
            crate::runtime_log::log_error(
                "db",
                format!("无法安全持久化 {field}，已跳过该字段: {error}"),
            );
            String::new()
        }
    }
}

fn reveal_session_secret(student_id: &str, stored: &str, field: &str) -> String {
    if stored.is_empty() || !crate::secret_envelope::is_encrypted_secret(stored) {
        // 旧库明文字段只读兼容；必须通过显式迁移 API 才会重写。
        return stored.to_string();
    }
    let Ok(key) = session_secret_key(student_id, false) else {
        eprintln!("[db] {field} 已加密但账户密钥不可用");
        return String::new();
    };
    match crate::secret_envelope::decrypt_string(&key, stored) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[db] {field} 解密或完整性校验失败: {error}");
            String::new()
        }
    }
}

/// 显式/幂等迁移：旧 Base64 密码列 → 密钥环。此函数不会在启动时自动调用。
#[derive(Debug, Clone, Default)]
pub struct CredMigrateReport {
    pub scanned: usize,
    pub migrated_to_keyring: usize,
    pub kept_base64: usize,
    pub keyring_ok: usize,
    pub empty_shells: usize,
}

/// 扫描 `user_sessions`，修复 1.4.3 密钥环空壳与未完成的 base64 迁移。
pub fn migrate_session_passwords_v2<P: AsRef<Path>>(path: P) -> Result<CredMigrateReport> {
    use crate::credential_store::KEYRING_MARKER;
    use base64::Engine;

    let conn = open_connection(path.as_ref())?;
    ensure_user_session_columns(&conn)?;

    let mut report = CredMigrateReport::default();
    let mut stmt = conn.prepare(
        "SELECT student_id, encrypted_password FROM user_sessions ORDER BY last_login DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows.flatten() {
        let (sid, enc) = row;
        report.scanned += 1;
        let sid = sid.trim().to_string();
        if sid.is_empty() {
            continue;
        }

        if enc == KEYRING_MARKER || enc.is_empty() {
            let from_ring = load_password_from_keyring_or_remembered(&sid);
            if !from_ring.is_empty() {
                report.keyring_ok += 1;
                let _ = crate::credential_store::save_remembered_credential(
                    &format!("hbut:{sid}"),
                    &from_ring,
                );
                continue;
            }
            report.empty_shells += 1;
            eprintln!(
                "[db] cred_migrate_v2: {} 为 KEYRING 空壳，无法自动恢复，需用户重新登录",
                sid
            );
            continue;
        }

        if let Some(password) = try_decode_base64_password(&enc) {
            if try_persist_password_to_keyring(&sid, &password) {
                conn.execute(
                    "UPDATE user_sessions SET encrypted_password = ?1 WHERE student_id = ?2",
                    params![KEYRING_MARKER, sid],
                )?;
                report.migrated_to_keyring += 1;
            } else {
                // 密钥环不可用：显式保留 base64，并写入 remembered（若 keyring 部分可用）
                let encoded = base64::engine::general_purpose::STANDARD.encode(password.as_bytes());
                if encoded != enc {
                    conn.execute(
                        "UPDATE user_sessions SET encrypted_password = ?1 WHERE student_id = ?2",
                        params![encoded, sid],
                    )?;
                }
                let _ = crate::credential_store::save_remembered_credential(
                    &format!("hbut:{sid}"),
                    &password,
                );
                report.kept_base64 += 1;
            }
            continue;
        }

        // 无法识别的列：不覆盖，计为空壳引导
        report.empty_shells += 1;
    }

    ensure_schema_migration(
        &conn,
        4,
        "cred_migrate_v2: base64→keyring with base64 fallback",
    )?;

    eprintln!(
        "[db] cred_migrate_v2 done scanned={} keyring_ok={} migrated={} kept_b64={} empty_shells={}",
        report.scanned,
        report.keyring_ok,
        report.migrated_to_keyring,
        report.kept_base64,
        report.empty_shells
    );
    Ok(report)
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionSecretMigrationReport {
    pub scanned: usize,
    pub migrated: usize,
    pub already_encrypted: usize,
    pub failed: usize,
}

/// 显式迁移 Cookie、访问令牌与刷新令牌到版本化加密信封。
///
/// 不在 init_db 中自动调用；调用方必须先获得用户确认并准备回滚备份。
pub fn migrate_session_secrets_v1<P: AsRef<Path>>(path: P) -> Result<SessionSecretMigrationReport> {
    let mut conn = open_connection(path)?;
    ensure_user_session_columns(&conn)?;
    let rows = {
        let mut stmt = conn.prepare(
            "SELECT student_id, cookies, one_code_token, electricity_refresh_token \
             FROM user_sessions ORDER BY student_id",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, String>(3).unwrap_or_default(),
            ))
        })?;
        mapped.collect::<Result<Vec<_>>>()?
    };

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut report = SessionSecretMigrationReport::default();
    for (student_id, cookies, token, refresh_token) in rows {
        report.scanned += 1;
        let values = [&cookies, &token, &refresh_token];
        if values
            .iter()
            .all(|value| value.is_empty() || crate::secret_envelope::is_encrypted_secret(value))
        {
            report.already_encrypted += 1;
            continue;
        }

        let encrypt_if_needed = |value: &str| -> std::result::Result<String, String> {
            if value.is_empty() || crate::secret_envelope::is_encrypted_secret(value) {
                Ok(value.to_string())
            } else {
                encrypt_session_secret(&student_id, value)
            }
        };
        let protected = (
            encrypt_if_needed(&cookies),
            encrypt_if_needed(&token),
            encrypt_if_needed(&refresh_token),
        );
        let (Ok(cookies), Ok(token), Ok(refresh_token)) = protected else {
            report.failed += 1;
            continue;
        };
        tx.execute(
            "UPDATE user_sessions SET cookies = ?1, one_code_token = ?2, \
             electricity_refresh_token = ?3 WHERE student_id = ?4",
            params![cookies, token, refresh_token, student_id],
        )?;
        report.migrated += 1;
    }
    tx.commit()?;
    Ok(report)
}

/// 从 DB 占位列或密钥环（含旧版 Base64 迁移）解析会话密码。
fn resolve_session_password(student_id: &str, encrypted: &str) -> String {
    use crate::credential_store::KEYRING_MARKER;

    if encrypted == KEYRING_MARKER || encrypted.is_empty() {
        let from_ring = load_password_from_keyring_or_remembered(student_id);
        if !from_ring.is_empty() {
            return from_ring;
        }
        // 多用户隔离：绝不从其他学号的数据库行复制密码。
        return String::new();
    }

    if let Some(password) = try_decode_base64_password(encrypted) {
        let _ = try_persist_password_to_keyring(student_id, &password);
        return password;
    }
    String::new()
}

// 初始化数据库
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
    drop(conn);

    // 安全迁移必须由用户明确触发。启动阶段只建表，不扫描或重写真实用户凭据。
    // migrate_session_passwords_v2 / migrate_session_secrets_v1 仅供显式迁移流程调用。

    Ok(())
}

/// 多域会话 cookie（#348/#349）：按 student_id + domain 存 JSON 数组。
fn migrate_auth_cookie_v2_table(conn: &Connection) -> Result<()> {
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

/// 单域 cookie 行（name=value 列表的 JSON）。
#[derive(Debug, Clone)]
pub struct AuthCookieDomainRow {
    pub domain: String,
    pub cookie_json: String,
    pub source: String,
}

/// 写入/覆盖某学号某域的 cookie（#349 双写的 v2 侧）。
pub fn upsert_auth_cookie_domain<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    domain: &str,
    cookie_json: &str,
    source: &str,
) -> Result<()> {
    let sid = student_id.trim();
    let dom = domain.trim();
    if sid.is_empty() || dom.is_empty() {
        return Ok(());
    }
    let conn = open_connection(path)?;
    migrate_auth_cookie_v2_table(&conn)?;
    conn.execute(
        "INSERT INTO auth_cookie_v2 (student_id, domain, cookie_json, updated_at, source)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, ?4)
         ON CONFLICT(student_id, domain) DO UPDATE SET
           cookie_json = excluded.cookie_json,
           updated_at = CURRENT_TIMESTAMP,
           source = excluded.source",
        params![sid, dom, cookie_json, source],
    )?;
    Ok(())
}

/// 批量写入多域 cookie。
pub fn upsert_auth_cookies_batch<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    rows: &[(String, String)],
    source: &str,
) -> Result<()> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return Ok(());
    }
    let conn = open_connection(path)?;
    migrate_auth_cookie_v2_table(&conn)?;
    let tx = conn.unchecked_transaction()?;
    for (domain, cookie_json) in rows {
        let dom = domain.trim();
        if dom.is_empty() {
            continue;
        }
        tx.execute(
            "INSERT INTO auth_cookie_v2 (student_id, domain, cookie_json, updated_at, source)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, ?4)
             ON CONFLICT(student_id, domain) DO UPDATE SET
               cookie_json = excluded.cookie_json,
               updated_at = CURRENT_TIMESTAMP,
               source = excluded.source",
            params![sid, dom, cookie_json, source],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// 读取某学号全部域 cookie。
pub fn load_auth_cookies_for_student<P: AsRef<Path>>(
    path: P,
    student_id: &str,
) -> Result<Vec<AuthCookieDomainRow>> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return Ok(Vec::new());
    }
    let conn = open_connection(path)?;
    migrate_auth_cookie_v2_table(&conn)?;
    let mut stmt = conn.prepare(
        "SELECT domain, cookie_json, source FROM auth_cookie_v2
         WHERE student_id = ?1 ORDER BY domain",
    )?;
    let rows = stmt.query_map(params![sid], |row| {
        Ok(AuthCookieDomainRow {
            domain: row.get(0)?,
            cookie_json: row.get(1)?,
            source: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows.flatten() {
        if !r.cookie_json.trim().is_empty() && r.cookie_json.trim() != "[]" {
            out.push(r);
        }
    }
    Ok(out)
}

/// 读取最近会话学号的全部域 cookie。
pub fn load_auth_cookies_for_latest<P: AsRef<Path>>(path: P) -> Result<Vec<AuthCookieDomainRow>> {
    let path_ref = path.as_ref();
    let sid = match get_latest_user_session(path_ref)? {
        Some(s) => s.student_id,
        None => return Ok(Vec::new()),
    };
    load_auth_cookies_for_student(path_ref, &sid)
}

/// 清除某学号（或全部）auth_cookie_v2。
pub fn clear_auth_cookies<P: AsRef<Path>>(path: P, student_id: Option<&str>) -> Result<usize> {
    let conn = open_connection(path)?;
    migrate_auth_cookie_v2_table(&conn)?;
    let n = if let Some(sid) = student_id.map(str::trim).filter(|s| !s.is_empty()) {
        conn.execute(
            "DELETE FROM auth_cookie_v2 WHERE student_id = ?1",
            params![sid],
        )?
    } else {
        conn.execute("DELETE FROM auth_cookie_v2", [])?
    };
    Ok(n)
}

/// 仅更新 user_sessions.cookies（不碰密码/电费 token，避免双写误清空）。
pub fn update_user_session_cookies_only<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    cookies: &str,
) -> Result<()> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return Ok(());
    }
    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn)?;
    let protected_cookies = protect_session_secret(sid, cookies, "cookies");
    // 单条 UPSERT 原子完成：加密失败产生空值时保留既有 cookie，不回退明文。
    conn.execute(
        "INSERT INTO user_sessions (student_id, cookies, last_login)
         VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(student_id) DO UPDATE SET
           cookies = CASE WHEN excluded.cookies <> '' THEN excluded.cookies ELSE user_sessions.cookies END,
           last_login = CURRENT_TIMESTAMP",
        params![sid, protected_cookies],
    )?;
    Ok(())
}

/// 打开 SQLite 连接（供 usage_stats 等模块复用 HBUT_DB_PATH）。
pub fn open_db_connection<P: AsRef<Path>>(path: P) -> Result<Connection> {
    open_connection(path)
}

// ============================ 安全备份（#550） ============================
//
// 设计约束：
// - 备份是显式操作（函数或 tauri command），绝不自动恢复、绝不覆盖正式库；
// - 备份只写入指定的 backup 子目录，文件名带 时间戳(毫秒)+pid+进程内原子序号，
//   同秒/同毫秒连续或并发备份时也保证唯一；
// - 先写临时文件，完成后 integrity_check 通过再 rename，保证任一时刻磁盘上
//   只有完整备份（原子命名）；任何失败都清理临时文件，不残留 .tmp；
// - 备份内容包含用户会话 cookies/令牌与本地缓存数据，属于敏感文件，用户须
//   妥善保护（详见 docs/architecture/phase3-convergence.md）；
// - 有限保留：只保留最近 `keep` 份（clamp 到 1..=BACKUP_KEEP_MAX），超出部分
//   按文件名（时间戳前缀）删除最旧的。

/// 默认备份保留份数。
pub const BACKUP_KEEP_DEFAULT: usize = 5;

/// 备份保留份数上限：防止误传超大 `keep` 导致磁盘被历史备份占满。
pub const BACKUP_KEEP_MAX: usize = 30;

/// 备份结果报告。
#[derive(Debug, Clone, serde::Serialize)]
pub struct BackupReport {
    /// 新生成的备份文件绝对路径。
    pub backup_path: PathBuf,
    /// 本次删除的旧备份文件（保留策略触发时非空）。
    pub pruned: Vec<PathBuf>,
    /// 执行后 backup 目录中剩余的备份份数。
    pub kept: usize,
    /// 实际生效的保留策略（`keep` 已 clamp 到 1..=BACKUP_KEEP_MAX）。
    pub keep_policy: usize,
}

/// 将 std::io::Error 包装为 rusqlite::Error（backup 目录/文件操作用）。
fn io_to_rusqlite_err(e: std::io::Error) -> rusqlite::Error {
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

/// 备份数据库到 `backup_dir`（显式调用，不自动执行）。
///
/// - 使用 SQLite 在线备份 API，源库无需关闭，可安全备份 WAL 模式库；
/// - 备份文件名 `{db_stem}-{yyyyMMdd-HHmmss-fff}-{pid}-{seq}.db`，先写 `.tmp`，
///   完整性校验通过后再 rename（原子命名），失败清理临时文件；
/// - `Busy/Locked` 时 sleep 有限重试（上限 20 次 × 50ms），绝不 busy-spin；
/// - 保留最近 `keep` 份（clamp 到 1..=[`BACKUP_KEEP_MAX`]），多余旧备份被清理。
pub fn backup_database<P: AsRef<Path>, Q: AsRef<Path>>(
    db_path: P,
    backup_dir: Q,
    keep: usize,
) -> Result<BackupReport> {
    use rusqlite::backup::{Backup, StepResult};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    /// Busy/Locked 的最大重试次数（每次 sleep 50ms，约 1s 上限；SQLite 层另有
    /// busy_timeout 5s 等待，二者共同避免无限自旋）。
    const BACKUP_BUSY_MAX_ATTEMPTS: u32 = 20;

    let src_path = resolve_db_path(db_path);
    let keep = keep.clamp(1, BACKUP_KEEP_MAX);
    let dir = backup_dir.as_ref().to_path_buf();
    std::fs::create_dir_all(&dir).map_err(io_to_rusqlite_err)?;

    let stem = src_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "db".to_string());
    // 时间戳（毫秒精度）+ pid + 进程内原子序号：同秒/同毫秒连续或并发备份也唯一
    static BACKUP_SEQ: AtomicUsize = AtomicUsize::new(0);
    let ts = Local::now().format("%Y%m%d-%H%M%S%.3f").to_string();
    let seq = BACKUP_SEQ.fetch_add(1, Ordering::Relaxed);
    let final_name = format!("{stem}-{ts}-{pid}-{seq:04}.db", pid = std::process::id());
    let final_path = dir.join(&final_name);
    let tmp_path = dir.join(format!("{final_name}.tmp"));

    // 备份+校验+rename+保留策略整体执行；任何失败都清理 .tmp，避免残留
    let result = (|| -> Result<BackupReport> {
        {
            // 源连接：只读打开，避免备份过程中被误写
            let src =
                Connection::open_with_flags(&src_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let mut dst = Connection::open(&tmp_path)?;
            // 目标连接同样设置 busy_timeout：备份 API 目标写锁冲突时在 SQLite 层等待
            dst.busy_timeout(Duration::from_millis(5000))?;
            let backup = Backup::new(&src, &mut dst)?;
            let mut busy_attempts = 0u32;
            loop {
                match backup.step(100) {
                    Ok(StepResult::Done) => break,
                    Ok(StepResult::Busy | StepResult::Locked) => {
                        busy_attempts += 1;
                        if busy_attempts >= BACKUP_BUSY_MAX_ATTEMPTS {
                            return Err(busy_timeout_error(
                                "backup 持续 Busy/Locked，达到重试上限",
                            ));
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Ok(StepResult::More) => {}
                    // StepResult 标记 #[non_exhaustive]，未来新增变体保守视为暂时性，也走有限重试
                    Ok(_) => {
                        busy_attempts += 1;
                        if busy_attempts >= BACKUP_BUSY_MAX_ATTEMPTS {
                            return Err(busy_timeout_error(
                                "backup step 返回未知变体且反复出现，达到重试上限",
                            ));
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(e) => return Err(e),
                }
            }
        }
        // rename 前先校验完整性：损坏的备份绝不落地为正式备份名
        verify_backup(&tmp_path)?;
        // 原子命名：临时文件写完后 rename 为最终备份名（同目录，保证原子）
        std::fs::rename(&tmp_path, &final_path).map_err(io_to_rusqlite_err)?;

        // 有限保留：按文件名排序（时间戳前缀），只留最新 keep 份
        let mut candidates: Vec<PathBuf> = std::fs::read_dir(&dir)
            .map_err(io_to_rusqlite_err)?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with(&format!("{stem}-")) && n.ends_with(".db"))
                    .unwrap_or(false)
            })
            .collect();
        candidates.sort();
        let mut pruned = Vec::new();
        while candidates.len() > keep {
            let old = candidates.remove(0);
            std::fs::remove_file(&old).map_err(io_to_rusqlite_err)?;
            pruned.push(old);
        }

        Ok(BackupReport {
            backup_path: final_path,
            pruned,
            kept: candidates.len(),
            keep_policy: keep,
        })
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&tmp_path);
    }
    result
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EncryptedBackupReport {
    pub backup_path: PathBuf,
    pub pruned: Vec<PathBuf>,
    pub kept: usize,
    pub keep_policy: usize,
}

fn secret_to_rusqlite_err(error: crate::secret_envelope::SecretEnvelopeError) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(error))
}

/// 创建带版本头与完整性认证的加密数据库备份。
///
/// 明文 SQLite 只存在于本次调用创建的 staging 目录中，完成或失败都会清理。
pub fn backup_database_encrypted<P: AsRef<Path>, Q: AsRef<Path>>(
    db_path: P,
    backup_dir: Q,
    keep: usize,
    master_key: &[u8],
) -> Result<EncryptedBackupReport> {
    use std::sync::atomic::{AtomicUsize, Ordering};

    static ENCRYPTED_BACKUP_SEQ: AtomicUsize = AtomicUsize::new(0);
    let keep = keep.clamp(1, BACKUP_KEEP_MAX);
    let dir = backup_dir.as_ref().to_path_buf();
    std::fs::create_dir_all(&dir).map_err(io_to_rusqlite_err)?;
    let staging = dir.join(format!(
        ".encrypted-backup-staging-{}-{}",
        std::process::id(),
        ENCRYPTED_BACKUP_SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&staging).map_err(io_to_rusqlite_err)?;

    let result = (|| -> Result<EncryptedBackupReport> {
        let plain = backup_database(db_path.as_ref(), &staging, 1)?;
        let bytes = std::fs::read(&plain.backup_path).map_err(io_to_rusqlite_err)?;
        let encrypted = crate::secret_envelope::encrypt_bytes(master_key, &bytes)
            .map_err(secret_to_rusqlite_err)?;
        let stem = db_path
            .as_ref()
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "db".to_string());
        let ts = Local::now().format("%Y%m%d-%H%M%S%.3f").to_string();
        let name = format!(
            "{stem}-{ts}-{}-{:04}.mhbbackup",
            std::process::id(),
            ENCRYPTED_BACKUP_SEQ.fetch_add(1, Ordering::Relaxed)
        );
        let final_path = dir.join(&name);
        let tmp_path = dir.join(format!("{name}.tmp"));
        std::fs::write(&tmp_path, encrypted.as_bytes()).map_err(io_to_rusqlite_err)?;
        // 写盘后立即做认证解密，避免损坏文件被正式命名。
        let written = std::fs::read_to_string(&tmp_path).map_err(io_to_rusqlite_err)?;
        crate::secret_envelope::decrypt_bytes(master_key, &written)
            .map_err(secret_to_rusqlite_err)?;
        std::fs::rename(&tmp_path, &final_path).map_err(io_to_rusqlite_err)?;

        let mut candidates: Vec<PathBuf> = std::fs::read_dir(&dir)
            .map_err(io_to_rusqlite_err)?
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| {
                        name.starts_with(&format!("{stem}-")) && name.ends_with(".mhbbackup")
                    })
                    .unwrap_or(false)
            })
            .collect();
        candidates.sort();
        let mut pruned = Vec::new();
        while candidates.len() > keep {
            let old = candidates.remove(0);
            std::fs::remove_file(&old).map_err(io_to_rusqlite_err)?;
            pruned.push(old);
        }
        Ok(EncryptedBackupReport {
            backup_path: final_path,
            pruned,
            kept: candidates.len(),
            keep_policy: keep,
        })
    })();

    let _ = std::fs::remove_dir_all(&staging);
    result
}

/// 将加密备份恢复到一个不存在的新路径；绝不覆盖正式数据库。
pub fn restore_encrypted_backup<P: AsRef<Path>, Q: AsRef<Path>>(
    backup_path: P,
    destination: Q,
    master_key: &[u8],
) -> Result<PathBuf> {
    let destination = destination.as_ref().to_path_buf();
    if destination.exists() {
        return Err(io_to_rusqlite_err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "恢复目标已存在，拒绝覆盖",
        )));
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent).map_err(io_to_rusqlite_err)?;
    }
    let envelope = std::fs::read_to_string(backup_path).map_err(io_to_rusqlite_err)?;
    let bytes = crate::secret_envelope::decrypt_bytes(master_key, &envelope)
        .map_err(secret_to_rusqlite_err)?;
    let tmp = destination.with_extension("restore.tmp");
    let result = (|| -> Result<PathBuf> {
        std::fs::write(&tmp, bytes).map_err(io_to_rusqlite_err)?;
        verify_backup(&tmp)?;
        std::fs::rename(&tmp, &destination).map_err(io_to_rusqlite_err)?;
        Ok(destination.clone())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// 构造 DatabaseBusy 类型的 rusqlite 错误（备份重试超时用）。
fn busy_timeout_error(message: &str) -> rusqlite::Error {
    let err = rusqlite::ffi::Error {
        code: rusqlite::ffi::ErrorCode::DatabaseBusy,
        extended_code: 0,
    };
    rusqlite::Error::SqliteFailure(err, Some(message.to_string()))
}

/// 列出 backup 目录中**属于指定数据库（stem）**的备份文件（按时间戳升序，即最旧在前），
/// 避免混列其他数据库的备份。
pub fn list_backups<P: AsRef<Path>, Q: AsRef<Path>>(
    backup_dir: P,
    db_path: Q,
) -> Result<Vec<PathBuf>> {
    let dir = backup_dir.as_ref();
    let stem = db_path
        .as_ref()
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "db".to_string());
    let mut out: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(io_to_rusqlite_err)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(&format!("{stem}-")) && n.ends_with(".db"))
                .unwrap_or(false)
        })
        .collect();
    out.sort();
    Ok(out)
}

/// 校验备份文件可读且未损坏：能打开并执行 PRAGMA integrity_check。
/// 仅用于验证，绝不写回正式库。
pub fn verify_backup<P: AsRef<Path>>(backup_path: P) -> Result<()> {
    let conn = Connection::open_with_flags(
        backup_path.as_ref(),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result.trim() == "ok" {
        Ok(())
    } else {
        let err = rusqlite::ffi::Error {
            code: rusqlite::ffi::ErrorCode::DatabaseCorrupt,
            extended_code: 0,
        };
        Err(rusqlite::Error::SqliteFailure(
            err,
            Some(format!("backup integrity_check failed: {result}")),
        ))
    }
}

/// 记录已应用的 schema 版本，便于追溯与回滚说明。
fn ensure_schema_migration(conn: &Connection, version: i64, description: &str) -> Result<()> {
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

/// 创建本地试用频率统计相关表（幂等迁移）。
fn migrate_add_app_usage_tables(conn: &Connection) -> Result<()> {
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
fn migrate_add_chaoxing_checkin_log(conn: &Connection) -> Result<()> {
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

// 保存用户会话；密码只写系统密钥环，失败时不再以 Base64 或明文落库。
// 空 password/token 表示“本次没有新值”，UPSERT 会保留既有非空字段；这是记住密码与
// 离线恢复的有意语义。真正删除凭据必须走 delete_remembered_credential/隐私清理流程。
pub fn save_user_session<P: AsRef<Path>>(
    path: P,
    student_id: &str,
    cookies: &str,
    password: &str,
    one_code_token: &str,
    refresh_token: Option<&str>,
    token_expires_at: Option<&str>,
) -> Result<()> {
    use crate::credential_store::KEYRING_MARKER;

    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn)?;
    let existing_password_marker = || {
        conn.query_row(
            "SELECT encrypted_password FROM user_sessions WHERE student_id = ?1",
            params![student_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default()
    };
    let encrypted_password = if password.is_empty() {
        existing_password_marker()
    } else if try_persist_password_to_keyring(student_id, password) {
        KEYRING_MARKER.to_string()
    } else {
        eprintln!("[db] 密钥环不可用，密码未持久化");
        crate::runtime_log::log_error("db", "密钥环不可用，密码未持久化");
        existing_password_marker()
    };
    let protected_cookies = protect_session_secret(student_id, cookies, "cookies");
    let protected_one_code_token =
        protect_session_secret(student_id, one_code_token, "one_code_token");
    let protected_refresh_token = protect_session_secret(
        student_id,
        refresh_token.unwrap_or_default(),
        "electricity_refresh_token",
    );

    // UPSERT 原子更新（#550）：有行时仅更新传入的非空字段，空值保留库中已有值，
    // 避免 INSERT OR REPLACE 删行重建导致 uuid/authorization 等未传入字段丢失，
    // 也避免并发读改写竞态。last_login 总是刷新为当前时间。
    conn.execute(
        "INSERT INTO user_sessions (
            student_id, cookies, encrypted_password, one_code_token,
            electricity_refresh_token, electricity_token_expires_at, last_login
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
        ON CONFLICT(student_id) DO UPDATE SET
            cookies = CASE WHEN excluded.cookies <> '' THEN excluded.cookies ELSE user_sessions.cookies END,
            encrypted_password = CASE WHEN excluded.encrypted_password <> '' THEN excluded.encrypted_password ELSE user_sessions.encrypted_password END,
            one_code_token = CASE WHEN excluded.one_code_token <> '' THEN excluded.one_code_token ELSE user_sessions.one_code_token END,
            electricity_refresh_token = CASE WHEN excluded.electricity_refresh_token <> '' THEN excluded.electricity_refresh_token ELSE user_sessions.electricity_refresh_token END,
            electricity_token_expires_at = CASE WHEN excluded.electricity_token_expires_at <> '' THEN excluded.electricity_token_expires_at ELSE user_sessions.electricity_token_expires_at END,
            last_login = CURRENT_TIMESTAMP",
        params![
            student_id,
            protected_cookies,
            encrypted_password,
            protected_one_code_token,
            protected_refresh_token,
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
pub fn get_user_session<P: AsRef<Path>>(
    path: P,
    student_id: &str,
) -> Result<Option<UserSessionData>> {
    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn)?;

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

        let password = resolve_session_password(student_id, &encrypted);

        Ok(Some(UserSessionData {
            cookies: reveal_session_secret(student_id, &cookies, "cookies"),
            password,
            one_code_token: reveal_session_secret(student_id, &token, "one_code_token"),
            refresh_token: reveal_session_secret(
                student_id,
                &refresh_token,
                "electricity_refresh_token",
            ),
            token_expires_at,
        }))
    } else {
        Ok(None)
    }
}

// 获取最近一次用户会话
pub fn get_latest_user_session<P: AsRef<Path>>(path: P) -> Result<Option<LatestUserSessionData>> {
    let conn = open_connection(path)?;
    ensure_user_session_columns(&conn)?;

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

        let password = resolve_session_password(&student_id, &encrypted);

        Ok(Some(LatestUserSessionData {
            cookies: reveal_session_secret(&student_id, &cookies, "cookies"),
            password,
            one_code_token: reveal_session_secret(&student_id, &token, "one_code_token"),
            refresh_token: reveal_session_secret(
                &student_id,
                &refresh_token,
                "electricity_refresh_token",
            ),
            student_id,
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
    ensure_user_session_columns(&conn)?;
    let protected_one_code_token =
        protect_session_secret(student_id, one_code_token, "one_code_token");
    let protected_refresh_token =
        protect_session_secret(student_id, refresh_token, "electricity_refresh_token");
    // UPSERT 原子更新（#550）：单条语句同时处理"行不存在则插入"与"行存在则更新"，
    // 避免 INSERT OR IGNORE + UPDATE 两步间的并发竞态；空值保留库中已有非空字段。
    conn.execute(
        "INSERT INTO user_sessions (student_id, one_code_token, electricity_refresh_token, electricity_token_expires_at, electricity_token_updated_at, last_login)
         VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(student_id) DO UPDATE SET
             one_code_token = CASE WHEN excluded.one_code_token <> '' THEN excluded.one_code_token ELSE user_sessions.one_code_token END,
             electricity_refresh_token = CASE WHEN excluded.electricity_refresh_token <> '' THEN excluded.electricity_refresh_token ELSE user_sessions.electricity_refresh_token END,
             electricity_token_expires_at = CASE WHEN excluded.electricity_token_expires_at <> '' THEN excluded.electricity_token_expires_at ELSE user_sessions.electricity_token_expires_at END,
             electricity_token_updated_at = CURRENT_TIMESTAMP,
             last_login = CURRENT_TIMESTAMP",
        params![
            student_id,
            protected_one_code_token,
            protected_refresh_token,
            token_expires_at
        ],
    )?;
    Ok(())
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

/// 异步读取用户会话。
pub async fn get_user_session_async<P>(
    path: P,
    student_id: &str,
) -> std::result::Result<Option<UserSessionData>, String>
where
    P: AsRef<Path> + Send + 'static,
{
    let sid = student_id.to_string();
    run_blocking(move || get_user_session(path, &sid)).await
}

/// 异步保存用户会话。
pub async fn save_user_session_async<P>(
    path: P,
    student_id: &str,
    cookies: &str,
    password: &str,
    one_code_token: &str,
    refresh_token: Option<&str>,
    token_expires_at: Option<&str>,
) -> std::result::Result<(), String>
where
    P: AsRef<Path> + Send + 'static,
{
    let sid = student_id.to_string();
    let cookies = cookies.to_string();
    let password = password.to_string();
    let one_code_token = one_code_token.to_string();
    let refresh_token = refresh_token.map(|s| s.to_string());
    let token_expires_at = token_expires_at.map(|s| s.to_string());
    run_blocking(move || {
        save_user_session(
            path,
            &sid,
            &cookies,
            &password,
            &one_code_token,
            refresh_token.as_deref(),
            token_expires_at.as_deref(),
        )
    })
    .await
}

#[cfg(test)]
mod cred_migrate_tests {
    use super::*;
    use base64::Engine;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_cred_{label}_{nanos}.db"))
    }

    /// 运行时构造测试密码，避免在测试源码中固化明文密码学值。
    fn test_password(label: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("{label}-{nanos}")
    }

    #[test]
    fn empty_password_save_does_not_wipe_base64_column() {
        let path = temp_db_path("empty_save");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510231199";
        let password = test_password("legacy-pass");
        let b64 = base64::engine::general_purpose::STANDARD.encode(password.as_bytes());
        {
            let conn = open_connection(&path).unwrap();
            let empty_token = String::new();
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token)
                 VALUES (?1, ?2, ?3, ?4)",
                params![sid, "c=1", b64, empty_token],
            )
            .unwrap();
        }

        let empty = String::new();
        save_user_session(&path, sid, "c=2", &empty, &empty, None, None).expect("save empty");

        let conn = open_connection(&path).unwrap();
        let enc: String = conn
            .query_row(
                "SELECT encrypted_password FROM user_sessions WHERE student_id = ?1",
                params![sid],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(enc, crate::credential_store::KEYRING_MARKER);
        assert_eq!(
            try_decode_base64_password(&enc).as_deref(),
            Some(password.as_str())
        );

        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.password, password);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn migrate_v2_keeps_or_promotes_base64_rows() {
        let path = temp_db_path("migrate_v2");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510231188";
        let password = test_password("migrate-pass");
        let b64 = base64::engine::general_purpose::STANDARD.encode(password.as_bytes());
        {
            let conn = open_connection(&path).unwrap();
            conn.execute(
                "INSERT OR REPLACE INTO user_sessions (student_id, cookies, encrypted_password, one_code_token)
                 VALUES (?1, 'c=1', ?2, '')",
                params![sid, b64],
            )
            .unwrap();
        }

        let report = migrate_session_passwords_v2(&path).expect("migrate");
        assert!(report.scanned >= 1);
        assert!(report.migrated_to_keyring + report.kept_base64 >= 1);

        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.password, password);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn resolve_reads_base64_legacy_column() {
        let path = temp_db_path("resolve_b64");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "2510231177";
        let password = test_password("plain-from");
        let b64 = base64::engine::general_purpose::STANDARD.encode(password.as_bytes());
        {
            let conn = open_connection(&path).unwrap();
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token)
                 VALUES (?1, 'c=1', ?2, '')",
                params![sid, b64],
            )
            .unwrap();
        }
        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.password, password);
        let _ = std::fs::remove_file(&path);
    }
}

#[cfg(test)]
mod phase4_secret_migration_tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str, extension: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_phase4_{label}_{nanos}.{extension}"))
    }

    #[test]
    fn new_session_secrets_are_encrypted_and_roundtrip() {
        let path = temp_path("session", "db");
        init_db(&path).expect("init");
        let sid = "phase4-user-a";
        save_user_session(
            &path,
            sid,
            "cookie=value",
            "",
            "access-token",
            Some("refresh-token"),
            Some("2099-01-01T00:00:00Z"),
        )
        .expect("save");

        let conn = open_connection(&path).expect("open");
        let raw: (String, String, String) = conn
            .query_row(
                "SELECT cookies, one_code_token, electricity_refresh_token FROM user_sessions WHERE student_id = ?1",
                params![sid],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("row");
        assert!(raw
            .0
            .starts_with(crate::secret_envelope::SECRET_ENVELOPE_PREFIX));
        assert!(raw
            .1
            .starts_with(crate::secret_envelope::SECRET_ENVELOPE_PREFIX));
        assert!(raw
            .2
            .starts_with(crate::secret_envelope::SECRET_ENVELOPE_PREFIX));

        let session = get_user_session(&path, sid).expect("get").expect("session");
        assert_eq!(session.cookies, "cookie=value");
        assert_eq!(session.one_code_token, "access-token");
        assert_eq!(session.refresh_token, "refresh-token");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn legacy_secret_migration_is_explicit_and_idempotent() {
        let path = temp_path("migration", "db");
        init_db(&path).expect("init");
        let sid = "phase4-user-b";
        {
            let conn = open_connection(&path).expect("open");
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token, electricity_refresh_token) VALUES (?1, 'legacy-cookie', '', 'legacy-access', 'legacy-refresh')",
                params![sid],
            )
            .expect("seed");
        }
        init_db(&path).expect("re-init");
        let before: String = open_connection(&path)
            .expect("open")
            .query_row(
                "SELECT cookies FROM user_sessions WHERE student_id = ?1",
                params![sid],
                |row| row.get(0),
            )
            .expect("raw before");
        assert_eq!(before, "legacy-cookie");

        let report = migrate_session_secrets_v1(&path).expect("migrate");
        assert_eq!(report.migrated, 1);
        let second = migrate_session_secrets_v1(&path).expect("migrate twice");
        assert_eq!(second.already_encrypted, 1);
        let session = get_user_session(&path, sid).expect("get").expect("session");
        assert_eq!(session.cookies, "legacy-cookie");
        assert_eq!(session.one_code_token, "legacy-access");
        assert_eq!(session.refresh_token, "legacy-refresh");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn encrypted_backup_restores_to_new_path_only() {
        let source = temp_path("backup_source", "db");
        let backup_dir = temp_path("backup_dir", "dir");
        let restored = temp_path("backup_restore", "db");
        init_db(&source).expect("init");
        save_cache(
            &source,
            "public_cache",
            "phase4",
            &serde_json::json!({"ok": true}),
        )
        .expect("seed cache");
        let key: [u8; 32] = Sha256::digest(b"synthetic encrypted backup key").into();
        let report = backup_database_encrypted(&source, &backup_dir, 2, &key).expect("backup");
        assert!(report
            .backup_path
            .extension()
            .is_some_and(|ext| ext == "mhbbackup"));
        restore_encrypted_backup(&report.backup_path, &restored, &key).expect("restore");
        verify_backup(&restored).expect("verify restored");
        assert!(restore_encrypted_backup(&report.backup_path, &restored, &key).is_err());
        let _ = std::fs::remove_file(source);
        let _ = std::fs::remove_file(restored);
        let _ = std::fs::remove_dir_all(backup_dir);
    }
}

#[cfg(test)]
mod auth_cookie_v2_tests {
    use super::*;
    use base64::Engine;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_acv2_{label}_{nanos}.db"))
    }

    /// 运行时构造测试密码，避免在测试源码中固化明文密码学值。
    fn test_password(label: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("{label}-{nanos}")
    }

    #[test]
    fn upsert_load_clear_auth_cookie_v2() {
        let path = temp_db_path("crud");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510231001";
        let rows = vec![
            (
                "passport2.chaoxing.com".to_string(),
                r#"[{"name":"UID","value":"u1","path":"/"}]"#.to_string(),
            ),
            (
                "auth.hbut.edu.cn".to_string(),
                r#"[{"name":"CASTGC","value":"TGT-1","path":"/"}]"#.to_string(),
            ),
        ];
        upsert_auth_cookies_batch(&path, sid, &rows, "test").expect("upsert");

        let loaded = load_auth_cookies_for_student(&path, sid).expect("load");
        assert_eq!(loaded.len(), 2);
        assert!(loaded.iter().any(|r| r.domain.contains("chaoxing")));
        assert!(loaded.iter().any(|r| r.domain.contains("hbut")));

        let n = clear_auth_cookies(&path, Some(sid)).expect("clear");
        assert!(n >= 2);
        let after = load_auth_cookies_for_student(&path, sid).expect("load2");
        assert!(after.is_empty());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn cookies_only_update_preserves_token_and_password() {
        let path = temp_db_path("cookies_only");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510231002";
        let password = test_password("keep-me");
        let b64 = base64::engine::general_purpose::STANDARD.encode(password.as_bytes());
        {
            let conn = open_connection(&path).unwrap();
            conn.execute(
                "INSERT INTO user_sessions (
                    student_id, cookies, encrypted_password, one_code_token,
                    electricity_refresh_token, electricity_token_expires_at
                 ) VALUES (?1, 'old=1', ?2, 'tok-abc', 'ref-xyz', '2099-01-01T00:00:00Z')",
                params![sid, b64],
            )
            .unwrap();
        }

        update_user_session_cookies_only(&path, sid, "Code: a=1 | Auth: b=2").expect("upd");

        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.password, password);
        assert_eq!(session.one_code_token, "tok-abc");
        assert_eq!(session.refresh_token, "ref-xyz");
        assert!(session.cookies.contains("Code:"));
        let _ = std::fs::remove_file(&path);
    }
}

#[cfg(test)]
mod custom_schedule_color_tests {
    use super::*;
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

#[cfg(test)]
mod concurrency_tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_concur_{label}_{nanos}.db"))
    }

    fn test_runtime_value(label: &str) -> String {
        format!("{label}-{}", std::process::id())
    }

    #[test]
    fn concurrent_cookies_only_upserts_never_lose_fields() {
        let path = temp_db_path("cookies_concur");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510232001";
        let seed_password = test_runtime_value("encoded-password");
        let seed_token = test_runtime_value("one-code-token");
        let seed_refresh = test_runtime_value("refresh-token");
        let seed_expiry = format!("2099-01-01T00:00:{:02}Z", std::process::id() % 60);
        // 预置会话：密码 + 电费 token 非空（测试值均在运行时构造，非硬编码凭据）
        {
            let conn = open_connection(&path).unwrap();
            conn.execute(
                "INSERT INTO user_sessions (
                    student_id, cookies, encrypted_password, one_code_token,
                    electricity_refresh_token, electricity_token_expires_at
                 ) VALUES (?1, 'pre=1', ?2, ?3, ?4, ?5)",
                params![sid, seed_password, seed_token, seed_refresh, seed_expiry],
            )
            .unwrap();
        }

        // 8 个线程并发 cookies-only 更新同一行；任何并发竞态若导致 UPDATE 后行被删/字段被清空都会在此暴露
        let threads = 8;
        let barrier = Arc::new(Barrier::new(threads));
        let mut handles = Vec::new();
        for i in 0..threads {
            let path = path.clone();
            let sid = sid.to_string();
            let barrier = barrier.clone();
            handles.push(thread::spawn(move || {
                barrier.wait();
                let cookies = format!("Code: c{i} | Auth: a{i}");
                update_user_session_cookies_only(&path, &sid, &cookies).expect("upsert");
            }));
        }
        for h in handles {
            h.join().expect("thread panicked");
        }

        let session = get_user_session(&path, sid).unwrap().expect("session");
        // 密码与电费 token 不能被 cookies-only 更新清掉
        assert_eq!(session.one_code_token, seed_token);
        assert_eq!(session.refresh_token, seed_refresh);
        assert!(session.cookies.contains("Code: c"));
        assert!(session.cookies.contains("Auth: a"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn concurrent_save_user_session_keeps_nonempty_fields() {
        let path = temp_db_path("save_concur");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510232002";
        let seed_password = test_runtime_value("password");
        let seed_token = test_runtime_value("token");
        let seed_refresh = test_runtime_value("refresh");
        let seed_expiry = test_runtime_value("expiry");
        save_user_session(
            &path,
            sid,
            "cookies=1",
            &seed_password,
            &seed_token,
            Some(&seed_refresh),
            Some(&seed_expiry),
        )
        .expect("save init");

        let threads = 6;
        let barrier = Arc::new(Barrier::new(threads));
        let mut handles = Vec::new();
        for i in 0..threads {
            let path = path.clone();
            let sid = sid.to_string();
            let barrier = barrier.clone();
            handles.push(thread::spawn(move || {
                barrier.wait();
                // 并发空 token 覆盖尝试：不得清空已有 tok-1/ref-1
                let empty = String::new();
                save_user_session(
                    &path,
                    &sid,
                    &format!("cookies={i}"),
                    &empty,
                    &empty,
                    None,
                    None,
                )
                .expect("save empty");
            }));
        }
        for h in handles {
            h.join().expect("thread panicked");
        }

        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.one_code_token, seed_token);
        assert_eq!(session.refresh_token, seed_refresh);
        assert_eq!(session.token_expires_at, seed_expiry);
        assert_eq!(session.password, seed_password);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn concurrent_teacher_cache_merges_do_not_lose_semesters() {
        let path = temp_db_path("teacher_cache_merge");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "2510232099";
        let barrier = Arc::new(Barrier::new(2));
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
                thread::spawn(move || {
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

    #[test]
    fn busy_timeout_waits_for_locked_writer() {
        let path = temp_db_path("busy_wait");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "2510232003";
        let empty = String::new();
        let seed_token = test_runtime_value("busy-token");
        save_user_session(&path, sid, "pre=1", &empty, &seed_token, None, None).expect("seed");

        // 连接 A：BEGIN IMMEDIATE 持写锁 ~1.2s 不提交
        let holder = open_connection(&path).unwrap();
        holder
            .execute_batch("BEGIN IMMEDIATE; UPDATE user_sessions SET cookies='locked=1' WHERE student_id='2510232003';")
            .expect("holder lock");

        // 连接 B：在另一线程写同一行，busy_timeout=5000 应等待而非立即报错
        let (tx, rx) = std::sync::mpsc::channel::<std::result::Result<(), String>>();
        let path_b = path.clone();
        let sid_b = sid.to_string();
        let writer = thread::spawn(move || {
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
        thread::sleep(Duration::from_millis(800));
        holder.execute_batch("COMMIT").expect("holder commit");
        writer.join().expect("writer panicked");

        let _result = rx
            .recv()
            .unwrap()
            .expect("writer must succeed after lock release");
        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.cookies, "after=1");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn busy_timeout_value_is_5000ms() {
        let path = temp_db_path("busy_value");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let conn = open_connection(&path).unwrap();
        let ms: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(ms, 5000);
        let _ = std::fs::remove_file(&path);
    }
}

#[cfg(test)]
mod backup_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_bk_{label}_{nanos}"))
    }

    #[test]
    fn backup_is_readable_and_data_complete() {
        let root = temp_path("complete");
        let db = root.join("grades.db");
        let bk = root.join("backup");
        std::fs::create_dir_all(&root).unwrap();
        init_db(&db).expect("init");

        // 写入真实数据：grades + user_sessions + cache
        let sid = "2510233001";
        {
            let conn = open_connection(&db).unwrap();
            conn.execute(
                "INSERT INTO grades (term, course_name, final_score) VALUES ('2025-1', '高数', '95')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password)
                 VALUES (?1, 'c=1', 'b64')",
                params![sid],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO grades_cache (student_id, data, sync_time) VALUES (?1, '{}', '2025-01-01')",
                params![sid],
            )
            .unwrap();
        }

        let report = backup_database(&db, &bk, BACKUP_KEEP_DEFAULT).expect("backup");
        assert!(report.backup_path.exists());
        assert!(report.backup_path.to_string_lossy().contains("backup"));
        // 原子命名：不应残留 .tmp
        assert!(!bk.join("grades-*.tmp").exists() || list_temp_files(&bk).is_empty());

        // 备份可读且数据完整
        verify_backup(&report.backup_path).expect("verify");
        let conn = Connection::open(&report.backup_path).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM grades", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let score: String = conn
            .query_row("SELECT final_score FROM grades LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(score, "95");
        let sids: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT student_id FROM user_sessions")
                .unwrap();
            stmt.query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert!(sids.contains(&sid.to_string()));

        // 正式库未被覆盖/删除
        assert!(db.exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn backup_retention_keeps_only_latest_n() {
        let root = temp_path("retention");
        let db = root.join("grades.db");
        let bk = root.join("backup");
        std::fs::create_dir_all(&root).unwrap();
        init_db(&db).expect("init");

        // 连续快速备份 4 次（无 sleep），保留 2 份：应只剩最新的 2 份，
        // 且同毫秒并发时文件名仍唯一（时间戳+pid+原子序号）
        let mut reports = Vec::new();
        for _ in 0..4 {
            reports.push(backup_database(&db, &bk, 2).expect("backup"));
        }
        // 快速连续备份的文件名必须互不相同
        let mut names: Vec<String> = reports
            .iter()
            .map(|r| {
                r.backup_path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        let unique: std::collections::HashSet<&String> = names.iter().collect();
        assert_eq!(
            unique.len(),
            names.len(),
            "同秒/同毫秒备份文件名必须唯一: {names:?}"
        );
        let backups = list_backups(&bk, &db).expect("list");
        assert_eq!(
            backups.len(),
            2,
            "retention should keep exactly 2, got {backups:?}"
        );
        // 保留的是最新的两份（文件名排序即时间排序）
        let mut all: Vec<String> = backups
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        all.sort();
        names.sort();
        // 被保留的两份应是最后两次备份（即所有名字中最大的两个）
        assert_eq!(all, names[2..].to_vec());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn backup_concurrent_names_are_unique_and_valid() {
        let root = temp_path("concurrent");
        let db = root.join("grades.db");
        let bk = root.join("backup");
        std::fs::create_dir_all(&root).unwrap();
        init_db(&db).expect("init");
        // 预置少量数据
        {
            let conn = open_connection(&db).unwrap();
            conn.execute(
                "INSERT INTO grades (term, course_name, final_score) VALUES ('2025-1', '高数', '90')",
                [],
            )
            .unwrap();
        }

        // 4 个线程同时备份到同一目录：文件名必须唯一，且全部可验证
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let db = db.clone();
                let bk = bk.clone();
                std::thread::spawn(move || {
                    let report = backup_database(&db, &bk, 8).expect("concurrent backup");
                    verify_backup(&report.backup_path).expect("concurrent verify");
                    report
                })
            })
            .collect();
        let reports: Vec<_> = handles
            .into_iter()
            .map(|h| h.join().expect("thread panicked"))
            .collect();
        let names: Vec<String> = reports
            .iter()
            .map(|r| {
                r.backup_path
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        let unique: std::collections::HashSet<&String> = names.iter().collect();
        assert_eq!(
            unique.len(),
            names.len(),
            "并发备份文件名必须唯一: {names:?}"
        );
        assert_eq!(list_backups(&bk, &db).expect("list").len(), 4);
        // 不残留 .tmp
        assert!(list_temp_files(&bk).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn backup_keep_is_clamped_to_supported_range() {
        let root = temp_path("clamp");
        let db = root.join("grades.db");
        let bk = root.join("backup");
        std::fs::create_dir_all(&root).unwrap();
        init_db(&db).expect("init");

        // keep=0 → 至少保留 1 份
        let report = backup_database(&db, &bk, 0).expect("backup");
        assert_eq!(report.keep_policy, 1);
        assert_eq!(report.kept, 1);

        // keep 超上限 → clamp 到 BACKUP_KEEP_MAX
        let report = backup_database(&db, &bk, usize::MAX).expect("backup");
        assert_eq!(report.keep_policy, BACKUP_KEEP_MAX);
        assert_eq!(report.kept, 2); // 现有 1 份 + 新备份，未超上限不裁剪
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn list_backups_filters_by_db_stem() {
        let root = temp_path("stem_filter");
        let db = root.join("grades.db");
        let other = root.join("other.db");
        let bk = root.join("backup");
        std::fs::create_dir_all(&root).unwrap();
        init_db(&db).expect("init");
        init_db(&other).expect("init other");

        backup_database(&db, &bk, 5).expect("backup grades");
        backup_database(&other, &bk, 5).expect("backup other");

        // 只列出 grades.db 的备份，不混列 other.db 的备份
        let grades_backups = list_backups(&bk, &db).expect("list grades");
        assert_eq!(grades_backups.len(), 1);
        for p in &grades_backups {
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            assert!(
                name.starts_with("grades-") && name.ends_with(".db"),
                "{name}"
            );
            assert!(!name.starts_with("other-"), "{name}");
        }
        let other_backups = list_backups(&bk, &other).expect("list other");
        assert_eq!(other_backups.len(), 1);
        assert!(other_backups[0]
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("other-"));
        let _ = std::fs::remove_dir_all(&root);
    }

    fn list_temp_files(dir: &std::path::Path) -> Vec<PathBuf> {
        std::fs::read_dir(dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .map(|e| e.path())
                    .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("tmp"))
                    .collect()
            })
            .unwrap_or_default()
    }
}
