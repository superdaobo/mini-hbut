//! 学习通官方页面内嵌子 WebView（P4-A，issue #1342）。
//!
//! ## 为什么需要它
//!
//! 「作业/考试只做提醒」的硬边界决定了：**看清单在 App 内，作答/考试在官方页**。
//! 但系统浏览器里打开 `mooc1.chaoxing.com` 会落到登录页 —— App 的会话在 Rust 的
//! `reqwest` cookie jar 里，浏览器的 cookie 存储是**另一套**（与
//! [`crate::modules::library_reserve_embed`] 是同一个坑）。
//!
//! 因此提供「应用内 WebView 打开学习通且已登录」的基础设施：创建子 WebView 后把
//! App 的 `.chaoxing.com` 会话 cookie 写进去（`Webview::set_cookie`，Tauri 2.11+）。
//!
//! ## 加载时序（避免闪登录页）
//!
//! 1. 先在**屏外 1×1** 创建子 WebView（首次加载必然未带 cookie，用户看不到）；
//! 2. 注入 cookie（`domain=chaoxing.com`，一次覆盖全部子域）；
//! 3. 等 WebView2 把 cookie 提交进 store（实测不等会抢在提交前发请求）；
//! 4. `navigate(目标)` 重新加载 —— 这次带上了会话；
//! 5. 再移动到真实位置与尺寸。
//!
//! ## 安全约束
//!
//! - URL 白名单：只允许 `chaoxing.com` 及其子域（http/https）；其它一律拒绝，
//!   不做「内嵌万能浏览器」；
//! - 只注入 `.chaoxing.com` 域的 cookie，绝不导出其它域；
//! - 顶栏导航跳出白名单时交给系统浏览器（`openExternal`），内嵌页不承载任意站点。

use tauri::{AppHandle, Manager, State};

#[cfg(desktop)]
use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    LogicalPosition, LogicalSize, WebviewUrl,
};
use url::Url;

use crate::app_state::AppState;

/// 子 WebView 标签（全局唯一；重复打开前先关闭）
const EMBED_LABEL: &str = "chaoxing-embed";

/// 屏外坐标：创建后先藏起来，注入 cookie 再搬回来
#[cfg(desktop)]
const OFFSCREEN: f64 = -10_000.0;

/// 注入 cookie 的 origin（按序查 cookie jar）。
///
/// 这些 origin 在 `HbutClient::session_cookie_domains()` 里都挂 `.chaoxing.com`，
/// 取任意一条都能拿到同一套全域 cookie；多条用于覆盖「只有某个子域写过 cookie」的情况。
const COOKIE_ORIGINS: [&str; 7] = [
    "https://mooc1.chaoxing.com",
    "https://mooc2-ans.chaoxing.com",
    "https://i.chaoxing.com",
    "https://passport2.chaoxing.com",
    "https://stat2-ans.chaoxing.com",
    "https://mobilelearn.chaoxing.com",
    "https://hbut.jw.chaoxing.com",
];

/// 注入时使用的 cookie 域。
///
/// ⚠️ 实测（2026-10-19，`library_reserve_embed` 首次实现时踩到）：
/// `domain(".chaoxing.com")`（带前导点）会被 WebView2 拒绝/忽略 —— 用**无点**的
/// `chaoxing.com`（RFC 6265 下同样覆盖全部子域）。学习通会在
/// `mooc1` / `passport2` / `i` 之间来回跳，所以必须用全域域，而不是逐 host 注入。
const COOKIE_DOMAIN: &str = "chaoxing.com";

/// 子 WebView 的位置与尺寸（逻辑像素，相对主窗口）
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ChaoxingEmbedBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 是否属于可内嵌的超星系域（只放 `chaoxing.com` 及其子域）
pub fn is_allowed_chaoxing_host(host: &str) -> bool {
    host == "chaoxing.com" || host.ends_with(".chaoxing.com")
}

/// 校验内嵌目标地址：只允许 `http(s)://*.chaoxing.com`。
///
/// 说明：`https://mooc1.chaoxing.com@evil.com` 这类地址解析出的 host 是 `evil.com`，
/// 会被本函数拒绝，不存在「看起来像超星域名」的绕过。
pub fn is_allowed_chaoxing_url(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw.trim()) else {
        return false;
    };
    match url.scheme() {
        "http" | "https" => url
            .host_str()
            .map(is_allowed_chaoxing_host)
            .unwrap_or(false),
        _ => false,
    }
}

