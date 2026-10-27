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
