//! 原生通知 Tauri commands（含 Windows toast 分支）。

#[cfg(not(target_os = "windows"))]
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
pub(crate) fn send_test_notification_native(
    app: tauri::AppHandle,
    title: Option<String>,
    body: Option<String>,
) -> Result<(), String> {
    send_native_notification(
        app,
        None,
        None,
        title,
        body,
        Some("notifications".to_string()),
    )
}

#[tauri::command]
pub(crate) fn send_local_notification_native(
    app: tauri::AppHandle,
    id: Option<i32>,
    channel_id: Option<String>,
    title: Option<String>,
    body: Option<String>,
    target_view: Option<String>,
) -> Result<(), String> {
    send_native_notification(app, id, channel_id, title, body, target_view)
}

fn send_native_notification(
    app: tauri::AppHandle,
    id: Option<i32>,
    channel_id: Option<String>,
    title: Option<String>,
    body: Option<String>,
    target_view: Option<String>,
) -> Result<(), String> {
    let real_title = title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Mini-HBUT".to_string());
    let real_body = body
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "这是一个测试通知。".to_string());
    let real_target_view = target_view
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "notifications".to_string());

    #[cfg(target_os = "windows")]
    {
        // Windows toast 不支持本地通知 id/channel/extra；点击默认回通知中心。
        let _ = (id, channel_id, real_target_view);
        return send_windows_native_notification(&app, &real_title, &real_body);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut builder = app
            .notification()
            .builder()
            .title(real_title)
            .body(real_body)
            .extra("view", real_target_view)
            .auto_cancel();

        if let Some(id) = id {
            builder = builder.id(id);
        }
        if let Some(channel_id) = channel_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            builder = builder.channel_id(channel_id);
        }

        builder
            .show()
            .map_err(|e| format!("send native notification failed: {}", e))
    }
}

#[cfg(target_os = "windows")]
fn send_windows_native_notification(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
) -> Result<(), String> {
    let mut notification = notify_rust::Notification::new();
    notification.summary(title).body(body).auto_icon();

    let exe = tauri::utils::platform::current_exe()
        .map_err(|e| format!("resolve current exe failed: {}", e))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "resolve current exe directory failed".to_string())?;
    let curr_dir = exe_dir.display().to_string();
    let sep = std::path::MAIN_SEPARATOR;

    // Windows 开发态没有安装后的 AppUserModelID，使用 PowerShell AppID 更容易投递；
    // 安装包运行时再使用应用 identifier，保持正式通知归属 Mini-HBUT。
    if !(curr_dir.ends_with(format!("{sep}target{sep}debug").as_str())
        || curr_dir.ends_with(format!("{sep}target{sep}release").as_str()))
    {
        notification.app_id(&app.config().identifier);
    }

    notification
        .show()
        .map(|_| ())
        .map_err(|e| format!("send windows notification failed: {}", e))
}

#[cfg(not(target_os = "windows"))]
fn map_notification_permission_state(state: tauri_plugin_notification::PermissionState) -> String {
    match state {
        tauri_plugin_notification::PermissionState::Granted => "granted".to_string(),
        tauri_plugin_notification::PermissionState::Denied => "denied".to_string(),
        tauri_plugin_notification::PermissionState::Prompt
        | tauri_plugin_notification::PermissionState::PromptWithRationale => "default".to_string(),
    }
}

#[tauri::command]
pub(crate) fn get_notification_permission_native(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        return Ok("granted".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    app.notification()
        .permission_state()
        .map(map_notification_permission_state)
        .map_err(|e| format!("get native notification permission failed: {}", e))
}

#[tauri::command]
pub(crate) fn request_notification_permission_native(
    app: tauri::AppHandle,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        return Ok("granted".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    app.notification()
        .request_permission()
        .map(map_notification_permission_state)
        .map_err(|e| format!("request native notification permission failed: {}", e))
}
