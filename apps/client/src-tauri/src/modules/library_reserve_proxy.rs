//! 图书馆预约官方页 · Bridge 反向代理（issue #1081：iOS 内嵌方案）。
//!
//! ## 为什么需要它
//!
//! 桌面端用 `Window::add_child` 建子 WebView 内嵌官方页（见 [`super::library_reserve_embed`]），
//! 但 **iOS 上 `add_child` 不可用**（tauri-2.11 里其 cfg 为
//! `all(desktop, feature = "unstable")`；且移动端多窗口会替换当前 UI，不是「内嵌」）。
//! iOS 复用仓库既有的「学校官网」配方：**Bridge 反向代理 + iframe**
//! （`modules/school_website_embed.rs` + `http_server/routes/proxy.rs`）。
//!
//! ## 与学校官网代理的三处关键差异
//!
//! 1. **`<base href="https://reserve.chaoxing.com/">`**：官方页所有相对路径（`data/apps/…`）
//!    都以它为基准解析；不改写就会绕过桥直连官方 → 跨站 + cookie 失效。
//! 2. **协议派生**：页面内联脚本有 `photoUrl = document.location.protocol + photoUrl.split(":")[1]`
//!    （`panUrl` / `noteUrl` / `staticDomain` 同款，共 4 处）。被 http 代理后
//!    `staticDomain` 会退化成 `http://office-static.chaoxing.com/r/`，而它是 requirejs 的
//!    `baseUrl` → 业务模块全走明文公网 → **iOS ATS 拦截 → 白屏**。
//!    故重写时把该表达式改成**恒等**：右侧操作数本身是绝对 URL，经 §2 改写后已是桥内路径。
//! 3. **官方 API 全是相对路径**（`loadData('data/apps/seatengine/submit', …)`），
//!    因此「改 base + 改写绝对 URL」即可覆盖，**不需要**改 CDN 上的 JS。
//!
//! ## 前缀约定（白名单只含三个主机，防开放代理 / SSRF）
//!
//! ```text
//! /reserve-embed/…           → https://reserve.chaoxing.com/…
//! /reserve-embed/@static/…   → https://office-static.chaoxing.com/…
//! /reserve-embed/@captcha/…  → https://captcha.chaoxing.com/…
//! ```
//!
//! 本模块只放**纯逻辑**（无 axum / tauri 依赖），便于 `cargo test --lib` 直接覆盖；
//! HTTP handler 在 `http_server/routes/library_reserve.rs`。

/// iframe 顶层 URL 与重写后的资源路径共用的桥内前缀
pub const RESERVE_EMBED_PREFIX: &str = "/reserve-embed/";

/// 官方预约系统主机（业务页与 `data/apps/*` 接口都在这台）
pub const RESERVE_HOST: &str = "reserve.chaoxing.com";
/// 官方静态资源主机（requirejs `baseUrl`、签名脚本、图片）
pub const STATIC_HOST: &str = "office-static.chaoxing.com";
/// cxCaptcha 行为验证主机
pub const CAPTCHA_HOST: &str = "captcha.chaoxing.com";

/// 子域标签 → 上游主机（`@static` / `@captcha`）
fn label_to_host(label: &str) -> Option<&'static str> {
    match label {
        "static" => Some(STATIC_HOST),
        "captcha" => Some(CAPTCHA_HOST),
        _ => None,
    }
}

/// 上游主机 → 桥内前缀（HTML 改写与入口 URL 映射共用）
pub fn host_to_embed_prefix(host: &str) -> Option<&'static str> {
    match host {
        RESERVE_HOST => Some(RESERVE_EMBED_PREFIX),
        STATIC_HOST => Some("/reserve-embed/@static/"),
        CAPTCHA_HOST => Some("/reserve-embed/@captcha/"),
        _ => None,
    }
}

