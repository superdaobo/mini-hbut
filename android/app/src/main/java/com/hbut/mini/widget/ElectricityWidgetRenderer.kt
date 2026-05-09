package com.hbut.mini.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * 电费小组件渲染器
 */
object ElectricityWidgetRenderer {

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val packageName = context.packageName
        val layoutId = context.resources.getIdentifier("widget_electricity", "layout", packageName)
        if (layoutId == 0) return

        val views = RemoteViews(packageName, layoutId)
        val store = WidgetDataStore(context)
        val json = store.readElectricity()
        val data = parseJson(json)

        val titleId = context.resources.getIdentifier("widget_elec_title", "id", packageName)
        val quantityId = context.resources.getIdentifier("widget_elec_quantity", "id", packageName)
        val roomId = context.resources.getIdentifier("widget_elec_room", "id", packageName)
        val statusId = context.resources.getIdentifier("widget_elec_status", "id", packageName)

        if (titleId != 0) views.setTextViewText(titleId, "⚡ 电费余量")

        if (data != null) {
            val quantity = data.optDouble("quantity", -1.0)
            val room = data.optString("room", "")
            val isLow = quantity in 0.0..10.0

            if (quantityId != 0) {
                val text = if (quantity >= 0) String.format("%.1f 度", quantity) else "--"
                views.setTextViewText(quantityId, text)
            }
            if (roomId != 0 && room.isNotEmpty()) {
                views.setTextViewText(roomId, room)
                views.setViewVisibility(roomId, View.VISIBLE)
            }
            if (statusId != 0) {
                views.setTextViewText(statusId, if (isLow) "⚠️ 电量不足" else "正常")
                views.setViewVisibility(statusId, View.VISIBLE)
            }
        } else {
            if (quantityId != 0) views.setTextViewText(quantityId, "请先查询电费")
            if (roomId != 0) views.setViewVisibility(roomId, View.GONE)
            if (statusId != 0) views.setViewVisibility(statusId, View.GONE)
        }

        // 点击启动 App
        val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent().apply {
                setClassName(packageName, "${packageName}.MainActivity")
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(context, appWidgetId + 1000, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val rootId = context.resources.getIdentifier("widget_elec_root", "id", packageName)
        if (rootId != 0) views.setOnClickPendingIntent(rootId, pi)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun parseJson(json: String?): JSONObject? {
        if (json.isNullOrBlank()) return null
        return try { JSONObject(json) } catch (_: Exception) { null }
    }
}
