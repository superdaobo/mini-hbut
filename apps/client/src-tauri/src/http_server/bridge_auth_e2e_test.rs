// #1163 T02-D：Bridge 鉴权的**整链**验收（真实 HTTP + 真实中间件 + 真实状态码）。
//
// 与 `auth::t02_bridge_auth_matrix` 的分工：
// - 那边测「判定函数」（纯逻辑、输入输出）；
// - 这里在 loopback 上起真实的 axum 服务（`127.0.0.1:0`），用 reqwest 发真实请求，
//   断言状态码与响应体。覆盖「策略映射 + 中间件 + 敏感路由」，并可证明
//   「CORS 放行不等于鉴权通过」「401 不回显凭据」。
//
// 不用 `tower::ServiceExt`（避免为测试新增依赖）：真实 socket 更接近线上。
// stub handler 只复刻真实路由的**路径**（策略由路径决定），不触碰业务状态。
#[cfg(all(test, feature = "bridge"))]
mod t02_bridge_e2e {
    use axum::middleware;
    use axum::routing::{any, get, post};
    use axum::Router;
    use reqwest::header::{HeaderName, HeaderValue};
    use std::sync::Arc;

    use crate::http_server::auth::{bridge_access_middleware, BridgeAuthState};

    const TOKEN: &str = "e2e-bridge-token-abc";

    const SENSITIVE: &[(&str, &str)] = &[
        ("POST", "/sync_grades"),
        ("POST", "/sync_schedule"),
        ("POST", "/login"),
        ("GET", "/export_cookies"),
        ("POST", "/import_cookies"),
        ("POST", "/module_bundle/prepare"),
        ("POST", "/course_selection/select"),
    ];

    fn stub_router(debug_build: bool) -> Router {
        Router::new()
            .route("/health", get(|| async { "ok" }))
            .route("/sync_grades", post(|| async { "grades" }))
            .route("/sync_schedule", post(|| async { "schedule" }))
            .route("/login", post(|| async { "login" }))
            .route("/export_cookies", get(|| async { "cookies" }))
            .route("/import_cookies", post(|| async { "import" }))
            .route("/module_bundle/prepare", post(|| async { "prepare" }))
            .route("/course_selection/select", post(|| async { "select" }))
            .route("/exports/demo.ics", get(|| async { "ics" }))
            .route(
                "/module_bundle/content/main/demo/1/index.html",
                get(|| async { "html" }),
            )
            .route("/school-website/news/1", get(|| async { "news" }))
            .route("/reserve-embed/x", any(|| async { "reserve" }))
            .route("/proxy/video", get(|| async { "video" }))
            .route("/cache/get", get(|| async { "cache" }))
            .route("/debug/state", get(|| async { "debug" }))
            .layer(middleware::from_fn_with_state(
                BridgeAuthState::new(Arc::from(TOKEN), debug_build),
                bridge_access_middleware,
            ))
    }

