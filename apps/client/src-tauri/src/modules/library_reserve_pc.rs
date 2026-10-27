//! 图书馆预约 · 静音仓 / 研讨室（PC 版 `reservepc` 接口体系）（#1053）
//!
//! 本模块在 [`crate::modules::library_reserve`]（#1052 地基）之上实现具体业务能力：
//! 预约项详情、可预约时段（含动态表单定义 `customFormConfig`）、我的预约、
//! 提交预约、取消预约，以及辅助接口（用户视图 / 团队 / 角色 / 提醒对话框）。
//!
//! ## 为什么不写进 `library_reserve.rs`
//!
//! `library_reserve.rs` 负责「mAppId → 真实入口 + 凭证」这条**与业务无关**的地基链路；
//! 本模块只在其上叠加业务接口，二者职责分离；#1054（座位预约 seatengine）会以同样的方式
//! 新增一个平行模块，避免单文件无限膨胀。
//!
//! ## 接口契约（`data/library-reserve-recon/01-api-contract.md`，实测）
//!
//! Base `https://reserve.chaoxing.com/data/apps/`；除 `reserve/dialog` 为 **GET** 外，
//! 其余全部为 **POST**，`Content-Type: application/x-www-form-urlencoded; charset=UTF-8`。
//!
//! ⚠️ 契约完整度分两档，代码中已逐处标注：
//!
//! - ✅ **已实测**：`reserve/info`、`reserve/item/list/time`、`reservepc/user/view/flag`、
//!   `reservepc/open/team`、`reservepc/team/list`、`seat/person/role`、`reserve/dialog`；
//! - ❓ **未实测（TODO(#1053)）**：`reserve/multiple/submit` 与取消接口的**完整字段契约**、
//!   以及 `customFormConfig` → 提交体的**映射关系**。这些按已知形态实现并显式标注，
//!   不做「猜测后伪装成已确定」。
//!
//! ## 硬性约定
//!
//! - 凭证（`fidEnc` / `reserveIdEnc`）为**短时效**值，**不得硬编码**；
//!   每次调用都先经 [`library_reserve::resolve_entry`] 实时解析。
//! - 提交 / 取消失败必须能区分**业务失败**（时段被占 / 超限 / 违约停用）与**网络失败**：
//!   前者返回 [`ERR_SLOT_UNAVAILABLE`] 等业务 kind，后者返回
//!   [`crate::modules::library_reserve::ERR_NETWORK_UNREACHABLE`]。
//! - **写操作（提交 / 取消）要求显式成功信号**（`success:true` 或 `code ∈ {0,200}`）：
//!   契约未实测的端点上，「没有任何成功标志」一律判为**结果未知**并报错，
//!   **绝不默认成功**（假成功比报错更糟）。读操作仍走宽松判定 [`api_data`]。

use std::collections::BTreeMap;
use std::time::Duration;

use chrono::TimeZone;
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, ORIGIN, REFERER};
use serde::Serialize;
use serde_json::Value;

use crate::http_client::HbutClient;
use crate::modules::library_reserve::{
    self, api_data, api_write_result, classify_transport_error, encode_form, non_empty,
    read_api_response, value_bool, value_f64, value_i64, value_string, LibraryApp, LibraryAppEntry,
    LibraryReserveError, ERR_INVALID_PARAMS, RESERVE_API_BASE,
};

// ── 常量 ──

/// 预约系统 PC 页面 Referer（超星会校验来源）
const RESERVE_PC_REFERER: &str = "https://reserve.chaoxing.com/front/web/apps/reservepc/index";
/// Origin 头（表单 POST 必需）
const RESERVE_ORIGIN: &str = "https://reserve.chaoxing.com";
/// 实测的 Content-Type（**带 charset**，与契约一致；reqwest 的 `.form()` 不带 charset，故手工组体）
const FORM_CONTENT_TYPE: &str = "application/x-www-form-urlencoded; charset=UTF-8";
/// 业务接口超时（短于主客户端 30s，避免前端长时间无反馈）
const API_TIMEOUT: Duration = Duration::from_secs(25);

/// 预约项详情
const ENDPOINT_ITEM_INFO: &str = "reserve/info";
/// 可预约时段列表（核心）
const ENDPOINT_TIME_LIST: &str = "reserve/item/list/time";
/// 预约对象时段设置（`commonIntervalMap`：按星期几的**真实时段 ID**）
///
/// 实测（2026-10-19）：`POST reserve/item/setting` body `reserveId/itemId/fidEnc`，
/// 返回 `data.commonIntervalMap["1".."7"] = [{id,startTime,endTime,week,available,…}]`。
/// 提交 `reserve/multiple/submit` 时 `reserveUsers[].intervalIds` 必须用这里的 `id`。
const ENDPOINT_ITEM_SETTING: &str = "reserve/item/setting";
/// 预约对象「**所有用户**的预约数据」= 实时占用（#1080 核心）
///
/// 实测（2026-10-19，官方 `reservepc/item` 页内联 JS + curl 双重复核）：
/// 官方页面用 `$.getJSON`（**GET**）调用，参数
/// `reserveId / itemId / fidEnc / startTime(YYYY-MM-DD) / endTime(YYYY-MM-DD)`
/// （`startTime` / `endTime` **必填**，缺失时服务端返回 HTTP 400 HTML 错误页）。
///
/// 响应 `data.reserveUserList[]` 每条为**一个时段**的预约记录（同一笔跨多个时段的预约会
/// 重复出现多条，`id` 相同、`reserveIntervalId` 不同），字段见 [`ItemOccupancyRecord`]。
/// `data.reserveIntervalId` 与 `reserve/item/setting` 的 `commonIntervalMap[].id` 同源。
const ENDPOINT_ITEM_USER_LIST: &str = "reserve/item/user/list";
/// 规则 + **服务端时间**（`data.serverNow`，Unix 毫秒）
///
/// 实测（2026-10-19）：`POST reserve/special/rule` body `reserveId/itemId`
/// → `{"data":{"serverNow":1792405979859},"success":true}`。
/// 官方 `reservepc/item` 页的 `serverNow` 由服务端注入页面 HTML（`new Date('...+08:00')`），
/// 接口侧等价来源即本端点，用于判断「今天已过去的时段」。
const ENDPOINT_SPECIAL_RULE: &str = "reserve/special/rule";
/// 用户视图标记
const ENDPOINT_USER_VIEW_FLAG: &str = "reservepc/user/view/flag";
/// 是否开放团队预约
const ENDPOINT_OPEN_TEAM: &str = "reservepc/open/team";
/// 团队列表
const ENDPOINT_TEAM_LIST: &str = "reservepc/team/list";
/// 人员角色
const ENDPOINT_PERSON_ROLE: &str = "seat/person/role";
/// 提醒对话框确认（GET）
const ENDPOINT_DIALOG: &str = "reserve/dialog";
/// 提交预约（多人 / 表单）
const ENDPOINT_SUBMIT: &str = "reserve/multiple/submit";
/// 我的预约列表
///
/// 实测（2026-10-16）修正：原用 `reserve/latest/data` 返回 **HTTP 400**
/// （`Required request parameter 'itemId' …is not present`），**并非列表接口**。
/// 正确端点为 `POST /data/apps/reservepc/user/histroy`，body
/// `reserveId/resvAppId/reserveIdEnc/fidEnc`，返回
/// `{"data":{"totalRow":N,"totalPage":N,"rows":[…]}}`。
const ENDPOINT_MY_RESERVATIONS: &str = "reservepc/user/histroy";
/// 取消预约
///
/// 实测（2026-10-19）：`POST reserve/item/user/cancel`，**主键是记录 `id`（不是 `aprvId`，
/// 后者恒为 0）**，body 另带 `allCancel`（0/1）。成功后「我的预约」该条 `status=7`、`isCancel=true`。
const ENDPOINT_CANCEL: &str = "reserve/item/user/cancel";

// ── HTTP 层 ──

