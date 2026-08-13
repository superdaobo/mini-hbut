//! 插件落盘存储层：config / context / state / event inbox 四类数据，统一 JSON 文件。
//!
//! 满足 #611 持久化验收：
//! - 所有文件必带 `schema` 版本字段（dto::BG_SCHEMA_VERSION），缺失/更高版本视为不兼容；
//! - 原子写入：先写临时文件再 rename，避免 App/系统中断造成半写状态；
//! - 损坏/不兼容安全降级：原文件备份为 `*.corrupt-<ts>` 后重置默认值，不 crash；
//! - event inbox 容量上限（EVENT_INBOX_CAP），超出丢弃最旧；
//! - 按 scope 完整清理（账号切换/退出）。
//! - 存储内容不包含任何认证材料（契约层已保证），日志不输出敏感字段。

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::dto::{
    check_schema, BackgroundCheckState, BackgroundConfig, BackgroundContext, BackgroundEvent,
    SchemaCheck, EVENT_INBOX_CAP,
};

/// 可版本校验的落盘对象（config/context/state/event 均带 schema 字段）。
pub trait Versioned {
    fn schema(&self) -> u32;
}

impl Versioned for BackgroundConfig {
    fn schema(&self) -> u32 {
        self.schema
    }
}
impl Versioned for BackgroundContext {
    fn schema(&self) -> u32 {
        self.schema
    }
}
impl Versioned for BackgroundCheckState {
    fn schema(&self) -> u32 {
        self.schema
    }
}
impl Versioned for BackgroundEvent {
    fn schema(&self) -> u32 {
        self.schema
    }
}

/// 事件列表的版本校验：以首元素为准（空列表视为当前版本，天然兼容）。
impl<T: Versioned> Versioned for Vec<T> {
    fn schema(&self) -> u32 {
        self.first()
            .map(Versioned::schema)
            .unwrap_or(crate::dto::BG_SCHEMA_VERSION)
    }
}

