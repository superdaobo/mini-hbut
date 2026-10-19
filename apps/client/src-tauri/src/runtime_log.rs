//! 进程内运行时调试日志（始终可用，不依赖 debug_assertions）
//!
//! - 前端调试窗 / HTTP bridge 可拉取（内存环形缓冲）
//! - 覆盖重登、学习通、收件箱等关键路径
//! - **同步落到 `tauri-plugin-log` 的文件目标**（`%LOCALAPPDATA%\com.hbut.mini\logs\mini-hbut.log`，
//!   1MB 上限 + KeepSome(3) 轮转），使真机（release stderr 被丢弃）也能取证；
//!   落盘前做凭证兜底脱敏（绝不写 `enc` / `fidEnc` / `uid` / `code` 等原值）。

use chrono::Local;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const MAX_LOGS: usize = 3000;

/// 测试期串行锁。
///
/// `runtime_log` 是**进程级全局状态**，而测试默认并行跑：任何「清空缓冲」的测试
/// 都会把并发「断言缓冲内容」的测试（`http_client::auth::login_runtime_log_tests`）
/// 清掉，造成随机失败（实测踩到）。凡是要清空或断言缓冲内容的测试都必须先持有本锁。
#[cfg(test)]
pub(crate) static TEST_SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// `tauri-plugin-log` 的文件目标 target。
///
/// `lib.rs` 已配置 LogDir 目标（文件 `mini-hbut`，1MB 上限 + KeepSome(3) 轮转），
/// 本模块复用该实现落盘，不再自建第二套文件日志。
const FILE_LOG_TARGET: &str = "hbut_helper::runtime_log";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLogItem {
    pub id: u64,
    pub ts: i64,
    pub ts_text: String,
    pub level: String,
    pub scope: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
    /// 自进程启动的相对毫秒
    pub elapsed_ms: u64,
}

struct LogState {
    seq: u64,
    items: VecDeque<RuntimeLogItem>,
    started: Instant,
}

/// 进程启动时刻：`(单调时钟, 墙钟 epoch ms)`。
///
/// ⚠️ 必须由 `mark_process_start()` 在 `run()` 最开始显式写入。`LogState.started` 是
/// **惰性**的（首次 `state()` 才 `Instant::now()`）；release 构建启动期若没有任何日志推送，
/// 拿它当进程启动时间会得到接近 0 的值 —— 前端据此推算「原生前置耗时」会得到一个假的 0ms。
/// 真机上已踩到这个坑，故这里显式记录。
static PROCESS_START: OnceLock<(Instant, i64)> = OnceLock::new();

/// 记录进程启动时刻（幂等；在 `run()` 最开始调用）。
pub fn mark_process_start() {
    let _ = PROCESS_START.set((Instant::now(), Local::now().timestamp_millis()));
}

/// 取进程启动时刻；未显式标记时回落「首次访问时刻」，保证始终可用。
fn process_start() -> (Instant, i64) {
    *PROCESS_START.get_or_init(|| (Instant::now(), Local::now().timestamp_millis()))
}

fn state() -> &'static Mutex<LogState> {
    static STATE: OnceLock<Mutex<LogState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(LogState {
            seq: 0,
            items: VecDeque::with_capacity(512),
            started: Instant::now(),
        })
    })
}

