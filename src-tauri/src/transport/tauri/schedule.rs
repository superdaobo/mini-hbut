//! 课表领域 Tauri commands：同步、本地读取、自定义课程、ICS 导出。

use base64::{engine::general_purpose, Engine as _};
use chrono::{Datelike, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;

use crate::app_state::AppState;
use crate::db;
use crate::transport::tauri::common::attach_sync_time;
use crate::transport::tauri::config::get_temp_upload_endpoint_config;
use crate::utils::ics::{
    escape_ics_text, fold_ics_line, parse_ics_datetime, sanitize_filename_part,
};
use crate::DB_FILENAME;
use crate::DEFAULT_TEMP_UPLOAD_ENDPOINT;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleCourse {
    pub id: String,
    pub name: String,
    pub teacher: String,
    pub room: String,
    pub room_code: String,
    pub building: String,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    pub weeks_text: String,
    pub credit: String,
    pub class_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleExportEvent {
    pub summary: String,
    pub start: String,
    pub end: String,
    pub description: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleExportRequest {
    pub student_id: Option<String>,
    pub semester: Option<String>,
    pub week: Option<i32>,
    pub events: Vec<ScheduleExportEvent>,
    pub upload_endpoint: Option<String>,
    pub ttl_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddCustomScheduleCourseRequest {
    pub student_id: String,
    pub semester: String,
    pub name: String,
    pub teacher: Option<String>,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    pub room: Option<String>,
    /// 可选用户主色 #RRGGBB；缺省/空表示未设定
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteCustomScheduleCourseRequest {
    pub student_id: String,
    pub semester: String,
    pub course_id: String,
    pub mode: Option<String>,
    pub current_week: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCustomScheduleCourseRequest {
    pub student_id: String,
    pub semester: String,
    pub course_id: String,
    pub name: String,
    pub teacher: Option<String>,
    pub weekday: i32,
    pub period: i32,
    pub djs: i32,
    pub weeks: Vec<i32>,
    pub room: Option<String>,
    /// 可选用户主色 #RRGGBB；缺省/空表示未设定
    #[serde(default)]
    pub color: Option<String>,
}

#[tauri::command]
#[allow(unreachable_code)]
pub(crate) async fn sync_schedule(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let uid = client.user_info.as_ref().map(|u| u.student_id.clone());
    let requested_semester = semester
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let explicit_semester = requested_semester.is_some();
    let schedule_context = client
        .resolve_schedule_context(requested_semester.as_deref())
        .await;
    let semester_to_query = schedule_context
        .get("semester")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| requested_semester.clone())
        .unwrap_or_else(|| "2024-2025-1".to_string());

    let result = match client
        .fetch_schedule(Some(semester_to_query.as_str()))
        .await
    {
        Ok((course_list, _now_week)) => {
            let mut meta = schedule_context;
            if let Some(map) = meta.as_object_mut() {
                map.insert("semester".to_string(), serde_json::json!(semester_to_query));
                map.insert(
                    "total_courses".to_string(),
                    serde_json::json!(course_list.len()),
                );
                map.insert(
                    "query_time".to_string(),
                    serde_json::json!(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                );
            }
            let payload = serde_json::json!({
                "success": true,
                "data": course_list,
                "meta": meta,
                "sync_time": chrono::Local::now().to_rfc3339(),
                "offline": false
            });
            if let Some(uid) = &uid {
                let _ = db::save_cache(DB_FILENAME, "schedule_cache", uid, &payload);
            }
            payload
        }
        Err(e) => {
            let msg = e.to_string();
            if crate::http_client::HbutClient::is_no_schedule_error_message(&msg) {
                return Err("暂无可用课表".to_string());
            }
            if explicit_semester {
                return Err(msg);
            }
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "schedule_cache", uid)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            return Err(msg);
        }
    };
    return Ok(result);

    // 获取当前︽（基于日期计算）
    let semester = match requested_semester {
        Some(s) => s,
        None => client
            .get_current_semester()
            .await
            .unwrap_or_else(|_| "2024-2025-1".to_string()),
    };

    // 获取″数据计算当前ㄦ和开始日?
    let calendar_data = client.fetch_calendar_data(Some(semester.clone())).await;
    let (current_week, start_date) = if let Ok(ref cal) = calendar_data {
        let meta = cal.get("meta");
        let week = meta
            .and_then(|m| m.get("current_week"))
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32;
        let start = meta
            .and_then(|m| m.get("start_date"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        (week, start)
    } else {
        (1, String::new())
    };

    match client.fetch_schedule(Some(semester.as_str())).await {
        Ok((course_list, _now_week)) => {
            // Keep response shape consistent with Python backend.
            let result = serde_json::json!({
                "success": true,
                "data": course_list,
                "meta": {
                    "semester": semester,
                    "current_week": current_week,
                    "current_weekday": chrono::Local::now().weekday().num_days_from_monday() as i32 + 1,
                    "start_date": start_date,
                    "total_courses": course_list.len(),
                    "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
                },
                "sync_time": chrono::Local::now().to_rfc3339(),
                "offline": false
            });

            if let Some(uid) = &uid {
                let _ = db::save_cache(DB_FILENAME, "schedule_cache", uid, &result);
            }

            Ok(result)
        }
        Err(e) => {
            let msg = e.to_string();
            if explicit_semester {
                let lower = msg.to_lowercase();
                if msg.contains("该学期无课表")
                    || msg.contains("无课表")
                    || msg.contains("ret=-1")
                    || lower.contains("unknown schedule")
                    || lower.contains("no schedule")
                {
                    return Err("该学期无课表，请切换学期".to_string());
                }
                if msg.contains("课表 API 返回错误")
                    || msg.contains("课表数据格式不正确")
                    || msg.contains("ret=-1")
                {
                    return Err("该学期无课表，请切换学期".to_string());
                }
                return Err(msg);
            }
            if let Some(uid) = &uid {
                if let Ok(Some((cached_data, sync_time))) =
                    db::get_cache(DB_FILENAME, "schedule_cache", uid)
                {
                    return Ok(attach_sync_time(cached_data, &sync_time, true));
                }
            }
            Err(msg)
        }
    }
}

#[tauri::command]
pub(crate) async fn get_schedule_local(
    student_id: String,
) -> Result<Option<serde_json::Value>, String> {
    match db::get_cache(DB_FILENAME, "schedule_cache", &student_id) {
        Ok(Some((data, sync_time))) => Ok(Some(serde_json::json!({
            "success": true,
            "data": data,
            "sync_time": sync_time
        }))),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) fn normalize_custom_weeks(input: &[i32]) -> Vec<i32> {
    let mut weeks = input
        .iter()
        .copied()
        .filter(|w| *w > 0 && *w <= 60)
        .collect::<Vec<_>>();
    weeks.sort_unstable();
    weeks.dedup();
    weeks
}

pub(crate) fn format_weeks_text(weeks: &[i32]) -> String {
    let values = normalize_custom_weeks(weeks);
    if values.is_empty() {
        return String::new();
    }
    let mut parts: Vec<String> = Vec::new();
    let mut start = values[0];
    let mut prev = values[0];
    for current in values.iter().skip(1).copied() {
        if current == prev + 1 {
            prev = current;
            continue;
        }
        if start == prev {
            parts.push(start.to_string());
        } else {
            parts.push(format!("{}-{}", start, prev));
        }
        start = current;
        prev = current;
    }
    if start == prev {
        parts.push(start.to_string());
    } else {
        parts.push(format!("{}-{}", start, prev));
    }
    parts.join(",")
}

pub(crate) fn strip_custom_course_id(value: &str) -> String {
    value.trim().trim_start_matches("custom:").to_string()
}

pub(crate) fn custom_course_to_payload(
    course: &db::CustomScheduleCourseRecord,
) -> serde_json::Value {
    let color = db::normalize_course_color(Some(course.color.as_str())).unwrap_or_default();
    serde_json::json!({
        "id": format!("custom:{}", course.id),
        "source_id": course.id,
        "name": course.name,
        "teacher": course.teacher,
        "room": course.room,
        "room_code": course.room,
        "building": "自定义",
        "weekday": course.weekday,
        "period": course.period,
        "djs": course.djs,
        "weeks": normalize_custom_weeks(&course.weeks),
        "weeks_text": format_weeks_text(&course.weeks),
        "credit": "",
        "class_name": "自定义课程",
        "semester": course.semester,
        "color": color,
        "is_custom": true,
        "created_at": course.created_at,
        "updated_at": course.updated_at
    })
}

#[tauri::command]
pub(crate) async fn list_custom_schedule_courses(
    student_id: String,
    semester: String,
) -> Result<serde_json::Value, String> {
    let sid = student_id.trim().to_string();
    let sem = semester.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    let list = db::list_custom_schedule_courses(DB_FILENAME, sid.as_str(), sem.as_str())
        .map_err(|e| e.to_string())?;
    let data = list
        .iter()
        .map(custom_course_to_payload)
        .collect::<Vec<serde_json::Value>>();
    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

#[tauri::command]
pub(crate) async fn list_all_custom_schedule_courses(
    student_id: String,
) -> Result<serde_json::Value, String> {
    let sid = student_id.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    let list = db::list_all_custom_schedule_courses(DB_FILENAME, sid.as_str())
        .map_err(|e| e.to_string())?;
    let data = list
        .iter()
        .map(custom_course_to_payload)
        .collect::<Vec<serde_json::Value>>();
    Ok(serde_json::json!({
        "success": true,
        "data": data
    }))
}

#[tauri::command]
pub(crate) async fn add_custom_schedule_course(
    req: AddCustomScheduleCourseRequest,
) -> Result<serde_json::Value, String> {
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let name = req.name.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if name.is_empty() {
        return Err("课程名称不能为空".to_string());
    }
    if !(1..=7).contains(&req.weekday) {
        return Err("上课时间必须是周一到周日".to_string());
    }
    if !(1..=11).contains(&req.period) {
        return Err("开始节次必须在 1-11 节".to_string());
    }
    let max_span = 12 - req.period;
    if req.djs < 1 || req.djs > max_span {
        return Err(format!("上课节数不合法，当前最多可选 {} 节", max_span));
    }
    let weeks = normalize_custom_weeks(&req.weeks);
    if weeks.is_empty() {
        return Err("请至少选择一个上课周次".to_string());
    }
    let color = db::normalize_course_color(req.color.as_deref())
        .ok_or_else(|| "颜色格式不合法，请使用 #RRGGBB".to_string())?;

    let mut rng = rand::thread_rng();
    let id = format!(
        "c{}{:04}",
        Utc::now().timestamp_millis(),
        rng.gen_range(0..10000)
    );
    let now = chrono::Local::now().to_rfc3339();
    let record = db::CustomScheduleCourseRecord {
        id,
        student_id: sid.clone(),
        semester: sem,
        name,
        teacher: req.teacher.unwrap_or_default().trim().to_string(),
        room: req.room.unwrap_or_default().trim().to_string(),
        weekday: req.weekday,
        period: req.period,
        djs: req.djs,
        weeks,
        color,
        created_at: now.clone(),
        updated_at: now,
    };
    db::add_custom_schedule_course(DB_FILENAME, &record).map_err(|e| e.to_string())?;
    let saved = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), record.id.as_str())
        .map_err(|e| e.to_string())?
        .unwrap_or(record);
    Ok(serde_json::json!({
        "success": true,
        "data": custom_course_to_payload(&saved)
    }))
}

#[tauri::command]
pub(crate) async fn delete_custom_schedule_course(
    req: DeleteCustomScheduleCourseRequest,
) -> Result<serde_json::Value, String> {
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let course_id = strip_custom_course_id(req.course_id.as_str());
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if course_id.is_empty() {
        return Err("course_id 不能为空".to_string());
    }

    let mode = req.mode.unwrap_or_else(|| "all".to_string()).to_lowercase();
    if mode == "current_week" {
        let week = req.current_week.unwrap_or(0);
        if week <= 0 {
            return Err("current_week 参数不合法".to_string());
        }
        let existing =
            db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "未找到要删除的自定义课程".to_string())?;
        if existing.semester != sem {
            return Err("学期不匹配，无法删除该课程".to_string());
        }
        let mut weeks = normalize_custom_weeks(&existing.weeks);
        let before_len = weeks.len();
        weeks.retain(|w| *w != week);
        if weeks.len() == before_len {
            return Err("当前周不在该课程周次中".to_string());
        }
        if weeks.is_empty() {
            db::delete_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
                .map_err(|e| e.to_string())?;
            return Ok(serde_json::json!({
                "success": true,
                "deleted": true,
                "mode": "current_week",
                "removed_week": week
            }));
        }
        db::update_custom_schedule_course_weeks(
            DB_FILENAME,
            sid.as_str(),
            course_id.as_str(),
            weeks.as_slice(),
        )
        .map_err(|e| e.to_string())?;
        let updated = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "更新后未找到课程记录".to_string())?;
        return Ok(serde_json::json!({
            "success": true,
            "deleted": false,
            "mode": "current_week",
            "removed_week": week,
            "data": custom_course_to_payload(&updated)
        }));
    }

    let affected = db::delete_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err("未找到要删除的自定义课程".to_string());
    }
    Ok(serde_json::json!({
        "success": true,
        "deleted": true,
        "mode": "all"
    }))
}

#[tauri::command]
pub(crate) async fn update_custom_schedule_course(
    req: UpdateCustomScheduleCourseRequest,
) -> Result<serde_json::Value, String> {
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let course_id = strip_custom_course_id(req.course_id.as_str());
    let name = req.name.trim().to_string();
    if sid.is_empty() {
        return Err("student_id 不能为空".to_string());
    }
    if sem.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if course_id.is_empty() {
        return Err("course_id 不能为空".to_string());
    }
    if name.is_empty() {
        return Err("课程名称不能为空".to_string());
    }
    if !(1..=7).contains(&req.weekday) {
        return Err("上课时间必须是周一到周日".to_string());
    }
    if !(1..=11).contains(&req.period) {
        return Err("开始节次必须在 1-11 节".to_string());
    }
    let max_span = 12 - req.period;
    if req.djs < 1 || req.djs > max_span {
        return Err(format!("上课节数不合法，当前最多可选 {} 节", max_span));
    }
    let weeks = normalize_custom_weeks(&req.weeks);
    if weeks.is_empty() {
        return Err("请至少选择一个上课周次".to_string());
    }

    let existing = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "未找到要修改的自定义课程".to_string())?;
    if existing.semester != sem {
        return Err("学期不匹配，无法修改该课程".to_string());
    }
    let color = db::normalize_course_color(req.color.as_deref())
        .ok_or_else(|| "颜色格式不合法，请使用 #RRGGBB".to_string())?;

    let record = db::CustomScheduleCourseRecord {
        id: existing.id,
        student_id: sid.clone(),
        semester: sem,
        name,
        teacher: req.teacher.unwrap_or_default().trim().to_string(),
        room: req.room.unwrap_or_default().trim().to_string(),
        weekday: req.weekday,
        period: req.period,
        djs: req.djs,
        weeks,
        color,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
    };

    let affected =
        db::update_custom_schedule_course(DB_FILENAME, &record).map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err("未找到要修改的自定义课程".to_string());
    }
    let updated = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), record.id.as_str())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "更新后未找到课程记录".to_string())?;
    Ok(serde_json::json!({
        "success": true,
        "data": custom_course_to_payload(&updated)
    }))
}

