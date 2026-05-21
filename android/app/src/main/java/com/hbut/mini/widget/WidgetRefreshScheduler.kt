package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/**
 * Widget 刷新调度器 — 不依赖 WorkManager，仅使用系统 updatePeriodMillis 兜底。
 *
 * 主动刷新通过 triggerImmediate() 实现（主 App 写入快照后立即调用）。
 * 系统周期刷新由 appwidget-provider.xml 的 updatePeriodMillis=1800000 (30min) 保证。
 */
object WidgetRefreshScheduler {

    /**
     * 注册周期刷新（当前为空实现，依赖系统 updatePeriodMillis）。
     * 在第一个 widget 实例被添加时调用。
     */
    @Suppress("UNUSED_PARAMETER")
    fun ensurePeriodic(context: Context) {
        // 系统 updatePeriodMillis=1800000 已提供 30 分钟兜底刷新
        // WorkManager 周期任务在 Tauri 构建中不可用，此处为空实现
    }

    /**
     * 取消周期刷新（当前为空实现）。
     * 在最后一个 widget 实例被移除时调用。
     */
    @Suppress("UNUSED_PARAMETER")
    fun cancelPeriodic(context: Context) {
        // 空实现
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
