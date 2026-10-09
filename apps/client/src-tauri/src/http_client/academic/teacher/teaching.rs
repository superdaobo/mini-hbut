//! 我的教学：教学任务 + 教学班（只读）—— E5（#1025）负责填充实现。
//!
//! E0 只登记只读路径并返回「未实现」，**绝不返回假数据**。
//!
//! 关键陷阱（E5 必须遵守，recon 04 §1.1/§1.4）：
//! - `ajaxListJsJxrw`（6 条）与 `jsdQueryJxbList`（4 条）**粒度不同**，
//!   **禁止按数组索引拼接**，必须按可靠教学班 ID（`jxbid`）关联；
//! - `/admin/jsd/xskq/ajaxListJsJxrw` 是**学生考勤模块**，同名不同路径，**禁止误用**。

use super::not_implemented;
use super::readonly;

/// 拉取教学任务与我的教学班（归一化载荷由上层组装）。
///
/// E0 骨架：仅登记只读路径，未发起任何网络请求。
pub(crate) async fn fetch_teaching(_semester: Option<String>) -> Result<serde_json::Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHING_TASKS
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHING_CLASSES
    ));
    Err(not_implemented("我的教学"))
}
