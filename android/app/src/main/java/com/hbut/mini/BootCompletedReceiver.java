package com.hbut.mini;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootCompletedReceiver extends BroadcastReceiver {
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String KEY_ENABLE_BACKGROUND = "hbu_bg_enabled";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String enabled = prefs.getString(KEY_ENABLE_BACKGROUND, "0");
        if (!"1".equals(String.valueOf(enabled).trim())) return;
        KeepAliveForegroundService.start(context);
    }
}
