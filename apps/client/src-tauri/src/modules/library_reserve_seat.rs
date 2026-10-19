//! 图书馆预约 · 座位预约（`seatengine` 接口体系）（#1054）
//!
//! 本模块在 [`crate::modules::library_reserve`]（#1052 地基）之上实现座位预约的
//! **只读查询**能力；静音仓 / 研讨室（PC 版 `reservepc`）在
//! [`crate::modules::library_reserve_pc`]（#1053）中，两者平行、互不依赖。
//!
//! ## 接口契约
//!
//! 第一轮勘察（`data/library-reserve-recon/01-api-contract.md`）确认了四个 **GET** 端点：
//!
//! ```text
//! GET seat/i18n                                                    全量文案
//! GET seat/entrance/config?appType=2&appId=3597                    入口能力开关
//! GET seatengine/index?seatId=3597&seatIdEnc=<enc>                 核心配置 + 当前/最近预约
//! GET seatengine/identity/verify?mappId=..&seatId=..&seatIdEnc=..  身份校验
//! ```
//!
//! 第二轮勘察（`data/library-reserve-recon/03-seat-availability-and-quick-reserve.md`，实测）
//! 补上了**余量查询 / 找空座位**这一整条链路，全部为 **POST** 表单
//! （页面里 `loadData(url, data)` = `$.post(url, data)`，
//! `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`）：
//!
//! ```text
//! POST seatengine/room/list        {seatId, seatIdEnc}                    房间列表（容量 / 开放时间）
//! POST seatengine/levels           {seatId, type[, firstLevelName[, secondLevelName]]}  区域列表
//! POST seatengine/getstartendtime  {deptIdEnc, seatId}                    当日可选时间范围
//! POST seatengine/getseatinfo      {seatId, deptIdEnc, startTime, endTime, 三级区域名}  按时间找空座位
//! ```
//!
//! ⚠️ 本 issue **只做只读查询**：提交（`seatengine/submit`）需要客户端签名 `enc`
//! 与验证码（`securityVerify=1`），契约尚未打通，因此本模块**不实现、也不猜测**提交形态。
//!
//! ## 三个关键约束
//!
//! 1. **`seatIdEnc` / `deptIdEnc` 不得硬编码**（疑似短时效）：优先取入口链路
//!    （[`crate::modules::library_reserve::resolve_entry`]）的实时解析结果。
//!    勘察显示二者**不在跳转链上**，而是由座位预约页面注入，因此缺失时会再实时抓取一次
//!    页面 HTML 做 best-effort 提取（复用地基模块的
//!    [`crate::modules::library_reserve::fetch_page_injected`]）。
//!    `seatIdEnc` 仍缺失则记告警继续请求（服务端可能由会话推导）；
//!    `deptIdEnc` 缺失时**传空串**（实测空串仍可用），绝不报错。
//! 2. **时间以服务端为准**：页面用服务端注入的 `serverNow` 判断开放时段，本地时间不可信。
//!    本模块把服务端时间**原样透传**给前端（`serverNow`），前端必须以它做开放判断。
//! 3. **`getseatinfo` 是「给我一个可用座位」而非座位图**：返回单条 `matchReserve`
//!    （座位号 + 区域），且该座位会被服务端**临时锁定**（页面随后开始倒计时）。
//!
//! ## 契约完整度（代码中逐处标注）
//!
//! - ✅ **已实测**：GET 四端点的路径与参数；POST 四端点的路径与参数；
//!   `seatConfig` 的核心配置字段（issue #1054 实测表）；`entrance/config` 的五个开关；
//!   `room/list` 的房间字段（`id` / 容量 / 放号 / `gridStyle` / `picSeatMode`）；
//!   `levels` 的 `data.levels[].{first,second,third}LevelName`；
//!   `getstartendtime` 的 `{ymd, commonPauseTimes, startTime, endTime}`；
//!   `getseatinfo` 的 `data.matchReserve` 字段（`seatNum` 为**带前导零的字符串**）。
//! - ❓ **未实测（TODO(#1054)）**：`i18n` 的键空间、`identity/verify` 的响应结构、
//!   预约条目（`curReserves` / `nearReserves` 元素）的字段名、服务端时间在响应里的字段名、
//!   房间 `seatEngineSpecialTime` 的结构、`commonPauseTimes` 的元素结构。
//!   这些一律「宽松解析 + `raw` 原样保留」，**不把推测伪装成已确定**。

use std::collections::BTreeMap;
use std::time::Duration;

use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, ORIGIN, REFERER};
use reqwest::Url;
use serde::Serialize;
use serde_json::Value;

use crate::http_client::HbutClient;
use crate::modules::library_reserve::{
    self, api_data, api_write_result, classify_transport_error, encode_form, non_empty,
    read_api_response, value_bool, value_i64, value_string, LibraryApp, LibraryAppEntry,
    LibraryReserveError, ERR_INVALID_PARAMS, RESERVE_API_BASE,
};

// ── 常量 ──

/// 座位预约页面 Referer（超星会校验来源；实测接口由该页面 AJAX 发起）
const SEAT_REFERER: &str = "https://reserve.chaoxing.com/front/apps/seatengine/index";
/// Origin 头（表单 POST 必需）
const RESERVE_ORIGIN: &str = "https://reserve.chaoxing.com";
/// 实测的 Content-Type（**带 charset**，与契约一致；reqwest 的 `.form()` 不带 charset，故手工组体）
const FORM_CONTENT_TYPE: &str = "application/x-www-form-urlencoded; charset=UTF-8";
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
/// 房间列表（容量 / 开放时间）
const ENDPOINT_ROOM_LIST: &str = "seatengine/room/list";
/// 区域列表（一 / 二 / 三级）
const ENDPOINT_LEVELS: &str = "seatengine/levels";
/// 当日可选时间范围
const ENDPOINT_START_END_TIME: &str = "seatengine/getstartendtime";
/// 按时间找空座位（余量 / 匹配）
const ENDPOINT_GET_SEAT_INFO: &str = "seatengine/getseatinfo";
/// 图片验证码（提交预约需要；与会话绑定，必须用同一会话客户端取）
const ENDPOINT_CAPTCHA: &str = "seat/captcha";
/// 提交座位预约（写操作）
const ENDPOINT_SUBMIT: &str = "seatengine/submit";
/// 快速预约页（`submit_enc` 随机串由该页 HTML 服务端注入）
const SEAT_LIVE_SELECT_PATH: &str = "/front/apps/seatengine/live/select";

/// 预约系统根地址（构造快速预约页 URL 的兜底）
const RESERVE_BASE: &str = "https://reserve.chaoxing.com";

/// `seat/entrance/config` 实测固定参数：`appType=2`
const ENTRANCE_APP_TYPE: &str = "2";

/// 区域层级：一级（返回 `firstLevelName`）
pub(crate) const LEVEL_TYPE_FIRST: i64 = 0;
/// 区域层级：二级（返回 `secondLevelName`，需 `firstLevelName`）
pub(crate) const LEVEL_TYPE_SECOND: i64 = 1;
/// 区域层级：三级（返回 `thirdLevelName`，需 `firstLevelName` + `secondLevelName`）
pub(crate) const LEVEL_TYPE_THIRD: i64 = 2;

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

// ── 页面注入参数（best-effort 实时发现，复用地基模块能力） ──
//
// `seatIdEnc` / `deptIdEnc` / `serverNow` 都不在入口跳转链上，由落地页服务端注入。
// 提取能力已上提到 [`crate::modules::library_reserve::fetch_page_injected`]，
// 本模块只负责调用与降级。

// ── 凭证上下文 ──

