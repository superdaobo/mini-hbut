// ExamSignatureV1 边界单测：#615 跨端契约的 Kotlin 侧补充覆盖。

package com.hbut.mini.background

import org.junit.Assert.assertEquals
import org.junit.Test

class ExamSignatureV1ExtraTest {

    @Test
    fun `empty records produce empty signature`() {
        assertEquals("", ExamSignatureV1.compute(emptyList()))
    }

    @Test
    fun `records with blank courseName are skipped`() {
        val records = listOf(
            ExamRecord(courseName = "   ", examDate = "2026-06-22", examTime = null, location = null, seatNo = null, examType = null),
            ExamRecord(courseName = "", examDate = null, examTime = null, location = null, seatNo = null, examType = null),
        )
        assertEquals("全部课程名为空 -> 空签名", "", ExamSignatureV1.compute(records))
    }

    @Test
    fun `whitespace and nil are equivalent`() {
        val a = listOf(ExamRecord("高数", "2026-06-22", "09:00-11:00", "教1-101", "12", "正常考试"))
        val b = listOf(ExamRecord(" 高数 ", " 2026-06-22 ", " 09:00-11:00 ", " 教1-101 ", " 12 ", " 正常考试 "))
        assertEquals("空白/nil 等价（trim 归一化）", ExamSignatureV1.compute(a), ExamSignatureV1.compute(b))
    }

    @Test
    fun `nil fields and empty strings are equivalent`() {
        val a = listOf(ExamRecord("高数", "2026-06-22", null, null, null, null))
        val b = listOf(ExamRecord("高数", "2026-06-22", "", "", "", ""))
        assertEquals("nil 与空串等价", ExamSignatureV1.compute(a), ExamSignatureV1.compute(b))
    }

    @Test
    fun `json array parsing matches direct records`() {
        val json = org.json.JSONArray()
            .put(org.json.JSONObject()
                .put("courseName", "高数")
                .put("examDate", "2026-06-22")
                .put("examTime", "09:00-11:00")
                .put("location", "教1-101")
                .put("seatNo", "12")
                .put("examType", "正常考试")
                .put("rawId", "e-1") // 无关字段不参与
            )
        val direct = ExamSignatureV1.compute(
            listOf(ExamRecord("高数", "2026-06-22", "09:00-11:00", "教1-101", "12", "正常考试"))
        )
        assertEquals("JSON 数组解析与直接构造一致（无关字段忽略）", direct, ExamSignatureV1.computeFromJsonArray(json))
    }

    @Test
    fun `blank courseName record is skipped in mixed list`() {
        val records = listOf(
            ExamRecord("高数", "2026-06-22", "09:00-11:00", null, null, null),
            ExamRecord("", "2026-06-25", "14:00-16:00", "教2-305", "8", null),
        )
        val expected = ExamSignatureV1.compute(
            listOf(ExamRecord("高数", "2026-06-22", "09:00-11:00", null, null, null))
        )
        assertEquals("无课程名记录不参与签名", expected, ExamSignatureV1.compute(records))
    }
}
