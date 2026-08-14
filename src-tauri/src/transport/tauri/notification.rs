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

/// 系统预调度本地通知（#610）：把未来某个时刻的课程/考试提醒登记给操作系统。
///
/// 调研结论（铁证见下方 schedule_serialization_format_probe 测试）：
/// tauri-plugin-notification 2.3.3 的 Rust `Schedule::At` 序列化输出固定为
/// `yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSSZ`（9 位小数 + offset），而 Android 端
/// `NotificationSchedule.kt` 的 Jackson pattern 与 iOS 端 `Notification.swift` 的
/// DateFormatter 均要求 `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`：
/// - Android：Jackson 自定义 pattern 解析失败后会回退到标准 ISO-8601 解析，可解析 9 位小数；
/// - iOS：DateFormatter 无回退，必然返回 invalidDate，schedule 会整体失败。
/// 因此 iOS 端本命令会返回明确错误；Android 端依赖 Jackson 回退解析，需真机确认。
///
/// 参数 at_epoch_secs 为 UTC epoch 秒（绝对时刻，不受设备时区影响）。
#[tauri::command]
pub(crate) fn schedule_local_notification_native(
    app: tauri::AppHandle,
    id: i32,
    channel_id: Option<String>,
    title: Option<String>,
    body: Option<String>,
    target_view: Option<String>,
    at_epoch_secs: i64,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Windows toast（notify-rust）不支持系统预调度，明确拒绝而非假装成功。
        let _ = (app, id, channel_id, title, body, target_view, at_epoch_secs);
        return Err("Windows 桌面端不支持系统预调度本地通知".to_string());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let real_title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "Mini-HBUT".to_string());
        let real_body = body
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "这是一条课程/考试提醒。".to_string());
        let real_target_view = target_view
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "notifications".to_string());

        // 用 chrono 把 epoch 秒格式化为移动端可解析的 ISO 字符串（毫秒 + 字面 Z），
        // 再经 serde_json 反序列化成插件的 Schedule（避开对 time crate 的直接依赖）。
        let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(at_epoch_secs, 0)
            .ok_or_else(|| format!("invalid schedule timestamp: {at_epoch_secs}"))?;
        let iso = datetime.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let schedule: tauri_plugin_notification::Schedule =
            serde_json::from_value(serde_json::json!({
                "at": {
                    "date": iso,
                    "repeating": false,
                    "allowWhileIdle": true
                }
            }))
            .map_err(|e| format!("build schedule payload failed: {e}"))?;

        let mut builder = app
            .notification()
            .builder()
            .id(id)
            .title(real_title)
            .body(real_body)
            .extra("view", real_target_view)
            .auto_cancel()
            .schedule(schedule);

        if let Some(channel_id) = channel_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            builder = builder.channel_id(channel_id);
        }

        builder
            .show()
            .map_err(|e| format!("schedule native notification failed: {e}"))
    }
}

/// 查询 Mini-HBUT 自己登记的系统 pending 提醒（含 id 与触发时刻）。
#[tauri::command]
pub(crate) fn get_pending_local_notifications_native(
    app: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    // tauri-plugin-notification 2.3.3 仅在移动端实现提供 Notification::pending()
    // （desktop.rs 无此方法，Linux/macOS 桌面编译会 E0599）。
    // 桌面端（Windows/macOS/Linux）统一返回空列表，与 Windows 分支行为一致。
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let pending = app
            .notification()
            .pending()
            .map_err(|e| format!("query pending notifications failed: {e}"))?;
        let mut items = Vec::with_capacity(pending.len());
        for item in pending {
            let at_epoch_secs = match item.schedule() {
                tauri_plugin_notification::Schedule::At { date, .. } => Some(date.unix_timestamp()),
                _ => None,
            };
            items.push(serde_json::json!({
                "id": item.id(),
                "title": item.title(),
                "body": item.body(),
                "at_epoch_secs": at_epoch_secs,
            }));
        }
        Ok(items)
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

/// 取消指定的系统 pending 提醒（只允许取消 Mini-HBUT 自己登记过的 id）。
#[tauri::command]
pub(crate) fn cancel_local_notifications_native(
    app: tauri::AppHandle,
    ids: Vec<i32>,
) -> Result<(), String> {
    // 同 get_pending：Notification::cancel() 仅移动端实现提供，桌面端直接返回成功。
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        app.notification()
            .cancel(ids)
            .map_err(|e| format!("cancel pending notifications failed: {e}"))
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let _ = (app, ids);
        Ok(())
    }
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

#[cfg(test)]
mod schedule_format_tests {
    // 调研事实锁定（#610）：
    // tauri-plugin-notification 2.3.3 的 Rust Schedule::At 序列化输出固定为
    // `yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSSZ`（9 位小数），与移动端
    // `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` 解析 pattern 不兼容：
    // - Android（Jackson）自定义 pattern 失败后可回退标准 ISO-8601 解析；
    // - iOS（DateFormatter）无回退，schedule 必失败（invalidDate）。
    // 若插件升级修复序列化格式，此测试将失败，需重新评估 iOS 端可行性。
    #[test]
    fn locks_plugin_schedule_serialization_format() {
        let inputs = ["2026-08-20T07:30:00.000Z", "2026-08-20T07:30:00.123Z"];
        for input in inputs {
            let value = serde_json::json!({
                "at": { "date": input, "repeating": false, "allowWhileIdle": true }
            });
            let schedule = serde_json::from_value::<tauri_plugin_notification::Schedule>(value)
                .unwrap_or_else(|e| panic!("schedule deserialize failed for {input}: {e}"));
            let out = serde_json::to_string(&schedule).unwrap();
            // 断言 Rust 序列化输出始终为 9 位小数秒（移动端 pattern 无法直接匹配）
            assert!(
                out.contains(".000000000Z") || out.contains(".123000000Z"),
                "unexpected serialized schedule: {out}"
            );
        }
    }

    #[test]
    fn builds_rfc3339_millis_with_utc_z() {
        // 与 schedule_local_notification_native 相同的日期格式化路径
        let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(1_787_211_000, 0).unwrap();
        let iso = datetime.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        assert_eq!(iso, "2026-08-20T07:30:00.000Z");
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
