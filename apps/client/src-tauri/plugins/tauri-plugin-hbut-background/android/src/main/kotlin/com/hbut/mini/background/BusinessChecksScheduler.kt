// BusinessChecksScheduler —— #615 新增业务（考试变化/学校消息）WorkManager 调度封装。
//
// 与 #612 GradesCheckScheduler 同模式（成绩 work 保持不动）：
// - 唯一周期 work 名 BusinessChecksPolicy.UNIQUE_WORK_NAME（...-background-business）；
// - enable/interval 变更一律 enqueueUniquePeriodicWork(UPDATE)（幂等）；
// - disable 走 cancelUniqueWork(同名)；
// - 网络约束（NETWORK_CONNECTED）+ 指数退避；设备重启后 WorkManager 自身恢复。
//
// runNow：一次性 work 走与周期 Worker 相同的 BusinessChecksWorker（同一业务核心）。

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

/** #615 业务调度器（Android 专用；决策纯函数在 BusinessChecksPolicy，JVM 可测）。 */
object BusinessChecksScheduler {

    /** 按当前配置同步系统调度（自愈入口：Worker 执行、runNow、App 前台启动时调用）。 */
    fun syncFromConfig(context: Context, config: BackgroundConfig) {
        when (BusinessChecksPolicy.decideAction(config.enabled)) {
            BusinessSchedulerAction.UPSERT -> upsertPeriodic(context, config)
            BusinessSchedulerAction.CANCEL -> cancelPeriodic(context)
        }
    }

    /** 注册/更新唯一周期 work（UPDATE 策略幂等：只存在一个同名 work）。 */
    fun upsertPeriodic(context: Context, config: BackgroundConfig) {
        val intervalMinutes = BusinessChecksPolicy.normalizeInterval(config.intervalMinutes)
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request = PeriodicWorkRequestBuilder<BusinessChecksWorker>(intervalMinutes.toLong(), TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_DELAY_MS, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            BusinessChecksPolicy.UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    /** 取消唯一周期 work（disable）。 */
    fun cancelPeriodic(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .cancelUniqueWork(BusinessChecksPolicy.UNIQUE_WORK_NAME)
    }

    /** runNow：一次性 work（REPLACE：多次点击只保留最近一次）。 */
    fun enqueueRunNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<BusinessChecksWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            BusinessChecksPolicy.runNowWorkName(),
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    private const val BACKOFF_DELAY_MS = 30_000L
}
