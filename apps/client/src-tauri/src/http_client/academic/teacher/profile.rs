//! 教师个人资料（只读）—— E2（#1022）实现。
//!
//! 数据来源（均为 `readonly.rs` 已登记的只读路径，recon 02 §2.1 / §2.2）：
//! - 工号 / 姓名 / 身份：教务首页服务端渲染（[`readonly::PATH_TEACHER_HOME`]），
//!   复用既有 [`HbutClient::fetch_jwxt_identity`]（`#roleId` / `.admin_name` / `.arrowbt`）；
//! - 部门 ID：菜单树纯查询 POST（[`readonly::PATH_GET_MENU_LIST`]）的
//!   `currentDepartmentId`（recon 02 §2.1，实测样例 `205`）。
//!
//! **不返回猜测值**：`departmentName` / `title` / `email` 在只读勘察中**没有真实来源**，
//! 因此本模块既不查询也不返回，由前端直接不展示。
//!
//! 红线（E2 必须遵守）：
//! - **绝不**调用学生专属接口（学生学籍 / 学生登录记录 / 宿舍 / 迎新等）；
//! - **绝不**触发教师卡片修改类写接口；
//! - 只允许 GET 与已确认无副作用的纯查询 POST，且路径必须先登记在 [`readonly`]。
//!
//! ## 关于共享会话客户端（已知约束，需整合负责人收口）
//!
//! E0 冻结的 `application/teacher.rs` 以**无参**形式调用 [`fetch_profile`]，
//! 未把应用共享的 `HbutClient` 传进来（`TeacherService` 内部虽有 `client_snapshot()`）。
//! 为不改动冻结文件，本模块通过 [`HbutClient::new()`] 恢复**持久化会话快照**
//! （`hbut_cookie_snapshot.json`，与主客户端同源 CAS Cookie，按当前活动账号写入）。
//! 这属于临时兜底：正式实现应由 `application/teacher.rs` 传入共享 `&HbutClient`
//! （调用 [`fetch_profile_with`]），以避免重复 HTTP 客户端与会话快照滞后。
//! 该偏差已写入 E2 交付报告，供整合负责人（E8）处理。

use serde_json::Value;

use super::readonly;
use super::JwxtIdentity;
use crate::http_client::{looks_like_academic_login_url, HbutClient};

/// 从菜单树响应中抽取的身份字段（recon 02 §2.1 的框架注入字段）。
///
/// ⚠️ 这些字段在业务记录里属于「框架注入」，但对**身份解析**而言正是权威来源，
/// 因此仅在本模块内部使用，不并入任何业务数据模型。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct MenuIdentity {
    /// `currentUserName` = 工号。
    pub account_id: String,
    /// `currentRoleId` = 身份类型（`js` = 教师）。
    pub role_id: String,
    /// `currentDepartmentId` = 部门 ID。
    pub department_id: String,
}

/// 从 JSON 值中安全取字符串（字符串 trim；数字转字符串；其余为空串）。
fn json_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    }
}

/// 在菜单树（数组或 `{data:[...]}` 包裹）中查找**首个**带身份字段的节点。
///
/// 递归遍历 `children` 等嵌套结构；找不到返回 `None`。
fn find_identity_record(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    match value {
        Value::Array(items) => items.iter().find_map(find_identity_record),
        Value::Object(map) => {
            let has_identity = map.contains_key("currentUserName")
                || map.contains_key("currentDepartmentId")
                || map.contains_key("currentRoleId");
            if has_identity {
                return Some(map);
            }
            map.values().find_map(find_identity_record)
        }
        _ => None,
    }
}

/// 从 `getMenuList` 响应中抽取身份字段（无匹配节点时返回全空默认值）。
pub(crate) fn extract_menu_identity(payload: &Value) -> MenuIdentity {
    let Some(record) = find_identity_record(payload) else {
        return MenuIdentity::default();
    };
    MenuIdentity {
        account_id: json_text(record.get("currentUserName")),
        role_id: json_text(record.get("currentRoleId")),
        department_id: json_text(record.get("currentDepartmentId")),
    }
}

