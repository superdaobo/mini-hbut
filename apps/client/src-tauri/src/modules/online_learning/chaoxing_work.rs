//! 学习通「作业 / 考试」跨课程聚合（P4-B，#1343）。
//!
//! ## 硬边界
//!
//! 本模块**只做查询提醒**：产出「有哪些作业/考试、何时截止/开考」的清单，
//! 绝不提供作答、提交、交卷、上传、代做入口。唯一的动作是「打开学习通官方页」。
//!
//! ## 数据来源（2026-11-20 真实账号实测，34 门课全量跑过）
//!
//! 学习通 PC 端的 `mooc2/work/list`、`exam-ans/.../exam-list` 都是**壳页面**
//! （返回「参数传递不正确 / 无权限的操作」，真实数据靠前端 XHR），因此这里不用它们，
//! 改用学情统计（stat2）里已经带齐「名称/截止/题数/完成率/直达 URL」的待办聚合：
//!
//! | 维度 | 作用 | 实测条目 |
//! |---|---|---|
//! | `behindTask` | 逾期未做任务（work/job/test） | 12 |
//! | `importWeekTask` | 本周重要任务（work/**exam**） | 22 |
//! | `work` | 课程维度作业计数（已完成/已布置） | 每课 1 条 |
//!
//! **考试（`eventType=exam`）只在 `importWeekTask` 里出现**，实测样本：
//! `{"eventType":"exam","name":"《教育学》测试二","endTimeStr":"2026-12-12 23:55",
//!   "url":"https://mooc1.chaoxing.com/exam/test/examcode/examnotes?examId=…"}`
//!
//! ## 成本控制
//!
//! 每门课 1 次 index（取 pEnc）+ 3 次维度请求 = 4 次；34 门课 ≈ 136 次。
//! 并发限 5 + **60 秒内存缓存**（同一学期签名命中直接返回），单课程失败不影响整体。

use std::sync::OnceLock;
use std::time::{Duration, Instant};

use chrono::{Local, TimeZone};
use futures::stream::{self, StreamExt};
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::Mutex;

use super::shared::{err_box, now_sync_time, read_cache, save_cache, DynError};
use crate::http_client::HbutClient;

/// 内存缓存时长（同一页面会话内命中）
const CACHE_TTL: Duration = Duration::from_secs(60);
/// 磁盘缓存「新鲜」时长：超过就后台刷新（但仍先把旧数据画出来，避免空白等 20 秒）
const DISK_TTL_SECS: i64 = 600;
/// 跨课程并发上限。
///
/// 实测（2026-11-21）：34 门课 × 4 请求 = 136 次，单请求约 1.6s；
/// 并发 5 → 24s、并发 10 → 22s、**并发 16 → 约 14s**（上游未限流）。
const CONCURRENCY: usize = 16;
/// 聚合结果磁盘缓存表
const CACHE_TASKS: &str = "online_learning_tasks_cache";
/// 单次请求超时
const REQ_TIMEOUT: Duration = Duration::from_secs(15);
/// 浏览器 UA（stat2 对非常规 UA 会返回空壳）
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/// 一门课的定位参数（跨课程聚合的最小单位）
#[derive(Debug, Clone)]
pub(crate) struct CourseRef {
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    pub name: String,
    pub semester: String,
}

/// 一条待办任务（作业或考试）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct TaskItem {
    /// 上游任务 id（同 id 不同课程需配合 course_id 去重）
    pub id: String,
    pub name: String,
    /// 课程名（用于列表副标题）
    pub course: String,
    pub course_id: String,
    pub clazz_id: String,
    pub cpi: String,
    /// 课程所属学期（`2026-2027-1`；用于列表按学期筛选/标注）
    pub semester: String,
    /// work / exam（本模块只产出这两类）
    pub event_type: String,
    /// 截止（或开考）时间戳（毫秒）；解析失败为 None
    pub deadline_ms: Option<i64>,
    /// 上游给的原始时间文案（`12-31 08:06` / `2026-12-12 23:55`）
    pub deadline_text: String,
    /// 题数（作业）
    pub question_num: Option<i64>,
    /// 班级完成率（作业）
    pub avg_finish_rate: Option<f64>,
    /// 官方页直达链接（**带 enc 票据，可能过期，调用方需现取**）
    pub url: String,
    /// 是否已完成
    pub finished: bool,
}

