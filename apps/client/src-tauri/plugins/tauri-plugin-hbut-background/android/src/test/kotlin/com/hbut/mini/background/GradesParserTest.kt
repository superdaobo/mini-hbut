// GradesParser 单测：教务 JSON 解析 + 响应分类（#612 错误映射）。

package com.hbut.mini.background

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GradesParserTest {

    // ---- 响应分类 ----

    @Test
    fun `new api format parses to records`() {
        val body = """
            {"ret":0,"msg":"ok","results":[
              {"id":"1","xnxq":"2024-2025-1","kcmc":"高等数学A","kch":"C101","xf":5,"zhcj":92,"kcxzmc":"必修"},
              {"id":"2","xnxq":"2024-2025-1","kcmc":"大学英语","kch":"C102","xf":3,"zhcj":85,"kcxzmc":"必修"}
            ]}
        """.trimIndent()
        val result = GradesParser.parseResponse(response(body))
        assertTrue(result is GradesParseResult.Success)
        val records = (result as GradesParseResult.Success).records
        assertEquals(2, records.size)
        assertEquals("高等数学A", records[0].courseName)
        assertEquals("必修", records[0].courseType)
        assertEquals(5.0, records[0].credit)
        assertEquals("92", records[0].score)
    }

    @Test
    fun `legacy items format parses`() {
        val body = """{"items":[{"kcmc":"体育","xf":"1","cj":"优秀"}]}"""
        val result = GradesParser.parseResponse(response(body))
        assertTrue(result is GradesParseResult.Success)
        val records = (result as GradesParseResult.Success).records
        assertEquals(1, records.size)
        assertEquals("体育", records[0].courseName)
        assertEquals("优秀", records[0].score)
    }

    @Test
    fun `course name prefix bracket is stripped`() {
        val body = """{"ret":0,"msg":"ok","results":[{"kcmc":"[必修]高等数学A","xf":5,"zhcj":92}]}"""
        val result = GradesParser.parseResponse(response(body))
        val records = (result as GradesParseResult.Success).records
        assertEquals("高等数学A", records[0].courseName)
    }

    @Test
    fun `numeric score handling integral and fractional`() {
        val body = """{"results":[{"kcmc":"A","xf":5,"zhcj":92},{"kcmc":"B","xf":3,"zhcj":92.5}]}"""
        val result = GradesParser.parseResponse(response(body))
        val records = (result as GradesParseResult.Success).records
        assertEquals("92", records[0].score)
        assertEquals("92.5", records[1].score)
    }

    @Test
    fun `empty records list is success`() {
        val body = """{"ret":0,"msg":"ok","results":[]}"""
        val result = GradesParser.parseResponse(response(body))
        assertTrue(result is GradesParseResult.Success)
        assertTrue((result as GradesParseResult.Success).records.isEmpty())
    }

    @Test
    fun `login page redirect classifies as auth expired`() {
        // 命中教务登录页（authserver/login）
        val html = "<html><head><title>登录</title></head><body>cas login</body></html>"
        val result = GradesParser.parseResponse(response(html, finalUrl = "https://jwxt.hbut.edu.cn/authserver/login?service=..."))
        assertTrue(result is GradesParseResult.Error)
        assertEquals(GradesErrorKind.AUTH_EXPIRED, (result as GradesParseResult.Error).kind)
    }

    @Test
    fun `non json without login marker is parse error`() {
        val result = GradesParser.parseResponse(response("<html>502 Bad Gateway</html>", finalUrl = "https://jwxt.hbut.edu.cn/admin/..."))
        assertTrue(result is GradesParseResult.Error)
        assertEquals(GradesErrorKind.PARSE_ERROR, (result as GradesParseResult.Error).kind)
    }

    @Test
    fun `empty body is parse error`() {
        val result = GradesParser.parseResponse(response(""))
        assertTrue(result is GradesParseResult.Error)
        assertEquals(GradesErrorKind.PARSE_ERROR, (result as GradesParseResult.Error).kind)
    }

    @Test
    fun `business error ret code is parse error`() {
        val body = """{"ret":1,"msg":"系统错误","results":[]}"""
        val result = GradesParser.parseResponse(response(body))
        assertTrue(result is GradesParseResult.Error)
        assertEquals(GradesErrorKind.PARSE_ERROR, (result as GradesParseResult.Error).kind)
    }

    @Test
    fun `missing results and items is parse error`() {
        val body = """{"foo":"bar"}"""
        val result = GradesParser.parseResponse(response(body))
        assertTrue(result is GradesParseResult.Error)
        assertEquals(GradesErrorKind.PARSE_ERROR, (result as GradesParseResult.Error).kind)
    }

    @Test
    fun `malformed json is parse error`() {
        val result = GradesParser.parseResponse(response("{not-json!!"))
        assertTrue(result is GradesParseResult.Error)
        assertEquals(GradesErrorKind.PARSE_ERROR, (result as GradesParseResult.Error).kind)
    }

    @Test
    fun `looksLikeLoginUrl covers admin login variants`() {
        assertTrue(GradesParser.looksLikeLoginUrl("https://jwxt.hbut.edu.cn/authserver/login?service=x"))
        assertTrue(GradesParser.looksLikeLoginUrl("https://jwxt.hbut.edu.cn/admin/login"))
        assertTrue(!GradesParser.looksLikeLoginUrl("https://jwxt.hbut.edu.cn/admin/login2"))
        assertTrue(!GradesParser.looksLikeLoginUrl("https://jwxt.hbut.edu.cn/admin/xsdcjcx/xsdQueryXscjList"))
    }

    @Test
    fun `record with empty course name is skipped`() {
        val body = """{"results":[{"kcmc":"  ","xf":5,"zhcj":92},{"kcmc":"体育","xf":1,"cj":"优秀"}]}"""
        val result = GradesParser.parseResponse(response(body))
        val records = (result as GradesParseResult.Success).records
        assertEquals(1, records.size)
        assertEquals("体育", records[0].courseName)
    }

    @Test
    fun `fallback score uses cj when z hcj missing`() {
        val body = """{"items":[{"kcmc":"体育","cj":"缺考"}]}"""
        val result = GradesParser.parseResponse(response(body))
        val records = (result as GradesParseResult.Success).records
        assertEquals("缺考", records[0].score)
    }

    private fun response(
        body: String,
        finalUrl: String = "https://jwxt.hbut.edu.cn/admin/xsd/xsdcjcx/xsdQueryXscjList",
        status: Int = 200,
    ): HttpResponse = HttpResponse(finalUrl = finalUrl, statusCode = status, body = body, contentType = "application/json")
}
