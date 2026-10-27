//! 教师教务**只读路径 allowlist**（Teacher Portal V2 / #1019 安全红线唯一事实源）。
//!
//! 依据：[`data/teacher-api-recon/07-write-endpoints-denylist.md`] 的「接入时的硬性规则」。
//!
//! 硬性规则（任何教师业务代码都必须遵守）：
//! 1. **只用 GET**；唯一例外是 `POST /admin/getMenuList`（已实测无副作用的纯查询 POST）；
//! 2. 任何路径命中写动词词根（见 [`TEACHER_WRITE_VERB_ROOTS`]）即**拒绝调用**；
//! 3. 任何非 GET 请求默认拒绝，必须逐条登记；
//! 4. 需要「导出」时，在**客户端**用已获取的 JSON 自行生成文件，不调服务端 export/print/report。
//!
//! ⚠️ 本文件是**唯一**允许出现教师教务路径字面量的地方。
//! 新增教师接口时必须先在此登记，再由 `application/teacher.rs` 的
//! [`crate::application::TeacherService`] 校验放行；未登记路径一律 fail-closed。
//!
//! E0 阶段这些路径**尚未被真正请求**（各业务模块是 stub）；登记的目的是：
//! - 让 E2/E4/E5/E6 有明确、已审查的只读边界；
//! - 让安全契约测试可机械断言「无写动词」且「使用的路径都已登记」。

/// 教师教务只读路径登记项。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TeacherReadonlyPath {
    /// 相对教务站点的路径（`/admin/...`；`{...}` 为占位段，不参与精确匹配）。
    pub path: &'static str,
    /// 用途说明（中文，供人工审查）。
    pub purpose: &'static str,
    /// 是否允许以 POST 调用（仅已确认的纯查询 POST 为 `true`）。
    pub post_ok: bool,
}

// ── 身份（recon 02）────────────────────────────────────────────
/// 教务首页（服务端渲染身份：`#roleId` / `.admin_name` / `.arrowbt`）。
pub const PATH_TEACHER_HOME: &str = "/admin/?loginType=1";
/// 菜单树（POST 纯查询；含 `currentRoleId` / `currentDepartmentId` / `currentUserName`）。
pub const PATH_GET_MENU_LIST: &str = "/admin/getMenuList";

// ── 课表（recon 03；V1 已实现，登记以便审查）──────────────────
/// 教师端个人课表页（取服务端加密 `teacherId`）。
pub const PATH_TEACHER_SCHEDULE_PAGE: &str = "/admin/pkgl/pkgljskb/queryKbForJsd";
/// 教师课表数据（`id` = 加密 teacherId，`xnxq` = 学期）。
pub const PATH_TEACHER_SCHEDULE_DATA: &str = "/admin/pkgl/pkgljskb/getJskbByXqid";

// ── 教学（recon 04）────────────────────────────────────────────
/// 我的教学任务（jqGrid，实测 total=6）。
pub const PATH_TEACHING_TASKS: &str = "/admin/jsd/jxrw/ajaxListJsJxrw";
/// 我的教学班（jqGrid，实测 total=4；与教学任务粒度不同，按 `jxbid` 关联）。
pub const PATH_TEACHING_CLASSES: &str = "/admin/jsd/jsdcjcx/jsdQueryJxbList";

// ── 考试与监考（recon 05）──────────────────────────────────────
/// 我的监考安排（jqGrid，实测 total=1）。
pub const PATH_INVIGILATION_LIST: &str = "/admin/jsd/kwglJsdJkcx/ajaxJsjkList";
/// 任课班级考试（jqGrid，实测 total=1）。
pub const PATH_COURSE_EXAM_LIST: &str = "/admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList";

// ── 通知（recon 06）────────────────────────────────────────────
/// 通知收件箱（jqGrid，实测 total=15；`title` 含 HTML，需清洗）。
pub const PATH_NOTICE_INBOX: &str = "/admin/system/tzsjx/ajaxList";
/// 我发布的通知（jqGrid，实测 total=0）。
pub const PATH_NOTICE_MINE: &str = "/admin/jsd/notice/ajaxList1";

