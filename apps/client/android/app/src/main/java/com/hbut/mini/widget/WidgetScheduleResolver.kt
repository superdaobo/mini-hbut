package com.hbut.mini.widget

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.floor

/**
 * #881：让 Android Widget 在 App/WebView 被系统杀死后仍能独立跨天。
 *
 * 前端把最终有效课表预计算成 schedule_index（week/day -> courses）。
 * 原生端只负责用 Asia/Shanghai 日期语义计算“今天属于第几周/星期几”，
 * 不重复实现教务课程删除、自定义课程、单双周等业务规则。
 */
object WidgetScheduleResolver {
    private val shanghaiTimeZone: TimeZone = TimeZone.getTimeZone("Asia/Shanghai")
    private const val DAY_MS = 86_400_000L
    private const val WEEK_MS = 7L * DAY_MS

    data class DayInfo(
        val date: String,
        val midnightMs: Long,
        val isoWeekday: Int
    )

    fun resolveToday(rawJson: String?): JSONObject? {
        if (rawJson.isNullOrBlank()) return null
        val root = try {
            JSONObject(rawJson)
        } catch (_: Exception) {
            return null
        }
        return resolveForDate(root, todayDateString())
    }

    /**
     * 显式日期入口主要用于测试，也让解析逻辑完全可重复。
     * dateStr 必须是 yyyy-MM-dd，且按 Asia/Shanghai 日期解释。
     */
    fun resolveForDate(root: JSONObject, dateStr: String): JSONObject {
        val scheduleIndex = root.optJSONObject("schedule_index") ?: return root
        if (scheduleIndex.optInt("version", 0) != 1) return root

        val dayInfo = parseDayInfo(dateStr) ?: return root
        val totalWeeks = scheduleIndex.optInt("total_weeks", 25).coerceIn(1, 60)

        val startDate = parseDayInfo(scheduleIndex.optString("start_date", ""))
        val weekIndex = if (startDate != null) {
            // 有合法开学日期时它是权威边界：学期前/学期后不得回退到 base_date，
            // 否则会把第一周或最后一周课程错误地显示到假期。
            resolveWeekFromStartDate(startDate, dayInfo, totalWeeks)
        } else {
            resolveWeekFromBaseDate(
                scheduleIndex.optString("base_date", ""),
                scheduleIndex.optInt("base_week_index", 0),
                dayInfo,
                totalWeeks
            )
        }
        if (weekIndex < 1) {
            root.put("date", dayInfo.date)
            root.put("week_index", 0)
            root.put("weekday", dayInfo.isoWeekday)
            root.put("courses", JSONArray())
            return root
        }

        val courses = findCourses(
            scheduleIndex.optJSONArray("days"),
            weekIndex,
            dayInfo.isoWeekday
        )

        root.put("date", dayInfo.date)
        root.put("week_index", weekIndex)
        root.put("weekday", dayInfo.isoWeekday)
        root.put("courses", courses)
        return root
    }

    fun todayDateString(): String {
        return formatter().format(Date())
    }

    private fun resolveWeekFromStartDate(
        start: DayInfo,
        today: DayInfo,
        totalWeeks: Int
    ): Int {
        val deltaDays = floor((today.midnightMs - start.midnightMs).toDouble() / DAY_MS).toInt()
        if (deltaDays < 0) return 0
        val weekIndex = deltaDays / 7 + 1
        if (weekIndex > totalWeeks) return 0
        return weekIndex
    }

    /**
     * 无开学日期时，以“base_date 当天属于 base_week_index”为回退锚点。
     * 先把两天都对齐到各自周一，再算周差，确保周日→周一严格 +1。
     */
    private fun resolveWeekFromBaseDate(
        baseDate: String,
        baseWeekIndex: Int,
        today: DayInfo,
        totalWeeks: Int
    ): Int {
        if (baseWeekIndex !in 1..60) return 0
        val base = parseDayInfo(baseDate) ?: return 0

        val baseMondayMs = base.midnightMs - (base.isoWeekday - 1) * DAY_MS
        val todayMondayMs = today.midnightMs - (today.isoWeekday - 1) * DAY_MS
        val deltaWeeks = floor(
            (todayMondayMs - baseMondayMs).toDouble() / WEEK_MS
        ).toInt()

        return (baseWeekIndex + deltaWeeks).coerceIn(1, totalWeeks)
    }

    private fun findCourses(
        days: JSONArray?,
        weekIndex: Int,
        weekday: Int
    ): JSONArray {
        if (days == null) return JSONArray()
        for (index in 0 until days.length()) {
            val day = days.optJSONObject(index) ?: continue
            if (
                day.optInt("week_index", 0) == weekIndex &&
                day.optInt("weekday", 0) == weekday
            ) {
                return day.optJSONArray("courses") ?: JSONArray()
            }
        }
        return JSONArray()
    }

    private fun parseDayInfo(dateStr: String): DayInfo? {
        if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(dateStr)) return null
        val date = try {
            formatter().parse(dateStr)
        } catch (_: Exception) {
            null
        } ?: return null

        val calendar = Calendar.getInstance(shanghaiTimeZone, Locale.US).apply {
            time = date
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK)
        val isoWeekday = if (dayOfWeek == Calendar.SUNDAY) 7 else dayOfWeek - 1

        return DayInfo(
            date = formatter().format(calendar.time),
            midnightMs = calendar.timeInMillis,
            isoWeekday = isoWeekday
        )
    }

    private fun formatter(): SimpleDateFormat {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
            isLenient = false
            timeZone = shanghaiTimeZone
        }
    }
}
