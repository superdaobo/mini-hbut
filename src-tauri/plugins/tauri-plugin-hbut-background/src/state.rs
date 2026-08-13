//! 插件内存状态与 runNow 闭环核心逻辑。
//!
//! 设计要点：
//! - `PluginState` 持有 config/context/state/events 的内存副本（唯一事实源），每次变更立即落盘；
//! - native 调用通过 `NativeRunner` trait 注入：真实实现（mobile.rs）分派 Android JNI / iOS /
//!   desktop no-op；测试注入假 runner 验证闭环，不依赖 Tauri AppHandle；
//! - runNow 闭环：Rust 内存状态 -> NativeRunner -> 更新 state + 追加 event -> 落盘 -> 前端回读。

use std::path::PathBuf;
use std::sync::Mutex;

use crate::dto::{
    check_schema, now_rfc3339, BackgroundCheckState, BackgroundConfig, BackgroundContext,
    BackgroundEvent, BackgroundPlatform, BackgroundSource, ClearContextResult, ConsumeEventsResult,
    RunNowRequest, RunSummary, SchemaCheck, BG_SCHEMA_VERSION, EVENT_INBOX_CAP,
};
use crate::store::BackgroundStore;

/// native 执行器抽象（真实实现见 mobile.rs）。
pub trait NativeRunner: Send + Sync {
    /// 请求 native 执行一次检查。返回 None 表示当前平台无 native 承载（desktop/web）。
    /// 实现必须返回真实平台结果，不统一伪造 ready。
    fn run_native(&self, scope: &Option<String>, force_synthetic: bool) -> Option<RunSummary>;

    /// 通知 native 更新系统调度（Android WorkManager 唯一周期 work / iOS BGAppRefresh request）。
    /// 返回 None 表示无 native 承载（desktop/web，配置已由 Rust 落盘）；
    /// Some(Err) 表示 native 报告失败（如实返回，不伪造 ready）。
    fn configure_native(&self, config_json: &str) -> Option<Result<(), String>> {
        let _ = config_json;
        None
    }

    /// 通知 native 取消系统调度（disable 语义，与 configure_native 对应）。
    fn disable_native(&self, keep_diagnostics: bool) -> Option<Result<(), String>> {
        let _ = keep_diagnostics;
        None
    }

    /// 通知 native 同步后台上下文（iOS 在 context 就绪后补提交调度；Android 落盘幂等）。
    fn sync_context_native(&self, context_json: &str) -> Option<Result<(), String>> {
        let _ = context_json;
        None
    }

    /// 通知 native 按 scope 清理（Android baseline runtime / iOS Keychain 安全材料）。
    fn clear_context_native(&self, scope: &str) -> Option<Result<(), String>> {
        let _ = scope;
        None
    }
}

/// 合并磁盘事件与内存事件（按 id 去重，磁盘优先且保持顺序）。
/// 磁盘是 native 进程（Kotlin/Swift）追加的真实业务事件（grades_changed），
/// 必须优先保留：任何「以内存快照覆盖盘」的写路径都不允许吞掉 native 新写的事件
/// （#614 收口 #612 报告的 runNow 覆盖 bug）。
fn merge_events(disk: &[BackgroundEvent], memory: &[BackgroundEvent]) -> Vec<BackgroundEvent> {
    let mut merged: Vec<BackgroundEvent> = disk.to_vec();
    let mut seen: std::collections::HashSet<String> = merged.iter().map(|e| e.id.clone()).collect();
    for evt in memory {
        if seen.insert(evt.id.clone()) {
            merged.push(evt.clone());
        }
    }
    merged
}

/// 插件全局状态（由插件 manage 到 Tauri 应用）。
pub struct PluginState {
    inner: Mutex<Inner>,
}

struct Inner {
    store: BackgroundStore,
    platform: BackgroundPlatform,
    config: BackgroundConfig,
    context: Option<BackgroundContext>,
    state: BackgroundCheckState,
    events: Vec<BackgroundEvent>,
    /// 事件 id 自增序列（跨进程无需唯一，仅保证进程内单调）。
    seq: u64,
}

impl PluginState {
    /// 从磁盘加载既有数据构建状态（config/context/state/events 分别带版本校验与降级）。
    pub fn load(
        store: BackgroundStore,
        platform: BackgroundPlatform,
        source: BackgroundSource,
    ) -> Self {
        let config = store.load_config();
        let context = store.load_context();
        let mut state = store
            .load_state()
            .unwrap_or_else(|| BackgroundCheckState::initial(platform, source));
        let events = store.load_events();
        // 平台/source 是运行时真实值，不落盘覆盖（防止旧平台数据伪造新平台状态）。
        state.platform = platform;
        state.source = source;
        state.pending_events = events.len();
        Self {
            inner: Mutex::new(Inner {
                store,
                platform,
                config,
                context,
                state,
                events,
                seq: 0,
            }),
        }
    }

