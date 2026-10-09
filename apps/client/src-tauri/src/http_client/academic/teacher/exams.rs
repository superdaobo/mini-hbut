//! 考试与监考（只读）—— E6（#1026）负责填充实现。
//!
//! E0 只登记只读路径并返回「未实现」，**绝不返回假数据**。
//!
//! 红线（E6 必须遵守，recon 05 §5）：
//! - **绝不**调用监考变更写接口（`changeJkjs` / `batchChangeJkjs`）；
//! - **绝不**调用试卷提交 / 上传 / 导出（`tjsq` / `sjsc` / `exportSysj`）。

use super::not_implemented;
use super::readonly;

/// 拉取监考安排与任课班级考试（归一化载荷由上层组装）。
///
/// E0 骨架：仅登记只读路径，未发起任何网络请求。
pub(crate) async fn fetch_exams(_semester: Option<String>) -> Result<serde_json::Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_INVIGILATION_LIST
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_COURSE_EXAM_LIST
    ));
    Err(not_implemented("考试与监考"))
}
