//! 学习通（chaoxing）教师侧只读查询 —— goal-21 / T04c。
//!
//! ## 与 `online_learning::*` 的关系
//!
//! `online_learning` 下的 `chaoxing_*` 全部是**学生视角**（`ut=s`，`study-data/*` 需要
//! `pEnc` 两段式）。教师侧是**另一套语义**：
//!
//! | 维度 | 学生 `ut=s` | 教师 `ut=t` |
//! | --- | --- | --- |
//! | 课程 | `mycourse/studentcourse` | `fycourse/fyportal/courselist/getMyCourseJson`（9 门，role=1/2） |
//! | 学情 | `study-data/*`（**需 pEnc**，无则 403） | `stat2/teach-data/*`（**不需要 pEnc**，直接 200） |
//! | 成绩 | 个人成绩 | `score-data/scoreList`（全班，含 `attend`/`video`/`taskEngineScore`） |
//! | 监控 | 无 | `study-monitor/v2/studyList`（`unnormalType` 异常标记） |
//!
//! 因此本模块独立于 `online_learning`，**不复用**其 `ut=s` 常量。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! ```text
//! GET mooc1-api/mycourse/backclazzdata            → {result:1, channelList:14}
//! GET fycourse/fyportal/courselist/getMyCourseJson → [ {DTYPE:"Course", …} ]（17KB）
//! GET stat2/teach-data/worknum?…&ut=t              → {avg_finish,total,submit,avg_work_score,…}
//! GET stat2/score-data/scoreList?…&ut=t            → {code:0, data:[{userid,attend,video,…}]}
//! GET stat2/study-monitor/v2/studyList?…&ut=t      → {code:0, data:[], count:0, pageInfo:{…}}
//! ```
//!
//! ⚠️ `ut=t` 是教师标识，**缺失或为 `s` 时 `stat2` 会按学生身份处理**（学生侧部分端点 403）。

use serde_json::{json, Value};

use crate::http_client::HbutClient;

/// 学习通统计域（学情 / 成绩 / 监控）。
pub(crate) const CX_STAT2_BASE: &str = "https://stat2-ans.chaoxing.com";
/// 学习通移动 API（课程频道）。
pub(crate) const CX_MOOC1_API_BASE: &str = "https://mooc1-api.chaoxing.com";
/// 泛雅课程后台（教师课程列表）。
pub(crate) const CX_FYCOURSE_BASE: &str = "https://fycourse.fanya.chaoxing.com";

/// 教师学情维度（`stat2/teach-data/{dim}`）。
///
/// 实测 16 个端点可用，这里取 UI 实际展示的 6 个核心维度；其余按需追加。
pub(crate) const ANALYTICS_DIMENSIONS: &[&str] = &[
    "worknum",   // 作业
    "examnum",   // 考试
    "sign",      // 签到
    "score",     // 成绩
    "pv",        // 访问量
    "monitor",   // 学习监控概览
];

/// 教师请求的统一查询参数（`ut=t` 是身份标识，不能漏）。
fn teacher_query(courseid: &str, clazzid: &str, cpi: &str) -> Vec<(String, String)> {
    vec![
        ("courseid".into(), courseid.into()),
        ("clazzid".into(), clazzid.into()),
        ("cpi".into(), cpi.into()),
        ("ut".into(), "t".into()),
    ]
}

/// 发一次学习通 GET 并解析 JSON。
async fn cx_get(
    client: &HbutClient,
    url: &str,
    query: &[(String, String)],
) -> Result<Value, String> {
    let response = client
        .client
        .get(url)
        .query(query)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://mooc1.chaoxing.com/")
        .send()
        .await
        .map_err(|e| format!("学习通请求失败: {e}"))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取学习通响应失败: {e}"))?;
    if !(200..300).contains(&status) {
        return Err(format!("学习通接口状态异常: HTTP {status}"));
    }
    let trimmed = body.trim_start_matches('\u{feff}');
    if trimmed.trim_start().starts_with('<') {
        return Err("学习通返回 HTML（会话可能已过期）".to_string());
    }
    serde_json::from_str(trimmed).map_err(|e| format!("学习通响应解析失败: {e}"))
}

