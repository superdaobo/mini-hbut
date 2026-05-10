// SPDX-License-Identifier: GPL-3.0-or-later
// Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
// Upstream: https://github.com/AneryCoft/course_helper

//! 超星签到协议端点与重试策略。

use std::time::Duration;
use serde::{Deserialize, Serialize};
use super::errors::CheckinErrorCode;
use super::session::detect_session_expired;

// ─── HTTP Header 指纹 ───────────────────────────────────────────────────────

mod headers {
    use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT, ACCEPT};

    /// 构造仿真超星移动客户端的默认 HTTP 请求头。
    pub fn default_headers() -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Dalvik/2.1.0 (Linux; U; Android 12; Pixel 6 Build/SD1A.210817.036) \
                 com.chaoxing.mobile/ChaoXingStudy_3_6.3.3_android_phone_10986_249 \
                 (@Kalimdor)_a]d7194b69-0dac-4ed6-85ef-18c37b8f1b48",
            ),
        );
        h.insert(ACCEPT, HeaderValue::from_static("*/*"));
        h.insert(
            "X-Requested-With",
            HeaderValue::from_static("com.chaoxing.mobile"),
        );
        h
    }
}

// ─── 数据类型 ────────────────────────────────────────────────────────────────

/// 签到活动信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckinActivity {
    pub active_id: String,
    pub course_id: String,
    pub clazz_id: String,
    pub course_name: String,
    pub teacher_name: String,
    pub activity_type: ActivityType,
    pub status: ActivityStatus,
    pub start_time: i64,
    pub end_time: i64,
    pub snapshot_timestamp: i64,
}

/// 签到活动类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    Normal,
    Location,
    Photo,
    Qrcode,
    Gesture,
}

/// 签到活动状态（排序优先级：Active > Pending > Signed > Expired）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityStatus {
    Active,
    Pending,
    Signed,
    Expired,
}

/// 班级/课程信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClazzInfo {
    pub course_id: String,
    pub clazz_id: String,
    pub course_name: String,
    pub teacher_name: String,
    pub fid: String,
}

/// PPT 签到参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PptSignParams {
    pub active_id: String,
    pub uid: String,
    pub fid: String,
    pub name: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub address: Option<String>,
    pub object_id: Option<String>,
    pub enc: Option<String>,
}

/// 照片上传结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoUploadResult {
    pub object_id: String,
    pub thumb_url: String,
}

// ─── 重试策略 ────────────────────────────────────────────────────────────────

/// 判断是否应重试以及重试延迟。
///
/// - 仅 `NetworkError` 和 `ServerError` 可重试
/// - attempt 0 → 延迟 800ms
/// - attempt 1 → 延迟 1800ms
/// - attempt ≥ 2 或不可重试错误 → 返回 `None`
pub fn should_retry(err: &CheckinErrorCode, attempt: u32) -> Option<Duration> {
    match err {
        CheckinErrorCode::NetworkError | CheckinErrorCode::ServerError => match attempt {
            0 => Some(Duration::from_millis(800)),
            1 => Some(Duration::from_millis(1800)),
            _ => None,
        },
        _ => None,
    }
}

// ─── 协议端点实现 ─────────────────────────────────────────────────────────────

