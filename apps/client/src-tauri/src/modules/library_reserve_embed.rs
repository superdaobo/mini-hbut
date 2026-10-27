//! 图书馆预约：官方页面内嵌子 WebView（2026-10-19）。
//!
//! ## 为什么需要它
//!
//! 座位「快速预约」提交必须带 **cxCaptcha 行为验证 token**（`captcha.chaoxing.com`，
//! 需人工点击），纯接口方案不可行（详见 `data/library-reserve-recon/04-…md` §1.2）。
//! 因此提供「在官方页面内完成预约」的入口：把官方页嵌进 App，由官方页自己处理验证与提交。
//!
//! ## 关键点：cookie 必须注入
//!
//! 实测（2026-10-19）：带一次性 `code` 的入口 URL 在**无 cookie** 的浏览器里会 302 到
//! `passport2.chaoxing.com/login` —— 会话是必需的。而 Rust 的 `reqwest` cookie jar 与
//! WebView2 的 cookie 存储是**两套**，所以创建子 WebView 后必须把 App 的会话 cookie
//! 写进去（`Webview::set_cookie`，Tauri 2.11 起提供）。
//!
//! ## 加载时序（避免闪登录页）
//!
//! 1. 先在**屏外 1×1** 创建子 WebView（此时首次加载必然未带 cookie）；
//! 2. 注入 cookie；
//! 3. `navigate(目标)` 重新加载 —— 这次带上了会话；
//! 4. 再移动到真实位置与尺寸。
//!
//! 这样用户看不到中间那次未授权的加载。

use tauri::{AppHandle, Manager, State};

#[cfg(desktop)]
use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    LogicalPosition, LogicalSize, WebviewUrl,
};
use url::Url;

use crate::app_state::AppState;
use crate::modules::library_reserve::{self, LibraryApp};

/// 子 WebView 标签（全局唯一；重复打开前先关闭）
const EMBED_LABEL: &str = "library-reserve-embed";

/// 屏外坐标：创建后先藏起来，注入 cookie 再搬回来
#[cfg(desktop)]
const OFFSCREEN: f64 = -10_000.0;

/// 需要注入 cookie 的 origin（按序查 cookie jar）
///
/// `reserve.chaoxing.com` 不在 `HbutClient::session_cookie_domains()` 的固定清单里，
/// 但 `.chaoxing.com` 域 cookie 对它同样有效，故这里显式按目标域现查。
const COOKIE_ORIGINS: [&str; 4] = [
    "https://reserve.chaoxing.com",
    "https://passport2.chaoxing.com",
    "https://i.chaoxing.com",
    "https://hbut.jw.chaoxing.com",
];

/// 子 WebView 的位置与尺寸（逻辑像素，相对主窗口）
#[derive(Debug, Clone, serde::Deserialize)]
pub struct LibraryReserveEmbedBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 打开内嵌页请求
#[derive(Debug, Clone, serde::Deserialize)]
pub struct LibraryReserveEmbedOpenRequest {
    /// 应用标识：`seat` / `quiet_room` / `seminar_room`
    pub app: String,
    /// 页面形态：`live`（座位快速预约页，默认）/ `index`（入口落地页）
    #[serde(default)]
    pub kind: Option<String>,
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
    pub bounds: LibraryReserveEmbedBounds,
}

/// 请求桥内 iframe 地址（#1081：iOS / 无 `add_child` 平台的内嵌路线）
#[derive(Debug, Clone, serde::Deserialize)]
pub struct LibraryReserveEmbedProxyRequest {
    /// 应用标识：`seat` / `quiet_room` / `seminar_room`
    pub app: String,
    /// 页面形态：`live`（座位快速预约页，默认）/ `index`（入口落地页）
    #[serde(default)]
    pub kind: Option<String>,
    /// 是否强制重跑超星 SSO（默认 false）
    #[serde(default)]
    pub force: Option<bool>,
}

