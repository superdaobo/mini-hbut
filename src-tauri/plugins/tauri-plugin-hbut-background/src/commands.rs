//! 7 个固定跨端 Tauri commands（#611 必须固定的 API 语义）。
//!
//! | 能力（Issue 语义） | command 名 | 说明 |
//! |---|---|---|
//! | configure | bg_configure | 保存用户配置并更新系统调度（骨架阶段只落盘，真实调度由 #612/#613） |
//! | disable | bg_disable | 关闭系统调度，可选保留诊断状态 |
//! | syncContext | bg_sync_context | 更新非敏感后台上下文（敏感材料禁止进入本 DTO） |
//! | getState | bg_get_state | 返回统一 BackgroundCheckState |
//! | runNow | bg_run_now | 开发/调试一次性执行入口（JS->Rust->native->state/event->JS 闭环） |
//! | consumeEvents | bg_consume_events | 读取并清理 native event inbox |
//! | clearContext | bg_clear_context | 账号退出/切换时按 scope 清理 |
//!
//! 前端通过 `plugin:hbut-background|<command>` 调用（Tauri 2 插件 IPC 命名）。
//! 注意：命令参数必须显式标注 `R: Runtime` 泛型，否则 `AppHandle` 会默认 Wry，
//! 导致插件 `init<R>` 的 R 被错误固定为 Wry（官方插件模板同样写法）。

use tauri::{AppHandle, Manager, Runtime};

use crate::dto::{
    BackgroundCheckState, BackgroundConfig, BackgroundContext, ClearContextResult,
    ConsumeEventsResult, RunNowRequest,
};
use crate::mobile::MobileRunner;
use crate::state::PluginState;

/// 取插件托管状态；未初始化时返回可读错误。
fn plugin_state<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, PluginState>, String> {
    app.try_state::<PluginState>()
        .ok_or_else(|| "hbut-background 插件状态未初始化（插件未注册或 setup 失败）".to_string())
}

/// configure：保存用户选择，并在支持的平台更新系统调度。
#[tauri::command]
pub fn bg_configure<R: Runtime>(
    app: AppHandle<R>,
    config: BackgroundConfig,
) -> Result<BackgroundConfig, String> {
    let state = plugin_state(&app)?;
    state.configure(&config)?;
    // 系统调度更新：Android WorkManager / iOS BGAppRefresh 由 #612/#613
    // 读取同一份持久化配置后自行调度，此处只保证配置已原子落盘。
    Ok(config)
}

/// disable：关闭系统调度；keepDiagnostics=true 时保留 last_run/error 诊断字段。
#[tauri::command]
pub fn bg_disable<R: Runtime>(
    app: AppHandle<R>,
    keep_diagnostics: Option<bool>,
) -> Result<BackgroundCheckState, String> {
    let state = plugin_state(&app)?;
    state.disable(keep_diagnostics.unwrap_or(false))?;
    Ok(state.get_state())
}

/// syncContext：更新后台执行所需最小上下文。
/// JS 只能提交非敏感控制信息；敏感认证材料由 Rust 会话层直接交给 native（#608 红线 2）。
#[tauri::command]
pub fn bg_sync_context<R: Runtime>(
    app: AppHandle<R>,
    context: BackgroundContext,
) -> Result<BackgroundContext, String> {
    let state = plugin_state(&app)?;
    state.sync_context(&context)?;
    Ok(context)
}

/// getState：返回统一后台检查状态（真实 platform/source，不伪造 ready）。
#[tauri::command]
pub fn bg_get_state<R: Runtime>(app: AppHandle<R>) -> Result<BackgroundCheckState, String> {
    Ok(plugin_state(&app)?.get_state())
}

/// runNow：开发/调试一次性执行入口，完成 JS->Rust->native->state/event->JS 闭环。
/// 骨架阶段返回 synthetic/no-business 结果，接口与后续真实业务兼容。
#[tauri::command]
pub fn bg_run_now<R: Runtime>(
    app: AppHandle<R>,
    request: Option<RunNowRequest>,
) -> Result<BackgroundCheckState, String> {
    let state = plugin_state(&app)?;
    let request = request.unwrap_or(RunNowRequest {
        scope: None,
        force_synthetic: None,
    });
    // 真实 native 承载：desktop/web no-op、Android JNI、iOS synthetic。
    let runner = MobileRunner::new(state.platform());
    state.perform_run_now(&request, &runner)?;
    Ok(state.get_state())
}

/// consumeEvents：返回待处理 background event，并按明确语义标记/清理。
#[tauri::command]
pub fn bg_consume_events<R: Runtime>(
    app: AppHandle<R>,
    limit: Option<usize>,
) -> Result<ConsumeEventsResult, String> {
    plugin_state(&app)?.consume_events(limit)
}

/// clearContext：账号退出/切换时清理对应后台上下文、状态与事件。
/// scope 缺省时按当前生效 scope 清理。
#[tauri::command]
pub fn bg_clear_context<R: Runtime>(
    app: AppHandle<R>,
    scope: Option<String>,
) -> Result<ClearContextResult, String> {
    plugin_state(&app)?.clear_context(&scope)
}
