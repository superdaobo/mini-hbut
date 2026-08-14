// GradeSignatureV1 共享 fixture 契约测试（#612 冻结方交叉验证）。
// 读取 contract-fixtures/grades-signature-v1.json（Android/iOS 单一事实源），
// 验证 Kotlin 实现与既定算法输出逐位一致；#613 iOS 引用同一文件。

package com.hbut.mini.background

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

class GradeSignatureV1FixtureTest {

    @Test
    fun `fixture cases match kotlin implementation`() {
        val fixture = loadFixture()
        val cases = fixture.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val name = c.getString("name")
            val records = c.getJSONArray("records")
            val expected = c.getString("expectedSignature")
            val actual = GradeSignatureV1.computeFromJsonArray(records)
            assertEquals("case[$name] 的 expectedSignature 与 Kotlin 实现不一致", expected, actual)
        }
    }

    @Test
    fun `array order change does not alter signature`() {
        // #612 验收：shared fixture 对数组顺序变化不误报
        val fixture = loadFixture()
        val baseline = hashOf(fixture, "first-baseline")
        assertEquals(
            "数组顺序变化必须与基线 hash 一致",
            baseline,
            hashOf(fixture, "array-order-changed"),
        )
    }

    @Test
    fun `unrelated field change does not alter signature`() {
        val fixture = loadFixture()
        val baseline = hashOf(fixture, "first-baseline")
        assertEquals(
            "无关字段变化/空白必须与基线 hash 一致",
            baseline,
            hashOf(fixture, "unrelated-field-changed"),
        )
    }

    @Test
    fun `real grade changes alter signature`() {
        // #612 验收：真实成绩变化能稳定检测（新增/改变/删除均与基线不同）
        val fixture = loadFixture()
        val baseline = hashOf(fixture, "first-baseline")
        assertNotEquals("新增课程必须改变 hash", baseline, hashOf(fixture, "new-course-added"))
        assertNotEquals("成绩改变必须改变 hash", baseline, hashOf(fixture, "score-changed"))
        assertNotEquals("删除记录必须改变 hash", baseline, hashOf(fixture, "record-removed"))
    }

    @Test
    fun `identical data keeps baseline hash`() {
        val fixture = loadFixture()
        assertEquals("完全相同数据必须保持基线 hash", hashOf(fixture, "first-baseline"), hashOf(fixture, "identical-data"))
    }

    @Test
    fun `fixture schema and version are frozen`() {
        val fixture = loadFixture()
        assertEquals(1, fixture.getInt("schema"))
        assertEquals("v1", fixture.getString("version"))
        assertEquals(7, fixture.getJSONArray("cases").length())
    }

    private fun hashOf(fixture: org.json.JSONObject, name: String): String {
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
        val file = File(FIXTURE_DIR, "grades-signature-v1.json")
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
