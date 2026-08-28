//! 学期推导、校历摘要与课表上下文。
//!
//! 负责学期字符串推导（按日期/索引）、校历数据拉取与周次摘要、
//! 自动/手动课表上下文（`resolve_schedule_context`）解析，以及
//! `get_current_semester` / `is_no_schedule_error_message` 等对外入口。
//! 内部辅助（`semester_by_date`、`build_calendar_summary` 等）以
//! `pub(super)` 供课表/教室/培养方案/校历等子模块复用。

use super::super::*;
use chrono::{Datelike, Duration, Local, NaiveDate, Weekday};
use reqwest::Url;
use std::collections::{BTreeMap, HashSet};

/// 学期切换窗口：距下学期开学 N 天内视为“即将切换”。
const PRESTART_SWITCH_DAYS: i64 = 7;

#[derive(Debug, Clone)]
pub(super) struct CalendarTermSummary {
    pub(super) semester: String,
    pub(super) start_date: NaiveDate,
    pub(super) end_date: NaiveDate,
    pub(super) total_weeks: i32,
    pub(super) current_week: i32,
    pub(super) is_in_semester: bool,
}

impl CalendarTermSummary {
    pub(super) fn start_date_str(&self) -> String {
        self.start_date.format("%Y-%m-%d").to_string()
    }

    pub(super) fn end_date_str(&self) -> String {
        self.end_date.format("%Y-%m-%d").to_string()
    }

    pub(super) fn days_to_start(&self, today: NaiveDate) -> i64 {
        (self.start_date - today).num_days()
    }

    pub(super) fn days_to_end(&self, today: NaiveDate) -> i64 {
        (self.end_date - today).num_days()
    }
}

impl HbutClient {
    fn semester_start_date(semester: &str) -> Option<NaiveDate> {
        let parts: Vec<&str> = semester.split('-').collect();
        if parts.len() != 3 {
            return None;
        }
        let start_year = parts[0].parse::<i32>().ok()?;
        let end_year = parts[1].parse::<i32>().ok()?;
        let term = parts[2].parse::<u32>().ok()?;
        if end_year != start_year + 1 {
            return None;
        }
        match term {
            1 => NaiveDate::from_ymd_opt(start_year, 9, 1),
            2 => NaiveDate::from_ymd_opt(start_year + 1, 3, 1),
            _ => None,
        }
    }

    fn estimate_current_week_by_semester(
        semester: &str,
        today: NaiveDate,
        total_weeks: i32,
    ) -> Option<i32> {
        let safe_total = total_weeks.max(1);
        let start = Self::semester_start_date(semester)?;
        let end = start + Duration::days((safe_total as i64) * 7 - 1);
        if today < start || today > end {
            return None;
        }
        let days = (today - start).num_days();
        Some((days / 7 + 1).clamp(1, safe_total as i64) as i32)
    }

    /// ???????????????
    #[allow(unreachable_code)]
    pub async fn get_current_semester(
        &self,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let today = Local::now().date_naive();
        let semester = Self::semester_by_date(today);
        println!(
            "[DEBUG] Calculated semester by date: {} (today={})",
            semester, today
        );
        Ok(semester)
    }

    pub(super) fn semester_by_date(today: NaiveDate) -> String {
        let year = today.year();
        let month = today.month();
        let day = today.day();

        let (academic_year_start, term) = if month >= 9 {
            (year, 1)
        } else if month >= 3 {
            (year - 1, 2)
        } else if month == 2 && day >= 15 {
            (year - 1, 2)
        } else {
            (year - 1, 1)
        };

        format!(
            "{}-{}-{}",
            academic_year_start,
            academic_year_start + 1,
            term
        )
    }

    fn semester_index(semester: &str) -> Option<i32> {
        let parts: Vec<&str> = semester.split('-').collect();
        if parts.len() != 3 {
            return None;
        }
        let start_year = parts[0].parse::<i32>().ok()?;
        let end_year = parts[1].parse::<i32>().ok()?;
        let term = parts[2].parse::<i32>().ok()?;
        if end_year != start_year + 1 || !(term == 1 || term == 2) {
            return None;
        }
        Some(start_year * 2 + (term - 1))
    }

