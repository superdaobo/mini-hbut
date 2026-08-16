//! 成绩领域模型：统一 DTO、结果语义（`GradeOutcome`）与绩点来源（`GradePointSource`）。
//!
//! 本模块是成绩数据的**唯一规范语义来源**：
//! - [`GradeRecord`]：跨 Tauri Command / HTTP Bridge 的统一成绩 DTO（[`Grade`] 是其兼容别名）。
//! - [`GradeRecord::outcome`]：把教务原始标记（sfbk/sfsq/cjbj/成绩文本）归一化为稳定语义。
//! - [`GradeRecord::grade_point`]：官方绩点（教务 `xfjd`）优先，缺失时按成绩估算。

use serde::{Deserialize, Serialize};

/// 统一成绩 DTO（规范类型）。
///
/// 字段语义与既有 `Grade` DTO 完全一致（[`Grade`] 是它的兼容别名），
/// 序列化契约不变，前端无需改动：`success/data/sync_time/offline/teacher_enrichment_pending`。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeRecord {
    /// 学年学期 (如 2024-2025-1)
    pub term: String,
    /// 课程名称
    pub course_name: String,
    /// 成绩记录编号
    pub grade_id: Option<String>,
    /// 课程号 (kch，教务系统可能不返回)
    pub course_code: Option<String>,
    /// 课程性质 (必修/选修)
    pub course_nature: String,
    /// 课程性质代码
    pub course_nature_code: String,
    /// 学分
    pub course_credit: String,
    /// 最终成绩（数字或定性文本，如 85 / 优秀 / 缺考；空表示待录入）
    pub final_score: String,
    /// 获得学分
    pub earned_credit: String,
    /// 学分绩点（官方，来自教务 xfjd/fxcj；空表示教务未提供）
    pub xfjd: String,
    /// 是否补考
    pub sfbk: String,
    /// 是否缓考
    pub sfsq: String,
    /// 成绩标记（1=补考 / 2=缓考 / 3=免修）
    pub cjbj: String,
    /// 任课教师（录入教师 cjlrjsxm）
    pub teacher: Option<String>,
    /// 课程编号，用于关联已选课程数据（如任课教师）
    #[serde(default)]
    pub kcbh: Option<String>,
    /// 任课教师（从已选课程数据获取，不同于录入教师 cjlrjsxm）
    #[serde(default)]
    pub course_teacher: Option<String>,
}

/// 兼容别名：既有代码/前端 DTO 语义统一到 [`GradeRecord`]。
pub type Grade = GradeRecord;

/// 成绩结果归一化语义。
///
/// 由教务原始标记（sfbk/sfsq/cjbj）与成绩文本推导，供跨通道一致消费。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GradeOutcome {
    /// 正常成绩（数字或定性成绩，如 85 / 优秀）
    Normal,
    /// 待录入：尚无成绩
    Pending,
    /// 缺考
    Absent,
    /// 缓考
    Deferred,
    /// 免修
    Exempt,
    /// 补考/重修记录
    Retake,
}

/// 绩点来源：官方（教务 `xfjd`）优先，缺失时按成绩估算。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GradePointSource {
    /// 官方绩点（教务系统返回）
    Official,
    /// 按成绩估算
    Estimated,
}

/// 定性成绩 → 参考分数（与前端 GradeView 换算一致）。
///
/// - 优秀 → 95
/// - 良好 / 中等 → 80
/// - 及格 / 合格 / 通过 → 60
/// - 不及格 / 不合格 / 未通过 / 挂科 → 0
pub fn qualitative_score(text: &str) -> Option<f64> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    // 注意：先判"不及格/不合格/未通过"，避免 "不及格".contains("及格") 误命中 60 分档
    if text.contains("不及格")
        || text.contains("不合格")
        || text.contains("未通过")
        || text.contains("挂科")
    {
        Some(0.0)
    } else if text.contains("优秀") {
        Some(95.0)
    } else if text.contains("良好") || text.contains("中等") {
        Some(80.0)
    } else if text.contains("及格") || text.contains("合格") || text.contains("通过") {
        Some(60.0)
    } else {
        None
    }
}

