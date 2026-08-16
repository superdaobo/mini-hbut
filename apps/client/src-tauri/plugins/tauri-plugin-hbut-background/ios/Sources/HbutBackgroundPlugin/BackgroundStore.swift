// Swift 端持久化：与 Rust store.rs / Kotlin BackgroundStore.kt 语义对齐。
// - 原子写：Data.write(options: .atomic)；
// - 损坏/版本不兼容：备份为 *.corrupt-<ts> 后降级，不 crash；
// - 容量上限：eventInboxCap，超出丢弃最旧；
// - scope 清理：账号切换/退出时完整清理 context/state/events。

import Foundation

/// 存储错误。
public enum StoreError: Error, LocalizedError {
    case dirInit(String)
    case read(String)
    case write(String)

    public var errorDescription: String? {
        switch self {
        case .dirInit(let m), .read(let m), .write(let m): return m
        }
    }
}

/// 落盘存储：目录构造与 App 容器解耦（真机由调用方传 applicationSupportURL 等目录）。
/// 单账号的成绩 baseline 条目（#613：按 scope 隔离，切换账号不污染）。
public struct GradesBaselineEntry: Codable, Equatable {
    public var signature: String
    public var updatedAt: String

    public init(signature: String, updatedAt: String) {
        self.signature = signature
        self.updatedAt = updatedAt
    }
}

/// 全部账号的 baseline 表（grades-baseline.json，含 schema 版本）。
public struct GradesBaselineMap: Codable, Equatable {
    public var schema: Int
    public var baselines: [String: GradesBaselineEntry]

    public init(schema: Int = bgSchemaVersion, baselines: [String: GradesBaselineEntry] = [:]) {
        self.schema = schema
        self.baselines = baselines
    }
}

public class BackgroundStore {
    public static let configFile = "config.json"
    public static let contextFile = "context.json"
    public static let stateFile = "state.json"
    public static let eventsFile = "events.json"
    public static let baselineFile = "grades-baseline.json"

    private let dir: URL
    private let fileManager: FileManager

