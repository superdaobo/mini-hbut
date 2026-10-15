//! 图书馆预约（超星 reserve）基础链路（#1052）
//!
//! 本模块只做「地基」：把 **mAppId → 真实系统入口地址 + 凭证** 这条链路打通，
//! 供后续 sub-issue（座位预约 / 静音仓 / 研讨室 业务接口，#1053 / #1054）复用。
//! 不含任何具体业务接口调用。
//!
//! ## 入口链路（勘察文档 `data/library-reserve-recon/00-README.md`）
//!
//! 登录态有效时（勘察实测）：
//!
//! ```text
//! GET https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>
//!   ↓ 302
//! GET https://auth.chaoxing.com/connect/oauth2/authorize?appid=..&redirect_uri=<真实系统>?enc=..&fidEnc=..&uid=..
//!   ↓ 超星登录态自动授权（非微信 OAuth）
//! GET https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597&enc=..&fidEnc=..&uid=..&code=..&state=25285
//! ```
//!
//! 登录态缺失时（本模块实现时实测，无 cookie 直接请求）：
//!
//! ```text
//! GET .../redirectUrlMobile?mAppId=<APP_ID>                        → 302
//! GET https://unified-auth.chaoxing.com/login_auth/hbut/init?refer=  → 302
//! GET https://auth.hbut.edu.cn/authserver/login?service=..           → 200 学校 CAS 登录页
//! ```
//!
//! ⚠️ 注意 `unified-auth.chaoxing.com/login_auth/**` 是**超星统一授权入口**，
//! 登录态有效时同样会经过，因此**不能**按 `/login` 路径把它判成登录页
//! （见 [`is_login_page_url`]）。
//!
//! ## 硬性约定
//!
//! - **登录态复用既有 [`crate::modules::chaoxing_sso::ensure_chaoxing_sso`]**，禁止新建第二套登录通道。
//! - `enc` / `fidEnc` / `uid` / `mappIdEnc` / `seatIdEnc` / `reserveIdEnc` 等 `*Enc` 值
//!   疑似**短时效**，**一律不得硬编码**，每次调用都实时走一遍入口链路获取。
//! - 只硬编码**稳定标识**：mAppId、系统路径、业务主键（seatId=3597 / reserveId=24727 / 24679）。

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, LOCATION, REFERER};
use reqwest::redirect::Policy;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::http_client::HbutClient;
use crate::modules::chaoxing_sso::{self, EnsureSsoOptions};

// ── 常量 ──

/// 超星移动端应用入口（302 链起点）
const REDIRECT_URL_MOBILE: &str = "https://v1.chaoxing.com/mobileSet/redirectUrlMobile";
/// 入口请求的 Referer（与勘察时一致，避免超星做来源校验）
const MOBILE_INDEX_REFERER: &str = "https://v1.chaoxing.com/mobileSet/mobileIndex";
/// 图书馆预约真实系统主机（超星预约引擎）
const RESERVE_HOST: &str = "reserve.chaoxing.com";
/// 真实系统根地址
const RESERVE_BASE: &str = "https://reserve.chaoxing.com";
/// 业务接口统一前缀（勘察实测：静音仓 / 研讨室 / 座位均落在此前缀下，供 #1053 / #1054 直接复用）
const RESERVE_API_BASE: &str = "https://reserve.chaoxing.com/data/apps/";
/// 最多跟随跳转次数（防跳转环）
const MAX_REDIRECT_HOPS: usize = 12;
/// 与主 HTTP 客户端保持一致的 UA（超星对 UA 有校验）
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
/// 入口请求超时
const ENTRY_TIMEOUT: Duration = Duration::from_secs(25);

// ── 错误分类 ──

/// 未登录超星（登录态缺失 / 失效，可通过重新登录门户修复）
pub const ERR_CHAOXING_NOT_LOGGED_IN: &str = "chaoxing_not_logged_in";
/// 已登录超星，但该用户/学校没有此应用权限（重新登录无用）
pub const ERR_NO_PERMISSION: &str = "no_permission";
/// 网络不可达（超时 / 连接失败 / DNS 失败）
pub const ERR_NETWORK_UNREACHABLE: &str = "network_unreachable";
/// 调用方传入的应用标识非法
pub const ERR_INVALID_APP: &str = "invalid_app";
/// 其它非预期响应（携带诊断信息）
pub const ERR_UNEXPECTED_RESPONSE: &str = "unexpected_response";

/// 可区分的预约链路错误。
///
/// 直接作为 Tauri 命令的错误类型返回（实现 `Serialize`），前端可依据 `kind` 精确分支，
/// 不再只能显示笼统的「加载失败」。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryReserveError {
    /// 机器可判别的错误类型，取值见 [`ERR_CHAOXING_NOT_LOGGED_IN`] 等常量
    pub kind: String,
    /// 面向用户的中文说明
    pub message: String,
    /// 是否可通过「重新登录融合门户」修复
    pub can_relogin: bool,
    /// 诊断细节（重定向链等；不含密码与凭证正文）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl LibraryReserveError {
    fn new(kind: &str, message: impl Into<String>, can_relogin: bool, detail: Option<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
            can_relogin,
            detail,
        }
    }

    /// 未登录超星（登录态失效）
    pub fn not_logged_in(message: impl Into<String>) -> Self {
        Self::new(ERR_CHAOXING_NOT_LOGGED_IN, message, true, None)
    }

    /// 已登录但无权限
    pub fn no_permission(message: impl Into<String>) -> Self {
        Self::new(ERR_NO_PERMISSION, message, false, None)
    }

    /// 网络不可达
    pub fn network_unreachable(message: impl Into<String>) -> Self {
        Self::new(ERR_NETWORK_UNREACHABLE, message, false, None)
    }

    /// 应用标识非法
    pub fn invalid_app(message: impl Into<String>) -> Self {
        Self::new(ERR_INVALID_APP, message, false, None)
    }

    /// 其它非预期响应（带跳转链诊断）
    pub fn unexpected(message: impl Into<String>, chain: &[String]) -> Self {
        Self::new(
            ERR_UNEXPECTED_RESPONSE,
            message,
            false,
            chain_detail(chain),
        )
    }
}