/// POST 表单并返回 JSON（`Content-Type` 与契约一致）
async fn post_form(
    client: &HbutClient,
    path: &str,
    params: &BTreeMap<String, String>,
) -> Result<Value, LibraryReserveError> {
    let url = format!("{RESERVE_API_BASE}{path}");
    crate::runtime_log::log_info(
        "LibraryReservePc",
        format!("POST {path} 参数数={}", params.len()),
    );
    let resp = client
        .client
        .post(&url)
        .header(CONTENT_TYPE, FORM_CONTENT_TYPE)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(REFERER, RESERVE_PC_REFERER)
        .header(ORIGIN, RESERVE_ORIGIN)
        .header("X-Requested-With", "XMLHttpRequest")
        .timeout(API_TIMEOUT)
        .body(encode_form(params))
        .send()
        .await
        .map_err(|e| classify_transport_error(&e))?;
    read_api_response(resp, path).await
}

/// GET 并返回 JSON（`reserve/dialog`、`reserve/item/user/list` 等 XHR 风格 GET 端点）
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
    crate::runtime_log::log_info("LibraryReservePc", format!("GET {path}"));
    let resp = client
        .client
        .get(&url)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(REFERER, RESERVE_PC_REFERER)
        // 官方页面这些 GET 走 `$.getJSON`，带 `X-Requested-With`（与 POST 侧保持一致）
        .header("X-Requested-With", "XMLHttpRequest")
        .timeout(API_TIMEOUT)
        .send()
        .await
        .map_err(|e| classify_transport_error(&e))?;
    read_api_response(resp, path).await
}

// ── 动态表单定义（customFormConfig） ──

/// `customFormConfig` 的解析结果。
///
/// ⚠️ TODO(#1053)：该配置的**字段 schema 未经实测**。这里做「宽松解析 + 原样保留」：
/// `raw` / `value` 供前端按真实结构自行渲染，`fields` 只是对常见键名的 best-effort 提取，
/// 不保证覆盖全部字段，也**不得**据此推断提交体字段名。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomFormConfig {
    /// 原始 JSON 字符串（原样保留，前端可直接二次解析）
    pub raw: String,
    /// 解析后的 JSON（解析失败为 `null`）
    pub value: Value,
    /// 原始字符串是否成功解析为 JSON
    pub parsed: bool,
    /// best-effort 提取出的字段定义列表（可能为空）
    pub fields: Vec<CustomFormField>,
}

impl CustomFormConfig {
    /// 解析 `customFormConfig` 字符串
    fn parse(raw: &str) -> Self {
        let trimmed = raw.trim();
        let value: Value = serde_json::from_str(trimmed).unwrap_or(Value::Null);
        let parsed = !value.is_null();
        let fields = extract_form_fields(&value);
        Self {
            raw: raw.to_string(),
            value,
            parsed,
            fields,
        }
    }

    /// 从时段条目里取 `customFormConfig`（可能是 JSON 字符串，也可能已是结构）
    fn of(item: &Value) -> Option<Self> {
        let raw = item
            .get("customFormConfig")
            .or_else(|| item.get("customForm"))
            .or_else(|| item.get("formConfig"))?;
        match raw {
            Value::Null => None,
            Value::String(s) => {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(Self::parse(t))
                }
            }
            other => {
                let text = serde_json::to_string(other).unwrap_or_default();
                Some(Self {
                    raw: text,
                    value: other.clone(),
                    parsed: true,
                    fields: extract_form_fields(other),
                })
            }
        }
    }
}

/// 单个表单字段定义（best-effort；键名未经实测）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomFormField {
    /// 提交时的字段名
    pub key: Option<String>,
    /// 展示标题
    pub label: Option<String>,
    /// 控件类型
    pub field_type: Option<String>,
    /// 是否必填
    pub required: Option<bool>,
    /// 默认值
    pub default_value: Option<Value>,
    /// 选项（下拉 / 单选等）
    pub options: Option<Value>,
    /// 占位提示
    pub placeholder: Option<String>,
    /// 关联绑定字段（动态联动）
    pub bind_form_field: Option<String>,
    /// 原始定义（原样保留，避免丢失未建模信息）
    pub raw: Value,
}

impl CustomFormField {
    fn from_value(v: &Value) -> Self {
        Self {
            // TODO(#1053)：字段名候选为常见命名，未经实测；`name` 在部分 schema 里可能是标题而非键名
            key: value_string(v, &["fieldName", "key", "prop", "fieldKey", "code", "name"]),
            label: value_string(
                v,
                &["title", "label", "fieldTitle", "showName", "fieldLabel"],
            ),
            field_type: value_string(
                v,
                &[
                    "fieldType",
                    "type",
                    "inputType",
                    "componentType",
                    "fieldTypeName",
                ],
            ),
            required: value_bool(v, &["required", "isRequired", "must", "needFill"]),
            default_value: v
                .get("defaultValue")
                .or_else(|| v.get("defaultVal"))
                .or_else(|| v.get("value"))
                .cloned(),
            options: v
                .get("options")
                .or_else(|| v.get("optionList"))
                .or_else(|| v.get("items"))
                .cloned(),
            placeholder: value_string(v, &["placeholder", "tip", "hint", "fieldTip"]),
            bind_form_field: value_string(
                v,
                &["bindFormField", "bindField", "bindFormFieldId", "bindKey"],
            ),
            raw: v.clone(),
        }
    }
}

/// 已知的「字段数组」外层键名（不同版本 schema 可能不同）
const FORM_FIELD_LIST_KEYS: [&str; 6] = [
    "fields",
    "formFieldList",
    "fieldList",
    "config",
    "list",
    "items",
];

