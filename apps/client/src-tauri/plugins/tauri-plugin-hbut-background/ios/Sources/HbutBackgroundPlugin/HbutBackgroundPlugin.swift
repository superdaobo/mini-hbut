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
    /// #615：handler 内按优先级顺序执行成绩 -> 考试变化 -> 学校消息（预算内）。
    public static func registerBackgroundTask() {
        let grades = sharedGradesCoordinator(for: BackgroundStoreFactory.defaultDir())
        let exams = sharedExamsCoordinator(for: BackgroundStoreFactory.defaultDir())
        let school = sharedSchoolCoordinator(for: BackgroundStoreFactory.defaultDir())
        let runner = BusinessChecksRunner(units: [
            BusinessCheckUnit(
                name: "grades",
                run: { source, done in grades.runOnce(source: source) { done(UnitOutcomeText.grades($0)) } },
                cancel: { grades.cancel() }
            ),
            BusinessCheckUnit(
                name: "exams",
                run: { source, done in exams.runOnce(source: source) { done(UnitOutcomeText.exams($0)) } },
                cancel: { exams.cancel() }
            ),
            BusinessCheckUnit(
                name: "school",
                run: { source, done in school.runOnce(source: source) { done(UnitOutcomeText.school($0)) } },
                cancel: { school.cancel() }
            ),
        ])
        BackgroundTaskScheduler.register(runner: runner)
        // launch 时修复缺失调度（enabled 但无 pending request）
        BackgroundTaskScheduler.repairSchedule(storeDir: BackgroundStoreFactory.defaultDir())
    }

    // MARK: - 共享协调器（按 store 目录缓存；同目录并发检查互斥）

    private static let coordinatorsLock = NSLock()
    private static var gradesCoordinators: [URL: GradesCheckCoordinator] = [:]
    private static var examsCoordinators: [URL: ExamsCheckCoordinator] = [:]
    private static var schoolCoordinators: [URL: SchoolInboxCheckCoordinator] = [:]

    /// 获取（或惰性创建）指定目录的成绩协调器实例。
    public static func sharedGradesCoordinator(for dir: URL) -> GradesCheckCoordinator {
        coordinatorsLock.lock()
        defer { coordinatorsLock.unlock() }
        if let existing = gradesCoordinators[dir] {
            return existing
        }
        let store = BackgroundStoreFactory.store(dir: dir)
        let coordinator = GradesCheckCoordinator(
            store: store,
            secureStore: SecureStore(),
            fetcher: URLSessionGradesFetcher(),
            notifier: LocalNotificationPoster()
        )
        gradesCoordinators[dir] = coordinator
        return coordinator
    }

    /// #615：获取（或惰性创建）指定目录的考试变化协调器实例。
    public static func sharedExamsCoordinator(for dir: URL) -> ExamsCheckCoordinator {
        coordinatorsLock.lock()
        defer { coordinatorsLock.unlock() }
        if let existing = examsCoordinators[dir] {
            return existing
        }
        let store = BackgroundStoreFactory.store(dir: dir)
        let baselineStore = try? BusinessBaselineStore(dir: dir)
        let coordinator = ExamsCheckCoordinator(
            store: store,
            baselineStore: baselineStore ?? BusinessBaselineStoreFactory.fallback(),
            secureStore: SecureStore(),
            fetcher: URLSessionExamsFetcher(),
            notifier: LocalNotificationPoster()
        )
        examsCoordinators[dir] = coordinator
        return coordinator
    }

    /// #615：获取（或惰性创建）指定目录的学校消息协调器实例。
    public static func sharedSchoolCoordinator(for dir: URL) -> SchoolInboxCheckCoordinator {
        coordinatorsLock.lock()
        defer { coordinatorsLock.unlock() }
        if let existing = schoolCoordinators[dir] {
            return existing
        }
        let store = BackgroundStoreFactory.store(dir: dir)
        let baselineStore = try? BusinessBaselineStore(dir: dir)
        let coordinator = SchoolInboxCheckCoordinator(
            store: store,
            baselineStore: baselineStore ?? BusinessBaselineStoreFactory.fallback(),
            secureStore: SecureStore(),
            fetcher: URLSessionSchoolInboxFetcher(),
            notifier: LocalNotificationPoster()
        )
        schoolCoordinators[dir] = coordinator
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

            // 真实手动 run：与系统 BGTask 共用同一协调器（同目录互斥），
            // #615：顺序执行成绩 -> 考试变化 -> 学校消息（预算内，失败隔离）。
            let grades = sharedGradesCoordinator(for: storeDir)
            let exams = sharedExamsCoordinator(for: storeDir)
            let school = sharedSchoolCoordinator(for: storeDir)
            return try runRealUnits(grades: grades, exams: exams, school: school)
        } catch {
            return (try? encode(RunSummary.failed("Swift runNow 失败: \(error.localizedDescription)")))
                ?? #"{"ok":false,"synthetic":false,"eventsProduced":0,"message":"Swift runNow 失败"}"#
        }
    }

    /// 真实检查：三个 check unit 顺序执行（各 30s 兜底等待），聚合为 RunSummary。
    private static func runRealUnits(
        grades: GradesCheckCoordinator,
        exams: ExamsCheckCoordinator,
        school: SchoolInboxCheckCoordinator
    ) throws -> String {
        var summary = BusinessRunSummary()

        // 1. 成绩（#613 既有语义）
        let gradesOutcome = waitOutcome(timeout: 30) { done in
            grades.runOnce(source: .manual) { done($0) }
        } ?? .busy
        // 2. 考试变化（#615 Part A）
        let examsOutcome = waitOutcome(timeout: 30) { done in
            exams.runOnce(source: .manual) { done($0) }
        } ?? .busy
        // 3. 学校消息（#615 Part B）
        let schoolOutcome = waitOutcome(timeout: 30) { done in
            school.runOnce(source: .manual) { done($0) }
        } ?? .busy

        var messages: [String] = []
        var failed = false

        switch gradesOutcome {
        case .changed(let shown): messages.append("成绩变化已通知（\(shown ? "已展示" : "未展示")）")
        case .baselineEstablished: messages.append("成绩：首次执行已建立 baseline")
        case .noChange: messages.append("成绩无变化")
        case .networkUnavailable: failed = true; messages.append("成绩网络不可用")
        case .authExpired: failed = true; messages.append("成绩会话过期")
        case .authUnavailable: failed = true; messages.append("成绩认证材料不可用")
        case .parseError: failed = true; messages.append("成绩解析失败")
        case .disabled: messages.append("成绩：功能关闭")
        case .notConfigured: messages.append("成绩：未配置")
        case .cancelled: failed = true; messages.append("成绩检查被取消")
        case .busy: failed = true; messages.append("成绩检查忙")
        }

        switch examsOutcome {
        case .changed(let shown): summary.eventsProduced += 1; messages.append("考试安排变化已通知（\(shown ? "已展示" : "未展示")）")
        case .baselineEstablished: messages.append("考试：首次执行已建立 baseline")
        case .noChange: messages.append("考试安排无变化")
        case .networkUnavailable: failed = true; messages.append("考试网络不可用")
        case .authExpired: failed = true; messages.append("考试会话过期")
        case .authUnavailable: failed = true; messages.append("考试认证材料不可用")
        case .parseError: failed = true; messages.append("考试解析失败")
        case .disabled: messages.append("考试：功能关闭")
        case .notConfigured: messages.append("考试：未配置")
        case .cancelled: failed = true; messages.append("考试检查被取消")
        case .busy: failed = true; messages.append("考试检查忙")
        }

        switch schoolOutcome {
        case .changed(let count, let shown): summary.eventsProduced += count; messages.append("新学校消息 \(count) 条已通知（\(shown ? "已展示" : "未展示")）")
        case .baselineEstablished: messages.append("学校消息：首次执行已建立 known-ID baseline")
        case .noNewMessages: messages.append("学校消息无新消息")
        case .unsupported(let m): failed = true; messages.append("学校消息后台检测不可用: \(m)")
        case .networkUnavailable: failed = true; messages.append("学校消息网络不可用")
        case .authExpired: failed = true; messages.append("学校消息会话过期")
        case .authUnavailable: failed = true; messages.append("学校消息认证材料不可用")
        case .parseError: failed = true; messages.append("学校消息解析失败")
        case .disabled: messages.append("学校消息：功能关闭")
        case .notConfigured: messages.append("学校消息：未配置")
        case .cancelled: failed = true; messages.append("学校消息检查被取消")
        case .busy: failed = true; messages.append("学校消息检查忙")
        }

        let text = messages.joined(separator: "；")
        if failed {
            return try encode(RunSummary.failed(text.isEmpty ? "全部 check unit 未执行" : text))
        }
        return try encode(RunSummary(ok: true, synthetic: false, eventsProduced: summary.eventsProduced, message: text.isEmpty ? "全部 check unit 无业务输出" : text))
    }

    /// 等待一次异步检查完成（超时后 cancel 并返回 cancelled 语义）。
    private static func waitOutcome<T>(
        timeout: TimeInterval,
        run: @escaping (@escaping (T) -> Void) -> Void
    ) -> T? {
        let semaphore = DispatchSemaphore(value: 0)
        var result: T?
        run { value in
            result = value
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + timeout)
        return result
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
            // #615：考试/学校消息扩展 baseline 同样按 scope 清理（账号隔离）。
            let businessCleared = (try? BusinessBaselineStore(dir: storeDir))?.clearScope(target) ?? false
            // 安全材料同步清理（Keychain 按 scope 隔离）。
            let secureCleared = SecureStore().delete(scope: target)
            return try encode(ClearContextResult(
                cleared: cleared || businessCleared || secureCleared,
                removedEvents: removed
            ))
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
