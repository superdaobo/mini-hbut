//! 成绩领域 Tauri commands：同步、教师缓存、本地读取。

use tauri::State;

use crate::app_state::AppState;
use crate::db;
use crate::grade;
use crate::grade::domain::Grade;
use crate::DB_FILENAME;

#[tauri::command]
pub(crate) async fn sync_grades(
    state: State<'_, AppState>,
    current_only: Option<bool>,
) -> Result<serde_json::Value, String> {
    let current_only = current_only.unwrap_or(false);
    let client_handle = state.client.clone();
    let uid = {
        let client = client_handle.read().await;
        client.user_info.as_ref().map(|u| u.student_id.clone())
    };
    // 共享成绩用例：Tauri 与 HTTP Bridge 走同一 GradeService（抓取→教师合并→
    // 成功替换缓存→失败保留 offline 快照），本 handler 只做传输适配。
    let service =
        grade::service::GradeService::new(client_handle.clone(), grade::service::SqliteGradeCache);
    let result = service.sync_grades(uid.as_deref(), current_only).await?;
    if let Some(job) = result.enrichment {
        service.spawn_enrichment(job);
    }
    Ok(result.payload)
}

#[tauri::command]
pub(crate) async fn get_grade_teacher_cache(
    state: State<'_, AppState>,
    student_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let sid = match student_id
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        Some(sid) => sid,
        None => {
            let client = state.client.write().await;
            client
                .user_info
                .as_ref()
                .map(|u| u.student_id.clone())
                .unwrap_or_default()
        }
    };
    if sid.trim().is_empty() {
        return Ok(serde_json::json!({
            "success": true,
            "by_kcbh": {},
            "semesters": {}
        }));
    }
    let service =
        grade::service::GradeService::new(state.client.clone(), grade::service::SqliteGradeCache);
    Ok(service.read_teacher_cache(&sid).unwrap_or_else(|| {
        serde_json::json!({
            "success": true,
            "by_kcbh": {},
            "semesters": {}
        })
    }))
}

#[tauri::command]
pub(crate) async fn sync_grade_teachers_current_semester(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client_handle = state.client.clone();
    let uid = {
        let client = client_handle.read().await;
        client
            .user_info
            .as_ref()
            .map(|u| u.student_id.clone())
            .ok_or_else(|| "当前未登录".to_string())?
    };
    let grades_payload = db::get_cache(DB_FILENAME, "grades_cache", &uid)
        .map_err(|e| e.to_string())?
        .map(|(data, _)| data)
        .ok_or_else(|| "暂无成绩缓存".to_string())?;
    let grades: Vec<Grade> = serde_json::from_value(
        grades_payload
            .get("data")
            .cloned()
            .unwrap_or_else(|| serde_json::Value::Array(Vec::new())),
    )
    .unwrap_or_default();
    let semester = grade::domain::current_grade_semester(&grades)
        .ok_or_else(|| "暂无可补齐的成绩学期".to_string())?;
    let courses = {
        let client = client_handle.read().await;
        client
            .fetch_course_teachers(&semester)
            .await
            .map_err(|e| e.to_string())?
    };
    let service =
        grade::service::GradeService::new(client_handle, grade::service::SqliteGradeCache);
    service.save_teacher_cache(&uid, &semester, courses)
}

#[tauri::command]
pub(crate) async fn get_grades_local(
    student_id: String,
) -> Result<Option<serde_json::Value>, String> {
    match db::get_cache(DB_FILENAME, "grades_cache", &student_id) {
        Ok(Some((data, sync_time))) => {
            let data = grade::service::merge_teacher_cache_into_payload(
                data,
                &student_id,
                &grade::service::SqliteGradeCache,
            );
            Ok(Some(serde_json::json!({
                "success": true,
                "data": data,
                "sync_time": sync_time
            })))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
