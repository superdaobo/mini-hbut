//! 学习通离线降级缓存（epic #1145 E5 / issue #1150）。
//!
//! 严格套用 `application/academic.rs` 的 offline 语义：
//! - 网络成功 → `save_cache` + `attach_sync_time(offline=false)`；缓存写失败仅告警，
//!   不拖垮成功的网络结果；
//! - 网络失败 → 缓存命中则返回 `attach_sync_time(offline=true)` 的旧快照；
//!   未命中则返回原错误（断网且无缓存 → 明确失败，不假成功）。
//!
//! 数据域与缓存表映射（表主键为 student_id，见 migrations.rs）：
//! - 班级域（班级预览，单学生多逻辑 key：邀请码）→ `chaoxing_class_cache`，JSON 信封
//! - 资料域（资料目录，单学生多逻辑 key：课程:班级:类型:父目录）→ `chaoxing_resource_cache`，JSON 信封
//! - 课程域（我的课程/班级列表 backclazzdata，单学生单条）→ `chaoxing_course_cache`，直存
//!
//! 信封格式：`{ "entries": { "<逻辑key>": { "value": 快照, "at": RFC3339 } }, "updated_at": ... }`，
//! 单学生同域上限 50 条，超出按 `at` 升序淘汰最旧。

use std::collections::BTreeMap;

use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db;

/// 学习通班级域：班级预览（key = 邀请码）
pub(crate) const TABLE_CLASS: &str = "chaoxing_class_cache";
/// 学习通课程域：我的课程/班级列表（backclazzdata）
pub(crate) const TABLE_COURSE: &str = "chaoxing_course_cache";
/// 学习通资料域：资料目录
pub(crate) const TABLE_RESOURCE: &str = "chaoxing_resource_cache";

/// 单学生同一数据域的逻辑 key 上限，超出淘汰最旧
const MAX_ENTRIES: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct EnvelopeEntry {
    /// 成功响应快照（当时的完整网络结果）
    value: Value,
    /// 快照写入时间（RFC3339，同机器下字典序 = 时间序，供淘汰）
    at: String,
}

/// 读取某学生在某表下的信封 entries；未命中/解析失败返回空表
fn load_entries<P: AsRef<std::path::Path>>(
    db_path: P,
    table: &str,
    student_id: &str,
) -> BTreeMap<String, EnvelopeEntry> {
    let pair = match db::get_cache(db_path, table, student_id) {
        Ok(pair) => pair,
        Err(_) => return BTreeMap::new(),
    };
    let Some((data, _)) = pair else {
        return BTreeMap::new();
    };
    let Some(entries) = data.get("entries") else {
        return BTreeMap::new();
    };
    serde_json::from_value(entries.clone()).unwrap_or_default()
}

/// 信封写入：upsert 单条逻辑 key + 超限时淘汰最旧；写失败仅告警不影响主流程
fn upsert_entry<P: AsRef<std::path::Path>>(
    db_path: P,
    table: &str,
    student_id: &str,
    key: &str,
    value: Value,
) {
    let now = Local::now().to_rfc3339();
    let mut entries = load_entries(&db_path, table, student_id);
    entries.insert(key.to_string(), EnvelopeEntry { value, at: now.clone() });
    // 上限 50 条：按 (at, key) 升序淘汰最旧，tie 时按 key 字典序保证确定性
    if entries.len() > MAX_ENTRIES {
        let excess = entries.len() - MAX_ENTRIES;
        let mut order: Vec<(String, String)> =
            entries.iter().map(|(k, e)| (e.at.clone(), k.clone())).collect();
        order.sort();
        for (i, (_, k)) in order.iter().enumerate() {
            if i >= excess {
                break;
            }
            entries.remove(k);
        }
    }
    let payload = json!({
        "entries": entries,
        "updated_at": now,
    });
    if let Err(e) = db::save_cache(db_path, table, student_id, &payload) {
        println!(
            "[chaoxing][offline-cache] 信封写入失败 table={} student={} err={}",
            table, student_id, e
        );
    }
}