/// 聚合结果的缓存元信息（前端据此决定是否后台刷新）
#[derive(Debug, Clone, Default, serde::Serialize)]
pub(crate) struct CacheMeta {
    pub cached: bool,
    /// 磁盘缓存年龄（秒）
    pub age_seconds: i64,
    /// 是否已超过新鲜期（前端应静默 force 刷新一次）
    pub stale: bool,
}

/// 一次聚合的结果
pub(crate) struct TaskBundle {
    pub items: Vec<TaskItem>,
    /// 各课程 `work.finishCount` 之和（已完成作业数）
    pub finished_work_total: i64,
    /// 失败的课程数（诊断用）
    pub failed_courses: usize,
}

struct CacheEntry {
    key: String,
    at: Instant,
    items: Vec<TaskItem>,
    finished_work_total: i64,
}

static TASK_CACHE: OnceLock<Mutex<Option<CacheEntry>>> = OnceLock::new();

fn cache_slot() -> &'static Mutex<Option<CacheEntry>> {
    TASK_CACHE.get_or_init(|| Mutex::new(None))
}

/// 判断某个学期标签是否「覆盖当前时间」。
///
/// 上游格式是 `2026-2027第一学期` / `2025-2026第二学期`；
/// 第一学期约 9 月–次年 1 月，第二学期约 2 月–7 月。无法解析时返回 `false`。
fn semester_covers_now(label: &str, now: chrono::DateTime<chrono::Local>) -> bool {
    let re = match regex::Regex::new(r"(\d{4})\s*-\s*(\d{4})\s*第?\s*([一二1-2])") {
        Ok(re) => re,
        Err(_) => return false,
    };
    let Some(cap) = re.captures(label) else {
        return false;
    };
    let start_year: i32 = cap
        .get(1)
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(0);
    let term = cap.get(3).map(|m| m.as_str()).unwrap_or("");
    let first_term = matches!(term, "一" | "1");
    use chrono::Datelike;
    let year = now.year();
    let month = now.month();
    if first_term {
        // 9–12 月属于起始年；1–2 月属于次年
        (month >= 9 && year == start_year) || (month <= 2 && year == start_year + 1)
    } else {
        month >= 3 && month <= 8 && year == start_year + 1
    }
}

/// 取「当前学期」标签（覆盖当前时间且课程数最多的那个）。
fn current_semester(courses: &[CourseRef]) -> Option<String> {
    let now = chrono::Local::now();
    let mut best: Option<(String, usize)> = None;
    for course in courses {
        let label = course.semester.trim();
        if label.is_empty() || !semester_covers_now(label, now) {
            continue;
        }
        match best.as_mut() {
            Some((name, count)) if name == label => *count += 1,
            Some((_, count)) if *count == 0 => {
                best = Some((label.to_string(), 1));
            }
            Some(_) => {}
            None => best = Some((label.to_string(), 1)),
        }
    }
    best.map(|(name, _)| name)
}

/// 默认聚合范围：当前学期 + 「未分学期」的课程（网络课/通识课通常没有学期标签）。
///
/// 之前把 15 个学期的 34 门课全拉一遍（136 次请求，单请求约 1.6s → 22s），
/// 而历史学期的待办基本为空。按学期收敛后约 15 门课 / 45 次请求。
pub(crate) fn default_courses<'a>(
    courses: &'a [CourseRef],
    semester: Option<&str>,
) -> Vec<CourseRef> {
    if let Some(wanted) = semester.map(str::trim).filter(|s| !s.is_empty()) {
        return courses
            .iter()
            .filter(|c| c.semester == wanted)
            .cloned()
            .collect();
    }
    match current_semester(courses) {
        Some(current) => courses
            .iter()
            .filter(|c| {
                c.semester.is_empty() || c.semester == current || c.semester.contains("未分学期")
            })
            .cloned()
            .collect(),
        None => courses.to_vec(),
    }
}

