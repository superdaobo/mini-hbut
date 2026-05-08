package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Widget 周期刷新调度器 — 封装 WorkManager 周期任务的注册与取消。
 *
 * - ensurePeriodic：注册 15 分钟周期刷新（KEEP 策略，不重复入队）
 * - cancelPeriodic：取消周期任务
 * - triggerImmediate：立即刷新所有 widget 实例
 * - hasPinnedInstance：检查是否存在已添加的 widget 实例
 */
object WidgetRefreshScheduler {
    private const val WORK_NAME = "mini_hbut_widget_today_refresh"

    /**
     * 注册 WorkManager 周期刷新任务（15 分钟间隔，KEEP 策略）。
     * 在第一个 widget 实例被添加时调用。
     */
    fun ensurePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                    .setRequiresBatteryNotLow(false)
                    .build()
            )
            .addTag("widget-today")
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req
        )
    }

    /**
     * 取消周期刷新任务。
     * 在最后一个 widget 实例被移除时调用。
     */
    fun cancelPeriodic(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
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

    /**
     * 检查是否存在已添加的 widget 实例。
     */
    fun hasPinnedInstance(context: Context): Boolean {
        val mgr = AppWidgetManager.getInstance(context)
        return mgr.getAppWidgetIds(ComponentName(context, TodayCoursesProvider::class.java)).isNotEmpty()
    }
}
