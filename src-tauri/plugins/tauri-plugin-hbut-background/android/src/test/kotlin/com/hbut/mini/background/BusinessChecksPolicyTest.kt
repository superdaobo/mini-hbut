// BusinessChecksPolicy + BudgetGate 单测：#615 调度策略与任务预算。

package com.hbut.mini.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BusinessChecksPolicyTest {

    @Test
    fun `interval normalization clamps to 15-60 with default 30`() {
        assertEquals(30, BusinessChecksPolicy.normalizeInterval(null))
        assertEquals(15, BusinessChecksPolicy.normalizeInterval(5))
        assertEquals(60, BusinessChecksPolicy.normalizeInterval(120))
        assertEquals(45, BusinessChecksPolicy.normalizeInterval(45))
    }

    @Test
    fun `decide action maps enabled to upsert`() {
        assertEquals(BusinessSchedulerAction.UPSERT, BusinessChecksPolicy.decideAction(true))
        assertEquals(BusinessSchedulerAction.CANCEL, BusinessChecksPolicy.decideAction(false))
    }

    @Test
    fun `work names are stable and distinct from grades work`() {
        // 成绩 work 名（#612）与 #615 业务 work 名必须互不干扰
        assertEquals("com.hbut.mini.background-notify", GradesCheckPolicy.UNIQUE_WORK_NAME)
        assertEquals("com.hbut.mini.background-business", BusinessChecksPolicy.UNIQUE_WORK_NAME)
        assertTrue(GradesCheckPolicy.UNIQUE_WORK_NAME != BusinessChecksPolicy.UNIQUE_WORK_NAME)
        assertTrue(GradesCheckPolicy.RUN_NOW_WORK_NAME != BusinessChecksPolicy.RUN_NOW_WORK_NAME)
    }

    @Test
    fun `feature enabled follows business whitelist`() {
        assertTrue(BusinessChecksPolicy.isFeatureEnabled(listOf("grades", "exams"), "exams"))
        assertTrue(BusinessChecksPolicy.isFeatureEnabled(listOf("school_inbox"), "school_inbox"))
        assertFalse(BusinessChecksPolicy.isFeatureEnabled(listOf("grades"), "exams"))
        assertFalse(BusinessChecksPolicy.isFeatureEnabled(emptyList(), "school_inbox"))
    }

    @Test
    fun `budget gate allows run when budget remains`() {
        val deadline = System.currentTimeMillis() + 10_000
        assertTrue(BudgetGate.canRun(deadline, minBudgetMs = 5_000))
    }

    @Test
    fun `budget gate blocks run when budget exhausted`() {
        val deadline = System.currentTimeMillis() - 1
        assertFalse(BudgetGate.canRun(deadline, minBudgetMs = 5_000))
    }
}
