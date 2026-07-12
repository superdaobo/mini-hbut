//! 学习通 SSO 统一会话层（#324 / #325）
//!
//! - 登录后预热 CAS→学习通桥接
//! - TTL 缓存 + 去重，避免进模块重复 FYSSO
//! - 门户 TGT 失效时静默重登后再桥接
//! - 诊断信息落盘（不含密码）

use std::error::Error;
use std::io;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use reqwest::cookie::CookieStore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http_client::HbutClient;
use crate::modules::online_learning;

type DynError = Box<dyn Error + Send + Sync>;

/// 缓存有效期：短窗口内复用成功桥接，避免连打 FYSSO
const SSO_TTL: Duration = Duration::from_secs(4 * 60);
/// 静默重登节流，避免验证码风暴
const SILENT_RELOGIN_COOLDOWN: Duration = Duration::from_secs(45);

fn err_box(message: impl Into<String>) -> DynError {
    Box::new(io::Error::other(message.into()))
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ChaoxingSsoDiag {
    pub ok: bool,
    pub bridged: bool,
    pub has_uid: bool,
    pub has_jw: bool,
    pub final_url: String,
    pub fail_reason: String,
    pub fail_kind: String,
    pub silent_relogin: bool,
    pub from_cache: bool,
    pub preheated: bool,
    pub at_ms: u64,
}

impl ChaoxingSsoDiag {
    fn to_json(&self) -> Value {
        json!({
            "ok": self.ok,
            "bridged": self.bridged,
            "has_uid": self.has_uid,
            "has_jw": self.has_jw,
            "final_url": self.final_url,
            "fail_reason": self.fail_reason,
            "fail_kind": self.fail_kind,
            "silent_relogin": self.silent_relogin,
            "from_cache": self.from_cache,
            "preheated": self.preheated,
            "at_ms": self.at_ms,
        })
    }
}

#[derive(Debug, Default)]
struct SsoRuntime {
    ready_until: Option<Instant>,
    last_diag: ChaoxingSsoDiag,
    last_silent_relogin_at: Option<Instant>,
    /// 进程内去重：同时只允许一次完整 ensure
    in_flight: bool,
}

static SSO_RUNTIME: Mutex<SsoRuntime> = Mutex::new(SsoRuntime {
    ready_until: None,
    last_diag: ChaoxingSsoDiag {
        ok: false,
        bridged: false,
        has_uid: false,
        has_jw: false,
        final_url: String::new(),
        fail_reason: String::new(),
        fail_kind: String::new(),
        silent_relogin: false,
        from_cache: false,
        preheated: false,
        at_ms: 0,
    },
    last_silent_relogin_at: None,
    in_flight: false,
});

fn diag_path() -> Option<PathBuf> {
    HbutClient::app_data_dir().map(|d| d.join("chaoxing_sso_diag.json"))
}

fn persist_diag(diag: &ChaoxingSsoDiag) {
    if let Some(path) = diag_path() {
        if let Ok(text) = serde_json::to_string_pretty(diag) {
            let _ = std::fs::write(path, text);
        }
    }
}

fn mark_ready(diag: ChaoxingSsoDiag) {
    if let Ok(mut rt) = SSO_RUNTIME.lock() {
        rt.ready_until = Some(Instant::now() + SSO_TTL);
        rt.last_diag = diag.clone();
        rt.in_flight = false;
    }
    persist_diag(&diag);
}

fn mark_fail(diag: ChaoxingSsoDiag) {
    if let Ok(mut rt) = SSO_RUNTIME.lock() {
        rt.ready_until = None;
        rt.last_diag = diag.clone();
        rt.in_flight = false;
    }
    persist_diag(&diag);
}

fn cache_hit() -> Option<ChaoxingSsoDiag> {
    let rt = SSO_RUNTIME.lock().ok()?;
    let until = rt.ready_until?;
    if Instant::now() < until && rt.last_diag.ok {
        let mut d = rt.last_diag.clone();
        d.from_cache = true;
        d.at_ms = now_unix_ms();
        return Some(d);
    }
    None
}

fn read_last_diag() -> ChaoxingSsoDiag {
    SSO_RUNTIME
        .lock()
        .map(|rt| rt.last_diag.clone())
        .unwrap_or_default()
}

/// 对外：读取最近一次 SSO 诊断（可被前端/调试展示）
pub fn get_sso_diag() -> Value {
    if let Some(path) = diag_path() {
        if let Ok(text) = std::fs::read_to_string(path) {
            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                return v;
            }
        }
    }
    read_last_diag().to_json()
}

