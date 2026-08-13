// GradesFetcher —— 后台最小成绩检查的 HTTP 层（#613）。
//
// 约束：
// - 只在 BGTask 有限预算内做一次请求（15s 超时），不在单次任务内长时间重试循环；
// - 无网络/临时错误分类为 networkUnavailable，本次任务正确结束，由系统未来再调度；
// - auth/context 过期（401/403）分类为 authExpired，记录状态并结束，等待前台恢复会话；
// - parse 失败不更新 baseline、不误报；
// - 响应不落盘、不进通知（只取标准化字段参与 signature）。
//
// 真实请求由 URLSession 完成；测试注入 MockGradesFetching 验证编排状态机。

import Foundation

/// 成绩抓取失败分类（非敏感，可写入 state.error）。
public enum GradesFetchError: Error, LocalizedError {
    /// 无网络/临时错误：本次任务正确结束，不重试循环。
    case networkUnavailable(String)
    /// auth/context 过期（401/403）：记录状态并结束，等待前台恢复会话刷新 context。
    case authExpired(String)
    /// 非 2xx 且非认证错误。
    case httpStatus(Int)
    /// 数据解析失败：不更新 baseline、不误报。
    case parse(String)
    /// 请求被取消（expiration handler 调用）。
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .networkUnavailable(let m): return "网络不可用或临时错误: \(m)"
        case .authExpired(let m): return "会话/认证过期: \(m)"
        case .httpStatus(let code): return "HTTP 状态异常: \(code)"
        case .parse(let m): return "成绩数据解析失败: \(m)"
        case .cancelled: return "请求已取消"
        }
    }
}

/// 抓取抽象（可注入 mock 测试）。
public protocol GradeFetching: AnyObject {
    /// 发起一次成绩请求；必须回调 completion（主/后台队列均可）。
    func fetchGrades(
        envelope: SecureEnvelope,
        completion: @escaping (Result<[GradeRecord], GradesFetchError>) -> Void
    )
    /// 取消进行中的请求（expiration handler 调用）。
    func cancel()
}

/// 真实实现：URLSession（ephemeral，不共享 cookie/缓存）+ 15s 超时。
public final class URLSessionGradesFetcher: GradeFetching {
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

    public func fetchGrades(
        envelope: SecureEnvelope,
        completion: @escaping (Result<[GradeRecord], GradesFetchError>) -> Void
    ) {
        guard let url = URL(string: envelope.endpoint) else {
            completion(.failure(.parse("endpoint 不是合法 URL: \(envelope.endpoint)")))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = envelope.method.isEmpty ? "GET" : envelope.method
        request.timeoutInterval = timeout
        for (key, value) in envelope.headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
        if let body = envelope.body, !body.isEmpty {
            request.httpBody = body.data(using: .utf8)
        }

        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            completion(self.classify(data: data, response: response, error: error))
        }
        // 只取消当前任务，不销毁 session（协调器为共享单例，expiration 后需可复用）。
        taskLock.lock()
        currentTask = task
        taskLock.unlock()
        task.resume()
    }

    public func cancel() {
        // 仅取消进行中的 dataTask（返回 URLError.cancelled），session 保持可复用。
        taskLock.lock()
        let task = currentTask
        taskLock.unlock()
        task?.cancel()
    }

    /// 错误分类（无网/认证过期/解析失败互斥，状态语义可解释）。
    private func classify(
        data: Data?,
        response: URLResponse?,
        error: Error?
    ) -> Result<[GradeRecord], GradesFetchError> {
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
            let records = try Self.parseGrades(data: data)
            return .success(records)
        } catch let e as GradesFetchError {
            return .failure(e)
        } catch {
            return .failure(.parse(error.localizedDescription))
        }
    }

    /// 弹性解析：直接数组 / 常见包裹 key（data/grades/result/list）/ 任意含数组的对象。
    public static func parseGrades(data: Data) throws -> [GradeRecord] {
        if let records = try? JSONDecoder().decode([GradeRecord].self, from: data) {
            return records
        }
        let json = try JSONSerialization.jsonObject(with: data)
        if let array = json as? [Any] {
            let inner = try JSONSerialization.data(withJSONObject: array)
            return try JSONDecoder().decode([GradeRecord].self, from: inner)
        }
        guard let object = json as? [String: Any] else {
            throw GradesFetchError.parse("响应不是 JSON 数组或对象")
        }
        // 优先常见包裹 key，其次第一个数组值
        for key in ["data", "grades", "result", "list"] {
            if let array = object[key] as? [Any] {
                let inner = try JSONSerialization.data(withJSONObject: array)
                return try JSONDecoder().decode([GradeRecord].self, from: inner)
            }
        }
        for (key, value) in object {
            if let array = value as? [Any] {
                let inner = try JSONSerialization.data(withJSONObject: array)
                return try JSONDecoder().decode([GradeRecord].self, from: inner)
            }
            _ = key
        }
        throw GradesFetchError.parse("未找到成绩数组字段")
    }
}