/// 一次座位预约调用所需的上下文（**含短时效凭证，禁止缓存**）。
#[derive(Debug, Clone)]
pub(crate) struct SeatContext {
    /// 座位 ID 明文（稳定值 3597）
    seat_id: String,
    /// 座位 ID 加密串（短时效，可能缺失）
    seat_id_enc: Option<String>,
    /// 部门 ID 加密串（短时效，可能缺失；**缺失时按空串发请求**，实测空串仍可用）
    dept_id_enc: Option<String>,
    /// 超星 mAppId（`identity/verify` 需要）
    mapp_id: String,
    /// 页面注入的服务端当前时间（best-effort；响应里若有同义字段则优先用响应值）
    page_server_now: Option<String>,
    /// 入口落地 URL（含短时效凭证；用于构造快速预约页 `live/select` 的地址）
    entry_url: String,
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
            // 入口链路通常不带 deptIdEnc（同样由页面注入）；有则优先用实时值
            dept_id_enc: non_empty(entry.credentials.dept_id_enc.as_deref()),
            mapp_id: app.m_app_id().to_string(),
            page_server_now: None,
            entry_url: entry.entry_url.clone(),
        })
    }

    /// `deptIdEnc` 的请求值：**取不到时返回空串**（实测空串仍可用），绝不因此报错。
    fn dept_id_enc_or_empty(&self) -> String {
        self.dept_id_enc.clone().unwrap_or_default()
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

    // seatIdEnc / deptIdEnc 与页面注入的服务端时间都不在跳转链上，需要实时抓一次页面
    // （复用地基模块能力）
    if ctx.seat_id_enc.is_none() || ctx.dept_id_enc.is_none() || ctx.page_server_now.is_none() {
        match library_reserve::fetch_page_injected(
            client,
            &entry,
            &[
                library_reserve::PAGE_KEY_SEAT_ID_ENC,
                library_reserve::PAGE_KEY_DEPT_ID_ENC,
                library_reserve::PAGE_KEY_SERVER_NOW,
            ],
        )
        .await
        {
            Ok(hints) => {
                if ctx.seat_id_enc.is_none() {
                    ctx.seat_id_enc = hints
                        .get(library_reserve::PAGE_KEY_SEAT_ID_ENC)
                        .map(str::to_string);
                }
                if ctx.dept_id_enc.is_none() {
                    // 页面里若为 `deptIdEnc = ''`，extract_page_value 会返回 None → 仍留空串语义
                    ctx.dept_id_enc = hints
                        .get(library_reserve::PAGE_KEY_DEPT_ID_ENC)
                        .map(str::to_string);
                }
                ctx.page_server_now = hints
                    .get(library_reserve::PAGE_KEY_SERVER_NOW)
                    .map(str::to_string);
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
            "座位预约上下文就绪 seatId={} 有 seatIdEnc={} 有 deptIdEnc={} 有服务端时间={}",
            ctx.seat_id,
            ctx.seat_id_enc.is_some(),
            ctx.dept_id_enc.is_some(),
            ctx.page_server_now.is_some()
        ),
    );
    Ok(ctx)
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

/// POST 表单并返回 JSON。
///
/// 实测（2026-10-16）：余量 / 找空座位这一整条链路页面里都走 `$.post`，
/// `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`（reqwest 的 `.form()`
/// 不带 charset，故手工组体，与 `library_reserve_pc` 的 `post_form` 对齐）。
async fn post_json(
    client: &HbutClient,
    path: &str,
    params: &BTreeMap<String, String>,
) -> Result<Value, LibraryReserveError> {
    let url = format!("{RESERVE_API_BASE}{path}");
    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!("POST {path} 参数数={}", params.len()),
    );
    let resp = client
        .client
        .post(&url)
        .header(CONTENT_TYPE, FORM_CONTENT_TYPE)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(REFERER, SEAT_REFERER)
        .header(ORIGIN, RESERVE_ORIGIN)
        .header("X-Requested-With", "XMLHttpRequest")
        .timeout(API_TIMEOUT)
        .body(encode_form(params))
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

/// `seatengine/room/list`：实测 `seatId` + `seatIdEnc`
fn room_list_params(ctx: &SeatContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("seatId".into(), ctx.seat_id.clone());
    if let Some(enc) = &ctx.seat_id_enc {
        p.insert("seatIdEnc".into(), enc.clone());
    }
    p
}

/// `seatengine/levels`：实测 `seatId` + `type`（+ 上级区域名）。
///
/// - `type=0`（一级）：仅 `seatId` + `type`；
/// - `type=1`（二级）：追加 `firstLevelName`；
/// - `type=2`（三级）：追加 `firstLevelName` + `secondLevelName`。
///
/// 上级区域名为空时**不带该参数**（与页面 `$.post` 的实参一致）。
fn levels_params(
    ctx: &SeatContext,
    level_type: i64,
    first_level_name: Option<&str>,
    second_level_name: Option<&str>,
) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("seatId".into(), ctx.seat_id.clone());
    p.insert("type".into(), level_type.to_string());
    if let Some(name) = non_empty(first_level_name) {
        p.insert("firstLevelName".into(), name);
    }
    if let Some(name) = non_empty(second_level_name) {
        p.insert("secondLevelName".into(), name);
    }
    p
}

/// `seatengine/getstartendtime`：实测 `deptIdEnc` + `seatId`。
///
/// ⚠️ `deptIdEnc` **恒带**（取不到时传空串，实测空串仍可用），与 `seatIdEnc` 的
/// 「缺失即不带」语义不同。
fn time_range_params(ctx: &SeatContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("deptIdEnc".into(), ctx.dept_id_enc_or_empty());
    p.insert("seatId".into(), ctx.seat_id.clone());
    p
}

/// `seatengine/getseatinfo`：实测 `seatId` + `deptIdEnc` + `startTime` + `endTime` + 三级区域名。
///
/// 三个区域名**恒带**（页面实参即为空串），未指定时传空串（= 任意区域）。
fn match_params(
    ctx: &SeatContext,
    start_time: &str,
    end_time: &str,
    first_level_name: Option<&str>,
    second_level_name: Option<&str>,
    third_level_name: Option<&str>,
) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("seatId".into(), ctx.seat_id.clone());
    p.insert("deptIdEnc".into(), ctx.dept_id_enc_or_empty());
    p.insert("startTime".into(), start_time.to_string());
    p.insert("endTime".into(), end_time.to_string());
    p.insert(
        "firstLevelName".into(),
        first_level_name.unwrap_or_default().to_string(),
    );
    p.insert(
        "secondLevelName".into(),
        second_level_name.unwrap_or_default().to_string(),
    );
    p.insert(
        "thirdLevelName".into(),
        third_level_name.unwrap_or_default().to_string(),
    );
    p
}

/// 把 `HH:mm` / `H:mm` 归一化为零填充的 `HH:mm`（与页面 `moment(...).format('HH:mm')` 对齐）；
/// 非法（缺冒号 / 非数字 / 越界）返回 `None`。
fn normalize_hh_mm(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let (hour_text, minute_text) = trimmed.split_once(':')?;
    let hour: u32 = hour_text.trim().parse().ok()?;
    let minute: u32 = minute_text.trim().parse().ok()?;
    if hour > 23 || minute > 59 {
        return None;
    }
    Some(format!("{hour:02}:{minute:02}"))
}

/// 校验并归一化 `YYYY-MM-DD`（trim 后原样返回）；非法返回 `None`。
///
/// 只做形态校验（长度 + 分隔符 + 数字），不校验日历合法性（服务端为准）。
fn normalize_day(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let bytes = trimmed.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit())
    {
        return None;
    }
    Some(trimmed.to_string())
}

