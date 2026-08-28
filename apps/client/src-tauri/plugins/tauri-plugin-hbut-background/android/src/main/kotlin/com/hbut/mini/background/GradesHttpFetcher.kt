// GradesHttpFetcher —— 成绩最小请求执行器（#612 网络层）。
//
// 安全边界（#608 红线）：
// - 只在本机直连学校教务（jwxt.hbut.edu.cn / hbut.jw.chaoxing.com），绝不访问
//   hbut.6661111.xyz 或任何 Mini-HBUT 用户后端 fallback；
// - 会话凭据来自 Rust 会话层写入的应用私有 cookie 快照文件
//   （filesDir/hbut_cookie_snapshot.json，secure boundary 内流转，Worker 只读不写）；
// - Worker 不保存、不写回密码；日志严禁输出 cookie/header/响应体。
//
// 错误分类（#612 验收）：
// - 无网/超时/5xx -> NETWORK_ERROR（允许带退避 retry）；
// - 401/403/重定向到登录页 -> AUTH_EXPIRED（不 retry，等待 App 恢复会话）；
// - 其他状态码 -> NETWORK_ERROR（临时性为主）。
// 本文件仅依赖 java.net + org.json（JVM 单测工程可编译；cookie 解析为纯函数可测）。

package com.hbut.mini.background

import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** 会话 cookie 快照（仅保存是否可用的非敏感状态；cookie 值只在请求头中使用，不进入日志/状态）。 */
data class CookieSnapshot(
    /** 教务域（jwxt.hbut.edu.cn）cookie header；空串=无会话。 */
    val jwxtHeader: String,
    /** 学习通教务域（hbut.jw.chaoxing.com）cookie header；空串=无会话。 */
    val chaoxingJwxtHeader: String,
) {
    /** 是否有任一可用会话。 */
    val hasSession: Boolean get() = jwxtHeader.isNotBlank() || chaoxingJwxtHeader.isNotBlank()

    /** 优先使用的教务 base URL 与 cookie（chaoxing 优先，与 Rust academic_base_url 语义一致）。 */
    val preferred: Pair<String, String>?
        get() = when {
            chaoxingJwxtHeader.isNotBlank() -> GradesHttpFetcher.CHAOXING_JWXT_BASE_URL to chaoxingJwxtHeader
            jwxtHeader.isNotBlank() -> GradesHttpFetcher.JWXT_BASE_URL to jwxtHeader
            else -> null
        }
}

/** 成绩数据源（真实 HTTP 实现）。 */
class GradesHttpFetcher(
    /** cookie 快照文件（Rust 会话层维护，Worker 只读）。 */
    private val cookieSnapshotFile: File,
    /** 连接超时（毫秒）。 */
    private val connectTimeoutMs: Int = 10_000,
    /** 读取超时（毫秒）。 */
    private val readTimeoutMs: Int = 15_000,
) : GradesDataFetcher {

    override fun fetch(scope: String): GradesFetchResult {
        // 1. 读取会话快照；无会话 -> auth-expired（等待 App 恢复登录后 Rust 重写快照）
        val snapshot = try {
            if (cookieSnapshotFile.exists()) {
                parseCookieSnapshot(cookieSnapshotFile.readText())
            } else {
                CookieSnapshot("", "")
            }
        } catch (e: Exception) {
            CookieSnapshot("", "")
        }
        if (!snapshot.hasSession) {
            return GradesFetchResult.Failure(
                GradesErrorKind.AUTH_EXPIRED,
                "无可用会话（cookie 快照缺失），等待 App 恢复登录",
            )
        }
        val (baseUrl, cookieHeader) = snapshot.preferred!!

        // 2. 最小成绩请求（与 Rust fetch_grades 相同入口与参数，仅本机直连学校）
        val url = baseUrl + GradesParser.GRADES_PATH
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                instanceFollowRedirects = true
                setRequestProperty("X-Requested-With", "XMLHttpRequest")
                setRequestProperty("Accept", "application/json, text/javascript, */*; q=0.01")
                setRequestProperty("Referer", baseUrl)
                setRequestProperty("Cookie", cookieHeader)
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                doOutput = true
                // #718：目标为校内域（hbut.edu.cn 及子域）时放行证书校验异常，
                // 外部域（chaoxing 等）不触碰、维持平台默认严格校验
                HbutTlsPolicy.applyIfHbutHost(this)
            }
            val form = buildQueryParams()
            conn.outputStream.use { out: OutputStream ->
                out.write(form.toByteArray(StandardCharsets.UTF_8))
            }
            val status = conn.responseCode
            val finalUrl = conn.url.toString()
            val contentType = conn.contentType
            if (status in 200..299) {
                val body = conn.inputStream.use { readAll(it) }
                return GradesFetchResult.Response(
                    HttpResponse(finalUrl = finalUrl, statusCode = status, body = body, contentType = contentType)
                )
            }
            // 401/403：会话失效（不 retry）；其余状态码：临时性失败（允许 retry）
            return if (status == 401 || status == 403) {
                GradesFetchResult.Failure(GradesErrorKind.AUTH_EXPIRED, "会话已失效（HTTP $status）")
            } else {
                GradesFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "成绩接口返回 HTTP $status")
            }
        } catch (e: java.io.IOException) {
            // 无网/超时/连接失败：允许 WorkManager 带退避 retry
            return GradesFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "网络请求失败: ${e.message}")
        } finally {
            conn?.disconnect()
        }
    }

    /** 解析 cookie 快照（纯函数，JVM 可测；不做任何日志输出）。 */
    fun parseCookieSnapshot(text: String): CookieSnapshot {
        return try {
            val obj = JSONObject(text)
            CookieSnapshot(
                jwxtHeader = obj.optString("jwxt", "").trim(),
                chaoxingJwxtHeader = obj.optString("chaoxing_jwxt", "").trim(),
            )
        } catch (e: Exception) {
            CookieSnapshot("", "")
        }
    }

    private fun buildQueryParams(): String {
        val params = linkedMapOf(
            "fxbz" to "0",
            "gridtype" to "jqgrid",
            "queryFields" to "id,xnxq,kcmc,kch,xf,kcxz,kclx,ksxs,kcgs,xdxz,kclb,cjfxms,zhcj,hdxf,tscjzwmc,sfbk,cjlrjsxm,jsxm,kcsx,fxcj,dztmlfjcj",
            "_search" to "false",
            "page.size" to "500",
            "page.pn" to "1",
            "sort" to "xnxq desc,id",
            "order" to "desc",
            "startXnxq" to "001",
            "endXnxq" to "001",
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

    companion object {
        /** 教务主域（学校原生链路）。 */
        const val JWXT_BASE_URL: String = "https://jwxt.hbut.edu.cn"

        /** 学习通教务域（学籍/成绩同一接口入口）。 */
        const val CHAOXING_JWXT_BASE_URL: String = "https://hbut.jw.chaoxing.com"
    }
}
