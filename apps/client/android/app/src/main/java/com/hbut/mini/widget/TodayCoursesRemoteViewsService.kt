package com.hbut.mini.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONObject

/**
 * RemoteViewsService 入口 — 为 ListView 提供 RemoteViewsFactory。
 * 在 AndroidManifest.xml 中注册，由 setRemoteAdapter 绑定。
 */
class TodayCoursesRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return TodayCoursesRemoteViewsFactory(applicationContext)
    }
}

/**
 * 列表行 Factory — 读取 WidgetDataStore 快照，解析课程列表并渲染每行 RemoteViews。
 *
 * 核心逻辑：
 * - onDataSetChanged：从 SharedPreferences 读取 snapshot JSON，解析为课程列表（镜像 pickRows 逻辑）
 * - getViewAt：为每行构建 RemoteViews，设置节次、时间、课名、教室及无障碍 contentDescription
 * - 学号脱敏：同 Web 层 maskStudentId（保留前 2 后 2，中间 **）
 * - contentDescription 格式对齐 a11yLabel："第 N 节 HH:mm 到 HH:mm 课程名 教室"
 */
class TodayCoursesRemoteViewsFactory(
    private val context: Context
) : RemoteViewsService.RemoteViewsFactory {

    /** 课程行数据模型 */
    data class CourseRow(
        val periodStart: Int,
        val periodEnd: Int,
        val timeStart: String,
        val timeEnd: String,
        val name: String,
        val location: String,
        val teacher: String
    )

    /** 当前渲染的课程列表（已按 pickRows 逻辑截断） */
    private var courses: List<CourseRow> = emptyList()

    /** 4×2 布局默认容量：最多显示 3 门课 */
    private val defaultCapacity = 3

    override fun onCreate() {
        // 初始化时不做 I/O，等 onDataSetChanged 触发
    }

    override fun onDataSetChanged() {
        // 从 SharedPreferences 读取快照 JSON
        val store = WidgetDataStore(context)
        val json = store.readSnapshot()
        courses = pickRows(parseCoursesFromSnapshot(json), defaultCapacity)
    }

    override fun onDestroy() {
        courses = emptyList()
    }

    override fun getCount(): Int = courses.size

    override fun getViewAt(position: Int): RemoteViews {
        val row = courses[position]
        val packageName = context.packageName
        val layoutId = context.resources.getIdentifier(
            "widget_item_course_row", "layout", packageName
        )
        val views = RemoteViews(packageName, layoutId)

        // 读取主题色
        val store = WidgetDataStore(context)
        val themeColor = try {
            android.graphics.Color.parseColor(store.readThemeColor())
        } catch (_: Exception) {
            android.graphics.Color.parseColor("#2563eb")
        }
        // #758：应用强制 light/dark 时覆盖中性文字色；system 模式零干预
        val themeMode = WidgetThemeMode.resolve(context)

        // 节次徽标（合并后显示范围，如 "3-4节"）
        val periodText = if (row.periodStart == row.periodEnd) {
            "${row.periodStart}节"
        } else {
            "${row.periodStart}-${row.periodEnd}节"
        }
        val periodId = context.resources.getIdentifier("widget_item_period", "id", packageName)
        views.setTextViewText(periodId, periodText)
        views.setTextColor(periodId, themeColor)

        // 时间
        val timeId = context.resources.getIdentifier("widget_item_time", "id", packageName)
        views.setTextViewText(timeId, "${row.timeStart}-${row.timeEnd}")
        // 课程名
        val nameId = context.resources.getIdentifier("widget_item_name", "id", packageName)
        views.setTextViewText(nameId, row.name)
        // 教室
        val locationId = context.resources.getIdentifier("widget_item_location", "id", packageName)
        views.setTextViewText(locationId, row.location)

        // #758：强制模式下覆盖中性文字色（节次徽标沿用品牌主题色）
        WidgetThemeMode.bindTextColor(context, themeMode, views, nameId, "widget_text_primary")
        WidgetThemeMode.bindTextColor(context, themeMode, views, timeId, "widget_text_secondary")
        WidgetThemeMode.bindTextColor(context, themeMode, views, locationId, "widget_location_text")

        // 无障碍 contentDescription — 对齐 a11yLabel 格式
        val contentDesc = "第 ${row.periodStart} 节 ${row.timeStart} 到 ${row.timeEnd} ${row.name} ${row.location}".trimEnd()
        views.setContentDescription(
            context.resources.getIdentifier("widget_item_row_root", "id", packageName),
            contentDesc
        )

        // 行点击深链：携带节次参数（#759：快照过期时深链用今天，避免前端高亮到昨天）
        val snapshotJson = store.readSnapshot()
        val snapshotDateRaw = readSnapshotDate(snapshotJson)
        val snapshotDate = if (isBeforeToday(snapshotDateRaw)) todayString() else snapshotDateRaw
        if (snapshotDate.isNotEmpty() && row.periodStart >= 1) {
            val fillInIntent = Intent().apply {
                data = WidgetDeepLink.scheduleUri(snapshotDate, row.periodStart)
            }
            views.setOnClickFillInIntent(
                context.resources.getIdentifier("widget_item_row_root", "id", packageName),
                fillInIntent
            )
        }

        // 节次 badge 背景
        val periodBgId = context.resources.getIdentifier("widget_period_badge", "drawable", packageName)
        if (periodBgId != 0) {
            views.setInt(periodId, "setBackgroundResource", periodBgId)
        }

        return views
    }

    private fun readSnapshotDate(json: String?): String {
        if (json.isNullOrBlank()) return ""
        return try {
            JSONObject(json).optString("date", "")
        } catch (_: Exception) {
            ""
        }
    }

    /**
     * #759：快照日期是否早于今天（解析失败按未过期处理，保持原行为）。
     * 用 "yyyy-MM-dd" 字典序比较（ISO 日期字符串字典序 = 时间序），
     * 避免在本类引入 java.time（API 26+，minSdk 22 无 desugaring）依赖。
     */
    private fun isBeforeToday(dateStr: String): Boolean {
        if (!Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(dateStr)) return false
        return dateStr < todayString()
    }

    /** 今天的 "yyyy-MM-dd"（SimpleDateFormat API 1+，与 isBeforeToday 同源比较基准） */
    private fun todayString(): String {
        return java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
            .format(java.util.Date())
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true

    // ─── 镜像逻辑 ─────────────────────────────────────────────────────────────

    /**
     * 镜像 Web 层 pickRows 逻辑：返回前 capacity 条课程。
     * courses 已按 time_start 升序排列（snapshot 契约保证）。
     */
    private fun pickRows(allCourses: List<CourseRow>, capacity: Int): List<CourseRow> {
        if (allCourses.isEmpty()) return emptyList()
        if (capacity >= allCourses.size) return allCourses
        return allCourses.take(capacity.coerceAtLeast(0))
    }

    /**
     * 从 snapshot JSON 解析课程列表。
     * 合并已在 TypeScript 层完成，这里直接解析即可。
     */
    private fun parseCoursesFromSnapshot(json: String?): List<CourseRow> {
        if (json.isNullOrBlank()) return emptyList()
        return try {
            val obj = JSONObject(json)
            val arr = obj.optJSONArray("courses") ?: return emptyList()
            val result = mutableListOf<CourseRow>()
            for (i in 0 until arr.length()) {
                val c = arr.getJSONObject(i)
                result.add(
                    CourseRow(
                        periodStart = c.optInt("period_start", 0),
                        periodEnd = c.optInt("period_end", 0),
                        timeStart = c.optString("time_start", ""),
                        timeEnd = c.optString("time_end", ""),
                        name = c.optString("name", ""),
                        location = c.optString("location", ""),
                        teacher = c.optString("teacher", "")
                    )
                )
            }
            result
        } catch (_: Exception) {
            emptyList()
        }
    }

    companion object {
        /**
         * 学号脱敏 — 镜像 Web 层 maskStudentId 逻辑。
         * - 空串 → 空串
         * - 长度 ≤ 4 → 全部替换为 *
         * - 长度 > 4 → 保留前 2 后 2，中间用 ** 替代
         */
        fun maskStudentId(s: String?): String {
            if (s.isNullOrEmpty()) return ""
            if (s.length <= 4) return "*".repeat(s.length)
            return s.substring(0, 2) + "**" + s.substring(s.length - 2)
        }
    }
}