/// 从动态表单配置里提取字段列表（数组直接取；对象先找已知键，再退回首个对象数组）
fn extract_form_fields(value: &Value) -> Vec<CustomFormField> {
    match value {
        Value::Array(items) => items.iter().map(CustomFormField::from_value).collect(),
        Value::Object(map) => {
            for key in FORM_FIELD_LIST_KEYS {
                if let Some(Value::Array(items)) = map.get(key) {
                    return items.iter().map(CustomFormField::from_value).collect();
                }
            }
            for child in map.values() {
                if let Value::Array(items) = child {
                    if items.iter().any(|i| i.is_object()) {
                        return items.iter().map(CustomFormField::from_value).collect();
                    }
                }
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

// ── 凭证上下文 ──

/// 一次业务调用所需的凭证上下文（**短时效，禁止缓存**）。
#[derive(Debug, Clone)]
pub(crate) struct ReserveContext {
    app: LibraryApp,
    /// 图书馆 fid 加密串
    fid_enc: String,
    /// 预约项 ID 明文（24727 / 24679）
    reserve_id: String,
    /// 预约项 ID 加密串（短时效，可能缺失）
    reserve_id_enc: Option<String>,
    /// 应用 ID（实测与 `reserveId` 同值）
    resv_app_id: String,
}

impl ReserveContext {
    /// 从入口解析结果构造（顺带校验应用属于本模块）
    fn from_entry(app: LibraryApp, entry: &LibraryAppEntry) -> Result<Self, LibraryReserveError> {
        ensure_pc_app(app)?;

        let fid_enc = non_empty(entry.credentials.fid_enc.as_deref()).ok_or_else(|| {
            LibraryReserveError::unexpected(
                format!("入口未返回 fidEnc，无法调用「{}」业务接口", app.name()),
                &entry.redirect_chain,
            )
        })?;

        let (_, business_value) = app.business_id();
        let reserve_id = non_empty(entry.credentials.reserve_id.as_deref())
            .unwrap_or_else(|| business_value.to_string());
        // 入口链路**不含** reserveIdEnc（实测：该参数由落地页 HTML 服务端注入），
        // 缺失时由 resolve_context 补抓一次落地页；此处先保留 Option。
        let reserve_id_enc = non_empty(entry.credentials.reserve_id_enc.as_deref());
        let reserve_id_live = reserve_id.clone();

        Ok(Self {
            app,
            fid_enc,
            reserve_id,
            reserve_id_enc,
            // TODO(#1053)：resvAppId 实测与 reserveId 同值（24727 / 24679）；
            // 此处跟随实时解析出的 reserveId，若二者在其它配置下确为独立 ID，需改为单独取值。
            resv_app_id: reserve_id_live,
        })
    }

    /// 预约凭证（`reserveIdEnc`）**必需**：缺失时报 [`LibraryReserveError::credential_invalid`]。
    ///
    /// 实测：缺 `reserveIdEnc` 时超星返回
    /// `{"msg":"未查询到您所访问的应用…","success":false}`，旧实现会把它误判为
    /// `no_permission`。因此需要该参数的接口**必须在发请求前显式校验**，
    /// 绝不能「缺参数照常请求、再被打成无权限」。
    fn require_reserve_id_enc(&self) -> Result<&str, LibraryReserveError> {
        self.reserve_id_enc.as_deref().ok_or_else(|| {
            LibraryReserveError::credential_invalid(format!(
                "未取得预约凭证 reserveIdEnc（app={}，入口链路与落地页均未提供），无法调用该接口；\
                 请重试或重新登录融合门户",
                self.app.key()
            ))
        })
    }

    /// 基础参数：`reserveId` / `resvAppId` / `reserveIdEnc?` / `fidEnc`
    fn base_params(&self) -> BTreeMap<String, String> {
        let mut p = BTreeMap::new();
        p.insert("reserveId".into(), self.reserve_id.clone());
        p.insert("resvAppId".into(), self.resv_app_id.clone());
        if let Some(enc) = &self.reserve_id_enc {
            p.insert("reserveIdEnc".into(), enc.clone());
        }
        p.insert("fidEnc".into(), self.fid_enc.clone());
        p
    }

    /// 仅需 `reserveId` + `fidEnc` 的辅助接口（view/flag、open/team、team/list）
    fn simple_params(&self) -> BTreeMap<String, String> {
        let mut p = BTreeMap::new();
        p.insert("reserveId".into(), self.reserve_id.clone());
        p.insert("fidEnc".into(), self.fid_enc.clone());
        p
    }
}

/// 座位预约走 seatengine，不属于本模块（reservepc）
fn ensure_pc_app(app: LibraryApp) -> Result<(), LibraryReserveError> {
    if matches!(app, LibraryApp::Seat) {
        return Err(LibraryReserveError::invalid_app(
            "座位预约使用 seatengine 接口体系，不属于本模块（reservepc）；请调用座位预约相关命令",
        ));
    }
    Ok(())
}

/// 解析应用 → 入口 → 业务上下文（每次调用都实时解析，不复用旧凭证）。
///
/// `reserveIdEnc` 不在入口跳转链上（实测由落地页 HTML 服务端注入），缺失时会补抓一次落地页；
/// 仍取不到则由需要该参数的接口通过 [`ReserveContext::require_reserve_id_enc`] 报
/// [`LibraryReserveError::credential_invalid`]。
async fn resolve_context(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<ReserveContext, LibraryReserveError> {
    let entry = library_reserve::resolve_entry(client, app, force).await?;
    let mut ctx = ReserveContext::from_entry(app, &entry)?;

    if ctx.reserve_id_enc.is_none() {
        match library_reserve::fetch_page_injected(
            client,
            &entry,
            &[library_reserve::PAGE_KEY_RESERVE_ID_ENC],
        )
        .await
        {
            Ok(hints) => {
                ctx.reserve_id_enc = hints
                    .get(library_reserve::PAGE_KEY_RESERVE_ID_ENC)
                    .map(str::to_string);
            }
            // 落地页抓取失败不在此处阻断：需要该参数的接口会统一报「凭证未取到」，
            // 不需要该参数的辅助接口（view/flag、open/team、team/list、person/role）仍可用。
            Err(err) => crate::runtime_log::log_warn(
                "LibraryReservePc",
                format!(
                    "从落地页提取 reserveIdEnc 失败（需要该参数的接口将报凭证未取到）：{}",
                    err.message
                ),
            ),
        }
    }

    if ctx.reserve_id_enc.is_none() {
        crate::runtime_log::log_warn(
            "LibraryReservePc",
            format!(
                "未取得 reserveIdEnc（app={}）；入口链路与落地页均未提供",
                app.key()
            ),
        );
    }

    crate::runtime_log::log_info(
        "LibraryReservePc",
        format!(
            "业务上下文就绪 app={} reserveId={} 有 reserveIdEnc={}",
            ctx.app.key(),
            ctx.reserve_id,
            ctx.reserve_id_enc.is_some()
        ),
    );
    Ok(ctx)
}

// ── 响应模型 ──

/// 预约项详情（`/reserve/info` → `data.reserveData`）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveItemInfo {
    pub id: Option<i64>,
    pub dept_id: Option<i64>,
    pub name: Option<String>,
    /// 可提前预约天数
    pub advance_days: Option<i64>,
    /// 放号时间（HH:mm）
    pub advance_time: Option<String>,
    /// 是否开启单次时长限制
    pub duration_limit_open: Option<i64>,
    /// 单次最长时长（分钟）
    pub duration_limit_min: Option<i64>,
    /// 是否需要弹确认框
    pub confirm_dialog: Option<i64>,
    pub dialog_title: Option<String>,
    pub dialog_content: Option<String>,
    /// 是否允许同时段重复预约
    pub allow_reserve_same_time: Option<i64>,
    /// 是否允许预约当前时段
    pub allow_reserve_now_time: Option<i64>,
    /// 取消限制（-1 表示不限）
    pub cancel_limit: Option<f64>,
    pub cycle_type: Option<i64>,
    /// 原始响应（保留未建模字段）
    pub raw: Value,
}

impl ReserveItemInfo {
    fn from_value(v: &Value) -> Self {
        Self {
            id: value_i64(v, &["id"]),
            dept_id: value_i64(v, &["deptId"]),
            name: value_string(v, &["name", "reserveName"]),
            advance_days: value_i64(v, &["advanceDays"]),
            advance_time: value_string(v, &["advanceTime"]),
            duration_limit_open: value_i64(v, &["durationLimitOpen"]),
            duration_limit_min: value_i64(v, &["durationLimitMin"]),
            confirm_dialog: value_i64(v, &["confirmDialog"]),
            dialog_title: value_string(v, &["dialogTitle"]),
            dialog_content: value_string(v, &["dialogContent"]),
            allow_reserve_same_time: value_i64(v, &["allowReserveSameTime"]),
            allow_reserve_now_time: value_i64(v, &["allowReserveNowTime"]),
            cancel_limit: value_f64(v, &["cancelLimit"]),
            cycle_type: value_i64(v, &["cycleType"]),
            raw: v.clone(),
        }
    }
}

/// 可预约时段条目。
///
/// ⚠️ TODO(#1053)：除 `advanceDays` / `aprvId` / `customFormConfig` 外，
/// 其余字段名取自常见命名，**未经实测**；`raw` 原样保留供前端兜底渲染。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveTimeItem {
    pub aprv_id: Option<i64>,
    pub advance_days: Option<i64>,
    pub item_id: Option<i64>,
    pub item_name: Option<String>,
    pub date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub status: Option<i64>,
    pub capacity: Option<i64>,
    pub remaining: Option<i64>,
    /// 动态表单定义（提交预约需按此渲染并回填）
    pub custom_form_config: Option<CustomFormConfig>,
    pub raw: Value,
}

impl ReserveTimeItem {
    fn from_value(v: &Value) -> Self {
        Self {
            aprv_id: value_i64(v, &["aprvId"]),
            advance_days: value_i64(v, &["advanceDays"]),
            item_id: value_i64(v, &["id", "itemId", "reserveItemId", "reserveId"]),
            item_name: value_string(v, &["name", "itemName", "reserveItemName", "roomName"]),
            date: value_string(v, &["date", "reserveDate", "day", "startDate"]),
            start_time: value_string(v, &["startTime", "beginTime"]),
            end_time: value_string(v, &["endTime", "finishTime"]),
            status: value_i64(v, &["status", "itemStatus", "state"]),
            capacity: value_i64(v, &["capacity", "total", "maxNum", "num"]),
            remaining: value_i64(
                v,
                &["remaining", "surplus", "leftNum", "remainNum", "restNum"],
            ),
            custom_form_config: CustomFormConfig::of(v),
            raw: v.clone(),
        }
    }
}

/// 房间（可预约项）的归一化视图（`reserve/item/list/time` **不传时间窗口**时的实测字段）。
///
/// 实测（2026-10-16）：该端点实为「房间列表 + 可选时间筛选」——
/// `startTime` / `endTime` 留空时返回全部房间（1~5 号静音仓），每个房间自带
/// `reserveIntervalList`（**按星期几**的可用时段）；传日期窗口时服务端按该窗口过滤
/// （实测返回 0 条，**不能**用来取「某天的时段」，故不能靠它按天筛选）。
///
/// 实测字段：`reserveIntervalList` / `reserveInterval`（当天）/ `rangestime` / `rangeetime`
/// （当日毫秒偏移，实测 0 / 36000000 → 08:00 / 18:00）/ `timeUnit` / `advanceDays` /
/// `minUserNum` / `maxUserNum` / `formId` / `customFormConfig`。
/// 未建模字段（如 `customFormConfig`、`reserveInterval`）由 `raw` 原样保留。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveRoomItem {
    /// 房间 / 预约项 ID
    pub item_id: Option<i64>,
    /// 房间名（实测如「1号静音仓」）
    pub name: Option<String>,
    /// 最少使用人数（实测 1）
    pub min_user_num: Option<i64>,
    /// 最多使用人数（实测 20）
    pub max_user_num: Option<i64>,
    /// 动态表单 ID（实测 `formId`）
    pub form_id: Option<i64>,
    /// 可提前预约天数（实测 14）
    pub advance_days: Option<i64>,
    /// 时间粒度（分钟；实测 0，前端按预约项配置兜底）
    pub time_unit: Option<i64>,
    /// 当日可选起始毫秒偏移（实测 `rangestime`，0 → 08:00）
    pub range_start_ms: Option<i64>,
    /// 当日可选结束毫秒偏移（实测 `rangeetime`，36000000 → 18:00）
    pub range_end_ms: Option<i64>,
    /// 按星期几的可用时段（实测 `reserveIntervalList`）
    pub intervals: Vec<ReserveInterval>,
    /// 原始房间条目（`customFormConfig` 等未建模字段原样保留）
    pub raw: Value,
}

impl ReserveRoomItem {
    fn from_value(v: &Value) -> Self {
        Self {
            item_id: value_i64(v, &["id", "itemId", "reserveItemId", "reserveId"]),
            name: value_string(v, &["name", "itemName", "reserveItemName", "roomName"]),
            min_user_num: value_i64(v, &["minUserNum"]),
            max_user_num: value_i64(v, &["maxUserNum"]),
            form_id: value_i64(v, &["formId", "formid"]),
            advance_days: value_i64(v, &["advanceDays"]),
            time_unit: value_i64(v, &["timeUnit"]),
            // 实测键名为全小写 `rangestime` / `rangeetime`（非驼峰）
            range_start_ms: value_i64(v, &["rangestime", "rangeStartTime", "rangeStartMs"]),
            range_end_ms: value_i64(v, &["rangeetime", "rangeEndTime", "rangeEndMs"]),
            intervals: intervals_of(v),
            raw: v.clone(),
        }
    }
}

/// 按星期几的单个可用时段（`reserveIntervalList` 元素，实测契约）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveInterval {
    /// 星期几（1=周一 … 7=周日）
    pub week: Option<i64>,
    /// 是否可用（实测 1 可用 / 0 不可用）
    pub available: Option<i64>,
    /// 开始时间 `HH:mm`（实测 `08:00`）
    pub start_time: Option<String>,
    /// 结束时间 `HH:mm`（实测 `21:30`）
    pub end_time: Option<String>,
}

impl ReserveInterval {
    fn from_value(v: &Value) -> Self {
        Self {
            week: value_i64(v, &["week", "weekDay", "day"]),
            available: value_i64(v, &["available", "isAvailable", "status"]),
            start_time: value_string(v, &["startTime", "start"]),
            end_time: value_string(v, &["endTime", "end"]),
        }
    }
}

/// 从房间条目取 `reserveIntervalList`（缺失 / 非数组 → 空列表，不 panic）
fn intervals_of(v: &Value) -> Vec<ReserveInterval> {
    v.get("reserveIntervalList")
        .or_else(|| v.get("reserveIntervals"))
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().map(ReserveInterval::from_value).collect())
        .unwrap_or_default()
}