/// 从快速预约页 HTML 提取提交随机串 `#submit_enc` 的 `value`。
///
/// 实测形态：`<input type="hidden" id="submit_enc" value="c2e1ec6696a74df188850419513a1261_406591160"/>`。
/// 正则刻意宽松：允许 `id` / `value` 任意顺序、属性间任意空白；取不到返回 `None`（调用方降级为空串）。
fn extract_submit_enc(html: &str) -> Option<String> {
    const ID_FIRST: &str = r#"id\s*=\s*["']submit_enc["'][^>]{0,200}?value\s*=\s*["']([^"']+)["']"#;
    const VALUE_FIRST: &str =
        r#"value\s*=\s*["']([^"']+)["'][^>]{0,200}?id\s*=\s*["']submit_enc["']"#;
    for pattern in [ID_FIRST, VALUE_FIRST] {
        let Ok(re) = regex::Regex::new(pattern) else {
            continue;
        };
        if let Some(cap) = re.captures(html).and_then(|c| c.get(1)) {
            let value = cap.as_str().trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
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

// ── 余量查询 / 找空座位（第二轮勘察，实测） ──

/// 单个房间（`seatengine/room/list` 的 `data` 元素）。
///
/// 实测字段（`data/library-reserve-recon/03-…md`）：
/// `id` / `firstLevelName` / `capacity` / `reserveBeforeDay` / `reserveBeforeTime` /
/// `reserveAfterDay` / `reserveAfterTime` / `gridStyle` / `picSeatMode`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatRoom {
    /// 房间 ID（提交预约时的 `roomId` 来源）
    pub id: Option<i64>,
    /// 一级区域名（实测「四楼D区（有插座）」）
    pub first_level_name: Option<String>,
    /// 二级区域名
    pub second_level_name: Option<String>,
    /// 三级区域名
    pub third_level_name: Option<String>,
    /// 容量（实测 118 / 240）
    pub capacity: Option<i64>,
    /// 可提前预约天数（实测 1）
    pub reserve_before_day: Option<i64>,
    /// 放号时间 `HH:mm`（实测 `08:00`）
    pub reserve_before_time: Option<String>,
    /// 可延后预约天数（实测 -1）
    pub reserve_after_day: Option<i64>,
    /// 延后截止时间 `HH:mm`（实测 `12:00`）
    pub reserve_after_time: Option<String>,
    /// 座位图样式（实测 0 / 1）
    pub grid_style: Option<i64>,
    /// 选座模式（实测 1 / 2）
    pub pic_seat_mode: Option<i64>,
    /// 每日开放时段（由 `seatEngineSpecialTime` best-effort 归一化；识别不了为空）
    pub open_hours: Vec<DayTimeRange>,
    /// 原始房间条目（未建模字段原样保留）
    pub raw: Value,
}

impl SeatRoom {
    fn from_value(v: &Value) -> Self {
        let open_hours = v
            .get("seatEngineSpecialTime")
            .or_else(|| v.get("seatSpecialTime"))
            .filter(|x| !x.is_null())
            .map(open_hours_from_special_time)
            .unwrap_or_default();
        Self {
            id: value_i64(v, &["id", "roomId"]),
            first_level_name: value_string(v, &["firstLevelName"]),
            second_level_name: value_string(v, &["secondLevelName"]),
            third_level_name: value_string(v, &["thirdLevelName"]),
            capacity: value_i64(v, &["capacity"]),
            reserve_before_day: value_i64(v, &["reserveBeforeDay"]),
            reserve_before_time: value_string(v, &["reserveBeforeTime"]),
            reserve_after_day: value_i64(v, &["reserveAfterDay"]),
            reserve_after_time: value_string(v, &["reserveAfterTime"]),
            grid_style: value_i64(v, &["gridStyle"]),
            pic_seat_mode: value_i64(v, &["picSeatMode"]),
            open_hours,
            raw: v.clone(),
        }
    }
}

/// 房间列表（`seatengine/room/list` 响应）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatRooms {
    /// 房间列表（可能为空）
    pub rooms: Vec<SeatRoom>,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatRooms {
    fn from_data(data: &Value) -> Self {
        Self {
            rooms: room_list_of(data),
            raw: data.clone(),
        }
    }
}

/// 从响应 `data` 中宽松取房间数组。
///
/// ⚠️ TODO(#1054)：勘察实测只给出 `totalRow=2` 与房间字段，**未记录数组所在键名**
/// （推测为 `rows`）。故此处按 `rows` / `rooms` / `list` / `records` 依次尝试，
/// 并兼容 `data` 本身即数组的形态。
fn room_list_of(data: &Value) -> Vec<SeatRoom> {
    let items = ["rows", "rooms", "list", "records"]
        .iter()
        .find_map(|key| data.get(*key).and_then(|v| v.as_array()))
        .or_else(|| data.as_array());
    items
        .map(|arr| arr.iter().map(SeatRoom::from_value).collect())
        .unwrap_or_default()
}

/// 把房间的 `seatEngineSpecialTime` 归一化成每日时段（best-effort）。
///
/// ⚠️ 该字段的**真实结构未实测**（勘察只确认房间列表含容量 / 放号 / 开放时间字段）。
/// 这里只做「宽松归一化 + 原样保留 `raw`」：支持「JSON 字符串 / 对象 / 对象数组」三种形态，
/// 复用 [`CommonTimeConfig`] 的 `{星期前缀}StartTime/EndTime` 键位思路；
/// 识别不了就返回空列表，前端仍可从 `room.raw` 兜底渲染。
fn open_hours_from_special_time(value: &Value) -> Vec<DayTimeRange> {
    match value {
        Value::String(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Vec::new();
            }
            serde_json::from_str::<Value>(trimmed)
                .map(|parsed| open_hours_from_special_time(&parsed))
                .unwrap_or_default()
        }
        Value::Array(items) => items
            .iter()
            .flat_map(|item| {
                // 优先「显式 day/start/end」形态；否则回落到星期前缀键位
                let explicit = explicit_day_range(item);
                if let Some(range) = explicit {
                    vec![range]
                } else {
                    CommonTimeConfig::from_value(item).days
                }
            })
            .collect(),
        Value::Object(_) => CommonTimeConfig::from_value(value).days,
        _ => Vec::new(),
    }
}

/// 单条「显式 day/start/end」形态（如 `{"day":"周一","startTime":"08:00","endTime":"22:00"}`）
fn explicit_day_range(item: &Value) -> Option<DayTimeRange> {
    let day = value_string(item, &["day", "week", "weekDay", "dayName"])?;
    let start = value_string(item, &["startTime", "start", "beginTime"]);
    let end = value_string(item, &["endTime", "end", "finishTime"]);
    if start.is_none() && end.is_none() {
        return None;
    }
    Some(DayTimeRange { day, start, end })
}

/// 区域列表（`seatengine/levels` 响应）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatLevels {
    /// 请求的层级（0 一级 / 1 二级 / 2 三级）
    pub level_type: i64,
    /// 该层级的区域名列表（按请求层级取对应键；可能为空）
    pub levels: Vec<String>,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatLevels {
    fn from_data(data: &Value, level_type: i64) -> Self {
        Self {
            level_type,
            levels: levels_of(data, level_type),
            raw: data.clone(),
        }
    }
}

/// 按请求层级取 `data.levels[]` 里对应的键（宽松：元素可为字符串或对象）。
fn levels_of(data: &Value, level_type: i64) -> Vec<String> {
    let key = match level_type {
        LEVEL_TYPE_SECOND => "secondLevelName",
        LEVEL_TYPE_THIRD => "thirdLevelName",
        _ => "firstLevelName",
    };
    let items = data
        .get("levels")
        .and_then(|v| v.as_array())
        .or_else(|| data.as_array());
    items
        .map(|arr| {
            arr.iter()
                .filter_map(|item| level_name(item, key))
                .collect()
        })
        .unwrap_or_default()
}

/// 取单条层级名：元素可能是字符串本身，也可能是对象（含 `key` 字段）。
fn level_name(item: &Value, key: &str) -> Option<String> {
    match item {
        Value::String(s) => non_empty(Some(s.as_str())),
        _ => value_string(item, &[key]),
    }
}

/// 当日可选时间范围（`seatengine/getstartendtime` 响应）。
///
/// 实测：`{"ymd":"2026-10-16","commonPauseTimes":[],"startTime":0,"endTime":50400000}`。
/// `startTime` / `endTime` 为**当日毫秒偏移**（0 → 50400000 = 14:00），
/// 页面用 `seatConfig.timeUnit`（实测 60 分钟）切成可选时间片。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatTimeRange {
    /// 目标日期 `YYYY-MM-DD`
    pub ymd: Option<String>,
    /// 起始时间（当日毫秒偏移）
    pub start_offset_ms: Option<i64>,
    /// 结束时间（当日毫秒偏移）
    pub end_offset_ms: Option<i64>,
    /// 暂停 / 不可用时段（`commonPauseTimes` 原样透传；元素结构未实测）
    pub pause_times: Vec<Value>,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatTimeRange {
    fn from_data(data: &Value) -> Self {
        Self {
            ymd: value_string(data, &["ymd", "day", "date"]),
            start_offset_ms: value_i64(data, &["startTime"]),
            end_offset_ms: value_i64(data, &["endTime"]),
            pause_times: data
                .get("commonPauseTimes")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default(),
            raw: data.clone(),
        }
    }
}

/// 匹配到的可用座位（`seatengine/getseatinfo` 的 `data.matchReserve`）。
///
/// 实测：`{"duration":"2.0","roomId":13248,"seatNum":"136",
/// "firstLevelName":"二楼A区（现刊报纸阅览室）","startTime":1792112400000,"endTime":1792119600000}`。
///
/// ⚠️ `seat_num` 为**带前导零的字符串**（实测 `"016"` / `"136"`），必须按字符串透传，
/// 不得当整数解析（否则 `016` 会变成 `16`，提交时座位号错误）。
/// ⚠️ `duration` 实测为字符串 `"2.0"`（小时）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatMatch {
    /// 房间 ID（提交预约的 `roomId`）
    pub room_id: Option<i64>,
    /// 座位号（**保留前导零的字符串**）
    pub seat_num: Option<String>,
    /// 一级区域名
    pub first_level_name: Option<String>,
    /// 二级区域名（实测样本未返回）
    pub second_level_name: Option<String>,
    /// 三级区域名（实测样本未返回）
    pub third_level_name: Option<String>,
    /// 开始时间（Unix 毫秒）
    pub start_time_ms: Option<i64>,
    /// 结束时间（Unix 毫秒）
    pub end_time_ms: Option<i64>,
    /// 时长（小时；实测为字符串 `"2.0"`）
    pub duration: Option<String>,
    /// 原始 `matchReserve`
    pub raw: Value,
}

