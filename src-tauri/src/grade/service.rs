//! 成绩同步共享用例（use-case）：Tauri Command 与 HTTP Bridge 共用。
//!
//! 统一语义：
//! - 抓取：[`GradeSource`]（生产实现为 `HbutClient`）
//! - 教师合并：抓取成功后用本地教师缓存按 kcbh/课程号/记录号补任课教师
//! - 缓存：**成功整表替换**；**失败保留旧快照**并标记 `offline=true`
//! - 元数据：`sync_time` / `offline` / `teacher_enrichment_pending` 两通道一致
//!
//! Tauri Command 与 HTTP Bridge handler 均只做传输适配（取 uid、spawn 后台任务），
//! 业务逻辑全部收敛在本模块，保证双通道返回一致。

use crate::grade::domain::{grade_terms, GradeRecord};
use crate::http_client::HbutClient;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

/// 成绩数据源抽象（生产：`HbutClient`；测试：mock）。
///
/// 方法返回 `+ Send` 的 future，保证后台任务（`tauri::async_runtime::spawn`）可跨线程。
pub trait GradeSource: Send + Sync {
    /// 拉取全部成绩。
    fn fetch_grades(
        &self,
    ) -> impl std::future::Future<
        Output = Result<Vec<GradeRecord>, Box<dyn std::error::Error + Send + Sync>>,
    > + Send;
    /// 拉取指定学期的已选课程，返回 (kcbh, rkjs) 映射。
    fn fetch_course_teachers(
        &self,
        semester: &str,
    ) -> impl std::future::Future<
        Output = Result<Vec<(String, String)>, Box<dyn std::error::Error + Send + Sync>>,
    > + Send;
}

impl GradeSource for Arc<RwLock<HbutClient>> {
    async fn fetch_grades(
        &self,
    ) -> Result<Vec<GradeRecord>, Box<dyn std::error::Error + Send + Sync>> {
        self.read().await.fetch_grades().await
    }

    async fn fetch_course_teachers(
        &self,
        semester: &str,
    ) -> Result<Vec<(String, String)>, Box<dyn std::error::Error + Send + Sync>> {
        self.read().await.fetch_course_teachers(semester).await
    }
}

/// 成绩缓存抽象（生产：SQLite；测试：内存）。
pub trait GradeCacheStore: Send + Sync {
    /// 读取主成绩缓存（payload + sync_time）。
    fn load_grades(&self, uid: &str) -> Option<(Value, String)>;
    /// 保存主成绩缓存（成功时整表替换）。
    fn save_grades(&self, uid: &str, payload: &Value) -> Result<(), String>;
    /// 读取任课教师缓存。
    fn load_teacher_cache(&self, uid: &str) -> Option<Value>;
    /// 合并保存某学期任课教师缓存。
    fn save_teacher_cache(
        &self,
        uid: &str,
        semester: &str,
        courses: &[(String, String)],
    ) -> Result<Value, String>;
}

/// 生产缓存实现：SQLite（`db` 模块）。
#[derive(Debug, Clone, Copy, Default)]
pub struct SqliteGradeCache;

impl GradeCacheStore for SqliteGradeCache {
    fn load_grades(&self, uid: &str) -> Option<(Value, String)> {
        crate::db::get_cache(crate::DB_FILENAME, "grades_cache", uid)
            .ok()
            .flatten()
    }

    fn save_grades(&self, uid: &str, payload: &Value) -> Result<(), String> {
        crate::db::save_cache(crate::DB_FILENAME, "grades_cache", uid, payload)
            .map_err(|e| e.to_string())
    }

    fn load_teacher_cache(&self, uid: &str) -> Option<Value> {
        crate::db::get_cache(crate::DB_FILENAME, crate::GRADE_TEACHER_CACHE_TABLE, uid)
            .ok()
            .flatten()
            .map(|(data, _)| data)
    }

