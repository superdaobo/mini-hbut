//! 课表扩展：班级列表 / 教室列表 / 课表页 URL（教师只读）—— goal-21 / T04b2。
//!
//! ## 实测事实（2026-11-20 教师账号）
//!
//! | 用途 | 接口 | 实测 |
//! | --- | --- | --- |
//! | 班级列表 | `/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1` | 200，**total 3315** |
//! | 教室列表 | `/admin/pkgl/pkglcroomkb/ajaxListCustom` | 200，**total 1741** |
//! | 班级课表页 | `/admin/pkgl/kbcx/bjkb/ckbjkb?id=&xnxq=&bjbh=&xqdm=` | 200，**67KB HTML** |
//!
//! ## 两个必须记住的坑
//!
//! 1. **`qryBjxx` 必须带 `qx=1`**：不带时实测恒返回 `total=0`（看起来像「教师无班级」，
//!    实际是参数缺失）。
//! 2. **班级课表没有 JSON 接口**：`ckbjkb` 把课表直接渲染进 `<td>` 网格
//!    （含 `rowspan`），页内 `kbjcObj` 是空对象、`kbSnapshot` 是 HTML 快照。
//!    解析这种网格的脆弱性远高于收益，因此本模块**只生成课表页 URL**，
//!    由前端用 WebView 承载（与学习通作业/考试的取舍一致）。

use serde_json::{json, Value};

use super::grid;
use super::readonly;
use crate::http_client::HbutClient;

/// 班级列表默认条数（一次取够教师常查的范围；超过走分页）。
pub(crate) const CLASS_LIST_PAGE_SIZE: u32 = 200;
/// 教室列表默认条数（实测 1741 条，200 条足够首屏筛选）。
pub(crate) const ROOM_LIST_PAGE_SIZE: u32 = 200;

/// 归一化一条班级记录。
///
/// 字段映射：`bjbh`→`classNo`、`bjmc`→`className`、`bjrs`→`studentCount`、
/// `rxnf`→`enrollYear`、`xqdm`→`campusId`、`yxmc`→`departmentName`、
/// `zymc`→`majorName`、`encodeId`→`encodeId`（生成课表页 URL 用）。
pub(crate) fn normalize_class(record: &Value) -> Value {
    json!({
        "classNo": grid::text_field(record, "bjbh"),
        "className": grid::text_field(record, "bjmc"),
        "studentCount": grid::number_field(record, "bjrs"),
        "enrollYear": grid::text_field(record, "rxnf"),
        "campusId": grid::text_field(record, "xqdm"),
        "departmentName": grid::text_field(record, "yxmc"),
        "majorName": grid::text_field(record, "zymc"),
        "encodeId": grid::text_field(record, "encodeId"),
        "semester": grid::text_field(record, "xnxq"),
    })
}

/// 归一化一条教室记录。
///
/// 字段映射：`jsbh`→`roomNo`、`jsmc`→`roomName`、`jxldm`→`buildingId`、
/// `jxlmc`→`buildingName`、`xqmc`→`campusName`、`jslx`→`roomType`、
/// `zdskrnrs`→`capacity`。
pub(crate) fn normalize_room(record: &Value) -> Value {
    json!({
        "roomNo": grid::text_field(record, "jsbh"),
        "roomName": grid::text_field(record, "jsmc"),
        "buildingId": grid::text_field(record, "jxldm"),
        "buildingName": grid::text_field(record, "jxlmc"),
        "campusName": grid::text_field(record, "xqmc"),
        "roomType": grid::text_field(record, "jslx"),
        "capacity": grid::number_field(record, "zdskrnrs"),
        // goal-22：教室课表接口必须要 encodeId，必须透传（否则前端无从发起查询）
        "encodeId": grid::text_field(record, "encodeId"),
        "semester": grid::text_field(record, "xnxq"),
    })
}

/// 生成班级课表页 URL（供前端 WebView 承载）。
///
/// 四个参数缺一不可（实测空参数返回 589B 错误页）：
/// `id`(encodeId) + `xnxq` + `bjbh` + `xqdm`。
pub(crate) fn build_class_schedule_url(
    jwxt_base_url: &str,
    encode_id: &str,
    semester: &str,
    class_no: &str,
    campus_id: &str,
) -> String {
    format!(
        "{}{}?id={}&xnxq={}&bjbh={}&xqdm={}",
        jwxt_base_url,
        readonly::PATH_CLASS_SCHEDULE_PAGE,
        urlencoding::encode(encode_id),
        urlencoding::encode(semester),
        urlencoding::encode(class_no),
        urlencoding::encode(campus_id),
    )
}

