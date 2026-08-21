//! 凭据安全与敏感字段加密。
//!
//! 负责：
//! - 账户级主密钥获取（密钥环；测试模式使用进程内测试密钥）
//! - AES/HMAC 版本化信封的读写（通过 `crate::secret_envelope`）
//! - 旧 Base64 密码列 → 密钥环的显式迁移（`migrate_session_passwords_v2`）
//! - 明文 Cookie/Token → 加密信封的显式迁移（`migrate_session_secrets_v1`）
//!
//! 安全约束：
//! - 敏感字段只允许以加密信封落库，严禁明文回退；
//! - 迁移是显式操作（用户确认 + 回滚备份），启动时绝不自动执行。

use rusqlite::{params, Result, TransactionBehavior};
use std::path::Path;

use super::connection::open_connection;
use super::migrations::{ensure_user_session_columns, migrate_auth_cookie_v2_table};

/// 从 DB 占位列或密钥环（含旧版 Base64 迁移）解析会话密码。
pub(crate) fn resolve_session_password(student_id: &str, encrypted: &str) -> String {
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

pub(crate) fn load_password_from_keyring_or_remembered(student_id: &str) -> String {
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
pub(crate) fn try_persist_password_to_keyring(student_id: &str, password: &str) -> bool {
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
pub(crate) fn session_secret_key(
    student_id: &str,
    create: bool,
) -> std::result::Result<[u8; 32], String> {
    if create {
        crate::credential_store::load_or_create_secret_key(student_id)
    } else {
        crate::credential_store::load_secret_key(student_id)
            .ok_or_else(|| "账户敏感字段主密钥不可用".to_string())
    }
}

#[cfg(test)]
pub(crate) fn session_secret_key(
    student_id: &str,
    _create: bool,
) -> std::result::Result<[u8; 32], String> {
    use rand::RngCore;
    use sha2::{Digest, Sha256};
    use std::sync::OnceLock;

    if student_id.trim().is_empty() {
        return Err("学号无效".to_string());
    }

    static TEST_MASTER_KEY: OnceLock<[u8; 32]> = OnceLock::new();
    let master_key = TEST_MASTER_KEY.get_or_init(|| {
        let mut key = [0_u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        key
    });
    let mut hasher = Sha256::new();
    hasher.update(master_key);
    hasher.update(student_id.trim().as_bytes());
    Ok(hasher.finalize().into())
}

pub(crate) fn encrypt_session_secret(
    student_id: &str,
    value: &str,
) -> std::result::Result<String, String> {
    if value.is_empty() {
        return Ok(String::new());
    }
    let key = session_secret_key(student_id, true)?;
    crate::secret_envelope::encrypt_string(&key, value).map_err(|error| error.to_string())
}

pub(crate) fn protect_session_secret(student_id: &str, value: &str, field: &str) -> String {
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

pub(crate) fn reveal_session_secret(student_id: &str, stored: &str, field: &str) -> String {
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
///
/// 每行归类统计（#659 根因 4）：NULL/坏行进入自愈分支并计入 report，
/// 不再被 `rows.flatten()` 静默吞掉。
#[derive(Debug, Clone, Default)]
pub struct CredMigrateReport {
    /// 扫描的 user_sessions 行数
    pub scanned: usize,
    /// encrypted_password IS NULL 的历史空壳行：置 '' 自愈（行不删除，各 reader 可读）
    pub null_shell_repaired: usize,
    /// KEYRING_MARKER（或空串）且密钥环可恢复
    pub keyring_marker_valid: usize,
    /// base64 密码迁移进密钥环成功（落 KEYRING_MARKER）
    pub base64_migrated: usize,
    /// 密钥环不可用：保留 base64，并写入 remembered 兜底
    pub keyring_unavailable: usize,
    /// KEYRING 空壳且密钥环不可恢复，需用户手动登录
    pub empty_shells: usize,
    /// 行数据不可读/学号非法（保留原行不覆盖）
    pub malformed_error: usize,
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
    // 契约化读取：student_id 主键按 Option 容错；encrypted_password 保留 Option
    // 以区分「NULL 空壳自愈」与「字面空串」，NULL 行不再让 query_map 报错。
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?.unwrap_or_default(),
            row.get::<_, Option<String>>(1)?,
        ))
    })?;

    for row in rows {
        let (sid, enc_opt) = match row {
            Ok(pair) => pair,
            Err(error) => {
                // 不再 flatten 吞错：坏行保留原样、计入 malformed_error 并输出（#659）
                report.malformed_error += 1;
                eprintln!("[db] cred_migrate_v2 行读取失败（保留原行不覆盖）: {error}");
                continue;
            }
        };
        report.scanned += 1;
        let sid = sid.trim().to_string();
        if sid.is_empty() {
            report.malformed_error += 1;
            eprintln!("[db] cred_migrate_v2: 空学号行，跳过");
            continue;
        }

        // NULL 空壳自愈：写入 '' 使所有 reader 可读（#659），不删除行。
        let enc = match enc_opt {
            Some(value) => value,
            None => {
                conn.execute(
                    "UPDATE user_sessions SET encrypted_password = '' WHERE student_id = ?1",
                    params![sid],
                )?;
                report.null_shell_repaired += 1;
                String::new()
            }
        };

        if enc == KEYRING_MARKER || enc.is_empty() {
            let from_ring = load_password_from_keyring_or_remembered(&sid);
            if !from_ring.is_empty() {
                report.keyring_marker_valid += 1;
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
                report.base64_migrated += 1;
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
                report.keyring_unavailable += 1;
            }
            continue;
        }

        // 无法识别的列：不覆盖，计为空壳引导
        report.empty_shells += 1;
    }

    super::migrations::ensure_schema_migration(
        &conn,
        4,
        "cred_migrate_v2: base64→keyring with base64 fallback",
    )?;

    eprintln!(
        "[db] cred_migrate_v2 done scanned={} null_shell_repaired={} keyring_marker_valid={} base64_migrated={} keyring_unavailable={} empty_shells={} malformed_error={}",
        report.scanned,
        report.null_shell_repaired,
        report.keyring_marker_valid,
        report.base64_migrated,
        report.keyring_unavailable,
        report.empty_shells,
        report.malformed_error
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
    migrate_auth_cookie_v2_table(&conn)?;

    let session_rows = {
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
    let auth_cookie_rows = {
        let mut stmt = conn.prepare(
            "SELECT student_id, domain, cookie_json FROM auth_cookie_v2 ORDER BY student_id, domain",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2).unwrap_or_default(),
            ))
        })?;
        mapped.collect::<Result<Vec<_>>>()?
    };
    let platform_rows = {
        let mut stmt = conn.prepare(
            "SELECT student_id, platform, cookie_blob FROM online_learning_platform_state \
             ORDER BY student_id, platform",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2).unwrap_or_default(),
            ))
        })?;
        mapped.collect::<Result<Vec<_>>>()?
    };

    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut report = SessionSecretMigrationReport::default();
    for (student_id, cookies, token, refresh_token) in session_rows {
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

    for (student_id, domain, cookie_json) in auth_cookie_rows {
        report.scanned += 1;
        if cookie_json.is_empty() || crate::secret_envelope::is_encrypted_secret(&cookie_json) {
            report.already_encrypted += 1;
            continue;
        }
        let Ok(protected) = encrypt_session_secret(&student_id, &cookie_json) else {
            report.failed += 1;
            continue;
        };
        tx.execute(
            "UPDATE auth_cookie_v2 SET cookie_json = ?1, updated_at = CURRENT_TIMESTAMP \
             WHERE student_id = ?2 AND domain = ?3",
            params![protected, student_id, domain],
        )?;
        report.migrated += 1;
    }

    for (student_id, platform, cookie_blob) in platform_rows {
        report.scanned += 1;
        if cookie_blob.is_empty() || crate::secret_envelope::is_encrypted_secret(&cookie_blob) {
            report.already_encrypted += 1;
            continue;
        }
        let Ok(protected) = encrypt_session_secret(&student_id, &cookie_blob) else {
            report.failed += 1;
            continue;
        };
        tx.execute(
            "UPDATE online_learning_platform_state SET cookie_blob = ?1, updated_at = CURRENT_TIMESTAMP \
             WHERE student_id = ?2 AND platform = ?3",
            params![protected, student_id, platform],
        )?;
        report.migrated += 1;
    }

    tx.commit()?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::db_impl::connection::open_connection;
    use crate::db::db_impl::migrations::init_db;
    use crate::db::db_impl::repositories::session::{get_user_session, save_user_session};
    use base64::Engine;
    use std::path::PathBuf;
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
        assert!(report.base64_migrated + report.keyring_unavailable >= 1);

        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.password, password);
        let _ = std::fs::remove_file(&path);
    }

    /// encrypted_password IS NULL 的历史行：凭据迁移必须自愈而非被 flatten 吞掉，
    /// 行不消失、任何 reader 可读（#659 必测 4 对应）。
    #[test]
    fn migrate_v2_repairs_null_password_shell_rows() {
        let path = temp_db_path("migrate_null");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "null-shell-0001";
        {
            let conn = open_connection(&path).unwrap();
            // 等价 v1.4.4 空壳：只写 student_id + cookies，encrypted_password IS NULL
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies) VALUES (?1, 'c=1')",
                params![sid],
            )
            .unwrap();
        }

        let report = migrate_session_passwords_v2(&path).expect("migrate");
        assert!(report.scanned >= 1);
        assert!(
            report.null_shell_repaired >= 1,
            "null_shell_repaired={}",
            report.null_shell_repaired
        );
        assert_eq!(report.malformed_error, 0);

        // 行未消失；NULL 已自愈为 ''，reader 正常可读
        let conn = open_connection(&path).unwrap();
        let enc: String = conn
            .query_row(
                "SELECT encrypted_password FROM user_sessions WHERE student_id = ?1",
                params![sid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(enc, "");
        drop(conn);

        let session = get_user_session(&path, sid).unwrap().expect("session");
        assert_eq!(session.password, "");
        assert_eq!(session.cookies, "c=1");
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

    #[test]
    fn legacy_secret_migration_is_explicit_and_idempotent() {
        let path = temp_db_path("secret_migration");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "phase4-user-b";
        let legacy_cookie = test_password("legacy-cookie");
        let legacy_access = test_password("legacy-access");
        let legacy_refresh = test_password("legacy-refresh");
        {
            let conn = open_connection(&path).expect("open");
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password, one_code_token, electricity_refresh_token) VALUES (?1, ?2, '', ?3, ?4)",
                params![sid, legacy_cookie, legacy_access, legacy_refresh],
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
        assert_eq!(before, legacy_cookie);

        let report = migrate_session_secrets_v1(&path).expect("migrate");
        assert_eq!(report.migrated, 1);
        let second = migrate_session_secrets_v1(&path).expect("migrate twice");
        assert_eq!(second.already_encrypted, 1);
        let session = get_user_session(&path, sid).expect("get").expect("session");
        assert_eq!(session.cookies, legacy_cookie);
        assert_eq!(session.one_code_token, legacy_access);
        assert_eq!(session.refresh_token, legacy_refresh);
        let _ = std::fs::remove_file(path);
    }

    /// 篡改拒绝端到端：写会话后手工篡改 DB 中的 cookies 信封，
    /// 读取必须返回空串（拒绝返回篡改后的明文），且不 panic。
    #[test]
    fn tampered_envelope_is_rejected_on_read() {
        let path = temp_db_path("tamper");
        let _ = std::fs::remove_file(&path);
        init_db(&path).expect("init");
        let sid = "tamper-user-1";
        let cookies = test_password("tamper-cookie");
        let empty = String::new();
        save_user_session(&path, sid, &cookies, &empty, &empty, None, None).expect("save");

        // 篡改 DB 中的信封（翻转最后一个字符）
        {
            let conn = open_connection(&path).expect("open");
            let raw: String = conn
                .query_row(
                    "SELECT cookies FROM user_sessions WHERE student_id = ?1",
                    params![sid],
                    |row| row.get(0),
                )
                .expect("raw");
            assert!(crate::secret_envelope::is_encrypted_secret(&raw));
            let mut bytes = raw.into_bytes();
            let last = bytes.len() - 2;
            bytes[last] = if bytes[last] == b'A' { b'B' } else { b'A' };
            let tampered = String::from_utf8(bytes).expect("utf8");
            conn.execute(
                "UPDATE user_sessions SET cookies = ?1 WHERE student_id = ?2",
                params![tampered, sid],
            )
            .expect("tamper write");
        }

        let session = get_user_session(&path, sid).expect("get").expect("session");
        // 完整性校验失败：拒绝返回篡改明文，而不是回退明文
        assert_eq!(session.cookies, "");
        let _ = std::fs::remove_file(&path);
    }
}
