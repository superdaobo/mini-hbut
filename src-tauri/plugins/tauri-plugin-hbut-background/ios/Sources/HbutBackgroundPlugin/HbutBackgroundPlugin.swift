// Swift 插件入口：iOS native 承载（#611 骨架 + #613 BGAppRefresh 成绩检查）。
//
// 生命周期（issue 验收：注册必须发生在应用启动生命周期内，不依赖 Vue mounted）：
//   宿主 App didFinishLaunching → registerBackgroundTask()（注册 BGAppRefresh handler + 修复调度）
//   → 前端 configure/syncContext（enabled 且 context ready 时提交 BGAppRefreshTaskRequest）
//   → 系统执行 → handler → scheduleNext → 最小成绩检查 → setTaskCompleted
//   → disable：取消 pending request + 阻止业务执行（历史 pending no-op）
//
// 桥契约（与 Kotlin HbutBackgroundPlugin 同名同语义，供 Rust mobile.rs ios 分支 FFI 对接）：
//   registerBackgroundTask / configure / disable / syncContext / setSecureEnvelope /
//   runNow / getStateJson / consumeEvents / clearContext —— 均返回 JSON 字符串。
//   Rust 侧接入点见 ios/INTEGRATION.md（#613 交付后由主 Agent 收口 src/** 边界）。

import Foundation

/// iOS 插件入口。
public enum HbutBackgroundPlugin {

    // MARK: - BGAppRefresh 注册（应用启动生命周期内调用，幂等）

    /// 注册唯一 BGAppRefresh identifier/handler 并修复缺失调度。
    /// 必须在 didFinishLaunching 早期调用；重复调用安全。
    public static func registerBackgroundTask() {
        BackgroundTaskScheduler.register(coordinator: sharedCoordinator(for: BackgroundStoreFactory.defaultDir()))
        // launch 时修复缺失调度（enabled 但无 pending request）
        BackgroundTaskScheduler.repairSchedule(storeDir: BackgroundStoreFactory.defaultDir())
    }

    // MARK: - 共享协调器（按 store 目录缓存；同目录并发检查互斥）

    private static let coordinatorsLock = NSLock()
    private static var coordinators: [URL: GradesCheckCoordinator] = [:]

    /// 获取（或惰性创建）指定目录的协调器实例。
    public static func sharedCoordinator(for dir: URL) -> GradesCheckCoordinator {
        coordinatorsLock.lock()
        defer { coordinatorsLock.unlock() }
        if let existing = coordinators[dir] {
            return existing
        }
        let store = BackgroundStoreFactory.store(dir: dir)
        let coordinator = GradesCheckCoordinator(
            store: store,
            secureStore: SecureStore(),
            fetcher: URLSessionGradesFetcher(),
            notifier: LocalNotificationPoster()
        )
        coordinators[dir] = coordinator
        return coordinator
    }

    // MARK: - configure（保存配置；启用时提交调度）

    /// configure：保存 BackgroundConfig JSON（camelCase），enabled 时提交 BGAppRefresh request。
    public static func configure(storeDir: URL, configJson: String) -> String {
        do {
            let store = BackgroundStoreFactory.store(dir: storeDir)
            let config = try decode(BackgroundConfig.self, from: configJson)
            try store.saveConfig(config)
            if config.enabled {
                // 启用时提交 request（context 未 ready 时 scheduleNext 内部跳过，等 syncContext 再补）。
                BackgroundTaskScheduler.scheduleNext(storeDir: storeDir)
            }
            return try encode(config)
        } catch {
            return #"{"schema":1,"error":"configure 失败: \#(error.localizedDescription)"}"#
        }
    }

    // MARK: - disable（取消 pending + 落盘 + 阻止业务）

