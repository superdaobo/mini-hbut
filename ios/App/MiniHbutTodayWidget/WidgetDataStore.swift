import Foundation

/// App Group UserDefaults 封装
/// 主 App 通过插件写入快照，Widget Extension 通过此类读取
/// 使用 `UserDefaults(suiteName: "group.com.hbut.mini")` 实现跨进程共享
final class WidgetDataStore {

    /// 单例（Widget Extension 内使用）
    static let shared = WidgetDataStore(suiteName: "group.com.hbut.mini")

    private let defaults: UserDefaults?

    // MARK: - Keys

    private enum Keys {
        static let snapshot = "widget_snapshot"
        static let lastWriteTs = "widget_last_write_ts"
    }

    // MARK: - Init

    /// 通过 App Group suite name 初始化
    /// - Parameter suiteName: App Group 标识符
    init(suiteName: String) {
        self.defaults = UserDefaults(suiteName: suiteName)
    }

    // MARK: - Public API

    /// 写入快照 JSON 字符串
    /// - Parameter json: 序列化后的 TodayCourseSnapshot JSON
    /// - Returns: 写入是否成功
    @discardableResult
    func write(_ json: String) -> Bool {
        guard let defaults = defaults else { return false }
        defaults.set(json, forKey: Keys.snapshot)
        defaults.set(Date().timeIntervalSince1970, forKey: Keys.lastWriteTs)
        return defaults.synchronize()
    }

    /// 读取当前快照 JSON
    /// - Returns: 快照 JSON 字符串，不存在时返回 nil
    func readSnapshot() -> String? {
        return defaults?.string(forKey: Keys.snapshot)
    }

    /// 清除所有 Widget 相关数据
    func clear() {
        defaults?.removeObject(forKey: Keys.snapshot)
        defaults?.removeObject(forKey: Keys.lastWriteTs)
        defaults?.synchronize()
    }

    /// 获取最后一次写入时间
    /// - Returns: 最后写入的 Date，从未写入时返回 nil
    func lastWriteTs() -> Date? {
        guard let defaults = defaults else { return nil }
        let ts = defaults.double(forKey: Keys.lastWriteTs)
        guard ts > 0 else { return nil }
        return Date(timeIntervalSince1970: ts)
    }
}
