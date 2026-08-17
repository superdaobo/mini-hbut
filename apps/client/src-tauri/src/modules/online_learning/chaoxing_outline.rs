//! 学习通（Chaoxing）课程大纲/进度域：章节目录叶子提取、大纲组装、
//! 任务点完成度统计，以及大纲/进度缓存入口。

use std::collections::HashSet;
use std::time::Duration;

use futures::StreamExt;
use serde_json::{json, Value};

use crate::http_client::HbutClient;

use super::chaoxing_cards::parse_cards_attachments;
use super::chaoxing_session::{ensure_chaoxing_session_ready, propagate_chaoxing_key_cookies};
use super::shared::{
    cache_key, err_box, now_sync_time, read_cache, resolve_student_id, save_cache, DynError,
    CACHE_CHAOXING_OUTLINE, CACHE_CHAOXING_PROGRESS,
};

/// 统计单个知识节点（knowledge）的任务点完成情况
/// 返回 (任务点总数, 已完成数, 是否完整统计)
/// completed 语义：attachment.isPassed === true 才算完成（缺省视为未完成）
/// —— 视频/文档等任务点由学习通服务端标记 isPassed，比章节页 orangeNew 准确
/// ok=false 表示中途请求失败（分页未取完），调用方不得据此判定节点完成
async fn chaoxing_node_completion(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    knowledge_id: &str,
    cpi: &str,
) -> (usize, usize, bool) {
    let study_referer = format!(
        "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudy?chapterId={knowledge_id}&courseId={course_id}&clazzid={clazz_id}&cpi={cpi}&mooc2=1"
    );
    let mut total = 0usize;
    let mut passed = 0usize;
    let mut ok = true;
    // 页数上限：单节点最多 6 页（附件满 30/页 ≈ 180 任务点），
    // 防止异常超大节点发起十几页请求拖垮会话与触发风控
    for num in 0..6u32 {
        let num_s = num.to_string();
        let url = format!(
            "https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?clazzid={clazz_id}&courseid={course_id}&knowledgeid={knowledge_id}&num={num_s}&ut=s&cpi={cpi}&v=2025-0424-1038-3&mooc2=1&isMicroCourse=false&editorPreview=0"
        );
        let resp = match client
            .client
            .get(&url)
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .header("Referer", &study_referer)
            .timeout(Duration::from_secs(12))
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => {
                ok = false;
                break;
            }
        };
        let html = resp.text().await.unwrap_or_default();
        let atts = parse_cards_attachments(&html);
        if atts.is_empty() {
            // 首页为空：可能是无任务点或页面结构异常；保守标记不完整
            if num == 0 {
                ok = false;
            }
            break;
        }
        total += atts.len();
        passed += atts
            .iter()
            .filter(|a| a.get("isPassed").and_then(|v| v.as_bool()).unwrap_or(false))
            .count();
        // 一页未满说明没有下一页
        if atts.len() < 30 {
            break;
        }
    }
    (total, passed, ok)
}
/// 用任务点级完成状态（isPassed）升级大纲：
/// 节点 completed = 该节点有任务点且全部通过；并重算课程级统计
/// 修复「二级显示已完成但三级视频未看完」的误判（orangeNew 不统计视频）
async fn enrich_outline_with_task_completion(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    mut outline: Value,
) -> Value {
    let nodes = outline
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let knowledge_ids: Vec<String> = nodes
        .iter()
        .filter_map(|n| {
            n.get("knowledge_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .collect();
    if knowledge_ids.is_empty() {
        return outline;
    }
    // 并发拉取每个节点的任务点完成状态（限流避免触发风控）
    let tasks: Vec<_> = knowledge_ids
        .iter()
        .map(|kid| {
            let cid = course_id.to_string();
            let clz = clazz_id.to_string();
            let cp = cpi.to_string();
            let k = kid.clone();
            async move { chaoxing_node_completion(client, &cid, &clz, &k, &cp).await }
        })
        .collect();
    let results: Vec<(usize, usize, bool)> =
        futures::stream::iter(tasks).buffered(6).collect().await;

    let mut completion: std::collections::HashMap<String, (usize, usize, bool)> =
        std::collections::HashMap::new();
    for (kid, res) in knowledge_ids.iter().zip(results.iter()) {
        completion.insert(kid.clone(), *res);
    }

    // 全量统计失败（如会话失效）时回退到章节页 orangeNew 估算，避免进度归零误导
    let any_ok = results.iter().any(|(_, _, ok)| *ok);
    if !any_ok {
        return outline;
    }

    let mut completed_count = 0usize;
    let mut task_total = 0usize;
    let mut task_passed = 0usize;
    if let Some(arr) = outline.get_mut("nodes").and_then(|v| v.as_array_mut()) {
        for node in arr.iter_mut() {
            let kid = node
                .get("knowledge_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let (total, passed, ok) = completion.get(&kid).copied().unwrap_or((0, 0, false));
            // 节点完成：统计完整且有任务点且全部通过（无任务点/未完整统计不算完成，避免误报）
            let done = ok && total > 0 && passed == total;
            node["completed"] = json!(done);
            node["task_total"] = json!(total);
            node["task_passed"] = json!(passed);
            if done {
                completed_count += 1;
            }
            if ok {
                task_total += total;
                task_passed += passed;
            }
        }
    }
    // 课程级统计采用「任务点粒度」（与网页端 unfinishCount/publishJobNum 口径一致）
    outline["completed_count"] = json!(task_passed);
    outline["total_count"] = json!(task_total);
    outline["pending_count"] = json!(task_total.saturating_sub(task_passed));
    outline["task_total"] = json!(task_total);
    outline["task_passed"] = json!(task_passed);
    outline["task_percent"] = json!(if task_total == 0 {
        0.0
    } else {
        task_passed as f64 * 100.0 / task_total as f64
    });
    outline["progress_percent"] = json!(if task_total == 0 {
        0.0
    } else {
        task_passed as f64 * 100.0 / task_total as f64
    });
    outline["progress_text"] = json!(format!("已完成 {} / {}", task_passed, task_total));
    outline["completed_nodes"] = json!(completed_count);
    outline["total_nodes"] = json!(outline
        .get("nodes")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0));
    outline
}
/// 列表页快速进度估算（仅解析章节页 orangeNew，不发 knowledge/cards 请求）
/// 用于课程列表批量展示；详情页用 fetch_chaoxing_course_progress_remote（任务点精确）
pub(crate) async fn fetch_chaoxing_course_progress_fast(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: Option<&str>,
) -> Result<Value, DynError> {
    let outline =
        fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, course_url).await?;
    let nodes = outline
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let total_count = nodes.len();
    let completed_count = nodes
        .iter()
        .filter(|item| {
            item.get("completed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .count();
    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "total_count": total_count,
        "completed_count": completed_count,
        "pending_count": total_count.saturating_sub(completed_count),
        "progress_percent": if total_count == 0 { 0.0 } else { completed_count as f64 * 100.0 / total_count as f64 },
        "progress_text": format!("已完成 {} / {}", completed_count, total_count),
        "nodes": nodes
    }))
}
async fn fetch_chaoxing_course_progress_remote(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: Option<&str>,
) -> Result<Value, DynError> {
    let outline =
        fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, course_url).await?;
    // 任务点级精确统计（isPassed），替代 orangeNew 估算
    let outline =
        enrich_outline_with_task_completion(client, course_id, clazz_id, cpi, outline).await;
    let nodes = outline
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let task_total = outline
        .get("task_total")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let task_passed = outline
        .get("task_passed")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let task_percent = if task_total == 0 {
        0.0
    } else {
        task_passed as f64 * 100.0 / task_total as f64
    };
    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "total_count": task_total,
        "completed_count": task_passed,
        "pending_count": task_total.saturating_sub(task_passed),
        "task_total": task_total,
        "task_passed": task_passed,
        "task_percent": task_percent,
        "progress_percent": task_percent,
        "progress_text": format!("已完成 {} / {}", task_passed, task_total),
        "nodes": nodes
    }))
}
async fn fetch_chaoxing_outline_remote(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: Option<&str>,
) -> Result<Value, DynError> {
    let target = course_url
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| {
            format!(
                "https://mooc1.chaoxing.com/mooc-ans/mycourse/studentstudycourselist?courseId={}&chapterId=0&clazzid={}&cpi={}&mooc2=1&isMicroCourse=false",
                course_id, clazz_id, cpi
            )
        });

    // mooc1.chaoxing.com 章节页需要 _uid/UID/fid 等 cookies，
    // 这些可能仅在 mooc1-api/passport2/i.chaoxing.com 域上存在。
    // 收集所有相关域的关键 cookies 并种到 mooc1 域。
    propagate_chaoxing_key_cookies(client);

    let resp = client
        .client
        .get(&target)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Referer", "https://mooc1.chaoxing.com/visit/interaction")
        .send()
        .await?;
    let final_url = resp.url().to_string();
    let html = resp.text().await?;
    if final_url.contains("/login") {
        return Err(err_box("学习通会话已失效，请重新登录"));
    }

    // 生产路径：与单测共用 assemble_chaoxing_outline_from_html / extract_chaoxing_catalog_leaves
    assemble_chaoxing_outline_from_html(&html, course_id, clazz_id, cpi, &target)
}
pub fn assemble_chaoxing_outline_from_html(
    html: &str,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    course_url: &str,
) -> Result<Value, DynError> {
    let re_section = regex::Regex::new(
        r#"(?i)(?:posCatalog_select\s+firstLayer|firstLayer)[^>]*id="(\d+)"[\s\S]{0,500}?title="([^"]+)""#,
    )
    .expect("regex section");
    let re_section_alt =
        regex::Regex::new(r#"(?i)class="[^"]*catalog_name[^"]*"[^>]*>([^<]{1,80})<"#).ok();

    let mut section_marks: Vec<(usize, String, String)> = Vec::new();
    for cap in re_section.captures_iter(html) {
        let pos = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let sid = cap[1].to_string();
        let title = cap[2].trim().to_string();
        if !title.is_empty() {
            section_marks.push((pos, sid, title));
        }
    }
    if section_marks.is_empty() {
        if let Some(re) = re_section_alt.as_ref() {
            for (i, cap) in re.captures_iter(html).enumerate() {
                let title = cap[1].trim().to_string();
                if title.is_empty() {
                    continue;
                }
                section_marks.push((
                    cap.get(0).map(|m| m.start()).unwrap_or(0),
                    format!("sec{i}"),
                    title,
                ));
            }
        }
    }

    let raw_leaves = extract_chaoxing_catalog_leaves(html);
    let mut leaves: Vec<(usize, Value)> = Vec::new();
    for (pos, knowledge_id, title, cap_course_id, cap_clazz_id, cur_id, completed) in raw_leaves {
        let chapter_id = if cur_id.is_empty() {
            knowledge_id.clone()
        } else {
            cur_id
        };
        let cid = if cap_course_id.is_empty() {
            course_id.to_string()
        } else {
            cap_course_id
        };
        let clz = if cap_clazz_id.is_empty() {
            clazz_id.to_string()
        } else {
            cap_clazz_id
        };
        leaves.push((
            pos,
            json!({
                "id": knowledge_id.clone(),
                "title": title.clone(),
                "name": title,
                "course_id": cid,
                "clazz_id": clz,
                "cpi": cpi,
                "chapter_id": chapter_id,
                "knowledge_id": knowledge_id,
                "completed": completed,
                "task_type": "knowledge",
                "type": "knowledge",
                "children": [],
                "tasks": []
            }),
        ));
    }

    println!(
        "[调试] 章节解析: sections={} leaves={}",
        section_marks.len(),
        leaves.len()
    );

    if leaves.is_empty() {
        return Err(err_box(
            "未解析到可展开的小节。请尝试刷新章节，或重新登录学习通后再打开该课程",
        ));
    }

    let mut sections: Vec<Value> = Vec::new();
    if section_marks.is_empty() {
        let tasks: Vec<Value> = leaves.into_iter().map(|(_, v)| v).collect();
        let total = tasks.len();
        let completed = tasks
            .iter()
            .filter(|t| {
                t.get("completed")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
            .count();
        sections.push(json!({
            "id": "all",
            "title": "全部章节",
            "tasks": tasks,
            "children": []
        }));
        return Ok(json!({
            "success": true,
            "sections": sections,
            "nodes": sections[0]["tasks"].clone(),
            "total_count": total,
            "completed_count": completed,
            "pending_count": total.saturating_sub(completed),
            "course_id": course_id,
            "clazz_id": clazz_id,
            "cpi": cpi,
            "course_url": course_url
        }));
    }

    for (idx, (pos, sid, title)) in section_marks.iter().enumerate() {
        let next_pos = section_marks
            .get(idx + 1)
            .map(|(p, _, _)| *p)
            .unwrap_or(usize::MAX);
        let tasks: Vec<Value> = leaves
            .iter()
            .filter(|(p, _)| *p >= *pos && *p < next_pos)
            .map(|(_, v)| v.clone())
            .collect();
        sections.push(json!({
            "id": sid,
            "title": title,
            "tasks": tasks,
            "children": []
        }));
    }

    let any_tasks = sections.iter().any(|s| {
        s.get("tasks")
            .and_then(|t| t.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false)
    });
    if !any_tasks && !leaves.is_empty() {
        let tasks: Vec<Value> = leaves.iter().map(|(_, v)| v.clone()).collect();
        sections = vec![json!({
            "id": "all",
            "title": "全部章节",
            "tasks": tasks,
            "children": []
        })];
    } else if any_tasks {
        let first_pos = section_marks[0].0;
        let orphan: Vec<Value> = leaves
            .iter()
            .filter(|(p, _)| *p < first_pos)
            .map(|(_, v)| v.clone())
            .collect();
        if !orphan.is_empty() {
            sections.insert(
                0,
                json!({
                    "id": "intro",
                    "title": "导学",
                    "tasks": orphan,
                    "children": []
                }),
            );
        }
    }

    let mut total_count = 0usize;
    for sec in &sections {
        if let Some(arr) = sec.get("tasks").and_then(|v| v.as_array()) {
            total_count += arr.len();
        }
    }
    // 完成状态统计：节点 completed 来自章节页 orangeNew 数字（0 = 已完成）
    let nodes: Vec<Value> = sections
        .iter()
        .flat_map(|s| {
            s.get("tasks")
                .and_then(|t| t.as_array())
                .cloned()
                .unwrap_or_default()
        })
        .collect();
    let completed_count = nodes
        .iter()
        .filter(|n| {
            n.get("completed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        })
        .count();

    Ok(json!({
        "success": true,
        "sections": sections,
        "nodes": nodes,
        "total_count": total_count,
        "completed_count": completed_count,
        "pending_count": total_count.saturating_sub(completed_count),
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "course_url": course_url
    }))
}
pub async fn chaoxing_fetch_course_outline(
    client: &mut HbutClient,
    req: &crate::ChaoxingCourseOutlineRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let _ = ensure_chaoxing_session_ready(client, &sid).await;
    let course_id = req.course_id.trim();
    let clazz_id = req.clazz_id.trim();
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("course_id 和 clazz_id 不能为空"));
    }
    let cpi = req.cpi.trim();
    let cache_id = cache_key(&sid, &format!("outline:{}:{}", course_id, clazz_id));
    if !req.force.unwrap_or(false) {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_OUTLINE, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    match fetch_chaoxing_outline_remote(client, course_id, clazz_id, cpi, req.course_url.as_deref())
        .await
    {
        Ok(payload) => {
            // 任务点级精确完成状态（isPassed）：修复「二级显示完成但三级任务未看完」
            let payload =
                enrich_outline_with_task_completion(client, course_id, clazz_id, cpi, payload)
                    .await;
            save_cache(CACHE_CHAOXING_OUTLINE, &cache_id, &payload);
            Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
        }
        Err(error) => {
            if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_OUTLINE, &cache_id) {
                return Ok(crate::attach_sync_time(cached, &sync_time, true));
            }
            Err(error)
        }
    }
}
pub async fn chaoxing_fetch_course_progress(
    client: &mut HbutClient,
    req: &crate::ChaoxingCourseProgressRequest,
) -> Result<Value, DynError> {
    let sid = resolve_student_id(client, req.student_id.as_deref())?;
    let _ = ensure_chaoxing_session_ready(client, &sid).await;
    let course_id = req.course_id.trim();
    let clazz_id = req.clazz_id.trim();
    let cpi_value = req.cpi.clone();
    let force_refresh = req.force.unwrap_or(false);
    if course_id.is_empty() || clazz_id.is_empty() {
        return Err(err_box("course_id 和 clazz_id 不能为空"));
    }
    let cache_id = cache_key(&sid, &format!("progress:{}:{}", course_id, clazz_id));
    if !force_refresh {
        if let Some((cached, sync_time)) = read_cache(CACHE_CHAOXING_PROGRESS, &cache_id) {
            return Ok(crate::attach_sync_time(cached, &sync_time, true));
        }
    }
    let payload = fetch_chaoxing_course_progress_remote(
        client,
        course_id,
        clazz_id,
        &cpi_value,
        req.course_url.as_deref(),
    )
    .await?;
    save_cache(CACHE_CHAOXING_PROGRESS, &cache_id, &payload);
    Ok(crate::attach_sync_time(payload, &now_sync_time(), false))
}
/// 从章节页 HTML 提取 knowledge 叶子（纯函数）
/// 返回 (pos, knowledge_id, title, course_id, clazz_id, chapter_cur_id, completed)
/// completed：节点内 `orangeNew` 数字（服务端渲染的未完成任务点数），0 = 已完成
pub fn extract_chaoxing_catalog_leaves(
    html: &str,
) -> Vec<(usize, String, String, String, String, String, bool)> {
    let re_leaf = regex::Regex::new(
        r#"id="cur(\d+)"[\s\S]{0,2500}?getTeacherAjax\('(\d+)','(\d+)','(\d+)'\)"#,
    )
    .expect("regex leaf");
    let re_leaf_title = regex::Regex::new(r#"title="\s*([^"]*?)\s*""#).expect("regex leaf title");
    let re_orange = regex::Regex::new(r#"class="orangeNew">(\d+)<"#).expect("regex orangeNew");
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for cap in re_leaf.captures_iter(html) {
        let pos = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let cur_id = cap[1].to_string();
        let course_id = cap[2].to_string();
        let clazz_id = cap[3].to_string();
        let knowledge_id = cap[4].to_string();
        if !seen.insert(knowledge_id.clone()) {
            continue;
        }
        let end = html[pos + 1..]
            .find(r#"id="cur"#)
            .map(|p| pos + 1 + p)
            .unwrap_or((pos + 1200).min(html.len()));
        let block = &html[pos..end];
        let title = re_leaf_title
            .captures(block)
            .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| format!("小节 {knowledge_id}"));
        // 完成状态：orangeNew 数字 = 该节点未完成任务点数；0 = 已完成
        let completed = re_orange
            .captures(block)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<u32>().ok())
            .map(|n| n == 0)
            .unwrap_or(false);
        out.push((
            pos,
            knowledge_id,
            title,
            course_id,
            clazz_id,
            cur_id,
            completed,
        ));
    }
    if out.is_empty() {
        let re_ajax =
            regex::Regex::new(r#"getTeacherAjax\('(\d+)','(\d+)','(\d+)'\)"#).expect("ajax");
        for cap in re_ajax.captures_iter(html) {
            let pos = cap.get(0).map(|m| m.start()).unwrap_or(0);
            let knowledge_id = cap[3].to_string();
            if !seen.insert(knowledge_id.clone()) {
                continue;
            }
            let window_start = pos.saturating_sub(400);
            let window = &html[window_start..pos.min(html.len())];
            let title = re_leaf_title
                .captures(window)
                .and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| format!("小节 {knowledge_id}"));
            let completed = re_orange
                .captures(window)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .map(|n| n == 0)
                .unwrap_or(false);
            out.push((
                pos,
                knowledge_id,
                title,
                cap[1].to_string(),
                cap[2].to_string(),
                String::new(),
                completed,
            ));
        }
    }
    out
}
#[cfg(test)]
mod catalog_and_video_tests {
    use super::*;

    #[test]
    fn extract_leaves_from_realistic_html() {
        let html = r#"
        <div class="posCatalog_select firstLayer" id="1" title="第一章 绪论"></div>
        <div id="cur1001" class="posCatalog_name" title=" 1.1 电路模型" onclick="getTeacherAjax('2288','3399','100239488')"><span class="orangeNew">0</span></div>
        <div id="cur1002" title="1.2 电源" onclick="getTeacherAjax('2288','3399','100239489')"><span class="orangeNew">2</span></div>
        "#;
        let leaves = extract_chaoxing_catalog_leaves(html);
        assert!(leaves.len() >= 2, "expected >=2 leaves, got {:?}", leaves);
        assert!(leaves
            .iter()
            .any(|(_, kid, title, _, _, _, _)| kid == "100239488" && title.contains("电路")));
        assert!(leaves
            .iter()
            .any(|(_, kid, _, _, _, _, _)| kid == "100239489"));
        // 完成状态：orangeNew=0 → 已完成；orangeNew=2 → 未完成
        let leaf1 = leaves
            .iter()
            .find(|(_, kid, _, _, _, _, _)| kid == "100239488")
            .unwrap();
        let leaf2 = leaves
            .iter()
            .find(|(_, kid, _, _, _, _, _)| kid == "100239489")
            .unwrap();
        assert!(leaf1.6, "orangeNew=0 应标记已完成");
        assert!(!leaf2.6, "orangeNew=2 应标记未完成");
    }
    #[test]
    fn empty_html_has_no_leaves() {
        assert!(extract_chaoxing_catalog_leaves("<html></html>").is_empty());
    }

    #[test]
    fn assemble_outline_drives_extract_leaves() {
        let html = r#"
        <div class="posCatalog_select firstLayer" id="1" title="第一章 绪论"></div>
        <div id="cur1001" title=" 1.1 电路模型" onclick="getTeacherAjax('2288','3399','100239488')"><span class="orangeNew">0</span></div>
        <div id="cur1002" title="1.2 电源" onclick="getTeacherAjax('2288','3399','100239489')"><span class="orangeNew">1</span></div>
        "#;
        let out = assemble_chaoxing_outline_from_html(
            html,
            "2288",
            "3399",
            "1",
            "https://example/course",
        )
        .expect("outline");
        assert_eq!(out["success"], true);
        let total = out["total_count"].as_u64().unwrap_or(0);
        assert!(total >= 2, "total={total} out={out}");
        // completed_count 应统计 orangeNew=0 的节点
        let completed = out["completed_count"].as_u64().unwrap_or(0);
        assert_eq!(completed, 1, "completed_count={completed} out={out}");
        let leaves = extract_chaoxing_catalog_leaves(html);
        assert_eq!(leaves.len() as u64, total);
    }
}
