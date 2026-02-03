//! 通知模块（后台任务）。
//!
//! 负责后台定时任务与通知推送逻辑的初始化。

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{sleep, Duration};
use crate::AppState;
use chrono::Local;

// Default check interval: 30 minutes
const CHECK_INTERVAL: Duration = Duration::from_secs(30 * 60);

/// 初始化后台通知任务
pub fn init_background_task(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        println!("[Background] Service started");
        
        loop {
            // Sleep first to avoid immediate check on startup (let app load)
            sleep(Duration::from_secs(10)).await;
            
            // Check settings (could be stored in DB or config)
            // For now, we assume enabled
            
            if let Err(e) = check_grades(&app).await {
                eprintln!("[Background] Grade check failed: {}", e);
            }
            
            if let Err(e) = check_exams(&app).await {
                eprintln!("[Background] Exam check failed: {}", e);
            }

            sleep(CHECK_INTERVAL).await;
        }
    });
}

async fn check_grades(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    // We need to lock the client but avoid holding it too long
    // However, HbutClient inside Mutex is not easily cloneable if meaningful state updates are needed
    // Ideally we use a new client or clone necessary cookies? 
    // Actually, we refer to the shared client.
    
    // NOTE: This might block other requests if fetching takes long, using async mutex
    let client = state.client.lock().await;

    // Only skip if not logged in
    if client.user_info.is_none() {
        return Ok(());
    }

    // Capture previous count/hash
    // For simplicity, we fetch grades. The client *refreshes* session if needed.
    // Logic: fetch_grades() returns Vec<Grade>. Compare with DB (if accessible) or memory.
    // Improving: We can store last_grade_count in AppState or just trust fetch_grades logic?
    // Let's rely on a persisted "last_grade_count" in the DB.
    
    // We can't access DB easily from here without opening a new connection.
    // Let's just fetch and see if we can detect changes. 
    // In a real robust app, we'd store a hash.
    
    // fetching...
    let grades = client.fetch_grades().await.map_err(|e| e.to_string())?;
    let student_id = &client.user_info.as_ref().unwrap().student_id;
    
    // Retrieve previous count from DB
    let cache = crate::db::get_cache(crate::DB_FILENAME, "grades_cache", student_id)
        .map_err(|e| e.to_string())?;
        
    let mut notify = false;
    if let Some((json_val, _)) = cache {
        if let Some(arr) = json_val.as_array() {
            if arr.len() < grades.len() {
                notify = true;
            }
        }
    } else {
        // First run or no cache, maybe don't notify? Or notify "Found X grades"?
        // Let's only notify if we have previous data (detected change) 
        // OR we can just save it now.
    }
    
    if notify {
        app.notification()
            .builder()
            .title("成绩有更新")
            .body("检测到新的成绩发布，请进入APP查看！")
            .show()
            .map_err(|e| e.to_string())?;
    }
    
    // Save new cache
    let json = serde_json::to_value(&grades).map_err(|e| e.to_string())?;
    crate::db::save_cache(crate::DB_FILENAME, "grades_cache", student_id, &json).ok();
    
    Ok(())
}

async fn check_exams(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    // 1. Get exams
    // Note: This relies on the client being logged in
    
    // Check if we already notified today? 
    // Ideally store "last_exam_check_date" in DB.
    
    let client = state.client.lock().await;
    if client.user_info.is_none() { return Ok(()); }
    
    let exams = client.fetch_exams(None).await.map_err(|e| e.to_string())?;
    
    let tomorrow = Local::now().date_naive().succ_opt().unwrap();
    
    for exam in exams {
        // Parse exam date: "2025-01-22"
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&exam.date, "%Y-%m-%d") {
            if date == tomorrow {
                app.notification()
                    .builder()
                    .title("考试提醒")
                    .body(format!("明天有一门考试：{}，请做好准备！", exam.course_name))
                    .show()
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    
    Ok(())
}
