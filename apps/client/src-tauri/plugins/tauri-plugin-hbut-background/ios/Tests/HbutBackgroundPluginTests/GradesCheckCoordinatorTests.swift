// GradesCheckCoordinator 状态机测试（#613）：
// 覆盖 disabled/未配置/无安全材料/无网/auth 过期/parse 失败/首次 baseline/
// 无变化/变化一次事件+通知/幂等/权限关闭/source 区分/并发互斥。
// 依赖全部注入 mock（fetcher/secureStore/notifier），不触网、不发真通知。

import XCTest
@testable import HbutBackgroundPlugin

// MARK: - Mocks

final class MockFetcher: GradeFetching {
    var result: Result<[GradeRecord], GradesFetchError> = .success([])
    var fetchCount = 0
    var cancelled = false
    /// 模拟网络延迟（并发互斥测试用）。
    var delay: TimeInterval = 0

    func fetchGrades(envelope: SecureEnvelope, completion: @escaping (Result<[GradeRecord], GradesFetchError>) -> Void) {
        fetchCount += 1
        if delay > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                completion(self.result)
            }
        } else {
            completion(result)
        }
    }

    func cancel() { cancelled = true }
}

final class MockSecureStore: SecureEnvelopeProviding {
    var envelope: SecureEnvelope?

    func load(scope: String) -> SecureEnvelope? {
        envelope
    }
}

final class MockNotifier: NotificationPosting {
    var authorization: NotificationAuthorization = .authorized
    var postedCount = 0
    var postResult = true

    func authorizationStatus(completion: @escaping (NotificationAuthorization) -> Void) {
        completion(authorization)
    }

    func post(title: String, body: String, userInfo: [String: String], completion: @escaping (Bool) -> Void) {
        postedCount += 1
        completion(postResult)
    }
}

final class GradesCheckCoordinatorTests: XCTestCase {

    private var dir: URL!
    private var store: BackgroundStore!
    private var fetcher: MockFetcher!
    private var secureStore: MockSecureStore!
    private var notifier: MockNotifier!
    private var coordinator: GradesCheckCoordinator!

    private var nowValue = "1700000000Z"

    override func setUp() {
        super.setUp()
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-test-\(UUID().uuidString)", isDirectory: true)
        store = try! BackgroundStore(dir: dir)
        fetcher = MockFetcher()
        secureStore = MockSecureStore()
        notifier = MockNotifier()
        coordinator = GradesCheckCoordinator(
            store: store,
            secureStore: secureStore,
            fetcher: fetcher,
            notifier: notifier,
            now: { [weak self] in self?.nowValue ?? "1700000000Z" }
        )
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
        super.tearDown()
    }

    // MARK: - 辅助

    private func enableConfig(business: [String] = ["grades"]) throws {
        try store.saveConfig(BackgroundConfig(enabled: true, business: business, scope: "2024010101"))
    }

    private func setupContext(scope: String = "2024010101", business: [String] = ["grades"]) throws {
        try store.saveContext(BackgroundContext(scope: scope, business: business, updatedAt: "1700000000Z"))
    }

    private func setupEnvelope(scope: String = "2024010101") {
        secureStore.envelope = SecureEnvelope(
            scope: scope,
            endpoint: "https://example.test/grades",
            headers: ["Cookie": "session=test"],
            updatedAt: "1700000000Z"
        )
    }