/// 关闭已存在的内嵌子 WebView（多路兜底：label 直取 / 遍历 app / 遍历主窗口）
#[cfg(desktop)]
fn close_embed_if_exists(app: &AppHandle) {
    let mut closed_any = false;
    if let Some(webview) = app.get_webview(EMBED_LABEL) {
        let _ = webview.set_position(LogicalPosition::new(OFFSCREEN, OFFSCREEN));
        let _ = webview.set_size(LogicalSize::new(1.0, 1.0));
        if webview.close().is_ok() {
            closed_any = true;
        }
    }
    for (label, webview) in app.webviews() {
        if label.as_str() != EMBED_LABEL {
            continue;
        }
        let _ = webview.set_position(LogicalPosition::new(OFFSCREEN, OFFSCREEN));
        let _ = webview.set_size(LogicalSize::new(1.0, 1.0));
        if webview.close().is_ok() {
            closed_any = true;
        }
    }
    if let Some(window) = app.get_window("main") {
        for webview in window.webviews() {
            if webview.label() != EMBED_LABEL {
                continue;
            }
            let _ = webview.set_position(LogicalPosition::new(OFFSCREEN, OFFSCREEN));
            let _ = webview.set_size(LogicalSize::new(1.0, 1.0));
            if webview.close().is_ok() {
                closed_any = true;
            }
        }
    }
    println!("[ChaoxingEmbed] embed closed label={EMBED_LABEL} closed_any={closed_any}");
}

/// 打开学习通内嵌页（已自动登录）。
///
/// `bounds` 为 `None` 时铺满主窗口（前端不传位置时的兜底）。
#[cfg(desktop)]
#[tauri::command]
pub async fn chaoxing_embed_open(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    bounds: Option<ChaoxingEmbedBounds>,
) -> Result<(), String> {
    if !is_allowed_chaoxing_url(&url) {
        return Err("只允许在内嵌页打开 *.chaoxing.com 地址".to_string());
    }
    let start_url: Url = url
        .trim()
        .parse()
        .map_err(|e| format!("目标地址无效: {e}"))?;

    // 1) 取会话 cookie（持锁期间只做这一件事，不碰 UI）
    let cookie_rows = {
        let client = state.client.read().await;
        client.export_cookie_pairs_for_origins(&COOKIE_ORIGINS)
    };
    if cookie_rows.is_empty() {
        return Err("未取到学习通会话 cookie，无法内嵌官方页面；请先登录学习通后重试".to_string());
    }

    close_embed_if_exists(&app);

    let window = app
        .get_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;

    // 2) 先在屏外创建（首次加载未带 cookie，用户看不到）
    let app_for_nav = app.clone();
    let builder = WebviewBuilder::new(EMBED_LABEL, WebviewUrl::External(start_url.clone()))
        .on_navigation({
            let app_for_nav = app_for_nav.clone();
            move |target| {
                if is_allowed_chaoxing_url(target.as_str()) {
                    true
                } else {
                    let _ = crate::open_external_url_impl(&app_for_nav, target.as_str());
                    false
                }
            }
        })
        .on_new_window({
            let app_for_nav = app_for_nav.clone();
            move |target, _features| {
                if is_allowed_chaoxing_url(target.as_str()) {
                    if let Some(webview) = app_for_nav.get_webview(EMBED_LABEL) {
                        let _ = webview.navigate(target);
                    }
                } else {
                    let _ = crate::open_external_url_impl(&app_for_nav, target.as_str());
                }
                NewWindowResponse::Deny
            }
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(OFFSCREEN, OFFSCREEN),
            LogicalSize::new(1.0, 1.0),
        )
        .map_err(|e| format!("创建学习通内嵌页失败: {e}"))?;

    let webview = app
        .get_webview(EMBED_LABEL)
        .ok_or_else(|| "内嵌页创建后未能取到句柄".to_string())?;

    // 3) 注入 cookie（同名只注入一次：全域域下各子域共享）
    let mut injected = 0usize;
    let mut seen = std::collections::HashSet::new();
    for (_host, pairs) in &cookie_rows {
        for (name, value) in pairs {
            if name.trim().is_empty() || !seen.insert(name.clone()) {
                continue;
            }
            let cookie = tauri::webview::cookie::Cookie::build((name.clone(), value.clone()))
                .domain(COOKIE_DOMAIN)
                .path("/")
                .secure(true)
                .build();
            match webview.set_cookie(cookie) {
                Ok(()) => injected += 1,
                Err(err) => println!("[ChaoxingEmbed] set_cookie 失败 name={name}: {err}"),
            }
        }
    }
    // 等 WebView2 把 cookie 提交进 store（否则下一次导航看不到它们）
    tokio::time::sleep(std::time::Duration::from_millis(700)).await;

    // 自检：回读目标域的 cookie 数（0 说明注入根本没生效，不用再猜「服务端不认」）
    let visible = webview
        .cookies_for_url(start_url.clone())
        .map(|list| list.len())
        .unwrap_or(0);
    println!(
        "[ChaoxingEmbed] 已注入 cookie 数={injected} 目标域可见={visible} 目标={}",
        start_url
    );
    crate::runtime_log::log_info(
        "ChaoxingEmbed",
        format!("cookie 注入完成 提交={injected} 目标域回读={visible}"),
    );

    // 4) 带 cookie 重新加载，再搬到真实位置
    webview
        .navigate(start_url.clone())
        .map_err(|e| format!("内嵌页导航失败: {e}"))?;

    let target_bounds = match bounds {
        Some(bounds) => bounds,
        None => {
            // 兜底：铺满主窗口（逻辑像素）
            let size = window
                .inner_size()
                .map_err(|e| format!("读取窗口尺寸失败: {e}"))?;
            let scale = window
                .scale_factor()
                .map_err(|e| format!("读取窗口缩放失败: {e}"))?;
            let logical = size.to_logical::<f64>(scale);
            ChaoxingEmbedBounds {
                x: 0.0,
                y: 0.0,
                width: logical.width,
                height: logical.height,
            }
        }
    };
    webview
        .set_position(LogicalPosition::new(target_bounds.x, target_bounds.y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(
            target_bounds.width.max(1.0),
            target_bounds.height.max(1.0),
        ))
        .map_err(|e| e.to_string())?;

    // 落一条「最终 URL」日志：内嵌页是否真的带会话落地（而不是跳登录页）只能看这里。
    // ⚠️ 子 WebView 存在期间 `get_webview_window("main")` 会返回 None（实测），
    // 调试桥的 frontend-eval / 原生截图都无法再定位主 WebView，故不能用前端回传。
    {
        let app_for_log = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(7)).await;
            let url = app_for_log
                .get_webview(EMBED_LABEL)
                .and_then(|wv| wv.url().ok())
                .map(|u| u.to_string())
                .unwrap_or_else(|| "<取不到>".to_string());
            let landed_on_login = url.contains("passport2.chaoxing.com/login")
                || url.contains("passport.chaoxing.com/login")
                || url.contains("/login?")
                || url.contains("newversion=true");
            crate::runtime_log::log_info(
                "ChaoxingEmbed",
                format!("内嵌页最终 URL={url} 落在登录页={landed_on_login}"),
            );
        });
    }

    Ok(())
}

