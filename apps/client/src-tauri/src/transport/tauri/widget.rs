//! Android Widget 快照写入 Tauri commands（SharedPreferences XML）。

use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Manager;

// #891：所有 Widget SharedPreferences 的 read-modify-write 必须串行。
// 启动阶段 theme_mode/theme_color/snapshot 可能并发到达；若不加锁，
// 后写入者会基于旧 XML 覆盖先写入者，且旧实现还会竞争同一个 tmp 文件。
static WIDGET_PREFS_WRITE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static WIDGET_TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "android")]
fn trigger_android_widget_refresh() -> Result<(), String> {
    use jni::objects::{JObject, JValue};

    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("获取 Android VM 失败: {}", e))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("附加 Android 线程失败: {}", e))?;
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let package_name = env
        .call_method(&context, "getPackageName", "()Ljava/lang/String;", &[])
        .and_then(|value| value.l())
        .map_err(|e| format!("读取 Android packageName 失败: {}", e))?;

    for action_name in [
        "com.hbut.mini.widget.ACTION_REFRESH",
        "com.hbut.mini.widget.ACTION_ELECTRICITY_REFRESH",
        "com.hbut.mini.widget.ACTION_EXAM_REFRESH",
    ] {
        let action = env
            .new_string(action_name)
            .map_err(|e| format!("创建 Widget refresh action 失败: {}", e))?;
        let action_obj = JObject::from(action);
        let intent = env
            .new_object(
                "android/content/Intent",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&action_obj)],
            )
            .map_err(|e| format!("创建 Widget refresh Intent 失败: {}", e))?;
        env.call_method(
            &intent,
            "setPackage",
            "(Ljava/lang/String;)Landroid/content/Intent;",
            &[JValue::Object(&package_name)],
        )
        .map_err(|e| format!("限制 Widget refresh Intent 包名失败: {}", e))?;
        env.call_method(
            &context,
            "sendBroadcast",
            "(Landroid/content/Intent;)V",
            &[JValue::Object(&intent)],
        )
        .map_err(|e| format!("发送 Widget refresh 广播失败: {}", e))?;
    }

    // context 句柄由 Android 生命周期管理，此处仅借用。
    std::mem::forget(context);
    Ok(())
}

#[cfg(not(target_os = "android"))]
fn trigger_android_widget_refresh() -> Result<(), String> {
    Ok(())
}

fn resolve_shared_prefs_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // 方案 1：从 data_dir 推导
    if let Ok(data_dir) = app.path().data_dir() {
        // 向上遍历找到包名目录
        let mut current = data_dir.as_path();
        for _ in 0..5 {
            if let Some(name) = current.file_name() {
                if name.to_string_lossy().contains("com.hbut.mini") {
                    return Ok(current.join("shared_prefs"));
                }
            }
            match current.parent() {
                Some(parent) => current = parent,
                None => break,
            }
        }
        // 如果没找到包名目录，尝试 data_dir 的 parent
        if let Some(parent) = data_dir.parent() {
            let candidate = parent.join("shared_prefs");
            return Ok(candidate);
        }
    }

    // 方案 2：硬编码路径（Android 标准位置）
    let hardcoded = std::path::PathBuf::from("/data/data/com.hbut.mini/shared_prefs");
    Ok(hardcoded)
}

/// 将 widget 快照 JSON 写入 Android SharedPreferences XML 文件。
/// SharedPreferences 路径：/data/data/{package}/shared_prefs/mini_hbut_widget.xml
/// Widget 的 WidgetDataStore.kt 从同一文件读取。
#[tauri::command]
pub(crate) async fn write_widget_snapshot(
    app: tauri::AppHandle,
    snapshot_json: String,
) -> Result<(), String> {
    let _guard = WIDGET_PREFS_WRITE_LOCK.lock().await;
    let prefs_dir = resolve_shared_prefs_dir(&app)?;

    tokio::fs::create_dir_all(&prefs_dir)
        .await
        .map_err(|e| format!("创建 shared_prefs 目录失败: {}", e))?;

    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    // 读取现有内容保留其他字段
    let existing = tokio::fs::read_to_string(&prefs_file)
        .await
        .unwrap_or_default();
    let electricity_json = extract_xml_string(&existing, "electricity_json");
    let exam_json = extract_xml_string(&existing, "exam_json");
    let theme_color = extract_xml_string(&existing, "theme_color");
    let theme_mode = extract_xml_string(&existing, "theme_mode");

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <string name="theme_mode">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        escape_xml(&snapshot_json),
        electricity_json,
        exam_json,
        theme_color,
        theme_mode,
        now_ms
    );

    atomic_write_file(&prefs_file, xml_content.as_bytes())
        .await
        .map_err(|e| format!("写入 widget 快照失败: {} (path: {:?})", e, prefs_file))?;

    Ok(())
}