/// 可预约时段列表响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveTimeList {
    /// 归一化条目（按是否传入时间窗口区分，见 [`ReserveTimeListItems`]）
    pub items: ReserveTimeListItems,
    /// 顶层 `advanceDays`（实测响应里与条目内同名字段并存）
    pub advance_days: Option<i64>,
    pub raw: Value,
}

/// `reserve/item/list/time` 的归一化条目：按**是否传入时间窗口**区分。
///
/// 两个变体都是数组，序列化后形态一致（`items: [...]`），前端按调用形态解析。
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub(crate) enum ReserveTimeListItems {
    /// 未传时间窗口：房间列表（含按星期几的可用时段）
    Rooms(Vec<ReserveRoomItem>),
    /// 传了时间窗口：既有的时段筛选条目
    Slots(Vec<ReserveTimeItem>),
}

/// 我的预约条目。
///
/// 字段映射按实测（2026-10-16，`reservepc/user/histroy` → `data.rows[]`）修正：
/// 真实字段为 `id / itemId / name / today / starttime / endtime / status / isCancel /
/// aprvId / reserveId / resvAppId / reserveDuration / remark`，
/// 其中 `starttime` / `endtime` 为 **Unix 毫秒**，`aprvId` 实测**恒为 0**。
/// 这里把毫秒转成可读 `HH:mm`（同时保留毫秒原值），并原样保留 `raw` 兜底。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MyReservation {
    /// 预约记录 ID（实测 `id`）
    pub id: Option<i64>,
    /// 预约项 ID（实测 `itemId`）
    pub item_id: Option<i64>,
    /// 审批 ID（实测 `aprvId`，**恒为 0**；疑非取消接口主键，见 [`ENDPOINT_CANCEL`]）
    pub aprv_id: Option<i64>,
    /// 状态码（实测数字，如 `2`）
    pub status: Option<i64>,
    /// 状态文案（服务端可能不返回；未建模状态码时留空，由前端按 `status` 渲染）
    pub status_name: Option<String>,
    /// 是否已取消（实测 `isCancel`：0/1）
    pub is_cancel: Option<bool>,
    /// 预约项名（实测 `name`，如「4号静音仓」）
    pub item_name: Option<String>,
    /// 预约日期（实测 `today`，如 `2026-07-11`）
    pub date: Option<String>,
    /// 开始时间 `HH:mm`（由实测 Unix 毫秒 `starttime` 转换；无毫秒时回退字符串字段）
    pub start_time: Option<String>,
    /// 结束时间 `HH:mm`（由实测 Unix 毫秒 `endtime` 转换）
    pub end_time: Option<String>,
    /// 原始开始时间（Unix 毫秒，实测 `starttime`）
    pub start_time_ms: Option<i64>,
    /// 原始结束时间（Unix 毫秒，实测 `endtime`）
    pub end_time_ms: Option<i64>,
    /// 预约时长（实测 `reserveDuration`；单位未实测，原样透传）
    pub reserve_duration: Option<i64>,
    /// 备注（实测 `remark`）
    pub remark: Option<String>,
    /// 预约项 ID（实测 `reserveId`）
    pub reserve_id: Option<i64>,
    /// 应用 ID（实测 `resvAppId`）
    pub resv_app_id: Option<i64>,
    /// 动态表单定义（若条目内嵌；实测样本未出现，保留兜底）
    pub custom_form_config: Option<CustomFormConfig>,
    /// 原始条目
    pub raw: Value,
}

/// Unix 毫秒 → `HH:mm`（按**北京时间 UTC+8** 渲染）。
///
/// 理由：超星预约服务面向中国高校，使用固定 UTC+8 可保证结果与用户本机时区无关、可复现；
/// 实测样本 `1783760400000` 为 `2026-07-11T09:00:00Z`（= 北京时间 17:00）。
/// TODO(#1076)：若后续实测证明服务端把「本地墙钟」编码为 UTC（而非真 epoch），需调整换算。
fn ms_to_hhmm(ms: Option<i64>) -> Option<String> {
    let ms = ms?;
    let tz = chrono::FixedOffset::east_opt(8 * 3600)?;
    tz.timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.format("%H:%M").to_string())
}