    /// disable：取消 pending BGAppRefresh request，落盘 enabled=false；
    /// 业务侧由 coordinator 检查 enabled 快速 no-op（历史 pending 不执行业务）。
    public static func disable(storeDir: URL, keepDiagnostics: Bool) -> String {
        do {
            let store = BackgroundStoreFactory.store(dir: storeDir)
            let config = store.loadConfig()
            let updated = BackgroundConfig(
                schema: bgSchemaVersion,
                enabled: false,
                intervalMinutes: config.intervalMinutes,
                business: config.business,
                scope: config.scope
            )
            try store.saveConfig(updated)
            BackgroundTaskScheduler.cancelPending()
            let state = (store.loadState()
                ?? BackgroundCheckState.initial(platform: .ios, source: .ios))
            let stateUpdated = BackgroundCheckState(
                platform: .ios,
                source: .ios,
                enabled: false,
                configured: state.configured,
                scope: state.scope ?? store.loadContext()?.scope,
                lastRunAt: state.lastRunAt,
                lastRunOk: state.lastRunOk,
                pendingEvents: store.loadEvents().count,
                error: state.error
            )
            try store.saveState(stateUpdated)
            // keepDiagnostics 与 Kotlin 桥契约对齐：true 保留诊断状态；当前实现不额外删除诊断数据。
            _ = keepDiagnostics
            return try encode(stateUpdated)
        } catch {
            return (try? encode(RunSummary.failed("Swift disable 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift disable 失败"}"#
        }
    }

    // MARK: - syncContext（保存非敏感上下文；ready 后补调度）

    /// syncContext：保存非敏感 BackgroundContext（scope 必填）；enabled 且 ready 时补提交调度。
    public static func syncContext(storeDir: URL, contextJson: String) -> String {
        do {
            let store = BackgroundStoreFactory.store(dir: storeDir)
            let context = try decode(BackgroundContext.self, from: contextJson)
            guard !context.scope.isEmpty else {
                return #"{"schema":1,"error":"context.scope 不能为空"}"#
            }
            try store.saveContext(context)
            // context 就绪后补一次调度（configure 早于 syncContext 的时序）。
            BackgroundTaskScheduler.scheduleNext(storeDir: storeDir)
            return try encode(context)
        } catch {
            return #"{"schema":1,"error":"syncContext 失败: \#(error.localizedDescription)"}"#
        }
    }

    // MARK: - setSecureEnvelope（安全材料写入 Keychain，由 Rust 会话层 FFI 调用）

    /// 写入安全材料（SecureEnvelope JSON）到 Keychain（按 scope 隔离）。
    /// 只允许 Rust 会话层调用（认证材料不在 JS/普通存储中流转）。
    public static func setSecureEnvelope(storeDir: URL, envelopeJson: String) -> String {
        do {
            let envelope = try decode(SecureEnvelope.self, from: envelopeJson)
            guard !envelope.scope.isEmpty, !envelope.endpoint.isEmpty else {
                return #"{"schema":1,"error":"envelope.scope/endpoint 不能为空"}"#
            }
            try SecureStore().save(envelope)
            return #"{"schema":1,"ok":true,"scope":"\#(envelope.scope)"}"#
        } catch {
            return #"{"schema":1,"error":"setSecureEnvelope 失败: \#(error.localizedDescription)"}"#
        }
    }

    // MARK: - runNow（开发/调试入口：复用同一核心 checker）

    /// runNow：forceSynthetic 走开发态 synthetic 摘要（跨端管道验证，不触网）；
    /// 否则执行真实成绩检查（source=manual，与系统 run 区分），返回 RunSummary JSON。
    public static func runNow(storeDir: URL, scope: String?, forceSynthetic: Bool) -> String {
        let store = BackgroundStoreFactory.store(dir: storeDir)
        do {
            if forceSynthetic {
                let state = (store.loadState()
                    ?? BackgroundCheckState.initial(platform: .ios, source: .ios))
                let updated = BackgroundCheckState(
                    platform: .ios,
                    source: .ios,
                    enabled: store.loadConfig().enabled,
                    configured: true,
                    scope: scope ?? state.scope ?? store.loadContext()?.scope,
                    lastRunAt: nowRfc3339(),
                    lastRunOk: true,
                    pendingEvents: store.loadEvents().count,
                    error: nil
                )
                try store.saveState(updated)
                return try encode(RunSummary.synthetic("开发态强制 synthetic 运行（iOS native）"))
            }

            // 真实手动 run：与系统 BGTask 共用同一 GradesCheckCoordinator（同目录互斥）。
            let coordinator = sharedCoordinator(for: storeDir)
            return try runReal(coordinator: coordinator)
        } catch {
            return (try? encode(RunSummary.failed("Swift runNow 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift runNow 失败"}"#
        }
    }

    /// 真实检查：异步完成，semaphore 等待（fetcher 15s 超时 + 30s 兜底，桥契约同步返回）。
    private static func runReal(coordinator: GradesCheckCoordinator) throws -> String {
        let semaphore = DispatchSemaphore(value: 0)
        var outcome: CheckOutcome = .busy
        coordinator.runOnce(source: .manual) { result in
            outcome = result
            semaphore.signal()
        }
        let waitResult = semaphore.wait(timeout: .now() + 30)
        if waitResult == .timedOut {
            coordinator.cancel()
            return try encode(RunSummary.failed("runNow 超时（检查未在 30s 内完成）"))
        }
        switch outcome {
        case .changed(let shown):
            return try encode(RunSummary(ok: true, synthetic: false, eventsProduced: 1,
                                         message: "检测到成绩变化\(shown ? "（已通知）" : "（通知未展示）")"))
        case .baselineEstablished:
            return try encode(RunSummary(ok: true, synthetic: false, eventsProduced: 0,
                                         message: "首次检查：已建立 baseline，不通知历史成绩"))
        case .noChange:
            return try encode(RunSummary(ok: true, synthetic: false, eventsProduced: 0,
                                         message: "无成绩变化"))
        case .disabled:
            return try encode(RunSummary(ok: true, synthetic: false, eventsProduced: 0,
                                         message: "后台检查未启用"))
        case .notConfigured:
            return try encode(RunSummary(ok: true, synthetic: false, eventsProduced: 0,
                                         message: "未配置成绩后台检查"))
        case .authUnavailable:
            return try encode(RunSummary.failed("后台认证材料不可用（等待前台恢复会话后重试）"))
        case .networkUnavailable:
            return try encode(RunSummary.failed("网络不可用或临时错误"))
        case .authExpired:
            return try encode(RunSummary.failed("会话/认证过期，请打开 App 重新登录"))
        case .parseError:
            return try encode(RunSummary.failed("成绩数据解析失败（未更新 baseline）"))
        case .cancelled:
            return try encode(RunSummary.failed("检查被取消"))
        case .busy:
            return try encode(RunSummary.failed("已有检查正在进行（系统任务或手动 run 互斥）"))
        }
    }

    // MARK: - getStateJson / consumeEvents / clearContext

    /// getStateJson：返回统一状态 JSON（真实 iOS 平台/来源，不伪造 ready）。
    public static func getStateJson(storeDir: URL) -> String {
        do {
            let store = BackgroundStoreFactory.store(dir: storeDir)
            let base = store.loadState()
                ?? BackgroundCheckState.initial(platform: .ios, source: .ios)
            let state = BackgroundCheckState(
                platform: .ios,
                source: .ios,
                enabled: store.loadConfig().enabled,
                configured: true,
                scope: base.scope ?? store.loadContext()?.scope,
                lastRunAt: base.lastRunAt,
                lastRunOk: base.lastRunOk,
                pendingEvents: store.loadEvents().count,
                error: base.error
            )
            return try encode(state)
        } catch {
            return (try? encode(BackgroundCheckState(platform: .ios, source: .ios, error: "getState 失败: \(error.localizedDescription)")))
                ?? #"{"schema":1,"platform":"ios","source":"ios","enabled":false,"configured":false,"scope":null,"lastRunAt":null,"lastRunOk":null,"pendingEvents":0,"error":"getState 失败"}"#
        }
    }

    /// consumeEvents：消费 native inbox（供 Rust/前端拉取）。
    public static func consumeEvents(storeDir: URL, limit: Int?) -> String {
        do {
            let store = BackgroundStoreFactory.store(dir: storeDir)
            return try encode(store.consumeEvents(limit: limit))
        } catch {
            return (try? encode(RunSummary.failed("Swift consumeEvents 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift consumeEvents 失败"}"#
        }
    }

    /// clearContext：按 scope 清理 context/state/events/baseline + Keychain 安全材料（账号切换/退出）。
    public static func clearContext(storeDir: URL, scope: String?) -> String {
        do {
            let store = BackgroundStoreFactory.store(dir: storeDir)
            let target = scope ?? store.loadState()?.scope ?? store.loadContext()?.scope
            guard let target = target else {
                return #"{"schema":1,"cleared":false,"removedEvents":0}"#
            }
            let (cleared, removed) = try store.clearScope(target)
            // 安全材料同步清理（Keychain 按 scope 隔离）。
            let secureCleared = SecureStore().delete(scope: target)
            return try encode(["schema": 1, "cleared": cleared || secureCleared, "removedEvents": removed])
        } catch {
            return (try? encode(RunSummary.failed("Swift clearContext 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift clearContext 失败"}"#
        }
    }

    // MARK: - 工具

    private static func decode<T: Decodable>(_ type: T.Type, from json: String) throws -> T {
        guard let data = json.data(using: .utf8) else {
            throw StoreError.read("入参不是合法 UTF-8")
        }
        return try JSONDecoder().decode(type, from: data)
    }

    private static func encode<T: Encodable>(_ value: T) throws -> String {
        let data = try JSONEncoder().encode(value)
        guard let text = String(data: data, encoding: .utf8) else {
            throw StoreError.write("JSON 编码结果非 UTF-8")
        }
        return text
    }

    /// RFC3339 简化格式（秒级 UTC，与 Rust now_rfc3339 语义一致）。
    public static func nowRfc3339() -> String {
        "\(Int(Date().timeIntervalSince1970))Z"
    }
}