    pub fn platform(&self) -> BackgroundPlatform {
        self.lock().platform
    }

    /// 事件/上下文落盘目录（native runner 需要同一目录才能共享事件文件）。
    pub fn store_dir(&self) -> PathBuf {
        self.lock().store.dir().to_path_buf()
    }

    /// 当前生效 scope（state.scope 优先，其次 context.scope；供 native 清理对齐）。
    pub fn current_scope(&self) -> Option<String> {
        let inner = self.lock();
        inner
            .state
            .scope
            .clone()
            .or_else(|| inner.context.as_ref().map(|c| c.scope.clone()))
    }

    // ---- configure ----

    /// 保存用户配置并在支持的平台更新调度（骨架阶段只记录；真实调度由 #612/#613 接入）。
    pub fn configure(&self, cfg: &BackgroundConfig) -> Result<(), String> {
        let mut inner = self.lock();
        if check_schema(cfg.schema) != SchemaCheck::Ok {
            return Err(format!(
                "配置 schema 版本不兼容（当前={}, 支持={}）",
                cfg.schema, BG_SCHEMA_VERSION
            ));
        }
        if let Some(minutes) = cfg.interval_minutes {
            if !(1..=1440).contains(&minutes) {
                return Err("intervalMinutes 必须在 1..=1440 之间".to_string());
            }
        }
        inner.config = cfg.clone();
        inner.state.configured = true;
        inner.state.enabled = cfg.enabled;
        inner.state.scope = cfg.scope.clone();
        inner
            .store
            .save_config(cfg)
            .map_err(|e| format!("保存配置失败: {e}"))?;
        inner
            .store
            .save_state(&inner.state)
            .map_err(|e| format!("保存状态失败: {e}"))
    }

    // ---- disable ----

    /// 关闭系统调度；keep_diagnostics=true 时保留 last_run/error 诊断字段。
    pub fn disable(&self, keep_diagnostics: bool) -> Result<(), String> {
        let mut inner = self.lock();
        inner.config.enabled = false;
        inner.state.enabled = false;
        if !keep_diagnostics {
            inner.state.last_run_at = None;
            inner.state.last_run_ok = None;
            inner.state.error = None;
        }
        inner
            .store
            .save_config(&inner.config)
            .map_err(|e| format!("保存配置失败: {e}"))?;
        inner
            .store
            .save_state(&inner.state)
            .map_err(|e| format!("保存状态失败: {e}"))
    }

    // ---- syncContext ----

    /// 更新后台执行最小上下文。JS 只能提交非敏感控制信息（scope/业务选择）；
    /// 敏感认证材料由 Rust 会话层直接交给 native secure boundary（#608 红线 2），不经过本 DTO。
    pub fn sync_context(&self, ctx: &BackgroundContext) -> Result<(), String> {
        let mut inner = self.lock();
        if check_schema(ctx.schema) != SchemaCheck::Ok {
            return Err(format!(
                "context schema 版本不兼容（当前={}, 支持={}）",
                ctx.schema, BG_SCHEMA_VERSION
            ));
        }
        if ctx.scope.trim().is_empty() {
            return Err("context.scope 不能为空（账号隔离与清理依赖 scope）".to_string());
        }
        inner.context = Some(ctx.clone());
        inner.state.scope = Some(ctx.scope.clone());
        inner
            .store
            .save_context(ctx)
            .map_err(|e| format!("保存 context 失败: {e}"))?;
        inner
            .store
            .save_state(&inner.state)
            .map_err(|e| format!("保存状态失败: {e}"))
    }

    // ---- getState ----

    /// 返回统一后台检查状态（副本，pending_events 实时计算）。
    pub fn get_state(&self) -> BackgroundCheckState {
        let inner = self.lock();
        let mut state = inner.state.clone();
        state.pending_events = inner.events.len();
        state
    }

    // ---- runNow 闭环 ----

