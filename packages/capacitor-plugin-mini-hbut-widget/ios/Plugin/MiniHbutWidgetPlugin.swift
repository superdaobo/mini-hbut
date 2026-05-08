import Foundation
import Capacitor
import WidgetKit

/// Capacitor 插件：桥接 Web 层与 iOS WidgetKit
/// 提供 writeSnapshot / clearSnapshot / requestRefresh / getCapabilities 四个方法
@objc(MiniHbutWidgetPlugin)
public class MiniHbutWidgetPlugin: CAPPlugin {

    /// Widget kind 标识，与 TodayCoursesWidget 的 StaticConfiguration kind 一致
    private let kind = "TodayCoursesWidget"

    /// App Group suite name，主 App 与 Widget Extension 共享数据
    private let suite = "group.com.hbut.mini"

    /// 快照最大字节数限制（32 KB）
    private let maxBytes = 32 * 1024

    /// 延迟初始化的数据存储
    private lazy var store: WidgetDataStore = {
        return WidgetDataStore(suiteName: suite)
    }()

    // MARK: - writeSnapshot

    /// 将课程快照写入 App Group UserDefaults，并触发 Widget 刷新
    @objc func writeSnapshot(_ call: CAPPluginCall) {
        guard let obj = call.getObject("snapshot"),
              let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("INVALID_SNAPSHOT", "snapshot is null or not serializable")
            return
        }

        if data.count > maxBytes {
            call.reject("SNAPSHOT_TOO_LARGE", "snapshot exceeds 32KB limit")
            return
        }

        if !store.write(json) {
            call.reject("WRITE_FAILED", "UserDefaults write failed")
            return
        }

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
        call.resolve()
    }

    // MARK: - clearSnapshot

    /// 清除快照数据并触发 Widget 刷新（登出时调用）
    @objc func clearSnapshot(_ call: CAPPluginCall) {
        store.clear()
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
        call.resolve()
    }

    // MARK: - requestRefresh

    /// 手动请求 Widget 时间线刷新
    @objc func requestRefresh(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
        call.resolve()
    }

    // MARK: - getCapabilities

    /// 返回平台能力信息：平台类型 + 是否已安装 Widget 实例
    @objc func getCapabilities(_ call: CAPPluginCall) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.getCurrentConfigurations { result in
                var pinned = false
                if case .success(let infos) = result {
                    pinned = infos.contains { $0.kind == self.kind }
                }
                call.resolve([
                    "platform": "ios-widgetkit",
                    "pinned": pinned
                ])
            }
        } else {
            call.resolve([
                "platform": "unavailable",
                "pinned": false
            ])
        }
    }
}
