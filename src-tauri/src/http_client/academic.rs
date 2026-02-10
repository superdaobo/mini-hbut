//! 教务相关查询模块（成绩/课表/考试/排名/校历等）。
//!
//! 负责：
//! - 学期、成绩、课表、考试、排名等核心教务数据
//! - 学生信息、空教室、培养方案、校历、学业进度
//!
//! 注意：
//! - 依赖登录态 Cookie；未登录会返回错误或空数据
//! - 部分接口字段名较为混乱，解析逻辑集中在 parser 模块

use super::*;
use chrono::Datelike;
use super::utils::chrono_timestamp;

impl HbutClient {
    /// 获取当前学期字符串（自动回退）
    pub async fn get_current_semester(&self) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // 先根据当前日期计算学期（更可靠）
        let now = chrono::Local::now();
        let year = now.year();
        let month = now.month();
        let day = now.day();
        
        // 学期划分逻辑（基于中国高校通用校历）：
        // - 第一学期：8月下旬 ~ 次年1月（寒假前）
        // - 第二学期：2月中旬 ~ 7月（暑假前）
        // 
        // 1月通常还在第一学期（期末考试/寒假），2月中旬才开始第二学期
        let (academic_year_start, term) = if month >= 9 {
            // 9-12月：当年第一学期
            (year, 1)
        } else if month >= 3 {
            // 3-7月：上一学年第二学期（开学后）
            (year - 1, 2)
        } else if month == 2 && day >= 15 {
            // 2月15日之后：上一学年第二学期（春季开学）
            (year - 1, 2)
        } else {
            // 1月 和 2月上旬：上一学年第一学期（寒假期间）
            (year - 1, 1)
        };
        
