//! 图书馆预约 · 座位预约（`seatengine` 接口体系）（#1054）
//!
//! 本模块在 [`crate::modules::library_reserve`]（#1052 地基）之上实现座位预约的
//! **只读查询**能力；静音仓 / 研讨室（PC 版 `reservepc`）在
//! [`crate::modules::library_reserve_pc`]（#1053）中，两者平行、互不依赖。
//!
//! ## 接口契约（`data/library-reserve-recon/01-api-contract.md`，实测）
//!
//! Base `https://reserve.chaoxing.com/data/apps/`；**全部为 GET**（与 reservepc 的 POST 不同）：
//!
//! ```text
//! GET seat/i18n                                                    全量文案
//! GET seat/entrance/config?appType=2&appId=3597                    入口能力开关
//! GET seatengine/index?seatId=3597&seatIdEnc=<enc>                 核心配置 + 当前/最近预约
//! GET seatengine/identity/verify?mappId=..&seatId=..&seatIdEnc=..  身份校验
//! ```
//!
//! ⚠️ 本 issue **只做查询**：选座 / 提交 / 签到 / 暂离的契约尚未抓到
//! （座位预约二级页依赖超星 App 原生桥接，浏览器走不通），
//! 因此本模块**不实现、也不猜测**这些接口形态。
//!
//! ## 两个关键约束
//!
//! 1. **`seatIdEnc` 不得硬编码**（疑似短时效）：优先取入口链路
//!    （[`crate::modules::library_reserve::resolve_entry`]）的实时解析结果。
//!    勘察显示该参数**不在跳转链上**，而是由座位预约页面注入，因此缺失时会再实时抓取一次
//!    页面 HTML 做 best-effort 提取（[`fetch_page_hints`]）；仍取不到则记告警继续请求
//!    （服务端可能由会话推导）。
//! 2. **时间以服务端为准**：页面用服务端注入的 `serverNow` 判断开放时段，本地时间不可信。
//!    本模块把服务端时间**原样透传**给前端（`serverNow`），前端必须以它做开放判断。
//!
//! ## 契约完整度（代码中逐处标注）
//!
//! - ✅ **已实测**：四个端点路径与 GET 参数；`seatConfig` 的核心配置字段（issue #1054 实测表：
//!   放号 / 时长 / 限额 / 违约 / 规则原文 / `onlySupportsApiSignIn`）；
//!   `entrance/config` 的五个开关；`data.curReserves` / `data.nearReserves` 的存在。
//! - ❓ **未实测（TODO(#1054)）**：`i18n` 的键空间、`identity/verify` 的响应结构、
//!   预约条目（`curReserves` / `nearReserves` 元素）的字段名、服务端时间在响应里的字段名。
//!   这些一律「宽松解析 + `raw` 原样保留」，**不把推测伪装成已确定**。

use std::collections::BTreeMap;
use std::time::Duration;

use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, REFERER};
use serde::Serialize;
use serde_json::Value;

use crate::http_client::HbutClient;
use crate::modules::library_reserve::{
    self, api_data, classify_transport_error, encode_form, looks_like_login_body,
    looks_like_no_permission, non_empty, read_api_response, value_bool, value_i64, value_string,
    LibraryApp, LibraryAppEntry, LibraryReserveError, RESERVE_API_BASE,
};

// ── 常量 ──

/// 座位预约页面 Referer（超星会校验来源；实测接口由该页面 AJAX 发起）
const SEAT_REFERER: &str = "https://reserve.chaoxing.com/front/apps/seatengine/index";
/// 业务接口超时（短于主客户端，避免前端长时间无反馈）
const API_TIMEOUT: Duration = Duration::from_secs(25);

/// 全量文案
const ENDPOINT_I18N: &str = "seat/i18n";
/// 入口能力开关
const ENDPOINT_ENTRANCE_CONFIG: &str = "seat/entrance/config";
/// 核心配置（含当前 / 最近预约）
const ENDPOINT_SEAT_INDEX: &str = "seatengine/index";
/// 身份校验
const ENDPOINT_IDENTITY_VERIFY: &str = "seatengine/identity/verify";

/// `seat/entrance/config` 实测固定参数：`appType=2`
const ENTRANCE_APP_TYPE: &str = "2";

/// 服务端时间字段的候选键名。
///
/// TODO(#1054)：实测样本**未给出**响应里的服务端时间字段名，此处是候选集合
/// （按「越具体越靠前」排序）。取到的值还要过 [`plausible_server_time`] 校验，
/// 避免把 `08:00` 这类时段值误当成时间。无论是否命中，`raw` 都会原样透传给前端。
const SERVER_TIME_KEYS: [&str; 9] = [
    "serverNow",
    "serverTime",
    "currentServerTime",
    "currentTime",
    "nowTime",
    "sysTime",
    "systemTime",
    "timestamp",
    "serverTimestamp",
];

/// `commonTimeConfig` 的星期键前缀 → 中文名
const COMMON_TIME_DAY_PREFIXES: [(&str, &str); 7] = [
    ("mon", "周一"),
    ("tue", "周二"),
    ("wed", "周三"),
    ("thu", "周四"),
    ("fri", "周五"),
    ("sat", "周六"),
    ("sun", "周日"),
];

// ── 页面注入参数（best-effort 实时发现） ──

/// 从座位预约页面 HTML 中提取到的注入参数。
///
/// 依据：勘察确认页面内联注入 `serverNow = new Date('...')` 与 `seatIdEnc`，
/// 二者都**不**出现在入口跳转链上。这里只做「读取页面」而不猜测任何接口形态。
#[derive(Debug, Clone, Default)]
struct SeatPageHints {
    /// 页面注入的座位 ID 加密串（短时效）
    seat_id_enc: Option<String>,
    /// 页面注入的服务端当前时间（原样文本）
    server_now: Option<String>,
}

// ── 凭证上下文 ──

/// 一次座位预约调用所需的上下文（**含短时效凭证，禁止缓存**）。
#[derive(Debug, Clone)]
pub(crate) struct SeatContext {
    /// 座位 ID 明文（稳定值 3597）
    seat_id: String,
    /// 座位 ID 加密串（短时效，可能缺失）
    seat_id_enc: Option<String>,
    /// 超星 mAppId（`identity/verify` 需要）
    mapp_id: String,
    /// 页面注入的服务端当前时间（best-effort；响应里若有同义字段则优先用响应值）
    page_server_now: Option<String>,
}

