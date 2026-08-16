//! 课表领域路由与 Handler：自定义课表 CRUD、冲突检测、debug upsert、
//! 课表导出（ICS 生成 + 临时存储上传）。

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use rand::Rng;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::http_server::auth::{ensure_debug_bridge_enabled, ensure_local_cache_auth};
use crate::http_server::response::{err, ok, ApiResponse};
use crate::http_server::state::HttpState;
use crate::utils::ics::{
    escape_ics_text, fold_ics_line, parse_ics_datetime, sanitize_filename_part,
};
use crate::{
    db, AddCustomScheduleCourseRequest, DeleteCustomScheduleCourseRequest,
    UpdateCustomScheduleCourseRequest, DB_FILENAME,
};

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct CustomScheduleListRequest {
    student_id: String,
    semester: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct CustomScheduleListAllRequest {
    student_id: String,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct DebugCustomScheduleUpsertRequest {
    student_id: String,
    courses: Vec<DebugCustomScheduleCourseInput>,
    dry_run: Option<bool>,
    return_conflicts: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct DebugCustomScheduleCourseInput {
    id: Option<String>,
    semester: String,
    name: String,
    teacher: Option<String>,
    room: Option<String>,
    weekday: i32,
    period: i32,
    djs: i32,
    weeks: Vec<i32>,
    #[serde(default)]
    color: Option<String>,
}

// ────────────────────────────────────────────────────────────
#[derive(Debug, Deserialize)]
struct ScheduleExportRequest {
    student_id: Option<String>,
    semester: Option<String>,
    week: Option<i32>,
    events: Vec<ScheduleExportEvent>,
    upload_endpoint: Option<String>,
    ttl_seconds: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ScheduleExportEvent {
    summary: String,
    start: String,
    end: String,
    description: Option<String>,
    location: Option<String>,
}

// ────────────────────────────────────────────────────────────
fn normalize_custom_weeks(input: &[i32]) -> Vec<i32> {
    let mut weeks = input
        .iter()
        .copied()
        .filter(|w| *w > 0 && *w <= 60)
        .collect::<Vec<_>>();
    weeks.sort_unstable();
    weeks.dedup();
    weeks
}

// ────────────────────────────────────────────────────────────
fn format_custom_weeks_text(weeks: &[i32]) -> String {
    let values = normalize_custom_weeks(weeks);
    if values.is_empty() {
        return String::new();
    }
    let mut result = Vec::new();
    let mut start = values[0];
    let mut prev = values[0];
    for current in values.iter().skip(1).copied() {
        if current == prev + 1 {
            prev = current;
            continue;
        }
        if start == prev {
            result.push(start.to_string());
        } else {
            result.push(format!("{}-{}", start, prev));
        }
        start = current;
        prev = current;
    }
    if start == prev {
        result.push(start.to_string());
    } else {
        result.push(format!("{}-{}", start, prev));
    }
    result.join(",")
}

// ────────────────────────────────────────────────────────────
fn custom_course_payload(course: &db::CustomScheduleCourseRecord) -> serde_json::Value {
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
        "weeks_text": format_custom_weeks_text(&course.weeks),
        "credit": "",
        "class_name": "自定义课程",
        "semester": course.semester,
        "color": color,
        "is_custom": true,
        "created_at": course.created_at,
        "updated_at": course.updated_at
    })
}

// ────────────────────────────────────────────────────────────
fn strip_custom_course_id(value: &str) -> String {
    value.trim().trim_start_matches("custom:").to_string()
}

// ────────────────────────────────────────────────────────────
fn validate_debug_custom_schedule_course(
    student_id: &str,
    course: &DebugCustomScheduleCourseInput,
) -> Result<db::CustomScheduleCourseRecord, String> {
    let semester = course.semester.trim().to_string();
    let name = course.name.trim().to_string();
    if semester.is_empty() {
        return Err("semester 不能为空".to_string());
    }
    if name.is_empty() {
        return Err("课程名称不能为空".to_string());
    }
    if !(1..=7).contains(&course.weekday) {
        return Err("上课时间必须是周一到周日".to_string());
    }
    if !(1..=11).contains(&course.period) {
        return Err("开始节次必须在 1-11 节".to_string());
    }
    let max_span = 12 - course.period;
    if course.djs < 1 || course.djs > max_span {
        return Err(format!("上课节数不合法，当前最多可选 {} 节", max_span));
    }
    let weeks = normalize_custom_weeks(&course.weeks);
    if weeks.is_empty() {
        return Err("请至少选择一个上课周次".to_string());
    }

    let provided_id = course
        .id
        .as_deref()
        .map(strip_custom_course_id)
        .unwrap_or_default();
    let id = if provided_id.is_empty() {
        let mut rng = rand::thread_rng();
        format!(
            "c{}{:04}",
            Utc::now().timestamp_millis(),
            rng.gen_range(0..10000)
        )
    } else {
        provided_id
    };
    let now = chrono::Local::now().to_rfc3339();
    let color = db::normalize_course_color(course.color.as_deref())
        .ok_or_else(|| "颜色格式不合法，请使用 #RRGGBB".to_string())?;
    Ok(db::CustomScheduleCourseRecord {
        id,
        student_id: student_id.to_string(),
        semester,
        name,
        teacher: course
            .teacher
            .clone()
            .unwrap_or_default()
            .trim()
            .to_string(),
        room: course.room.clone().unwrap_or_default().trim().to_string(),
        weekday: course.weekday,
        period: course.period,
        djs: course.djs,
        weeks,
        color,
        created_at: now.clone(),
        updated_at: now,
    })
}

// ────────────────────────────────────────────────────────────
fn schedule_ranges_overlap(
    left_period: i32,
    left_span: i32,
    right_period: i32,
    right_span: i32,
) -> bool {
    let left_end = left_period + left_span - 1;
    let right_end = right_period + right_span - 1;
    left_period <= right_end && right_period <= left_end
}

// ────────────────────────────────────────────────────────────
fn weeks_intersection(left: &[i32], right: &[i32]) -> Vec<i32> {
    let right_set = right
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    left.iter()
        .copied()
        .filter(|item| right_set.contains(item))
        .collect::<Vec<_>>()
}

// ────────────────────────────────────────────────────────────
fn build_custom_schedule_conflicts(
    courses: &[db::CustomScheduleCourseRecord],
) -> Vec<serde_json::Value> {
    let mut grouped: std::collections::BTreeMap<String, Vec<&db::CustomScheduleCourseRecord>> =
        std::collections::BTreeMap::new();
    for course in courses {
        grouped
            .entry(course.semester.clone())
            .or_default()
            .push(course);
    }
    let mut output = Vec::new();
    for (semester, items) in grouped {
        let mut semester_conflicts = Vec::new();
        for i in 0..items.len() {
            for j in (i + 1)..items.len() {
                let left = items[i];
                let right = items[j];
                if left.weekday != right.weekday {
                    continue;
                }
                if !schedule_ranges_overlap(left.period, left.djs, right.period, right.djs) {
                    continue;
                }
                let overlap_weeks = weeks_intersection(&left.weeks, &right.weeks);
                if overlap_weeks.is_empty() {
                    continue;
                }
                semester_conflicts.push(serde_json::json!({
                    "left": custom_course_payload(left),
                    "right": custom_course_payload(right),
                    "overlapWeeks": overlap_weeks,
                    "weekday": left.weekday,
                    "leftPeriod": left.period,
                    "rightPeriod": right.period
                }));
            }
        }
        output.push(serde_json::json!({
            "semester": semester,
            "count": semester_conflicts.len(),
            "items": semester_conflicts
        }));
    }
    output
}

// ────────────────────────────────────────────────────────────
async fn schedule_custom_list(
    Json(req): Json<CustomScheduleListRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let sid = req.student_id.trim();
    let sem = req.semester.trim();
    if sid.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "student_id 不能为空".to_string(),
        ));
    }
    if sem.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "semester 不能为空".to_string(),
        ));
    }
    let list = db::list_custom_schedule_courses(DB_FILENAME, sid, sem).map_err(|e| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "数据库错误",
            e.to_string(),
        )
    })?;
    let data = list
        .iter()
        .map(custom_course_payload)
        .collect::<Vec<serde_json::Value>>();
    Ok(ok(serde_json::json!({
        "success": true,
        "data": data
    })))
}

