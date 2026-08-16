import WidgetKit
import SwiftUI

/// 今日课程 Widget 配置
/// 使用 StaticConfiguration，支持 small / medium / large 三种尺寸
struct TodayCoursesWidget: Widget {
    /// Widget kind 标识，与插件中 reloadTimelines(ofKind:) 一致
    let kind: String = "TodayCoursesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayCoursesProvider()) { entry in
            TodayCoursesEntryView(entry: entry)
        }
        .configurationDisplayName("今日课程")
        .description("查看今天的课程安排")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