        let semester = format!("{}-{}-{}", academic_year_start, academic_year_start + 1, term);
        println!("[调试] 根据日期计算当前学期: {} (month={}, day={})", semester, month, day);
        Ok(semester)
    }

    #[allow(dead_code)]
    fn extract_semester_from_json(json: &serde_json::Value) -> Option<String> {
        // 尝试多种格式
        if let Some(s) = json.get("xnxqh").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        if let Some(s) = json.get("xnxq").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        if let Some(s) = json.get("dataXnxq").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        if let Some(s) = json.get("xqhjc").and_then(|v| v.as_str()) {
            if !s.is_empty() { return Some(s.to_string()); }
        }
        // 嵌套 data 字段
        if let Some(data) = json.get("data") {
            return Self::extract_semester_from_json(data);
        }
        None
    }

    fn to_json_string(value: Option<&serde_json::Value>) -> Option<String> {
        match value {
            Some(serde_json::Value::String(v)) => {
                let trimmed = v.trim();
                if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
            }
            Some(serde_json::Value::Number(v)) => Some(v.to_string()),
            Some(serde_json::Value::Bool(v)) => Some(v.to_string()),
            _ => None,
        }
    }

    fn pick_json_string(object: &serde_json::Value, keys: &[&str]) -> Option<String> {
        for key in keys {
            if let Some(v) = Self::to_json_string(object.get(*key)) {
                return Some(v);
            }
        }
        None
    }

    fn split_ip_and_location(raw: &str) -> (Option<String>, Option<String>) {
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
            let location = if location.is_empty() { None } else { Some(location) };
            return (Some(first.to_string()), location);
        }

        (Some(trimmed.to_string()), None)
    }

    fn find_card_wid_in_layout(node: &serde_json::Value, target_card_id: &str) -> Option<String> {
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

        self.login_for_service(&username, &password, service_url).await?;

        let verify = self.client.get(service_url).send().await?;
        if verify.url().to_string().contains("authserver/login") {
            return Err("融合门户会话已过期，请重新登录".into());
        }
        Ok(())
    }

    async fn fetch_portal_client_ip(&self) -> Option<String> {
        let response = self.client.get("https://e.hbut.edu.cn/common/clientIp").send().await.ok()?;
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
        let url = format!("https://e.hbut.edu.cn/execCardMethod/{}/{}", card_wid, card_id);
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
            let err_msg = Self::to_json_string(json.get("errmsg")).unwrap_or_else(|| "未知错误".to_string());
            return Err(format!("{} 调用失败: {}", method, err_msg).into());
        }

        Ok(json.get("data").cloned().unwrap_or_else(|| serde_json::json!(null)))
    }

    /// 拉取成绩列表
    pub async fn fetch_grades(&self) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
        let grades_url = format!(
            "{}/admin/xsd/xsdcjcx/xsdQueryXscjList",
            JWXT_BASE_URL
        );
        
        println!("[调试] 获取成绩: {}", grades_url);
        
        // 使用正确的成绩查询参数
        let params = [
            ("fxbz", "0"),
            ("gridtype", "jqgrid"),
            ("queryFields", "id,xnxq,kcmc,xf,kcxz,kclx,ksxs,kcgs,xdxz,kclb,cjfxms,zhcj,hdxf,tscjzwmc,sfbk,cjlrjsxm,kcsx,fxcj,dztmlfjcj"),
            ("_search", "false"),
            ("page.size", "500"),
            ("page.pn", "1"),
            ("sort", "xnxq desc,id"),
            ("order", "desc"),
            ("startXnxq", "001"),
            ("endXnxq", "001"),
        ];
        
        let response = self.client
            .post(&grades_url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .form(&params)
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 成绩响应状态: {}, 地址: {}", status, final_url);
        
        // 检查是否被重定向到登录页
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let text = response.text().await?;
        println!("[调试] 成绩响应长度: {}", text.len());
        
        // 尝试解析 JSON
        let json: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                println!("[调试] 成绩 JSON 解析失败: {}", e);
                println!("[调试] 响应预览: {}", &text.chars().take(200).collect::<String>());
                return Err(format!("成绩数据解析失败: {}", e).into());
            }
        };
        
        parser::parse_grades(&json)
    }

    /// 拉取课表并计算当前周次
    pub async fn fetch_schedule(&self) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
        // 1. 动态获取当前学期
        let semester = self.get_current_semester().await?;
        println!("[调试] 课表学期: {}", semester);
        
        // 2. 先获取 xhid（加密学号）
        let xhid_url = format!(
            "{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}",
            JWXT_BASE_URL, semester
        );
        
        println!("[调试] 获取 xhid： {}", xhid_url);
        
        let xhid_resp = self.client
            .get(&xhid_url)
            .header("Referer", format!("{}/admin/index.html", JWXT_BASE_URL))
            .send()
            .await?;
        
        let xhid_html = xhid_resp.text().await?;
        
        // 从 HTML 中提取 xhid
        let xhid = if let Some(cap) = regex::Regex::new(r#"xhid['\"]?\s*[:=]\s*['\"]([^'\"]+)['\"]"#)?
            .captures(&xhid_html) {
            cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default()
        } else if let Some(cap) = regex::Regex::new(r"WGEyQ[A-Za-z0-9]+")?
            .captures(&xhid_html) {
            cap.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
        } else {
            return Err("无法获取学号ID (xhid)".into());
        };
        
        println!("[调试] 已获取 xhid: {}", xhid);
        
        // 3. 使用正确的课表 API
        let schedule_url = format!(
            "{}/admin/pkgl/xskb/sdpkkbList",
            JWXT_BASE_URL
        );
        
        let params = [
            ("xnxq", semester.as_str()),
            ("xhid", &xhid),
            ("xqdm", "1"),
            ("zdzc", ""),
            ("zxzc", ""),
            ("xskbxslx", "0"),
        ];
        
        println!("[调试] 获取课表： {}", schedule_url);
        
        let response = self.client
            .get(&schedule_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}", JWXT_BASE_URL, semester))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 课表响应状态: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let json: serde_json::Value = response.json().await?;
        println!("[调试] 课表响应: ret={}, data count={}", 
            json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1),
            json.get("data").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
        );
        
        parser::parse_schedule(&json)
    }

    /// 拉取考试安排（可指定学期）
    pub async fn fetch_exams(&self, semester: Option<&str>) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
        // 1. 动态获取当前学期或使用指定学期
        let semester = match semester {
            Some(s) if !s.trim().is_empty() => s.to_string(),
            _ => self.get_current_semester().await?,
        };
        println!("[调试] 考试学期: {}", semester);
        
        // 使用正确的考试 API (与 Python 模块一致)
        let exams_url = format!(
            "{}/admin/xsd/kwglXsdKscx/ajaxXsksList",
            JWXT_BASE_URL
        );
        
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", "id,kcmc,ksrq,kssj,xnxq,jsmc,ksdd,zwh,sddz,ksrs,kslx,kslxmc,kscddz,kcxxdz"),
            ("_search", "false"),
            ("page.size", "100"),
            ("page.pn", "1"),
            ("sort", "ksrq"),
            ("order", "desc"),
            ("xnxq", semester.as_str()),
        ];
        
        println!("[调试] 获取考试： {}", exams_url);
        
        let response = self.client
            .get(&exams_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/xsd/kwglXsdKscx", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 考试响应状态: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let json: serde_json::Value = response.json().await?;
        println!("[调试] 考试响应: ret={}, results count={}", 
            json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1),
            json.get("results").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0)
        );
        
        parser::parse_exams(&json)
    }

    /// 拉取绩点/排名数据（可指定学号/学期）
    pub async fn fetch_ranking(&self, student_id: Option<&str>, semester: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 使用正确的排名 API (与 Python 模块一致)
        let ranking_url = format!(
            "{}/admin/cjgl/xscjbbdy/getXscjpm",
            JWXT_BASE_URL
        );
        
        // 获取学号
        let xh = student_id.map(|s| s.to_string())
            .or_else(|| self.user_info.as_ref().map(|u| u.student_id.clone()))
            .unwrap_or_default();
        
        if xh.is_empty() {
            return Err("未提供学号".into());
        }
        
        // 从学号推断年级
        let grade = if xh.len() >= 2 {
            let prefix = &xh[..2];
            if prefix.chars().all(|c| c.is_ascii_digit()) {
                format!("20{}", prefix)
            } else {
                String::new()
            }
        } else {
            String::new()
        };
        
        let semester_value = semester.unwrap_or("").to_string();
        
        let params = [
            ("xh", xh.as_str()),
            ("sznj", grade.as_str()),
            ("xnxq", semester_value.as_str()),
        ];
        
        println!("[调试] 获取排名： {} with params: {:?}", ranking_url, params);
        
        let response = self.client
            .get(&ranking_url)
            .query(&params)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Referer", format!("{}/admin/cjgl/xscjbbdy/xsgrcjpmlist1", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 排名响应状态: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        
        // 解析 HTML
        parser::parse_ranking_html(&html, &xh, &semester_value, &grade)
    }

    /// 拉取学生基本信息
    pub async fn fetch_student_info(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let info_url = format!(
            "{}/admin/xsd/xsjbxx/xskp",
            JWXT_BASE_URL
        );
        
        println!("[调试] 获取学生信息： {}", info_url);
        
        let response = self.client
            .get(&info_url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 学生信息响应状态: {}, 地址: {}", status, final_url);
        
        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        
        let html = response.text().await?;
        parser::parse_student_info_html(&html)
    }

    /// 拉取“当前登录 + 应用访问记录”（融合门户个人信息卡片）
    pub async fn fetch_personal_login_access_info(&mut self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        const PORTAL_LOGIN_URL: &str = "https://e.hbut.edu.cn/login";
        const PORTAL_HOME_URL: &str = "https://e.hbut.edu.cn/stu/index.html#/";
        const CARD_ID: &str = "CUS_CARD_STUPERSONALDATA";
        const DEFAULT_CARD_WID: &str = "9120396937204363";

        self.ensure_portal_session(PORTAL_LOGIN_URL).await?;
        let _ = self.client.get(PORTAL_HOME_URL).send().await;

        let client_ip = self.fetch_portal_client_ip().await;
        let mut card_wid = DEFAULT_CARD_WID.to_string();

        let page_params = vec![
            ("_t", chrono_timestamp().to_string()),
            ("pageCode", "".to_string()),
            ("originalUrl", urlencoding::encode(PORTAL_HOME_URL).to_string()),
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

        let configured_result = self
            .exec_portal_card_method(&card_wid, CARD_ID, "configuredData", serde_json::json!({ "lang": "zh_CN" }))
            .await;
        let list_result = self
            .exec_portal_card_method(&card_wid, CARD_ID, "getPersonalDataList", serde_json::json!({ "lang": "zh_CN" }))
            .await;
        if configured_result.is_err() && list_result.is_err() {
            let config_err = configured_result
                .as_ref()
                .err()
                .map(|e| e.to_string())
                .unwrap_or_default();
            let list_err = list_result
                .as_ref()
                .err()
                .map(|e| e.to_string())
                .unwrap_or_default();
            return Err(format!("获取个人信息卡片数据失败: {} | {}", config_err, list_err).into());
        }

        let configured_data = configured_result.unwrap_or_else(|_| serde_json::json!({}));
        let list_data = list_result.unwrap_or_else(|_| serde_json::json!([]));

        let mut records: Vec<serde_json::Value> = Vec::new();
        if let Some(items) = list_data.as_array() {
            for item in items {
                let mut merged = item.clone();
                let need_retrieve = item
                    .get("needRetrieve")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0);
                if need_retrieve == 1 {
                    let wid = Self::pick_json_string(item, &["wid"]).unwrap_or_default();
                    let extra_info = Self::pick_json_string(item, &["extraInfo"]).unwrap_or_default();
                    if !wid.is_empty() {
                        if let Ok(detail_data) = self
                            .exec_portal_card_method(
                                &card_wid,
                                CARD_ID,
                                "getPersonalDataDetail",
                                serde_json::json!({
                                    "wid": wid,
                                    "extraInfo": extra_info
                                }),
                            )
                            .await
                        {
                            if let (Some(base_obj), Some(detail_obj)) = (merged.as_object_mut(), detail_data.as_object()) {
                                for (key, value) in detail_obj {
                                    if !value.is_null() {
                                        base_obj.insert(key.clone(), value.clone());
                                    }
                                }
                            }
                        }
                    }
                }

                let app_name = Self::pick_json_string(
                    &merged,
                    &["title", "name", "appName", "serviceName", "itemName", "bizDomain"],
                )
                .unwrap_or_else(|| "-".to_string());
                let mut access_time = Self::pick_json_string(
                    &merged,
                    &["accessTime", "visitTime", "lastAccessTime", "authTime", "time"],
                )
                .unwrap_or_else(|| "-".to_string());
                if access_time.trim().is_empty() {
                    access_time = "-".to_string();
                }

                let mut auth_result = Self::pick_json_string(
                    &merged,
                    &["authResult", "authStatus", "verifyResult", "result", "status"],
                );
                if auth_result.is_none() {
                    if let Some(text) = Self::pick_json_string(&merged, &["subInfo", "mainInfo", "extraInfo"]) {
                        let lower = text.to_lowercase();
                        if text.contains("成功") || lower.contains("success") {
                            auth_result = Some("成功".to_string());
                        } else if text.contains("失败") || lower.contains("fail") {
                            auth_result = Some("失败".to_string());
                        }
                    }
                }

                records.push(serde_json::json!({
                    "access_time": access_time,
                    "app_name": app_name,
                    "auth_result": auth_result.unwrap_or_else(|| "未知".to_string()),
                    "browser": Self::pick_json_string(&merged, &["browser", "browserName", "clientBrowser", "lastLogBrowser"]).unwrap_or_else(|| "-".to_string()),
                    "link_url": Self::pick_json_string(&merged, &["linkUrl", "url"]).unwrap_or_default(),
                    "extra_info": Self::pick_json_string(&merged, &["extraInfo"]).unwrap_or_default()
                }));
            }
        }

        let mut login_ip = Self::pick_json_string(&configured_data, &["lastLogIp", "lastLoginIp", "loginIp"]);
        let mut ip_location = Self::pick_json_string(
            &configured_data,
            &["lastLogIpLocation", "lastLogArea", "lastLogAddress", "ipLocation", "location"],
        );
        if login_ip.is_none() {
            login_ip = client_ip.clone();
        }
        if let Some(raw_ip) = login_ip.clone() {
            let (normalized_ip, parsed_location) = Self::split_ip_and_location(&raw_ip);
            if normalized_ip.is_some() {
                login_ip = normalized_ip;
            }
            if ip_location.is_none() && parsed_location.is_some() {
                ip_location = parsed_location;
            }
        }
        let login_time = Self::pick_json_string(&configured_data, &["lastLogTime", "lastLoginTime", "loginTime"])
            .unwrap_or_else(|| "-".to_string());
        let mut browser = Self::pick_json_string(
            &configured_data,
            &["lastLogBrowser", "lastLoginBrowser", "browser", "browserName", "clientBrowser"],
        );
        if browser.is_none() {
            browser = records
                .iter()
                .find_map(|item| item.get("browser").and_then(|v| v.as_str()))
                .map(|s| s.to_string())
                .filter(|s| !s.trim().is_empty() && s != "-");
        }

        Ok(serde_json::json!({
            "success": true,
            "data": {
                "current_login": {
                    "client_ip": login_ip.or(client_ip).unwrap_or_else(|| "-".to_string()),
                    "ip_location": ip_location.unwrap_or_else(|| "未知".to_string()),
                    "login_time": login_time,
                    "browser": browser.unwrap_or_else(|| "-".to_string())
                },
                "app_access_records": records,
                "meta": {
                    "card_id": CARD_ID,
                    "card_wid": card_wid
                }
            }
        }))
    }

    /// 拉取学期列表
    pub async fn fetch_semesters(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 获取当前学期 (使用统一的方法)
        let current_semester = self.get_current_semester().await.unwrap_or_else(|_| {
            let now = chrono::Local::now();
            let year = now.year();
            let month = now.month();
            if month >= 9 {
                format!("{}-{}-1", year, year + 1)
            } else if month >= 2 {
                format!("{}-{}-2", year - 1, year)
            } else {
                format!("{}-{}-1", year - 1, year)
            }
        });
        
        // 生成学期列表 (近5年)
        let current_year: i32 = chrono::Local::now().format("%Y").to_string().parse().unwrap_or(2025);
        let mut semesters = vec![];
        
        for year in (current_year - 5)..=current_year {
            semesters.push(format!("{}-{}-2", year, year + 1));
            semesters.push(format!("{}-{}-1", year, year + 1));
        }
        semesters.reverse();
        
        // 确保当前学期在列表最前面（如果不存在则添加）
        if !semesters.contains(&current_semester) {
            semesters.insert(0, current_semester.clone());
        } else {
            // 将当前学期移到最前面
            semesters.retain(|s| s != &current_semester);
            semesters.insert(0, current_semester.clone());
        }
        
        Ok(serde_json::json!({
            "success": true,
            "semesters": semesters,
            "current": current_semester
        }))
    }

    /// 拉取空教室楼栋信息
    pub async fn fetch_classroom_buildings(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 教学楼列表 (与 Python classroom.py 一致)
        let buildings = vec![
            serde_json::json!({"code": "", "name": "全部教学楼"}),
            serde_json::json!({"code": "4教", "name": "4教"}),
            serde_json::json!({"code": "5教", "name": "5教"}),
            serde_json::json!({"code": "6教", "name": "6教"}),
            serde_json::json!({"code": "8教", "name": "8教"}),
            serde_json::json!({"code": "2教", "name": "2教"}),
            serde_json::json!({"code": "3教", "name": "3教"}),
            serde_json::json!({"code": "艺术楼", "name": "艺术楼"}),
            serde_json::json!({"code": "电气学院楼", "name": "电气学院楼"}),
        ];
        
        Ok(serde_json::json!({
            "success": true,
            "data": buildings
        }))
    }

    /// 按条件查询空教室
    pub async fn fetch_classrooms_query(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        building: Option<String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let classrooms_url = format!(
            "{}/admin/pkgl/jyjs/mobile/jsxx",
            JWXT_BASE_URL
        );
        
        // 从校历计算当前周次
        let now = chrono::Local::now();
        let default_weekday = now.weekday().num_days_from_monday() as i32 + 1; // 1=周一
        
        // 获取当前学期和校历数据来计算周次
        let semester = self.get_current_semester().await.unwrap_or_else(|_| "2025-2026-1".to_string());
        let calendar_data = self.fetch_calendar_data(Some(semester.clone())).await;
        let default_week = if let Ok(ref cal) = calendar_data {
            self.calculate_current_week(cal.get("data").unwrap_or(&serde_json::json!(null)))
        } else {
            1 // 如果无法获取校历，默认第1周
        };
        
        // 构建节次参数
        let jc_str = periods.as_ref()
            .filter(|p| !p.is_empty())
            .map(|p| p.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(","))
            .unwrap_or_else(|| "1,2,3,4,5,6,7,8,9,10,11".to_string());
        
        let week_val = week.unwrap_or(default_week);
        let weekday_val = weekday.unwrap_or(default_weekday);
        let building_str = building.clone().unwrap_or_default();
        
        // 使用 form 表单格式 (与 Python 一致)
        let params = [
            ("zcStr", week_val.to_string()),
            ("xqStr", weekday_val.to_string()),
            ("jcStr", jc_str.clone()),
            ("xqdm", "1".to_string()), // 校区: 1=本部
            ("xnxq", semester.clone()), // 使用动态学期
            ("type", "1".to_string()),
            ("jsrlMin", "".to_string()),
            ("jsrlMax", "".to_string()),
            ("jslx", "".to_string()),
            ("jsbq", "".to_string()),
            ("zylx", "".to_string()),
            ("pxfs", "5".to_string()), // 按座位数排序
        ];
        
        println!("[调试] 获取教室s： {} with params: {:?}", classrooms_url, params);
        
        let response = self.client
            .post(&classrooms_url)
            .header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Origin", JWXT_BASE_URL)
            .header("Referer", format!("{}/admin/pkgl/jyjs/mobile/jysq?kjy=0&role=&cpdx=", JWXT_BASE_URL))
            .form(&params)
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }
        
        let data: serde_json::Value = response.json().await?;
        
        // 解析并格式化返回数据
        let mut classrooms = vec![];
        if let Some(arr) = data.as_array() {
            for room in arr {
                // 如果指定了教学楼，进行筛选
                if !building_str.is_empty() {
                    let jxlmc = room.get("jxlmc").and_then(|v| v.as_str()).unwrap_or("");
                    if !jxlmc.to_lowercase().contains(&building_str.to_lowercase()) {
                        continue;
                    }
                }
                
                classrooms.push(serde_json::json!({
                    "id": room.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                    "name": room.get("jsmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "code": room.get("jsbh").and_then(|v| v.as_str()).unwrap_or(""),
                    "building": room.get("jxlmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "campus": room.get("xqmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "seats": room.get("zdskrnrs").and_then(|v| v.as_i64()).unwrap_or(0),
                    "floor": room.get("szlc").and_then(|v| v.as_str()).unwrap_or(""),
                    "type": room.get("jslx").and_then(|v| v.as_str()).unwrap_or(""),
                    "department": room.get("jsglbmmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "status": if room.get("jyzt").and_then(|v| v.as_str()) == Some("0") { "可用" } else { "已借用" }
                }));
            }
        }
        
        // 计算星期几名称
        let weekday_names = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        let weekday_name = weekday_names.get(weekday_val as usize).unwrap_or(&"");
        
        // 解析节次
        let periods_vec: Vec<i32> = jc_str.split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        
        Ok(serde_json::json!({
            "success": true,
            "data": classrooms,
            "meta": {
                "semester": semester,
                "date_str": chrono::Local::now().format("%Y年%m月%d日").to_string(),
                "week": week_val,
                "weekday": weekday_val,
                "weekday_name": weekday_name,
                "periods": periods_vec,
                "periods_str": format!("第{}节", jc_str),
                "total": classrooms.len(),
                "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
            },
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }

    /// 拉取培养方案筛选项
    pub async fn fetch_training_plan_options(&self) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 从培养方案页面获取真正的筛选选项 (与 Python training_plan.py 一致)
        let url = format!("{}/admin/xsd/studentpyfa", JWXT_BASE_URL);
        
        println!("[调试] 获取培养方案 options： {}", url);
        
        let response = self.client
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .send()
            .await?;
        
        let final_url = response.url().to_string();
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        if !response.status().is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", response.status())
            }));
        }
        
        let html = response.text().await?;
        
        // 解析各个 select 选项
        let grade_options = self.extract_select_options(&html, "grade");
        let kkxq_options = self.extract_select_options(&html, "kkxq");
        let kkyx_options = self.extract_select_options(&html, "kkyx");
        let kcxz_options = self.extract_select_options(&html, "kcxz");
        let kcgs_options = self.extract_select_options(&html, "kcgs");
        
        // 根据学号推断默认年级
        let default_grade = self.user_info.as_ref()
            .and_then(|u| Self::infer_year_of_study(&u.student_id))
            .unwrap_or_default();
        
        // 推断默认学期
        let semester = self.get_current_semester().await.unwrap_or_default();
        let default_kkxq = Self::infer_term_from_semester(&semester);
        
        println!("[调试] 培养方案选项: grade={} kkxq={} kkyx={} kcxz={} kcgs={}", 
            grade_options.len(), kkxq_options.len(), kkyx_options.len(), kcxz_options.len(), kcgs_options.len());
        
        Ok(serde_json::json!({
            "success": true,
            "options": {
                "grade": grade_options,
                "kkxq": kkxq_options,
                "kkyx": kkyx_options,
                "kcxz": kcxz_options,
                "kcgs": kcgs_options
            },
            "defaults": {
                "grade": default_grade,
                "kkxq": default_kkxq
            },
            "semester": semester
        }))
    }

    /// 从 HTML 中提取 select 选项 (与 Python training_plan.py 一致)
    fn extract_select_options(&self, html: &str, name: &str) -> Vec<serde_json::Value> {
        let pattern = format!(r#"<select[^>]*name="{}"[^>]*>([\s\S]*?)</select>"#, regex::escape(name));
        let select_re = regex::Regex::new(&pattern).ok();
        
        let mut options = vec![];
        
        if let Some(re) = select_re {
            if let Some(caps) = re.captures(html) {
                let select_html = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                
                // 提取所有 option
                let option_re = regex::Regex::new(r#"<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)</option>"#).unwrap();
                for cap in option_re.captures_iter(select_html) {
                    let value = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                    let label = cap.get(2).map(|m| m.as_str()).unwrap_or("");
                    
                    // 清理标签内容
                    let clean_label = regex::Regex::new(r"<[^>]+>").unwrap()
                        .replace_all(label, "")
                        .trim()
                        .to_string();
                    
                    // 跳过空值选项（value为空的都跳过，因为前端会添加"请选择"）
                    if value.is_empty() {
                        continue;
                    }
                    
                    // 跳过空标签
                    if clean_label.is_empty() {
                        continue;
                    }
                    
                    options.push(serde_json::json!({
                        "value": value,
                        "label": clean_label
                    }));
                }
            }
        }
        
        options
    }

    /// 根据学号推断当前学年 (1-4)
    fn infer_year_of_study(student_id: &str) -> Option<String> {
        if student_id.len() < 2 {
            return None;
        }
        
        let prefix = &student_id[..2];
        if !prefix.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        
        let entry_year = 2000 + prefix.parse::<i32>().ok()?;
        let now = chrono::Local::now();
        let academic_year = if now.month() >= 9 { now.year() } else { now.year() - 1 };
        let mut year_of_study = academic_year - entry_year + 1;
        
        if year_of_study < 1 { year_of_study = 1; }
        if year_of_study > 4 { year_of_study = 4; }
        
        Some(year_of_study.to_string())
    }

    /// 从学期字符串推断学期序号 (如 "2024-2025-1" -> "1")
    fn infer_term_from_semester(semester: &str) -> String {
        if semester.is_empty() {
            return String::new();
        }
        let parts: Vec<&str> = semester.split('-').collect();
        if let Some(last) = parts.last() {
            if last.chars().all(|c| c.is_ascii_digit()) {
                return last.to_string();
            }
        }
        String::new()
    }

    /// 拉取教研室列表
    pub async fn fetch_training_plan_jys(&self, yxid: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 获取教研室列表 (与 Python training_plan.py 一致)
        let url = format!("{}/admin/pygcgl/kckgl/queryJYSNoAuth", JWXT_BASE_URL);
        
        println!("[调试] 获取 JYS： {} with yxid={}", url, yxid);
        
        let response = self.client
            .get(&url)
            .query(&[("yxid", yxid)])
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .await?;
        
        let json: serde_json::Value = response.json().await?;
        
        // 转换格式
        let mut jys_list = vec![];
        if let Some(arr) = json.as_array() {
            for item in arr {
                let id = item.get("id").and_then(|v| v.as_str()).or_else(|| item.get("id").and_then(|v| v.as_i64()).map(|_| "")).unwrap_or("");
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if !id.is_empty() {
                    jys_list.push(serde_json::json!({
                        "value": id.to_string(),
                        "label": name
                    }));
                }
            }
        }
        
        Ok(serde_json::json!({
            "success": true,
            "data": jys_list
        }))
    }

    /// 拉取培养方案课程列表
    pub async fn fetch_training_plan_courses(
        &self,
        grade: Option<String>,
        kkxq: Option<String>,
        kkyx: Option<String>,
        kkjys: Option<String>,
        kcxz: Option<String>,
        kcgs: Option<String>,
        kcbh: Option<String>,
        kcmc: Option<String>,
        page: Option<i32>,
        page_size: Option<i32>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/admin/xsd/studentpyfa/ajaxList2", JWXT_BASE_URL);
        
        let page_num = page.unwrap_or(1);
        let size = page_size.unwrap_or(50);
        
        let grade_str = grade.unwrap_or_default();
        let kkxq_str = kkxq.unwrap_or_default();
        let kkyx_str = kkyx.unwrap_or_default();
        let kkjys_str = kkjys.unwrap_or_default();
        let kcxz_str = kcxz.unwrap_or_default();
        let kcgs_str = kcgs.unwrap_or_default();
        let kcbh_str = kcbh.unwrap_or_default();
        let kcmc_str = kcmc.unwrap_or_default();
        let nd = chrono_timestamp().to_string();
        
        // 与 Python training_plan.py 完全一致的参数
        let params = [
            ("gridtype", "jqgrid"),
            ("queryFields", "id,kcmc,kcxz,sfbx,kcgs,gradename,kkxq,yxxdxq,xf,zongxs,llxs,syxs,shangjxs,shijianxs,qtxs,kkyxmc,kkjysmc,zyfxmc,sfsjhj,sjzs,ksxs"),
            ("_search", "false"),
            ("nd", &nd),
            ("page.size", &size.to_string()),
            ("page.pn", &page_num.to_string()),
            ("sort", "id"),
            ("order", "asc"),
            ("grade", &grade_str),
            ("kkxq", &kkxq_str),
            ("kkyx", &kkyx_str),
            ("kkjys", &kkjys_str),
            ("kcxz", &kcxz_str),
            ("kcgs", &kcgs_str),
            ("kcbh", &kcbh_str),
            ("kcmc", &kcmc_str),
            ("query.grade||", &grade_str),
            ("query.kkxq||", &kkxq_str),
            ("query.kkyx||", &kkyx_str),
            ("query.kkjys||", &kkjys_str),
            ("query.kcxz||", &kcxz_str),
            ("query.kcgs||", &kcgs_str),
            ("query.kcbh||", &kcbh_str),
            ("query.kcmc||", &kcmc_str),
        ];
        
        println!("[调试] 获取培养方案 courses： {}", url);
        
        let response = self.client
            .get(&url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/xsd/studentpyfa", JWXT_BASE_URL))
            .send()
            .await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }
        
        let json: serde_json::Value = response.json().await?;
        
        // 解析 jqgrid 格式响应
        let results = json.get("results").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let total = json.get("total").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let total_pages = json.get("totalPages").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let current_page = json.get("page").and_then(|v| v.as_i64()).unwrap_or(page_num as i64) as i32;
        
        println!("[调试] 培养方案课程: {} results, page {}/{}", results.len(), current_page, total_pages);
        
        Ok(serde_json::json!({
            "success": true,
            "data": results,
            "page": current_page,
            "totalPages": total_pages,
            "total": total
        }))
    }

    /// 拉取默认空教室列表（兼容旧接口）
    pub async fn fetch_classrooms(&self) -> Result<Vec<crate::Classroom>, Box<dyn std::error::Error + Send + Sync>> {
        let classrooms_url = format!(
            "{}/cdjy/cdjy_cxKxcdlb.html?doType=query&gnmkdm=N2155",
            JWXT_BASE_URL
        );
        
        let response = self.client
            .post(&classrooms_url)
            .form(&[("xnm", "2024"), ("xqm", "12")])
            .send()
            .await?;
        
        let json: serde_json::Value = response.json().await?;
        parser::parse_classrooms(&json)
    }

    // ... existing methods ...

    /// 拉取校历事件列表
    pub async fn fetch_calendar(&self) -> Result<Vec<CalendarEvent>, Box<dyn std::error::Error + Send + Sync>> {
        // 校历数据通常是静态的，这里返回示例数据
        Ok(vec![
            CalendarEvent {
                date: "2024-09-02".to_string(),
                title: "开学日".to_string(),
                event_type: "event".to_string(),
            },
            CalendarEvent {
                date: "2024-10-01".to_string(),
                title: "国庆节".to_string(),
                event_type: "holiday".to_string(),
            },
            CalendarEvent {
                date: "2025-01-13".to_string(),
                title: "期末考试开始".to_string(),
                event_type: "exam".to_string(),
            },
        ])
    }

    /// 获取校历数据 (与 Python calendar.py 一致)
    /// 拉取校历原始数据并解析当前周次
    pub async fn fetch_calendar_data(&self, semester: Option<String>) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 1. 获取当前学期 (如果未指定) - 使用基于日期的计算
        let sem = if let Some(s) = semester.filter(|s| !s.is_empty()) {
            s
        } else {
            // 使用基于日期的学期计算（更可靠）
            self.get_current_semester().await.unwrap_or_else(|_| "2024-2025-1".to_string())
        };

        println!("[调试] 获取校历学期: {}", sem);

        // 2. 获取校历数据
        let calendar_url = format!("{}/admin/xsd/jcsj/xlgl/getData/{}", JWXT_BASE_URL, sem);
        let response = self.client.get(&calendar_url).send().await?;
        
        let status = response.status();
        let final_url = response.url().to_string();
        
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }

        if !status.is_success() {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: {}", status)
            }));
        }

        let data: serde_json::Value = response.json().await?;
        
        // 计算当前周次
        let current_week = self.calculate_current_week(&data);
        
        // 构建元数据
        let meta = serde_json::json!({
            "semester": sem,
            "current_week": current_week,
            "total_weeks": data.as_array().map(|a| a.len()).unwrap_or(0)
        });
        
        Ok(serde_json::json!({
            "success": true,
            "data": data,
            "meta": meta,
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }

    fn calculate_current_week(&self, calendar_data: &serde_json::Value) -> i32 {
        if let Some(arr) = calendar_data.as_array() {
            let today = chrono::Local::now().date_naive();
            println!("[调试] 计算当前周: {}", today);
            
            // 首先找到学期第一周的开始日期
            let mut semester_start: Option<chrono::NaiveDate> = None;
            for item in arr.iter() {
                let zc_num = item.get("zc")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0);
                
                if zc_num == 1 {
                    // 第一周的周一日期
                    if let Some(start) = self.parse_calendar_date(item, "monday") {
                        semester_start = Some(start);
                        println!("[调试] 找到学期起始日期: {}", start);
                        break;
                    }
                }
            }
            
            // 如果找到了学期开始日期，直接计算周次
            if let Some(start) = semester_start {
                let days = (today - start).num_days();
                if days < 0 {
                    println!("[调试] 日期早于学期开始，返回第 1 周");
                    return 1;
                }
                let week = (days / 7 + 1) as i32;
                println!("[调试] 计算得到周次 {} (days start: {})", week, days);
                return week.max(1).min(25);
            }
            
            // 备用方案：遍历每周，查找当前日期所在周
            for item in arr {
                let zc_num: i32 = item.get("zc")
                    .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                    .unwrap_or(0) as i32;
                
                if let (Some(start), Some(end)) = (
                    self.parse_calendar_date(item, "monday"),
                    self.parse_calendar_date(item, "sunday")
                ) {
                    if today >= start && today <= end {
                        println!("[调试] 找到当前周 {} ({} to {})", zc_num, start, end);
                        return zc_num;
                    }
                }
            }
        }
        println!("[调试] 无法确定校历周次，默认 1");
        1 // 默认第1周
    }
    
    /// 解析校历中的日期（处理跨月情况）
    fn parse_calendar_date(&self, item: &serde_json::Value, day_field: &str) -> Option<chrono::NaiveDate> {
        let ny = item.get("ny").and_then(|v| v.as_str())?; // 格式: "2024-08" 或 "2024-09"
        let day_str = item.get(day_field).and_then(|v| v.as_str())?;
        
        if ny.is_empty() || day_str.is_empty() {
            return None;
        }
        
        // 尝试直接解析
        let date_str = format!("{}-{}", ny, day_str);
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
            return Some(date);
        }
        
        // 如果是两位数日期格式（如 "01"），补零解析
        let day: u32 = day_str.parse().ok()?;
        let parts: Vec<&str> = ny.split('-').collect();
        if parts.len() != 2 {
            return None;
        }
        
        let year: i32 = parts[0].parse().ok()?;
        let month: u32 = parts[1].parse().ok()?;
        
        // 检查日期是否合法（处理跨月情况）
        // 例如：ny="2024-08", monday="26", sunday="01"
        // 这时候 sunday 应该是下个月的 01
        if day <= 7 && day_field == "sunday" {
            // 可能是跨月，尝试下个月
            let next_month = if month == 12 { 1 } else { month + 1 };
            let next_year = if month == 12 { year + 1 } else { year };
            if let Some(date) = chrono::NaiveDate::from_ymd_opt(next_year, next_month, day) {
                return Some(date);
            }
        }
        
        chrono::NaiveDate::from_ymd_opt(year, month, day)
    }

    /// 获取学业完成情况 (与 Python academic_progress.py 一致)
    /// 拉取学业完成情况统计
    pub async fn fetch_academic_progress(&self, fasz: i32) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        println!("[调试] 获取学业进度 with fasz={}", fasz);
        
        // 1. 获取 xhid
        let base_url = format!("{}/admin/xsd/xskp?fasz={}", JWXT_BASE_URL, fasz);
        let response = self.client.get(&base_url).send().await?;
        
        let final_url = response.url().to_string();
        if final_url.contains("authserver/login") {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        
        let html = response.text().await?;
        
        // 提取 xhid
        let xhid = regex::Regex::new(r#"id="xhid"\s+value="([^"]+)""#)?
            .captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .or_else(|| {
                regex::Regex::new(r#"xhid\s*[:=]\s*["']([^"']+)["']"#).ok()?
                    .captures(&html)?
                    .get(1)
                    .map(|m| m.as_str().to_string())
            });
        
        let xhid = match xhid {
            Some(id) => id,
            None => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "无法获取学号ID",
                    "need_login": true
                }));
            }
        };
        
        println!("[调试] 已获取 xhid: {}", xhid);
        
        // 2. 获取基本信息
        let info_url = format!("{}/admin/xsd/xskp/xskp", JWXT_BASE_URL);
        let info_resp = self.client.get(&info_url)
            .query(&[("fasz", fasz.to_string()), ("xhid", xhid.clone())])
            .send()
            .await?;
        let info_data: serde_json::Value = info_resp.json().await.unwrap_or_default();
        
        // 3. 获取统计信息
        let summary_url = format!("{}/admin/xsd/xskp/xyqk", JWXT_BASE_URL);
        let summary_resp = self.client.get(&summary_url)
            .query(&[("fasz", fasz.to_string()), ("xhid", xhid.clone())])
            .send()
            .await?;
        let summary_data: serde_json::Value = summary_resp.json().await.unwrap_or_default();
        
        // 4. 获取树形数据
        let tree_url = format!("{}/admin/xsd/xskp/xyjc", JWXT_BASE_URL);
        let tree_resp = self.client.get(&tree_url)
            .query(&[
                ("fasz", fasz.to_string()), 
                ("xhid", xhid.clone()),
                ("flag", "1".to_string()),
            ])
            .send()
            .await?;
        let tree_data: serde_json::Value = tree_resp.json().await.unwrap_or_default();
        
        // 提取实际数据
        let basic = if info_data.get("ret").and_then(|v| v.as_i64()) == Some(0) {
            info_data.get("data").cloned()
        } else {
            None
        };
        
        let summary = if summary_data.get("ret").and_then(|v| v.as_i64()) == Some(0) {
            summary_data.get("data").cloned()
        } else {
            None
        };
        
        let tree = if tree_data.get("ret").and_then(|v| v.as_i64()) == Some(0) {
            tree_data.get("data").cloned()
        } else {
            None
        };
        
        Ok(serde_json::json!({
            "success": true,
            "data": {
                "xhid": xhid,
                "basic": basic,
                "summary": summary,
                "tree": tree
            },
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }
    
    // ========== 电费部分 ==========

}



