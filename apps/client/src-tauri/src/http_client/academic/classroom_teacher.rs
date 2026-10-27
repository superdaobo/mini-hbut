//! 教师空教室：**纯函数**解析与五态判定层（#1063 契约唯一事实源）。
//!
//! 本模块**不做任何 I/O**，只接收已取得的 JSON/HTML 文本或已解析的 `serde_json::Value`，
//! 因此可以用脱敏 fixtures 做完整的单元测试。真正的网络请求在
//! [`super::super::academic::schedule`] 的 `fetch_teacher_classrooms_query` 中。
//!
//! 依据：`data/teacher-api-recon/09-classroom-teacher-probe-2026-10-16.md`（2026-10-16 实测）。
//!
//! ## 为什么需要「五态」
//!
//! 实测证明学校 `getZyKjs` 接口存在多个**会伪装成成功**的形态：
//!
//! | 实测形态 | 危险 |
//! | --- | --- |
//! | `zcStr=abc` / `zcStr=7-8` / `zcStr=30`（非法或越界） | **静默返回全量资源目录**（191 条），与「该时段全空闲」无法区分 |
//! | `xnxq=1900-1901-1`（学期不存在） | 返回**干净的 `total:0`**，与「真的 0 间空教室」无法区分 |
//! | `page.pn` 越界 | `results:[]` 但 `total>0`，不能当 0 结果 |
//! | `jyzt` / `sfqy` | 191 条里**恒为 `"1"`**，不含任何时段占用信息 |
//! | `kxjc`（空闲节次） | 请求了但服务端不下发，逐房节次**拿不到** |
//!
//! 因此**绝不允许**把「拿到了 200 + ret=0」直接当作「这些教室在该时段空闲」。

use serde_json::Value;

/// 教师空教室结果的**可信度状态**（#1063 契约；前端据此决定展示文案与徽标）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassroomAvailability {
    /// 教室**资源目录**：未按时间维度筛选，只说明「这些教室存在」。
    /// 禁止展示为「空闲」，也禁止说「找到 N 个空教室」。
    ResourceCatalog,
    /// **可查询的时段空闲结果**：服务端已按周次/星期/节次筛选且筛选经证明生效。
    PeriodFree,
    /// **状态未知**：请求成功但无法证明筛选生效（例如返回条数等于全量资源目录）。
    /// 必须如实展示「无法确认是否空闲」，不得宣称空闲。
    Unknown,
    /// **学校明确未授权**（HTTP 401 / 权限点缺失）。
    Unauthorized,
    /// **服务端坏响应**（非 JSON / 错误 HTML 页 / ret != 0 / 结构缺失）。
    BadResponse,
}

impl ClassroomAvailability {
    /// 稳定的字符串标识，供 `/v2/classroom/*` 响应与前端 i18n 使用。
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ResourceCatalog => "resource_catalog",
            Self::PeriodFree => "period_free",
            Self::Unknown => "unknown",
            Self::Unauthorized => "unauthorized",
            Self::BadResponse => "bad_response",
        }
    }

    /// 只有该状态才允许把结果呈现为「所选时段空闲」。
    ///
    /// 用于 `meta.filters_verified`：与「我们确实发送了筛选参数」（`filters_applied`）区分开——
    /// 后者只说明请求形态正确，前者才是**服务端确实生效**的证据。
    pub fn is_period_verified(self) -> bool {
        matches!(self, Self::PeriodFree)
    }
}

/// jqGrid 风格包裹的解析结果（`{msg, ret, page, rows, total, totalPages, results[]}`）。
#[derive(Debug, Clone, Default)]
pub struct JqGridPage {
    pub ret: i64,
    pub msg: String,
    pub page: i64,
    pub total: i64,
    pub total_pages: i64,
    pub results: Vec<Value>,
}

