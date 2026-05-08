package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * WorkManager Worker — 周期刷新 widget 列表数据。
 *
 * 仅调用 notifyAppWidgetViewDataChanged 触发 RemoteViewsFactory.onDataSetChanged，
 * 不执行任何网络请求（满足 R9.4）。
 */
class WidgetRefreshWorker(
    appContext: Context,
    params: WorkerParameters
) : Worker(appContext, params) {

    override fun doWork(): ListenableWorker.Result {
        val ctx = applicationContext
        val mgr = AppWidgetManager.getInstance(ctx)
        val ids = mgr.getAppWidgetIds(ComponentName(ctx, TodayCoursesProvider::class.java))
        if (ids.isNotEmpty()) {
            mgr.notifyAppWidgetViewDataChanged(
                ids,
                ctx.resources.getIdentifier("widget_list", "id", ctx.packageName)
            )
        }
        return ListenableWorker.Result.success()
    }
}