fn cookie_flags(client: &HbutClient) -> (bool, bool) {
    let mut blob = String::new();
    for host in [
        "https://passport2.chaoxing.com",
        "https://i.chaoxing.com",
        "https://mooc1.chaoxing.com",
        "https://hbut.jw.chaoxing.com",
    ] {
        if let Ok(url) = reqwest::Url::parse(host) {
            if let Some(c) = client.cookie_jar.cookies(&url) {
                if let Ok(s) = c.to_str() {
                    if !blob.is_empty() {
                        blob.push_str("; ");
                    }
                    blob.push_str(s);
                }
            }
        }
    }
    let has_uid = blob.contains("UID=") || blob.contains("_uid=");
    let has_jw = blob.contains("jw_uf=");
    (has_uid, has_jw)
}

fn password_nonempty(raw: &str) -> Option<String> {
    let p = raw.trim().to_string();
    if p.is_empty() || p == crate::credential_store::KEYRING_MARKER {
        None
    } else {
        Some(p)
    }
}

/// 从内存 / 密钥环 / 会话库尽力解析门户密码（用于静默重登）
fn resolve_portal_password(client: &HbutClient, student_id: &str) -> Option<String> {
    if let Some(p) = client
        .last_password
        .as_ref()
        .and_then(|s| password_nonempty(s))
    {
        println!("[SSO] 密码来源: memory.last_password");
        return Some(p);
    }

    let mut candidates: Vec<String> = Vec::new();
    let sid = student_id.trim();
    if !sid.is_empty() {
        candidates.push(sid.to_string());
        candidates.push(format!("hbut:{sid}"));
    }
    if let Some(u) = client
        .last_username
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        candidates.push(u.clone());
        candidates.push(format!("hbut:{u}"));
    }

    for key in &candidates {
        if let Some(p) = crate::credential_store::load_password(key).and_then(|s| password_nonempty(&s))
        {
            println!("[SSO] 密码来源: keyring({})", key);
            return Some(p);
        }
        if let Some(p) =
            crate::credential_store::load_remembered_credential(key).and_then(|s| password_nonempty(&s))
        {
            println!("[SSO] 密码来源: remembered({})", key);
            return Some(p);
        }
    }

    // 按学号查会话
    if !sid.is_empty() {
        if let Ok(Some(session)) = crate::db::get_user_session(crate::DB_FILENAME, sid) {
            if let Some(p) = password_nonempty(&session.password) {
                println!("[SSO] 密码来源: db.user_session({})", sid);
                return Some(p);
            }
        }
    }

    // 最近一次会话兜底（学号不一致时）
    if let Ok(Some(latest)) = crate::db::get_latest_user_session(crate::DB_FILENAME) {
        if let Some(p) = password_nonempty(&latest.password) {
            println!(
                "[SSO] 密码来源: db.latest_session(student={})",
                latest.student_id
            );
            return Some(p);
        }
        // 再按 latest.student_id 查密钥环
        if let Some(p) = crate::credential_store::load_password(&latest.student_id)
            .and_then(|s| password_nonempty(&s))
        {
            println!("[SSO] 密码来源: keyring(latest.student_id)");
            return Some(p);
        }
    }

    println!(
        "[SSO] 密码解析失败: sid={} has_last_password={} has_user_info={} db_path={:?}",
        sid,
        client.last_password.as_ref().map(|s| !s.is_empty()).unwrap_or(false),
        client.user_info.is_some(),
        std::env::var("HBUT_DB_PATH").ok()
    );
    None
}

