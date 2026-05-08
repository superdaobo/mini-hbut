import WidgetKit
import SwiftUI

/// Widget Extension 入口
/// 使用 @main 标记为 Widget Extension 的启动点
@main
struct MiniHbutTodayWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayCoursesWidget()
    }
}
