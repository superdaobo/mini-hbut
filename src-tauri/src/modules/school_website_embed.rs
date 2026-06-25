//! 学校官网内嵌子 WebView：全高度展示 + 站外链接外部打开。

use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::{
    LogicalPosition, LogicalSize, WebviewUrl,
    webview::{NewWindowResponse, WebviewBuilder},
};
use url::Url;

const EMBED_LABEL: &str = "school-website-embed";
const START_URL: &str = "https://www.hbut.edu.cn/";

#[derive(Debug, serde::Deserialize)]
pub struct EmbedBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

fn is_hbut_official_host(host: &str) -> bool {
    host == "hbut.edu.cn" || host == "www.hbut.edu.cn" || host.ends_with(".hbut.edu.cn")
}

fn is_embeddable_url(url: &Url) -> bool {
    match url.scheme() {
        "http" | "https" => url.host_str().map(is_hbut_official_host).unwrap_or(false),
        _ => false,
    }
}

fn open_external(app: &AppHandle, target: &str) {
    let _ = crate::open_external_url_impl(app, target);
}

#[cfg(desktop)]
fn close_embed_if_exists(app: &AppHandle) {
    if let Some(webview) = app.get_webview(EMBED_LABEL) {
        let _ = webview.close();
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn school_website_embed_open(app: AppHandle, bounds: EmbedBounds) -> Result<(), String> {
    close_embed_if_exists(&app);

    let window = app
        .get_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;
    let start_url: Url = START_URL
        .parse()
        .map_err(|e| format!("官网地址无效: {}", e))?;

    let app_for_nav = app.clone();
    let builder = WebviewBuilder::new(EMBED_LABEL, WebviewUrl::External(start_url))
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
                    NewWindowResponse::Deny
                } else {
                    open_external(&app_for_nav, url.as_str());
                    NewWindowResponse::Deny
                }
            }
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
        )
        .map_err(|e| format!("创建学校官网内嵌失败: {}", e))?;

    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn school_website_embed_resize(app: AppHandle, bounds: EmbedBounds) -> Result<(), String> {
    let webview = app
        .get_webview(EMBED_LABEL)
        .ok_or_else(|| "学校官网内嵌未打开".to_string())?;
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
pub async fn school_website_embed_close(app: AppHandle) -> Result<(), String> {
    close_embed_if_exists(&app);
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn school_website_embed_open(_app: AppHandle, _bounds: EmbedBounds) -> Result<(), String> {
    Err("当前平台不支持学校官网内嵌".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn school_website_embed_resize(_app: AppHandle, _bounds: EmbedBounds) -> Result<(), String> {
    Err("当前平台不支持学校官网内嵌".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn school_website_embed_close(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_hbut_official_hosts() {
        assert!(is_hbut_official_host("www.hbut.edu.cn"));
        assert!(is_hbut_official_host("hbut.edu.cn"));
        assert!(is_hbut_official_host("news.hbut.edu.cn"));
        assert!(is_hbut_official_host("e.hbut.edu.cn"));
    }

    #[test]
    fn rejects_external_hosts() {
        assert!(!is_hbut_official_host("baidu.com"));
        assert!(!is_hbut_official_host("github.com"));
        assert!(!is_hbut_official_host("chaoxing.com"));
    }

    #[test]
    fn classifies_embeddable_urls() {
        let official: Url = "https://www.hbut.edu.cn/xxgk/index.htm".parse().unwrap();
        let portal: Url = "https://e.hbut.edu.cn/login".parse().unwrap();
        let external: Url = "https://www.baidu.com/".parse().unwrap();

        assert!(is_embeddable_url(&official));
        assert!(is_embeddable_url(&portal));
        assert!(!is_embeddable_url(&external));
    }
}