    fn save_teacher_cache(
        &self,
        uid: &str,
        semester: &str,
        courses: &[(String, String)],
    ) -> Result<Value, String> {
        let mut existing = self.load_teacher_cache(uid).unwrap_or_else(|| {
            serde_json::json!({
                "success": true,
                "by_kcbh": {},
                "semesters": {}
            })
        });

        if !existing.is_object() {
            existing = serde_json::json!({
                "success": true,
                "by_kcbh": {},
                "semesters": {}
            });
        }

        let object = existing
            .as_object_mut()
            .ok_or_else(|| "教师缓存格式错误".to_string())?;
        object.insert("success".to_string(), Value::Bool(true));
        object.insert(
            "updated_at".to_string(),
            Value::String(chrono::Local::now().to_rfc3339()),
        );
        if !semester.trim().is_empty() {
            object.insert(
                "current_semester".to_string(),
                Value::String(semester.trim().to_string()),
            );
        }

        let mut by_kcbh = object
            .remove("by_kcbh")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        let mut semesters = object
            .remove("semesters")
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default();
        let mut semester_map = serde_json::Map::new();

        for (kcbh, teacher) in courses {
            let key = kcbh.trim();
            let value = teacher.trim();
            if key.is_empty() || value.is_empty() {
                continue;
            }
            by_kcbh.insert(key.to_string(), Value::String(value.to_string()));
            semester_map.insert(key.to_string(), Value::String(value.to_string()));
        }

        if !semester.trim().is_empty() {
            semesters.insert(semester.trim().to_string(), Value::Object(semester_map));
        }
        object.insert("by_kcbh".to_string(), Value::Object(by_kcbh));
        object.insert("semesters".to_string(), Value::Object(semesters));

        crate::db::save_cache(
            crate::DB_FILENAME,
            crate::GRADE_TEACHER_CACHE_TABLE,
            uid,
            &existing,
        )
        .map_err(|e| e.to_string())?;
        Ok(existing)
    }
}

/// 后台补齐任课教师任务（由调用方决定如何 spawn）。
#[derive(Debug, Clone)]
pub struct EnrichmentJob {
    pub student_id: String,
    pub semesters: Vec<String>,
}

/// 同步结果：payload + 可选的教师补齐任务。
#[derive(Debug)]
pub struct SyncGradesResult {
    pub payload: Value,
    pub enrichment: Option<EnrichmentJob>,
}

/// 共享成绩服务：Tauri Command 与 HTTP Bridge 均通过它完成同步。
#[derive(Clone)]
pub struct GradeService<S, C> {
    source: Arc<S>,
    cache: Arc<C>,
}

impl<S: GradeSource, C: GradeCacheStore> GradeService<S, C> {
    pub fn new(source: S, cache: C) -> Self {
        Self {
            source: Arc::new(source),
            cache: Arc::new(cache),
        }
    }

    /// 统一成绩同步用例：
    /// 1. 抓取成绩；2. 合并本地教师缓存；3. 成功 → 整表替换缓存（offline=false）；
    /// 4. 失败 → 保留旧缓存快照（offline=true）；无缓存则透传错误。
    pub async fn sync_grades(
        &self,
        uid: Option<&str>,
        current_only: bool,
    ) -> Result<SyncGradesResult, String> {
        match self.source.fetch_grades().await {
            Ok(mut grades) => {
                let semesters = grade_terms(&grades);
                if let Some(uid) = uid {
                    let teacher_cache = self.cache.load_teacher_cache(uid);
                    merge_cached_grade_teachers(&mut grades, teacher_cache.as_ref());
                }
                let sync_time = chrono::Local::now().to_rfc3339();
                let payload = serde_json::json!({
                    "success": true,
                    "data": grades,
                    "sync_time": sync_time,
                    "offline": false,
                    "teacher_enrichment_pending": true
                });
                // 成功：整表替换缓存（失败的旧快照被覆盖，远端删除能正确清理）
                if let Some(uid) = uid {
                    let _ = self.cache.save_grades(uid, &payload);
                }
                let enrichment = if !current_only && uid.is_some() && !semesters.is_empty() {
                    Some(EnrichmentJob {
                        student_id: uid.unwrap_or_default().to_string(),
                        semesters,
                    })
                } else {
                    None
                };
                Ok(SyncGradesResult {
                    payload,
                    enrichment,
                })
            }
            Err(e) => {
                // 失败：保留旧缓存快照，标记 offline
                if let Some(uid) = uid {
                    if let Some((cached_data, sync_time)) = self.cache.load_grades(uid) {
                        let payload = attach_sync_time(cached_data, &sync_time, true);
                        let payload =
                            merge_teacher_cache_into_payload(payload, uid, self.cache.as_ref());
                        return Ok(SyncGradesResult {
                            payload,
                            enrichment: None,
                        });
                    }
                }
                Err(e.to_string())
            }
        }
    }

