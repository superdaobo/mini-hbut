package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

/**
 * Widget 渲染器 — 构建 RemoteViews 并推送到 AppWidgetManager。
 */
object WidgetRenderer {

    fun updateWidgets(context: Context, appWidgetManager: AppWidgetManager, ids: IntArray) {
        ids.forEach { id -> updateWidget(context, appWidgetManager, id) }
    }

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val packageName = context.packageName
        val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
        val layoutName = WidgetLayoutHelper.resolveLayoutName(options)
        val layoutId = context.resources.getIdentifier(layoutName, "layout", packageName)
        if (layoutId == 0) return

        val views = RemoteViews(packageName, layoutId)
        val store = WidgetDataStore(context)
        val snapshotJson = store.readSnapshot()
        val themeColor = parseColor(store.readThemeColor())
        // #758：应用强制 light/dark 时覆盖背景与中性文字色；system 模式零干预
        val themeMode = WidgetThemeMode.resolve(context)
        val snapshot = parseSnapshot(snapshotJson)
        val date = snapshot?.optString("date", "") ?: ""
        val weekIndex = snapshot?.optInt("week_index", 0) ?: 0
        val studentId = snapshot?.optString("student_id", "") ?: ""
        val courses = snapshot?.optJSONArray("courses")
        val courseCount = courses?.length() ?: 0
        val emptyMessage = WidgetLayoutHelper.emptyStateMessage(context, snapshot)
        // #759：快照 date 早于今天 = 跨天重写失败（WebView 冻结/进程被杀后前端定时器失效）。
        // 兜底策略：标题日期显示今天 + 溢出位显示「数据更新于 X月X日」陈旧标记，
        // 深链同样携带今天，避免点击后前端高亮到昨天。快照内容仍由前端主修路径重写。
        val snapshotDate = try { java.time.LocalDate.parse(date) } catch (_: Exception) { null }
        val today = java.time.LocalDate.now()
        val outdated = snapshotDate != null && snapshotDate.isBefore(today)
        val stale = (snapshot != null && WidgetLayoutHelper.isStale(snapshot)) || outdated

        val titleId = context.resources.getIdentifier("widget_title", "id", packageName)
        val overflowId = context.resources.getIdentifier("widget_overflow_tag", "id", packageName)
        val emptyId = context.resources.getIdentifier("widget_empty", "id", packageName)
        val listId = context.resources.getIdentifier("widget_list", "id", packageName)

        if (titleId != 0) {
            val titleText = when {
                weekIndex > 0 && date.isNotEmpty() -> {
                    // #759：快照过期时标题日期显示今天（列表内容仍为旧快照，由陈旧标记提示）
                    val displayDate = formatDateChinese(if (outdated) today.toString() else date)
                    "今日课程 · $displayDate"
                }
                emptyMessage.isNotEmpty() -> emptyMessage
                else -> "今日课程"
            }
            views.setTextViewText(titleId, titleText)
        }

        if (overflowId != 0) {
            val capacity = WidgetLayoutHelper.listCapacity(layoutName)
            if (courseCount > capacity) {
                views.setTextViewText(overflowId, "+${courseCount - capacity} 节")
                views.setTextColor(overflowId, themeColor)
                views.setViewVisibility(overflowId, View.VISIBLE)
            } else if (stale) {
                // #759：跨天旧快照显示「数据更新于 X月X日」，其余陈旧沿用通用提示
                val staleText = if (outdated && date.isNotEmpty()) {
                    WidgetLayoutHelper.outdatedHint(context, date)
                } else {
                    WidgetLayoutHelper.staleHint(context)
                }
                views.setTextViewText(overflowId, staleText)
                views.setTextColor(overflowId, themeColor)
                views.setViewVisibility(overflowId, View.VISIBLE)
            } else {
                views.setViewVisibility(overflowId, View.GONE)
            }
        }

        val deepLinkDate = when {
            outdated -> today.toString()
            date.isNotEmpty() -> date
            else -> java.time.LocalDate.now().toString()
        }
        val rootPendingIntent = WidgetDeepLink.pendingIntent(
            context,
            appWidgetId,
            WidgetDeepLink.scheduleUri(deepLinkDate)
        )

        val rootId = context.resources.getIdentifier("widget_root", "id", packageName)
        if (rootId != 0) {
            views.setOnClickPendingIntent(rootId, rootPendingIntent)
        }
        // #758：强制模式下覆盖背景（system 模式保持布局默认的 @drawable/widget_background）
        WidgetThemeMode.applyBackground(context, themeMode, views, rootId)
        // #758：强制模式下覆盖标题/空态文案的中性色
        WidgetThemeMode.bindTextColor(context, themeMode, views, titleId, "widget_text_primary")
        WidgetThemeMode.bindTextColor(context, themeMode, views, emptyId, "widget_text_secondary")

