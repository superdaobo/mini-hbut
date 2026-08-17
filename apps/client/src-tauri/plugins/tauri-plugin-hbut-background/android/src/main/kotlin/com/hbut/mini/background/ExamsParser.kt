// ExamsParser —— 教务考试安排原始响应解析（#615 Part A）。
//
// 与 Rust http_client/academic/exams.rs + parser::parse_exams 对齐的最小字段映射：
// - 新版格式 {"ret":0,"msg":"ok","results":[...]}；旧版格式 {"items":[...]}；
// - 每条记录字段：kcmc(课程名)、ksrq(考试日期)、kssj(考试时间区间 09:00-11:00)、
//   jsmc/ksdd/cdmc(地点)、zwh(座位号)、kslxmc(考试类型)。
// 只解析 signature 所需字段（#615 Worker 最小职责：不解析完整考试明细）。
//
// 响应分类（与 #612 GradesParser 同模式）：
// - 重定向到教务登录页（authserver/login、/admin/login）-> AUTH_EXPIRED（不无限 retry）；
// - 非 JSON 响应（HTML 登录页等）-> AUTH_EXPIRED / PARSE_ERROR 区分；
// - JSON ret != 0 或缺少 results/items -> PARSE_ERROR（不更新 baseline，不误报）。
// 本文件为纯 JVM 代码（org.json + java.net），JVM 单测直接覆盖分类逻辑。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject

/** 解析结果。 */
sealed class ExamsParseResult {
    /** 解析成功（可能为空列表：无考试记录；空列表是合法状态，允许建立空 baseline）。 */
    data class Success(val records: List<ExamRecord>) : ExamsParseResult()

    /** 解析失败（含非敏感错误摘要，严禁包含 cookie/header/响应敏感字段）。 */
    data class Error(val kind: GradesErrorKind, val summary: String) : ExamsParseResult()
}

/** 考试响应解析器（纯函数，无状态）。 */
object ExamsParser {

    /** 教务考试接口路径（与 Rust fetch_exams 一致，仅本机直连学校）。 */
    const val EXAMS_PATH: String = "/admin/xsd/kwglXsdKscx/ajaxXsksList"

    /** 判定 URL 是否为教务登录页（与 GradesParser.looksLikeLoginUrl 同一语义）。 */
    fun looksLikeLoginUrl(url: String): Boolean = GradesParser.looksLikeLoginUrl(url)

    /** 分类 HTTP 响应为解析结果（纯函数，JVM 可测）。 */
    fun parseResponse(response: HttpResponse): ExamsParseResult {
        val body = response.body.trim()
        if (body.isEmpty()) {
            return ExamsParseResult.Error(GradesErrorKind.PARSE_ERROR, "考试响应为空")
        }
        if (!body.startsWith("{") && !body.startsWith("[")) {
            if (looksLikeLoginUrl(response.finalUrl) || looksLikeHtmlLoginPage(body)) {
                return ExamsParseResult.Error(GradesErrorKind.AUTH_EXPIRED, "会话已过期，等待 App 恢复登录")
            }
            return ExamsParseResult.Error(GradesErrorKind.PARSE_ERROR, "考试响应不是 JSON 格式")
        }
        val json = try {
            JSONObject(body)
        } catch (e: Exception) {
            return ExamsParseResult.Error(GradesErrorKind.PARSE_ERROR, "考试 JSON 解析失败: ${e.message}")
        }
        val ret = json.optInt("ret", -1)
        if (json.has("ret") && ret != 0) {
            val msg = json.optString("msg", "").take(80)
            return ExamsParseResult.Error(GradesErrorKind.PARSE_ERROR, "考试接口业务错误(ret=$ret): $msg")
        }
        val items: JSONArray? = when {
            json.has("results") -> json.optJSONArray("results")
            json.has("items") -> json.optJSONArray("items")
            else -> null
        }
        if (items == null) {
            // 缺 results/items：可能是瞬时服务端异常，按解析失败处理（不更新 baseline，不误报；
            // 与 GradesParser 同模式。真正的"本学期无考试"应返回空数组 results:[]，走 Success(空)）。
            return ExamsParseResult.Error(GradesErrorKind.PARSE_ERROR, "考试响应缺少 results/items")
        }
        val records = (0 until items.length()).mapNotNull { i ->
            val obj = items.optJSONObject(i) ?: return@mapNotNull null
            parseExamItem(obj)
        }
        return ExamsParseResult.Success(records)
    }

    /** HTML 登录页特征（body 兜底判定；finalUrl 判定优先，与 GradesParser 同模式）。 */
    private fun looksLikeHtmlLoginPage(body: String): Boolean {
        val lower = body.lowercase()
        return lower.contains("<html") &&
            (lower.contains("login") || lower.contains("cas") || lower.contains("authserver"))
    }

    /** 教务单条考试记录 -> 标准化 ExamRecord（只取 signature 字段）。 */
    fun parseExamItem(item: JSONObject): ExamRecord? {
        val courseName = item.optString("kcmc").trim()
        if (courseName.isEmpty()) return null

        val examDate = item.optString("ksrq").trim().ifEmpty { null }
        val examTime = item.optString("kssj").trim().ifEmpty { null }
        // 地点：jsmc(教室名) 优先，ksdd/cdmc 兜底（与 Rust parser 一致）
        val location = item.optString("jsmc").trim()
            .ifEmpty { item.optString("ksdd").trim() }
            .ifEmpty { item.optString("cdmc").trim() }
            .ifEmpty { null }
        val seatNo = item.optString("zwh").trim().ifEmpty { null }
        val examType = item.optString("kslxmc").trim().ifEmpty { null }

        return ExamRecord(
            courseName = courseName,
            examDate = examDate,
            examTime = examTime,
            location = location,
            seatNo = seatNo,
            examType = examType,
        )
    }
}
