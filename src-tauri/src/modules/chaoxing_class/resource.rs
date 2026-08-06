//! 学习通班级资料：列表（根目录/子文件夹/教师课件）与预览访问。

use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http_client::HbutClient;

use super::parse::{
    err_box, extract_hidden, extract_js_or_attr, get_text_with_retry, looks_like_login_html,
    looks_like_login_url, looks_like_not_joined_html, normalize_url, now_ms, DynError,
};
use super::session::is_student_enrolled_in_clazz;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassResource {
    pub data_id: String,
    pub name: String,
    pub file_type: String,
    pub object_id: String,
    pub size_label: String,
    pub creator: String,
    pub created_at: String,
    pub is_folder: bool,
    /// `tch-courseware` | `afolder` | ``
    pub folder_kind: String,
    pub download_url: String,
    /// 弱降级用，主预览请走 get-preview-url
    pub preview_cdn_url: String,
    /// 列表缩略图（图片类，对齐网页 star3 缩略图）
    pub thumbnail_url: String,
    pub is_downloadable: bool,
}

fn looks_like_image(name: &str, file_type: &str) -> bool {
    let t = format!("{} {}", file_type, name).to_ascii_lowercase();
    t.contains("jpg")
        || t.contains("jpeg")
        || t.contains("png")
        || t.contains("gif")
        || t.contains("webp")
        || t.contains("bmp")
        || t.contains("heic")
}

fn looks_like_video(name: &str, file_type: &str) -> bool {
    let t = format!("{} {}", file_type, name).to_ascii_lowercase();
    t.contains("mp4")
        || t.contains("mov")
        || t.contains("avi")
        || t.contains("mkv")
        || t.contains("webm")
        || t.contains("m4v")
}

/// 网页列表常用缩略图：`star3/150_150c/{objectId}`
fn build_thumbnail_url(object_id: &str, name: &str, file_type: &str) -> String {
    let oid = object_id.trim();
    if oid.is_empty() || !looks_like_image(name, file_type) {
        return String::new();
    }
    format!("https://p.ananas.chaoxing.com/star3/150_150c/{oid}")
}

fn build_image_cdn_candidates(object_id: &str) -> Vec<String> {
    let oid = object_id.trim();
    if oid.is_empty() {
        return Vec::new();
    }
    vec![
        format!("https://p.ananas.chaoxing.com/star3/origin/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/400_400c/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/270_160c/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/150_150c/{oid}"),
        format!("https://p.ananas.chaoxing.com/star3/270_160c/{oid}.png"),
    ]
}

fn is_direct_media_url(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    if u.contains("objectshowpreview") || u.contains(".html") {
        return false;
    }
    u.contains(".jpg")
        || u.contains(".jpeg")
        || u.contains(".png")
        || u.contains(".gif")
        || u.contains(".webp")
        || u.contains(".bmp")
        || u.contains("/star3/")
        || u.contains("download")
        || u.contains("cloudstorage")
}

#[derive(Debug, Clone, Default)]
pub struct ListResourcesOpts {
    pub cpi: Option<String>,
    /// 普通文件夹 dataId；教师课件用 folder_kind=tch-courseware
    pub parent_data_id: Option<String>,
    pub data_name: Option<String>,
    pub parent_chain: Option<String>,
    /// `tch-courseware` 时走 mobilelearn 课件列表 API
    pub folder_kind: Option<String>,
}

/// 仅从 HTML 启发式推断 membership（会把空壳资料页误判为 ok，需配合 backclazzdata）
fn infer_list_membership_from_html(html: &str, resource_count: usize) -> &'static str {
    if looks_like_not_joined_html(html) {
        return "not_joined";
    }
    // 有资料行 → 肯定在班
    if resource_count > 0 {
        return "ok";
    }
    // 空列表但页面含资料区/班级壳 → HTML 侧多半仍像「在班」（退课后也可能如此）
    let h = html.to_ascii_lowercase();
    if h.contains("databody")
        || h.contains("databody_td")
        || h.contains("downloadData")
        || h.contains("objectid")
        || html.contains("教师课件")
    {
        return "ok";
    }
    // 仅有通用 coursedata 字样不再视为在班
    if html.len() < 400 || h.contains("error") || h.contains("404") {
        return "unknown";
    }
    "unknown"
}

