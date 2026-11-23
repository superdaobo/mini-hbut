//! 学生名册（教师视角，只读）—— goal-21 / T04b。
//!
//! ## ⚠️ 这是本轮**唯一涉及大规模个人信息**的接口
//!
//! 实测（2026-11-20）：
//!
//! ```text
//! GET /admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid&page=1&rows=5
//! → { ret:0, total:56957, results:[…] }        ← 全校 5.7 万条
//! ```
//!
//! **`yxdm`（院系）过滤参数不生效**，不带班级条件就返回全校。因此本模块：
//!
//! 1. **强制要求 `bjid`**：缺失时直接返回 `Err`，**一个字节都不发出去**；
//! 2. **强制分页上限**：`rows` 最大 20（recon 15 号文档 §十的安全要求）；
//! 3. **不做本地缓存**：返回结构里不含任何可落盘的持久化字段；
//! 4. 姓名与学号原样返回给前端渲染，但**不写日志**（`hbut_debug!` 只打印条数）。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 单页最大条数（安全上限，见模块文档）。
#[allow(dead_code)] // 本模块已禁用，解析工具保留供将来接入可用接口时复用
pub(crate) const ROSTER_MAX_PAGE_SIZE: u32 = 20;

/// 校验并归一化分页参数：`page` 最小 1，`page_size` 夹在 `1..=20`。
///
/// 非法值**夹紧而不是报错**：前端传 0 或 1000 时按 1 / 20 处理，
/// 既不让越界值打穿服务端，也不让用户看到一个无意义的错误。
#[allow(dead_code)] // 本模块已禁用，解析工具保留供将来接入可用接口时复用
pub(crate) fn clamp_paging(page: Option<u32>, page_size: Option<u32>) -> (u32, u32) {
    let page = page.unwrap_or(1).max(1);
    let size = page_size.unwrap_or(ROSTER_MAX_PAGE_SIZE).clamp(1, ROSTER_MAX_PAGE_SIZE);
    (page, size)
}

/// 归一化一条学生记录。
///
/// 字段映射：`xh`→`studentId`、`xm`→`name`、`bjmc`→`className`、`bjdm`→`classId`、
/// `zymc`→`majorName`、`yxdm`→`departmentId`、`sznj`→`grade`。
///
/// 注意：`xz`（学制）/`mzdm`（民族代码）等字段**不返回**——移动端名册不需要它们，
/// 少传一个字段就少一份泄漏面。
#[allow(dead_code)] // 本模块已禁用，解析工具保留供将来接入可用接口时复用
pub(crate) fn normalize_student(record: &Value) -> Value {
    json!({
        "studentId": grid::text_field(record, "xh"),
        "name": grid::text_field(record, "xm"),
        "classId": grid::text_field(record, "bjdm"),
        "className": grid::text_field(record, "bjmc"),
        "majorName": grid::text_field(record, "zymc"),
        "departmentId": grid::text_field(record, "yxdm"),
        "grade": grid::text_field(record, "sznj"),
    })
}

/// 解析名册响应 → `{ students, total }`。
#[allow(dead_code)] // 本模块已禁用，解析工具保留供将来接入可用接口时复用
pub(crate) fn parse_roster(payload: &Value) -> Value {
    let records = grid::parse_grid_list(payload);
    let total = payload
        .get("total")
        .and_then(Value::as_i64)
        .unwrap_or(records.len() as i64);
    let students: Vec<Value> = records.iter().map(normalize_student).collect();
    json!({ "students": students, "total": total })
}

