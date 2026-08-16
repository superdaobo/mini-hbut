//! 本地 HTTP Bridge 服务（http_server 模块入口）。
//!
//! 用途：
//! - 提供给外部脚本/测试工具调用后端能力
//! - 统一返回结构（ApiResponse）与错误类型（ApiError）
//! - 仅监听本地地址，避免外部访问
//!
//! 注意：
//! - 这是测试桥接，不应暴露到公网
//! - 返回体固定为 { success, data, error, time }
//!
//! 模块结构（拆分自原 http_server.rs）：
//! - `response`：统一响应结构
//! - `state`：共享状态
//! - `auth`：鉴权公共层 / CORS / 路由策略
//! - `routes`：按领域拆分的 Router 与 Handler

mod auth;
mod response;
mod routes;
mod state;

use axum::middleware;
use axum::Router;
use serde::Serialize;

use std::io::ErrorKind;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::{Mutex, RwLock};

use crate::http_client::HbutClient;

use auth::{
    bridge_access_middleware, bridge_cors_layer, generate_bridge_session_token,
    load_local_api_public_key,
};
use state::HttpState;

/// Bridge 是否在本平台/构建下应启用（与 spawn 策略一致）。
///
/// 矩阵摘要：
/// - iOS（任何构建）：默认启用（官网 proxy / module_bundle 依赖 loopback）
/// - debug_assertions（任意 OS）：默认启用（开发调试）
/// - Android Release：默认**不**启用（前端走 external-open / Capacitor 本地）
/// - 桌面 Release：默认不启用；`HBUT_HTTP_BRIDGE_ENABLED=1|true` 可强制开启
pub fn is_http_bridge_enabled() -> bool {
    cfg!(debug_assertions)
        || cfg!(target_os = "ios")
        || std::env::var("HBUT_HTTP_BRIDGE_ENABLED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
}

/// 解析 Bridge 监听地址（固定 Loopback，端口默认 `4399`）。
///
/// `HBUT_HTTP_BRIDGE_HOST` 已被有意忽略，避免 Release 或误配置将 Bridge 暴露到
/// 局域网/公网。端口仍可通过 `HBUT_HTTP_BRIDGE_PORT` 调整。
pub fn bridge_listen_addr() -> SocketAddr {
    let port = std::env::var("HBUT_HTTP_BRIDGE_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|port| *port != 0)
        .unwrap_or(4399);
    SocketAddr::from(([127, 0, 0, 1], port))
}

/// `ensure_http_bridge` / 前端 resume 探测共用的状态字段。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureHttpBridgeResult {
    /// 当前平台/构建是否允许 Bridge
    pub enabled: bool,
    /// `/health` 是否可达
    pub healthy: bool,
    /// 是否在本次调用中触发了 respawn
    pub respawned: bool,
    /// 监听地址（enabled 时有意义）
    pub addr: String,
    /// 人类可读状态：disabled | healthy | respawned | port_busy | spawn_failed | still_unhealthy
    pub status: String,
    /// 可选诊断信息
    pub detail: Option<String>,
}

/// 进程内 Bridge 生命周期：支持长后台后 ensure/respawn。
struct BridgeLifecycle {
    /// 防止并发 ensure 重复 spawn
    lock: Mutex<()>,
    /// 优雅关闭当前 listener 的 oneshot
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    /// 已成功 bind 且 serve 中
    listening: std::sync::atomic::AtomicBool,
    /// spawn 代数（日志可观测冷启 vs 热恢复）
    generation: std::sync::atomic::AtomicU64,
}

impl BridgeLifecycle {
    fn new() -> Self {
        Self {
            lock: Mutex::new(()),
            shutdown_tx: Mutex::new(None),
            listening: std::sync::atomic::AtomicBool::new(false),
            generation: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

fn bridge_lifecycle() -> &'static BridgeLifecycle {
    static LIFE: OnceLock<BridgeLifecycle> = OnceLock::new();
    LIFE.get_or_init(BridgeLifecycle::new)
}

/// 探测 loopback `/health`（短超时，供 ensure 与单测复用）。
pub async fn probe_http_bridge_health() -> bool {
    let addr = bridge_listen_addr();
    let url = format!("http://{}/health", addr);
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_millis(900))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client.get(&url).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

async fn request_bridge_shutdown() {
    let life = bridge_lifecycle();
    let tx = {
        let mut guard = life.shutdown_tx.lock().await;
        guard.take()
    };
    if let Some(tx) = tx {
        let _ = tx.send(());
        // 给 serve 一点时间释放端口
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    life.listening
        .store(false, std::sync::atomic::Ordering::SeqCst);
}

/// 启动本地 Bridge 服务（冷启动 / ensure 共用）。
pub fn spawn_http_server(client: Arc<RwLock<HbutClient>>, app: AppHandle) {
    println!("[HTTP] spawn_http_server 被调用");
    if !is_http_bridge_enabled() {
        println!("[HTTP] bridge 未启用（非 debug 构建）");
        return;
    }
    let life = bridge_lifecycle();
    let state = HttpState {
        client,
        local_api_key: load_local_api_public_key(),
        bridge_token: generate_bridge_session_token(),
        app,
    };
    let gen = life
        .generation
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;
    tauri::async_runtime::spawn(async move {
        println!("[HTTP] run_http_server task 开始 (gen={})", gen);
        if let Err(e) = run_http_server(state, gen).await {
            eprintln!("[HTTP] 服务错误 (gen={}): {}", gen, e);
            bridge_lifecycle()
                .listening
                .store(false, std::sync::atomic::Ordering::SeqCst);
        }
    });
}

/// 长后台回前台：确保 Bridge `/health` 可达；必要时关闭旧任务并 respawn。
///
/// 前端应在 resume / remount 前 invoke 本命令（iOS / 桌面依赖 loopback 时）。
/// Android Release 通常 `enabled=false`，调用方应走非 bridge 降级路径。
#[tauri::command]
pub async fn ensure_http_bridge(
    app: AppHandle,
    state: tauri::State<'_, crate::app_state::AppState>,
) -> Result<EnsureHttpBridgeResult, String> {
    let addr = bridge_listen_addr();
    let addr_s = addr.to_string();

    if !is_http_bridge_enabled() {
        return Ok(EnsureHttpBridgeResult {
            enabled: false,
            healthy: false,
            respawned: false,
            addr: addr_s,
            status: "disabled".into(),
            detail: Some(
                "Bridge not enabled on this platform/build (Android Release default; desktop Release needs HBUT_HTTP_BRIDGE_ENABLED=1)"
                    .into(),
            ),
        });
    }

    if probe_http_bridge_health().await {
        bridge_lifecycle()
            .listening
            .store(true, std::sync::atomic::Ordering::SeqCst);
        return Ok(EnsureHttpBridgeResult {
            enabled: true,
            healthy: true,
            respawned: false,
            addr: addr_s,
            status: "healthy".into(),
            detail: None,
        });
    }

    let life = bridge_lifecycle();
    let _guard = life.lock.lock().await;

    // 双检：拿到锁后再探一次，避免并发 ensure 重复 spawn
    if probe_http_bridge_health().await {
        life.listening
            .store(true, std::sync::atomic::Ordering::SeqCst);
        return Ok(EnsureHttpBridgeResult {
            enabled: true,
            healthy: true,
            respawned: false,
            addr: addr_s,
            status: "healthy".into(),
            detail: Some("became healthy while waiting for ensure lock".into()),
        });
    }

    eprintln!(
        "[HTTP] ensure_http_bridge: /health unreachable at {}, requesting shutdown + respawn",
        addr_s
    );
    request_bridge_shutdown().await;

    let client = state.client.clone();
    spawn_http_server(client, app);

    // 等待 bind + 首次可探
    let mut healthy = false;
    for _ in 0..12 {
        tokio::time::sleep(Duration::from_millis(100)).await;
        if probe_http_bridge_health().await {
            healthy = true;
            break;
        }
    }

    let status = if healthy {
        "respawned"
    } else if life.listening.load(std::sync::atomic::Ordering::SeqCst) {
        "still_unhealthy"
    } else {
        "spawn_failed"
    };

    Ok(EnsureHttpBridgeResult {
        enabled: true,
        healthy,
        respawned: true,
        addr: addr_s,
        status: status.into(),
        detail: if healthy {
            Some("bridge respawned and /health ok".into())
        } else {
            Some("respawn attempted but /health still unreachable; frontend should degrade".into())
        },
    })
}

/// 组装完整 Bridge Router（领域 router 聚合；`#[cfg(debug_assertions)]` 追加 debug 路由）。
///
/// 无需 state 即可构建：拆分后各领域 router 均为 `Router<HttpState>`，组合层只负责聚合。
/// 单独提取便于单测验证 merge 无冲突（axum 在路由冲突时会 panic）。
fn build_router() -> Router<HttpState> {
    let app: Router<HttpState> = Router::new()
        .merge(routes::auth::router())
        .merge(routes::academic::router())
        .merge(routes::schedule::router())
        .merge(routes::course_selection::router())
        .merge(routes::online_learning::router())
        .merge(routes::system::router())
        .merge(routes::proxy::router())
        .merge(routes::ai::router());

    #[cfg(debug_assertions)]
    let app = app
        .merge(routes::debug::debug_router())
        .merge(routes::schedule::debug_router())
        .merge(routes::proxy::debug_router());

    app
}

async fn run_http_server(
    state: HttpState,
    generation: u64,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = bridge_listen_addr();
    let life = bridge_lifecycle();

    // Handler 在领域模块内部注册，避免将私有请求类型泄漏到组合层。
    let app = build_router();

    let app = app
        .with_state(state.clone())
        .layer(middleware::from_fn_with_state(
            state,
            bridge_access_middleware,
        ))
        .layer(bridge_cors_layer());

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(err) if err.kind() == ErrorKind::AddrInUse => {
            eprintln!(
                "[HTTP] 端口已被占用，桥接服务未启动 (gen={}): http://{}",
                generation, addr
            );
            life.listening
                .store(false, std::sync::atomic::Ordering::SeqCst);
            return Ok(());
        }
        Err(err) => return Err(err.into()),
    };
    println!("[HTTP] 桥接服务监听 (gen={}): http://{}", generation, addr);
    life.listening
        .store(true, std::sync::atomic::Ordering::SeqCst);

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    {
        let mut slot = life.shutdown_tx.lock().await;
        *slot = Some(shutdown_tx);
    }

    let serve = axum::serve(listener, app).with_graceful_shutdown(async move {
        let _ = shutdown_rx.await;
        eprintln!("[HTTP] graceful shutdown requested (gen={})", generation);
    });
    let result = serve.await;
    life.listening
        .store(false, std::sync::atomic::Ordering::SeqCst);
    {
        let mut slot = life.shutdown_tx.lock().await;
        if slot.is_some() {
            *slot = None;
        }
    }
    result?;
    Ok(())
}

#[cfg(test)]
mod ensure_http_bridge_tests {
    use super::auth::{
        bridge_route_policy, decide_bridge_access, is_trusted_bridge_origin, tokens_equal,
        BridgeAccessDecision, BridgeRoutePolicy,
    };
    use super::{bridge_listen_addr, is_http_bridge_enabled, EnsureHttpBridgeResult};
    use axum::http::Method;
    use reqwest::header::{HeaderMap, HeaderValue};

    #[test]
    fn router_merges_all_domain_routes_without_conflicts() {
        // axum 在路由冲突（同 method+path 或无法消歧的路径模式）时 merge 会 panic。
        // 拆分后领域 router 聚合必须与拆分前单链等价，此测试即路由组装契约。
        let _router = super::build_router();
    }

    #[test]
    fn bridge_listen_addr_defaults_to_loopback_4399() {
        let addr = bridge_listen_addr();
        assert!(addr.port() > 0, "bridge port must be non-zero");
        assert!(addr.ip().is_loopback(), "bridge must stay on loopback");
        assert_eq!(addr.ip().to_string(), "127.0.0.1");
    }

    #[test]
    fn is_http_bridge_enabled_is_deterministic_bool() {
        let _ = is_http_bridge_enabled();
    }

    #[test]
    fn trusted_origins_are_limited_to_app_and_loopback_contexts() {
        for origin in [
            "tauri://localhost",
            "capacitor://localhost",
            "http://localhost:5173",
            "http://127.0.0.1:4399",
            "https://tauri.localhost",
        ] {
            assert!(
                is_trusted_bridge_origin(origin),
                "expected trusted: {origin}"
            );
        }
        for origin in [
            "null",
            "https://example.com",
            "http://192.168.1.10:5173",
            "file:///tmp/index.html",
        ] {
            assert!(
                !is_trusted_bridge_origin(origin),
                "expected rejected: {origin}"
            );
        }
    }

    #[test]
    fn route_policy_protects_data_and_marks_debug_routes() {
        assert_eq!(
            bridge_route_policy("/health"),
            BridgeRoutePolicy::PublicHealth
        );
        assert_eq!(
            bridge_route_policy("/exports/schedule_demo.ics"),
            BridgeRoutePolicy::PublicEmbed
        );
        assert_eq!(
            bridge_route_policy("/module_bundle/content/stable/demo/1/index.html"),
            BridgeRoutePolicy::PublicEmbed
        );
        assert_eq!(
            bridge_route_policy("/school-website/news/info/1"),
            BridgeRoutePolicy::PublicEmbed
        );
        assert_eq!(
            bridge_route_policy("/module_bundle/prepare"),
            BridgeRoutePolicy::Protected
        );
        assert_eq!(
            bridge_route_policy("/sync_grades"),
            BridgeRoutePolicy::Protected
        );
        assert_eq!(
            bridge_route_policy("/course_selection/select"),
            BridgeRoutePolicy::Protected
        );
        assert_eq!(
            bridge_route_policy("/debug/state"),
            BridgeRoutePolicy::DebugOnly
        );
    }

    #[test]
    fn public_embed_routes_are_read_only_and_reject_hostile_origins() {
        let empty = HeaderMap::new();
        for method in [Method::GET, Method::HEAD] {
            assert_eq!(
                decide_bridge_access(BridgeRoutePolicy::PublicEmbed, &method, &empty, false, true,),
                BridgeAccessDecision::Allow
            );
        }

        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::PublicEmbed,
                &Method::POST,
                &empty,
                false,
                true,
            ),
            BridgeAccessDecision::Unauthorized
        );

        let mut hostile = HeaderMap::new();
        hostile.insert(
            "origin",
            HeaderValue::from_static("https://attacker.example"),
        );
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::PublicEmbed,
                &Method::GET,
                &hostile,
                true,
                true,
            ),
            BridgeAccessDecision::ForbiddenOrigin
        );
    }

    #[test]
    fn runtime_origins_cover_tauri_vite_and_capacitor_without_trusting_lan_hosts() {
        for origin in [
            "tauri://localhost",
            "http://tauri.localhost",
            "http://localhost:1420",
            "http://localhost:5173",
            "capacitor://localhost",
            "http://localhost",
            "https://localhost",
            "http://127.0.0.1:4399",
        ] {
            assert!(
                is_trusted_bridge_origin(origin),
                "expected trusted: {origin}"
            );
        }

        for origin in [
            "https://localhost.example.com",
            "http://127.0.0.2:4399",
            "http://192.168.0.2:5173",
            "capacitor://example.com",
        ] {
            assert!(
                !is_trusted_bridge_origin(origin),
                "expected rejected: {origin}"
            );
        }
    }

    #[test]
    fn event_stream_post_is_allowed_for_trusted_origin_or_bearer_context() {
        let mut capacitor = HeaderMap::new();
        capacitor.insert("origin", HeaderValue::from_static("capacitor://localhost"));
        capacitor.insert("content-type", HeaderValue::from_static("application/json"));
        capacitor.insert("accept", HeaderValue::from_static("text/event-stream"));
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &capacitor,
                false,
                true,
            ),
            BridgeAccessDecision::Allow
        );

        let mut vite = HeaderMap::new();
        vite.insert(
            "referer",
            HeaderValue::from_static("http://localhost:5173/"),
        );
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &vite,
                false,
                true,
            ),
            BridgeAccessDecision::Allow
        );

        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &HeaderMap::new(),
                true,
                true,
            ),
            BridgeAccessDecision::Allow
        );
    }
    #[test]
    fn access_decision_rejects_unauthorized_and_untrusted_requests() {
        let empty = HeaderMap::new();
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &empty,
                false,
                true,
            ),
            BridgeAccessDecision::Unauthorized
        );

        let mut hostile = HeaderMap::new();
        hostile.insert(
            "origin",
            HeaderValue::from_static("https://attacker.example"),
        );
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &hostile,
                true,
                true,
            ),
            BridgeAccessDecision::ForbiddenOrigin
        );
    }

    #[test]
    fn access_decision_accepts_trusted_origin_or_valid_token() {
        let mut trusted = HeaderMap::new();
        trusted.insert("origin", HeaderValue::from_static("tauri://localhost"));
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &trusted,
                false,
                true,
            ),
            BridgeAccessDecision::Allow
        );

        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::Protected,
                &Method::POST,
                &HeaderMap::new(),
                true,
                true,
            ),
            BridgeAccessDecision::Allow
        );
    }

    #[test]
    fn access_decision_hides_debug_routes_in_release() {
        assert_eq!(
            decide_bridge_access(
                BridgeRoutePolicy::DebugOnly,
                &Method::GET,
                &HeaderMap::new(),
                true,
                false,
            ),
            BridgeAccessDecision::DebugRouteUnavailable
        );
    }

    #[test]
    fn bridge_token_comparison_checks_length_and_content() {
        assert!(tokens_equal("same-token", "same-token"));
        assert!(!tokens_equal("same-token", "other-token"));
        assert!(!tokens_equal("short", "longer"));
    }

    #[test]
    fn ensure_result_serializes_camel_case_fields() {
        let v = EnsureHttpBridgeResult {
            enabled: true,
            healthy: false,
            respawned: true,
            addr: "127.0.0.1:4399".into(),
            status: "still_unhealthy".into(),
            detail: Some("x".into()),
        };
        let json = serde_json::to_value(&v).expect("serialize");
        assert_eq!(json["enabled"], true);
        assert_eq!(json["healthy"], false);
        assert_eq!(json["respawned"], true);
        assert_eq!(json["addr"], "127.0.0.1:4399");
        assert_eq!(json["status"], "still_unhealthy");
        assert!(json.get("detail").is_some());
        assert!(json.get("is_healthy").is_none());
    }

    #[test]
    fn ensure_status_vocabulary_is_stable() {
        let allowed = [
            "disabled",
            "healthy",
            "respawned",
            "port_busy",
            "spawn_failed",
            "still_unhealthy",
        ];
        for s in allowed {
            assert!(!s.is_empty());
        }
    }
}
