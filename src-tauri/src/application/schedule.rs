//! 课表领域 Application Service（Tauri Command 与 HTTP Bridge 共用）。
//!
//! 统一语义（与历史 Tauri `sync_schedule` 完全一致）：
//! - 目标学期解析：显式传参优先，其次 `resolve_schedule_context` 上下文，兜底默认学期
//! - 网络成功：meta 补充 `semester` / `total_courses` / `query_time`，写 `schedule_cache`
//! - 网络失败：无课表类错误固定返回「暂无可用课表」；显式指定学期时透传错误；
//!   未显式指定时命中缓存则降级返回 `offline=true` 旧快照，否则透传错误
//!
//! 本服务只读网络获取，通过快照克隆执行，网络 await 期间不持有全局锁，
//! 不阻塞登录等写型业务。

use serde_json::{json, Value};

use super::{ApplicationContext, ApplicationError};
use crate::{attach_sync_time, db};

#[derive(Clone)]
pub struct ScheduleService {
    context: ApplicationContext,
}

impl ScheduleService {
    pub fn new(context: ApplicationContext) -> Self {
        Self { context }
    }

    /// 统一课表同步用例（见模块文档）。
    pub async fn sync_schedule(&self, semester: Option<String>) -> Result<Value, ApplicationError> {
        let client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let requested_semester = semester
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let explicit_semester = requested_semester.is_some();

        let schedule_context = client
            .resolve_schedule_context(requested_semester.as_deref())
            .await;
        let semester_to_query = schedule_context
            .get("semester")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .or_else(|| requested_semester.clone())
            .unwrap_or_else(|| "2024-2025-1".to_string());

        match client
            .fetch_schedule(Some(semester_to_query.as_str()))
            .await
        {
            Ok((course_list, _now_week)) => {
                let mut meta = schedule_context;
                if let Some(map) = meta.as_object_mut() {
                    map.insert("semester".to_string(), json!(semester_to_query));
                    map.insert("total_courses".to_string(), json!(course_list.len()));
                    map.insert(
                        "query_time".to_string(),
                        json!(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                    );
                }
                let payload = json!({
                    "success": true,
                    "data": course_list,
                    "meta": meta,
                    "sync_time": chrono::Local::now().to_rfc3339(),
                    "offline": false
                });
                if let Some(uid) = uid.as_ref() {
                    if let Err(error) =
                        db::save_cache(self.context.db_path(), "schedule_cache", uid, &payload)
                    {
                        // 缓存失败不拖垮成功网络结果（#578）
                        eprintln!(
                            "[application] 缓存写入失败 table=schedule_cache key={uid}: {error}（已降级返回网络结果）"
                        );
                    }
                }
                Ok(payload)
            }
            Err(error) => {
                let msg = error.to_string();
                if crate::http_client::HbutClient::is_no_schedule_error_message(&msg) {
                    return Err(ApplicationError::validation("暂无可用课表"));
                }
                if explicit_semester {
                    return Err(ApplicationError::network(msg));
                }
                if let Some(uid) = uid.as_ref() {
                    if let Ok(Some((cached, sync_time))) =
                        db::get_cache(self.context.db_path(), "schedule_cache", uid)
                    {
                        return Ok(attach_sync_time(cached, &sync_time, true));
                    }
                }
                Err(ApplicationError::network(msg))
            }
        }
    }
}
