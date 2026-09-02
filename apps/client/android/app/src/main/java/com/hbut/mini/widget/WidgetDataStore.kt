package com.hbut.mini.widget

import android.content.Context
import android.content.SharedPreferences

/**
 * Widget 数据存储封装 — 使用 SharedPreferences 同步读写。
 */
class WidgetDataStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("mini_hbut_widget", Context.MODE_PRIVATE)

    fun writeSnapshot(json: String): Boolean {
        return prefs.edit()
            .putString(KEY_SNAPSHOT_JSON, json)
            .putInt(KEY_SNAPSHOT_VERSION, 1)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    fun readSnapshot(): String? {
        return prefs.getString(KEY_SNAPSHOT_JSON, null)
    }

    fun clear() {
        prefs.edit()
            .putString(KEY_SNAPSHOT_JSON, "")
            .putString(KEY_ELECTRICITY_JSON, "")
            .putString(KEY_EXAM_JSON, "")
            .putInt(KEY_SNAPSHOT_VERSION, 1)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    fun lastWriteTs(): Long {
        return prefs.getLong(KEY_LAST_WRITE_TS, 0L)
    }

    fun readThemeColor(): String {
        return prefs.getString(KEY_THEME_COLOR, DEFAULT_THEME_COLOR) ?: DEFAULT_THEME_COLOR
    }

    fun writeThemeColor(color: String): Boolean {
        return prefs.edit()
            .putString(KEY_THEME_COLOR, color)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    /**
     * #758：读取应用写入的主题模式（system/light/dark，见 WidgetThemeMode）。
     * 缺省/非法值由消费端兜底为 system（保持系统资源限定符行为）。
     */
    fun readThemeMode(): String {
        return prefs.getString(KEY_THEME_MODE, THEME_MODE_SYSTEM) ?: THEME_MODE_SYSTEM
    }

    fun readElectricity(): String? = prefs.getString(KEY_ELECTRICITY_JSON, null)

    fun writeElectricity(json: String): Boolean {
        return prefs.edit()
            .putString(KEY_ELECTRICITY_JSON, json)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    fun readExam(): String? = prefs.getString(KEY_EXAM_JSON, null)

    fun writeExam(json: String): Boolean {
        return prefs.edit()
            .putString(KEY_EXAM_JSON, json)
            .putLong(KEY_LAST_WRITE_TS, System.currentTimeMillis())
            .commit()
    }

    companion object {
        private const val KEY_SNAPSHOT_JSON = "snapshot_json"
        private const val KEY_SNAPSHOT_VERSION = "snapshot_version"
        private const val KEY_LAST_WRITE_TS = "last_write_ts"
        private const val KEY_ELECTRICITY_JSON = "electricity_json"
        private const val KEY_EXAM_JSON = "exam_json"
        private const val KEY_THEME_COLOR = "theme_color"
        /** #758：应用内主题模式（system/light/dark），由前端经桥接写入 */
        private const val KEY_THEME_MODE = "theme_mode"
        const val DEFAULT_THEME_COLOR = "#2563eb"
        const val THEME_MODE_SYSTEM = "system"
    }
}
