import SwiftUI
import WidgetKit

// MARK: - Main Entry View

/// Widget 主视图，根据 WidgetFamily 分发到三种尺寸布局
struct TodayCoursesEntryView: View {
    var entry: TodayCoursesEntry

    @Environment(\.widgetFamily) var family

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                SmallView(entry: entry)
            case .systemMedium:
                MediumView(entry: entry)
            case .systemLarge:
                LargeView(entry: entry)
            default:
                MediumView(entry: entry)
            }
        }
        .widgetURL(buildWidgetURL(entry: entry))
    }

    /// 构建 widgetURL：minihbut://schedule?date=...&source=widget
    private func buildWidgetURL(entry: TodayCoursesEntry) -> URL? {
        switch entry.state {
        case .overview(let snapshot), .highlightNext(_, let snapshot), .afterCourse(_, let snapshot):
            return URL(string: "minihbut://schedule?date=\(snapshot.date)&source=widget")
        case .staleOrLogin:
            return URL(string: "minihbut://schedule?source=widget")
        }
    }
}

// MARK: - Small View

/// systemSmall：顶部标题 + 下一节课摘要
struct SmallView: View {
    let entry: TodayCoursesEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("今日课程")
                .font(.headline)
                .foregroundColor(Color("WidgetAccent"))
                .minimumScaleFactor(0.85)
                .lineLimit(1)

            Spacer()

            switch entry.state {
            case .staleOrLogin:
                Text("请先在 Mini-HBUT 登录")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .minimumScaleFactor(0.85)
                    .lineLimit(2)

            case .overview(let snapshot):
                if let next = snapshot.courses.first {
                    courseRow(next)
                } else {
                    Text("今日无课 🎉")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

            case .highlightNext(let course, _):
                courseRow(course)

            case .afterCourse(_, let snapshot):
                // 课后显示下一门课（如果有）
                if let next = nextUpcomingCourse(snapshot: snapshot) {
                    courseRow(next)
                } else {
                    Text("今日课程已结束")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .modifier(WidgetBackgroundModifier())
    }

    @ViewBuilder
    private func courseRow(_ course: WidgetCourse) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("第\(course.period_start)节 \(course.time_start)")
                .font(.caption2)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Text(course.name)
                .font(.subheadline)
                .fontWeight(.medium)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Text(course.location)
                .font(.caption)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("第\(course.period_start)节 \(course.time_start)到\(course.time_end) \(course.name) \(course.location)")
    }

    private func nextUpcomingCourse(snapshot: WidgetSnapshot) -> WidgetCourse? {
        // 返回第一门尚未结束的课
        return snapshot.courses.first
    }
}

// MARK: - Medium View

/// systemMedium：标题 + 脱敏学号 + 最多 3 门课 + "+N 节" 溢出角标
struct MediumView: View {
    let entry: TodayCoursesEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // 标题行
            HStack {
                Text("今日课程")
                    .font(.headline)
                    .foregroundColor(Color("WidgetAccent"))
                    .minimumScaleFactor(0.85)
                    .lineLimit(1)
                Spacer()
                if case .overview(let snapshot) = entry.state {
                    Text(maskStudentId(snapshot.student_id))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .minimumScaleFactor(0.85)
                        .lineLimit(1)
                }
            }

            Divider()