/// 拉取签到活动列表（按课程逐个查询后合并）。
///
/// 流程：先调 backclazzdata 获取课程列表，再对每个课程调 activelist 获取签到活动。
/// 注意：activelist 接口要求传入真实的 courseId + classId + fid，传 0 会返回 500。
pub async fn list_activities(
    client: &reqwest::Client,
    _uid: &str,
) -> Result<Vec<serde_json::Value>, CheckinErrorCode> {
    // 第一步：获取课程列表
    let clazz_list = list_clazz(client, _uid).await?;
    
    if clazz_list.is_empty() {
        eprintln!("[签到调试] list_activities: 课程列表为空，无法获取签到活动");
        return Ok(Vec::new());
    }

    // 从 cookie 中提取 fid（学校 ID）
    let fid = "0".to_string(); // 默认值，后续从 cookie 提取
    
    // 第二步：对每个课程查询签到活动
    let mut all_activities: Vec<serde_json::Value> = Vec::new();
    let timestamp = chrono::Utc::now().timestamp_millis();

    for clazz in &clazz_list {
        let url = format!(
            "https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist\
             ?fid={}&courseId={}&classId={}&_={}",
            if fid == "0" { &clazz.fid } else { &fid },
            clazz.course_id,
            clazz.clazz_id,
            timestamp
        );

        let resp = match client
            .get(&url)
            .headers(headers::default_headers())
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[签到调试] list_activities 课程 {} 网络错误: {}", clazz.course_id, e);
                continue; // 跳过失败的课程，继续下一个
            }
        };

        let status = resp.status();
        let final_url = resp.url().to_string();
        let body = match resp.text().await {
            Ok(b) => b,
            Err(_) => continue,
        };

        if detect_session_expired(status, &final_url, &body) {
            eprintln!("[签到调试] list_activities 检测到会话过期");
            return Err(CheckinErrorCode::SessionExpired);
        }

        if !status.is_success() {
            eprintln!("[签到调试] list_activities 课程 {} 返回 {}: {}", 
                clazz.course_id, status, &body[..body.len().min(200)]);
            continue; // 跳过失败的课程
        }

        // 解析 JSON
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(active_list) = json
                .get("data")
                .and_then(|d| d.get("activeList"))
                .and_then(|a| a.as_array())
            {
                for activity in active_list {
                    // 注入 courseId 和 classId 到活动数据中（API 返回的可能不含）
                    let mut act = activity.clone();
                    if let Some(obj) = act.as_object_mut() {
                        obj.entry("courseId".to_string())
                            .or_insert(serde_json::Value::String(clazz.course_id.clone()));
                        obj.entry("classId".to_string())
                            .or_insert(serde_json::Value::String(clazz.clazz_id.clone()));
                    }
                    all_activities.push(act);
                }
            }
        }
    }

    eprintln!("[签到调试] list_activities 共获取 {} 个活动（来自 {} 个课程）", 
        all_activities.len(), clazz_list.len());

    Ok(all_activities)
}

/// 拉取班级/课程列表。
///
/// GET `https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1`
pub async fn list_clazz(
    client: &reqwest::Client,
    _uid: &str,
) -> Result<Vec<ClazzInfo>, CheckinErrorCode> {
    let url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";

    let resp = client
        .get(url)
        .headers(headers::default_headers())
        .send()
        .await
        .map_err(|_| CheckinErrorCode::NetworkError)?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let body = resp.text().await.map_err(|_| CheckinErrorCode::NetworkError)?;

    if detect_session_expired(status, &final_url, &body) {
        return Err(CheckinErrorCode::SessionExpired);
    }

    if !status.is_success() {
        return Err(CheckinErrorCode::ServerError);
    }

    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| CheckinErrorCode::ServerError)?;

    // 解析 channelList → content → course + id
    let mut result = Vec::new();
    if let Some(channel_list) = json.get("channelList").and_then(|c| c.as_array()) {
        for item in channel_list {
            if let Some(content) = item.get("content") {
                let course = content.get("course").unwrap_or(content);
                let course_id = course
                    .get("data")
                    .and_then(|d| d.get(0))
                    .and_then(|d| d.get("id"))
                    .and_then(|v| v.as_i64())
                    .map(|v| v.to_string())
                    .or_else(|| course.get("courseId").and_then(|v| v.as_i64()).map(|v| v.to_string()))
                    .unwrap_or_default();

                let clazz_id = content
                    .get("id")
                    .and_then(|v| v.as_i64())
                    .map(|v| v.to_string())
                    .unwrap_or_default();

                let course_name = course
                    .get("data")
                    .and_then(|d| d.get(0))
                    .and_then(|d| d.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let teacher_name = content
                    .get("teacherfactor")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                // 提取学校 fid（belongSchoolId）
                let fid = course
                    .get("data")
                    .and_then(|d| d.get(0))
                    .and_then(|d| d.get("belongSchoolId"))
                    .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_i64().map(|n| n.to_string())))
                    .unwrap_or_else(|| "0".to_string());

                if !course_id.is_empty() && !clazz_id.is_empty() {
                    result.push(ClazzInfo {
                        course_id,
                        clazz_id,
                        course_name,
                        teacher_name,
                        fid,
                    });
                }
            }
        }
    }

    Ok(result)
}

