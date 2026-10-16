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
/// TODO(#1053)：契约文档只列出 `reserve/latest/data`（「最近预约数据」）这一条线索，
/// **未实测**其响应结构；此处按该路径实现，字段解析做了多形态兜底。补齐需在开放时段真实调用一次。
const ENDPOINT_MY_RESERVATIONS: &str = "reserve/latest/data";
/// 取消预约
///
/// TODO(#1053)：契约**未给出**取消接口的实测路径。此处采用 JS 静态提取到的
/// `reserve/del/form/aprv`（「删除表单审批」）作为最可能的候选，**未经实测**。
/// 若上线后取消失败，需重新勘察该路径与字段。
const ENDPOINT_CANCEL: &str = "reserve/del/form/aprv";

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

/// GET 并返回 JSON（仅 `reserve/dialog` 使用）
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
        let reserve_id_enc = non_empty(entry.credentials.reserve_id_enc.as_deref());
        let reserve_id_live = reserve_id.clone();
        if reserve_id_enc.is_none() {
            // 契约要求携带 reserveIdEnc；缺失时仍尝试请求（部分接口可能由会话推导），
            // 但记录告警，便于定位「接口莫名失败」的根因。
            crate::runtime_log::log_warn(
                "LibraryReservePc",
                format!(
                    "入口未返回 reserveIdEnc（app={}）；契约要求携带该参数，若业务接口失败需重新解析入口",
                    app.key()
                ),
            );
        }

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

/// 解析应用 → 入口 → 业务上下文（每次调用都实时解析，不复用旧凭证）
async fn resolve_context(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<ReserveContext, LibraryReserveError> {
    let entry = library_reserve::resolve_entry(client, app, force).await?;
    let ctx = ReserveContext::from_entry(app, &entry)?;
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

/// 可预约时段列表响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveTimeList {
    pub items: Vec<ReserveTimeItem>,
    /// 顶层 `advanceDays`（实测响应里与条目内同名字段并存）
    pub advance_days: Option<i64>,
    pub raw: Value,
}

/// 我的预约条目（字段名多为推测，见 `raw` 兜底）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MyReservation {
    pub aprv_id: Option<i64>,
    pub status: Option<i64>,
    pub status_name: Option<String>,
    pub item_name: Option<String>,
    pub date: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub create_time: Option<String>,
    pub custom_form_config: Option<CustomFormConfig>,
    pub raw: Value,
}

