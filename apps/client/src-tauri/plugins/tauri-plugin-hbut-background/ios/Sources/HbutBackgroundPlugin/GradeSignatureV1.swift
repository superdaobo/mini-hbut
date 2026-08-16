// GradeSignatureV1 —— iOS 侧成绩变化 signature 业务规则（#613）。
//
// 与 Android（#612）共用同一业务语义：只使用标准化业务字段，
// normalize → 排序 → 序列化 → SHA-256，禁止各自发明一套 diff。
//
// 跨端契约（写入 fixture algorithm 字段，三端必须一致）：
//   normalize: 字符串 trim；courseType/score 空串与 nil 等价；
//              credit 固定格式 %.6f（C printf / JS toFixed(6) / Kotlin %f 语义一致）；
//              courseName trim 后为空则跳过该记录；
//   line:      "courseName|courseType|credit|score"（nil/空 -> 空串）；
//   sort:      UTF-8 字节序（Swift utf8.lexicographicallyPrecedes，与 Buffer.compare 一致）；
//   join:      "\n"；
//   hash:      SHA-256 hex 小写。
//
// 注意：不使用 JSONEncoder 做 canonical 序列化（跨端 key 顺序无保证），
// 手动拼接规范化行是跨端可复现的唯一可靠方式。

import Foundation
import CryptoKit

/// 标准化成绩记录（业务字段白名单；无关字段如 updatedAt/rank/rawId 不参与签名）。
public struct GradeRecord: Codable, Equatable {
    /// 课程名称（业务必填；trim 后为空则整条记录不参与签名）。
    public var courseName: String
    /// 课程性质（如 必修/选修；空串与 nil 等价）。
    public var courseType: String?
    /// 学分（nil 表示未知；参与签名时固定 %.6f）。
    public var credit: Double?
    /// 成绩（百分制数字或等级制字符串，如 "优秀"、"缺考"；空串与 nil 等价）。
    public var score: String?

    public init(courseName: String, courseType: String? = nil, credit: Double? = nil, score: String? = nil) {
        self.courseName = courseName
        self.courseType = courseType
        self.credit = credit
        self.score = score
    }

    /// 自定义解码：score 兼容 JSON number（如 92）与 string（如 "优秀"），
    /// credit 兼容 number；无关字段（Codable 未知 key）自动忽略，不参与签名。
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        courseName = try container.decode(String.self, forKey: .courseName)
        courseType = try? container.decodeIfPresent(String.self, forKey: .courseType)
        if let c = try? container.decodeIfPresent(Double.self, forKey: .credit) {
            credit = c
        } else if let s = try? container.decodeIfPresent(String.self, forKey: .credit), let c = Double(s) {
            credit = c
        } else {
            credit = nil
        }
        if let s = try? container.decodeIfPresent(String.self, forKey: .score) {
            score = s
        } else if let n = try? container.decodeIfPresent(Double.self, forKey: .score) {
            // 数字型成绩统一转字符串（保留整数原样，避免 92 -> "92.0" 跨端不一致）
            score = n.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(n)) : String(n)
        } else {
            score = nil
        }
    }
}

/// GradeSignatureV1 计算器（纯函数，无状态；单测可直接覆盖）。
public enum GradeSignatureV1 {

    /// 计算一组成绩记录的 signature；空/全部无效记录时返回空串（调用方视为无数据）。
    public static func compute(records: [GradeRecord]) -> String {
        var lines: [String] = []
        for record in records {
            let courseName = normalizeString(record.courseName)
            if courseName.isEmpty { continue } // 无课程名的记录跳过
            let courseType = normalizeString(record.courseType)
            let credit = formatCredit(record.credit)
            let score = normalizeString(record.score)
            lines.append("\(courseName)|\(courseType)|\(credit)|\(score)")
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

    /// 学分固定格式 %.6f；nil/非有限值 -> 空串（与 nil 等价）。
    private static func formatCredit(_ value: Double?) -> String {
        guard let value = value, value.isFinite else { return "" }
        return String(format: "%.6f", value)
    }
}