impl SeatContext {
    /// 从入口解析结果构造（顺带校验应用属于本模块）
    fn from_entry(app: LibraryApp, entry: &LibraryAppEntry) -> Result<Self, LibraryReserveError> {
        ensure_seat_app(app)?;

        let (_, business_value) = app.business_id();
        let seat_id = non_empty(entry.credentials.seat_id.as_deref())
            .unwrap_or_else(|| business_value.to_string());
        let seat_id_enc = non_empty(entry.credentials.seat_id_enc.as_deref());
        if seat_id_enc.is_none() {
            crate::runtime_log::log_warn(
                "LibraryReserveSeat",
                "入口链路未携带 seatIdEnc（勘察：该参数由座位预约页面注入，不在跳转链上）；\
                 将尝试从页面实时提取，仍缺失则不带该参数请求",
            );
        }

        Ok(Self {
            seat_id,
            seat_id_enc,
            mapp_id: app.m_app_id().to_string(),
            page_server_now: None,
        })
    }
}

/// 座位预约走 seatengine，不属于 reservepc 模块
fn ensure_seat_app(app: LibraryApp) -> Result<(), LibraryReserveError> {
    if app != LibraryApp::Seat {
        return Err(LibraryReserveError::invalid_app(
            "本模块只处理座位预约（seatengine）；静音仓 / 研讨室请调用 reservepc 相关命令",
        ));
    }
    Ok(())
}

/// 解析应用 → 入口 → 业务上下文（每次调用都实时解析，不复用旧凭证）
async fn resolve_seat_context(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatContext, LibraryReserveError> {
    let entry = library_reserve::resolve_entry(client, app, force).await?;
    let mut ctx = SeatContext::from_entry(app, &entry)?;

    // seatIdEnc 与页面注入的服务端时间都不在跳转链上，需要实时抓一次页面
    if ctx.seat_id_enc.is_none() || ctx.page_server_now.is_none() {
        match fetch_page_hints(client, &entry).await {
            Ok(hints) => {
                if ctx.seat_id_enc.is_none() {
                    ctx.seat_id_enc = hints.seat_id_enc;
                }
                ctx.page_server_now = hints.server_now;
            }
            // 页面抓取失败只降级、不阻断：主流程仍可用（服务端可能由会话推导参数）
            Err(err) => crate::runtime_log::log_warn(
                "LibraryReserveSeat",
                format!(
                    "从座位预约页面提取注入参数失败（不影响主流程）：{}",
                    err.message
                ),
            ),
        }
    }

    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!(
            "座位预约上下文就绪 seatId={} 有 seatIdEnc={} 有服务端时间={}",
            ctx.seat_id,
            ctx.seat_id_enc.is_some(),
            ctx.page_server_now.is_some()
        ),
    );
    Ok(ctx)
}

/// 实时抓取座位预约页面，提取页面注入的 `seatIdEnc` / `serverNow`。
///
/// 失败（登录态失效 / 页面结构变更 / 网络问题）**不阻断主流程**，由调用方降级处理。
async fn fetch_page_hints(
    client: &HbutClient,
    entry: &LibraryAppEntry,
) -> Result<SeatPageHints, LibraryReserveError> {
    crate::runtime_log::log_info("LibraryReserveSeat", "抓取座位预约页面以提取注入参数");
    let resp = client
        .client
        .get(&entry.entry_url)
        .header(ACCEPT, "text/html,application/xhtml+xml,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .timeout(API_TIMEOUT)
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
            "抓取座位预约页面时超星返回登录页，登录态已失效",
        ));
    }
    if looks_like_no_permission(status, &html) {
        return Err(LibraryReserveError::no_permission(format!(
            "抓取座位预约页面被超星拒绝（HTTP {status}）"
        )));
    }

    Ok(SeatPageHints {
        seat_id_enc: extract_page_value(&html, "seatIdEnc"),
        server_now: extract_page_value(&html, "serverNow"),
    })
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

/// 粗判字符串是否像一个服务端时间。
///
/// 真实值为 ISO 风格（`2026-10-15T23:31:03.073+08:00`）或 Unix 时间戳。
/// 刻意拒绝 `08:00` 这类「时段」值 —— 它是座位配置里的常见字段，不能当时间用。
fn plausible_server_time(raw: &str) -> bool {
    let text = raw.trim();
    if text.is_empty() {
        return false;
    }
    // ISO 风格 / 带日期的本地风格（必须含数字，避免把 "T"、"TEST" 这类串当成时间）
    if (text.contains('-') || text.contains('T')) && text.chars().any(|c| c.is_ascii_digit()) {
        return true;
    }
    // 纯数字：Unix 秒（10 位）或毫秒（13 位）
    if text.chars().all(|c| c.is_ascii_digit()) {
        return text.len() >= 10;
    }
    // 其它：必须足够长且带时间分隔符，避免把 "08:00" 当成时间
    text.len() >= 16 && text.contains(':')
}

/// 从响应 `data` 里找服务端时间（候选字段 + 形态校验）
fn response_server_now(data: &Value) -> Option<String> {
    SERVER_TIME_KEYS.iter().find_map(|key| {
        value_string(data, &[key]).filter(|candidate| plausible_server_time(candidate))
    })
}

// ── HTTP 层 ──

/// GET 并返回 JSON（本模块全部接口均为 GET）
async fn get_json(
    client: &HbutClient,
    path: &str,
    params: &BTreeMap<String, String>,
) -> Result<Value, LibraryReserveError> {
    let mut url = format!("{RESERVE_API_BASE}{path}");
    let query = encode_form(params);
    if !query.is_empty() {
        url.push('?');
        url.push_str(&query);
    }
    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!("GET {path} 参数数={}", params.len()),
    );
    let resp = client
        .client
        .get(&url)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(REFERER, SEAT_REFERER)
        .header("X-Requested-With", "XMLHttpRequest")
        .timeout(API_TIMEOUT)
        .send()
        .await
        .map_err(|e| classify_transport_error(&e))?;
    read_api_response(resp, path).await
}