/// 合并 HTML 启发式与课程列表权威结果。
/// 课程列表明确不在班时优先 not_joined（解决退课后空壳仍显示「暂无资料」）。
fn resolve_membership(html_membership: &'static str, enrolled: Option<bool>) -> &'static str {
    match enrolled {
        Some(false) => "not_joined",
        Some(true) => {
            if html_membership == "not_joined" {
                // 列表有课但资料页明确未加入文案 → 仍以页面为准
                "not_joined"
            } else {
                "ok"
            }
        }
        None => html_membership,
    }
}

fn classify_folder(
    file_type: &str,
    object_id: &str,
    name: &str,
    inner_html: &str,
) -> (bool, String) {
    let ft = file_type.trim().to_ascii_lowercase();
    if ft == "tch-courseware"
        || inner_html.contains("toCourseware")
        || inner_html.contains("coursewareFolder")
    {
        return (true, "tch-courseware".into());
    }
    if ft == "afolder" || ft == "folder" {
        return (true, "afolder".into());
    }
    if object_id.is_empty()
        && (ft.is_empty() || ft == "dir")
        && (name.contains("文件夹")
            || name.contains("课件")
            || inner_html.contains("folder")
            || inner_html.contains("Folder"))
    {
        return (
            true,
            if name.contains("课件") {
                "tch-courseware".into()
            } else {
                "afolder".into()
            },
        );
    }
    (false, String::new())
}

fn extract_cpi_from_html(html: &str) -> String {
    let from_id = extract_hidden(html, "cpi");
    if !from_id.is_empty() {
        return from_id;
    }
    extract_js_or_attr(html, "cpi")
}

fn row_display_name(row: scraper::ElementRef<'_>, attr_name: &str) -> String {
    if !attr_name.is_empty() {
        return attr_name.to_string();
    }
    // 教师课件等无 dataname：取名称列
    if let Ok(sel) = Selector::parse(".dataBody_name_stu, .dataBody_name, dl dt, .name") {
        if let Some(n) = row.select(&sel).next() {
            let t = n.text().collect::<String>().trim().to_string();
            if !t.is_empty() {
                return t.lines().next().unwrap_or(&t).trim().to_string();
            }
        }
    }
    row.text()
        .map(|s| s.trim().to_string())
        .find(|s| !s.is_empty() && *s != "-")
        .unwrap_or_else(|| "未命名".into())
}

/// 拉取班级资料列表（根目录 / 子文件夹 / 教师课件）
pub async fn list_resources(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    opts: ListResourcesOpts,
) -> Result<Value, DynError> {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await;

    let folder_kind = opts
        .folder_kind
        .as_deref()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();

    if folder_kind == "tch-courseware" {
        return list_teacher_courseware(
            client,
            course_id,
            clazz_id,
            opts.parent_data_id.as_deref(),
            opts.cpi.as_deref(),
        )
        .await;
    }

    let mut cpi = opts.cpi.unwrap_or_default();
    if cpi.trim().is_empty() {
        cpi = "0".into();
    }
    let cpi = cpi.trim().to_string();
    let parent_id = opts
        .parent_data_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let data_name = opts.data_name.as_deref().unwrap_or("").trim();
    let parent_chain = opts.parent_chain.as_deref().unwrap_or("").trim();

    // 学生 ut=s 优先；失败或空列表时再试教师 ut=t（教师账号无需入班）
    let (html, list_url, cpi, ut_used) = fetch_datalist_student_or_teacher(
        client,
        course_id,
        clazz_id,
        &cpi,
        parent_id,
        data_name,
        parent_chain,
    )
    .await?;

    let resources = parse_stu_datalist_html(&html, course_id, clazz_id, &cpi);
    // 下载链里带上实际 ut，保证教师可下载
    let resources = rewrite_resources_ut(resources, ut_used);
    let html_membership = infer_list_membership_from_html(&html, resources.len());
    let enrolled = if parent_id.is_none() {
        is_student_enrolled_in_clazz(client, course_id, clazz_id).await
    } else {
        None
    };
    // 教师 ut=t 可访问时，即使学生列表 enrolled=false 也视为 ok
    let membership = if ut_used == "t" && !looks_like_not_joined_html(&html) {
        "ok"
    } else {
        resolve_membership(html_membership, enrolled)
    };
    let role = if ut_used == "t" {
        "teacher"
    } else if enrolled == Some(true) {
        "student"
    } else {
        "unknown"
    };

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "ut": ut_used,
        "role": role,
        "parent_data_id": parent_id.unwrap_or(""),
        "folder_kind": folder_kind,
        "count": resources.len(),
        "resources": resources,
        "list_url": list_url,
        "membership": membership,
        "enrolled": enrolled,
        "membership_html": html_membership,
    }))
}

