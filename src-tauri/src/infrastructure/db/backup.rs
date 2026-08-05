//! 数据库备份与恢复。
//!
//! 设计约束（#550）：
//! - 备份是显式操作（函数或 tauri command），绝不自动恢复、绝不覆盖正式库；
//! - 备份只写入指定的 backup 子目录，文件名带 时间戳(毫秒)+pid+进程内原子序号，
//!   同秒/同毫秒连续或并发备份时也保证唯一；
//! - 先写临时文件，完成后 integrity_check 通过再 rename，保证任一时刻磁盘上
//!   只有完整备份（原子命名）；任何失败都清理临时文件，不残留 .tmp；
//! - 备份内容包含用户会话 cookies/令牌与本地缓存数据，属于敏感文件，用户须
//!   妥善保护（详见 docs/architecture/phase3-convergence.md）；
//! - 有限保留：只保留最近 `keep` 份（clamp 到 1..=BACKUP_KEEP_MAX），超出部分
//!   按文件名（时间戳前缀）删除最旧的；
//! - 加密备份（`backup_database_encrypted`）只把密文写入目标目录，明文 SQLite
//!   只存在于本次调用创建的 staging 目录中，完成或失败都会清理。

use chrono::Local;
use rusqlite::{Connection, Result};
use std::path::{Path, PathBuf};

use super::connection::{busy_timeout_error, io_to_rusqlite_err, resolve_db_path};

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

#[cfg(test)]
mod tests {
    use super::*;
    use rand::RngCore;
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
        super::super::migrations::init_db(&db).expect("init");

        // 写入真实数据：grades + user_sessions + cache
        let sid = "2510233001";
        {
            let conn = super::super::connection::open_connection(&db).unwrap();
            conn.execute(
                "INSERT INTO grades (term, course_name, final_score) VALUES ('2025-1', '高数', '95')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO user_sessions (student_id, cookies, encrypted_password)
                 VALUES (?1, 'c=1', 'b64')",
                rusqlite::params![sid],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO grades_cache (student_id, data, sync_time) VALUES (?1, '{}', '2025-01-01')",
                rusqlite::params![sid],
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
        super::super::migrations::init_db(&db).expect("init");

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
        super::super::migrations::init_db(&db).expect("init");
        // 预置少量数据
        {
            let conn = super::super::connection::open_connection(&db).unwrap();
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
        super::super::migrations::init_db(&db).expect("init");

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
        super::super::migrations::init_db(&db).expect("init");
        super::super::migrations::init_db(&other).expect("init other");

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

    /// 加密备份 → 恢复：恢复目标必须不存在；错误密钥必须被拒绝。
    #[test]
    fn encrypted_backup_restores_to_new_path_only() {
        let source = temp_path("backup_source");
        let backup_dir = temp_path("backup_dir");
        let restored = temp_path("backup_restore");
        let source = source.with_extension("db");
        let restored = restored.with_extension("db");
        super::super::migrations::init_db(&source).expect("init");
        super::super::cache::save_cache(
            &source,
            "calendar_public_cache",
            "phase4",
            &serde_json::json!({"ok": true}),
        )
        .expect("seed cache");
        let mut key = [0_u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        let report = backup_database_encrypted(&source, &backup_dir, 2, &key).expect("backup");
        assert!(report
            .backup_path
            .extension()
            .is_some_and(|ext| ext == "mhbbackup"));
        restore_encrypted_backup(&report.backup_path, &restored, &key).expect("restore");
        verify_backup(&restored).expect("verify restored");
        assert!(restore_encrypted_backup(&report.backup_path, &restored, &key).is_err());
        // 错误密钥恢复必须失败（完整性校验拒绝）
        let mut wrong_key = [0_u8; 32];
        rand::thread_rng().fill_bytes(&mut wrong_key);
        let other = temp_path("backup_restore_wrong").with_extension("db");
        assert!(restore_encrypted_backup(&report.backup_path, &other, &wrong_key).is_err());
        assert!(!other.exists());
        let _ = std::fs::remove_file(source);
        let _ = std::fs::remove_file(restored);
        let _ = std::fs::remove_dir_all(backup_dir);
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