impl GradeRecord {
    /// 解析数字成绩；定性成绩映射为参考分数；空/无法识别返回 `None`。
    pub fn numeric_score(&self) -> Option<f64> {
        let text = self.final_score.trim();
        if text.is_empty() {
            return None;
        }
        if let Ok(score) = text.parse::<f64>() {
            return Some(score);
        }
        qualitative_score(text)
    }

    /// 归一化成绩结果语义（缺考 > 缓考 > 免修 > 补考/重修 > 待录入 > 正常）。
    pub fn outcome(&self) -> GradeOutcome {
        let final_score = self.final_score.trim();
        let cjbj = self.cjbj.trim();
        let combined = format!("{}|{}", final_score, cjbj);
        if combined.contains("缺考") {
            return GradeOutcome::Absent;
        }
        if self.sfsq.trim() == "1" || cjbj == "2" || combined.contains("缓考") {
            return GradeOutcome::Deferred;
        }
        if cjbj == "3"
            || combined.contains("免修")
            || combined.contains("免考")
            || combined.contains("免听")
        {
            return GradeOutcome::Exempt;
        }
        if self.sfbk.trim() == "1"
            || cjbj == "1"
            || combined.contains("补考")
            || combined.contains("重修")
        {
            return GradeOutcome::Retake;
        }
        if final_score.is_empty() {
            return GradeOutcome::Pending;
        }
        GradeOutcome::Normal
    }

    /// 官方绩点（教务 `xfjd`），缺失或不可解析返回 `None`。
    pub fn official_grade_point(&self) -> Option<f64> {
        let text = self.xfjd.trim();
        if text.is_empty() {
            return None;
        }
        text.parse::<f64>().ok()
    }

    /// 估算绩点：数字成绩 → `score / 10 - 5`（下限 0），与前端 GradeView 一致。
    pub fn estimated_grade_point(&self) -> Option<f64> {
        let score = self.numeric_score()?;
        Some((score / 10.0 - 5.0).max(0.0))
    }

    /// 有效绩点：**官方绩点优先**，其次按成绩估算。
    pub fn grade_point(&self) -> Option<f64> {
        self.official_grade_point()
            .or_else(|| self.estimated_grade_point())
    }

    /// 绩点来源：官方绩点可用时为 `Official`，否则 `Estimated`。
    pub fn grade_point_source(&self) -> GradePointSource {
        if self.official_grade_point().is_some() {
            GradePointSource::Official
        } else {
            GradePointSource::Estimated
        }
    }
}

/// 提取成绩中的所有非空学期（排序去重）。
pub fn grade_terms(grades: &[GradeRecord]) -> Vec<String> {
    let mut terms: Vec<String> = grades
        .iter()
        .map(|grade| grade.term.trim())
        .filter(|term| !term.is_empty())
        .map(|term| term.to_string())
        .collect();
    terms.sort();
    terms.dedup();
    terms
}