/// 解析结论。
#[derive(Debug, Clone)]
pub enum JqGridParse {
    /// 解析成功（`ret` 可能非 0，由调用方决定语义）。
    Ok(JqGridPage),
    /// 不是 JSON（HTTP 200 的错误 HTML 页 / 登录页 / 空体）。
    NotJson,
    /// JSON 但缺少 jqGrid 信封字段（`total` 与 `results` 都不存在）。
    MissingEnvelope,
}

/// 宽松整数解析：兼容 `3` / `"3"` / `3.0` / `null` 等类型差异。
fn loose_i64(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(s) => s
            .trim()
            .parse::<i64>()
            .ok()
            .or_else(|| s.trim().parse::<f64>().ok().map(|f| f as i64)),
        _ => None,
    }
}

/// 解析 jqGrid 包裹。**不把「解析成功」当作「业务成功」**。
pub fn parse_jqgrid_page(body: &str) -> JqGridParse {
    let trimmed = body.trim_start();
    if trimmed.is_empty() || trimmed.starts_with('<') {
        return JqGridParse::NotJson;
    }
    let value: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return JqGridParse::NotJson,
    };

    let total_present = value.get("total").is_some();
    let results_value = value
        .get("results")
        .or_else(|| value.get("data"))
        .or_else(|| value.get("list"));
    if !total_present && results_value.is_none() {
        return JqGridParse::MissingEnvelope;
    }

    let results = results_value
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    JqGridParse::Ok(JqGridPage {
        ret: loose_i64(value.get("ret")).unwrap_or(0),
        msg: value
            .get("msg")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        page: loose_i64(value.get("page")).unwrap_or(1),
        // `total` 缺失时退化为 results 长度，避免把「结构异常」误读成 0。
        total: loose_i64(value.get("total")).unwrap_or(results.len() as i64),
        total_pages: loose_i64(value.get("totalPages")).unwrap_or(0),
        results,
    })
}

/// 判定结果状态。
///
/// * `filters_verified`：本次请求是否携带了**经客户端严格校验**的
///   `zcStr + xqStr + jcStr`（见 [`is_selectable_week`] / [`validate_weekday`] / [`format_periods_csv`]）。
/// * `baseline_total`：同一学期**无筛选**资源目录的条数（用于识别「筛选被服务端忽略」）。
///   实测非法 `zcStr` 会静默返回全量目录，此时 `total` 与 `baseline_total` 相等。
pub fn classify_availability(
    page: &JqGridPage,
    filters_verified: bool,
    baseline_total: Option<i64>,
) -> ClassroomAvailability {
    if page.ret != 0 {
        return ClassroomAvailability::BadResponse;
    }
    if !filters_verified {
        return ClassroomAvailability::ResourceCatalog;
    }
    // 返回条数与「全量资源目录」完全一致时，无法区分
    // 「该时段确实全校空闲」与「服务端忽略了筛选」→ 保守判为未知。
    if let Some(baseline) = baseline_total {
        if baseline > 0 && page.total == baseline {
            return ClassroomAvailability::Unknown;
        }
    }
    ClassroomAvailability::PeriodFree
}

/// 周次是否**可以提供给用户选择**。
///
/// 实测 `getZcByXnxq` 的字典含 `0`（预备周），而服务端把 `zcStr=0` 与非法值一样
/// 当作「不过滤」并返回全量资源目录 —— 因此 `0` 与负数都不得作为可选项暴露。
pub fn is_selectable_week(week: i64) -> bool {
    week > 0
}

/// 星期是否合法（实测 `xqStr` 1..=7，1 = 周一）。
pub fn validate_weekday(weekday: i32) -> bool {
    (1..=7).contains(&weekday)
}

