// SchoolInboxCheckCoordinator —— 后台学校消息检查编排状态机（#615 Part B 核心）。
//
// 一次执行的语义（保持 #23/#201 产品语义）：
//   disabled/未配置        -> 快速 no-op 完成
//   无安全材料（Keychain）  -> authUnavailable：安全停止，不后台交互式重登录
//   provider 后台不可用    -> unsupported：诚实标记（不静默假成功，不算网络错误）
//   无网/临时错误           -> networkUnavailable
//   401/403                -> authExpired：等待前台恢复会话
//   首次成功               -> 只建立 known-ID baseline，不批量推历史消息（#23/#201）
//   新到且未读的消息        -> 每条一个 school_message event + 一次本地通知；更新 knownIds
//   已知/已读消息           -> 不通知（knownIds 持久化 + notifiedKeys 兜底去重）
//   通知权限关闭           -> 业务仍算成功，notificationShown=false
//
// 账号隔离：knownIds/event 全部带 scope；不同 provider/account 不串数据
// （ID 带 provider 前缀）。事件不保存完整正文（meta 仅短 title，有长度上限）。

import Foundation

/// 单次检查结果（状态机输出，非敏感）。
public enum SchoolInboxCheckOutcome: Equatable {
    case disabled
    case notConfigured
    case authUnavailable
    case unsupported(String)
    case networkUnavailable
    case authExpired
    case parseError
    case cancelled
    case baselineEstablished
    case noNewMessages
    case changed(eventCount: Int, notificationShown: Bool)
    case busy
}

/// 后台学校消息检查协调器（线程安全：同一时间只允许一次检查）。
public final class SchoolInboxCheckCoordinator {

    /// 通知文案与目标 view（不写完整正文）。
    public static let notificationTitle = "新学校消息"
    public static let notificationTargetView = "school_inbox"
    /// 事件 meta 中 title 的长度上限（防止正文混入 event store）。
    public static let titleCap = 60

    private let store: BackgroundStore
    private let baselineStore: BusinessBaselineStore
    private let secureStore: SecureEnvelopeProviding
    private let fetcher: SchoolInboxFetching
    private let notifier: NotificationPosting
    private let now: () -> String

    private let lock = NSLock()
    private var running = false
    private var eventSeq: UInt64 = 0

    public init(
        store: BackgroundStore,
        baselineStore: BusinessBaselineStore,
        secureStore: SecureEnvelopeProviding,
        fetcher: SchoolInboxFetching,
        notifier: NotificationPosting,
        now: @escaping () -> String = { "\(Int(Date().timeIntervalSince1970))Z" }
    ) {
        self.store = store
        self.baselineStore = baselineStore
        self.secureStore = secureStore
        self.fetcher = fetcher
        self.notifier = notifier
        self.now = now
    }

    // MARK: - 入口

