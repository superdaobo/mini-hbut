package com.hbut.mini

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class NotificationService : Service() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()
        startForeground(1, notification)
        
        // This service runs to keep the app process alive.
        // The Rust backend loop in the main Tauri process continues to run.
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "BackgroundService",
                "Background Monitor",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, "BackgroundService")
            .setContentTitle("Mini-HBUT 正在后台运行")
            .setContentText("保持后台连接以接收成绩更新...")
            .setSmallIcon(android.R.drawable.ic_dialog_info) // Replace with your app icon
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
