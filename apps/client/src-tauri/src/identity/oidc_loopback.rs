//! P2-4：loopback 回退方案（验收③：`minihbut://` 自定义 scheme 未被 Casdoor/OS 接受时）。
//!
//! 设计（规格 §3）：
//! - [`handle_callback_request`]：纯逻辑，从一段原始 HTTP 请求文本里取 `(code, state)`，
//!   全部可单测（无需真 socket）；
//! - [`LoopbackServer`]：薄服务，绑定 `127.0.0.1:<port>`（`port=0` 由系统分配），
//!   接受**一次**请求后即退出；
//! - 纪律：code/state 一律形状校验（与深链侧同口径）；`error=` 存在即拒绝（不回显原文）；
//!   页面**不含** code/token 等任何回调材料。
//!
//! 注意（本机环境约束）：本机代理会劫持 loopback 明文 HTTP，
//! 所以测试**只**覆盖「能绑定并返回端口」与「等待超时」，不做真实回环 HTTP 请求。

use std::io::Read;
use std::net::TcpListener;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use url::form_urlencoded;

use super::oidc_core::{OidcError, KIND_OIDC_CALLBACK_INVALID, KIND_OIDC_TIMEOUT};

/// 请求读取上限（64KB）：超过即拒绝，防无界读取。
const MAX_REQUEST_BYTES: usize = 65_536;

/// 单个连接读取超时（测试不做真实回环请求；生产路径下给浏览器足够时间）。
const CONNECT_READ_TIMEOUT: Duration = Duration::from_secs(10);

/// 纯逻辑：从一段 HTTP 请求文本里取出 `(code, state)`。
///
/// 只接受 `GET /callback?code=..&state=..`（`Host` 必须为 `127.0.0.1`/`localhost`，端口忽略）。
/// 以下一律 `OidcError::CallbackInvalid`（**不带** `error_description` 原文）：
/// - 非 GET；路径不是 `/callback`；
/// - `Host` 非回环地址（如 `evil.example`、`192.168.x.x`）；
/// - 缺 `code` / 缺 `state`；`code`、`state` 形状非法（含超长、含非法字符）；
/// - 存在 `error=` 参数（授权失败回调）。
pub fn handle_callback_request(request_text: &str) -> Result<(String, String), OidcError> {
    // 1) 请求行：`GET /callback?... HTTP/1.x`
    let (first_line, headers) = request_text
        .split_once('\n')
        .ok_or(OidcError::CallbackInvalid)?;
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    if method != "GET" {
        return Err(OidcError::CallbackInvalid);
    }
    let (path, query) = match target.split_once('?') {
        Some((p, q)) => (p, q),
        None => (target, ""),
    };
    if path != "/callback" {
        return Err(OidcError::CallbackInvalid);
    }
    // 2) Host 必须是回环地址（127.0.0.1 / localhost；端口忽略）——防伪造来源。
    let host = header_value(headers, "host");
    let host_no_port = host.split(':').next().unwrap_or_default();
    if host_no_port != "127.0.0.1" && host_no_port != "localhost" {
        return Err(OidcError::CallbackInvalid);
    }
    // 3) 查询参数（percent-decode；form 编码的 `+` → 空格，解码后形状校验必失败 → 拒绝）。
    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        match key.as_ref() {
            "code" => code = Some(value.into_owned()),
            "state" => state = Some(value.into_owned()),
            // `error=` 存在 → 授权失败回调，直接拒绝（不回显 error/error_description 原文）
            "error" => return Err(OidcError::CallbackInvalid),
            _ => {}
        }
    }
    let code = code
        .filter(|c| is_valid_token_param(c, 16, 512))
        .ok_or(OidcError::CallbackInvalid)?;
    let state = state
        .filter(|s| is_valid_token_param(s, 16, 128))
        .ok_or(OidcError::CallbackInvalid)?;
    Ok((code, state))
}

/// 参数形状校验：`[A-Za-z0-9._~-]` 且长度 `[min..=max]`（与深链侧 §4.2 冻结口径一致）。
fn is_valid_token_param(value: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&value.chars().count())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'~' | b'-'))
}

