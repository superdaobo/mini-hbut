//! 选课（course_selection）Tauri commands。

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_state::AppState;
use crate::modules;
use crate::transport::tauri::common::attach_sync_time;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionListRequest {
    pub pcid: String,
    pub from: Option<String>,
    pub pcenc: String,
    pub kcmc: Option<String>,
    pub kcxz: Option<String>,
    pub jxms: Option<String>,
    pub kcgs: Option<String>,
    pub teacher: Option<String>,
    pub kkxq: Option<String>,
    pub kclb: Option<String>,
    pub kclx: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionEndTimeRequest {
    pub pcid: String,
    pub kklx: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionChildClassesRequest {
    pub pcid: String,
    pub pcenc: String,
    pub jxbid: String,
    pub from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionSelectRequest {
    pub pcid: String,
    pub jxbid: String,
    pub zjxbid: Option<String>,
    pub from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionWithdrawRequest {
    pub pcid: String,
    pub jxbid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionDetailRequest {
    pub jxbid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseSelectionSelectedCoursesRequest {
    pub semester: Option<String>,
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_overview(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_overview(&client).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_list(
    state: State<'_, AppState>,
    req: CourseSelectionListRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_list(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_end_time(
    state: State<'_, AppState>,
    req: CourseSelectionEndTimeRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_end_time(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_child_classes(
    state: State<'_, AppState>,
    req: CourseSelectionChildClassesRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_child_classes(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn select_course_selection_course(
    state: State<'_, AppState>,
    req: CourseSelectionSelectRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::select_course_selection_course(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn withdraw_course_selection_course(
    state: State<'_, AppState>,
    req: CourseSelectionWithdrawRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::withdraw_course_selection_course(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_selected_courses(
    state: State<'_, AppState>,
    req: CourseSelectionSelectedCoursesRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_selected_courses(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_detail_intro(
    state: State<'_, AppState>,
    req: CourseSelectionDetailRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_detail_intro(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn fetch_course_selection_detail_teacher(
    state: State<'_, AppState>,
    req: CourseSelectionDetailRequest,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    match modules::course_selection::fetch_course_selection_detail_teacher(&client, &req).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            Ok(attach_sync_time(data, &sync_time, false))
        }
        Err(e) => Err(e.to_string()),
    }
}
