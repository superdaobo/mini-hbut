// ExamsFetcher —— 后台考试安排检查的 HTTP 层（#615 Part A）。
//
// 约束（与 #613 GradesFetcher 同模式）：
// - 只在 BGTask 有限预算内做一次请求（15s 超时），不在单次任务内长时间重试循环；
// - 无网络/临时错误 -> networkUnavailable；401/403 -> authExpired；parse -> 不更新 baseline；
// - 响应不落盘、不进通知（只取标准化字段参与 signature）。
// - 端点：由 SecureEnvelope.endpoint 的 origin + 教务考试路径派生（同一安全边界材料）。
//
// 真实请求由 URLSession 完成；测试注入 MockExamsFetching 验证编排状态机。

import Foundation

/// 考试抓取失败分类（非敏感，可写入 state.error）。
public enum ExamsFetchError: Error, LocalizedError {
    case networkUnavailable(String)
    case authExpired(String)
    case httpStatus(Int)
    case parse(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .networkUnavailable(let m): return "网络不可用或临时错误: \(m)"
        case .authExpired(let m): return "会话/认证过期: \(m)"
        case .httpStatus(let code): return "HTTP 状态异常: \(code)"
        case .parse(let m): return "考试数据解析失败: \(m)"
        case .cancelled: return "请求已取消"
        }
    }
}

/// 抓取抽象（可注入 mock 测试）。
public protocol ExamsFetching: AnyObject {
    /// 发起一次考试请求；必须回调 completion。
    func fetchExams(envelope: SecureEnvelope, completion: @escaping (Result<[ExamRecord], ExamsFetchError>) -> Void)
    /// 取消进行中的请求（expiration handler 调用）。
    func cancel()
}

/// 真实实现：URLSession（ephemeral）+ 15s 超时；端点由 envelope origin 派生考试路径。
public final class URLSessionExamsFetcher: ExamsFetching {
    /// 教务考试接口路径（与 Rust fetch_exams 一致，仅本机直连学校）。
    public static let examsPath = "/admin/xsd/kwglXsdKscx/ajaxXsksList"

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

    public func fetchExams(
        envelope: SecureEnvelope,
        completion: @escaping (Result<[ExamRecord], ExamsFetchError>) -> Void
    ) {
        guard let base = URL(string: envelope.endpoint) else {
            completion(.failure(.parse("endpoint 不是合法 URL: \(envelope.endpoint)")))
            return
        }
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            completion(.failure(.parse("endpoint 无法解析 URL 组件")))
            return
        }
        // 由 envelope 的 origin 派生考试路径（保留 host/port；丢弃原路径）
        components.path = Self.examsPath
        // 与 Rust fetch_exams 相同查询参数（签名所需字段；学期留空交由服务端默认）
        components.queryItems = [
            URLQueryItem(name: "gridtype", value: "jqgrid"),
            URLQueryItem(name: "queryFields", value: "id,kcmc,ksrq,kssj,xnxq,jsmc,ksdd,zwh,sddz,ksrs,kslx,kslxmc,kscddz,kcxxdz"),
            URLQueryItem(name: "_search", value: "false"),
            URLQueryItem(name: "page.size", value: "100"),
            URLQueryItem(name: "page.pn", value: "1"),
            URLQueryItem(name: "sort", value: "ksrq"),
            URLQueryItem(name: "order", value: "desc"),
            URLQueryItem(name: "xnxq", value: ""),
        ]
        guard let url = components.url else {
            completion(.failure(.parse("考试 URL 构造失败")))
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
    ) -> Result<[ExamRecord], ExamsFetchError> {
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
            return .success(try Self.parseExams(data: data))
        } catch let e as ExamsFetchError {
            return .failure(e)
        } catch {
            return .failure(.parse(error.localizedDescription))
        }
    }

    /// 弹性解析：results/items 数组（与 Rust parse_exams 最小字段对齐）。
    public static func parseExams(data: Data) throws -> [ExamRecord] {
        let json = try JSONSerialization.jsonObject(with: data)
        guard let object = json as? [String: Any] else {
            throw ExamsFetchError.parse("响应不是 JSON 对象")
        }
        let ret = object["ret"] as? Int ?? -1
        if object["ret"] != nil && ret != 0 {
            let msg = (object["msg"] as? String ?? "").prefix(80)
            throw ExamsFetchError.parse("考试接口业务错误(ret=\(ret)): \(msg)")
        }
        guard let items = (object["results"] as? [Any]) ?? (object["items"] as? [Any]) else {
            throw ExamsFetchError.parse("考试响应缺少 results/items")
        }
        return items.compactMap { raw -> ExamRecord? in
            guard let row = raw as? [String: Any] else { return nil }
            let courseName = (row["kcmc"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !courseName.isEmpty else { return nil }
            let location = (row["jsmc"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                .nilIfEmpty()
                ?? (row["ksdd"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty()
                ?? (row["cdmc"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty()
            return ExamRecord(
                courseName: courseName,
                examDate: (row["ksrq"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty(),
                examTime: (row["kssj"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty(),
                location: location,
                seatNo: (row["zwh"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty(),
                examType: (row["kslxmc"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty()
            )
        }
    }
}

private extension String {
    func nilIfEmpty() -> String? {
        isEmpty ? nil : self
    }
}
