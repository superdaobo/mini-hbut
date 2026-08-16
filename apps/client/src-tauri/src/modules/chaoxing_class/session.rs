//! 学习通会话/课程/章节探测：SSO 会话确保、课程列表在班校验、资料页可访问性探测。

use serde_json::Value;

use crate::http_client::HbutClient;

use super::parse::{
    looks_like_login_html, looks_like_login_url, looks_like_not_joined_html, now_ms, DynError,
};

/// 从 backclazzdata 解析 (course_id, clazz_id) 列表
fn parse_backclazz_pairs(payload: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Some(channel_list) = payload.get("channelList").and_then(|c| c.as_array()) else {
        return out;
    };
    for item in channel_list {
        let Some(content) = item.get("content") else {
            continue;
        };
        let course = content.get("course").unwrap_or(content);
        let course_id = course
            .get("data")
            .and_then(|d| d.get(0))
            .and_then(|d| d.get("id"))
            .map(|v| match v {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.trim().to_string(),
                _ => String::new(),
            })
            .filter(|s| !s.is_empty())
            .or_else(|| {
                course.get("courseId").map(|v| match v {
                    Value::Number(n) => n.to_string(),
                    Value::String(s) => s.trim().to_string(),
                    _ => String::new(),
                })
            })
            .unwrap_or_default();
        let clazz_id = content
            .get("id")
            .map(|v| match v {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.trim().to_string(),
                _ => String::new(),
            })
            .unwrap_or_default();
        if !course_id.is_empty() && !clazz_id.is_empty() {
            out.push((course_id, clazz_id));
        }
    }
    out
}

fn json_result_ok(payload: &Value) -> bool {
    match payload.get("result") {
        Some(Value::Bool(true)) => true,
        Some(Value::Number(n)) => n.as_i64() == Some(1) || n.as_u64() == Some(1),
        Some(Value::String(s)) => {
            let t = s.trim();
            t == "1" || t.eq_ignore_ascii_case("true") || t == "success"
        }
        _ => match payload.get("status") {
            Some(Value::Bool(true)) => true,
            Some(Value::Number(n)) => n.as_i64() == Some(1),
            _ => false,
        },
    }
}

/// 查询学生是否仍在指定课程/班级（权威：mycourse/backclazzdata）
/// - Some(true) 在班
/// - Some(false) 明确不在班（含已退课）
/// - None 接口失败/无法判断
pub(super) async fn is_student_enrolled_in_clazz(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
) -> Option<bool> {
    let course_id = course_id.trim();
    let clazz_id = clazz_id.trim();
    if course_id.is_empty() || clazz_id.is_empty() {
        return None;
    }
    let url = "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1";
    let resp = client
        .client
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", "https://i.chaoxing.com/base")
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .ok()?;
    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return None;
    }
    let text = resp.text().await.ok()?;
    if looks_like_login_html(&text) {
        return None;
    }
    let payload: Value = serde_json::from_str(&text).ok()?;
    if !json_result_ok(&payload) {
        // 某些账号 result 字段异常但仍有 channelList
        if payload
            .get("channelList")
            .and_then(|c| c.as_array())
            .is_none()
        {
            return None;
        }
    }
    let pairs = parse_backclazz_pairs(&payload);
    // 能成功解析接口：列表中须同时命中 course_id + clazz_id
    let enrolled = pairs.iter().any(|(c, z)| c == course_id && z == clazz_id);
    // 仅有 course 无 clazz 精确匹配时：同 course 也视为仍在课（退课通常两者都消失）
    let enrolled = enrolled || pairs.iter().any(|(c, _)| c == course_id);
    Some(enrolled)
}

/// 确保门户 SSO → 学习通会话可用（走统一会话层，可静默续期，禁止 force 全量课程）。
/// `portal_password`：前端 Web 加密备份密码（#367 移动端密钥环空）
pub async fn ensure_sso_session(
    client: &mut HbutClient,
    student_id: Option<&str>,
    portal_password: Option<&str>,
) -> Result<Value, DynError> {
    use crate::modules::chaoxing_sso::{ensure_chaoxing_sso, EnsureSsoOptions};

    match ensure_chaoxing_sso(
        client,
        student_id,
        EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: portal_password
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
        },
    )
    .await
    {
        Ok(v) => Ok(v),
        Err(e) => Err(e),
    }
}

/// 探测学生/教师是否可访问该班资料（教师用 ut=t，学生用 ut=s + 课程列表）
pub(super) async fn probe_class_accessible(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
) -> bool {
    // 学生：在「我的课程」列表中
    if let Some(true) = is_student_enrolled_in_clazz(client, course_id, clazz_id).await {
        return true;
    }
    // 教师或已入班：资料页可访问（优先学生视角，再教师视角）
    if probe_datalist_accessible(client, course_id, clazz_id, "s").await {
        return true;
    }
    probe_datalist_accessible(client, course_id, clazz_id, "t").await
}

async fn probe_datalist_accessible(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    ut: &str,
) -> bool {
    let t = now_ms();
    let list_url = format!(
        "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&clazzid={}&cpi=0&ut={}&t={}",
        urlencoding::encode(course_id),
        urlencoding::encode(clazz_id),
        urlencoding::encode(ut),
        t
    );
    let Ok(resp) = client
        .client
        .get(&list_url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .send()
        .await
    else {
        return false;
    };
    let final_url = resp.url().to_string();
    if looks_like_login_url(&final_url) {
        return false;
    }
    let Ok(html) = resp.text().await else {
        return false;
    };
    if looks_like_login_html(&html) {
        return false;
    }
    if looks_like_not_joined_html(&html) {
        return false;
    }
    // 真实资料行 / 教师课件入口 / 资料区结构
    html.contains("dataBody_td")
        || html.contains("downloadData")
        || html.contains("objectid=")
        || html.contains("教师课件")
        || html.contains("dataBody")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_backclazz_pairs_matches_course() {
        let payload = json!({
            "result": 1,
            "channelList": [{
                "content": {
                    "id": 148246853,
                    "teacherfactor": "周金阳",
                    "course": {
                        "data": [{ "id": 264356359, "name": "库来西库" }]
                    }
                }
            }]
        });
        let pairs = parse_backclazz_pairs(&payload);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, "264356359");
        assert_eq!(pairs[0].1, "148246853");
    }
}
