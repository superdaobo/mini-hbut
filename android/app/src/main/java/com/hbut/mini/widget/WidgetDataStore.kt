package com.hbut.mini.widget

import android.content.Context
import android.content.SharedPreferences

/**
 * Widget 数据存储封装 — 使用 SharedPreferences 同步读写。
 *
 * Key 约定：
 * - snapshot_json: UTF-8 JSON 快照
 * - snapshot_version: 当前固定为 1
 * - last_write_ts: 最近一次写入的 System.currentTimeMillis()
 */
class WidgetDataStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("mini_hbut_widget", Context.MODE_PRIVATE)

    /**
     * 同步写入快照 JSON。
     * 使用 commit() 确保返回时磁盘已落盘。
     * @return true if commit succeeded
     */
    fun writeSnapshot(json: String): Boolean {
        return prefs.edit()
            .putString(KEY_SNAPSHOT_JSON, json)
            .putInt(KEY_SNAPSHOT_VERSION, 1)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    /**
     * 读取快照 JSON。
     * @return JSON string or null if not present
     */
    fun readSnapshot(): String? {
        return prefs.getString(KEY_SNAPSHOT_JSON, null)
    }

    /**
     * 清空所有 widget 相关数据。
     * 将 snapshot_json 置空串并更新时间戳，触发渲染层降级为 login 状态。
     */
    fun clear() {
        prefs.edit()
            .putString(KEY_SNAPSHOT_JSON, "")
            .putInt(KEY_SNAPSHOT_VERSION, 1)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    /**
     * 获取最近一次写入的时间戳。
     * @return epoch millis, or 0 if never written
     */
    fun lastWriteTs(): Long {
        return prefs.getLong(KEY_LAST_WRITE_TS, 0L)
    }

    companion object {
        private const val KEY_SNAPSHOT_JSON = "snapshot_json"
        private const val KEY_SNAPSHOT_VERSION = "snapshot_version"
        private const val KEY_LAST_WRITE_TS = "last_write_ts"
        private const val KEY_ELECTRICITY_JSON = "electricity_json"
        private const val KEY_EXAM_JSON = "exam_json"
        private const val KEY_THEME_COLOR = "theme_color"
        const val DEFAULT_THEME_COLOR = "#2563eb" // campus_blue 默认
    }

    /** 读取主题色（hex 格式如 #2563eb） */
    fun readThemeColor(): String {
        return prefs.getString(KEY_THEME_COLOR, DEFAULT_THEME_COLOR) ?: DEFAULT_THEME_COLOR
    }
    }

    /** 读取电费快照 */
    fun readElectricity(): String? = prefs.getString(KEY_ELECTRICITY_JSON, null)

    /** 写入电费快照 */
    fun writeElectricity(json: String): Boolean {
        return prefs.edit()
            .putString(KEY_ELECTRICITY_JSON, json)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    /** 读取考试快照 */
    fun readExam(): String? = prefs.getString(KEY_EXAM_JSON, null)

    /** 写入考试快照 */
    fun writeExam(json: String): Boolean {
        return prefs.edit()
            .putString(KEY_EXAM_JSON, json)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }
}
