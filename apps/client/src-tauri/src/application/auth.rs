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
use crate::http_client::HbutClient;
use crate::IdentityRole;
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
    /// 身份类型（`student` / `teacher`）；历史行为空串，前端按学生展示。
    pub role: String,
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
        // 身份类型随会话落库：切换账号/离线恢复时无需再联网识别教师还是学生。
        let _ = db::save_user_session_role(
            self.context.db_path(),
            &session_key,
            user_info.role.as_str(),
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
                        role: latest.role,
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

        // 身份类型回写：登录路径已写入，这里覆盖「登录时未识别、恢复时才识别」的历史行。
        let _ = db::save_user_session_role(
            self.context.db_path(),
            &user_info.student_id,
            user_info.role.as_str(),
        );

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
                has_cookies: row.has_cookies
                    || db::load_auth_cookies_for_student(self.context.db_path(), &row.student_id)
                        .map(|cookies| !cookies.is_empty())
                        .unwrap_or(false),
                is_current: current.as_deref() == Some(row.student_id.as_str()),
                role: row.role,
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
        // 始终按 AuthService 当前数据库读取目标账号 v2 Cookie；不能由
        // HbutClient 再去读全局 DB_FILENAME，否则多实例/测试库会错库。
        let v2_rows = db::load_auth_cookies_for_student(self.context.db_path(), &sid)
            .map_err(|e| ApplicationError::storage(format!("读取账号分域 Cookie 失败: {e}")))?;
        let has_v2 = !v2_rows.is_empty();

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
            crate::IdentityRole::from_stored(&session.role),
            &v2_rows,
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

    /// 一键切换账号并**在线**确认目标身份（issue #1061 修复核心）。
    ///
    /// 与 [`Self::switch_active_account`] 的差异：本地 Cookie 注入后立即面向**目标账号**
    /// 做真实在线验证；仅在服务端否定当前会话或身份不一致时，才用该账号自身的
    /// 安全存储凭据真实重登并复验身份。返回四态结果，前端在 `online_ready` 之前
    /// 不得开放在线业务。
    ///
    /// 失败策略（绝不静默换回旧账号）：目标账号保留为当前身份（离线缓存态），
    /// 旧账号的会话行未被破坏，用户可显式切回或重新登录目标账号。
    pub async fn switch_active_account_online(
        &self,
        student_id: &str,
    ) -> Result<SwitchAccountOnlineResult, ApplicationError> {
        // 1) 本地账号激活（沿用既有语义；失败即返回错误，且不影响其他账号）
        let activated = self.switch_active_account(student_id).await?;
        let target_id = activated.student_id.trim().to_string();
        let target_role = activated.role;

        // 2) 目标账号专属凭据：严格按目标账号解析，绝不回退到其他账号
        let password = resolve_account_portal_password(self.context.db_path(), &target_id);

        // 3) 在线验证 + 必要重登（写型业务：短时持写锁，与 login/restore 语义一致）
        let handle = self.context.client_handle();
        let mut client = handle.write().await;
        let result = resolve_online_switch(&mut *client, &target_id, target_role, password).await;

        // 4) 在线就绪后对齐持久化（v2 域 Cookie + 旧列 + 权威角色），与登录成功一致
        if result.online_ready {
            let role = IdentityRole::from_stored(&result.role);
            let rows = client.export_domain_cookie_rows();
            if !rows.is_empty() {
                let _ =
                    db::upsert_auth_cookies_batch(self.context.db_path(), &target_id, &rows, "jar");
            }
            let legacy = client.get_cookies();
            let _ =
                db::update_user_session_cookies_only(self.context.db_path(), &target_id, &legacy);
            let _ = db::save_user_session_role(self.context.db_path(), &target_id, role.as_str());
            if let Some(info) = client.user_info.as_mut() {
                info.role = role;
            }
        }
        Ok(result)
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

/// 在线切号四态结果（issue #1061）。
///
/// 语义（前端据此渐进开放入口，禁止在在线确认前虚报可用）：
/// 1. `local_activated` —— 本地账号激活（加密 Cookie 注入成功）；
/// 2. `online_verified` —— 目标角色 + 账号已由服务端在线验证；
/// 3. `relogin_attempted` —— 是否已用**目标账号自身**的存储凭据发起真实重登；
/// 4. `online_ready` —— 在线就绪，可开放在线业务（等价于 `online_verified`）。
///
/// 未就绪时：`needs_login = true` 表示目标账号需要用户重新登录（凭据缺失/失效）；
/// `needs_login = false` 表示可重试的网络/维护态，不应诱导用户重新登录。
#[derive(Debug, Clone, Serialize)]
pub struct SwitchAccountOnlineResult {
    pub student_id: String,
    /// 服务端确认（或本地记录）的身份角色：`student` / `teacher`
    pub role: String,
    pub local_activated: bool,
    pub online_verified: bool,
    pub relogin_attempted: bool,
    pub online_ready: bool,
    pub needs_login: bool,
    /// 脱敏失败原因（不含账号凭据 / Cookie），供 UI 提示
    pub failure_reason: String,
}

/// 在线探测失败的归因（issue #1061）：区分「服务端否定凭据」与「网络故障」。
#[derive(Debug, Clone, PartialEq, Eq)]
enum ProbeFailure {
    /// 服务端明确否定当前会话（401/403/登录页/会话过期）。
    Rejected(String),
    /// 传输层 / 网络故障，不具备「凭据过期」的证明力。
    Network(String),
}

/// 把探测错误文案归类为「服务端否定」或「网络故障」。
///
/// 判据来自 [`HbutClient::fetch_user_info`] 的实际返回：
/// - 命中教务登录页 → `会话已过期，请重新登录`
/// - 非 200 → `获取个人信息失败: {status}`（401/403 均落此类）
/// - 传输层失败 → reqwest 的 `error sending request …` / `… timed out`
///
/// 未知错误按可重试处理：绝不据此要求用户重新登录（避免误报「会话失效」）。
fn classify_probe_failure(message: &str) -> ProbeFailure {
    let raw = message.trim();
    let lower = raw.to_lowercase();
    const NETWORK_MARKERS: [&str; 14] = [
        "error sending request",
        "timed out",
        "timeout",
        "connection",
        "connect",
        "dns",
        "resolve",
        "socket",
        "eof",
        "broken pipe",
        "network",
        "offline",
        "无法连接",
        "网络",
    ];
    if NETWORK_MARKERS.iter().any(|marker| lower.contains(marker)) {
        return ProbeFailure::Network(raw.to_string());
    }
    const REJECT_MARKERS: [&str; 12] = [
        "401",
        "403",
        "unauthorized",
        "forbidden",
        "会话已过期",
        "请重新登录",
        "登录页",
        "session expired",
        "not logged",
        "未登录",
        "身份验证失败",
        "登录失效",
    ];
    if REJECT_MARKERS.iter().any(|marker| lower.contains(marker)) {
        return ProbeFailure::Rejected(raw.to_string());
    }
    ProbeFailure::Network(raw.to_string())
}

/// 在线切号所需的客户端能力（生产实现包裹 [`HbutClient`]；测试注入伪造响应）。
trait SwitchOnlineProbe {
    /// 复用当前已注入的 Cookie 校验会话，返回服务端确认的身份。
    async fn probe_current_identity(&mut self) -> Result<UserInfo, String>;
    /// 用**指定账号**的凭据发起真实门户登录，返回服务端确认的身份。
    async fn relogin_with_credentials(
        &mut self,
        student_id: &str,
        password: &str,
    ) -> Result<UserInfo, String>;
}

impl SwitchOnlineProbe for HbutClient {
    async fn probe_current_identity(&mut self) -> Result<UserInfo, String> {
        self.refresh_session().await.map_err(|e| e.to_string())
    }

    async fn relogin_with_credentials(
        &mut self,
        student_id: &str,
        password: &str,
    ) -> Result<UserInfo, String> {
        self.set_credentials(student_id.to_string(), password.to_string());
        self.login(student_id, password, "", "", "")
            .await
            .map_err(|e| e.to_string())
    }
}

/// 解析**指定账号**在本机存储的门户密码（DB 会话密码 + 密钥环双键）。
///
/// 严格按目标账号解析；找不到即返回 `None`，**绝不回退**到其他账号或
/// `latest_user_session` —— 这是 issue #1061「禁止用旧账号凭据重登」的关键。
fn resolve_account_portal_password(db_path: &std::path::Path, student_id: &str) -> Option<String> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return None;
    }
    if let Ok(Some(session)) = db::get_user_session(db_path, sid) {
        if !session.password.trim().is_empty() {
            return Some(session.password);
        }
    }
    if let Some(password) = credential_store::load_session_password(sid) {
        if !password.trim().is_empty() {
            return Some(password);
        }
    }
    if let Some(password) = credential_store::load_remembered_credential(&format!("hbut:{sid}")) {
        if !password.trim().is_empty() {
            return Some(password);
        }
    }
    None
}

