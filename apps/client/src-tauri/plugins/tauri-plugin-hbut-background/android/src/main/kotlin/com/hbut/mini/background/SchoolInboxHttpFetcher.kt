// SchoolInboxHttpFetcher —— 学校消息最小请求执行器（#615 Part B）。
//
// provider 抽象（#615：不同 provider/account 不串数据，ID 带 provider 前缀）：
// - portal：教务通知中心（{jwxt}/admin/system/tzsjx/ajaxList），复用现有
//   hbut_cookie_snapshot.json 的 jwxtHeader（与 Rust fetch_portal_inbox 同入口）；
// - chaoxing：学习通收件箱（notice.chaoxing.com getNoticeList），需要学习通通知
//   cookie 快照（filesDir/hbut_notice_cookie_snapshot.json，由 Rust 会话层写入；
//   缺失时该 provider 诚实标记 unsupported，不静默假成功）。
//
// provider 选择：按可用性依次尝试（portal 优先，chaoxing 兜底），全部不可用 ->
// UNSUPPORTED。单次最小检查只做 1 个请求（chaoxing 只拉第一页 50 条，新消息在顶部）。
//
// 安全边界（#608 红线）：只本机直连学校域名；不访问任何 Mini-HBUT 用户后端；
// cookie 只用于请求头，不进入日志/状态/event。
// 本文件仅依赖 java.net + org.json（JVM 单测工程可编译）。

package com.hbut.mini.background

