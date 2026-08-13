// BackgroundTaskScheduler —— BGAppRefresh 注册/调度/启停（#613）。
//
// 生命周期契约（issue 要求）：
//   App 初始化
//   → register() 注册唯一 task identifier/handler（应用启动生命周期内，不依赖 Vue mounted）
//   → 用户启用后台检查且 context ready → scheduleNext() 提交 BGAppRefreshTaskRequest
//   → 系统未来允许执行 → handler 收到任务
//       → 尽早 schedule 下一次（防缺失调度）
//       → 检查 config.enabled：disabled 则快速 no-op 完成（历史 pending 不执行业务）
//       → 执行最小成绩检查（GradesCheckCoordinator）
//       → setTaskCompleted(ok)
//   → expiration handler：取消进行中工作并保证 completion 语义（每个 task 只完成一次）
//
// 调度语义：
//   - earliestBeginDate 只是最早偏好，不转化为 UI「下次精确执行时间」（#608 红线 6）；
//   - enable 后提交 request；disable 取消 pending request 并阻止业务；
//   - App launch/resume 时 repairSchedule 修复缺失调度；
//   - 重复 schedule 不产生重复 pending：提交前先 cancel 同 identifier（幂等）。

import Foundation
import BackgroundTasks

/// BGAppRefresh 调度器（iOS 13+；Windows 无法编译，代码级契约载体）。
public enum BackgroundTaskScheduler {

    /// 唯一 BGAppRefresh identifier（必须写入 BGTaskSchedulerPermittedIdentifiers）。
    public static let taskIdentifier = "com.hbut.mini.background.grades-refresh"

    /// earliestBeginDate 偏好下限（分钟）：iOS 对极短间隔无承诺，太短无意义。
    public static let minIntervalMinutes: Double = 5
    /// 偏好上限（分钟）：超过视为每日一次级别。
    public static let maxIntervalMinutes: Double = 1440

    // MARK: - 注册（应用启动生命周期内调用，幂等）

    private static let registerLock = NSLock()
    private static var registered = false

    /// 注册唯一 BGAppRefresh identifier 与 handler。
    /// 必须在 didFinishLaunching 早期调用（不依赖 Vue/WebView 加载完成）；
    /// 重复调用安全（幂等）。
    public static func register(coordinator: GradesCheckCoordinator) {
        // #615：兼容入口——单 unit runner（仅成绩），等价于旧行为。
        let runner = BusinessChecksRunner(units: [
            BusinessCheckUnit(
                name: "grades",
                run: { source, done in
                    coordinator.runOnce(source: source) { done(UnitOutcomeText.grades($0)) }
                },
                cancel: { coordinator.cancel() }
            )
        ])
        register(runner: runner)
    }