// ────────────────────────────────────────────────────────────
async fn schedule_custom_list_all(
    Json(req): Json<CustomScheduleListAllRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let sid = req.student_id.trim();
    if sid.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "student_id 不能为空".to_string(),
        ));
    }
    let list = db::list_all_custom_schedule_courses(DB_FILENAME, sid).map_err(|e| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "数据库错误",
            e.to_string(),
        )
    })?;
    let data = list
        .iter()
        .map(custom_course_payload)
        .collect::<Vec<serde_json::Value>>();
    Ok(ok(serde_json::json!({
        "success": true,
        "data": data
    })))
}

// ────────────────────────────────────────────────────────────
async fn schedule_custom_add(
    Json(req): Json<AddCustomScheduleCourseRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let name = req.name.trim().to_string();
    if sid.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "student_id 不能为空".to_string(),
        ));
    }
    if sem.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "semester 不能为空".to_string(),
        ));
    }
    if name.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "课程名称不能为空".to_string(),
        ));
    }
    if !(1..=7).contains(&req.weekday) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "上课时间必须是周一到周日".to_string(),
        ));
    }
    if !(1..=11).contains(&req.period) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "开始节次必须在 1-11 节".to_string(),
        ));
    }
    let max_span = 12 - req.period;
    if req.djs < 1 || req.djs > max_span {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            format!("上课节数不合法，当前最多可选 {} 节", max_span),
        ));
    }
    let weeks = normalize_custom_weeks(&req.weeks);
    if weeks.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "请至少选择一个上课周次".to_string(),
        ));
    }
    let color = db::normalize_course_color(req.color.as_deref()).ok_or_else(|| {
        err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "颜色格式不合法，请使用 #RRGGBB".to_string(),
        )
    })?;

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
    db::add_custom_schedule_course(DB_FILENAME, &record).map_err(|e| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "数据库错误",
            e.to_string(),
        )
    })?;
    let saved = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), record.id.as_str())
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "数据库错误",
                e.to_string(),
            )
        })?
        .unwrap_or(record);
    Ok(ok(serde_json::json!({
        "success": true,
        "data": custom_course_payload(&saved)
    })))
}

