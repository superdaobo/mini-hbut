//! 课表与空教室查询、学期列表。
//!
//! 课表（`fetch_schedule`）与学期列表（`fetch_semesters`）依赖
//! semester 子模块的校历上下文；空教室查询（`fetch_classroom_buildings`、
//! `fetch_classrooms_query`、`fetch_classrooms`）复用 common 子模块的
//! select 选项提取辅助。

use super::super::*;
use super::classroom_teacher::{
    classify_availability, derive_building_candidates, format_periods_csv, is_selectable_week,
    match_building_alias, parse_jqgrid_page, parse_week_dates, parse_week_dictionary,
    resolve_date_from_week_day, validate_weekday, BuildingMatch, ClassroomAvailability,
    JqGridParse,
};
use super::teacher::readonly as teacher_readonly;
use crate::parser;
use chrono::{Datelike, Duration, NaiveDate, Timelike};

/// 学生空教室查询路径（POST 表单，移动端链路）。
pub(crate) const STUDENT_CLASSROOM_QUERY_PATH: &str = "/admin/pkgl/jyjs/mobile/jsxx";

/// 按会话角色选择空教室查询路径（教师 / 学生）。
///
/// - 学生：`POST /admin/pkgl/jyjs/mobile/jsxx`（按周次/星期/节次/教学楼筛选）
/// - 教师：`POST /admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid`
///   （recon 09 §1：学校 `toZyKjsPage` 页面自身即 `mtype:"post"` + jqGrid `postData`，
///   携带 `xnxq/zcStr/xqStr/jcStr/type/jxldm` 等**时间维度**筛选字段）
pub(crate) fn classroom_query_path_for_role(is_teacher: bool) -> &'static str {
    if is_teacher {
        teacher_readonly::PATH_FREE_CLASSROOMS
    } else {
        STUDENT_CLASSROOM_QUERY_PATH
    }
}

/// 学校真实节次（`GET /admin/pkgl/pkglqxzkb/getJcinfo`，2026-2027-1 实测）。
///
/// ⚠️ 与旧代码里硬编码的「第1节 08:00-08:45 / 第9节 19:00-19:45」**完全不同**，
/// 学校实际是「第1节 8:20-9:05 / 第9节 18:30-19:15」，旧值属展示错误。
pub(crate) struct RealPeriod {
    /// 小节号 1..=11（= 服务端 `jcStr` 取值）。
    pub period: i32,
    /// 开始时间（时, 分）。
    pub start: (i32, i32),
    /// 结束时间（时, 分）。
    pub end: (i32, i32),
    /// 大节号 1..=6（服务端按 `ceil(小节/2)` 合并过滤，实测）。
    pub block: i32,
    /// 时段名（上午 / 下午 / 晚上）。
    pub daypart: &'static str,
}

/// 学校真实节次时间表（11 小节）。
pub(crate) const REAL_PERIOD_TABLE: &[RealPeriod] = &[
    RealPeriod {
        period: 1,
        start: (8, 20),
        end: (9, 5),
        block: 1,
        daypart: "上午",
    },
    RealPeriod {
        period: 2,
        start: (9, 10),
        end: (9, 55),
        block: 1,
        daypart: "上午",
    },
    RealPeriod {
        period: 3,
        start: (10, 15),
        end: (11, 0),
        block: 2,
        daypart: "上午",
    },
    RealPeriod {
        period: 4,
        start: (11, 5),
        end: (11, 50),
        block: 2,
        daypart: "上午",
    },
    RealPeriod {
        period: 5,
        start: (14, 0),
        end: (14, 45),
        block: 3,
        daypart: "下午",
    },
    RealPeriod {
        period: 6,
        start: (14, 50),
        end: (15, 35),
        block: 3,
        daypart: "下午",
    },
    RealPeriod {
        period: 7,
        start: (15, 55),
        end: (16, 40),
        block: 4,
        daypart: "下午",
    },
    RealPeriod {
        period: 8,
        start: (16, 45),
        end: (17, 30),
        block: 4,
        daypart: "下午",
    },
    RealPeriod {
        period: 9,
        start: (18, 30),
        end: (19, 15),
        block: 5,
        daypart: "晚上",
    },
    RealPeriod {
        period: 10,
        start: (19, 20),
        end: (20, 5),
        block: 5,
        daypart: "晚上",
    },
    RealPeriod {
        period: 11,
        start: (20, 10),
        end: (20, 55),
        block: 6,
        daypart: "晚上",
    },
];

