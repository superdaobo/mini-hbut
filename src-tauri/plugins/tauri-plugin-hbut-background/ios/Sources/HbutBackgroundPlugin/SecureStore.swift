// SecureStore —— iOS 安全存储（Keychain）封装（#613）。
//
// 安全边界（#608 红线 2）：敏感认证材料只能存在 Rust/native secure boundary；
// Keychain 属于 native secure boundary。Swift 后台任务读取 Keychain 中
// 「已完成认证的最小请求材料」完成一次检查，不把明文密码交给 Swift task，
// 也不把敏感材料写入普通文件存储（BackgroundStore 仅存非敏感状态）。
//
// 本 MVP 中 SecureEnvelope 由 Rust 会话层经 FFI 写入（接入点见 ios/INTEGRATION.md）；
// 尚未写入时检查器返回 authUnavailable，安全停止，不做后台重登录。

import Foundation
import Security

/// Keychain 服务名（与 bundle id 关联，避免与其他 App 冲突）。
public let backgroundKeychainService = "com.hbut.mini.background"

/// 后台最小请求所需的安全材料（完整认证材料只在 Rust/native secure boundary 流转）。
public struct SecureEnvelope: Codable, Equatable {
    public var schema: Int
    /// 学生 scope（账号隔离：按 scope 存取，切换账号时清理）。
    public var scope: String
    /// 成绩接口 URL（非敏感，但为保持完整 envelope 原子性一并入 Keychain）。
    public var endpoint: String
    /// HTTP 方法（GET/POST）。
    public var method: String
    /// 认证头等敏感材料（如 Cookie/Authorization；严禁写入普通文件）。
    public var headers: [String: String]
    /// 请求体模板（无需 body 时为 nil）。
    public var body: String?
    /// RFC3339 最后更新时间。
    public var updatedAt: String

    public init(
        schema: Int = bgSchemaVersion,
        scope: String,
        endpoint: String,
        method: String = "GET",
        headers: [String: String] = [:],
        body: String? = nil,
        updatedAt: String
    ) {
        self.schema = schema
        self.scope = scope
        self.endpoint = endpoint
        self.method = method
        self.headers = headers
        self.body = body
        self.updatedAt = updatedAt
    }
}

/// Keychain 访问错误。
public enum SecureStoreError: Error, LocalizedError {
    case keychain(OSStatus, String)
    case encode(String)

    public var errorDescription: String? {
        switch self {
        case .keychain(let status, let op):
            return "Keychain \(op) 失败 (OSStatus=\(status))"
        case .encode(let m):
            return "SecureEnvelope 编码失败: \(m)"
        }
    }
}

/// 按 scope 存取 SecureEnvelope 的 Keychain 封装。
public struct SecureStore {

    private let service: String
    private let accessGroup: String?

    public init(service: String = backgroundKeychainService, accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    // MARK: - 读写

    /// 保存 envelope（覆盖同 scope 旧值）。
    public func save(_ envelope: SecureEnvelope) throws {
        let data = try encode(envelope)
        // 先删除旧项再写入，避免 kSecDuplicateItem
        delete(scope: envelope.scope)
        var query: [String: Any] = baseQuery(scope: envelope.scope)
        query[kSecValueData as String] = data
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SecureStoreError.keychain(status, "save(scope=\(envelope.scope))")
        }
    }

    /// 读取指定 scope 的 envelope；不存在返回 nil（不抛错）。
    public func load(scope: String) -> SecureEnvelope? {
        var query: [String: Any] = baseQuery(scope: scope)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(SecureEnvelope.self, from: data)
    }

    /// 删除指定 scope 的 envelope（账号切换/退出清理）。
    @discardableResult
    public func delete(scope: String) -> Bool {
        let query = baseQuery(scope: scope)
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }

    // MARK: - 内部

    private func baseQuery(scope: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: scope,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        if let accessGroup = accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    private func encode(_ envelope: SecureEnvelope) throws -> Data {
        do {
            return try JSONEncoder().encode(envelope)
        } catch {
            throw SecureStoreError.encode(error.localizedDescription)
        }
    }
}

/// SecureStore 满足协调器依赖的 SecureEnvelopeProviding。
extension SecureStore: SecureEnvelopeProviding {}