// ────────────────────────────────────────────────────────────
async fn schedule_custom_delete(
    Json(req): Json<DeleteCustomScheduleCourseRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let course_id = strip_custom_course_id(req.course_id.as_str());
    if sid.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "student_id 不能为空".to_string(),
        ));
    }
    if sem.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "semester 不能为空".to_string(),
        ));
    }
    if course_id.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "course_id 不能为空".to_string(),
        ));
    }

    let mode = req.mode.unwrap_or_else(|| "all".to_string()).to_lowercase();
    if mode == "current_week" {
        let week = req.current_week.unwrap_or(0);
        if week <= 0 {
            return Err(err(
                StatusCode::BAD_REQUEST,
                "参数错误",
                "current_week 参数不合法".to_string(),
            ));
        }
        let existing =
            db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
                .map_err(|e| {
                    err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "数据库错误",
                        e.to_string(),
                    )
                })?
                .ok_or_else(|| {
                    err(
                        StatusCode::BAD_REQUEST,
                        "业务错误",
                        "未找到要删除的自定义课程".to_string(),
                    )
                })?;
        if existing.semester != sem {
            return Err(err(
                StatusCode::BAD_REQUEST,
                "业务错误",
                "学期不匹配，无法删除该课程".to_string(),
            ));
        }
        let mut weeks = normalize_custom_weeks(&existing.weeks);
        let before_len = weeks.len();
        weeks.retain(|w| *w != week);
        if weeks.len() == before_len {
            return Err(err(
                StatusCode::BAD_REQUEST,
                "业务错误",
                "当前周不在该课程周次中".to_string(),
            ));
        }
        if weeks.is_empty() {
            db::delete_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
                .map_err(|e| {
                    err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "数据库错误",
                        e.to_string(),
                    )
                })?;
            return Ok(ok(serde_json::json!({
                "success": true,
                "deleted": true,
                "mode": "current_week",
                "removed_week": week
            })));
        }
        db::update_custom_schedule_course_weeks(
            DB_FILENAME,
            sid.as_str(),
            course_id.as_str(),
            weeks.as_slice(),
        )
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "数据库错误",
                e.to_string(),
            )
        })?;
        let updated = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
            .map_err(|e| {
                err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "数据库错误",
                    e.to_string(),
                )
            })?
            .ok_or_else(|| {
                err(
                    StatusCode::BAD_REQUEST,
                    "业务错误",
                    "更新后未找到课程记录".to_string(),
                )
            })?;
        return Ok(ok(serde_json::json!({
            "success": true,
            "deleted": false,
            "mode": "current_week",
            "removed_week": week,
            "data": custom_course_payload(&updated)
        })));
    }

    let affected = db::delete_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "数据库错误",
                e.to_string(),
            )
        })?;
    if affected == 0 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "业务错误",
            "未找到要删除的自定义课程".to_string(),
        ));
    }
    Ok(ok(serde_json::json!({
        "success": true,
        "deleted": true,
        "mode": "all"
    })))
}