/// 按当前时间推荐「本时段剩余节次」（依据学校真实节次时间表）。
fn auto_periods_now() -> Vec<i32> {
    let now = chrono::Local::now();
    let current_minutes = (now.hour() as i32) * 60 + now.minute() as i32;
    for entry in REAL_PERIOD_TABLE {
        let (end_h, end_m) = entry.end;
        if current_minutes <= end_h * 60 + end_m {
            // 只取「本时段（上午/下午/晚上）」剩余的小节
            let daypart_end = REAL_PERIOD_TABLE
                .iter()
                .filter(|item| item.daypart == entry.daypart)
                .map(|item| item.period)
                .max()
                .unwrap_or(11);
            return (entry.period..=daypart_end).collect();
        }
    }
    vec![9, 10, 11]
}

/// 节次标签：按学校**大节**分组并带上真实时间，形如
/// `第9-10节 18:30-19:15、第11节 20:10-20:55`。
///
/// 之所以按大节分组：实测服务端把 `jcStr` 归并为 `ceil(小节/2)` 的**大节**过滤，
/// 而 `(9,10)` 与 `11` 分属不同大节 —— 直接把 9/10/11 写成「第9-11节」会掩盖这一点。
fn format_periods_label(periods: &[i32]) -> String {
    let mut sorted: Vec<i32> = periods.to_vec();
    sorted.sort_unstable();
    sorted.dedup();

    let mut groups: Vec<Vec<&RealPeriod>> = Vec::new();
    for period in sorted {
        let Some(entry) = REAL_PERIOD_TABLE.iter().find(|item| item.period == period) else {
            continue;
        };
        match groups.last_mut() {
            Some(last) if last.first().map(|item| item.block) == Some(entry.block) => {
                last.push(entry)
            }
            _ => groups.push(vec![entry]),
        }
    }

    let fmt = |h: i32, m: i32| format!("{:02}:{:02}", h, m);
    groups
        .iter()
        .filter_map(|group| {
            let first = group.first()?;
            let last = group.last()?;
            let range = if first.period == last.period {
                format!("第{}节", first.period)
            } else {
                format!("第{}-{}节", first.period, last.period)
            };
            let (sh, sm) = first.start;
            let (eh, em) = last.end;
            Some(format!("{} {}-{}", range, fmt(sh, sm), fmt(eh, em)))
        })
        .collect::<Vec<_>>()
        .join("、")
}

/// 教师空教室查询请求的 `queryFields`（与学校 `toZyKjsPage` 页面的
/// `#queryzyJsxxFields` 隐藏域一致；实测服务端会返回固定投影，未下发的字段取不到）。
const TEACHER_CLASSROOM_QUERY_FIELDS: &str =
    "id,jsbh,jsmc,jstp,kxjc,jslx,zdskrnrs,ksrnrs,jxlmc,szlc,gnqmc,xqmc,syyx,jyzt,jsbq,zylx,";

/// HTTP 状态是否成功（2xx）。
fn status_is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

/// 教师空教室**资源目录**（不筛选）的解析结果。
struct TeacherClassroomCatalog {
    /// 由实际返回教室去重导出的教学楼候选（同一资源域）。
    candidates: Vec<super::classroom_teacher::BuildingCandidate>,
    /// 无筛选时的资源目录条数（用于识别「筛选被服务端静默忽略」）。
    total: i64,
}

/// 教师空教室查询链路的错误分类（用于把「无权限 / 需重登 / 坏响应 / 传输失败」区分开）。
enum TeacherClassroomError {
    /// 命中登录页 → 会话过期，需重新登录。
    NeedLogin,
    /// HTTP 401 → 学校明确未授权该接口。
    Unauthorized,
    /// 服务端坏响应（错误页 / 结构异常 / `ret != 0`）。
    BadResponse(String),
    /// 网络或其它传输层失败。
    Transport(String),
}

impl TeacherClassroomError {
    fn to_user_message(&self) -> String {
        match self {
            Self::NeedLogin => "会话已过期，请重新登录".to_string(),
            Self::Unauthorized => "没有访问空教室接口的权限".to_string(),
            Self::BadResponse(msg) => format!("教务接口响应异常：{msg}"),
            Self::Transport(msg) => format!("请求失败：{msg}"),
        }
    }
}

