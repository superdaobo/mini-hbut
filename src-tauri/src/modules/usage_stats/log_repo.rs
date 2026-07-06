//! 本地试用频率统计持久化。

use chrono::{Local, TimeZone};
use rusqlite::{params, Connection, Result};

use super::types::{
    UsageDailyTrendRow, UsageDeviceProfileInput, UsageEventInput, UsageLoadModeRow,
    UsagePendingUploadBatch, UsagePersonalSummary, UsageSessionInput, UsageTodaySummary,
    UsageCountRow,
};

const RETENTION_DAYS: i64 = 180;

fn stat_date_from_ms(ms: i64) -> String {
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string())
}

fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn start_of_today_ms() -> i64 {
    let now = Local::now();
    now.date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|dt| Local.from_local_datetime(&dt).single())
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

fn upsert_daily_rollup(
    conn: &Connection,
    student_id: &str,
    stat_date: &str,
    target_kind: &str,
    target_id: &str,
    load_mode: &str,
    open_delta: i64,
    duration_delta: i64,
) -> Result<()> {
    if open_delta <= 0 && duration_delta <= 0 {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO app_usage_daily_rollup (
            student_id, stat_date, target_kind, target_id, load_mode,
            open_count, duration_ms_total, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(student_id, stat_date, target_kind, target_id, load_mode) DO UPDATE SET
            open_count = open_count + excluded.open_count,
            duration_ms_total = duration_ms_total + excluded.duration_ms_total,
            updated_at = excluded.updated_at",
        params![
            student_id,
            stat_date,
            target_kind,
            target_id,
            load_mode,
            open_delta.max(0),
            duration_delta.max(0),
            chrono::Utc::now().timestamp_millis()
        ],
    )?;
    Ok(())
}

fn apply_event_rollup(conn: &Connection, event: &UsageEventInput) -> Result<()> {
    let stat_date = stat_date_from_ms(event.occurred_at);
    let event_type = event.event_type.as_str();
    let open_delta = if matches!(event_type, "view_open" | "module_open" | "app_foreground") {
        1
    } else {
        0
    };
    let duration_delta = if event.duration_ms > 0
        && matches!(event_type, "view_close" | "module_close" | "app_background")
    {
        event.duration_ms
    } else {
        0
    };
    upsert_daily_rollup(
        conn,
        &event.student_id,
        &stat_date,
        &event.target_kind,
        &event.target_id,
        &event.load_mode,
        open_delta,
        duration_delta,
    )
}

fn cleanup_old_events(conn: &Connection, student_id: &str) -> Result<()> {
    let cutoff = chrono::Utc::now().timestamp_millis() - RETENTION_DAYS * 86_400_000;
    conn.execute(
        "DELETE FROM app_usage_events
         WHERE student_id = ?1 AND occurred_at < ?2 AND uploaded_at IS NOT NULL",
        params![student_id, cutoff],
    )?;
    Ok(())
}

pub fn append_event(conn: &Connection, event: &UsageEventInput) -> Result<()> {
    conn.execute(
        "INSERT INTO app_usage_events (
            event_id, student_id, device_id, event_type, target_kind, target_id,
            load_mode, launch_mode, duration_ms, app_version, runtime, platform,
            extra_json, occurred_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            event.event_id,
            event.student_id,
            event.device_id,
            event.event_type,
            event.target_kind,
            event.target_id,
            event.load_mode,
            event.launch_mode,
            event.duration_ms.max(0),
            event.app_version,
            event.runtime,
            event.platform,
            event.extra_json,
            event.occurred_at,
        ],
    )?;
    apply_event_rollup(conn, event)?;
    cleanup_old_events(conn, &event.student_id)?;
    Ok(())
}

