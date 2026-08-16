package com.hbut.mini.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import org.json.JSONArray

/**
 * 考试安排小组件渲染器
 */
object ExamWidgetRenderer {

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val packageName = context.packageName
        val layoutId = context.resources.getIdentifier("widget_exam", "layout", packageName)
        if (layoutId == 0) return

        val views = RemoteViews(packageName, layoutId)
        val store = WidgetDataStore(context)
        val json = store.readExam()
        val data = parseJson(json)

        val titleId = context.resources.getIdentifier("widget_exam_title", "id", packageName)
        val courseId = context.resources.getIdentifier("widget_exam_course", "id", packageName)
        val dateId = context.resources.getIdentifier("widget_exam_date", "id", packageName)
        val locationId = context.resources.getIdentifier("widget_exam_location", "id", packageName)
        val countdownId = context.resources.getIdentifier("widget_exam_countdown", "id", packageName)

        if (titleId != 0) views.setTextViewText(titleId, "即将考试")

        if (data != null) {
            val exams = data.optJSONArray("exams") ?: JSONArray()
            if (exams.length() > 0) {
                val next = exams.getJSONObject(0)
                val courseName = next.optString("course_name", "")
                val examDate = next.optString("exam_date", "")
                val examTime = next.optString("exam_time", "")
                val location = next.optString("location", "")
                val seatNo = next.optString("seat_no", "")
                val daysLeft = data.optInt("days_left", -1)

                if (courseId != 0) views.setTextViewText(courseId, courseName)
                if (dateId != 0) {
                    val timeText = extractTimeOnly(examTime)
                    views.setTextViewText(dateId, "$examDate $timeText")
                }
                if (locationId != 0) {
                    val locationText = buildString {
                        if (location.isNotEmpty()) append(location)
                        if (seatNo.isNotEmpty()) {
                            if (isNotEmpty()) append(" · ")
                            append("座位 $seatNo")
                        }
                    }
                    if (locationText.isNotEmpty()) {
                        views.setTextViewText(locationId, locationText)
                        views.setViewVisibility(locationId, View.VISIBLE)
                    }
                }
                if (countdownId != 0 && daysLeft >= 0) {
                    val countdownText = when (daysLeft) {
                        0 -> "今天考试！"
                        1 -> "明天考试"
                        else -> "${daysLeft}天后"
                    }
                    views.setTextViewText(countdownId, countdownText)
                    views.setViewVisibility(countdownId, View.VISIBLE)
                }
            } else {
                if (courseId != 0) views.setTextViewText(courseId, "暂无近期考试")
                if (dateId != 0) views.setTextViewText(dateId, "")
                if (locationId != 0) views.setViewVisibility(locationId, View.GONE)
                if (countdownId != 0) views.setViewVisibility(countdownId, View.GONE)
            }
        } else {
            if (courseId != 0) views.setTextViewText(courseId, "请先查询考试安排")
            if (dateId != 0) views.setTextViewText(dateId, "")
            if (locationId != 0) views.setViewVisibility(locationId, View.GONE)
            if (countdownId != 0) views.setViewVisibility(countdownId, View.GONE)
        }

        // 点击跳转考试安排页
        val pi = WidgetDeepLink.pendingIntent(
            context,
            appWidgetId + 2000,
            WidgetDeepLink.examUri()
        )
        val themeColor = parseColor(store.readThemeColor())
        if (countdownId != 0 && data != null) {
            views.setTextColor(countdownId, themeColor)
        }
        val rootId = context.resources.getIdentifier("widget_exam_root", "id", packageName)
        if (rootId != 0) views.setOnClickPendingIntent(rootId, pi)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun extractTimeOnly(timeStr: String): String {
        val match = Regex("(\\d{1,2}:\\d{2})\\s*[~～-]\\s*(\\d{1,2}:\\d{2})").find(timeStr)
        return match?.let { "${it.groupValues[1]}~${it.groupValues[2]}" } ?: timeStr
    }

    private fun parseJson(json: String?): JSONObject? {
        if (json.isNullOrBlank()) return null
        return try { JSONObject(json) } catch (_: Exception) { null }
    }

    private fun parseColor(hex: String): Int {
        return try {
            android.graphics.Color.parseColor(hex)
        } catch (_: Exception) {
            android.graphics.Color.parseColor("#2563eb")
        }
    }
}
