//! 在线学习总览/同步服务：多平台概览聚合、立即同步、同步记录列表、
//! 缓存清理，以及学习通会话状态查询。

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::db::{self, OnlineLearningPlatformStateRecord};
use crate::http_client::HbutClient;

use super::chaoxing_courses::chaoxing_fetch_courses;
use super::chaoxing_session::{
    chaoxing_cookie_blob, ensure_chaoxing_session_ready, has_chaoxing_bridge_cookie,
    has_chaoxing_full_session,
};
use super::shared::{
    cache_key, clear_cache, clear_cache_prefix, err_box, extract_account_from_state,
    extract_display_name_from_state, extract_meta_json, now_sync_time, parse_cookie_value,
    read_cache, record_sync_run, resolve_student_id, save_cache, summarize_course_count,
    summarize_pending_count, DynError, CACHE_CHAOXING_COURSES, CACHE_CHAOXING_OUTLINE,
    CACHE_CHAOXING_PROGRESS, CACHE_OVERVIEW, CACHE_YUKETANG_COURSES, CACHE_YUKETANG_OUTLINE,
    CACHE_YUKETANG_PROGRESS, PLATFORM_CHAOXING, PLATFORM_YUKETANG,
};
use super::yuketang_courses::yuketang_fetch_courses;
use super::yuketang_session::has_yuketang_session;

