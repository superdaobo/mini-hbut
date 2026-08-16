// ExamSignatureV1 单测（#615）：fixture 驱动，验证与 Android 同一业务规则。
//
// fixture 读取「共享优先、本地回退」：
//   - 插件根 contract-fixtures/exams-signature-v1.json（#615 已冻结，2026-08-13，单一事实源）；
//   - 共享版缺失时回退本地 Fixtures/exams-signature-v1.json（内容与共享版一致）。
// 运行：cd ios && swift test（macOS；Windows 无法本地构建 Swift）

import XCTest
@testable import HbutBackgroundPlugin

final class ExamSignatureV1Tests: XCTestCase {

    // MARK: - fixture 读取

    private func examsFixtureData() throws -> Data {
        let pluginRoot = URL(fileURLWithPath: #file)
            .deletingLastPathComponent() // Tests/HbutBackgroundPluginTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // 插件根
        let shared = pluginRoot
            .appendingPathComponent("contract-fixtures")
            .appendingPathComponent("exams-signature-v1.json")
        if FileManager.default.fileExists(atPath: shared.path) {
            return try Data(contentsOf: shared)
        }
        let local = pluginRoot
            .appendingPathComponent("ios")
            .appendingPathComponent("Tests/HbutBackgroundPluginTests")
            .appendingPathComponent("Fixtures/exams-signature-v1.json")
        return try Data(contentsOf: local)
    }

    private struct ExamsFixture: Decodable {
        struct Case: Decodable {
            let name: String
            let records: [ExamRecord]
            let expectedSignature: String
        }
        let schema: Int
        let version: String
        let cases: [Case]
    }

    private func loadFixture() throws -> ExamsFixture {
        let data = try examsFixtureData()
        return try JSONDecoder().decode(ExamsFixture.self, from: data)
    }

    private func signature(for name: String) throws -> (computed: String, expected: String) {
        let fixture = try loadFixture()
        guard let testCase = fixture.cases.first(where: { $0.name == name }) else {
            throw XCTSkip("fixture 缺少 case: \(name)")
        }
        return (ExamSignatureV1.compute(records: testCase.records), testCase.expectedSignature)
    }

    // MARK: - fixture 契约（9 类验收 case）

    func testFixtureSchemaAndVersion() throws {
        let fixture = try loadFixture()
        XCTAssertEqual(fixture.schema, 1)
        XCTAssertEqual(fixture.version, "v1")
        let names = Set(fixture.cases.map(\.name))
        for required in ["first-baseline", "identical-data", "array-order-changed",
                         "new-exam-added", "exam-removed", "date-changed",
                         "time-changed", "location-changed", "unrelated-field-changed"] {
            XCTAssertTrue(names.contains(required), "fixture 缺少必需 case: \(required)")
        }
    }

    func testAllCasesMatchExpectedSignatures() throws {
        let fixture = try loadFixture()
        for testCase in fixture.cases {
            let computed = ExamSignatureV1.compute(records: testCase.records)
            XCTAssertEqual(
                computed, testCase.expectedSignature,
                "case '\(testCase.name)' 计算签名与 fixture 预期不一致（跨端契约破坏）"
            )
        }
    }

    func testSameDataOrderAndUnrelatedFieldsDoNotChangeSignature() throws {
        let baseline = try signature(for: "first-baseline").computed
        XCTAssertEqual(try signature(for: "identical-data").computed, baseline)
        XCTAssertEqual(try signature(for: "array-order-changed").computed, baseline, "数组顺序变化不得误报")
        XCTAssertEqual(try signature(for: "unrelated-field-changed").computed, baseline, "无关字段变化不得误报")
    }

    func testBusinessChangesChangeSignature() throws {
        let baseline = try signature(for: "first-baseline").computed
        XCTAssertNotEqual(try signature(for: "new-exam-added").computed, baseline, "新增考试必须检测到变化")
        XCTAssertNotEqual(try signature(for: "exam-removed").computed, baseline, "删除考试必须检测到变化")
        XCTAssertNotEqual(try signature(for: "date-changed").computed, baseline, "日期变化必须检测到变化")
        XCTAssertNotEqual(try signature(for: "time-changed").computed, baseline, "时间变化必须检测到变化")
        XCTAssertNotEqual(try signature(for: "location-changed").computed, baseline, "地点变化必须检测到变化")
    }

    // MARK: - 边界

    func testEmptyRecordsProduceEmptySignature() {
        XCTAssertEqual(ExamSignatureV1.compute(records: []), "")
    }

    func testRecordsWithBlankCourseNameAreSkipped() {
        let records = [
            ExamRecord(courseName: "   ", examDate: "2026-06-22"),
            ExamRecord(courseName: ""),
        ]
        XCTAssertEqual(ExamSignatureV1.compute(records: records), "")
    }

    func testWhitespaceAndNilAreEquivalent() {
        let a = [ExamRecord(courseName: "高数", examDate: "2026-06-22", examTime: "09:00-11:00", location: "教1-101", seatNo: "12", examType: "正常考试")]
        let b = [ExamRecord(courseName: " 高数 ", examDate: " 2026-06-22 ", examTime: " 09:00-11:00 ", location: " 教1-101 ", seatNo: " 12 ", examType: " 正常考试 ")]
        XCTAssertEqual(ExamSignatureV1.compute(records: a), ExamSignatureV1.compute(records: b))
    }

    func testUnrelatedFieldsAreIgnoredByDecoder() throws {
        // 无关字段（rawId/updatedAt/roomId）不参与签名：解码时被 Codable 忽略
        let json = #"[{"courseName":"高数","examDate":"2026-06-22","examTime":"09:00-11:00","rawId":"e-1","updatedAt":"2026-08-13"}]"#
        let data = try XCTUnwrap(json.data(using: .utf8))
        let records = try JSONDecoder().decode([ExamRecord].self, from: data)
        XCTAssertEqual(records.count, 1)
        XCTAssertEqual(records[0].courseName, "高数")
    }
}