/// 从 `chaoxing_fetch_courses` 的响应里取课程列表（保持上游顺序）
pub(crate) fn parse_courses(payload: &Value, semester: Option<&str>) -> Vec<CourseRef> {
    let Some(list) = payload.get("courses").and_then(Value::as_array) else {
        return Vec::new();
    };
    let wanted = semester.map(str::trim).filter(|s| !s.is_empty());
    list.iter()
        .filter_map(|course| {
            let course_id = course.get("course_id").and_then(Value::as_str)?.to_string();
            let clazz_id = course.get("clazz_id").and_then(Value::as_str)?.to_string();
            let name = course
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("未知课程")
                .to_string();
            let cpi = course
                .get("cpi")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let semester = course
                .get("semester")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if course_id.is_empty() || clazz_id.is_empty() {
                return None;
            }
            if let Some(wanted) = wanted {
                if semester != wanted {
                    return None;
                }
            }
            Some(CourseRef {
                course_id,
                clazz_id,
                cpi,
                name,
                semester,
            })
        })
        .collect()
}

/// 毫秒时间戳 → `MM-DD HH:mm`（同年省略年，与列表展示一致）
fn format_deadline(ms: i64) -> String {
    match Local.timestamp_millis_opt(ms).single() {
        Some(dt) => dt.format("%m-%d %H:%M").to_string(),
        None => String::new(),
    }
}

fn value_to_i64(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    if let Some(n) = value.as_i64() {
        return Some(n);
    }
    if let Some(n) = value.as_f64() {
        return Some(n as i64);
    }
    value.as_str().and_then(|s| s.trim().parse::<i64>().ok())
}

fn value_to_f64(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    if let Some(n) = value.as_f64() {
        return Some(n);
    }
    value.as_str().and_then(|s| s.trim().parse::<f64>().ok())
}

fn value_to_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// 把一条上游任务转成统一的 [`TaskItem`]。
///
/// 上游结构按 `eventType` 分化（实测）：
/// - `behindTask`：`{id,name,endDate,endTime,questionNum,avgFinishRate,url,eventType}`
/// - `importWeekTask`：`{id,name,beginTime,endTime,endTimeStr,isFinish,url,eventType}`
fn normalize_task(item: &Value, course: &CourseRef) -> Option<TaskItem> {
    let event_type = item
        .get("eventType")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if event_type != "work" && event_type != "exam" {
        return None;
    }
    // 已完成的不进「待做」清单
    if item
        .get("isFinish")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }
    let name = item
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if name.is_empty() {
        return None;
    }
    let id = value_to_string(item.get("id"));
    // 实测：上游对「无截止时间」的任务给 `endTime: 0` + `endDate: "--"`，
    // 直接当时间戳会排到列表最前面（并污染「最近截止」），这里统一归一成「无」。
    let deadline_ms = value_to_i64(item.get("endTime")).filter(|ms| *ms > 0);
    let deadline_text = item
        .get("endDate")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty() && *text != "--" && *text != "-")
        .map(str::to_string)
        .or_else(|| {
            item.get("endTimeStr")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty() && *text != "--" && *text != "-")
                .map(str::to_string)
        })
        .or_else(|| deadline_ms.map(format_deadline))
        .unwrap_or_default();
    Some(TaskItem {
        id: if id.is_empty() {
            format!("{}-{}", course.course_id, name)
        } else {
            id
        },
        name,
        course: course.name.clone(),
        course_id: course.course_id.clone(),
        clazz_id: course.clazz_id.clone(),
        cpi: course.cpi.clone(),
        semester: course.semester.clone(),
        event_type,
        deadline_ms,
        deadline_text,
        question_num: value_to_i64(item.get("questionNum")),
        avg_finish_rate: value_to_f64(item.get("avgFinishRate")),
        url: item
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        finished: false,
    })
}