/// 存储错误。
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("存储目录初始化失败: {0}")]
    DirInit(String),
    #[error("读取 {path} 失败: {source}")]
    Read {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("写入 {path} 失败: {source}")]
    Write {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

/// 插件数据目录内的文件名（保持稳定，跨端契约的一部分）。
pub const CONFIG_FILE: &str = "config.json";
pub const CONTEXT_FILE: &str = "context.json";
pub const STATE_FILE: &str = "state.json";
pub const EVENTS_FILE: &str = "events.json";

/// 落盘存储：所有方法为同步文件 IO（后台场景量级小，不需要 async）。
#[derive(Debug, Clone)]
pub struct BackgroundStore {
    dir: PathBuf,
}

impl BackgroundStore {
    /// 以 `{app_data_dir}/background` 为根创建存储。
    pub fn new(dir: PathBuf) -> Result<Self, StoreError> {
        fs::create_dir_all(&dir).map_err(|e| StoreError::DirInit(e.to_string()))?;
        Ok(Self { dir })
    }

    /// 供测试/内部使用的独立目录实例。
    pub fn from_dir(dir: PathBuf) -> Result<Self, StoreError> {
        Self::new(dir)
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn path(&self, name: &str) -> PathBuf {
        self.dir.join(name)
    }

    // ---- config ----

    /// 加载配置并校验 schema：不兼容时备份原文件并降级为默认值（不 crash）。
    pub fn load_config(&self) -> BackgroundConfig {
        match self.load_checked::<BackgroundConfig>(CONFIG_FILE) {
            Ok(Some(cfg)) => cfg,
            Ok(None) | Err(_) => BackgroundConfig::default(),
        }
    }

    pub fn save_config(&self, cfg: &BackgroundConfig) -> Result<(), StoreError> {
        self.save_atomic(CONFIG_FILE, cfg)
    }

    // ---- context ----

    /// 加载 context 并校验 schema：不兼容时备份并降级为 None。
    pub fn load_context(&self) -> Option<BackgroundContext> {
        match self.load_checked::<BackgroundContext>(CONTEXT_FILE) {
            Ok(Some(ctx)) => Some(ctx),
            Ok(None) | Err(_) => None,
        }
    }

    pub fn save_context(&self, ctx: &BackgroundContext) -> Result<(), StoreError> {
        self.save_atomic(CONTEXT_FILE, ctx)
    }

    // ---- state ----

    /// 加载 state 并校验 schema：不兼容时备份并降级为 None。
    pub fn load_state(&self) -> Option<BackgroundCheckState> {
        match self.load_checked::<BackgroundCheckState>(STATE_FILE) {
            Ok(Some(state)) => Some(state),
            Ok(None) | Err(_) => None,
        }
    }

    pub fn save_state(&self, state: &BackgroundCheckState) -> Result<(), StoreError> {
        self.save_atomic(STATE_FILE, state)
    }

    // ---- events ----

    /// 加载事件并校验 schema：不兼容时备份并降级为空 inbox。
    pub fn load_events(&self) -> Vec<BackgroundEvent> {
        match self.load_checked::<Vec<BackgroundEvent>>(EVENTS_FILE) {
            Ok(Some(events)) => events,
            Ok(None) | Err(_) => Vec::new(),
        }
    }

    /// 保存事件并强制容量上限：超出部分丢弃最旧（保留最新 EVENT_INBOX_CAP 条）。
    pub fn save_events(&self, events: &[BackgroundEvent]) -> Result<(), StoreError> {
        let kept: Vec<BackgroundEvent> = if events.len() > EVENT_INBOX_CAP {
            events[events.len() - EVENT_INBOX_CAP..].to_vec()
        } else {
            events.to_vec()
        };
        self.save_atomic(EVENTS_FILE, &kept)
    }

    /// 追加一条事件（内部应用容量上限后落盘）。
    pub fn append_event(&self, event: BackgroundEvent) -> Result<(), StoreError> {
        let mut events = self.load_events();
        events.push(event);
        self.save_events(&events)
    }

    /// 消费并移除事件：返回待消费列表（顺序保留），其余写回。
    /// `limit` 为 None 时消费全部；为 Some(n) 时最多消费 n 条（消费后仍受容量上限保护）。
    pub fn consume_events(&self, limit: Option<usize>) -> Result<Vec<BackgroundEvent>, StoreError> {
        let events = self.load_events();
        let take = limit.unwrap_or(events.len()).min(events.len());
        let consumed: Vec<BackgroundEvent> = events[..take].to_vec();
        let remaining: Vec<BackgroundEvent> = events[take..].to_vec();
        self.save_events(&remaining)?;
        Ok(consumed)
    }

    // ---- scope 清理（账号切换/退出） ----

    /// 按 scope 完整清理：匹配 scope 的 context、state、events。
    /// 返回 (是否清除 context/state, 清除的事件数)。
    pub fn clear_scope(&self, scope: &str) -> Result<(bool, usize), StoreError> {
        let mut cleared_any = false;

        // context：scope 完全匹配才清
        if let Some(ctx) = self.load_context() {
            if ctx.scope == scope {
                let _ = fs::remove_file(self.path(CONTEXT_FILE));
                cleared_any = true;
            }
        }
        // state：scope 完全匹配才清
        if let Some(state) = self.load_state() {
            if state.scope.as_deref() == Some(scope) {
                let _ = fs::remove_file(self.path(STATE_FILE));
                cleared_any = true;
            }
        }
        // events：按 scope 过滤保留非匹配项
        let events = self.load_events();
        let total = events.len();
        let kept: Vec<BackgroundEvent> = events
            .into_iter()
            .filter(|e| e.scope.as_deref() != Some(scope))
            .collect();
        self.save_events(&kept)?;
        let removed_events = total - kept.len();
        if removed_events > 0 {
            cleared_any = true;
        }
        Ok((cleared_any, removed_events))
    }

    // ---- 内部实现 ----

    /// 读取 + schema 版本校验。文件不存在返回 Ok(None)；
    /// JSON 损坏或 schema 不兼容时备份为 `*.corrupt-<ts>` 并返回 Ok(None)（安全降级，不 crash）。
    fn load_checked<T: DeserializeOwned + Versioned>(
        &self,
        name: &str,
    ) -> Result<Option<T>, StoreError> {
        let Some(value) = self.load::<T>(name)? else {
            return Ok(None);
        };
        if check_schema(value.schema()) == SchemaCheck::Ok {
            return Ok(Some(value));
        }
        // schema 不兼容（版本缺失/过高）：备份原文件后降级，绝不 crash。
        let backup = self.path(&format!("{name}.corrupt-{}", unix_ts()));
        let _ = fs::rename(self.path(name), &backup);
        log::warn!(
            "hbut-background: {name} schema 版本不兼容(当前={}, 支持={})，已备份为 {} 并按默认值降级",
            value.schema(),
            crate::dto::BG_SCHEMA_VERSION,
            backup.display()
        );
        Ok(None)
    }

    /// 读取并反序列化；文件不存在返回 Ok(None)；JSON 损坏时：
    /// 备份为 `*.corrupt-<ts>` 并返回 Ok(None)（安全降级，不 crash）。
    fn load<T: DeserializeOwned>(&self, name: &str) -> Result<Option<T>, StoreError> {
        let path = self.path(name);
        // 目录被外部删除时自愈重建（后台场景目录意外丢失不应导致读写失败）。
        let _ = fs::create_dir_all(&self.dir);
        let text = match fs::read_to_string(&path) {
            Ok(t) => t,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(StoreError::Read {
                    path: path.display().to_string(),
                    source: e,
                })
            }
        };
        match serde_json::from_str::<T>(&text) {
            Ok(value) => Ok(Some(value)),
            Err(e) => {
                // 损坏：备份原文件后按「无数据」降级，绝不 crash。
                let backup = self.path(&format!("{name}.corrupt-{}", unix_ts()));
                let _ = fs::rename(&path, &backup);
                log::warn!(
                    "hbut-background: {name} 解析失败({e})，已备份为 {} 并按默认值降级",
                    backup.display()
                );
                Ok(None)
            }
        }
    }

    /// 原子写入：写 `*.tmp-<ts>` 后 rename 覆盖。
    fn save_atomic<T: Serialize>(&self, name: &str, value: &T) -> Result<(), StoreError> {
        // 目录被外部删除时自愈重建。
        let _ = fs::create_dir_all(&self.dir);
        let path = self.path(name);
        let tmp = self.path(&format!("{name}.tmp-{}", unix_ts()));
        let json = serde_json::to_vec(value).map_err(|e| StoreError::Write {
            path: path.display().to_string(),
            source: std::io::Error::other(e.to_string()),
        })?;
        fs::write(&tmp, json).map_err(|e| StoreError::Write {
            path: tmp.display().to_string(),
            source: e,
        })?;
        fs::rename(&tmp, &path).map_err(|e| StoreError::Write {
            path: path.display().to_string(),
            source: e,
        })
    }
}

fn unix_ts() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dto::{BackgroundSource, BG_SCHEMA_VERSION};

    fn test_store() -> BackgroundStore {
        let dir = tempfile::tempdir().expect("创建临时目录失败");
        BackgroundStore::new(dir.path().to_path_buf()).expect("初始化存储失败")
    }

    #[test]
    fn config_roundtrip() {
        let store = test_store();
        assert_eq!(store.load_config(), BackgroundConfig::default());
        let cfg = BackgroundConfig {
            schema: BG_SCHEMA_VERSION,
            enabled: true,
            interval_minutes: Some(45),
            business: vec!["grades".to_string()],
            scope: Some("s1".to_string()),
        };
        store.save_config(&cfg).expect("保存失败");
        assert_eq!(store.load_config(), cfg);
    }

    #[test]
    fn state_roundtrip_and_missing_file() {
        let store = test_store();
        assert!(store.load_state().is_none(), "未写入时 state 应为 None");
        let state = BackgroundCheckState::initial(
            crate::dto::BackgroundPlatform::Desktop,
            crate::dto::BackgroundSource::Rust,
        );
        store.save_state(&state).expect("保存失败");
        assert_eq!(store.load_state(), Some(state));
    }

    #[test]
    fn atomic_write_no_partial_file() {
        let store = test_store();
        let cfg = BackgroundConfig {
            schema: BG_SCHEMA_VERSION,
            enabled: true,
            interval_minutes: None,
            business: vec![],
            scope: Some("s1".to_string()),
        };
        store.save_config(&cfg).expect("保存失败");
        // 原子写后不应残留 tmp 文件
        let leftovers: Vec<String> = fs::read_dir(store.dir())
            .expect("读取目录失败")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "原子写残留临时文件: {leftovers:?}");
    }

    #[test]
    fn corrupted_file_degrades_safely() {
        let store = test_store();
        fs::create_dir_all(store.dir()).expect("重建目录失败");
        // 写入非法内容（非 JSON）
        fs::write(store.path(STATE_FILE), b"{not-json!!").expect("写入损坏文件失败");
        assert!(store.load_state().is_none(), "损坏文件必须降级为 None");
        // 原文件应被备份为 .corrupt-*
        let backups: Vec<String> = fs::read_dir(store.dir())
            .expect("读取目录失败")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.contains(".corrupt-"))
            .collect();
        assert_eq!(backups.len(), 1, "损坏文件应被备份: {backups:?}");
    }

    #[test]
    fn incompatible_schema_degrades_safely() {
        let store = test_store();
        fs::create_dir_all(store.dir()).expect("重建目录失败");
        // 模拟未来版本（schema=999）的 config
        let future =
            r#"{"schema":999,"enabled":true,"intervalMinutes":10,"business":[],"scope":"s1"}"#;
        fs::write(store.path(CONFIG_FILE), future).expect("写入失败");
        // schema 不兼容：必须降级为默认值，且原文件被备份为 .corrupt-*
        assert_eq!(store.load_config(), BackgroundConfig::default());
        let backups: Vec<String> = fs::read_dir(store.dir())
            .expect("读取目录失败")
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.contains(".corrupt-"))
            .collect();
        assert_eq!(backups.len(), 1, "不兼容文件应被备份: {backups:?}");
    }

    #[test]
    fn event_inbox_cap_enforced() {
        let store = test_store();
        let mut events = Vec::new();
        for i in 0..(EVENT_INBOX_CAP + 10) {
            events.push(BackgroundEvent {
                schema: BG_SCHEMA_VERSION,
                id: format!("evt-{i}"),
                source: BackgroundSource::Rust,
                kind: "synthetic_run".to_string(),
                scope: Some("s1".to_string()),
                occurred_at: "1700000000Z".to_string(),
                payload: serde_json::json!({"seq": i}),
            });
        }
        store.save_events(&events).expect("保存失败");
        let loaded = store.load_events();
        assert_eq!(loaded.len(), EVENT_INBOX_CAP, "容量上限未生效");
        // 保留的是最新 EVENT_INBOX_CAP 条
        assert_eq!(loaded[0].id, format!("evt-{}", 10));
        assert_eq!(
            loaded.last().expect("非空").id,
            format!("evt-{}", EVENT_INBOX_CAP + 9)
        );
    }

    #[test]
    fn consume_events_marks_consumed() {
        let store = test_store();
        for i in 0..5 {
            store
                .append_event(BackgroundEvent {
                    schema: BG_SCHEMA_VERSION,
                    id: format!("evt-{i}"),
                    source: BackgroundSource::Android,
                    kind: "synthetic_run".to_string(),
                    scope: Some("s1".to_string()),
                    occurred_at: "1700000000Z".to_string(),
                    payload: serde_json::json!({"seq": i}),
                })
                .expect("追加失败");
        }
        // 消费前 2 条
        let consumed = store.consume_events(Some(2)).expect("消费失败");
        assert_eq!(consumed.len(), 2);
        assert_eq!(consumed[0].id, "evt-0");
        let remaining = store.load_events();
        assert_eq!(remaining.len(), 3);
        assert_eq!(remaining[0].id, "evt-2");
        // 再消费全部
        let all = store.consume_events(None).expect("消费失败");
        assert_eq!(all.len(), 3);
        assert!(store.load_events().is_empty());
    }

    #[test]
    fn clear_scope_removes_matching_data_only() {
        let store = test_store();
        // 写入 s1 的 context/state/events 与 s2 的 events
        store
            .save_context(&crate::dto::BackgroundContext {
                schema: BG_SCHEMA_VERSION,
                scope: "s1".to_string(),
                business: vec!["grades".to_string()],
                updated_at: "1700000000Z".to_string(),
            })
            .expect("保存 context 失败");
        let mut state = BackgroundCheckState::initial(
            crate::dto::BackgroundPlatform::Android,
            BackgroundSource::Android,
        );
        state.scope = Some("s1".to_string());
        store.save_state(&state).expect("保存 state 失败");
        for (scope, id) in [("s1", "evt-a"), ("s2", "evt-b")] {
            store
                .append_event(BackgroundEvent {
                    schema: BG_SCHEMA_VERSION,
                    id: id.to_string(),
                    source: BackgroundSource::Rust,
                    kind: "synthetic_run".to_string(),
                    scope: Some(scope.to_string()),
                    occurred_at: "1700000000Z".to_string(),
                    payload: serde_json::json!({}),
                })
                .expect("追加事件失败");
        }

        let (cleared, removed) = store.clear_scope("s1").expect("清理失败");
        assert!(cleared);
        assert_eq!(removed, 1, "s1 的事件应被清理");
        assert!(store.load_context().is_none(), "s1 context 应被清除");
        assert!(store.load_state().is_none(), "s1 state 应被清除");
        let remaining = store.load_events();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "evt-b", "s2 事件必须保留");
    }

    #[test]
    fn clear_scope_noop_when_nothing_matches() {
        let store = test_store();
        let (cleared, removed) = store.clear_scope("nobody").expect("清理失败");
        assert!(!cleared);
        assert_eq!(removed, 0);
    }
}