    /// 执行一次学校消息检查；completion 必然被调用（幂等、可重复调用）。
    public func runOnce(source: CheckRunSource, completion: @escaping (SchoolInboxCheckOutcome) -> Void) {
        lock.lock()
        if running {
            lock.unlock()
            completion(.busy)
            return
        }
        running = true
        lock.unlock()

        // 1) feature 关闭：快速 no-op。
        let config = store.loadConfig()
        guard config.enabled else {
            finish(.disabled, completion: completion)
            return
        }
        // 2) context 未配置或业务不含 school_inbox。
        guard let context = store.loadContext(),
              !context.scope.isEmpty,
              context.business.contains("school_inbox") else {
            finish(.notConfigured, completion: completion)
            return
        }
        // 3) 安全材料不可用：安全停止，等待前台恢复会话。
        guard let envelope = secureStore.load(scope: context.scope) else {
            finish(.authUnavailable, completion: completion)
            return
        }

        // 4) 最小 HTTP 检查（单次请求，无长重试循环）。
        fetcher.fetchInbox(envelope: envelope) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                switch error {
                case .unsupported(let m):
                    // 诚实标记：provider 后台不可用（不是静默假成功，也不污染其他 feature）
                    self.markUnsupported(summary: m, scope: context.scope)
                    self.finish(.unsupported(m), completion: completion)
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
                    self.updateState(error: m)
                    self.finish(.parseError, completion: completion)
                case .cancelled:
                    self.finish(.cancelled, completion: completion)
                }
            case .success(let items):
                self.handleFetched(items: items, source: source, scope: context.scope, completion: completion)
            }
        }
    }

    /// 取消进行中的检查（BGTask expiration handler 调用）。
    public func cancel() {
        fetcher.cancel()
        lock.lock()
        running = false
        lock.unlock()
    }

    // MARK: - 内部

    private func handleFetched(
        items: [SchoolMessageItem],
        source: CheckRunSource,
        scope: String,
        completion: @escaping (SchoolInboxCheckOutcome) -> Void
    ) {
        let occurredAt = now()
        let previous = baselineStore.loadSchoolState(scope: scope)
        let knownSet = Set(previous?.knownIds ?? [])
        let isFirstSync = (previous?.knownIds ?? []).isEmpty
        let allIds = items.map { $0.id }.filter { !$0.isEmpty }
        let cappedIds = Array(allIds.prefix(BusinessBaselineStore.knownIdsCap))

        // 首次成功：只建立 known-ID baseline，不推历史消息（#23/#201 语义）。
        if isFirstSync {
            let entry = SchoolInboxStateEntry(
                knownIds: cappedIds,
                notifiedKeys: [],
                provider: items.first?.provider,
                unsupported: false,
                updatedAt: occurredAt
            )
            try? baselineStore.setSchoolState(entry, scope: scope)
            updateState()
            finish(.baselineEstablished, completion: completion)
            return
        }

        // 新消息：不在 known IDs + 未读 + 未被本端通知过（notifiedKeys 兜底）。
        let notifiedSet = Set(previous?.notifiedKeys ?? [])
        let toNotify = items.filter { item in
            let id = item.id
            return !id.isEmpty && !knownSet.contains(id) && !item.isRead && !notifiedSet.contains(id)
        }

        var shown = false
        for item in toNotify {
            do {
                let event = makeEvent(source: source, scope: scope, item: item, occurredAt: occurredAt, notificationShown: false)
                try store.appendEvent(event)
            } catch {
                updateState(error: "事件写入失败: \(error.localizedDescription)")
            }
        }
        // 通知：逐条提交（权限关闭时业务仍成功，仅标记未展示）。
        if !toNotify.isEmpty {
            shown = submitNotificationsSynchronously(items: toNotify)
        }

        // 更新 knownIds（全量最新，上限 500）+ notifiedKeys（有界）。
        let nextNotified = Array(((previous?.notifiedKeys ?? []) + toNotify.map { $0.id })
            .reduce(into: [String]()) { acc, id in
                if !acc.contains(id) { acc.append(id) }
            }
            .suffix(BusinessBaselineStore.notifiedKeysCap))
        let entry = SchoolInboxStateEntry(
            knownIds: cappedIds,
            notifiedKeys: nextNotified,
            provider: items.first?.provider ?? previous?.provider,
            unsupported: false,
            updatedAt: occurredAt
        )
        try? baselineStore.setSchoolState(entry, scope: scope)
        updateState()
        if toNotify.isEmpty {
            finish(.noNewMessages, completion: completion)
        } else {
            finish(.changed(eventCount: toNotify.count, notificationShown: shown), completion: completion)
        }
    }

    /// provider 不可用：按 scope 记录诚实状态（不写事件、不通知、不算网络错误）。
    private func markUnsupported(summary: String, scope: String) {
        let previous = baselineStore.loadSchoolState(scope: scope)
        let entry = SchoolInboxStateEntry(
            knownIds: previous?.knownIds ?? [],
            notifiedKeys: previous?.notifiedKeys ?? [],
            provider: nil,
            unsupported: true,
            updatedAt: now()
        )
        try? baselineStore.setSchoolState(entry, scope: scope)
        updateState(error: summary)
    }

    /// 构造单条 school_message 事件（不保存完整正文；title 有长度上限）。
    private func makeEvent(
        source: CheckRunSource,
        scope: String,
        item: SchoolMessageItem,
        occurredAt: String,
        notificationShown: Bool
    ) -> BackgroundEvent {
        lock.lock()
        eventSeq += 1
        let seq = eventSeq
        lock.unlock()
        let millis = Int(Date().timeIntervalSince1970 * 1000)
        let title = String(item.title.prefix(Self.titleCap))
        return BackgroundEvent(
            id: "evt-\(millis)-\(seq)",
            source: .ios,
            kind: "school_message",
            scope: scope,
            occurredAt: occurredAt,
            payload: [
                "runSource": .string(source.rawValue),
                "targetView": .string(Self.notificationTargetView),
                "signature": .string(item.id), // eventKey 载体：provider + message ID 的稳定组合
                "notificationShown": .bool(notificationShown),
                "meta": .object([
                    "provider": .string(item.provider),
                    "messageId": .string(item.id),
                    "title": .string(title),
                ]),
            ]
        )
    }

    /// 逐条提交本地通知（短等待授权状态，后台任务预算内；权限关闭业务仍成功）。
    private func submitNotificationsSynchronously(items: [SchoolMessageItem]) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        let stateLock = NSLock()
        var anyShown = false
        var completed = 0
        notifier.authorizationStatus { [weak self] status in
            guard let self = self else {
                semaphore.signal()
                return
            }
            switch status {
            case .authorized, .provisional:
                for item in items {
                    let body = String(item.title.prefix(Self.titleCap))
                    self.notifier.post(
                        title: Self.notificationTitle,
                        body: body.isEmpty ? "你有新的学校消息" : body,
                        userInfo: ["targetView": Self.notificationTargetView, "source": "ios-bg-app-refresh"]
                    ) { ok in
                        stateLock.lock()
                        if ok { anyShown = true }
                        completed += 1
                        let done = completed >= items.count
                        stateLock.unlock()
                        if done { semaphore.signal() }
                    }
                }
            case .denied, .notDetermined, .unknown:
                semaphore.signal()
            }
        }
        _ = semaphore.wait(timeout: .now() + 3)
        return anyShown
    }

    /// 更新统一状态。
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

    private func finish(_ outcome: SchoolInboxCheckOutcome, completion: @escaping (SchoolInboxCheckOutcome) -> Void) {
        lock.lock()
        running = false
        lock.unlock()
        completion(outcome)
    }
}
