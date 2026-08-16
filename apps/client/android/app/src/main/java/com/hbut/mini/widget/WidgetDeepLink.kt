package com.hbut.mini.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * 小组件点击深链构造与 PendingIntent 封装。
 */
object WidgetDeepLink {
    private const val SCHEME = "minihbut"

    fun scheduleUri(date: String, period: Int? = null): Uri {
        val builder = Uri.Builder()
            .scheme(SCHEME)
            .authority("schedule")
            .appendQueryParameter("date", date)
            .appendQueryParameter("source", "widget")
        if (period != null && period >= 1) {
            builder.appendQueryParameter("period", period.toString())
        }
        return builder.build()
    }

    fun electricityUri(): Uri = Uri.Builder()
        .scheme(SCHEME)
        .authority("electricity")
        .appendQueryParameter("source", "widget")
        .build()

    fun examUri(): Uri = Uri.Builder()
        .scheme(SCHEME)
        .authority("exam")
        .appendQueryParameter("source", "widget")
        .build()

    fun pendingIntent(context: Context, requestCode: Int, uri: Uri): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setClassName(context.packageName, "${context.packageName}.MainActivity")
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    or Intent.FLAG_ACTIVITY_SINGLE_TOP
                    or Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