fn push_inner(level: &str, scope: &str, message: &str, details: Option<Value>) {
    let now = Local::now();
    // 只在「构造条目 + 入环形缓冲」期间持锁：I/O（stderr / 文件日志）一律放在锁外。
    // 否则一次慢写盘就会把 `query_logs` / `clear_logs` 一起堵住（调试桥的 /debug/logs 会挂死）。
    let item = {
        let mut guard = match state().lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        guard.seq = guard.seq.saturating_add(1);
        let item = RuntimeLogItem {
            id: guard.seq,
            ts: now.timestamp_millis(),
            ts_text: now.format("%H:%M:%S%.3f").to_string(),
            level: level.to_string(),
            scope: scope.to_string(),
            message: message.to_string(),
            details,
            elapsed_ms: guard.started.elapsed().as_millis() as u64,
        };
        guard.items.push_back(item.clone());
        while guard.items.len() > MAX_LOGS {
            guard.items.pop_front();
        }
        item
    };
    // 同步打到 stderr，方便用户「调试窗口 / 终端」看到重登信息
    eprintln!(
        "[{}][{}][{}] {}",
        item.ts_text, item.level, item.scope, item.message
    );
    if let Some(ref d) = item.details {
        let s = d.to_string();
        if s.len() < 800 {
            eprintln!("  details: {s}");
        }
    }
    // 同步落盘（复用 tauri-plugin-log 的文件目标；落盘前做凭证脱敏）
    emit_file_log(&item);
}

/// 把一条日志同步写入 `log` crate（由 `tauri-plugin-log` 落到日志目录 `mini-hbut.log`）。
///
/// 复用而非另造：`lib.rs`（#671）已用 tauri-plugin-log 提供「LogDir 文件 + 1MB 上限 +
/// KeepSome(3) 轮转」的落盘实现（`%LOCALAPPDATA%\com.hbut.mini\logs`），本模块接入即可。
///
/// 级别说明：release 全局过滤为 `Warn`（见 `lib.rs`），故 `warn` / `error` 一定落盘，
/// `info` / `debug` 仅在 dev（全局 `Info`）落盘；与仓库其它模块（如 deep_link_register
/// 的 INFO）行为一致。
///
/// ⚠️ **凭证脱敏**：落盘前对文本做 [`redact_credentials`] 兜底，绝不写入
/// `enc` / `fidEnc` / `uid` / `code` 等短时效凭证原值。
fn emit_file_log(item: &RuntimeLogItem) {
    let mut line = format!("[{}] {}", item.scope, redact_credentials(&item.message));
    if let Some(details) = item.details.as_ref() {
        let text = redact_credentials(&details.to_string());
        if text.len() < 2000 {
            line.push_str(" details=");
            line.push_str(&text);
        }
    }
    match item.level.as_str() {
        "error" => log::error!(target: FILE_LOG_TARGET, "{}", line),
        "warn" => log::warn!(target: FILE_LOG_TARGET, "{}", line),
        "debug" => log::debug!(target: FILE_LOG_TARGET, "{}", line),
        _ => log::info!(target: FILE_LOG_TARGET, "{}", line),
    }
}

/// 敏感凭证键（`enc` / `fidEnc` / `uid` / `code` 等短时效值）。
///
/// `\b` 保证 `enc` 不会误匹配 `fidEnc` / `mappIdEnc` 等词内部；`appid` 只匹配独立词。
const SENSITIVE_KEYS: &str = "enc|fidEnc|uid|code|mappIdEnc|seatIdEnc|reserveIdEnc|deptIdEnc|wfwEnc|wfwEngineEnc|appKey|appid";

/// 表单 / query 形态脱敏正则：`key=value`（值到 `&` / 空白 / 引号为止）
fn credential_redactor_query() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(&format!(
            r#"(?i)\b({SENSITIVE_KEYS})\b\s*=\s*([^&\s"'<>]*)"#
        ))
        .expect("凭证脱敏正则（query）必须可编译")
    })
}

/// JSON 形态脱敏正则：`"key":"value"` / `"key":value`
fn credential_redactor_json() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(&format!(
            r#"(?i)"({SENSITIVE_KEYS})"\s*:\s*("[^"]*"|'[^']*'|[^,;}}\]]*)"#
        ))
        .expect("凭证脱敏正则（JSON）必须可编译")
    })
}