    /// 执行一次检查：Rust -> native（或 desktop synthetic）-> 更新 state/event -> 落盘。
    /// 返回执行摘要；`runner` 为 native 承载（测试可注入假实现）。
    pub fn perform_run_now(
        &self,
        request: &RunNowRequest,
        runner: &dyn NativeRunner,
    ) -> Result<RunSummary, String> {
        let mut inner = self.lock();
        let scope = request
            .scope
            .clone()
            .or_else(|| inner.context.as_ref().map(|c| c.scope.clone()));
        let force_synthetic = request.force_synthetic.unwrap_or(false);

        let summary = if force_synthetic {
            // 开发态强制假业务：不触碰 native，验证 JS->Rust->state/event 管道。
            RunSummary::synthetic("开发态强制 synthetic 运行（未调用 native）")
        } else {
            match runner.run_native(&scope, force_synthetic) {
                // native 真实返回（Android JNI 成败如实 / iOS synthetic / 后续真实业务）
                Some(native) => native,
                // desktop/web：明确 unsupported/no-op 语义，应用不崩溃。
                None => RunSummary::synthetic("当前平台无 native 后台执行（unsupported/no-op）"),
            }
        };

        inner.state.last_run_at = Some(now_rfc3339());
        inner.state.last_run_ok = Some(summary.ok);
        if summary.ok {
            inner.state.error = None;
            // #614 收口 #612 覆盖 bug：App 运行期间 native（Android runNow / iOS BGTask）
            // 会把真实业务事件（grades_changed）直接追加进磁盘 events.json；
            // 必须先 reload 磁盘并与内存按 id 合并，绝不能用内存快照覆盖盘上事件。
            let on_disk = inner.store.load_events();
            inner.events = merge_events(&on_disk, &inner.events);
            if summary.synthetic {
                // 开发态/desktop synthetic：native 未写事件，追加 synthetic 事件保持管道闭环（#611）。
                inner.seq += 1;
                let event_id = crate::dto::new_event_id(inner.seq);
                let platform = inner.platform;
                let scope_for_event = scope.clone();
                inner.events.push(BackgroundEvent {
                    schema: BG_SCHEMA_VERSION,
                    id: event_id,
                    source: event_source(platform, summary.ok),
                    kind: "synthetic_run".to_string(),
                    scope: scope_for_event,
                    occurred_at: now_rfc3339(),
                    payload: serde_json::json!({
                        "synthetic": true,
                        "message": summary.message,
                    }),
                });
            }
            // 真实 native 成功（summary.synthetic=false）不追加 synthetic 事件：
            // - events_produced > 0：native 已写真实事件（grades_changed）；
            // - events_produced == 0：无变化（baselined/unchanged/deduplicated），无事件可写。
            // 容量上限：超出丢弃最旧。
            if inner.events.len() > EVENT_INBOX_CAP {
                let overflow = inner.events.len() - EVENT_INBOX_CAP;
                inner.events.drain(..overflow);
            }
            inner
                .store
                .save_events(&inner.events)
                .map_err(|e| format!("保存事件失败: {e}"))?;
        } else {
            inner.state.error = summary.message.clone();
        }
        inner.state.pending_events = inner.events.len();
        inner
            .store
            .save_state(&inner.state)
            .map_err(|e| format!("保存状态失败: {e}"))?;
        Ok(summary)
    }

    // ---- peekEvents / consumeEvents ----
    //
    // #614 消费语义（at-least-once + ack）：
    // - `peek_events`：只读不删，供「完整同步成功后再 ack」的消费链使用，
    //   保证 App 读取到事件后如果 Rust 完整同步失败，事件不会被提前删除
    //   （下次 resume 仍可重试补同步）；
    // - `consume_events(limit, ids)`：ack。显式 ids 时只删除匹配 id 的事件
    //   （精确 ack，账号隔离：不误删其他 scope 的事件）；缺省保持 limit 语义
    //   （FIFO drain，向后兼容 #611 固定 API）。

    /// 读取事件（先与磁盘合并），不删除任何条目；remaining 为本次未读取数量。
    pub fn peek_events(&self, limit: Option<usize>) -> Result<ConsumeEventsResult, String> {
        let mut inner = self.lock();
        // 与 consume 相同：先与磁盘合并，App 运行期间 native 追加的事件同样可见。
        let on_disk = inner.store.load_events();
        inner.events = merge_events(&on_disk, &inner.events);
        let take = limit.unwrap_or(inner.events.len()).min(inner.events.len());
        Ok(ConsumeEventsResult {
            schema: BG_SCHEMA_VERSION,
            events: inner.events[..take].to_vec(),
            remaining: inner.events.len() - take,
        })
    }

