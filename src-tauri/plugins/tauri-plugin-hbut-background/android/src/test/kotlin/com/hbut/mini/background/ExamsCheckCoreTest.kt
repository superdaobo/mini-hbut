// ExamsCheckCore 单测：#615 Baseline/Diff/去重/错误映射/冷却/权限容错/账号隔离。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

class ExamsCheckCoreTest {

    private lateinit var tempDir: File
    private lateinit var store: BackgroundStore
    private lateinit var runtime: BusinessRuntimeStore
    private lateinit var fetcher: FakeExamsFetcher
    private lateinit var notifier: FakeExamsNotifier

    @Before
    fun setUp() {
        tempDir = createTempDir(prefix = "exams-core-test")
        store = BackgroundStore(tempDir)
        runtime = BusinessRuntimeStore(tempDir)
        fetcher = FakeExamsFetcher()
        notifier = FakeExamsNotifier()
    }

    @After
    fun tearDown() {
        tempDir.deleteRecursively()
    }

    // ---- 前置状态构造 ----

    private fun enableConfig(scope: String = "s1", business: List<String> = listOf("exams")) {
        store.saveConfig(
            BackgroundConfig(BG_SCHEMA_VERSION, enabled = true, intervalMinutes = 30, business = business, scope = scope)
        )
    }

    private fun syncContext(scope: String = "s1") {
        store.saveContext(BackgroundContext(BG_SCHEMA_VERSION, scope, listOf("exams"), "1700000000Z"))
    }

    private fun examsBody(vararg exams: Pair<String, Map<String, String>>): String {
        val results = JSONArray()
        exams.forEach { (course, fields) ->
            results.put(
                JSONObject()
                    .put("kcmc", course)
                    .put("ksrq", fields["date"] ?: "")
                    .put("kssj", fields["time"] ?: "")
                    .put("jsmc", fields["location"] ?: "")
                    .put("zwh", fields["seat"] ?: "")
                    .put("kslxmc", fields["type"] ?: "")
            )
        }
        return JSONObject().put("ret", 0).put("msg", "ok").put("results", results).toString()
    }

    private val mathExam = mapOf("date" to "2026-06-22", "time" to "09:00-11:00", "location" to "教1-101", "seat" to "12", "type" to "正常考试")
    private val englishExam = mapOf("date" to "2026-06-25", "time" to "14:00-16:00", "location" to "教2-305", "seat" to "8", "type" to "正常考试")

    private fun runCheck0(): ExamsCheckOutcome =
        ExamsCheckCore.runCheck(store, runtime, fetcher, notifier, cooldownMs = 0)

    private fun respond(body: String) {
        fetcher.result = ExamsFetchResult.Response(
            HttpResponse("https://jwxt.hbut.edu.cn${ExamsParser.EXAMS_PATH}", 200, body, "application/json")
        )
    }

    // ---- 功能开关 / context ----

    @Test
    fun `disabled config returns noop without touching fetcher`() {
        store.saveConfig(
            BackgroundConfig(BG_SCHEMA_VERSION, enabled = false, intervalMinutes = 30, business = listOf("exams"), scope = "s1")
        )
        syncContext()
        val outcome = runCheck0()
        assertTrue("功能关闭必须 no-op", outcome is ExamsCheckOutcome.NoOp)
        assertFalse("禁用时不得联网", fetcher.called)
    }

    @Test
    fun `business without exams returns noop`() {
        enableConfig(business = listOf("grades"))
        syncContext()
        val outcome = runCheck0()
        assertTrue(outcome is ExamsCheckOutcome.NoOp)
        assertFalse(fetcher.called)
    }

    @Test
    fun `missing context returns noop safely`() {
        enableConfig()
        val outcome = runCheck0()
        assertTrue("context 缺失必须安全停止", outcome is ExamsCheckOutcome.NoOp)
        assertFalse(fetcher.called)
    }

    // ---- Baseline / Diff ----

