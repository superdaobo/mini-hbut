//! 学习通「学习记录」（stat2 学情统计）通用取数（P4-C，#1344）。
//!
//! ## 为什么必须两段式
//!
//! ```text
//! ① GET https://stat2-ans.chaoxing.com/study-data/index?courseid=&clazzid=&cpi=&ut=s
//!    → HTML 里藏 32 位 hex pEnc
//! ② GET https://stat2-ans.chaoxing.com/stat2/study-data/{维度}?...&pEnc=<penc>
//!    （Referer 必须是 ① 的地址）
//! ```
//!
//! 跳过 ① 直接调 ② 会 **403**（实测返回「您长时间没有操作，或没有此页面访问权限…2006」）；
//! 只带 pEnc 但 Referer 不对同样 403 —— 两者缺一不可。
//!
//! ## 端点实测（2026-11-20，真实账号，全部 200）
//!
//! `score` / `job` / `weekPv` / `sign` / `test` / `work` / `behindTask` / `importWeekTask`
//! / `point` / `live` / `cxclass` / `videoTest` / `groupTask` / `nearTask` / `weekTask`
//! / `ai-evaluate-stat`（第 17 个 `studyTaskRemind` 返回 405，不做）。
//!
//! ## 缓存
//!
//! pEnc 与各维度结果都缓存 **5 分钟**：同一课程在 6 个 Tab 之间切换不会重复打上游，
//! 也不会因为缓存过久拿到过期凭证。

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::sync::Mutex;

use super::shared::{err_box, now_sync_time, DynError};
use crate::http_client::HbutClient;

/// 结果缓存时长
const CACHE_TTL: Duration = Duration::from_secs(300);
const REQ_TIMEOUT: Duration = Duration::from_secs(20);
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const STAT2_INDEX: &str = "https://stat2-ans.chaoxing.com/study-data/index";
const STAT2_DIM: &str = "https://stat2-ans.chaoxing.com/stat2/study-data";

/// 「章节任务点」统计维度（**唯一提供观看时长的接口**，不在 stat2/study-data 下）。
pub(crate) const DIM_TASK_SUMMARY: &str = "taskSummary";

/// 支持的学情维度白名单。
///
/// 维度名会直接拼进 URL 路径，必须白名单校验，杜绝「任意路径注入」。
pub(crate) const STUDY_DIMENSIONS: [&str; 16] = [
    "score",
    "job",
    "weekPv",
    "sign",
    "test",
    "work",
    "behindTask",
    "importWeekTask",
    "point",
    "live",
    "cxclass",
    "videoTest",
    "groupTask",
    "nearTask",
    "weekTask",
    "ai-evaluate-stat",
];

/// 概览 Tab 默认维度（前端不传 dimensions 时使用）
pub const STUDY_RECORD_DEFAULT_DIMENSIONS: [&str; 7] = [
    "score",
    "job",
    "test",
    "work",
    "groupTask",
    "point",
    "weekPv",
];

struct CacheEntry {
    at: Instant,
    value: Value,
}

static STUDY_CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();

fn cache_slot() -> &'static Mutex<HashMap<String, CacheEntry>> {
    STUDY_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

async fn read_cache(key: &str) -> Option<Value> {
    let guard = cache_slot().lock().await;
    guard
        .get(key)
        .filter(|entry| entry.at.elapsed() < CACHE_TTL)
        .map(|entry| entry.value.clone())
}

async fn write_cache(key: String, value: Value) {
    let mut guard = cache_slot().lock().await;
    guard.insert(
        key,
        CacheEntry {
            at: Instant::now(),
            value,
        },
    );
}

/// 维度名是否受支持
pub(crate) fn is_supported_dimension(dimension: &str) -> bool {
    STUDY_DIMENSIONS.contains(&dimension)
}

/// 统计页首页地址（也是后续维度请求的 Referer）
fn index_url(course_id: &str, clazz_id: &str, cpi: &str) -> String {
    format!("{STAT2_INDEX}?courseid={course_id}&clazzid={clazz_id}&cpi={cpi}&ut=s")
}