    /// 消费事件：按明确语义移除已消费条目并持久化，返回结果与剩余数。
    /// `ids` 非空时只删除匹配 id 的事件（精确 ack）；否则按 limit FIFO drain。
    pub fn consume_events(
        &self,
        limit: Option<usize>,
        ids: Option<Vec<String>>,
    ) -> Result<ConsumeEventsResult, String> {
        let mut inner = self.lock();
        // #614：先与磁盘合并再消费——App 运行期间 native 周期任务（WorkManager/BGTask）
        // 可能已追加新事件，避免内存快照漏读盘上未消费事件。
        let on_disk = inner.store.load_events();
        inner.events = merge_events(&on_disk, &inner.events);
        let consumed: Vec<BackgroundEvent> = if let Some(ids) = ids {
            if ids.is_empty() {
                // 空 ids：no-op（不删除任何事件），避免「空列表 = 全删」的意外语义。
                return Ok(ConsumeEventsResult {
                    schema: BG_SCHEMA_VERSION,
                    events: Vec::new(),
                    remaining: inner.events.len(),
                });
            }
            let targets: std::collections::HashSet<String> = ids.into_iter().collect();
            let mut matched = Vec::with_capacity(targets.len());
            inner.events.retain(|evt| {
                if targets.contains(&evt.id) {
                    matched.push(evt.clone());
                    false
                } else {
                    true
                }
            });
            matched
        } else {
            let take = limit.unwrap_or(inner.events.len()).min(inner.events.len());
            inner.events.drain(..take).collect()
        };
        inner
            .store
            .save_events(&inner.events)
            .map_err(|e| format!("保存事件失败: {e}"))?;
        inner.state.pending_events = inner.events.len();
        inner
            .store
            .save_state(&inner.state)
            .map_err(|e| format!("保存状态失败: {e}"))?;
        Ok(ConsumeEventsResult {
            schema: BG_SCHEMA_VERSION,
            events: consumed,
            remaining: inner.events.len(),
        })
    }

    // ---- clearContext ----

    /// 账号退出/切换时清理对应 scope 的 context/state/events（内存 + 落盘）。
    pub fn clear_context(&self, scope: &Option<String>) -> Result<ClearContextResult, String> {
        let mut inner = self.lock();
        let target = scope
            .clone()
            .or_else(|| inner.state.scope.clone())
            .or_else(|| inner.context.as_ref().map(|c| c.scope.clone()));
        let Some(target) = target else {
            // 无任何 scope 可清理：返回 cleared=false 的 no-op。
            return Ok(ClearContextResult {
                schema: BG_SCHEMA_VERSION,
                cleared: false,
                removed_events: 0,
            });
        };

        let (store_cleared, store_removed) = inner
            .store
            .clear_scope(&target)
            .map_err(|e| format!("清理存储失败: {e}"))?;

        // 内存同步清理（与 store 保持一致）；removed 按「磁盘/内存同一数据源」只计一次。
        if inner
            .context
            .as_ref()
            .map(|c| c.scope == target)
            .unwrap_or(false)
        {
            inner.context = None;
        }
        if inner.state.scope.as_deref() == Some(&target) {
            inner.state.scope = None;
            inner.state.last_run_at = None;
            inner.state.last_run_ok = None;
            inner.state.error = None;
        }
        // #614：过滤前先与磁盘合并，防止 native 新事件（其他 scope）被内存快照覆盖。
        let on_disk = inner.store.load_events();
        inner.events = merge_events(&on_disk, &inner.events);
        let before = inner.events.len();
        inner.events.retain(|e| e.scope.as_deref() != Some(&target));
        let memory_removed = before - inner.events.len();
        // 磁盘与内存对齐（store.clear_scope 已过滤磁盘事件；再写回内存态保证同源一致）。
        inner
            .store
            .save_events(&inner.events)
            .map_err(|e| format!("保存事件失败: {e}"))?;
        let removed_events = store_removed.max(memory_removed);
        inner.state.pending_events = inner.events.len();
        inner
            .store
            .save_state(&inner.state)
            .map_err(|e| format!("保存状态失败: {e}"))?;

        let cleared = store_cleared || removed_events > 0;
        Ok(ClearContextResult {
            schema: BG_SCHEMA_VERSION,
            cleared,
            removed_events,
        })
    }

    /// 测试/内部访问（避免在非测试路径泄露锁细节）。
    #[cfg(test)]
    fn inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.lock()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        match self.inner.lock() {
            Ok(guard) => guard,
            // 锁中毒：取回数据继续（骨架状态机无跨线程不变量，崩溃恢复语义优于 panic）。
            Err(poisoned) => poisoned.into_inner(),
        }
    }
}