// ── 请求体构造（与实测契约逐字段对齐） ──

/// `seatengine/index`：实测仅 `seatId` + `seatIdEnc`
fn index_params(ctx: &SeatContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("seatId".into(), ctx.seat_id.clone());
    if let Some(enc) = &ctx.seat_id_enc {
        p.insert("seatIdEnc".into(), enc.clone());
    }
    p
}

/// `seatengine/identity/verify`：实测 `mappId` + `seatId` + `seatIdEnc`
fn identity_verify_params(ctx: &SeatContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("mappId".into(), ctx.mapp_id.clone());
    p.insert("seatId".into(), ctx.seat_id.clone());
    if let Some(enc) = &ctx.seat_id_enc {
        p.insert("seatIdEnc".into(), enc.clone());
    }
    p
}

/// `seat/entrance/config`：实测固定 `appType=2` + `appId=<seatId>`
fn entrance_config_params(ctx: &SeatContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("appType".into(), ENTRANCE_APP_TYPE.to_string());
    p.insert("appId".into(), ctx.seat_id.clone());
    p
}

// ── 响应模型 ──

/// 每日开放时段（best-effort 归一化）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DayTimeRange {
    /// 星期中文名（周一…周日）
    pub day: String,
    /// 开始时间（HH:mm）
    pub start: Option<String>,
    /// 结束时间（HH:mm）
    pub end: Option<String>,
}

/// 每日开放时段配置（`commonTimeConfig`）
///
/// TODO(#1054)：勘察样本只给出 `{"monStartTime":"08:00","monEndTime":"22:00",...}` 形态，
/// 完整键名（含周末、节假日例外等）**未全量实测**；`days` 为按 `{前缀}StartTime/EndTime`
/// 归一化的 best-effort 结果，`raw` 原样保留供前端兜底渲染。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommonTimeConfig {
    /// 归一化后的每日时段（可能为空）
    pub days: Vec<DayTimeRange>,
    /// 原始 `commonTimeConfig`
    pub raw: Value,
}

impl CommonTimeConfig {
    fn from_value(value: &Value) -> Self {
        let mut days: Vec<DayTimeRange> = Vec::new();
        for (prefix, label) in COMMON_TIME_DAY_PREFIXES {
            let start_key = format!("{prefix}StartTime");
            let end_key = format!("{prefix}EndTime");
            let start = value_string(value, &[start_key.as_str()]);
            let end = value_string(value, &[end_key.as_str()]);
            if start.is_some() || end.is_some() {
                days.push(DayTimeRange {
                    day: label.to_string(),
                    start,
                    end,
                });
            }
        }
        // 兜底：不带星期前缀的统一时段（如 startTime / endTime）
        if days.is_empty() {
            let start = value_string(value, &["startTime"]);
            let end = value_string(value, &["endTime"]);
            if start.is_some() || end.is_some() {
                days.push(DayTimeRange {
                    day: "每日".to_string(),
                    start,
                    end,
                });
            }
        }
        Self {
            days,
            raw: value.clone(),
        }
    }
}

/// 座位预约核心配置（`data.seatConfig`，实测 107 字段）。
///
/// 下列字段均为 issue #1054 实测表给出的**确定字段**；其余 90 余个字段不逐个建模，
/// 统一由 `raw` 原样透传（避免「猜字段名」）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatConfigView {
    /// 座位配置 ID（实测 3597）
    pub seat_id: Option<i64>,
    /// 部门 ID（实测 25285）
    pub dept_id: Option<i64>,
    /// 配置名（实测「座位预约」）
    pub name: Option<String>,
    /// 应用类型（实测 0）
    pub app_type: Option<i64>,
    /// 可提前预约天数（实测 1）
    pub reserve_before_day: Option<i64>,
    /// 放号时间 `HH:mm`（实测 `08:00`，即每天 08:00 放次日号）
    pub reserve_before_time: Option<String>,
    /// 单次预约时长（实测 4，单位为**小时**）
    pub reserve_duration: Option<i64>,
    /// 同时可持有的预约数上限（实测 1）
    pub reserve_num_limit: Option<i64>,
    /// 时间粒度（实测 60，单位分钟）
    pub time_unit: Option<i64>,
    /// 违约次数阈值（实测 3）
    pub violate_times: Option<i64>,
    /// 违约统计窗口（实测 7，单位天）
    pub violation_limit_day: Option<i64>,
    /// 违约停用时长（实测 3，单位天）
    pub violation_limit_duration: Option<i64>,
    /// 监督规则：人数（实测 2）
    pub supervise_num: Option<i64>,
    /// 监督规则：时长（实测 10）
    pub supervise_duration: Option<i64>,
    /// 规则名称（实测「试运规则说明」）
    pub notice_name: Option<String>,
    /// 规则原文（HTML，实测含签到/暂离/违约条款）
    pub notice_content: Option<String>,
    /// 签到能力开关（实测 `true`：只能走 API 签到，页面无按钮）
    pub only_supports_api_sign_in: Option<bool>,
    /// 每日开放时段（实测 08:00–22:00）
    pub common_time_config: Option<CommonTimeConfig>,
    /// 原始 `seatConfig`（其余 90 余字段原样保留）
    pub raw: Value,
}

impl SeatConfigView {
    fn from_value(v: &Value) -> Self {
        let common_time_config = v
            .get("commonTimeConfig")
            .filter(|c| !c.is_null())
            .map(CommonTimeConfig::from_value);
        Self {
            seat_id: value_i64(v, &["id", "seatId"]),
            dept_id: value_i64(v, &["deptId"]),
            name: value_string(v, &["name", "seatName"]),
            app_type: value_i64(v, &["appType"]),
            reserve_before_day: value_i64(v, &["reserveBeforeDay"]),
            reserve_before_time: value_string(v, &["reserveBeforeTime"]),
            reserve_duration: value_i64(v, &["reserveDuration"]),
            reserve_num_limit: value_i64(v, &["reserveNumLimit"]),
            time_unit: value_i64(v, &["timeUnit"]),
            violate_times: value_i64(v, &["violateTimes"]),
            violation_limit_day: value_i64(v, &["violationLimitDay"]),
            violation_limit_duration: value_i64(v, &["violationLimitDuration"]),
            supervise_num: value_i64(v, &["superviseNum"]),
            supervise_duration: value_i64(v, &["superviseDuration"]),
            notice_name: value_string(v, &["noticeName"]),
            notice_content: value_string(v, &["noticeContent"]),
            only_supports_api_sign_in: value_bool(v, &["onlySupportsApiSignIn"]),
            common_time_config,
            raw: v.clone(),
        }
    }
}