/// 把节次列表格式化为服务端 `jcStr`（逗号分隔、去重、升序）。
///
/// **严格校验**：实测 `jcStr` 只能是 1..=11 的小节号；任何越界值都会让服务端
/// 静默改变语义（`jcStr` 为空时返回「全部节次都空闲」的交集）。返回 `None` 表示非法。
pub fn format_periods_csv(periods: &[i32]) -> Option<String> {
    if periods.is_empty() {
        return None;
    }
    let mut sorted: Vec<i32> = periods.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    if sorted.iter().any(|p| !(1..=11).contains(p)) {
        return None;
    }
    Some(
        sorted
            .iter()
            .map(|p| p.to_string())
            .collect::<Vec<_>>()
            .join(","),
    )
}

/// 从 `getZcByXnxq` 响应中取周次字典（兼容字符串/数值）。
pub fn parse_week_dictionary(value: &Value) -> Vec<i64> {
    let Some(arr) = value.as_array() else {
        return Vec::new();
    };
    let mut weeks: Vec<i64> = arr
        .iter()
        .filter_map(|item| loose_i64(item.get("zc")))
        .collect();
    weeks.sort_unstable();
    weeks.dedup();
    weeks
}

/// `getXqrqxx` 返回的某周某天的日期。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeekDayDate {
    /// 1..=7，1 = 周一（实测 `xq=1 ↔ 星期一`）。
    pub weekday: i32,
    /// 服务端原文，形如 `10.12`（**无年份**）。
    pub raw_date: String,
}

/// 解析 `getXqrqxx`（`{ret, msg, data:[{xq, rq, xqmc}]}`）。
pub fn parse_week_dates(value: &Value) -> Vec<WeekDayDate> {
    let Some(arr) = value.get("data").and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let mut out: Vec<WeekDayDate> = arr
        .iter()
        .filter_map(|item| {
            let weekday = loose_i64(item.get("xq"))? as i32;
            if !validate_weekday(weekday) {
                return None;
            }
            let raw_date = item
                .get("rq")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if raw_date.is_empty() {
                return None;
            }
            Some(WeekDayDate { weekday, raw_date })
        })
        .collect();
    out.sort_by_key(|d| d.weekday);
    out
}

/// 把 `MM.DD`（`getXqrqxx` 原文）与学期、所在周次拼成 `(iso, 中文)`。
///
/// 学年跨年：`2026-2027-1` 中 8..=12 月属 2026 年，1..=7 月属 2027 年。
pub fn resolve_date_from_week_day(
    semester: &str,
    week: i32,
    weekday: i32,
    raw_date: &str,
) -> Option<(String, String)> {
    if !validate_weekday(weekday) || week <= 0 {
        return None;
    }
    let (month, day) = raw_date.trim().split_once('.')?;
    let month: u32 = month.trim().parse().ok()?;
    let day: u32 = day.trim().parse().ok()?;
    let year = semester_start_year(semester, month)?;
    let date = chrono::NaiveDate::from_ymd_opt(year, month, day)?;
    Some((
        date.format("%Y-%m-%d").to_string(),
        date.format("%Y年%m月%d日").to_string(),
    ))
}

/// 学期首年 + 月份 → 实际公历年。无法解析学期时返回 `None`（不猜年份）。
fn semester_start_year(semester: &str, month: u32) -> Option<i32> {
    let first = semester.trim().split('-').next()?.trim();
    let start_year: i32 = first.parse().ok()?;
    if (1..=12).contains(&month) {
        Some(if month >= 8 {
            start_year
        } else {
            start_year + 1
        })
    } else {
        None
    }
}

/// 教师可见的教学楼候选（来源必须是**同一个资源域**）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuildingCandidate {
    /// 服务端 `jxldm`（用于 `jxldm` 过滤参数）。
    pub id: String,
    /// 服务端 `jxlmc`（如 `3号`）。
    pub name: String,
    /// 校区（如 `本部`）。
    pub campus: String,
}