    public init(dir: URL) throws {
        self.dir = dir
        self.fileManager = FileManager.default
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    public func directory() -> URL { dir }

    private func path(_ name: String) -> URL { dir.appendingPathComponent(name) }

    // ---- config ----

    public func loadConfig() -> BackgroundConfig {
        guard let data = loadChecked(name: Self.configFile) else {
            return BackgroundConfig()
        }
        return (try? JSONDecoder().decode(BackgroundConfig.self, from: data)) ?? BackgroundConfig()
    }

    public func saveConfig(_ config: BackgroundConfig) throws {
        try saveAtomic(name: Self.configFile, value: config)
    }

    // ---- context ----

    public func loadContext() -> BackgroundContext? {
        guard let data = loadChecked(name: Self.contextFile) else { return nil }
        return try? JSONDecoder().decode(BackgroundContext.self, from: data)
    }

    public func saveContext(_ context: BackgroundContext) throws {
        try saveAtomic(name: Self.contextFile, value: context)
    }

    // ---- state ----

    public func loadState() -> BackgroundCheckState? {
        guard let data = loadChecked(name: Self.stateFile) else { return nil }
        return try? JSONDecoder().decode(BackgroundCheckState.self, from: data)
    }

    public func saveState(_ state: BackgroundCheckState) throws {
        try saveAtomic(name: Self.stateFile, value: state)
    }

    // ---- events ----

    public func loadEvents() -> [BackgroundEvent] {
        guard let data = loadChecked(name: Self.eventsFile) else { return [] }
        return (try? JSONDecoder().decode([BackgroundEvent].self, from: data)) ?? []
    }

    public func saveEvents(_ events: [BackgroundEvent]) throws {
        let kept = events.count > eventInboxCap
            ? Array(events.suffix(eventInboxCap))
            : events
        try saveAtomic(name: Self.eventsFile, value: kept)
    }

    public func appendEvent(_ event: BackgroundEvent) throws {
        try saveEvents(loadEvents() + [event])
    }

    /// 消费并移除事件；limit 为 nil 时消费全部。
    public func consumeEvents(limit: Int?) throws -> ConsumeEventsResult {
        let events = loadEvents()
        let take = min(limit ?? events.count, events.count)
        let consumed = Array(events.prefix(take))
        try saveEvents(Array(events.dropFirst(take)))
        return ConsumeEventsResult(events: consumed, remaining: events.count - take)
    }

    // ---- scope 清理 ----

    /// 返回 (是否清除 context/state, 清除的事件数)。
    @discardableResult
    public func clearScope(_ scope: String) throws -> (cleared: Bool, removedEvents: Int) {
        var clearedAny = false
        if let ctx = loadContext(), ctx.scope == scope {
            try? fileManager.removeItem(at: path(Self.contextFile))
            clearedAny = true
        }
        if let state = loadState(), state.scope == scope {
            try? fileManager.removeItem(at: path(Self.stateFile))
            clearedAny = true
        }
        let events = loadEvents()
        let kept = events.filter { $0.scope != scope }
        try saveEvents(kept)
        let removed = events.count - kept.count
        if removed > 0 { clearedAny = true }
        // baseline 按 scope 隔离：账号切换/退出时同步清理（#613）
        var baseline = loadGradesBaseline()
        if baseline.baselines.removeValue(forKey: scope) != nil {
            try saveGradesBaseline(baseline)
            clearedAny = true
        }
        return (clearedAny, removed)
    }

    // ---- grades baseline（#613：按 scope 隔离） ----

    /// 读取全部账号 baseline 表（缺失/损坏返回空表）。
    public func loadGradesBaseline() -> GradesBaselineMap {
        guard let data = loadChecked(name: Self.baselineFile) else {
            return GradesBaselineMap()
        }
        return (try? JSONDecoder().decode(GradesBaselineMap.self, from: data)) ?? GradesBaselineMap()
    }

    /// 原子写 baseline 表。
    public func saveGradesBaseline(_ map: GradesBaselineMap) throws {
        try saveAtomic(name: Self.baselineFile, value: map)
    }

    /// 读取指定 scope 的 baseline 条目。
    public func loadGradesBaseline(scope: String) -> GradesBaselineEntry? {
        loadGradesBaseline().baselines[scope]
    }

    /// 写入指定 scope 的 baseline（不存在则创建）。
    public func setGradesBaseline(signature: String, scope: String, updatedAt: String) throws {
        var map = loadGradesBaseline()
        map.baselines[scope] = GradesBaselineEntry(signature: signature, updatedAt: updatedAt)
        try saveGradesBaseline(map)
    }

    // ---- 内部实现 ----

    /// 读取 + schema 版本校验；损坏/版本不兼容时备份后返回 nil（安全降级）。
    private func loadChecked(name: String) -> Data? {
        let url = path(name)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        let schema = extractSchema(data: data)
        if schema == nil || schema != bgSchemaVersion {
            backupCorrupt(name: name, url: url)
            return nil
        }
        return data
    }

    /// 从数据中提取顶层 schema 字段（对象或数组首元素）。
    private func extractSchema(data: Data) -> Int? {
        guard let json = try? JSONSerialization.jsonObject(with: data) else { return nil }
        if let obj = json as? [String: Any], let schema = obj["schema"] as? Int {
            return schema
        }
        if let arr = json as? [[String: Any]], let first = arr.first {
            return first["schema"] as? Int
        }
        return nil
    }

    private func backupCorrupt(name: String, url: URL) {
        let backup = dir.appendingPathComponent("\(name).corrupt-\(Int(Date().timeIntervalSince1970 * 1000))")
        try? fileManager.moveItem(at: url, to: backup)
    }

    /// 原子写（Data.write .atomic 自带 tmp+rename 语义）。
    private func saveAtomic(name: String, value: Encodable) throws {
        do {
            let data = try JSONEncoder().encode(value)
            try data.write(to: path(name), options: .atomic)
        } catch {
            throw StoreError.write("写入 \(name) 失败: \(error)")
        }
    }
}
