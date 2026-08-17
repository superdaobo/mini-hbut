// GradesParser —— 教务成绩原始响应解析（#612）。
//
// 与 Rust http_client/academic/grades.rs + parser.rs 对齐的最小字段映射：
// - 新版格式 {"ret":0,"msg":"ok","results":[...]}；旧版格式 {"items":[...]}；
// - 每条记录字段：kcmc(课程名,可能带 [xxx] 前缀)、zhcj/cj(综合成绩)、xf(学分)、
//   kcxzmc/kcxz(课程性质文本/代码)、xnxq 或 xnmmc+xqmmc(学期，仅做非敏感摘要用途)。
// 只解析 signature 所需字段（#612 Worker 最小职责：不解析完整成绩明细）。
//
// 响应分类（#612 网络与错误处理验收）：
// - 重定向到教务登录页（authserver/login、/admin/login）-> AUTH_EXPIRED（不无限 retry）；
// - 非 JSON 响应（HTML 登录页等）-> AUTH_EXPIRED / PARSE_ERROR 区分；
// - JSON ret != 0 或缺少 results/items -> PARSE_ERROR（不更新 baseline，不误报）。
// 本文件为纯 JVM 代码（org.json + java.net），JVM 单测直接覆盖分类逻辑。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject

/** 错误分类（#612 验收：无网/临时失败/解析失败/auth 过期分别映射 retry/no-retry）。 */
enum class GradesErrorKind {
    /** 网络不可用/临时失败：允许 WorkManager 按策略带退避 retry。 */
    NETWORK_ERROR,
    /** 会话/auth 过期（命中登录页）：不无限 retry，标记 auth-expired 等待 App 恢复。 */
    AUTH_EXPIRED,
    /** 响应解析失败/业务错误：不更新 baseline，不误报，不 retry。 */
    PARSE_ERROR,
}

/** 解析结果。 */
sealed class GradesParseResult {
    /** 解析成功（可能为空列表：无成绩记录）。 */
    data class Success(val records: List<GradeRecord>) : GradesParseResult()

    /** 解析失败（含非敏感错误摘要，严禁包含 cookie/header/响应敏感字段）。 */
    data class Error(val kind: GradesErrorKind, val summary: String) : GradesParseResult()
}

/** HTTP 响应最小模型（不含任何敏感字段）。 */
data class HttpResponse(
    /** 最终 URL（跟随重定向后），用于登录页判定。 */
    val finalUrl: String,
    /** HTTP 状态码。 */
    val statusCode: Int,
    /** 响应体文本。 */
    val body: String,
    /** Content-Type（可能为 null）。 */
    val contentType: String?,
)

/** 成绩响应解析器（纯函数，无状态）。 */
object GradesParser {

    /** 教务成绩接口路径（与 Rust fetch_grades 一致，仅本机直连学校）。 */
    const val GRADES_PATH: String = "/admin/xsd/xsdcjcx/xsdQueryXscjList"

    /** 判定 URL 是否为教务登录页（与 Rust looks_like_academic_login_url 语义对齐）。 */
    fun looksLikeLoginUrl(url: String): Boolean {
        val lower = url.lowercase()
        return lower.contains("authserver/login") ||
            (lower.contains("/admin/login") && !lower.contains("/admin/login2"))
    }

    /** 分类 HTTP 响应为解析结果（纯函数，JVM 可测）。 */
    fun parseResponse(response: HttpResponse): GradesParseResult {
        // 网络层已保证只有 2xx 才会进入本方法（非 2xx 在 fetcher 层归类 NETWORK_ERROR）
        val body = response.body.trim()
        if (body.isEmpty()) {
            return GradesParseResult.Error(GradesErrorKind.PARSE_ERROR, "成绩响应为空")
        }
        // 非 JSON：登录页（会话过期）与其他异常页区分
        if (!body.startsWith("{") && !body.startsWith("[")) {
            if (looksLikeLoginUrl(response.finalUrl) || looksLikeHtmlLoginPage(body)) {
                return GradesParseResult.Error(GradesErrorKind.AUTH_EXPIRED, "会话已过期，等待 App 恢复登录")
            }
            return GradesParseResult.Error(GradesErrorKind.PARSE_ERROR, "成绩响应不是 JSON 格式")
        }
        val json = try {
            JSONObject(body)
        } catch (e: Exception) {
            return GradesParseResult.Error(GradesErrorKind.PARSE_ERROR, "成绩 JSON 解析失败: ${e.message}")
        }
        // 新版 API 状态检查
        val ret = json.optInt("ret", -1)
        if (json.has("ret") && ret != 0) {
            val msg = json.optString("msg", "").take(80)
            return GradesParseResult.Error(GradesErrorKind.PARSE_ERROR, "成绩接口业务错误(ret=$ret): $msg")
        }
        val items: JSONArray? = when {
            json.has("results") -> json.optJSONArray("results")
            json.has("items") -> json.optJSONArray("items")
            else -> null
        }
        if (items == null) {
            return GradesParseResult.Error(GradesErrorKind.PARSE_ERROR, "成绩响应缺少 results/items")
        }
        val records = (0 until items.length()).mapNotNull { i ->
            val obj = items.optJSONObject(i) ?: return@mapNotNull null
            parseGradeItem(obj)
        }
        return GradesParseResult.Success(records)
    }

    /** HTML 登录页特征（body 兜底判定；finalUrl 判定优先）。 */
    private fun looksLikeHtmlLoginPage(body: String): Boolean {
        val lower = body.lowercase()
        return lower.contains("<html") &&
            (lower.contains("login") || lower.contains("cas") || lower.contains("authserver"))
    }

    /** 教务单条成绩记录 -> 标准化 GradeRecord（只取 signature 字段）。 */
    fun parseGradeItem(item: JSONObject): GradeRecord? {
        // 课程名：可能带 [xxx] 前缀（与 Rust parser.rs 一致：去掉第一个 ] 之前内容）
        val rawName = item.optString("kcmc").trim()
        val courseName = rawName
            .let { name ->
                val idx = name.indexOf(']')
                if (idx >= 0) name.substring(idx + 1).trim() else name
            }
        if (courseName.isEmpty()) return null

        // 课程性质：优先文本 kcxzmc，缺失用代码 kcxz
        val courseType = item.optString("kcxzmc").trim()
            .ifEmpty { item.optString("kcxz").trim() }
            .ifEmpty { null }

        // 学分（数字或字符串）
        val credit = when (val raw = item.opt("xf")) {
            is Number -> raw.toDouble()
            is String -> raw.trim().toDoubleOrNull()
            else -> null
        }

        // 最终成绩：新版 zhcj，旧版 cj
        val score = when (val raw = item.opt("zhcj")) {
            is Number -> numberToString(raw.toDouble())
            is String -> raw.trim().ifEmpty { null }
            else -> item.opt("cj")?.let { cj ->
                when (cj) {
                    is Number -> numberToString(cj.toDouble())
                    is String -> cj.trim().ifEmpty { null }
                    else -> null
                }
            }
        }

        return GradeRecord(courseName = courseName, courseType = courseType, credit = credit, score = score)
    }

    /** 数字转字符串：整数保持原样（92 -> "92"），小数保留（92.5 -> "92.5"）。 */
    private fun numberToString(value: Double): String =
        if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()
}
