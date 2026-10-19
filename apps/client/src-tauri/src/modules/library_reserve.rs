//! 图书馆预约（超星 reserve）基础链路（#1052）
//!
//! 本模块只做「地基」：把 **mAppId → 真实系统入口地址 + 凭证** 这条链路打通，
//! 供后续 sub-issue（座位预约 / 静音仓 / 研讨室 业务接口，#1053 / #1054）复用。
//! 不含任何具体业务接口调用。
//!
//! 此外还收拢两个业务模块**共用**的通用工具（JSON 宽松取值、表单 / query 编码、
//! 业务失败分类、业务响应统一处理），避免 #1053 / #1054 各写一份而漂移。
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
pub(crate) const RESERVE_API_BASE: &str = "https://reserve.chaoxing.com/data/apps/";
/// 最多跟随跳转次数（防跳转环）
const MAX_REDIRECT_HOPS: usize = 12;
/// 与主 HTTP 客户端保持一致的 UA（超星对 UA 有校验）
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
/// 入口请求超时
const ENTRY_TIMEOUT: Duration = Duration::from_secs(25);
/// 抓取落地页（提取服务端注入参数）的超时
const PAGE_FETCH_TIMEOUT: Duration = Duration::from_secs(25);

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
/// 预约凭证未取得或已失效（入口解析失败 / 缺 `seatIdEnc` / `reserveIdEnc` / 被超星判定「应用未找到」）
///
/// 与 [`ERR_NO_PERMISSION`] **严格区分**：超星在**缺凭证**时返回
/// `{"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}`（HTTP 200），
/// 这是「凭证缺失 / 失效」而**不是**「当前账号没有该应用权限」（见
/// `data/library-reserve-recon/02-live-verification-2026-10-16.md` §二 / §三）。
/// 属**可重试**类：重新走入口链路（必要时重新登录）会重新派生凭证。
pub const ERR_CREDENTIAL_INVALID: &str = "credential_invalid";

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
    /// 诊断细节（重定向链）。
    ///
    /// ⚠️ 该字段会经 IPC 交给前端，因此链上 URL **已脱敏**：只保留
    /// `scheme://host/path`，query / fragment 全部丢弃（见 [`chain_detail`]）。
    /// 链上 query 携带 `enc` / `fidEnc` / `uid` / `code` / `mappIdEnc` / `seatIdEnc`
    /// 等短时效凭证，绝不外泄。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl LibraryReserveError {
    fn new(
        kind: &str,
        message: impl Into<String>,
        can_relogin: bool,
        detail: Option<String>,
    ) -> Self {
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

    /// 预约凭证未取得或已失效（可重试）。
    ///
    /// `can_relogin = true` 的理由：
    /// 1. 凭证（`seatIdEnc` / `reserveIdEnc` / `fidEnc` 等）由**登录态驱动的入口链路**实时派生，
    ///    重新登录会重跑入口解析并重新注入凭证；
    /// 2. 已 grep 前端（`apps/client/src/**`）：`canRelogin` **未在任何逻辑中被消费**（仅注释提及），
    ///    因此该标志只承载提示语义，按「可重新登录 / 重试」取值即可，不会触发前端误行为。
    pub fn credential_invalid(message: impl Into<String>) -> Self {
        Self::new(ERR_CREDENTIAL_INVALID, message, true, None)
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
        Self::new(ERR_UNEXPECTED_RESPONSE, message, false, chain_detail(chain))
    }

    /// **业务规则失败**（时段被占 / 超限 / 违约停用等）。
    ///
    /// `kind` 由调用方按服务端提示语分类（见 [`classify_business_failure`]），
    /// 与「网络不可达」「未登录超星」严格区分：`can_relogin` 恒为 `false`，
    /// 因为重新登录不能解决业务规则拒绝。
    pub fn business(kind: &str, message: impl Into<String>) -> Self {
        Self::new(kind, message, false, None)
    }
}

impl std::fmt::Display for LibraryReserveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.kind, self.message)
    }
}

impl std::error::Error for LibraryReserveError {}

/// 跳转链 → 诊断文本（None 表示无跳转链）。
///
/// ⚠️ **脱敏**：链上 URL 的 query 携带 `enc` / `fidEnc` / `uid` / `code` /
/// `mappIdEnc` / `seatIdEnc` 等短时效凭证，而 `detail` 会经 IPC 交给前端，
/// 因此这里只保留 `scheme://host/path`，丢弃全部 query 与 fragment。
/// 诊断（跳到哪个 host / path、链路长度）不依赖 query，凭证则没必要外泄。
fn chain_detail(chain: &[String]) -> Option<String> {
    if chain.is_empty() {
        None
    } else {
        Some(
            chain
                .iter()
                .map(|hop| sanitize_url(hop))
                .collect::<Vec<_>>()
                .join(" -> "),
        )
    }
}

/// URL 脱敏：只保留 `scheme://host/path`（丢弃 query / fragment）。
///
/// 解析失败时返回固定占位符而**不回显原串**：无法确认形态的文本同样可能含凭证。
fn sanitize_url(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(u) => format!(
            "{}://{}{}",
            u.scheme(),
            u.host_str().unwrap_or(""),
            u.path()
        ),
        Err(_) => "<无法解析的地址>".to_string(),
    }
}

// ── 通用 JSON 取值工具（#1053 / #1054 共用） ──
//
// 超星接口的字段类型不稳定（同一字段在不同版本里可能是 number / string / bool），
// 因此统一用「宽松取值」工具：按候选键名依次尝试，取到第一个可用值。
// 两个业务模块（reservepc / seatengine）都需要这一套，故收拢在基础模块，
// 避免两份实现各自漂移。

/// 宽松取整型（兼容数字字符串与布尔）
pub(crate) fn as_i64_loose(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(s) => {
            let t = s.trim();
            if t.is_empty() {
                return None;
            }
            t.parse::<i64>()
                .ok()
                .or_else(|| t.parse::<f64>().ok().map(|f| f as i64))
        }
        Value::Bool(b) => Some(if *b { 1 } else { 0 }),
        _ => None,
    }
}

/// 宽松取浮点（如实测的 `cancelLimit: -1.0`）
pub(crate) fn as_f64_loose(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// 宽松取布尔（兼容 `"true"` / `1` / `"1"` / `"yes"`）
pub(crate) fn as_bool_loose(v: &Value) -> Option<bool> {
    match v {
        Value::Bool(b) => Some(*b),
        Value::Number(n) => n.as_i64().map(|i| i != 0),
        Value::String(s) => match s.trim().to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Some(true),
            "false" | "0" | "no" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

/// 顶层布尔字段（`success` 等）
pub(crate) fn bool_field(v: &Value, key: &str) -> Option<bool> {
    v.get(key).and_then(as_bool_loose)
}

/// 按候选键顺序取整型（兼容数字字符串）
pub(crate) fn value_i64(v: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter().find_map(|k| v.get(*k).and_then(as_i64_loose))
}

/// 按候选键顺序取浮点
pub(crate) fn value_f64(v: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|k| v.get(*k).and_then(as_f64_loose))
}

/// 按候选键顺序取非空字符串（数字 / 布尔转文本，空串视为缺失）
pub(crate) fn value_string(v: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| {
        v.get(*k).and_then(|x| match x {
            Value::String(s) => {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            }
            Value::Number(n) => Some(n.to_string()),
            Value::Bool(b) => Some(b.to_string()),
            _ => None,
        })
    })
}

/// 按候选键顺序取布尔（兼容 `"true"` / `1` / `"1"`）
pub(crate) fn value_bool(v: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|k| v.get(*k).and_then(as_bool_loose))
}

