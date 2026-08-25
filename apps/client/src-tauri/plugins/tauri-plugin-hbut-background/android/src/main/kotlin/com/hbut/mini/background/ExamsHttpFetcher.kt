// ExamsHttpFetcher —— 考试安排最小请求执行器（#615 Part A）。
//
// 安全边界（#608 红线，与 GradesHttpFetcher 同模式）：
// - 只在本机直连学校教务（jwxt.hbut.edu.cn / hbut.jw.chaoxing.com），绝不访问
//   任何 Mini-HBUT 用户后端 fallback；
// - 会话凭据来自 Rust 会话层写入的应用私有 cookie 快照文件
//   （filesDir/hbut_cookie_snapshot.json，Worker 只读不写）；
// - 请求参数与 Rust fetch_exams 同源：/admin/xsd/kwglXsdKscx/ajaxXsksList，
//   queryFields 覆盖 signature 所需字段（kcmc/ksrq/kssj/jsmc/ksdd/zwh/kslxmc）；
// - 学期参数：native 最小检查不携带复杂校历解析，发送空 xnxq 交由服务端默认
//   （首次 baseline 可能为空，后续数据出现时自然触发变化；完整学期数据由
//   App resume 时 Rust fetch_exams 全量同步兜底）。
//
// 错误分类（与 #612 验收一致）：
// - 无网/超时/5xx -> NETWORK_ERROR（允许带退避 retry）；
// - 401/403/重定向到登录页 -> AUTH_EXPIRED（不 retry，等待 App 恢复会话）；
// - 其他状态码 -> NETWORK_ERROR（临时性为主）。
// 本文件仅依赖 java.net + org.json（JVM 单测工程可编译）。

package com.hbut.mini.background

import java.io.BufferedReader
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** 考试数据源（真实 HTTP 实现；cookie 快照复用 GradesHttpFetcher 的同一文件）。 */
class ExamsHttpFetcher(
    /** cookie 快照文件（Rust 会话层维护，Worker 只读）。 */
    private val cookieSnapshotFile: File,
    /** 连接超时（毫秒）。 */
    private val connectTimeoutMs: Int = 10_000,
    /** 读取超时（毫秒）。 */
    private val readTimeoutMs: Int = 15_000,
) : ExamsDataFetcher {

    override fun fetch(scope: String): ExamsFetchResult {
        // 1. 读取会话快照；无会话 -> auth-expired（等待 App 恢复登录后 Rust 重写快照）
        val snapshot = try {
            if (cookieSnapshotFile.exists()) {
                GradesHttpFetcher(cookieSnapshotFile).parseCookieSnapshot(cookieSnapshotFile.readText())
            } else {
                CookieSnapshot("", "")
            }
        } catch (e: Exception) {
            CookieSnapshot("", "")
        }
        if (!snapshot.hasSession) {
            return ExamsFetchResult.Failure(
                GradesErrorKind.AUTH_EXPIRED,
                "无可用会话（cookie 快照缺失），等待 App 恢复登录",
            )
        }
        val (baseUrl, cookieHeader) = snapshot.preferred!!

        // 2. 最小考试请求（与 Rust fetch_exams 同入口与参数，仅本机直连学校）
        val query = buildQueryParams()
        val url = baseUrl + ExamsParser.EXAMS_PATH + "?" + query
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                instanceFollowRedirects = true
                setRequestProperty("X-Requested-With", "XMLHttpRequest")
                setRequestProperty("Accept", "application/json, text/javascript, */*; q=0.01")
                setRequestProperty("Referer", "$baseUrl/admin/xsd/kwglXsdKscx")
                setRequestProperty("Cookie", cookieHeader)
                // #718：目标为校内域时放行证书校验异常；外部域不触碰、维持平台默认严格校验
                HbutTlsPolicy.applyIfHbutHost(this)
            }
            val status = conn.responseCode
            val finalUrl = conn.url.toString()
            val contentType = conn.contentType
            if (status in 200..299) {
                val body = conn.inputStream.use { readAll(it) }
                return ExamsFetchResult.Response(
                    HttpResponse(finalUrl = finalUrl, statusCode = status, body = body, contentType = contentType)
                )
            }
            return if (status == 401 || status == 403) {
                ExamsFetchResult.Failure(GradesErrorKind.AUTH_EXPIRED, "会话已失效（HTTP $status）")
            } else {
                ExamsFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "考试接口返回 HTTP $status")
            }
        } catch (e: java.io.IOException) {
            return ExamsFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "网络请求失败: ${e.message}")
        } finally {
            conn?.disconnect()
        }
    }

    private fun buildQueryParams(): String {
        val params = linkedMapOf(
            "gridtype" to "jqgrid",
            "queryFields" to "id,kcmc,ksrq,kssj,xnxq,jsmc,ksdd,zwh,sddz,ksrs,kslx,kslxmc,kscddz,kcxxdz",
            "_search" to "false",
            "page.size" to "100",
            "page.pn" to "1",
            "sort" to "ksrq",
            "order" to "desc",
            "xnxq" to "",
        )
        return params.entries.joinToString("&") { (k, v) ->
            "${URLEncoder.encode(k, "UTF-8")}=${URLEncoder.encode(v, "UTF-8")}"
        }
    }

    private fun readAll(stream: InputStream): String {
        val reader = BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8))
        val sb = StringBuilder()
        val buf = CharArray(4096)
        while (true) {
            val n = reader.read(buf)
            if (n < 0) break
            sb.append(buf, 0, n)
        }
        return sb.toString()
    }
}