    fn semester_from_index(index: i32) -> String {
        let start_year = index.div_euclid(2);
        let term = index.rem_euclid(2) + 1;
        format!("{}-{}-{}", start_year, start_year + 1, term)
    }

    fn build_candidate_semesters(base: &str, radius: i32) -> Vec<String> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        if let Some(base_idx) = Self::semester_index(base) {
            for offset in -radius..=radius {
                let sem = Self::semester_from_index(base_idx + offset);
                if seen.insert(sem.clone()) {
                    out.push(sem);
                }
            }
            return out;
        }
        out.push(base.to_string());
        out
    }

    pub(super) fn parse_calendar_week_no(item: &serde_json::Value) -> Option<i32> {
        // #741：放行 zc=0（第零周）——此前被过滤导致「最小有效周」错位为第二周
        item.get("zc")
            .and_then(|v| {
                v.as_i64()
                    .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
            })
            .map(|v| v as i32)
    }

    /// #741：跨月周拆行合并——同 zc 的多行按「字段非空补全」聚合成完整周，
    /// 保证 monday/sunday 在同一行可被 `parse_calendar_date` 完整解析。
    pub(super) fn merge_calendar_week_rows(rows: &[serde_json::Value]) -> Vec<serde_json::Value> {
        let mut groups: BTreeMap<i32, serde_json::Map<String, serde_json::Value>> = BTreeMap::new();
        for item in rows {
            let Some(week_no) = Self::parse_calendar_week_no(item) else {
                continue;
            };
            let Some(obj) = item.as_object() else {
                continue;
            };
            let entry = groups.entry(week_no).or_default();
            for (key, value) in obj {
                if !entry.contains_key(key) {
                    entry.insert(key.clone(), value.clone());
                }
            }
        }
        groups
            .into_iter()
            .map(|(_, merged)| serde_json::Value::Object(merged))
            .collect()
    }

    pub(super) fn normalize_calendar_week_numbers(
        calendar_data: &serde_json::Value,
    ) -> serde_json::Value {
        let rows = match calendar_data.as_array() {
            Some(v) if !v.is_empty() => v,
            _ => return calendar_data.clone(),
        };

        let min_week_no = rows
            .iter()
            .filter_map(Self::parse_calendar_week_no)
            .min()
            .unwrap_or(1);
        if min_week_no <= 1 {
            return calendar_data.clone();
        }

        let normalized = rows
            .iter()
            .map(|row| {
                let mut next_row = row.clone();
                let week_no = match Self::parse_calendar_week_no(row) {
                    Some(v) => v,
                    None => return next_row,
                };
                let normalized_week = (week_no - min_week_no + 1).max(1);
                if let Some(obj) = next_row.as_object_mut() {
                    obj.insert("raw_zc".to_string(), serde_json::json!(week_no));
                    obj.insert("zc".to_string(), serde_json::json!(normalized_week));
                }
                next_row
            })
            .collect::<Vec<_>>();

        serde_json::Value::Array(normalized)
    }

    pub(super) fn build_calendar_summary(
        &self,
        semester: &str,
        calendar_data: &serde_json::Value,
        today: NaiveDate,
    ) -> Option<CalendarTermSummary> {
        let rows = calendar_data.as_array()?;
        if rows.is_empty() {
            return None;
        }

        // #741：教务校历存在「第零周」（zc=0）与跨月周拆行（周一在月末一行、
        // 周二~周日在月初另一行）两种结构。先把同一 zc 的多行按「字段非空补全」
        // 聚合为完整周，避免跨月周因单行缺少 monday/sunday 被整体丢弃。
        let merged_rows = Self::merge_calendar_week_rows(rows);

        let mut raw_week_bounds: Vec<(i32, NaiveDate, NaiveDate)> = Vec::new();
        for item in &merged_rows {
            let week_no = match Self::parse_calendar_week_no(item) {
                Some(v) => v,
                None => continue,
            };
            let monday = match Self::parse_calendar_date(item, "monday") {
                Some(v) => v,
                None => continue,
            };
            let sunday = match Self::parse_calendar_date(item, "sunday") {
                Some(v) => v,
                None => continue,
            };
            let normalized_sunday = if sunday < monday {
                monday + Duration::days(6)
            } else {
                sunday
            };
            raw_week_bounds.push((week_no, monday, normalized_sunday));
        }

        if raw_week_bounds.is_empty() {
            return None;
        }

        // 教务校历有时返回“学年周次”（如下学期从 26 开始），这里统一归一化为“学期周次”；
        // #741：存在第零周（zc=0）时保留原生周号语义（0 仍是第零周，1 才是第一周），不做位移。
        let min_week_no = raw_week_bounds
            .iter()
            .map(|(week_no, _, _)| *week_no)
            .min()
            .unwrap_or(1);

        let mut week_bounds: BTreeMap<i32, (NaiveDate, NaiveDate)> = BTreeMap::new();
        for (week_no, monday, sunday) in raw_week_bounds {
            let normalized_week = if min_week_no == 0 {
                week_no
            } else {
                (week_no - min_week_no + 1).max(1)
            };
            week_bounds
                .entry(normalized_week)
                .and_modify(|(existing_monday, existing_sunday)| {
                    if monday < *existing_monday {
                        *existing_monday = monday;
                    }
                    if sunday > *existing_sunday {
                        *existing_sunday = sunday;
                    }
                })
                .or_insert((monday, sunday));
        }

        if week_bounds.is_empty() {
            return None;
        }

        let start_date = week_bounds
            .get(&1)
            .map(|(monday, _)| *monday)
            .unwrap_or_else(|| {
                week_bounds
                    .values()
                    .map(|(monday, _)| *monday)
                    .min()
                    .unwrap_or(today)
            });
        let end_date = week_bounds
            .values()
            .map(|(_, sunday)| *sunday)
            .max()
            .unwrap_or(start_date);
        let max_week = week_bounds.keys().max().copied().unwrap_or(1);
        let total_weeks = max_week.max(week_bounds.len() as i32).max(1);

        let mut is_in_semester = false;
        let mut current_week = 1;
        for (week_no, (monday, sunday)) in &week_bounds {
            if today >= *monday && today <= *sunday {
                is_in_semester = true;
                current_week = *week_no;
                break;
            }
        }
        if !is_in_semester {
            current_week = if today < start_date { 1 } else { total_weeks };
        }

        Some(CalendarTermSummary {
            semester: semester.to_string(),
            start_date,
            end_date,
            total_weeks,
            current_week: current_week.clamp(1, total_weeks),
            is_in_semester,
        })
    }

    pub(super) async fn fetch_calendar_raw_for_semester(
        &self,
        semester: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        // 与排名一致：双侧 cookie 时优先 academic_base_url，失败再换域（#393）
        let jwxt_url = Url::parse(JWXT_BASE_URL)?;
        let chaoxing_url = Url::parse(CHAOXING_JWXT_BASE_URL)?;
        let has_jwxt = self
            .cookie_jar
            .cookies(&jwxt_url)
            .map(|v| v.to_str().unwrap_or_default().to_string())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let has_cx = self
            .cookie_jar
            .cookies(&chaoxing_url)
            .map(|v| v.to_str().unwrap_or_default().to_string())
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let primary = resolve_ranking_base_url(
            self.academic_base_url(),
            self.prefer_chaoxing_jwxt,
            has_jwxt,
            has_cx,
        );
        let bases = ranking_base_fallback_chain(primary, has_jwxt, has_cx);
        let mut last_err = String::from("会话已过期，请重新登录");

        // #489：拉校历前主动探测/补票，降低首包 303→登录 的概率；命中登录页时仍保留一次补票重试
        if has_cx {
            if self.ensure_chaoxing_academic_session().await {
                println!("[调试] 校历请求前已完成教务会话探测/补票");
            } else {
                println!("[调试] 校历请求前补票未就绪，仍将尝试 getData（可能 303 登录页）");
            }
        }

        for base in bases {
            let calendar_url = format!("{}/admin/xsd/jcsj/xlgl/getData/{}", base, semester);
            let mut repaired = false;
            loop {
                println!("[调试] 获取校历：{}", calendar_url);
                let response = self.client.get(&calendar_url).send().await?;
                let status = response.status();
                let final_url = response.url().to_string();
                println!("[调试] 校历响应状态: {}, 地址: {}", status, final_url);
                if looks_like_academic_login_url(&final_url) {
                    // 有超星 cookie 或 prefer 时均可补票，不再只认 prefer_chaoxing_jwxt
                    if !repaired && has_cx && self.ensure_chaoxing_academic_session().await {
                        repaired = true;
                        println!("[调试] 校历请求命中登录页，已补票后重试 base={}", base);
                        continue;
                    }
                    last_err = format!("会话已过期，请重新登录 (calendar base={})", base);
                    break;
                }
                if !status.is_success() {
                    last_err = format!("请求失败: {}", status);
                    break;
                }

                let data: serde_json::Value = response.json().await?;
                return Ok(data);
            }
        }

        Err(last_err.into())
    }

    pub(super) async fn fetch_calendar_summary_for_semester(
        &self,
        semester: &str,
        today: NaiveDate,
    ) -> Option<CalendarTermSummary> {
        let data = match self.fetch_calendar_raw_for_semester(semester).await {
            Ok(value) => value,
            Err(err) => {
                println!(
                    "[调试] 课表上下文候选学期 {} 校历请求失败: {}",
                    semester, err
                );
                return None;
            }
        };
        let summary = self.build_calendar_summary(semester, &data, today);
        if summary.is_none() {
            println!(
                "[调试] 课表上下文候选学期 {} 校历摘要缺失（周次或日期解析失败）",
                semester
            );
        }
        summary
    }

    fn build_schedule_context_json(
        semester: &str,
        summary: Option<&CalendarTermSummary>,
        is_vacation: bool,
        strategy: &str,
        notice: String,
        previous_semester: Option<&str>,
        next_semester: Option<&str>,
        days_to_next_start: Option<i64>,
        today: NaiveDate,
    ) -> serde_json::Value {
        let _expected_semester = Self::semester_by_date(today);
        let mut total_weeks = summary.map(|s| s.total_weeks).unwrap_or(25).max(1);
        let mut current_week = summary
            .map(|s| s.current_week.clamp(1, s.total_weeks.max(1)))
            .unwrap_or(1)
            .clamp(1, total_weeks);
        let mut is_in_semester = summary.map(|s| s.is_in_semester).unwrap_or(false);

        if let Some(estimated_week) =
            Self::estimate_current_week_by_semester(semester, today, total_weeks)
        {
            // 仅在无校历数据或校历标记不在学期内时使用估算周次；
            // 有校历且标记在学期内时信任校历精确值，避免硬编码开学日期偏移覆盖真实周次。
            if summary.is_none() || !is_in_semester {
                current_week = estimated_week;
                is_in_semester = true;
            }
        }

        // 兜底保证输出值范围合法。
        if total_weeks <= 0 {
            total_weeks = 25;
        }
        current_week = current_week.clamp(1, total_weeks);

        let current_weekday = if is_in_semester {
            Local::now().weekday().num_days_from_monday() as i32 + 1
        } else {
            0
        };

        let start_date = summary.map(|s| s.start_date_str()).unwrap_or_default();
        let end_date = summary.map(|s| s.end_date_str()).unwrap_or_default();
        let days_to_start = summary.map(|s| s.days_to_start(today));
        let days_to_end = summary.map(|s| s.days_to_end(today));

        serde_json::json!({
            "semester": semester,
            "display_semester": semester,
            "start_date": start_date,
            "end_date": end_date,
            "current_week": current_week,
            "current_weekday": current_weekday,
            "total_weeks": total_weeks,
            "is_in_semester": is_in_semester,
            "is_vacation": is_vacation,
            "auto_strategy": strategy,
            "vacation_notice": notice,
            "previous_semester": previous_semester.unwrap_or(""),
            "next_semester": next_semester.unwrap_or(""),
            "days_to_start": days_to_start,
            "days_to_end": days_to_end,
            "days_to_next_semester_start": days_to_next_start,
            "prestart_switch_days": PRESTART_SWITCH_DAYS
        })
    }

    async fn resolve_auto_schedule_context(&self, today: NaiveDate) -> serde_json::Value {
        let fallback_semester = self
            .get_current_semester()
            .await
            .unwrap_or_else(|_| Self::semester_by_date(today));
        let candidate_semesters = Self::build_candidate_semesters(&fallback_semester, 3);

        let mut summaries = Vec::new();
        for sem in candidate_semesters {
            if let Some(summary) = self.fetch_calendar_summary_for_semester(&sem, today).await {
                summaries.push(summary);
            }
        }

        if summaries.is_empty() {
            return Self::build_schedule_context_json(
                &fallback_semester,
                None,
                false,
                "fallback",
                String::new(),
                None,
                None,
                None,
                today,
            );
        }

        let expected_semester = Self::semester_by_date(today);
        let expected_summary = summaries
            .iter()
            .find(|s| s.semester == expected_semester)
            .cloned();

        let current = {
            let mut in_semester = summaries
                .iter()
                .filter(|s| s.is_in_semester)
                .cloned()
                .collect::<Vec<_>>();

            if in_semester.is_empty() {
                None
            } else if let Some(exact) = in_semester
                .iter()
                .find(|s| s.semester == expected_semester)
                .cloned()
            {
                Some(exact)
            } else {
                // 个别学期接口会同时返回“学年范围内可命中”的周次，优先选“已开始且开始日期更晚”的学期。
                in_semester.sort_by_key(|s| {
                    (
                        if s.start_date <= today { 1 } else { 0 },
                        s.start_date,
                        Self::semester_index(&s.semester).unwrap_or(i32::MIN),
                    )
                });
                in_semester.pop()
            }
        };
        let previous = summaries
            .iter()
            .filter(|s| s.end_date < today)
            .max_by_key(|s| s.end_date)
            .cloned();
        let next = summaries
            .iter()
            .filter(|s| s.start_date > today)
            .min_by_key(|s| s.start_date)
            .cloned();

        let next_days = next.as_ref().map(|s| s.days_to_start(today));

        if let Some(current_summary) = current {
            return Self::build_schedule_context_json(
                &current_summary.semester,
                Some(&current_summary),
                false,
                "current",
                String::new(),
                previous.as_ref().map(|s| s.semester.as_str()),
                next.as_ref().map(|s| s.semester.as_str()),
                next_days,
                today,
            );
        }

        if let Some(expected) = expected_summary.clone() {
            let days_to_start = expected.days_to_start(today);
            let days_to_end = expected.days_to_end(today);
            // 当“按日期推导学期”已有校历摘要时，优先保留该学期，避免被错误回退到上学期。
            // 判定条件：学期已开始且处于学期结束后到下学期开始前的假期，或即将开学。
            let keep_expected = if expected.start_date <= today {
                if let Some(ref n) = next {
                    // 下学期还未到切换窗口 → 继续保留当前学期（覆盖整个假期）
                    n.days_to_start(today) > PRESTART_SWITCH_DAYS
                } else {
                    // 无下学期校历，用宽松阈值覆盖假期
                    days_to_end >= -90
                }
            } else {
                days_to_start >= 0 && days_to_start <= PRESTART_SWITCH_DAYS
            };
            if keep_expected {
                return Self::build_schedule_context_json(
                    &expected.semester,
                    Some(&expected),
                    days_to_start > 0,
                    if days_to_start > 0 {
                        "vacation_next"
                    } else {
                        "current_expected"
                    },
                    String::new(),
                    previous.as_ref().map(|s| s.semester.as_str()),
                    next.as_ref().map(|s| s.semester.as_str()),
                    next_days,
                    today,
                );
            }
        } else if current.is_none() {
            // 校历 API 对日期推导学期无数据，直接使用日期推导结果避免被假期回退逻辑带偏
            return Self::build_schedule_context_json(
                &expected_semester,
                None,
                true,
                "expected_no_calendar",
                String::new(),
                previous.as_ref().map(|s| s.semester.as_str()),
                next.as_ref().map(|s| s.semester.as_str()),
                next_days,
                today,
            );
        }

        let (target, strategy, notice) = if let Some(next_summary) = next.clone() {
            let days = next_summary.days_to_start(today);
            if (0..=PRESTART_SWITCH_DAYS).contains(&days) {
                (next_summary.clone(), "vacation_next", String::new())
            } else if let Some(previous_summary) = previous.clone() {
                (
                    previous_summary.clone(),
                    "vacation_previous",
                    format!(
                        "当前为假期，当前显示上学期（{}）课表",
                        previous_summary.semester
                    ),
                )
            } else {
                (next_summary.clone(), "vacation_next", String::new())
            }
        } else if let Some(previous_summary) = previous.clone() {
            (
                previous_summary.clone(),
                "vacation_previous",
                format!(
                    "当前为假期，当前显示上学期（{}）课表",
                    previous_summary.semester
                ),
            )
        } else {
            let fallback = summaries
                .iter()
                .find(|s| s.semester == fallback_semester)
                .cloned()
                .unwrap_or_else(|| summaries[0].clone());
            (fallback, "fallback", String::new())
        };

        let is_vacation = strategy == "vacation_next" || strategy == "vacation_previous";
        Self::build_schedule_context_json(
            &target.semester,
            Some(&target),
            is_vacation,
            strategy,
            notice,
            previous.as_ref().map(|s| s.semester.as_str()),
            next.as_ref().map(|s| s.semester.as_str()),
            next_days,
            today,
        )
    }

    pub async fn resolve_schedule_context(
        &self,
        requested_semester: Option<&str>,
    ) -> serde_json::Value {
        let today = Local::now().date_naive();
        if let Some(semester) = requested_semester.map(str::trim).filter(|s| !s.is_empty()) {
            let summary = self
                .fetch_calendar_summary_for_semester(semester, today)
                .await;
            return Self::build_schedule_context_json(
                semester,
                summary.as_ref(),
                false,
                "manual",
                String::new(),
                None,
                None,
                None,
                today,
            );
        }
        self.resolve_auto_schedule_context(today).await
    }

    pub fn is_no_schedule_error_message(message: &str) -> bool {
        let lower = message.to_lowercase();
        message.contains("该学期无课表")
            || message.contains("无课表")
            || message.contains("暂无")
            || message.contains("ret=-1")
            || lower.contains("no schedule")
            || lower.contains("unknown schedule")
            || lower.contains("schedule api")
    }
    #[allow(unreachable_code)]
    pub(super) fn calculate_current_week(&self, calendar_data: &serde_json::Value) -> i32 {
        let today = Local::now().date_naive();
        return self
            .build_calendar_summary("unknown", calendar_data, today)
            .map(|s| s.current_week)
            .unwrap_or(1);

        if let Some(arr) = calendar_data.as_array() {
            let today = chrono::Local::now().date_naive();
            println!("[DEBUG] Calculating current week for date: {}", today);

            // 首先找到学期第一周的开始日期
            let mut semester_start: Option<chrono::NaiveDate> = None;
            for item in arr.iter() {
                let zc_num = item
                    .get("zc")
                    .and_then(|v| {
                        v.as_i64()
                            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                    })
                    .unwrap_or(0);

                if zc_num == 1 {
                    // 第一周的周一日期
                    if let Some(start) = Self::parse_calendar_date(item, "monday") {
                        semester_start = Some(start);
                        println!("[DEBUG] Found semester start date: {}", start);
                        break;
                    }
                }
            }

            // 如果找到了学期开始日期，直接计算周次
            if let Some(start) = semester_start {
                let days = (today - start).num_days();
                if days < 0 {
                    println!("[DEBUG] Date is before semester start, returning week 1");
                    return 1;
                }
                let week = (days / 7 + 1) as i32;
                println!(
                    "[DEBUG] Calculated week {} (days from start: {})",
                    week, days
                );
                return week.max(1).min(25);
            }

            // 备用方案：遍历每周，查找当前日期所在周
            for item in arr {
                let zc_num: i32 = item
                    .get("zc")
                    .and_then(|v| {
                        v.as_i64()
                            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                    })
                    .unwrap_or(0) as i32;

                if let (Some(start), Some(end)) = (
                    Self::parse_calendar_date(item, "monday"),
                    Self::parse_calendar_date(item, "sunday"),
                ) {
                    if today >= start && today <= end {
                        println!(
                            "[DEBUG] Found current week {} ({} to {})",
                            zc_num, start, end
                        );
                        return zc_num;
                    }
                }
            }
        }
        println!("[DEBUG] Could not determine week from calendar, defaulting to 1");
        1 // 默认第1周
    }

    /// 解析校历中的日期（处理跨月情况）
    pub(super) fn parse_calendar_date(
        item: &serde_json::Value,
        day_field: &str,
    ) -> Option<chrono::NaiveDate> {
        let raw_day = item.get(day_field).and_then(|v| v.as_str())?;
        if raw_day.trim().is_empty() {
            return None;
        }

        // 优先兼容完整日期格式：2026-03-02 / 2026/03/02 / 2026-03-02 00:00:00 / RFC3339 等。
        let parse_full_date = |value: &str| -> Option<NaiveDate> {
            let text = value.trim();
            if text.is_empty() {
                return None;
            }

            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(text) {
                return Some(dt.date_naive());
            }

            const FULL_FORMATS: [&str; 6] = [
                "%Y-%m-%d",
                "%Y/%m/%d",
                "%Y.%m.%d",
                "%Y-%m-%d %H:%M:%S",
                "%Y/%m/%d %H:%M:%S",
                "%Y.%m.%d %H:%M:%S",
            ];
            for fmt in FULL_FORMATS {
                if let Ok(date) = NaiveDate::parse_from_str(text, fmt) {
                    return Some(date);
                }
            }

            let first_part = text
                .split([' ', 'T'])
                .find(|part| !part.trim().is_empty())
                .unwrap_or("");
            if first_part.len() >= 10 {
                let candidate = &first_part[..10];
                for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"] {
                    if let Ok(date) = NaiveDate::parse_from_str(candidate, fmt) {
                        return Some(date);
                    }
                }
            }
            None
        };

        if let Some(date) = parse_full_date(raw_day) {
            return Some(date);
        }

        let ny = item.get("ny").and_then(|v| v.as_str())?; // 格式: "2024-08"
        if ny.trim().is_empty() {
            return None;
        }

        // 优先提取数字日期，兼容 "1"/"01"/"周一(01)" 等格式。
        let day_digits: String = raw_day.chars().filter(|ch| ch.is_ascii_digit()).collect();
        if day_digits.is_empty() {
            return None;
        }
        let day: u32 = day_digits.parse().ok()?;
        if day == 0 || day > 31 {
            return None;
        }

        let (base_year, base_month) = ny.split_once('-')?;
        let year: i32 = base_year.parse().ok()?;
        let month: u32 = base_month.parse().ok()?;
        if !(1..=12).contains(&month) {
            return None;
        }

        let expected_weekday = match day_field {
            "monday" => Some(Weekday::Mon),
            "tuesday" => Some(Weekday::Tue),
            "wednesday" => Some(Weekday::Wed),
            "thursday" => Some(Weekday::Thu),
            "friday" => Some(Weekday::Fri),
            "saturday" => Some(Weekday::Sat),
            "sunday" => Some(Weekday::Sun),
            _ => None,
        };

        let shift_year_month = |base_year: i32, base_month: u32, delta: i32| -> (i32, u32) {
            let month_index = base_year * 12 + (base_month as i32 - 1) + delta;
            let y = month_index.div_euclid(12);
            let m = month_index.rem_euclid(12) + 1;
            (y, m as u32)
        };

        let mut candidates: Vec<(i32, NaiveDate)> = Vec::new();
        for delta in [-1, 0, 1] {
            let (candidate_year, candidate_month) = shift_year_month(year, month, delta);
            if let Some(date) = NaiveDate::from_ymd_opt(candidate_year, candidate_month, day) {
                candidates.push((delta.abs(), date));
            }
        }
        if candidates.is_empty() {
            return None;
        }

        if let Some(expected) = expected_weekday {
            if let Some((_, date)) = candidates
                .iter()
                .filter(|(_, date)| date.weekday() == expected)
                .min_by_key(|(distance, date)| (*distance, (date.year() - year).abs()))
            {
                return Some(*date);
            }
        }

        candidates.sort_by_key(|(distance, date)| (*distance, (date.year() - year).abs()));
        candidates.first().map(|(_, date)| *date)
    }
}

