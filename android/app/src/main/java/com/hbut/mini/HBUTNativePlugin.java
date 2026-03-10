package com.hbut.mini;

import android.app.ActivityManager;
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

@CapacitorPlugin(name = "HBUTNative")
public class HBUTNativePlugin extends Plugin {
    private static final String SOURCE = "android-foreground-service";

    @PluginMethod
    public void setForegroundService(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        Context context = getContext();
        try {
            if (enabled) {
                KeepAliveForegroundService.start(context);
            } else {
                KeepAliveForegroundService.stop(context);
            }
            JSObject result = new JSObject();
            result.put("supported", true);
            result.put("active", isForegroundServiceActive(context));
            result.put("source", SOURCE);
            result.put("reason", enabled ? "前台服务已启动" : "前台服务已停止");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("setForegroundService failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getForegroundServiceState(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("active", isForegroundServiceActive(context));
        result.put("source", SOURCE);
        call.resolve(result);
    }

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

    private boolean isForegroundServiceActive(Context context) {
        if (KeepAliveForegroundService.isRunning()) return true;
        try {
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) return false;
            for (ActivityManager.RunningServiceInfo info : manager.getRunningServices(Integer.MAX_VALUE)) {
                if (KeepAliveForegroundService.class.getName().equals(info.service.getClassName())) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            // ignore
        }
        return false;
    }
}