/// 归一化教师课程记录（`getMyCourseJson` 的每条）。
///
/// 字段映射：`courseid`→`courseId`、`name`→`courseName`、`clazzid`→`classId`、
/// `clazzname`→`className`、`role`→`role`（1 主讲 / 2 协作）、`cpi`→`cpi`、
/// `studentcount`→`studentCount`。
pub(crate) fn normalize_teacher_course(record: &Value) -> Value {
    let text = |field: &str| {
        record
            .get(field)
            .and_then(|value| match value {
                Value::String(text) => Some(text.clone()),
                Value::Number(number) => Some(number.to_string()),
                _ => None,
            })
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    };
    json!({
        "courseId": text("courseid"),
        "courseName": text("name"),
        "classId": text("clazzid"),
        "className": text("clazzname"),
        "role": text("role"),
        "cpi": text("cpi"),
        "studentCount": record.get("studentcount").and_then(Value::as_f64),
    })
}

/// 解析 `getMyCourseJson`（裸数组）→ 归一化课程数组。
pub(crate) fn parse_teacher_courses(payload: &Value) -> Vec<Value> {
    let items = payload.as_array().cloned().unwrap_or_default();
    items.iter().map(normalize_teacher_course).collect()
}

/// 解析 `backclazzdata` → 教学班频道（只保留 `roletype=3` 的教师频道）。
///
/// 实测 `content.roletype=3` 表示教师身份（学生为 1）。
pub(crate) fn parse_teacher_channels(payload: &Value) -> Vec<Value> {
    let channels = payload
        .get("channelList")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    channels
        .iter()
        .filter_map(|channel| {
            let content = channel.get("content")?;
            let roletype = content.get("roletype").and_then(Value::as_i64);
            if roletype != Some(3) {
                return None;
            }
            Some(json!({
                "className": content.get("name").and_then(Value::as_str),
                "studentCount": content.get("studentcount").and_then(Value::as_f64),
                "clazzId": content.get("id").and_then(|v| match v {
                    Value::Number(n) => Some(n.to_string()),
                    Value::String(s) => Some(s.clone()),
                    _ => None,
                }),
                "cpi": content.get("cpi").and_then(|v| match v {
                    Value::Number(n) => Some(n.to_string()),
                    Value::String(s) => Some(s.clone()),
                    _ => None,
                }),
                "roletype": roletype,
            }))
        })
        .collect()
}

/// 拉取教师课程与教学班频道，返回 `{ courses, channels }`。
pub(crate) async fn fetch_teacher_courses(client: &HbutClient) -> Result<Value, String> {
    let courses_url = format!("{CX_FYCOURSE_BASE}/fyportal/courselist/getMyCourseJson");
    let channels_url = format!("{CX_MOOC1_API_BASE}/mycourse/backclazzdata");

    // 注意：查询参数必须先绑定到变量。直接写 `&[("view".into(), …)]` 会产生临时数组，
    // 在 `tokio::join!` 的 await 点被 drop（rustc E0716）。
    let channels_query: Vec<(String, String)> =
        vec![("view".into(), "json".into()), ("rss".into(), "1".into())];
    let empty_query: Vec<(String, String)> = Vec::new();

    let (courses_result, channels_result) = tokio::join!(
        cx_get(client, &courses_url, &empty_query),
        cx_get(client, &channels_url, &channels_query),
    );

    let courses = parse_teacher_courses(&courses_result?);
    let channels = parse_teacher_channels(&channels_result?);

    crate::hbut_debug!(
        "[ChaoxingTeacher] 课程 {} 门 / 教学班频道 {} 个",
        courses.len(),
        channels.len()
    );

    Ok(json!({ "courses": courses, "channels": channels }))
}

/// 拉取教师学情（6 个维度），返回 `{ dimensions: { 名称: 原始载荷 } }`。
///
/// 单个维度失败**不影响整体**（该维度记 `null`），因为不同课程开放的维度不同。
pub(crate) async fn fetch_teacher_analytics(
    client: &HbutClient,
    courseid: &str,
    clazzid: &str,
    cpi: &str,
) -> Result<Value, String> {
    let query = teacher_query(courseid, clazzid, cpi);
    let mut dimensions = serde_json::Map::new();

    for dimension in ANALYTICS_DIMENSIONS {
        let url = format!("{CX_STAT2_BASE}/stat2/teach-data/{dimension}");
        let value = match cx_get(client, &url, &query).await {
            Ok(payload) => payload,
            Err(error) => {
                crate::hbut_debug!("[ChaoxingTeacher] 维度 {dimension} 失败: {error}");
                Value::Null
            }
        };
        dimensions.insert((*dimension).to_string(), value);
    }

    crate::hbut_debug!(
        "[ChaoxingTeacher] 学情维度 {} 个（课程 {courseid}）",
        dimensions.len()
    );
    Ok(json!({ "dimensions": dimensions }))
}

