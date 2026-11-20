//! 考试事务：缓考任务 / 剩余试卷 / 评教信息（教师只读）—— goal-21 / T04a。
//!
//! ## 关键发现（2026-11-20 实测）
//!
//! recon 记录的三个路径（`hkrwcx` / `sysjList` / `xspjxxcx`）都是**服务端渲染 HTML 页面**
//! （63KB / 55KB / 84KB），直接请求拿不到 JSON。
//!
//! 真实数据在页面内嵌的 jqGrid AJAX 里（从各页面的 `url:` 定义提取）：
//!
//! | 用途 | 页面（HTML） | 真实数据接口 |
//! | --- | --- | --- |
//! | 缓考任务 | `/admin/kw/kwhkgl/hkrwcx` | `/admin/kw/kwhkgl/hkmdcxjg?lx=` |
//! | 剩余试卷 | `/admin/jsd/sjgl/sysjList` | `/admin/jsd/sjgl/ajaxSysj` |
//! | 评教信息 | `/admin/pj/xspjxxcx` | `/admin/pj/xspjxxcx/acustomList` |
//!
//! 三个数据接口实测均返回 `{ret:0,total:0,results:[]}`（本学期该教师无数据）。
//!
//! ⚠️ `pj/xspjjgcx/checkRefresh` 会触发服务端重算，**不在 allowlist 内，禁止调用**。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 解析考试事务三列表中的任一个（去掉框架注入的身份字段）。
pub(crate) fn parse_exam_affairs_list(payload: &Value) -> Vec<Value> {
    super::workflow::parse_workflow_list(payload)
}

/// 拉取缓考 / 剩余试卷 / 评教三列表，返回 `{ deferred, remainingPapers, evalInfo }`。
///
/// 三个请求互相独立，默认并发；错误优先级：缓考 → 试卷 → 评教。
pub(crate) async fn fetch_exam_affairs_with(
    client: &HbutClient,
    semester: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_EXAM_DEFERRED
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_EXAM_REMAINING_PAPERS
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_EXAM_EVAL_INFO
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let referer = format!("{}/admin/", client.jwxt_base_url());

    // 缓考接口必须带 `lx`（页面自身以 `?lx=` 空值调用）。
    let (deferred_result, papers_result, eval_result) = tokio::join!(
        grid::fetch_grid_with_params(
            client,
            readonly::PATH_EXAM_DEFERRED,
            semester.as_deref(),
            &referer,
            &[("lx", "")]
        ),
        grid::fetch_grid(
            client,
            readonly::PATH_EXAM_REMAINING_PAPERS,
            semester.as_deref(),
            &referer
        ),
        grid::fetch_grid(
            client,
            readonly::PATH_EXAM_EVAL_INFO,
            semester.as_deref(),
            &referer
        ),
    );

    let deferred = parse_exam_affairs_list(&deferred_result?);
    let remaining_papers = parse_exam_affairs_list(&papers_result?);
    let eval_info = parse_exam_affairs_list(&eval_result?);

    crate::hbut_debug!(
        "[TeacherExamAffairs] 缓考 {} 条 / 剩余试卷 {} 条 / 评教 {} 条",
        deferred.len(),
        remaining_papers.len(),
        eval_info.len()
    );

    // 三项全空时给前端一个显式信号：UI 应压成一句「本学期暂无相关事项」，
    // 而不是堆三个空列表（见 15-teacher-ui-spec §九）。
    let all_empty = deferred.is_empty() && remaining_papers.is_empty() && eval_info.is_empty();

    Ok(json!({
        "deferred": deferred,
        "remainingPapers": remaining_papers,
        "evalInfo": eval_info,
        "allEmpty": all_empty,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_returns_empty_for_zero_total() {
        let payload = json!({ "ret": 0, "total": 0, "results": [] });
        assert!(parse_exam_affairs_list(&payload).is_empty());
    }

    #[test]
    fn parse_strips_identity_fields() {
        let payload = json!({
            "ret": 0,
            "total": 1,
            "results": [{ "id": "1", "kcmc": "建筑物理", "currentUserName": "张三" }]
        });
        let out = parse_exam_affairs_list(&payload);
        assert_eq!(out.len(), 1);
        assert!(out[0].get("currentUserName").is_none());
    }

    #[test]
    fn all_empty_flag_semantics() {
        // 模拟 fetch 里的判定逻辑（三项全空 → true）
        let deferred: Vec<Value> = vec![];
        let papers: Vec<Value> = vec![];
        let eval: Vec<Value> = vec![];
        assert!(deferred.is_empty() && papers.is_empty() && eval.is_empty());
    }
}