impl MyReservation {
    fn from_value(v: &Value) -> Self {
        let start_time_ms = value_i64(v, &["starttime", "startTime", "beginTime"]);
        let end_time_ms = value_i64(v, &["endtime", "endTime", "finishTime"]);
        Self {
            id: value_i64(v, &["id"]),
            item_id: value_i64(v, &["itemId", "item_id"]),
            aprv_id: value_i64(v, &["aprvId"]),
            status: value_i64(v, &["status", "aprvStatus"]),
            status_name: value_string(v, &["statusName", "aprvStatusName", "statusText"]),
            is_cancel: value_bool(v, &["isCancel", "isCanceled", "canceled", "cancel"]),
            item_name: value_string(v, &["name", "itemName", "reserveName", "roomName"]),
            date: value_string(v, &["today", "date", "reserveDate", "day"]),
            start_time: ms_to_hhmm(start_time_ms)
                .or_else(|| value_string(v, &["startTime", "beginTime"])),
            end_time: ms_to_hhmm(end_time_ms)
                .or_else(|| value_string(v, &["endTime", "finishTime"])),
            start_time_ms,
            end_time_ms,
            reserve_duration: value_i64(v, &["reserveDuration"]),
            remark: value_string(v, &["remark", "remarks", "memo"]),
            reserve_id: value_i64(v, &["reserveId"]),
            resv_app_id: value_i64(v, &["resvAppId"]),
            custom_form_config: CustomFormConfig::of(v),
            raw: v.clone(),
        }
    }
}

/// 我的预约列表
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MyReservationList {
    pub items: Vec<MyReservation>,
    pub total: Option<i64>,
    pub raw: Value,
}

/// 用户视图标记（`data.showStyle`，实测为字符串 "0"）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserViewFlag {
    pub show_style: Option<String>,
    pub raw: Value,
}

/// 是否开放团队预约（`data.openTeam`）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenTeam {
    pub open_team: Option<bool>,
    pub raw: Value,
}

/// 人员角色（`data.roleListSelf[]`）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersonRole {
    pub alias: Option<String>,
    pub alias_name: Option<String>,
    pub role_id: Option<i64>,
    pub raw: Value,
}

impl PersonRole {
    fn from_value(v: &Value) -> Self {
        Self {
            alias: value_string(v, &["alias"]),
            alias_name: value_string(v, &["aliasName"]),
            role_id: value_i64(v, &["roleId"]),
            raw: v.clone(),
        }
    }
}

/// 提醒对话框（`/reserve/dialog`）
///
/// ⚠️ TODO(#1053)：该接口**响应结构未实测**（勘察只记录了 GET 参数形态），
/// 这里按常见命名做 best-effort 提取，并保留 `raw`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveDialog {
    pub agreed: Option<bool>,
    pub title: Option<String>,
    pub content: Option<String>,
    pub raw: Value,
}

/// 写操作结果（提交 / 取消共用）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveActionOutcome {
    /// 服务端成功提示语（可能为空）
    pub message: Option<String>,
    pub data: Value,
    pub raw: Value,
}

/// 提交预约请求
///
/// ⚠️ TODO(#1053)：**完整字段契约未实测**。已确认需携带
/// `formUserId` / `aprvId` / `aprvStatusTypeId` / `fidEnc` / `cycleType:0` / `ua:'pc'`
/// （来自 JS 静态提取），其余由 `form_data` / `extra` 透传，`customFormConfig` → 提交体的
/// 映射关系待补齐。
#[derive(Debug, Clone, Default)]
pub(crate) struct SubmitReserveRequest {
    pub aprv_id: Option<String>,
    pub aprv_status_type_id: Option<String>,
    pub form_user_id: Option<String>,
    /// 默认 0
    pub cycle_type: Option<i64>,
    /// 动态表单字段（按 `customFormConfig` 渲染后回填）
    pub form_data: BTreeMap<String, String>,
    /// 其它透传参数（契约补齐前的逃生口）
    pub extra: BTreeMap<String, String>,
}

/// 取消预约请求（**契约已实测**，2026-10-19）。
///
/// 官方页面调用：
/// ```js
/// doRequest('data/apps/reserve/item/user/cancel', { id: e.id, allCancel: allCancel }, true)
/// ```
/// 其中 `e.id` 是「我的预约」条目的 `id`（实测如 `30035270`）；`aprvId` 恒为 0，**不能作主键**。
/// 已实测：带 `{id, allCancel}` 调用返回 `{"success":true,...}`，记录随即变为已取消。
#[derive(Debug, Clone, Default)]
pub(crate) struct CancelReserveRequest {
    /// 预约记录 ID（`reservepc/user/histroy` 条目的 `id`）
    pub id: String,
    /// 是否同时取消同组成员（`teamLeaderCancel` 场景；默认 false）
    pub all_cancel: bool,
}

/// 提交 / 取消体里由本模块统一注入、**不允许调用方覆盖**的键
/// （防越权改写身份 / 凭证 / 取消目标）。
///
/// ⚠️ 这些键都在 [`merge_form_fields`] **之前**注入：若漏在此列，`form_data` / `extra`
/// 会**静默覆盖**显式请求字段 —— 例如 `extra.formUserId` 改写身份、
/// `extra.aprvId` 改写取消目标（可能取消掉别人的预约）、
/// `extra.aprvStatusTypeId` 改写审批状态类型。
const PROTECTED_FORM_KEYS: [&str; 9] = [
    "reserveId",
    "reserveIdEnc",
    "resvAppId",
    "fidEnc",
    "ua",
    "cycleType",
    "aprvId",
    "aprvStatusTypeId",
    "formUserId",
];

/// 合并调用方透传字段，保护键与空键名一律忽略
fn merge_form_fields(target: &mut BTreeMap<String, String>, extra: &BTreeMap<String, String>) {
    for (k, v) in extra {
        if k.trim().is_empty() {
            continue;
        }
        if PROTECTED_FORM_KEYS
            .iter()
            .any(|p| p.eq_ignore_ascii_case(k.trim()))
        {
            continue;
        }
        target.insert(k.clone(), v.clone());
    }
}

/// 提交体：基础参数 + `ua=pc` + `cycleType` + 已知字段 + 透传字段
fn submit_params(ctx: &ReserveContext, req: &SubmitReserveRequest) -> BTreeMap<String, String> {
    let mut p = ctx.base_params();
    p.insert("ua".into(), "pc".into());
    p.insert("cycleType".into(), req.cycle_type.unwrap_or(0).to_string());
    if let Some(v) = non_empty(req.aprv_id.as_deref()) {
        p.insert("aprvId".into(), v);
    }
    if let Some(v) = non_empty(req.aprv_status_type_id.as_deref()) {
        p.insert("aprvStatusTypeId".into(), v);
    }
    if let Some(v) = non_empty(req.form_user_id.as_deref()) {
        p.insert("formUserId".into(), v);
    }
    // 动态表单字段：映射关系未经实测（TODO(#1053)），只做原样透传 + 保护键防覆盖
    merge_form_fields(&mut p, &req.form_data);
    merge_form_fields(&mut p, &req.extra);
    p
}

/// 取消体：基础参数 + `ua=pc` + `id` + `allCancel`（实测契约）。
fn cancel_params(ctx: &ReserveContext, req: &CancelReserveRequest) -> BTreeMap<String, String> {
    let mut p = ctx.base_params();
    p.insert("ua".into(), "pc".into());
    p.insert("id".into(), req.id.trim().to_string());
    p.insert(
        "allCancel".into(),
        if req.all_cancel { "1" } else { "0" }.into(),
    );
    p
}

/// 时段列表请求体（与实测契约逐字段对齐）。
///
/// 实测 body（2026-10-16）：
/// `sw=''` + `reserveId` + `resvAppId` + `sortIds=''` + `startTime` + `endTime` +
/// `reserveIdEnc` + `fidEnc`。
/// `startTime` / `endTime` 留空 = 取**房间列表**（含按星期几的可用时段）；
/// 传日期窗口 = 服务端按窗口筛选（实测窗口内通常 0 条）。
fn time_list_params(
    ctx: &ReserveContext,
    start_time: Option<&str>,
    end_time: Option<&str>,
) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    // `sw` / `sortIds` 实测均为空串（含义未验证），保持原样以复现契约
    p.insert("sw".into(), String::new());
    p.insert("reserveId".into(), ctx.reserve_id.clone());
    p.insert("resvAppId".into(), ctx.resv_app_id.clone());
    p.insert("sortIds".into(), String::new());
    p.insert(
        "startTime".into(),
        start_time.unwrap_or("").trim().to_string(),
    );
    p.insert("endTime".into(), end_time.unwrap_or("").trim().to_string());
    if let Some(enc) = &ctx.reserve_id_enc {
        p.insert("reserveIdEnc".into(), enc.clone());
    }
    p.insert("fidEnc".into(), ctx.fid_enc.clone());
    p
}

