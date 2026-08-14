// SchoolInboxCheckCore 单测：#615 Part B —— known-ID baseline / 新未读消息 /
// 已读去重 / provider unsupported / 失败隔离 / 账号隔离。

package com.hbut.mini.background

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class SchoolInboxCheckCoreTest {

    private lateinit var tempDir: File
    private lateinit var store: BackgroundStore
    private lateinit var runtime: BusinessRuntimeStore
    private lateinit var fetcher: FakeSchoolFetcher
    private lateinit var notifier: FakeSchoolNotifier

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "school-core-test")
        store = BackgroundStore(tempDir)
        runtime = BusinessRuntimeStore(tempDir)
        fetcher = FakeSchoolFetcher()
        notifier = FakeSchoolNotifier()
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    private fun enableConfig(scope: String = "s1", business: List<String> = listOf("school_inbox")) {
        store.saveConfig(
            BackgroundConfig(BG_SCHEMA_VERSION, enabled = true, intervalMinutes = 30, business = business, scope = scope)
        )
    }

    private fun syncContext(scope: String = "s1") {
        store.saveContext(BackgroundContext(BG_SCHEMA_VERSION, scope, listOf("school_inbox"), "1700000000Z"))
    }

    private fun runCheck0(): SchoolInboxCheckOutcome =
        SchoolInboxCheckCore.runCheck(store, runtime, fetcher, notifier, cooldownMs = 0)

    private fun item(id: String, title: String = "通知 $id", isRead: Boolean = false, provider: String = "portal"): SchoolMessageItem =
        SchoolMessageItem(id = "$provider:tzsjx:$id", title = title, isRead = isRead, provider = provider, createdAt = null)

    // ---- 功能开关 / context ----

    @Test
    fun `disabled config returns noop without touching fetcher`() {
        store.saveConfig(
            BackgroundConfig(BG_SCHEMA_VERSION, enabled = false, intervalMinutes = 30, business = listOf("school_inbox"), scope = "s1")
        )
        syncContext()
        val outcome = runCheck0()
        assertTrue("功能关闭必须 no-op", outcome is SchoolInboxCheckOutcome.NoOp)
        assertFalse("禁用时不得联网", fetcher.called)
    }

    @Test
    fun `missing context returns noop safely`() {
        enableConfig()
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.NoOp)
        assertFalse(fetcher.called)
    }

    // ---- 首次 baseline 不推历史（#23/#201 语义） ----

    @Test
    fun `first sync establishes known ids baseline without notifying history`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(
            listOf(item("1"), item("2"), item("3", isRead = true)),
            "portal",
        )
        val outcome = runCheck0()
        assertTrue("首次必须 baselined", outcome is SchoolInboxCheckOutcome.Baselined)
        assertEquals("首次不批量推历史消息", 0, notifier.calls)
        assertTrue("首次不产生事件", store.loadEvents().isEmpty())
        val state = runtime.loadFeature(BusinessFeature.SCHOOL)
        assertEquals("knownIds 必须落盘", listOf("portal:tzsjx:1", "portal:tzsjx:2", "portal:tzsjx:3"), state.knownIds)
        assertEquals(RuntimeResult.BASELINED, state.lastResult)
    }

    // ---- 新消息：只在「新到 + 未读 + 未通知过」时通知一次 ----

    @Test
    fun `new unread message notifies once with per-message event`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()

        // 新到一条未读消息
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("2"), item("1")), "portal")
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.Changed)
        assertEquals("新未读消息必须通知一次", 1, notifier.calls)
        val events = store.loadEvents()
        assertEquals("每条消息一个事件", 1, events.size)
        val evt = events[0]
        assertEquals("school_message", evt.kind)
        assertEquals("school-message", evt.payload.getString("type"))
        assertEquals("school_inbox", evt.payload.getString("targetView"))
        assertEquals("eventKey 载体 = provider+messageId", "portal:tzsjx:2", evt.payload.getString("signature"))
        assertEquals("portal", evt.payload.getJSONObject("meta").getString("provider"))
        assertEquals("meta 不存正文（title 有上限）", "通知 2", evt.payload.getJSONObject("meta").getString("title"))
    }

    @Test
    fun `new but read message is not notified`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()

        // 新到但已读：不通知（#615 验收：只有新到且未读才通知）
        fetcher.result = SchoolInboxFetchResult.Response(
            listOf(item("2", isRead = true), item("1")),
            "portal",
        )
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.NoNewMessages)
        assertEquals(0, notifier.calls)
        assertTrue("已读消息不写事件", store.loadEvents().isEmpty())
    }

    @Test
    fun `known message never re-notified after context rebuild`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()
        // 重新登录/context 重建（同 scope）：knownIds 持久化，历史消息不再推送（#201 语义）
        store.saveContext(BackgroundContext(BG_SCHEMA_VERSION, "s1", listOf("school_inbox"), "1701000000Z"))
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1"), item("2")), "portal")
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.Changed)
        assertEquals("只有真正新到的消息才通知", 1, notifier.calls)
        assertEquals("portal:tzsjx:2", store.loadEvents().last().payload.getString("signature"))
    }

    @Test
    fun `same message never notified twice`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("2")), "portal")
        runCheck0()
        // 异常路径：模拟 knownIds 部分丢失（消息 2 不在其中）但 notifiedKeys 保留 -> 兜底去重
        runtime.saveFeature(
            BusinessFeature.SCHOOL,
            runtime.loadFeature(BusinessFeature.SCHOOL).copy(knownIds = listOf("portal:tzsjx:1")),
        )
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("2"), item("1")), "portal")
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.NoNewMessages)
        assertEquals("同一消息只通知一次", 1, notifier.calls)
    }

    // ---- provider unsupported（诚实标记，不静默假成功） ----

    @Test
    fun `unsupported provider is honest and does not pollute other features`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Failure(
            SchoolInboxErrorKind.UNSUPPORTED,
            "后台无可用学校消息 provider",
        )
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.Unsupported)
        val state = runtime.loadFeature(BusinessFeature.SCHOOL)
        assertEquals(BusinessRuntimeStore.RESULT_UNSUPPORTED, state.lastResult)
        assertTrue("必须诚实标记 unsupported", state.unsupported)
        assertTrue("不写事件", store.loadEvents().isEmpty())
        assertEquals("不得误判为网络错误", 0, notifier.calls)
        // 其他 feature 不受影响（exams 状态保持空）
        assertEquals("", runtime.loadFeature(BusinessFeature.EXAMS).lastResult ?: "")
    }

    // ---- 错误映射 ----

    @Test
    fun `network failure maps to network error`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.NETWORK_ERROR, "网络请求失败")
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.NetworkError)
        assertEquals(RuntimeResult.NETWORK_ERROR, runtime.loadFeature(BusinessFeature.SCHOOL).lastResult)
    }

    @Test
    fun `auth expired maps to auth expired`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.AUTH_EXPIRED, "会话已失效")
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.AuthExpired)
        assertEquals(RuntimeResult.AUTH_EXPIRED, runtime.loadFeature(BusinessFeature.SCHOOL).lastResult)
    }

    @Test
    fun `parse error does not update known ids`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()
        fetcher.result = SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.PARSE_ERROR, "JSON 解析失败")
        val outcome = runCheck0()
        assertTrue(outcome is SchoolInboxCheckOutcome.ParseError)
        assertEquals("解析失败不得改变 knownIds", listOf("portal:tzsjx:1"), runtime.loadFeature(BusinessFeature.SCHOOL).knownIds)
    }

    // ---- 冷却 / 通知异常容错 / 账号隔离 ----

    @Test
    fun `cooldown skips request within window`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()
        fetcher.called = false
        val outcome = SchoolInboxCheckCore.runCheck(store, runtime, fetcher, notifier, cooldownMs = 5 * 60 * 1000L)
        assertTrue(outcome is SchoolInboxCheckOutcome.Cooldown)
        assertFalse("冷却内不得联网", fetcher.called)
    }

    @Test
    fun `notifier exception does not fail the check`() {
        enableConfig()
        syncContext()
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()
        notifier.throwOnNotify = true
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("2"), item("1")), "portal")
        val outcome = runCheck0()
        assertTrue("通知异常不允许使整个检查失败", outcome is SchoolInboxCheckOutcome.Changed)
        assertFalse("notificationShown 必须为 false", store.loadEvents().last().payload.getBoolean("presented"))
    }

    @Test
    fun `scope switch does not leak known ids between accounts`() {
        enableConfig(scope = "s1")
        syncContext("s1")
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        runCheck0()

        enableConfig(scope = "s2")
        syncContext("s2")
        fetcher.result = SchoolInboxFetchResult.Response(listOf(item("1")), "portal")
        val outcome = runCheck0()
        assertTrue("切换账号后重新建立 baseline（旧账号 IDs 不污染新账号）", outcome is SchoolInboxCheckOutcome.Baselined)
        assertEquals(0, notifier.calls)
    }

    // ---- 辅助 ----

    private class FakeSchoolFetcher : SchoolInboxDataFetcher {
        var result: SchoolInboxFetchResult = SchoolInboxFetchResult.Failure(SchoolInboxErrorKind.NETWORK_ERROR, "未设置")
        var called = false

        override fun fetch(scope: String): SchoolInboxFetchResult {
            called = true
            return result
        }
    }

    private class FakeSchoolNotifier : SchoolInboxNotifier {
        var calls = 0
        var throwOnNotify = false

        override fun notifyNewMessage(scope: String, item: SchoolMessageItem): Boolean {
            calls += 1
            if (throwOnNotify) throw RuntimeException("通知系统失败")
            return true
        }
    }
}
