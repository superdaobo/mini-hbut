//! 成绩领域（grade domain）。
//!
//! 统一成绩 DTO、结果语义（`GradeOutcome`）与绩点来源（`GradePointSource`），
//! 并承载 Tauri Command 与 HTTP Bridge 共享的成绩同步用例（`service`）。
//!
//! 分层：
//! - [`domain`]：纯领域模型与计算（无网络、无存储依赖）。
//! - [`service`]：共享 use-case（抓取 → 教师合并 → 缓存成功替换/失败保留 → offline 元数据）。

pub mod domain;
pub mod service;

pub use domain::{
    current_grade_semester, grade_terms, Grade, GradeOutcome, GradePointSource, GradeRecord,
};
pub use service::{
    merge_teacher_cache_into_payload, EnrichmentJob, GradeCacheStore, GradeService, GradeSource,
    SqliteGradeCache, SyncGradesResult,
};