    /// 读取本地任课教师缓存（供 get_grade_teacher_cache 等 handler 使用）。
    pub fn read_teacher_cache(&self, uid: &str) -> Option<Value> {
        self.cache.load_teacher_cache(uid)
    }

    /// 保存某学期任课教师缓存。
    pub fn save_teacher_cache(
        &self,
        uid: &str,
        semester: &str,
        courses: Vec<(String, String)>,
    ) -> Result<Value, String> {
        self.cache.save_teacher_cache(uid, semester, &courses)
    }

    /// 后台补齐任课教师（纯异步逻辑，可测试；spawn 由调用方通过 [`Self::spawn_enrichment`] 完成）。
    pub async fn enrich_teachers(&self, job: EnrichmentJob) -> Vec<(String, Result<(), String>)> {
        let mut results = Vec::new();
        for semester in job.semesters {
            let semester = semester.trim().to_string();
            if semester.is_empty() {
                continue;
            }
            let outcome = match self.source.fetch_course_teachers(&semester).await {
                Ok(courses) => self
                    .cache
                    .save_teacher_cache(&job.student_id, &semester, &courses)
                    .map(|_| ())
                    .map_err(|e| e.to_string()),
                Err(e) => Err(e.to_string()),
            };
            results.push((semester, outcome));
        }
        results
    }

    /// 便捷方法：在 Tauri 运行时后台补齐任课教师。
    pub fn spawn_enrichment(&self, job: EnrichmentJob)
    where
        S: 'static,
        C: 'static,
    {
        // 通过 Arc::clone 捕获共享引用（避免依赖 S/C 的 Clone），async block 持有 owned service。
        let source = Arc::clone(&self.source);
        let cache = Arc::clone(&self.cache);
        tauri::async_runtime::spawn(async move {
            let service = GradeService { source, cache };
            for (semester, result) in service.enrich_teachers(job).await {
                if let Err(e) = result {
                    println!("[警告] 后台补齐任课教师失败 {}: {}", semester, e);
                }
            }
        });
    }
}

/// 将本地教师缓存合并进 payload 的 `data` 数组（不覆盖已有 course_teacher）。
pub fn merge_teacher_cache_into_payload(
    mut payload: Value,
    student_id: &str,
    cache: &dyn GradeCacheStore,
) -> Value {
    let Some(cache_value) = cache.load_teacher_cache(student_id) else {
        return payload;
    };
    let Some(data) = payload.get_mut("data").and_then(|v| v.as_array_mut()) else {
        return payload;
    };
    let Some(by_kcbh) = cache_value.get("by_kcbh").and_then(|v| v.as_object()) else {
        return payload;
    };
    for item in data {
        let Some(object) = item.as_object_mut() else {
            continue;
        };
        let has_teacher = object
            .get("course_teacher")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .is_some();
        if has_teacher {
            continue;
        }
        let mut keys = Vec::new();
        for field in ["kcbh", "course_code", "grade_id"] {
            if let Some(key) = object
                .get(field)
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                keys.push(key.to_string());
            }
        }
        for key in keys {
            if let Some(teacher) = by_kcbh
                .get(&key)
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                object.insert(
                    "course_teacher".to_string(),
                    Value::String(teacher.to_string()),
                );
                break;
            }
        }
    }
    payload
}