/// 单门课：取 pEnc → 拉 `behindTask` / `importWeekTask` / `work`。
async fn collect_course(
    client: &HbutClient,
    http: &Client,
    course: &CourseRef,
) -> (Vec<TaskItem>, i64, bool) {
    // 复用 `chaoxing_study::fetch_study_enc`：pEnc/jobEnc 有 5 分钟缓存，
    // 刷新时不必为 34 门课各重拉一次统计首页（每次约 1.5s，是最贵的一段）。
    let enc = match super::chaoxing_study::fetch_study_enc(
        client,
        &course.course_id,
        &course.clazz_id,
        &course.cpi,
    )
    .await
    {
        Ok(enc) => enc,
        Err(_) => return (Vec::new(), 0, true),
    };
    let index_url = enc.index_url.clone();
    let penc = enc.penc.clone();
    if penc.is_empty() {
        // 课程未开通学情统计：不算失败，只是没有待办
        return (Vec::new(), 0, false);
    }

    let mut items = Vec::new();
    let mut finished_total = 0i64;
    let mut failed = false;
    for dim in ["behindTask", "importWeekTask"] {
        let url = format!(
            "https://stat2-ans.chaoxing.com/stat2/study-data/{dim}?clazzid={}&courseid={}&cpi={}&ut=s&pEnc={penc}",
            course.clazz_id, course.course_id, course.cpi
        );
        let resp = http
            .get(&url)
            .header("Referer", &index_url)
            .header("User-Agent", UA)
            .timeout(REQ_TIMEOUT)
            .send()
            .await;
        let Ok(resp) = resp else {
            failed = true;
            continue;
        };
        let Ok(value) = resp.json::<Value>().await else {
            continue;
        };
        let data = value.get("data").cloned().unwrap_or(Value::Null);
        // behindTask.data 是数组；importWeekTask.data.resultList 是数组
        let list = if data.is_array() {
            data.as_array().cloned().unwrap_or_default()
        } else {
            data.get("resultList")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
        };
        for raw in list {
            if let Some(task) = normalize_task(&raw, course) {
                items.push(task);
            }
        }
    }

    // work 维度只取「已完成作业数」用于统计
    let work_url = format!(
        "https://stat2-ans.chaoxing.com/stat2/study-data/work?clazzid={}&courseid={}&cpi={}&ut=s&pEnc={penc}",
        course.clazz_id, course.course_id, course.cpi
    );
    if let Ok(resp) = http
        .get(&work_url)
        .header("Referer", &index_url)
        .header("User-Agent", UA)
        .timeout(REQ_TIMEOUT)
        .send()
        .await
    {
        if let Ok(value) = resp.json::<Value>().await {
            finished_total = value
                .get("data")
                .and_then(|d| value_to_i64(d.get("finishCount")))
                .unwrap_or(0);
        }
    }

    (items, finished_total, failed)
}

