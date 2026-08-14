// GradesCheckCore 单测：#612 Baseline/Diff/去重/错误映射/权限容错/账号隔离。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class GradesCheckCoreTest {

    private lateinit var tempDir: File
    private lateinit var store: BackgroundStore
    private lateinit var runtime: BackgroundRuntimeStore
    private lateinit var fetcher: FakeFetcher
    private lateinit var notifier: FakeNotifier

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "bg-core-test")
        store = BackgroundStore(tempDir)
        runtime = BackgroundRuntimeStore(tempDir)
        fetcher = FakeFetcher()
        notifier = FakeNotifier()
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    // ---- 前置状态构造 ----

    private fun enableConfig(scope: String = "s1", business: List<String> = listOf("grades")) {
        store.saveConfig(
            BackgroundConfig(BG_SCHEMA_VERSION, enabled = true, intervalMinutes = 30, business = business, scope = scope)
        )
    }

    private fun syncContext(scope: String = "s1") {
        store.saveContext(BackgroundContext(BG_SCHEMA_VERSION, scope, listOf("grades"), "1700000000Z"))
    }

    private fun gradesBody(vararg courses: Pair<String, Any>): String {
        val results = JSONArray()
        courses.forEach { (name, score) ->
            results.put(
                JSONObject()
                    .put("kcmc", name)
                    .put("xf", 5)
                    .put("zhcj", score)
            )
        }
        return JSONObject().put("ret", 0).put("msg", "ok").put("results", results).toString()
    }

    private fun respond(body: String) {
        fetcher.result = GradesFetchResult.Response(
            HttpResponse("https://jwxt.hbut.edu.cn${GradesParser.GRADES_PATH}", 200, body, "application/json")
        )
    }

    // ---- 功能开关 / context ----

    @Test
    fun `disabled config returns noop without touching fetcher`() {
        store.saveConfig(
            BackgroundConfig(BG_SCHEMA_VERSION, enabled = false, intervalMinutes = 30, business = listOf("grades"), scope = "s1")
        )
        syncContext()
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("功能关闭必须 no-op", outcome is GradesCheckOutcome.NoOp)
        assertFalse("禁用时不得联网", fetcher.called)
    }

    @Test
    fun `business without grades returns noop`() {
        enableConfig(business = listOf("exams"))
        syncContext()
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue(outcome is GradesCheckOutcome.NoOp)
        assertFalse(fetcher.called)
    }

    @Test
    fun `missing context returns noop safely`() {
        enableConfig()
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("context 缺失必须安全停止", outcome is GradesCheckOutcome.NoOp)
        assertFalse(fetcher.called)
    }

    // ---- Baseline / Diff ----

    @Test
    fun `first success establishes baseline without notification`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92, "体育" to "优秀"))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("首次成功必须 baselined", outcome is GradesCheckOutcome.Baselined)
        assertEquals("首次不发送通知", 0, notifier.calls)
        assertTrue("首次不产生事件", store.loadEvents().isEmpty())
        val state = runtime.load()
        assertEquals("baseline 必须落盘", "s1", state.scope)
        assertEquals("baseline 必须落盘", signatureOf("高等数学A" to 92, "体育" to "优秀"), state.baselineSignature)
        assertEquals(RuntimeResult.BASELINED, state.lastResult)
    }

    @Test
    fun `identical data does not notify`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        respond(gradesBody("高等数学A" to 92))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("相同数据必须 unchanged", outcome is GradesCheckOutcome.Unchanged)
        assertEquals(0, notifier.calls)
        assertTrue(store.loadEvents().isEmpty())
        assertEquals(RuntimeResult.UNCHANGED, runtime.load().lastResult)
    }

    @Test
    fun `changed data produces one event and one notification`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)

        respond(gradesBody("高等数学A" to 95))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue(outcome is GradesCheckOutcome.Changed)
        assertEquals("变化必须通知一次", 1, notifier.calls)
        val events = store.loadEvents()
        assertEquals("变化必须写一条 grades_changed 事件", 1, events.size)
        val evt = events[0]
        assertEquals("grades_changed", evt.kind)
        assertEquals("s1", evt.scope)
        assertEquals(BackgroundSource.ANDROID, evt.source)
        val payload = evt.payload
        assertEquals("grades-changed", payload.getString("type"))
        assertEquals("android-workmanager", payload.getString("source"))
        assertEquals("grades", payload.getString("targetView"))
        assertTrue(payload.getBoolean("presented"))
        assertEquals(signatureOf("高等数学A" to 95), payload.getString("signature"))
        // baseline 更新为最新
        assertEquals(signatureOf("高等数学A" to 95), runtime.load().baselineSignature)
    }

    @Test
    fun `same changed signature from retry does not notify twice`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)

        respond(gradesBody("高等数学A" to 95))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertEquals(1, notifier.calls)

        // Worker retry/重复调度再次携带同一变化数据：baseline 已更新 -> Unchanged，不重复通知
        respond(gradesBody("高等数学A" to 95))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue(
            "同一变化重复执行必须不重复通知（Unchanged 或 Deduplicated）: $outcome",
            outcome is GradesCheckOutcome.Unchanged || outcome is GradesCheckOutcome.Deduplicated,
        )
        assertEquals("不得重复通知", 1, notifier.calls)
        assertEquals("事件不重复", 1, store.loadEvents().size)
    }

    @Test
    fun `concurrent runCheck does not double notify the same change`() {
        // 周期 work 与 runNow（不同 work 名）可能并发执行同一变化：
        // 锁内串行化保证只有一个执行者通知并更新 baseline，另一个命中 Unchanged。
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)

        respond(gradesBody("高等数学A" to 95))
        val threads = (0 until 4).map {
            Thread {
                GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
            }.apply { start() }
        }
        threads.forEach { it.join() }

        assertEquals("并发执行同一变化必须只通知一次", 1, notifier.calls)
        assertEquals("并发执行只产生一条事件", 1, store.loadEvents().size)
        assertEquals(signatureOf("高等数学A" to 95), runtime.load().baselineSignature)
    }

    @Test
    fun `subsequent new change notifies again`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        respond(gradesBody("高等数学A" to 95))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        respond(gradesBody("高等数学A" to 95, "程序设计" to 88))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("新变化必须再次通知", outcome is GradesCheckOutcome.Changed)
        assertEquals(2, notifier.calls)
        assertEquals(2, store.loadEvents().size)
    }

    // ---- 错误映射 ----

    @Test
    fun `network failure maps to network error without touching baseline`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)

        fetcher.result = GradesFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "网络不可用")
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("无网必须映射 network-error", outcome is GradesCheckOutcome.NetworkError)
        assertEquals(RuntimeResult.NETWORK_ERROR, runtime.load().lastResult)
        assertEquals("网络失败不得改动 baseline", signatureOf("高等数学A" to 92), runtime.load().baselineSignature)
    }

    @Test
    fun `auth expired maps to auth-expired without retry or baseline change`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)

        fetcher.result = GradesFetchResult.Failure(GradesErrorKind.AUTH_EXPIRED, "会话已过期")
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("会话过期必须映射 auth-expired", outcome is GradesCheckOutcome.AuthExpired)
        assertEquals(RuntimeResult.AUTH_EXPIRED, runtime.load().lastResult)
        assertEquals("会话过期不得改动 baseline", signatureOf("高等数学A" to 92), runtime.load().baselineSignature)
        assertEquals("会话过期不产生事件", 0, store.loadEvents().size)
    }

    @Test
    fun `parse failure maps to parse error without baseline change`() {
        enableConfig()
        syncContext()
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)

        respond("<html>502</html>")
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("解析失败必须映射 parse-error", outcome is GradesCheckOutcome.ParseError)
        assertEquals(RuntimeResult.PARSE_ERROR, runtime.load().lastResult)
        assertEquals("解析失败不得改动 baseline", signatureOf("高等数学A" to 92), runtime.load().baselineSignature)
        assertEquals(0, notifier.calls)
    }

    // ---- 通知权限关闭 ----

    @Test
    fun `notification permission denied does not fail the check`() {
        enableConfig()
        syncContext()
        notifier.shown = false // 模拟通知权限关闭
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        respond(gradesBody("高等数学A" to 95))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("权限关闭不能使检查失败", outcome is GradesCheckOutcome.Changed)
        val changed = outcome as GradesCheckOutcome.Changed
        assertFalse("权限关闭时 presented 必须为 false", changed.notificationShown)
        // 事件仍写入，presented=false（可观测，不误判为网络失败）
        val evt = store.loadEvents()[0]
        assertFalse(evt.payload.getBoolean("presented"))
        assertEquals("检查结果仍是 changed 而非网络失败", RuntimeResult.CHANGED, runtime.load().lastResult)
    }

    @Test
    fun `notifier throwing must not crash the check`() {
        enableConfig()
        syncContext()
        notifier.throwOnNotify = true
        respond(gradesBody("高等数学A" to 92))
        GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        respond(gradesBody("高等数学A" to 95))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("通知异常不能使 Worker 崩溃或检查失败", outcome is GradesCheckOutcome.Changed)
        assertEquals("事件仍写入且 presented=false", 1, store.loadEvents().size)
    }

    // ---- 账号隔离 ----

    @Test
    fun `stale runtime scope from another account is reset`() {
        enableConfig(scope = "s2")
        syncContext("s2")
        // 旧账号 s1 的 runtime 残留（模拟 clearContext 前崩溃等极端情况）
        runtime.save(
            BackgroundRuntimeState(
                BG_SCHEMA_VERSION, "s1", "old-baseline", "1700000000Z",
                null, null, null, null, null,
            )
        )
        respond(gradesBody("高等数学A" to 92))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier)
        assertTrue("旧账号 baseline 必须被重置为首次执行", outcome is GradesCheckOutcome.Baselined)
        assertEquals("新账号 baseline 独立", "s2", runtime.load().scope)
        assertEquals("不得沿用旧账号 baseline", signatureOf("高等数学A" to 92), runtime.load().baselineSignature)
        assertEquals("旧账号残留不得触发误报通知", 0, notifier.calls)
    }

    @Test
    fun `runNow explicit scope override is honored`() {
        enableConfig(scope = "s1")
        syncContext("s1")
        runtime.save(BackgroundRuntimeState(BG_SCHEMA_VERSION, "s1", "x", null, null, null, null, null, null))
        respond(gradesBody("高等数学A" to 92))
        val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier, scopeOverride = "s1")
        // baseline 已存在(不同 signature) -> 变化 -> Changed（runNow 场景）
        assertTrue(outcome is GradesCheckOutcome.Changed)
        assertEquals("s1", runtime.load().scope)
    }

    // ---- 辅助 ----

    private fun signatureOf(vararg courses: Pair<String, Any>): String {
        val records = courses.map { (name, score) ->
            GradeRecord(courseName = name, courseType = null, credit = 5.0, score = score.toString())
        }
        return GradeSignatureV1.compute(records)
    }

    private class FakeFetcher : GradesDataFetcher {
        var result: GradesFetchResult = GradesFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "未配置")
        var called = false
        override fun fetch(scope: String): GradesFetchResult {
            called = true
            return result
        }
    }

    private class FakeNotifier : GradesNotifier {
        var calls = 0
        var shown = true
        var throwOnNotify = false
        override fun notifyGradeChanged(scope: String, signature: String): Boolean {
            calls++
            if (throwOnNotify) throw RuntimeException("通知系统异常")
            return shown
        }
    }
}
