package com.hbut.mini;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor 原生能力插件（#616 收口后仅保留系统设置跳转能力）。
 *
 * #616：旧前台保活服务已退役（#608 红线 5：不作为默认后台通知基础设施），
 * 前台服务启停入口已删除；移动后台由 Tauri 插件（WorkManager / BGAppRefresh）承担。
 * 此处保留 openBatteryOptimizationSettings / openNotificationSettings，
 * 供通知设置页引导用户完成系统侧授权。
 */
@CapacitorPlugin(name = "HBUTNative")
public class HBUTNativePlugin extends Plugin {

    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        Context context = getContext();
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                boolean ignored = powerManager != null && powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
                if (!ignored) {
                    intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + context.getPackageName()));
                } else {
                    intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                }
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("openBatteryOptimizationSettings failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context context = getContext();
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("source", "android-notification-settings");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("openNotificationSettings failed: " + e.getMessage());
        }
    }
}