/// 事件来源按「真实平台 + 执行结果」确定：Android/iOS 成功才标记为 native 来源。
fn event_source(platform: BackgroundPlatform, ok: bool) -> BackgroundSource {
    match (platform, ok) {
        (BackgroundPlatform::Android, true) => BackgroundSource::Android,
        (BackgroundPlatform::Ios, true) => BackgroundSource::Ios,
        _ => BackgroundSource::Rust,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::BackgroundStore;

    /// 假 native runner：模拟 desktop 无 native（None）或指定结果。
    struct FakeRunner {
        result: Option<RunSummary>,
        calls: std::sync::Mutex<u32>,
    }

    impl FakeRunner {
        fn none() -> Self {
            Self {
                result: None,
                calls: std::sync::Mutex::new(0),
            }
        }
        fn some(result: RunSummary) -> Self {
            Self {
                result: Some(result),
                calls: std::sync::Mutex::new(0),
            }
        }
        fn call_count(&self) -> u32 {
            *self.calls.lock().expect("锁失败")
        }
    }

    impl NativeRunner for FakeRunner {
        fn run_native(&self, _scope: &Option<String>, _force: bool) -> Option<RunSummary> {
            *self.calls.lock().expect("锁失败") += 1;
            self.result.clone()
        }
    }

    fn test_state(platform: BackgroundPlatform, source: BackgroundSource) -> PluginState {
        let dir = tempfile::tempdir().expect("创建临时目录失败");
        let store = BackgroundStore::new(dir.path().to_path_buf()).expect("初始化存储失败");
        PluginState::load(store, platform, source)
    }

    fn sample_config(enabled: bool) -> BackgroundConfig {
        BackgroundConfig {
            schema: BG_SCHEMA_VERSION,
            enabled,
            interval_minutes: Some(30),
            business: vec!["grades".to_string()],
            scope: Some("2024010101".to_string()),
        }
    }

    #[test]
    fn configure_updates_state() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        state.configure(&sample_config(true)).expect("配置失败");
        let s = state.get_state();
        assert!(s.configured);
        assert!(s.enabled);
        assert_eq!(s.scope.as_deref(), Some("2024010101"));
        // 落盘后可重新加载
        let reloaded = PluginState::load(
            state.inner().store.clone(),
            BackgroundPlatform::Desktop,
            BackgroundSource::Rust,
        );
        assert!(reloaded.get_state().configured);
    }

    #[test]
    fn configure_rejects_incompatible_schema() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        let mut cfg = sample_config(true);
        cfg.schema = 999;
        let err = state.configure(&cfg).expect_err("不兼容 schema 必须被拒绝");
        assert!(err.contains("schema"), "错误信息应说明版本问题: {err}");
    }

    #[test]
    fn configure_rejects_bad_interval() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        let mut cfg = sample_config(true);
        cfg.interval_minutes = Some(0);
        assert!(state.configure(&cfg).is_err());
        cfg.interval_minutes = Some(1441);
        assert!(state.configure(&cfg).is_err());
    }

    #[test]
    fn disable_keeps_diagnostics_optionally() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        state.configure(&sample_config(true)).expect("配置失败");
        // 先跑一次制造诊断
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: Some(true),
                },
                &FakeRunner::none(),
            )
            .expect("runNow 失败");
        // keep_diagnostics=true：保留 last_run
        state.disable(true).expect("disable 失败");
        let s = state.get_state();
        assert!(!s.enabled);
        assert!(s.last_run_at.is_some(), "keep_diagnostics 应保留诊断状态");
        // keep_diagnostics=false：清空诊断
        state.disable(false).expect("disable 失败");
        let s = state.get_state();
        assert!(s.last_run_at.is_none());
        assert!(s.error.is_none());
    }

    #[test]
    fn sync_context_requires_scope() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        let ctx = BackgroundContext {
            schema: BG_SCHEMA_VERSION,
            scope: "  ".to_string(),
            business: vec![],
            updated_at: now_rfc3339(),
        };
        assert!(state.sync_context(&ctx).is_err(), "空 scope 必须被拒绝");
    }

    #[test]
    fn run_now_closed_loop_desktop_synthetic() {
        // desktop 语义：无 native（None）-> synthetic summary -> state/event 更新 -> 回读。
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        state.configure(&sample_config(true)).expect("配置失败");
        let runner = FakeRunner::none();
        let summary = state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: None,
                },
                &runner,
            )
            .expect("runNow 失败");
        assert!(summary.ok, "desktop no-op 必须返回成功 synthetic 摘要");
        assert!(summary.synthetic);
        assert_eq!(
            runner.call_count(),
            1,
            "desktop 也应询问 native（由实现返回 None）"
        );

        // 状态回读：last_run 记录 + 事件可见
        let s = state.get_state();
        assert!(s.last_run_at.is_some());
        assert_eq!(s.last_run_ok, Some(true));
        assert_eq!(s.pending_events, 1, "runNow 后应有一条 synthetic 事件");

        // 事件回读（闭环的 JS 侧读取路径等价于 consume_events）
        let result = state.consume_events(None, None).expect("消费失败");
        assert_eq!(result.events.len(), 1);
        assert_eq!(result.events[0].kind, "synthetic_run");
        assert_eq!(result.remaining, 0);
        assert_eq!(state.get_state().pending_events, 0);
    }

    #[test]
    fn run_now_force_synthetic_skips_native() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        let runner = FakeRunner::some(RunSummary::synthetic("不应被调用"));
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: Some(true),
                },
                &runner,
            )
            .expect("runNow 失败");
        assert_eq!(runner.call_count(), 0, "force_synthetic 不得调用 native");
    }

    #[test]
    fn run_now_native_failure_is_reported_honestly() {
        // native 失败：last_run_ok=false + error 有值 + 不产生事件（不伪造 ready）。
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        let runner = FakeRunner::some(RunSummary::failed("JNI 调用 Kotlin 失败"));
        let summary = state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: None,
                },
                &runner,
            )
            .expect("runNow 不应整体失败");
        assert!(!summary.ok);
        let s = state.get_state();
        assert_eq!(s.last_run_ok, Some(false));
        assert!(s.error.is_some());
        assert_eq!(s.pending_events, 0, "失败不得产生事件");
    }

    #[test]
    fn run_now_android_success_source_is_android() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: None,
                },
                &FakeRunner::some(RunSummary::synthetic("Kotlin 执行成功")),
            )
            .expect("runNow 失败");
        let s = state.get_state();
        assert_eq!(
            s.source,
            BackgroundSource::Android,
            "source 必须如实反映平台"
        );
        let result = state.consume_events(None, None).expect("消费失败");
        assert_eq!(result.events[0].source, BackgroundSource::Android);
    }

    #[test]
    fn run_now_event_inbox_cap() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        let runner = FakeRunner::none();
        for _ in 0..(EVENT_INBOX_CAP + 5) {
            state
                .perform_run_now(
                    &RunNowRequest {
                        scope: None,
                        force_synthetic: None,
                    },
                    &runner,
                )
                .expect("runNow 失败");
        }
        let result = state.consume_events(None, None).expect("消费失败");
        assert_eq!(
            result.events.len(),
            EVENT_INBOX_CAP,
            "inbox 容量上限必须生效"
        );
    }

    /// #614 收口 #612 覆盖 bug：runNow 成功后不得以内存快照覆盖盘上 native 事件。
    #[test]
    fn run_now_merges_disk_events_without_overwrite() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        // 模拟 native（Kotlin runNow 真实核心）绕过 Rust 内存、直接向盘上追加 grades_changed 事件。
        state
            .inner()
            .store
            .append_event(BackgroundEvent {
                schema: BG_SCHEMA_VERSION,
                id: "evt-native-grades".to_string(),
                source: BackgroundSource::Android,
                kind: "grades_changed".to_string(),
                scope: Some("2024010101".to_string()),
                occurred_at: now_rfc3339(),
                payload: serde_json::json!({
                    "type": "grades-changed",
                    "source": "android-workmanager",
                    "targetView": "grades",
                    "presented": true,
                    "signature": "S2",
                }),
            })
            .expect("native 写盘失败");

        // Rust 侧执行 runNow（synthetic 管道闭环），成功路径会写回事件文件。
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: Some(true),
                },
                &FakeRunner::none(),
            )
            .expect("runNow 失败");

        // 盘上 native 事件必须仍在（未被内存快照覆盖），且 synthetic 事件已追加。
        let loaded = state.inner().store.load_events();
        let kinds: Vec<&str> = loaded.iter().map(|e| e.kind.as_str()).collect();
        assert!(
            kinds.contains(&"grades_changed"),
            "native 事件被覆盖: {kinds:?}"
        );
        assert!(
            kinds.contains(&"synthetic_run"),
            "synthetic 事件缺失: {kinds:?}"
        );
    }

    /// 真实 native 成功（synthetic=false 且 events_produced>0）时不再追加 synthetic 事件。
    #[test]
    fn run_now_native_real_does_not_append_synthetic() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        let runner = FakeRunner::some(RunSummary {
            ok: true,
            synthetic: false,
            events_produced: 1,
            message: Some("发现成绩变化，已写 grades_changed 事件".to_string()),
        });
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: None,
                },
                &runner,
            )
            .expect("runNow 失败");
        assert_eq!(
            state.get_state().pending_events,
            0,
            "native 已产事件时不得追加 synthetic 事件"
        );
    }

    /// consume 前先与磁盘合并：App 运行期间 native 追加的盘上事件可被消费（不丢事件）。
    #[test]
    fn consume_events_reads_disk_only_events() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        // 模拟 native 进程（WorkManager）在 App 运行时直接写盘（内存尚不知情）。
        state
            .inner()
            .store
            .append_event(BackgroundEvent {
                schema: BG_SCHEMA_VERSION,
                id: "evt-worker-1".to_string(),
                source: BackgroundSource::Android,
                kind: "grades_changed".to_string(),
                scope: Some("2024010101".to_string()),
                occurred_at: now_rfc3339(),
                payload: serde_json::json!({"signature": "S3"}),
            })
            .expect("native 写盘失败");
        let result = state.consume_events(None, None).expect("消费失败");
        assert_eq!(result.events.len(), 1, "盘上事件必须被消费");
        assert_eq!(result.events[0].id, "evt-worker-1");
        assert_eq!(result.remaining, 0);
    }

    /// clear_context 过滤前先合并盘：其他 scope 的盘上事件不被内存快照覆盖。
    #[test]
    fn clear_context_keeps_disk_events_of_other_scope() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        state
            .sync_context(&BackgroundContext {
                schema: BG_SCHEMA_VERSION,
                scope: "2024010101".to_string(),
                business: vec!["grades".to_string()],
                updated_at: now_rfc3339(),
            })
            .expect("sync_context 失败");
        // 盘上有 s2 事件（内存不知情），内存只有 s1 的 synthetic 事件。
        state
            .inner()
            .store
            .append_event(BackgroundEvent {
                schema: BG_SCHEMA_VERSION,
                id: "evt-s2-disk".to_string(),
                source: BackgroundSource::Android,
                kind: "grades_changed".to_string(),
                scope: Some("account-2".to_string()),
                occurred_at: now_rfc3339(),
                payload: serde_json::json!({}),
            })
            .expect("native 写盘失败");
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: Some(true),
                },
                &FakeRunner::none(),
            )
            .expect("runNow 失败");

        let result = state
            .clear_context(&Some("2024010101".to_string()))
            .expect("清理失败");
        assert!(result.cleared);
        let remaining = state.inner().store.load_events();
        assert_eq!(remaining.len(), 1, "s2 盘上事件必须保留");
        assert_eq!(remaining[0].id, "evt-s2-disk");
    }

    #[test]
    fn consume_events_partial_then_all() {
        let state = test_state(BackgroundPlatform::Ios, BackgroundSource::Ios);
        let runner = FakeRunner::none();
        for _ in 0..3 {
            state
                .perform_run_now(
                    &RunNowRequest {
                        scope: None,
                        force_synthetic: None,
                    },
                    &runner,
                )
                .expect("runNow 失败");
        }
        let first = state.consume_events(Some(2), None).expect("消费失败");
        assert_eq!(first.events.len(), 2);
        assert_eq!(first.remaining, 1);
        let second = state.consume_events(Some(5), None).expect("消费失败");
        assert_eq!(second.events.len(), 1);
        assert_eq!(second.remaining, 0);
    }

    #[test]
    fn clear_context_by_scope_removes_all() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        state
            .sync_context(&BackgroundContext {
                schema: BG_SCHEMA_VERSION,
                scope: "2024010101".to_string(),
                business: vec!["grades".to_string()],
                updated_at: now_rfc3339(),
            })
            .expect("sync_context 失败");
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: Some(true),
                },
                &FakeRunner::none(),
            )
            .expect("runNow 失败");

        let result = state.clear_context(&None).expect("清理失败");
        assert!(result.cleared);
        assert_eq!(result.removed_events, 1);
        let s = state.get_state();
        assert!(s.scope.is_none());
        assert_eq!(s.pending_events, 0);
        // 落盘也清理（重新加载验证）
        let reloaded = PluginState::load(
            state.inner().store.clone(),
            BackgroundPlatform::Android,
            BackgroundSource::Android,
        );
        assert!(reloaded.get_state().scope.is_none());
        assert_eq!(reloaded.inner().events.len(), 0);
        assert!(reloaded.inner().context.is_none());
    }

    #[test]
    fn clear_context_explicit_scope_noop_when_no_match() {
        let state = test_state(BackgroundPlatform::Desktop, BackgroundSource::Rust);
        state.configure(&sample_config(true)).expect("配置失败");
        let result = state
            .clear_context(&Some("other-account".to_string()))
            .expect("清理失败");
        assert!(!result.cleared, "不匹配 scope 应为 no-op");
        assert_eq!(state.get_state().scope.as_deref(), Some("2024010101"));
    }

    /// #614：peek 只读不删——完整同步失败场景下事件必须保留（at-least-once 消费前提）。
    #[test]
    fn peek_events_does_not_remove() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        let runner = FakeRunner::none();
        for _ in 0..2 {
            state
                .perform_run_now(
                    &RunNowRequest {
                        scope: None,
                        force_synthetic: None,
                    },
                    &runner,
                )
                .expect("runNow 失败");
        }
        let peek = state.peek_events(None).expect("peek 失败");
        assert_eq!(peek.events.len(), 2, "peek 必须返回全部事件");
        assert_eq!(peek.remaining, 0);
        // peek 后 inbox 不变：仍可再次 peek 与消费
        let peek2 = state.peek_events(None).expect("peek 失败");
        assert_eq!(peek2.events.len(), 2);
        assert_eq!(state.get_state().pending_events, 2);
        let result = state.consume_events(None, None).expect("消费失败");
        assert_eq!(result.events.len(), 2, "peek 不得影响后续消费");
    }

    /// #614：peek 的 limit 语义——只读前 N 条，remaining 为未读取数量。
    #[test]
    fn peek_events_limit_reads_prefix_only() {
        let state = test_state(BackgroundPlatform::Ios, BackgroundSource::Ios);
        let runner = FakeRunner::none();
        for _ in 0..3 {
            state
                .perform_run_now(
                    &RunNowRequest {
                        scope: None,
                        force_synthetic: None,
                    },
                    &runner,
                )
                .expect("runNow 失败");
        }
        let peek = state.peek_events(Some(1)).expect("peek 失败");
        assert_eq!(peek.events.len(), 1);
        assert_eq!(peek.remaining, 2, "remaining 应为未读取数量");
        // 前 N 条事件与 FIFO 消费顺序一致（避免「peek A 后 ack 到 B」的错删）
        let first = peek.events[0].clone();
        let consumed = state.consume_events(None, None).expect("消费失败");
        assert_eq!(consumed.events[0].id, first.id);
    }

    /// #614：consume 显式 ids 时只删除匹配事件（精确 ack），其他事件保留。
    #[test]
    fn consume_events_by_ids_acks_only_matching() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        state
            .inner()
            .store
            .append_event(BackgroundEvent {
                schema: BG_SCHEMA_VERSION,
                id: "evt-a".to_string(),
                source: BackgroundSource::Android,
                kind: "grades_changed".to_string(),
                scope: Some("account-1".to_string()),
                occurred_at: now_rfc3339(),
                payload: serde_json::json!({"signature": "S2"}),
            })
            .expect("写盘失败");
        state
            .inner()
            .store
            .append_event(BackgroundEvent {
                schema: BG_SCHEMA_VERSION,
                id: "evt-b".to_string(),
                source: BackgroundSource::Android,
                kind: "grades_changed".to_string(),
                scope: Some("account-2".to_string()),
                occurred_at: now_rfc3339(),
                payload: serde_json::json!({"signature": "S3"}),
            })
            .expect("写盘失败");

        // 只 ack evt-a：evt-b（其他 scope）必须保留
        let result = state
            .consume_events(None, Some(vec!["evt-a".to_string()]))
            .expect("消费失败");
        assert_eq!(result.events.len(), 1);
        assert_eq!(result.events[0].id, "evt-a");
        assert_eq!(result.remaining, 1);
        let leftover = state.peek_events(None).expect("peek 失败");
        assert_eq!(leftover.events.len(), 1);
        assert_eq!(leftover.events[0].id, "evt-b", "非目标事件不得被误删");
    }

    /// #614：consume 显式空 ids 为 no-op（防止「空列表 = 全删」意外语义）。
    #[test]
    fn consume_events_empty_ids_is_noop() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        let runner = FakeRunner::none();
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: None,
                },
                &runner,
            )
            .expect("runNow 失败");
        let result = state
            .consume_events(None, Some(Vec::new()))
            .expect("消费失败");
        assert_eq!(result.events.len(), 0);
        assert_eq!(result.remaining, 1, "空 ids 不得删除任何事件");
        assert_eq!(state.get_state().pending_events, 1);
    }

    /// #614：ids 中不存在的 id 被忽略，不报错（幂等 ack）。
    #[test]
    fn consume_events_by_ids_tolerates_unknown_ids() {
        let state = test_state(BackgroundPlatform::Android, BackgroundSource::Android);
        state.configure(&sample_config(true)).expect("配置失败");
        let runner = FakeRunner::none();
        state
            .perform_run_now(
                &RunNowRequest {
                    scope: None,
                    force_synthetic: None,
                },
                &runner,
            )
            .expect("runNow 失败");
        let result = state
            .consume_events(None, Some(vec!["no-such-id".to_string()]))
            .expect("消费失败");
        assert_eq!(result.events.len(), 0, "未知 id 不得误删事件");
        assert_eq!(result.remaining, 1);
    }
}