/// 拉取全班成绩明细（`score-data/scoreList`）。
///
/// ⚠️ 返回 60+ 字段的学生明细，**本函数不做本地缓存**（隐私要求）。
pub(crate) async fn fetch_teacher_scores(
    client: &HbutClient,
    courseid: &str,
    clazzid: &str,
    cpi: &str,
) -> Result<Value, String> {
    let url = format!("{CX_STAT2_BASE}/stat2/score-data/scoreList");
    let payload = cx_get(client, &url, &teacher_query(courseid, clazzid, cpi)).await?;
    let rows = payload
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    crate::hbut_debug!("[ChaoxingTeacher] 成绩明细 {} 条", rows.len());
    Ok(json!({ "students": rows, "count": rows.len() }))
}

/// 拉取学习监控列表（`study-monitor/v2/studyList`）。
pub(crate) async fn fetch_teacher_monitor(
    client: &HbutClient,
    courseid: &str,
    clazzid: &str,
    cpi: &str,
) -> Result<Value, String> {
    let url = format!("{CX_STAT2_BASE}/stat2/study-monitor/v2/studyList");
    let payload = cx_get(client, &url, &teacher_query(courseid, clazzid, cpi)).await?;
    let rows = payload
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let count = payload.get("count").and_then(Value::as_i64).unwrap_or(0);
    crate::hbut_debug!("[ChaoxingTeacher] 监控 {} 条（count={count}）", rows.len());
    Ok(json!({ "students": rows, "count": count }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_courses_maps_fields() {
        let payload = json!([{
            "courseid": 267998043,
            "name": "计算机制图与表达-1",
            "clazzid": 157018968,
            "clazzname": "25建筑学1",
            "role": 1,
            "cpi": 446042523,
            "studentcount": 61
        }]);
        let out = parse_teacher_courses(&payload);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].get("courseId").and_then(Value::as_str), Some("267998043"));
        assert_eq!(out[0].get("courseName").and_then(Value::as_str), Some("计算机制图与表达-1"));
        assert_eq!(out[0].get("studentCount").and_then(Value::as_f64), Some(61.0));
    }

    #[test]
    fn parse_channels_filters_by_roletype_three() {
        let payload = json!({
            "result": 1,
            "channelList": [
                { "content": { "roletype": 3, "name": "教学班A", "studentcount": 61, "id": 1, "cpi": 2 } },
                { "content": { "roletype": 1, "name": "学生班B", "studentcount": 30, "id": 2, "cpi": 2 } }
            ]
        });
        let out = parse_teacher_channels(&payload);
        assert_eq!(out.len(), 1, "只应保留 roletype=3 的教师频道");
        assert_eq!(out[0].get("className").and_then(Value::as_str), Some("教学班A"));
        assert_eq!(out[0].get("roletype").and_then(Value::as_i64), Some(3));
    }

    #[test]
    fn parse_channels_handles_empty() {
        assert!(parse_teacher_channels(&json!({ "result": 1, "channelList": [] })).is_empty());
        assert!(parse_teacher_channels(&json!({})).is_empty());
    }

    #[test]
    fn teacher_query_always_carries_ut_t() {
        let query = teacher_query("1", "2", "3");
        let ut = query.iter().find(|(key, _)| key == "ut");
        assert_eq!(ut.map(|(_, value)| value.as_str()), Some("t"));
    }

    #[test]
    fn analytics_dimensions_cover_six_core() {
        assert_eq!(ANALYTICS_DIMENSIONS.len(), 6);
        for dimension in ["worknum", "examnum", "sign", "score", "pv", "monitor"] {
            assert!(ANALYTICS_DIMENSIONS.contains(&dimension), "缺少维度 {dimension}");
        }
    }
}
