package com.hbut.mini;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

import java.lang.reflect.Method;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HBUTNativePlugin.class);
        super.onCreate(savedInstanceState);
        registerBackgroundFetchHeadless();
    }

    private void registerBackgroundFetchHeadless() {
        try {
            Class<?> bgClass = Class.forName("com.transistorsoft.tsbackgroundfetch.BackgroundFetch");
            Method method = bgClass.getMethod("registerHeadlessTask", Class.class);
            method.invoke(null, BackgroundFetchHeadlessTask.class);
            Log.i(TAG, "BackgroundFetch headless task registered");
        } catch (Throwable e) {
            Log.w(TAG, "BackgroundFetch headless register skipped: " + e.getMessage());
        }
    }
}