impl std::fmt::Display for LibraryReserveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.kind, self.message)
    }
}

impl std::error::Error for LibraryReserveError {}

/// 跳转链 → 诊断文本（None 表示无跳转链）
fn chain_detail(chain: &[String]) -> Option<String> {
    if chain.is_empty() {
        None
    } else {
        Some(chain.join(" -> "))
    }
}

// ── 应用目录（稳定标识） ──

/// 图书馆预约的三套系统。
///
/// 注意：这里的 `m_app_id` / 系统路径 / 业务主键是**稳定值**；
/// 凭证参数（`*Enc`）不在此列，必须实时解析。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibraryApp {
    /// 座位预约（seatengine，移动端 SPA；二级页依赖超星 App 桥接，只能走接口）
    Seat,
    /// 静音仓预约（reservepc，PC 页面）
    QuietRoom,
    /// 研讨室预约（reservepc，PC 页面）
    SeminarRoom,
}

impl LibraryApp {
    /// 全部应用（固定顺序：座位 / 静音仓 / 研讨室）
    pub fn all() -> [LibraryApp; 3] {
        [Self::Seat, Self::QuietRoom, Self::SeminarRoom]
    }

    /// 稳定的应用标识（前端与命令层使用）
    pub fn key(&self) -> &'static str {
        match self {
            Self::Seat => "seat",
            Self::QuietRoom => "quiet_room",
            Self::SeminarRoom => "seminar_room",
        }
    }

    /// 中文展示名
    pub fn name(&self) -> &'static str {
        match self {
            Self::Seat => "座位预约",
            Self::QuietRoom => "静音仓预约",
            Self::SeminarRoom => "研讨室预约",
        }
    }

    /// 超星 mAppId（服务大厅卡片背后的真实应用 ID）
    pub fn m_app_id(&self) -> &'static str {
        match self {
            Self::Seat => "19248837",
            Self::QuietRoom => "19261750",
            Self::SeminarRoom => "19248835",
        }
    }

    /// 真实系统页面路径（勘察文档实测值）
    pub fn system_path(&self) -> &'static str {
        match self {
            Self::Seat => "/front/apps/seatengine/index",
            Self::QuietRoom | Self::SeminarRoom => "/front/web/apps/reservepc/index",
        }
    }

    /// 业务主键（参数名, 稳定值）
    pub fn business_id(&self) -> (&'static str, &'static str) {
        match self {
            Self::Seat => ("seatId", "3597"),
            Self::QuietRoom => ("reserveId", "24727"),
            Self::SeminarRoom => ("reserveId", "24679"),
        }
    }

    /// 备注（业务侧需要知道的坑）
    pub fn note(&self) -> &'static str {
        match self {
            Self::Seat => "移动端 SPA：二级页依赖超星 App 原生桥接，浏览器走不通，选座/签到必须直接调接口",
            Self::QuietRoom => "PC 页面，浏览器可直接访问；要求 2-6 人使用",
            Self::SeminarRoom => "PC 页面，浏览器可直接访问",
        }
    }

    /// 由外部输入解析应用：支持 key（seat / quiet_room / seminar_room）、
    /// mAppId、中文名，以及常见别名；大小写与分隔符不敏感。
    pub fn from_key(raw: &str) -> Option<Self> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        // 中文名优先（下面的 ASCII 归一化会丢掉汉字）
        if trimmed.contains("座位") {
            return Some(Self::Seat);
        }
        if trimmed.contains("静音") {
            return Some(Self::QuietRoom);
        }
        if trimmed.contains("研讨") {
            return Some(Self::SeminarRoom);
        }
        // 去掉所有非字母数字后比对，兼容 quiet_room / quietRoom / quiet-room
        let compact: String = trimmed
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();
        match compact.as_str() {
            "seat" | "seatengine" | "19248837" => Some(Self::Seat),
            "quietroom" | "quiet" | "19261750" => Some(Self::QuietRoom),
            "seminar" | "seminarroom" | "room" | "19248835" => Some(Self::SeminarRoom),
            _ => None,
        }
    }
}

/// 应用目录项（不含任何时效凭证，可安全缓存）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAppInfo {
    /// 应用标识
    pub app: String,
    /// 中文名
    pub app_name: String,
    /// 超星 mAppId
    pub m_app_id: String,
    /// 真实系统根地址
    pub system_base: String,
    /// 真实系统页面路径
    pub system_path: String,
    /// 业务接口统一前缀
    pub api_base: String,
    /// 业务主键名（seatId / reserveId）
    pub business_key: String,
    /// 业务主键值（稳定值）
    pub business_value: String,
    /// 真实系统入口（**不含凭证**，凭证需调用 resolve 实时获取）
    pub entry_url_without_credentials: String,
    /// 备注
    pub note: String,
}