// ────────────────────────────────────────────────────────────
async fn schedule_custom_update(
    Json(req): Json<UpdateCustomScheduleCourseRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    let sid = req.student_id.trim().to_string();
    let sem = req.semester.trim().to_string();
    let course_id = strip_custom_course_id(req.course_id.as_str());
    let name = req.name.trim().to_string();
    if sid.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "student_id 不能为空".to_string(),
        ));
    }
    if sem.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "semester 不能为空".to_string(),
        ));
    }
    if course_id.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "course_id 不能为空".to_string(),
        ));
    }
    if name.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "课程名称不能为空".to_string(),
        ));
    }
    if !(1..=7).contains(&req.weekday) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "上课时间必须是周一到周日".to_string(),
        ));
    }
    if !(1..=11).contains(&req.period) {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "开始节次必须在 1-11 节".to_string(),
        ));
    }
    let max_span = 12 - req.period;
    if req.djs < 1 || req.djs > max_span {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            format!("上课节数不合法，当前最多可选 {} 节", max_span),
        ));
    }
    let weeks = normalize_custom_weeks(&req.weeks);
    if weeks.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "请至少选择一个上课周次".to_string(),
        ));
    }

    let existing = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), course_id.as_str())
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "数据库错误",
                e.to_string(),
            )
        })?
        .ok_or_else(|| {
            err(
                StatusCode::BAD_REQUEST,
                "业务错误",
                "未找到要修改的自定义课程".to_string(),
            )
        })?;
    if existing.semester != sem {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "业务错误",
            "学期不匹配，无法修改该课程".to_string(),
        ));
    }
    let color = db::normalize_course_color(req.color.as_deref()).ok_or_else(|| {
        err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "颜色格式不合法，请使用 #RRGGBB".to_string(),
        )
    })?;

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

    let affected = db::update_custom_schedule_course(DB_FILENAME, &record).map_err(|e| {
        err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "数据库错误",
            e.to_string(),
        )
    })?;
    if affected == 0 {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "业务错误",
            "未找到要修改的自定义课程".to_string(),
        ));
    }

    let updated = db::get_custom_schedule_course(DB_FILENAME, sid.as_str(), record.id.as_str())
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "数据库错误",
                e.to_string(),
            )
        })?
        .ok_or_else(|| {
            err(
                StatusCode::BAD_REQUEST,
                "业务错误",
                "更新后未找到课程记录".to_string(),
            )
        })?;

    Ok(ok(serde_json::json!({
        "success": true,
        "data": custom_course_payload(&updated)
    })))
}