/// Bridge 监听基址（与 `http_server::bridge_listen_addr` 同源：同一环境变量、同一默认端口）。
///
/// 单独实现是为了让本模块（以及不启用 `bridge` feature 的构建）不依赖 `http_server` 模块。
pub fn bridge_base_url() -> String {
    let port = std::env::var("HBUT_HTTP_BRIDGE_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .unwrap_or(4399);
    format!("http://127.0.0.1:{port}")
}

/// 代理目标（上游主机 + 路径）
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReserveEmbedProxyTarget {
    pub host: String,
    pub path: String,
}

/// 解析桥内路径 → 上游目标。
///
/// - `@static/…` / `@captcha/…` 走对应 CDN 主机；其余一律落到 [`RESERVE_HOST`]；
/// - 含 `..` 的路径直接拒绝（防目录穿越 / 开放代理）。
pub fn parse_reserve_embed_proxy_path(path: &str) -> Result<ReserveEmbedProxyTarget, String> {
    let clean = path.trim_start_matches('/').trim();
    if clean.contains("..") {
        return Err("预约页代理路径非法".to_string());
    }
    if clean.contains('\\') || clean.chars().any(|c| c.is_control()) {
        return Err("预约页代理路径非法".to_string());
    }

    let (host, remainder) = match clean.strip_prefix('@') {
        Some(rest) => {
            let (label, rest_path) = rest.split_once('/').unwrap_or((rest, ""));
            let host =
                label_to_host(label).ok_or_else(|| format!("预约页代理主机未授权: {label}"))?;
            (host, rest_path.trim_start_matches('/'))
        }
        None => (RESERVE_HOST, clean),
    };

    Ok(ReserveEmbedProxyTarget {
        host: host.to_string(),
        path: remainder.to_string(),
    })
}

/// 目标 → 上游 URL（query 原样透传：入口凭证 `enc/fidEnc/…` 必须逐字保留）
pub fn build_reserve_embed_remote_url(
    target: &ReserveEmbedProxyTarget,
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
            url.push('?');
            url.push_str(q);
        }
    }
    url
}

/// 官方入口 URL → 桥内 iframe URL（iframe 的 `src`）。
///
/// 只接受白名单主机与 `https`：入口 URL 携带短时效凭证，任何非预期主机都应直接失败，
/// 而不是把凭证发出去。
pub fn build_reserve_embed_bridge_url(
    bridge_base: &str,
    entry_url: &str,
) -> Result<String, String> {
    let parsed = url::Url::parse(entry_url).map_err(|e| format!("预约入口地址无效: {e}"))?;
    if parsed.scheme() != "https" {
        return Err(format!("预约入口必须为 https：{}", parsed.scheme()));
    }
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    let prefix =
        host_to_embed_prefix(&host).ok_or_else(|| format!("预约入口主机不在白名单内: {host}"))?;

    let mut url = format!(
        "{}{}{}",
        bridge_base.trim_end_matches('/'),
        prefix,
        parsed.path().trim_start_matches('/')
    );
    if let Some(query) = parsed.query() {
        if !query.is_empty() {
            url.push('?');
            url.push_str(query);
        }
    }
    Ok(url)
}

