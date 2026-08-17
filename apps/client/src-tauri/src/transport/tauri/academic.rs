//! 教务/学术领域 Tauri commands：考试、排名、学籍、学期、教室、培养方案、校历、图书馆。
//!
//! 本模块只做传输适配：参数透传、构造 [`AcademicReadService`] 并映射错误；
//! 网络获取 / 缓存 / 离线降级语义全部收敛在 application 层（Tauri 与 HTTP 共用），
//! 不再复制业务分支。DTO（Exam/Ranking/Classroom/CalendarEvent）为前端契约保留。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;
use crate::application;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exam {
    pub course_name: String,
    pub date: String,
    pub start_time: String,
    pub end_time: String,
    pub location: String,
    pub seat_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ranking {
    pub class_rank: i32,
    pub class_total: i32,
    pub major_rank: i32,
    pub major_total: i32,
    pub college_rank: i32,
    pub college_total: i32,
    pub gpa: f64,
    pub average_score: f64,
    pub total_credits: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Classroom {
    pub name: String,
    pub building: String,
    pub capacity: i32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub date: String,
    pub title: String,
    pub event_type: String,
}

/// 构造共享只读服务（快照克隆，网络 await 不持锁）。
fn service(state: &AppState) -> application::AcademicReadService {
    application::AcademicReadService::new(application::ApplicationContext::new(
        state.client.clone(),
        crate::DB_FILENAME,
    ))
}

fn map_error(error: application::ApplicationError) -> String {
    error.to_string()
}

#[tauri::command]
pub(crate) async fn fetch_exams(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_exams(semester)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_ranking(
    state: State<'_, AppState>,
    student_id: Option<String>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_ranking(student_id, semester)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_student_info(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_student_info()
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_personal_login_access_info(
    state: State<'_, AppState>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_personal_login_access_info(page, page_size)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_semesters(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_semesters().await.map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_classroom_buildings(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_classroom_buildings()
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_classrooms(
    state: State<'_, AppState>,
    week: Option<i32>,
    weekday: Option<i32>,
    periods: Option<Vec<i32>>,
    building: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_classrooms(week, weekday, periods, building)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_training_plan_options(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_training_plan_options()
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_training_plan_jys(
    state: State<'_, AppState>,
    yxid: String,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_training_plan_jys(yxid)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_training_plan_courses(
    state: State<'_, AppState>,
    grade: Option<String>,
    kkxq: Option<String>,
    kkyx: Option<String>,
    kkjys: Option<String>,
    kcxz: Option<String>,
    kcgs: Option<String>,
    kcbh: Option<String>,
    kcmc: Option<String>,
    page: Option<i32>,
    page_size: Option<i32>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_training_plan_courses(
            grade, kkxq, kkyx, kkjys, kcxz, kcgs, kcbh, kcmc, page, page_size,
        )
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_calendar(
    state: State<'_, AppState>,
) -> Result<Vec<CalendarEvent>, String> {
    // 单端命令（旧校历事件）：快照克隆后调用，避免写锁跨网络 await
    let client = {
        let guard = state.client.read().await;
        guard.clone()
    };
    client.fetch_calendar().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn fetch_calendar_data(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    // #489 校历语义由 AcademicReadService::fetch_calendar_data 统一实现：
    // 仅成功响应写缓存并刷新 sync_time（if success 才写 calendar_public_cache），
    // 会话失效（if need_login）原样透传不写缓存；本命令只做传输适配。
    service(&state)
        .fetch_calendar_data(semester)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_academic_progress(
    state: State<'_, AppState>,
    fasz: Option<i32>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_academic_progress(fasz)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_library_dict(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // 前端契约：返回含 success 的包装（attach_sync_time 平铺 OPAC JSON，
    // data 字段即字典内容），缓存降级语义由 AcademicReadService 统一。
    service(&state)
        .fetch_library_dict()
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn search_library_books(
    state: State<'_, AppState>,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    service(&state)
        .search_library_books(params)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn fetch_library_book_detail(
    state: State<'_, AppState>,
    title: String,
    isbn: String,
    record_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_library_book_detail(title, isbn, record_id)
        .await
        .map_err(map_error)
}
