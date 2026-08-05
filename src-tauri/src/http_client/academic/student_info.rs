//! 学籍信息与个人登录/访问记录。
//!
//! 包含学生基本信息（`fetch_student_info`）与融合门户个人中心
//! （`fetch_personal_login_access_info`：登录会话、应用访问记录、
//! 账号安全信息）。门户侧优先走 `auth.hbut.edu.cn/personalInfo`
//! 三个接口（仅依赖现有 Cookie），失败时回退卡片方法兜底。

use super::super::utils::chrono_timestamp;
use super::super::*;
use crate::parser;
use chrono::{Local, TimeZone};
use reqwest::Url;
use std::collections::HashSet;

impl HbutClient {
    async fn ensure_portal_session(
        &mut self,
        service_url: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let response = self.client.get(service_url).send().await?;
        let final_url = response.url().to_string();
        if !final_url.contains("authserver/login") {
            return Ok(());
        }

        let username = self
            .last_username
            .clone()
            .or_else(|| self.user_info.as_ref().map(|u| u.student_id.clone()));
        let password = self.last_password.clone();
        let (username, password) = match (username, password) {
            (Some(u), Some(p)) if !u.trim().is_empty() && !p.trim().is_empty() => (u, p),
            _ => return Err("融合门户会话已过期，请重新登录".into()),
        };

        self.login_for_service(&username, &password, service_url)
            .await?;

        let verify = self.client.get(service_url).send().await?;
        if verify.url().to_string().contains("authserver/login") {
            return Err("融合门户会话已过期，请重新登录".into());
        }
        Ok(())
    }

    async fn fetch_portal_client_ip(&self) -> Option<String> {
        let response = self
            .client
            .get("https://e.hbut.edu.cn/common/clientIp")
            .send()
            .await
            .ok()?;
        let payload = response.json::<serde_json::Value>().await.ok()?;
        Self::to_json_string(payload.get("data"))
    }

    async fn exec_portal_card_method(
        &self,
        card_wid: &str,
        card_id: &str,
        method: &str,
        param: serde_json::Value,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!(
            "https://e.hbut.edu.cn/execCardMethod/{}/{}",
            card_wid, card_id
        );
        let payload = serde_json::json!({
            "cardId": card_id,
            "cardWid": card_wid,
            "method": method,
            "param": param,
            "n": chrono_timestamp().to_string()
        });

        let response = self.client.post(&url).json(&payload).send().await?;
        let json: serde_json::Value = response.json().await?;
        let errcode = json.get("errcode");
        let ok = matches!(errcode, None | Some(serde_json::Value::Null))
            || errcode.and_then(|v| v.as_i64()) == Some(0)
            || errcode.and_then(|v| v.as_str()) == Some("0");
        if !ok {
            let err_msg =
                Self::to_json_string(json.get("errmsg")).unwrap_or_else(|| "未知错误".to_string());
            return Err(format!("{} 调用失败: {}", method, err_msg).into());
        }

        Ok(json
            .get("data")
            .cloned()
            .unwrap_or_else(|| serde_json::json!(null)))
    }
    /// ????????
    pub async fn fetch_student_info(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!("{}/admin/xsd/xsjbxx/xskp", self.academic_base_url());

        println!("[调试] 获取学生信息：{}", info_url);

        let mut repaired = false;
        let html = loop {
            let response = self
                .client
                .get(&info_url)
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .send()
                .await?;
            let status = response.status();
            let final_url = response.url().to_string();
            println!("[调试] 学生信息响应状态: {}, 地址: {}", status, final_url);

            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 学生信息请求命中登录页，已补票后重试");
                    continue;
                }
                return Err("会话已过期，请重新登录".into());
            }

