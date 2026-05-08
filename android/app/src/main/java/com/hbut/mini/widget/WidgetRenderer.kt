package com.hbut.mini.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget 渲染器 — 构建 RemoteViews 并推送到 AppWidgetManager。
 *
 * 职责：
 * - 设置 PendingIntent（点击跳转 minihbut://schedule?date=...&source=widget）
 * - 绑定 RemoteAdapter 到 ListView（课程列表）
 * - 推送 RemoteViews 到 AppWidgetManager
 */
object WidgetRenderer {

    /**
     * 批量更新所有 widget 实例。
     */
    fun updateWidgets(context: Context, appWidgetManager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> updateWidget(context, appWidgetManager, id) }
    }

    /**
     * 根据当前快照数据构建 RemoteViews 并更新指定 widget 实例。
     *
     * - 从 WidgetDataStore 读取 snapshot 获取 date 字段
     * - 构建 deep link URI: minihbut://schedule?date=YYYY-MM-DD&source=widget
     * - 创建 PendingIntent 设置到根视图（点击整个 widget 跳转）
     * - 设置 RemoteAdapter 绑定 ListView 到 TodayCoursesRemoteViewsService
     */
    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val packageName = context.packageName
        val layoutId = context.resources.getIdentifier(
            "widget_today_courses_4x2", "layout", packageName
        )
        if (layoutId == 0) return

        val views = RemoteViews(packageName, layoutId)

        // ── 1. PendingIntent：点击 widget 跳转到课表页 ──
        val store = WidgetDataStore(context)
        val snapshotJson = store.readSnapshot()
        val date = parseDateFromSnapshot(snapshotJson)

        val deepLinkUri = Uri.parse("minihbut://schedule")
            .buildUpon()
            .appendQueryParameter("date", date)
            .appendQueryParameter("source", "widget")
            .build()

        val intent = Intent(Intent.ACTION_VIEW, deepLinkUri).apply {
            setPackage(packageName) // 强制本应用处理
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            date.hashCode(), // requestCode 基于日期，确保每天更新
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val rootId = context.resources.getIdentifier("widget_root", "id", packageName)
        if (rootId != 0) {
            views.setOnClickPendingIntent(rootId, pendingIntent)
        }

        // ── 2. RemoteAdapter：绑定 ListView 到 RemoteViewsService ──
        val listId = context.resources.getIdentifier("widget_list", "id", packageName)
        if (listId != 0) {
            val serviceIntent = Intent(context, TodayCoursesRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                // 使 Intent 唯一，避免多实例共享同一 Factory
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(listId, serviceIntent)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    /**
     * 从 snapshot JSON 中安全解析 date 字段。
     * 返回 "YYYY-MM-DD" 格式字符串；解析失败时返回空串。
     */
    private fun parseDateFromSnapshot(json: String?): String {
        if (json.isNullOrBlank()) return ""
        return try {
            JSONObject(json).optString("date", "")
        } catch (_: Exception) {
            ""
        }
    }
}