/// 非空 trim 后的 `Option<String>`
pub(crate) fn non_empty(raw: Option<&str>) -> Option<String> {
    raw.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// `application/x-www-form-urlencoded` 编码。
///
/// `urlencoding::encode` 把空格编成 `%20`，而表单规范要求 `+`；这里统一换成 `+`
/// （`%` 已被编成 `%25`，因此替换不会破坏原值中的字面 `%20`）。
pub(crate) fn form_encode(raw: &str) -> String {
    urlencoding::encode(raw).replace("%20", "+")
}

/// 表单体 / query 串编码（键值都做百分号编码；用 `BTreeMap` 保证顺序稳定，便于复现与测试）
pub(crate) fn encode_form(params: &BTreeMap<String, String>) -> String {
    params
        .iter()
        .map(|(k, v)| format!("{}={}", form_encode(k), form_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

// ── 业务失败分类（reservepc / seatengine 共用） ──

/// 时段不可用（已被预约 / 冲突 / 已满）
pub(crate) const ERR_SLOT_UNAVAILABLE: &str = "slot_unavailable";
/// 超出预约限额（时长 / 次数 / 数量上限）
pub(crate) const ERR_RESERVE_LIMIT: &str = "reserve_limit_exceeded";
/// 违约停用（违约次数达上限被暂停预约权限）
pub(crate) const ERR_RESERVE_SUSPENDED: &str = "reserve_suspended";
/// 其它业务规则拒绝（服务端明确返回失败，但无法归入上述三类）
pub(crate) const ERR_BUSINESS_REJECTED: &str = "business_rejected";
/// 调用方参数非法（本地校验拦截，未发请求）
pub(crate) const ERR_INVALID_PARAMS: &str = "invalid_params";

/// 登录态失效类提示语特征。
///
/// 部分接口在登录态失效时以 `success:false` 返回（而不是 HTML 登录页），
/// 因此登录态判定不能只看 HTTP 形态，必须同时看提示语：
/// [`classify_business_failure`] 与 [`classify_entry_json_failure`] 共用本表。
const LOGIN_NEEDLES: [&str; 6] = [
    "未登录",
    "请登录",
    "登录失效",
    "登录已失效",
    "重新登录",
    "会话已失效",
];

/// 「应用未找到」类提示语特征 —— 属**凭证缺失 / 失效**，**不是**「无权限」。
///
/// 实测（2026-10-16）：缺 `seatIdEnc` / `reserveIdEnc` 时，接口返回
/// `{"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}`。
/// [`looks_like_credential_invalid`] 与 [`classify_entry_json_failure`] 共用本表，
/// 保证「缺凭证」在整条链路上都被判为 [`ERR_CREDENTIAL_INVALID`]。
const CREDENTIAL_INVALID_NEEDLES: [&str; 2] = ["未查询到您所访问的应用", "应用不存在"];

/// 违约 / 停用类提示语特征（判定顺序最优先：既含「违约」又含「次数」的提示应归为停用）
const SUSPENDED_NEEDLES: [&str; 8] = [
    "停用",
    "暂停",
    "禁用",
    "违约",
    "黑名单",
    "封禁",
    "禁止",
    "限制预约",
];
/// 时段被占 / 冲突类提示语特征
const SLOT_NEEDLES: [&str; 10] = [
    "已被预约",
    "已被占",
    "已被预定",
    "已被预订",
    "已满",
    "不可预约",
    "冲突",
    "重复预约",
    "已被他人",
    "已被使用",
];
/// 超限类提示语特征
const LIMIT_NEEDLES: [&str; 8] = [
    "超出",
    "超过",
    "上限",
    "最多",
    "已达",
    "时长限制",
    "次数限制",
    "限额",
];

/// 按服务端提示语把业务失败分类为可机器判别的错误。
///
/// 判定顺序：登录态失效 → 违约停用 → 时段被占 → 超限 → 兜底业务失败。
/// 与「网络不可达」严格区分：传输层错误在 HTTP 辅助函数里已由
/// [`classify_transport_error`] 捕获，不会走到这里。
pub(crate) fn classify_business_failure(message: &str, context: &str) -> LibraryReserveError {
    let msg = message.trim();
    let msg = if msg.is_empty() {
        "服务端未返回失败原因"
    } else {
        msg
    };

    // 部分接口在登录态失效时以 `success:false` 返回，而不是 HTML 登录页
    if contains_any(msg, &LOGIN_NEEDLES) {
        return LibraryReserveError::not_logged_in(format!(
            "{context}失败：{msg}。请重新登录融合门户后重试"
        ));
    }
    if contains_any(msg, &SUSPENDED_NEEDLES) {
        return LibraryReserveError::business(
            ERR_RESERVE_SUSPENDED,
            format!("{context}失败：{msg}"),
        );
    }
    if contains_any(msg, &SLOT_NEEDLES) {
        return LibraryReserveError::business(
            ERR_SLOT_UNAVAILABLE,
            format!("{context}失败：{msg}"),
        );
    }
    if contains_any(msg, &LIMIT_NEEDLES) {
        return LibraryReserveError::business(ERR_RESERVE_LIMIT, format!("{context}失败：{msg}"));
    }
    LibraryReserveError::business(ERR_BUSINESS_REJECTED, format!("{context}失败：{msg}"))
}

/// 提示语是否包含任一特征词
pub(crate) fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

/// 取 `data` 字段，并把 `success:false` / 非 0 业务码统一转成可区分的错误。
///
/// ⚠️ 这是**读操作**的宽松判定：无 `success` / `code` 字段时视为成功
/// （部分查询接口确实不套成功标志）。**写操作必须用 [`api_write_result`]**，
/// 它要求显式成功信号，不会把「服务端用其它形态表达拒绝」当成成功。
///
/// 少数接口不套 `data` 包装（直接把业务对象放顶层），此时原样返回整个响应，
/// 避免解析结果变成 `null` 而丢失信息。
pub(crate) fn api_data(value: &Value, context: &str) -> Result<Value, LibraryReserveError> {
    if bool_field(value, "success") == Some(false) {
        return Err(classify_business_failure(&error_message(value), context));
    }
    if let Some(code) = value.get("code").and_then(as_i64_loose) {
        if code != 0 && code != 200 {
            return Err(classify_business_failure(&error_message(value), context));
        }
    }
    match value.get("data") {
        Some(data) => Ok(data.clone()),
        None => Ok(value.clone()),
    }
}

/// **写操作**（提交 / 取消）的响应判定结果。
#[derive(Debug, Clone)]
pub(crate) struct WriteOutcome {
    /// 业务数据（`data` 字段；无包装时为空对象）
    pub data: Value,
    /// 服务端提示语（可能为空）
    pub message: Option<String>,
    /// 原始响应（原样返回，便于联调与前端兜底展示）
    pub raw: Value,
}

/// **写操作**响应判定：必须拿到**显式成功信号**，否则一律报错，**绝不默认成功**。
///
/// 为什么不能用 [`api_data`]：写接口的契约尚未实测（`reserve/multiple/submit` /
/// `reserve/del/form/aprv`，见 TODO(#1053)）。服务端只要用「非 `success:false`、
/// 非 `code!=0`」的形态表达拒绝（如 `{"msg":"该时段已被预约"}`、`{}`、
/// `{"result":false}`），宽松判定就会把它当成成功，前端弹出**成功样式**的 toast，
/// 用户以为约到了，实际没有 —— 这类假成功比报错更糟。
///
/// 判定顺序：
/// 1. **显式失败**（`success == false` / `code` 非 `0`、`200`）→ 走
///    [`classify_business_failure`] 得到可区分的业务 `kind`；
/// 2. **显式成功**（`success == true`，或 `code ∈ {0, 200}`）→ 返回 [`WriteOutcome`]；
/// 3. 两者皆无 → 返回「结果未知」错误（`unexpected_response`），
///    提示用户到「我的预约」核对，而不是重试（重试可能造成重复预约）。
pub(crate) fn api_write_result(
    value: &Value,
    context: &str,
) -> Result<WriteOutcome, LibraryReserveError> {
    // 1) 显式失败优先：与读操作共用同一套业务失败分类（含登录态失效识别）
    if bool_field(value, "success") == Some(false) {
        return Err(classify_business_failure(&error_message(value), context));
    }
    let code = value.get("code").and_then(as_i64_loose);
    if let Some(code) = code {
        if code != 0 && code != 200 {
            return Err(classify_business_failure(&error_message(value), context));
        }
    }

    // 2) 显式成功
    let explicit_ok = bool_field(value, "success") == Some(true) || matches!(code, Some(0 | 200));
    if !explicit_ok {
        // 3) 结果未知：不能判成功，也不能判业务失败（服务端没说清楚）。
        // 完整响应只进本地日志；IPC 侧的 message 仅带截断预览（避免超长刷屏）。
        crate::runtime_log::log_warn(
            "LibraryReserve",
            format!("{context}响应缺少显式成功标志，原始响应：{value}"),
        );
        let preview = truncate_for_diagnostic(value, 200);
        return Err(LibraryReserveError::unexpected(
            format!(
                "{context}未返回明确的成功标志（既无 success:true 也无 code:0/200），无法确认是否生效。\
                 请到「我的预约」核对结果后再操作；响应：{preview}"
            ),
            &[],
        ));
    }

    Ok(WriteOutcome {
        data: value.get("data").cloned().unwrap_or_else(|| value.clone()),
        // 成功提示语沿用改造前的键集（`msg` / `message`），不做扩大，避免误取 errorMsg
        message: value_string(value, &["msg", "message"]),
        raw: value.clone(),
    })
}

/// 把 JSON 压成单行并截断，用于诊断文本（避免超长响应刷屏）
fn truncate_for_diagnostic(value: &Value, max_chars: usize) -> String {
    let text = value.to_string();
    if text.chars().count() <= max_chars {
        text
    } else {
        let head: String = text.chars().take(max_chars).collect();
        format!("{head}…（已截断）")
    }
}

/// 从失败响应里取可读提示语
pub(crate) fn error_message(value: &Value) -> String {
    for key in ["msg", "message", "errorMsg", "errorMessage", "resultMsg"] {
        if let Some(s) = value.get(key).and_then(|v| v.as_str()) {
            let t = s.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    "服务端未返回失败原因".to_string()
}

/// 统一业务接口响应处理：登录页 / 无权限 / 空响应 / 非 JSON 都要给出**可区分**的错误。
///
/// 两个业务模块（reservepc / seatengine）的响应形态一致，故共用本函数：
/// 会话失效时超星返回 HTML 登录页而非 JSON，必须与「无权限」「网络不可达」分开报，
/// 否则前端会误导用户去重新登录（或反之）。
pub(crate) async fn read_api_response(
    resp: reqwest::Response,
    path: &str,
) -> Result<Value, LibraryReserveError> {
    let status = resp.status().as_u16();
    let text = resp
        .text()
        .await
        .map_err(|e| classify_transport_error(&e))?;
    let trimmed = text.trim();

    // 登录页正文启发式**只对非 JSON 正文生效**（见 [`looks_like_login_page_body`]）：
    // `seat/i18n` 的契约是「全量文案（含业务提示语）」，其中出现「账号登录」等
    // 标记的概率很高，若据此判未登录，会把正常响应误导成「请重新登录」。
    if looks_like_login_page_body(trimmed) {
        return Err(LibraryReserveError::not_logged_in(format!(
            "调用「{path}」时超星返回登录页，登录态已失效。请重新登录融合门户后重试"
        )));
    }
    // 「凭证缺失 / 失效」必须**早于**「无权限」判定：实测缺 seatIdEnc/reserveIdEnc 时
    // 超星返回的正是「未查询到您所访问的应用」文案，若判成 no_permission 会给出
    // 「重新登录也没用」的误导（见 02-live-verification §三）。
    if looks_like_credential_invalid(status, trimmed) {
        return Err(LibraryReserveError::credential_invalid(format!(
            "调用「{path}」时超星提示「应用未找到」（HTTP {status}）：预约凭证可能未取得或已失效，请重试"
        )));
    }
    if looks_like_no_permission(status, trimmed) {
        return Err(LibraryReserveError::no_permission(format!(
            "调用「{path}」被超星拒绝（HTTP {status}）：当前账号可能没有该应用权限"
        )));
    }
    if trimmed.is_empty() {
        return Err(LibraryReserveError::unexpected(
            format!("「{path}」返回空响应（HTTP {status}）"),
            &[],
        ));
    }
    serde_json::from_str(trimmed).map_err(|e| {
        let preview: String = trimmed.chars().take(120).collect();
        LibraryReserveError::unexpected(
            format!("「{path}」返回非 JSON（HTTP {status}）：{e}；响应前缀：{preview}"),
            &[],
        )
    })
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
            Self::Seat => {
                "移动端 SPA：二级页依赖超星 App 原生桥接，浏览器走不通，选座/签到必须直接调接口"
            }
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

// ── 落地页服务端注入参数（`seatIdEnc` / `reserveIdEnc` / `serverNow`） ──
//
// 实测（2026-10-16）：`seatIdEnc` / `reserveIdEnc` **不在入口跳转链上**，而是由真实系统
// 落地页 HTML 由**服务端注入**（座位页内联 `seatIdEnc: '…'`，静音仓页内联
// `reserveIdEnc: '…'`）。因此需要这两个参数的业务模块，必须在入口解析后**再抓一次落地页**。
// 该能力收拢在基础模块，座位（seatengine）与静音仓/研讨室（reservepc）共用，避免各写一套。

/// 落地页注入参数键名：座位 ID 加密串
pub(crate) const PAGE_KEY_SEAT_ID_ENC: &str = "seatIdEnc";
/// 落地页注入参数键名：预约项 ID 加密串
pub(crate) const PAGE_KEY_RESERVE_ID_ENC: &str = "reserveIdEnc";
/// 落地页注入参数键名：服务端当前时间
pub(crate) const PAGE_KEY_SERVER_NOW: &str = "serverNow";
/// 落地页注入参数键名：部门 ID 加密串（座位余量 / 找空座位接口需要）
///
/// 实测（2026-10-16）：`deptIdEnc` 同样由座位落地页注入，且**取不到时传空串仍可用**
/// （与 `seatIdEnc` 不同），故调用方按「空串兜底」处理，不因缺失而报错。
pub(crate) const PAGE_KEY_DEPT_ID_ENC: &str = "deptIdEnc";

/// 落地页服务端注入参数的提取结果（按 key 取值）。
///
/// ⚠️ 全部为**短时效**值，禁止持久化 / 硬编码。
#[derive(Debug, Clone, Default)]
pub(crate) struct PageInjectedHints {
    values: BTreeMap<String, String>,
}

impl PageInjectedHints {
    /// 按 key 取值（键名见 [`PAGE_KEY_SEAT_ID_ENC`] 等；未取到返回 `None`）
    pub(crate) fn get(&self, key: &str) -> Option<&str> {
        self.values.get(key).map(String::as_str)
    }
}

/// 抓取落地页 HTML，提取请求的注入参数（`keys`，如 `seatIdEnc` / `reserveIdEnc` / `serverNow`）。
///
/// 失败（登录态失效 / 页面结构变更 / 网络问题）返回 `Err`，**由调用方决定是否降级**：
/// 座位模块允许缺失（best-effort），静音仓 / 研讨室在缺少 `reserveIdEnc` 时会报
/// [`ERR_CREDENTIAL_INVALID`]（绝不带缺失参数发请求，见 `library_reserve_pc.rs`）。
pub(crate) async fn fetch_page_injected(
    client: &HbutClient,
    entry: &LibraryAppEntry,
    keys: &[&str],
) -> Result<PageInjectedHints, LibraryReserveError> {
    crate::runtime_log::log_info(
        "LibraryReserve",
        format!(
            "抓取落地页以提取注入参数 app={} 键数={}",
            entry.app,
            keys.len()
        ),
    );
    let resp = client
        .client
        .get(&entry.entry_url)
        .header(ACCEPT, "text/html,application/xhtml+xml,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .timeout(PAGE_FETCH_TIMEOUT)
        .send()
        .await
        .map_err(|e| classify_transport_error(&e))?;

    let status = resp.status().as_u16();
    let html = resp
        .text()
        .await
        .map_err(|e| classify_transport_error(&e))?;

    if looks_like_login_body(&html) {
        return Err(LibraryReserveError::not_logged_in(
            "抓取落地页时超星返回登录页，登录态已失效",
        ));
    }
    if looks_like_credential_invalid(status, &html) {
        return Err(LibraryReserveError::credential_invalid(format!(
            "抓取落地页提示「应用未找到」（HTTP {status}）"
        )));
    }
    if looks_like_no_permission(status, &html) {
        return Err(LibraryReserveError::no_permission(format!(
            "抓取落地页被超星拒绝（HTTP {status}）"
        )));
    }

    let mut values = BTreeMap::new();
    for key in keys {
        if let Some(value) = extract_page_value(&html, key) {
            values.insert((*key).to_string(), value);
        }
    }
    Ok(PageInjectedHints { values })
}

/// 从页面 HTML / 内联 JS 中提取某个键的字符串值（best-effort）。
///
/// 支持两种形态（按优先级）：
/// 1. 赋值 / JSON 字段：`key = new Date('2026-10-15T23:31:03.073+08:00')`、`key = "v"`、
///    `"key":"v"` —— 键后允许一个引号（JSON 键），等号 / 冒号与引号之间允许少量
///    「非分隔符」字符（如 ` new Date(`）；
/// 2. URL query 里的裸值：`key=value`（值到 `&` / 引号 / 空白为止）。
///
/// 刻意排除 `& ? = / , : ; { } [ ] < > \` 等分隔符，避免把后续无关的引号串误当成该键的值。
fn extract_page_value(html: &str, key: &str) -> Option<String> {
    let escaped = regex::escape(key);

    let quoted = regex::Regex::new(&format!(
        r#"{escaped}['"]?\s*[:=][^'"\n&?=/,:;{{}}\[\]<>\\]{{0,32}}['"]([^'"]{{1,200}})['"]"#
    ))
    .ok()?;
    if let Some(cap) = quoted.captures(html).and_then(|c| c.get(1)) {
        let text = cap.as_str().trim();
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }

    let bare = regex::Regex::new(&format!(r#"{escaped}=([^&'"\s<>\\]{{1,200}})"#)).ok()?;
    let cap = bare.captures(html).and_then(|c| c.get(1))?;
    let text = cap.as_str().trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
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
        let body = resp
            .text()
            .await
            .map_err(|e| classify_transport_error(&e))?;

        if looks_like_login_body(&body) {
            return Err(LibraryReserveError::not_logged_in(
                "超星返回登录页（学校统一身份认证），登录态已失效。请重新登录融合门户",
            ));
        }
        if let Some(msg) = json_error_message(&body) {
            return Err(classify_entry_json_failure(&msg));
        }
        // HTML 错误页上的「应用未找到」文案同样属凭证缺失 / 失效，不能落进「无权限」
        if looks_like_credential_invalid(status, &body) {
            return Err(LibraryReserveError::credential_invalid(format!(
                "预约入口提示「应用未找到」（HTTP {status}）：凭证可能未取得或已失效，请重试"
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
pub(crate) fn classify_transport_error(err: &reqwest::Error) -> LibraryReserveError {
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
    base_url.join(location).map(|u| u.to_string()).map_err(|e| {
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
pub(crate) fn looks_like_login_body(body: &str) -> bool {
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

/// 登录页**正文**启发式（仅对**非 JSON** 正文生效）。
///
/// 直接调用 [`looks_like_login_body`] 会把 JSON 响应也纳入判定，而 `seat/i18n`
/// 契约是「**全量文案（含业务提示语）**」，正常响应里很可能出现「账号登录」等
/// 标记 → 正常响应被判成未登录（`can_relogin=true`），误导用户去重新登录。
///
/// 能解析为 JSON（或以 `{` / `[` 开头）的正文一律按 JSON 处理，不参与该启发式；
/// 与 [`looks_like_no_permission`] 的「长度门槛 / 错误码门槛」防误判思路一致。
fn looks_like_login_page_body(body: &str) -> bool {
    !looks_like_json_body(body) && looks_like_login_body(body)
}

/// 正文是否 JSON（`{` / `[` 开头，或能成功 `serde_json::from_str`）
fn looks_like_json_body(trimmed: &str) -> bool {
    trimmed.starts_with('{')
        || trimmed.starts_with('[')
        || serde_json::from_str::<Value>(trimmed).is_ok()
}

/// 正文是否「凭证缺失 / 失效」类错误（超星「应用未找到」）。
///
/// 实测：缺 `seatIdEnc` / `reserveIdEnc` 时接口返回
/// `{"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}`（HTTP 200），
/// 语义是**凭证未取得 / 已失效**，而非「账号无权限」。
///
/// 防误判（关键）：`seat/i18n` 的契约是「**全量文案（含业务提示语）**」，其中出现
/// 「应用不存在」等同名字符串的概率不低。因此对能解析为 JSON 的正文**只认显式失败**
/// （`success:false`）；非 JSON（错误页）则沿用「HTTP 错误码 / 短正文」门槛。
/// 与 [`looks_like_no_permission`] 的防误判思路一致。
pub(crate) fn looks_like_credential_invalid(status: u16, body: &str) -> bool {
    if !contains_any(body, &CREDENTIAL_INVALID_NEEDLES) {
        return false;
    }
    match serde_json::from_str::<Value>(body.trim()) {
        // JSON：必须是显式失败响应，避免把成功 JSON（全量文案）里的同名字符串误判
        Ok(v) => bool_field(&v, "success") == Some(false),
        // 非 JSON（错误页）：短正文或 HTTP 错误码才判定
        Err(_) => status >= 400 || body.len() < 1500,
    }
}

/// 正文 / 状态码是否「无权限」。
///
/// 判定已按实测收紧：
/// - **不再**把「未查询到您所访问的应用 / 应用不存在」当无权限 —— 那是**凭证缺失 / 失效**
///   （见 [`looks_like_credential_invalid`]）；
/// - `403` **不再**无条件判无权限（403 也可能是风控 / 来源校验），
///   必须正文**同时命中**权限类特征词；
/// - 弱特征仅在 HTTP 错误响应或**短正文**（错误页）上判定，
///   避免把正常业务页内联文案里的「未授权」误判成无权限。
pub(crate) fn looks_like_no_permission(status: u16, body: &str) -> bool {
    // 正常业务页（体量大且非错误码）不参与判定
    if status < 400 && body.len() >= 1500 {
        return false;
    }
    const WEAK: [&str; 4] = ["无权限", "没有权限", "暂无权限", "未授权"];
    contains_any(body, &WEAK)
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

/// 入口链路 `{"success":false,...}` 的提示语 → 可判别错误。
///
/// ⚠️ 不能一律归为 `no_permission`：`no_permission` 的语义是「已登录，但该账号
/// 确实没有此应用权限」，`can_relogin=false`，会告诉用户「重新登录无用」。
/// 但入口被拒的提示语同样可能是登录态失效（「未登录 / 请登录 / 登录失效」），
/// 那种情况重新登录正是解法，误判会让用户卡死在「无权限」上。
///
/// 实测补充（2026-10-16）：「未查询到您所访问的应用 / 应用不存在」是**凭证 / 应用
/// 配置未命中**（可重试），归入 [`ERR_CREDENTIAL_INVALID`]，而**不是**「无权限」。
///
/// 登录类提示语复用与 [`classify_business_failure`] 同一张特征表（[`LOGIN_NEEDLES`]），
/// 保证全局判定一致。
fn classify_entry_json_failure(message: &str) -> LibraryReserveError {
    let msg = message.trim();
    let msg = if msg.is_empty() {
        "超星返回失败"
    } else {
        msg
    };
    if contains_any(msg, &LOGIN_NEEDLES) {
        return LibraryReserveError::not_logged_in(format!(
            "超星拒绝该应用入口（登录态相关）：{msg}。请重新登录融合门户后重试"
        ));
    }
    if contains_any(msg, &CREDENTIAL_INVALID_NEEDLES) {
        return LibraryReserveError::credential_invalid(format!(
            "超星未找到该应用入口（凭证可能未取得或已失效）：{msg}。请重试；若持续失败请重新登录融合门户"
        ));
    }
    LibraryReserveError::no_permission(format!("超星拒绝该应用入口：{msg}"))
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
    if let Ok(re) =
        regex::Regex::new(r#"(?is)location\s*(?:\.\s*(?:href|replace)\s*)?[=(]\s*["']([^"']+)["']"#)
    {
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
            if candidate.contains("/connect/oauth2/authorize") || candidate.contains(RESERVE_HOST) {
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
        assert_eq!(
            LibraryApp::from_key("quiet_room"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("quietRoom"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("19261750"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("静音仓预约"),
            Some(LibraryApp::QuietRoom)
        );
        assert_eq!(
            LibraryApp::from_key("seminar_room"),
            Some(LibraryApp::SeminarRoom)
        );
        assert_eq!(
            LibraryApp::from_key("19248835"),
            Some(LibraryApp::SeminarRoom)
        );
        assert_eq!(
            LibraryApp::from_key("研讨室"),
            Some(LibraryApp::SeminarRoom)
        );
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
        let quiet = catalog
            .iter()
            .find(|c| c.app == "quiet_room")
            .expect("quiet 存在");
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
        assert_eq!(
            params.get("appid").map(String::as_str),
            Some("0be8aa201f084dc2b6956535f906f0ce")
        );
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
        assert!(!is_login_page_url(
            "https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=1"
        ));

        // 正文特征：超星登录页 / 学校 CAS 页
        assert!(looks_like_login_body(
            "<html><title>账号登录</title></html>"
        ));
        assert!(looks_like_login_body("<div>统一身份认证</div>"));
        assert!(looks_like_login_body(
            "<form action=\"/authserver/login;jsessionid=1\"></form>"
        ));
        assert!(!looks_like_login_body(
            "<html><title>座位预约</title></html>"
        ));

        // 实测修正：超星「应用未找到」文案是**凭证缺失/失效**，不再判无权限
        assert!(!looks_like_no_permission(
            500,
            "未查询到您所访问的应用，请咨询管理员配置是否正确"
        ));
        assert!(looks_like_credential_invalid(
            500,
            "未查询到您所访问的应用，请咨询管理员配置是否正确"
        ));
        // 403 不再无条件判无权限：正文无特征词 → 不是无权限
        assert!(!looks_like_no_permission(403, ""));
        // 403 且正文命中权限特征词 → 仍判无权限
        assert!(looks_like_no_permission(403, "<div>无权限</div>"));
        assert!(!looks_like_no_permission(
            200,
            "{\"data\":{\"seatConfig\":{}}}"
        ));
        // 短错误页上的弱特征可识别
        assert!(looks_like_no_permission(200, "<div>无权限</div>"));
        // 体量大的正常业务页内联出现「未授权」不误判
        let big_page = format!("<html>{}未授权</html>", "x".repeat(4000));
        assert!(!looks_like_no_permission(200, &big_page));
    }

    #[test]
    fn credential_invalid_detection_requires_explicit_json_failure() {
        // 实测的失败响应（HTTP 200）→ 判凭证缺失
        assert!(looks_like_credential_invalid(
            200,
            r#"{"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}"#
        ));
        assert!(looks_like_credential_invalid(
            200,
            r#"{"success":false,"msg":"应用不存在"}"#
        ));
        // 成功 JSON 里出现同名字符串（如 seat/i18n 全量文案）**不得**误判
        assert!(!looks_like_credential_invalid(
            200,
            r#"{"i18n":{"appNotFound":"应用不存在","tip":"未查询到您所访问的应用"}}"#
        ));
        assert!(!looks_like_credential_invalid(
            200,
            r#"{"success":true,"data":{"msg":"应用不存在"}}"#
        ));
        // 无特征词 → 不判
        assert!(!looks_like_credential_invalid(200, r#"{"success":false}"#));
        // 非 JSON 错误页：短正文 / HTTP 错误码命中
        assert!(looks_like_credential_invalid(500, "<div>应用不存在</div>"));
        assert!(looks_like_credential_invalid(400, "未查询到您所访问的应用"));
        // 非 JSON 且体量大、非错误码 → 不判（避免误伤正常页面）
        let big = format!("<html>{}应用不存在</html>", "x".repeat(4000));
        assert!(!looks_like_credential_invalid(200, &big));
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

    // ── P0-2：落地页服务端注入参数提取（座位 / PC 共用） ──

    #[test]
    fn extract_page_value_handles_js_json_and_query() {
        // 勘察原文形态：serverNow = new Date('...')
        let html = "serverNow = new Date('2026-10-15T23:31:03.073+08:00'), \
                    currentServerTime = seatBaseUtils.createServerClock(serverNow);";
        assert_eq!(
            extract_page_value(html, PAGE_KEY_SERVER_NOW).as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );

        // 直接赋值（单 / 双引号）
        assert_eq!(
            extract_page_value(
                "var seatIdEnc = \"b146028eafa4eea9\";",
                PAGE_KEY_SEAT_ID_ENC
            )
            .as_deref(),
            Some("b146028eafa4eea9")
        );
        // 实测原文形态（静音仓页）：reserveIdEnc: '838c48dae07db28c'
        assert_eq!(
            extract_page_value(
                "reserveIdEnc: '838c48dae07db28c', fidEnc: fidEnc",
                PAGE_KEY_RESERVE_ID_ENC
            )
            .as_deref(),
            Some("838c48dae07db28c")
        );

        // JSON 字段形态
        assert_eq!(
            extract_page_value(
                r#"{"seatIdEnc":"abc123","other":"x"}"#,
                PAGE_KEY_SEAT_ID_ENC
            )
            .as_deref(),
            Some("abc123")
        );

        // URL query 里的裸值
        assert_eq!(
            extract_page_value(
                "url + '/front/apps/seatengine/index?seatId=3597&seatIdEnc=deadbeef'",
                PAGE_KEY_SEAT_ID_ENC
            )
            .as_deref(),
            Some("deadbeef")
        );

        // 键不存在 / 值为空 → None（不得把相邻的无关引号串当值）
        assert_eq!(
            extract_page_value("<html></html>", PAGE_KEY_SEAT_ID_ENC),
            None
        );
        assert_eq!(
            extract_page_value("seatIdEnc = ''", PAGE_KEY_SEAT_ID_ENC),
            None
        );
        assert_eq!(
            extract_page_value("seatIdEnc = null, other: \"bar\"", PAGE_KEY_SEAT_ID_ENC),
            None
        );
    }

    #[test]
    fn page_injected_hints_get_by_key() {
        let mut values = BTreeMap::new();
        values.insert(PAGE_KEY_RESERVE_ID_ENC.to_string(), "838c".to_string());
        let hints = PageInjectedHints { values };
        assert_eq!(
            hints.get(PAGE_KEY_RESERVE_ID_ENC),
            Some("838c"),
            "按 key 取值"
        );
        assert_eq!(hints.get(PAGE_KEY_SEAT_ID_ENC), None, "未提取的键为 None");
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
        // 凭证缺失 / 失效：与无权限严格区分，且可重试
        let cred = LibraryReserveError::credential_invalid("x");
        assert_eq!(cred.kind, ERR_CREDENTIAL_INVALID);
        assert!(cred.can_relogin);
        assert_ne!(cred.kind, ERR_NO_PERMISSION);
        let net = LibraryReserveError::network_unreachable("x");
        assert_eq!(net.kind, ERR_NETWORK_UNREACHABLE);
        let bad = LibraryReserveError::invalid_app("x");
        assert_eq!(bad.kind, ERR_INVALID_APP);
        let un = LibraryReserveError::unexpected(
            "x",
            &[
                "https://v1.chaoxing.com/a?enc=1".into(),
                "https://reserve.chaoxing.com/b".into(),
            ],
        );
        assert_eq!(un.kind, ERR_UNEXPECTED_RESPONSE);
        // detail 已脱敏：只保留 scheme://host/path
        assert_eq!(
            un.detail.as_deref(),
            Some("https://v1.chaoxing.com/a -> https://reserve.chaoxing.com/b")
        );
        // 业务失败：kind 由调用方指定，且「重新登录」无意义
        let biz = LibraryReserveError::business("slot_unavailable", "该时段已被预约");
        assert_eq!(biz.kind, "slot_unavailable");
        assert!(!biz.can_relogin);
        assert!(biz.detail.is_none());
        // 序列化后前端可按 kind 分支
        let v = serde_json::to_value(&n).expect("可序列化");
        assert_eq!(
            v.get("kind").and_then(|k| k.as_str()),
            Some(ERR_CHAOXING_NOT_LOGGED_IN)
        );
    }

    // ── 通用 JSON 取值工具（#1053 / #1054 共用） ──

    #[test]
    fn value_helpers_handle_string_numbers_and_bools() {
        let v: Value = serde_json::json!({"a": "12", "b": 3.9, "c": "true", "d": "  ", "e": true});
        assert_eq!(value_i64(&v, &["a"]), Some(12));
        assert_eq!(value_i64(&v, &["b"]), Some(3));
        assert_eq!(value_bool(&v, &["c"]), Some(true));
        assert_eq!(value_string(&v, &["d"]), None, "空白串视为缺失");
        assert_eq!(value_bool(&v, &["e"]), Some(true));
        assert_eq!(value_i64(&v, &["missing", "a"]), Some(12), "按候选顺序回退");
    }

    #[test]
    fn encode_form_percent_encodes_values() {
        let mut p = BTreeMap::new();
        p.insert("fidEnc".to_string(), "c7450f13f8a0e9ab".to_string());
        p.insert("startTime".to_string(), "2026-10-16 08:00".to_string());
        let body = encode_form(&p);
        // BTreeMap 顺序稳定：fidEnc 在前；空格按表单规范编成 `+`
        assert_eq!(body, "fidEnc=c7450f13f8a0e9ab&startTime=2026-10-16+08%3A00");

        // 值里本身含字面 "%20" 时不能被误替换
        assert_eq!(form_encode("a%20b"), "a%2520b");
        assert_eq!(form_encode("张三"), "%E5%BC%A0%E4%B8%89");
    }

    // ── 业务失败分类（#1053 / #1054 共用） ──

    #[test]
    fn business_failure_classification_covers_three_kinds() {
        // 时段被占
        let e = classify_business_failure("该时段已被预约，请选择其它时段", "提交预约");
        assert_eq!(e.kind, ERR_SLOT_UNAVAILABLE);
        assert!(!e.can_relogin);

        let e = classify_business_failure("所选房间已被占用", "提交预约");
        assert_eq!(e.kind, ERR_SLOT_UNAVAILABLE);

        // 超限
        let e = classify_business_failure("预约时长超出单次限制", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_LIMIT);

        let e = classify_business_failure("您今日预约次数已达上限", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_LIMIT);

        // 违约停用（同时含「违约」「次数」，必须归为停用而非超限）
        let e = classify_business_failure("7天内违约3次，预约功能已被暂停", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_SUSPENDED);

        let e = classify_business_failure("您的账号已被限制预约", "提交预约");
        assert_eq!(e.kind, ERR_RESERVE_SUSPENDED);

        // 兜底
        let e = classify_business_failure("参数不正确", "提交预约");
        assert_eq!(e.kind, ERR_BUSINESS_REJECTED);
        assert!(e.message.contains("提交预约失败"));
    }

    #[test]
    fn business_failure_detects_login_expiry_and_network_is_separate() {
        let e = classify_business_failure("未登录或登录已失效", "提交预约");
        assert_eq!(e.kind, ERR_CHAOXING_NOT_LOGGED_IN);
        assert!(e.can_relogin, "登录态问题应可重新登录修复");

        // 网络失败由传输层产生，与业务失败 kind 不同
        let net = LibraryReserveError::network_unreachable("连接超时");
        assert_eq!(net.kind, ERR_NETWORK_UNREACHABLE);
        assert_ne!(net.kind, ERR_SLOT_UNAVAILABLE);
        assert!(!net.can_relogin);
    }

    #[test]
    fn api_data_distinguishes_success_and_business_failure() {
        // 成功：取 data
        let ok: Value = serde_json::json!({"success": true, "data": {"a": 1}});
        assert_eq!(
            api_data(&ok, "x")
                .expect("成功")
                .get("a")
                .and_then(as_i64_loose),
            Some(1)
        );

        // success:false → 业务失败（带 kind）
        let fail: Value = serde_json::json!({"success": false, "msg": "该时段已被预约"});
        let err = api_data(&fail, "提交预约").expect_err("应失败");
        assert_eq!(err.kind, ERR_SLOT_UNAVAILABLE);

        // 非 0 业务码同样归类
        let coded: Value = serde_json::json!({"code": 500, "message": "超出预约限额"});
        let err = api_data(&coded, "提交预约").expect_err("应失败");
        assert_eq!(err.kind, ERR_RESERVE_LIMIT);

        // code=200 视为成功
        let coded_ok: Value = serde_json::json!({"code": 200, "data": {"b": 2}});
        assert!(api_data(&coded_ok, "x").is_ok());

        // 无 success / code 字段（如某些查询接口）视为成功
        let plain: Value = serde_json::json!({"data": {"c": 3}});
        assert!(api_data(&plain, "x").is_ok());

        // 不套 data 包装的接口：原样返回整个响应，不丢信息
        let bare: Value = serde_json::json!({"showStyle": "0"});
        let out = api_data(&bare, "x").expect("成功");
        assert_eq!(out.get("showStyle").and_then(|v| v.as_str()), Some("0"));

        // success 为字符串 "false" 也要识别
        let str_fail: Value = serde_json::json!({"success": "false", "msg": "已被预定"});
        let err = api_data(&str_fail, "提交预约").expect_err("应失败");
        assert_eq!(err.kind, ERR_SLOT_UNAVAILABLE);
    }

    // ── P1-4：诊断链脱敏（detail 不得携带凭证） ──

    #[test]
    fn error_detail_strips_credentials_from_chain() {
        let chain = vec![
            "https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=19248837".to_string(),
            "https://auth.chaoxing.com/connect/oauth2/authorize?appid=abc&redirect_uri=https%3A%2F%2Freserve.chaoxing.com%2Fx%3Fenc%3DENCSECRET%26uid%3D406591160".to_string(),
            "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597&enc=ENCSECRET&fidEnc=FIDSECRET&code=CODESECRET&state=25285&mappIdEnc=MAPPSECRET".to_string(),
        ];
        let err = LibraryReserveError::unexpected("入口未落到预约系统", &chain);
        // 先序列化（模拟经 IPC 交给前端的实际形态），再取 detail 做断言
        let json = serde_json::to_string(&err).expect("可序列化");
        let detail = err.detail.expect("应带诊断链");

        // 凭证一律不得出现（query 全丢）
        for secret in [
            "ENCSECRET",
            "FIDSECRET",
            "CODESECRET",
            "MAPPSECRET",
            "406591160",
        ] {
            assert!(
                !detail.contains(secret),
                "detail 泄漏凭证 {secret}：{detail}"
            );
        }
        assert!(!detail.contains("enc="));
        assert!(!detail.contains("uid="));
        assert!(!detail.contains('?'));

        // 诊断能力保留：host + path 足以定位「跳到哪个系统」
        assert!(detail.contains("https://v1.chaoxing.com/mobileSet/redirectUrlMobile"));
        assert!(detail.contains("https://auth.chaoxing.com/connect/oauth2/authorize"));
        assert!(detail.contains("https://reserve.chaoxing.com/front/apps/seatengine/index"));
        assert_eq!(detail.split(" -> ").count(), 3);

        // 序列化后经 IPC 交给前端时同样不含凭证
        assert!(!json.contains("ENCSECRET"));
        assert!(!json.contains("FIDSECRET"));
        assert!(json.contains("reserve.chaoxing.com/front/apps/seatengine/index"));
    }

    #[test]
    fn sanitize_url_keeps_scheme_host_path_only() {
        assert_eq!(
            sanitize_url(
                "https://reserve.chaoxing.com/front/apps/seatengine/index?enc=S&uid=1#frag"
            ),
            "https://reserve.chaoxing.com/front/apps/seatengine/index"
        );
        assert_eq!(
            sanitize_url("https://auth.chaoxing.com"),
            "https://auth.chaoxing.com/"
        );
        // 解析失败时不回显原串（畸形文本同样可能含凭证）
        assert_eq!(sanitize_url("not a url"), "<无法解析的地址>");
    }

    // ── P1-2：JSON 正文不参与登录页正文启发式 ──

    #[test]
    fn json_body_is_not_treated_as_login_page() {
        // `seat/i18n` 是「全量文案（含业务提示语）」，含「账号登录」等标记也不能判未登录
        assert!(!looks_like_login_page_body(
            r#"{"i18n":{"loginBtn":"账号登录","smsBtn":"短信登录"}}"#
        ));
        assert!(!looks_like_login_page_body(
            r#"{"msg":"请使用账号登录后重试"}"#
        ));
        assert!(!looks_like_login_page_body(r#"[{"text":"统一身份认证"}]"#));

        // HTML 登录页仍必须判出来（CAS / 超星登录页）
        assert!(looks_like_login_page_body(
            "<html><title>账号登录</title></html>"
        ));
        assert!(looks_like_login_page_body(
            "<!DOCTYPE html><form action=\"/authserver/login\"></form>"
        ));
        // 普通业务 HTML 页不误判
        assert!(!looks_like_login_page_body(
            "<html><title>座位预约</title></html>"
        ));

        // 底层标记函数行为不变：HTML 场景仍按它判定
        assert!(looks_like_login_body(r#"{"msg":"账号登录"}"#));
        // JSON 识别
        assert!(looks_like_json_body(r#"{"a":1}"#));
        assert!(looks_like_json_body("[]"));
        assert!(looks_like_json_body("  {\"a\":1}  "));
        assert!(!looks_like_json_body("<html></html>"));
        assert!(!looks_like_json_body(""));
    }

    // ── P1-1：入口 {"success":false} 必须分登录 / 权限 ──

    #[test]
    fn entry_json_failure_separates_login_from_permission() {
        // 登录态类提示语 → 未登录（可重新登录修复）
        for msg in [
            "未登录",
            "请登录后访问",
            "登录失效",
            "登录已失效",
            "请重新登录",
            "会话已失效",
        ] {
            let e = classify_entry_json_failure(msg);
            assert_eq!(e.kind, ERR_CHAOXING_NOT_LOGGED_IN, "msg={msg}");
            assert!(e.can_relogin, "msg={msg} 应可通过重新登录修复");
        }
        // 真正的权限类提示语 → 无权限（重新登录无用）
        for msg in ["无权限访问", "没有权限使用该应用"] {
            let e = classify_entry_json_failure(msg);
            assert_eq!(e.kind, ERR_NO_PERMISSION, "msg={msg}");
            assert!(!e.can_relogin, "msg={msg}");
        }
        // 实测修正：「应用未找到」是凭证缺失 / 失效（可重试），**不是**无权限
        for msg in ["应用不存在", "未查询到您所访问的应用"] {
            let e = classify_entry_json_failure(msg);
            assert_eq!(e.kind, ERR_CREDENTIAL_INVALID, "msg={msg}");
            assert!(e.can_relogin, "msg={msg} 应可重新登录 / 重试");
        }
        // 空提示语兜底为无权限，不 panic
        assert_eq!(classify_entry_json_failure("  ").kind, ERR_NO_PERMISSION);
    }

    // ── P1-3：写操作必须拿到显式成功信号 ──

    #[test]
    fn api_write_result_requires_explicit_success() {
        // ① {} —— 无任何成功标志：绝不能判成功
        let e = api_write_result(&serde_json::json!({}), "提交预约").expect_err("不得默认成功");
        assert_eq!(e.kind, ERR_UNEXPECTED_RESPONSE);
        assert!(!e.can_relogin);
        assert!(e.message.contains("提交预约"));
        assert!(e.message.contains("未返回明确的成功标志"), "{}", e.message);

        // ② {"msg":"..."} —— 服务端用提示语表达拒绝（如时段被占），同样不能判成功
        let e = api_write_result(&serde_json::json!({"msg": "该时段已被预约"}), "提交预约")
            .expect_err("不得默认成功");
        assert_eq!(e.kind, ERR_UNEXPECTED_RESPONSE);
        // {"result":false} 形态同理
        let e = api_write_result(&serde_json::json!({"result": false}), "取消预约")
            .expect_err("不得默认成功");
        assert_eq!(e.kind, ERR_UNEXPECTED_RESPONSE);

        // ③ {"success":true} —— 合法成功形态，必须判成功（不得引入成功误判为失败的回归）
        let ok = api_write_result(&serde_json::json!({"success": true}), "提交预约").expect("成功");
        assert_eq!(ok.raw.get("success").and_then(|v| v.as_bool()), Some(true));
        assert!(ok.message.is_none());

        // ④ {"code":0} —— 合法成功形态；code=200 / 数字字符串 / success:"true" 同样算成功
        assert!(api_write_result(&serde_json::json!({"code": 0}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 200}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": "0"}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"success": "true"}), "提交预约").is_ok());

        // ⑤ {"success":false} —— 显式失败 → 业务 kind
        let e = api_write_result(&serde_json::json!({"success": false}), "提交预约")
            .expect_err("应失败");
        assert_eq!(e.kind, ERR_BUSINESS_REJECTED);

        // ⑥ {"code":500} —— 显式失败 → 业务 kind
        let e =
            api_write_result(&serde_json::json!({"code": 500}), "提交预约").expect_err("应失败");
        assert_eq!(e.kind, ERR_BUSINESS_REJECTED);
    }

    #[test]
    fn api_write_result_keeps_business_classification_and_raw() {
        // 显式失败仍走业务分类（时段被占 / 超限 / 登录失效）
        let e = api_write_result(
            &serde_json::json!({"success": false, "msg": "该时段已被预约"}),
            "提交预约",
        )
        .expect_err("应失败");
        assert_eq!(e.kind, ERR_SLOT_UNAVAILABLE);

        let e = api_write_result(
            &serde_json::json!({"code": 500, "message": "超出预约限额"}),
            "提交预约",
        )
        .expect_err("应失败");
        assert_eq!(e.kind, ERR_RESERVE_LIMIT);

        let e = api_write_result(
            &serde_json::json!({"success": false, "msg": "未登录或登录已失效"}),
            "提交预约",
        )
        .expect_err("应失败");
        assert_eq!(e.kind, ERR_CHAOXING_NOT_LOGGED_IN);
        assert!(e.can_relogin);

        // 成功时返回 data + message + raw（raw 供联调）
        let ok = api_write_result(
            &serde_json::json!({"success": true, "msg": "预约成功", "data": {"aprvId": 42}}),
            "提交预约",
        )
        .expect("成功");
        assert_eq!(ok.data.get("aprvId").and_then(as_i64_loose), Some(42));
        assert_eq!(ok.message.as_deref(), Some("预约成功"));
        assert_eq!(ok.raw.get("success").and_then(|v| v.as_bool()), Some(true));

        // 无 data 包装时原样返回整个响应（不丢信息）
        let ok = api_write_result(
            &serde_json::json!({"success": true, "result": 1}),
            "提交预约",
        )
        .expect("成功");
        assert_eq!(ok.data.get("result").and_then(as_i64_loose), Some(1));

        // 「结果未知」提示用户去核对，而不是重试（重试可能造成重复预约）
        let e = api_write_result(&serde_json::json!({}), "取消预约").expect_err("应失败");
        assert!(e.message.contains("核对"), "{}", e.message);
    }

    #[test]
    fn read_path_stays_lenient_while_write_path_is_strict() {
        // 读操作（api_data）保持宽松：无 success / code 也视为成功，避免误伤查询接口
        let plain = serde_json::json!({"data": {"c": 3}});
        assert!(api_data(&plain, "获取时段").is_ok());
        let bare = serde_json::json!({"showStyle": "0"});
        assert!(api_data(&bare, "获取视图标记").is_ok());
        // 写操作（api_write_result）对同一形态必须报「结果未知」
        assert_eq!(
            api_write_result(&bare, "提交预约").unwrap_err().kind,
            ERR_UNEXPECTED_RESPONSE
        );

        // 显式失败 / 显式成功：两条路径判定一致（只是写路径更严）
        let fail = serde_json::json!({"success": false, "msg": "已被预定"});
        assert_eq!(
            api_data(&fail, "x").unwrap_err().kind,
            api_write_result(&fail, "x").unwrap_err().kind
        );
        let ok = serde_json::json!({"success": true, "data": {"a": 1}});
        assert!(api_data(&ok, "x").is_ok());
        assert!(api_write_result(&ok, "x").is_ok());
    }
}