    /// 在随机 loopback 端口起服务，返回 base url；测试结束由进程回收。
    async fn spawn_bridge(debug_build: bool) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind loopback");
        let addr = listener.local_addr().expect("local addr");
        let app = stub_router(debug_build);
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        format!("http://{addr}")
    }

    /// 本地请求必须绕过系统代理（本机有 TUN/Karing 与 S302 中间人）。
    fn http() -> reqwest::Client {
        reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("client")
    }

    async fn status(
        base: &str,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
    ) -> (u16, String) {
        let mut request = http().request(method.parse().expect("method"), format!("{base}{path}"));
        for (name, value) in headers {
            request = request.header(
                name.parse::<HeaderName>().expect("header name"),
                HeaderValue::from_str(value).expect("header value"),
            );
        }
        let response = request.send().await.expect("request");
        let code = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        (code, body)
    }

    #[tokio::test]
    async fn health_is_public_without_any_context() {
        let base = spawn_bridge(true).await;
        let (code, _) = status(&base, "GET", "/health", &[]).await;
        assert_eq!(code, 200);
    }

    #[tokio::test]
    async fn sensitive_routes_reject_trusted_origin_without_token() {
        let base = spawn_bridge(true).await;
        for (method, path) in SENSITIVE {
            let (code, _) = status(&base, method, path, &[("origin", "tauri://localhost")]).await;
            assert_eq!(code, 401, "{method} {path} 仅凭可信 Origin 必须 401");
        }
    }

    #[tokio::test]
    async fn sensitive_routes_reject_any_loopback_port_without_token() {
        let base = spawn_bridge(true).await;
        for port in [4399_u16, 5173, 12345] {
            let origin = format!("http://127.0.0.1:{port}");
            for (method, path) in SENSITIVE {
                let (code, _) = status(&base, method, path, &[("origin", &origin)]).await;
                assert_eq!(code, 401, "{method} {path} 在 {origin} 下必须 401");
            }
        }
    }

    #[tokio::test]
    async fn sensitive_routes_reject_spoofed_referer_without_token() {
        let base = spawn_bridge(true).await;
        for (method, path) in SENSITIVE {
            let (code, _) = status(
                &base,
                method,
                path,
                &[("referer", "http://127.0.0.1:4399/index.html")],
            )
            .await;
            assert_eq!(code, 401, "{method} {path} 伪造 Referer 必须 401");
        }
    }

    #[tokio::test]
    async fn sensitive_routes_accept_valid_bearer_token() {
        let base = spawn_bridge(true).await;
        let bearer = format!("Bearer {TOKEN}");
        for (method, path) in SENSITIVE {
            let (code, _) = status(&base, method, path, &[("authorization", &bearer)]).await;
            assert_eq!(code, 200, "{method} {path} 带令牌必须放行");
        }
    }

    #[tokio::test]
    async fn x_local_token_header_also_works() {
        let base = spawn_bridge(true).await;
        let (code, _) = status(&base, "GET", "/export_cookies", &[("x-local-token", TOKEN)]).await;
        assert_eq!(code, 200);
    }

    #[tokio::test]
    async fn wrong_token_is_rejected() {
        let base = spawn_bridge(true).await;
        let (code, _) = status(
            &base,
            "POST",
            "/sync_grades",
            &[("authorization", "Bearer not-the-token")],
        )
        .await;
        assert_eq!(code, 401);
    }

    #[tokio::test]
    async fn public_embed_routes_are_open_for_reads_only() {
        let base = spawn_bridge(true).await;
        for path in [
            "/exports/demo.ics",
            "/module_bundle/content/main/demo/1/index.html",
            "/school-website/news/1",
        ] {
            let (code, _) = status(&base, "GET", path, &[]).await;
            assert_eq!(code, 200, "GET {path} 应免令牌");
        }
        let (code, _) = status(
            &base,
            "POST",
            "/module_bundle/content/main/demo/1/index.html",
            &[],
        )
        .await;
        assert_eq!(code, 401, "公开只读路由不接受写方法");
    }

    #[tokio::test]
    async fn reserve_embed_write_keeps_trusted_context_rule() {
        let base = spawn_bridge(true).await;
        let (ok, _) = status(
            &base,
            "POST",
            "/reserve-embed/x",
            &[("origin", "http://127.0.0.1:4399")],
        )
        .await;
        assert_eq!(ok, 200, "官方代理页（同源）写方法应放行");

        let (hostile, _) = status(
            &base,
            "POST",
            "/reserve-embed/x",
            &[("origin", "https://attacker.example")],
        )
        .await;
        assert_eq!(hostile, 403);

        let (anon, _) = status(&base, "POST", "/reserve-embed/x", &[]).await;
        assert_eq!(anon, 401, "无来源的写请求必须拒绝");
    }

    #[tokio::test]
    async fn media_and_cache_transports_are_read_only() {
        let base = spawn_bridge(true).await;
        for path in ["/proxy/video", "/cache/get"] {
            let (read, _) = status(&base, "GET", path, &[]).await;
            assert_eq!(read, 200, "GET {path} 传输层放行（handler 再校验凭据）");
            let (write, _) = status(&base, "POST", path, &[("origin", "tauri://localhost")]).await;
            assert_eq!(write, 401, "POST {path} 必须拒绝");
        }
    }

    #[tokio::test]
    async fn null_and_public_origins_are_forbidden() {
        let base = spawn_bridge(true).await;
        for origin in ["null", "https://evil.example", "http://192.168.1.10:8080"] {
            let (code, _) = status(&base, "POST", "/sync_grades", &[("origin", origin)]).await;
            assert_eq!(code, 403, "origin {origin} 必须 403");
        }
    }

    #[tokio::test]
    async fn unauthorized_response_never_leaks_token() {
        let base = spawn_bridge(true).await;
        let (code, body) = status(
            &base,
            "POST",
            "/sync_grades",
            &[("origin", "tauri://localhost")],
        )
        .await;
        assert_eq!(code, 401);
        assert!(!body.contains(TOKEN), "401 响应体不得包含令牌原文：{body}");
        assert!(
            !body.contains("Bearer"),
            "401 响应体不得回显 Authorization 形状：{body}"
        );
    }

    #[tokio::test]
    async fn cors_allowance_is_not_authorization() {
        // 预检都带合法 Origin（CORS 允许），但鉴权仍必须独立成立。
        let base = spawn_bridge(true).await;
        let (code, _) = status(
            &base,
            "POST",
            "/sync_grades",
            &[
                ("origin", "tauri://localhost"),
                ("access-control-request-method", "POST"),
            ],
        )
        .await;
        assert_eq!(code, 401);
    }

    #[tokio::test]
    async fn debug_routes_are_hidden_in_release_build() {
        let bearer = format!("Bearer {TOKEN}");
        let release_base = spawn_bridge(false).await;
        let (release_code, _) = status(
            &release_base,
            "GET",
            "/debug/state",
            &[("authorization", &bearer)],
        )
        .await;
        assert_eq!(release_code, 404);

        let debug_base = spawn_bridge(true).await;
        let (debug_code, _) = status(
            &debug_base,
            "GET",
            "/debug/state",
            &[("authorization", &bearer)],
        )
        .await;
        assert_eq!(debug_code, 200, "Debug 构建 + 令牌应可访问");
    }
}
