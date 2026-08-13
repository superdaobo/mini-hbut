// GradesCheckCoordinator —— 后台成绩变化检查编排状态机（#613 核心）。
//
// 一次执行的语义（与 issue 验收一致）：
//   disabled/未配置        -> 快速 no-op 完成（handler 收到历史 pending 也不执行业务）
//   无安全材料（Keychain）  -> authUnavailable：安全停止，不后台交互式重登录
//   无网/临时错误           -> networkUnavailable：本次正确结束，由系统未来再调度
//   401/403                -> authExpired：记录状态，等待前台恢复会话
//   parse 失败             -> 不更新 baseline、不误报
//   首次成功               -> 只建立 baseline，不通知历史成绩
//   相同 signature         -> 更新 lastSuccessAt，无事件无通知（幂等，不重复弹）
//   signature 变化         -> 一次 grades_changed event + 一次本地通知 + 更新 baseline
//   通知权限关闭           -> 业务仍算成功，notificationShown=false，不算网络错误
//
// 账号隔离：baseline/event/envelope 全部带 scope；切换账号后旧数据不污染新账号。
// 运行来源：runNow(manual) 与系统 BGTask(system) 复用同一核心，event 记录 runSource 区分。

import Foundation

/// 单次检查结果（状态机输出，非敏感）。
public enum CheckOutcome: Equatable {
    case disabled
    case notConfigured
    case authUnavailable
    case networkUnavailable
    case authExpired
    case parseError
    case cancelled
    case baselineEstablished
    case noChange
    case changed(notificationShown: Bool)
    case busy
}

/// 运行来源：system = 系统 BGAppRefresh；manual = 用户 runNow 手动触发。
public enum CheckRunSource: String {
    case system
    case manual
}

/// 通知授权状态（后台任务只能读取，不在后台弹窗请求权限）。
public enum NotificationAuthorization: Equatable {
    case authorized
    case provisional
    case denied
    case notDetermined
    case unknown
}

/// 通知抽象（测试注入 mock；真机为 UNUserNotificationCenter 实现）。
public protocol NotificationPosting {
    func authorizationStatus(completion: @escaping (NotificationAuthorization) -> Void)
    /// 发出本地通知；completion 的 Bool 表示是否成功展示（权限关闭时返回 false，不算错误）。
    func post(title: String, body: String, userInfo: [String: String], completion: @escaping (Bool) -> Void)
}

/// 安全材料提供抽象（测试注入 mock；真机为 Keychain SecureStore）。
public protocol SecureEnvelopeProviding {
    func load(scope: String) -> SecureEnvelope?
}

/// 后台成绩检查协调器（线程安全：同一时间只允许一次检查）。
public final class GradesCheckCoordinator {

    /// 本地通知文案（#613 契约：不写完整成绩明细/敏感响应）。
    public static let notificationTitle = "成绩有更新"
    public static let notificationBody = "检测到成绩变化，请打开 Mini-HBUT 查看详情"
    public static let notificationTargetView = "grades"

    private let store: BackgroundStore
    private let secureStore: SecureEnvelopeProviding
    private let fetcher: GradeFetching
    private let notifier: NotificationPosting
    private let now: () -> String

    private let lock = NSLock()
    private var running = false
    private var eventSeq: UInt64 = 0

    public init(
        store: BackgroundStore,
        secureStore: SecureEnvelopeProviding,
        fetcher: GradeFetching,
        notifier: NotificationPosting,
        now: @escaping () -> String = { "\(Int(Date().timeIntervalSince1970))Z" }
    ) {
        self.store = store
        self.secureStore = secureStore
        self.fetcher = fetcher
        self.notifier = notifier
        self.now = now
    }

    // MARK: - 入口

