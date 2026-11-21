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
use crate::http_client::academic::teacher::{
    adjustment, attendance, class_schedule, credits, exam_affairs, exams, grade_entry,
    not_implemented, portal_cards, profile, readonly, roster, schedule_extra, teaching, workload,
    workflow,
};

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

    // ────────────────────────────────────────────────────────────────
    // goal-21：教师端新增只读查询（考勤 / 工作量 / 工作流 / 考试事务 / 学分 /
    // 调停补 / 名册 / 成绩录入 / 课表列表 / 门户卡 / 学习通教师侧）
    // ────────────────────────────────────────────────────────────────

    /// 学生考勤统计。
    pub async fn fetch_attendance(
        &self,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_ATTENDANCE_LIST)?;
        attendance::fetch_attendance_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 教师端工作量（`/twork` 微服务）。
    pub async fn fetch_workload(&self, semester: Option<String>) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        // `/twork` 不走 `/admin` 前缀，用独立白名单校验。
        if !readonly::is_teacher_workload_readonly_path(readonly::PATH_WORKLOAD_SUMMARY) {
            return Err(ApplicationError::internal(
                "工作量微服务路径未登记，已拒绝调用",
            ));
        }
        workload::fetch_workload_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 只读工作流：我的申请 / 经办 / 待办。
    pub async fn fetch_workflow(&self, semester: Option<String>) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_WORKFLOW_MY_APPLY)?;
        Self::ensure_registered_path(readonly::PATH_WORKFLOW_MY_HANDLED)?;
        Self::ensure_registered_path(readonly::PATH_WORKFLOW_MY_TODO)?;
        workflow::fetch_workflow_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 考试事务：缓考 / 剩余试卷 / 评教。
    pub async fn fetch_exam_affairs(
        &self,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_EXAM_DEFERRED)?;
        Self::ensure_registered_path(readonly::PATH_EXAM_REMAINING_PAPERS)?;
        Self::ensure_registered_path(readonly::PATH_EXAM_EVAL_INFO)?;
        exam_affairs::fetch_exam_affairs_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 学分统计（教师视角）。
    pub async fn fetch_credits(&self, semester: Option<String>) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_CREDITS_LIST)?;
        Self::ensure_registered_path(readonly::PATH_CREDITS_FAILED_COURSES)?;
        credits::fetch_credits_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 调停补申请（只读）。
    pub async fn fetch_adjustment(
        &self,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_ADJUSTMENT_MY_APPLY)?;
        Self::ensure_registered_path(readonly::PATH_ADJUSTMENT_APPLICABLE)?;
        adjustment::fetch_adjustment_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 学生名册（`bjid` 必填；缺失时由 roster 层直接拒绝，不发请求）。
    pub async fn fetch_roster(
        &self,
        bjid: Option<String>,
        page: Option<u32>,
        page_size: Option<u32>,
        keyword: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_ROSTER_STUDENTS)?;
        roster::fetch_roster_with(&client, bjid, page, page_size, keyword)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 成绩录入进度 + 教学班发布状态。
    pub async fn fetch_grade_entry(
        &self,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_GRADE_ENTRY_PROGRESS)?;
        Self::ensure_registered_path(readonly::PATH_TEACHING_CLASSES)?;
        grade_entry::fetch_grade_entry_with(&client, semester)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 课表扩展：班级列表 + 教室列表 + 课表页 URL。
    pub async fn fetch_schedule_lists(
        &self,
        semester: Option<String>,
        keyword: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_CLASS_LIST)?;
        Self::ensure_registered_path(readonly::PATH_ROOM_LIST)?;
        schedule_extra::fetch_schedule_lists_with(&client, semester, keyword)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 班级课表**结构化数据**（goal-22：应用内渲染，不再外跳浏览器）。
    pub async fn fetch_class_schedule(
        &self,
        encode_id: Option<String>,
        semester: Option<String>,
        campus_id: Option<String>,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        Self::ensure_registered_path(readonly::PATH_CLASS_SCHEDULE_LIST)?;
        class_schedule::fetch_class_schedule_with(&client, encode_id, semester, campus_id)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 融合门户卡片（8 张卡 + 角标）。
    pub async fn fetch_portal_cards(&self) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        if !readonly::is_teacher_portal_readonly_path(readonly::PATH_PORTAL_PAGE_VIEW) {
            return Err(ApplicationError::internal("门户路径未登记，已拒绝调用"));
        }
        portal_cards::fetch_portal_cards_with(&client)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 学习通教师侧：课程与教学班频道。
    pub async fn fetch_chaoxing_courses(&self) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        crate::modules::chaoxing_teacher::fetch_teacher_courses(&client)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 学习通教师侧：学情（6 个维度）。
    pub async fn fetch_chaoxing_analytics(
        &self,
        courseid: String,
        clazzid: String,
        cpi: String,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        crate::modules::chaoxing_teacher::fetch_teacher_analytics(
            &client, &courseid, &clazzid, &cpi,
        )
        .await
        .map_err(ApplicationError::internal)
    }

    /// 学习通教师侧：全班成绩明细。
    pub async fn fetch_chaoxing_scores(
        &self,
        courseid: String,
        clazzid: String,
        cpi: String,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        crate::modules::chaoxing_teacher::fetch_teacher_scores(&client, &courseid, &clazzid, &cpi)
            .await
            .map_err(ApplicationError::internal)
    }

    /// 学习通教师侧：学习监控。
    pub async fn fetch_chaoxing_monitor(
        &self,
        courseid: String,
        clazzid: String,
        cpi: String,
    ) -> Result<Value, ApplicationError> {
        self.ensure_teacher_session().await?;
        let client = self.context.client_snapshot().await;
        crate::modules::chaoxing_teacher::fetch_teacher_monitor(&client, &courseid, &clazzid, &cpi)
            .await
            .map_err(ApplicationError::internal)
    }
}