// ── 只读工作流（recon 06；E7 延期，登记备用）──────────────────
/// 我的申请（jqGrid，实测 total=2）。
pub const PATH_WORKFLOW_MY_APPLY: &str = "/admin/activiti/myApply/qryMyApply";
/// 我的经办（jqGrid，实测 total=2）。
pub const PATH_WORKFLOW_MY_HANDLED: &str = "/admin/activiti/myApply/qryOperationApply";
/// 我的待办（jqGrid，实测 total=0）。
pub const PATH_WORKFLOW_MY_TODO: &str = "/admin/activiti/dbsy/listRunningProcessInstaces";

// ── 教务共用查询（recon 03/04；E4 适配）────────────────────────
/// 教师空教室查询（recon 04 §2.4 记录 `getZyKjs`）。
///
/// ⚠️ **必须用 POST**：学校页面 `toZyKjsPage` 自身以 `mtype:"post"` + jqGrid `postData`
/// 调用本接口（见 `09-classroom-teacher-probe-2026-10-16.md` §1）；GET 只会返回未筛选的
/// 资源目录。POST 表单字段为纯查询条件（`xnxq/zcStr/xqStr/jcStr/type/jxldm/...`），
/// 无任何写动词，实测无副作用。
pub const PATH_FREE_CLASSROOMS: &str = "/admin/system/jxzy/jsxx/getZyKjs";
/// 空教室查询页（教师端正式来源页；用于取 Referer 与确认页面契约）。
pub const PATH_FREE_CLASSROOMS_PAGE: &str = "/admin/system/jxzy/jsxx/toZyKjsPage";
/// 周次字典（实测裸数组，业务字段仅 `zc`，取值 `0..=21`）。
pub const PATH_CLASSROOM_WEEKS: &str = "/admin/system/jxzy/jsxx/getZcByXnxq";
/// 指定周次的 7 天日期（实测 `{ret,msg,data:[{xq,rq,xqmc}]}`，`rq` 为 `MM.DD`）。
pub const PATH_CLASSROOM_WEEK_DATES: &str = "/admin/system/jxzy/jsxx/getXqrqxx";
/// 教学楼字典（实测 `xqdm=1` 返回 35 栋；教师空教室资源域只覆盖其中 6 栋）。
pub const PATH_CLASSROOM_BUILDINGS: &str = "/admin/pkgl/pkjssz/getJxlList";
/// 节次时间表（实测 11 小节 + `djs` 大节号 + `sjd` 时段）。
pub const PATH_CLASSROOM_PERIODS: &str = "/admin/pkgl/pkglqxzkb/getJcinfo";
/// 教师全校课表查询（recon 07 D 类）。
pub const PATH_QXZKB_QUERY: &str = "/admin/jsd/qxzkb/queryQxkbPage";
/// 教师校历数据（`{xnxq}` 为学期占位段）。
pub const PATH_CALENDAR_DATA: &str = "/admin/system/zy/xlgl/getData/{xnxq}";

/// 教师教务只读路径 allowlist（唯一事实源）。
pub const TEACHER_READONLY_PATHS: &[TeacherReadonlyPath] = &[
    TeacherReadonlyPath {
        path: PATH_TEACHER_HOME,
        purpose: "教务首页：解析教师身份（工号 / 姓名 / 角色）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_GET_MENU_LIST,
        purpose: "菜单树：读取 currentDepartmentId 等身份字段（纯查询 POST）",
        post_ok: true,
    },
    TeacherReadonlyPath {
        path: PATH_TEACHER_SCHEDULE_PAGE,
        purpose: "教师课表页：抓取服务端加密 teacherId（V1 已实现）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_TEACHER_SCHEDULE_DATA,
        purpose: "教师课表数据（V1 已实现，按身份分派）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_TEACHING_TASKS,
        purpose: "我的教学任务（E5）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_TEACHING_CLASSES,
        purpose: "我的教学班（E5）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_INVIGILATION_LIST,
        purpose: "我的监考安排（E6）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_COURSE_EXAM_LIST,
        purpose: "任课班级考试（E6）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_NOTICE_INBOX,
        purpose: "教务通知收件箱（E3，只读；标记已读仅本地）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_NOTICE_MINE,
        purpose: "我发布的通知（E3，只读）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_WORKFLOW_MY_APPLY,
        purpose: "只读工作流：我的申请（E7 延期）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_WORKFLOW_MY_HANDLED,
        purpose: "只读工作流：我的经办（E7 延期）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_WORKFLOW_MY_TODO,
        purpose: "只读工作流：我的待办（E7 延期）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_FREE_CLASSROOMS,
        purpose: "教师空教室查询（E4；必须 POST，见 09 号报告 §1）",
        post_ok: true,
    },
    TeacherReadonlyPath {
        path: PATH_FREE_CLASSROOMS_PAGE,
        purpose: "空教室查询页（取 Referer / 确认页面契约）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_CLASSROOM_WEEKS,
        purpose: "空教室周次字典（纯查询 POST）",
        post_ok: true,
    },
    TeacherReadonlyPath {
        path: PATH_CLASSROOM_WEEK_DATES,
        purpose: "空教室按周日期（纯查询 POST；仅传 xnxq 时返回 500）",
        post_ok: true,
    },
    TeacherReadonlyPath {
        path: PATH_CLASSROOM_BUILDINGS,
        purpose: "教学楼字典（纯查询 POST）",
        post_ok: true,
    },
    TeacherReadonlyPath {
        path: PATH_CLASSROOM_PERIODS,
        purpose: "节次时间表（GET）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_QXZKB_QUERY,
        purpose: "教师全校课表查询（E4）",
        post_ok: false,
    },
    TeacherReadonlyPath {
        path: PATH_CALENDAR_DATA,
        purpose: "教师校历数据（E4）",
        post_ok: false,
    },
];

