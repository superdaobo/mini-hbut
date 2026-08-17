//! Android Widget 快照写入 Tauri commands（SharedPreferences XML）。

use tauri::Manager;

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

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        escape_xml(&snapshot_json),
        electricity_json,
        exam_json,
        theme_color,
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
    let prefs_dir = resolve_shared_prefs_dir(&app)?;
    let prefs_file = prefs_dir.join("mini_hbut_widget.xml");

    if prefs_file.exists() {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let xml_content = format!(
            r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json"></string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
            now_ms
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

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <string name="theme_color">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json,
        electricity_json,
        exam_json,
        escape_xml(&color),
        now_ms
    );

    atomic_write_file(&prefs_file, xml_content.as_bytes())
        .await
        .map_err(|e| format!("写入主题色失败: {}", e))?;
    Ok(())
}

/// 写入电费快照到 SharedPreferences
#[tauri::command]
pub(crate) async fn write_electricity_snapshot(
    app: tauri::AppHandle,
    json: String,
) -> Result<(), String> {
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

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json,
        escape_xml(&json),
        exam_json,
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

    let xml_content = format!(
        r#"<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="snapshot_json">{}</string>
    <string name="electricity_json">{}</string>
    <string name="exam_json">{}</string>
    <int name="snapshot_version" value="1" />
    <long name="last_write_ts" value="{}" />
</map>
"#,
        snapshot_json,
        electricity_json,
        escape_xml(&json),
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
    let tmp_path = path.with_file_name(format!("{}.{}.tmp", file_name, std::process::id()));
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