/// 读取某学生 + 逻辑 key 的快照：信封域取 `entries[key].value`，直存域取整条
/// 返回 (快照, 行级 sync_time)；未命中返回 None
pub(crate) fn read_entry<P: AsRef<std::path::Path>>(
    db_path: P,
    table: &str,
    student_id: &str,
    entry_key: Option<&str>,
) -> Option<(Value, String)> {
    let pair = db::get_cache(db_path, table, student_id).ok().flatten()?;
    let (data, sync_time) = pair;
    let value = match entry_key {
        Some(key) => data.get("entries")?.get(key)?.get("value")?.clone(),
        None => data,
    };
    Some((value, sync_time))
}

/// 三态离线降级（严格套用 academic.rs 语义）：
/// - `Ok(payload)`：写缓存（有 entry_key 走信封，无则直存），附加 `offline=false` + `sync_time`；
///   缓存写失败不影响成功返回
/// - `Err(error)`：缓存命中 → 返回旧快照 + `offline=true`；未命中 → 原错误
/// - `student_id` 为空（未登录/无学号）：无缓存语义，仅附加时间戳或透传错误
pub(crate) fn resolve_with_cache<P: AsRef<std::path::Path>>(
    db_path: P,
    table: &str,
    student_id: Option<&str>,
    entry_key: Option<&str>,
    payload: Result<Value, String>,
) -> Result<Value, String> {
    let sid = match student_id.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => s.to_string(),
        None => {
            // 无学号：不落缓存（表主键是 student_id），直接透传网络结果
            let now = Local::now().to_rfc3339();
            return match payload {
                Ok(v) => Ok(crate::attach_sync_time(v, &now, false)),
                Err(e) => Err(e),
            };
        }
    };
    match payload {
        Ok(value) => {
            if let Some(key) = entry_key {
                upsert_entry(db_path, table, &sid, key, value.clone());
            } else if let Err(e) = db::save_cache(db_path, table, &sid, &value) {
                println!(
                    "[chaoxing][offline-cache] 直存写入失败 table={} student={} err={}",
                    table, sid, e
                );
            }
            let now = Local::now().to_rfc3339();
            Ok(crate::attach_sync_time(value, &now, false))
        }
        Err(error) => match read_entry(db_path, table, &sid, entry_key) {
            Some((cached, sync_time)) => Ok(crate::attach_sync_time(cached, &sync_time, true)),
            None => Err(error),
        },
    }
}

