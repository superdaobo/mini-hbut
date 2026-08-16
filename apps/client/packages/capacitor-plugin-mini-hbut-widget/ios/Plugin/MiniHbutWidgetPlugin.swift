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

    private enum Keys {
        static let snapshot = "widget_snapshot"
        static let electricity = "widget_electricity"
        static let exam = "widget_exam"
        static let themeColor = "widget_theme_color"
        static let lastWriteTs = "widget_last_write_ts"
    }

    private var defaults: UserDefaults? {
        return UserDefaults(suiteName: suite)
    }

    // MARK: - writeSnapshot

    /// 将课程快照写入 App Group UserDefaults，并触发 Widget 刷新
    @objc func writeSnapshot(_ call: CAPPluginCall) {
        guard let obj = call.getObject("snapshot"),
              let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("snapshot is null or not serializable", "INVALID_SNAPSHOT")
            return
        }

        if data.count > maxBytes {
            call.reject("snapshot exceeds 32KB limit", "SNAPSHOT_TOO_LARGE")
            return
        }

        if !writeString(json, key: Keys.snapshot) {
            call.reject("UserDefaults write failed", "WRITE_FAILED")
            return
        }

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
        call.resolve()
    }

    @objc func writeElectricity(_ call: CAPPluginCall) {
        guard let obj = call.getObject("data"),
              let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("data is null or not serializable", "INVALID_WIDGET_DATA")
            return
        }
        if !writeString(json, key: Keys.electricity) {
            call.reject("UserDefaults write failed", "WRITE_FAILED")
            return
        }
        reloadWidgets()
        call.resolve()
    }

    @objc func writeExam(_ call: CAPPluginCall) {
        guard let obj = call.getObject("data"),
              let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let json = String(data: data, encoding: .utf8) else {
            call.reject("data is null or not serializable", "INVALID_WIDGET_DATA")
            return
        }
        if !writeString(json, key: Keys.exam) {
            call.reject("UserDefaults write failed", "WRITE_FAILED")
            return
        }
        reloadWidgets()
        call.resolve()
    }

    @objc func writeThemeColor(_ call: CAPPluginCall) {
        guard let color = call.getString("color"),
              color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else {
            call.reject("invalid theme color", "INVALID_THEME_COLOR")
            return
        }
        if !writeString(color, key: Keys.themeColor) {
            call.reject("UserDefaults write failed", "WRITE_FAILED")
            return
        }
        reloadWidgets()
        call.resolve()
    }

    // MARK: - clearSnapshot

    /// 清除快照数据并触发 Widget 刷新（登出时调用）
    @objc func clearSnapshot(_ call: CAPPluginCall) {
        defaults?.removeObject(forKey: Keys.snapshot)
        defaults?.removeObject(forKey: Keys.electricity)
        defaults?.removeObject(forKey: Keys.exam)
        defaults?.removeObject(forKey: Keys.lastWriteTs)
        defaults?.synchronize()
        reloadWidgets()
        call.resolve()
    }

    // MARK: - requestRefresh

    /// 手动请求 Widget 时间线刷新
    @objc func requestRefresh(_ call: CAPPluginCall) {
        reloadWidgets()
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

    private func writeString(_ value: String, key: String) -> Bool {
        guard let defaults = defaults else { return false }
        defaults.set(value, forKey: key)
        defaults.set(Date().timeIntervalSince1970, forKey: Keys.lastWriteTs)
        return defaults.synchronize()
    }

    private func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
    }
}