/// 单条座位预约记录（`curReserves` / `nearReserves` 的元素）。
///
/// TODO(#1054)：勘察只确认了 `data.curReserves` / `data.nearReserves` 两个数组**存在**
/// （实测样本均为空数组），元素字段名**未实测**。此处按常见命名做 best-effort 提取，
/// 并保留 `raw`；**不得**据此推断写接口字段名。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatReservation {
    /// 预约记录 ID
    pub id: Option<i64>,
    /// 座位号
    pub seat_no: Option<String>,
    /// 房间 / 区域名
    pub room_name: Option<String>,
    /// 预约日期
    pub date: Option<String>,
    /// 开始时间
    pub start_time: Option<String>,
    /// 结束时间
    pub end_time: Option<String>,
    /// 状态码
    pub status: Option<i64>,
    /// 状态文案
    pub status_name: Option<String>,
    /// 原始条目
    pub raw: Value,
}

impl SeatReservation {
    fn from_value(v: &Value) -> Self {
        Self {
            id: value_i64(v, &["id", "reserveId", "resId", "recordId"]),
            seat_no: value_string(v, &["seatNo", "seatNum", "seatCode", "seatName"]),
            room_name: value_string(
                v,
                &[
                    "roomName",
                    "seatRoomName",
                    "areaName",
                    "deptName",
                    "placeName",
                ],
            ),
            date: value_string(v, &["reserveDate", "date", "reserveDay", "day"]),
            start_time: value_string(v, &["startTime", "reserveStartTime", "beginTime"]),
            end_time: value_string(v, &["endTime", "reserveEndTime", "finishTime"]),
            status: value_i64(v, &["status", "reserveStatus", "state"]),
            status_name: value_string(v, &["statusName", "reserveStatusName", "statusText"]),
            raw: v.clone(),
        }
    }
}

/// 座位预约总览（`seatengine/index` 响应）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatIndexView {
    /// 核心配置
    pub config: SeatConfigView,
    /// 当前预约（实测 `data.curReserves`）
    pub current_reservations: Vec<SeatReservation>,
    /// 最近预约（实测 `data.nearReserves`）
    pub recent_reservations: Vec<SeatReservation>,
    /// 服务端当前时间（**前端必须以此判断开放时段，本地时间不可信**）
    pub server_now: Option<String>,
    /// `server_now` 的来源：`response`（响应字段）/ `page`（页面注入的 `serverNow`）
    pub server_now_source: Option<&'static str>,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatIndexView {
    fn from_data(data: &Value, ctx: &SeatContext) -> Self {
        let seat_config = data.get("seatConfig").cloned().unwrap_or(Value::Null);
        // 响应里的服务端时间比页面注入值更新，优先采用；两者都没有则留空
        let (server_now, server_now_source) = match response_server_now(data) {
            Some(value) => (Some(value), Some("response")),
            None => (
                ctx.page_server_now.clone(),
                ctx.page_server_now.as_ref().map(|_| "page"),
            ),
        };
        Self {
            config: SeatConfigView::from_value(&seat_config),
            current_reservations: reservations_of(data, "curReserves"),
            recent_reservations: reservations_of(data, "nearReserves"),
            server_now,
            server_now_source,
            raw: data.clone(),
        }
    }
}

/// 我的座位预约（当前 + 最近）。
///
/// ⚠️ 契约里**没有**独立的「我的预约」端点：当前 / 最近预约与核心配置同源于
/// `seatengine/index` 的 `data.curReserves` / `data.nearReserves`（勘察实测样本）。
/// 因此本视图与 [`fetch_seat_index`] 打的是同一个接口，只是返回切片不同，
/// 便于前端「我的预约」页单独调用。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatMyReservations {
    /// 当前预约
    pub current: Vec<SeatReservation>,
    /// 最近预约
    pub recent: Vec<SeatReservation>,
    /// 服务端当前时间（原样透传）
    pub server_now: Option<String>,
    /// `server_now` 的来源（`response` / `page`）
    pub server_now_source: Option<&'static str>,
    /// 原始响应 `data`
    pub raw: Value,
}

/// 入口能力开关（`seat/entrance/config`，实测样本五字段）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatEntranceConfig {
    /// 签到只能走接口（实测 `true`；页面无签到按钮）
    pub only_supports_api_sign_in: Option<bool>,
    /// 默认预约（实测 `false`）
    pub default_reserve: Option<bool>,
    /// 现场 / 实时预约（实测 `true`）
    pub live_reserve: Option<bool>,
    /// 最近预约（实测 `true`）
    pub recently_reserve: Option<bool>,
    /// 再次预约（实测 `true`）
    pub again_reserve: Option<bool>,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatEntranceConfig {
    fn from_value(v: &Value) -> Self {
        Self {
            only_supports_api_sign_in: value_bool(v, &["onlySupportsApiSignIn"]),
            default_reserve: value_bool(v, &["defaultReserve"]),
            live_reserve: value_bool(v, &["liveReserve"]),
            recently_reserve: value_bool(v, &["recentlyReserve"]),
            again_reserve: value_bool(v, &["againReserve"]),
            raw: v.clone(),
        }
    }
}

/// 身份校验结果（`seatengine/identity/verify`）
///
/// TODO(#1054)：该接口的响应结构**未实测**（勘察只记录了请求形态）。
/// 这里只做 best-effort 的「是否通过」判断，`raw` 原样保留。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatIdentityVerify {
    /// best-effort：是否通过身份校验（字段名未实测）
    pub verified: Option<bool>,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatIdentityVerify {
    fn from_value(v: &Value) -> Self {
        Self {
            verified: value_bool(
                v,
                &[
                    "verified",
                    "isVerified",
                    "verifyResult",
                    "pass",
                    "isPass",
                    "result",
                ],
            ),
            raw: v.clone(),
        }
    }
}

