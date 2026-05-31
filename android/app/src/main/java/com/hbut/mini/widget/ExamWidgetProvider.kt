package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * 考试安排小组件 Provider
 */
class ExamWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetRefreshScheduler.ensurePeriodic(context)
        appWidgetIds.forEach { id ->
            ExamWidgetRenderer.updateWidget(context, appWidgetManager, id)
        }
    }

    override fun onEnabled(context: Context) {
        WidgetRefreshScheduler.ensurePeriodic(context)
    }

    override fun onDisabled(context: Context) {
        if (!WidgetRefreshScheduler.hasPinnedInstance(context)) {
            WidgetRefreshScheduler.cancelPeriodic(context)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            WidgetRefreshScheduler.ensurePeriodic(context)
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, ExamWidgetProvider::class.java))
            onUpdate(context, mgr, ids)
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.hbut.mini.widget.ACTION_EXAM_REFRESH"
    }
}