// ────────────────────────────────────────────────────────────
async fn debug_custom_schedule_upsert(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(req): Json<DebugCustomScheduleUpsertRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    ensure_local_cache_auth(&headers, &state)?;
    ensure_debug_bridge_enabled(&state)?;

    let student_id = req.student_id.trim().to_string();
    if student_id.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "student_id 不能为空".to_string(),
        ));
    }
    if req.courses.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "courses 不能为空".to_string(),
        ));
    }

    let dry_run = req.dry_run.unwrap_or(false);
    let return_conflicts = req.return_conflicts.unwrap_or(true);
    let existing_all = db::list_all_custom_schedule_courses(DB_FILENAME, student_id.as_str())
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "数据库错误",
                e.to_string(),
            )
        })?;
    let mut simulated = existing_all
        .iter()
        .map(|course| (course.id.clone(), course.clone()))
        .collect::<HashMap<String, db::CustomScheduleCourseRecord>>();
    let mut persisted = Vec::new();
    let mut affected_semesters = std::collections::BTreeSet::new();

    for (index, input) in req.courses.iter().enumerate() {
        let mut record = validate_debug_custom_schedule_course(student_id.as_str(), input)
            .map_err(|message| {
                err(
                    StatusCode::BAD_REQUEST,
                    "参数错误",
                    format!("第 {} 条课程不合法: {}", index + 1, message),
                )
            })?;
        if let Some(existing) = simulated.get(record.id.as_str()) {
            record.created_at = existing.created_at.clone();
            record.updated_at = chrono::Local::now().to_rfc3339();
        }
        affected_semesters.insert(record.semester.clone());
        simulated.insert(record.id.clone(), record.clone());
        if !dry_run {
            if db::get_custom_schedule_course(DB_FILENAME, student_id.as_str(), record.id.as_str())
                .map_err(|e| {
                    err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "数据库错误",
                        e.to_string(),
                    )
                })?
                .is_some()
            {
                db::update_custom_schedule_course(DB_FILENAME, &record).map_err(|e| {
                    err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "数据库错误",
                        e.to_string(),
                    )
                })?;
            } else {
                db::add_custom_schedule_course(DB_FILENAME, &record).map_err(|e| {
                    err(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "数据库错误",
                        e.to_string(),
                    )
                })?;
            }
        }
        persisted.push(record);
    }

    let persisted_payload = persisted
        .iter()
        .map(custom_course_payload)
        .collect::<Vec<serde_json::Value>>();

    let conflict_payload = if return_conflicts {
        let final_courses = if dry_run {
            simulated.values().cloned().collect::<Vec<_>>()
        } else {
            db::list_all_custom_schedule_courses(DB_FILENAME, student_id.as_str()).map_err(|e| {
                err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "数据库错误",
                    e.to_string(),
                )
            })?
        };
        let affected_courses = final_courses
            .into_iter()
            .filter(|course| affected_semesters.contains(course.semester.as_str()))
            .collect::<Vec<_>>();
        serde_json::Value::Array(build_custom_schedule_conflicts(&affected_courses))
    } else {
        serde_json::Value::Array(Vec::new())
    };

    eprintln!(
        "[DebugBridge] custom_schedule/upsert sid={} dry_run={} count={}",
        student_id,
        dry_run,
        req.courses.len()
    );

    Ok(ok(serde_json::json!({
        "success": true,
        "dry_run": dry_run,
        "courses": persisted_payload,
        "conflicts": conflict_payload
    })))
}

