//! 本地试用频率统计 — Tauri 命令层。

use crate::db;

use super::log_repo;
use super::types::{
    UsageDeviceProfileInput, UsageEventInput, UsagePersonalSummary, UsagePendingUploadBatch,
    UsageSessionInput,
};

const DB_FILENAME: &str = "grades.db";

fn db_conn() -> Result<rusqlite::Connection, String> {
    db::open_db_connection(DB_FILENAME).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn usage_stats_record_event(event: UsageEventInput) -> Result<bool, String> {
    let conn = db_conn()?;
    log_repo::append_event(&conn, &event).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn usage_stats_end_session(session: UsageSessionInput) -> Result<bool, String> {
    let conn = db_conn()?;
    log_repo::append_session(&conn, &session).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn usage_stats_upsert_device_profile(profile: UsageDeviceProfileInput) -> Result<bool, String> {
    let conn = db_conn()?;
    log_repo::upsert_device_profile(&conn, &profile).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn usage_stats_get_personal_summary(student_id: String) -> Result<UsagePersonalSummary, String> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    let conn = db_conn()?;
    log_repo::get_personal_summary(&conn, sid).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn usage_stats_list_pending_upload(
    student_id: String,
    device_id: String,
    limit: Option<u32>,
) -> Result<UsagePendingUploadBatch, String> {
    let sid = student_id.trim();
    let did = device_id.trim();
    if sid.is_empty() || did.is_empty() {
        return Err("student_id 与 device_id 不能为空".to_string());
    }
    let conn = db_conn()?;
    log_repo::list_pending_upload(&conn, sid, did, limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn usage_stats_mark_uploaded(
    event_ids: Vec<String>,
    session_ids: Vec<String>,
    uploaded_at: i64,
) -> Result<bool, String> {
    let conn = db_conn()?;
    log_repo::mark_uploaded(&conn, &event_ids, &session_ids, uploaded_at)
        .map_err(|e| e.to_string())?;
    Ok(true)
}