/// 组装前端 `TeacherProfile` 契约载荷（camelCase，与 `normalizeTeacherProfile` 对齐）。
///
/// - 工号 / 姓名 / 身份优先取教务首页服务端渲染值（权威），菜单字段仅作兜底；
/// - 两者都取不到工号与姓名时返回 `None`（调用方转为错误态，**不返回空壳假数据**）；
/// - **不输出** `departmentName` / `title` / `email`（无真实只读来源）。
pub(crate) fn build_profile_payload(
    identity: Option<&JwxtIdentity>,
    menu: &MenuIdentity,
) -> Option<Value> {
    let account_id = identity
        .map(|item| item.account_id.trim())
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| menu.account_id.clone());
    let name = identity
        .map(|item| item.name.trim().to_string())
        .unwrap_or_default();
    let role_id = identity
        .map(|item| item.role_id.trim())
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| menu.role_id.clone());

    if account_id.is_empty() && name.is_empty() {
        return None;
    }

    Some(serde_json::json!({
        "accountId": account_id,
        "name": name,
        "roleId": role_id,
        "departmentId": menu.department_id,
    }))
}

/// 拉取菜单树并抽取身份字段（`POST /admin/getMenuList`，纯查询，无副作用）。
async fn fetch_menu_identity(client: &HbutClient) -> Result<MenuIdentity, String> {
    let base = client.jwxt_base_url();
    let url = format!("{}{}", base, readonly::PATH_GET_MENU_LIST);
    let response = client
        .http_client()
        .post(&url)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json, text/javascript, */*; q=0.01")
        .header("Origin", base)
        .header("Referer", format!("{}/admin/", base))
        .send()
        .await
        .map_err(|error| format!("获取菜单权限失败: {error}"))?;

    let status = response.status();
    let final_url = response.url().to_string();
    if looks_like_academic_login_url(&final_url) {
        return Err("会话已过期，请重新登录".to_string());
    }
    if !status.is_success() {
        return Err(format!("菜单权限接口失败: {status}"));
    }

    let text = response
        .text()
        .await
        .map_err(|error| format!("读取菜单响应失败: {error}"))?;
    let json: Value =
        serde_json::from_str(&text).map_err(|error| format!("菜单响应不是 JSON: {error}"))?;
    Ok(extract_menu_identity(&json))
}

/// 使用给定共享客户端拉取教师个人资料（正式实现；供 `application` 层传入 `&HbutClient`）。
pub(crate) async fn fetch_profile_with(client: &HbutClient) -> Result<Value, String> {
    // 只读路径登记校验（fail-closed）：仅允许使用已登记路径。
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_TEACHER_HOME
    ));
    assert!(readonly::is_teacher_readonly_path(
        readonly::PATH_GET_MENU_LIST
    ));

    let identity = client
        .fetch_jwxt_identity()
        .await
        .map_err(|error| error.to_string())?;

    // 部门 ID 唯一只读来源；取不到不影响工号 / 姓名 / 身份的展示。
    let menu = fetch_menu_identity(client).await.unwrap_or_default();

    build_profile_payload(identity.as_ref(), &menu)
        .ok_or_else(|| "教师资料解析失败：未取得工号与姓名".to_string())
}

/// 拉取教师个人资料（工号 / 姓名 / 身份 / 部门 ID）。
///
/// E0 冻结的 `application/teacher.rs` 以无参形式调用本函数，故这里按模块头注释的
/// 「共享会话客户端」约束，用 [`HbutClient::new()`] 恢复持久化会话快照后委托
/// [`fetch_profile_with`]。**不返回任何猜测字段**。
pub(crate) async fn fetch_profile() -> Result<Value, String> {
    let client = HbutClient::new();
    fetch_profile_with(&client).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// 脱敏菜单树片段：结构取自 recon 02 §2.1，但工号 / 部门 / 内部 ID 全部为占位值。
    ///
    /// `url` 用非路径占位值：本模块只解析身份字段，不需要（也不得引入）任何教务路径字面量。
    fn sanitized_menu_fixture() -> Value {
        json!([
            {
                "id": "M160101",
                "name": "教学任务",
                "url": "menu-node-placeholder",
                "children": [],
                "currentUserId": "00000000-0000-0000-0000-000000000000",
                "userRoleId": "00000000-0000-0000-0000-000000000001",
                "currentRoleId": "js",
                "currentJsId": "00000000-0000-0000-0000-000000000002",
                "currentUserName": "2000000000",
                "currentDepartmentId": "205",
                "dataXnxq": "2099-2100-1",
                "dataAuth": true
            }
        ])
    }

    fn sanitized_identity() -> JwxtIdentity {
        JwxtIdentity {
            role_id: "js".to_string(),
            account_id: "2000000000".to_string(),
            name: "示例教师".to_string(),
        }
    }

    #[test]
    fn extracts_identity_from_menu_tree() {
        let identity = extract_menu_identity(&sanitized_menu_fixture());
        assert_eq!(identity.account_id, "2000000000");
        assert_eq!(identity.role_id, "js");
        assert_eq!(identity.department_id, "205");
    }

    #[test]
    fn finds_identity_record_nested_in_children() {
        let payload = json!({
            "ret": 0,
            "data": [
                { "id": "root", "children": [ { "currentDepartmentId": "310" } ] }
            ]
        });
        assert_eq!(extract_menu_identity(&payload).department_id, "310");
    }

    #[test]
    fn numeric_department_id_is_stringified() {
        let payload = json!([{ "currentDepartmentId": 205 }]);
        assert_eq!(extract_menu_identity(&payload).department_id, "205");
    }

    #[test]
    fn missing_identity_yields_empty_default() {
        let identity = extract_menu_identity(&json!({ "ret": 0, "data": [] }));
        assert_eq!(identity, MenuIdentity::default());
        let identity = extract_menu_identity(&json!("不是对象"));
        assert_eq!(identity, MenuIdentity::default());
    }

    #[test]
    fn home_identity_wins_over_menu_fallback() {
        let menu = MenuIdentity {
            account_id: "fallback".to_string(),
            role_id: "unknown".to_string(),
            department_id: "205".to_string(),
        };
        let payload = build_profile_payload(Some(&sanitized_identity()), &menu).expect("应有载荷");
        assert_eq!(payload["accountId"], "2000000000");
        assert_eq!(payload["name"], "示例教师");
        assert_eq!(payload["roleId"], "js");
        assert_eq!(payload["departmentId"], "205");
    }

    #[test]
    fn menu_identity_is_used_when_home_page_is_unavailable() {
        let menu = extract_menu_identity(&sanitized_menu_fixture());
        let payload = build_profile_payload(None, &menu).expect("菜单兜底应可用");
        assert_eq!(payload["accountId"], "2000000000");
        assert_eq!(payload["roleId"], "js");
        // 姓名无来源时为空串，前端不展示占位。
        assert_eq!(payload["name"], "");
    }

    #[test]
    fn empty_identity_returns_none_instead_of_fake_profile() {
        let payload = build_profile_payload(None, &MenuIdentity::default());
        assert!(payload.is_none());
    }

    #[test]
    fn payload_never_carries_unverified_fields() {
        let payload = build_profile_payload(Some(&sanitized_identity()), &MenuIdentity::default())
            .expect("应有载荷");
        let object = payload.as_object().expect("应为对象");
        assert!(!object.contains_key("departmentName"));
        assert!(!object.contains_key("title"));
        assert!(!object.contains_key("email"));
        assert!(!object.contains_key("jsId"));
    }

    #[test]
    fn readonly_paths_used_here_are_registered() {
        assert!(readonly::is_teacher_readonly_path(
            readonly::PATH_TEACHER_HOME
        ));
        assert!(readonly::is_teacher_readonly_path(
            readonly::PATH_GET_MENU_LIST
        ));
        assert!(readonly::assert_allowlist_readonly().is_ok());
    }
}