/// 关闭学习通内嵌页（用户主动关闭 / 离开页面时清理）
#[cfg(desktop)]
#[tauri::command]
pub async fn chaoxing_embed_close(app: AppHandle) -> Result<(), String> {
    close_embed_if_exists(&app);
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn chaoxing_embed_open(
    _app: AppHandle,
    _state: State<'_, AppState>,
    _url: String,
    _bounds: Option<ChaoxingEmbedBounds>,
) -> Result<(), String> {
    Err("当前平台不支持内嵌学习通页面".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn chaoxing_embed_close(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_chaoxing_hosts() {
        for host in [
            "chaoxing.com",
            "mooc1.chaoxing.com",
            "mooc2-ans.chaoxing.com",
            "i.chaoxing.com",
            "passport2.chaoxing.com",
        ] {
            assert!(is_allowed_chaoxing_host(host), "{host} 应可内嵌");
        }
    }

    #[test]
    fn rejects_unrelated_hosts() {
        for host in [
            "baidu.com",
            "hbut.edu.cn",
            "chaoxing.com.evil.com",
            "evilchaoxing.com",
            "",
        ] {
            assert!(!is_allowed_chaoxing_host(host), "{host} 不应内嵌");
        }
    }

    #[test]
    fn allows_https_and_http_chaoxing_urls() {
        assert!(is_allowed_chaoxing_url("https://mooc1.chaoxing.com"));
        assert!(is_allowed_chaoxing_url(
            "https://mooc1.chaoxing.com/mooc2/work/task?courseId=1&enc=abc"
        ));
        assert!(is_allowed_chaoxing_url(
            "http://i.chaoxing.com/base?phone=1"
        ));
        // 前后空白容忍（前端可能带换行）
        assert!(is_allowed_chaoxing_url("  https://i.chaoxing.com  "));
    }

    #[test]
    fn rejects_unsafe_urls() {
        for raw in [
            // 非超星域
            "https://www.baidu.com/",
            "https://hbut.edu.cn/",
            // 非 http(s) scheme
            "javascript:alert(1)",
            "file:///C:/Windows/win.ini",
            "minihbut://identity",
            // userinfo 伪装：真实 host 是 evil.com
            "https://mooc1.chaoxing.com@evil.com/",
            // 后缀伪装
            "https://chaoxing.com.evil.com/",
            // 非 URL
            "",
            "not a url",
        ] {
            assert!(!is_allowed_chaoxing_url(raw), "{raw} 不应内嵌");
        }
    }
}
