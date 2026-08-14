// BackgroundRuntimeStore 单测：baseline/runtime 状态持久化、损坏降级、scope 隔离。

package com.hbut.mini.background

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class BackgroundRuntimeStoreTest {

    private lateinit var tempDir: File
    private lateinit var runtime: BackgroundRuntimeStore

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "bg-runtime-test")
        runtime = BackgroundRuntimeStore(tempDir)
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    @Test
    fun `empty state by default`() {
        val state = runtime.load()
        assertNull(state.baselineSignature)
        assertNull(state.scope)
        assertNull(state.lastResult)
    }

    @Test
    fun `roundtrip persists baseline and diagnostics`() {
        runtime.save(
            BackgroundRuntimeState(
                schema = BG_SCHEMA_VERSION,
                scope = "s1",
                baselineSignature = "abc123",
                baselineAt = "1700000000Z",
                lastSuccessAt = "1700000001Z",
                lastResult = RuntimeResult.CHANGED,
                lastError = null,
                lastChangedSignature = "abc123",
                lastChangedAt = "1700000001Z",
            )
        )
        val loaded = runtime.load()
        assertEquals("s1", loaded.scope)
        assertEquals("abc123", loaded.baselineSignature)
        assertEquals(RuntimeResult.CHANGED, loaded.lastResult)
        assertEquals("abc123", loaded.lastChangedSignature)
    }

    @Test
    fun `corrupted file degrades to empty and is backed up`() {
        File(tempDir, BackgroundRuntimeStore.RUNTIME_STATE_FILE).writeText("{broken!!")
        val state = runtime.load()
        assertNull("损坏文件必须降级为空状态", state.baselineSignature)
        val backups = tempDir.listFiles()?.map { it.name }?.filter { it.contains(".corrupt-") } ?: emptyList()
        assertEquals("损坏文件应被备份", 1, backups.size)
    }

    @Test
    fun `incompatible schema degrades to empty`() {
        File(tempDir, BackgroundRuntimeStore.RUNTIME_STATE_FILE).writeText(
            """{"schema":999,"scope":"s1","baselineSignature":"x"}"""
        )
        assertNull("schema 不兼容必须降级", runtime.load().baselineSignature)
    }

    @Test
    fun `clearScope removes matching scope only`() {
        runtime.save(BackgroundRuntimeState(BG_SCHEMA_VERSION, "s1", "sig", null, null, null, null, null, null))
        assertTrue("匹配 scope 必须被清理", runtime.clearScope("s1"))
        assertNull(runtime.load().baselineSignature)
    }

    @Test
    fun `clearScope noop for non matching scope`() {
        runtime.save(BackgroundRuntimeState(BG_SCHEMA_VERSION, "s1", "sig", null, null, null, null, null, null))
        assertFalse("不匹配 scope 必须 no-op", runtime.clearScope("other"))
        assertEquals("s1", runtime.load().scope)
    }

    @Test
    fun `atomic write leaves no tmp files`() {
        runtime.save(BackgroundRuntimeState(BG_SCHEMA_VERSION, "s1", "sig", null, null, null, null, null, null))
        val leftovers = tempDir.listFiles()?.map { it.name }?.filter { it.contains(".tmp-") } ?: emptyList()
        assertTrue("原子写残留临时文件: $leftovers", leftovers.isEmpty())
    }
}