pub fn append_session(conn: &Connection, session: &UsageSessionInput) -> Result<()> {
    conn.execute(
        "INSERT INTO app_usage_sessions (
            session_id, student_id, device_id, started_at, ended_at, duration_ms,
            app_version, runtime, platform
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            session.session_id,
            session.student_id,
            session.device_id,
            session.started_at,
            session.ended_at,
            session.duration_ms.max(0),
            session.app_version,
            session.runtime,
            session.platform,
        ],
    )?;
    Ok(())
}

pub fn upsert_device_profile(conn: &Connection, profile: &UsageDeviceProfileInput) -> Result<()> {
    conn.execute(
        "INSERT INTO app_usage_device_profile (
            device_id, student_id, app_version, runtime, platform,
            os_version, arch, locale, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(device_id) DO UPDATE SET
            student_id = excluded.student_id,
            app_version = excluded.app_version,
            runtime = excluded.runtime,
            platform = excluded.platform,
            os_version = excluded.os_version,
            arch = excluded.arch,
            locale = excluded.locale,
            updated_at = excluded.updated_at",
        params![
            profile.device_id,
            profile.student_id,
            profile.app_version,
            profile.runtime,
            profile.platform,
            profile.os_version,
            profile.arch,
            profile.locale,
            profile.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_personal_summary(conn: &Connection, student_id: &str) -> Result<UsagePersonalSummary> {
    let today = today_key();
    let today_start = start_of_today_ms();

    let (open_count, duration_ms, module_open_count, view_open_count): (i64, i64, i64, i64) =
        conn.query_row(
            "SELECT
                COALESCE(SUM(open_count), 0),
                COALESCE(SUM(duration_ms_total), 0),
                COALESCE(SUM(CASE WHEN target_kind = 'module' THEN open_count ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN target_kind = 'view' THEN open_count ELSE 0 END), 0)
             FROM app_usage_daily_rollup
             WHERE student_id = ?1 AND stat_date = ?2",
            params![student_id, today],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap_or((0, 0, 0, 0));

    let mut top_modules_stmt = conn.prepare(
        "SELECT target_id, COUNT(*) AS open_count, COALESCE(SUM(duration_ms), 0) AS duration_ms
         FROM app_usage_events
         WHERE student_id = ?1
           AND target_kind = 'module'
           AND event_type = 'module_open'
           AND occurred_at >= ?2
         GROUP BY target_id
         ORDER BY open_count DESC, duration_ms DESC
         LIMIT 5",
    )?;
    let top_modules = top_modules_stmt
        .query_map(params![student_id, today_start], |row| {
            Ok(UsageCountRow {
                target_id: row.get(0)?,
                open_count: row.get(1)?,
                duration_ms_total: row.get(2)?,
            })
        })?
        .filter_map(|item| item.ok())
        .collect::<Vec<_>>();

    let mut load_mode_stmt = conn.prepare(
        "SELECT load_mode, COUNT(*) AS open_count
         FROM app_usage_events
         WHERE student_id = ?1
           AND event_type IN ('view_open', 'module_open')
           AND occurred_at >= ?2
         GROUP BY load_mode
         ORDER BY open_count DESC",
    )?;
    let load_mode_split = load_mode_stmt
        .query_map(params![student_id, today_start], |row| {
            Ok(UsageLoadModeRow {
                load_mode: row.get(0)?,
                open_count: row.get(1)?,
            })
        })?
        .filter_map(|item| item.ok())
        .collect::<Vec<_>>();

    let mut trend_stmt = conn.prepare(
        "SELECT stat_date,
                COALESCE(SUM(open_count), 0),
                COALESCE(SUM(duration_ms_total), 0)
         FROM app_usage_daily_rollup
         WHERE student_id = ?1
           AND stat_date >= date('now', '-6 day')
         GROUP BY stat_date
         ORDER BY stat_date ASC",
    )?;
    let daily_trend = trend_stmt
        .query_map(params![student_id], |row| {
            Ok(UsageDailyTrendRow {
                stat_date: row.get(0)?,
                open_count: row.get(1)?,
                duration_ms: row.get(2)?,
            })
        })?
        .filter_map(|item| item.ok())
        .collect::<Vec<_>>();

    Ok(UsagePersonalSummary {
        today: UsageTodaySummary {
            stat_date: today,
            open_count,
            duration_ms,
            module_open_count,
            view_open_count,
        },
        top_modules,
        load_mode_split,
        daily_trend,
    })
}

pub fn list_pending_upload(
    conn: &Connection,
    student_id: &str,
    device_id: &str,
    limit: u32,
) -> Result<UsagePendingUploadBatch> {
    let safe_limit = limit.clamp(1, 500);

    let mut events_stmt = conn.prepare(
        "SELECT event_id, student_id, device_id, event_type, target_kind, target_id,
                load_mode, launch_mode, duration_ms, app_version, runtime, platform,
                extra_json, occurred_at
         FROM app_usage_events
         WHERE student_id = ?1 AND device_id = ?2 AND uploaded_at IS NULL
         ORDER BY occurred_at ASC
         LIMIT ?3",
    )?;
    let events = events_stmt
        .query_map(params![student_id, device_id, safe_limit], |row| {
            Ok(UsageEventInput {
                event_id: row.get(0)?,
                student_id: row.get(1)?,
                device_id: row.get(2)?,
                event_type: row.get(3)?,
                target_kind: row.get(4)?,
                target_id: row.get(5)?,
                load_mode: row.get(6)?,
                launch_mode: row.get(7)?,
                duration_ms: row.get(8)?,
                app_version: row.get(9)?,
                runtime: row.get(10)?,
                platform: row.get(11)?,
                extra_json: row.get(12)?,
                occurred_at: row.get(13)?,
            })
        })?
        .filter_map(|item| item.ok())
        .collect::<Vec<_>>();

    let mut sessions_stmt = conn.prepare(
        "SELECT session_id, student_id, device_id, started_at, ended_at, duration_ms,
                app_version, runtime, platform
         FROM app_usage_sessions
         WHERE student_id = ?1 AND device_id = ?2 AND uploaded_at IS NULL
         ORDER BY started_at ASC
         LIMIT ?3",
    )?;
    let sessions = sessions_stmt
        .query_map(params![student_id, device_id, safe_limit], |row| {
            Ok(UsageSessionInput {
                session_id: row.get(0)?,
                student_id: row.get(1)?,
                device_id: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                duration_ms: row.get(5)?,
                app_version: row.get(6)?,
                runtime: row.get(7)?,
                platform: row.get(8)?,
            })
        })?
        .filter_map(|item| item.ok())
        .collect::<Vec<_>>();

    let device_profile = conn
        .query_row(
            "SELECT device_id, student_id, app_version, runtime, platform,
                    os_version, arch, locale, updated_at
             FROM app_usage_device_profile
             WHERE device_id = ?1 AND student_id = ?2
             LIMIT 1",
            params![device_id, student_id],
            |row| {
                Ok(UsageDeviceProfileInput {
                    device_id: row.get(0)?,
                    student_id: row.get(1)?,
                    app_version: row.get(2)?,
                    runtime: row.get(3)?,
                    platform: row.get(4)?,
                    os_version: row.get(5)?,
                    arch: row.get(6)?,
                    locale: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .ok();

    Ok(UsagePendingUploadBatch {
        events,
        sessions,
        device_profile,
    })
}

pub fn mark_uploaded(
    conn: &Connection,
    event_ids: &[String],
    session_ids: &[String],
    uploaded_at: i64,
) -> Result<()> {
    for event_id in event_ids {
        conn.execute(
            "UPDATE app_usage_events SET uploaded_at = ?2 WHERE event_id = ?1",
            params![event_id, uploaded_at],
        )?;
    }
    for session_id in session_ids {
        conn.execute(
            "UPDATE app_usage_sessions SET uploaded_at = ?2 WHERE session_id = ?1",
            params![session_id, uploaded_at],
        )?;
    }
    Ok(())
}