/// 允许以 POST 调用的**纯查询**路径（fail-closed：不在此集合内一律只允许 GET）。
///
/// 每一项都必须有实测证据表明它是学校页面自身的查询形态、且无副作用；
/// 证据见 `data/teacher-api-recon/09-classroom-teacher-probe-2026-10-16.md`。
pub const TEACHER_QUERY_POST_PATHS: &[&str] = &[
    // 菜单树（recon 02 实测无副作用的纯查询 POST）
    PATH_GET_MENU_LIST,
    // 空教室列表查询（学校页面 mtype:"post"，见 09 §1）
    PATH_FREE_CLASSROOMS,
    // 周次字典 / 按周日期 / 教学楼字典（09 §4，纯查询）
    PATH_CLASSROOM_WEEKS,
    PATH_CLASSROOM_WEEK_DATES,
    PATH_CLASSROOM_BUILDINGS,
];

/// 该路径是否被允许以 POST 调用（运行期 fail-closed 校验）。
pub fn is_teacher_query_post_allowed(path: &str) -> bool {
    let candidate = path.trim();
    TEACHER_QUERY_POST_PATHS.contains(&candidate)
}

/// 教师端**禁止**出现的写动词词根（与 recon 07 的接入规则一致）。
///
/// 契约测试（`src/utils/teacher_readonly_allowlist_contract.spec.ts`）与运行期
/// [`is_teacher_readonly_path`] 共用同一份词根，避免两处漂移。
pub const TEACHER_WRITE_VERB_ROOTS: &[&str] = &[
    "save", "add", "create", "update", "delete", "remove", "submit", "confirm", "import", "insert",
    "upload", "export", "print", "report", "reset", "change", "send", "batch", "collect", "chehui",
    "topping",
];

/// 路径是否命中写动词词根（大小写不敏感）。
pub fn path_has_write_verb(path: &str) -> bool {
    let lowered = path.to_ascii_lowercase();
    TEACHER_WRITE_VERB_ROOTS
        .iter()
        .any(|root| lowered.contains(root))
}

/// 运行期兜底：仅 allowlist 内的精确路径被视为教师只读路径。
///
/// 含 `{...}` 占位段的模板路径需由调用方先实例化，因此这里做前缀匹配兜底：
/// 模板路径的静态前缀命中即视为已登记。
pub fn is_teacher_readonly_path(path: &str) -> bool {
    let candidate = path.trim();
    if candidate.is_empty() {
        return false;
    }
    TEACHER_READONLY_PATHS.iter().any(|entry| {
        if entry.path == candidate {
            return true;
        }
        match entry.path.split_once('{') {
            Some((prefix, _)) => !prefix.is_empty() && candidate.starts_with(prefix),
            None => false,
        }
    })
}

