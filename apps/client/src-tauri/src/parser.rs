//! 页面解析与数据清洗模块。
//!
//! 负责：
//! - 从 HTML/JSON 中提取成绩、课表、考试等结构化数据
//! - 兼容教务系统字段不一致的问题
//! - 处理时间/周次等格式转换

use chrono::Datelike;
use scraper::{Html, Selector};
use serde_json::Value;

use crate::{Classroom, Exam, Grade, Ranking, ScheduleCourse, UserInfo};

pub fn parse_user_info(html: &str) -> Result<UserInfo, Box<dyn std::error::Error + Send + Sync>> {
    let document = Html::parse_document(html);

    // 尝试多种方式提取用户信息
    let mut student_id = String::new();
    let mut student_name = String::new();
    let mut college = None;
    let mut major = None;
    let mut class_name = None;
    let mut grade = None;

    // 优先匹配新版页面结构（xskp）
    let extract_field = |label: &str| -> Option<String> {
        let label_escaped = regex::escape(label);
        let pattern = format!(
            r#"(?s){}\s*[:：]?\s*</label>\s*</div>\s*<div class=\"item-content\">\s*(?:<label[^>]*>)?([^<★]+)"#,
            label_escaped
        );
        if let Ok(re) = regex::Regex::new(&pattern) {
            if let Some(cap) = re.captures(html) {
                let value = cap
                    .get(1)
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default();
                if !value.is_empty() && value != "★★★★" {
                    return Some(value);
                }
            }
        }
        None
    };

    if student_id.is_empty() {
        if let Some(v) = extract_field("学号") {
            student_id = v;
        }
    }

    if student_name.is_empty() {
        if let Some(v) = extract_field("姓名") {
            student_name = v;
        }
    }

    if college.is_none() {
        college = extract_field("院系信息");
    }

    if major.is_none() {
        major = extract_field("专业信息");
    }

    if class_name.is_none() {
        class_name = extract_field("班级信息");
    }

    if grade.is_none() {
        grade = extract_field("所在年级");
    }

    // 尝试从表单中提取
    if let Ok(selector) = Selector::parse("input[id='xh']") {
        if let Some(el) = document.select(&selector).next() {
            student_id = el.value().attr("value").unwrap_or("").to_string();
        }
    }

    if let Ok(selector) = Selector::parse("input[id='xm']") {
        if let Some(el) = document.select(&selector).next() {
            student_name = el.value().attr("value").unwrap_or("").to_string();
        }
    }

    // 如果表单中没有，尝试从 HTML 文本中提取
    if student_id.is_empty() || student_name.is_empty() {
        let re = regex::Regex::new(r"学号[：:]\s*(\d+)").unwrap();
        if let Some(cap) = re.captures(html) {
            student_id = cap
                .get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
        }

        let re = regex::Regex::new(r"姓名[：:]\s*([^\s<]+)").unwrap();
        if let Some(cap) = re.captures(html) {
            student_name = cap
                .get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
        }
    }

    // 提取学院
    let re = regex::Regex::new(r"学院[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        college = Some(
            cap.get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
        );
    }

    // 提取专业
    let re = regex::Regex::new(r"专业[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        major = Some(
            cap.get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
        );
    }

    // 提取班级
    let re = regex::Regex::new(r"班级[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        class_name = Some(
            cap.get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
        );
    }

    // 提取年级
    let re = regex::Regex::new(r"年级[：:]\s*(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        grade = Some(
            cap.get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
        );
    }

    if student_id.is_empty() && student_name.is_empty() {
        return Err("无法解析用户信息，可能会话已过期".into());
    }

    Ok(UserInfo {
        student_id,
        student_name,
        college,
        major,
        class_name,
        grade,
        // 该解析器只处理学生学籍页；教师身份走教务首页识别。
        ..Default::default()
    })
}