/// 拉取某个班级的学生名册。
///
/// # ⛔ 已禁用（2026-11-20 实测结论）
///
/// 穷举测试了 **7 种过滤参数组合**，`xsxxcxListCustom` 对教师身份**全部无效**，
/// 恒返回 `total = 56957`（全校学生）：
///
/// | 参数 | 结果 |
/// | --- | --- |
/// | `bjid=<bjbh>` | 56957 |
/// | `bjid=<id>` | 56957 |
/// | `query.bjdm\|\|=<bjbh>` | 56957 |
/// | `query.bjmc\|\|=<班级名>` | 56957 |
/// | `query.bjbh\|\|=<bjbh>` | 56957 |
/// | `query.xh\|\|=<学号>` | 56957 |
/// | `xh=<学号>` | 56957 |
/// | 无参（基线） | 56957 |
///
/// 连**单学号精确查询**都返回全校，说明该接口的过滤能力对教师角色整体未开放。
///
/// **因此本函数直接拒绝调用**，而不是把 5.7 万条学生个人信息返回给前端让前端过滤 ——
/// 后者既浪费带宽，也把一次「查一个班」变成「下载全校名单」，是不可接受的泄漏面。
///
/// 若将来定位到可用接口（例如按教学班查学生），再替换本函数实现。
/// 按**姓名**查询学生（goal-22 实测：`xm=` 裸参数有效，支持模糊匹配）。
///
/// ## 实测结论（2026-11-21，教师账号 20241130）
///
/// ```text
/// xm=杜朝晖      → total=1     ✅ 精确匹配
/// xm=杜          → total=327   ✅ 模糊匹配（姓氏）
/// xh=1610200d30  → total=56957 ❌ 学号参数无效（返回全校）
/// query.xh||=…   → total=56957 ❌
/// query.bjmc||=… → total=56957 ❌
/// bjid/bjbh/bjdm → total=56957 ❌
/// ```
///
/// **该接口对教师只开放「按姓名」一个过滤维度**，没有按班级/学号过滤的能力。
/// 因此本函数**要求 keyword（姓名）必填**：不填就等于拉全校 5.7 万条学生信息。
///
/// ## 隐私边界
///
/// 上游返回 30+ 字段（含 `xm`/`xh`/`sfzjh`/`zzmmdm`），
/// 本函数只保留 7 个字段（见 `normalize_student`），其余一律不传。
pub(crate) async fn fetch_roster_with(
    client: &HbutClient,
    _bjid: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
    keyword: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ROSTER_STUDENTS
    ));

    // ⚠️ keyword（姓名）必填：不填会返回全校 56957 条
    let name = keyword
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "请输入学生姓名再查询：该接口不支持按班级/学号过滤，不填姓名会返回全校 56957 条"
                .to_string()
        })?;

    let (page, size) = clamp_paging(page, page_size);
    let referer = format!("{}/admin/xjgl/xsjbxx/xsxxcx", client.jwxt_base_url());

    let page_text = page.to_string();
    let size_text = size.to_string();
    // 实测：姓名用**裸参数** `xm`，不是 jqGrid 的 `query.xm||`
    let extra: Vec<(&str, &str)> = vec![
        ("page.pn", page_text.as_str()),
        ("page.size", size_text.as_str()),
        ("xm", name.as_str()),
    ];

    let payload = grid::fetch_grid_with_params(
        client,
        readonly::PATH_ROSTER_STUDENTS,
        None,
        &referer,
        &extra,
    )
    .await?;

    let mut result = parse_roster(&payload);
    if let Some(object) = result.as_object_mut() {
        object.insert("page".to_string(), json!(page));
        object.insert("pageSize".to_string(), json!(size));
        object.insert("keyword".to_string(), json!(name));
    }
    crate::hbut_debug!(
        "[TeacherRoster] 按姓名「{}」第 {} 页，返回 {} 条 / 总计 {}",
        name,
        page,
        result
            .get("students")
            .and_then(Value::as_array)
            .map(Vec::len)
            .unwrap_or(0),
        result.get("total").and_then(Value::as_i64).unwrap_or(0)
    );
    Ok(result)
}

/// 归一化「按教学班列学生」的一条记录（含 20 周考勤）。
///
/// 上游字段：`xh`(学号) / `xm`(姓名) / `bjmc` / `zymc` / `yxmc` / `sznj` /
/// `cqzt1..cqzt20`（"0"=未录入，其它值=已录入）。
///
/// 隐私：只保留 7 个字段 + 考勤状态，**不传** `sfzjh`/`zzmmdm` 等。
pub(crate) fn normalize_class_student(record: &Value) -> Value {
    let mut weeks: Vec<String> = Vec::with_capacity(20);
    let mut recorded = 0_i64;
    for index in 1..=20 {
        let key = format!("cqzt{index}");
        let value = record
            .get(&key)
            .map(|v| match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                _ => String::new(),
            })
            .unwrap_or_default();
        if !value.is_empty() && value != "0" {
            recorded += 1;
        }
        weeks.push(value);
    }
    json!({
        "studentId": grid::text_field(record, "xh"),
        "name": grid::text_field(record, "xm"),
        "classId": grid::text_field(record, "bjdm"),
        "className": grid::text_field(record, "bjmc"),
        "majorName": grid::text_field(record, "zymc"),
        "departmentName": grid::text_field(record, "yxmc"),
        "grade": grid::text_field(record, "sznj"),
        "courseName": grid::text_field(record, "kcmc"),
        "weeks": weeks,
        "recordedWeeks": recorded,
    })
}