/// 把文本里敏感键的值替换为 `<redacted>`（文件日志的凭证兜底，见 [`emit_file_log`]）。
fn redact_credentials(text: &str) -> String {
    let json = credential_redactor_json().replace_all(text, r#""${1}":<redacted>"#);
    credential_redactor_query()
        .replace_all(&json, "${1}=<redacted>")
        .into_owned()
}

pub fn log_debug(scope: impl AsRef<str>, message: impl AsRef<str>) {
    push_inner("debug", scope.as_ref(), message.as_ref(), None);
}

pub fn log_info(scope: impl AsRef<str>, message: impl AsRef<str>) {
    push_inner("info", scope.as_ref(), message.as_ref(), None);
}

pub fn log_warn(scope: impl AsRef<str>, message: impl AsRef<str>) {
    push_inner("warn", scope.as_ref(), message.as_ref(), None);
}

pub fn log_error(scope: impl AsRef<str>, message: impl AsRef<str>) {
    push_inner("error", scope.as_ref(), message.as_ref(), None);
}

pub fn log_with_details(
    level: &str,
    scope: impl AsRef<str>,
    message: impl AsRef<str>,
    details: Value,
) {
    push_inner(level, scope.as_ref(), message.as_ref(), Some(details));
}

/// 计时辅助：结束时自动写一条 info
pub struct ScopedTimer {
    scope: String,
    label: String,
    start: Instant,
}

impl ScopedTimer {
    pub fn start(scope: impl Into<String>, label: impl Into<String>) -> Self {
        let scope = scope.into();
        let label = label.into();
        log_debug(&scope, format!("⏱ 开始 {label}"));
        Self {
            scope,
            label,
            start: Instant::now(),
        }
    }

    pub fn finish(self, extra: Option<Value>) {
        let ms = self.start.elapsed().as_millis() as u64;
        let msg = format!("⏱ 完成 {} ({}ms)", self.label, ms);
        if let Some(d) = extra {
            log_with_details(
                "info",
                &self.scope,
                &msg,
                json!({ "elapsed_ms": ms, "extra": d }),
            );
        } else {
            log_with_details("info", &self.scope, &msg, json!({ "elapsed_ms": ms }));
        }
    }

    pub fn fail(self, err: impl AsRef<str>) {
        let ms = self.start.elapsed().as_millis() as u64;
        log_with_details(
            "error",
            &self.scope,
            format!("⏱ 失败 {} ({}ms): {}", self.label, ms, err.as_ref()),
            json!({ "elapsed_ms": ms, "error": err.as_ref() }),
        );
    }
}

#[derive(Debug, Clone, Default)]
pub struct LogQuery {
    pub limit: usize,
    pub since_id: Option<u64>,
    pub scope_contains: Option<String>,
    pub level: Option<String>,
    pub message_contains: Option<String>,
}

pub fn query_logs(q: LogQuery) -> Vec<RuntimeLogItem> {
    let limit = if q.limit == 0 { 200 } else { q.limit.min(2000) };
    let guard = match state().lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    let scope_f = q
        .scope_contains
        .as_ref()
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty());
    let level_f = q
        .level
        .as_ref()
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty());
    let msg_f = q
        .message_contains
        .as_ref()
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty());

    guard
        .items
        .iter()
        .filter(|item| {
            if let Some(since) = q.since_id {
                if item.id <= since {
                    return false;
                }
            }
            if let Some(ref lv) = level_f {
                if item.level.to_lowercase() != *lv {
                    return false;
                }
            }
            if let Some(ref sc) = scope_f {
                if !item.scope.to_lowercase().contains(sc) {
                    return false;
                }
            }
            if let Some(ref m) = msg_f {
                if !item.message.to_lowercase().contains(m) {
                    return false;
                }
            }
            true
        })
        .rev()
        .take(limit)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

pub fn clear_logs() {
    {
        let mut guard = match state().lock() {
            Ok(g) => g,
            Err(e) => e.into_inner(),
        };
        guard.items.clear();
    }
    // ⚠️ 必须在释放锁之后记录：`log_info` 会再次获取同一把 `Mutex`（不可重入），
    // 持锁调用会自死锁，并把此后所有 `/debug/logs` 查询永久堵死。
    log_info("RuntimeLog", "日志已清空");
}

