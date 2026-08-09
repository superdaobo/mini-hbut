//! 校历数据：静态事件（`fetch_calendar`）与按学期拉取的校历
//! （`fetch_calendar_data`，复用 semester 子模块的周次归一化/摘要）。

use super::super::*;
use chrono::{Datelike, Local};

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

        let payload = match self.fetch_calendar_raw_for_semester(&sem).await {
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
}