/// 桥内 iframe 地址解析结果
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryReserveEmbedProxyInfo {
    /// 桥内 iframe URL（`http://127.0.0.1:<bridge_port>/reserve-embed/…`，含短时效凭证）
    pub url: String,
    /// 官方原始入口 URL（**含短时效凭证**；桥不可达时供「用系统浏览器打开」降级）
    pub entry_url: String,
    /// Bridge 监听基址（诊断用）
    pub bridge_base: String,
}

/// 是否属于可内嵌的域（超星系 + 学校门户，保证 SSO 跳转不跳出 App）
pub fn is_embeddable_embed_host(host: &str) -> bool {
    host == "chaoxing.com"
        || host.ends_with(".chaoxing.com")
        || host == "hbut.edu.cn"
        || host.ends_with(".hbut.edu.cn")
}

/// 顶栏导航是否留在内嵌页内（非白名单一律外部打开，避免内嵌页变成万能浏览器）
fn is_embeddable_url(url: &Url) -> bool {
    match url.scheme() {
        "http" | "https" => url
            .host_str()
            .map(is_embeddable_embed_host)
            .unwrap_or(false),
        _ => false,
    }
}

/// 由入口 URL 推导要展示的页面地址
///
/// - `seat` + `live`：把 `/front/apps/seatengine/index` 换成
///   `/front/apps/seatengine/live/select`（真正的快速预约表单页），保留全部凭证 query；
/// - 其余情况原样返回入口 URL。
pub fn resolve_embed_target_url(entry_url: &str, app: LibraryApp, kind: Option<&str>) -> String {
    let wants_live = matches!(kind, Some("live"));
    if wants_live && app == LibraryApp::Seat {
        let replaced = entry_url.replace(
            "/front/apps/seatengine/index",
            "/front/apps/seatengine/live/select",
        );
        if replaced != entry_url {
            return replaced;
        }
    }
    entry_url.to_string()
}

/// 解析官方入口 → 桥内 iframe 地址（#1081，**全平台可用**）。
///
/// 与 [`library_reserve_embed_open`] 的区别：不创建任何 WebView，只把「官方入口 + 凭证」
/// 换算成 Bridge 反向代理地址，交给前端 `<iframe>` 加载。iOS 上 `Window::add_child`
/// 不可用（cfg 为 `all(desktop, feature = "unstable")`），故走这条路线。
///
/// 凭证短时效，**每次打开都现取**（不缓存、不持久化）；主机白名单校验在
/// [`crate::modules::library_reserve_proxy::build_reserve_embed_bridge_url`] 内完成。
#[tauri::command]
pub async fn library_reserve_embed_proxy_url(
    state: State<'_, AppState>,
    req: LibraryReserveEmbedProxyRequest,
) -> Result<LibraryReserveEmbedProxyInfo, String> {
    let library_app =
        LibraryApp::from_key(&req.app).ok_or_else(|| format!("未知应用标识「{}」", req.app))?;

    let mut client = state.client.write().await;
    let entry =
        library_reserve::resolve_entry(&mut client, library_app, req.force.unwrap_or(false))
            .await
            .map_err(|e| e.message)?;
    let entry_url = resolve_embed_target_url(&entry.entry_url, library_app, req.kind.as_deref());

    let bridge_base = crate::modules::library_reserve_proxy::bridge_base_url();
    let url = crate::modules::library_reserve_proxy::build_reserve_embed_bridge_url(
        &bridge_base,
        &entry_url,
    )?;

    crate::runtime_log::log_info(
        "LibraryReserveEmbed",
        format!(
            "代理入口解析完成 app={} bridge={} 目标={}",
            library_app.key(),
            bridge_base,
            entry.system_path
        ),
    );

    Ok(LibraryReserveEmbedProxyInfo {
        url,
        entry_url,
        bridge_base,
    })
}

#[cfg(desktop)]
fn open_external(app: &AppHandle, target: &str) {
    let _ = crate::open_external_url_impl(app, target);
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
    println!("[LibraryReserveEmbed] embed closed label={EMBED_LABEL} closed_any={closed_any}");
}