pub fn stats() -> Value {
    let guard = match state().lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    let (process_started, process_started_epoch_ms) = process_start();
    json!({
        "count": guard.items.len(),
        "max": MAX_LOGS,
        "last_id": guard.seq,
        // 进程启动至今（**不是**日志状态初始化至今，见 `PROCESS_START` 说明）
        "uptime_ms": process_started.elapsed().as_millis() as u64,
        // 进程启动墙钟（epoch ms）——前端据此算「原生前置耗时」与「本进程已运行多久」
        "started_at_epoch_ms": process_started_epoch_ms,
    })
}

/// 从任意 format 参数写入（兼容旧 println 风格）
pub fn log_fmt(level: &str, scope: &str, args: std::fmt::Arguments<'_>) {
    push_inner(level, scope, &format!("{args}"), None);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_credentials_removes_sensitive_values() {
        // query / 表单形态
        let q = redact_credentials("enc=3efcb238a7f6beed95a11530b27d5825&fidEnc=c7450f13f8a0e9ab&uid=406591160&code=ONESHOT");
        assert!(!q.contains("3efcb238"), "enc 原值不得保留：{q}");
        assert!(!q.contains("c7450f13"), "fidEnc 原值不得保留：{q}");
        assert!(!q.contains("406591160"), "uid 原值不得保留：{q}");
        assert!(!q.contains("ONESHOT"), "code 原值不得保留：{q}");
        assert!(q.contains("enc=<redacted>"));
        assert!(q.contains("fidEnc=<redacted>"));
        assert!(q.contains("uid=<redacted>"));
        assert!(q.contains("code=<redacted>"));

        // JSON 形态
        let j = redact_credentials(
            r#"{"reserveIdEnc":"838c48dae07db28c","seatIdEnc":"b146028eafa4eea9","code":0}"#,
        );
        assert!(
            !j.contains("838c48dae07db28c"),
            "reserveIdEnc 原值不得保留：{j}"
        );
        assert!(
            !j.contains("b146028eafa4eea9"),
            "seatIdEnc 原值不得保留：{j}"
        );
        assert!(j.contains("<redacted>"), "应替换为占位符：{j}");
        // 键名与结构保留（便于定位是哪条日志）
        assert!(j.contains("reserveIdEnc"), "键名应保留：{j}");
        assert!(j.contains("seatIdEnc"), "键名应保留：{j}");

        // 非敏感文本不被破坏（含 reserveId 明文等稳定标识）
        let safe = "app=quiet_room reserveId=24727 参数数=4";
        assert_eq!(redact_credentials(safe), safe);
        // 词内出现敏感子串（如 errorCode）不误伤
        let err = "errorCode=500 statusCode=200";
        assert_eq!(redact_credentials(err), err);
    }

    /// 回归：`clear_logs` 曾在**持锁**状态下调用 `log_info`（同一把不可重入 `Mutex`）→ 自死锁，
    /// 之后所有 `/debug/logs` 查询永久挂起（实测 2026-10-16：调试桥 DELETE /debug/logs 后
    /// GET 全部超时）。用 `spawn_blocking` + 超时把死锁变成**断言失败**而不是把测试挂死。
    ///
    /// ⚠️ 必须持有 [`TEST_SERIAL`]：本测试会清空进程级缓冲，与并发断言日志内容的测试
    /// （如 `http_client::auth::login_runtime_log_tests`）会互相踩踏。
    #[tokio::test]
    async fn clear_logs_does_not_deadlock_and_buffer_stays_usable() {
        let _serial = TEST_SERIAL.lock().await;
        log_info("RuntimeLogTest", "清理前");
        let joined = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::task::spawn_blocking(|| {
                clear_logs();
                query_logs(LogQuery::default()).len()
            }),
        )
        .await
        .expect("clear_logs 5s 内未返回：疑似持锁重入自死锁")
        .expect("阻塞任务应正常结束");
        assert!(
            joined >= 1,
            "清理后应至少留下「日志已清空」一条，实际 {joined}"
        );
    }
}
