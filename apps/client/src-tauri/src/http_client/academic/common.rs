//! 教务域解析/请求公共逻辑。
//!
//! 提供跨域复用的 JSON/HTML 解析辅助：提取 xhid、select 选项、
//! 登录会话与访问记录、分页元数据、时间排序等。这些辅助函数以
//! `HbutClient` 关联函数形式提供，使用 `pub(super)` 供 academic
//! 各子模块复用。

use super::super::*;
use std::cmp::Ordering;

impl HbutClient {
    /// 从课表 HTML 中提取 xhid（学号 ID），供课表/学业进度等接口使用。
    pub(super) fn extract_xhid_from_html(html: &str) -> Option<String> {
        let patterns = [
            // hidden input: <input id="xhid" value="...">
            r#"(?is)<input[^>]+id\s*=\s*["']xhid["'][^>]*value\s*=\s*["']([^"']+)["']"#,
            // hidden input: <input value="..." id="xhid">
            r#"(?is)<input[^>]+value\s*=\s*["']([^"']+)["'][^>]*id\s*=\s*["']xhid["']"#,
            // js: xhid = '...'
            r#"xhid['"]?\s*[:=]\s*['"]([^'"]+)['"]"#,
            // fallback token style
            r#"(WGEyQ[A-Za-z0-9]+)"#,
        ];
        for pattern in patterns {
            if let Ok(re) = regex::Regex::new(pattern) {
                if let Some(cap) = re.captures(html) {
                    if let Some(m) = cap.get(1) {
                        let v = m.as_str().trim();
                        if !v.is_empty() {
                            return Some(v.to_string());
                        }
                    }
                }
            }
        }
        None
    }

    #[allow(dead_code)]
    pub(super) fn extract_semester_from_json(json: &serde_json::Value) -> Option<String> {
        // 尝试多种ʽ
        if let Some(s) = json.get("xnxqh").and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
        if let Some(s) = json.get("xnxq").and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
        if let Some(s) = json.get("dataXnxq").and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
        if let Some(s) = json.get("xqhjc").and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
        // 嵌套 data 字段
        if let Some(data) = json.get("data") {
            return Self::extract_semester_from_json(data);
        }
        None
    }

    pub(super) fn to_json_string(value: Option<&serde_json::Value>) -> Option<String> {
        match value {
            Some(serde_json::Value::String(v)) => {
                let trimmed = v.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            }
            Some(serde_json::Value::Number(v)) => Some(v.to_string()),
            Some(serde_json::Value::Bool(v)) => Some(v.to_string()),
            _ => None,
        }
    }

    pub(super) fn split_ip_and_location(raw: &str) -> (Option<String>, Option<String>) {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return (None, None);
        }

        let mut parts = trimmed.split_whitespace();
        let first = parts.next().unwrap_or_default();
        let is_ip_like = first
            .chars()
            .all(|ch| ch.is_ascii_hexdigit() || ch == '.' || ch == ':');
        if is_ip_like {
            let location = parts.collect::<Vec<_>>().join(" ").trim().to_string();
            let location = if location.is_empty() {
                None
            } else {
                Some(location)
            };
            return (Some(first.to_string()), location);
        }

