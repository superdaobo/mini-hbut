use super::academic::teacher::readonly as teacher_readonly;
use super::*;
use regex::Regex;
use std::collections::HashMap;

/// 学生全校课表路径（教师访问无权限，仅学生链路使用）。
pub(crate) const STUDENT_QXZKB_LIST_PATH: &str = "/admin/jsd/qxzkb/querylist";

/// 按会话角色选择全校课表数据路径（教师 / 学生）。
///
/// 纯函数，供运行期分派与单元测试共用：
/// - 学生：`/admin/jsd/qxzkb/querylist`（jqGrid 自定义查询框架）
/// - 教师：`/admin/jsd/qxzkb/queryQxkbPage`（recon 03 §5，实测 200/6495 条）
pub(crate) fn qxzkb_list_path_for_role(is_teacher: bool) -> &'static str {
    if is_teacher {
        teacher_readonly::PATH_QXZKB_QUERY
    } else {
        STUDENT_QXZKB_LIST_PATH
    }
}

fn strip_html_tags(input: &str, re: &Regex) -> String {
    let mut text = re.replace_all(input, "").to_string();
    text = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    text.trim().to_string()
}

fn sanitize_json_value(value: &mut serde_json::Value, re: &Regex) {
    match value {
        serde_json::Value::String(s) => {
            if s.contains('<') || s.contains("&nbsp;") || s.contains("&amp;") {
                *s = strip_html_tags(s, re);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr.iter_mut() {
                sanitize_json_value(v, re);
            }
        }
        serde_json::Value::Object(map) => {
            for (_, v) in map.iter_mut() {
                sanitize_json_value(v, re);
            }
        }
        _ => {}
    }
}
impl HbutClient {
    /// 获取全校课表节次信息
    pub async fn fetch_qxzkb_jcinfo(
        &self,
        xnxq: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let base = self.academic_base_url();
        let url = format!("{}/admin/pkgl/pkglqxzkb/getJcinfo", base);
        let resp = self
            .client
            .get(&url)
            .query(&[("xnxq", xnxq)])
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{}/admin/jsd/qxzkb", base))
            .send()
            .await?;
        let text = resp.text().await.unwrap_or_default();
        if text.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        let mut json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("节次信息解析失败: {}", e))?;
        let re = Regex::new(r"<[^>]+>").unwrap();
        sanitize_json_value(&mut json, &re);
        Ok(json)
    }

    /// 获取专业信息
    pub async fn fetch_qxzkb_zyxx(
        &self,
        yxid: &str,
        njdm: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let base = self.academic_base_url();
        let url = format!("{}/admin/system/jcsj/zysj/getZyxxList", base);
        let resp = self
            .client
            .get(&url)
            .query(&[("yxid", yxid), ("njdm", njdm)])
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{}/admin/jsd/qxzkb", base))
            .send()
            .await?;
        let text = resp.text().await.unwrap_or_default();
        if text.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        let mut json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("专业信息解析失败: {}", e))?;
        let re = Regex::new(r"<[^>]+>").unwrap();
        sanitize_json_value(&mut json, &re);
        Ok(json)
    }

    /// 获取开课教研室信息（公开接口）
    pub async fn fetch_qxzkb_kkjys(
        &self,
        kkyxid: &str,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let base = self.academic_base_url();
        let url = format!("{}/admin/system/jcsj/bmsj/getKkjysListNoAuth", base);
        let resp = self
            .client
            .get(&url)
            .query(&[("kkyxid", kkyxid)])
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Referer", format!("{}/admin/jsd/qxzkb", base))
            .send()
            .await?;
        let text = resp.text().await.unwrap_or_default();
        if text.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        let mut json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("教研室信息解析失败: {}", e))?;
        let re = Regex::new(r"<[^>]+>").unwrap();
        sanitize_json_value(&mut json, &re);
        Ok(json)
    }

    /// 查询全校课表
    ///
    /// 师生共用同一 UI（`GlobalScheduleView`），但按**真实会话角色**分派两条路径：
    /// 学生 `querylist`、教师 `queryQxkbPage`（见 [`qxzkb_list_path_for_role`]）。
    pub async fn fetch_qxzkb_list(
        &self,
        params: &HashMap<String, String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let is_teacher = self
            .user_info
            .as_ref()
            .map(|user| user.role.is_teacher())
            .unwrap_or(false);
        if is_teacher {
            return self.fetch_qxzkb_list_teacher(params).await;
        }

        let base = self.academic_base_url();
        // 先访问页面建立会话（避免登录超时）
        let page_url = format!("{}/admin/jsd/qxzkb", base);
        let _ = self.client.get(&page_url).send().await;
        let url = format!("{}{}?gridtype=jqgrid", base, STUDENT_QXZKB_LIST_PATH);
        let resp = self
            .client
            .get(&url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/jsd/qxzkb", base))
            .send()
            .await?;
        let status = resp.status();
        let final_url = resp.url().to_string();
        let text = resp.text().await.unwrap_or_default();

        if final_url.contains("authserver/login") {
            return Err("会话已过期，请重新登录".into());
        }
        if !status.is_success() {
            return Err(format!("全校课表请求失败: {}", status).into());
        }

        let mut json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("全校课表响应解析失败: {}", e))?;
        let re = Regex::new(r"<[^>]+>").unwrap();
        sanitize_json_value(&mut json, &re);
        Ok(json)
    }

    /// 教师全校课表查询（`/admin/jsd/qxzkb/queryQxkbPage`）。
    ///
    /// 该接口是 jqGrid 分页接口（recon 03 §5），与学生 `querylist` 的参数命名不同：
    /// 学生用 `page.pn` / `page.size` 与 `query.<字段>||`，教师用 `page` / `rows`。
    /// 学生筛选值按原字段名透传（教师端可选筛选参数语义 recon 未实测；
    /// 服务端若忽略不会伪造结果，仅按原值发起请求）。
    async fn fetch_qxzkb_list_teacher(
        &self,
        params: &HashMap<String, String>,
    ) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
        let path = qxzkb_list_path_for_role(true);
        if !teacher_readonly::is_teacher_readonly_path(path) {
            return Err(format!("教师只读路径未登记，已拒绝调用: {path}").into());
        }

        let base = self.academic_base_url();
        // 先访问教师课表页建立会话（避免登录超时）
        let _ = self
            .client
            .get(&format!("{}/admin/jsd/qxzkb/list3", base))
            .send()
            .await;

        let page = params
            .get("page.pn")
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .unwrap_or("1");
        let rows = params
            .get("page.size")
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .unwrap_or("50");
        let sort = params
            .get("sort")
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .unwrap_or("kcmc");
        let order = params
            .get("order")
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .unwrap_or("asc");
        let xnxq = params.get("xnxq").map(|v| v.trim()).unwrap_or("");

        // recon 03 §5.1 已实测的最小参数集：qx=0&yskb=0&gridtype=jqgrid + jqGrid 分页。
        let mut query: Vec<(String, String)> = vec![
            ("qx".to_string(), "0".to_string()),
            ("yskb".to_string(), "0".to_string()),
            ("gridtype".to_string(), "jqgrid".to_string()),
            ("_search".to_string(), "false".to_string()),
            ("page".to_string(), page.to_string()),
            ("rows".to_string(), rows.to_string()),
            ("sort".to_string(), sort.to_string()),
            ("order".to_string(), order.to_string()),
        ];
        if !xnxq.is_empty() {
            query.push(("xnxq".to_string(), xnxq.to_string()));
        }
        // 透传学生筛选值：`query.<字段>||` → `<字段>`（xnxq 已单独处理，避免重复键）。
        for (key, value) in params {
            let Some(field) = key
                .strip_prefix("query.")
                .and_then(|rest| rest.strip_suffix("||"))
            else {
                continue;
            };
            if field == "xnxq" {
                continue;
            }
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                query.push((field.to_string(), trimmed.to_string()));
            }
        }

        let url = format!("{}{}", base, path);
        let resp = self
            .client
            .get(&url)
            .query(&query)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", format!("{}/admin/jsd/qxzkb/list3", base))
            .send()
            .await?;

        let status = resp.status();
        let final_url = resp.url().to_string();
        if looks_like_academic_login_url(&final_url) {
            return Err("会话已过期，请重新登录".into());
        }
        if status.as_u16() == 401 {
            return Err("没有访问全校课表接口的权限，请重新登录后重试".into());
        }
        if !status.is_success() {
            return Err(format!("全校课表请求失败: {}", status).into());
        }

        let text = resp.text().await.unwrap_or_default();
        if let Some(err) = Self::teacher_query_body_error(&text) {
            return Err(err.into());
        }

        let mut json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("全校课表响应解析失败: {}", e))?;
        if let Some(ret) = json.get("ret").and_then(|v| v.as_i64()) {
            if ret != 0 {
                let msg = json
                    .get("msg")
                    .and_then(|v| v.as_str())
                    .unwrap_or("未知错误");
                return Err(format!("全校课表接口返回 ret={} msg={}", ret, msg).into());
            }
        }
        let re = Regex::new(r"<[^>]+>").unwrap();
        sanitize_json_value(&mut json, &re);
        Ok(json)
    }

    /// 教师教务查询共用的「HTTP 200 错误页」识别（recon 03 §0 错误形态 4）。
    ///
    /// 教师接口可能以 HTTP 200 返回业务错误 HTML（「报错啦 / 错误原因：…」）或
    /// 登录页片段；这些**不能**按 HTTP 状态判成功。返回 `Some(msg)` 表示应视为失败。
    pub(crate) fn teacher_query_body_error(body: &str) -> Option<String> {
        let trimmed = body.trim_start();
        if trimmed.is_empty() {
            return None;
        }
        let looks_like_html = trimmed.starts_with('<')
            || body.contains("报错啦")
            || body.contains("错误原因")
            || body.contains("无法访问")
            || body.contains("authserver/login");
        if looks_like_html {
            Some("教务接口返回错误页面，请稍后重试".to_string())
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qxzkb_path_switches_by_role() {
        assert_eq!(
            qxzkb_list_path_for_role(true),
            teacher_readonly::PATH_QXZKB_QUERY
        );
        assert_eq!(qxzkb_list_path_for_role(false), STUDENT_QXZKB_LIST_PATH);
        assert_ne!(
            qxzkb_list_path_for_role(true),
            qxzkb_list_path_for_role(false)
        );
        assert!(teacher_readonly::is_teacher_readonly_path(
            qxzkb_list_path_for_role(true)
        ));
    }

    #[test]
    fn teacher_query_body_error_detects_html_and_login_pages() {
        // HTTP 200 但为错误 HTML 页 / 登录页 → 必须判失败。
        assert!(HbutClient::teacher_query_body_error(
            "<html><body>报错啦 错误原因：xxx</body></html>"
        )
        .is_some());
        assert!(HbutClient::teacher_query_body_error("<!DOCTYPE html><html>...").is_some());
        assert!(HbutClient::teacher_query_body_error(
            "<script>location.href='/authserver/login'</script>"
        )
        .is_some());
        // 正常 JSON 与空体不应被误判。
        assert!(HbutClient::teacher_query_body_error("{\"ret\":0,\"results\":[]}").is_none());
        assert!(HbutClient::teacher_query_body_error("   ").is_none());
    }
}