impl SeatMatch {
    fn from_value(v: &Value) -> Self {
        Self {
            room_id: value_i64(v, &["roomId"]),
            seat_num: value_string(v, &["seatNum"]),
            first_level_name: value_string(v, &["firstLevelName"]),
            second_level_name: value_string(v, &["secondLevelName"]),
            third_level_name: value_string(v, &["thirdLevelName"]),
            start_time_ms: value_i64(v, &["startTime"]),
            end_time_ms: value_i64(v, &["endTime"]),
            duration: value_string(v, &["duration"]),
            raw: v.clone(),
        }
    }
}

/// 找空座位的结果：匹配到的座位 + 原始响应 `data`。
///
/// ⚠️ 语义是「给我一个该时段可用的座位」（服务端自动分配），**不是**座位图；
/// 且该座位会被服务端**临时锁定**（页面随后开始倒计时），需在倒计时内提交。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatMatchResult {
    /// 匹配到的座位
    pub matched: SeatMatch,
    /// 原始响应 `data`
    pub raw: Value,
}

impl SeatMatchResult {
    fn from_data(data: &Value) -> Self {
        // 契约：座位信息在 `data.matchReserve`；缺失时回落到 `data` 本身（宽松）
        let matched = data
            .get("matchReserve")
            .filter(|v| v.is_object())
            .unwrap_or(data);
        Self {
            matched: SeatMatch::from_value(matched),
            raw: data.clone(),
        }
    }
}

// ── 提交预约（快速预约链路，实测） ──

/// 提交预约前的准备数据（验证码 + 页面注入的提交随机串）。
///
/// 实测（2026-10-16）：
/// - `captchaUrl`：`GET seat/captcha?appType=2&appId=<seatId>` → `data.captchaUrl`（base64 图片）；
///   验证码**与会话绑定**，必须由同一 Rust 会话客户端获取后立即提交；
/// - `submitEnc`：快速预约页 `/front/apps/seatengine/live/select` 的 HTML 注入
///   `#submit_enc`（形如 `c2e1ec…_406591160`），**best-effort** 提取，取不到为空串。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatSubmitPrepare {
    /// 验证码图片（`data:image/...;base64,...`；取不到为 `None`）
    pub captcha_url: Option<String>,
    /// 页面注入的提交随机串（取不到为空串，前端可留空提交，由服务端判定）
    pub submit_enc: String,
    /// 验证码接口的原始 `data`（保留未建模字段，如 captchaId）
    pub raw: Value,
}

/// 提交座位预约请求（字段与实测契约逐项对齐）。
///
/// ⚠️ `enc` 为**前端计算的客户端签名**，本层原样透传，不做校验 / 猜测；
/// `wyToken` 恒为空串（实测 `seat/risk/check/config` → `riskCheckOpen:false`）。
#[derive(Debug, Clone, Default)]
pub(crate) struct SeatSubmitRequest {
    /// 房间 ID（来自 `getseatinfo` 的 `matchReserve.roomId`）
    pub room_id: i64,
    /// 座位号（**保留前导零的字符串**，如 `"016"`）
    pub seat_num: String,
    /// 开始时间 `HH:mm`
    pub start_time: String,
    /// 结束时间 `HH:mm`
    pub end_time: String,
    /// 预约日期 `YYYY-MM-DD`
    pub day: String,
    /// 验证码（用户按 `captchaUrl` 输入）
    pub captcha: String,
    /// 客户端签名（前端计算）
    pub enc: String,
}

/// 提交预约结果（写操作；必须显式成功才算成功）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SeatSubmitOutcome {
    /// 服务端成功提示语（可能为空）
    pub message: Option<String>,
    /// 业务数据（`data`；无包装时为空对象）
    pub data: Value,
    /// 原始响应
    pub raw: Value,
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

/// POST + 统一取 `data`（余量 / 找空座位链路；失败分类见 [`api_data`]）。
///
/// 业务失败（如「无可用座位」）由 [`api_data`] →
/// [`crate::modules::library_reserve::classify_business_failure`] 归入
/// 可区分的业务 `kind` 并**保留服务端 `msg`**，绝不吞成 `unexpected_response`。
async fn post_data(
    client: &HbutClient,
    ctx: &SeatContext,
    path: &str,
    params: &BTreeMap<String, String>,
    context: &str,
) -> Result<Value, LibraryReserveError> {
    let value = match post_json(client, path, params).await {
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

// ── 余量查询 / 找空座位（POST 表单） ──

/// 房间列表（容量 / 放号 / 开放时间）。
///
/// `POST seatengine/room/list {seatId, seatIdEnc}`。
pub(crate) async fn fetch_seat_rooms(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatRooms, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = post_data(
        client,
        &ctx,
        ENDPOINT_ROOM_LIST,
        &room_list_params(&ctx),
        "获取座位房间列表",
    )
    .await?;
    let rooms = SeatRooms::from_data(&data);
    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!("座位房间列表已获取 房间数={}", rooms.rooms.len()),
    );
    Ok(rooms)
}

/// 区域列表（按层级）。
///
/// `POST seatengine/levels {seatId, type[, firstLevelName[, secondLevelName]]}`。
/// `level_type` 取值见 [`LEVEL_TYPE_FIRST`] / [`LEVEL_TYPE_SECOND`] / [`LEVEL_TYPE_THIRD`]。
pub(crate) async fn fetch_seat_levels(
    client: &mut HbutClient,
    app: LibraryApp,
    level_type: i64,
    first_level_name: Option<&str>,
    second_level_name: Option<&str>,
    force: bool,
) -> Result<SeatLevels, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = post_data(
        client,
        &ctx,
        ENDPOINT_LEVELS,
        &levels_params(&ctx, level_type, first_level_name, second_level_name),
        "获取座位区域列表",
    )
    .await?;
    let levels = SeatLevels::from_data(&data, level_type);
    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!(
            "座位区域列表已获取 层级={} 区域数={}",
            levels.level_type,
            levels.levels.len()
        ),
    );
    Ok(levels)
}

/// 当日可选时间范围（`startTime` / `endTime` 为当日毫秒偏移）。
///
/// `POST seatengine/getstartendtime {deptIdEnc, seatId}`。
pub(crate) async fn fetch_seat_time_range(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatTimeRange, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    let data = post_data(
        client,
        &ctx,
        ENDPOINT_START_END_TIME,
        &time_range_params(&ctx),
        "获取座位可选时间范围",
    )
    .await?;
    Ok(SeatTimeRange::from_data(&data))
}

/// 按时间找空座位（余量匹配）。
///
/// `POST seatengine/getseatinfo {seatId, deptIdEnc, startTime, endTime, 三级区域名}`。
///
/// - `start_time` / `end_time` 为 `HH:mm`（本地校验并归一化为零填充形态，非法则返回
///   [`ERR_INVALID_PARAMS`]，**不发请求**）；
/// - 区域名可选（未指定 = 任意区域）；
/// - 业务失败（如「无可用座位」）保留服务端 `msg`。
pub(crate) async fn fetch_seat_match(
    client: &mut HbutClient,
    app: LibraryApp,
    start_time: &str,
    end_time: &str,
    first_level_name: Option<&str>,
    second_level_name: Option<&str>,
    third_level_name: Option<&str>,
    force: bool,
) -> Result<SeatMatchResult, LibraryReserveError> {
    let start = normalize_hh_mm(start_time).ok_or_else(|| {
        LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("开始时间「{start_time}」不是合法的 HH:mm 时间"),
        )
    })?;
    let end = normalize_hh_mm(end_time).ok_or_else(|| {
        LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("结束时间「{end_time}」不是合法的 HH:mm 时间"),
        )
    })?;

    let ctx = resolve_seat_context(client, app, force).await?;
    let data = post_data(
        client,
        &ctx,
        ENDPOINT_GET_SEAT_INFO,
        &match_params(
            &ctx,
            &start,
            &end,
            first_level_name,
            second_level_name,
            third_level_name,
        ),
        "查询可用座位",
    )
    .await?;
    Ok(SeatMatchResult::from_data(&data))
}

// ── 提交预约（快速预约链路，实测） ──

/// `seat/captcha` 请求体（实测固定 `appType=2` + `appId=<seatId>`）
fn captcha_params(ctx: &SeatContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("appType".into(), ENTRANCE_APP_TYPE.to_string());
    p.insert("appId".into(), ctx.seat_id.clone());
    p
}

