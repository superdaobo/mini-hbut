//! 用户会话仓储（user_sessions 表）。
//!
//! 密码只写系统密钥环，失败时不再以 Base64 或明文落库；cookies / token 以
//! 版本化加密信封落库（`credential` 模块），读取时按学号隔离解密。

use rusqlite::{params, Result};
use std::path::Path;

use super::super::connection::open_connection;
use super::super::credential::{
    protect_session_secret, resolve_session_password, reveal_session_secret,
    try_persist_password_to_keyring,
};
use super::super::migrations::ensure_user_session_columns;

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

/// user_sessions 业务列统一 NULL 契约（#659 根因 1）。
///
/// cookies / encrypted_password / one_code_token / electricity_refresh_token /
/// electricity_token_expires_at 一律按 `Option<String>` 读取：库中 NULL
/// （v1.4.4 空壳行等历史形态）→ 空串，业务层对外类型不变（仍为 String），
/// 绝不抛出 rusqlite `InvalidColumnType`。
#[derive(Debug, Clone, Default)]
struct UserSessionRow {
    cookies: String,
    encrypted_password: String,
    one_code_token: String,
    electricity_refresh_token: String,
    electricity_token_expires_at: String,
}

fn text_or_empty(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<String> {
    Ok(row.get::<_, Option<String>>(index)?.unwrap_or_default())
}

/// 收敛所有 user_sessions reader 的列映射（单点实现，禁止零散补丁）。
/// `offset` 为业务列在 SELECT 中的起始索引：`get_user_session` 为 0，
/// `get_latest_user_session` 在 student_id 之后为 1。
fn map_user_session_row(
    row: &rusqlite::Row<'_>,
    offset: usize,
) -> rusqlite::Result<UserSessionRow> {
    Ok(UserSessionRow {
        cookies: text_or_empty(row, offset)?,
        encrypted_password: text_or_empty(row, offset + 1)?,
        one_code_token: text_or_empty(row, offset + 2)?,
        electricity_refresh_token: text_or_empty(row, offset + 3)?,
        electricity_token_expires_at: text_or_empty(row, offset + 4)?,
    })
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
        let row = map_user_session_row(row, 0)?;
        let password = resolve_session_password(student_id, &row.encrypted_password);

        Ok(Some(UserSessionData {
            cookies: reveal_session_secret(student_id, &row.cookies, "cookies"),
            password,
            one_code_token: reveal_session_secret(
                student_id,
                &row.one_code_token,
                "one_code_token",
            ),
            refresh_token: reveal_session_secret(
                student_id,
                &row.electricity_refresh_token,
                "electricity_refresh_token",
            ),
            token_expires_at: row.electricity_token_expires_at,
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
        let row = map_user_session_row(row, 1)?;
        let password = resolve_session_password(&student_id, &row.encrypted_password);

        Ok(Some(LatestUserSessionData {
            cookies: reveal_session_secret(&student_id, &row.cookies, "cookies"),
            password,
            one_code_token: reveal_session_secret(
                &student_id,
                &row.one_code_token,
                "one_code_token",
            ),
            refresh_token: reveal_session_secret(
                &student_id,
                &row.electricity_refresh_token,
                "electricity_refresh_token",
            ),
            student_id,
            token_expires_at: row.electricity_token_expires_at,
        }))
    } else {
        Ok(None)
    }
}

/// 仅更新电费授权相关字段（access/refresh/expire）
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
    // 新行 INSERT 分支补齐契约非空列默认（cookies/encrypted_password = ''），
    // 保证历史/新行任何 reader 均可读（#659）。ON CONFLICT 更新不触碰这些列的已有值。
    conn.execute(
        "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token, electricity_refresh_token, electricity_token_expires_at, electricity_token_updated_at, last_login)
         VALUES (?1, '', '', ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    // 新行 INSERT 分支补齐契约非空列默认（encrypted_password/one_code_token 等 = ''），
    // 保证任何 reader 可读（#659）。ON CONFLICT 更新只动 cookies/last_login。
    conn.execute(
        "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token, electricity_refresh_token, electricity_token_expires_at, last_login)
         VALUES (?1, ?2, '', '', '', '', CURRENT_TIMESTAMP)
         ON CONFLICT(student_id) DO UPDATE SET
           cookies = CASE WHEN excluded.cookies <> '' THEN excluded.cookies ELSE user_sessions.cookies END,
           last_login = CURRENT_TIMESTAMP",
        params![sid, protected_cookies],
    )?;
    Ok(())
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
    super::super::cache::run_blocking(move || get_user_session(path, &sid)).await
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
    super::super::cache::run_blocking(move || {
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
mod tests {
    use super::*;
    use crate::db::db_impl::credential::load_password_from_keyring_or_remembered;
    use crate::db::db_impl::migrations::init_db;
    use base64::Engine;
    use std::path::PathBuf;
    use std::sync::{Arc, Barrier};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("mini_hbut_sess_{label}_{nanos}.db"))
    }

    /// 运行时构造测试值，避免在测试源码中固化明文密码学值。
    fn test_value(label: &str) -> String {
        format!("{label}-{}", std::process::id())
    }

    /// 会话字段加密落库 + 读取 roundtrip（凭据 roundtrip 兼容测试）。
    #[test]
    fn session_secrets_encrypt_and_roundtrip() {
        let path = temp_db_path("roundtrip");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "phase4-user-a";
        let cookies = test_value("cookie");
        let access_token = test_value("access");
        let refresh_token = test_value("refresh");
        let password = String::new();
        save_user_session(
            &path,
            sid,
            &cookies,
            &password,
            &access_token,
            Some(&refresh_token),
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
        assert_eq!(session.cookies, cookies);
        assert_eq!(session.one_code_token, access_token);
        assert_eq!(session.refresh_token, refresh_token);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn concurrent_cookies_only_upserts_never_lose_fields() {
        let path = temp_db_path("cookies_concur");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510232001";
        let seed_password = test_value("encoded-password");
        let seed_token = test_value("one-code-token");
        let seed_refresh = test_value("refresh-token");
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
            handles.push(std::thread::spawn(move || {
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
        let seed_password = test_value("password");
        let seed_token = test_value("token");
        let seed_refresh = test_value("refresh");
        let seed_expiry = test_value("expiry");
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
            handles.push(std::thread::spawn(move || {
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
        let expected_password = load_password_from_keyring_or_remembered(sid);
        assert!(expected_password.is_empty() || expected_password == seed_password);
        assert_eq!(session.password, expected_password);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn cookies_only_update_preserves_token_and_password() {
        let path = temp_db_path("cookies_only");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");

        let sid = "2510231002";
        let password = test_value("keep-me");
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

    /// v1.4.4 历史空壳形态（INSERT 只写 student_id + last_login，其余业务列 NULL）：
    /// init_db 幂等重跑触发 normalize 自愈后，任何 reader 可读、不抛
    /// InvalidColumnType；无凭据语义正确（password/cookies 空串 → 上层需手动登录）。
    #[test]
    fn v144_null_shell_row_readable_after_init_db() {
        let path = temp_db_path("v144_shell");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "hist-v144-0001";
        {
            let conn = open_connection(&path).unwrap();
            conn.execute(
                "INSERT INTO user_sessions (student_id, last_login) VALUES (?1, CURRENT_TIMESTAMP)",
                params![sid],
            )
            .unwrap();
        }

        // 迁移（init_db 启动路径）不报错，且自愈 NULL
        init_db(&path).expect("re-init heal");

        let session = get_user_session(&path, sid).expect("get").expect("session");
        assert_eq!(session.cookies, "");
        assert_eq!(session.password, "");
        assert_eq!(session.one_code_token, "");
        assert_eq!(session.refresh_token, "");
        assert_eq!(session.token_expires_at, "");

        let latest = get_latest_user_session(&path)
            .expect("get latest")
            .expect("latest");
        assert_eq!(latest.student_id, sid);
        assert_eq!(latest.cookies, "");
        assert_eq!(latest.password, "");
        let _ = std::fs::remove_file(&path);
    }

    /// cookies-only UPSERT 在空库写新行：补齐契约列默认，各 reader 可读（#659 必测 3）。
    #[test]
    fn cookies_only_upsert_creates_readable_new_row() {
        let path = temp_db_path("cookies_new");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "fresh-cookies-0001";
        update_user_session_cookies_only(&path, sid, "Code: a=1 | Auth: b=2").expect("upsert");

        let session = get_user_session(&path, sid).expect("get").expect("session");
        assert!(session.cookies.contains("Code: a=1"));
        assert_eq!(session.password, "");
        assert_eq!(session.one_code_token, "");

        let latest = get_latest_user_session(&path)
            .expect("latest")
            .expect("row");
        assert_eq!(latest.student_id, sid);
        assert!(latest.cookies.contains("Code: a=1"));
        assert_eq!(latest.password, "");
        let _ = std::fs::remove_file(&path);
    }

    /// electricity-only UPSERT 在空库写新行：补齐契约列默认，各 reader 可读（#659 必测 5）。
    #[test]
    fn electricity_tokens_upsert_creates_readable_new_row() {
        let path = temp_db_path("electricity_new");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "fresh-elec-0001";
        let access = test_value("access");
        let refresh = test_value("refresh");
        save_electricity_tokens(&path, sid, &access, &refresh, "2099-01-01T00:00:00Z")
            .expect("upsert");

        let session = get_user_session(&path, sid).expect("get").expect("session");
        assert_eq!(session.one_code_token, access);
        assert_eq!(session.refresh_token, refresh);
        assert_eq!(session.cookies, "");
        assert_eq!(session.password, "");

        let latest = get_latest_user_session(&path)
            .expect("latest")
            .expect("row");
        assert_eq!(latest.student_id, sid);
        assert_eq!(latest.one_code_token, access);
        assert_eq!(latest.cookies, "");
        let _ = std::fs::remove_file(&path);
    }
}
