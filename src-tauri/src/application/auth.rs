//! 认证/会话领域 Application Service（Tauri Command 与 HTTP Bridge 共用）。
//!
//! 登录、会话恢复、Cookie 导入等是**写型业务**：必须修改共享 `HbutClient` 的
//! 会话状态（cookie、user_info、登录模式），因此短时持有全局写锁是必要的；
//! 网络 await 期间持有写锁可保证登录/恢复的原子性，且只读业务（快照克隆）不会
//! 与写锁互斥过长。所有持久化（会话 DB、密钥环、cookie 快照）语义统一在本层，
//! 传输层只负责参数透传与后台预热等传输特有动作。

use serde_json::json;

use super::{ApplicationContext, ApplicationError};
use crate::credential_store;
use crate::db;
use crate::UserInfo;

#[derive(Clone)]
pub struct AuthService {
    context: ApplicationContext,
}

impl AuthService {
    pub fn new(context: ApplicationContext) -> Self {
        Self { context }
    }

    /// 门户账号密码登录（含验证码流程），成功后统一持久化会话：
    /// - 保存 Cookie 会话（v2 全域 + 旧列双写）
    /// - 密钥环双写：学号键 + 登录用户名键，供静默 SSO 续期
    /// - 记住密码（`hbut:学号` 键）
    ///
    /// 返回 [`UserInfo`]；登录失败返回 [`ApplicationError::network`]（消息透传）。
    pub async fn login(
        &self,
        username: &str,
        password: &str,
        captcha: Option<String>,
        lt: Option<String>,
        execution: Option<String>,
    ) -> Result<UserInfo, ApplicationError> {
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        client
            .login(
                username,
                password,
                &captcha.unwrap_or_default(),
                &lt.unwrap_or_default(),
                &execution.unwrap_or_default(),
            )
            .await
            .map_err(|e| ApplicationError::network(e.to_string()))?;
        client.set_chaoxing_login_mode(false);

        let user_info = client.user_info.clone().ok_or_else(|| {
            ApplicationError::internal("login succeeded but user info is missing")
        })?;
        let session_key = if user_info.student_id.trim().is_empty() {
            username.to_string()
        } else {
            user_info.student_id.clone()
        };

        // 先保存 Cookie 会话（v2 全域 + 旧列双写），一码通 Token 后台预热由传输层负责
        client.set_credentials(session_key.clone(), password.to_string());
        client.persist_session_cookies(&session_key);
        let _ = db::save_user_session(
            self.context.db_path(),
            &session_key,
            &client.get_cookies(),
            password,
            "",
            Some(""),
            Some(""),
        );
        // 兼容旧客户端按登录用户名查会话：username != 学号 时双写（#578 收敛须保持原语义）
        if session_key != username {
            let _ = db::save_user_session(
                self.context.db_path(),
                username,
                &client.get_cookies(),
                password,
                "",
                Some(""),
                Some(""),
            );
            let _ = client.persist_session_cookies(username);
        }
        // 密钥环双写：学号键 + 登录用户名键，供静默 SSO 续期
        let _ = credential_store::save_password(&session_key, password);
        if session_key != username {
            let _ = credential_store::save_password(username, password);
        }
        let _ =
            credential_store::save_remembered_credential(&format!("hbut:{session_key}"), password);

        Ok(user_info)
    }

    /// 使用 Cookie 字符串恢复会话，并按会话 DB 回填密码 / 一码通 Token（静默 SSO 兜底）。
    /// 与历史 Tauri `restore_session` 行为一致：
    /// - 优先按学号查会话，未命中则回退最近一次会话（仅当密码非空）
    /// - 始终用 auth_cookie_v2 / 文件快照补全域 cookie
    /// - 回填后持久化 cookie 快照
    pub async fn restore_session(&self, cookies: &str) -> Result<UserInfo, ApplicationError> {
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        let user_info = client
            .restore_session(cookies)
            .await
            .map_err(|e| ApplicationError::network(e.to_string()))?;

        let mut session_opt =
            match db::get_user_session(self.context.db_path(), &user_info.student_id) {
                Ok(value) => value,
                Err(e) => {
                    eprintln!("[application] 加载会话凭据失败: {e}");
                    None
                }
            };
        if session_opt.is_none() {
            if let Ok(Some(latest)) = db::get_latest_user_session(self.context.db_path()) {
                if !latest.password.is_empty() {
                    session_opt = Some(db::UserSessionData {
                        cookies: latest.cookies,
                        password: latest.password,
                        one_code_token: latest.one_code_token,
                        refresh_token: latest.refresh_token,
                        token_expires_at: latest.token_expires_at,
                    });
                }
            }
        }

        // 始终先用 auth_cookie_v2 / 文件快照补全域 cookie（旧 cookies 串可能只有 4 域）
        client.hydrate_session_cookies_from_store(Some(&user_info.student_id));

        if let Some(session) = session_opt {
            if !session.password.is_empty() {
                client.set_credentials(user_info.student_id.clone(), session.password.clone());
                let _ = credential_store::save_password(&user_info.student_id, &session.password);
                let _ = credential_store::save_remembered_credential(
                    &format!("hbut:{}", user_info.student_id),
                    &session.password,
                );
            } else {
                eprintln!("[application] 会话存在但密码为空，静默 SSO 将尝试本地 DB 兜底");
            }
            if !session.one_code_token.is_empty() {
                let expires_at = chrono::DateTime::parse_from_rfc3339(&session.token_expires_at)
                    .ok()
                    .map(|dt| dt.with_timezone(&chrono::Utc));
                let refresh = if session.refresh_token.trim().is_empty() {
                    None
                } else {
                    Some(session.refresh_token.clone())
                };
                client.set_electricity_session(session.one_code_token.clone(), refresh, expires_at);
            }
            client.persist_session_cookies(&user_info.student_id);
        }

        Ok(user_info)
    }

    /// 登出：仅清理内存会话并失效学习通 SSO 缓存；
    /// 保留密钥环中的「记住密码」与会话密码，供下次自动登录/表单回填。
    pub async fn logout(&self) -> Result<(), ApplicationError> {
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        client.clear_session();
        crate::modules::chaoxing_sso::invalidate_sso_cache();
        Ok(())
    }

    /// 刷新会话（保持登录态），返回最新用户信息。
    pub async fn refresh_session(&self) -> Result<UserInfo, ApplicationError> {
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        client
            .refresh_session()
            .await
            .map_err(|e| ApplicationError::network(e.to_string()))
    }

    /// 从结构化 Cookie 快照恢复（仅写入 Cookie），随后拉取用户信息校验会话。
    pub async fn import_cookies(
        &self,
        code: Option<String>,
        auth: Option<String>,
        jwxt: Option<String>,
    ) -> Result<UserInfo, ApplicationError> {
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        client
            .restore_cookie_snapshot(code, auth, jwxt)
            .map_err(|e| ApplicationError::network(e.to_string()))?;
        client
            .fetch_user_info()
            .await
            .map_err(|e| ApplicationError::network(e.to_string()))
    }
}

/// 供 HTTP handler 复用的登录成功响应体（与历史 `/import_cookies` 响应一致）。
pub fn import_cookies_ok_payload(user: UserInfo) -> serde_json::Value {
    json!({ "success": true, "user": user })
}