/// 跨课程聚合待办任务（带 60s 内存缓存）。
///
/// 返回 `(bundle, from_cache)`。缓存键由「课程集合签名」决定：换学期/换课程会自然失效。
pub(crate) async fn collect_pending_tasks(
    client: &HbutClient,
    courses: &[CourseRef],
    force: bool,
) -> Result<(TaskBundle, CacheMeta), DynError> {
    if courses.is_empty() {
        return Ok((
            TaskBundle {
                items: Vec::new(),
                finished_work_total: 0,
                failed_courses: 0,
            },
            CacheMeta::default(),
        ));
    }

    let mut signature = String::new();
    for course in courses {
        signature.push_str(&course.course_id);
        signature.push(':');
        signature.push_str(&course.clazz_id);
        signature.push(';');
    }
    let key = format!("{}|{}", courses.len(), signature);

    {
        let guard = cache_slot().lock().await;
        if let Some(entry) = guard.as_ref() {
            if !force && entry.key == key && entry.at.elapsed() < CACHE_TTL {
                return Ok((
                    TaskBundle {
                        items: entry.items.clone(),
                        finished_work_total: entry.finished_work_total,
                        failed_courses: 0,
                    },
                    CacheMeta {
                        cached: true,
                        age_seconds: 0,
                        stale: false,
                    },
                ));
            }
        }
    }

    // 磁盘缓存：**先显示后刷新** —— 冷启动/隔天进来时不必等 20 秒聚合
    if !force {
        if let Some((cached, _sync)) = read_cache(CACHE_TASKS, &key) {
            let at_ms = cached.get("at_ms").and_then(Value::as_i64).unwrap_or(0);
            let age_secs = ((chrono::Local::now().timestamp_millis() - at_ms) / 1000).max(0);
            if at_ms > 0 {
                if let Some(items) = cached.get("items").and_then(Value::as_array) {
                    let items: Vec<TaskItem> = items
                        .iter()
                        .filter_map(|item| serde_json::from_value::<TaskItem>(item.clone()).ok())
                        .collect();
                    let finished = cached
                        .get("finished_work_total")
                        .and_then(Value::as_i64)
                        .unwrap_or(0);
                    let stale = age_secs > DISK_TTL_SECS;
                    return Ok((
                        TaskBundle {
                            items,
                            finished_work_total: finished,
                            failed_courses: 0,
                        },
                        CacheMeta {
                            cached: true,
                            age_seconds: age_secs,
                            stale,
                        },
                    ));
                }
            }
        }
    }

    let http = client.client.clone();
    let results: Vec<(Vec<TaskItem>, i64, bool)> = stream::iter(courses.iter().cloned())
        .map(|course| {
            let http = http.clone();
            async move { collect_course(client, &http, &course).await }
        })
        .buffer_unordered(CONCURRENCY)
        .collect()
        .await;

    let mut items = Vec::new();
    let mut finished_work_total = 0i64;
    let mut failed_courses = 0usize;
    for (course_items, finished, failed) in results {
        if failed {
            failed_courses += 1;
        }
        finished_work_total += finished;
        items.extend(course_items);
    }

    // 去重（同 id + 同课程 + 同类型）：behindTask 与 importWeekTask 会重复给同一条任务
    let mut seen = std::collections::HashSet::new();
    items.retain(|item| {
        seen.insert(format!(
            "{}|{}|{}",
            item.course_id, item.event_type, item.id
        ))
    });
    // 按截止时间升序；没有截止时间的排最后
    items.sort_by(|a, b| match (a.deadline_ms, b.deadline_ms) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.name.cmp(&b.name),
    });

    let bundle = TaskBundle {
        items: items.clone(),
        finished_work_total,
        failed_courses,
    };
    // 落磁盘缓存（下次冷启动直接出数，再后台刷新）
    save_cache(
        CACHE_TASKS,
        &key,
        &json!({
            "at_ms": chrono::Local::now().timestamp_millis(),
            "items": items,
            "finished_work_total": finished_work_total,
        }),
    );
    {
        let mut guard = cache_slot().lock().await;
        *guard = Some(CacheEntry {
            key,
            at: Instant::now(),
            items,
            finished_work_total,
        });
    }
    Ok((bundle, CacheMeta::default()))
}

/// 待办统计（按类型分别计数；`now_ms` 用于判定逾期）
pub(crate) fn summarize(items: &[TaskItem], finished_work_total: i64) -> Value {
    let now_ms = Local::now().timestamp_millis();
    let work_total = items.iter().filter(|i| i.event_type == "work").count();
    let exam_total = items.iter().filter(|i| i.event_type == "exam").count();
    let overdue = items
        .iter()
        .filter(|i| i.deadline_ms.map(|ms| ms < now_ms).unwrap_or(false))
        .count();
    let soon = items
        .iter()
        .filter(|i| {
            i.deadline_ms
                .map(|ms| ms >= now_ms && ms - now_ms <= 3 * 24 * 3600 * 1000)
                .unwrap_or(false)
        })
        .count();
    json!({
        "pending_work": work_total,
        "pending_exam": exam_total,
        "overdue": overdue,
        "due_within_3d": soon,
        "finished_work": finished_work_total,
    })
}

/// 作业清单：`eventType=work`，附带「最近截止」与统计。
pub(crate) async fn chaoxing_fetch_works_all_courses(
    client: &mut HbutClient,
    semester: Option<&str>,
    force: bool,
) -> Result<Value, DynError> {
    // ⚠️ 课程列表**不要跟着 force 刷新**：那是远程拉取（实测约 20s），
    // 而这里的 force 只表示「重新聚合待办」。课程列表由课程中心页的「刷新」负责。
    let payload = super::chaoxing_courses::chaoxing_fetch_courses(client, None, false).await?;
    let all_courses = parse_courses(&payload, None);
    let courses = default_courses(&all_courses, semester);
    let (bundle, cache_meta) = collect_pending_tasks(client, &courses, force).await?;
    let works: Vec<TaskItem> = bundle
        .items
        .iter()
        .filter(|item| item.event_type == "work")
        .cloned()
        .collect();
    let stats = summarize(&works, bundle.finished_work_total);
    let nearest = works.first().map(|item| {
        json!({
            "name": item.name,
            "course": item.course,
            "deadline_text": item.deadline_text,
        })
    });
    Ok(json!({
        "success": true,
        "items": works,
        "stats": stats,
        "nearest": nearest,
        "courses": courses.len(),
        "failed_courses": bundle.failed_courses,
        "cached": cache_meta.cached,
        "cache_age_seconds": cache_meta.age_seconds,
        "cache_stale": cache_meta.stale,
        "semester": semester.unwrap_or(""),
        "sync_time": now_sync_time(),
        "notice": "本页仅显示作业清单，作答请到学习通官方页",
    }))
}

