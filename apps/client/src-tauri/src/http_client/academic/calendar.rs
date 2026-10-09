//! 校历数据：静态事件（`fetch_calendar`）与按学期拉取的校历
//! （`fetch_calendar_data`，复用 semester 子模块的周次归一化/摘要）。
//!
//! ## 师生共用 UI 的角色分流（Teacher Portal V2 / E4 #1024）
//!
//! 校历页面（`CalendarView`）师生共用，但教务系统对两个身份开放的是**两条不同路径**：
//!
//! | 身份 | 路径 |
//! | --- | --- |
//! | 学生 | `/admin/xsd/jcsj/xlgl/getData/{学期}` |
//! | 教师 | `/admin/system/zy/xlgl/getData/{学期}`（recon 03 §11，实测 200/27 周） |
//!
//! 分流点在这里（Rust 侧）按**真实会话角色**判定，前端不传身份参数。
//! 两条路径的响应结构一致（裸数组，字段 `xnxq/ny/zc/monday..sunday/*remark`），
//! 因此归一化到同一 UI 数据契约无需额外字段映射。

use super::super::*;
use super::teacher::readonly as teacher_readonly;
use chrono::{Datelike, Local};

/// 学生校历路径（教师访问无权限，仅学生链路使用）。
pub(crate) const STUDENT_CALENDAR_DATA_PATH: &str = "/admin/xsd/jcsj/xlgl/getData/{xnxq}";

/// 学期标签是否合法：`YYYY-YYYY-N`（N 为 1 或 2）。
///
/// 学期会被直接拼进请求路径，因此必须**先校验再拼接**：否则 `..`、`/` 等片段可让
/// 拼接结果逃出 allowlist 的前缀匹配范围。
pub(crate) fn is_valid_semester_label(semester: &str) -> bool {
    let mut parts = semester.trim().split('-');
    let (Some(start), Some(end), Some(term), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    let is_year = |value: &str| value.len() == 4 && value.chars().all(|c| c.is_ascii_digit());
    is_year(start) && is_year(end) && matches!(term, "1" | "2")
}

/// 按会话角色选择校历数据路径（教师 / 学生）。
///
/// 纯函数，供运行期分派与单元测试共用，避免「教师走学生路径」回归。
pub(crate) fn calendar_data_path_for_role(is_teacher: bool) -> &'static str {
    if is_teacher {
        teacher_readonly::PATH_CALENDAR_DATA
    } else {
        STUDENT_CALENDAR_DATA_PATH
    }
}