/// 当前（最新）成绩学期。
pub fn current_grade_semester(grades: &[GradeRecord]) -> Option<String> {
    grade_terms(grades).into_iter().last()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grade(final_score: &str, xfjd: &str, sfbk: &str, sfsq: &str, cjbj: &str) -> GradeRecord {
        GradeRecord {
            term: "2024-2025-1".to_string(),
            course_name: "测试课程".to_string(),
            grade_id: Some("1".to_string()),
            course_code: None,
            course_nature: "必修".to_string(),
            course_nature_code: "1".to_string(),
            course_credit: "3".to_string(),
            final_score: final_score.to_string(),
            earned_credit: "3".to_string(),
            xfjd: xfjd.to_string(),
            sfbk: sfbk.to_string(),
            sfsq: sfsq.to_string(),
            cjbj: cjbj.to_string(),
            teacher: None,
            kcbh: None,
            course_teacher: None,
        }
    }

    #[test]
    fn numeric_score_parses_digit_scores() {
        assert_eq!(grade("85", "", "", "", "").numeric_score(), Some(85.0));
        assert_eq!(grade("59.5", "", "", "", "").numeric_score(), Some(59.5));
        assert_eq!(grade("", "", "", "", "").numeric_score(), None);
    }

    #[test]
    fn numeric_score_maps_qualitative_scores() {
        assert_eq!(grade("优秀", "", "", "", "").numeric_score(), Some(95.0));
        assert_eq!(grade("良好", "", "", "", "").numeric_score(), Some(80.0));
        assert_eq!(grade("中等", "", "", "", "").numeric_score(), Some(80.0));
        assert_eq!(grade("合格", "", "", "", "").numeric_score(), Some(60.0));
        assert_eq!(grade("不及格", "", "", "", "").numeric_score(), Some(0.0));
    }

    #[test]
    fn outcome_classifies_normal_and_pending() {
        assert_eq!(grade("85", "", "", "", "").outcome(), GradeOutcome::Normal);
        assert_eq!(
            grade("优秀", "", "", "", "").outcome(),
            GradeOutcome::Normal
        );
        // 无成绩 → 待录入
        assert_eq!(grade("", "", "", "", "").outcome(), GradeOutcome::Pending);
    }

    #[test]
    fn outcome_classifies_absent_deferred_exempt_retake() {
        // 缺考（成绩文本）
        assert_eq!(
            grade("缺考", "", "", "", "").outcome(),
            GradeOutcome::Absent
        );
        // 缓考（sfsq=1 与 cjbj=2）
        assert_eq!(grade("", "", "", "1", "").outcome(), GradeOutcome::Deferred);
        assert_eq!(grade("", "", "", "", "2").outcome(), GradeOutcome::Deferred);
        assert_eq!(
            grade("缓考", "", "", "", "").outcome(),
            GradeOutcome::Deferred
        );
        // 免修（cjbj=3 与文本）
        assert_eq!(grade("", "", "", "", "3").outcome(), GradeOutcome::Exempt);
        assert_eq!(
            grade("免修", "", "", "", "").outcome(),
            GradeOutcome::Exempt
        );
        // 补考/重修（sfbk=1、cjbj=1 与文本）
        assert_eq!(grade("60", "", "1", "", "").outcome(), GradeOutcome::Retake);
        assert_eq!(grade("60", "", "", "", "1").outcome(), GradeOutcome::Retake);
        assert_eq!(
            grade("60", "", "", "", "重修").outcome(),
            GradeOutcome::Retake
        );
    }

    #[test]
    fn official_grade_point_takes_priority() {
        // 官方绩点存在 → 官方优先，忽略估算
        let g = grade("85", "4.2", "", "", "");
        assert_eq!(g.grade_point(), Some(4.2));
        assert_eq!(g.grade_point_source(), GradePointSource::Official);

        // 官方缺失 → 按成绩估算（85 → 3.5）
        let g = grade("85", "", "", "", "");
        assert_eq!(g.grade_point(), Some(3.5));
        assert_eq!(g.grade_point_source(), GradePointSource::Estimated);

        // 官方为 0（挂科场景）仍是官方来源
        let g = grade("50", "0", "", "", "");
        assert_eq!(g.grade_point(), Some(0.0));
        assert_eq!(g.grade_point_source(), GradePointSource::Official);
    }

    #[test]
    fn estimated_grade_point_uses_qualitative_mapping() {
        // 优秀 → 95 → 4.5
        assert_eq!(
            grade("优秀", "", "", "", "").estimated_grade_point(),
            Some(4.5)
        );
        // 不及格 → 0 → 0（下限钳制）
        assert_eq!(
            grade("不及格", "", "", "", "").estimated_grade_point(),
            Some(0.0)
        );
        // 待录入 → 无估算绩点
        assert_eq!(grade("", "", "", "", "").estimated_grade_point(), None);
    }

    #[test]
    fn grade_terms_are_sorted_and_deduped() {
        let mut a = grade("85", "", "", "", "");
        a.term = "2024-2025-2".to_string();
        let mut b = grade("80", "", "", "", "");
        b.term = "2024-2025-1".to_string();
        let mut c = grade("70", "", "", "", "");
        c.term = "2024-2025-1".to_string();
        let mut d = grade("60", "", "", "", "");
        d.term = "   ".to_string();

        let terms = grade_terms(&[a.clone(), b.clone(), c.clone(), d]);
        assert_eq!(terms, vec!["2024-2025-1", "2024-2025-2"]);
        assert_eq!(
            current_grade_semester(&[a, b, c]),
            Some("2024-2025-2".to_string())
        );
    }
}