/// 从 `getZyKjs` 的**返回教室**去重导出教学楼候选。
///
/// #1063 要求：候选列表必须与该教师有权限的资源域一致，不得向用户提供明知缺席的楼栋。
/// 因此这里**只用实际返回的房间**推导候选，不采用全量 `getJxlList`（实测 35 栋，
/// 而教师资源域只有 6 栋）。
pub fn derive_building_candidates(results: &[Value]) -> Vec<BuildingCandidate> {
    let mut out: Vec<BuildingCandidate> = Vec::new();
    for room in results {
        let id = room
            .get("jxldm")
            .map(|v| match v {
                Value::String(s) => s.trim().to_string(),
                other => other.to_string().trim_matches('"').to_string(),
            })
            .unwrap_or_default();
        let name = room
            .get("jxlmc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let campus = room
            .get("xqmc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if id.is_empty() || name.is_empty() {
            continue;
        }
        if out
            .iter()
            .any(|c| c.id == id && c.name == name && c.campus == campus)
        {
            continue;
        }
        out.push(BuildingCandidate { id, name, campus });
    }
    out.sort_by(|a, b| {
        building_sort_key(&a.id)
            .cmp(&building_sort_key(&b.id))
            .then_with(|| a.name.cmp(&b.name))
    });
    out
}

/// 楼栋排序键：纯数字 id 按数值排，其余按字符串排在其后。
fn building_sort_key(id: &str) -> (u8, i64, String) {
    match id.trim().parse::<i64>() {
        Ok(n) => (0, n, String::new()),
        Err(_) => (1, 0, id.trim().to_string()),
    }
}

/// 楼栋别名匹配结论。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BuildingMatch {
    /// 唯一命中（返回 `jxldm` id）。
    Unique(String),
    /// 多个候选同一别名（例如同名楼栋）→ 拒绝猜测。
    Ambiguous,
    /// 无命中。
    NotFound,
}

/// 楼栋别名归一化：`3号` / `3教` / `3号楼` / `三号` / `三教` → `3`；`工1` → `工1`。
///
/// 规则（对应 #1063「覆盖中文汉字楼名、其它校区同名楼、空字符串与类型差异」）：
/// 1. 去空白、转小写；
/// 2. 中文数字 → 阿拉伯数字；
/// 3. 有**前导数字**时取前导数字串（`6教实训楼` → `6`、`3号楼` → `3`）；
///    无前导数字时保留整串（`工1`、`艺术楼`）。
///
/// 返回 `None` 表示无法归一（空串）。
pub fn normalize_building_key(name: &str) -> Option<String> {
    let lowered: String = name
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if lowered.is_empty() {
        return None;
    }
    let converted = cjk_digits_to_ascii(&lowered);
    let digits: String = converted
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if !digits.is_empty() {
        return Some(digits);
    }
    Some(converted)
}

