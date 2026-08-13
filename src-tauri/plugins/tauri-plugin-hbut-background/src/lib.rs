//! tauri-plugin-hbut-background：Mini-HBUT 自研 Tauri 2 移动后台插件骨架（#611）。
//!
//! 职责（只建管道，不实现真实成绩业务）：
//! - 7 个固定跨端 API：configure / disable / syncContext / getState / runNow / consumeEvents / clearContext；
//! - 统一 DTO（dto.rs，全部带 schema/version，与 Kotlin/Swift 骨架同构）；
//! - 持久化（store.rs）：原子写、容量上限、scope 清理、损坏/版本降级；
//! - native 分派（mobile.rs）：Android JNI / iOS / desktop|web unsupported-no-op；
//! - 认证安全：DTO 与状态永不包含认证材料；JS 只能提交非敏感控制信息（#608 红线 2）。
//!
//! 注册方式：主应用 `tauri::Builder::default().plugin(tauri_plugin_hbut_background::init())`。
//! 前端调用：`invoke('plugin:hbut-background|bg_get_state')` 等（见 js/ 封装）。

pub mod dto;
pub mod state;

mod commands;
mod mobile;
mod store;

pub use dto::{
    BackgroundCheckState, BackgroundConfig, BackgroundContext, BackgroundEvent, BackgroundPlatform,
    BackgroundSource, ClearContextResult, ConsumeEventsResult, RunNowRequest, RunSummary,
    BG_SCHEMA_VERSION, EVENT_INBOX_CAP,
};
pub use state::PluginState;

/// 注册插件（Tauri 2 plugin builder）。
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("hbut-background")
        .invoke_handler(tauri::generate_handler![
            commands::bg_configure,
            commands::bg_disable,
            commands::bg_sync_context,
            commands::bg_get_state,
            commands::bg_run_now,
            commands::bg_consume_events,
            commands::bg_clear_context,
        ])
        .setup(|app, _api| {
            use tauri::Manager;
            // 数据目录：{app_data}/background（与主业务 DB 目录同根，互不干扰）。
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|e| std::io::Error::other(format!("解析应用数据目录失败: {e}")))?;
            let store = store::BackgroundStore::new(app_data.join("background"))
                .map_err(|e| std::io::Error::other(format!("初始化后台存储失败: {e}")))?;
            // 平台/source 为运行时真实值（不伪造）。
            let plugin_state =
                PluginState::load(store, mobile::current_platform(), mobile::current_source());
            app.manage(plugin_state);
            Ok(())
        })
        .build()
}
