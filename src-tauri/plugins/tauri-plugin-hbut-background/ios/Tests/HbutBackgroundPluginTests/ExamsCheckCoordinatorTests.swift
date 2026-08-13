// ExamsCheckCoordinator 状态机测试（#615 Part A）：
// 覆盖 disabled/未配置/无安全材料/无网/auth 过期/parse 失败/首次 baseline/
// 无变化/变化一次事件+通知/顺序无关/权限关闭/source 区分/并发互斥。
// 依赖全部注入 mock（fetcher/secureStore/notifier/baselineStore），不触网、不发真通知。

import XCTest
@testable import HbutBackgroundPlugin

// MARK: - Mocks

final class MockExamsFetcher: ExamsFetching {
    var result: Result<[ExamRecord], ExamsFetchError> = .success([])
    var fetchCount = 0
    var cancelled = false
    var delay: TimeInterval = 0

    func fetchExams(envelope: SecureEnvelope, completion: @escaping (Result<[ExamRecord], ExamsFetchError>) -> Void) {
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

final class ExamsCheckCoordinatorTests: XCTestCase {

    private var dir: URL!
    private var store: BackgroundStore!
    private var baselineStore: BusinessBaselineStore!
    private var fetcher: MockExamsFetcher!
    private var secureStore: MockSecureStore!
    private var notifier: MockNotifier!
    private var coordinator: ExamsCheckCoordinator!

    private var nowValue = "1700000000Z"

    override func setUp() {
        super.setUp()
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-exams-test-\(UUID().uuidString)", isDirectory: true)
        store = try! BackgroundStore(dir: dir)
        baselineStore = try! BusinessBaselineStore(dir: dir)
        fetcher = MockExamsFetcher()
        secureStore = MockSecureStore()
        notifier = MockNotifier()
        coordinator = ExamsCheckCoordinator(
            store: store,
            baselineStore: baselineStore,
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

    private func enableConfig(business: [String] = ["exams"]) throws {
        try store.saveConfig(BackgroundConfig(enabled: true, business: business, scope: "2024010101"))
    }

    private func setupContext(scope: String = "2024010101", business: [String] = ["exams"]) throws {
        try store.saveContext(BackgroundContext(scope: scope, business: business, updatedAt: "1700000000Z"))
    }

    private func setupEnvelope(scope: String = "2024010101") {
        secureStore.envelope = SecureEnvelope(
            scope: scope,
            endpoint: "https://example.test/exams",
            headers: ["Cookie": "session=test"],
            updatedAt: "1700000000Z"
        )
    }

    private func mathExam() -> ExamRecord {
        ExamRecord(courseName: "高等数学A", examDate: "2026-06-22", examTime: "09:00-11:00", location: "教1-101", seatNo: "12", examType: "正常考试")
    }

    private func englishExam() -> ExamRecord {
        ExamRecord(courseName: "大学英语", examDate: "2026-06-25", examTime: "14:00-16:00", location: "教2-305", seatNo: "8", examType: "正常考试")
    }

    private func runOnce(_ source: CheckRunSource = .manual) -> ExamsCheckOutcome {
        var result: ExamsCheckOutcome = .busy
        let exp = expectation(description: "runOnce")
        coordinator.runOnce(source: source) { outcome in
            result = outcome
            exp.fulfill()
        }
        wait(for: [exp], timeout: 5)
        return result
    }

    // MARK: - 功能开关 / context / 安全材料

    func testDisabledConfigReturnsDisabled() throws {
        try store.saveConfig(BackgroundConfig(enabled: false, business: ["exams"], scope: "2024010101"))
        try setupContext()
        let outcome = runOnce()
        XCTAssertEqual(outcome, .disabled)
        XCTAssertEqual(fetcher.fetchCount, 0, "禁用时不得触网")
    }

    func testBusinessWithoutExamsReturnsNotConfigured() throws {
        try enableConfig(business: ["grades"])
        try setupContext(business: ["grades"])
        let outcome = runOnce()
        XCTAssertEqual(outcome, .notConfigured)
        XCTAssertEqual(fetcher.fetchCount, 0)
    }

    func testMissingEnvelopeReturnsAuthUnavailable() throws {
        try enableConfig()
        try setupContext()
        let outcome = runOnce()
        XCTAssertEqual(outcome, .authUnavailable)
        XCTAssertEqual(fetcher.fetchCount, 0, "无安全材料不触网")
    }

    // MARK: - Baseline / Diff

    func testFirstSuccessEstablishesBaselineWithoutNotification() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam(), englishExam()])
        let outcome = runOnce()
        XCTAssertEqual(outcome, .baselineEstablished)
        XCTAssertEqual(notifier.postedCount, 0, "首次不通知历史考试")
        XCTAssertTrue(store.loadEvents().isEmpty, "首次不产生事件")
        let baseline = baselineStore.loadExamsBaseline(scope: "2024010101")
        XCTAssertNotNil(baseline)
        XCTAssertEqual(
            baseline?.signature,
            ExamSignatureV1.compute(records: [mathExam(), englishExam()]),
            "baseline 必须与 fixture 算法一致"
        )
    }

    func testIdenticalDataDoesNotNotify() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam()])
        _ = runOnce()
        fetcher.result = .success([mathExam()])
        let outcome = runOnce()
        XCTAssertEqual(outcome, .noChange, "同 signature 不重复通知")
        XCTAssertEqual(notifier.postedCount, 0)
        XCTAssertTrue(store.loadEvents().isEmpty)
    }

    func testArrayOrderChangeDoesNotNotify() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam(), englishExam()])
        _ = runOnce()
        fetcher.result = .success([englishExam(), mathExam()])
        let outcome = runOnce()
        XCTAssertEqual(outcome, .noChange, "数组顺序变化不触发 exams_changed")
        XCTAssertEqual(notifier.postedCount, 0)
    }

    func testAddedExamProducesOneEventAndOneNotification() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam()])
        _ = runOnce()
        fetcher.result = .success([mathExam(), englishExam()])
        let outcome = runOnce()
        guard case .changed = outcome else {
            return XCTFail("新增考试必须 changed，实际 \(outcome)")
        }
        XCTAssertEqual(notifier.postedCount, 1)
        let events = store.loadEvents()
        XCTAssertEqual(events.count, 1)
        XCTAssertEqual(events[0].kind, "exams_changed")
        XCTAssertEqual(events[0].payload["targetView"]?.stringValue, "exams")
    }

    func testDateAndLocationChangesProduceEvents() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam()])
        _ = runOnce()

        // 日期变化
        var changed = mathExam()
        changed.examDate = "2026-06-23"
        fetcher.result = .success([changed])
        guard case .changed = runOnce() else {
            return XCTFail("日期变化必须触发")
        }

        // 地点变化
        changed.location = "教5-502"
        fetcher.result = .success([changed])
        guard case .changed = runOnce() else {
            return XCTFail("地点变化必须触发")
        }
        XCTAssertEqual(notifier.postedCount, 2)
    }

    func testNotificationPermissionDeniedStillSucceeds() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        notifier.authorization = .denied
        fetcher.result = .success([mathExam()])
        _ = runOnce()
        fetcher.result = .success([mathExam(), englishExam()])
        let outcome = runOnce()
        guard case .changed(let shown) = outcome else {
            return XCTFail("权限关闭时业务仍算成功，实际 \(outcome)")
        }
        XCTAssertFalse(shown, "权限关闭必须标记未展示")
        XCTAssertEqual(notifier.postedCount, 0)
    }

    // MARK: - 错误映射

    func testNetworkFailureMapsToNetworkUnavailable() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .failure(.networkUnavailable("无网"))
        let outcome = runOnce()
        XCTAssertEqual(outcome, .networkUnavailable)
        XCTAssertNil(baselineStore.loadExamsBaseline(scope: "2024010101"), "失败不得建立 baseline")
    }

    func testAuthExpiredMapsToAuthExpired() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .failure(.authExpired("HTTP 401"))
        let outcome = runOnce()
        XCTAssertEqual(outcome, .authExpired)
    }

    func testParseErrorDoesNotUpdateBaseline() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam()])
        _ = runOnce()
        fetcher.result = .failure(.parse("响应缺少 results/items"))
        let outcome = runOnce()
        XCTAssertEqual(outcome, .parseError)
        XCTAssertEqual(
            baselineStore.loadExamsBaseline(scope: "2024010101")?.signature,
            ExamSignatureV1.compute(records: [mathExam()]),
            "解析失败不得改变 baseline"
        )
    }

    // MARK: - source 区分 / 并发互斥

    func testEventRecordsRunSource() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([mathExam()])
        _ = runOnce()
        fetcher.result = .success([mathExam(), englishExam()])
        _ = runOnce(.system)
        let event = store.loadEvents().last
        XCTAssertEqual(event?.payload["runSource"]?.stringValue, "system")
    }

    func testConcurrentRunIsSerialized() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.delay = 0.2
        fetcher.result = .success([mathExam()])

        let first = expectation(description: "first")
        var firstOutcome: ExamsCheckOutcome = .busy
        coordinator.runOnce(source: .manual) { firstOutcome = $0; first.fulfill() }

        let second = expectation(description: "second")
        var secondOutcome: ExamsCheckOutcome = .busy
        coordinator.runOnce(source: .manual) { secondOutcome = $0; second.fulfill() }

        wait(for: [first, second], timeout: 5)
        XCTAssertEqual(firstOutcome, .baselineEstablished)
        XCTAssertEqual(secondOutcome, .busy, "并发必须互斥")
    }
}
