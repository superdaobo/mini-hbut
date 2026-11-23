//! 教师端 Tauri commands（Teacher Portal V2 / #1019）。
//!
//! E0 已把 E2/E5/E6 需要的**全部**只读命令预声明为 stub：
//! `lib.rs` 的 `generate_handler!` 与命令注册基线**一次改到位**，
//! 后续 Agent 只替换 `application` / `http_client` 实现文件，**不再触碰 lib.rs**。
//!
//! 传输层只做参数透传与错误字符串映射；权限校验 / 只读路径校验 / 错误归一化
//! 全部收敛在 [`crate::application::TeacherService`]（Tauri 与 HTTP Bridge 共用）。

use tauri::State;

use crate::app_state::AppState;
use crate::application;

/// 构造共享教师服务（快照克隆，网络 await 不持全局锁）。
fn service(state: &AppState) -> application::TeacherService {
    application::TeacherService::new(application::ApplicationContext::new(
        state.client.clone(),
        crate::DB_FILENAME,
    ))
}

fn map_error(error: application::ApplicationError) -> String {
    error.to_string()
}

/// 教师个人资料（E2 #1022 填充 `teacher/profile.rs`）。
#[tauri::command]
pub(crate) async fn teacher_profile_fetch(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_profile().await.map_err(map_error)
}

/// 我的教学：教学任务 + 教学班（E5 #1025 填充 `teacher/teaching.rs`）。
#[tauri::command]
pub(crate) async fn teacher_teaching_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_teaching(semester)
        .await
        .map_err(map_error)
}

/// 考试与监考（E6 #1026 填充 `teacher/exams.rs`）。
#[tauri::command]
pub(crate) async fn teacher_exams_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_exams(semester)
        .await
        .map_err(map_error)
}

/// 教务通知（只读；教师标记已读仅本地，**绝不**写服务端）。
#[tauri::command]
pub(crate) async fn teacher_notices_fetch(
    state: State<'_, AppState>,
    page: Option<i64>,
    page_size: Option<i64>,
    keyword: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_notices(page, page_size, keyword)
        .await
        .map_err(map_error)
}

// ────────────────────────────────────────────────────────────────
// goal-21：教师端新增只读命令（14 个）
// 传输层只做参数透传；权限 / 只读校验 / 错误归一化都在 TeacherService。
// ────────────────────────────────────────────────────────────────

/// 学生考勤统计。
#[tauri::command]
pub(crate) async fn teacher_attendance_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_attendance(semester).await.map_err(map_error)
}

/// 教师端工作量（`/twork` 微服务）。
#[tauri::command]
pub(crate) async fn teacher_workload_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_workload(semester).await.map_err(map_error)
}

/// 只读工作流：申请 / 经办 / 待办。
#[tauri::command]
pub(crate) async fn teacher_workflow_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_workflow(semester).await.map_err(map_error)
}

/// 考试事务：缓考 / 剩余试卷 / 评教。
#[tauri::command]
pub(crate) async fn teacher_exam_affairs_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_exam_affairs(semester).await.map_err(map_error)
}

/// 学分统计。
#[tauri::command]
pub(crate) async fn teacher_credits_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_credits(semester).await.map_err(map_error)
}

/// 调停补申请（只读）。
#[tauri::command]
pub(crate) async fn teacher_adjustment_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_adjustment(semester).await.map_err(map_error)
}

/// 学生名册（`bjid` 必填；缺失会被后端直接拒绝且不发请求）。
#[tauri::command]
pub(crate) async fn teacher_roster_fetch(
    state: State<'_, AppState>,
    bjid: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
    keyword: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_roster(bjid, page, page_size, keyword)
        .await
        .map_err(map_error)
}

/// 成绩录入进度 + 教学班发布状态。
#[tauri::command]
pub(crate) async fn teacher_grade_entry_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_grade_entry(semester).await.map_err(map_error)
}

/// 课表扩展：班级列表 + 教室列表 + 课表页 URL。
#[tauri::command]
pub(crate) async fn teacher_schedule_lists_fetch(
    state: State<'_, AppState>,
    semester: Option<String>,
    keyword: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_schedule_lists(semester, keyword)
        .await
        .map_err(map_error)
}

/// 融合门户卡片（8 张卡 + 角标）。
#[tauri::command]
pub(crate) async fn teacher_portal_cards_fetch(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state).fetch_portal_cards().await.map_err(map_error)
}

/// 学习通教师侧：课程与教学班频道。
#[tauri::command]
pub(crate) async fn teacher_chaoxing_courses_fetch(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_chaoxing_courses()
        .await
        .map_err(map_error)
}

/// 学习通教师侧：学情（6 维度）。
#[tauri::command]
pub(crate) async fn teacher_chaoxing_analytics_fetch(
    state: State<'_, AppState>,
    courseid: String,
    clazzid: String,
    cpi: String,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_chaoxing_analytics(courseid, clazzid, cpi)
        .await
        .map_err(map_error)
}

/// 学习通教师侧：全班成绩明细。
#[tauri::command]
pub(crate) async fn teacher_chaoxing_scores_fetch(
    state: State<'_, AppState>,
    courseid: String,
    clazzid: String,
    cpi: String,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_chaoxing_scores(courseid, clazzid, cpi)
        .await
        .map_err(map_error)
}

/// 学习通教师侧：学习监控。
#[tauri::command]
pub(crate) async fn teacher_chaoxing_monitor_fetch(
    state: State<'_, AppState>,
    courseid: String,
    clazzid: String,
    cpi: String,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_chaoxing_monitor(courseid, clazzid, cpi)
        .await
        .map_err(map_error)
}

/// 班级课表结构化数据（goal-22：应用内网格渲染，不再外跳浏览器）。
#[tauri::command]
pub(crate) async fn teacher_class_schedule_fetch(
    state: State<'_, AppState>,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_class_schedule(encode_id, semester, campus_id)
        .await
        .map_err(map_error)
}

/// 教室课表结构化数据（goal-22：应用内网格渲染）。
#[tauri::command]
pub(crate) async fn teacher_room_schedule_fetch(
    state: State<'_, AppState>,
    encode_id: Option<String>,
    semester: Option<String>,
    campus_id: Option<String>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_room_schedule(encode_id, semester, campus_id)
        .await
        .map_err(map_error)
}

/// 按教学班列学生（goal-22：含 20 周考勤状态）。
#[tauri::command]
pub(crate) async fn teacher_roster_by_class_fetch(
    state: State<'_, AppState>,
    jxbid: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
) -> Result<serde_json::Value, String> {
    service(&state)
        .fetch_roster_by_class(jxbid, page, page_size)
        .await
        .map_err(map_error)
}
