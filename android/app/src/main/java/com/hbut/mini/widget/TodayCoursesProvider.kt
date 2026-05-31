package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * 今日课程小组件 AppWidgetProvider。
 * 全限定名：com.hbut.mini.widget.TodayCoursesProvider
 *
 * 生命周期：
 * - onUpdate：系统周期刷新或首次添加时调用
 * - onEnabled：第一个小组件实例被添加时注册 WorkManager 周期任务
 * - onDisabled：最后一个小组件实例被移除时取消周期任务
 * - onReceive：处理自定义 ACTION_REFRESH 广播
 */
class TodayCoursesProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetRefreshScheduler.ensurePeriodic(context)
        appWidgetIds.forEach { id ->
            WidgetRenderer.updateWidget(context, appWidgetManager, id)
        }
    }

    override fun onEnabled(context: Context) {
        // 第一个小组件实例被添加，注册 WorkManager 周期刷新任务
        WidgetRefreshScheduler.ensurePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        // 最后一个小组件实例被移除，取消周期任务
        if (!WidgetRefreshScheduler.hasPinnedInstance(context)) {
            WidgetRefreshScheduler.cancelPeriodic(context)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            WidgetRefreshScheduler.ensurePeriodic(context)
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, TodayCoursesProvider::class.java))
            onUpdate(context, mgr, ids)
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.hbut.mini.widget.ACTION_REFRESH"
    }
}
