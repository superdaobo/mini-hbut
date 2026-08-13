// SchoolInboxCheckCoordinator 状态机测试（#615 Part B）：
// 覆盖首次 known-ID baseline 不推历史 / 新到未读只通知一次 / 已读不通知 /
// provider unsupported 诚实标记 / 错误映射 / 事件不含正文。

import XCTest
@testable import HbutBackgroundPlugin

// MARK: - Mocks

final class MockSchoolInboxFetcher: SchoolInboxFetching {
    var result: Result<[SchoolMessageItem], SchoolInboxFetchError> = .success([])
    var fetchCount = 0
    var cancelled = false

    func fetchInbox(envelope: SecureEnvelope, completion: @escaping (Result<[SchoolMessageItem], SchoolInboxFetchError>) -> Void) {
        fetchCount += 1
        completion(result)
    }

    func cancel() { cancelled = true }
}

final class SchoolInboxCheckCoordinatorTests: XCTestCase {

    private var dir: URL!
    private var store: BackgroundStore!
    private var baselineStore: BusinessBaselineStore!
    private var fetcher: MockSchoolInboxFetcher!
    private var secureStore: MockSecureStore!
    private var notifier: MockNotifier!
    private var coordinator: SchoolInboxCheckCoordinator!

    private var nowValue = "1700000000Z"

    override func setUp() {
        super.setUp()
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-school-test-\(UUID().uuidString)", isDirectory: true)
        store = try! BackgroundStore(dir: dir)
        baselineStore = try! BusinessBaselineStore(dir: dir)
        fetcher = MockSchoolInboxFetcher()
        secureStore = MockSecureStore()
        notifier = MockNotifier()
        coordinator = SchoolInboxCheckCoordinator(
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

    private func enableConfig(business: [String] = ["school_inbox"]) throws {
        try store.saveConfig(BackgroundConfig(enabled: true, business: business, scope: "2024010101"))
    }

    private func setupContext(scope: String = "2024010101", business: [String] = ["school_inbox"]) throws {
        try store.saveContext(BackgroundContext(scope: scope, business: business, updatedAt: "1700000000Z"))
    }

    private func setupEnvelope(scope: String = "2024010101") {
        secureStore.envelope = SecureEnvelope(
            scope: scope,
            endpoint: "https://example.test/portal",
            headers: ["Cookie": "session=test"],
            updatedAt: "1700000000Z"
        )
    }

    private func item(_ id: String, title: String = "通知", isRead: Bool = false) -> SchoolMessageItem {
        SchoolMessageItem(id: "portal:tzsjx:\(id)", title: title, isRead: isRead, provider: "portal")
    }

    private func runOnce(_ source: CheckRunSource = .manual) -> SchoolInboxCheckOutcome {
        var result: SchoolInboxCheckOutcome = .busy
        let exp = expectation(description: "runOnce")
        coordinator.runOnce(source: source) { outcome in
            result = outcome
            exp.fulfill()
        }
        wait(for: [exp], timeout: 5)
        return result
    }

    // MARK: - 功能开关 / context

    func testDisabledConfigReturnsDisabled() throws {
        try store.saveConfig(BackgroundConfig(enabled: false, business: ["school_inbox"], scope: "2024010101"))
        try setupContext()
        XCTAssertEqual(runOnce(), .disabled)
        XCTAssertEqual(fetcher.fetchCount, 0)
    }

    func testMissingEnvelopeReturnsAuthUnavailable() throws {
        try enableConfig()
        try setupContext()
        XCTAssertEqual(runOnce(), .authUnavailable)
        XCTAssertEqual(fetcher.fetchCount, 0)
    }

    // MARK: - 首次 baseline 不推历史（#23/#201 语义）

    func testFirstSyncEstablishesBaselineWithoutNotifyingHistory() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([item("1"), item("2", isRead: true), item("3")])
        let outcome = runOnce()
        XCTAssertEqual(outcome, .baselineEstablished)
        XCTAssertEqual(notifier.postedCount, 0, "首次不批量推历史消息")
        XCTAssertTrue(store.loadEvents().isEmpty, "首次不产生事件")
        let state = baselineStore.loadSchoolState(scope: "2024010101")
        XCTAssertEqual(
            state?.knownIds,
            ["portal:tzsjx:1", "portal:tzsjx:2", "portal:tzsjx:3"],
            "knownIds 必须落盘"
        )
    }

    // MARK: - 新消息规则

    func testNewUnreadMessageNotifiesOnceWithPerMessageEvent() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([item("1")])
        _ = runOnce()

        fetcher.result = .success([item("2"), item("1")])
        let outcome = runOnce()
        guard case .changed(let count, let shown) = outcome else {
            return XCTFail("新未读消息必须 changed，实际 \(outcome)")
        }
        XCTAssertEqual(count, 1)
        XCTAssertTrue(shown)
        XCTAssertEqual(notifier.postedCount, 1, "新未读消息只通知一次")
        let events = store.loadEvents()
        XCTAssertEqual(events.count, 1, "每条消息一个事件")
        XCTAssertEqual(events[0].kind, "school_message")
        XCTAssertEqual(events[0].payload["signature"]?.stringValue, "portal:tzsjx:2", "eventKey = provider+messageId")
        let meta = events[0].payload["meta"]
        if case .object(let dict)? = meta {
            XCTAssertEqual(dict["provider"]?.stringValue, "portal")
            XCTAssertNotNil(dict["title"], "事件只存短 title，不存正文")
        } else {
            XCTFail("事件 meta 结构缺失")
        }
    }

