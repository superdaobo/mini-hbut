package com.hbut.mini.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget 渲染器 — 构建 RemoteViews 并推送到 AppWidgetManager。
 *
 * 职责：
 * - 从 WidgetDataStore 读取快照数据
 * - 更新标题栏（周次 + 脱敏学号）
 * - 设置 PendingIntent（点击跳转）
 * - 绑定 RemoteAdapter 到 ListView（课程列表）
 * - 处理无数据/未登录状态的占位显示
 */
object WidgetRenderer {

    fun updateWidgets(context: Context, appWidgetManager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> updateWidget(context, appWidgetManager, id) }
    }

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val packageName = context.packageName
        val layoutId = context.resources.getIdentifier(
            "widget_today_courses_4x2", "layout", packageName
        )
        if (layoutId == 0) return

        val views = RemoteViews(packageName, layoutId)
        val store = WidgetDataStore(context)
        val snapshotJson = store.readSnapshot()

        // ── 解析快照数据 ──
        val snapshot = parseSnapshot(snapshotJson)
        val date = snapshot?.optString("date", "") ?: ""
        val weekIndex = snapshot?.optInt("week_index", 0) ?: 0
        val studentId = snapshot?.optString("student_id", "") ?: ""
        val courses = snapshot?.optJSONArray("courses")
        val courseCount = courses?.length() ?: 0

        // ── 更新标题 ──
        val titleId = context.resources.getIdentifier("widget_title", "id", packageName)
        val overflowId = context.resources.getIdentifier("widget_overflow_tag", "id", packageName)

        if (titleId != 0) {
            val titleText = if (weekIndex > 0 && date.isNotEmpty()) {
                "今日课程 · 第${weekIndex}周"
            } else if (snapshot == null || studentId.isEmpty()) {
                "请先在 Mini-HBUT 登录"
            } else {
                "今日课程"
            }
            views.setTextViewText(titleId, titleText)
        }

        // ── 溢出角标 ──
        if (overflowId != 0) {
            val capacity = 3
            if (courseCount > capacity) {
                views.setTextViewText(overflowId, "+${courseCount - capacity} 节")
                views.setViewVisibility(overflowId, View.VISIBLE)
            } else {
                views.setViewVisibility(overflowId, View.GONE)
            }
        }

        // ── PendingIntent：点击 widget 启动 App ──
        // 直接使用 MAIN/LAUNCHER intent（最可靠的方式）
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent().apply {
                setClassName(packageName, "${packageName}.MainActivity")
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)

        val pendingIntent = PendingIntent.getActivity(
            context,
            appWidgetId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val rootId = context.resources.getIdentifier("widget_root", "id", packageName)
        if (rootId != 0) {
            views.setOnClickPendingIntent(rootId, pendingIntent)
        }

        // ── RemoteAdapter：绑定 ListView 到 RemoteViewsService ──
        val listId = context.resources.getIdentifier("widget_list", "id", packageName)
        if (listId != 0) {
            val serviceIntent = Intent(context, TodayCoursesRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(listId, serviceIntent)

            // 设置 ListView 项的点击 PendingIntent 模板
            views.setPendingIntentTemplate(listId, pendingIntent)
        }

        // ── 处理无课程状态 ──
        val listVisibility = if (courseCount > 0) View.VISIBLE else View.GONE
        if (listId != 0) {
            views.setViewVisibility(listId, listVisibility)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    /**
     * 安全解析 snapshot JSON。
     */
    private fun parseSnapshot(json: String?): JSONObject? {
        if (json.isNullOrBlank()) return null
        return try {
            JSONObject(json)
        } catch (_: Exception) {
            null
        }
    }
}
