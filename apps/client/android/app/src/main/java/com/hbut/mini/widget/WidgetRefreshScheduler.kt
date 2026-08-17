package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Widget 刷新调度器。
 * 主 App 写入快照后立即刷新；后台使用 WorkManager 15 分钟兜底重绘，避开
 * AppWidgetProvider updatePeriodMillis 至少 30 分钟的系统限制。
 */
object WidgetRefreshScheduler {
    private const val PERIODIC_WORK_NAME = "mini_hbut_widget_periodic_refresh"
    private const val ONESHOT_WORK_NAME = "mini_hbut_widget_immediate_refresh"

    /**
     * 注册周期刷新。在第一个 widget 实例被添加、App 启动或系统重启后调用。
     */
    fun ensurePeriodic(context: Context) {
        if (!hasPinnedInstance(context)) return
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
            .build()
        val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    /**
     * 取消周期刷新。
     * 在最后一个 widget 实例被移除时调用。
     */
    fun cancelPeriodic(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(PERIODIC_WORK_NAME)
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(ONESHOT_WORK_NAME)
    }

    /**
     * 请求 WorkManager 尽快补一次刷新，防止部分桌面启动器忽略直接 updateAppWidget。
     */
    fun enqueueImmediate(context: Context) {
        if (!hasPinnedInstance(context)) return
        val request = OneTimeWorkRequestBuilder<WidgetRefreshWorker>().build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            ONESHOT_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    /**
     * 立即触发一次 widget 刷新：重新渲染 RemoteViews 并通知列表数据变更。
     */
    fun triggerImmediate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, TodayCoursesProvider::class.java))
        if (ids.isNotEmpty()) {
            WidgetRenderer.updateWidgets(context, mgr, ids)
            mgr.notifyAppWidgetViewDataChanged(
                ids,
                context.resources.getIdentifier("widget_list", "id", context.packageName)
            )
        }
    }

    fun triggerElectricityImmediate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, ElectricityWidgetProvider::class.java))
        ids.forEach { id ->
            ElectricityWidgetRenderer.updateWidget(context, mgr, id)
        }
    }

    fun triggerExamImmediate(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, ExamWidgetProvider::class.java))
        ids.forEach { id ->
            ExamWidgetRenderer.updateWidget(context, mgr, id)
        }
    }

    fun triggerAllImmediate(context: Context) {
        triggerImmediate(context)
        triggerElectricityImmediate(context)
        triggerExamImmediate(context)
    }

    /**
     * 检查是否存在已添加的 widget 实例。
     */
    fun hasPinnedInstance(context: Context): Boolean {
        val mgr = AppWidgetManager.getInstance(context)
        return mgr.getAppWidgetIds(ComponentName(context, TodayCoursesProvider::class.java)).isNotEmpty() ||
            mgr.getAppWidgetIds(ComponentName(context, ElectricityWidgetProvider::class.java)).isNotEmpty() ||
            mgr.getAppWidgetIds(ComponentName(context, ExamWidgetProvider::class.java)).isNotEmpty()
    }
}