/// 从统计页 HTML 提取 32 位 pEnc（5 种写法兼容，与历史实现一致）
pub(crate) fn extract_penc(html: &str) -> String {
    let patterns = [
        r#"id="pEnc"\s+value="([a-fA-F0-9]{32})""#,
        r#"id='pEnc'\s+value='([a-fA-F0-9]{32})'"#,
        r#"name="pEnc"\s+value="([a-fA-F0-9]{32})""#,
        r#"pEnc["']?\s*[:=]\s*["']([a-fA-F0-9]{32})["']"#,
        r#"pEnc=([a-fA-F0-9]{32})"#,
    ];
    for pat in patterns {
        if let Ok(re) = regex::Regex::new(pat) {
            if let Some(cap) = re.captures(html) {
                if let Some(m) = cap.get(1) {
                    return m.as_str().to_string();
                }
            }
        }
    }
    String::new()
}

/// pEnc 取不到时的归因（三种情况给三种文案，便于用户自查）
fn classify_penc_failure(html: &str) -> &'static str {
    if html.contains("login") || html.contains("passport") {
        "学习统计页需要重新桥接学习通会话，请退出后重新登录门户"
    } else if html.len() < 80 {
        "学习统计页返回为空，课程可能未开通统计"
    } else {
        "未能解析学习统计页凭证 pEnc，请确认课程已开通学情统计"
    }
}

/// 统计首页里的两个票据。
///
/// 实测（2026-11-20）：
/// - `pEnc` 用于 `stat2/study-data/*` 各维度；
/// - `jobEnc` 用于 `stat2/task/s/index`（章节任务点，**观看时长只在这里**）；
/// - 两者都在 `study-data/index` 的内联脚本里（`var pEnc = '…'; var jobEnc = '…';`），
///   用错会返回 403「您长时间没有操作，或没有此页面访问权限…2006」。
pub(crate) struct StudyEnc {
    pub penc: String,
    pub job_enc: String,
    pub index_url: String,
}