/// 取「某周 7 天日期」的结果（该接口同时充当周次合法性校验器）。
enum TeacherWeekDates {
    /// 合法周次 + 7 天日期。
    Ok(Vec<super::classroom_teacher::WeekDayDate>),
    /// 周次越界（实测 `200 + ret=-1 "数据错误"`）。
    InvalidWeek,
    /// 传输/解析失败（不用于判定周次合法性）。
    Transport(String),
}

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
                    .unwrap_or_else(crate::semester_catalog::current_semester_by_date)
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
            .unwrap_or_else(crate::semester_catalog::current_semester_by_date);

        // #1044：与全校课表共用同一学期生成器，窗口不再各自维护
        let semesters = crate::semester_catalog::build_recent_semesters(&current_semester);

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

    /// 拉取空教室教学楼列表（按**真实会话角色**严格分派）。
    ///
    /// #1063：教师与学生的数据源必须严格区分。
    /// 教师**不允许**回退到学生相关的 `queryForXsd` 页面，也不允许回退到静态内置列表
    /// （那会向用户展示「有权限不明」的楼栋并假装成功）。
    pub async fn fetch_classroom_buildings(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let is_teacher = self
            .user_info
            .as_ref()
            .map(|user| user.role.is_teacher())
            .unwrap_or(false);
        if is_teacher {
            return self.fetch_teacher_classroom_buildings().await;
        }
        self.fetch_student_classroom_buildings().await
    }

    /// 教师空教室教学楼候选（#1063）。
    ///
    /// 数据源：`POST /admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid`（**不筛选**）
    /// → 从**实际返回的教室**按 `jxldm/jxlmc/xqmc` 去重导出。
    ///
    /// 为什么不直接用 `getJxlList`（35 栋）：实测教师空教室资源域只覆盖 6 栋
    /// （1号/2号/3号/5号/7号/工1），另外 29 栋在该接口里**永远不会有结果**，
    /// 提供给用户即等于「明知缺席」。
    async fn fetch_teacher_classroom_buildings(
        &self,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let context = self.resolve_schedule_context(None).await;
        let semester = context
            .get("semester")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                crate::semester_catalog::semester_by_date(chrono::Local::now().date_naive())
            });

        let catalog = match self.teacher_classroom_catalog().await {
            Ok(catalog) => catalog,
            Err(TeacherClassroomError::NeedLogin) => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "会话已过期，请重新登录",
                    "need_login": true
                }))
            }
            Err(TeacherClassroomError::Unauthorized) => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "没有访问空教室接口的权限",
                    "availability": ClassroomAvailability::Unauthorized.as_str()
                }))
            }
            Err(TeacherClassroomError::BadResponse(msg)) => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": format!("教务接口响应异常：{msg}"),
                    "availability": ClassroomAvailability::BadResponse.as_str()
                }))
            }
            Err(TeacherClassroomError::Transport(msg)) => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": format!("请求失败：{msg}"),
                    "availability": ClassroomAvailability::BadResponse.as_str()
                }))
            }
        };

        if catalog.candidates.is_empty() {
            // 解析成功但没有任何可查询楼栋：如实报错，**不回退**静态列表（#1063 验收）。
            return Ok(serde_json::json!({
                "success": false,
                "error": "未从教务返回中解析到任何教学楼，暂无法提供筛选",
                "availability": ClassroomAvailability::Unknown.as_str()
            }));
        }

        let mut data = vec![serde_json::json!({"code": "", "name": "全部教学楼", "campus": ""})];
        for candidate in &catalog.candidates {
            data.push(serde_json::json!({
                "code": candidate.id,
                "name": candidate.name,
                "campus": candidate.campus
            }));
        }

        // 真实周次字典（best-effort）：前端据此只渲染可选周次
        let weeks = self.teacher_classroom_weeks(&semester).await;

        Ok(serde_json::json!({
            "success": true,
            "data": data,
            "meta": {
                "semester": semester,
                "resource_total": catalog.total,
                "weeks": weeks,
                "source": "teacher_resource_domain",
                "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                // 该列表是「教室资源目录」的楼栋维度，**不代表任何时段空闲**
                "availability": ClassroomAvailability::ResourceCatalog.as_str()
            }
        }))
    }

    /// 本学期真实周次字典（`getZcByXnxq`）。
    ///
    /// 供前端**只渲染真实可选**的周次，避免用户选中越界周次后被服务端静默忽略。
    /// 实测字典含 `0`（预备周），而 `zcStr=0` 会被服务端当作「不过滤」，
    /// 因此这里把 `0` 过滤掉，不提供给用户。失败返回空数组（前端回退到本地范围）。
    async fn teacher_classroom_weeks(&self, semester: &str) -> Vec<i64> {
        let params = vec![("xnxq", semester.to_string())];
        let Ok((status, final_url, body)) = self
            .teacher_classroom_post(
                teacher_readonly::PATH_CLASSROOM_WEEKS,
                &self.teacher_classroom_referer(),
                &params,
            )
            .await
        else {
            return Vec::new();
        };
        if !status_is_success(status) || looks_like_academic_login_url(&final_url) {
            return Vec::new();
        }
        serde_json::from_str::<serde_json::Value>(&body)
            .map(|value| {
                parse_week_dictionary(&value)
                    .into_iter()
                    // 预备周 0 会被服务端当「不过滤」，不提供给用户
                    .filter(|w| is_selectable_week(*w))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 学生空教室教学楼（沿用既有 `queryForXsd` 页面解析 + 内置兜底，学生行为不变）。
    async fn fetch_student_classroom_buildings(
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

    /// 按条件查空教室
    ///
    /// 师生共用同一 UI（`ClassroomView`），但按**真实会话角色**分派：
    /// - 学生：`POST /admin/pkgl/jyjs/mobile/jsxx`（按周次/星期/节次/教学楼筛选）
    /// - 教师：`POST /admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid`
    ///   （recon 09 实测支持 `zcStr/xqStr/jcStr/type/xnxq/jxldm`，见
    ///   [`HbutClient::fetch_teacher_classrooms_query`]）
    pub async fn fetch_classrooms_query(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        building: Option<String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let is_teacher = self
            .user_info
            .as_ref()
            .map(|user| user.role.is_teacher())
            .unwrap_or(false);
        if is_teacher {
            return self
                .fetch_teacher_classrooms_query(week, weekday, periods, building)
                .await;
        }

        let classrooms_url = format!(
            "{}{}",
            self.academic_base_url(),
            STUDENT_CLASSROOM_QUERY_PATH
        );

        // 统一使用“自动学期上下文”（支持假期沿用上学期/临开学切下学期）。
        let now = chrono::Local::now();
        let context = self.resolve_schedule_context(None).await;
        let semester = context
            .get("semester")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| crate::semester_catalog::semester_by_date(now.date_naive()));
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
        // - 若未传入：按当前时段自动选择「本时段剩余节次」（依据学校真实节次时间表）
        let auto_periods = auto_periods_now;

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
                    // #1063：**不再**用 `jyzt` 推断占用状态。
                    // 实测 `jyzt` 在教室资源目录里恒为 "1"（属「能否借用」类资源属性，
                    // 不是逐时段占用证据）；旧实现会把它解读成「可用/已占用」，
                    // 既无证据又会让所有结果落到同一个分支。
                    // 学生链路走的是**按周次/星期/节次筛选**的空教室查询，
                    // 返回集合本身就是服务端筛出的结果，因此统一标注为「空闲」。
                    "status": "空闲"
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

    /// 教师空教室查询（`POST /admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid`）。
    ///
    /// 依据 `data/teacher-api-recon/09-classroom-teacher-probe-2026-10-16.md`（2026-10-16 实测）：
    ///
    /// 1. 学校 `toZyKjsPage` 页面自身以 `mtype:"post"` + jqGrid `postData` 调用本接口；
    ///    表单字段 `xnxq / zcStr / xqStr / jcStr / type / jxldm` 就是**时间维度筛选**。
    ///    实测「第 7 周 / 周一 / 9-11 节 / 3 号」返回 **25 间**（不是 0）。
    /// 2. ⚠️ 非法 `zcStr`（`abc` / `7-8` / 越界 `30`）会被服务端**静默忽略并返回全量资源目录**
    ///    （实测 191 条），与「该时段全校空闲」无法区分。因此本实现：
    ///    - 先用 `getXqrqxx(xnxq, week)` **校验周次**（实测合法周返回 `ret=0` + 7 天日期，
    ///      越界周返回 `200 + ret=-1 "数据错误"`，非数字返回 500），并顺带取得该周日期；
    ///    - 用纯函数 [`format_periods_csv`] / [`validate_weekday`] 严格校验节次与星期；
    ///    - 另取一次**无筛选**条数作为基线，若筛选后 `total` 与基线相同，
    ///      判为 [`ClassroomAvailability::Unknown`] —— **不宣称空闲**。
    /// 3. 绝不硬编码 `status: "可用"`：可用性只由「服务端确实按时间筛选」证明，
    ///    并以 `meta.availability` 单点暴露给前端（见 [`ClassroomAvailability`]）。
    async fn fetch_teacher_classrooms_query(
        &self,
        week: Option<i32>,
        weekday: Option<i32>,
        periods: Option<Vec<i32>>,
        building: Option<String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let path = classroom_query_path_for_role(true);
        if !teacher_readonly::is_teacher_readonly_path(path)
            || !teacher_readonly::is_teacher_query_post_allowed(path)
        {
            return Err(format!("教师只读路径未登记或不允许 POST，已拒绝调用: {path}").into());
        }

        let context = self.resolve_schedule_context(None).await;
        let semester = context
            .get("semester")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                crate::semester_catalog::semester_by_date(chrono::Local::now().date_naive())
            });

        // ── 参数校验（fail-closed：非法输入一律明确报错，绝不透传给服务端）──
        let week = week
            .filter(|w| *w > 0)
            .or_else(|| {
                context
                    .get("current_week")
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32)
                    .filter(|v| *v > 0)
            })
            .unwrap_or(1);
        let weekday = weekday
            .filter(|d| validate_weekday(*d))
            .or_else(|| {
                context
                    .get("current_weekday")
                    .and_then(|v| v.as_i64())
                    .map(|v| v as i32)
                    .filter(|d| validate_weekday(*d))
            })
            .unwrap_or_else(|| chrono::Local::now().weekday().num_days_from_monday() as i32 + 1);

        let periods_vec = match periods.filter(|p| !p.is_empty()) {
            Some(list) => list,
            None => auto_periods_now(),
        };
        let periods_csv = match format_periods_csv(&periods_vec) {
            Some(csv) => csv,
            None => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error_code": "invalid_periods",
                    "error": "节次参数无效（应为 1..=11 的小节号）"
                }))
            }
        };
        // 校验通过后按服务端要求排序去重，保证 meta 与实际发送一致
        let periods_vec: Vec<i32> = periods_csv
            .split(',')
            .filter_map(|s| s.parse::<i32>().ok())
            .collect();

        // ── 1) 周次校验 + 该周 7 天日期（一次请求同时完成两件事）──
        let (date_iso, date_str, date_source) =
            match self.teacher_classroom_week_dates(&semester, week).await {
                TeacherWeekDates::Ok(dates) => match dates.iter().find(|d| d.weekday == weekday) {
                    Some(day) => {
                        match resolve_date_from_week_day(&semester, week, weekday, &day.raw_date) {
                            Some((iso, cn)) => (iso, cn, "server_week_dates"),
                            None => (String::new(), String::new(), "unavailable"),
                        }
                    }
                    None => (String::new(), String::new(), "unavailable"),
                },
                TeacherWeekDates::InvalidWeek => {
                    // 越界周次若被透传，服务端会静默返回全量资源目录（实测）→ 必须拦在这里。
                    return Ok(serde_json::json!({
                        "success": false,
                        "error_code": "invalid_week",
                        "error": format!("第 {} 周不在本学期校历范围内，请重新选择周次", week)
                    }));
                }
                // 取日期失败不阻塞查询：周次合法性由基线比对兜底（见 classify_availability）。
                TeacherWeekDates::Transport(reason) => {
                    println!("[调试] 教师空教室取周日期失败（不阻断查询）: {}", reason);
                    (String::new(), String::new(), "unavailable")
                }
            };

        // ── 2) 教学楼：id 直通；别名（3教/3号/3号楼）走同资源域唯一匹配 ──
        let mut building_id = String::new();
        if let Some(raw) = building.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            match self.resolve_teacher_building_id(raw).await {
                Ok(id) => building_id = id,
                Err(message) => {
                    return Ok(serde_json::json!({
                        "success": false,
                        "error_code": "invalid_building",
                        "error": message
                    }))
                }
            }
        }

        // ── 3) 无筛选基线（识别「筛选被服务端静默忽略」）──
        let baseline_total = self.teacher_classroom_baseline_total().await;

        // ── 4) 带时间维度筛选的真实查询 ──
        let mut params: Vec<(&str, String)> = vec![
            ("queryFields", TEACHER_CLASSROOM_QUERY_FIELDS.to_string()),
            ("page.pn", "1".to_string()),
            ("page.size", "500".to_string()),
            ("sort", "jsbh".to_string()),
            ("order", "asc".to_string()),
            ("xnxq", semester.clone()),
            ("zcStr", week.to_string()),
            ("xqStr", weekday.to_string()),
            ("jcStr", periods_csv.clone()),
            ("jcbmStr", periods_csv.clone()),
            ("type", "1".to_string()),
        ];
        if !building_id.is_empty() {
            params.push(("jxldm", building_id.clone()));
        }

        let (status, final_url, body) = self
            .teacher_classroom_post(path, &self.teacher_classroom_referer(), &params)
            .await?;

        if looks_like_academic_login_url(&final_url) {
            return Ok(serde_json::json!({
                "success": false,
                "error": "会话已过期，请重新登录",
                "need_login": true
            }));
        }
        if status == 401 {
            // 401 语义为「无该接口权限」（recon 03 §0 错误形态 2），不是会话过期；
            // 明确报错而非伪装成可重登恢复。
            return Ok(serde_json::json!({
                "success": false,
                "error": "没有访问空教室接口的权限",
                "availability": ClassroomAvailability::Unauthorized.as_str()
            }));
        }
        if !status_is_success(status) {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("请求失败: HTTP {}", status),
                "availability": ClassroomAvailability::BadResponse.as_str()
            }));
        }

        let page = match parse_jqgrid_page(&body) {
            JqGridParse::Ok(page) => page,
            JqGridParse::NotJson => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "教务接口返回错误页面，请稍后重试",
                    "availability": ClassroomAvailability::BadResponse.as_str()
                }))
            }
            JqGridParse::MissingEnvelope => {
                return Ok(serde_json::json!({
                    "success": false,
                    "error": "教务接口响应结构异常",
                    "availability": ClassroomAvailability::BadResponse.as_str()
                }))
            }
        };
        if page.ret != 0 {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("空教室接口返回 ret={} msg={}", page.ret, page.msg),
                "availability": ClassroomAvailability::BadResponse.as_str()
            }));
        }

        // 走到这里说明 zcStr/xqStr/jcStr 均已严格校验并真实发送
        let filters_applied = true;
        let availability = classify_availability(&page, filters_applied, baseline_total);

        // ⚠️ 不再写死 `status: "可用"`：逐房可用性由 meta.availability 统一表达。
        let classrooms: Vec<serde_json::Value> = page
            .results
            .iter()
            .map(|room| {
                serde_json::json!({
                    "id": room.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                    "name": room.get("jsmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "code": room.get("jsbh").and_then(|v| v.as_str()).unwrap_or(""),
                    "building": room.get("jxlmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "campus": room.get("xqmc").and_then(|v| v.as_str()).unwrap_or(""),
                    "seats": room.get("zdskrnrs").and_then(|v| v.as_i64()).unwrap_or(0),
                    "floor": room.get("szlc").and_then(|v| v.as_str()).unwrap_or(""),
                    "type": room.get("jslx").and_then(|v| v.as_str()).unwrap_or(""),
                    "department": room.get("jsglbmbmc")
                        .or_else(|| room.get("jsglbmmc"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(""),
                })
            })
            .collect();

        let weekday_names = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        let weekday_name = weekday_names.get(weekday as usize).unwrap_or(&"");
        let loaded = classrooms.len();
        let truncated = (loaded as i64) < page.total;

        Ok(serde_json::json!({
            "success": true,
            "data": classrooms,
            "meta": {
                "semester": semester,
                "date_str": date_str,
                "date_iso": date_iso,
                "date_source": date_source,
                "week": week,
                "weekday": weekday,
                "weekday_name": weekday_name,
                "periods": periods_vec,
                "periods_str": format_periods_label(&periods_vec),
                "total": page.total,
                "loaded": loaded,
                "truncated": truncated,
                "resource_total": baseline_total,
                "query_time": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                "filter_mode": "teacher_period_query",
                "filters_applied": filters_applied,
                // 只有服务端**确实生效**才为 true（#1062 契约）：
                // filters_applied = 我们发送了经校验的筛选参数；filters_verified = 服务端确实按它过滤。
                "filters_verified": availability.is_period_verified(),
                "availability": availability.as_str(),
                "building_filter": building_id,
                "page": page.page,
                "total_pages": page.total_pages,
            },
            "sync_time": chrono::Local::now().to_rfc3339()
        }))
    }

    /// 教师端**查询型 POST**（仅 allowlist 内路径，fail-closed）。
    ///
    /// 返回 `(HTTP 状态码, 最终 URL, 响应体)`；`final_url` 用于识别登录页跳转。
    async fn teacher_classroom_post(
        &self,
        path: &str,
        referer: &str,
        params: &[(&str, String)],
    ) -> Result<(u16, String, String), Box<dyn std::error::Error + Send + Sync>> {
        if !teacher_readonly::is_teacher_readonly_path(path)
            || !teacher_readonly::is_teacher_query_post_allowed(path)
        {
            return Err(format!("教师查询 POST 路径未登记，已拒绝调用: {path}").into());
        }
        let url = format!("{}{}", self.academic_base_url(), path);
        let response = self
            .client
            .post(&url)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header(
                "Content-Type",
                "application/x-www-form-urlencoded; charset=UTF-8",
            )
            .header("Referer", referer)
            .form(params)
            .send()
            .await?;
        let status = response.status().as_u16();
        let final_url = response.url().to_string();
        let body = response.text().await.unwrap_or_default();
        Ok((status, final_url, body))
    }

    /// 空教室来源页（作为查询请求的 `Referer`，与学校页面行为一致）。
    fn teacher_classroom_referer(&self) -> String {
        format!(
            "{}{}",
            self.academic_base_url(),
            teacher_readonly::PATH_FREE_CLASSROOMS_PAGE
        )
    }

    /// 无筛选资源目录条数（基线）。失败返回 `None`（不阻断查询，只是失去「筛选被忽略」的判据）。
    async fn teacher_classroom_baseline_total(&self) -> Option<i64> {
        let params = vec![
            ("queryFields", TEACHER_CLASSROOM_QUERY_FIELDS.to_string()),
            ("page.pn", "1".to_string()),
            ("page.size", "1".to_string()),
        ];
        let (status, final_url, body) = self
            .teacher_classroom_post(
                teacher_readonly::PATH_FREE_CLASSROOMS,
                &self.teacher_classroom_referer(),
                &params,
            )
            .await
            .ok()?;
        if !status_is_success(status) || looks_like_academic_login_url(&final_url) {
            return None;
        }
        match parse_jqgrid_page(&body) {
            JqGridParse::Ok(page) if page.ret == 0 && page.total > 0 => Some(page.total),
            _ => None,
        }
    }

    /// 教师空教室**资源目录**（不筛选）：用于楼栋别名解析与楼栋候选导出。
    async fn teacher_classroom_catalog(
        &self,
    ) -> Result<TeacherClassroomCatalog, TeacherClassroomError> {
        let params = vec![
            ("queryFields", TEACHER_CLASSROOM_QUERY_FIELDS.to_string()),
            ("page.pn", "1".to_string()),
            ("page.size", "500".to_string()),
            ("sort", "jsbh".to_string()),
            ("order", "asc".to_string()),
        ];
        let (status, final_url, body) = self
            .teacher_classroom_post(
                teacher_readonly::PATH_FREE_CLASSROOMS,
                &self.teacher_classroom_referer(),
                &params,
            )
            .await
            .map_err(|e| TeacherClassroomError::Transport(e.to_string()))?;

        if looks_like_academic_login_url(&final_url) {
            return Err(TeacherClassroomError::NeedLogin);
        }
        if status == 401 {
            return Err(TeacherClassroomError::Unauthorized);
        }
        if !status_is_success(status) {
            return Err(TeacherClassroomError::Transport(format!("HTTP {status}")));
        }
        match parse_jqgrid_page(&body) {
            JqGridParse::Ok(page) if page.ret == 0 => Ok(TeacherClassroomCatalog {
                candidates: derive_building_candidates(&page.results),
                total: page.total,
            }),
            JqGridParse::Ok(page) => Err(TeacherClassroomError::BadResponse(format!(
                "ret={} msg={}",
                page.ret, page.msg
            ))),
            JqGridParse::NotJson => Err(TeacherClassroomError::BadResponse(
                "教务接口返回错误页面".to_string(),
            )),
            JqGridParse::MissingEnvelope => Err(TeacherClassroomError::BadResponse(
                "教务接口响应结构异常".to_string(),
            )),
        }
    }

    /// 解析教师端教学楼筛选值。
    ///
    /// - 形如 `24` / `bqtyndl` 的 **id 直通**（前端从教师资源域候选中选择的就是 id）；
    /// - 形如 `3教` / `3号` / `3号楼` 的**别名**：在同资源域候选内做唯一匹配，
    ///   命中多个（同名楼栋）或未命中一律明确报错，**不回退到学生路径、也不猜**。
    async fn resolve_teacher_building_id(&self, raw: &str) -> Result<String, String> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Ok(String::new());
        }
        let looks_like_id = trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
        if looks_like_id {
            return Ok(trimmed.to_string());
        }
        let catalog = self
            .teacher_classroom_catalog()
            .await
            .map_err(|e| e.to_user_message())?;
        match match_building_alias(trimmed, &catalog.candidates) {
            BuildingMatch::Unique(id) => Ok(id),
            BuildingMatch::Ambiguous => Err(format!(
                "教学楼「{trimmed}」在您的可查询范围内有多个同名楼栋，无法确定"
            )),
            BuildingMatch::NotFound => Err(format!("教学楼「{trimmed}」不在您的可查询范围内")),
        }
    }

    /// 某周的 7 天日期（同时充当周次合法性校验器）。
    async fn teacher_classroom_week_dates(&self, semester: &str, week: i32) -> TeacherWeekDates {
        let params = vec![("xnxq", semester.to_string()), ("zcStr", week.to_string())];
        let (status, final_url, body) = match self
            .teacher_classroom_post(
                teacher_readonly::PATH_CLASSROOM_WEEK_DATES,
                &self.teacher_classroom_referer(),
                &params,
            )
            .await
        {
            Ok(v) => v,
            Err(e) => return TeacherWeekDates::Transport(e.to_string()),
        };
        if looks_like_academic_login_url(&final_url) {
            return TeacherWeekDates::Transport("会话已过期".to_string());
        }
        if !status_is_success(status) {
            return TeacherWeekDates::Transport(format!("HTTP {status}"));
        }
        match serde_json::from_str::<serde_json::Value>(&body) {
            Ok(value) => {
                let ret = value.get("ret").and_then(|v| v.as_i64()).unwrap_or(0);
                let dates = parse_week_dates(&value);
                if ret != 0 || dates.len() < 7 {
                    // 实测越界周次 → 200 + ret=-1 "数据错误"
                    TeacherWeekDates::InvalidWeek
                } else {
                    TeacherWeekDates::Ok(dates)
                }
            }
            Err(_) => TeacherWeekDates::Transport("响应不是 JSON".to_string()),
        }
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

#[cfg(test)]
mod classroom_role_tests {
    use super::*;

    #[test]
    fn classroom_path_switches_by_role() {
        assert_eq!(
            classroom_query_path_for_role(true),
            teacher_readonly::PATH_FREE_CLASSROOMS
        );
        assert_eq!(
            classroom_query_path_for_role(false),
            STUDENT_CLASSROOM_QUERY_PATH
        );
        assert_ne!(
            classroom_query_path_for_role(true),
            classroom_query_path_for_role(false)
        );
        assert!(teacher_readonly::is_teacher_readonly_path(
            classroom_query_path_for_role(true)
        ));
        assert!(!teacher_readonly::path_has_write_verb(
            classroom_query_path_for_role(true)
        ));
        // 教师空教室必须走已登记的**纯查询 POST**（学校页面真实形态）
        assert!(teacher_readonly::is_teacher_query_post_allowed(
            classroom_query_path_for_role(true)
        ));
        // 学生路径不得被教师 allowlist 认领，避免师生链路互相串用
        assert!(!teacher_readonly::is_teacher_query_post_allowed(
            STUDENT_CLASSROOM_QUERY_PATH
        ));
    }

    #[test]
    fn real_period_table_matches_school_measured_values() {
        // 09 号报告 §4.4 实测：第1节 8:20-9:05、第9节 18:30-19:15（旧硬编码 08:00/19:00 是错的）
        assert_eq!(REAL_PERIOD_TABLE.len(), 11);
        let first = &REAL_PERIOD_TABLE[0];
        assert_eq!(
            (
                first.period,
                first.start,
                first.end,
                first.block,
                first.daypart
            ),
            (1, (8, 20), (9, 5), 1, "上午")
        );
        let evening = &REAL_PERIOD_TABLE[8];
        assert_eq!(
            (
                evening.period,
                evening.start,
                evening.end,
                evening.block,
                evening.daypart
            ),
            (9, (18, 30), (19, 15), 5, "晚上")
        );
        let last = &REAL_PERIOD_TABLE[10];
        assert_eq!(
            (last.period, last.start, last.end, last.block, last.daypart),
            (11, (20, 10), (20, 55), 6, "晚上")
        );
        // 大节号必须是 ceil(jc/2) 的学校口径（1,1,2,2,3,3,4,4,5,5,6）
        let blocks: Vec<i32> = REAL_PERIOD_TABLE.iter().map(|item| item.block).collect();
        assert_eq!(blocks, vec![1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
    }

    #[test]
    fn auto_periods_returns_same_daypart_block_only() {
        // 无论当前时刻如何，自动节次必须是「单一时段内的连续小节」
        let periods = auto_periods_now();
        assert!(!periods.is_empty());
        assert!(periods.iter().all(|p| (1..=11).contains(p)));
        let dayparts: Vec<&str> = periods
            .iter()
            .map(|p| REAL_PERIOD_TABLE[(*p - 1) as usize].daypart)
            .collect();
        assert!(
            dayparts.windows(2).all(|w| w[0] == w[1]),
            "自动节次跨越了时段边界: {periods:?}"
        );
    }

    #[test]
    fn periods_label_groups_by_school_block_and_uses_real_times() {
        // 9/10 属大节 5，11 属大节 6 → 必须分成两段，且时间取学校实测值
        // （第9-10节跨越 18:30~20:05；第11节 20:10~20:55）
        assert_eq!(
            format_periods_label(&[9, 10, 11]),
            "第9-10节 18:30-20:05、第11节 20:10-20:55"
        );
        // 同大节内的小节合并为一段
        assert_eq!(format_periods_label(&[1, 2]), "第1-2节 08:20-09:55");
        assert_eq!(format_periods_label(&[5]), "第5节 14:00-14:45");
        assert_eq!(format_periods_label(&[3, 4]), "第3-4节 10:15-11:50");
        // 乱序与重复输入不影响结果
        assert_eq!(format_periods_label(&[2, 1, 1]), "第1-2节 08:20-09:55");
        // 空输入 / 未知节次不得 panic
        assert_eq!(format_periods_label(&[]), "");
        assert_eq!(format_periods_label(&[99]), "");
    }
}
