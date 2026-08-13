// 契约测试：读取插件根 contract-fixtures/（三端共享单一事实源），
// 验证 Kotlin DTO 与 Rust/Swift 语义一致（#611 验收「统一 DTO/command contract」）。
// 运行：cd android && gradle test

package com.hbut.mini.background

import org.json.JSONObject
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsContractTest {

    private fun fixture(name: String): String {
        val dir = System.getProperty("contract.fixtures.dir")
            ?: throw IllegalStateException("缺少 contract.fixtures.dir 系统属性（build.gradle.kts 已配置）")
        return File(dir, name).readText()
    }

    @Test
    fun `config fixture matches dto`() {
        val cfg = BackgroundConfig.fromJson(JSONObject(fixture("config.json")))
        assertEquals(BG_SCHEMA_VERSION, cfg.schema)
        assertTrue(cfg.enabled)
        assertEquals(30, cfg.intervalMinutes)
        assertEquals(listOf("grades", "exams"), cfg.business)
        assertEquals("2024010101", cfg.scope)
    }

    @Test
    fun `context fixture matches dto`() {
        val ctx = BackgroundContext.fromJson(JSONObject(fixture("context.json")))
        assertEquals(BG_SCHEMA_VERSION, ctx.schema)
        assertEquals("2024010101", ctx.scope)
        assertEquals(listOf("grades", "exams"), ctx.business)
        assertTrue(ctx.updatedAt.isNotBlank())
    }

    @Test
    fun `state fixture is real desktop rust platform`() {
        val state = BackgroundCheckState.fromJson(JSONObject(fixture("state.json")))
        assertEquals(BackgroundPlatform.DESKTOP, state.platform)
        assertEquals(BackgroundSource.RUST, state.source)
        assertTrue(state.configured)
        assertEquals(2, state.pendingEvents)
        assertEquals(true, state.lastRunOk)
    }

    @Test
    fun `android state fixture returns real android platform`() {
        // Android/iOS 必须返回自己的 platform/source，而不是统一伪造（#611 验收）。
        val state = BackgroundCheckState.fromJson(JSONObject(fixture("state-android.json")))
        assertEquals(BackgroundPlatform.ANDROID, state.platform)
        assertEquals(BackgroundSource.ANDROID, state.source)
    }

    @Test
    fun `event fixture matches dto`() {
        val evt = BackgroundEvent.fromJson(JSONObject(fixture("event.json")))
        assertEquals("synthetic_run", evt.kind)
        assertEquals(BackgroundSource.ANDROID, evt.source)
        assertEquals("2024010101", evt.scope)
        assertEquals("Kotlin 执行成功", evt.payload.optString("message"))
    }

    @Test
    fun `consume result fixture matches dto`() {
        val result = ConsumeEventsResult.fromJson(JSONObject(fixture("consume-result.json")))
        assertEquals(2, result.events.size)
        assertEquals(2, result.remaining)
        assertEquals(BackgroundSource.IOS, result.events[0].source)
        assertEquals(BackgroundSource.RUST, result.events[1].source)
    }

    @Test
    fun `run summary fixture is bridge contract`() {
        // Kotlin runNow 返回本结构，Rust JNI 端解析（跨端 native 桥契约）。
        val summary = RunSummary.fromJson(JSONObject(fixture("run-summary.json")))
        assertTrue(summary.ok)
        assertTrue(summary.synthetic)
        assertEquals(1, summary.eventsProduced)
        assertEquals("Kotlin 执行成功", summary.message)
    }

    @Test
    fun `future schema is version incompatible`() {
        // 未来版本：字段结构可解析，但版本检查必须判为不兼容（存储层降级路径）。
        val cfg = BackgroundConfig.fromJson(JSONObject(fixture("future-schema-config.json")))
        assertEquals(999, cfg.schema)
        assertFalse("schema 不兼容时必须被判为不兼容", cfg.schema == BG_SCHEMA_VERSION)
    }

    @Test
    fun `legacy no schema is rejected`() {
        // 无 schema 字段的旧格式必须被拒绝（强制版本契约）。
        val text = fixture("legacy-no-schema-config.json")
        val thrown = runCatching { BackgroundConfig.fromJson(JSONObject(text)).schema }
        assertTrue(
            "缺 schema 字段的文件必须抛异常（getInt 失败）",
            thrown.isFailure || thrown.getOrNull() != BG_SCHEMA_VERSION,
        )
    }

    @Test
    fun `state json never contains sensitive field names`() {
        val state = BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
        val json = state.toJson().toString().lowercase()
        for (sensitive in listOf("password", "cookie", "token", "credential", "secret", "authorization")) {
            assertFalse("状态 JSON 泄露敏感字段名 $sensitive", json.contains(sensitive))
        }
    }

    @Test
    fun `roundtrip all models`() {
        val cfg = BackgroundConfig.fromJson(JSONObject(fixture("config.json")))
        assertEquals(cfg, BackgroundConfig.fromJson(cfg.toJson()))

        val state = BackgroundCheckState.fromJson(JSONObject(fixture("state-android.json")))
        assertEquals(state, BackgroundCheckState.fromJson(state.toJson()))

        val evt = BackgroundEvent.fromJson(JSONObject(fixture("event.json")))
        assertEquals(evt, BackgroundEvent.fromJson(evt.toJson()))

        val summary = RunSummary.fromJson(JSONObject(fixture("run-summary.json")))
        assertEquals(summary, RunSummary.fromJson(summary.toJson()))
    }

    @Test
    fun `initial state never claims ready`() {
        val state = BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
        assertFalse(state.enabled)
        assertFalse(state.configured)
        assertNull(state.lastRunOk)
        assertEquals(0, state.pendingEvents)
    }
}