/// `seatengine/submit` 请求体（与实测契约逐字段对齐）。
///
/// `wyToken` **恒为空串**（实测 `seat/risk/check/config` → `riskCheckOpen:false`）。
///
/// ⚠️ `wfwEngineEnc` **必须为空串**：实测（2026-10-19）快速预约页 `live/select` 内联脚本为
/// `var deptIdEnc = '', seatIdEnc = '…', wfwEngineEnc = ''` —— 官方提交用的就是空串。
/// 若改传入口链的 `wfwEnc`，服务端会返回「您不具备访问此应用的权限, 请联系管理员处理」。
fn submit_params(_ctx: &SeatContext, req: &SeatSubmitRequest) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("roomId".into(), req.room_id.to_string());
    p.insert("startTime".into(), req.start_time.trim().to_string());
    p.insert("endTime".into(), req.end_time.trim().to_string());
    p.insert("day".into(), req.day.trim().to_string());
    p.insert("captcha".into(), req.captcha.trim().to_string());
    // 座位号保留原样（可能带前导零），只去首尾空白
    p.insert("seatNum".into(), req.seat_num.trim().to_string());
    p.insert("wyToken".into(), String::new());
    // 与官方 live/select 页一致：wfwEngineEnc 恒为空串（详见函数文档）
    p.insert("wfwEngineEnc".into(), String::new());
    p.insert("enc".into(), req.enc.trim().to_string());
    p
}

/// 构造快速预约页地址：把入口落地 URL 的路径换成 `live/select`，**保留原 query 凭证**。
fn live_select_url(ctx: &SeatContext) -> String {
    match Url::parse(&ctx.entry_url) {
        Ok(mut url) => {
            url.set_path(SEAT_LIVE_SELECT_PATH);
            url.to_string()
        }
        Err(_) => format!("{RESERVE_BASE}{SEAT_LIVE_SELECT_PATH}"),
    }
}

/// 取图片验证码（`data.captchaUrl`）。验证码与会话绑定，必须由本会话客户端即时获取。
async fn fetch_seat_captcha(
    client: &HbutClient,
    ctx: &SeatContext,
) -> Result<Value, LibraryReserveError> {
    let value = get_json(client, ENDPOINT_CAPTCHA, &captcha_params(ctx)).await?;
    api_data(&value, "获取座位预约验证码")
}

/// 抓快速预约页并提取 `#submit_enc`（**best-effort**：失败只记 warn，返回 `None`，不中断）。
async fn fetch_submit_enc(client: &HbutClient, ctx: &SeatContext) -> Option<String> {
    let url = live_select_url(ctx);
    let resp = match client
        .client
        .get(&url)
        .header(ACCEPT, "text/html,application/xhtml+xml,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(REFERER, SEAT_REFERER)
        .timeout(API_TIMEOUT)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(err) => {
            crate::runtime_log::log_warn(
                "LibraryReserveSeat",
                format!("抓取快速预约页失败，submitEnc 留空（不影响主流程）：{err}"),
            );
            return None;
        }
    };
    let html = match resp.text().await {
        Ok(html) => html,
        Err(err) => {
            crate::runtime_log::log_warn(
                "LibraryReserveSeat",
                format!("读取快速预约页正文失败，submitEnc 留空（不影响主流程）：{err}"),
            );
            return None;
        }
    };
    match extract_submit_enc(&html) {
        Some(value) => Some(value),
        None => {
            crate::runtime_log::log_warn(
                "LibraryReserveSeat",
                "快速预约页未找到 #submit_enc（页面结构可能变更），submitEnc 留空",
            );
            None
        }
    }
}