/// 拉取班级列表与教室列表，返回 `{ classes, rooms }`。
pub(crate) async fn fetch_schedule_lists_with(
    client: &HbutClient,
    semester: Option<String>,
    keyword: Option<String>,
) -> Result<Value, String> {
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_CLASS_LIST
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_ROOM_LIST
    ));

    let semester = semester
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let class_referer = format!("{}/admin/", client.jwxt_base_url());
    let room_referer = format!("{}/admin/", client.jwxt_base_url());

    let class_size = CLASS_LIST_PAGE_SIZE.to_string();
    let room_size = ROOM_LIST_PAGE_SIZE.to_string();
    // `qx=1` 是班级列表的必需参数（不带时恒返回 0 条）。
    let mut class_params: Vec<(&str, &str)> = vec![
        ("qx", "1"),
        ("showLastRxnf", ""),
        ("kyzt", ""),
        ("page.pn", "1"),
        ("page.size", class_size.as_str()),
    ];
    // 教室列表不支持服务端过滤，这里只带分页参数（搜索由前端本地做）
    let room_params: Vec<(&str, &str)> =
        vec![("page.pn", "1"), ("page.size", room_size.as_str())];

    let keyword_owned = keyword
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(keyword) = keyword_owned.as_deref() {
        // ⚠️ 实测（2026-11-21）：
        // - **班级列表**支持服务端过滤，参数是裸 `bjmc`：
        //     bjmc=25建筑学2   → total=1（命中）
        //     query.bjmc||=…   → total=3315（无效）
        // - **教室列表不支持服务端过滤**：
        //     jsmc=篮球馆303   → total=0（被当精确匹配且不命中）
        //     query.jsmc||=…   → total=1741（无效）
        //   所以教室的搜索必须由前端**本地过滤**（`schedule_extra` 不传 keyword）。
        class_params.push(("bjmc", keyword));
    }

    let (class_result, room_result) = tokio::join!(
        grid::fetch_grid_with_params(
            client,
            readonly::PATH_CLASS_LIST,
            semester.as_deref(),
            &class_referer,
            &class_params
        ),
        grid::fetch_grid_with_params(
            client,
            readonly::PATH_ROOM_LIST,
            semester.as_deref(),
            &room_referer,
            &room_params
        ),
    );

    let class_payload = class_result?;
    let room_payload = room_result?;

    // 为每个班级直接生成课表页 URL：前端拿到就能交给 WebView，
    // 不必自己拼四个参数（拼错任何一个都会得到 589B 的错误页）。
    let jwxt_base = client.jwxt_base_url();
    let classes: Vec<Value> = grid::parse_grid_list(&class_payload)
        .iter()
        .map(|record| {
            let mut normalized = normalize_class(record);
            let encode = normalized
                .get("encodeId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let class_no = normalized
                .get("classNo")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let campus = normalized
                .get("campusId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let class_semester = normalized
                .get("semester")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if !encode.is_empty() && !class_no.is_empty() && !campus.is_empty() {
                let url = build_class_schedule_url(jwxt_base,
                    &encode,
                    &class_semester,
                    &class_no,
                    &campus,
                );
                if let Some(object) = normalized.as_object_mut() {
                    object.insert("scheduleUrl".to_string(), json!(url));
                }
            }
            normalized
        })
        .collect();
    let rooms: Vec<Value> = grid::parse_grid_list(&room_payload)
        .iter()
        .map(normalize_room)
        .collect();

    let class_total = class_payload
        .get("total")
        .and_then(Value::as_i64)
        .unwrap_or(classes.len() as i64);
    let room_total = room_payload
        .get("total")
        .and_then(Value::as_i64)
        .unwrap_or(rooms.len() as i64);

    crate::hbut_debug!(
        "[TeacherScheduleExtra] 班级 {} 条（总 {}）/ 教室 {} 条（总 {}）",
        classes.len(),
        class_total,
        rooms.len(),
        room_total
    );

    // 课表本身没有 JSON 接口 —— 明确告知前端走 WebView，而不是返回空数据。
    Ok(json!({
        "classes": classes,
        "classTotal": class_total,
        "rooms": rooms,
        "roomTotal": room_total,
        "scheduleSource": {
            "kind": "server-rendered-html",
            "pagePath": readonly::PATH_CLASS_SCHEDULE_PAGE,
            "reason": "班级课表数据渲染在 ckbjkb 页面的 <td> 网格里（含 rowspan），无 JSON 接口；请用 WebView 承载该页 URL",
            "requiresParams": ["encodeId", "semester", "classNo", "campusId"],
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_class_maps_fields() {
        let record = json!({
            "bjbh": "25建筑学2",
            "bjmc": "25建筑学2班",
            "bjrs": "61",
            "rxnf": "2025",
            "xqdm": "1",
            "yxmc": "土木建筑与环境学院",
            "zymc": "建筑学",
            "encodeId": "ENC123",
            "xnxq": "2026-2027-1",
            "currentUserName": "张三"
        });
        let out = normalize_class(&record);
        assert_eq!(out.get("classNo").and_then(Value::as_str), Some("25建筑学2"));
        assert_eq!(out.get("studentCount").and_then(Value::as_f64), Some(61.0));
        assert_eq!(out.get("encodeId").and_then(Value::as_str), Some("ENC123"));
        assert!(out.get("currentUserName").is_none());
    }

    #[test]
    fn normalize_room_maps_fields() {
        let record = json!({
            "jsbh": "3-305",
            "jsmc": "3号-305",
            "jxldm": "24",
            "jxlmc": "3号",
            "xqmc": "本部",
            "jslx": "05",
            "zdskrnrs": "60"
        });
        let out = normalize_room(&record);
        assert_eq!(out.get("roomNo").and_then(Value::as_str), Some("3-305"));
        assert_eq!(out.get("buildingName").and_then(Value::as_str), Some("3号"));
        assert_eq!(out.get("capacity").and_then(Value::as_f64), Some(60.0));
    }

    #[test]
    fn class_schedule_url_encodes_params() {
        let url = build_class_schedule_url(
            "https://jwxt.hbut.edu.cn",
            "ENC+1",
            "2026-2027-1",
            "25建筑学2",
            "1",
        );
        assert!(url.starts_with("https://jwxt.hbut.edu.cn/admin/pkgl/kbcx/bjkb/ckbjkb?id="));
        assert!(url.contains("xnxq=2026-2027-1"));
        assert!(url.contains("bjbh=25%E5%BB%BA%E7%AD%91%E5%AD%A62"));
        // encodeId 里的 `+` 必须被转义
        assert!(url.contains("id=ENC%2B1"));
    }
}
