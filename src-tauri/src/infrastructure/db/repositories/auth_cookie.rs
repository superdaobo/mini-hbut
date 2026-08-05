//! 多域会话 Cookie 仓储（auth_cookie_v2 表，#348/#349）。
//!
//! 按 `student_id + domain` 存储 cookie JSON 数组，写入时加密信封保护，
//! 读取时按学号解密（账户隔离）。

use rusqlite::{params, Result};
use std::path::Path;

use super::super::connection::open_connection;
use super::super::credential::{protect_session_secret, reveal_session_secret};
use super::super::migrations::migrate_auth_cookie_v2_table;
use super::session::get_latest_user_session;

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
    let protected_cookie_json =
        protect_session_secret(sid, cookie_json, "auth_cookie_v2.cookie_json");
    conn.execute(
        "INSERT INTO auth_cookie_v2 (student_id, domain, cookie_json, updated_at, source)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, ?4)
         ON CONFLICT(student_id, domain) DO UPDATE SET
           cookie_json = CASE WHEN excluded.cookie_json <> '' THEN excluded.cookie_json ELSE auth_cookie_v2.cookie_json END,
           updated_at = CURRENT_TIMESTAMP,
           source = excluded.source",
        params![sid, dom, protected_cookie_json, source],
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
        let protected_cookie_json =
            protect_session_secret(sid, cookie_json, "auth_cookie_v2.cookie_json");
        tx.execute(
            "INSERT INTO auth_cookie_v2 (student_id, domain, cookie_json, updated_at, source)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, ?4)
             ON CONFLICT(student_id, domain) DO UPDATE SET
               cookie_json = CASE WHEN excluded.cookie_json <> '' THEN excluded.cookie_json ELSE auth_cookie_v2.cookie_json END,
               updated_at = CURRENT_TIMESTAMP,
               source = excluded.source",
            params![sid, dom, protected_cookie_json, source],
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
    for mut record in rows.flatten() {
        record.cookie_json =
            reveal_session_secret(sid, &record.cookie_json, "auth_cookie_v2.cookie_json");
        if !record.cookie_json.trim().is_empty() && record.cookie_json.trim() != "[]" {
            out.push(record);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::db_impl::migrations::init_db;
    use crate::db::db_impl::repositories::session::{
        get_user_session, update_user_session_cookies_only,
    };
    use base64::Engine;
    use std::path::PathBuf;
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

        let raw_cookie: String = open_connection(&path)
            .expect("open")
            .query_row(
                "SELECT cookie_json FROM auth_cookie_v2 WHERE student_id = ?1 LIMIT 1",
                params![sid],
                |row| row.get(0),
            )
            .expect("raw cookie");
        assert!(raw_cookie.starts_with(crate::secret_envelope::SECRET_ENVELOPE_PREFIX));

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