    /// 执行一次成绩变化检查；completion 必然被调用（幂等、可重复调用）。
    public func runOnce(source: CheckRunSource, completion: @escaping (CheckOutcome) -> Void) {
        lock.lock()
        if running {
            lock.unlock()
            completion(.busy)
            return
        }
        running = true
        lock.unlock()

        // 1) feature 关闭：快速 no-op（不触发任何网络/通知）。
        let config = store.loadConfig()
        guard config.enabled else {
            finish(.disabled, completion: completion)
            return
        }
        // 2) context 未配置或业务不含成绩。
        guard let context = store.loadContext(),
              !context.scope.isEmpty,
              context.business.contains("grades") else {
            finish(.notConfigured, completion: completion)
            return
        }
        // 3) 安全材料不可用：安全停止，等待前台恢复会话（#608 红线：不在后台完整重登录）。
        guard let envelope = secureStore.load(scope: context.scope) else {
            finish(.authUnavailable, completion: completion)
            return
        }

        // 4) 最小 HTTP 检查（单次请求，无长重试循环）。
        fetcher.fetchGrades(envelope: envelope) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                switch error {
                case .networkUnavailable(let m):
                    self.updateState(error: m)
                    self.finish(.networkUnavailable, completion: completion)
                case .authExpired(let m):
                    self.updateState(error: m)
                    self.finish(.authExpired, completion: completion)
                case .httpStatus(let code):
                    self.updateState(error: "HTTP 状态异常: \(code)")
                    self.finish(.networkUnavailable, completion: completion)
                case .parse(let m):
                    // 解析失败：不更新 baseline、不误报，记录非敏感摘要。
                    self.updateState(error: m)
                    self.finish(.parseError, completion: completion)
                case .cancelled:
                    self.finish(.cancelled, completion: completion)
                }
            case .success(let records):
                self.handleFetched(records: records, source: source, scope: context.scope, completion: completion)
            }
        }
    }

    /// 取消进行中的检查（BGTask expiration handler 调用）。
    /// 复位 running，避免 cancel 后（completion 不再回调）后续 run 永久 busy。
    public func cancel() {
        fetcher.cancel()
        lock.lock()
        running = false
        lock.unlock()
    }

    // MARK: - 内部

    /// 拿到成绩数据后：signature -> baseline diff -> event/通知。
    private func handleFetched(
        records: [GradeRecord],
        source: CheckRunSource,
        scope: String,
        completion: @escaping (CheckOutcome) -> Void
    ) {
        let signature = GradeSignatureV1.compute(records: records)
        let occurredAt = now()

        // 空数据是合法状态（如新学期暂无成绩）：允许建立空 baseline；
        // 有记录但全部无法标准化 -> 视为数据异常，不更新 baseline、不误报。
        if signature.isEmpty && !records.isEmpty {
            updateState(error: "成绩数据无法标准化（全部记录无效）")
            finish(.parseError, completion: completion)
            return
        }

        let previous = store.loadGradesBaseline(scope: scope)
        if let previous = previous, previous.signature == signature {
            // 相同：更新 baseline 时间戳（lastSuccessAt 语义），无事件无通知。
            try? store.setGradesBaseline(signature: signature, scope: scope, updatedAt: occurredAt)
            updateState()
            finish(.noChange, completion: completion)
            return
        }

        // 无 baseline：首次成功检查，只建立基线，不通知历史成绩。
        if previous == nil {
            try? store.setGradesBaseline(signature: signature, scope: scope, updatedAt: occurredAt)
            updateState()
            finish(.baselineEstablished, completion: completion)
            return
        }

        // 变化：写一次 event + 更新 baseline（先落盘保证幂等），随后同步提交通知
        // （授权状态短等待，后台任务预算内；权限关闭不算业务失败）。
        do {
            let event = makeEvent(source: source, scope: scope, occurredAt: occurredAt, notificationShown: false)
            try store.appendEvent(event)
        } catch {
            // 事件写入失败不阻塞 baseline 更新（diff 语义优先），记录摘要。
            updateState(error: "事件写入失败: \(error.localizedDescription)")
        }
        try? store.setGradesBaseline(signature: signature, scope: scope, updatedAt: occurredAt)
        updateState()
        let shown = submitNotificationSynchronously()
        finish(.changed(notificationShown: shown), completion: completion)
    }

    /// 构造 grades_changed 事件（payload 带 runSource 区分 system/manual）。
    private func makeEvent(source: CheckRunSource, scope: String, occurredAt: String, notificationShown: Bool) -> BackgroundEvent {
        lock.lock()
        eventSeq += 1
        let seq = eventSeq
        lock.unlock()
        // 毫秒级时间戳 + 实例内自增 seq（与 Rust new_event_id 语义一致）。
        let millis = Int(Date().timeIntervalSince1970 * 1000)
        return BackgroundEvent(
            id: "evt-\(millis)-\(seq)",
            source: .ios,
            kind: "grades_changed",
            scope: scope,
            occurredAt: occurredAt,
            payload: [
                "runSource": .string(source.rawValue),
                "targetView": .string(Self.notificationTargetView),
                "notificationShown": .bool(notificationShown),
                "baselineUpdated": .bool(true),
            ]
        )
    }

    /// 同步提交本地通知：短等待授权状态（后台任务预算内）；
    /// 权限关闭/未决定时业务仍成功，仅标记未展示。
    private func submitNotificationSynchronously() -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var submitted = false
        notifier.authorizationStatus { [weak self] status in
            guard let self = self else {
                semaphore.signal()
                return
            }
            switch status {
            case .authorized, .provisional:
                self.notifier.post(
                    title: Self.notificationTitle,
                    body: Self.notificationBody,
                    userInfo: ["targetView": Self.notificationTargetView, "source": "ios-bg-app-refresh"]
                ) { ok in
                    submitted = ok
                    semaphore.signal()
                }
            case .denied, .notDetermined, .unknown:
                // 权限关闭/未决定：不弹窗（后台无法交互请求权限），业务仍成功。
                semaphore.signal()
            }
        }
        _ = semaphore.wait(timeout: .now() + 3)
        return submitted
    }

    /// 更新统一状态（lastRunAt/lastRunOk/pendingEvents/error）。
    private func updateState(error: String? = nil) {
        do {
            let store = self.store
            let base = store.loadState()
                ?? BackgroundCheckState.initial(platform: .ios, source: .ios)
            let updated = BackgroundCheckState(
                platform: .ios,
                source: .ios,
                enabled: store.loadConfig().enabled,
                configured: true,
                scope: base.scope ?? store.loadContext()?.scope,
                lastRunAt: now(),
                lastRunOk: error == nil,
                pendingEvents: store.loadEvents().count,
                error: error
            )
            try store.saveState(updated)
        } catch {
            // 状态写入失败不影响任务完成语义。
        }
    }

    private func finish(_ outcome: CheckOutcome, completion: @escaping (CheckOutcome) -> Void) {
        lock.lock()
        running = false
        lock.unlock()
        completion(outcome)
    }
}