/// 从响应 `data` 中按固定键取预约数组（缺失 / 非数组 → 空列表）
fn reservations_of(data: &Value, key: &str) -> Vec<SeatReservation> {
    data.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(SeatReservation::from_value).collect())
        .unwrap_or_default()
}

// ── 业务接口：只读查询 ──

/// 若本次未能取得 `seatIdEnc`，在错误的**诊断字段**里标注（便于定位「接口莫名失败」）。
///
/// 只补充 `detail` 诊断，**不改变** `kind` 与面向用户的 `message`（避免给出误导性提示）。
fn note_missing_seat_id_enc(err: LibraryReserveError, ctx: &SeatContext) -> LibraryReserveError {
    if ctx.seat_id_enc.is_some() {
        return err;
    }
    const NOTE: &str =
        "本次未取得 seatIdEnc（入口链路与页面均未提供），该参数疑似必需；若持续失败请重新登录后重试";
    let mut err = err;
    err.detail = Some(match err.detail.take() {
        Some(existing) => format!("{existing} | {NOTE}"),
        None => NOTE.to_string(),
    });
    err
}

/// GET + 统一取 `data`（两个业务模块共用的失败分类见 [`api_data`]）。
///
/// `context` 用于拼装失败提示语（如「获取座位预约配置失败：…」）。
async fn fetch_data(
    client: &HbutClient,
    ctx: &SeatContext,
    path: &str,
    params: &BTreeMap<String, String>,
    context: &str,
) -> Result<Value, LibraryReserveError> {
    let value = match get_json(client, path, params).await {
        Ok(value) => value,
        Err(err) => return Err(note_missing_seat_id_enc(err, ctx)),
    };
    match api_data(&value, context) {
        Ok(data) => Ok(data),
        Err(err) => Err(note_missing_seat_id_enc(err, ctx)),
    }
}

/// 座位预约总览：核心配置 + 当前 / 最近预约 + 服务端时间（核心接口）。
pub(crate) async fn fetch_seat_index(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatIndexView, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = fetch_data(
        client,
        &ctx,
        ENDPOINT_SEAT_INDEX,
        &index_params(&ctx),
        "获取座位预约配置",
    )
    .await?;
    Ok(SeatIndexView::from_data(&data, &ctx))
}

