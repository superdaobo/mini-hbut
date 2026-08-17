// LocalNotificationPoster —— 本地通知真机实现（#613）。
//
// 后台任务中只读取授权状态 + 直接 add 通知，不在后台弹窗请求权限
// （权限请求由 App 前台流程完成）。通知内容不包含完整成绩明细/敏感响应。

import Foundation
import UserNotifications

/// UNUserNotificationCenter 真机实现。
public final class LocalNotificationPoster: NotificationPosting {

    public init() {}

    public func authorizationStatus(completion: @escaping (NotificationAuthorization) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized:
                completion(.authorized)
            case .provisional:
                completion(.provisional)
            case .denied:
                completion(.denied)
            case .notDetermined:
                completion(.notDetermined)
            @unknown default:
                completion(.unknown)
            }
        }
    }

    public func post(
        title: String,
        body: String,
        userInfo: [String: String],
        completion: @escaping (Bool) -> Void
    ) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = userInfo
        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil // 立即展示；触发式通知（课程/考试提醒）属于 #610 范围
        )
        UNUserNotificationCenter.current().add(request) { error in
            completion(error == nil)
        }
    }
}
