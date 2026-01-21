package com.hbut.mini

import android.content.Intent
import android.os.Bundle
import android.os.Build
import app.tauri.android.TauriActivity

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        try {
            // Start the background service to keep the app alive
            val intent = Intent(this, com.hbut.mini.NotificationService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