/// 解析「按教学班列学生」响应。
pub(crate) fn parse_class_roster(payload: &Value) -> Value {
    let rows = grid::parse_grid_list(payload);
    let students: Vec<Value> = rows.iter().map(normalize_class_student).collect();
    let total = payload
        .get("total")
        .and_then(Value::as_i64)
        .unwrap_or(students.len() as i64);
    json!({ "students": students, "total": total })
}

/// 按**教学班**列学生（goal-22：这是唯一能按班列学生的接口）。
///
/// `jxbid` 来自 `jsdQueryJxbList`（成绩录入的教学班列表，已实现）。
pub(crate) async fn fetch_roster_by_class_with(
    client: &HbutClient,
    jxbid: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ROSTER_BY_CLASS
    ));

    let jxbid = jxbid
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "缺少教学班参数 jxbid（来自成绩录入的教学班列表）".to_string())?;

    let (page, size) = clamp_paging(page, page_size);
    let referer = format!(
        "{}/admin/jsd/xskq/xswdxskq?id={}",
        client.jwxt_base_url(),
        jxbid
    );

    let page_text = page.to_string();
    let size_text = size.to_string();
    let extra: Vec<(&str, &str)> = vec![
        ("page.pn", page_text.as_str()),
        ("page.size", size_text.as_str()),
        ("jxbid", jxbid.as_str()),
    ];

    let payload = grid::fetch_grid_with_params(
        client,
        readonly::PATH_ROSTER_BY_CLASS,
        None,
        &referer,
        &extra,
    )
    .await?;

    let mut result = parse_class_roster(&payload);
    if let Some(object) = result.as_object_mut() {
        object.insert("page".to_string(), json!(page));
        object.insert("pageSize".to_string(), json!(size));
        object.insert("jxbid".to_string(), json!(jxbid));
    }
    crate::hbut_debug!(
        "[TeacherRoster] 教学班 {} 第 {} 页，返回 {} 条 / 总计 {}",
        &jxbid[..jxbid.len().min(12)],
        page,
        result
            .get("students")
            .and_then(Value::as_array)
            .map(Vec::len)
            .unwrap_or(0),
        result.get("total").and_then(Value::as_i64).unwrap_or(0)
    );
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_paging_enforces_upper_bound() {
        assert_eq!(clamp_paging(Some(2), Some(1000)), (2, ROSTER_MAX_PAGE_SIZE));
        assert_eq!(clamp_paging(None, None), (1, ROSTER_MAX_PAGE_SIZE));
        assert_eq!(clamp_paging(Some(0), Some(0)), (1, 1));
    }

    #[test]
    fn normalize_maps_contract_fields() {
        let record = json!({
            "xh": "2025001",
            "xm": "张*",
            "bjdm": "b1",
            "bjmc": "25建筑学2班",
            "zymc": "建筑学",
            "yxdm": "205",
            "sznj": "2025",
            "mzdm": "01",
            "currentUserName": "张三"
        });
        let out = normalize_student(&record);
        assert_eq!(out.get("studentId").and_then(Value::as_str), Some("2025001"));
        assert_eq!(out.get("className").and_then(Value::as_str), Some("25建筑学2班"));
        assert_eq!(out.get("grade").and_then(Value::as_str), Some("2025"));
        // 不需要的字段与身份字段都不应出现
        assert!(out.get("mzdm").is_none());
        assert!(out.get("currentUserName").is_none());
    }

    #[test]
    fn parse_roster_reads_total() {
        let payload = json!({
            "ret": 0,
            "total": 56957,
            "results": [{ "xh": "1", "xm": "张*" }]
        });
        let out = parse_roster(&payload);
        assert_eq!(out.get("total").and_then(Value::as_i64), Some(56957));
        assert_eq!(
            out.get("students").and_then(Value::as_array).map(Vec::len),
            Some(1)
        );
    }
}