/// 直接从会话库取密码（绕过可能的空 last_password / 错键）
fn load_password_from_db_direct(student_id: &str) -> Option<(String, String)> {
    let sid = student_id.trim();
    if !sid.is_empty() {
        if let Ok(Some(session)) = crate::db::get_user_session(crate::DB_FILENAME, sid) {
            if let Some(p) = password_nonempty(&session.password) {
                return Some((sid.to_string(), p));
            }
        }
    }
    if let Ok(Some(latest)) = crate::db::get_latest_user_session(crate::DB_FILENAME) {
        if let Some(p) = password_nonempty(&latest.password) {
            return Some((latest.student_id, p));
        }
    }
    // 绝对路径兜底：dev 下 cwd 漂移时 HBUT_DB_PATH 偶发未命中
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let path = std::path::PathBuf::from(local)
            .join("Mini-HBUT")
            .join("grades.db");
        if path.exists() {
            if !sid.is_empty() {
                if let Ok(Some(session)) = crate::db::get_user_session(&path, sid) {
                    if let Some(p) = password_nonempty(&session.password) {
                        return Some((sid.to_string(), p));
                    }
                }
            }
            if let Ok(Some(latest)) = crate::db::get_latest_user_session(&path) {
                if let Some(p) = password_nonempty(&latest.password) {
                    return Some((latest.student_id, p));
                }
            }
        }
    }
    None
}

/// 进入 SSO 前把 DB/密钥环密码灌回内存，保证静默续期可用
fn hydrate_credentials(client: &mut HbutClient, student_id: &str) {
    if client
        .last_password
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        println!(
            "[SSO] 内存已有密码 len={}",
            client.last_password.as_ref().map(|s| s.len()).unwrap_or(0)
        );
        return;
    }
    let sid = student_id.trim();

    // 1) 直接 DB（含 LOCALAPPDATA 兜底）
    if let Some((user, pwd)) = load_password_from_db_direct(sid) {
        client.set_credentials(user.clone(), pwd.clone());
        let _ = crate::credential_store::save_password(&user, &pwd);
        let _ = crate::credential_store::save_remembered_credential(
            &format!("hbut:{user}"),
            &pwd,
        );
        println!(
            "[SSO] 已从 DB 回填门户凭据 user={} pwd_len={}",
            user,
            pwd.len()
        );
        return;
    }

    // 2) 其它来源
    if let Some(pwd) = resolve_portal_password(client, sid) {
        let user = if !sid.is_empty() {
            sid.to_string()
        } else {
            client
                .last_username
                .clone()
                .or_else(|| client.user_info.as_ref().map(|u| u.student_id.clone()))
                .unwrap_or_default()
        };
        if !user.is_empty() {
            client.set_credentials(user.clone(), pwd.clone());
            let _ = crate::credential_store::save_password(&user, &pwd);
            println!(
                "[SSO] 已回填门户凭据到内存/密钥环 user={} pwd_len={}",
                user,
                pwd.len()
            );
        }
    } else {
        println!("[SSO] hydrate 失败：DB/密钥环均无密码 sid={}", sid);
    }
}

async fn try_silent_portal_relogin(client: &mut HbutClient, student_id: &str) -> Result<bool, DynError> {
    // 冷却
    if let Ok(rt) = SSO_RUNTIME.lock() {
        if let Some(at) = rt.last_silent_relogin_at {
            if at.elapsed() < SILENT_RELOGIN_COOLDOWN {
                println!("[SSO] 静默重登冷却中，跳过");
                return Ok(false);
            }
        }
    }

    hydrate_credentials(client, student_id);

    let Some(password) = resolve_portal_password(client, student_id) else {
        println!("[SSO] 无本地门户密码，无法静默重登");
        return Ok(false);
    };

    let login_user = {
        let sid = student_id.trim();
        if !sid.is_empty() {
            sid.to_string()
        } else if let Some(u) = client
            .last_username
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            u
        } else if let Some(u) = client
            .user_info
            .as_ref()
            .map(|i| i.student_id.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            u
        } else if let Ok(Some(latest)) = crate::db::get_latest_user_session(crate::DB_FILENAME) {
            latest.student_id
        } else {
            String::new()
        }
    };
    if login_user.is_empty() {
        println!("[SSO] 无法确定静默重登用户名");
        return Ok(false);
    }

    if let Ok(mut rt) = SSO_RUNTIME.lock() {
        rt.last_silent_relogin_at = Some(Instant::now());
    }

    // 与主登录一致：优先教务 service，再试 code 服务
    let services = [
        "https://jwxt.hbut.edu.cn/admin/?loginType=1",
        "https://code.hbut.edu.cn/server/auth/host/open?host=28&org=2",
    ];

    for service in services {
        println!(
            "[SSO] 尝试静默重登门户 user={} service={}",
            login_user, service
        );
        match client
            .login_for_service(&login_user, &password, service)
            .await
        {
            Ok(info) => {
                client.is_logged_in = true;
                if !info.student_id.trim().is_empty() {
                    client.user_info = Some(info);
                }
                client.set_credentials(login_user.clone(), password.clone());
                let _ = crate::credential_store::save_password(&login_user, &password);
                client.save_cookie_snapshot_to_file();
                println!("[SSO] 静默重登门户成功 service={}", service);
                return Ok(true);
            }
            Err(e) => {
                println!("[SSO] 静默重登失败 service={}: {}", service, e);
            }
        }
    }
    Ok(false)
}

