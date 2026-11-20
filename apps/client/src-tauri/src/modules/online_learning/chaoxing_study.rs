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

/// 取 pEnc 与 Referer（两段式的第一步，5 分钟缓存）
pub(crate) async fn fetch_penc(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Result<(String, String), DynError> {
    let url = index_url(course_id, clazz_id, cpi);
    let cache_key = format!("penc:{course_id}:{clazz_id}");
    if let Some(cached) = read_cache(&cache_key).await {
        if let Some(penc) = cached.as_str().filter(|s| !s.is_empty()) {
            return Ok((penc.to_string(), url));
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
    write_cache(cache_key, json!(penc)).await;
    Ok((penc, url))
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
    fn classifies_penc_failures() {
        assert!(classify_penc_failure("<html>passport2 login</html>").contains("重新登录"));
        assert!(classify_penc_failure("short").contains("未开通统计"));
        assert!(classify_penc_failure(&"x".repeat(200)).contains("pEnc"));
    }
}
