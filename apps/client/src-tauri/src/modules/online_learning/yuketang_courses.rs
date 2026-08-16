//! 雨课堂（Yuketang）课程域：课程列表抓取，以及课程大纲/进度的远程拉取与缓存。

use serde_json::{json, Value};

use crate::db;
use crate::http_client::HbutClient;

use super::shared::{
    cache_key, err_box, now_sync_time, parse_cookie_value, read_cache, read_json_response,
    resolve_student_id, save_cache, save_platform_state, DynError, CACHE_YUKETANG_COURSES,
    CACHE_YUKETANG_OUTLINE, CACHE_YUKETANG_PROGRESS, PLATFORM_YUKETANG,
};
use super::yuketang_session::{restore_yuketang_cookie_blob, yuketang_cookie_blob};

async fn fetch_yuketang_courses_remote(client: &HbutClient) -> Result<Value, DynError> {
    let resp = client
        .client
        .get("https://changjiang.yuketang.cn/v2/api/web/courses/list")
        .query(&[("identity", "2"), ("classroom_id", "0")])
        .header("Accept", "application/json, text/plain, */*")
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .send()
        .await?;
    let value = read_json_response(resp, "获取雨课堂课程列表失败").await?;
    let errcode = value.get("errcode").and_then(|v| v.as_i64()).unwrap_or(-1);
    if errcode != 0 {
        return Err(err_box(
            value
                .get("errmsg")
                .and_then(|v| v.as_str())
                .unwrap_or("获取雨课堂课程列表失败"),
        ));
    }
    let list = value
        .get("data")
        .and_then(|v| v.get("list"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let courses = list
        .into_iter()
        .map(|item| {
            let teacher = item
                .get("teacher")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            json!({
                "id": item.get("classroom_id").cloned().unwrap_or(Value::Null),
                "classroom_id": item.get("classroom_id").cloned().unwrap_or(Value::Null),
                "course_id": item.get("course").and_then(|v| v.get("id")).cloned().unwrap_or(Value::Null),
                "name": item.get("name").cloned().unwrap_or(Value::Null),
                "teacher": teacher,
                "sign": item.get("course").and_then(|v| v.get("university_id")).cloned().unwrap_or(Value::Null),
                "image_url": item.get("picture").cloned().unwrap_or(Value::Null),
                "course": item.get("course").cloned().unwrap_or(Value::Null)
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "success": true,
        "courses": courses,
        "pending_count": 0
    }))
}
pub async fn yuketang_fetch_courses(
    client: &HbutClient,
    student_id: Option<&str>,
    force: bool,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    let cache_id = cache_key(&sid, "courses");
    if !force {
        if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_COURSES, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    match fetch_yuketang_courses_remote(client).await {
        Ok(payload) => {
            let enriched = json!({
                "success": true,
                "courses": payload.get("courses").cloned().unwrap_or_else(|| json!([])),
                "pending_count": payload.get("pending_count").cloned().unwrap_or_else(|| json!(0)),
                "platform_status": {
                    "platform": PLATFORM_YUKETANG,
                    "connected": true,
                    "status": "已连接",
                    "offline": false,
                    "message": "雨课堂会话可用"
                }
            });
            save_cache(CACHE_YUKETANG_COURSES, &cache_id, &enriched);
            save_platform_state(
                &sid,
                PLATFORM_YUKETANG,
                true,
                parse_cookie_value(&yuketang_cookie_blob(client), "university_id")
                    .unwrap_or_default(),
                "".to_string(),
                yuketang_cookie_blob(client),
                json!({
                    "course_count": enriched.get("courses").and_then(|v| v.as_array()).map(|v| v.len()).unwrap_or(0)
                }),
            );
            Ok(crate::attach_sync_time(enriched, &now_sync_time(), false))
        }
        Err(error) => {
            if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_COURSES, &cache_id) {
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            // 401等认证错误时返回未连接状态而非抛错
            let err_msg = error.to_string();
            if err_msg.contains("401")
                || err_msg.contains("Unauthorized")
                || err_msg.contains("认证")
                || err_msg.contains("登录")
            {
                return Ok(json!({
                    "success": true,
                    "courses": [],
                    "pending_count": 0,
                    "platform_status": {
                        "platform": PLATFORM_YUKETANG,
                        "connected": false,
                        "status": "未连接",
                        "offline": false,
                        "message": "雨课堂会话已过期，请重新扫码登录"
                    }
                }));
            }
            Err(error)
        }
    }
}
pub async fn yuketang_fetch_course_outline(
    client: &HbutClient,
    req: &crate::YuketangCourseOutlineRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    let classroom_id = req.classroom_id.trim();
    if classroom_id.is_empty() {
        return Err(err_box("classroom_id 不能为空"));
    }
    let cache_id = cache_key(&sid, &format!("outline:{}", classroom_id));
    if !req.force.unwrap_or(false) {
        if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_OUTLINE, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }

    let sign = req.sign.as_deref().unwrap_or("").trim().to_string();
    let resp = client
        .client
        .get("https://changjiang.yuketang.cn/mooc-api/v1/lms/learn/course/chapter")
        .query(&[
            ("cid", classroom_id),
            ("sign", sign.as_str()),
            ("term", "latest"),
            ("uv_id", classroom_id),
            ("classroom_id", classroom_id),
        ])
        .header("classroom-id", classroom_id)
        .send()
        .await?;
    let value = read_json_response(resp, "获取雨课堂章节失败").await?;
    let data = value.get("data").cloned().unwrap_or_else(|| json!({}));
    let mut nodes = Vec::new();
    if let Some(chapters) = data.get("course_chapter").and_then(|v| v.as_array()) {
        for chapter in chapters {
            let chapter_name = chapter
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(section_list) = chapter.get("section_leaf_list").and_then(|v| v.as_array())
            {
                for section in section_list {
                    let section_name = section
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let mut children = Vec::new();
                    if section.get("leaf_type").and_then(|v| v.as_i64()) == Some(0) {
                        children.push(json!({
                            "id": section.get("id").cloned().unwrap_or(Value::Null),
                            "title": section_name,
                            "task_type": "video",
                            "leaf_type": 0,
                            "completed": false,
                            "children": []
                        }));
                    }
                    if let Some(leaf_list) = section.get("leaf_list").and_then(|v| v.as_array()) {
                        for leaf in leaf_list {
                            children.push(json!({
                                "id": leaf.get("id").cloned().unwrap_or(Value::Null),
                                "title": leaf.get("name").cloned().unwrap_or(Value::Null),
                                "task_type": if leaf.get("leaf_type").and_then(|v| v.as_i64()) == Some(0) { "video" } else { "leaf" },
                                "leaf_type": leaf.get("leaf_type").cloned().unwrap_or(Value::Null),
                                "completed": false,
                                "children": []
                            }));
                        }
                    }
                    nodes.push(json!({
                        "id": section.get("id").cloned().unwrap_or(Value::Null),
                        "title": if section_name.is_empty() { chapter_name.clone() } else { format!("{} / {}", chapter_name, section_name) },
                        "task_type": "section",
                        "completed": false,
                        "children": children
                    }));
                }
            }
        }
    }
    let total_count = nodes.len();
    let payload = json!({
        "success": true,
        "classroom_id": classroom_id,
        "sign": sign,
        "total_count": total_count,
        "completed_count": 0,
        "pending_count": total_count,
        "nodes": nodes,
        "sections": nodes,
        "raw": data,
    });
    save_cache(CACHE_YUKETANG_OUTLINE, &cache_id, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}
pub async fn yuketang_fetch_course_progress(
    client: &HbutClient,
    req: &crate::YuketangCourseProgressRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    if let Ok(Some(state)) =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_YUKETANG)
    {
        restore_yuketang_cookie_blob(client, &state.cookie_blob);
    }
    let classroom_id = req.classroom_id.trim();
    if classroom_id.is_empty() {
        return Err(err_box("classroom_id 不能为空"));
    }
    let cache_id = cache_key(&sid, &format!("progress:{}", classroom_id));
    if !req.force.unwrap_or(false) {
        if let Some((cached, sync_time)) = read_cache(CACHE_YUKETANG_PROGRESS, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    let classroom_resp = client
        .client
        .get(format!(
            "https://changjiang.yuketang.cn/v2/api/web/classrooms/{}",
            classroom_id
        ))
        .query(&[("role", "5")])
        .header("classroom-id", classroom_id)
        .send()
        .await?;
    let classroom_value = read_json_response(classroom_resp, "获取雨课堂课堂详情失败").await?;
    let classroom_data = classroom_value
        .get("data")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let sku_id = req
        .sku_id
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .or_else(|| {
            classroom_data
                .get("course_sku_id")
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string())
        })
        .or_else(|| {
            classroom_data
                .get("sku_id")
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string())
        })
        .unwrap_or_default();

    let detail = if sku_id.is_empty() {
        json!({})
    } else {
        let detail_resp = client
            .client
            .get(format!(
                "https://changjiang.yuketang.cn/c27/online_courseware/schedule/score_detail/single/{}/0/",
                sku_id
            ))
            .header("classroom-id", classroom_id)
            .send()
            .await?;
        let detail_value = read_json_response(detail_resp, "获取雨课堂课程进度失败").await?;
        detail_value
            .get("data")
            .cloned()
            .unwrap_or_else(|| json!({}))
    };

    let payload = json!({
        "success": true,
        "classroom_id": classroom_id,
        "sku_id": sku_id,
        "summary": if detail.is_null() || detail == json!({}) { "官方进度暂缺" } else { "官方进度" },
        "progress_text": if detail.is_null() || detail == json!({}) { "官方进度暂缺" } else { "官方进度已同步" },
        "classroom_detail": classroom_data,
        "progress_detail": detail,
    });
    save_cache(CACHE_YUKETANG_PROGRESS, &cache_id, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}