/// 在线切号判定：先复用目标账号已注入的 Cookie 做在线验证；仅在服务端否定
/// 或身份不一致时，才用**该账号自身**的存储凭据真实重登并复验身份。
///
/// 安全约束（issue #1061）：
/// - 账号主键（学号/工号）必须与服务端返回一致，否则 fail-closed，绝不采纳；
/// - 只有 `target_password` 存在（该账号在本机有匹配凭据）时才发起重登，
///   绝不使用其他账号的凭据；
/// - 网络故障不具备「凭据过期」证明力，不要求用户重新登录，按可重试处理；
/// - 任何失败路径都不返回 `online_ready = true`。
async fn resolve_online_switch<P: SwitchOnlineProbe>(
    probe: &mut P,
    target_id: &str,
    target_role: IdentityRole,
    target_password: Option<String>,
) -> SwitchAccountOnlineResult {
    let target_id = target_id.trim().to_string();
    let mut result = SwitchAccountOnlineResult {
        student_id: target_id.clone(),
        role: target_role.as_str().to_string(),
        local_activated: true,
        online_verified: false,
        relogin_attempted: false,
        online_ready: false,
        needs_login: false,
        failure_reason: String::new(),
    };

    // 1) 在线验证：目标账号 Cookie 是否仍被服务端认可
    let mut role_mismatch: Option<IdentityRole> = None;
    let mut id_mismatch: Option<String> = None;
    match probe.probe_current_identity().await {
        Ok(info) if info.student_id.trim() == target_id => {
            if info.role == target_role {
                return mark_online(result, info.role, false);
            }
            // 账号一致但角色与本地记录不同：Cookie 探测不足以改写角色，
            // 需要真实重登复验（若该账号有凭据）。
            role_mismatch = Some(info.role);
        }
        Ok(info) => {
            // 服务端返回的账号与目标不一致：注入的 Cookie 属于别的账号（串号风险）。
            id_mismatch = Some(info.student_id.trim().to_string());
        }
        Err(message) => {
            if let ProbeFailure::Network(_) = classify_probe_failure(&message) {
                // 网络故障：可重试，不诱导用户重新登录。
                result.failure_reason = message;
                return result;
            }
        }
    }

    // 2) 目标账号专属自动恢复：仅当存在与该账号匹配的安全存储凭据
    let Some(password) = target_password else {
        let reason = if let Some(actual) = id_mismatch {
            format!("学校会话返回的账号（{actual}）与目标账号不一致，需要重新登录")
        } else if role_mismatch.is_some() {
            "目标账号身份与本地记录不一致，需要重新登录".to_string()
        } else {
            "目标账号会话已失效，且本地未保存该账号的登录凭据，需要重新登录".to_string()
        };
        return fail_closed(result, true, reason);
    };
    result.relogin_attempted = true;
    match probe.relogin_with_credentials(&target_id, &password).await {
        Ok(info) if info.student_id.trim() == target_id => {
            // 真实登录成功且账号主键一致：采纳服务端权威角色。
            mark_online(result, info.role, true)
        }
        Ok(_) => fail_closed(
            result,
            true,
            "重新登录返回的账号与目标账号不一致，已拒绝采纳".to_string(),
        ),
        Err(message) => match classify_probe_failure(&message) {
            ProbeFailure::Network(_) => {
                result.failure_reason = message;
                result
            }
            ProbeFailure::Rejected(_) => fail_closed(
                result,
                true,
                "目标账号重新登录失败，请检查该账号的登录凭据".to_string(),
            ),
        },
    }
}

