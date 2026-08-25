//! 本机只读学业数据端点族（#698）：
//! - `GET /local/profile` —— 学号 / 姓名 / 专业等基本档案
//! - `GET /local/grades` —— 全部成绩单（按学期分组）
//! - `GET /local/timetable` —— 课表
//!
//! 门禁：三端点共用 [`ensure_local_data_auth`]（`Authorization: LocalToken <hex>`，
//! 令牌来自 `%APPDATA%/mini-hbut/local-agent-token`，见 `http_server::local_token`）。
//!
//! 数据来源（严格只读，全部复用既有内部函数，不触发网络、不写缓存）：
//! - profile：内存登录快照 `HbutClient.user_info`
//! - grades ：SQLite `grades_cache` + 教师缓存合并
//!   （`grade::service::merge_teacher_cache_into_payload`）
//! - timetable：SQLite `schedule_cache`
//!
//! 错误契约（机器可解析）：401 `{"error":"LOCAL_TOKEN_INVALID"}` /
//! 401 `{"error":"NOT_LOGGED_IN"}` / 404 `{"error":"NO_LOCAL_DATA"}`。

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use reqwest::header::HeaderMap;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

use crate::http_server::auth::{ensure_local_data_auth, not_logged_in_error};
use crate::http_server::response::{ok, ApiResponse};
use crate::http_server::state::HttpState;

// ────────────────────────────────────────────────────────────
/// 404 + `{"error":"NO_LOCAL_DATA"}`：已登录但本地尚无该数据缓存。
fn no_local_data_error() -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "error": "NO_LOCAL_DATA" })),
    )
}

/// 当前登录学号快照；未登录学校账号返回 None。
async fn current_student_id(state: &HttpState) -> Option<String> {
    let client = state.client.read().await;
    client
        .user_info
        .as_ref()
        .map(|user| user.student_id.clone())
}

// ────────────────────────────────────────────────────────────
/// 纯读 SQLite 缓存表（不写任何状态）；错误统一降级为字符串消息。
fn read_local_cache(
    db_path: &Path,
    table: &str,
    uid: &str,
) -> Result<Option<(Value, String)>, String> {
    crate::db::get_cache(db_path, table, uid).map_err(|e| e.to_string())
}

/// 将成绩记录数组按学期（term 字段）分组为升序的
/// `[{ term, courses }]` 结构（无 term 的记录归入空字符串组）。
fn group_grades_by_term(records: &[Value]) -> Vec<Value> {
    let mut grouped: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    for record in records {
        let term = record
            .get("term")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        grouped.entry(term).or_default().push(record);
    }
    grouped
        .into_iter()
        .map(|(term, courses)| {
            json!({
                "term": term,
                "courses": courses.into_iter().cloned().collect::<Vec<_>>(),
            })
        })
        .collect()
}

// ────────────────────────────────────────────────────────────
/// GET /local/profile：学号 / 姓名 / 学院 / 专业 / 班级 / 年级。
///
/// 数据源为登录后的内存档案快照（`user_info`），纯读不落盘。
async fn profile(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    ensure_local_data_auth(&headers, &state)?;
    let client = state.client.read().await;
    let Some(user) = client.user_info.as_ref() else {
        return Err(not_logged_in_error());
    };
    Ok(ok(json!({
        "student_id": user.student_id,
        "name": user.student_name,
        "college": user.college,
        "major": user.major,
        "class_name": user.class_name,
        "grade": user.grade,
    })))
}

// ────────────────────────────────────────────────────────────
/// GET /local/grades：本地成绩缓存整表 + 任课教师合并，按学期分组返回。
async fn grades(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    ensure_local_data_auth(&headers, &state)?;
    let Some(uid) = current_student_id(&state).await else {
        return Err(not_logged_in_error());
    };

    let Some((payload, sync_time)) =
        read_local_cache(Path::new(crate::DB_FILENAME), "grades_cache", &uid)
            .map_err(no_local_data_error_for_db)?
    else {
        return Err(no_local_data_error());
    };

    // 复用共享用例的只读合并：将本地教师缓存并入记录（不写库），
    // 与 Tauri get_grades_local 双通道 payload 一致。
    let payload = crate::grade::service::merge_teacher_cache_into_payload(
        payload,
        &uid,
        &crate::grade::service::SqliteGradeCache,
    );
    let records = payload.get("data").and_then(Value::as_array).cloned();
    let records = records.unwrap_or_default();
    let total_courses = records.len();
    let offline = payload
        .get("offline")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    Ok(ok(json!({
        "success": true,
        "student_id": uid,
        "sync_time": sync_time,
        "offline": offline,
        "total_courses": total_courses,
        "terms": group_grades_by_term(&records),
    })))
}

