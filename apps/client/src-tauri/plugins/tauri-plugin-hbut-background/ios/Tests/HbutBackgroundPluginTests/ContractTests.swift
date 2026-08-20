// 契约测试：读取插件根 contract-fixtures/（三端共享单一事实源），
// 验证 Swift DTO 与 Rust/Kotlin 语义一致（#611 验收「统一 DTO/command contract」）。
// 运行：cd ios && swift test（macOS；Windows 无法本地构建 Swift，此为 compile-level contract 载体）

import XCTest
@testable import HbutBackgroundPlugin

final class ContractTests: XCTestCase {

    private func fixture(_ name: String) throws -> Data {
        // #file = ios/Tests/HbutBackgroundPluginTests/ContractTests.swift
        // 删 4 层到插件根（ios/Tests/HbutBackgroundPluginTests -> ... -> 插件根）再进 contract-fixtures
        let url = URL(fileURLWithPath: #file)
            .deletingLastPathComponent() // Tests/HbutBackgroundPluginTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // ios
            .deletingLastPathComponent() // 插件根（与 contract-fixtures 平级）
            .appendingPathComponent("contract-fixtures")
            .appendingPathComponent(name)
        return try Data(contentsOf: url)
    }

    private func decode<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: fixture(name))
    }

    func testConfigFixtureMatchesDto() throws {
        let cfg: BackgroundConfig = try decode("config.json", as: BackgroundConfig.self)
        XCTAssertEqual(cfg.schema, bgSchemaVersion)
        XCTAssertTrue(cfg.enabled)
        XCTAssertEqual(cfg.intervalMinutes, 30)
        XCTAssertEqual(cfg.business, ["grades", "exams"])
        XCTAssertEqual(cfg.scope, "2024010101")
    }

    func testContextFixtureMatchesDto() throws {
        let ctx: BackgroundContext = try decode("context.json", as: BackgroundContext.self)
        XCTAssertEqual(ctx.schema, bgSchemaVersion)
        XCTAssertEqual(ctx.scope, "2024010101")
        XCTAssertEqual(ctx.business, ["grades", "exams"])
        XCTAssertFalse(ctx.updatedAt.isEmpty)
    }

    func testStateFixtureIsRealDesktopRust() throws {
        let state: BackgroundCheckState = try decode("state.json", as: BackgroundCheckState.self)
        XCTAssertEqual(state.platform, .desktop)
        XCTAssertEqual(state.source, .rust)
        XCTAssertTrue(state.configured)
        XCTAssertEqual(state.pendingEvents, 2)
        XCTAssertEqual(state.lastRunOk, true)
    }

    func testAndroidStateFixtureReturnsRealAndroidPlatform() throws {
        // Android/iOS 必须返回自己的 platform/source，而不是统一伪造（#611 验收）。
        let state: BackgroundCheckState = try decode("state-android.json", as: BackgroundCheckState.self)
        XCTAssertEqual(state.platform, .android)
        XCTAssertEqual(state.source, .android)
    }

    func testEventFixtureMatchesDto() throws {
        let evt: BackgroundEvent = try decode("event.json", as: BackgroundEvent.self)
        XCTAssertEqual(evt.kind, "synthetic_run")
        XCTAssertEqual(evt.source, .android)
        XCTAssertEqual(evt.scope, "2024010101")
        XCTAssertEqual(evt.payload["message"]?.stringValue, "Kotlin 执行成功")
    }

    func testConsumeResultFixtureMatchesDto() throws {
        let result: ConsumeEventsResult = try decode("consume-result.json", as: ConsumeEventsResult.self)
        XCTAssertEqual(result.events.count, 2)
        XCTAssertEqual(result.remaining, 2)
        XCTAssertEqual(result.events[0].source, .ios)
        XCTAssertEqual(result.events[1].source, .rust)
    }

    func testClearContextResultEncodesMixedFieldTypes() throws {
        let result = ClearContextResult(cleared: true, removedEvents: 2)
        let data = try JSONEncoder().encode(result)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]

        XCTAssertEqual(object?["schema"] as? Int, bgSchemaVersion)
        XCTAssertEqual(object?["cleared"] as? Bool, true)
        XCTAssertEqual(object?["removedEvents"] as? Int, 2)
    }

    func testRunSummaryFixtureIsBridgeContract() throws {
        // Kotlin runNow 返回结构，Rust JNI 端解析；Swift 端同构（三端桥契约）。
        let summary: RunSummary = try decode("run-summary.json", as: RunSummary.self)
        XCTAssertTrue(summary.ok)
        XCTAssertTrue(summary.synthetic)
        XCTAssertEqual(summary.eventsProduced, 1)
        XCTAssertEqual(summary.message, "Kotlin 执行成功")
    }

    func testFutureSchemaIsVersionIncompatible() throws {
        let cfg: BackgroundConfig = try decode("future-schema-config.json", as: BackgroundConfig.self)
        XCTAssertEqual(cfg.schema, 999)
        XCTAssertNotEqual(cfg.schema, bgSchemaVersion, "未来版本必须判为不兼容（存储层降级）")
    }

    func testLegacyNoSchemaIsRejected() {
        // 无 schema 字段的旧格式必须解码失败（强制版本契约）。
        XCTAssertThrowsError(try decode("legacy-no-schema-config.json", as: BackgroundConfig.self))
    }

    func testStateNeverContainsSensitiveFields() throws {
        let state = BackgroundCheckState.initial(platform: .ios, source: .ios)
        let data = try JSONEncoder().encode(state)
        let json = String(data: data, encoding: .utf8)?.lowercased() ?? ""
        for sensitive in ["password", "cookie", "token", "credential", "secret", "authorization"] {
            XCTAssertFalse(json.contains(sensitive), "状态 JSON 泄露敏感字段名 \(sensitive)")
        }
    }

    func testInitialStateNeverClaimsReady() {
        let state = BackgroundCheckState.initial(platform: .ios, source: .ios)
        XCTAssertFalse(state.enabled)
        XCTAssertFalse(state.configured)
        XCTAssertNil(state.lastRunOk)
        XCTAssertEqual(state.pendingEvents, 0)
    }
}