fn build_stu_datalist_url(
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    parent_id: Option<&str>,
    data_name: &str,
    parent_chain: &str,
    ut: &str,
) -> String {
    let t = now_ms();
    if let Some(pid) = parent_id {
        format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&dataName={}&dataId={}&type=1&parent={}&clazzid={}&cpi={}&ut={}&t={}",
            urlencoding::encode(course_id.trim()),
            urlencoding::encode(data_name),
            urlencoding::encode(pid),
            urlencoding::encode(parent_chain),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(cpi),
            urlencoding::encode(ut),
            t
        )
    } else {
        format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/stu-datalist?courseid={}&clazzid={}&cpi={}&ut={}&t={}",
            urlencoding::encode(course_id.trim()),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(cpi),
            urlencoding::encode(ut),
            t
        )
    }
}

/// 学生 ut=s → 教师 ut=t；返回 (html, list_url, cpi, ut)
async fn fetch_datalist_student_or_teacher(
    client: &HbutClient,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
    parent_id: Option<&str>,
    data_name: &str,
    parent_chain: &str,
) -> Result<(String, String, String, &'static str), DynError> {
    let mut last_err: Option<DynError> = None;
    for ut in ["s", "t"] {
        let list_url = build_stu_datalist_url(
            course_id,
            clazz_id,
            cpi,
            parent_id,
            data_name,
            parent_chain,
            ut,
        );
        match get_text_with_retry(
            client,
            &list_url,
            "https://mooc2-ans.chaoxing.com/",
            if ut == "t" {
                "资料列表(教师)"
            } else {
                "资料列表"
            },
        )
        .await
        {
            Ok((html, final_url)) => {
                if looks_like_login_url(&final_url) || looks_like_login_html(&html) {
                    last_err = Some(err_box(
                        "资料页跳转登录。请重新登录融合门户以刷新学习通会话（非断网）",
                    ));
                    continue;
                }
                if looks_like_not_joined_html(&html) && ut == "s" {
                    // 学生视角未加入，继续试教师
                    last_err = Some(err_box("学生视角未加入该班级"));
                    continue;
                }
                let page_cpi = extract_cpi_from_html(&html);
                let cpi_out = if !page_cpi.is_empty() {
                    page_cpi
                } else {
                    cpi.to_string()
                };
                let parsed = parse_stu_datalist_html(&html, course_id, clazz_id, &cpi_out);
                // 学生空列表但教师可能有：根目录且 ut=s 空时再试 t
                if parsed.is_empty()
                    && ut == "s"
                    && parent_id.is_none()
                    && !looks_like_not_joined_html(&html)
                {
                    // 先记下学生结果，若教师更好则用教师
                    let teacher_url = build_stu_datalist_url(
                        course_id,
                        clazz_id,
                        &cpi_out,
                        parent_id,
                        data_name,
                        parent_chain,
                        "t",
                    );
                    if let Ok((html_t, final_t)) = get_text_with_retry(
                        client,
                        &teacher_url,
                        "https://mooc2-ans.chaoxing.com/",
                        "资料列表(教师)",
                    )
                    .await
                    {
                        if !looks_like_login_url(&final_t)
                            && !looks_like_login_html(&html_t)
                            && !looks_like_not_joined_html(&html_t)
                        {
                            let cpi_t = {
                                let p = extract_cpi_from_html(&html_t);
                                if p.is_empty() {
                                    cpi_out.clone()
                                } else {
                                    p
                                }
                            };
                            let parsed_t =
                                parse_stu_datalist_html(&html_t, course_id, clazz_id, &cpi_t);
                            if !parsed_t.is_empty()
                                || html_t.contains("dataBody")
                                || html_t.contains("教师课件")
                            {
                                return Ok((html_t, teacher_url, cpi_t, "t"));
                            }
                        }
                    }
                    return Ok((html, list_url, cpi_out, "s"));
                }
                if ut == "t" && looks_like_not_joined_html(&html) && parsed.is_empty() {
                    last_err = Some(err_box("教师视角也无法访问该班级资料"));
                    continue;
                }
                return Ok((html, list_url, cpi_out, if ut == "t" { "t" } else { "s" }));
            }
            Err(e) => {
                last_err = Some(e);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| err_box("资料列表请求失败")))
}

fn rewrite_resources_ut(mut resources: Vec<ClassResource>, ut: &str) -> Vec<ClassResource> {
    if ut != "t" {
        return resources;
    }
    for item in &mut resources {
        if !item.download_url.is_empty() {
            item.download_url = item
                .download_url
                .replace("ut=s", "ut=t")
                .replace("ut%3Ds", "ut%3Dt");
            if !item.download_url.contains("ut=") {
                let sep = if item.download_url.contains('?') {
                    '&'
                } else {
                    '?'
                };
                item.download_url = format!("{}{}ut=t", item.download_url, sep);
            }
        }
    }
    resources
}

fn parse_stu_datalist_html(
    html: &str,
    course_id: &str,
    clazz_id: &str,
    cpi: &str,
) -> Vec<ClassResource> {
    let doc = Html::parse_document(html);
    let row_sel = match Selector::parse("ul.dataBody_td, .dataBody_td") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let mut resources: Vec<ClassResource> = Vec::new();
    for row in doc.select(&row_sel) {
        let id = row.value().attr("id").unwrap_or("").trim().to_string();
        let object_id = row
            .value()
            .attr("objectid")
            .unwrap_or("")
            .trim()
            .to_string();
        let attr_name = row
            .value()
            .attr("dataname")
            .unwrap_or("")
            .trim()
            .to_string();
        let file_type = row.value().attr("type").unwrap_or("").trim().to_string();
        let isdown = row.value().attr("isdown").unwrap_or("").trim();
        let inner = row.inner_html();
        let name = row_display_name(row, &attr_name);
        let (is_folder, folder_kind) = classify_folder(&file_type, &object_id, &name, &inner);

        // 跳过完全空行
        if id.is_empty() && name.is_empty() && !is_folder {
            continue;
        }
        // 教师课件无 id 也要保留
        if id.is_empty() && !is_folder && object_id.is_empty() {
            continue;
        }

        let texts: Vec<String> = row
            .text()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let size_label = texts
            .iter()
            .find(|s| s.contains("MB") || s.contains("KB") || s.contains("GB") || *s == "-")
            .cloned()
            .unwrap_or_else(|| "-".into());
        let is_downloadable = !is_folder && isdown != "0" && !id.is_empty();
        let download_url = if is_downloadable {
            format!(
                "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
                urlencoding::encode(&id),
                urlencoding::encode(clazz_id.trim()),
                urlencoding::encode(cpi),
                urlencoding::encode(course_id.trim())
            )
        } else {
            String::new()
        };
        // 仅作弱降级标记，主预览禁止依赖此 URL
        let preview_cdn_url = if object_id.is_empty() {
            String::new()
        } else {
            format!("https://p.ananas.chaoxing.com/star3/origin/{object_id}")
        };
        let thumbnail_url = build_thumbnail_url(&object_id, &name, &file_type);
        resources.push(ClassResource {
            data_id: id,
            name,
            file_type,
            object_id,
            size_label,
            creator: texts
                .iter()
                .find(|s| {
                    !s.contains("MB")
                        && !s.contains("KB")
                        && !s.contains("GB")
                        && !s.contains('-')
                        && s.chars().count() < 20
                        && *s != "-"
                })
                .cloned()
                .unwrap_or_default(),
            created_at: texts
                .iter()
                .find(|s| {
                    s.contains('-') && (s.contains(':') || s.chars().any(|c| c.is_ascii_digit()))
                })
                .cloned()
                .unwrap_or_default(),
            is_folder,
            folder_kind,
            download_url,
            preview_cdn_url,
            thumbnail_url,
            is_downloadable,
        });
    }
    resources
}

/// 教师课件列表 API（mobilelearn）
async fn list_teacher_courseware(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    parent_folder_id: Option<&str>,
    cpi: Option<&str>,
) -> Result<Value, DynError> {
    let parent = parent_folder_id.unwrap_or("0").trim();
    let parent = if parent.is_empty() { "0" } else { parent };
    let api = format!(
        "https://mobilelearn.chaoxing.com/v2/apis/activePlan/getStudentCourseWareList?DB_STRATEGY=COURSEID&STRATEGY_PARA=courseId&classId={}&courseId={}&page=1&pageSize=50&parentFolderId={}&keyWord=&search=0&createUid=-1&orderByCreateTime=-1&_={}",
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(course_id.trim()),
        urlencoding::encode(parent),
        now_ms()
    );
    let (text, _) = get_text_with_retry(
        client,
        &api,
        "https://mobilelearn.chaoxing.com/",
        "教师课件列表",
    )
    .await?;
    if looks_like_login_html(&text) {
        return Err(err_box("教师课件接口跳转登录，请重登门户"));
    }
    let payload: Value =
        serde_json::from_str(&text).map_err(|e| err_box(format!("教师课件响应非 JSON: {}", e)))?;
    let list = payload
        .pointer("/data/list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let cpi = cpi.unwrap_or("0");
    let mut resources = Vec::new();
    for item in list {
        let data_id = item
            .get("id")
            .or_else(|| item.get("dataId"))
            .or_else(|| item.get("aid"))
            .map(|v| v.to_string().trim_matches('"').to_string())
            .unwrap_or_default();
        let name = item
            .get("name")
            .or_else(|| item.get("title"))
            .or_else(|| item.get("dataName"))
            .and_then(|v| v.as_str())
            .unwrap_or("未命名")
            .to_string();
        let object_id = item
            .get("objectId")
            .or_else(|| item.get("objectid"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let file_type = item
            .get("type")
            .or_else(|| item.get("dataType"))
            .or_else(|| item.get("extension"))
            .map(|v| v.as_str().unwrap_or("").to_string())
            .unwrap_or_default();
        let is_folder = item
            .get("isFolder")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
            || file_type.eq_ignore_ascii_case("folder")
            || file_type.eq_ignore_ascii_case("afolder");
        let download_url = if !is_folder && !data_id.is_empty() {
            format!(
                "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut=s",
                urlencoding::encode(&data_id),
                urlencoding::encode(clazz_id.trim()),
                urlencoding::encode(cpi),
                urlencoding::encode(course_id.trim())
            )
        } else {
            String::new()
        };
        let thumbnail_url = build_thumbnail_url(&object_id, &name, &file_type);
        resources.push(ClassResource {
            data_id: data_id.clone(),
            name: name.clone(),
            file_type: file_type.clone(),
            object_id: object_id.clone(),
            size_label: item
                .get("size")
                .or_else(|| item.get("sizeLabel"))
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_else(|| "-".into()),
            creator: item
                .get("creatorName")
                .or_else(|| item.get("createName"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            created_at: item
                .get("createTime")
                .or_else(|| item.get("updateTime"))
                .map(|v| v.to_string().trim_matches('"').to_string())
                .unwrap_or_default(),
            is_folder,
            folder_kind: if is_folder {
                "tch-courseware".into()
            } else {
                String::new()
            },
            download_url,
            preview_cdn_url: if object_id.is_empty() {
                String::new()
            } else {
                format!("https://p.ananas.chaoxing.com/star3/origin/{object_id}")
            },
            thumbnail_url,
            is_downloadable: !is_folder && !data_id.is_empty(),
        });
    }

    Ok(json!({
        "success": true,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "folder_kind": "tch-courseware",
        "parent_data_id": parent,
        "count": resources.len(),
        "resources": resources,
        "list_url": format!(
            "https://mobilelearn.chaoxing.com/page/ppt/studentCourseware/studentCoursewareList?courseId={}&classId={}",
            course_id, clazz_id
        ),
        "raw_total": payload.pointer("/data/allCount").cloned().unwrap_or(json!(resources.len())),
    }))
}

/// 官方预览：必须 get-preview-url；图片优先直链 `<img>`，避免 iframe 黑屏
pub async fn resolve_resource_access(
    client: &mut HbutClient,
    course_id: &str,
    clazz_id: &str,
    data_id: &str,
    object_id: Option<&str>,
    cpi: Option<&str>,
    file_name: Option<&str>,
    file_type: Option<&str>,
) -> Result<Value, DynError> {
    let _ = crate::modules::chaoxing_sso::ensure_chaoxing_sso(
        client,
        None,
        crate::modules::chaoxing_sso::EnsureSsoOptions {
            force: false,
            allow_silent_relogin: true,
            preheated: false,
            portal_password: None,
        },
    )
    .await;

    let cpi = cpi.unwrap_or("0").trim();
    let oid = object_id.map(str::trim).unwrap_or("").to_string();
    let fname = file_name.unwrap_or("").trim();
    let ftype = file_type.unwrap_or("").trim();
    let is_image = looks_like_image(fname, ftype);
    let is_video = looks_like_video(fname, ftype);

    // 学生 ut=s / 教师 ut=t 双试预览与下载
    let mut preview_url = String::new();
    let mut preview_status = false;
    let mut raw_preview = Value::Null;
    let mut used_ut = "s";
    for ut in ["s", "t"] {
        let probe = format!(
            "https://mooc2-ans.chaoxing.com/mooc2-ans/coursedata/get-preview-url?dataId={}&cpi={}&clazzid={}&ut={}&courseid={}",
            urlencoding::encode(data_id.trim()),
            urlencoding::encode(cpi),
            urlencoding::encode(clazz_id.trim()),
            urlencoding::encode(ut),
            urlencoding::encode(course_id.trim())
        );
        if let Ok(resp) = client
            .client
            .get(&probe)
            .header("Referer", "https://mooc2-ans.chaoxing.com/")
            .send()
            .await
        {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    let ok = v.get("status").and_then(|x| x.as_bool()).unwrap_or(false);
                    let u = v
                        .get("url")
                        .or_else(|| v.get("previewUrl"))
                        .or_else(|| v.pointer("/data/url"))
                        .and_then(|x| x.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_default();
                    if ok && !u.is_empty() {
                        raw_preview = v;
                        preview_status = true;
                        preview_url = normalize_url(&u);
                        used_ut = ut;
                        break;
                    }
                    if raw_preview.is_null() {
                        raw_preview = v;
                    }
                } else if text.trim().starts_with("http") {
                    preview_url = normalize_url(text.trim());
                    preview_status = true;
                    used_ut = ut;
                    break;
                }
            }
        }
    }
    let download_url = format!(
        "https://mooc1.chaoxing.com/coursedata/downloadData?dataId={}&classId={}&cpi={}&courseId={}&ut={}",
        urlencoding::encode(data_id.trim()),
        urlencoding::encode(clazz_id.trim()),
        urlencoding::encode(cpi),
        urlencoding::encode(course_id.trim()),
        used_ut
    );

    // ananas/status 常返回可直链的 http(s) 字段（图片/视频）
    let mut ananas_http = String::new();
    let mut raw_ananas = Value::Null;
    if !oid.is_empty() {
        let status_url = format!(
            "https://mooc1.chaoxing.com/ananas/status/{}?k=&flag=normal&_={}",
            urlencoding::encode(&oid),
            now_ms()
        );
        if let Ok(resp) = client
            .client
            .get(&status_url)
            .header(
                "Referer",
                "https://mooc1.chaoxing.com/ananas/modules/video/index.html",
            )
            .send()
            .await
        {
            if let Ok(text) = resp.text().await {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    raw_ananas = v.clone();
                    for key in ["https", "http", "download", "pdf", "thumb"] {
                        if let Some(u) = v.get(key).and_then(|x| x.as_str()) {
                            let n = normalize_url(u);
                            if !n.is_empty() {
                                ananas_http = n;
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    let fallback_cdn = if oid.is_empty() {
        String::new()
    } else {
        format!("https://p.ananas.chaoxing.com/star3/origin/{oid}")
    };

    let mut candidates: Vec<String> = Vec::new();
    let push_unique = |list: &mut Vec<String>, u: String| {
        let t = u.trim().to_string();
        if t.is_empty() {
            return;
        }
        if !list.iter().any(|x| x == &t) {
            list.push(t);
        }
    };

    // 图片：必须走 <img> 直链；WebView iframe 不共享 reqwest cookie，objectshowpreview 易黑屏
    let mut preview_mode = if is_image {
        "image"
    } else if is_video {
        "iframe"
    } else {
        "iframe"
    }
    .to_string();

    if is_image {
        if !ananas_http.is_empty() {
            push_unique(&mut candidates, ananas_http.clone());
        }
        if !preview_url.is_empty() && is_direct_media_url(&preview_url) {
            push_unique(&mut candidates, preview_url.clone());
        }
        // 鉴权下载（依赖客户端 cookie，前端无法直接用；优先尝试服务端转 data URL）
        if let Some(data_url) = try_fetch_image_data_url(client, &download_url).await {
            push_unique(&mut candidates, data_url);
            preview_status = true;
        }
        for u in build_image_cdn_candidates(&oid) {
            push_unique(&mut candidates, u);
        }
        if !preview_url.is_empty() {
            push_unique(&mut candidates, preview_url.clone());
        }
        if candidates.is_empty() && !download_url.is_empty() {
            // 最后：系统打开下载链
            push_unique(&mut candidates, download_url.clone());
        }
        preview_url = candidates.first().cloned().unwrap_or_default();
    } else {
        if preview_url.is_empty() {
            if !ananas_http.is_empty() {
                preview_url = ananas_http.clone();
            } else {
                preview_url = fallback_cdn.clone();
            }
        }
        if !preview_url.is_empty() {
            push_unique(&mut candidates, preview_url.clone());
        }
        if !ananas_http.is_empty() {
            push_unique(&mut candidates, ananas_http.clone());
        }
        // 若官方页是 HTML 预览器，保持 iframe；若已是直链媒体可前端降级
        if is_direct_media_url(&preview_url) && is_video {
            preview_mode = "video".into();
        }
    }

    let official = preview_status
        && !preview_url.contains("star3/origin")
        && !preview_url.starts_with("data:");

    Ok(json!({
        "success": true,
        "download_url": download_url,
        "preview_url": preview_url,
        "preview_mode": preview_mode,
        "preview_candidates": candidates,
        "thumbnail_url": build_thumbnail_url(&oid, fname, ftype),
        "official_preview": official,
        "fallback_cdn_url": fallback_cdn,
        "embeddable": preview_status || !preview_url.is_empty(),
        "data_id": data_id,
        "course_id": course_id,
        "clazz_id": clazz_id,
        "cpi": cpi,
        "raw": raw_preview,
        "ananas": raw_ananas,
    }))
}

/// 用会话 cookie 拉取图片并转为 data URL，供 WebView `<img>` 直显（绕开 iframe cookie 隔离）
async fn try_fetch_image_data_url(client: &HbutClient, download_url: &str) -> Option<String> {
    use base64::{engine::general_purpose, Engine as _};
    let resp = client
        .client
        .get(download_url)
        .header("Referer", "https://mooc2-ans.chaoxing.com/")
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let ctype = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    // 下载接口有时返回 application/octet-stream，仍可能是图
    let bytes = resp.bytes().await.ok()?;
    if bytes.len() < 32 || bytes.len() > 12 * 1024 * 1024 {
        return None;
    }
    let sniff = if ctype.starts_with("image/") {
        ctype
            .split(';')
            .next()
            .unwrap_or("image/jpeg")
            .trim()
            .to_string()
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg".into()
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png".into()
    } else if bytes.starts_with(b"GIF8") {
        "image/gif".into()
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp".into()
    } else {
        return None;
    };
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Some(format!("data:{sniff};base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::super::parse::looks_like_not_joined_html;
    use super::*;

    #[test]
    fn detect_not_joined_and_membership() {
        assert!(looks_like_not_joined_html("你还没有加入该课程，请先加入"));
        assert!(!looks_like_not_joined_html(
            r#"<ul class="dataBody_td" id="1"></ul>"#
        ));
        assert_eq!(
            infer_list_membership_from_html("请先加入班级后再查看资料", 0),
            "not_joined"
        );
        assert_eq!(
            infer_list_membership_from_html(r#"<ul class="dataBody_td" id="x"></ul>班级资料"#, 0),
            "ok"
        );
        assert_eq!(
            infer_list_membership_from_html(r#"<ul class="dataBody_td"></ul>"#, 3),
            "ok"
        );
        // 退课后：课程列表明确不在班 → 即使 HTML 像空资料页也是 not_joined
        assert_eq!(resolve_membership("ok", Some(false)), "not_joined");
        assert_eq!(resolve_membership("unknown", Some(false)), "not_joined");
        assert_eq!(resolve_membership("ok", Some(true)), "ok");
        assert_eq!(resolve_membership("unknown", None), "unknown");
    }

    #[test]
    fn classify_tch_courseware_folder() {
        let (is_f, kind) = classify_folder(
            "tch-courseware",
            "",
            "教师课件",
            r#"onclick="toCourseware()" coursewareFolder.png"#,
        );
        assert!(is_f);
        assert_eq!(kind, "tch-courseware");
    }

    #[test]
    fn classify_afolder() {
        let (is_f, kind) = classify_folder("afolder", "", "作业", "");
        assert!(is_f);
        assert_eq!(kind, "afolder");
    }

    #[test]
    fn parse_datalist_detects_folder_and_files() {
        let html = r#"
        <input id="cpi" value="509967218" />
        <ul class="dataBody_td" type="tch-courseware">
          <li class="dataBody_file" onclick="toCourseware()"><img src="/coursewareFolder.png"></li>
          <li class="dataBody_name_stu"><dl><dt>教师课件</dt></dl></li>
        </ul>
        <ul class="dataBody_td" id="132" objectid="abc" dataname="a.mp4" type="mp4" isdown="1">
          <li>a.mp4</li><li>10MB</li>
        </ul>
        "#;
        let list = parse_stu_datalist_html(html, "1", "2", "509967218");
        assert!(list
            .iter()
            .any(|r| r.is_folder && r.folder_kind == "tch-courseware"));
        assert!(list
            .iter()
            .any(|r| r.file_type == "mp4" && r.is_downloadable));
        assert_eq!(extract_cpi_from_html(html), "509967218");
    }

    #[test]
    fn image_thumbnail_url_for_jpg() {
        let u = build_thumbnail_url("abc123", "photo.JPG", "jpg");
        assert!(u.contains("150_150c/abc123"));
        assert!(looks_like_image("a.png", ""));
        assert!(!looks_like_image("a.mp4", "mp4"));
        assert!(is_direct_media_url(
            "https://p.ananas.chaoxing.com/star3/origin/x"
        ));
        assert!(!is_direct_media_url(
            "https://pan-yz.chaoxing.com/preview/v2/objectshowpreview.html?x=1"
        ));
    }

    #[test]
    fn parse_datalist_sets_thumbnail_for_image() {
        let html = r#"
        <ul class="dataBody_td" id="9" objectid="oidimg" dataname="shot.jpg" type="jpg" isdown="1">
          <li>shot.jpg</li><li>1MB</li>
        </ul>
        "#;
        let list = parse_stu_datalist_html(html, "1", "2", "3");
        let img = list.iter().find(|r| r.name.contains("shot")).unwrap();
        assert!(img.thumbnail_url.contains("150_150c/oidimg"));
    }
}
