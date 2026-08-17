package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * 电费小组件 Provider
 */
class ElectricityWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        WidgetRefreshScheduler.ensurePeriodic(context)
        appWidgetIds.forEach { id ->
            ElectricityWidgetRenderer.updateWidget(context, appWidgetManager, id)
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
            val ids = mgr.getAppWidgetIds(ComponentName(context, ElectricityWidgetProvider::class.java))
            onUpdate(context, mgr, ids)
        }
    }

    companion object {
        const val ACTION_REFRESH = "com.hbut.mini.widget.ACTION_ELECTRICITY_REFRESH"
    }
}
