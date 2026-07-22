//! 进程内运行时调试日志（始终可用，不依赖 debug_assertions）
//!
//! - 前端调试窗 / HTTP bridge 可拉取
//! - 覆盖重登、学习通、收件箱等关键路径

use chrono::Local;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const MAX_LOGS: usize = 3000;

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
    guard.items.push_back(item);
    while guard.items.len() > MAX_LOGS {
        guard.items.pop_front();
    }
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
    let mut guard = match state().lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    guard.items.clear();
    log_info("RuntimeLog", "日志已清空");
}

pub fn stats() -> Value {
    let guard = match state().lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };
    json!({
        "count": guard.items.len(),
        "max": MAX_LOGS,
        "last_id": guard.seq,
        "uptime_ms": guard.started.elapsed().as_millis() as u64,
    })
}

/// 从任意 format 参数写入（兼容旧 println 风格）
pub fn log_fmt(level: &str, scope: &str, args: std::fmt::Arguments<'_>) {
    push_inner(level, scope, &format!("{args}"), None);
}
