//! 学校官网内嵌子 WebView：全高度展示 + 站外链接外部打开。

use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    LogicalPosition, LogicalSize, WebviewUrl,
};
use url::Url;

const EMBED_LABEL: &str = "school-website-embed";
const START_URL: &str = "https://www.hbut.edu.cn/";
pub const DEFAULT_SCHOOL_WEBSITE_HOST: &str = "www.hbut.edu.cn";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchoolWebsiteProxyTarget {
    pub host: String,
    pub path: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct EmbedBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn is_hbut_official_host(host: &str) -> bool {
    host == "hbut.edu.cn" || host == "www.hbut.edu.cn" || host.ends_with(".hbut.edu.cn")
}

pub fn host_to_proxy_prefix(host: &str) -> Option<String> {
    if !is_hbut_official_host(host) {
        return None;
    }
    if host == "www.hbut.edu.cn" || host == "hbut.edu.cn" {
        return Some("/school-website/".to_string());
    }
    let label = host.strip_suffix(".hbut.edu.cn")?;
    if label.is_empty() || label.contains('.') {
        return None;
    }
    Some(format!("/school-website/@{label}/"))
}

pub fn parse_school_website_proxy_path(
    path: &str,
    query: Option<&str>,
) -> Result<SchoolWebsiteProxyTarget, String> {
    let clean_path = path.trim_start_matches('/').trim();
    if clean_path.contains("..") {
        return Err("学校官网代理路径非法".to_string());
    }

    let mut host = DEFAULT_SCHOOL_WEBSITE_HOST.to_string();
    let mut remainder = clean_path.to_string();

    if let Some(stripped) = clean_path.strip_prefix('@') {
        let (label, rest) = stripped
            .split_once('/')
            .map(|(label, rest)| (label, rest))
            .unwrap_or((stripped, ""));
        if label.is_empty() {
            return Err("学校官网代理子域非法".to_string());
        }
        host = if label == "www" || label == "hbut" {
            DEFAULT_SCHOOL_WEBSITE_HOST.to_string()
        } else {
            format!("{label}.hbut.edu.cn")
        };
        remainder = rest.trim_start_matches('/').to_string();
    }

    if let Some(q) = query {
        for pair in q.split('&') {
            let Some((key, value)) = pair.split_once('=') else {
                continue;
            };
            if key == "host" && !value.trim().is_empty() {
                host = value.trim().to_string();
            }
        }
    }

    if !is_hbut_official_host(&host) {
        return Err("学校官网代理主机未授权".to_string());
    }

    Ok(SchoolWebsiteProxyTarget {
        host,
        path: remainder,
    })
}

pub fn build_school_website_remote_url(
    target: &SchoolWebsiteProxyTarget,
    query: Option<&str>,
) -> String {
    let base = format!("https://{}", target.host);
    let path = target.path.trim_start_matches('/');
    let mut url = if path.is_empty() {
        format!("{base}/")
    } else {
        format!("{base}/{path}")
    };
    if let Some(q) = query {
        let q = q.trim();
        if !q.is_empty() {
            if q.contains("host=") {
                let filtered = q
                    .split('&')
                    .filter(|part| !part.starts_with("host="))
                    .collect::<Vec<_>>()
                    .join("&");
                if !filtered.is_empty() {
                    url.push('?');
                    url.push_str(&filtered);
                }
            } else {
                url.push('?');
                url.push_str(q);
            }
        }
    }
    url
}

pub fn rewrite_school_website_html(html: &str) -> String {
    let mut out = html.to_string();
    for host in [
        "www.hbut.edu.cn",
        "hbut.edu.cn",
        "news.hbut.edu.cn",
        "e.hbut.edu.cn",
    ] {
        if let Some(prefix) = host_to_proxy_prefix(host) {
            for scheme in ["https", "http"] {
                let needle = format!("{scheme}://{host}");
                out = out.replace(&format!("{needle}/"), &prefix);
                out = out.replace(&needle, prefix.trim_end_matches('/'));
            }
            let needle = format!("//{host}");
            out = out.replace(&format!("{needle}/"), &prefix);
            out = out.replace(&needle, prefix.trim_end_matches('/'));
        }
    }

    let re = regex::Regex::new(r#"https?://([a-z0-9-]+)\.hbut\.edu\.cn"#).expect("school website rewrite regex");
    out = re
        .replace_all(&out, |caps: &regex::Captures| {
            let label = &caps[1];
            if label == "www" {
                "/school-website".to_string()
            } else {
                format!("/school-website/@{label}")
            }
        })
        .to_string();
    out
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
pub async fn school_website_embed_resize(
    app: AppHandle,
    bounds: EmbedBounds,
) -> Result<(), String> {
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
pub async fn school_website_embed_open(
    _app: AppHandle,
    _bounds: EmbedBounds,
) -> Result<(), String> {
    Err("当前平台不支持学校官网内嵌".to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
pub async fn school_website_embed_resize(
    _app: AppHandle,
    _bounds: EmbedBounds,
) -> Result<(), String> {
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
        let news: Url = "https://news.hbut.edu.cn/info/123".parse().unwrap();
        let external: Url = "https://www.baidu.com/".parse().unwrap();

        assert!(is_embeddable_url(&official));
        assert!(is_embeddable_url(&portal));
        assert!(is_embeddable_url(&news));
        assert!(!is_embeddable_url(&external));
    }

    #[test]
    fn parses_news_proxy_path() {
        let target = parse_school_website_proxy_path("@news/info/123", None).unwrap();
        assert_eq!(target.host, "news.hbut.edu.cn");
        assert_eq!(target.path, "info/123");
    }

    #[test]
    fn rewrites_news_links_to_proxy_paths() {
        let html = r#"<a href="https://news.hbut.edu.cn/info/1">news</a>"#;
        let rewritten = rewrite_school_website_html(html);
        assert!(rewritten.contains("/school-website/@news/info/1"));
    }
}
