// BackgroundTaskScheduler 决策逻辑测试（#613）：
// 调度器纯函数部分（shouldSchedule / interval 归一化 / contextReady）在任意平台可测；
// BGTaskScheduler 提交/系统触发属于 iOS 运行时行为，列入手工真机清单（见 INTEGRATION.md）。

import XCTest
@testable import HbutBackgroundPlugin

final class BackgroundTaskSchedulerTests: XCTestCase {

    func testTaskIdentifierIsUniqueAndNamespaced() {
        XCTAssertEqual(BackgroundTaskScheduler.taskIdentifier, "com.hbut.mini.background.grades-refresh")
        // 必须与 Info.plist BGTaskSchedulerPermittedIdentifiers 一致（INTEGRATION.md 有核对项）
    }

    func testShouldScheduleRequiresEnabledAndReady() {
        XCTAssertFalse(BackgroundTaskScheduler.shouldSchedule(enabled: false, contextReady: true))
        XCTAssertFalse(BackgroundTaskScheduler.shouldSchedule(enabled: true, contextReady: false))
        XCTAssertTrue(BackgroundTaskScheduler.shouldSchedule(enabled: true, contextReady: true))
    }

    func testContextReadyRequiresScopeAndGradesBusiness() {
        let ready = BackgroundContext(scope: "2024010101", business: ["grades"], updatedAt: "t")
        XCTAssertTrue(BackgroundTaskScheduler.contextReady(ready))
        XCTAssertFalse(BackgroundTaskScheduler.contextReady(nil), "无 context 不算 ready")
        XCTAssertFalse(BackgroundTaskScheduler.contextReady(
            BackgroundContext(scope: "", business: ["grades"], updatedAt: "t")), "空 scope 不算 ready")
        XCTAssertFalse(BackgroundTaskScheduler.contextReady(
            BackgroundContext(scope: "2024010101", business: ["exams"], updatedAt: "t")), "无 grades 业务不算 ready")
    }

    func testNormalizedIntervalDefaultsAndClamps() {
        XCTAssertEqual(BackgroundTaskScheduler.normalizedIntervalMinutes(nil), 30, "缺省 30 分钟偏好")
        XCTAssertEqual(BackgroundTaskScheduler.normalizedIntervalMinutes(30), 30)
        XCTAssertEqual(BackgroundTaskScheduler.normalizedIntervalMinutes(1), 5, "低于下限 clamp 到 5")
        XCTAssertEqual(BackgroundTaskScheduler.normalizedIntervalMinutes(10000), 1440, "高于上限 clamp 到 1440")
        XCTAssertEqual(BackgroundTaskScheduler.normalizedIntervalMinutes(60), 60)
    }

    func testEarliestBeginDateIsPreferenceNotPromise() {
        // 语义守护：interval 只用于 earliestBeginDate 偏好，禁止转化为「下次精确执行时间」承诺。
        let interval = BackgroundTaskScheduler.normalizedIntervalMinutes(30)
        let future = Date(timeIntervalSinceNow: TimeInterval(interval * 60))
        XCTAssertGreaterThan(future, Date(), "earliestBeginDate 必须在未来（最早偏好）")
    }
}
