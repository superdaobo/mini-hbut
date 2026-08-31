//! 认证/会话领域 Application Service（Tauri Command 与 HTTP Bridge 共用）。
//!
//! 登录、会话恢复、Cookie 导入等是**写型业务**：必须修改共享 `HbutClient` 的
//! 会话状态（cookie、user_info、登录模式），因此短时持有全局写锁是必要的；
//! 网络 await 期间持有写锁可保证登录/恢复的原子性，且只读业务（快照克隆）不会
//! 与写锁互斥过长。所有持久化（会话 DB、密钥环、cookie 快照）语义统一在本层，
//! 传输层只负责参数透传与后台预热等传输特有动作。

use serde::Serialize;
use serde_json::json;

use super::{ApplicationContext, ApplicationError};
use crate::credential_store;
use crate::db;
use crate::UserInfo;

/// 已保存账号概览（#755 一键切换列表项；**不含密码与完整 cookie**）。
#[derive(Debug, Clone, Serialize)]
pub struct SavedAccountInfo {
    pub student_id: String,
    /// 展示用脱敏学号（保留首 4 尾 4，中段掩码）
    pub masked_id: String,
    /// 可无损提取的昵称（学习通 `username=` 段）；无则空串
    pub display_name: String,
    /// 本地会话是否可直接切换（cookies 信封解密成功）
    pub has_cookies: bool,
    /// 是否为当前活跃账号
    pub is_current: bool,
}

