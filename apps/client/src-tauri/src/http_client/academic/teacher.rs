//! 教师端：教务身份识别与教师课表。
//!
//! ## 为什么单独成模块
//!
//! 教师端与学生端**共用同一套 CAS 门户登录**（门户登录框本身即「请输入学号/工号」），
//! 因此登录流程无需分叉；真正的差异出现在登录之后 —— 教务系统对教师与学生
//! 开放的是**两套完全不同的接口**：
//!
//! | 用途 | 学生 | 教师 |
//! | --- | --- | --- |
//! | 身份信息 | `/admin/xsd/xsjbxx/xskp`（教师访问直接报「身份类型不是学生」） | `/admin/?loginType=1` 服务端渲染的 `#roleId` / `.admin_name` / `.arrowbt` |
//! | 课表 | `/admin/xsd/pkgl/xskb/sdpkkbList`（需先探测 `xhid`） | `/admin/pkgl/pkgljskb/getJskbByXqid`（需先从课表页抓 `teacherId`） |
//!
//! ## 教师课表的两个语义陷阱
//!
//! 1. **按「小节」逐行返回**：同一门跨大节的课会返回多行（例如大节 4 会同时出现
//!    `djc=7` 与 `djc=8` 两行），必须按
//!    `(课程 + 教学班 + 星期 + 周次 + 教室 + 周类型 + 大节)` 去重合并，
//!    否则课表上会出现重复卡片。
//! 2. **`djs` 是大节号**（= `ceil(djc/2)`，1..6），**不是连堂节数**。
//!    学生端 `parser::parse_schedule` 把 `djs` 当连堂数处理，两者不可混用；
//!    本模块的解析在 `parser::parse_teacher_schedule` 中独立实现。

use super::super::*;

// Teacher Portal V2（#1019）：教师业务子模块。
//
// 说明：Rust 不允许 `teacher.rs` 与 `teacher/mod.rs` 同时存在（同一模块两个候选文件），
// 因此本文件继续作为 `teacher` 模块入口，子模块直接以 `teacher/<name>.rs` 组织。
pub(crate) mod exams;
pub(crate) mod profile;
pub(crate) mod readonly;
pub(crate) mod teaching;

/// 教师业务统一「未实现」错误（E0 stub）。
///
/// ⚠️ stub 阶段**绝不返回假数据**；E2/E5/E6 用真实只读实现替换。
pub(crate) fn not_implemented(feature: &str) -> String {
    format!("教师端功能未实现（E0 骨架）: {feature}")
}

/// 教务首页服务端渲染的身份信息。
///
/// 页面特征（`/admin/?loginType=1`）：
/// ```html
/// <input id="roleId" type="hidden" value="js">
/// <p><span class="admin_name">2024000000</span><span class="arrowbt">张三</span></p>
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JwxtIdentity {
    /// 教务角色标识：`js` = 教师，其余（学生预期 `xs`）按学生处理。
    pub role_id: String,
    /// 账号标识：学生 = 学号，教师 = 工号。
    pub account_id: String,
    /// 姓名。
    pub name: String,
}

/// 从教务首页 HTML 解析身份信息；`#roleId` 缺失时返回 `None`（调用方按学生兜底）。
pub fn parse_jwxt_identity(html: &str) -> Option<JwxtIdentity> {
    let role_id = extract_input_value(html, "roleId")?;
    if role_id.trim().is_empty() {
        return None;
    }
    Some(JwxtIdentity {
        role_id: role_id.trim().to_string(),
        account_id: extract_span_text(html, "admin_name").unwrap_or_default(),
        name: extract_span_text(html, "arrowbt").unwrap_or_default(),
    })
}

/// 从教师课表页 HTML 提取服务端加密的 `teacherId`（课表数据接口的必填参数）。
///
/// 该值形如 `WGEyQ0…`，未发现可客户端构造的算法，只能从页面抓取。
pub fn extract_teacher_id(html: &str) -> Option<String> {
    extract_input_value(html, "teacherId").filter(|v| !v.trim().is_empty())
}