/// 详情请求体（实测：reserveId + reserveIdEnc + fidEnc）
fn info_params(ctx: &ReserveContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("reserveId".into(), ctx.reserve_id.clone());
    if let Some(enc) = &ctx.reserve_id_enc {
        p.insert("reserveIdEnc".into(), enc.clone());
    }
    p.insert("fidEnc".into(), ctx.fid_enc.clone());
    p
}

/// 角色请求体（实测：仅 fidEnc）
fn role_params(ctx: &ReserveContext) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("fidEnc".into(), ctx.fid_enc.clone());
    p
}

/// 提醒对话框请求体（实测：reserveId + fidEnc + dialogAgreeStatus）
fn dialog_params(ctx: &ReserveContext, agreed: bool) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("reserveId".into(), ctx.reserve_id.clone());
    p.insert("fidEnc".into(), ctx.fid_enc.clone());
    p.insert("dialogAgreeStatus".into(), agreed.to_string());
    p
}

/// 列表型响应的常见外层键名
const LIST_KEYS: [&str; 9] = [
    "reserveList",
    "reserveDataList",
    "list",
    "rows",
    "dataList",
    "records",
    "items",
    "reserveItemList",
    "data",
];

/// 从响应 data 中提取列表（数组直接返回；对象按常见键名兜底）
fn extract_list(data: &Value) -> Vec<Value> {
    if let Value::Array(items) = data {
        return items.clone();
    }
    for key in LIST_KEYS {
        if let Some(Value::Array(items)) = data.get(key) {
            return items.clone();
        }
    }
    Vec::new()
}

/// 房间（可预约项）列表的候选外层键名。
///
/// 实测**未记录** `reserve/item/list/time` 响应里房间数组所在的键名，故按常见键名
/// 依次尝试（`reserveItemList` 优先，与既有实现一致），并兼容 `data` 本身即数组、
/// 以及「首个对象数组值」的兜底形态。
const ROOM_LIST_KEYS: [&str; 10] = [
    "reserveItemList",
    "reserveList",
    "rooms",
    "roomList",
    "rows",
    "list",
    "dataList",
    "records",
    "items",
    "data",
];

/// 从响应 data 中提取房间数组（宽松，缺失 → 空列表，不 panic）
fn room_items_of(data: &Value) -> Vec<Value> {
    if let Value::Array(items) = data {
        return items.clone();
    }
    for key in ROOM_LIST_KEYS {
        if let Some(Value::Array(items)) = data.get(key) {
            return items.clone();
        }
    }
    // 兜底：第一个「含对象元素」的数组值
    if let Value::Object(map) = data {
        for child in map.values() {
            if let Value::Array(items) = child {
                if items.iter().any(|i| i.is_object()) {
                    return items.clone();
                }
            }
        }
    }
    Vec::new()
}

// ── 业务接口：查询 ──

/// 预约项详情（约束字段：`advanceDays` / `durationLimitMin` / `dialogTitle` 等）
pub(crate) async fn fetch_item_info(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<ReserveItemInfo, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    // 缺 reserveIdEnc 时明确报「凭证未取到」，绝不带缺失参数发请求（否则会被误判为无权限）
    ctx.require_reserve_id_enc()?;
    let value = post_form(client, ENDPOINT_ITEM_INFO, &info_params(&ctx)).await?;
    let data = api_data(&value, "获取预约项详情")?;
    let reserve_data = data.get("reserveData").cloned().unwrap_or(Value::Null);
    Ok(ReserveItemInfo::from_value(&reserve_data))
}

/// 可预约时段 / 房间列表（核心；含 `customFormConfig` 动态表单定义）。
///
/// 实测（2026-10-16）语义修正：该端点实为「**房间列表 + 可选时间筛选**」——
/// - **未传** `start_time` / `end_time`（或传空串）→ 取**房间列表**：每个房间自带
///   `reserveIntervalList`（按星期几的可用时段），归一化为 [`ReserveRoomItem`]；
/// - **传了**时间窗口 → 服务端按窗口过滤，保持既有「时段筛选」语义
///   （归一化为 [`ReserveTimeItem`]；实测窗口内通常 0 条）。
pub(crate) async fn fetch_time_list(
    client: &mut HbutClient,
    app: LibraryApp,
    start_time: Option<&str>,
    end_time: Option<&str>,
    force: bool,
) -> Result<ReserveTimeList, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    ctx.require_reserve_id_enc()?;
    // 空串等同未提供（前端可能下发 ""），统一按「无时间窗口」处理
    let has_window = non_empty(start_time).is_some() || non_empty(end_time).is_some();
    let params = time_list_params(&ctx, start_time, end_time);
    let value = post_form(client, ENDPOINT_TIME_LIST, &params).await?;
    let data = api_data(&value, "获取可预约时段")?;
    let raw_items = room_items_of(&data);
    let items = if has_window {
        ReserveTimeListItems::Slots(raw_items.iter().map(ReserveTimeItem::from_value).collect())
    } else {
        ReserveTimeListItems::Rooms(raw_items.iter().map(ReserveRoomItem::from_value).collect())
    };
    Ok(ReserveTimeList {
        items,
        advance_days: value_i64(&data, &["advanceDays"]),
        raw: data,
    })
}

/// 预约对象的一个可预约时段（`reserve/item/setting` → `commonIntervalMap` 元素）。
///
/// 实测字段：`id / startTime / endTime / week / available / userNum / intervalBetweenId`。
/// 提交 `reserve/multiple/submit` 时，`reserveUsers[].intervalIds` 就是这里的 `id` 集合。
///
/// ⚠️ `available` 只是**配置层**「该时段是否开放」，**不是**实时占用（#1080 的根因）；
/// 实时占用必须另查 [`ENDPOINT_ITEM_USER_LIST`]，判定规则见 [`ItemOccupancy`]。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemSettingInterval {
    /// 时段 ID（提交 `intervalIds` 用）
    pub id: i64,
    /// 星期几（1=周一 … 7=周日；取条目 `week`，缺失时回落到 map 的键）
    pub week: Option<i64>,
    /// 开始 `HH:mm`
    pub start_time: String,
    /// 结束 `HH:mm`
    pub end_time: String,
    /// 该时段是否开放（`available != 0`；缺失按开放处理）
    pub available: bool,
    /// 该时段**容量**（服务端 `userNum`；官方页面判定「已满」用 `userNum <= 已占用份数`）
    pub user_num: i64,
}

/// `reserve/item/setting` 的归一化结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemSetting {
    /// 全部星期的时段（按 `week`、`startTime` 排序）
    pub intervals: Vec<ItemSettingInterval>,
    pub raw: Value,
}

/// 解析 `commonIntervalMap`（7 个键 × 时段数组），缺失 / 形态异常时返回空列表。
fn item_setting_of(data: &Value) -> ItemSetting {
    let mut intervals = Vec::new();
    if let Some(map) = data.get("commonIntervalMap").and_then(|v| v.as_object()) {
        for (week_key, list) in map {
            let week_from_key = week_key.parse::<i64>().ok();
            let Some(arr) = list.as_array() else { continue };
            for entry in arr {
                let Some(id) = value_i64(entry, &["id"]) else {
                    continue;
                };
                intervals.push(ItemSettingInterval {
                    id,
                    week: value_i64(entry, &["week", "weekDay"]).or(week_from_key),
                    start_time: value_string(entry, &["startTime", "start"]).unwrap_or_default(),
                    end_time: value_string(entry, &["endTime", "end"]).unwrap_or_default(),
                    // 缺失 available 时按开放处理（交由服务端最终裁决）
                    available: value_i64(entry, &["available", "isAvailable"]).unwrap_or(1) != 0,
                    // 容量：官方页面按 `userNum <= 已占用` 判「已满」；缺失按 1（一次一人）处理
                    user_num: value_i64(entry, &["userNum", "user_num", "capacity"])
                        .filter(|n| *n > 0)
                        .unwrap_or(1),
                });
            }
        }
    }
    intervals.sort_by(|a, b| (a.week, a.start_time.as_str()).cmp(&(b.week, b.start_time.as_str())));
    ItemSetting {
        intervals,
        raw: data.clone(),
    }
}