    @Test
    fun `first success establishes baseline without notification`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam, "大学英语" to englishExam))
        val outcome = runCheck0()
        assertTrue("首次成功必须 baselined", outcome is ExamsCheckOutcome.Baselined)
        assertEquals("首次不发送通知", 0, notifier.calls)
        assertTrue("首次不产生事件（不推历史考试）", store.loadEvents().isEmpty())
        val state = runtime.loadFeature(BusinessFeature.EXAMS)
        assertEquals("baseline 必须落盘", "s1", state.scope)
        assertEquals("baseline 必须落盘（与 fixture 算法一致）", examsSig("高等数学A" to mathExam, "大学英语" to englishExam), state.baselineSignature)
        assertEquals(RuntimeResult.BASELINED, state.lastResult)
    }

    @Test
    fun `identical data does not notify`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()
        respond(examsBody("高等数学A" to mathExam))
        val outcome = runCheck0()
        assertTrue("相同数据必须 unchanged", outcome is ExamsCheckOutcome.Unchanged)
        assertEquals("同 signature 不重复通知", 0, notifier.calls)
        assertTrue(store.loadEvents().isEmpty())
    }

    @Test
    fun `array order change does not notify`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam, "大学英语" to englishExam))
        runCheck0()
        respond(examsBody("大学英语" to englishExam, "高等数学A" to mathExam))
        val outcome = runCheck0()
        assertTrue("数组顺序变化必须不触发", outcome is ExamsCheckOutcome.Unchanged)
        assertEquals(0, notifier.calls)
    }

    @Test
    fun `added exam produces one event and one notification`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()
        respond(examsBody("高等数学A" to mathExam, "大学英语" to englishExam))
        val outcome = runCheck0()
        assertTrue(outcome is ExamsCheckOutcome.Changed)
        assertEquals("新增考试必须通知一次", 1, notifier.calls)
        val events = store.loadEvents()
        assertEquals("必须写一条 exams_changed 事件", 1, events.size)
        val evt = events[0]
        assertEquals("exams_changed", evt.kind)
        assertEquals("s1", evt.scope)
        val payload = evt.payload
        assertEquals("exams-changed", payload.getString("type"))
        assertEquals("exams", payload.getString("targetView"))
    }

    @Test
    fun `date and location changes produce events`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()

        // 日期变化
        respond(examsBody("高等数学A" to (mathExam + ("date" to "2026-06-23"))))
        assertTrue(runCheck0() is ExamsCheckOutcome.Changed)

        // 地点变化（baseline 已更新为日期变化后的签名）
        respond(examsBody("高等数学A" to (mathExam + ("date" to "2026-06-23") + ("location" to "教5-502"))))
        assertTrue(runCheck0() is ExamsCheckOutcome.Changed)
        assertEquals("两次可感知变化各通知一次", 2, notifier.calls)
    }

    @Test
    fun `same changed signature is deduplicated`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()
        respond(examsBody("高等数学A" to (mathExam + ("time" to "14:00-16:00"))))
        val first = runCheck0()
        assertTrue(first is ExamsCheckOutcome.Changed)

        // 异常路径防御：模拟 baseline 未随通知同步更新（旧 baseline + 已通知过的 lastChangedKey）
        val newSig = examsSig("高等数学A" to (mathExam + ("time" to "14:00-16:00")))
        val oldSig = examsSig("高等数学A" to mathExam)
        runtime.saveFeature(
            BusinessFeature.EXAMS,
            runtime.loadFeature(BusinessFeature.EXAMS).copy(
                baselineSignature = oldSig,
                lastChangedKey = newSig,
            ),
        )
        respond(examsBody("高等数学A" to (mathExam + ("time" to "14:00-16:00"))))
        val second = runCheck0()
        assertTrue("同一变化不能重复通知", second is ExamsCheckOutcome.Deduplicated)
        assertEquals("同一变化只通知一次", 1, notifier.calls)
    }

    // ---- 错误映射 ----

    @Test
    fun `network failure maps to network error and does not update baseline`() {
        enableConfig()
        syncContext()
        fetcher.result = ExamsFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "网络请求失败")
        val outcome = runCheck0()
        assertTrue(outcome is ExamsCheckOutcome.NetworkError)
        assertEquals(RuntimeResult.NETWORK_ERROR, runtime.loadFeature(BusinessFeature.EXAMS).lastResult)
        assertTrue("失败不得建立 baseline", runtime.loadFeature(BusinessFeature.EXAMS).baselineSignature == null)
    }

    @Test
    fun `auth expired maps to auth expired without retry semantics`() {
        enableConfig()
        syncContext()
        fetcher.result = ExamsFetchResult.Failure(GradesErrorKind.AUTH_EXPIRED, "会话已失效")
        val outcome = runCheck0()
        assertTrue(outcome is ExamsCheckOutcome.AuthExpired)
        assertEquals(RuntimeResult.AUTH_EXPIRED, runtime.loadFeature(BusinessFeature.EXAMS).lastResult)
    }

    @Test
    fun `parse error does not update baseline`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()
        respond("{ret: 0, msg: ok}") // 缺少 results/items -> 解析失败（不更新 baseline，不误报）
        val outcome = runCheck0()
        assertTrue("缺少 results/items 必须解析失败", outcome is ExamsCheckOutcome.ParseError)
        assertEquals("解析失败不得改变 baseline", examsSig("高等数学A" to mathExam), runtime.loadFeature(BusinessFeature.EXAMS).baselineSignature)
        assertEquals(0, notifier.calls)
    }

    @Test
    fun `empty results array establishes empty baseline`() {
        enableConfig()
        syncContext()
        respond(JSONObject().put("ret", 0).put("msg", "ok").put("results", JSONArray()).toString())
        val outcome = runCheck0()
        assertTrue("空数组是合法状态：允许建立空 baseline", outcome is ExamsCheckOutcome.Baselined)
        assertEquals("", runtime.loadFeature(BusinessFeature.EXAMS).baselineSignature)
    }

    // ---- 冷却 ----

    @Test
    fun `cooldown skips request within window`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()
        fetcher.called = false
        val outcome = ExamsCheckCore.runCheck(store, runtime, fetcher, notifier, cooldownMs = 5 * 60 * 1000L)
        assertTrue("冷却窗口内必须跳过", outcome is ExamsCheckOutcome.Cooldown)
        assertFalse("冷却内不得联网", fetcher.called)
    }

    @Test
    fun `cooldown zero disables limit`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        ExamsCheckCore.runCheck(store, runtime, fetcher, notifier, cooldownMs = 0)
        fetcher.called = false
        val outcome = ExamsCheckCore.runCheck(store, runtime, fetcher, notifier, cooldownMs = 0)
        assertTrue(outcome is ExamsCheckOutcome.Unchanged)
        assertTrue("cooldownMs=0 不限制", fetcher.called)
    }

    // ---- 通知异常容错 ----

    @Test
    fun `notifier exception does not fail the check`() {
        enableConfig()
        syncContext()
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()
        notifier.throwOnNotify = true
        respond(examsBody("高等数学A" to (mathExam + ("location" to "教9-901"))))
        val outcome = runCheck0()
        assertTrue("通知异常不允许使整个检查失败", outcome is ExamsCheckOutcome.Changed)
        val evt = store.loadEvents().last()
        assertEquals("notificationShown 必须为 false", false, evt.payload.getBoolean("presented"))
    }

    // ---- 账号隔离 ----

    @Test
    fun `scope switch resets stale baseline`() {
        enableConfig(scope = "s1")
        syncContext("s1")
        respond(examsBody("高等数学A" to mathExam))
        runCheck0()

        // 切换到 s2（context 变化）；旧 baseline 不得污染新账号
        enableConfig(scope = "s2")
        syncContext("s2")
        respond(examsBody("高等数学A" to mathExam))
        val outcome = runCheck0()
        assertTrue("切换账号后应重新建立 baseline", outcome is ExamsCheckOutcome.Baselined)
        assertEquals("s2", runtime.loadFeature(BusinessFeature.EXAMS).scope)
    }

    // ---- 辅助 ----

    private fun examsSig(vararg pairs: Pair<String, Map<String, String>>): String {
        val records = pairs.map { (course, fields) ->
            ExamRecord(course, fields["date"], fields["time"], fields["location"], fields["seat"], fields["type"])
        }
        return ExamSignatureV1.compute(records)
    }

    private class FakeExamsFetcher : ExamsDataFetcher {
        var result: ExamsFetchResult = ExamsFetchResult.Failure(GradesErrorKind.NETWORK_ERROR, "未设置")
        var called = false

        override fun fetch(scope: String): ExamsFetchResult {
            called = true
            return result
        }
    }

    private class FakeExamsNotifier : ExamsNotifier {
        var calls = 0
        var throwOnNotify = false

        override fun notifyExamsChanged(scope: String, signature: String): Boolean {
            calls += 1
            if (throwOnNotify) throw RuntimeException("通知系统失败")
            return true
        }
    }
}