    /// #615：注册多 check unit runner（成绩 -> 考试变化 -> 学校消息，预算优先）。
    public static func register(runner: BusinessChecksRunner) {
        registerLock.lock()
        if registered {
            registerLock.unlock()
            return
        }
        registered = true
        registerLock.unlock()

        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: nil
        ) { task in
            handle(task: task, runner: runner)
        }
    }

    /// 已注册标志（测试/诊断用）。
    public static func isRegistered() -> Bool {
        registerLock.lock()
        defer { registerLock.unlock() }
        return registered
    }

    /// handler 核心：expiration 语义 + 尽早重调度 + enabled 检查 + 最小检查（多 unit 预算内）。
    private static func handle(task: BGTask, runner: BusinessChecksRunner) {
        guard let refreshTask = task as? BGAppRefreshTask else {
            task.setTaskCompleted(success: false)
            return
        }
        let completer = TaskCompleter()
        // expiration：取消进行中工作并保证 completion 语义（每个 task 只完成一次）。
        refreshTask.expirationHandler = {
            runner.cancel()
            completer.complete(refreshTask, success: false)
        }
        // 尽早安排下一次，避免本任务消耗系统预算后留下空窗。
        scheduleNext(storeDir: BackgroundStoreFactory.defaultDir())

        let store = BackgroundStoreFactory.store(dir: BackgroundStoreFactory.defaultDir())
        guard store.loadConfig().enabled else {
            // feature disabled：历史 pending 被系统调用时快速 no-op 完成。
            completer.complete(refreshTask, success: true)
            return
        }
        // #615：顺序执行成绩/考试变化/学校消息（预算优先；各 unit 独立失败隔离）。
        // 业务级失败（network/auth/parse/unsupported）已写入各 unit 状态，按系统语义
        // 正常完成本任务（等待未来调度）；真正的任务失败（expiration 打断）由
        // expirationHandler 以 success=false 完成（TaskCompleter 保证只完成一次）。
        runner.runAll(source: .system) { _ in
            completer.complete(refreshTask, success: true)
        }
    }

    // MARK: - 调度决策（纯逻辑，可单测）

    /// 是否应提交 request：enabled 且 context ready（grades 业务已配置）。
    public static func shouldSchedule(enabled: Bool, contextReady: Bool) -> Bool {
        enabled && contextReady
    }

    /// 归一化调度偏好（分钟）：nil 用默认 30；clamp 到 [min, max]。
    public static func normalizedIntervalMinutes(_ interval: Int?) -> Int {
        let raw = Double(interval ?? 30)
        let clamped = min(max(raw, minIntervalMinutes), maxIntervalMinutes)
        return Int(clamped.rounded())
    }

    /// context 是否 ready（存在且含 grades 业务）。
    public static func contextReady(_ context: BackgroundContext?) -> Bool {
        guard let context = context, !context.scope.isEmpty else { return false }
        return context.business.contains("grades")
    }

    // MARK: - 提交/取消

    /// 提交下一次 BGAppRefresh request（幂等：先 cancel 同 identifier 再 submit）。
    public static func scheduleNext(storeDir: URL) {
        let store = BackgroundStoreFactory.store(dir: storeDir)
        let config = store.loadConfig()
        guard shouldSchedule(enabled: config.enabled, contextReady: contextReady(store.loadContext())) else {
            return
        }
        let interval = normalizedIntervalMinutes(config.intervalMinutes)
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: TimeInterval(interval * 60))
        // 先取消同 identifier 的 pending，保证重复 schedule 不产生逻辑上的重复任务。
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // 提交失败不 crash：系统可能暂时繁忙，等下次 launch/resume 修复。
        }
    }

    /// 取消 pending request（disable 时调用）。
    public static func cancelPending() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskIdentifier)
    }

    /// App launch/resume 时修复缺失调度（enabled 但系统无 pending request）。
    public static func repairSchedule(storeDir: URL) {
        scheduleNext(storeDir: storeDir)
    }
}

/// 每个 task 只允许一次 setTaskCompleted（expiration 与主流程可能竞争）。
final class TaskCompleter {
    private let lock = NSLock()
    private var completed = false

    func complete(_ task: BGTask, success: Bool) {
        lock.lock()
        if completed {
            lock.unlock()
            return
        }
        completed = true
        lock.unlock()
        task.setTaskCompleted(success: success)
    }
}

/// 真机目录工厂：{Application Support}/background（与 Rust/Kotlin store 语义一致）。
/// 单测/骨架阶段使用临时目录，不依赖 Bundle 解析。
public enum BackgroundStoreFactory {
    /// 默认目录：Application Support/background（真机由宿主 App 提供）。
    public static func defaultDir() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("background", isDirectory: true)
    }

    /// 真机构造 store（目录不可用时逐级回退，保证任务能正确结束）。
    public static func store(dir: URL? = nil) -> BackgroundStore {
        var candidates: [URL] = []
        if let dir = dir { candidates.append(dir) }
        candidates.append(defaultDir())
        candidates.append(FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-background-fallback", isDirectory: true))
        for candidate in candidates {
            if let store = try? BackgroundStore(dir: candidate) {
                return store
            }
        }
        // 全部候选不可用意味着 App 容器已不可写，系统也无法维持运行：显式失败。
        fatalError("无法初始化后台存储目录（Application Support 与临时目录均不可用）")
    }
}
