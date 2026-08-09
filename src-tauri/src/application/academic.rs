//! 教务/学术领域只读 Application Service。
//!
//! Tauri Command 与 HTTP Bridge 共用本服务的「网络优先 + 缓存降级」语义：
//! - 网络成功：返回 `attach_sync_time(offline=false)` 的结果；缓存写失败仅告警，
//!   不拖垮成功网络结果（#578 缓存失败可降级返回网络结果）。
//! - 网络失败：命中缓存则返回 `attach_sync_time(offline=true)` 的旧快照；
//!   未命中缓存则返回 [`ApplicationError::network`]。
//!
//! 所有只读路径通过 [`ApplicationContext::client_snapshot`] 短时持有读锁，
//! 网络 await 期间不持有任何全局锁，避免阻塞登录等写型业务。

use std::future::Future;

use base64::Engine;
use chrono::Local;
use serde_json::{json, Value};

use super::{ApplicationContext, ApplicationError};
use crate::http_client::HbutClient;
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
                    warn_cache_write_error(
                        self.context.db_path(),
                        "exams_cache",
                        key,
                        db::save_cache(self.context.db_path(), "exams_cache", key, &payload),
                    );
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
                    warn_cache_write_error(
                        self.context.db_path(),
                        "ranking_cache",
                        key,
                        db::save_cache(self.context.db_path(), "ranking_cache", key, &payload),
                    );
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
                    warn_cache_write_error(
                        self.context.db_path(),
                        "studentinfo_cache",
                        uid,
                        db::save_cache(self.context.db_path(), "studentinfo_cache", uid, &payload),
                    );
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

    /// 门户登录访问记录（分页）。
    pub async fn fetch_personal_login_access_info(
        &self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone())
            .or_else(|| client.last_username.clone());
        let page = page.unwrap_or(1).max(1);
        let page_size = page_size.unwrap_or(10).clamp(1, 100);
        let cache_key = uid.map(|u| format!("{u}:p{page}:s{page_size}"));

        fetch_with_cache(
            &self.context,
            &mut client,
            "student_login_access_cache",
            cache_key,
            |client| async move {
                client
                    .fetch_personal_login_access_info(Some(page), Some(page_size))
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 学期列表（公共缓存）。
    pub async fn fetch_semesters(&self) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        fetch_with_cache(
            &self.context,
            &mut client,
            "semesters_public_cache",
            Some("semesters".to_string()),
            |client| async move { client.fetch_semesters().await.map_err(|e| e.to_string()) },
        )
        .await
    }

    /// 教学楼列表（公共缓存）。
    pub async fn fetch_classroom_buildings(&self) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        fetch_with_cache(
            &self.context,
            &mut client,
            "classroom_public_cache",
            Some("buildings".to_string()),
            |client| async move {
                client
                    .fetch_classroom_buildings()
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 空闲教室查询（按周/星期/节次/教学楼维度缓存）。
    pub async fn fetch_classrooms(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        building: Option<String>,
    ) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let periods_key = periods
            .as_ref()
            .map(|p| {
                p.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .unwrap_or_default();
        let building_key = building.clone().unwrap_or_default();
        let cache_key = uid.map(|u| {
            format!(
                "{u}:classroom:{}:{}:{}:{}",
                week.unwrap_or_default(),
                weekday.unwrap_or_default(),
                periods_key,
                building_key
            )
        });

        fetch_with_cache(
            &self.context,
            &mut client,
            "classroom_cache",
            cache_key,
            |client| async move {
                client
                    .fetch_classrooms_query(week, weekday, periods, building)
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 培养方案筛选项（按学号维度缓存）。
    pub async fn fetch_training_plan_options(&self) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let cache_key = uid.map(|u| format!("{u}:options"));

        fetch_with_cache(
            &self.context,
            &mut client,
            "training_plan_cache",
            cache_key,
            |client| async move {
                client
                    .fetch_training_plan_options()
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 培养方案院系（按学号 + 院系维度缓存）。
    pub async fn fetch_training_plan_jys(&self, yxid: String) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let cache_key = uid.map(|u| format!("{u}:jys:{yxid}"));

        fetch_with_cache(
            &self.context,
            &mut client,
            "training_plan_cache",
            cache_key,
            |client| async move {
                client
                    .fetch_training_plan_jys(&yxid)
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 培养方案课程列表（按学号 + 全部筛选条件维度缓存）。
    #[allow(clippy::too_many_arguments)]
    pub async fn fetch_training_plan_courses(
        &self,
        grade: Option<String>,
        kkxq: Option<String>,
        kkyx: Option<String>,
        kkjys: Option<String>,
        kcxz: Option<String>,
        kcgs: Option<String>,
        kcbh: Option<String>,
        kcmc: Option<String>,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let cache_key = uid.map(|u| {
            format!(
                "{u}:courses:{}:{}:{}:{}:{}:{}:{}:{}:{}:{}",
                grade.clone().unwrap_or_default(),
                kkxq.clone().unwrap_or_default(),
                kkyx.clone().unwrap_or_default(),
                kkjys.clone().unwrap_or_default(),
                kcxz.clone().unwrap_or_default(),
                kcgs.clone().unwrap_or_default(),
                kcbh.clone().unwrap_or_default(),
                kcmc.clone().unwrap_or_default(),
                page.unwrap_or(1),
                page_size.unwrap_or(50)
            )
        });

        fetch_with_cache(
            &self.context,
            &mut client,
            "training_plan_cache",
            cache_key,
            |client| async move {
                client
                    .fetch_training_plan_courses(
                        grade, kkxq, kkyx, kkjys, kcxz, kcgs, kcbh, kcmc, page, page_size,
                    )
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 校历数据（公共缓存，带 #489 语义）：
    /// - 业务成功（`success=true`）才写缓存；
    /// - 会话失效（`need_login=true`）原样透传，不当作离线数据；
    /// - 其它业务失败命中缓存则标 offline 返回，否则原样透传。
    pub async fn fetch_calendar_data(
        &self,
        semester: Option<String>,
    ) -> Result<Value, ApplicationError> {
        let client = self.context.client_snapshot().await;
        let sem_key = semester.clone().unwrap_or_else(|| "current".to_string());

        match client.fetch_calendar_data(semester).await {
            Ok(data) => {
                let success = data
                    .get("success")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let need_login = data
                    .get("need_login")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if success {
                    let sync_time = Local::now().to_rfc3339();
                    let payload = attach_sync_time(data, &sync_time, false);
                    warn_cache_write_error(
                        self.context.db_path(),
                        "calendar_public_cache",
                        &sem_key,
                        db::save_cache(
                            self.context.db_path(),
                            "calendar_public_cache",
                            &sem_key,
                            &payload,
                        ),
                    );
                    return Ok(payload);
                }

                if need_login {
                    return Ok(data);
                }

                if let Ok(Some((cached, sync_time))) =
                    db::get_cache(self.context.db_path(), "calendar_public_cache", &sem_key)
                {
                    return Ok(attach_sync_time(cached, &sync_time, true));
                }
                Ok(data)
            }
            Err(error) => {
                if let Ok(Some((cached, sync_time))) =
                    db::get_cache(self.context.db_path(), "calendar_public_cache", &sem_key)
                {
                    return Ok(attach_sync_time(cached, &sync_time, true));
                }
                Err(ApplicationError::network(error.to_string()))
            }
        }
    }

    /// 学业进度（按学号 + 方案维度缓存）。
    pub async fn fetch_academic_progress(
        &self,
        fasz: Option<i32>,
    ) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let uid = client
            .user_info
            .as_ref()
            .map(|user| user.student_id.clone());
        let fasz_val = fasz.unwrap_or(1);
        let cache_key = uid.map(|u| format!("{u}:{fasz_val}"));

        fetch_with_cache(
            &self.context,
            &mut client,
            "academic_progress_cache",
            cache_key,
            |client| async move {
                client
                    .fetch_academic_progress(fasz_val)
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 图书馆筛选项（公共缓存）。
    pub async fn fetch_library_dict(&self) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        fetch_with_cache(
            &self.context,
            &mut client,
            "library_public_cache",
            Some("dict".to_string()),
            |client| async move { client.fetch_library_dict().await.map_err(|e| e.to_string()) },
        )
        .await
    }

    /// 图书检索（按检索参数序列化后的 key 缓存）。
    pub async fn search_library_books(&self, params: Value) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let raw = params.to_string();
        let cache_key = build_public_cache_key("search", &raw);

        fetch_with_cache(
            &self.context,
            &mut client,
            "library_public_cache",
            Some(cache_key),
            |client| async move {
                client
                    .search_library_books(params)
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }

    /// 图书详情（按 title|isbn|record_id 序列化后的 key 缓存）。
    pub async fn fetch_library_book_detail(
        &self,
        title: String,
        isbn: String,
        record_id: Option<i64>,
    ) -> Result<Value, ApplicationError> {
        let mut client = self.context.client_snapshot().await;
        let raw = format!("{title}|{isbn}|{}", record_id.unwrap_or_default());
        let cache_key = build_public_cache_key("detail", &raw);

        fetch_with_cache(
            &self.context,
            &mut client,
            "library_public_cache",
            Some(cache_key),
            |client| async move {
                client
                    .fetch_library_book_detail(&title, &isbn, record_id)
                    .await
                    .map_err(|e| e.to_string())
            },
        )
        .await
    }
}

/// 构造公共缓存键（与历史 Tauri 实现一致：base64(prefix:payload)）。
fn build_public_cache_key(prefix: &str, payload: &str) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(payload.as_bytes());
    format!("{prefix}:{encoded}")
}

/// 缓存写失败只告警，不拖垮成功网络结果（#578）。
fn warn_cache_write_error<E: std::fmt::Display>(
    _db_path: &std::path::Path,
    table: &str,
    key: &str,
    result: Result<(), E>,
) {
    if let Err(error) = result {
        eprintln!(
            "[application] 缓存写入失败 table={table} key={key}: {error}（已降级返回网络结果）"
        );
    }
}

/// 统一的「网络优先 + 缓存降级」只读路径（#578）：
/// 1. 网络成功 → `attach_sync_time(offline=false)`；缓存写失败仅告警（降级返回网络结果）。
/// 2. 网络失败 → 命中缓存则 `attach_sync_time(offline=true)` 返回旧快照；否则 Network 错误。
///
/// 调用方持有的是 [`ApplicationContext::client_snapshot`] 的克隆，网络 await 期间
/// 不占用全局 RwLock，多个并发只读请求互不阻塞，也不会阻塞写型业务（如登录）。
async fn fetch_with_cache<'a, F, Fut>(
    context: &ApplicationContext,
    client: &'a mut HbutClient,
    table: &str,
    cache_key: Option<String>,
    network: F,
) -> Result<Value, ApplicationError>
where
    F: FnOnce(&'a mut HbutClient) -> Fut,
    Fut: Future<Output = Result<Value, String>> + 'a,
{
    match network(client).await {
        Ok(data) => {
            let sync_time = Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            if let Some(key) = cache_key.as_ref() {
                warn_cache_write_error(
                    context.db_path(),
                    table,
                    key,
                    db::save_cache(context.db_path(), table, key, &payload),
                );
            }
            Ok(payload)
        }
        Err(error) => {
            if let Some(key) = cache_key.as_ref() {
                if let Ok(Some((cached, sync_time))) = db::get_cache(context.db_path(), table, key)
                {
                    return Ok(attach_sync_time(cached, &sync_time, true));
                }
            }
            Err(ApplicationError::network(error))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::{ApplicationContext, ApplicationErrorKind};
    use crate::http_client::HbutClient;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    /// 构造隔离的测试上下文（临时目录 DB），并确保不受 `HBUT_DB_PATH` 环境变量污染。
    fn test_context(tag: &str) -> (ApplicationContext, PathBuf) {
        // 防止 CI/本机设置 HBUT_DB_PATH 时把测试缓存写入真实数据库
        std::env::remove_var("HBUT_DB_PATH");
        let dir =
            std::env::temp_dir().join(format!("hbut_app_svc_test_{}_{}", tag, std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let db_path = dir.join("test.db");
        let _ = std::fs::remove_file(&db_path);
        // 建表（init_db 幂等，含各缓存表）
        db::init_db(&db_path).expect("测试数据库初始化失败");
        let client = Arc::new(RwLock::new(HbutClient::new()));
        (ApplicationContext::new(client, &db_path), db_path)
    }

    /// 网络成功 + 缓存写失败（父路径被文件占用，SQLite 无法打开）→
    /// 仍返回网络结果，缓存失败不拖垮成功网络结果（#578 降级语义）。
    #[tokio::test]
    async fn cache_write_failure_does_not_override_network_result() {
        std::env::remove_var("HBUT_DB_PATH");
        // 父路径是文件 → open_connection 的 create_dir_all 失败 → save_cache 必然失败
        let blocker =
            std::env::temp_dir().join(format!("hbut_app_svc_blocker_{}.txt", std::process::id()));
        std::fs::write(&blocker, b"occupied").expect("写阻塞文件失败");
        let db_path = blocker.join("nested.db");
        let client = Arc::new(RwLock::new(HbutClient::new()));
        let context = ApplicationContext::new(client, &db_path);
        let mut snapshot = HbutClient::new();

        let result = fetch_with_cache(
            &context,
            &mut snapshot,
            "exams_cache",
            Some("u1:current".to_string()),
            |_client| async move { Ok(json!({"data": [1, 2, 3]})) },
        )
        .await;

        let payload = result.expect("缓存写失败时仍应返回网络结果");
        assert_eq!(payload["success"], true);
        assert_eq!(payload["offline"], false);
        assert_eq!(payload["data"], json!([1, 2, 3]));
        let _ = std::fs::remove_file(&blocker);
    }

    /// 网络失败 + 命中缓存 → 降级返回 `offline=true` 旧快照。
    #[tokio::test]
    async fn network_failure_with_cache_returns_offline_snapshot() {
        let (context, db_path) = test_context("offline");
        let mut snapshot = HbutClient::new();
        // 先成功写缓存
        fetch_with_cache(
            &context,
            &mut snapshot,
            "exams_cache",
            Some("u2:current".to_string()),
            |_client| async move { Ok(json!({"data": "fresh"})) },
        )
        .await
        .expect("首次网络成功应写入缓存");
        // 网络失败 → 降级
        let result = fetch_with_cache(
            &context,
            &mut snapshot,
            "exams_cache",
            Some("u2:current".to_string()),
            |_client| async move { Err("network down".to_string()) },
        )
        .await
        .expect("命中缓存应降级成功");
        assert_eq!(result["offline"], true);
        assert_eq!(result["data"], json!("fresh"));
        let _ = std::fs::remove_file(db_path);
    }

    /// 网络失败 + 无缓存 → 返回 Network 错误（不吞错误）。
    #[tokio::test]
    async fn network_failure_without_cache_returns_error() {
        let (context, db_path) = test_context("no_cache");
        let mut snapshot = HbutClient::new();
        let result = fetch_with_cache(
            &context,
            &mut snapshot,
            "exams_cache",
            Some("u3:current".to_string()),
            |_client| async move { Err("network down".to_string()) },
        )
        .await;
        let error = result.expect_err("无缓存时应返回错误");
        assert_eq!(error.kind, ApplicationErrorKind::Network);
        assert!(error.message.contains("network down"));
        let _ = std::fs::remove_file(db_path);
    }

    /// 并发回归（#578）：多个只读 service 调用并发执行时——
    /// 1. 共享缓存路径（SQLite）按各自 key 隔离，不串扰；
    /// 2. 快照克隆语义下，网络 await 期间不持有全局锁，写型业务（写锁）不被饿死。
    #[tokio::test]
    async fn concurrent_reads_keep_caches_isolated_and_do_not_block_writer() {
        let (context, db_path) = test_context("concurrent");
        let snapshot = HbutClient::new();

        // 并发 8 个不同 key 的只读调用，各自带 50ms 模拟网络延迟
        let mut handles = Vec::new();
        for i in 0..8 {
            let context = context.clone();
            let mut client = snapshot.clone();
            handles.push(tokio::spawn(async move {
                let key = format!("u{i}:current");
                fetch_with_cache(
                    &context,
                    &mut client,
                    "exams_cache",
                    Some(key.clone()),
                    |_c| async move {
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        Ok(json!({"index": i}))
                    },
                )
                .await
                .map(|payload| (key, payload))
            }));
        }

        // 写者：应能在并发读的网络模拟期间及时获取写锁（读路径不持有锁）
        let writer = {
            let handle = context.client_handle();
            tokio::spawn(async move {
                let guard = handle.write().await;
                let _ = &*guard;
                drop(guard);
            })
        };
        tokio::time::timeout(std::time::Duration::from_secs(1), writer)
            .await
            .expect("写者被并发只读路径饿死（疑似快照泄漏全局锁）")
            .expect("写者任务失败");

        for handle in handles {
            let (key, payload) = handle
                .await
                .expect("并发只读任务失败")
                .expect("只读结果失败");
            assert_eq!(payload["offline"], false);
            let expected_index = key
                .trim_start_matches('u')
                .trim_end_matches(":current")
                .parse::<i32>()
                .unwrap();
            assert_eq!(payload["index"], json!(expected_index));
            // 验证每个 key 的缓存独立写入、互不串扰
            let (cached, _) = db::get_cache(&db_path, "exams_cache", &key)
                .expect("读缓存失败")
                .expect("缓存应存在");
            assert_eq!(cached["index"], json!(expected_index));
        }
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn build_public_cache_key_encodes_deterministically() {
        let first = build_public_cache_key("search", "kw=高等数学");
        let second = build_public_cache_key("search", "kw=高等数学");
        assert_eq!(first, second);
        assert!(first.starts_with("search:"));
    }
}
