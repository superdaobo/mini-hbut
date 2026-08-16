// BackgroundStore 测试（#613 扩展部分）：baseline 按 scope 存取/清理、事件容量上限、
// 损坏文件安全降级。运行：cd ios && swift test（macOS）。

import XCTest
@testable import HbutBackgroundPlugin

final class BackgroundStoreTests: XCTestCase {

    private var dir: URL!
    private var store: BackgroundStore!

    override func setUp() {
        super.setUp()
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-store-test-\(UUID().uuidString)", isDirectory: true)
        store = try! BackgroundStore(dir: dir)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
        super.tearDown()
    }

    // MARK: - baseline

    func testSetAndLoadBaselinePerScope() throws {
        try store.setGradesBaseline(signature: "sig-a", scope: "account-a", updatedAt: "1700000000Z")
        try store.setGradesBaseline(signature: "sig-b", scope: "account-b", updatedAt: "1700000001Z")
        XCTAssertEqual(store.loadGradesBaseline(scope: "account-a")?.signature, "sig-a")
        XCTAssertEqual(store.loadGradesBaseline(scope: "account-b")?.signature, "sig-b")
        XCTAssertNil(store.loadGradesBaseline(scope: "account-c"), "未设置的 scope 必须返回 nil")
    }

    func testSetBaselineOverwritesSameScope() throws {
        try store.setGradesBaseline(signature: "v1", scope: "a", updatedAt: "1700000000Z")
        try store.setGradesBaseline(signature: "v2", scope: "a", updatedAt: "1700000001Z")
        XCTAssertEqual(store.loadGradesBaseline(scope: "a")?.signature, "v2")
    }

    func testClearScopeRemovesBaseline() throws {
        try store.setGradesBaseline(signature: "sig-a", scope: "account-a", updatedAt: "1700000000Z")
        try store.setGradesBaseline(signature: "sig-b", scope: "account-b", updatedAt: "1700000001Z")
        let (cleared, removed) = try store.clearScope("account-a")
        XCTAssertTrue(cleared)
        XCTAssertEqual(removed, 0)
        XCTAssertNil(store.loadGradesBaseline(scope: "account-a"))
        XCTAssertNotNil(store.loadGradesBaseline(scope: "account-b"), "其他账号 baseline 必须保留")
    }

    func testBaselineFileSchemaGuarded() throws {
        // 未来版本 baseline 文件：安全降级为空表，不 crash
        let baselineFile = dir.appendingPathComponent(BackgroundStore.baselineFile)
        try Data(#"{"schema":999,"baselines":{"a":{"signature":"x","updatedAt":"t"}}}"#.utf8)
            .write(to: baselineFile, options: .atomic)
        XCTAssertEqual(store.loadGradesBaseline().baselines.count, 0, "未来版本必须降级为空表")
    }

    // MARK: - 事件容量上限

    func testEventsCapAtFifty() throws {
        for i in 0..<60 {
            try store.appendEvent(BackgroundEvent(
                id: "evt-\(i)", source: .ios, kind: "grades_changed",
                scope: "account-a", occurredAt: "1700000000Z"
            ))
        }
        let events = store.loadEvents()
        XCTAssertEqual(events.count, eventInboxCap, "事件数不得超过容量上限")
        XCTAssertEqual(events.last?.id, "evt-59", "保留最新事件")
        XCTAssertEqual(events.first?.id, "evt-10", "超出容量丢弃最旧")
    }

    func testConsumeEventsReturnsAndRemoves() throws {
        for i in 0..<3 {
            try store.appendEvent(BackgroundEvent(
                id: "evt-\(i)", source: .ios, kind: "grades_changed",
                scope: "account-a", occurredAt: "1700000000Z"
            ))
        }
        let consumed = try store.consumeEvents(limit: 2)
        XCTAssertEqual(consumed.events.map(\.id), ["evt-0", "evt-1"])
        XCTAssertEqual(consumed.remaining, 1)
        XCTAssertEqual(store.loadEvents().map(\.id), ["evt-2"])
    }

    // MARK: - 损坏文件安全降级

    func testCorruptStateFileDegradesSafely() throws {
        let stateFile = dir.appendingPathComponent(BackgroundStore.stateFile)
        try Data("not-json".utf8).write(to: stateFile, options: .atomic)
        XCTAssertNil(store.loadState(), "损坏文件必须返回 nil 不 crash")
    }

    func testFutureSchemaConfigDegrades() throws {
        let configFile = dir.appendingPathComponent(BackgroundStore.configFile)
        try Data(#"{"schema":999,"enabled":true}"#.utf8).write(to: configFile, options: .atomic)
        let config = store.loadConfig()
        XCTAssertEqual(config.enabled, false, "未来版本配置必须降级为默认值")
    }
}