/// 缓存读取失败（如数据库损坏）与「无缓存」区分开：前者透传 500。
fn no_local_data_error_for_db(message: String) -> (StatusCode, Json<Value>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": "DB_READ_FAILED", "message": message })),
    )
}

// ────────────────────────────────────────────────────────────
/// GET /local/timetable：本地课表缓存透传（含 meta.semester / offline 等），
/// 仅补充 student_id 字段。
async fn timetable(
    State(state): State<HttpState>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<Value>>, (StatusCode, Json<Value>)> {
    ensure_local_data_auth(&headers, &state)?;
    let Some(uid) = current_student_id(&state).await else {
        return Err(not_logged_in_error());
    };

    let Some((mut payload, _)) =
        read_local_cache(Path::new(crate::DB_FILENAME), "schedule_cache", &uid)
            .map_err(no_local_data_error_for_db)?
    else {
        return Err(no_local_data_error());
    };
    if let Some(object) = payload.as_object_mut() {
        object.insert("student_id".to_string(), json!(uid));
    }
    Ok(ok(payload))
}

// GENERATED DOMAIN ROUTERS — 路由协议由原始 method+path 清单生成。

pub(crate) fn router() -> Router<HttpState> {
    Router::new()
        .route("/local/profile", get(profile))
        .route("/local/grades", get(grades))
        .route("/local/timetable", get(timetable))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http_server::auth::{
        bridge_route_policy, check_local_agent_token, extract_local_agent_token,
        local_token_invalid_error, not_logged_in_error, BridgeRoutePolicy, LocalTokenDecision,
    };
    use reqwest::header::{HeaderMap, HeaderValue};

    /// 构造隔离临时 DB（不受 HBUT_DB_PATH 污染，先例见 application/academic.rs 测试）。
    fn temp_db(tag: &str) -> std::path::PathBuf {
        std::env::remove_var("HBUT_DB_PATH");
        let dir = std::env::temp_dir().join(format!(
            "hbut_local_data_test_{tag}_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let db_path = dir.join("test.db");
        let _ = std::fs::remove_file(&db_path);
        crate::db::init_db(&db_path).expect("测试数据库初始化失败");
        db_path
    }

    fn auth_header(value: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_str(value).unwrap());
        headers
    }

    // ── 门禁：令牌提取 ────────────────────────────────────────

    #[test]
    fn extract_accepts_localtoken_scheme_case_insensitive() {
        assert_eq!(
            extract_local_agent_token(&auth_header("LocalToken abc123")),
            Some("abc123".to_string())
        );
        assert_eq!(
            extract_local_agent_token(&auth_header("localtoken abc123")),
            Some("abc123".to_string())
        );
        assert_eq!(
            extract_local_agent_token(&auth_header("LOCALTOKEN  abc123  ")),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn extract_rejects_missing_empty_or_other_schemes() {
        assert_eq!(extract_local_agent_token(&HeaderMap::new()), None);
        assert_eq!(extract_local_agent_token(&auth_header("LocalToken")), None);
        assert_eq!(
            extract_local_agent_token(&auth_header("LocalToken   ")),
            None
        );
        assert_eq!(
            extract_local_agent_token(&auth_header("Bearer abc123")),
            None,
            "Bearer 是 Bridge 会话令牌体系，不得混入本机令牌门禁"
        );
    }

    // ── 门禁：正反用例 ────────────────────────────────────────

    #[test]
    fn token_check_passes_only_on_exact_match() {
        let expected = Some("a".repeat(64));
        assert_eq!(
            check_local_agent_token(Some(&"a".repeat(64)), expected.as_deref()),
            LocalTokenDecision::Valid
        );
        // 错误令牌
        assert_eq!(
            check_local_agent_token(Some(&"b".repeat(64)), expected.as_deref()),
            LocalTokenDecision::Invalid
        );
        // 缺少令牌头
        assert_eq!(
            check_local_agent_token(None, expected.as_deref()),
            LocalTokenDecision::Invalid
        );
        // 服务端未加载令牌 → fail closed
        assert_eq!(
            check_local_agent_token(Some(&"a".repeat(64)), None),
            LocalTokenDecision::Invalid
        );
        assert_eq!(
            check_local_agent_token(None, None),
            LocalTokenDecision::Invalid
        );
    }

    #[test]
    fn error_contract_shapes_are_stable() {
        let (status, body) = local_token_invalid_error();
        assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);
        assert_eq!(body.0["error"], "LOCAL_TOKEN_INVALID");

        let (status, body) = not_logged_in_error();
        assert_eq!(status, axum::http::StatusCode::UNAUTHORIZED);
        assert_eq!(body.0["error"], "NOT_LOGGED_IN");

        let (status, body) = no_local_data_error();
        assert_eq!(status, axum::http::StatusCode::NOT_FOUND);
        assert_eq!(body.0["error"], "NO_LOCAL_DATA");
    }

    // ── 路由策略 ─────────────────────────────────────────────

    #[test]
    fn local_routes_use_localdata_policy_and_stay_get_only() {
        for path in ["/local/profile", "/local/grades", "/local/timetable"] {
            assert_eq!(bridge_route_policy(path), BridgeRoutePolicy::LocalData);
        }
        // 非 /local/ 前缀不受影响
        assert_ne!(
            bridge_route_policy("/localhost-demo"),
            BridgeRoutePolicy::LocalData
        );
        assert_eq!(
            bridge_route_policy("/localhost-demo"),
            BridgeRoutePolicy::Protected
        );
    }

    // ── 取数逻辑：学期分组 ────────────────────────────────────

    #[test]
    fn grades_are_grouped_by_term_in_ascending_order() {
        let records = vec![
            json!({"term": "2024-2025-1", "course_name": "B课程"}),
            json!({"term": "2023-2024-2", "course_name": "A课程"}),
            json!({"term": "2024-2025-1", "course_name": "C课程"}),
            json!({"course_name": "无学期"}),
        ];
        let terms = group_grades_by_term(&records);
        assert_eq!(terms.len(), 3);
        assert_eq!(terms[0]["term"], "");
        assert_eq!(terms[0]["courses"].as_array().unwrap().len(), 1);
        assert_eq!(terms[1]["term"], "2023-2024-2");
        assert_eq!(terms[2]["term"], "2024-2025-1");
        assert_eq!(terms[2]["courses"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn grouping_empty_input_yields_empty_terms() {
        assert!(group_grades_by_term(&[]).is_empty());
    }

    // ── 只读性冒烟：读前后缓存内容与 sync_time 完全不变 ────────

    #[tokio::test]
    async fn cache_reads_are_read_only_and_return_cached_payload() {
        let db_path = temp_db("readonly");

        // 预置成绩缓存（两个学期）与课表缓存
        let grades_payload = json!({
            "success": true,
            "data": [
                {"term": "2024-2025-1", "course_name": "高等数学", "kcbh": "K001"},
                {"term": "2023-2024-2", "course_name": "大学英语", "kcbh": null}
            ],
            "sync_time": "2025-01-01T00:00:00+08:00",
            "offline": false
        });
        crate::db::save_cache(&db_path, "grades_cache", "2510231001", &grades_payload)
            .expect("预置成绩缓存失败");
        let schedule_payload = json!({
            "success": true,
            "data": [{"name": "高等数学", "weekday": 1}],
            "meta": {"semester": "2024-2025-1"},
            "offline": false
        });
        crate::db::save_cache(&db_path, "schedule_cache", "2510231001", &schedule_payload)
            .expect("预置课表缓存失败");

        // 记录读取前的原始行内容
        let before_grades = crate::db::get_cache(&db_path, "grades_cache", "2510231001")
            .unwrap()
            .unwrap();

        // 读成绩：命中并携带 DB 层 sync_time / 原 offline 元数据
        // （save_cache 写入时自行生成 sync_time 列，故只校验非空与一致性）
        let (payload, sync_time) = read_local_cache(&db_path, "grades_cache", "2510231001")
            .unwrap()
            .expect("成绩缓存应存在");
        assert_eq!((payload.clone(), sync_time.clone()), before_grades);
        assert!(!sync_time.is_empty());
        assert_eq!(payload["offline"], false);

        // 读课表：命中
        let (_, schedule_sync_time) = read_local_cache(&db_path, "schedule_cache", "2510231001")
            .unwrap()
            .expect("课表缓存应存在");
        assert!(!schedule_sync_time.is_empty());

        // 未缓存的 uid → None（端点据此回 NO_LOCAL_DATA）
        assert!(read_local_cache(&db_path, "grades_cache", "nobody")
            .unwrap()
            .is_none());

        // 只读性断言：多次读取后缓存内容与 sync_time 与读取前逐字节一致
        let after_grades = crate::db::get_cache(&db_path, "grades_cache", "2510231001")
            .unwrap()
            .unwrap();
        assert_eq!(after_grades, before_grades, "读取路径不得改动缓存行");

        // 分组输出与缓存 data 一致
        let records = payload["data"].as_array().unwrap().clone();
        let terms = group_grades_by_term(&records);
        assert_eq!(terms.len(), 2);
        assert_eq!(terms[0]["term"], "2023-2024-2");
        assert_eq!(terms[1]["term"], "2024-2025-1");

        let dir = db_path.parent().unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
}
