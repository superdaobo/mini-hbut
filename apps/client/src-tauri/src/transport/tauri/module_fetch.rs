//! 模块受控请求的 Tauri 命令入口（#1167 T06）。
//!
//! 只有**主窗口**可以调用（模块 iframe / 模块独立窗口没有 IPC，且这里再做一次标签校验）。
//! 真正的准入判定在 `modules::module_session_fetch`：能力登记表 + 参数过滤 + 会话 Cookie
//! 自动携带 + 上限。前端 SDK 只是转发，不允许自行发请求。

use crate::app_state::AppState;
use crate::modules::module_session_fetch::{
    fetch_with_session, ModuleFetchRequest, ModuleFetchResponse,
};

/// 仅主窗口可发起受控请求。
fn module_fetch_allowed_for_window(label: &str) -> bool {
    label == "main"
}

#[tauri::command]
pub(crate) async fn module_session_fetch(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AppState>,
    request: ModuleFetchRequest,
) -> Result<ModuleFetchResponse, String> {
    if !module_fetch_allowed_for_window(window.label()) {
        return Err("MODULE_FORBIDDEN_WINDOW: 受控请求仅允许宿主主窗口发起".to_string());
    }
    // 实例必须已由宿主登记（T07 的生命周期表；当前用实例 id 是否为空做最小校验）
    if request.instance_id.trim().is_empty() {
        return Err("MODULE_INSTANCE_REQUIRED: 缺少模块实例".to_string());
    }
    let client = state.client.read().await;
    let account = crate::modules::module_session_fetch::current_account(&client);
    // 是否信任由宿主在准备模块时获得（T05 的 trusted 标记）；这里不接受前端自报，
    // 先按「已验签实例登记表」为空时拒绝的策略：未登记实例 = 不可信。
    let trusted =
        crate::modules::module_instance_registry::is_trusted_instance(request.instance_id.trim());
    fetch_with_session(&client, &account, trusted, request)
        .await
        .map_err(|error| error.to_string_with_code())
}

/// 供 `lib.rs` 注册时使用（避免把命令名散落在多处）。
pub(crate) fn window_allows_module_fetch(label: &str) -> bool {
    module_fetch_allowed_for_window(label)
}

#[cfg(test)]
mod tests {
    use super::window_allows_module_fetch;

    #[test]
    fn only_main_window_may_fetch() {
        assert!(window_allows_module_fetch("main"));
        assert!(!window_allows_module_fetch("more-module-1234"));
        assert!(!window_allows_module_fetch("library-reserve-embed"));
        assert!(!window_allows_module_fetch("debug"));
    }
}
