// 与 Rust dto.rs / Kotlin BackgroundModels.kt 对齐的 DTO 模型（schema/version 契约的 Swift 端）。
// 字段 camelCase 与 JSON 天然一致；枚举 rawValue 为 snake_case 字符串。

import Foundation

/// 当前插件数据 schema 版本（与 Rust BG_SCHEMA_VERSION 对齐）。
public let bgSchemaVersion: Int = 1

/// 事件 inbox 容量上限（与 Rust EVENT_INBOX_CAP 对齐）。
public let eventInboxCap: Int = 50

/// 平台（JSON 值为 snake_case 字符串）。
public enum BackgroundPlatform: String, Codable {
    case desktop
    case android
    case ios
    case web
}

/// 状态/事件来源。
public enum BackgroundSource: String, Codable {
    case none
    case rust
    case android
    case ios
}

/// 用户后台配置（configure 入参 + 落盘对象）。
public struct BackgroundConfig: Codable, Equatable {
    public var schema: Int
    public var enabled: Bool
    public var intervalMinutes: Int?
    public var business: [String]
    public var scope: String?

    public init(
        schema: Int = bgSchemaVersion,
        enabled: Bool = false,
        intervalMinutes: Int? = 30,
        business: [String] = [],
        scope: String? = nil
    ) {
        self.schema = schema
        self.enabled = enabled
        self.intervalMinutes = intervalMinutes
        self.business = business
        self.scope = scope
    }
}

/// 后台执行最小上下文（syncContext 入参；不含任何敏感材料）。
public struct BackgroundContext: Codable, Equatable {
    public var schema: Int
    public var scope: String
    public var business: [String]
    public var updatedAt: String

    public init(schema: Int = bgSchemaVersion, scope: String, business: [String], updatedAt: String) {
        self.schema = schema
        self.scope = scope
        self.business = business
        self.updatedAt = updatedAt
    }
}

/// 统一后台检查状态（getState 返回；平台/来源为真实值，不伪造 ready）。
public struct BackgroundCheckState: Codable, Equatable {
    public var schema: Int
    public var platform: BackgroundPlatform
    public var source: BackgroundSource
    public var enabled: Bool
    public var configured: Bool
    public var scope: String?
    public var lastRunAt: String?
    public var lastRunOk: Bool?
    public var pendingEvents: Int
    public var error: String?

    public init(
        schema: Int = bgSchemaVersion,
        platform: BackgroundPlatform,
        source: BackgroundSource,
        enabled: Bool = false,
        configured: Bool = false,
        scope: String? = nil,
        lastRunAt: String? = nil,
        lastRunOk: Bool? = nil,
        pendingEvents: Int = 0,
        error: String? = nil
    ) {
        self.schema = schema
        self.platform = platform
        self.source = source
        self.enabled = enabled
        self.configured = configured
        self.scope = scope
        self.lastRunAt = lastRunAt
        self.lastRunOk = lastRunOk
        self.pendingEvents = pendingEvents
        self.error = error
    }

    /// 初始状态（真实平台/来源）。
    public static func initial(platform: BackgroundPlatform, source: BackgroundSource) -> BackgroundCheckState {
        BackgroundCheckState(platform: platform, source: source)
    }
}

/// 后台事件（event inbox 条目）。
public struct BackgroundEvent: Codable, Equatable {
    public var schema: Int
    public var id: String
    public var source: BackgroundSource
    public var kind: String
    public var scope: String?
    public var occurredAt: String
    public var payload: [String: AnyCodable]

    public init(
        schema: Int = bgSchemaVersion,
        id: String,
        source: BackgroundSource,
        kind: String,
        scope: String?,
        occurredAt: String,
        payload: [String: AnyCodable] = [:]
    ) {
        self.schema = schema
        self.id = id
        self.source = source
        self.kind = kind
        self.scope = scope
        self.occurredAt = occurredAt
        self.payload = payload
    }
}

/// consumeEvents 返回结构。
public struct ConsumeEventsResult: Codable, Equatable {
    public var schema: Int
    public var events: [BackgroundEvent]
    public var remaining: Int

    public init(schema: Int = bgSchemaVersion, events: [BackgroundEvent], remaining: Int) {
        self.schema = schema
        self.events = events
        self.remaining = remaining
    }
}

/// runNow 单次执行摘要（不得含敏感字段）。
public struct RunSummary: Codable, Equatable {
    public var ok: Bool
    public var synthetic: Bool
    public var eventsProduced: Int
    public var message: String?

    public init(ok: Bool, synthetic: Bool, eventsProduced: Int, message: String?) {
        self.ok = ok
        self.synthetic = synthetic
        self.eventsProduced = eventsProduced
        self.message = message
    }

    public static func synthetic(_ message: String) -> RunSummary {
        RunSummary(ok: true, synthetic: true, eventsProduced: 1, message: message)
    }

    public static func failed(_ message: String) -> RunSummary {
        RunSummary(ok: false, synthetic: false, eventsProduced: 0, message: message)
    }
}

/// payload 的宽松 JSON 值（Codable 通配）。
public enum AnyCodable: Codable, Equatable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case array([AnyCodable])
    case object([String: AnyCodable])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([AnyCodable].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: AnyCodable].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "无法解码 AnyCodable"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v): try container.encode(v)
        case .int(let v): try container.encode(v)
        case .double(let v): try container.encode(v)
        case .bool(let v): try container.encode(v)
        case .array(let v): try container.encode(v)
        case .object(let v): try container.encode(v)
        case .null: try container.encodeNil()
        }
    }

    /// 取字符串值（测试友好）。
    public var stringValue: String? {
        if case .string(let v) = self { return v }
        return nil
    }
}
