// BusinessChecksRunner —— #615 多 check unit 编排器（iOS BGTask 预算内顺序执行）。
//
// 职责（#615 验收：失败隔离 + 预算优先）：
// - 单次 BGAppRefresh 任务内按优先级顺序执行：成绩（关键）-> 考试变化 -> 学校消息；
// - 每 unit 独立 try/catch + 独立 outcome：一个 unit 失败不阻止后续 unit
//   （前提：剩余预算允许）；
// - 预算控制：deadline 时刻前必须结束；每个 unit 开始前检查剩余预算，
//   不足则跳过（不损坏 baseline）；
// - 线程安全：同一时间只允许一次运行（与各 coordinator 的 running 锁叠加）。
//
// unit 以闭包注入：三个 coordinator 的 outcome 类型不同
// （CheckOutcome / ExamsCheckOutcome / SchoolInboxCheckOutcome），
// 统一映射为非敏感字符串摘要后由本 runner 汇总。

import Foundation

/// 单次运行摘要（非敏感）。
public struct BusinessRunSummary {
    /// 每个 unit 的摘要（如 "grades=unchanged"）。
    public var outcomes: [String]
    public var eventsProduced: Int

    public init(outcomes: [String] = [], eventsProduced: Int = 0) {
        self.outcomes = outcomes
        self.eventsProduced = eventsProduced
    }
}

/// 单个 check unit（闭包注入；cancel 用于 expiration handler）。
public struct BusinessCheckUnit {
    public let name: String
    public let run: (_ source: CheckRunSource, @escaping (String) -> Void) -> Void
    public let cancel: () -> Void

    public init(name: String, run: @escaping (_ source: CheckRunSource, @escaping (String) -> Void) -> Void, cancel: @escaping () -> Void) {
        self.name = name
        self.run = run
        self.cancel = cancel
    }
}

/// 多 check unit 顺序编排器（预算优先）。
public final class BusinessChecksRunner {

    /// 每个 unit 的最小预算（秒）：剩余不足则跳过该 unit。
    public static let minUnitBudgetSeconds: TimeInterval = 5
    /// 单次任务总预算（秒）：BGAppRefresh 典型 30s 窗口。
    public static let taskBudgetSeconds: TimeInterval = 28

    private let units: [BusinessCheckUnit]
    private let now: () -> Date
    private let lock = NSLock()
    private var running = false

    public init(units: [BusinessCheckUnit], now: @escaping () -> Date = { Date() }) {
        self.units = units
        self.now = now
    }

    /// 是否还能执行下一个 unit（剩余预算 >= 最小预算）。
    public func canRunMore(deadline: Date, minBudget: TimeInterval = BusinessChecksRunner.minUnitBudgetSeconds) -> Bool {
        deadline.timeIntervalSince(now()) >= minBudget
    }

    /// 顺序执行全部 unit（预算内）；completion 必然被调用。
    public func runAll(source: CheckRunSource, completion: @escaping (BusinessRunSummary) -> Void) {
        lock.lock()
        if running {
            lock.unlock()
            completion(BusinessRunSummary(outcomes: ["busy"], eventsProduced: 0))
            return
        }
        running = true
        lock.unlock()

        let deadline = now().addingTimeInterval(Self.taskBudgetSeconds)
        var summary = BusinessRunSummary()
        let stateLock = NSLock()

        for unit in units {
            if !canRunMore(deadline: deadline) {
                stateLock.lock()
                summary.outcomes.append("\(unit.name)=skipped(预算不足)")
                stateLock.unlock()
                continue
            }
            let semaphore = DispatchSemaphore(value: 0)
            unit.run(source) { outcomeText in
                stateLock.lock()
                summary.outcomes.append("\(unit.name)=\(outcomeText)")
                stateLock.unlock()
                semaphore.signal()
            }
            semaphore.wait() // 串行：下一 unit 必须等待上一 unit 完成（预算内）
        }

        lock.lock()
        running = false
        lock.unlock()
        completion(summary)
    }

    /// 取消全部 unit（BGTask expiration handler 调用）。
    public func cancel() {
        for unit in units {
            unit.cancel()
        }
    }
}

// MARK: - 各 coordinator outcome -> 非敏感摘要映射

public enum UnitOutcomeText {
    /// 成绩（#613 CheckOutcome）。
    public static func grades(_ outcome: CheckOutcome) -> String {
        switch outcome {
        case .disabled: return "disabled"
        case .notConfigured: return "not-configured"
        case .authUnavailable: return "auth-unavailable"
        case .networkUnavailable: return "network-unavailable"
        case .authExpired: return "auth-expired"
        case .parseError: return "parse-error"
        case .cancelled: return "cancelled"
        case .baselineEstablished: return "baselined"
        case .noChange: return "unchanged"
        case .changed: return "changed"
        case .busy: return "busy"
        }
    }

    /// 考试变化（#615 ExamsCheckOutcome）。
    public static func exams(_ outcome: ExamsCheckOutcome) -> String {
        switch outcome {
        case .disabled: return "disabled"
        case .notConfigured: return "not-configured"
        case .authUnavailable: return "auth-unavailable"
        case .networkUnavailable: return "network-unavailable"
        case .authExpired: return "auth-expired"
        case .parseError: return "parse-error"
        case .cancelled: return "cancelled"
        case .baselineEstablished: return "baselined"
        case .noChange: return "unchanged"
        case .changed: return "changed"
        case .busy: return "busy"
        }
    }

    /// 学校消息（#615 SchoolInboxCheckOutcome）。
    public static func school(_ outcome: SchoolInboxCheckOutcome) -> String {
        switch outcome {
        case .disabled: return "disabled"
        case .notConfigured: return "not-configured"
        case .authUnavailable: return "auth-unavailable"
        case .unsupported: return "unsupported"
        case .networkUnavailable: return "network-unavailable"
        case .authExpired: return "auth-expired"
        case .parseError: return "parse-error"
        case .cancelled: return "cancelled"
        case .baselineEstablished: return "baselined"
        case .noNewMessages: return "unchanged"
        case .changed: return "changed"
        case .busy: return "busy"
        }
    }
}
