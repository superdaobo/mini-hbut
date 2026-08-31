//! 账号管理领域 Tauri commands（#755）：已保存账号列表 / 一键切换 / 删除账号。
//!
//! 仅做参数与错误映射；业务逻辑（解密信封、cookie 注入、密钥环清理）在
//! `application::AuthService`。切换为纯本地操作，**不发网络登录**。

use tauri::State;

use crate::app_state::AppState;
use crate::application::{self, SavedAccountInfo};
use crate::transport::tauri::auth::UserInfo;
use crate::DB_FILENAME;

/// 列出本机登录过的全部账号（脱敏概览；不含密码与完整 cookie）。
#[tauri::command]
pub(crate) async fn list_saved_accounts(
    state: State<'_, AppState>,
) -> Result<Vec<SavedAccountInfo>, String> {
    application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .list_saved_accounts()
    .await
    .map_err(|e| e.to_string())
}

/// 一键切换账号：解密指定学号的本地会话并加载（cookie 注入，不发网络登录）。
/// 返回新活跃账号的 [`UserInfo`]；会话失效/密钥缺失时给出明确错误且不动当前账号。
#[tauri::command]
pub(crate) async fn switch_active_account(
    state: State<'_, AppState>,
    student_id: String,
) -> Result<UserInfo, String> {
    application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .switch_active_account(&student_id)
    .await
    .map_err(|e| e.to_string())
}

/// 删除本机已保存账号（含缓存/快照/密钥环凭据清理）；
/// 删除当前活跃账号时同时退出登录态（前端再同步退出流程）。
#[tauri::command]
pub(crate) async fn delete_saved_account(
    state: State<'_, AppState>,
    student_id: String,
) -> Result<(), String> {
    application::AuthService::new(application::ApplicationContext::new(
        state.client.clone(),
        DB_FILENAME,
    ))
    .delete_saved_account(&student_id)
    .await
    .map_err(|e| e.to_string())
}