    private func baselineRecords() -> [GradeRecord] {
        [
            GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "92"),
            GradeRecord(courseName: "大学英语", courseType: "必修", credit: 3, score: "85"),
        ]
    }

    private func runOnce(_ source: CheckRunSource = .manual) -> CheckOutcome {
        var result: CheckOutcome = .busy
        let exp = expectation(description: "runOnce")
        coordinator.runOnce(source: source) { outcome in
            result = outcome
            exp.fulfill()
        }
        wait(for: [exp], timeout: 5)
        return result
    }

    // MARK: - feature 开关 / 配置

    func testDisabledReturnsQuicklyWithoutFetching() throws {
        try store.saveConfig(BackgroundConfig(enabled: false, business: ["grades"], scope: "2024010101"))
        try setupContext()
        setupEnvelope()
        XCTAssertEqual(runOnce(), .disabled)
        XCTAssertEqual(fetcher.fetchCount, 0, "disabled 时不得触网")
    }

    func testNotConfiguredWithoutContext() throws {
        try enableConfig()
        XCTAssertEqual(runOnce(), .notConfigured)
        XCTAssertEqual(fetcher.fetchCount, 0)
    }

    func testNotConfiguredWhenBusinessExcludesGrades() throws {
        try enableConfig(business: ["exams"])
        try setupContext(business: ["exams"])
        XCTAssertEqual(runOnce(), .notConfigured)
        XCTAssertEqual(fetcher.fetchCount, 0)
    }

    // MARK: - 安全边界

    func testAuthUnavailableStopsSafelyWithoutFetching() throws {
        try enableConfig()
        try setupContext()
        // secureStore.envelope 未设置 -> authUnavailable，不触网、不做后台重登录
        XCTAssertEqual(runOnce(), .authUnavailable)
        XCTAssertEqual(fetcher.fetchCount, 0)
        // 状态已记录非敏感 error 摘要
        let state = store.loadState()
        XCTAssertNotNil(state?.error, "状态应记录错误摘要")
        XCTAssertEqual(state?.lastRunOk, false)
    }

    // MARK: - 网络/认证/解析错误

    func testNetworkUnavailableRecordsState() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .failure(.networkUnavailable("无网络连接"))
        XCTAssertEqual(runOnce(), .networkUnavailable)
        XCTAssertEqual(store.loadState()?.lastRunOk, false)
        XCTAssertNotNil(store.loadState()?.error)
        XCTAssertNil(store.loadGradesBaseline(scope: "2024010101"), "失败不得建立 baseline")
    }

    func testAuthExpiredRecordsState() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .failure(.authExpired("HTTP 401"))
        XCTAssertEqual(runOnce(), .authExpired)
        XCTAssertEqual(store.loadState()?.lastRunOk, false)
        XCTAssertNil(store.loadGradesBaseline(scope: "2024010101"))
    }

    func testParseErrorDoesNotUpdateBaseline() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .failure(.parse("响应不是 JSON 数组或对象"))
        XCTAssertEqual(runOnce(), .parseError)
        XCTAssertNil(store.loadGradesBaseline(scope: "2024010101"), "parse 失败不得更新 baseline")
        XCTAssertEqual(store.loadEvents().count, 0, "parse 失败不得产生事件")
    }

    // MARK: - baseline / diff / 通知语义

    func testFirstBaselineDoesNotNotify() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success(baselineRecords())
        XCTAssertEqual(runOnce(), .baselineEstablished)
        XCTAssertNotNil(store.loadGradesBaseline(scope: "2024010101"), "首次成功必须建立 baseline")
        XCTAssertEqual(store.loadEvents().count, 0, "首次基线不得通知历史成绩")
        XCTAssertEqual(notifier.postedCount, 0)
        XCTAssertEqual(store.loadState()?.lastRunOk, true)
    }

    func testSameSignatureNoEventNoNotification() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success(baselineRecords())
        _ = runOnce()
        XCTAssertEqual(runOnce(), .noChange, "相同数据第二次调度必须 noChange")
        XCTAssertEqual(store.loadEvents().count, 0, "相同 signature 不得产生事件")
        XCTAssertEqual(notifier.postedCount, 0, "相同 signature 不得重复通知")
    }

    func testChangedProducesOneEventAndOneNotification() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success(baselineRecords())
        _ = runOnce() // 建立 baseline

        var changed = baselineRecords()
        changed[0] = GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "96")
        fetcher.result = .success(changed)
        XCTAssertEqual(runOnce(), .changed(notificationShown: true))

        // 一次 grades_changed event
        let events = store.loadEvents()
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].kind, "grades_changed")
        XCTAssertEqual(events[0].source, .ios)
        XCTAssertEqual(events[0].scope, "2024010101")
        XCTAssertEqual(events[0].payload["targetView"]?.stringValue, "grades")
        XCTAssertEqual(notifier.postedCount, 1)
        // baseline 已更新为最新
        let baseline = store.loadGradesBaseline(scope: "2024010101")
        XCTAssertEqual(baseline?.signature, GradeSignatureV1.compute(records: changed))
    }

    func testRepeatedRunWithSameSignatureAfterChangeDoesNotNotifyAgain() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success(baselineRecords())
        _ = runOnce()

        var changed = baselineRecords()
        changed[0] = GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "96")
        fetcher.result = .success(changed)
        _ = runOnce()
        XCTAssertEqual(notifier.postedCount, 1)

        // 同一变化再次调度（resume/runNow 重复）：幂等，不重复通知
        XCTAssertEqual(runOnce(), .noChange)
        XCTAssertEqual(notifier.postedCount, 1, "同 signature 不得重复通知")
        XCTAssertEqual(store.loadEvents().count, 1, "同 signature 不得重复产生事件")
    }

    func testEmptyDataEstablishesBaseline() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success([])
        XCTAssertEqual(runOnce(), .baselineEstablished, "空数据（如新学期无成绩）是合法状态")
        XCTAssertEqual(store.loadGradesBaseline(scope: "2024010101")?.signature, "")
    }

    func testEmptyDataThenGradesAppearsTriggersChange() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success([])
        _ = runOnce()
        fetcher.result = .success(baselineRecords())
        XCTAssertEqual(runOnce(), .changed(notificationShown: true), "空 baseline 后出现成绩必须视为变化")
    }

    // MARK: - 通知权限关闭

    func testNotificationDeniedStillBusinessSuccess() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        notifier.authorization = .denied
        fetcher.result = .success(baselineRecords())
        _ = runOnce() // baseline

        var changed = baselineRecords()
        changed[0] = GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "98")
        fetcher.result = .success(changed)
        let outcome = runOnce()
        guard case .changed(let shown) = outcome else {
            return XCTFail("权限关闭时检查仍应业务成功，got \(outcome)")
        }
        XCTAssertFalse(shown, "权限关闭时 notificationShown=false，但不视为网络/业务错误")
        XCTAssertEqual(notifier.postedCount, 0)
        XCTAssertEqual(store.loadEvents().count, 1, "事件仍应写入（event inbox 最终一致性，#614）")
        XCTAssertEqual(store.loadState()?.lastRunOk, true, "权限关闭不算失败")
    }

    // MARK: - runSource 区分（manual vs system）

    func testSystemRunSourceRecordedInEventPayload() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success(baselineRecords())
        _ = runOnce(.system)
        var changed = baselineRecords()
        changed[0] = GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "90")
        fetcher.result = .success(changed)
        _ = runOnce(.system)
        let event = try XCTUnwrap(store.loadEvents().first)
        XCTAssertEqual(event.payload["runSource"]?.stringValue, "system")
    }

    func testManualRunSourceRecordedInEventPayload() throws {
        try enableConfig(); try setupContext(); setupEnvelope()
        fetcher.result = .success(baselineRecords())
        _ = runOnce(.manual)
        var changed = baselineRecords()
        changed[0] = GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "89")
        fetcher.result = .success(changed)
        _ = runOnce(.manual)
        let event = try XCTUnwrap(store.loadEvents().first)
        XCTAssertEqual(event.payload["runSource"]?.stringValue, "manual")
    }

    // MARK: - 并发互斥

    func testConcurrentRunReturnsBusy() {
        // fetcher 延迟回调期间第二次 runOnce 必须返回 busy（同目录检查互斥）
        fetcher.delay = 0.3
        fetcher.result = .success(baselineRecords())
        let exp = expectation(description: "first")
        var firstOutcome: CheckOutcome = .busy
        coordinator.runOnce(source: .manual) { outcome in
            firstOutcome = outcome
            exp.fulfill()
        }
        XCTAssertEqual(runOnce(), .busy, "并发检查必须互斥")
        wait(for: [exp], timeout: 5)
        XCTAssertEqual(firstOutcome, .baselineEstablished)
    }

    // MARK: - 账号隔离

    func testBaselineIsScopedPerAccount() throws {
        try enableConfig(); try setupContext(scope: "account-a")
        setupEnvelope(scope: "account-a")
        fetcher.result = .success(baselineRecords())
        _ = runOnce()

        // 切换账号：新 context + 新 envelope + 新 baseline 互不污染
        try store.saveContext(BackgroundContext(scope: "account-b", business: ["grades"], updatedAt: "1700000000Z"))
        secureStore.envelope = SecureEnvelope(scope: "account-b", endpoint: "https://example.test/grades", headers: [:], updatedAt: "1700000000Z")
        fetcher.result = .success([])
        XCTAssertEqual(runOnce(), .baselineEstablished, "新账号无 baseline，必须重新建立且不误报")
        XCTAssertNotNil(store.loadGradesBaseline(scope: "account-a"), "旧账号 baseline 必须保留")
        XCTAssertNotNil(store.loadGradesBaseline(scope: "account-b"))
    }

    func testClearScopeRemovesBaselineAndEvents() throws {
        try enableConfig(); try setupContext()
        setupEnvelope()
        fetcher.result = .success(baselineRecords())
        _ = runOnce()
        var changed = baselineRecords()
        changed[0] = GradeRecord(courseName: "高等数学A", courseType: "必修", credit: 5, score: "91")
        fetcher.result = .success(changed)
        _ = runOnce()
        XCTAssertEqual(store.loadEvents().count, 1)

        _ = try store.clearScope("2024010101")
        XCTAssertNil(store.loadGradesBaseline(scope: "2024010101"), "clearScope 必须清理 baseline")
        XCTAssertEqual(store.loadEvents().count, 0, "clearScope 必须清理事件")
        XCTAssertNil(store.loadContext(), "clearScope 必须清理 context")
    }
}