/// 资料目录逻辑 key：`course:clazz:kind:parent`
/// 教师课件（folder_kind=tch-courseware）与普通目录（空 kind）分开缓存
pub(crate) fn resource_dir_key(
    course_id: &str,
    clazz_id: &str,
    folder_kind: &str,
    parent_data_id: &str,
) -> String {
    format!(
        "{}:{}:{}:{}",
        course_id.trim(),
        clazz_id.trim(),
        folder_kind.trim().to_ascii_lowercase(),
        parent_data_id.trim()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("dsh_cx_offline_{}_{}.db", label, std::process::id()));
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(dir.join(format!("dsh_cx_offline_{}_{}.db-wal", label, std::process::id())));
        let _ = std::fs::remove_file(dir.join(format!("dsh_cx_offline_{}_{}.db-shm", label, std::process::id())));
        path
    }

    #[test]
    fn resource_dir_key_distinguishes_domains() {
        assert_eq!(resource_dir_key("12", "34", "", ""), "12:34::");
        assert_eq!(resource_dir_key("12", "34", "tch-courseware", "9"), "12:34:tch-courseware:9");
        // 去空白 + 大小写归一
        assert_eq!(resource_dir_key(" 12 ", " 34 ", "TCH-COURSEWARE", " 9 "), "12:34:tch-courseware:9");
    }

    #[test]
    fn envelope_roundtrip_and_eviction_at_50() {
        let path = temp_db("envelope");
        crate::db::migrations::init_db(&path).expect("init db");
        let sid = "2510231001";
        // 连续写入 51 个逻辑 key → 只保留最近 50 条，最旧被淘汰
        for i in 0..=50 {
            upsert_entry(&path, TABLE_RESOURCE, sid, &format!("k{i:02}"), json!({ "i": i }));
        }
        let entries = load_entries(&path, TABLE_RESOURCE, sid);
        assert_eq!(entries.len(), MAX_ENTRIES);
        assert!(!entries.contains_key("k00"), "最旧 k00 应被淘汰");
        assert!(entries.contains_key("k01"));
        assert_eq!(entries.get("k50").map(|e| &e.value), Some(&json!({ "i": 50 })));
        // read_entry 命中 / 未命中
        let (v, _t) = read_entry(&path, TABLE_RESOURCE, sid, Some("k50")).expect("k50 命中");
        assert_eq!(v.get("i").and_then(|x| x.as_u64()), Some(50));
        assert!(read_entry(&path, TABLE_RESOURCE, sid, Some("k00")).is_none(), "k00 已淘汰应未命中");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn resolve_with_cache_three_states_and_direct_mode() {
        let path = temp_db("three_state");
        crate::db::migrations::init_db(&path).expect("init db");
        let sid = Some("2510231001");

        // 1) 成功 → 写缓存 + offline=false + sync_time
        let r = resolve_with_cache(
            &path,
            TABLE_CLASS,
            sid,
            Some("CODE1"),
            Ok(json!({ "success": true, "course_name": "数据库", "invite_code": "CODE1" })),
        )
        .expect("成功态");
        assert_eq!(r.get("offline"), Some(&Value::Bool(false)));
        assert!(r.get("sync_time").and_then(|x| x.as_str()).is_some_and(|s| !s.is_empty()));

        // 2) 失败 + 缓存命中 → 旧快照 + offline=true
        let r = resolve_with_cache(&path, TABLE_CLASS, sid, Some("CODE1"), Err("网络不可用".to_string()))
            .expect("缓存命中");
        assert_eq!(r.get("offline"), Some(&Value::Bool(true)));
        assert_eq!(r.get("course_name").and_then(|x| x.as_str()), Some("数据库"));

        // 3) 失败 + 无缓存（不同 key）→ 原错误
        let r = resolve_with_cache(&path, TABLE_CLASS, sid, Some("CODE_MISS"), Err("裸错误".to_string()));
        assert_eq!(r.err().as_deref(), Some("裸错误"));

        // 4) 无学号 → 透传（不落缓存）：成功带 offline=false，失败原样
        let r = resolve_with_cache(&path, TABLE_CLASS, None, Some("CODE1"), Ok(json!({ "x": 1 })))
            .expect("无学号成功透传");
        assert_eq!(r.get("offline"), Some(&Value::Bool(false)));
        let r = resolve_with_cache(&path, TABLE_CLASS, None, Some("CODE_X"), Err("nope".to_string()));
        assert_eq!(r.err().as_deref(), Some("nope"));

        // 5) 直存域（课程域 entry_key=None）：成功写 / 失败读
        let r = resolve_with_cache(&path, TABLE_COURSE, sid, None, Ok(json!({ "result": 1, "channelList": [] })))
            .expect("课程域成功");
        assert_eq!(r.get("offline"), Some(&Value::Bool(false)));
        let r = resolve_with_cache(&path, TABLE_COURSE, sid, None, Err("offline err".to_string()))
            .expect("课程域缓存命中");
        assert_eq!(r.get("offline"), Some(&Value::Bool(true)));
        assert_eq!(r.get("result"), Some(&Value::from(1)));

        let _ = std::fs::remove_file(&path);
    }
}