            break response.text().await?;
        };
        parser::parse_student_info_html(&html)
    }

    #[allow(unreachable_code)]
    pub async fn fetch_personal_login_access_info(
        &mut self,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        const PORTAL_LOGIN_URL: &str = "https://e.hbut.edu.cn/login";
        const PORTAL_HOME_URL: &str = "https://e.hbut.edu.cn/stu/index.html#/";
        const CARD_ID: &str = "CUS_CARD_STUPERSONALDATA";
        const DEFAULT_CARD_WID: &str = "9120396937204363";
        let requested_page = page.unwrap_or(1).max(1) as i64;
        let requested_page_size = page_size.unwrap_or(10).clamp(1, 100) as i64;

        // 新策略：直接使用 auth.hbut.edu.cn/personalInfo 三个接口（仅依赖现有 Cookie）
        const PERSON_CENTER_URL: &str =
            "https://auth.hbut.edu.cn/personalInfo/personCenter/index.html";
        const USER_ONLINE_URL: &str =
            "https://auth.hbut.edu.cn/personalInfo/UserOnline/user/queryUserOnline";
        const USER_LOGS_URL: &str =
            "https://auth.hbut.edu.cn/personalInfo/UserLogs/user/queryUserLogs";
        const ACCOUNT_SETTING_URL: &str =
            "https://auth.hbut.edu.cn/personalInfo/accountSecurity/accountSetting";

        self.ensure_portal_session(PERSON_CENTER_URL).await?;
        let _ = self.client.get(PERSON_CENTER_URL).send().await;

        let auth_url = Url::parse("https://auth.hbut.edu.cn")?;
        let referer_token = self
            .cookie_jar
            .cookies(&auth_url)
            .and_then(|v| v.to_str().ok().map(|s| s.to_string()))
            .and_then(|cookie_line| {
                cookie_line.split(';').find_map(|item| {
                    let (k, v) = item.trim().split_once('=')?;
                    if k.trim().eq_ignore_ascii_case("REFERERCE_TOKEN") {
                        Some(v.trim().to_string())
                    } else {
                        None
                    }
                })
            })
            .unwrap_or_default();

        let with_common_headers = |req: reqwest::RequestBuilder| {
            let req = req
                .header("Accept", "application/json")
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Origin", "https://auth.hbut.edu.cn")
                .header("Referer", PERSON_CENTER_URL);
            if referer_token.is_empty() {
                req
            } else {
                req.header("referertoken", referer_token.clone())
            }
        };

        let is_ok_response = |json: &serde_json::Value| {
            json.get("code").and_then(|v| v.as_str()) == Some("0")
                || json.get("code").and_then(|v| v.as_i64()) == Some(0)
        };

        let response_msg = |json: &serde_json::Value| {
            json.get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("未知错误")
                .to_string()
        };

        let format_time =
            |item: &serde_json::Value, text_keys: &[&str], ts_keys: &[&str]| -> String {
                for key in text_keys {
                    if let Some(raw) = item.get(*key).and_then(|v| v.as_str()) {
                        let trimmed = raw.trim();
                        if !trimmed.is_empty() {
                            return trimmed.to_string();
                        }
                    }
                }
                for key in ts_keys {
                    if let Some(ts) = Self::json_to_i64(item.get(*key)) {
                        if let Some(dt) = Local.timestamp_millis_opt(ts).single() {
                            return dt.format("%Y-%m-%d %H:%M:%S").to_string();
                        }
                    }
                }
                "-".to_string()
            };

        let build_location = |item: &serde_json::Value| -> String {
            if let Some(v) =
                Self::pick_json_string_ci(item, &["loginLocation", "ipLocation", "location"])
            {
                if !v.trim().is_empty() {
                    return v;
                }
            }
            let mut parts: Vec<String> = Vec::new();
            if let Some(v) =
                Self::pick_json_string_ci(item, &["provincesName", "provinceName", "province"])
            {
                if !v.trim().is_empty() {
                    parts.push(v);
                }
            }
            if let Some(v) = Self::pick_json_string_ci(item, &["cityName", "city"]) {
                if !v.trim().is_empty() {
                    parts.push(v);
                }
            }
            if let Some(v) = Self::pick_json_string_ci(item, &["operatorName", "isp"]) {
                if !v.trim().is_empty() {
                    parts.push(v);
                }
            }
            if parts.is_empty() {
                "未知".to_string()
            } else {
                parts.join(" ")
            }
        };

        let mut errors: Vec<String> = Vec::new();

        let online_json = match with_common_headers(self.client.get(format!(
            "{}?t={}",
            USER_ONLINE_URL,
            Local::now().timestamp()
        )))
        .send()
        .await
        {
            Ok(resp) => match resp.json::<serde_json::Value>().await {
                Ok(json) => {
                    if is_ok_response(&json) {
                        Some(json)
                    } else {
                        errors.push(format!("queryUserOnline: {}", response_msg(&json)));
                        None
                    }
                }
                Err(e) => {
                    errors.push(format!("queryUserOnline JSON 解析失败: {}", e));
                    None
                }
            },
            Err(e) => {
                errors.push(format!("queryUserOnline 请求失败: {}", e));
                None
            }
        };

        let login_logs_json =
            match with_common_headers(self.client.post(USER_LOGS_URL).json(&serde_json::json!({
                "operType": 0,
                "startTime": serde_json::Value::Null,
                "endTime": serde_json::Value::Null,
                "pageIndex": 1,
                "pageSize": requested_page_size,
                "result": "",
                "loginLocation": "",
                "typeCode": "",
                "appName": "",
                "n": format!("{:.16}", rand::random::<f64>())
            })))
            .send()
            .await
            {
                Ok(resp) => match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        if is_ok_response(&json) {
                            Some(json)
                        } else {
                            errors.push(format!(
                                "queryUserLogs(operType=0): {}",
                                response_msg(&json)
                            ));
                            None
                        }
                    }
                    Err(e) => {
                        errors.push(format!("queryUserLogs(operType=0) JSON 解析失败: {}", e));
                        None
                    }
                },
                Err(e) => {
                    errors.push(format!("queryUserLogs(operType=0) 请求失败: {}", e));
                    None
                }
            };

        let app_logs_json =
            match with_common_headers(self.client.post(USER_LOGS_URL).json(&serde_json::json!({
                "operType": 3,
                "startTime": serde_json::Value::Null,
                "endTime": serde_json::Value::Null,
                "pageIndex": requested_page,
                "pageSize": requested_page_size,
                "result": "",
                "typeCode": "",
                "appName": "",
                "appId": "",
                "n": format!("{:.16}", rand::random::<f64>())
            })))
            .send()
            .await
            {
                Ok(resp) => match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        if is_ok_response(&json) {
                            Some(json)
                        } else {
                            errors.push(format!(
                                "queryUserLogs(operType=3): {}",
                                response_msg(&json)
                            ));
                            None
                        }
                    }
                    Err(e) => {
                        errors.push(format!("queryUserLogs(operType=3) JSON 解析失败: {}", e));
                        None
                    }
                },
                Err(e) => {
                    errors.push(format!("queryUserLogs(operType=3) 请求失败: {}", e));
                    None
                }
            };

        let account_setting_json =
            match with_common_headers(self.client.post(ACCOUNT_SETTING_URL).json(
                &serde_json::json!({
                    "n": format!("{:.16}", rand::random::<f64>())
                }),
            ))
            .send()
            .await
            {
                Ok(resp) => match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        if is_ok_response(&json) {
                            Some(json)
                        } else {
                            errors.push(format!("accountSetting: {}", response_msg(&json)));
                            None
                        }
                    }
                    Err(e) => {
                        errors.push(format!("accountSetting JSON 解析失败: {}", e));
                        None
                    }
                },
                Err(e) => {
                    errors.push(format!("accountSetting 请求失败: {}", e));
                    None
                }
            };

        if online_json.is_none()
            && login_logs_json.is_none()
            && app_logs_json.is_none()
            && account_setting_json.is_none()
        {
            return Err(if errors.is_empty() {
                "未能获取 personalInfo 数据".to_string()
            } else {
                errors.join(" | ")
            }
            .into());
        }

        let mut login_sessions: Vec<serde_json::Value> = Vec::new();
        let mut login_seen: HashSet<String> = HashSet::new();

        if let Some(payload) = &online_json {
            if let Some(items) = payload
                .pointer("/datas/userOnline")
                .and_then(|v| v.as_array())
            {
                for item in items {
                    let session = serde_json::json!({
                        "client_ip": Self::pick_json_string_ci(item, &["ip", "clientIp", "client_ip"]).unwrap_or_else(|| "-".to_string()),
                        "ip_location": build_location(item),
                        "login_time": format_time(item, &["logintimeStr", "loginTimeStr"], &["logintime", "loginTime"]),
                        "browser": Self::pick_json_string_ci(item, &["useragent", "browser"]).unwrap_or_else(|| "-".to_string())
                    });
                    let key = format!(
                        "{}|{}|{}",
                        session
                            .get("client_ip")
                            .and_then(|v| v.as_str())
                            .unwrap_or("-"),
                        session
                            .get("login_time")
                            .and_then(|v| v.as_str())
                            .unwrap_or("-"),
                        session
                            .get("browser")
                            .and_then(|v| v.as_str())
                            .unwrap_or("-"),
                    );
                    if login_seen.insert(key) {
                        login_sessions.push(session);
                    }
                }
            }
        }

        if let Some(payload) = &login_logs_json {
            if let Some(items) = payload.pointer("/datas/data").and_then(|v| v.as_array()) {
                for item in items {
                    let session = serde_json::json!({
                        "client_ip": Self::pick_json_string_ci(item, &["clientIp", "ip"]).unwrap_or_else(|| "-".to_string()),
                        "ip_location": build_location(item),
                        "login_time": format_time(item, &["createtimeStr", "createTimeStr"], &["createtime", "createTime"]),
                        "browser": Self::pick_json_string_ci(item, &["useragent", "browser"]).unwrap_or_else(|| "-".to_string())
                    });
                    let key = format!(
                        "{}|{}|{}",
                        session
                            .get("client_ip")
                            .and_then(|v| v.as_str())
                            .unwrap_or("-"),
                        session
                            .get("login_time")
                            .and_then(|v| v.as_str())
                            .unwrap_or("-"),
                        session
                            .get("browser")
                            .and_then(|v| v.as_str())
                            .unwrap_or("-"),
                    );
                    if login_seen.insert(key) {
                        login_sessions.push(session);
                    }
                }
            }
        }

        if login_sessions.is_empty() {
            login_sessions.push(serde_json::json!({
                "client_ip": "-",
                "ip_location": "未知",
                "login_time": "-",
                "browser": "-"
            }));
        }

        login_sessions.sort_by(|a, b| {
            let a_time = a.get("login_time").and_then(|v| v.as_str()).unwrap_or("-");
            let b_time = b.get("login_time").and_then(|v| v.as_str()).unwrap_or("-");
            Self::compare_time_desc(a_time, b_time)
        });
        let current_login = login_sessions.first().cloned().unwrap_or_else(|| {
            serde_json::json!({
                "client_ip": "-",
                "ip_location": "未知",
                "login_time": "-",
                "browser": "-"
            })
        });

        let mut app_access_records: Vec<serde_json::Value> = Vec::new();
        let mut total: i64 = 0;
        if let Some(payload) = &app_logs_json {
            if let Some(datas) = payload.get("datas") {
                total = Self::json_to_i64(datas.get("total")).unwrap_or(0);
                if let Some(items) = datas.get("data").and_then(|v| v.as_array()) {
                    for (idx, item) in items.iter().enumerate() {
                        let numeric_result = Self::json_to_i64(item.get("result")).unwrap_or(-1);
                        let auth_result = if numeric_result == 1 {
                            "success".to_string()
                        } else if numeric_result == 0 {
                            "fail".to_string()
                        } else {
                            Self::normalize_auth_result(Self::pick_json_string_ci(
                                item,
                                &["authResult", "resultText"],
                            ))
                        };
                        app_access_records.push(serde_json::json!({
                            "id": Self::pick_json_string_ci(item, &["id"]).unwrap_or_else(|| format!("access-{}", idx)),
                            "app_name": Self::pick_json_string_ci(item, &["appname", "appName"]).unwrap_or_else(|| "-".to_string()),
                            "access_time": format_time(item, &["createtimeStr", "createTimeStr"], &["createtime", "createTime"]),
                            "auth_result": auth_result,
                            "browser": Self::pick_json_string_ci(item, &["useragent", "browser"]).unwrap_or_else(|| "-".to_string()),
                            "link_url": Self::pick_json_string_ci(item, &["appurl", "appUrl"]).unwrap_or_default()
                        }));
                    }
                }
            }
        }
        app_access_records.sort_by(|a, b| {
            let a_time = a.get("access_time").and_then(|v| v.as_str()).unwrap_or("-");
            let b_time = b.get("access_time").and_then(|v| v.as_str()).unwrap_or("-");
            Self::compare_time_desc(a_time, b_time)
        });
        if total < app_access_records.len() as i64 {
            total = app_access_records.len() as i64;
        }
        let mut total_pages = if total > 0 {
            (total + requested_page_size - 1) / requested_page_size
        } else {
            1
        };
        if total_pages < 1 {
            total_pages = 1;
        }
        let mut page = requested_page;
        if page > total_pages {
            page = total_pages;
        }
        if page < 1 {
            page = 1;
        }

        let auth_info = if let Some(payload) = &account_setting_json {
            let data = payload
                .get("datas")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let phone_verified = Self::pick_json_string_ci(&data, &["isPhoneValidated"])
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            let email_verified = Self::pick_json_string_ci(&data, &["isEmailValidated"])
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            serde_json::json!({
                "phone_verified": phone_verified,
                "phone": Self::pick_json_string_ci(&data, &["telephoneNumber"]).unwrap_or_else(|| "-".to_string()),
                "email_verified": email_verified,
                "email": Self::pick_json_string_ci(&data, &["securityEmail"]).unwrap_or_else(|| "-".to_string()),
                "password_hint": Self::pick_json_string_ci(&data, &["pwdStrengthCurrent"]).unwrap_or_else(|| "-".to_string())
            })
        } else {
            serde_json::json!({
                "phone_verified": false,
                "phone": "-",
                "email_verified": false,
                "email": "-",
                "password_hint": "-"
            })
        };

        return Ok(serde_json::json!({
            "success": true,
            "data": {
                "current_login": current_login,
                "current_logins": login_sessions.clone(),
                "login_records": login_sessions,
                "app_access_records": app_access_records,
                "app_access_pagination": {
                    "page": page,
                    "page_size": requested_page_size,
                    "total": total,
                    "total_pages": total_pages
                },
                "auth_info": auth_info,
                "meta": {
                    "source": "personal_info_cookie",
                    "requested_page": requested_page,
                    "requested_page_size": requested_page_size,
                    "error_count": errors.len(),
                    "errors": errors
                }
            }
        }));

        self.ensure_portal_session(PORTAL_LOGIN_URL).await?;
        let _ = self.client.get(PORTAL_HOME_URL).send().await;

        let client_ip = self.fetch_portal_client_ip().await;
        let mut card_wid = DEFAULT_CARD_WID.to_string();

        let page_params = vec![
            ("_t", chrono_timestamp().to_string()),
            ("pageCode", "".to_string()),
            (
                "originalUrl",
                urlencoding::encode(PORTAL_HOME_URL).to_string(),
            ),
            ("lang", "zh_CN".to_string()),
        ];
        if let Ok(response) = self
            .client
            .get("https://e.hbut.edu.cn/getPageView")
            .query(&page_params)
            .send()
            .await
        {
            if let Ok(page_json) = response.json::<serde_json::Value>().await {
                if let Some(layout_str) = page_json
                    .pointer("/data/pageContext/pageInfoEntity/cardLayout")
                    .and_then(|v| v.as_str())
                {
                    if let Ok(layout_json) = serde_json::from_str::<serde_json::Value>(layout_str) {
                        if let Some(found) = Self::find_card_wid_in_layout(&layout_json, CARD_ID) {
                            card_wid = found;
                        }
                    }
                }
            }
        }

        let render_result = self
            .exec_portal_card_method(
                &card_wid,
                CARD_ID,
                "renderData",
                serde_json::json!({ "lang": "zh_CN" }),
            )
            .await;
        let configured_result = self
            .exec_portal_card_method(
                &card_wid,
                CARD_ID,
                "configuredData",
                serde_json::json!({ "lang": "zh_CN" }),
            )
            .await;
        let unsubscribe_result = self
            .exec_portal_card_method(
                &card_wid,
                CARD_ID,
                "getUnsubscribeList",
                serde_json::json!({ "lang": "zh_CN" }),
            )
            .await;
        let list_result = self
            .exec_portal_card_method(
                &card_wid,
                CARD_ID,
                "getPersonalDataList",
                serde_json::json!({ "lang": "zh_CN" }),
            )
            .await;

        if render_result.is_err()
            && configured_result.is_err()
            && unsubscribe_result.is_err()
            && list_result.is_err()
        {
            let mut reasons = Vec::new();
            if let Err(e) = render_result {
                reasons.push(format!("renderData: {}", e));
            }
            if let Err(e) = configured_result {
                reasons.push(format!("configuredData: {}", e));
            }
            if let Err(e) = unsubscribe_result {
                reasons.push(format!("getUnsubscribeList: {}", e));
            }
            if let Err(e) = list_result {
                reasons.push(format!("getPersonalDataList: {}", e));
            }
            return Err(
                format!("failed to load personal card data: {}", reasons.join(" | ")).into(),
            );
        }

        let render_data = render_result.unwrap_or_else(|_| serde_json::json!({}));
        let configured_data = configured_result.unwrap_or_else(|_| serde_json::json!({}));
        let unsubscribe_data = unsubscribe_result.unwrap_or_else(|_| serde_json::json!([]));
        let list_data = list_result.unwrap_or_else(|_| serde_json::json!([]));

        let mut source_values: Vec<serde_json::Value> = vec![
            render_data.clone(),
            configured_data.clone(),
            unsubscribe_data.clone(),
            list_data.clone(),
        ];

        let mut detail_targets: Vec<(String, String)> = Vec::new();
        let mut target_seen: HashSet<String> = HashSet::new();
        let mut push_detail_target = |wid: String, extra_info: String| {
            let wid = wid.trim().to_string();
            if wid.is_empty() {
                return;
            }
            let extra_info = extra_info.trim().to_string();
            let key = format!("{}|{}", wid, extra_info);
            if target_seen.insert(key) {
                detail_targets.push((wid, extra_info));
            }
        };

        if let Some(items) = list_data.as_array() {
            for item in items {
                let wid =
                    Self::pick_json_string_ci(item, &["wid", "id", "dataWid", "personalDataId"])
                        .unwrap_or_default();
                let extra = Self::pick_json_string_ci(item, &["extraInfo"]).unwrap_or_default();
                push_detail_target(wid, extra);
            }
        }

        for id in Self::collect_personal_data_ids(&render_data) {
            push_detail_target(id, String::new());
        }

        if let Some(items) = unsubscribe_data.as_array() {
            for item in items {
                if let Some(id) = Self::to_json_string(Some(item)) {
                    push_detail_target(id, String::new());
                }
            }
        }

        let mut detail_values: Vec<serde_json::Value> = Vec::new();
        for (wid, extra_info) in &detail_targets {
            let mut param_variants = vec![
                serde_json::json!({
                    "wid": wid,
                    "page": requested_page,
                    "pageSize": requested_page_size,
                    "lang": "zh_CN"
                }),
                serde_json::json!({
                    "wid": wid,
                    "pageNum": requested_page,
                    "pageSize": requested_page_size,
                    "lang": "zh_CN"
                }),
                serde_json::json!({
                    "wid": wid,
                    "current": requested_page,
                    "size": requested_page_size,
                    "lang": "zh_CN"
                }),
                serde_json::json!({
                    "wid": wid,
                    "lang": "zh_CN"
                }),
            ];

            if !extra_info.is_empty() {
                for param in &mut param_variants {
                    param["extraInfo"] = serde_json::Value::String(extra_info.clone());
                }
            }

            let mut loaded = false;
            for param in param_variants {
                if let Ok(detail_data) = self
                    .exec_portal_card_method(&card_wid, CARD_ID, "getPersonalDataDetail", param)
                    .await
                {
                    source_values.push(detail_data.clone());
                    detail_values.push(detail_data);
                    loaded = true;
                    break;
                }
            }

            if !loaded {
                continue;
            }
        }

        let candidate_extra_methods: [(&str, serde_json::Value); 24] = [
            (
                "getCurrentLoginList",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getCurrentLogin",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getCurrentLoginInfo",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getCurrentLoginRecord",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getLoginRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getLoginRecordList",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getLoginLog",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getLoginHistory",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getLoginList",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAppAccessList",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAppAccessRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAppAccessRecordList",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAccessRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAccessRecordList",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getVisitRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getVisitRecordList",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAuthRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "getAuthRecordList",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "queryCurrentLoginList",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "queryLoginRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "queryAppAccessList",
                serde_json::json!({"lang":"zh_CN","page":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "queryAppAccessRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "queryAccessRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
            (
                "queryVisitRecords",
                serde_json::json!({"lang":"zh_CN","pageNum":requested_page,"pageSize":requested_page_size}),
            ),
        ];
        for (method, param) in candidate_extra_methods {
            if let Ok(extra_value) = self
                .exec_portal_card_method(&card_wid, CARD_ID, method, param)
                .await
            {
                source_values.push(extra_value);
            }
        }

        let mut login_sessions: Vec<serde_json::Value> = Vec::new();
        let mut login_seen: HashSet<String> = HashSet::new();
        for source in &source_values {
            Self::walk_json_objects(source, &mut |object| {
                if let Some(session) = Self::extract_login_session(object, client_ip.as_deref()) {
                    let ip = session
                        .get("client_ip")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let login_time = session
                        .get("login_time")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let browser = session
                        .get("browser")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let key = format!("{}|{}|{}", ip.trim(), login_time.trim(), browser.trim());
                    if login_seen.insert(key) {
                        login_sessions.push(session);
                    }
                }
            });
        }

        if login_sessions.is_empty() {
            login_sessions.push(serde_json::json!({
                "client_ip": client_ip.clone().unwrap_or_else(|| "-".to_string()),
                "ip_location": "unknown",
                "login_time": "-",
                "browser": "-"
            }));
        }

        login_sessions.sort_by(|a, b| {
            let a_time = a.get("login_time").and_then(|v| v.as_str()).unwrap_or("-");
            let b_time = b.get("login_time").and_then(|v| v.as_str()).unwrap_or("-");
            Self::compare_time_desc(a_time, b_time)
        });

        let current_login = login_sessions.first().cloned().unwrap_or_else(|| {
            serde_json::json!({
                "client_ip": "-",
                "ip_location": "unknown",
                "login_time": "-",
                "browser": "-"
            })
        });

        let mut access_records: Vec<serde_json::Value> = Vec::new();
        let mut access_seen: HashSet<String> = HashSet::new();
        for source in &source_values {
            Self::walk_json_objects(source, &mut |object| {
                if let Some(record) = Self::extract_access_record(object) {
                    let app_name = record
                        .get("app_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let access_time = record
                        .get("access_time")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let auth_result = record
                        .get("auth_result")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let browser = record
                        .get("browser")
                        .and_then(|v| v.as_str())
                        .unwrap_or("-");
                    let key = format!(
                        "{}|{}|{}|{}",
                        app_name.trim(),
                        access_time.trim(),
                        auth_result.trim(),
                        browser.trim()
                    );
                    if access_seen.insert(key) {
                        access_records.push(record);
                    }
                }
            });
        }

        access_records.sort_by(|a, b| {
            let a_time = a.get("access_time").and_then(|v| v.as_str()).unwrap_or("-");
            let b_time = b.get("access_time").and_then(|v| v.as_str()).unwrap_or("-");
            Self::compare_time_desc(a_time, b_time)
        });

        let mut pagination_candidates: Vec<(i64, i64, i64, i64)> = Vec::new();
        for source in &source_values {
            Self::walk_json_objects(source, &mut |object| {
                if let Some(meta) = Self::extract_pagination_meta(object) {
                    pagination_candidates.push(meta);
                }
            });
        }

        let mut page: i64 = requested_page;
        let mut page_size: i64 = requested_page_size;
        let mut total: i64 = access_records.len() as i64;
        let mut total_pages: i64 = if total > 0 {
            (total + page_size - 1) / page_size
        } else {
            1
        };

        if let Some((candidate_page, candidate_page_size, candidate_total, candidate_total_pages)) =
            pagination_candidates.into_iter().max_by(|a, b| {
                let a_total = a.2.max(a.1 * a.3);
                let b_total = b.2.max(b.1 * b.3);
                a_total.cmp(&b_total)
            })
        {
            if candidate_page_size > 0 {
                page_size = candidate_page_size;
            }
            if candidate_total > total {
                total = candidate_total;
            }
            if candidate_total_pages > 0 {
                total_pages = candidate_total_pages;
            }
            // 优先尊重调用方请求的页码，其次使用服务端返回页码。
            if requested_page <= 1 && candidate_page > 0 {
                page = candidate_page;
            }
        }

        if page_size <= 0 {
            page_size = 10;
        }
        if total < access_records.len() as i64 {
            total = access_records.len() as i64;
        }
        let expected_pages = if total > 0 {
            (total + page_size - 1) / page_size
        } else {
            1
        };
        if total_pages < expected_pages {
            total_pages = expected_pages;
        }
        if total_pages < 1 {
            total_pages = 1;
        }
        if page > total_pages {
            page = total_pages;
        }
        if page < 1 {
            page = 1;
        }

        // 若抓到的是完整记录集，按请求页做后端分页；否则直接透传服务端返回页。
        let page_records = if access_records.len() as i64 > page_size {
            let start = ((page - 1) * page_size).max(0) as usize;
            let end = (start + page_size as usize).min(access_records.len());
            if start >= access_records.len() {
                Vec::new()
            } else {
                access_records[start..end].to_vec()
            }
        } else {
            access_records
        };

        Ok(serde_json::json!({
            "success": true,
            "data": {
                "current_login": current_login,
                "current_logins": login_sessions.clone(),
                "login_records": login_sessions,
                "app_access_records": page_records,
                "app_access_pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": total_pages
                },
                "meta": {
                    "card_id": CARD_ID,
                    "card_wid": card_wid,
                    "detail_target_count": detail_targets.len(),
                    "detail_loaded_count": detail_values.len(),
                    "source_count": source_values.len(),
                    "requested_page": requested_page,
                    "requested_page_size": requested_page_size
                }
            }
        }))
    }
}