pub async fn fetch_online_learning_overview(
    client: &HbutClient,
    student_id: Option<&str>,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let states =
        db::list_online_learning_platform_states(crate::DB_FILENAME, &sid).unwrap_or_default();
    let mut state_map: HashMap<String, OnlineLearningPlatformStateRecord> = HashMap::new();
    for item in states {
        state_map.insert(item.platform.clone(), item);
    }

    let chaoxing_state = state_map.get(PLATFORM_CHAOXING);
    let yuketang_state = state_map.get(PLATFORM_YUKETANG);
    let chaoxing_course_cache = read_cache(CACHE_CHAOXING_COURSES, &cache_key(&sid, "courses"));
    let yuketang_course_cache = read_cache(CACHE_YUKETANG_COURSES, &cache_key(&sid, "courses"));
    let recent_runs =
        db::list_online_learning_sync_runs(crate::DB_FILENAME, &sid, None, 10).unwrap_or_default();

    let chaoxing_full_ready = has_chaoxing_full_session(client);
    let chaoxing_bridge_ready = has_chaoxing_bridge_cookie(client);
    let chaoxing_connected = chaoxing_full_ready
        || chaoxing_state
            .map(|item| item.connected && !item.cookie_blob.trim().is_empty())
            .unwrap_or(false);
    let yuketang_connected = yuketang_state
        .map(|item| item.connected)
        .unwrap_or_else(|| has_yuketang_session(client));
    let sync_runs = recent_runs
        .into_iter()
        .map(|item| {
            json!({
                "id": item.id,
                "platform": item.platform,
                "status": item.status,
                "summary": item.summary,
                "started_at": item.started_at,
                "finished_at": item.finished_at,
                "detail": serde_json::from_str::<Value>(&item.detail_json).unwrap_or_else(|_| json!({}))
            })
        })
        .collect::<Vec<_>>();
    let latest_sync_time = sync_runs
        .iter()
        .find_map(|item| item.get("finished_at").and_then(|v| v.as_str()))
        .unwrap_or_default()
        .to_string();
    let payload = json!({
        "success": true,
        "last_sync_time": latest_sync_time,
        "running_count": 0,
        "cache_status": if chaoxing_course_cache.is_some() || yuketang_course_cache.is_some() { "缓存可用" } else { "未命中缓存" },
        "platforms": {
            PLATFORM_CHAOXING: {
                "platform": PLATFORM_CHAOXING,
                "label": "学习通",
                "connected": chaoxing_connected,
                "status": if chaoxing_connected { "已连接" } else if chaoxing_bridge_ready { "票据待补全" } else { "未连接" },
                "bridge_only": chaoxing_bridge_ready && !chaoxing_connected,
                "display_name": extract_display_name_from_state(chaoxing_state),
                "account_id": extract_account_from_state(chaoxing_state),
                "course_count": chaoxing_course_cache.as_ref().map(|(data, _)| summarize_course_count(data)).unwrap_or(0),
                "pending_count": chaoxing_course_cache.as_ref().map(|(data, _)| summarize_pending_count(data)).unwrap_or(0),
                "last_sync_time": chaoxing_state.map(|item| item.sync_time.clone()).unwrap_or_else(|| {
                    chaoxing_course_cache.as_ref().map(|(_, sync_time)| sync_time.clone()).unwrap_or_default()
                }),
                "cache_state": if chaoxing_course_cache.is_some() { "缓存数据" } else { "实时数据" },
                "offline": chaoxing_course_cache.is_some(),
                "message": if chaoxing_connected {
                    "已复用本机学习通会话"
                } else if chaoxing_bridge_ready {
                    "已获取教务票据，正在补全学习通会话"
                } else {
                    "请先在登录页完成学习通登录"
                },
                "meta": extract_meta_json(chaoxing_state),
            },
            PLATFORM_YUKETANG: {
                "platform": PLATFORM_YUKETANG,
                "label": "长江雨课堂",
                "connected": yuketang_connected,
                "status": if yuketang_connected { "已连接" } else { "未连接" },
                "display_name": extract_display_name_from_state(yuketang_state),
                "account_id": extract_account_from_state(yuketang_state),
                "course_count": yuketang_course_cache.as_ref().map(|(data, _)| summarize_course_count(data)).unwrap_or(0),
                "pending_count": yuketang_course_cache.as_ref().map(|(data, _)| summarize_pending_count(data)).unwrap_or(0),
                "last_sync_time": yuketang_state.map(|item| item.sync_time.clone()).unwrap_or_else(|| {
                    yuketang_course_cache.as_ref().map(|(_, sync_time)| sync_time.clone()).unwrap_or_default()
                }),
                "cache_state": if yuketang_course_cache.is_some() { "缓存数据" } else { "实时数据" },
                "offline": yuketang_course_cache.is_some(),
                "message": if yuketang_connected { "雨课堂会话可用" } else { "请在详情页扫码登录雨课堂" },
                "meta": extract_meta_json(yuketang_state),
            }
        },
        "sync_runs": sync_runs
    });

    save_cache(CACHE_OVERVIEW, &sid, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}

pub async fn online_learning_sync_now(
    client: &mut HbutClient,
    student_id: Option<&str>,
    platform: &str,
    force: bool,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let platform = platform.trim().to_lowercase();
    if platform.is_empty() || platform == "all" {
        let mut outputs = Vec::new();
        for key in [PLATFORM_CHAOXING, PLATFORM_YUKETANG] {
            let result = match key {
                PLATFORM_CHAOXING => chaoxing_fetch_courses(client, Some(&sid), force).await,
                PLATFORM_YUKETANG => yuketang_fetch_courses(client, Some(&sid), force).await,
                _ => unreachable!(),
            };
            match result {
                Ok(payload) => {
                    record_sync_run(&sid, key, "success", "同步完成", payload.clone());
                    outputs.push(json!({ "platform": key, "success": true, "payload": payload }));
                }
                Err(error) => {
                    record_sync_run(
                        &sid,
                        key,
                        "failed",
                        &format!("同步失败: {}", error),
                        json!({ "error": error.to_string() }),
                    );
                    outputs.push(
                        json!({ "platform": key, "success": false, "error": error.to_string() }),
                    );
                }
            }
        }
        return Ok(json!({
            "success": true,
            "platform": "all",
            "results": outputs,
        }));
    }

    let result = match platform.as_str() {
        PLATFORM_CHAOXING => chaoxing_fetch_courses(client, Some(&sid), force).await,
        PLATFORM_YUKETANG => yuketang_fetch_courses(client, Some(&sid), force).await,
        _ => Err(err_box("不支持的在线学习平台")),
    };

    match result {
        Ok(payload) => {
            record_sync_run(&sid, &platform, "success", "同步完成", payload.clone());
            Ok(payload)
        }
        Err(error) => {
            record_sync_run(
                &sid,
                &platform,
                "failed",
                &format!("同步失败: {}", error),
                json!({ "error": error.to_string() }),
            );
            Err(error)
        }
    }
}
pub fn list_online_learning_sync_runs(
    student_id: &str,
    platform: Option<&str>,
    limit: usize,
) -> Result<Value, DynError> {
    let runs = db::list_online_learning_sync_runs(crate::DB_FILENAME, student_id, platform, limit)
        .map_err(|e| err_box(e.to_string()))?;
    Ok(json!({
        "success": true,
        "runs": runs.into_iter().map(|item| {
            json!({
                "id": item.id,
                "platform": item.platform,
                "status": item.status,
                "summary": item.summary,
                "started_at": item.started_at,
                "finished_at": item.finished_at,
                "detail": serde_json::from_str::<Value>(&item.detail_json).unwrap_or_else(|_| json!({}))
            })
        }).collect::<Vec<_>>()
    }))
}

pub fn clear_online_learning_cache(
    student_id: &str,
    platform: Option<&str>,
) -> Result<Value, DynError> {
    let sid = student_id.trim();
    if sid.is_empty() {
        return Err(err_box("student_id 不能为空"));
    }
    let clear_platform = platform.map(|item| item.trim().to_lowercase());

    clear_cache(CACHE_OVERVIEW, sid);
    match clear_platform.as_deref() {
        Some(PLATFORM_CHAOXING) => {
            clear_cache(CACHE_CHAOXING_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_CHAOXING_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_CHAOXING_PROGRESS, &cache_key(sid, "progress:"));
        }
        Some(PLATFORM_YUKETANG) => {
            clear_cache(CACHE_YUKETANG_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_YUKETANG_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_YUKETANG_PROGRESS, &cache_key(sid, "progress:"));
        }
        _ => {
            clear_cache(CACHE_CHAOXING_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_CHAOXING_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_CHAOXING_PROGRESS, &cache_key(sid, "progress:"));
            clear_cache(CACHE_YUKETANG_COURSES, &cache_key(sid, "courses"));
            clear_cache_prefix(CACHE_YUKETANG_OUTLINE, &cache_key(sid, "outline:"));
            clear_cache_prefix(CACHE_YUKETANG_PROGRESS, &cache_key(sid, "progress:"));
        }
    }
    let _ = db::clear_online_learning_platform_state(
        crate::DB_FILENAME,
        sid,
        clear_platform.as_deref(),
    );
    let _ = db::clear_online_learning_sync_runs(crate::DB_FILENAME, sid, clear_platform.as_deref());

    Ok(json!({
        "success": true,
        "student_id": sid,
        "platform": clear_platform,
        "cleared_at": now_sync_time(),
    }))
}
pub async fn chaoxing_get_session_status(
    client: &mut HbutClient,
    student_id: Option<&str>,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, student_id)?;
    let connected = ensure_chaoxing_session_ready(client, &sid).await;
    let current_cookie = chaoxing_cookie_blob(client);
    let persisted =
        db::get_online_learning_platform_state(crate::DB_FILENAME, &sid, PLATFORM_CHAOXING)
            .unwrap_or(None);
    let bridge_only = has_chaoxing_bridge_cookie(client) && !connected;
    let uid = parse_cookie_value(&current_cookie, "UID")
        .or_else(|| parse_cookie_value(&current_cookie, "_uid"))
        .unwrap_or_else(|| extract_account_from_state(persisted.as_ref()));
    let display_name = client
        .user_info
        .as_ref()
        .map(|item| item.student_name.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| extract_display_name_from_state(persisted.as_ref()));
    let status = if connected {
        "已连接"
    } else if bridge_only {
        "票据待补全"
    } else {
        "未连接"
    };

    let payload = json!({
        "success": true,
        "platform": PLATFORM_CHAOXING,
        "connected": connected,
        "bridge_only": bridge_only,
        "status": status,
        "student_id": sid,
        "account_id": uid,
        "display_name": display_name,
        "cookie_ready": !current_cookie.trim().is_empty(),
        "offline": false,
        "message": if connected {
            "已复用本机学习通会话"
        } else if bridge_only {
            "已获取教务票据，但学习通票据补全失败，请重试"
        } else {
            "当前没有可用的学习通会话，请先在学习通登录页完成一次登录后自动同步"
        },
        "launch_url": "https://i.chaoxing.com/base",
        "sync_time": persisted.map(|item| item.sync_time).unwrap_or_default(),
    });
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}