/// 我的座位预约（当前 + 最近）。与 [`fetch_seat_index`] 同源，见 [`SeatMyReservations`]。
pub(crate) async fn fetch_my_reservations(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatMyReservations, LibraryReserveError> {
    let view = fetch_seat_index(client, app, force).await?;
    Ok(SeatMyReservations {
        current: view.current_reservations,
        recent: view.recent_reservations,
        server_now: view.server_now,
        server_now_source: view.server_now_source,
        raw: view.raw,
    })
}

/// 入口能力开关（签到方式 / 各类预约入口是否可用）
pub(crate) async fn fetch_entrance_config(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatEntranceConfig, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = fetch_data(
        client,
        &ctx,
        ENDPOINT_ENTRANCE_CONFIG,
        &entrance_config_params(&ctx),
        "获取座位预约入口配置",
    )
    .await?;
    Ok(SeatEntranceConfig::from_value(&data))
}

/// 身份校验（`mappId` + `seatId` + `seatIdEnc`）
pub(crate) async fn fetch_identity_verify(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatIdentityVerify, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = fetch_data(
        client,
        &ctx,
        ENDPOINT_IDENTITY_VERIFY,
        &identity_verify_params(&ctx),
        "座位预约身份校验",
    )
    .await?;
    Ok(SeatIdentityVerify::from_value(&data))
}

/// 全量文案（`seat/i18n`）。
///
/// TODO(#1054)：文案的键空间**未实测**（勘察只确认「含全部业务提示语」），
/// 因此不做结构化建模，直接原样返回 `data`，由前端按需取用。
pub(crate) async fn fetch_i18n(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<Value, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = fetch_data(
        client,
        &ctx,
        ENDPOINT_I18N,
        &BTreeMap::new(),
        "获取座位预约文案",
    )
    .await?;
    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!("座位预约文案已获取 seatId={}", ctx.seat_id),
    );
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::library_reserve::{
        LibraryReserveCredentials, ERR_INVALID_APP, ERR_UNEXPECTED_RESPONSE,
    };

    /// 构造一个最小可用的入口解析结果（仅测试用）
    fn make_entry(
        app: LibraryApp,
        seat_id_enc: Option<&str>,
        seat_id: Option<&str>,
    ) -> LibraryAppEntry {
        let (business_key, business_value) = app.business_id();
        LibraryAppEntry {
            app: app.key().to_string(),
            app_name: app.name().to_string(),
            m_app_id: app.m_app_id().to_string(),
            entry_url: "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597"
                .to_string(),
            system_base: "https://reserve.chaoxing.com".to_string(),
            system_path: app.system_path().to_string(),
            api_base: RESERVE_API_BASE.to_string(),
            business_key: business_key.to_string(),
            business_value: business_value.to_string(),
            credentials: LibraryReserveCredentials {
                seat_id_enc: seat_id_enc.map(str::to_string),
                seat_id: seat_id.map(str::to_string),
                ..Default::default()
            },
            params: BTreeMap::new(),
            contract_match: true,
            redirect_chain: Vec::new(),
            resolved_at_ms: 0,
            hint: String::new(),
        }
    }

    fn seat_context(seat_id_enc: Option<&str>) -> SeatContext {
        SeatContext::from_entry(
            LibraryApp::Seat,
            &make_entry(LibraryApp::Seat, seat_id_enc, None),
        )
        .expect("可构造")
    }

    // ── 上下文与保护 ──

    #[test]
    fn context_extracts_credentials_and_rejects_other_apps() {
        let ctx = seat_context(Some("b146028eafa4eea9"));
        assert_eq!(ctx.seat_id, "3597");
        assert_eq!(ctx.seat_id_enc.as_deref(), Some("b146028eafa4eea9"));
        assert_eq!(ctx.mapp_id, "19248837");

        // 入口链路带上 seatId 时以实时值为准
        let entry = make_entry(LibraryApp::Seat, None, Some(" 3597 "));
        let ctx = SeatContext::from_entry(LibraryApp::Seat, &entry).expect("可构造");
        assert_eq!(ctx.seat_id, "3597");

        // 静音仓 / 研讨室不属于本模块（seatengine）
        for app in [LibraryApp::QuietRoom, LibraryApp::SeminarRoom] {
            let entry = make_entry(app, Some("E"), None);
            let err = SeatContext::from_entry(app, &entry).expect_err("应拒绝非座位预约");
            assert_eq!(err.kind, ERR_INVALID_APP);
        }
    }

    #[test]
    fn context_keeps_seat_id_enc_optional() {
        // seatIdEnc 缺失不阻断：仍可构造，只是不带该参数
        let ctx = seat_context(None);
        assert!(ctx.seat_id_enc.is_none());
        assert!(!index_params(&ctx).contains_key("seatIdEnc"));
        assert_eq!(ctx.seat_id, "3597");
    }

    #[test]
    fn missing_seat_id_enc_is_noted_in_diagnostics_only() {
        let ctx = seat_context(None);

        // 缺失 seatIdEnc：补充诊断，但**不改变** kind 与用户可见 message
        let err = note_missing_seat_id_enc(
            LibraryReserveError::business("business_rejected", "获取座位预约配置失败：参数错误"),
            &ctx,
        );
        assert_eq!(err.kind, "business_rejected");
        assert!(err.message.contains("参数错误"));
        assert!(
            !err.message.contains("seatIdEnc"),
            "用户提示不应被诊断信息污染：{}",
            err.message
        );
        assert!(err
            .detail
            .as_deref()
            .unwrap_or_default()
            .contains("seatIdEnc"));

        // 已有 detail（如跳转链）时追加而非覆盖
        let err = note_missing_seat_id_enc(
            LibraryReserveError::unexpected("x", &["a".into(), "b".into()]),
            &ctx,
        );
        let detail = err.detail.unwrap_or_default();
        assert!(detail.starts_with("a -> b"), "原诊断不能被丢弃：{detail}");
        assert!(detail.contains("seatIdEnc"));

        // 已拿到 seatIdEnc 时不做任何附加
        let err = note_missing_seat_id_enc(
            LibraryReserveError::business("business_rejected", "x"),
            &seat_context(Some("ENC")),
        );
        assert!(err.detail.is_none());
    }

    // ── 请求体构造（与实测契约逐字段对齐） ──

    #[test]
    fn index_params_match_contract() {
        let ctx = seat_context(Some("b146028eafa4eea9"));
        let p = index_params(&ctx);
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(
            p.get("seatIdEnc").map(String::as_str),
            Some("b146028eafa4eea9")
        );
        assert_eq!(p.len(), 2, "index 接口不应多带参数：{p:?}");
        assert!(!p.contains_key("fidEnc"), "实测契约未携带 fidEnc");
    }

    #[test]
    fn identity_verify_params_match_contract() {
        let ctx = seat_context(Some("ENC"));
        let p = identity_verify_params(&ctx);
        assert_eq!(p.get("mappId").map(String::as_str), Some("19248837"));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.get("seatIdEnc").map(String::as_str), Some("ENC"));
        assert_eq!(p.len(), 3);

        // 缺 seatIdEnc 时只带两个参数
        let p = identity_verify_params(&seat_context(None));
        assert_eq!(p.len(), 2);
        assert!(!p.contains_key("seatIdEnc"));
    }

    #[test]
    fn entrance_config_params_match_contract() {
        let ctx = seat_context(None);
        let p = entrance_config_params(&ctx);
        // 实测：appType=2&appId=3597
        assert_eq!(p.get("appType").map(String::as_str), Some("2"));
        assert_eq!(p.get("appId").map(String::as_str), Some("3597"));
        assert_eq!(p.len(), 2, "入口配置接口不应多带参数：{p:?}");
    }

    #[test]
    fn endpoints_match_recon_contract() {
        // 防止重构时误改路径（契约文档 01-api-contract.md）
        assert_eq!(ENDPOINT_I18N, "seat/i18n");
        assert_eq!(ENDPOINT_ENTRANCE_CONFIG, "seat/entrance/config");
        assert_eq!(ENDPOINT_SEAT_INDEX, "seatengine/index");
        assert_eq!(ENDPOINT_IDENTITY_VERIFY, "seatengine/identity/verify");
        assert_eq!(ENTRANCE_APP_TYPE, "2");
        // 基址以 / 结尾，路径不得以 / 开头（否则拼接出错）
        for p in [
            ENDPOINT_I18N,
            ENDPOINT_ENTRANCE_CONFIG,
            ENDPOINT_SEAT_INDEX,
            ENDPOINT_IDENTITY_VERIFY,
        ] {
            assert!(!p.starts_with('/'), "路径不应以 / 开头：{p}");
        }
        assert!(RESERVE_API_BASE.ends_with('/'));
        // 座位预约全部为 GET，不得引入 POST 端点
        assert!(!SEAT_REFERER.ends_with("reservepc/index"));
    }

    // ── 页面注入参数提取 ──

    #[test]
    fn extract_page_value_handles_js_json_and_query() {
        // 勘察原文形态：serverNow = new Date('...')
        let html = "serverNow = new Date('2026-10-15T23:31:03.073+08:00'), \
                    currentServerTime = seatBaseUtils.createServerClock(serverNow);";
        assert_eq!(
            extract_page_value(html, "serverNow").as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );

        // 直接赋值（单 / 双引号）
        assert_eq!(
            extract_page_value("var seatIdEnc = \"b146028eafa4eea9\";", "seatIdEnc").as_deref(),
            Some("b146028eafa4eea9")
        );
        assert_eq!(
            extract_page_value("seatIdEnc = 'b146028eafa4eea9'", "seatIdEnc").as_deref(),
            Some("b146028eafa4eea9")
        );

        // JSON 字段形态
        assert_eq!(
            extract_page_value(r#"{"seatIdEnc":"abc123","other":"x"}"#, "seatIdEnc").as_deref(),
            Some("abc123")
        );

        // URL query 里的裸值
        assert_eq!(
            extract_page_value(
                "url + '/front/apps/seatengine/index?seatId=3597&seatIdEnc=deadbeef'",
                "seatIdEnc"
            )
            .as_deref(),
            Some("deadbeef")
        );

        // 键不存在 / 值为空 → None（不得把相邻的无关引号串当值）
        assert_eq!(extract_page_value("<html></html>", "seatIdEnc"), None);
        assert_eq!(extract_page_value("seatIdEnc = ''", "seatIdEnc"), None);
        assert_eq!(
            extract_page_value("seatIdEnc = null, other: \"bar\"", "seatIdEnc"),
            None
        );
    }

    #[test]
    fn plausible_server_time_rejects_slot_strings() {
        assert!(plausible_server_time("2026-10-15T23:31:03.073+08:00"));
        assert!(plausible_server_time("1760542263000"));
        assert!(plausible_server_time("1760542263"));
        assert!(plausible_server_time("2026/10/15 23:31"));
        // 时段值不能被当成时间
        assert!(!plausible_server_time("08:00"));
        assert!(!plausible_server_time("22:00"));
        assert!(!plausible_server_time(""));
        assert!(!plausible_server_time("123"));
    }

    // ── 响应解析 ──

    /// issue #1054 实测表给出的关键配置样本
    fn recon_seat_config() -> Value {
        serde_json::json!({
            "id": 3597, "deptId": 25285, "name": "座位预约", "appType": 0,
            "reserveBeforeDay": 1, "reserveBeforeTime": "08:00",
            "reserveDuration": 4, "reserveNumLimit": 1,
            "violateTimes": 3, "violationLimitDay": 7, "violationLimitDuration": 3,
            "superviseNum": 2, "superviseDuration": 10, "timeUnit": 60,
            "onlySupportsApiSignIn": true,
            "commonTimeConfig": {
                "monStartTime": "08:00", "monEndTime": "22:00",
                "tueStartTime": "08:00", "tueEndTime": "22:00"
            },
            "noticeName": "试运规则说明",
            "noticeContent": "<p>1. 遵守图书馆座位使用规则……</p>"
        })
    }

    #[test]
    fn seat_config_parses_recon_fields() {
        let cfg = SeatConfigView::from_value(&recon_seat_config());
        assert_eq!(cfg.seat_id, Some(3597));
        assert_eq!(cfg.dept_id, Some(25285));
        assert_eq!(cfg.name.as_deref(), Some("座位预约"));
        assert_eq!(cfg.app_type, Some(0));
        // 放号规则
        assert_eq!(cfg.reserve_before_day, Some(1));
        assert_eq!(cfg.reserve_before_time.as_deref(), Some("08:00"));
        // 时长与限额
        assert_eq!(cfg.reserve_duration, Some(4));
        assert_eq!(cfg.reserve_num_limit, Some(1));
        assert_eq!(cfg.time_unit, Some(60));
        // 违约规则
        assert_eq!(cfg.violate_times, Some(3));
        assert_eq!(cfg.violation_limit_day, Some(7));
        assert_eq!(cfg.violation_limit_duration, Some(3));
        assert_eq!(cfg.supervise_num, Some(2));
        assert_eq!(cfg.supervise_duration, Some(10));
        // 规则原文
        assert_eq!(cfg.notice_name.as_deref(), Some("试运规则说明"));
        assert!(
            cfg.notice_content
                .as_deref()
                .unwrap_or_default()
                .contains("座位使用规则"),
            "规则原文必须原样透传"
        );
        // 签到能力开关
        assert_eq!(cfg.only_supports_api_sign_in, Some(true));
        // 开放时段
        let time = cfg.common_time_config.expect("应解析开放时段");
        assert_eq!(time.days.len(), 2);
        assert_eq!(time.days[0].day, "周一");
        assert_eq!(time.days[0].start.as_deref(), Some("08:00"));
        assert_eq!(time.days[0].end.as_deref(), Some("22:00"));
        assert_eq!(time.days[1].day, "周二");
        // 未建模字段仍保留在 raw 中
        assert_eq!(
            time.raw.get("monEndTime").and_then(|v| v.as_str()),
            Some("22:00")
        );
        assert_eq!(cfg.raw.get("id").and_then(|v| v.as_i64()), Some(3597));
    }

    #[test]
    fn common_time_config_falls_back_to_plain_keys() {
        let cfg = CommonTimeConfig::from_value(&serde_json::json!({
            "startTime": "08:00", "endTime": "21:00"
        }));
        assert_eq!(cfg.days.len(), 1);
        assert_eq!(cfg.days[0].day, "每日");
        assert_eq!(cfg.days[0].start.as_deref(), Some("08:00"));

        // 空对象 / 非对象 → 不 panic，days 为空
        assert!(CommonTimeConfig::from_value(&serde_json::json!({}))
            .days
            .is_empty());
        assert!(CommonTimeConfig::from_value(&Value::Null).days.is_empty());
    }

    #[test]
    fn seat_index_parses_reservations_and_server_now() {
        let data = serde_json::json!({
            "seatConfig": recon_seat_config(),
            "curReserves": [
                {"id": 1, "seatNo": "A-01", "roomName": "四楼东区",
                 "reserveDate": "2026-10-16", "startTime": "08:00", "endTime": "12:00",
                 "status": 1, "statusName": "已预约"}
            ],
            "nearReserves": [],
            "serverTime": "2026-10-15T23:31:03.073+08:00"
        });
        let view = SeatIndexView::from_data(&data, &seat_context(None));

        assert_eq!(view.current_reservations.len(), 1);
        let r = &view.current_reservations[0];
        assert_eq!(r.id, Some(1));
        assert_eq!(r.seat_no.as_deref(), Some("A-01"));
        assert_eq!(r.room_name.as_deref(), Some("四楼东区"));
        assert_eq!(r.date.as_deref(), Some("2026-10-16"));
        assert_eq!(r.start_time.as_deref(), Some("08:00"));
        assert_eq!(r.status_name.as_deref(), Some("已预约"));
        assert!(view.recent_reservations.is_empty());
        // 服务端时间优先取响应字段
        assert_eq!(
            view.server_now.as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );
        assert_eq!(view.server_now_source, Some("response"));
        // 原始 data 原样保留（前端可兜底取未建模字段）
        assert!(view.raw.get("seatConfig").is_some());
    }

    #[test]
    fn seat_index_falls_back_to_page_server_now() {
        let mut ctx = seat_context(None);
        ctx.page_server_now = Some("2026-10-15T23:31:03.073+08:00".to_string());
        // 响应里没有可用的时间字段（"08:00" 是时段，必须被拒）
        let data = serde_json::json!({
            "seatConfig": {"id": 3597, "timeUnit": 60},
            "curReserves": [],
            "nearReserves": [],
            "currentTime": "08:00"
        });
        let view = SeatIndexView::from_data(&data, &ctx);
        assert_eq!(
            view.server_now.as_deref(),
            Some("2026-10-15T23:31:03.073+08:00")
        );
        assert_eq!(view.server_now_source, Some("page"));

        // 两处都没有 → 留空，绝不回退到本地时间
        let view =
            SeatIndexView::from_data(&serde_json::json!({"seatConfig": {}}), &seat_context(None));
        assert!(view.server_now.is_none());
        assert!(view.server_now_source.is_none());
    }

    #[test]
    fn seat_index_tolerates_missing_config_and_odd_shapes() {
        // 缺 seatConfig：不报错，raw 保留，配置字段全为 None
        let view = SeatIndexView::from_data(
            &serde_json::json!({"curReserves": "not-an-array"}),
            &seat_context(None),
        );
        assert!(view.config.seat_id.is_none());
        assert!(view.config.common_time_config.is_none());
        assert!(view.current_reservations.is_empty());
        assert!(view.recent_reservations.is_empty());

        // 数字字符串 / 布尔字符串也要能解析
        let cfg = SeatConfigView::from_value(&serde_json::json!({
            "id": "3597", "reserveBeforeDay": "1", "onlySupportsApiSignIn": "true"
        }));
        assert_eq!(cfg.seat_id, Some(3597));
        assert_eq!(cfg.reserve_before_day, Some(1));
        assert_eq!(cfg.only_supports_api_sign_in, Some(true));
    }

    #[test]
    fn entrance_config_parses_recon_sample() {
        // 勘察实测样本
        let data = serde_json::json!({
            "onlySupportsApiSignIn": true,
            "defaultReserve": false,
            "liveReserve": true,
            "recentlyReserve": true,
            "againReserve": true
        });
        let cfg = SeatEntranceConfig::from_value(&data);
        assert_eq!(cfg.only_supports_api_sign_in, Some(true));
        assert_eq!(cfg.default_reserve, Some(false));
        assert_eq!(cfg.live_reserve, Some(true));
        assert_eq!(cfg.recently_reserve, Some(true));
        assert_eq!(cfg.again_reserve, Some(true));
    }

    #[test]
    fn identity_verify_is_best_effort() {
        // 结构未实测：能识别常见「通过」字段
        assert_eq!(
            SeatIdentityVerify::from_value(&serde_json::json!({"verified": true})).verified,
            Some(true)
        );
        assert_eq!(
            SeatIdentityVerify::from_value(&serde_json::json!({"isPass": 1})).verified,
            Some(true)
        );
        // 未知结构不 panic，raw 保留
        let v = SeatIdentityVerify::from_value(&serde_json::json!({"weird": "x"}));
        assert!(v.verified.is_none());
        assert_eq!(v.raw.get("weird").and_then(|x| x.as_str()), Some("x"));
    }

    #[test]
    fn seat_reservation_parses_best_effort_fields() {
        let r = SeatReservation::from_value(&serde_json::json!({
            "recordId": 9, "seatCode": "B-12", "placeName": "四楼西区",
            "reserveDay": "2026-10-17", "reserveStartTime": "13:00",
            "reserveEndTime": "17:00", "reserveStatus": 2, "statusText": "已完成"
        }));
        assert_eq!(r.id, Some(9));
        assert_eq!(r.seat_no.as_deref(), Some("B-12"));
        assert_eq!(r.room_name.as_deref(), Some("四楼西区"));
        assert_eq!(r.date.as_deref(), Some("2026-10-17"));
        assert_eq!(r.start_time.as_deref(), Some("13:00"));
        assert_eq!(r.end_time.as_deref(), Some("17:00"));
        assert_eq!(r.status, Some(2));
        assert_eq!(r.status_name.as_deref(), Some("已完成"));
    }

    #[test]
    fn api_data_keeps_error_kinds_distinguishable() {
        // api_data 复用基础模块的分类：登录态失效 → 可重新登录
        let value = serde_json::json!({"success": false, "msg": "未登录或登录已失效"});
        let err = api_data(&value, "获取座位预约配置").expect_err("应失败");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_CHAOXING_NOT_LOGGED_IN
        );
        assert!(err.can_relogin);

        // 其它业务失败 → business_rejected，且重新登录无意义
        let value = serde_json::json!({"success": false, "msg": "未查询到座位信息"});
        let err = api_data(&value, "获取座位预约配置").expect_err("应失败");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_BUSINESS_REJECTED
        );
        assert!(!err.can_relogin);

        // 成功：取 data
        let value = serde_json::json!({"success": true, "data": {"seatConfig": {"id": 3597}}});
        let data = api_data(&value, "获取座位预约配置").expect("成功");
        assert_eq!(
            data.get("seatConfig")
                .and_then(|v| v.get("id"))
                .and_then(|v| v.as_i64()),
            Some(3597)
        );
    }

    #[test]
    fn ensure_seat_app_accepts_only_seat() {
        assert!(ensure_seat_app(LibraryApp::Seat).is_ok());
        assert_eq!(
            ensure_seat_app(LibraryApp::QuietRoom)
                .expect_err("应拒绝")
                .kind,
            ERR_INVALID_APP
        );
        // 与 #1053 的 ensure_pc_app 对称：错误类型可区分
        let err =
            SeatContext::from_entry(LibraryApp::Seat, &make_entry(LibraryApp::Seat, None, None))
                .err();
        assert!(err.is_none(), "座位预约自身必须可用");
        assert_ne!(
            ERR_INVALID_APP, ERR_UNEXPECTED_RESPONSE,
            "两种错误必须可区分"
        );
    }
}
