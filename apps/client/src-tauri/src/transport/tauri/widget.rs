//! Android 小组件原生桥（#1029 / #1030）。
//!
//! 旧实现由 Rust 直接覆盖 Android SharedPreferences XML，与 Android 端内存缓存
//! 不一致，且在早期的 JNI 广播错误分支可能错误释放外部持有的 Context 引用。
//! 现在仅经 Android 官方 SharedPreferences API 提交数据；具体渲染仍由 Provider 执行。
//! 无 Widget / 无网络时不会尝试唤醒 WebView，更不会把「重绘」伪装为数据更新。

#[cfg(target_os = "android")]
mod android {
    use jni::objects::{JObject, JValue};
    use std::mem::ManuallyDrop;

    const PREFS_NAME: &str = "mini_hbut_widget";

    // ndk_context 保存的是由宿主持有的 GlobalRef。绝不能把它当成临时 LocalRef
    // drop；即使某个 JNI 调用提前失败，也必须保持原始引用归宿主所有。
    pub(super) fn run(entries: Option<&[(&str, &str)]>, refresh: bool) -> Result<(), String> {
        let ctx = ndk_context::android_context();
        if ctx.vm().is_null() || ctx.context().is_null() {
            return Err("Widget Android VM/Context 未初始化".to_string());
        }
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| format!("获取 Widget Android VM 失败: {e}"))?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| format!("附加 Widget JNI 线程失败: {e}"))?;
        let borrowed_context =
            ManuallyDrop::new(unsafe { JObject::from_raw(ctx.context().cast()) });

        let result = (|| {
            // 统一拿 ApplicationContext，避免异步命令留住可能正在销毁的 Activity。
            let context = env
                .call_method(
                    &*borrowed_context,
                    "getApplicationContext",
                    "()Landroid/content/Context;",
                    &[],
                )
                .and_then(|v| v.l())
                .map_err(|e| format!("读取 ApplicationContext 失败: {e}"))?;
            if context.is_null() {
                return Err("Widget ApplicationContext 为空".to_string());
            }
            if let Some(pairs) = entries {
                write_preferences(&mut env, &context, pairs)?;
            }
            if refresh {
                send_refresh_broadcasts(&mut env, &context)?;
            }
            Ok(())
        })();

        // JavaException 若不清理，会污染当前 JNI 附加线程的后续调用。
        if env.exception_check().unwrap_or(false) {
            let _ = env.exception_clear();
            return Err(result
                .err()
                .unwrap_or_else(|| "Widget 原生调用发生 Java 异常".to_string()));
        }
        result
    }

    fn write_preferences(
        env: &mut jni::JNIEnv<'_>,
        context: &JObject<'_>,
        entries: &[(&str, &str)],
    ) -> Result<(), String> {
        let prefs_name = JObject::from(
            env.new_string(PREFS_NAME)
                .map_err(|e| format!("Widget prefs 名称创建失败: {e}"))?,
        );
        let prefs = env
            .call_method(
                context,
                "getSharedPreferences",
                "(Ljava/lang/String;I)Landroid/content/SharedPreferences;",
                &[JValue::Object(&prefs_name), JValue::Int(0)],
            )
            .and_then(|v| v.l())
            .map_err(|e| format!("打开 Widget SharedPreferences 失败: {e}"))?;
        let editor = env
            .call_method(
                &prefs,
                "edit",
                "()Landroid/content/SharedPreferences$Editor;",
                &[],
            )
            .and_then(|v| v.l())
            .map_err(|e| format!("Widget editor 创建失败: {e}"))?;

        for (key, value) in entries {
            let k = JObject::from(env.new_string(key).map_err(|e| e.to_string())?);
            let v = JObject::from(env.new_string(value).map_err(|e| e.to_string())?);
            env.call_method(
                &editor,
                "putString",
                "(Ljava/lang/String;Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;",
                &[JValue::Object(&k), JValue::Object(&v)],
            )
            .map_err(|e| format!("Widget 写入字段 {key} 失败: {e}"))?;
        }

        // last_write_ts 仅表示「写入原生存储」，不能作为联网同步成功时间。
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let version_key = JObject::from(
            env.new_string("snapshot_version")
                .map_err(|e| e.to_string())?,
        );
        let write_time_key =
            JObject::from(env.new_string("last_write_ts").map_err(|e| e.to_string())?);
        env.call_method(
            &editor,
            "putInt",
            "(Ljava/lang/String;I)Landroid/content/SharedPreferences$Editor;",
            &[JValue::Object(&version_key), JValue::Int(1)],
        )
        .map_err(|e| format!("Widget 保存版本号失败: {e}"))?;
        env.call_method(
            &editor,
            "putLong",
            "(Ljava/lang/String;J)Landroid/content/SharedPreferences$Editor;",
            &[JValue::Object(&write_time_key), JValue::Long(now_ms)],
        )
        .map_err(|e| format!("Widget 保存写入时间失败: {e}"))?;
        let committed = env
            .call_method(&editor, "commit", "()Z", &[])
            .and_then(|v| v.z())
            .map_err(|e| format!("Widget SharedPreferences commit 异常: {e}"))?;
        if !committed {
            return Err("Widget SharedPreferences commit 返回 false".to_string());
        }
        Ok(())
    }

    fn send_refresh_broadcasts(
        env: &mut jni::JNIEnv<'_>,
        context: &JObject<'_>,
    ) -> Result<(), String> {
        let package_name = env
            .call_method(context, "getPackageName", "()Ljava/lang/String;", &[])
            .and_then(|v| v.l())
            .map_err(|e| format!("Widget 包名获取失败: {e}"))?;

        for action in [
            "com.hbut.mini.widget.ACTION_REFRESH",
            "com.hbut.mini.widget.ACTION_ELECTRICITY_REFRESH",
            "com.hbut.mini.widget.ACTION_EXAM_REFRESH",
        ] {
            let action_obj = JObject::from(
                env.new_string(action)
                    .map_err(|e| format!("Widget action 构建失败: {e}"))?,
            );
            let intent = env
                .new_object(
                    "android/content/Intent",
                    "(Ljava/lang/String;)V",
                    &[JValue::Object(&action_obj)],
                )
                .map_err(|e| format!("Widget Intent 创建失败: {e}"))?;
            env.call_method(
                &intent,
                "setPackage",
                "(Ljava/lang/String;)Landroid/content/Intent;",
                &[JValue::Object(&package_name)],
            )
            .map_err(|e| format!("Widget Intent 包名设置失败: {e}"))?;
            env.call_method(
                context,
                "sendBroadcast",
                "(Landroid/content/Intent;)V",
                &[JValue::Object(&intent)],
            )
            .map_err(|e| format!("Widget 刷新广播发送失败: {e}"))?;
        }
        Ok(())
    }
}