/// 大小写不敏感的 header 取值（只扫描 header 段，空行即止；找不到返回空串）。
fn header_value(headers: &str, name: &str) -> String {
    for line in headers.lines() {
        if line.trim().is_empty() {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            if key.trim().eq_ignore_ascii_case(name) {
                return value.trim().to_string();
            }
        }
    }
    String::new()
}

/// 成功页（极简 HTML；**不含** code/token 或任何回调材料，可安全展示在浏览器里）。
pub fn success_page() -> &'static str {
    "<!doctype html>\n\
     <html lang=\"zh-CN\">\n\
     <head><meta charset=\"utf-8\"><title>登录成功</title></head>\n\
     <body style=\"font-family:system-ui;padding:3rem;text-align:center\">\n\
     <h1>登录成功</h1>\n\
     <p>你可以关闭此页面并返回应用。</p>\n\
     </body>\n\
     </html>"
}

/// 失败页：`kind` 只用于**选择固定文案**（与 §4.1 逐字一致），原文绝不回显。
pub fn failure_page(kind: &str) -> String {
    let text = match kind {
        KIND_OIDC_CALLBACK_INVALID => "回调地址无效，请重新发起",
        KIND_OIDC_TIMEOUT => "登录超时，请重试",
        _ => "操作失败，请稍后重试",
    };
    format!(
        "<!doctype html>\n\
         <html lang=\"zh-CN\">\n\
         <head><meta charset=\"utf-8\"><title>登录失败</title></head>\n\
         <body style=\"font-family:system-ui;padding:3rem;text-align:center\">\n\
         <h1>登录失败</h1>\n\
         <p>{text}</p>\n\
         </body>\n\
         </html>"
    )
}

/// loopback 回调薄服务：绑定 `127.0.0.1:<port>`，接受一次请求后退出。
///
/// - `port = 0` 时由系统分配实际端口（`HBUT_IDENTITY_OIDC_LOOPBACK_REDIRECT_URI` 的 `:0` 形态）；
/// - `wait_for_callback` 消费自身：监听器用一次即弃，不存在复用/重放路径。
pub struct LoopbackServer {
    /// 监听器句柄（`wait_for_callback` 取出后置空，保证一次性）。
    listener: Mutex<Option<TcpListener>>,
}

impl LoopbackServer {
    /// 绑定 loopback 监听器；返回已绑定的服务实例（`local_port()` 取实际端口）。
    pub fn start(port: u16) -> std::io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", port))?;
        Ok(Self {
            listener: Mutex::new(Some(listener)),
        })
    }

    /// 实际绑定端口（`port=0` 时即系统分配值）；监听器已被取走时返回 0。
    pub fn local_port(&self) -> u16 {
        self.listener
            .lock()
            .ok()
            .and_then(|guard| {
                guard
                    .as_ref()
                    .and_then(|listener| listener.local_addr().ok())
            })
            .map(|addr| addr.port())
            .unwrap_or(0)
    }

    /// 等待唯一一次回调（在独立线程 accept，用超时约束整体等待）：
    /// - 收到合法请求 → `Ok((code, state))`；
    /// - 超时（无人回调）→ `OidcError`（timeout 分类）；
    /// - 请求非法（见 [`handle_callback_request`]）→ `OidcError`（callback 分类）。
    pub fn wait_for_callback(self, timeout: Duration) -> Result<(String, String), OidcError> {
        let listener = match self.listener.lock() {
            Ok(mut guard) => match guard.take() {
                Some(listener) => listener,
                None => return Err(OidcError::CallbackInvalid),
            },
            Err(_) => return Err(OidcError::CallbackInvalid),
        };
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            // 线程侧用略宽的截止线（+1s），超时后不会无限阻塞在 accept 上
            let result = accept_once(&listener, timeout + Duration::from_secs(1));
            let _ = tx.send(result);
        });
        match rx.recv_timeout(timeout) {
            Ok(Ok(pair)) => Ok(pair),
            Ok(Err(err)) => Err(err),
            Err(mpsc::RecvTimeoutError::Timeout) => Err(OidcError::Timeout),
            // 发送方 panic/提前退出（不应发生）：按回调非法处理，绝不假成功。
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(OidcError::CallbackInvalid),
        }
    }
}