/// 清空 widget 快照数据
#[tauri::command]
pub(crate) async fn clear_widget_snapshot(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = WIDGET_PREFS_WRITE_LOCK.lock().await;
    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");

    if prefs_file.exists() {
        let existing = tokio::fs::read_to_string(&prefs_file)
            .await
            .unwrap_or_default();
        let theme_color = extract_xml_string(&existing, "theme_color");
        let theme_mode = extract_xml_string(&existing, "theme_mode");
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let xml_content = format!(
            r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json"></string>
    <string name="electricity_json"></string>
    <string name="exam_json"></string>
    <string name="theme_color">{}</string>
    <string name="theme_mode">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
            theme_color, theme_mode, now_ms
        );

        atomic_write_file(&prefs_file, xml_content.as_bytes())
            .await
            .map_err(|e| format!("清空 widget 快照失败: {}", e))?;
    }

    Ok(())
}

/// 写入主题色到 SharedPreferences（供小组件读取）
#[tauri::command]
pub(crate) async fn write_widget_theme_color(
    app: tauri::AppHandle,
    color: String,
) -> Result<(), String> {
    let _guard = WIDGET_PREFS_WRITE_LOCK.lock().await;
    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    tokio::fs::create_dir_all(&prefs_dir)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))?;

    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");
    let existing = tokio::fs::read_to_string(&prefs_file)
        .await
        .unwrap_or_default();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let snapshot_json = extract_xml_string(&existing, "snapshot_json");
    let electricity_json = extract_xml_string(&existing, "electricity_json");
    let exam_json = extract_xml_string(&existing, "exam_json");
    let theme_mode = extract_xml_string(&existing, "theme_mode");

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <string name="theme_mode">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json,
        electricity_json,
        exam_json,
        escape_xml(&color),
        theme_mode,
        now_ms
    );

    atomic_write_file(&prefs_file, xml_content.as_bytes())
        .await
        .map_err(|e| format!("写入主题色失败: {}", e))?;
    Ok(())
}

/// 写入主题模式到 SharedPreferences（system/light/dark）。
#[tauri::command]
pub(crate) async fn write_widget_theme_mode(
    app: tauri::AppHandle,
    mode: String,
) -> Result<(), String> {
    let _guard = WIDGET_PREFS_WRITE_LOCK.lock().await;
    let normalized = match mode.trim().to_ascii_lowercase().as_str() {
        "system" => "system",
        "light" => "light",
        "dark" => "dark",
        _ => return Err("主题模式必须为 system/light/dark".to_string()),
    };
    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    tokio::fs::create_dir_all(&prefs_dir)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))?;
    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");
    let existing = tokio::fs::read_to_string(&prefs_file)
        .await
        .unwrap_or_default();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let snapshot_json = extract_xml_string(&existing, "snapshot_json");
    let electricity_json = extract_xml_string(&existing, "electricity_json");
    let exam_json = extract_xml_string(&existing, "exam_json");
    let theme_color = extract_xml_string(&existing, "theme_color");

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <string name="theme_mode">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json, electricity_json, exam_json, theme_color, normalized, now_ms
    );

    atomic_write_file(&prefs_file, xml_content.as_bytes())
        .await
        .map_err(|e| format!("写入主题模式失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn request_widget_refresh() -> Result<(), String> {
    trigger_android_widget_refresh()
}

/// 写入电费快照到 SharedPreferences
#[tauri::command]
pub(crate) async fn write_electricity_snapshot(
    app: tauri::AppHandle,
    json: String,
) -> Result<(), String> {
    let _guard = WIDGET_PREFS_WRITE_LOCK.lock().await;
    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    tokio::fs::create_dir_all(&prefs_dir)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))?;

    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");

    // 读取现有内容并更新 electricity_json 字段
    let existing = tokio::fs::read_to_string(&prefs_file)
        .await
        .unwrap_or_default();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    // 提取现有的 snapshot_json
    let snapshot_json = extract_xml_string(&existing, "snapshot_json");
    let exam_json = extract_xml_string(&existing, "exam_json");
    let theme_color = extract_xml_string(&existing, "theme_color");
    let theme_mode = extract_xml_string(&existing, "theme_mode");

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <string name="theme_mode">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json,
        escape_xml(&json),
        exam_json,
        theme_color,
        theme_mode,
        now_ms
    );

    atomic_write_file(&prefs_file, xml_content.as_bytes())
        .await
        .map_err(|e| format!("写入电费快照失败: {}", e))?;
    Ok(())
}