/// 给缓存 payload 附加 sync_time / offline 元数据（offline 回退路径）。
fn attach_sync_time(payload: Value, sync_time: &str, offline: bool) -> Value {
    match payload {
        Value::Object(mut map) => {
            if !map.contains_key("success") {
                map.insert("success".to_string(), Value::Bool(true));
            }
            map.insert(
                "sync_time".to_string(),
                Value::String(sync_time.to_string()),
            );
            map.insert("offline".to_string(), Value::Bool(offline));
            Value::Object(map)
        }
        _ => serde_json::json!({
            "success": true,
            "data": payload,
            "sync_time": sync_time,
            "offline": offline
        }),
    }
}

fn normalize_grade_match_key(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
}

fn grade_match_keys(grade: &GradeRecord) -> Vec<String> {
    let mut keys = Vec::new();
    for key in [
        normalize_grade_match_key(grade.kcbh.as_deref()),
        normalize_grade_match_key(grade.course_code.as_deref()),
        normalize_grade_match_key(grade.grade_id.as_deref()),
    ]
    .into_iter()
    .flatten()
    {
        if !keys.contains(&key) {
            keys.push(key);
        }
    }
    keys
}

/// 将本地教师缓存合并进成绩（不覆盖已存在的 course_teacher）。
fn merge_cached_grade_teachers(grades: &mut [GradeRecord], cache: Option<&Value>) {
    let Some(cache) = cache else {
        return;
    };
    let Some(by_kcbh) = cache.get("by_kcbh").and_then(|v| v.as_object()) else {
        return;
    };
    for grade in grades {
        if grade
            .course_teacher
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .is_some()
        {
            continue;
        }
        for key in grade_match_keys(grade) {
            if let Some(teacher) = by_kcbh
                .get(&key)
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                grade.course_teacher = Some(teacher.to_string());
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grade::domain::GradeOutcome;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Clone)]
    struct MockSource {
        grades: Result<Vec<GradeRecord>, String>,
        teachers: HashMap<String, Vec<(String, String)>>,
    }

    impl GradeSource for MockSource {
        async fn fetch_grades(
            &self,
        ) -> Result<Vec<GradeRecord>, Box<dyn std::error::Error + Send + Sync>> {
            self.grades.clone().map_err(|e| e.into())
        }

        async fn fetch_course_teachers(
            &self,
            semester: &str,
        ) -> Result<Vec<(String, String)>, Box<dyn std::error::Error + Send + Sync>> {
            Ok(self.teachers.get(semester).cloned().unwrap_or_default())
        }
    }

    #[derive(Default)]
    struct MockCache {
        grades: Mutex<HashMap<String, (Value, String)>>,
        teachers: Mutex<HashMap<String, Value>>,
    }

    impl GradeCacheStore for MockCache {
        fn load_grades(&self, uid: &str) -> Option<(Value, String)> {
            self.grades.lock().unwrap().get(uid).cloned()
        }

        fn save_grades(&self, uid: &str, payload: &Value) -> Result<(), String> {
            self.grades
                .lock()
                .unwrap()
                .insert(uid.to_string(), (payload.clone(), "now".to_string()));
            Ok(())
        }

        fn load_teacher_cache(&self, uid: &str) -> Option<Value> {
            self.teachers.lock().unwrap().get(uid).cloned()
        }

        fn save_teacher_cache(
            &self,
            uid: &str,
            semester: &str,
            courses: &[(String, String)],
        ) -> Result<Value, String> {
            let mut map = serde_json::Map::new();
            for (kcbh, teacher) in courses {
                map.insert(kcbh.clone(), Value::String(teacher.clone()));
            }
            let value = serde_json::json!({
                "success": true,
                "by_kcbh": map,
                "semesters": { semester: {} }
            });
            self.teachers
                .lock()
                .unwrap()
                .insert(uid.to_string(), value.clone());
            Ok(value)
        }
    }

    fn sample_grade(term: &str, kcbh: Option<&str>) -> GradeRecord {
        GradeRecord {
            term: term.to_string(),
            course_name: "高等数学".to_string(),
            grade_id: Some("1001".to_string()),
            course_code: kcbh.map(|s| s.to_string()),
            course_nature: "必修".to_string(),
            course_nature_code: "1".to_string(),
            course_credit: "4".to_string(),
            final_score: "85".to_string(),
            earned_credit: "4".to_string(),
            xfjd: "".to_string(),
            sfbk: "".to_string(),
            sfsq: "".to_string(),
            cjbj: "".to_string(),
            teacher: Some("录入教师".to_string()),
            kcbh: kcbh.map(|s| s.to_string()),
            course_teacher: None,
        }
    }

    impl MockCache {
        fn clone_for_test(&self) -> MockCache {
            MockCache {
                grades: Mutex::new(self.grades.lock().unwrap().clone()),
                teachers: Mutex::new(self.teachers.lock().unwrap().clone()),
            }
        }
    }

    /// Tauri Command 与 HTTP Bridge 共享的同步用例：成功 → offline=false + 整表替换缓存 + 教师合并。
    #[tokio::test]
    async fn sync_success_replaces_cache_and_merges_teachers() {
        let teacher_cache = MockCache::default();
        teacher_cache.teachers.lock().unwrap().insert(
            "20240001".to_string(),
            serde_json::json!({
                "success": true,
                "by_kcbh": { "K001": "张老师" },
                "semesters": {}
            }),
        );
        let service = GradeService::new(
            MockSource {
                grades: Ok(vec![sample_grade("2024-2025-1", Some("K001"))]),
                teachers: HashMap::new(),
            },
            teacher_cache.clone_for_test(),
        );

        let result = service.sync_grades(Some("20240001"), false).await.unwrap();
        let payload = result.payload;
        assert_eq!(payload["success"], true);
        assert_eq!(payload["offline"], false);
        assert_eq!(payload["teacher_enrichment_pending"], true);
        assert!(payload["sync_time"].is_string());
        let data = payload["data"].as_array().unwrap();
        assert_eq!(data.len(), 1);
        // 教师缓存按 kcbh 合并
        assert_eq!(data[0]["course_teacher"], "张老师");
        assert_eq!(data[0]["teacher"], "录入教师");
        // 产生 enrichment 任务
        let job = result.enrichment.unwrap();
        assert_eq!(job.student_id, "20240001");
        assert_eq!(job.semesters, vec!["2024-2025-1"]);
    }

    /// 共享用例：失败时保留旧缓存快照并标记 offline=true（失败不覆盖成功缓存）。
    #[tokio::test]
    async fn sync_failure_keeps_cached_payload_with_offline_flag() {
        let cache = MockCache::default();
        let cached = serde_json::json!({
            "success": true,
            "data": [{
                "term": "2023-2024-2",
                "course_name": "旧课程",
                "course_credit": "2",
                "final_score": "70",
                "earned_credit": "2",
                "xfjd": "2.0",
                "sfbk": "",
                "sfsq": "",
                "cjbj": "",
                "teacher": null,
                "kcbh": null,
                "course_teacher": null
            }],
            "sync_time": "2024-01-01T00:00:00+08:00",
            "offline": false
        });
        cache.grades.lock().unwrap().insert(
            "20240001".to_string(),
            (cached, "2024-01-01T00:00:00+08:00".to_string()),
        );

        let service = GradeService::new(
            MockSource {
                grades: Err("网络错误".to_string()),
                teachers: HashMap::new(),
            },
            cache,
        );

        let result = service.sync_grades(Some("20240001"), false).await.unwrap();
        assert_eq!(result.payload["success"], true);
        assert_eq!(result.payload["offline"], true);
        assert_eq!(result.payload["sync_time"], "2024-01-01T00:00:00+08:00");
        assert!(result.enrichment.is_none());
        let data = result.payload["data"].as_array().unwrap();
        assert_eq!(data[0]["course_name"], "旧课程");
        // 旧快照未被覆盖：缓存仍是原 payload
        let stored = service.cache.load_grades("20240001").unwrap().0;
        assert_eq!(stored["offline"], false);
    }

    /// 共享用例：失败且无缓存 → 透传错误。
    #[tokio::test]
    async fn sync_failure_without_cache_returns_error() {
        let service = GradeService::new(
            MockSource {
                grades: Err("会话过期".to_string()),
                teachers: HashMap::new(),
            },
            MockCache::default(),
        );
        let err = service
            .sync_grades(Some("20240001"), false)
            .await
            .unwrap_err();
        assert!(err.contains("会话过期"));
    }

    /// 共享用例：current_only 时不产生后台补齐任务。
    #[tokio::test]
    async fn sync_current_only_skips_enrichment_job() {
        let service = GradeService::new(
            MockSource {
                grades: Ok(vec![sample_grade("2024-2025-1", None)]),
                teachers: HashMap::new(),
            },
            MockCache::default(),
        );
        let result = service.sync_grades(Some("20240001"), true).await.unwrap();
        assert!(result.enrichment.is_none());
        assert_eq!(result.payload["offline"], false);
    }

    /// 共享用例：未登录（无 uid）时仍可同步，但不写缓存、不产生补齐任务。
    #[tokio::test]
    async fn sync_without_uid_skips_cache_and_enrichment() {
        let service = GradeService::new(
            MockSource {
                grades: Ok(vec![sample_grade("2024-2025-1", None)]),
                teachers: HashMap::new(),
            },
            MockCache::default(),
        );
        let result = service.sync_grades(None, false).await.unwrap();
        assert!(result.enrichment.is_none());
        assert_eq!(result.payload["offline"], false);
    }

    /// 共享用例：后台教师补齐逐个学期保存。
    #[tokio::test]
    async fn enrich_teachers_saves_each_semester() {
        let mut teachers = HashMap::new();
        teachers.insert(
            "2024-2025-1".to_string(),
            vec![("K001".to_string(), "张老师".to_string())],
        );
        let cache = MockCache::default();
        let service = GradeService::new(
            MockSource {
                grades: Ok(vec![]),
                teachers,
            },
            cache,
        );
        let job = EnrichmentJob {
            student_id: "20240001".to_string(),
            semesters: vec!["2024-2025-1".to_string()],
        };
        let results = service.enrich_teachers(job).await;
        assert_eq!(results.len(), 1);
        assert!(results[0].1.is_ok());
        let stored = service.read_teacher_cache("20240001").unwrap();
        assert_eq!(stored["by_kcbh"]["K001"], "张老师");
    }

    /// 共享用例：合并函数不覆盖已有 course_teacher。
    #[test]
    fn merge_teacher_cache_does_not_override_existing_teacher() {
        let cache = MockCache::default();
        cache.teachers.lock().unwrap().insert(
            "20240001".to_string(),
            serde_json::json!({ "by_kcbh": { "K001": "张老师" } }),
        );
        let payload = serde_json::json!({
            "data": [{
                "kcbh": "K001",
                "course_teacher": "已有教师"
            }]
        });
        let merged = merge_teacher_cache_into_payload(payload, "20240001", &cache);
        assert_eq!(merged["data"][0]["course_teacher"], "已有教师");
    }

    /// 领域语义贯通：成绩状态与绩点来源在共享 DTO 上一致计算。
    #[test]
    fn shared_dto_domain_semantics() {
        let mut g = sample_grade("2024-2025-1", Some("K001"));
        g.final_score = "优秀".to_string();
        assert_eq!(g.outcome(), GradeOutcome::Normal);
        assert_eq!(
            g.grade_point_source(),
            crate::grade::domain::GradePointSource::Estimated
        );
        assert_eq!(g.grade_point(), Some(4.5));
    }
}
