use chrono::Local;
use serde_json::{json, Value};

use super::{ApplicationContext, ApplicationError};
use crate::{attach_sync_time, db};

#[derive(Clone)]
pub struct AcademicReadService {
    context: ApplicationContext,
}

impl AcademicReadService {
    pub fn new(context: ApplicationContext) -> Self {
        Self { context }
    }

    pub async fn fetch_exams(&self, semester: Option<String>) -> Result<Value, ApplicationError> {
        let client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let semester_key = semester.clone().unwrap_or_else(|| "current".to_string());
        let cache_key = uid.as_ref().map(|value| format!("{value}:{semester_key}"));

        match client.fetch_exams(semester.as_deref()).await {
            Ok(exams) => {
                let sync_time = Local::now().to_rfc3339();
                let payload = json!({
                    "success": true,
                    "data": exams,
                    "sync_time": sync_time,
                    "offline": false
                });
                if let Some(key) = cache_key.as_ref() {
                    let _ = db::save_cache(self.context.db_path(), "exams_cache", key, &payload);
                }
                Ok(payload)
            }
            Err(error) => {
                if let Some(key) = cache_key.as_ref() {
                    if let Ok(Some((cached, sync_time))) =
                        db::get_cache(self.context.db_path(), "exams_cache", key)
                    {
                        return Ok(attach_sync_time(cached, &sync_time, true));
                    }
                }
                Err(ApplicationError::network(error.to_string()))
            }
        }
    }

    pub async fn fetch_ranking(
        &self,
        student_id: Option<String>,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        let client = self.context.client_snapshot().await;
        if !client.is_logged_in && client.user_info.is_none() {
            return Err(ApplicationError::unauthorized("请先登录后再查询排名"));
        }
        let sid = student_id.or_else(|| {
            client
                .user_info
                .as_ref()
                .map(|user| user.student_id.clone())
        });
        let semester_key = semester.clone().unwrap_or_else(|| "current".to_string());
        let cache_key = sid.as_ref().map(|value| format!("{value}:{semester_key}"));

        match client
            .fetch_ranking(sid.as_deref(), semester.as_deref())
            .await
        {
            Ok(data) => {
                let sync_time = Local::now().to_rfc3339();
                let payload = attach_sync_time(data, &sync_time, false);
                if let Some(key) = cache_key.as_ref() {
                    let _ = db::save_cache(self.context.db_path(), "ranking_cache", key, &payload);
                }
                Ok(payload)
            }
            Err(error) => {
                if let Some(key) = cache_key.as_ref() {
                    if let Ok(Some((cached, sync_time))) =
                        db::get_cache(self.context.db_path(), "ranking_cache", key)
                    {
                        return Ok(attach_sync_time(cached, &sync_time, true));
                    }
                }
                Err(ApplicationError::network(error.to_string()))
            }
        }
    }

    pub async fn fetch_student_info(&self) -> Result<Value, ApplicationError> {
        let client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone())
            .or_else(|| client.last_username.clone());

        match client.fetch_student_info().await {
            Ok(data) => {
                let sync_time = Local::now().to_rfc3339();
                let payload = attach_sync_time(data, &sync_time, false);
                if let Some(uid) = uid.as_ref() {
                    let _ =
                        db::save_cache(self.context.db_path(), "studentinfo_cache", uid, &payload);
                }
                Ok(payload)
            }
            Err(error) => {
                if let Some(uid) = uid.as_ref() {
                    if let Ok(Some((cached, sync_time))) =
                        db::get_cache(self.context.db_path(), "studentinfo_cache", uid)
                    {
                        return Ok(attach_sync_time(cached, &sync_time, true));
                    }
                }
                Err(ApplicationError::network(error.to_string()))
            }
        }
    }
}