fn export_upload_endpoint(req: &ScheduleExportRequest) -> String {
    if let Some(v) = req.upload_endpoint.as_ref() {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    if let Some(v) = get_temp_upload_endpoint_config() {
        if !v.trim().is_empty() {
            return v;
        }
    }
    if let Ok(v) = std::env::var("HBUT_TEMP_UPLOAD_ENDPOINT") {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    DEFAULT_TEMP_UPLOAD_ENDPOINT.to_string()
}

#[tauri::command]
pub(crate) async fn export_schedule_calendar(
    req: ScheduleExportRequest,
) -> Result<serde_json::Value, String> {
    if req.events.is_empty() {
        return Err("娌℃可导出的课▼数据".to_string());
    }

    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let sid = sanitize_filename_part(req.student_id.as_deref().unwrap_or("student"));
    let semester = sanitize_filename_part(req.semester.as_deref().unwrap_or("semester"));
    let week = req.week.unwrap_or(0);
    let filename = format!("schedule_{}_{}_w{}_{}.ics", sid, semester, week, ts);

    let mut ics = String::new();
    ics.push_str("BEGIN:VCALENDAR\r\n");
    ics.push_str("VERSION:2.0\r\n");
    ics.push_str("CALSCALE:GREGORIAN\r\n");
    ics.push_str("METHOD:PUBLISH\r\n");
    ics.push_str("X-WR-CALNAME:HBUT 课表\r\n");
    ics.push_str("X-WR-TIMEZONE:Asia/Shanghai\r\n");
    ics.push_str("PRODID:-//Mini-HBUT//Schedule Export//CN\r\n");
    // VTIMEZONE: Asia/Shanghai (UTC+8, 无 DST)
    ics.push_str("BEGIN:VTIMEZONE\r\n");
    ics.push_str("TZID:Asia/Shanghai\r\n");
    ics.push_str("X-LIC-LOCATION:Asia/Shanghai\r\n");
    ics.push_str("BEGIN:STANDARD\r\n");
    ics.push_str("DTSTART:19700101T000000\r\n");
    ics.push_str("TZOFFSETFROM:+0800\r\n");
    ics.push_str("TZOFFSETTO:+0800\r\n");
    ics.push_str("TZNAME:CST\r\n");
    ics.push_str("END:STANDARD\r\n");
    ics.push_str("END:VTIMEZONE\r\n");

    let dtstamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    for (idx, ev) in req.events.iter().enumerate() {
        let start = match parse_ics_datetime(&ev.start) {
            Some(v) => v,
            None => continue,
        };
        let end = match parse_ics_datetime(&ev.end) {
            Some(v) => v,
            None => continue,
        };
        let summary = escape_ics_text(ev.summary.as_str());
        let desc = ev.description.as_deref().map(escape_ics_text);
        let location = ev.location.as_deref().map(escape_ics_text);
        let uid = format!("hbut-{}-{}@mini-hbut", ts, idx);

        ics.push_str("BEGIN:VEVENT\r\n");
        ics.push_str(&fold_ics_line(&format!("UID:{}", uid)));
        ics.push_str(&fold_ics_line(&format!("DTSTAMP:{}", dtstamp)));
        ics.push_str(&fold_ics_line(&format!(
            "DTSTART;TZID=Asia/Shanghai:{}",
            start.format("%Y%m%dT%H%M%S")
        )));
        ics.push_str(&fold_ics_line(&format!(
            "DTEND;TZID=Asia/Shanghai:{}",
            end.format("%Y%m%dT%H%M%S")
        )));
        ics.push_str(&fold_ics_line(&format!("SUMMARY:{}", summary)));
        if let Some(desc) = desc {
            ics.push_str(&fold_ics_line(&format!("DESCRIPTION:{}", desc)));
        }
        if let Some(location) = location {
            ics.push_str(&fold_ics_line(&format!("LOCATION:{}", location)));
        }
        ics.push_str("END:VEVENT\r\n");
    }
    ics.push_str("END:VCALENDAR\r\n");
    let upload_url = export_upload_endpoint(&req);
    let ttl = req.ttl_seconds.unwrap_or(24 * 3600).clamp(3600, 72 * 3600);
    let payload = serde_json::json!({
        "filename": filename.clone(),
        "content_base64": general_purpose::STANDARD.encode(ics.as_bytes()),
        "content_type": "text/calendar; charset=utf-8",
        "ttl_seconds": ttl
    });

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建上传客户端失败: {}", e))?;

    // 带轮询兜底的上传逻辑
    let mut last_err = String::new();
    let upload_endpoints = {
        let mut eps = vec![upload_url.clone()];
        // 如果运行时配置的端点与当前不同，追加为备选
        if let Some(rt) = get_temp_upload_endpoint_config() {
            if rt != upload_url && !rt.trim().is_empty() {
                eps.push(rt);
            }
        }
        // 硬编码默认值作为最终兜底
        let default_ep = DEFAULT_TEMP_UPLOAD_ENDPOINT.to_string();
        if !eps.contains(&default_ep) {
            eps.push(default_ep);
        }
        eps
    };

    let mut resp_body: Option<serde_json::Value> = None;
    for (idx, ep) in upload_endpoints.iter().enumerate() {
        println!("[调试] 上传尝试 #{}: {}", idx + 1, ep);
        match http.post(ep.as_str()).json(&payload).send().await {
            Ok(resp) => {
                let status = resp.status();
                match resp.json::<serde_json::Value>().await {
                    Ok(body) => {
                        if status.is_success()
                            && body
                                .get("success")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false)
                        {
                            resp_body = Some(body);
                            break;
                        }
                        let msg = body
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("上传服务返回失败");
                        last_err = format!("端点 {} 失败: {}", ep, msg);
                        println!("[警告] {}", last_err);
                    }
                    Err(e) => {
                        last_err = format!("端点 {} 解析响应失败: {}", ep, e);
                        println!("[警告] {}", last_err);
                    }
                }
            }
            Err(e) => {
                last_err = format!("端点 {} 请求失败: {}", ep, e);
                println!("[警告] {}", last_err);
            }
        }
    }

    let body = resp_body.ok_or_else(|| {
        format!(
            "课表导出上传失败（已尝试 {} 个端点）: {}",
            upload_endpoints.len(),
            last_err
        )
    })?;

    let url = body
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "上传成功但未返回链接".to_string())?;
    let remote_filename = body
        .get("filename")
        .and_then(|v| v.as_str())
        .unwrap_or(filename.as_str())
        .to_string();
    let expires_at = body
        .get("expires_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(serde_json::json!({
        "success": true,
        "url": url,
        "filename": remote_filename,
        "count": req.events.len(),
        "expires_at": expires_at,
        "provider": "hf-temp-storage"
    }))
}
