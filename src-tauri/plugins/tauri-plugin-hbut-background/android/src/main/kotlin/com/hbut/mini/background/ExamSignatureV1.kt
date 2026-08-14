// ExamSignatureV1 —— Android 侧考试安排变化 signature 业务规则（#615）。
//
// 与 iOS（#615 Swift ExamSignatureV1）与前端（notify_center_checks.buildCrossEndExamSignature）
// 共用同一业务语义：只使用标准化业务字段，normalize → 排序 → 序列化 → SHA-256，
// 禁止各自发明一套 diff（跨端 ledger 去重依赖逐位一致）。
//
// 跨端契约（contract-fixtures/exams-signature-v1.json 为单一事实源，本文件必须复现其 hash）：
//   normalize: 字符串 trim；nil/空串等价（空串参与拼接）；
//              courseName trim 后为空则整条记录不参与签名（无稳定身份）；
//   line:      "courseName|examDate|examTime|location|seatNo|examType"（nil/空 -> 空串）；
//   sort:      UTF-8 字节序（与 Swift utf8.lexicographicallyPrecedes / Node Buffer.compare 一致）；
//   join:      "\n"；
//   hash:      SHA-256 hex 小写。
//
// 不参与签名的字段：courseId/semester（仅 native 侧可得，前端 /v2/exams 不返回；
// 纳入会破坏跨端去重）以及 updatedAt/rawId/roomId 等无关字段。
// 注意：不使用 JSON 序列化做 canonical 输出（跨端 key 顺序无保证），
// 手动拼接规范化行是跨端可复现的唯一可靠方式。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Locale

/** 标准化考试记录（业务字段白名单；无关字段如 rawId/updatedAt 不参与签名）。 */
data class ExamRecord(
    /** 课程名（业务必填；trim 后为空则整条记录不参与签名）。 */
    val courseName: String,
    /** 考试日期（YYYY-MM-DD；空串与 nil 等价）。 */
    val examDate: String?,
    /** 考试时间区间原文（如 09:00-11:00；trim 即可，不做分隔符归一化）。 */
    val examTime: String?,
    /** 考试地点（如 教1-101；空串合法）。 */
    val location: String?,
    /** 座位号（如 12；空串合法）。 */
    val seatNo: String?,
    /** 考试类型（如 正常考试/重修；数据源未稳定提供时为空串）。 */
    val examType: String?,
)

/** ExamSignatureV1 计算器（纯函数，无状态；JVM 单测直接覆盖）。 */
object ExamSignatureV1 {

    /** 计算一组考试记录的 signature；空/全部无效记录时返回空串（调用方视为无数据）。 */
    fun compute(records: List<ExamRecord>): String {
        val lines = ArrayList<String>(records.size)
        for (record in records) {
            val courseName = normalizeString(record.courseName)
            if (courseName.isEmpty()) continue // 无课程名的记录跳过（与 Swift/前端一致）
            val examDate = normalizeString(record.examDate)
            val examTime = normalizeString(record.examTime)
            val location = normalizeString(record.location)
            val seatNo = normalizeString(record.seatNo)
            val examType = normalizeString(record.examType)
            lines.add("$courseName|$examDate|$examTime|$location|$seatNo|$examType")
        }
        if (lines.isEmpty()) return ""
        // UTF-8 字节序排序（跨端稳定，与 Swift utf8 比较 / Node Buffer.compare 一致）
        lines.sortWith(UTF8_COMPARATOR)
        val payload = lines.joinToString(separator = "\n")
        return sha256Hex(payload)
    }

    /** 从标准化 JSON 数组（fixture records 结构）计算 signature。 */
    fun computeFromJsonArray(array: JSONArray): String {
        val records = (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            parseRecord(obj)
        }
        return compute(records)
    }

    /** 解析单条标准化记录；courseName trim 后为空返回 null（不参与签名）。 */
    fun parseRecord(obj: JSONObject): ExamRecord? {
        val courseName = obj.optString("courseName").trim()
        if (courseName.isEmpty()) return null
        return ExamRecord(
            courseName = courseName,
            examDate = optTrimmed(obj, "examDate"),
            examTime = optTrimmed(obj, "examTime"),
            location = optTrimmed(obj, "location"),
            seatNo = optTrimmed(obj, "seatNo"),
            examType = optTrimmed(obj, "examType"),
        )
    }

    /** 读取字符串字段并 trim；缺失/null/空 -> null（与 nil 等价）。 */
    private fun optTrimmed(obj: JSONObject, key: String): String? {
        val value = obj.optString(key).trim()
        return value.ifEmpty { null }
    }

    /** 规范化字符串：trim；null 或 trim 后为空 -> 空串（与 nil 等价）。 */
    private fun normalizeString(value: String?): String {
        if (value == null) return ""
        return value.trim()
    }

    /** UTF-8 字节序比较器（跨端一致：Swift utf8.lexicographicallyPrecedes / Node Buffer.compare）。 */
    private val UTF8_COMPARATOR = Comparator<String> { a, b ->
        val ba = a.toByteArray(Charsets.UTF_8)
        val bb = b.toByteArray(Charsets.UTF_8)
        val common = minOf(ba.size, bb.size)
        for (i in 0 until common) {
            val cmp = (ba[i].toInt() and 0xFF) - (bb[i].toInt() and 0xFF)
            if (cmp != 0) return@Comparator cmp
        }
        ba.size - bb.size
    }

    /** SHA-256 hex 小写。 */
    private fun sha256Hex(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(Locale.US, it) }
    }
}