#[cfg(not(target_os = "android"))]
mod android {
    pub(super) fn run(_entries: Option<&[(&str, &str)]>, _refresh: bool) -> Result<(), String> {
        // Android-only Tauri 命令不会影响桌面/iOS；Web 与桌面在 JS 侧也不发起写入。
        Ok(())
    }
}

const MAX_WIDGET_JSON_BYTES: usize = 512 * 1024;

async fn persist_fields(fields: Vec<(&'static str, String)>) -> Result<(), String> {
    if fields
        .iter()
        .any(|(_, value)| value.len() > MAX_WIDGET_JSON_BYTES)
    {
        return Err("Widget 快照超过 512KB 限制".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let borrowed = fields
            .iter()
            .map(|(key, value)| (*key, value.as_str()))
            .collect::<Vec<_>>();
        android::run(Some(&borrowed), false)
    })
    .await
    .map_err(|e| format!("Widget 原生写入任务失败: {e}"))?
}

#[tauri::command]
pub(crate) async fn write_widget_snapshot(
    _app: tauri::AppHandle,
    snapshot_json: String,
) -> Result<(), String> {
    persist_fields(vec![("snapshot_json", snapshot_json)]).await
}

#[tauri::command]
pub(crate) async fn write_electricity_snapshot(
    _app: tauri::AppHandle,
    json: String,
) -> Result<(), String> {
    persist_fields(vec![("electricity_json", json)]).await
}

#[tauri::command]
pub(crate) async fn write_exam_snapshot(
    _app: tauri::AppHandle,
    json: String,
) -> Result<(), String> {
    persist_fields(vec![("exam_json", json)]).await
}

#[tauri::command]
pub(crate) async fn write_widget_theme_color(
    _app: tauri::AppHandle,
    color: String,
) -> Result<(), String> {
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Widget 主题色不是 #RRGGBB".to_string());
    }
    persist_fields(vec![("theme_color", color)]).await
}

#[tauri::command]
pub(crate) async fn write_widget_theme_mode(
    _app: tauri::AppHandle,
    mode: String,
) -> Result<(), String> {
    if !matches!(mode.as_str(), "system" | "light" | "dark") {
        return Err("Widget 模式必须是 system/light/dark".to_string());
    }
    persist_fields(vec![("theme_mode", mode)]).await
}

#[tauri::command]
pub(crate) async fn clear_widget_snapshot(_app: tauri::AppHandle) -> Result<(), String> {
    // 单事务清空账号数据，不删除用户的 Widget 主题偏好。
    persist_fields(vec![
        ("snapshot_json", String::new()),
        ("electricity_json", String::new()),
        ("exam_json", String::new()),
    ])
    .await
}

#[tauri::command]
pub(crate) async fn request_widget_refresh() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| android::run(None, true))
        .await
        .map_err(|e| format!("Widget 原生刷新任务失败: {e}"))?
}

#[tauri::command]
pub(crate) async fn debug_widget_paths(
    _app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    // 调试 API 不再泄露包含学号/课表等敏感信息的 SharedPreferences XML 内容。
    Ok(serde_json::json!({
        "platform": std::env::consts::OS,
        "backend": "android-jni-sharedpreferences",
        "persistence": "mini_hbut_widget",
        "details": "diagnostics do not expose user data"
    }))
}