/// 标记在线就绪；`relogged` 表示本次通过真实门户登录恢复。
fn mark_online(
    mut result: SwitchAccountOnlineResult,
    role: IdentityRole,
    relogged: bool,
) -> SwitchAccountOnlineResult {
    result.role = role.as_str().to_string();
    result.online_verified = true;
    result.online_ready = true;
    result.needs_login = false;
    result.failure_reason = String::new();
    if relogged {
        result.relogin_attempted = true;
    }
    result
}

/// 失败收口：绝不虚报在线；`needs_login` 明确是否需要用户重新登录。
fn fail_closed(
    mut result: SwitchAccountOnlineResult,
    needs_login: bool,
    reason: String,
) -> SwitchAccountOnlineResult {
    result.online_verified = false;
    result.online_ready = false;
    result.needs_login = needs_login;
    result.failure_reason = reason;
    result
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
    async fn teacher_account_with_only_v2_domain_cookies_is_listed_as_switchable() {
        let (service, db_path) = test_service("teacher_v2_only");
        let teacher_id = "20000000";
        let empty = String::new();
        db::save_user_session(&db_path, teacher_id, &empty, &empty, &empty, None, None)
            .expect("保存教师基础记录");
        db::save_user_session_role(&db_path, teacher_id, "teacher").expect("保存教师角色");
        db::upsert_auth_cookies_batch(
            &db_path,
            teacher_id,
            &[(
                "auth.hbut.edu.cn".to_string(),
                r#"[{"name":"CASTGC","value":"fake-test-ticket","path":"/"}]"#.to_string(),
            )],
            "test",
        )
        .expect("保存仅新版分域 Cookie");

        let rows = service.list_saved_accounts().await.expect("账号列表");
        let teacher = rows
            .iter()
            .find(|row| row.student_id == teacher_id)
            .expect("教师账号可见");
        assert_eq!(teacher.role, "teacher");
        assert!(teacher.has_cookies, "仅新版分域 Cookie 也应可切号");
        assert_eq!(teacher.masked_id, "2000****0000");

        // 本地秒切成功仅说明 Cookie 已加载，不能推断学校已完成在线验证。
        let switched = service
            .switch_active_account(teacher_id)
            .await
            .expect("本地恢复");
        assert_eq!(switched.student_id, teacher_id);
        assert!(switched.role.is_teacher());
        let handle = service.context.client_handle();
        let guard = handle.read().await;
        assert!(
            guard
                .export_domain_cookie_rows()
                .iter()
                .any(|(_, value)| value.contains("fake-test-ticket")),
            "仅 v2 Cookie 的教师切号必须真正注入所属账号 Cookie，不能只切 UI 身份"
        );
        drop(guard);
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

    // ── #1061 在线切号四态合同测试 ────────────────────────────────────────

    /// 伪造在线探测客户端：记录每次真实重登使用的账号与凭据。
    struct FakeProbe {
        probe: Result<UserInfo, String>,
        relogin: Result<UserInfo, String>,
        relogin_calls: Vec<(String, String)>,
    }

    impl FakeProbe {
        fn new(probe: Result<UserInfo, String>) -> Self {
            Self {
                probe,
                relogin: Err("未配置重登响应".to_string()),
                relogin_calls: Vec::new(),
            }
        }

        fn with_relogin(mut self, relogin: Result<UserInfo, String>) -> Self {
            self.relogin = relogin;
            self
        }
    }

    impl SwitchOnlineProbe for FakeProbe {
        async fn probe_current_identity(&mut self) -> Result<UserInfo, String> {
            self.probe.clone()
        }

        async fn relogin_with_credentials(
            &mut self,
            student_id: &str,
            password: &str,
        ) -> Result<UserInfo, String> {
            self.relogin_calls
                .push((student_id.to_string(), password.to_string()));
            self.relogin.clone()
        }
    }

    fn user(id: &str, role: IdentityRole) -> UserInfo {
        UserInfo {
            student_id: id.to_string(),
            role,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn online_switch_accepts_cookie_verified_target_identity() {
        // 目标账号 Cookie 仍有效：一次在线验证即就绪，不发真实重登。
        let mut probe = FakeProbe::new(Ok(user("2510232001", IdentityRole::Student)));
        let result =
            resolve_online_switch(&mut probe, "2510232001", IdentityRole::Student, None).await;
        assert!(result.local_activated);
        assert!(result.online_ready);
        assert!(result.online_verified);
        assert!(!result.relogin_attempted);
        assert!(!result.needs_login);
        assert_eq!(result.role, "student");
        assert!(probe.relogin_calls.is_empty(), "Cookie 有效时不得发起重登");
    }

    #[tokio::test]
    async fn online_switch_accepts_eight_digit_teacher_id_with_cookie() {
        // 8 位教师工号：Cookie 有效时按教师身份就绪。
        let mut probe = FakeProbe::new(Ok(user("20000000", IdentityRole::Teacher)));
        let result =
            resolve_online_switch(&mut probe, "20000000", IdentityRole::Teacher, None).await;
        assert!(result.online_ready);
        assert_eq!(result.role, "teacher");
        assert_eq!(result.student_id, "20000000");
    }

    #[tokio::test]
    async fn online_switch_rejected_session_without_matching_credentials_needs_login() {
        // 伪造 HTTP 200 登录页（fetch_user_info 判定会话过期）：无该账号凭据 → 需重新登录，
        // 且绝不用其他账号凭据重登。
        let mut probe = FakeProbe::new(Err("会话已过期，请重新登录".to_string()));
        let result =
            resolve_online_switch(&mut probe, "2510232001", IdentityRole::Student, None).await;
        assert!(!result.online_ready);
        assert!(!result.online_verified);
        assert!(result.needs_login);
        assert!(!result.relogin_attempted);
        assert!(probe.relogin_calls.is_empty(), "无匹配凭据时不得发起重登");
        assert!(result.failure_reason.contains("重新登录"));
    }

    #[tokio::test]
    async fn online_switch_401_uses_target_account_credentials_only() {
        // 伪造 401：仅当存在**目标账号**凭据时，用目标账号凭据重登并复验身份。
        let mut probe = FakeProbe::new(Err("获取个人信息失败: 401 Unauthorized".to_string()))
            .with_relogin(Ok(user("20000000", IdentityRole::Teacher)));
        let result = resolve_online_switch(
            &mut probe,
            "20000000",
            IdentityRole::Teacher,
            Some("target-only-secret".to_string()),
        )
        .await;
        assert!(result.online_ready);
        assert!(result.relogin_attempted);
        assert!(!result.needs_login);
        assert_eq!(result.role, "teacher");
        assert_eq!(
            probe.relogin_calls,
            vec![("20000000".to_string(), "target-only-secret".to_string())],
            "重登必须且只能使用目标账号自身凭据"
        );
    }

    #[tokio::test]
    async fn online_switch_403_uses_target_account_credentials_only() {
        let mut probe = FakeProbe::new(Err("获取个人信息失败: 403 Forbidden".to_string()))
            .with_relogin(Ok(user("2510232001", IdentityRole::Student)));
        let result = resolve_online_switch(
            &mut probe,
            "2510232001",
            IdentityRole::Student,
            Some("student-secret".to_string()),
        )
        .await;
        assert!(result.online_ready);
        assert_eq!(
            probe.relogin_calls,
            vec![("2510232001".to_string(), "student-secret".to_string())]
        );
    }

    #[tokio::test]
    async fn online_switch_timeout_is_retryable_and_never_needs_login() {
        // 传输层超时：不具「凭据过期」证明力，按可重试处理，且不发起重登。
        let mut probe = FakeProbe::new(Err(
            "error sending request for url (https://jwxt.hbut.edu.cn/...): connection timed out"
                .to_string(),
        ));
        let result = resolve_online_switch(
            &mut probe,
            "2510232001",
            IdentityRole::Student,
            Some("should-not-be-used".to_string()),
        )
        .await;
        assert!(!result.online_ready, "网络故障不得虚报在线");
        assert!(!result.needs_login, "网络故障不得诱导用户重新登录");
        assert!(!result.relogin_attempted);
        assert!(probe.relogin_calls.is_empty(), "网络故障时不得额外发起登录");
    }

    #[tokio::test]
    async fn online_switch_fails_closed_when_server_identity_differs() {
        // 服务端返回了别的账号：即使重登后仍不一致，也必须 fail-closed。
        let mut probe = FakeProbe::new(Ok(user("2510239999", IdentityRole::Student)))
            .with_relogin(Ok(user("2510239999", IdentityRole::Student)));
        let result = resolve_online_switch(
            &mut probe,
            "2510232001",
            IdentityRole::Student,
            Some("target-secret".to_string()),
        )
        .await;
        assert!(!result.online_ready);
        assert!(!result.online_verified);
        assert!(result.needs_login);
        assert_eq!(result.student_id, "2510232001");
        assert_eq!(result.role, "student");
    }

    #[tokio::test]
    async fn online_switch_relogin_identity_mismatch_fails_closed() {
        // 重登返回的账号与目标不一致（例如凭据被换绑）：不得采纳。
        let mut probe = FakeProbe::new(Err("获取个人信息失败: 401".to_string()))
            .with_relogin(Ok(user("2510230000", IdentityRole::Student)));
        let result = resolve_online_switch(
            &mut probe,
            "2510232001",
            IdentityRole::Student,
            Some("target-secret".to_string()),
        )
        .await;
        assert!(!result.online_ready);
        assert!(result.needs_login);
        assert!(result.failure_reason.contains("不一致"));
    }

    #[tokio::test]
    async fn online_switch_adopts_server_role_only_after_real_relogin() {
        // 本地记录角色过期（记为学生、实为教师）：Cookie 探测不足以改写，
        // 真实重登复验账号一致后才采纳服务端权威角色。
        let mut probe = FakeProbe::new(Ok(user("20000000", IdentityRole::Teacher)))
            .with_relogin(Ok(user("20000000", IdentityRole::Teacher)));
        let result = resolve_online_switch(
            &mut probe,
            "20000000",
            IdentityRole::Student,
            Some("teacher-secret".to_string()),
        )
        .await;
        assert!(result.online_ready);
        assert!(result.relogin_attempted);
        assert_eq!(result.role, "teacher", "角色必须以服务端返回为准");
    }

    #[tokio::test]
    async fn online_switch_relogin_rejected_error_needs_login() {
        let mut probe = FakeProbe::new(Err("会话已过期，请重新登录".to_string()))
            .with_relogin(Err("获取个人信息失败: 401".to_string()));
        let result = resolve_online_switch(
            &mut probe,
            "2510232001",
            IdentityRole::Student,
            Some("stale-secret".to_string()),
        )
        .await;
        assert!(!result.online_ready);
        assert!(result.needs_login);
        assert!(result.relogin_attempted);
    }

    #[test]
    fn classify_probe_failure_distinguishes_rejected_and_network() {
        // 伪造 HTTP 200 登录页 / 401 / 403 → 服务端否定
        assert!(matches!(
            classify_probe_failure("会话已过期，请重新登录"),
            ProbeFailure::Rejected(_)
        ));
        assert!(matches!(
            classify_probe_failure("获取个人信息失败: 401"),
            ProbeFailure::Rejected(_)
        ));
        assert!(matches!(
            classify_probe_failure("获取个人信息失败: 403 Forbidden"),
            ProbeFailure::Rejected(_)
        ));
        // 超时 / 断网 → 网络故障（可重试）
        assert!(matches!(
            classify_probe_failure("error sending request for url: connection timed out"),
            ProbeFailure::Network(_)
        ));
        assert!(matches!(
            classify_probe_failure("网络异常，无法连接教务系统"),
            ProbeFailure::Network(_)
        ));
        // 未知错误不具「凭据过期」证明力
        assert!(matches!(
            classify_probe_failure("获取个人信息失败: 500"),
            ProbeFailure::Network(_)
        ));
    }

    #[test]
    fn account_password_lookup_never_crosses_accounts() {
        let (service, db_path) = test_service("pw_scope");
        // 使用其他测试未占用的账号，避免共享密钥环（按账号键）造成误命中。
        let sid_a = "29990011";
        let sid_b = "29990012";
        let empty = String::new();
        let password_a = test_value("secret-a");
        db::save_user_session(
            &db_path,
            sid_a,
            "Code: CASTGC=x",
            &password_a,
            &empty,
            None,
            None,
        )
        .expect("save a");
        // B 账号只保存会话、没有密码
        db::save_user_session(
            &db_path,
            sid_b,
            "Code: CASTGC=y",
            &empty,
            &empty,
            None,
            None,
        )
        .expect("save b");

        assert_eq!(
            resolve_account_portal_password(service.context.db_path(), sid_a),
            Some(password_a),
            "目标账号有凭据时应返回该账号凭据"
        );
        assert_eq!(
            resolve_account_portal_password(service.context.db_path(), sid_b),
            None,
            "目标账号无凭据时绝不能回退到其他账号凭据"
        );
        assert_eq!(
            resolve_account_portal_password(service.context.db_path(), "  "),
            None
        );
        let _ = std::fs::remove_file(&db_path);
    }

    #[tokio::test]
    async fn switch_active_account_online_rejects_unknown_account_before_network() {
        // 账号不存在 → 本地即报错，不进入在线探测（不产生未授权网络登录）。
        let (service, db_path) = test_service("switch_online_unknown");
        let err = service
            .switch_active_account_online("2510239999")
            .await
            .expect_err("不存在的账号应被拒绝");
        assert_eq!(err.kind, ApplicationErrorKind::Validation);
        assert!(err.message.contains("不存在"));
        let _ = std::fs::remove_file(&db_path);
    }
}
