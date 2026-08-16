// GradesCheckScheduler —— WorkManager 调度封装（#612）。
//
// Unique periodic work（#612 调度验收）：
// - 唯一 work 名 GradesCheckPolicy.UNIQUE_WORK_NAME（com.hbut.mini.background-notify）；
// - enable/interval 变更一律 enqueueUniquePeriodicWork(UPDATE)（幂等：不累积多个周期 Worker）；
// - disable 走 cancelUniqueWork(同名)；
// - 网络约束（NETWORK_CONNECTED）+ 指数退避（避免紧密重试循环）；
// - 设备重启后由 WorkManager 自身持久化恢复（无需 Boot Receiver）；
// - 不默认 ForegroundService（#608 红线 5）。
//
// runNow：一次性 work 走与周期 Worker 相同的 GradesCheckWorker（同一业务核心），
// 仅用于测试/诊断，不改变「真实周期由系统调度」的产品描述。

package com.hbut.mini.background

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** WorkManager 调度器（Android 专用；决策纯函数在 GradesCheckPolicy，JVM 可测）。 */
object GradesCheckScheduler {

    /**
     * 按当前配置同步系统调度（自愈入口：Worker 执行、runNow、App 前台启动时调用）。
     * enable -> UPSERT 唯一周期 work（interval 变更即更新，不新增）；disable -> CANCEL。
     */
    fun syncFromConfig(context: Context, config: BackgroundConfig) {
        when (GradesCheckPolicy.decideAction(config.enabled)) {
            SchedulerAction.UPSERT -> upsertPeriodic(context, config)
            SchedulerAction.CANCEL -> cancelPeriodic(context)
        }
    }

    /** 注册/更新唯一周期 work（UPDATE 策略幂等：只存在一个同名 work）。 */
    fun upsertPeriodic(context: Context, config: BackgroundConfig) {
        val intervalMinutes = GradesCheckPolicy.normalizeInterval(config.intervalMinutes)
        val constraints = if (GradesCheckPolicy.requiresNetwork()) {
            Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        } else {
            Constraints.Builder().build()
        }
        val request = PeriodicWorkRequestBuilder<GradesCheckWorker>(intervalMinutes.toLong(), TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_DELAY_MS, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            GradesCheckPolicy.UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    /** 取消唯一周期 work（disable）。 */
    fun cancelPeriodic(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .cancelUniqueWork(GradesCheckPolicy.UNIQUE_WORK_NAME)
    }

    /** runNow：一次性 work（REPLACE：多次点击只保留最近一次；与周期 work 名不同互不干扰）。 */
    fun enqueueRunNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<GradesCheckWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            GradesCheckPolicy.runNowWorkName(),
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    private const val BACKOFF_DELAY_MS = 30_000L
}
