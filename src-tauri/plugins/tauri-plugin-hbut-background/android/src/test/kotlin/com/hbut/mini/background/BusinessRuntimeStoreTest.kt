// BusinessRuntimeStore 单测：#615 扩展运行时（per-feature 隔离 / scope 清理 / 损坏降级）。

package com.hbut.mini.background

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class BusinessRuntimeStoreTest {

    private lateinit var tempDir: File
    private lateinit var runtime: BusinessRuntimeStore

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "business-runtime-test")
        runtime = BusinessRuntimeStore(tempDir)
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    @Test
    fun `missing file returns empty state`() {
        assertEquals("", runtime.loadFeature(BusinessFeature.EXAMS).lastResult ?: "")
        assertTrue(runtime.load().features.isEmpty())
    }

    @Test
    fun `features are isolated per key`() {
        runtime.saveFeature(
            BusinessFeature.EXAMS,
            BusinessFeatureState.empty().copy(scope = "s1", baselineSignature = "sig-a", lastResult = RuntimeResult.BASELINED),
        )
        runtime.saveFeature(
            BusinessFeature.SCHOOL,
            BusinessFeatureState.empty().copy(scope = "s1", knownIds = listOf("portal:tzsjx:1"), lastResult = RuntimeResult.CHANGED),
        )
        val exams = runtime.loadFeature(BusinessFeature.EXAMS)
        assertEquals("sig-a", exams.baselineSignature)
        assertEquals("exams 不得被 school 污染", emptyList<String>(), exams.knownIds)
        val school = runtime.loadFeature(BusinessFeature.SCHOOL)
        assertEquals(listOf("portal:tzsjx:1"), school.knownIds)
        assertEquals("school 不得被 exams 污染", null, school.baselineSignature)
    }

    @Test
    fun `roundtrip preserves all fields`() {
        val state = BusinessFeatureState.empty().copy(
            scope = "s1",
            baselineSignature = "abc",
            baselineAt = "1700000000Z",
            knownIds = listOf("a", "b"),
            knownIdsAt = "1700000001Z",
            provider = "portal",
            unsupported = true,
            lastAttemptAt = "1700000002Z",
            lastSuccessAt = "1700000003Z",
            lastResult = "changed",
            lastError = "err",
            lastChangedKey = "portal:tzsjx:9",
            lastChangedAt = "1700000004Z",
            notifiedKeys = listOf("portal:tzsjx:9", "portal:tzsjx:8"),
        )
        runtime.saveFeature(BusinessFeature.SCHOOL, state)
        val loaded = runtime.loadFeature(BusinessFeature.SCHOOL)
        assertEquals(state, loaded)
    }

    @Test
    fun `scope clear removes only matching scope`() {
        runtime.saveFeature(BusinessFeature.EXAMS, BusinessFeatureState.empty().copy(scope = "s1"))
        runtime.saveFeature(BusinessFeature.SCHOOL, BusinessFeatureState.empty().copy(scope = "s2"))
        assertTrue(runtime.clearScope("s1"))
        assertEquals(1, runtime.load().features.size)
        assertFalse("s2 不受影响", runtime.loadFeature(BusinessFeature.SCHOOL).scope != "s2")
        assertFalse("重复清理幂等", runtime.clearScope("s1"))
    }

    @Test
    fun `corrupt file degrades to empty state`() {
        File(tempDir, BusinessRuntimeStore.BUSINESS_RUNTIME_FILE).writeText("{not json")
        assertEquals("", runtime.loadFeature(BusinessFeature.EXAMS).lastResult ?: "")
        assertTrue(runtime.load().features.isEmpty())
    }

    @Test
    fun `incompatible schema degrades to empty state`() {
        File(tempDir, BusinessRuntimeStore.BUSINESS_RUNTIME_FILE).writeText(
            """{"schema":99,"features":{}}"""
        )
        assertTrue(runtime.load().features.isEmpty())
    }
}
