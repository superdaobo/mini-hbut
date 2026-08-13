//! 7 个固定跨端 Tauri commands（#611 必须固定的 API 语义）。
//!
//! | 能力（Issue 语义） | command 名 | 说明 |
//! |---|---|---|
//! | configure | bg_configure | 保存用户配置并更新系统调度（骨架阶段只落盘，真实调度由 #612/#613） |
//! | disable | bg_disable | 关闭系统调度，可选保留诊断状态 |
//! | syncContext | bg_sync_context | 更新非敏感后台上下文（敏感材料禁止进入本 DTO） |
//! | getState | bg_get_state | 返回统一 BackgroundCheckState |
//! | runNow | bg_run_now | 开发/调试一次性执行入口（JS->Rust->native->state/event->JS 闭环） |
//! | peekEvents | bg_peek_events | 只读 event inbox（#614：同步成功后再 ack 的 at-least-once 前提） |
//! | consumeEvents | bg_consume_events | 读取并清理 native event inbox（支持按 id 精确 ack） |
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
use crate::state::{NativeRunner, PluginState};

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
    // #614 收口 #612 bug：配置落盘后必须同步 native 系统调度
    // （Android WorkManager 唯一周期 work / iOS BGAppRefresh request），
    // 否则首次 enable 不会注册真实后台调度。native 失败如实返回错误。
    let config_json = serde_json::to_string(&config).map_err(|e| format!("序列化配置失败: {e}"))?;
    let runner = MobileRunner::new(state.platform(), state.store_dir());
    if let Some(result) = runner.configure_native(&config_json) {
        result.map_err(|e| format!("更新系统调度失败: {e}"))?;
    }
    Ok(config)
}

/// disable：关闭系统调度；keepDiagnostics=true 时保留 last_run/error 诊断字段。
#[tauri::command]
pub fn bg_disable<R: Runtime>(
    app: AppHandle<R>,
    keep_diagnostics: Option<bool>,
) -> Result<BackgroundCheckState, String> {
    let keep = keep_diagnostics.unwrap_or(false);
    let state = plugin_state(&app)?;
    state.disable(keep)?;
    // 同步取消 native 系统调度（WorkManager 周期 work / BGAppRefresh request）。
    let runner = MobileRunner::new(state.platform(), state.store_dir());
    if let Some(result) = runner.disable_native(keep) {
        result.map_err(|e| format!("取消系统调度失败: {e}"))?;
    }
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
    // 转发 native：iOS 在 context 就绪后补提交 BGAppRefresh 调度；Android 落盘幂等。
    let context_json =
        serde_json::to_string(&context).map_err(|e| format!("序列化 context 失败: {e}"))?;
    let runner = MobileRunner::new(state.platform(), state.store_dir());
    if let Some(result) = runner.sync_context_native(&context_json) {
        result.map_err(|e| format!("native 同步 context 失败: {e}"))?;
    }
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
    // 真实 native 承载：desktop/web no-op、Android JNI、iOS FFI。
    let runner = MobileRunner::new(state.platform(), state.store_dir());
    state.perform_run_now(&request, &runner)?;
    Ok(state.get_state())
}

/// peekEvents：读取 event inbox（先与磁盘合并），不删除任何条目。
/// 与 consumeEvents 的区别：#614 at-least-once 消费链「先同步、后 ack」的前提——
/// App 读取到事件后如果 Rust 完整同步失败，事件必须保留以便下次 resume 重试。
#[tauri::command]
pub fn bg_peek_events<R: Runtime>(
    app: AppHandle<R>,
    limit: Option<usize>,
) -> Result<ConsumeEventsResult, String> {
    plugin_state(&app)?.peek_events(limit)
}

/// consumeEvents：ack 语义。`ids` 非空时只删除匹配 id 的事件（精确 ack，
/// 前端在完整同步成功后调用，账号隔离不误删其他 scope 事件）；
/// 缺省保持 #611 固定语义（limit FIFO drain）。
#[tauri::command]
pub fn bg_consume_events<R: Runtime>(
    app: AppHandle<R>,
    limit: Option<usize>,
    ids: Option<Vec<String>>,
) -> Result<ConsumeEventsResult, String> {
    plugin_state(&app)?.consume_events(limit, ids)
}

/// clearContext：账号退出/切换时清理对应后台上下文、状态与事件。
/// scope 缺省时按当前生效 scope 清理。
#[tauri::command]
pub fn bg_clear_context<R: Runtime>(
    app: AppHandle<R>,
    scope: Option<String>,
) -> Result<ClearContextResult, String> {
    let state = plugin_state(&app)?;
    let result = state.clear_context(&scope)?;
    // 转发 native 清理（Android baseline runtime / iOS Keychain 安全材料），
    // 保证账号隔离在两端同时生效；native 失败如实返回错误（Rust 侧清理已完成）。
    if let Some(target) = scope.clone().or_else(|| state.current_scope()) {
        let runner = MobileRunner::new(state.platform(), state.store_dir());
        if let Some(native_result) = runner.clear_context_native(&target) {
            native_result.map_err(|e| format!("native 清理失败: {e}"))?;
        }
    }
    Ok(result)
}
