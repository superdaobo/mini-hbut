// BusinessChecksPolicy —— #615 新增业务（考试变化/学校消息）调度策略纯函数。
//
// 与 #612 GradesCheckPolicy 并存：成绩周期 work（com.hbut.mini.background-notify）
// 保持不变；#615 新增独立唯一周期 work（com.hbut.mini.background-business），
// 在一个任务内按顺序执行考试/学校消息两个 check unit（每 unit 独立 lastResult，
// 失败相互隔离），避免改动成绩 Worker 的核心语义。
//
// 调度语义：
// - 唯一 work 名恒定；enable/interval 变更一律 enqueueUniquePeriodicWork(UPDATE)（幂等）；
// - 15/30/60 分钟只是调度偏好（#608 红线 7），默认 30，允许范围 [15, 60]；
// - 单次任务总预算：两个 unit 顺序执行，超过总预算时剩余 unit 安全跳过
//   （Android WorkManager 周期任务同样不应无限延长）；
// - 最小冷却：同一 unit 在冷却窗口内跳过请求（防 runNow/周期/重复调度连环请求）。
// 本文件不依赖 Android API，JVM 单测直接覆盖。

package com.hbut.mini.background

/** 调度器动作（与 GradesCheckPolicy 同语义）。 */
enum class BusinessSchedulerAction {
    /** 注册/更新唯一周期 work（UPDATE 策略幂等）。 */
    UPSERT,
    /** 取消唯一周期 work。 */
    CANCEL,
}

/** #615 业务调度策略（纯函数，无状态）。 */
object BusinessChecksPolicy {

    /** 唯一周期 work 名（与成绩 work 名不同，互不干扰）。 */
    const val UNIQUE_WORK_NAME: String = "com.hbut.mini.background-business"

    /** 一次性 runNow work 名（仅测试/诊断用）。 */
    const val RUN_NOW_WORK_NAME: String = "com.hbut.mini.background-business-runnow"

    /** 默认调度偏好（分钟）。 */
    const val DEFAULT_INTERVAL_MINUTES: Int = 30

    /** WorkManager 允许的最小周期（分钟）。 */
    const val MIN_INTERVAL_MINUTES: Int = 15

    /** 允许的最大偏好（分钟，issue 语义上限 60）。 */
    const val MAX_INTERVAL_MINUTES: Int = 60

    /** 单次任务总预算（毫秒）：超过后剩余 check unit 安全跳过，不无限延长。 */
    const val TASK_BUDGET_MS: Long = 40_000L

    /** 单 unit 最小冷却（毫秒）：5 分钟，防连环请求。 */
    const val FEATURE_COOLDOWN_MS: Long = 5 * 60 * 1000L

    /** 归一化间隔：null 或非法值 -> 默认 30；clamp 到 [15, 60]。 */
    fun normalizeInterval(minutes: Int?): Int {
        val raw = minutes ?: return DEFAULT_INTERVAL_MINUTES
        return raw.coerceIn(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES)
    }

    /** 根据开关决定调度动作：启用 -> UPSERT（唯一名幂等），关闭 -> CANCEL。 */
    fun decideAction(enabled: Boolean): BusinessSchedulerAction =
        if (enabled) BusinessSchedulerAction.UPSERT else BusinessSchedulerAction.CANCEL

    /** 周期 work 是否要求网络约束（true：仅网络可用时执行，Worker 不做无效联网）。 */
    fun requiresNetwork(): Boolean = true

    /** runNow 一次性 work 唯一名（与周期 work 名不同，互不影响）。 */
    fun runNowWorkName(): String = RUN_NOW_WORK_NAME

/** 该 feature 是否启用（config.business 白名单）。 */
fun isFeatureEnabled(business: List<String>, feature: String): Boolean =
    business.contains(feature)
}

/** 预算门控（纯函数，JVM 可测）：单次任务内按剩余预算决定是否继续执行下一个 check unit。 */
object BudgetGate {
    /** 单个 check unit 的最小预算（毫秒）：不足则跳过（安全结束，不损坏 baseline）。 */
    const val MIN_UNIT_BUDGET_MS: Long = 5_000L

    /** 是否还能执行下一个 unit：剩余预算 >= 最小预算。 */
    fun canRun(deadlineEpochMs: Long, minBudgetMs: Long = MIN_UNIT_BUDGET_MS): Boolean {
        val remaining = deadlineEpochMs - System.currentTimeMillis()
        return remaining >= minBudgetMs
    }
}
