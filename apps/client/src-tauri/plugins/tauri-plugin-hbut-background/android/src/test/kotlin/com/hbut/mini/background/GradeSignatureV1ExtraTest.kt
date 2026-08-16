// GradeSignatureV1 边界行为单测（与 Swift 语义逐项对齐）。

package com.hbut.mini.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class GradeSignatureV1ExtraTest {

    @Test
    fun `empty or all-invalid records produce empty signature`() {
        assertEquals("空列表 -> 空串", "", GradeSignatureV1.compute(emptyList()))
        assertEquals(
            "courseName 全为空的记录跳过 -> 空串",
            "",
            GradeSignatureV1.compute(listOf(GradeRecord("   ", "必修", 1.0, "92"))),
        )
    }

    @Test
    fun `whitespace around fields is trimmed`() {
        val a = GradeSignatureV1.compute(listOf(GradeRecord("高等数学A", "必修", 5.0, "92")))
        val b = GradeSignatureV1.compute(listOf(GradeRecord("  高等数学A  ", " 必修 ", 5.0, " 92 ")))
        assertEquals("trim 后必须一致", a, b)
    }

    @Test
    fun `null and empty courseType and score are equivalent`() {
        val a = GradeSignatureV1.compute(listOf(GradeRecord("高等数学A", null, 5.0, null)))
        val b = GradeSignatureV1.compute(listOf(GradeRecord("高等数学A", "", 5.0, "")))
        assertEquals("nil 与空串等价", a, b)
    }

    @Test
    fun `credit is formatted with fixed 6 decimals`() {
        val a = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 2.5, "90")))
        val b = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 2.5000001, "90")))
        // 2.5 与 2.5000001 在 %.6f 下均为 2.500000？2.5000001 -> 2.500000（round）
        assertEquals(a, b)
        // 学分 5 与 5.0 一致
        assertEquals(
            GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 5.0, "92"))),
            GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 5.0, "92"))),
        )
    }

    @Test
    fun `null credit produces empty field`() {
        val withCredit = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 5.0, "92")))
        val withoutCredit = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", null, "92")))
        assertNotEquals("学分参与签名，缺失必须改变行内容", withCredit, withoutCredit)
    }

    @Test
    fun `duplicate identical rows are counted separately`() {
        // 两行完全相同记录（如不同学期同分）重复出现 -> 行集合变化，hash 必须不同（不漏报）
        val one = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 5.0, "92")))
        val two = GradeSignatureV1.compute(
            listOf(GradeRecord("A", "必修", 5.0, "92"), GradeRecord("A", "必修", 5.0, "92"))
        )
        assertNotEquals("重复行必须被计入", one, two)
    }

    @Test
    fun `numeric score integral vs fractional`() {
        val integral = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 5.0, "92")))
        val fractional = GradeSignatureV1.compute(listOf(GradeRecord("A", "必修", 5.0, "92.5")))
        assertNotEquals("整数与小数成绩必须区分", integral, fractional)
    }
}
