// BusinessBaselineStore —— #615 新增业务（考试变化/学校消息）持久化。
//
// 与 BackgroundStore（#611 config/context/state/events + #613 grades baseline）
// 并存：本文件负责 exams baseline（按 scope）与 school known-IDs（按 scope），
// 保持现有 BackgroundStore 布局不动（#615 写边界：新增文件）。
// - 原子写（Data.write .atomic）、损坏/版本不兼容备份 *.corrupt-<ts> 后降级；
// - scope 清理：账号切换/退出时按 scope 删除对应条目；
// - 不保存任何敏感材料（仅 signature/ID/时间戳等非敏感摘要）。

import Foundation

/// 单账号考试 baseline 条目。
public struct ExamsBaselineEntry: Codable, Equatable {
    public var signature: String
    public var updatedAt: String

    public init(signature: String, updatedAt: String) {
        self.signature = signature
        self.updatedAt = updatedAt
    }
}

/// 全部账号考试 baseline 表（exams-baseline.json）。
public struct ExamsBaselineMap: Codable, Equatable {
    public var schema: Int
    public var baselines: [String: ExamsBaselineEntry]

    public init(schema: Int = bgSchemaVersion, baselines: [String: ExamsBaselineEntry] = [:]) {
        self.schema = schema
        self.baselines = baselines
    }
}

/// 单账号学校消息已知 ID 状态（首次基线不推历史、已读不重复推送（#23/#201））。
public struct SchoolInboxStateEntry: Codable, Equatable {
    /// known message IDs（provider 前缀：portal:tzsjx:xxx / chaoxing:notice:xxx；上限 500）。
    public var knownIds: [String]
    /// 最近已通知的 eventKey 列表（有界去重兜底）。
    public var notifiedKeys: [String]
    /// 最近一次使用的 provider（portal/chaoxing/unsupported）。
    public var provider: String?
    /// provider 在后台不可用（无安全材料）：诚实标记，不静默假成功。
    public var unsupported: Bool
    /// 最近一次成功同步时间。
    public var updatedAt: String?

    public init(
        knownIds: [String] = [],
        notifiedKeys: [String] = [],
        provider: String? = nil,
        unsupported: Bool = false,
        updatedAt: String? = nil
    ) {
        self.knownIds = knownIds
        self.notifiedKeys = notifiedKeys
        self.provider = provider
        self.unsupported = unsupported
        self.updatedAt = updatedAt
    }
}

/// 全部账号学校消息状态表（school-inbox-state.json）。
public struct SchoolInboxStateMap: Codable, Equatable {
    public var schema: Int
    public var states: [String: SchoolInboxStateEntry]

    public init(schema: Int = bgSchemaVersion, states: [String: SchoolInboxStateEntry] = [:]) {
        self.schema = schema
        self.states = states
    }
}

/// 兜底目录工厂（与 BackgroundStoreFactory 同模式；目录不可用时显式失败）。
public enum BusinessBaselineStoreFactory {
    public static func fallback() -> BusinessBaselineStore {
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-background-baseline-fallback", isDirectory: true)
        do {
            return try BusinessBaselineStore(dir: tmp)
        } catch {
            fatalError("无法初始化扩展 baseline 存储目录（临时目录不可用）")
        }
    }
}

/// #615 扩展持久化（exams baseline + school known-IDs）。
public class BusinessBaselineStore {
    public static let examsFile = "exams-baseline.json"
    public static let schoolFile = "school-inbox-state.json"

    /// known IDs 上限（与前台 500 对齐，防无限增长）。
    public static let knownIdsCap = 500
    /// 去重兜底 keys 上限（有界）。
    public static let notifiedKeysCap = 500

    private let dir: URL
    private let fileManager: FileManager

    public init(dir: URL) throws {
        self.dir = dir
        self.fileManager = FileManager.default
        try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func path(_ name: String) -> URL { dir.appendingPathComponent(name) }

    // ---- exams baseline ----

    public func loadExamsBaseline() -> ExamsBaselineMap {
        guard let data = loadChecked(name: Self.examsFile) else { return ExamsBaselineMap() }
        return (try? JSONDecoder().decode(ExamsBaselineMap.self, from: data)) ?? ExamsBaselineMap()
    }

    public func saveExamsBaseline(_ map: ExamsBaselineMap) throws {
        try saveAtomic(name: Self.examsFile, value: map)
    }

    public func loadExamsBaseline(scope: String) -> ExamsBaselineEntry? {
        loadExamsBaseline().baselines[scope]
    }

    public func setExamsBaseline(signature: String, scope: String, updatedAt: String) throws {
        var map = loadExamsBaseline()
        map.baselines[scope] = ExamsBaselineEntry(signature: signature, updatedAt: updatedAt)
        try saveExamsBaseline(map)
    }

    // ---- school known-IDs ----

    public func loadSchoolState() -> SchoolInboxStateMap {
        guard let data = loadChecked(name: Self.schoolFile) else { return SchoolInboxStateMap() }
        return (try? JSONDecoder().decode(SchoolInboxStateMap.self, from: data)) ?? SchoolInboxStateMap()
    }

    public func saveSchoolState(_ map: SchoolInboxStateMap) throws {
        try saveAtomic(name: Self.schoolFile, value: map)
    }

    public func loadSchoolState(scope: String) -> SchoolInboxStateEntry? {
        loadSchoolState().states[scope]
    }

    public func setSchoolState(_ entry: SchoolInboxStateEntry, scope: String) throws {
        var map = loadSchoolState()
        map.states[scope] = entry
        try saveSchoolState(map)
    }

    // ---- scope 清理 ----

    /// 按 scope 删除考试 baseline 与学校消息状态（账号切换/退出）。
    @discardableResult
    public func clearScope(_ scope: String) -> Bool {
        var cleared = false
        var exams = loadExamsBaseline()
        if exams.baselines.removeValue(forKey: scope) != nil {
            cleared = true
        }
        if cleared { try? saveExamsBaseline(exams) }
        var school = loadSchoolState()
        if school.states.removeValue(forKey: scope) != nil {
            cleared = true
        }
        if cleared { try? saveSchoolState(school) }
        return cleared
    }

    // ---- 内部实现（与 BackgroundStore 同模式） ----

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

    private func extractSchema(data: Data) -> Int? {
        guard let json = try? JSONSerialization.jsonObject(with: data) else { return nil }
        if let obj = json as? [String: Any], let schema = obj["schema"] as? Int {
            return schema
        }
        return nil
    }

    private func backupCorrupt(name: String, url: URL) {
        let backup = dir.appendingPathComponent("\(name).corrupt-\(Int(Date().timeIntervalSince1970 * 1000))")
        try? fileManager.moveItem(at: url, to: backup)
    }

    private func saveAtomic(name: String, value: Encodable) throws {
        do {
            let data = try JSONEncoder().encode(value)
            try data.write(to: path(name), options: .atomic)
        } catch {
            throw StoreError.write("写入 \(name) 失败: \(error)")
        }
    }
}