/// 提交预约前置准备：验证码图片 + 页面注入的提交随机串。
///
/// `captchaUrl` 失败即报错（无验证码无法提交）；`submitEnc` 为 best-effort（取不到为空串）。
pub(crate) async fn prepare_seat_submit(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<SeatSubmitPrepare, LibraryReserveError> {
    let ctx = resolve_seat_context(client, app, force).await?;
    // 顺序与官方页一致：先加载 live/select 页（服务端在该页下发 submit_enc），再取验证码。
    //
    // ⚠️ 但 `seat/captcha` 的图片验证码**不是**本应用当前使用的验证方式：
    // `seat/captcha/type` 返回 `captchaType=0 / captchaOpen=true`，官方页走的是
    // cxCaptcha 行为验证（`captcha.chaoxing.com`，`initCXCaptcha` + captchaId），
    // 提交时 `captcha` 应为该组件回调里的 `token`。图片验证码仅旧模板使用，
    // 真实提交会返回「验证码校验未通过」（2026-10-19 实测）。
    let submit_enc = fetch_submit_enc(client, &ctx).await.unwrap_or_default();
    let data = fetch_seat_captcha(client, &ctx).await?;
    let captcha_url = value_string(&data, &["captchaUrl", "url", "image", "img"]);
    if captcha_url.is_none() {
        crate::runtime_log::log_warn(
            "LibraryReserveSeat",
            "验证码接口未返回 captchaUrl（响应结构可能变更）",
        );
    }
    crate::runtime_log::log_info(
        "LibraryReserveSeat",
        format!(
            "提交准备完成 有验证码={} 有 submitEnc={}",
            captcha_url.is_some(),
            !submit_enc.is_empty()
        ),
    );
    Ok(SeatSubmitPrepare {
        captcha_url,
        submit_enc,
        raw: data,
    })
}

/// 提交座位预约（写操作）。
///
/// ⚠️ 必须用 [`api_write_result`] 判定：只有**显式成功**（`success:true` 或 `code∈{0,200}`）
/// 才算成功；显式失败原样抛出服务端 `msg`（经业务分类）；两者皆无则报「结果未知」，
/// **绝不默认成功**（假成功会让用户误以为约到了）。
pub(crate) async fn submit_seat_reservation(
    client: &mut HbutClient,
    app: LibraryApp,
    req: &SeatSubmitRequest,
    force: bool,
) -> Result<SeatSubmitOutcome, LibraryReserveError> {
    // 本地参数校验（不发请求，避免无谓的服务端往返与误判）
    if req.room_id <= 0 {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            "提交座位预约需要有效的 roomId（来自「找空座位」结果）",
        ));
    }
    let seat_num = non_empty(Some(req.seat_num.as_str())).ok_or_else(|| {
        LibraryReserveError::business(ERR_INVALID_PARAMS, "提交座位预约需要座位号 seatNum")
    })?;
    let start = normalize_hh_mm(&req.start_time).ok_or_else(|| {
        LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("开始时间「{}」不是合法的 HH:mm 时间", req.start_time),
        )
    })?;
    let end = normalize_hh_mm(&req.end_time).ok_or_else(|| {
        LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("结束时间「{}」不是合法的 HH:mm 时间", req.end_time),
        )
    })?;
    let day = normalize_day(&req.day).ok_or_else(|| {
        LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("预约日期「{}」不是合法的 YYYY-MM-DD", req.day),
        )
    })?;
    let captcha = non_empty(Some(req.captcha.as_str())).ok_or_else(|| {
        LibraryReserveError::business(ERR_INVALID_PARAMS, "提交座位预约需要验证码 captcha")
    })?;

    let ctx = resolve_seat_context(client, app, force).await?;
    let normalized = SeatSubmitRequest {
        room_id: req.room_id,
        seat_num,
        start_time: start,
        end_time: end,
        day,
        captcha,
        enc: req.enc.clone(),
    };
    let params = submit_params(&ctx, &normalized);
    let value = post_json(client, ENDPOINT_SUBMIT, &params).await?;
    let outcome = api_write_result(&value, "提交座位预约")?;
    Ok(SeatSubmitOutcome {
        message: outcome.message,
        data: outcome.data,
        raw: outcome.raw,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::library_reserve::{
        LibraryReserveCredentials, ERR_BUSINESS_REJECTED, ERR_INVALID_APP, ERR_INVALID_PARAMS,
        ERR_UNEXPECTED_RESPONSE,
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

    /// 指定 deptIdEnc 的座位上下文（第二轮勘察新增参数）
    fn seat_context_with_dept(seat_id_enc: Option<&str>, dept_id_enc: Option<&str>) -> SeatContext {
        let mut entry = make_entry(LibraryApp::Seat, seat_id_enc, None);
        entry.credentials.dept_id_enc = dept_id_enc.map(str::to_string);
        SeatContext::from_entry(LibraryApp::Seat, &entry).expect("可构造")
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
        // ⚠️ detail 已脱敏为 scheme://host/path，故此处用真实 URL 断言追加语义
        let err = note_missing_seat_id_enc(
            LibraryReserveError::unexpected(
                "x",
                &[
                    "https://v1.chaoxing.com/a?enc=1".into(),
                    "https://reserve.chaoxing.com/b".into(),
                ],
            ),
            &ctx,
        );
        let detail = err.detail.unwrap_or_default();
        assert!(
            detail.starts_with("https://v1.chaoxing.com/a -> https://reserve.chaoxing.com/b"),
            "原诊断不能被丢弃：{detail}"
        );
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
        // 防止重构时误改路径（契约文档 01-api-contract.md / 03-seat-availability-and-quick-reserve.md）
        assert_eq!(ENDPOINT_I18N, "seat/i18n");
        assert_eq!(ENDPOINT_ENTRANCE_CONFIG, "seat/entrance/config");
        assert_eq!(ENDPOINT_SEAT_INDEX, "seatengine/index");
        assert_eq!(ENDPOINT_IDENTITY_VERIFY, "seatengine/identity/verify");
        // 第二轮勘察（实测）新增的 POST 端点
        assert_eq!(ENDPOINT_ROOM_LIST, "seatengine/room/list");
        assert_eq!(ENDPOINT_LEVELS, "seatengine/levels");
        assert_eq!(ENDPOINT_START_END_TIME, "seatengine/getstartendtime");
        assert_eq!(ENDPOINT_GET_SEAT_INFO, "seatengine/getseatinfo");
        // 快速预约链路（实测）：验证码 + 提交 + 快速预约页
        assert_eq!(ENDPOINT_CAPTCHA, "seat/captcha");
        assert_eq!(ENDPOINT_SUBMIT, "seatengine/submit");
        assert_eq!(SEAT_LIVE_SELECT_PATH, "/front/apps/seatengine/live/select");
        assert_eq!(ENTRANCE_APP_TYPE, "2");
        // 层级常量与契约 `type: 0|1|2` 对齐
        assert_eq!(
            [LEVEL_TYPE_FIRST, LEVEL_TYPE_SECOND, LEVEL_TYPE_THIRD],
            [0, 1, 2]
        );
        // 基址以 / 结尾，路径不得以 / 开头（否则拼接出错）
        for p in [
            ENDPOINT_I18N,
            ENDPOINT_ENTRANCE_CONFIG,
            ENDPOINT_SEAT_INDEX,
            ENDPOINT_IDENTITY_VERIFY,
            ENDPOINT_ROOM_LIST,
            ENDPOINT_LEVELS,
            ENDPOINT_START_END_TIME,
            ENDPOINT_GET_SEAT_INFO,
            ENDPOINT_CAPTCHA,
            ENDPOINT_SUBMIT,
        ] {
            assert!(!p.starts_with('/'), "路径不应以 / 开头：{p}");
        }
        assert!(RESERVE_API_BASE.ends_with('/'));
        // 座位预约 Referer 是 seatengine 页面，不得混入 reservepc
        assert!(!SEAT_REFERER.ends_with("reservepc/index"));
        assert!(SEAT_REFERER.contains("seatengine"));
    }

    // ── 页面注入参数提取（能力已上提到 library_reserve，提取测试随迁） ──

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

    // ── 余量查询 / 找空座位：请求体构造（与第二轮实测契约逐字段对齐） ──

    #[test]
    fn room_list_params_match_contract() {
        // 实测：POST seatengine/room/list { seatId: '3597', seatIdEnc: '<enc>' }
        let p = room_list_params(&seat_context(Some("b146028eafa4eea9")));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(
            p.get("seatIdEnc").map(String::as_str),
            Some("b146028eafa4eea9")
        );
        assert_eq!(p.len(), 2, "room/list 不应多带参数：{p:?}");

        // seatIdEnc 缺失时按既有逻辑「不带该参数」（与 seatIdEnc 的既有语义一致）
        let p = room_list_params(&seat_context(None));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert!(!p.contains_key("seatIdEnc"));
        assert_eq!(p.len(), 1);
    }

    #[test]
    fn levels_params_match_contract_by_level() {
        let ctx = seat_context(None);

        // type=0：仅 seatId + type
        let p = levels_params(&ctx, LEVEL_TYPE_FIRST, None, None);
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.get("type").map(String::as_str), Some("0"));
        assert_eq!(p.len(), 2, "一级区域不应多带参数：{p:?}");

        // type=1：追加 firstLevelName
        let p = levels_params(&ctx, LEVEL_TYPE_SECOND, Some("四楼D区（有插座）"), None);
        assert_eq!(p.get("type").map(String::as_str), Some("1"));
        assert_eq!(
            p.get("firstLevelName").map(String::as_str),
            Some("四楼D区（有插座）")
        );
        assert!(!p.contains_key("secondLevelName"));
        assert_eq!(p.len(), 3);

        // type=2：追加 firstLevelName + secondLevelName
        let p = levels_params(&ctx, LEVEL_TYPE_THIRD, Some("A区"), Some("A-1"));
        assert_eq!(p.get("type").map(String::as_str), Some("2"));
        assert_eq!(p.get("firstLevelName").map(String::as_str), Some("A区"));
        assert_eq!(p.get("secondLevelName").map(String::as_str), Some("A-1"));
        assert_eq!(p.len(), 4);

        // 空串上级区域名视同未提供（页面实参即空串 → 不带）
        let p = levels_params(&ctx, LEVEL_TYPE_FIRST, Some("   "), Some(""));
        assert!(!p.contains_key("firstLevelName"));
        assert!(!p.contains_key("secondLevelName"));
        assert_eq!(p.len(), 2);
    }

    #[test]
    fn time_range_params_always_send_dept_id_enc() {
        // 实测：POST seatengine/getstartendtime { deptIdEnc: '', seatId: '3597' }
        let p = time_range_params(&seat_context(None));
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some(""));
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.len(), 2, "时间范围接口不应多带参数：{p:?}");

        // 有 deptIdEnc 时用实时值
        let p = time_range_params(&seat_context_with_dept(None, Some("DEPT-ENC")));
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some("DEPT-ENC"));
    }

    #[test]
    fn match_params_always_send_level_names_and_dept_id_enc() {
        let ctx = seat_context(None);
        // 实测：三级区域名恒带（未指定即空串）
        let p = match_params(&ctx, "09:00", "11:00", None, None, None);
        assert_eq!(p.get("seatId").map(String::as_str), Some("3597"));
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some(""));
        assert_eq!(p.get("startTime").map(String::as_str), Some("09:00"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("11:00"));
        assert_eq!(p.get("firstLevelName").map(String::as_str), Some(""));
        assert_eq!(p.get("secondLevelName").map(String::as_str), Some(""));
        assert_eq!(p.get("thirdLevelName").map(String::as_str), Some(""));
        assert_eq!(p.len(), 7, "getseatinfo 参数数固定为 7：{p:?}");

        // 指定区域 + deptIdEnc
        let ctx = seat_context_with_dept(Some("SEAT-ENC"), Some("DEPT-ENC"));
        let p = match_params(
            &ctx,
            "09:00",
            "11:00",
            Some("四楼D区（有插座）"),
            None,
            None,
        );
        assert_eq!(p.get("deptIdEnc").map(String::as_str), Some("DEPT-ENC"));
        assert_eq!(
            p.get("firstLevelName").map(String::as_str),
            Some("四楼D区（有插座）")
        );
    }

    #[test]
    fn normalize_hh_mm_pads_and_rejects_garbage() {
        assert_eq!(normalize_hh_mm("09:00").as_deref(), Some("09:00"));
        assert_eq!(normalize_hh_mm(" 9:5 ").as_deref(), Some("09:05"));
        assert_eq!(normalize_hh_mm("23:59").as_deref(), Some("23:59"));
        assert_eq!(normalize_hh_mm("0:00").as_deref(), Some("00:00"));
        // 非法：缺冒号 / 非数字 / 越界 / 空
        assert_eq!(normalize_hh_mm("0900"), None);
        assert_eq!(normalize_hh_mm("aa:bb"), None);
        assert_eq!(normalize_hh_mm("24:00"), None);
        assert_eq!(normalize_hh_mm("09:60"), None);
        assert_eq!(normalize_hh_mm(""), None);
    }

    // ── 余量查询 / 找空座位：响应解析（实测 JSON 作为 fixture） ──

    #[test]
    fn room_list_parses_recon_sample() {
        // 第二轮勘察实测（totalRow=2）
        let data = serde_json::json!({
            "totalRow": 2,
            "rows": [
                {"id": 10892, "firstLevelName": "四楼D区（有插座）", "capacity": 118,
                 "reserveBeforeDay": 1, "reserveBeforeTime": "08:00",
                 "reserveAfterDay": -1, "reserveAfterTime": "12:00",
                 "gridStyle": 1, "picSeatMode": 1},
                {"id": 13248, "firstLevelName": "二楼A区（现刊报纸阅览室）", "capacity": 240,
                 "reserveBeforeDay": 1, "reserveBeforeTime": "08:00",
                 "reserveAfterDay": -1, "reserveAfterTime": "12:00",
                 "gridStyle": 0, "picSeatMode": 2}
            ]
        });
        let rooms = SeatRooms::from_data(&data);
        assert_eq!(rooms.rooms.len(), 2);

        let first = &rooms.rooms[0];
        assert_eq!(first.id, Some(10892));
        assert_eq!(first.first_level_name.as_deref(), Some("四楼D区（有插座）"));
        assert_eq!(first.capacity, Some(118));
        assert_eq!(first.reserve_before_day, Some(1));
        assert_eq!(first.reserve_before_time.as_deref(), Some("08:00"));
        assert_eq!(first.reserve_after_day, Some(-1));
        assert_eq!(first.reserve_after_time.as_deref(), Some("12:00"));
        assert_eq!(first.grid_style, Some(1));
        assert_eq!(first.pic_seat_mode, Some(1));
        // 未提供 seatEngineSpecialTime → 开放时段为空（不 panic）
        assert!(first.open_hours.is_empty());
        // 原始条目原样保留
        assert_eq!(
            first.raw.get("capacity").and_then(|v| v.as_i64()),
            Some(118)
        );

        let second = &rooms.rooms[1];
        assert_eq!(second.id, Some(13248));
        assert_eq!(second.capacity, Some(240));
        assert_eq!(second.pic_seat_mode, Some(2));
        assert!(rooms.raw.get("totalRow").is_some());
    }

    #[test]
    fn room_list_tolerates_missing_array_and_odd_shapes() {
        // 无 rows / rooms / list：空列表，不 panic
        let rooms = SeatRooms::from_data(&serde_json::json!({"totalRow": 0}));
        assert!(rooms.rooms.is_empty());

        // data 本身即数组
        let rooms = SeatRooms::from_data(&serde_json::json!([{"id": 1, "capacity": 5}]));
        assert_eq!(rooms.rooms.len(), 1);
        assert_eq!(rooms.rooms[0].id, Some(1));

        // 数字字符串 / 缺字段也要能解析
        let rooms = SeatRooms::from_data(&serde_json::json!({
            "rows": [{"id": "10892", "capacity": "118", "reserveBeforeDay": "1"}]
        }));
        assert_eq!(rooms.rooms[0].id, Some(10892));
        assert_eq!(rooms.rooms[0].capacity, Some(118));
        assert_eq!(rooms.rooms[0].reserve_before_day, Some(1));
    }

    #[test]
    fn open_hours_from_special_time_handles_shapes() {
        // 对象（星期前缀键位，复用 CommonTimeConfig 思路）
        let days = open_hours_from_special_time(&serde_json::json!({
            "monStartTime": "08:00", "monEndTime": "22:00"
        }));
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].day, "周一");
        assert_eq!(days[0].start.as_deref(), Some("08:00"));

        // JSON 字符串
        let days = open_hours_from_special_time(&serde_json::json!(
            "{\"monStartTime\":\"08:00\",\"monEndTime\":\"22:00\"}"
        ));
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].day, "周一");

        // 对象数组：显式 day/start/end
        let days = open_hours_from_special_time(&serde_json::json!([
            {"day": "周一", "startTime": "08:00", "endTime": "22:00"},
            {"day": "周二", "startTime": "08:00", "endTime": "21:00"}
        ]));
        assert_eq!(days.len(), 2);
        assert_eq!(days[0].day, "周一");
        assert_eq!(days[1].end.as_deref(), Some("21:00"));

        // 对象数组：星期前缀键位
        let days = open_hours_from_special_time(&serde_json::json!([
            {"satStartTime": "09:00", "satEndTime": "18:00"}
        ]));
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].day, "周六");

        // 无法识别：空列表，不 panic
        assert!(open_hours_from_special_time(&serde_json::json!("not json")).is_empty());
        assert!(open_hours_from_special_time(&serde_json::json!("")).is_empty());
        assert!(open_hours_from_special_time(&serde_json::json!(123)).is_empty());
        assert!(open_hours_from_special_time(&Value::Null).is_empty());
    }

    #[test]
    fn room_open_hours_reads_special_time_field() {
        let room = SeatRoom::from_value(&serde_json::json!({
            "id": 10892,
            "seatEngineSpecialTime": {"monStartTime": "08:00", "monEndTime": "22:00"}
        }));
        assert_eq!(room.open_hours.len(), 1);
        assert_eq!(room.open_hours[0].day, "周一");
    }

    #[test]
    fn levels_extracts_name_by_level_type() {
        // 实测（type=0）：data.levels[].firstLevelName
        let data = serde_json::json!({
            "levels": [
                {"firstLevelName": "四楼D区（有插座）"},
                {"firstLevelName": "二楼A区（现刊报纸阅览室）"}
            ]
        });
        assert_eq!(
            levels_of(&data, LEVEL_TYPE_FIRST),
            vec![
                "四楼D区（有插座）".to_string(),
                "二楼A区（现刊报纸阅览室）".to_string()
            ]
        );

        // type=1 → secondLevelName；type=2 → thirdLevelName（宽松：只认对应键）
        let data = serde_json::json!({
            "levels": [
                {"secondLevelName": "A-1", "firstLevelName": "忽略我"},
                {"secondLevelName": "A-2"}
            ]
        });
        assert_eq!(levels_of(&data, LEVEL_TYPE_SECOND), vec!["A-1", "A-2"]);

        let data = serde_json::json!({
            "levels": [{"thirdLevelName": "x"}, {"firstLevelName": "y"}]
        });
        assert_eq!(levels_of(&data, LEVEL_TYPE_THIRD), vec!["x"]);

        // 元素为裸字符串也要能取（宽松）
        let data = serde_json::json!({"levels": ["一层", "二层"]});
        assert_eq!(levels_of(&data, LEVEL_TYPE_FIRST), vec!["一层", "二层"]);

        // 实测（type=1 该区无二级）：空数组
        let data = serde_json::json!({"levels": []});
        assert!(levels_of(&data, LEVEL_TYPE_SECOND).is_empty());

        // 空串被过滤，缺字段不 panic
        let data = serde_json::json!({"levels": [{"firstLevelName": ""}, {"other": 1}]});
        assert!(levels_of(&data, LEVEL_TYPE_FIRST).is_empty());
        assert!(levels_of(&serde_json::json!({}), LEVEL_TYPE_FIRST).is_empty());
    }

    #[test]
    fn time_range_parses_recon_sample() {
        // 实测：{"ymd":"2026-10-16","commonPauseTimes":[],"startTime":0,"endTime":50400000}
        let data = serde_json::json!({
            "ymd": "2026-10-16",
            "commonPauseTimes": [],
            "startTime": 0,
            "endTime": 50400000
        });
        let range = SeatTimeRange::from_data(&data);
        assert_eq!(range.ymd.as_deref(), Some("2026-10-16"));
        assert_eq!(range.start_offset_ms, Some(0));
        assert_eq!(range.end_offset_ms, Some(50_400_000));
        assert!(range.pause_times.is_empty());
        assert!(range.raw.get("ymd").is_some());

        // 有暂停时段时原样透传元素
        let range = SeatTimeRange::from_data(&serde_json::json!({
            "ymd": "2026-10-16",
            "commonPauseTimes": [{"startTime": "12:00", "endTime": "13:00"}]
        }));
        assert_eq!(range.pause_times.len(), 1);
        assert!(range.start_offset_ms.is_none());

        // 缺字段不 panic
        let range = SeatTimeRange::from_data(&serde_json::json!({}));
        assert!(range.ymd.is_none());
        assert!(range.start_offset_ms.is_none());
        assert!(range.pause_times.is_empty());
    }

    #[test]
    fn seat_match_parses_recon_sample() {
        // 实测：seatNum 为带前导零的字符串；duration 为字符串 "2.0"
        let data = serde_json::json!({
            "matchReserve": {
                "duration": "2.0",
                "roomId": 13248,
                "seatNum": "136",
                "firstLevelName": "二楼A区（现刊报纸阅览室）",
                "startTime": 1792112400000i64,
                "endTime": 1792119600000i64
            }
        });
        let result = SeatMatchResult::from_data(&data);
        let m = &result.matched;
        assert_eq!(m.room_id, Some(13248));
        assert_eq!(m.seat_num.as_deref(), Some("136"));
        assert_eq!(
            m.first_level_name.as_deref(),
            Some("二楼A区（现刊报纸阅览室）")
        );
        assert_eq!(m.start_time_ms, Some(1792112400000));
        assert_eq!(m.end_time_ms, Some(1792119600000));
        assert_eq!(m.duration.as_deref(), Some("2.0"));
        // 样本未返回二级 / 三级区域名
        assert!(m.second_level_name.is_none());
        assert!(m.third_level_name.is_none());
        assert!(result.raw.get("matchReserve").is_some());

        // 前导零必须原样保留（当整数解析会变成 16 → 座位号错误）
        let data = serde_json::json!({
            "matchReserve": {"duration": "1.0", "roomId": 10892, "seatNum": "016",
                             "firstLevelName": "四楼D区（有插座）"}
        });
        let result = SeatMatchResult::from_data(&data);
        assert_eq!(result.matched.seat_num.as_deref(), Some("016"));
        assert_eq!(result.matched.room_id, Some(10892));

        // 缺 matchReserve → 回落到 data 本身（宽松，不 panic）
        let result = SeatMatchResult::from_data(&serde_json::json!({"roomId": 1}));
        assert_eq!(result.matched.room_id, Some(1));
        assert!(SeatMatchResult::from_data(&serde_json::json!({}))
            .matched
            .room_id
            .is_none());
    }

    #[test]
    fn match_business_failure_keeps_server_message() {
        // 业务失败（无可用座位等）必须保留服务端 msg，不能吞成 unknown
        let value = serde_json::json!({"success": false, "msg": "该时段已无可用座位"});
        let err = api_data(&value, "查询可用座位").expect_err("应失败");
        assert_eq!(err.kind, ERR_BUSINESS_REJECTED);
        assert!(
            err.message.contains("该时段已无可用座位"),
            "服务端 msg 必须保留：{}",
            err.message
        );
        assert_ne!(err.kind, ERR_UNEXPECTED_RESPONSE);

        // 登录态失效仍走登录类错误（可重新登录）
        let value = serde_json::json!({"success": false, "msg": "未登录或登录已失效"});
        let err = api_data(&value, "查询可用座位").expect_err("应失败");
        assert_eq!(
            err.kind,
            crate::modules::library_reserve::ERR_CHAOXING_NOT_LOGGED_IN
        );

        // 成功：取 data（matchReserve）
        let value = serde_json::json!({"success": true, "data": {"matchReserve": {"roomId": 1}}});
        let data = api_data(&value, "查询可用座位").expect("成功");
        assert!(data.get("matchReserve").is_some());
    }

    #[test]
    fn invalid_params_error_is_used_for_bad_time() {
        // 本地参数校验失败用 invalid_params（命令层 / 模块层共用同一 kind）
        let err = LibraryReserveError::business(ERR_INVALID_PARAMS, "开始时间非法");
        assert_eq!(err.kind, ERR_INVALID_PARAMS);
        assert!(!err.can_relogin, "参数错误不应提示重新登录");
    }

    // ── 提交预约（快速预约链路，实测契约） ──

    /// 指定 wfw 凭证的座位上下文（提交需要 wfwEngineEnc）
    fn seat_context_with_wfw(wfw_enc: Option<&str>, wfw_engine_enc: Option<&str>) -> SeatContext {
        let mut entry = make_entry(LibraryApp::Seat, None, None);
        entry.credentials.wfw_enc = wfw_enc.map(str::to_string);
        entry.credentials.wfw_engine_enc = wfw_engine_enc.map(str::to_string);
        SeatContext::from_entry(LibraryApp::Seat, &entry).expect("可构造")
    }

    #[test]
    fn captcha_params_match_contract() {
        // 实测：seat/captcha?appType=2&appId=3597
        let p = captcha_params(&seat_context(None));
        assert_eq!(p.get("appType").map(String::as_str), Some("2"));
        assert_eq!(p.get("appId").map(String::as_str), Some("3597"));
        assert_eq!(p.len(), 2, "验证码接口不应多带参数：{p:?}");
    }

    #[test]
    fn extract_submit_enc_handles_orders_and_missing() {
        // 实测原文形态（id 在 value 之前）
        let html = r#"<input type="hidden" id="submit_enc" value="c2e1ec6696a74df188850419513a1261_406591160"/>"#;
        assert_eq!(
            extract_submit_enc(html).as_deref(),
            Some("c2e1ec6696a74df188850419513a1261_406591160")
        );

        // value 在 id 之前也要能取（正则宽松）
        let html = r#"<input type="hidden" value="abc_123" id='submit_enc'>"#;
        assert_eq!(extract_submit_enc(html).as_deref(), Some("abc_123"));

        // 属性间任意空白 / 换行
        let html = "<input\n  id = \"submit_enc\"\n  value = \"xyz\"\n/>";
        assert_eq!(extract_submit_enc(html).as_deref(), Some("xyz"));

        // 取不到 / 空值 → None（不报错）
        assert_eq!(extract_submit_enc("<html>no such input</html>"), None);
        assert_eq!(
            extract_submit_enc(r#"<input id="submit_enc" value="">"#),
            None
        );
        // 同名但不相关（不同 id）不应误取
        assert_eq!(
            extract_submit_enc(r#"<input id="other" value="leak">"#),
            None
        );
    }

    #[test]
    fn live_select_url_swaps_path_and_keeps_credentials() {
        let ctx = seat_context(None);
        let url = live_select_url(&ctx);
        assert!(url.contains("/front/apps/seatengine/live/select"), "{url}");
        // 入口凭证（query）必须保留
        assert!(url.contains("seatId=3597"), "{url}");
        assert!(!url.contains("/index"), "路径应被替换：{url}");
    }

    #[test]
    fn submit_params_match_contract_and_keep_leading_zero() {
        let ctx = seat_context_with_wfw(Some("9C32209DB3CDFF7CC351BD42FF5C8270"), None);
        let req = SeatSubmitRequest {
            room_id: 10892,
            // 前导零必须原样保留（当整数解析会变成 16 → 座位号错误）
            seat_num: " 016 ".to_string(),
            start_time: " 09:00 ".to_string(),
            end_time: "11:00".to_string(),
            day: " 2026-10-17 ".to_string(),
            captcha: " 8a9b ".to_string(),
            enc: " SIGN ".to_string(),
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("roomId").map(String::as_str), Some("10892"));
        assert_eq!(p.get("startTime").map(String::as_str), Some("09:00"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("11:00"));
        assert_eq!(p.get("day").map(String::as_str), Some("2026-10-17"));
        assert_eq!(p.get("captcha").map(String::as_str), Some("8a9b"));
        assert_eq!(p.get("seatNum").map(String::as_str), Some("016"));
        // 风控关闭（riskCheckOpen:false）→ wyToken 恒空串
        assert_eq!(p.get("wyToken").map(String::as_str), Some(""));
        // 官方 live/select 页 wfwEngineEnc 恒为空串（2026-10-19 实测）
        assert_eq!(p.get("wfwEngineEnc").map(String::as_str), Some(""));
        assert_eq!(p.get("enc").map(String::as_str), Some("SIGN"));
        assert_eq!(p.len(), 9, "提交参数数固定为 9：{p:?}");

        // 入口链 wfwEnc / 显式 wfwEngineEnc 都不再影响提交体（必为空串）
        let ctx = seat_context_with_wfw(Some("W"), Some("E"));
        assert_eq!(
            submit_params(&ctx, &req)
                .get("wfwEngineEnc")
                .map(String::as_str),
            Some("")
        );
        let ctx = seat_context_with_wfw(None, None);
        assert_eq!(
            submit_params(&ctx, &req)
                .get("wfwEngineEnc")
                .map(String::as_str),
            Some("")
        );
    }

    #[test]
    fn normalize_day_validates_shape() {
        assert_eq!(normalize_day("2026-10-17").as_deref(), Some("2026-10-17"));
        assert_eq!(normalize_day(" 2026-10-17 ").as_deref(), Some("2026-10-17"));
        // 非法形态
        assert_eq!(normalize_day("2026/10/17"), None);
        assert_eq!(normalize_day("20261017"), None);
        assert_eq!(normalize_day("2026-1-7"), None);
        assert_eq!(normalize_day(""), None);
    }

    #[test]
    fn submit_write_judgement_never_defaults_to_success() {
        // 写操作：无显式成功标志 → 结果未知（unexpected_response），绝不默认成功
        let unknown = api_write_result(&serde_json::json!({"msg": "预约失败"}), "提交座位预约")
            .expect_err("不得默认成功");
        assert_eq!(unknown.kind, ERR_UNEXPECTED_RESPONSE);
        assert_ne!(unknown.kind, ERR_BUSINESS_REJECTED);

        // 显式失败：原样保留服务端 msg（经业务分类）
        let rejected = api_write_result(
            &serde_json::json!({"success": false, "msg": "该时段已无可用座位"}),
            "提交座位预约",
        )
        .expect_err("应失败");
        assert!(
            rejected.message.contains("该时段已无可用座位"),
            "服务端 msg 必须保留：{}",
            rejected.message
        );

        // 显式成功才判成功
        assert!(api_write_result(&serde_json::json!({"success": true}), "提交座位预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 200}), "提交座位预约").is_ok());
    }
}