// ────────────────────────────────────────────────────────────
fn export_dir() -> std::path::PathBuf {
    if let Ok(raw) = std::env::var("HBUT_EXPORT_DIR") {
        let path = std::path::PathBuf::from(raw);
        if !path.as_os_str().is_empty() {
            return path;
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("exports")
}

// ────────────────────────────────────────────────────────────
fn export_upload_endpoint(req: &ScheduleExportRequest) -> String {
    if let Some(v) = req.upload_endpoint.as_ref() {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    if let Some(v) = crate::get_temp_upload_endpoint_config() {
        if !v.trim().is_empty() {
            return v;
        }
    }
    if let Ok(v) = std::env::var("HBUT_TEMP_UPLOAD_ENDPOINT") {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    "https://mini-hbut-testocr1.hf.space/api/temp/upload".to_string()
}

// ────────────────────────────────────────────────────────────
async fn export_schedule_calendar(
    State(_state): State<HttpState>,
    _headers: HeaderMap,
    Json(req): Json<ScheduleExportRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, (StatusCode, Json<ApiResponse<serde_json::Value>>)>
{
    if req.events.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "参数错误",
            "娌℃可导出的课▼数据".to_string(),
        ));
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
    let upload_payload = serde_json::json!({
        "filename": filename.clone(),
        "content_base64": general_purpose::STANDARD.encode(ics.as_bytes()),
        "content_type": "text/calendar; charset=utf-8",
        "ttl_seconds": ttl
    });

    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| {
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "导出失败",
                format!("创建上传客户端失败: {}", e),
            )
        })?;

    // 带轮询兜底的上传逻辑
    let mut upload_endpoints = vec![upload_url.clone()];
    if let Some(rt) = crate::get_temp_upload_endpoint_config() {
        if rt != upload_url && !rt.trim().is_empty() {
            upload_endpoints.push(rt);
        }
    }
    let default_ep = crate::DEFAULT_TEMP_UPLOAD_ENDPOINT.to_string();
    if !upload_endpoints.contains(&default_ep) {
        upload_endpoints.push(default_ep);
    }

    let mut last_err = String::new();
    let mut resp_body: Option<serde_json::Value> = None;
    for (idx, ep) in upload_endpoints.iter().enumerate() {
        println!("[调试] HTTP Bridge 上传尝试 #{}: {}", idx + 1, ep);
        match http.post(ep.as_str()).json(&upload_payload).send().await {
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
                    }
                    Err(e) => {
                        last_err = format!("端点 {} 解析响应失败: {}", ep, e);
                    }
                }
            }
            Err(e) => {
                last_err = format!("端点 {} 请求失败: {}", ep, e);
            }
        }
    }

    let body = resp_body.ok_or_else(|| {
        err(
            StatusCode::BAD_GATEWAY,
            "导出失败",
            format!(
                "上传失败（已尝试 {} 个端点）: {}",
                upload_endpoints.len(),
                last_err
            ),
        )
    })?;

    let url = body.get("url").and_then(|v| v.as_str()).ok_or_else(|| {
        err(
            StatusCode::BAD_GATEWAY,
            "导出失败",
            "上传成功但未返回链接".to_string(),
        )
    })?;
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
    let payload = serde_json::json!({
        "success": true,
        "url": url,
        "filename": remote_filename,
        "count": req.events.len(),
        "expires_at": expires_at,
        "provider": "hf-temp-storage"
    });
    Ok(ok(payload))
}

// ────────────────────────────────────────────────────────────
async fn download_export(Path(filename): Path<String>) -> impl IntoResponse {
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return (StatusCode::BAD_REQUEST, "invalid filename").into_response();
    }
    let file_path = export_dir().join(&filename);
    if !file_path.exists() {
        return (StatusCode::NOT_FOUND, "file not found").into_response();
    }
    let bytes = match tokio::fs::read(&file_path).await {
        Ok(bytes) => bytes,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "read error").into_response(),
    };
    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/calendar; charset=utf-8"),
    );
    let disposition = format!("attachment; filename=\"{}\"", filename);
    if let Ok(value) = HeaderValue::from_str(&disposition) {
        resp.headers_mut().insert(CONTENT_DISPOSITION, value);
    }
    resp
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/schedule/custom/list", post(schedule_custom_list))
        .route("/schedule/custom/list_all", post(schedule_custom_list_all))
        .route("/schedule/custom/add", post(schedule_custom_add))
        .route("/schedule/custom/delete", post(schedule_custom_delete))
        .route("/schedule/custom/update", post(schedule_custom_update))
        .route("/export_schedule_calendar", post(export_schedule_calendar))
        .route("/exports/:filename", get(download_export))
}

pub(crate) fn debug_router() -> Router<HttpState> {
    Router::new().route(
        "/debug/custom_schedule/upsert",
        post(debug_custom_schedule_upsert),
    )
}