impl HbutClient {
    pub async fn fetch_calendar(
        &self,
    ) -> Result<Vec<CalendarEvent>, Box<dyn std::error::Error + Send + Sync>> {
        // 校历数据通常是静态的，这里返回示例数据
        Ok(vec![
            CalendarEvent {
                date: "2024-09-02".to_string(),
                title: "开学日".to_string(),
                event_type: "event".to_string(),
            },
            CalendarEvent {
                date: "2024-10-01".to_string(),
                title: "国庆节".to_string(),
                event_type: "holiday".to_string(),
            },
            CalendarEvent {
                date: "2025-01-13".to_string(),
                title: "期末考试开始".to_string(),
                event_type: "exam".to_string(),
            },
        ])
    }
    /// 获取校历数据 (与 Python calendar.py 一致)
    #[allow(unreachable_code)]
    pub async fn fetch_calendar_data(
        &self,
        semester: Option<String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let sem = match semester
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            Some(s) => s,
            None => {
                let context = self.resolve_schedule_context(None).await;
                context
                    .get("semester")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| Self::semester_by_date(Local::now().date_naive()))
            }
        };
        let today = Local::now().date_naive();

        // 按真实会话角色分派：教师走 `/admin/system/zy/xlgl/getData/{学期}`，
        // 学生走原有 `/admin/xsd/jcsj/xlgl/getData/{学期}`（前端不参与身份判定）。
        let is_teacher = self
            .user_info
            .as_ref()
            .map(|user| user.role.is_teacher())
            .unwrap_or(false);
        let raw_result = if is_teacher {
            self.fetch_teacher_calendar_raw_for_semester(&sem).await
        } else {
            self.fetch_calendar_raw_for_semester(&sem).await
        };

        let payload = match raw_result {
            Ok(data) => {
                let normalized_data = Self::normalize_calendar_week_numbers(&data);
                let summary = self.build_calendar_summary(&sem, &normalized_data, today);
                let current_weekday = if summary.as_ref().map(|s| s.is_in_semester).unwrap_or(false)
                {
                    Local::now().weekday().num_days_from_monday() as i32 + 1
                } else {
                    0
                };
                let meta = serde_json::json!({
                    "semester": sem,
                    "current_week": summary.as_ref().map(|s| s.current_week).unwrap_or(1),
                    "current_weekday": current_weekday,
                    "total_weeks": summary.as_ref().map(|s| s.total_weeks).unwrap_or_else(|| data.as_array().map(|a| a.len() as i32).unwrap_or(0)),
                    "start_date": summary.as_ref().map(|s| s.start_date_str()).unwrap_or_default(),
                    "end_date": summary.as_ref().map(|s| s.end_date_str()).unwrap_or_default(),
                    "is_in_semester": summary.as_ref().map(|s| s.is_in_semester).unwrap_or(false),
                    "days_to_start": summary.as_ref().map(|s| s.days_to_start(today)),
                    "days_to_end": summary.as_ref().map(|s| s.days_to_end(today))
                });
                serde_json::json!({
                    "success": true,
                    "data": normalized_data,
                    "meta": meta,
                    "sync_time": chrono::Local::now().to_rfc3339()
                })
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("会话已过期") || msg.to_lowercase().contains("login") {
                    serde_json::json!({
                        "success": false,
                        "error": "会话已过期，请重新登录",
                        "need_login": true
                    })
                } else {
                    serde_json::json!({
                        "success": false,
                        "error": msg
                    })
                }
            }
        };
        return Ok(payload);
        // 1. 获取当前学期 (如果未指定) - 使用基于日期的计算
        let sem = if let Some(s) = semester.filter(|s| !s.is_empty()) {
            s
        } else {
            // 使用基于日期的学期计算（更可靠）
            self.get_current_semester()
                .await
                .unwrap_or_else(|_| "2024-2025-1".to_string())
        };

        println!("[DEBUG] Fetching calendar for semester: {}", sem);

        // 2. 获取校历数据
        let calendar_url = format!(
            "{}/admin/xsd/jcsj/xlgl/getData/{}",
            self.academic_base_url(),
            sem
        );
        let response = self.client.get(&calendar_url).send().await?;

        let status = response.status();
        let final_url = response.url().to_string();

        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }

        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }

        let data: serde_json::Value = response.json().await?;

        // 计算当前周次
        let current_week = self.calculate_current_week(&data);

        // 构建元数据
        let meta = serde_json::json!({
            "semester": sem,
            "current_week": current_week,
            "total_weeks": data.as_array().map(|a| a.len()).unwrap_or(0)
        });

        Ok(serde_json::json!({
            "success": true,
            "data": data,
            "meta": meta,
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }

    /// 教师校历原始数据（`/admin/system/zy/xlgl/getData/{学期}`，recon 03 §11）。
    ///
    /// 与学生链路同结构（裸数组），差异仅在路径与权限；这里保留与学生链路一致的
    /// base 回退与登录页识别语义，但**不**复用学生路径函数（教师访问学生会 401）。
    async fn fetch_teacher_calendar_raw_for_semester(
        &self,
        semester: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 学期直接拼进路径，必须先按教务真实格式校验：否则可构造 `..` 等片段
        // 让 `replace` 后的路径逃出 allowlist 前缀（allowlist 对模板路径用前缀匹配）。
        if !is_valid_semester_label(semester) {
            return Err(format!("学期参数格式非法，已拒绝调用: {semester}").into());
        }
        let path = calendar_data_path_for_role(true).replace("{xnxq}", semester);
        // fail-closed：未登记在教师只读 allowlist 的路径一律拒绝。
        if !teacher_readonly::is_teacher_readonly_path(&path) {
            return Err(format!("教师只读路径未登记，已拒绝调用: {path}").into());
        }

        let primary = self.academic_base_url();
        let alternate = if primary == JWXT_BASE_URL {
            CHAOXING_JWXT_BASE_URL
        } else {
            JWXT_BASE_URL
        };
        let mut bases = vec![primary];
        if alternate != primary {
            bases.push(alternate);
        }

        let mut last_err = String::from("会话已过期，请重新登录");
        for base in bases {
            let url = format!("{}{}", base, path);
            let response = self
                .client
                .get(&url)
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header("Referer", format!("{}/admin/", base))
                .send()
                .await?;

            let status = response.status();
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                last_err = "会话已过期，请重新登录".to_string();
                continue;
            }
            if status.as_u16() == 401 {
                last_err = "没有访问当前校历接口的权限，请重新登录后重试".to_string();
                continue;
            }
            if !status.is_success() {
                last_err = format!("请求失败: {}", status);
                continue;
            }

            let text = response.text().await?;
            if let Some(err) = Self::teacher_query_body_error(&text) {
                last_err = err;
                continue;
            }
            let data: serde_json::Value =
                serde_json::from_str(&text).map_err(|e| format!("校历数据解析失败: {}", e))?;
            return Ok(data);
        }

        Err(last_err.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 教师角色必须命中教师校历路径（`/admin/system/zy/xlgl/getData/...`），
    /// 学生角色保持原学生路径不变。
    #[test]
    fn calendar_path_switches_by_role() {
        assert_eq!(
            calendar_data_path_for_role(true),
            teacher_readonly::PATH_CALENDAR_DATA
        );
        assert_eq!(
            calendar_data_path_for_role(false),
            STUDENT_CALENDAR_DATA_PATH
        );
        assert_ne!(
            calendar_data_path_for_role(true),
            calendar_data_path_for_role(false)
        );
    }

    /// 教师校历路径必须已登记在只读 allowlist（实例化后仍可识别）。
    #[test]
    fn teacher_calendar_path_is_registered_readonly() {
        let instantiated = calendar_data_path_for_role(true).replace("{xnxq}", "2026-2027-1");
        assert!(teacher_readonly::is_teacher_readonly_path(&instantiated));
        assert!(!teacher_readonly::path_has_write_verb(&instantiated));
    }

    /// 学期参数校验：只接受 `YYYY-YYYY-N`，阻断 `..` / 斜杠等路径穿越片段。
    #[test]
    fn semester_label_validation_rejects_path_traversal() {
        assert!(is_valid_semester_label("2026-2027-1"));
        assert!(is_valid_semester_label("2026-2027-2"));
        assert!(is_valid_semester_label(" 2026-2027-1 "));

        assert!(!is_valid_semester_label("2026-2027-3"));
        assert!(!is_valid_semester_label("2026-2027-01"));
        assert!(!is_valid_semester_label("2026-2027-1/../updateState"));
        assert!(!is_valid_semester_label(
            "../../admin/system/tzsjx/updateState"
        ));
        assert!(!is_valid_semester_label("2026-2027"));
        assert!(!is_valid_semester_label(""));
    }
}