/// 解析成绩数据
pub fn parse_grades(json: &Value) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
    let mut grades = Vec::new();

    // 新版 API 格式: {"ret": 0, "msg": "ok", "results": [...], "total": n}
    let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
        // 检查 API 返回状态
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");

        println!(
            "[调试] Grades API ret={}, msg={}, results count={}",
            ret,
            msg,
            results.len()
        );

        if ret != 0 {
            return Err(format!("成绩 API 返回错误: ret={}, msg={}", ret, msg).into());
        }

        results.clone()
    } else if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        // 旧版 API 格式: {"items": [...]}
        items.clone()
    } else {
        println!(
            "[调试] 未知 grades JSON format. Keys: {:?}",
            json.as_object().map(|o| o.keys().collect::<Vec<_>>())
        );
        return Err("成绩数据格式不正确".into());
    };

    for item in &items {
        // 学期 - 新版格式使用 xnxq，旧版格式使用 xnmmc + xqmmc
        let term = if let Some(xnxq) = item.get("xnxq").and_then(|v| v.as_str()) {
            xnxq.to_string()
        } else {
            format!(
                "{}-{}",
                item.get("xnmmc").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("xqmmc").and_then(|v| v.as_str()).unwrap_or("")
            )
        };

        // 学分
        let course_credit = extract_number_field(item, &["xf"]);

        // 成绩 - 新版使用 zhcj（综合成绩），旧版使用 cj
        let final_score = if let Some(v) = item.get("zhcj") {
            value_to_string(v)
        } else {
            extract_number_field(item, &["cj"])
        };

        // 获得学分 - 新版使用 hdxf，旧版使用 jd
        let earned_credit = extract_number_field(item, &["hdxf", "jd"]);

        // 课程名称 - 可能包含前缀 [xxx]
        let mut course_name = item
            .get("kcmc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if let Some(idx) = course_name.find(']') {
            course_name = course_name[idx + 1..].to_string();
        }

        // 课程性质 - 新版使用 kcxz（代码），旧版使用 kcxzmc（文本）
        let course_nature_code = item
            .get("kcxz")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let course_nature = if course_nature_code.is_empty() {
            item.get("kcxzmc")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            course_nature_code.clone()
        };

        // 教师 - 新版使用 cjlrjsxm，旧版使用 jsxm
        let teacher = item
            .get("cjlrjsxm")
            .or_else(|| item.get("jsxm"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        // 课程号 - 可能教务系统不返回
        let grade_id = item
            .get("id")
            .and_then(|v| match v {
                Value::String(s) => Some(s.trim().to_string()),
                Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .filter(|s| !s.is_empty());

        let course_code = item
            .get("kch")
            .or_else(|| item.get("kcbh"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        // 课程编号 (kcbh)，用于关联已选课程数据
        let kcbh = item
            .get("kcbh")
            .or_else(|| item.get("kch"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        // 学分绩点
        let xfjd = extract_number_field(item, &["xfjd", "fxcj"]);
        // 关键状态字段：补考/缓考/成绩标记
        let sfbk = item
            .get("sfbk")
            .map(value_to_string)
            .unwrap_or_else(String::new);
        let sfsq = item
            .get("sfsq")
            .map(value_to_string)
            .unwrap_or_else(String::new);
        let cjbj = item
            .get("cjbj")
            .map(value_to_string)
            .unwrap_or_else(String::new);

        let grade = Grade {
            term,
            course_name,
            grade_id,
            course_code,
            course_nature,
            course_nature_code,
            course_credit,
            final_score,
            earned_credit,
            xfjd,
            sfbk,
            sfsq,
            cjbj,
            teacher,
            kcbh,
            course_teacher: None,
        };
        grades.push(grade);
    }

    println!("[调试] 已解析 {} grades", grades.len());
    Ok(grades)
}

// 辅助函数：提取数字字段（可能是字符串或数字）
fn extract_number_field(item: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(v) = item.get(*key) {
            return value_to_string(v);
        }
    }
    "0".to_string()
}

// 辅助函数：将 JSON 值转换为字符串
fn value_to_string(v: &Value) -> String {
    if let Some(s) = v.as_str() {
        s.to_string()
    } else if let Some(n) = v.as_f64() {
        n.to_string()
    } else if let Some(n) = v.as_i64() {
        n.to_string()
    } else {
        "".to_string()
    }
}

/// 解析课表数据
pub fn parse_schedule(
    json: &Value,
) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
    let mut courses = Vec::new();

    // 新版 API 格式: {"ret": 0, "msg": "ok", "data": [...]}
    let items = if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");

        println!(
            "[调试] Schedule API ret={}, msg={}, data count={}",
            ret,
            msg,
            data.len()
        );

        if ret != 0 {
            return Err(format!("课表 API 返回错误: ret={}, msg={}", ret, msg).into());
        }

        data.clone()
    } else if let Some(kb_list) = json.get("kbList").and_then(|v| v.as_array()) {
        // 旧版 API 格式
        kb_list.clone()
    } else {
        println!(
            "[调试] 未知 schedule JSON format. Keys: {:?}",
            json.as_object().map(|o| o.keys().collect::<Vec<_>>())
        );
        return Err("课表数据格式不正确".into());
    };

    let current_week = infer_current_week(json, &items);

    for item in &items {
        // 课程名称 - 新版可能包含 HTML 标签
        let raw_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("");
        let name = extract_text_from_html(raw_name);

        // 教师 - 新版使用 tmc，旧版使用 xm
        let raw_teacher = item
            .get("tmc")
            .or_else(|| item.get("xm"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let teacher = extract_text_from_html(raw_teacher);

        // 教室 - 新版使用 croommc，旧版使用 cdmc
        let raw_room = item
            .get("croommc")
            .or_else(|| item.get("cdmc"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let room = extract_text_from_html(raw_room);

        // 星期几 - 新版使用 xingqi，旧版使用 xqj
        let weekday = item
            .get("xingqi")
            .or_else(|| item.get("xqj"))
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32;

        // 节次 - 新版使用 djc，旧版使用 jcs
        let period = item.get("djc").and_then(|v| v.as_i64()).unwrap_or(1) as i32;

        // 连续节数 - 新版使用 djs
        let djs = item.get("djs").and_then(|v| v.as_i64()).unwrap_or(1) as i32;

        // 周次 - 新版使用 zcstr 或 zc，旧版使用 zcd
        let weeks_str = item
            .get("zcstr")
            .or_else(|| item.get("zc"))
            .or_else(|| item.get("zcd"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let weeks = parse_weeks(weeks_str);

        let weeks_text = item
            .get("zc")
            .or_else(|| item.get("zcstr"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let room_code = item
            .get("croombh")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let building = item
            .get("jxlmc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let credit = item
            .get("xf")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let class_name = item
            .get("jxbzc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let course = ScheduleCourse {
            id: item
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            name,
            teacher,
            room,
            room_code,
            building,
            weekday,
            period,
            djs,
            weeks,
            weeks_text,
            credit,
            class_name,
            // 学生链路不提供这两项，保持为空（教师端专属字段）。
            class_size: None,
            teach_type: None,
        };
        courses.push(course);
    }

    println!(
        "[调试] 已解析 {} courses for current week {}",
        courses.len(),
        current_week
    );
    Ok((courses, current_week))
}

/// 推断当前周次。
///
/// 旧版接口（`kbList`）自带 `zc` 时直接采用；否则按学期起始日推算
/// （新版接口不返回当前周次）。学生与教师两条链路共用。
fn infer_current_week(json: &Value, items: &[Value]) -> i32 {
    if json.get("kbList").and_then(|v| v.as_array()).is_some() {
        if let Some(week) = json.get("zc").and_then(|v| v.as_i64()) {
            return week as i32;
        }
    }

    let today = chrono::Local::now().date_naive();
    let parse_semester_start = |semester: &str| -> Option<chrono::NaiveDate> {
        let parts: Vec<&str> = semester.split('-').collect();
        if parts.len() != 3 {
            return None;
        }
        let start_year = parts[0].parse::<i32>().ok()?;
        let term = parts[2].parse::<u32>().ok()?;
        match term {
            1 => chrono::NaiveDate::from_ymd_opt(start_year, 9, 1),
            2 => chrono::NaiveDate::from_ymd_opt(start_year + 1, 3, 1),
            _ => None,
        }
    };

    let inferred_semester = json
        .get("xnxq")
        .and_then(|v| v.as_str())
        .or_else(|| {
            items
                .first()
                .and_then(|item| item.get("xnxq").and_then(|v| v.as_str()))
        })
        .unwrap_or("");

    let fallback_start = {
        let now = chrono::Local::now();
        let year = now.year();
        let month = now.month();
        if month >= 9 {
            chrono::NaiveDate::from_ymd_opt(year, 9, 1)
        } else if month >= 3 {
            chrono::NaiveDate::from_ymd_opt(year, 3, 1)
        } else {
            chrono::NaiveDate::from_ymd_opt(year - 1, 9, 1)
        }
    };

    let semester_start = parse_semester_start(inferred_semester)
        .or(fallback_start)
        .unwrap_or(today);
    let days = (today - semester_start).num_days();
    (days / 7 + 1).max(1).min(25) as i32
}

/// 解析教师课表（`/admin/pkgl/pkgljskb/getJskbByXqid`）。
///
/// 与 [`parse_schedule`] 的关键差异（不可混用，详见 `http_client::academic::teacher`）：
/// - 接口**按小节逐行返回**：同一门跨大节的课会出现多行（如大节 4 同时给出
///   `djc=7` 与 `djc=8`）。这里按
///   `课程 + 教学班 + 课程名 + 星期 + 周次 + 教室 + 周类型 + 大节`
///   聚合，取小节区间作为 `period` / `djs`，否则课表上会出现重复卡片。
/// - `djs` 是**大节号**（= `ceil(djc/2)`）而非连堂节数，因此只用它参与聚合键，
///   不直接当作连堂数使用。
pub fn parse_teacher_schedule(
    json: &Value,
) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
    let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
    let items = json
        .get("data")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if ret != 0 {
        return Err(format!(
            "教师课表 API 返回错误: ret={}, msg={}",
            ret,
            json.get("msg").and_then(|v| v.as_str()).unwrap_or("")
        )
        .into());
    }
    println!(
        "[调试] 教师课表 API ret={}, data count={}",
        ret,
        items.len()
    );

    let current_week = infer_current_week(json, &items);

    // 聚合键 → 已产出的课程下标
    let mut index: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut courses: Vec<ScheduleCourse> = Vec::new();

    for item in &items {
        let text = |key: &str| -> String {
            item.get(key)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };

        let name = extract_text_from_html(&text("kcmc"));
        if name.is_empty() {
            continue;
        }
        // 教师：新版 `tmc`，部分接口用 `zjsname`
        let teacher = {
            let raw = text("tmc");
            let raw = if raw.is_empty() { text("zjsname") } else { raw };
            extract_text_from_html(&raw)
        };
        let room = extract_text_from_html(&text("croommc"));
        let room_code = text("croombh");
        let building = text("jxlmc");
        let weekday = item.get("xingqi").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let small_section = item.get("djc").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
        let big_section = item.get("djs").and_then(|v| v.as_i64()).unwrap_or(0) as i32;

        // 周次：`zcstr` 是展开后的周次（"8,9,10,…"），优先使用；`zc` 是紧凑写法（"8-14"）。
        let zcstr = text("zcstr");
        let zc = text("zc");
        let weeks = parse_weeks(if zcstr.is_empty() { &zc } else { &zcstr });
        let weeks_text = if zc.is_empty() {
            zcstr.clone()
        } else {
            zc.clone()
        };

        let credit = text("xf");
        let class_name = extract_link_texts_joined(&text("jxbzc"));
        let class_size = {
            let primary = text("bjrs");
            if primary.is_empty() {
                text("jxbrs")
            } else {
                primary
            }
        };
        let teach_type = text("jslxmc");
        let zctype = text("zctype");
        let course_code = {
            let primary = text("kcbh");
            if primary.is_empty() {
                text("kcid")
            } else {
                primary
            }
        };
        let class_no = text("jxbbh");

        let key = format!(
            "{course_code}|{class_no}|{name}|{weekday}|{weeks_text}|{room_code}|{zctype}|{big_section}"
        );

        if let Some(&existing) = index.get(&key) {
            // 同一大节内的其他小节行：扩展现有小节区间，不新增卡片
            let course = &mut courses[existing];
            let old_min = course.period;
            let old_max = course.period + course.djs - 1;
            let new_min = old_min.min(small_section);
            let new_max = old_max.max(small_section);
            course.period = new_min;
            course.djs = new_max - new_min + 1;
            continue;
        }

        index.insert(key, courses.len());
        courses.push(ScheduleCourse {
            // `pkid` 是排课唯一 ID；`id` 在同一次查询内所有记录相同，不可作唯一键
            id: {
                let pkid = text("pkid");
                if pkid.is_empty() {
                    text("id")
                } else {
                    pkid
                }
            },
            name,
            teacher,
            room,
            room_code,
            building,
            weekday,
            period: small_section,
            djs: 1,
            weeks,
            weeks_text,
            credit,
            class_name,
            class_size: if class_size.is_empty() {
                None
            } else {
                Some(class_size)
            },
            teach_type: if teach_type.is_empty() {
                None
            } else {
                Some(teach_type)
            },
        });
    }

    println!(
        "[调试] 教师课表解析完成：{} 门（按大节去重合并后）",
        courses.len()
    );
    Ok((courses, current_week))
}

/// 提取 HTML 中**全部** `<a>` 链接文本，按出现顺序用 `,` 连接；无链接时退回 [`extract_text_from_html`]。
///
/// 教师课表的 `jxbzc`（教学班）是多班级列表：
/// `<a …>26建筑学1</a>,<a …>26建筑学2</a>` —— [`extract_text_from_html`] 只取第一个
/// 链接，会把第二个班级静默丢掉。
fn extract_link_texts_joined(html_str: &str) -> String {
    if html_str.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = regex::Regex::new(r">([^<]+)</a>")
        .ok()
        .map(|re| {
            re.captures_iter(html_str)
                .filter_map(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
                .filter(|text| !text.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if parts.is_empty() {
        return extract_text_from_html(html_str);
    }
    parts.join(",")
}

/// 从 HTML 标签中提取纯文本（与 Python 模块一致）
fn extract_text_from_html(html_str: &str) -> String {
    if html_str.is_empty() {
        return String::new();
    }
    // 尝试提取 <a>...</a> 标签中的文本
    if let Some(cap) = regex::Regex::new(r">([^<]+)</a>")
        .ok()
        .and_then(|re| re.captures(html_str))
    {
        if let Some(m) = cap.get(1) {
            return m.as_str().trim().to_string();
        }
    }
    // 去除所有 HTML 标签
    let re = regex::Regex::new(r"<[^>]+>").unwrap();
    re.replace_all(html_str, "").trim().to_string()
}

fn parse_weeks(weeks_str: &str) -> Vec<i32> {
    let mut weeks = Vec::new();

    // 检测单双周标记（半角+全角括号）
    let is_odd = weeks_str.contains("(单)") || weeks_str.contains("（单）");
    let is_even = weeks_str.contains("(双)") || weeks_str.contains("（双）");

    // 解析形如 "1-16周" 或 "1,3,5周" 的周次
    let clean_str = weeks_str
        .replace("周", "")
        .replace("(单)", "")
        .replace("（单）", "")
        .replace("(双)", "")
        .replace("（双）", "");

    for part in clean_str.split(',') {
        let part = part.trim();
        if part.contains('-') {
            let parts: Vec<&str> = part.split('-').collect();
            if parts.len() == 2 {
                if let (Ok(start), Ok(end)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
                    for w in start..=end {
                        weeks.push(w);
                    }
                }
            }
        } else if let Ok(w) = part.parse::<i32>() {
            weeks.push(w);
        }
    }

    // 单双周过滤
    if is_odd {
        weeks.retain(|w| w % 2 == 1);
    } else if is_even {
        weeks.retain(|w| w % 2 == 0);
    }

    weeks
}

pub fn parse_exams(json: &Value) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
    let mut exams = Vec::new();

    // 新版 API 格式: {"ret": 0, "msg": "ok", "results": [...]}
    let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");

        println!(
            "[调试] Exams API ret={}, msg={}, results count={}",
            ret,
            msg,
            results.len()
        );

        if ret != 0 {
            return Err(format!("考试 API 返回错误: ret={}, msg={}", ret, msg).into());
        }

        results.clone()
    } else if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        // 旧版 API 格式
        items.clone()
    } else {
        println!(
            "[调试] 未知 exams JSON format. Keys: {:?}",
            json.as_object().map(|o| o.keys().collect::<Vec<_>>())
        );
        return Ok(vec![]); // 考试数据可能为空，不报错
    };

    for item in &items {
        // 课程名称
        let course_name = item
            .get("kcmc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 考试日期
        let date = item
            .get("ksrq")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 考试时间
        let exam_time = item.get("kssj").and_then(|v| v.as_str()).unwrap_or("");
        let (start_time, end_time) = if exam_time.contains('-') {
            let parts: Vec<&str> = exam_time.split('-').collect();
            (
                parts.first().unwrap_or(&"").to_string(),
                parts.last().unwrap_or(&"").to_string(),
            )
        } else {
            (exam_time.to_string(), String::new())
        };

        // 考试地点 - 新版使用 jsmc 或 ksdd
        let location = item
            .get("jsmc")
            .or_else(|| item.get("ksdd"))
            .or_else(|| item.get("cdmc"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // 座位号
        let seat_number = item
            .get("zwh")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        // 地址
        let address = item
            .get("sddz")
            .or_else(|| item.get("kscddz"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let exam = Exam {
            course_name,
            date,
            start_time,
            end_time,
            location: if location.is_empty() {
                address
            } else {
                location
            },
            seat_number,
        };
        exams.push(exam);
    }

    println!("[调试] 已解析 {} exams", exams.len());
    Ok(exams)
}

pub fn parse_ranking(html: &str) -> Result<Ranking, Box<dyn std::error::Error + Send + Sync>> {
    // 解析 HTML 中的排名信息
    let mut ranking = Ranking {
        class_rank: 1,
        class_total: 30,
        major_rank: 1,
        major_total: 100,
        college_rank: 1,
        college_total: 500,
        gpa: 0.0,
        average_score: 0.0,
        total_credits: 0.0,
    };

    // 使用正则表达式提取排名数据
    let re = regex::Regex::new(r"班级排名[：:]\s*(\d+)/(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.class_rank = cap
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(1);
        ranking.class_total = cap
            .get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(30);
    }

    let re = regex::Regex::new(r"专业排名[：:]\s*(\d+)/(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.major_rank = cap
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(1);
        ranking.major_total = cap
            .get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(100);
    }

    let re = regex::Regex::new(r"学院排名[：:]\s*(\d+)/(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.college_rank = cap
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(1);
        ranking.college_total = cap
            .get(2)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(500);
    }

    let re = regex::Regex::new(r"绩点[：:]\s*([\d.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.gpa = cap
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0.0);
    }

    let re = regex::Regex::new(r"平均分[：:]\s*([\d.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.average_score = cap
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0.0);
    }

    let re = regex::Regex::new(r"总学分[：:]\s*([\d.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.total_credits = cap
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0.0);
    }

    Ok(ranking)
}

pub fn parse_classrooms(
    json: &Value,
) -> Result<Vec<Classroom>, Box<dyn std::error::Error + Send + Sync>> {
    let mut classrooms = Vec::new();

    if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let classroom = Classroom {
                name: item
                    .get("cdmc")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                building: item
                    .get("jxlmc")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                capacity: item.get("zws").and_then(|v| v.as_i64()).unwrap_or(50) as i32,
                status: item
                    .get("cdzt")
                    .and_then(|v| v.as_str())
                    .map(|s| if s == "0" { "available" } else { "occupied" })
                    .unwrap_or("available")
                    .to_string(),
            };
            classrooms.push(classroom);
        }
    }

    Ok(classrooms)
}

/// 解析绩点排名 HTML 页面 (与 Python ranking.py 逻辑一致)
pub fn parse_ranking_html(
    html: &str,
    student_id: &str,
    semester: &str,
    grade: &str,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut ranking = serde_json::Map::new();

    ranking.insert("student_id".to_string(), serde_json::json!(student_id));
    ranking.insert("semester".to_string(), serde_json::json!(semester));
    ranking.insert("grade".to_string(), serde_json::json!(grade));

    // 基本信息提取
    let re = regex::Regex::new(r"姓名[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.insert(
            "name".to_string(),
            serde_json::json!(cap.get(1).map(|m| m.as_str()).unwrap_or("")),
        );
    }

    let re = regex::Regex::new(r"学院[：:]\s*([^<\n]+?)(?:\s{2,}|<|$)").unwrap();
    if let Some(cap) = re.captures(html) {
        let val = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        if !val.is_empty() && val != "(年级)" {
            ranking.insert("college".to_string(), serde_json::json!(val));
        }
    }

    let re = regex::Regex::new(r"专业[：:]\s*([^<\n]+?)(?:\s{2,}|<|$)").unwrap();
    if let Some(cap) = re.captures(html) {
        let val = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        if !val.is_empty() {
            ranking.insert("major".to_string(), serde_json::json!(val));
        }
    }

    let re = regex::Regex::new(r"班级[：:]\s*([^<\n]+?)(?:\s{2,}|<|$)").unwrap();
    if let Some(cap) = re.captures(html) {
        let val = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        if !val.is_empty() {
            ranking.insert("class_name".to_string(), serde_json::json!(val));
        }
    }

    // 成绩信息
    let re = regex::Regex::new(r"平均学分绩点[：:]\s*([0-9.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        if let Ok(gpa) = cap.get(1).map(|m| m.as_str()).unwrap_or("0").parse::<f64>() {
            ranking.insert("gpa".to_string(), serde_json::json!(gpa));
        }
    }

    let re = regex::Regex::new(r"算术平均分[：:]\s*([0-9.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        if let Ok(avg) = cap.get(1).map(|m| m.as_str()).unwrap_or("0").parse::<f64>() {
            ranking.insert("avg_score".to_string(), serde_json::json!(avg));
        }
    }

    // 提取排名表格数据（学习通页面会有 title/文本混合结构，按“整行 + 3 组排名”解析更稳）
    let row_by_label_re = regex::Regex::new(
        r#"(?is)<tr[^>]*>.*?<td[^>]*>\s*(平均学分绩点|算术平均分)\s*</td>(.*?)</tr>"#,
    )
    .unwrap();
    let rank_pair_re = regex::Regex::new(r#"([0-9]{1,4})\s*[\\/／]\s*([0-9]{1,5})"#).unwrap();

    let mut parsed_from_table = false;
    for cap in row_by_label_re.captures_iter(html) {
        let label = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
        let row_tail = cap.get(2).map(|m| m.as_str()).unwrap_or("");

        let mut pairs: Vec<(i32, i32)> = Vec::new();
        for m in rank_pair_re.captures_iter(row_tail) {
            let rank = m.get(1).and_then(|x| x.as_str().parse::<i32>().ok());
            let total = m.get(2).and_then(|x| x.as_str().parse::<i32>().ok());
            if let (Some(r), Some(t)) = (rank, total) {
                pairs.push((r, t));
            }
        }
        // title 与单元格文本可能同时命中，去除紧邻重复项，避免排名错位。
        let mut unique_pairs: Vec<(i32, i32)> = Vec::new();
        for item in pairs {
            if unique_pairs.last().copied() != Some(item) {
                unique_pairs.push(item);
            }
        }
        if unique_pairs.len() < 3 {
            continue;
        }
        parsed_from_table = true;

        if label.contains("平均学分绩点") {
            ranking.insert(
                "gpa_college_rank".to_string(),
                serde_json::json!(unique_pairs[0].0),
            );
            ranking.insert(
                "gpa_college_total".to_string(),
                serde_json::json!(unique_pairs[0].1),
            );
            ranking.insert(
                "gpa_major_rank".to_string(),
                serde_json::json!(unique_pairs[1].0),
            );
            ranking.insert(
                "gpa_major_total".to_string(),
                serde_json::json!(unique_pairs[1].1),
            );
            ranking.insert(
                "gpa_class_rank".to_string(),
                serde_json::json!(unique_pairs[2].0),
            );
            ranking.insert(
                "gpa_class_total".to_string(),
                serde_json::json!(unique_pairs[2].1),
            );
        } else if label.contains("算术平均分") {
            ranking.insert(
                "avg_college_rank".to_string(),
                serde_json::json!(unique_pairs[0].0),
            );
            ranking.insert(
                "avg_college_total".to_string(),
                serde_json::json!(unique_pairs[0].1),
            );
            ranking.insert(
                "avg_major_rank".to_string(),
                serde_json::json!(unique_pairs[1].0),
            );
            ranking.insert(
                "avg_major_total".to_string(),
                serde_json::json!(unique_pairs[1].1),
            );
            ranking.insert(
                "avg_class_rank".to_string(),
                serde_json::json!(unique_pairs[2].0),
            );
            ranking.insert(
                "avg_class_total".to_string(),
                serde_json::json!(unique_pairs[2].1),
            );
        }
    }

    // 兜底：兼容旧版/异常页面，仅提取 `<td>` 中的 rank/total
    if !parsed_from_table {
        let td_rank_re =
            regex::Regex::new(r#"(?s)<td[^>]*>\s*([0-9]{1,4})\s*[\\/／]\s*([0-9]{1,5})\s*</td>"#)
                .unwrap();
        let rank_matches: Vec<(i32, i32)> = td_rank_re
            .captures_iter(html)
            .filter_map(|cap| {
                let rank = cap.get(1).and_then(|m| m.as_str().parse().ok())?;
                let total = cap.get(2).and_then(|m| m.as_str().parse().ok())?;
                Some((rank, total))
            })
            .collect();

        // 去除紧邻重复值，防止 title 与文本重复匹配
        let mut unique_ranks: Vec<(i32, i32)> = Vec::new();
        for item in rank_matches {
            if unique_ranks.last().copied() != Some(item) {
                unique_ranks.push(item);
            }
        }

        println!("[调试] 排名兜底解析: {} 项", unique_ranks.len());

        if unique_ranks.len() >= 3 {
            ranking.insert(
                "gpa_college_rank".to_string(),
                serde_json::json!(unique_ranks[0].0),
            );
            ranking.insert(
                "gpa_college_total".to_string(),
                serde_json::json!(unique_ranks[0].1),
            );
            ranking.insert(
                "gpa_major_rank".to_string(),
                serde_json::json!(unique_ranks[1].0),
            );
            ranking.insert(
                "gpa_major_total".to_string(),
                serde_json::json!(unique_ranks[1].1),
            );
            ranking.insert(
                "gpa_class_rank".to_string(),
                serde_json::json!(unique_ranks[2].0),
            );
            ranking.insert(
                "gpa_class_total".to_string(),
                serde_json::json!(unique_ranks[2].1),
            );
        }

        if unique_ranks.len() >= 6 {
            ranking.insert(
                "avg_college_rank".to_string(),
                serde_json::json!(unique_ranks[3].0),
            );
            ranking.insert(
                "avg_college_total".to_string(),
                serde_json::json!(unique_ranks[3].1),
            );
            ranking.insert(
                "avg_major_rank".to_string(),
                serde_json::json!(unique_ranks[4].0),
            );
            ranking.insert(
                "avg_major_total".to_string(),
                serde_json::json!(unique_ranks[4].1),
            );
            ranking.insert(
                "avg_class_rank".to_string(),
                serde_json::json!(unique_ranks[5].0),
            );
            ranking.insert(
                "avg_class_total".to_string(),
                serde_json::json!(unique_ranks[5].1),
            );
        }
    }

    let has_data = ranking.contains_key("gpa") || ranking.contains_key("gpa_major_rank");

    Ok(serde_json::json!({
        "success": has_data,
        "data": ranking,
        "error": if !has_data { "暂无排名数据" } else { "" }
    }))
}

/// 解析学生信息 HTML 页面
pub fn parse_student_info_html(
    html: &str,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut info = serde_json::Map::new();

    // 使用新版页面结构 (xskp) 的提取逻辑
    let extract_field = |label: &str| -> Option<String> {
        let label_escaped = regex::escape(label);
        let pattern = format!(
            r#"(?s){}\s*[:：]?\s*</label>\s*</div>\s*<div class="item-content">\s*(?:<label[^>]*>)?([^<★]+)"#,
            label_escaped
        );
        if let Ok(re) = regex::Regex::new(&pattern) {
            if let Some(cap) = re.captures(html) {
                let value = cap
                    .get(1)
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default();
                if !value.is_empty() && !value.contains("★") {
                    return Some(value);
                }
            }
        }
        None
    };

    // 基本信息
    if let Some(v) = extract_field("学号") {
        info.insert("student_id".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("姓名") {
        info.insert("name".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("性别") {
        info.insert("gender".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("出生日期") {
        info.insert("birth_date".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("身份证件号")
        .or_else(|| extract_field("身份证号"))
        .or_else(|| extract_field("身份证号码"))
    {
        // 兼容历史字段 id_card，并提供前端当前使用的 id_number
        info.insert("id_card".to_string(), serde_json::json!(v.clone()));
        info.insert("id_number".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("民族")
        .or_else(|| extract_field("民族(族别)"))
        .or_else(|| extract_field("民族（族别）"))
    {
        info.insert("ethnicity".to_string(), serde_json::json!(v));
    }

    // 学籍信息
    if let Some(v) = extract_field("院系信息") {
        info.insert("college".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("专业信息") {
        info.insert("major".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("班级信息") {
        info.insert("class_name".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("所在年级") {
        info.insert("grade".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("学制") {
        info.insert("duration".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("入学日期") {
        info.insert("enrollment_date".to_string(), serde_json::json!(v));
    }

    // 联系方式
    if let Some(v) = extract_field("手机号码") {
        info.insert("phone".to_string(), serde_json::json!(v));
    }
    if let Some(v) = extract_field("电子邮箱") {
        info.insert("email".to_string(), serde_json::json!(v));
    }

    // 备用提取 (使用简单正则)
    if !info.contains_key("student_id") {
        let re = regex::Regex::new(r"学号[：:]\s*(\d+)").unwrap();
        if let Some(cap) = re.captures(html) {
            info.insert(
                "student_id".to_string(),
                serde_json::json!(cap.get(1).map(|m| m.as_str()).unwrap_or("")),
            );
        }
    }

    if !info.contains_key("name") {
        let re = regex::Regex::new(r"姓名[：:]\s*([^\s<]+)").unwrap();
        if let Some(cap) = re.captures(html) {
            info.insert(
                "name".to_string(),
                serde_json::json!(cap.get(1).map(|m| m.as_str()).unwrap_or("")),
            );
        }
    }

    let has_data = info.contains_key("student_id") || info.contains_key("name");

    Ok(serde_json::json!({
        "success": has_data,
        "data": info,
        "error": if !has_data { "无法获取学生信息" } else { "" }
    }))
}

#[cfg(test)]
mod teacher_schedule_tests {
    use super::*;
    use serde_json::json;

    /// 真实抓包的教师课表响应（`/admin/pkgl/pkgljskb/getJskbByXqid`，
    /// 学期 2026-2027-1，教师工号 2024000000）。已裁掉无关字段，保留全部参与解析的列。
    ///
    /// 关键特征：同一门课在**大节 4** 内按小节逐行返回 —— 4 条记录 =
    /// 2 个「周次+教室」组合 × 2 个小节（djc=7 与 djc=8），且 `djs` 恒为 4
    /// （大节号），不是连堂节数。
    fn teacher_payload() -> Value {
        let row = |djc: i64,
                   zc: &str,
                   zcstr: &str,
                   zctype: &str,
                   room: &str,
                   bld: &str,
                   pkid: &str| {
            json!({
                "xnxq": "2026-2027-1",
                "kcid": "20605005A",
                "kcbh": "20605005A",
                "kcmc": "<a href=\"javascript:void(0);\" style=\"color: red\" onclick=\"openKckb('X')\">计算机制图与表达-1</a>",
                "jxbid": "d7fad7022b66492a93e754e2b30da0dc",
                "jxbbh": "202613844",
                "tmc": "张三",
                "zjsname": "张三",
                "croommc": format!("<a href=\"javascript:void(0);\" onclick=\"openCrkb('2026-2027-1','Y')\">{}</a>", room),
                "croombh": room,
                "jxlmc": bld,
                "jslxmc": "多媒体",
                "xingqi": 1,
                "djc": djc,
                "djs": 4,
                "zc": zc,
                "zcstr": zcstr,
                "zctype": zctype,
                "xf": "1",
                "zongxs": "16",
                "jxbzc": "<a href=\"javascript:void(0);\" onclick=\"openBjkb('2026-2027-1','A')\">26建筑学1</a>,<a href=\"javascript:void(0);\" onclick=\"openBjkb('2026-2027-1','B')\">26建筑学2</a>",
                "bjrs": "62",
                "jxbrs": "62",
                "xkrs": 62,
                "id": "9e90407965e048af9662bf5a6dd28cc9",
                "pkid": pkid,
            })
        };
        json!({
            "ret": 0,
            "msg": "操作成功",
            "data": [
                row(7, "7", "7", "1", "2-209", "2号", "pk-a1"),
                row(8, "7", "7", "1", "2-209", "2号", "pk-a2"),
                row(7, "8-14", "8,9,10,11,12,13,14", "0", "5B-704", "5号", "pk-b1"),
                row(8, "8-14", "8,9,10,11,12,13,14", "0", "5B-704", "5号", "pk-b2"),
            ]
        })
    }

    #[test]
    fn 按大节去重_同一大节的两个小节合并为一张卡片() {
        let (courses, _week) = parse_teacher_schedule(&teacher_payload()).expect("应解析成功");
        // 4 条原始记录 → 2 张卡片（周次/教室不同），不是 4 张
        assert_eq!(courses.len(), 2, "同一大节的小节行必须合并：{courses:?}");

        let first = &courses[0];
        assert_eq!(first.weekday, 1);
        // djc=7/8 合并成 小节 7..8 → period=7、连堂=2
        assert_eq!(first.period, 7);
        assert_eq!(first.djs, 2);
        assert_eq!(first.weeks, vec![7]);
        assert_eq!(first.weeks_text, "7");
        assert_eq!(first.room_code, "2-209");
        assert_eq!(first.building, "2号");
        assert_eq!(first.name, "计算机制图与表达-1");
        assert_eq!(first.teacher, "张三");
        assert_eq!(first.class_name, "26建筑学1,26建筑学2");
        assert_eq!(first.credit, "1");
        assert_eq!(first.class_size.as_deref(), Some("62"));
        assert_eq!(first.teach_type.as_deref(), Some("多媒体"));
        assert_eq!(first.id, "pk-a1");
    }

    /// 回归护栏：`djs` 是**大节号**，绝不能被当作连堂节数。
    /// 若误用连堂语义，`period=7 + djs=4` 会得到 7..10 节，卡片会跨两个大节。
    #[test]
    fn djs_不得被当作连堂节数() {
        let (courses, _week) = parse_teacher_schedule(&teacher_payload()).expect("应解析成功");
        for course in &courses {
            assert_eq!(course.djs, 2, "大节内两个小节 => 连堂 2，而非 djs=4");
            assert_eq!(course.period, 7);
            assert!(course.period + course.djs - 1 <= 8, "不得越出大节 4");
        }
    }

    #[test]
    fn 第二张卡片保留不同周次与教室() {
        let (courses, _week) = parse_teacher_schedule(&teacher_payload()).expect("应解析成功");
        let second = &courses[1];
        assert_eq!(second.weeks, (8..=14).collect::<Vec<i32>>());
        assert_eq!(second.weeks_text, "8-14");
        assert_eq!(second.room_code, "5B-704");
        assert_eq!(second.building, "5号");
    }

    /// 单小节课程（大节 6 只有 1 小节）：区间不能被撑成 2。
    #[test]
    fn 单小节课程保持一节() {
        let payload = json!({
            "ret": 0,
            "msg": "操作成功",
            "data": [{
                "xnxq": "2025-2026-2", "kcbh": "X1", "kcmc": "单节课程",
                "tmc": "张三", "croombh": "1-101", "jxlmc": "1号",
                "xingqi": 3, "djc": 11, "djs": 6, "zc": "1-4", "zcstr": "1,2,3,4",
                "zctype": "0", "xf": "2", "jxbzc": "某班", "bjrs": "30", "pkid": "pk-c1"
            }]
        });
        let (courses, _week) = parse_teacher_schedule(&payload).expect("应解析成功");
        assert_eq!(courses.len(), 1);
        assert_eq!(courses[0].period, 11);
        assert_eq!(courses[0].djs, 1);
        assert_eq!(courses[0].weeks, vec![1, 2, 3, 4]);
    }

    /// 跨大节的同一门课必须分成两张卡片，不能合并成一张跨大节的大卡。
    #[test]
    fn 不同大节不合并() {
        let payload = json!({
            "ret": 0, "msg": "ok",
            "data": [
                {"xnxq":"2025-2026-1","kcbh":"Y1","kcmc":"跨大节课","tmc":"某师",
                 "croombh":"3-301","jxlmc":"3号","xingqi":2,"djc":1,"djs":1,
                 "zc":"1-8","zcstr":"1,2,3,4,5,6,7,8","zctype":"0","pkid":"p1"},
                {"xnxq":"2025-2026-1","kcbh":"Y1","kcmc":"跨大节课","tmc":"某师",
                 "croombh":"3-301","jxlmc":"3号","xingqi":2,"djc":2,"djs":1,
                 "zc":"1-8","zcstr":"1,2,3,4,5,6,7,8","zctype":"0","pkid":"p2"},
                {"xnxq":"2025-2026-1","kcbh":"Y1","kcmc":"跨大节课","tmc":"某师",
                 "croombh":"3-301","jxlmc":"3号","xingqi":2,"djc":3,"djs":2,
                 "zc":"1-8","zcstr":"1,2,3,4,5,6,7,8","zctype":"0","pkid":"p3"},
                {"xnxq":"2025-2026-1","kcbh":"Y1","kcmc":"跨大节课","tmc":"某师",
                 "croombh":"3-301","jxlmc":"3号","xingqi":2,"djc":4,"djs":2,
                 "zc":"1-8","zcstr":"1,2,3,4,5,6,7,8","zctype":"0","pkid":"p4"},
            ]
        });
        let (courses, _week) = parse_teacher_schedule(&payload).expect("应解析成功");
        assert_eq!(courses.len(), 2, "大节 1 与大节 2 必须各自成卡片");
        assert_eq!((courses[0].period, courses[0].djs), (1, 2));
        assert_eq!((courses[1].period, courses[1].djs), (3, 2));
    }

    #[test]
    fn ret_非零返回错误() {
        let payload = json!({"ret": -1, "msg": "参数传输异常", "data": []});
        let err = parse_teacher_schedule(&payload).expect_err("ret!=0 必须报错");
        assert!(err.to_string().contains("参数传输异常"), "err={err}");
    }

    #[test]
    fn 空数据不报错() {
        let payload = json!({"ret": 0, "msg": "操作成功", "data": []});
        let (courses, _week) = parse_teacher_schedule(&payload).expect("空课表不是错误");
        assert!(courses.is_empty());
    }

    /// 周次解析复用 `parse_weeks`：`zcstr` 的展开写法与 `zc` 的区间写法等价。
    #[test]
    fn 周次区间与展开写法等价() {
        assert_eq!(parse_weeks("8,9,10,11,12,13,14"), parse_weeks("8-14"));
        assert_eq!(parse_weeks("13,15,16"), vec![13, 15, 16]);
    }
}