/// 单课程待办（供「点击时实时取 URL」使用：enc 票据会过期，不能缓存）。
pub(crate) async fn resolve_course_task(
    client: &HbutClient,
    course: &CourseRef,
    task_id: &str,
    event_type: &str,
) -> Result<Option<TaskItem>, DynError> {
    let (items, _, failed) = collect_course(client, &client.client, course).await;
    if failed && items.is_empty() {
        return Err(err_box("学习通待办接口暂时不可用，请稍后重试"));
    }
    Ok(items
        .into_iter()
        .find(|item| item.id == task_id && item.event_type == event_type))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn course() -> CourseRef {
        CourseRef {
            course_id: "100".into(),
            clazz_id: "200".into(),
            cpi: "300".into(),
            name: "工程力学".into(),
            semester: "2026-2027-1".into(),
        }
    }

    #[test]
    fn parses_courses_and_filters_semester() {
        let payload = json!({
            "courses": [
                {"course_id": "1", "clazz_id": "2", "cpi": "3", "name": "A", "semester": "2026-2027-1"},
                {"course_id": "4", "clazz_id": "5", "cpi": "6", "name": "B", "semester": "2025-2026-2"},
                {"course_id": "", "clazz_id": "9", "name": "坏数据"}
            ]
        });
        let all = parse_courses(&payload, None);
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].course_id, "1");
        let current = parse_courses(&payload, Some("2025-2026-2"));
        assert_eq!(current.len(), 1);
        assert_eq!(current[0].name, "B");
    }

    #[test]
    fn picks_current_semester() {
        use chrono::TimeZone;
        let now = chrono::Local
            .with_ymd_and_hms(2026, 11, 21, 8, 0, 0)
            .unwrap();
        assert!(semester_covers_now("2026-2027第一学期", now));
        assert!(!semester_covers_now("2025-2026第二学期", now));
        let spring = chrono::Local.with_ymd_and_hms(2027, 4, 1, 8, 0, 0).unwrap();
        assert!(semester_covers_now("2026-2027第二学期", spring));
        assert!(!semester_covers_now("2026-2027第一学期", spring));
    }

    #[test]
    fn defaults_to_current_semester_plus_unassigned() {
        let mk = |semester: &str| CourseRef {
            course_id: "1".into(),
            clazz_id: "2".into(),
            cpi: "3".into(),
            name: "x".into(),
            semester: semester.into(),
        };
        let courses = vec![
            mk("2026-2027第一学期"),
            mk("2026-2027第一学期"),
            mk("2025-2026第二学期"),
            mk("未分学期"),
            mk(""),
        ];
        // 只在「当前学期」口径下才有意义的断言：显式传学期时严格过滤
        let only_current = default_courses(&courses, Some("2026-2027第一学期"));
        assert_eq!(only_current.len(), 2);
        // 未指定时至少不能把历史学期全拉进来
        let defaulted = default_courses(&courses, None);
        assert!(defaulted.len() <= courses.len());
        assert!(defaulted.iter().all(|c| c.semester != "2025-2026第二学期"));
    }

    #[test]
    fn normalizes_work_item_from_behind_task() {
        let raw = json!({
            "name": "新建作业20261020075320",
            "endDate": "12-31 08:06",
            "endTime": 1798675560000i64,
            "questionNum": 1,
            "avgFinishRate": 82.17,
            "eventType": "work",
            "id": 57227407,
            "url": "https://mooc1.chaoxing.com/mooc2/work/task?enc=abc"
        });
        let item = normalize_task(&raw, &course()).expect("应解析成功");
        assert_eq!(item.event_type, "work");
        assert_eq!(item.name, "新建作业20261020075320");
        assert_eq!(item.id, "57227407");
        assert_eq!(item.deadline_text, "12-31 08:06");
        assert_eq!(item.question_num, Some(1));
        assert_eq!(item.avg_finish_rate, Some(82.17));
        assert!(item.url.contains("enc=abc"));
        assert_eq!(item.course, "工程力学");
    }

    #[test]
    fn normalizes_exam_item_from_import_week_task() {
        let raw = json!({
            "beginTime": 1794700800000i64,
            "endTime": 1797090945000i64,
            "endTimeStr": "2026-12-12 23:55",
            "eventType": "exam",
            "id": 11214243,
            "isFinish": false,
            "name": "《教育学》测试二",
            "url": "https://mooc1.chaoxing.com/exam/test/examcode/examnotes?examId=11214243"
        });
        let item = normalize_task(&raw, &course()).expect("应解析成功");
        assert_eq!(item.event_type, "exam");
        assert_eq!(item.deadline_text, "2026-12-12 23:55");
        assert_eq!(item.deadline_ms, Some(1797090945000));
        assert!(item.url.contains("examnotes"));
    }

    #[test]
    fn treats_dash_and_zero_deadline_as_missing() {
        // 实测：无截止时间的任务上游给 endTime=0 + endDate="--"
        let raw = json!({
            "name": "百日在线锦囊（5）切磋琢磨",
            "endDate": "--",
            "endTime": 0,
            "eventType": "work",
            "id": 1
        });
        let item = normalize_task(&raw, &course()).expect("应解析成功");
        assert_eq!(item.deadline_ms, None);
        assert_eq!(item.deadline_text, "");
    }

    #[test]
    fn drops_finished_and_irrelevant_types() {
        let finished = json!({"name": "x", "eventType": "work", "isFinish": true});
        assert!(normalize_task(&finished, &course()).is_none());
        for other in ["job", "test", "topic", ""] {
            let raw = json!({"name": "x", "eventType": other});
            assert!(
                normalize_task(&raw, &course()).is_none(),
                "{other} 不应进作业/考试清单"
            );
        }
        let nameless = json!({"eventType": "work"});
        assert!(normalize_task(&nameless, &course()).is_none());
    }

    #[test]
    fn summarizes_counts_and_overdue() {
        let now = Local::now().timestamp_millis();
        let items = vec![
            TaskItem {
                id: "1".into(),
                name: "逾期作业".into(),
                course: "A".into(),
                course_id: "1".into(),
                clazz_id: "2".into(),
                cpi: "3".into(),
                semester: "2026-2027-1".into(),
                event_type: "work".into(),
                deadline_ms: Some(now - 86_400_000),
                deadline_text: "".into(),
                question_num: None,
                avg_finish_rate: None,
                url: String::new(),
                finished: false,
            },
            TaskItem {
                id: "2".into(),
                name: "临近作业".into(),
                course: "A".into(),
                course_id: "1".into(),
                clazz_id: "2".into(),
                cpi: "3".into(),
                semester: "2026-2027-1".into(),
                event_type: "work".into(),
                deadline_ms: Some(now + 86_400_000),
                deadline_text: "".into(),
                question_num: None,
                avg_finish_rate: None,
                url: String::new(),
                finished: false,
            },
            TaskItem {
                id: "3".into(),
                name: "考试".into(),
                course: "A".into(),
                course_id: "1".into(),
                clazz_id: "2".into(),
                cpi: "3".into(),
                semester: "2026-2027-1".into(),
                event_type: "exam".into(),
                deadline_ms: Some(now + 10 * 86_400_000),
                deadline_text: "".into(),
                question_num: None,
                avg_finish_rate: None,
                url: String::new(),
                finished: false,
            },
        ];
        let stats = summarize(&items, 7);
        assert_eq!(stats["pending_work"], 2);
        assert_eq!(stats["pending_exam"], 1);
        assert_eq!(stats["overdue"], 1);
        assert_eq!(stats["due_within_3d"], 1);
        assert_eq!(stats["finished_work"], 7);
    }
}
