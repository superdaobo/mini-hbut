use scraper::{Html, Selector};
use serde_json::Value;
use chrono::Datelike;

use crate::{UserInfo, Grade, ScheduleCourse, Exam, Ranking, Classroom};

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
                let value = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
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
            student_id = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
        
        let re = regex::Regex::new(r"姓名[：:]\s*([^\s<]+)").unwrap();
        if let Some(cap) = re.captures(html) {
            student_name = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }
    
    // 提取学院
    let re = regex::Regex::new(r"学院[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        college = Some(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
    }
    
    // 提取专业
    let re = regex::Regex::new(r"专业[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        major = Some(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
    }
    
    // 提取班级
    let re = regex::Regex::new(r"班级[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        class_name = Some(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
    }
    
    // 提取年级
    let re = regex::Regex::new(r"年级[：:]\s*(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        grade = Some(cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default());
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
    })
}

pub fn parse_grades(json: &Value) -> Result<Vec<Grade>, Box<dyn std::error::Error + Send + Sync>> {
    let mut grades = Vec::new();
    
    // 新版 API 格式: {"ret": 0, "msg": "ok", "results": [...], "total": n}
    let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
        // 检查 API 返回状态
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
        
        println!("[DEBUG] Grades API ret={}, msg={}, results count={}", ret, msg, results.len());
        
        if ret != 0 {
            return Err(format!("成绩 API 返回错误: ret={}, msg={}", ret, msg).into());
        }
        
        results.clone()
    } else if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        // 旧版 API 格式: {"items": [...]}
        items.clone()
    } else {
        println!("[DEBUG] Unknown grades JSON format. Keys: {:?}", json.as_object().map(|o| o.keys().collect::<Vec<_>>()));
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
        let mut course_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if let Some(idx) = course_name.find(']') {
            course_name = course_name[idx + 1..].to_string();
        }
        
        // 课程性质 - 新版使用 kcxz，旧版使用 kcxzmc
        let course_nature = item.get("kcxz")
            .or_else(|| item.get("kcxzmc"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        // 教师 - 新版使用 cjlrjsxm，旧版使用 jsxm
        let teacher = item.get("cjlrjsxm")
            .or_else(|| item.get("jsxm"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        
        let grade = Grade {
            term,
            course_name,
            course_nature,
            course_credit,
            final_score,
            earned_credit,
            teacher,
        };
        grades.push(grade);
    }
    
    println!("[DEBUG] Parsed {} grades", grades.len());
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

pub fn parse_schedule(json: &Value) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
    let mut courses = Vec::new();
    
    // 计算当前周次（与 Python 模块一致）
    // 使用当前学年的9月1日作为学期开始（第一学期）
    let now = chrono::Local::now();
    let year = now.year();
    let month = now.month();
    
    // 确定学期开始日期
    let semester_start_year = if month >= 9 { year } else { year - 1 };
    let semester_start = chrono::NaiveDate::from_ymd_opt(semester_start_year, 9, 1)
        .unwrap_or(chrono::NaiveDate::from_ymd_opt(2025, 9, 1).unwrap());
    
    let today = chrono::Local::now().date_naive();
    let days = (today - semester_start).num_days();
    let mut current_week = (days / 7 + 1).max(1).min(25) as i32;
    
    // 新版 API 格式: {"ret": 0, "msg": "ok", "data": [...]}
    let items = if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
        
        println!("[DEBUG] Schedule API ret={}, msg={}, data count={}", ret, msg, data.len());
        
        if ret != 0 {
            return Err(format!("课表 API 返回错误: ret={}, msg={}", ret, msg).into());
        }
        
        data.clone()
    } else if let Some(kb_list) = json.get("kbList").and_then(|v| v.as_array()) {
        // 旧版 API 格式
        if let Some(week) = json.get("zc").and_then(|v| v.as_i64()) {
            current_week = week as i32;
        }
        kb_list.clone()
    } else {
        println!("[DEBUG] Unknown schedule JSON format. Keys: {:?}", json.as_object().map(|o| o.keys().collect::<Vec<_>>()));
        return Err("课表数据格式不正确".into());
    };
    
    for item in &items {
        // 课程名称 - 新版可能包含 HTML 标签
        let raw_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("");
        let name = extract_text_from_html(raw_name);
        
        // 教师 - 新版使用 tmc，旧版使用 xm
        let raw_teacher = item.get("tmc")
            .or_else(|| item.get("xm"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let teacher = extract_text_from_html(raw_teacher);
        
        // 教室 - 新版使用 croommc，旧版使用 cdmc
        let raw_room = item.get("croommc")
            .or_else(|| item.get("cdmc"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let room = extract_text_from_html(raw_room);
        
        // 星期几 - 新版使用 xingqi，旧版使用 xqj
        let weekday = item.get("xingqi")
            .or_else(|| item.get("xqj"))
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32;
        
        // 节次 - 新版使用 djc，旧版使用 jcs
        let period = item.get("djc")
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32;
        
        // 连续节数 - 新版使用 djs
        let djs = item.get("djs")
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32;
        
        // 周次 - 新版使用 zcstr 或 zc，旧版使用 zcd
        let weeks_str = item.get("zcstr")
            .or_else(|| item.get("zc"))
            .or_else(|| item.get("zcd"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let weeks = parse_weeks(weeks_str);

        let weeks_text = item.get("zc")
            .or_else(|| item.get("zcstr"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let room_code = item.get("croombh")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let building = item.get("jxlmc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let credit = item.get("xf")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let class_name = item.get("jxbzc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let course = ScheduleCourse {
            id: item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
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
        };
        courses.push(course);
    }
    
    println!("[DEBUG] Parsed {} courses for current week {}", courses.len(), current_week);
    Ok((courses, current_week))
}

/// 从 HTML 标签中提取纯文本（与 Python 模块一致）
fn extract_text_from_html(html_str: &str) -> String {
    if html_str.is_empty() {
        return String::new();
    }
    // 尝试提取 <a>...</a> 标签中的文本
    if let Some(cap) = regex::Regex::new(r">([^<]+)</a>").ok()
        .and_then(|re| re.captures(html_str)) {
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
    
    // 解析形如 "1-16周" 或 "1,3,5周" 的周次
    let clean_str = weeks_str.replace("周", "").replace("(单)", "").replace("(双)", "");
    
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
    
    weeks
}

#[allow(dead_code)]
fn parse_periods(jcs: &str) -> (i32, i32) {
    let parts: Vec<&str> = jcs.split('-').collect();
    if parts.len() == 2 {
        if let (Ok(start), Ok(end)) = (parts[0].parse::<i32>(), parts[1].parse::<i32>()) {
            return (start, end - start + 1);
        }
    }
    (1, 2)
}

pub fn parse_exams(json: &Value) -> Result<Vec<Exam>, Box<dyn std::error::Error + Send + Sync>> {
    let mut exams = Vec::new();
    
    // 新版 API 格式: {"ret": 0, "msg": "ok", "results": [...]}
    let items = if let Some(results) = json.get("results").and_then(|v| v.as_array()) {
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
        
        println!("[DEBUG] Exams API ret={}, msg={}, results count={}", ret, msg, results.len());
        
        if ret != 0 {
            return Err(format!("考试 API 返回错误: ret={}, msg={}", ret, msg).into());
        }
        
        results.clone()
    } else if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        // 旧版 API 格式
        items.clone()
    } else {
        println!("[DEBUG] Unknown exams JSON format. Keys: {:?}", json.as_object().map(|o| o.keys().collect::<Vec<_>>()));
        return Ok(vec![]); // 考试数据可能为空，不报错
    };
    
    for item in &items {
        // 课程名称
        let course_name = item.get("kcmc").and_then(|v| v.as_str()).unwrap_or("").to_string();
        
        // 考试日期
        let date = item.get("ksrq").and_then(|v| v.as_str()).unwrap_or("").to_string();
        
        // 考试时间
        let exam_time = item.get("kssj").and_then(|v| v.as_str()).unwrap_or("");
        let (start_time, end_time) = if exam_time.contains('-') {
            let parts: Vec<&str> = exam_time.split('-').collect();
            (
                parts.first().unwrap_or(&"").to_string(),
                parts.last().unwrap_or(&"").to_string()
            )
        } else {
            (exam_time.to_string(), String::new())
        };
        
        // 考试地点 - 新版使用 jsmc 或 ksdd
        let location = item.get("jsmc")
            .or_else(|| item.get("ksdd"))
            .or_else(|| item.get("cdmc"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        // 座位号
        let seat_number = item.get("zwh")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        
        // 地址
        let address = item.get("sddz")
            .or_else(|| item.get("kscddz"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let exam = Exam {
            course_name,
            date,
            start_time,
            end_time,
            location: if location.is_empty() { address } else { location },
            seat_number,
        };
        exams.push(exam);
    }
    
    println!("[DEBUG] Parsed {} exams", exams.len());
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
        ranking.class_rank = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
        ranking.class_total = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(30);
    }
    
    let re = regex::Regex::new(r"专业排名[：:]\s*(\d+)/(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.major_rank = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
        ranking.major_total = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(100);
    }
    
    let re = regex::Regex::new(r"学院排名[：:]\s*(\d+)/(\d+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.college_rank = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(1);
        ranking.college_total = cap.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(500);
    }
    
    let re = regex::Regex::new(r"绩点[：:]\s*([\d.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.gpa = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
    }
    
    let re = regex::Regex::new(r"平均分[：:]\s*([\d.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.average_score = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
    }
    
    let re = regex::Regex::new(r"总学分[：:]\s*([\d.]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.total_credits = cap.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0.0);
    }
    
    Ok(ranking)
}

pub fn parse_classrooms(json: &Value) -> Result<Vec<Classroom>, Box<dyn std::error::Error + Send + Sync>> {
    let mut classrooms = Vec::new();
    
    if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
        for item in items {
            let classroom = Classroom {
                name: item.get("cdmc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                building: item.get("jxlmc").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                capacity: item.get("zws").and_then(|v| v.as_i64()).unwrap_or(50) as i32,
                status: item.get("cdzt").and_then(|v| v.as_str()).map(|s| {
                    if s == "0" { "available" } else { "occupied" }
                }).unwrap_or("available").to_string(),
            };
            classrooms.push(classroom);
        }
    }
    
    Ok(classrooms)
}

/// 解析绩点排名 HTML 页面 (与 Python ranking.py 逻辑一致)
pub fn parse_ranking_html(html: &str, student_id: &str, semester: &str, grade: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut ranking = serde_json::Map::new();
    
    ranking.insert("student_id".to_string(), serde_json::json!(student_id));
    ranking.insert("semester".to_string(), serde_json::json!(semester));
    ranking.insert("grade".to_string(), serde_json::json!(grade));

    // 基本信息提取
    let re = regex::Regex::new(r"姓名[：:]\s*([^\s<]+)").unwrap();
    if let Some(cap) = re.captures(html) {
        ranking.insert("name".to_string(), serde_json::json!(cap.get(1).map(|m| m.as_str()).unwrap_or("")));
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

    // 提取排名表格数据 (格式: 排名/总人数)
    let re = regex::Regex::new(r"(\d+)/(\d+)").unwrap();
    let rank_matches: Vec<(i32, i32)> = re.captures_iter(html)
        .filter_map(|cap| {
            let rank = cap.get(1).and_then(|m| m.as_str().parse().ok())?;
            let total = cap.get(2).and_then(|m| m.as_str().parse().ok())?;
            Some((rank, total))
        })
        .collect();
    
    // 去重 (每两个连续的排名数据取第一个)
    let mut unique_ranks = vec![];
    for i in (0..rank_matches.len()).step_by(2) {
        if i < rank_matches.len() {
            unique_ranks.push(rank_matches[i]);
        }
    }

    println!("[DEBUG] Parsed {} unique ranks: {:?}", unique_ranks.len(), unique_ranks);

    // GPA 排名 (学院、专业、班级)
    if unique_ranks.len() >= 3 {
        ranking.insert("gpa_college_rank".to_string(), serde_json::json!(unique_ranks[0].0));
        ranking.insert("gpa_college_total".to_string(), serde_json::json!(unique_ranks[0].1));
        ranking.insert("gpa_major_rank".to_string(), serde_json::json!(unique_ranks[1].0));
        ranking.insert("gpa_major_total".to_string(), serde_json::json!(unique_ranks[1].1));
        ranking.insert("gpa_class_rank".to_string(), serde_json::json!(unique_ranks[2].0));
        ranking.insert("gpa_class_total".to_string(), serde_json::json!(unique_ranks[2].1));
    }

    // 平均分排名
    if unique_ranks.len() >= 6 {
        ranking.insert("avg_college_rank".to_string(), serde_json::json!(unique_ranks[3].0));
        ranking.insert("avg_college_total".to_string(), serde_json::json!(unique_ranks[3].1));
        ranking.insert("avg_major_rank".to_string(), serde_json::json!(unique_ranks[4].0));
        ranking.insert("avg_major_total".to_string(), serde_json::json!(unique_ranks[4].1));
        ranking.insert("avg_class_rank".to_string(), serde_json::json!(unique_ranks[5].0));
        ranking.insert("avg_class_total".to_string(), serde_json::json!(unique_ranks[5].1));
    }

    let has_data = ranking.contains_key("gpa") || ranking.contains_key("gpa_major_rank");
    
    Ok(serde_json::json!({
        "success": has_data,
        "data": ranking,
        "error": if !has_data { "暂无排名数据" } else { "" }
    }))
}

/// 解析学生信息 HTML 页面
pub fn parse_student_info_html(html: &str) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
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
                let value = cap.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
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
    if let Some(v) = extract_field("身份证号") {
        info.insert("id_card".to_string(), serde_json::json!(v));
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
            info.insert("student_id".to_string(), serde_json::json!(cap.get(1).map(|m| m.as_str()).unwrap_or("")));
        }
    }
    
    if !info.contains_key("name") {
        let re = regex::Regex::new(r"姓名[：:]\s*([^\s<]+)").unwrap();
        if let Some(cap) = re.captures(html) {
            info.insert("name".to_string(), serde_json::json!(cap.get(1).map(|m| m.as_str()).unwrap_or("")));
        }
    }

    let has_data = info.contains_key("student_id") || info.contains_key("name");
    
    Ok(serde_json::json!({
        "success": has_data,
        "data": info,
        "error": if !has_data { "无法获取学生信息" } else { "" }
    }))
}