            switch entry.state {
            case .staleOrLogin:
                Spacer()
                Text("请先在 Mini-HBUT 登录")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .minimumScaleFactor(0.85)
                Spacer()

            case .overview(let snapshot):
                courseList(snapshot: snapshot, capacity: 3)

            case .highlightNext(let course, let snapshot):
                highlightRow(course)
                courseList(snapshot: snapshot, capacity: 2, excluding: course)

            case .afterCourse(_, let snapshot):
                courseList(snapshot: snapshot, capacity: 3)
            }
        }
        .padding()
        .modifier(WidgetBackgroundModifier())
    }

    @ViewBuilder
    private func courseList(snapshot: WidgetSnapshot, capacity: Int, excluding: WidgetCourse? = nil) -> some View {
        let courses = excluding != nil
            ? snapshot.courses.filter { $0.name != excluding!.name || $0.time_start != excluding!.time_start }
            : snapshot.courses

        if courses.isEmpty {
            Text("今日无课 🎉")
                .font(.subheadline)
                .foregroundColor(.secondary)
        } else {
            let displayed = Array(courses.prefix(capacity))
            let overflow = courses.count - displayed.count

            ForEach(displayed.indices, id: \.self) { idx in
                compactRow(displayed[idx])
            }

            if overflow > 0 {
                HStack {
                    Spacer()
                    Text("+\(overflow) 节")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .minimumScaleFactor(0.85)
                }
            }
        }
    }

    @ViewBuilder
    private func compactRow(_ course: WidgetCourse) -> some View {
        HStack(spacing: 6) {
            Text("第\(course.period_start)节")
                .font(.caption2)
                .foregroundColor(Color("WidgetAccent"))
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Text(course.time_start)
                .font(.caption)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Text(course.name)
                .font(.subheadline)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Spacer()
            Text(course.location)
                .font(.caption)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("第\(course.period_start)节 \(course.time_start)到\(course.time_end) \(course.name) \(course.location)")
    }

    @ViewBuilder
    private func highlightRow(_ course: WidgetCourse) -> some View {
        HStack(spacing: 6) {
            Text("即将上课")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(Color("WidgetAccent"))
            Text(course.name)
                .font(.subheadline)
                .fontWeight(.medium)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Spacer()
            Text(course.location)
                .font(.caption)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("即将上课 第\(course.period_start)节 \(course.time_start)到\(course.time_end) \(course.name) \(course.location)")
    }
}

// MARK: - Large View

/// systemLarge：标题 + 脱敏学号 + 最多 6 门课 + "+N 节" 溢出角标
struct LargeView: View {
    let entry: TodayCoursesEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // 标题行
            HStack {
                Text("今日课程")
                    .font(.headline)
                    .foregroundColor(Color("WidgetAccent"))
                    .minimumScaleFactor(0.85)
                    .lineLimit(1)
                Spacer()
                if case .overview(let snapshot) = entry.state {
                    Text(maskStudentId(snapshot.student_id))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .minimumScaleFactor(0.85)
                        .lineLimit(1)
                }
            }

            Divider()

            switch entry.state {
            case .staleOrLogin:
                Spacer()
                VStack(spacing: 8) {
                    Text("请先在 Mini-HBUT 登录")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Text("打开 App 登录后即可查看今日课程")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                Spacer()

            case .overview(let snapshot):
                courseList(snapshot: snapshot, capacity: 6)

            case .highlightNext(let course, let snapshot):
                highlightRow(course)
                courseList(snapshot: snapshot, capacity: 5, excluding: course)

            case .afterCourse(_, let snapshot):
                courseList(snapshot: snapshot, capacity: 6)
            }

            Spacer()
        }
        .padding()
        .modifier(WidgetBackgroundModifier())
    }

    @ViewBuilder
    private func courseList(snapshot: WidgetSnapshot, capacity: Int, excluding: WidgetCourse? = nil) -> some View {
        let courses = excluding != nil
            ? snapshot.courses.filter { $0.name != excluding!.name || $0.time_start != excluding!.time_start }
            : snapshot.courses

        if courses.isEmpty {
            VStack(spacing: 8) {
                Text("今日无课 🎉")
                    .font(.title3)
                Text("周末愉快")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
        } else {
            let displayed = Array(courses.prefix(capacity))
            let overflow = courses.count - displayed.count

            ForEach(displayed.indices, id: \.self) { idx in
                detailRow(displayed[idx])
                if idx < displayed.count - 1 {
                    Divider().opacity(0.5)
                }
            }

            if overflow > 0 {
                HStack {
                    Spacer()
                    Text("+\(overflow) 节")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .minimumScaleFactor(0.85)
                }
            }
        }
    }

    @ViewBuilder
    private func detailRow(_ course: WidgetCourse) -> some View {
        HStack(spacing: 8) {
            // 节次徽标
            Text("\(course.period_start)")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Color("WidgetAccent"))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 1) {
                Text(course.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .minimumScaleFactor(0.85)
                    .lineLimit(1)
                Text("\(course.time_start)-\(course.time_end) · \(course.location)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .minimumScaleFactor(0.85)
                    .lineLimit(1)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("第\(course.period_start)节 \(course.time_start)到\(course.time_end) \(course.name) \(course.location)")
    }

    @ViewBuilder
    private func highlightRow(_ course: WidgetCourse) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "bell.fill")
                .font(.caption)
                .foregroundColor(Color("WidgetAccent"))
            Text("即将上课")
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundColor(Color("WidgetAccent"))
            Text(course.name)
                .font(.subheadline)
                .fontWeight(.medium)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
            Spacer()
            Text(course.location)
                .font(.caption)
                .foregroundColor(.secondary)
                .minimumScaleFactor(0.85)
                .lineLimit(1)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("即将上课 第\(course.period_start)节 \(course.time_start)到\(course.time_end) \(course.name) \(course.location)")
    }
}

// MARK: - Helpers

/// 学号脱敏：保留前 2 位和后 2 位，中间用 * 替代
/// 例如 "2021123456" → "20******56"
private func maskStudentId(_ sid: String) -> String {
    guard sid.count > 4 else {
        return String(repeating: "*", count: sid.count)
    }
    let prefix = sid.prefix(2)
    let suffix = sid.suffix(2)
    let masked = String(repeating: "*", count: sid.count - 4)
    return "\(prefix)\(masked)\(suffix)"
}

// MARK: - Widget Background Modifier

/// 兼容 iOS 14-16 与 iOS 17+ 的背景适配
struct WidgetBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content
                .containerBackground(for: .widget) {
                    Color("WidgetBg")
                }
        } else {
            content
                .background(Color("WidgetBg"))
        }
    }
}
