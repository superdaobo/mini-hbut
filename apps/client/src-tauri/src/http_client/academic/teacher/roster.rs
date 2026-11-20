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
pub(crate) async fn fetch_roster_with(
    _client: &HbutClient,
    bjid: Option<String>,
    _page: Option<u32>,
    _page_size: Option<u32>,
    _keyword: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ROSTER_STUDENTS
    ));

    // 参数校验保留（将来接入可用接口时直接复用）。
    let bjid = bjid
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "缺少班级参数 bjid：学生名册接口不带班级会返回全校 56957 条，已拒绝请求".to_string()
        })?;

    crate::hbut_debug!(
        "[TeacherRoster] 已拒绝调用（接口不支持过滤，bjid={bjid}）—— 见 roster.rs 文档"
    );
    Err(
        "学生名册暂不可用：该接口对教师身份不支持任何过滤（实测 bjid/bjbh/bjmc/xh 全部无效，\
         恒返回全校 56957 条）。为避免批量返回学生个人信息，已禁用此功能。"
            .to_string(),
    )
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
