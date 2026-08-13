// GradeSignatureV1 单测（#613）：fixture 驱动，验证与 Android 同一业务规则。
//
// fixture 读取「共享优先、本地回退」：
//   - 插件根 contract-fixtures/grades-signature-v1.json（#612 已冻结，2026-08-13，单一事实源）；
//   - 共享版缺失时回退本地 Fixtures/grades-signature-v1.json（内容与共享版一致）。
// 运行：cd ios && swift test（macOS；Windows 无法本地构建 Swift）

import XCTest
@testable import HbutBackgroundPlugin

final class GradeSignatureV1Tests: XCTestCase {

    // MARK: - fixture 读取

    /// 优先共享 contract-fixtures（#612 冻结版），缺失时回退本地独立 fixture。
    private func gradesFixtureData() throws -> Data {
        let pluginRoot = URL(fileURLWithPath: #file)
            .deletingLastPathComponent() // Tests/HbutBackgroundPluginTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // 插件根
        let shared = pluginRoot
            .appendingPathComponent("contract-fixtures")
            .appendingPathComponent("grades-signature-v1.json")
        if FileManager.default.fileExists(atPath: shared.path) {
            return try Data(contentsOf: shared)
        }
        let local = pluginRoot
            .appendingPathComponent("ios")
            .appendingPathComponent("Tests/HbutBackgroundPluginTests")
            .appendingPathComponent("Fixtures/grades-signature-v1.json")
        return try Data(contentsOf: local)
    }

    private struct GradesFixture: Decodable {
        struct Case: Decodable {
            let name: String
            let records: [GradeRecord]
            let expectedSignature: String
        }
        let schema: Int
        let version: String
        let cases: [Case]
    }

    private func loadFixture() throws -> GradesFixture {
        let data = try gradesFixtureData()
        return try JSONDecoder().decode(GradesFixture.self, from: data)
    }

    private func signature(for name: String) throws -> (computed: String, expected: String) {
        let fixture = try loadFixture()
        guard let testCase = fixture.cases.first(where: { $0.name == name }) else {
            throw XCTSkip("fixture 缺少 case: \(name)")
        }
        return (GradeSignatureV1.compute(records: testCase.records), testCase.expectedSignature)
    }

    // MARK: - fixture 契约（7 类验收 case）

    func testFixtureSchemaAndVersion() throws {
        let fixture = try loadFixture()
        XCTAssertEqual(fixture.schema, 1)
        XCTAssertEqual(fixture.version, "v1")
        // 覆盖 issue 要求的最小 case 集合
        let names = Set(fixture.cases.map(\.name))
        for required in ["first-baseline", "identical-data", "array-order-changed",
                         "new-course-added", "score-changed", "record-removed",
                         "unrelated-field-changed"] {
            XCTAssertTrue(names.contains(required), "fixture 缺少必需 case: \(required)")
        }
    }

    func testAllCasesMatchExpectedSignatures() throws {
        let fixture = try loadFixture()
        for testCase in fixture.cases {
            let computed = GradeSignatureV1.compute(records: testCase.records)
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
        XCTAssertNotEqual(try signature(for: "new-course-added").computed, baseline, "新增课程必须检测到变化")
        XCTAssertNotEqual(try signature(for: "score-changed").computed, baseline, "成绩改变必须检测到变化")
        XCTAssertNotEqual(try signature(for: "record-removed").computed, baseline, "删除记录必须检测到变化")
    }

    // MARK: - 边界

    func testEmptyRecordsProduceEmptySignature() {
        XCTAssertEqual(GradeSignatureV1.compute(records: []), "")
    }

    func testRecordsWithBlankCourseNameAreSkipped() {
        // 全部课程名为空 -> 视为无数据（空签名，调用方按空数据建立 baseline）
        let records = [
            GradeRecord(courseName: "   ", courseType: "必修", credit: 3, score: "85"),
            GradeRecord(courseName: "", courseType: nil, credit: nil, score: nil),
        ]
        XCTAssertEqual(GradeSignatureV1.compute(records: records), "")
    }

    func testWhitespaceAndNilAreEquivalent() {
        let a = [GradeRecord(courseName: "高数", courseType: nil, credit: 3.0, score: "85")]
        let b = [GradeRecord(courseName: " 高数 ", courseType: "", credit: 3.0, score: " 85 ")]
        XCTAssertEqual(GradeSignatureV1.compute(records: a), GradeSignatureV1.compute(records: b))
    }

    func testCreditFormatIsStable() {
        // 3.0 与 3 必须产出相同签名（%.6f 固定格式，跨端可复现）
        let a = [GradeRecord(courseName: "高数", courseType: "必修", credit: 3.0, score: "85")]
        let b = [GradeRecord(courseName: "高数", courseType: "必修", credit: 3, score: "85")]
        XCTAssertEqual(GradeSignatureV1.compute(records: a), GradeSignatureV1.compute(records: b))
    }

    func testScoreNumberAndStringAreEquivalent() throws {
        // 数字型 92 与字符串 "92" 解码后等价（parser 归一化）
        let json = #"[{"courseName":"高数","courseType":"必修","credit":5,"score":92}]"#
        let data = try XCTUnwrap(json.data(using: .utf8))
        let records = try JSONDecoder().decode([GradeRecord].self, from: data)
        let manual = [GradeRecord(courseName: "高数", courseType: "必修", credit: 5, score: "92")]
        XCTAssertEqual(GradeSignatureV1.compute(records: records), GradeSignatureV1.compute(records: manual))
    }

    func testUnrelatedFieldsAreIgnoredByDecoder() throws {
        // 无关字段（updatedAt/rank/rawId）不参与签名：解码时被 Codable 忽略
        let json = #"[{"courseName":"高数","courseType":"必修","credit":5,"score":"92","updatedAt":"2026-08-13","rank":3,"rawId":"g-1"}]"#
        let data = try XCTUnwrap(json.data(using: .utf8))
        let records = try JSONDecoder().decode([GradeRecord].self, from: data)
        XCTAssertEqual(records.count, 1)
        XCTAssertEqual(records[0].courseName, "高数")
        XCTAssertEqual(records[0].credit, 5)
        XCTAssertEqual(records[0].score, "92")
    }
}
