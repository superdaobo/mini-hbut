package com.hbut.mini

import android.os.Bundle
import android.content.Intent
import app.tauri.android.TauriActivity

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Start the background service to keep the app alive
        val intent = Intent(this, NotificationService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }
}
