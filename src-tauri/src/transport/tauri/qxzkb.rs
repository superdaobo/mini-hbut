//! 全校性选修课表（qxzkb）Tauri commands。

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

use crate::app_state::AppState;
use crate::db;
use crate::transport::tauri::common::attach_sync_time;
use crate::DB_FILENAME;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QxzkbQuery {
    pub xnxq: String,
    pub xqid: Option<String>,
    pub nj: Option<String>,
    pub yxid: Option<String>,
    pub zyid: Option<String>,
    pub kkyxid: Option<String>,
    pub kkjysid: Option<String>,
    pub kcxz: Option<String>,
    pub kclb: Option<String>,
    pub xslx: Option<String>,
    pub kcmc: Option<String>,
    pub skjs: Option<String>,
    pub jxlid: Option<String>,
    pub jslx: Option<String>,
    pub ksxs: Option<String>,
    pub ksfs: Option<String>,
    pub jsmc: Option<String>,
    pub zxjc: Option<String>,
    pub zdjc: Option<String>,
    pub zxzc: Option<String>,
    pub zdzc: Option<String>,
    pub zxxq: Option<String>,
    pub zdxq: Option<String>,
    pub xsqbkb: Option<String>,
    pub kklx: Option<Vec<String>>,
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub sort: Option<String>,
    pub order: Option<String>,
}

#[tauri::command]
pub(crate) async fn fetch_qxzkb_options(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let context = client.resolve_schedule_context(None).await;
    let current_semester = context
        .get("semester")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_default();

    let mut payload = crate::qxzkb_options::qxzkb_options();
    if !current_semester.is_empty() {
        if let Some(defaults) = payload.get_mut("defaults").and_then(|v| v.as_object_mut()) {
            defaults.insert(
                "xnxq".to_string(),
                serde_json::json!(current_semester.clone()),
            );
        }
        if let Some(list) = payload
            .get_mut("options")
            .and_then(|v| v.get_mut("xnxq"))
            .and_then(|v| v.as_array_mut())
        {
            let mut normalized = Vec::with_capacity(list.len() + 1);
            normalized.push(serde_json::json!({
                "value": current_semester.clone(),
                "label": "当前学期"
            }));
            for item in list.iter() {
                let value = item
                    .get("value")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim())
                    .unwrap_or("");
                if value.is_empty() || value == current_semester {
                    continue;
                }
                normalized.push(item.clone());
            }
            *list = normalized;
        }
    }
    if let Some(map) = payload.as_object_mut() {
        map.insert("context".to_string(), context);
    }
    Ok(payload)
}

