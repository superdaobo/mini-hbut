import WidgetKit
import SwiftUI

// MARK: - Data Models

/// Widget 课程条目
struct WidgetCourse: Codable {
    let name: String
    let location: String
    let period_start: Int
    let period_end: Int
    let time_start: String  // "HH:mm"
    let time_end: String    // "HH:mm"
}

/// Widget 快照数据（对应 Web 层 TodayCourseSnapshot）
struct WidgetSnapshot: Codable {
    let version: Int
    let generated_at: String
    let date: String          // "YYYY-MM-DD"
    let student_id: String
    let week_index: Int
    let weekday: Int
    let courses: [WidgetCourse]
}

/// Widget 展示状态
enum WidgetDisplayState {
    case staleOrLogin
    case overview(WidgetSnapshot)
    case highlightNext(WidgetCourse, WidgetSnapshot)
    case afterCourse(WidgetCourse, WidgetSnapshot)
}

/// Timeline Entry
struct TodayCoursesEntry: TimelineEntry {
    let date: Date
    let state: WidgetDisplayState

    /// 占位 entry（系统首次加载时使用）
    static func placeholder() -> TodayCoursesEntry {
        TodayCoursesEntry(
            date: Date(),
            state: .staleOrLogin
        )
    }
}

// MARK: - TimelineProvider

/// 今日课程 Widget 的 TimelineProvider 实现
/// 遵循 design §8.2 规则：
/// - snapshot == nil 或日期不匹配 → .staleOrLogin + .after(15m)
/// - 正常情况 → buildEntries ≤ 4 条 + .atEnd
struct TodayCoursesProvider: TimelineProvider {

    private let shanghaiTZ = TimeZone(identifier: "Asia/Shanghai")!

    // MARK: - Protocol Methods

    func placeholder(in context: Context) -> TodayCoursesEntry {
        .placeholder()
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayCoursesEntry) -> Void) {
        let entry = loadEntry(now: Date(), isPreview: context.isPreview)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayCoursesEntry>) -> Void) {
        let snapshotJSON = WidgetDataStore.shared.readSnapshot()
        let snapshot = parseSnapshot(snapshotJSON)
        let now = Date()
        let entries = buildEntries(snapshot: snapshot, now: now)

        let policy: TimelineReloadPolicy
        if entries.isEmpty {
            // 兜底：15 分钟后重试
            policy = .after(now.addingTimeInterval(15 * 60))
            let fallback = TodayCoursesEntry(date: now, state: .staleOrLogin)
            completion(Timeline(entries: [fallback], policy: policy))
        } else {
            policy = .atEnd
            completion(Timeline(entries: entries, policy: policy))
        }
    }

    // MARK: - Entry Building

    /// 加载单个 entry（用于 getSnapshot）
    private func loadEntry(now: Date, isPreview: Bool) -> TodayCoursesEntry {
        if isPreview {
            return .placeholder()
        }
        let snapshotJSON = WidgetDataStore.shared.readSnapshot()
        guard let snapshot = parseSnapshot(snapshotJSON) else {
            return TodayCoursesEntry(date: now, state: .staleOrLogin)
        }
        let todayStr = formatLocalDate(now)
        if snapshot.date != todayStr {
            return TodayCoursesEntry(date: now, state: .staleOrLogin)
        }
        return TodayCoursesEntry(date: now, state: .overview(snapshot))
    }

    /// 构建时间线 entries（design §8.2 规则）
    /// 1. snapshot == nil 或 date != today → 返回空（由调用方处理 .after(15m)）
    /// 2. 正常情况：overview + highlightNext + afterCourse，去重后取前 4 条
    func buildEntries(snapshot: WidgetSnapshot?, now: Date) -> [TodayCoursesEntry] {
        guard let snapshot = snapshot else { return [] }

        let todayStr = formatLocalDate(now)
        guard snapshot.date == todayStr else { return [] }

        var entries: [TodayCoursesEntry] = []

        // 当前概览
        entries.append(TodayCoursesEntry(date: now, state: .overview(snapshot)))

        // 对每门课生成 highlightNext / afterCourse entries
        for course in snapshot.courses {
            // 课前 5 分钟高亮
            if let startDate = parseTime(course.time_start, referenceDate: now) {
                let highlightDate = startDate.addingTimeInterval(-5 * 60)
                if highlightDate > now {
                    entries.append(TodayCoursesEntry(
                        date: highlightDate,
                        state: .highlightNext(course, snapshot)
                    ))
                }
            }

            // 课后更新
            if let endDate = parseTime(course.time_end, referenceDate: now) {
                if endDate > now {
                    entries.append(TodayCoursesEntry(
                        date: endDate,
                        state: .afterCourse(course, snapshot)
                    ))
                }
            }
        }

        // 按 date 升序排列，去重（同一时间只保留第一个）
        entries.sort { $0.date < $1.date }
        var seen = Set<TimeInterval>()
        entries = entries.filter { entry in
            let ts = entry.date.timeIntervalSince1970
            if seen.contains(ts) { return false }
            seen.insert(ts)
            return true
        }

        // 限制最多 4 条（iOS 推荐上限）
        if entries.count > 4 {
            entries = Array(entries.prefix(4))
        }

        return entries
    }

    // MARK: - Helpers

    /// 解析快照 JSON
    private func parseSnapshot(_ json: String?) -> WidgetSnapshot? {
        guard let json = json, let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    /// 格式化当前日期为 "YYYY-MM-DD"（Asia/Shanghai 时区）
    private func formatLocalDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = shanghaiTZ
        return formatter.string(from: date)
    }

    /// 将 "HH:mm" 时间字符串解析为当天的 Date 对象
    private func parseTime(_ timeStr: String, referenceDate: Date) -> Date? {
        let parts = timeStr.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]),
              let minute = Int(parts[1]) else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = shanghaiTZ

        var components = calendar.dateComponents([.year, .month, .day], from: referenceDate)
        components.hour = hour
        components.minute = minute
        components.second = 0

        return calendar.date(from: components)
    }
}
