//! 教师个人资料（只读）—— E2（#1022）负责填充实现。
//!
//! E0 只登记只读路径并返回「未实现」，**绝不返回假数据**。
//!
//! 红线（E2 必须遵守）：
//! - **绝不**调用学生专属接口（`/admin/xsd/xsjbxx/xskp`、`/v2/student_info`、`student_login_access`）；
//! - **绝不**触发教师卡片修改类写接口（如 `/admin/sz/szjsjbxx/updateQueryJsxxFroJsd`）。

use super::not_implemented;
use super::readonly;

/// 拉取教师个人资料（工号 / 姓名 / 角色 / 部门 ID）。
///
/// E0 骨架：仅登记只读路径，未发起任何网络请求。
pub(crate) async fn fetch_profile() -> Result<serde_json::Value, String> {
    // 只读路径登记校验（fail-closed）：E2 实现时只允许使用已登记路径。
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHER_HOME
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_GET_MENU_LIST
    ));
    Err(not_implemented("教师个人资料"))
}