#[cfg(desktop)]
#[tauri::command]
pub async fn library_reserve_embed_open(
    app: AppHandle,
    state: State<'_, AppState>,
    req: LibraryReserveEmbedOpenRequest,
) -> Result<(), String> {
    let library_app =
        LibraryApp::from_key(&req.app).ok_or_else(|| format!("未知应用标识「{}」", req.app))?;

    // 1) 解析入口凭证 + 取会话 cookie（持锁期间只做这两件事，不碰 UI）
    let (target_url, cookie_rows) = {
        let mut client = state.client.write().await;
        let entry =
            library_reserve::resolve_entry(&mut client, library_app, req.force.unwrap_or(false))
                .await
                .map_err(|e| e.message)?;
        let target = resolve_embed_target_url(&entry.entry_url, library_app, req.kind.as_deref());
        let rows = client.export_cookie_pairs_for_origins(&COOKIE_ORIGINS);
        (target, rows)
    };

    if cookie_rows.is_empty() {
        return Err("未取到超星会话 cookie，无法内嵌官方页面；请先登录融合门户后重试".to_string());
    }

    close_embed_if_exists(&app);

    let window = app
        .get_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let start_url: Url = target_url
        .parse()
        .map_err(|e| format!("目标地址无效: {e}"))?;

    // 2) 先在屏外创建（首次加载未带 cookie，用户看不到）
    let app_for_nav = app.clone();
    let builder = WebviewBuilder::new(EMBED_LABEL, WebviewUrl::External(start_url.clone()))
        .on_navigation({
            let app_for_nav = app_for_nav.clone();
            move |url| {
                if is_embeddable_url(url) {
                    true
                } else {
                    open_external(&app_for_nav, url.as_str());
                    false
                }
            }
        })
        .on_new_window({
            let app_for_nav = app_for_nav.clone();
            move |url, _features| {
                if is_embeddable_url(&url) {
                    if let Some(webview) = app_for_nav.get_webview(EMBED_LABEL) {
                        let _ = webview.navigate(url);
                    }
                } else {
                    open_external(&app_for_nav, url.as_str());
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
        .map_err(|e| format!("创建预约内嵌页失败: {e}"))?;

    let webview = app
        .get_webview(EMBED_LABEL)
        .ok_or_else(|| "内嵌页创建后未能取到句柄".to_string())?;

    // 3) 注入 cookie
    //
    // ⚠️ 两个实测坑（2026-10-19，首次实现时踩到）：
    // 1. `domain(".chaoxing.com")`（带前导点）会被 WebView2 拒绝/忽略 —— 用**无点**的
    //    `chaoxing.com`（RFC 6265 下同样覆盖全部子域）；
    // 2. `set_cookie` 内部是异步提交，紧接着 `navigate` 会**抢在提交前**发请求
    //    （表现为「已注入 39 条但页面仍跳登录页」）—— 注入后必须等一下再导航。
    let mut injected = 0usize;
    let mut seen = std::collections::HashSet::new();
    for (host, pairs) in &cookie_rows {
        // 逐 origin 用**自身 host** 作 cookie 域：与浏览器里服务端下发的最接近
        let domain = host.trim_start_matches('.').to_string();
        for (name, value) in pairs {
            if name.trim().is_empty() || !seen.insert(name.clone()) {
                continue;
            }
            let cookie = tauri::webview::cookie::Cookie::build((name.clone(), value.clone()))
                .domain(domain.clone())
                .path("/")
                .secure(true)
                .build();
            match webview.set_cookie(cookie) {
                Ok(()) => injected += 1,
                Err(err) => println!("[LibraryReserveEmbed] set_cookie 失败 name={name}: {err}"),
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
        "[LibraryReserveEmbed] 已注入 cookie 数={injected} 目标域可见={visible} 目标={}",
        target_url
    );
    crate::runtime_log::log_info(
        "LibraryReserveEmbed",
        format!("cookie 注入完成 提交={injected} 目标域回读={visible}"),
    );

    // 4) 带 cookie 重新加载，再搬到真实位置
    webview
        .navigate(start_url)
        .map_err(|e| format!("内嵌页导航失败: {e}"))?;
    webview
        .set_position(LogicalPosition::new(req.bounds.x, req.bounds.y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(
            req.bounds.width.max(1.0),
            req.bounds.height.max(1.0),
        ))
        .map_err(|e| e.to_string())?;

    // 落一条「最终 URL」日志：内嵌页是否真的带会话落地（而不是跳登录页）只能看这里 ——
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
                || url.contains("/login?")
                || url.contains("newversion=true");
            crate::runtime_log::log_info(
                "LibraryReserveEmbed",
                format!("内嵌页最终 URL={url} 落在登录页={landed_on_login}"),
            );
        });
    }

    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn library_reserve_embed_resize(
    app: AppHandle,
    bounds: LibraryReserveEmbedBounds,
) -> Result<(), String> {
    if bounds.width < 8.0 || bounds.height < 8.0 {
        return Err("invalid embed bounds".to_string());
    }
    if bounds.x < -100.0 || bounds.y < -100.0 {
        return Err("invalid embed position".to_string());
    }
    let webview = app
        .get_webview(EMBED_LABEL)
        .ok_or_else(|| "预约内嵌页未打开".to_string())?;
    webview
        .set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(
            bounds.width.max(1.0),
            bounds.height.max(1.0),
        ))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn library_reserve_embed_close(app: AppHandle) -> Result<(), String> {
    close_embed_if_exists(&app);
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn library_reserve_embed_open(
    _app: AppHandle,
    _state: State<'_, AppState>,
    _req: LibraryReserveEmbedOpenRequest,
) -> Result<(), String> {
    Err("当前平台不支持内嵌官方预约页".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn library_reserve_embed_resize(
    _app: AppHandle,
    _bounds: LibraryReserveEmbedBounds,
) -> Result<(), String> {
    Err("当前平台不支持内嵌官方预约页".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn library_reserve_embed_close(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_chaoxing_and_school_hosts() {
        for host in [
            "reserve.chaoxing.com",
            "passport2.chaoxing.com",
            "captcha.chaoxing.com",
            "chaoxing.com",
            "e.hbut.edu.cn",
        ] {
            assert!(is_embeddable_embed_host(host), "{host} 应可内嵌");
        }
    }

    #[test]
    fn rejects_unrelated_hosts() {
        for host in [
            "baidu.com",
            "github.com",
            "example.com",
            "chaoxing.com.evil.com",
        ] {
            assert!(!is_embeddable_embed_host(host), "{host} 不应内嵌");
        }
    }

    #[test]
    fn classifies_embeddable_urls() {
        let seat: Url = "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597"
            .parse()
            .unwrap();
        let login: Url = "https://passport2.chaoxing.com/login".parse().unwrap();
        let external: Url = "https://www.baidu.com/".parse().unwrap();
        assert!(is_embeddable_url(&seat));
        assert!(is_embeddable_url(&login));
        assert!(!is_embeddable_url(&external));
        // 非 http(s) scheme 一律不内嵌
        let custom: Url = "minihbut://identity".parse().unwrap();
        assert!(!is_embeddable_url(&custom));
    }

    #[test]
    fn resolves_seat_live_page_and_keeps_credentials() {
        let entry =
            "https://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597&enc=ABC&uid=1";
        let live = resolve_embed_target_url(entry, LibraryApp::Seat, Some("live"));
        assert!(
            live.contains("/front/apps/seatengine/live/select"),
            "{live}"
        );
        // 凭证 query 必须保留（否则服务端不认会话）
        assert!(live.contains("enc=ABC"), "{live}");
        assert!(live.contains("seatId=3597"), "{live}");
        assert!(!live.contains("/index"), "{live}");

        // kind=index / 非座位 → 原样
        assert_eq!(
            resolve_embed_target_url(entry, LibraryApp::Seat, Some("index")),
            entry
        );
        assert_eq!(
            resolve_embed_target_url(entry, LibraryApp::Seat, None),
            entry
        );
        let room = "https://reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24727";
        assert_eq!(
            resolve_embed_target_url(room, LibraryApp::QuietRoom, Some("live")),
            room
        );
    }
}