/// allowlist 自检：任一路径命中写动词或未以 `/admin/` 开头即返回错误。
///
/// 同时校验 `post_ok` 与 [`TEACHER_QUERY_POST_PATHS`] 双向一致：
/// - 标记 `post_ok: true` 的条目必须在纯查询 POST 白名单内；
/// - 白名单内的路径必须在 allowlist 中且标记 `post_ok: true`。
///
/// 供开发期断言与单元测试调用；返回 `Err` 表示 allowlist 被误改。
pub fn assert_allowlist_readonly() -> Result<(), String> {
    for entry in TEACHER_READONLY_PATHS {
        if !entry.path.starts_with("/admin/") {
            return Err(format!("教师只读路径必须以 /admin/ 开头: {}", entry.path));
        }
        if path_has_write_verb(entry.path) {
            return Err(format!("教师只读 allowlist 含写动词路径: {}", entry.path));
        }
        if entry.post_ok && !TEACHER_QUERY_POST_PATHS.contains(&entry.path) {
            return Err(format!(
                "路径被标记为可 POST 但不在纯查询 POST 白名单内: {}",
                entry.path
            ));
        }
    }
    for allowed in TEACHER_QUERY_POST_PATHS {
        match TEACHER_READONLY_PATHS.iter().find(|e| e.path == *allowed) {
            Some(entry) if entry.post_ok => {}
            Some(_) => return Err(format!("纯查询 POST 路径未标记 post_ok: {allowed}")),
            None => return Err(format!("纯查询 POST 路径未登记在只读 allowlist: {allowed}")),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn allowlist_contains_no_write_verb_paths() {
        assert!(assert_allowlist_readonly().is_ok());
        for entry in TEACHER_READONLY_PATHS {
            assert!(
                !path_has_write_verb(entry.path),
                "写动词路径混入 allowlist: {}",
                entry.path
            );
        }
    }

    #[test]
    fn allowlist_has_no_duplicate_paths() {
        let mut seen = HashSet::new();
        for entry in TEACHER_READONLY_PATHS {
            assert!(seen.insert(entry.path), "重复登记: {}", entry.path);
        }
    }

    #[test]
    fn registered_paths_are_recognized_and_unknown_are_rejected() {
        assert!(is_teacher_readonly_path(PATH_TEACHING_TASKS));
        assert!(is_teacher_readonly_path(PATH_NOTICE_INBOX));
        assert!(!is_teacher_readonly_path("/admin/jsd/notice/create"));
        assert!(!is_teacher_readonly_path("/admin/system/tzsjx/updateState"));
        assert!(!is_teacher_readonly_path(""));
    }

    #[test]
    fn calendar_template_matches_instantiated_path() {
        assert!(is_teacher_readonly_path(
            "/admin/system/zy/xlgl/getData/2026-2027-1"
        ));
        assert!(!is_teacher_readonly_path(
            "/admin/system/zy/xlgl/updateByZc"
        ));
    }

    #[test]
    fn query_post_allowlist_is_fail_closed() {
        // 空教室链路：getZyKjs / 周次字典 / 按周日期 / 教学楼字典 均为已实测纯查询 POST
        assert!(is_teacher_query_post_allowed(PATH_FREE_CLASSROOMS));
        assert!(is_teacher_query_post_allowed(PATH_CLASSROOM_WEEKS));
        assert!(is_teacher_query_post_allowed(PATH_CLASSROOM_WEEK_DATES));
        assert!(is_teacher_query_post_allowed(PATH_CLASSROOM_BUILDINGS));
        assert!(is_teacher_query_post_allowed(PATH_GET_MENU_LIST));
        // 未登记路径不得 POST
        assert!(!is_teacher_query_post_allowed(PATH_TEACHING_TASKS));
        assert!(!is_teacher_query_post_allowed(PATH_FREE_CLASSROOMS_PAGE));
        assert!(!is_teacher_query_post_allowed(""));
        // 纯查询 POST 路径本身不得含写动词
        for path in TEACHER_QUERY_POST_PATHS {
            assert!(
                !path_has_write_verb(path),
                "纯查询 POST 白名单含写动词路径: {path}"
            );
        }
    }

    #[test]
    fn classroom_paths_are_registered() {
        for path in [
            PATH_FREE_CLASSROOMS,
            PATH_FREE_CLASSROOMS_PAGE,
            PATH_CLASSROOM_WEEKS,
            PATH_CLASSROOM_WEEK_DATES,
            PATH_CLASSROOM_BUILDINGS,
            PATH_CLASSROOM_PERIODS,
        ] {
            assert!(is_teacher_readonly_path(path), "未登记: {path}");
        }
    }
}