/// 轻量探测：UID cookie 或课程 API 任一可用即认为学习通可用
async fn probe_chaoxing_ready(client: &mut HbutClient) -> bool {
    let (has_uid, has_jw) = cookie_flags(client);
    if has_uid || has_jw {
        // 再确认课程 API（不 force 全量业务缓存逻辑）
        if online_learning::chaoxing_session_probe_ready(client).await {
            return true;
        }
        // cookie 有但 API 失败：仍可能是瞬时问题，has_uid 时部分能力可用
        return has_uid;
    }
    false
}

#[derive(Debug, Clone, Default)]
pub struct EnsureSsoOptions {
    pub force: bool,
    pub allow_silent_relogin: bool,
    pub preheated: bool,
}

/// 统一确保：缓存命中 → 桥接 →（可选）静默重登 → 再桥接
pub async fn ensure_chaoxing_sso(
    client: &mut HbutClient,
    student_id: Option<&str>,
    opts: EnsureSsoOptions,
) -> Result<Value, DynError> {
    let mut sid = student_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| {
            client
                .user_info
                .as_ref()
                .map(|u| u.student_id.clone())
                .filter(|s| !s.trim().is_empty())
        })
        .or_else(|| {
            client
                .last_username
                .as_ref()
                .map(|u| u.trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_default();

    // 学号仍空：用最近会话
    if sid.is_empty() {
        if let Ok(Some(latest)) = crate::db::get_latest_user_session(crate::DB_FILENAME) {
            sid = latest.student_id.clone();
        }
    }

    // 关键：回填密码，否则静默续期必失败
    hydrate_credentials(client, &sid);

    if !opts.force {
        if let Some(mut hit) = cache_hit() {
            // 缓存命中仍做极轻 cookie 校验
            let (has_uid, has_jw) = cookie_flags(client);
            if has_uid || has_jw {
                hit.has_uid = has_uid;
                hit.has_jw = has_jw;
                hit.from_cache = true;
                return Ok(json!({
                    "success": true,
                    "sso": true,
                    "from_cache": true,
                    "diag": hit.to_json(),
                    "hint": "复用学习通 SSO 缓存",
                }));
            }
        }
    }

    // 简单 in-flight 标记（client 已由外层 Mutex 串行化，这里防同链重复语义）
    if let Ok(mut rt) = SSO_RUNTIME.lock() {
        if rt.in_flight && !opts.force {
            let d = rt.last_diag.clone();
            if d.ok {
                return Ok(json!({
                    "success": true,
                    "sso": true,
                    "from_cache": true,
                    "diag": d.to_json(),
                    "hint": "SSO 进行中/刚完成，复用结果",
                }));
            }
        }
        rt.in_flight = true;
    }

    let mut silent_used = false;
    let final_url = String::new();

    // 1) 有 cookie 时允许尝试桥接：不要因 is_logged_in 假阴性直接跳过
    if !client.is_logged_in {
        // 有用户信息或 cookie 快照时先标为可尝试，避免 try_bridge 开头直接 return
        if client.user_info.is_some()
            || client
                .last_username
                .as_ref()
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        {
            client.is_logged_in = true;
        }
    }

    let mut bridged = client.try_bridge_cas_to_chaoxing().await;

    // 2) 桥接失败 → 静默重登门户（有密码就必须自动登，禁止甩给用户）
    if !bridged && opts.allow_silent_relogin {
        match try_silent_portal_relogin(client, &sid).await {
            Ok(true) => {
                silent_used = true;
                bridged = client.try_bridge_cas_to_chaoxing().await;
            }
            Ok(false) => {}
            Err(e) => {
                println!("[SSO] 静默重登异常: {}", e);
            }
        }
    }

    let (has_uid, has_jw) = cookie_flags(client);
    let ready = if bridged || has_uid {
        probe_chaoxing_ready(client).await
    } else {
        false
    };

    if ready {
        let diag = ChaoxingSsoDiag {
            ok: true,
            bridged,
            has_uid,
            has_jw,
            final_url: final_url.clone(),
            fail_reason: String::new(),
            fail_kind: String::new(),
            silent_relogin: silent_used,
            from_cache: false,
            preheated: opts.preheated,
            at_ms: now_unix_ms(),
        };
        mark_ready(diag.clone());
        return Ok(json!({
            "success": true,
            "sso": true,
            "bridged": bridged,
            "silent_relogin": silent_used,
            "from_cache": false,
            "preheated": opts.preheated,
            "diag": diag.to_json(),
            "hint": if silent_used {
                "静默重登门户后 SSO 成功"
            } else if opts.preheated {
                "登录后预热 SSO 成功"
            } else {
                "门户 CAS→学习通桥接成功"
            },
        }));
    }

    // 失败分类
    let (fail_kind, fail_reason) = if !client.is_logged_in && !silent_used {
        (
            "portal_not_logged_in",
            "门户未登录或会话已失效，且无法静默续期。请重新登录融合门户（不是断网）".to_string(),
        )
    } else if silent_used {
        (
            "silent_relogin_then_bridge_failed",
            "已尝试静默重登门户，但学习通 SSO 仍失败。请手动重新登录门户".to_string(),
        )
    } else if resolve_portal_password(client, &sid).is_none() {
        (
            "tgt_expired_no_password",
            "门户票据已过期且本地无可用密码，无法静默续期。请重新登录融合门户".to_string(),
        )
    } else {
        (
            "bridge_failed",
            "CAS→学习通桥接失败。请重新登录融合门户后重试".to_string(),
        )
    };

    // 不因 SSO 失败清掉门户登录标记（教务 cookie 可能仍可用）；避免 UI 连环“去登录”
    // 仅在完全没有用户上下文时标记未登录
    if client.user_info.is_none()
        && client
            .last_username
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
    {
        client.is_logged_in = false;
    }

    let diag = ChaoxingSsoDiag {
        ok: false,
        bridged,
        has_uid,
        has_jw,
        final_url,
        fail_reason: fail_reason.clone(),
        fail_kind: fail_kind.to_string(),
        silent_relogin: silent_used,
        from_cache: false,
        preheated: opts.preheated,
        at_ms: now_unix_ms(),
    };
    mark_fail(diag.clone());
    Err(err_box(fail_reason))
}

/// 登录成功后调用：后台预热（不强制失败中断登录）
pub async fn preheat_after_portal_login(client: &mut HbutClient, student_id: &str) {
    let sid = student_id.trim();
    if sid.is_empty() {
        return;
    }
    println!("[SSO] 登录后预热学习通桥接 student_id={}", sid);
    match ensure_chaoxing_sso(
        client,
        Some(sid),
        EnsureSsoOptions {
            force: true,
            allow_silent_relogin: false,
            preheated: true,
        },
    )
    .await
    {
        Ok(v) => println!("[SSO] 预热成功: {}", v),
        Err(e) => println!("[SSO] 预热失败（不阻断登录）: {}", e),
    }
}

/// 使缓存失效（登出时）
pub fn invalidate_sso_cache() {
    if let Ok(mut rt) = SSO_RUNTIME.lock() {
        rt.ready_until = None;
        rt.last_diag.ok = false;
        rt.in_flight = false;
    }
}
