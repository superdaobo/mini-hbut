//! 学习通「考试」跨课程聚合（P4-B，#1343）。
//!
//! 与 [`super::chaoxing_work`] 共用同一份待办采集与 60s 缓存 —— 两个页面看到的是
//! 同一批上游数据，只是按 `eventType` 分流，避免重复发 136 次请求。
//!
//! ## 实测结论（2026-11-20，34 门课全量）
//!
//! `eventType=exam` 只出现在 `importWeekTask` 维度（共 7 条），样本：
//! `{"eventType":"exam","name":"《教育学》测试二","endTimeStr":"2026-12-12 23:55",
//!   "url":"https://mooc1.chaoxing.com/exam/test/examcode/examnotes?examId=…"}`
//!
//! 学习通 PC 端的 `exam-ans/mooc2/exam/exam-list` 实测返回「参数传递不正确 / 无权限的操作」
//! 的空壳页（真实数据由前端 XHR 拉取），因此不走那个入口。
//!
//! ## 硬边界
//!
//! 只展示安排与倒计时，**绝不提供进入考试 / 答题 / 交卷 / 查看答卷的入口**。

use serde_json::{json, Value};

use super::chaoxing_work::{collect_pending_tasks, parse_courses, summarize};
use super::shared::{now_sync_time, DynError};
use crate::http_client::HbutClient;

/// 考试清单：`eventType=exam`，附带「最近开考」与统计。
pub(crate) async fn chaoxing_fetch_exams_all_courses(
    client: &mut HbutClient,
    semester: Option<&str>,
    force: bool,
) -> Result<Value, DynError> {
    let payload = super::chaoxing_courses::chaoxing_fetch_courses(client, None, force).await?;
    let courses = parse_courses(&payload, semester);
    let (bundle, from_cache) = collect_pending_tasks(client, &courses, force).await?;
    let exams: Vec<_> = bundle
        .items
        .iter()
        .filter(|item| item.event_type == "exam")
        .cloned()
        .collect();
    let stats = summarize(&exams, 0);
    let nearest = exams.first().map(|item| {
        json!({
            "name": item.name,
            "course": item.course,
            "deadline_text": item.deadline_text,
        })
    });
    Ok(json!({
        "success": true,
        "items": exams,
        "stats": stats,
        "nearest": nearest,
        "courses": courses.len(),
        "failed_courses": bundle.failed_courses,
        "cached": from_cache,
        "semester": semester.unwrap_or(""),
        "sync_time": now_sync_time(),
        "notice": "本页仅显示考试安排，考试请到学习通官方页",
    }))
}