/// 预约对象时段设置（`reserve/item/setting`）：拿到**真实时段 ID**，供提交组装 `intervalIds`。
///
/// 实测 body 只需 `reserveId` / `itemId` / `fidEnc`（不需要 `reserveIdEnc`）。
pub(crate) async fn fetch_item_setting(
    client: &mut HbutClient,
    app: LibraryApp,
    item_id: i64,
    force: bool,
) -> Result<ItemSetting, LibraryReserveError> {
    if item_id <= 0 {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            "获取时段设置需要有效的 itemId",
        ));
    }
    let ctx = resolve_context(client, app, force).await?;
    let mut params = BTreeMap::new();
    params.insert("reserveId".into(), ctx.reserve_id.clone());
    params.insert("itemId".into(), item_id.to_string());
    params.insert("fidEnc".into(), ctx.fid_enc.clone());
    let value = post_form(client, ENDPOINT_ITEM_SETTING, &params).await?;
    let data = api_data(&value, "获取预约对象时段设置")?;
    Ok(item_setting_of(&data))
}

// ── 实时占用（#1080：`reserve/item/user/list`） ──

/// 一条**实时占用记录**（`reserve/item/user/list` → `data.reserveUserList[]` 元素）。
///
/// 实测样本（2026-10-19，静音仓 1 号 49091）：
///
/// ```json
/// {"aprvId":0,"deptId":25285,"endtime":1792503000000,"id":30031777,"itemId":49091,
///  "remark":"学习","reserveId":24727,"reserveIntervalId":2035215,"reserveNum":1,
///  "starttime":1792490400000,"teamLeaderCancel":0,"today":"2026-10-20",
///  "uid":360838955,"uname":"廖宏伟"}
/// ```
///
/// ⚠️ 同一笔跨多时段的预约会**重复出现多条**（`id` 相同、`reserveIntervalId` 不同），
/// 因此占用必须按 `intervalId + date` **聚合**（官方页面即如此：`userCount += reserveNum`）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemOccupancyRecord {
    /// 预约记录 ID（同一笔预约的多条记录共用）
    pub id: Option<i64>,
    /// 时段 ID（= `commonIntervalMap[].id`；官方页面的聚合键）
    pub interval_id: i64,
    /// 预约日期 `YYYY-MM-DD`（服务端 `today`；缺失时由 `starttime` 按北京时间换算）
    pub date: Option<String>,
    /// 开始时间（Unix 毫秒，实测 `starttime`）
    pub start_time_ms: Option<i64>,
    /// 结束时间（Unix 毫秒，实测 `endtime`）
    pub end_time_ms: Option<i64>,
    /// 该记录占用的**份数**（实测 `reserveNum`；官方页面缺失时按 1 处理）
    pub reserve_num: i64,
    /// 预约人 uid（实测 `uid`；隐私模式下可能缺失）
    pub uid: Option<i64>,
    /// 预约人姓名（实测 `uname`；隐私模式下可能缺失）
    pub user_name: Option<String>,
    /// 备注（实测 `remark`）
    pub remark: Option<String>,
    /// 原始记录
    pub raw: Value,
}

/// `reserve/item/user/list` 的归一化结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ItemOccupancy {
    /// 实时占用记录（已按服务端原样展开，未聚合；聚合口径见 [`ItemOccupancyRecord`]）
    pub records: Vec<ItemOccupancyRecord>,
    /// 服务端当前时间（Unix 毫秒；来自 `reserve/special/rule`，取不到为 `None`）
    ///
    /// 前端用它判断「今天已过去的时段」；**缺失时前端不得自行推断**（宁可不置灰）。
    pub server_now_ms: Option<i64>,
    /// 无法归属到「时段 + 日期」的记录数
    ///
    /// 契约变更的哨兵：`> 0` 说明有记录缺少 `reserveIntervalId` / 日期，
    /// 占用统计**不完整** —— 调用方必须按「占用未知」降级（不得显示为可预约）。
    pub unkeyed: usize,
    /// 原始 `data`
    pub raw: Value,
}

/// 解析 `data.reserveUserList`（缺失 / 形态异常 → 空列表 + 未归属计数）。
fn occupancy_records_of(data: &Value) -> (Vec<ItemOccupancyRecord>, usize) {
    let Some(list) = data.get("reserveUserList").and_then(|v| v.as_array()) else {
        return (Vec::new(), 0);
    };
    let mut records = Vec::with_capacity(list.len());
    let mut unkeyed = 0usize;
    for entry in list {
        // `reserveIntervalId` 是聚合键；缺失则**无法**判断该笔占用落在哪个时段，
        // 计入 unkeyed 让调用方降级（绝不猜、绝不当成「无人预约」）。
        let Some(interval_id) = value_i64(entry, &["reserveIntervalId", "intervalId"]) else {
            unkeyed += 1;
            continue;
        };
        let start_time_ms = value_i64(entry, &["starttime", "startTime"]);
        let date =
            value_string(entry, &["today", "date"]).or_else(|| ms_to_date_key(start_time_ms));
        if date.is_none() {
            unkeyed += 1;
            continue;
        }
        records.push(ItemOccupancyRecord {
            id: value_i64(entry, &["id"]),
            interval_id,
            date,
            start_time_ms,
            end_time_ms: value_i64(entry, &["endtime", "endTime"]),
            // 官方页面：`if (!value.reserveNum) value.reserveNum = 1`
            reserve_num: value_i64(entry, &["reserveNum"])
                .filter(|n| *n > 0)
                .unwrap_or(1),
            uid: value_i64(entry, &["uid"]),
            user_name: value_string(entry, &["uname", "userName"]),
            remark: value_string(entry, &["remark"]),
            raw: entry.clone(),
        });
    }
    (records, unkeyed)
}

/// Unix 毫秒 → `YYYY-MM-DD`（按北京时间 UTC+8；非法 / 缺失 → `None`）
fn ms_to_date_key(ms: Option<i64>) -> Option<String> {
    let ms = ms?;
    let tz = chrono::FixedOffset::east_opt(8 * 3600)?;
    tz.timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

/// 校验并规范化 `YYYY-MM-DD` 日期（非法 → [`ERR_INVALID_PARAMS`]）
///
/// 服务端对该端点的日期参数**强校验**：缺失 / 空值时返回 HTTP 400 HTML 错误页
/// （实测 2026-10-19），因此必须在本地先拦住，给出可读错误。
fn normalize_date(raw: &str, field: &str) -> Result<String, LibraryReserveError> {
    let value = raw.trim();
    let parts: Vec<&str> = value.split('-').collect();
    let ok = parts.len() == 3
        && parts[0].len() == 4
        && parts[1].len() == 2
        && parts[2].len() == 2
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()));
    if !ok {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("占用查询参数 {field} 必须是 YYYY-MM-DD 日期（收到「{value}」）"),
        ));
    }
    Ok(value.to_string())
}

/// 占用查询请求体（**GET query**，与官方页面 `$.getJSON` 逐字段对齐）
fn occupancy_params(
    ctx: &ReserveContext,
    item_id: i64,
    start_date: &str,
    end_date: &str,
) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("reserveId".into(), ctx.reserve_id.clone());
    p.insert("itemId".into(), item_id.to_string());
    p.insert("fidEnc".into(), ctx.fid_enc.clone());
    p.insert("startTime".into(), start_date.to_string());
    p.insert("endTime".into(), end_date.to_string());
    p
}

/// 服务端时间请求体（实测：`reserveId` + `itemId`）
fn server_now_params(ctx: &ReserveContext, item_id: i64) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    p.insert("reserveId".into(), ctx.reserve_id.clone());
    p.insert("itemId".into(), item_id.to_string());
    p
}

/// 取服务端当前时间（Unix 毫秒）。**失败不阻断**占用查询：返回 `None` 并记警告，
/// 由前端按「无服务端时钟 → 不做时间置灰」处理（绝不拿本机时间当服务端时间）。
async fn fetch_server_now(client: &HbutClient, ctx: &ReserveContext, item_id: i64) -> Option<i64> {
    match post_form(
        client,
        ENDPOINT_SPECIAL_RULE,
        &server_now_params(ctx, item_id),
    )
    .await
    {
        Ok(value) => match api_data(&value, "获取服务端时间") {
            Ok(data) => value_i64(&data, &["serverNow"]),
            Err(err) => {
                crate::runtime_log::log_warn(
                    "LibraryReservePc",
                    format!("服务端时间解析失败（不阻断占用查询）：{}", err.message),
                );
                None
            }
        },
        Err(err) => {
            crate::runtime_log::log_warn(
                "LibraryReservePc",
                format!("服务端时间获取失败（不阻断占用查询）：{}", err.message),
            );
            None
        }
    }
}