#[tauri::command]
pub(crate) async fn fetch_qxzkb_jcinfo(
    state: State<'_, AppState>,
    xnxq: String,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let cache_key = format!("jcinfo:{}", xnxq);
    match client.fetch_qxzkb_jcinfo(&xnxq).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_qxzkb_zyxx(
    state: State<'_, AppState>,
    yxid: String,
    nj: String,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let cache_key = format!("zyxx:{}:{}", yxid, nj);
    match client.fetch_qxzkb_zyxx(&yxid, &nj).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_qxzkb_kkjys(
    state: State<'_, AppState>,
    kkyxid: String,
) -> Result<serde_json::Value, String> {
    let client = state.client.write().await;
    let cache_key = format!("kkjys:{}", kkyxid);
    match client.fetch_qxzkb_kkjys(&kkyxid).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub(crate) async fn fetch_qxzkb_list(
    state: State<'_, AppState>,
    query: QxzkbQuery,
) -> Result<serde_json::Value, String> {
    if query.xnxq.trim().is_empty() {
        return Err("请选择学年学期".to_string());
    }

    let client = state.client.write().await;
    let mut params: HashMap<String, String> = HashMap::new();
    params.insert(
        "queryFields".to_string(),
        crate::qxzkb_options::QXZKB_QUERY_FIELDS.to_string(),
    );
    params.insert("_search".to_string(), "false".to_string());
    params.insert("nd".to_string(), Utc::now().timestamp_millis().to_string());
    params.insert("xnxq".to_string(), query.xnxq.clone());

    let get_val = |val: &Option<String>| -> String {
        val.as_ref()
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .unwrap_or("")
            .to_string()
    };

    params.insert("xqid".to_string(), get_val(&query.xqid));
    params.insert("nj".to_string(), get_val(&query.nj));
    params.insert("yxid".to_string(), get_val(&query.yxid));
    params.insert("zyid".to_string(), get_val(&query.zyid));
    params.insert("kkyxid".to_string(), get_val(&query.kkyxid));
    params.insert("kkjysid".to_string(), get_val(&query.kkjysid));
    params.insert("kcxz".to_string(), get_val(&query.kcxz));
    params.insert("kclb".to_string(), get_val(&query.kclb));
    params.insert("xslx".to_string(), get_val(&query.xslx));
    params.insert("kcmc".to_string(), get_val(&query.kcmc));
    params.insert("skjs".to_string(), get_val(&query.skjs));
    params.insert("jxlid".to_string(), get_val(&query.jxlid));
    params.insert("jslx".to_string(), get_val(&query.jslx));
    params.insert("ksxs".to_string(), get_val(&query.ksxs));
    params.insert("ksfs".to_string(), get_val(&query.ksfs));
    params.insert("jsmc".to_string(), get_val(&query.jsmc));
    params.insert("zxjc".to_string(), get_val(&query.zxjc));
    params.insert("zdjc".to_string(), get_val(&query.zdjc));
    params.insert("zxxq".to_string(), get_val(&query.zxxq));
    params.insert("zdxq".to_string(), get_val(&query.zdxq));

    let xsqbkb = query.xsqbkb.clone().unwrap_or_else(|| "0".to_string());
    params.insert("xsqbkb".to_string(), xsqbkb.clone());
    if xsqbkb != "1" {
        params.insert("zxzc".to_string(), get_val(&query.zxzc));
        params.insert("zdzc".to_string(), get_val(&query.zdzc));
    }

    let kklx = query
        .kklx
        .as_ref()
        .map(|list| {
            list.iter()
                .filter(|v| !v.trim().is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    params.insert("kklx".to_string(), kklx.clone());

    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50);
    params.insert("page.pn".to_string(), page.to_string());
    params.insert("page.size".to_string(), page_size.to_string());
    let sort = query.sort.as_deref().unwrap_or("kcmc");
    let sort = if sort.trim().is_empty() { "kcmc" } else { sort };
    let order = query.order.as_deref().unwrap_or("asc");
    let order = if order.trim().is_empty() {
        "asc"
    } else {
        order
    };
    params.insert("sort".to_string(), sort.to_string());
    params.insert("order".to_string(), order.to_string());

    let query_fields = vec![
        "xnxq", "xqid", "nj", "yxid", "zyid", "kkyxid", "kkjysid", "kcxz", "kclb", "xslx", "kcmc",
        "skjs", "jxlid", "jslx", "ksxs", "ksfs", "jsmc", "zxjc", "zdjc", "zxzc", "zdzc", "zxxq",
        "zdxq", "xsqbkb", "kklx",
    ];
    for key in query_fields {
        if xsqbkb == "1" && (key == "zxzc" || key == "zdzc") {
            continue;
        }
        let value = params.get(key).cloned().unwrap_or_default();
        params.insert(format!("query.{}||", key), value);
    }

    let mut items: Vec<(&String, &String)> =
        params.iter().filter(|(k, _)| k.as_str() != "nd").collect();
    items.sort_by(|a, b| a.0.cmp(b.0));
    let cache_key = items
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&");

    match client.fetch_qxzkb_list(&params).await {
        Ok(data) => {
            let sync_time = chrono::Local::now().to_rfc3339();
            let payload = attach_sync_time(data, &sync_time, false);
            let _ = db::save_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key, &payload);
            Ok(payload)
        }
        Err(e) => {
            if let Ok(Some((cached_data, sync_time))) =
                db::get_cache(DB_FILENAME, "qxzkb_public_cache", &cache_key)
            {
                return Ok(attach_sync_time(cached_data, &sync_time, true));
            }
            Err(e.to_string())
        }
    }
}
