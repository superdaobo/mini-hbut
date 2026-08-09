//! 雨课堂（Yuketang）刷课域：章节树、叶节点信息与学习心跳上报。

use std::time::Duration;

use serde_json::{json, Value};

use crate::http_client::HbutClient;

use super::shared::{err_box, read_json_response, DynError};
use super::yuketang_session::has_yuketang_session;

/// 获取雨课堂课程章节树
pub async fn yuketang_get_course_chapters(
    client: &HbutClient,
    classroom_id: &str,
    sign: &str,
) -> Result<Value, DynError> {
    if !has_yuketang_session(client) {
        return Err(err_box("当前没有可用的雨课堂会话，请先扫码登录雨课堂"));
    }
    let resp = client
        .client
        .get("https://changjiang.yuketang.cn/mooc-api/v1/lms/learn/course/chapter")
        .query(&[
            ("cid", classroom_id),
            ("sign", sign),
            ("term", "latest"),
            ("uv_id", classroom_id),
            ("classroom_id", classroom_id),
        ])
        .header("classroom-id", classroom_id)
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "获取雨课堂章节失败").await?;
    let chapter_data = data.get("data").cloned().unwrap_or_else(|| json!({}));

    // 提取视频叶节点
    let mut video_leaves = Vec::new();
    if let Some(chapters) = chapter_data
        .get("course_chapter")
        .and_then(|v| v.as_array())
    {
        for chapter in chapters {
            let chapter_name = chapter
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if let Some(sections) = chapter.get("section_leaf_list").and_then(|v| v.as_array()) {
                for section in sections {
                    let leaf_type = section
                        .get("leaf_type")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(-1);
                    if leaf_type == 0 {
                        let leaf_id = section.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                        let leaf_name = section
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if leaf_id > 0 {
                            video_leaves.push(json!({
                                "id": leaf_id,
                                "name": leaf_name,
                                "chapter": chapter_name,
                                "leaf_type": 0,
                            }));
                        }
                    }
                    if let Some(sub_leaves) = section.get("leaf_list").and_then(|v| v.as_array()) {
                        for leaf in sub_leaves {
                            let lt = leaf.get("leaf_type").and_then(|v| v.as_i64()).unwrap_or(-1);
                            if lt == 0 {
                                let lid = leaf.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                                let lname = leaf
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                if lid > 0 {
                                    video_leaves.push(json!({
                                        "id": lid,
                                        "name": lname,
                                        "chapter": chapter_name,
                                        "leaf_type": 0,
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "success": true,
        "chapters": chapter_data,
        "video_leaves": video_leaves,
    }))
}

/// 获取雨课堂叶节点详情（含 ccid、时长）
pub async fn yuketang_get_leaf_info(
    client: &HbutClient,
    classroom_id: &str,
    leaf_id: &str,
) -> Result<Value, DynError> {
    if !has_yuketang_session(client) {
        return Err(err_box("当前没有可用的雨课堂会话，请先扫码登录雨课堂"));
    }
    let resp = client
        .client
        .get(&format!(
            "https://changjiang.yuketang.cn/mooc-api/v1/lms/learn/leaf_info/{}/{}/",
            classroom_id, leaf_id
        ))
        .query(&[("term", "latest")])
        .header("classroom-id", classroom_id)
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let data = read_json_response(resp, "获取叶节点信息失败").await?;
    let leaf_data = data.get("data").cloned().unwrap_or_else(|| json!({}));

    // 提取关键字段
    let content_info = leaf_data
        .get("content_info")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let media = content_info
        .get("media")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let ccid = media
        .get("ccid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let duration = media
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    Ok(json!({
        "success": true,
        "leaf_data": leaf_data,
        "ccid": ccid,
        "duration": duration,
    }))
}

/// 发送雨课堂心跳上报
pub async fn yuketang_send_heartbeat(
    client: &HbutClient,
    classroom_id: &str,
    events: &Value,
) -> Result<Value, DynError> {
    if !has_yuketang_session(client) {
        return Err(err_box("当前没有可用的雨课堂会话，请先扫码登录雨课堂"));
    }
    let body = json!({ "heart_data": events });
    let resp = client
        .client
        .post("https://changjiang.yuketang.cn/video-log/heartbeat/")
        .query(&[("classroom_id", classroom_id)])
        .header("classroom-id", classroom_id)
        .header("xtbz", "ykt")
        .header("x-client", "web")
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(15))
        .send()
        .await?;
    let status = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    let data: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({}));
    Ok(json!({
        "success": status == 200,
        "status_code": status,
        "data": data,
    }))
}