/// 重写官方页 HTML，使其在桥内（http://127.0.0.1:4399/reserve-embed/…）自洽。
///
/// 规则顺序即依赖顺序：
/// 1. `<base href>` → 桥前缀（相对路径 `data/apps/…` 必须落在桥上）；
/// 2. 三个白名单主机的绝对 / 协议相对 URL → 桥前缀；
/// 3. `document.location.protocol + X.split(":")[1]` → `X`（协议派生恒等化，见模块头 §2）；
/// 4. 残留的 `document.location.protocol` → `'https:'`（兜底，防明文公网被 ATS 拦）；
/// 5. 根相对 `href|src|action="/x"` → 桥前缀（`/x` 会无视 `<base>`，否则打到桥根 404）。
pub fn rewrite_reserve_embed_html(html: &str) -> String {
    let mut out = html.to_string();

    // 1) <base href="https://reserve.chaoxing.com/"> → /reserve-embed/
    let base_re = regex::Regex::new(
        r#"(?i)(<base\s+[^>]*href\s*=\s*["'])(?:https?:)?//reserve\.chaoxing\.com/?(["'])"#,
    )
    .expect("reserve embed base rewrite regex");
    out = base_re
        .replace_all(&out, r#"$1/reserve-embed/$2"#)
        .to_string();

    // 2) 白名单主机的绝对 / 协议相对 URL → 桥前缀
    //
    // 先长主机后短主机（`office-static` / `captcha` 不会被 `reserve` 命中，但顺序固定更稳）。
    for host in [STATIC_HOST, CAPTCHA_HOST, RESERVE_HOST] {
        let Some(prefix) = host_to_embed_prefix(host) else {
            continue;
        };
        for scheme in ["https", "http"] {
            let needle = format!("{scheme}://{host}");
            out = out.replace(&format!("{needle}/"), prefix);
            out = out.replace(&needle, prefix.trim_end_matches('/'));
        }
        let needle = format!("//{host}");
        out = out.replace(&format!("{needle}/"), prefix);
        out = out.replace(&needle, prefix.trim_end_matches('/'));
    }

    // 3) 协议派生恒等化：右侧 `X` 已被 §2 改写成桥内路径，再拼协议只会拼出垃圾
    //    （`'/reserve-embed/@static/x'.split(':')[1]` → undefined）。
    let proto_ident_re = regex::Regex::new(
        r#"document\.location\.protocol\s*\+\s*([A-Za-z_$][A-Za-z0-9_$]*)\.split\(\s*["']:["']\s*\)\[1\]"#,
    )
    .expect("reserve embed protocol identity regex");
    out = proto_ident_re.replace_all(&out, "$1").to_string();

    // 4) 兜底：其它形态的协议派生一律钉死为 https
    out = out.replace("document.location.protocol", "'https:'");

    // 5) 根相对属性 → 桥前缀（已在桥前缀下的原样保留）
    let root_rel = regex::Regex::new(r#"(?i)(href|src|action)\s*=\s*(["'])/([^"']*)"#)
        .expect("reserve embed root-relative rewrite regex");
    out = root_rel
        .replace_all(&out, |caps: &regex::Captures| {
            let attr = &caps[1];
            let quote = &caps[2];
            let path = &caps[3];
            if path.starts_with("reserve-embed/") {
                caps[0].to_string()
            } else {
                format!("{attr}={quote}/reserve-embed/{path}{quote}")
            }
        })
        .to_string();

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reserve_paths_by_default() {
        let target = parse_reserve_embed_proxy_path("/front/apps/seatengine/live/select").unwrap();
        assert_eq!(target.host, RESERVE_HOST);
        assert_eq!(target.path, "front/apps/seatengine/live/select");

        let root = parse_reserve_embed_proxy_path("/").unwrap();
        assert_eq!(root.host, RESERVE_HOST);
        assert_eq!(root.path, "");
    }

    #[test]
    fn parses_cdn_subdomain_labels() {
        let static_target =
            parse_reserve_embed_proxy_path("@static/r/staticreserve/js/lib/md5/md5.js").unwrap();
        assert_eq!(static_target.host, STATIC_HOST);
        assert_eq!(static_target.path, "r/staticreserve/js/lib/md5/md5.js");

        let captcha_target = parse_reserve_embed_proxy_path("@captcha/load-d.min.js").unwrap();
        assert_eq!(captcha_target.host, CAPTCHA_HOST);
        assert_eq!(captcha_target.path, "load-d.min.js");
    }

    #[test]
    fn rejects_unknown_labels_and_traversal() {
        // 白名单外的主机标签一律拒绝（否则就是开放代理）
        assert!(parse_reserve_embed_proxy_path("@passport2/login").is_err());
        assert!(parse_reserve_embed_proxy_path("@evil.example.com/x").is_err());
        // 目录穿越 / 反斜杠 / 控制字符一律拒绝
        assert!(parse_reserve_embed_proxy_path("front/../../etc/passwd").is_err());
        assert!(parse_reserve_embed_proxy_path("front\\apps").is_err());
        // 百分号编码的 `..` 不含字面量，交给上游按普通路径处理（不构成穿越）
        assert!(parse_reserve_embed_proxy_path("a/%2e%2e/b").is_ok());
        // `@static` 无尾斜杠 → 该主机根路径，允许
        let bare = parse_reserve_embed_proxy_path("@static").unwrap();
        assert_eq!(bare.host, STATIC_HOST);
        assert_eq!(bare.path, "");
    }

    #[test]
    fn builds_remote_url_keeping_credentials_verbatim() {
        let target = parse_reserve_embed_proxy_path("front/apps/seatengine/live/select").unwrap();
        let url = build_reserve_embed_remote_url(
            &target,
            Some("seatId=3597&enc=A%2BB&fidEnc=c7450f13f8a0e9ab&uid=123"),
        );
        assert_eq!(
            url,
            "https://reserve.chaoxing.com/front/apps/seatengine/live/select?seatId=3597&enc=A%2BB&fidEnc=c7450f13f8a0e9ab&uid=123"
        );

        let root = parse_reserve_embed_proxy_path("/").unwrap();
        assert_eq!(
            build_reserve_embed_remote_url(&root, None),
            "https://reserve.chaoxing.com/"
        );
        assert_eq!(
            build_reserve_embed_remote_url(&root, Some("  ")),
            "https://reserve.chaoxing.com/"
        );
    }

    #[test]
    fn maps_entry_url_to_bridge_iframe_url() {
        let entry = "https://reserve.chaoxing.com/front/apps/seatengine/live/select?seatId=3597&enc=ABC%2B1&fidEnc=x";
        let url = build_reserve_embed_bridge_url("http://127.0.0.1:4399", entry).unwrap();
        assert_eq!(
            url,
            "http://127.0.0.1:4399/reserve-embed/front/apps/seatengine/live/select?seatId=3597&enc=ABC%2B1&fidEnc=x"
        );

        // 尾斜杠基址不能拼出双斜杠
        let url = build_reserve_embed_bridge_url("http://127.0.0.1:4399/", entry).unwrap();
        assert!(
            url.starts_with("http://127.0.0.1:4399/reserve-embed/"),
            "{url}"
        );
    }

    #[test]
    fn rejects_entry_urls_outside_whitelist_or_plain_http() {
        // 凭证不得发往白名单外的主机
        assert!(build_reserve_embed_bridge_url(
            "http://127.0.0.1:4399",
            "https://evil.example.com/front/apps/seatengine/index?enc=ABC"
        )
        .is_err());
        // http 入口（明文 + 无 cookie）一律拒绝
        assert!(build_reserve_embed_bridge_url(
            "http://127.0.0.1:4399",
            "http://reserve.chaoxing.com/front/apps/seatengine/index"
        )
        .is_err());
    }

    #[test]
    fn bridge_base_url_defaults_to_loopback_4399() {
        // 不设置环境变量时必须是 4399（与前端 LOCAL_BRIDGE_BASE 一致）
        if std::env::var("HBUT_HTTP_BRIDGE_PORT").is_err() {
            assert_eq!(bridge_base_url(), "http://127.0.0.1:4399");
        }
    }

    #[test]
    fn rewrites_base_tag_to_bridge_prefix() {
        let html = r#"<head><base href="https://reserve.chaoxing.com/"></head>"#;
        let rewritten = rewrite_reserve_embed_html(html);
        assert!(
            rewritten.contains(r#"<base href="/reserve-embed/""#),
            "{rewritten}"
        );
        assert!(!rewritten.contains("reserve.chaoxing.com"), "{rewritten}");

        // 协议相对形态同样要改
        let proto_relative = r#"<base href="//reserve.chaoxing.com/">"#;
        assert!(
            rewrite_reserve_embed_html(proto_relative).contains(r#"<base href="/reserve-embed/""#)
        );
    }

    #[test]
    fn rewrites_absolute_urls_of_whitelisted_hosts() {
        let html = concat!(
            r#"<script src="https://office-static.chaoxing.com/r/staticreserve/js/lib/md5/md5.js"></script>"#,
            r#"<script src="//captcha.chaoxing.com/load-d.min.js"></script>"#,
            r#"<a href="http://reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597">go</a>"#,
            r#"<img src="https://office-static.chaoxing.com/r/x.png">"#
        );
        let rewritten = rewrite_reserve_embed_html(html);

        assert!(rewritten.contains("/reserve-embed/@static/r/staticreserve/js/lib/md5/md5.js"));
        assert!(rewritten.contains("/reserve-embed/@captcha/load-d.min.js"));
        assert!(rewritten.contains("/reserve-embed/front/apps/seatengine/index?seatId=3597"));
        assert!(rewritten.contains("/reserve-embed/@static/r/x.png"));
        // 白名单主机的直连一律不得残留
        assert!(
            !rewritten.contains("office-static.chaoxing.com"),
            "{rewritten}"
        );
        assert!(!rewritten.contains("captcha.chaoxing.com"), "{rewritten}");
        assert!(!rewritten.contains("reserve.chaoxing.com"), "{rewritten}");
    }

    #[test]
    fn rewrites_protocol_derivation_to_identity() {
        // 官方页原文形态（4 处同款）：右侧是绝对 URL，改写后应恒等为桥内路径
        let html = concat!(
            "var photoUrl = 'https://office-static.chaoxing.com/r/pic/a.png';\n",
            "photoUrl = document.location.protocol + photoUrl.split(\":\")[1];\n",
            "var panUrl = 'https://office-static.chaoxing.com/r/pan/b.png';\n",
            "panUrl = document.location.protocol + panUrl.split(':')[1];\n"
        );
        let rewritten = rewrite_reserve_embed_html(html);

        assert!(
            rewritten.contains("photoUrl = photoUrl;"),
            "协议派生必须恒等化：{rewritten}"
        );
        assert!(
            rewritten.contains("panUrl = panUrl;"),
            "协议派生必须恒等化：{rewritten}"
        );
        // 关键：不得残留 document.location.protocol（http 代理下会拼出明文公网域名 → ATS 拦）
        assert!(
            !rewritten.contains("document.location.protocol"),
            "{rewritten}"
        );
        assert!(
            rewritten.contains("'/reserve-embed/@static/r/pic/a.png'"),
            "{rewritten}"
        );
    }

    #[test]
    fn keeps_https_fallback_for_unknown_protocol_derivation() {
        // 非「绝对 URL + split」形态（例如直接拼常量）时，兜底钉死 https
        let html = "var base = document.location.protocol + '//other.example.com/x';";
        let rewritten = rewrite_reserve_embed_html(html);
        assert!(
            rewritten.contains("'https:' + '//other.example.com/x'"),
            "{rewritten}"
        );
        assert!(
            !rewritten.contains("document.location.protocol"),
            "{rewritten}"
        );
    }

    #[test]
    fn rewrites_root_relative_attributes_once() {
        let html = concat!(
            r#"<a href="/front/apps/seatengine/live/select">x</a>"#,
            r#"<img src="/staticreserve/img/logo.png">"#,
            r#"<form action="/data/apps/seatengine/submit" method="post"></form>"#,
            r#"<a href="/reserve-embed/already/prefixed">y</a>"#
        );
        let rewritten = rewrite_reserve_embed_html(html);

        assert!(rewritten.contains(r#"href="/reserve-embed/front/apps/seatengine/live/select""#));
        assert!(rewritten.contains(r#"src="/reserve-embed/staticreserve/img/logo.png""#));
        assert!(rewritten.contains(r#"action="/reserve-embed/data/apps/seatengine/submit""#));
        // 已在前缀下的不得二次加前缀
        assert!(rewritten.contains(r#"href="/reserve-embed/already/prefixed""#));
        assert!(
            !rewritten.contains("/reserve-embed/reserve-embed/"),
            "{rewritten}"
        );
    }

    #[test]
    fn leaves_relative_paths_to_the_rewritten_base() {
        // 官方 API 全是相对路径：不带头斜杠，靠 <base> 落到桥内，重写器不得动它们
        let html = r#"<script>loadData('data/apps/seatengine/submit', {seatId: '3597'})</script>"#;
        let rewritten = rewrite_reserve_embed_html(html);
        assert!(
            rewritten.contains("loadData('data/apps/seatengine/submit'"),
            "{rewritten}"
        );
    }
}