/// 中文数字（含十位组合）→ 阿拉伯数字；非数字字符原样保留。
///
/// 支持 `三` → `3`、`十三` → `13`、`二十` → `20`、`二十一` → `21`、`十` → `10`。
fn cjk_digits_to_ascii(input: &str) -> String {
    let digit = |c: char| -> Option<u32> {
        Some(match c {
            '零' | '〇' => 0,
            '一' => 1,
            '二' | '两' => 2,
            '三' => 3,
            '四' => 4,
            '五' => 5,
            '六' => 6,
            '七' => 7,
            '八' => 8,
            '九' => 9,
            _ => return None,
        })
    };
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::new();
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        // 「X十Y」/「X十」
        if let Some(d) = digit(c) {
            if chars.get(i + 1) == Some(&'十') {
                let tail = chars.get(i + 2).and_then(|n| digit(*n));
                let value = d * 10 + tail.unwrap_or(0);
                out.push_str(&value.to_string());
                i += if tail.is_some() { 3 } else { 2 };
                continue;
            }
            out.push_str(&d.to_string());
            i += 1;
            continue;
        }
        // 「十Y」/「十」
        if c == '十' {
            let tail = chars.get(i + 1).and_then(|n| digit(*n));
            let value = 10 + tail.unwrap_or(0);
            out.push_str(&value.to_string());
            i += if tail.is_some() { 2 } else { 1 };
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

/// 在**同一资源域**的候选中按别名匹配教学楼。
///
/// 因为候选本身来自同一校区的返回结果，所以不会跨校区错匹配；
/// 若同一别名在候选中命中多个（例如同名楼），返回 [`BuildingMatch::Ambiguous`] 而不是猜。
pub fn match_building_alias(alias: &str, candidates: &[BuildingCandidate]) -> BuildingMatch {
    let Some(key) = normalize_building_key(alias) else {
        return BuildingMatch::NotFound;
    };
    let hits: Vec<&BuildingCandidate> = candidates
        .iter()
        .filter(|c| normalize_building_key(&c.name).as_deref() == Some(key.as_str()))
        .collect();
    match hits.len() {
        0 => BuildingMatch::NotFound,
        1 => BuildingMatch::Unique(hits[0].id.clone()),
        _ => BuildingMatch::Ambiguous,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── fixtures（全部来自 09 号报告的真实响应形态，已脱敏：无姓名/工号/学号/Cookie）──

    /// 无筛选资源目录：191 条，`jyzt`/`sfqy` 恒为 "1"（实测）。
    fn fixture_catalog() -> Value {
        json!({
            "msg": "ok", "ret": 0, "page": 1, "rows": 500, "total": 191, "totalPages": 1,
            "results": [
                {"id":"228","jsmc":"1-001","jsbh":"1-001","jslx":"05","jxldm":"9","jxlmc":"1号",
                 "xqmc":"本部","xqdm":"1","zdskrnrs":193,"szlc":"1","sfqy":"1","jyzt":"1"},
                {"id":"364","jsmc":"3-103","jsbh":"3-103","jslx":"05","jxldm":"24","jxlmc":"3号",
                 "xqmc":"本部","xqdm":"1","zdskrnrs":85,"szlc":"1","sfqy":"1","jyzt":"1"},
                {"id":"375","jsmc":"3-206","jsbh":"3-206","jslx":"05","jxldm":"24","jxlmc":"3号",
                 "xqmc":"本部","xqdm":"1","zdskrnrs":90,"szlc":"2","sfqy":"1","jyzt":"1"}
            ]
        })
    }

    /// 时段空闲结果：第 7 周 / 周一 / 9-11 节 / 3号 → 25 条（实测）。
    fn fixture_period_free() -> Value {
        json!({
            "msg": "ok", "ret": 0, "page": 1, "rows": 500, "total": 25, "totalPages": 1,
            "results": [
                {"id":"364","jsmc":"3-103","jsbh":"3-103","jxldm":"24","jxlmc":"3号","xqmc":"本部",
                 "zdskrnrs":85,"szlc":"1","sfqy":"1","jyzt":"1"}
            ]
        })
    }

    fn page_from(v: &Value) -> JqGridPage {
        match parse_jqgrid_page(&v.to_string()) {
            JqGridParse::Ok(p) => p,
            other => panic!("fixture 应解析成功: {other:?}"),
        }
    }

    #[test]
    fn parses_jqgrid_envelope() {
        let page = page_from(&fixture_catalog());
        assert_eq!(page.ret, 0);
        assert_eq!(page.total, 191);
        assert_eq!(page.total_pages, 1);
        assert_eq!(page.results.len(), 3);
    }

    #[test]
    fn rejects_html_error_page_as_not_json() {
        // HTTP 200 + 错误 HTML 页（recon 08 的错误形态 4）
        assert!(matches!(
            parse_jqgrid_page("<!DOCTYPE html><html><body>报错啦</body></html>"),
            JqGridParse::NotJson
        ));
        assert!(matches!(parse_jqgrid_page("   "), JqGridParse::NotJson));
        assert!(matches!(
            parse_jqgrid_page("<script>location.href='/authserver/login'</script>"),
            JqGridParse::NotJson
        ));
    }

    #[test]
    fn rejects_json_without_envelope() {
        assert!(matches!(
            parse_jqgrid_page("{\"ret\":-1,\"msg\":\"参数传输异常\"}"),
            JqGridParse::MissingEnvelope
        ));
    }

    #[test]
    fn tolerates_string_and_number_types() {
        // 实测服务端在 `szlc` 等字段混用字符串/数值；total 也需容错。
        let page = match parse_jqgrid_page(
            "{\"ret\":\"0\",\"total\":\"53\",\"totalPages\":\"2\",\"results\":[]}",
        ) {
            JqGridParse::Ok(p) => p,
            other => panic!("应解析成功: {other:?}"),
        };
        assert_eq!(page.ret, 0);
        assert_eq!(page.total, 53);
        assert_eq!(page.total_pages, 2);
    }

    #[test]
    fn empty_results_with_positive_total_is_not_zero_rooms() {
        // 实测 page.pn 越界：{total:53, results:[]}
        let page = match parse_jqgrid_page("{\"ret\":0,\"page\":99,\"total\":53,\"results\":[]}") {
            JqGridParse::Ok(p) => p,
            other => panic!("应解析成功: {other:?}"),
        };
        assert_eq!(page.total, 53);
        assert!(page.results.is_empty());
        // 不能把 total>0 的形态判成「0 间空教室」：分类仍为 period_free（由调用方展示 total）
        assert_eq!(
            classify_availability(&page, true, Some(191)),
            ClassroomAvailability::PeriodFree
        );
    }

    #[test]
    fn catalog_without_filters_is_resource_catalog() {
        let page = page_from(&fixture_catalog());
        let state = classify_availability(&page, false, Some(191));
        assert_eq!(state, ClassroomAvailability::ResourceCatalog);
        assert!(!state.is_period_verified());
        assert_eq!(state.as_str(), "resource_catalog");
    }

    #[test]
    fn verified_filters_yield_period_free() {
        let page = page_from(&fixture_period_free());
        let state = classify_availability(&page, true, Some(191));
        assert_eq!(state, ClassroomAvailability::PeriodFree);
        assert!(state.is_period_verified());
        assert_eq!(state.as_str(), "period_free");
    }

    #[test]
    fn filtered_total_equal_to_catalog_is_unknown() {
        // 实测 zcStr=abc / 7-8 / 30 → 静默返回全量 191。与「全时空闲」无法区分。
        let page = page_from(&fixture_catalog());
        let state = classify_availability(&page, true, Some(191));
        assert_eq!(state, ClassroomAvailability::Unknown);
        assert!(!state.is_period_verified());
        assert_eq!(state.as_str(), "unknown");
    }

    #[test]
    fn ret_nonzero_is_bad_response() {
        let page = match parse_jqgrid_page(
            "{\"ret\":-1,\"msg\":\"参数传输异常\",\"total\":0,\"results\":[]}",
        ) {
            JqGridParse::Ok(p) => p,
            other => panic!("应解析成功: {other:?}"),
        };
        assert_eq!(
            classify_availability(&page, true, Some(191)),
            ClassroomAvailability::BadResponse
        );
    }

    #[test]
    fn zero_result_stays_period_free_with_zero_total() {
        // 实测 jxldm=000 → {ret:0,total:0,results:[]}，是真实的 0
        let page =
            match parse_jqgrid_page("{\"ret\":0,\"total\":0,\"totalPages\":0,\"results\":[]}") {
                JqGridParse::Ok(p) => p,
                other => panic!("应解析成功: {other:?}"),
            };
        assert_eq!(
            classify_availability(&page, true, Some(191)),
            ClassroomAvailability::PeriodFree
        );
        assert_eq!(page.total, 0);
    }

    #[test]
    fn selectable_week_excludes_prep_week_and_invalids() {
        assert!(is_selectable_week(1));
        assert!(is_selectable_week(21));
        // 0 = 预备周，服务端把 zcStr=0 当「不过滤」→ 不得作为可选项
        assert!(!is_selectable_week(0));
        assert!(!is_selectable_week(-1));

        assert!(validate_weekday(1) && validate_weekday(7));
        assert!(!validate_weekday(0) && !validate_weekday(8));
    }

    #[test]
    fn periods_csv_is_strict() {
        assert_eq!(format_periods_csv(&[9, 10, 11]).as_deref(), Some("9,10,11"));
        assert_eq!(
            format_periods_csv(&[11, 9, 10, 9]).as_deref(),
            Some("9,10,11")
        );
        // 越界/空 → None（服务端会静默改变语义，必须由调用方拒绝）
        assert_eq!(format_periods_csv(&[]), None);
        assert_eq!(format_periods_csv(&[0]), None);
        assert_eq!(format_periods_csv(&[12]), None);
        assert_eq!(format_periods_csv(&[1, 99]), None);
    }

    #[test]
    fn parses_week_dictionary_with_type_variance() {
        let value = json!([{"zc": 0}, {"zc": "1"}, {"zc": 7.0}, {"zc": 7}, {"other": 1}]);
        assert_eq!(parse_week_dictionary(&value), vec![0, 1, 7]);
        assert!(parse_week_dictionary(&json!({"ret": 0})).is_empty());
    }

    #[test]
    fn parses_week_dates_and_resolves_year() {
        let value = json!({
            "ret": 0, "msg": "成功",
            "data": [
                {"xq":"1","rq":"10.12","xqmc":"星期一"},
                {"xq":"5","rq":"10.16","xqmc":"星期五"},
                {"xq":"7","rq":"10.18","xqmc":"星期日"}
            ]
        });
        let dates = parse_week_dates(&value);
        assert_eq!(dates.len(), 3);
        assert_eq!(dates[0].weekday, 1);
        assert_eq!(dates[1].raw_date, "10.16");

        // 2026-2027-1：8..=12 月属 2026，1..=7 月属 2027
        let (iso, cn) = resolve_date_from_week_day("2026-2027-1", 7, 5, "10.16").unwrap();
        assert_eq!(iso, "2026-10-16");
        assert_eq!(cn, "2026年10月16日");
        let (iso, _) = resolve_date_from_week_day("2026-2027-1", 21, 3, "01.20").unwrap();
        assert_eq!(iso, "2027-01-20");

        // 空值/坏值不得 panic
        assert!(parse_week_dates(&json!({"ret": 0, "data": null})).is_empty());
        assert!(resolve_date_from_week_day("2026-2027-1", 7, 5, "").is_none());
        assert!(resolve_date_from_week_day("", 7, 5, "10.16").is_none());
        assert!(resolve_date_from_week_day("2026-2027-1", 7, 0, "10.16").is_none());
    }

    #[test]
    fn derives_building_candidates_from_results_only() {
        let results = fixture_catalog()["results"].clone();
        let results = results.as_array().unwrap().clone();
        let candidates = derive_building_candidates(&results);
        assert_eq!(
            candidates,
            vec![
                BuildingCandidate {
                    id: "9".into(),
                    name: "1号".into(),
                    campus: "本部".into()
                },
                BuildingCandidate {
                    id: "24".into(),
                    name: "3号".into(),
                    campus: "本部".into()
                },
            ]
        );
    }

    #[test]
    fn building_candidates_skip_empty_and_null_fields() {
        let results = vec![
            json!({"jxldm":"", "jxlmc":"3号", "xqmc":"本部"}),
            json!({"jxldm":"24", "jxlmc":"", "xqmc":"本部"}),
            json!({"jxldm":null, "jxlmc":null, "xqmc":null}),
            json!({"jxldm":"24", "jxlmc":"3号", "xqmc":"本部"}),
        ];
        let candidates = derive_building_candidates(&results);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].id, "24");
    }

    #[test]
    fn building_alias_covers_number_and_cjk_forms() {
        for alias in ["3号", "3教", "3号楼", "三号", "三教", " 3 号 "] {
            assert_eq!(
                normalize_building_key(alias).as_deref(),
                Some("3"),
                "别名 {alias} 应归一为 3"
            );
        }
        // 不能把 13 号误配成 3 号
        assert_eq!(normalize_building_key("13号").as_deref(), Some("13"));
        assert_eq!(normalize_building_key("13号楼").as_deref(), Some("13"));
        // 非数字楼名保留
        assert_eq!(normalize_building_key("工1").as_deref(), Some("工1"));
        assert_eq!(normalize_building_key("6教实训楼").as_deref(), Some("6"));
        assert_eq!(normalize_building_key("艺术楼").as_deref(), Some("艺术楼"));
        // 空串 / 空白 → None
        assert_eq!(normalize_building_key(""), None);
        assert_eq!(normalize_building_key("   "), None);
    }

    #[test]
    fn building_alias_handles_two_digit_cjk_numbers() {
        // 两位数中文楼名不得被拆错（十三 → 13，不是 103）
        assert_eq!(normalize_building_key("十三号").as_deref(), Some("13"));
        assert_eq!(normalize_building_key("十三教").as_deref(), Some("13"));
        assert_eq!(normalize_building_key("二十一号").as_deref(), Some("21"));
        assert_eq!(normalize_building_key("十号楼").as_deref(), Some("10"));
        assert_eq!(normalize_building_key("十号").as_deref(), Some("10"));
        // 与阿拉伯数字写法一致
        assert_eq!(
            normalize_building_key("十三号楼"),
            normalize_building_key("13号")
        );
    }

    #[test]
    fn building_alias_matches_within_same_resource_domain() {
        let candidates = vec![
            BuildingCandidate {
                id: "9".into(),
                name: "1号".into(),
                campus: "本部".into(),
            },
            BuildingCandidate {
                id: "24".into(),
                name: "3号".into(),
                campus: "本部".into(),
            },
        ];
        assert_eq!(
            match_building_alias("3教", &candidates),
            BuildingMatch::Unique("24".into())
        );
        assert_eq!(
            match_building_alias("3号楼", &candidates),
            BuildingMatch::Unique("24".into())
        );
        assert_eq!(
            match_building_alias("1号", &candidates),
            BuildingMatch::Unique("9".into())
        );
        // 该资源域里不存在的楼栋 → NotFound（不得回退到「有权限不明」的学生路径）
        assert_eq!(
            match_building_alias("4教", &candidates),
            BuildingMatch::NotFound
        );
        assert_eq!(
            match_building_alias("", &candidates),
            BuildingMatch::NotFound
        );
    }

    #[test]
    fn building_alias_is_ambiguous_for_duplicate_names() {
        // 同一资源域出现同名楼栋 → 拒绝猜测
        let candidates = vec![
            BuildingCandidate {
                id: "24".into(),
                name: "3号".into(),
                campus: "本部".into(),
            },
            BuildingCandidate {
                id: "xq2-24".into(),
                name: "3号楼".into(),
                campus: "马房山".into(),
            },
        ];
        assert_eq!(
            match_building_alias("3教", &candidates),
            BuildingMatch::Ambiguous
        );
    }

    #[test]
    fn building_alias_does_not_cross_match_different_numbers() {
        let candidates = vec![BuildingCandidate {
            id: "23".into(),
            name: "6教实训楼".into(),
            campus: "本部".into(),
        }];
        assert_eq!(
            match_building_alias("6教", &candidates),
            BuildingMatch::Unique("23".into())
        );
        assert_eq!(
            match_building_alias("6号楼", &candidates),
            BuildingMatch::Unique("23".into())
        );
        assert_eq!(
            match_building_alias("5教", &candidates),
            BuildingMatch::NotFound
        );
    }
}