import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/** 学校消息数据源（真实 HTTP 实现）。 */
class SchoolInboxHttpFetcher(
    /** jwxt/chaoxing-jwxt 会话 cookie 快照（Rust 会话层维护，Worker 只读）。 */
    private val cookieSnapshotFile: File,
    /** 学习通通知 cookie 快照（可选；缺失时 chaoxing provider 标记 unsupported）。 */
    private val noticeCookieSnapshotFile: File,
    /** 连接超时（毫秒）。 */
    private val connectTimeoutMs: Int = 10_000,
    /** 读取超时（毫秒）。 */
    private val readTimeoutMs: Int = 15_000,
) : SchoolInboxDataFetcher {

    override fun fetch(scope: String): SchoolInboxFetchResult {
        // 1. 可用性判断（诚实标记，不伪造成功）
        val jwxtHeader = readSnapshotHeader(cookieSnapshotFile, "jwxt")
        val noticeHeader = readSnapshotHeader(noticeCookieSnapshotFile, "cookie")
        if (jwxtHeader.isBlank() && noticeHeader.isBlank()) {
            return SchoolInboxFetchResult.Failure(
                SchoolInboxErrorKind.UNSUPPORTED,
                "后台无可用学校消息 provider（缺教务/学习通会话快照），学校消息后台检测不可用（前台可检测）",
            )
        }

        // 2. provider 选择：portal 优先（单请求），chaoxing 兜底（单页）
        if (jwxtHeader.isNotBlank()) {
            val result = fetchPortal(jwxtHeader)
            if (result !is SchoolInboxFetchResult.Failure ||
                result.kind != SchoolInboxErrorKind.AUTH_EXPIRED
            ) {
                return result // portal 成功或网络/解析失败都直接返回
            }
            // portal 会话失效但存在 chaoxing 通知快照时兜底尝试 chaoxing
        }
        if (noticeHeader.isNotBlank()) {
            return fetchChaoxing(noticeHeader)
        }
        return SchoolInboxFetchResult.Failure(
            SchoolInboxErrorKind.UNSUPPORTED,
            "后台无可用学校消息 provider（教务会话已失效且缺学习通通知快照）",
        )
    }

    /** portal：教务通知中心单请求（与 Rust fetch_portal_inbox 同入口）。 */
    private fun fetchPortal(cookieHeader: String): SchoolInboxFetchResult {
        val baseUrl = GradesHttpFetcher.JWXT_BASE_URL
        val url = baseUrl + PORTAL_PATH
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                instanceFollowRedirects = true
                setRequestProperty("X-Requested-With", "XMLHttpRequest")
                setRequestProperty("Accept", "application/json, text/javascript, */*; q=0.01")
                setRequestProperty("Referer", "$baseUrl/admin/")
                setRequestProperty("Cookie", cookieHeader)
                // #718：jwxt 为校内域，证书校验异常放行
                HbutTlsPolicy.applyIfHbutHost(this)
            }
            val status = conn.responseCode
            val finalUrl = conn.url.toString()
            if (status in 200..299) {
                val body = conn.inputStream.use { readAll(it) }
                val contentType = conn.contentType
                return parsePortal(ExamsParser.looksLikeLoginUrl(finalUrl), body, contentType)
            }
            if (status == 401 || status == 403) {
                return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.AUTH_EXPIRED, "教务会话已失效（HTTP $status）")
            }
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.NETWORK_ERROR, "教务通知接口返回 HTTP $status")
        } catch (e: java.io.IOException) {
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.NETWORK_ERROR, "网络请求失败: ${e.message}")
        } finally {
            conn?.disconnect()
        }
    }

    /** chaoxing：学习通收件箱第一页（50 条；新消息在顶部）。 */
    private fun fetchChaoxing(cookieHeader: String): SchoolInboxFetchResult {
        var conn: HttpURLConnection? = null
        try {
            conn = (URL(CHAOXING_NOTICE_LIST_BASE).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                instanceFollowRedirects = true
                setRequestProperty("Accept", "application/json, text/plain, */*")
                setRequestProperty("Referer", "https://i.chaoxing.com/")
                setRequestProperty("Cookie", cookieHeader)
                // #718：chaoxing 为外部域，判定不命中即不触碰（维持平台默认严格校验）
                HbutTlsPolicy.applyIfHbutHost(this)
            }
            val status = conn.responseCode
            val finalUrl = conn.url.toString()
            if (status in 200..299) {
                val body = conn.inputStream.use { readAll(it) }
                val contentType = conn.contentType
                return parseChaoxing(body, contentType)
            }
            if (status == 401 || status == 403) {
                return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.AUTH_EXPIRED, "学习通会话已失效（HTTP $status）")
            }
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.NETWORK_ERROR, "学习通通知接口返回 HTTP $status")
        } catch (e: java.io.IOException) {
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.NETWORK_ERROR, "网络请求失败: ${e.message}")
        } finally {
            conn?.disconnect()
        }
    }

    // ---- 响应解析（纯函数，JVM 可测；与 Rust parse_portal_tzsjx_payload /
    //      parse_chaoxing_notice_payload 最小字段对齐） ----

    fun parsePortal(isLoginRedirect: Boolean, body: String, contentType: String?): SchoolInboxFetchResult {
        val trimmed = body.trim()
        if (trimmed.isEmpty()) {
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.PARSE_ERROR, "教务通知响应为空")
        }
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            if (isLoginRedirect) {
                return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.AUTH_EXPIRED, "教务会话已过期，等待 App 恢复登录")
            }
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.PARSE_ERROR, "教务通知响应不是 JSON 格式")
        }
        return try {
            val json = JSONObject(trimmed)
            val rows = json.optJSONArray("rows") ?: json.optJSONArray("items")
            val items = ArrayList<SchoolMessageItem>()
            if (rows != null) {
                for (i in 0 until rows.length()) {
                    val row = rows.optJSONObject(i) ?: continue
                    val id = row.optString("id").trim()
                    if (id.isEmpty()) continue
                    items.add(
                        SchoolMessageItem(
                            id = "portal:tzsjx:$id",
                            title = row.optString("title").trim(),
                            isRead = false, // 教务 tzsjx 列表不提供可靠已读字段：一律视为未读（新到才通知，已读由 knownIds 保证不重复）
                            provider = "portal",
                            createdAt = row.optString("releaseDate").trim().ifEmpty { null },
                        ),
                    )
                }
            }
            SchoolInboxFetchResult.Response(items, "portal")
        } catch (e: Exception) {
            SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.PARSE_ERROR, "教务通知 JSON 解析失败: ${e.message}")
        }
    }

    fun parseChaoxing(body: String, contentType: String?): SchoolInboxFetchResult {
        val trimmed = body.trim()
        if (trimmed.isEmpty()) {
            return SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.PARSE_ERROR, "学习通通知响应为空")
        }
        return try {
            val json = JSONObject(trimmed)
            if (json.optString("result") != "1") {
                val msg = json.optString("msg", "").take(80)
                return SchoolInboxFetchResult.Failure(
                    SchoolInboxErrorKind.PARSE_ERROR,
                    "学习通通知接口业务错误: ${msg.ifEmpty { "result != 1" }}",
                )
            }
            val data = json.optJSONObject("data")
            val notices = data?.optJSONArray("notices")
            val items = ArrayList<SchoolMessageItem>()
            if (notices != null) {
                for (i in 0 until notices.length()) {
                    val row = notices.optJSONObject(i) ?: continue
                    val id = row.optString("id").trim()
                    if (id.isEmpty()) continue
                    // 已读状态：title 前缀 "【已读】"（chaoxing 语义；其余视为未读）
                    val rawTitle = row.optString("title").trim()
                    val isRead = rawTitle.startsWith("【已读】")
                    val title = if (isRead) rawTitle.removePrefix("【已读】").trim() else rawTitle
                    items.add(
                        SchoolMessageItem(
                            id = "chaoxing:notice:$id",
                            title = title,
                            isRead = isRead,
                            provider = "chaoxing",
                            createdAt = row.optString("createTime").trim().ifEmpty { null },
                        ),
                    )
                }
            }
            SchoolInboxFetchResult.Response(items, "chaoxing")
        } catch (e: Exception) {
            SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.PARSE_ERROR, "学习通通知 JSON 解析失败: ${e.message}")
        }
    }

    /** 读取 cookie 快照中的指定字段（纯函数，JVM 可测）。 */
    fun readSnapshotHeader(file: File, key: String): String {
        if (!file.exists()) return ""
        return try {
            val obj = JSONObject(file.readText())
            obj.optString(key, "").trim()
        } catch (e: Exception) {
            ""
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
        /** 教务通知中心路径（与 Rust fetch_portal_inbox 一致）。 */
        const val PORTAL_PATH: String =
            "/admin/system/tzsjx/ajaxList?gridtype=jqgrid&queryFields=id%2Cdqstatus%2Ccollectstatus%2Ctitle%2Ccontent%2CreleaseDate%2C&_search=false&page.size=500&page.pn=1&sort=id&order=desc"

        /** 学习通收件箱第一页（type=2 = 我收到的通知；与 Rust CHAOXING_NOTICE_LIST_BASE 一致）。 */
        const val CHAOXING_NOTICE_LIST_BASE: String =
            "https://notice.chaoxing.com/apis/other/getNoticeList?type=2&crossOrigin=true&pageSize=50"
    }
}
