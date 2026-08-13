// BusinessBaselineStore 与 BusinessChecksRunner 单测（#615）：
// 持久化（roundtrip/scope 清理/损坏降级）与多 unit 编排（预算/隔离/串行）。

import XCTest
@testable import HbutBackgroundPlugin

// MARK: - BusinessBaselineStore

final class BusinessBaselineStoreTests: XCTestCase {

    private var dir: URL!

    override func setUp() {
        super.setUp()
        dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("hbut-baseline-test-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
        super.tearDown()
    }

    func testExamsBaselineRoundtripPerScope() throws {
        let store = try BusinessBaselineStore(dir: dir)
        try store.setExamsBaseline(signature: "sig-a", scope: "s1", updatedAt: "1700000000Z")
        try store.setExamsBaseline(signature: "sig-b", scope: "s2", updatedAt: "1700000001Z")
        XCTAssertEqual(store.loadExamsBaseline(scope: "s1")?.signature, "sig-a")
        XCTAssertEqual(store.loadExamsBaseline(scope: "s2")?.signature, "sig-b")
        XCTAssertNil(store.loadExamsBaseline(scope: "s3"))
    }

    func testSchoolStateRoundtripPerScope() throws {
        let store = try BusinessBaselineStore(dir: dir)
        let entry = SchoolInboxStateEntry(
            knownIds: ["portal:tzsjx:1"],
            notifiedKeys: ["portal:tzsjx:1"],
            provider: "portal",
            unsupported: false,
            updatedAt: "1700000000Z"
        )
        try store.setSchoolState(entry, scope: "s1")
        let loaded = store.loadSchoolState(scope: "s1")
        XCTAssertEqual(loaded?.knownIds, entry.knownIds)
        XCTAssertEqual(loaded?.provider, "portal")
        XCTAssertNil(store.loadSchoolState(scope: "s2"), "不同账号不串数据")
    }

    func testClearScopeRemovesOnlyMatchingScope() throws {
        let store = try BusinessBaselineStore(dir: dir)
        try store.setExamsBaseline(signature: "a", scope: "s1", updatedAt: "1700000000Z")
        try store.setExamsBaseline(signature: "b", scope: "s2", updatedAt: "1700000000Z")
        try store.setSchoolState(SchoolInboxStateEntry(knownIds: ["x"], provider: "portal", updatedAt: "1700000000Z"), scope: "s1")
        XCTAssertTrue(store.clearScope("s1"))
        XCTAssertNil(store.loadExamsBaseline(scope: "s1"))
        XCTAssertEqual(store.loadExamsBaseline(scope: "s2")?.signature, "b", "其他账号不受影响")
        XCTAssertNil(store.loadSchoolState(scope: "s1"))
        XCTAssertFalse(store.clearScope("s1"), "重复清理幂等")
    }

    func testCorruptFileDegradesToEmptyState() throws {
        let store = try BusinessBaselineStore(dir: dir)
        try store.setExamsBaseline(signature: "a", scope: "s1", updatedAt: "1700000000Z")
        try Data("{not json".utf8).write(to: dir.appendingPathComponent(BusinessBaselineStore.examsFile))
        XCTAssertNil(store.loadExamsBaseline(scope: "s1"), "损坏文件必须安全降级")
    }
}

// MARK: - BusinessChecksRunner

final class BusinessChecksRunnerTests: XCTestCase {

    func testRunsAllUnitsInOrderWithinBudget() {
        var order: [String] = []
        let runner = BusinessChecksRunner(units: [
            BusinessCheckUnit(name: "grades", run: { _, done in order.append("grades"); done("unchanged") }, cancel: {}),
            BusinessCheckUnit(name: "exams", run: { _, done in order.append("exams"); done("baselined") }, cancel: {}),
            BusinessCheckUnit(name: "school", run: { _, done in order.append("school"); done("unsupported") }, cancel: {}),
        ])
        let exp = expectation(description: "runAll")
        var summary: BusinessRunSummary?
        runner.runAll(source: .manual) { summary = $0; exp.fulfill() }
        wait(for: [exp], timeout: 5)
        XCTAssertEqual(order, ["grades", "exams", "school"], "必须按优先级顺序执行")
        XCTAssertEqual(summary?.outcomes, ["grades=unchanged", "exams=baselined", "school=unsupported"])
    }

    func testOneUnitFailureDoesNotBlockOthers() {
        // 失败隔离：#615 验收——考试失败不阻止学校消息检查
        var ranSchool = false
        let runner = BusinessChecksRunner(units: [
            BusinessCheckUnit(name: "exams", run: { _, done in done("network-unavailable") }, cancel: {}),
            BusinessCheckUnit(name: "school", run: { _, done in ranSchool = true; done("baselined") }, cancel: {}),
        ])
        let exp = expectation(description: "runAll")
        runner.runAll(source: .system) { _ in exp.fulfill() }
        wait(for: [exp], timeout: 5)
        XCTAssertTrue(ranSchool, "前一个 unit 失败不得阻止后一个 unit")
    }

    func testBudgetExhaustedSkipsRemainingUnits() {
        var ranSchool = false
        // 模拟时间流逝：exams unit 执行后推进 100s，使 deadline 过去 -> school 被跳过
        var fakeNow = Date()
        let runner = BusinessChecksRunner(
            units: [
                BusinessCheckUnit(name: "exams", run: { _, done in
                    fakeNow = fakeNow.addingTimeInterval(100)
                    done("unchanged")
                }, cancel: {}),
                BusinessCheckUnit(name: "school", run: { _, done in ranSchool = true; done("baselined") }, cancel: {}),
            ],
            now: { fakeNow }
        )
        let exp = expectation(description: "runAll")
        var summary: BusinessRunSummary?
        runner.runAll(source: .system) { summary = $0; exp.fulfill() }
        wait(for: [exp], timeout: 5)
        XCTAssertFalse(ranSchool, "预算不足必须跳过剩余 unit")
        XCTAssertTrue(summary?.outcomes.contains { $0.hasSuffix("skipped(预算不足)") } == true)
    }

    func testConcurrentRunIsSerialized() {
        let runner = BusinessChecksRunner(units: [
            BusinessCheckUnit(name: "grades", run: { _, done in
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.1) { done("changed") }
            }, cancel: {})
        ])
        let first = expectation(description: "first")
        var firstOutcomes: [String] = []
        runner.runAll(source: .manual) { firstOutcomes = $0.outcomes; first.fulfill() }
        let second = expectation(description: "second")
        var secondOutcomes: [String] = []
        runner.runAll(source: .manual) { secondOutcomes = $0.outcomes; second.fulfill() }
        wait(for: [first, second], timeout: 5)
        XCTAssertEqual(firstOutcomes, ["grades=changed"])
        XCTAssertEqual(secondOutcomes, ["busy"], "并发必须互斥")
    }
}