    func testNewButReadMessageIsNotNotified() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([item("1")])
        _ = runOnce()

        fetcher.result = .success([item("2", isRead: true), item("1")])
        let outcome = runOnce()
        XCTAssertEqual(outcome, .noNewMessages, "已读新消息不通知")
        XCTAssertEqual(notifier.postedCount, 0)
        XCTAssertTrue(store.loadEvents().isEmpty)
    }

    func testKnownMessageNeverRenotifiedAfterContextRebuild() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([item("1")])
        _ = runOnce()

        // 重新登录/context 重建（同 scope）：knownIds 持久化，历史消息不再推送（#201 语义）
        try setupContext()
        fetcher.result = .success([item("1"), item("2")])
        let outcome = runOnce()
        guard case .changed(let count, _) = outcome else {
            return XCTFail("只有真正新到的消息才通知，实际 \(outcome)")
        }
        XCTAssertEqual(count, 1)
        XCTAssertEqual(notifier.postedCount, 1)
    }

    // MARK: - provider unsupported（诚实标记）

    func testUnsupportedProviderIsHonest() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .failure(.unsupported("后台无可用学校消息 provider"))
        let outcome = runOnce()
        guard case .unsupported(let message) = outcome else {
            return XCTFail("必须返回 unsupported，实际 \(outcome)")
        }
        XCTAssertFalse(message.isEmpty)
        XCTAssertTrue(store.loadEvents().isEmpty, "不写事件")
        XCTAssertEqual(notifier.postedCount, 0, "不算网络错误")
        XCTAssertTrue(baselineStore.loadSchoolState(scope: "2024010101")?.unsupported == true, "必须诚实标记 unsupported")
    }

    // MARK: - 错误映射

    func testNetworkFailureMapsToNetworkUnavailable() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .failure(.networkUnavailable("无网"))
        XCTAssertEqual(runOnce(), .networkUnavailable)
    }

    func testParseErrorDoesNotUpdateKnownIds() throws {
        try enableConfig()
        try setupContext()
        setupEnvelope()
        fetcher.result = .success([item("1")])
        _ = runOnce()
        fetcher.result = .failure(.parse("JSON 解析失败"))
        XCTAssertEqual(runOnce(), .parseError)
        XCTAssertEqual(
            baselineStore.loadSchoolState(scope: "2024010101")?.knownIds,
            ["portal:tzsjx:1"],
            "解析失败不得改变 knownIds"
        )
    }
}
