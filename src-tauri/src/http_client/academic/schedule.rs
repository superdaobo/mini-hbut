//! 课表与空教室查询、学期列表。
//!
//! 课表（`fetch_schedule`）与学期列表（`fetch_semesters`）依赖
//! semester 子模块的校历上下文；空教室查询（`fetch_classroom_buildings`、
//! `fetch_classrooms_query`、`fetch_classrooms`）复用 common 子模块的
//! select 选项提取辅助。

use super::super::*;
use crate::parser;
use chrono::{Datelike, Duration, Local, NaiveDate, Timelike};

impl HbutClient {
    /// 获取课表（学期可选，默认按校历自动解析）
    pub async fn fetch_schedule(
        &self,
        semester: Option<&str>,
    ) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
        // 1. ????????
        let semester = match semester.map(str::trim).filter(|s| !s.is_empty()) {
            Some(s) => s.to_string(),
            None => {
                let context = self.resolve_schedule_context(None).await;
                context
                    .get("semester")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| Self::semester_by_date(Local::now().date_naive()))
            }
        };
        println!("[调试] 课表学期: {}", semester);

        // 2. 自动探测课表入口并提取 xhid（兼容 jwxt / 学习通两种路径）
        let base = self.academic_base_url();
        let referer_index = format!("{}/admin/index.html", base);
        let xhid_candidates = vec![
            format!(
                "{}/admin/xsd/pkgl/xskb/queryKbForXsd?xnxq={}",
                base, semester
            ),
            format!(
                "{}/admin//xsd/pkgl/xskb/queryKbForXsd?xnxq={}",
                base, semester
            ),
            format!("{}/admin/pkgl/xskb/queryKbForXsd?xnxq={}", base, semester),
            format!("{}/admin/xsd/pkgl/xskb/queryKbForXsd", base),
            format!("{}/admin/pkgl/xskb/queryKbForXsd", base),
        ];

        let mut xhid = String::new();
        let mut xhid_referer = String::new();
        let mut schedule_path_hint = String::new();
        let mut xhid_last_error = String::new();
        let mut chaoxing_repaired = false;

        for xhid_url in xhid_candidates {
            println!("[调试] 尝试获取 xhid：{}", xhid_url);
            let resp = match self
                .client
                .get(&xhid_url)
                .header("Referer", &referer_index)
                .send()
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    xhid_last_error = format!("请求失败: {}", e);
                    continue;
                }
            };

            let status = resp.status();
            let final_url = resp.url().to_string();
            let html = match resp.text().await {
                Ok(v) => v,
                Err(e) => {
                    xhid_last_error = format!("读取响应失败: {}", e);
                    continue;
                }
            };
            println!(
                "[调试] xhid 页面状态: {} url={} len={}",
                status,
                final_url,
                html.len()
            );

            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !chaoxing_repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    chaoxing_repaired = true;
                    println!("[调试] 课表 xhid 请求命中登录页，已补票后重试");
                    continue;
                }
                return Err("会话已过期，请重新登录".into());
            }
            if !status.is_success() {
                xhid_last_error = format!("状态码异常: {}", status);
                continue;
            }

            if let Some(found) = Self::extract_xhid_from_html(&html) {
                xhid = found;
                xhid_referer = final_url;
                if html.contains("/admin/xsd/pkgl/xskb/sdpkkbList") {
                    schedule_path_hint = "/admin/xsd/pkgl/xskb/sdpkkbList".to_string();
                } else if html.contains("/admin//xsd/pkgl/xskb/sdpkkbList") {
                    schedule_path_hint = "/admin//xsd/pkgl/xskb/sdpkkbList".to_string();
                } else {
                    schedule_path_hint = "/admin/pkgl/xskb/sdpkkbList".to_string();
                }
                break;
            } else {
                xhid_last_error = "页面中未提取到 xhid".to_string();
            }
        }

        if xhid.is_empty() {
            let suffix = if xhid_last_error.is_empty() {
                String::new()
            } else {
                format!("（{}）", xhid_last_error)
            };
            return Err(format!("无法获取学号ID (xhid){}，请重新登录后重试", suffix).into());
        }

        if xhid_referer.is_empty() {
            xhid_referer = format!(
                "{}/admin/xsd/pkgl/xskb/queryKbForXsd?xnxq={}",
                base, semester
            );
        }
        if schedule_path_hint.is_empty() {
            schedule_path_hint = "/admin/xsd/pkgl/xskb/sdpkkbList".to_string();
        }

        println!("[调试] 已获取 xhid: {}", xhid);

        // 3. 获取课表 API（多路径兜底）
        let mut schedule_url_candidates = vec![
            format!("{}{}", base, schedule_path_hint),
            format!("{}/admin/xsd/pkgl/xskb/sdpkkbList", base),
            format!("{}/admin/pkgl/xskb/sdpkkbList", base),
            format!("{}/admin//xsd/pkgl/xskb/sdpkkbList", base),
        ];
        schedule_url_candidates.dedup();

        let params = [
            ("xnxq", semester.as_str()),
            ("xhid", &xhid),
            ("xqdm", "1"),
            ("zdzc", ""),
            ("zxzc", ""),
            ("xskbxslx", "0"),
        ];

        let mut last_schedule_error = String::new();
        for schedule_url in schedule_url_candidates {
            println!("[调试] 获取课表：{}", schedule_url);
            let response = match self
                .client
                .get(&schedule_url)
                .query(&params)
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Accept", "application/json, text/javascript, */*; q=0.01")
                .header("Referer", &xhid_referer)
                .send()
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    last_schedule_error = format!("请求失败: {}", e);
                    continue;
                }
            };

            let status = response.status();
            let final_url = response.url().to_string();
            println!("[调试] 课表响应状态: {}, 地址: {}", status, final_url);

            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !chaoxing_repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    chaoxing_repaired = true;
                    println!("[调试] 课表接口命中登录页，已补票后重试");
                    continue;
                }
                return Err("会话已过期，请重新登录".into());
            }
            if !status.is_success() {
                last_schedule_error = format!("状态码异常: {}", status);
                continue;
            }

            let json: serde_json::Value = match response.json().await {
                Ok(v) => v,
                Err(e) => {
                    last_schedule_error = format!("课表 JSON 解析失败: {}", e);
                    continue;
                }
            };
            println!(
                "[调试] 课表响应: ret={}, data count={}",
                json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1),
                json.get("data")
                    .and_then(|v| v.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0)
            );

            let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
            if ret != 0 {
                let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
                let lower = msg.to_lowercase();
                if ret == -1
                    || msg.contains("该学期无课表")
                    || msg.contains("无课表")
                    || msg.contains("暂无")
                    || lower.contains("no schedule")
                {
                    return Err("该学期无课表，请切换学期".into());
                }
                last_schedule_error = format!("课表接口返回 ret={} msg={}", ret, msg);
                continue;
            }

            return parser::parse_schedule(&json);
        }

        let suffix = if last_schedule_error.is_empty() {
            String::new()
        } else {
            format!("（{}）", last_schedule_error)
        };
        Err(format!("课表接口请求失败{}", suffix).into())
    }
    /// 获取学期列表（current 按校历 + 假期策略自动解析）
    pub async fn fetch_semesters(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let context = self.resolve_schedule_context(None).await;
        let current_semester = context
            .get("semester")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| Self::semester_by_date(Local::now().date_naive()));

        let current_year: i32 = chrono::Local::now()
            .format("%Y")
            .to_string()
            .parse()
            .unwrap_or(2025);
        let mut semesters = vec![];
        for year in (current_year - 5)..=(current_year + 1) {
            semesters.push(format!("{}-{}-2", year, year + 1));
            semesters.push(format!("{}-{}-1", year, year + 1));
        }
        semesters.reverse();

        if !semesters.contains(&current_semester) {
            semesters.insert(0, current_semester.clone());
        } else {
            semesters.retain(|s| s != &current_semester);
            semesters.insert(0, current_semester.clone());
        }

        Ok(serde_json::json!({
            "success": true,
            "semesters": semesters,
            "current": current_semester,
            "context": {
                "auto_strategy": context.get("auto_strategy").cloned().unwrap_or(serde_json::json!("fallback")),
                "is_vacation": context.get("is_vacation").cloned().unwrap_or(serde_json::json!(false)),
                "vacation_notice": context.get("vacation_notice").cloned().unwrap_or(serde_json::json!("")),
                "previous_semester": context.get("previous_semester").cloned().unwrap_or(serde_json::json!("")),
                "next_semester": context.get("next_semester").cloned().unwrap_or(serde_json::json!("")),
                "days_to_next_semester_start": context.get("days_to_next_semester_start").cloned().unwrap_or(serde_json::Value::Null)
            }
        }))
    }

    /// 拉取空教ゆゼ栋信?
    pub async fn fetch_classroom_buildings(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 静态兜底：解析失败时仍保证空教室功能可用。
        let fallback_buildings = vec![
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

        let url = format!(
            "{}/admin/system/jxzy/jsxx/queryForXsd",
            self.academic_base_url()
        );
        println!("[调试] 获取空教室教学楼列表: {}", url);

        let mut repaired = false;
        let response = loop {
            let response = self
                .client
                .get(&url)
                .header(
                    "Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                )
                .send()
                .await?;
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 空教室教学楼请求命中登录页，已补票后重试");
                    continue;
                }
                println!("[调试] 空教室教学楼请求登录失效，回退内置列表");
                return Ok(serde_json::json!({
                    "success": true,
                    "data": fallback_buildings,
                    "fallback": true,
                    "error": "会话已过期，已回退内置教学楼列表"
                }));
            }
            break response;
        };

        if !response.status().is_success() {
            println!(
                "[调试] 空教室教学楼页面请求失败: {}，回退内置列表",
                response.status()
            );
            return Ok(serde_json::json!({
                "success": true,
                "data": fallback_buildings,
                "fallback": true,
                "error": format!("请求失败: {}，已回退内置教学楼列表", response.status())
            }));
        }

        let html = response.text().await?;
        let option_items = self.extract_select_options_by_name_or_id(&html, "jxldm");
        let mut buildings = vec![serde_json::json!({"code": "", "name": "全部教学楼"})];
        let mut seen_names: HashSet<String> = HashSet::new();
        for item in option_items {
            let value = item
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let name = item
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if name.is_empty() || name == "请选择" || name == "全部" || name == "全部教学楼"
            {
                continue;
            }
            if !seen_names.insert(name.clone()) {
                continue;
            }
            buildings.push(serde_json::json!({
                "code": value,
                "name": name
            }));
        }

        if buildings.len() <= 1 {
            println!("[调试] 空教室教学楼解析失败，回退内置列表");
            return Ok(serde_json::json!({
                "success": true,
                "data": fallback_buildings,
                "fallback": true,
                "error": "教学楼解析失败，已回退内置教学楼列表"
            }));
        }

        println!("[调试] 空教室教学楼解析成功: {} 项", buildings.len() - 1);

        Ok(serde_json::json!({
            "success": true,
            "data": buildings
        }))
    }

    /// 按条件查㈢┖教室
    pub async fn fetch_classrooms_query(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        building: Option<String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let classrooms_url = format!("{}/admin/pkgl/jyjs/mobile/jsxx", self.academic_base_url());

        // 统一使用“自动学期上下文”（支持假期沿用上学期/临开学切下学期）。
        let now = chrono::Local::now();
        let context = self.resolve_schedule_context(None).await;
        let semester = context
            .get("semester")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| Self::semester_by_date(now.date_naive()));
        let default_week = context
            .get("current_week")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .filter(|v| *v > 0)
            .unwrap_or(1);
        let default_weekday = context
            .get("current_weekday")
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .filter(|v| (1..=7).contains(v))
            .unwrap_or_else(|| now.weekday().num_days_from_monday() as i32 + 1);

        // 构建节次：
        // - 若前端传入 periods：严格按用户选择
        // - 若未传入：按当前时段自动选择“本时段剩余节次”，避免一口气勾选下午+晚上
        let auto_periods = || -> Vec<i32> {
            let current_minutes = (now.hour() as i32) * 60 + now.minute() as i32;
            let class_blocks = [
                (1, 8, 45),
                (2, 9, 40),
                (3, 10, 55),
                (4, 11, 50),
                (5, 14, 45),
                (6, 15, 40),
                (7, 16, 55),
                (8, 17, 50),
                (9, 19, 45),
                (10, 20, 40),
                (11, 21, 35),
            ];

            for (period, end_h, end_m) in class_blocks {
                let end_minutes = end_h * 60 + end_m;
                if current_minutes <= end_minutes {
                    if period <= 4 {
                        return (period..=4).collect();
                    }
                    if period <= 8 {
                        return (period..=8).collect();
                    }
                    return (period..=11).collect();
                }
            }

            vec![9, 10, 11]
        };

        let periods_vec = periods
            .as_ref()
            .filter(|p| !p.is_empty())
            .cloned()
            .unwrap_or_else(auto_periods);
        let jc_str = periods_vec
            .iter()
            .map(|x| x.to_string())
            .collect::<Vec<_>>()
            .join(",");

        let week_val = week.unwrap_or(default_week).max(1);
        let weekday_val = weekday.unwrap_or(default_weekday).clamp(1, 7);
        let building_str = building.clone().unwrap_or_default();

        // 使用 form 琛ㄥ格式 (涓?Python 涓€鑷?
        let params = [
            ("zcStr", week_val.to_string()),
            ("xqStr", weekday_val.to_string()),
            ("jcStr", jc_str.clone()),
            ("xqdm", "1".to_string()),  // ??: 1=??
            ("xnxq", semester.clone()), // ??????
            ("type", "1".to_string()),
            ("jsrlMin", "".to_string()),
            ("jsrlMax", "".to_string()),
            ("jslx", "".to_string()),
            ("jsbq", "".to_string()),
            ("zylx", "".to_string()),
            ("pxfs", "5".to_string()), // 按座位数排序
        ];

        println!(
            "[调试] 获取教室：{} with params: {:?}",
            classrooms_url, params
        );

        let mut repaired = false;
        let response = loop {
            let response = self
                .client
                .post(&classrooms_url)
                .header(
                    "Content-Type",
                    "application/x-www-form-urlencoded; charset=UTF-8",
                )
                .header("X-Requested-With", "XMLHttpRequest")
                .header("Origin", self.academic_base_url())
                .header(
                    "Referer",
                    format!(
                        "{}/admin/pkgl/jyjs/mobile/jysq?kjy=0&role=&cpdx=",
                        self.academic_base_url()
                    ),
                )
                .form(&params)
                .send()
                .await?;
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                if self.prefer_chaoxing_jwxt
                    && !repaired
                    && self.ensure_chaoxing_academic_session().await
                {
                    repaired = true;
                    println!("[调试] 空教室请求命中登录页，已补票后重试");
                    continue;
                }
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "会话已过期，请重新登录",
                    "need_login": true
                }));
            }
            break response;
        };
        let status = response.status();

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
                // 如果指定了教︽ゼ，进行筛?
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
                    "status": if room.get("jyzt").and_then(|v| v.as_str()) == Some("0") { "可用" } else { "已占用" }
                }));
            }
        }

        // 计算星期名和对应日期
        let weekday_names = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        let weekday_name = weekday_names.get(weekday_val as usize).unwrap_or(&"");
        let query_date = context
            .get("start_date")
            .and_then(|v| v.as_str())
            .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
            .map(|start| {
                start + Duration::days(((week_val - 1) as i64) * 7 + (weekday_val - 1) as i64)
            })
            .unwrap_or_else(|| now.date_naive());

        Ok(serde_json::json!({
            "success": true,
            "data": classrooms,
            "meta": {
                "semester": semester,
                "date_str": query_date.format("%Y年%m月%d日").to_string(),
                "date_iso": query_date.format("%Y-%m-%d").to_string(),
                "week": week_val,
                "weekday": weekday_val,
                "weekday_name": weekday_name,
                "periods": periods_vec,
                "periods_str": format!("第{}节", jc_str),
                "total": classrooms.len(),
                "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                "auto_strategy": context.get("auto_strategy").cloned().unwrap_or(serde_json::json!("fallback")),
                "is_vacation": context.get("is_vacation").cloned().unwrap_or(serde_json::json!(false)),
                "vacation_notice": context.get("vacation_notice").cloned().unwrap_or(serde_json::json!(""))
            },
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }
    pub async fn fetch_classrooms(
        &self,
    ) -> Result<Vec<crate::Classroom>, Box<dyn std::error::Error + Send + Sync>> {
        let classrooms_url = format!(
            "{}/cdjy/cdjy_cxKxcdlb.html?doType=query&gnmkdm=N2155",
            self.academic_base_url()
        );

        let response = self
            .client
            .post(&classrooms_url)
            .form(&[("xnm", "2024"), ("xqm", "12")])
            .send()
            .await?;

        let json: serde_json::Value = response.json().await?;
        parser::parse_classrooms(&json)
    }
}
