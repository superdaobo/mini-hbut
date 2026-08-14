// SchoolInboxHttpFetcher 单测：#615 Part B —— provider 可用性 / portal/chaoxing 解析 / 快照读取。

package com.hbut.mini.background

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class SchoolInboxHttpFetcherTest {

    private lateinit var tempDir: File
    private lateinit var cookieFile: File
    private lateinit var noticeFile: File
    private lateinit var fetcher: SchoolInboxHttpFetcher

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "school-fetcher-test")
        cookieFile = File(tempDir, "hbut_cookie_snapshot.json")
        noticeFile = File(tempDir, "hbut_notice_cookie_snapshot.json")
        fetcher = SchoolInboxHttpFetcher(cookieFile, noticeFile)
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    // ---- 快照读取 ----

    @Test
    fun `missing snapshot files return empty header`() {
        assertEquals("", fetcher.readSnapshotHeader(cookieFile, "jwxt"))
        assertEquals("", fetcher.readSnapshotHeader(noticeFile, "cookie"))
    }

    @Test
    fun `corrupt snapshot returns empty header`() {
        cookieFile.writeText("{broken")
        assertEquals("", fetcher.readSnapshotHeader(cookieFile, "jwxt"))
    }

    @Test
    fun `snapshot header is read correctly`() {
        cookieFile.writeText("""{"jwxt":"JSESSIONID=abc","chaoxing_jwxt":"xxtenc=xyz"}""")
        assertEquals("JSESSIONID=abc", fetcher.readSnapshotHeader(cookieFile, "jwxt"))
        assertEquals("xxtenc=xyz", fetcher.readSnapshotHeader(cookieFile, "chaoxing_jwxt"))
    }

    // ---- portal 解析（与 Rust parse_portal_tzsjx_payload 最小字段对齐） ----

    @Test
    fun `portal parse extracts provider-prefixed ids`() {
        val body = """{"rows":[{"id":"101","title":"选课通知","releaseDate":"2026-08-01"},{"id":"102","title":"放假通知","releaseDate":"2026-08-02"}]}"""
        val result = fetcher.parsePortal(isLoginRedirect = false, body = body, contentType = "application/json")
        assertTrue(result is SchoolInboxFetchResult.Response)
        val response = result as SchoolInboxFetchResult.Response
        assertEquals("portal", response.provider)
        assertEquals(2, response.items.size)
        assertEquals("portal:tzsjx:101", response.items[0].id)
        assertEquals("选课通知", response.items[0].title)
    }

    @Test
    fun `portal empty rows returns empty response`() {
        val result = fetcher.parsePortal(false, """{"rows":[]}""", "application/json")
        assertTrue(result is SchoolInboxFetchResult.Response)
        assertTrue((result as SchoolInboxFetchResult.Response).items.isEmpty())
    }

    @Test
    fun `portal login redirect maps to auth expired`() {
        val result = fetcher.parsePortal(true, "<html><title>login</title></html>", "text/html")
        assertTrue(result is SchoolInboxFetchResult.Failure)
        assertEquals(SchoolInboxErrorKind.AUTH_EXPIRED, (result as SchoolInboxFetchResult.Failure).kind)
    }

    @Test
    fun `portal html without login maps to parse error`() {
        val result = fetcher.parsePortal(false, "<html><body>error</body></html>", "text/html")
        assertTrue(result is SchoolInboxFetchResult.Failure)
        assertEquals(SchoolInboxErrorKind.PARSE_ERROR, (result as SchoolInboxFetchResult.Failure).kind)
    }

    // ---- chaoxing 解析（与 Rust parse_chaoxing_notice_payload 最小字段对齐） ----

    @Test
    fun `chaoxing parse extracts ids and read flag from title prefix`() {
        val body = """{"result":"1","msg":"ok","data":{"notices":[{"id":"501","title":"教学安排","createTime":"2026-08-01"},{"id":"502","title":"【已读】历史通知","createTime":"2026-08-02"}]}}"""
        val result = fetcher.parseChaoxing(body, "application/json")
        assertTrue(result is SchoolInboxFetchResult.Response)
        val response = result as SchoolInboxFetchResult.Response
        assertEquals("chaoxing", response.provider)
        assertEquals(2, response.items.size)
        assertEquals("chaoxing:notice:501", response.items[0].id)
        assertEquals("教学安排", response.items[0].title)
        assertEquals(false, response.items[0].isRead)
        assertEquals("【已读】前缀 -> isRead=true 且标题去前缀", "历史通知", response.items[1].title)
        assertEquals(true, response.items[1].isRead)
    }

    @Test
    fun `chaoxing business error maps to parse error`() {
        val result = fetcher.parseChaoxing("""{"result":"0","msg":"需要登录"}""", "application/json")
        assertTrue(result is SchoolInboxFetchResult.Failure)
        assertEquals(SchoolInboxErrorKind.PARSE_ERROR, (result as SchoolInboxFetchResult.Failure).kind)
    }

    @Test
    fun `chaoxing empty body maps to parse error`() {
        val result = fetcher.parseChaoxing("", "application/json")
        assertTrue(result is SchoolInboxFetchResult.Failure)
        assertEquals(SchoolInboxErrorKind.PARSE_ERROR, (result as SchoolInboxFetchResult.Failure).kind)
    }
}