impl MyReservation {
    fn from_value(v: &Value) -> Self {
        Self {
            aprv_id: value_i64(v, &["aprvId", "id"]),
            status: value_i64(v, &["status", "aprvStatus"]),
            status_name: value_string(v, &["statusName", "aprvStatusName", "statusText"]),
            item_name: value_string(v, &["name", "itemName", "reserveName", "roomName"]),
            date: value_string(v, &["date", "reserveDate", "day"]),
            start_time: value_string(v, &["startTime", "beginTime"]),
            end_time: value_string(v, &["endTime", "finishTime"]),
            create_time: value_string(v, &["createTime", "createDate", "reserveTime"]),
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

/// 取消预约请求
#[derive(Debug, Clone, Default)]
pub(crate) struct CancelReserveRequest {
    /// 审批 / 预约记录 ID（来自「我的预约」列表）
    pub aprv_id: String,
    pub form_user_id: Option<String>,
    /// 其它透传参数
    pub extra: BTreeMap<String, String>,
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

/// 取消体：基础参数 + `ua=pc` + `aprvId` + 透传字段
fn cancel_params(ctx: &ReserveContext, req: &CancelReserveRequest) -> BTreeMap<String, String> {
    let mut p = ctx.base_params();
    p.insert("ua".into(), "pc".into());
    p.insert("aprvId".into(), req.aprv_id.trim().to_string());
    if let Some(v) = non_empty(req.form_user_id.as_deref()) {
        p.insert("formUserId".into(), v);
    }
    merge_form_fields(&mut p, &req.extra);
    p
}

/// 时段列表请求体（与实测契约逐字段对齐）
fn time_list_params(
    ctx: &ReserveContext,
    start_time: Option<&str>,
    end_time: Option<&str>,
) -> BTreeMap<String, String> {
    let mut p = BTreeMap::new();
    // `sw` 实测为空串（含义未验证），保持原样以复现契约
    p.insert("sw".into(), String::new());
    p.insert("reserveId".into(), ctx.reserve_id.clone());
    p.insert("resvAppId".into(), ctx.resv_app_id.clone());
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

// ── 业务接口：查询 ──

/// 预约项详情（约束字段：`advanceDays` / `durationLimitMin` / `dialogTitle` 等）
pub(crate) async fn fetch_item_info(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<ReserveItemInfo, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = post_form(client, ENDPOINT_ITEM_INFO, &info_params(&ctx)).await?;
    let data = api_data(&value, "获取预约项详情")?;
    let reserve_data = data.get("reserveData").cloned().unwrap_or(Value::Null);
    Ok(ReserveItemInfo::from_value(&reserve_data))
}

/// 可预约时段列表（核心；含 `customFormConfig` 动态表单定义）
pub(crate) async fn fetch_time_list(
    client: &mut HbutClient,
    app: LibraryApp,
    start_time: Option<&str>,
    end_time: Option<&str>,
    force: bool,
) -> Result<ReserveTimeList, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let params = time_list_params(&ctx, start_time, end_time);
    let value = post_form(client, ENDPOINT_TIME_LIST, &params).await?;
    let data = api_data(&value, "获取可预约时段")?;
    let items = data
        .get("reserveItemList")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().map(ReserveTimeItem::from_value).collect())
        .unwrap_or_default();
    Ok(ReserveTimeList {
        items,
        advance_days: value_i64(&data, &["advanceDays"]),
        raw: data,
    })
}

/// 我的预约列表
///
/// TODO(#1053)：端点与响应结构未实测，见 [`ENDPOINT_MY_RESERVATIONS`]。
pub(crate) async fn fetch_my_reservations(
    client: &mut HbutClient,
    app: LibraryApp,
    force: bool,
) -> Result<MyReservationList, LibraryReserveError> {
    let ctx = resolve_context(client, app, force).await?;
    let value = post_form(client, ENDPOINT_MY_RESERVATIONS, &ctx.simple_params()).await?;
    let data = api_data(&value, "获取我的预约")?;
    let items = extract_list(&data)
        .iter()
        .map(MyReservation::from_value)
        .collect();
    Ok(MyReservationList {
        items,
        total: value_i64(&data, &["total", "totalCount", "count"]),
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

/// 取消预约。
///
/// TODO(#1053)：端点（[`ENDPOINT_CANCEL`]）与完整字段契约均未实测。
pub(crate) async fn cancel_reservation(
    client: &mut HbutClient,
    app: LibraryApp,
    req: &CancelReserveRequest,
    force: bool,
) -> Result<ReserveActionOutcome, LibraryReserveError> {
    if req.aprv_id.trim().is_empty() {
        return Err(LibraryReserveError::business(
            ERR_INVALID_PARAMS,
            "取消预约需要 aprvId（可从「我的预约」列表获取）",
        ));
    }
    let ctx = resolve_context(client, app, force).await?;
    let params = cancel_params(&ctx, req);
    let value = post_form(client, ENDPOINT_CANCEL, &params).await?;
    // 同提交：端点契约未实测，必须要求显式成功信号，避免「假取消成功」
    let outcome = api_write_result(&value, "取消预约")?;
    Ok(ReserveActionOutcome {
        message: outcome.message,
        data: outcome.data,
        raw: outcome.raw,
    })
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
        fid_enc: Option<&str>,
        reserve_id_enc: Option<&str>,
    ) -> LibraryAppEntry {
        let (business_key, business_value) = app.business_id();
        LibraryAppEntry {
            app: app.key().to_string(),
            app_name: app.name().to_string(),
            m_app_id: app.m_app_id().to_string(),
            entry_url:
                "https://reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24727"
                    .to_string(),
            system_base: "https://reserve.chaoxing.com".to_string(),
            system_path: app.system_path().to_string(),
            api_base: RESERVE_API_BASE.to_string(),
            business_key: business_key.to_string(),
            business_value: business_value.to_string(),
            credentials: LibraryReserveCredentials {
                fid_enc: fid_enc.map(str::to_string),
                reserve_id_enc: reserve_id_enc.map(str::to_string),
                reserve_id: Some(business_value.to_string()),
                ..Default::default()
            },
            params: BTreeMap::new(),
            contract_match: true,
            redirect_chain: Vec::new(),
            resolved_at_ms: 0,
            hint: String::new(),
        }
    }

    // ── 上下文与保护 ──

    #[test]
    fn context_extracts_credentials_and_rejects_seat() {
        let entry = make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC"));
        let ctx = ReserveContext::from_entry(LibraryApp::QuietRoom, &entry).expect("可构造");
        assert_eq!(ctx.fid_enc, "FID");
        assert_eq!(ctx.reserve_id, "24727");
        assert_eq!(ctx.reserve_id_enc.as_deref(), Some("ENC"));
        assert_eq!(ctx.resv_app_id, "24727");

        // 座位预约不属于本模块（reservepc）
        let seat = make_entry(LibraryApp::Seat, Some("FID"), None);
        let err = ReserveContext::from_entry(LibraryApp::Seat, &seat).expect_err("应拒绝座位预约");
        assert_eq!(err.kind, ERR_INVALID_APP);

        // 缺 fidEnc → 非预期响应（链路形态变更）
        let no_fid = make_entry(LibraryApp::SeminarRoom, None, None);
        let err = ReserveContext::from_entry(LibraryApp::SeminarRoom, &no_fid).expect_err("应报错");
        assert_eq!(err.kind, ERR_UNEXPECTED_RESPONSE);
    }

    #[test]
    fn context_keeps_reserve_id_enc_optional() {
        // reserveIdEnc 缺失不阻断：仍可构造，只是不带该参数
        let entry = make_entry(LibraryApp::SeminarRoom, Some("FID"), None);
        let ctx = ReserveContext::from_entry(LibraryApp::SeminarRoom, &entry).expect("可构造");
        assert!(ctx.reserve_id_enc.is_none());
        assert!(!ctx.base_params().contains_key("reserveIdEnc"));
        assert_eq!(ctx.reserve_id, "24679");
    }

    // ── 请求体构造（与实测契约逐字段对齐） ──

    #[test]
    fn info_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(
                LibraryApp::QuietRoom,
                Some("c7450f13f8a0e9ab"),
                Some("838c48dae07db28c"),
            ),
        )
        .expect("可构造");
        let p = info_params(&ctx);
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(
            p.get("reserveIdEnc").map(String::as_str),
            Some("838c48dae07db28c")
        );
        assert_eq!(
            p.get("fidEnc").map(String::as_str),
            Some("c7450f13f8a0e9ab")
        );
        assert_eq!(p.len(), 3, "详情接口不应多带参数：{p:?}");
    }

    #[test]
    fn time_list_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let p = time_list_params(&ctx, None, None);
        // 实测：sw=&reserveId=24727&resvAppId=24727&startTime=&endTime=&reserveIdEnc=<enc>&fidEnc=<fidEnc>
        assert_eq!(p.get("sw").map(String::as_str), Some(""));
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("resvAppId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("startTime").map(String::as_str), Some(""));
        assert_eq!(p.get("endTime").map(String::as_str), Some(""));
        assert_eq!(p.get("reserveIdEnc").map(String::as_str), Some("ENC"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(p.len(), 7);

        // 传入时间范围时原样透传
        let p = time_list_params(&ctx, Some(" 2026-10-16 "), Some("2026-10-17"));
        assert_eq!(p.get("startTime").map(String::as_str), Some("2026-10-16"));
        assert_eq!(p.get("endTime").map(String::as_str), Some("2026-10-17"));
    }

    #[test]
    fn role_and_dialog_params_match_contract() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let r = role_params(&ctx);
        assert_eq!(r.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(r.len(), 1, "角色接口只带 fidEnc：{r:?}");

        let d = dialog_params(&ctx, false);
        assert_eq!(d.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(d.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(
            d.get("dialogAgreeStatus").map(String::as_str),
            Some("false")
        );
        assert_eq!(d.len(), 3);
    }

    #[test]
    fn submit_params_inject_required_and_protect_keys() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let mut form_data = BTreeMap::new();
        form_data.insert("userName".to_string(), "张三".to_string());
        // 恶意/误传：试图覆盖受保护键，必须被忽略
        form_data.insert("fidEnc".to_string(), "HACK".to_string());
        form_data.insert("reserveId".to_string(), "99999".to_string());
        let mut extra = BTreeMap::new();
        extra.insert("extraFlag".to_string(), "1".to_string());
        extra.insert("cycleType".to_string(), "9".to_string());

        let req = SubmitReserveRequest {
            aprv_id: Some(" 42 ".to_string()),
            aprv_status_type_id: Some("1".to_string()),
            form_user_id: Some("406591160".to_string()),
            cycle_type: None,
            form_data,
            extra,
        };
        let p = submit_params(&ctx, &req);

        assert_eq!(p.get("ua").map(String::as_str), Some("pc"));
        assert_eq!(p.get("cycleType").map(String::as_str), Some("0"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
        assert_eq!(p.get("reserveId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("resvAppId").map(String::as_str), Some("24727"));
        assert_eq!(p.get("aprvId").map(String::as_str), Some("42"), "应 trim");
        assert_eq!(p.get("aprvStatusTypeId").map(String::as_str), Some("1"));
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        // 透传字段保留
        assert_eq!(p.get("userName").map(String::as_str), Some("张三"));
        assert_eq!(p.get("extraFlag").map(String::as_str), Some("1"));
    }

    #[test]
    fn submit_params_omit_empty_optionals() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::SeminarRoom,
            &make_entry(LibraryApp::SeminarRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let p = submit_params(&ctx, &SubmitReserveRequest::default());
        assert!(!p.contains_key("aprvId"));
        assert!(!p.contains_key("aprvStatusTypeId"));
        assert!(!p.contains_key("formUserId"));
        assert_eq!(p.get("cycleType").map(String::as_str), Some("0"));
    }

    #[test]
    fn cancel_params_include_aprv_id_and_ua() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");
        let mut extra = BTreeMap::new();
        extra.insert("reason".to_string(), "临时有事".to_string());
        let req = CancelReserveRequest {
            aprv_id: " 77 ".to_string(),
            form_user_id: Some("406591160".to_string()),
            extra,
        };
        let p = cancel_params(&ctx, &req);
        assert_eq!(p.get("aprvId").map(String::as_str), Some("77"));
        assert_eq!(p.get("ua").map(String::as_str), Some("pc"));
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert_eq!(p.get("reason").map(String::as_str), Some("临时有事"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));
    }

    #[test]
    fn protected_keys_cannot_be_overridden_by_extra_or_form_data() {
        let ctx = ReserveContext::from_entry(
            LibraryApp::QuietRoom,
            &make_entry(LibraryApp::QuietRoom, Some("FID"), Some("ENC")),
        )
        .expect("可构造");

        // 提交：extra 试图改写身份 / 审批目标 / 凭证，必须被静默忽略
        let mut extra = BTreeMap::new();
        extra.insert("formUserId".to_string(), "HACKER".to_string());
        extra.insert("aprvId".to_string(), "999999".to_string());
        extra.insert("aprvStatusTypeId".to_string(), "9".to_string());
        extra.insert("fidEnc".to_string(), "HACK".to_string());
        let req = SubmitReserveRequest {
            aprv_id: Some("42".to_string()),
            aprv_status_type_id: Some("1".to_string()),
            form_user_id: Some("406591160".to_string()),
            cycle_type: None,
            form_data: BTreeMap::new(),
            extra,
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert_eq!(p.get("aprvId").map(String::as_str), Some("42"));
        assert_eq!(p.get("aprvStatusTypeId").map(String::as_str), Some("1"));
        assert_eq!(p.get("fidEnc").map(String::as_str), Some("FID"));

        // 取消：extra.aprvId 不得改写取消目标（否则可能取消掉别人的预约）
        let mut extra = BTreeMap::new();
        extra.insert("aprvId".to_string(), "999999".to_string());
        extra.insert("formUserId".to_string(), "HACKER".to_string());
        let req = CancelReserveRequest {
            aprv_id: "77".to_string(),
            form_user_id: Some("406591160".to_string()),
            extra,
        };
        let p = cancel_params(&ctx, &req);
        assert_eq!(p.get("aprvId").map(String::as_str), Some("77"));
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));

        // form_data（动态表单字段）同样受保护，不能覆盖注入键
        let mut form_data = BTreeMap::new();
        form_data.insert("formUserId".to_string(), "HACKER".to_string());
        form_data.insert("aprvId".to_string(), "999999".to_string());
        let req = SubmitReserveRequest {
            aprv_id: Some("42".to_string()),
            form_user_id: Some("406591160".to_string()),
            form_data,
            ..Default::default()
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert_eq!(p.get("aprvId").map(String::as_str), Some("42"));

        // 保护键大小写不敏感（服务端字段大小写不稳定）
        let mut extra = BTreeMap::new();
        extra.insert("FORMUSERID".to_string(), "HACKER".to_string());
        let req = SubmitReserveRequest {
            form_user_id: Some("406591160".to_string()),
            extra,
            ..Default::default()
        };
        let p = submit_params(&ctx, &req);
        assert_eq!(p.get("formUserId").map(String::as_str), Some("406591160"));
        assert!(!p.contains_key("FORMUSERID"));
    }

    #[test]
    fn write_actions_use_strict_success_judgement() {
        // 写接口契约未实测：无 success/code 的响应必须报「结果未知」，不得默认成功
        let unknown = api_write_result(&serde_json::json!({"msg": "该时段已被预约"}), "提交预约")
            .expect_err("不得默认成功");
        assert_eq!(unknown.kind, ERR_UNEXPECTED_RESPONSE);

        // 显式成功仍要判成功（不得引入「成功误判为失败」的回归）
        assert!(api_write_result(&serde_json::json!({"success": true}), "提交预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 0}), "取消预约").is_ok());
        assert!(api_write_result(&serde_json::json!({"code": 200}), "取消预约").is_ok());
    }

    // ── 响应解析 ──

    #[test]
    fn item_info_parses_recon_sample() {
        // 契约文档里的实测响应
        let v: Value = serde_json::json!({
            "id": 24727, "deptId": 25285,
            "advanceDays": 3, "advanceTime": "00:00",
            "durationLimitOpen": 1, "durationLimitMin": 241,
            "confirmDialog": 1, "dialogTitle": "特别提醒",
            "dialogContent": "<p>静音仓要求使用人数为2-6人……</p>",
            "allowReserveSameTime": 1, "allowReserveNowTime": 0,
            "cancelLimit": -1.0, "cycleType": 0
        });
        let info = ReserveItemInfo::from_value(&v);
        assert_eq!(info.id, Some(24727));
        assert_eq!(info.dept_id, Some(25285));
        assert_eq!(info.advance_days, Some(3));
        assert_eq!(info.advance_time.as_deref(), Some("00:00"));
        assert_eq!(info.duration_limit_min, Some(241));
        assert_eq!(info.confirm_dialog, Some(1));
        assert_eq!(info.dialog_title.as_deref(), Some("特别提醒"));
        assert_eq!(info.allow_reserve_now_time, Some(0));
        assert_eq!(info.cancel_limit, Some(-1.0));
        assert_eq!(info.cycle_type, Some(0));
    }

    #[test]
    fn custom_form_config_parses_array_and_object() {
        // 数组形态
        let arr = r#"[{"fieldName":"userName","title":"姓名","fieldType":"input","required":true,"placeholder":"请输入姓名"}]"#;
        let cfg = CustomFormConfig::parse(arr);
        assert!(cfg.parsed);
        assert_eq!(cfg.fields.len(), 1);
        let f = &cfg.fields[0];
        assert_eq!(f.key.as_deref(), Some("userName"));
        assert_eq!(f.label.as_deref(), Some("姓名"));
        assert_eq!(f.field_type.as_deref(), Some("input"));
        assert_eq!(f.required, Some(true));
        assert_eq!(f.placeholder.as_deref(), Some("请输入姓名"));

        // 对象形态（字段数组在已知键下）
        let obj = r#"{"fields":[{"key":"num","label":"人数","type":"number","required":false,"defaultValue":2}],"bindFormField":[]}"#;
        let cfg = CustomFormConfig::parse(obj);
        assert!(cfg.parsed);
        assert_eq!(cfg.fields.len(), 1);
        assert_eq!(cfg.fields[0].key.as_deref(), Some("num"));
        assert_eq!(cfg.fields[0].default_value, Some(serde_json::json!(2)));

        // 对象形态（未知键，退回首个对象数组）
        let fallback = r#"{"whatever":[{"fieldName":"x"}],"other":"y"}"#;
        assert_eq!(CustomFormConfig::parse(fallback).fields.len(), 1);

        // 非法 JSON：不 panic，parsed=false，原样保留
        let bad = CustomFormConfig::parse("not-json");
        assert!(!bad.parsed);
        assert!(bad.fields.is_empty());
        assert_eq!(bad.raw, "not-json");

        // 空串
        let empty = CustomFormConfig::parse("   ");
        assert!(!empty.parsed);
        assert!(empty.fields.is_empty());
    }

    #[test]
    fn custom_form_config_of_handles_missing_and_inline_object() {
        // 缺失
        assert!(CustomFormConfig::of(&serde_json::json!({"aprvId": 0})).is_none());
        // 空字符串视为缺失
        assert!(CustomFormConfig::of(&serde_json::json!({"customFormConfig": "  "})).is_none());
        // 直接是结构（非字符串）
        let inline = CustomFormConfig::of(&serde_json::json!({
            "customFormConfig": [{"fieldName": "a"}]
        }))
        .expect("应解析内联结构");
        assert!(inline.parsed);
        assert_eq!(inline.fields.len(), 1);
    }

    #[test]
    fn time_item_parses_custom_form_config_and_core_fields() {
        let v: Value = serde_json::json!({
            "advanceDays": 14,
            "aprvId": 0,
            "customFormConfig": "[{\"fieldName\":\"userName\",\"title\":\"姓名\"}]",
            "startTime": "08:00",
            "endTime": "21:30"
        });
        let item = ReserveTimeItem::from_value(&v);
        assert_eq!(item.advance_days, Some(14));
        assert_eq!(item.aprv_id, Some(0));
        assert_eq!(item.start_time.as_deref(), Some("08:00"));
        assert_eq!(item.end_time.as_deref(), Some("21:30"));
        let cfg = item.custom_form_config.expect("应解析动态表单");
        assert_eq!(cfg.fields.len(), 1);
        assert_eq!(cfg.fields[0].key.as_deref(), Some("userName"));
    }

    #[test]
    fn extract_list_supports_common_shapes() {
        // 直接数组
        assert_eq!(extract_list(&serde_json::json!([1, 2])).len(), 2);
        // 常见外层键
        assert_eq!(extract_list(&serde_json::json!({"list": [1]})).len(), 1);
        assert_eq!(
            extract_list(&serde_json::json!({"reserveList": [1, 2, 3]})).len(),
            3
        );
        assert_eq!(extract_list(&serde_json::json!({"data": [1]})).len(), 1);
        // 无列表
        assert!(extract_list(&serde_json::json!({"foo": 1})).is_empty());
        assert!(extract_list(&Value::Null).is_empty());
    }

    #[test]
    fn person_role_and_open_team_parse_contract_samples() {
        // 实测样本：roleListSelf
        let roles: Value = serde_json::json!([
            {"alias": "2510231106", "aliasName": "2510231106", "roleId": 3}
        ]);
        let parsed: Vec<PersonRole> = roles
            .as_array()
            .expect("数组")
            .iter()
            .map(PersonRole::from_value)
            .collect();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].alias.as_deref(), Some("2510231106"));
        assert_eq!(parsed[0].role_id, Some(3));

        // 实测样本：openTeam=false
        let data: Value = serde_json::json!({"openTeam": false});
        assert_eq!(value_bool(&data, &["openTeam"]), Some(false));

        // 实测样本：showStyle="0"
        let view: Value = serde_json::json!({"showStyle": "0"});
        assert_eq!(value_string(&view, &["showStyle"]).as_deref(), Some("0"));
    }

    #[test]
    fn endpoints_match_recon_contract() {
        // 防止重构时误改路径（契约文档 01-api-contract.md）
        assert_eq!(ENDPOINT_ITEM_INFO, "reserve/info");
        assert_eq!(ENDPOINT_TIME_LIST, "reserve/item/list/time");
        assert_eq!(ENDPOINT_USER_VIEW_FLAG, "reservepc/user/view/flag");
        assert_eq!(ENDPOINT_OPEN_TEAM, "reservepc/open/team");
        assert_eq!(ENDPOINT_TEAM_LIST, "reservepc/team/list");
        assert_eq!(ENDPOINT_PERSON_ROLE, "seat/person/role");
        assert_eq!(ENDPOINT_DIALOG, "reserve/dialog");
        assert_eq!(ENDPOINT_SUBMIT, "reserve/multiple/submit");
        // 基址以 / 结尾，路径不得以 / 开头（否则拼接出错）
        for p in [
            ENDPOINT_ITEM_INFO,
            ENDPOINT_TIME_LIST,
            ENDPOINT_SUBMIT,
            ENDPOINT_CANCEL,
            ENDPOINT_MY_RESERVATIONS,
        ] {
            assert!(!p.starts_with('/'), "路径不应以 / 开头：{p}");
        }
        assert!(RESERVE_API_BASE.ends_with('/'));
    }
}
