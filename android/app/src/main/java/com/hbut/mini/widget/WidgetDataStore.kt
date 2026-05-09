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
        const val DEFAULT_THEME_COLOR = "#2563eb"
    }
}