/// 写入考试快照到 SharedPreferences
#[tauri::command]
pub(crate) async fn write_exam_snapshot(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let _guard = WIDGET_PREFS_WRITE_LOCK.lock().await;
    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    tokio::fs::create_dir_all(&prefs_dir)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))?;

    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");

    let existing = tokio::fs::read_to_string(&prefs_file)
        .await
        .unwrap_or_default();
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let snapshot_json = extract_xml_string(&existing, "snapshot_json");
    let electricity_json = extract_xml_string(&existing, "electricity_json");
    let theme_color = extract_xml_string(&existing, "theme_color");
    let theme_mode = extract_xml_string(&existing, "theme_mode");

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <string name="theme_mode">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json,
        electricity_json,
        escape_xml(&json),
        theme_color,
        theme_mode,
        now_ms
    );

    atomic_write_file(&prefs_file, xml_content.as_bytes())
        .await
        .map_err(|e| format!("写入考试快照失败: {}", e))?;
    Ok(())
}

/// 从 SharedPreferences XML 中提取指定 key 的 string 值
fn extract_xml_string(xml: &str, key: &str) -> String {
    let pattern = format!(r#"<string name="{}">"#, key);
    if let Some(start_idx) = xml.find(&pattern) {
        let value_start = start_idx + pattern.len();
        if let Some(end_idx) = xml[value_start..].find("</string>") {
            return xml[value_start..value_start + end_idx].to_string();
        }
    }
    String::new()
}

/// 调试命令：返回 widget 相关路径信息，用于诊断写入问题
#[tauri::command]
pub(crate) async fn debug_widget_paths(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|e| format!("ERROR: {}", e));

    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");
    let file_exists = prefs_file.exists();
    let file_content = if file_exists {
        tokio::fs::read_to_string(&prefs_file)
            .await
            .unwrap_or_else(|e| format!("READ_ERROR: {}", e))
    } else {
        "FILE_NOT_FOUND".to_string()
    };

    Ok(serde_json::json!({
        "data_dir": data_dir,
        "prefs_dir": prefs_dir.to_string_lossy().to_string(),
        "prefs_file": prefs_file.to_string_lossy().to_string(),
        "file_exists": file_exists,
        "file_content_preview": if file_content.len() > 500 { format!("{}...(truncated)", &file_content[..500]) } else { file_content },
        "platform": std::env::consts::OS,
    }))
}

/// XML 特殊字符转义
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// 原子写文件：先写同目录 `.tmp` 临时文件再 rename 覆盖目标（#550）。
/// 任一时刻磁盘上只存在完整内容，避免写一半时被 widget/其它进程读到残缺 XML。
async fn atomic_write_file(path: &std::path::Path, content: &[u8]) -> std::io::Result<()> {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "out.bin".to_string());
    let unique = WIDGET_TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let tmp_path = path.with_file_name(format!(
        "{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        unique
    ));
    tokio::fs::write(&tmp_path, content).await?;
    // rename 为原子操作（同目录/同文件系统），成功即覆盖目标
    match tokio::fs::rename(&tmp_path, path).await {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            Err(e)
        }
    }
}
