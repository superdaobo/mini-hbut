package com.hbut.mini.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Bundle
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * 小组件布局选择与空态文案（镜像 Web 层 resolveRenderKind 语义）。
 */
object WidgetLayoutHelper {
    private val staleThresholdMs = TimeUnit.HOURS.toMillis(24)

    fun resolveLayoutName(options: Bundle?): String {
        if (options == null) return "widget_today_courses_4x2"
        val minW = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
        val minH = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        val wCells = (minW + 30) / 70
        val hCells = (minH + 30) / 70
        return when {
            wCells <= 2 && hCells <= 2 -> "widget_today_courses_2x2"
            hCells <= 1 && wCells >= 3 -> "widget_today_courses_4x1"
            else -> "widget_today_courses_4x2"
        }
    }

    fun isCompactLayout(layoutName: String): Boolean {
        return layoutName == "widget_today_courses_2x2" || layoutName == "widget_today_courses_4x1"
    }

    fun listCapacity(layoutName: String): Int = when (layoutName) {
        "widget_today_courses_2x2" -> 1
        "widget_today_courses_4x1" -> 1
        else -> 3
    }

    fun emptyStateMessage(context: Context, snapshot: JSONObject?): String {
        if (snapshot == null) {
            return context.getString(
                context.resources.getIdentifier("widget_login_required", "string", context.packageName)
            )
        }
        val studentId = snapshot.optString("student_id", "")
        if (studentId.isBlank()) {
            return context.getString(
                context.resources.getIdentifier("widget_login_required", "string", context.packageName)
            )
        }
        val courses = snapshot.optJSONArray("courses")
        val count = courses?.length() ?: 0
        if (count > 0) return ""
        val weekday = snapshot.optInt("weekday", 0)
        if (weekday == 6 || weekday == 7) {
            return context.getString(
                context.resources.getIdentifier("widget_weekend", "string", context.packageName)
            )
        }
        return context.getString(
            context.resources.getIdentifier("widget_no_course", "string", context.packageName)
        )
    }

    fun isStale(snapshot: JSONObject): Boolean {
        val generatedAt = snapshot.optString("generated_at", "")
        if (generatedAt.isBlank()) return false
        val ts = try {
            java.time.Instant.parse(generatedAt).toEpochMilli()
        } catch (_: Exception) {
            return false
        }
        return System.currentTimeMillis() - ts > staleThresholdMs
    }

    fun staleHint(context: Context): String = context.getString(
        context.resources.getIdentifier("widget_stale_hint", "string", context.packageName)
    )

    /**
     * #759：跨天旧快照的陈旧标记文案 "数据更新于 X月X日"（snapshotDate 为 yyyy-MM-dd）。
     * 资源缺失或日期格式异常时回退到通用 staleHint。
     */
    fun outdatedHint(context: Context, snapshotDate: String): String {
        val id = context.resources.getIdentifier("widget_outdated_hint", "string", context.packageName)
        if (id == 0) return staleHint(context)
        val dateText = try {
            val parts = snapshotDate.split("-")
            if (parts.size == 3) "${parts[1].trimStart('0')}月${parts[2].trimStart('0')}日" else snapshotDate
        } catch (_: Exception) {
            snapshotDate
        }
        return try {
            context.getString(id, dateText)
        } catch (_: Exception) {
            staleHint(context)
        }
    }
}