/// 取 pEnc + jobEnc（5 分钟缓存）
pub(crate) async fn fetch_study_enc(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Result<StudyEnc, DynError> {
    let url = index_url(course_id, clazz_id, cpi);
    let cache_key = format!("enc:{course_id}:{clazz_id}");
    if let Some(cached) = read_cache(&cache_key).await {
        let penc = cached
            .get("penc")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let job_enc = cached
            .get("jobEnc")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if !penc.is_empty() && !job_enc.is_empty() {
            return Ok(StudyEnc {
                penc: penc.to_string(),
                job_enc: job_enc.to_string(),
                index_url: url,
            });
        }
    }

    let html = client
        .client
        .get(&url)
        .header("Referer", "https://mooc1.chaoxing.com/")
        .header("User-Agent", UA)
        .timeout(REQ_TIMEOUT)
        .send()
        .await?
        .text()
        .await?;

    let penc = extract_penc(&html);
    if penc.is_empty() {
        return Err(err_box(classify_penc_failure(&html)));
    }
    let job_enc = regex::Regex::new(r#"jobEnc\s*=\s*['"]([a-fA-F0-9]{32})['"]"#)
        .ok()
        .and_then(|re| re.captures(&html))
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .unwrap_or_default();
    write_cache(cache_key, json!({ "penc": penc, "jobEnc": job_enc })).await;
    Ok(StudyEnc {
        penc,
        job_enc,
        index_url: url,
    })
}

/// 取 pEnc 与 Referer（两段式的第一步，5 分钟缓存）
pub(crate) async fn fetch_penc(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Result<(String, String), DynError> {
    let enc = fetch_study_enc(client, course_id, clazz_id, cpi).await?;
    Ok((enc.penc, enc.index_url))
}

/// 取单个维度（两段式的第二步，5 分钟缓存）
pub(crate) async fn fetch_dimension(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    dimension: &str,
    force: bool,
) -> Result<Value, DynError> {
    if dimension == DIM_TASK_SUMMARY {
        return fetch_task_summary(client, course_id, clazz_id, cpi, force).await;
    }
    if !is_supported_dimension(dimension) {
        return Err(err_box(format!("不支持的学情维度: {dimension}")));
    }
    let cache_key = format!("dim:{course_id}:{clazz_id}:{dimension}");
    if !force {
        if let Some(cached) = read_cache(&cache_key).await {
            return Ok(cached);
        }
    }

    let (penc, referer) = fetch_penc(client, course_id, clazz_id, cpi).await?;
    let url = format!(
        "{STAT2_DIM}/{dimension}?clazzid={clazz_id}&courseid={course_id}&cpi={cpi}&ut=s&pEnc={penc}"
    );
    let resp = client
        .client
        .get(&url)
        .header("Referer", &referer)
        .header("User-Agent", UA)
        .timeout(REQ_TIMEOUT)
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    let value: Value = serde_json::from_str(&text).map_err(|_| {
        // 403/登录页都是 HTML，给用户可行动的文案，而不是解析错误
        let hint = if text.contains("没有此页面访问权限") || text.contains("2006") {
            "学习统计接口拒绝了本次请求（pEnc 或 Referer 失效），请重试"
        } else if status == reqwest::StatusCode::FORBIDDEN {
            "学习统计接口返回 403，请重新登录学习通后重试"
        } else {
            "学习统计接口返回的不是 JSON（可能需要重新登录学习通）"
        };
        err_box(hint)
    })?;

    write_cache(cache_key, value.clone()).await;
    Ok(value)
}

/// 批量取多个维度（前端一个 Tab 一次调用）。
///
/// 单维度失败不影响其它维度：失败进 `errors`，成功进 `dimensions`。
pub(crate) async fn fetch_dimensions(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    dimensions: &[String],
    force: bool,
) -> Result<Value, DynError> {
    if course_id.trim().is_empty() || clazz_id.trim().is_empty() {
        return Err(err_box("课程参数不完整（courseId/clazzId）"));
    }
    let mut data = serde_json::Map::new();
    let mut errors = serde_json::Map::new();
    for dimension in dimensions {
        match fetch_dimension(client, course_id, clazz_id, cpi, dimension, force).await {
            Ok(value) => {
                data.insert(dimension.clone(), value);
            }
            Err(e) => {
                errors.insert(dimension.clone(), json!(e.to_string()));
            }
        }
    }
    Ok(json!({
        "success": errors.is_empty(),
        "course_id": course_id,
        "clazz_id": clazz_id,
        "dimensions": data,
        "errors": errors,
        "sync_time": now_sync_time(),
    }))
}

/// 学习记录取数命令实现（transport 层薄封装直接调它）。
pub async fn chaoxing_fetch_study_record(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    dimensions: &[String],
    force: bool,
) -> Result<Value, DynError> {
    if !super::chaoxing_session::has_chaoxing_session(client) {
        return Err(err_box("当前没有可用的学习通会话，请先登录学习通"));
    }
    let dims: Vec<String> = if dimensions.is_empty() {
        STUDY_RECORD_DEFAULT_DIMENSIONS
            .iter()
            .map(|d| d.to_string())
            .collect()
    } else {
        dimensions.to_vec()
    };
    fetch_dimensions(client, course_id, clazz_id, cpi, &dims, force).await
}

/// 章节任务点统计：**观看/阅读时长唯一来源**（`stat2/task/s/index`）。
///
/// 该页是**服务端渲染的 HTML**（不是 JSON），用 `pEnc=jobEnc` 取，Referer 用统计首页。
pub(crate) async fn fetch_task_summary(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    force: bool,
) -> Result<Value, DynError> {
    let cache_key = format!("dim:{course_id}:{clazz_id}:{DIM_TASK_SUMMARY}");
    if !force {
        if let Some(cached) = read_cache(&cache_key).await {
            return Ok(cached);
        }
    }
    let enc = fetch_study_enc(client, course_id, clazz_id, cpi).await?;
    if enc.job_enc.is_empty() {
        return Err(err_box(
            "统计首页未下发章节任务点票据（jobEnc），无法读取观看时长",
        ));
    }
    let url = format!(
        "https://stat2-ans.chaoxing.com/stat2/task/s/index?courseid={course_id}&clazzid={clazz_id}&cpi={cpi}&ut=s&pEnc={}",
        enc.job_enc
    );
    let resp = client
        .client
        .get(&url)
        .header("Referer", &enc.index_url)
        .header("User-Agent", UA)
        .timeout(REQ_TIMEOUT)
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() || !text.contains("累计观看") {
        return Err(err_box("章节任务点统计页不可用（可能需要重新登录学习通）"));
    }
    let summary = parse_task_summary(&text);
    write_cache(cache_key, summary.clone()).await;
    Ok(summary)
}

/// 从「章节任务点」HTML 里抽统计数字（页面是服务端渲染，结构稳定）。
pub(crate) fn parse_task_summary(html: &str) -> Value {
    fn cap_f64(html: &str, pattern: &str) -> Option<f64> {
        regex::Regex::new(pattern)
            .ok()
            .and_then(|re| re.captures(html))
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().trim().parse::<f64>().ok())
    }

    let resources = cap_f64(html, r"共\s*(\d+)\s*个学习资源");
    let task_points = cap_f64(html, r"<span>\s*(\d+)\s*</span>\s*个任务点");
    let completed = cap_f64(html, r"个任务点\s*<span>\s*(\d+)\s*</span>\s*个已完成");
    let watched = cap_f64(
        html,
        r#"累计观看\s*</span>\s*<div class="fl min"><span>([\d.]+)</span>"#,
    );
    let total_minutes = cap_f64(html, r"总时长\s*(\d+)\s*分钟");
    let read_minutes = cap_f64(
        html,
        r#"累计阅读\s*</span>\s*<div class="fl min"><span>([\d.]+)</span>"#,
    );
    let read_required = cap_f64(html, r"要求时长\s*(\d+)\s*分钟");

    let percent = match (watched, total_minutes) {
        (Some(w), Some(t)) if t > 0.0 => (w / t * 100.0 * 10.0).round() / 10.0,
        _ => 0.0,
    };

    json!({
        "resources": resources.unwrap_or(0.0) as i64,
        "task_points": task_points.unwrap_or(0.0) as i64,
        "completed": completed.unwrap_or(0.0) as i64,
        "video_watched_minutes": watched.unwrap_or(0.0),
        "video_total_minutes": total_minutes.unwrap_or(0.0),
        "video_percent": percent,
        "read_minutes": read_minutes.unwrap_or(0.0),
        "read_required_minutes": read_required.unwrap_or(0.0),
        "status": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_all_documented_dimensions() {
        for dim in STUDY_DIMENSIONS {
            assert!(is_supported_dimension(dim), "{dim} 应受支持");
        }
        assert_eq!(STUDY_DIMENSIONS.len(), 16);
    }

    #[test]
    fn rejects_unknown_dimensions() {
        for dim in ["studyTaskRemind", "../score", "score?x=1", "", "SCORE"] {
            assert!(!is_supported_dimension(dim), "{dim} 不应受支持");
        }
    }

    #[test]
    fn extracts_penc_from_common_markup() {
        let html = r#"<input type="hidden" id="pEnc" value="1b41a73a0578fec4b1a54f9ac23913f9">"#;
        assert_eq!(extract_penc(html), "1b41a73a0578fec4b1a54f9ac23913f9");
        let single = "<input id='pEnc' value='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'>";
        assert_eq!(extract_penc(single), "a".repeat(32));
        assert!(extract_penc("<html></html>").is_empty());
    }

    #[test]
    fn parses_task_summary_html() {
        let html = r#"
        <p class="tDec">共 392 个学习资源，包括<span>374</span>个任务点<span>311</span>个已完成</p>
        <span class="fl fs14 color646873">累计观看</span>
        <div class="fl min"><span>2059.7</span>分钟</div>
        <p class="bottomC fs12">总时长 2528 分钟 (包含章节中所有视频、音频)</p>
        <span class="fl fs14 color646873">累计阅读</span>
        <div class="fl min"><span>102.8</span>分钟</div>
        <p class="bottomC fs12"><span class="font-bold">要求时长 0 分钟</span></p>
        "#;
        let summary = parse_task_summary(html);
        assert_eq!(summary["resources"], 392);
        assert_eq!(summary["task_points"], 374);
        assert_eq!(summary["completed"], 311);
        assert_eq!(summary["video_watched_minutes"], 2059.7);
        assert_eq!(summary["video_total_minutes"], 2528.0);
        assert_eq!(summary["video_percent"], 81.5);
        assert_eq!(summary["read_minutes"], 102.8);
        assert_eq!(summary["read_required_minutes"], 0.0);
    }

    #[test]
    fn parses_task_summary_without_numbers() {
        let summary = parse_task_summary("<html>无数据</html>");
        assert_eq!(summary["video_watched_minutes"], 0.0);
        assert_eq!(summary["video_percent"], 0.0);
    }

    #[test]
    fn classifies_penc_failures() {
        assert!(classify_penc_failure("<html>passport2 login</html>").contains("重新登录"));
        assert!(classify_penc_failure("short").contains("未开通统计"));
        assert!(classify_penc_failure(&"x".repeat(200)).contains("pEnc"));
    }
}