/// 返回三套系统的静态目录（稳定信息，不含时效凭证）
pub fn app_catalog() -> Vec<LibraryAppInfo> {
    LibraryApp::all()
        .iter()
        .map(|app| {
            let (bk, bv) = app.business_id();
            LibraryAppInfo {
                app: app.key().to_string(),
                app_name: app.name().to_string(),
                m_app_id: app.m_app_id().to_string(),
                system_base: RESERVE_BASE.to_string(),
                system_path: app.system_path().to_string(),
                api_base: RESERVE_API_BASE.to_string(),
                business_key: bk.to_string(),
                business_value: bv.to_string(),
                entry_url_without_credentials: format!(
                    "{RESERVE_BASE}{}?{bk}={bv}",
                    app.system_path()
                ),
                note: app.note().to_string(),
            }
        })
        .collect()
}

// ── 凭证与解析结果 ──

/// 从入口链路提取到的凭证参数集合。
///
/// ⚠️ 全部为**短时效**值，禁止持久化 / 硬编码；每次使用前请重新 `resolve_entry`。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryReserveCredentials {
    /// 通用加密串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enc: Option<String>,
    /// 图书馆 fid 的加密串（对应 fid=25285）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fid_enc: Option<String>,
    /// 超星用户 uid
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uid: Option<String>,
    /// mAppId 的加密串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapp_id_enc: Option<String>,
    /// 表单 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formid: Option<String>,
    /// wfw 加密串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wfw_enc: Option<String>,
    /// 预约项 ID 加密串（静音仓 / 研讨室）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reserve_id_enc: Option<String>,
    /// 座位 ID 加密串（座位预约）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seat_id_enc: Option<String>,
    /// 部门 ID 加密串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dept_id_enc: Option<String>,
    /// wfwEngine 加密串
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wfw_engine_enc: Option<String>,
    /// OAuth code（一次性，短时效）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    /// OAuth state（实测为 fid）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    /// 预约项 ID 明文（静音仓 / 研讨室）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reserve_id: Option<String>,
    /// 座位 ID 明文（座位预约）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seat_id: Option<String>,
}

impl LibraryReserveCredentials {
    /// 从 query 参数表提取已知凭证字段（大小写不敏感）
    pub fn from_params(params: &BTreeMap<String, String>) -> Self {
        Self {
            enc: lookup_ci(params, "enc"),
            fid_enc: lookup_ci(params, "fidEnc"),
            uid: lookup_ci(params, "uid"),
            mapp_id_enc: lookup_ci(params, "mappIdEnc"),
            formid: lookup_ci(params, "formid"),
            wfw_enc: lookup_ci(params, "wfwEnc"),
            reserve_id_enc: lookup_ci(params, "reserveIdEnc"),
            seat_id_enc: lookup_ci(params, "seatIdEnc"),
            dept_id_enc: lookup_ci(params, "deptIdEnc"),
            wfw_engine_enc: lookup_ci(params, "wfwEngineEnc"),
            code: lookup_ci(params, "code"),
            state: lookup_ci(params, "state"),
            reserve_id: lookup_ci(params, "reserveId"),
            seat_id: lookup_ci(params, "seatId"),
        }
    }

    /// 是否至少拿到一个可用于后续业务接口的凭证
    pub fn has_any(&self) -> bool {
        self.enc.is_some()
            || self.fid_enc.is_some()
            || self.mapp_id_enc.is_some()
            || self.seat_id_enc.is_some()
            || self.reserve_id_enc.is_some()
    }
}

/// 单个应用的真实入口解析结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAppEntry {
    /// 应用标识
    pub app: String,
    /// 中文名
    pub app_name: String,
    /// 超星 mAppId
    pub m_app_id: String,
    /// 真实系统完整入口 URL（**含短时效凭证**）
    pub entry_url: String,
    /// 真实系统根地址
    pub system_base: String,
    /// 真实系统页面路径
    pub system_path: String,
    /// 业务接口统一前缀
    pub api_base: String,
    /// 业务主键名
    pub business_key: String,
    /// 业务主键值
    pub business_value: String,
    /// 解析出的凭证
    pub credentials: LibraryReserveCredentials,
    /// 入口链路上的**全部** query 参数（原样保留，便于后续接口取用未列出的参数）
    pub params: BTreeMap<String, String>,
    /// 解析结果是否与勘察契约（`01-api-contract.md`）一致
    pub contract_match: bool,
    /// 跳转链（诊断用）
    pub redirect_chain: Vec<String>,
    /// 解析时间（Unix 毫秒）
    pub resolved_at_ms: u64,
    /// 使用提示
    pub hint: String,
}

// ── 入口解析 ──

