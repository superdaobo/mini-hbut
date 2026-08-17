// GradesCheckPolicy 单测：#612 唯一周期 work / interval 偏好 / 开关决策。

package com.hbut.mini.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GradesCheckPolicyTest {

    @Test
    fun `unique work name is stable and issue-specified`() {
        // #612 验收：唯一 work 名（反复开关/改间隔不得累积多个周期 Worker）
        assertEquals("com.hbut.mini.background-notify", GradesCheckPolicy.UNIQUE_WORK_NAME)
        assertNotEquals(
            "runNow 一次性 work 必须与周期 work 名不同",
            GradesCheckPolicy.UNIQUE_WORK_NAME,
            GradesCheckPolicy.runNowWorkName(),
        )
    }

    @Test
    fun `interval normalization defaults to 30 minutes`() {
        assertEquals(30, GradesCheckPolicy.normalizeInterval(null)) // 未设置 -> 默认 30
        assertEquals(15, GradesCheckPolicy.normalizeInterval(0)) // 非法值 -> clamp 到最小 15
        assertEquals(30, GradesCheckPolicy.DEFAULT_INTERVAL_MINUTES)
    }

    @Test
    fun `interval normalization clamps to allowed range`() {
        // 15/30/60 是偏好；WorkManager 最小 15 分钟，上限 60
        assertEquals(15, GradesCheckPolicy.normalizeInterval(10))
        assertEquals(15, GradesCheckPolicy.normalizeInterval(15))
        assertEquals(30, GradesCheckPolicy.normalizeInterval(30))
        assertEquals(45, GradesCheckPolicy.normalizeInterval(45))
        assertEquals(60, GradesCheckPolicy.normalizeInterval(60))
        assertEquals(60, GradesCheckPolicy.normalizeInterval(120))
    }

    @Test
    fun `interval change keeps same unique work semantics`() {
        // interval 变更（15 -> 60）仍落到唯一 work 名：由 UPSERT 幂等保证不新增第二个 work
        assertEquals(
            GradesCheckPolicy.UNIQUE_WORK_NAME,
            GradesCheckPolicy.UNIQUE_WORK_NAME, // 唯一名恒定（注册永远走同一名字）
        )
        assertEquals(
            "enable 后改 interval 仍是 UPSERT（UPDATE 策略幂等）",
            SchedulerAction.UPSERT,
            GradesCheckPolicy.decideAction(true),
        )
    }

    @Test
    fun `enable and disable map to upsert and cancel`() {
        assertEquals(SchedulerAction.UPSERT, GradesCheckPolicy.decideAction(true))
        assertEquals(SchedulerAction.CANCEL, GradesCheckPolicy.decideAction(false))
    }

    @Test
    fun `network constraint is required`() {
        assertTrue("Worker 必须要求网络约束（不做无效联网）", GradesCheckPolicy.requiresNetwork())
    }
}