        (Some(trimmed.to_string()), None)
    }

    pub(super) fn find_card_wid_in_layout(
        node: &serde_json::Value,
        target_card_id: &str,
    ) -> Option<String> {
        match node {
            serde_json::Value::Object(map) => {
                if map.get("cardId").and_then(|v| v.as_str()) == Some(target_card_id) {
                    if let Some(card_wid) = map.get("cardWid").and_then(|v| v.as_str()) {
                        let trimmed = card_wid.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }

                for value in map.values() {
                    if let Some(found) = Self::find_card_wid_in_layout(value, target_card_id) {
                        return Some(found);
                    }
                }
                None
            }
            serde_json::Value::Array(list) => {
                for item in list {
                    if let Some(found) = Self::find_card_wid_in_layout(item, target_card_id) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    pub(super) fn pick_json_string_ci(object: &serde_json::Value, keys: &[&str]) -> Option<String> {
        if let serde_json::Value::Object(map) = object {
            for key in keys {
                if let Some(v) = Self::to_json_string(map.get(*key)) {
                    return Some(v);
                }
            }

            let lower_keys: Vec<String> = keys.iter().map(|k| k.to_ascii_lowercase()).collect();
            for (key, value) in map {
                if lower_keys.iter().any(|k| k == &key.to_ascii_lowercase()) {
                    if let Some(v) = Self::to_json_string(Some(value)) {
                        return Some(v);
                    }
                }
            }
        }
        None
    }

    pub(super) fn json_to_i64(value: Option<&serde_json::Value>) -> Option<i64> {
        match value {
            Some(serde_json::Value::Number(num)) => num.as_i64(),
            Some(serde_json::Value::String(text)) => text.trim().parse::<i64>().ok(),
            Some(serde_json::Value::Bool(flag)) => Some(if *flag { 1 } else { 0 }),
            _ => None,
        }
    }

    pub(super) fn collect_personal_data_ids(value: &serde_json::Value) -> Vec<String> {
        let mut result = Vec::new();
        let keys = ["personalDatas", "personalDataIds", "dataIds", "dataList"];

        if let serde_json::Value::Object(map) = value {
            for key in keys {
                if let Some(items) = map.get(key).and_then(|v| v.as_array()) {
                    for item in items {
                        if let Some(text) = Self::to_json_string(Some(item)) {
                            let trimmed = text.trim();
                            if !trimmed.is_empty() {
                                result.push(trimmed.to_string());
                            }
                        }
                    }
                }
            }
        }

        result
    }

    pub(super) fn normalize_auth_result(value: Option<String>) -> String {
        let text = value.unwrap_or_default();
        let lower = text.to_lowercase();

        if lower.contains("success")
            || lower.contains("pass")
            || lower.contains("allow")
            || lower.contains("approved")
        {
            return "success".to_string();
        }

        if lower.contains("fail")
            || lower.contains("deny")
            || lower.contains("reject")
            || lower.contains("error")
            || lower.contains("abnormal")
        {
            return "fail".to_string();
        }

        if text.trim().is_empty() {
            "unknown".to_string()
        } else {
            text
        }
    }

    pub(super) fn parse_time_to_order(raw: &str) -> Option<i64> {
        let text = raw.trim();
        if text.is_empty() || text == "-" {
            return None;
        }

        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(text) {
            return Some(dt.timestamp_millis());
        }

        let datetime_formats = [
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y/%m/%d %H:%M:%S",
            "%Y/%m/%d %H:%M",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S%.f",
        ];
        for fmt in datetime_formats {
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(text, fmt) {
                return Some(dt.and_utc().timestamp_millis());
            }
        }

        if let Ok(date) = chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d") {
            if let Some(dt) = date.and_hms_opt(0, 0, 0) {
                return Some(dt.and_utc().timestamp_millis());
            }
        }
        if let Ok(date) = chrono::NaiveDate::parse_from_str(text, "%Y/%m/%d") {
            if let Some(dt) = date.and_hms_opt(0, 0, 0) {
                return Some(dt.and_utc().timestamp_millis());
            }
        }

        None
    }

    pub(super) fn compare_time_desc(a: &str, b: &str) -> Ordering {
        match (Self::parse_time_to_order(a), Self::parse_time_to_order(b)) {
            (Some(ta), Some(tb)) => tb.cmp(&ta),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => b.cmp(a),
        }
    }

    pub(super) fn walk_json_objects<F>(value: &serde_json::Value, callback: &mut F)
    where
        F: FnMut(&serde_json::Value),
    {
        match value {
            serde_json::Value::Object(map) => {
                callback(value);
                for child in map.values() {
                    Self::walk_json_objects(child, callback);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    Self::walk_json_objects(item, callback);
                }
            }
            _ => {}
        }
    }

    pub(super) fn looks_like_login_object(object: &serde_json::Value) -> bool {
        let has_login_hint = Self::pick_json_string_ci(
            object,
            &[
                "lastLogIp",
                "lastLoginIp",
                "loginIp",
                "clientIp",
                "ip",
                "lastLogTime",
                "lastLoginTime",
                "loginTime",
                "lastLogBrowser",
                "lastLoginBrowser",
                "clientBrowser",
            ],
        )
        .is_some();

        let has_app_hint = Self::pick_json_string_ci(
            object,
            &[
                "appName",
                "serviceName",
                "itemName",
                "authResult",
                "authStatus",
                "linkUrl",
            ],
        )
        .is_some();

        has_login_hint && !has_app_hint
    }

    pub(super) fn extract_login_session(
        object: &serde_json::Value,
        fallback_ip: Option<&str>,
    ) -> Option<serde_json::Value> {
        if !Self::looks_like_login_object(object)
            && Self::pick_json_string_ci(object, &["ip", "clientIp", "lastLogIp"]).is_none()
        {
            return None;
        }

        let mut login_ip = Self::pick_json_string_ci(
            object,
            &[
                "client_ip",
                "clientIp",
                "ip",
                "ipAddr",
                "ipAddress",
                "lastLogIp",
                "lastLoginIp",
                "loginIp",
            ],
        );
        let mut ip_location = Self::pick_json_string_ci(
            object,
            &[
                "ip_location",
                "ipLocation",
                "location",
                "city",
                "area",
                "address",
                "lastLogIpLocation",
                "lastLogArea",
                "lastLogAddress",
            ],
        );

        if login_ip.is_none() {
            login_ip = fallback_ip.map(|v| v.to_string());
        }

        if let Some(ip_raw) = login_ip.clone() {
            let (normalized_ip, parsed_location) = Self::split_ip_and_location(&ip_raw);
            if normalized_ip.is_some() {
                login_ip = normalized_ip;
            }
            if ip_location.is_none() && parsed_location.is_some() {
                ip_location = parsed_location;
            }
        }

        let login_time = Self::pick_json_string_ci(
            object,
            &[
                "login_time",
                "loginTime",
                "lastLogTime",
                "lastLoginTime",
                "time",
                "createTime",
                "accessTime",
            ],
        )
        .unwrap_or_else(|| "-".to_string());

        let browser = Self::pick_json_string_ci(
            object,
            &[
                "browser",
                "browserName",
                "clientBrowser",
                "lastLogBrowser",
                "lastLoginBrowser",
                "userAgent",
                "deviceName",
            ],
        )
        .unwrap_or_else(|| "-".to_string());

        let client_ip = login_ip.unwrap_or_else(|| "-".to_string());
        if client_ip == "-" && login_time == "-" && browser == "-" {
            return None;
        }

        Some(serde_json::json!({
            "client_ip": client_ip,
            "ip_location": ip_location.unwrap_or_else(|| "unknown".to_string()),
            "login_time": login_time,
            "browser": browser
        }))
    }

    pub(super) fn looks_like_app_access_object(object: &serde_json::Value) -> bool {
        let has_app_name = Self::pick_json_string_ci(
            object,
            &[
                "app_name",
                "appName",
                "serviceName",
                "service_name",
                "itemName",
                "applicationName",
                "title",
            ],
        )
        .is_some();
        let has_access_hint = Self::pick_json_string_ci(
            object,
            &[
                "accessTime",
                "visitTime",
                "authTime",
                "authResult",
                "authStatus",
                "verifyResult",
            ],
        )
        .is_some();
        has_app_name && has_access_hint
    }

    pub(super) fn extract_access_record(object: &serde_json::Value) -> Option<serde_json::Value> {
        if !Self::looks_like_app_access_object(object)
            && Self::pick_json_string_ci(object, &["title", "appName", "serviceName"]).is_none()
        {
            return None;
        }

        // Skip personal profile objects.
        if Self::pick_json_string_ci(object, &["stuNumber", "organizationName", "userAvatar"])
            .is_some()
            && Self::pick_json_string_ci(object, &["accessTime", "visitTime", "authResult"])
                .is_none()
        {
            return None;
        }

        let app_name = Self::pick_json_string_ci(
            object,
            &[
                "app_name",
                "appName",
                "serviceName",
                "service_name",
                "applicationName",
                "itemName",
                "title",
                "name",
                "bizDomain",
            ],
        )
        .unwrap_or_else(|| "-".to_string());
        if app_name.trim().is_empty() || app_name == "-" {
            return None;
        }

        let access_time = Self::pick_json_string_ci(
            object,
            &[
                "access_time",
                "accessTime",
                "visitTime",
                "lastAccessTime",
                "authTime",
                "time",
                "createTime",
                "operateTime",
                "logTime",
            ],
        )
        .unwrap_or_else(|| "-".to_string());

        let mut auth_result = Self::pick_json_string_ci(
            object,
            &[
                "auth_result",
                "authResult",
                "authStatus",
                "verifyResult",
                "result",
                "status",
            ],
        );
        if auth_result.is_none() {
            if let Some(text) =
                Self::pick_json_string_ci(object, &["subInfo", "mainInfo", "extraInfo"])
            {
                auth_result = Some(text);
            }
        }

        Some(serde_json::json!({
            "access_time": if access_time.trim().is_empty() { "-".to_string() } else { access_time },
            "app_name": app_name,
            "auth_result": Self::normalize_auth_result(auth_result),
            "browser": Self::pick_json_string_ci(object, &["browser", "browserName", "clientBrowser", "lastLogBrowser"]).unwrap_or_else(|| "-".to_string()),
            "link_url": Self::pick_json_string_ci(object, &["linkUrl", "url", "targetUrl"]).unwrap_or_default(),
            "extra_info": Self::pick_json_string_ci(object, &["extraInfo", "subInfo"]).unwrap_or_default()
        }))
    }

    pub(super) fn extract_pagination_meta(
        value: &serde_json::Value,
    ) -> Option<(i64, i64, i64, i64)> {
        let serde_json::Value::Object(map) = value else {
            return None;
        };

        let total = Self::json_to_i64(
            map.get("total")
                .or_else(|| map.get("totalCount"))
                .or_else(|| map.get("count"))
                .or_else(|| map.get("recordsTotal")),
        )?;

        let mut page = Self::json_to_i64(
            map.get("page")
                .or_else(|| map.get("pageNo"))
                .or_else(|| map.get("current"))
                .or_else(|| map.get("pageNum")),
        )
        .unwrap_or(1);

        let mut page_size = Self::json_to_i64(
            map.get("pageSize")
                .or_else(|| map.get("page_size"))
                .or_else(|| map.get("rows"))
                .or_else(|| map.get("size"))
                .or_else(|| map.get("limit")),
        )
        .unwrap_or(10);

        let mut total_pages = Self::json_to_i64(
            map.get("totalPages")
                .or_else(|| map.get("pages"))
                .or_else(|| map.get("pageCount")),
        )
        .unwrap_or(0);

        if page < 1 {
            page = 1;
        }
        if page_size < 1 {
            page_size = 10;
        }
        if total_pages < 1 {
            total_pages = (total + page_size - 1) / page_size;
            if total_pages < 1 {
                total_pages = 1;
            }
        }

        Some((page, page_size, total, total_pages))
    }
    pub(super) fn extract_select_options(&self, html: &str, name: &str) -> Vec<serde_json::Value> {
        self.extract_select_options_by_name_or_id(html, name)
            .into_iter()
            .filter(|item| {
                item.get("value")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .len()
                    > 0
            })
            .collect()
    }

    /// 从 HTML 中提取 select 选项，支持按 name 或 id 匹配。
    pub(super) fn extract_select_options_by_name_or_id(
        &self,
        html: &str,
        key: &str,
    ) -> Vec<serde_json::Value> {
        let pattern = format!(
            r#"(?is)<select[^>]*(?:name|id)\s*=\s*["']{}["'][^>]*>(.*?)</select>"#,
            regex::escape(key)
        );
        let select_re = match regex::Regex::new(&pattern) {
            Ok(re) => re,
            Err(_) => return vec![],
        };
        let option_re = match regex::Regex::new(
            r#"(?is)<option[^>]*value\s*=\s*["']([^"']*)["'][^>]*>(.*?)</option>"#,
        ) {
            Ok(re) => re,
            Err(_) => return vec![],
        };
        let tag_re = match regex::Regex::new(r"(?is)<[^>]+>") {
            Ok(re) => re,
            Err(_) => return vec![],
        };

        let select_html = if let Some(caps) = select_re.captures(html) {
            caps.get(1).map(|m| m.as_str()).unwrap_or("")
        } else {
            ""
        };
        if select_html.is_empty() {
            return vec![];
        }

        let mut options = vec![];
        for cap in option_re.captures_iter(select_html) {
            let value = cap.get(1).map(|m| m.as_str()).unwrap_or("").trim();
            let label = cap.get(2).map(|m| m.as_str()).unwrap_or("");
            let clean_label = tag_re.replace_all(label, "").trim().to_string();
            if clean_label.is_empty() {
                continue;
            }
            options.push(serde_json::json!({
                "value": value,
                "label": clean_label
            }));
        }

        options
    }
}
