// 持久化单测：临时目录版（不依赖 Android SDK / Robolectric）。
// 验证 #611 持久化验收：原子写、容量上限、scope 清理、损坏降级、版本边界。

package com.hbut.mini.background

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class BackgroundStoreTest {

    private lateinit var tempDir: File
    private lateinit var store: BackgroundStore

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "bg-store-test")
        store = BackgroundStore(tempDir)
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    private fun sampleEvent(id: String, scope: String): BackgroundEvent = BackgroundEvent(
        schema = BG_SCHEMA_VERSION,
        id = id,
        source = BackgroundSource.RUST,
        kind = "synthetic_run",
        scope = scope,
        occurredAt = "1700000000Z",
        payload = org.json.JSONObject(),
    )

    @Test
    fun `config roundtrip and default`() {
        assertEquals(false, store.loadConfig().enabled)
        val cfg = BackgroundConfig(
            schema = BG_SCHEMA_VERSION,
            enabled = true,
            intervalMinutes = 45,
            business = listOf("grades"),
            scope = "s1",
        )
        store.saveConfig(cfg)
        assertEquals(cfg, store.loadConfig())
    }

    @Test
    fun `state roundtrip and missing file`() {
        assertNull(store.loadState())
        val state = BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
        store.saveState(state)
        assertEquals(state, store.loadState())
    }

    @Test
    fun `atomic write leaves no tmp files`() {
        store.saveConfig(BackgroundConfig(BG_SCHEMA_VERSION, true, null, emptyList(), null))
        val leftovers = tempDir.listFiles()?.map { it.name }?.filter { it.contains(".tmp-") } ?: emptyList()
        assertTrue("原子写残留临时文件: $leftovers", leftovers.isEmpty())
    }

    @Test
    fun `corrupted file degrades safely`() {
        File(tempDir, StoreFiles.STATE).writeText("{not-json!!")
        assertNull("损坏文件必须降级为 null", store.loadState())
        val backups = tempDir.listFiles()?.map { it.name }?.filter { it.contains(".corrupt-") } ?: emptyList()
        assertEquals("损坏文件应被备份", 1, backups.size)
    }

    @Test
    fun `incompatible schema degrades safely`() {
        File(tempDir, StoreFiles.CONFIG).writeText(
            """{"schema":999,"enabled":true,"intervalMinutes":10,"business":[],"scope":"s1"}"""
        )
        assertEquals("schema 不兼容必须降级为默认", false, store.loadConfig().enabled)
        val backups = tempDir.listFiles()?.map { it.name }?.filter { it.contains(".corrupt-") } ?: emptyList()
        assertEquals("不兼容文件应被备份", 1, backups.size)
    }

    @Test
    fun `event inbox cap enforced`() {
        val events = (0 until EVENT_INBOX_CAP + 10).map { sampleEvent("evt-$it", "s1") }
        store.saveEvents(events)
        val loaded = store.loadEvents()
        assertEquals("容量上限未生效", EVENT_INBOX_CAP, loaded.size)
        assertEquals("应保留最新条目", "evt-10", loaded.first().id)
        assertEquals("evt-${EVENT_INBOX_CAP + 9}", loaded.last().id)
    }

    @Test
    fun `consume events marks consumed`() {
        (0 until 5).forEach { store.appendEvent(sampleEvent("evt-$it", "s1")) }
        val consumed = store.consumeEvents(2)
        assertEquals(2, consumed.events.size)
        assertEquals("evt-0", consumed.events[0].id)
        assertEquals(3, store.loadEvents().size)
        assertEquals("evt-2", store.loadEvents()[0].id)
        // 消费全部
        val all = store.consumeEvents(null)
        assertEquals(3, all.events.size)
        assertTrue(store.loadEvents().isEmpty())
    }

    @Test
    fun `clear scope removes matching data only`() {
        store.saveContext(BackgroundContext(BG_SCHEMA_VERSION, "s1", listOf("grades"), "1700000000Z"))
        val state = BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
            .copy(scope = "s1")
        store.saveState(state)
        store.appendEvent(sampleEvent("evt-a", "s1"))
        store.appendEvent(sampleEvent("evt-b", "s2"))

        val (cleared, removed) = store.clearScope("s1")
        assertTrue(cleared)
        assertEquals("s1 的事件应被清理", 1, removed)
        assertNull("s1 context 应被清除", store.loadContext())
        assertNull("s1 state 应被清除", store.loadState())
        val remaining = store.loadEvents()
        assertEquals(1, remaining.size)
        assertEquals("s2 事件必须保留", "evt-b", remaining[0].id)
    }

    @Test
    fun `clear scope noop when nothing matches`() {
        val (cleared, removed) = store.clearScope("nobody")
        assertFalse(cleared)
        assertEquals(0, removed)
    }
}