/// 接受一个连接并读取一段 HTTP 请求（读满 header 空行或超上限即止），交给纯函数判定。
/// `deadline` 为整个 accept+read 的有界截止（非阻塞轮询，超时即返回，线程不泄漏）。
fn accept_once(listener: &TcpListener, deadline: Duration) -> Result<(String, String), OidcError> {
    let _ = listener.set_nonblocking(true);
    let started = Instant::now();
    let mut stream = loop {
        match listener.accept() {
            Ok((stream, _)) => break stream,
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                if started.elapsed() > deadline {
                    return Err(OidcError::CallbackInvalid);
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return Err(OidcError::CallbackInvalid),
        }
    };
    let _ = stream.set_read_timeout(Some(CONNECT_READ_TIMEOUT));
    let mut buf = [0u8; 4096];
    let mut text = String::new();
    // 读循环：兼容「接受的流继承非阻塞标志」的平台（Windows 上 accepted socket
    // 继承 listener 的 nonblocking）——WouldBlock 时短睡眠重试，直到 header 空行
    // 或总 deadline（超时后按已收到内容判定，必然缺参/缺空行 → 拒绝）。
    loop {
        if started.elapsed() > deadline {
            break;
        }
        let n = match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20));
                continue;
            }
            // 读超时/对端重置/其他错误：按已收到的内容继续判定（多为空 → 拒绝）
            Err(_) => break,
        };
        text.push_str(&String::from_utf8_lossy(&buf[..n]));
        if text.len() > MAX_REQUEST_BYTES {
            return Err(OidcError::CallbackInvalid);
        }
        // header 段结束（GET 回调无 body）
        if text.contains("\r\n\r\n") || text.contains("\n\n") {
            break;
        }
    }
    handle_callback_request(&text)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use super::*;

    /// 合法的 43 位 code（base64url 形状）与 32 位 hex state。
    fn valid_code() -> &'static str {
        "0123456789abcdefghijklmnopqrstuv"
    }
    fn valid_state() -> &'static str {
        "0123456789abcdef0123456789abcdef"
    }

    /// 构造一段标准请求文本。
    fn request(method: &str, target: &str, host: &str) -> String {
        format!("{method} {target} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: test\r\n\r\n")
    }

    // ── handle_callback_request：6 类 + 形状 ────────────────────────────────

    #[test]
    fn normal_request_extracts_code_and_state() {
        let text = request(
            "GET",
            &format!("/callback?code={}&state={}", valid_code(), valid_state()),
            "127.0.0.1:8123",
        );
        let (code, state) = handle_callback_request(&text).expect("合法请求应通过");
        assert_eq!(code, valid_code());
        assert_eq!(state, valid_state());
    }

    #[test]
    fn percent_decoding_applies_before_shape_check() {
        // %41 = 'A'：43 个 %41 解码后为 43 位 A（合法形状）→ 通过
        let encoded_code = "%41".repeat(43);
        let text = request(
            "GET",
            &format!("/callback?code={}&state={}", encoded_code, valid_state()),
            "127.0.0.1",
        );
        let (code, state) = handle_callback_request(&text).expect("解码后合法应通过");
        assert_eq!(code, "A".repeat(43));
        assert_eq!(state, valid_state());
        // %3D = '='：解码后含非法字符 → 拒绝
        let bad = request(
            "GET",
            &format!(
                "/callback?code={0}%3D{0}&state={1}",
                valid_code(),
                valid_state()
            ),
            "127.0.0.1",
        );
        assert!(handle_callback_request(&bad).is_err());
    }

    #[test]
    fn missing_param_rejected() {
        let no_state = request(
            "GET",
            &format!("/callback?code={}", valid_code()),
            "127.0.0.1",
        );
        let no_code = request(
            "GET",
            &format!("/callback?state={}", valid_state()),
            "127.0.0.1",
        );
        let empty_query = request("GET", "/callback", "127.0.0.1");
        for text in [no_state, no_code, empty_query] {
            let err = handle_callback_request(&text).expect_err("缺参必须拒绝");
            assert_eq!(err.kind(), KIND_OIDC_CALLBACK_INVALID);
        }
    }

    #[test]
    fn error_param_rejected_without_echo() {
        let text = request(
            "GET",
            &format!(
                "/callback?error=access_denined_typo&error_description=secret&state={}",
                valid_state()
            ),
            "127.0.0.1",
        );
        let err = handle_callback_request(&text).expect_err("error= 必须拒绝");
        assert_eq!(err.kind(), KIND_OIDC_CALLBACK_INVALID);
        // 规格：`error=` 存在 → CallbackInvalid，且**不带** error_description 原文
        // （原文在 A 的 `OidcError::CallbackInvalid` 构造中即被丢弃，此处以 kind 断言锁定）
    }

    #[test]
    fn non_get_method_rejected() {
        let text = request(
            "POST",
            &format!("/callback?code={}&state={}", valid_code(), valid_state()),
            "127.0.0.1",
        );
        assert!(handle_callback_request(&text).is_err());
    }

    #[test]
    fn wrong_path_rejected() {
        let text = request(
            "GET",
            &format!("/login?code={}&state={}", valid_code(), valid_state()),
            "127.0.0.1",
        );
        assert!(handle_callback_request(&text).is_err());
    }

    #[test]
    fn non_loopback_host_rejected() {
        for host in ["evil.example", "192.168.1.20", "localhost.evil.example"] {
            let text = request(
                "GET",
                &format!("/callback?code={}&state={}", valid_code(), valid_state()),
                host,
            );
            assert!(
                handle_callback_request(&text).is_err(),
                "Host={host} 必须拒绝"
            );
        }
        // localhost（回退形态允许）与带端口的 127.0.0.1 都通过
        let ok = request(
            "GET",
            &format!("/callback?code={}&state={}", valid_code(), valid_state()),
            "localhost:9999",
        );
        assert!(handle_callback_request(&ok).is_ok());
    }

    #[test]
    fn overlong_param_rejected() {
        let long_code = "a".repeat(513); // 超出 512 上限
        let text = request(
            "GET",
            &format!("/callback?code={long_code}&state={}", valid_state()),
            "127.0.0.1",
        );
        assert!(handle_callback_request(&text).is_err());
        let long_state = "b".repeat(129); // 超出 128 上限
        let text = request(
            "GET",
            &format!("/callback?code={}&state={long_state}", valid_code()),
            "127.0.0.1",
        );
        assert!(handle_callback_request(&text).is_err());
        // 边界值恰好通过
        let edge_code = "a".repeat(512);
        let edge_state = "b".repeat(128);
        let text = request(
            "GET",
            &format!("/callback?code={edge_code}&state={edge_state}"),
            "127.0.0.1",
        );
        assert!(handle_callback_request(&text).is_ok());
    }

    // ── LoopbackServer：只测绑定 + 超时（不做真实回环 HTTP 请求）───────────

    #[test]
    fn loopback_server_binds_and_reports_port() {
        let server = LoopbackServer::start(0).expect("绑定 127.0.0.1:0 应成功");
        let port = server.local_port();
        assert!(port > 0, "系统分配的端口应 > 0");
    }

    #[test]
    fn loopback_server_waits_until_timeout() {
        // 无人回调 → 超时路径（本机代理会劫持 loopback 明文 HTTP，故不发真实请求）
        let server = LoopbackServer::start(0).expect("绑定应成功");
        let err = server
            .wait_for_callback(Duration::from_millis(300))
            .expect_err("无回调必须超时失败");
        assert_eq!(err.kind(), "oidc_timeout");
    }
}