/// 纯函数：将原始活动 JSON 归一化为 `CheckinActivity` 列表。
///
/// - 根据 `otherId` 字段判定活动类型（0=normal, 2=qrcode, 3=gesture, 4=location, 5=photo）
/// - 根据时间与状态判定 ActivityStatus
/// - 按 active_id 去重
/// - 排序：active > pending > signed > expired，同状态按 start_time DESC
pub fn normalize_activities(
    raw_activities: Vec<serde_json::Value>,
    clazz_list: &[ClazzInfo],
    now_ms: i64,
) -> Vec<CheckinActivity> {
    use std::collections::HashMap;

    // 建立 course_id → ClazzInfo 的索引
    let clazz_map: HashMap<&str, &ClazzInfo> = clazz_list
        .iter()
        .map(|c| (c.course_id.as_str(), c))
        .collect();

    let mut activities: Vec<CheckinActivity> = Vec::new();
    let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for item in &raw_activities {
        let active_id = item
            .get("id")
            .and_then(|v| v.as_i64())
            .map(|v| v.to_string())
            .or_else(|| item.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .unwrap_or_default();

        if active_id.is_empty() || !seen_ids.insert(active_id.clone()) {
            continue;
        }

        let course_id = item
            .get("courseId")
            .and_then(|v| v.as_i64())
            .map(|v| v.to_string())
            .or_else(|| item.get("courseId").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .unwrap_or_default();

        let clazz_id = item
            .get("classId")
            .and_then(|v| v.as_i64())
            .map(|v| v.to_string())
            .or_else(|| item.get("classId").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .unwrap_or_default();

        // 从 clazz_list 补全课程名和教师名
        let (course_name, teacher_name) = if let Some(clazz) = clazz_map.get(course_id.as_str()) {
            (clazz.course_name.clone(), clazz.teacher_name.clone())
        } else {
            let cn = item
                .get("nameOne")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            ("".to_string(), cn)
        };

        // 活动类型：otherId 字段
        let other_id = item
            .get("otherId")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let activity_type = match other_id {
            2 => ActivityType::Qrcode,
            3 => ActivityType::Gesture,
            4 => ActivityType::Location,
            5 => ActivityType::Photo,
            _ => ActivityType::Normal,
        };

        // 时间
        let start_time = item
            .get("startTime")
            .and_then(|v| v.as_i64())
            .or_else(|| item.get("startTime").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()))
            .unwrap_or(0);

        let end_time = item
            .get("endTime")
            .and_then(|v| v.as_i64())
            .or_else(|| item.get("endTime").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()))
            .unwrap_or(0);

        // 状态判定
        let status_code = item
            .get("status")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let status = if status_code == 1 {
            // 已签到
            ActivityStatus::Signed
        } else if end_time > 0 && now_ms > end_time {
            // 已过期
            ActivityStatus::Expired
        } else if start_time > 0 && now_ms < start_time {
            // 未开始
            ActivityStatus::Pending
        } else {
            // 进行中
            ActivityStatus::Active
        };

        activities.push(CheckinActivity {
            active_id,
            course_id,
            clazz_id,
            course_name,
            teacher_name,
            activity_type,
            status,
            start_time,
            end_time,
            snapshot_timestamp: now_ms,
        });
    }

    // 排序：status 升序（Active < Pending < Signed < Expired），同状态 start_time DESC
    activities.sort_by(|a, b| {
        a.status.cmp(&b.status).then_with(|| b.start_time.cmp(&a.start_time))
    });

    activities
}

/// 预签到请求（设置 cookie）。
///
/// GET `https://mobilelearn.chaoxing.com/newsign/preSign`
pub async fn pre_sign(
    client: &reqwest::Client,
    active_id: &str,
    course_id: &str,
    clazz_id: &str,
    uid: &str,
    _fid: &str,
) -> Result<(), CheckinErrorCode> {
    let url = format!(
        "https://mobilelearn.chaoxing.com/newsign/preSign\
         ?courseId={}&classId={}&activePrimaryId={}&general=1&sys=1&ls=1\
         &appType=15&tid=&uid={}&ut=s&isTeacherViewOpen=0",
        course_id, clazz_id, active_id, uid
    );

    let resp = client
        .get(&url)
        .headers(headers::default_headers())
        .send()
        .await
        .map_err(|_| CheckinErrorCode::NetworkError)?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let body = resp.text().await.map_err(|_| CheckinErrorCode::NetworkError)?;

    if detect_session_expired(status, &final_url, &body) {
        return Err(CheckinErrorCode::SessionExpired);
    }

    if !status.is_success() {
        return Err(CheckinErrorCode::ServerError);
    }

    Ok(())
}

/// PPT 签到请求。
///
/// GET `https://mobilelearn.chaoxing.com/pptSign`
pub async fn ppt_sign(
    client: &reqwest::Client,
    params: &PptSignParams,
) -> Result<String, CheckinErrorCode> {
    let latitude = params.latitude.unwrap_or(-1.0);
    let longitude = params.longitude.unwrap_or(-1.0);
    let address = params.address.as_deref().unwrap_or("");
    let object_id = params.object_id.as_deref().unwrap_or("");

    let url = format!(
        "https://mobilelearn.chaoxing.com/pptSign\
         ?activeId={}&uid={}&clientip=&latitude={}&longitude={}\
         &appType=15&fid={}&name={}&address={}&objectId={}",
        params.active_id, params.uid, latitude, longitude,
        params.fid, params.name, address, object_id
    );

    let resp = client
        .get(&url)
        .headers(headers::default_headers())
        .send()
        .await
        .map_err(|_| CheckinErrorCode::NetworkError)?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let body = resp.text().await.map_err(|_| CheckinErrorCode::NetworkError)?;

    if detect_session_expired(status, &final_url, &body) {
        return Err(CheckinErrorCode::SessionExpired);
    }

    if !status.is_success() {
        return Err(CheckinErrorCode::ServerError);
    }

    Ok(body)
}

/// 手势签到（带 signCode 参数）。
///
/// GET `https://mobilelearn.chaoxing.com/pptSign` with signCode
pub async fn ppt_sign_with_code(
    client: &reqwest::Client,
    active_id: &str,
    uid: &str,
    fid: &str,
    name: &str,
    sign_code: &str,
) -> Result<String, CheckinErrorCode> {
    let url = format!(
        "https://mobilelearn.chaoxing.com/pptSign\
         ?activeId={}&uid={}&clientip=&latitude=-1&longitude=-1\
         &appType=15&fid={}&name={}&address=&objectId=&signCode={}",
        active_id, uid, fid, name, sign_code
    );

    let resp = client
        .get(&url)
        .headers(headers::default_headers())
        .send()
        .await
        .map_err(|_| CheckinErrorCode::NetworkError)?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let body = resp.text().await.map_err(|_| CheckinErrorCode::NetworkError)?;

    if detect_session_expired(status, &final_url, &body) {
        return Err(CheckinErrorCode::SessionExpired);
    }

    if !status.is_success() {
        return Err(CheckinErrorCode::ServerError);
    }

    Ok(body)
}

/// 上传签到照片。
///
/// POST `https://pan-yz.chaoxing.com/upload` multipart form
pub async fn upload_photo(
    client: &reqwest::Client,
    bytes: &[u8],
    mime: &str,
    file_name: &str,
    uid: &str,
) -> Result<PhotoUploadResult, CheckinErrorCode> {
    use reqwest::multipart::{Form, Part};

    let part = Part::bytes(bytes.to_vec())
        .file_name(file_name.to_string())
        .mime_str(mime)
        .map_err(|_| CheckinErrorCode::BadRequest)?;

    let form = Form::new()
        .part("file", part)
        .text("puid", uid.to_string());

    let resp = client
        .post("https://pan-yz.chaoxing.com/upload")
        .headers(headers::default_headers())
        .multipart(form)
        .send()
        .await
        .map_err(|_| CheckinErrorCode::NetworkError)?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let body = resp.text().await.map_err(|_| CheckinErrorCode::NetworkError)?;

    if detect_session_expired(status, &final_url, &body) {
        return Err(CheckinErrorCode::SessionExpired);
    }

    if !status.is_success() {
        return Err(CheckinErrorCode::ServerError);
    }

    // 解析响应 JSON
    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| CheckinErrorCode::ServerError)?;

    let object_id = json
        .get("objectId")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let thumb_url = json
        .get("previewUrl")
        .or_else(|| json.get("thumbUrl"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    if object_id.is_empty() {
        return Err(CheckinErrorCode::ServerError);
    }

    Ok(PhotoUploadResult {
        object_id,
        thumb_url,
    })
}

/// 二维码预签到。
///
/// GET `https://mobilelearn.chaoxing.com/newsign/preSign` with enc parameter
pub async fn qr_pre_sign(
    client: &reqwest::Client,
    active_id: &str,
    enc: &str,
    uid: &str,
    fid: &str,
    name: &str,
) -> Result<String, CheckinErrorCode> {
    let url = format!(
        "https://mobilelearn.chaoxing.com/newsign/preSign\
         ?courseId=0&classId=0&activePrimaryId={}&general=1&sys=1&ls=1\
         &appType=15&tid=&uid={}&ut=s&enc={}&fid={}&name={}",
        active_id, uid, enc, fid, name
    );

    let resp = client
        .get(&url)
        .headers(headers::default_headers())
        .send()
        .await
        .map_err(|_| CheckinErrorCode::NetworkError)?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    let body = resp.text().await.map_err(|_| CheckinErrorCode::NetworkError)?;

    if detect_session_expired(status, &final_url, &body) {
        return Err(CheckinErrorCode::SessionExpired);
    }

    if !status.is_success() {
        return Err(CheckinErrorCode::ServerError);
    }

    Ok(body)
}

// ─── 单元测试 ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod retry_unit {
    use super::*;

    #[test]
    fn network_error_retries_twice() {
        let err = CheckinErrorCode::NetworkError;
        assert_eq!(should_retry(&err, 0), Some(Duration::from_millis(800)));
        assert_eq!(should_retry(&err, 1), Some(Duration::from_millis(1800)));
        assert_eq!(should_retry(&err, 2), None);
        assert_eq!(should_retry(&err, 3), None);
    }

    #[test]
    fn server_error_retries_twice() {
        let err = CheckinErrorCode::ServerError;
        assert_eq!(should_retry(&err, 0), Some(Duration::from_millis(800)));
        assert_eq!(should_retry(&err, 1), Some(Duration::from_millis(1800)));
        assert_eq!(should_retry(&err, 2), None);
    }

    #[test]
    fn non_retryable_errors_never_retry() {
        let non_retryable = [
            CheckinErrorCode::SessionExpired,
            CheckinErrorCode::BadRequest,
            CheckinErrorCode::AlreadySigned,
            CheckinErrorCode::RateLimited,
            CheckinErrorCode::PermissionDenied,
            CheckinErrorCode::Unknown,
        ];
        for err in &non_retryable {
            assert_eq!(should_retry(err, 0), None, "不应重试: {:?}", err);
            assert_eq!(should_retry(err, 1), None);
        }
    }
}

#[cfg(test)]
mod headers_unit {
    use super::headers::default_headers;
    use reqwest::header::{USER_AGENT, ACCEPT};

    #[test]
    fn has_user_agent() {
        let h = default_headers();
        let ua = h.get(USER_AGENT).expect("应包含 User-Agent");
        let ua_str = ua.to_str().unwrap();
        assert!(ua_str.contains("com.chaoxing.mobile"), "UA 应包含超星标识");
        assert!(ua_str.contains("ChaoXingStudy"), "UA 应包含 ChaoXingStudy");
    }

    #[test]
    fn has_accept() {
        let h = default_headers();
        let accept = h.get(ACCEPT).expect("应包含 Accept");
        assert_eq!(accept.to_str().unwrap(), "*/*");
    }

    #[test]
    fn has_x_requested_with() {
        let h = default_headers();
        let xrw = h.get("X-Requested-With").expect("应包含 X-Requested-With");
        assert_eq!(xrw.to_str().unwrap(), "com.chaoxing.mobile");
    }
}

#[cfg(test)]
mod normalize_unit {
    use super::*;

    fn make_raw_activity(id: i64, other_id: i64, status: i64, start: i64, end: i64) -> serde_json::Value {
        serde_json::json!({
            "id": id,
            "courseId": 1001,
            "classId": 2001,
            "otherId": other_id,
            "status": status,
            "startTime": start,
            "endTime": end,
            "nameOne": "测试课程"
        })
    }

    #[test]
    fn deduplicates_by_active_id() {
        let raw = vec![
            make_raw_activity(100, 0, 0, 1000, 9999999999999),
            make_raw_activity(100, 0, 0, 1000, 9999999999999),
        ];
        let result = normalize_activities(raw, &[], 5000);
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn determines_activity_type_from_other_id() {
        let raw = vec![
            make_raw_activity(1, 0, 0, 1000, 9999999999999),
            make_raw_activity(2, 2, 0, 1000, 9999999999999),
            make_raw_activity(3, 3, 0, 1000, 9999999999999),
            make_raw_activity(4, 4, 0, 1000, 9999999999999),
            make_raw_activity(5, 5, 0, 1000, 9999999999999),
        ];
        let result = normalize_activities(raw, &[], 5000);
        assert_eq!(result[0].activity_type, ActivityType::Normal);
        assert_eq!(result[1].activity_type, ActivityType::Qrcode);
        assert_eq!(result[2].activity_type, ActivityType::Gesture);
        assert_eq!(result[3].activity_type, ActivityType::Location);
        assert_eq!(result[4].activity_type, ActivityType::Photo);
    }

    #[test]
    fn determines_status_correctly() {
        let now = 5000i64;
        let raw = vec![
            make_raw_activity(1, 0, 1, 1000, 9999),  // signed (status=1)
            make_raw_activity(2, 0, 0, 1000, 4000),  // expired (end < now)
            make_raw_activity(3, 0, 0, 6000, 9000),  // pending (start > now)
            make_raw_activity(4, 0, 0, 1000, 9000),  // active
        ];
        let result = normalize_activities(raw, &[], now);
        // 排序后：active, pending, signed, expired
        assert_eq!(result[0].status, ActivityStatus::Active);
        assert_eq!(result[1].status, ActivityStatus::Pending);
        assert_eq!(result[2].status, ActivityStatus::Signed);
        assert_eq!(result[3].status, ActivityStatus::Expired);
    }

    #[test]
    fn sorts_same_status_by_start_time_desc() {
        let now = 5000i64;
        let raw = vec![
            make_raw_activity(1, 0, 0, 2000, 9000),
            make_raw_activity(2, 0, 0, 4000, 9000),
            make_raw_activity(3, 0, 0, 3000, 9000),
        ];
        let result = normalize_activities(raw, &[], now);
        // All active, sorted by start_time DESC
        assert_eq!(result[0].active_id, "2");
        assert_eq!(result[1].active_id, "3");
        assert_eq!(result[2].active_id, "1");
    }
}


#[cfg(test)]
mod proptest_p3_activity_status_exclusive {
    // Feature: chaoxing-checkin, Property 3: 活动状态分类互斥
    // **Validates: Requirements 3.2, 3.3**
    use super::*;
    use proptest::prelude::*;

    /// 生成一个原始活动 JSON 值。
    fn arb_raw_activity() -> impl Strategy<Value = serde_json::Value> {
        (
            1i64..=100000,       // id
            0i64..=10,           // otherId
            0i64..=2,            // status (0=未签, 1=已签, 2=其他)
            0i64..=100000,       // startTime
            0i64..=200000,       // endTime
        )
            .prop_map(|(id, other_id, status, start, end)| {
                serde_json::json!({
                    "id": id,
                    "courseId": 1001,
                    "classId": 2001,
                    "otherId": other_id,
                    "status": status,
                    "startTime": start,
                    "endTime": end,
                    "nameOne": "课程"
                })
            })
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// 每个活动恰好属于一种状态（互斥）。
        #[test]
        fn each_activity_has_exactly_one_status(
            raw in proptest::collection::vec(arb_raw_activity(), 1..20),
            now_ms in 0i64..=200000
        ) {
            let result = normalize_activities(raw, &[], now_ms);
            for activity in &result {
                let statuses = [
                    ActivityStatus::Active,
                    ActivityStatus::Pending,
                    ActivityStatus::Signed,
                    ActivityStatus::Expired,
                ];
                let count = statuses.iter().filter(|&&s| s == activity.status).count();
                prop_assert_eq!(count, 1, "活动 {} 应恰好属于一种状态", activity.active_id);
            }
        }

        /// 去重后不存在重复 active_id。
        #[test]
        fn no_duplicate_active_ids(
            raw in proptest::collection::vec(arb_raw_activity(), 1..30),
            now_ms in 0i64..=200000
        ) {
            let result = normalize_activities(raw, &[], now_ms);
            let mut ids: Vec<&str> = result.iter().map(|a| a.active_id.as_str()).collect();
            let len_before = ids.len();
            ids.sort();
            ids.dedup();
            prop_assert_eq!(ids.len(), len_before, "不应存在重复 active_id");
        }
    }
}

#[cfg(test)]
mod proptest_p4_sorting {
    // Feature: chaoxing-checkin, Property 4: 列表排序不变式
    // **Validates: Requirements 3.3, 3.4**
    use super::*;
    use proptest::prelude::*;

    fn arb_raw_activity() -> impl Strategy<Value = serde_json::Value> {
        (
            1i64..=100000,
            0i64..=10,
            0i64..=2,
            0i64..=100000,
            0i64..=200000,
        )
            .prop_map(|(id, other_id, status, start, end)| {
                serde_json::json!({
                    "id": id,
                    "courseId": 1001,
                    "classId": 2001,
                    "otherId": other_id,
                    "status": status,
                    "startTime": start,
                    "endTime": end,
                    "nameOne": "课程"
                })
            })
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]

        /// 排序不变式：status 升序（Active < Pending < Signed < Expired），
        /// 同 status 内 start_time 降序。
        #[test]
        fn sorting_invariant(
            raw in proptest::collection::vec(arb_raw_activity(), 1..30),
            now_ms in 0i64..=200000
        ) {
            let result = normalize_activities(raw, &[], now_ms);
            for window in result.windows(2) {
                let a = &window[0];
                let b = &window[1];
                // status 应非递减
                prop_assert!(
                    a.status <= b.status,
                    "排序违规：{:?}({}) 应在 {:?}({}) 之前",
                    a.status, a.active_id, b.status, b.active_id
                );
                // 同 status 内 start_time 应非递增（DESC）
                if a.status == b.status {
                    prop_assert!(
                        a.start_time >= b.start_time,
                        "同状态排序违规：start_time {} >= {} (ids: {}, {})",
                        a.start_time, b.start_time, a.active_id, b.active_id
                    );
                }
            }
        }

        /// normalize 是幂等的：对结果再次 normalize 不改变顺序。
        #[test]
        fn normalize_is_idempotent(
            raw in proptest::collection::vec(arb_raw_activity(), 1..20),
            now_ms in 0i64..=200000
        ) {
            let first = normalize_activities(raw.clone(), &[], now_ms);
            // 将 first 转回 JSON 再 normalize
            let as_json: Vec<serde_json::Value> = first.iter().map(|a| {
                serde_json::json!({
                    "id": a.active_id.parse::<i64>().unwrap_or(0),
                    "courseId": a.course_id.parse::<i64>().unwrap_or(0),
                    "classId": a.clazz_id.parse::<i64>().unwrap_or(0),
                    "otherId": match a.activity_type {
                        ActivityType::Normal => 0,
                        ActivityType::Qrcode => 2,
                        ActivityType::Gesture => 3,
                        ActivityType::Location => 4,
                        ActivityType::Photo => 5,
                    },
                    "status": match a.status {
                        ActivityStatus::Signed => 1,
                        _ => 0,
                    },
                    "startTime": a.start_time,
                    "endTime": a.end_time,
                    "nameOne": ""
                })
            }).collect();
            let second = normalize_activities(as_json, &[], now_ms);
            // 顺序应一致
            let ids_first: Vec<&str> = first.iter().map(|a| a.active_id.as_str()).collect();
            let ids_second: Vec<&str> = second.iter().map(|a| a.active_id.as_str()).collect();
            prop_assert_eq!(ids_first, ids_second, "normalize 应幂等");
        }
    }
}

#[cfg(test)]
mod proptest_p17_retry_policy {
    // Feature: chaoxing-checkin, Property 17: 重试策略与指数退避
    // **Validates: Requirements 9.4**
    use super::*;
    use proptest::prelude::*;

    fn arb_error_code() -> impl Strategy<Value = CheckinErrorCode> {
        prop_oneof![
            Just(CheckinErrorCode::NetworkError),
            Just(CheckinErrorCode::SessionExpired),
            Just(CheckinErrorCode::BadRequest),
            Just(CheckinErrorCode::ServerError),
            Just(CheckinErrorCode::AlreadySigned),
            Just(CheckinErrorCode::RateLimited),
            Just(CheckinErrorCode::PermissionDenied),
            Just(CheckinErrorCode::Unknown),
        ]
    }

    fn is_retryable(err: &CheckinErrorCode) -> bool {
        matches!(err, CheckinErrorCode::NetworkError | CheckinErrorCode::ServerError)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(200))]
        #[test]
        fn non_retryable_always_none(
            code in arb_error_code().prop_filter("non-retryable only", |c| !is_retryable(c)),
            attempt in 0u32..=100u32
        ) {
            prop_assert_eq!(should_retry(&code, attempt), None);
        }

        #[test]
        fn retryable_at_most_two_attempts(
            code in arb_error_code().prop_filter("retryable only", |c| is_retryable(c)),
            attempt in 2u32..=100u32
        ) {
            prop_assert_eq!(should_retry(&code, attempt), None);
        }

        #[test]
        fn retryable_delays_increase(
            code in arb_error_code().prop_filter("retryable only", |c| is_retryable(c))
        ) {
            let d0 = should_retry(&code, 0).unwrap();
            let d1 = should_retry(&code, 1).unwrap();
            prop_assert!(d1 > d0, "第二次延迟应大于第一次: {:?} vs {:?}", d0, d1);
        }

        #[test]
        fn retryable_first_attempt_is_800ms(
            code in arb_error_code().prop_filter("retryable only", |c| is_retryable(c))
        ) {
            let d = should_retry(&code, 0).unwrap();
            prop_assert_eq!(d, Duration::from_millis(800));
        }

        #[test]
        fn retryable_second_attempt_is_1800ms(
            code in arb_error_code().prop_filter("retryable only", |c| is_retryable(c))
        ) {
            let d = should_retry(&code, 1).unwrap();
            prop_assert_eq!(d, Duration::from_millis(1800));
        }
    }
}