        if (WidgetLayoutHelper.isCompactLayout(layoutName)) {
            bindCompactCourse(context, views, courses, themeColor, themeMode)
            if (listId != 0) views.setViewVisibility(listId, View.GONE)
            if (emptyId != 0) views.setViewVisibility(emptyId, View.GONE)
        } else {
            bindListCourse(context, views, appWidgetId, appWidgetManager, listId, emptyId, courseCount, emptyMessage, rootPendingIntent)
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
        if (listId != 0 && courseCount > 0 && !WidgetLayoutHelper.isCompactLayout(layoutName)) {
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, listId)
        }
    }

    private fun bindCompactCourse(
        context: Context,
        views: RemoteViews,
        courses: JSONArray?,
        themeColor: Int,
        themeMode: String
    ) {
        val packageName = context.packageName
        val nameId = context.resources.getIdentifier("widget_next_course_name", "id", packageName)
        val timeId = context.resources.getIdentifier("widget_next_course_time", "id", packageName)
        val locationId = context.resources.getIdentifier("widget_next_course_location", "id", packageName)

        if (courses == null || courses.length() == 0) {
            if (nameId != 0) views.setTextViewText(nameId, "")
            if (timeId != 0) views.setTextViewText(timeId, "")
            if (locationId != 0) views.setViewVisibility(locationId, View.GONE)
            return
        }

        val next = courses.getJSONObject(0)
        val periodStart = next.optInt("period_start", 0)
        val periodEnd = next.optInt("period_end", periodStart)
        val periodText = if (periodStart == periodEnd) "${periodStart}节" else "${periodStart}-${periodEnd}节"
        val timeStart = next.optString("time_start", "")
        val timeEnd = next.optString("time_end", "")
        val name = next.optString("name", "")
        val location = next.optString("location", "")

        if (nameId != 0) views.setTextViewText(nameId, name)
        if (timeId != 0) {
            views.setTextViewText(timeId, "$periodText $timeStart-$timeEnd")
            views.setTextColor(timeId, themeColor)
        }
        if (locationId != 0) {
            if (location.isNotEmpty()) {
                views.setTextViewText(locationId, location)
                views.setViewVisibility(locationId, View.VISIBLE)
            } else {
                views.setViewVisibility(locationId, View.GONE)
            }
        }
        // #758：强制模式下覆盖中性文字色（时间行沿用品牌主题色）
        WidgetThemeMode.bindTextColor(context, themeMode, views, nameId, "widget_text_primary")
        WidgetThemeMode.bindTextColor(context, themeMode, views, locationId, "widget_location_text")
    }

    private fun bindListCourse(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int,
        appWidgetManager: AppWidgetManager,
        listId: Int,
        emptyId: Int,
        courseCount: Int,
        emptyMessage: String,
        rootPendingIntent: android.app.PendingIntent
    ) {
        if (listId == 0) return

        if (courseCount > 0) {
            val serviceIntent = Intent(context, TodayCoursesRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(listId, serviceIntent)
            views.setPendingIntentTemplate(listId, rootPendingIntent)
            views.setViewVisibility(listId, View.VISIBLE)
            if (emptyId != 0) views.setViewVisibility(emptyId, View.GONE)
        } else {
            views.setViewVisibility(listId, View.GONE)
            if (emptyId != 0) {
                views.setTextViewText(emptyId, emptyMessage.ifEmpty { "今日无课" })
                views.setViewVisibility(emptyId, View.VISIBLE)
            }
        }
    }

    private fun parseSnapshot(json: String?): JSONObject? {
        if (json.isNullOrBlank()) return null
        return try {
            JSONObject(json)
        } catch (_: Exception) {
            null
        }
    }

    private fun formatDateChinese(date: String): String {
        return try {
            val parts = date.split("-")
            if (parts.size == 3) {
                val month = parts[1].trimStart('0')
                val day = parts[2].trimStart('0')
                "${month}月${day}日"
            } else {
                date
            }
        } catch (_: Exception) {
            date
        }
    }

    private fun parseColor(hex: String): Int {
        return try {
            android.graphics.Color.parseColor(hex)
        } catch (_: Exception) {
            android.graphics.Color.parseColor("#2563eb")
        }
    }
}