/// 取指定 `id` 的 `<input>` 的 `value`。
///
/// 不假设属性顺序（`id` 与 `value` 先后都可能），按标签逐个匹配。
fn extract_input_value(html: &str, id: &str) -> Option<String> {
    let needle = format!("id=\"{}\"", id);
    let value_re = regex::Regex::new(r#"value="([^"]*)""#).ok()?;
    for chunk in html.split("<input").skip(1) {
        let tag = match chunk.find('>') {
            Some(end) => &chunk[..end],
            None => continue,
        };
        if !tag.contains(&needle) {
            continue;
        }
        if let Some(caps) = value_re.captures(tag) {
            if let Some(m) = caps.get(1) {
                let value = m.as_str().trim().to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

/// 取 `class="<class_name>"` 元素的文本内容（用于工号 / 姓名）。
fn extract_span_text(html: &str, class_name: &str) -> Option<String> {
    let pattern = format!(r#"class="{}"[^>]*>([^<]*)<"#, regex::escape(class_name));
    let re = regex::Regex::new(&pattern).ok()?;
    let caps = re.captures(html)?;
    let text = caps.get(1)?.as_str().trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

impl HbutClient {
    /// 解析当前登录身份：优先复用 `/admin/caslogin` 落地页 HTML（零额外请求），
    /// 解析不到时再显式取一次教务首页。
    pub async fn resolve_jwxt_identity(
        &self,
        landing_html: &str,
    ) -> Result<Option<JwxtIdentity>, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(identity) = parse_jwxt_identity(landing_html) {
            return Ok(Some(identity));
        }
        self.fetch_jwxt_identity().await
    }

    /// 拉取教务首页身份信息（`#roleId` / `.admin_name` / `.arrowbt`）。
    ///
    /// 这是登录后判定「学生 / 教师」的唯一权威来源：入口选择只作 UI 提示，
    /// 实际身份以教务系统返回为准。
    pub async fn fetch_jwxt_identity(
        &self,
    ) -> Result<Option<JwxtIdentity>, Box<dyn std::error::Error + Send + Sync>> {
        let base = self.academic_base_url();
        let url = format!("{}/admin/?loginType=1", base);
        let response = self
            .client
            .get(&url)
            .header("Referer", format!("{}/admin/", base))
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        crate::hbut_auth_log!(
            "[Auth] fetch_jwxt_identity status={} final_url={}",
            status,
            final_url
        );
        if looks_like_academic_login_url(&final_url) {
            return Err("会话已过期，请重新登录".into());
        }
        if !status.is_success() {
            return Err(format!("获取教务首页失败: {}", status).into());
        }

        let html = response.text().await?;
        Ok(parse_jwxt_identity(&html))
    }

    /// 获取教师课表（`pkgljskb` 链路）。
    ///
    /// 两步：先从课表页抓 `teacherId`，再调数据接口。`teacherId` 与学期无关，
    /// 因此切换学期只需重复第二步。
    pub async fn fetch_teacher_schedule(
        &self,
        semester: Option<&str>,
    ) -> Result<(Vec<ScheduleCourse>, i32), Box<dyn std::error::Error + Send + Sync>> {
        let semester = match semester.map(str::trim).filter(|s| !s.is_empty()) {
            Some(s) => s.to_string(),
            None => {
                let context = self.resolve_schedule_context(None).await;
                context
                    .get("semester")
                    .and_then(|v| v.as_str())
                    .map(|v| v.trim().to_string())
                    .filter(|v| !v.is_empty())
                    .unwrap_or_else(|| Self::semester_by_date(chrono::Local::now().date_naive()))
            }
        };
        println!("[调试] 教师课表学期: {}", semester);

        let base = self.academic_base_url();
        let referer = format!("{}/admin/", base);
        let page_url = format!("{}/admin/pkgl/pkgljskb/queryKbForJsd", base);

        let mut teacher_id = String::new();
        let mut last_page_error = String::new();
        // 课表页默认渲染当前学期；显式带学期再试一次作为兜底。
        for candidate in [page_url.clone(), format!("{}?xnxq={}", page_url, semester)] {
            println!("[调试] 获取教师课表页：{}", candidate);
            let response = match self
                .client
                .get(&candidate)
                .header("Referer", &referer)
                .send()
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    last_page_error = format!("请求失败: {}", e);
                    continue;
                }
            };
            let status = response.status();
            let final_url = response.url().to_string();
            if looks_like_academic_login_url(&final_url) {
                return Err("会话已过期，请重新登录".into());
            }
            if !status.is_success() {
                last_page_error = format!("状态码异常: {}", status);
                continue;
            }
            let html = match response.text().await {
                Ok(v) => v,
                Err(e) => {
                    last_page_error = format!("读取响应失败: {}", e);
                    continue;
                }
            };
            match extract_teacher_id(&html) {
                Some(found) => {
                    teacher_id = found;
                    break;
                }
                None => last_page_error = "课表页未解析到 teacherId".to_string(),
            }
        }

        if teacher_id.is_empty() {
            let suffix = if last_page_error.is_empty() {
                String::new()
            } else {
                format!("（{}）", last_page_error)
            };
            return Err(format!("无法获取教师课表标识{}，请重新登录后重试", suffix).into());
        }
        println!("[调试] 已获取 teacherId（长度 {}）", teacher_id.len());

        let data_url = format!("{}/admin/pkgl/pkgljskb/getJskbByXqid", base);
        let params = [
            ("xnxq", semester.as_str()),
            ("id", teacher_id.as_str()),
            ("xqdm", ""),
            ("isjsd", "0"),
            ("sftqz", "0"),
            ("xsqbkb", "0"),
            ("zc", ""),
        ];
        let response = self
            .client
            .get(&data_url)
            .query(&params)
            .header("X-Requested-With", "XMLHttpRequest")
            .header("Accept", "application/json, text/javascript, */*; q=0.01")
            .header("Referer", &page_url)
            .send()
            .await?;

        let status = response.status();
        let final_url = response.url().to_string();
        println!("[调试] 教师课表响应状态: {}, 地址: {}", status, final_url);
        if looks_like_academic_login_url(&final_url) {
            return Err("会话已过期，请重新登录".into());
        }
        if !status.is_success() {
            return Err(format!("教师课表接口失败: {}", status).into());
        }

        let json: serde_json::Value = response.json().await?;
        let ret = json.get("ret").and_then(|v| v.as_i64()).unwrap_or(-1);
        println!(
            "[调试] 教师课表响应: ret={}, data count={}",
            ret,
            json.get("data")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0)
        );
        if ret != 0 {
            let msg = json.get("msg").and_then(|v| v.as_str()).unwrap_or("");
            let lower = msg.to_lowercase();
            if ret == -1
                || msg.contains("无课表")
                || msg.contains("暂无")
                || lower.contains("no schedule")
            {
                return Err("该学期无课表，请切换学期".into());
            }
            return Err(format!("教师课表接口返回 ret={} msg={}", ret, msg).into());
        }

        crate::parser::parse_teacher_schedule(&json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 真实抓取的教务首页片段（`/admin/?loginType=1`，教师账号）。
    const TEACHER_HOME_HTML: &str = r#"<input id="adminPath" type="hidden" value="/admin" style="">
<input id="topNavShowHome" type="hidden" value="1" style="">
<input id="roleId" type="hidden" value="js" style="">
<div class="headFr">
    <div class="userInfo">
        <img src="/static/common/img/default_avatar_male.jpg" alt="头像">
        <p><span class="admin_name">2024000000</span><span class="arrowbt">张三</span></p>
    </div>
</div>"#;

    #[test]
    fn parses_teacher_identity_from_home_html() {
        let identity = parse_jwxt_identity(TEACHER_HOME_HTML).expect("应解析出身份");
        assert_eq!(identity.role_id, "js");
        assert_eq!(identity.account_id, "2024000000");
        assert_eq!(identity.name, "张三");
    }

    #[test]
    fn missing_role_id_yields_none() {
        assert!(parse_jwxt_identity("<html><body>无角色字段</body></html>").is_none());
        // 空值同样视为缺失（避免把空角色当成学生之外的第三种身份）
        assert!(parse_jwxt_identity(r#"<input id="roleId" value="">"#).is_none());
    }

    #[test]
    fn input_value_is_order_insensitive() {
        // 属性顺序变化时仍应正确取值
        let html = r#"<input value="js" id="roleId" type="hidden">"#;
        assert_eq!(extract_input_value(html, "roleId").as_deref(), Some("js"));
    }

    /// 真实抓取的教师课表页片段（`/admin/pkgl/pkgljskb/queryKbForJsd`）。
    const TEACHER_SCHEDULE_PAGE_HTML: &str = r#"<input type="hidden" id="xnxq" value="2026-2027-1" style="">
<input type="hidden" id="teacherId" value="WGEyQ0000000000000000000000000000000000000000000000000000000000000000000000000000000" style="">
<input type="hidden" id="xqid" value="" style="">"#;

    #[test]
    fn extracts_teacher_id_from_schedule_page() {
        assert_eq!(
            extract_teacher_id(TEACHER_SCHEDULE_PAGE_HTML).as_deref(),
            Some("WGEyQ0000000000000000000000000000000000000000000000000000000000000000000000000000000")
        );
    }

    #[test]
    fn missing_teacher_id_returns_none() {
        assert!(extract_teacher_id("<html><body>无 teacherId</body></html>").is_none());
        assert!(extract_teacher_id(r#"<input id="teacherId" value="">"#).is_none());
    }
}
