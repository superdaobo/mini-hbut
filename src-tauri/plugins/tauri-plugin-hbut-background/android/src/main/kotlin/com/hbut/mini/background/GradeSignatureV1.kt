// GradeSignatureV1 —— Android 侧成绩变化 signature 业务规则（#612）。
//
// 与 iOS（#613 Swift GradeSignatureV1）共用同一业务语义：只使用标准化业务字段，
// normalize → 排序 → 序列化 → SHA-256，禁止各自发明一套 diff。
//
// 跨端契约（contract-fixtures/grades-signature-v1.json 为单一事实源，本文件必须复现其 hash）：
//   normalize: 字符串 trim；courseType/score 空串与 nil 等价；
//              credit 固定格式 %.6f（IEEE double + printf 语义，与 Swift/C 一致）；
//              数字型 score：整数 -> 整数字符串（如 92），小数 -> 十进制字符串（如 92.5）；
//              courseName trim 后为空则整条记录不参与签名；
//   line:      "courseName|courseType|credit|score"（nil/空 -> 空串）；
//   sort:      UTF-8 字节序（与 Swift utf8.lexicographicallyPrecedes / Node Buffer.compare 一致）；
//   join:      "\n"；
//   hash:      SHA-256 hex 小写。
//
// 注意：不使用 JSON 序列化做 canonical 输出（跨端 key 顺序无保证），
// 手动拼接规范化行是跨端可复现的唯一可靠方式。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Locale

/** 标准化成绩记录（业务字段白名单；无关字段如 updatedAt/rank/rawId 不参与签名）。 */
data class GradeRecord(
    /** 课程名称（业务必填；trim 后为空则整条记录不参与签名）。 */
    val courseName: String,
    /** 课程性质（如 必修/选修；空串与 nil 等价）。 */
    val courseType: String?,
    /** 学分（nil 表示未知；参与签名时固定 %.6f）。 */
    val credit: Double?,
    /** 成绩（百分制数字或等级制字符串，如 "优秀"、"缺考"；空串与 nil 等价）。 */
    val score: String?,
)

/** GradeSignatureV1 计算器（纯函数，无状态；JVM 单测直接覆盖）。 */
object GradeSignatureV1 {

    /** 计算一组成绩记录的 signature；空/全部无效记录时返回空串（调用方视为无数据）。 */
    fun compute(records: List<GradeRecord>): String {
        val lines = ArrayList<String>(records.size)
        for (record in records) {
            val courseName = normalizeString(record.courseName)
            if (courseName.isEmpty()) continue // 无课程名的记录跳过（与 Swift 一致）
            val courseType = normalizeString(record.courseType)
            val credit = formatCredit(record.credit)
            val score = normalizeString(record.score)
            lines.add("$courseName|$courseType|$credit|$score")
        }
        if (lines.isEmpty()) return ""
        // UTF-8 字节序排序（跨端稳定，与 Swift utf8 比较 / Node Buffer.compare 一致）
        lines.sortWith(UTF8_COMPARATOR)
        val payload = lines.joinToString(separator = "\n")
        return sha256Hex(payload)
    }

    /** 从标准化 JSON 数组（fixture records 结构：courseName/courseType/credit/score）计算 signature。 */
    fun computeFromJsonArray(array: JSONArray): String {
        val records = (0 until array.length()).mapNotNull { i ->
            val obj = array.optJSONObject(i) ?: return@mapNotNull null
            parseRecord(obj)
        }
        return compute(records)
    }

    /** 解析单条标准化记录；score 兼容 number 与 string，credit 兼容 number 与数字字符串。 */
    fun parseRecord(obj: JSONObject): GradeRecord? {
        val courseName = obj.optString("courseName").trim()
        if (courseName.isEmpty()) return null
        val courseType = obj.optString("courseType").trim().ifEmpty { null }
        val credit = when (val raw = obj.opt("credit")) {
            is Number -> raw.toDouble()
            is String -> raw.trim().toDoubleOrNull()
            else -> null
        }
        val score = when (val raw = obj.opt("score")) {
            is Number -> numberToScoreString(raw.toDouble())
            is String -> raw.trim().ifEmpty { null }
            else -> null
        }
        return GradeRecord(courseName, courseType, credit, score)
    }

    /** 规范化字符串：trim；null 或 trim 后为空 -> 空串（与 nil 等价）。 */
    private fun normalizeString(value: String?): String {
        if (value == null) return ""
        return value.trim()
    }

    /** 学分固定格式 %.6f；null/非有限值 -> 空串（与 Swift formatCredit 一致）。 */
    private fun formatCredit(value: Double?): String {
        if (value == null || !value.isFinite()) return ""
        return String.format(Locale.US, "%.6f", value)
    }

    /** 数字型成绩统一转字符串：整数保留原样（92 -> "92"，避免跨端 "92.0" 不一致）。 */
    private fun numberToScoreString(value: Double): String =
        if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()

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