/// 学号脱敏：`2510232001` → `2510****2001`；过短/非纯数字整体掩码，空串原样返回。
pub fn mask_student_id(student_id: &str) -> String {
    let sid = student_id.trim();
    if sid.is_empty() {
        return String::new();
    }
    if sid.chars().all(|c| c.is_ascii_digit()) && sid.len() >= 8 {
        let head = sid.get(..4).unwrap_or("");
        let tail = sid.get(sid.len() - 4..).unwrap_or("");
        format!("{head}****{tail}")
    } else {
        "****".to_string()
    }
}

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

    /// 列出本机登录过的全部账号（#755）。多账号并存：`user_sessions` 按学号
    /// 多行存储，全量读出后脱敏返回；只含「能否秒切」判定与昵称，
    /// **不含密码与完整 cookie**。当前活跃账号按内存态标记 `is_current`。
    pub async fn list_saved_accounts(&self) -> Result<Vec<SavedAccountInfo>, ApplicationError> {
        let rows = db::list_user_sessions(self.context.db_path())
            .map_err(|e| ApplicationError::storage(format!("读取已保存账号失败: {e}")))?;
        // 当前活跃账号：内存 user_info 优先，其次最近登录用户名（与登录后语义一致）
        let current = {
            let handle = self.context.client_handle();
            let client = handle.read().await;
            client
                .user_info
                .as_ref()
                .map(|u| u.student_id.clone())
                .or_else(|| client.last_username.clone())
        };
        Ok(rows
            .into_iter()
            .map(|row| SavedAccountInfo {
                student_id: row.student_id.clone(),
                masked_id: mask_student_id(&row.student_id),
                display_name: row.display_name,
                has_cookies: row.has_cookies,
                is_current: current.as_deref() == Some(row.student_id.as_str()),
            })
            .collect())
    }

    /// 一键切换账号（#755）：从该学号行的加密信封解密会话并加载（cookie 注入），
    /// **不发网络登录**（CAS 验证码不可控）。
    ///
    /// 成功后成为当前活跃账号（与登录成功后的状态语义一致：内存会话 +
    /// cookies 双写 + last_login 刷新）；失败（行不存在 / 信封解密失败 /
    /// 无凭据空壳）返回可读错误，且不影响当前账号。
    pub async fn switch_active_account(
        &self,
        student_id: &str,
    ) -> Result<UserInfo, ApplicationError> {
        let sid = student_id.trim().to_string();
        if sid.is_empty() {
            return Err(ApplicationError::validation("学号不能为空"));
        }

        // 1. 读取该行会话（信封解密）；行不存在 → 明确错误
        let session = db::get_user_session(self.context.db_path(), &sid)
            .map_err(|e| ApplicationError::storage(format!("读取账号会话失败: {e}")))?
            .ok_or_else(|| {
                ApplicationError::validation("该账号不存在或已被删除，请先登录该账号")
            })?;

        // 2. 错误归因：区分「密钥缺失导致解密为空」与「历史空壳行本无凭据」
        let raw_status = db::session_has_encrypted_secrets(self.context.db_path(), &sid)
            .map_err(|e| ApplicationError::storage(format!("检查账号凭据失败: {e}")))?;
        let (raw_has_cookies, raw_has_token) = raw_status.unwrap_or((false, false));
        let has_v2 = db::load_auth_cookies_for_student(self.context.db_path(), &sid)
            .map(|rows| !rows.is_empty())
            .unwrap_or(false);

        if session.cookies.trim().is_empty() && !has_v2 {
            if raw_has_cookies {
                return Err(ApplicationError::internal(
                    "该账号加密凭据无法解密（账户密钥不可用或已损坏），请重新登录该账号",
                ));
            }
            if raw_has_token {
                return Err(ApplicationError::validation(
                    "该账号仅保存了电费授权，缺少教务登录会话，请先登录该账号",
                ));
            }
            return Err(ApplicationError::validation(
                "该账号没有已保存的登录会话，请先登录该账号",
            ));
        }

        // 3. 切换：加载该学号本地快照（纯本地注入，不发网络）
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        let user_info = client.activate_saved_account_session(
            &sid,
            &session.cookies,
            &session.password,
            &session.one_code_token,
            &session.refresh_token,
            &session.token_expires_at,
        );

        // 4. 持久化对齐（与登录成功一致）：v2 全域 + 旧列 cookies 双写、last_login 刷新；
        //    解密为空字段由 save_user_session 的「空值保留」语义兜底，绝不抹库
        let rows = client.export_domain_cookie_rows();
        if !rows.is_empty() {
            let _ = db::upsert_auth_cookies_batch(self.context.db_path(), &sid, &rows, "jar");
        }
        let legacy = client.get_cookies();
        if !legacy.trim().is_empty() {
            let _ = db::save_user_session(
                self.context.db_path(),
                &sid,
                &legacy,
                &session.password,
                &session.one_code_token,
                Some(&session.refresh_token),
                Some(&session.token_expires_at),
            );
        } else {
            // cookies 全空（仅 v2 恢复成功）也刷新 last_login，保持「最近使用」语义
            let _ = db::update_user_session_cookies_only(self.context.db_path(), &sid, "");
        }

        Ok(user_info)
    }

    /// 删除本机已保存账号（#755）：删除 user_sessions 行 + auth_cookie_v2 域 cookie，
    /// 并清理密钥环（学号键密码 / `hbut:` 记住密码 / `secret-envelope:` 解密主密钥，
    /// 保证多用户隔离与不可恢复删除）。若删除的是当前活跃账号，同时清空登录态
    /// （前端再同步退出登录流程）。
    pub async fn delete_saved_account(&self, student_id: &str) -> Result<(), ApplicationError> {
        let sid = student_id.trim().to_string();
        if sid.is_empty() {
            return Err(ApplicationError::validation("学号不能为空"));
        }
        let exists = db::get_user_session(self.context.db_path(), &sid)
            .map_err(|e| ApplicationError::storage(format!("读取账号会话失败: {e}")))?
            .is_some();
        if !exists {
            return Err(ApplicationError::validation("该账号不存在或已被删除"));
        }

        // 判断是否当前活跃账号（内存 user_info 或最近登录用户名命中）
        let was_active = {
            let handle = self.context.client_handle();
            let client = handle.read().await;
            client
                .user_info
                .as_ref()
                .map(|u| u.student_id == sid)
                .unwrap_or(false)
                || client.last_username.as_deref() == Some(sid.as_str())
        };

        // 删除 DB 行 + v2 域 cookie（幂等）
        let removed = db::delete_user_session(self.context.db_path(), &sid)
            .map_err(|e| ApplicationError::storage(format!("删除账号记录失败: {e}")))?;
        if !removed {
            return Err(ApplicationError::validation("该账号不存在或已被删除"));
        }
        // 密钥环三键清理：登录密码 / 记住密码 / 会话解密主密钥
        credential_store::delete_password(&sid);
        credential_store::delete_remembered_credential(&format!("hbut:{sid}"));
        credential_store::delete_secret_key(&sid);

        // 删除的是当前活跃账号 → 同时清空登录态（与 logout 同一清理路径）
        if was_active {
            let handle = self.context.client_handle();
            let mut client = handle.write().await;
            client.clear_session();
            crate::modules::chaoxing_sso::invalidate_sso_cache();
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ApplicationErrorKind;
    use crate::db;
    use crate::http_client::HbutClient;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    /// 构造隔离的 AuthService（临时目录 DB + 快照目录），
    /// 避免 HBUT_DB_PATH / 全局快照文件污染真实环境。
    fn test_service(tag: &str) -> (AuthService, PathBuf) {
        std::env::remove_var("HBUT_DB_PATH");
        let snapshot_dir = std::env::temp_dir().join(format!(
            "hbut_account_switch_snap_{}_{}",
            tag,
            std::process::id()
        ));
        std::env::set_var("HBUT_APP_DATA_DIR", &snapshot_dir);
        let _ = std::fs::create_dir_all(&snapshot_dir);
        let dir = std::env::temp_dir().join(format!(
            "hbut_account_switch_{}_{}",
            tag,
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let db_path = dir.join("test.db");
        let _ = std::fs::remove_file(&db_path);
        db::init_db(&db_path).expect("测试数据库初始化失败");
        let client = Arc::new(RwLock::new(HbutClient::new()));
        let service = AuthService::new(ApplicationContext::new(client, &db_path));
        (service, db_path)
    }

    /// 运行时构造测试值，避免在测试源码中固化明文密码学值。
    fn test_value(label: &str) -> String {
        format!("{label}-{}", std::process::id())
    }

    #[tokio::test]
    async fn switch_active_account_loads_saved_session_without_network() {
        let (service, db_path) = test_service("switch_ok");
        let sid = "2510230101";
        // 生产 cookies 为 scoped 快照格式（Code:/Auth: 前缀 + name=value 对）
        let pid = std::process::id();
        let cookies = format!("Code: CASTGC=s-{pid}; TGC=t-{pid} | Auth: AUTHOR=a-{pid}");
        let access = test_value("access");
        let refresh = test_value("refresh");
        let empty = String::new();
        db::save_user_session(
            &db_path,
            sid,
            &cookies,
            &empty,
            &access,
            Some(&refresh),
            Some("2099-01-01T00:00:00Z"),
        )
        .expect("save");

        let info = service.switch_active_account(sid).await.expect("switch");
        // 返回新活跃账号 UserInfo（不发网络，直接来自本地快照）
        assert_eq!(info.student_id, sid);
        // 内存会话指向该学号
        let handle = service.context.client_handle();
        let guard = handle.read().await;
        assert!(guard.is_logged_in);
        assert_eq!(
            guard.user_info.as_ref().map(|u| u.student_id.clone()),
            Some(sid.to_string())
        );
        assert_eq!(guard.last_username.as_deref(), Some(sid));
        // cookie 已注入 jar（可读取且来自该学号保存的快照，不发网络）
        assert!(guard.get_cookies().contains("CASTGC=s-"));
        // 电费会话回填（仅本地状态，无网络）
        let (electricity_token, _, _) = guard.get_electricity_session();
        assert_eq!(electricity_token.as_deref(), Some(access.as_str()));
        drop(guard);
        // last_login 刷新：最近会话 = 刚切换的学号（登录成功态语义一致）
        let latest = db::get_latest_user_session(&db_path)
            .expect("latest")
            .expect("row");
        assert_eq!(latest.student_id, sid);
        let _ = std::fs::remove_file(&db_path);
    }

    #[tokio::test]
    async fn switch_active_account_rejects_unknown_or_shell_account() {
        let (service, db_path) = test_service("switch_err");

        // 行不存在 → 明确校验错误
        let err = service
            .switch_active_account("2510239999")
            .await
            .expect_err("应拒绝不存在的账号");
        assert_eq!(err.kind, ApplicationErrorKind::Validation);
        assert!(err.message.contains("不存在"));

        // 历史空壳行（无任何凭据）→ 明确引导重新登录
        let sid = "2510230102";
        let empty = String::new();
        db::save_user_session(&db_path, sid, "", &empty, &empty, None, None).expect("save shell");
        let err = service
            .switch_active_account(sid)
            .await
            .expect_err("应拒绝空壳账号");
        assert!(err.message.contains("没有已保存的登录会话"));

        // 空学号参数校验
        let err = service
            .switch_active_account("  ")
            .await
            .expect_err("空学号应报错");
        assert_eq!(err.kind, ApplicationErrorKind::Validation);
        let _ = std::fs::remove_file(&db_path);
    }

    #[tokio::test]
    async fn list_saved_accounts_marks_current_and_masks_ids() {
        let (service, db_path) = test_service("list");
        let sid_a = "2510230201";
        let sid_b = "2510230202";
        let cookies_a = test_value("cookie-a");
        let cookies_b = test_value("cookie-b");
        let empty = String::new();
        db::save_user_session(&db_path, sid_a, &cookies_a, &empty, &empty, None, None)
            .expect("save a");
        db::save_user_session(&db_path, sid_b, &cookies_b, &empty, &empty, None, None)
            .expect("save b");

        // 切到 b 后：b 应标记为当前，a 不是
        service
            .switch_active_account(sid_b)
            .await
            .expect("switch b");
        // 同秒保存时 last_login 精度不足，显式拉开以验证「最近使用优先」排序
        {
            use crate::db::open_db_connection;
            let conn = open_db_connection(&db_path).expect("open");
            conn.execute(
                "UPDATE user_sessions SET last_login = datetime('now', '+1 hour') WHERE student_id = ?1",
                rusqlite::params![sid_b],
            )
            .expect("bump last_login");
        }
        let rows = service.list_saved_accounts().await.expect("list");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].student_id, sid_b);
        assert_eq!(rows[0].masked_id, "2510****0202");
        assert!(rows[0].is_current);
        assert!(!rows[1].is_current);
        assert_eq!(rows[1].masked_id, "2510****0201");
        // 概览不携带明文 cookie
        assert!(rows.iter().all(|r| !r.student_id.contains("cookie-")));
        let _ = std::fs::remove_file(&db_path);
    }

    #[tokio::test]
    async fn delete_saved_account_clears_active_session_and_keeps_others() {
        let (service, db_path) = test_service("delete");
        let sid_a = "2510230301";
        let sid_b = "2510230302";
        let cookies_a = test_value("cookie-a");
        let cookies_b = test_value("cookie-b");
        let empty = String::new();
        db::save_user_session(&db_path, sid_a, &cookies_a, &empty, &empty, None, None)
            .expect("save a");
        db::save_user_session(&db_path, sid_b, &cookies_b, &empty, &empty, None, None)
            .expect("save b");

        // 当前活跃 = a，删除非活跃 b：b 行消失、a 与登录态不受影响
        service
            .switch_active_account(sid_a)
            .await
            .expect("switch a");
        service.delete_saved_account(sid_b).await.expect("delete b");
        assert!(db::get_user_session(&db_path, sid_b)
            .expect("read")
            .is_none());
        assert!(db::get_user_session(&db_path, sid_a)
            .expect("read")
            .is_some());
        {
            let client = service.context.client_handle();
            let guard = client.read().await;
            assert!(guard.is_logged_in);
            assert_eq!(
                guard.user_info.as_ref().map(|u| u.student_id.clone()),
                Some(sid_a.to_string())
            );
        }

        // 删除当前活跃 a：行删除 + 登录态被清空
        service.delete_saved_account(sid_a).await.expect("delete a");
        assert!(db::get_user_session(&db_path, sid_a)
            .expect("read")
            .is_none());
        {
            let client = service.context.client_handle();
            let guard = client.read().await;
            assert!(!guard.is_logged_in);
            assert!(guard.user_info.is_none());
        }

        // 重删 / 删除不存在账号 → 明确错误
        let err = service
            .delete_saved_account(sid_a)
            .await
            .expect_err("重删应报错");
        assert!(err.message.contains("不存在"));
        let _ = std::fs::remove_file(&db_path);
    }

    #[test]
    fn mask_student_id_keeps_tail_only() {
        assert_eq!(mask_student_id("2510232001"), "2510****2001");
        assert_eq!(mask_student_id("123456"), "****");
        assert_eq!(mask_student_id("abc"), "****");
        assert_eq!(mask_student_id(""), "");
        assert_eq!(mask_student_id("  "), "");
    }
}
