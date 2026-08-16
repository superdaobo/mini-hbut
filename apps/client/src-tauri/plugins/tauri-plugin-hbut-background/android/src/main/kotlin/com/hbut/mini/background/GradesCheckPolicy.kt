// GradesCheckPolicy —— 调度策略纯函数（#612 可测部分）。
//
// WorkManager 唯一周期任务规则（#612 验收「只存在一个唯一周期 work」）：
// - 唯一 work 名恒定：com.hbut.mini.background-notify（issue 指定语义）；
// - enable/interval 变更一律走 enqueueUniquePeriodicWork(UPDATE)（幂等：存在即更新，
//   不新增第二个 work）；disable 走 cancelUniqueWork(同名)；
// - 15/30/60 分钟只是调度偏好（#608 红线 7），默认 30，允许范围 [15, 60]；
// - 网络约束：仅网络可用时执行（Worker 不做无效联网）。
// 本文件不依赖 Android API，JVM 单测直接覆盖。

package com.hbut.mini.background

/** 调度器动作（WorkManager 封装层据此执行）。 */
enum class SchedulerAction {
    /** 注册/更新唯一周期 work（enqueueUniquePeriodicWork UPDATE 策略，幂等）。 */
    UPSERT,
    /** 取消唯一周期 work。 */
    CANCEL,
}

/** 调度策略（纯函数，无状态）。 */
object GradesCheckPolicy {

    /** 唯一周期 work 名（#612 验收：稳定唯一，反复开关/改间隔不累积）。 */
    const val UNIQUE_WORK_NAME: String = "com.hbut.mini.background-notify"

    /** 一次性 runNow work 名（仅测试/诊断用，与周期 work 互不干扰）。 */
    const val RUN_NOW_WORK_NAME: String = "com.hbut.mini.background-runnow"

    /** 默认调度偏好（分钟）。 */
    const val DEFAULT_INTERVAL_MINUTES: Int = 30

    /** WorkManager 允许的最小周期（分钟）。 */
    const val MIN_INTERVAL_MINUTES: Int = 15

    /** 允许的最大偏好（分钟，issue 语义上限 60）。 */
    const val MAX_INTERVAL_MINUTES: Int = 60

    /** 归一化间隔：null 或非法值 -> 默认 30；clamp 到 [15, 60]。 */
    fun normalizeInterval(minutes: Int?): Int {
        val raw = minutes ?: return DEFAULT_INTERVAL_MINUTES
        return raw.coerceIn(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES)
    }

    /** 根据开关决定调度动作：启用 -> UPSERT（唯一名幂等），关闭 -> CANCEL。 */
    fun decideAction(enabled: Boolean): SchedulerAction =
        if (enabled) SchedulerAction.UPSERT else SchedulerAction.CANCEL

    /** 周期 work 是否要求网络约束（true：仅网络可用时执行，Worker 不做无效联网）。 */
    fun requiresNetwork(): Boolean = true

    /** runNow 一次性 work 唯一名（与周期 work 名不同，互不影响）。 */
    fun runNowWorkName(): String = RUN_NOW_WORK_NAME
}
