// ExamSignatureV1 —— iOS 侧考试安排变化 signature 业务规则（#615）。
//
// 与 Android（#615 Kotlin ExamSignatureV1）与前端（notify_center_checks
// buildCrossEndExamSignature）共用同一业务语义：只使用标准化业务字段，
// normalize → 排序 → 序列化 → SHA-256，禁止各自发明一套 diff。
//
// 跨端契约（写入 fixture algorithm 字段，三端必须一致）：
//   normalize: 字符串 trim；nil/空串等价；courseName trim 后为空则跳过该记录；
//   line:      "courseName|examDate|examTime|location|seatNo|examType"（nil/空 -> 空串）；
//   sort:      UTF-8 字节序（Swift utf8.lexicographicallyPrecedes，与 Buffer.compare 一致）；
//   join:      "\n"；
//   hash:      SHA-256 hex 小写。
//
// 不参与签名字段：courseId/semester（仅 native 侧可得，前端 /v2/exams 不返回；
// 纳入会破坏跨端 ledger 去重）与 updatedAt/rawId 等无关字段。
// 注意：不使用 JSONEncoder 做 canonical 序列化（跨端 key 顺序无保证），
// 手动拼接规范化行是跨端可复现的唯一可靠方式。

import Foundation
import CryptoKit

/// 标准化考试记录（业务字段白名单；无关字段如 rawId/updatedAt 不参与签名）。
public struct ExamRecord: Codable, Equatable {
    /// 课程名（业务必填；trim 后为空则整条记录不参与签名）。
    public var courseName: String
    /// 考试日期（YYYY-MM-DD；空串与 nil 等价）。
    public var examDate: String?
    /// 考试时间区间原文（如 09:00-11:00；trim 即可，不做分隔符归一化）。
    public var examTime: String?
    /// 考试地点（如 教1-101；空串合法）。
    public var location: String?
    /// 座位号（如 12；空串合法）。
    public var seatNo: String?
    /// 考试类型（如 正常考试/重修；数据源未稳定提供时为空串）。
    public var examType: String?

    public init(
        courseName: String,
        examDate: String? = nil,
        examTime: String? = nil,
        location: String? = nil,
        seatNo: String? = nil,
        examType: String? = nil
    ) {
        self.courseName = courseName
        self.examDate = examDate
        self.examTime = examTime
        self.location = location
        self.seatNo = seatNo
        self.examType = examType
    }
}

/// ExamSignatureV1 计算器（纯函数，无状态；单测可直接覆盖）。
public enum ExamSignatureV1 {

    /// 计算一组考试记录的 signature；空/全部无效记录时返回空串（调用方视为无数据）。
    public static func compute(records: [ExamRecord]) -> String {
        var lines: [String] = []
        for record in records {
            let courseName = normalizeString(record.courseName)
            if courseName.isEmpty { continue } // 无课程名的记录跳过
            let examDate = normalizeString(record.examDate)
            let examTime = normalizeString(record.examTime)
            let location = normalizeString(record.location)
            let seatNo = normalizeString(record.seatNo)
            let examType = normalizeString(record.examType)
            lines.append("\(courseName)|\(examDate)|\(examTime)|\(location)|\(seatNo)|\(examType)")
        }
        guard !lines.isEmpty else { return "" }
        // UTF-8 字节序排序（跨端稳定，与 Node Buffer.compare 一致）
        lines.sort { $0.utf8.lexicographicallyPrecedes($1.utf8) }
        let payload = lines.joined(separator: "\n")
        let digest = SHA256.hash(data: Data(payload.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// 规范化字符串：trim；nil 或 trim 后为空 -> 空串（与 nil 等价）。
    private static func normalizeString(_ value: String?) -> String {
        guard let value = value else { return "" }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
