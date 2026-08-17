// SchoolInboxFetcher —— 后台学校消息检查的 HTTP 层（#615 Part B）。
//
// provider 抽象（与 Android SchoolInboxHttpFetcher 同一语义）：
// - portal：教务通知中心（{jwxt}/admin/system/tzsjx/ajaxList），用 envelope 头；
// - chaoxing：学习通收件箱（notice.chaoxing.com），需要学习通通知 cookie——
//   当前 iOS 安全边界（SecureEnvelope）只承载教务会话材料，chaoxing provider
//   在后台明确标记 unsupported（前台可检测），不静默假成功（#615 验收）。
//
// 无 envelope（未写入 Keychain）时返回 authUnavailable（由协调器处理），
// 不做后台交互式重登录。单次最小检查只做 1 个请求。
//
// 真实请求由 URLSession 完成；测试注入 MockSchoolInboxFetching。

import Foundation

/// 学校消息最小条目（不存正文；title 通知渲染用，有长度上限）。
public struct SchoolMessageItem: Codable, Equatable {
    /// 稳定 ID（provider 前缀）：portal:tzsjx:xxx / chaoxing:notice:xxx。
    public var id: String
    /// 短标题（写入 event 前按长度上限截断）。
    public var title: String
    /// 是否已读（chaoxing 由标题前缀推导；portal 列表无可靠字段一律未读）。
    public var isRead: Bool
    /// provider 抽象值：portal / chaoxing。
    public var provider: String
    /// 创建时间（可空，仅诊断用途）。
    public var createdAt: String?

    public init(id: String, title: String, isRead: Bool, provider: String, createdAt: String? = nil) {
        self.id = id
        self.title = title
        self.isRead = isRead
        self.provider = provider
        self.createdAt = createdAt
    }
}

/// 学校消息抓取失败分类。
public enum SchoolInboxFetchError: Error, LocalizedError {
    /// provider 后台不可用（无安全材料/不受支持）：诚实标记，不算网络错误。
    case unsupported(String)
    case networkUnavailable(String)
    case authExpired(String)
    case httpStatus(Int)
    case parse(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .unsupported(let m): return m
        case .networkUnavailable(let m): return "网络不可用或临时错误: \(m)"
        case .authExpired(let m): return "会话/认证过期: \(m)"
        case .httpStatus(let code): return "HTTP 状态异常: \(code)"
        case .parse(let m): return "学校消息数据解析失败: \(m)"
        case .cancelled: return "请求已取消"
        }
    }
}

/// 抓取抽象（可注入 mock 测试）。
public protocol SchoolInboxFetching: AnyObject {
    /// 发起一次学校消息请求（portal 单请求）；必须回调 completion。
    func fetchInbox(envelope: SecureEnvelope, completion: @escaping (Result<[SchoolMessageItem], SchoolInboxFetchError>) -> Void)
    func cancel()
}

/// 真实实现：portal provider（URLSession + envelope 头）。
public final class URLSessionSchoolInboxFetcher: SchoolInboxFetching {
    /// 教务通知中心路径（与 Rust fetch_portal_inbox 一致）。
    public static let portalPath =
        "/admin/system/tzsjx/ajaxList?gridtype=jqgrid&queryFields=id%2Cdqstatus%2Ccollectstatus%2Ctitle%2Ccontent%2CreleaseDate%2C&_search=false&page.size=500&page.pn=1&sort=id&order=desc"

    private let session: URLSession
    private let timeout: TimeInterval
    private let taskLock = NSLock()
    private var currentTask: URLSessionDataTask?

    public init(timeout: TimeInterval = 15) {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
        self.timeout = timeout
    }

    public func fetchInbox(
        envelope: SecureEnvelope,
        completion: @escaping (Result<[SchoolMessageItem], SchoolInboxFetchError>) -> Void
    ) {
        guard let base = URL(string: envelope.endpoint) else {
            completion(.failure(.unsupported("后台无可用学校消息 provider（envelope 缺失/非法）")))
            return
        }
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            completion(.failure(.unsupported("后台无可用学校消息 provider（envelope 无法解析）")))
            return
        }
        // portal 端点由 envelope origin 派生（教务会话材料）
        components.path = Self.portalPath
        components.query = nil
        guard let url = components.url else {
            completion(.failure(.parse("学校消息 URL 构造失败")))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = timeout
        for (key, value) in envelope.headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.setValue("XMLHttpRequest", forHTTPHeaderField: "X-Requested-With")
        request.setValue("application/json, text/javascript, */*; q=0.01", forHTTPHeaderField: "Accept")

        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            completion(self.classify(data: data, response: response, error: error))
        }
        taskLock.lock()
        currentTask = task
        taskLock.unlock()
        task.resume()
    }

    public func cancel() {
        taskLock.lock()
        let task = currentTask
        taskLock.unlock()
        task?.cancel()
    }

    private func classify(
        data: Data?,
        response: URLResponse?,
        error: Error?
    ) -> Result<[SchoolMessageItem], SchoolInboxFetchError> {
        if let urlError = error as? URLError {
            if urlError.code == .cancelled {
                return .failure(.cancelled)
            }
            return .failure(.networkUnavailable(urlError.localizedDescription))
        }
        if let http = response as? HTTPURLResponse {
            if http.statusCode == 401 || http.statusCode == 403 {
                return .failure(.authExpired("HTTP \(http.statusCode)"))
            }
            guard (200..<300).contains(http.statusCode) else {
                return .failure(.httpStatus(http.statusCode))
            }
        }
        guard let data = data, !data.isEmpty else {
            return .failure(.parse("响应为空"))
        }
        do {
            return .success(try Self.parsePortal(data: data))
        } catch let e as SchoolInboxFetchError {
            return .failure(e)
        } catch {
            return .failure(.parse(error.localizedDescription))
        }
    }

    /// portal 响应解析（与 Rust parse_portal_tzsjx_payload 最小字段对齐）。
    public static func parsePortal(data: Data) throws -> [SchoolMessageItem] {
        let json = try JSONSerialization.jsonObject(with: data)
        guard let object = json as? [String: Any] else {
            throw SchoolInboxFetchError.parse("响应不是 JSON 对象")
        }
        let rows = (object["rows"] as? [Any]) ?? (object["items"] as? [Any]) ?? []
        return rows.compactMap { raw -> SchoolMessageItem? in
            guard let row = raw as? [String: Any] else { return nil }
            let id = (row["id"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty else { return nil }
            return SchoolMessageItem(
                id: "portal:tzsjx:\(id)",
                title: (row["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                isRead: false, // 教务 tzsjx 列表不提供可靠已读字段：新到才通知，已读由 knownIds 保证不重复
                provider: "portal",
                createdAt: (row["releaseDate"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty()
            )
        }
    }
}

private extension String {
    func nilIfEmpty() -> String? {
        isEmpty ? nil : self
    }
}
