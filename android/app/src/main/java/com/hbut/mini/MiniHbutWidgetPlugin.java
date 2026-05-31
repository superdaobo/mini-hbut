package com.hbut.mini;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hbut.mini.widget.WidgetDataStore;
import com.hbut.mini.widget.WidgetRefreshScheduler;

@CapacitorPlugin(name = "MiniHbutWidget")
public class MiniHbutWidgetPlugin extends Plugin {
    private static final int MAX_SNAPSHOT_BYTES = 32 * 1024;

    private WidgetDataStore dataStore;

    private WidgetDataStore store() {
        if (dataStore == null) {
            dataStore = new WidgetDataStore(getContext());
        }
        return dataStore;
    }

    @PluginMethod
    public void writeSnapshot(PluginCall call) {
        JSObject snapshot = call.getObject("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is null", "INVALID_SNAPSHOT");
            return;
        }
        String json = snapshot.toString();
        if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_SNAPSHOT_BYTES) {
            call.reject("snapshot > 32KB", "SNAPSHOT_TOO_LARGE");
            return;
        }
        if (!store().writeSnapshot(json)) {
            call.reject("SharedPreferences commit failed", "WRITE_FAILED");
            return;
        }
        WidgetRefreshScheduler.INSTANCE.ensurePeriodic(getContext());
        WidgetRefreshScheduler.INSTANCE.triggerImmediate(getContext());
        WidgetRefreshScheduler.INSTANCE.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void writeElectricity(PluginCall call) {
        if (!writeJsonPayload(call, "data", "electricity")) return;
        WidgetRefreshScheduler.INSTANCE.ensurePeriodic(getContext());
        WidgetRefreshScheduler.INSTANCE.triggerElectricityImmediate(getContext());
        WidgetRefreshScheduler.INSTANCE.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void writeExam(PluginCall call) {
        if (!writeJsonPayload(call, "data", "exam")) return;
        WidgetRefreshScheduler.INSTANCE.ensurePeriodic(getContext());
        WidgetRefreshScheduler.INSTANCE.triggerExamImmediate(getContext());
        WidgetRefreshScheduler.INSTANCE.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void writeThemeColor(PluginCall call) {
        String color = call.getString("color", "");
        if (color == null || !color.matches("^#[0-9a-fA-F]{6}$")) {
            call.reject("invalid theme color", "INVALID_THEME_COLOR");
            return;
        }
        if (!store().writeThemeColor(color)) {
            call.reject("SharedPreferences commit failed", "WRITE_FAILED");
            return;
        }
        WidgetRefreshScheduler.INSTANCE.ensurePeriodic(getContext());
        WidgetRefreshScheduler.INSTANCE.triggerAllImmediate(getContext());
        WidgetRefreshScheduler.INSTANCE.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearSnapshot(PluginCall call) {
        store().clear();
        WidgetRefreshScheduler.INSTANCE.triggerAllImmediate(getContext());
        WidgetRefreshScheduler.INSTANCE.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void requestRefresh(PluginCall call) {
        WidgetRefreshScheduler.INSTANCE.ensurePeriodic(getContext());
        WidgetRefreshScheduler.INSTANCE.triggerAllImmediate(getContext());
        WidgetRefreshScheduler.INSTANCE.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("platform", "android-appwidget");
        result.put("pinned", WidgetRefreshScheduler.INSTANCE.hasPinnedInstance(context));
        result.put("hasPinnedInstance", WidgetRefreshScheduler.INSTANCE.hasPinnedInstance(context));
        result.put("periodicEnabled", WidgetRefreshScheduler.INSTANCE.hasPinnedInstance(context));
        result.put("refreshMode", "workmanager+immediate");
        call.resolve(result);
    }

    private boolean writeJsonPayload(PluginCall call, String key, String target) {
        JSObject data = call.getObject(key);
        if (data == null) {
            call.reject(key + " is null", "INVALID_WIDGET_DATA");
            return false;
        }
        boolean ok = "electricity".equals(target)
            ? store().writeElectricity(data.toString())
            : store().writeExam(data.toString());
        if (!ok) {
            call.reject("SharedPreferences commit failed", "WRITE_FAILED");
            return false;
        }
        return true;
    }
}