/// 解析指定应用的真实入口地址与凭证。
///
/// 流程：
/// 1. 复用 [`chaoxing_sso::ensure_chaoxing_sso`] 确保超星登录态（**不新建登录通道**）；
/// 2. 手动跟随 `redirectUrlMobile → 超星统一授权 → 真实系统` 的 302 链，
///    以便捕获中间跳转 `redirect_uri` 携带的凭证参数；
/// 3. 汇总跳转链上的全部 query 参数，输出可区分的错误。
pub async fn resolve_entry(
    client: &mut HbutClient,
    app: LibraryApp,
    force_sso: bool,
) -> Result<LibraryAppEntry, LibraryReserveError> {
    // 1) 超星登录态：复用既有 SSO 统一会话层
    chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        EnsureSsoOptions {
            force: force_sso,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await
    .map_err(|e| {
        // SSO 失败要再分一层：网络层原因（断网 / 超时）不能报成「未登录」，
        // 否则前端会误导用户去重新登录。
        let message = e.to_string();
        if looks_like_network_error(&message) {
            LibraryReserveError::network_unreachable(format!(
                "确保超星登录态时网络请求失败：{message}。请检查网络后重试"
            ))
        } else {
            // 其余情况即「未登录超星」：与「无权限」「网络不可达」严格区分
            LibraryReserveError::not_logged_in(format!(
                "超星学习通登录态不可用：{message}。请重新登录融合门户后重试"
            ))
        }
    })?;

    // 2) 手动跟随跳转链（禁用自动重定向，否则拿不到中间跳转的凭证）
    let http = build_no_redirect_client(client)?;
    let start_url = format!("{REDIRECT_URL_MOBILE}?mAppId={}", app.m_app_id());
    crate::runtime_log::log_info(
        "LibraryReserve",
        format!("解析入口 app={} mAppId={}", app.key(), app.m_app_id()),
    );
    let trace = follow_chain(&http, &start_url).await?;

    // 3) 校验落地系统：必须落在超星预约引擎
    let final_url = Url::parse(&trace.final_url).map_err(|e| {
        LibraryReserveError::unexpected(format!("落地地址无法解析：{e}"), &trace.chain)
    })?;
    let host = final_url.host_str().unwrap_or("").to_ascii_lowercase();
    if host != RESERVE_HOST {
        return Err(LibraryReserveError::unexpected(
            format!(
                "入口未落到预约系统（实际落地 {host}），可能该账号没有「{}」应用权限",
                app.name()
            ),
            &trace.chain,
        ));
    }

    // 4) 汇总凭证：跳转链上的全部 URL（含 redirect_uri 内嵌的真实系统 URL）+ 终态 URL
    let mut params: BTreeMap<String, String> = BTreeMap::new();
    for hop in &trace.chain {
        collect_params(hop, &mut params);
    }
    collect_params(&trace.final_url, &mut params);

    let credentials = LibraryReserveCredentials::from_params(&params);
    if !credentials.has_any() {
        // 已落到真实系统但没有任何凭证：链路形态变了，需要重新勘察
        return Err(LibraryReserveError::unexpected(
            "入口链路未返回任何凭证参数（enc/fidEnc/mappIdEnc 均为空），链路形态可能已变更",
            &trace.chain,
        ));
    }

    let system_path = final_url.path().to_string();
    let (business_key, business_value) = app.business_id();
    let contract_match = system_path == app.system_path();

    crate::runtime_log::log_info(
        "LibraryReserve",
        format!(
            "入口解析成功 app={} host={} path={} 凭证字段数={}",
            app.key(),
            host,
            system_path,
            params.len()
        ),
    );

    Ok(LibraryAppEntry {
        app: app.key().to_string(),
        app_name: app.name().to_string(),
        m_app_id: app.m_app_id().to_string(),
        entry_url: trace.final_url.clone(),
        system_base: format!(
            "{}://{}",
            final_url.scheme(),
            final_url.host_str().unwrap_or(RESERVE_HOST)
        ),
        system_path,
        api_base: RESERVE_API_BASE.to_string(),
        business_key: business_key.to_string(),
        business_value: business_value.to_string(),
        credentials,
        params,
        contract_match,
        redirect_chain: trace.chain,
        resolved_at_ms: now_unix_ms(),
        hint: if contract_match {
            "凭证为短时效值，请勿持久化；每次调用业务接口前重新 resolve".to_string()
        } else {
            format!(
                "解析路径与勘察契约不一致（期望 {}），请核对入口链路是否变更",
                app.system_path()
            )
        },
    })
}

/// 跳转链终态
struct RedirectTrace {
    final_url: String,
    chain: Vec<String>,
}

/// 构建「不自动跟随重定向」的客户端（复用主客户端 cookie jar，保证超星登录态生效）
fn build_no_redirect_client(client: &HbutClient) -> Result<reqwest::Client, LibraryReserveError> {
    reqwest::Client::builder()
        .cookie_provider(Arc::clone(&client.cookie_jar))
        .redirect(Policy::none())
        .danger_accept_invalid_certs(HbutClient::insecure_tls_allowed())
        .timeout(ENTRY_TIMEOUT)
        .user_agent(BROWSER_UA)
        .build()
        .map_err(|e| LibraryReserveError::unexpected(format!("构建请求客户端失败：{e}"), &[]))
}

/// 手动跟随 302 链，返回终态 URL 与完整跳转链。
async fn follow_chain(
    http: &reqwest::Client,
    start_url: &str,
) -> Result<RedirectTrace, LibraryReserveError> {
    let mut chain: Vec<String> = Vec::new();
    let mut current = start_url.to_string();

    for _ in 0..MAX_REDIRECT_HOPS {
        let resp = http
            .get(&current)
            .header(
                ACCEPT,
                "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            )
            .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
            .header(REFERER, MOBILE_INDEX_REFERER)
            .send()
            .await
            .map_err(|e| classify_transport_error(&e))?;

        let status = resp.status().as_u16();
        let this_url = resp.url().to_string();
        chain.push(this_url.clone());

        // 被踢回登录页 → 登录态失效
        if is_login_page_url(&this_url) {
            return Err(LibraryReserveError::not_logged_in(format!(
                "超星登录态已失效，被重定向到登录页（{this_url}）。请重新登录融合门户"
            )));
        }

        // 3xx：继续跟随 Location
        if (300..400).contains(&status) {
            let location = resp
                .headers()
                .get(LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            let Some(location) = location else {
                return Err(LibraryReserveError::unexpected(
                    "预约入口返回重定向但缺少 Location 头",
                    &chain,
                ));
            };
            if is_login_page_url(&location) {
                return Err(LibraryReserveError::not_logged_in(format!(
                    "超星登录态已失效（重定向至 {location}）。请重新登录融合门户"
                )));
            }
            current = resolve_redirect_target(&this_url, &location)?;
            continue;
        }

        // 非重定向：读正文做登录态 / 权限判定
        let body = resp.text().await.map_err(|e| classify_transport_error(&e))?;

        if looks_like_login_body(&body) {
            return Err(LibraryReserveError::not_logged_in(
                "超星返回登录页（学校统一身份认证），登录态已失效。请重新登录融合门户",
            ));
        }
        if let Some(msg) = json_error_message(&body) {
            return Err(LibraryReserveError::no_permission(format!(
                "超星拒绝该应用入口：{msg}"
            )));
        }
        if looks_like_no_permission(status, &body) {
            return Err(LibraryReserveError::no_permission(format!(
                "已登录超星，但当前账号没有 mAppId={} 的访问权限（HTTP {status}）",
                current_app_label(&chain)
            )));
        }

        // 已落在预约系统：视为终态（避免把页面内联 JS 的 location.href 误判为跳转）
        let on_reserve = Url::parse(&this_url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.eq_ignore_ascii_case(RESERVE_HOST)))
            .unwrap_or(false);
        if !on_reserve {
            // 部分链路用 meta refresh / JS 跳转（HTTP 层看不到 302）
            if let Some(next) = extract_next_hop_from_body(&body) {
                current = resolve_redirect_target(&this_url, &next)?;
                continue;
            }
        }

        if status >= 400 {
            return Err(LibraryReserveError::unexpected(
                format!("预约入口返回 HTTP {status}"),
                &chain,
            ));
        }

        return Ok(RedirectTrace {
            final_url: this_url,
            chain,
        });
    }

    Err(LibraryReserveError::unexpected(
        "预约入口跳转次数超过上限（可能存在跳转环）",
        &chain,
    ))
}

/// 网络层错误 → 统一的「网络不可达」
fn classify_transport_error(err: &reqwest::Error) -> LibraryReserveError {
    if err.is_timeout() {
        LibraryReserveError::network_unreachable(format!(
            "访问超星预约入口超时：{err}。请检查网络后重试"
        ))
    } else if err.is_connect() {
        LibraryReserveError::network_unreachable(format!(
            "无法连接超星预约入口：{err}。请检查网络或稍后重试"
        ))
    } else if err.is_request() {
        LibraryReserveError::network_unreachable(format!("请求超星预约入口失败：{err}"))
    } else {
        LibraryReserveError::network_unreachable(format!("网络异常：{err}"))
    }
}

/// 粗判错误文本是否网络层问题。
///
/// 用途：把「确保超星登录态」失败里的**网络原因**与**登录态失效**区分开。
/// 注意不要收录「断网」——超星自身的登录态提示语里带「（不是断网）」，
/// 收录会导致该提示被误判为网络故障。
fn looks_like_network_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    const NEEDLES: [&str; 6] = [
        "timed out",
        "timeout",
        "error sending request",
        "connection",
        "dns",
        "网络",
    ];
    NEEDLES.iter().any(|n| lower.contains(n))
}

/// 相对 / 绝对 Location 统一解析为绝对 URL
fn resolve_redirect_target(base: &str, location: &str) -> Result<String, LibraryReserveError> {
    if let Ok(url) = Url::parse(location) {
        return Ok(url.to_string());
    }
    let base_url = Url::parse(base).map_err(|e| {
        LibraryReserveError::unexpected(format!("当前地址无法解析（{base}）：{e}"), &[])
    })?;
    base_url
        .join(location)
        .map(|u| u.to_string())
        .map_err(|e| {
            LibraryReserveError::unexpected(format!("跳转地址无法解析（{location}）：{e}"), &[])
        })
}

/// 是否「登录页」URL（命中即判定未登录超星）。
///
/// 实测未登录链路（2026-10-15，无 cookie 直接请求 redirectUrlMobile）：
/// ```text
/// redirectUrlMobile                     → 302
/// unified-auth.chaoxing.com/login_auth/hbut/init   → 302
/// auth.hbut.edu.cn/authserver/login     → 200 学校 CAS 登录页
/// ```
/// ⚠️ 因此**不能**把 `/login_auth/**` 当成登录页 —— 它是超星统一授权入口，
/// 登录态有效时同样会经过。只认「末段为 login」的路径与超星统一登录域。
fn is_login_page_url(raw: &str) -> bool {
    let Ok(u) = Url::parse(raw) else {
        return false;
    };
    let host = u.host_str().unwrap_or("").to_ascii_lowercase();
    let path = u.path().to_ascii_lowercase();

    // 超星统一登录域
    if host.starts_with("passport") && host.ends_with("chaoxing.com") {
        return true;
    }
    if host == "sso.chaoxing.com" {
        return true;
    }

    // 登录路径：末段为 login / loginmobile（覆盖学校 CAS 与超星业务域登录页）
    let path_is_login = path.ends_with("/login") || path.ends_with("/loginmobile");
    let related_host = host.ends_with("chaoxing.com") || host.ends_with("hbut.edu.cn");
    related_host && path_is_login
}

/// 正文是否登录页（保守标记，避免误判正常业务页）
fn looks_like_login_body(body: &str) -> bool {
    const MARKERS: [&str; 6] = [
        "passport2.chaoxing.com",
        // 超星登录页
        "账号登录",
        "短信登录",
        "请输入手机号",
        // 学校 CAS 统一身份认证页
        "统一身份认证",
        "authserver/login",
    ];
    MARKERS.iter().any(|m| body.contains(m))
}

/// 正文 / 状态码是否「无权限」。
///
/// 分强弱特征判定：强特征（超星「应用未配置」错误页专有文案）无条件命中；
/// 弱特征仅在 HTTP 错误响应或**短正文**（错误页）上判定，
/// 避免把正常业务页内联文案里的「未授权」误判成无权限。
fn looks_like_no_permission(status: u16, body: &str) -> bool {
    // 强特征：只出现在「应用不存在 / 未配置」错误页
    const STRONG: [&str; 2] = ["未查询到您所访问的应用", "应用不存在"];
    if STRONG.iter().any(|m| body.contains(m)) {
        return true;
    }
    if status == 403 {
        return true;
    }
    // 弱特征：正常业务页（体量大）不参与判定
    if status >= 400 || body.len() < 1500 {
        const WEAK: [&str; 4] = ["无权限", "没有权限", "暂无权限", "未授权"];
        return WEAK.iter().any(|m| body.contains(m));
    }
    false
}

/// 正文是否为 `{"success":false,...}` 形态的失败响应，返回其中的提示语
fn json_error_message(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if !trimmed.starts_with('{') {
        return None;
    }
    let v: Value = serde_json::from_str(trimmed).ok()?;
    if v.get("success").and_then(|b| b.as_bool()) != Some(false) {
        return None;
    }
    let msg = v
        .get("msg")
        .or_else(|| v.get("message"))
        .and_then(|m| m.as_str())
        .unwrap_or("超星返回失败");
    Some(msg.to_string())
}

/// 从 HTML 正文中提取下一跳（meta refresh / JS location / 目标绝对 URL）
fn extract_next_hop_from_body(body: &str) -> Option<String> {
    // 1) <meta http-equiv="refresh" content="0;url=...">
    if let Ok(re) = regex::Regex::new(
        r#"(?is)<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"'>\s]+)"#,
    ) {
        if let Some(m) = re.captures(body).and_then(|c| c.get(1)) {
            let candidate = decode_html_entities(m.as_str().trim());
            if candidate.starts_with("http") {
                return Some(candidate);
            }
        }
    }

    // 2) location.href = '...' / location.replace('...') / window.location = '...'
    if let Ok(re) = regex::Regex::new(
        r#"(?is)location\s*(?:\.\s*(?:href|replace)\s*)?[=(]\s*["']([^"']+)["']"#,
    ) {
        if let Some(m) = re.captures(body).and_then(|c| c.get(1)) {
            let candidate = decode_html_entities(m.as_str().trim());
            if candidate.starts_with("http") {
                return Some(candidate);
            }
        }
    }

    // 3) 正文里裸的超星绝对 URL（只认授权 / 预约目标，避免误抓帮助链接）
    if let Ok(re) = regex::Regex::new(r#"https://[A-Za-z0-9.\-]*chaoxing\.com/[^\s"'<>\\]*"#) {
        for cap in re.captures_iter(body) {
            let candidate = decode_html_entities(cap.get(0).map(|m| m.as_str()).unwrap_or(""));
            if candidate.contains("/connect/oauth2/authorize")
                || candidate.contains(RESERVE_HOST)
            {
                return Some(candidate);
            }
        }
    }

    None
}

/// HTML 实体解码（`&amp;` 等；解析失败时原样返回）
fn decode_html_entities(raw: &str) -> String {
    if raw.contains('&') {
        html_escape::decode_html_entities(raw).to_string()
    } else {
        raw.to_string()
    }
}

/// 收集 URL 的 query 参数（`redirect_uri` 内嵌的真实系统 URL 递归解析）。
///
/// `depth` 限制递归层数：`redirect_uri` 的值来自远端响应，需防止自引用导致无限递归。
fn collect_params(raw_url: &str, out: &mut BTreeMap<String, String>) {
    collect_params_inner(raw_url, out, 0);
}

const MAX_PARAM_NESTING: usize = 3;

fn collect_params_inner(raw_url: &str, out: &mut BTreeMap<String, String>, depth: usize) {
    if depth > MAX_PARAM_NESTING {
        return;
    }
    let Ok(u) = Url::parse(raw_url) else {
        return;
    };
    for (k, v) in u.query_pairs() {
        let key = k.to_string();
        let value = v.to_string();
        // 中间跳转把真实系统 URL 放在 redirect_uri 里，凭证参数藏在其中
        if matches!(
            key.as_str(),
            "redirect_uri" | "redirectUrl" | "redirect_url" | "redirect"
        ) {
            collect_params_inner(&value, out, depth + 1);
        }
        // 后出现的（越接近终态）优先级更高
        out.insert(key, value);
    }
}

/// 大小写不敏感地取参数值（空串视为不存在）
fn lookup_ci(params: &BTreeMap<String, String>, key: &str) -> Option<String> {
    params
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// 诊断用：从跳转链中提取 mAppId 作为应用标签（取不到时返回占位）
fn current_app_label(chain: &[String]) -> String {
    for hop in chain {
        if let Ok(u) = Url::parse(hop) {
            if let Some((_, v)) = u.query_pairs().find(|(k, _)| k == "mAppId") {
                return v.to_string();
            }
        }
    }
    "目标应用".to_string()
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_key_accepts_keys_ids_and_chinese() {
        assert_eq!(LibraryApp::from_key("seat"), Some(LibraryApp::Seat));
        assert_eq!(LibraryApp::from_key("19248837"), Some(LibraryApp::Seat));
        assert_eq!(LibraryApp::from_key("座位预约"), Some(LibraryApp::Seat));
        assert_eq!(LibraryApp::from_key("quiet_room"), Some(LibraryApp::QuietRoom));
        assert_eq!(LibraryApp::from_key("quietRoom"), Some(LibraryApp::QuietRoom));
        assert_eq!(LibraryApp::from_key("19261750"), Some(LibraryApp::QuietRoom));
        assert_eq!(LibraryApp::from_key("静音仓预约"), Some(LibraryApp::QuietRoom));
        assert_eq!(
            LibraryApp::from_key("seminar_room"),
            Some(LibraryApp::SeminarRoom)
        );
        assert_eq!(LibraryApp::from_key("19248835"), Some(LibraryApp::SeminarRoom));
        assert_eq!(LibraryApp::from_key("研讨室"), Some(LibraryApp::SeminarRoom));
        assert_eq!(LibraryApp::from_key("  "), None);
        assert_eq!(LibraryApp::from_key("unknown"), None);
    }

    #[test]
    fn catalog_matches_recon_contract() {
        let catalog = app_catalog();
        assert_eq!(catalog.len(), 3);
        let seat = catalog.iter().find(|c| c.app == "seat").expect("seat 存在");
        assert_eq!(seat.m_app_id, "19248837");
        assert_eq!(seat.system_path, "/front/apps/seatengine/index");
        assert_eq!(seat.business_key, "seatId");
        assert_eq!(seat.business_value, "3597");
        let quiet = catalog.iter().find(|c| c.app == "quiet_room").expect("quiet 存在");
        assert_eq!(quiet.m_app_id, "19261750");
        assert_eq!(quiet.system_path, "/front/web/apps/reservepc/index");
        assert_eq!(quiet.business_value, "24727");
        let seminar = catalog
            .iter()
            .find(|c| c.app == "seminar_room")
            .expect("seminar 存在");
        assert_eq!(seminar.m_app_id, "19248835");
        assert_eq!(seminar.business_value, "24679");
        // 目录不得包含任何时效凭证
        assert!(!seat.entry_url_without_credentials.contains("Enc"));
    }

    #[test]
    fn collect_params_reads_nested_redirect_uri() {
        let auth_url = "https://auth.chaoxing.com/connect/oauth2/authorize?appid=0be8aa201f084dc2b6956535f906f0ce&redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Ffront%2Fapps%2Fseatengine%2Findex%3FseatId%3D3597%26enc%3DABC%26fidEnc%3DFID%26uid%3D406591160%26mappIdEnc%3DMAPP";
        let mut params = BTreeMap::new();
        collect_params(auth_url, &mut params);
        assert_eq!(params.get("appid").map(String::as_str), Some("0be8aa201f084dc2b6956535f906f0ce"));
        assert_eq!(params.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(params.get("enc").map(String::as_str), Some("ABC"));
        assert_eq!(params.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(params.get("uid").map(String::as_str), Some("406591160"));
        assert_eq!(params.get("mappIdEnc").map(String::as_str), Some("MAPP"));
        // redirect_uri 本身也保留（便于诊断）
        assert!(params.contains_key("redirect_uri"));
    }

    #[test]
    fn terminal_url_overrides_intermediate_params() {
        let mut params = BTreeMap::new();
        collect_params(
            "https://auth.chaoxing.com/connect/oauth2/authorize?redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Fx%3Fenc%3DOLD",
            &mut params,
        );
        collect_params(
            "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597&enc=NEW&code=C1&state=25285",
            &mut params,
        );
        assert_eq!(params.get("enc").map(String::as_str), Some("NEW"));
        assert_eq!(params.get("code").map(String::as_str), Some("C1"));
        assert_eq!(params.get("state").map(String::as_str), Some("25285"));
    }

    #[test]
    fn collect_params_stops_at_nesting_limit() {
        // 构造多层嵌套 redirect_uri：最内层参数不应被解析（防远端自引用导致无限递归）
        let mut url = "https://x.example/?deepKey=LEAK".to_string();
        for _ in 0..5 {
            url = format!(
                "https://x.example/?redirect_uri={}",
                urlencoding::encode(&url)
            );
        }
        let mut params = BTreeMap::new();
        collect_params(&url, &mut params);
        assert!(
            !params.contains_key("deepKey"),
            "超过嵌套上限后不应继续解析：{:?}",
            params.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn credentials_pick_named_fields() {
        let mut params = BTreeMap::new();
        params.insert("enc".into(), "E1".into());
        params.insert("fidEnc".into(), "F1".into());
        params.insert("uid".into(), "406591160".into());
        params.insert("seatIdEnc".into(), "b146028eafa4eea9".into());
        params.insert("reserveIdEnc".into(), "".into());
        let cred = LibraryReserveCredentials::from_params(&params);
        assert_eq!(cred.enc.as_deref(), Some("E1"));
        assert_eq!(cred.fid_enc.as_deref(), Some("F1"));
        assert_eq!(cred.uid.as_deref(), Some("406591160"));
        assert_eq!(cred.seat_id_enc.as_deref(), Some("b146028eafa4eea9"));
        // 空值视为缺失
        assert!(cred.reserve_id_enc.is_none());
        assert!(cred.has_any());
    }

    #[test]
    fn login_and_permission_detection() {
        assert!(is_login_page_url(
            "https://passport2.chaoxing.com/login?fid=&refer=http%3A%2F%2Fv1.chaoxing.com"
        ));
        assert!(is_login_page_url("https://sso.chaoxing.com/login"));
        // 实测未登录链路终态：学校 CAS 登录页
        assert!(is_login_page_url(
            "https://auth.hbut.edu.cn/authserver/login?service=https%3A%2F%2Funified-auth.chaoxing.com%2Flogin_auth%2Fcas%2Fhbut%2Findex"
        ));
        // 回归：unified-auth 是超星统一授权入口，登录成功后也会经过，绝不能判成登录页
        assert!(!is_login_page_url(
            "https://unified-auth.chaoxing.com/login_auth/hbut/init?refer="
        ));
        // 正常业务页不是登录页
        assert!(!is_login_page_url(
            "https://reserve.chaoxing.com/front/web/apps/reservepc/index"
        ));
        assert!(!is_login_page_url("https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=1"));

        // 正文特征：超星登录页 / 学校 CAS 页
        assert!(looks_like_login_body("<html><title>账号登录</title></html>"));
        assert!(looks_like_login_body("<div>统一身份认证</div>"));
        assert!(looks_like_login_body(
            "<form action=\"/authserver/login;jsessionid=1\"></form>"
        ));
        assert!(!looks_like_login_body("<html><title>座位预约</title></html>"));

        assert!(looks_like_no_permission(
            500,
            "未查询到您所访问的应用，请咨询管理员配置是否正确"
        ));
        assert!(looks_like_no_permission(403, ""));
        assert!(!looks_like_no_permission(200, "{\"data\":{\"seatConfig\":{}}}"));
        // 短错误页上的弱特征可识别
        assert!(looks_like_no_permission(200, "<div>无权限</div>"));
        // 体量大的正常业务页内联出现「未授权」不误判
        let big_page = format!("<html>{}未授权</html>", "x".repeat(4000));
        assert!(!looks_like_no_permission(200, &big_page));
    }

    #[test]
    fn json_error_message_reads_failure_payload() {
        assert_eq!(
            json_error_message("{\"success\":false,\"msg\":\"应用不存在\"}").as_deref(),
            Some("应用不存在")
        );
        assert_eq!(json_error_message("{\"success\":true}"), None);
        assert_eq!(json_error_message("<html></html>"), None);
    }

    #[test]
    fn extract_next_hop_handles_meta_and_js() {
        let meta = r#"<html><head><meta http-equiv="refresh" content="0;url=https://auth.chaoxing.com/connect/oauth2/authorize?appid=1&amp;redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Fx"></head></html>"#;
        let hop = extract_next_hop_from_body(meta).expect("meta 跳转可解析");
        assert!(hop.starts_with("https://auth.chaoxing.com/connect/oauth2/authorize"));
        assert!(hop.contains("&redirect_uri="), "HTML 实体应被解码：{hop}");

        let js = r#"<script>window.location.href = 'https://auth.chaoxing.com/connect/oauth2/authorize?appid=1';</script>"#;
        assert_eq!(
            extract_next_hop_from_body(js).as_deref(),
            Some("https://auth.chaoxing.com/connect/oauth2/authorize?appid=1")
        );

        // 普通业务页不应被误判为跳转
        assert_eq!(
            extract_next_hop_from_body("<div class=\"seat_index\">座位预约</div>"),
            None
        );
    }

    #[test]
    fn network_error_heuristic_does_not_misfire_on_chaoxing_wording() {
        assert!(looks_like_network_error(
            "error sending request for url (https://passport2.chaoxing.com/)"
        ));
        assert!(looks_like_network_error("operation timed out"));
        // 超星登录态提示语里含「（不是断网）」，不能被判成网络故障
        assert!(!looks_like_network_error(
            "门户未登录或会话已失效，且无法静默续期。请重新登录融合门户（不是断网）"
        ));
        assert!(!looks_like_network_error(
            "CAS→学习通桥接失败。请重新登录融合门户后重试"
        ));
    }

    #[test]
    fn error_kinds_are_distinguishable() {
        let n = LibraryReserveError::not_logged_in("x");
        assert_eq!(n.kind, ERR_CHAOXING_NOT_LOGGED_IN);
        assert!(n.can_relogin);
        let p = LibraryReserveError::no_permission("x");
        assert_eq!(p.kind, ERR_NO_PERMISSION);
        assert!(!p.can_relogin);
        let net = LibraryReserveError::network_unreachable("x");
        assert_eq!(net.kind, ERR_NETWORK_UNREACHABLE);
        let bad = LibraryReserveError::invalid_app("x");
        assert_eq!(bad.kind, ERR_INVALID_APP);
        let un = LibraryReserveError::unexpected("x", &["a".into(), "b".into()]);
        assert_eq!(un.kind, ERR_UNEXPECTED_RESPONSE);
        assert_eq!(un.detail.as_deref(), Some("a -> b"));
        // 序列化后前端可按 kind 分支
        let v = serde_json::to_value(&n).expect("可序列化");
        assert_eq!(v.get("kind").and_then(|k| k.as_str()), Some(ERR_CHAOXING_NOT_LOGGED_IN));
    }
}
