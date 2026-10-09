//! 教师业务 Application Service（Teacher Portal V2 / #1019）。
//!
//! Tauri Command 与本地 HTTP Bridge 共用本服务；本层负责：
//! 1. **权限校验**：只接受教务真实会话中的教师身份
//!    （`UserInfo.role`，由登录 / 会话恢复链写入），**不接受前端传 `teacher=true` 绕过**；
//! 2. **只读路径校验**：调用前确认目标路径已登记在
//!    [`crate::http_client::academic::teacher::readonly`] 的 allowlist（fail-closed）；
//! 3. **错误归一化**：统一为 [`ApplicationError`]，由传输层映射为字符串。
//!
//! E0 阶段各业务实现均为 stub（返回「未实现」，**绝不返回假数据**）；
//! E2/E5/E6 只替换 `teacher/{profile,teaching,exams}.rs`，本文件无需改动。

use serde_json::Value;

use super::{ApplicationContext, ApplicationError};
use crate::http_client::academic::teacher::{exams, not_implemented, profile, readonly, teaching};

#[derive(Clone)]
pub struct TeacherService {
    context: ApplicationContext,
}

impl TeacherService {
    pub fn new(context: ApplicationContext) -> Self {
        Self { context }
    }

    /// 权限校验：当前会话必须是教师身份。
    async fn ensure_teacher_session(&self) -> Result<(), ApplicationError> {
        let client = self.context.client_snapshot().await;
        let is_teacher = client
            .user_info
            .as_ref()
            .map(|user| user.role.is_teacher())
            .unwrap_or(false);
        if !is_teacher {
            return Err(ApplicationError::unauthorized(
                "当前会话不是教师身份，无法访问教师功能",
            ));
        }
        Ok(())
    }

    /// 只读路径校验（fail-closed）：未登记的路径一律拒绝。
    fn ensure_registered_path(path: &str) -> Result<(), ApplicationError> {
        if readonly::is_teacher_readonly_path(path) {
            Ok(())
        } else {
            Err(ApplicationError::internal(format!(
                "教师只读路径未登记，已拒绝调用: {path}"
            )))
        }
    }

    /// 教师个人资料（E2 #1022 实现 `teacher/profile.rs`）。
    pub async fn fetch_profile(&self) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_TEACHER_HOME)?;
        Self::ensure_registered_path(readonly::PATH_GET_MENU_LIST)?;
        profile::fetch_profile_with(&client)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 我的教学：教学任务 + 教学班（E5 #1025 实现 `teacher/teaching.rs`）。
    pub async fn fetch_teaching(
        &self,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_TEACHING_TASKS)?;
        Self::ensure_registered_path(readonly::PATH_TEACHING_CLASSES)?;
        teaching::fetch_teaching_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 考试与监考（E6 #1026 实现 `teacher/exams.rs`）。
    pub async fn fetch_exams(&self, semester: Option<String>) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_INVIGILATION_LIST)?;
        Self::ensure_registered_path(readonly::PATH_COURSE_EXAM_LIST)?;
        exams::fetch_exams_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 教务通知列表（只读）。
    ///
    /// ⚠️ E3（#1023）按执行规划复用既有 `modules/school_inbox.rs` 的 portal 只读链路，
    /// 因此本命令在 E0 之后**可能保持「未实现」**；由整合负责人（E8）决定是否接线。
    /// 无论是否实现，教师通知都**绝不**写服务端（不调 `updateState`）。
    pub async fn fetch_notices(
        &self,
        page: Option<i64>,
        page_size: Option<i64>,
        keyword: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        Self::ensure_registered_path(readonly::PATH_NOTICE_INBOX)?;
        let _ = (page, page_size, keyword);
        Err(ApplicationError::internal(not_implemented("教务通知")))
    }
}