#[cfg(test)]
mod calendar_week_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn week_no_keeps_zero_week() {
        // #741：第零周（zc=0）必须被解析，不能过滤掉
        assert_eq!(
            HbutClient::parse_calendar_week_no(&json!({"zc": "0"})),
            Some(0)
        );
        assert_eq!(
            HbutClient::parse_calendar_week_no(&json!({"zc": "1"})),
            Some(1)
        );
        assert_eq!(
            HbutClient::parse_calendar_week_no(&json!({"other": 1})),
            None
        );
    }

    #[test]
    fn cross_month_split_rows_merge_into_one_week() {
        // 教务校历跨月周拆行：周一在月末一行、其余日期在月初另一行
        let rows = vec![
            json!({"zc": "0", "ny": "2026-08", "monday": "24", "sunday": "30"}),
            json!({"zc": "1", "ny": "2026-08", "monday": "31"}),
            json!({"zc": "1", "ny": "2026-09", "tuesday": "1", "sunday": "6"}),
            json!({"zc": "2", "ny": "2026-09", "monday": "7", "sunday": "13"}),
        ];
        let merged = HbutClient::merge_calendar_week_rows(&rows);
        assert_eq!(merged.len(), 3, "第零周/第一周/第二周各一行");
        let week1 = merged
            .iter()
            .find(|row| row.get("zc").and_then(|v| v.as_str()) == Some("1"))
            .expect("第一周合并行存在");
        assert_eq!(week1.get("monday").and_then(|v| v.as_str()), Some("31"));
        assert_eq!(week1.get("sunday").and_then(|v| v.as_str()), Some("6"));
        // 合并后的单行必须能被跨月日期解析
        assert_eq!(
            HbutClient::parse_calendar_date(week1, "monday"),
            Some(chrono::NaiveDate::from_ymd_opt(2026, 8, 31).unwrap())
        );
        assert_eq!(
            HbutClient::parse_calendar_date(week1, "sunday"),
            Some(chrono::NaiveDate::from_ymd_opt(2026, 9, 6).unwrap())
        );
    }

    #[test]
    fn zero_week_row_stays_intact_after_merge() {
        let rows = vec![
            json!({"zc": "0", "ny": "2026-08", "monday": "24", "sunday": "30"}),
            json!({"zc": "1", "ny": "2026-09", "monday": "7", "sunday": "13"}),
        ];
        let merged = HbutClient::merge_calendar_week_rows(&rows);
        assert_eq!(merged.len(), 2);
        let week0 = &merged[0];
        assert_eq!(
            HbutClient::parse_calendar_date(week0, "monday"),
            Some(chrono::NaiveDate::from_ymd_opt(2026, 8, 24).unwrap())
        );
    }
}
