// ExamSignatureV1 共享 fixture 契约测试（#615 冻结方交叉验证）。
// 读取 contract-fixtures/exams-signature-v1.json（Android/iOS/前端单一事实源），
// 验证 Kotlin 实现与既定算法输出逐位一致；iOS Swift 与前端引用同一文件。

package com.hbut.mini.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.io.File

class ExamSignatureV1FixtureTest {

    @Test
    fun `fixture cases match kotlin implementation`() {
        val fixture = loadFixture()
        val cases = fixture.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val name = c.getString("name")
            val records = c.getJSONArray("records")
            val expected = c.getString("expectedSignature")
            val actual = ExamSignatureV1.computeFromJsonArray(records)
            assertEquals("case[$name] 的 expectedSignature 与 Kotlin 实现不一致", expected, actual)
        }
    }

    @Test
    fun `array order change does not alter signature`() {
        // #615 验收：shared fixture 对数组顺序变化不误报
        assertEquals("数组顺序变化必须与基线 hash 一致", hashOf("first-baseline"), hashOf("array-order-changed"))
    }

    @Test
    fun `unrelated field change does not alter signature`() {
        assertEquals("无关字段变化/空白必须与基线 hash 一致", hashOf("first-baseline"), hashOf("unrelated-field-changed"))
    }

    @Test
    fun `business changes alter signature`() {
        // #615 验收：新增/删除/日期/时间/地点变化都能稳定检测
        val baseline = hashOf("first-baseline")
        assertNotEquals("新增考试必须改变 hash", baseline, hashOf("new-exam-added"))
        assertNotEquals("删除考试必须改变 hash", baseline, hashOf("exam-removed"))
        assertNotEquals("日期变化必须改变 hash", baseline, hashOf("date-changed"))
        assertNotEquals("时间变化必须改变 hash", baseline, hashOf("time-changed"))
        assertNotEquals("地点变化必须改变 hash", baseline, hashOf("location-changed"))
    }

    @Test
    fun `identical data keeps baseline hash`() {
        assertEquals("完全相同数据必须保持基线 hash", hashOf("first-baseline"), hashOf("identical-data"))
    }

    @Test
    fun `fixture schema and version are frozen`() {
        val fixture = loadFixture()
        assertEquals(1, fixture.getInt("schema"))
        assertEquals("v1", fixture.getString("version"))
        assertEquals(9, fixture.getJSONArray("cases").length())
    }

    private fun hashOf(name: String): String {
        val fixture = loadFixture()
        val cases = fixture.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            if (c.getString("name") == name) {
                return c.getString("expectedSignature")
            }
        }
        throw AssertionError("fixture 缺少 case: $name")
    }

    private fun loadFixture(): org.json.JSONObject {
        val file = File(FIXTURE_DIR, "exams-signature-v1.json")
        assertEquals("共享 fixture 必须存在: ${file.absolutePath}", true, file.exists())
        return org.json.JSONObject(file.readText())
    }

    companion object {
        /** 与 build.gradle.kts systemProperty 对齐（插件根目录/contract-fixtures）。 */
        private val FIXTURE_DIR: String = System.getProperty(
            "contract.fixtures.dir",
            // IDE 直跑（工作目录为 android/ 模块）时的回退路径
            File("../../contract-fixtures").absolutePath,
        )
    }
}