/// 预约对象**实时占用**（`reserve/item/user/list` + 服务端时间 `reserve/special/rule`）。
///
/// 这是 #1080 的核心数据源：`reserve/item/setting` 的 `available` 只表示「该时段被配置开放」，
/// **别人已预约的时段在官方页面是灰色不可约**，本接口才是判定依据。
///
/// 官方页面判定（`reservepc/item` 内联 JS，实测原文）：
/// - 聚合：`key = reserveIntervalId + '_' + YYYY-MM-DD`，`userCount += reserveNum`；
/// - **已满**：`interval.userNum <= userCount` → 不可点；
/// - 自己已约（`uid === 本人`）→ 显示「已预约」而非可选；
/// - 已过去：`date === serverNow 日期` 且 `endTime <= serverNow` → 不可点。
pub(crate) async fn fetch_item_occupancy(
    client: &mut HbutClient,
    app: LibraryApp,
    item_id: i64,
    start_date: &str,
    end_date: &str,
    force: bool,
) -> Result<ItemOccupancy, LibraryReserveError> {
    if item_id <= 0 {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            "占用查询需要有效的 itemId",
        ));
    }
    let start = normalize_date(start_date, "startTime")?;
    let end = normalize_date(end_date, "endTime")?;
    if start > end {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            format!("占用查询日期区间非法：startTime={start} 晚于 endTime={end}"),
        ));
    }

    let ctx = resolve_context(client, app, force).await?;
    let params = occupancy_params(&ctx, item_id, &start, &end);
    let value = get_json(client, ENDPOINT_ITEM_USER_LIST, &params).await?;
    let data = api_data(&value, "获取预约占用情况")?;
    let (records, unkeyed) = occupancy_records_of(&data);
    if unkeyed > 0 {
        // 契约漂移哨兵：统计不完整 → 前端按「占用未知」降级（不得显示为可预约）
        crate::runtime_log::log_warn(
            "LibraryReservePc",
            format!("占用数据有 {unkeyed} 条无法归属到时段/日期，已按「占用未知」上报"),
        );
    }
    let server_now_ms = fetch_server_now(client, &ctx, item_id).await;
    Ok(ItemOccupancy {
        records,
        server_now_ms,
        unkeyed,
        raw: data,
    })
}

/// 我的预约列表（`reservepc/user/histroy`）。
///
/// 实测 body：`reserveId` / `resvAppId` / `reserveIdEnc` / `fidEnc`（即 [`ReserveContext::base_params`]）；
/// 响应 `data` 为 `{"totalRow":N,"totalPage":N,"rows":[…]}`，条目字段见 [`MyReservation`]。
pub(crate) async fn fetch_my_reservations(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<MyReservationList, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    ctx.require_reserve_id_enc()?;
    let value = post_form(client, ENDPOINT_MY_RESERVATIONS, &ctx.base_params()).await?;
    let data = api_data(&value, "获取我的预约")?;
    let items = extract_list(&data)
        .iter()
        .map(MyReservation::from_value)
        .collect();
    Ok(MyReservationList {
        items,
        // 实测分页字段为 totalRow（保留旧的常见键名兜底）
        total: value_i64(&data, &["totalRow", "total", "totalCount", "count"]),
        raw: data,
    })
}

/// 用户视图标记
pub(crate) async fn fetch_user_view_flag(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<UserViewFlag, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = post_form(client, ENDPOINT_USER_VIEW_FLAG, &ctx.simple_params()).await?;
    let data = api_data(&value, "获取用户视图标记")?;
    Ok(UserViewFlag {
        show_style: value_string(&data, &["showStyle"]),
        raw: data,
    })
}

/// 是否开放团队预约
pub(crate) async fn fetch_open_team(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<OpenTeam, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = post_form(client, ENDPOINT_OPEN_TEAM, &ctx.simple_params()).await?;
    let data = api_data(&value, "获取团队开放状态")?;
    Ok(OpenTeam {
        open_team: value_bool(&data, &["openTeam"]),
        raw: data,
    })
}

/// 团队列表（结构未实测，原样返回列表项）
pub(crate) async fn fetch_team_list(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<Vec<Value>, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = post_form(client, ENDPOINT_TEAM_LIST, &ctx.simple_params()).await?;
    let data = api_data(&value, "获取团队列表")?;
    Ok(extract_list(&data))
}

/// 人员角色（实测：`data.roleListSelf[]`）
pub(crate) async fn fetch_person_roles(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<Vec<PersonRole>, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = post_form(client, ENDPOINT_PERSON_ROLE, &role_params(&ctx)).await?;
    let data = api_data(&value, "获取人员角色")?;
    Ok(data
        .get("roleListSelf")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(PersonRole::from_value).collect())
        .unwrap_or_default())
}

/// 提醒对话框确认（GET）
pub(crate) async fn fetch_dialog(
    client: &mut HbutClient,
    app: LibraryApp,
    agreed: bool,
    force: bool,
) -> Result<ReserveDialog, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = get_json(client, ENDPOINT_DIALOG, &dialog_params(&ctx, agreed)).await?;
    let data = api_data(&value, "获取提醒对话框")?;
    Ok(ReserveDialog {
        agreed: value_bool(&data, &["dialogAgreeStatus", "agreeStatus", "agreed"]),
        title: value_string(&data, &["dialogTitle", "title"]),
        content: value_string(&data, &["dialogContent", "content"]),
        raw: data,
    })
}

// ── 业务接口：写操作 ──

/// 提交预约。
///
/// 业务失败（时段被占 / 超限 / 违约停用）返回对应业务 kind 的错误；
/// 网络失败返回 [`crate::modules::library_reserve::ERR_NETWORK_UNREACHABLE`]。
pub(crate) async fn submit_reservation(
    client: &mut HbutClient,
    app: LibraryApp,
    req: &SubmitReserveRequest,
    force: bool,
) -> Result<ReserveActionOutcome, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    ctx.require_reserve_id_enc()?;
    let params = submit_params(&ctx, req);
    let value = post_form(client, ENDPOINT_SUBMIT, &params).await?;
    // ⚠️ 写操作必须用 api_write_result（要求显式成功信号）：本端点契约未实测
    // （TODO(#1053)），服务端可能用 `{"msg":"该时段已被预约"}` / `{}` 等形态拒绝，
    // 宽松判定会把它当成成功 → 前端弹出成功样式 toast，属「假成功」。
    let outcome = api_write_result(&value, "提交预约")?;
    Ok(ReserveActionOutcome {
        message: outcome.message,
        data: outcome.data,
        raw: outcome.raw,
    })
}

/// 取消预约（**契约已实测**，2026-10-19）。
///
/// 端点：[`ENDPOINT_CANCEL`]；body 见 [`cancel_params`]（`id` + `allCancel`）。
/// 写操作同样要求显式成功信号（[`api_write_result`]），避免「假取消成功」。
pub(crate) async fn cancel_reservation(
    client: &mut HbutClient,
    app: LibraryApp,
    req: &CancelReserveRequest,
    force: bool,
) -> Result<ReserveActionOutcome, LibraryReserveError> {
    if req.id.trim().is_empty() {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            "取消预约需要记录 id（来自「我的预约」列表；aprvId 恒为 0，不能用）",
        ));
    }
    let ctx = resolve_context(client, app, force).await?;
    ctx.require_reserve_id_enc()?;
    let params = cancel_params(&ctx, req);
    let value = post_form(client, ENDPOINT_CANCEL, &params).await?;
    // 写操作必须要求显式成功信号，避免「假取消成功」
    let outcome = api_write_result(&value, "取消预约")?;
    Ok(ReserveActionOutcome {
        message: outcome.message,
        data: outcome.data,
        raw: outcome.raw,
    })
}

#[cfg(test)]
include!("library_reserve_pc_tests.rs");
